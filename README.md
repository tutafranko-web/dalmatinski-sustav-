# Opsis Restoran

Sve-u-jednom sustav za restorane: online rezervacije, AI chatbot (web, WhatsApp, Instagram), AI voice agent za telefon, QR meni s narudžbama na stol, podsjetnici, garancija karticom protiv no-showa, upit za Google recenziju i (eksperimentalno) fiskalizacija.

Jedan server služi više restorana (svaki ima svoj `slug` i ključ za panel).

**Automatizacija** (samoprijava, pretplata, WhatsApp samospajanje, jedan AI telefon za sve, naplata viška minuta, CI/CD): [docs/automatizacija.md](docs/automatizacija.md)

## Što je gotovo

| Dio | Status |
|---|---|
| Rezervacije: stolovi, zone, radno vrijeme (i iza ponoći), zatvoreni dani, dodjela najmanjeg stola, zaštita od dvostrukog bukiranja | ✅ testirano |
| Stranica za rezervaciju `/b/SLUG` (HR/EN/DE) + gumb za web restorana (`widget.js`) | ✅ testirano u pregledniku |
| Pregled i otkaz rezervacije za gosta (šifra + mobitel/email) | ✅ |
| Potvrde, izmjene, otkazi, podsjetnik 24 h prije (WhatsApp predlošci + email) | ✅ testirano s lažnim slanjem |
| Upit za Google recenziju: konobar u panelu odobri gosta (⭐ Traži recenziju / Ne), poruka ide 2 h nakon posjeta; u postavkama može i automatski ili isključeno | ✅ testirano |
| Garancija karticom (Stripe Connect, setup mode), istek nakon 30 min, naplata no-showa | ✅ testirano s lažnim Stripeom |
| AI chatbot (Claude + alati) na webu (`chat.js`), WhatsAppu i Instagramu | ✅ testirano s lažnim modelom |
| Voice agent: Retell custom funkcije + inbound webhook + provjera Retell potpisa (format provjeren u njihovoj dokumentaciji) | ✅ testirano bez pravog poziva |
| Spojeni stolovi za veće grupe (rezervacija spojenih blokira sve njihove stolove) | ✅ testirano |
| Ključevi za osoblje: vlasnik vs konobar (konobar ne mijenja meni/stolove/postavke), opoziv ključa | ✅ testirano |
| GDPR: brisanje podataka gosta na zahtjev | ✅ testirano |
| Samoprijava `/start` + pretplata 100 €/mj (Stripe Billing), email s ključem, gašenje usluga kad pretplata padne, Stripe portal | ✅ testirano s lažnim Stripeom |
| Jedan Retell agent za sve restorane (po nazvanom broju), automatski uvoz broja, mjerenje minuta, naplata viška | ✅ testirano s lažnim Retellom |
| WhatsApp Embedded Signup (token po restoranu) | ✅ testirano s lažnom Metom |
| Čarobnjak "Postavljanje" u panelu, super admin pregled | ✅ testirano u pregledniku |
| GitHub Actions: testovi + automatski deploy na VPS | ⚠️ napisano, pokreće se kad dodaš VPS secrets |
| Stripe Connect: vlasnik u panelu klikne "Spoji Stripe" i prođe onboarding | ✅ testirano s lažnim Stripeom |
| Spajanje WhatsApp/Instagram/Stripe ID-jeva za restoran (`PUT /api/super/restaurants/SLUG/integrations`) | ✅ testirano |
| Panel za restoran `/admin`: rezervacije, narudžbe (zvuk), meni, stolovi + QR linkovi, postavke, statistika | ✅ testirano u pregledniku |
| QR meni po stolu `/m/TOKEN`: narudžba, poziv konobara, račun, 14 EU alergena | ✅ testirano u pregledniku |
| Fiskalizacija (ZKI, potpis, CIS, naknadna dostava) | ⚠️ testirano lokalno, **nije** testirano na CIS demo okolini |

**Nije isprobano s pravim servisima** (treba tvoje ključeve): Anthropic, Retell, Meta/WhatsApp, Stripe, SMTP, CIS.

## Pokretanje lokalno (2 min)

```bash
npm install
npm start            # bez DATABASE_URL koristi bazu u memoriji + demo restoran
```

- Rezervacija: http://localhost:3000/b/demo-konoba
- Panel: http://localhost:3000/admin (oznaka `demo-konoba`, ključ `demo-key`)
- QR meni: http://localhost:3000/m/demo-qr-3
- Testovi: `npm test` (53 testa) · provjera tipova: `npm run typecheck`

## Produkcija (Hostinger VPS + Supabase)

1. Supabase → novi projekt (regija EU) → kopiraj connection string u `DATABASE_URL`.
2. Na VPS-u: `git clone`, `cp .env.example .env`, popuni varijable.
3. U `Caddyfile` stavi svoju domenu, DNS A zapis na IP VPS-a.
4. `docker compose up -d --build` (migracije se pokreću same pri startu).
5. Novi restoran:
   ```bash
   curl -X POST https://DOMENA/api/super/restaurants -H "x-super-key: $SUPER_ADMIN_KEY" \
     -H "content-type: application/json" -d '{"slug":"konoba-x","name":"Konoba X","phone":"+38521..."}'
   ```
   Odgovor sadrži `admin_api_key` — to daješ restoranu za panel. Ostalo (stolovi, meni, radno vrijeme) se podesi u panelu.

Upute po servisu: [voice agent](docs/voice-agent-retell.md) · [WhatsApp/Instagram](docs/whatsapp-instagram.md) · [Stripe i fiskalizacija](docs/stripe-i-fiskalizacija.md)

## Ugradnja na web restorana

```html
<script src="https://DOMENA/widget.js" data-restaurant="konoba-x" async></script>  <!-- gumb Rezerviraj -->
<script src="https://DOMENA/chat.js" data-restaurant="konoba-x" async></script>    <!-- AI chat -->
```
Link za Google profil i Instagram bio: `https://DOMENA/b/konoba-x`

## Struktura

```
src/
  server.ts              sve HTTP rute (javne, admin, webhooks, voice)
  services/
    availability.ts      radno vrijeme, slobodni termini, izbor stola
    reservations.ts      kreiranje, izmjena, otkaz, garancija, no-show
    notifications.ts     outbox: WhatsApp predlošci + email
    messages.ts          tekstovi poruka HR/EN/DE
    orders.ts            faza 2: meni, QR narudžbe
  ai/
    tools.ts             alati za chatbot i voice (ista logika)
    chatbot.ts           Claude petlja s alatima, povijest razgovora
  fiscal/                faza 3: CIS fiskalizacija
  jobs/scheduler.ts      svake minute: istek garancija, podsjetnici, recenzije, slanje poruka
  adapters.ts            Stripe, SMTP, Meta, Anthropic
migrations/              SQL shema
public/                  book.html, admin.html, menu.html, widget.js, chat.js
tests/                   vitest (pravi Postgres u memoriji — PGlite)
```

## Poznata ograničenja (sljedeći koraci)

- Nema SMS-a (samo WhatsApp + email).
- Rate limit je u memoriji jednog procesa — za više instanci treba Redis.
- Fiskalizacija nije testirana na CIS demo okolini.
