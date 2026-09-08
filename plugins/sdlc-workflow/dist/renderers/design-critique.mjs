import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  countBySeverity,
  findingListItem,
  severityChip
} from "../chunk-VQ7FT7IB.mjs";
import {
  renderSimple
} from "../chunk-BHUAUYVV.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-V35JPU6V.mjs";
import {
  artifactHeader,
  metricRow,
  stageBadge,
  statusBadge
} from "../chunk-T5KRRFZB.mjs";
import {
  escapeHtml
} from "../chunk-3RXHOXIK.mjs";
import "../chunk-EQC6XDOG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/design-critique.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;
  if (!sy && !fm["severity-distribution"]) {
    return renderSimple(artifact, ctx, { title: fm.title ?? "Design critique" });
  }
  const severity = sy ? countBySeverity(sy.findings ?? []) : fm["severity-distribution"];
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? "Design critique"),
    badges: [
      statusBadge(fm.status),
      stageBadge("design-critique"),
      fm.scope && `<span class="meta">${escapeHtml(fm.scope)}</span>`,
      fm["updated-at"] && `<span class="meta">${escapeHtml(fm["updated-at"])}</span>`
    ]
  });
  const metricsHtml = metricRow([
    { label: "blocker", value: severity.blocker ?? 0, sev: "blocker" },
    { label: "high", value: severity.high ?? 0, sev: "high" },
    { label: "medium", value: severity.medium ?? 0, sev: "med" },
    { label: "low", value: severity.low ?? 0, sev: "low" },
    { label: "nit", value: severity.nit ?? 0, sev: "nit" }
  ]);
  const summaryHtml = sy?.summary ? `<p class="sdlc-lede">${escapeHtml(sy.summary)}</p>` : "";
  const findingsHtml = sy?.findings?.length && !artifact.fragment ? `<section class="findings design-critique-findings">
        <h2 class="sdlc-h2">findings</h2>
        <ol class="finding-list">${sy.findings.map(findingItem).join("")}</ol>
       </section>` : "";
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${summaryHtml}${fragmentBlock}${findingsHtml}${proseBlock}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
function findingItem(finding) {
  const cssSeverity = finding.severity === "medium" ? "med" : finding.severity;
  return findingListItem({
    chip: severityChip(cssSeverity, finding.severity),
    file: finding.where,
    msg: finding.observation,
    fix: finding.recommendation,
    id: finding.id,
    dataAttr: { name: "severity", value: finding.severity ?? "" }
  });
}
export {
  render
};
