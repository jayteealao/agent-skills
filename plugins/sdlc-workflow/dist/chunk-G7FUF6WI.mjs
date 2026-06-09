import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

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

export {
  resolveRequestPath
};
