import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  md2html,
  renderHistoryBlock
} from "../chunk-W3JLD7IU.mjs";
import {
  artifactHeader,
  metricRow
} from "../chunk-WTFBOQH6.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/ideation.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const ideas = Array.isArray(fm.ideas) ? fm.ideas : [];
  const culled = Array.isArray(fm.culled) ? fm.culled : [];
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
        <thead><tr><th>id</th><th>idea</th><th>category</th><th>impact</th><th>effort</th><th>score</th></tr></thead>
        <tbody>${ideas.map(ideaRow).join("")}</tbody>
       </table>` : "";
  const culledHtml = culled.length ? `<details class="ideation-culled">
        <summary>${culled.length} culled</summary>
        <ul>${culled.map(culledItem).join("")}</ul>
       </details>` : "";
  const prose = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${ideasHtml}${culledHtml}${prose}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
function ideaRow(idea) {
  return `<tr>
    <td><code>${escapeHtml(idea.id ?? "")}</code></td>
    <td>${escapeHtml(idea.title ?? "")}</td>
    <td>${escapeHtml(idea.category ?? "")}</td>
    <td>${escapeHtml(idea.impact ?? "")}</td>
    <td>${escapeHtml(idea.effort ?? "")}</td>
    <td>${escapeHtml(String(idea.score ?? ""))}</td>
  </tr>`;
}
function culledItem(c) {
  return `<li><code>${escapeHtml(c.id ?? "")}</code> ${escapeHtml(c.title ?? "")}${c.reason ? ` \u2014 ${escapeHtml(c.reason)}` : ""}</li>`;
}
export {
  render
};
