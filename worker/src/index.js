import {completeStuiterbaasBooking, stuiterbaasPhone} from './stuiterbaas-whatsapp.js';
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

const stuiterbaasRentalDetails = (raw) => {
  const rentalDays = String(raw.rentalDays ?? '1');
  if (!['1', '2', 'longer'].includes(rentalDays)) throw new ValidationError('Kies één of twee huurdagen, of langer huren in overleg.');
  const date = clean(raw.date, 10);
  const start = new Date(date + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date) throw new ValidationError('Controleer de datum.');
  if (rentalDays === 'longer') {
    const endDate = clean(raw.endDate, 10);
    const end = new Date(endDate + 'T12:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== endDate) throw new ValidationError('Kies een geldige einddatum voor de langere huurperiode.');
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (days < 3) throw new ValidationError('Kies bij langer huren een periode van minimaal drie dagen.');
    return {rentalDays: days, endDate, rentalPrice: null, deposit: 50, total: null};
  }
  start.setUTCDate(start.getUTCDate() + Number(rentalDays) - 1);
  const rentalPrice = rentalDays === '2' ? 150 : 95;
  return {rentalDays: Number(rentalDays), endDate: start.toISOString().slice(0, 10), rentalPrice, deposit: 50, total: rentalPrice + 50};
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
    whatsappConsent: raw.whatsappConsent === true,
    turnstileToken: clean(raw.turnstileToken, 2048)
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
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.endTime)) throw new ValidationError('Controleer de tijden.');
  if (data.whatsappConsent && !stuiterbaasPhone(data.phone)) throw new ValidationError('Controleer je WhatsApp-nummer. Gebruik voor een buitenlands nummer ook de landcode.');
  Object.assign(data, stuiterbaasRentalDetails(raw));
  if (data.rentalDays === 1 && data.endTime <= data.startTime) throw new ValidationError('De eindtijd moet na de starttijd liggen.');
  if (!data.turnstileToken) {
    throw new ValidationError("Voltooi de beveiligingscontrole.");
  }
  return { data, spam: false };
};

const escapeHtml = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const sendEmailNotification = async (message, env) => {
  if (!env.RESEND_API_KEY) throw new Error("Email configuration is incomplete.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(message)
  });

  if (!response.ok) {
    console.error("Email provider rejected the booking notification.", response.status);
    throw new Error("Email notification failed.");
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

      const confirmation = await completeStuiterbaasBooking(data, env, sendEmailNotification);
      return json(confirmation, 202, origin);
    } catch (error) {
      const isValidationError = error instanceof ValidationError;
      const userError = isValidationError ? error.message : "De aanvraag kon niet worden verstuurd.";
      const status = isValidationError ? 400 : 502;
      return json({ message: userError }, status, origin);
    }
  }
};

export { clean, escapeHtml, isAllowedOrigin, readAndValidate };
