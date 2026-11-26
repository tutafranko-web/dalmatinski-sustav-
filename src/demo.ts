import type { Db } from './db.js';
import { newCode } from './services/reservations.js';
import { localToUtc, utcToLocal } from './time.js';

/**
 * Demo restoran za lokalno isprobavanje i prezentacije klijentima: stolovi, meni na tri jezika,
 * gosti s oznakama, današnje rezervacije oko trenutnog vremena, 30 dana povijesti za statistiku i par otvorenih narudžbi.
 * Imena i brojevi su izmišljeni.
 */
export async function seedDemo(db: Db, now = new Date()) {
  const exists = (await db.query(`select id from restaurants where slug = 'demo-konoba'`)).rows[0];
  if (exists) return;
  const hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, open: '12:00', close: '23:00' }));
  const r = (await db.query(
    `insert into restaurants (slug, name, phone, email, address, opening_hours, admin_api_key, info_text, google_review_url)
     values ('demo-konoba','Konoba Demo','+385 21 000 000','demo@opsisdalmatia.com','Obala 1, Split',$1,'demo-key',
       'Parking: javna garaža 200 m. Psi dozvoljeni na terasi. Imamo dječje stolice. Veganske opcije: tjestenina s povrćem.',
       'https://g.page/r/demo/review') returning id, timezone, default_duration_minutes`,
    [JSON.stringify(hours)],
  )).rows[0];
  const tz: string = r.timezone;
  const duration: number = r.default_duration_minutes;

  // ---------- stolovi ----------
  const tableDefs: [string, string, number, number, string][] = [
    ['1', 'unutra', 1, 2, 'demo-qr-1'], ['2', 'unutra', 1, 2, 'demo-qr-2'], ['3', 'unutra', 2, 4, 'demo-qr-3'],
    ['4', 'unutra', 2, 4, 'demo-qr-4'], ['5', 'unutra', 2, 4, 'demo-qr-5'], ['6', 'unutra', 4, 6, 'demo-qr-6'],
    ['T1', 'terasa', 2, 4, 'demo-qr-t1'], ['T2', 'terasa', 4, 8, 'demo-qr-t2'], ['T3', 'terasa', 2, 4, 'demo-qr-t3'], ['T4', 'terasa', 1, 2, 'demo-qr-t4'],
  ];
  const tables: { id: number; label: string; max: number; min: number }[] = [];
  for (const [label, zone, min, max, qr] of tableDefs) {
    const t = (await db.query(
      'insert into dining_tables (restaurant_id, label, zone, min_capacity, max_capacity, qr_token) values ($1,$2,$3,$4,$5,$6) returning id',
      [r.id, label, zone, min, max, qr],
    )).rows[0];
    tables.push({ id: t.id, label, min, max });
  }
  const t5 = tables.find((t) => t.label === '5')!, t6 = tables.find((t) => t.label === '6')!;
  const combo = (await db.query(
    `insert into dining_tables (restaurant_id, label, zone, min_capacity, max_capacity, qr_token, combo_of) values ($1,'5+6','unutra',7,10,'demo-qr-56',$2) returning id`,
    [r.id, [t5.id, t6.id]],
  )).rows[0];

  // ---------- meni ----------
  const items: [string, Record<string, string>, Record<string, string>, number, number, string[]][] = [
    ['Predjela', { hr: 'Dalmatinski pršut i paški sir', en: 'Dalmatian prosciutto and Pag cheese', de: 'Dalmatinischer Schinken und Pager Käse' },
      { hr: 's maslinama i domaćim kruhom', en: 'with olives and homemade bread', de: 'mit Oliven und hausgemachtem Brot' }, 1600, 13, ['mlijeko', 'gluten']],
    ['Predjela', { hr: 'Salata od hobotnice', en: 'Octopus salad', de: 'Oktopussalat' },
      { hr: 'krumpir, kapari, maslinovo ulje', en: 'potato, capers, olive oil', de: 'Kartoffeln, Kapern, Olivenöl' }, 1400, 13, ['mekušci']],
    ['Juhe', { hr: 'Riblja juha', en: 'Fish soup', de: 'Fischsuppe' }, {}, 700, 13, ['riba', 'celer']],
    ['Glavna jela', { hr: 'Crni rižot', en: 'Black cuttlefish risotto', de: 'Schwarzes Risotto' },
      { hr: 'sipa u vlastitoj tinti', en: 'cuttlefish in its own ink', de: 'Tintenfisch in eigener Tinte' }, 1800, 13, ['mekušci', 'mlijeko']],
    ['Glavna jela', { hr: 'Pašticada s njokima', en: 'Pašticada with gnocchi', de: 'Pašticada mit Gnocchi' },
      { hr: 'govedina pirjana šest sati u prošeku', en: 'beef braised for six hours in prošek wine', de: 'sechs Stunden in Prošek geschmortes Rind' }, 2200, 13, ['gluten', 'jaja', 'celer', 'sumpor']],
    ['Glavna jela', { hr: 'Riba s gradela (kg)', en: 'Grilled fish (per kg)', de: 'Gegrillter Fisch (pro kg)' },
      { hr: 'ulov dana, blitva s krumpirom', en: 'catch of the day, chard with potatoes', de: 'Fang des Tages, Mangold mit Kartoffeln' }, 6500, 13, ['riba']],
    ['Glavna jela', { hr: 'Tjestenina s povrćem', en: 'Pasta with vegetables', de: 'Pasta mit Gemüse' },
      { hr: 'vegansko', en: 'vegan', de: 'vegan' }, 1300, 13, ['gluten']],
    ['Deserti', { hr: 'Rožata', en: 'Rožata (custard pudding)', de: 'Rožata (Karamellpudding)' }, {}, 600, 13, ['jaja', 'mlijeko']],
    ['Deserti', { hr: 'Torta od mjendula', en: 'Almond cake', de: 'Mandeltorte' }, {}, 650, 13, ['jaja', 'orašasti plodovi']],
    ['Pića', { hr: 'Domaće crno vino 0,5 l', en: 'House red wine 0.5 l', de: 'Hauswein rot 0,5 l' }, {}, 1200, 25, ['sumpor']],
    ['Pića', { hr: 'Pošip 0,75 l', en: 'Pošip white wine 0.75 l', de: 'Pošip Weißwein 0,75 l' }, {}, 3200, 25, ['sumpor']],
    ['Pića', { hr: 'Mineralna voda 0,75 l', en: 'Sparkling water 0.75 l', de: 'Mineralwasser 0,75 l' }, {}, 450, 25, []],
    ['Pića', { hr: 'Espresso', en: 'Espresso', de: 'Espresso' }, {}, 200, 25, []],
  ];
  const menu: { id: number; name: string; price: number; vat: number }[] = [];
  let sort = 0, catIdx = -1, lastCat = '';
  for (const [category, name, description, price, vat, allergens] of items) {
    if (category !== lastCat) { catIdx++; lastCat = category; sort = 0; }
    const m = (await db.query(
      `insert into menu_items (restaurant_id, category, name, description, price_cents, vat_rate, allergens, sort) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [r.id, category, JSON.stringify(name), JSON.stringify(description), price, vat, JSON.stringify(allergens), catIdx * 1000 + sort++],
    )).rows[0];
    menu.push({ id: m.id, name: name.hr, price, vat });
  }

  // ---------- gosti ----------
  const people: [string, string | null, string | null, string, string[], string][] = [
    ['Marko Perić', '+385911000101', null, 'hr', ['VIP', 'stalni gost'], 'Voli stol T1 uz more. Vino: pošip.'],
    ['Anna Schmidt', '+491701000102', 'anna.schmidt@example.de', 'de', ['bez glutena'], 'Celijakija: provjeriti s kuhinjom.'],
    ['James Walker', '+447700000103', 'j.walker@example.co.uk', 'en', [], ''],
    ['Ivana Kovač', '+385981000104', null, 'hr', ['stalni gost'], ''],
    ['Luka Barišić', '+385951000105', null, 'hr', [], ''],
    ['Sophie Martin', '+33612000106', 'sophie.m@example.fr', 'en', ['vegan'], ''],
    ['Tomislav Jurić', '+385921000107', null, 'hr', ['VIP'], 'Vlasnik obližnjeg hotela, šalje goste.'],
    ['Klaus Weber', '+491511000108', null, 'de', [], ''],
    ['Petra Novak', '+385991000109', 'petra.novak@example.hr', 'hr', ['dječja stolica'], 'Dolazi s dvoje male djece.'],
    ['Emma Johansson', '+46701000110', null, 'en', [], ''],
    ['Ante Vuković', '+385911000111', null, 'hr', [], ''],
    ['Maria Rossi', '+393331000112', 'maria.rossi@example.it', 'en', ['alergija'], 'Alergična na orašaste plodove.'],
    ['Daniel Horvat', '+385981000113', null, 'hr', [], ''],
    ['Lena Fischer', '+491601000114', null, 'de', [], ''],
    ['Josip Marić', '+385951000115', null, 'hr', [], ''],
    ['Olivia Brown', '+12025550116', 'olivia.b@example.com', 'en', [], ''],
  ];
  const guests: number[] = [];
  for (const [name, phone, email, language, tags, notes] of people) {
    guests.push((await db.query(
      'insert into guests (restaurant_id, name, phone, email, language, tags, notes) values ($1,$2,$3,$4,$5,$6,$7) returning id',
      [r.id, name, phone, email, language, JSON.stringify(tags), notes],
    )).rows[0].id);
  }

  // ---------- rezervacije: stol se bira kao u pravom sustavu (najmanji slobodan), bez preklapanja ----------
  const busy = new Map<number, [number, number][]>();
  const occupy = (ids: number[], s: number, e: number) => ids.forEach((id) => busy.set(id, [...(busy.get(id) ?? []), [s, e]]));
  const free = (ids: number[], s: number, e: number) => ids.every((id) => !(busy.get(id) ?? []).some(([a, b]) => a < e && b > s));
  const fits = [...tables].sort((a, b) => a.max - b.max);
  async function reserve(date: string, time: string, party: number, guest: number, status: string, source: string, notes = '', forcedTable?: number) {
    const start = localToUtc(date, time, tz), end = new Date(start.getTime() + duration * 60_000);
    let tableId: number | null = null;
    if (forcedTable) {
      const parts = forcedTable === combo.id ? [t5.id, t6.id] : [forcedTable];
      if (!free(parts, start.getTime(), end.getTime())) return null;
      tableId = forcedTable;
      occupy(parts, start.getTime(), end.getTime());
    } else {
      const t = fits.find((x) => party >= x.min && party <= x.max && free([x.id], start.getTime(), end.getTime()));
      if (!t) return null;
      tableId = t.id;
      occupy([t.id], start.getTime(), end.getTime());
    }
    const created = new Date(Math.min(start.getTime() - 26 * 3600_000, now.getTime() - 3600_000));
    // otkazana ne drži stol: tu može sjesti netko drugi
    if (status === 'cancelled') busy.set(tableId, (busy.get(tableId) ?? []).filter(([a]) => a !== start.getTime()));
    await db.query(
      `insert into reservations (code, restaurant_id, guest_id, table_id, party_size, start_at, end_at, status, source, notes, created_at, reminder_sent_at, guarantee_expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [newCode(), r.id, guest, tableId, party, start, end, status, source, notes, created,
        start.getTime() < now.getTime() + 24 * 3600_000 ? created : null,
        status === 'pending_guarantee' ? new Date(now.getTime() + 25 * 60_000) : null],
    );
    if (status === 'completed') await db.query('update guests set visits = visits + 1 where id = $1', [guest]);
    if (status === 'no_show') await db.query('update guests set no_shows = no_shows + 1 where id = $1', [guest]);
    return tableId;
  }

  // povijest: 30 dana, ponovljivo (isti podaci kod svakog pokretanja)
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const SOURCES = ['web', 'web', 'web', 'chat', 'whatsapp', 'whatsapp', 'voice', 'admin', 'admin', 'instagram', 'walk_in'];
  const today = utcToLocal(now, tz).date;
  const dayStr = (n: number) => { const [y, m, d] = today.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  for (let back = 30; back >= 1; back--) {
    const date = dayStr(-back);
    const wd = utcToLocal(localToUtc(date, '12:00', tz), tz).weekday;
    const n = Math.round((wd >= 5 ? 9 : 5) + rnd() * 5);
    for (let i = 0; i < n; i++) {
      const lunch = rnd() < 0.3;
      const hour = lunch ? 12 + Math.floor(rnd() * 3) : 18 + Math.floor(rnd() * 4);
      const time = `${hour}:${rnd() < 0.5 ? '00' : '30'}`;
      const party = [2, 2, 2, 3, 4, 4, 2, 5, 6, 2][Math.floor(rnd() * 10)];
      const x = rnd();
      const status = x < 0.06 ? 'no_show' : x < 0.13 ? 'cancelled' : 'completed';
      await reserve(date, time, party, guests[Math.floor(rnd() * guests.length)], status, SOURCES[Math.floor(rnd() * SOURCES.length)]);
    }
  }

  // danas: statusi prate trenutno vrijeme (prije sada = sjede ili završeno, poslije = potvrđeno)
  const nowLocal = utcToLocal(now, tz);
  const nowMin = Number(nowLocal.time.slice(0, 2)) * 60 + Number(nowLocal.time.slice(3));
  const tl = (label: string) => tables.find((t) => t.label === label)!.id;
  const todayPlan: [string, number, number, string, string, number?][] = [
    ['12:30', 2, 3, 'web', ''], ['13:00', 4, 8, 'voice', '', tl('T2')], ['13:30', 2, 9, 'admin', 'Dječja stolica'],
    ['18:00', 2, 5, 'whatsapp', ''], ['18:30', 4, 1, 'web', 'Bez glutena za jednu osobu', tl('T3')], ['19:00', 2, 0, 'admin', 'Godišnjica braka', tl('T1')],
    ['19:00', 3, 2, 'chat', ''], ['19:30', 6, 6, 'voice', 'Poslovna večera', tl('T2')], ['20:00', 2, 10, 'web', ''],
    ['20:00', 4, 11, 'instagram', 'Alergija na orašaste plodove'], ['20:30', 8, 12, 'whatsapp', 'Rođendan, torta u 22 h', combo.id],
    ['21:00', 2, 13, 'web', ''], ['21:30', 5, 4, 'admin', '', tl('T2')], ['21:30', 2, 14, 'chat', ''], ['21:30', 2, 15, 'web', ''],
  ];
  for (const [time, party, g, source, notes, table] of todayPlan) {
    const m = Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const status = m + duration <= nowMin ? 'completed' : m <= nowMin ? 'seated' : 'confirmed';
    await reserve(today, time, party, guests[g], status, source, notes, table);
  }
  // jedan gost još nije ostavio karticu, jedan je otkazao
  await reserve(today, '22:00', 4, guests[7], nowMin < 21 * 60 ? 'pending_guarantee' : 'confirmed', 'web');
  await reserve(today, '20:30', 2, guests[3], 'cancelled', 'web');
  // sutra
  for (const [time, party, g, source] of [['13:00', 2, 4, 'web'], ['19:00', 4, 0, 'whatsapp'], ['20:00', 2, 1, 'web'], ['20:30', 6, 6, 'voice']] as const)
    await reserve(dayStr(1), time, party, guests[g], 'confirmed', source);

  // ---------- narudžbe: završene za statistiku i dvije otvorene ----------
  const order = async (tableId: number, created: Date, status: string, lines: [number, number][], kind = 'order', notes = '') => {
    const total = lines.reduce((s, [i, q]) => s + menu[i].price * q, 0);
    const o = (await db.query(
      'insert into orders (restaurant_id, table_id, status, kind, notes, total_cents, created_at) values ($1,$2,$3,$4,$5,$6,$7) returning id',
      [r.id, tableId, status, kind, notes, total, created],
    )).rows[0];
    for (const [i, q] of lines)
      await db.query('insert into order_items (order_id, menu_item_id, name, qty, unit_price_cents, vat_rate) values ($1,$2,$3,$4,$5,$6)', [o.id, menu[i].id, menu[i].name, q, menu[i].price, menu[i].vat]);
  };
  for (let back = 14; back >= 1; back--) {
    const at = localToUtc(dayStr(-back), '20:15', tz);
    await order(tl('3'), at, 'served', [[3, 2], [9, 1], [11, 1]]);
    await order(tl('T1'), new Date(at.getTime() + 40 * 60_000), 'served', [[4, 1], [6, 1], [7, 2]]);
  }
  await order(tl('3'), new Date(now.getTime() - 4 * 60_000), 'new', [[3, 2], [4, 1], [10, 1], [11, 2]], 'order', 'Jedan rižot bez sira');
  await order(tl('T1'), new Date(now.getTime() - 12 * 60_000), 'accepted', [[7, 2], [12, 2]]);
  await order(tl('T3'), new Date(now.getTime() - 60_000), 'new', [], 'request_bill');
}
