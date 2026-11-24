// Steers, notes, settled entries and project rules: who may write each, who reads each, and
// how an entry ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { addDecision, applyTidy, endDecision, liveDecisions, readDecisions, tidyPlan } from '../../lib/decisions.mjs';
import { addRule, adoptRule, endRule, readRules, ruleCandidates } from '../../lib/project-rules.mjs';
import { buildBrief } from '../../lib/brief.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');
const cli = (args) => spawnSync(process.execPath, [wf, ...args], { encoding: 'utf8' });

function fixture(slugs = ['demo']) {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-notes-'));
  const dirs = Object.fromEntries(slugs.map((s) => {
    const dir = path.join(root, '.ai', 'workflows', s);
    mkdirSync(dir, { recursive: true });
    return [s, dir];
  }));
  return { root, dir: dirs[slugs[0]], dirs, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('a build stage cannot write a steer; the refusal names the note and the settled entry', () => {
  const f = fixture();
  try {
    for (const stage of ['plan', 'implement', 'verify', 'review']) {
      assert.throws(() => addDecision(f.dir, { kind: 'steer', answer: 'the red test is yours', stage, scope: { slice: 'web' } }),
        (e) => /does not write a steer/.test(e.message) && /--kind note/.test(JSON.stringify(e.fix ?? e)) , stage);
    }
    // The person still records a steer, and a brainstorm writes the steers that it carries.
    assert.equal(addDecision(f.dir, { kind: 'steer', answer: 'no new runtime deps' }).entry.kind, 'steer');
    assert.equal(addDecision(f.dir, { kind: 'steer', answer: 'left to the build', stage: 'brainstorm', key: 'q1' }).entry.kind, 'steer');
    assert.equal(readDecisions(f.dir).length, 2);
  } finally { f.done(); }
});

test('a note needs its slice, only that slice reads it, and an end takes it out', () => {
  const f = fixture();
  try {
    assert.throws(() => addDecision(f.dir, { kind: 'note', answer: 'x', stage: 'implement' }), /a note needs the slice/);
    const n = addDecision(f.dir, { kind: 'note', answer: 'the route test is red until web lands', stage: 'implement', scope: { slice: 'web' } });
    assert.equal(n.entry.by, 'stage');
    const all = readDecisions(f.dir);
    assert.deepEqual(liveDecisions(all, { slice: 'web' }).map((e) => e.id), ['D-001']);
    assert.deepEqual(liveDecisions(all, { slice: 'api' }), [], 'another slice does not read the note');
    assert.deepEqual(liveDecisions(all, {}), [], 'a list with no slice leaves the notes out');
    assert.deepEqual(liveDecisions(all, {}, { kind: 'note' }).map((e) => e.id), ['D-001'], 'unless it asks for notes');
    assert.throws(() => endDecision(f.dir, 'D-001', ''), /needs its reason/);
    const e = endDecision(f.dir, 'D-001', 'the route test passes now', { now: '2026-11-24T10:00:00Z' });
    assert.equal(e['superseded-by'], 'ended');
    assert.equal(e['ended-why'], 'the route test passes now');
    assert.deepEqual(liveDecisions(readDecisions(f.dir), { slice: 'web' }), []);
    assert.throws(() => endDecision(f.dir, 'D-001', 'again'), /is not live: it was ended/);
  } finally { f.done(); }
});

test('a settled entry needs a class and is in no list unless the list asks for it', () => {
  const f = fixture();
  try {
    assert.throws(() => addDecision(f.dir, { kind: 'settled', answer: 'a map, not a list', stage: 'implement', scope: { slice: 'api' } }), /needs --class/);
    assert.throws(() => addDecision(f.dir, { kind: 'settled', class: 'small', answer: 'x', scope: { slice: 'api' } }), /class must be one of/);
    addDecision(f.dir, { kind: 'settled', class: 'implementation-detail', key: 'store-shape', answer: 'a map, not a list', stage: 'implement', scope: { slice: 'api' } });
    addDecision(f.dir, { key: 'db', question: 'Which store?', answer: 'sqlite' });
    const all = readDecisions(f.dir);
    assert.deepEqual(liveDecisions(all, { slice: 'api' }).map((e) => e.kind), ['answer']);
    assert.deepEqual(liveDecisions(all, {}, { kind: 'settled' }).map((e) => e.class), ['implementation-detail']);
    assert.deepEqual(liveDecisions(all, {}, { kind: 'answer,settled' }).length, 2, 'several kinds in one list');
  } finally { f.done(); }
});

test('a steer that names the entries it replaces takes their place', () => {
  const f = fixture();
  try {
    addDecision(f.dir, { kind: 'steer', key: 'step-guard-set', answer: 'each step runs the guard set' });
    assert.throws(() => addDecision(f.dir, { kind: 'steer', answer: 'x', replaces: ['D-099'] }), /no entry D-099 to replace/);
    const r = addDecision(f.dir, { kind: 'steer', key: 'slice-tests', answer: 'the tests run once, for the slice', replaces: ['D-001'] });
    assert.deepEqual(r.superseded, ['D-001']);
    assert.deepEqual(liveDecisions(readDecisions(f.dir), {}, { kind: 'steer' }).map((e) => e.id), ['D-002']);
  } finally { f.done(); }
});

test('tidy ends the steers and notes of a done slice, makes a stage steer a note, and leaves the rest to the person', () => {
  const f = fixture();
  try {
    const store = (list) => writeFileSync(path.join(f.dir, 'decisions.yaml'), `schema: sdlc/v1\ntype: decisions\ndecisions:\n${list.map((e, i) =>
      `  - id: D-00${i + 1}\n    at: "2026-11-0${i + 1}T10:00:00Z"\n    kind: ${e.kind}\n    key: null\n    question: null\n    answer: ${JSON.stringify(e.answer)}\n    by: ${e.by ?? 'person'}\n    scope: ${e.slice ? `{ slice: ${e.slice} }` : '{}'}\n    stage: ${e.stage ?? 'null'}\n    source: null\n    rewrote: []\n    superseded-by: null\n`).join('')}`);
    store([
      { kind: 'steer', answer: 'api keeps its old route', slice: 'api' },                           // its slice is done
      { kind: 'steer', answer: 'the red test is yours', slice: 'web', stage: 'implement', by: 'delegate' }, // a hand-off, written as a steer
      { kind: 'steer', answer: 'no new runtime deps' },                                             // of the whole workflow
      { kind: 'steer', answer: 'web has no modal', slice: 'web' },                                   // of an open slice, by the person
      { kind: 'note', answer: 'the store changed under you', slice: 'api', stage: 'verify', by: 'stage' },
    ]);
    const status = { api: 'complete', web: 'defined' };
    const plan = tidyPlan(readDecisions(f.dir), status);
    assert.deepEqual(plan.end.map((r) => r.id), ['D-001', 'D-005']);
    assert.deepEqual(plan.toNote.map((r) => r.id), ['D-002']);
    assert.deepEqual(plan.review.map((r) => r.id), ['D-003', 'D-004']);
    assert.equal(readDecisions(f.dir).filter((e) => e['superseded-by']).length, 0, 'a plan changes nothing');
    applyTidy(f.dir, status, { now: '2026-11-24T10:00:00Z' });
    const after = readDecisions(f.dir);
    assert.equal(after[0]['superseded-by'], 'ended');
    assert.match(after[0]['ended-why'], /its slice api is complete/);
    assert.equal(after[1].kind, 'note');
    assert.equal(after[1]['was-kind'], 'steer');
    assert.deepEqual(liveDecisions(after, { slice: 'web' }, { kind: 'steer,note' }).map((e) => e.id), ['D-002', 'D-003', 'D-004']);
    assert.deepEqual(tidyPlan(after, status).end, [], 'a second tidy finds nothing');
  } finally { f.done(); }
});

test('a project rule is written once, each brief prints it first, and adopt ends the copies in every workflow', () => {
  const f = fixture(['one', 'two', 'three']);
  try {
    assert.deepEqual(readRules(f.root), []);
    for (const s of ['one', 'two', 'three']) addDecision(f.dirs[s], { kind: 'steer', key: 'no-budget', answer: `No time box on any stage. (carried from the brainstorm of ${s})` });
    addDecision(f.dirs.one, { kind: 'steer', answer: 'only in one' });
    const c = ruleCandidates(f.root);
    assert.equal(c.length, 1);
    assert.equal(c[0].workflows, 3);
    const r = adoptRule(f.root, { from: 'two:D-001' });
    assert.equal(r.rule.key, 'no-budget');
    assert.equal(r.rule.text, 'No time box on any stage.');
    assert.equal(r.ended.length, 3);
    assert.deepEqual(liveDecisions(readDecisions(f.dirs.one), {}, { kind: 'steer' }).map((e) => e.answer), ['only in one']);
    assert.deepEqual(ruleCandidates(f.root), []);
    assert.equal(JSON.parse(readFileSync(path.join(f.root, '.ai', 'sdlc-config.json'), 'utf8')).rules.length, 1);

    assert.equal(addRule(f.root, { key: 'no-budget', text: 'No time box and no agent budget.' }).replaced, true);
    const list = cli(['decide', 'list', f.root, 'one', '--kind', 'steer', '--rules']);
    assert.equal(list.status, 0, list.stderr);
    assert.match(list.stdout, /^RULE \[no-budget\] No time box and no agent budget\. \(project rule\)\nD-002 only in one \(steer\)\s*$/);

    const b = buildBrief({ projectRoot: f.root, slug: 'one', stage: 'implement', slice: 'api', referenceRoot: path.join(pluginRoot, 'skills', 'wf', 'reference') });
    assert.match(b.parts.rules, /^- RULE \[no-budget\] /);
    assert.match(b.parts.rules, /^- D-002 only in one \(steer\)$/m);

    assert.throws(() => endRule(f.root, 'no-budget', ''), /needs its reason/);
    assert.equal(endRule(f.root, 'no-budget', 'not needed').key, 'no-budget');
    assert.deepEqual(readRules(f.root), []);
  } finally { f.done(); }
});

test('wf.mjs decide: a stage steer is refused with exit 1, a note and an end and a tidy work', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.dir, '03-slice.md'), ['---', 'type: slice', 'slices:', '  - slug: api', '    status: complete', '  - slug: web', '    status: defined', '---', ''].join('\n'));
    const no = cli(['decide', 'add', f.root, 'demo', '--kind', 'steer', '--stage', 'implement', '--answer', 'x']);
    assert.equal(no.status, 1);
    assert.match(no.stderr, /the implement stage does not write a steer/);
    assert.equal(cli(['decide', 'add', f.root, 'demo', '--kind', 'note', '--slice', 'web', '--stage', 'implement', '--answer', 'the page test is yours']).status, 0);
    assert.equal(cli(['decide', 'add', f.root, 'demo', '--kind', 'note', '--slice', 'api', '--stage', 'verify', '--answer', 'old']).status, 0);
    assert.match(cli(['decide', 'list', f.root, 'demo', '--kind', 'steer,note', '--slice', 'web']).stdout, /^D-001 the page test is yours \(note; by stage; slice=web\)\s*$/);
    const dry = cli(['decide', 'tidy', f.root, 'demo']);
    assert.match(dry.stdout, /^1 would be ended/);
    assert.match(cli(['decide', 'tidy', f.root, 'demo', '--apply']).stdout, /^1 ended/);
    const end = cli(['decide', 'end', f.root, 'demo', 'D-001', '--reason', 'the page test passes']);
    assert.match(end.stdout, /ended: the page test passes/);
    assert.match(cli(['decide', 'list', f.root, 'demo', '--kind', 'note']).stdout, /no decisions/);
  } finally { f.done(); }
});

test('a steer that the run reads by its key is never a rule candidate', () => {
  const f = fixture(['one', 'two', 'three']);
  try {
    for (const s of ['one', 'two', 'three']) addDecision(f.dirs[s], { kind: 'steer', key: 'run-decisions', answer: 'Take the recommended option and show me each one at the end' });
    assert.deepEqual(ruleCandidates(f.root), []);
    assert.throws(() => adoptRule(f.root, { from: 'one:D-001' }), /no live steer one:D-001/);
  } finally { f.done(); }
});
