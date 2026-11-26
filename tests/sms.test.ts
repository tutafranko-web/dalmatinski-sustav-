import { afterEach, describe, expect, it, vi } from 'vitest';
import { setup } from './helpers.js';
import { buildApp } from '../src/server.js';
import { createReservation } from '../src/services/reservations.js';
import { processOutbox } from '../src/services/notifications.js';
import { renderSms } from '../src/services/messages.js';
import { isMobile, smsSegments, smsSender, toGsm7 } from '../src/services/sms.js';
import { infobipSms } from '../src/adapters.js';
import { SendError } from '../src/deps.js';
import { tick } from '../src/jobs/scheduler.js';

const H = { 'x-super-key': 'super' };
const OWNER = { authorization: 'Bearer admin-key' };
const at = { date: '2026-07-11', time: '20:00', partySize: 2, source: 'web' };

/** Restoran s uključenim SMS-om; withWhatsApp=false = restoran nema WhatsApp. */
async function smsSetup(o: { withWhatsApp?: boolean; guarantee?: boolean } = {}) {
  const ctx = await setup({ guarantee: o.guarantee });
  await ctx.db.query(`update restaurants set sms_mode = 'fallback', whatsapp_phone_number_id = $2 where id = $1`, [ctx.r.id, o.withWhatsApp === false ? null : 'wa-phone-1']);
  Object.assign(ctx.r, { sms_mode: 'fallback', whatsapp_phone_number_id: o.withWhatsApp === false ? null : 'wa-phone-1' });
  return ctx;
}
const smsSent = (t: any) => t.sent.filter((s: any) => s.channel === 'sms');

describe('SMS tekstovi', () => {
  const d = {
    restaurantName: 'Konoba Šćedro', guestName: 'Ana', date: '2026-07-11', time: '20:00', partySize: 4, code: 'ABC234',
    manageUrl: 'https://restoran.opsisdalmatia.com/b/konoba-scedro?code=ABC234', shortGuaranteeUrl: 'https://restoran.opsisdalmatia.com/g/ABC234',
    reviewUrl: 'https://g.page/r/CQwerty123456/review', noShowFee: '20,00 €', today: false,
  };

  it('svaka poruka na sva tri jezika stane u dvije SMS poruke i ostane u GSM-7', () => {
    for (const l of ['hr', 'en', 'de'])
      for (const k of ['confirmation', 'modified', 'reminder', 'cancellation', 'guarantee_link', 'review_request'] as const) {
        const t = renderSms(k, l, d);
        // jedini upitnici smiju biti oni iz teksta; GSM-7 pretvorba ne smije dodati nijedan
        expect(t.replace('?code=', '').replace("Can't make it?", ''), `${l}/${k}`).not.toContain('?');
        expect(smsSegments(t), `${l}/${k}: ${t}`).toBeLessThanOrEqual(2);
      }
    expect(renderSms('confirmation', 'hr', d)).toBe('Konoba Scedro: rezervacija potvrdjena 11.7.2026. u 20:00, 4 os. Sifra ABC234. Izmjena ili otkaz: https://restoran.opsisdalmatia.com/b/konoba-scedro?code=ABC234');
    expect(renderSms('reminder', 'de', d)).toContain('Erinnerung an Ihre Reservierung morgen um 20:00 Uhr');
    expect(renderSms('guarantee_link', 'en', d)).toContain('https://restoran.opsisdalmatia.com/g/ABC234 Valid 30 min. No-show fee 20,00 € per person.');
  });

  it('GSM-7: hrvatska slova postaju obična, njemačka ostaju', () => {
    expect(toGsm7('čćšžđ ČĆŠŽĐ – „ok”')).toBe('ccszdj CCSZDj - "ok"');
    expect(toGsm7('Grüße aus Köln')).toBe('Grüße aus Köln');
    expect(smsSegments('x'.repeat(160))).toBe(1);
    expect(smsSegments('x'.repeat(161))).toBe(2);
    expect(smsSegments('€'.repeat(80))).toBe(1);
    expect(smsSender({ name: 'Konoba Šćedro & Co', sms_sender: null })).toBe('KonobaScedr');
    expect(isMobile('+385912345678')).toBe(true);
    expect(isMobile('+38521123456')).toBe(false);
  });
});

describe('SMS kao rezervni kanal', () => {
  it('restoran bez WhatsAppa: gost s mobitelom dobije SMS na svom jeziku', async () => {
    const { db, deps, r, transport } = await smsSetup({ withWhatsApp: false });
    const { notified } = await createReservation(db, deps, r, { ...at, name: 'Hans', phone: '+49 151 1234567', language: 'de' });
    expect(notified).toEqual(['sms']);
    await tick(db, deps);
    expect(smsSent(transport)).toEqual([{ channel: 'sms', to: '+491511234567', body: expect.objectContaining({ from: 'KonobaTest' }) }]);
    expect(smsSent(transport)[0].body.text).toMatch(/^Konoba Test: Reservierung bestätigt 11\.7\.2026\. um 20:00 Uhr/);
  });

  it('bez uključenog SMS-a nema SMS-a (zadano)', async () => {
    const { db, deps, r } = await setup();
    await db.query('update restaurants set whatsapp_phone_number_id = null');
    r.whatsapp_phone_number_id = null;
    expect((await createReservation(db, deps, r, { ...at, name: 'A', phone: '0911234567' })).notified).toEqual([]);
  });

  it('broj bez WhatsAppa (131026): odmah SMS, a sljedeći put ide ravno SMS', async () => {
    const { db, deps, r, transport } = await smsSetup();
    transport.failWhatsApp = () => new SendError('Meta 400 (131026): undeliverable', true, '131026');
    await createReservation(db, deps, r, { ...at, name: 'Ana', phone: '0911234567' });
    await processOutbox(db, deps); // WhatsApp padne → upiše se SMS
    await processOutbox(db, deps); // SMS ode
    expect(smsSent(transport)).toHaveLength(1);
    expect((await db.query('select whatsapp_ok from guests')).rows[0].whatsapp_ok).toBe(false);
    const again = await createReservation(db, deps, r, { ...at, time: '13:00', name: 'Ana', phone: '0911234567' });
    expect(again.notified).toEqual(['sms']);
  });

  it('privremena greška WhatsAppa: drugi pokušaj nakon minute, pa SMS', async () => {
    const { db, deps, r, transport, setNow } = await smsSetup();
    transport.failWhatsApp = () => new SendError('Meta 503', false);
    await createReservation(db, deps, r, { ...at, name: 'Ana', phone: '0911234567' });
    await processOutbox(db, deps);
    expect(smsSent(transport)).toHaveLength(0);
    expect((await processOutbox(db, deps))).toBe(0); // čeka minutu
    setNow(new Date('2026-07-10T08:01:30Z'));
    await processOutbox(db, deps); // drugi neuspjeh → SMS
    await processOutbox(db, deps);
    expect(smsSent(transport)).toHaveLength(1);
    const wa = (await db.query(`select attempts, failed_at from outbox where channel = 'whatsapp'`)).rows[0];
    expect(wa.attempts).toBe(2);
    expect(wa.failed_at).not.toBeNull();
  });

  it('bez uključenog SMS-a WhatsApp se ponavlja s razmakom i na kraju odustaje', async () => {
    const { db, deps, r, transport, setNow } = await setup();
    transport.failWhatsApp = () => new SendError('Meta 503', false);
    await createReservation(db, deps, r, { ...at, name: 'Ana', phone: '0911234567' });
    for (let min = 0; min <= 120; min += 1) {
      setNow(new Date(Date.UTC(2026, 6, 10, 8, min)));
      await processOutbox(db, deps);
    }
    const wa = (await db.query(`select attempts, failed_at from outbox where channel = 'whatsapp'`)).rows[0];
    expect(wa.attempts).toBe(5);
    expect(wa.failed_at).not.toBeNull();
    expect(smsSent(transport)).toHaveLength(0);
  });

  it('Meta javi neuspjelu dostavu kroz webhook: SMS; dostavljeno: broj ima WhatsApp', async () => {
    const { db, deps, r, transport } = await smsSetup();
    const app = await buildApp(db, deps);
    await createReservation(db, deps, r, { ...at, name: 'Ana', phone: '0911234567' });
    await createReservation(db, deps, r, { ...at, name: 'Ivo', phone: '0921234567' });
    await processOutbox(db, deps);
    const ids = (await db.query(`select recipient, provider_id from outbox where channel = 'whatsapp' order by id`)).rows;
    const { createHmac } = await import('node:crypto');
    const payload = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
      metadata: { phone_number_id: 'wa-phone-1' },
      statuses: [
        { id: ids[0].provider_id, status: 'failed', recipient_id: '385911234567', errors: [{ code: 131026 }] },
        { id: ids[1].provider_id, status: 'delivered', recipient_id: '385921234567' },
      ],
    } }] }] });
    await app.inject({ method: 'POST', url: '/webhooks/meta', payload,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'app-secret').update(payload).digest('hex') } });
    await Promise.all([...app.pending]);
    await processOutbox(db, deps);
    expect(smsSent(transport).map((s: any) => s.to)).toEqual(['+385911234567']);
    const g = (await db.query('select phone, whatsapp_ok from guests order by id')).rows;
    expect(g).toEqual([{ phone: '+385911234567', whatsapp_ok: false }, { phone: '+385921234567', whatsapp_ok: true }]);
  });
});

describe('SMS ne smije koštati više nego treba', () => {
  it('fiksni broj, nepoznata zemlja i potrošen limit ne dobivaju SMS', async () => {
    const { db, deps, r } = await smsSetup({ withWhatsApp: false });
    expect((await createReservation(db, deps, r, { ...at, name: 'A', phone: '+385 21 123 456' })).notified).toEqual([]);
    expect((await createReservation(db, deps, r, { ...at, time: '13:00', name: 'B', phone: '+8823 1234 5678' })).notified).toEqual([]);
    await db.query('update restaurants set sms_daily_limit = 1');
    r.sms_daily_limit = 1;
    expect((await createReservation(db, deps, r, { ...at, time: '14:00', name: 'C', phone: '0911000001' })).notified).toEqual(['sms']);
    expect((await createReservation(db, deps, r, { ...at, time: '15:00', name: 'D', phone: '0911000002' })).notified).toEqual([]);
  });

  it('isti broj dobije najviše 5 SMS-ova dnevno', async () => {
    const { db, deps, r } = await smsSetup({ withWhatsApp: false });
    const out = [];
    for (const time of ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00'])
      out.push((await createReservation(db, deps, r, { ...at, time, name: 'X', phone: '0911000001' })).notified);
    expect(out.at(4)).toEqual(['sms']);
    expect(out.at(5)).toEqual([]);
  });

  it('upit za recenziju ide SMS-om samo gostu bez emaila', async () => {
    const { db, deps, r } = await smsSetup({ withWhatsApp: false });
    await db.query(`update restaurants set review_mode = 'auto'`);
    r.review_mode = 'auto';
    const { notify } = await import('../src/services/reservations.js');
    const a = await createReservation(db, deps, r, { ...at, name: 'S emailom', phone: '0911000001', email: 'a@test.hr' });
    const b = await createReservation(db, deps, r, { ...at, time: '13:00', name: 'Bez emaila', phone: '0911000002' });
    expect(await notify(db, deps, r, a.reservation, 'review_request')).toEqual(['email']);
    expect(await notify(db, deps, r, b.reservation, 'review_request')).toEqual(['sms']);
  });

  it('SMS uključuje samo super admin; vlasnik vidi stanje', async () => {
    const { db, deps } = await setup();
    const app = await buildApp(db, deps);
    const put = (payload: any) => app.inject({ method: 'PUT', url: '/api/super/restaurants/konoba-test/integrations', headers: H, payload });
    expect((await put({ sms_mode: 'uvijek' })).statusCode).toBe(400);
    expect((await put({ sms_sender: 'Predugo ime pošiljatelja' })).statusCode).toBe(400);
    expect((await put({ sms_mode: 'fallback', sms_sender: 'KonobaTest', sms_daily_limit: 50 })).json()).toEqual({ updated: 3 });
    expect((await app.inject({ method: 'PUT', url: '/api/admin/konoba-test/settings', headers: OWNER, payload: { sms_mode: 'off' } })).json()).toEqual({ updated: 0 });
    expect((await app.inject({ url: '/api/admin/konoba-test/settings', headers: OWNER })).json().sms_enabled).toBe(true);
  });
});

describe('kratki link za karticu', () => {
  it('/g/ŠIFRA vodi na Stripe dok garancija čeka, poslije na pregled rezervacije', async () => {
    const { db, deps, r, setNow } = await smsSetup({ withWhatsApp: false, guarantee: true });
    const { reservation } = await createReservation(db, deps, r, { ...at, partySize: 4, name: 'Grupa', phone: '0911000001' });
    const sms = (await db.query(`select payload from outbox where channel = 'sms'`)).rows[0].payload.text;
    expect(sms).toContain(`https://app.test/g/${reservation.code}`);
    const app = await buildApp(db, deps);
    const go = await app.inject({ url: `/g/${reservation.code.toLowerCase()}` });
    expect(go.statusCode).toBe(302);
    expect(go.headers.location).toBe('https://checkout.stripe.test/1');
    setNow(new Date('2026-07-10T08:45:00Z'));
    expect((await app.inject({ url: `/g/${reservation.code}` })).headers.location).toBe(`https://app.test/b/konoba-test?code=${reservation.code}`);
    expect((await app.inject({ url: '/g/NEMAGA' })).statusCode).toBe(404);
  });
});

describe('Infobip', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('šalje točno ono što traži API v3 i vraća ID poruke', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ bulkId: 'b1', messages: [{ messageId: 'm-1', status: { groupId: 1, groupName: 'PENDING', id: 26, name: 'PENDING_ACCEPTED' }, destination: '385911234567' }] }), { status: 200 });
    });
    const send = infobipSms({ apiKey: 'kljuc', baseUrl: 'https://abc12.api.infobip.com/' });
    expect(await send({ to: '+385911234567', from: 'KonobaTest', text: 'Bok' })).toBe('m-1');
    expect(calls[0].url).toBe('https://abc12.api.infobip.com/sms/3/messages');
    expect(calls[0].init.headers.Authorization).toBe('App kljuc');
    expect(JSON.parse(calls[0].init.body)).toEqual({ messages: [{ sender: 'KonobaTest', destinations: [{ to: '385911234567' }], content: { text: 'Bok' } }] });
  });

  it('odbijen broj je trajna greška, pad servera privremena', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ messages: [{ messageId: 'x', status: { groupName: 'REJECTED', name: 'REJECTED_DESTINATION', description: 'Invalid destination' } }] }), { status: 200 }));
    const send = infobipSms({ apiKey: 'k' });
    await expect(send({ to: '+385911234567', from: 'A', text: 'x' })).rejects.toMatchObject({ permanent: true });
    vi.stubGlobal('fetch', async () => new Response('boom', { status: 502 }));
    await expect(send({ to: '+385911234567', from: 'A', text: 'x' })).rejects.toMatchObject({ permanent: false });
    vi.stubGlobal('fetch', async () => new Response('{"requestError":{"serviceException":{"messageId":"UNAUTHORIZED"}}}', { status: 401 }));
    await expect(send({ to: '+385911234567', from: 'A', text: 'x' })).rejects.toMatchObject({ permanent: true });
  });
});
