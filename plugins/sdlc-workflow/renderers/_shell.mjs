// renderers/_shell.mjs
// Outer HTML document wrapper. Every rendered page lands inside this shell,
// which provides <head>, the top breadcrumb nav, the <main> slot, and the
// footer. Renderers produce headerHtml + bodyHtml; the shell stitches them
// into a full document.

import { escapeHtml } from './_validator.mjs';

const PLUGIN_VERSION = '9.20.0';

/**
 * Wrap rendered content in the full HTML shell.
 *
 * @param {object} params
 * @param {string} params.title — page title (text only)
 * @param {string} params.type — artifact type (sets data-artifact-type)
 * @param {string} params.slug — workflow slug
 * @param {string} params.status — header status badge value
 * @param {Array<{label,href}>} params.breadcrumbs — pre-built breadcrumb chain
 * @param {string} params.assetBase — absolute URL prefix for /sdlc.css and /sdlc.js
 * @param {string} params.headerHtml — renderer-produced header markup
 * @param {string} params.bodyHtml — renderer-produced body markup
 * @param {string} [params.warnBanner] — optional warn-banner HTML
 * @param {string} [params.storageHref] — link target for the "md ↗" footer link
 * @param {string} [params.updatedAt] — ISO date for the footer
 * @param {string} [params.upHref] — href for the "↑ up" footer link (defaults to "../")
 */
export function renderShell(params) {
  const {
    title, type, slug, status, breadcrumbs = [],
    assetBase = '/sdlc/_assets',
    headerHtml = '', bodyHtml = '',
    warnBanner = '',
    storageHref = '', updatedAt = '', upHref = '../',
  } = params;

  const breadcrumbHtml = breadcrumbs.map((c, i) => {
    const last = i === breadcrumbs.length - 1;
    const text = escapeHtml(c.label);
    return last
      ? `<li aria-current="page">${text}</li>`
      : `<li><a href="${escapeHtml(c.href)}">${text}</a></li>`;
  }).join('<li class="sep" aria-hidden="true">/</li>');

  const versionTag = `?v=${PLUGIN_VERSION}`;

  return `<!DOCTYPE html>
<html lang="en" data-sdlc-version="${PLUGIN_VERSION}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — sdlc</title>
  <link rel="stylesheet" href="${assetBase}/sdlc.css${versionTag}">
  <script src="${assetBase}/sdlc.js${versionTag}" defer></script>
  <link rel="icon" href="${assetBase}/favicon.svg" type="image/svg+xml">
</head>
<body class="artifact" data-artifact-type="${escapeHtml(type)}">
  <nav class="topnav">
    <a class="brand" href="${assetBase}/../">sdlc</a>
    <ol class="breadcrumb">${breadcrumbHtml}</ol>
    <span class="meta">${escapeHtml(slug)}${status ? ' · ' + escapeHtml(status) : ''}</span>
  </nav>

  <main class="content">
    ${warnBanner}
    ${headerHtml}
    ${bodyHtml}
  </main>

  <footer class="bottom">
    <a href="${escapeHtml(upHref)}">↑ up</a>
    <span class="updated">${updatedAt ? 'updated ' + escapeHtml(updatedAt) : ''}</span>
    ${storageHref
      ? `<a href="${escapeHtml(storageHref)}" class="src-link" title="storage source">md ↗</a>`
      : ''}
  </footer>
</body>
</html>
`;
}

/**
 * Shared header builder — a structured artifact-header used by most renderers.
 * Renderers compose this with type-specific extras (metric rows, badges).
 */
export function artifactHeader({ h1, lede = '', crumb = '', badges = [] }) {
  const badgeHtml = badges
    .filter(Boolean)
    .map((b) => typeof b === 'string' ? b : '')
    .join('');
  return `
    <header class="artifact-header">
      ${crumb ? `<div class="sdlc-crumb">${escapeHtml(crumb)}</div>` : ''}
      <h1 class="sdlc-h1">${h1}</h1>
      ${lede ? `<p class="sdlc-lede">${lede}</p>` : ''}
      ${badgeHtml ? `<div class="meta-row">${badgeHtml}</div>` : ''}
    </header>`;
}

/** Status badge shared shape — `.status-badge.is-{ok|warn|bad|skip}`. */
export function statusBadge(value) {
  if (!value) return '';
  const tone = {
    active: 'ok', complete: 'ok', closed: 'skip',
    blocked: 'bad', skipped: 'skip', shipped: 'ok',
    pending: 'warn', running: 'warn',
  }[value] ?? 'ok';
  return `<span class="status-badge is-${tone}">${escapeHtml(value)}</span>`;
}

/** Stage badge — lowercase mono pill. */
export function stageBadge(stage) {
  if (!stage && stage !== 0) return '';
  return `<span class="stage-badge">${escapeHtml(String(stage))}</span>`;
}

/** Metric row — renders the hairline-bordered grid of `.metric` cells. */
export function metricRow(metrics) {
  if (!metrics?.length) return '';
  const cells = metrics.map((m) => {
    const tone = m.tone ? ` is-${m.tone}` : '';
    const sev  = m.sev  ? ` severity-${m.sev}` : '';
    const ann  = m.ann  ? `<span class="metric-ann">${escapeHtml(m.ann)}</span>` : '';
    return `<div class="metric${tone}${sev}">
      <span class="metric-label">${escapeHtml(m.label ?? '')}</span>
      <span class="metric-value">${escapeHtml(String(m.value ?? ''))}</span>
      ${ann}
    </div>`;
  }).join('');
  return `<div class="metric-row">${cells}</div>`;
}
