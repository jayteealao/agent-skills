import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  findingListItem
} from "../chunk-EG7S7OJR.mjs";
import {
  renderSimple
} from "../chunk-4NXBU6PL.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-GMBXSSP4.mjs";
import {
  artifactHeader,
  metricRow,
  stageBadge,
  statusBadge
} from "../chunk-LZJF4RCQ.mjs";
import "../chunk-LFGT2BKG.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/simplify-run.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;
  const runId = sy?.run_id ?? fm["run-id"] ?? "";
  if (!sy) {
    return renderSimple(artifact, ctx, {
      title: `Simplify \xB7 ${escapeHtml(runId)}`,
      metricFields: [
        { key: "metric-loc-removed", label: "LOC removed", tone: "ok" },
        { key: "metric-step-count", label: "steps" }
      ]
    });
  }
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Simplify \xB7 <code>${escapeHtml(runId)}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge("simplify"),
      sy.scope && `<span class="meta">scope <strong>${escapeHtml(sy.scope)}</strong></span>`,
      sy.target && `<span class="meta">target <code>${escapeHtml(sy.target)}</code></span>`,
      sy.rev != null && `<span class="meta">rev ${escapeHtml(sy.rev)}</span>`,
      fm["updated-at"] && `<span class="meta">${escapeHtml(fm["updated-at"])}</span>`
    ]
  });
  const counts = sy.counts ?? {};
  const metricsHtml = metricRow([
    { label: "reuse", value: counts.reuse ?? 0, tone: "info" },
    { label: "quality", value: counts.quality ?? 0, tone: "info" },
    { label: "efficiency", value: counts.efficiency ?? 0, tone: "info" },
    { label: "accepted", value: counts.accepted ?? 0, tone: "ok" },
    { label: "skipped", value: counts.skipped ?? 0 },
    { label: "deferred", value: counts.deferred ?? 0, tone: "warn" }
  ]);
  const summary = sy.summary ? `<aside class="simplify-summary"><p>${escapeHtml(sy.summary)}</p></aside>` : "";
  const findings = sy.findings ?? [];
  const findingsHtml = findings.length ? `<section class="simplify-findings">
        <h2 class="sdlc-h2">findings</h2>
        <ol class="finding-list finding-list-compact">
          ${findings.map(findingItem).join("")}
        </ol>
       </section>` : "";
  const deltas = sy.deltas ?? [];
  const deltasHtml = deltas.length ? `<section class="simplify-deltas">
        <h2 class="sdlc-h2">proposed deltas</h2>
        <table class="delta-table">
          <thead><tr><th>file</th><th>+</th><th>\u2212</th><th>summary</th></tr></thead>
          <tbody>${deltas.map(deltaRow).join("")}</tbody>
        </table>
       </section>` : "";
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  const bodyContent = `${fragmentBlock}${proseBlock}`;
  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${summary}${findingsHtml}${deltasHtml}${bodyContent}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
function findingItem(f) {
  const cat = f.category ?? "reuse";
  return findingListItem({
    chip: `<span class="finding-cat is-${escapeHtml(cat)}">${escapeHtml(cat)}</span>`,
    file: f.file,
    line: f.line,
    action: f.action,
    msg: f.msg,
    fix: f.fix,
    id: f.id,
    variant: "finding-compact",
    dataAttr: { name: "category", value: cat }
  });
}
function deltaRow(d) {
  const add = d.add != null ? `+${escapeHtml(d.add)}` : "";
  const rem = d.rem != null ? `\u2212${escapeHtml(d.rem)}` : "";
  return `<tr>
    <td><code>${escapeHtml(d.file ?? "")}</code></td>
    <td class="delta-add">${add}</td>
    <td class="delta-rem">${rem}</td>
    <td>${escapeHtml(d.summary ?? "")}</td>
  </tr>`;
}
export {
  render
};
