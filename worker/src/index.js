const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
class ValidationError extends Error {}

const json = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...JSON_HEADERS,
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  }
});

const clean = (value, maxLength) => String(value || "")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maxLength);

const isAllowedOrigin = (requestOrigin, allowedOrigin) =>
  Boolean(requestOrigin && allowedOrigin && requestOrigin === allowedOrigin);

const verifyTurnstile = async (token, secret, remoteIp) => {
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp) body.append("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body
  });
  const result = await response.json();
  return result.success === true;
};

const readAndValidate = (raw) => {
  const data = {
    name: clean(raw.name, 80),
    phone: clean(raw.phone, 30),
    email: clean(raw.email, 120),
    date: clean(raw.date, 10),
    location: clean(raw.location, 140),
    startTime: clean(raw.startTime, 5),
    endTime: clean(raw.endTime, 5),
    notes: clean(raw.notes, 600),
    website: clean(raw.website, 120),
    turnstileToken: clean(raw.turnstileToken, 2048),
    privateSite: raw.privateSite === true,
    powerAvailable: raw.powerAvailable === true,
    adultHelper: raw.adultHelper === true,
    privacyConsent: raw.privacyConsent === true
  };

  if (data.website) return { data, spam: true };
  if (!data.name || !data.phone || !data.location || !data.date || !data.startTime || !data.endTime) {
    throw new ValidationError("Vul alle verplichte velden in.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !/^\d{2}:\d{2}$/.test(data.startTime) || !/^\d{2}:\d{2}$/.test(data.endTime)) {
    throw new ValidationError("Controleer de datum en tijden.");
  }
  const requestedDate = new Date(data.date + "T23:59:59Z");
  if (Number.isNaN(requestedDate.getTime()) || requestedDate < new Date()) {
    throw new ValidationError("Kies een datum vanaf vandaag.");
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    throw new ValidationError("Controleer het e-mailadres.");
  }
  if (!data.privateSite || !data.powerAvailable || !data.adultHelper || !data.privacyConsent) {
    throw new ValidationError("Bevestig alle voorwaarden voor de aanvraag.");
  }
  if (!data.turnstileToken) {
    throw new ValidationError("Voltooi de beveiligingscontrole.");
  }
  return { data, spam: false };
};

const sendWhatsappNotification = async (data, env) => {
  const required = [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "OWNER_WHATSAPP",
    "WHATSAPP_API_VERSION",
    "WHATSAPP_TEMPLATE_NAME",
    "WHATSAPP_TEMPLATE_LANGUAGE"
  ];
  if (required.some((key) => !env[key])) {
    throw new Error("WhatsApp configuration is incomplete.");
  }

  const message = {
    messaging_product: "whatsapp",
    to: env.OWNER_WHATSAPP,
    type: "template",
    template: {
      name: env.WHATSAPP_TEMPLATE_NAME,
      language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE },
      components: [{
        type: "body",
        parameters: [
          { type: "text", text: data.name },
          { type: "text", text: data.phone },
          { type: "text", text: data.date },
          { type: "text", text: data.startTime + " – " + data.endTime },
          { type: "text", text: data.location },
          { type: "text", text: data.email || "Niet ingevuld" },
          { type: "text", text: data.notes || "Geen opmerkingen" }
        ]
      }]
    }
  };

  const url = "https://graph.facebook.com/" + env.WHATSAPP_API_VERSION + "/" + env.WHATSAPP_PHONE_NUMBER_ID + "/messages";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.WHATSAPP_ACCESS_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(message)
  });

  if (!response.ok) {
    console.error("WhatsApp API rejected the booking notification.", response.status);
    throw new Error("WhatsApp notification failed.");
  }
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (!isAllowedOrigin(origin, env.ALLOWED_ORIGIN)) {
      return json({ message: "Niet toegestaan." }, 403, env.ALLOWED_ORIGIN);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Vary": "Origin",
          "Cache-Control": "no-store"
        }
      });
    }
    if (request.method !== "POST") {
      return json({ message: "Alleen POST is toegestaan." }, 405, origin);
    }
    if (!env.TURNSTILE_SECRET_KEY) {
      return json({ message: "De reserveringsservice is nog niet geconfigureerd." }, 503, origin);
    }

    try {
      const contentLength = Number(request.headers.get("Content-Length") || 0);
      if (contentLength > 12000) {
        return json({ message: "De aanvraag is te groot." }, 413, origin);
      }

      const raw = await request.json();
      const result = readAndValidate(raw);
      const data = result.data;
      if (result.spam) return json({ ok: true }, 202, origin);

      const turnstileOk = await verifyTurnstile(
        data.turnstileToken,
        env.TURNSTILE_SECRET_KEY,
        request.headers.get("CF-Connecting-IP")
      );
      if (!turnstileOk) {
        return json({ message: "De beveiligingscontrole is verlopen. Probeer het opnieuw." }, 400, origin);
      }

      await sendWhatsappNotification(data, env);
      return json({ ok: true }, 202, origin);
    } catch (error) {
      const isValidationError = error instanceof ValidationError;
      const userError = isValidationError ? error.message : "De aanvraag kon niet worden verstuurd.";
      const status = isValidationError ? 400 : 502;
      return json({ message: userError }, status, origin);
    }
  }
};

export { clean, isAllowedOrigin, readAndValidate };

