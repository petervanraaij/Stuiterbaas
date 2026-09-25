import assert from 'node:assert/strict';
import worker from './src/index.js';
import {stuiterbaasPhone, createStuiterbaasReceipt, STUITERBAAS_CONSENT_TEXT} from './src/stuiterbaas-whatsapp.js';

const payload = {name:'Peter <test>', phone:'06 12 34 56 78', email:'customer@example.nl', date:'2099-06-12', rentalDays:'2', location:'Testlocatie', startTime:'10:00', endTime:'09:00', notes:'', website:'', whatsappConsent:true, turnstileToken:'test-only'};
const baseEnv = {
  STUITERBAAS_ORIGIN:'https://stuiterbaas.nl', ALLOWED_ORIGIN:'https://stuiterbaas.nl',
  STUITERBAAS_TO_EMAIL:'verhuur@stuiterbaas.nl', BOOKING_TO_EMAIL:'verhuur@stuiterbaas.nl',
  STUITERBAAS_FROM_EMAIL:'Stuiterbaas <reserveringen@stuiterbaas.nl>', BOOKING_FROM_EMAIL:'Stuiterbaas <reserveringen@stuiterbaas.nl>',
  TURNSTILE_SECRET_KEY:'test-captcha', RESEND_API_KEY:'test-email'
};
const configured = {...baseEnv, STUITERBAAS_WHATSAPP_ENABLED:'true', STUITERBAAS_WHATSAPP_ACCESS_TOKEN:'stuiterbaas-only-test',
  STUITERBAAS_WHATSAPP_PHONE_NUMBER_ID:'123456', STUITERBAAS_WHATSAPP_RECEIPT_TEMPLATE:'stuiterbaas_aanvraag_ontvangen', STUITERBAAS_WHATSAPP_GRAPH_VERSION:'v23.0',
  WHATSAPP_ACCESS_TOKEN:'latten-secret-must-not-be-used', WHATSAPP_PHONE_NUMBER_ID:'999999'};
const calls = [];
let mode = 'success';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  url = String(url);
  calls.push({url, options});
  if (url.includes('siteverify')) return Response.json({success:true});
  if (url === 'https://api.resend.com/emails') return Response.json({id:'mail-test'}, {status:mode === 'mail_failure' ? 503 : 200});
  assert.equal(url, 'https://graph.facebook.com/v23.0/123456/messages');
  if (mode === 'network_failure') throw new TypeError('PRIVATE PROVIDER ERROR');
  if (mode === 'timeout') throw new DOMException('timeout', 'AbortError');
  if (mode === 'rejected') return Response.json({error:{message:'PRIVATE PROVIDER ERROR'}}, {status:400});
  if (mode === 'empty_acceptance') return Response.json({});
  if (mode === 'invalid_json') return new Response('<html>invalid</html>');
  return Response.json({messages:[{id:'wamid.test-only'}]});
};
const send = async (data=payload, env=baseEnv) => {
  calls.length=0;
  const response = await worker.fetch(new Request('https://worker.example/', {
    method:'POST', headers:{Origin:'https://stuiterbaas.nl', 'Content-Type':'application/json'}, body:JSON.stringify(data)
  }), env);
  return {status:response.status, body:await response.json()};
};
const emails = () => calls.filter(call => call.url.includes('api.resend.com')).map(call => JSON.parse(call.options.body));
const messages = () => calls.filter(call => call.url.includes('graph.facebook.com'));

try {
  for (const phone of ['0612345678', '+31 6 12345678', '0031 6 12345678', '+31 (0)6 12345678']) assert.equal(stuiterbaasPhone(phone), '31612345678');
  assert.equal(stuiterbaasPhone('+32 470 123 456'), '32470123456');
  for (const phone of ['123', 'abc0612345678', '+31612345', '++31612345678', '1234567890123456']) assert.equal(stuiterbaasPhone(phone), '');
  let result = await send({...payload, whatsappConsent:false}, configured);
  assert.equal(result.status, 202);
  assert.equal(result.body.whatsapp, 'not_requested');
  assert.equal(messages().length, 0);
  assert.equal(emails().length, 1);
  assert(!emails()[0].text.includes('wa.me'));

  result = await send(payload);
  assert.equal(result.body.whatsapp, 'manual');
  assert.equal(messages().length, 0);
  assert.equal(emails().length, 1);
  const email = emails()[0];
  assert(email.text.includes(STUITERBAAS_CONSENT_TEXT));
  assert(email.text.includes('Handmatig appje nodig'));
  assert(email.html.includes('Peter &lt;test&gt;'));
  assert(!email.html.includes('Peter <test>'));
  const link = email.text.match(/https:\/\/wa.me\/[^\s]+/)[0];
  assert.equal(new URL(link).pathname, '/31612345678');
  const text = new URL(link).searchParams.get('text');
  assert(text.includes('€150 huur + €50 borg = €200 totaal'));
  assert(text.includes('nog geen definitieve reservering'));
  assert(text.includes(result.body.reference));
  assert(text.includes('12-06-2099 om 10:00 tot 13-06-2099 om 09:00'));

  for (const env of [
    {...configured,STUITERBAAS_WHATSAPP_ENABLED:'false'},
    {...configured,STUITERBAAS_WHATSAPP_ACCESS_TOKEN:''},
    {...configured,STUITERBAAS_WHATSAPP_GRAPH_VERSION:''},
    {...configured,STUITERBAAS_WHATSAPP_PHONE_NUMBER_ID:'../wrong'},
    {...baseEnv,WHATSAPP_ACCESS_TOKEN:'latten-token',WHATSAPP_PHONE_NUMBER_ID:'999999'}
  ]) {
    assert.equal((await send(payload, env)).body.whatsapp, 'manual');
    assert.equal(messages().length, 0);
  }
  assert.equal((await send({...payload, whatsappConsent:'true'}, configured)).body.whatsapp, 'not_requested');
  assert.equal(messages().length, 0);
  assert.equal((await send({...payload,phone:'fout'}, configured)).status, 400);
  assert.equal(calls.length, 0);

  result = await send(payload, configured);
  assert.equal(result.status, 202);
  assert.equal(result.body.whatsapp, 'accepted');
  assert.match(result.body.reference, /^SB-[0-9A-F]{12}$/);
  assert.equal(emails().length, 1);
  assert.deepEqual(emails()[0].to, ['verhuur@stuiterbaas.nl']);
  assert.equal(calls[1].url, 'https://api.resend.com/emails', 'customer must not be notified before the business gets the request');
  const sent = messages()[0];
  assert.equal(sent.options.headers.Authorization, 'Bearer stuiterbaas-only-test');
  const message = JSON.parse(sent.options.body);
  assert.equal(message.to, '31612345678');
  assert.equal(message.template.name, 'stuiterbaas_aanvraag_ontvangen');
  assert.equal(message.template.language.code, 'nl');
  assert.equal(message.template.components[0].parameters.length, 4);
  assert.equal(message.template.components[0].parameters[1].text, result.body.reference);
  assert.equal(message.template.components[0].parameters[3].text, '€150 huur + €50 borg = €200 totaal');
  assert(!JSON.stringify(result.body).includes('token'));
  assert(!JSON.stringify(result.body).includes('delivered'));

  result = await send({...payload, rentalDays:'longer', endDate:'2099-06-17', rentalPrice:1,total:1}, configured);
  assert.equal(result.body.whatsapp, 'accepted');
  const quote = JSON.parse(messages()[0].options.body).template.components[0].parameters[3].text;
  assert.equal(quote, 'huurprijs in overleg, plus €50 borg');
  for (mode of ['rejected','network_failure','timeout','empty_acceptance','invalid_json']) {
    result = await send(payload, configured);
    assert.equal(result.status, 202);
    assert.equal(result.body.whatsapp, 'failed');
    assert.equal(messages().length, 1, 'no automatic retry after uncertain delivery');
    assert.equal(emails().length, 2);
    assert(emails()[1].subject.includes(result.body.reference));
    assert(emails()[1].text.includes('Controleer eerst de zakelijke WhatsApp-chat'));
    assert(!emails()[1].text.includes('PRIVATE PROVIDER ERROR'));
    assert(!JSON.stringify(result.body).includes('PRIVATE PROVIDER ERROR'));
  }
  mode = 'mail_failure';
  result = await send(payload, configured);
  assert.equal(result.status, 502);
  assert.equal(messages().length, 0);
  mode = 'success';
  result = await send({...payload,website:'spam'}, configured);
  assert.equal(result.status, 202);
  assert.equal(calls.length, 0);
  const oneDay = createStuiterbaasReceipt({...payload,date:'2099-12-31',endDate:'2099-12-31',rentalDays:1,rentalPrice:95,deposit:50,total:145});
  assert(oneDay.text.includes('€95 huur + €50 borg = €145 totaal'));
  console.log('PASS: Stuiterbaas WhatsApp consent, separate sender, disabled configuration, owner receipt, manual reply, server pricing, approved-template payload, accepted vs delivered, failure recovery and no customer message after owner-mail failure. All providers mocked.');
} finally {
  globalThis.fetch = originalFetch;
}
