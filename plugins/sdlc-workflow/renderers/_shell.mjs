// renderers/_shell.mjs
// Outer HTML document wrapper. Every rendered page lands inside this shell,
// which provides <head>, the top breadcrumb nav, the <main> slot, and the
// footer. Renderers produce headerHtml + bodyHtml; the shell stitches them
// into a full document.

import { escapeHtml } from './_validator.mjs';
import { pageHref } from './_paths.mjs';

export const PLUGIN_VERSION = '9.68.0';

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

  // ── Mobile chrome (M-S1 / 5b): a sticky appbar + a fixed bottom tabbar,
  // rendered on every page but revealed only <=720px (the desktop .b-topbar is
  // hidden there). The appbar carries the breadcrumb (with a back affordance)
  // and the page title; since the body .pg-title is display:none on mobile and
  // the appbar is display:none on desktop, exactly one <h1> is in the a11y tree
  // per breakpoint. The tabbar links only to reliably-derivable destinations
  // (Home / Overview) from the breadcrumb trail plus a Menu tab that opens the
  // bottom-sheet nav — the same destination model the desktop topbar carries.
  const TAB_ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>',
  };
  const homeHref = breadcrumbs[0]?.href ?? pageHref(`${assetBase}/..`);
  const mCrumbTrail = breadcrumbs.length
    ? breadcrumbs.map((c, i) => i === breadcrumbs.length - 1
        ? `<span class="m-here">${escapeHtml(c.label)}</span>`
        : `<a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>`).join('<span aria-hidden="true">/</span>')
    : '<span class="m-here">.ai/workflows</span>';
  const mBackHref = breadcrumbs.length >= 2 ? breadcrumbs[breadcrumbs.length - 2].href : upHref;
  const mAppbar = `<header class="m-appbar">
    <div class="m-crumb"><a class="m-back" href="${escapeHtml(mBackHref)}" aria-label="Back">&larr;</a><span class="m-trail">${mCrumbTrail}</span></div>
    <h1 class="m-title">${escapeHtml(title)}</h1>
  </header>`;
  // Active-tab rule: every page lights exactly one tab. Home owns the repo root
  // (depth <=1); Overview owns the section root AND everything nested under it
  // (depth >=2) — so a deep stage/artifact page still shows a "you are here"
  // cue rather than leaving the whole tabbar inactive.
  const mTabs = [{ href: homeHref, label: 'Home', icon: TAB_ICONS.home, active: breadcrumbs.length <= 1 }];
  if (breadcrumbs.length >= 2) mTabs.push({ href: breadcrumbs[1].href, label: 'Overview', icon: TAB_ICONS.grid, active: breadcrumbs.length >= 2 });
  const mTabbar = `<nav class="m-tabbar" aria-label="Sections">${mTabs.map((t) =>
    `<a class="m-tab${t.active ? ' is-active' : ''}" href="${escapeHtml(t.href)}">${t.icon}<span>${escapeHtml(t.label)}</span></a>`).join('')}<label class="m-tab m-tab-menu" for="m-menu">${TAB_ICONS.menu}<span>Menu</span></label></nav>`;

  // ── Mobile menu sheet: the "proper" nav surface (<=720px). A CSS-only bottom
  // sheet toggled by the #m-menu checkbox (same CSP-safe no-JS pattern as the
  // hub landing's radio tabs; sdlc.js adds Escape/auto-close as enhancement).
  // It carries the SAME destination model as the desktop topbar — and the same
  // serve-time hooks: the `class="brand"` anchor is repointed to the hub root
  // by hub-serve's brand rewrite, and the `class="actions"` cell receives the
  // injected `code ↗` link. Places skips breadcrumbs[0]: at render time it is
  // the brand's own destination (the repo dashboard), and under the hub —
  // where the brand becomes the hub root — the repo home stays one tap away on
  // the tabbar's Home tab.
  const mPlaces = [
    `<a class="brand" href="${escapeHtml(pageHref(`${assetBase}/..`))}">.ai/workflows</a>`,
    ...breadcrumbs.slice(1).map((c, i, arr) => i === arr.length - 1
      ? `<span class="m-sheet-here" aria-current="page">${escapeHtml(c.label)}</span>`
      : `<a href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>`),
  ].join('');
  const mMenu = `<input type="checkbox" id="m-menu" class="m-menu-toggle" aria-label="Navigation menu">
  <label class="m-backdrop" for="m-menu" aria-hidden="true"></label>
  <aside class="m-sheet" aria-label="Navigation">
    <div class="m-sheet-grip" aria-hidden="true"></div>
    <h2 class="m-sheet-head">Places</h2>
    <nav class="m-sheet-places" aria-label="Places">${mPlaces}</nav>
    <h2 class="m-sheet-head">Links</h2>
    <div class="actions m-sheet-links"><a href="${escapeHtml(pageHref(upHref))}">&uarr; up</a>${storageHref
      ? `<a href="${escapeHtml(storageHref)}" class="src-link" title="storage source">md &#8599;</a>` : ''}</div>
    ${updatedAt ? `<div class="m-sheet-meta">updated ${escapeHtml(updatedAt)}</div>` : ''}
  </aside>`;

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
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(title)} — sdlc</title>
  <link rel="stylesheet" href="${escapeHtml(assetBase)}/sdlc.css${versionTag}">
  <script src="${escapeHtml(assetBase)}/sdlc.js${versionTag}" defer></script>
  <link rel="icon" href="${escapeHtml(assetBase)}/favicon.svg" type="image/svg+xml">
</head>
<body class="artifact" data-artifact-type="${escapeHtml(type)}">
  ${mAppbar}
  <div class="b-topbar">
    <a class="brand" href="${escapeHtml(pageHref(`${assetBase}/..`))}">.ai/workflows</a>
    <div class="crumb">${crumbHtml}</div>
    <div class="actions">${storageHref
      ? `<a href="${escapeHtml(storageHref)}" class="src-link" title="storage source">md &#8599;</a>`
      : ''}</div>
  </div>

  <main class="content">
    ${warnBanner}
    ${headerHtml}
    <nav class="frag-nav" aria-label="Fragments on this page"><span class="frag-nav-label">On this page</span><ul class="frag-nav-list"></ul></nav>
    ${bodyHtml}
  </main>

  <footer class="bottom">
    <a href="${escapeHtml(pageHref(upHref))}">↑ up</a>
    <span class="updated">${updatedAt ? 'updated ' + escapeHtml(updatedAt) : ''}</span>
    ${storageHref
      ? `<a href="${escapeHtml(storageHref)}" class="src-link" title="storage source">md ↗</a>`
      : ''}
  </footer>
  ${mMenu}
  ${mTabbar}
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
