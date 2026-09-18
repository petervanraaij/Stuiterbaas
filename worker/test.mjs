import assert from "node:assert/strict";
import worker, { escapeHtml, readAndValidate } from "./src/index.js";

const origin = "https://stuiterbaas.nl";
const baseEnv = {
  ALLOWED_ORIGIN: origin,
  TURNSTILE_SECRET_KEY: "turnstile-secret",
  RESEND_API_KEY: "resend-secret",
  BOOKING_TO_EMAIL: "verhuur@stuiterbaas.nl",
  BOOKING_FROM_EMAIL: "Stuiterbaas Reserveringen <reserveringen@stuiterbaas.nl>"
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
assert.equal(escapeHtml("<script>&\"'"), "&lt;script&gt;&amp;&quot;&#039;");
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
  return new Response(JSON.stringify({ id: "email-test" }), {
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
  assert.equal(requests[1].url, "https://api.resend.com/emails");
  assert.equal(requests[1].options.headers.Authorization, "Bearer resend-secret");
  const message = JSON.parse(requests[1].options.body);
  assert.deepEqual(message.to, ["verhuur@stuiterbaas.nl"]);
  assert.equal(message.reply_to, "peter@example.nl");
  assert.match(message.subject, /Peter/);
  assert.match(message.text, /Telefoon: 06 12 34 56 78/);
  assert.match(message.html, /Nieuwe reserveringsaanvraag/);
} finally {
  globalThis.fetch = nativeFetch;
}

console.log("Worker tests passed.");
