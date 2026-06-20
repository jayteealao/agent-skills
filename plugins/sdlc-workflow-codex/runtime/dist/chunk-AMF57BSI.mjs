import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  escapeHtml
} from "./chunk-4WRIEOIP.mjs";

// renderers/_paths.mjs
import { posix as path } from "node:path";
var SLICE_RE = /^slices\/([^/]+)\/(\d+[a-z]?)-([a-z-]+)\.md$/;
var REVIEW_RE = /^07-review\/([^/]+)\.md$/;
var SHIPRUN_RE = /^ship\/([^/]+)\/(\d+[a-z]?)-([a-z-]+)\.md$/;
var AUG_RE = /^augmentations\/([^/]+)\.md$/;
var AMEND_RE = /^amendments\/(\d+)-(shape|slice)(?:[^/]*)\.md$/;
var HISTORY_RE = /^(?:(.+)\/)?history\/([^/]+)-(\d+)\.md$/;
var FLAT_PHASE_SLICE_RE = /^\d+[a-z]?-(slice|plan|implement|verify)-(.+)\.md$/;
var FLAT_REVIEW_RE = /^07-review-(.+)\.md$/;
var PHASE_BY_BASENAME = {
  "00-index": ["", null],
  // slug overview at root
  "01-intake": ["intake", null],
  // Compressed-lifecycle change-mode leads (/wf intake fix|hotfix|refactor|
  // update-deps) name their lead artifact `01-<mode>.md` but carry `type: intake`
  // and drive a full `type: index` overview. That overview's intake card /
  // jump-rail / stripe all link to the FIXED STAGE_NAV.intake.dir = 'intake', so
  // every change-mode lead MUST land at intake/ or the intake card 404s. (Renderer
  // dispatch is by frontmatter `type` → intake.mjs; view-path placement is by
  // filename → here. Separate axes — see the file header.)
  "01-fix": ["intake", null],
  "01-hotfix": ["intake", null],
  "01-refactor": ["intake", null],
  "01-update-deps": ["intake", null],
  // Forwarded / investigative workflows (/wf intake rca|investigate, /wf probe)
  // keep their own named lead dirs. Without these entries resolveViewPath returns
  // null and the orchestrator skips them entirely — the RCA/probe writeup is then
  // never rendered and the slug overview has nothing to link to.
  "01-rca": ["rca", null],
  "01-probe": ["probe", null],
  "01-investigate": ["investigate", null],
  // Terminal analysis modes (/wf intake ideate, /wf simplify, /wf probe) now root
  // in a `type: workflow-index` slug workflow with an `01-<mode>.md` lead instead
  // of writing off-pipeline (.ai/ideation/, .ai/simplify/). The lead keeps its
  // analysis type (ideation / simplify-run) but lands in its own named view dir.
  // (Legacy off-pipeline runs still render via the retained simplify/ideation
  // discovery + kind branches above — see D5.)
  "01-ideate": ["ideate", null],
  "01-simplify": ["simplify", null],
  "02-shape": ["shape", null],
  "02b-design": ["design", null],
  "02c-craft": ["design-brief", null],
  "03-slice-index": ["slice", null],
  "04-plan-index": ["plan", null],
  "05-implement-index": ["implement", null],
  "06-verify-index": ["verify", null],
  // Bare stage-index basenames used by the flat layout (no `-index` suffix).
  "03-slice": ["slice", null],
  "04-plan": ["plan", null],
  "05-implement": ["implement", null],
  "06-verify": ["verify", null],
  "07-review": ["review", null],
  "07-design-critique": ["design-critique", null],
  // /wf design critique
  "07-design-audit": ["design-audit", null],
  // /wf design audit
  "00-sync": ["sync", null],
  // /wf sync health report
  "08-handoff": ["handoff", null],
  "09-ship-runs-index": ["ship", null],
  "10-retro": ["retro", null],
  "RESUME": ["resume", null],
  "announce": ["announce", null],
  "risk-register": ["risk-register", null],
  "estimate": ["estimate", null],
  "08b-docs-index": ["docs-index", null],
  // wf-quick discover standalone lane (sibling of 01-fix / 01-investigate).
  "01-discover": ["discover", null],
  // Hotfix mini-pipeline (/wf-quick hotfix) — grouped under a hotfix/ subtree.
  "hf-brief": ["hotfix/brief", null],
  "hf-plan": ["hotfix/plan", null],
  "hf-implement": ["hotfix/implement", null],
  "hf-verify": ["hotfix/verify", null],
  // Refactor mini-pipeline (/wf-quick refactor) — grouped under refactor/.
  "rf-brief": ["refactor/brief", null],
  "rf-baseline": ["refactor/baseline", null],
  "rf-plan": ["refactor/plan", null],
  "rf-implement": ["refactor/implement", null],
  "rf-verify": ["refactor/verify", null],
  // wf-meta close record.
  "99-close": ["close", null]
};
function resolveViewPath(storageRel, opts = {}) {
  const rel = storageRel.replace(/\\/g, "/").replace(/^\.\//, "");
  const kindHint = opts.kind ?? "workflow";
  if (kindHint === "simplify") {
    const stem = rel.replace(/\.md$/, "");
    return {
      viewRel: path.join("simplify", stem, "INDEX.html"),
      kind: "simplify"
    };
  }
  if (kindHint === "profile") {
    const stem = rel.replace(/\.md$/, "");
    return {
      viewRel: path.join("profiles", stem, "INDEX.html"),
      kind: "profile"
    };
  }
  if (kindHint === "deps") {
    const stem = rel.replace(/\.md$/, "");
    return {
      viewRel: path.join("dep-updates", stem, "INDEX.html"),
      kind: "deps"
    };
  }
  if (kindHint === "ideation") {
    const stem = rel.replace(/\.md$/, "");
    return {
      viewRel: path.join("ideation", stem, "INDEX.html"),
      kind: "ideation"
    };
  }
  if (kindHint === "docs") {
    const stem = rel.replace(/\.md$/, "");
    const runId = path.dirname(stem);
    const page = path.basename(stem).replace(/^08b-/, "");
    return {
      viewRel: path.join("docs", runId === "." ? "run" : runId, page, "INDEX.html"),
      kind: "docs-index"
    };
  }
  if (kindHint === "project") {
    const stem = rel.replace(/^\.ai\//, "").replace(/\.md$/, "");
    const file = stem.split("/").pop();
    return {
      viewRel: path.join("project", `${file}.html`),
      kind: file === "ship-plan" ? "ship-plan" : "project-context"
    };
  }
  let m = rel.match(HISTORY_RE);
  if (m) {
    const [, parent, basename2, rev] = m;
    const parentResolved = parent ? resolveViewPath(`${parent}/${basename2}.md`) : resolveViewPath(`${basename2}.md`);
    if (!parentResolved) return null;
    return {
      viewRel: path.join(path.dirname(parentResolved.viewRel), "history", rev, "INDEX.html"),
      kind: "history-snapshot"
    };
  }
  m = rel.match(SLICE_RE);
  if (m) {
    const [, sliceSlug, , kindToken] = m;
    const phaseFromStep = {
      "plan": "plan",
      "implement": "implement",
      "verify": "verify"
    };
    const phase = phaseFromStep[kindToken];
    if (phase) {
      return {
        viewRel: path.join(phase, sliceSlug, "INDEX.html"),
        kind: `slice-${phase}`
      };
    }
    return {
      viewRel: path.join("slice", sliceSlug, kindToken, "INDEX.html"),
      kind: `slice-${kindToken}`
    };
  }
  m = rel.match(/^03-slices\/([^/]+)\.md$/);
  if (m) {
    const [, sliceSlug] = m;
    return {
      viewRel: path.join("slice", sliceSlug, "INDEX.html"),
      kind: "slice-detail"
    };
  }
  m = rel.match(REVIEW_RE);
  if (m) {
    const [, command] = m;
    return {
      viewRel: path.join("review", command, "INDEX.html"),
      kind: "review-command"
    };
  }
  m = rel.match(SHIPRUN_RE);
  if (m) {
    const [, runId] = m;
    return {
      viewRel: path.join("ship", runId, "INDEX.html"),
      kind: "ship-run"
    };
  }
  m = rel.match(AUG_RE);
  if (m) {
    const [, id] = m;
    return {
      viewRel: path.join("augmentations", id, "INDEX.html"),
      kind: "augmentation"
    };
  }
  m = rel.match(AMEND_RE);
  if (m) {
    const [, n, kind] = m;
    return {
      viewRel: path.join("amendments", `${n}-${kind}`, "INDEX.html"),
      kind: `${kind}-amendment`
    };
  }
  const basename = rel.replace(/\.md$/, "");
  if (Object.prototype.hasOwnProperty.call(PHASE_BY_BASENAME, basename)) {
    const [phaseDir] = PHASE_BY_BASENAME[basename];
    const viewRel = phaseDir === "" ? "INDEX.html" : path.join(phaseDir, "INDEX.html");
    return { viewRel, kind: basename };
  }
  m = rel.match(FLAT_PHASE_SLICE_RE);
  if (m) {
    const [, stage, sliceSlug] = m;
    return {
      viewRel: path.join(stage, sliceSlug, "INDEX.html"),
      kind: stage === "slice" ? "slice-detail" : `slice-${stage}`
    };
  }
  m = rel.match(FLAT_REVIEW_RE);
  if (m) {
    const [, command] = m;
    return {
      viewRel: path.join("review", command, "INDEX.html"),
      kind: "review-command"
    };
  }
  m = rel.match(/^skips\/([^/]+)\.md$/);
  if (m) {
    const [, stage] = m;
    return { viewRel: path.join("skips", stage, "INDEX.html"), kind: "skip-record" };
  }
  return null;
}
function siblingPaths(storageRel) {
  const rel = storageRel.replace(/\\/g, "/");
  const stem = rel.replace(/\.md$/, "");
  return {
    yaml: `${stem}.yaml`,
    fragment: `${stem}.html.fragment`
  };
}
var FRAGMENT_SUFFIX = ".html.fragment";
function classifyFragmentName(name, stem) {
  if (!name.endsWith(FRAGMENT_SUFFIX)) return null;
  if (name === `${stem}${FRAGMENT_SUFFIX}`) return { tier: "typed", label: null };
  const prefix = `${stem}.`;
  if (!name.startsWith(prefix)) return null;
  const label = name.slice(prefix.length, name.length - FRAGMENT_SUFFIX.length);
  if (!label) return null;
  return { tier: "free", label };
}
function pageHref(dirHref) {
  const s = String(dirHref ?? "");
  if (s.endsWith(".html")) return s;
  if (s === "" || s === "./") return "INDEX.html";
  return s.endsWith("/") ? `${s}INDEX.html` : `${s}/INDEX.html`;
}
function breadcrumbFromView(viewRel, slug) {
  const parts = viewRel.split("/").filter(Boolean);
  if (parts[parts.length - 1] === "INDEX.html") parts.pop();
  const crumbs = [
    { label: "sdlc", href: pageHref("../".repeat(parts.length + 1)) },
    { label: slug, href: pageHref("../".repeat(parts.length)) }
  ];
  for (let i = 0; i < parts.length; i++) {
    const remaining = parts.length - i - 1;
    crumbs.push({
      label: parts[i],
      href: pageHref("../".repeat(remaining))
    });
  }
  return crumbs;
}

// renderers/_shell.mjs
var PLUGIN_VERSION = "9.88.0";
function renderShell(params) {
  const {
    title,
    type,
    slug,
    status,
    breadcrumbs = [],
    assetBase = "_assets",
    headerHtml = "",
    bodyHtml = "",
    warnBanner = "",
    storageHref = "",
    updatedAt = "",
    upHref = "../",
    liveReload = false
  } = params;
  const crumbHtml = breadcrumbs.map((c, i) => {
    const last = i === breadcrumbs.length - 1;
    const text = escapeHtml(c.label);
    return last ? `<b aria-current="page">${text}</b>` : `<a href="${escapeHtml(c.href)}">${text}</a>`;
  }).join('<span class="crumb-sep" aria-hidden="true">/</span>');
  const TAB_ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>'
  };
  const homeHref = breadcrumbs[0]?.href ?? pageHref(`${assetBase}/..`);
  const mCrumbTrail = breadcrumbs.length ? breadcrumbs.map((c, i) => i === breadcrumbs.length - 1 ? `<span class="m-here">${escapeHtml(c.label)}</span>` : `<a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>`).join('<span aria-hidden="true">/</span>') : '<span class="m-here">.ai/workflows</span>';
  const mBackHref = breadcrumbs.length >= 2 ? breadcrumbs[breadcrumbs.length - 2].href : upHref;
  const mAppbar = `<header class="m-appbar">
    <div class="m-crumb"><a class="m-back" href="${escapeHtml(mBackHref)}" aria-label="Back">&larr;</a><span class="m-trail">${mCrumbTrail}</span></div>
    <h1 class="m-title">${escapeHtml(title)}</h1>
  </header>`;
  const mTabs = [{ href: homeHref, label: "Home", icon: TAB_ICONS.home, active: breadcrumbs.length <= 1 }];
  if (breadcrumbs.length >= 2) mTabs.push({ href: breadcrumbs[1].href, label: "Overview", icon: TAB_ICONS.grid, active: breadcrumbs.length >= 2 });
  const mTabbar = `<nav class="m-tabbar" aria-label="Sections">${mTabs.map((t) => `<a class="m-tab${t.active ? " is-active" : ""}" href="${escapeHtml(t.href)}">${t.icon}<span>${escapeHtml(t.label)}</span></a>`).join("")}<label class="m-tab m-tab-menu" for="m-menu">${TAB_ICONS.menu}<span>Menu</span></label></nav>`;
  const mPlaces = [
    `<a class="brand" href="${escapeHtml(pageHref(`${assetBase}/..`))}">.ai/workflows</a>`,
    ...breadcrumbs.slice(1).map((c, i, arr) => i === arr.length - 1 ? `<span class="m-sheet-here" aria-current="page">${escapeHtml(c.label)}</span>` : `<a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>`)
  ].join("");
  const mMenu = `<input type="checkbox" id="m-menu" class="m-menu-toggle" aria-label="Navigation menu">
  <label class="m-backdrop" for="m-menu" aria-hidden="true"></label>
  <aside class="m-sheet" aria-label="Navigation">
    <div class="m-sheet-grip" aria-hidden="true"></div>
    <h2 class="m-sheet-head">Places</h2>
    <nav class="m-sheet-places" aria-label="Places">${mPlaces}</nav>
    <h2 class="m-sheet-head">Links</h2>
    <div class="actions m-sheet-links"><a href="${escapeHtml(pageHref(upHref))}">&uarr; up</a>${storageHref ? `<a href="${escapeHtml(storageHref)}" class="src-link" title="storage source">md &#8599;</a>` : ""}</div>
    ${updatedAt ? `<div class="m-sheet-meta">updated ${escapeHtml(updatedAt)}</div>` : ""}
  </aside>`;
  const versionTag = `?v=${PLUGIN_VERSION}`;
  const liveReloadScript = liveReload ? `
  <script src="${escapeHtml(assetBase)}/livereload.js" defer></script>` : "";
  return `<!DOCTYPE html>
<html lang="en" data-sdlc-version="${PLUGIN_VERSION}" data-artifact-type="${escapeHtml(type)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(title)} \u2014 sdlc</title>
  <link rel="stylesheet" href="${escapeHtml(assetBase)}/sdlc.css${versionTag}">
  <script src="${escapeHtml(assetBase)}/sdlc.js${versionTag}" defer></script>
  <link rel="icon" href="${escapeHtml(assetBase)}/favicon.svg" type="image/svg+xml">
</head>
<body class="artifact" data-artifact-type="${escapeHtml(type)}">
  ${mAppbar}
  <div class="b-topbar">
    <a class="brand" href="${escapeHtml(pageHref(`${assetBase}/..`))}">.ai/workflows</a>
    <div class="crumb">${crumbHtml}</div>
    <div class="actions">${storageHref ? `<a href="${escapeHtml(storageHref)}" class="src-link" title="storage source">md &#8599;</a>` : ""}</div>
  </div>

  <main class="content">
    ${warnBanner}
    ${headerHtml}
    <nav class="frag-nav" aria-label="Fragments on this page"><span class="frag-nav-label">On this page</span><ul class="frag-nav-list"></ul></nav>
    ${bodyHtml}
  </main>

  <footer class="bottom">
    <a href="${escapeHtml(pageHref(upHref))}">\u2191 up</a>
    <span class="updated">${updatedAt ? "updated " + escapeHtml(updatedAt) : ""}</span>
    ${storageHref ? `<a href="${escapeHtml(storageHref)}" class="src-link" title="storage source">md \u2197</a>` : ""}
  </footer>
  ${mMenu}
  ${mTabbar}
  ${liveReloadScript}
</body>
</html>
`;
}
function artifactHeader({ h1, lede = "", crumb = "", badges = [] }) {
  const badgeHtml = badges.filter(Boolean).map((b) => typeof b === "string" ? b : "").join("");
  return `
    <header class="artifact-header">
      ${crumb ? `<div class="sdlc-crumb">${escapeHtml(crumb)}</div>` : ""}
      <h1 class="pg-title">${h1}</h1>
      ${lede ? `<p class="sdlc-lede">${lede}</p>` : ""}
      ${badgeHtml ? `<div class="meta-row">${badgeHtml}</div>` : ""}
    </header>`;
}
function statusBadge(value) {
  if (!value) return "";
  const tone = {
    active: "ok",
    complete: "ok",
    closed: "skip",
    blocked: "bad",
    skipped: "skip",
    shipped: "ok",
    pending: "warn",
    running: "warn"
  }[value] ?? "ok";
  return `<span class="status-badge is-${tone}">${escapeHtml(value)}</span>`;
}
function stageBadge(stage) {
  if (!stage && stage !== 0) return "";
  return `<span class="stage-badge">${escapeHtml(String(stage))}</span>`;
}
function metricRow(metrics) {
  if (!metrics?.length) return "";
  const cells = metrics.map((m) => {
    const tone = m.tone ? ` is-${m.tone}` : "";
    const sev = m.sev ? ` severity-${m.sev}` : "";
    const ann = m.ann ? `<span class="metric-ann">${escapeHtml(m.ann)}</span>` : "";
    return `<div class="metric${tone}${sev}">
      <span class="metric-label">${escapeHtml(m.label ?? "")}</span>
      <span class="metric-value">${escapeHtml(String(m.value ?? ""))}</span>
      ${ann}
    </div>`;
  }).join("");
  return `<div class="metric-row">${cells}</div>`;
}

export {
  resolveViewPath,
  siblingPaths,
  classifyFragmentName,
  pageHref,
  breadcrumbFromView,
  PLUGIN_VERSION,
  renderShell,
  artifactHeader,
  statusBadge,
  stageBadge,
  metricRow
};
