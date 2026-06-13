// renderers/design-contract.mjs — implementation-facing visual contract.

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, stageBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { frontmatterCard } from './_simple.mjs';
import { escapeHtml } from './_validator.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  // Prefer the sibling YAML for the structured coverage axes (the rich tier);
  // fall back to frontmatter so legacy contracts that carried the lists inline
  // still render their matrix. Mirrors design-critique.mjs's sy-or-fm pattern.
  const sy = artifact.siblingYaml ?? null;
  const data = sy ?? fm;

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? `${fm.component ?? data.component ?? 'Design'} visual contract`),
    badges: [
      statusBadge(fm.status),
      stageBadge('design-contract'),
      (fm.component ?? data.component) && `<span class="meta">${escapeHtml(fm.component ?? data.component)}</span>`,
      (fm['based-on'] ?? data['based-on']) && `<span class="meta">based on ${escapeHtml(fm['based-on'] ?? data['based-on'])}</span>`,
    ],
  });

  const metricsHtml = metricRow([
    { label: 'tokens', value: (data.tokens ?? []).length },
    { label: 'states', value: (data.states ?? []).length },
    { label: 'sizes', value: (data.sizes ?? []).length },
    { label: 'themes', value: (data.themes ?? []).length },
  ]);

  const summaryHtml = sy?.summary
    ? `<p class="sdlc-lede">${escapeHtml(sy.summary)}</p>`
    : '';

  // The interactive fragment owns the coverage grid; suppress the static matrix
  // when a fragment is present so the page never shows both. Without a fragment
  // (or sibling), the static matrix is the rich layer.
  const matrixHtml = !artifact.fragment
    ? `<section class="design-contract-matrix">
        <h2 class="sdlc-h2">contract coverage</h2>
        ${listBlock('tokens', data.tokens)}
        ${listBlock('states', data.states)}
        ${listBlock('sizes', data.sizes)}
        ${listBlock('themes', data.themes)}
      </section>`
    : '';

  const fragmentBlock = artifact.fragment
    ? `<div class="fragment">${artifact.fragment}</div>`
    : '';

  const frontmatterBlock = frontmatterCard(fm, [
    'component', 'based-on', 'register', 'image-gate', 'north-star-mock', 'references-loaded', 'refs',
  ]);
  const proseBlock = artifact.body
    ? `<div class="prose">${md2html(artifact.body)}</div>`
    : '';

  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${summaryHtml}${fragmentBlock}${matrixHtml}${frontmatterBlock}${proseBlock}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: [],
  };
}

function listBlock(label, values = []) {
  const items = Array.isArray(values) ? values : [];
  return `<div class="contract-list">
    <h3>${escapeHtml(label)}</h3>
    ${items.length ? `<ul>${items.map((item) => `<li><code>${escapeHtml(item)}</code></li>`).join('')}</ul>` : '<p class="muted">none recorded</p>'}
  </div>`;
}
