-- Spojeni stolovi: red u dining_tables s combo_of = ID-jevi stvarnih stolova (npr. {3,4} = stolovi 3+4 za 8 osoba).
-- Rezervacija na kombinaciji zauzima sve njezine stolove i obrnuto.
alter table dining_tables add column if not exists combo_of int[];

-- Ključevi za osoblje: vlasnik (owner) može sve, konobar (staff) samo rezervacije i narudžbe.
create table if not exists staff_keys (
  id             serial primary key,
  restaurant_id  int not null references restaurants(id) on delete cascade,
  name           text not null,
  role           text not null default 'staff',   -- owner | staff
  key_hash       text not null unique,            -- sha256 ključa, sam ključ se ne sprema
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz
);

alter table guests add column if not exists anonymized_at timestamptz;
