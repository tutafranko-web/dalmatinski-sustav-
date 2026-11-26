import { describe, expect, it } from 'vitest';
import { setup } from './helpers.js';
import { buildApp } from '../src/server.js';
import { billOverages, slugify } from '../src/services/billing.js';
import { createSharedAgent } from '../src/services/voice.js';
import { processOutbox } from '../src/services/notifications.js';
import type { Billing, MetaOnboarding } from '../src/deps.js';

const SUPER = { 'x-super-key': 'super' };
const OWNER = { authorization: 'Bearer admin-key' };

function fakeBilling(): Billing & { items: any[]; checkouts: any[] } {
  const items: any[] = [], checkouts: any[] = [];
  return {
    items, checkouts,
    async createSubscriptionCheckout(i) { checkouts.push(i); return { id: `cs_sub_${checkouts.length}`, url: `https://checkout.stripe.test/sub/${i.restaurantId}` }; },
    async addInvoiceItem(i) { items.push(i); },
    async createPortalLink() { return 'https://billing.stripe.test/portal'; },
  };
}

/** "Potpis" u testu: tijelo je sam event. */
const verifyStripe = async (raw: string) => JSON.parse(raw);

describe('samoprijava i pretplata', () => {
  it('slug bez dijakritika', () => {
    expect(slugify('Konoba Đir – Šibenik')).toBe('konoba-dir-sibenik');
    expect(slugify('Ž')).toMatch(/^restoran-/);
  });

  it('bez naplate: restoran je odmah aktivan i dobije email s ključem', async () => {
    const { db, deps } = await setup();
    const app = await buildApp(db, deps);
    const bad = await app.inject({ method: 'POST', url: '/api/signup', payload: { name: 'Bistro More', email: 'vlasnik@bistro.hr' } });
    expect(bad.json().error).toBe('terms_required');
    const res = await app.inject({ method: 'POST', url: '/api/signup', payload: { name: 'Bistro More', email: 'vlasnik@bistro.hr', phone: '0911234567', acceptTerms: true } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ slug: 'bistro-more', checkoutUrl: null });
    const mail = (await db.query(`select recipient, payload from outbox where kind = 'welcome'`)).rows[0];
    expect(mail.recipient).toBe('vlasnik@bistro.hr');
    const key = /Ključ \(čuvajte ga kao lozinku\): (\S+)/.exec(mail.payload.text)![1];
    // ključ iz emaila radi u panelu
    expect((await app.inject({ url: '/api/admin/bistro-more/settings', headers: { authorization: `Bearer ${key}` } })).statusCode).toBe(200);
    // drugi isti naziv dobije novi slug
    const again = await app.inject({ method: 'POST', url: '/api/signup', payload: { name: 'Bistro More', email: 'drugi@bistro.hr', acceptTerms: true } });
    expect(again.json().slug).toBe('bistro-more-2');
  });

  it('s naplatom: čeka plaćanje → Stripe webhook aktivira → otkaz gasi javne usluge', async () => {
    const { db, deps } = await setup();
    const billing = fakeBilling();
    deps.billing = billing;
    const app = await buildApp(db, deps, { verifyStripe });
    const res = await app.inject({ method: 'POST', url: '/api/signup', payload: { name: 'Pizzeria Lav', email: 'lav@test.hr', acceptTerms: true } });
    expect(res.json().checkoutUrl).toContain('checkout.stripe.test/sub/');
    const r = (await db.query(`select * from restaurants where slug = 'pizzeria-lav'`)).rows[0];
    expect(r.subscription_status).toBe('pending');
    // dok ne plati: nema panela, nema javnih rezervacija, nema emaila s ključem
    expect((await app.inject({ url: '/api/admin/pizzeria-lav/settings', headers: { authorization: `Bearer ${r.admin_api_key}` } })).statusCode).toBe(402);
    expect((await app.inject({ url: '/api/r/pizzeria-lav/availability?date=2026-07-11&party=2' })).statusCode).toBe(402);
    expect((await db.query(`select count(*)::int n from outbox where kind = 'welcome'`)).rows[0].n).toBe(0);

    const paid = { type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer: 'cus_lav', subscription: 'sub_lav', metadata: { restaurant_id: String(r.id) } } } };
    const wh = await app.inject({ method: 'POST', url: '/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 'x' }, payload: JSON.stringify(paid) });
    expect(wh.json().handled).toBe('billing');
    // ponovljeni webhook ne šalje drugi email
    await app.inject({ method: 'POST', url: '/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 'x' }, payload: JSON.stringify(paid) });
    expect((await db.query(`select count(*)::int n from outbox where kind = 'welcome'`)).rows[0].n).toBe(1);
    expect((await db.query(`select subscription_status from restaurants where id = $1`, [r.id])).rows[0].subscription_status).toBe('trialing');
    expect((await app.inject({ url: '/api/r/pizzeria-lav' })).statusCode).toBe(200);

    const portal = await app.inject({ method: 'POST', url: '/api/admin/pizzeria-lav/billing/portal', headers: { authorization: `Bearer ${r.admin_api_key}` } });
    expect(portal.json().url).toContain('portal');

    const cancel = { type: 'customer.subscription.deleted', data: { object: { id: 'sub_lav', status: 'canceled' } } };
    await app.inject({ method: 'POST', url: '/webhooks/stripe', headers: { 'content-type': 'application/json', 'stripe-signature': 'x' }, payload: JSON.stringify(cancel) });
    const pub = await app.inject({ method: 'POST', url: '/api/r/pizzeria-lav/reservations', payload: { name: 'A', phone: '0911111111', partySize: 2, date: '2026-07-11', time: '13:00' } });
    expect(pub.statusCode).toBe(402);
    expect(pub.json().message).toContain('nazovite restoran');
    // panel i dalje radi (da vidi stare rezervacije i obnovi pretplatu)
    expect((await app.inject({ url: '/api/admin/pizzeria-lav/settings', headers: { authorization: `Bearer ${r.admin_api_key}` } })).json().subscription_status).toBe('canceled');
  });
});

describe('zajednički voice agent', () => {
  async function withVoice() {
    const ctx = await setup();
    const calls: any[] = [];
    const fetchImpl = (async (url: string, init: any) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ phone_number: '+38521555666' }), { status: 201 });
    }) as any;
    const app = await buildApp(ctx.db, ctx.deps, {
      retell: { apiKey: 'rk', agentId: 'agent_shared', terminationUri: 'opsis.pstn.twilio.com' }, fetchImpl,
    });
    return { ...ctx, app, calls };
  }
  const H = { 'x-opsis-secret': 'voice-secret' };

  it('super admin dodijeli broj → automatski uvoz u Retell s webhookom', async () => {
    const { app, calls } = await withVoice();
    const res = await app.inject({ method: 'PUT', url: '/api/super/restaurants/konoba-test/voice', headers: SUPER, payload: { number: '021 555 666' } });
    expect(res.json()).toEqual({ voice_number: '+38521555666', imported_to_retell: true });
    expect(calls[0].url).toBe('https://api.retellai.com/import-phone-number');
    expect(calls[0].body).toMatchObject({
      phone_number: '+38521555666', termination_uri: 'opsis.pstn.twilio.com', inbound_agents: [{ agent_id: 'agent_shared', weight: 1 }], nickname: 'konoba-test',
    });
    expect(calls[0].body.inbound_webhook_url).toContain('/voice/retell/inbound?secret=voice-secret');
  });

  it('restoran se prepoznaje po nazvanom broju; nepoznat broj se odbija', async () => {
    const { app } = await withVoice();
    await app.inject({ method: 'PUT', url: '/api/super/restaurants/konoba-test/voice', headers: SUPER, payload: { number: '+38521555666', import: false } });
    const inbound = await app.inject({ method: 'POST', url: '/voice/retell/inbound', headers: H, payload: { event: 'call_inbound', call_inbound: { from_number: '+385911', to_number: '+38521555666' } } });
    expect(inbound.json().call_inbound.dynamic_variables.restaurant_name).toBe('Konoba Test');
    const unknown = await app.inject({ method: 'POST', url: '/voice/retell/inbound', headers: H, payload: { call_inbound: { to_number: '+38521000999' } } });
    expect(unknown.json()).toEqual({ call_inbound: { reject: true } });
    const tool = await app.inject({ method: 'POST', url: '/voice/retell', headers: H,
      payload: { name: 'create_reservation', args: { name: 'Mate', party_size: 2, date: '2026-07-11', time: '20:00' }, call: { from_number: '+385917770000', to_number: '+38521555666' } } });
    expect(tool.json()).toMatchObject({ ok: true, status: 'confirmed' });
  });

  it('bilježi minute poziva i naplaćuje samo višak, jednom', async () => {
    const { app, db, deps, r } = await withVoice();
    const billing = fakeBilling();
    deps.billing = billing;
    await db.query(`update restaurants set billing_customer_id = 'cus_1', subscription_status = 'active' where id = $1`, [r.id]);
    await app.inject({ method: 'PUT', url: '/api/super/restaurants/konoba-test/voice', headers: SUPER, payload: { number: '+38521555666', import: false } });
    const start = Date.parse('2026-06-15T10:00:00Z');
    for (let i = 0; i < 5; i++) {
      // 5 poziva × 50 min = 250 min
      await app.inject({ method: 'POST', url: '/voice/retell/events', headers: H,
        payload: { event: 'call_ended', call: { call_id: `c${i}`, to_number: '+38521555666', from_number: '+3859100', start_timestamp: start + i * 1e7, end_timestamp: start + i * 1e7 + 50 * 60_000 } } });
    }
    // isti poziv dvaput (call_analyzed) ne broji se dvaput
    await app.inject({ method: 'POST', url: '/voice/retell/events', headers: H,
      payload: { event: 'call_analyzed', call: { call_id: 'c0', to_number: '+38521555666', start_timestamp: start, end_timestamp: start + 50 * 60_000 } } });
    deps.now = () => new Date('2026-07-01T06:00:00Z');
    const usage = await app.inject({ url: '/api/admin/konoba-test/voice', headers: OWNER });
    expect(usage.json().forwarding_codes.busy).toBe('**67*+38521555666#');
    expect(await billOverages(db, deps, deps.now())).toBe(1);
    expect(billing.items).toEqual([{ customerId: 'cus_1', amountCents: 1500, description: 'AI telefon 2026-06: 50 min iznad 200 uključenih' }]);
    expect(await billOverages(db, deps, deps.now())).toBe(0);
    expect(billing.items).toHaveLength(1);
  });

  it('skripta za postavljanje pravi LLM sa svim alatima i agenta', async () => {
    const sent: any[] = [];
    const fetchImpl = (async (url: string, init: any) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(url.endsWith('create-retell-llm') ? { llm_id: 'llm_1' } : { agent_id: 'agent_1' }), { status: 201 });
    }) as any;
    const res = await createSharedAgent({ apiKey: 'k', publicBaseUrl: 'https://app.test/', voiceSecret: 's', voiceId: 'v', languages: ['hr-HR', 'en-US'], fetchImpl });
    expect(res).toEqual({ llmId: 'llm_1', agentId: 'agent_1' });
    const tools = sent[0].body.general_tools.filter((t: any) => t.type === 'custom');
    expect(tools.map((t: any) => t.name)).toContain('create_reservation');
    expect(tools[0]).toMatchObject({ url: 'https://app.test/voice/retell', headers: { 'x-opsis-secret': 's' } });
    expect(sent[1].body).toMatchObject({ response_engine: { type: 'retell-llm', llm_id: 'llm_1' }, language: ['hr-HR', 'en-US'], webhook_url: 'https://app.test/voice/retell/events' });
  });
});

describe('WhatsApp samospajanje i čarobnjak', () => {
  it('kod iz Meta prozora → token restorana → poruke idu s tim tokenom', async () => {
    const { db, deps, r, transport } = await setup();
    const log: string[] = [];
    const meta: MetaOnboarding = {
      async exchangeCode(code) { log.push(`exchange:${code}`); return 'biz-token-1'; },
      async subscribeApp(waba, token) { log.push(`subscribe:${waba}:${token}`); },
      async registerNumber(phone, token, pin) { expect(pin).toMatch(/^\d{6}$/); log.push(`register:${phone}`); },
    };
    deps.meta = meta;
    const app = await buildApp(db, deps);
    const res = await app.inject({ method: 'POST', url: '/api/admin/konoba-test/whatsapp/connect', headers: OWNER, payload: { code: 'abc', waba_id: '111', phone_number_id: '222' } });
    expect(res.json()).toEqual({ connected: true, phoneNumberId: '222' });
    expect(log).toEqual(['exchange:abc', 'subscribe:111:biz-token-1', 'register:222']);
    await app.inject({ method: 'POST', url: '/api/r/konoba-test/reservations', payload: { name: 'A', phone: '0911111111', partySize: 2, date: '2026-07-11', time: '13:00' } });
    await processOutbox(db, deps);
    expect(transport.sent[0]).toMatchObject({ channel: 'whatsapp', token: 'biz-token-1' });
    void r;
  });

  it('popis koraka za postavljanje', async () => {
    const { db, deps } = await setup();
    const app = await buildApp(db, deps);
    const s = await app.inject({ url: '/api/admin/konoba-test/setup', headers: OWNER });
    const byKey = Object.fromEntries(s.json().steps.map((x: any) => [x.key, x.done]));
    expect(byKey).toMatchObject({ hours: true, tables: true, menu: false, review: true, test: false });
    expect(s.json().done).toBe(false);
  });
});
