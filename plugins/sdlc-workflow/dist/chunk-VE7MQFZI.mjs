import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  callout
} from "./chunk-EG7S7OJR.mjs";
import {
  renderSimple
} from "./chunk-Z3W3RYFH.mjs";
import {
  md2html,
  renderHistoryBlock
} from "./chunk-AKKKWSVJ.mjs";
import {
  artifactHeader,
  metricRow,
  stageBadge,
  statusBadge
} from "./chunk-O3Y7YWP4.mjs";
import {
  escapeHtml
} from "./chunk-4WRIEOIP.mjs";

// renderers/instrument.mjs
function render(artifact, ctx) {
  if (!artifact.siblingYaml) {
    return renderSimple(artifact, ctx, {
      title: `Instrument \xB7 ${artifact.frontmatter?.["instrumentation-framework"] ?? artifact.frontmatter?.title ?? ""}`
    });
  }
  return renderInstrument(artifact, ctx);
}
function renderInstrument(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? {};
  const darkPaths = sy.dark_paths ?? sy["dark-paths"] ?? [];
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Instrument \xB7 <code>${escapeHtml(sy.framework ?? fm["instrumentation-framework"] ?? fm.title ?? "")}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge("instrument"),
      sy.framework && `<span class="meta">${escapeHtml(sy.framework)}</span>`
    ]
  });
  const metricsHtml = metricRow([
    { label: "signals", value: (sy.signals ?? []).length },
    { label: "dark paths", value: darkPaths.length, tone: darkPaths.length ? "warn" : "ok" },
    sy.pii_warnings != null && { label: "PII warnings", value: sy.pii_warnings, tone: sy.pii_warnings ? "bad" : "ok" }
  ].filter(Boolean));
  const signalsHtml = (sy.signals ?? []).length ? `<section class="aug-result aug-instrument-signals">
        <h2 class="sdlc-h2">signals</h2>
        <table class="signal-table">
          <thead><tr><th>name</th><th>type</th><th>labels</th><th>where emitted</th><th>PII</th></tr></thead>
          <tbody>${sy.signals.map((signal) => `
            <tr>
              <td>${escapeHtml(signal.name)}</td>
              <td><span class="signal-kind is-${escapeHtml(signal.kind ?? signal.type)}">${escapeHtml(signal.kind ?? signal.type)}</span></td>
              <td>${escapeHtml(formatLabels(signal.labels))}</td>
              <td>${escapeHtml(signal.where_emitted ?? signal["where-emitted"] ?? signal.path ?? "")}</td>
              <td>${signal.pii ? '<span class="signal-pii">yes</span>' : "-"}</td>
            </tr>`).join("")}
          </tbody>
        </table>
       </section>` : "";
  const darkHtml = darkPaths.length ? `<section class="aug-result aug-instrument-dark">
        <h2 class="sdlc-h2">dark paths</h2>
        ${darkPaths.map((path) => callout("warn", path.path ?? path.where ?? "", `<p>${escapeHtml(path.reason ?? path.body ?? "")}</p>`)).join("")}
       </section>` : "";
  const dashboards = sy.dashboards ?? [];
  const dashboardsHtml = dashboards.length ? `<section class="aug-result aug-instrument-dashboards">
        <h2 class="sdlc-h2">dashboards</h2>
        <ul>${dashboards.map((dashboard) => `<li><code>${escapeHtml(dashboard.name ?? dashboard.title ?? dashboard)}</code>${dashboard.url ? ` \xB7 <span>${escapeHtml(dashboard.url)}</span>` : ""}</li>`).join("")}</ul>
       </section>` : "";
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${signalsHtml}${darkHtml}${dashboardsHtml}${fragmentBlock}${proseBlock}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
function formatLabels(labels) {
  if (!labels) return "";
  if (Array.isArray(labels)) return labels.join(", ");
  if (typeof labels === "object") return Object.entries(labels).map(([key, value]) => `${key}=${value}`).join(", ");
  return String(labels);
}

export {
  render
};
