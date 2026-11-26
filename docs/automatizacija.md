# Automatizacija: od prijave restorana do rada bez ručnog posla

## Tok za novog klijenta

1. Restoran otvori `https://DOMENA/start`, upiše naziv i email, prihvati uvjete.
2. Stripe Checkout: kartica, 14 dana besplatno, zatim 100 € + PDV mjesečno (tvoj Stripe račun).
3. Stripe webhook → restoran se aktivira → **automatski email** s linkom na panel i ključem.
4. Panel otvara karticu **Postavljanje** s popisom koraka: radno vrijeme, stolovi, meni, info za AI, Google recenzija, prva testna rezervacija.
5. Restoran sam spaja:
   - **WhatsApp**: gumb "Spoji WhatsApp" (Metin Embedded Signup, ~2 min);
   - **Stripe za garanciju karticom**: gumb "Spoji Stripe" (Connect onboarding).
6. **AI telefon**: ti dodijeliš broj jednom naredbom (dolje), sustav ga sam uveze u Retell. Restoran utipka GSM kod za preusmjeravanje (prikazan u panelu).
7. Prvog u mjesecu: minute AI telefona iznad 200 automatski idu na račun (0,30 €/min).
8. Ako pretplata padne ili je otkazana: online rezervacije, chatbot, QR i AI telefon se sami gase; panel ostaje dostupan. Kad plati, sve se samo vrati.
9. Restoran sam mijenja karticu, gleda račune i otkazuje u panelu ("Upravljaj pretplatom" → Stripe portal).
10. Svaki push na GitHub: testovi; push na `main`: automatski deploy na VPS (GitHub Actions).

## Što još ostaje ručno (i zašto)

| Korak | Zašto nije automatski | Koliko često |
|---|---|---|
| Kupnja hrvatskog broja za AI telefon | Twilio za HR brojeve traži regulatorne podatke (firma, adresa) po broju | Kupi 5–10 brojeva unaprijed na Opsis, pa dodjeljuješ iz "bazena" |
| Odobrenje Mete kao Tech Provider | Meta traži verifikaciju firme i pregled aplikacije | Jednom, može trajati tjednima |
| Stripe aktivacija računa i porez | Stripe traži podatke firme; PDV (Stripe Tax ili ručno) | Jednom |
| Fiskalizacija | Nije testirana na CIS-u | Isključeno dok ne testiraš |
| Prodaja | Netko mora dovesti restoran do `/start` | Stalno (cold email s linkom na /start) |

## Jednokratno postavljanje (tvoj posao, ~1 dan)

1. **Server**: VPS + `docker compose up -d --build`, domena u `Caddyfile`, Supabase `DATABASE_URL`.
2. **GitHub → Settings → Secrets → Actions**: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PATH` → svaki push na `main` se sam deploya.
3. **Stripe (tvoj račun)**:
   - Products → "Opsis Restoran" 100 € mjesečno → `STRIPE_PRICE_ID`;
   - Settings → Billing → Customer portal: uključi otkaz i promjenu kartice;
   - Webhook 1 (tvoj račun): `https://DOMENA/webhooks/stripe`, događaji `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` → `STRIPE_WEBHOOK_SECRET`;
   - Webhook 2 (Connected accounts): isti URL, `checkout.session.completed` → `STRIPE_CONNECT_WEBHOOK_SECRET`;
   - Connect uključen (Express).
4. **Retell**:
   - `RETELL_API_KEY`, `VOICE_SHARED_SECRET`, `RETELL_VOICE_ID` (glas koji dobro govori hrvatski), `RETELL_LANGUAGES`;
   - `npm run retell:setup` → dobiješ `RETELL_AGENT_ID`. **Jedan agent za sve restorane**, restoran se prepoznaje po broju koji je gost nazvao;
   - Twilio Elastic SIP Trunk prema Retellu → `RETELL_SIP_TERMINATION_URI` (+ korisnik/lozinka ako ih trunk traži).
5. **Meta**: aplikacija kao Tech Provider, Embedded Signup konfiguracija → `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, webhook `https://DOMENA/webhooks/meta`.
6. **Email**: `SMTP_URL`, `MAIL_FROM`.

## Naredbe za tebe (super admin)

```bash
# dodijeli broj AI telefona restoranu (sam se uveze u Retell i veže na agenta)
curl -X PUT https://DOMENA/api/super/restaurants/SLUG/voice -H "x-super-key: $SUPER_ADMIN_KEY" \
  -H "content-type: application/json" -d '{"number":"+38521555666"}'

# pregled svih restorana: status pretplate, rezervacije ovaj mjesec, koliko preko AI-ja, minute
curl https://DOMENA/api/super/overview -H "x-super-key: $SUPER_ADMIN_KEY"

# ručno pokreni obračun viška minuta (inače se radi sam prvih 5 dana u mjesecu)
curl -X POST https://DOMENA/api/super/bill-overages -H "x-super-key: $SUPER_ADMIN_KEY"
```

## Bez Mete

Ako ne želiš WhatsApp/Instagram: ne postavljaj `META_*`. Potvrde i podsjetnici idu na email, chatbot radi na webu restorana, AI telefon radi normalno.
