import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  evenX,
  figureCanvas
} from "./chunk-PDBKNARE.mjs";
import {
  artifactHeader,
  pageHref
} from "./chunk-U4F4JCWH.mjs";
import {
  escapeHtml
} from "./chunk-4WRIEOIP.mjs";

// renderers/dashboard.mjs
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
var TERMINAL_COMPLETE = /* @__PURE__ */ new Set(["complete", "completed", "shipped", "done"]);
var TERMINAL_CLOSED = /* @__PURE__ */ new Set(["closed", "abandoned", "cancelled"]);
function render(artifact, ctx) {
  const slugs = (ctx.allArtifacts?.__summary__ ?? []).map((s) => ({
    slug: s.slug,
    fm: s.frontmatter ?? {}
  }));
  const project = ctx.allArtifacts?.__project__ ?? [];
  const pipeline = slugs.filter((s) => s.fm.type !== "workflow-index");
  const quick = slugs.filter((s) => s.fm.type === "workflow-index");
  const statusOf = (s) => String(s.fm.status ?? "").trim().toLowerCase();
  const complete = pipeline.filter((s) => TERMINAL_COMPLETE.has(statusOf(s)));
  const closed = pipeline.filter((s) => TERMINAL_CLOSED.has(statusOf(s)));
  const active = pipeline.filter((s) => !TERMINAL_COMPLETE.has(statusOf(s)) && !TERMINAL_CLOSED.has(statusOf(s)));
  const headerHtml = artifactHeader({
    h1: "sdlc dashboard",
    lede: `${slugs.length} workflow${slugs.length === 1 ? "" : "s"} \xB7 generated ${(/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace("T", " ")}`
  });
  const figureSvg = swimlanesSvg(active, complete);
  const figureHtml = figureCanvas({
    figureNumber: 1,
    title: "Workflow swimlanes",
    svgInner: figureSvg,
    legend: [
      { state: "done", label: "done" },
      { state: "current", label: "current" },
      { state: "upcoming", label: "upcoming" },
      { state: "queued", label: "queued" },
      { state: "blocked", label: "blocked" }
    ]
  });
  const desktopBody = `
    ${figureHtml}
    ${slugSection("Active", active)}
    ${slugSection("Recently shipped", complete)}
    ${slugSection("Closed", closed)}
    ${quickSection(quick)}
  `;
  const mobileBody = `
    ${mobileTiles(active)}
    ${mobileCardGroup("Active", active, false)}
    ${mobileCardGroup("Recently shipped", complete, true)}
    ${mobileQuickGroup(quick)}
  `;
  const bodyHtml = `
    ${projectSection(project)}
    <div class="d-only">${desktopBody}</div>
    <div class="m-only">${mobileBody}</div>
  `;
  return { headerHtml, bodyHtml, links: [], children: [] };
}
function mobileTiles(active) {
  const blockers = active.reduce((a, s) => a + (Number(s.fm.blockers ?? s.fm["blocker-count"] ?? (isBlocked(s.fm) ? 1 : 0)) || 0), 0);
  return `<div class="mtiles">
    <div class="mtile"><div class="lbl">Active</div><div class="val">${active.length}</div></div>
    <div class="mtile"><div class="lbl">Blockers</div><div class="val${blockers ? " is-blocker" : ""}">${blockers}</div></div>
  </div>`;
}
function mobileCardGroup(label, list, shipped) {
  if (!list.length) return "";
  const cards = list.map((s) => mobilePcard(s, shipped)).join("");
  return `<div class="subhead">${escapeHtml(label)} <span class="ct">${list.length}</span></div>${cards}`;
}
function isBlocked(fm) {
  return String(fm.status ?? "").trim().toLowerCase() === "blocked" || fm.blocked === true;
}
function mobilePcard({ slug, fm }, shipped) {
  const stage = fm["current-stage"] ?? "intake";
  const declaredIdx = STAGES.indexOf(stage);
  const currentIdx = shipped ? STAGES.length - 1 : declaredIdx < 0 ? 0 : declaredIdx;
  const blocked = !shipped && isBlocked(fm);
  const h = health(fm);
  const desc = fm.description ?? "";
  const dots = STAGES.map((_s, i) => {
    const cur = !shipped && currentIdx === i;
    const done = shipped ? true : currentIdx > i;
    const cls = cur ? blocked ? "d blocked" : "d cur" : done ? "d done" : "d";
    return `<span class="${cls}"></span>`;
  }).join("");
  const chipCls = h.tone === "ok" && h.label === "shipped" ? "stagechip done" : "stagechip";
  const lineTone = h.tone === "bad" ? "bad" : h.tone === "warn" ? "warn" : h.tone === "idle" ? "idle" : "ok";
  return `<a class="pcard" href="${escapeHtml(pageHref(slug))}">
    <div class="top"><span class="slug">${escapeHtml(slug)}</span><span class="${chipCls}">${escapeHtml(stage)}</span></div>
    ${desc ? `<p class="desc">${escapeHtml(desc)}</p>` : ""}
    <div class="foot"><div class="stagestrip">${dots}</div><span class="when">${escapeHtml(humanRelative(fm["updated-at"] ?? ""))}</span></div>
    <div class="statusline ${lineTone}"><span class="glyph" aria-hidden="true">${h.glyph}</span>${escapeHtml(h.label)}</div>
  </a>`;
}
function mobileQuickGroup(list) {
  if (!list.length) return "";
  const cards = list.map(({ slug, fm }) => {
    const h = health(fm);
    const lineTone = h.tone === "bad" ? "bad" : h.tone === "warn" ? "warn" : h.tone === "idle" ? "idle" : "ok";
    return `<a class="pcard" href="${escapeHtml(pageHref(slug))}">
      <div class="top"><span class="slug">${escapeHtml(slug)}</span><span class="stagechip">${escapeHtml(fm["workflow-type"] ?? "quick")}</span></div>
      <div class="statusline ${lineTone}"><span class="glyph" aria-hidden="true">${h.glyph}</span>${escapeHtml(fm["current-stage"] ?? h.label)}</div>
    </a>`;
  }).join("");
  return `<div class="subhead">Quick &amp; investigative <span class="ct">${list.length}</span></div>${cards}`;
}
function projectSection(list) {
  if (!list.length) return "";
  const rows = list.map((item) => {
    const fm = item.frontmatter ?? {};
    const title = fm.title ?? item.path;
    const href = item.viewRel ?? "";
    const status = fm.status ?? "";
    return `<a class="project-row" href="${escapeHtml(href)}">
      <span class="slug"><code>${escapeHtml(item.path)}</code></span>
      <span class="title">${escapeHtml(title)}</span>
      <span class="stage-pill">${escapeHtml(fm.type ?? "context")}</span>
      <span class="meta">${escapeHtml(status)}</span>
    </a>`;
  }).join("");
  return `<section class="project-list">
    <h2 class="sdlc-h2">Project context <span class="meta">(${list.length})</span></h2>
    ${rows}
  </section>`;
}
function slugSection(label, list) {
  if (!list.length) return "";
  const rows = list.map((s) => projectRow(s)).join("");
  return `<section class="project-list">
    <h2 class="sdlc-h2">${label} <span class="meta">(${list.length})</span></h2>
    ${rows}
  </section>`;
}
function quickSection(list) {
  if (!list.length) return "";
  const rows = list.map(({ slug, fm }) => {
    const wfType = fm["workflow-type"] ?? "quick";
    const stage = fm["current-stage"] ?? "";
    const title = fm.title ?? slug;
    const status = fm.status ?? "";
    return `<a class="project-row" href="${escapeHtml(pageHref(slug))}">
      <span class="slug"><code>${escapeHtml(slug)}</code></span>
      <span class="title">${escapeHtml(title)}</span>
      <span class="stage-pill">${escapeHtml(wfType)}</span>
      <span class="stage-pill">${escapeHtml(stage)}</span>
      <span class="meta">${escapeHtml(status)}</span>
    </a>`;
  }).join("");
  return `<section class="project-list">
    <h2 class="sdlc-h2">Quick &amp; investigative <span class="meta">(${list.length})</span></h2>
    ${rows}
  </section>`;
}
function projectRow({ slug, fm }) {
  const stage = fm["current-stage"] ?? "intake";
  const title = fm.title ?? slug;
  const updated = fm["updated-at"] ?? "";
  const desc = fm.description ?? "";
  const h = health(fm);
  const stageVariant = h.tone === "ok" && h.label === "shipped" ? "done" : "cur";
  return `<article class="project-row ${h.tone}">
    <span class="pr-id">
      <a class="name" href="${escapeHtml(pageHref(slug))}">${escapeHtml(title)}</a>
      <code class="slug">${escapeHtml(slug)}</code>
    </span>
    <span class="desc">${escapeHtml(desc)}</span>
    <span class="stage-pill ${stageVariant}">${escapeHtml(stage)}</span>
    <span class="status ${h.tone}"><span class="glyph" aria-hidden="true">${h.glyph}</span>${escapeHtml(h.label)}</span>
    <span class="time">${escapeHtml(humanRelative(updated))}</span>
  </article>`;
}
function health(fm) {
  const status = String(fm.status ?? "").trim().toLowerCase();
  const blocked = status === "blocked" || fm.blocked === true;
  if (blocked) return { tone: "bad", glyph: "\u25CF", label: "blocked" };
  if (["complete", "completed", "shipped", "done"].includes(status)) return { tone: "ok", glyph: "\u25C9", label: "shipped" };
  if (["closed", "abandoned", "cancelled"].includes(status)) return { tone: "idle", glyph: "\u25CE", label: status };
  if (["paused", "on-hold", "waiting"].includes(status)) return { tone: "warn", glyph: "\u25D0", label: status };
  return { tone: "ok", glyph: "\u25C9", label: status || "active" };
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
  const mo = Math.round(d / 30);
  return `${mo} mo ago`;
}
function swimlanesSvg(active = [], shipped = []) {
  const rows = [...active, ...shipped];
  if (!rows.length) {
    return `<svg viewBox="0 0 600 80" width="100%"><text x="300" y="44" text-anchor="middle" fill="#8a8377" font-size="13">No workflows yet</text></svg>`;
  }
  const W = 980;
  const rowH = 46;
  const top = 46;
  const padX = 150;
  const shippedStart = active.length;
  const sepGap = shipped.length ? 26 : 0;
  const H = top + rows.length * rowH + sepGap + 24;
  const xs = evenX(W, padX, STAGES.length);
  const railTop = top - 14;
  const railBot = top + rows.length * rowH + sepGap - rowH + 14;
  const header = STAGES.map(
    (s, i) => `<text x="${xs[i]}" y="${top - 22}" text-anchor="middle" font-size="10" font-weight="600" fill="#8a8377" letter-spacing="1.2">${s.toUpperCase()}</text>`
  ).join("");
  const colRules = STAGES.map(
    (s, i) => `<line x1="${xs[i]}" y1="${railTop}" x2="${xs[i]}" y2="${railBot}" stroke="#e0dbcd" stroke-width="1"/>`
  ).join("");
  let separator = "";
  const rowSvg = rows.map((row, ri) => {
    const { slug, fm } = row;
    const isShipped = ri >= shippedStart;
    const extra = isShipped ? sepGap : 0;
    const y = top + ri * rowH + extra;
    if (shipped.length && ri === shippedStart) {
      const sy = y - rowH / 2 - 2;
      separator = `<line x1="20" y1="${sy}" x2="${W - 20}" y2="${sy}" stroke="#cbc4b1" stroke-width="1" stroke-dasharray="2 3"/>
        <text x="20" y="${sy + 14}" font-size="9" font-weight="700" letter-spacing="1.5" fill="#8a8377" font-family="ui-monospace, monospace">SHIPPED</text>`;
    }
    const declaredIdx = STAGES.indexOf(fm["current-stage"] ?? "intake");
    const currentIdx = isShipped ? STAGES.length - 1 : declaredIdx < 0 ? 0 : declaredIdx;
    const blocked = !isShipped && (fm.status === "blocked" || fm.blocked === true);
    const progress = currentIdx > 0 ? `<line x1="${xs[0]}" y1="${y}" x2="${xs[currentIdx]}" y2="${y}" stroke="#1f1b16" stroke-width="1.5"/>` : "";
    const tailDash = currentIdx < STAGES.length - 1 ? `<line x1="${xs[currentIdx]}" y1="${y}" x2="${xs[STAGES.length - 1]}" y2="${y}" stroke="#cbc4b1" stroke-width="1" stroke-dasharray="2 3"/>` : "";
    const slugLabel = `<text x="20" y="${y + 4}" font-size="11" fill="#1f1b16"><tspan font-family="ui-monospace, monospace">${escapeHtml(slug.slice(0, 20))}</tspan></text>`;
    const dots = STAGES.map((s, i) => {
      const x = xs[i];
      const isCur = !isShipped && currentIdx === i;
      const done = isShipped ? true : currentIdx > i;
      if (isCur) {
        const c = blocked ? "#b5305f" : "#4a6c8c";
        return `<circle cx="${x}" cy="${y}" r="10" fill="none" stroke="${c}" stroke-width="1.2" opacity="0.5"/><circle cx="${x}" cy="${y}" r="7" fill="${c}" stroke="${c}" stroke-width="1.5"/>`;
      }
      if (done) {
        return `<circle cx="${x}" cy="${y}" r="5" fill="#1f1b16" stroke="#1f1b16" stroke-width="1.5"/>`;
      }
      return `<circle cx="${x}" cy="${y}" r="5" fill="#fbfaf6" stroke="#cbc4b1" stroke-width="1" stroke-dasharray="2.5 2"/>`;
    }).join("");
    const blockerCount = Number(fm.blockers ?? fm["blocker-count"] ?? (blocked ? 1 : 0)) || 0;
    const rev = fm["revision-count"] ?? fm.rev;
    let annotation = "";
    if (!isShipped && blockerCount) {
      annotation = `<text x="${xs[currentIdx] + 11}" y="${y - 9}" font-size="9" fill="#b5305f">\xB7 ${blockerCount} blocker${blockerCount === 1 ? "" : "s"}</text>`;
    } else if (!isShipped && rev != null && rev !== "") {
      annotation = `<text x="${xs[currentIdx] + 11}" y="${y - 9}" font-size="9" fill="#8a8377">\xB7 rev ${escapeHtml(String(rev))}</text>`;
    }
    return `${progress}${tailDash}${slugLabel}${dots}${annotation}`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Workflow swimlanes">
    ${colRules}
    ${header}
    ${separator}
    ${rowSvg}
  </svg>`;
}

export {
  render,
  swimlanesSvg
};
