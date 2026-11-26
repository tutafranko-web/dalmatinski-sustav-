// Samoprijava restorana i naplata pretplate (Opsis → restoran). Ovo je TVOJ prihod, odvojeno od Stripe Connecta
// preko kojeg restoran naplaćuje no-show gostima.
import { randomBytes } from 'node:crypto';
import type { Db } from '../db.js';
import type { Deps } from '../deps.js';
import { normalizePhone } from './reservations.js';
import { AppError, type Restaurant } from './types.js';

export function slugify(name: string): string {
  const s = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);
  return s.length >= 3 ? s : `restoran-${s || 'novi'}`;
}

async function uniqueSlug(db: Db, base: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    if (!(await db.query('select 1 from restaurants where slug = $1', [slug])).rows[0]) return slug;
  }
  return `${base}-${randomBytes(3).toString('hex')}`;
}

const DEFAULT_HOURS = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, open: '12:00', close: '23:00' }));

export interface SignupInput { name: string; email: string; phone?: string; address?: string; acceptTerms?: boolean }

/**
 * Restoran se sam prijavi. Ako je naplata podešena → Stripe Checkout (pretplata), restoran je 'pending' dok ne plati.
 * Bez naplate (razvoj / demo) → odmah aktivan i dobije email s ključem.
 */
export async function signup(db: Db, deps: Deps, input: SignupInput): Promise<{ slug: string; checkoutUrl: string | null }> {
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  if (!name || name.length < 2) throw new AppError(400, 'name_required', 'Upiši naziv restorana');
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError(400, 'bad_email', 'Neispravan email');
  if (!input.acceptTerms) throw new AppError(400, 'terms_required', 'Potrebno je prihvatiti uvjete korištenja');
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (input.phone && !phone) throw new AppError(400, 'bad_phone', 'Neispravan broj telefona');

  // jedan email ne može otvoriti 20 restorana na čekanju
  const pending = (await db.query(`select count(*)::int as n from restaurants where lower(email) = $1 and subscription_status = 'pending'`, [email])).rows[0].n;
  if (pending >= 3) throw new AppError(429, 'too_many', 'Već imate prijave na čekanju; dovršite plaćanje ili nam se javite');

  const slug = await uniqueSlug(db, slugify(name));
  const adminKey = randomBytes(24).toString('base64url');
  const status = deps.billing ? 'pending' : 'active';
  const r = (await db.query<Restaurant>(
    `insert into restaurants (slug, name, email, phone, address, opening_hours, admin_api_key, subscription_status)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [slug, name, email, phone, input.address?.trim() || null, JSON.stringify(DEFAULT_HOURS), adminKey, status],
  )).rows[0];

  if (!deps.billing) {
    await sendWelcome(db, deps, r);
    return { slug, checkoutUrl: null };
  }
  const session = await deps.billing.createSubscriptionCheckout({
    restaurantId: r.id, email, restaurantName: name,
    successUrl: `${deps.config.publicBaseUrl}/start?ok=1`,
    cancelUrl: `${deps.config.publicBaseUrl}/start?cancel=1`,
  });
  return { slug, checkoutUrl: session.url };
}

/** Email dobrodošlice s linkom na panel i ključem (šalje se iz outboxa, s ponavljanjem ako ne uspije). */
export async function sendWelcome(db: Db, deps: Deps, r: Restaurant) {
  const base = deps.config.publicBaseUrl;
  const text = [
    `Pozdrav!`,
    ``,
    `${r.name} je spreman u Opsis Restoranu.`,
    ``,
    `Panel: ${base}/admin`,
    `Oznaka restorana: ${r.slug}`,
    `Ključ (čuvajte ga kao lozinku): ${r.admin_api_key}`,
    ``,
    `Prvi koraci (10 minuta): u panelu otvorite "Postavljanje" i prođite kroz popis — radno vrijeme, stolovi, meni, link za Google recenziju, WhatsApp i AI telefon.`,
    ``,
    `Link za rezervacije (Google profil, Instagram): ${base}/b/${r.slug}`,
    ``,
    `Pitanja? Samo odgovorite na ovaj email.`,
    `Opsis Dalmatia`,
  ].join('\n');
  await db.query(
    `insert into outbox (restaurant_id, channel, recipient, kind, payload) values ($1,'email',$2,'welcome',$3)`,
    [r.id, r.email, JSON.stringify({ subject: `Dobrodošli u Opsis Restoran – ${r.name}`, text })],
  );
}

const STATUS_MAP: Record<string, Restaurant['subscription_status']> = {
  trialing: 'trialing', active: 'active', past_due: 'past_due',
  canceled: 'canceled', unpaid: 'canceled', incomplete_expired: 'canceled', paused: 'canceled', incomplete: 'pending',
};

/** Obrada Stripe događaja za pretplatu (tvoj Stripe račun). */
export async function handleBillingEvent(db: Db, deps: Deps, event: any): Promise<boolean> {
  const obj = event?.data?.object ?? {};
  if (event.type === 'checkout.session.completed' && obj.mode === 'subscription') {
    const id = Number(obj.metadata?.restaurant_id ?? obj.client_reference_id);
    if (!id) return false;
    const r = (await db.query<Restaurant>(
      `update restaurants set billing_customer_id = $2, billing_subscription_id = $3,
         subscription_status = case when subscription_status = 'pending' then 'trialing' else subscription_status end
       where id = $1 returning *`,
      [id, obj.customer ?? null, obj.subscription ?? null],
    )).rows[0];
    if (!r) return false;
    const welcomed = (await db.query(`select 1 from outbox where restaurant_id = $1 and kind = 'welcome'`, [id])).rows[0];
    if (!welcomed) await sendWelcome(db, deps, r);
    return true;
  }
  if (event.type?.startsWith('customer.subscription.')) {
    const status = event.type === 'customer.subscription.deleted' ? 'canceled' : STATUS_MAP[obj.status];
    if (!status) return false;
    const { rows } = await db.query(
      `update restaurants set subscription_status = $2 where billing_subscription_id = $1 returning id`, [obj.id, status],
    );
    return rows.length > 0;
  }
  return false;
}

/** Potrošene minute AI telefona u mjesecu (period 'GGGG-MM', po UTC-u). */
export async function voiceMinutes(db: Db, restaurantId: number, period: string): Promise<number> {
  const [y, m] = period.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1)), to = new Date(Date.UTC(y, m, 1));
  const secs = (await db.query(
    `select coalesce(sum(duration_seconds), 0)::int as s from voice_calls where restaurant_id = $1 and started_at >= $2 and started_at < $3`,
    [restaurantId, from, to],
  )).rows[0].s as number;
  return Math.ceil(secs / 60);
}

/**
 * Na početku mjeseca: za prošli mjesec, minute iznad uključenih → stavka na sljedećem računu.
 * Idempotentno (tablica billing_overages), sigurno za ponovno pokretanje.
 */
export async function billOverages(db: Db, deps: Deps, now: Date): Promise<number> {
  if (!deps.billing) return 0;
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const period = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
  const list = (await db.query<Restaurant>(
    `select * from restaurants where billing_customer_id is not null and subscription_status in ('active','past_due','trialing')
       and id not in (select restaurant_id from billing_overages where period = $1)`, [period],
  )).rows;
  let billed = 0;
  for (const r of list) {
    const used = await voiceMinutes(db, r.id, period);
    const extra = Math.max(0, used - r.included_voice_minutes);
    const amount = extra * r.overage_cents_per_minute;
    // prvo zapis (unique), pa tek onda Stripe — dvostruko pokretanje ne naplaćuje dvaput
    const ins = await db.query(
      `insert into billing_overages (restaurant_id, period, minutes, amount_cents) values ($1,$2,$3,$4) on conflict do nothing returning id`,
      [r.id, period, extra, amount],
    );
    if (!ins.rows[0] || amount === 0) continue;
    try {
      await deps.billing.addInvoiceItem({
        customerId: r.billing_customer_id!, amountCents: amount,
        description: `AI telefon ${period}: ${extra} min iznad ${r.included_voice_minutes} uključenih`,
      });
      billed++;
    } catch (e) {
      // vrati zapis da se pokuša ponovno idući put
      await db.query('delete from billing_overages where id = $1', [ins.rows[0].id]);
      throw e;
    }
  }
  return billed;
}
