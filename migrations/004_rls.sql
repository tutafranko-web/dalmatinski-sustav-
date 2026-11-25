-- Supabase izlaže tablice iz sheme public preko svog REST API-ja. Bez RLS-a bi svatko s anon ključem
-- mogao čitati goste, rezervacije i ključeve panela. Uključen RLS bez ijednog pravila znači: nitko osim vlasnika baze.
-- Server se spaja izravno kao vlasnik tablica pa njega RLS ne ograničava.
-- NOVA TABLICA = dodaj "enable row level security" u istoj migraciji (test to provjerava).
alter table restaurants enable row level security;
alter table dining_tables enable row level security;
alter table guests enable row level security;
alter table reservations enable row level security;
alter table outbox enable row level security;
alter table chat_sessions enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table invoices enable row level security;
alter table staff_keys enable row level security;
alter table _migrations enable row level security;
