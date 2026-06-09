// lib/resolve-request-path.mjs
//
// Shared symlink-escape containment kernel. Maps an incoming request URL to a
// real file path *inside* `root`, refusing any path that escapes it — both
// lexically and after realpath resolution, so a symlink inside the tree that
// points outside it is still refused (statSync/createReadStream follow links).
//
// Extracted from scripts/render-sunflower-serve.mjs (v9.33.0) so the per-repo
// daemon and the multi-repo hub (scripts/hub-serve.mjs) share one audited
// kernel — the security model that keeps one repo's `/r/<id>/` request from
// reaching another repo's files depends on this single function being correct.
//
// The `/sdlc` URL-prefix strip the per-repo daemon historically applied is NOT
// baked in: under the hub a repo can own a slug literally named `sdlc`, and
// `/r/<id>/sdlc/...` must not be silently rewritten to the view root. The strip
// is an opt-in `stripPrefix` option so the per-repo daemon keeps it via a thin
// wrapper while the hub omits it. Keeping the strip inside the kernel (operating
// on the already-decoded pathname) means the per-repo daemon's behaviour is
// byte-identical to the pre-extraction code — no decode-order divergence.

import { existsSync, statSync, realpathSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

/**
 * Resolve a request URL to a contained file path under `root`.
 *
 * @param {string} root — the directory the request must stay inside (the
 *   per-repo daemon's view root, or the hub's per-entry `viewDir`).
 * @param {string} rawUrl — the request URL (may include a query string).
 * @param {{ stripPrefix?: string|null, indexFile?: string }} [opts] — when
 *   `stripPrefix` is set, a leading path prefix (e.g. `/sdlc`) is stripped from
 *   the decoded pathname before resolution (defaults to no strip). `indexFile`
 *   is the directory-index basename appended when a request resolves to a
 *   directory or `/` (defaults to `INDEX.html`, the convention the renderer
 *   emits). The hub serves the plugin's own `docs/site` tree — authored with a
 *   lowercase `index.html` — by passing `indexFile: 'index.html'`; the
 *   containment math is otherwise identical, so docs reuse this same audited
 *   kernel rather than a second path resolver.
 * @returns {{ ok: true, path: string } | { ok: false, status: number, message: string }}
 */
export function resolveRequestPath(root, rawUrl, { stripPrefix = null, indexFile = 'INDEX.html' } = {}) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, 'http://sdlc.local').pathname);
  } catch {
    return { ok: false, status: 400, message: 'bad request' };
  }

  if (stripPrefix) {
    if (pathname === stripPrefix) pathname = '/';
    else if (pathname.startsWith(`${stripPrefix}/`)) pathname = pathname.slice(stripPrefix.length) || '/';
  }
  if (pathname === '/') pathname = `/${indexFile}`;

  let candidate = resolve(root, `.${pathname}`);
  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    candidate = join(candidate, indexFile);
  } else if (!extname(candidate) && existsSync(`${candidate}/${indexFile}`)) {
    candidate = join(candidate, indexFile);
  }

  const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
  if (candidate !== root && !candidate.startsWith(rootWithSep)) {
    return { ok: false, status: 403, message: 'forbidden' };
  }
  // The lexical check above is not sufficient: statSync/createReadStream follow
  // symlinks, so a link inside the view tree pointing outside it would be
  // served. Resolve the real path and re-check containment against the real root.
  if (existsSync(candidate)) {
    let real;
    try { real = realpathSync.native(candidate); }
    catch { return { ok: false, status: 404, message: 'not found' }; }
    let realRoot;
    try { realRoot = realpathSync.native(root); }
    catch { return { ok: false, status: 404, message: 'not found' }; }
    const realRootWithSep = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
    if (real !== realRoot && !real.startsWith(realRootWithSep)) {
      return { ok: false, status: 403, message: 'forbidden' };
    }
    return { ok: true, path: real };
  }
  return { ok: true, path: candidate };
}
