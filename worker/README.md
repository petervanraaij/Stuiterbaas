# Stuiterbaas reserveringsservice

**Productie gebruikt de gecombineerde Worker in de Lattenspecialist-repository. Deploy deze losse kopie niet naar de bestaande productie-Worker.**

Zie [WhatsApp-bevestiging](WHATSAPP-STUITERBAAS.md) voor de huidige handmatige werkwijze en de voorbereide, nog uitgeschakelde automatische koppeling.

Deze Cloudflare Worker ontvangt het formulier van stuiterbaas.nl, controleert de aanvraag met Cloudflare Turnstile en stuurt daarna via Resend een e-mail naar `verhuur@stuiterbaas.nl`.

De WhatsApp Business-accounts en hun chatgeschiedenis worden door deze oplossing niet gekoppeld, omgezet of opgeheven. De bestaande knoppen `Reserveer via WhatsApp` blijven rechtstreeks naar WhatsApp verwijzen.

## E-mail instellen

1. Maak een Resend-account aan.
2. Voeg `stuiterbaas.nl` als verzenddomein toe en plaats de DNS-records die Resend opgeeft.
3. Wacht totdat Resend het domein als geverifieerd toont.
4. Maak een API-key aan die alleen e-mail mag verzenden.

## Benodigde configuratie

- `ALLOWED_ORIGIN`: `https://stuiterbaas.nl`
- `BOOKING_TO_EMAIL`: `verhuur@stuiterbaas.nl`
- `BOOKING_FROM_EMAIL`: `Stuiterbaas Reserveringen <reserveringen@stuiterbaas.nl>`

Bewaar de geheime waarden via Wrangler en nooit in Git:

    npx wrangler secret put RESEND_API_KEY
    npx wrangler secret put TURNSTILE_SECRET_KEY

Maak daarnaast in Cloudflare Turnstile een widget voor `stuiterbaas.nl`. Na `npx wrangler deploy` vul je de Worker-URL en de publieke Turnstile-sitekey in `booking-config.js` in.

## Werking

- De bezoeker blijft tijdens het versturen op de website.
- De Worker controleert de aanvraag en de Turnstile-token.
- De aanvraag wordt als tekst en veilige HTML naar `verhuur@stuiterbaas.nl` gestuurd.
- Als de klant een e-mailadres invult, gebruikt de e-mail dat adres als antwoordadres.
- De aanvraag is pas definitief nadat Stuiterbaas de beschikbaarheid persoonlijk heeft bevestigd.
