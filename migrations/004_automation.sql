-- Automatizacija: samoprijava i pretplata, jedan voice agent za sve, WhatsApp Embedded Signup, mjerenje minuta.

-- pretplata restorana kod tebe (Opsis): manual = ručno dodan (bez Stripe pretplate)
-- pending (čeka plaćanje) | trialing | active | past_due | canceled | manual
alter table restaurants add column if not exists subscription_status text not null default 'manual';
alter table restaurants add column if not exists billing_customer_id text;
alter table restaurants add column if not exists billing_subscription_id text;

-- voice: broj na koji gosti zovu (E.164); po njemu jedan zajednički Retell agent zna koji je restoran
alter table restaurants add column if not exists voice_number text unique;
alter table restaurants add column if not exists included_voice_minutes int not null default 200;
alter table restaurants add column if not exists overage_cents_per_minute int not null default 30;

-- WhatsApp Embedded Signup: token po restoranu (Tech Provider model)
alter table restaurants add column if not exists whatsapp_waba_id text;
alter table restaurants add column if not exists whatsapp_token text;

create table if not exists voice_calls (
  id              serial primary key,
  restaurant_id   int not null references restaurants(id) on delete cascade,
  call_id         text unique not null,
  from_number     text,
  started_at      timestamptz not null,
  duration_seconds int not null default 0
);
create index if not exists voice_calls_month on voice_calls(restaurant_id, started_at);

-- obračunati višak minuta po mjesecu (da se ne naplati dvaput)
create table if not exists billing_overages (
  id              serial primary key,
  restaurant_id   int not null references restaurants(id) on delete cascade,
  period          text not null,            -- '2026-07'
  minutes         int not null,
  amount_cents    int not null,
  created_at      timestamptz not null default now(),
  unique (restaurant_id, period)
);
