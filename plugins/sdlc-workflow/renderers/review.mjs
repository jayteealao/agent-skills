// renderers/review.mjs — Figure 4 (Severity × dimension heatmap) + review body.
// When sibling .yaml + .html.fragment land, the fragment takes over the body
// (filterable findings table, verdict block, etc.).

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { figureCanvas } from './_figure.mjs';
import { verdictBlock } from './_icons.mjs';
import { escapeHtml } from './_validator.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? 'Review'),
    badges: [
      statusBadge(fm.status),
      fm.verdict && `<span class="meta">verdict <strong>${escapeHtml(fm.verdict)}</strong></span>`,
      fm['updated-at'] && `<span class="meta">${escapeHtml(fm['updated-at'])}</span>`,
    ],
  });

  const counts = sy?.counts ?? fm.counts ?? {};
  // Dual-DOM (M-S4): the 5-cell metric grid wraps jaggedly on phones, so <=480px
  // gets the scrollable severity-summary row instead (M-REV-03/09). The
  // filterable finding cards are the interactive fragment's job, not the renderer.
  const metricsHtml = `<div class="d-only">${metricRow([
    { label: 'blocker', value: counts.blocker ?? 0, sev: 'blocker' },
    { label: 'high',    value: counts.high    ?? 0, sev: 'high' },
    { label: 'med',     value: counts.med     ?? 0, sev: 'med' },
    { label: 'low',     value: counts.low     ?? 0, sev: 'low' },
    { label: 'nit',     value: counts.nit     ?? 0, sev: 'nit' },
  ])}</div><div class="m-only">${mobileSevrow(counts)}</div>`;

  const verdictHtml = sy?.verdict || fm.verdict
    ? verdictBlock(sy?.verdict ?? fm.verdict, sy?.verdict_label ?? fm.verdict, sy?.summary ?? fm.summary ?? '')
    : '';

  let figureHtml = '';
  if (sy?.dimensions?.length) {
    figureHtml = figureCanvas({
      figureNumber: 4,
      title: 'Severity × dimension heatmap',
      svgInner: heatmapSvg(sy),
    });
  }

  // v9.24.0: markdown body always rendered alongside fragment (if present).
  // Verdict/metrics/figure chrome render in either case.
  const fragmentBlock = artifact.fragment
    ? `<div class="fragment">${artifact.fragment}</div>` : '';
  const proseBlock = artifact.body
    ? `<div class="prose">${md2html(artifact.body)}</div>` : '';
  const bodyHtml = `${verdictHtml}${metricsHtml}${figureHtml}${fragmentBlock}${proseBlock}`;

  return {
    headerHtml,
    bodyHtml: bodyHtml + renderHistoryBlock(artifact.history),
    links: [], children: [],
  };
}

// Mobile review (M-S3 / 5b): a horizontally-scrollable severity summary row.
function mobileSevrow(counts) {
  const SEVS = [['blocker', 'c-blocker'], ['high', 'c-high'], ['med', 'c-med'], ['low', 'c-low'], ['nit', 'c-nit']];
  const cells = SEVS.map(([k, cls]) =>
    `<div class="sevcount ${cls}"><div class="n">${Number(counts[k] ?? 0)}</div><div class="k">${k}</div></div>`).join('');
  return `<div class="sevrow">${cells}</div>`;
}

function heatmapSvg(sy) {
  const SEVS = ['blocker', 'high', 'med', 'low', 'nit'];
  const SEV_COLOR = {
    blocker: '#b5305f', high: '#b94e3d', med: '#a07417', low: '#3e7d4a', nit: '#8a8377',
  };
  const dims = sy.dimensions ?? [];
  const findings = sy.findings ?? [];

  // Compute cell counts: rows = dimensions, cols = severities
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
  const sumX = padL + SEVS.length * cellW;                 // Σ totals column (D6.10)
  const H = padT + dims.length * cellH + 12 + cellH + 16;  // + totals row

  const colHeaders = SEVS.map((s, i) =>
    `<text x="${padL + i * cellW + cellW / 2}" y="${padT - 18}" text-anchor="middle" font-size="10" font-weight="600" fill="${SEV_COLOR[s]}">${s.toUpperCase()}</text>
     <text x="${padL + i * cellW + cellW / 2}" y="${padT - 4}" text-anchor="middle" font-size="14" fill="${SEV_COLOR[s]}">${glyph(s)}</text>`,
  ).join('') + `<text x="${sumX + (cellW - 4) / 2}" y="${padT - 9}" text-anchor="middle" font-size="11" font-weight="700" fill="#1f1b16">&#931;</text>`;

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
    }).join('');
    grand += rowTotal;
    const sumCell = `<rect x="${sumX}" y="${y}" width="${cellW - 4}" height="${cellH - 4}" rx="3" fill="#f3f1ea" stroke="#e0dbcd" stroke-width="0.5"/>
      <text x="${sumX + (cellW - 4) / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#1f1b16">${rowTotal || ''}</text>`;
    return dimLabel + cells + sumCell;
  }).join('');

  // Totals row (D6.10): a hairline rule then per-severity + grand totals.
  const ty = padT + dims.length * cellH + 8;
  const rule = `<line x1="${padL - 2}" y1="${ty - 4}" x2="${sumX + cellW - 4}" y2="${ty - 4}" stroke="#cbc4b1" stroke-width="1"/>`;
  const totalsLabel = `<text x="${padL - 14}" y="${ty + cellH / 2 + 4}" text-anchor="end" font-size="10" font-weight="700" letter-spacing="1" fill="#8a8377">TOTAL</text>`;
  const totalsCells = SEVS.map((s, ci) => {
    const x = padL + ci * cellW;
    return `<text x="${x + (cellW - 4) / 2}" y="${ty + cellH / 2 + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="${SEV_COLOR[s]}">${colTotals[s] || ''}</text>`;
  }).join('') + `<text x="${sumX + (cellW - 4) / 2}" y="${ty + cellH / 2 + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="#1f1b16">${grand || ''}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Severity × dimension heatmap">
    ${colHeaders}
    ${rows}
    ${rule}${totalsLabel}${totalsCells}
  </svg>`;
}

// Curated stepped tint (D6.14) — hand-tuned opacity steps per count rather than
// a continuous count/max ramp, so a 1-finding cell reads distinctly from a 4.
function heatCell(x, y, cellW, cellH, count, color) {
  const op = count === 0 ? 0.04 : count === 1 ? 0.18 : count === 2 ? 0.34 : count === 3 ? 0.5 : 0.66;
  return `<rect x="${x}" y="${y}" width="${cellW - 4}" height="${cellH - 4}" rx="3" fill="${color}" fill-opacity="${op}" stroke="${color}" stroke-opacity="0.4" stroke-width="0.5"/>
    <text x="${x + (cellW - 4) / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#1f1b16">${count || ''}</text>`;
}

function glyph(sev) {
  return { blocker: '●', high: '▲', med: '◆', low: '—', nit: '·' }[sev] ?? '';
}
