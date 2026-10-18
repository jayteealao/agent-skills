// WF-PROTOTYPE-PLAN W2/W3 — the pure side of /wf loop prototype (lib/prototype.mjs): the
// ledger rules the schema cannot express, the commit plan of a decide round, and the
// rolling report. The report has no script, loads nothing, stays under 1 MB, and shows
// a measured number differently from an estimated one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expand } from '../../../components/_components.mjs';
import {
  MAX_REPORT_BYTES, buildReport, commitPlan, ledgerProblems, openProofs, pathProblem, reportProblems,
} from '../../../lib/prototype.mjs';
import { validatePrototypeLedger } from '../../../lib/schema-validator.mjs';
import { ledger, proof } from '../../helpers/prototype-ledger.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const expandIn = (h) => expand(h, { componentsRoot: path.join(pluginRoot, 'components'), maxDepth: 4 });

test('a well-formed ledger passes the schema and the ledger rules', () => {
  const l = ledger();
  const s = validatePrototypeLedger(l);
  assert.equal(s.valid, true, JSON.stringify(s.errors));
  assert.deepEqual(ledgerProblems(l), []);
});

test('the schema requires the person\'s words on every round and every decision', () => {
  const l = ledger();
  delete l.rounds[0].request;
  assert.equal(validatePrototypeLedger(l).valid, false, 'a round with no request: only the person starts a round');
  const m = ledger();
  delete m.decisions[0].words;
  assert.equal(validatePrototypeLedger(m).valid, false, 'a decision with no words of the person');
  const n = ledger();
  n.proofs[0].evidence = { measured: [] };
  assert.equal(validatePrototypeLedger(n).valid, false, 'measured and estimated are separate fields, both present');
});

test('the ledger rules: references, decide-only acceptance, generalize, and paths inside the worktree', () => {
  const l = ledger();
  l.decisions.push({ id: 'D-02', round: 'R-01', component: 'aging', proofs: ['P-02'], generalized: false, words: 'ok' });
  l.rounds[0].proofs.push('P-99');
  l.proofs[0].files.push('C:/Users/x/AppData/Local/Temp/run.py', '../main-checkout/file.py');
  l.decisions[0]['generalize-proof'] = 'P-01';
  const problems = ledgerProblems(l).join('\n');
  assert.match(problems, /decision D-02: only a decide round accepts a component/);
  assert.match(problems, /round R-01: names proof P-99/);
  assert.match(problems, /an absolute path/);
  assert.match(problems, /outside the worktree/);
  assert.match(problems, /proof P-01 is not from a generalize round/);
  const talk = ledger();
  talk.rounds.push({ id: 'R-04', kind: 'talk', request: 'Would this work in Rust?', question: 'Rust?', proofs: ['P-01'] });
  assert.match(ledgerProblems(talk).join('\n'), /a talk round runs no proof/);
  const noDecision = ledger();
  noDecision.decisions = [];
  noDecision.pipeline = [];
  assert.match(ledgerProblems(noDecision).join('\n'), /a decide round records a decision/);
  assert.equal(pathProblem('poc/a.py'), null);
});

test('the commit plan: explicit paths, no scratch, the records, and the generalize warning', () => {
  const l = ledger();
  const plan = commitPlan(l, 'D-01', '.ai/workflows/faces');
  assert.deepEqual(plan.paths, ['poc/P-01.py', 'poc/config.json', '.ai/workflows/faces/00-index.md', '.ai/workflows/faces/prototype-ledger.json', '.ai/workflows/faces/01-prototype.md', '.ai/workflows/faces/report.html']);
  assert.equal(plan.message, 'poc(faces): accept the stage 1 fit');
  assert.equal(plan.warning, null);
  l.decisions[0].proofs.push('P-02');
  l.decisions[0].generalized = false;
  const p2 = commitPlan(l, 'D-01', '.ai/workflows/faces');
  assert.deepEqual(p2.skipped, ['.scratch/prototype/tmp.png'], 'scratch never enters a commit');
  assert.match(p2.warning, /without a generalize check/);
  l.decisions[0].commit = 'abc';
  assert.match(commitPlan(l, 'D-01', '.ai/workflows/faces').error, /already committed/);
});

test('open proofs: unresolved and mixed, not closed by a decision or a rejected path', () => {
  const l = ledger();
  assert.deepEqual(openProofs(l).map((p) => p.id), ['P-02']);
  l.rejected.push({ path: 'aging by prompt', reason: 'identity drift', proofs: ['P-02'] });
  assert.deepEqual(openProofs(l), []);
});

test('the report: the four parts in order, no script, no external load, measured and estimated apart', () => {
  const l = ledger();
  const html = buildReport(l, { expand: expandIn, doc: '# Fit\n\nThe fit runs first.' });
  const { bytes, problems } = reportProblems(html);
  assert.deepEqual(problems, []);
  assert.ok(bytes < MAX_REPORT_BYTES);
  const at = (s) => html.indexOf(s);
  assert.ok(at('The accepted pipeline</h2>') < at('The latest round</h2>'));
  assert.ok(at('The latest round</h2>') < at('Every proof</h2>'));
  assert.ok(at('Every proof</h2>') < at('Rejected and unresolved paths</h2>'));
  assert.ok(at('id="P-03"') < at('id="P-01"'), 'every proof, newest first');
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /class="meas"[^>]*>3\.2 s/);
  assert.match(html, /class="est"[^>]*>≈ 0\.02 USD/);
  assert.match(html, /xpl-sequence/, 'the pipeline diagram comes from the explainer snippet');
  assert.match(html, /Unresolved, not promoted: <a href="#P-02">/);
  assert.match(html, /prefers-color-scheme:dark/);
});

test('the report refuses a page that breaks the delivery rules', () => {
  assert.match(reportProblems('<html><script>x</script></html>').problems.join(), /script/);
  assert.match(reportProblems('<img src="https://cdn.example/x.png">').problems.join(), /external resource/);
  assert.match(reportProblems(`<p>${'x'.repeat(MAX_REPORT_BYTES + 1)}</p>`).problems.join(), /over 1000000/);
  const html = buildReport(ledger(), { mediaFor: () => ({ exists: true, dataUri: 'data:image/png;base64,AAAA' }) });
  assert.deepEqual(reportProblems(html).problems.filter((p) => !/unexpanded/.test(p)), [], 'a data URI is embedded, not loaded');
});
