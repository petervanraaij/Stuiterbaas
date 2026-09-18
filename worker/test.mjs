import assert from "node:assert/strict";
import worker, { readAndValidate } from "./src/index.js";

const origin = "https://stuiterbaas.nl";
const baseEnv = {
  ALLOWED_ORIGIN: origin,
  TURNSTILE_SECRET_KEY: "turnstile-secret",
  WHATSAPP_ACCESS_TOKEN: "whatsapp-secret",
  WHATSAPP_PHONE_NUMBER_ID: "123456789",
  OWNER_WHATSAPP: "31600000000",
  WHATSAPP_API_VERSION: "vXX.X",
  WHATSAPP_TEMPLATE_NAME: "stuiterbaas_nieuwe_reservering",
  WHATSAPP_TEMPLATE_LANGUAGE: "nl"
};

const validPayload = {
  name: "Peter",
  phone: "06 12 34 56 78",
  email: "peter@example.nl",
  date: "2099-06-12",
  location: "Wamel",
  startTime: "10:00",
  endTime: "18:00",
  notes: "Graag bellen.",
  privateSite: true,
  powerAvailable: true,
  adultHelper: true,
  privacyConsent: true,
  website: "",
  turnstileToken: "verified-token"
};

assert.equal(readAndValidate(validPayload).data.name, "Peter");
assert.throws(
  () => readAndValidate({ ...validPayload, privateSite: false }),
  /Bevestig alle voorwaarden/
);

const blocked = await worker.fetch(new Request("https://worker.example", {
  method: "POST",
  headers: { Origin: "https://example.com", "Content-Type": "application/json" },
  body: JSON.stringify(validPayload)
}), baseEnv);
assert.equal(blocked.status, 403);

const preflight = await worker.fetch(new Request("https://worker.example", {
  method: "OPTIONS",
  headers: { Origin: origin }
}), baseEnv);
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), origin);

const requests = [];
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  requests.push({ url: String(url), options });
  if (String(url).includes("siteverify")) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  return new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

try {
  const response = await worker.fetch(new Request("https://worker.example", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(validPayload)
  }), baseEnv);

  assert.equal(response.status, 202);
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /123456789\/messages$/);
  const message = JSON.parse(requests[1].options.body);
  assert.equal(message.to, "31600000000");
  assert.equal(message.type, "template");
  assert.equal(message.template.components[0].parameters[0].text, "Peter");
} finally {
  globalThis.fetch = nativeFetch;
}

console.log("Worker tests passed.");

