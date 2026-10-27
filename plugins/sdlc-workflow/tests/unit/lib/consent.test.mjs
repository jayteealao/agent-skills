// The answer log, the model-invocation consent, and `/wf <slug>` as the next step.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { answerEventOf, appendAnswerEvent, answersPath, findAnswer } from '../../../lib/answers.mjs';
import { checkConsent, consentQuestion, grantConsent, revokeConsent } from '../../../lib/consent.mjs';
import { diskFacts, dispatch, dispatchLine } from '../../../lib/dispatch.mjs';
import { loadRegistry } from '../../../lib/registry.mjs';

const PLUGIN_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const reg = loadRegistry(PLUGIN_ROOT);

function project(indexes = {}) {
  const root = mkdtempSync(join(tmpdir(), 'consent-'));
  for (const [slug, fm] of Object.entries(indexes)) {
    mkdirSync(join(root, '.ai', 'workflows', slug), { recursive: true });
    writeFileSync(join(root, '.ai', 'workflows', slug, '00-index.md'), `---\nschema: sdlc/v1\ntype: index\nslug: ${slug}\n${fm}\n---\n`);
  }
  return root;
}

const claudeAnswer = (question, answer) => ({
  tool_name: 'AskUserQuestion',
  tool_input: { questions: [{ question, header: 'Consent', options: [] }] },
  tool_response: { answers: { [question]: answer } },
});

test('answerEventOf reads the Claude Code and the Codex shapes, and nothing else', () => {
  assert.deepEqual(answerEventOf(claudeAnswer('Go?', 'Yes')).questions, [{ question: 'Go?', header: 'Consent', answer: 'Yes' }]);
  const codex = {
    tool_name: 'request_user_input',
    tool_input: { questions: [{ id: 'q1', question: 'Go?' }] },
    tool_response: JSON.stringify({ answers: { q1: { answers: ['Yes', 'note'] } } }),
  };
  assert.deepEqual(answerEventOf(codex).questions, [{ question: 'Go?', header: null, answer: 'Yes, note' }]);
  assert.equal(answerEventOf({ tool_name: 'Write', tool_input: {} }), null);
  assert.equal(answerEventOf(claudeAnswer('Go?', '')), null, 'a question with no answer is no event');
});

test('the log is written only where a records folder exists, and the newest answer wins', () => {
  const bare = mkdtempSync(join(tmpdir(), 'consent-bare-'));
  const root = project({ a: 'status: active' });
  try {
    assert.equal(appendAnswerEvent(bare, answerEventOf(claudeAnswer('Go?', 'Yes'))), false);
    appendAnswerEvent(root, answerEventOf(claudeAnswer('Go?', 'No')), { now: new Date('2026-10-25T10:00:00Z') });
    appendAnswerEvent(root, answerEventOf(claudeAnswer('Go?  ', 'Yes')), { now: new Date('2026-10-25T11:00:00Z') });
    assert.equal(findAnswer(root, 'Go?').answer, 'Yes');
    assert.equal(findAnswer(root, 'Go?', { since: '2026-10-25T12:00:00Z' }), null);
  } finally {
    rmSync(bare, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('consent: no answer event, no consent; a yes grants it; a packet runs under its list', () => {
  const root = project({ list: 'status: active', p1: 'status: active\norigin-packet: .ai/workflows/list/work/p1.md' });
  try {
    assert.equal(checkConsent(root, 'p1').ok, false);
    assert.equal(checkConsent(root, 'p1').for, 'list', 'the question asks for the list');
    assert.equal(grantConsent(root, 'list').ok, false, 'no answer event yet');
    appendAnswerEvent(root, answerEventOf(claudeAnswer(consentQuestion('list'), 'No — I type each command')));
    assert.match(grantConsent(root, 'list').reason, /answered: No/);
    appendAnswerEvent(root, answerEventOf(claudeAnswer(consentQuestion('list'), 'Yes — run the walk')));
    assert.equal(grantConsent(root, 'list').ok, true);
    assert.deepEqual([checkConsent(root, 'p1').ok, checkConsent(root, 'p1').via], [true, 'list']);
    revokeConsent(root, 'list');
    assert.equal(checkConsent(root, 'p1').ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('consent: a question with an added sentence still grants it; another slug or question does not', () => {
  const root = project({ list: 'status: active', 'list-two': 'status: active' });
  try {
    const t = (iso) => ({ now: new Date(iso) });
    appendAnswerEvent(root, answerEventOf(claudeAnswer('Shall I start the next steps of list-two now?', 'Yes')), t('2026-10-25T10:00:00Z'));
    appendAnswerEvent(root, answerEventOf(claudeAnswer('May I run list on my own?', 'Yes')), t('2026-10-25T10:01:00Z'));
    assert.equal(grantConsent(root, 'list').ok, false, 'another slug or other words do not count');
    appendAnswerEvent(root, answerEventOf(claudeAnswer(`${consentQuestion('list')} The walk has 4 packets left.`, 'Yes — go')), t('2026-10-25T10:02:00Z'));
    assert.equal(grantConsent(root, 'list').ok, true);
    assert.equal(checkConsent(root, 'list').ok, true);
    assert.equal(checkConsent(root, 'list-two').ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the hook appends the event; the pre-write check refuses an agent write of the log', () => {
  const root = project({ a: 'status: active' });
  try {
    const env = { ...process.env, SDLC_HOME: join(root, 'home') };
    const r = spawnSync(process.execPath, [join(PLUGIN_ROOT, 'hooks', 'answer-event.mjs')], { input: JSON.stringify({ cwd: root, ...claudeAnswer('Go?', 'Yes') }), encoding: 'utf8', env });
    assert.equal(r.status, 0, r.stderr);
    assert.match(readFileSync(answersPath(root), 'utf8'), /"answer":"Yes"/);
    const w = spawnSync(process.execPath, [join(PLUGIN_ROOT, 'hooks', 'pre-tool-use-all.mjs')], {
      input: JSON.stringify({ cwd: root, tool_input: { file_path: '.ai/workflows/answers.jsonl', content: '{}\n' } }), encoding: 'utf8', env,
    });
    assert.equal(w.status, 2);
    assert.match(w.stderr, /only|no agent writes it/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('wf.mjs consent check prints the question; grant needs the answer event', () => {
  const root = project({ a: 'status: active' });
  try {
    const wf = (...args) => spawnSync(process.execPath, [join(PLUGIN_ROOT, 'scripts', 'wf.mjs'), 'consent', ...args], { encoding: 'utf8' });
    const c = wf('check', root, 'a');
    assert.equal(c.status, 1);
    assert.match(c.stdout, /ask: May I start the next steps of a/);
    assert.equal(wf('grant', root, 'a').status, 1);
    appendAnswerEvent(root, answerEventOf(claudeAnswer(consentQuestion('a'), 'Yes')));
    assert.equal(wf('grant', root, 'a').status, 0);
    assert.equal(wf('check', root, 'a').status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('/wf <slug> dispatches the recorded next step; a closed workflow or no step gets status', () => {
  const root = project({
    a: 'status: active\nnext-invocation: /wf plan a',
    b: 'status: closed\nnext-invocation: /wf plan b',
    c: 'status: active\nnext-invocation: /wf plan c <slice>',
  });
  try {
    const disk = diskFacts(root);
    const a = dispatch(reg, ['a'], disk);
    assert.deepEqual([a.key, a.reference, a.nextOf, a.tokens], ['plan', 'reference/plan.md', 'a', ['plan', 'a']]);
    assert.equal(dispatchLine(a, ['a']), 'wf dispatch: key=plan · args=a · reference=reference/plan.md');
    const b = dispatch(reg, ['b'], disk);
    assert.deepEqual([b.key, b.nextReason], ['status', 'the workflow is closed']);
    assert.match(dispatch(reg, ['c'], disk).nextReason, /word to fill in/);
    assert.equal(dispatch(reg, ['zzz'], disk).reason, 'not a key');
    assert.equal(dispatch(reg, ['a', 'more'], disk).reason, 'not a key', 'a slug with more words goes to the router');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
