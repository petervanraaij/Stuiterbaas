# Stuiterbaas reserveringsservice

Deze Cloudflare Worker ontvangt het formulier van stuiterbaas.nl, controleert de aanvraag met Cloudflare Turnstile en stuurt daarna via de officiële WhatsApp Cloud API een templatemelding naar de eigenaar.

## Benodigde configuratie

Maak in Meta een goedgekeurd WhatsApp-template met de naam stuiterbaas_nieuwe_reservering en de volgende zeven tekstvariabelen:

1. naam
2. mobiel nummer
3. datum
4. gewenste tijden
5. adres of plaats
6. e-mailadres
7. opmerking

De voorgestelde template-inhoud is:

> Nieuwe reserveringsaanvraag via stuiterbaas.nl
>
> Naam: {{1}}
> Telefoon: {{2}}
> Datum: {{3}}
> Tijd: {{4}}
> Locatie: {{5}}
> E-mail: {{6}}
> Opmerking: {{7}}

Stel daarna deze waarden in:

- WHATSAPP_API_VERSION: de actuele ondersteunde Graph API-versie, bijvoorbeeld vXX.X
- WHATSAPP_PHONE_NUMBER_ID: het afzendernummer uit Meta
- OWNER_WHATSAPP: het WhatsApp-nummer waarop de melding binnenkomt, alleen cijfers met landcode
- WHATSAPP_TEMPLATE_NAME: standaard stuiterbaas_nieuwe_reservering
- WHATSAPP_TEMPLATE_LANGUAGE: standaard nl

Bewaar de geheime waarden via Wrangler en nooit in Git:

    npx wrangler secret put WHATSAPP_ACCESS_TOKEN
    npx wrangler secret put TURNSTILE_SECRET_KEY

Na npx wrangler deploy vul je de Worker-URL en de publieke Turnstile-sitekey in booking-config.js in. Het WhatsApp-afzendernummer moet verschillen van OWNER_WHATSAPP; een WhatsApp-nummer kan niet aan zichzelf melden.

