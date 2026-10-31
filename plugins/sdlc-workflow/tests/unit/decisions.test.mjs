// lib/decisions.mjs and `wf.mjs decide`: the keyed decision store of a workflow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  DECISIONS_FILE, addDecision, answeredBy, dropAnswered, importLegacy, inScope, liveDecisions,
  parseLegacyAnswers, parseLegacySteer, readDecisions,
} from '../../lib/decisions.mjs';
import { parse } from '../../lib/yaml.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-decisions-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('add numbers entries, writes YAML that reads back, and supersedes the same key in the same scope', () => {
  const f = fixture();
  try {
    const a = addDecision(f.dir, { key: 'db', question: 'Which store?', answer: 'sqlite', stage: 'plan' }, { now: '2026-10-24T10:00:00Z' });
    assert.equal(a.entry.id, 'D-001');
    assert.deepEqual(a.superseded, []);
    addDecision(f.dir, { key: 'db', answer: 'postgres', scope: { slice: 'api' } });
    const c = addDecision(f.dir, { key: 'db', answer: 'duckdb' });
    assert.equal(c.entry.id, 'D-003');
    assert.deepEqual(c.superseded, ['D-001'], 'the slice-scoped entry has another scope and stays live');
    const doc = parse(readFileSync(path.join(f.dir, DECISIONS_FILE), 'utf8'));
    assert.equal(doc.type, 'decisions');
    assert.equal(doc.decisions[0]['superseded-by'], 'D-003');
    assert.equal(doc.decisions[0].at, '2026-10-24T10:00:00Z');
    assert.deepEqual(readDecisions(f.dir).map((e) => e.id), ['D-001', 'D-002', 'D-003']);
  } finally { f.done(); }
});

test('add refuses an unknown kind or by, an empty answer, and a keyless answer', () => {
  const f = fixture();
  try {
    assert.throws(() => addDecision(f.dir, { key: 'k', answer: 'x', kind: 'vote' }), /kind vote is not a kind; the kinds are: answer .*steer .*approval .*try-out .*delegate/);
    assert.throws(() => addDecision(f.dir, { key: 'k', answer: 'x', by: 'robot' }), /by must be one of/);
    assert.throws(() => addDecision(f.dir, { key: 'k', answer: ' ' }), /an answer is required/);
    assert.throws(() => addDecision(f.dir, { answer: 'x' }), /an answer needs --key/);
    assert.equal(addDecision(f.dir, { kind: 'steer', answer: 'no new runtime deps' }).entry.key, null);
  } finally { f.done(); }
});

test('scope: an absent field does not narrow; a file covers its folder and the files under it', () => {
  const e = (scope) => ({ scope });
  assert.equal(inScope(e({}), { slice: 'a', files: ['x.js'] }), true);
  assert.equal(inScope(e({ slice: 'a' }), { slice: 'b' }), false);
  assert.equal(inScope(e({ slice: 'a' }), {}), true, 'a slug-wide brief sees the slice entries');
  assert.equal(inScope(e({ packet: 'p1' }), { packet: 'p2' }), false);
  assert.equal(inScope(e({ files: ['src/db'] }), { files: ['src/db/pool.js'] }), true);
  assert.equal(inScope(e({ files: ['src\\db\\pool.js'] }), { files: ['src/db'] }), true);
  assert.equal(inScope(e({ files: ['src/db'] }), { files: ['src/dbx.js'] }), false);
});

test('live entries, the answered key, and dropping the answered questions', () => {
  const f = fixture();
  try {
    addDecision(f.dir, { key: 'auth', answer: 'oauth' });
    addDecision(f.dir, { key: 'auth', answer: 'magic link' });
    addDecision(f.dir, { key: 'cache', answer: 'none', scope: { slice: 'api' } });
    addDecision(f.dir, { kind: 'delegate', by: 'delegate', key: 'copy', answer: 'short' });
    const list = readDecisions(f.dir);
    assert.deepEqual(liveDecisions(list).map((e) => e.id), ['D-002', 'D-003', 'D-004']);
    assert.deepEqual(liveDecisions(list, { slice: 'ui' }).map((e) => e.id), ['D-002', 'D-004']);
    assert.deepEqual(liveDecisions(list, {}, { by: 'delegate' }).map((e) => e.id), ['D-004']);
    assert.equal(answeredBy(list, 'auth').answer, 'magic link');
    assert.equal(answeredBy(list, 'cache', { slice: 'ui' }), null);
    const r = dropAnswered(list, [{ key: 'auth', text: 'Which login?' }, { key: 'cache', text: '?' }, { key: 'new', text: '?' }], { slice: 'api' });
    assert.deepEqual(r.ask.map((q) => q.key), ['new']);
    assert.deepEqual(r.answered.map((q) => [q.key, q.decision]), [['auth', 'D-002'], ['cache', 'D-003']]);
  } finally { f.done(); }
});

test('the legacy readers take the po-answers log and the steer bullets', () => {
  const answers = [
    '# PO answers', '',
    '## 2026-09-01T10:00:00Z — intake', '', '**Q:** Who is the user?', '**A:** Club managers', '',
    '## 2026-09-02T11:00:00Z — shape', '', '**Q:** Offline?', '**A:** Yes,', 'for the match day.', '**AMB:** AMB-1', '',
    '## 2026-09-03T11:00:00Z — plan', '', '**Q:** Empty?', '**A:**', '',
  ].join('\n');
  assert.deepEqual(parseLegacyAnswers(answers), [
    { at: '2026-09-01T10:00:00Z', stage: 'intake', question: 'Who is the user?', answer: 'Club managers' },
    { at: '2026-09-02T11:00:00Z', stage: 'shape', question: 'Offline?', answer: 'Yes,\nfor the match day.' },
  ]);
  assert.deepEqual(parseLegacySteer('- do not touch `config/loader.ts`\n  it is being rewritten\n* prefer the queue\n\ntext\n'),
    ['do not touch `config/loader.ts` it is being rewritten', 'prefer the queue']);
});

test('import copies both files once; a second import adds nothing', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.dir, 'po-answers.md'), '## 2026-09-01T10:00:00Z — intake\n\n**Q:** Who?\n**A:** Managers\n\n## 2026-09-01T10:05:00Z — intake\n\n**Q:** Who?\n**A:** Coaches\n');
    writeFileSync(path.join(f.dir, 'steer.md'), '- no new runtime deps\n');
    assert.deepEqual(importLegacy(f.dir), { added: 3, skipped: 0 });
    assert.deepEqual(importLegacy(f.dir), { added: 0, skipped: 3 });
    const list = readDecisions(f.dir);
    assert.deepEqual(list.map((e) => [e.kind, e.key, e.source]), [
      ['answer', 'legacy-who', 'po-answers.md'], ['answer', 'legacy-who-2', 'po-answers.md'], ['steer', null, 'steer.md'],
    ]);
    assert.equal(list[0].at, '2026-09-01T10:00:00Z');
    assert.equal(liveDecisions(list).length, 3, 'two old answers to one question text both stay live');
  } finally { f.done(); }
});

test('wf.mjs decide add takes the answered key out of open-questions of the index', () => {
  const f = fixture();
  const cli = (...args) => spawnSync(process.execPath, [wf, 'decide', ...args], { encoding: 'utf8' });
  try {
    writeFileSync(path.join(f.dir, 'state.yaml'), 'schema: sdlc/v1\ntype: index\nslug: demo\nstatus: active\nupdated-at: "2026-10-25T10:00:00Z"\nopen-questions:\n  - finding:SEC-1\n  - key: finding:DES-1\n  - finding:DOC-2\n');
    const open = () => parse(readFileSync(path.join(f.dir, 'state.yaml'), 'utf8'))['open-questions'];
    let r = cli('add', f.root, 'demo', '--key', 'finding:SEC-1', '--question', 'Back up the token?', '--answer', 'no', '--stage', 'review');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /settled finding:SEC-1/);
    assert.deepEqual(open(), [{ key: 'finding:DES-1' }, 'finding:DOC-2']);
    r = cli('add', f.root, 'demo', '--key', 'finding:DES-1', '--answer', 'own row', '--json');
    assert.equal(JSON.parse(r.stdout).settled, true);
    assert.deepEqual(open(), ['finding:DOC-2']);
    r = cli('add', f.root, 'demo', '--key', 'other', '--answer', 'x', '--json');
    assert.equal(JSON.parse(r.stdout).settled, false, 'a key that is not open changes nothing');
    r = cli('add', f.root, 'demo', '--kind', 'steer', '--key', 'finding:DOC-2', '--answer', 'prefer short docs', '--json');
    assert.equal(JSON.parse(r.stdout).settled, false, 'a steer answers no question');
    assert.deepEqual(open(), ['finding:DOC-2']);
  } finally { f.done(); }
});

test('wf.mjs decide hold publishes a held question; a second hold replaces it; an answer settles it', () => {
  const f = fixture();
  const cli = (...args) => spawnSync(process.execPath, [wf, 'decide', ...args], { encoding: 'utf8' });
  try {
    writeFileSync(path.join(f.dir, 'state.yaml'), 'schema: sdlc/v1\ntype: index\nslug: demo\nstatus: active\nupdated-at: "2026-10-25T10:00:00Z"\nopen-questions:\n  - finding:SEC-1\n');
    const open = () => parse(readFileSync(path.join(f.dir, 'state.yaml'), 'utf8'))['open-questions'];
    let r = cli('hold', f.root, 'demo', '--key', 'restart-floor', '--question', 'Refuse a restart below the floor?', '--stage', 'implement', '--slice', 'rules', '--options', 'refuse|clamp', '--recommended', 'refuse');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^held restart-floor: Refuse a restart below the floor\?/);
    let q = open();
    assert.equal(q.length, 2);
    assert.equal(q[0], 'finding:SEC-1');
    assert.equal(q[1].key, 'restart-floor');
    assert.equal(q[1].stage, 'implement');
    assert.equal(q[1].slice, 'rules');
    assert.deepEqual(q[1].options, ['refuse', 'clamp']);
    assert.equal(q[1].recommended, 'refuse');
    assert.match(q[1]['held-at'], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    r = cli('hold', f.root, 'demo', '--key', 'restart-floor', '--question', 'Refuse or clamp a restart below the floor?', '--stage', 'implement', '--json');
    assert.equal(JSON.parse(r.stdout).replaced, true);
    q = open();
    assert.equal(q.length, 2, 'a second hold of the key replaces the entry');
    assert.equal(q[1].question, 'Refuse or clamp a restart below the floor?');
    const qf = path.join(f.root, 'q.json');
    writeFileSync(qf, JSON.stringify({ questions: [{ key: 'restart-floor' }, { key: 'other' }] }));
    r = cli('add', f.root, 'demo', '--key', 'restart-floor', '--question', 'Refuse a restart below the floor?', '--answer', 'refuse', '--stage', 'implement', '--json');
    assert.equal(JSON.parse(r.stdout).settled, true);
    assert.deepEqual(open(), ['finding:SEC-1']);
    const d = JSON.parse(cli('drop', f.root, 'demo', qf, '--json').stdout);
    assert.deepEqual(d.ask, [{ key: 'other' }]);
    assert.equal(d.answered[0].key, 'restart-floor');
    assert.equal(d.answered[0].answer, 'refuse');
    assert.match(d.answered[0].decision, /^D-\d{3}$/);
    assert.match(cli('hold', f.root, 'demo', '--key', 'k').stderr, /--question is required/);
  } finally { f.done(); }
});

test('wf.mjs decide: add, list, answered, drop and import from the command line', () => {
  const f = fixture();
  const cli = (...args) => spawnSync(process.execPath, [wf, 'decide', ...args], { encoding: 'utf8' });
  try {
    let r = cli('add', f.root, 'demo', '--key', 'db', '--question', 'Which store?', '--answer', 'sqlite', '--slice', 'api', '--files', 'src/db,src/x.js');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^D-001 Which store\? → sqlite \(answer; slice=api files=src\/db,src\/x\.js\)/);
    r = cli('add', f.root, 'demo', '--key', 'db', '--answer', 'postgres', '--slice', 'api', '--files', 'src/x.js,src/db');
    assert.match(r.stdout, /supersedes D-001/);
    r = cli('list', f.root, 'demo', '--slice', 'api', '--json');
    assert.deepEqual(JSON.parse(r.stdout).map((e) => e.id), ['D-002']);
    assert.equal(cli('list', f.root, 'demo', '--all', '--json').stdout.includes('D-001'), true);
    assert.equal(cli('answered', f.root, 'demo', '--key', 'db', '--slice', 'api').status, 0);
    const miss = cli('answered', f.root, 'demo', '--key', 'db', '--slice', 'ui');
    assert.equal(miss.status, 1);
    assert.match(miss.stdout, /not answered: db/);
    const qf = path.join(f.root, 'q.json');
    writeFileSync(qf, JSON.stringify({ questions: [{ key: 'db' }, { key: 'auth' }] }));
    assert.deepEqual(JSON.parse(cli('drop', f.root, 'demo', qf, '--slice', 'api', '--json').stdout).ask, [{ key: 'auth' }]);
    writeFileSync(path.join(f.dir, 'steer.md'), '- prefer the queue\n');
    assert.match(cli('import', f.root, 'demo').stdout, /imported 1, already held 0/);
    const none = cli('list', f.root, 'nope');
    assert.equal(none.status, 1);
    assert.match(none.stderr, /no workflow folder/);
    assert.equal(existsSync(path.join(f.dir, `${DECISIONS_FILE}.tmp`)), false);
  } finally { f.done(); }
});

test('a standing answer settles each later question of its kind, and no other kind', () => {
  const f = fixture();
  try {
    const steer = addDecision(f.dir, { kind: 'steer', key: 'standing:margin-floor', question: 'The margin of band 3 is under its floor. Widen it?', answer: 'Widen, provisional, at every band under its floor' }).entry;
    const list = readDecisions(f.dir);
    assert.equal(answeredBy(list, 'margin-floor:band-7')?.id, steer.id, 'a later case of the kind');
    assert.equal(answeredBy(list, 'refit:wave-2'), null, 'another kind');
    assert.equal(answeredBy(list, 'margin-floor'), null, 'a key with no case');
    assert.deepEqual(dropAnswered(list, [{ key: 'margin-floor:band-9' }, { key: 'db' }]).ask.map((q) => q.key), ['db']);
    // A key of its own wins over the standing answer.
    addDecision(f.dir, { key: 'margin-floor:band-7', answer: 'keep the floor' });
    assert.equal(answeredBy(readDecisions(f.dir), 'margin-floor:band-7').answer, 'keep the floor');
    // A case that the standing answer settled names it, and list --by standing finds it.
    addDecision(f.dir, { key: 'margin-floor:band-9', answer: 'widen', by: `standing:${steer.id}` });
    assert.deepEqual(liveDecisions(readDecisions(f.dir), {}, { by: 'standing' }).map((e) => e.key), ['margin-floor:band-9']);
    assert.throws(() => addDecision(f.dir, { key: 'k', answer: 'x', by: 'standing:none' }), /by must be one of/);
    const r = spawnSync(process.execPath, [wf, 'decide', 'answered', f.root, 'demo', '--key', 'margin-floor:band-12'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, new RegExp(steer.id));
  } finally { f.done(); }
});

test('the by row of _decisions.md names each by value that the store accepts', async () => {
  const { BY, STANDING_PREFIX } = await import('../../lib/decisions.mjs');
  const card = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', '_decisions.md'), 'utf8');
  const row = card.split(/\r?\n/).find((l) => l.startsWith('| `by` |'));
  assert.ok(row, 'the card has a by row');
  for (const value of [...BY, `${STANDING_PREFIX}<id>`]) assert.ok(row.includes(`\`${value}\``), `the by row names ${value}`);
});
