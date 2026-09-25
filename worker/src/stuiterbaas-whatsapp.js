// Mirrored in Stuiterbaas/worker/src. Only the combined Worker is deployed.
export const STUITERBAAS_CONSENT_TEXT = 'Stuiterbaas mag mij via WhatsApp berichten over deze aanvraag.';

export const stuiterbaasPhone = value => {
  const phone = String(value || '').trim();
  if (!/^\+?[\d\s().-]+$/.test(phone)) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('310')) digits = '31' + digits.slice(3);
  if (digits.startsWith('0')) digits = '31' + digits.slice(1);
  if (!/^[1-9]\d{7,14}$/.test(digits)) return '';
  if (digits.startsWith('31') && digits.length !== 11) return '';
  return digits;
};

const formatDate = value => value.split('-').reverse().join('-');
const money = value => '€' + Number(value).toLocaleString('nl-NL', {maximumFractionDigits: 2});

export const createStuiterbaasReceipt = data => {
  const reference = 'SB-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  const receivedAt = new Date().toISOString();
  const period = formatDate(data.date) + ' om ' + data.startTime + ' tot ' + formatDate(data.endDate) + ' om ' + data.endTime;
  const price = data.rentalPrice === null
    ? 'huurprijs in overleg, plus ' + money(data.deposit) + ' borg'
    : money(data.rentalPrice) + ' huur + ' + money(data.deposit) + ' borg = ' + money(data.total) + ' totaal';
  // Positional parameters match the Dutch utility template documented in WHATSAPP-STUITERBAAS.md.
  const parameters = [data.name.split(/\s+/)[0], reference, period, price];
  const text = [
    'Hoi ' + parameters[0] + ',', '',
    'Stuiterbaas heeft je aanvraag ' + reference + ' ontvangen.',
    'Gewenste huurperiode: ' + period + '.',
    'Kosten: ' + price + '.', '',
    'Dit is nog geen definitieve reservering. We bevestigen de beschikbaarheid en de afspraken persoonlijk.',
    'Vragen of iets wijzigen? Antwoord gerust op dit bericht.', '',
    'Groet, Stuiterbaas'
  ].join('\n');
  const phone = stuiterbaasPhone(data.phone);
  return {
    reference, receivedAt, parameters, text,
    replyUrl: data.whatsappConsent && phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text) : ''
  };
};

export const stuiterbaasWhatsAppConfigured = env =>
  env.STUITERBAAS_WHATSAPP_ENABLED === 'true' &&
  Boolean(env.STUITERBAAS_WHATSAPP_ACCESS_TOKEN) &&
  /^\d+$/.test(env.STUITERBAAS_WHATSAPP_PHONE_NUMBER_ID || '') &&
  /^[a-z0-9_]+$/.test(env.STUITERBAAS_WHATSAPP_RECEIPT_TEMPLATE || '') &&
  /^v\d+\.\d+$/.test(env.STUITERBAAS_WHATSAPP_GRAPH_VERSION || '');

export const stuiterbaasWhatsAppInstructions = (data, env) => {
  if (!data.whatsappConsent) return 'Geen toestemming voor WhatsApp; neem telefonisch of per e-mail contact op.';
  return stuiterbaasWhatsAppConfigured(env)
    ? 'Na deze aanvraag proberen we de automatische ontvangstbevestiging te versturen. Controleer de zakelijke WhatsApp-chat voordat je het bericht handmatig verstuurt.'
    : 'Handmatig appje nodig: de automatische WhatsApp-koppeling is nog niet actief. Open de onderstaande link in WhatsApp Business van Stuiterbaas (06 83542218) en verstuur het bericht.';
};

const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

export const createStuiterbaasOwnerEmail = (data, receipt, env, deliveryUncertain = false) => {
  const fields = [
    ['Aanvraagnummer', receipt.reference], ['Ontvangen (UTC)', receipt.receivedAt],
    ['Naam', data.name], ['Telefoon', data.phone], ['E-mail', data.email || 'Niet ingevuld'],
    ['Huurperiode', data.rentalDays + (data.rentalDays === 1 ? ' dag' : ' dagen')],
    ['Van', data.date + ' om ' + data.startTime], ['Tot', data.endDate + ' om ' + data.endTime],
    ['Huur', data.rentalPrice === null ? 'In overleg' : money(data.rentalPrice)],
    ['Borg bovenop de huur', money(data.deposit)],
    ['Totaal inclusief borg', data.total === null ? 'Nog af te spreken; €50 borg bovenop de huur' : money(data.total)],
    ['Locatie', data.location], ['Opmerking', data.notes || 'Geen opmerkingen'],
    ['WhatsApp-toestemming', data.whatsappConsent ? 'Ja, actief aangevinkt: ' + STUITERBAAS_CONSENT_TEXT : 'Nee']
  ];
  const instructions = deliveryUncertain
    ? 'De automatische WhatsApp-verzending is niet bevestigd. De aanvraag is wel ontvangen. Controleer eerst de zakelijke WhatsApp-chat en verstuur het onderstaande ontvangstbericht alleen als het ontbreekt.'
    : stuiterbaasWhatsAppInstructions(data, env);
  const rows = fields.map(([key, value]) => '<tr><th align="left" style="padding:6px 14px 6px 0;vertical-align:top">' + escapeHtml(key) + '</th><td style="padding:6px 0">' + escapeHtml(value) + '</td></tr>').join('');
  const heading = deliveryUncertain ? 'Controleer WhatsApp-bevestiging' : 'Nieuwe reserveringsaanvraag';
  const message = {
    from: env.STUITERBAAS_FROM_EMAIL || env.BOOKING_FROM_EMAIL || 'Stuiterbaas Reserveringen <reserveringen@stuiterbaas.nl>',
    to: [env.STUITERBAAS_TO_EMAIL || env.BOOKING_TO_EMAIL || 'verhuur@stuiterbaas.nl'],
    subject: deliveryUncertain ? 'WhatsApp controleren – ' + receipt.reference : 'Reserveringsaanvraag ' + data.date + ' – ' + data.name + ' – ' + receipt.reference,
    text: [heading, '', ...fields.map(([key, value]) => key + ': ' + value), '', 'Deze aanvraag is nog geen definitieve reservering.', '', instructions, ...(receipt.replyUrl ? ['', 'Open ontvangstbericht in WhatsApp Business:', receipt.replyUrl, '', receipt.text] : [])].join('\n'),
    html: '<h1 style="font-size:20px">' + heading + '</h1><table style="border-collapse:collapse">' + rows + '</table><p><strong>Deze aanvraag is nog geen definitieve reservering.</strong></p><p>' + escapeHtml(instructions) + '</p>' +
      (receipt.replyUrl ? '<p><a href="' + escapeHtml(receipt.replyUrl) + '" style="display:inline-block;padding:12px 20px;background:#16344b;color:#fff;border-radius:8px;text-decoration:none">Open appje voor de klant</a></p><p style="white-space:pre-line">' + escapeHtml(receipt.text) + '</p>' : '')
  };
  if (data.email) message.reply_to = data.email;
  return message;
};

export const completeStuiterbaasBooking = async (data, env, sendEmail) => {
  const receipt = createStuiterbaasReceipt(data);
  // Secure receipt by the business BEFORE sending any customer notification.
  await sendEmail(createStuiterbaasOwnerEmail(data, receipt, env), env);
  const whatsapp = await sendStuiterbaasWhatsAppReceipt(data, receipt, env);
  if (whatsapp.status === 'failed') {
    try { await sendEmail(createStuiterbaasOwnerEmail(data, receipt, env, true), env); }
    catch { console.error('Stuiterbaas WhatsApp follow-up required:', receipt.reference); }
  }
  return {ok: true, reference: receipt.reference, whatsapp: whatsapp.status};
};

export const sendStuiterbaasWhatsAppReceipt = async (data, receipt, env) => {
  if (!data.whatsappConsent) return {status: 'not_requested'};
  if (!stuiterbaasWhatsAppConfigured(env)) return {status: 'manual'};
  const destination = stuiterbaasPhone(data.phone);
  if (!destination) return {status: 'failed'};
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const endpoint = 'https://graph.facebook.com/' + env.STUITERBAAS_WHATSAPP_GRAPH_VERSION + '/' + env.STUITERBAAS_WHATSAPP_PHONE_NUMBER_ID + '/messages';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + env.STUITERBAAS_WHATSAPP_ACCESS_TOKEN, 'Content-Type': 'application/json'},
      signal: controller.signal,
      body: JSON.stringify({
        messaging_product: 'whatsapp', recipient_type: 'individual', to: destination, type: 'template',
        template: {
          name: env.STUITERBAAS_WHATSAPP_RECEIPT_TEMPLATE, language: {code: 'nl'},
          components: [{type: 'body', parameters: receipt.parameters.map(text => ({type: 'text', text}))}]
        }
      })
    });
    const result = await response.json().catch(() => ({}));
    // API acceptance is not delivery. Do not expose raw provider responses or secrets.
    return response.ok && result.messages?.[0]?.id ? {status: 'accepted'} : {status: 'failed'};
  } catch {
    // The reservation is already in the inbox; messaging failures must not reject it.
    return {status: 'failed'};
  } finally {
    clearTimeout(timeout);
  }
};
