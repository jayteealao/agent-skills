// tests/unit/hooks/host-signal.test.mjs — the host-identity contract
// (SINGLE-SOURCE-PLAN §3.4 / W4).
//
// One tree serves both hosts, so nothing may infer the host from its own path.
// SDLC_HOST is the entrypoint signal: the Codex hook adapter sets it, Claude Code
// never does, and code defaults to 'claude'. This guard pins the one site whose
// failure mode is silent — the seed-memory notice is a Claude-only
// `systemMessage`; under SDLC_HOST=codex it must be suppressed, and it must not
// be suppressed by accident when the signal is absent.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

import { runBundled } from '../../../hooks/_adapter.mjs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const PKG_ROOT = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));
const SEED = join(PKG_ROOT, 'hooks', 'seed-memory.mjs');

function freshRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'sdlc-host-signal-'));
  mkdirSync(join(repo, '.ai', 'workflows'), { recursive: true }); // sdlc-engaged, unseeded
  return repo;
}

function runSeed(repo, env) {
  const base = { ...process.env };
  delete base.SDLC_HOST;
  delete base.SDLC_DISABLE_MEMORY_SEED;
  delete base.SDLC_DISPATCH_ACTIVE;
  delete base.CLAUDE_PLUGIN_INSTALL;
  return execFileSync(process.execPath, [SEED], {
    input: JSON.stringify({ cwd: repo, hook_event_name: 'SessionStart' }),
    cwd: repo,
    encoding: 'utf-8',
    env: { ...base, ...env },
  });
}

test('seed-memory emits the one-time notice when no host signal is set (Claude Code default)', () => {
  const repo = freshRepo();
  try {
    const out = runSeed(repo, {});
    assert.match(out, /systemMessage/, 'first insert on Claude Code announces itself');
    assert.match(readFileSync(join(repo, 'AGENTS.md'), 'utf-8'), /sdlc:wf-rules/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('seed-memory seeds silently under SDLC_HOST=codex — the notice channel is Claude-only', () => {
  const repo = freshRepo();
  try {
    const out = runSeed(repo, { SDLC_HOST: 'codex' });
    assert.equal(out.trim(), '', 'no systemMessage under Codex');
    assert.match(readFileSync(join(repo, 'AGENTS.md'), 'utf-8'), /sdlc:wf-rules/, 'the seed itself still runs');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('no source file infers the host from its own path or plugin directory name', () => {
  const offenders = [];
  const scan = (rel) => {
    const src = readFileSync(join(PKG_ROOT, rel), 'utf-8');
    if (/import\.meta\.url\.includes\(['"]sdlc-workflow/.test(src)) offenders.push(rel);
    if (/sdlc-workflow-codex/.test(src)) offenders.push(`${rel} (names the deleted tree)`);
  };
  for (const rel of [
    'hooks/seed-memory.mjs', 'hooks/session-start-orient.mjs', 'hooks/render-on-artifact-write.mjs',
    'hooks/_adapter.mjs', 'hooks/session-start.mjs', 'lib/hub-lifecycle.mjs', 'lib/runtime-manifest.mjs',
    'scripts/hub-serve.mjs',
  ]) scan(rel);
  assert.deepEqual(offenders, []);
});

test('hub-serve falls back to the entrypoint signal when run directly', () => {
  const src = readFileSync(join(PKG_ROOT, 'scripts', 'hub-serve.mjs'), 'utf-8');
  assert.match(src, /process\.env\.SDLC_HUB_STARTED_BY \|\| process\.env\.SDLC_HOST \|\| 'claude'/);
});

test('runBundled spawns with SDLC_HOST=codex and strips an inherited SDLC_HUB_STARTED_BY', () => {
  // The Codex adapter's ONLY way to tell the shared entrypoints which host they
  // run under is the env it spawns them with. Prove the spawn, not the caller:
  // a temp dist/ entry echoes the two variables back (v9.153.1 — the earlier
  // assertion on session-start's empty stdout could not see this).
  const root = mkdtempSync(join(tmpdir(), 'sdlc-runbundled-'));
  const prevHost = process.env.SDLC_HOST;
  const prevStartedBy = process.env.SDLC_HUB_STARTED_BY;
  try {
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'echo-env.mjs'),
      "process.stdout.write(JSON.stringify({ host: process.env.SDLC_HOST ?? null, startedBy: process.env.SDLC_HUB_STARTED_BY ?? null }));\n");
    delete process.env.SDLC_HOST;
    process.env.SDLC_HUB_STARTED_BY = 'claude'; // an inherited value from a Claude-started parent
    const res = runBundled(root, 'echo-env', {}, { cwd: root, timeoutMs: 10000 });
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), { host: 'codex', startedBy: null });
  } finally {
    if (prevHost === undefined) delete process.env.SDLC_HOST; else process.env.SDLC_HOST = prevHost;
    if (prevStartedBy === undefined) delete process.env.SDLC_HUB_STARTED_BY; else process.env.SDLC_HUB_STARTED_BY = prevStartedBy;
    rmSync(root, { recursive: true, force: true });
  }
});
