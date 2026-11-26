-- Panel: oznake gostiju (npr. "VIP", "alergija"), arhiva jela i gosti bez rezervacije.

-- oznake gosta koje osoblje vidi uz svaku rezervaciju, npr. ["VIP", "bez glutena"]
alter table guests add column if not exists tags jsonb not null default '[]';

-- jelo koje je već naručivano ne može se obrisati (veza s narudžbama), pa se arhivira
alter table menu_items add column if not exists archived_at timestamptz;

-- source = 'walk_in': gost bez rezervacije, posjeli ga konobar
create index if not exists reservations_guest on reservations(guest_id);
