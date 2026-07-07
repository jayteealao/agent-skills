import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  swimlanesSvg
} from "./chunk-FEK32D62.mjs";
import {
  escapeHtml
} from "./chunk-4WRIEOIP.mjs";

// renderers/hub-dashboard.mjs
var TERMINAL_COMPLETE = /* @__PURE__ */ new Set(["complete", "completed", "shipped", "done"]);
var TERMINAL_CLOSED = /* @__PURE__ */ new Set(["closed", "abandoned", "cancelled"]);
var STALE_MS = 7 * 24 * 60 * 60 * 1e3;
function low(s) {
  return String(s ?? "").trim().toLowerCase();
}
function headBranchOf(entry) {
  return entry?.headBranch ?? entry?.branch ?? "";
}
function isActiveSlug(sm) {
  const s = low(sm.status);
  return !TERMINAL_COMPLETE.has(s) && !TERMINAL_CLOSED.has(s);
}
function slugRow(sm) {
  return {
    slug: sm.slug,
    fm: { "current-stage": sm.currentStage, status: sm.status, blocked: sm.blocked }
  };
}
function laneKeyFor(sm, entry) {
  const declared = String(sm.branch ?? "").trim();
  if (low(sm.branchStrategy) === "none" || !declared) {
    return String(sm.baseBranch ?? "").trim() || headBranchOf(entry) || "trunk";
  }
  return declared;
}
function humanRelative(iso, now) {
  if (!iso) return "never rendered";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return String(iso);
  const diff = now - then;
  if (diff < 0) return String(iso);
  const min = Math.round(diff / 6e4);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  const mo = Math.round(d / 30);
  return `${mo} mo ago`;
}
function basenameOf(p) {
  const parts = String(p ?? "").replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || String(p ?? "");
}
function inboxItems(entries = [], now = Date.now()) {
  const items = [];
  for (const e of entries) {
    const stale = !e.lastRenderedAt || now - Date.parse(e.lastRenderedAt) > STALE_MS;
    for (const sm of e.slugMeta ?? []) {
      if (!isActiveSlug(sm)) continue;
      const reasons = [];
      if (sm.blocked) reasons.push({ key: "blocked", label: "blocked", tone: "bad" });
      if (low(sm.currentStage) === "review" || low(sm.status) === "review") {
        reasons.push({ key: "review", label: "in review", tone: "cur" });
      }
      if (stale) reasons.push({ key: "stale", label: `idle ${humanRelative(e.lastRenderedAt, now)}`, tone: "idle" });
      const bs = low(sm.branchState);
      if (bs === "merged") reasons.push({ key: "merged", label: "merged", tone: "ok" });
      else if (bs === "gone") reasons.push({ key: "gone", label: "branch gone", tone: "idle" });
      if (!reasons.length) continue;
      const priority = reasons.some((r) => r.key === "blocked") ? 0 : reasons.some((r) => r.key === "review") ? 1 : reasons.some((r) => r.key === "merged" || r.key === "gone") ? 2 : 3;
      items.push({ entry: e, sm, reasons, priority });
    }
  }
  items.sort((a, b) => a.priority - b.priority || String(a.entry.lastRenderedAt ?? "").localeCompare(String(b.entry.lastRenderedAt ?? "")) || basenameOf(a.entry.repoRoot).localeCompare(basenameOf(b.entry.repoRoot)));
  return items;
}
function renderInbox(items, totalRepos) {
  if (!items.length) {
    return `<p class="inbox-zero">\u2713 Nothing needs attention across ${totalRepos} repo${totalRepos === 1 ? "" : "s"}.</p>`;
  }
  const rows = items.map((it) => {
    const idEnc = encodeURIComponent(it.entry.id);
    const slugEnc = encodeURIComponent(it.sm.slug);
    const badges = it.reasons.map((r) => `<span class="reason ${r.tone}">${escapeHtml(r.label)}</span>`).join("");
    const branchTag = it.sm.branch ? `<span class="ix-branch">\u2387 ${escapeHtml(it.sm.branch)}</span>` : "";
    return `<a class="inbox-item" href="/r/${idEnc}/${slugEnc}/">
      <span class="ix-repo">${escapeHtml(basenameOf(it.entry.repoRoot))}</span>
      <span class="ix-sep" aria-hidden="true">/</span>
      <code class="ix-slug">${escapeHtml(it.sm.slug)}</code>
      ${branchTag}
      <span class="ix-stage">${escapeHtml(it.sm.currentStage ?? it.sm.status ?? "")}</span>
      <span class="ix-reasons">${badges}</span>
    </a>`;
  }).join("");
  return `<div class="inbox">${rows}</div>`;
}
function renderHubLanding(entries = [], { pluginVersion = "", uptimeMs = 0, now = Date.now(), codeBrowserEnabled = true } = {}) {
  const totalRepos = entries.length;
  const totalActiveSlugs = entries.reduce((n, e) => n + (e.slugMeta ?? []).filter(isActiveSlug).length, 0);
  const uptimeMin = Math.max(0, Math.round(uptimeMs / 6e4));
  const inbox = inboxItems(entries, now);
  const groups = /* @__PURE__ */ new Map();
  for (const e of entries) {
    if (!groups.has(e.repoRoot)) groups.set(e.repoRoot, []);
    groups.get(e.repoRoot).push(e);
  }
  const sortedRepoRoots = [...groups.keys()].sort((a, b) => basenameOf(a).localeCompare(basenameOf(b)));
  const summary = `
    <header class="hub-head">
      <div class="hub-head-row">
        <h1>SDLC Hub</h1>
        <a class="docs-link" href="/docs/">Plugin docs &rarr;</a>
      </div>
      <div class="summary">
        <span class="stat${inbox.length ? " alert" : ""}"><b>${inbox.length}</b> needing attention</span>
        <span class="stat"><b>${totalRepos}</b> repo${totalRepos === 1 ? "" : "s"}</span>
        <span class="stat"><b>${totalActiveSlugs}</b> active workflow${totalActiveSlugs === 1 ? "" : "s"}</span>
        <span class="stat">up ${uptimeMin} min</span>
        ${pluginVersion ? `<span class="stat ver">v${escapeHtml(pluginVersion)}</span>` : ""}
      </div>
    </header>`;
  if (totalRepos === 0) {
    return htmlDoc(`${summary}
    <p class="empty">No repos have rendered yet. Render any sdlc workflow with <code>view.hub.enabled: true</code> and it will appear here.</p>`);
  }
  const repoGroups = sortedRepoRoots.map((repoRoot) => repoCard(repoRoot, groups.get(repoRoot), now, codeBrowserEnabled)).join("\n");
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
function repoCard(repoRoot, groupEntries, now, codeBrowserEnabled = true) {
  const label = basenameOf(repoRoot);
  const entry = groupEntries.slice().sort(
    (a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))
  )[0];
  const stale = !entry.lastRenderedAt || now - Date.parse(entry.lastRenderedAt) > STALE_MS;
  const headBranch = headBranchOf(entry);
  const idEnc = encodeURIComponent(entry.id);
  const meta = entry.slugMeta ?? [];
  const lanes = /* @__PURE__ */ new Map();
  for (const sm of meta) {
    const key = laneKeyFor(sm, entry);
    if (!lanes.has(key)) lanes.set(key, { slugs: [], strategies: /* @__PURE__ */ new Set() });
    const lane = lanes.get(key);
    lane.slugs.push(sm);
    if (sm.branchStrategy) lane.strategies.add(low(sm.branchStrategy));
  }
  const laneHtml = meta.length ? [...lanes.entries()].map(([key, lane]) => branchLane(key, lane, idEnc)).join("\n") : '<p class="no-wf">No workflows in this checkout.</p>';
  const headHtml = headBranch ? `<span class="head-branch">on <code>${escapeHtml(headBranch)}</code>${entry.worktreeLabel ? ` <span class="wt">\u2325 ${escapeHtml(entry.worktreeLabel)}</span>` : ""}</span>` : "";
  return `<section class="repo">
    <h2 class="repo-name">${escapeHtml(label)} <span class="repo-path">${escapeHtml(repoRoot)}</span> ${headHtml}</h2>
    <article class="entry${stale ? " stale" : ""}">
      <div class="entry-head">
        <span class="entry-links"><a class="open-view" href="/r/${idEnc}/">open view \u2192</a>${codeBrowserEnabled ? ` <a class="open-code" href="/r/${idEnc}/__code/">code \u2192</a>` : ""}</span>
        <span class="ago">${escapeHtml(humanRelative(entry.lastRenderedAt, now))}</span>
      </div>
      ${laneHtml}
    </article>
  </section>`;
}
function branchLane(laneKey, lane, idEnc) {
  const active = lane.slugs.filter(isActiveSlug).map(slugRow);
  const shipped = lane.slugs.filter((sm) => TERMINAL_COMPLETE.has(low(sm.status))).map(slugRow);
  const figure = active.length || shipped.length ? `<div class="fig">${swimlanesSvg(active, shipped)}</div>` : "";
  const slugLinks = lane.slugs.map((sm) => slugLinkHtml(sm, idEnc)).join("");
  const hint = lane.strategies.has("shared") ? '<span class="lane-strat shared">shared</span>' : lane.strategies.has("none") || lane.strategies.size === 0 ? '<span class="lane-strat base">base</span>' : "";
  const n = lane.slugs.length;
  return `<div class="lane">
    <div class="lane-head">
      <span class="lane-branch">\u2387 ${escapeHtml(laneKey)}</span>
      <span class="lane-count">${n} slug${n === 1 ? "" : "s"}</span>
      ${hint}
    </div>
    ${figure}
    ${slugLinks ? `<ul class="slugs">${slugLinks}</ul>` : ""}
  </div>`;
}
function slugLinkHtml(sm, idEnc) {
  const s = low(sm.status);
  const tone = sm.blocked ? "bad" : TERMINAL_COMPLETE.has(s) ? "ok" : TERMINAL_CLOSED.has(s) ? "idle" : "cur";
  return `<li><a href="/r/${idEnc}/${encodeURIComponent(sm.slug)}/">
      <code>${escapeHtml(sm.slug)}</code>
      <span class="stage ${tone}">${escapeHtml(sm.currentStage ?? sm.status ?? "")}</span>${livenessBadge(sm)}
    </a></li>`;
}
function livenessBadge(sm) {
  const st = low(sm.branchState);
  if (st === "merged") return '<span class="lq merged">merged</span>';
  if (st === "gone") return '<span class="lq gone">branch gone</span>';
  return "";
}
var STYLE = `
  :root { --paper:#fbfaf6; --ink:#1f1b16; --ink-3:#8a8377; --hair:#e0dbcd; --bad:#b5305f; --ok:#3e7d4a; --cur:#4a6c8c; --idle:#8a8377; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
  .wrap { max-width:1100px; margin:0 auto; padding:32px 24px 80px; }
  .hub-head h1 { font:600 30px/1.1 ui-serif,Georgia,serif; margin:0 0 8px; }
  .hub-head-row { display:flex; align-items:baseline; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .docs-link { font:600 13px/1 ui-sans-serif,system-ui,sans-serif; color:var(--cur); text-decoration:none; border:1px solid var(--hair); border-radius:999px; padding:7px 14px; white-space:nowrap; }
  .docs-link:hover { border-color:var(--cur); }
  .summary { display:flex; gap:18px; flex-wrap:wrap; color:var(--ink-3); font-size:13px; align-items:baseline; }
  .summary b { color:var(--ink); font-size:15px; }
  .summary .stat.alert b { color:var(--bad); }
  .summary .ver { margin-left:auto; font-family:ui-monospace,monospace; }
  .empty { color:var(--ink-3); margin-top:40px; }
  /* CSS-only tabs (no JS \u2014 CSP-safe). Radios are visually hidden but focusable. */
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
  .reason.ok { color:var(--ok); border-color:var(--ok); }
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
  /* D3: repo header HEAD-branch context + per-branch sub-lanes */
  .head-branch { font:400 11px/1 ui-sans-serif,system-ui,sans-serif; color:var(--ink-3); margin-left:6px; }
  .head-branch code { font:11px/1 ui-monospace,monospace; color:var(--ink-3); }
  .head-branch .wt { color:var(--ink-3); }
  .open-view { font:600 12px/1 ui-monospace,monospace; color:var(--cur); text-decoration:none; }
  .open-view:hover { text-decoration:underline; }
  .entry-links { display:inline-flex; gap:14px; }
  .open-code { font:600 12px/1 ui-monospace,monospace; color:var(--ink-3); text-decoration:none; }
  .open-code:hover { color:var(--cur); text-decoration:underline; }
  .lane { border-top:1px solid var(--hair); padding:10px 0 4px; }
  .lane:first-of-type { border-top:0; }
  .lane-head { display:flex; align-items:baseline; gap:8px; margin:0 0 4px; }
  .lane-branch { font:600 12px/1 ui-monospace,monospace; color:var(--ink); }
  .lane-count { font-size:11px; color:var(--ink-3); }
  .lane-strat { font-size:10px; border-radius:999px; padding:1px 7px; border:1px solid var(--hair); color:var(--ink-3); text-transform:uppercase; letter-spacing:.5px; }
  .lane-strat.shared { color:var(--cur); border-color:var(--cur); }
  .ix-branch { font:11px/1 ui-monospace,monospace; color:var(--ink-3); }
  /* D2: soft branch-liveness badge on a slug link (never implies deletion) */
  .lq { font-size:10px; border-radius:999px; padding:1px 7px; margin-left:6px; border:1px solid var(--hair); white-space:nowrap; }
  .lq.merged { color:var(--ok); border-color:var(--ok); }
  .lq.gone { color:var(--idle); border-color:var(--idle); }
  /* Narrow screens \u2014 the hub is the landing page on phones too; keep the
     inbox rows readable (stack reasons under the slug) and reclaim padding. */
  @media (max-width: 720px) {
    .wrap { padding:20px 14px 64px; }
    .hub-head h1 { font-size:24px; }
    .inbox-item { flex-wrap:wrap; row-gap:4px; }
    .ix-reasons { margin-left:0; width:100%; }
    .entry { padding:12px; }
    .entry-head { flex-wrap:wrap; gap:6px; }
    .tabs label { padding:10px 14px; }
  }
`;

export {
  inboxItems,
  renderHubLanding
};
