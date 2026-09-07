// W11.3 — conditional SessionStart + ephemeral registry roots (WIDE-VIEW-REPAIR-PLAN §14.2.3).
//
// (1) sessionStartDecision: the three early returns (no workflows, outside git,
//     compact) and the hub-ensure sources (startup, resume only).
// (2) ephemeralRootReason: temp dir (given or realpath form), .claude/worktrees,
//     the Claude scratchpad; case- and separator-insensitive.
// (3) validateEntry refuses each of the three prefixes unless allowEphemeral.
// (4) isInsideGitCheckout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { HUB_ENSURE_SOURCES, sessionStartDecision } from '../../../lib/session-start-policy.mjs';
import { ephemeralRootReason, validateEntry } from '../../../lib/registry.mjs';
import { isInsideGitCheckout } from '../../../lib/project-root.mjs';

const ok = { source: 'startup', hasWorkflows: true, insideGit: true };

test('sessionStartDecision: enqueue + hub-ensure only for a workflow repo inside git on startup/resume', () => {
  assert.deepEqual(sessionStartDecision(ok), { enqueue: true, ensureHub: true, reason: 'session start' });
  assert.deepEqual(sessionStartDecision({ ...ok, source: 'resume' }), { enqueue: true, ensureHub: true, reason: 'session start' });
  assert.deepEqual(sessionStartDecision({ ...ok, source: null }), { enqueue: true, ensureHub: true, reason: 'session start' }, 'a host that sends no source is treated as a start');
  assert.deepEqual(sessionStartDecision({ ...ok, source: 'clear' }), { enqueue: true, ensureHub: false, reason: 'source clear: enqueue only' });
  assert.deepEqual(sessionStartDecision({ ...ok, source: 'compact' }), { enqueue: false, ensureHub: false, reason: 'source compact' });
  assert.deepEqual(sessionStartDecision({ ...ok, hasWorkflows: false }), { enqueue: false, ensureHub: false, reason: 'no .ai/workflows' });
  assert.deepEqual(sessionStartDecision({ ...ok, insideGit: false }), { enqueue: false, ensureHub: false, reason: 'not inside a git checkout' });
  assert.deepEqual(sessionStartDecision({ ...ok, bootstrapDisabled: true }), { enqueue: false, ensureHub: false, reason: 'bootstrap disabled' });
  assert.equal(sessionStartDecision({ ...ok, ensureHubEnabled: false }).ensureHub, false, 'config can switch hub-ensure off');
  assert.deepEqual([...HUB_ENSURE_SOURCES].sort(), ['resume', 'startup']);
});

test('ephemeralRootReason: temp (given and realpath forms), worktree, scratchpad, else null', () => {
  const tmp = 'C:\\Users\\x\\AppData\\Local\\Temp';
  assert.equal(ephemeralRootReason('C:\\Users\\x\\AppData\\Local\\Temp\\sdlc-e2e-1', { tmpDir: tmp }), 'temp');
  assert.equal(ephemeralRootReason('c:/users/x/appdata/local/temp', { tmpDir: tmp }), 'temp', 'the temp dir itself, other case and separators');
  assert.equal(ephemeralRootReason('C:\\Users\\x\\AppData\\Local\\Temporary\\r', { tmpDir: tmp }), null, 'a sibling that merely shares the prefix string is not temp');
  assert.equal(ephemeralRootReason('/home/x/dev/app/.claude/worktrees/agent-1', { tmpDir: '/tmp' }), 'worktree');
  assert.equal(ephemeralRootReason('/home/x/dev/app/.claude/worktrees', { tmpDir: '/tmp' }), 'worktree');
  assert.equal(ephemeralRootReason('D:\\data\\claude\\C--x\\f97a0867\\scratchpad\\preflight-repo', { tmpDir: '/tmp' }), 'scratchpad');
  assert.equal(ephemeralRootReason('/home/x/dev/app', { tmpDir: '/tmp' }), null);
  assert.equal(ephemeralRootReason('', { tmpDir: '/tmp' }), null);
  // The real temp dir, in its realpath form, is temp too.
  const real = mkdtempSync(path.join(tmpdir(), 'sdlc-eph-'));
  try { assert.equal(ephemeralRootReason(real), 'temp'); } finally { rmSync(real, { recursive: true, force: true }); }
});

test('validateEntry refuses temp, worktree, and scratchpad roots unless allowEphemeral', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'sdlc-refuse-'));
  const elsewhere = path.join(base, 'not-the-temp-dir');
  const entry = (repoRoot) => {
    mkdirSync(path.join(repoRoot, '.ai', '_view'), { recursive: true });
    return { id: 'x', repoRoot, headBranch: 'main', viewDir: path.join(repoRoot, '.ai', '_view') };
  };
  try {
    // temp: base is under the real tmpdir.
    const temp = validateEntry(entry(path.join(base, 'repo')), { allowEphemeral: false });
    assert.equal(temp.ok, false);
    assert.match(temp.reason, /ephemeral \(temp\)/);

    const wt = validateEntry(entry(path.join(base, 'app', '.claude', 'worktrees', 'agent-1')), { allowEphemeral: false, tmpDir: elsewhere });
    assert.equal(wt.ok, false);
    assert.match(wt.reason, /ephemeral \(worktree\)/);

    const sp = validateEntry(entry(path.join(base, 'claude', 'C--x', 'sess', 'scratchpad', 'repo')), { allowEphemeral: false, tmpDir: elsewhere });
    assert.equal(sp.ok, false);
    assert.match(sp.reason, /ephemeral \(scratchpad\)/);

    // The escape lets the same temp root through to the later checks (here: not a git repo).
    const escaped = validateEntry(entry(path.join(base, 'repo')), { allowEphemeral: true });
    assert.equal(escaped.ok, false);
    assert.match(escaped.reason, /not a git repo/, 'refusal moves past the ephemeral rule');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('isInsideGitCheckout: true inside a fresh repo, false for a plain directory', (t) => {
  if (spawnSync('git', ['--version'], { encoding: 'utf-8' }).status !== 0) { t.skip('git unavailable'); return; }
  const base = mkdtempSync(path.join(tmpdir(), 'sdlc-git-'));
  try {
    const repo = path.join(base, 'repo');
    mkdirSync(path.join(repo, 'sub'), { recursive: true });
    spawnSync('git', ['init', '-q'], { cwd: repo, encoding: 'utf-8' });
    assert.equal(isInsideGitCheckout(repo), true);
    assert.equal(isInsideGitCheckout(path.join(repo, 'sub')), true, 'a sub-directory is inside the checkout');
    const plain = path.join(base, 'plain');
    mkdirSync(plain);
    // Only meaningful when the temp dir itself is not inside a checkout.
    if (!isInsideGitCheckout(base)) assert.equal(isInsideGitCheckout(plain), false);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
