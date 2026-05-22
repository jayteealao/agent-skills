// renderers/slice.mjs — single slice detail page.
//
// In addition to the frontmatter + body, emits a "stages" navigation grid
// linking to the same-slice plan / implement / verify pages (and any
// per-dimension review for the slug). Without this grid the slice page is
// a dead-end — the user can read the slice definition but has no jump
// point into the work that came after it.

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, stageBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { frontmatterCard } from './_simple.mjs';
import { escapeHtml } from './_validator.mjs';

const STAGES = [
  { type: 'plan',      label: 'plan',      dir: 'plan'      },
  { type: 'implement', label: 'implement', dir: 'implement' },
  { type: 'verify',    label: 'verify',   dir: 'verify'    },
];

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sliceSlug = fm['slice-slug'] ?? fm.slug ?? '';

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Slice · <code>${escapeHtml(sliceSlug)}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge('slice'),
      fm['updated-at'] && `<span class="meta">${escapeHtml(fm['updated-at'])}</span>`,
    ],
  }) + metricRow([
    fm['metric-loc-touched'] != null && { label: 'LOC',   value: fm['metric-loc-touched'] },
    fm['metric-step-count']  != null && { label: 'steps', value: fm['metric-step-count'] },
  ].filter(Boolean));

  const stagesHtml = renderStageNav(sliceSlug, ctx);
  const reviewsHtml = renderSliceReviewNav(sliceSlug, ctx);
  const fmCard = frontmatterCard(fm);

  const bodyHtml = `
    ${stagesHtml}
    ${reviewsHtml}
    ${fmCard}
    <div class="prose">${md2html(artifact.body ?? '')}</div>
    ${renderHistoryBlock(artifact.history)}
  `;

  return { headerHtml, bodyHtml, links: [], children: [] };
}

function renderStageNav(sliceSlug, ctx) {
  const cards = STAGES.map(({ type, label, dir }) => {
    const match = (ctx.allArtifacts?.[type] ?? [])
      .find((a) => (a.frontmatter?.['slice-slug'] ?? '') === sliceSlug);
    if (!match) return stageCard({ label, slice: sliceSlug, dir, status: null, present: false });
    return stageCard({
      label,
      slice: sliceSlug,
      dir,
      status: match.frontmatter?.status ?? '',
      present: true,
    });
  }).join('');
  return `<section class="slice-stages">
    <h2 class="sdlc-h2">stages</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}

function stageCard({ label, slice, dir, status, present }) {
  const href = `../../${escapeHtml(dir)}/${escapeHtml(slice)}/`;
  const inner = `<span class="slice-slug"><code>${escapeHtml(label)}</code></span>
    ${present ? statusBadge(status) : '<span class="meta">not started</span>'}`;
  if (!present) {
    return `<div class="slice-card is-missing">${inner}</div>`;
  }
  return `<a class="slice-card" href="${href}">${inner}</a>`;
}

function renderSliceReviewNav(sliceSlug, ctx) {
  const reviews = (ctx.allArtifacts?.['review-command'] ?? [])
    .filter((a) => {
      const fm = a.frontmatter ?? {};
      return (fm['slice-slug'] ?? '') === sliceSlug
        || /* review may be slug-wide; surface if it references the slice */
           (Array.isArray(fm['slices']) && fm['slices'].includes(sliceSlug));
    });
  if (!reviews.length) return '';
  const cards = reviews.map((r) => {
    const dim = r.frontmatter?.dimension ?? r.frontmatter?.command ?? r.frontmatter?.['review-command'] ?? '';
    return `<a class="slice-card" href="../../review/${escapeHtml(dim)}/">
      <span class="slice-slug"><code>${escapeHtml(dim)}</code></span>
      ${statusBadge(r.frontmatter?.status ?? '')}
    </a>`;
  }).join('');
  return `<section class="slice-reviews">
    <h2 class="sdlc-h2">reviews</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}
