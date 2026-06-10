// renderers/_code-browser-page.mjs
//
// The code browser's server-rendered HTML shell (CODEBASE-BROWSER-PLAN §4.4):
// a small string document in the hub-landing pattern — no framework, no view
// assets. Everything the page needs ships in the two committed bundle files
// (`/__sdlc/code-browser.js` + `.css`), so the page works identically under
// the hub (`/r/<id>/__code/`) and the standalone daemon (`/__code/`); the
// bundle reads its API base from `data-base`. Underscore-prefixed: statically
// imported by the serve scripts, never loaded by artifact type, so the build
// rolls it into shared chunks instead of minting a renderer entrypoint.

import { escapeHtml } from './_validator.mjs';

/**
 * @param {object} p
 * @param {string|null} [p.repoId] — registry id (hub) — emitted as the
 *   `sdlc-repo-id` meta the serve-time transforms also use.
 * @param {string} [p.repoLabel] — repo basename for the title/topbar.
 * @param {string|null} [p.headBranch] — checkout HEAD, informational badge.
 * @param {string} [p.base] — API base path (`/r/<id>/__code` or `/__code`).
 * @param {string} [p.pluginVersion] — cache-busts the immutable bundle assets.
 */
export function renderCodeBrowserPage({
  repoId = null, repoLabel = '', headBranch = null, base = '/__code', pluginVersion = '',
} = {}) {
  const v = pluginVersion ? `?v=${encodeURIComponent(pluginVersion)}` : '';
  const label = repoLabel || 'repository';
  const title = `${label} — code`;
  // The repo's own view root: base minus the trailing `__code` segment
  // (`/r/<id>/` under the hub, `/` standalone).
  const upHref = base.endsWith('/__code') ? base.slice(0, -'__code'.length) : '../';
  const branchHtml = headBranch
    ? ` <span class="cb-branch">⎇ ${escapeHtml(headBranch)}</span>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  ${repoId ? `<meta name="sdlc-repo-id" content="${escapeHtml(repoId)}">` : ''}
  <link rel="stylesheet" href="/__sdlc/code-browser.css${v}">
</head>
<body class="cb-body">
  <div class="b-topbar cb-topbar">
    <a class="brand" href="${escapeHtml(upHref)}">${escapeHtml(label)}</a>
    <div class="crumb"><b aria-current="page">code</b>${branchHtml}</div>
    <div class="actions"><span class="cb-hint">read-only working tree</span></div>
  </div>
  <div id="sdlc-code-root" data-base="${escapeHtml(base)}">
    <noscript>The code browser needs JavaScript — use the raw endpoints under <code>${escapeHtml(base)}/</code>.</noscript>
  </div>
  <script src="/__sdlc/code-browser.js${v}" defer></script>
</body>
</html>
`;
}
