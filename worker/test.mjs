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
  website: "",
  turnstileToken: "verified-token"
};

assert.equal(readAndValidate(validPayload).data.name, "Peter");
assert.equal(escapeHtml("<script>&\"'"), "&lt;script&gt;&amp;&quot;&#039;");



// Requests no longer need checkbox confirmations. Legacy clients still default to one day.
const rentalData = readAndValidate(validPayload).data;
assert.equal(rentalData.rentalDays,1);
assert.equal(rentalData.rentalPrice,95);
assert.equal(rentalData.total,145);
assert.equal(rentalData.endDate,validPayload.date);
for (const key of ['privateSite','powerAvailable','adultHelper','privacyConsent']) assert.equal(readAndValidate({...validPayload,[key]:false}).data[key],undefined);
assert.throws(()=>readAndValidate({...validPayload,turnstileToken:''}),/beveiligingscontrole/);
assert.throws(()=>readAndValidate({...validPayload,name:''}),/verplichte/);
for (const rentalDays of ['0','3','2abc',-1]) assert.throws(()=>readAndValidate({...validPayload,rentalDays}),/huurdagen/);
assert.throws(()=>readAndValidate({...validPayload,date:'2099-02-30'}),/datum/);
assert.throws(()=>readAndValidate({...validPayload,endTime:'09:00'}),/eindtijd/);
assert.throws(()=>readAndValidate({...validPayload,endTime:'25:00'}),/tijden/);
assert.equal(readAndValidate({...validPayload,date:'2100-02-28',rentalDays:2}).data.endDate,'2100-03-01');
assert.equal(readAndValidate({...validPayload,date:'2104-02-28',rentalDays:2}).data.endDate,'2104-02-29');
assert.equal(readAndValidate({...validPayload,date:'2099-03-29',rentalDays:2}).data.endDate,'2099-03-30');

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
  assert.doesNotMatch(message.text + message.html, /aanvrager bevestigde/);
  assert.match(message.text, /Totaal inclusief borg: €145/);
  requests.length = 0;
  const twoDays = await worker.fetch(new Request('https://worker.example', {method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({...validPayload,date:'2099-12-31',rentalDays:'2',startTime:'18:00',endTime:'10:00',rentalPrice:1,deposit:0,total:1})}),baseEnv);
  assert.equal(twoDays.status,202);
  const twoDayMessage = JSON.parse(requests[1].options.body);
  for (const value of ['Huurperiode: 2 dagen','Van: 2099-12-31 om 18:00','Tot: 2100-01-01 om 10:00','Huur: €150','Borg bovenop de huur: €50','Totaal inclusief borg: €200']) assert.ok(twoDayMessage.text.includes(value),value);
  assert.doesNotMatch(twoDayMessage.text + twoDayMessage.html, /aanvrager bevestigde/);
} finally {
  globalThis.fetch = nativeFetch;
}

console.log("Worker tests passed.");
