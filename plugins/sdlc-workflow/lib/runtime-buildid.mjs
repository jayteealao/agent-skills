// lib/runtime-buildid.mjs
//
// The shared-runtime build identity hash — the SINGLE definition of how a
// `buildId` is computed, used by both the build generator (scripts/build.mjs,
// which stamps runtime-manifest.json) and the self-contained runtime verifier
// (scripts/verify-runtime.mjs, which proves a materialized/shipped runtime
// reproduces its claimed buildId). Keeping one definition is the whole point:
// if these two computed the hash differently, the cross-host parity invariant
// (`Claude buildId == Codex buildId`, NATIVE-INTEROP "Release Invariant") could
// pass the gate while being false.
//
// The hash covers the runtime payload a hub/renderer actually executes: the
// bundled dist/, the render assets/, components/, and schemas/. It is a sha256
// over a deterministic, sorted list of (POSIX-normalised relpath, bytes) so the
// SAME bytes yield the SAME digest regardless of OS or directory walk order —
// which is what lets two packages that merely COPY (not rebuild) the payload
// carry a provably identical buildId.
//
// `relpath` is taken relative to the `root` argument, NOT a hardcoded plugin
// root, so the identical payload hashes the same whether it sits at the Claude
// plugin root, the Codex package's runtime/, or ~/.sdlc/runtime/<buildId>/.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// The dirs whose bytes define the buildId. A subset of the full runtime payload
// (which also ships docs/site, runtime-manifest.json, tests/frontmatter) — those
// are carried for self-contained operation but intentionally NOT hashed:
// docs/site is large + served-only, and the manifest itself carries the buildId
// (hashing it would be circular).
export const RUNTIME_BUILD_DIRS = ['dist', 'assets', 'components', 'schemas'];

/** sha256 over a deterministic, sorted list of (relpath, bytes) across `dirs`. */
export function computeBuildId(root, dirs = RUNTIME_BUILD_DIRS) {
  const hash = createHash('sha256');
  const files = [];
  for (const d of dirs) {
    const abs = join(root, d);
    if (existsSync(abs)) collectFiles(root, abs, files);
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  for (const f of files) {
    hash.update(f.rel, 'utf-8');
    hash.update('\0');
    hash.update(readFileSync(f.abs));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function collectFiles(root, dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(root, abs, out);
    else if (entry.isFile()) out.push({ abs, rel: relative(root, abs).split(sep).join('/') });
  }
}
