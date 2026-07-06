import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  callout
} from "./chunk-EG7S7OJR.mjs";
import {
  renderSimple
} from "./chunk-XQ2EFIXM.mjs";
import {
  md2html,
  renderHistoryBlock
} from "./chunk-QQFROAJG.mjs";
import {
  artifactHeader,
  metricRow,
  stageBadge,
  statusBadge
} from "./chunk-2JLFPKO5.mjs";
import {
  escapeHtml
} from "./chunk-4WRIEOIP.mjs";

// renderers/benchmark.mjs
function render(artifact, ctx) {
  if (!artifact.siblingYaml) {
    return renderSimple(artifact, ctx, {
      title: `Benchmark \xB7 ${artifact.frontmatter?.title ?? artifact.frontmatter?.mode ?? ""}`
    });
  }
  return renderBenchmark(artifact, ctx);
}
function renderBenchmark(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? {};
  const metrics = normalizeMetrics(sy);
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Benchmark \xB7 <code>${escapeHtml(sy.target ?? fm.title ?? "")}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge("benchmark"),
      sy.mode && `<span class="meta">mode <strong>${escapeHtml(sy.mode)}</strong></span>`,
      sy.framework && `<span class="meta">${escapeHtml(sy.framework)}</span>`,
      sy.language && `<span class="meta">${escapeHtml(sy.language)}</span>`,
      sy.measured_at && `<span class="meta">${escapeHtml(sy.measured_at)}</span>`
    ]
  });
  const metricsHtml = metricRow([
    { label: "metrics", value: metrics.length },
    sy.improvements?.length && { label: "improvements", value: sy.improvements.length, tone: "ok" },
    sy.regressions?.length && { label: "regressions", value: sy.regressions.length, tone: "bad" }
  ].filter(Boolean));
  const source = sy.source ?? sy.target_path ?? sy.target;
  const sourceHtml = source ? `<p class="sdlc-crumb">source <code>${escapeHtml(source)}</code></p>` : "";
  const metricsTable = metrics.length ? `<section class="aug-result aug-benchmark">
        <h2 class="sdlc-h2">metrics</h2>
        <table class="benchmark-table">
          <thead><tr><th>metric</th><th>before</th><th>after</th><th>delta</th></tr></thead>
          <tbody>${metrics.map(benchmarkRow).join("")}</tbody>
        </table>
       </section>` : "";
  const commands = sy["commands-run"] ?? sy.commands_run ?? sy.commands ?? [];
  const commandsHtml = commands.length ? `<section class="aug-result aug-benchmark-commands">
        <h2 class="sdlc-h2">commands run</h2>
        <pre><code>${escapeHtml(commands.join("\n"))}</code></pre>
       </section>` : "";
  const notes = sy.notes ? callout("info", "notes", `<p>${escapeHtml(sy.notes)}</p>`) : "";
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${sourceHtml}${metricsTable}${commandsHtml}${notes}${fragmentBlock}${proseBlock}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
function normalizeMetrics(sy) {
  if (Array.isArray(sy.metrics)) return sy.metrics;
  const baseline = sy.baseline?.metrics ?? [];
  const comparison = sy.comparison?.metrics ?? [];
  const byName = new Map(baseline.map((metric) => [metric.name, metric]));
  return comparison.map((metric) => ({
    name: metric.name,
    before: byName.get(metric.name)?.value,
    after: metric.value,
    unit: metric.unit ?? byName.get(metric.name)?.unit,
    delta_pct: metric["delta-pct"] ?? metric.delta_pct,
    verdict: metric.verdict,
    direction: metric.direction
  }));
}
function benchmarkRow(metric) {
  const before = numberOrNull(metric.before);
  const after = numberOrNull(metric.after);
  const delta = metric.delta_pct != null ? Number(metric.delta_pct) : before == null || before === 0 || after == null ? 0 : (after - before) / before * 100;
  const isLower = metric.direction !== "higher-is-better";
  const improved = metric.verdict ? ["pass", "improved", "ok"].includes(String(metric.verdict)) : isLower ? delta < 0 : delta > 0;
  const tone = improved ? "is-ok" : delta === 0 ? "" : "is-bad";
  const sign = delta > 0 ? "+" : "";
  const unit = metric.unit ? ` ${escapeHtml(metric.unit)}` : "";
  const beforeCell = before == null ? "-" : `${before}${unit}`;
  const afterCell = after == null ? "-" : `${after}${unit}`;
  return `<tr>
    <td>${escapeHtml(metric.name ?? "")}</td>
    <td>${beforeCell}</td>
    <td>${afterCell}</td>
    <td class="delta-cell ${tone}">${sign}${delta.toFixed(1)}%</td>
  </tr>`;
}
function numberOrNull(value) {
  if (value === void 0 || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export {
  render
};
