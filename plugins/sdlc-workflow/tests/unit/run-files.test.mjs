// Run files and large evidence live outside the workflow folder: the run files in
// <root>/.ai/run/<slug>/, the files over the size cap in <root>/.ai/evidence/<slug>/. Writers write
// the new place; readers read the new place first, then the old one. The sweep before a records
// commit moves old files out, never deletes one, and lists the evidence in the record. The cost
// ledger keeps one file a month, and an old cost.jsonl splits into them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evidenceDir, runDir, runRoot } from '../../lib/records-root.mjs';
import {
  EVIDENCE_LOG, findRunFile, maxFileBytes, noteEvidence, readEvidenceLog, runDirOf, sha256Of, sweepRunFiles,
} from '../../lib/run-files.mjs';
import { readDriverOutcome, writeDriverOutcome, writeProgress } from '../../lib/progress.mjs';
import { answersPath, appendAnswerEvent, oldAnswersPath, readAnswerEvents } from '../../lib/answers.mjs';
import { appendCostRow, costFileName, costFiles, readCostRows, splitCostLedger } from '../../lib/cost-ledger.mjs';
import { controlPath, statePath, stopCheck, writeControl } from '../../scripts/yolo-watch.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function fixture({ capMb = null } = {}) {
  const top = mkdtempSync(path.join(tmpdir(), 'sdlc-run-files-'));
  const root = path.join(top, 'project');
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  const home = path.join(top, 'home');
  mkdirSync(home, { recursive: true });
  if (capMb) writeFileSync(path.join(home, 'config.json'), JSON.stringify({ records: { 'max-file-mb': capMb } }));
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  return {
    top, root, dir, home,
    done() {
      if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
      rmSync(top, { recursive: true, force: true });
    },
  };
}

const row = (ts, n) => JSON.stringify({ ts, host: 'claude', session: 's', turn: n, key: 'plan', slug: 'demo', slice: null, main: null, subagents: [], external: [] });

test('the run folder and the evidence folder sit in the project, and a local workflow folder names its run folder', () => {
  const f = fixture();
  try {
    assert.equal(runDir(f.root, 'demo'), path.join(f.root, '.ai', 'run', 'demo'));
    assert.equal(evidenceDir(f.root, 'demo'), path.join(f.root, '.ai', 'evidence', 'demo'));
    assert.equal(runDirOf(f.dir), runDir(f.root, 'demo'));
    assert.equal(runDirOf(f.dir, f.root), runDir(f.root, 'demo'));
    assert.equal(runDirOf(path.join(f.top, 'elsewhere', 'demo')), null, 'a folder outside a project and outside the clone has no run folder');
    assert.equal(maxFileBytes(), 5 * 1024 * 1024, 'the cap is 5 MB by default');
  } finally { f.done(); }
});

test('a reader reads the run folder first, then the workflow folder of an older run', () => {
  const f = fixture();
  try {
    assert.equal(findRunFile(f.root, 'demo', '.control.json'), null);
    writeFileSync(path.join(f.dir, '.control.json'), '{"action":"stop","after":"current"}\n');
    assert.equal(findRunFile(f.root, 'demo', '.control.json'), path.join(f.dir, '.control.json'));
    assert.equal(stopCheck(f.root, 'demo').stop, true, 'a stop request in the old place still stops the run');
    writeControl(f.root, 'demo', 'stop', ['verify'], Date.parse('2026-10-25T10:00:00Z'));
    assert.equal(controlPath(f.root, 'demo'), path.join(runDir(f.root, 'demo'), '.control.json'));
    assert.ok(existsSync(controlPath(f.root, 'demo')), 'the writer writes the run folder');
    assert.equal(stopCheck(f.root, 'demo').stop, false, 'the new request wins over the old one');
    writeControl(f.root, 'demo', 'clear', ['force']);
    assert.ok(!existsSync(controlPath(f.root, 'demo')) && !existsSync(path.join(f.dir, '.control.json')), 'a clear clears both places');
    assert.equal(statePath(f.root, 'demo'), path.join(runDir(f.root, 'demo'), '.watch-state.json'));
    assert.match(readFileSync(path.join(runRoot(f.root), '.gitignore'), 'utf8'), /^\*$/m, 'the run folder ignores itself');
  } finally { f.done(); }
});

test('the driver outcome lives in the run folder, and an old outcome is still read', () => {
  const f = fixture();
  try {
    writeFileSync(path.join(f.dir, '.driver-outcome.json'), JSON.stringify({ run: 'r0', status: 'stopped' }));
    assert.equal(readDriverOutcome(f.dir).run, 'r0');
    writeProgress(f.dir, { run: 'r1', driver: 'yolo', status: 'running' });
    writeProgress(f.dir, { status: 'stopped', reason: 'a gate' });
    assert.ok(existsSync(path.join(runDir(f.root, 'demo'), '.driver-outcome.json')));
    assert.equal(readDriverOutcome(f.dir).run, 'r1');
    writeDriverOutcome(f.dir, { run: 'r1', ok: true }, { root: f.root });
    assert.equal(readDriverOutcome(f.dir, { root: f.root }).ok, true);
  } finally { f.done(); }
});

test('the answer log is written to the run folder, and the old log is read with it', () => {
  const f = fixture();
  try {
    writeFileSync(oldAnswersPath(f.root), `${JSON.stringify({ at: '2026-10-01T00:00:00Z', tool: 'AskUserQuestion', questions: [{ question: 'Old?', answer: 'Yes' }] })}\n`);
    appendAnswerEvent(f.root, { tool: 'AskUserQuestion', questions: [{ question: 'New?', answer: 'No' }] });
    assert.equal(answersPath(f.root), path.join(f.root, '.ai', 'run', 'answers.jsonl'));
    assert.ok(existsSync(answersPath(f.root)));
    assert.deepEqual(readAnswerEvents(f.root).map((e) => e.questions[0].question), ['Old?', 'New?']);
  } finally { f.done(); }
});

test('the pre-write check refuses an agent write to the answer log in the run folder', () => {
  const f = fixture();
  try {
    const hook = path.join(pluginRoot, 'hooks', 'pre-tool-use-all.mjs');
    const r = spawnSync(process.execPath, [hook], { input: JSON.stringify({ cwd: f.root, tool_name: 'Write', tool_input: { file_path: answersPath(f.root), content: '{}\n' } }), encoding: 'utf8', env: process.env });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /answers\.jsonl/);
  } finally { f.done(); }
});

test('the pre-write check refuses a file over the cap in a workflow folder and names the evidence folder', () => {
  const f = fixture({ capMb: 0.001 });
  try {
    const hook = path.join(pluginRoot, 'hooks', 'pre-tool-use-all.mjs');
    const write = (file, content) => spawnSync(process.execPath, [hook], { input: JSON.stringify({ cwd: f.root, tool_name: 'Write', tool_input: { file_path: file, content } }), encoding: 'utf8', env: process.env });
    const big = write(path.join(f.dir, 'verify-evidence', 'api', 'run.log'), 'x'.repeat(4096));
    assert.equal(big.status, 2, big.stderr);
    assert.ok(big.stderr.includes(evidenceDir(f.root, 'demo')), big.stderr);
    const small = write(path.join(f.dir, 'verify-evidence', 'api', 'run.log'), 'ok\n');
    assert.equal(small.status, 0, small.stderr);
    const outside = write(path.join(f.root, 'big.log'), 'x'.repeat(4096));
    assert.equal(outside.status, 0, 'a file outside the workflow folders is not the records');
  } finally { f.done(); }
});

test('the cost ledger keeps one file a month, and the readers read every month and the old file', () => {
  const f = fixture();
  try {
    assert.equal(costFileName('2026-09-30T23:59:59Z'), 'cost-2026-09.jsonl');
    writeFileSync(path.join(f.dir, 'cost.jsonl'), `${row('2026-08-02T10:00:00Z', 1)}\n`);
    appendCostRow(f.dir, JSON.parse(row('2026-09-03T10:00:00Z', 2)));
    appendCostRow(f.dir, JSON.parse(row('2026-10-04T10:00:00Z', 3)));
    assert.deepEqual(costFiles(f.dir).map((p) => path.basename(p)), ['cost.jsonl', 'cost-2026-09.jsonl', 'cost-2026-10.jsonl']);
    assert.deepEqual(readCostRows(f.dir).map((r) => r.turn), [1, 2, 3]);
  } finally { f.done(); }
});

test('an old cost.jsonl splits into its months, keeps a torn line, runs again safely and goes only after the check', () => {
  const f = fixture();
  try {
    const old = path.join(f.dir, 'cost.jsonl');
    writeFileSync(old, [row('2026-09-01T10:00:00Z', 1), '{torn', row('2026-10-02T10:00:00Z', 2), row('2026-10-03T10:00:00Z', 3)].join('\n') + '\n');
    appendCostRow(f.dir, JSON.parse(row('2026-10-20T10:00:00Z', 9)));
    const r = splitCostLedger(f.dir);
    assert.equal(r.split, true, JSON.stringify(r));
    assert.deepEqual(r.months, { 'cost-2026-09.jsonl': 2, 'cost-2026-10.jsonl': 2 });
    assert.ok(!existsSync(old), 'the old file goes after every line is found in its month');
    assert.match(readFileSync(path.join(f.dir, 'cost-2026-09.jsonl'), 'utf8'), /\{torn/, 'a torn line goes with the line before it');
    assert.deepEqual(readCostRows(f.dir).map((x) => x.turn).sort(), [1, 2, 3, 9]);
    // A split that stopped before the remove adds no line twice.
    writeFileSync(old, `${row('2026-10-02T10:00:00Z', 2)}\n`);
    assert.equal(splitCostLedger(f.dir).split, true);
    assert.deepEqual(readCostRows(f.dir).map((x) => x.turn).sort(), [1, 2, 3, 9]);
    assert.equal(splitCostLedger(f.dir).split, false, 'nothing to split');
  } finally { f.done(); }
});

test('the sweep moves the run files and the files over the cap out of a workflow folder, and lists the evidence', () => {
  const f = fixture({ capMb: 0.001 });
  try {
    const clone = path.join(f.top, 'records', 'proj', 'demo');
    mkdirSync(path.join(clone, 'verify-evidence', 'api'), { recursive: true });
    mkdirSync(path.join(clone, '.draft'), { recursive: true });
    writeFileSync(path.join(clone, '.control.json'), '{"action":"stop"}\n');
    writeFileSync(path.join(clone, '.watch-state.json'), '{"version":1}\n');
    writeFileSync(path.join(clone, '.driver-outcome.json'), '{"run":"r1"}\n');
    writeFileSync(path.join(clone, '.api-log.jsonl'), '{"op":"a"}\n{"op":"b"}\n');
    writeFileSync(path.join(clone, 'steps.jsonl'), '{}\n');
    writeFileSync(path.join(clone, 'verify-evidence', 'api', 'trace.zip'), 'z'.repeat(4096));
    writeFileSync(path.join(clone, 'verify-evidence', 'api', 'shot.png'), 'small');
    writeFileSync(path.join(clone, '.draft', '04-plan.md'), 'd'.repeat(4096));
    writeFileSync(path.join(clone, 'cost.jsonl'), `${row('2026-10-02T10:00:00Z', 1)}\n`);
    const sha = sha256Of(path.join(clone, 'verify-evidence', 'api', 'trace.zip'));
    // A newer run file in the run folder already: a log takes the lines it lacks; a state file keeps both.
    mkdirSync(runDir(f.root, 'demo'), { recursive: true });
    writeFileSync(path.join(runDir(f.root, 'demo'), '.api-log.jsonl'), '{"op":"b"}\n{"op":"c"}\n');
    writeFileSync(path.join(runDir(f.root, 'demo'), '.watch-state.json'), '{"version":1,"newer":true}\n');

    const r = sweepRunFiles(f.root, 'demo', clone, { machine: 'dragon' });
    assert.deepEqual(r.moved.sort(), ['.api-log.jsonl', '.control.json', '.driver-outcome.json']);
    assert.deepEqual(r.kept, ['.watch-state.json'], 'a newer state file stays the newer; the old one is not deleted');
    assert.deepEqual(r.evidence, ['verify-evidence/api/trace.zip']);
    assert.equal(r.split.split, true);
    assert.deepEqual(readdirSync(clone).sort(), ['.draft', '.watch-state.json', 'cost-2026-10.jsonl', EVIDENCE_LOG, 'steps.jsonl', 'verify-evidence'].sort());
    assert.ok(existsSync(path.join(clone, 'verify-evidence', 'api', 'shot.png')), 'a small file stays');
    assert.ok(existsSync(path.join(clone, '.draft', '04-plan.md')), 'a draft stays');
    assert.equal(readFileSync(path.join(runDir(f.root, 'demo'), '.control.json'), 'utf8'), '{"action":"stop"}\n', 'the name and the bytes are kept');
    assert.deepEqual(readFileSync(path.join(runDir(f.root, 'demo'), '.api-log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).op), ['b', 'c', 'a']);
    const moved = path.join(evidenceDir(f.root, 'demo'), 'verify-evidence', 'api', 'trace.zip');
    assert.equal(sha256Of(moved), sha);
    const log = readEvidenceLog(clone);
    assert.equal(log.length, 1);
    assert.deepEqual({ ...log[0], at: null }, { path: '.ai/evidence/demo/verify-evidence/api/trace.zip', bytes: 4096, sha256: sha, machine: 'dragon', at: null });
    // A second sweep moves nothing and lists nothing twice; a new evidence file gets its line.
    writeFileSync(path.join(evidenceDir(f.root, 'demo'), 'video.webm'), 'v');
    const again = sweepRunFiles(f.root, 'demo', clone, { machine: 'dragon' });
    assert.deepEqual([again.moved, again.evidence], [[], []]);
    assert.deepEqual(readEvidenceLog(clone).map((e) => e.path), ['.ai/evidence/demo/verify-evidence/api/trace.zip', '.ai/evidence/demo/video.webm']);
    assert.deepEqual(noteEvidence(f.root, 'demo', clone), []);
  } finally { f.done(); }
});
