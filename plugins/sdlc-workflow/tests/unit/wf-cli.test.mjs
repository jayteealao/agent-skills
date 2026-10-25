// scripts/wf.mjs and lib/dispatch.mjs: dispatch, status, index, cost and stamp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { dispatch, dispatchLine, fitForms, parseForm } from '../../lib/dispatch.mjs';
import { loadRegistry } from '../../lib/registry.mjs';
import { INDEX_HEADER, reconcileIndex, stampOf, statusOf } from '../../scripts/wf.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reg = loadRegistry(pluginRoot);
const disk = (slugs = {}, branches = []) => ({
  hasWorkflow: (s) => s in slugs,
  hasWorkflowDir: (s) => s in slugs,
  slicesOf: (s) => slugs[s] ?? [],
  hasBranch: (b) => branches.includes(b),
});
const run = (tokens, d = disk(), opts) => dispatch(reg, tokens, d, opts);

test('parseForm reads choices, optional groups and slots', () => {
  const items = parseForm('<slug>|pr#N|<branch> [<env>|announce|rollback [<run-id>]]');
  assert.equal(items.length, 2);
  assert.deepEqual(items[0].alts.map((a) => a.slot ?? (a.pr ? 'pr' : a.word)), ['slug', 'pr', 'branch']);
  assert.equal(items[1].group.length, 2);
  assert.throws(() => parseForm('[<slug>'), /no closing/);
});

test('fitForms: text takes every token left; a word fits only itself', () => {
  const check = (slot, t) => (slot === 'slug' && t === 'a' ? { ok: true, state: { slug: t } } : { ok: false, reason: `${t} not on disk` });
  assert.equal(fitForms(['<slug> [text]'], ['a', 'x', 'y'], check).ok, true);
  assert.equal(fitForms(['<slug> all'], ['a', 'some'], check).ok, false);
  assert.match(fitForms(['<slug> [text]'], [], check).reason, /missing <slug>/);
});

test('dispatch: empty, not a key, and a missing slug go to the router with the reason', () => {
  assert.deepEqual([run([]).reference, run([]).reason], ['reference/route.md', 'empty']);
  assert.equal(run(['implemnt']).reason, 'not a key');
  const r = run(['implement']);
  assert.equal(r.reference, 'reference/route.md');
  assert.equal(r.argsFrom, 0);
  assert.match(r.reason, /missing <slug>/);
  assert.match(run(['plan', 'the', 'migration']).reason, /the not on disk/);
});

test('dispatch: a slug and a slice on disk fit the plan form; an unknown slice does not', () => {
  const d = disk({ demo: ['one', 'two'] });
  const ok = run(['plan', 'demo', 'two'], d);
  assert.equal(ok.reference, 'reference/plan.md');
  assert.equal(ok.argsFrom, 1);
  assert.match(run(['plan', 'demo', 'three'], d).reason, /three not on disk/);
});

test('dispatch: sub-keys load their own file; loop with no sub-key asks', () => {
  const r = run(['status', 'recap', 'demo'], disk({ demo: [] }));
  assert.deepEqual([r.key, r.reference, r.argsFrom], ['status recap', 'reference/recap.md', 2]);
  const ask = run(['loop']);
  assert.equal(ask.reason, 'ask sub-key');
  assert.deepEqual(ask.subkeys.map((s) => s.name), ['goal', 'optimize', 'prototype']);
  assert.equal(run(['project', 'ship-plan', 'init']).reference, 'reference/ship-plan.md');
});

test('dispatch: the intake fast path, unless the mode word is also a workflow folder', () => {
  const r = run(['intake', 'fix', 'the', 'bug']);
  assert.deepEqual([r.reference, r.argsFrom, r.firstInput], ['reference/intake/fix.md', 2, 'reference/intake/_intake-context.md']);
  assert.equal(run(['intake', 'fix'], disk({ fix: [] })).reference, 'reference/intake.md');
});

test('dispatch: an unsafe token fits only text', () => {
  assert.equal(run(['intake', '@']).reference, 'reference/intake.md');
  assert.equal(run(['implement', '@']).reference, 'reference/route.md');
});

test('dispatch: a host gap stops the key; a different form rides along as a note', () => {
  const gap = run(['loop', 'optimize', 'demo'], disk({ demo: [] }), { host: 'codex' });
  assert.equal(gap.reference, null);
  assert.match(gap.reason, /^host gap: not available/);
  assert.equal(run(['yolo', 'demo'], disk({ demo: [] }), { host: 'codex' }).reference, 'reference/yolo.md');
  assert.equal(run(['yolo', 'demo'], disk({ demo: [] }), { host: 'pi' }).reference, 'reference/yolo.md');
  const part = run(['loop', 'goal', 'demo'], disk({ demo: [] }), { host: 'pi' });
  assert.match(part.hostNote, /^differs: /);
});

test('dispatchLine prints the key, the arguments and the reference', () => {
  const tokens = ['ship', 'pr#12'];
  assert.equal(dispatchLine(run(tokens), tokens), 'wf dispatch: key=ship · args=pr#12 · reference=reference/ship.md');
});

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'wf-cli-'));
  spawnSync('git', ['init', '-q'], { cwd: root });
  const wf = (slug, fm) => {
    mkdirSync(path.join(root, '.ai', 'workflows', slug), { recursive: true });
    writeFileSync(path.join(root, '.ai', 'workflows', slug, '00-index.md'), `---\n${fm}\n---\n`);
  };
  return { root, wf };
}

test('index: bootstraps, keeps an unreadable row, drops a missing folder, and names a command word', async () => {
  const { root, wf } = repo();
  try {
    wf('beta', 'slug: beta\nstatus: active\nworkflow-type: fix\nbranch: b\nupdated-at: "2026-10-01T00:00:00Z"');
    wf('recap', 'slug: recap\nstatus: closed\nupdated-at: "2026-10-01T00:00:00Z"');
    const first = await reconcileIndex(root);
    assert.equal(first.bootstrapped, true);
    const file = path.join(root, '.ai', 'workflows', 'INDEX.md');
    const lines = readFileSync(file, 'utf8').trim().split('\n');
    assert.equal(lines[0], INDEX_HEADER);
    assert.deepEqual(lines.slice(1), ['beta\tactive\tfix\tb\t2026-10-01T00:00:00Z', 'recap\tclosed\tstandard\t\t2026-10-01T00:00:00Z']);
    assert.deepEqual(first.reserved, ['recap']);

    writeFileSync(file, `${readFileSync(file, 'utf8')}gone\tactive\tfix\t\t2026-01-01T00:00:00Z\n`);
    writeFileSync(path.join(root, '.ai', 'workflows', 'beta', '00-index.md'), '# no frontmatter\n');
    const second = await reconcileIndex(root);
    assert.deepEqual(second.removed, ['gone']);
    assert.deepEqual(second.invalid.map((w) => w.slug), ['beta']);
    assert.match(readFileSync(file, 'utf8'), /^beta\tactive\tfix\tb\t/m);
    assert.equal((await reconcileIndex(root, { write: false })).changed, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('status: groups, staleness, the next command, and the detail of one slug', async () => {
  const { root, wf } = repo();
  try {
    wf('a', 'slug: a\nstatus: active\ncurrent-stage: slice\nupdated-at: "2026-10-20T00:00:00Z"\nnext-invocation: /wf slice a');
    wf('b', 'slug: b\nstatus: awaiting-input\nupdated-at: "2026-01-01T00:00:00Z"');
    wf('c', 'slug: c\nstatus: shipped\nupdated-at: "2026-10-20T00:00:00Z"');
    writeFileSync(path.join(root, '.ai', 'workflows', 'a', '03-slice.md'), '---\nstatus: complete\nnext-invocation: /wf plan a one\nslices:\n  - slug: one\n---\n');
    writeFileSync(path.join(root, '.ai', 'workflows', 'a', '04-plan-one.md'), '---\nstatus: complete\n---\n');
    const now = Date.parse('2026-10-24T00:00:00Z');
    const all = await statusOf(root, null, now);
    assert.deepEqual(all.workflows.map((w) => [w.slug, w.group, w.stale]), [['a', 'active', false], ['b', 'blocked', true], ['c', 'completed', false]]);
    const one = await statusOf(root, 'a', now);
    assert.deepEqual(one.slices, [{ slice: 'one', roster: null, plan: 'complete', implement: null, verify: null, review: null, result: null, convergence: null }]);
    assert.equal(one.next.invocation, '/wf plan a one');
    assert.match((await statusOf(root, 'zzz', now)).error, /not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cost sums the ledger per key', () => {
  const { root } = repo();
  try {
    const dir = path.join(root, '.ai', 'workflows', 'a');
    mkdirSync(dir, { recursive: true });
    const row = (key, input) => JSON.stringify({ slug: 'a', key, turn: 1, main: { input_tokens: input, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
    writeFileSync(path.join(dir, 'cost.jsonl'), `${row('plan', 10)}\n${row('plan', 5)}\n${row('verify', 2)}\n`);
    const r = spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), 'cost', root, 'a', '--json'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const agg = JSON.parse(r.stdout);
    assert.equal(agg.byKey.plan.input, 15);
    assert.equal(agg.total.turns, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('stamp prints every required field of a type, with the allowed values of an enum', () => {
  const text = stampOf('handoff', { slug: 'demo', now: '2026-10-24T00:00:00Z' });
  assert.match(text, /^---\nschema: sdlc\/v1\ntype: handoff\nslug: demo\n/);
  assert.match(text, /handoff-mode: aggregate {2}# one of: aggregate \| single-slice/);
  assert.match(text, /created-at: "2026-10-24T00:00:00Z"/);
  assert.match(text, /pr-number: 0/);
  assert.throws(() => stampOf('no-such-type'), /no artifact type/);
});

test('dispatch: an alias runs its reference and names the key that replaces it', () => {
  const shape = run(['shape', 'demo'], disk({ demo: [] }));
  assert.deepEqual([shape.reference, shape.aliasOf], ['reference/shape.md', 'intake']);
  const handoff = run(['handoff', 'demo'], disk({ demo: [] }));
  assert.deepEqual([handoff.reference, handoff.aliasOf], ['reference/ship.md', 'ship']);
  assert.equal(run(['ship', 'demo'], disk({ demo: [] })).aliasOf, undefined);
});

test('status: intake and ship each hold two files; an old stage name finds its file', async () => {
  const { root, wf } = repo();
  try {
    wf('a', 'slug: a\nstatus: active\ncurrent-stage: shape\nupdated-at: "2026-10-20T00:00:00Z"');
    const dir = path.join(root, '.ai', 'workflows', 'a');
    writeFileSync(path.join(dir, '01-intake.md'), '---\nstatus: complete\n---\n');
    const now = Date.parse('2026-10-24T00:00:00Z');
    let one = await statusOf(root, 'a', now);
    assert.deepEqual(one.stages.map((s) => s.stage), ['intake', 'design', 'slice', 'plan', 'implement', 'verify', 'review', 'ship', 'retro']);
    const intake = () => one.stages.find((s) => s.stage === 'intake');
    assert.deepEqual([intake().file, intake().status], ['01-intake.md', 'in-progress'], 'the shape is still to write');
    assert.equal(one.next.file, '02-shape.md', 'current-stage shape is the shape file of intake');
    writeFileSync(path.join(dir, '02-shape.md'), '---\nstatus: complete\nnext-invocation: /wf slice a\n---\n');
    one = await statusOf(root, 'a', now);
    assert.deepEqual([intake().file, intake().status], ['02-shape.md', 'complete']);
    assert.equal(one.next.invocation, '/wf slice a');
    assert.deepEqual(one.stages.find((s) => s.stage === 'ship').files, ['08-handoff.md', '09-ship-runs.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('status: a small-path workflow shows its one note, and review and ship only by hand', async () => {
  const { root, wf } = repo();
  try {
    wf('s', 'slug: s\nstatus: active\nworkflow-type: small\ncurrent-stage: verify\nupdated-at: "2026-10-20T00:00:00Z"');
    const dir = path.join(root, '.ai', 'workflows', 's');
    writeFileSync(path.join(dir, '01-small.md'), '---\nstatus: in-progress\nsmall-path: true\nnext-invocation: /wf intake s\n---\n');
    const one = await statusOf(root, 's', Date.parse('2026-10-24T00:00:00Z'));
    assert.deepEqual(one.stages.map((s) => s.stage), ['intake', 'review', 'ship']);
    assert.deepEqual([one.stages[0].file, one.stages[0].status], ['01-small.md', 'in-progress']);
    assert.equal(one.next.file, '01-small.md');
    assert.equal(one.next.invocation, '/wf intake s');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
