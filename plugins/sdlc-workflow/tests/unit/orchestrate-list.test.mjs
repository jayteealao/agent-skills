// /wf orchestrate on a list of work packets: the take-over marks the list as owned and the
// walk refuses it; the hand-back needs a clean boundary, and the walk then accepts each
// passed work packet as done.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { safeParseFrontmatter } from '../../lib/frontmatter.mjs';
import { writeList } from '../../lib/packets.mjs';
import { run as campaign } from '../../scripts/campaign.mjs';
import { OWNER_FILE, run } from '../../scripts/orchestrate.mjs';

const SRC = 'brainstorm-engine';
const S = `${SRC}-run`;
const B = 'host:claude-sonnet-5-5';
const PASS = 'node -e "process.exit(0)"';
const W = { 'ux-impact': 'none', 'ux-impact-confirmed': true, 'try-out': 'no', 'estimated-slices': 2 };

function board() {
  return {
    schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: SRC, topic: 'the engine', stack: { platforms: ['node'], languages: ['js'], 'user-confirmed': true },
    areas: [{ key: 'engine', name: 'The engine', side: 'solution', state: 'explored', scope: 'keep' }],
    threads: [{ key: 'a', name: 'A', area: 'engine', state: 'live' }, { key: 'b', name: 'B', area: 'engine', state: 'live' }],
    items: [
      { key: 'd-a', kind: 'decision', thread: 'a', text: 'A is one module.', source: 'person', scope: 'keep', session: 1, 'decided-at': '2026-10-01T10:00:00Z' },
      { key: 'd-b', kind: 'decision', thread: 'b', text: 'B reads A.', source: 'person', scope: 'keep', session: 1, 'decided-at': '2026-10-01T10:00:00Z' },
    ],
    work: [
      { key: 'part-a', order: 1, title: 'Build A', shape: 'intake', slug: 'part-a', items: ['d-a'], threads: ['a'], entry: 'x', state: 'proposed', ...W, goal: 'Build A.', 'acceptance-criteria': ['A prints its name.', 'A exits 0.'] },
      { key: 'part-b', order: 2, 'why-here': 'B reads A', title: 'Build B', shape: 'intake', slug: 'part-b', items: ['d-b'], threads: ['b'], entry: 'x', state: 'proposed', ...W, goal: 'Build B.', 'acceptance-criteria': ['B prints the name of A.'] },
    ],
    log: [],
  };
}

function makeRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'orch-list-'));
  execFileSync('git', ['-C', root, 'init', '-q'], { stdio: 'ignore' });
  execFileSync('git', ['-C', root, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { stdio: 'ignore' });
  const dir = path.join(root, '.ai', 'workflows', SRC);
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.join(root, '.ai', 'workflows', S), { recursive: true });
  writeFileSync(path.join(dir, 'brainstorm-board.json'), JSON.stringify(board(), null, 2));
  assert.equal(writeList(dir, { now: new Date('2026-10-03T10:00:00Z') }).ok, true);
  process.env.SDLC_HOME = path.join(root, '.home');
  run(['agents', 'allow', root, S, '--ids', 'host:claude-sonnet-5-5,host:claude-opus-5-5', '--words', 'these two']);
  return { root, dir };
}
const file = (root, name, value) => {
  const p = path.join(root, name);
  writeFileSync(p, typeof value === 'string' ? value : JSON.stringify(value));
  return p;
};
const o = (root, cmd, ...rest) => (['contract', 'change'].includes(cmd) ? run([cmd, rest[0], root, S, ...rest.slice(1)]) : run([cmd, root, S, ...rest]));
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const refused = (r, re) => { assert.equal(r.ok, false, JSON.stringify(r)); assert.match(r.error, re); return r; };
const packetState = (dir, key) => safeParseFrontmatter(readFileSync(path.join(dir, 'work', `${key}.md`), 'utf8')).data.state;

test('take-over: outcomes from the acceptance criteria, an owner mark, and the walk refuses the list', () => {
  const { root, dir } = makeRoot();
  try {
    const t = ok(o(root, 'take-over', SRC));
    assert.deepEqual(t.source, { kind: 'list', slug: SRC, 'list-revision': 1 });
    assert.deepEqual(t.outcomes.map((x) => [x.id, x.packet, x.says]), [
      ['OUT-PART-A-001', 'part-a', 'A prints its name.'],
      ['OUT-PART-A-002', 'part-a', 'A exits 0.'],
      ['OUT-PART-B-001', 'part-b', 'B prints the name of A.'],
    ]);
    assert.match(t.outcomes[0].source, /part-a\.md#AC-1$/);
    assert.ok(t.outcomes.every((x) => x.state === undefined), 'no work packet is done, so no outcome starts as passed');
    assert.equal(JSON.parse(readFileSync(path.join(dir, OWNER_FILE), 'utf8')).owner, S);

    const next = campaign(['next', root, SRC]);
    assert.equal(next.ok, false);
    assert.match(next.error, new RegExp(`owned by the orchestrate run ${S}`));
    assert.equal(next.fix.who, 'person');

    refused(run(['take-over', root, 'another-run', SRC]), /owned by the run/);
    assert.equal(campaign(['accept', root, SRC]).ok, false, 'the walk accepts nothing before a hand-back is ready');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('hand-back: refused while a work packet is started, then the walk accepts the passed work packet', () => {
  const { root, dir } = makeRoot();
  try {
    const t = ok(o(root, 'take-over', SRC));
    const outcomes = t.outcomes.map((x) => ({ ...x, kind: 'measure', proof: { command: PASS } }));
    ok(o(root, 'contract', 'put', file(root, 'c.json', { source: t.source, commands: { tests: PASS, ci: 'none' }, outcomes })));
    ok(o(root, 'contract', 'approve', '--words', 'yes'));
    refused(o(root, 'hand-back', 'finish'), /no hand-back is in progress/);

    const u = ok(o(root, 'unit', file(root, 'u.json', { role: 'builder', title: 'build A', serves: ['OUT-PART-A-001', 'OUT-PART-A-002'], files: ['a.js'] }))).unit;
    ok(o(root, 'dispatch', String(u), '--agent', B, '--task', file(root, 't.md', 'task'), '--host', 'claude'));
    ok(o(root, 'result', String(u), file(root, 'r.json', { status: 'done', did: 'built A', commands: [], commits: ['abc1234'] })));

    const start = ok(o(root, 'hand-back', 'start'));
    assert.deepEqual(start.packets.map((p) => [p.packet, p.state]), [['part-a', 'started'], ['part-b', 'untouched']]);
    refused(o(root, 'unit', file(root, 'u2.json', { role: 'builder', title: 'build B', serves: ['OUT-PART-B-001'], files: ['b.js'] })), /hand-back is in progress/);
    refused(o(root, 'hand-back', 'finish'), /started and not passed/);

    ok(o(root, 'measure', 'OUT-PART-A-001'));
    ok(o(root, 'measure', 'OUT-PART-A-002'));
    const fin = ok(o(root, 'hand-back', 'finish'));
    assert.deepEqual(fin.passed, ['part-a']);
    assert.deepEqual(fin.untouched, ['part-b']);
    assert.match(fin.command, /campaign\.mjs" accept /);

    const acc = campaign(['accept', root, SRC]);
    assert.equal(acc.ok, true, JSON.stringify(acc));
    assert.deepEqual(acc.accepted, ['part-a']);
    assert.equal(packetState(dir, 'part-a'), 'done');
    assert.equal(packetState(dir, 'part-b'), 'written');
    assert.equal(JSON.parse(readFileSync(path.join(dir, 'brainstorm-board.json'), 'utf8')).work.find((w) => w.key === 'part-a').state, 'done');
    assert.equal(existsSync(path.join(dir, OWNER_FILE)), false, 'the owner mark is off, so the walk goes on');
    assert.doesNotMatch(String(campaign(['next', root, SRC]).error ?? ''), /owned by/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a list that changed shows in state until the person approves the contract change', () => {
  const { root, dir } = makeRoot();
  try {
    const t = ok(o(root, 'take-over', SRC));
    const outcomes = t.outcomes.map((x) => ({ ...x, kind: 'measure', proof: { command: PASS } }));
    refused(o(root, 'contract', 'put', file(root, 'c.json', { source: t.source, commands: { tests: PASS, ci: 'none' }, outcomes: outcomes.map((x) => ({ ...x, state: 'passed' })) })), /passed only when/);
    ok(o(root, 'contract', 'put', file(root, 'c.json', { source: t.source, commands: { tests: PASS, ci: 'none' }, outcomes })));
    ok(o(root, 'contract', 'approve', '--words', 'yes'));
    assert.equal(o(root, 'state')['source-changed'], undefined);

    const b = board();
    b.work.push({ key: 'part-c', order: 3, 'why-here': 'C reads B', title: 'Build C', shape: 'intake', slug: 'part-c', items: ['d-c'], threads: ['b'], entry: 'x', state: 'proposed', ...W, goal: 'Build C.', 'acceptance-criteria': ['C runs.'] });
    b.items.push({ key: 'd-c', kind: 'decision', thread: 'b', text: 'C reads B.', source: 'person', scope: 'keep', session: 2, 'decided-at': '2026-10-05T10:00:00Z' });
    writeFileSync(path.join(dir, 'brainstorm-board.json'), JSON.stringify(b, null, 2));
    assert.equal(writeList(dir, { now: new Date('2026-10-05T10:00:00Z') }).revision, 2);
    const changed = o(root, 'state')['source-changed'];
    assert.equal(changed.to, 2);
    assert.match(changed.changes, /work\/changes\.md$/);

    const add = { kind: 'add', outcome: { id: 'OUT-PART-C-001', says: 'C runs.', kind: 'measure', proof: { command: PASS }, packet: 'part-c', source: 'part-c.md#AC-1' } };
    ok(o(root, 'change', 'propose', file(root, 'ch.json', { 'list-revision': 2, changes: [add] }), '--why', 'the brainstorm added a work packet'));
    assert.ok(o(root, 'state')['source-changed'], 'the run still shows the change until the person answers');
    ok(o(root, 'change', 'approve', '--words', 'yes'));
    assert.equal(o(root, 'state')['source-changed'], undefined, 'the approved change carries the new revision of the list');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
