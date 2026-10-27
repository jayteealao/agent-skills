// lib/test-profile.mjs and `wf.mjs profile`: the suites of a project and their times.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { TIME_BOX_FLOOR_SECONDS, readProfile, recordRun, suiteSeconds, timeBox } from '../../lib/test-profile.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function fixture(cfg) {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-profile-'));
  mkdirSync(path.join(root, '.ai'), { recursive: true });
  if (cfg) writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), `${JSON.stringify(cfg, null, 2)}\n`);
  return { root, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('suiteSeconds: the measured time wins over the estimate; an unknown suite has none', () => {
  const p = { fast: { command: 'a', estimateSeconds: 10, measuredSeconds: 40 }, full: { command: 'b', estimateSeconds: 300 }, heavy: { command: 'c' } };
  assert.equal(suiteSeconds(p, 'fast'), 40);
  assert.equal(suiteSeconds(p, 'full'), 300);
  assert.equal(suiteSeconds(p, 'heavy'), null);
  assert.equal(suiteSeconds(p, 'affected'), null);
});

test('timeBox: three times the suite time plus the work, never under the floor', () => {
  const p = { full: { command: 'b', estimateSeconds: 400 }, heavy: { command: 'c', measuredSeconds: 200 } };
  assert.deepEqual(timeBox(p, ['full', 'heavy']), { seconds: 1800, from: ['full', 'heavy'] });
  assert.deepEqual(timeBox(p, ['full'], { workSeconds: 100 }), { seconds: 1300, from: ['full'] });
  assert.deepEqual(timeBox({}, ['fast']), { seconds: TIME_BOX_FLOOR_SECONDS, from: [] });
});

test('recordRun writes the measured time and keeps the other settings', () => {
  const f = fixture({ checks: 'warn', testProfile: { fast: { command: 'npm test', estimateSeconds: 30 } } });
  try {
    assert.deepEqual(recordRun(f.root, 'fast', 41.6, { now: '2026-10-24T10:00:00Z' }), { command: 'npm test', estimateSeconds: 30, measuredSeconds: 42, measuredAt: '2026-10-24T10:00:00Z' });
    const cfg = JSON.parse(readFileSync(path.join(f.root, '.ai', 'sdlc-config.json'), 'utf8'));
    assert.equal(cfg.checks, 'warn');
    assert.equal(readProfile(f.root).fast.measuredSeconds, 42);
    assert.throws(() => recordRun(f.root, 'full', 10), /no command for the full suite/);
    assert.throws(() => recordRun(f.root, 'slow', 10), /suite must be one of/);
    assert.throws(() => recordRun(f.root, 'fast', -1), /0 or more/);
  } finally { f.done(); }
});

test('setSuite writes the command and the estimate, keeps a measured time, and makes a missing config', async () => {
  const { setSuite } = await import('../../lib/test-profile.mjs');
  const f = fixture();
  try {
    assert.deepEqual(setSuite(f.root, 'full', { command: ' npm run test:all ', estimateSeconds: 600 }), { command: 'npm run test:all', estimateSeconds: 600 });
    recordRun(f.root, 'full', 500, { now: 'x' });
    assert.deepEqual(setSuite(f.root, 'full', { command: 'npm run test:all', estimateSeconds: 700 }), { command: 'npm run test:all', estimateSeconds: 700, measuredSeconds: 500, measuredAt: 'x' });
    assert.throws(() => setSuite(f.root, 'full', { command: '', estimateSeconds: 1 }), /needs a command/);
    assert.throws(() => setSuite(f.root, 'full', { command: 'x', estimateSeconds: 1.5 }), /whole number/);
  } finally { f.done(); }
});

test('discoverHookCommands reads a lefthook.yml pre-push command and the other hook sources', async () => {
  const { discoverHookCommands, suiteOfCommand } = await import('../../lib/repo-hooks.mjs');
  const f = fixture();
  try {
    writeFileSync(path.join(f.root, 'lefthook.yml'), [
      'pre-push:',
      '  parallel: true',
      '  commands:',
      '    coverage:',
      '      run: npm run coverage -- --ci',
      '    off:',
      '      skip: true',
      '      run: npm run never',
      '  jobs:',
      '    - group:',
      '        jobs:',
      '          - run: npm run e2e',
      'pre-commit:',
      '  commands:',
      '    fmt:',
      '      run: npx prettier --check {staged_files}',
      '',
    ].join('\n'));
    mkdirSync(path.join(f.root, '.husky'));
    writeFileSync(path.join(f.root, '.husky', 'pre-push'), '#!/usr/bin/env sh\n. "$(dirname -- "$0")/_/husky.sh"\n\nnpm run lint \\\n  --max-warnings 0\n');
    writeFileSync(path.join(f.root, '.pre-commit-config.yaml'), 'repos:\n  - repo: local\n    hooks:\n      - id: tests\n        entry: pytest -q\n        language: system\n        stages: [pre-push]\n      - id: black\n');
    mkdirSync(path.join(f.root, '.git', 'hooks'), { recursive: true });
    writeFileSync(path.join(f.root, '.git', 'hooks', 'pre-push'), '#!/bin/sh\nset -e\n./gradlew check\nexit 0\n');
    writeFileSync(path.join(f.root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\n# lefthook writes this file\nlefthook run pre-commit\n');
    assert.deepEqual(discoverHookCommands(f.root), [
      { hook: 'pre-push', command: 'npm run coverage -- --ci', source: 'lefthook.yml' },
      { hook: 'pre-push', command: 'npm run e2e', source: 'lefthook.yml' },
      { hook: 'pre-commit', command: 'npx prettier --check {staged_files}', source: 'lefthook.yml' },
      { hook: 'pre-push', command: 'npm run lint --max-warnings 0', source: '.husky/pre-push' },
      { hook: 'pre-push', command: 'pre-commit run --hook-stage pre-push --all-files tests', source: '.pre-commit-config.yaml' },
      { hook: 'pre-commit', command: 'pre-commit run --hook-stage pre-commit --all-files black', source: '.pre-commit-config.yaml' },
      { hook: 'pre-push', command: './gradlew check', source: '.git/hooks/pre-push' },
    ]);
    const profile = { fast: { command: 'npm test' }, heavy: { command: 'npm run e2e && npm run  coverage -- --ci' } };
    assert.equal(suiteOfCommand(profile, 'npm run coverage -- --ci'), 'heavy');
    assert.equal(suiteOfCommand(profile, 'npm test'), 'fast');
    assert.equal(suiteOfCommand(profile, './gradlew check'), null);
    const empty = fixture();
    try { assert.deepEqual(discoverHookCommands(empty.root), []); } finally { empty.done(); }
  } finally { f.done(); }
});

test('wf.mjs profile hooks and doctor: a pre-push command in no suite warns; in a suite it does not', () => {
  const f = fixture({ testProfile: { fast: { command: 'npm test', estimateSeconds: 30 } } });
  const cli = (...a) => spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), ...a], { encoding: 'utf8' });
  try {
    assert.equal(cli('doctor', f.root).stdout.trim(), 'ok: every pre-push command is in a suite');
    assert.equal(cli('profile', 'hooks', f.root).stdout.trim(), 'no push or commit hook');
    writeFileSync(path.join(f.root, 'lefthook.yml'), 'pre-push:\n  commands:\n    unit:\n      run: npm test\n    cov:\n      run: npm run coverage\n');
    assert.equal(cli('profile', 'hooks', f.root).stdout.trim(), 'pre-push: `npm test` (lefthook.yml) — in fast\npre-push: `npm run coverage` (lefthook.yml) — in no suite');
    const doc = cli('doctor', f.root);
    assert.equal(doc.status, 0);
    assert.equal(doc.stdout.trim(), 'warn: the pre-push command `npm run coverage` of lefthook.yml is in no suite of the test profile; add it to the heavy suite with profile set');
    cli('profile', 'set', f.root, 'heavy', '--command', 'npm run coverage', '--estimate', '10800');
    assert.deepEqual(JSON.parse(cli('doctor', f.root, '--json').stdout), { ok: true, warnings: [] });
  } finally { f.done(); }
});

test('wf.mjs profile: show, record and timebox', () => {
  const f = fixture({ testProfile: { fast: { command: 'npm test', estimateSeconds: 30 }, affected: { command: 'npm test -- {files}', estimateSeconds: 300 } } });
  const cli = (...a) => spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), 'profile', ...a], { encoding: 'utf8' });
  try {
    assert.equal(cli('show', f.root).stdout, 'fast: `npm test` (30s estimated)\naffected: `npm test -- {files}` (300s estimated)\n');
    assert.equal(cli('record', f.root, 'affected', '100').stdout.trim(), 'affected: 100s measured');
    assert.equal(cli('set', f.root, 'heavy', '--command', 'npm run e2e', '--estimate', '1200').stdout.trim(), 'heavy: `npm run e2e` (1200s estimated)');
    assert.equal(cli('timebox', f.root, 'implement').stdout.trim(), 'implement: 10 minutes (fast, affected)');
    assert.equal(cli('timebox', f.root, 'plan').stdout.trim(), 'plan: 10 minutes (no suite time; the floor)');
    assert.deepEqual(JSON.parse(cli('timebox', f.root, 'verify', '--work', '600', '--json').stdout).seconds, 990);
    const empty = fixture();
    try { assert.equal(cli('show', empty.root).stdout.trim(), 'no test profile'); } finally { empty.done(); }
  } finally { f.done(); }
});
