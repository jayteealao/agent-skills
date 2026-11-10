// Every failure of the smaller scripts names its fix: ideate-sources.mjs (JSON), yolo-watch.mjs
// and stage-yolo-driver.mjs (fix lines on stderr), and release.mjs (each stop is the person's).
// A table per script drives each failure class and checks who repairs it and that a command
// names a real sub-command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ReleaseStop, checkCi, nextCatalogVersion, nextVersion } from '../../scripts/release.mjs';
import { assertFix, fixFromLines } from '../helpers/fix-shape.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = (name) => path.join(pluginRoot, 'scripts', name);
const node = (name, args, opts = {}) => spawnSync(process.execPath, [script(name), ...args], { encoding: 'utf8', ...opts });

function project() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'scripts-fix-'));
  const dir = path.join(root, '.ai', 'workflows', 'idea');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: idea\nstatus: active\nworkflow-type: ideate\n---\n');
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('ideate-sources.mjs: each failure class names its fix', async () => {
  const p = project();
  const home = mkdtempSync(path.join(os.tmpdir(), 'scripts-fix-home-'));
  try {
    writeFileSync(path.join(p.dir, 'bad.json'), '{ not json');
    // [label, argv, who, command?, error pattern]
    const table = [
      ['issues with no source id', ['issues', p.root, 'idea', 'x', 'issues'], 'agent', true, /needs a source id/],
      ['issues of no workflow', ['issues', p.root, 'nope', 'S01', 'issues'], 'agent', true, /no workflow nope/],
      ['issues of an origin that is no issue source', ['issues', p.root, 'idea', 'S01', 'https://example.com/x'], 'agent', false, /is not an issue source/],
      ['reference with no source id', ['reference', p.root, 'idea', 'x', 'a.md'], 'agent', true, /needs a source id/],
      ['reference of a file that is not there', ['reference', p.root, 'idea', 'S01', 'references/docs/none.md'], 'agent', false, /no copied file/],
      ['reference of a copy outside references/', ['reference', p.root, 'idea', 'S01', 'bad.json'], 'agent', false, /under references/],
      ['check with no lead record', ['check', p.root, 'idea'], 'agent', false, /no 01-ideate\.md/],
      ['pick with no input', ['pick', p.root, 'idea'], 'agent', true, /needs the input file/],
    ];
    for (const [label, argv, who, command, pattern] of table) {
      const r = node('ideate-sources.mjs', argv, { env: { ...process.env, SDLC_HOME: home } });
      assert.equal(r.status, 1, `${label}: ${r.stderr}`);
      const out = JSON.parse(r.stdout);
      assert.equal(out.ok, false, label);
      assert.match(out.error, pattern, label);
      await assertFix(out.fix, { who, command });
    }
    // A lead record that fails its check: the agent repairs the entries, then runs check again.
    writeFileSync(path.join(p.dir, '01-ideate.md'), '---\nschema: sdlc/v1\ntype: ideate\nslug: idea\nsources:\n  - id: S01\n    kind: issues\n    origin: issues\n    state: read\n---\n');
    const check = node('ideate-sources.mjs', ['check', p.root, 'idea']);
    const out = JSON.parse(check.stdout);
    if (!out.ok) {
      assert.ok(out.problems.length);
      await assertFix(out.fix, { who: 'agent', command: true });
    }
    const pick = JSON.parse(node('ideate-sources.mjs', ['pick', p.root, 'idea', path.join(p.dir, 'bad.json')]).stdout);
    assert.match(pick.error, /does not parse/);
    await assertFix(pick.fix, { who: 'agent', command: true });
  } finally {
    p.done();
    rmSync(home, { recursive: true, force: true });
  }
});

test('yolo-watch.mjs: each refusal prints its fix lines on stderr', async () => {
  const p = project();
  try {
    const table = [
      ['note with no text', ['note', p.root, 'idea'], 1, 'agent', false, ''],
      ['control with another action', ['control', p.root, 'idea', 'pause'], 1, 'agent', true, null],
      ['control stop at no stage', ['control', p.root, 'idea', 'stop', 'nowhere'], 1, 'agent', true, null],
      ['stop-check with no slug', ['stop-check', p.root], 2, 'agent', true, null],
      ['the watch of no workflow', [p.root, 'nope'], 2, 'agent', true, null],
      ['the watch with no slug', [p.root], 2, 'agent', true, null],
    ];
    for (const [label, argv, status, who, command, input] of table) {
      const r = node('yolo-watch.mjs', argv, { input: input ?? '' });
      assert.equal(r.status, status, `${label}: ${r.stderr}`);
      const fix = fixFromLines(r.stderr);
      assert.ok(fix, `${label}: fix lines in ${r.stderr}`);
      await assertFix(fix, { who, command });
    }
  } finally { p.done(); }
});

test('stage-yolo-driver.mjs: a root with no workflows and an unknown driver name their fix', async () => {
  const p = project();
  const bare = mkdtempSync(path.join(os.tmpdir(), 'scripts-fix-bare-'));
  try {
    const none = node('stage-yolo-driver.mjs', [bare]);
    assert.equal(none.status, 1);
    assert.match(none.stderr, /no \.ai\/workflows/);
    await assertFix(fixFromLines(none.stderr), { who: 'agent', command: true });
    const driver = node('stage-yolo-driver.mjs', [p.root, '--driver', 'campaign']);
    assert.equal(driver.status, 1);
    await assertFix(fixFromLines(driver.stderr), { who: 'agent', command: true });
    const usage = node('stage-yolo-driver.mjs', []);
    assert.equal(usage.status, 2);
    await assertFix(fixFromLines(usage.stderr), { who: 'agent', command: true });
  } finally {
    p.done();
    rmSync(bare, { recursive: true, force: true });
  }
});

test('release.mjs: every stop is the person\'s, and names no command', async () => {
  const stopOf = (fn) => { try { fn(); } catch (e) { assert.ok(e instanceof ReleaseStop, e.message); return e; } assert.fail('no stop'); };
  const stops = [
    stopOf(() => nextVersion('one', 'patch')),
    stopOf(() => nextVersion('10.0.0-next.3', 'minor')),
    stopOf(() => nextVersion('1.0.0', 'huge')),
    stopOf(() => nextCatalogVersion('x', 'patch')),
  ];
  for (const e of stops) await assertFix(e.fix, { who: 'person', command: false });
  const ctx = (status, stdout, stderr = '') => ({ repoRoot: '.', branch: 'master', run: () => ({ status, stdout, stderr }) });
  const runs = (fields) => JSON.stringify([{ status: 'completed', conclusion: 'success', headSha: 'abcdef1234567890', url: 'https://ci/1', ...fields }]);
  for (const ci of [checkCi(ctx(1, '', 'HTTP 401')), checkCi(ctx(0, 'nope')), checkCi(ctx(0, runs({ status: 'in_progress' }))), checkCi(ctx(0, runs({ conclusion: 'failure' })))]) {
    assert.equal(ci.ok, false);
    await assertFix(ci.fix, { who: 'person', command: false });
  }
  // Every stop of the source names its fix: a stop with one argument would fall back to the generic sentence.
  const src = readFileSync(script('release.mjs'), 'utf8');
  const bare = [...src.matchAll(/\bstop\((`[^`]*`|'[^']*')\)/g)].map((m) => m[0]);
  assert.deepEqual(bare, [], 'each stop(...) of release.mjs passes its fix');
});
