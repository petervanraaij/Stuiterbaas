# Stuiterbaas

Publieke GitHub Pages-site voor springkussenverhuur vanuit Wamel en Nieuwegein. De bestaande reserverings-Worker beheert aanvraagvalidatie, actuele bedragen en persoonlijke bevestiging.

## Keuzehulp

`customer-choice.css` en `customer-choice.js` ondersteunen de twee zichtbare huurkeuzes. Eén dag kost €95 huur plus €50 borg (€145 samen); twee aansluitende dagen kosten €150 huur plus €50 borg (€200 samen). De tweede dag betekent €55 extra huur. Bezorging en begeleide op- en afbouw binnen 10 km van Wamel of Nieuwegein blijven inbegrepen; verder weg wordt vooraf afgesproken.

Een keuze vult uitsluitend `rentalDays` in het bestaande aanvraagformulier en gebruikt het bestaande change-event voor bedrag, einddatum en tijdvalidatie. De bezoeker kan nog aanpassen. Er wordt niets verstuurd, geen beschikbaarheid beloofd en geen WhatsApp-toestemming aangevinkt. De bestaande afspraken over borg, betaling, weersomstandigheden, hulp en toezicht blijven zichtbaar.

## Controle

`node --check customer-choice.js` en `npm --prefix worker test`. De keuzes zijn daarnaast op 1440 en 390 pixels in Chrome gecontroleerd: heen en terug tussen één/twee/langer huren, correcte totalen, uitgeschakelde einddatum na terugkeer naar één dag, geen automatische aanvraag of toestemming, geen horizontale pagina-overloop of browserfouten. Externe API-verzoeken waren tijdens die controle geblokkeerd. Publieke screenshots staan in `docs/screenshots/customer-choice-*.png`.

## Eén productiebron voor de reserveringsdienst

Stuiterbaas en Lattenspecialist gebruiken dezelfde Cloudflare Worker `stuiterbaas-reserveren`. De actuele productiebron staat in [petervanraaij/Lattenspecialist, map worker](https://github.com/petervanraaij/Lattenspecialist/tree/main/worker). Die bron bevat beide reserveringsstromen, bedrijfsgebonden oorsprongcontroles, meldingen en het werkplaatsbeheer.

De oudere `worker/` in deze repository blijft uitsluitend als historie en voor regressievergelijking bewaard. `npm --prefix worker run deploy` is bewust geblokkeerd: deze oude versie zou anders de gedeelde dienst overschrijven en Lattenspecialist-functies verwijderen. Publiceer deze bron ook niet rechtstreeks met Wrangler. Websitewijzigingen aan Stuiterbaas blijven via deze repository lopen; wijzigingen aan de gedeelde dienst gaan centraal via Lattenspecialist en moeten beide reserveringsstromen testen. Dit is een bestaande externe dienst, nog geen algemene Pierfinity-API-integratie.
