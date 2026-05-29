// renderers/plan-index.mjs — index of slice plans
import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { escapeHtml } from './_validator.mjs';
import { pageHref } from './_paths.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const plans = ctx.allArtifacts?.plan ?? [];
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? 'Plan index'),
    badges: [statusBadge(fm.status), `<span class="meta">${plans.length} plan${plans.length === 1 ? '' : 's'}</span>`],
  });
  const rows = plans.map((p) => {
    const slice = p.frontmatter?.['slice-slug'] ?? '';
    return `<a class="slice-card" href="${escapeHtml(pageHref(slice))}">
      <span class="slice-slug"><code>${escapeHtml(slice)}</code></span>
      <span class="slice-title">${escapeHtml(p.frontmatter?.title ?? '')}</span>
      ${statusBadge(p.frontmatter?.status)}
    </a>`;
  }).join('');

  const bodyHtml = `
    ${metricRow([
      { label: 'plans',  value: plans.length },
      { label: 'with blockers', value: plans.filter((p) => p.frontmatter?.['has-blockers']).length, tone: 'warn' },
    ])}
    <section class="slice-grid">${rows}</section>
    <div class="prose">${md2html(artifact.body ?? '')}</div>
    ${renderHistoryBlock(artifact.history)}
  `;
  return { headerHtml, bodyHtml, links: [], children: [] };
}
