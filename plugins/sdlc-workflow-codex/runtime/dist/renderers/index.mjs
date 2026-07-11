import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  evenX,
  figureCanvas
} from "../chunk-PDBKNARE.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-5Q7XHEE6.mjs";
import {
  metricRow,
  pageHref,
  stageBadge,
  statusBadge
} from "../chunk-X5KJFBYT.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/index.mjs
var STAGES = [
  "intake",
  "shape",
  "slice",
  "plan",
  "implement",
  "verify",
  "review",
  "handoff",
  "ship",
  "retro"
];
var STAGE_NAV = {
  intake: { types: ["intake"], dir: "intake" },
  shape: { types: ["shape", "design", "design-contract", "design-brief"], dir: "shape" },
  slice: { types: ["slice-index", "slice"], dir: "slice" },
  plan: { types: ["plan-index", "plan"], dir: "plan" },
  implement: { types: ["implement-index", "implement"], dir: "implement" },
  verify: { types: ["verify-index", "verify"], dir: "verify" },
  review: { types: ["review", "review-command", "design-audit", "design-critique"], dir: "review" },
  handoff: { types: ["handoff"], dir: "handoff" },
  ship: { types: ["ship-runs-index", "ship-run"], dir: "ship" },
  retro: { types: ["retro"], dir: "retro" }
};
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const current = fm["current-stage"] ?? "intake";
  const lede = fm.description ?? fm.lede ?? fm.summary ?? "";
  const headerHtml = `<header class="so-hd">
    <div class="so-hd-main">
      <h1 class="pg-title">${escapeHtml(fm.title ?? fm.slug ?? "untitled")}</h1>
      ${lede ? `<p class="sdlc-lede">${escapeHtml(lede)}</p>` : ""}
    </div>
    <aside class="so-hd-aside">
      ${fm.branch ? `<span class="badge">\u2387 ${escapeHtml(fm.branch)}</span>` : ""}
      ${statusBadge(fm.status)}
      ${stageBadge(current)}
      ${fm["pr-number"] ? `<span class="meta">PR #${escapeHtml(fm["pr-number"])}</span>` : ""}
      ${fm["updated-at"] ? `<span class="meta">updated ${escapeHtml(fm["updated-at"])}</span>` : ""}
    </aside>
  </header>`;
  const progressValue = formatProgress(fm.progress, ctx.allArtifacts);
  const metrics = [
    progressValue && { label: "progress", value: progressValue },
    fm["selected-slice"] && { label: "slice", value: fm["selected-slice"] },
    fm["review-scope"] && { label: "review", value: fm["review-scope"] }
  ].filter(Boolean);
  const metricsHtml = metrics.length ? metricRow(metrics) : "";
  const figureSvg = stageStripeSvg({ current, allArtifacts: ctx.allArtifacts, fm });
  const figureHtml = figureCanvas({
    figureNumber: 2,
    title: `Slug stage stripe \u2014 ${fm.slug ?? ""}`,
    svgInner: figureSvg,
    legend: [
      { state: "done", label: "done" },
      { state: "current", label: "current" },
      { state: "queued", label: "queued" }
    ]
  });
  const activity = buildActivityList(ctx.allArtifacts);
  const railHtml = jumpRail(current, ctx.allArtifacts);
  const proseHtml = artifact.body ? md2html(artifact.body) : "";
  const stagesGridHtml = stagesGrid(current, ctx.allArtifacts);
  const slicesHtml = slicesPreview(ctx.allArtifacts);
  const plansHtml = plansPreview(ctx.allArtifacts);
  const mobileStripeHtml = mobileStripe({ current, allArtifacts: ctx.allArtifacts, fm });
  const bodyHtml = `
    <div class="d-only">${figureHtml}${metricsHtml}</div>
    <div class="m-only">${mobileStripeHtml}</div>
    <section class="so-grid">
      <div class="so-main">
        <h2 class="sec">recent activity</h2>
        ${activity}
      </div>
      <aside class="so-side">
        ${railHtml}
      </aside>
    </section>
    ${proseHtml ? `<section class="so-prose"><div class="prose">${proseHtml}</div></section>` : ""}
    ${stagesGridHtml}
    ${slicesHtml}
    ${plansHtml}
    ${renderHistoryBlock(artifact.history)}
  `;
  return { headerHtml, bodyHtml, links: [], children: [] };
}
function mobileStripe({ current, allArtifacts, fm }) {
  const currentIdx = Math.max(0, STAGES.indexOf(current));
  const s = slugStats(allArtifacts, fm);
  const tiles = `<div class="mtiles">
    <div class="mtile"><div class="lbl">Slices</div><div class="val">${s.slices || "\u2014"}</div></div>
    <div class="mtile"><div class="lbl">Reviews</div><div class="val">${s.reviews || "\u2014"}</div></div>
    <div class="mtile"><div class="lbl">Blockers</div><div class="val${s.blockers ? " is-blocker" : ""}">${s.blockers}</div></div>
    <div class="mtile"><div class="lbl">Checks</div><div class="val">${escapeHtml(String(s.checks ?? "\u2014"))}</div></div>
  </div>`;
  const steps = STAGES.map((stage, i) => {
    const cfg = STAGE_NAV[stage] ?? { types: [stage], dir: stage };
    const { count } = stageArtifacts(stage, allArtifacts);
    const cls = currentIdx === i ? "step cur" : currentIdx > i ? "step done" : "step";
    const meta = count > 0 ? stationAnnotation(stage, count, allArtifacts, fm) : "not started";
    const inner = `<span class="ring">${i + 1}</span><div class="nm">${escapeHtml(stage)}</div><div class="meta">${escapeHtml(meta)}</div>`;
    return count > 0 ? `<a class="${cls}" href="${escapeHtml(pageHref(cfg.dir))}">${inner}</a>` : `<div class="${cls}">${inner}</div>`;
  }).join("");
  return `${tiles}<div class="subhead">Stages</div><div class="stepper">${steps}</div>`;
}
var SVG_SERIF = "Iowan Old Style, Palatino, Georgia, serif";
function stageArtifacts(stage, allArtifacts) {
  const cfg = STAGE_NAV[stage] ?? { types: [stage] };
  const types = (cfg.types ?? [stage]).filter((t) => !t.endsWith("-index"));
  const list = types.flatMap((t) => allArtifacts?.[t] ?? []);
  const dates = list.map((a) => a.frontmatter?.["updated-at"]).filter(Boolean).sort();
  return { count: list.length, latest: dates[dates.length - 1] ?? "" };
}
function sliceRoster(allArtifacts) {
  const fm = (allArtifacts?.["slice-index"] ?? [])[0]?.frontmatter ?? {};
  const list = Array.isArray(fm.slices) ? fm.slices : [];
  const total = Number(fm["total-slices"]);
  return { list, total: Number.isFinite(total) && total > 0 ? total : list.length };
}
var SLICE_DONE = /* @__PURE__ */ new Set(["complete", "completed", "done", "shipped"]);
function formatProgress(progress, allArtifacts = {}) {
  if (!progress) return null;
  if (typeof progress === "string") return progress;
  if (typeof progress !== "object") return String(progress);
  if (Number(progress.total) > 0) {
    const rosterTotal = sliceRoster(allArtifacts).total;
    const total = Math.max(Number(progress.total), Number.isFinite(rosterTotal) ? rosterTotal : 0);
    return `${Number(progress.done) || 0}/${total}`;
  }
  const states = Object.values(progress).filter((v) => typeof v === "string");
  if (!states.length) return null;
  const done = states.filter((v) => SLICE_DONE.has(v.toLowerCase())).length;
  return `${done}/${states.length}`;
}
function stationAnnotation(stage, count, allArtifacts = {}, fm = {}) {
  const generic = `${count} artifact${count === 1 ? "" : "s"}`;
  switch (stage) {
    case "slice":
      return `${count} slice${count === 1 ? "" : "s"}`;
    case "review":
      return `${count} review${count === 1 ? "" : "s"}`;
    case "ship":
      return `${count} run${count === 1 ? "" : "s"}`;
    case "implement": {
      const { list, total } = sliceRoster(allArtifacts);
      if (!total) return generic;
      const ii = (allArtifacts["implement-index"] ?? [])[0]?.frontmatter ?? {};
      const rollDone = Number(ii["slices-implemented"]);
      const fromLeaves = (allArtifacts.implement ?? []).filter((a) => SLICE_DONE.has(String(a.frontmatter?.status ?? "").toLowerCase())).length;
      const fromRoster = list.filter((s) => SLICE_DONE.has(String(s.status ?? "").toLowerCase())).length;
      const done = Math.max(Number.isFinite(rollDone) ? rollDone : 0, fromLeaves, fromRoster);
      return `${done}/${total} slices`;
    }
    case "verify": {
      const t = deriveChecks(allArtifacts, fm);
      return t != null ? `${t} \u2713` : generic;
    }
    case "plan": {
      const revs = (allArtifacts.plan ?? []).reduce((n, a) => n + (Number(a.frontmatter?.["revision-count"]) || 0), 0);
      return revs > 0 ? `${revs} revision${revs === 1 ? "" : "s"}` : generic;
    }
    default:
      return generic;
  }
}
function stageStripeSvg({ current, allArtifacts, fm = {} }) {
  const W = 920, H = 230, padX = 60;
  const xs = evenX(W, padX, STAGES.length);
  const cy = 96;
  const currentIdx = Math.max(0, STAGES.indexOf(current));
  const baseRail = `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#cbc4b1" stroke-width="2"/>`;
  const progress = currentIdx > 0 ? `<line x1="${xs[0]}" y1="${cy}" x2="${xs[currentIdx]}" y2="${cy}" stroke="#1f1b16" stroke-width="2.5"/>` : "";
  const stations = STAGES.map((stage, i) => {
    const x = xs[i];
    const done = currentIdx > i;
    const isCur = currentIdx === i;
    const fill = done ? "#3e7d4a" : isCur ? "#4a6c8c" : "#fbfaf6";
    const stroke = done ? "#3e7d4a" : isCur ? "#4a6c8c" : "#cbc4b1";
    const { count, latest } = stageArtifacts(stage, allArtifacts);
    const dot = isCur ? `<circle cx="${x}" cy="${cy}" r="22" fill="${fill}" stroke="${stroke}" stroke-width="2"/><circle cx="${x}" cy="${cy}" r="14" fill="none" stroke="#fbfaf6" stroke-width="1.2" stroke-dasharray="3 3"/>` : done ? `<circle cx="${x}" cy="${cy}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` : `<circle cx="${x}" cy="${cy}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="2.5 2"/>`;
    const date = latest ? `<text x="${x}" y="${cy - 28}" text-anchor="middle" font-size="9" fill="#8a8377" font-family="ui-monospace, monospace">${escapeHtml(String(latest).slice(5, 10))}</text>` : "";
    const youHere = isCur ? `<text x="${x}" y="${cy - 44}" text-anchor="middle" font-size="10" fill="#4a6c8c" font-style="italic">you are here</text>` : "";
    const label = `<text x="${x}" y="${cy + 42}" text-anchor="middle" font-size="11" fill="#1f1b16" font-weight="${isCur ? 600 : 500}">${stage}</text>`;
    const ann = count > 0 ? `<text x="${x}" y="${cy + 56}" text-anchor="middle" font-size="9" fill="#8a8377">${escapeHtml(stationAnnotation(stage, count, allArtifacts, fm))}</text>` : "";
    return `${date}${youHere}${dot}${label}${ann}`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Slug stage stripe">
    ${baseRail}${progress}${stations}
    ${metricCalloutBand(W, 186, fm, allArtifacts)}
  </svg>`;
}
function metricCalloutBand(W, y, fm, allArtifacts) {
  const s = slugStats(allArtifacts, fm);
  const groups = [
    { lbl: "LOC TOUCHED", val: s.loc ?? "\u2014" },
    { lbl: "SLICES", val: s.slices || "\u2014" },
    { lbl: "REVIEWS", val: s.reviews || "\u2014" },
    { lbl: "BLOCKERS", val: s.blockers },
    { lbl: "CHECKS", val: s.checks ?? "\u2014" }
  ];
  const rule = `<line x1="20" y1="${y}" x2="${W - 20}" y2="${y}" stroke="#e0dbcd" stroke-width="1"/>`;
  const gx = evenX(W, 110, groups.length);
  const cells = groups.map((g, i) => {
    const x = gx[i];
    return `<text x="${x}" y="${y + 18}" text-anchor="middle" font-size="9" letter-spacing="1" fill="#8a8377">${g.lbl}</text><text x="${x}" y="${y + 38}" text-anchor="middle" font-size="18" font-weight="600" fill="#1f1b16" font-family="${SVG_SERIF}">${escapeHtml(String(g.val))}</text>`;
  }).join("");
  return `${rule}${cells}`;
}
function slugStats(allArtifacts = {}, fm = {}) {
  const roster = sliceRoster(allArtifacts);
  const verify = allArtifacts.verify ?? [];
  const blockedSlices = roster.list.filter((sl) => String(sl.status ?? "").toLowerCase() === "blocked").length;
  const verifyBlockers = verify.filter((a) => isTruthyFlag(a.frontmatter?.["has-blockers"])).length;
  const explicitBlockers = Number(fm.blockers ?? fm["blocker-count"]);
  return {
    slices: roster.total,
    // Review DIMENSIONS (review-command) — the `review` index is a roll-up, not
    // a review, so it is excluded (fall back to it only if no dimensions exist).
    reviews: (allArtifacts["review-command"] ?? []).length || (allArtifacts.review ?? []).length,
    blockers: Number.isFinite(explicitBlockers) ? explicitBlockers : blockedSlices + verifyBlockers,
    loc: fm["loc-touched"] ?? fm["metric-loc"] ?? deriveLoc((allArtifacts["implement-index"] ?? [])[0]?.frontmatter ?? {}, allArtifacts.implement ?? []),
    checks: deriveChecks(allArtifacts, fm)
  };
}
function isTruthyFlag(v) {
  return v === true || ["true", "yes", "1"].includes(String(v).toLowerCase());
}
function sumField(list, key) {
  return (list ?? []).reduce((n, a) => n + (Number(a.frontmatter?.[key]) || 0), 0);
}
function deriveChecks(allArtifacts = {}, fm = {}) {
  const explicit = fm["checks-passed"] ?? fm["metric-checks"] ?? fm["tests-passed"] ?? fm["metric-tests"];
  if (explicit != null && explicit !== "") return explicit;
  const verify = allArtifacts.verify ?? [];
  const passed = sumField(verify, "metric-checks-passed");
  const run = sumField(verify, "metric-checks-run");
  if (passed > 0 || run > 0) return run > passed ? `${passed}/${run}` : String(passed);
  const adv = sumField(verify, "adversarial-tests-run");
  return adv > 0 ? String(adv) : null;
}
function deriveLoc(impFm = {}, impLeaves = []) {
  let add = Number(impFm["metric-total-lines-added"]);
  let rem = Number(impFm["metric-total-lines-removed"]);
  if (!Number.isFinite(add) && !Number.isFinite(rem) && impLeaves.length) {
    add = sumField(impLeaves, "metric-lines-added");
    rem = sumField(impLeaves, "metric-lines-removed");
  }
  if (!Number.isFinite(add) && !Number.isFinite(rem)) return null;
  return compactNum((Number.isFinite(add) ? add : 0) + (Number.isFinite(rem) ? rem : 0));
}
function compactNum(n) {
  return n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n);
}
function jumpRail(current, allArtifacts) {
  const items = STAGES.map((stage) => {
    const cfg = STAGE_NAV[stage] ?? { types: [stage], dir: stage };
    const { count } = stageArtifacts(stage, allArtifacts);
    const cur = stage === current ? ' aria-current="true"' : "";
    const inner = `<span class="lbl">${escapeHtml(stage)}</span><span class="count">${count || "\xB7"}</span>`;
    return count > 0 ? `<a href="${escapeHtml(pageHref(cfg.dir))}"${cur}>${inner}</a>` : `<span class="rail-empty"${cur}>${inner}</span>`;
  }).join("");
  return `<nav class="so-rail" aria-label="jump to stage"><h2 class="sec">jump to</h2>${items}</nav>`;
}
function buildActivityList(allArtifacts) {
  const flat = [];
  for (const list of Object.values(allArtifacts ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const a of list) {
      flat.push({
        type: a.frontmatter?.type ?? a.type,
        updated: a.frontmatter?.["updated-at"] ?? "",
        who: a.frontmatter?.author ?? a.frontmatter?.["updated-by"] ?? "",
        file: a.storageRel ?? a.path ?? "",
        href: a.viewRel ?? ""
      });
    }
  }
  flat.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  const top = flat.slice(0, 8);
  if (!top.length) return '<p class="sdlc-lede">No artifacts yet.</p>';
  return `<ol class="activity-list">${top.map((a) => {
    const when = a.updated ? humanRelative(a.updated) : a.type;
    const who = a.who || a.type;
    const fileBase = String(a.file).split("/").filter(Boolean).at(-1) ?? a.file;
    const inner = `<span class="when">${escapeHtml(when)}</span><span class="what">${escapeHtml(who)} updated <span class="file"><code>${escapeHtml(fileBase)}</code></span></span>`;
    return a.href ? `<li><a class="activity-link" href="${escapeHtml(a.href)}">${inner}</a></li>` : `<li>${inner}</li>`;
  }).join("")}</ol>`;
}
function sliceTone(status) {
  const s = String(status ?? "").trim().toLowerCase();
  if (["complete", "completed", "done", "shipped"].includes(s)) return "is-ok";
  if (s === "blocked") return "is-bad";
  if (["active", "in-progress", "in progress", "wip", "review", "in-review"].includes(s)) return "is-current";
  return "";
}
function humanRelative(iso) {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return String(iso);
  const diff = Date.now() - then;
  if (diff < 0) return String(iso);
  const min = Math.round(diff / 6e4);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return `${Math.round(d / 30)} mo ago`;
}
function stagesGrid(current, allArtifacts) {
  const cards = STAGES.map((stage) => {
    const cfg = STAGE_NAV[stage];
    const count = (cfg.types ?? [stage]).reduce(
      (n, t) => n + (allArtifacts?.[t] ?? []).length,
      0
    );
    const isCurrent = stage === current;
    const present = count > 0;
    const cls = ["slice-card"];
    if (isCurrent) cls.push("is-current");
    if (!present) cls.push("is-missing");
    const inner = `<span class="slice-slug"><code>${escapeHtml(stage)}</code></span>
      ${present ? `<span class="meta">${count} artifact${count === 1 ? "" : "s"}</span>` : '<span class="meta">not started</span>'}`;
    if (!present) {
      return `<div class="${cls.join(" ")}">${inner}</div>`;
    }
    return `<a class="${cls.join(" ")}" href="${escapeHtml(pageHref(cfg.dir))}">${inner}</a>`;
  }).join("");
  return `<section class="slug-stages">
    <h2 class="sdlc-h2">stages</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}
function slicesPreview(allArtifacts) {
  const slices = allArtifacts?.slice ?? [];
  if (!slices.length) return "";
  const cards = slices.map((s) => {
    const fm = s.frontmatter ?? {};
    const slug = fm["slice-slug"] ?? fm.slug ?? "";
    const tone = sliceTone(fm.status);
    return `<a class="slice-card ${tone}" href="${escapeHtml(pageHref(`slice/${slug}`))}">
      <span class="slice-slug"><code>${escapeHtml(slug)}</code></span>
      <span class="slice-title">${escapeHtml(fm.title ?? "")}</span>
      <span class="slice-status">${statusBadge(fm.status)}</span>
    </a>`;
  }).join("");
  return `<section class="slug-slices">
    <h2 class="sdlc-h2">slices \xB7 ${slices.length}</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}
function plansPreview(allArtifacts) {
  const plans = (allArtifacts?.plan ?? []).filter((p) => p.frontmatter?.["slice-slug"] ?? p.frontmatter?.slug);
  if (!plans.length) return "";
  const cards = plans.map((p) => {
    const fm = p.frontmatter ?? {};
    const slug = fm["slice-slug"] ?? fm.slug ?? "";
    const tone = sliceTone(fm.status);
    return `<a class="slice-card ${tone}" href="${escapeHtml(pageHref(`plan/${slug}`))}">
      <span class="slice-slug"><code>${escapeHtml(slug)}</code></span>
      <span class="slice-title">${escapeHtml(fm.title ?? "")}</span>
      <span class="slice-status">${statusBadge(fm.status)}</span>
    </a>`;
  }).join("");
  return `<section class="slug-plans">
    <h2 class="sdlc-h2">slice plans \xB7 ${plans.length}</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}
export {
  render
};
