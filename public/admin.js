/* Opsis Restoran: panel za restoran (vlasnik i konobari). */
'use strict';

// ---------- osnovno ----------
const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('hr-HR');
const eur = (c) => (c / 100).toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const TZ = 'Europe/Zagreb';
const STATUS = { pending_guarantee: 'čeka karticu', confirmed: 'potvrđeno', seated: 'sjede', completed: 'završeno', cancelled: 'otkazano', no_show: 'nije došao', expired: 'isteklo' };
const SOURCE = { web: 'web', chat: 'AI chat', whatsapp: 'WhatsApp', instagram: 'Instagram', voice: 'telefon (AI)', admin: 'osoblje', walk_in: 'bez rezervacije' };
const DAY_NAMES = ['', 'Ponedjeljak', 'Utorak', 'Srijeda', 'Četvrtak', 'Petak', 'Subota', 'Nedjelja'];
const DAY_SHORT = ['', 'Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'];
const ALLERGENS = ['gluten', 'rakovi', 'jaja', 'riba', 'kikiriki', 'soja', 'mlijeko', 'orašasti plodovi', 'celer', 'gorušica', 'sezam', 'sumpor', 'lupina', 'mekušci'];
const RAMP = ['#e3eee9', '#bfd9cf', '#8fbfae', '#5e9f8a', '#357e69', '#1e4d43'];
const BASE_TITLE = document.title;

/** hrvatska množina: 1 gost, 2 gosta, 5 gostiju */
function pl(n, one, few, many) {
  const a = Math.abs(n) % 10, b = Math.abs(n) % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
}
const nGuests = (n) => `${nf.format(n)} ${pl(n, 'gost', 'gosta', 'gostiju')}`;
const nRes = (n) => `${nf.format(n)} ${pl(n, 'rezervacija', 'rezervacije', 'rezervacija')}`;
const nPers = (n) => `${n} ${pl(n, 'osoba', 'osobe', 'osoba')}`;

let S = JSON.parse(localStorage.getItem('opsis-admin') || 'null');
let SET = null;          // postavke restorana
let TABLES = [];         // svi stolovi
let DAY = null;          // { date, windows, reservations }
let DATE = null;         // odabrani dan
let VIEW = localStorage.getItem('opsis-view') || 'tl';
let TAB = 'res';

async function api(path, opts = {}) {
  const r = await fetch(`/api/admin/${encodeURIComponent(S.slug)}${path}`, {
    ...opts, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.key },
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { logout(); throw new Error('Ključ više ne vrijedi. Prijavite se ponovno.'); }
  if (!r.ok) throw Object.assign(new Error(d.message || `Greška ${r.status}`), { code: d.error });
  return d;
}
const post = (p, b) => api(p, { method: 'POST', body: JSON.stringify(b ?? {}) });
const put = (p, b) => api(p, { method: 'PUT', body: JSON.stringify(b ?? {}) });
const del = (p) => api(p, { method: 'DELETE', body: '{}' });

let toastT;
function toast(text, err = false) {
  const t = $('toast');
  t.textContent = text; t.className = 'toast on' + (err ? ' err' : '');
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = 'toast'; }, err ? 6000 : 3200);
}
/** omotač za klikove: greška ide u obavijest, ne u konzolu */
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

// ---------- vrijeme (uvijek po vremenu restorana) ----------
const fmtParts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function local(iso) {
  const p = fmtParts.formatToParts(new Date(iso)); const g = (t) => p.find((x) => x.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}
const hm = (iso) => local(iso).time;
const todayStr = () => local(new Date()).date;
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dayDiff = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000);
/** minute od ponoći odabranog dana (iza ponoći > 1440) */
function minsOn(iso, date) {
  const l = local(iso); const [h, m] = l.time.split(':').map(Number);
  return h * 60 + m + 1440 * dayDiff(l.date, date);
}
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const longDate = (d, opts = {}) => new Date(d + 'T12:00:00Z').toLocaleDateString('hr-HR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC', ...opts });
const shortDate = (iso) => { const l = local(iso); const [y, m, d] = l.date.split('-'); return `${Number(d)}. ${Number(m)}. ${y}.`; };
const natural = (a, b) => String(a).localeCompare(String(b), 'hr', { numeric: true });

// ---------- prijava i kartice ----------
function logout() {
  localStorage.removeItem('opsis-admin'); S = null; closeDrawer();
  $('app').classList.add('hidden'); $('login').classList.remove('hidden');
  document.title = BASE_TITLE;
}
$('logout').onclick = logout;
$('lForm').onsubmit = async (e) => {
  e.preventDefault();
  $('lErr').textContent = '';
  S = { slug: $('lSlug').value.trim().toLowerCase(), key: $('lKey').value.trim() };
  try {
    SET = await api('/settings');
    localStorage.setItem('opsis-admin', JSON.stringify(S));
    start();
  } catch (err) {
    S = null;
    $('lErr').textContent = err.code === 'restaurant_not_found' ? 'Restoran s tom oznakom ne postoji.' : 'Oznaka ili ključ nisu točni.';
  }
};

const LOADERS = {};
function showTab(tab) {
  if (!LOADERS[tab] || (SET?.role !== 'owner' && document.querySelector(`nav.tabs [data-tab=${tab}]`)?.hasAttribute('data-owner'))) tab = 'res';
  TAB = tab;
  document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('section[data-p]').forEach((s) => s.classList.toggle('hidden', s.dataset.p !== tab));
  if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
  LOADERS[tab]();
}
document.querySelectorAll('nav.tabs button').forEach((b) => b.onclick = () => showTab(b.dataset.tab));

function tickClock() {
  const now = new Date();
  $('clock').textContent = `${hm(now)} · ${longDate(todayStr())}`;
}

// ---------- bočna ploča ----------
let lastFocus = null;
function openDrawer(title, sub, html, onReady) {
  lastFocus = document.activeElement;
  $('drTitle').innerHTML = title; $('drSub').innerHTML = sub || '';
  $('drBody').innerHTML = html;
  $('drawer').classList.add('on'); $('scrim').classList.add('on');
  onReady?.($('drBody'));
  setTimeout(() => ($('drBody').querySelector('[autofocus]') || $('drClose')).focus(), 60);
}
function closeDrawer() {
  $('drawer').classList.remove('on'); $('scrim').classList.remove('on');
  lastFocus?.focus?.();
}
$('drClose').onclick = closeDrawer; $('scrim').onclick = closeDrawer;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('drawer').classList.contains('on')) closeDrawer(); });
const drawerOpen = () => $('drawer').classList.contains('on');

/** uređivač oznaka (VIP, alergije…) koji vraća trenutni popis */
function tagEditor(el, tags) {
  let list = [...tags];
  const draw = () => {
    el.innerHTML = list.map((t, i) => `<span class="chip ${/^vip$/i.test(t) ? 'vip' : ''}">${esc(t)}<button type="button" data-i="${i}" aria-label="Makni ${esc(t)}">×</button></span>`).join('')
      + `<input class="in" placeholder="+ oznaka, Enter" maxlength="30" list="tagSuggest">`
      + `<datalist id="tagSuggest"><option>VIP</option><option>stalni gost</option><option>bez glutena</option><option>vegan</option><option>alergija</option><option>dječja stolica</option><option>terasa</option></datalist>`;
    el.querySelectorAll('button[data-i]').forEach((b) => b.onclick = () => { list.splice(Number(b.dataset.i), 1); draw(); el.querySelector('input').focus(); });
    const inp = el.querySelector('input');
    const add = () => { const v = inp.value.trim(); if (v && !list.includes(v) && list.length < 12) list.push(v); inp.value = ''; draw(); el.querySelector('input').focus(); };
    inp.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } };
    inp.onchange = () => { if (inp.value.trim()) add(); };
  };
  draw();
  return () => {
    const pending = el.querySelector('input').value.trim();
    if (pending && !list.includes(pending)) list.push(pending);
    return list;
  };
}
const tagChips = (tags) => (tags || []).map((t) => `<span class="chip ${/^vip$/i.test(t) ? 'vip' : ''}">${/^vip$/i.test(t) ? '★ ' : ''}${esc(t)}</span>`).join(' ');
const isVip = (r) => (r.guest_tags || []).some((t) => /^vip$/i.test(t));

// =====================================================================
// REZERVACIJE
// =====================================================================
const ACTIVE = ['confirmed', 'seated', 'pending_guarantee'];
const DEAD = ['cancelled', 'expired'];

async function loadRes() {
  if (!DATE) DATE = todayStr();
  $('rDate').value = DATE;
  const w = DATE === todayStr() ? `Danas, ${longDate(DATE, { weekday: undefined })}` : longDate(DATE);
  $('rWhen').textContent = w.charAt(0).toUpperCase() + w.slice(1);
  const [day, tables] = await Promise.all([api(`/reservations?date=${DATE}`), TABLES.length ? TABLES : api('/tables')]);
  // nova rezervacija koju nije upisalo osoblje (web, chat, WhatsApp, telefon): obavijest i zvuk
  if (DAY?.date === day.date) {
    const known = new Set(DAY.reservations.map((r) => r.id));
    const fresh = day.reservations.filter((r) => !known.has(r.id) && !['admin', 'walk_in'].includes(r.source) && !DEAD.includes(r.status));
    if (fresh.length) {
      toast(fresh.length === 1 ? `Nova rezervacija (${SOURCE[fresh[0].source] || fresh[0].source}): ${fresh[0].guest_name}, ${hm(fresh[0].start_at)}, ${nPers(fresh[0].party_size)}` : `${fresh.length} nove rezervacije`);
      ding();
    }
  }
  DAY = day; TABLES = tables;
  renderRes();
}
LOADERS.res = guard(loadRes);

/** lista za večer na papiru: vrijeme, gost, osoba, stol, napomene i kvadratić za kvačicu */
$('rPrint').onclick = () => {
  const list = DAY.reservations.filter((r) => !DEAD.includes(r.status));
  const covers = list.filter((r) => r.status !== 'no_show').reduce((s, r) => s + r.party_size, 0);
  $('print').className = 'list';
  $('print').innerHTML = `<div class="plist"><h1>${esc(SET?.name || '')} · ${esc(longDate(DATE))}</h1>
    <p class="sum">${nRes(list.length)} · ${nGuests(covers)} · ispisano ${hm(new Date())}</p>
    <table><thead><tr><th></th><th>Vrijeme</th><th>Gost</th><th>Os.</th><th>Stol</th><th>Napomena</th></tr></thead><tbody>
    ${list.map((r) => `<tr><td><span class="box"></span></td><td class="t">${hm(r.start_at)}</td>
      <td><b>${isVip(r) ? '★ ' : ''}${esc(r.guest_name)}</b>${(r.guest_tags || []).filter((t) => !/^vip$/i.test(t)).length ? `<br>${esc(r.guest_tags.filter((t) => !/^vip$/i.test(t)).join(', '))}` : ''}${r.guest_phone ? `<br>${esc(r.guest_phone)}` : ''}</td>
      <td class="t">${r.party_size}</td><td><b>${esc(r.table_label || '–')}</b> ${esc(r.zone || '')}</td>
      <td>${esc([r.notes, r.guest_notes].filter(Boolean).join(' · '))}${r.status !== 'confirmed' ? ` <i>(${STATUS[r.status]})</i>` : ''}</td></tr>`).join('')}
    </tbody></table></div>`;
  print();
};

function filtered() {
  const q = $('rSearch').value.trim().toLowerCase();
  if (!q) return DAY.reservations;
  const digits = q.replace(/\D/g, '');
  return DAY.reservations.filter((r) => String(r.guest_name).toLowerCase().includes(q) || r.code.toLowerCase() === q
    || (digits.length >= 3 && String(r.guest_phone || '').replace(/\D/g, '').includes(digits)) || String(r.guest_email || '').toLowerCase().includes(q));
}

function renderRes() {
  if (!DAY) return;
  renderLedger();
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === VIEW));
  $('rTl').classList.toggle('hidden', VIEW !== 'tl'); $('rHint').classList.toggle('hidden', VIEW !== 'tl');
  $('rList').classList.toggle('hidden', VIEW !== 'list');
  if (VIEW === 'tl') renderTimeline(filtered()); else renderList(filtered());
}

function renderLedger() {
  const list = DAY.reservations;
  const live = list.filter((r) => !DEAD.includes(r.status));
  const came = live.filter((r) => r.status !== 'no_show');
  const seated = list.filter((r) => r.status === 'seated');
  const parts = [`<span><b>${live.length}</b>${pl(live.length, 'rezervacija', 'rezervacije', 'rezervacija')}</span>`,
    `<span><b>${came.reduce((s, r) => s + r.party_size, 0)}</b>${pl(came.reduce((s, r) => s + r.party_size, 0), 'gost', 'gosta', 'gostiju')}</span>`];
  if (DATE === todayStr()) {
    const now = Date.now();
    const soon = list.filter((r) => r.status === 'confirmed' && new Date(r.start_at).getTime() >= now && new Date(r.start_at).getTime() < now + 3600_000);
    const late = list.filter((r) => r.status === 'confirmed' && new Date(r.start_at).getTime() < now - 15 * 60_000 && new Date(r.end_at).getTime() > now);
    parts.push(`<span><b>${seated.length}</b>${seated.length === 1 ? 'stol sjedi' : 'stolova sjedi'}</span>`);
    parts.push(`<span><b>${soon.length}</b>stiže u idućih sat vremena</span>`);
    if (late.length) parts.push(`<span class="att"><b>${late.length}</b>${pl(late.length, 'kasni', 'kasne', 'kasni')} više od 15 min</span>`);
  }
  const pend = list.filter((r) => r.status === 'pending_guarantee').length;
  const ns = list.filter((r) => r.status === 'no_show').length;
  const vip = live.filter(isVip).length;
  if (pend) parts.push(`<span class="att"><b>${pend}</b>čeka karticu</span>`);
  if (vip) parts.push(`<span class="att"><b>${vip}</b>VIP</span>`);
  if (ns) parts.push(`<span class="bad"><b>${ns}</b>nije došlo</span>`);
  const closed = !DAY.windows.length;
  if (closed) parts.push('<span class="muted">Taj dan restoran ne radi.</span>');
  $('rLedger').innerHTML = parts.join('');
}

function renderTimeline(list) {
  const date = DATE;
  const shown = list.filter((r) => !DEAD.includes(r.status));
  const starts = [...DAY.windows.map((w) => w.start), ...shown.map((r) => minsOn(r.start_at, date))];
  const ends = [...DAY.windows.map((w) => w.end), ...shown.map((r) => minsOn(r.end_at, date))];
  let a = starts.length ? Math.min(...starts) : 12 * 60, b = ends.length ? Math.max(...ends) : 23 * 60;
  a = Math.floor(a / 60) * 60; b = Math.max(a + 180, Math.ceil(b / 60) * 60);
  const PX = innerWidth < 640 ? 72 : innerWidth < 1100 ? 84 : 100;
  const W = ((b - a) / 60) * PX;
  const x = (m) => ((m - a) / 60) * PX;

  const byTable = new Map();
  for (const r of shown) {
    if (!byTable.has(r.table_id)) byTable.set(r.table_id, []);
    byTable.get(r.table_id).push({ r, ghost: null });
  }
  // spojeni stol zauzima i svoje dijelove: na njima se crta sjena
  for (const t of TABLES.filter((t) => t.combo_of?.length)) {
    for (const { r } of byTable.get(t.id) || []) {
      for (const part of t.combo_of) {
        if (!byTable.has(part)) byTable.set(part, []);
        byTable.get(part).push({ r, ghost: t.label });
      }
    }
  }
  const closedBands = [];
  let cur = a;
  for (const w of [...DAY.windows].sort((p, q) => p.start - q.start)) { if (w.start > cur) closedBands.push([cur, w.start]); cur = Math.max(cur, w.end); }
  if (cur < b) closedBands.push([cur, b]);
  const closedHtml = closedBands.map(([s, e]) => `<div class="tl-closed" style="left:${x(s)}px;width:${x(e) - x(s)}px"></div>`).join('');

  const hours = [];
  for (let m = a; m < b; m += 60) hours.push(`<div class="tl-hour" style="left:${x(m)}px">${String((m / 60) % 24).padStart(2, '0')}</div>`);

  const zones = [...new Set(TABLES.map((t) => t.zone))];
  const rows = [];
  for (const z of zones) {
    rows.push(`<div class="tl-zone"><div class="tl-lab">${esc(z)}</div><div class="tl-track" style="width:${W}px"></div></div>`);
    const tabs = TABLES.filter((t) => t.zone === z).sort((p, q) => Number(!!p.combo_of?.length) - Number(!!q.combo_of?.length) || natural(p.label, q.label));
    for (const t of tabs) {
      const items = (byTable.get(t.id) || []).sort((p, q) => Number(!p.ghost) - Number(!q.ghost));
      if (!t.active && !items.length) continue;
      const blocks = items.map(({ r, ghost }) => {
        const s = minsOn(r.start_at, date), e = minsOn(r.end_at, date);
        const left = x(Math.max(s, a)), width = Math.max(x(Math.min(e, b)) - left - 3, 24);
        if (ghost) return `<div class="blk ghost" style="left:${left}px;width:${width}px" title="Zauzet: spojeni stol ${esc(ghost)}">spojeno ${esc(ghost)}</div>`;
        const tip = `${hm(r.start_at)}–${hm(r.end_at)} · ${r.guest_name} · ${nPers(r.party_size)} · ${STATUS[r.status]}${r.notes ? ' · ' + r.notes : ''}`;
        return `<button class="blk st-${r.status}" data-r="${r.id}" style="left:${left}px;width:${width}px" title="${esc(tip)}">
          <span>${isVip(r) ? '<span class="vip">★</span> ' : ''}${esc(r.guest_name)}</span>
          <small>${hm(r.start_at)} · ${r.party_size} os.${r.notes || r.guest_notes ? ' · ✎' : ''}</small></button>`;
      }).join('');
      const cap = t.min_capacity === t.max_capacity ? `${t.max_capacity}` : `${t.min_capacity}–${t.max_capacity}`;
      rows.push(`<div class="tl-row ${t.active ? '' : 'off'}" data-t="${t.id}" data-zone="${esc(t.zone)}">
        <div class="tl-lab"><b>${esc(t.label)}</b><span class="cap">${cap}</span></div>
        <div class="tl-track" style="width:${W}px">${closedHtml}${blocks}</div></div>`);
    }
  }
  const unassigned = shown.filter((r) => !r.table_id);
  if (unassigned.length) {
    rows.push(`<div class="tl-zone"><div class="tl-lab">bez stola</div><div class="tl-track" style="width:${W}px"></div></div>`);
    rows.push(`<div class="tl-row"><div class="tl-lab"><b>?</b></div><div class="tl-track" style="width:${W}px">${unassigned.map((r) =>
      `<button class="blk st-${r.status}" data-r="${r.id}" style="left:${x(minsOn(r.start_at, date))}px;width:${Math.max(x(minsOn(r.end_at, date)) - x(minsOn(r.start_at, date)) - 3, 24)}px"><span>${esc(r.guest_name)}</span><small>${hm(r.start_at)}</small></button>`).join('')}</div></div>`);
  }
  let now = '';
  const isToday = date === todayStr();
  if (isToday) {
    const nm = minsOn(new Date().toISOString(), date);
    if (nm >= a && nm <= b) now = `<div class="tl-nowlayer"><div class="now" style="left:${x(nm)}px"><span>${hhmm(nm)}</span></div></div>`;
  }
  const wrap = $('rTl');
  const keepScroll = wrap.dataset.date === date ? wrap.scrollLeft : null;
  wrap.innerHTML = TABLES.length
    ? `<div class="tl" style="width:calc(var(--lab) + ${W}px);--hour:${PX}px">
        <div class="tl-head"><div class="tl-lab"><span class="small muted">stol · os.</span></div><div class="tl-track" style="width:${W}px">${hours.join('')}</div></div>
        ${rows.join('')}${now}</div>`
    : `<div class="empty"><b>Još nema stolova</b>Vlasnik ih dodaje u kartici Stolovi i QR.</div>`;
  if (keepScroll !== null) wrap.scrollLeft = keepScroll;
  else if (isToday && x(minsOn(new Date().toISOString(), date)) > wrap.clientWidth * 0.6) wrap.scrollLeft = x(minsOn(new Date().toISOString(), date)) - wrap.clientWidth * 0.3;
  else wrap.scrollLeft = 0;
  wrap.dataset.date = date;

  wrap.querySelectorAll('.blk[data-r]').forEach((el) => el.onclick = (e) => { e.stopPropagation(); openRes(Number(el.dataset.r)); });
  wrap.querySelectorAll('.tl-row[data-t] .tl-track').forEach((tr) => tr.onclick = (e) => {
    if (e.target.closest('.blk')) return;
    const rect = tr.getBoundingClientRect();
    const slot = SET?.slot_minutes || 30;
    let m = a + Math.floor(((e.clientX - rect.left) / PX) * 60 / slot) * slot;
    const row = tr.parentElement;
    const d = m >= 1440 ? addDays(date, 1) : date;
    newReservation({ date: d, time: hhmm(m % 1440), zone: row.dataset.zone, tableId: Number(row.dataset.t) });
  });
}

function actionButtons(r, small = true) {
  const s = small ? 'btn-s' : '';
  const out = [];
  if (['confirmed', 'pending_guarantee'].includes(r.status)) {
    out.push(`<button class="btn btn-p ${s}" data-act="seated" data-id="${r.id}">Sjeli su</button>`);
    out.push(`<button class="btn ${s}" data-act="no_show" data-id="${r.id}">Nisu došli</button>`);
  }
  if (r.status === 'seated') out.push(`<button class="btn btn-p ${s}" data-act="completed" data-id="${r.id}">Otišli su</button>`);
  return out.join('');
}

async function doStatus(id, status) {
  if (status === 'no_show') {
    const r = DAY.reservations.find((x) => x.id === id);
    const fee = r?.stripe_payment_method_id && SET?.no_show_fee_cents ? `\n\nGost je ostavio karticu: naplatit će se ${eur(SET.no_show_fee_cents * r.party_size)}.` : '';
    if (!confirm(`Označiti da gost nije došao?${fee}`)) return false;
  }
  await post(`/reservations/${id}/status`, { status });
  toast({ seated: 'Označeno: sjeli su.', no_show: 'Označeno: nisu došli.', completed: 'Stol je slobodan.', confirmed: 'Vraćeno na potvrđeno.' }[status] || 'Spremljeno.');
  return true;
}
function bindActions(root, after) {
  root.querySelectorAll('[data-act]').forEach((b) => b.onclick = guard(async (e) => {
    e.stopPropagation();
    if (await doStatus(Number(b.dataset.id), b.dataset.act)) await after();
  }));
}

function renderList(list) {
  const el = $('rList');
  if (!list.length) {
    el.innerHTML = $('rSearch').value.trim()
      ? '<div class="empty"><b>Nitko ne odgovara pretrazi</b>Provjerite ime, broj ili šifru.</div>'
      : `<div class="empty"><b>Nema rezervacija za ovaj dan</b>Dodajte rezervaciju s telefona gumbom „+ Rezervacija”.</div>`;
    return;
  }
  el.innerHTML = list.map((r) => `<div class="ri st-${r.status}" data-r="${r.id}" tabindex="0" role="button" aria-label="${esc(r.guest_name)}, ${hm(r.start_at)}">
    <div class="t">${hm(r.start_at)}</div>
    <div class="who"><b>${isVip(r) ? '<span style="color:var(--ulje)">★</span> ' : ''}${esc(r.guest_name)}</b>
      <div class="sub"><span class="pill st-${r.status}">${STATUS[r.status]}</span>${tagChips((r.guest_tags || []).filter((t) => !/^vip$/i.test(t)))}
        <span>${esc(SOURCE[r.source] || r.source)}</span>${r.visits ? `<span>${r.visits}× bio</span>` : ''}${r.no_shows ? `<span style="color:var(--crveno)">${r.no_shows}× nije došao</span>` : ''}</div></div>
    <div class="ps">${r.party_size}<small> os.</small></div>
    <div class="tb"><b>${esc(r.table_label || '–')}</b> <span class="small muted">${esc(r.zone || '')}</span></div>
    <div class="acts">${actionButtons(r)}</div>
    ${r.notes || r.guest_notes ? `<div class="note">✎ ${esc([r.notes, r.guest_notes].filter(Boolean).join(' · '))}</div>` : ''}
  </div>`).join('');
  el.querySelectorAll('.ri').forEach((row) => {
    row.onclick = () => openRes(Number(row.dataset.r));
    row.onkeydown = (e) => { if (e.key === 'Enter' && e.target === row) openRes(Number(row.dataset.r)); };
  });
  bindActions(el, loadRes);
}

$('rPrev').onclick = () => { DATE = addDays(DATE, -1); LOADERS.res(); };
$('rNext').onclick = () => { DATE = addDays(DATE, 1); LOADERS.res(); };
$('rToday').onclick = () => { DATE = todayStr(); LOADERS.res(); };
$('rDate').onchange = () => { if ($('rDate').value) { DATE = $('rDate').value; LOADERS.res(); } };
$('rSearch').oninput = () => renderRes();
document.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { VIEW = b.dataset.view; localStorage.setItem('opsis-view', VIEW); renderRes(); });
$('rNew').onclick = () => newReservation({ date: DATE });
$('rWalk').onclick = () => walkIn();

// ---------- detalji rezervacije ----------
function tableOptions(selectedId, partySize) {
  return TABLES.filter((t) => t.active).sort((p, q) => natural(p.zone, q.zone) || natural(p.label, q.label)).map((t) =>
    `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${esc(t.label)} · ${esc(t.zone)} · do ${t.max_capacity} os.${partySize > t.max_capacity ? ' (premalen)' : ''}</option>`).join('');
}

function openRes(id) {
  const r = DAY?.reservations.find((x) => x.id === id);
  if (!r) return;
  const open = ['confirmed', 'pending_guarantee'].includes(r.status);
  const active = ACTIVE.includes(r.status);
  const phone = r.guest_phone ? String(r.guest_phone) : '';
  const wa = phone.replace(/\D/g, '');
  const contact = [phone && `<a href="tel:${esc(phone)}">${esc(phone)}</a> · <a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>`,
    r.guest_email && `<a href="mailto:${esc(r.guest_email)}">${esc(r.guest_email)}</a>`].filter(Boolean).join('<br>') || '<span class="muted">nema</span>';
  const startL = local(r.start_at);
  const review = reviewBox(r);
  const html = `
    <div class="dr-sec">
      <dl class="facts">
        <dt>Kada</dt><dd>${hm(r.start_at)}–${hm(r.end_at)}, ${longDate(startL.date)}</dd>
        <dt>Osoba</dt><dd>${r.party_size}</dd>
        <dt>Stol</dt><dd>${esc(r.table_label || '–')} <span class="muted">${esc(r.zone || '')}</span></dd>
        <dt>Kontakt</dt><dd>${contact}</dd>
        <dt>Gost</dt><dd>${r.visits ? `${r.visits}× bio` : 'prvi put'}${r.no_shows ? ` · <span style="color:var(--crveno)">${r.no_shows}× nije došao</span>` : ''}</dd>
        <dt>Izvor</dt><dd>${esc(SOURCE[r.source] || r.source)} <span class="muted small">· ${shortDate(r.created_at)} u ${hm(r.created_at)}</span></dd>
      </dl>
    </div>
    ${actionButtons(r, false) || r.status === 'seated' ? `<div class="dr-sec"><h4>Status</h4><div class="acts-big">${actionButtons(r, false)}
      ${r.status === 'seated' ? `<button class="btn" data-act="confirmed" data-id="${r.id}">Vrati na „potvrđeno”</button>` : ''}
      ${open ? `<button class="btn btn-danger" id="dCancel">Otkaži rezervaciju</button>` : ''}</div></div>` : ''}
    ${review ? `<div class="dr-sec"><h4>Google recenzija</h4>${review}</div>` : ''}
    ${open ? `<form class="dr-sec" id="dMod"><h4>Promijeni termin</h4>
      <div class="row3"><label class="field"><span>Datum</span><input type="date" name="date" value="${startL.date}" required></label>
      <label class="field"><span>Vrijeme</span><input type="time" name="time" value="${startL.time}" step="${(SET?.slot_minutes || 30) * 60}" required></label>
      <label class="field"><span>Osoba</span><input type="number" name="party" min="1" value="${r.party_size}" required></label></div>
      <div><button class="btn">Spremi promjenu</button> <span class="small muted">Gost dobiva poruku s novim terminom.</span></div></form>` : ''}
    ${active ? `<form class="dr-sec" id="dMove"><h4>Premjesti na drugi stol</h4>
      <div style="display:flex;gap:8px"><select class="in" name="table">${tableOptions(r.table_id, r.party_size)}</select><button class="btn">Premjesti</button></div></form>` : ''}
    <form class="dr-sec" id="dNote"><h4>Napomena uz ovu rezervaciju</h4>
      <textarea class="in" name="notes" rows="2" maxlength="500" placeholder="npr. rođendan, torta u 21 h">${esc(r.notes)}</textarea>
      <div><button class="btn btn-s">Spremi napomenu</button></div></form>
    <form class="dr-sec" id="dGuest"><h4>O gostu (vidi se kod svakog dolaska)</h4>
      <div class="tags-edit" id="dTags"></div>
      <textarea class="in" name="gnotes" rows="2" maxlength="1000" placeholder="npr. voli stol uz prozor, alergičan na orašaste plodove">${esc(r.guest_notes || '')}</textarea>
      <div><button class="btn btn-s">Spremi podatke o gostu</button></div></form>`;
  const sub = `<span class="pill st-${r.status}">${STATUS[r.status]}</span> <span class="mono" style="margin-left:6px">šifra ${esc(r.code)}</span>`;
  openDrawer(`${isVip(r) ? '<span style="color:var(--ulje)">★</span> ' : ''}${esc(r.guest_name)}`, sub, html, (body) => {
    const reopen = async () => { await loadRes(); if (drawerOpen()) openRes(id); };
    bindActions(body, reopen);
    body.querySelectorAll('[data-rv]').forEach((b) => b.onclick = guard(async () => {
      await post(`/reservations/${id}/review`, { approve: b.dataset.rv === '1' }); toast(b.dataset.rv === '1' ? 'Upit za recenziju će se poslati.' : 'Upit se neće slati.'); await reopen();
    }));
    const c = body.querySelector('#dCancel');
    if (c) c.onclick = guard(async () => {
      if (!confirm(`Otkazati rezervaciju za ${r.guest_name}? Gost dobiva poruku o otkazu.`)) return;
      await post(`/reservations/${r.code}/cancel`); toast('Rezervacija je otkazana.'); await reopen();
    });
    const mod = body.querySelector('#dMod');
    if (mod) mod.onsubmit = guard(async (e) => {
      e.preventDefault(); const f = new FormData(mod);
      const u = await post(`/reservations/${r.code}/modify`, { date: f.get('date'), time: f.get('time'), partySize: Number(f.get('party')) });
      toast(`Termin promijenjen: ${hm(u.start_at)}, stol ${TABLES.find((t) => t.id === u.table_id)?.label ?? ''}.`);
      DATE = local(u.start_at).date; await reopen();
    });
    const mv = body.querySelector('#dMove');
    if (mv) mv.onsubmit = guard(async (e) => {
      e.preventDefault();
      const tableId = Number(new FormData(mv).get('table'));
      try { await post(`/reservations/${id}/table`, { tableId }); }
      catch (err) {
        if (err.code !== 'table_too_small' || !confirm(`${err.message}. Ipak premjestiti (dodajete stolice)?`)) throw err;
        await post(`/reservations/${id}/table`, { tableId, force: true });
      }
      toast(`Premješteno na stol ${TABLES.find((t) => t.id === tableId)?.label}.`); await reopen();
    });
    body.querySelector('#dNote').onsubmit = guard(async (e) => {
      e.preventDefault(); await post(`/reservations/${id}/notes`, { notes: new FormData(e.target).get('notes') }); toast('Napomena spremljena.'); await reopen();
    });
    const getTags = tagEditor(body.querySelector('#dTags'), r.guest_tags || []);
    body.querySelector('#dGuest').onsubmit = guard(async (e) => {
      e.preventDefault(); await put(`/guests/${r.guest_id}`, { tags: getTags(), notes: new FormData(e.target).get('gnotes') }); toast('Podaci o gostu spremljeni.'); await reopen();
    });
  });
}

/** upit za Google recenziju: konobar odobrava (review_mode = approval) */
function reviewBox(r) {
  if (!['seated', 'completed'].includes(r.status) || !SET || SET.review_mode === 'off' || !SET.google_review_url) return '';
  if (r.review_request_sent_at) return '<p class="muted" style="margin:0">Upit za recenziju je poslan.</p>';
  if (r.review_decision === 'declined') return `<div class="acts-big"><span class="muted">Ne šalje se.</span><button class="btn btn-s" data-rv="1">Ipak pošalji</button></div>`;
  if (r.review_decision === 'approved') return `<div class="acts-big"><span class="muted">Odobreno, šalje se 2 h nakon posjeta.</span><button class="btn btn-s" data-rv="0">Poništi</button></div>`;
  if (SET.review_mode === 'auto') return `<div class="acts-big"><span class="muted">Šalje se automatski 2 h nakon posjeta.</span><button class="btn btn-s" data-rv="0">Ne šalji ovom gostu</button></div>`;
  return `<div class="acts-big"><button class="btn btn-p" data-rv="1">★ Pošalji upit za recenziju</button><button class="btn" data-rv="0">Ne šalji</button></div>`;
}

function newReservation(pre = {}) {
  const zones = [...new Set(TABLES.filter((t) => t.active).map((t) => t.zone))];
  const target = pre.tableId ? TABLES.find((t) => t.id === pre.tableId) : null;
  const html = `<form class="dr-sec" id="nForm">
    <label class="field"><span>Ime i prezime</span><input name="name" required autofocus autocomplete="off"></label>
    <div class="row2"><label class="field"><span>Mobitel</span><input name="phone" type="tel" placeholder="091 234 5678"></label>
    <label class="field"><span>Email</span><input name="email" type="email"></label></div>
    <div class="row3"><label class="field"><span>Datum</span><input type="date" name="date" value="${pre.date || DATE}" required></label>
    <label class="field"><span>Vrijeme</span><input type="time" name="time" value="${pre.time || ''}" step="${(SET?.slot_minutes || 30) * 60}" required></label>
    <label class="field"><span>Osoba</span><input type="number" name="party" value="2" min="1" required></label></div>
    <div class="row2"><label class="field"><span>Gdje</span><select name="zone"><option value="">svejedno</option>${zones.map((z) => `<option ${z === pre.zone ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
    <label class="field"><span>Jezik poruka gostu</span><select name="language"><option value="hr">hrvatski</option><option value="en">engleski</option><option value="de">njemački</option></select></label></div>
    <label class="field"><span>Napomena</span><input name="notes" maxlength="500" placeholder="alergije, prigoda…"></label>
    <p class="small muted" style="margin:0">Treba mobitel ili email: na njega ide potvrda i podsjetnik.</p>
    <div><button class="btn btn-p btn-lg">Spremi rezervaciju</button></div></form>`;
  openDrawer('Nova rezervacija', target ? `za stol <b>${esc(target.label)}</b> (${esc(target.zone)})` : 's telefona ili uživo', html, (body) => {
    body.querySelector('#nForm').onsubmit = guard(async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const btn = e.target.querySelector('button'); btn.disabled = true;
      try {
        const res = await post('/reservations', {
          name: f.get('name'), phone: f.get('phone'), email: f.get('email'), date: f.get('date'), time: f.get('time'),
          partySize: Number(f.get('party')), zone: f.get('zone') || undefined, notes: f.get('notes'), language: f.get('language'),
        });
        let msg = `Spremljeno, šifra ${res.code}, stol ${TABLES.find((t) => t.id === res.table_id)?.label ?? ''}.`;
        if (target && res.table_id !== target.id) {
          try { await post(`/reservations/${res.id}/table`, { tableId: target.id }); msg = `Spremljeno na stol ${target.label}, šifra ${res.code}.`; }
          catch (err) { msg += ` Stol ${target.label} nije moguć: ${err.message}.`; }
        }
        toast(msg); DATE = f.get('date'); closeDrawer(); await loadRes();
      } catch (err) {
        if (err.code === 'no_table') throw new Error('Nema slobodnog stola u to vrijeme za toliko osoba.');
        throw err;
      } finally { btn.disabled = false; }
    });
  });
}

function walkIn() {
  const html = `<form class="dr-sec" id="wForm">
    <div class="row2"><label class="field"><span>Koliko osoba</span><input type="number" name="party" value="2" min="1" max="100" required autofocus></label>
    <label class="field"><span>Stol</span><select name="table"><option value="">prvi slobodni koji odgovara</option>${tableOptions(null, 0)}</select></label></div>
    <label class="field"><span>Ime <span class="hint">nije obavezno</span></span><input name="name" autocomplete="off"></label>
    <label class="field"><span>Mobitel <span class="hint">nije obavezno; ako je stalni gost, posjet se zapiše njemu</span></span><input name="phone" type="tel"></label>
    <label class="field"><span>Napomena</span><input name="notes" maxlength="500"></label>
    <div><button class="btn btn-p btn-lg">Posjedni odmah</button></div></form>`;
  openDrawer('Gost bez rezervacije', `sjeda sada, ${hm(new Date())}, na ${SET?.default_duration_minutes || 120} min`, html, (body) => {
    body.querySelector('#wForm').onsubmit = guard(async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const payload = { partySize: Number(f.get('party')), tableId: f.get('table') ? Number(f.get('table')) : null, name: f.get('name'), phone: f.get('phone'), notes: f.get('notes') };
      let w;
      try { w = await post('/walkin', payload); }
      catch (err) {
        if (err.code !== 'table_too_small' || !confirm(`${err.message}. Ipak posjesti (dodajete stolice)?`)) throw err;
        w = await post('/walkin', { ...payload, force: true });
      }
      toast(`Posjednuto za stol ${w.table_label}.`); DATE = todayStr(); closeDrawer(); await loadRes();
    });
  });
}

// =====================================================================
// NARUDŽBE
// =====================================================================
let seenOrders = null, ORDERS = [];
let audio = null;
$('oSound').checked = localStorage.getItem('opsis-sound') === '1';
$('oSound').onchange = () => {
  localStorage.setItem('opsis-sound', $('oSound').checked ? '1' : '0');
  if ($('oSound').checked) { audio ??= new AudioContext(); ding(); }
};
function ding() {
  if (!$('oSound').checked) return;
  try {
    audio ??= new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * 0.18;
      o.frequency.value = f; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t); o.stop(t + 0.4);
    });
  } catch {}
}
async function pollOrders() {
  if (!S) return;
  const list = await api('/orders');
  ORDERS = list;
  const n = list.filter((o) => o.status === 'new').length;
  $('ordCount').textContent = n || '';
  document.title = n ? `(${n}) ${BASE_TITLE}` : BASE_TITLE;
  if (seenOrders && list.some((o) => !seenOrders.has(o.id))) ding();
  seenOrders = new Set(list.map((o) => o.id));
  if (TAB === 'orders') renderOrders();
}
LOADERS.orders = guard(pollOrders);
const KIND = { order: 'Narudžba', call_waiter: 'Zove konobara', request_bill: 'Traži račun' };
function age(iso) { const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'upravo' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; }
function renderOrders() {
  const el = $('oList');
  if (!ORDERS.length) { el.innerHTML = '<div class="empty" style="grid-column:1/-1"><b>Nema otvorenih narudžbi</b>Kad gost naruči ili pozove konobara preko QR koda na stolu, pojavit će se ovdje.</div>'; return; }
  el.innerHTML = ORDERS.map((o) => {
    const mins = (Date.now() - new Date(o.created_at).getTime()) / 60000;
    const late = o.status === 'new' && mins > (o.kind === 'order' ? 10 : 3);
    return `<div class="ord ${o.kind} ${late ? 'late' : ''}">
      <div class="ord-h"><h3>Stol ${esc(o.table_label)}</h3><span class="sp"></span><span class="age" data-age="${o.created_at}">${age(o.created_at)}</span></div>
      <div><span class="pill ${o.status === 'new' ? 'st-pending_guarantee' : 'st-confirmed'}">${o.status === 'new' ? 'novo' : 'prihvaćeno'}</span> <b>${KIND[o.kind]}</b> <span class="small muted">u ${hm(o.created_at)}</span></div>
      ${o.items.length ? `<ul>${o.items.map((i) => `<li><b>${i.qty}×</b> ${esc(i.name)}</li>`).join('')}</ul><div class="tot">ukupno ${eur(o.total_cents)}</div>` : ''}
      ${o.notes ? `<div class="nt">✎ ${esc(o.notes)}</div>` : ''}
      <div class="acts-big">${o.status === 'new' ? `<button class="btn btn-p" data-o="${o.id}" data-s="accepted">Prihvati</button>` : ''}
        <button class="btn ${o.status === 'new' ? '' : 'btn-p'}" data-o="${o.id}" data-s="served">${o.kind === 'order' ? 'Posluženo' : 'Riješeno'}</button>
        <button class="btn btn-ghost btn-danger" data-o="${o.id}" data-s="cancelled">Poništi</button></div></div>`;
  }).join('');
  el.querySelectorAll('[data-o]').forEach((b) => b.onclick = guard(async () => {
    if (b.dataset.s === 'cancelled' && !confirm('Poništiti ovaj zahtjev?')) return;
    await post(`/orders/${b.dataset.o}/status`, { status: b.dataset.s }); await pollOrders();
  }));
}

// =====================================================================
// GOSTI
// =====================================================================
let gTimer;
async function loadGuests() {
  const q = $('gSearch').value.trim();
  const list = await api(`/guests${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const t = $('gTable');
  if (!list.length) {
    t.innerHTML = `<tbody><tr><td><div class="empty" style="border:0"><b>${q ? 'Nitko ne odgovara pretrazi' : 'Još nema gostiju'}</b>${q ? 'Probajte dio imena, zadnje znamenke broja ili oznaku.' : 'Gosti se pojavljuju sami, s prvom rezervacijom.'}</div></td></tr></tbody>`;
    return;
  }
  t.innerHTML = `<thead><tr><th>Gost</th><th>Kontakt</th><th class="num">Bio</th><th class="num">Nije došao</th><th>Zadnji put</th><th>Sljedeći dolazak</th></tr></thead><tbody>${list.map((g) => `
    <tr class="click" data-g="${g.id}" tabindex="0"><td><b>${esc(g.name)}</b> ${tagChips(g.tags)}${g.notes ? `<div class="small muted">${esc(g.notes.slice(0, 90))}</div>` : ''}</td>
    <td class="small">${esc(g.phone || '')}${g.phone && g.email ? '<br>' : ''}${esc(g.email || '')}</td>
    <td class="num">${g.visits}</td><td class="num" style="${g.no_shows ? 'color:var(--crveno);font-weight:700' : ''}">${g.no_shows}</td>
    <td class="small">${g.last_visit ? shortDate(g.last_visit) : '–'}</td><td class="small">${g.next_visit ? `<b>${shortDate(g.next_visit)} u ${hm(g.next_visit)}</b>` : '–'}</td></tr>`).join('')}</tbody>`;
  t.querySelectorAll('tr[data-g]').forEach((row) => {
    const go = () => openGuest(list.find((g) => g.id === Number(row.dataset.g)));
    row.onclick = go; row.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  });
}
LOADERS.guests = guard(loadGuests);
$('gSearch').oninput = () => { clearTimeout(gTimer); gTimer = setTimeout(LOADERS.guests, 250); };

async function openGuest(g) {
  const hist = await api(`/guests/${g.id}/reservations`).catch(() => []);
  const owner = SET?.role === 'owner';
  const html = `<form class="dr-sec" id="gForm">
      <label class="field"><span>Ime</span><input name="name" value="${esc(g.name)}" required></label>
      <div class="field"><span>Oznake</span><div class="tags-edit" id="gTags"></div></div>
      <label class="field"><span>Bilješka</span><textarea name="notes" rows="3" maxlength="1000">${esc(g.notes)}</textarea></label>
      <div><button class="btn btn-p">Spremi</button></div></form>
    <div class="dr-sec"><h4>Kontakt</h4><dl class="facts"><dt>Mobitel</dt><dd>${g.phone ? `<a href="tel:${esc(g.phone)}">${esc(g.phone)}</a>` : '–'}</dd><dt>Email</dt><dd>${esc(g.email || '–')}</dd>
      <dt>Bio</dt><dd>${g.visits}×</dd><dt>Nije došao</dt><dd>${g.no_shows}×</dd></dl></div>
    <div class="dr-sec"><h4>Rezervacije</h4>${hist.length ? `<table class="tbl"><tbody>${hist.map((h) => `<tr><td class="mono small">${shortDate(h.start_at)} ${hm(h.start_at)}</td><td>${h.party_size} os.</td><td>${esc(h.table_label || '')}</td><td><span class="pill st-${h.status}">${STATUS[h.status]}</span></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nema.</p>'}</div>
    ${owner ? `<div class="dr-sec"><h4>Brisanje podataka (GDPR)</h4><p class="small muted" style="margin:0">Na zahtjev gosta: briše ime, kontakt, bilješke i razgovore. Broj rezervacija ostaje u statistici bez imena.</p>
      <div><button class="btn btn-danger" id="gDel">Trajno obriši podatke gosta</button></div></div>` : ''}`;
  openDrawer(esc(g.name), `${g.reservations} ${pl(g.reservations, 'rezervacija', 'rezervacije', 'rezervacija')}`, html, (body) => {
    const getTags = tagEditor(body.querySelector('#gTags'), g.tags || []);
    body.querySelector('#gForm').onsubmit = guard(async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      await put(`/guests/${g.id}`, { name: f.get('name'), notes: f.get('notes'), tags: getTags() });
      toast('Spremljeno.'); closeDrawer(); await loadGuests();
    });
    const d = body.querySelector('#gDel');
    if (d) d.onclick = guard(async () => {
      if (!confirm(`Trajno obrisati podatke za ${g.name}? Ovo se ne može vratiti.`)) return;
      const r = await post('/guests/anonymize', g.phone ? { phone: g.phone } : { email: g.email });
      toast(r.anonymized ? 'Podaci gosta su obrisani.' : 'Gost nije pronađen.'); closeDrawer(); await loadGuests();
    });
  });
}

// =====================================================================
// MENI
// =====================================================================
let MENU = [];
async function loadMenu() {
  MENU = await api('/menu');
  const el = $('mList');
  if (!MENU.length) { el.innerHTML = '<div class="empty"><b>Meni je prazan</b>Dodajte prvo jelo ili piće. Gosti ga vide čim je spremljeno.</div>'; return; }
  const cats = [...new Set(MENU.map((m) => m.category))];
  el.innerHTML = cats.map((c, ci) => `<div class="cat"><h3>${esc(c)}</h3><span class="small muted">${MENU.filter((m) => m.category === c).length}</span>
      <span style="flex:1"></span><button class="btn btn-ghost btn-s" data-cmove="${ci}" data-d="-1" ${ci === 0 ? 'disabled' : ''} aria-label="Kategorija gore">↑</button><button class="btn btn-ghost btn-s" data-cmove="${ci}" data-d="1" ${ci === cats.length - 1 ? 'disabled' : ''} aria-label="Kategorija dolje">↓</button></div>`
    + MENU.filter((m) => m.category === c).map((m, i, arr) => `<div class="mi ${m.available ? '' : 'off'}">
      <div><div class="nm">${esc(m.name.hr || m.name.en)}</div>
        ${m.name.en || m.name.de ? `<div class="tr">${[m.name.en && 'EN ' + esc(m.name.en), m.name.de && 'DE ' + esc(m.name.de)].filter(Boolean).join(' · ')}</div>` : ''}
        ${m.description?.hr ? `<div class="ds">${esc(m.description.hr)}</div>` : ''}
        ${m.allergens.length ? `<div class="al">${m.allergens.map((a) => `<span class="chip">${esc(a)}</span>`).join('')}</div>` : ''}</div>
      <div class="pr">${eur(m.price_cents)}</div>
      <label class="switch sw"><input type="checkbox" data-av="${m.id}" ${m.available ? 'checked' : ''}><span>${m.available ? 'ima' : 'nema'}</span></label>
      <div class="ops"><button class="btn btn-ghost btn-s" data-move="${m.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Gore">↑</button><button class="btn btn-ghost btn-s" data-move="${m.id}" data-d="1" ${i === arr.length - 1 ? 'disabled' : ''} aria-label="Dolje">↓</button>
        <button class="btn btn-s" data-edit="${m.id}">Uredi</button></div></div>`).join('')).join('');
  el.querySelectorAll('[data-av]').forEach((cb) => cb.onchange = guard(async () => {
    const m = MENU.find((x) => x.id === Number(cb.dataset.av));
    await put(`/menu/${m.id}`, itemPayload(m, { available: cb.checked }));
    toast(cb.checked ? 'Jelo je opet u meniju.' : 'Jelo je sakriveno iz menija.'); await loadMenu();
  }));
  el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editItem(MENU.find((x) => x.id === Number(b.dataset.edit))));
  el.querySelectorAll('[data-move]').forEach((b) => b.onclick = guard(() => reorder({ item: Number(b.dataset.move), d: Number(b.dataset.d) })));
  el.querySelectorAll('[data-cmove]').forEach((b) => b.onclick = guard(() => reorder({ cat: Number(b.dataset.cmove), d: Number(b.dataset.d) })));
}
LOADERS.menu = guard(loadMenu);
const itemPayload = (m, over = {}) => ({ category: m.category, name: m.name, description: m.description || {}, price_cents: m.price_cents,
  vat_rate: Number(m.vat_rate), allergens: m.allergens, available: m.available, sort: m.sort, ...over });

/** novi redoslijed: kategorija × 1000 + mjesto u kategoriji, pa se spremaju samo promijenjeni */
async function reorder({ item, cat, d }) {
  const cats = [...new Set(MENU.map((m) => m.category))];
  const groups = cats.map((c) => MENU.filter((m) => m.category === c));
  if (cat !== undefined) { const j = cat + d; [groups[cat], groups[j]] = [groups[j], groups[cat]]; }
  if (item !== undefined) {
    const g = groups.find((x) => x.some((m) => m.id === item)); const i = g.findIndex((m) => m.id === item);
    [g[i], g[i + d]] = [g[i + d], g[i]];
  }
  const changed = [];
  groups.forEach((g, ci) => g.forEach((m, i) => { const sort = ci * 1000 + i; if (m.sort !== sort) changed.push({ ...m, sort }); }));
  for (const m of changed) await put(`/menu/${m.id}`, itemPayload(m));
  await loadMenu();
}

$('mNew').onclick = () => editItem(null);
function editItem(m) {
  const cats = [...new Set(MENU.map((x) => x.category))];
  const v = m || { category: cats[0] || '', name: {}, description: {}, price_cents: 0, vat_rate: 13, allergens: [], available: true };
  const html = `<form class="dr-sec" id="iForm">
    <label class="field"><span>Kategorija</span><input name="category" value="${esc(v.category)}" list="catList" required placeholder="npr. Glavna jela" ${m ? '' : 'autofocus'}>
      <datalist id="catList">${cats.map((c) => `<option>${esc(c)}</option>`).join('')}<option>Predjela</option><option>Glavna jela</option><option>Deserti</option><option>Pića</option><option>Vina</option></datalist></label>
    <label class="field"><span>Naziv na hrvatskom</span><input name="hr" value="${esc(v.name.hr || '')}" required></label>
    <div class="row2"><label class="field"><span>Engleski</span><input name="en" value="${esc(v.name.en || '')}"></label><label class="field"><span>Njemački</span><input name="de" value="${esc(v.name.de || '')}"></label></div>
    <label class="field"><span>Opis <span class="hint">nije obavezno; vidi se ispod naziva</span></span><input name="dhr" value="${esc(v.description?.hr || '')}" placeholder="npr. s domaćim njokima, kuha se 6 sati"></label>
    <div class="row2"><label class="field"><span>Opis engleski</span><input name="den" value="${esc(v.description?.en || '')}"></label><label class="field"><span>Opis njemački</span><input name="dde" value="${esc(v.description?.de || '')}"></label></div>
    <div class="row2"><label class="field"><span>Cijena (€)</span><input name="price" inputmode="decimal" value="${m ? (v.price_cents / 100).toFixed(2).replace('.', ',') : ''}" required placeholder="18,00"></label>
      <label class="field"><span>PDV</span><select name="vat">${[13, 25, 5].map((x) => `<option value="${x}" ${Number(v.vat_rate) === x ? 'selected' : ''}>${x} %</option>`).join('')}</select></label></div>
    <div class="field"><span>Alergeni <span class="hint">gosti ih vide na svom jeziku i mogu sakriti jela s njima</span></span>
      <div class="alg">${ALLERGENS.map((a) => `<label><input type="checkbox" name="al" value="${a}" ${v.allergens.includes(a) ? 'checked' : ''}><span>${a}</span></label>`).join('')}</div></div>
    <label class="switch"><input type="checkbox" name="available" ${v.available ? 'checked' : ''}> Ima ga danas (vidi se u meniju)</label>
    <div class="acts-big"><button class="btn btn-p btn-lg">${m ? 'Spremi promjene' : 'Dodaj u meni'}</button>${m ? '<button type="button" class="btn btn-danger" id="iDel">Obriši</button>' : ''}</div></form>`;
  openDrawer(m ? esc(v.name.hr || v.name.en) : 'Novo jelo ili piće', m ? esc(v.category) : '', html, (body) => {
    body.querySelector('#iForm').onsubmit = guard(async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const price = Math.round(Number(String(f.get('price')).replace(/\s/g, '').replace(',', '.')) * 100);
      if (!Number.isFinite(price) || price < 0) throw new Error('Cijena mora biti broj, npr. 18,50.');
      const tr = (keys) => Object.fromEntries(Object.entries(keys).map(([k, n]) => [k, String(f.get(n) || '').trim()]).filter(([, x]) => x));
      const body2 = { category: String(f.get('category')).trim(), name: tr({ hr: 'hr', en: 'en', de: 'de' }), description: tr({ hr: 'dhr', en: 'den', de: 'dde' }),
        price_cents: price, vat_rate: Number(f.get('vat')), allergens: f.getAll('al'), available: !!f.get('available'),
        sort: m ? m.sort : (Math.max(-1, ...MENU.filter((x) => x.category === String(f.get('category')).trim()).map((x) => x.sort)) + 1) };
      if (m) await put(`/menu/${m.id}`, body2); else await post('/menu', body2);
      toast(m ? 'Spremljeno.' : 'Dodano u meni.'); closeDrawer(); await loadMenu();
    });
    const d = body.querySelector('#iDel');
    if (d) d.onclick = guard(async () => {
      if (!confirm(`Obrisati „${v.name.hr || v.name.en}”?`)) return;
      const r = await del(`/menu/${m.id}`);
      toast(r.result === 'archived' ? 'Jelo je već bilo naručivano, pa je arhivirano: nestaje iz menija, stare narudžbe ostaju.' : 'Obrisano.');
      closeDrawer(); await loadMenu();
    });
  });
}

// =====================================================================
// STOLOVI I QR
// =====================================================================
async function loadTables() {
  TABLES = await api('/tables');
  const el = $('tList');
  const zones = [...new Set(TABLES.map((t) => t.zone))];
  el.innerHTML = zones.length ? zones.map((z) => `<div class="cat"><h3>${esc(z)}</h3><span class="small muted">${TABLES.filter((t) => t.zone === z && t.active).length} aktivnih</span></div>
    <div class="tgrid">${TABLES.filter((t) => t.zone === z).sort((p, q) => Number(!!p.combo_of?.length) - Number(!!q.combo_of?.length) || natural(p.label, q.label)).map((t) => {
      const combo = t.combo_of?.length;
      return `<div class="tcard ${t.active ? '' : 'off'}">
        <h3>${combo ? '' : `<input type="checkbox" data-combo="${t.id}" aria-label="Označi stol ${esc(t.label)} za spajanje" style="width:18px;height:18px;margin-right:6px;vertical-align:middle">`}${esc(t.label)}</h3>
        ${combo ? '' : `<a href="/m/${esc(t.qr_token)}" target="_blank" rel="noopener" title="Otvori meni ovog stola"><img src="/qr/m/${esc(t.qr_token)}" alt="QR kod za stol ${esc(t.label)}" loading="lazy"></a>`}
        <div class="tz">${t.min_capacity}–${t.max_capacity} osoba${combo ? ` · spojeni: ${esc(t.combo_of.map((id) => TABLES.find((x) => x.id === id)?.label ?? id).join(' + '))}` : ''}</div>
        <div class="tf"><label class="switch"><input type="checkbox" data-t="${t.id}" ${t.active ? 'checked' : ''}> ${t.active ? 'aktivan' : 'ne koristi se'}</label>
          <button class="btn btn-ghost btn-s" data-te="${t.id}">Uredi</button></div></div>`;
    }).join('')}</div>`).join('') : '<div class="empty"><b>Još nema stolova</b>Dodajte stolove da bi gosti mogli rezervirati.</div>';
  el.querySelectorAll('[data-t]').forEach((cb) => cb.onchange = guard(async () => { await put(`/tables/${cb.dataset.t}`, { active: cb.checked }); await loadTables(); }));
  el.querySelectorAll('[data-te]').forEach((b) => b.onclick = () => editTable(TABLES.find((t) => t.id === Number(b.dataset.te))));
  const o = location.origin;
  $('snipBook').textContent = `<script src="${o}/widget.js" data-restaurant="${S.slug}" data-color="#1e4d43" async><\/script>`;
  $('snipChat').textContent = `<script src="${o}/chat.js" data-restaurant="${S.slug}" async><\/script>`;
  $('snipLink').textContent = `${o}/b/${S.slug}`;
  $('bookQr').href = `/qr/b/${encodeURIComponent(S.slug)}`; $('bookQr').setAttribute('download', `${S.slug}-rezervacija-qr.svg`);
}
LOADERS.tables = guard(loadTables);
document.querySelectorAll('[data-copy]').forEach((b) => b.onclick = guard(async () => {
  await navigator.clipboard.writeText($(b.dataset.copy).textContent); toast('Kopirano.');
}));
$('cSave').onclick = guard(async () => {
  const ids = [...document.querySelectorAll('[data-combo]:checked')].map((c) => Number(c.dataset.combo));
  if (ids.length < 2) throw new Error('Označite barem dva stola (kvačica uz naziv stola).');
  await post('/tables', { combo_of: ids, min_capacity: Number($('cMin').value), max_capacity: Number($('cMax').value) });
  toast('Stolovi su spojeni.'); await loadTables();
});
$('tNew').onclick = () => editTable(null);
function editTable(t) {
  const zones = [...new Set(TABLES.map((x) => x.zone))];
  const v = t || { label: '', zone: zones[0] || 'unutra', min_capacity: 1, max_capacity: 4 };
  const html = `<form class="dr-sec" id="tForm">
    <div class="row2"><label class="field"><span>Oznaka stola</span><input name="label" value="${esc(v.label)}" required ${t ? '' : 'autofocus'} placeholder="npr. 7 ili T3"></label>
    <label class="field"><span>Zona</span><input name="zone" value="${esc(v.zone)}" list="zoneList" required><datalist id="zoneList">${zones.map((z) => `<option>${esc(z)}</option>`).join('')}<option>unutra</option><option>terasa</option><option>vrt</option></datalist></label></div>
    <div class="row2"><label class="field"><span>Najmanje osoba</span><input type="number" name="min" min="1" value="${v.min_capacity}" required></label>
    <label class="field"><span>Najviše osoba</span><input type="number" name="max" min="1" value="${v.max_capacity}" required></label></div>
    <p class="small muted" style="margin:0">Online se stol nudi samo grupama u tom rasponu. Konobar ga ručno može dati i većoj grupi.</p>
    <div><button class="btn btn-p btn-lg">${t ? 'Spremi' : 'Dodaj stol'}</button></div></form>`;
  openDrawer(t ? `Stol ${esc(t.label)}` : 'Novi stol', '', html, (body) => {
    body.querySelector('#tForm').onsubmit = guard(async (e) => {
      e.preventDefault(); const f = new FormData(e.target);
      const b = { label: String(f.get('label')).trim(), zone: String(f.get('zone')).trim(), min_capacity: Number(f.get('min')), max_capacity: Number(f.get('max')) };
      if (b.min_capacity > b.max_capacity) throw new Error('Najmanje osoba ne može biti više od najviše.');
      if (t) await put(`/tables/${t.id}`, b); else await post('/tables', b);
      toast(t ? 'Spremljeno.' : 'Stol je dodan.'); closeDrawer(); await loadTables();
    });
  });
}
$('tPrint').onclick = guard(async () => {
  const list = TABLES.filter((t) => t.active && !t.combo_of?.length).sort((p, q) => natural(p.zone, q.zone) || natural(p.label, q.label));
  if (!list.length) throw new Error('Nema aktivnih stolova za ispis.');
  $('print').className = '';
  $('print').innerHTML = list.map((t) => `<div class="qcard"><div class="rn">${esc(SET?.name || '')}</div><div class="tn">Stol ${esc(t.label)}</div>
    <img src="/qr/m/${esc(t.qr_token)}" alt=""><p><b>Skenirajte za meni i narudžbu</b><br>Scan for the menu · Speisekarte scannen</p></div>`).join('');
  await Promise.all([...$('print').querySelectorAll('img')].map((img) => img.complete ? null : new Promise((ok) => { img.onload = img.onerror = ok; })));
  print();
});

// =====================================================================
// STATISTIKA
// =====================================================================
let STATS_DAYS = 30, STATS = null;
async function loadStats() {
  STATS = (await api(`/stats?days=${STATS_DAYS}`)).summary;
  document.querySelectorAll('#stRange button').forEach((b) => b.classList.toggle('on', Number(b.dataset.days) === STATS_DAYS));
  const t = STATS.totals;
  const kpi = (label, value, small = '') => `<div class="kpi"><span>${label}</span><b>${value}</b>${small ? `<small>${small}</small>` : ''}</div>`;
  $('stKpis').innerHTML = [
    kpi('Rezervacija', nf.format(t.reservations), `${nf.format(t.cancelled)} otkazano`),
    kpi('Gostiju', nf.format(t.covers), `prosječno ${String(t.avg_party).replace('.', ',')} po stolu`),
    kpi('Nije došlo', `${String(t.no_show_rate).replace('.', ',')} %`, `${nf.format(t.no_shows)} ${pl(t.no_shows, 'rezervacija', 'rezervacije', 'rezervacija')}`),
    kpi('Preko AI-ja', nf.format(t.via_ai), 'chat, WhatsApp, Instagram, telefon'),
    kpi('Bez rezervacije', nf.format(t.walk_ins), 'posjeli konobari'),
    kpi('QR narudžbe', nf.format(t.orders), t.orders ? eur(t.order_revenue_cents) : 'još nema'),
  ].join('');
  renderCharts();
  renderStatsTable();
}
LOADERS.stats = guard(loadStats);
document.querySelectorAll('#stRange button').forEach((b) => b.onclick = () => { STATS_DAYS = Number(b.dataset.days); LOADERS.stats(); });
$('stTableBtn').onclick = () => {
  const on = $('stTable').classList.toggle('hidden');
  $('stTableBtn').textContent = on ? 'Prikaži kao tablicu' : 'Sakrij tablicu';
};
addEventListener('resize', () => { if (TAB === 'stats' && STATS) renderCharts(); });

function niceStep(max) {
  const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) || p;
}
function tipAt(box, html, x, y) {
  let tip = box.querySelector('.tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; box.appendChild(tip); }
  tip.innerHTML = html; tip.style.display = 'block';
  const w = tip.offsetWidth;
  tip.style.left = Math.min(Math.max(4, x - w / 2), box.clientWidth - w - 4) + 'px';
  tip.style.top = Math.max(4, y - tip.offsetHeight - 10) + 'px';
}
const tipOff = (box) => { const t = box.querySelector('.tip'); if (t) t.style.display = 'none'; };

function renderCharts() {
  const el = $('stCharts');
  el.innerHTML = `<div class="chart wide" id="chDaily"><h3>Gosti po danu</h3><div class="cap">Gosti koji su došli, po danu rezervacije. Prijeđite mišem preko stupca za detalje.</div></div>
    <div class="chart" id="chHeat"><h3>Kad dolaze gosti</h3><div class="cap">Zbroj gostiju po danu u tjednu i satu dolaska.</div></div>
    <div class="chart" id="chSrc"><h3>Odakle dolaze rezervacije</h3><div class="cap">Broj rezervacija po kanalu; u zagradi gosti.</div></div>`;
  dailyChart($('chDaily'), STATS.daily);
  heatChart($('chHeat'), STATS.heat);
  sourceChart($('chSrc'), STATS.sources);
}

function dailyChart(box, days) {
  const W = Math.max(320, box.clientWidth - 32), H = 220, L = 34, B = 24, T = 8;
  const pw = W - L, ph = H - B - T;
  const max = Math.max(1, ...days.map((d) => d.covers));
  const step = niceStep(max), top = Math.ceil(max / step) * step;
  const y = (v) => T + ph - (v / top) * ph;
  const bw = pw / days.length, gap = Math.max(2, bw * 0.22), w = Math.max(2, bw - gap);
  const every = days.length <= 10 ? 1 : days.length <= 35 ? 5 : 14;
  let s = '';
  for (let v = 0; v <= top; v += step) s += `<line class="${v ? 'grid' : 'base'}" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  days.forEach((d, i) => {
    const x0 = L + i * bw + gap / 2, yy = y(d.covers), h = T + ph - yy;
    if (d.covers > 0) {
      const r = Math.min(4, w / 2, h);
      s += `<path class="mark" data-i="${i}" d="M${x0},${T + ph} V${yy + r} Q${x0},${yy} ${x0 + r},${yy} H${x0 + w - r} Q${x0 + w},${yy} ${x0 + w},${yy + r} V${T + ph} Z"/>`;
    }
    if (i % every === 0 || days.length <= 10) {
      const [, m, dd] = d.date.split('-');
      const lab = days.length <= 10 ? DAY_SHORT[new Date(d.date + 'T12:00:00Z').getUTCDay() || 7] : `${Number(dd)}.${Number(m)}.`;
      s += `<text class="axis" x="${x0 + w / 2}" y="${H - 6}" text-anchor="middle">${lab}</text>`;
    }
    s += `<rect class="hit" data-i="${i}" x="${L + i * bw}" y="${T}" width="${bw}" height="${ph}"/>`;
  });
  box.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gosti po danu, najviše ${max}">${s}</svg>`);
  const svg = box.querySelector('svg');
  svg.querySelectorAll('.hit').forEach((r) => {
    r.onmouseenter = () => {
      const i = Number(r.dataset.i), d = days[i];
      svg.querySelectorAll('.mark').forEach((m) => m.classList.toggle('hl', m.dataset.i === r.dataset.i));
      const sc = box.clientWidth / W; const bx = svg.getBoundingClientRect(), cb = box.getBoundingClientRect();
      tipAt(box, `${longDate(d.date)}<br><b>${d.covers}</b> ${pl(d.covers, 'gost', 'gosta', 'gostiju')} · <b>${d.reservations}</b> ${pl(d.reservations, 'stol', 'stola', 'stolova')}${d.no_shows ? `<br><b>${d.no_shows}</b> nije došlo` : ''}`,
        (bx.left - cb.left) + (L + i * bw + bw / 2) * (bx.width / W), (bx.top - cb.top) + y(d.covers) * (bx.height / H));
      void sc;
    };
    r.onmouseleave = () => { tipOff(box); svg.querySelectorAll('.mark.hl').forEach((m) => m.classList.remove('hl')); };
  });
}

function heatChart(box, heat) {
  if (!heat.length) { box.insertAdjacentHTML('beforeend', '<p class="muted">Još nema dolazaka u ovom razdoblju.</p>'); return; }
  const hours = heat.map((h) => h.hour);
  const h0 = Math.min(12, ...hours), h1 = Math.max(22, ...hours);
  const max = Math.max(...heat.map((h) => h.covers));
  const get = (wd, h) => heat.find((x) => x.weekday === wd && x.hour === h)?.covers || 0;
  const cols = h1 - h0 + 1;
  let g = `<div class="heat" style="grid-template-columns:34px repeat(${cols},1fr)"><span></span>`;
  for (let h = h0; h <= h1; h++) g += `<span style="text-align:center">${(h - h0) % 2 === 0 ? h : ''}</span>`;
  for (let wd = 1; wd <= 7; wd++) {
    g += `<span class="lab">${DAY_SHORT[wd]}</span>`;
    for (let h = h0; h <= h1; h++) {
      const v = get(wd, h);
      const c = v ? RAMP[Math.min(RAMP.length - 1, Math.ceil((v / max) * RAMP.length) - 1)] : '';
      g += `<span class="c" data-wd="${wd}" data-h="${h}" data-v="${v}" style="${c ? `background:${c}` : ''}"></span>`;
    }
  }
  g += '</div>';
  box.insertAdjacentHTML('beforeend', g + `<div class="legend-ramp">manje ${RAMP.map((c) => `<i style="background:${c}"></i>`).join('')} više · najviše ${max} ${pl(max, 'gost', 'gosta', 'gostiju')} u jednom satu</div>`);
  box.querySelectorAll('.c').forEach((c) => {
    c.onmouseenter = () => {
      const r = c.getBoundingClientRect(), b = box.getBoundingClientRect(), v = Number(c.dataset.v);
      tipAt(box, `${DAY_NAMES[c.dataset.wd]}, ${c.dataset.h}–${Number(c.dataset.h) + 1} h<br><b>${v}</b> ${pl(v, 'gost', 'gosta', 'gostiju')}`, r.left - b.left + r.width / 2, r.top - b.top);
    };
    c.onmouseleave = () => tipOff(box);
  });
}

function sourceChart(box, sources) {
  if (!sources.length) { box.insertAdjacentHTML('beforeend', '<p class="muted">Još nema rezervacija u ovom razdoblju.</p>'); return; }
  const max = Math.max(...sources.map((s) => s.reservations));
  box.insertAdjacentHTML('beforeend', sources.map((s) => `<div class="hb"><span>${esc(SOURCE[s.source] || s.source)}</span>
    <div><div class="trk" style="width:${(s.reservations / max) * 100}%"></div></div><span class="v">${s.reservations} (${s.covers})</span></div>`).join(''));
}

function renderStatsTable() {
  $('stTable').innerHTML = `<table class="tbl"><thead><tr><th>Dan</th><th class="num">Gosti</th><th class="num">Stolova</th><th class="num">Nije došlo</th></tr></thead><tbody>
    ${[...STATS.daily].reverse().map((d) => `<tr><td>${longDate(d.date)}</td><td class="num">${d.covers}</td><td class="num">${d.reservations}</td><td class="num">${d.no_shows}</td></tr>`).join('')}</tbody></table>`;
}

// =====================================================================
// POSTAVKE
// =====================================================================
let HOURS = {}, CLOSED = [];
async function loadSettings() {
  SET = await api('/settings');
  applyRole();
  const s = SET;
  $('sName').value = s.name; $('sPhone').value = s.phone || ''; $('sEmail').value = s.email || ''; $('sAddress').value = s.address || '';
  if (![...$('sSlot').options].some((o) => Number(o.value) === s.slot_minutes)) $('sSlot').insertAdjacentHTML('beforeend', `<option value="${s.slot_minutes}">${s.slot_minutes} min</option>`);
  $('sSlot').value = String(s.slot_minutes); $('sDur').value = s.default_duration_minutes; $('sMax').value = s.max_party_size;
  $('sGuar').value = s.guarantee_mode; $('sGuarMin').value = s.guarantee_min_party; $('sFee').value = (s.no_show_fee_cents / 100).toFixed(2);
  $('sReview').value = s.google_review_url || ''; $('sReviewMode').value = s.review_mode; $('sInfo').value = s.info_text || '';
  HOURS = {}; for (let d = 1; d <= 7; d++) HOURS[d] = s.opening_hours.filter((p) => p.weekday === d).map((p) => ({ open: p.open, close: p.close }));
  CLOSED = [...s.closed_dates].sort();
  drawHours(); drawClosed();
  const row = (label, ok, txt) => `<div><span>${label}</span><span class="${ok ? 'ok' : 'no'}">${ok ? '● ' : '○ '}${txt}</span></div>`;
  $('sConn').innerHTML = row('Stripe (garancija karticom)', s.stripe_connected, s.stripe_connected ? 'spojen' : 'nije spojen')
    + row('WhatsApp poruke gostima', s.whatsapp_connected, s.whatsapp_connected ? 'spojen' : 'spaja Opsis')
    + row('SMS kad WhatsApp ne prođe', s.sms_enabled, s.sms_enabled ? 'uključen' : 'uključuje Opsis')
    + row('Fiskalizacija', s.fiscal_enabled, s.fiscal_enabled ? 'uključena' : 'isključena (koristite svoju blagajnu)');
  if (s.role === 'owner') await loadStaff();
}
LOADERS.settings = guard(loadSettings);

function drawHours() {
  const el = $('sHours');
  el.innerHTML = [1, 2, 3, 4, 5, 6, 7].map((d) => `<div class="hday"><b>${DAY_NAMES[d]}</b><div class="ps">${HOURS[d].length
    ? HOURS[d].map((p, i) => `<span class="per"><input type="time" class="in" data-d="${d}" data-i="${i}" data-k="open" value="${p.open}" aria-label="${DAY_NAMES[d]} od">–<input type="time" class="in" data-d="${d}" data-i="${i}" data-k="close" value="${p.close}" aria-label="${DAY_NAMES[d]} do"><button type="button" class="btn btn-ghost btn-s" data-rm="${d}:${i}" aria-label="Makni period">×</button></span>`).join('')
    : '<span class="closed">zatvoreno</span>'}</div>
    <div><button type="button" class="btn btn-ghost btn-s" data-add="${d}">+ period</button>${d > 1 ? `<button type="button" class="btn btn-ghost btn-s" data-copyprev="${d}" title="Isto kao ${DAY_NAMES[d - 1].toLowerCase()}">= kao jučer</button>` : ''}</div></div>`).join('');
  el.querySelectorAll('input[data-d]').forEach((i) => i.onchange = () => { HOURS[i.dataset.d][i.dataset.i][i.dataset.k] = i.value; });
  el.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { const [d, i] = b.dataset.rm.split(':').map(Number); HOURS[d].splice(i, 1); drawHours(); });
  el.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => { const d = Number(b.dataset.add); HOURS[d].push(HOURS[d].length ? { open: '18:00', close: '23:00' } : { open: '12:00', close: '23:00' }); drawHours(); });
  el.querySelectorAll('[data-copyprev]').forEach((b) => b.onclick = () => { const d = Number(b.dataset.copyprev); HOURS[d] = HOURS[d - 1].map((p) => ({ ...p })); drawHours(); });
}
function drawClosed() {
  const el = $('sClosed');
  el.innerHTML = CLOSED.map((d, i) => `<span class="chip">${shortDate(d + 'T12:00:00Z')}<button type="button" data-i="${i}" aria-label="Makni datum">×</button></span>`).join('')
    + `<input type="date" class="in" id="sClosedAdd" aria-label="Dodaj zatvoreni datum" style="width:auto"><button type="button" class="btn btn-s" id="sClosedBtn">Dodaj</button>`;
  el.querySelectorAll('button[data-i]').forEach((b) => b.onclick = () => { CLOSED.splice(Number(b.dataset.i), 1); drawClosed(); });
  $('sClosedBtn').onclick = () => { const v = $('sClosedAdd').value; if (v && !CLOSED.includes(v)) { CLOSED.push(v); CLOSED.sort(); } drawClosed(); };
}
$('sSave').onclick = guard(async () => {
  const hours = [];
  for (let d = 1; d <= 7; d++) for (const p of HOURS[d]) if (p.open && p.close) hours.push({ weekday: d, open: p.open, close: p.close });
  await put('/settings', {
    name: $('sName').value, phone: $('sPhone').value, email: $('sEmail').value, address: $('sAddress').value,
    slot_minutes: Number($('sSlot').value), default_duration_minutes: Number($('sDur').value), max_party_size: Number($('sMax').value),
    guarantee_mode: $('sGuar').value, guarantee_min_party: Number($('sGuarMin').value), no_show_fee_cents: Math.round(Number(String($('sFee').value).replace(',', '.')) * 100),
    opening_hours: hours, closed_dates: CLOSED,
    google_review_url: $('sReview').value.trim() || null, review_mode: $('sReviewMode').value, info_text: $('sInfo').value,
  });
  toast('Postavke su spremljene.'); await loadSettings(); $('hName').textContent = SET.name;
});
$('sStripe').onclick = guard(async () => { const d = await post('/stripe/onboard'); location.href = d.url; });

async function loadStaff() {
  const list = await api('/staff');
  $('kList').innerHTML = list.length ? `<table class="tbl"><tbody>${list.map((k) => `<tr><td><b>${esc(k.name)}</b></td><td>${k.role === 'owner' ? 'vlasnik' : 'konobar'}</td>
    <td class="small muted">od ${shortDate(k.created_at)}</td><td>${k.revoked_at ? '<span class="muted">opozvan</span>' : `<button class="btn btn-s btn-danger" data-k="${k.id}">Opozovi</button>`}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted" style="margin:0">Još nema ključeva za osoblje.</p>';
  $('kList').querySelectorAll('[data-k]').forEach((b) => b.onclick = guard(async () => {
    if (!confirm('Opozvati ključ? Ta osoba se više ne može prijaviti.')) return;
    await post(`/staff/${b.dataset.k}/revoke`); toast('Ključ je opozvan.'); await loadStaff();
  }));
}
$('kSave').onclick = guard(async () => {
  const k = await post('/staff', { name: $('kName').value, role: $('kRole').value });
  $('kNew').innerHTML = `<div class="panel" style="background:var(--ulje-svj);border-color:var(--ulje);gap:8px">Ključ za <b>${esc(k.name)}</b> prikazuje se samo sada. Pošaljite ga osobi:
    <pre class="mono" style="margin:0;white-space:pre-wrap">oznaka: ${esc(S.slug)}\nključ: ${esc(k.key)}</pre><div><button class="btn btn-s" id="kCopy">Kopiraj</button></div></div>`;
  $('kCopy').onclick = guard(async () => { await navigator.clipboard.writeText(`${location.origin}/admin\noznaka: ${S.slug}\nključ: ${k.key}`); toast('Kopirano.'); });
  $('kName').value = ''; await loadStaff();
});

function applyRole() {
  const owner = SET?.role === 'owner';
  document.querySelectorAll('nav.tabs [data-owner]').forEach((b) => b.classList.toggle('hidden', !owner));
  $('hName').textContent = SET?.name || '';
  $('hRole').textContent = owner ? '' : 'konobar';
}

// ---------- pokretanje ----------
let started = false;
async function start() {
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  try { SET = await api('/settings'); } catch (e) { toast(e.message, true); return; }
  applyRole();
  tickClock();
  if (!started) {
    started = true;
    setInterval(tickClock, 15_000);
    setInterval(() => { if (S) pollOrders().catch(() => {}); }, 10_000);
    // raspored i "sada" crta osvježavaju se svake minute dok je otvoren današnji dan
    setInterval(() => { if (S && TAB === 'res' && DATE === todayStr() && !drawerOpen()) LOADERS.res(); }, 60_000);
    setInterval(() => document.querySelectorAll('[data-age]').forEach((x) => { x.textContent = age(x.dataset.age); }), 15_000);
    addEventListener('hashchange', () => showTab(location.hash.slice(1)));
  }
  pollOrders().catch(() => {});
  showTab(location.hash.slice(1) || 'res');
}

const pre = new URLSearchParams(location.search).get('r');
if (pre) $('lSlug').value = pre;
if (S) start(); else $('login').classList.remove('hidden');
