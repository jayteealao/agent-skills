// renderers/slice-index.mjs — Figure 5 (Slice grid) + per-slice card list.
// Card anatomy and the dependency-graph figure live in _cards.mjs (shared with
// implement-index / plan-index); this file maps slice frontmatter onto them.

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, metricRow } from './_shell.mjs';
import { figureCanvas } from './_figure.mjs';
import { escapeHtml } from './_validator.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { sliceCard, sliceState, sliceGridFigure, countPart, blockerPart } from './_cards.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  // The index's own `slices[]` roster carries the authoritative per-slice status;
  // the leaf slice-stage files only carry their slicing status (`defined`), which
  // would report every slice as not-started. Overlay the roster status onto each
  // leaf so counts, the grid, and cards reflect real progress while keeping the
  // leaf's richer per-slice metadata (files-touched, reviews, blockers).
  const rosterStatus = new Map(
    (Array.isArray(fm.slices) ? fm.slices : [])
      .filter((s) => s && s.slug)
      .map((s) => [s.slug, s.status]),
  );
  const slices = (ctx.allArtifacts?.slice ?? []).map((s) => {
    const slug = s.frontmatter?.['slice-slug'] ?? s.frontmatter?.slug ?? s.storageRel;
    const f = s.frontmatter ?? {};
    return { slug, fm: rosterStatus.has(slug) ? { ...f, status: rosterStatus.get(slug) } : f };
  });

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? 'Slice index'),
    badges: [
      statusBadge(fm.status),
      `<span class="meta">${slices.length} slice${slices.length === 1 ? '' : 's'}</span>`,
    ],
  }) + metricRow([
    { label: 'total',       value: slices.length },
    { label: 'complete',    value: slices.filter((s) => sliceState(s.fm.status) === 'complete').length, tone: 'ok' },
    { label: 'in progress', value: slices.filter((s) => sliceState(s.fm.status) === 'in-progress').length },
    { label: 'blocked',     value: slices.filter((s) => sliceState(s.fm.status) === 'blocked').length, tone: 'bad' },
  ]);

  const figureHtml = figureCanvas({
    figureNumber: 5,
    title: `${slices.length} slice${slices.length === 1 ? '' : 's'}, depends-on arrows · slice dependency graph`,
    svgInner: sliceGridFigure(slices),
    legend: [
      { state: 'complete', label: 'complete' },
      { state: 'review',   label: 'in review' },
      { state: 'blocked',  label: 'blocked' },
      { state: 'queued',   label: 'queued' },
    ],
  });

  const cards = slices.map(({ slug, fm: f }) => {
    const blockers = Number(f.blockers ?? f['blocker-count'] ?? (sliceState(f.status) === 'blocked' ? 1 : 0)) || 0;
    return sliceCard({
      slug,
      fm: f,
      meta: [
        countPart(f['files-touched'] ?? f['metric-files-to-touch'] ?? f.files, 'file'),
        countPart(f['review-count'] ?? f.reviews, 'review'),
        blockerPart(blockers),
      ],
    });
  }).join('');
  const proseHtml = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : '';

  // Dual-DOM (M-SLC-03): the slice-grid figure is illegible at phone width, so
  // it's desktop-only — phones fall to the always-present card list below, which
  // already reflows to the mobile slice-card spec (M-S5).
  const bodyHtml = `
    <div class="d-only">${figureHtml}</div>
    ${proseHtml}
    <section class="slice-grid">${cards}</section>
    ${renderHistoryBlock(artifact.history)}
  `;

  return { headerHtml, bodyHtml, links: [], children: [] };
}
