// renderers/ship-runs-index.mjs — list of all deploy runs for a slug
import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { escapeHtml } from './_validator.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const runs = ctx.allArtifacts?.['ship-run'] ?? [];
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? 'Ship runs'),
    badges: [statusBadge(fm.status)],
  }) + metricRow([
    { label: 'runs', value: runs.length },
    { label: 'shipped', value: runs.filter((r) => r.frontmatter?.status === 'shipped').length, tone: 'ok' },
    { label: 'rolled back', value: runs.filter((r) => r.frontmatter?.['rolled-back']).length, tone: 'bad' },
  ]);

  const rows = runs.map((r) => {
    const id = r.frontmatter?.['run-id'] ?? r.frontmatter?.release ?? '';
    return `<a class="slice-card" href="${escapeHtml(id)}/">
      <span class="slice-slug"><code>${escapeHtml(id)}</code></span>
      <span class="slice-title">${escapeHtml(r.frontmatter?.title ?? '')}</span>
      ${statusBadge(r.frontmatter?.status)}
    </a>`;
  }).join('');

  return {
    headerHtml,
    bodyHtml: `<section class="slice-grid">${rows}</section><div class="prose">${md2html(artifact.body ?? '')}</div>${renderHistoryBlock(artifact.history)}`,
    links: [], children: [],
  };
}
