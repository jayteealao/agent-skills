#!/usr/bin/env node
/**
 * scripts/build.mjs — esbuild multi-entry bundler for the self-contained plugin.
 *
 * Emits committed, dependency-inlined ESM bundles under dist/ so a fresh
 * marketplace install runs with ZERO runtime `npm install`. The only npm
 * install left is a maintainer/dev concern (this build + the tests).
 * See docs/internal/archived/SELF-CONTAINED-BUILD-PLAN.md.
 *
 * Output layout — depth-1 invariant
 * ---------------------------------
 * Every bundle sits exactly one level under the plugin root so the
 * `resolve(__dirname, '..', …)` / `new URL('../…', import.meta.url)` reads in
 * lib/ and scripts/ keep resolving to the REAL plugin-root files (schemas/,
 * assets/, components/). Emitting to the root or to depth-2 would break those.
 *
 *   dist/<hook|script>.mjs        — flat top-level entrypoints (hooks + scripts)
 *   dist/chunk-<hash>.mjs         — shared code (markdown-it, js-yaml, ajv,
 *                                   lib/*, renderers/_*) deduped via splitting.
 *                                   MUST stay flat at depth-1: lib/config.mjs &
 *                                   friends read plugin-root files via
 *                                   `resolve(__dirname, '..', 'schemas', …)`.
 *                                   At depth-1 a bundled lib chunk resolves
 *                                   `..` to the plugin root exactly as the
 *                                   source lib/ file does; a `chunks/` subdir
 *                                   (depth-2) would make `..` land on dist/.
 *   dist/renderers/<type>.mjs     — one per public renderer; render-sunflower's
 *                                   runtime loader (loadRenderer) imports these
 *                                   by computed path when it runs from dist/.
 *                                   Safe at depth-2: renderers are path-agnostic
 *                                   (zero __dirname/import.meta.url usage).
 *
 * Why renderers are entrypoints (not just render-sunflower)
 * --------------------------------------------------------
 * render-sunflower loads renderers dynamically: `await import(computedPath)`
 * (scripts/render-sunflower.mjs loadRenderer). esbuild cannot follow that edge,
 * so bundling the engine alone would leave the renderers — the actual
 * markdown-it/js-yaml consumers — loading from source and crashing on the
 * missing deps in prod. Listing every public renderer as its own entrypoint and
 * re-pointing loadRenderer at dist/renderers closes that gap; code-splitting
 * keeps markdown-it inlined ONCE in a shared chunk rather than 71 times.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RUNTIME_BUILD_DIRS, computeBuildId } from '../lib/runtime-buildid.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(PLUGIN_ROOT, 'dist');

// Flat top-level entrypoints — every Claude-invoked process.
const HOOK_ENTRIES = [
  'session-start-orient',   // SessionStart
  'seed-memory',            // SessionStart — seed the /wf rules kernel (MEMORY-SEED-PLAN); both hosts
  'pre-write-validate',     // PreToolUse
  'leak-guard-bash',        // PreToolUse(Bash) — EOB leak guard, advisory-first (HOOKS-SEMANTIC Phase 1)
  'leak-guard-write',       // PreToolUse(Write|Edit) — EOB leak guard for public-doc paths
  'post-write-auto-stage',  // PostToolUse
  'post-write-verify',      // PostToolUse
  'post-write-render',      // PostToolUse (inlines render-on-artifact-write)
];
const SCRIPT_ENTRIES = [
  'render-sunflower',        // spawned: bootstrap + incremental render jobs
  'hub-serve',               // spawned by lib/hub-lifecycle
  'hub-ensure',              // spawned detached by the write/session hooks (RENDER-DISPATCH-PLAN)
  'render-sunflower-serve',  // spawned by lib/serve-lifecycle
  'tray',                    // user-launched system-tray app (docs/internal/archived/TRAY-APP-PLAN.md)
  'tray-heal',               // detached: reconcile a running stale tray after upgrade (lib/tray-lifecycle)
  'verify-runtime',          // self-contained runtime integrity/parity check (NATIVE-INTEROP Workstream D)
  'hub-upgrade',             // explicit controlled runtime upgrade + rollback (NATIVE-INTEROP Workstream C)
];

// Public renderers are loaded at runtime by render-sunflower's loadRenderer()
// as renderers/<type>.mjs. The `_`-prefixed files are shared helpers imported
// statically (never loaded by type), so they ride into shared chunks rather
// than becoming their own entrypoints. Discovered dynamically so a newly added
// renderer is bundled automatically — convention over enumeration.
const rendererEntries = readdirSync(join(PLUGIN_ROOT, 'renderers'))
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
  .map((f) => f.replace(/\.mjs$/, ''))
  .sort();

const entryPoints = [
  ...HOOK_ENTRIES.map((n) => ({ in: join(PLUGIN_ROOT, 'hooks', `${n}.mjs`), out: n })),
  ...SCRIPT_ENTRIES.map((n) => ({ in: join(PLUGIN_ROOT, 'scripts', `${n}.mjs`), out: n })),
  // Forward-slash `out` keeps the renderers/ prefix on every platform (esbuild
  // emits with `/`); a path.join here would inject `\` on Windows.
  ...rendererEntries.map((n) => ({ in: join(PLUGIN_ROOT, 'renderers', `${n}.mjs`), out: `renderers/${n}` })),
];

// Clean rebuild: a removed entrypoint must not leave a stale bundle behind, or
// the freshness git-diff gate would pass on orphaned output.
rmSync(DIST, { recursive: true, force: true });

const result = await build({
  entryPoints,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // Code-splitting dedupes the heavy CJS deps + shared lib/renderer helpers into
  // dist/chunks/ instead of copying them into every entry.
  splitting: true,
  outdir: DIST,
  outExtension: { '.js': '.mjs' },
  // Flat (NO chunks/ subdir): keeps shared lib chunks at depth-1 so their
  // `resolve(__dirname, '..', …)` plugin-root reads stay correct. See header.
  chunkNames: '[name]-[hash]',
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  // Some bundled CJS deps (ajv codegen, markdown-it) may reference `require`.
  // Provide a working one for ESM output; harmless for the pure-ESM sources,
  // which never reference `require` themselves.
  banner: {
    js: [
      "import { createRequire as __sdlcCreateRequire } from 'module';",
      'const require = __sdlcCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  logLevel: 'info',
  metafile: true,
});

// Copy lib-adjacent runtime assets (the non-.mjs files in lib/) flat into dist/.
// Bundled lib code reads these relative to its OWN location, not via pluginRoot:
// e.g. detach.mjs resolves launch-hidden.vbs as `join(dirname(import.meta.url),
// 'launch-hidden.vbs')`. From a flat depth-1 dist chunk that lands on
// dist/launch-hidden.vbs — so the asset must sit beside the chunks. Without this
// copy the bundled feature silently falls back (here: the Windows console flash).
const libAssets = readdirSync(join(PLUGIN_ROOT, 'lib')).filter((f) => !f.endsWith('.mjs'));
for (const asset of libAssets) {
  copyFileSync(join(PLUGIN_ROOT, 'lib', asset), join(DIST, asset));
}

const outFiles = Object.keys(result.metafile.outputs);
const chunkCount = outFiles.filter((f) => /\/chunk-[^/]+\.mjs$/.test(f)).length;
const entryCount = outFiles.length - chunkCount;
const totalBytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
console.log(
  `[build] ${entryPoints.length} entrypoints → ${entryCount} bundles + ${chunkCount} shared chunks ` +
    `+ ${libAssets.length} lib asset(s) (${(totalBytes / 1024).toFixed(0)} KiB) in dist/`,
);
if (result.warnings.length) {
  // The unanalyzable dynamic import in render-sunflower (loadRenderer) warns
  // here by design — it stays a runtime import that loads dist/renderers/*.
  console.log(`[build] ${result.warnings.length} warning(s) (expected: render-sunflower dynamic renderer import)`);
}

/* ── browser target: the code-browser bundle (CODEBASE-BROWSER-PLAN §4.3) ──
 *
 * A SECOND build in this same script (it must run after the rmSync wipe above,
 * or its output would be deleted): view-src/code-browser/main.tsx → a single
 * minified IIFE at dist/code-browser.js, plus Tailwind v4 CSS at
 * dist/code-browser.css. Both are COMMITTED and served verbatim by the
 * daemons' /__sdlc/code-browser.* routes — end users never npm install.
 * React resolves its production build via the NODE_ENV define.
 */
const VIEW_SRC = join(PLUGIN_ROOT, 'view-src', 'code-browser');
if (existsSync(join(VIEW_SRC, 'main.tsx'))) {
  await build({
    entryPoints: [join(VIEW_SRC, 'main.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    outfile: join(DIST, 'code-browser.js'),
    logLevel: 'info',
  });

  // Tailwind v4 CLI (build-time devDep): resolve the bin script through the
  // package manifest and run it under THIS node — no .cmd shim, no shell —
  // so the step behaves identically on Windows and CI.
  const require = createRequire(import.meta.url);
  const twPkgPath = require.resolve('@tailwindcss/cli/package.json');
  const twPkg = JSON.parse(readFileSync(twPkgPath, 'utf-8'));
  const twBinRel = typeof twPkg.bin === 'string' ? twPkg.bin : Object.values(twPkg.bin)[0];
  execFileSync(process.execPath, [
    join(dirname(twPkgPath), twBinRel),
    '-i', join(VIEW_SRC, 'styles.css'),
    '-o', join(DIST, 'code-browser.css'),
    '--minify',
  ], { stdio: ['ignore', 'inherit', 'inherit'], cwd: VIEW_SRC });

  const jsKiB = (statSync(join(DIST, 'code-browser.js')).size / 1024).toFixed(0);
  const cssKiB = (statSync(join(DIST, 'code-browser.css')).size / 1024).toFixed(0);
  console.log(`[build] code-browser browser bundle → dist/code-browser.js (${jsKiB} KiB) + dist/code-browser.css (${cssKiB} KiB)`);
}

/* ── shared runtime manifest: runtimeVersion + buildId (NATIVE-INTEROP §"Shared
 *    Runtime Identity" / Workstream B) ──
 *
 * Generated here, AFTER both bundles are final, so:
 *   • runtimeVersion stays in lock-step with the package version (one less
 *     hand-edited bump spot), and
 *   • buildId is a sha256 over the freshly built shared runtime payload, proving
 *     two packages carrying the same runtimeVersion contain the same bytes.
 *
 * The payload = the files a hub/renderer actually executes and serves: the
 * bundled dist/, plus the committed render assets (assets/, components/) and
 * schemas/. Hashed over a deterministic, sorted, POSIX-normalised relative-path
 * list so the SAME payload yields the SAME buildId regardless of OS — the cross-
 * host release invariant (`Claude runtime build ID == Codex runtime build ID`)
 * holds because the payload is COPIED, not rebuilt, into both packages.
 */
const PKG_VERSION = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf-8')).version ?? '';
const buildId = computeBuildId(PLUGIN_ROOT, RUNTIME_BUILD_DIRS);
const manifest = {
  family: 'sdlc-workflow',
  hubName: 'sdlc-workflow-hub',
  runtimeVersion: PKG_VERSION,
  hubProtocolVersion: 1,
  artifactSchema: 'sdlc/v1',
  registryVersion: 2,
  hubConfigVersion: 1,
  buildId,
};
writeFileSync(join(PLUGIN_ROOT, 'runtime-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
console.log(`[build] runtime-manifest.json → runtimeVersion ${PKG_VERSION}, buildId ${buildId.slice(0, 12)}…`);
