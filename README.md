# Opsis Restoran

Sve-u-jednom sustav za restorane: online rezervacije, AI chatbot (web, WhatsApp, Instagram), AI voice agent za telefon, QR meni s narudžbama na stol, podsjetnici, garancija karticom protiv no-showa, upit za Google recenziju i (eksperimentalno) fiskalizacija.

Jedan server služi više restorana (svaki ima svoj `slug` i ključ za panel).

## Što je gotovo

| Dio | Status |
|---|---|
| Rezervacije: stolovi, zone, radno vrijeme (i iza ponoći), zatvoreni dani, dodjela najmanjeg stola, zaštita od dvostrukog bukiranja | ✅ testirano |
| Stranica za rezervaciju `/b/SLUG` (HR/EN/DE): dani kao kartice, prvi slobodan termin kad je dan pun, potvrda sa šifrom, dodavanje u kalendar, meni i radno vrijeme; gumb za web restorana (`widget.js`, boja restorana kroz `data-color`) | ✅ testirano u pregledniku |
| Gost sam pregleda, promijeni ili otkaže rezervaciju (šifra + mobitel/email) | ✅ testirano u pregledniku |
| Potvrde, izmjene, otkazi, podsjetnik 24 h prije (WhatsApp predlošci + email) | ✅ testirano s lažnim slanjem |
| SMS (Infobip) kad WhatsApp nije moguć ili ne prođe; zaštita od troška (zemlje, limiti) | ✅ testirano s lažnim slanjem, [upute](docs/sms-infobip.md) |
| Ponovni pokušaj slanja s razmakom (1, 5, 15, 60 min) | ✅ testirano |
| Upit za Google recenziju: konobar u panelu odobri gosta (⭐ Traži recenziju / Ne), poruka ide 2 h nakon posjeta; u postavkama može i automatski ili isključeno | ✅ testirano |
| Garancija karticom (Stripe Connect, setup mode), istek nakon 30 min, naplata no-showa | ✅ testirano s lažnim Stripeom |
| AI chatbot (Claude + alati) na webu (`chat.js`, brza pitanja, pamti razgovor; skriven dok AI nije podešen), WhatsAppu i Instagramu | ✅ testirano s lažnim modelom |
| Voice agent: Retell custom funkcije + inbound webhook + provjera Retell potpisa (format provjeren u njihovoj dokumentaciji) | ✅ testirano bez pravog poziva |
| Spojeni stolovi za veće grupe (rezervacija spojenih blokira sve njihove stolove) | ✅ testirano |
| Ključevi za osoblje: vlasnik vs konobar (konobar ne mijenja meni/stolove/postavke), opoziv ključa | ✅ testirano |
| GDPR: brisanje podataka gosta na zahtjev | ✅ testirano |
| Stripe Connect: vlasnik u panelu klikne "Spoji Stripe" i prođe onboarding | ✅ testirano s lažnim Stripeom |
| Spajanje WhatsApp/Instagram/Stripe ID-jeva i SMS-a za restoran (`PUT /api/super/restaurants/SLUG/integrations`) | ✅ testirano |
| Produkcijski način: pravi Postgres 17, TLS prema bazi, RLS, provjera `.env` pri startu, uredno gašenje | ✅ provjereno lokalno na Postgresu 17 (Docker nije probran) |
| Panel za restoran `/admin`: raspored stolova po satima, popis i pretraga, detalji rezervacije (status, promjena termina, premještanje stola, napomene), gost bez rezervacije, ispis liste za večer, obavijest o novoj online rezervaciji | ✅ testirano u pregledniku |
| Panel: gosti s oznakama (VIP, alergije) i bilješkama, narudžbe s vremenom čekanja, meni s opisima i redoslijedom, stolovi s QR kodovima i ispisom kartica, statistika s grafovima, uređivač radnog vremena | ✅ testirano u pregledniku |
| QR meni po stolu `/m/TOKEN`: narudžba s košaricom, poziv konobara, račun, skrivanje jela po alergenima, alergeni i kategorije na jeziku gosta | ✅ testirano u pregledniku |
| Fiskalizacija (ZKI, potpis, CIS, naknadna dostava) | ⚠️ testirano lokalno, **nije** testirano na CIS demo okolini |

**Nije isprobano s pravim servisima** (treba tvoje ključeve): Anthropic, Retell, Meta/WhatsApp, Stripe, SMTP, CIS.

## Pokretanje lokalno (2 min)

```bash
npm install
npm start            # bez DATABASE_URL koristi bazu u memoriji + demo restoran
```

- Početna s linkovima na demo: http://localhost:3000/
- Rezervacija: http://localhost:3000/b/demo-konoba
- Panel: http://localhost:3000/admin (oznaka `demo-konoba`, ključ `demo-key`)
- QR meni: http://localhost:3000/m/demo-qr-3
- Testovi: `npm test` (92 testa) · provjera tipova: `npm run typecheck`

Demo restoran ima današnje rezervacije oko trenutnog vremena, 30 dana povijesti za statistiku i par otvorenih narudžbi, pa je dobar za prezentacije. Imena i brojevi su izmišljeni.

## Produkcija (Hostinger VPS + Supabase)

Detaljno, korak po korak: [docs/deploy-hostinger.md](docs/deploy-hostinger.md).

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

- Rate limit i redoslijed poruka u chatu drže se u memoriji jednog procesa — za više instanci treba Redis.
- Fiskalizacija nije testirana na CIS demo okolini (odluka 26. 11. 2026.: zasad restorani zadržavaju svoju blagajnu).
- Nema roka za besplatan otkaz: gost može otkazati sve do početka termina. Rok (npr. 24 h) je poslovna odluka po restoranu.
- Gost može izmjenom povećati broj osoba iznad praga za garanciju bez da ostavi karticu.
- Dostava SMS-a se ne prati u sustavu (vidi se u Infobip portalu).
- Greške na QR meniju su samo na hrvatskom.
