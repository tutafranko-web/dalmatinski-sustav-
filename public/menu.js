/* Opsis Restoran: QR meni na stolu. Gost naruči, pozove konobara ili traži račun. */
'use strict';

const I = {
  hr: { table: 'Stol', waiter: 'Konobar', bill: 'Račun', cart: 'Narudžba', cartEmpty: 'Odaberite jela', send: 'Pošalji narudžbu', yourOrder: 'Vaša narudžba',
    notes: 'Napomena za kuhinju (bez luka, alergija…)', total: 'Ukupno', sentTitle: 'Narudžba je poslana', sentText: 'Konobar je vidi i stiže potvrditi.',
    waiterSent: 'Konobar stiže.', billSent: 'Konobar donosi račun.', sentBtn: 'Poslano ✓', allergens: 'Alergeni', hideWith: 'Sakrij jela s alergenima',
    filterBtn: 'Alergeni', hidden: 'Skriveno {n} jela zbog alergena.', none: 'ništa skriveno', apply: 'Primijeni', clear: 'Poništi sve',
    allergyNote: 'Popis alergena je informativan. Ako imate alergiju, recite konobaru prije narudžbe.', history: 'Danas naručeno za ovaj stol', close: 'Zatvori',
    err: {} },
  en: { table: 'Table', waiter: 'Waiter', bill: 'Bill', cart: 'Order', cartEmpty: 'Choose dishes', send: 'Send order', yourOrder: 'Your order',
    notes: 'Note for the kitchen (no onion, allergy…)', total: 'Total', sentTitle: 'Order sent', sentText: 'Your waiter can see it and will confirm.',
    waiterSent: 'A waiter is on the way.', billSent: 'Your waiter is bringing the bill.', sentBtn: 'Sent ✓', allergens: 'Allergens', hideWith: 'Hide dishes containing',
    filterBtn: 'Allergens', hidden: '{n} dishes hidden because of allergens.', none: 'nothing hidden', apply: 'Apply', clear: 'Clear all',
    allergyNote: 'Allergen information is a guide. If you have an allergy, please tell your waiter before ordering.', history: 'Ordered at this table today', close: 'Close',
    err: { item_unavailable: 'Some dishes are no longer available. Please check your order.', too_many: 'Too many requests from this table. Please call your waiter.', empty_order: 'Your order is empty.', table_not_found: 'This QR code is not active. Please ask your waiter.', rate_limited: 'Too many requests. Please try again in a minute.' } },
  de: { table: 'Tisch', waiter: 'Kellner', bill: 'Rechnung', cart: 'Bestellung', cartEmpty: 'Gerichte wählen', send: 'Bestellung senden', yourOrder: 'Ihre Bestellung',
    notes: 'Hinweis für die Küche (ohne Zwiebel, Allergie…)', total: 'Gesamt', sentTitle: 'Bestellung gesendet', sentText: 'Ihr Kellner sieht sie und bestätigt gleich.',
    waiterSent: 'Der Kellner kommt.', billSent: 'Der Kellner bringt die Rechnung.', sentBtn: 'Gesendet ✓', allergens: 'Allergene', hideWith: 'Gerichte ausblenden mit',
    filterBtn: 'Allergene', hidden: '{n} Gerichte wegen Allergenen ausgeblendet.', none: 'nichts ausgeblendet', apply: 'Übernehmen', clear: 'Alle zurücksetzen',
    allergyNote: 'Die Allergenangaben dienen zur Orientierung. Bei Allergien bitte vor der Bestellung den Kellner informieren.', history: 'Heute an diesem Tisch bestellt', close: 'Schließen',
    err: { item_unavailable: 'Einige Gerichte sind nicht mehr verfügbar. Bitte prüfen Sie Ihre Bestellung.', too_many: 'Zu viele Anfragen von diesem Tisch. Bitte rufen Sie den Kellner.', empty_order: 'Ihre Bestellung ist leer.', table_not_found: 'Dieser QR-Code ist nicht aktiv. Bitte fragen Sie den Kellner.', rate_limited: 'Zu viele Anfragen. Bitte versuchen Sie es in einer Minute erneut.' } },
};
const ALG = {
  gluten: ['gluten', 'Gluten'], rakovi: ['crustaceans', 'Krebstiere'], jaja: ['eggs', 'Eier'], riba: ['fish', 'Fisch'], kikiriki: ['peanuts', 'Erdnüsse'],
  soja: ['soy', 'Soja'], mlijeko: ['milk', 'Milch'], 'orašasti plodovi': ['tree nuts', 'Schalenfrüchte'], celer: ['celery', 'Sellerie'], gorušica: ['mustard', 'Senf'],
  sezam: ['sesame', 'Sesam'], sumpor: ['sulphites', 'Sulfite'], lupina: ['lupin', 'Lupinen'], mekušci: ['molluscs', 'Weichtiere'],
};
const LOCALE = { hr: 'hr-HR', en: 'en-GB', de: 'de-DE' };

const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
let L = (new URLSearchParams(location.search).get('lang') || localStorage.getItem('opsis-lang') || navigator.language || 'hr').slice(0, 2).toLowerCase(); if (!I[L]) L = 'en';
const t = (k) => I[L][k] ?? I.en[k] ?? k;
const eur = (c) => (c / 100).toLocaleString(LOCALE[L], { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const nm = (o) => (o && (o[L] || o.hr || o.en || Object.values(o)[0])) || '';
const alg = (a) => L === 'hr' ? a : (ALG[a]?.[L === 'en' ? 0 : 1] || a);
const errText = (e) => (I[L].err && I[L].err[e.error]) || e.message;
const CATS = {
  predjela: ['Starters', 'Vorspeisen'], 'hladna predjela': ['Cold starters', 'Kalte Vorspeisen'], 'topla predjela': ['Warm starters', 'Warme Vorspeisen'],
  juhe: ['Soups', 'Suppen'], salate: ['Salads', 'Salate'], 'glavna jela': ['Main courses', 'Hauptgerichte'], tjestenine: ['Pasta', 'Pasta'],
  rižoti: ['Risottos', 'Risottos'], riba: ['Fish', 'Fisch'], 'riba i plodovi mora': ['Fish and seafood', 'Fisch und Meeresfrüchte'], 'plodovi mora': ['Seafood', 'Meeresfrüchte'],
  meso: ['Meat', 'Fleisch'], 'jela s roštilja': ['From the grill', 'Vom Grill'], pizze: ['Pizza', 'Pizza'], prilozi: ['Sides', 'Beilagen'],
  'za djecu': ['For children', 'Für Kinder'], 'dječji meni': ["Children's menu", 'Kindermenü'], deserti: ['Desserts', 'Desserts'], slastice: ['Desserts', 'Nachspeisen'],
  doručak: ['Breakfast', 'Frühstück'], pića: ['Drinks', 'Getränke'], 'bezalkoholna pića': ['Soft drinks', 'Alkoholfreie Getränke'], vina: ['Wines', 'Weine'],
  'bijela vina': ['White wines', 'Weißweine'], 'crna vina': ['Red wines', 'Rotweine'], pivo: ['Beer', 'Bier'], piva: ['Beers', 'Biere'], kava: ['Coffee', 'Kaffee'],
  'topli napitci': ['Hot drinks', 'Heißgetränke'], 'žestoka pića': ['Spirits', 'Spirituosen'], kokteli: ['Cocktails', 'Cocktails'],
};
/** uobičajene hrvatske kategorije menija na jeziku gosta; nepoznate ostaju kako ih je restoran upisao */
const cat = (c) => L === 'hr' ? c : (CATS[String(c).trim().toLowerCase()]?.[L === 'en' ? 0 : 1] || c);

let D = null;                                   // { restaurant, table, menu }
const cart = new Map();                         // id → količina
let avoid = new Set(JSON.parse(localStorage.getItem('opsis-avoid') || '[]'));
const HKEY = 'opsis-hist-' + token;
const today = () => new Date().toISOString().slice(0, 10);

let toastT;
function toast(text) { const el = $('toast'); el.textContent = text; el.className = 'toast on'; clearTimeout(toastT); toastT = setTimeout(() => { el.className = 'toast'; }, 3000); }

async function send(body) {
  const r = await fetch(`/api/qr/${encodeURIComponent(token)}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.message || 'Error'), d);
  return d;
}

const visible = () => D.menu.filter((m) => !m.allergens.some((a) => avoid.has(a)));

function render() {
  document.documentElement.lang = L;
  document.querySelectorAll('.langs button').forEach((b) => { b.classList.toggle('on', b.dataset.l === L); b.setAttribute('aria-pressed', String(b.dataset.l === L)); });
  document.title = `${D.restaurant} · ${t('table')} ${D.table}`;
  $('rname').textContent = D.restaurant;
  $('tno').textContent = D.table; $('tlab').textContent = t('table');
  $('waiter').textContent = t('waiter'); $('bill').textContent = t('bill');
  $('algBtn').textContent = t('filterBtn') + (avoid.size ? ` (${avoid.size})` : '');
  $('allergyNote').textContent = t('allergyNote');
  const list = visible();
  const hiddenN = D.menu.length - list.length;
  $('algNow').textContent = avoid.size ? t('hidden').replace('{n}', hiddenN) : t('none');
  const cats = [...new Set(D.menu.map((m) => m.category))].filter((c) => list.some((m) => m.category === c));
  $('cats').innerHTML = cats.map((c, i) => `<button type="button" data-c="${i}">${esc(cat(c))}</button>`).join('');
  $('menu').innerHTML = cats.map((c, i) => `<section class="cat" id="cat-${i}"><h2>${esc(cat(c))}</h2>${list.filter((m) => m.category === c).map(itemHtml).join('')}</section>`).join('');
  $('cats').querySelectorAll('button').forEach((b) => b.onclick = () => $('cat-' + b.dataset.c).scrollIntoView({ behavior: 'smooth', block: 'start' }));
  bindQty($('menu'));
  renderBar();
  spy();
}
function itemHtml(m) {
  const n = cart.get(m.id) || 0;
  return `<div class="item ${n ? 'in' : ''}" data-id="${m.id}"><div class="info"><div class="nm">${esc(nm(m.name))}</div>
    ${nm(m.description) ? `<div class="ds">${esc(nm(m.description))}</div>` : ''}
    ${m.allergens.length ? `<div class="al">${t('allergens')}: ${esc(m.allergens.map(alg).join(', '))}</div>` : ''}
    <div class="pr">${eur(m.price_cents)}</div></div>${qtyHtml(m, n)}</div>`;
}
const qtyHtml = (m, n) => `<div class="qty">${n ? `<button type="button" data-id="${m.id}" data-d="-1" aria-label="− ${esc(nm(m.name))}">−</button><output>${n}</output>` : ''}
  <button type="button" class="${n ? '' : 'add'}" data-id="${m.id}" data-d="1" aria-label="+ ${esc(nm(m.name))}">+</button></div>`;
function bindQty(root) {
  root.querySelectorAll('.qty button').forEach((b) => b.onclick = () => {
    const id = Number(b.dataset.id), q = Math.max(0, Math.min(50, (cart.get(id) || 0) + Number(b.dataset.d)));
    q ? cart.set(id, q) : cart.delete(id);
    // osvježi samo taj red (i košaricu), da se stranica ne pomiče
    document.querySelectorAll(`.item[data-id="${id}"]`).forEach((el) => { el.outerHTML = itemHtml(D.menu.find((m) => m.id === id)); });
    bindQty($('menu'));
    renderBar();
    if ($('sheet').dataset.kind === 'cart') openCart();
  });
}
function totals() {
  let n = 0, sum = 0;
  for (const [id, q] of cart) { const m = D.menu.find((x) => x.id === id); if (!m) continue; n += q; sum += q * m.price_cents; }
  return { n, sum };
}
function renderBar() {
  const { n, sum } = totals();
  $('cartN').textContent = n;
  $('cartTxt').textContent = n ? `${t('cart')} · ${eur(sum)}` : t('cartEmpty');
}

// kategorija koja je trenutno na ekranu
let spyObs = null;
function spy() {
  spyObs?.disconnect();
  spyObs = new IntersectionObserver((ents) => {
    const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!vis) return;
    const i = vis.target.id.slice(4);
    $('cats').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.c === i));
    $('cats').querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, { rootMargin: '-120px 0px -60% 0px' });
  document.querySelectorAll('.cat').forEach((s) => spyObs.observe(s));
}

// ---------- donja ploča ----------
function sheet(kind, title, body, foot = '') {
  $('sheet').dataset.kind = kind;
  $('sheetTitle').textContent = title; $('sheetBody').innerHTML = body; $('sheetFoot').innerHTML = foot;
  $('sheetFoot').classList.toggle('hidden', !foot);
  $('sheet').classList.add('on'); $('sheetBg').classList.add('on');
}
function closeSheet() { $('sheet').classList.remove('on'); $('sheetBg').classList.remove('on'); $('sheet').dataset.kind = ''; }
$('sheetClose').onclick = closeSheet; $('sheetBg').onclick = closeSheet;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

function history() {
  try { const h = JSON.parse(localStorage.getItem(HKEY) || '[]'); return h.filter((x) => x.day === today()); } catch { return []; }
}
function openCart() {
  const { n, sum } = totals();
  const hist = history();
  const histHtml = hist.length ? `<div class="hist"><b>${t('history')}</b>${hist.map((h) => `<div><span class="tm">${h.time}</span>${esc(h.items)}</div>`).join('')}</div>` : '';
  if (!n) { sheet('cart', t('yourOrder'), `<p class="muted" style="margin:0">${t('cartEmpty')}.</p>${histHtml}`); return; }
  const lines = [...cart].map(([id, q]) => { const m = D.menu.find((x) => x.id === id); return `<div class="line"><span class="nm">${esc(nm(m.name))}</span>${qtyHtml(m, q)}<span class="p">${eur(q * m.price_cents)}</span></div>`; }).join('');
  const prevNote = $('cNote')?.value || '';
  sheet('cart', t('yourOrder'), `<div>${lines}</div><label class="field"><span>${t('notes')}</span><textarea id="cNote" rows="2" maxlength="500">${esc(prevNote)}</textarea></label>${histHtml}`,
    `<div class="total"><span>${t('total')}</span><b>${eur(sum)}</b></div><button class="btn btn-p btn-lg btn-block" id="sendBtn">${t('send')}</button>`);
  bindQty($('sheetBody'));
  $('sendBtn').onclick = async () => {
    $('sendBtn').disabled = true;
    try {
      const items = [...cart].map(([menu_item_id, qty]) => ({ menu_item_id, qty }));
      await send({ items, notes: $('cNote').value });
      const text = items.map((i) => `${i.qty}× ${nm(D.menu.find((m) => m.id === i.menu_item_id).name)}`).join(', ');
      const h = history(); h.push({ day: today(), time: new Date().toLocaleTimeString(LOCALE[L], { hour: '2-digit', minute: '2-digit' }), items: text });
      localStorage.setItem(HKEY, JSON.stringify(h.slice(-20)));
      cart.clear(); render();
      sheet('done', t('yourOrder'), `<div class="ok-big"><div class="tick" aria-hidden="true">✓</div><h3>${t('sentTitle')}</h3><p>${t('sentText')}</p></div><div class="hist"><div>${esc(text)}</div></div>`,
        `<button class="btn btn-lg btn-block" id="okClose">${t('close')}</button>`);
      $('okClose').onclick = closeSheet;
    } catch (e) {
      toast(errText(e)); $('sendBtn').disabled = false;
      if (e.error === 'item_unavailable') reload();
    }
  };
}
$('cartBtn').onclick = openCart;

function quick(btn, kind, okText) {
  btn.onclick = async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      await send({ kind });
      toast(okText()); btn.classList.add('sent'); btn.textContent = t('sentBtn');
      setTimeout(() => { btn.disabled = false; btn.classList.remove('sent'); btn.textContent = t(kind === 'call_waiter' ? 'waiter' : 'bill'); }, 60_000);
    } catch (e) { toast(errText(e)); btn.disabled = false; }
  };
}
quick($('waiter'), 'call_waiter', () => t('waiterSent'));
quick($('bill'), 'request_bill', () => t('billSent'));

$('algBtn').onclick = () => {
  const all = [...new Set(D.menu.flatMap((m) => m.allergens))].sort((a, b) => alg(a).localeCompare(alg(b), LOCALE[L]));
  sheet('alg', t('hideWith'), `<div class="algs">${all.map((a) => `<label><input type="checkbox" value="${esc(a)}" ${avoid.has(a) ? 'checked' : ''}><span>${esc(alg(a))}</span></label>`).join('')}</div>
    <p class="small muted" style="margin:0">${t('allergyNote')}</p>`,
    `<button class="btn btn-p btn-lg btn-block" id="algOk">${t('apply')}</button><button class="btn btn-ghost btn-block" id="algClear">${t('clear')}</button>`);
  $('algOk').onclick = () => {
    avoid = new Set([...$('sheetBody').querySelectorAll('input:checked')].map((i) => i.value));
    localStorage.setItem('opsis-avoid', JSON.stringify([...avoid]));
    for (const id of [...cart.keys()]) if (!visible().some((m) => m.id === id)) cart.delete(id);
    closeSheet(); render();
  };
  $('algClear').onclick = () => { avoid = new Set(); localStorage.setItem('opsis-avoid', '[]'); closeSheet(); render(); };
};

document.querySelectorAll('.langs button').forEach((b) => b.onclick = () => { L = b.dataset.l; localStorage.setItem('opsis-lang', L); closeSheet(); render(); });

async function reload() {
  const r = await fetch(`/api/qr/${encodeURIComponent(token)}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.message || 'Error'), d);
  D = d;
  for (const id of [...cart.keys()]) if (!D.menu.some((m) => m.id === id)) cart.delete(id);
  render();
}
reload().catch((e) => { document.querySelector('.wrap').innerHTML = `<div class="msg" style="margin:24px 16px;padding:16px;border-radius:12px;background:var(--crveno-svj);color:var(--crveno);font-weight:600">${esc(errText(e))}</div>`; document.querySelector('.bar').remove(); });
