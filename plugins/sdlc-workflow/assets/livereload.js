// Served at _assets/livereload.js. Kept external (not inline) so served pages
// can ship a strict `script-src 'self'` CSP that blocks injected inline scripts
// from artifact / .html.fragment content while still allowing live reload.
(() => {
  if (!('EventSource' in window)) return;
  const events = new EventSource('/__sdlc/events');
  events.addEventListener('reload', () => window.location.reload());
})();
