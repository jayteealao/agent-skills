import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  findingListItem,
  severityChip,
  verdictBlock
} from "./chunk-EG7S7OJR.mjs";
import {
  renderSimple
} from "./chunk-K6PIKTF7.mjs";
import {
  md2html,
  renderHistoryBlock
} from "./chunk-7C3X3TLC.mjs";
import {
  artifactHeader,
  metricRow,
  stageBadge,
  statusBadge
} from "./chunk-P6EMQ23V.mjs";
import {
  escapeHtml
} from "./chunk-4WRIEOIP.mjs";

// renderers/review-dimension.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;
  const dimension = sy?.dimension ?? fm.dimension ?? fm["review-command"] ?? fm.command ?? "";
  if (!sy) {
    return renderSimple(artifact, ctx, {
      title: `Review \xB7 ${escapeHtml(dimension)}`,
      metricFields: [
        { key: "metric-finding-count", label: "findings" },
        { key: "metric-blocker-count", label: "blockers", sev: "blocker" }
      ]
    });
  }
  const verdict = normalizeVerdict(sy.verdict);
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Review \xB7 <code>${escapeHtml(dimension)}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge("review-dimension"),
      sy.verdict && `<span class="meta">verdict <strong>${escapeHtml(sy.verdict)}</strong></span>`,
      sy.rev != null && `<span class="meta">rev ${escapeHtml(sy.rev)}</span>`,
      fm["updated-at"] && `<span class="meta">${escapeHtml(fm["updated-at"])}</span>`
    ]
  });
  const counts = sy.counts ?? deriveCounts(sy.findings ?? []);
  const metricsHtml = metricRow([
    { label: "blocker", value: counts.blocker ?? 0, sev: "blocker" },
    { label: "high", value: counts.high ?? 0, sev: "high" },
    { label: "med", value: counts.med ?? counts.medium ?? 0, sev: "med" },
    { label: "low", value: counts.low ?? 0, sev: "low" },
    { label: "nit", value: counts.nit ?? 0, sev: "nit" }
  ]);
  const verdictHtml = sy.verdict ? verdictBlock(verdict, sy.verdict_label ?? sy.verdict, sy.summary ?? "") : "";
  const findings = (sy.findings ?? []).filter((finding) => !finding.dimension || finding.dimension === dimension);
  const findingsHtml = findings.length ? `<section class="findings findings-${escapeHtml(dimension)}">
        <h2 class="sdlc-h2">findings</h2>
        <ol class="finding-list">${findings.map(findingItem).join("")}</ol>
       </section>` : "";
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
  const findingsBlock = artifact.fragment ? "" : findingsHtml;
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  return {
    headerHtml,
    bodyHtml: `${verdictHtml}${metricsHtml}${fragmentBlock}${findingsBlock}${proseBlock}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
function deriveCounts(findings) {
  const out = { blocker: 0, high: 0, med: 0, low: 0, nit: 0 };
  for (const finding of findings) {
    const key = finding.severity === "medium" ? "med" : finding.severity;
    if (out[key] != null) out[key]++;
  }
  return out;
}
function findingItem(finding) {
  const severity = finding.severity === "medium" ? "med" : finding.severity;
  return findingListItem({
    chip: severityChip(severity, finding.severity),
    file: finding.file,
    line: finding.line,
    action: finding.action,
    msg: finding.msg ?? finding.finding ?? finding.observation,
    fix: finding.fix ?? finding.recommendation,
    id: finding.id,
    dataAttr: { name: "severity", value: finding.severity ?? "" }
  });
}
function normalizeVerdict(verdict) {
  if (verdict === "pass") return "ship";
  if (verdict === "conditional") return "caveats";
  if (verdict === "fail") return "no";
  return verdict;
}

export {
  render
};
