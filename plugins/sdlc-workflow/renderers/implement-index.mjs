// renderers/implement-index.mjs
import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { escapeHtml } from './_validator.mjs';
import { pageHref } from './_paths.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sli = ctx.allArtifacts?.implement ?? [];
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? 'Implement index'),
    badges: [statusBadge(fm.status)],
  }) + metricRow([
    { label: 'slices', value: sli.length },
    { label: 'complete', value: sli.filter((s) => s.frontmatter?.status === 'complete').length, tone: 'ok' },
  ]);
  const cards = sli.map((s) => {
    const slice = s.frontmatter?.['slice-slug'] ?? '';
    return `<a class="slice-card" href="${escapeHtml(pageHref(slice))}">
      <span class="slice-slug"><code>${escapeHtml(slice)}</code></span>
      ${statusBadge(s.frontmatter?.status)}
    </a>`;
  }).join('');
  return {
    headerHtml,
    bodyHtml: `<section class="slice-grid">${cards}</section><div class="prose">${md2html(artifact.body ?? '')}</div>${renderHistoryBlock(artifact.history)}`,
    links: [], children: [],
  };
}
