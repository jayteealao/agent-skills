// renderers/slice-index.mjs — Figure 5 (Slice grid) + per-slice card list.

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, metricRow } from './_shell.mjs';
import { figureCanvas } from './_figure.mjs';
import { escapeHtml } from './_validator.mjs';
import { pageHref } from './_paths.mjs';
import { renderHistoryBlock } from './_history.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const slices = (ctx.allArtifacts?.slice ?? []).map((s) => ({
    slug: s.frontmatter?.['slice-slug'] ?? s.frontmatter?.slug ?? s.storageRel,
    fm: s.frontmatter ?? {},
  }));

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? 'Slice index'),
    badges: [
      statusBadge(fm.status),
      `<span class="meta">${slices.length} slice${slices.length === 1 ? '' : 's'}</span>`,
    ],
  }) + metricRow([
    { label: 'total',    value: slices.length },
    { label: 'complete', value: slices.filter((s) => s.fm.status === 'complete').length, tone: 'ok' },
    { label: 'active',   value: slices.filter((s) => s.fm.status === 'active').length },
    { label: 'blocked',  value: slices.filter((s) => s.fm.status === 'blocked').length, tone: 'bad' },
  ]);

  const figureHtml = figureCanvas({
    figureNumber: 5,
    title: 'Slice grid',
    svgInner: sliceGridFigure(slices),
    legend: [
      { swatch: '#3e7d4a', label: 'complete' },
      { swatch: '#4a6c8c', label: 'active' },
      { swatch: '#b5305f', label: 'blocked' },
    ],
  });

  const cards = slices.map((s) => sliceCard(s)).join('');
  const proseHtml = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : '';

  const bodyHtml = `
    ${figureHtml}
    ${proseHtml}
    <section class="slice-grid">${cards}</section>
    ${renderHistoryBlock(artifact.history)}
  `;

  return { headerHtml, bodyHtml, links: [], children: [] };
}

function sliceCard({ slug, fm }) {
  const tone = fm.status === 'complete' ? 'is-ok'
             : fm.status === 'blocked'  ? 'is-bad'
             : fm.status === 'active'   ? 'is-current'
             : '';
  return `<a class="slice-card ${tone}" href="${escapeHtml(pageHref(slug))}">
    <span class="slice-slug"><code>${escapeHtml(slug)}</code></span>
    <span class="slice-title">${escapeHtml(fm.title ?? '')}</span>
    <span class="slice-status">${statusBadge(fm.status)}</span>
  </a>`;
}

function sliceGridFigure(slices) {
  if (!slices.length) {
    return `<svg viewBox="0 0 600 80" width="100%"><text x="300" y="44" text-anchor="middle" fill="#8a8377" font-size="13">No slices yet</text></svg>`;
  }
  const W = 980;
  const cols = Math.min(4, slices.length);
  const cellW = (W - 60) / cols;
  const cellH = 70;
  const rows = Math.ceil(slices.length / cols);
  const H = 30 + rows * (cellH + 12);
  const cells = slices.map((s, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = 30 + col * cellW, y = 20 + row * (cellH + 12);
    const fill = s.fm.status === 'complete' ? '#ecf3e7'
               : s.fm.status === 'blocked'  ? '#fbeaf0'
               : s.fm.status === 'active'   ? '#e9eef4'
               : '#fbfaf6';
    const stroke = s.fm.status === 'complete' ? '#3e7d4a'
                 : s.fm.status === 'blocked'  ? '#b5305f'
                 : s.fm.status === 'active'   ? '#4a6c8c'
                 : '#cbc4b1';
    return `<rect x="${x}" y="${y}" width="${cellW - 8}" height="${cellH}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
      <text x="${x + 14}" y="${y + 26}" font-size="11" font-weight="600" fill="#1f1b16">${escapeHtml((s.slug || '').slice(0, 22))}</text>
      <text x="${x + 14}" y="${y + 48}" font-size="10" fill="#4a443c">${escapeHtml((s.fm.title || '').slice(0, 28))}</text>
      <text x="${x + 14}" y="${y + 62}" font-size="9" fill="#8a8377">${escapeHtml(s.fm.status ?? '')}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Slice grid">${cells}</svg>`;
}
