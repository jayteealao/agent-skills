import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  md2html,
  renderHistoryBlock
} from "../chunk-UW3C7ZAM.mjs";
import {
  artifactHeader,
  metricRow
} from "../chunk-AUY2HYM2.mjs";
import {
  escapeHtml
} from "../chunk-3RXHOXIK.mjs";
import "../chunk-CGSPUUFD.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/ideation.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const ideas = Array.isArray(fm.ideas) ? fm.ideas : [];
  const culled = Array.isArray(fm.culled) ? fm.culled : [];
  const sources = Array.isArray(fm.sources) ? fm.sources : [];
  const items = Array.isArray(fm["source-items"]) ? fm["source-items"] : [];
  const withConfidence = ideas.some((i) => i && i.confidence);
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? `Ideation \xB7 ${fm.focus ?? ctx?.slug ?? ""}`),
    badges: [
      fm.focus && `<span class="meta">focus <strong>${escapeHtml(fm.focus)}</strong></span>`,
      fm["created-at"] && `<span class="meta">${escapeHtml(fm["created-at"])}</span>`
    ]
  });
  const metricsHtml = metricRow([
    { label: "shown", value: ideas.length, tone: ideas.length ? "ok" : "warn" },
    fm["raw-candidates"] != null && { label: "raw", value: fm["raw-candidates"], tone: "info" },
    fm["culled-count"] != null && { label: "culled", value: fm["culled-count"], tone: "warn" }
  ].filter(Boolean));
  const ideasHtml = ideas.length ? `<table class="ideation-table">
        <thead><tr><th>id</th><th>idea</th><th>category</th><th>impact</th><th>effort</th><th>score</th>${withConfidence ? "<th>confidence</th>" : ""}</tr></thead>
        <tbody>${ideas.map((idea) => ideaRow(idea, { withConfidence })).join("")}</tbody>
       </table>` : "";
  const sourcesHtml = sources.length ? sourcesTable(sources, items) : "";
  const itemsHtml = items.length ? sourceItemsByResult(items) : "";
  const culledHtml = culled.length ? `<details class="ideation-culled">
        <summary>${culled.length} culled</summary>
        <ul>${culled.map(culledItem).join("")}</ul>
       </details>` : "";
  const prose = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${ideasHtml}${sourcesHtml}${itemsHtml}${culledHtml}${prose}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
var IMPACT = { critical: 4, high: 3, medium: 2, low: 1 };
var EFFORT = { xs: 1, s: 2, m: 3, l: 4, xl: 5 };
var FEASIBILITY = { clear: 1, "needs-design": 0.7, external: 0.5 };
function ideaScore(idea) {
  if (idea.score != null) return idea.score;
  const impact = IMPACT[idea.impact];
  const effort = EFFORT[idea.effort];
  if (!impact || !effort) return "";
  const feasibility = FEASIBILITY[idea.feasibility] ?? 1;
  return Math.round(impact * feasibility / effort * 100) / 100;
}
function ideaRow(idea, { withConfidence = false } = {}) {
  return `<tr>
    <td><code>${escapeHtml(idea.id ?? "")}</code></td>
    <td>${escapeHtml(idea.title ?? "")}</td>
    <td>${escapeHtml(idea.category ?? "")}</td>
    <td>${escapeHtml(idea.impact ?? "")}</td>
    <td>${escapeHtml(idea.effort ?? "")}</td>
    <td>${escapeHtml(String(ideaScore(idea)))}</td>${withConfidence ? `
    <td>${escapeHtml(idea.confidence ?? "")}</td>` : ""}
  </tr>`;
}
var RESULT_ORDER = ["applies", "already-used", "not-applicable", "blocked-by-version", "needs-verification", "already-fixed", "duplicate-of", "withdrawn"];
function sourcesTable(sources, items) {
  const rows = sources.map((s) => {
    const mine = items.filter((it) => String(it?.id ?? "").startsWith(`${s.id}-`));
    const counts = RESULT_ORDER.map((r) => [r, mine.filter((it) => it.result === r).length]).filter(([, n]) => n);
    return `<tr>
    <td><code>${escapeHtml(s.id ?? "")}</code></td>
    <td>${escapeHtml(s.kind ?? "")}</td>
    <td>${escapeHtml(s.origin ?? "")}</td>
    <td>${escapeHtml(s.state ?? "")}${s.reason ? ` \u2014 ${escapeHtml(s.reason)}` : ""}</td>
    <td>${mine.length}</td>
    <td>${counts.map(([r, n]) => `${escapeHtml(r)} ${n}`).join(", ")}</td>
  </tr>`;
  });
  return `<table class="ideation-sources">
        <thead><tr><th>source</th><th>kind</th><th>origin</th><th>state</th><th>items</th><th>results</th></tr></thead>
        <tbody>${rows.join("")}</tbody>
       </table>`;
}
function sourceItemsByResult(items) {
  const groups = RESULT_ORDER.map((r) => [r, items.filter((it) => it?.result === r)]).filter(([, list]) => list.length);
  const unknown = items.filter((it) => !RESULT_ORDER.includes(it?.result));
  if (unknown.length) groups.push(["no result", unknown]);
  return groups.map(([r, list]) => `<details class="ideation-source-items">
        <summary>${list.length} ${escapeHtml(r)}</summary>
        <ul>${list.map(sourceItem).join("")}</ul>
       </details>`).join("");
}
function sourceItem(it) {
  const detail = it.idea ?? it.reason ?? it.check ?? it["duplicate-of"] ?? (it["ships-in"] ? `installed ${it.installed ?? "?"}, ships in ${it["ships-in"]}` : null) ?? (Array.isArray(it.evidence) ? it.evidence.join(", ") : null);
  return `<li><code>${escapeHtml(it.id ?? "")}</code> ${escapeHtml(it.title ?? "")}${detail ? ` \u2014 ${escapeHtml(detail)}` : ""}</li>`;
}
function culledItem(c) {
  return `<li><code>${escapeHtml(c.id ?? "")}</code> ${escapeHtml(c.title ?? "")}${c.reason ? ` \u2014 ${escapeHtml(c.reason)}` : ""}</li>`;
}
export {
  ideaScore,
  render
};
