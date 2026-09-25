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

// Longer rentals are requests for a quote, never a fixed or client-supplied price.
const longerPayload = {...validPayload, date:'2099-12-31', rentalDays:'longer', endDate:'2100-01-03', rentalPrice:1, total:1};
const longerData = readAndValidate(longerPayload).data;
assert.equal(longerData.rentalDays,4);
assert.equal(longerData.endDate,'2100-01-03');
assert.equal(longerData.rentalPrice,null);
assert.equal(longerData.total,null);
assert.equal(longerData.deposit,50);
for(const endDate of ['', '2100-02-30', '<invalid>']) assert.throws(()=>readAndValidate({...longerPayload,endDate}),/einddatum/);
for(const endDate of ['2099-12-30','2099-12-31','2100-01-01']) assert.throws(()=>readAndValidate({...longerPayload,endDate}),/minimaal drie dagen/);
assert.equal(readAndValidate({...longerPayload,endDate:'2100-01-02'}).data.rentalDays,3);
assert.equal(readAndValidate({...validPayload,endDate:'2100-01-03'}).data.endDate,validPayload.date);

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

  requests.length = 0;
  const longerResponse = await worker.fetch(new Request('https://worker.example', {method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(longerPayload)}),baseEnv);
  assert.equal(longerResponse.status,202);
  const longerMessage = JSON.parse(requests[1].options.body);
  for(const text of ['Huurperiode: 4 dagen','Huur: In overleg','Borg bovenop de huur: €50','Totaal inclusief borg: Nog af te spreken','Tot: 2100-01-03']) assert.ok(longerMessage.text.includes(text),text);
  assert.match(longerMessage.html,/In overleg/);
  assert.doesNotMatch(longerMessage.text + longerMessage.html,/€null|€undefined|€150|€95|€200|€145/);
} finally {
  globalThis.fetch = nativeFetch;
}

console.log("Worker tests passed.");
