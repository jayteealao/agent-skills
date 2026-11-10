// Each failure class of scripts/optimize.mjs prints a fix: who repairs it, and for the agent the
// exact next command, which names a real command of a real script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertFix } from '../helpers/fix-shape.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(pluginRoot, 'scripts', 'optimize.mjs');
const S = 'speed';

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function makeRepo({ spec = true, confirmed = true, metric = 'command: "node metric.js"\n  direction: lower\n  repeat: 1\n  min-gain: 0' } = {}) {
  const parent = mkdtempSync(path.join(os.tmpdir(), 'optimize-fix-'));
  const root = path.join(parent, 'repo');
  const home = path.join(parent, 'home');
  mkdirSync(path.join(root, 'src'), { recursive: true });
  git(parent, 'init', '-q', '-b', 'main', root);
  git(root, 'config', 'user.email', 'o@test');
  git(root, 'config', 'user.name', 'o');
  writeFileSync(path.join(root, 'metric.js'), "console.log(Number(require('fs').readFileSync('src/value.txt', 'utf8')));\n");
  writeFileSync(path.join(root, 'guard.js'), 'process.exit(0);\n');
  writeFileSync(path.join(root, 'src', 'value.txt'), '100\n');
  writeFileSync(path.join(root, '.gitignore'), '.ai/workflows/*/optimize/\n');
  const wf = path.join(root, '.ai', 'workflows', S);
  mkdirSync(wf, { recursive: true });
  writeFileSync(path.join(wf, '00-index.md'), `---\nschema: sdlc/v1\ntype: index\nslug: ${S}\nworkflow-type: optimize\nbranch: main\n---\n`);
  if (spec) {
    writeFileSync(path.join(wf, '02-optimize-spec.md'), `---
schema: sdlc/v1
type: optimize-spec
slug: ${S}
objective: "Cut the value"
${confirmed ? 'confirmed-by: jayte\n' : ''}metric:
  ${metric}
guard:
  command: "node guard.js"
allowed-paths: ["src/**"]
budget:
  trials: 6
  plateau: 3
  wall-clock: 1h
  trial-timeout: 1m
---

# Spec
`);
  }
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  return { parent, root, home, wf, done: () => rmSync(parent, { recursive: true, force: true }) };
}

function run(f, cmd, ...rest) {
  const env = { ...process.env, SDLC_HOME: f.home };
  try {
    return JSON.parse(execFileSync(process.execPath, [SCRIPT, cmd, f.root, S, ...rest], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }));
  } catch (e) {
    return { ...JSON.parse(e.stdout), exit: e.status };
  }
}

/** One failure: it fails with exit 1, its error matches, and its fix has the shape. */
async function fails(r, error, { who, command }) {
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.equal(r.exit, 1, 'a failure exits 1');
  assert.match(r.error, error);
  await assertFix(r.fix, { who, command });
  return r.fix;
}

test('optimize.mjs: every failure class names its fix', async () => {
  const none = makeRepo({ spec: false });
  try {
    // No spec: only the person confirms a spec, so the person writes it.
    await fails(run(none, 'baseline'), /no 02-optimize-spec\.md/, { who: 'person', command: false });
  } finally { none.done(); }

  const bad = makeRepo({ metric: 'direction: sideways' });
  try {
    // A spec with a wrong field: the agent repairs the field that the error names.
    await fails(run(bad, 'baseline'), /^02-optimize-spec\.md: /, { who: 'agent' });
  } finally { bad.done(); }

  const unconfirmed = makeRepo({ confirmed: false });
  try {
    await fails(run(unconfirmed, 'baseline'), /confirmed-by/, { who: 'person', command: false });
  } finally { unconfirmed.done(); }

  const f = makeRepo();
  try {
    // Before the baseline: a step of the loop names baseline; a report names status.
    const early = await fails(run(f, 'probe', '--cmd', 'node -v'), /no baseline: run baseline first/, { who: 'agent', command: true });
    assert.match(early.command, / baseline ".+" speed$/);
    await fails(run(f, 'report'), /no baseline: nothing to report/, { who: 'agent', command: true });

    // A branch of an earlier run: the person decides, and the agent gets no command.
    git(f.root, 'branch', `optimize/${S}`);
    await fails(run(f, 'baseline'), /exists from another run/, { who: 'person', command: false });
    git(f.root, 'branch', '-D', `optimize/${S}`);

    const b = run(f, 'baseline');
    assert.equal(b.ok, true, JSON.stringify(b));

    // The wrong order: the fix names the next action, or status.
    await fails(run(f, 'baseline'), /the baseline exists/, { who: 'agent', command: true });
    await fails(run(f, 'merge-consider', '--try', 'b1'), /the next action is .*, not merge-consider/, { who: 'agent', command: true });
    await fails(run(f, 'cleanup'), /the loop is not finished/, { who: 'agent', command: true });

    // A missing argument: the command to run again, with the argument in its place.
    const id = await fails(run(f, 'trial'), /trial needs a hypothesis id/, { who: 'agent', command: true });
    assert.match(id.command, / trial ".+" speed <id>$/);
    const target = await fails(run(f, 'idea-claim'), /idea-claim needs --target/, { who: 'agent', command: true });
    assert.match(target.command, / idea-claim ".+" speed --on trunk --target "<target>"$/);
    const probeOpen = await fails(run(f, 'probe', '--cmd', 'node -v'), /no probe worktree for/, { who: 'agent', command: true });
    assert.match(probeOpen.command, / probe-open ".+" speed --on trunk$/);
    await fails(run(f, 'probe', '--on', 'nope'), /nope is not a lane of the loop now/, { who: 'agent' });

    // A lane that is not ready: the fix lists the ready lanes.
    const lane = await fails(run(f, 'trial', 'h1', '--on', 'elsewhere'), /cannot take a trial now/, { who: 'agent' });
    assert.match(lane.do, /optimize\/speed/);

    // A measurement that runs: the agent waits, with no command.
    const lock = path.join(f.wf, 'optimize', '.measure.lock');
    writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), lane: 'x', kind: 'trial' }));
    const busy = run(f, 'trial', 'h1');
    assert.equal(busy.busy, true, JSON.stringify(busy));
    await fails(busy, /one at a time/, { who: 'agent', command: false });
    rmSync(lock);

    // A state that no command of the plugin wrote: the defect fix, with the error log.
    writeFileSync(path.join(f.wf, 'optimize', 'state.json'), '{ not json');
    const defect = await fails(run(f, 'trial', 'h1'), /JSON/, { who: 'person', command: false });
    assert.match(defect.do, /defect of the plugin/);
    assert.ok(defect.do.includes(path.join(f.home, 'errors.log')), 'the defect fix names the error log');
  } finally { f.done(); }
});
