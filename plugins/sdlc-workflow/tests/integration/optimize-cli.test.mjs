// WF-OPTIMIZE-PLAN W1 — scripts/optimize.mjs against a real git repository. The metric
// prints the number in src/value.txt; the guard fails when src/broken exists. The test
// plays the editor: it writes the change into the worktree, then runs `trial`.
// It walks the opening branch round (D12), a winner, the flushed digests (D13), a plateau
// that opens an extra round and then stops the loop (D14), the path check (D5), the
// squash at finish, and the cleanup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter } from '../../lib/frontmatter.mjs';
import { lifecycleDone } from '../../lib/lifecycle-done.mjs';
import { frontmatterOfDoc, readDoc } from '../../lib/records.mjs';
import { validateFrontmatter } from '../../lib/schema-validator.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(pluginRoot, 'scripts', 'optimize.mjs');
const GOAL = path.join(pluginRoot, 'scripts', 'goal.mjs');
const S = 'speed';

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function run(root, cmd, ...rest) {
  try {
    return JSON.parse(execFileSync(process.execPath, [SCRIPT, cmd, root, S, ...rest], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    return JSON.parse(e.stdout);
  }
}

function specText(over = '') {
  return `---
schema: sdlc/v1
type: optimize-spec
slug: ${S}
objective: "Cut the value"
confirmed-by: jayte
metric:
  command: "node metric.js"
  direction: lower
  repeat: 2
  min-gain: 0
guard:
  command: "node guard.js"
allowed-paths: ["src/**"]
budget:
  trials: 14
  plateau: 2
  wall-clock: 1h
  trial-timeout: 1m
branch-rounds:
  at: ["0%"]
  branches: 2
  branch-trials: 2
  max-extra: 1
${over}---

# Spec

Make the value smaller.
`;
}

function makeRepo(over) {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'optimize-cli-'));
  const root = path.join(parent, 'repo');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  git(parent, 'init', '-q', '-b', 'main', root);
  git(root, 'config', 'user.email', 'o@test');
  git(root, 'config', 'user.name', 'o');
  writeFileSync(path.join(root, 'metric.js'), "const fs = require('fs'); console.log('measuring'); console.log(fs.readFileSync('src/value.txt', 'utf8').trim());\n");
  writeFileSync(path.join(root, 'guard.js'), "process.exit(require('fs').existsSync('src/broken') ? 1 : 0);\n");
  writeFileSync(path.join(root, 'src', 'value.txt'), '100\n');
  writeFileSync(path.join(root, '.gitignore'), '.ai/workflows/*/optimize/\n');
  const wf = path.join(root, '.ai', 'workflows', S);
  mkdirSync(wf, { recursive: true });
  writeFileSync(path.join(wf, '00-index.md'), `---\nschema: sdlc/v1\ntype: index\nslug: ${S}\nworkflow-type: optimize\nbranch: main\nreview-scope: per-slice\n---\n`);
  writeFileSync(path.join(wf, '02-optimize-spec.md'), specText(over));
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  return { parent, root, wt: path.join(parent, 'repo.optimize', S) };
}
const edit = (wt, value, extra = {}) => {
  writeFileSync(path.join(wt, 'src', 'value.txt'), `${value}\n`);
  for (const [p, t] of Object.entries(extra)) { mkdirSync(path.dirname(path.join(wt, p)), { recursive: true }); writeFileSync(path.join(wt, p), t); }
};
function step(root, wt, id, value, extra) {
  const ctx = run(root, 'propose-context');
  assert.equal(ctx.ok, true, JSON.stringify(ctx));
  if (value !== null) edit(wt, value, extra);
  const t = run(root, 'trial', id, '--hypothesis', `set the value to ${value}`);
  assert.equal(t.ok, true, JSON.stringify(t));
  return { ctx, t };
}

test('the loop: an opening round, a winner, a plateau that adds a round and then stops, finish and cleanup', () => {
  const { parent, root, wt } = makeRepo();
  try {
    const b = run(root, 'baseline');
    assert.equal(b.ok, true, JSON.stringify(b));
    assert.equal(b.baseline.median, 100);
    assert.equal(b.baseline.noise, 0);
    assert.equal(b.next.action, 'round-open', 'the 0% round opens from the baseline');
    assert.equal(run(root, 'trial', 'h0').ok, false, 'no trial before the scheduled round opens');

    const r1 = run(root, 'round-open');
    assert.equal(r1.ok, true, JSON.stringify(r1));
    assert.deepEqual(r1.branches, [`optimize/${S}--r1b1`, `optimize/${S}--r1b2`]);

    const a = step(root, wt, 'h1', 90);
    assert.equal(a.ctx.digest.lane, `optimize/${S}--r1b1`);
    assert.equal(a.ctx.digest.flushed, true);
    assert.equal(a.t.verdict, 'kept');
    const c = step(root, wt, 'h2', 95);
    assert.equal(c.ctx.digest.lane, `optimize/${S}--r1b2`, 'the branches take trials in turn');
    assert.deepEqual(c.ctx.digest.trials, [], 'branch 2 does not see the trials of branch 1');
    assert.equal(c.t.verdict, 'kept');
    assert.equal(step(root, wt, 'h3', 80).t.verdict, 'kept');
    const out = step(root, wt, 'h4', 70, { 'lib/x.js': 'x' });
    assert.equal(out.t.verdict, 'rejected', 'D5: lib/x.js is outside allowed-paths');
    assert.equal(readFileSync(path.join(wt, 'src', 'value.txt'), 'utf8').trim(), '95', 'the rejected change is reset');

    const close = run(root, 'round-close');
    assert.equal(close.ok, true, JSON.stringify(close));
    assert.equal(close.winner.name, `optimize/${S}--r1b1`);
    assert.equal(close.best.value, 80);
    assert.equal(git(root, 'branch', '--list', `optimize/${S}--*`), '', 'the round branches are deleted');

    const t1 = step(root, wt, 'h5', 85);
    assert.deepEqual(t1.ctx.digest.trials.map((x) => x.trial), [1, 3], 'the trunk digest restarts from the trials of the winner');
    assert.equal(t1.t.verdict, 'reverted');
    const t2 = step(root, wt, 'h6', 70, { 'src/broken': '' });
    assert.equal(t2.t.verdict, 'reverted');
    assert.equal(t2.t.reason, 'the guard failed (exit 1)');
    assert.equal(existsSync(path.join(wt, 'src', 'broken')), false);

    const st = run(root, 'status');
    assert.deepEqual([st.next.action, st.next.point], ['round-open', 'extra'], 'D14: the plateau opens an extra round, not a stop');
    assert.equal(run(root, 'round-open').reason, 'plateau');
    for (let i = 0; i < 4; i++) assert.equal(step(root, wt, `p${i}`, 81).t.verdict, 'reverted');
    const pc = run(root, 'round-close');
    assert.equal(pc.winner, 'trunk');
    assert.deepEqual([pc.state, pc.reason], ['stopped', 'plateau'], 'a plateau round with no winner stops the loop');

    const g = execFileSync(process.execPath, [GOAL, 'arm', root, S], { encoding: 'utf8' });
    assert.equal(JSON.parse(g).kind, 'optimize');
    const check = execFileSync(process.execPath, [GOAL, 'check', root, S], { encoding: 'utf8' }).trim().split(/\r?\n/).at(-1);
    assert.match(check, /^GOAL: BLOCKED optimize stopped: plateau/);

    const fin = run(root, 'finish');
    assert.equal(fin.ok, true, JSON.stringify(fin));
    assert.equal(fin.kept, 2);
    assert.equal(readFileSync(path.join(root, 'src', 'value.txt'), 'utf8').trim(), '80', 'the squash lands on the slug branch');
    assert.equal(git(root, 'log', '-1', '--format=%s'), 'Cut the value: 100 to 80');
    // finish writes the slice records into the record layout; the spec of the old layout stays where it is.
    const dir = path.join(root, '.ai', 'workflows', S);
    for (const f of ['slices.yaml', 'slice-optimize.yaml']) assert.ok(existsSync(path.join(dir, f)), f);
    for (const f of ['03-slice.md', '03-slice-optimize.md', '05-implement-optimize.md']) assert.ok(!existsSync(path.join(dir, f)), f);
    assert.match(readDoc(dir, '03-slice-optimize.md').body, /`node guard\.js` exits 0/);
    assert.deepEqual(frontmatterOfDoc(dir, '05-implement-optimize.md')['files-modified'], fin.files);
    assert.equal(frontmatterOfDoc(dir, '05-implement-optimize.md')['commit-sha'], fin.commit);
    assert.deepEqual(lifecycleDone(root, S).next, { stage: 'verify', slice: 'optimize' });
    const v = validateFrontmatter(parseFrontmatter(readFileSync(path.join(dir, 'goal.md'), 'utf8')).data);
    assert.equal(v.valid, true, `goal.md: ${JSON.stringify(v.errors)}`);
    for (const name of ['02-optimize-spec.md', '03-slice.md', '03-slice-optimize.md', '05-implement-optimize.md']) {
      const r = validateFrontmatter(frontmatterOfDoc(dir, name));
      assert.equal(r.valid, true, `${name}: ${JSON.stringify(r.errors)}`);
    }

    const results = readFileSync(path.join(root, '.ai', 'workflows', S, 'optimize', 'results.jsonl'), 'utf8').trim().split(/\r?\n/).map((l) => JSON.parse(l));
    assert.equal(results.filter((r) => r.event === 'trial').length, 10);
    assert.deepEqual(results.filter((r) => r.event !== 'trial').map((r) => r.event), ['baseline', 'round-open', 'round-close', 'round-open', 'round-close', 'finish']);

    const cl = run(root, 'cleanup');
    assert.equal(cl.ok, true, JSON.stringify(cl));
    assert.equal(existsSync(wt), false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('state-error: a branch that moved outside the loop stops it, and nothing is repaired', () => {
  const { parent, root, wt } = makeRepo();
  try {
    assert.equal(run(root, 'baseline').ok, true);
    writeFileSync(path.join(wt, 'src', 'value.txt'), '1\n');
    git(wt, 'commit', '-q', '-am', 'by hand');
    const st = run(root, 'status');
    assert.deepEqual([st.state, st.reason], ['stopped', 'state-error']);
    assert.equal(run(root, 'round-open').ok, false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('the baseline refuses an unconfirmed spec, a red guard, and the project root as the worktree', () => {
  const unconfirmed = makeRepo();
  try {
    const f = path.join(unconfirmed.root, '.ai', 'workflows', S, '02-optimize-spec.md');
    writeFileSync(f, readFileSync(f, 'utf8').replace('confirmed-by: jayte\n', ''));
    assert.match(run(unconfirmed.root, 'baseline').error, /confirmed-by/);
  } finally { rmSync(unconfirmed.parent, { recursive: true, force: true }); }
  const red = makeRepo();
  try {
    writeFileSync(path.join(red.root, 'src', 'broken'), '');
    git(red.root, 'add', '.');
    git(red.root, 'commit', '-q', '-m', 'red');
    const r = run(red.root, 'baseline');
    assert.equal(r.guardRed, true, JSON.stringify(r));
  } finally { rmSync(red.parent, { recursive: true, force: true }); }
  const self = makeRepo('worktree: "."\n');
  try {
    assert.match(run(self.root, 'baseline').error, /not the optimize worktree/);
  } finally { rmSync(self.parent, { recursive: true, force: true }); }
});

/** A root file committed on the slug branch before the baseline. */
function commitFile(root, name, text) {
  writeFileSync(path.join(root, name), text);
  git(root, 'add', name);
  git(root, 'commit', '-q', '-m', name);
}

test('a commit hook that refuses a trial rejects the trial, and the format command runs before the path check', () => {
  const { parent, root, wt } = makeRepo('format: "node fmt.js"\n');
  try {
    // The format command trims the value. A space inside the value stays, and the hook refuses it.
    commitFile(root, 'fmt.js', "const fs = require('fs'); const f = 'src/value.txt'; fs.writeFileSync(f, fs.readFileSync(f, 'utf8').trim() + '\\n');\n");
    const hooks = path.join(parent, 'hooks');
    mkdirSync(hooks);
    writeFileSync(path.join(hooks, 'pre-commit'), "#!/bin/sh\nif grep -q ' ' src/value.txt; then echo 'format check failed'; exit 1; fi\nexit 0\n");
    chmodSync(path.join(hooks, 'pre-commit'), 0o755);
    git(root, 'config', 'core.hooksPath', hooks.replace(/\\/g, '/'));
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);

    const refused = step(root, wt, 'h1', '9 0').t;
    assert.equal(refused.verdict, 'rejected', JSON.stringify(refused));
    assert.equal(refused.reason, 'the commit hook refused the change');
    assert.match(refused.output, /format check failed/);
    assert.equal(git(wt, 'status', '--porcelain'), '', 'the refused change is reset');

    const formatted = step(root, wt, 'h2', '  90  ').t;
    assert.equal(formatted.verdict, 'kept', JSON.stringify(formatted));
    assert.equal(git(wt, 'show', 'HEAD:src/value.txt'), '90', 'the commit holds the formatted file');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a format command that changes a file outside allowed-paths rejects the trial', () => {
  const { parent, root, wt } = makeRepo('format: "node fmt.js"\n');
  try {
    commitFile(root, 'fmt.js', "require('fs').mkdirSync('lib', { recursive: true }); require('fs').writeFileSync('lib/x.js', 'x');\n");
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);
    const t = step(root, wt, 'h1', 90).t;
    assert.equal(t.verdict, 'rejected');
    assert.match(t.reason, /path check: lib\/x\.js \(outside allowed-paths\)/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
