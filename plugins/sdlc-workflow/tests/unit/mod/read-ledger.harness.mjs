// The pure parts of the mod's read check (hooks/mod/readledger.ts), run under
// `node --experimental-strip-types --test`. The wrapper
// tests/unit/mod/read-ledger-mod.test.mjs spawns this file; run-all.mjs never
// runs it directly (no `.test.mjs` suffix). The hook wiring is covered by the
// kit tests in hooks/mod/tests/readcheck.test.ts (`claude plugin test .`).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAIN_AGENT, READ_LEDGER_FILE, agentKeyOf, appendedTextOf, checkReads, classifyPath, contextTextOf, coverageOf, coversSpan, fedCovers,
  isExcludedWrite, ledgerLineOf, matchWrite, mergeRanges, patternOf, preferredStagesOf, promptFedOf, readCheckModeOf, recordRead,
  readMarkOf, requiredOf, sectionSpansOf, waiverOf, writerStagesOf, writtenTextOf,
} from '../../../hooks/mod/readledger.ts';

const PLAN = {
  reference: 'plan.md',
  stage: 'plan',
  rows: [
    { input: '00-index.md', kind: 'artifact', when: 'always', sections: [] },
    { input: '02-shape.md', kind: 'artifact', when: 'always', sections: ['Acceptance Criteria', 'Out of Scope'] },
    { input: 'po-answers.md', kind: 'artifact', when: 'if-present', sections: [] },
    { input: '03-slice-<slice>.md', kind: 'artifact', when: 'always', sections: [] },
    { input: 'steer.md', kind: 'artifact', when: 'on-resume', sections: [] },
    { input: 'review-ledger', kind: 'artifact', when: 'mode:reviews', sections: [] },
    { input: '/.ai/ship-plan.md', kind: 'artifact', when: 'if-present', sections: [] },
    { input: 'plan/_artifact.md', kind: 'procedure', when: 'always', sections: [] },
    { input: '04-plan-<slice>.md', kind: 'writes', when: '', sections: [] },
  ],
};
const INTAKE_FIX = {
  reference: 'intake/fix.md',
  stage: 'intake:fix',
  rows: [
    { input: '01-<mode>.md', kind: 'artifact', when: 'always', sections: [] },
    { input: '02-shape.md', kind: 'writes', when: '', sections: [] },
  ],
};
const SHAPE = { reference: 'shape.md', stage: 'shape', rows: [{ input: '01-intake.md', kind: 'artifact', when: 'always', sections: [] }, { input: '02-shape.md', kind: 'writes', when: '', sections: [] }] };
const REVIEW = { reference: 'review.md', stage: 'review', rows: [{ input: '07-review-*.yaml', kind: 'artifact', when: 'always', sections: [] }, { input: '07-review-<slice>.md', kind: 'writes', when: '', sections: [] }] };

const SHAPE_TEXT = '---\ntitle: x\n---\n# Shape\n\n## Acceptance Criteria\n\n- one\n\n## Edge Cases\n\n- e\n\n## Out of Scope\n\n- none\n```\n## Fake\n```\n';

function io(files) {
  return {
    exists: async (path) => path in files,
    read: async (path) => files[path] ?? null,
    list: async (dir) => Object.keys(files).filter((path) => path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/')).map((path) => path.slice(dir.length + 1)),
  };
}

test('agentKeyOf and readCheckModeOf fill their defaults', () => {
  assert.equal(agentKeyOf(undefined), MAIN_AGENT);
  assert.equal(agentKeyOf('a1'), 'a1');
  assert.equal(readCheckModeOf('block'), 'block');
  assert.equal(readCheckModeOf('off'), 'off');
  assert.equal(readCheckModeOf('loud'), 'warn');
  assert.equal(readCheckModeOf(undefined), 'warn');
});

test('classifyPath: workflow artifacts, procedure files anywhere, project files under the root, else null', () => {
  assert.deepEqual(classifyPath('C:\\work\\.ai\\workflows\\alpha\\02-shape.md'), { kind: 'artifact', slug: 'alpha', file: '02-shape.md', id: 'wf:alpha/02-shape.md' });
  assert.deepEqual(classifyPath('/work/.ai/workflows/alpha/history/04-plan-a.md'), { kind: 'artifact', slug: 'alpha', file: 'history/04-plan-a.md', id: 'wf:alpha/history/04-plan-a.md' });
  assert.equal(classifyPath('/work/.ai/workflows/INDEX.md'), null);
  assert.deepEqual(classifyPath('/home/u/.claude/plugins/cache/x/sdlc-workflow/9.1.0/skills/wf/reference/plan/_artifact.md'), { kind: 'procedure', rel: 'plan/_artifact.md', id: 'ref:plan/_artifact.md' });
  assert.deepEqual(classifyPath('/work/.ai/ship-plan.md', '/work'), { kind: 'project', rel: '.ai/ship-plan.md', id: 'prj:.ai/ship-plan.md' });
  assert.equal(classifyPath('/work/.ai/ship-plan.md'), null);
  assert.equal(classifyPath('/work/src/index.ts', '/work'), null);
});

test('mergeRanges joins overlapping and adjacent ranges; coversSpan finds gaps', () => {
  assert.deepEqual(mergeRanges([[1, 10]], [11, 20]), [[1, 20]]);
  assert.deepEqual(mergeRanges([[1, 5], [20, 30]], [3, 8]), [[1, 8], [20, 30]]);
  assert.deepEqual(mergeRanges([], [5, 4]), []);
  assert.equal(coversSpan([[1, 8], [20, 30]], 2, 7), true);
  assert.equal(coversSpan([[1, 8], [20, 30]], 5, 22), false);
  assert.equal(coversSpan([[1, 8], [9, 30]], 5, 22), true);
});

test('recordRead merges ranges per agent and per file; coverage needs the whole file', () => {
  const ledger = new Map();
  recordRead(ledger, 'A', 'wf:a/02-shape.md', '/w/02-shape.md', { startLine: 1, numLines: 10, totalLines: 40 });
  assert.equal(coverageOf(ledger.get('A').get('wf:a/02-shape.md'), null), 'partial');
  recordRead(ledger, 'A', 'wf:a/02-shape.md', '/w/02-shape.md', { startLine: 11, numLines: 30, totalLines: 40 });
  assert.equal(coverageOf(ledger.get('A').get('wf:a/02-shape.md'), null), 'read');
  assert.equal(coverageOf(ledger.get('B')?.get('wf:a/02-shape.md'), null), 'missing');
  // A trailing newline may count as one more line.
  recordRead(ledger, 'A', 'wf:a/x.md', '/w/x.md', { startLine: 1, numLines: 9, totalLines: 10 });
  assert.equal(coverageOf(ledger.get('A').get('wf:a/x.md'), null), 'read');
  recordRead(ledger, 'A', 'wf:a/empty.md', '/w/empty.md', { startLine: 1, numLines: 0, totalLines: 0 });
  assert.equal(coverageOf(ledger.get('A').get('wf:a/empty.md'), null), 'read');
});

test('sectionSpansOf finds each ## section to the next heading, skipping frontmatter and fences', () => {
  const spans = sectionSpansOf(SHAPE_TEXT, ['Acceptance Criteria', 'out of scope', 'Fake', 'Missing']);
  assert.deepEqual(spans.get('Acceptance Criteria'), { start: 6, end: 9 });
  assert.deepEqual(spans.get('out of scope'), { start: 14, end: 19 });
  assert.equal(spans.get('Fake'), null);
  assert.equal(spans.get('Missing'), null);
  const reads = { path: 'x', ranges: [[6, 9]], totalLines: 20 };
  assert.equal(coverageOf(reads, [{ start: 6, end: 9 }]), 'read');
  assert.equal(coverageOf(reads, [{ start: 6, end: 9 }, { start: 14, end: 19 }]), 'partial');
});

test('patternOf and matchWrite: placeholders capture, a glob stays in one segment', () => {
  assert.equal(patternOf('07-review-*.yaml').regex.test('07-review-auth.yaml'), true);
  assert.equal(patternOf('07-review-*.yaml').regex.test('history/07-review-auth.yaml'), false);
  const plan = matchWrite([PLAN, SHAPE], '04-plan-auth.md');
  assert.equal(plan.entry.stage, 'plan');
  assert.equal(plan.slice, 'auth');
  assert.equal(matchWrite([PLAN], '04-plan.md'), null);
  assert.equal(matchWrite([PLAN], '05-implement-auth.md'), null);
});

test('matchWrite prefers the command stage, then a plain stage, and refuses a slice that is not one', () => {
  assert.equal(matchWrite([INTAKE_FIX, SHAPE], '02-shape.md').entry.stage, 'shape');
  assert.equal(matchWrite([INTAKE_FIX, SHAPE], '02-shape.md', preferredStagesOf({ key: 'intake', slug: 'fix' })).entry.stage, 'intake:fix');
  assert.deepEqual(preferredStagesOf({ key: 'intake', slug: 'fix' }), ['intake:fix', 'intake']);
  assert.deepEqual(preferredStagesOf({ key: 'plan', slug: 'alpha' }), ['plan']);
  assert.deepEqual(preferredStagesOf(null), []);
  const roster = ['auth'];
  const accept = (slice) => roster.includes(slice) || !roster.some((known) => slice.startsWith(`${known}-`));
  assert.equal(matchWrite([REVIEW], '07-review-auth-security.md', [], accept), null);
  assert.equal(matchWrite([REVIEW], '07-review-auth.md', [], accept).slice, 'auth');
});

// A master file several stages list in a `writes` row (05-implement.md, 06-verify.md, 04-plan.md).
const TASK = {
  reference: 'task.md',
  stage: 'task',
  rows: [
    { input: 'intake/_intake-context.md', kind: 'procedure', when: 'always', sections: [] },
    { input: '05-implement.md', kind: 'writes', when: '', sections: [] },
    { input: '06-verify.md', kind: 'writes', when: '', sections: [] },
  ],
};
const IMPLEMENT = { reference: 'implement.md', stage: 'implement', rows: [{ input: '04-plan-<slice>.md', kind: 'artifact', when: 'always', sections: [] }, { input: '05-implement-<slice>.md', kind: 'writes', when: '', sections: [] }] };
const PLAN_MASTER = {
  reference: 'plan.md',
  stage: 'plan',
  rows: [
    { input: '02-shape.md', kind: 'artifact', when: 'always', sections: [] },
    { input: '04-plan.md', kind: 'artifact', when: 'if-present', sections: ['Sibling Plans'] },
    { input: '04-plan-*.md', kind: 'artifact', when: 'if-present', sections: [] },
    { input: '04-plan.md', kind: 'writes', when: '', sections: [] },
  ],
};
const INTAKE_DEFAULT = { reference: 'intake/default.md', stage: 'intake:default', rows: [{ input: '01-intake.md', kind: 'writes', when: '', sections: [] }] };

function readRef(ledger, agent, reference) {
  recordRead(ledger, agent, `ref:${reference}`, `/p/skills/wf/reference/${reference}`, { startLine: 1, numLines: 5, totalLines: 5 });
}

test('writerStagesOf: stages whose reference the writer read this turn, then the command stages, then older reads', () => {
  const requires = [TASK, IMPLEMENT, PLAN, INTAKE_FIX, SHAPE, INTAKE_DEFAULT];
  const ledger = new Map();
  readRef(ledger, 'I', 'implement.md');
  assert.deepEqual(writerStagesOf(requires, ledger.get('I'), null), ['implement']);
  assert.deepEqual(writerStagesOf(requires, undefined, null), []);
  assert.deepEqual(writerStagesOf(requires, ledger.get('I'), { key: 'plan', slug: 'alpha' }), ['implement', 'plan']);
  // The main loop keeps its reads for the session: an intake reference read in an earlier turn does not beat this turn's shape command.
  const main = new Map();
  readRef(main, 'M', 'intake/fix.md');
  const mark = readMarkOf();
  assert.deepEqual(writerStagesOf(requires, main.get('M'), { key: 'shape', slug: 'b' }, mark), ['shape', 'intake:fix']);
  // Read again in this turn, it is fresh and comes first.
  readRef(main, 'M', 'intake/fix.md');
  assert.deepEqual(writerStagesOf(requires, main.get('M'), { key: 'shape', slug: 'b' }, mark), ['intake:fix', 'shape']);
  assert.deepEqual(writerStagesOf(requires, undefined, { key: 'intake', slug: 'fix' }), ['intake:fix']);
  // An intake slug that names no mode (the idea text) maps to the default mode.
  assert.deepEqual(writerStagesOf(requires, undefined, { key: 'intake', slug: 'add-login' }), ['intake:default']);
  assert.deepEqual(writerStagesOf(requires, undefined, { key: 'yolo', slug: 'alpha' }), []);
});

test('a shared master file matches only the stage the writer runs; none leaves the write unchecked', () => {
  const requires = [TASK, IMPLEMENT];
  const ledger = new Map();
  readRef(ledger, 'I', 'implement.md');
  const implementStages = writerStagesOf(requires, ledger.get('I'), null);
  // The yolo implement agent writes the master 05-implement.md: not checked against /wf task.
  assert.equal(matchWrite(requires, '05-implement.md', implementStages, undefined, implementStages), null);
  assert.equal(matchWrite(requires, '06-verify.md', implementStages, undefined, implementStages), null);
  readRef(ledger, 'T', 'task.md');
  const taskStages = writerStagesOf(requires, ledger.get('T'), null);
  assert.equal(matchWrite(requires, '05-implement.md', taskStages, undefined, taskStages).entry.stage, 'task');
  // Several matches: the stage whose reference the writer read wins over the command stage.
  const both = [INTAKE_FIX, SHAPE];
  readRef(ledger, 'S', 'shape.md');
  const shapeStages = writerStagesOf(both, ledger.get('S'), { key: 'intake', slug: 'fix' });
  assert.deepEqual(shapeStages, ['shape', 'intake:fix']);
  assert.equal(matchWrite(both, '02-shape.md', shapeStages, undefined, shapeStages).entry.stage, 'shape');
  // The review agent writing a dimension file: intake:audit names 07-review-*.md, but the agent runs review.
  const AUDIT = { reference: 'intake/audit.md', stage: 'intake:audit', rows: [{ input: '07-review-*.md', kind: 'writes', when: '', sections: [] }] };
  readRef(ledger, 'R', 'review.md');
  const reviewStages = writerStagesOf([AUDIT, REVIEW], ledger.get('R'), null);
  const accept = (slice) => slice === 'auth' || !slice.startsWith('auth-');
  assert.equal(matchWrite([AUDIT, REVIEW], '07-review-auth-security.md', reviewStages, accept, reviewStages), null);
});

test('checkReads: the file being written is never missing or partial, even when it exists', async () => {
  const root = '/w';
  const dir = '/w/.ai/workflows/alpha';
  const files = { [`${dir}/02-shape.md`]: 'x', [`${dir}/04-plan.md`]: '# Plan\n\n## Sibling Plans\n\n- a\n', [`${dir}/04-plan-a.md`]: 'a' };
  const ledger = new Map();
  recordRead(ledger, 'P', 'wf:alpha/02-shape.md', `${dir}/02-shape.md`, { startLine: 1, numLines: 1, totalLines: 1 });
  recordRead(ledger, 'P', 'wf:alpha/04-plan-a.md', `${dir}/04-plan-a.md`, { startLine: 1, numLines: 1, totalLines: 1 });
  const required = requiredOf(matchWrite([PLAN_MASTER], '04-plan.md'), 'alpha');
  const context = { root, slug: 'alpha', reads: ledger.get('P'), fed: [] };
  // Without `self` the warn-mode check after the write reports the plan itself.
  assert.deepEqual(await checkReads(required, context, io(files)), { missing: ['04-plan.md'], partial: [] });
  assert.deepEqual(await checkReads(required, { ...context, self: 'wf:alpha/04-plan.md' }, io(files)), { missing: [], partial: [] });
  // A partial read of the file being written is not partial either.
  recordRead(ledger, 'P', 'wf:alpha/04-plan.md', `${dir}/04-plan.md`, { startLine: 1, numLines: 1, totalLines: 6 });
  assert.deepEqual(await checkReads(required, { ...context, reads: ledger.get('P'), self: 'wf:alpha/04-plan.md' }, io(files)), { missing: [], partial: [] });
  // A glob that expands to the file being written skips it too.
  const GLOB = { reference: 'g.md', stage: 'g', rows: [{ input: '04-plan-*.md', kind: 'artifact', when: 'if-present', sections: [] }, { input: '04-plan-<slice>.md', kind: 'writes', when: '', sections: [] }] };
  const globbed = requiredOf(matchWrite([GLOB], '04-plan-a.md'), 'alpha');
  assert.deepEqual(await checkReads(globbed, { root, slug: 'alpha', reads: undefined, fed: [] }, io(files)), { missing: ['04-plan-a.md'], partial: [] });
  assert.deepEqual(await checkReads(globbed, { root, slug: 'alpha', reads: undefined, fed: [], self: 'wf:alpha/04-plan-a.md' }, io(files)), { missing: [], partial: [] });
});

test('isExcludedWrite: yaml, fragments, history, evidence, the index and the ledgers', () => {
  for (const name of ['04-plan-a.yaml', '04-plan-a.explainer.html.fragment', 'history/04-plan-a.md', '00-index.md', 'index-history.jsonl', 'probe-evidence/x.md', 'verify-evidence/a/report.md', READ_LEDGER_FILE, '.driver-journal.jsonl']) {
    assert.equal(isExcludedWrite(name), true, name);
  }
  assert.equal(isExcludedWrite('04-plan-a.md'), false);
  assert.equal(isExcludedWrite('03-slice.md'), false);
});

test('requiredOf keeps always and if-present rows and fills the slice', () => {
  const required = requiredOf(matchWrite([PLAN], '04-plan-auth.md'), 'alpha');
  assert.deepEqual(required.map((row) => row.input), ['00-index.md', '02-shape.md', 'po-answers.md', '03-slice-auth.md', '/.ai/ship-plan.md', 'plan/_artifact.md']);
  assert.deepEqual(required.map((row) => row.id), ['wf:alpha/00-index.md', 'wf:alpha/02-shape.md', 'wf:alpha/po-answers.md', 'wf:alpha/03-slice-auth.md', 'prj:.ai/ship-plan.md', 'ref:plan/_artifact.md']);
  const fix = requiredOf(matchWrite([INTAKE_FIX], '02-shape.md'), 'alpha');
  assert.deepEqual(fix, []);
});

test('checkReads: missing, partial by section, if-present only when the file exists, globs expand', async () => {
  const root = '/w';
  const dir = '/w/.ai/workflows/alpha';
  const files = { [`${dir}/02-shape.md`]: SHAPE_TEXT, [`${dir}/po-answers.md`]: 'x', [`${dir}/07-review-auth.yaml`]: 'a', [`${dir}/07-review-ui.yaml`]: 'b' };
  const ledger = new Map();
  recordRead(ledger, 'A', 'wf:alpha/00-index.md', `${dir}/00-index.md`, { startLine: 1, numLines: 5, totalLines: 5 });
  recordRead(ledger, 'A', 'wf:alpha/02-shape.md', `${dir}/02-shape.md`, { startLine: 6, numLines: 4, totalLines: 21 });
  recordRead(ledger, 'A', 'wf:alpha/03-slice-auth.md', `${dir}/03-slice-auth.md`, { startLine: 1, numLines: 3, totalLines: 3 });
  const required = requiredOf(matchWrite([PLAN], '04-plan-auth.md'), 'alpha');
  const result = await checkReads(required, { root, slug: 'alpha', reads: ledger.get('A'), fed: [] }, io(files));
  // po-answers exists and is unread; ship-plan is absent; the shape read misses Out of Scope.
  assert.deepEqual(result, { missing: ['po-answers.md', 'plan/_artifact.md'], partial: ['02-shape.md'] });
  recordRead(ledger, 'A', 'wf:alpha/02-shape.md', `${dir}/02-shape.md`, { startLine: 14, numLines: 6, totalLines: 21 });
  const again = await checkReads(required, { root, slug: 'alpha', reads: ledger.get('A'), fed: ['po-answers.md', '.ai/workflows/alpha/plan/_artifact.md'] }, io(files));
  assert.deepEqual(again, { missing: [], partial: [] });
  const review = requiredOf(matchWrite([REVIEW], '07-review-auth.md'), 'alpha');
  recordRead(ledger, 'R', 'wf:alpha/07-review-auth.yaml', `${dir}/07-review-auth.yaml`, { startLine: 1, numLines: 1, totalLines: 1 });
  assert.deepEqual(await checkReads(review, { root, slug: 'alpha', reads: ledger.get('R'), fed: [] }, io(files)), { missing: ['07-review-ui.yaml'], partial: [] });
});

test('promptFedOf reads the line and every workflow path the prompt names', () => {
  const fed = promptFedOf('Write `.ai/workflows/alpha/04-plan-auth.md`.\nPrompt-fed inputs: `02-shape.md`, po-answers.md\nAlso see .ai/workflows/alpha/03-slice-auth.md.');
  assert.deepEqual(fed.inputs, ['02-shape.md', 'po-answers.md']);
  assert.deepEqual(fed.outputs, [{ slug: 'alpha', file: '04-plan-auth.md' }, { slug: 'alpha', file: '03-slice-auth.md' }]);
  assert.equal(promptFedOf('no line here'), null);
  assert.equal(fedCovers('02-shape.md', ['.ai/workflows/alpha/02-shape.md']), true);
  assert.equal(fedCovers('02-shape.md', ['01-intake.md']), false);
});

test('waiverOf needs a reason; writtenTextOf reads every write tool', () => {
  assert.equal(waiverOf('---\nread-waiver: "parent read it"\n---\n'), 'parent read it');
  assert.equal(waiverOf('---\nread-waiver: ""\n---\n'), null);
  assert.equal(waiverOf('no waiver'), null);
  assert.equal(writtenTextOf({ content: 'a' }), 'a');
  assert.equal(writtenTextOf({ new_string: 'b' }), 'b');
  assert.equal(writtenTextOf({ edits: [{ old_string: 'x', new_string: 'c' }, { new_string: 'd' }] }), 'c\nd');
});

test('contextTextOf names the files and the next step; only block names the waiver', () => {
  const result = { missing: ['02-shape.md'], partial: ['plan/_artifact.md'] };
  const warn = contextTextOf({ artifact: '04-plan-a.md', reference: 'plan.md', result, mode: 'warn' });
  assert.match(warn, /Not read: 02-shape\.md\./);
  assert.match(warn, /Read only in part .*plan\/_artifact\.md/);
  assert.match(warn, /write 04-plan-a\.md again/);
  assert.doesNotMatch(warn, /read-waiver/);
  const block = contextTextOf({ artifact: '04-plan-a.md', reference: 'plan.md', result, mode: 'block' });
  assert.match(block, /refused/);
  assert.match(block, /read-waiver/);
});

test('ledgerLineOf writes the S6 fields; appendedTextOf appends and trims past the cap', () => {
  const line = ledgerLineOf({ at: '2026-09-28T00:00:00.000Z', agentId: 'A', stage: 'plan', artifact: '04-plan-a.md', missing: ['x'], partial: [], waiver: null });
  assert.deepEqual(JSON.parse(line), { at: '2026-09-28T00:00:00.000Z', agentId: 'A', stage: 'plan', artifact: '04-plan-a.md', missing: ['x'], partial: [], waiver: null });
  assert.ok(line.endsWith('\n'));
  assert.equal(appendedTextOf('', 'a\n'), 'a\n');
  assert.equal(appendedTextOf('a', 'b\n'), 'a\nb\n');
  const big = `${'x'.repeat(100)}\n`.repeat(12_000);
  const trimmed = appendedTextOf(big, 'z\n');
  assert.ok(trimmed.length < big.length);
  assert.ok(trimmed.endsWith('z\n'));
  assert.ok(trimmed.startsWith('x'));
});
