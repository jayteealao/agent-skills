// renderers/_shell.mjs
// Outer HTML document wrapper. Every rendered page lands inside this shell,
// which provides <head>, the top breadcrumb nav, the <main> slot, and the
// footer. Renderers produce headerHtml + bodyHtml; the shell stitches them
// into a full document.

import { escapeHtml } from './_validator.mjs';
import { pageHref } from './_paths.mjs';

const PLUGIN_VERSION = '9.34.5';

/**
 * Wrap rendered content in the full HTML shell.
 *
 * @param {object} params
 * @param {string} params.title — page title (text only)
 * @param {string} params.type — artifact type (sets data-artifact-type)
 * @param {string} params.slug — workflow slug
 * @param {string} params.status — header status badge value
 * @param {Array<{label,href}>} params.breadcrumbs — pre-built breadcrumb chain
 * @param {string} params.assetBase — URL prefix for sdlc.css/sdlc.js/favicon (relative or absolute)
 * @param {string} params.headerHtml — renderer-produced header markup
 * @param {string} params.bodyHtml — renderer-produced body markup
 * @param {string} [params.warnBanner] — optional warn-banner HTML
 * @param {string} [params.storageHref] — link target for the "md ↗" footer link
 * @param {string} [params.updatedAt] — ISO date for the footer
 * @param {string} [params.upHref] — href for the "↑ up" footer link (defaults to "../")
 * @param {boolean} [params.liveReload] — connect to renderer-hosted SSE reload
 */
export function renderShell(params) {
  const {
    title, type, slug, status, breadcrumbs = [],
    assetBase = '_assets',
    headerHtml = '', bodyHtml = '',
    warnBanner = '',
    storageHref = '', updatedAt = '', upHref = '../',
    liveReload = false,
  } = params;

  // Editorial breadcrumb (div.crumb): sans-serif prose with the current
  // segment bold, slash separators between links. Replaces the mono ol/li
  // path-list model to match the design's three-column topbar.
  const crumbHtml = breadcrumbs.map((c, i) => {
    const last = i === breadcrumbs.length - 1;
    const text = escapeHtml(c.label);
    return last
      ? `<b aria-current="page">${text}</b>`
      : `<a href="${escapeHtml(c.href)}">${text}</a>`;
  }).join('<span class="crumb-sep" aria-hidden="true">/</span>');

  const versionTag = `?v=${PLUGIN_VERSION}`;
  // External (not inline) so served pages can run a strict `script-src 'self'`
  // CSP that blocks injected inline scripts. See render-sunflower-serve.mjs.
  const liveReloadScript = liveReload
    ? `\n  <script src="${escapeHtml(assetBase)}/livereload.js" defer></script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" data-sdlc-version="${PLUGIN_VERSION}" data-artifact-type="${escapeHtml(type)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — sdlc</title>
  <link rel="stylesheet" href="${escapeHtml(assetBase)}/sdlc.css${versionTag}">
  <script src="${escapeHtml(assetBase)}/sdlc.js${versionTag}" defer></script>
  <link rel="icon" href="${escapeHtml(assetBase)}/favicon.svg" type="image/svg+xml">
</head>
<body class="artifact" data-artifact-type="${escapeHtml(type)}">
  <div class="b-topbar">
    <a class="brand" href="${escapeHtml(pageHref(`${assetBase}/..`))}">.ai/workflows</a>
    <div class="crumb">${crumbHtml}</div>
    <div class="actions"><span class="kbd">⌘K</span> to search · viewing as <b>you</b></div>
  </div>

  <main class="content">
    ${warnBanner}
    ${headerHtml}
    ${bodyHtml}
  </main>

  <footer class="bottom">
    <a href="${escapeHtml(pageHref(upHref))}">↑ up</a>
    <span class="updated">${updatedAt ? 'updated ' + escapeHtml(updatedAt) : ''}</span>
    ${storageHref
      ? `<a href="${escapeHtml(storageHref)}" class="src-link" title="storage source">md ↗</a>`
      : ''}
  </footer>
  ${liveReloadScript}
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
      <h1 class="pg-title">${h1}</h1>
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
