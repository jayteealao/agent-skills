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
  const metricsHtml = metricRow([
    { label: 'blocker', value: counts.blocker ?? 0, sev: 'blocker' },
    { label: 'high',    value: counts.high    ?? 0, sev: 'high' },
    { label: 'med',     value: counts.med     ?? 0, sev: 'med' },
    { label: 'low',     value: counts.low     ?? 0, sev: 'low' },
    { label: 'nit',     value: counts.nit     ?? 0, sev: 'nit' },
  ]);

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

  // Find max for tint scaling
  let max = 1;
  for (const row of Object.values(grid)) {
    for (const v of Object.values(row)) max = Math.max(max, v);
  }

  const W = 800;
  const cellW = 90, cellH = 36, padL = 180, padT = 50;
  const H = padT + dims.length * cellH + 30;

  const colHeaders = SEVS.map((s, i) =>
    `<text x="${padL + i * cellW + cellW / 2}" y="${padT - 14}" text-anchor="middle" font-size="10" font-weight="600" fill="${SEV_COLOR[s]}">${s.toUpperCase()}</text>
     <text x="${padL + i * cellW + cellW / 2}" y="${padT - 2}" text-anchor="middle" font-size="14" fill="${SEV_COLOR[s]}">${glyph(s)}</text>`,
  ).join('');

  const rows = dims.map((d, ri) => {
    const y = padT + ri * cellH;
    const dimLabel = `<text x="${padL - 12}" y="${y + cellH / 2 + 4}" text-anchor="end" font-size="11" fill="#1f1b16">${escapeHtml(d.name)}</text>`;
    const cells = SEVS.map((s, ci) => {
      const x = padL + ci * cellW;
      const count = grid[d.name]?.[s] ?? 0;
      const alpha = count === 0 ? 0.05 : 0.15 + 0.7 * (count / max);
      const fill = `${SEV_COLOR[s]}`;
      return `<rect x="${x}" y="${y}" width="${cellW - 4}" height="${cellH - 4}" rx="3" fill="${fill}" fill-opacity="${alpha}" stroke="${SEV_COLOR[s]}" stroke-opacity="0.4" stroke-width="0.5"/>
        <text x="${x + (cellW - 4) / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#1f1b16">${count || ''}</text>`;
    }).join('');
    return dimLabel + cells;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Severity × dimension heatmap">
    ${colHeaders}
    ${rows}
  </svg>`;
}

function glyph(sev) {
  return { blocker: '●', high: '▲', med: '◆', low: '—', nit: '·' }[sev] ?? '';
}
