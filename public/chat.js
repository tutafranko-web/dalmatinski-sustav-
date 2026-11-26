/* Opsis Restoran: AI chat na webu restorana.
   Ugradnja: <script src="https://TVOJA-DOMENA/chat.js" data-restaurant="konoba-test" data-color="#1e4d43" async></script>
   Ne prikazuje se dok na serveru nije podešen AI (tada bi gost pisao u prazno). */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var slug = s.getAttribute('data-restaurant');
  var base = s.src.replace(/\/chat\.js.*$/, '');
  var color = s.getAttribute('data-color') || '#1e4d43';
  if (!/^#[0-9a-f]{6}$/i.test(color)) color = '#1e4d43';
  var lang = (document.documentElement.lang || navigator.language || 'hr').slice(0, 2).toLowerCase();
  var T = {
    hr: { hello: 'Bok! Ja sam AI asistent restorana. Provjerim slobodne stolove, napravim ili promijenim rezervaciju i odgovorim na pitanja o meniju, parkingu i radnom vremenu.',
      sub: 'AI asistent · odgovara odmah', ph: 'Napišite poruku…', send: 'Pošalji', close: 'Zatvori', open: 'Otvori chat s restoranom', err: 'Veza nije uspjela. Pokušajte ponovno.',
      chips: ['Imate li slobodan stol večeras?', 'Koje je radno vrijeme?', 'Ima li parkinga?'] },
    en: { hello: "Hi! I'm the restaurant's AI assistant. I can check tables, make or change a booking and answer questions about the menu, parking and opening hours.",
      sub: 'AI assistant · replies instantly', ph: 'Type a message…', send: 'Send', close: 'Close', open: 'Open chat with the restaurant', err: 'Connection failed. Please try again.',
      chips: ['Do you have a table tonight?', 'What are your opening hours?', 'Is there parking?'] },
    de: { hello: 'Hallo! Ich bin der KI-Assistent des Restaurants. Ich prüfe freie Tische, reserviere oder ändere eine Reservierung und beantworte Fragen zu Speisekarte, Parken und Öffnungszeiten.',
      sub: 'KI-Assistent · antwortet sofort', ph: 'Nachricht schreiben…', send: 'Senden', close: 'Schließen', open: 'Chat mit dem Restaurant öffnen', err: 'Verbindung fehlgeschlagen. Bitte erneut versuchen.',
      chips: ['Haben Sie heute Abend einen Tisch?', 'Wie sind die Öffnungszeiten?', 'Gibt es Parkplätze?'] },
  }[lang] || null;
  if (!T) T = { hello: "Hi! I'm the restaurant's AI assistant. I can check tables, make or change a booking and answer questions.", sub: 'AI assistant · replies instantly', ph: 'Type a message…', send: 'Send', close: 'Close', open: 'Open chat', err: 'Connection failed. Please try again.', chips: ['Do you have a table tonight?', 'What are your opening hours?'] };

  var key = 'opsis-chat-' + slug;
  // spremanje može biti zabranjeno (privatni način, stroge postavke): chat tada radi bez pamćenja
  var store = null;
  try { store = window.localStorage; store.getItem(key); } catch (e) { store = null; }
  var sid = store && store.getItem(key);
  if (!sid) { sid = 'w' + Math.random().toString(36).slice(2) + Date.now().toString(36); if (store) store.setItem(key, sid); }
  var logKey = key + '-log';
  var saved = [];
  try { saved = JSON.parse((store && store.getItem(logKey)) || '[]'); } catch (e) { saved = []; }

  fetch(base + '/api/r/' + encodeURIComponent(slug)).then(function (r) { return r.ok ? r.json() : null; }).then(function (info) {
    if (info && info.chat_enabled) build(info.name);
  }).catch(function () {});

  function build(name) {
    var css = document.createElement('style');
    css.textContent =
      '.oc-btn{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:0;background:' + color + ';color:#fff;cursor:pointer;z-index:2147483000;box-shadow:0 6px 20px rgba(0,0,0,.28);display:grid;place-items:center;transition:transform .15s}' +
      '.oc-btn:hover{transform:scale(1.05)}.oc-btn:focus-visible,.oc-box button:focus-visible,.oc-box input:focus-visible{outline:3px solid #c99a1e;outline-offset:2px}' +
      '.oc-box{position:fixed;right:20px;bottom:92px;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100vh - 120px));background:#fbfbf9;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;z-index:2147483000;font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#17221f}' +
      '.oc-h{display:flex;align-items:center;gap:10px;padding:14px 14px 12px 16px;background:' + color + ';color:#fff}.oc-h b{display:block;font-size:16px}.oc-h small{opacity:.85;font-size:12px}' +
      '.oc-h .oc-av{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center;flex:none}' +
      '.oc-x{margin-left:auto;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.15);color:#fff;font:22px/1 system-ui;cursor:pointer}' +
      '.oc-log{flex:1;overflow:auto;padding:14px;background:#ecede8;display:flex;flex-direction:column;gap:8px}' +
      '.oc-m{max-width:85%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}' +
      '.oc-bot{background:#fff;border:1px solid #d3d8cf;border-bottom-left-radius:4px;align-self:flex-start}.oc-me{background:' + color + ';color:#fff;border-bottom-right-radius:4px;align-self:flex-end}' +
      '.oc-dots{display:inline-flex;gap:4px;padding:4px 0}.oc-dots i{width:7px;height:7px;border-radius:50%;background:#5b6863;animation:oc-b 1s infinite}.oc-dots i:nth-child(2){animation-delay:.15s}.oc-dots i:nth-child(3){animation-delay:.3s}' +
      '@keyframes oc-b{0%,60%,100%{opacity:.3;transform:none}30%{opacity:1;transform:translateY(-3px)}}' +
      '@media (prefers-reduced-motion:reduce){.oc-dots i{animation:none}.oc-btn{transition:none}}' +
      '.oc-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px;background:#ecede8}.oc-chips button{border:1px solid ' + color + ';background:#fff;color:' + color + ';border-radius:999px;padding:6px 11px;font:600 13px system-ui,sans-serif;cursor:pointer}' +
      '.oc-f{display:flex;gap:6px;padding:10px;border-top:1px solid #d3d8cf;background:#fbfbf9}.oc-f input{flex:1;min-width:0;border:1px solid #d3d8cf;border-radius:999px;padding:10px 14px;font:inherit;outline:none}' +
      '.oc-f input:focus{border-color:' + color + '}.oc-f button{width:42px;height:42px;border-radius:50%;border:0;background:' + color + ';color:#fff;cursor:pointer;display:grid;place-items:center;flex:none}' +
      '.oc-f button:disabled{opacity:.5;cursor:default}';
    document.head.appendChild(css);

    var icon = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>';
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'oc-btn'; btn.innerHTML = icon; btn.setAttribute('aria-label', T.open); btn.setAttribute('aria-expanded', 'false');
    var box = document.createElement('div');
    box.className = 'oc-box'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', name);
    box.innerHTML = '<div class="oc-h"><span class="oc-av">' + icon.replace('26', '20').replace('26', '20') + '</span><div><b></b><small></small></div><button type="button" class="oc-x">×</button></div>' +
      '<div class="oc-log" aria-live="polite"></div><div class="oc-chips"></div>' +
      '<form class="oc-f"><input maxlength="2000" autocomplete="off"><button type="submit"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 20l18-8L3 4v6l12 2-12 2z"/></svg></button></form>';
    document.body.appendChild(btn); document.body.appendChild(box);
    box.querySelector('.oc-h b').textContent = name;
    box.querySelector('.oc-h small').textContent = T.sub;
    var x = box.querySelector('.oc-x'); x.setAttribute('aria-label', T.close);
    var log = box.querySelector('.oc-log'), form = box.querySelector('form'), input = box.querySelector('input'), sendBtn = form.querySelector('button'), chips = box.querySelector('.oc-chips');
    input.placeholder = T.ph; sendBtn.setAttribute('aria-label', T.send);

    function add(text, me, store) {
      var d = document.createElement('div'); d.className = 'oc-m ' + (me ? 'oc-me' : 'oc-bot'); d.textContent = text;
      log.appendChild(d); log.scrollTop = log.scrollHeight;
      if (store) { saved.push({ me: !!me, t: text }); saved = saved.slice(-40); try { if (store) store.setItem(logKey, JSON.stringify(saved)); } catch (e) {} }
      return d;
    }
    add(T.hello, false, false);
    saved.forEach(function (m) { add(m.t, m.me, false); });
    function drawChips() {
      chips.innerHTML = '';
      if (saved.length) { chips.style.display = 'none'; return; }
      T.chips.forEach(function (c) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = c;
        b.onclick = function () { ask(c); };
        chips.appendChild(b);
      });
    }
    drawChips();

    function setOpen(on) {
      box.style.display = on ? 'flex' : 'none';
      btn.setAttribute('aria-expanded', String(on));
      if (on) { log.scrollTop = log.scrollHeight; input.focus(); } else btn.focus();
    }
    btn.onclick = function () { setOpen(box.style.display !== 'flex'); };
    x.onclick = function () { setOpen(false); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && box.style.display === 'flex') setOpen(false); });

    var busy = false;
    function ask(text) {
      if (busy || !text) return;
      busy = true; sendBtn.disabled = true; chips.style.display = 'none';
      add(text, true, true);
      var wait = add('', false, false);
      wait.innerHTML = '<span class="oc-dots" aria-label="…"><i></i><i></i><i></i></span>';
      fetch(base + '/api/r/' + encodeURIComponent(slug) + '/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sid, message: text }),
      }).then(function (r) { return r.json(); })
        .then(function (d) { var reply = d.reply || d.message || T.err; wait.textContent = reply; if (d.reply) { saved.push({ me: false, t: reply }); saved = saved.slice(-40); try { if (store) store.setItem(logKey, JSON.stringify(saved)); } catch (e) {} } })
        .catch(function () { wait.textContent = T.err; })
        .then(function () { busy = false; sendBtn.disabled = false; log.scrollTop = log.scrollHeight; input.focus(); });
    }
    form.onsubmit = function (e) { e.preventDefault(); var v = input.value.trim(); input.value = ''; ask(v); };
  }
})();
