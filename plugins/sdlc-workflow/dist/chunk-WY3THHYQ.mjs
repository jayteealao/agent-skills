import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  escapeHtml
} from "./chunk-BTT5W62B.mjs";

// lib/resolve-request-path.mjs
import { existsSync, statSync, realpathSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
function resolveRequestPath(root, rawUrl, { stripPrefix = null, indexFile = "INDEX.html" } = {}) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl, "http://sdlc.local").pathname);
  } catch {
    return { ok: false, status: 400, message: "bad request" };
  }
  if (stripPrefix) {
    if (pathname === stripPrefix) pathname = "/";
    else if (pathname.startsWith(`${stripPrefix}/`)) pathname = pathname.slice(stripPrefix.length) || "/";
  }
  if (pathname === "/") pathname = `/${indexFile}`;
  let candidate = resolve(root, `.${pathname}`);
  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    candidate = join(candidate, indexFile);
  } else if (!extname(candidate) && existsSync(`${candidate}/${indexFile}`)) {
    candidate = join(candidate, indexFile);
  }
  const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`;
  if (candidate !== root && !candidate.startsWith(rootWithSep)) {
    return { ok: false, status: 403, message: "forbidden" };
  }
  if (existsSync(candidate)) {
    let real;
    try {
      real = realpathSync.native(candidate);
    } catch {
      return { ok: false, status: 404, message: "not found" };
    }
    let realRoot;
    try {
      realRoot = realpathSync.native(root);
    } catch {
      return { ok: false, status: 404, message: "not found" };
    }
    const realRootWithSep = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;
    if (real !== realRoot && !real.startsWith(realRootWithSep)) {
      return { ok: false, status: 403, message: "forbidden" };
    }
    return { ok: true, path: real };
  }
  return { ok: true, path: candidate };
}

// lib/host-allowlist.mjs
var ALLOWED_HOSTNAMES = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
function hostnameOf(hostHeader) {
  const h = String(hostHeader ?? "");
  if (h.startsWith("[")) return h.slice(0, h.indexOf("]") + 1).toLowerCase();
  return h.split(":")[0].toLowerCase();
}
function hostAllowed(req, allowAllHosts, extraHosts) {
  if (allowAllHosts) return true;
  const h = hostnameOf(req.headers.host);
  return ALLOWED_HOSTNAMES.has(h) || extraHosts != null && extraHosts.has(h);
}

// renderers/_code-browser-page.mjs
function renderCodeBrowserPage({
  repoId = null,
  repoLabel = "",
  headBranch = null,
  base = "/__code",
  pluginVersion = ""
} = {}) {
  const v = pluginVersion ? `?v=${encodeURIComponent(pluginVersion)}` : "";
  const label = repoLabel || "repository";
  const title = `${label} \u2014 code`;
  const upHref = base.endsWith("/__code") ? base.slice(0, -"__code".length) : "../";
  const branchHtml = headBranch ? ` <span class="cb-branch">\u2387 ${escapeHtml(headBranch)}</span>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  ${repoId ? `<meta name="sdlc-repo-id" content="${escapeHtml(repoId)}">` : ""}
  <link rel="stylesheet" href="/__sdlc/code-browser.css${v}">
</head>
<body class="cb-body">
  <div class="b-topbar cb-topbar">
    <a class="brand" href="${escapeHtml(upHref)}">${escapeHtml(label)}</a>
    <div class="crumb"><b aria-current="page">code</b>${branchHtml}</div>
    <div class="actions"><span class="cb-hint">read-only working tree</span></div>
  </div>
  <div id="sdlc-code-root" data-base="${escapeHtml(base)}">
    <noscript>The code browser needs JavaScript \u2014 use the raw endpoints under <code>${escapeHtml(base)}/</code>.</noscript>
  </div>
  <script src="/__sdlc/code-browser.js${v}" defer></script>
</body>
</html>
`;
}

export {
  resolveRequestPath,
  hostAllowed,
  renderCodeBrowserPage
};
