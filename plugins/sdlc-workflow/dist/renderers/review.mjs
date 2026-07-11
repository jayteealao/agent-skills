import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  verdictBlock
} from "../chunk-EG7S7OJR.mjs";
import {
  figureCanvas
} from "../chunk-PDBKNARE.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-DL2YZ5T3.mjs";
import {
  artifactHeader,
  metricRow,
  statusBadge
} from "../chunk-WSLNFNXW.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/review.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? "Review"),
    badges: [
      statusBadge(fm.status),
      fm.verdict && `<span class="meta">verdict <strong>${escapeHtml(fm.verdict)}</strong></span>`,
      fm["updated-at"] && `<span class="meta">${escapeHtml(fm["updated-at"])}</span>`
    ]
  });
  const counts = sy?.counts ?? fm.counts ?? {};
  const metricsHtml = `<div class="d-only">${metricRow([
    { label: "blocker", value: counts.blocker ?? 0, sev: "blocker" },
    { label: "high", value: counts.high ?? 0, sev: "high" },
    { label: "med", value: counts.med ?? 0, sev: "med" },
    { label: "low", value: counts.low ?? 0, sev: "low" },
    { label: "nit", value: counts.nit ?? 0, sev: "nit" }
  ])}</div><div class="m-only">${mobileSevrow(counts)}</div>`;
  const verdictHtml = sy?.verdict || fm.verdict ? verdictBlock(sy?.verdict ?? fm.verdict, sy?.verdict_label ?? fm.verdict, sy?.summary ?? fm.summary ?? "") : "";
  let figureHtml = "";
  if (sy?.dimensions?.length) {
    figureHtml = figureCanvas({
      figureNumber: 4,
      title: "Severity \xD7 dimension heatmap",
      svgInner: heatmapSvg(sy)
    });
  }
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  const bodyHtml = `${verdictHtml}${metricsHtml}${figureHtml}${fragmentBlock}${proseBlock}`;
  return {
    headerHtml,
    bodyHtml: bodyHtml + renderHistoryBlock(artifact.history),
    links: [],
    children: []
  };
}
function mobileSevrow(counts) {
  const SEVS = [["blocker", "c-blocker"], ["high", "c-high"], ["med", "c-med"], ["low", "c-low"], ["nit", "c-nit"]];
  const cells = SEVS.map(([k, cls]) => `<div class="sevcount ${cls}"><div class="n">${Number(counts[k] ?? 0)}</div><div class="k">${k}</div></div>`).join("");
  return `<div class="sevrow">${cells}</div>`;
}
function heatmapSvg(sy) {
  const SEVS = ["blocker", "high", "med", "low", "nit"];
  const SEV_COLOR = {
    blocker: "#b5305f",
    high: "#b94e3d",
    med: "#a07417",
    low: "#3e7d4a",
    nit: "#8a8377"
  };
  const dims = sy.dimensions ?? [];
  const findings = sy.findings ?? [];
  const grid = {};
  for (const d of dims) {
    grid[d.name] = { blocker: 0, high: 0, med: 0, low: 0, nit: 0 };
  }
  for (const f of findings) {
    if (grid[f.dimension] && grid[f.dimension][f.severity] != null) {
      grid[f.dimension][f.severity]++;
    }
  }
  const W = 920;
  const cellW = 110, cellH = 38, padL = 200, padT = 54;
  const sumX = padL + SEVS.length * cellW;
  const H = padT + dims.length * cellH + 12 + cellH + 16;
  const colHeaders = SEVS.map(
    (s, i) => `<text x="${padL + i * cellW + cellW / 2}" y="${padT - 18}" text-anchor="middle" font-size="10" font-weight="600" fill="${SEV_COLOR[s]}">${s.toUpperCase()}</text>
     <text x="${padL + i * cellW + cellW / 2}" y="${padT - 4}" text-anchor="middle" font-size="14" fill="${SEV_COLOR[s]}">${glyph(s)}</text>`
  ).join("") + `<text x="${sumX + (cellW - 4) / 2}" y="${padT - 9}" text-anchor="middle" font-size="11" font-weight="700" fill="#1f1b16">&#931;</text>`;
  const colTotals = { blocker: 0, high: 0, med: 0, low: 0, nit: 0 };
  let grand = 0;
  const rows = dims.map((d, ri) => {
    const y = padT + ri * cellH;
    const dimLabel = `<text x="${padL - 14}" y="${y + cellH / 2 + 4}" text-anchor="end" font-size="11" fill="#1f1b16">${escapeHtml(d.name)}</text>`;
    let rowTotal = 0;
    const cells = SEVS.map((s, ci) => {
      const x = padL + ci * cellW;
      const count = grid[d.name]?.[s] ?? 0;
      rowTotal += count;
      colTotals[s] += count;
      return heatCell(x, y, cellW, cellH, count, SEV_COLOR[s]);
    }).join("");
    grand += rowTotal;
    const sumCell = `<rect x="${sumX}" y="${y}" width="${cellW - 4}" height="${cellH - 4}" rx="3" fill="#f3f1ea" stroke="#e0dbcd" stroke-width="0.5"/>
      <text x="${sumX + (cellW - 4) / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#1f1b16">${rowTotal || ""}</text>`;
    return dimLabel + cells + sumCell;
  }).join("");
  const ty = padT + dims.length * cellH + 8;
  const rule = `<line x1="${padL - 2}" y1="${ty - 4}" x2="${sumX + cellW - 4}" y2="${ty - 4}" stroke="#cbc4b1" stroke-width="1"/>`;
  const totalsLabel = `<text x="${padL - 14}" y="${ty + cellH / 2 + 4}" text-anchor="end" font-size="10" font-weight="700" letter-spacing="1" fill="#8a8377">TOTAL</text>`;
  const totalsCells = SEVS.map((s, ci) => {
    const x = padL + ci * cellW;
    return `<text x="${x + (cellW - 4) / 2}" y="${ty + cellH / 2 + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="${SEV_COLOR[s]}">${colTotals[s] || ""}</text>`;
  }).join("") + `<text x="${sumX + (cellW - 4) / 2}" y="${ty + cellH / 2 + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="#1f1b16">${grand || ""}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Severity \xD7 dimension heatmap">
    ${colHeaders}
    ${rows}
    ${rule}${totalsLabel}${totalsCells}
  </svg>`;
}
function heatCell(x, y, cellW, cellH, count, color) {
  const op = count === 0 ? 0.04 : count === 1 ? 0.18 : count === 2 ? 0.34 : count === 3 ? 0.5 : 0.66;
  return `<rect x="${x}" y="${y}" width="${cellW - 4}" height="${cellH - 4}" rx="3" fill="${color}" fill-opacity="${op}" stroke="${color}" stroke-opacity="0.4" stroke-width="0.5"/>
    <text x="${x + (cellW - 4) / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#1f1b16">${count || ""}</text>`;
}
function glyph(sev) {
  return { blocker: "\u25CF", high: "\u25B2", med: "\u25C6", low: "\u2014", nit: "\xB7" }[sev] ?? "";
}
export {
  render
};
