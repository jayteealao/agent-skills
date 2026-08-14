// Guard tests for the Claude 5 prompting repair (CLAUDE5-PROMPTING-REPAIR-PLAN.md).
// Each wave's acceptance line pins a greppable invariant so a later edit cannot
// silently reintroduce the repaired defect class.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const refRoot = path.join(pluginRoot, 'skills', 'wf', 'reference');
const read = (...p) => readFileSync(path.join(refRoot, ...p), 'utf8');
const yoloSrc = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');

// Every .md under reference/ (recursive), path-relative to reference/.
function mdFiles(dir = refRoot) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...mdFiles(full));
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

// --- W0: shared fragments exist and are single-source -----------------------
test('W0: autonomy fragments exist', () => {
  assert.ok(existsSync(path.join(refRoot, '_grounded-progress.md')));
  assert.ok(existsSync(path.join(refRoot, '_autonomy-guards.md')));
});

test('W0: the grounded-progress rule body lives in exactly one reference file', () => {
  const phrase = 'audit each claim against a tool result';
  const holders = mdFiles().filter((f) => readFileSync(f, 'utf8').includes(phrase));
  assert.deepEqual(
    holders.map((f) => path.basename(f)),
    ['_grounded-progress.md'],
    `rule body pasted into: ${holders.join(', ')}`
  );
});

// --- W1: grounded progress wired at the gaps --------------------------------
test('W1: runStage carries the grounded-progress pointer', () => {
  assert.match(yoloSrc, /GROUNDED PROGRESS \(\$\{referenceRoot\}\/_grounded-progress\.md\)/);
});

test('W1: auto/implement/retro reference the fragment', () => {
  for (const f of ['auto.md', 'implement.md', 'retro.md']) {
    assert.ok(read(f).includes('_grounded-progress.md'), `${f} lacks the reference`);
  }
});

test('W1: logging and observability rubrics carry the evidence non-negotiable', () => {
  for (const f of ['logging.md', 'observability.md']) {
    assert.match(read('review', f), /NON-NEGOTIABLES/i, `${f} lacks NON-NEGOTIABLES`);
  }
});

// --- W2: fan-outs on by default, single-writer index ------------------------
test('W2: yolo review fan-out defaults on (opt-out only)', () => {
  assert.match(yoloSrc, /OPT\.reviewFanout === false/);
  assert.ok(!/OPT\.reviewFanout !== true/.test(yoloSrc));
});

test('W2: yolo plan fan-out defaults on with single-writer index assembly', () => {
  assert.match(yoloSrc, /OPT\.planFanout !== false/);
  assert.match(yoloSrc, /noIndexWrites: true/);
  assert.match(yoloSrc, /INDEX WRITES WITHHELD/);
  assert.match(yoloSrc, /PLAN FAN-OUT BOOKKEEPING/);
});

test('W2: no serial loop remains over independent fix dispatch', () => {
  for (const f of ['verify.md', 'implement.md', path.join('review', '_stage.md')]) {
    const s = read(f);
    assert.ok(!s.includes('sequentially (one at a time)'), `${f} still dispatches serially`);
  }
});

// --- W3: safety bugs stay fixed ----------------------------------------------
test('W3: verify.md contains no git stash command', () => {
  assert.ok(!/git stash/.test(read('verify.md')));
});

test('W3: implement.md forbids sweep staging by name', () => {
  const s = read('implement.md');
  assert.ok(s.includes('`git add -A`'), 'missing git add -A ban');
  assert.ok(!/Stage ALL changed files/i.test(s), 'unqualified stage-all survives');
});

test('W3: ship step 10.3 base push is gated', () => {
  const s = read('ship.md');
  const step = s.slice(s.indexOf('10.3 Push:'));
  assert.match(step.slice(0, 500), /gated|requires the user/i);
  assert.match(s, /Post-release base push/);
});

test('W3: the design ban list has exactly one source', () => {
  const designDir = path.join(refRoot, 'design');
  const holders = readdirSync(designDir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => /##\s+Absolute bans/i.test(readFileSync(path.join(designDir, f), 'utf8')));
  assert.deepEqual(holders, ['_design-context.md'], `ban blocks in: ${holders.join(', ')}`);
});

test('W3: no rubric carries the dead .claude/<SESSION_SLUG> output path', () => {
  const reviewDir = path.join(refRoot, 'review');
  for (const f of readdirSync(reviewDir).filter((f) => f.endsWith('.md'))) {
    const s = readFileSync(path.join(reviewDir, f), 'utf8');
    assert.ok(!s.includes('.claude/<SESSION_SLUG>'), `${f} still names the legacy path`);
  }
});

// --- W4/W6: over-prescription boilerplate stays dead -------------------------
test('W4/W6: no "exactly in order" boilerplate remains under reference/', () => {
  const hits = mdFiles().filter((f) => readFileSync(f, 'utf8').includes('exactly in order'));
  assert.deepEqual(hits, [], `boilerplate back in: ${hits.join(', ')}`);
});

// --- W5: overwrite permission questions stay deleted --------------------------
test('W5: no re-run overwrite "Proceed?" question remains', () => {
  const hits = mdFiles().filter((f) =>
    /Running again will overwrite\.? Proceed\?/.test(readFileSync(f, 'utf8'))
  );
  assert.deepEqual(hits, [], `overwrite gate back in: ${hits.join(', ')}`);
});

// --- W6: yolo deferral law is a pointer, not a second copy -------------------
test('W6: yolo.js POLICY points at verify.md law instead of restating the ladder', () => {
  assert.ok(!/CLIMB THE LADDER FIRST/.test(yoloSrc), 'ladder restatement is back');
  assert.match(yoloSrc, /deferral law[\s\S]{0,120}single normative statement/);
});
