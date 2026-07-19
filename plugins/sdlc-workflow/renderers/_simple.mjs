// renderers/_simple.mjs
// Shared base for the many artifact types whose page is just "frontmatter
// card + MD body + optional fragment". Per-type renderers wrap this and add
// their own metric row / badges where appropriate.

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, stageBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock, renderRevisionLedger } from './_history.mjs';
import { escapeHtml } from './_validator.mjs';

/**
 * Render the standard frontmatter card — a compact <dl> showing key/value
 * pairs from the frontmatter. Excludes `body`, `description`, and other large
 * fields that don't belong in the card.
 */
export function frontmatterCard(fm, keys = null) {
  if (!fm) return '';
  const exclude = new Set(['schema', 'description', 'body']);
  const showKeys = keys ?? Object.keys(fm).filter((k) => !exclude.has(k));
  const rows = showKeys
    .filter((k) => fm[k] !== undefined && fm[k] !== null && fm[k] !== '')
    .map((k) => {
      const v = fm[k];
      const value = Array.isArray(v) ? v.join(', ')
                  : typeof v === 'object' ? JSON.stringify(v)
                  : String(v);
      return `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(value)}</dd></div>`;
    }).join('');
  if (!rows) return '';
  return `<dl class="frontmatter-card">${rows}</dl>`;
}

/**
 * Default "simple" renderer suitable for intake, shape, retro, handoff, etc.
 * Composes header + frontmatter card + body (fragment if present, else MD).
 */
export function renderSimple(artifact, ctx, { title, lede = '', metricFields = [] } = {}) {
  const fm = artifact.frontmatter ?? {};
  const badges = [
    statusBadge(fm.status),
    fm['current-stage'] && stageBadge(fm['current-stage']),
    fm['stage-number'] != null && `<span class="meta">stage ${escapeHtml(fm['stage-number'])}</span>`,
    fm['revision-count'] && `<span class="meta">rev ${escapeHtml(fm['revision-count'])}</span>`,
    fm['updated-at'] && `<span class="meta">updated ${escapeHtml(fm['updated-at'])}</span>`,
  ];

  const metrics = metricFields
    .map((f) => fm[f.key] != null ? { label: f.label, value: fm[f.key], tone: f.tone, sev: f.sev } : null)
    .filter(Boolean);

  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(title ?? fm.title ?? fm.type ?? artifact.path),
    lede,
    badges,
  }) + (metrics.length ? metricRow(metrics) : '');

  // v9.24.0: markdown body is ALWAYS rendered, even when a .html.fragment
  // sibling is present. The fragment is the "rich projection on top"; the
  // markdown is the "narrative below". The frontmatter card is suppressed
  // when a fragment ships its own metadata header.
  const fmCard = frontmatterCard(fm);
  const fragmentBlock = artifact.fragment
    ? `<div class="fragment">${artifact.fragment}</div>` : '';
  const fmCardBlock = artifact.fragment ? '' : fmCard;
  const proseBlock = artifact.body
    ? `<div class="prose">${md2html(artifact.body)}</div>` : '';
  const ledgerBlock = renderRevisionLedger(fm, artifact.siblingYaml);
  const bodyHtml = `${fragmentBlock}${ledgerBlock}${fmCardBlock}${proseBlock}`;

  return {
    headerHtml,
    bodyHtml: bodyHtml + renderHistoryBlock(artifact.history),
    links: [],
    children: [],
  };
}
