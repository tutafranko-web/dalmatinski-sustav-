# Upute za Claude Code

Projekt: Opsis Restoran — multi-tenant sustav za restorane (rezervacije, AI chatbot, voice agent, QR narudžbe, fiskalizacija). Vlasnik: Franko (Opsis Dalmatia). Komunikacija i tekstovi za korisnike na hrvatskom.

## Pravila
- Node 22 + TypeScript (ESM, `.js` u importima), Fastify, Postgres (Supabase u produkciji, PGlite u testovima).
- Nakon svake promjene: `npm run typecheck && npm test`. Ne commitaj ako testovi padaju.
- Sva poslovna logika ide u `src/services` ili `src/ai/tools.ts`; rute u `src/server.ts` samo čitaju zahtjev i zovu servise.
- Chatbot i voice agent MORAJU koristiti iste alate (`executeTool`), da web/chat/telefon rade isto.
- Vrijeme: u bazi UTC (`timestamptz`), prema gostu lokalno preko `src/time.ts` (Europe/Zagreb).
- Nikad ne spremaj brojeve kartica; samo Stripe tokene.
- Fiskalizacija je isključena dok se ne testira na CIS demo okolini — ne uključuj je bez Frankove potvrde.
- Upit za Google recenziju po defaultu traži odobrenje osoblja (review_mode = 'approval'); nikad ga ne šalji gostu koji nije bio (status seated/completed).
- Javne usluge (rezervacije, chat, QR, voice, WhatsApp) rade samo kad je `isServiceActive(r)`; panel radi i kad je pretplata otkazana.
- AI telefon: JEDAN zajednički Retell agent; restoran se određuje po `call.to_number` (`restaurants.voice_number`).
- Ne mijenjaj tekstove poruka gostima bez provjere sva tri jezika (hr/en/de) u `src/services/messages.ts`.

## Sljedeći zadaci (po prioritetu)
1. Deploy na Hostinger VPS (`docker compose up -d --build`), Supabase baza, domena u `Caddyfile`.
2. Spojiti prave ključeve (.env) i proći ručni test: web rezervacija, WhatsApp poruka, Retell poziv.
3. SMS kao rezervni kanal (npr. Infobip ili Twilio) za goste bez WhatsAppa.
4. Fiskalizacija: test na CIS demo, PNP, storno, ispis računa.

Gotovo: samoprijava + pretplata, zajednički voice agent i naplata minuta, WhatsApp Embedded Signup, čarobnjak, CI/CD (vidi docs/automatizacija.md), Stripe Connect onboarding iz panela, spojeni stolovi, ključevi za osoblje (owner/staff), GDPR brisanje, integracije preko super admina, Retell potpis.
