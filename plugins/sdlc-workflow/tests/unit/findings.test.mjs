// lib/findings.mjs and `wf.mjs findings`: the merge law of the findings ledger, in code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { findingsTable, mergeRun, metricsOf, prefixOf, questionsOf, readLedger, setStatus, verdictOf, writeLedger } from '../../lib/findings.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EMPTY = { findings: [], runs: [] };
const T1 = '2026-10-24T10:00:00Z';
const T2 = '2026-10-24T11:00:00Z';

const sqlInjection = { dimension: 'security', severity: 'HIGH', file: 'src/db.js', line: '40', issue: 'The query joins user input.' };
const slowLoop = { dimension: 'performance', severity: 'MED', file: 'src/list.js', line: '12', issue: 'The loop reads the file each time.' };

test('prefixOf: the first three letters of the dimension', () => {
  assert.equal(prefixOf('security'), 'SEC');
  assert.equal(prefixOf('intent-fidelity'), 'INT');
  assert.equal(prefixOf(''), 'GEN');
});

test('a new finding gets the next id of its prefix and status open', () => {
  const r = mergeRun(EMPTY, [sqlInjection, slowLoop], { now: T1 });
  assert.deepEqual(r.added, ['SEC-1', 'PER-1']);
  assert.equal(r.verdict, 'ship-with-caveats');
  const sec = r.ledger.findings[0];
  assert.deepEqual([sec.status, sec['surfaced-at'], sec['last-seen-at']], ['open', T1, T1]);
  assert.equal(r.ledger.runs.length, 1);
});

test('within one run, two findings on the same line are one finding at the higher severity', () => {
  const r = mergeRun(EMPTY, [sqlInjection, { ...sqlInjection, dimension: 'correctness', severity: 'BLOCKER' }], { now: T1 });
  assert.equal(r.ledger.findings.length, 1);
  assert.deepEqual([r.ledger.findings[0].severity, r.ledger.findings[0].also], ['BLOCKER', ['correctness']]);
  assert.equal(r.verdict, 'dont-ship');
});

test('a re-run keeps the id and surfaced-at, resolves a checked dimension, and leaves an unchecked one', () => {
  const one = mergeRun(EMPTY, [sqlInjection, slowLoop], { now: T1 }).ledger;
  // The second run checks security again (the finding moved 2 lines) and does not check performance.
  const two = mergeRun(one, [{ ...sqlInjection, line: '42' }], { dimensions: ['security'], now: T2 });
  assert.deepEqual([two.added, two.resurfaced, two.resolved], [[], ['SEC-1'], []]);
  const sec = two.ledger.findings.find((f) => f.id === 'SEC-1');
  assert.deepEqual([sec['surfaced-at'], sec['last-seen-at']], [T1, T2]);
  assert.equal(two.ledger.findings.find((f) => f.id === 'PER-1').status, 'open', 'performance was not checked');
  // The third run checks both and finds nothing: both resolve, and no row is deleted.
  const three = mergeRun(two.ledger, [], { dimensions: ['security', 'performance'], now: T2 });
  assert.deepEqual(three.resolved.sort(), ['PER-1', 'SEC-1']);
  assert.equal(three.ledger.findings.length, 2);
  assert.equal(three.verdict, 'ship');
  // A resolved finding that surfaces again opens again with its old id.
  const four = mergeRun(three.ledger, [sqlInjection], { now: T2 });
  const again = four.ledger.findings.find((f) => f.id === 'SEC-1');
  assert.deepEqual([again.status, again.reopened], ['open', 1]);
  assert.equal(four.ledger.runs.length, 4);
});

test('a triage status survives a re-run, and a retired id is never reused', () => {
  const one = mergeRun(EMPTY, [sqlInjection], { now: T1 }).ledger;
  setStatus(one, 'SEC-1', 'deferred', 'the next release', { now: T1 });
  const two = mergeRun(one, [], { dimensions: ['security'], now: T2 });
  assert.equal(two.ledger.findings[0].status, 'deferred');
  const three = mergeRun(two.ledger, [{ ...sqlInjection, file: 'src/other.js' }], { now: T2 });
  assert.deepEqual(three.added, ['SEC-2']);
  assert.throws(() => setStatus(three.ledger, 'SEC-2', 'dismissed'), /needs a reason/);
  assert.throws(() => setStatus(three.ledger, 'SEC-9', 'fixed'), /no finding SEC-9/);
});

test('a refuted finding is kept with the reason of its refuter and does not count in the verdict', () => {
  const r = mergeRun(EMPTY, [{ ...sqlInjection, refuted: 'the input is a constant' }], { now: T1 });
  assert.deepEqual([r.ledger.findings[0].status, r.ledger.findings[0].reason, r.verdict], ['refuted', 'the input is a constant', 'ship']);
  // The same finding, not refuted in a later run, opens.
  const two = mergeRun(r.ledger, [sqlInjection], { now: T2 });
  assert.equal(two.ledger.findings[0].status, 'open');
});

test('questionsOf: an open finding whose fix changes an acceptance check is a question', () => {
  const r = mergeRun(EMPTY, [{ ...sqlInjection, changesAcceptance: true, fix: 'reject a quote' }, slowLoop], { now: T1 });
  const q = questionsOf(r.ledger);
  assert.equal(q.length, 1);
  assert.equal(q[0].key, 'finding:SEC-1');
  assert.match(q[0].question, /changes an acceptance check: reject a quote/);
  assert.equal(q[0].recommended, 'apply the fix and change the check');
});

test('findingsTable: open rows first, and verdictOf filters by source', () => {
  const one = mergeRun(EMPTY, [sqlInjection, slowLoop], { now: T1 }).ledger;
  setStatus(one, 'PER-1', 'fixed', null, { now: T1 });
  const table = findingsTable(one).split('\n');
  assert.match(table[2], /^\| SEC-1 \| HIGH \| security \| `src\/db.js:40` /);
  assert.match(table[3], /^\| PER-1 .* \| fixed \|$/);
  assert.equal(verdictOf(one, { source: 'audit' }), 'ship');
  assert.equal(findingsTable(EMPTY), 'No findings.');
});

test('a per-slice run matches and resolves only the entries of its slice', () => {
  const one = mergeRun(EMPTY, [sqlInjection], { slice: 'api', now: T1 }).ledger;
  const two = mergeRun(one, [sqlInjection], { now: T1 });
  assert.deepEqual(two.added, ['SEC-2'], 'the packet run does not match the slice entry');
  const three = mergeRun(two.ledger, [], { slice: 'ui', dimensions: ['security'], now: T2 });
  assert.deepEqual(three.resolved, [], 'a run of slice ui resolves nothing of slice api or of the packet');
  assert.equal(verdictOf(three.ledger, { slice: 'api' }), 'ship-with-caveats');
  assert.equal(verdictOf(three.ledger, { slice: 'ui' }), 'ship');
});

test('a pre-existing finding is debt: no verdict input, its own metric', () => {
  const r = mergeRun(EMPTY, [{ ...sqlInjection, severity: 'BLOCKER', preExisting: true }, { ...slowLoop, severity: 'LOW' }], { dimensions: ['correctness'], now: T1 });
  assert.equal(r.verdict, 'ship');
  const m = metricsOf(r.ledger, { source: 'review', slice: null });
  assert.deepEqual(
    [m['metric-findings-total'], m['metric-findings-blocker'], m['metric-findings-pre-existing'], m['metric-findings-low'], m['metric-findings-raw'], m['metric-commands-run']],
    [2, 0, 1, 1, 2, 3],
  );
  assert.deepEqual(m['commands-run'], ['correctness', 'performance', 'security']);
});

test('readLedger and writeLedger keep the ledger on disk', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-findings-'));
  try {
    assert.deepEqual(readLedger(root), EMPTY);
    const r = mergeRun(EMPTY, [sqlInjection], { now: T1 });
    writeLedger(root, r.ledger);
    const back = readLedger(root);
    assert.equal(back.findings[0].id, 'SEC-1');
    assert.equal(back.runs[0].verdict, 'ship-with-caveats');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('wf.mjs findings add, list, set, table and questions', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-findings-cli-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  const cli = (...a) => spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), 'findings', ...a], { encoding: 'utf8' });
  try {
    const found = path.join(root, 'found.json');
    writeFileSync(found, JSON.stringify({ dimensions: ['security', 'performance'], findings: [{ ...sqlInjection, changesAcceptance: true }] }));
    assert.equal(cli('add', root, 'demo', found, '--run', 'r1').stdout.trim(), 'added 1, seen again 0, resolved 0: ship-with-caveats');
    assert.match(readFileSync(path.join(dir, 'findings.yaml'), 'utf8'), /type: findings/);
    assert.match(cli('list', root, 'demo', '--open').stdout, /^SEC-1 HIGH open src\/db.js:40: The query joins user input\.$/m);
    assert.match(cli('questions', root, 'demo').stdout, /^finding:SEC-1: /);
    assert.equal(cli('set', root, 'demo', 'SEC-1', 'fixed').stdout.trim(), 'SEC-1 fixed');
    assert.match(cli('table', root, 'demo').stdout, /^Verdict: ship\n/);
    assert.match(cli('metrics', root, 'demo').stdout, /^metric-findings-fixed: 1$/m);
    assert.equal(cli('list', root, 'demo', '--open').stdout.trim(), 'no findings');
    assert.equal(cli('set', root, 'demo', 'SEC-1', 'dismissed').status, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
