import { describe, expect, it } from 'vitest';
import { setup } from './helpers.js';
import { buildApp } from '../src/server.js';
import { cancelReservation, createReservation, modifyReservation, setStatus } from '../src/services/reservations.js';
import { executeTool } from '../src/ai/tools.js';
import { tick } from '../src/jobs/scheduler.js';
import type { LLM } from '../src/deps.js';

const base = { name: 'Ana', phone: '0911112222', email: 'ana@test.hr', partySize: 2, source: 'web' };
const toolUse = (id: string, name: string, input: any, stop = 'tool_use') => ({ content: [{ type: 'tool_use', id, name, input }], stop_reason: stop });
const text = (t: string) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });

/** LLM sa zadanim odgovorima; Error u nizu = poziv koji pukne. */
function scripted(steps: any[]): LLM & { calls: any[] } {
  const calls: any[] = [];
  return {
    calls,
    async create(p) {
      calls.push(JSON.parse(JSON.stringify(p)));
      const s = steps.shift() ?? text('kraj');
      await new Promise((ok) => setTimeout(ok, 30)); // pravi model ne odgovara trenutno
      if (s instanceof Error) throw s;
      return s;
    },
  };
}

describe('podsjetnik', () => {
  it('rezervacija za isti dan ne dobije podsjetnik odmah uz potvrdu, a kasnije piše "danas"', async () => {
    const { db, deps, r, transport, setNow } = await setup(); // 10:00
    await createReservation(db, deps, r, { ...base, date: '2026-07-10', time: '20:00' });
    expect((await tick(db, deps)).reminders).toBe(0);
    setNow(new Date('2026-07-10T14:05:00Z')); // 16:05, 6 h nakon rezervacije
    expect((await tick(db, deps)).reminders).toBe(1);
    const mail = transport.sent.filter((s) => s.channel === 'email').at(-1)!;
    expect(mail.body.subject).toBe('Podsjetnik: Konoba Test danas u 20:00');
  });

  it('dan prije piše "sutra" na jeziku gosta', async () => {
    const { db, deps, r, transport, setNow } = await setup();
    await createReservation(db, deps, r, { ...base, language: 'de', date: '2026-07-12', time: '19:00' });
    setNow(new Date('2026-07-11T17:30:00Z'));
    await tick(db, deps);
    expect(transport.sent.filter((s) => s.channel === 'email').at(-1)!.body.subject).toBe('Erinnerung: Konoba Test morgen um 19:00 Uhr');
  });

  it('izmjena na manje od 24 h ne šalje podsjetnik uz obavijest o izmjeni', async () => {
    const { db, deps, r, setNow } = await setup();
    const { reservation } = await createReservation(db, deps, r, { ...base, date: '2026-07-12', time: '19:00' });
    setNow(new Date('2026-07-11T18:00:00Z'));
    expect((await tick(db, deps)).reminders).toBe(1);
    await modifyReservation(db, deps, r, reservation.code, base.phone, { time: '20:00' });
    expect((await tick(db, deps)).reminders).toBe(0);
  });
});

describe('nakon početka termina', () => {
  it('gost više ne može otkazati ni pomaknuti (izbjegao bi no-show), osoblje može', async () => {
    const { db, deps, r, setNow } = await setup();
    const { reservation } = await createReservation(db, deps, r, { ...base, date: '2026-07-10', time: '13:00' });
    setNow(new Date('2026-07-10T11:30:00Z')); // 13:30
    await expect(cancelReservation(db, deps, r, reservation.code, base.phone)).rejects.toMatchObject({ code: 'already_started' });
    await expect(modifyReservation(db, deps, r, reservation.code, base.phone, { time: '20:00' })).rejects.toMatchObject({ code: 'already_started' });
    expect((await cancelReservation(db, deps, r, reservation.code, null, { admin: true })).status).toBe('cancelled');
  });

  it('izmjena u prošlost se odbija', async () => {
    const { db, deps, r, setNow } = await setup();
    const { reservation } = await createReservation(db, deps, r, { ...base, date: '2026-07-10', time: '20:00' });
    setNow(new Date('2026-07-10T14:00:00Z')); // 16:00
    await expect(modifyReservation(db, deps, r, reservation.code, base.phone, { time: '12:00' })).rejects.toMatchObject({ code: 'in_past' });
  });

  it('automatski završen posjet broji se gostu', async () => {
    const { db, deps, r, setNow } = await setup();
    const { reservation } = await createReservation(db, deps, r, { ...base, date: '2026-07-10', time: '13:00' });
    await setStatus(db, deps, r, reservation.id, 'seated');
    setNow(new Date('2026-07-10T14:30:00Z'));
    await tick(db, deps);
    expect((await db.query('select visits from guests')).rows[0].visits).toBe(1);
  });
});

describe('privatnost u razgovoru', () => {
  it('nitko ne može upisati tuđi broj i saznati tuđe rezervacije', async () => {
    const { db, deps, r } = await setup();
    await createReservation(db, deps, r, { ...base, date: '2026-07-11', time: '20:00' });
    const stranac = { phone: '091 111 2222' };
    const web: any = await executeTool(db, deps, r, 'find_reservations', stranac, { source: 'chat' });
    expect(web.reservations).toBeUndefined();
    expect(web.error).toBe('code_required');
    const wa: any = await executeTool(db, deps, r, 'find_reservations', stranac, { source: 'whatsapp', callerPhone: '+385990000000' });
    expect(wa.reservations).toEqual([]);
    const mine: any = await executeTool(db, deps, r, 'find_reservations', {}, { source: 'voice', callerPhone: '+385911112222' });
    expect(mine.reservations).toHaveLength(1);
  });

  it('GDPR brisanje uklanja i već poslane poruke, i kad je poznat samo jedan kontakt', async () => {
    const { db, deps, r } = await setup();
    const app = await buildApp(db, deps);
    await createReservation(db, deps, r, { ...base, date: '2026-07-11', time: '20:00' });
    await tick(db, deps);
    expect((await db.query('select count(*)::int n from outbox')).rows[0].n).toBe(2);
    await app.inject({ method: 'POST', url: '/api/admin/konoba-test/guests/anonymize', headers: { authorization: 'Bearer admin-key' }, payload: { phone: base.phone } });
    expect((await db.query('select count(*)::int n from outbox')).rows[0].n).toBe(0);
  });
});

describe('chatbot kad nešto pukne', () => {
  const send = (app: any, message: string) => app.inject({ method: 'POST', url: '/api/r/konoba-test/chat', payload: { sessionId: 'sess-12345678', message } });
  const book = { name: 'Ivana', phone: '0951112233', party_size: 2, date: '2026-07-11', time: '20:00' };

  it('pad nakon rezervacije ne gubi povijest i ponovljeni pokušaj ne radi drugu rezervaciju', async () => {
    const llm = scripted([toolUse('t1', 'create_reservation', book), new Error('529 overloaded'), toolUse('t2', 'create_reservation', book), text('Rezervirano.')]);
    const { db, deps } = await setup({ llm });
    const app = await buildApp(db, deps);
    expect((await send(app, 'Potvrđujem')).statusCode).toBe(500);
    expect((await send(app, 'Halo, je li rezervirano?')).statusCode).toBe(200);
    // model je u drugom pozivu vidio rezultat prve rezervacije
    expect(JSON.stringify(llm.calls[2].messages)).toContain('tool_result');
    expect((await db.query('select count(*)::int n from reservations')).rows[0].n).toBe(1);
    expect((await db.query(`select count(*)::int n from outbox where kind = 'confirmation'`)).rows[0].n).toBe(1);
  });

  it('odrezan poziv alata ne ostaje u povijesti (API bi svaku sljedeću poruku odbio)', async () => {
    const llm = scripted([toolUse('t1', 'create_reservation', { name: 'Iv' }, 'max_tokens'), text('U redu.')]);
    const { db, deps } = await setup({ llm });
    const app = await buildApp(db, deps);
    expect((await send(app, 'Stol za 2')).statusCode).toBe(200);
    await send(app, 'Ponovi');
    expect(JSON.stringify(llm.calls[1].messages)).not.toContain('tool_use');
    expect(llm.calls[1].messages.every((m: any) => m.content.length > 0)).toBe(true);
  });

  it('odbijen odgovor (refusal, prazan sadržaj) daje telefon restorana i ne ruši razgovor', async () => {
    const llm = scripted([{ content: [], stop_reason: 'refusal' }, text('Bok!')]);
    const { db, deps } = await setup({ llm });
    const app = await buildApp(db, deps);
    expect((await send(app, 'nešto')).json().reply).toContain('+38521000000');
    expect((await send(app, 'bok')).json().reply).toBe('Bok!');
    expect(llm.calls[1].messages.every((m: any) => m.content.length > 0)).toBe(true);
  });

  it('dvije brze poruke istog gosta obrađuju se redom, ne preko iste povijesti', async () => {
    const llm = scripted([text('prvi'), text('drugi')]);
    const { db, deps } = await setup({ llm });
    const app = await buildApp(db, deps);
    await Promise.all([send(app, 'Bok'), send(app, 'stol za dvoje')]);
    expect(llm.calls[1].messages.map((m: any) => m.role)).toEqual(['user', 'assistant', 'user']);
  });
});

describe('obavijest gostu', () => {
  it('kad nema kanala, bot i web ne tvrde da je potvrda poslana', async () => {
    const { db, deps, r } = await setup();
    await db.query('update restaurants set whatsapp_phone_number_id = null');
    r.whatsapp_phone_number_id = null;
    const app = await buildApp(db, deps);
    const voice: any = await executeTool(db, deps, r, 'create_reservation', { name: 'Petar', party_size: 2, date: '2026-07-11', time: '20:00' }, { source: 'voice', callerPhone: '+385917776655' });
    expect(voice.notified).toEqual([]);
    expect(voice.note).not.toContain('Potvrda je poslana');
    const web = await app.inject({ method: 'POST', url: '/api/r/konoba-test/reservations', payload: { name: 'Iva', phone: '0917776656', partySize: 2, date: '2026-07-11', time: '20:00' } });
    expect(web.json().notified).toEqual([]);
    const mail = await app.inject({ method: 'POST', url: '/api/r/konoba-test/reservations', payload: { name: 'Iva', email: 'iva@test.hr', partySize: 2, date: '2026-07-11', time: '13:00' } });
    expect(mail.json().notified).toEqual(['email']);
  });
});
