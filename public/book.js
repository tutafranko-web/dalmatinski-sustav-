/* Opsis Restoran: stranica za rezervaciju (gost). Radi i unutar okvira (widget na webu restorana). */
'use strict';

const I18N = {
  hr: {
    howMany: 'Koliko vas je?', when: 'Kada dolazite?', where: 'Gdje želite sjediti?', any: 'Svejedno', time: 'Vrijeme', lunch: 'Ručak', dinner: 'Večera',
    otherDate: 'Drugi datum', today: 'danas', tomorrow: 'sutra', closedShort: 'ne radimo',
    yourDetails: 'Vaši podaci', name: 'Ime i prezime', phone: 'Mobitel', phoneHint: 'potvrda stiže na WhatsApp ili SMS', email: 'Email', emailHint: 'može i umjesto mobitela',
    notes: 'Napomena (alergije, prigoda, dječja stolica…)', book: 'Rezerviraj', privacy: 'Podatke koristimo samo za ovu rezervaciju i poruke o njoj.',
    needName: 'Upišite ime.', needContact: 'Upišite mobitel ili email, da vam pošaljemo potvrdu.',
    noSlots: 'Za taj dan više nema slobodnih stolova za toliko osoba.', closedDay: 'Taj dan restoran ne radi.', firstFree: 'Prvi slobodan termin', searching: 'Tražimo prvi slobodan termin…',
    nothingSoon: 'U idućih dva tjedna nema slobodnog stola za toliko osoba. Nazovite nas, često se nađe mjesto.',
    bigGroup: 'Za više od {n} osoba nazovite restoran, rado ćemo vas smjestiti.', persons1: 'osoba', persons2: 'osobe', persons5: 'osoba',
    guarantee: 'Za {n} i više osoba tražimo karticu kao garanciju. Ništa se ne naplaćuje ako dođete; za nedolazak se naplaćuje {fee} po osobi.',
    redirect: 'Još samo kartica: otvaramo siguran unos…', payLink: 'Unesite karticu',
    seeYou: 'Vidimo se!', sentTo: 'Potvrdu smo poslali: {ch}.', noMsg: 'Zapišite šifru: poruku s potvrdom ne možemo poslati.', date: 'Datum', guests: 'Osoba', code: 'Šifra rezervacije',
    addCal: 'Dodaj u kalendar', manageLink: 'Izmijeni ili otkaži', newBooking: 'Nova rezervacija',
    reservation: 'Rezervacija', contactCheck: 'Mobitel ili email koji ste upisali kod rezervacije', show: 'Prikaži rezervaciju',
    change: 'Promijeni termin', confirmChange: 'Potvrdi novi termin', changed: 'Termin je promijenjen. Poslali smo vam novu potvrdu.', changedNoMsg: 'Termin je promijenjen.', pickNew: 'Odaberite novi termin pa potvrdite.',
    cancel: 'Otkaži rezervaciju', cancelAsk: 'Sigurno otkazati rezervaciju?', cancelled: 'Rezervacija je otkazana. Hvala što ste javili.', back: 'Natrag',
    guaranteeOk: 'Kartica je spremljena, rezervacija je potvrđena.', guaranteeCancel: 'Kartica nije unesena. Rezervacija čeka još kratko: unesite karticu da je potvrdite.',
    enterCard: 'Unesi karticu', menu: 'Meni', allergens: 'Alergeni', hours: 'Radno vrijeme', openToday: 'Danas {h}', closedToday: 'Danas ne radimo', call: 'Nazovi',
    status: { pending_guarantee: 'čeka karticu', confirmed: 'potvrđeno', seated: 'u tijeku', completed: 'završeno', cancelled: 'otkazano', no_show: 'nedolazak', expired: 'isteklo' },
    err: {},
  },
  en: {
    howMany: 'How many guests?', when: 'When are you coming?', where: 'Where would you like to sit?', any: 'No preference', time: 'Time', lunch: 'Lunch', dinner: 'Dinner',
    otherDate: 'Other date', today: 'today', tomorrow: 'tomorrow', closedShort: 'closed',
    yourDetails: 'Your details', name: 'Full name', phone: 'Mobile', phoneHint: 'confirmation via WhatsApp or SMS', email: 'Email', emailHint: 'or instead of mobile',
    notes: 'Notes (allergies, occasion, high chair…)', book: 'Book table', privacy: 'We use your details only for this booking and messages about it.',
    needName: 'Please enter your name.', needContact: 'Please enter a mobile number or email so we can send your confirmation.',
    noSlots: 'No tables left that day for this many guests.', closedDay: 'The restaurant is closed that day.', firstFree: 'Next available', searching: 'Looking for the next available time…',
    nothingSoon: 'No table for this many guests in the next two weeks. Please call us, we can often find a spot.',
    bigGroup: 'For more than {n} guests, please call the restaurant and we will seat you.', persons1: 'guest', persons2: 'guests', persons5: 'guests',
    guarantee: 'For {n} or more guests we ask for a card as a guarantee. Nothing is charged if you come; a no-show costs {fee} per guest.',
    redirect: 'Just the card left: opening secure entry…', payLink: 'Enter card details',
    seeYou: 'See you soon!', sentTo: 'Confirmation sent via {ch}.', noMsg: 'Please note the code: we cannot send you a confirmation message.', date: 'Date', guests: 'Guests', code: 'Booking code',
    addCal: 'Add to calendar', manageLink: 'Change or cancel', newBooking: 'New booking',
    reservation: 'Booking', contactCheck: 'Mobile or email you used for the booking', show: 'Show booking',
    change: 'Change time', confirmChange: 'Confirm new time', changed: 'Your booking has been changed. We have sent you a new confirmation.', changedNoMsg: 'Your booking has been changed.', pickNew: 'Choose the new time, then confirm.',
    cancel: 'Cancel booking', cancelAsk: 'Cancel this booking?', cancelled: 'Your booking is cancelled. Thank you for letting us know.', back: 'Back',
    guaranteeOk: 'Card saved, your table is confirmed.', guaranteeCancel: 'No card was entered. Your table is held for a short time: enter a card to confirm it.',
    enterCard: 'Enter card', menu: 'Menu', allergens: 'Allergens', hours: 'Opening hours', openToday: 'Today {h}', closedToday: 'Closed today', call: 'Call',
    status: { pending_guarantee: 'waiting for card', confirmed: 'confirmed', seated: 'in progress', completed: 'completed', cancelled: 'cancelled', no_show: 'no-show', expired: 'expired' },
    err: { name_required: 'Please enter your name.', bad_phone: 'This phone number is not valid.', bad_email: 'This email address is not valid.', contact_required: 'Please enter the mobile number or email used for the booking.', bad_datetime: 'Invalid date or time.', bad_party: 'Please choose the number of guests.', party_too_large: 'This group is too large to book online. Please call the restaurant.', in_past: 'That time has already passed.', closed: 'The restaurant is closed at that time, or it is too late to arrive.', no_table: 'That time was just taken.', reservation_not_found: 'Booking not found. Check the code.', contact_mismatch: 'This contact does not match the booking.', not_cancellable: 'This booking can no longer be cancelled.', not_modifiable: 'This booking can no longer be changed.', already_started: 'Your booking time has already started. Please call the restaurant.', rate_limited: 'Too many requests. Please try again in a minute.', restaurant_not_found: 'Restaurant not found.', internal: 'Something went wrong. Please try again or call the restaurant.' },
  },
  de: {
    howMany: 'Wie viele Personen?', when: 'Wann kommen Sie?', where: 'Wo möchten Sie sitzen?', any: 'Egal', time: 'Uhrzeit', lunch: 'Mittag', dinner: 'Abend',
    otherDate: 'Anderes Datum', today: 'heute', tomorrow: 'morgen', closedShort: 'geschlossen',
    yourDetails: 'Ihre Angaben', name: 'Vor- und Nachname', phone: 'Handy', phoneHint: 'Bestätigung per WhatsApp oder SMS', email: 'E-Mail', emailHint: 'oder statt Handy',
    notes: 'Hinweise (Allergien, Anlass, Kinderstuhl…)', book: 'Tisch reservieren', privacy: 'Wir verwenden Ihre Angaben nur für diese Reservierung und Nachrichten dazu.',
    needName: 'Bitte geben Sie Ihren Namen ein.', needContact: 'Bitte Handy oder E-Mail angeben, damit wir Ihnen die Bestätigung schicken können.',
    noSlots: 'An diesem Tag ist für so viele Personen kein Tisch mehr frei.', closedDay: 'An diesem Tag ist das Restaurant geschlossen.', firstFree: 'Nächster freier Termin', searching: 'Wir suchen den nächsten freien Termin…',
    nothingSoon: 'In den nächsten zwei Wochen ist für so viele Personen nichts frei. Rufen Sie uns an, oft findet sich ein Platz.',
    bigGroup: 'Ab {n} Personen rufen Sie bitte das Restaurant an, wir finden einen Platz.', persons1: 'Person', persons2: 'Personen', persons5: 'Personen',
    guarantee: 'Ab {n} Personen benötigen wir eine Karte als Garantie. Wenn Sie kommen, wird nichts belastet; bei Nichterscheinen {fee} pro Person.',
    redirect: 'Nur noch die Karte: sichere Eingabe wird geöffnet…', payLink: 'Karte eingeben',
    seeYou: 'Bis bald!', sentTo: 'Bestätigung gesendet per {ch}.', noMsg: 'Bitte notieren Sie den Code: Wir können Ihnen keine Bestätigung schicken.', date: 'Datum', guests: 'Personen', code: 'Reservierungscode',
    addCal: 'Zum Kalender hinzufügen', manageLink: 'Ändern oder stornieren', newBooking: 'Neue Reservierung',
    reservation: 'Reservierung', contactCheck: 'Handy oder E-Mail, die Sie bei der Reservierung angegeben haben', show: 'Reservierung anzeigen',
    change: 'Termin ändern', confirmChange: 'Neuen Termin bestätigen', changed: 'Ihre Reservierung wurde geändert. Wir haben Ihnen eine neue Bestätigung geschickt.', changedNoMsg: 'Ihre Reservierung wurde geändert.', pickNew: 'Wählen Sie den neuen Termin und bestätigen Sie.',
    cancel: 'Reservierung stornieren', cancelAsk: 'Reservierung wirklich stornieren?', cancelled: 'Ihre Reservierung ist storniert. Danke für die Nachricht.', back: 'Zurück',
    guaranteeOk: 'Karte gespeichert, Ihr Tisch ist bestätigt.', guaranteeCancel: 'Es wurde keine Karte eingegeben. Ihr Tisch wird kurz gehalten: Geben Sie eine Karte ein, um ihn zu bestätigen.',
    enterCard: 'Karte eingeben', menu: 'Speisekarte', allergens: 'Allergene', hours: 'Öffnungszeiten', openToday: 'Heute {h}', closedToday: 'Heute geschlossen', call: 'Anrufen',
    status: { pending_guarantee: 'wartet auf Karte', confirmed: 'bestätigt', seated: 'läuft', completed: 'abgeschlossen', cancelled: 'storniert', no_show: 'nicht erschienen', expired: 'abgelaufen' },
    err: { name_required: 'Bitte geben Sie Ihren Namen ein.', bad_phone: 'Diese Telefonnummer ist ungültig.', bad_email: 'Diese E-Mail-Adresse ist ungültig.', contact_required: 'Bitte geben Sie die Handynummer oder E-Mail der Reservierung ein.', bad_datetime: 'Ungültiges Datum oder ungültige Uhrzeit.', bad_party: 'Bitte wählen Sie die Personenzahl.', party_too_large: 'Diese Gruppe ist für die Online-Reservierung zu groß. Bitte rufen Sie das Restaurant an.', in_past: 'Diese Uhrzeit ist bereits vorbei.', closed: 'Das Restaurant ist zu dieser Zeit geschlossen oder es ist zu spät für die Ankunft.', no_table: 'Diese Uhrzeit wurde gerade vergeben.', reservation_not_found: 'Reservierung nicht gefunden. Bitte den Code prüfen.', contact_mismatch: 'Der Kontakt passt nicht zur Reservierung.', not_cancellable: 'Diese Reservierung kann nicht mehr storniert werden.', not_modifiable: 'Diese Reservierung kann nicht mehr geändert werden.', already_started: 'Die Reservierungszeit hat bereits begonnen. Bitte rufen Sie das Restaurant an.', rate_limited: 'Zu viele Anfragen. Bitte versuchen Sie es in einer Minute erneut.', restaurant_not_found: 'Restaurant nicht gefunden.', internal: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut oder rufen Sie das Restaurant an.' },
  },
};
const ALLERGENS = {
  gluten: ['gluten', 'Gluten'], rakovi: ['crustaceans', 'Krebstiere'], jaja: ['eggs', 'Eier'], riba: ['fish', 'Fisch'], kikiriki: ['peanuts', 'Erdnüsse'],
  soja: ['soy', 'Soja'], mlijeko: ['milk', 'Milch'], 'orašasti plodovi': ['tree nuts', 'Schalenfrüchte'], celer: ['celery', 'Sellerie'], gorušica: ['mustard', 'Senf'],
  sezam: ['sesame', 'Sesam'], sumpor: ['sulphites', 'Sulfite'], lupina: ['lupin', 'Lupinen'], mekušci: ['molluscs', 'Weichtiere'],
};
const LOCALE = { hr: 'hr-HR', en: 'en-GB', de: 'de-DE' };

const $ = (id) => document.getElementById(id);
const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || '');
const q = new URLSearchParams(location.search);
let L = (q.get('lang') || navigator.language || 'hr').slice(0, 2).toLowerCase(); if (!I18N[L]) L = 'en';
const t = (k) => I18N[L][k] ?? I18N.en[k] ?? k;
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (_, k) => o[k]);
const errText = (e) => (I18N[L].err && I18N[L].err[e.error]) || e.message;
const persons = (n) => { const a = n % 10, b = n % 100; return L === 'hr' ? (a === 1 && b !== 11 ? t('persons1') : a >= 2 && a <= 4 && (b < 12 || b > 14) ? t('persons2') : t('persons5')) : n === 1 ? t('persons1') : t('persons2'); };
const eur = (c) => (c / 100).toLocaleString(LOCALE[L], { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

let R = null;               // restoran
let TZ = 'Europe/Zagreb';
const st = { party: 2, date: null, zone: '', slot: null };
let MODE = 'book';          // 'book' | 'modify'
let MRES = null, MCONTACT = '';
let loadSeq = 0;

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Error'), data);
  return data;
}
let toastT;
function toast(text) { const el = $('toast'); el.textContent = text; el.className = 'toast on'; clearTimeout(toastT); toastT = setTimeout(() => { el.className = 'toast'; }, 3500); }
function msg(el, text, ok = false, extra = '') { $(el).innerHTML = text ? `<div class="msg ${ok ? 'ok' : 'err'}">${esc(text)}${extra}</div>` : ''; }

// ---------- datumi u vremenu restorana ----------
function localNow() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = (k) => p.find((x) => x.type === k).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const weekday = (d) => new Date(d + 'T12:00:00Z').getUTCDay() || 7;
const fmt = (d, o) => new Date(d + 'T12:00:00Z').toLocaleDateString(LOCALE[L], { timeZone: 'UTC', ...o });
const longDay = (d) => { const s = fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1); };
const periods = (d) => R.closed_dates.includes(d) ? [] : R.opening_hours.filter((p) => p.weekday === weekday(d));
const isClosed = (d) => !periods(d).length;
function relDay(d) {
  const today = localNow().date;
  if (d === today) return t('today');
  if (d === addDays(today, 1)) return t('tomorrow');
  return null;
}

// ---------- jezik ----------
function applyLang() {
  document.documentElement.lang = L;
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
  document.querySelectorAll('.langs button').forEach((b) => { b.classList.toggle('on', b.dataset.l === L); b.setAttribute('aria-pressed', String(b.dataset.l === L)); });
  if (!R) return;
  renderHeader(); renderParty(); renderDays(); renderZones(); renderGuarantee(); renderSubmitSum();
  if (MODE === 'book' && !$('pick').classList.contains('hidden')) loadSlots();
}
document.querySelectorAll('.langs button').forEach((b) => b.onclick = () => { L = b.dataset.l; applyLang(); if (DONE) renderDone(DONE); if (MRES) renderManage(); });

function renderHeader() {
  document.title = `${R.name} · ${t('book')}`;
  $('rname').textContent = R.name;
  $('raddr').textContent = R.address || '';
  const today = localNow().date, ps = periods(today);
  $('openDot').classList.toggle('off', !ps.length);
  $('openTxt').textContent = ps.length ? fill(t('openToday'), { h: ps.map((p) => `${p.open}–${p.close}`).join(', ') }) : t('closedToday');
  $('menuBtn').classList.toggle('hidden', !R.has_menu);
  if (R.phone) { $('telBtn').classList.remove('hidden'); $('telBtn').href = 'tel:' + R.phone.replace(/[^\d+]/g, ''); $('telBtn').textContent = `${t('call')} ${R.phone}`; }
}

// ---------- broj osoba ----------
function renderParty() {
  $('party').textContent = st.party;
  $('pLbl').textContent = persons(st.party);
  $('pMinus').disabled = st.party <= 1;
  $('pPlus').disabled = st.party >= R.max_party_size + 1;
  const big = st.party > R.max_party_size;
  $('bigNote').classList.toggle('hidden', !big);
  if (big) $('bigNote').innerHTML = esc(fill(t('bigGroup'), { n: R.max_party_size })) + (R.phone ? ` <a href="tel:${esc(R.phone.replace(/[^\d+]/g, ''))}">${esc(R.phone)}</a>` : '');
}
$('pMinus').onclick = () => { st.party = Math.max(1, st.party - 1); renderParty(); renderGuarantee(); loadSlots(); };
$('pPlus').onclick = () => { st.party = Math.min(R.max_party_size + 1, st.party + 1); renderParty(); renderGuarantee(); loadSlots(); };

// ---------- dani ----------
function renderDays() {
  const today = localNow().date;
  const out = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i), closed = isClosed(d), rel = relDay(d);
    out.push(`<button type="button" class="day ${d === st.date ? 'sel' : ''}" data-d="${d}" ${closed ? 'disabled' : ''} aria-pressed="${d === st.date}" aria-label="${esc(longDay(d))}${closed ? ', ' + t('closedShort') : ''}">
      <div class="wd">${esc(rel || fmt(d, { weekday: 'short' }).replace('.', ''))}</div><div class="dn">${Number(d.slice(8))}</div>
      <div class="mo">${closed ? t('closedShort') : esc(fmt(d, { month: 'short' }).replace('.', ''))}</div></button>`);
  }
  const inStrip = st.date && st.date <= addDays(today, 13);
  out.push(`<button type="button" class="day other ${!inStrip && st.date ? 'sel' : ''}" id="otherDay">${!inStrip && st.date ? esc(fmt(st.date, { day: 'numeric', month: 'short' })) : t('otherDate')}</button>`);
  $('days').innerHTML = out.join('');
  $('days').querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { st.date = b.dataset.d; $('dateIn').classList.add('hidden'); renderDays(); loadSlots(); });
  $('otherDay').onclick = () => { const di = $('dateIn'); di.classList.toggle('hidden'); di.min = today; di.max = addDays(today, 180); if (!di.classList.contains('hidden')) { di.focus(); di.showPicker?.(); } };
  const sel = $('days').querySelector('.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
$('dateIn').onchange = () => { if ($('dateIn').value) { st.date = $('dateIn').value; renderDays(); loadSlots(); } };

function renderZones() {
  const many = R.zones.length > 1;
  $('zoneSec').classList.toggle('hidden', !many);
  if (!many) return;
  $('zones').innerHTML = ['', ...R.zones].map((z) => `<button type="button" data-z="${esc(z)}" class="${z === st.zone ? 'sel' : ''}" aria-pressed="${z === st.zone}">${z ? esc(z.charAt(0).toUpperCase() + z.slice(1)) : t('any')}</button>`).join('');
  $('zones').querySelectorAll('button').forEach((b) => b.onclick = () => { st.zone = b.dataset.z; renderZones(); loadSlots(); });
}

// ---------- termini ----------
async function loadSlots() {
  const seq = ++loadSeq;
  st.slot = null;
  if (MODE === 'book') $('details').classList.add('hidden');
  updateModifyBar();
  $('slotDay').textContent = st.date ? `· ${longDay(st.date)}` : '';
  const box = $('slots');
  if (st.party > R.max_party_size) { box.innerHTML = ''; return; }
  if (isClosed(st.date)) { box.innerHTML = `<div class="none">${esc(t('closedDay'))}</div>`; findNext(seq); return; }
  box.innerHTML = `<div class="slots">${'<div class="slot skel"></div>'.repeat(8)}</div>`;
  try {
    const d = await api(`/api/r/${encodeURIComponent(slug)}/availability?date=${st.date}&party=${st.party}&zone=${encodeURIComponent(st.zone)}`);
    if (seq !== loadSeq) return;
    if (!d.slots.length) { box.innerHTML = `<div class="none">${esc(t('noSlots'))}</div>`; findNext(seq); return; }
    const lunch = d.slots.filter((s) => s.time < '16:00' && s.date === st.date), dinner = d.slots.filter((s) => !(s.time < '16:00' && s.date === st.date));
    const group = (title, list) => list.length ? `<div class="part">${lunch.length && dinner.length ? `<h3>${title}</h3>` : ''}<div class="slots">${list.map((s) =>
      `<button type="button" class="slot" data-date="${s.date}" data-time="${s.time}">${s.time}</button>`).join('')}</div></div>` : '';
    box.innerHTML = group(t('lunch'), lunch) + group(t('dinner'), dinner);
    box.querySelectorAll('.slot').forEach((b) => b.onclick = () => chooseSlot(b));
  } catch (e) {
    if (seq === loadSeq) box.innerHTML = `<div class="none">${esc(errText(e))}</div>`;
  }
}

/** kad je dan pun: prvi slobodan termin u idućih 14 dana */
async function findNext(seq) {
  const box = $('slots');
  box.insertAdjacentHTML('beforeend', `<p class="small muted" id="nextSearch">${esc(t('searching'))}</p>`);
  for (let i = 1; i <= 14; i++) {
    const d = addDays(st.date, i);
    if (isClosed(d)) continue;
    try {
      const r = await api(`/api/r/${encodeURIComponent(slug)}/availability?date=${d}&party=${st.party}&zone=${encodeURIComponent(st.zone)}`);
      if (seq !== loadSeq) return;
      if (r.slots.length) {
        const s = r.slots[0];
        $('nextSearch')?.remove();
        box.querySelector('.none').insertAdjacentHTML('beforeend', `<div><button type="button" class="btn btn-p" id="goNext">${esc(t('firstFree'))}: ${esc(longDay(s.date))}, ${s.time}</button></div>`);
        $('goNext').onclick = () => { st.date = s.date; renderDays(); loadSlots().then(() => { const b = $('slots').querySelector(`.slot[data-time="${s.time}"]`); if (b) chooseSlot(b); }); };
        return;
      }
    } catch { return; }
  }
  if (seq !== loadSeq) return;
  $('nextSearch')?.remove();
  box.querySelector('.none')?.insertAdjacentHTML('beforeend', `<p style="margin:8px 0 0">${esc(t('nothingSoon'))}</p>`);
}

function chooseSlot(b) {
  st.slot = { date: b.dataset.date, time: b.dataset.time };
  $('slots').querySelectorAll('.slot').forEach((x) => x.classList.toggle('sel', x === b));
  if (MODE === 'book') {
    $('details').classList.remove('hidden');
    renderSubmitSum(); msg('bookMsg', '');
    $('details').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => { if (!$('name').value) $('name').focus({ preventScroll: true }); }, 350);
  } else updateModifyBar();
}

function renderGuarantee() {
  const g = R?.guarantee;
  const on = g && st.party >= g.min_party;
  $('guaranteeInfo').classList.toggle('hidden', !on);
  if (on) $('guaranteeInfo').textContent = fill(t('guarantee'), { n: g.min_party, fee: eur(g.fee_cents) });
}
function renderSubmitSum() {
  if (!st.slot) { $('submitSum').textContent = ''; return; }
  $('submitSum').textContent = `${fmt(st.slot.date, { weekday: 'short', day: 'numeric', month: 'short' })} · ${st.slot.time} · ${st.party} ${persons(st.party)}`;
}

// ---------- rezervacija ----------
$('bookForm').onsubmit = async (e) => {
  e.preventDefault();
  msg('bookMsg', '');
  if (!$('name').value.trim()) { msg('bookMsg', t('needName')); $('name').focus(); return; }
  if (!$('phone').value.trim() && !$('email').value.trim()) { msg('bookMsg', t('needContact')); $('phone').focus(); return; }
  $('submit').disabled = true;
  try {
    const d = await api(`/api/r/${encodeURIComponent(slug)}/reservations`, { method: 'POST', body: JSON.stringify({
      name: $('name').value, phone: $('phone').value, email: $('email').value, notes: $('notes').value, website: $('website').value,
      partySize: st.party, date: st.slot.date, time: st.slot.time, zone: st.zone || undefined, language: L,
    }) });
    MCONTACT = $('phone').value.trim() || $('email').value.trim();
    try { sessionStorage.setItem('opsis-c-' + d.code, MCONTACT); } catch {}
    if (d.guaranteeUrl) return openCheckout(d.guaranteeUrl);
    DONE = d; renderDone(d);
    parent.postMessage({ type: 'opsis:booked', code: d.code }, '*');
  } catch (err) {
    const alts = (err.alternatives || []).filter((a) => a.date === st.slot.date).slice(0, 6);
    msg('bookMsg', errText(err), false, alts.length ? `<div class="alts">${alts.map((a) => `<button type="button" data-alt="${a.time}">${a.time}</button>`).join('')}</div>` : '');
    $('bookMsg').querySelectorAll('[data-alt]').forEach((b) => b.onclick = () => { loadSlots().then(() => { const s = $('slots').querySelector(`.slot[data-time="${b.dataset.alt}"]`); if (s) chooseSlot(s); }); });
    if (err.error === 'no_table') loadSlots().then(() => $('details').classList.remove('hidden'));
  } finally { $('submit').disabled = false; }
};

// Stripe se ne otvara unutar okvira (widget): vodimo cijelu stranicu, a ako preglednik to blokira, ostaje gumb
function openCheckout(url) {
  msg('bookMsg', t('redirect'), true, `<div style="margin-top:10px"><a class="btn btn-p btn-block" href="${esc(url)}" target="_top">${esc(t('payLink'))}</a></div>`);
  if (window.top === window) { location.href = url; return; }
  try { window.top.location.href = url; } catch {}
}

let DONE = null;
function ticket({ code, date, time, party_size, status }, inner) {
  return `<div class="ticket">
    <div class="t-top"><div class="rn">${esc(R.name)}</div>${inner.head}
      <div class="t-facts"><div><span>${t('date')}</span><b>${esc(longDay(date))}</b></div><div><span>${t('time')}</span><b class="tm">${time}</b></div>
        <div><span>${t('guests')}</span><b class="tm">${party_size}</b></div></div>
      ${status ? `<span class="pill t-status st-${status}">${esc(t('status')[status] || status)}</span>` : ''}</div>
    <div class="perf"></div>
    <div class="t-stub"><div><div class="lab">${t('code')}</div><div class="code">${esc(code)}</div></div>${inner.foot}</div></div>`;
}
function renderDone(d) {
  $('pick').classList.add('hidden'); $('details').classList.add('hidden'); $('manage').classList.add('hidden');
  const ch = { whatsapp: 'WhatsApp', sms: 'SMS', email: L === 'de' ? 'E-Mail' : 'email' };
  const sent = d.notified?.length ? fill(t('sentTo'), { ch: d.notified.map((c) => ch[c] || c).join(', ') }) : t('noMsg');
  $('done').innerHTML = ticket({ ...d, party_size: d.party_size ?? st.party, status: null }, {
    head: `<h2>${esc(t('seeYou'))}</h2><p>${esc(sent)}</p>`,
    foot: `<div class="t-acts"><button class="btn" id="icsBtn">${esc(t('addCal'))}</button>
      <a class="btn" href="?code=${esc(d.code)}&lang=${L}">${esc(t('manageLink'))}</a>
      <button class="btn btn-ghost" id="againBtn">${esc(t('newBooking'))}</button></div>`,
  });
  $('done').classList.remove('hidden');
  $('icsBtn').onclick = () => downloadIcs(d);
  $('againBtn').onclick = () => { DONE = null; $('done').classList.add('hidden'); $('pick').classList.remove('hidden'); $('bookForm').reset(); loadSlots(); scrollTo(0, 0); };
  scrollTo(0, 0);
}

/** kalendar (.ics) s točnim vremenom u UTC-u, pa radi u svakoj vremenskoj zoni */
function downloadIcs(d) {
  const z = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const tx = (s) => String(s).replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const manage = `${location.origin}/b/${encodeURIComponent(slug)}?code=${d.code}`;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Opsis Restoran//HR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${d.code}@opsis-restoran`, `DTSTAMP:${z(new Date().toISOString())}`, `DTSTART:${z(d.start_at)}`, `DTEND:${z(d.end_at)}`,
    `SUMMARY:${tx(`${R.name} (${d.party_size ?? st.party} ${persons(d.party_size ?? st.party)})`)}`,
    R.address ? `LOCATION:${tx(R.address)}` : '', `DESCRIPTION:${tx(`${t('code')}: ${d.code}\n${t('manageLink')}: ${manage}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${tx(R.name)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  a.download = `${R.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-${d.code}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
}

// ---------- pregled, izmjena i otkaz ----------
async function manage(code) {
  $('pick').classList.add('hidden'); $('manage').classList.remove('hidden');
  $('mCodeAsk').textContent = code;
  if (q.get('guarantee') === 'ok') msg('topMsg', t('guaranteeOk'), true);
  if (q.get('guarantee') === 'cancel') msg('topMsg', t('guaranteeCancel'), false, `<div style="margin-top:10px"><a class="btn btn-p" href="/g/${esc(code)}" target="_top">${esc(t('enterCard'))}</a></div>`);
  $('mForm').onsubmit = async (e) => { e.preventDefault(); await loadManaged(code, $('mContact').value.trim()); };
  let saved = ''; try { saved = sessionStorage.getItem('opsis-c-' + code) || ''; } catch {}
  if (saved) { $('mContact').value = saved; await loadManaged(code, saved); }
}
async function loadManaged(code, contact) {
  msg('mAskMsg', '');
  try {
    MRES = await api(`/api/r/${encodeURIComponent(slug)}/reservations/${encodeURIComponent(code)}?contact=${encodeURIComponent(contact)}`);
    MCONTACT = contact;
    try { sessionStorage.setItem('opsis-c-' + code, contact); } catch {}
    $('mAsk').classList.add('hidden');
    renderManage();
  } catch (e) { msg('mAskMsg', errText(e)); }
}
function renderManage(note = '') {
  const r = MRES;
  const open = ['confirmed', 'pending_guarantee'].includes(r.status) && new Date(r.start_at).getTime() > Date.now();
  $('mView').innerHTML = (note ? `<div class="msg ok" style="margin-bottom:14px">${esc(note)}</div>` : '') + ticket(r, {
    head: `<h2>${esc(t('reservation'))}</h2>`,
    foot: open ? `<div class="t-acts">${r.status === 'pending_guarantee' ? `<a class="btn btn-p" href="/g/${esc(r.code)}" target="_top">${esc(t('enterCard'))}</a>` : ''}
      <button class="btn" id="mChange">${esc(t('change'))}</button><button class="btn" id="icsBtn2">${esc(t('addCal'))}</button>
      <button class="btn btn-danger" id="mCancel">${esc(t('cancel'))}</button></div><div id="mMsg"></div>` : '<div id="mMsg"></div>',
  });
  if (!open) return;
  $('icsBtn2').onclick = () => downloadIcs(r);
  $('mCancel').onclick = async () => {
    if (!confirm(t('cancelAsk'))) return;
    try {
      const u = await api(`/api/r/${encodeURIComponent(slug)}/reservations/${r.code}/cancel`, { method: 'POST', body: JSON.stringify({ contact: MCONTACT }) });
      MRES = { ...MRES, status: u.status }; endModify(); renderManage(t('cancelled'));
    } catch (e) { msg('mMsg', errText(e)); }
  };
  $('mChange').onclick = () => startModify();
}
function startModify() {
  MODE = 'modify';
  st.party = Math.min(MRES.party_size, R.max_party_size); st.date = MRES.date; st.zone = '';
  const pick = $('pick');
  $('mView').appendChild(pick);
  pick.classList.remove('hidden'); pick.style.marginTop = '14px';
  pick.insertAdjacentHTML('beforeend', `<div class="sec" id="modBar" style="margin-top:14px"><p class="small muted" style="margin:0 0 10px">${esc(t('pickNew'))}</p>
    <div class="t-acts"><button class="btn btn-p btn-lg" id="modGo" disabled>${esc(t('confirmChange'))}</button><button class="btn btn-ghost" id="modBack">${esc(t('back'))}</button></div><div id="modMsg" style="margin-top:10px"></div></div>`);
  $('modBack').onclick = () => { endModify(); renderManage(); };
  $('modGo').onclick = async () => {
    try {
      $('modGo').disabled = true;
      const u = await api(`/api/r/${encodeURIComponent(slug)}/reservations/${MRES.code}/modify`, { method: 'POST',
        body: JSON.stringify({ contact: MCONTACT, date: st.slot.date, time: st.slot.time, partySize: st.party }) });
      MRES = { ...MRES, ...u }; endModify(); renderManage(t(u.notified?.length ? 'changed' : 'changedNoMsg')); scrollTo(0, 0);
    } catch (e) { msg('modMsg', errText(e)); $('modGo').disabled = false; }
  };
  renderParty(); renderDays(); renderZones(); loadSlots();
  pick.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function updateModifyBar() {
  if (MODE !== 'modify' || !$('modGo')) return;
  $('modGo').disabled = !st.slot;
  if (st.slot) $('modGo').textContent = `${t('confirmChange')}: ${fmt(st.slot.date, { day: 'numeric', month: 'short' })} ${st.slot.time}`;
}
function endModify() {
  MODE = 'book';
  $('modBar')?.remove();
  const pick = $('pick'); pick.classList.add('hidden'); pick.style.marginTop = '';
  $('details').before(pick);
}

// ---------- meni i radno vrijeme ----------
function openSheet(title, html) {
  $('sheetTitle').textContent = title; $('sheetBody').innerHTML = html;
  $('sheet').classList.add('on'); $('sheetBg').classList.add('on'); $('sheetClose').focus();
}
function closeSheet() { $('sheet').classList.remove('on'); $('sheetBg').classList.remove('on'); }
$('sheetClose').onclick = closeSheet; $('sheetBg').onclick = closeSheet;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
const nm = (o) => (o && (o[L] || o.hr || o.en || Object.values(o)[0])) || '';
const alg = (a) => L === 'hr' ? a : (ALLERGENS[a]?.[L === 'en' ? 0 : 1] || a);
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
$('menuBtn').onclick = async () => {
  try {
    const { menu } = await api(`/api/r/${encodeURIComponent(slug)}/menu`);
    const cats = [...new Set(menu.map((m) => m.category))];
    openSheet(t('menu'), cats.map((c) => `<div class="mcat">${esc(cat(c))}</div>` + menu.filter((m) => m.category === c).map((m) => `<div class="mitem"><div><b>${esc(nm(m.name))}</b>
      ${nm(m.description) ? `<div class="d">${esc(nm(m.description))}</div>` : ''}${m.allergens.length ? `<div class="a">${t('allergens')}: ${esc(m.allergens.map(alg).join(', '))}</div>` : ''}</div>
      <span class="p">${eur(m.price_cents)}</span></div>`).join('')).join(''));
  } catch (e) { toast(errText(e)); }
};
$('hoursBtn').onclick = () => {
  const today = localNow().date, wdToday = weekday(today);
  const rows = [1, 2, 3, 4, 5, 6, 7].map((wd) => {
    const ps = R.opening_hours.filter((p) => p.weekday === wd);
    const name = new Date(Date.UTC(2024, 0, wd)).toLocaleDateString(LOCALE[L], { weekday: 'long', timeZone: 'UTC' }); // 1. 1. 2024. je ponedjeljak
    return `<tr class="${wd === wdToday ? 'today' : ''}"><td>${esc(name.charAt(0).toUpperCase() + name.slice(1))}</td><td>${ps.length ? ps.map((p) => `${p.open}–${p.close}`).join(', ') : esc(t('closedShort'))}</td></tr>`;
  }).join('');
  const closed = R.closed_dates.filter((d) => d >= today).sort().slice(0, 8);
  openSheet(t('hours'), `<table class="hours"><tbody>${rows}</tbody></table>${closed.length ? `<p class="small muted">${esc(t('closedShort'))}: ${closed.map((d) => esc(fmt(d, { day: 'numeric', month: 'long' }))).join(', ')}</p>` : ''}`);
};

// ---------- boja restorana (iz widgeta: data-color) ----------
const accent = (q.get('accent') || '').replace('#', '');
if (/^[0-9a-f]{6}$/i.test(accent)) {
  const s = document.documentElement.style, c = '#' + accent;
  s.setProperty('--skura', c);
  s.setProperty('--skura-2', `color-mix(in srgb, ${c} 80%, white)`);
  s.setProperty('--skura-3', `color-mix(in srgb, ${c} 72%, black)`);
  document.querySelector('meta[name=theme-color]').content = c;
}

(async function init() {
  applyLang();
  try { R = await api(`/api/r/${encodeURIComponent(slug)}`); } catch (e) { document.querySelector('main').innerHTML = `<div class="msg err">${esc(errText(e))}</div>`; return; }
  TZ = R.timezone || TZ;
  st.party = Math.min(2, R.max_party_size);
  let d = localNow().date;
  for (let i = 0; i < 14 && isClosed(d); i++) d = addDays(d, 1);
  st.date = d;
  const code = q.get('code');
  if (code) $('pick').classList.add('hidden');
  applyLang(); // učita i termine kad je odabir vidljiv
  if (code) manage(code.trim().toUpperCase());
})();
