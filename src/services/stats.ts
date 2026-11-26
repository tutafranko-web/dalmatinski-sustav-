import type { Db } from '../db.js';
import { localToUtc, utcToLocal } from '../time.js';
import type { Restaurant } from './types.js';

const AI_SOURCES = ['chat', 'whatsapp', 'instagram', 'voice'];
const DEAD = ['cancelled', 'expired'];

export interface StatsSummary {
  from: string; to: string;
  totals: {
    reservations: number; covers: number; no_shows: number; cancelled: number;
    via_ai: number; walk_ins: number; avg_party: number; no_show_rate: number;
    orders: number; order_revenue_cents: number;
  };
  /** svaki dan u razdoblju, i oni bez gostiju */
  daily: { date: string; reservations: number; covers: number; no_shows: number }[];
  sources: { source: string; reservations: number; covers: number }[];
  /** gosti po danu u tjednu (1 = pon) i satu dolaska, lokalno vrijeme */
  heat: { weekday: number; hour: number; covers: number }[];
}

function addDays(date: string, n: number) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Pregled za razdoblje [from, to] (lokalni datumi, oba uključena). Računa se u kodu, ne u SQL-u, da vremenska zona bude ista kao svugdje. */
export async function statsSummary(db: Db, r: Restaurant, from: string, to: string): Promise<StatsSummary> {
  const start = localToUtc(from, '00:00', r.timezone);
  const end = localToUtc(addDays(to, 1), '00:00', r.timezone);
  const rows = (await db.query<{ start_at: Date; party_size: number; status: string; source: string }>(
    'select start_at, party_size, status, source from reservations where restaurant_id = $1 and start_at >= $2 and start_at < $3',
    [r.id, start, end],
  )).rows;
  const orders = (await db.query<{ n: number; cents: number }>(
    `select count(*)::int as n, coalesce(sum(total_cents), 0)::int as cents from orders
      where restaurant_id = $1 and kind = 'order' and status in ('served','paid') and created_at >= $2 and created_at < $3`,
    [r.id, start, end],
  )).rows[0];

  const daily = new Map<string, { date: string; reservations: number; covers: number; no_shows: number }>();
  for (let d = from; d <= to && daily.size < 400; d = addDays(d, 1)) daily.set(d, { date: d, reservations: 0, covers: 0, no_shows: 0 });
  const sources = new Map<string, { source: string; reservations: number; covers: number }>();
  const heat = new Map<string, { weekday: number; hour: number; covers: number }>();
  const t = { reservations: 0, covers: 0, no_shows: 0, cancelled: 0, via_ai: 0, walk_ins: 0 };

  for (const x of rows) {
    if (DEAD.includes(x.status)) { t.cancelled++; continue; }
    const local = utcToLocal(new Date(x.start_at), r.timezone);
    const day = daily.get(local.date);
    if (x.status === 'no_show') {
      t.no_shows++;
      if (day) day.no_shows++;
    }
    t.reservations++;
    if (AI_SOURCES.includes(x.source)) t.via_ai++;
    if (x.source === 'walk_in') t.walk_ins++;
    const s = sources.get(x.source) ?? { source: x.source, reservations: 0, covers: 0 };
    s.reservations++;
    sources.set(x.source, s);
    if (x.status === 'no_show') continue; // nisu došli: ne broje se kao gosti
    t.covers += x.party_size;
    s.covers += x.party_size;
    if (day) { day.reservations++; day.covers += x.party_size; }
    const hour = Number(local.time.slice(0, 2));
    const k = `${local.weekday}-${hour}`;
    const h = heat.get(k) ?? { weekday: local.weekday, hour, covers: 0 };
    h.covers += x.party_size;
    heat.set(k, h);
  }
  const seatedReservations = t.reservations - t.no_shows;
  return {
    from, to,
    totals: {
      ...t,
      avg_party: seatedReservations ? Math.round((t.covers / seatedReservations) * 10) / 10 : 0,
      no_show_rate: t.reservations ? Math.round((t.no_shows / t.reservations) * 1000) / 10 : 0,
      orders: orders.n, order_revenue_cents: orders.cents,
    },
    daily: [...daily.values()],
    sources: [...sources.values()].sort((a, b) => b.reservations - a.reservations),
    heat: [...heat.values()],
  };
}
