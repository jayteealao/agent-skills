import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  md2html,
  renderHistoryBlock
} from "../chunk-46VHMONS.mjs";
import {
  artifactHeader,
  metricRow,
  statusBadge
} from "../chunk-YVOPQ7Y3.mjs";
import "../chunk-LFGT2BKG.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/docs-index.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? {};
  const docs = sy.docs ?? fm.docs ?? [];
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? `Docs index \xB7 ${ctx.slug}`),
    badges: [
      statusBadge(fm.status),
      fm["run-id"] && `<span class="meta">run <code>${escapeHtml(fm["run-id"])}</code></span>`,
      fm["updated-at"] && `<span class="meta">updated ${escapeHtml(fm["updated-at"])}</span>`
    ]
  });
  const metricsHtml = metricRow([
    { label: "docs", value: docs.length, tone: docs.length ? "ok" : "warn" },
    fm["gaps-found"] != null && { label: "gaps", value: fm["gaps-found"], tone: Number(fm["gaps-found"]) ? "warn" : "ok" },
    fm["actions-completed"] != null && { label: "actions", value: fm["actions-completed"], tone: "info" }
  ].filter(Boolean));
  const docsHtml = docs.length ? `<table class="docs-index-table">
        <thead><tr><th>doc</th><th>type</th><th>status</th><th>action</th></tr></thead>
        <tbody>${docs.map(docRow).join("")}</tbody>
      </table>` : "";
  const prose = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${docsHtml}${prose}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
function docRow(doc) {
  return `<tr>
    <td><code>${escapeHtml(doc.path ?? doc.file ?? "")}</code></td>
    <td>${escapeHtml(doc.type ?? doc.quadrant ?? "")}</td>
    <td>${escapeHtml(doc.status ?? "")}</td>
    <td>${escapeHtml(doc.action ?? "")}</td>
  </tr>`;
}
export {
  render
};
