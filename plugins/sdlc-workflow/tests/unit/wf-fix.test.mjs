// Every failure of wf.mjs ends with its fix lines: `fix.who:`, `fix.do:`, and `fix: <command>`
// when a command makes the repair. Each class of failure is driven once, and the command of a fix
// must name a real command and form of wf.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assertFix, fixFromLines } from '../helpers/fix-shape.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLAN = '---\ntype: plan\n---\n# Plan: api\n\n## Step-by-Step Plan\n\n1. **Route** — files: `a.js`.\n2. **Store** — files: `b.js`.\n';

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-wf-fix-'));
  const home = path.join(root, '.sdlc-home');
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: demo\nstatus: active\ncurrent-stage: plan\n---\n');
  writeFileSync(path.join(dir, '03-slice.md'), '---\nschema: sdlc/v1\ntype: slice\nslug: demo\nslices:\n  - slug: api\n---\n');
  writeFileSync(path.join(dir, '04-plan-api.md'), PLAN);
  writeFileSync(path.join(root, '.gitignore'), '.ai/\n.sdlc-home/\n');
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  writeFileSync(path.join(root, 'base.txt'), 'base\n');
  git('add', '.gitignore', 'base.txt');
  git('commit', '-qm', 'base');
  // The machine state (the error log, the records clone) stays in the temp folder.
  const env = { ...process.env, SDLC_HOME: home, SDLC_RECORDS_HOME: path.join(home, 'records') };
  const run = (args) => spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), ...args], { encoding: 'utf8', cwd: root, env });
  return { root, home, run, done: () => rmSync(root, { recursive: true, force: true }) };
}

// [name, args (with <root>), who, command (true: one, false: none, null: either), a match of the error]
const CASES = [
  ['usage: a missing argument', ['step', 'done', '<root>', 'demo'], 'agent', false, /<slice> is required/],
  ['usage: an unknown verb', ['findings', 'add', '<root>', 'demo'], 'agent', false, /<found\.json> is required/],
  ['a slug that names no workflow', ['decide', 'list', '<root>', 'nope'], 'agent', true, /no workflow folder/],
  ['a step done with no --sha names the command', ['step', 'done', '<root>', 'demo', 'api', '1'], 'agent', true, /--sha <commit> is required/],
  ['a wrong enum value of a lib names the values', ['decide', 'add', '<root>', 'demo', '--answer', 'x', '--key', 'k', '--by', 'robot'], 'agent', false, /by must be one of/],
  ['a record that is not there', ['record', 'get', '<root>', 'demo', 'nosuch'], 'agent', null, /nosuch/],
  ['a stage with no Requires table', ['requires', '<root>', 'demo', 'nostage'], 'agent', false, /no stage reference/],
  ['a board that is not there', ['board', 'set', '<root>', 'demo', 'k', 'a=b'], 'agent', false, /no board at/],
  ['a project name that the pattern refuses', ['records', 'link', '<root>', 'Bad Name'], 'agent', true, /must match/],
  ['only the person sets a standing answer', ['standing', 'set', '<root>', 'pr-wanted', '--answer', 'yes', '--question', 'q', '--by', 'policy'], 'person', false, /only the person sets/],
  ['a GitHub layer that is off', ['gh', 'backfill', '<root>'], 'person', false, /the layer is off/],
  ['a script outside the project', ['run', '<root>', '<outside>'], 'agent', false, /outside the project/],
];

for (const [name, args, who, command, error] of CASES) {
  test(`wf.mjs fix: ${name}`, async () => {
    const f = repo();
    const outside = path.join(mkdtempSync(path.join(tmpdir(), 'sdlc-wf-out-')), 'x.mjs');
    writeFileSync(outside, 'export default async () => 1;\n');
    try {
      const r = f.run(args.map((a) => (a === '<root>' ? f.root : a === '<outside>' ? outside : a)));
      assert.equal(r.status, 1, `${r.stdout}\n${r.stderr}`);
      assert.match(`${r.stdout}\n${r.stderr}`, error);
      const fix = fixFromLines(r.stderr);
      assert.ok(fix, `fix lines on stderr:\n${r.stderr}`);
      await assertFix(fix, { who, command });
      // The fix lines are the last lines of stderr.
      assert.match(r.stderr.trim().split(/\r?\n/).pop(), /^fix(\.who|\.do|\.then)?: /);
    } finally { f.done(); rmSync(path.dirname(outside), { recursive: true, force: true }); }
  });
}

test('wf.mjs fix: an error with no fix is a defect, written to the machine error log', async () => {
  const f = repo();
  try {
    // A found file that is not there: the read fails inside the command, with no fix of its own.
    const r = f.run(['findings', 'add', f.root, 'demo', path.join(f.root, 'missing.json')]);
    assert.equal(r.status, 1);
    const fix = await assertFix(fixFromLines(r.stderr), { who: 'person', command: false });
    assert.match(fix.do, /defect of the plugin/);
    const log = path.join(f.home, 'errors.log');
    assert.ok(fix.do.includes(log), `the fix names the log ${log}: ${fix.do}`);
    assert.ok(existsSync(log), 'the error is in the log');
  } finally { f.done(); }
});

test('wf.mjs fix: a fix with a command keeps `fix: <command>` as the last line', () => {
  const f = repo();
  try {
    const r = f.run(['decide', 'list', f.root, 'nope']);
    const lines = r.stderr.trim().split(/\r?\n/);
    assert.equal(lines.at(-3), 'fix.who: agent');
    assert.match(lines.at(-2), /^fix\.do: /);
    assert.match(lines.at(-1), /^fix: wf\.mjs status \S+$/);
  } finally { f.done(); }
});
