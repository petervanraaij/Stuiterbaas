# Stuiterbaas: ontvangstbevestiging via WhatsApp

Status op 25 september 2026: code voorbereid; automatische verzending UIT.
Peter heeft nog geen Facebook-account. Er zijn geen Meta-inloggegevens of
WhatsApp-verzendgegevens geconfigureerd. Het huidige WhatsApp Business-account
op 06 83542218 moet blijven bestaan, inclusief gesprekken.

## Wat nu werkt

Elke geldige websiteaanvraag krijgt een aanvraagnummer. De aanvraag gaat eerst
naar verhuur@stuiterbaas.nl. Wie het optionele WhatsApp-vakje aanvinkt, geeft
toestemming voor berichten over deze aanvraag, niet voor reclame. Tekst, keuze
en ontvangsttijd staan in de aanvraagmail.

De aanvraagmail bevat bij toestemming een kant-en-klaar ontvangstbericht.
Peter opent dit vanuit zijn zakelijke WhatsApp Business en drukt op Verzenden.
De link kan het afzenderaccount op de telefoon niet afdwingen: controleer dat
Stuiterbaas / 06 83542218 is geselecteerd. De klant blijft bij websiteboekingen
op de site en hoeft WhatsApp niet zelf te openen.

## Automatisch activeren: nog uit te voeren

1. Facebook-beheeraccount en zakelijk Meta-beheer voor Stuiterbaas instellen.
2. Via een ondersteunde officiële onboarding met coexistence nagaan of het
   bestaande WhatsApp Business-nummer samen met de Cloud API kan worden gebruikt.
   Beschikbaarheid/geschiktheid is nog niet vastgesteld. Het nummer NIET
   deregistreren of naar een ander account migreren, en geen chats verwijderen.
3. Eventuele aanbieder, kosten en Meta-betaalinstellingen concreet beoordelen.
   Er is nog geen abonnement afgesloten of betaald.
4. Onderstaand Nederlands utility-sjabloon bij Meta indienen en laten goedkeuren.
5. Servergegevens instellen op de bestaande gecombineerde Cloudflare Worker:
   - STUITERBAAS_WHATSAPP_ACCESS_TOKEN: secret, nooit in Git/frontend.
   - STUITERBAAS_WHATSAPP_PHONE_NUMBER_ID: ID van Stuiterbaas, niet het belnummer.
   - STUITERBAAS_WHATSAPP_RECEIPT_TEMPLATE: stuiterbaas_aanvraag_ontvangen
   - STUITERBAAS_WHATSAPP_GRAPH_VERSION: ondersteunde versie, te controleren bij inrichting.
   - STUITERBAAS_WHATSAPP_ENABLED: pas true na bovenstaande controles.
6. Met Peter een echte test uitvoeren; controleren of de ontvanger Stuiterbaas
   ziet en of antwoorden in zijn bestaande zakelijke WhatsApp aankomen.

De generieke WHATSAPP_* en LATTENSPECIALIST_WHATSAPP_* waarden worden niet voor
Stuiterbaas gebruikt. Alleen eigen, expliciet ingeschakelde configuratie verzendt.

## Bericht ter goedkeuring bij Meta

Naam: stuiterbaas_aanvraag_ontvangen
Categorie: UTILITY (uiteindelijke classificatie en goedkeuring door Meta)
Taal: nl
Body, zonder header of knoppen:

    Hoi {{1}},

    Stuiterbaas heeft je aanvraag {{2}} ontvangen.
    Gewenste huurperiode: {{3}}.
    Kosten: {{4}}.

    Dit is nog geen definitieve reservering. We bevestigen de beschikbaarheid en de afspraken persoonlijk.
    Vragen of iets wijzigen? Antwoord gerust op dit bericht.

    Groet, Stuiterbaas

Voorbeelden: 1 = Peter; 2 = SB-123456ABCDEF;
3 = 12-06-2099 om 10:00 tot 13-06-2099 om 09:00;
4 = €150 huur + €50 borg = €200 totaal.
Bij langere huur is parameter 4: huurprijs in overleg, plus €50 borg.
De server berekent bedragen; klantinvoer kan ze niet overschrijven.

## Betrouwbaarheid en grenzen

De zakelijke aanvraagmail wordt eerst succesvol aangeboden aan Resend. Pas
daarna mag het klantbericht worden verstuurd. De Meta-aanroep heeft een timeout
van vijf seconden. Uitval blokkeert de aanvraag niet en leidt tot een extra
controlebericht aan de zakelijke mailbox. Na een onzekere verzendpoging wordt
niet automatisch opnieuw verzonden, om dubbele berichten te voorkomen.

Een Meta-bericht-ID betekent accepted, niet delivered. Deze uitbreiding heeft
nog geen delivery-webhook, automatische statusupdates, reserveringskalender of
wachtrij. Controleer bij activering de daadwerkelijke ontvangst en bereikbaarheid
van de chat. De website beweert nooit dat een WhatsApp-bericht is afgeleverd.

De aanvraag is geen definitieve reservering. Beschikbaarheid blijft door
Stuiterbaas persoonlijk te bevestigen. Er wordt geen klantmail als vervanging
van de gewenste WhatsApp-bevestiging toegevoegd.

## Productie en testen

Productie gebruikt de gecombineerde Worker in de Lattenspecialist-repository:
worker/src/index.js en worker/src/stuiterbaas-whatsapp.js.
De Worker-kopie in Stuiterbaas is alleen een afzonderlijk testbare referentie.
Die kopie NIET op stuiterbaas-reserveren deployen: dat zou Lattenspecialist wissen.
Gebruik de gecombineerde worker/wrangler.toml en behoud bestaande variabelen.

npm test in worker draait zowel bestaande reserveringstests als
stuiterbaas-whatsapp.test.mjs. Externe diensten zijn daarbij nagebootst.

Bronnen:
- https://whatsappbusiness.com/policy/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users
- https://www.postman.com/meta/whatsapp-business-platform/
