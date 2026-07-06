import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  callout
} from "../chunk-EG7S7OJR.mjs";
import {
  renderSimple
} from "../chunk-XQ2EFIXM.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-QQFROAJG.mjs";
import {
  figureCanvas
} from "../chunk-PDBKNARE.mjs";
import {
  artifactHeader,
  metricRow,
  stageBadge,
  statusBadge
} from "../chunk-2JLFPKO5.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/profile.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;
  const runId = sy?.run_id ?? fm["run-id"] ?? "";
  if (!sy) {
    return renderSimple(artifact, ctx, {
      title: `Profile \xB7 ${escapeHtml(runId)}`
    });
  }
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Profile \xB7 <code>${escapeHtml(runId)}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge("profile"),
      sy.target && `<span class="meta">target <code>${escapeHtml(sy.target)}</code></span>`,
      sy.method && `<span class="meta">method <strong>${escapeHtml(sy.method)}</strong></span>`,
      sy.confidence && `<span class="meta">confidence ${escapeHtml(sy.confidence)}</span>`,
      sy.measured_at && `<span class="meta">${escapeHtml(sy.measured_at)}</span>`
    ]
  });
  const candidates = sy.optimization_candidates ?? [];
  const metricsHtml = metricRow([
    { label: "hotspots", value: (sy.hotspots ?? []).length },
    { label: "candidates", value: candidates.length, tone: candidates.length ? "ok" : void 0 },
    sy.comparisons?.length && { label: "comparisons", value: sy.comparisons.length, tone: "info" }
  ].filter(Boolean));
  const hotspotsHtml = (sy.hotspots ?? []).length ? `<section class="profile-hotspots">
        <h2 class="sdlc-h2">hotspots</h2>
        <table class="hotspot-table">
          <thead><tr><th>id</th><th>function</th><th>file</th><th>cost</th><th>candidate</th></tr></thead>
          <tbody>${sy.hotspots.map(hotspotRow).join("")}</tbody>
        </table>
       </section>` : "";
  const comparisonsHtml = sy.comparisons?.length ? figureCanvas({
    figureNumber: 1,
    title: "Before / after",
    svgInner: comparisonFigure(sy.comparisons),
    legend: [
      { swatch: "#cbc4b1", label: "before" },
      { swatch: "#3e7d4a", label: "after \u2014 improved" },
      { swatch: "#b5305f", label: "after \u2014 regressed" }
    ]
  }) : "";
  const candidatesHtml = candidates.length ? `<section class="profile-candidates">
        <h2 class="sdlc-h2">optimization candidates</h2>
        ${candidates.map(candidateCard).join("")}
       </section>` : "";
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  const bodyContent = `${fragmentBlock}${proseBlock}`;
  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${hotspotsHtml}${comparisonsHtml}${candidatesHtml}${bodyContent}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
function hotspotRow(h) {
  const cost = `${Number(h.cost_pct).toFixed(1)}%`;
  const cand = h.candidate ? '<span class="hotspot-cand is-yes" aria-label="candidate">\u2713</span>' : '<span class="hotspot-cand is-no" aria-label="not a candidate">\u2014</span>';
  const loc = h.file ? `<code>${escapeHtml(h.file)}${h.line != null ? `:${escapeHtml(h.line)}` : ""}</code>` : "";
  return `<tr>
    <td><code>${escapeHtml(h.id ?? "")}</code></td>
    <td>${escapeHtml(h.function ?? "")}</td>
    <td>${loc}</td>
    <td class="hotspot-cost">${cost}</td>
    <td class="hotspot-cand-cell">${cand}</td>
  </tr>`;
}
function candidateCard(c) {
  const gain = c.estimated_gain_pct != null ? `<span class="cand-gain">est. ${Number(c.estimated_gain_pct).toFixed(1)}%</span>` : "";
  const conf = c.confidence ? `<span class="cand-conf is-${escapeHtml(c.confidence)}">${escapeHtml(c.confidence)} confidence</span>` : "";
  return callout(
    "info",
    `${escapeHtml(c.id)}${c.hotspot ? ` \u2192 ${escapeHtml(c.hotspot)}` : ""}`,
    `<p>${escapeHtml(c.intent ?? "")}</p><p class="cand-meta">${gain}${conf}</p>`
  );
}
function comparisonFigure(comparisons) {
  const W = 980, padX = 100, rowH = 50;
  const H = comparisons.length * rowH + 30;
  const barAreaW = W - padX - 220;
  const rows = comparisons.map((c, i) => {
    const y = 20 + i * rowH;
    const before = Number(c.before);
    const after = Number(c.after);
    const max = Math.max(before, after, 1e-4);
    const beforeW = before / max * barAreaW;
    const afterW = after / max * barAreaW;
    const isLower = c.direction !== "higher-is-better";
    const improved = isLower ? after < before : after > before;
    const afterColor = improved ? "#3e7d4a" : "#b5305f";
    const deltaPct = before === 0 ? 0 : (after - before) / before * 100;
    const deltaSign = deltaPct > 0 ? "+" : "";
    const deltaLabel = `${deltaSign}${deltaPct.toFixed(1)}%`;
    const unit = c.unit ? ` ${escapeHtml(c.unit)}` : "";
    return `<g>
      <text x="${padX - 8}" y="${y + 16}" text-anchor="end" font-size="11" fill="#1f1b16">${escapeHtml(c.metric)}</text>
      <rect x="${padX}" y="${y + 4}" width="${beforeW}" height="12" fill="#cbc4b1"/>
      <text x="${padX + beforeW + 6}" y="${y + 14}" font-size="10" fill="#4a443c">${before}${unit}</text>
      <rect x="${padX}" y="${y + 22}" width="${afterW}" height="12" fill="${afterColor}"/>
      <text x="${padX + afterW + 6}" y="${y + 32}" font-size="10" fill="${afterColor}" font-weight="600">${after}${unit} (${deltaLabel})</text>
    </g>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Before / after benchmark comparison">${rows}</svg>`;
}
export {
  render
};
