// renderers/implement-index.mjs — per-slice implementation logs as a slice-card
// grid (its own bucket: allArtifacts.implement, distinct from the slice index).
// Decision 4: full sc-* anatomy + Figure 5, sourced from the implement logs.

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, metricRow } from './_shell.mjs';
import { figureCanvas } from './_figure.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { escapeHtml } from './_validator.mjs';
import { sliceCard, sliceState, sliceGridFigure, countPart, blockerPart } from './_cards.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const impl = ctx.allArtifacts?.implement ?? [];

  // depends-on lives on the slice artifact, not the implement log; borrow it so
  // Figure 5 can draw real dependency edges between implementation logs.
  const dependsBySlug = new Map();
  for (const s of (ctx.allArtifacts?.slice ?? [])) {
    const sl = s.frontmatter?.['slice-slug'] ?? s.frontmatter?.slug;
    if (sl) dependsBySlug.set(sl, s.frontmatter?.['depends-on']);
  }

  const items = impl.map((s) => {
    const f = s.frontmatter ?? {};
    const slug = f['slice-slug'] ?? f.slug ?? s.storageRel ?? '';
    const deps = Array.isArray(f['depends-on']) ? f['depends-on'] : dependsBySlug.get(slug);
    return { slug, fm: deps ? { ...f, 'depends-on': deps } : f };
  });

  const done = items.filter((s) => sliceState(s.fm.status) === 'complete').length;
  const sumFiles = items.reduce((a, s) => a + (Number(s.fm['metric-files-changed'] ?? s.fm['files-changed']) || 0), 0);
  const sumFixes = items.reduce((a, s) => a + (Number(s.fm['metric-review-fixes-applied'] ?? s.fm['review-fixes-applied']) || 0), 0);

  const lede = items.length
    ? `${items.length} slice${items.length === 1 ? '' : 's'} implemented · ${done} complete`
    : 'No implementation logs yet.';

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? 'Implementation'),
    lede: escapeHtml(lede),
    badges: [
      statusBadge(fm.status),
      `<span class="meta">${items.length} slice${items.length === 1 ? '' : 's'}</span>`,
    ],
  }) + metricRow([
    { label: 'slices',        value: items.length },
    { label: 'complete',      value: done, tone: 'ok' },
    { label: 'files changed', value: sumFiles },
    { label: 'fixes applied', value: sumFixes },
  ]);

  const figureHtml = figureCanvas({
    figureNumber: 5,
    title: `${items.length} slice${items.length === 1 ? '' : 's'}, depends-on arrows · implementation dependency graph`,
    svgInner: sliceGridFigure(items, 'impl-arrow'),
    legend: [
      { state: 'complete', label: 'complete' },
      { state: 'review',   label: 'in review' },
      { state: 'blocked',  label: 'blocked' },
      { state: 'queued',   label: 'queued' },
    ],
  });

  const cards = items.map(({ slug, fm: f }) => sliceCard({
    slug,
    fm: f,
    meta: [
      countPart(f['metric-files-changed'] ?? f['files-changed'], 'file'),
      countPart(f['metric-review-fixes-applied'] ?? f['review-fixes-applied'], 'review'),
      blockerPart(f['blocker-count'] ?? (sliceState(f.status) === 'blocked' ? 1 : 0)),
    ],
  })).join('');

  const proseHtml = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : '';

  // Dual-DOM (M-SLC-03): the slice-grid figure is illegible at phone width, so
  // it's desktop-only — phones fall to the always-present card list below.
  const bodyHtml = `
    <div class="d-only">${figureHtml}</div>
    ${proseHtml}
    <section class="slice-grid">${cards}</section>
    ${renderHistoryBlock(artifact.history)}
  `;

  return { headerHtml, bodyHtml, links: [], children: [] };
}
