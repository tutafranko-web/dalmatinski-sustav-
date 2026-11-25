import type { Db } from '../db.js';
import { normalizePhone } from './reservations.js';
import { AppError, type Restaurant } from './types.js';

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
        `update guests set name = 'Obrisani gost', phone = null, email = null, notes = '', stripe_customer_id = null, marketing_consent = false, anonymized_at = now() where id = $1`,
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
