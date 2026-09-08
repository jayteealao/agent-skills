import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  countBySeverity,
  findingListItem,
  normalizeVerdict,
  severityChip,
  verdictBlock
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

// renderers/design-audit.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;
  if (!sy && !fm["severity-distribution"]) {
    return renderSimple(artifact, ctx, { title: fm.title ?? "Design audit" });
  }
  const severity = sy ? countBySeverity(sy.violations ?? [], ["blocker", "high", "medium", "low"]) : fm["severity-distribution"];
  const verdict = sy?.verdict ?? fm.verdict;
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? "Design audit"),
    badges: [
      statusBadge(fm.status),
      stageBadge("design-audit"),
      verdict && `<span class="meta">verdict <strong>${escapeHtml(verdict)}</strong></span>`,
      fm["remediation-state"] && `<span class="meta">remediation ${escapeHtml(fm["remediation-state"])}</span>`
    ]
  });
  const metricsHtml = metricRow([
    { label: "blocker", value: severity.blocker ?? 0, sev: "blocker" },
    { label: "high", value: severity.high ?? 0, sev: "high" },
    { label: "medium", value: severity.medium ?? 0, sev: "med" },
    { label: "low", value: severity.low ?? 0, sev: "low" }
  ]);
  const verdictHtml = verdict ? verdictBlock(normalizeVerdict(verdict), verdict, auditedAgainst(sy ?? fm)) : "";
  const violationsHtml = sy?.violations?.length && !artifact.fragment ? `<section class="findings design-audit-violations">
        <h2 class="sdlc-h2">violations</h2>
        <ol class="finding-list">${sy.violations.map(violationItem).join("")}</ol>
       </section>` : "";
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  return {
    headerHtml,
    bodyHtml: `${verdictHtml}${metricsHtml}${fragmentBlock}${violationsHtml}${proseBlock}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
function violationItem(violation) {
  const cssSeverity = violation.severity === "medium" ? "med" : violation.severity;
  return findingListItem({
    chip: severityChip(cssSeverity, violation.severity),
    file: violation.where,
    action: violation["remediation-status"],
    msg: `${violation["token-or-rule"]}: ${violation.observation}`,
    fix: violation.recommendation,
    id: violation.id,
    dataAttr: { name: "severity", value: violation.severity ?? "" }
  });
}
function auditedAgainst(data) {
  const refs = data["audited-against"] ?? [];
  const list = Array.isArray(refs) ? refs.join(", ") : refs;
  return list ? `Audited against ${escapeHtml(list)}.` : "";
}
export {
  render
};
