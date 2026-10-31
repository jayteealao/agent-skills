// Fewer questions to the person and faster checks. The rules live in the stage references and in
// the driver prompts, so these tests pin the words that carry each rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractFn } from '../../helpers/extract-fn.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ref = (...p) => readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', ...p), 'utf8');
const yolo = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');

// The prompt clauses of the driver, built with stub globals, so each test reads the text an agent gets.
const constSrc = (name) => {
  const at = yolo.indexOf(`const ${name} =`);
  assert.ok(at >= 0, `no const ${name}`);
  return yolo.slice(at, yolo.indexOf('\n\n', at));
};
const { sameQuestionClause, settledItemsClause, delegateAcceptClause, DECISION_CONTRACT } = new Function(`
  const projectRoot = '/r', slug = 'demo', referenceRoot = '/ref', WF_CMD = 'wf', DRAFT_DIR = '/r/.draft'
  ${['sameQuestionClause', 'settledItemsClause', 'delegateAcceptClause'].map((n) => extractFn(yolo, n)).join('\n')}
  ${constSrc('DECISION_CONTRACT')}
  return { sameQuestionClause, settledItemsClause, delegateAcceptClause, DECISION_CONTRACT }`)();

test('a delegate run accepts a verify item that still fails, and stops only where the delegate column names a stop', () => {
  const last = delegateAcceptClause('auth');
  assert.match(last, /^\n\nDELEGATE ACCEPT \(this is the last verify round of a delegate run\)\. When an item still fails/);
  assert.match(last, /`wf decide add "\/r" demo --kind answer --by delegate --key verify-accept:auth:<item> --question "<the item>" --answer "accept, carried to the review" --stage verify --slice auth`/);
  assert.match(last, /`wf findings add "\/r" demo \/r\/\.draft\/residual-auth\.json --source review --slice auth --dimensions residual`, so the review tries to fix it/);
  assert.match(last, /spend one bounded round on finding the cause/);
  assert.match(last, /terminal\.acceptedItems as \{ item, by: 'delegate' \}, set substantiveResidual: false/);
  const self = delegateAcceptClause('auth', 'on your second verify round, in a delegate run');
  assert.match(self, /^\n\nDELEGATE ACCEPT \(on your second verify round, in a delegate run\)\. When an item still fails/);
  assert.equal(self.replace('on your second verify round, in a delegate run', 'this is the last verify round of a delegate run'), last, 'only the round differs');
  const slugWide = delegateAcceptClause(null);
  assert.match(slugWide, /--key verify-accept:demo:<item>/);
  assert.match(slugWide, /\/r\/\.draft\/residual-demo\.json --source review --dimensions residual/);
  assert.doesNotMatch(slugWide, /--slice/);
  // The verify agent gets the clause from its second round; the self verify of an implement names its round.
  assert.match(yolo, /stage === 'verify' && DELEGATE && \(extra\.round \|\| 1\) >= 2 \? delegateAcceptClause\(sliceArg\)/);
  assert.match(yolo, /delegateAcceptClause\(sliceArg, 'on your second verify round, in a delegate run'\)/);
  const y = ref('yolo.md');
  assert.match(y, /\| Gate \| Auto-resolve \| HARD-STOP \| In delegate mode \|/);
  // The table owns the delegate stops: the card keeps no separate list of causes.
  assert.match(y, /a delegate run stops only where that column names a stop/);
  assert.doesNotMatch(y, /A delegate run stops only for these four causes/);
  assert.match(y, /Accepted verify items: /);
});

test('the watching session reports a delegate decision in chat and does not ask', () => {
  // The commentary card owns the four rules; yolo.md cites it and keeps no copy.
  const c = ref('yolo', '_commentary.md');
  assert.match(c, /Do not ask the person about a delegate decision/);
  assert.match(c, /"I'm back", or any other sign that the person is present, does not end it/);
  assert.match(c, /Then record the new `run-decisions` steer/);
  assert.match(c, /the `run-decisions` steer is the only state/);
  const y = ref('yolo.md');
  assert.match(y, /\*\*While a delegate run is live, report and do not ask\*\*, per "A delegate run" of \[yolo\/_commentary\.md\]/);
  assert.doesNotMatch(y, /Do not ask the person about a delegate decision/);
  assert.doesNotMatch(y, /"I'm back"/);
});

test('verify accepts an item that a live decision already settles', () => {
  const s = settledItemsClause('auth');
  assert.match(s, /^\n\nSETTLED ITEMS\. Before you fix or report a failing acceptance criterion or residual item, run `wf decide list "\/r" demo --slice auth --json`\./);
  assert.match(s, /accept the item: do not fix it, do not stop on it, and do not ask about it/);
  assert.match(s, /Return it in terminal\.acceptedItems as \{ item, by: <that decision's id> \}, and do not count it in substantiveResidual/);
  assert.match(settledItemsClause(null), /run `wf decide list "\/r" demo --json`/);
  assert.match(yolo, /\(stage === 'verify' \? settledItemsClause\(sliceArg\) : ''\)/);
  assert.match(ref('verify.md'), /Write `accepted-by: <that decision's id>`, `accepted-at` and `accepted-items` in the frontmatter/);
  assert.match(ref('verify', '_artifact.md'), /^accepted-by: /m);
});

test('a standing answer settles each later question of its kind, and every brief looks before it asks', () => {
  assert.match(ref('_question-craft.md'), /8\. \*\*Offer a standing option for a question that can come again\.\*\*/);
  assert.match(ref('_question-craft.md'), /decide add --kind steer --key standing:<kind>/);
  assert.match(ref('_decision-classes.md'), /\*\*A standing answer settles a named kind\.\*\*/);
  // The brief owns the lookup: its Decisions carry the keys and the rule; the stage cards hold no copy.
  const brief = readFileSync(path.join(pluginRoot, 'lib', 'brief.mjs'), 'utf8');
  assert.equal(brief.split('record the case with `--by standing:<id>` of that entry').length, 2);
  for (const name of ['plan.md', 'implement.md', 'verify.md', 'review.md']) {
    assert.doesNotMatch(ref(name), /Before you return or ask a question, run `wf\.mjs decide list --kind steer`/, `${name} holds no copy of the lookup`);
  }
  assert.match(ref('yolo.md'), /Settled by a standing answer: /);
});

test('the decision store owns the scope of an answer and the never-ask-again rule', () => {
  const d = ref('_decisions.md');
  assert.match(d, /The stage either \(a\) shows that the requirement is still met another way, or \(b\) asks the person a follow-up question/);
  const q = ref('_question-craft.md');
  assert.match(q, /\*\*Scope of authority\.\*\* A PO answer decides only the question it was asked: apply rule 4 of \[_decisions\.md\]/);
  assert.match(q, /\*\*Never ask a decided question again\.\*\* Before a question, apply rule 2 of \[_decisions\.md\]/);
  assert.doesNotMatch(q, /\(a\) show\s+the requirement is still met/);
  assert.doesNotMatch(q, /Ask again only when a fact changed/);
});

test('the chat return card owns the omit rules and the Deltas line', () => {
  const r = ref('_chat-return.md');
  assert.match(r, /Omit the narrative only for a read-only run with nothing to narrate/);
  assert.match(r, /it sits between the narrative and the `Artifacts:` line of the `SKILL\.md` Step 2 template/);
  const skill = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'SKILL.md'), 'utf8');
  assert.match(skill, /^Deltas: <per _chat-return\.md>$/m);
  assert.match(skill, /decide when to omit each, per \[_chat-return\.md\]\(reference\/_chat-return\.md\)/);
  assert.doesNotMatch(skill, /Omit it only for a read-only run/);
  assert.match(ref('_output-boundary.md'), /is an internal audience, per\s+\[_chat-return\.md\]\(_chat-return\.md\)/);
});

test('a risk stops only a decision that goes against it; a doubtful decision that can be undone is settled', () => {
  assert.match(ref('_decision-classes.md'), /1\. \*\*Goes against a ledgered RIM\*\*/);
  assert.doesNotMatch(ref('_decision-classes.md'), /resolves, narrows, or depends on/);
  // _decision-classes.md owns the risk rule and the reservation rule; plan and implement cite them.
  assert.equal(ref('_decision-classes.md').split('that is still `open` or `carried`').length, 2, 'the owner states the risk rule once');
  assert.match(ref('plan.md'), /\*\*A planning decision that goes against an intent-risk is intent-bearing\*\*, per rule 1 of \[_decision-classes\.md\]/);
  assert.match(ref('implement.md'), /\*\*A build decision that goes against an intent-risk is intent-bearing\*\*, per rule 1 of \[_decision-classes\.md\]/);
  for (const name of ['plan.md', 'implement.md']) {
    assert.match(ref(name), /reserves a decision for the person only as \[_decision-classes\.md\]\(_decision-classes\.md\) "A reservation needs the person's words" says/, name);
    assert.doesNotMatch(ref(name), /or removes the protection that the risk names/, `${name} holds no copy of the risk rule`);
    assert.doesNotMatch(ref(name), /A reservation without that id is an implementation-detail decision/, `${name} holds no copy of the reservation rule`);
  }
  assert.match(DECISION_CONTRACT, /per \/ref\/_decision-classes\.md/);
  assert.match(DECISION_CONTRACT, /settle it by your recommended option, stamp it `implementation-detail` with contested: true, and continue: the hand-back lists it/);
  assert.match(DECISION_CONTRACT, /Only a doubtful decision that cannot be undone inside the packet is `intent-bearing` and a question/);
  assert.doesNotMatch(DECISION_CONTRACT, /that is the safe direction/);
  assert.match(ref('_decision-classes.md'), /\*\*A reservation needs the person's words\.\*\*/);
  assert.match(ref('yolo.md'), /Contested decisions: /);
});

test('a list of items is one chat list and one question', () => {
  // _gate-question.md owns the rule; each site cites it and gives its own labels.
  assert.match(ref('_gate-question.md'), /^## A list of items$/m);
  const cite = /per "A list of items" of \[_gate-question\.md\]/;
  const y = ref('yolo.md');
  assert.match(y, cite);
  assert.match(y, /"Reverse any of these\?"/);
  assert.match(y, /"None, keep them all \(Recommended\)"/);
  const c = ref('campaign.md');
  assert.match(c, cite);
  assert.doesNotMatch(c, /A list of items is one chat list and one question, not one question per item/);
  assert.match(c, /Then ask one question: "Approve all \(Recommended\)" or "Fix some"/);
  assert.doesNotMatch(c, /up to four rows per batch/);
  const skill = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'SKILL.md'), 'utf8');
  assert.match(skill, /per "A list of items" of \[_gate-question\.md\]\(reference\/_gate-question\.md\): "Close all \(Recommended\)" or "Go through them one by one"/);
  assert.match(ref('_records-repo.md'), /per "A list of items" of \[_gate-question\.md\]\(_gate-question\.md\): "Apply each recommendation \(Recommended\)" or "Go through them one by one"/);
  assert.doesNotMatch(ref('setup.md'), /"Apply each recommendation \(Recommended\)"/, 'setup keeps no copy of the conflict question');
});

test('the run-decisions question is asked only when the store holds no answer', () => {
  // The store check of yolo.md Step 0.5 covers a relaunch and a campaign launch; no site restates it.
  const y = ref('yolo.md');
  assert.match(y, /Ask only when the store of the workflow holds no `run-decisions` steer/);
  assert.doesNotMatch(y, /A relaunch after a hand-back does not ask again/);
  assert.doesNotMatch(y, /The campaign walk asks this question once per call/);
  const c = ref('campaign.md');
  assert.doesNotMatch(c, /Step 0\.5 does not ask the run-decisions question/);
  assert.match(c, /record it in the work packet's workflow with `decide add --kind steer --key run-decisions`/);
});

test('the shape floor asks check cost, meaning and consequences before assumptions', () => {
  const s = ref('shape.md');
  const order = ['**The check cost of this work**', '**Meaning.**', '**Consequences of earlier answers**', '**Assumptions, last.**'].map((t) => s.indexOf(t));
  assert.ok(order.every((i) => i > 0), 'each theme of the floor filler is there');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'the themes come in order');
  assert.match(s, /\*\*Round 6 — How do we know, and how long may it take\?\*\*/);
  assert.match(s, /After Round 6,/);
  assert.match(ref('intake', 'brainstorm', '_work.md'), /\| `measures` \|/);
});

test('the check budget is asked once per repo, with the options and why', () => {
  const b = ref('_check-budget.md');
  assert.match(b, /\*\*Fast loop \(Recommended\)\.\*\* Slice checks under 2 min/);
  assert.match(b, /\*\*Balanced\.\*\*/);
  assert.match(b, /\*\*Thorough\.\*\*/);
  assert.match(b, /The budget decides whether an agent waits on a check or moves it to a later point/);
  // _check-budget.md "When to ask" owns the condition; each site cites it once and says where the question sits.
  assert.match(b, /^## When to ask$/m);
  assert.match(b, /Ask the budget question when `profile budget` prints `no budget`/);
  for (const [name, text] of [['setup.md', ref('setup.md')], ['intake/default.md', ref('intake', 'default.md')], ['shape.md', ref('shape.md')], ['campaign.md', ref('campaign.md')]]) {
    assert.match(text, /_check-budget\.md/, `${name} names the budget card`);
    assert.match(text, /when "When to ask" of (?:\[_check-budget\.md\]\(_check-budget\.md\)|that file) says to ask it/, `${name} cites the condition`);
    assert.doesNotMatch(text, /prints `no budget`/, `${name} keeps no copy of the condition`);
  }
});

test('long runs: measure first, check validity, the fastest valid path, in the background, never a slice step', () => {
  const l = ref('_long-runs.md');
  for (const h of ['## L1 — Measure first', '## L2 — Check that the result will still be valid', '## L3 — Take the fastest path that gives a valid answer', '## L4 — Run in the background', '## L5 — A long run is never a slice step']) {
    assert.ok(l.includes(h), h);
  }
  assert.match(l, /Do not wait in a `sleep` loop/);
  // _long-runs.md owns the rules. The stage cards cite it and keep no copy of the summary.
  const fullCopy = /measure it first with a pilot, check that a later change does not make its result stale, take the fastest path/;
  assert.match(ref('plan.md'), /A long run is never a slice step \(\[_long-runs\.md\]\(_long-runs\.md\) L5\)/);
  for (const name of ['implement.md', 'verify.md']) {
    assert.match(ref(name), /A long run is never a slice step \(`_long-runs\.md` L5\): record it under `## Packet Checks`\./, name);
    assert.doesNotMatch(ref(name), /run it in the background/, name);
  }
  for (const name of ['plan.md', 'implement.md', 'verify.md']) assert.doesNotMatch(ref(name), fullCopy, name);
  assert.match(ref('review.md'), /Follow \[_long-runs\.md\]\(_long-runs\.md\)/);
});

test('an option that runs a check states its time, and the recommendation is the fastest valid path', () => {
  const q = ref('_question-craft.md');
  assert.match(q, /9\. \*\*State the time of a check\.\*\*/);
  assert.match(q, /10\. \*\*Recommend the fastest valid path\.\*\*/);
  assert.match(q, /the options include at least one\s+faster path of \[_long-runs\.md\]\(_long-runs\.md\) L3\./);
  assert.doesNotMatch(q, /a pilot, a split across\s+machines, a sample/);
});

test('the verify sub-agents run no whole unit suite, no base build and no sibling suite', () => {
  const v = ref('verify', '_sub-agents.md');
  assert.doesNotMatch(v, /run the full unit suite/);
  assert.doesNotMatch(v, /Default performance gate \(every slice/);
  assert.match(v, /\*\*Performance gate \(only with the `benchmark` augmentation or a performance acceptance criterion\)\.\*\*/);
  assert.match(v, /Run an integration suite only when the `affected` suite of the test profile names it/);
  assert.match(v, /Do not start a coverage pass in verify/);
  assert.match(v, /Do not run the suites of other slices again/);
  assert.doesNotMatch(v, /Cross-slice regression check/);
});

test('a stage looks up a live answer by its key before it asks', () => {
  assert.equal(sameQuestionClause(), 'Before you ask, run `wf decide answered "/r" demo --key <key>`: a live answer settles it. ');
});

// yolo.js is a Workflow script, not a module: take each pure function by its braces.
const { verifyClean, decisionDigest, acceptedResiduals } = new Function(
  ['stageResults', 'personAccepted', 'verifyClean', 'decisionDigest', 'acceptedResiduals'].map((n) => extractFn(yolo, n)).join('\n') +
  '\nreturn { verifyClean, decisionDigest, acceptedResiduals };',
)();

test('verifyClean: an item that a live decision accepts is cleared, whatever its kind', () => {
  const missed = { convergence: 'escalated', result: 'partial', substantiveResidual: true };
  assert.equal(verifyClean(missed, []), false, 'a missed timing criterion stops without an accept');
  const accepted = { convergence: 'escalated', result: 'partial', substantiveResidual: false, acceptedItems: [{ item: 'AC-41', by: 'D-100' }] };
  assert.equal(verifyClean(accepted, []), true, 'a decision of the person accepts it');
  assert.equal(verifyClean({ ...accepted, acceptedItems: [{ item: 'AC-41', by: 'delegate' }] }, []), true, 'a delegate accept');
  assert.equal(verifyClean({ ...accepted, result: 'fail' }, []), true);
  assert.equal(verifyClean({ ...accepted, substantiveResidual: true }, []), false, 'an item outside the accepted list still stops');
  assert.equal(verifyClean({ ...accepted, result: 'blocked-runtime-evidence-missing' }, []), false, 'missing evidence is never accepted');
  assert.equal(verifyClean({ ...accepted, acceptedItems: [] }, []), false);
});

test('the hand-back lists the accepted verify items and the contested decisions', () => {
  const o = { results: [{ ran: [
    { stage: 'verify', slice: 'speed', terminal: { acceptedItems: [{ item: 'AC-41', by: 'D-100' }] }, decisions: [{ class: 'implementation-detail', decision: 'cache the table', contested: true }] },
    { stage: 'plan', slice: 'ui', decisions: [{ class: 'implementation-detail', decision: 'name the file' }] },
  ] }] };
  assert.deepEqual(acceptedResiduals(o), [{ slice: 'speed', item: 'AC-41', by: 'D-100' }]);
  assert.deepEqual(decisionDigest(o).contested, [{ slice: 'speed', stage: 'verify', decision: 'cache the table' }]);
});
