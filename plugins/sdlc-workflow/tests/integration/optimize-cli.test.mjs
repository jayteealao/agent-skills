// scripts/optimize.mjs against a real git repository. The metric
// prints the number in src/value.txt; the guard fails when src/broken exists. The test
// plays the editor: it writes the change into the worktree, then runs `trial`.
// It walks the opening branch round, a winner, the flushed digests, a plateau
// that opens an extra round and then stops the loop, the path check, the
// commits at finish, and the cleanup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  // The metric is src/value.txt, or src/alt.txt in its place, plus src/extra.txt: two branches can gain in two files.
  writeFileSync(path.join(root, 'metric.js'), "const fs = require('fs'); const n = (f) => (fs.existsSync(f) ? Number(fs.readFileSync(f, 'utf8').trim()) : null); console.log('measuring'); console.log((n('src/alt.txt') ?? n('src/value.txt')) + (n('src/extra.txt') ?? 0));\n");
  // With a shared build folder, the guard leaves the path of its worktree there.
  writeFileSync(path.join(root, 'guard.js'), "const fs = require('fs'); if (process.env.OPT_BUILD) fs.writeFileSync(require('path').join(process.env.OPT_BUILD, 'built'), process.cwd()); process.exit(fs.existsSync('src/broken') ? 1 : 0);\n");
  writeFileSync(path.join(root, 'src', 'value.txt'), '100\n');
  writeFileSync(path.join(root, '.gitignore'), '.ai/workflows/*/optimize/\nnode_modules\n');
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
/** One trial as the driver runs it: the proposer reads the digest, the editor writes into the worktree that the digest names. */
function step(root, wt, id, value, extra, on = null) {
  const lane = on ? ['--on', on] : [];
  const ctx = run(root, 'propose-context', ...lane);
  assert.equal(ctx.ok, true, JSON.stringify(ctx));
  if (value !== null) edit(ctx.digest.worktree, value, extra);
  const t = run(root, 'trial', id, ...lane, '--hypothesis', `set the value to ${value}`);
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
    assert.equal(b.next.command, `node "${path.join(pluginRoot, 'skills', 'wf', 'scripts', 'optimize.mjs')}" round-open "${root}" ${S}`, 'status prints the exact command of the next action');
    assert.equal(b.next.after, 'run status for the next action');
    assert.equal(run(root, 'trial', 'h0').ok, false, 'no trial before the scheduled round opens');

    const r1 = run(root, 'round-open');
    assert.equal(r1.ok, true, JSON.stringify(r1));
    assert.deepEqual(r1.branches, [`optimize/${S}--r1b1`, `optimize/${S}--r1b2`]);

    const lane = run(root, 'status').next;
    assert.ok(lane.command.endsWith(`propose-context "${root}" ${S} --on optimize/${S}--r1b1`), lane.command);
    assert.match(lane.then[1], / trial "[^"]+" speed h1 --on optimize\/speed--r1b1 --idea <idea> --hypothesis "<hypothesis>"/);
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
    assert.equal(out.ctx.digest.worktree, `${wt}--r1b2`, 'each branch has its own worktree');
    assert.equal(readFileSync(path.join(`${wt}--r1b2`, 'src', 'value.txt'), 'utf8').trim(), '95', 'the rejected change is reset');
    assert.equal(readFileSync(path.join(wt, 'src', 'value.txt'), 'utf8').trim(), '100', 'the trunk worktree stays at the trunk best');

    const close = run(root, 'round-close');
    assert.equal(close.ok, true, JSON.stringify(close));
    assert.equal(close.winner.name, `optimize/${S}--r1b1`);
    assert.equal(close.best.value, 80);
    assert.deepEqual(close.candidates, [{ name: `optimize/${S}--r1b2`, conflict: true }], 'branch 2 kept a gain in the same line: its test merge conflicts');
    assert.equal(close.merge, null, 'a merge step with only conflicts ends at once');
    assert.equal(git(root, 'branch', '--list', `optimize/${S}--*`), '', 'the round branches are deleted');
    assert.deepEqual([existsSync(`${wt}--r1b1`), existsSync(`${wt}--r1b2`)], [false, false], 'the branch worktrees are removed');
    assert.equal(git(wt, 'status', '--porcelain'), '', 'the test merge touches no worktree');

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
    const stopped = run(root, 'status').next;
    assert.equal(stopped.command, null, 'a stop is the person');
    assert.ok(stopped.after.includes(`goal.mjs" check "${root}" ${S}`), 'an armed goal names its check after the action');
    const check = execFileSync(process.execPath, [GOAL, 'check', root, S], { encoding: 'utf8' }).trim().split(/\r?\n/).at(-1);
    assert.match(check, /^GOAL: BLOCKED optimize stopped: plateau/);
    assert.equal(run(root, 'status').next.after, 'end the run', 'a blocked goal no longer carries the loop');

    const rep = run(root, 'report');
    assert.equal(rep.ok, true, JSON.stringify(rep));
    assert.deepEqual([rep.mechanisms.round.trials, rep.mechanisms.round.keeps, rep.mechanisms.round.gain], [8, 2, 20], 'the keeps of the winner of round 1 count for the round');
    assert.deepEqual([rep.mechanisms.trunk.trials, rep.mechanisms.trunk.keeps], [2, 0]);
    assert.deepEqual(rep.idle, ['trunk']);
    assert.deepEqual(rep.rounds.map((r) => [r.round, r.trials, r.winner, r.from, r.gain]), [[1, 4, `optimize/${S}--r1b1`, 100, 20], [2, 4, null, 80, 0]]);

    const fin = run(root, 'finish');
    assert.equal(fin.ok, true, JSON.stringify(fin));
    assert.equal(fin.kept, 2);
    assert.deepEqual(fin.mechanisms, { idle: ['trunk'], keptGain: 20 }, 'the hand-back names the mechanisms that produced nothing');
    assert.match(readDoc(path.join(root, '.ai', 'workflows', S), '05-implement-optimize.md').body, /## Search Mechanisms[\s\S]*\| round \| 8 \| 2 \| 20 \| 100% \|[\s\S]*Produced no kept gain in this run: trunk\./);
    const all = JSON.parse(execFileSync(process.execPath, [SCRIPT, 'report', root, '--all'], { encoding: 'utf8' }));
    assert.deepEqual([all.ok, all.runs, all.slugs.map((x) => x.slug), all.mechanisms.round.paid, all.never], [true, 1, [S], 1, ['trunk']]);
    assert.equal(readFileSync(path.join(root, 'src', 'value.txt'), 'utf8').trim(), '80', 'the kept changes land on the slug branch');
    assert.equal(fin.history, 'per-change', JSON.stringify(fin));
    assert.deepEqual(git(root, 'log', '--format=%s').split(/\r?\n/), ['set the value to 80', 'set the value to 90', 'base'], 'one commit for each kept trial of the winner, and no reverted trial');
    assert.deepEqual(fin.commits, git(root, 'rev-list', '--reverse', 'HEAD~2..HEAD').split(/\r?\n/));
    assert.equal(git(root, 'log', '-1', '--format=%b'), `Measured gain: 10.\nMetric: 90 before, 80 after.\nTrial: 3 (h3).\nKept on optimize/${S}--r1b1 in round 1.`);
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
    assert.deepEqual(results.filter((r) => r.event !== 'trial').map((r) => r.event), ['baseline', 'round-open', 'round-close', 'merge-close', 'round-open', 'round-close', 'ablate', 'finish'], 'finish checks each kept change before its commits');
    assert.deepEqual(results.find((r) => r.event === 'merge-close').skipped, [{ name: `optimize/${S}--r1b2`, reason: 'conflict' }, { name: 't2', reason: 'conflict' }], 'the merge conflicts, and the port of its kept trial t2 conflicts too');

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
    assert.equal(git(`${wt}--r1b1`, 'status', '--porcelain'), '', 'the refused change is reset');

    const formatted = step(root, wt, 'h2', '  90  ').t;
    assert.equal(formatted.verdict, 'kept', JSON.stringify(formatted));
    assert.equal(git(`${wt}--r1b2`, 'show', 'HEAD:src/value.txt'), '90', 'the commit holds the formatted file');
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

const B1 = `optimize/${S}--r1b1`;
const B2 = `optimize/${S}--r1b2`;

test('each branch has its own worktree: a ready branch takes a trial out of turn, and a prepared edit is measured', () => {
  const { parent, root, wt } = makeRepo();
  try {
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);
    const st = run(root, 'status');
    assert.deepEqual(st.next.ready, [B1, B2]);
    assert.equal(git(`${wt}--r1b2`, 'branch', '--show-current'), B2);
    assert.match(run(root, 'trial', 'hx', '--on', `optimize/${S}`).error, /cannot take a trial now/);

    const out = step(root, wt, 'h1', 90, undefined, B2);
    assert.equal(out.ctx.digest.worktree, `${wt}--r1b2`);
    assert.deepEqual([out.t.lane, out.t.verdict], [B2, 'kept']);
    assert.equal(readFileSync(path.join(`${wt}--r1b1`, 'src', 'value.txt'), 'utf8').trim(), '100', 'branch 1 is untouched');

    // An edit that waited in its worktree through a stop: the proposer sees it, and trial measures it.
    edit(`${wt}--r1b1`, 85);
    assert.deepEqual(run(root, 'propose-context', '--on', B1).prepared, { paths: ['src/value.txt'] });
    const t = run(root, 'trial', 'h2', '--on', B1, '--hypothesis-file', path.join(parent, 'absent.txt'), '--hypothesis', 'set the value to 85');
    assert.equal(t.verdict, 'kept', JSON.stringify(t));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('the measure lock: a trial while another process measures is busy; a stale lock is taken and released', () => {
  const { parent, root, wt } = makeRepo();
  try {
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);
    const lock = path.join(root, '.ai', 'workflows', S, 'optimize', '.measure.lock');
    writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), lane: B2 }));
    edit(`${wt}--r1b1`, 90);
    const busy = run(root, 'trial', 'h1', '--hypothesis', 'set the value to 90');
    assert.deepEqual([busy.ok, busy.busy], [false, true], JSON.stringify(busy));
    assert.match(busy.error, /one at a time/);
    assert.equal(run(root, 'status').state, 'running', 'the lane check waits while another process measures');

    writeFileSync(lock, JSON.stringify({ pid: 999999, at: new Date().toISOString() }));
    assert.equal(run(root, 'trial', 'h1', '--hypothesis', 'set the value to 90').verdict, 'kept', 'the lock of a dead process is stale');
    assert.equal(existsSync(lock), false, 'the lock is released');

    // One trial runs many commands under one lock: a holder that still runs keeps it however old its stamp is.
    writeFileSync(lock, JSON.stringify({ pid: process.pid, at: '2000-01-01T00:00:00Z' }));
    edit(`${wt}--r1b2`, 95);
    const live = run(root, 'trial', 'h2', '--hypothesis', 'set the value to 95');
    assert.deepEqual([live.ok, live.busy], [false, true], JSON.stringify(live));
    assert.ok(existsSync(lock), 'the lock of a live holder stays');
    writeFileSync(lock, JSON.stringify({ pid: 999999, at: '2000-01-01T00:00:00Z' }));
    assert.equal(run(root, 'trial', 'h2', '--hypothesis', 'set the value to 95').verdict, 'kept', 'an old lock of a dead process is stale');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a proposer past twice its propose-time gets no probe; another lane still does', () => {
  const { parent, root } = makeRepo();
  try {
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);
    assert.equal(run(root, 'propose-context', '--on', B1).ok, true);
    assert.equal(run(root, 'probe-open', '--on', B1).ok, true, 'within its time the proposer probes');
    // The proposer of the first branch started 31 minutes ago; the default propose-time is 15 minutes.
    const stamp = path.join(root, '.ai', 'workflows', S, 'optimize', '.propose-r1b1.json');
    writeFileSync(stamp, `${JSON.stringify({ at: Date.now() - 31 * 60_000 })}\n`);
    const open = run(root, 'probe-open', '--on', B1);
    assert.deepEqual([open.ok, open.refused, open.overtime], [false, true, true], JSON.stringify(open));
    assert.match(open.error, /past twice its propose-time \(30 min\).*return your best hypothesis/);
    const p = run(root, 'probe', '--on', B1, '--cmd', 'node metric.js');
    assert.equal(p.overtime, true, JSON.stringify(p));
    assert.equal(run(root, 'probe-open', '--on', B2).ok, true, 'a lane without an old proposer still probes');
    assert.match(readFileSync(path.join(root, '.ai', 'workflows', S, 'optimize', 'results.jsonl'), 'utf8'), /"event":"propose-overtime","lane":"r1b1"/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a probe runs in its own worktree and build folder under the lock, a trial waits for a probe, and the loop removes the probes', () => {
  const { parent, root, wt } = makeRepo('shared-build: OPT_BUILD\n');
  try {
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);
    const bd = `${wt}.build`;
    const open = run(root, 'probe-open', '--on', B1);
    assert.equal(open.ok, true, JSON.stringify(open));
    assert.equal(open.worktree, `${wt}--probe-r1b1`);
    writeFileSync(path.join(open.worktree, 'src', 'value.txt'), '1\n');
    const p = run(root, 'probe', '--on', B1, '--label', 'build', '--cmd', 'node guard.js && node metric.js');
    assert.equal(p.ok, true, JSON.stringify(p));
    assert.equal(p.code, 0);
    assert.match(p.output, /^1$/m, 'the probe runs the instrumented probe worktree');
    assert.match(readFileSync(path.join(`${bd}-probe`, 'built'), 'utf8'), /probe-r1b1$/, 'the probe builds into its own folder');
    assert.equal(existsSync(path.join(bd, 'built')) && /probe/.test(readFileSync(path.join(bd, 'built'), 'utf8')), false, 'the shared build folder of the lanes is not touched');
    assert.equal(existsSync(path.join(root, '.ai', 'workflows', S, 'optimize', '.measure.lock')), false, 'the probe releases the lock');
    const ledger = readFileSync(path.join(root, '.ai', 'workflows', S, 'optimize', 'results.jsonl'), 'utf8');
    assert.match(ledger, /"event":"probe","lane":"r1b1","label":"build","code":0/);
    assert.equal(run(root, 'probe-open', '--on', 'optimize/other').ok, false, 'a probe needs a lane of the loop');
    assert.equal(run(root, 'probe', '--on', B2, '--cmd', 'node metric.js').ok, false, 'a probe needs its probe worktree');

    // A probe of another process holds the lock: the trial waits for it, and then measures.
    const lock = path.join(root, '.ai', 'workflows', S, 'optimize', '.measure.lock');
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 1500)'], { stdio: 'ignore' });
    writeFileSync(lock, JSON.stringify({ pid: child.pid, at: new Date().toISOString(), lane: B2, kind: 'probe' }));
    edit(`${wt}--r1b1`, 90);
    const t0 = Date.now();
    const t = JSON.parse(execFileSync(process.execPath, [SCRIPT, 'trial', root, S, 'h1', '--on', B1, '--hypothesis', 'set the value to 90'], { encoding: 'utf8', env: { ...process.env, OPTIMIZE_LOCK_POLL_MS: '100' } }));
    assert.equal(t.verdict, 'kept', JSON.stringify(t));
    assert.ok(Date.now() - t0 >= 1000, 'the trial waited for the probe');
    child.kill();

    assert.equal(step(root, wt, 'h2', 95).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h3', 80).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h4', 85).t.verdict, 'kept');
    const close = run(root, 'round-close');
    assert.equal(close.ok, true, JSON.stringify(close));
    assert.equal(existsSync(`${wt}--probe-r1b1`), false, 'round-close removes the probe worktrees of the round');
    assert.equal(run(root, 'probe-open').ok, true, 'the trunk has a probe worktree too');
    if (run(root, 'status').next.action === 'merge-consider') run(root, 'merge-consider', '--skip', 'b2:test');
    const fin = run(root, 'finish');
    assert.equal(fin.ok, true, JSON.stringify(fin));
    assert.deepEqual([existsSync(`${wt}--probe-trunk`), existsSync(`${bd}-probe`)], [false, false], 'finish removes the probe worktrees and their build folder');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('the profile command runs before the first round, every digest holds the profile and the ideas, and a trial settles its idea', () => {
  const { parent, root, wt } = makeRepo('profile: "node prof.js"\n');
  try {
    writeFileSync(path.join(root, 'prof.js'), "console.log('warm'); console.log(JSON.stringify({ name: 'value', share: 0.9, where: 'src/value.txt:1-1' })); console.log(JSON.stringify({ name: 'extra', share: 0.01 }));\n");
    git(root, 'add', 'prof.js');
    git(root, 'commit', '-q', '-m', 'profile');
    const b = run(root, 'baseline');
    assert.equal(b.next.action, 'profile', JSON.stringify(b.next));
    assert.equal(b.profile.mode, 'command');
    assert.equal(run(root, 'round-open').ok, false, 'no round before the first profile');
    const p = run(root, 'profile');
    assert.equal(p.ok, true, JSON.stringify(p));
    assert.equal(p.entries, 2);
    assert.equal(p.next.action, 'round-open');
    assert.equal(run(root, 'round-open').ok, true);

    const ctx = run(root, 'propose-context', '--on', B1);
    assert.deepEqual(ctx.digest.profile.map((e) => e.name), ['value', 'extra'], 'a branch reads the profile too');
    const claim = run(root, 'idea-claim', '--on', B1, '--target', 'value', '--family', 'smaller');
    assert.equal(claim.ok, true, JSON.stringify(claim));
    const other = run(root, 'idea-claim', '--on', B2, '--target', 'Value');
    assert.deepEqual([other.ok, other.refused], [false, true], 'another lane cannot claim the target in flight');
    assert.deepEqual(run(root, 'propose-context', '--on', B2).digest.ideas.map((i) => [i.id, i.claim]), [[claim.idea.id, B1]], 'every lane sees the ideas of every lane');

    edit(`${wt}--r1b1`, 90);
    const t = run(root, 'trial', 'h1', '--on', B1, '--idea', claim.idea.id, '--hypothesis', 'set the value to 90');
    assert.equal(t.verdict, 'kept', JSON.stringify(t));
    const ideas = JSON.parse(readFileSync(path.join(root, '.ai', 'workflows', S, 'optimize', 'ideas.json'), 'utf8'));
    assert.deepEqual([ideas.ideas[0].status, ideas.ideas[0].trials, ideas.ideas[0].pooled.mean, ideas.ideas[0].claim], ['kept', [1], 10, null]);
    assert.match(readFileSync(path.join(root, '.ai', 'workflows', S, 'optimize', 'patches', '1.patch'), 'utf8'), /^-100\n\+90$/m, 'a kept trial keeps its diff');
    const again = run(root, 'idea-claim', '--on', B2, '--target', 'value');
    assert.equal(again.ok, false, 'a tried target needs a new reason');
    assert.equal(run(root, 'idea-claim', '--on', B2, '--target', 'value', '--again', 'a smaller step').ok, true);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('the profiler agent records its profile, or skips it with a reason, and the profile command is refused in agent mode', () => {
  const { parent, root } = makeRepo('profile: agent\n');
  try {
    assert.equal(run(root, 'baseline').next.action, 'profile');
    assert.match(run(root, 'profile').error, /profiler agent/);
    const file = path.join(parent, 'p.json');
    writeFileSync(file, JSON.stringify([{ name: 'step', share: 0.6 }, { name: 'x', share: 7 }]));
    const open = run(root, 'probe-open');
    writeFileSync(path.join(open.worktree, 'src', 'counter.txt'), 'timer\n');
    git(open.worktree, 'add', '-N', 'src/counter.txt');
    const r = run(root, 'profile-record', '--file', file);
    assert.deepEqual([r.ok, r.entries, r.ignored], [true, 1, 1], JSON.stringify(r));
    assert.match(readFileSync(r.profile.patch, 'utf8'), /\+timer/, 'the counters of the agent are kept as a patch for the next profile');
    assert.equal(r.next.action, 'round-open');
    assert.equal(run(root, 'profile-record', '--skip', 'late').ok, false, 'the profile is recorded already');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
  const second = makeRepo('profile: agent\n');
  try {
    run(second.root, 'baseline');
    const s = run(second.root, 'profile-record', '--skip', 'no profiler on this machine');
    assert.deepEqual([s.ok, s.skipped, s.next.action], [true, true, 'round-open']);
  } finally {
    rmSync(second.parent, { recursive: true, force: true });
  }
});

test('paired measurement: the baseline measures the paired noise, a trial runs the reference in turns, and finish removes the reference worktree', () => {
  const { parent, root, wt } = makeRepo('shared-build: OPT_BUILD\n');
  try {
    const specFile = path.join(root, '.ai', 'workflows', S, '02-optimize-spec.md');
    writeFileSync(specFile, readFileSync(specFile, 'utf8').replace('  min-gain: 0\n', '  min-gain: 0\n  paired: true\n'));
    git(root, 'commit', '-q', '-am', 'paired');
    const b = run(root, 'baseline');
    assert.equal(b.ok, true, JSON.stringify(b));
    assert.equal(b.baseline.pairedNoise, 0, 'the A/A block of a steady metric has no noise');
    assert.equal(existsSync(`${wt}--ref`), true, 'the baseline makes the reference worktree');
    assert.equal(run(root, 'round-open').ok, true);
    const ctx = run(root, 'propose-context', '--on', B1);
    assert.equal(ctx.digest.paired, true);
    edit(`${wt}--r1b1`, 90);
    const t = run(root, 'trial', 'h1', '--on', B1, '--hypothesis', 'set the value to 90');
    assert.equal(t.verdict, 'kept', JSON.stringify(t));
    assert.equal(t.delta, 10, 'the gain is the median of the pair gains');
    const line = readFileSync(path.join(root, '.ai', 'workflows', S, 'optimize', 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((l) => l.event === 'trial');
    assert.deepEqual([line.paired.ref, line.paired.gains, line.values, line.paired.confirmGains], [[100, 100], [10, 10], [90, 90], [10, 10]]);
    edit(`${wt}--r1b2`, 100);
    const flat = run(root, 'trial', 'h2', '--on', B2, '--hypothesis', 'no change in the value', '--expected', '0');
    assert.equal(flat.verdict, 'rejected', 'a change of nothing is rejected before a measurement');
    edit(`${wt}--r1b2`, 101);
    const worse = run(root, 'trial', 'h3', '--on', B2, '--hypothesis', 'set the value to 101');
    assert.equal(worse.verdict, 'reverted');
    assert.match(worse.reason, /paired gain -1 is not above the threshold/);
    assert.equal(readFileSync(path.join(`${wt}--ref`, 'src', 'value.txt'), 'utf8').trim(), '100', 'the reference worktree holds the best of the lane under test');
    assert.equal(step(root, wt, 'h4', 85).t.ok, true);
    assert.equal(run(root, 'round-close').ok, true);
    if (run(root, 'status').next.action === 'merge-consider') run(root, 'merge-consider', '--skip', 'b2:test');
    const fin = run(root, 'finish');
    assert.equal(fin.ok, true, JSON.stringify(fin));
    assert.deepEqual([existsSync(`${wt}--ref`), existsSync(`${wt}.build-ref`)], [false, false], 'finish removes the reference worktree and its build folder');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('round-close removes the branch worktrees, a worktree with a link stays, and finish removes the rest and the shared build folder', () => {
  const { parent, root, wt } = makeRepo('shared-build: OPT_BUILD\n');
  try {
    assert.equal(run(root, 'baseline').ok, true);
    const bd = `${wt}.build`;
    assert.ok(existsSync(path.join(bd, 'built')), 'the baseline guard runs with the shared build folder');
    assert.equal(run(root, 'round-open').ok, true);
    assert.equal(step(root, wt, 'h1', 90).t.verdict, 'kept');
    assert.match(readFileSync(path.join(bd, 'built'), 'utf8'), /r1b1$/, 'a branch trial builds into the same folder');
    assert.equal(step(root, wt, 'h2', 120).t.verdict, 'reverted');
    assert.equal(step(root, wt, 'h3', 80).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h4', 130).t.verdict, 'reverted');

    const outside = path.join(parent, 'outside');
    mkdirSync(outside);
    writeFileSync(path.join(outside, 'keep.txt'), 'x');
    const link = path.join(`${wt}--r1b2`, 'node_modules');
    symlinkSync(outside, link, 'junction');
    const close = run(root, 'round-close');
    assert.equal(close.ok, true, JSON.stringify(close));
    assert.deepEqual(close.leftovers.map((l) => l.branch), [B2]);
    assert.deepEqual([existsSync(`${wt}--r1b1`), existsSync(`${wt}--r1b2`)], [false, true]);

    const fin = run(root, 'finish');
    assert.equal(fin.ok, true, JSON.stringify(fin));
    assert.deepEqual(fin.cleanup.kept.map((k) => k.branch), [B2], 'a cleanup that cannot remove a worktree does not fail the finish');
    assert.deepEqual([existsSync(wt), existsSync(bd)], [false, false], 'finish removes the trunk worktree and the build folder');
    assert.equal(git(root, 'branch', '--list', `optimize/${S}`), '');

    rmSync(link, { force: true });
    const cl = run(root, 'cleanup');
    assert.equal(cl.ok, true, JSON.stringify(cl));
    assert.equal(existsSync(`${wt}--r1b2`), false);
    assert.equal(git(root, 'branch', '--list', B2), '');
    assert.ok(existsSync(path.join(outside, 'keep.txt')), 'no delete followed the link');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a round that an older version opened runs on the trunk worktree until it closes', () => {
  const { parent, root, wt } = makeRepo();
  try {
    assert.equal(run(root, 'baseline').ok, true);
    const file = path.join(root, '.ai', 'workflows', S, 'optimize', 'state.json');
    const state = JSON.parse(readFileSync(file, 'utf8'));
    for (const name of [B1, B2]) git(root, 'branch', name, state.best.commit);
    state.version = 1;
    state.schedule.used = [0];
    state.round = { n: 1, reason: 'schedule', point: 0, why: 'old', branchTrials: 1, openedAtTrial: 0, from: state.best.commit, branches: [1, 2].map((k) => ({ k, name: k === 1 ? B1 : B2, best: { ...state.best, reachedAt: 0 }, trials: 0, keeps: 0 })) };
    writeFileSync(file, JSON.stringify(state, null, 2));

    assert.equal(run(root, 'status').next.ready, undefined);
    const a = step(root, wt, 'h1', 90);
    assert.equal(a.ctx.digest.worktree, wt);
    assert.equal(a.t.verdict, 'kept');
    assert.equal(step(root, wt, 'h2', 95).t.lane, B2);
    const close = run(root, 'round-close');
    assert.equal(close.ok, true, JSON.stringify(close));
    assert.equal(close.best.value, 90);
    assert.equal(git(root, 'branch', '--list', `optimize/${S}--*`), '');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

/** A round of two branches: branch 1 keeps 80 in src/value.txt, branch 2 keeps the change `b2`, then each branch reverts one trial. */
function roundWithTwoKeeps(root, wt, b2) {
  assert.equal(run(root, 'baseline').ok, true);
  assert.equal(run(root, 'round-open').ok, true);
  assert.equal(step(root, wt, 'h1', 80).t.verdict, 'kept');
  assert.equal(step(root, wt, 'h2', 100, b2).t.verdict, 'kept');
  assert.equal(step(root, wt, 'h3', 120).t.verdict, 'reverted');
  assert.equal(step(root, wt, 'h4', 130).t.verdict, 'reverted');
  const close = run(root, 'round-close');
  assert.equal(close.ok, true, JSON.stringify(close));
  assert.equal(close.winner.name, B1);
  return close;
}
const ledger = (root) => readFileSync(path.join(root, '.ai', 'workflows', S, 'optimize', 'results.jsonl'), 'utf8').trim().split(/\r?\n/).map((l) => JSON.parse(l));

test('the merge step: a branch that gained in another file is merged into the trunk and measured, and finish lists its trials', () => {
  const { parent, root, wt } = makeRepo();
  try {
    const close = roundWithTwoKeeps(root, wt, { 'src/extra.txt': '-10' });
    assert.equal(close.next.action, 'merge-consider');
    assert.deepEqual(close.merge.candidates.map((c) => [c.name, c.conflict, c.paths, c.shared, c.gain]), [[B2, false, ['src/extra.txt'], [], 10]]);
    assert.notEqual(git(root, 'branch', '--list', B2), '', 'a candidate keeps its branch until the merge step ends');

    assert.match(run(root, 'merge-consider').error, /no decision for/);
    assert.match(run(root, 'merge-consider', '--try', 'b9').error, /is not a candidate/);
    const mc = run(root, 'merge-consider', '--try', 'b2');
    assert.equal(mc.ok, true, JSON.stringify(mc));
    assert.deepEqual([mc.next.action, mc.next.branch], ['merge-trial', B2]);

    const mt = run(root, 'merge-trial', '--branch', 'b2');
    assert.deepEqual([mt.ok, mt.verdict, mt.median], [true, 'kept', 70], JSON.stringify(mt));
    assert.equal(mt.best.value, 70, 'the trunk best moves to the merge');
    assert.equal(mt.next.action, 'trial');
    assert.equal(git(root, 'branch', '--list', `optimize/${S}--*`), '', 'the merge step deletes the candidate branches');
    const lines = ledger(root);
    assert.deepEqual(lines.find((l) => l.event === 'merge-consider').try, [B2]);
    assert.deepEqual(lines.find((l) => l.merge).merge, { round: 1, branch: B2 });
    assert.deepEqual(lines.find((l) => l.event === 'merge-close').merged, [B2]);

    const ctx = run(root, 'propose-context');
    assert.deepEqual(ctx.digest.trials.map((t) => t.trial), [1, 2, 3, 5], 'the trunk digest holds the winner, the kept trials of the merged branch, and the merge');

    const fin = run(root, 'finish');
    assert.equal(fin.ok, true, JSON.stringify(fin));
    assert.equal(fin.kept, 3, 'the kept trial of each branch and the merge');
    assert.deepEqual([readFileSync(path.join(root, 'src', 'value.txt'), 'utf8').trim(), readFileSync(path.join(root, 'src', 'extra.txt'), 'utf8').trim()], ['80', '-10']);
    // The merge was measured as one change, so it is one commit, named by the kept trial of its branch.
    assert.equal(fin.commits.length, 2, JSON.stringify(fin));
    assert.deepEqual(git(root, 'log', '--format=%s', '-2').split(/\r?\n/), ['set the value to 100', 'set the value to 80']);
    assert.match(git(root, 'log', '-1', '--format=%b'), new RegExp(`^Measured gain: 10\\.\\nMetric: 80 before, 70 after\\.\\nTrial: 5 \\(m5\\)\\.\\nMerges the branch optimize/${S}--r1b2 of round 1: trial 2\\.$`));
    assert.equal(git(root, 'rev-list', '--merges', '--count', 'HEAD'), '0', 'the slug branch history is linear');
    assert.match(readDoc(path.join(root, '.ai', 'workflows', S), '05-implement-optimize.md').body, /merge of optimize\/speed--r1b2/);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a merge that fails the keep rule resets the trunk worktree to the trunk best', () => {
  const { parent, root, wt } = makeRepo();
  try {
    const close = roundWithTwoKeeps(root, wt, { 'src/alt.txt': '85' });
    assert.equal(run(root, 'merge-consider', '--try', `optimize/${S}--r1b2`).ok, true);
    const mt = run(root, 'merge-trial', '--branch', 'r1b2');
    assert.equal(mt.verdict, 'reverted', JSON.stringify(mt));
    assert.equal(git(wt, 'rev-parse', 'HEAD'), close.best.commit);
    assert.equal(existsSync(path.join(wt, 'src', 'alt.txt')), false);
    assert.equal(mt.best.value, 80);
    assert.deepEqual(ledger(root).find((l) => l.event === 'merge-close').merged, []);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a candidate that the consider step skips is not merged, and its reason is in the ledger', () => {
  const { parent, root, wt } = makeRepo();
  try {
    roundWithTwoKeeps(root, wt, { 'src/extra.txt': '-10' });
    const mc = run(root, 'merge-consider', '--skip', 'b2:the same mechanism as the winner');
    assert.equal(mc.ok, true, JSON.stringify(mc));
    assert.equal(mc.next.action, 'trial');
    assert.equal(mc.best.value, 80);
    const lines = ledger(root);
    assert.deepEqual(lines.find((l) => l.event === 'merge-consider').skip, [{ name: B2, reason: 'the same mechanism as the winner' }]);
    assert.equal(lines.some((l) => l.merge), false);
    assert.equal(git(root, 'branch', '--list', B2), '');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

/** A new spec text in the committed spec file: the finish refuses a tracked file with changes. */
function respec(root, ...pairs) {
  const file = path.join(root, '.ai', 'workflows', S, '02-optimize-spec.md');
  let text = readFileSync(file, 'utf8');
  for (let i = 0; i < pairs.length; i += 2) text = text.replace(pairs[i], pairs[i + 1]);
  writeFileSync(file, text);
  git(root, 'commit', '-q', '-am', 'spec');
}

test('a port: a branch that conflicts gives its kept trial that applies to the trunk, which the trunk measures with no proposer', () => {
  const { parent, root, wt } = makeRepo();
  try {
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);
    assert.equal(step(root, wt, 'h1', 80).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h2', 100, { 'src/extra.txt': '-10' }).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h3', 120).t.verdict, 'reverted');
    assert.equal(step(root, wt, 'h4', 95, { 'src/extra.txt': '-10' }).t.verdict, 'kept');
    const close = run(root, 'round-close');
    assert.equal(close.ok, true, JSON.stringify(close));
    assert.deepEqual(close.merge.candidates.map((c) => [c.kind ?? 'branch', c.name, c.conflict]), [['branch', B2, true], ['port', 't2', false], ['port', 't4', true]]);
    const mc = run(root, 'merge-consider', '--try', 't2');
    assert.equal(mc.ok, true, JSON.stringify(mc));
    assert.deepEqual([mc.next.action, mc.next.on, mc.next.port], ['trial', `optimize/${S}`, 't2']);
    const st = run(root, 'status');
    assert.equal(st.next.portOf.trial, 2);
    assert.match(readFileSync(st.next.portOf.patch, 'utf8'), /extra\.txt/, 'the editor reads the kept diff');

    writeFileSync(path.join(wt, 'src', 'extra.txt'), '-10');
    const t = run(root, 'trial', 'p1', '--hypothesis', 'port t2');
    assert.deepEqual([t.ok, t.verdict], [true, 'kept'], JSON.stringify(t));
    const line = ledger(root).find((l) => l.port);
    assert.deepEqual(line.port, { round: 1, trial: 2, branch: B2 });
    assert.deepEqual(line.additive, { measured: 10, alone: 10 });
    assert.ok(Number.isFinite(line.ms) && line.ms > 0, 'a measured trial records the time of its guard and measurement');
    assert.equal(run(root, 'status').next.action, 'trial', 'the merge step closes when no try is left');
    assert.equal(git(root, 'branch', '--list', `optimize/${S}--*`), '');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a bundle: two marginal ideas on other targets are tried together after half a plateau, and a kept bundle marks them', () => {
  const { parent, root, wt } = makeRepo();
  try {
    respec(root, 'min-gain: 0', 'min-gain: 10', 'plateau: 2', 'plateau: 4');
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);
    for (const [id, v] of [['h1', 120], ['h2', 130], ['h3', 140], ['h4', 150]]) assert.equal(step(root, wt, id, v).t.verdict, 'reverted');
    assert.equal(run(root, 'round-close').ok, true);

    const a = run(root, 'idea-claim', '--target', 'value');
    edit(wt, 95);
    assert.equal(run(root, 'trial', 'm1', '--idea', a.idea.id, '--hypothesis', 'value 95').verdict, 'reverted');
    const b = run(root, 'idea-claim', '--target', 'extra');
    writeFileSync(path.join(wt, 'src', 'extra.txt'), '-6');
    const m2 = run(root, 'trial', 'm2', '--idea', b.idea.id, '--hypothesis', 'extra -6');
    assert.equal(m2.verdict, 'reverted', JSON.stringify(m2));
    assert.deepEqual(m2.next.bundle, [b.idea.id, a.idea.id], JSON.stringify(m2.next));
    assert.deepEqual(run(root, 'status').next.bundleOf.map((x) => x.id), [b.idea.id, a.idea.id]);

    edit(wt, 95, { 'src/extra.txt': '-6' });
    const t = run(root, 'trial', 'm3', '--hypothesis', 'the bundle');
    assert.equal(t.verdict, 'kept', JSON.stringify(t));
    const line = ledger(root).find((l) => l.bundle);
    assert.deepEqual([line.bundle, line.additive], [[b.idea.id, a.idea.id], { measured: 11, sum: 11 }]);
    const ideas = JSON.parse(readFileSync(path.join(root, '.ai', 'workflows', S, 'optimize', 'ideas.json'), 'utf8'));
    assert.deepEqual(ideas.ideas.map((i) => i.status), ['bundled', 'bundled']);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a prune: a branch with no keep that trails the leader gives its trials to a new fork of the leader', () => {
  const { parent, root, wt } = makeRepo();
  try {
    respec(root, 'branch-trials: 2', 'branch-trials: 3');
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);
    assert.equal(step(root, wt, 'h1', 80).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h2', 120).t.verdict, 'reverted');
    assert.equal(step(root, wt, 'h3', 70).t.verdict, 'kept');
    const h4 = step(root, wt, 'h4', 130).t;
    assert.deepEqual([h4.next.action, h4.next.branch], ['prune', B2], JSON.stringify(h4.next));
    const p = run(root, 'prune');
    const B3 = `optimize/${S}--r1b3`;
    assert.deepEqual([p.ok, p.pruned, p.into, p.from, p.trials], [true, B2, B3, B1, 1], JSON.stringify(p));
    assert.equal(existsSync(`${wt}--r1b2`), false);
    assert.equal(git(root, 'branch', '--list', B2), '');
    assert.equal(readFileSync(path.join(`${wt}--r1b3`, 'src', 'value.txt'), 'utf8').trim(), '70', 'the fork starts at the leader best');
    assert.deepEqual(p.next.ready, [B1, B3]);
    assert.equal(step(root, wt, 'h5', 60, undefined, B3).t.verdict, 'kept');
    assert.deepEqual(ledger(root).find((l) => l.event === 'prune'), { event: 'prune', round: 1, branch: B2, into: B3, from: B1, trials: 1, at: ledger(root).find((l) => l.event === 'prune').at });

    // The fork wins the round: the trunk holds the leader's keeps before the fork, and the fork's own keep.
    assert.equal(step(root, wt, 'h6', 75, undefined, B1).t.verdict, 'reverted');
    const close = run(root, 'round-close');
    assert.equal(close.winner.name, B3, JSON.stringify(close));
    const rep = run(root, 'report');
    assert.deepEqual([rep.mechanisms.round.keeps, rep.mechanisms.round.gain, rep.mechanisms.prune.keeps, rep.mechanisms.prune.gain], [2, 30, 1, 10]);
    const fin = run(root, 'finish');
    assert.equal(fin.ok, true, JSON.stringify(fin));
    assert.equal(fin.history, 'per-change', JSON.stringify(fin));
    assert.equal(fin.kept, 3, 'the leader keeps before the fork are kept changes too');
    assert.equal(fin.commits.length, fin.kept, 'one commit for each kept change listed');
    const dir = path.join(root, '.ai', 'workflows', S);
    const body = readDoc(dir, '05-implement-optimize.md').body;
    const table = body.slice(body.indexOf('## Kept Trials'), body.indexOf('##', body.indexOf('## Kept Trials') + 3));
    assert.deepEqual([...table.matchAll(/^\| (\d+) \|/gm)].map((m) => Number(m[1])), [1, 3, 5]);
    assert.equal(frontmatterOfDoc(dir, '05-implement-optimize.md')['optimize-kept'], 3);
    const steps = readFileSync(path.join(dir, 'steps.jsonl'), 'utf8').trim().split(/\r?\n/).map((l) => JSON.parse(l)).filter((r) => r.event === 'done');
    assert.deepEqual(steps.map((r) => r.trials), [[1], [3], [5]], 'one done step for each kept change, with its trial');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('an optimize goal is met only after finish, and a finish that needs the person blocks it', () => {
  const { parent, root, wt } = makeRepo();
  const goal = (...a) => execFileSync(process.execPath, [GOAL, ...a, root, S], { encoding: 'utf8' });
  const verdict = () => goal('check').trim().split(/\r?\n/).at(-1);
  try {
    respec(root, 'min-gain: 0', 'min-gain: 0\n  target: 90', 'at: ["0%"]', 'at: []');
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(step(root, wt, 'h1', 85).t.verdict, 'kept');
    assert.equal(run(root, 'status').state, 'complete');
    goal('arm');
    assert.equal(verdict(), 'GOAL: NOT-MET optimize: next finish', 'a complete loop is not met before its finish');
    git(root, 'checkout', '-q', '-b', 'elsewhere');
    const st = run(root, 'status');
    assert.match(st.finishBlocked, /not on the slug branch main/);
    assert.equal(st.next.command, null, 'a blocked finish is the person');
    assert.match(verdict(), /^GOAL: BLOCKED optimize finish: the main checkout is on elsewhere, not on the slug branch main/);
    git(root, 'checkout', '-q', 'main');
    goal('arm');
    assert.equal(verdict(), 'GOAL: NOT-MET optimize: next finish');
    assert.equal(run(root, 'finish').ok, true);
    assert.equal(verdict(), 'GOAL: MET');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('the ablation: each kept change is reverted alone on the final code, a change that a later change replaced is weak, and finish lists them', () => {
  const { parent, root, wt } = makeRepo();
  try {
    respec(root, 'at: ["0%"]', 'at: []');
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(step(root, wt, 'h1', 90).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h2', 90, { 'src/alt.txt': '80' }).t.verdict, 'kept', 'src/alt.txt replaces src/value.txt in the metric');
    const a = run(root, 'ablate');
    assert.equal(a.ok, true, JSON.stringify(a));
    assert.deepEqual(a.ablation.changes.map((c) => [c.trial, c.gain, c.verdict]), [[1, 0, 'weak'], [2, 10, 'ok']]);
    assert.ok(existsSync(`${wt}--ref`), 'the ablation runs in the reference worktree');

    const fin = run(root, 'finish');
    assert.equal(fin.ok, true, JSON.stringify(fin));
    assert.equal(fin.weak, 1);
    assert.equal(ledger(root).filter((l) => l.event === 'ablate').length, 1, 'finish does not run a second ablation');
    const body = readDoc(path.join(root, '.ai', 'workflows', S), '05-implement-optimize.md').body;
    assert.match(body, /## Ablation[\s\S]*\| 1 \| [0-9a-f]{12} \| experiment h1: set the value to 90 \| 0 \| weak \|/);
    assert.match(body, /\| 2 \| [0-9a-f]{12} \| [^|]+ \| 10 \| ok \|/);
    assert.equal(existsSync(`${wt}--ref`), false, 'finish removes the reference worktree');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('ablate: off, or finish --no-ablate, commits with no ablation', () => {
  const { parent, root, wt } = makeRepo('ablate: off\n');
  try {
    respec(root, 'at: ["0%"]', 'at: []');
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(step(root, wt, 'h1', 90).t.verdict, 'kept');
    const fin = run(root, 'finish');
    assert.equal(fin.ok, true, JSON.stringify(fin));
    assert.equal(fin.weak, undefined);
    assert.equal(ledger(root).some((l) => l.event === 'ablate'), false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

/** A branch trial of branch 1 in the order of the driver: the digest, the claim of an idea, the edit, the trial. */
function claimed(root, wt, id, target, extra) {
  assert.equal(run(root, 'propose-context', '--on', B1).ok, true);
  assert.equal(run(root, 'idea-claim', '--on', B1, '--target', target).ok, true);
  edit(`${wt}--r1b1`, 80, extra);
  return run(root, 'trial', id, '--on', B1, '--hypothesis', `${target} down`);
}

test('the near misses of the winner: round-close offers them as one bundle, and trial --apply makes it from the saved diffs', () => {
  const { parent, root, wt } = makeRepo();
  try {
    respec(root, 'min-gain: 0', 'min-gain: 10', 'branch-trials: 2', 'branch-trials: 3', 'max-extra: 1\n', 'max-extra: 1\n  prune: off\n');
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);
    assert.equal(step(root, wt, 'h1', 80).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h2', 95).t.verdict, 'reverted');
    assert.equal(claimed(root, wt, 'h3', 'extra', { 'src/extra.txt': '-6' }).verdict, 'reverted', 'a gain of 6 is under the threshold of 10');
    assert.equal(step(root, wt, 'h4', 120).t.verdict, 'reverted');
    assert.equal(claimed(root, wt, 'h5', 'alt', { 'src/alt.txt': '75' }).verdict, 'reverted', 'a gain of 5 on another file');
    assert.equal(step(root, wt, 'h6', 130).t.verdict, 'reverted');
    const close = run(root, 'round-close');
    assert.equal(close.ok, true, JSON.stringify(close));
    assert.deepEqual(close.bundles, [{ name: 'n1', trials: [3, 5] }], 'the largest gain first; trial 2 is a near miss of a branch that lost');
    const n1 = close.merge.candidates.find((c) => c.name === 'n1');
    assert.deepEqual([n1.kind, n1.gain, n1.patchFiles.length, n1.conflict], ['bundle', 11, 2, false]);
    assert.deepEqual([n1.targets, n1.ledger.map((i) => [i.target, i.status, i.trials])], [['extra', 'alt'], [['extra', 'marginal', [{ trial: 3, lane: B1 }]], ['alt', 'marginal', [{ trial: 5, lane: B1 }]]]], 'the consider step sees the ideas of the ledger on the targets');
    assert.equal(run(root, 'merge-consider', '--try', 'n1').ok, true);
    const st = run(root, 'status');
    assert.deepEqual([st.next.action, st.next.port, st.next.portOf.trials], ['trial', 'n1', [3, 5]]);

    // A saved diff that does not apply records no trial and leaves the worktree clean.
    const p5 = path.join(root, '.ai', 'workflows', S, 'optimize', 'patches', '5.patch');
    const good = readFileSync(p5, 'utf8');
    writeFileSync(p5, good.replace(/\+75/, '+75\n+76').replace(/@@ .* @@/, '@@ -1,9 +1,9 @@'));
    const bad = run(root, 'trial', 'n1', '--apply', '--hypothesis', 'the near misses of r1b1');
    assert.deepEqual([bad.ok, bad.apply], [false, 'failed'], JSON.stringify(bad));
    assert.equal(run(root, 'status').counters.trials, 6);
    assert.equal(git(wt, 'status', '--porcelain'), '');
    writeFileSync(p5, good);

    const t = run(root, 'trial', 'n1', '--apply', '--hypothesis', 'the near misses of r1b1');
    assert.deepEqual([t.ok, t.verdict, t.median], [true, 'kept', 69], JSON.stringify(t));
    const line = ledger(root).find((l) => l.port);
    assert.deepEqual([line.port, line.additive, line.applied], [{ round: 1, trials: [3, 5], branch: B1, kind: 'bundle' }, { measured: 11, sum: 11 }, ['3.patch', '5.patch']]);
    assert.equal(run(root, 'status').next.action, 'trial', 'the merge step closes when no try is left');
    const ideas = JSON.parse(readFileSync(path.join(root, '.ai', 'workflows', S, 'optimize', 'ideas.json'), 'utf8'));
    assert.deepEqual(ideas.ideas.map((i) => i.status), ['bundled', 'bundled'], 'a kept bundle marks its ideas');
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, '.ai', 'workflows', S, 'optimize', 'state.json'), 'utf8')).bundlesTried, ['i1,i2']);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

const HOLDOUT = 'holdout:\n  command: "node holdout.js"\n  tolerance: 5%\n';
function withHoldout(root) {
  writeFileSync(path.join(root, 'holdout.js'), "const fs = require('fs'); const n = (f) => (fs.existsSync(f) ? Number(fs.readFileSync(f, 'utf8').trim()) : null); console.log(n('src/hold.txt') ?? ((n('src/alt.txt') ?? n('src/value.txt')) + (n('src/extra.txt') ?? 0)));\n");
  git(root, 'add', 'holdout.js');
  git(root, 'commit', '-q', '-m', 'holdout');
  respec(root, 'at: ["0%"]', 'at: []');
}

test('finish runs the holdout when a change was kept after the last checkpoint, and writes it into the implement record', () => {
  const { parent, root, wt } = makeRepo(HOLDOUT);
  try {
    withHoldout(root);
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(step(root, wt, 'h1', 90).t.verdict, 'kept');
    const fin = run(root, 'finish');
    assert.equal(fin.ok, true, JSON.stringify(fin));
    assert.deepEqual(ledger(root).filter((l) => l.event === 'checkpoint').map((l) => [l.trial, l.value, l.ok]), [[1, 90, true]]);
    assert.match(readDoc(path.join(root, '.ai', 'workflows', S), '05-implement-optimize.md').body, /- The holdout moved from 100 to 90 \(checked at trial 1\)\./);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a holdout that regresses stops the finish, and finish --no-holdout commits anyway', () => {
  const { parent, root, wt } = makeRepo(HOLDOUT);
  try {
    withHoldout(root);
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(step(root, wt, 'h1', 90, { 'src/hold.txt': '200' }).t.verdict, 'kept', 'the metric does not read the holdout file');
    const stop = run(root, 'finish');
    assert.equal(stop.ok, false);
    assert.match(stop.error, /^the holdout regressed before finish: the holdout is 200 against the baseline 100/);
    assert.equal(run(root, 'status').reason, 'holdout-regression');
    const fin = run(root, 'finish', '--no-holdout');
    assert.equal(fin.ok, true, JSON.stringify(fin));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('finish --stash puts the uncommitted tracked files aside for the commits and restores them; a file in the commits is refused', () => {
  const { parent, root, wt } = makeRepo();
  try {
    respec(root, 'at: ["0%"]', 'at: []');
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(step(root, wt, 'h1', 90).t.verdict, 'kept');
    const mine = `${readFileSync(path.join(root, '.gitignore'), 'utf8')}my-notes/\n`;
    writeFileSync(path.join(root, '.gitignore'), mine);
    assert.match(run(root, 'finish').error, /run finish --stash/);

    writeFileSync(path.join(root, 'src', 'value.txt'), '42\n');
    assert.match(run(root, 'finish', '--stash').error, /^finish --stash: src\/value\.txt also change in the commits/);
    git(root, 'checkout', '--', 'src/value.txt');

    const fin = run(root, 'finish', '--stash');
    assert.equal(fin.ok, true, JSON.stringify(fin));
    assert.deepEqual(fin.stash, { restored: true, files: ['.gitignore'] });
    assert.equal(readFileSync(path.join(root, '.gitignore'), 'utf8'), mine, 'the file comes back byte for byte');
    assert.equal(readFileSync(path.join(root, 'src', 'value.txt'), 'utf8').trim(), '90', 'the commit landed');
    assert.equal(git(root, 'stash', 'list'), '');
    assert.equal(git(root, 'show', '--name-only', '--format=', 'HEAD').split(/\r?\n/).includes('.gitignore'), false, 'the person\'s file is not in the commits');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('the holder of the measure lock refreshes its stamp before each command of a trial', () => {
  const { parent, root, wt } = makeRepo();
  const lock = path.join(root, '.ai', 'workflows', S, 'optimize', '.measure.lock');
  const seen = path.join(parent, 'seen.txt');
  // The metric notes the stamp of the lock at each run.
  commitFile(root, 'metric.js', "const fs = require('fs'); try { fs.appendFileSync(process.env.OPT_SEEN, JSON.parse(fs.readFileSync(process.env.OPT_LOCK, 'utf8')).at + '\\n'); } catch {} const n = (f) => (fs.existsSync(f) ? Number(fs.readFileSync(f, 'utf8').trim()) : null); console.log((n('src/alt.txt') ?? n('src/value.txt')) + (n('src/extra.txt') ?? 0));\n");
  const env = { ...process.env, OPT_LOCK: lock, OPT_SEEN: seen };
  const runEnv = (...args) => JSON.parse(execFileSync(process.execPath, [SCRIPT, args[0], root, S, ...args.slice(1)], { encoding: 'utf8', env }));
  try {
    assert.equal(runEnv('baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);
    rmSync(seen, { force: true });
    edit(`${wt}--r1b1`, 90);
    assert.equal(runEnv('trial', 'h1', '--on', B1, '--hypothesis', 'set the value to 90').verdict, 'kept');
    const stamps = readFileSync(seen, 'utf8').trim().split('\n');
    assert.ok(stamps.length >= 3, 'the metric ran with the lock held');
    assert.equal(new Set(stamps).size, stamps.length, `each command has a new stamp: ${stamps.join(', ')}`);
    assert.equal(existsSync(lock), false, 'the holder releases the lock');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a step that fails after the trial commit puts the lane back and records the trial as crashed', () => {
  const { parent, root, wt } = makeRepo();
  try {
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);
    // A file where the patches folder goes: the save of the diff of a kept trial fails.
    const patches = path.join(root, '.ai', 'workflows', S, 'optimize', 'patches');
    writeFileSync(patches, 'not a folder');
    const before = git(`${wt}--r1b1`, 'rev-parse', 'HEAD');
    edit(`${wt}--r1b1`, 90);
    const t = run(root, 'trial', 'h1', '--on', B1, '--hypothesis', 'set the value to 90');
    assert.deepEqual([t.ok, t.verdict], [false, 'crashed'], JSON.stringify(t));
    assert.equal(git(`${wt}--r1b1`, 'rev-parse', 'HEAD'), before, 'the lane is back at its best');
    const st = run(root, 'status');
    assert.equal(st.state, 'running', JSON.stringify(st));
    const line = ledger(root).filter((l) => l.event === 'trial').at(-1);
    assert.deepEqual([line.trial, line.verdict], [1, 'crashed']);
    assert.match(line.reason, /failed after its commit/);
    rmSync(patches, { force: true });
    assert.equal(step(root, wt, 'h2', 90, undefined, B1).t.verdict, 'kept', 'the loop goes on');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('the saved diff of a trial applies when its hunk ends in a blank line', () => {
  const { parent, root, wt } = makeRepo();
  try {
    // src/z.txt sorts after src/value.txt, so its hunk is the last one of the patch.
    commitFile(root, 'src/z.txt', 'x\n\n');
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);
    assert.equal(step(root, wt, 'h1', 90, { 'src/z.txt': 'y\n\n' }, B1).t.verdict, 'kept');
    const patch = path.join(root, '.ai', 'workflows', S, 'optimize', 'patches', '1.patch');
    assert.ok(readFileSync(patch, 'utf8').endsWith(' \n'), 'the blank context line is in the patch');
    git(root, 'apply', '--check', patch);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a metric that times out is stopped with the processes that it started', () => {
  const { parent, root } = makeRepo();
  const marker = path.join(parent, 'late.txt');
  try {
    respec(root, 'trial-timeout: 1m', 'trial-timeout: 2s');
    // The metric starts a child that writes a file after 4 seconds, then waits.
    commitFile(root, 'metric.js', `require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(`setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, 'late'), 4000)`)}], { stdio: 'ignore' }); setTimeout(() => {}, 60000);\n`);
    const b = run(root, 'baseline');
    assert.equal(b.ok, false);
    assert.match(b.error, /timed out/);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    assert.equal(existsSync(marker), false, 'the child of the metric did not run on');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a prune whose fork fails to set up leaves a state that agrees with the disk', () => {
  const { parent, root, wt } = makeRepo('setup: "node setup.js"\n');
  try {
    // The setup fails in the worktree of a third branch: the fork of the prune.
    commitFile(root, 'setup.js', 'process.exit(/r1b3$/.test(process.cwd()) ? 1 : 0);\n');
    respec(root, 'branch-trials: 2', 'branch-trials: 3');
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(run(root, 'round-open').ok, true);
    assert.equal(step(root, wt, 'h1', 80).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h2', 120).t.verdict, 'reverted');
    assert.equal(step(root, wt, 'h3', 70).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h4', 130).t.next.action, 'prune');
    const p = run(root, 'prune');
    assert.equal(p.ok, false);
    assert.match(p.error, /setup command failed/);
    assert.equal(existsSync(`${wt}--r1b3`), false, 'the failed fork is removed');
    assert.equal(git(root, 'branch', '--list', `optimize/${S}--r1b3`), '');
    const st = run(root, 'status');
    assert.equal(st.state, 'running', JSON.stringify(st));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a commit of finish that a hook refuses undoes the finish: the slug branch stays as it was', () => {
  const { parent, root, wt } = makeRepo();
  try {
    respec(root, 'at: ["0%"]', 'at: []');
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(step(root, wt, 'h1', 90).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h2', 80).t.verdict, 'kept');
    // The hook refuses the second commit of finish, so the first one is made and must go again.
    const hooks = path.join(parent, 'hooks');
    mkdirSync(hooks);
    writeFileSync(path.join(hooks, 'commit-msg'), '#!/bin/sh\nif [ -n "$REFUSE_TRIAL_2" ] && grep -q "Trial: 2 " "$1"; then echo "refused by the hook"; exit 1; fi\nexit 0\n');
    chmodSync(path.join(hooks, 'commit-msg'), 0o755);
    git(root, 'config', 'core.hooksPath', hooks.replace(/\\/g, '/'));
    const head = git(root, 'rev-parse', 'HEAD');
    let fin;
    try {
      fin = JSON.parse(execFileSync(process.execPath, [SCRIPT, 'finish', root, S, '--no-ablate'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, REFUSE_TRIAL_2: '1' } }));
    } catch (e) { fin = JSON.parse(e.stdout); }
    assert.equal(fin.ok, false, JSON.stringify(fin));
    assert.match(fin.error, /the commit of trial 2 failed, and the finish is undone: [\s\S]*refused by the hook/);
    assert.equal(git(root, 'rev-parse', 'main'), head, 'the slug branch does not move');
    assert.equal(git(root, 'status', '--porcelain'), '', 'nothing of finish stays in the main checkout');
    assert.equal(git(root, 'branch', '--list', `optimize/${S}--finish`), '', 'the temporary branch goes');
    assert.equal(git(wt, 'branch', '--show-current'), `optimize/${S}`, 'the trunk worktree is back on the trunk');
    assert.equal(git(wt, 'status', '--porcelain'), '');
    // When the hook lets the commits through, the same finish goes through.
    const again = run(root, 'finish', '--no-ablate');
    assert.equal(again.ok, true, JSON.stringify(again));
    assert.equal(again.commits.length, 2);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('three kept changes with a reverted trial between them give three commits and the tree of the trunk', () => {
  const { parent, root, wt } = makeRepo();
  try {
    respec(root, 'at: ["0%"]', 'at: []');
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(step(root, wt, 'h1', 90).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h2', 95).t.verdict, 'reverted');
    assert.equal(step(root, wt, 'h3', 80, { 'src/extra.txt': '0' }).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h4', 70).t.verdict, 'kept');
    const trunkTree = git(root, 'rev-parse', `optimize/${S}^{tree}`);
    const head = git(root, 'rev-parse', 'HEAD');
    const fin = run(root, 'finish');
    assert.deepEqual([fin.ok, fin.history, fin.commits?.length, fin.kept], [true, 'per-change', 3, 3], JSON.stringify(fin));
    assert.equal(git(root, 'rev-parse', 'HEAD^{tree}'), trunkTree, 'the slug branch ends with the tree of the trunk');
    assert.deepEqual(git(root, 'rev-list', '--reverse', `${head}..HEAD`).split(/\r?\n/), fin.commits);
    assert.deepEqual(git(root, 'log', '--format=%s', `${head}..HEAD`).split(/\r?\n/), ['set the value to 70', 'set the value to 80', 'set the value to 90'], 'the reverted trial is not in the history');
    assert.equal(git(root, 'log', '-1', '--skip=1', '--format=%b'), 'Measured gain: 10.\nMetric: 90 before, 80 after.\nTrial: 3 (h3).');
    const dir = path.join(root, '.ai', 'workflows', S);
    const fm = frontmatterOfDoc(dir, '05-implement-optimize.md');
    assert.deepEqual([fm['optimize-history'], fm['optimize-commits'], fm['commit-sha']], ['per-change', fin.commits, fin.commit]);
    const body = readDoc(dir, '05-implement-optimize.md').body;
    assert.match(body, /- 3 commits on the slug branch, one for each kept change/);
    assert.match(body, new RegExp(`## Kept Changes[\\s\\S]*\\| 1 \\| ${fin.commits[0].slice(0, 12)} \\| set the value to 90 \\| 100 \\| 90 \\| 10 \\| [a-z ]+ \\|`));
    assert.match(body, new RegExp(`\\| 4 \\| ${fin.commits[2].slice(0, 12)} \\| set the value to 70 \\| 80 \\| 70 \\| 10 \\| [a-z ]+ \\|`));
    // The step ledger records each commit as a done step, and the last one completes the slice.
    const steps = readFileSync(path.join(dir, 'steps.jsonl'), 'utf8').trim().split(/\r?\n/).map((l) => JSON.parse(l));
    assert.deepEqual(steps.map((r) => [r.slice, r.event, r.step ?? null, r.sha]), [
      ['optimize', 'done', 1, fin.commits[0]], ['optimize', 'done', 2, fin.commits[1]], ['optimize', 'done', 3, fin.commits[2]], ['optimize', 'complete', null, fin.commit],
    ]);
    assert.deepEqual(steps.slice(0, 3).map((r) => [r.branch, r.trials]), [['main', [1]], ['main', [3]], ['main', [4]]]);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a lineage that does not replay one change at a time falls back to one commit, and says why', () => {
  const { parent, root, wt } = makeRepo();
  try {
    respec(root, 'at: ["0%"]', 'at: []');
    assert.equal(run(root, 'baseline').ok, true);
    assert.equal(step(root, wt, 'h1', 90).t.verdict, 'kept');
    // The second keep puts the value back and gains in another file: the trunk changes only src/extra.txt.
    assert.equal(step(root, wt, 'h2', 100, { 'src/extra.txt': '-20' }).t.verdict, 'kept');
    // Meanwhile the slug branch changes the line that the first keep changed: that keep does not apply alone.
    writeFileSync(path.join(root, 'src', 'value.txt'), '101\n');
    git(root, 'commit', '-q', '-am', 'person');
    const want = git(root, 'merge-tree', '--write-tree', 'HEAD', `optimize/${S}`).split(/\r?\n/)[0];
    const fin = run(root, 'finish', '--no-ablate', '--message', 'Cut the value with the extra file');
    assert.deepEqual([fin.ok, fin.history, fin.commits?.length], [true, 'one-commit', 1], JSON.stringify(fin));
    assert.match(fin.reason, /^the change of trial 1 does not apply on its own/);
    assert.equal(git(root, 'rev-parse', 'HEAD^{tree}'), want, 'the one commit has the tree of a merge of the trunk');
    assert.deepEqual([readFileSync(path.join(root, 'src', 'value.txt'), 'utf8').trim(), readFileSync(path.join(root, 'src', 'extra.txt'), 'utf8').trim()], ['101', '-20']);
    assert.deepEqual(git(root, 'log', '-2', '--format=%s').split(/\r?\n/), ['Cut the value with the extra file', 'person'], '--message is the subject of the one commit');
    assert.match(git(root, 'log', '-1', '--format=%b'), /^One commit holds every kept change, because the change of trial 1 does not apply on its own[^\n]*\.\nTrials: 1, 2\.$/);
    const dir = path.join(root, '.ai', 'workflows', S);
    assert.equal(frontmatterOfDoc(dir, '05-implement-optimize.md')['optimize-history'], 'one-commit');
    assert.match(readDoc(dir, '05-implement-optimize.md').body, /- One commit with every kept change: [0-9a-f]{40}\. Each change could not get its own commit: the change of trial 1/);
    assert.equal(git(root, 'branch', '--list', `optimize/${S}--finish`), '');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

/** A loop with two kept changes on the trunk, ready to finish. */
function twoKeeps() {
  const repo = makeRepo();
  respec(repo.root, 'at: ["0%"]', 'at: []');
  assert.equal(run(repo.root, 'baseline').ok, true);
  assert.equal(step(repo.root, repo.wt, 'h1', 90).t.verdict, 'kept');
  assert.equal(step(repo.root, repo.wt, 'h2', 80).t.verdict, 'kept');
  return repo;
}
const TEMP = `optimize/${S}--finish`;
const statePathOf = (root) => path.join(root, '.ai', 'workflows', S, 'optimize', 'state.json');
const readStateOf = (root) => JSON.parse(readFileSync(statePathOf(root), 'utf8'));
const writeStateOf = (root, state) => writeFileSync(statePathOf(root), `${JSON.stringify(state, null, 2)}\n`);
/** The commits of finish as subject, body and tree: the same finish gives the same list in another repo. */
const finishLog = (root, base) => git(root, 'log', '--reverse', '--format=%s%n%b%n%T%n--', `${base}..HEAD`);
const tryGit = (cwd, ...args) => { try { git(cwd, ...args); return true; } catch { return false; } };

test('a finish killed midway is put away by the next finish, which gives the same commits as an undisturbed finish', () => {
  const clean = twoKeeps();
  const killed = twoKeeps();
  const halfPick = twoKeeps();
  try {
    const cleanBase = git(clean.root, 'rev-parse', 'HEAD');
    const fin = run(clean.root, 'finish', '--no-ablate');
    assert.deepEqual([fin.ok, fin.history, fin.commits?.length, fin.recovered], [true, 'per-change', 2, undefined], JSON.stringify(fin));
    const want = finishLog(clean.root, cleanBase);

    // Killed after the temporary branch was made in the trunk worktree, with no record of it in state.json.
    const base = git(killed.root, 'rev-parse', 'HEAD');
    git(killed.wt, 'checkout', '-q', '-b', TEMP, base);
    const st = run(killed.root, 'status');
    assert.equal(st.reason === 'state-error', false, JSON.stringify(st));
    assert.match(st.recover, /a finish stopped midway/);
    const again = run(killed.root, 'finish', '--no-ablate');
    assert.deepEqual([again.ok, again.history, again.commits?.length], [true, 'per-change', 2], JSON.stringify(again));
    assert.ok(again.recovered.some((r) => r.startsWith(`the trunk worktree was on ${TEMP}: it is back on optimize/${S}`)), JSON.stringify(again.recovered));
    assert.ok(again.recovered.includes(`the branch ${TEMP} is deleted`));
    assert.equal(finishLog(killed.root, base), want, 'the same commits as an undisturbed finish');
    assert.equal(git(killed.root, 'branch', '--list', TEMP), '');
    assert.equal(readStateOf(killed.root).finishing, undefined);

    // Killed in a cherry-pick that stopped on a conflict, with the record of the start in state.json.
    const hb = git(halfPick.root, 'rev-parse', 'HEAD');
    const trunk = git(halfPick.root, 'rev-list', '--reverse', `${hb}..optimize/${S}`).split(/\r?\n/);
    git(halfPick.wt, 'checkout', '-q', '-b', TEMP, hb);
    assert.equal(tryGit(halfPick.wt, 'cherry-pick', trunk[1]), false, 'the second change does not apply on the base: the cherry-pick stops');
    assert.equal(tryGit(halfPick.wt, 'rev-parse', '--verify', '--quiet', 'CHERRY_PICK_HEAD'), true);
    const state = readStateOf(halfPick.root);
    writeStateOf(halfPick.root, { ...state, finishing: { branch: 'main', base: hb, at: '2026-01-01T00:00:00Z' } });
    const third = run(halfPick.root, 'finish', '--no-ablate');
    assert.deepEqual([third.ok, third.history, third.commits?.length], [true, 'per-change', 2], JSON.stringify(third));
    assert.ok(third.recovered.some((r) => r.startsWith(`the trunk worktree was on ${TEMP} with a cherry-pick: it is back on optimize/${S}`)), JSON.stringify(third.recovered));
    assert.equal(finishLog(halfPick.root, hb), want);
    assert.equal(git(halfPick.root, 'status', '--porcelain', '--untracked-files=no'), '');
    const steps = readFileSync(path.join(halfPick.root, '.ai', 'workflows', S, 'steps.jsonl'), 'utf8').trim().split(/\r?\n/);
    assert.equal(steps.length, 3, 'two done steps and the complete row');
  } finally {
    for (const r of [clean, killed, halfPick]) rmSync(r.parent, { recursive: true, force: true });
  }
});

test('a finish that stopped after the fast-forward writes the records of its commits and builds nothing again', () => {
  const { parent, root, wt } = twoKeeps();
  try {
    const base = git(root, 'rev-parse', 'HEAD');
    const trunk = git(root, 'rev-list', '--reverse', `${base}..optimize/${S}`).split(/\r?\n/);
    // The earlier finish made its commits on the temporary branch and moved main, then stopped before the branch went.
    git(wt, 'checkout', '-q', '-b', TEMP, base);
    for (const c of trunk) git(wt, 'cherry-pick', '--allow-empty-message', c);
    const tip = git(wt, 'rev-parse', 'HEAD');
    const made = git(root, 'rev-list', '--reverse', `${base}..${tip}`).split(/\r?\n/);
    git(wt, 'checkout', '-q', `optimize/${S}`);
    git(root, 'merge', '--ff-only', '-q', tip);
    const changes = [
      { trial: 1, trunkCommit: trunk[0], before: 100, after: 90, gain: 10, ablation: null, commit: made[0], subject: 'set the value to 90' },
      { trial: 2, trunkCommit: trunk[1], before: 90, after: 80, gain: 10, ablation: null, commit: made[1], subject: 'set the value to 80' },
    ];
    const state = readStateOf(root);
    writeStateOf(root, { ...state, finishing: { branch: 'main', base, at: '2026-01-01T00:00:00Z', built: { branch: 'main', base, tip, history: 'per-change', changes } } });
    const fin = run(root, 'finish', '--no-ablate');
    assert.deepEqual([fin.ok, fin.history, fin.commits, fin.commit], [true, 'per-change', made, tip], JSON.stringify(fin));
    assert.ok(fin.recovered.some((r) => r.startsWith(`main holds the commits of the finish that stopped, up to ${tip.slice(0, 12)}`)), JSON.stringify(fin.recovered));
    assert.ok(fin.recovered.includes(`the branch ${TEMP} is deleted`));
    assert.equal(git(root, 'rev-parse', 'HEAD'), tip, 'no commit is built again');
    const dir = path.join(root, '.ai', 'workflows', S);
    const fm = frontmatterOfDoc(dir, '05-implement-optimize.md');
    assert.deepEqual([fm['commit-sha'], fm['optimize-commits']], [tip, made]);
    const steps = readFileSync(path.join(dir, 'steps.jsonl'), 'utf8').trim().split(/\r?\n/).map((l) => JSON.parse(l));
    assert.deepEqual(steps.map((r) => [r.event, r.sha]), [['done', made[0]], ['done', made[1]], ['complete', tip]]);
    assert.equal(git(root, 'branch', '--list', TEMP), '');
    const st = readStateOf(root);
    assert.deepEqual([st.finished?.commit, st.finishing], [tip, undefined]);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a finish that stopped midway, with a trunk branch that moved since, stops with the error and changes nothing', () => {
  const { parent, root, wt } = twoKeeps();
  try {
    const base = git(root, 'rev-parse', 'HEAD');
    git(wt, 'checkout', '-q', '-b', TEMP, base);
    git(root, 'update-ref', `refs/heads/optimize/${S}`, `optimize/${S}~1`);
    const trunkAt = git(root, 'rev-parse', `optimize/${S}`);
    // Every command counts its time on the clock of the loop; nothing else of the state may change.
    const noClock = ({ activeMs, clockAt, ...rest }) => rest;
    const before = noClock(readStateOf(root));
    const st = run(root, 'status');
    assert.equal(st.reason, 'state-error', JSON.stringify(st));
    const fin = run(root, 'finish', '--no-ablate');
    assert.equal(fin.ok, false, JSON.stringify(fin));
    assert.match(fin.error, new RegExp(`state-error: a finish stopped midway, and optimize/${S} is at ${trunkAt.slice(0, 12)}`));
    assert.deepEqual([git(root, 'rev-parse', 'HEAD'), git(root, 'rev-parse', `optimize/${S}`), git(wt, 'branch', '--show-current')], [base, trunkAt, TEMP], 'nothing moves');
    assert.notEqual(git(root, 'branch', '--list', TEMP), '');
    assert.deepEqual(noClock(readStateOf(root)), before);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('cleanup removes the leftovers of a finish: its worktree and its branch', () => {
  const { parent, root, wt } = twoKeeps();
  try {
    assert.equal(run(root, 'finish', '--no-ablate').ok, true);
    assert.equal(existsSync(wt), false);
    git(root, 'worktree', 'add', '-q', '-b', TEMP, `${wt}--finish`, 'HEAD~1');
    writeFileSync(path.join(`${wt}--finish`, 'src', 'value.txt'), '7\n');
    git(`${wt}--finish`, 'add', '-A');
    const c = run(root, 'cleanup');
    assert.equal(c.ok, true, JSON.stringify(c));
    assert.ok(c.removed.includes(TEMP), JSON.stringify(c));
    assert.equal(existsSync(`${wt}--finish`), false);
    assert.equal(git(root, 'branch', '--list', TEMP), '');
    assert.equal(git(root, 'worktree', 'list').split(/\r?\n/).length, 1);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('a commit hook that refuses by branch name judges the commits of finish on the slug branch, and undoes the finish', () => {
  const { parent, root, wt } = twoKeeps();
  try {
    const hooks = path.join(parent, 'hooks');
    mkdirSync(hooks);
    // The trials were committed on the trunk branch, which this hook allows; it refuses commits on main.
    writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\nif [ "$(git branch --show-current)" = main ]; then echo "no direct commits on main" >&2; exit 1; fi\nexit 0\n');
    chmodSync(path.join(hooks, 'pre-commit'), 0o755);
    git(root, 'config', 'core.hooksPath', hooks.replace(/\\/g, '/'));
    const head = git(root, 'rev-parse', 'HEAD');
    const fin = run(root, 'finish', '--no-ablate');
    assert.equal(fin.ok, false, JSON.stringify(fin));
    assert.match(fin.error, /the commit hooks refuse the commits of finish on main, and the finish is undone: pre-commit: [\s\S]*no direct commits on main/);
    assert.equal(git(root, 'rev-parse', 'main'), head, 'the slug branch does not move');
    assert.equal(git(root, 'status', '--porcelain'), '');
    assert.equal(git(root, 'branch', '--list', TEMP), '');
    assert.equal(git(wt, 'branch', '--show-current'), `optimize/${S}`);
    assert.equal(git(wt, 'status', '--porcelain'), '');
    assert.equal(readStateOf(root).finishing, undefined);
    // A commit-msg hook sees each message of finish, on main.
    rmSync(path.join(hooks, 'pre-commit'));
    writeFileSync(path.join(hooks, 'commit-msg'), '#!/bin/sh\nif [ "$(git branch --show-current)" = main ] && grep -q "Trial: 2 " "$1"; then echo "trial 2 not on main" >&2; exit 1; fi\nexit 0\n');
    chmodSync(path.join(hooks, 'commit-msg'), 0o755);
    const msg = run(root, 'finish', '--no-ablate');
    assert.match(msg.error, /refuse the commits of finish on main[\s\S]*commit-msg: [\s\S]*trial 2 not on main/, JSON.stringify(msg));
    assert.equal(git(root, 'rev-parse', 'main'), head);
    // When the hooks allow main, the same finish goes through.
    rmSync(path.join(hooks, 'commit-msg'));
    const again = run(root, 'finish', '--no-ablate');
    assert.deepEqual([again.ok, again.commits?.length], [true, 2], JSON.stringify(again));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('resume clears a stored stop, and resume --revert puts the trunk back at the last good checkpoint', () => {
  const { parent, root, wt } = makeRepo(HOLDOUT);
  try {
    withHoldout(root);
    assert.equal(run(root, 'baseline').ok, true);
    const base = git(wt, 'rev-parse', 'HEAD');
    assert.equal(step(root, wt, 'h1', 90, { 'src/hold.txt': '200' }).t.verdict, 'kept');
    assert.equal(run(root, 'finish').ok, false);
    const stopped = run(root, 'status');
    assert.equal(stopped.reason, 'holdout-regression');
    assert.match(stopped.next.why, /resume --revert/);
    const r = run(root, 'resume', '--revert');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual([r.resumed, r.reverted, r.dropped], ['holdout-regression', base, [1]]);
    assert.equal(git(wt, 'rev-parse', 'HEAD'), base, 'the trunk is back at the baseline');
    assert.equal(r.state, 'running');
    assert.equal(run(root, 'resume').resumed, null, 'with no stored stop there is nothing to resume');
    const fin = run(root, 'finish');
    assert.deepEqual([fin.ok, fin.kept], [true, 0], JSON.stringify(fin));
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test('with paired measurement, the merge candidates of a round use the paired noise', () => {
  const { parent, root, wt } = makeRepo();
  try {
    respec(root, '  min-gain: 0\n', '  min-gain: 0\n  paired: true\n');
    assert.equal(run(root, 'baseline').ok, true);
    // A large unpaired spread: the paired keep rule does not use it, and the merge cut must not either.
    const file = path.join(root, '.ai', 'workflows', S, 'optimize', 'state.json');
    const state = JSON.parse(readFileSync(file, 'utf8'));
    state.baseline.noise = 50;
    writeFileSync(file, JSON.stringify(state, null, 2));
    assert.equal(run(root, 'round-open').ok, true);
    assert.equal(step(root, wt, 'h1', 80).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h2', 100, { 'src/extra.txt': '-10' }).t.verdict, 'kept');
    assert.equal(step(root, wt, 'h3', 120).t.verdict, 'reverted');
    assert.equal(step(root, wt, 'h4', 130).t.verdict, 'reverted');
    const close = run(root, 'round-close');
    assert.equal(close.ok, true, JSON.stringify(close));
    assert.deepEqual(close.candidates.map((c) => c.name), [B2]);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
