import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { Db } from './db.js';
import type { Deps } from './deps.js';
import { findAvailability, getRestaurantBySlug, openingWindows } from './services/availability.js';
import {
  cancelReservation, createReservation, getByCode, listForDay, modifyReservation, setStatus, verifyGuest, confirmGuarantee, decideReview, guaranteeRedirect,
  createWalkIn, moveTable, setReservationNotes,
} from './services/reservations.js';
import { anonymizeGuest, guestHistory, listGuests, updateGuest } from './services/guests.js';
import { statsSummary } from './services/stats.js';
import { qrSvg } from './services/qr.js';
import { onWhatsAppStatus } from './services/notifications.js';
import { AppError, type Restaurant } from './services/types.js';
import { isValidDate, utcToLocal } from './time.js';
import { fallbackReply, runChat } from './ai/chatbot.js';
import { executeTool } from './ai/tools.js';
import { adminMenu, deleteMenuItem, openOrders, placeOrder, publicMenu, setOrderStatus, tableByQr, upsertMenuItem } from './services/orders.js';
import { issueInvoice } from './fiscal/invoices.js';
import type { CisSender } from './fiscal/cis.js';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

declare module 'fastify' {
  interface FastifyRequest { rawBody?: string }
}

export interface AppOptions {
  /** Stripe: provjera potpisa i čitanje setup sessiona (null = webhook isključen). */
  stripeWebhook?: ((rawBody: string, signature: string) => Promise<{ sessionId: string; paymentMethodId: string; customerId: string | null } | null>) | null;
  cisSender?: CisSender | null;
  logger?: boolean;
}

/** Jednostavno ograničenje zahtjeva po IP-u. */
function rateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string) => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) {
      hits.set(key, { n: 1, reset: now + windowMs });
      if (hits.size > 10_000) hits.clear();
      return;
    }
    if (++h.n > limit) throw new AppError(429, 'rate_limited', 'Previše zahtjeva, pokušajte malo kasnije');
  };
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function buildApp(db: Db, deps: Deps, opts: AppOptions = {}): Promise<FastifyInstance & { pending: Set<Promise<unknown>> }> {
  // u log ne idu parametri iz adrese: tamo su mobitel gosta (?contact=) i tajni ključ (?secret=)
  const logger = opts.logger
    ? { serializers: { req: (req: any) => ({ method: req.method, url: String(req.url).split('?')[0], ip: req.ip }) } }
    : false;
  const app = Fastify({ logger, bodyLimit: 256 * 1024, trustProxy: true }) as any;
  app.pending = new Set<Promise<unknown>>();
  const track = (p: Promise<unknown>) => {
    app.pending.add(p);
    p.catch((e) => app.log.error(e)).finally(() => app.pending.delete(p));
  };

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req: FastifyRequest, body: string, done: any) => {
    req.rawBody = body;
    try {
      done(null, body ? JSON.parse(body) : {});
    } catch {
      done(new AppError(400, 'bad_json', 'Neispravan JSON'), undefined);
    }
  });

  app.setErrorHandler((err: any, _req: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: err.code, message: err.message, ...(err as any).alternatives ? { alternatives: (err as any).alternatives } : {} });
    }
    if (err.validation) return reply.status(400).send({ error: 'validation', message: err.message });
    app.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Greška na serveru' });
  });

  // chat.js radi na webu restorana (druga domena) i zove /api/r/…; panel, webhookovi i voice ostaju zatvoreni
  await app.register(fastifyCors, {
    delegator: (req: any, cb: any) => cb(null, { origin: String(req.url).startsWith('/api/r/'), methods: ['GET', 'POST'], maxAge: 86400 }),
  });
  await app.register(fastifyStatic, { root: PUBLIC_DIR, prefix: '/static/' });

  const chatLimit = rateLimiter(20, 60_000);
  const bookLimit = rateLimiter(10, 60_000);
  const orderLimit = rateLimiter(20, 60_000);

  // ---------- stranice ----------
  app.get('/health', async (_req: any, reply: any) => {
    try {
      await db.query('select 1');
      return { ok: true };
    } catch {
      return reply.status(503).send({ ok: false, error: 'db' });
    }
  });
  app.get('/b/:slug', (_req: any, reply: any) => reply.sendFile('book.html'));
  app.get('/m/:token', (_req: any, reply: any) => reply.sendFile('menu.html'));
  // kratki link iz SMS-a za garanciju karticom
  app.get('/g/:code', async (req: any, reply: any) => {
    bookLimit(req.ip);
    const url = await guaranteeRedirect(db, deps, String(req.params.code));
    if (!url) throw new AppError(404, 'reservation_not_found', 'Rezervacija nije pronađena');
    return reply.redirect(url, 302);
  });
  app.get('/admin', (_req: any, reply: any) => reply.sendFile('admin.html'));
  app.get('/favicon.ico', (_req: any, reply: any) => reply.redirect('/static/favicon.svg', 301));
  app.get('/', (_req: any, reply: any) => reply.sendFile('index.html'));
  app.get('/widget.js', (_req: any, reply: any) => reply.type('application/javascript').sendFile('widget.js'));
  // QR kodovi za ispis: meni po stolu i link za rezervaciju (sadrže samo javne adrese)
  const svg = (reply: any, body: string) => reply.type('image/svg+xml').header('cache-control', 'public, max-age=86400').send(body);
  app.get('/qr/m/:token', async (req: any, reply: any) => {
    const t = await tableByQr(db, String(req.params.token));
    return svg(reply, await qrSvg(`${deps.config.publicBaseUrl}/m/${t.qr_token}`));
  });
  app.get('/qr/b/:slug', async (req: any, reply: any) => {
    const r = await getRestaurantBySlug(db, String(req.params.slug));
    return svg(reply, await qrSvg(`${deps.config.publicBaseUrl}/b/${r.slug}`));
  });
  app.get('/chat.js', (_req: any, reply: any) => reply.type('application/javascript').sendFile('chat.js'));

  // ---------- javni API ----------
  app.get('/api/r/:slug', async (req: any) => {
    const r = await getRestaurantBySlug(db, req.params.slug);
    const zones = (await db.query('select distinct zone from dining_tables where restaurant_id = $1 and active', [r.id])).rows.map((z: any) => z.zone);
    return {
      name: r.name, address: r.address, phone: r.phone, zones, max_party_size: r.max_party_size,
      guarantee: r.guarantee_mode === 'card' ? { min_party: r.guarantee_min_party, fee_cents: r.no_show_fee_cents } : null,
      opening_hours: r.opening_hours, closed_dates: r.closed_dates, chat_enabled: !!deps.llm,
      duration_minutes: r.default_duration_minutes, timezone: r.timezone,
      has_menu: (await db.query('select 1 from menu_items where restaurant_id = $1 and available and archived_at is null limit 1', [r.id])).rows.length > 0,
    };
  });

  // jelovnik za stranicu rezervacije (bez naručivanja: to ide samo preko QR koda na stolu)
  app.get('/api/r/:slug/menu', async (req: any) => {
    const r = await getRestaurantBySlug(db, req.params.slug);
    return { menu: await publicMenu(db, r.id) };
  });

  app.get('/api/r/:slug/availability', async (req: any) => {
    const r = await getRestaurantBySlug(db, req.params.slug);
    const slots = await findAvailability(db, r, {
      date: String(req.query.date ?? ''), partySize: Number(req.query.party ?? 2), zone: req.query.zone || undefined, now: deps.now(),
    });
    return { slots };
  });

  app.post('/api/r/:slug/reservations', async (req: any, reply: any) => {
    bookLimit(req.ip);
    const r = await getRestaurantBySlug(db, req.params.slug);
    const b = req.body ?? {};
    if (b.website) throw new AppError(400, 'spam', 'Odbijeno'); // honeypot polje
    const { reservation, guaranteeUrl, notified } = await createReservation(db, deps, r, {
      name: b.name, phone: b.phone, email: b.email, language: b.language, partySize: Number(b.partySize),
      date: b.date, time: b.time, zone: b.zone, notes: b.notes, source: 'web', marketingConsent: !!b.marketingConsent,
    });
    return reply.status(201).send({
      code: reservation.code, status: reservation.status, guaranteeUrl, notified, party_size: reservation.party_size,
      start_at: reservation.start_at, end_at: reservation.end_at, ...utcToLocal(new Date(reservation.start_at), r.timezone),
    });
  });

  app.get('/api/r/:slug/reservations/:code', async (req: any) => {
    const r = await getRestaurantBySlug(db, req.params.slug);
    const res = await getByCode(db, r, req.params.code);
    await verifyGuest(db, res, req.query.contact);
    return {
      code: res.code, status: res.status, party_size: res.party_size, start_at: res.start_at, end_at: res.end_at,
      ...utcToLocal(new Date(res.start_at), r.timezone),
    };
  });

  app.post('/api/r/:slug/reservations/:code/cancel', async (req: any) => {
    bookLimit(req.ip);
    const r = await getRestaurantBySlug(db, req.params.slug);
    const res = await cancelReservation(db, deps, r, req.params.code, req.body?.contact);
    return { code: res.code, status: res.status };
  });

  app.post('/api/r/:slug/reservations/:code/modify', async (req: any) => {
    bookLimit(req.ip);
    const r = await getRestaurantBySlug(db, req.params.slug);
    const b = req.body ?? {};
    const res = await modifyReservation(db, deps, r, req.params.code, b.contact, {
      date: b.date, time: b.time, partySize: b.partySize ? Number(b.partySize) : undefined,
    });
    return {
      code: res.code, status: res.status, party_size: res.party_size, start_at: res.start_at, end_at: res.end_at, notified: res.notified,
      ...utcToLocal(new Date(res.start_at), r.timezone),
    };
  });

  app.post('/api/r/:slug/chat', async (req: any) => {
    chatLimit(req.ip);
    const r = await getRestaurantBySlug(db, req.params.slug);
    const sessionId = String(req.body?.sessionId ?? '');
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId)) throw new AppError(400, 'bad_session', 'Neispravan sessionId');
    const { reply } = await runChat(db, deps, r, { channel: 'chat', externalId: sessionId, text: String(req.body?.message ?? '') });
    return { reply };
  });

  // ---------- faza 2: QR meni ----------
  app.get('/api/qr/:token', async (req: any) => {
    const t = await tableByQr(db, req.params.token);
    return { restaurant: t.restaurant_name, table: t.label, menu: await publicMenu(db, t.restaurant_id) };
  });

  app.post('/api/qr/:token/orders', async (req: any, reply: any) => {
    orderLimit(req.ip);
    const o = await placeOrder(db, req.params.token, req.body ?? {});
    return reply.status(201).send({ id: o.id, kind: o.kind, total_cents: o.total_cents });
  });

  // ---------- admin (panel restorana) ----------
  /** Vlasnik (admin_api_key ili staff ključ s ulogom owner) može sve; konobar (staff) samo rezervacije, narudžbe i račune. */
  async function admin(req: any, ownerOnly = false): Promise<Restaurant> {
    const r = await getRestaurantBySlug(db, req.params.slug);
    const auth = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (!auth) throw new AppError(401, 'unauthorized', 'Neispravan ključ');
    let role: 'owner' | 'staff' | null = safeEqual(auth, r.admin_api_key) ? 'owner' : null;
    if (!role) {
      const k = (await db.query<{ role: 'owner' | 'staff'; name: string }>(
        'select role, name from staff_keys where restaurant_id = $1 and key_hash = $2 and revoked_at is null',
        [r.id, createHash('sha256').update(auth).digest('hex')],
      )).rows[0];
      if (k) { role = k.role; req.staffName = k.name; }
    }
    if (!role) throw new AppError(401, 'unauthorized', 'Neispravan ključ');
    if (ownerOnly && role !== 'owner') throw new AppError(403, 'owner_only', 'Ovo može samo vlasnik');
    req.role = role;
    return r;
  }

  app.get('/api/admin/:slug/reservations', async (req: any) => {
    const r = await admin(req);
    const date = String(req.query.date ?? utcToLocal(deps.now(), r.timezone).date);
    // windows: radno vrijeme tog dana u minutama od ponoći (za raspored stolova po satima)
    return { date, windows: isValidDate(date) ? openingWindows(r, date) : [], reservations: await listForDay(db, r, date) };
  });

  // gost bez rezervacije: konobar ga posjeda odmah
  app.post('/api/admin/:slug/walkin', async (req: any, reply: any) => {
    const r = await admin(req);
    const b = req.body ?? {};
    return reply.status(201).send(await createWalkIn(db, deps, r, {
      partySize: Number(b.partySize), tableId: b.tableId ? Number(b.tableId) : null, name: b.name, phone: b.phone, notes: b.notes, force: b.force === true,
    }));
  });

  app.post('/api/admin/:slug/reservations/:id/table', async (req: any) => {
    const r = await admin(req);
    return moveTable(db, r, Number(req.params.id), Number(req.body?.tableId), { force: req.body?.force === true });
  });

  app.post('/api/admin/:slug/reservations/:id/notes', async (req: any) => {
    const r = await admin(req);
    return setReservationNotes(db, r, Number(req.params.id), req.body?.notes);
  });

  // gosti: konobar vidi tko dolazi i zapisuje bilješke (alergije, omiljeni stol); brisanje podataka ostaje vlasniku
  app.get('/api/admin/:slug/guests', async (req: any) => {
    const r = await admin(req);
    return listGuests(db, r, { q: req.query.q, now: deps.now() });
  });
  app.get('/api/admin/:slug/guests/:id/reservations', async (req: any) => {
    const r = await admin(req);
    return guestHistory(db, r, Number(req.params.id));
  });
  app.put('/api/admin/:slug/guests/:id', async (req: any) => {
    const r = await admin(req);
    return updateGuest(db, r, Number(req.params.id), req.body ?? {});
  });

  app.post('/api/admin/:slug/reservations', async (req: any, reply: any) => {
    const r = await admin(req);
    const b = req.body ?? {};
    const { reservation } = await createReservation(db, deps, r, {
      name: b.name, phone: b.phone, email: b.email, language: b.language, partySize: Number(b.partySize),
      date: b.date, time: b.time, zone: b.zone, notes: b.notes, source: b.source ?? 'admin', skipGuarantee: b.skipGuarantee !== false,
    });
    return reply.status(201).send(reservation);
  });

  app.post('/api/admin/:slug/reservations/:id/status', async (req: any) => {
    const r = await admin(req);
    return setStatus(db, deps, r, Number(req.params.id), req.body?.status);
  });

  // konobar: { "approve": true } = pošalji gostu upit za Google recenziju, false = ne šalji
  app.post('/api/admin/:slug/reservations/:id/review', async (req: any) => {
    const r = await admin(req);
    return decideReview(db, r, Number(req.params.id), req.body?.approve === true);
  });

  app.post('/api/admin/:slug/reservations/:code/cancel', async (req: any) => {
    const r = await admin(req);
    return cancelReservation(db, deps, r, req.params.code, null, { admin: true });
  });

  app.post('/api/admin/:slug/reservations/:code/modify', async (req: any) => {
    const r = await admin(req);
    const b = req.body ?? {};
    return modifyReservation(db, deps, r, req.params.code, null, { date: b.date, time: b.time, partySize: b.partySize ? Number(b.partySize) : undefined }, { admin: true });
  });

  const SETTINGS = ['name', 'phone', 'email', 'address', 'default_language', 'opening_hours', 'closed_dates', 'slot_minutes',
    'default_duration_minutes', 'max_party_size', 'guarantee_mode', 'guarantee_min_party', 'no_show_fee_cents',
    'google_review_url', 'review_mode', 'info_text'] as const;
  const JSON_SETTINGS = new Set(['opening_hours', 'closed_dates']);

  app.get('/api/admin/:slug/settings', async (req: any) => {
    const r = await admin(req);
    const out: any = {};
    for (const k of SETTINGS) out[k] = (r as any)[k];
    out.slug = r.slug;
    out.stripe_connected = !!r.stripe_account_id;
    out.whatsapp_connected = !!r.whatsapp_phone_number_id;
    out.sms_enabled = r.sms_mode === 'fallback' && !!deps.transport.sendSms;
    out.fiscal_enabled = !!(r.fiscal_config as any)?.enabled;
    out.role = req.role;
    return out;
  });

  app.put('/api/admin/:slug/settings', async (req: any) => {
    const r = await admin(req, true);
    const b = req.body ?? {};
    const sets: string[] = [], vals: unknown[] = [r.id];
    for (const k of SETTINGS) {
      if (!(k in b)) continue;
      if (k === 'guarantee_mode' && !['none', 'card'].includes(b[k])) throw new AppError(400, 'bad_value', 'guarantee_mode: none ili card');
      if (k === 'review_mode' && !['approval', 'auto', 'off'].includes(b[k])) throw new AppError(400, 'bad_value', 'review_mode: approval, auto ili off');
      if (k === 'opening_hours' && (!Array.isArray(b[k]) || b[k].some((p: any) => !(p.weekday >= 1 && p.weekday <= 7) || !/^\d{2}:\d{2}$/.test(p.open) || !/^\d{2}:\d{2}$/.test(p.close))))
        throw new AppError(400, 'bad_value', 'Neispravno radno vrijeme');
      vals.push(JSON_SETTINGS.has(k) ? JSON.stringify(b[k]) : b[k]);
      sets.push(`${k} = $${vals.length}`);
    }
    if (!sets.length) return { updated: 0 };
    await db.query(`update restaurants set ${sets.join(', ')} where id = $1`, vals);
    return { updated: sets.length };
  });

  app.get('/api/admin/:slug/tables', async (req: any) => {
    const r = await admin(req);
    return (await db.query('select * from dining_tables where restaurant_id = $1 order by zone, label', [r.id])).rows;
  });

  app.post('/api/admin/:slug/tables', async (req: any, reply: any) => {
    const r = await admin(req, true);
    const b = req.body ?? {};
    // spojeni stolovi: { "combo_of": [3, 4], "max_capacity": 8 } — oznaka i zona se mogu izostaviti
    let combo: number[] | null = null, zone = b.zone ?? 'unutra', label = b.label;
    if (Array.isArray(b.combo_of)) {
      combo = [...new Set(b.combo_of.map(Number))] as number[];
      if (combo.length < 2) throw new AppError(400, 'bad_combo', 'Spajaju se barem 2 stola');
      const parts = (await db.query('select id, label, zone, combo_of from dining_tables where restaurant_id = $1 and id = any($2)', [r.id, combo])).rows;
      if (parts.length !== combo.length || parts.some((p: any) => p.combo_of)) throw new AppError(400, 'bad_combo', 'Spajaju se samo postojeći obični stolovi');
      label = label || parts.map((p: any) => p.label).join('+');
      zone = b.zone ?? parts[0].zone;
    }
    if (!label || !(b.max_capacity >= 1)) throw new AppError(400, 'bad_table', 'Treba oznaka i kapacitet');
    const row = (await db.query(
      `insert into dining_tables (restaurant_id, label, zone, min_capacity, max_capacity, qr_token, combo_of) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [r.id, String(label), zone, b.min_capacity ?? 1, b.max_capacity, randomBytes(9).toString('base64url'), combo],
    )).rows[0];
    return reply.status(201).send(row);
  });

  app.put('/api/admin/:slug/tables/:id', async (req: any) => {
    const r = await admin(req, true);
    const b = req.body ?? {};
    const row = (await db.query(
      `update dining_tables set label = coalesce($3, label), zone = coalesce($4, zone), min_capacity = coalesce($5, min_capacity),
         max_capacity = coalesce($6, max_capacity), active = coalesce($7, active) where id = $1 and restaurant_id = $2 returning *`,
      [Number(req.params.id), r.id, b.label ?? null, b.zone ?? null, b.min_capacity ?? null, b.max_capacity ?? null, b.active ?? null],
    )).rows[0];
    if (!row) throw new AppError(404, 'table_not_found', 'Stol ne postoji');
    return row;
  });

  app.get('/api/admin/:slug/menu', async (req: any) => {
    const r = await admin(req);
    return adminMenu(db, r.id);
  });
  app.delete('/api/admin/:slug/menu/:id', async (req: any) => {
    const r = await admin(req, true);
    return { result: await deleteMenuItem(db, r.id, Number(req.params.id)) };
  });
  app.post('/api/admin/:slug/menu', async (req: any, reply: any) => {
    const r = await admin(req, true);
    return reply.status(201).send(await upsertMenuItem(db, r.id, req.body ?? {}));
  });
  app.put('/api/admin/:slug/menu/:id', async (req: any) => {
    const r = await admin(req, true);
    return upsertMenuItem(db, r.id, req.body ?? {}, Number(req.params.id));
  });

  app.get('/api/admin/:slug/orders', async (req: any) => {
    const r = await admin(req);
    return openOrders(db, r.id);
  });
  app.post('/api/admin/:slug/orders/:id/status', async (req: any) => {
    const r = await admin(req);
    return setOrderStatus(db, r.id, Number(req.params.id), req.body?.status);
  });

  app.post('/api/admin/:slug/invoices', async (req: any, reply: any) => {
    const r = await admin(req);
    if (!opts.cisSender) throw new AppError(503, 'fiscal_unavailable', 'Fiskalizacija nije podešena na serveru');
    const b = req.body ?? {};
    if (!['G', 'K', 'T', 'O'].includes(b.paymentMethod)) throw new AppError(400, 'bad_payment', 'Način plaćanja: G, K, T ili O');
    const inv = await issueInvoice(db, r, {
      orderIds: (b.orderIds ?? []).map(Number), paymentMethod: b.paymentMethod, operatorOib: String(b.operatorOib ?? ''), now: deps.now(),
    }, { send: opts.cisSender });
    return reply.status(201).send(inv);
  });

  app.get('/api/admin/:slug/stats', async (req: any) => {
    const r = await admin(req, true);
    const from = req.query.from ? new Date(req.query.from) : new Date(deps.now().getTime() - 30 * 86400_000);
    const to = req.query.to ? new Date(req.query.to) : deps.now();
    const rows = (await db.query(
      `select source, status, count(*)::int as n, sum(party_size)::int as covers from reservations
        where restaurant_id = $1 and start_at >= $2 and start_at < $3 group by source, status order by source, status`,
      [r.id, from, to],
    )).rows;
    // pregled po danima za grafove: ?days=7|30|90 (zadnjih N dana, uključujući danas)
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 366);
    const today = utcToLocal(deps.now(), r.timezone).date;
    const first = utcToLocal(new Date(deps.now().getTime() - (days - 1) * 86400_000), r.timezone).date;
    return { from, to, rows, summary: await statsSummary(db, r, first, today) };
  });

  // ---------- super admin (ti) ----------
  app.post('/api/super/restaurants', async (req: any, reply: any) => {
    const key = String(req.headers['x-super-key'] ?? '');
    if (!deps.config.superAdminKey || !safeEqual(key, deps.config.superAdminKey)) throw new AppError(401, 'unauthorized', 'Neispravan ključ');
    const b = req.body ?? {};
    if (!/^[a-z0-9-]{3,40}$/.test(b.slug ?? '')) throw new AppError(400, 'bad_slug', 'slug: mala slova, brojke i crtice');
    const adminKey = randomBytes(24).toString('base64url');
    const r = (await db.query(
      `insert into restaurants (slug, name, phone, email, address, opening_hours, admin_api_key)
       values ($1,$2,$3,$4,$5,$6,$7) returning id, slug, name`,
      [b.slug, b.name ?? b.slug, b.phone ?? null, b.email ?? null, b.address ?? null, JSON.stringify(b.opening_hours ?? []), adminKey],
    )).rows[0];
    return reply.status(201).send({ ...r, admin_api_key: adminKey });
  });

  // ---------- Stripe Connect: vlasnik spaja svoj Stripe račun ----------
  app.post('/api/admin/:slug/stripe/onboard', async (req: any) => {
    const r = await admin(req, true);
    if (!deps.payments) throw new AppError(503, 'stripe_disabled', 'Stripe nije podešen na serveru');
    const back = `${deps.config.publicBaseUrl}/admin`;
    const { accountId, url } = await deps.payments.createOnboardingLink({ restaurant: r, returnUrl: back, refreshUrl: back });
    if (accountId !== r.stripe_account_id) await db.query('update restaurants set stripe_account_id = $2 where id = $1', [r.id, accountId]);
    return { url };
  });

  // ---------- ključevi za osoblje ----------
  app.get('/api/admin/:slug/staff', async (req: any) => {
    const r = await admin(req, true);
    return (await db.query('select id, name, role, created_at, revoked_at from staff_keys where restaurant_id = $1 order by id', [r.id])).rows;
  });
  app.post('/api/admin/:slug/staff', async (req: any, reply: any) => {
    const r = await admin(req, true);
    const name = String(req.body?.name ?? '').trim();
    const role = req.body?.role === 'owner' ? 'owner' : 'staff';
    if (!name) throw new AppError(400, 'name_required', 'Upiši ime (npr. "Konobar Ivan")');
    const key = randomBytes(18).toString('base64url');
    const row = (await db.query(
      'insert into staff_keys (restaurant_id, name, role, key_hash) values ($1,$2,$3,$4) returning id, name, role',
      [r.id, name, role, createHash('sha256').update(key).digest('hex')],
    )).rows[0];
    // ključ se prikazuje samo jednom
    return reply.status(201).send({ ...row, key });
  });
  app.post('/api/admin/:slug/staff/:id/revoke', async (req: any) => {
    const r = await admin(req, true);
    const row = (await db.query('update staff_keys set revoked_at = now() where id = $1 and restaurant_id = $2 returning id', [Number(req.params.id), r.id])).rows[0];
    if (!row) throw new AppError(404, 'not_found', 'Ključ ne postoji');
    return { revoked: true };
  });

  // ---------- GDPR: brisanje podataka gosta na zahtjev ----------
  app.post('/api/admin/:slug/guests/anonymize', async (req: any) => {
    const r = await admin(req, true);
    return { anonymized: await anonymizeGuest(db, r, req.body ?? {}) };
  });

  // ---------- super admin: spajanje servisa za restoran ----------
  app.put('/api/super/restaurants/:slug/integrations', async (req: any) => {
    const key = String(req.headers['x-super-key'] ?? '');
    if (!deps.config.superAdminKey || !safeEqual(key, deps.config.superAdminKey)) throw new AppError(401, 'unauthorized', 'Neispravan ključ');
    const r = await getRestaurantBySlug(db, req.params.slug);
    const b = req.body ?? {};
    const fields = ['whatsapp_phone_number_id', 'instagram_account_id', 'stripe_account_id', 'fiscal_config', 'sms_mode', 'sms_sender', 'sms_daily_limit'] as const;
    const sets: string[] = [], vals: unknown[] = [r.id];
    for (const f of fields) {
      if (!(f in b)) continue;
      if (f === 'stripe_account_id' && b[f] !== null && !/^acct_[A-Za-z0-9]+$/.test(b[f])) throw new AppError(400, 'bad_value', 'stripe_account_id mora počinjati s acct_');
      if (f === 'sms_mode' && !['off', 'fallback'].includes(b[f])) throw new AppError(400, 'bad_value', 'sms_mode: off ili fallback');
      if (f === 'sms_sender' && b[f] !== null && b[f] !== '' && !/^(?=.*[A-Za-z])[A-Za-z0-9]{3,11}$/.test(b[f]))
        throw new AppError(400, 'bad_value', 'sms_sender: 3 do 11 slova i brojki, bez razmaka');
      if (f === 'sms_daily_limit' && !(Number.isInteger(b[f]) && b[f] >= 0 && b[f] <= 10_000)) throw new AppError(400, 'bad_value', 'sms_daily_limit: cijeli broj 0–10000');
      vals.push(f === 'fiscal_config' ? JSON.stringify(b[f] ?? {}) : b[f] === '' ? null : b[f]);
      sets.push(`${f} = $${vals.length}`);
    }
    if (!sets.length) throw new AppError(400, 'nothing', 'Nema polja za promjenu');
    await db.query(`update restaurants set ${sets.join(', ')} where id = $1`, vals);
    return { updated: sets.length };
  });

  // ---------- Stripe webhook ----------
  app.post('/webhooks/stripe', async (req: any) => {
    if (!opts.stripeWebhook) throw new AppError(503, 'stripe_disabled', 'Stripe nije podešen');
    const sig = String(req.headers['stripe-signature'] ?? '');
    const info = await opts.stripeWebhook(req.rawBody ?? '', sig);
    if (info) await confirmGuarantee(db, deps, info.sessionId, info.paymentMethodId, info.customerId);
    return { received: true };
  });

  // ---------- Meta webhook (WhatsApp + Instagram) ----------
  app.get('/webhooks/meta', async (req: any, reply: any) => {
    const q = req.query ?? {};
    if (q['hub.mode'] === 'subscribe' && deps.config.metaVerifyToken && q['hub.verify_token'] === deps.config.metaVerifyToken) return reply.type('text/plain').send(q['hub.challenge']);
    return reply.status(403).send('forbidden');
  });

  app.post('/webhooks/meta', async (req: any) => {
    // bez potpisa nitko: broj pošiljatelja iz ove poruke služi kao dokaz identiteta gosta
    if (!deps.config.metaAppSecret) throw new AppError(503, 'meta_disabled', 'WhatsApp/Instagram nije podešen (META_APP_SECRET)');
    const sig = String(req.headers['x-hub-signature-256'] ?? '');
    const expected = 'sha256=' + createHmac('sha256', deps.config.metaAppSecret).update(req.rawBody ?? '').digest('hex');
    if (!safeEqual(sig, expected)) throw new AppError(401, 'bad_signature', 'Neispravan potpis');
    const body = req.body ?? {};
    // odgovaramo odmah (Meta inače ponavlja), poruke obrađujemo u pozadini
    track(handleMeta(body));
    return { received: true };
  });

  /** Na WhatsAppu i Instagramu gost ne vidi grešku servera, pa uvijek dobije barem broj telefona restorana. */
  async function chatOrFallback(r: Restaurant, o: Parameters<typeof runChat>[3]): Promise<string> {
    try {
      return (await runChat(db, deps, r, o)).reply;
    } catch (e) {
      app.log.error(e);
      return fallbackReply(r);
    }
  }

  async function handleMeta(body: any) {
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry ?? []) {
        for (const ch of entry.changes ?? []) {
          const v = ch.value ?? {};
          const phoneNumberId = v.metadata?.phone_number_id;
          if (!phoneNumberId || !(v.messages || v.statuses)) continue;
          const r = (await db.query<Restaurant>('select * from restaurants where whatsapp_phone_number_id = $1', [phoneNumberId])).rows[0];
          if (!r) continue;
          // dostava naših poruka: neuspjela ide SMS-om
          for (const st of v.statuses ?? []) await onWhatsAppStatus(db, deps, r, st);
          for (const m of v.messages ?? []) {
            const from = '+' + String(m.from);
            await db.query('update guests set whatsapp_ok = true where restaurant_id = $1 and phone = $2', [r.id, from]);
            const text = m.type === 'text' ? m.text?.body
              : m.type === 'button' ? m.button?.text
              : m.type === 'interactive' ? (m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title)
              : null;
            const reply = text
              ? (await chatOrFallback(r, { channel: 'whatsapp', externalId: from, text, callerPhone: from }))
              : 'Za sada razumijem samo tekstualne poruke. Napišite nam što trebate.';
            await deps.transport.sendWhatsApp({ phoneNumberId, to: from, body: { type: 'text', text: reply } });
          }
        }
      }
    } else if (body.object === 'instagram' || body.object === 'page') {
      for (const entry of body.entry ?? []) {
        const r = (await db.query<Restaurant>('select * from restaurants where instagram_account_id = $1', [String(entry.id)])).rows[0];
        if (!r) continue;
        for (const ev of entry.messaging ?? []) {
          if (ev.message?.is_echo || !ev.message?.text) continue;
          const sender = String(ev.sender?.id);
          const reply = await chatOrFallback(r, { channel: 'instagram', externalId: sender, text: ev.message.text });
          await deps.transport.sendInstagram({ igAccountId: r.instagram_account_id!, recipientId: sender, text: reply });
        }
      }
    }
  }

  // ---------- Voice agent (Retell custom functions) ----------
  /**
   * Retell potpisuje zahtjeve: X-Retell-Signature = "v=<ms>,d=<hex>", d = HMAC-SHA256(raw_body + v) s Retell API ključem.
   * Prihvaćamo potpis (ako je RETELL_API_KEY postavljen) ili naš header x-opsis-secret.
   */
  function voiceAuth(req: any) {
    const sigHeader = String(req.headers['x-retell-signature'] ?? '');
    const key = deps.config.retellApiKey;
    if (key && sigHeader) {
      const m = /^v=(\d+),d=([0-9a-f]+)$/i.exec(sigHeader);
      if (m && Math.abs(Date.now() - Number(m[1])) < 5 * 60_000) {
        const expected = createHmac('sha256', key).update((req.rawBody ?? '') + m[1]).digest('hex');
        if (safeEqual(expected, m[2].toLowerCase())) return;
      }
      throw new AppError(401, 'bad_signature', 'Neispravan Retell potpis');
    }
    const s = String(req.headers['x-opsis-secret'] ?? req.query?.secret ?? '');
    if (!deps.config.voiceSharedSecret || !safeEqual(s, deps.config.voiceSharedSecret)) throw new AppError(401, 'unauthorized', 'Neispravan ključ');
  }

  // Retell šalje { name, args, call: { from_number, ... } } na URL funkcije
  app.post('/voice/retell/:slug', async (req: any) => {
    voiceAuth(req);
    const r = await getRestaurantBySlug(db, req.params.slug);
    const b = req.body ?? {};
    // zadani format: { name, args, call }; uz "Payload: args only" tijelo su samo argumenti, a ime ide u ?fn=
    const name = String(b.name ?? req.query.fn ?? '');
    const args = b.args ?? (b.name ? {} : b);
    const callerPhone = b.call?.from_number ?? null;
    return executeTool(db, deps, r, name, args, { source: 'voice', callerPhone });
  });

  // Retell inbound webhook: dinamičke varijable za prompt (današnji datum, radno vrijeme...)
  app.post('/voice/retell/:slug/inbound', async (req: any) => {
    voiceAuth(req);
    const r = await getRestaurantBySlug(db, req.params.slug);
    const local = utcToLocal(deps.now(), r.timezone);
    const DAYS = ['', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota', 'nedjelja'];
    return {
      call_inbound: {
        dynamic_variables: {
          restaurant_name: r.name,
          today: `${DAYS[local.weekday]}, ${local.date}`,
          now_time: local.time,
          restaurant_phone: r.phone ?? '',
          max_party_size: String(r.max_party_size),
        },
      },
    };
  });

  return app;
}
