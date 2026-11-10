// lib/inbox.mjs and `wf.mjs inbox`: everything that waits on the person, in one list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { addDecision } from '../../lib/decisions.mjs';
import { INBOX_KINDS, inboxOf, inboxText, parseOpenQuestion, plainText } from '../../lib/inbox.mjs';

const WF = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'), 'scripts', 'wf.mjs');
const yaml = (o) => JSON.stringify(o, null, 2);

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'wf-inbox-'));
  const wf = (slug) => path.join(root, '.ai', 'workflows', slug);
  const file = (slug, name, text) => {
    const p = path.join(wf(slug), name);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, text);
  };
  // JSON is YAML: each frontmatter is written as a JSON object.
  const md = (front, body = '') => `---\n${yaml(front)}\n---\n${body}`;
  const index = (slug, fields = {}) => file(slug, '00-index.md', md({ schema: 'sdlc/v1', type: 'index', slug, title: slug, status: 'active', 'current-stage': 'plan', 'updated-at': '2026-11-01T00:00:00Z', ...fields }));
  return { root, wf, file, md, index, done: () => rmSync(root, { recursive: true, force: true }) };
}

/** A project with one entry of each kind, and some that must not show. */
function fixture() {
  const p = project();
  // The campaign walk: a list with two built packets. The engine packet waits on its try-out and
  // its digest while the api packet is current, with a fidelity row that is not honored.
  const SRC = 'brainstorm-demo';
  p.index(SRC, { 'workflow-type': 'brainstorm', status: 'complete' });
  p.file(SRC, 'work/index.md', p.md({ schema: 'sdlc/v1', type: 'list', slug: SRC }));
  p.file(SRC, 'work/demo-engine.md', p.md({ schema: 'sdlc/v1', type: 'packet', key: 'engine', 'packet-slug': 'demo-engine', title: 'Engine', form: 'intake', state: 'built', order: 1, 'try-out': 'yes', 'ux-impact': 'none', 'carried-decisions': [{ key: 'd-one', text: 'Decision d-one.' }] }, '## Acceptance criteria\n\n- **AC-1** — It runs.\n'));
  p.file(SRC, 'work/demo-api.md', p.md({ schema: 'sdlc/v1', type: 'packet', key: 'api', 'packet-slug': 'demo-api', title: 'Api', form: 'intake', state: 'built', order: 2, 'try-out': 'no', 'ux-impact': 'none', 'carried-decisions': [{ key: 'd-two', text: 'Decision d-two.' }] }));
  const table = (rows) => `# Review\n\n## Decision Fidelity\n\n| Key | Verdict | Evidence | Approval |\n|---|---|---|---|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n`;
  p.index('demo-engine', { 'ux-impact': 'none', 'updated-at': '2026-10-05T00:00:00Z', 'next-invocation': '/wf campaign brainstorm-demo' });
  p.file('demo-engine', '07-review.md', table([['d-one', 'honored', 'app.txt:1', '—']]));
  addDecision(p.wf('demo-engine'), { kind: 'steer', key: 'run-decisions', question: 'q', answer: 'Take the recommended option and show me each one at the end', at: '2026-10-04T00:00:00Z' });
  addDecision(p.wf('demo-engine'), { kind: 'answer', by: 'delegate', key: 'cache', question: 'Cache it?', answer: 'yes', at: '2026-10-03T00:00:00Z' });
  p.index('demo-api', { 'ux-impact': 'none', 'updated-at': '2026-10-06T00:00:00Z', 'next-invocation': '/wf campaign brainstorm-demo' });
  p.file('demo-api', '07-review.md', p.md({ schema: 'sdlc/v1', type: 'review', slug: 'demo-api', status: 'complete', 'updated-at': '2026-10-07T00:00:00Z' }, table([['d-two', 'narrowed', 'app.txt:2', '—']])));

  p.index('goal-wf');
  p.file('goal-wf', 'goal.md', p.md({ schema: 'sdlc/v1', type: 'goal', slug: 'goal-wf', kind: 'lifecycle', state: 'armed', parked: { gate: 'ship go/no-go', reason: 'the person decides', at: '2026-10-08T00:00:00Z' } }));

  p.index('run-wf');
  p.file('run-wf', 'progress.json', JSON.stringify({ run: 'r1', driver: 'yolo', stage: 'verify', slice: 'api', status: 'waiting', reason: 'a manual check of the plan', updatedAt: '2026-10-09T00:00:00Z', resume: '/wf yolo run-wf' }));

  p.index('ask-wf', { 'next-invocation': '/wf slice ask-wf', 'origin-packet': `.ai/workflows/${SRC}/work/ask-wf.md`, 'open-questions': [{ key: 'units', question: 'Metric or imperial units?', stage: 'slice', 'held-at': '2026-10-10T00:00:00Z' }] });

  p.index('pick-wf', { 'next-command': 'user-picks', 'next-invocation': 'user-picks — record via /wf intake investigate pick-wf <option>; see 01-investigate.md ## Routing', 'updated-at': '2026-10-11T00:00:00Z' });
  p.index('design-wf', { 'next-invocation': '/wf design design-wf', 'updated-at': '2026-10-12T00:00:00Z' });
  p.index('ship-wf', { 'current-stage': 'ship', 'next-invocation': '/wf ship ship-wf', 'updated-at': '2026-10-13T00:00:00Z' });
  p.index('wait-wf', { status: 'awaiting-input', 'next-invocation': '/wf plan wait-wf api', 'updated-at': '2026-10-14T00:00:00Z' });

  p.index('opt-wf', { 'workflow-type': 'optimize' });
  p.file('opt-wf', 'optimize/state.json', JSON.stringify({ stopped: { reason: 'plateau', detail: '12 trials with no keep', at: '2026-10-15T00:00:00Z' }, counters: { trials: 12 } }));

  p.index('find-wf');
  p.file('find-wf', 'findings.yaml', yaml({ schema: 'sdlc/v1', type: 'findings', runs: [], findings: [
    { id: 'COR-1', source: 'review', slice: null, status: 'open', 'changes-acceptance': true, issue: 'AC-2 cannot hold offline', 'surfaced-at': '2026-10-16T00:00:00Z' },
    { id: 'COR-2', source: 'review', slice: null, status: 'open', 'changes-acceptance': true, issue: 'answered already', 'surfaced-at': '2026-10-01T00:00:00Z' },
    { id: 'COR-3', source: 'review', slice: null, status: 'kept-by-person', 'changes-acceptance': true, issue: 'kept', 'surfaced-at': '2026-10-01T00:00:00Z' },
    { id: 'COR-4', source: 'review', slice: null, status: 'open', issue: 'a plain finding', 'surfaced-at': '2026-10-01T00:00:00Z' },
  ] }));
  addDecision(p.wf('find-wf'), { key: 'finding:COR-2', question: 'Accept?', answer: 'keep the criterion' });

  // A closed workflow waits on nobody, whatever its index says.
  p.index('closed-wf', { status: 'closed', 'open-questions': [{ key: 'old', question: 'An old question' }], 'next-invocation': '/wf ship closed-wf' });
  return p;
}

test('the inbox lists one entry of each kind, oldest first, each with what the person types', async () => {
  const p = fixture();
  try {
    const r = await inboxOf(p.root);
    const rows = r.entries.map((e) => [e.slug, e.kind]);
    assert.deepEqual(rows, [
      ['demo-engine', 'digest'],
      ['demo-engine', 'try-out'],
      ['demo-api', 'fidelity'],
      ['goal-wf', 'goal'],
      ['run-wf', 'run-gate'],
      ['ask-wf', 'question'],
      ['pick-wf', 'pick'],
      ['design-wf', 'design'],
      ['ship-wf', 'ship'],
      ['wait-wf', 'awaiting-input'],
      ['opt-wf', 'optimize'],
      ['find-wf', 'finding'],
    ]);
    assert.equal(r.count, 12);
    assert.deepEqual(new Set(r.entries.map((e) => e.kind)), new Set(INBOX_KINDS));
    const by = (slug, kind) => r.entries.find((e) => e.slug === slug && e.kind === kind);
    for (const e of r.entries) {
      assert.match(e.answer, /^\/wf /, `${e.slug} ${e.kind}: the answer is a command`);
      assert.ok(e.ask.length > 10 && e.ask.length <= 160, `${e.slug} ${e.kind}: one sentence`);
    }
    assert.deepEqual(r.entries.map((e) => e.since).filter(Boolean), r.entries.map((e) => e.since).filter(Boolean).sort(), 'oldest first');
    assert.equal(by('demo-api', 'fidelity').answer, '/wf campaign brainstorm-demo');
    assert.match(by('demo-api', 'fidelity').ask, /"Decision d-two\." \(narrowed\)/);
    assert.deepEqual(by('demo-api', 'fidelity').keys, ['d-two'], 'the decision keys stay out of the ask');
    assert.equal(by('demo-api', 'fidelity').since, '2026-10-07T00:00:00Z');
    assert.equal(by('demo-engine', 'digest').since, '2026-10-03T00:00:00Z', 'a digest is as old as its oldest decision');
    assert.equal(by('goal-wf', 'goal').answer, '/wf loop goal goal-wf resume');
    assert.match(by('goal-wf', 'goal').ask, /ship go\/no-go/);
    assert.equal(by('run-wf', 'run-gate').answer, '/wf yolo run-wf');
    assert.deepEqual([by('ask-wf', 'question').answer, by('ask-wf', 'question').key], ['/wf campaign brainstorm-demo', 'units'], 'a question of a work packet is asked by the walk');
    assert.equal(by('pick-wf', 'pick').answer, '/wf intake investigate pick-wf <option>');
    assert.equal(by('design-wf', 'design').answer, '/wf design design-wf');
    assert.equal(by('ship-wf', 'ship').answer, '/wf ship ship-wf');
    assert.equal(by('wait-wf', 'awaiting-input').answer, '/wf plan wait-wf api');
    assert.match(by('opt-wf', 'optimize').ask, /plateau: 12 trials with no keep/);
    assert.equal(by('opt-wf', 'optimize').answer, '/wf loop optimize opt-wf');
    assert.deepEqual([by('find-wf', 'finding').key, by('find-wf', 'finding').answer], ['finding:COR-1', '/wf review find-wf triage'], 'an answered, a kept and a plain finding do not show');
    assert.ok(!r.entries.some((e) => e.slug === 'closed-wf'));
    assert.ok(r.sources.length >= 7 && r.notOnDisk.length >= 1, 'the sources and the states that are not on disk are listed');
    assert.match(inboxText(r), /^12 thing\(s\) wait on you now, oldest first:\n1\. demo-engine \(digest, since 2026-10-03\)/);
    assert.deepEqual([r.now, r.later], [12, 0]);
    assert.doesNotMatch(by('find-wf', 'finding').ask, /COR-1/);
  } finally { p.done(); }
});

test('an empty project, and the CLI', async () => {
  const p = project();
  try {
    assert.deepEqual((await inboxOf(p.root)).entries, []);
    const text = spawnSync(process.execPath, [WF, 'inbox', p.root], { encoding: 'utf8' });
    assert.equal(text.status, 0, text.stderr);
    assert.equal(text.stdout.trim(), 'Nothing waits on you.');
  } finally { p.done(); }
  const f = fixture();
  try {
    const json = spawnSync(process.execPath, [WF, 'inbox', f.root, '--json'], { encoding: 'utf8' });
    assert.equal(json.status, 0, json.stderr);
    assert.equal(JSON.parse(json.stdout).count, 12);
  } finally { f.done(); }
});

test('a question waits only until its answer, and a run that runs again is no gate', async () => {
  const p = fixture();
  try {
    addDecision(p.wf('find-wf'), { key: 'finding:COR-1', question: 'Accept?', answer: 'accept the change' });
    writeFileSync(path.join(p.wf('run-wf'), 'progress.json'), JSON.stringify({ run: 'r2', driver: 'yolo', status: 'running', updatedAt: new Date().toISOString() }));
    // A work packet ships with its list: the walk owns that question.
    p.index('pkt-ship', { 'origin-packet': '.ai/workflows/brainstorm-demo/work/pkt-ship.md', 'next-invocation': '/wf ship pkt-ship' });
    const kinds = (await inboxOf(p.root)).entries.map((e) => `${e.slug}:${e.kind}`);
    assert.ok(!kinds.includes('find-wf:finding'));
    assert.ok(!kinds.includes('run-wf:run-gate'));
    assert.ok(!kinds.includes('pkt-ship:ship'));
  } finally { p.done(); }
});

test('rule 1: an open question waits now only at a step the person takes, or while a run holds it', async () => {
  const p = project();
  try {
    p.index('plan-wf', { 'current-stage': 'slice', 'next-command': 'wf-plan', 'next-invocation': '/wf plan plan-wf api', 'open-questions': ['AMB-1 (plan): Where does the client run?', 'AMB-2 (plan, with the owner): How much RAM does the box have?'] });
    p.index('pick-wf', { status: 'ready', 'next-command': 'user-picks', 'next-invocation': 'user-picks — see 01-investigate.md', 'open-questions': ['Does it need durability?', 'Q-3 (implement): Which cache?'] });
    p.index('held-wf', { 'current-stage': 'implement', 'next-invocation': '/wf implement held-wf api', 'open-questions': [{ key: 'db', question: 'Which database?', stage: 'implement', 'held-at': '2026-10-02T00:00:00Z' }] });
    p.file('held-wf', 'progress.json', JSON.stringify({ run: 'r1', driver: 'yolo', stage: 'implement', status: 'running', updatedAt: new Date().toISOString() }));
    p.index('recv-wf', { 'next-invocation': '/wf plan recv-wf api', 'open-questions': [{ key: 'design-round', question: 'Does the view get a design round?', stage: 'slice', 'receiving-stage': 'plan' }] });
    const r = await inboxOf(p.root);
    const q = (slug) => r.entries.filter((e) => e.slug === slug && e.kind === 'question');
    assert.deepEqual(q('plan-wf').map((e) => [e.key, e.later, e.why]), [['AMB-1', true, 'the plan stage asks it when it runs'], ['AMB-2', true, 'the plan stage asks it when it runs']]);
    assert.deepEqual(q('pick-wf').map((e) => [e.ask, Boolean(e.later), e.why ?? null]), [['Does it need durability?', false, null], ['Which cache?', true, 'the implement stage asks it when it runs']]);
    assert.deepEqual(q('held-wf').map((e) => [e.key, Boolean(e.later)]), [['db', false]], 'a question that a running stage holds waits now');
    assert.deepEqual(q('recv-wf').map((e) => [e.stage, e.why]), [['plan', 'the plan stage asks it when it runs']], 'the receiving stage asks it, and the question is not stale');
  } finally { p.done(); }
});

test('rule 2: per-workflow counts, and one line per workflow for the later entries', async () => {
  const p = project();
  try {
    p.index('household', { 'next-invocation': '/wf plan household api', 'open-questions': ['AMB-37 (plan): Where?', 'AMB-38 (plan): How?', 'AMB-39 (plan): Which?'] });
    p.index('pick-wf', { 'next-command': 'user-picks', 'open-questions': ['Is it worth it?'] });
    const r = await inboxOf(p.root);
    assert.deepEqual([r.count, r.now, r.later], [5, 2, 3]);
    assert.deepEqual(r.byWorkflow, { household: { now: 0, later: 3 }, 'pick-wf': { now: 2, later: 0 } });
    assert.deepEqual(r.entries.filter((e) => e.slug === 'household').length, 3, 'the JSON keeps one entry per question');
    assert.deepEqual(r.laterGroups.map((g) => g.line), ['3 questions wait for the plan stage of household.']);
    const text = inboxText(r);
    assert.match(text, /^2 thing\(s\) wait on you now, oldest first:/);
    assert.match(text, /\nLater \(3\):\n- 3 questions wait for the plan stage of household\.(\n|$)/);
    assert.doesNotMatch(text, /AMB-3/);
  } finally { p.done(); }
});

test('rule 3: no internal id or marker in an ask; the id stays in the key', async () => {
  assert.deepEqual(parseOpenQuestion('AMB-37 (plan): Where does the Space client run?'), { key: 'AMB-37', stage: 'plan', text: 'Where does the Space client run?', note: false, held: false, heldAt: null });
  assert.deepEqual([parseOpenQuestion('DEFERRED to plan: per-surface caps').stage, parseOpenQuestion('DEFERRED to plan: per-surface caps').text, parseOpenQuestion('DEFERRED to plan: per-surface caps').note], ['plan', 'Per-surface caps', true]);
  const esc = parseOpenQuestion('ESCALATED at gate to a full multi-slice /wf intake. This workflow is a seed only.');
  assert.equal(esc.note, true);
  assert.doesNotMatch(esc.text, /ESCALATED/);
  const d = parseOpenQuestion("D5 RCA DONE 2026-07-27: the query 'WHERE request_id=?' throws on zero rows");
  assert.deepEqual([d.key, d.note], ['D5', true], 'a ? inside a quoted query is not a question');
  assert.equal(plainText('U-2 Observability sink for the event stream'), 'Observability sink for the event stream');
  const p = fixture();
  try {
    const r = await inboxOf(p.root);
    for (const e of r.entries) assert.doesNotMatch(e.ask, /^(?:[A-Z]{1,6}-?\d+|DEFERRED|ESCALATED)\b/, `${e.slug} ${e.kind}: ${e.ask}`);
    assert.doesNotMatch(r.entries.find((e) => e.kind === 'finding').ask, /COR-1/);
  } finally { p.done(); }
});

test('rule 4: a question of a closed or superseded workflow, or of a stage the workflow has passed, is dropped and counted', async () => {
  const p = project();
  try {
    p.index('past-wf', { 'current-stage': 'plan', 'next-invocation': '/wf implement past-wf api', 'open-questions': ['S-1 (slice): Split the slice?', { key: 'k', question: 'Which shape?', stage: 'shape' }, 'V-1 (verify): Which device?'] });
    p.index('old-wf', { status: 'superseded', 'open-questions': ['Still open?'] });
    p.index('gone-wf', { 'superseded-by': 'new-wf', 'open-questions': ['Also open?'] });
    p.index('done-wf', { status: 'closed', 'open-questions': ['Old one?', 'Older one?'] });
    const r = await inboxOf(p.root);
    assert.deepEqual(r.entries.map((e) => [e.slug, e.key, e.why]), [['past-wf', 'V-1', 'the verify stage asks it when it runs']]);
    assert.ok(r.notes.includes('left out 2 open question(s) of a stage that the workflow has passed'), r.notes.join('; '));
    assert.ok(r.notes.includes('left out 4 open question(s) of closed or superseded workflows'), r.notes.join('; '));
  } finally { p.done(); }
});

