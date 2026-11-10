// lib/findings.mjs and `wf.mjs findings`: the merge law of the findings ledger, in code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { findingsTable, mergeRun, metricsOf, prefixOf, readLedger, setStatus, verdictOf, writeLedger } from '../../lib/findings.mjs';

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

test('a run with the files of the work packet drops a finding in another file', () => {
  const r = mergeRun(EMPTY, [sqlInjection, slowLoop, { ...slowLoop, file: null, line: null, issue: 'No file.' }], { files: ['./src/db.js'], now: T1 });
  assert.deepEqual(r.added, ['SEC-1', 'PER-1']);
  assert.equal(r.ledger.findings[1].issue, 'No file.');
  assert.deepEqual(r.outOfScope, ['src/list.js:12']);
  assert.equal(r.ledger.runs[0]['out-of-scope'], 1);
  assert.equal(r.ledger.runs[0].raw, 3);
  // No files: every finding stays.
  assert.equal(mergeRun(EMPTY, [sqlInjection, slowLoop], { files: [], now: T1 }).added.length, 2);
});

test('setStatus: a fix keeps its commit, and a dismissal by a decision names the decision', () => {
  const one = mergeRun(EMPTY, [sqlInjection, slowLoop], { now: T1 }).ledger;
  assert.equal(setStatus(one, 'SEC-1', 'fixed', null, { commit: '1a2b3c', now: T2 }).commit, '1a2b3c');
  const per = setStatus(one, 'PER-1', 'dismissed', null, { decision: 'D-012', now: T2 });
  assert.deepEqual([per.status, per.reason, per.decision], ['dismissed', 'decision D-012', 'D-012']);
  assert.throws(() => setStatus(one, 'PER-1', 'fixed', null, { decision: 'D-012' }), /only a dismissed finding/);
});

test('a fixed finding that a later run finds again opens, counts in the verdict, and keeps the fix it had', () => {
  const T3 = '2026-10-24T12:00:00Z';
  const one = mergeRun(EMPTY, [sqlInjection], { now: T1 }).ledger;
  setStatus(one, 'SEC-1', 'fixed', null, { commit: '1a2b3c', now: T2 });
  assert.equal(verdictOf(one), 'ship');
  const again = mergeRun(one, [{ ...sqlInjection, line: '41' }], { now: T3 });
  const sec = again.ledger.findings[0];
  assert.deepEqual([sec.id, sec.status, sec.reopened, sec['resolved-at'], sec.commit], ['SEC-1', 'open', 1, null, undefined]);
  assert.deepEqual(sec['fixed-before'], [{ 'fixed-at': T2, commit: '1a2b3c', 'reopened-at': T3 }]);
  assert.deepEqual(again.reopenedFixed, ['SEC-1']);
  assert.equal(again.verdict, 'ship-with-caveats', 'the reopened HIGH counts again');
  // A refuted repeat leaves the fix standing; a decision of the person is never reopened.
  const refuted = mergeRun(one, [{ ...sqlInjection, refuted: 'the input is escaped now' }], { now: T3 });
  assert.equal(refuted.ledger.findings[0].status, 'fixed');
  const deferred = mergeRun(EMPTY, [sqlInjection], { now: T1 }).ledger;
  setStatus(deferred, 'SEC-1', 'dismissed', 'out of scope', { now: T2 });
  assert.equal(mergeRun(deferred, [sqlInjection], { now: T3 }).ledger.findings[0].status, 'dismissed');
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

test('a slug-wide verdict reads only the packet entries: a residual for it is written with no slice', () => {
  const residual = { dimension: 'residual', severity: 'HIGH', file: 'src/api.js', line: null, key: 'AC-3', issue: 'AC-3 loads in 3 s, not 2 s.' };
  const sliced = mergeRun(EMPTY, [residual], { slice: 'api', dimensions: ['residual'], now: T1 });
  setStatus(sliced.ledger, sliced.added[0], 'could-not-fix', 'the budget needs a cache', { now: T2 });
  assert.equal(verdictOf(sliced.ledger, { slice: null }), 'ship', 'a slice entry is not in the slug-wide verdict');
  const packet = mergeRun(EMPTY, [residual], { dimensions: ['residual'], now: T1 });
  assert.equal(verdictOf(packet.ledger, { slice: null }), 'ship-with-caveats');
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

test('wf.mjs findings add, list, set, table and metrics', () => {
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
    assert.match(cli('questions', root, 'demo').stderr, /findings has no form questions/);
    assert.equal(cli('set', root, 'demo', 'SEC-1', 'fixed', '--commit', '1a2b3c').stdout.trim(), 'SEC-1 fixed');
    assert.match(readFileSync(path.join(dir, 'findings.yaml'), 'utf8'), /commit: 1a2b3c/);
    assert.match(cli('table', root, 'demo').stdout, /^Verdict: ship\n/);
    assert.match(cli('metrics', root, 'demo').stdout, /^metric-findings-fixed: 1$/m);
    assert.equal(cli('list', root, 'demo', '--open').stdout.trim(), 'no findings');
    assert.equal(cli('set', root, 'demo', 'SEC-1', 'dismissed').status, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('wf.mjs findings set --decision dismisses only by a live decision of the person', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-findings-decision-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  const cli = (...a) => spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), ...a], { encoding: 'utf8' });
  try {
    const found = path.join(root, 'found.json');
    writeFileSync(found, JSON.stringify({ dimensions: ['security', 'performance'], affectedFiles: ['src/db.js'], findings: [sqlInjection, slowLoop] }));
    assert.match(cli('findings', 'add', root, 'demo', found).stdout, /dropped 1 outside the work packet/);
    assert.equal(cli('decide', 'add', root, 'demo', '--kind', 'answer', '--key', 'db-quoting', '--question', 'Quote the input?', '--answer', 'no, the input is a constant').status, 0);
    assert.equal(cli('decide', 'add', root, 'demo', '--kind', 'delegate', '--key', 'other', '--question', 'Other?', '--answer', 'yes', '--by', 'delegate').status, 0);
    assert.match(cli('findings', 'set', root, 'demo', 'SEC-1', 'dismissed', '--decision', 'D-002').stderr, /not an answer, steer or approval of the person/);
    assert.match(cli('findings', 'set', root, 'demo', 'SEC-1', 'dismissed', '--decision', 'D-009').stderr, /no decision D-009/);
    assert.equal(cli('findings', 'set', root, 'demo', 'SEC-1', 'dismissed', '--decision', 'D-001').stdout.trim(), 'SEC-1 dismissed');
    assert.match(readFileSync(path.join(dir, 'findings.yaml'), 'utf8'), /reason: decision D-001/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the severity counts are the change\'s own findings: with -pre-existing they add up to -total', () => {
  const r = mergeRun(EMPTY, [{ ...slowLoop, preExisting: true }, { dimension: 'style', severity: 'NIT', file: 'a.js', line: '1', issue: 'n', preExisting: true }, { dimension: 'style', severity: 'LOW', file: 'b.js', line: '1', issue: 'l' }], { dimensions: ['performance', 'style'], now: T1 });
  const m = metricsOf(r.ledger, { source: 'review', slice: null });
  assert.deepEqual([m['metric-findings-med'], m['metric-findings-nit'], m['metric-findings-low'], m['metric-findings-pre-existing'], m['metric-findings-total']], [0, 0, 1, 2, 3]);
  const sum = ['blocker', 'high', 'med', 'low', 'nit', 'pre-existing'].reduce((n, k) => n + m[`metric-findings-${k}`], 0);
  assert.equal(sum, m['metric-findings-total']);
});

test('a re-found entry moves to the line where the run found it, so a finding that drifts keeps its id', () => {
  let ledger = mergeRun(EMPTY, [{ ...sqlInjection, line: '10' }], { dimensions: ['security'], now: T1 }).ledger;
  for (const line of ['13', '16', '19']) ledger = mergeRun(ledger, [{ ...sqlInjection, line }], { dimensions: ['security'], now: T2 }).ledger;
  assert.deepEqual(ledger.findings.map((f) => [f.id, f.line, f.status]), [['SEC-1', '19', 'open']]);
});

test('a finding with no dimension is refused: no run could resolve it', () => {
  assert.throws(() => mergeRun(EMPTY, [{ severity: 'HIGH', file: 'a.js', line: '1', issue: 'no dimension' }], { now: T1 }), /needs its dimension: no dimension/);
});

test('four processes that add findings to one ledger at once lose no entry and mint no id twice', async () => {
  const { spawn } = await import('node:child_process');
  const { pathToFileURL } = await import('node:url');
  const root = mkdtempSync(path.join(tmpdir(), 'findings-race-'));
  try {
    const lib = pathToFileURL(path.join(pluginRoot, 'lib', 'findings.mjs')).href;
    const code = (n) => `const F = await import(${JSON.stringify(lib)}); for (let i = 0; i < 10; i++) F.updateLedger(${JSON.stringify(root)}, (l) => { const r = F.mergeRun(l, [{ dimension: 'security', severity: 'LOW', file: 'f${n}-' + i + '.js', line: '1', issue: 'x' }], {}); F.writeLedger(${JSON.stringify(root)}, r.ledger); });`;
    const codes = await Promise.all([0, 1, 2, 3].map((n) => new Promise((res) => spawn(process.execPath, ['--input-type=module', '-e', code(n)], { stdio: ['ignore', 'ignore', 'inherit'] }).on('exit', res))));
    assert.deepEqual(codes, [0, 0, 0, 0]);
    const ids = readLedger(root).findings.map((f) => f.id);
    assert.equal(ids.length, 40);
    assert.equal(new Set(ids).size, 40, 'no id is minted twice');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
