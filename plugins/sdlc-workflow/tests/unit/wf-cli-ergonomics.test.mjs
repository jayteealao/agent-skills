// The command line of wf.mjs for agents: help per command, the real place of a file, the
// forgiving forms (a record name without .md, `complete` for a run, a Git Bash path), the batch
// of answers, the record draft, and the hints after an error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from '../../lib/yaml.mjs';
import { undoGitBashPath } from '../../lib/msys.mjs';
import { formatValidationErrors } from '../../lib/schema-validator.mjs';
import { appendJournalLine, stopCheck, writeControl } from '../../scripts/yolo-watch.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');
const watch = path.join(pluginRoot, 'scripts', 'yolo-watch.mjs');
const run = (args, opts = {}) => spawnSync(process.execPath, [wf, ...args], { encoding: 'utf8', ...opts });

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-cli-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'state.yaml'), 'schema: sdlc/v1\ntype: index\nslug: demo\nstatus: active\ncurrent-stage: plan\nupdated-at: "2026-10-25T10:00:00Z"\nopen-questions:\n  - db\n  - auth\n');
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('help lists the commands and prints the forms of one command; --help works on every command', () => {
  const all = run(['help']);
  assert.equal(all.status, 0);
  assert.match(all.stdout, /Commands: .*\bdecide\b.*\brecord\b/);
  const step = run(['help', 'step']);
  assert.equal(step.status, 0);
  assert.match(step.stdout, /step {5}done <root> <slug> <slice> <n> \[--sha s\|HEAD\]/);
  assert.match(run(['profile', '--help']).stdout, /profile {2}run <root> <suite>/);
  assert.equal(run(['--help']).status, 0);
  const none = run(['help', 'nope']);
  assert.equal(none.status, 2);
  assert.match(none.stderr, /no command nope/);
});

test('an error that names the forms points to help; a slug in the place of the root says so', () => {
  const f = fixture();
  try {
    const bare = run(['record', 'get']);
    assert.equal(bare.status, 1);
    assert.match(bare.stderr, /run wf\.mjs help record for its forms and flags/);
    const slugFirst = run(['step', 'done', 'demo', 'api', '1'], { cwd: f.root });
    assert.equal(slugFirst.status, 1);
    assert.match(slugFirst.stderr, /demo is not a project root\. The project root comes first: wf\.mjs step done "<project root>" <slug>/);
  } finally { f.done(); }
});

test('path prints the records folder, a workflow folder and a file of an unlinked project in place', () => {
  const f = fixture();
  try {
    assert.equal(run(['path', f.root]).stdout.trim(), path.join(f.root, '.ai', 'workflows'));
    assert.equal(run(['path', f.root, 'demo']).stdout.trim(), f.dir);
    assert.equal(run(['path', f.root, 'demo', 'verify-evidence/a/checks.md']).stdout.trim(), path.join(f.dir, 'verify-evidence', 'a', 'checks.md'));
  } finally { f.done(); }
});

test('decide add --file records each answer, settles each open question, and drops a slug-wide slice', () => {
  const f = fixture();
  try {
    const file = path.join(f.root, 'answers.json');
    writeFileSync(file, JSON.stringify([
      { key: 'db', question: 'Which store?', answer: 'sqlite', by: 'person', stage: 'review', slice: 'slug-wide' },
      { key: 'auth', question: 'Which sign-in?', answer: 'device code', by: 'person', stage: 'review' },
    ]));
    const r = run(['decide', 'add', f.root, 'demo', '--file', file]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^D-001 Which store\? → sqlite \(answer\)/m);
    assert.match(r.stdout, /settled db\nD-002 Which sign-in\? → device code \(answer\)\nsettled auth/);
    assert.deepEqual(parse(readFileSync(path.join(f.dir, 'state.yaml'), 'utf8'))['open-questions'], []);
    const empty = path.join(f.root, 'none.json');
    writeFileSync(empty, '[]');
    assert.match(run(['decide', 'add', f.root, 'demo', '--file', empty]).stderr, /holds no answers/);
  } finally { f.done(); }
});

test('record get takes a name without .md, names the records when one is missing, and record draft writes the draft', () => {
  const f = fixture();
  try {
    const draft = path.join(f.dir, '.draft', '04-plan-api.md');
    mkdirSync(path.dirname(draft), { recursive: true });
    const stamp = run(['stamp', 'plan', '--slug', 'demo', '--slice', 'api']);
    writeFileSync(draft, `${stamp.stdout.trim()}\n\n# Plan\n\nStep one.\n`);
    const put = run(['record', 'put', f.root, 'demo']);
    assert.equal(put.status, 0, put.stdout + put.stderr);
    assert.match(run(['record', 'get', f.root, 'demo', '04-plan-api']).stdout, /Step one\./);
    const miss = run(['record', 'get', f.root, 'demo', '05-implement-api']);
    assert.equal(miss.status, 1);
    assert.match(miss.stderr, /no record 05-implement-api in demo; its records are: .*04-plan-api\.md/);
    const d = run(['record', 'draft', f.root, 'demo', '04-plan-api']);
    assert.equal(d.status, 0, d.stderr);
    assert.match(d.stdout, /draft 04-plan-api\.md → .*04-plan-api\.md; edit it, then run record put/);
    assert.match(readFileSync(draft, 'utf8'), /^---\n[\s\S]*slug: demo[\s\S]*---\n[\s\S]*Step one\./);
  } finally { f.done(); }
});

test('progress set takes complete as done, and a Git Bash path in front of /wf is undone in every flag', () => {
  const f = fixture();
  try {
    const p = run(['progress', 'set', f.root, 'demo', '--status', 'complete', '--resume', 'C:/Program Files/Git/wf ship demo']);
    assert.equal(p.status, 0, p.stderr);
    assert.match(p.stderr, /--resume began with the Git install path/);
    const rec = JSON.parse(readFileSync(path.join(f.dir, 'progress.json'), 'utf8'));
    assert.equal(rec.status, 'done');
    assert.equal(rec.resume, '/wf ship demo');
    assert.deepEqual(undoGitBashPath('D:/Tools/Git/wf plan x'), { value: '/wf plan x', repaired: true });
    assert.deepEqual(undoGitBashPath('C:/Program Files/Git/bin/bash'), { value: 'C:/Program Files/Git/bin/bash', repaired: false });
  } finally { f.done(); }
});

test('a refused value names the values that pass', () => {
  assert.equal(formatValidationErrors([{ path: '/status', message: 'must be equal to one of the allowed values', params: { allowedValues: ['defined', 'skipped'] } }]),
    '/status: must be equal to one of the allowed values (defined, skipped)');
});

test('profile run runs the suite command, records its time, and fails with the suite', () => {
  const f = fixture();
  try {
    mkdirSync(path.join(f.root, '.ai'), { recursive: true });
    writeFileSync(path.join(f.root, '.ai', 'sdlc-config.json'), JSON.stringify({ testProfile: { fast: { command: 'node -e "process.exit(0)"', estimateSeconds: 5 } } }));
    const ok = run(['profile', 'run', f.root, 'fast', '--json']);
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).pass, true);
    const cfg = JSON.parse(readFileSync(path.join(f.root, '.ai', 'sdlc-config.json'), 'utf8'));
    assert.equal(typeof cfg.testProfile.fast.measuredSeconds, 'number');
    const none = run(['profile', 'run', f.root, 'heavy']);
    assert.equal(none.status, 1);
    assert.match(none.stderr, /has no command for the heavy suite; set it with profile set first/);
  } finally { f.done(); }
});

test('record get into a closed pipe exits without a stack trace', () => {
  const f = fixture();
  try {
    const sh = spawnSync(`"${process.execPath}" "${wf}" record get "${f.root}" demo index | node -e "process.stdin.once('data',()=>process.exit(0))"`, { shell: true, encoding: 'utf8' });
    assert.doesNotMatch(sh.stderr, /EPIPE|at .*wf\.mjs/);
  } finally { f.done(); }
});

test('stop-check: no request, a stop after the current agent, a stop after a stage, and a file that does not parse', () => {
  const f = fixture();
  try {
    assert.deepEqual(stopCheck(f.root, 'demo'), { stop: false });
    writeControl(f.root, 'demo', 'stop', ['current'], Date.parse('2026-10-25T10:00:00Z'));
    assert.equal(stopCheck(f.root, 'demo').stop, true);
    writeControl(f.root, 'demo', 'stop', ['verify'], Date.parse('2026-10-25T10:00:00Z'));
    assert.equal(stopCheck(f.root, 'demo').stop, false, 'verify has not ended since the request');
    appendJournalLine(path.join(f.dir, '.driver-journal.jsonl'), '{"event":"agent-end","agent":"verify:api"}', {}, Date.parse('2026-10-25T10:05:00Z'));
    assert.deepEqual(stopCheck(f.root, 'demo').stop, true);
    writeFileSync(path.join(f.dir, '.control.json'), '{not json');
    assert.equal(stopCheck(f.root, 'demo').reason, 'the stop-request file does not parse');
    const cli = spawnSync(process.execPath, [watch, 'stop-check', f.root, 'demo'], { encoding: 'utf8' });
    assert.equal(JSON.parse(cli.stdout).stop, true);
  } finally { f.done(); }
});

test('yolo-watch line names the workflow by root and slug', () => {
  const f = fixture();
  try {
    const r = spawnSync(process.execPath, [watch, 'line', f.root, 'demo', '{"event":"agent-start","agent":"plan:api"}', '--run', 'r1'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const line = JSON.parse(readFileSync(path.join(f.dir, '.driver-journal.jsonl'), 'utf8').trim());
    assert.equal(line.agent, 'plan:api');
    assert.equal(line.run, 'r1');
    assert.equal(existsSync(path.join(f.dir, '.driver-journal.jsonl')), true);
  } finally { f.done(); }
});
