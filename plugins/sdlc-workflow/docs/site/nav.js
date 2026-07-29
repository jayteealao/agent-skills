// Sidebar loader + mobile drawer. Each page carries an empty
// <aside id="sidebar"> with a fallback "Contents" link; this script replaces
// it with nav.html (the single hand-edited source of the sidebar), rewrites
// the nav's site-root-relative hrefs against the page's data-root, highlights
// the current page, and — on narrow screens — adds a Menu button that slides
// the sidebar in as a drawer. Over file:// fetch fails and the fallback link
// stays: the site degrades, it doesn't break.
(function () {
  var root = document.body.getAttribute('data-root') || '';

  fetch(root + 'nav.html')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(function (html) {
      var aside = document.getElementById('sidebar');
      if (!aside) return;
      aside.innerHTML = html;
      var here = location.pathname.replace(/\/+$/, '/');
      aside.querySelectorAll('a[href]').forEach(function (a) {
        var target = a.getAttribute('href');
        a.setAttribute('href', root + target);
        var full = new URL(root + target, location.href).pathname;
        if (full === here || (here.endsWith('/') && full === here + 'index.html')) {
          a.classList.add('current');
        }
      });
      var current = aside.querySelector('a.current');
      if (current && current.scrollIntoView) {
        current.scrollIntoView({ block: 'nearest' });
      }
    })
    .catch(function () { /* keep fallback link */ });

  // Mobile drawer toggle. Rendered on every page; CSS hides it above 940px.
  var btn = document.createElement('button');
  btn.className = 'nav-toggle';
  btn.type = 'button';
  btn.textContent = 'Menu';
  btn.setAttribute('aria-label', 'Toggle navigation');
  btn.addEventListener('click', function () {
    document.body.classList.toggle('nav-open');
    btn.textContent = document.body.classList.contains('nav-open') ? 'Close' : 'Menu';
  });
  document.body.appendChild(btn);

  // Tapping a nav link (or outside the drawer) closes it.
  document.addEventListener('click', function (e) {
    if (!document.body.classList.contains('nav-open')) return;
    var inSidebar = e.target.closest && e.target.closest('#sidebar');
    var onToggle = e.target.closest && e.target.closest('.nav-toggle');
    if ((inSidebar && e.target.closest('a')) || (!inSidebar && !onToggle)) {
      document.body.classList.remove('nav-open');
      btn.textContent = 'Menu';
    }
  });
})();
