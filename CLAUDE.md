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
- Ne mijenjaj tekstove poruka gostima bez provjere sva tri jezika (hr/en/de) u `src/services/messages.ts`. To vrijedi i za SMS tekstove (`SMS`), koji moraju stati u 2 poruke (test to provjerava).
- Nova tablica = `enable row level security` u istoj migraciji (Supabase REST inače izlaže podatke; test to provjerava).
- SMS plaća Opsis: uključuje ga samo super admin (`sms_mode`), nikad vlasnik restorana iz panela.
- Bot traži rezervacije po broju samo kad je broj potvrđen (WhatsApp, poziv). Na web chatu i Instagramu traži se šifra.
- Rad ide na granu (npr. `rad/...`), ne izravno na `main`. GitHub repo je javan: nikad ne commitaj `.env` ni ključeve.

## Sljedeći zadaci (po prioritetu)
1. Deploy: kod je spreman ([docs/deploy-hostinger.md](docs/deploy-hostinger.md)). Čeka se da Franko kupi Hostinger VPS (26. 11. 2026.), napravi Supabase projekt i DNS zapis `restoran` na Namecheapu.
2. Spojiti prave ključeve (.env) i proći ručni test: web rezervacija, WhatsApp poruka, Retell poziv, SMS. Prije pravog chata usporediti `claude-haiku-4-5` i `claude-haiku-5-5` (10× jeftiniji, ali ima thinking i refusal); model bira Franko.
3. SMS: kod je gotov (Infobip, Franko izabrao 26. 11. 2026.). Čeka se Infobip račun i ključ ([docs/sms-infobip.md](docs/sms-infobip.md)).
4. Fiskalizacija: Franko 26. 11. 2026.: preskočiti zasad, restorani zadržavaju svoju blagajnu. Ne raditi bez nove odluke.

Otvorene poslovne odluke: rok besplatnog otkaza, garancija kad gost izmjenom poveća broj osoba.

Gotovo: Stripe Connect onboarding iz panela, spojeni stolovi, ključevi za osoblje (owner/staff), GDPR brisanje, integracije preko super admina, Retell potpis, priprema za deploy (Docker, TLS, RLS, CORS, provjera .env), SMS preko Infobipa.
