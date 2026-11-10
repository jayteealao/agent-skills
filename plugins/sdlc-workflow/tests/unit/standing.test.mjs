// lib/standing.mjs and `wf.mjs standing`: the standing answers of a project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { addDecision, decisionsOf, liveDecisions } from '../../lib/decisions.mjs';
import { STANDING_KEYS, STANDING_RULE_BY, clearStanding, declineStanding, listStanding, personAnswers, sameAnswerKey, setStanding, standingChanged, standingRule, suggestStanding } from '../../lib/standing.mjs';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WF = path.join(PLUGIN_ROOT, 'scripts', 'wf.mjs');
const PRE = path.join(PLUGIN_ROOT, 'hooks', 'pre-tool-use-all.mjs');

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'wf-standing-'));
  mkdirSync(path.join(root, '.ai', 'workflows'), { recursive: true });
  writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), '{\n  "checks": "strict"\n}\n');
  let n = 0;
  const answer = (slug, key, value, extra = {}) => {
    const dir = path.join(root, '.ai', 'workflows', slug);
    mkdirSync(dir, { recursive: true });
    n += 1;
    return addDecision(dir, { key, question: `the ${key} question`, answer: value, at: `2026-10-${String(n).padStart(2, '0')}T00:00:00Z`, ...extra }).entry;
  };
  return { root, answer, done: () => rmSync(root, { recursive: true, force: true }) };
}

const keys = (root) => suggestStanding(root).map((s) => s.key);

test('suggest after three equal answers across workflows, not after two, not after a different one', () => {
  const p = project();
  try {
    p.answer('one', 'pr-wanted', 'No — keep the commit (Recommended)');
    p.answer('two', 'pr-wanted', 'no — keep the commit');
    assert.deepEqual(keys(p.root), [], 'two answers are not enough');
    p.answer('three', 'pr-wanted', 'No — keep the commit');
    const [s] = suggestStanding(p.root);
    assert.equal(s.key, 'pr-wanted');
    assert.equal(s.answer, 'No — keep the commit');
    assert.deepEqual(s.from, ['one#D-001', 'two#D-001', 'three#D-001']);
    assert.equal(s.offer, 'You chose "No — keep the commit" the last three times. Make it the standing answer?');
    // A different answer last breaks the run of three.
    p.answer('four', 'pr-wanted', 'Yes — open a PR');
    assert.deepEqual(keys(p.root), []);
    // A different answer in the middle breaks it too.
    p.answer('five', 'ship-merge', 'rebase, delete the branch');
    p.answer('six', 'ship-merge', 'squash, delete the branch');
    p.answer('seven', 'ship-merge', 'rebase, delete the branch');
    assert.deepEqual(keys(p.root), []);
    p.answer('eight', 'ship-merge', 'Rebase, delete the branch.');
    assert.deepEqual(keys(p.root), [], 'the last three are squash, rebase, rebase');
    p.answer('nine', 'ship-merge', 'rebase, delete the branch');
    assert.deepEqual(keys(p.root), ['ship-merge']);
  } finally { p.done(); }
});

test('only the answers of the person count: a delegate, a policy or a standing case does not', () => {
  const p = project();
  try {
    p.answer('one', 'run-decisions', 'Stop and wait for me', { kind: 'steer' });
    p.answer('two', 'run-decisions', 'Stop and wait for me', { kind: 'steer', by: 'delegate' });
    p.answer('three', 'run-decisions', 'Stop and wait for me', { kind: 'steer', by: STANDING_RULE_BY });
    p.answer('four', 'run-decisions', 'Stop and wait for me', { kind: 'steer' });
    assert.equal(personAnswers(p.root, 'run-decisions').length, 2);
    assert.deepEqual(keys(p.root), []);
    // A superseded answer of the same workflow still counts: it was an answer when it was given.
    p.answer('four', 'run-decisions', 'Stop and wait for me', { kind: 'steer' });
    assert.deepEqual(keys(p.root), ['run-decisions']);
  } finally { p.done(); }
});

test('a key that is not on the list is never suggested and cannot be set', () => {
  const p = project();
  try {
    for (const slug of ['a', 'b', 'c', 'd']) p.answer(slug, 'path', 'Full lifecycle');
    for (const slug of ['a', 'b', 'c', 'd']) p.answer(slug, 'shape-focus', 'the API');
    assert.deepEqual(keys(p.root), []);
    assert.ok(!Object.hasOwn(STANDING_KEYS, 'path'));
    assert.throws(() => setStanding(p.root, 'path', { answer: 'Full lifecycle', question: 'q', by: 'person' }), /path cannot have a standing answer; the keys are: run-decisions, ship-merge, pr-wanted/);
    assert.throws(() => declineStanding(p.root, 'try-out'), /cannot have a standing answer/);
    assert.equal(standingRule(p.root, 'path'), null);
  } finally { p.done(); }
});

test('set, list, check and clear; set needs the person and the words', () => {
  const p = project();
  try {
    assert.throws(() => setStanding(p.root, 'pr-wanted', { answer: 'No', question: 'q', by: 'policy' }), /--by person is required/);
    assert.throws(() => setStanding(p.root, 'pr-wanted', { answer: 'No', by: 'person' }), /--question is required/);
    assert.throws(() => setStanding(p.root, 'pr-wanted', { question: 'q', by: 'person' }), /--answer is required/);
    const r = setStanding(p.root, 'pr-wanted', { answer: 'No — keep the commit', question: 'Make it the standing answer?', by: 'person' });
    assert.equal(r.rule.by, 'person');
    assert.equal(standingRule(p.root, 'pr-wanted').answer, 'No — keep the commit');
    const cfg = JSON.parse(readFileSync(path.join(p.root, '.ai', 'sdlc-config.json'), 'utf8'));
    assert.equal(cfg.checks, 'strict', 'the other settings stay');
    assert.equal(cfg.standing.rules['pr-wanted'].answer, 'No — keep the commit');
    assert.deepEqual(Object.keys(listStanding(p.root).rules), ['pr-wanted']);
    // A key with a standing answer is not suggested again.
    for (const slug of ['a', 'b', 'c']) p.answer(slug, 'pr-wanted', 'No — keep the commit');
    assert.deepEqual(keys(p.root), []);
    assert.deepEqual(clearStanding(p.root, 'pr-wanted'), { key: 'pr-wanted', cleared: true });
    assert.equal(standingRule(p.root, 'pr-wanted'), null);
    assert.deepEqual(keys(p.root), ['pr-wanted'], 'after a clear the offer comes again');
    assert.equal(JSON.parse(readFileSync(path.join(p.root, '.ai', 'sdlc-config.json'), 'utf8')).standing, undefined, 'an empty setting leaves the config');
  } finally { p.done(); }
});

test('a declined offer is remembered', () => {
  const p = project();
  try {
    for (const slug of ['a', 'b', 'c']) p.answer(slug, 'ship-merge', 'rebase, delete the branch');
    assert.deepEqual(keys(p.root), ['ship-merge']);
    declineStanding(p.root, 'ship-merge');
    assert.deepEqual(keys(p.root), []);
    p.answer('d', 'ship-merge', 'rebase, delete the branch');
    assert.deepEqual(keys(p.root), [], 'more equal answers do not bring the offer back');
    assert.ok(listStanding(p.root).declined['ship-merge'].at);
  } finally { p.done(); }
});

test('the CLI: suggest, set, check, list, decline and clear', () => {
  const p = project();
  const cli = (...args) => spawnSync(process.execPath, [WF, 'standing', ...args], { encoding: 'utf8' });
  try {
    for (const slug of ['a', 'b', 'c']) p.answer(slug, 'pr-wanted', 'No — keep the commit');
    assert.match(cli('suggest', p.root).stdout, /^pr-wanted: You chose "No — keep the commit" the last three times\. Make it the standing answer\?/);
    assert.equal(cli('check', p.root, 'pr-wanted').status, 1);
    const refused = cli('set', p.root, 'pr-wanted', '--answer', 'No — keep the commit', '--question', 'Make it the standing answer?');
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /--by person is required/);
    const set = cli('set', p.root, 'pr-wanted', '--answer', 'No — keep the commit', '--question', 'Make it the standing answer?', '--by', 'person');
    assert.equal(set.status, 0, set.stderr);
    const check = cli('check', p.root, 'pr-wanted', '--json');
    assert.equal(check.status, 0);
    assert.equal(JSON.parse(check.stdout).rule.answer, 'No — keep the commit');
    assert.match(cli('list', p.root).stdout, /pr-wanted: "No — keep the commit" \(set \d{4}-\d{2}-\d{2}\); clear it with wf\.mjs standing clear/);
    assert.equal(cli('decline', p.root, 'ship-merge').status, 0);
    assert.match(cli('clear', p.root, 'pr-wanted').stdout, /cleared pr-wanted/);
    assert.equal(cli('check', p.root, 'nope').status, 1);
  } finally { p.done(); }
});

test('a case that a standing answer settled records `by: standing rule`, and decide list --by standing finds it', () => {
  const p = project();
  try {
    const e = p.answer('a', 'pr-wanted', 'No — keep the commit', { by: STANDING_RULE_BY });
    assert.equal(e.by, 'standing rule');
    const dir = path.join(p.root, '.ai', 'workflows', 'a');
    assert.deepEqual(liveDecisions(decisionsOf(dir), {}, { by: 'standing' }).map((x) => x.id), [e.id]);
    assert.equal(sameAnswerKey('No — keep the commit (Recommended).'), sameAnswerKey('no - keep the commit'));
  } finally { p.done(); }
});

test('the pre-write hook refuses a file write that changes the standing answers', async () => {
  assert.equal(standingChanged('{"checks":"strict"}', '{"checks":"strict","standing":{"rules":{"pr-wanted":{"answer":"No"}}}}'), true);
  assert.equal(standingChanged('{"checks":"strict"}', '{"checks":"warn"}'.replace('warn', 'strict')), false);
  assert.equal(standingChanged(null, '{"artifactTracking":"tracked"}'), false);
  const p = project();
  const hook = (content) => spawnSync(process.execPath, [PRE], {
    cwd: p.root, encoding: 'utf8',
    input: JSON.stringify({ cwd: p.root, tool_name: 'Write', tool_input: { file_path: '.ai/sdlc-config.json', content } }),
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, SDLC_HOME: path.join(p.root, '.sdlc-home'), SDLC_DISPATCH_ACTIVE: '', CLAUDE_PLUGIN_INSTALL: '' },
  });
  try {
    const set = hook('{\n  "checks": "strict",\n  "standing": { "rules": { "pr-wanted": { "answer": "No", "question": "q", "by": "person", "at": "x" } } }\n}\n');
    assert.equal(set.status, 2, set.stderr);
    assert.match(set.stderr, /changes the standing answers/);
    const keep = hook('{\n  "checks": "strict",\n  "artifactTracking": "tracked"\n}\n');
    assert.equal(keep.status, 0, keep.stderr);
  } finally { p.done(); }
});
