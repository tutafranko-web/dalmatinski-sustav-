-- SMS kao rezervni kanal (Infobip) za goste bez WhatsAppa.
-- sms_mode: 'off' (zadano) | 'fallback' = SMS kad WhatsApp nije moguć ili ne uspije. Uključuje samo super admin jer SMS plaća Opsis.
alter table restaurants add column if not exists sms_mode text not null default 'off';
alter table restaurants add column if not exists sms_sender text;              -- ime pošiljatelja, do 11 znakova
alter table restaurants add column if not exists sms_daily_limit int not null default 100;

alter table outbox add column if not exists created_at timestamptz not null default now();
alter table outbox add column if not exists provider_id text;                  -- ID poruke kod Mete / Infobipa
alter table outbox add column if not exists delivery_status text;              -- sent | delivered | read | failed (WhatsApp status)
alter table outbox add column if not exists failed_at timestamptz;             -- odustalo se od slanja
alter table outbox add column if not exists fallback_for int references outbox(id) on delete set null;
create unique index if not exists outbox_fallback_uniq on outbox(fallback_for) where fallback_for is not null;
create index if not exists outbox_provider on outbox(provider_id) where provider_id is not null;

-- null = ne znamo, false = broj nije na WhatsAppu (ide odmah SMS), true = WhatsApp radi
alter table guests add column if not exists whatsapp_ok boolean;

-- link za Stripe je predug za SMS; gost dobije kratki /g/ŠIFRA koji vodi ovamo
alter table reservations add column if not exists guarantee_url text;
