/* ICNC 2027 — navigation + small helpers (no dependencies) */
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  var items = document.querySelectorAll('.nav > li.has-sub');
  function closeAll() {
    items.forEach(function (o) { o.classList.remove('open'); o.querySelector('button').setAttribute('aria-expanded', 'false'); });
  }
  items.forEach(function (li) {
    var btn = li.querySelector('button');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var wasOpen = li.classList.contains('open');
      closeAll();
      if (!wasOpen) { li.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
    });
  });
  document.addEventListener('click', closeAll);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
  // hide logo images that are not present yet
  document.querySelectorAll('img[data-optional]').forEach(function (img) {
    img.addEventListener('error', function () { img.style.display = 'none'; });
  });
  // highlight the next upcoming milestone on the key-dates strip
  var now = new Date(), picked = null;
  document.querySelectorAll('.timeline li[data-date]').forEach(function (li) {
    if (!picked && new Date(li.getAttribute('data-date')) >= now) picked = li;
  });
  if (picked) picked.classList.add('is-now');
})();
