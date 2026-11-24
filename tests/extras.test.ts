import { describe, expect, it } from 'vitest';
import { setup } from './helpers.js';
import { buildApp } from '../src/server.js';
import { createReservation } from '../src/services/reservations.js';
import { findAvailability } from '../src/services/availability.js';

const OWNER = { authorization: 'Bearer admin-key' };

describe('spojeni stolovi', () => {
  it('grupa od 8 dobije stolove 3+T1, a spojeni stolovi i pojedinačni se međusobno blokiraju', async () => {
    const { db, deps, r } = await setup();
    const app = await buildApp(db, deps);
    const ids = (await db.query(`select id, label from dining_tables where label in ('3','T1') order by label`)).rows;
    const combo = await app.inject({ method: 'POST', url: '/api/admin/konoba-test/tables', headers: OWNER,
      payload: { combo_of: ids.map((x: any) => x.id), min_capacity: 7, max_capacity: 10 } });
    expect(combo.statusCode).toBe(201);
    expect(combo.json()).toMatchObject({ label: '3+T1', zone: 'unutra' });

    // bez spajanja nema mjesta za 8
    expect((await findAvailability(db, r, { date: '2026-07-11', partySize: 8, now: deps.now() })).length).toBeGreaterThan(0);
    const big = await createReservation(db, deps, r, { name: 'Grupa', phone: '0911000008', partySize: 8, date: '2026-07-11', time: '20:00', source: 'web' });
    expect(big.reservation.table_id).toBe(combo.json().id);

    // stol 3 i terasa su sad zauzeti u 20:00 → za 4 osobe nema mjesta
    await expect(createReservation(db, deps, r, { name: 'Četvero', phone: '0911000004', partySize: 4, date: '2026-07-11', time: '20:00', source: 'web' }))
      .rejects.toMatchObject({ code: 'no_table' });
    // a manji stolovi su slobodni
    const two = await createReservation(db, deps, r, { name: 'Dvoje', phone: '0911000002', partySize: 2, date: '2026-07-11', time: '20:00', source: 'web' });
    expect(two.reservation.status).toBe('confirmed');
  });

  it('pojedinačni stol zauzet → kombinacija nije slobodna', async () => {
    const { db, deps, r } = await setup();
    const app = await buildApp(db, deps);
    const ids = (await db.query(`select id from dining_tables where label in ('3','T1')`)).rows.map((x: any) => x.id);
    await app.inject({ method: 'POST', url: '/api/admin/konoba-test/tables', headers: OWNER, payload: { combo_of: ids, min_capacity: 7, max_capacity: 10 } });
    await createReservation(db, deps, r, { name: 'A', phone: '0911000001', partySize: 4, date: '2026-07-11', time: '20:00', source: 'web' });
    await expect(createReservation(db, deps, r, { name: 'Grupa', phone: '0911000008', partySize: 8, date: '2026-07-11', time: '20:00', source: 'web' }))
      .rejects.toMatchObject({ code: 'no_table' });
  });

  it('ne spaja nepostojeće ili već spojene stolove', async () => {
    const { db, deps } = await setup();
    const app = await buildApp(db, deps);
    const bad = await app.inject({ method: 'POST', url: '/api/admin/konoba-test/tables', headers: OWNER, payload: { combo_of: [999, 998], max_capacity: 8 } });
    expect(bad.statusCode).toBe(400);
  });
});

describe('ključevi za osoblje', () => {
  it('konobar vidi rezervacije i narudžbe, ali ne mijenja postavke ni meni; opozvan ključ ne radi', async () => {
    const { db, deps } = await setup();
    const app = await buildApp(db, deps);
    const k = await app.inject({ method: 'POST', url: '/api/admin/konoba-test/staff', headers: OWNER, payload: { name: 'Konobar Ivan' } });
    expect(k.statusCode).toBe(201);
    const STAFF = { authorization: `Bearer ${k.json().key}` };
    expect((await app.inject({ url: '/api/admin/konoba-test/reservations?date=2026-07-11', headers: STAFF })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/admin/konoba-test/orders', headers: STAFF })).statusCode).toBe(200);
    const s = await app.inject({ url: '/api/admin/konoba-test/settings', headers: STAFF });
    expect(s.json().role).toBe('staff');
    expect((await app.inject({ method: 'PUT', url: '/api/admin/konoba-test/settings', headers: STAFF, payload: { max_party_size: 99 } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/admin/konoba-test/menu', headers: STAFF, payload: {} })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/admin/konoba-test/staff', headers: STAFF })).statusCode).toBe(403);
    // ključ se ne sprema u bazu
    const stored = (await db.query('select key_hash from staff_keys')).rows[0].key_hash;
    expect(stored).not.toContain(k.json().key);
    await app.inject({ method: 'POST', url: `/api/admin/konoba-test/staff/${k.json().id}/revoke`, headers: OWNER });
    expect((await app.inject({ url: '/api/admin/konoba-test/orders', headers: STAFF })).statusCode).toBe(401);
  });

  it('ključ jednog restorana ne radi za drugi', async () => {
    const { db, deps } = await setup();
    const app = await buildApp(db, deps);
    const other = await app.inject({ method: 'POST', url: '/api/super/restaurants', headers: { 'x-super-key': 'super' }, payload: { slug: 'drugi-restoran' } });
    expect((await app.inject({ url: '/api/admin/drugi-restoran/settings', headers: OWNER })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/admin/drugi-restoran/settings', headers: { authorization: `Bearer ${other.json().admin_api_key}` } })).statusCode).toBe(200);
  });
});

describe('GDPR i integracije', () => {
  it('brisanje gosta anonimizira podatke i povijest razgovora', async () => {
    const { db, deps } = await setup();
    const app = await buildApp(db, deps);
    await app.inject({ method: 'POST', url: '/api/r/konoba-test/reservations', payload: { name: 'Ana Anić', phone: '0911112222', email: 'ana@test.hr', partySize: 2, date: '2026-07-11', time: '20:00', notes: 'alergija na orahe' } });
    await db.query(`insert into chat_sessions (restaurant_id, channel, external_id, messages) select id, 'whatsapp', '+385911112222', '[]' from restaurants`);
    const res = await app.inject({ method: 'POST', url: '/api/admin/konoba-test/guests/anonymize', headers: OWNER, payload: { phone: '091 111 2222' } });
    expect(res.json()).toEqual({ anonymized: 1 });
    const g = (await db.query('select name, phone, email from guests')).rows[0];
    expect(g).toEqual({ name: 'Obrisani gost', phone: null, email: null });
    expect((await db.query('select notes from reservations')).rows[0].notes).toBe('');
    expect((await db.query('select count(*)::int n from chat_sessions')).rows[0].n).toBe(0);
  });

  it('super admin spaja WhatsApp/Instagram/Stripe za restoran', async () => {
    const { db, deps } = await setup();
    const app = await buildApp(db, deps);
    const H = { 'x-super-key': 'super' };
    expect((await app.inject({ method: 'PUT', url: '/api/super/restaurants/konoba-test/integrations', headers: H, payload: { stripe_account_id: 'krivo' } })).statusCode).toBe(400);
    const ok = await app.inject({ method: 'PUT', url: '/api/super/restaurants/konoba-test/integrations', headers: H,
      payload: { whatsapp_phone_number_id: '1234567890', instagram_account_id: '1789', stripe_account_id: 'acct_123ABC' } });
    expect(ok.json()).toEqual({ updated: 3 });
    const s = await app.inject({ url: '/api/admin/konoba-test/settings', headers: OWNER });
    expect(s.json()).toMatchObject({ stripe_connected: true, whatsapp_connected: true });
  });

  it('vlasnik dobije Stripe Connect onboarding link, račun se sprema', async () => {
    const { db, deps } = await setup();
    const app = await buildApp(db, deps);
    const res = await app.inject({ method: 'POST', url: '/api/admin/konoba-test/stripe/onboard', headers: OWNER, payload: {} });
    expect(res.json().url).toContain('connect.stripe.test');
    expect((await db.query('select stripe_account_id from restaurants')).rows[0].stripe_account_id).toBe('acct_new123');
  });
});
