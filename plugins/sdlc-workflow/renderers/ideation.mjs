// renderers/ideation.mjs — /wf-quick ideate ranked idea backlog.
//
// Unlike the thin lane renderers, ideation carries its payload in the
// frontmatter (`ideas[]`, `culled[]`), so it renders a ranked table + a
// collapsible culled list rather than a plain frontmatter card.

import { md2html } from './_markdown.mjs';
import { artifactHeader, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { escapeHtml } from './_validator.mjs';

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const ideas = Array.isArray(fm.ideas) ? fm.ideas : [];
  const culled = Array.isArray(fm.culled) ? fm.culled : [];

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(fm.title ?? `Ideation · ${fm.focus ?? ctx?.slug ?? ''}`),
    badges: [
      fm.focus && `<span class="meta">focus <strong>${escapeHtml(fm.focus)}</strong></span>`,
      fm['created-at'] && `<span class="meta">${escapeHtml(fm['created-at'])}</span>`,
    ],
  });

  const metricsHtml = metricRow([
    { label: 'shown', value: ideas.length, tone: ideas.length ? 'ok' : 'warn' },
    fm['raw-candidates'] != null && { label: 'raw', value: fm['raw-candidates'], tone: 'info' },
    fm['culled-count'] != null && { label: 'culled', value: fm['culled-count'], tone: 'warn' },
  ].filter(Boolean));

  const ideasHtml = ideas.length
    ? `<table class="ideation-table">
        <thead><tr><th>id</th><th>idea</th><th>category</th><th>impact</th><th>effort</th><th>score</th></tr></thead>
        <tbody>${ideas.map(ideaRow).join('')}</tbody>
       </table>`
    : '';

  const culledHtml = culled.length
    ? `<details class="ideation-culled">
        <summary>${culled.length} culled</summary>
        <ul>${culled.map(culledItem).join('')}</ul>
       </details>`
    : '';

  const fragment = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : '';
  const prose = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : '';

  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${ideasHtml}${culledHtml}${fragment}${prose}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: [],
  };
}

function ideaRow(idea) {
  return `<tr>
    <td><code>${escapeHtml(idea.id ?? '')}</code></td>
    <td>${escapeHtml(idea.title ?? '')}</td>
    <td>${escapeHtml(idea.category ?? '')}</td>
    <td>${escapeHtml(idea.impact ?? '')}</td>
    <td>${escapeHtml(idea.effort ?? '')}</td>
    <td>${escapeHtml(String(idea.score ?? ''))}</td>
  </tr>`;
}

function culledItem(c) {
  return `<li><code>${escapeHtml(c.id ?? '')}</code> ${escapeHtml(c.title ?? '')}${c.reason ? ` — ${escapeHtml(c.reason)}` : ''}</li>`;
}
