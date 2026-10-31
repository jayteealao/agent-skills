// Fewer questions to the person and faster checks. The rules live in the stage references and in
// the driver prompts, so these tests pin the words that carry each rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ref = (...p) => readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', ...p), 'utf8');
const yolo = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');

test('a delegate run accepts a verify item that still fails, and stops only for four causes', () => {
  assert.match(yolo, /DELEGATE ACCEPT \(this is the last verify round of a delegate run\)/);
  assert.match(yolo, /--key verify-accept:\$\{s\}:<item>/);
  assert.match(yolo, /--dimensions ` \+\s+`residual\\`, so the review tries to fix it/);
  assert.match(yolo, /stage === 'verify' && DELEGATE && \(extra\.round \|\| 1\) >= 2 \? delegateAcceptClause/);
  assert.match(yolo, /spend one bounded round on finding the cause/);
  const y = ref('yolo.md');
  assert.match(y, /\| Gate \| Auto-resolve \| HARD-STOP \| In delegate mode \|/);
  assert.match(y, /A delegate run stops only for these four causes/);
  assert.match(y, /Accepted verify items: /);
});

test('the watching session reports a delegate decision in chat and does not ask', () => {
  for (const text of [ref('yolo.md'), ref('yolo', '_commentary.md')]) {
    assert.match(text, /Do not ask the person about a delegate decision/);
    assert.match(text, /"I'm back"[^.]*does not end/);
  }
  assert.match(ref('yolo.md'), /The `run-decisions` steer is the only state/);
});

test('verify accepts an item that a live decision already settles', () => {
  assert.match(yolo, /SETTLED ITEMS\. Before you fix or report a failing acceptance criterion/);
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

test('a risk stops only a decision that goes against it; a doubtful decision that can be undone is settled', () => {
  assert.match(ref('_decision-classes.md'), /1\. \*\*Goes against a ledgered RIM\*\*/);
  assert.doesNotMatch(ref('_decision-classes.md'), /resolves, narrows, or depends on/);
  assert.match(ref('plan.md'), /A decision that goes against a `carried` intent-risk is intent-bearing/);
  assert.match(ref('implement.md'), /A build decision that goes against a `carried` intent-risk is intent-bearing/);
  assert.match(yolo, /stamp it \\`implementation-detail\\` with ` \+\s+`contested: true/);
  assert.doesNotMatch(yolo, /stamp it \\`intent-bearing\\` and return it as a question — that is the safe direction/);
  assert.match(ref('_decision-classes.md'), /\*\*A reservation needs the person's words\.\*\*/);
  assert.match(ref('yolo.md'), /Contested decisions: /);
});

test('a list of items is one chat list and one question', () => {
  const y = ref('yolo.md');
  assert.match(y, /"Reverse any of these\?"/);
  assert.match(y, /"None, keep them all \(Recommended\)"/);
  const c = ref('campaign.md');
  assert.match(c, /Then ask one question: "Approve all \(Recommended\)" or "Fix some"/);
  assert.doesNotMatch(c, /up to four rows per batch/);
  assert.match(c, /Step 0\.5 does not ask the run-decisions question: step 2 asked it once for this call/);
  assert.match(y, /Ask only when the store of the workflow holds no `run-decisions` steer/);
  const skill = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'SKILL.md'), 'utf8');
  assert.match(skill, /"Close all \(Recommended\)" or "Go through them one by one"/);
  assert.match(skill, /"Apply each recommendation \(Recommended\)" or "Go through them one by one"/);
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
  for (const [name, text] of [['setup.md', ref('setup.md')], ['intake/default.md', ref('intake', 'default.md')], ['shape.md', ref('shape.md')], ['campaign.md', ref('campaign.md')]]) {
    assert.match(text, /_check-budget\.md/, `${name} asks the budget question when there is no budget`);
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

// yolo.js is a Workflow script, not a module: take each pure function by its braces.
function extractFn(src, name) {
  const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(src);
  assert.ok(m, `no function ${name}`);
  let depth = 0;
  for (let j = src.indexOf('{', m.index); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error(`unbalanced ${name}`);
}
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
