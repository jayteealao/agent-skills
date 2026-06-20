#!/usr/bin/env node
// scripts/verify-runtime.mjs
//
// Self-contained shared-runtime integrity + identity check (NATIVE-INTEROP
// Workstream D, "byte/hash parity verification" + "self-contained execution").
// Bundled into dist/ so it ships INSIDE the runtime payload — meaning either
// package (or a materialized ~/.sdlc/runtime/<buildId>) can verify ITSELF with
// no dependency on the other plugin:
//
//     node <runtimeRoot>/dist/verify-runtime.mjs        # verifies <runtimeRoot>
//
// It proves three things, all locally:
//   1. every payload entry needed for standalone hub/render/serve/heal is present
//   2. the runtime-manifest.json is well-formed and carries a buildId
//   3. the payload bytes actually REPRODUCE that buildId (computeBuildId over
//      dist/assets/components/schemas) — so a claimed identity can't lie
//
// This is the "Codex alone can verify its runtime" tool. The cross-PACKAGE
// byte-for-byte parity check (Claude payload vs Codex payload) lives in the
// Claude-side sync script (scripts/sync-codex-runtime.mjs --check), which needs
// both packages present; this one needs only the single runtime it is run from.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { RUNTIME_BUILD_DIRS, computeBuildId } from '../lib/runtime-buildid.mjs';

// The full self-contained payload — a superset of the buildId inputs. docs/site
// and tests/frontmatter.schema.json are required for operation but not hashed
// (see lib/runtime-buildid.mjs). Mirrors runtime-store PAYLOAD_DIRS/PAYLOAD_FILES.
const REQUIRED = [
  'dist',
  'assets',
  'components',
  'schemas',
  join('docs', 'site'),
  'runtime-manifest.json',
  join('tests', 'frontmatter.schema.json'),
];

/**
 * Verify a runtime root. Never throws — returns a structured result.
 * @param {string} runtimeRoot
 * @returns {{ ok:boolean, runtimeRoot:string, runtimeVersion:(string|null),
 *   declaredBuildId:(string|null), computedBuildId:(string|null),
 *   problems:string[] }}
 */
export function verifyRuntime(runtimeRoot) {
  const problems = [];
  for (const r of REQUIRED) {
    if (!existsSync(join(runtimeRoot, r))) problems.push(`missing required payload entry: ${r}`);
  }

  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(join(runtimeRoot, 'runtime-manifest.json'), 'utf-8'));
  } catch {
    problems.push('runtime-manifest.json missing or unparseable');
  }

  let computed = null;
  if (manifest) {
    if (!manifest.buildId) {
      problems.push('runtime-manifest.json carries no buildId (unbuilt source tree?)');
    } else {
      computed = computeBuildId(runtimeRoot, RUNTIME_BUILD_DIRS);
      if (computed !== manifest.buildId) {
        problems.push(
          `buildId mismatch: payload reproduces ${short(computed)} but manifest claims ${short(manifest.buildId)}`,
        );
      }
    }
  }

  return {
    ok: problems.length === 0,
    runtimeRoot,
    runtimeVersion: manifest?.runtimeVersion ?? null,
    declaredBuildId: manifest?.buildId ?? null,
    computedBuildId: computed,
    problems,
  };
}

function short(h) { return typeof h === 'string' ? `${h.slice(0, 12)}…` : String(h); }

// ── CLI ──────────────────────────────────────────────────────────────────────
// Default root = the runtime this file lives in: one level up from the file
// (scripts/ at source, dist/ when bundled) lands on the plugin/runtime root.
function selfDefaultRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

function parseArgs(argv) {
  const opts = { root: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') opts.root = argv[++i];
    else if (a.startsWith('--root=')) opts.root = a.slice('--root='.length);
    else if (a === '--json') opts.json = true;
  }
  return opts;
}

function runCli() {
  const opts = parseArgs(process.argv.slice(2));
  const root = opts.root ? resolve(opts.root) : selfDefaultRoot();
  const result = verifyRuntime(root);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(
      `[verify-runtime] OK  runtimeVersion=${result.runtimeVersion} buildId=${short(result.declaredBuildId)}\n` +
        `[verify-runtime] ${root}\n`,
    );
  } else {
    process.stderr.write(`[verify-runtime] FAIL  ${root}\n`);
    for (const p of result.problems) process.stderr.write(`  - ${p}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}

// Run the CLI only when invoked directly (not when imported by a test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
