# SMS (Infobip)

SMS je rezervni kanal. Gost ga dobiva samo kad mu se ne može pisati na WhatsApp:

- restoran nema spojen WhatsApp, ili
- WhatsApp poruka ne prođe ni iz drugog pokušaja, ili
- Meta javi da broj nije na WhatsAppu. Taj gost sljedeći put odmah dobiva SMS.

Email, ako ga gost ima, ide uvijek, neovisno o SMS-u.

**Trošak je Opsisov.** Infobip naplaćuje po poruci, oko 0,085 € po SMS-u prema Hrvatskoj (cjenik, studeni 2026.). Zato SMS za restoran **uključuje samo super admin**, ne vlasnik restorana.

## Postavljanje

1. Napravi račun na infobip.com. Dok traje proba, SMS ide samo na tvoj potvrđeni broj, a pošiljatelj mora biti `ServiceSMS`.
2. Developers → API keys: napravi ključ s opsegom `sms:message:send`. Na istoj stranici je i osobna adresa računa (`https://xxxxx.api.infobip.com`).
3. U `.env`:
   ```
   INFOBIP_API_KEY=...
   INFOBIP_BASE_URL=https://xxxxx.api.infobip.com
   SMS_SENDER=ServiceSMS        # samo dok traje proba; poslije obriši
   ```
4. `docker compose up -d` (ponovno učita `.env`).
5. Uključi SMS restoranu:
   ```bash
   curl -X PUT https://restoran.opsisdalmatia.com/api/super/restaurants/konoba-x/integrations \
     -H "x-super-key: $SUPER_ADMIN_KEY" -H "content-type: application/json" \
     -d '{"sms_mode":"fallback","sms_sender":"KonobaX","sms_daily_limit":100}'
   ```
   `sms_sender` je ime pošiljatelja: 3 do 11 slova i brojki. Ako ga nema, uzima se naziv restorana skraćen na 11 znakova. Na A1 mreži operater ga može zamijeniti općenitim imenom.

U panelu restorana, pod Postavke, tada piše „SMS: uključen”.

## Zaštita od troška

Obrazac za rezervaciju je javan i u njega se može upisati bilo koji broj. Zato vrijedi sljedeće:

- **Samo dopuštene zemlje:** EU, Ujedinjeno Kraljevstvo, Švicarska, Norveška i susjedi. Popis je u `src/services/sms.ts`.
- **Bez +1 (SAD i Karibi):** dio karipskih brojeva čest je cilj prijevara, a SAD ionako ne prima pošiljatelja s imenom.
- **Samo hrvatski mobiteli:** fiksni brojevi (npr. 021) ne dobivaju SMS.
- **Limit po broju:** najviše 5 SMS-ova po broju u 24 h.
- **Dnevni limit po restoranu:** `sms_daily_limit`, zadano 100.
- **Recenzija samo bez emaila:** upit za recenziju ide SMS-om samo gostu bez emaila.
- **Bez kasnih SMS-ova:** rezervni SMS se ne šalje ako je termin već prošao.

## Tekstovi

Tekstovi su u `src/services/messages.ts` (`SMS`), na HR, EN i DE. Gost u SMS-u ne dobiva ime, da poruka stane u jednu ili dvije poruke.

Hrvatska slova šalju se bez kvačica (č → c, đ → dj). S kvačicama bi poruka išla u Unicodeu: 70 umjesto 160 znakova po poruci, dakle 2 do 3 puta skuplje.

Link za karticu u SMS-u je kratak (`/g/ŠIFRA`) i vodi na Stripe.

## Probni SMS

1. Restoran bez WhatsAppa, `sms_mode` = `fallback`.
2. Na `/b/konoba-x` rezerviraj sa svojim mobitelom, bez emaila.
3. Unutar minute stiže SMS.
4. Ako SMS ne stigne, u `docker compose logs app` potraži `[outbox]`, a u tablici `outbox` stupac `last_error`.

Infobip izvještaje o dostavi SMS-a sustav zasad ne prati. U Infobip portalu vide se za svaku poruku.
