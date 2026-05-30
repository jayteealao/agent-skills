// renderers/hub-dashboard.mjs — the multi-repo hub landing page (GET /).
//
// Renders a single standalone HTML document (no _shell wrapper) straight from
// the in-memory registry — the hub serves the result with a 2-second
// micro-cache, so there are no per-request disk reads (slugMeta carries
// everything). Styling is inline so the hub needs no separate /_assets/ route
// (§5 critique gap, minor). Live reload uses a tiny same-origin script the hub
// serves at /__sdlc/hub-reload.js (satisfies the strict script-src 'self' CSP).
//
// Content (§5): summary bar · repo swimlane grid (grouped by repoRoot, one
// sub-row per branch/worktree, reusing swimlanesSvg per entry) · slug links ·
// stale warnings · aggregate live reload.

import { escapeHtml } from './_validator.mjs';
import { swimlanesSvg } from './dashboard.mjs';

const TERMINAL_COMPLETE = new Set(['complete', 'completed', 'shipped', 'done']);
const TERMINAL_CLOSED = new Set(['closed', 'abandoned', 'cancelled']);
const STALE_MS = 7 * 24 * 60 * 60 * 1000;   // dim entries not rendered in a week

function low(s) { return String(s ?? '').trim().toLowerCase(); }

function isActiveSlug(sm) {
  const s = low(sm.status);
  return !TERMINAL_COMPLETE.has(s) && !TERMINAL_CLOSED.has(s);
}

// Map a registry entry's slugMeta into the { slug, fm } rows swimlanesSvg wants,
// split into active vs recently-shipped lanes.
function laneInputs(entry) {
  const toRow = (sm) => ({
    slug: sm.slug,
    fm: { 'current-stage': sm.currentStage, status: sm.status, blocked: sm.blocked },
  });
  const meta = entry.slugMeta ?? [];
  return {
    active: meta.filter(isActiveSlug).map(toRow),
    shipped: meta.filter((sm) => TERMINAL_COMPLETE.has(low(sm.status))).map(toRow),
  };
}

function humanRelative(iso, now) {
  if (!iso) return 'never rendered';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return String(iso);
  const diff = now - then;
  if (diff < 0) return String(iso);
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  const mo = Math.round(d / 30);
  return `${mo} mo ago`;
}

function basenameOf(p) {
  const parts = String(p ?? '').replace(/[\\/]+$/, '').split(/[\\/]/);
  return parts[parts.length - 1] || String(p ?? '');
}

// The cross-repo "needs attention" work-queue (§11.3): one flat list across ALL
// repos of active workflows that are blocked, in review, or stale. Pure
// view-layer — reads only slugMeta.{status,blocked,currentStage} + the entry's
// lastRenderedAt. Sorted blocked → review → stale, then oldest-first so the
// most-neglected work floats to the top.
export function inboxItems(entries = [], now = Date.now()) {
  const items = [];
  for (const e of entries) {
    const stale = !e.lastRenderedAt || (now - Date.parse(e.lastRenderedAt)) > STALE_MS;
    for (const sm of (e.slugMeta ?? [])) {
      if (!isActiveSlug(sm)) continue;   // shipped/closed work never "needs attention"
      const reasons = [];
      if (sm.blocked) reasons.push({ key: 'blocked', label: 'blocked', tone: 'bad' });
      if (low(sm.currentStage) === 'review' || low(sm.status) === 'review') {
        reasons.push({ key: 'review', label: 'in review', tone: 'cur' });
      }
      if (stale) reasons.push({ key: 'stale', label: `idle ${humanRelative(e.lastRenderedAt, now)}`, tone: 'idle' });
      if (!reasons.length) continue;
      const priority = reasons.some((r) => r.key === 'blocked') ? 0
        : reasons.some((r) => r.key === 'review') ? 1 : 2;
      items.push({ entry: e, sm, reasons, priority });
    }
  }
  items.sort((a, b) => a.priority - b.priority
    || String(a.entry.lastRenderedAt ?? '').localeCompare(String(b.entry.lastRenderedAt ?? ''))
    || basenameOf(a.entry.repoRoot).localeCompare(basenameOf(b.entry.repoRoot)));
  return items;
}

function renderInbox(items, totalRepos) {
  if (!items.length) {
    return `<p class="inbox-zero">✓ Nothing needs attention across ${totalRepos} repo${totalRepos === 1 ? '' : 's'}.</p>`;
  }
  const rows = items.map((it) => {
    const idEnc = encodeURIComponent(it.entry.id);
    const slugEnc = encodeURIComponent(it.sm.slug);
    const badges = it.reasons.map((r) => `<span class="reason ${r.tone}">${escapeHtml(r.label)}</span>`).join('');
    return `<a class="inbox-item" href="/r/${idEnc}/${slugEnc}/">
      <span class="ix-repo">${escapeHtml(basenameOf(it.entry.repoRoot))}</span>
      <span class="ix-sep" aria-hidden="true">/</span>
      <code class="ix-slug">${escapeHtml(it.sm.slug)}</code>
      <span class="ix-stage">${escapeHtml(it.sm.currentStage ?? it.sm.status ?? '')}</span>
      <span class="ix-reasons">${badges}</span>
    </a>`;
  }).join('');
  return `<div class="inbox">${rows}</div>`;
}

/**
 * @param {Array} entries — registry entries.
 * @param {{ pluginVersion?: string, uptimeMs?: number, now?: number }} [opts]
 * @returns {string} a complete HTML document.
 */
export function renderHubLanding(entries = [], { pluginVersion = '', uptimeMs = 0, now = Date.now() } = {}) {
  const totalRepos = entries.length;
  const totalActiveSlugs = entries.reduce((n, e) => n + (e.slugMeta ?? []).filter(isActiveSlug).length, 0);
  const uptimeMin = Math.max(0, Math.round(uptimeMs / 60000));
  const inbox = inboxItems(entries, now);

  // Group by repoRoot; within a group, one card per branch/worktree entry.
  const groups = new Map();
  for (const e of entries) {
    if (!groups.has(e.repoRoot)) groups.set(e.repoRoot, []);
    groups.get(e.repoRoot).push(e);
  }
  const sortedRepoRoots = [...groups.keys()].sort((a, b) => basenameOf(a).localeCompare(basenameOf(b)));

  const summary = `
    <header class="hub-head">
      <h1>SDLC Hub</h1>
      <div class="summary">
        <span class="stat${inbox.length ? ' alert' : ''}"><b>${inbox.length}</b> needing attention</span>
        <span class="stat"><b>${totalRepos}</b> repo${totalRepos === 1 ? '' : 's'}</span>
        <span class="stat"><b>${totalActiveSlugs}</b> active workflow${totalActiveSlugs === 1 ? '' : 's'}</span>
        <span class="stat">up ${uptimeMin} min</span>
        ${pluginVersion ? `<span class="stat ver">v${escapeHtml(pluginVersion)}</span>` : ''}
      </div>
    </header>`;

  if (totalRepos === 0) {
    return htmlDoc(`${summary}
    <p class="empty">No repos have rendered yet. Render any sdlc workflow with <code>view.hub.enabled: true</code> and it will appear here.</p>`);
  }

  const repoGroups = sortedRepoRoots.map((repoRoot) => repoGroup(repoRoot, groups.get(repoRoot), now)).join('\n');

  // CSS-only radio tabs: Inbox is the default tab (§11.3), the swimlane grid is
  // secondary. The radios precede .tabs + the panels as siblings so the
  // `:checked ~` selectors can toggle visibility — no inline JS (CSP-safe).
  const tabs = `
    <input type="radio" name="hubtab" id="tab-inbox" class="tabin" checked>
    <input type="radio" name="hubtab" id="tab-repos" class="tabin">
    <nav class="tabs" aria-label="views">
      <label for="tab-inbox">Inbox <span class="tcount">${inbox.length}</span></label>
      <label for="tab-repos">All repos <span class="tcount">${totalRepos}</span></label>
    </nav>
    <section class="panel panel-inbox">${renderInbox(inbox, totalRepos)}</section>
    <section class="panel panel-repos">${repoGroups}</section>`;

  return htmlDoc(`${summary}${tabs}`);
}

function htmlDoc(inner) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SDLC Hub</title>
  <style>${STYLE}</style>
</head>
<body>
  <main class="wrap">
    ${inner}
  </main>
  <script src="/__sdlc/hub-reload.js" defer></script>
</body>
</html>
`;
}

function repoGroup(repoRoot, groupEntries, now) {
  const label = basenameOf(repoRoot);
  const cards = groupEntries
    .slice()
    .sort((a, b) => String(a.branch).localeCompare(String(b.branch)))
    .map((e) => entryCard(e, now))
    .join('\n');
  return `<section class="repo">
    <h2 class="repo-name">${escapeHtml(label)} <span class="repo-path">${escapeHtml(repoRoot)}</span></h2>
    ${cards}
  </section>`;
}

function entryCard(entry, now) {
  const { active, shipped } = laneInputs(entry);
  const stale = !entry.lastRenderedAt || (now - Date.parse(entry.lastRenderedAt)) > STALE_MS;
  const branchLabel = entry.worktreeLabel
    ? `${escapeHtml(entry.branch)} <span class="wt">⌥ ${escapeHtml(entry.worktreeLabel)}</span>`
    : escapeHtml(entry.branch);
  const idEnc = encodeURIComponent(entry.id);
  const figure = (active.length || shipped.length)
    ? `<div class="fig">${swimlanesSvg(active, shipped)}</div>`
    : '<p class="no-wf">No workflows in this checkout.</p>';

  const slugLinks = (entry.slugMeta ?? []).map((sm) => {
    const s = low(sm.status);
    const tone = sm.blocked ? 'bad' : (TERMINAL_COMPLETE.has(s) ? 'ok' : (TERMINAL_CLOSED.has(s) ? 'idle' : 'cur'));
    return `<li><a href="/r/${idEnc}/${encodeURIComponent(sm.slug)}/">
        <code>${escapeHtml(sm.slug)}</code>
        <span class="stage ${tone}">${escapeHtml(sm.currentStage ?? sm.status ?? '')}</span>
      </a></li>`;
  }).join('');

  return `<article class="entry${stale ? ' stale' : ''}">
    <div class="entry-head">
      <a class="branch" href="/r/${idEnc}/">${branchLabel}</a>
      <span class="ago">${escapeHtml(humanRelative(entry.lastRenderedAt, now))}</span>
    </div>
    ${figure}
    ${slugLinks ? `<ul class="slugs">${slugLinks}</ul>` : ''}
  </article>`;
}

// Minimal editorial styling, inline (no hub /_assets/ route). Warm paper bg +
// ink, mirroring the per-repo view palette loosely.
const STYLE = `
  :root { --paper:#fbfaf6; --ink:#1f1b16; --ink-3:#8a8377; --hair:#e0dbcd; --bad:#b5305f; --ok:#3e7d4a; --cur:#4a6c8c; --idle:#8a8377; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  .wrap { max-width:1100px; margin:0 auto; padding:32px 24px 80px; }
  .hub-head h1 { font:600 30px/1.1 ui-serif,Georgia,serif; margin:0 0 8px; }
  .summary { display:flex; gap:18px; flex-wrap:wrap; color:var(--ink-3); font-size:13px; align-items:baseline; }
  .summary b { color:var(--ink); font-size:15px; }
  .summary .stat.alert b { color:var(--bad); }
  .summary .ver { margin-left:auto; font-family:ui-monospace,monospace; }
  .empty { color:var(--ink-3); margin-top:40px; }
  /* CSS-only tabs (no JS — CSP-safe). Radios are visually hidden but focusable. */
  .tabin { position:absolute; left:-9999px; width:1px; height:1px; }
  .tabs { display:flex; gap:2px; border-bottom:1px solid var(--hair); margin:20px 0 0; }
  .tabs label { padding:8px 14px; cursor:pointer; font-size:14px; color:var(--ink-3); border-bottom:2px solid transparent; margin-bottom:-1px; }
  .tabs label:hover { color:var(--ink); }
  .tabs .tcount { font:11px/1 ui-monospace,monospace; color:var(--ink-3); border:1px solid var(--hair); border-radius:999px; padding:2px 6px; margin-left:4px; }
  .panel { display:none; padding-top:18px; }
  #tab-inbox:checked ~ .panel-inbox { display:block; }
  #tab-repos:checked ~ .panel-repos { display:block; }
  #tab-inbox:checked ~ .tabs label[for="tab-inbox"],
  #tab-repos:checked ~ .tabs label[for="tab-repos"] { color:var(--ink); font-weight:600; border-bottom-color:var(--ink); }
  .tabin:focus-visible ~ .tabs { outline:2px solid var(--cur); outline-offset:2px; border-radius:3px; }
  /* Inbox */
  .inbox-zero { color:var(--ink-3); margin:8px 0; }
  .inbox { display:flex; flex-direction:column; gap:6px; }
  .inbox-item { display:flex; align-items:baseline; gap:8px; text-decoration:none; color:var(--ink); border:1px solid var(--hair); border-left:3px solid var(--hair); border-radius:4px; padding:9px 12px; background:#fff; }
  .inbox-item:hover { border-color:var(--ink-3); }
  .ix-repo { font-weight:600; font-size:13px; }
  .ix-sep { color:var(--ink-3); }
  .ix-slug { font:13px/1 ui-monospace,monospace; }
  .ix-stage { font-size:12px; color:var(--ink-3); }
  .ix-reasons { margin-left:auto; display:flex; gap:6px; flex-wrap:wrap; }
  .reason { font-size:11px; border-radius:999px; padding:2px 8px; border:1px solid var(--hair); white-space:nowrap; }
  .reason.bad { color:var(--bad); border-color:var(--bad); }
  .reason.cur { color:var(--cur); border-color:var(--cur); }
  .reason.idle { color:var(--idle); }
  .repo { margin-top:34px; }
  .repo-name { font:600 18px/1.2 ui-sans-serif,system-ui,sans-serif; margin:0 0 12px; padding-bottom:6px; border-bottom:1px solid var(--hair); }
  .repo-path { font:400 11px/1 ui-monospace,monospace; color:var(--ink-3); margin-left:8px; }
  .entry { border:1px solid var(--hair); border-radius:4px; padding:14px 16px; margin:0 0 14px; background:#fff; }
  .entry.stale { opacity:.55; }
  .entry-head { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px; }
  .branch { font:600 14px/1 ui-monospace,monospace; color:var(--ink); text-decoration:none; }
  .branch:hover { text-decoration:underline; }
  .branch .wt { color:var(--ink-3); font-weight:400; }
  .ago { font-size:12px; color:var(--ink-3); }
  .fig { margin:6px 0 10px; }
  .no-wf { color:var(--ink-3); font-size:13px; margin:4px 0; }
  ul.slugs { list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:8px; }
  ul.slugs a { display:inline-flex; gap:6px; align-items:center; text-decoration:none; border:1px solid var(--hair); border-radius:999px; padding:3px 10px; color:var(--ink); }
  ul.slugs a:hover { border-color:var(--ink-3); }
  ul.slugs code { font:12px/1 ui-monospace,monospace; }
  .stage { font-size:11px; }
  .stage.bad { color:var(--bad); } .stage.ok { color:var(--ok); } .stage.cur { color:var(--cur); } .stage.idle { color:var(--idle); }
`;
