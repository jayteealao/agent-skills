// Served at _assets/livereload.js. Kept external (not inline) so served pages
// can ship a strict `script-src 'self'` CSP that blocks injected inline scripts
// from artifact / .html.fragment content while still allowing live reload.
//
// Under the multi-repo hub, ONE SSE stream (/__sdlc/events) serves every repo,
// so a reload event must only reload the tab whose repo actually re-rendered.
// The hub injects <meta name="sdlc-repo-id"> into each repo's INDEX.html at
// serve time; this client reloads only when the event's id matches. The
// per-repo daemon injects no such tag, so there the reload is unconditional —
// backward compatible.
(() => {
  if (!('EventSource' in window)) return;
  const meta = document.querySelector('meta[name="sdlc-repo-id"]');
  const myId = meta && meta.content ? meta.content : null;
  const events = new EventSource('/__sdlc/events');
  events.addEventListener('reload', (e) => {
    if (!myId) { window.location.reload(); return; }   // per-repo daemon: always reload
    let id = null;
    try { id = JSON.parse(e.data).id; } catch { /* malformed → reload to be safe */ }
    if (id == null || id === myId) window.location.reload();
  });
})();
