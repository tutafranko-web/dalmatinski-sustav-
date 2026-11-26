# Deploy: Hostinger VPS + Supabase

Docker treba pravi VPS. Obični Hostinger web hosting nije dovoljan.

Cijeli put traje oko sat vremena. Nakon toga sustav radi na `https://restoran.opsisdalmatia.com`.

## 1. VPS (Hostinger)

1. Hostinger → VPS → najmanji KVM paket je dovoljan za početak. Server troši malo, a teški posao rade Supabase i AI.
2. Lokacija: EU (npr. Frankfurt), da gosti i baza budu blizu.
3. Operativni sustav: **Ubuntu 24.04**. Ako je ponuđen predložak „Ubuntu with Docker”, uzmi njega.
4. Kod postavljanja dodaj svoj **SSH ključ** umjesto lozinke.
5. Zapiši IP adresu servera.

Na serveru (`ssh root@IP`):

```bash
# samo ako predložak nema Docker
curl -fsSL https://get.docker.com | sh

# vatrozid: samo SSH i web
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw --force enable
```

## 2. Baza (Supabase)

1. supabase.com → New project. Regija **Frankfurt (eu-central-1)**. Spremi lozinku baze.
2. Project Settings → Database → Connection string → **Session pooler** (URI, port 5432). Direktna veza ide samo preko IPv6, pa je pooler sigurniji izbor.
3. U adresu upiši lozinku. Ako lozinka ima znakove poput `@ # / ?`, upiši ih kodirane (`@` = `%40`, `#` = `%23`) ili napravi lozinku samo od slova i brojki.
4. Tablice se naprave same pri prvom pokretanju, zajedno s RLS zaštitom.

> Besplatni Supabase nema dnevne backupe. Za prave restorane uzmi Pro plan.

## 3. Domena (Namecheap)

Namecheap → Domain List → opsisdalmatia.com → **Advanced DNS** → Add new record:

| Type | Host | Value |
|---|---|---|
| A Record | `restoran` | IP adresa VPS-a |

Provjera, kad se proširi (nekoliko minuta): `nslookup restoran.opsisdalmatia.com` vraća IP servera.

## 4. Pokretanje

```bash
git clone https://github.com/tutafranko-web/dalmatinski-sustav-.git opsis-restoran
cd opsis-restoran
cp .env.example .env
nano .env
```

U `.env` obavezno:

- `DATABASE_URL`: adresa iz koraka 2.
- `PUBLIC_BASE_URL=https://restoran.opsisdalmatia.com`
- `SUPER_ADMIN_KEY`: napravi ga s `openssl rand -base64 36`.

Ostali ključevi (AI, WhatsApp, Stripe, SMS, mail) mogu doći kasnije. Bez njih taj dio sustava jednostavno ne radi.

```bash
docker compose up -d --build
docker compose logs -f app     # Ctrl+C za izlaz iz loga
```

Server se ne pokrene ako nešto obavezno nedostaje. U logu tada piše što točno fali (oznaka ✖).

Caddy sam napravi HTTPS certifikat čim DNS pokazuje na server.

Provjera:

```bash
curl https://restoran.opsisdalmatia.com/health     # {"ok":true}
```

## 5. Prvi restoran

```bash
curl -X POST https://restoran.opsisdalmatia.com/api/super/restaurants \
  -H "x-super-key: TVOJ_SUPER_ADMIN_KEY" -H "content-type: application/json" \
  -d '{"slug":"konoba-x","name":"Konoba X","phone":"+38521..."}'
```

U odgovoru je `admin_api_key`. Taj ključ daješ restoranu za panel na `/admin`. Stolove, meni i radno vrijeme restoran podešava u panelu.

## Nova verzija

```bash
cd opsis-restoran && git pull && docker compose up -d --build
```

Migracije baze pokreću se same. Stari kontejner dovrši zahtjeve i poruke koje su u tijeku, pa se ugasi.

## Kad nešto ne radi

| Simptom | Gdje gledati |
|---|---|
| stranica se ne otvara | `docker compose ps` (oba servisa `running`, app `healthy`), DNS zapis |
| `/health` vraća 503 | baza: `DATABASE_URL`, lozinka, je li Supabase projekt pauziran |
| gosti ne dobivaju poruke | `docker compose logs app`, traži `[outbox]` |
| HTTPS greška | `docker compose logs caddy`: DNS mora pokazivati na ovaj server, portovi 80 i 443 otvoreni |
