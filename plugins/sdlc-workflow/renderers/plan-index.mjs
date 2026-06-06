// renderers/plan-index.mjs — index of slice plans as a slice-card grid.
// PLN-11: full sc-* anatomy (files / steps / blockers) via the shared card.

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { escapeHtml } from './_validator.mjs';
import { sliceCard, countPart } from './_cards.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const plans = ctx.allArtifacts?.plan ?? [];

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? 'Plan index'),
    badges: [
      statusBadge(fm.status),
      `<span class="meta">${plans.length} plan${plans.length === 1 ? '' : 's'}</span>`,
    ],
  }) + metricRow((() => {
    const blocked = plans.filter((p) => p.frontmatter?.['has-blockers']).length;
    return [
      { label: 'plans',         value: plans.length },
      // PLN-19: only tint amber when there actually are blocked plans.
      { label: 'with blockers', value: blocked, tone: blocked ? 'warn' : undefined },
    ];
  })());

  const cards = plans.map((p) => {
    const f = p.frontmatter ?? {};
    const slug = f['slice-slug'] ?? '';
    return sliceCard({
      slug,
      fm: f,
      meta: [
        countPart(f['metric-files-to-touch'], 'file'),
        countPart(f['metric-step-count'], 'step'),
        f['has-blockers'] ? '<span class="blocker-cnt">blockers</span>' : null,
      ],
    });
  }).join('');

  const bodyHtml = `
    <section class="slice-grid">${cards}</section>
    <div class="prose">${md2html(artifact.body ?? '')}</div>
    ${renderHistoryBlock(artifact.history)}
  `;
  return { headerHtml, bodyHtml, links: [], children: [] };
}
