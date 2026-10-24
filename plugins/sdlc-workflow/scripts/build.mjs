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
 * components/). Emitting to the root or to depth-2 would break those.
 *
 *   dist/<hook|script>.mjs        — flat top-level entrypoints (hooks + scripts)
 *   dist/chunk-<hash>.mjs         — shared code (js-yaml, ajv, lib/*) deduped
 *                                   via splitting. MUST stay flat at depth-1:
 *                                   lib/config.mjs & friends read plugin-root
 *                                   files via `resolve(__dirname, '..', 'schemas', …)`.
 *                                   At depth-1 a bundled lib chunk resolves
 *                                   `..` to the plugin root exactly as the
 *                                   source lib/ file does; a `chunks/` subdir
 *                                   (depth-2) would make `..` land on dist/.
 */
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(PLUGIN_ROOT, 'dist');

// Flat top-level entrypoints — every Claude-invoked process.
const HOOK_ENTRIES = [
  'machine-cleanup',        // SessionStart — the one-time removal of the old hub and tray from this machine; all hosts
  'seed-memory',            // SessionStart — seed the /wf rules kernel (MEMORY-SEED-PLAN); both hosts
  'pre-write-validate',     // PreToolUse
  'leak-guard-bash',        // PreToolUse(Bash) — EOB leak guard, advisory-first (HOOKS-SEMANTIC Phase 1)
  'leak-guard-write',       // PreToolUse(Write|Edit) — EOB leak guard for public-doc paths
  'post-write-auto-stage',  // PostToolUse
  'post-write-verify',      // PostToolUse
  'pre-tool-use-all',       // PreToolUse — ONE process: validate → leak guards (WIDE-VIEW §14.2.6)
  'post-tool-use-all',      // PostToolUse — ONE process: auto-stage → verify
  'cost-ledger',            // Stop — exact cost ledger, appends .ai/workflows/<slug>/cost.jsonl (WIDE-VIEW-REPAIR-PLAN §10); both hosts
];
const SCRIPT_ENTRIES = [
  'doctor',                  // machine-state report (npm run doctor)
  'campaign',                // /wf campaign: the list check and write, the serial walk over the packets, the migration; run via skills/wf/scripts/campaign.mjs (WF-PIECES-PLAN)
  'design-boards',           // /wf design: render, contact sheet, freeze, check the boards; run via skills/wf/scripts/design-boards.mjs (DESIGN-BOARDS-PLAN)
  'goal',                    // /wf loop goal: the contract, the check that prints the GOAL: line, park, clear; run via skills/wf/scripts/goal.mjs (WF-GOAL-PLAN)
  'optimize',                // /wf loop optimize: baseline, trials, branch rounds, checkpoints, finish; run via skills/wf/scripts/optimize.mjs (WF-OPTIMIZE-PLAN)
  'prototype',               // /wf loop prototype: the POC worktree, the ledger check, the report, decide commits, exit; run via skills/wf/scripts/prototype.mjs (WF-PROTOTYPE-PLAN)
  'ideate-sources',          // /wf intake ideate with sources: argument kinds, gh issues, reference rows, coverage check; run via skills/wf/scripts/ideate-sources.mjs (WF-IDEATE-SOURCES-PLAN)
];

const entryPoints = [
  ...HOOK_ENTRIES.map((n) => ({ in: join(PLUGIN_ROOT, 'hooks', `${n}.mjs`), out: n })),
  ...SCRIPT_ENTRIES.map((n) => ({ in: join(PLUGIN_ROOT, 'scripts', `${n}.mjs`), out: n })),
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
  // Code-splitting dedupes the heavy CJS deps + shared lib helpers into
  // flat chunks instead of copying them into every entry.
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

const outFiles = Object.keys(result.metafile.outputs);
const chunkCount = outFiles.filter((f) => /\/chunk-[^/]+\.mjs$/.test(f)).length;
const entryCount = outFiles.length - chunkCount;
const totalBytes = Object.values(result.metafile.outputs).reduce((n, o) => n + o.bytes, 0);
console.log(
  `[build] ${entryPoints.length} entrypoints → ${entryCount} bundles + ${chunkCount} shared chunks ` +
    `(${(totalBytes / 1024).toFixed(0)} KiB) in dist/`,
);
if (result.warnings.length) console.log(`[build] ${result.warnings.length} warning(s)`);
