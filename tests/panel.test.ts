import { describe, expect, it } from 'vitest';
import { setup } from './helpers.js';
import { buildApp } from '../src/server.js';

const H = { authorization: 'Bearer admin-key' };

async function app0(opts: Parameters<typeof setup>[0] = {}) {
  const s = await setup(opts);
  const app = await buildApp(s.db, s.deps);
  const staffKey = (await app.inject({ method: 'POST', url: '/api/admin/konoba-test/staff', headers: H, payload: { name: 'Konobar Ivo' } })).json().key;
  const tables = (await app.inject({ url: '/api/admin/konoba-test/tables', headers: H })).json();
  const tid = (label: string) => tables.find((t: any) => t.label === label).id;
  return { ...s, app, staff: { authorization: `Bearer ${staffKey}` }, tid };
}

const book = (app: any, p: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: '/api/admin/konoba-test/reservations', headers: H, payload: { name: 'Gost', partySize: 2, date: '2026-07-11', time: '20:00', ...p } });

describe('gost bez rezervacije', () => {
  it('konobar ga posjeda odmah na najmanji slobodan stol, bez poruka gostu', async () => {
    const { app, staff, db, tid } = await app0();
    const w = await app.inject({ method: 'POST', url: '/api/admin/konoba-test/walkin', headers: staff, payload: { partySize: 3 } });
    expect(w.statusCode).toBe(201);
    expect(w.json()).toMatchObject({ status: 'seated', source: 'walk_in', table_label: '3', party_size: 3 });
    expect(new Date(w.json().start_at).toISOString()).toBe('2026-07-10T08:00:00.000Z');

    // isti stol je sada zauzet
    const busy = await app.inject({ method: 'POST', url: '/api/admin/konoba-test/walkin', headers: staff, payload: { partySize: 2, tableId: tid('3') } });
    expect(busy.json().error).toBe('table_busy');
    // za 5 osoba stol za 2 je premalen, osim ako konobar izričito doda stolice
    const small = await app.inject({ method: 'POST', url: '/api/admin/konoba-test/walkin', headers: staff, payload: { partySize: 5, tableId: tid('1') } });
    expect(small.json().error).toBe('table_too_small');
    const forced = await app.inject({ method: 'POST', url: '/api/admin/konoba-test/walkin', headers: staff, payload: { partySize: 5, tableId: tid('1'), force: true } });
    expect(forced.statusCode).toBe(201);

    const day = (await app.inject({ url: '/api/admin/konoba-test/reservations?date=2026-07-10', headers: staff })).json();
    expect(day.reservations.map((r: any) => r.guest_name)).toEqual(['Gost bez rezervacije', 'Gost bez rezervacije']);
    expect(day.windows).toEqual([{ start: 720, end: 1380 }]);
    expect((await db.query('select count(*)::int as n from outbox')).rows[0].n).toBe(0);
    // gost bez kontakta nije na popisu gostiju
    expect((await app.inject({ url: '/api/admin/konoba-test/guests', headers: staff })).json()).toEqual([]);
  });

  it('s brojem mobitela posjet ide postojećem gostu', async () => {
    const { app, db } = await app0();
    await book(app, { phone: '0981112222', name: 'Ana' });
    const w = await app.inject({ method: 'POST', url: '/api/admin/konoba-test/walkin', headers: H, payload: { partySize: 2, phone: '098 111 2222' } });
    expect(w.statusCode).toBe(201);
    expect((await db.query('select count(*)::int as n from guests')).rows[0].n).toBe(1);
  });
});

describe('premještanje na drugi stol', () => {
  it('ne dopušta zauzet stol, premali samo uz potvrdu, i oslobađa stari', async () => {
    const { app, staff, tid } = await app0();
    const a = (await book(app, { phone: '0911000001', partySize: 3 })).json();
    await book(app, { phone: '0911000002', partySize: 4, zone: 'terasa' });
    expect(a.table_id).toBe(tid('3'));

    const move = (tableId: number, force = false) =>
      app.inject({ method: 'POST', url: `/api/admin/konoba-test/reservations/${a.id}/table`, headers: staff, payload: { tableId, force } });
    expect((await move(tid('T1'))).json().error).toBe('table_busy');
    expect((await move(tid('1'))).json().error).toBe('table_too_small');
    const ok = await move(tid('1'), true);
    expect(ok.json().table_id).toBe(tid('1'));

    // stol 3 je sada slobodan za drugu grupu od 3 u isto vrijeme
    const c = await book(app, { phone: '0911000003', partySize: 3 });
    expect(c.json().table_id).toBe(tid('3'));

    const cancelled = (await book(app, { phone: '0911000004', time: '13:00' })).json();
    await app.inject({ method: 'POST', url: `/api/admin/konoba-test/reservations/${cancelled.code}/cancel`, headers: H, payload: {} });
    const late = await app.inject({ method: 'POST', url: `/api/admin/konoba-test/reservations/${cancelled.id}/table`, headers: H, payload: { tableId: tid('2') } });
    expect(late.json().error).toBe('not_modifiable');
  });

  it('napomena osoblja uz rezervaciju', async () => {
    const { app, staff } = await app0();
    const a = (await book(app, { phone: '0911000001' })).json();
    const n = await app.inject({ method: 'POST', url: `/api/admin/konoba-test/reservations/${a.id}/notes`, headers: staff, payload: { notes: '  rođendan, torta u 21 h ' } });
    expect(n.json().notes).toBe('rođendan, torta u 21 h');
  });
});

describe('gosti', () => {
  it('popis, pretraga, oznake i bilješke vide se uz rezervaciju; brisanje briše i oznake', async () => {
    const { app, staff } = await app0();
    await book(app, { phone: '0981234567', name: 'Marko Marić' });
    await book(app, { email: 'anna@example.de', name: 'Anna Schmidt', time: '13:00' });

    const all = (await app.inject({ url: '/api/admin/konoba-test/guests', headers: staff })).json();
    expect(all.map((g: any) => g.name).sort()).toEqual(['Anna Schmidt', 'Marko Marić']);
    const marko = all.find((g: any) => g.name === 'Marko Marić');
    expect(marko).toMatchObject({ reservations: 1, visits: 0, tags: [] });
    expect(new Date(marko.next_visit).toISOString()).toBe('2026-07-11T18:00:00.000Z');

    const q = (s: string) => app.inject({ url: `/api/admin/konoba-test/guests?q=${encodeURIComponent(s)}`, headers: staff }).then((r: any) => r.json().map((g: any) => g.name));
    expect(await q('marić')).toEqual(['Marko Marić']);
    expect(await q('234 567')).toEqual(['Marko Marić']);
    expect(await q('example.de')).toEqual(['Anna Schmidt']);
    expect(await q('100%')).toEqual([]);

    const up = await app.inject({ method: 'PUT', url: `/api/admin/konoba-test/guests/${marko.id}`, headers: staff,
      payload: { tags: ['VIP', ' bez glutena ', 'VIP', ''], notes: 'Voli stol uz prozor' } });
    expect(up.json()).toMatchObject({ tags: ['VIP', 'bez glutena'], notes: 'Voli stol uz prozor' });
    expect(await q('vip')).toEqual(['Marko Marić']);
    expect((await app.inject({ method: 'PUT', url: `/api/admin/konoba-test/guests/${marko.id}`, headers: staff, payload: { tags: 'VIP' } })).statusCode).toBe(400);

    const day = (await app.inject({ url: '/api/admin/konoba-test/reservations?date=2026-07-11', headers: staff })).json();
    expect(day.reservations.find((r: any) => r.guest_name === 'Marko Marić')).toMatchObject({ guest_tags: ['VIP', 'bez glutena'], guest_notes: 'Voli stol uz prozor' });

    const hist = (await app.inject({ url: `/api/admin/konoba-test/guests/${marko.id}/reservations`, headers: staff })).json();
    expect(hist).toHaveLength(1);

    await app.inject({ method: 'POST', url: '/api/admin/konoba-test/guests/anonymize', headers: H, payload: { phone: '0981234567' } });
    expect(await q('vip')).toEqual([]);
    expect((await app.inject({ method: 'PUT', url: `/api/admin/konoba-test/guests/${marko.id}`, headers: staff, payload: { notes: 'x' } })).statusCode).toBe(404);
  });

  it('gost drugog restorana se ne vidi i ne mijenja', async () => {
    const { app, db } = await app0();
    const other = (await db.query(`insert into restaurants (slug, name, admin_api_key) values ('druga','Druga','k2') returning id`)).rows[0];
    const g = (await db.query(`insert into guests (restaurant_id, name, phone) values ($1,'Tuđi','+385911111111') returning id`, [other.id])).rows[0];
    expect((await app.inject({ url: '/api/admin/konoba-test/guests', headers: H })).json()).toEqual([]);
    expect((await app.inject({ method: 'PUT', url: `/api/admin/konoba-test/guests/${g.id}`, headers: H, payload: { notes: 'x' } })).statusCode).toBe(404);
  });
});

describe('jelovnik', () => {
  it('nenaručeno jelo se briše, naručeno arhivira i nestaje iz menija', async () => {
    const { app, staff } = await app0();
    const add = (hr: string) => app.inject({ method: 'POST', url: '/api/admin/konoba-test/menu', headers: H,
      payload: { category: 'Glavna', name: { hr }, price_cents: 1500 } }).then((r: any) => r.json());
    const a = await add('Brudet');
    const b = await add('Pašticada');
    await app.inject({ method: 'POST', url: '/api/qr/qr1/orders', payload: { items: [{ menu_item_id: b.id, qty: 1 }] } });

    expect((await app.inject({ method: 'DELETE', url: `/api/admin/konoba-test/menu/${a.id}`, headers: staff })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/konoba-test/menu/${a.id}`, headers: H })).json().result).toBe('deleted');
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/konoba-test/menu/${b.id}`, headers: H })).json().result).toBe('archived');
    expect((await app.inject({ method: 'DELETE', url: `/api/admin/konoba-test/menu/${b.id}`, headers: H })).statusCode).toBe(404);

    expect((await app.inject({ url: '/api/admin/konoba-test/menu', headers: H })).json()).toEqual([]);
    expect((await app.inject({ url: '/api/qr/qr1' })).json().menu).toEqual([]);
    expect((await app.inject({ url: '/api/r/konoba-test/menu' })).json().menu).toEqual([]);
    const again = await app.inject({ method: 'POST', url: '/api/qr/qr1/orders', payload: { items: [{ menu_item_id: b.id, qty: 1 }] } });
    expect(again.json().error).toBe('item_unavailable');
    // stara narudžba i dalje ima naziv jela
    expect((await app.inject({ url: '/api/admin/konoba-test/orders', headers: H })).json()[0].items[0].name).toBe('Pašticada');
  });

  it('javni jelovnik za stranicu rezervacije', async () => {
    const { app } = await app0();
    expect((await app.inject({ url: '/api/r/konoba-test' })).json().has_menu).toBe(false);
    await app.inject({ method: 'POST', url: '/api/admin/konoba-test/menu', headers: H, payload: { category: 'Deserti', name: { hr: 'Rožata' }, price_cents: 600, allergens: ['jaja'] } });
    const info = (await app.inject({ url: '/api/r/konoba-test' })).json();
    expect(info).toMatchObject({ has_menu: true, duration_minutes: 120 });
    const m = (await app.inject({ url: '/api/r/konoba-test/menu' })).json().menu;
    expect(m).toEqual([expect.objectContaining({ category: 'Deserti', price_cents: 600, allergens: ['jaja'] })]);
    expect(m[0].vat_rate).toBeUndefined();
  });
});

describe('statistika i QR', () => {
  it('pregled po danima, izvorima i satima', async () => {
    const { app, setNow } = await app0();
    const pub = (p: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/r/konoba-test/reservations', payload: { name: 'G', partySize: 2, date: '2026-07-10', ...p } });
    const a = (await pub({ phone: '0911000001', time: '13:00', partySize: 4 })).json();
    expect(a.start_at).toBe('2026-07-10T11:00:00.000Z');
    await pub({ phone: '0911000002', time: '20:00' });
    const c = (await pub({ phone: '0911000003', time: '21:00' })).json();
    await app.inject({ method: 'POST', url: `/api/admin/konoba-test/reservations/${c.code}/cancel`, headers: H, payload: {} });
    await app.inject({ method: 'POST', url: '/api/admin/konoba-test/walkin', headers: H, payload: { partySize: 3 } });

    setNow(new Date('2026-07-10T21:30:00Z'));
    const day = (await app.inject({ url: '/api/admin/konoba-test/reservations?date=2026-07-10', headers: H })).json().reservations;
    const second = day.find((r: any) => r.guest_phone === '+385911000002');
    await app.inject({ method: 'POST', url: `/api/admin/konoba-test/reservations/${second.id}/status`, headers: H, payload: { status: 'no_show' } });

    const s = (await app.inject({ url: '/api/admin/konoba-test/stats?days=7', headers: H })).json().summary;
    expect(s).toMatchObject({ from: '2026-07-04', to: '2026-07-10' });
    expect(s.totals).toMatchObject({ reservations: 3, covers: 7, no_shows: 1, cancelled: 1, walk_ins: 1, via_ai: 0, no_show_rate: 33.3, avg_party: 3.5 });
    expect(s.daily).toHaveLength(7);
    expect(s.daily.at(-1)).toEqual({ date: '2026-07-10', reservations: 2, covers: 7, no_shows: 1 });
    expect(s.sources).toEqual([{ source: 'web', reservations: 2, covers: 4 }, { source: 'walk_in', reservations: 1, covers: 3 }]);
    expect(s.heat).toEqual(expect.arrayContaining([{ weekday: 5, hour: 13, covers: 4 }, { weekday: 5, hour: 10, covers: 3 }]));
    expect((await app.inject({ url: '/api/admin/konoba-test/stats', headers: { authorization: H.authorization.replace('admin-key', 'x') } })).statusCode).toBe(401);
  });

  it('QR kod za stol i za rezervaciju, nepoznat stol 404', async () => {
    const { app } = await app0();
    const m = await app.inject({ url: '/qr/m/qr1' });
    expect(m.statusCode).toBe(200);
    expect(m.headers['content-type']).toContain('image/svg+xml');
    expect(m.body).toContain('<svg');
    expect((await app.inject({ url: '/qr/b/konoba-test' })).body).toContain('<svg');
    expect((await app.inject({ url: '/qr/m/nema' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/qr/b/nema' })).statusCode).toBe(404);
  });
});
