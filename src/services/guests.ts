import type { Db } from '../db.js';
import { normalizePhone } from './reservations.js';
import { AppError, type Restaurant } from './types.js';

export interface GuestRow {
  id: number; name: string; phone: string | null; email: string | null; language: string;
  visits: number; no_shows: number; notes: string; tags: string[];
  reservations: number; last_visit: Date | null; next_visit: Date | null;
}

/**
 * Popis gostiju za panel: tko dolazi, koliko puta je bio, tko ne dolazi.
 * Samo gosti s kontaktom (gost bez rezervacije bez broja nije osoba koju se može prepoznati) i bez obrisanih.
 */
export async function listGuests(db: Db, r: Restaurant, opts: { q?: string; now: Date; limit?: number }): Promise<GuestRow[]> {
  const q = String(opts.q ?? '').trim().toLowerCase().slice(0, 60);
  const like = q ? `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%` : null;
  const digits = q.replace(/\D/g, '');
  return (await db.query<GuestRow>(
    `select g.id, g.name, g.phone, g.email, g.language, g.visits, g.no_shows, g.notes, g.tags,
            count(res.id)::int as reservations,
            max(res.start_at) filter (where res.status in ('seated','completed')) as last_visit,
            min(res.start_at) filter (where res.status in ('confirmed','pending_guarantee') and res.start_at > $2) as next_visit
       from guests g left join reservations res on res.guest_id = g.id
      where g.restaurant_id = $1 and g.anonymized_at is null and (g.phone is not null or g.email is not null)
        and ($3::text is null or lower(g.name) like $3 or lower(coalesce(g.email, '')) like $3
             or ($4 <> '' and replace(coalesce(g.phone, ''), '+', '') like '%' || $4 || '%')
             or lower(g.notes) like $3 or lower(g.tags::text) like $3)
      group by g.id
      order by max(res.start_at) desc nulls last, g.id desc
      limit $5`,
    [r.id, opts.now, like, digits.length >= 3 ? digits : '', Math.min(opts.limit ?? 200, 500)],
  )).rows;
}

/** Osoblje mijenja ime, bilješku i oznake gosta. Kontakt se ne mijenja ovdje (po njemu gost dokazuje tko je). */
export async function updateGuest(db: Db, r: Restaurant, id: number, b: { name?: unknown; notes?: unknown; tags?: unknown }) {
  const g = (await db.query('select * from guests where id = $1 and restaurant_id = $2 and anonymized_at is null', [id, r.id])).rows[0];
  if (!g) throw new AppError(404, 'guest_not_found', 'Gost ne postoji');
  let tags = g.tags;
  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags) || b.tags.length > 12) throw new AppError(400, 'bad_tags', 'Oznake: popis od najviše 12');
    tags = [...new Set(b.tags.map((x) => String(x).trim().slice(0, 30)).filter(Boolean))];
  }
  const name = b.name !== undefined ? String(b.name).trim().slice(0, 100) : g.name;
  if (!name) throw new AppError(400, 'name_required', 'Ime je obavezno');
  const notes = b.notes !== undefined ? String(b.notes).trim().slice(0, 1000) : g.notes;
  return (await db.query(
    'update guests set name = $2, notes = $3, tags = $4 where id = $1 returning id, name, phone, email, visits, no_shows, notes, tags',
    [id, name, notes, JSON.stringify(tags)],
  )).rows[0];
}

/** Rezervacije jednog gosta, najnovije prve. */
export async function guestHistory(db: Db, r: Restaurant, id: number) {
  return (await db.query(
    `select res.id, res.code, res.start_at, res.party_size, res.status, res.source, res.notes, t.label as table_label
       from reservations res left join dining_tables t on t.id = res.table_id
      where res.restaurant_id = $1 and res.guest_id = $2 order by res.start_at desc limit 50`,
    [r.id, id],
  )).rows;
}

/**
 * GDPR: briše osobne podatke gosta na zahtjev. Rezervacije ostaju radi statistike, bez imena i kontakta.
 * Brišu se i već poslane poruke jer sadrže ime i kontakt. Vraća broj pronađenih gostiju.
 */
export async function anonymizeGuest(db: Db, r: Restaurant, contact: { phone?: string | null; email?: string | null }): Promise<number> {
  const phone = normalizePhone(contact.phone);
  const email = contact.email ? String(contact.email).trim().toLowerCase() : null;
  if (!phone && !email) throw new AppError(400, 'contact_required', 'Upiši mobitel ili email gosta');
  return db.tx(async (t) => {
    const guests = (await t.query<{ id: number; phone: string | null; email: string | null }>(
      'select id, phone, email from guests where restaurant_id = $1 and ((phone is not null and phone = $2) or (email is not null and lower(email) = $3))',
      [r.id, phone, email],
    )).rows;
    for (const g of guests) {
      await t.query(
        `update guests set name = 'Obrisani gost', phone = null, email = null, notes = '', tags = '[]', stripe_customer_id = null, marketing_consent = false, anonymized_at = now() where id = $1`,
        [g.id],
      );
      await t.query(`update reservations set notes = '' where guest_id = $1`, [g.id]);
      await t.query(
        `delete from outbox where restaurant_id = $1 and (recipient = $2 or lower(recipient) = lower($3)
           or reservation_id in (select id from reservations where guest_id = $4))`,
        [r.id, g.phone, g.email, g.id],
      );
      if (g.phone) await t.query(`delete from chat_sessions where restaurant_id = $1 and external_id = $2`, [r.id, g.phone]);
    }
    return guests.length;
  });
}
