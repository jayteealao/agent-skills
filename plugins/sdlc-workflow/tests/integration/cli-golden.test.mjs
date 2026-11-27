// The output of every form of wf.mjs, held in tests/fixtures/cli-golden.json. The forms run in
// the order of `describe` on one fixture project, each with its own example, and each once with
// no arguments. A row holds the exit code, stdout, stderr and the record files that changed.
//
// After a change of the output on purpose: UPDATE_GOLDEN=1 node --test tests/integration/cli-golden.test.mjs
// and read the diff of the fixture.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PLUGIN_ROOT, SLUG, makeFixture } from '../evals/code-mode/fixture.mjs';

const WF = join(PLUGIN_ROOT, 'scripts', 'wf.mjs');
const GOLDEN = join(PLUGIN_ROOT, 'tests', 'fixtures', 'cli-golden.json');

// The forms that do not run here, by the start of their example, with the reason.
const LEFT_OUT = {
  'run ': 'runs a script file; tests/unit/wf-api.test.mjs',
  'drive ': 'starts agents',
  'ship merge': 'GitHub', 'ship finish': 'GitHub and branch deletes', 'ship ready': 'GitHub', 'ship facts': 'GitHub',
  'gh ': 'GitHub', 'target ': 'GitHub',
  'design server': 'starts or installs a server', 'design publish': 'network', 'design check': 'starts a browser', 'design track': 'starts a server',
  'design review-pack': 'starts a browser', 'design next': 'starts a server', 'design doctor': 'reads the programs of this computer', 'design captures': 'starts a browser',
  'decide wait': 'waits by design', 'talk wait': 'waits by design', 'progress watch': 'waits by design',
  'talk job ': 'starts a process', 'talk claim': 'names its process', 'talk resources': 'names its process',
  'profile run': 'runs a suite', 'step check': 'runs a suite',
  'cost ': 'reads the transcripts of this computer',
  'skill-dir': 'the path of this checkout',
};
const NAMES = { ideas: SLUG, demo: SLUG, 'demo-ui': `${SLUG}-ui`, api: 's3', web: 's1', ui: 's2', docs: 's5', 'demo:D-012': `${SLUG}:D-012` };

/** The words of an example line: double quotes hold spaces. */
const words = (line) => [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
const argsOf = (example) => words(example.replace(/^.*?wf\.mjs"?\s+/, '')).map((w) => NAMES[w] ?? w.replace(/workflows\/demo\//, `workflows/${SLUG}/`).replace(/^(dd-[a-z]+)-api/, '$1-s3').replace('[api]', '[s3]').replace(/^(verify|implement):(api|web)$/, (_, s, n) => `${s}:${NAMES[n]}`));

// Calls that work, for the commands that agents use most. They run after the examples.
const P = `${SLUG}`;
const WORKS = [
  ['step', 'where', '.', P, 's3'], ['step', 'where', '.', P, 's3', '--json'],
  ['step', 'done', '.', P, 's3', '3', '--no-change'], ['step', 'start', '.', P, 's3', '4', '--title', 'Docs'],
  ['step', 'stop', '.', P, 's3', '--kind', 'gate', '--reason', 'a manual check'], ['step', 'retry', '.', P, 's3'],
  ['step', 'done', '.', P, 's3', '4', '--no-change'], ['step', 'complete', '.', P, 's3', '--no-change'],
  ['decide', 'add', '.', P, '--key', 'q2', '--question', 'Which queue?', '--answer', 'sqs', '--json'],
  ['decide', 'add', '.', P, '--file', 'answers.json'], ['decide', 'list', '.', P, '--json'], ['decide', 'answered', '.', P, '--key', 'q2', '--json'],
  ['decide', 'hold', '.', P, '--key', 'q4', '--question', 'Keep the old endpoint?', '--stage', 'implement', '--json'], ['decide', 'add', '.', P, '--key', 'q4', '--answer', 'no'],
  ['record', 'get', '.', P, '04-plan-s3'], ['record', 'get', '.', P, '04-plan-s3', '--json'], ['record', 'get', '.', P, '06-verify-s2', '--field', 'result'],
  ['record', 'set', '.', P, '03-slice', 'slices[s4].status=in-progress'], ['record', 'set', '.', P, 'index', 'current-stage=verify', '--json'],
  ['record', 'set', '.', P, 'index', 'current-stage=not-a-stage'],
  ['record', 'edit', '.', P, '04-plan-s3', '--replace', 'Add the route.', '--with', 'Add the new route.'],
  ['record', 'draft', '.', P, '04-plan-s3'], ['record', 'put', '.', P, '04-plan-s3.md'], ['record', 'list', '.', P, '--json'],
  ['findings', 'add', '.', P, 'found.json', '--source', 'review', '--slice', 's3'], ['findings', 'list', '.', P, '--json'], ['findings', 'set', '.', P, 'COR-1', 'fixed', '--commit', 'HEAD'],
  ['board', 'add', '.', P, 'item', '--key', 'cap-warns', '--kind', 'decision', '--thread', 'limit-per-project', '--text', 'A cap warns.', '--source', 'person'],
  ['board', 'set', '.', P, 'cap-warns', 'scope=keep'], ['board', 'remove', '.', P, 'i4'], ['board', 'digest', '.', P, '--json'],
  ['talk', 'post', '.', P, '--as', 'verify:s3', '--to', 's4', '--kind', 'handover', '--text', 'a note'], ['talk', 'read', '.', P, '--as', 'implement:s4', '--json'], ['talk', 'reply', '.', P, 'T-1', '--as', 'implement:s4', '--text', 'done'],
  ['talk', 'close', '.', P, 'T-1', '--as', 'implement:s4', '--reason', 'done'], ['talk', 'list', '.', P, '--json'],
  ['status', '.', P, '--json'], ['status', '.', '--json'], ['brief', '.', P, 'implement', 's4'], ['brief', '.', P, 'plan', 's4', '--json'],
  ['slice', 'drop', '.', P, 's6', '--reason', 'not wanted', '--json'], ['slice-files', '.', P, 's3', 's4', '--json'],
  ['design', 'comments', '.', '--workflow', P, '--json'], ['design', 'status', '.', P, '--json'], ['inbox', '.', '--json'],
  ['worktree', 'add', '.', P, 'before', 'HEAD'], ['worktree', 'remove', '.', P],
  ['nosuch'], ['record', 'nosuch'], ['record', 'get', '.', 'nosuch', 'index'],
  ['close', '.', P, '--reason', 'abandoned', '--json'],
];

function records(root) {
  const out = new Map();
  const walk = (dir, rel) => {
    for (const e of existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(dir, e.name), r);
      else if (!e.name.endsWith('.tmp')) out.set(r, createHash('sha1').update(normal(readFileSync(join(dir, e.name), 'utf8'), [])).digest('hex'));
    }
  };
  walk(join(root, '.ai'), '');
  return out;
}
const changedFiles = (a, b) => [...new Set([...a.keys(), ...b.keys()])].filter((f) => a.get(f) !== b.get(f)).sort();

function normal(text, places) {
  let s = text.replace(/\r\n/g, '\n');
  for (const [from, to] of places) for (const f of [JSON.stringify(from).slice(1, -1), from, from.replace(/\\/g, '/')]) s = s.split(f).join(to);
  return s
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<time>').replace(/\d{8}T\d{6}Z/g, '<stamp>').replace(/\b\d{4}-\d\d-\d\d\b/g, '<date>').replace(/\b[0-2]\d:[0-5]\d\b/g, '<hour>')
    .replace(/\b[0-9a-f]{40}\b/g, '<sha>').replace(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,12}\b/g, '<sha>')
    .replace(/\bJ-<stamp>-[a-z0-9]+/g, '<job>').replace(/\bpid \d+/g, 'pid <n>').replace(/"pid": \d+/g, '"pid": <n>').replace(/"quietMinutes": \d+/g, '"quietMinutes": <n>')
    .replace(/\b\d+(\.\d+)? ?(ms|s|min)\b/g, '<n> $2').replace(/\\/g, '/');
}

function record() {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'cli-golden-')));
  const root = join(top, 'project');
  const home = join(top, 'home');
  const bin = join(top, 'bin');
  mkdirSync(home); mkdirSync(bin);
  // No GitHub CLI: a call of it fails at once, and nothing reaches the network.
  writeFileSync(join(bin, 'gh'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  writeFileSync(join(bin, 'gh.cmd'), '@exit /b 1\r\n');
  const env = { ...process.env, SDLC_HOME: home, SDLC_RECORDS_PUSH: 'off', PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? process.env.Path}` };
  delete env.Path;
  for (const k of Object.keys(env)) if (/^(CLAUDE|CODEX|PI_|WF_)/i.test(k)) delete env[k];
  const places = [[root, '<root>'], [home, '<home>'], [top, '<top>'], [PLUGIN_ROOT, '<plugin>'], [hostname(), '<host>'], [hostname().toLowerCase(), '<host>']];
  const version = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8')).version;
  places.push([version, '<version>']);
  const call = (args) => {
    const r = spawnSync(process.execPath, [WF, ...args], { cwd: root, env, encoding: 'utf8', input: '', windowsHide: true, timeout: 60_000 });
    return { exit: r.status, out: normal(r.stdout, places), err: normal(r.stderr, places) };
  };
  try {
    makeFixture(root, { findings: false, suite: false });
    const forms = JSON.parse(spawnSync(process.execPath, [WF, 'describe', '--json'], { encoding: 'utf8', env }).stdout).cli;
    const rows = {};
    for (const f of forms) {
      const args = argsOf(f.example);
      const line = args.join(' ');
      // The form without its arguments names the row of the usage error. Its words stop at the first argument.
      const bare = words(f.form).slice(0, words(f.form).findIndex((w) => /^[<[-]/.test(w)) >>> 0).filter((w) => /^[a-z-]+$/.test(w));
      if (Object.keys(LEFT_OUT).some((k) => `${line} `.startsWith(k))) { rows[f.form] = 'left out'; continue; }
      const before = records(root);
      const r = call(args);
      rows[f.form] = { args, ...r, changed: changedFiles(before, records(root)).map((x) => normal(x, places)), ...(f.form.includes('<root>') ? { bare: call(bare) } : {}) };
    }
    writeFileSync(join(root, 'answers.json'), JSON.stringify([{ key: 'q3', question: 'Which auth?', answer: 'oauth' }, { key: 'q5', question: 'Which region?', answer: 'eu-west-1' }]));
    writeFileSync(join(root, 'found.json'), JSON.stringify([{ title: 'No limit', dimension: 'correctness', severity: 'HIGH', file: 'retry.js', line: 1, text: 'The retry has no limit.' }]));
    WORKS.forEach((args, n) => {
      const before = records(root);
      const r = call(args);
      rows[`${n + 1}: ${args.join(' ')}`] = { ...r, changed: changedFiles(before, records(root)).map((x) => normal(x, places)) };
    });
    return rows;
  } finally { rmSync(top, { recursive: true, force: true, maxRetries: 5 }); }
}

test('every form of wf.mjs prints what it printed before', { timeout: 10 * 60_000 }, () => {
  const got = record();
  if (process.env.UPDATE_GOLDEN) { writeFileSync(GOLDEN, `${JSON.stringify(got, null, 1)}\n`); return; }
  const want = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  assert.deepEqual(Object.keys(got), Object.keys(want), 'the forms');
  for (const form of Object.keys(want)) assert.deepEqual(got[form], want[form], form);
});
