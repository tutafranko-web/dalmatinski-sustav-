/* Opsis Restoran: gumb za rezervaciju na webu restorana.
   Ugradnja: <script src="https://TVOJA-DOMENA/widget.js" data-restaurant="konoba-test" data-label="Rezerviraj stol" data-color="#1e4d43" async></script>
   Stoji lijevo dolje jer je desno AI chat; bez chata može i data-side="right". data-color oboji i gumb i stranicu za rezervaciju. */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var slug = s.getAttribute('data-restaurant');
  var base = s.src.replace(/\/widget\.js.*$/, '');
  var lang = (document.documentElement.lang || navigator.language || 'hr').slice(0, 2).toLowerCase();
  var labels = { hr: 'Rezerviraj stol', en: 'Book a table', de: 'Tisch reservieren' };
  var label = s.getAttribute('data-label') || labels[lang] || labels.en;
  var color = s.getAttribute('data-color') || '#1e4d43';
  if (!/^#[0-9a-f]{6}$/i.test(color)) color = '#1e4d43';
  var side = s.getAttribute('data-side') === 'right' ? 'right' : 'left';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="flex:none"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><span></span>';
  btn.lastChild.textContent = label;
  btn.style.cssText = 'position:fixed;' + side + ':20px;bottom:20px;z-index:2147483000;display:inline-flex;align-items:center;gap:8px;padding:13px 20px;border:0;border-radius:999px;background:' + color +
    ';color:#fff;font:600 15px/1 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer;transition:transform .15s';
  btn.onmouseenter = function () { btn.style.transform = 'translateY(-2px)'; };
  btn.onmouseleave = function () { btn.style.transform = ''; };

  var overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', label);
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,22,20,.55);z-index:2147483001;display:none;align-items:center;justify-content:center';
  var frame = document.createElement('iframe');
  frame.title = label;
  frame.style.cssText = 'width:min(560px,100vw);height:min(820px,100vh);border:0;border-radius:16px;background:#ecede8;box-shadow:0 20px 60px rgba(0,0,0,.35)';
  if (window.innerWidth < 600) frame.style.borderRadius = '0';
  var close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', { hr: 'Zatvori', de: 'Schließen' }[lang] || 'Close');
  close.style.cssText = 'position:absolute;top:10px;right:12px;width:44px;height:44px;border-radius:50%;font:30px/1 system-ui;color:#fff;background:rgba(0,0,0,.35);border:0;cursor:pointer;z-index:1';
  overlay.appendChild(frame);
  overlay.appendChild(close);

  var last = null;
  function open() {
    if (!frame.src) frame.src = base + '/b/' + encodeURIComponent(slug) + '?lang=' + lang + '&accent=' + color.slice(1);
    last = document.activeElement;
    overlay.style.display = 'flex';
    document.documentElement.style.overflow = 'hidden';
    close.focus();
  }
  function hide() {
    overlay.style.display = 'none';
    document.documentElement.style.overflow = '';
    if (last && last.focus) last.focus();
  }
  btn.onclick = open;
  close.onclick = hide;
  overlay.onclick = function (e) { if (e.target === overlay) hide(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.style.display === 'flex') hide(); });
  document.body.appendChild(btn);
  document.body.appendChild(overlay);
})();
