import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  md2html,
  renderHistoryBlock
} from "../chunk-FJRCBS33.mjs";
import {
  evenX,
  figureCanvas
} from "../chunk-PDBKNARE.mjs";
import {
  artifactHeader,
  metricRow,
  pageHref,
  stageBadge,
  statusBadge
} from "../chunk-NMNGTR6J.mjs";
import "../chunk-LFGT2BKG.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/workflow-index.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const wfType = fm["workflow-type"] ?? "quick";
  const stage = fm["current-stage"] ?? "";
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? fm.slug ?? "untitled"),
    lede: escapeHtml(fm.description ?? fm.lede ?? fm.summary ?? ""),
    // D4.1 (was hard-coded '')
    badges: [
      statusBadge(fm.status),
      `<span class="stage-badge">${escapeHtml(wfType)}</span>`,
      stage && stageBadge(stage),
      fm.branch && `<span class="meta">branch <code>${escapeHtml(fm.branch)}</code></span>`,
      fm["updated-at"] && `<span class="meta">updated ${escapeHtml(fm["updated-at"])}</span>`
    ]
  });
  const metrics = [
    { label: "type", value: wfType },
    fm["selected-slice"] && { label: "target", value: fm["selected-slice"] },
    stage && { label: "stage", value: stage }
  ].filter(Boolean);
  const metricsHtml = metrics.length ? metricRow(metrics) : "";
  const figureHtml = quickFigure(fm, ctx.allArtifacts);
  const routesHtml = routesSection(fm);
  const artifactsHtml = artifactsSection(ctx.allArtifacts);
  const progressHtml = progressSection(fm.progress);
  const questionsHtml = openQuestionsSection(fm["open-questions"]);
  const tagsHtml = tagsSection(fm.tags);
  const proseHtml = artifact.body ? md2html(artifact.body) : "";
  const bodyHtml = `
    ${figureHtml}
    ${metricsHtml}
    ${routesHtml}
    ${artifactsHtml}
    ${progressHtml}
    <section class="so-grid">
      <div class="so-rail prose">
        ${proseHtml || '<p class="sdlc-lede">Quick workflow overview.</p>'}
      </div>
      <aside class="activity">
        ${questionsHtml}
        ${tagsHtml}
      </aside>
    </section>
    ${renderHistoryBlock(artifact.history)}
  `;
  return { headerHtml, bodyHtml, links: [], children: [] };
}
function routesSection(fm) {
  const rr = fm["recommended-routes"] && typeof fm["recommended-routes"] === "object" ? fm["recommended-routes"] : {};
  const primary = rr.primary ?? fm["next-command"] ?? "";
  const invocation = fm["next-invocation"] ?? "";
  const alternates = Array.isArray(rr.alternates) ? rr.alternates : [];
  if (!primary && !invocation && !alternates.length) return "";
  const alts = alternates.length ? `<ul class="route-alts">${alternates.map((a) => `<li><code>${escapeHtml(String(a))}</code></li>`).join("")}</ul>` : "";
  return `<section class="next-route">
    <h2 class="sdlc-h2">recommended next</h2>
    ${primary ? `<p class="route-primary"><code>${escapeHtml(String(primary))}</code></p>` : ""}
    ${invocation ? `<p class="meta">${escapeHtml(String(invocation))}</p>` : ""}
    ${alts}
  </section>`;
}
function artifactsSection(allArtifacts) {
  const flat = [];
  for (const list of Object.values(allArtifacts ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const a of list) {
      if (a?.frontmatter?.type === "workflow-index") continue;
      if (!a?.viewRel) continue;
      flat.push(a);
    }
  }
  if (!flat.length) return "";
  flat.sort((a, b) => String(a.storageRel ?? "").localeCompare(String(b.storageRel ?? "")));
  const cards = flat.map((a) => {
    const t = a.frontmatter?.type ?? "artifact";
    const title = a.frontmatter?.title ?? a.storageRel ?? t;
    return `<a class="slice-card" href="${escapeHtml(pageHref(a.viewRel))}">
      <span class="slice-slug"><code>${escapeHtml(t)}</code></span>
      <span class="slice-title">${escapeHtml(title)}</span>
    </a>`;
  }).join("");
  return `<section class="slug-artifacts">
    <h2 class="sdlc-h2">artifacts \xB7 ${flat.length}</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}
function progressSection(progress) {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) return "";
  const entries = Object.entries(progress);
  if (!entries.length) return "";
  const items = entries.map(([k, v]) => {
    const done = v === true || String(v).toLowerCase() === "complete";
    return `<li class="${done ? "is-ok" : ""}"><code>${escapeHtml(k)}</code> <span class="meta">${escapeHtml(String(v))}</span></li>`;
  }).join("");
  return `<section class="slug-progress">
    <h2 class="sdlc-h2">progress</h2>
    <ul class="progress-list">${items}</ul>
  </section>`;
}
function openQuestionsSection(questions) {
  if (!Array.isArray(questions) || !questions.length) return "";
  const items = questions.map((q) => `<li>${escapeHtml(String(q))}</li>`).join("");
  return `<h2 class="sdlc-h2">open questions</h2><ul class="open-questions">${items}</ul>`;
}
function tagsSection(tags) {
  if (!Array.isArray(tags) || !tags.length) return "";
  const chips = tags.map((t) => `<span class="stage-badge">${escapeHtml(String(t))}</span>`).join(" ");
  return `<h2 class="sdlc-h2">tags</h2><div class="meta-row">${chips}</div>`;
}
function quickFigure(fm, allArtifacts) {
  const progress = fm.progress && typeof fm.progress === "object" && !Array.isArray(fm.progress) ? fm.progress : null;
  let steps;
  if (progress) {
    steps = Object.entries(progress).map(([k, v]) => ({
      label: k,
      done: v === true || String(v).toLowerCase() === "complete"
    }));
  } else {
    steps = [];
    for (const list of Object.values(allArtifacts ?? {})) {
      if (!Array.isArray(list)) continue;
      for (const a of list) {
        if (a?.frontmatter?.type === "workflow-index") continue;
        steps.push({ label: a.frontmatter?.type ?? "step", done: true });
      }
    }
  }
  if (!steps.length) return "";
  return figureCanvas({
    figureNumber: 2,
    title: `Routing \u2014 ${fm["workflow-type"] ?? "quick"}`,
    svgInner: quickStripeSvg(steps),
    legend: [
      { state: "done", label: "done" },
      { state: "current", label: "current" },
      { state: "queued", label: "queued" }
    ]
  });
}
function quickStripeSvg(steps) {
  const W = 920, padX = 60, cy = 70, H = 130;
  const xs = evenX(W, padX, steps.length);
  const rail = `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#cbc4b1" stroke-width="2"/>`;
  const lastDone = steps.reduce((acc, s, i) => s.done ? i : acc, -1);
  const progress = lastDone >= 0 ? `<line x1="${xs[0]}" y1="${cy}" x2="${xs[lastDone]}" y2="${cy}" stroke="#1f1b16" stroke-width="2.5"/>` : "";
  const nodes = steps.map((s, i) => {
    const x = xs[i];
    const isCur = !s.done && i === lastDone + 1;
    const fill = s.done ? "#3e7d4a" : isCur ? "#4a6c8c" : "#fbfaf6";
    const stroke = s.done ? "#3e7d4a" : isCur ? "#4a6c8c" : "#cbc4b1";
    const dot = isCur ? `<circle cx="${x}" cy="${cy}" r="13" fill="${fill}" stroke="${stroke}" stroke-width="2"/><circle cx="${x}" cy="${cy}" r="8" fill="none" stroke="#fbfaf6" stroke-width="1.2" stroke-dasharray="3 3"/>` : s.done ? `<circle cx="${x}" cy="${cy}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` : `<circle cx="${x}" cy="${cy}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="2.5 2"/>`;
    const label = `<text x="${x}" y="${cy + 28}" text-anchor="middle" font-size="10" fill="#1f1b16">${escapeHtml(String(s.label).slice(0, 16))}</text>`;
    return `${dot}${label}`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Routing stripe">${rail}${progress}${nodes}</svg>`;
}
export {
  render
};
