// The pure parts of the /wf picker mod (hooks/mod/picker.ts, workflows.ts),
// run under `node --experimental-strip-types --test`. The wrapper
// tests/unit/wf-picker-mod.test.mjs spawns this file; run-all.mjs never runs
// it directly (no `.test.mjs` suffix). The hooks module itself is covered by
// the kit tests in hooks/mod/tests/, run with `claude plugin test hooks/mod`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CATALOG, commandNameOf, keyOfCommand } from '../../../hooks/mod/catalog.ts';
import { ALL, NONE, backOf, digitCommandOf, fillOf, filterOptions, filterTextOf, hotkeyOf, keyOptions, pageOf, pick, sliceOptions, slugOptions, stepFor, submitActionOf, titleOf } from '../../../hooks/mod/picker.ts';
import { findProjectRoot, frontmatterOf, joinPath, listSlices, listWorkflows, rosterOf } from '../../../hooks/mod/workflows.ts';
import { PROBE_CAP, ProbeJournal, rowOf, rowsOf, sinceOf, surfaceAfterAttach, textOf, verdictOf } from '../../../hooks/mod/probe.ts';
import {
  COMPACT_KEYS, beatsOf, compactEligible, compactInstructionsOf, compactKeepSentenceOf, compactToastOf, costTextOf, driverStatusOf, expectedArtifactOf, hubHealthOf, hubNoticeTextOf, isWorkflowPath,
  ledgerTokensOf, modeLabelOf, openFindingsOf, settingOfKey, settingsOf, slugOfPath, spinnerWordOf, statusTextOf,
  nextActiveSlug, openingCandidatesOf, reviewLedgerNameOf, shipPlanBlockersOf, stageLanded, stripTextOf, wfCommandOf, wrappedRowsOf, yamlListItemsOf,
} from '../../../hooks/mod/active.ts';

const WORKFLOWS = [
  { slug: 'alpha', status: 'active', terminal: false, currentStage: 'plan', selectedSlice: 'auth', nextInvocation: null },
  { slug: 'beta', status: 'closed', terminal: true, currentStage: null, selectedSlice: null, nextInvocation: null },
  { slug: 'gamma', status: 'active', terminal: false, currentStage: null, selectedSlice: null, nextInvocation: null },
];

const SLICES = [
  { slug: 'auth', status: 'complete', complexity: 's', stage: 'verified' },
  { slug: 'ui', status: 'in-progress', complexity: null, stage: 'implemented' },
  { slug: 'docs', status: 'defined', complexity: 'xs', stage: 'defined' },
];

test('the catalog holds the 23 keys, each with a wf-<key> command name', () => {
  assert.equal(CATALOG.length, 23);
  assert.deepEqual(CATALOG.slice(0, 11).map((e) => e.key), ['intake', 'shape', 'design', 'slice', 'plan', 'implement', 'verify', 'review', 'handoff', 'ship', 'retro']);
  assert.equal(commandNameOf('plan'), 'wf-plan');
  assert.equal(keyOfCommand('wf-plan'), 'plan');
  assert.equal(keyOfCommand('sdlc-workflow:wf-plan'), 'plan');
  assert.equal(keyOfCommand('wf'), null);
  assert.equal(keyOfCommand('wf-nope'), null);
});

test('stepFor: a bare /wf opens the key step; a key without a slug opens the slug step', () => {
  assert.deepEqual(stepFor(null, ''), { kind: 'key' });
  assert.deepEqual(stepFor(null, 'plan'), { kind: 'slug', key: 'plan' });
  assert.deepEqual(stepFor('plan', ''), { kind: 'slug', key: 'plan' });
  assert.deepEqual(stepFor('plan', 'alpha'), { kind: 'slice', key: 'plan', slug: 'alpha' });
  assert.deepEqual(stepFor(null, 'plan alpha'), { kind: 'slice', key: 'plan', slug: 'alpha' });
});

test('stepFor: complete arguments, no-argument keys, and unknown keys open nothing', () => {
  assert.equal(stepFor('plan', 'alpha auth'), null);
  assert.equal(stepFor('ship', 'alpha'), null);
  assert.equal(stepFor('ship-plan', ''), null);
  assert.equal(stepFor(null, 'unknown-key'), null);
  assert.equal(stepFor(null, 'intake fix a bounded change'), null);
});

test('the option lists carry the status, stage, and slice information', () => {
  assert.equal(keyOptions().length, 23);
  assert.equal(keyOptions()[4].label, 'plan  Plan one or more workflow slices.');

  const slugs = slugOptions({ kind: 'slug', key: 'plan' }, WORKFLOWS);
  assert.deepEqual(slugs.map((o) => o.value), ['alpha', 'gamma', 'beta']);
  assert.equal(slugs[0].label, 'alpha  active · stage plan · slice auth');
  assert.equal(slugs[2].label, 'beta  closed (closed)');

  const optional = slugOptions({ kind: 'slug', key: 'status' }, WORKFLOWS);
  assert.equal(optional[0].value, NONE);

  const slices = sliceOptions({ kind: 'slice', key: 'plan', slug: 'alpha' }, SLICES);
  assert.deepEqual(slices.map((o) => o.value), [NONE, ALL, 'auth', 'ui', 'docs']);
  assert.equal(slices[2].label, 'auth  complete · verified · s');
  assert.equal(slices[3].label, 'ui  in-progress · implemented');
  assert.equal(slices[4].label, 'docs  defined · xs');

  const noAll = sliceOptions({ kind: 'slice', key: 'implement', slug: 'alpha' }, SLICES);
  assert.deepEqual(noAll.map((o) => o.value), [NONE, 'auth', 'ui', 'docs']);

  assert.equal(titleOf({ kind: 'key' }), '/wf — pick a key');
  assert.equal(titleOf({ kind: 'slice', key: 'plan', slug: 'alpha' }), '/wf plan alpha — pick a slice');
});

test('pick walks key → slug → slice and ends in a fill', () => {
  const hasSlices = (slug) => slug === 'alpha';
  assert.deepEqual(pick({ kind: 'key' }, 'plan', hasSlices), { kind: 'step', step: { kind: 'slug', key: 'plan' } });
  assert.deepEqual(pick({ kind: 'key' }, 'ship-plan', hasSlices), { kind: 'fill', text: '/wf ship-plan ' });
  assert.deepEqual(pick({ kind: 'slug', key: 'plan' }, 'alpha', hasSlices), { kind: 'step', step: { kind: 'slice', key: 'plan', slug: 'alpha' } });
  assert.deepEqual(pick({ kind: 'slug', key: 'plan' }, 'gamma', hasSlices), { kind: 'fill', text: '/wf plan gamma ' });
  assert.deepEqual(pick({ kind: 'slug', key: 'ship' }, 'alpha', hasSlices), { kind: 'fill', text: '/wf ship alpha ' });
  assert.deepEqual(pick({ kind: 'slug', key: 'status' }, NONE, hasSlices), { kind: 'fill', text: '/wf status ' });
  assert.deepEqual(pick({ kind: 'slice', key: 'plan', slug: 'alpha' }, 'auth', hasSlices), { kind: 'fill', text: '/wf plan alpha auth ' });
  assert.deepEqual(pick({ kind: 'slice', key: 'plan', slug: 'alpha' }, ALL, hasSlices), { kind: 'fill', text: '/wf plan alpha all ' });
  assert.deepEqual(pick({ kind: 'slice', key: 'plan', slug: 'alpha' }, NONE, hasSlices), { kind: 'fill', text: '/wf plan alpha ' });
  assert.equal(fillOf('verify', 'alpha'), '/wf verify alpha ');
});

test('pageOf slices the options into pages that wrap, never wider than nine rows', () => {
  const keys = keyOptions();
  assert.equal(keys.length, 23);
  const first = pageOf(keys, 0, 9);
  assert.deepEqual({ page: first.page, pages: first.pages, length: first.items.length }, { page: 0, pages: 3, length: 9 });
  assert.equal(first.items[0].value, 'intake');
  const last = pageOf(keys, 2, 9);
  assert.deepEqual({ page: last.page, length: last.items.length }, { page: 2, length: 5 });
  assert.equal(last.items[4].value, 'observability');
  assert.equal(pageOf(keys, 3, 9).page, 0, 'a page past the last wraps to the first');
  assert.equal(pageOf(keys, -1, 9).page, 2, 'a page before the first wraps to the last');
  const one = pageOf(keys, 0, 0);
  assert.deepEqual({ pages: one.pages, length: one.items.length }, { pages: 23, length: 1 }, 'a width below one is one');
  const empty = pageOf([], 4, 9);
  assert.deepEqual(empty, { items: [], page: 0, pages: 1 });
});

test('hotkeyOf gives the nine digits, then nothing', () => {
  assert.deepEqual([0, 8, 9, 35].map(hotkeyOf), ['1', '9', undefined, undefined]);
  assert.equal(hotkeyOf(-1), undefined);
});

test('backOf steps back one step and stops at the key step', () => {
  assert.deepEqual(backOf({ kind: 'slice', key: 'plan', slug: 'alpha' }), { kind: 'slug', key: 'plan' });
  assert.deepEqual(backOf({ kind: 'slug', key: 'plan' }), { kind: 'key' });
  assert.equal(backOf({ kind: 'key' }), null);
});

test('a bare digit in the filter is a pick or a page turn, never a filter', () => {
  assert.deepEqual(digitCommandOf('3'), { kind: 'row', index: 2 });
  assert.deepEqual(digitCommandOf(' 0 '), { kind: 'more' });
  assert.equal(digitCommandOf('12'), null);
  assert.equal(digitCommandOf('auth'), null);
  assert.equal(digitCommandOf(''), null);
  assert.equal(filterTextOf('3'), '');
  assert.equal(filterTextOf('auth'), 'auth');
  // Enter in the field: the digit's row of the page shown, the next page, or the first row a word leaves.
  const options = keyOptions();
  const second = pageOf(options, 1, 9);
  assert.deepEqual(submitActionOf('3', second, options), { kind: 'pick', value: options[11].value });
  assert.deepEqual(submitActionOf('0', second, options), { kind: 'more' });
  assert.equal(submitActionOf('9', pageOf(options, 2, 9), options), null);
  assert.deepEqual(submitActionOf('yo', second, options), { kind: 'pick', value: 'yolo' });
  assert.equal(submitActionOf('zzz', second, options), null);
});

test('filterOptions keeps the rows whose value or label holds every word, case-insensitively', () => {
  const keys = keyOptions();
  assert.equal(filterOptions(keys, '').length, 23, 'no text keeps every row');
  const pl = filterOptions(keys, 'PL').map(o => o.value);
  assert.ok(pl.includes('plan') && pl.includes('implement') && pl.includes('ship-plan'), pl.join(' '));
  assert.ok(!pl.includes('intake') && !pl.includes('shape'), pl.join(' '));
  assert.deepEqual(filterOptions(keys, 'ship plan').map(o => o.value), ['ship', 'ship-plan'], 'every word must match, in catalog order');
  assert.deepEqual(filterOptions(keys, 'zzz'), []);
  assert.equal(filterOptions(keys, 'status').length, 1, 'a word with an s inside stays one word');
});

test('frontmatterOf and rosterOf read the index and slice-roster fields', () => {
  const index = '---\nschema: sdlc/v1\nslug: alpha\nstatus: active\ncurrent-stage: implement\nselected-slice: ""\nnext-invocation: "/wf verify alpha auth"\ntags: [a, b]\nopen-questions:\n  - "one"\n---\n# Body\nstatus: not-frontmatter\n';
  const fields = frontmatterOf(index);
  assert.equal(fields.status, 'active');
  assert.equal(fields['current-stage'], 'implement');
  assert.equal(fields['selected-slice'], '');
  assert.equal(fields['next-invocation'], '/wf verify alpha auth');
  assert.equal(frontmatterOf('no frontmatter\n').status, undefined);

  const roster = '---\ntype: slice-index\nslices:\n  - slug: auth\n    status: complete\n    complexity: s\n    depends-on: []\n  - slug: ui\n    status: in-progress\n    complexity: m\n    depends-on: [auth]\n    source: extension\nrefs:\n  index: 00-index.md\n---\n';
  assert.deepEqual(rosterOf(roster), [
    { slug: 'auth', status: 'complete', complexity: 's' },
    { slug: 'ui', status: 'in-progress', complexity: 'm' },
  ]);
  assert.deepEqual(rosterOf('---\nslug: x\n---\n'), []);
  assert.deepEqual(rosterOf(roster.replace(/\n/g, '\r\n')), rosterOf(roster));
});

function readerOf(tree) {
  const normal = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const dirs = new Set();
  for (const file of Object.keys(tree)) {
    const parts = file.split('/');
    for (let i = 2; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'));
  }
  return {
    exists: async (p) => dirs.has(normal(p)) || normal(p) in tree,
    read: async (p) => {
      if (!(normal(p) in tree)) throw new Error(`ENOENT ${p}`);
      return tree[normal(p)];
    },
    list: async (p) => {
      const dir = normal(p);
      if (!dirs.has(dir)) throw new Error(`ENOENT ${p}`);
      const names = new Map();
      for (const file of Object.keys(tree)) {
        if (!file.startsWith(`${dir}/`)) continue;
        const rest = file.slice(dir.length + 1);
        names.set(rest.split('/')[0], rest.includes('/') ? 'dir' : 'file');
      }
      return [...names].map(([name, kind]) => ({ name, kind }));
    },
  };
}

const TREE = {
  '/repo/.ai/workflows/alpha/00-index.md': '---\nslug: alpha\nstatus: active\ncurrent-stage: implement\nselected-slice: auth\n---\n',
  '/repo/.ai/workflows/alpha/03-slice.md': '---\nslices:\n  - slug: auth\n    status: complete\n    complexity: s\n  - slug: ui\n    status: defined\n---\n',
  '/repo/.ai/workflows/alpha/04-plan-ui.md': '',
  '/repo/.ai/workflows/alpha/06-verify-auth.md': '',
  '/repo/.ai/workflows/beta/00-index.md': '---\nslug: beta\nstatus: completed\n---\n',
  '/repo/.ai/workflows/Bad_Slug/00-index.md': '---\nslug: Bad_Slug\nstatus: active\n---\n',
  '/repo/.ai/workflows/no-index/notes.md': '',
  '/repo/.ai/workflows/no-status/00-index.md': '---\nslug: no-status\n---\n',
  '/repo/.ai/workflows/README.md': '',
};

test('findProjectRoot walks up to the directory holding .ai/workflows', async () => {
  const reader = readerOf(TREE);
  assert.equal(await findProjectRoot('/repo', reader), '/repo');
  assert.equal(await findProjectRoot('/repo/src/deep/er', reader), '/repo');
  assert.equal(await findProjectRoot('/elsewhere/x', reader), null);
  assert.equal(await findProjectRoot('C:\\repo\\src', readerOf({ 'C:/repo/.ai/workflows/a/00-index.md': '---\nstatus: active\n---\n' })), 'C:\\repo');
  assert.equal(joinPath('C:\\repo', '.ai', 'workflows'), 'C:\\repo/.ai/workflows');
});

test('listWorkflows keeps valid indexes only, sorted, with terminal marked', async () => {
  const workflows = await listWorkflows('/repo', readerOf(TREE));
  assert.deepEqual(workflows.map((w) => [w.slug, w.status, w.terminal, w.currentStage, w.selectedSlice]), [
    ['alpha', 'active', false, 'implement', 'auth'],
    ['beta', 'completed', true, null, null],
  ]);
  assert.deepEqual(await listWorkflows('/nowhere', readerOf(TREE)), []);
});

test('listSlices reads the roster and marks the furthest stage file present', async () => {
  const slices = await listSlices('/repo', 'alpha', readerOf(TREE));
  assert.deepEqual(slices, [
    { slug: 'auth', status: 'complete', complexity: 's', stage: 'verified' },
    { slug: 'ui', status: 'defined', complexity: null, stage: 'planned' },
  ]);
  assert.deepEqual(await listSlices('/repo', 'beta', readerOf(TREE)), []);
});

test('wfCommandOf parses the dispatcher, the per-key command, and the namespaced form; unknown keys are null', () => {
  assert.deepEqual(wfCommandOf('/wf implement alpha-flow auth'), { key: 'implement', slug: 'alpha-flow', slice: 'auth' });
  assert.deepEqual(wfCommandOf('/wf-plan alpha-flow'), { key: 'plan', slug: 'alpha-flow', slice: null });
  assert.deepEqual(wfCommandOf('/sdlc-workflow:wf status'), { key: 'status', slug: null, slice: null });
  assert.equal(wfCommandOf('/wf bogus alpha'), null);
  assert.equal(wfCommandOf('hello /wf plan'), null);
  assert.equal(wfCommandOf('/wf'), null);
});

test('expectedArtifactOf names the stage file, or null for keys without one', () => {
  assert.equal(expectedArtifactOf({ key: 'implement', slug: 'a', slice: 'auth' }), '05-implement-auth.md');
  assert.equal(expectedArtifactOf({ key: 'plan', slug: 'a', slice: 'all' }), null);
  assert.equal(expectedArtifactOf({ key: 'verify', slug: 'a', slice: null }), null);
  assert.equal(expectedArtifactOf({ key: 'shape', slug: 'a', slice: null }), '02-shape.md');
  assert.equal(expectedArtifactOf({ key: 'status', slug: 'a', slice: null }), null);
});

test('workflow paths are recognised on either slash and yield their slug', () => {
  assert.ok(isWorkflowPath('C:/work', 'C:\\work\\.ai\\workflows\\alpha\\00-index.md'));
  assert.ok(!isWorkflowPath('/work', '/work/src/a.ts'));
  assert.equal(slugOfPath('/work', '/work/.ai/workflows/alpha/04-plan-x.md'), 'alpha');
  assert.equal(slugOfPath('/work', '/work/.ai/workflows/INDEX.md'), null);
});

test('the strip, status, mode, and spinner texts', () => {
  const wf = { slug: 'alpha', status: 'active', terminal: false, currentStage: 'implement', selectedSlice: 'auth', nextInvocation: '/wf verify alpha auth' };
  const slices = [{ slug: 'auth', status: 'complete', complexity: null, stage: 'verified' }, { slug: 'ui', status: 'defined', complexity: null, stage: 'defined' }];
  assert.equal(stripTextOf(wf, slices), 'wf alpha · implement · slice auth (1 of 2 complete) · next: /wf verify alpha auth');
  assert.equal(stripTextOf({ ...wf, status: 'closed', terminal: true }, slices), 'wf alpha · closed (closed)');
  assert.equal(statusTextOf(wf), 'next /wf verify alpha auth');
  assert.equal(statusTextOf(wf, 0.5, { version: '9.157.0', repos: 1, stale: 0, ok: true }), 'next /wf verify alpha auth · $0.50 stage · hub 9.157.0');
  assert.equal(statusTextOf({ ...wf, nextInvocation: null }, null, { version: null, repos: null, stale: null, ok: false }), 'wf alpha · implement · auth · hub down');
  assert.equal(statusTextOf({ ...wf, terminal: true, status: 'closed' }), 'wf alpha · closed');
  // The ring: the active workflows by slug, then the closed ones, then round again.
  assert.equal(nextActiveSlug(WORKFLOWS, 'alpha'), 'gamma');
  assert.equal(nextActiveSlug(WORKFLOWS, 'gamma'), 'beta');
  assert.equal(nextActiveSlug(WORKFLOWS, 'beta'), 'alpha');
  assert.equal(nextActiveSlug(WORKFLOWS, null), 'alpha');
  assert.equal(nextActiveSlug([WORKFLOWS[0]], 'alpha'), 'alpha');
  assert.equal(nextActiveSlug([WORKFLOWS[1]], null), 'beta');
  assert.equal(nextActiveSlug([], null), null);
  // The strip opens on an active workflow; on a closed one only when none is active.
  assert.deepEqual(openingCandidatesOf(WORKFLOWS).map(w => w.slug), ['alpha', 'gamma']);
  assert.deepEqual(openingCandidatesOf([WORKFLOWS[1]]).map(w => w.slug), ['beta']);
  assert.equal(wrappedRowsOf('', 80), 1);
  assert.equal(wrappedRowsOf('x'.repeat(81), 80), 2);
  assert.equal(modeLabelOf(wf), 'wf:implement');
  assert.equal(modeLabelOf({ ...wf, terminal: true }), null);
  assert.equal(spinnerWordOf({ key: 'implement', slug: 'alpha', slice: 'auth' }), 'Implementing auth');
  assert.equal(spinnerWordOf({ key: 'handoff', slug: 'alpha', slice: null }), 'Handing off alpha');
  assert.equal(spinnerWordOf({ key: 'intake', slug: null, slice: null }), null);
});

test('the cost row sums the ledger tokens and formats the stage dollars', () => {
  const ledger = '{"main":{"input_tokens":1000,"output_tokens":200},"subagents":[{"input_tokens":300,"output_tokens":100}]}\nnot json\n{"main":{"cached_input_tokens":400}}\n';
  assert.equal(ledgerTokensOf(ledger), 2000);
  assert.equal(ledgerTokensOf('{"main":{"output_tokens":10,"reasoning_output_tokens":5}}'), 15);
  assert.equal(costTextOf(0.42, 2000), '$0.42 this stage · 2k tokens workflow');
  assert.equal(costTextOf(null, 1_250_000), '1.3M tokens workflow');
  assert.equal(costTextOf(null, null), null);
});

test('the driver status reads the newest run and presumes death past the longest gap with a 20-minute floor', () => {
  const at = ms => new Date(ms).toISOString();
  const journal = [
    { at: at(1_000_000), run: 'r1', seq: 1, event: 'start', agent: 'a0', phase: 'p', stage: 'plan', slice: 'x' },
    { at: at(2_000_000), run: 'r2', seq: 1, event: 'start', agent: 'a1', phase: 'p', stage: 'implement', slice: 'auth' },
    { at: at(2_300_000), run: 'r2', seq: 2, event: 'finish', agent: 'a1', phase: 'p', stage: 'implement', slice: 'auth' },
  ].map(row => JSON.stringify(row)).join('\n');
  const beats = beatsOf(journal);
  assert.equal(beats.length, 3);
  assert.equal(driverStatusOf('yolo', beats, 2_360_000), 'yolo · run r2 · implement auth · agent a1 · 6 min · last beat 1 min ago');
  assert.match(driverStatusOf('yolo', beats, 2_300_000 + 21 * 60_000), /^yolo · presumed dead since \d\d:\d\d · last: implement auth$/);
  assert.equal(driverStatusOf('auto', [], 0), 'auto · no driver journal');
});

test('the hub notice reads the health answer', () => {
  const health = hubHealthOf('{"ok":true,"version":"9.157.0","entries":[{"stale":false},{"stale":true}]}');
  assert.deepEqual(health, { version: '9.157.0', repos: 2, stale: 1, ok: true });
  assert.equal(hubNoticeTextOf(health), 'sdlc hub 9.157.0 · 2 repos · 1 renders stale');
  assert.equal(hubNoticeTextOf(hubHealthOf('nope')), 'sdlc hub down');
  assert.equal(hubNoticeTextOf(null), 'sdlc hub down');
});

test('settings come from boolean options only, and a config key names its setting', () => {
  assert.equal(settingsOf({ strip: false, cost: 'no', other: true }).strip, false);
  assert.equal(settingsOf({ cost: 'no' }).cost, true);
  assert.equal(settingOfKey('sdlc-workflow', 'sdlc-workflow.hubNotice'), 'hubNotice');
  assert.equal(settingOfKey('sdlc-workflow', 'sdlc-workflow.bogus'), null);
  assert.equal(settingOfKey('sdlc-workflow', 'theme'), null);
});

test('open findings are the findings items in an open status, else unchecked markdown rows', () => {
  assert.equal(openFindingsOf('findings:\n  - id: a\n    status: open\n  - id: b\n    status: fixed\n  - id: c\n    status: deferred\n  - id: d\ncounts:\n  open: 3\n'), 3);
  assert.equal(openFindingsOf('- [ ] one\n- [x] two\n* [ ] three\n'), 2);
  assert.equal(openFindingsOf('findings:\n'), 0);
  assert.equal(openFindingsOf(''), 0);
});

test('yamlListItemsOf reads the scalar fields of each item under a top-level key', () => {
  const text = 'rev: 2\nfindings:\n  - id: "a"\n    severity: HIGH\n    evidence:\n      - one\n      - two\n    status: open\n  -\n    id: b\n    status: fixed\nverdict: pass\n';
  assert.deepEqual(yamlListItemsOf(text, 'findings'), [
    { id: 'a', severity: 'HIGH', evidence: '', status: 'open' },
    { id: 'b', status: 'fixed' },
  ]);
  assert.equal(yamlListItemsOf(text, 'counts'), null);
});

test('ship-plan blockers are the open BLOCKER and HIGH findings, as the triage gate counts them', () => {
  const audit = '---\nfindings:\n  - id: a1\n    severity: BLOCKER\n  - id: a2\n    severity: HIGH\n    status: acknowledged\n  - id: a3\n    severity: LOW\n  - id: a4\n    severity: high\n    status: open\n---\n';
  assert.equal(shipPlanBlockersOf(audit), 2);
  assert.equal(shipPlanBlockersOf('# no frontmatter'), 0);
});

test('the review ledger is the sweep-level YAML, else the selected slice\'s, else the last by name, then the markdown', () => {
  assert.equal(reviewLedgerNameOf(['07-review-auth-security.yaml', '07-review-auth.yaml', '07-review-auth.md'], 'auth'), '07-review-auth.yaml');
  assert.equal(reviewLedgerNameOf(['07-review.yaml', '07-review-auth.yaml'], 'auth'), '07-review.yaml');
  assert.equal(reviewLedgerNameOf(['07-review-auth-security.yaml', '07-review-ui.yaml'], null), '07-review-ui.yaml');
  assert.equal(reviewLedgerNameOf(['07-review-auth.md', '07-review.md', '00-index.md'], null), '07-review.md');
  assert.equal(reviewLedgerNameOf(['00-index.md'], 'auth'), null);
});

test('the driver status names the stage from the newest row that carries one', () => {
  const at = ms => new Date(ms).toISOString();
  const journal = [
    { at: at(2_000_000), run: 'r2', seq: 1, event: 'agent-start', agent: 'a1', phase: 'Drive', stage: 'implement', slice: 'auth' },
    { at: at(2_300_000), run: 'r2', seq: 1, event: 'agent-end', agent: 'a1', status: 'complete', errors: 0 },
  ].map(row => JSON.stringify(row)).join('\n');
  assert.equal(driverStatusOf('yolo', beatsOf(journal), 2_360_000), 'yolo · run r2 · implement auth · agent a1 · 6 min · last beat 1 min ago');
});

test('stageLanded: the artifact in the writes, or an mtime at or after the start; without an expected file, any write', () => {
  const writes = ['/r/.ai/workflows/a/05-IMPLEMENT-auth.md'];
  assert.equal(stageLanded(writes, '05-implement-auth.md', 100, null), true);
  assert.equal(stageLanded([], '05-implement-auth.md', 100, 100), true);
  assert.equal(stageLanded([], '05-implement-auth.md', 100, 99), false);
  assert.equal(stageLanded([], '05-implement-auth.md', 100, null), false);
  assert.equal(stageLanded(['/r/.ai/workflows/a/04-plan-ui.md'], null, 100, null), true);
  assert.equal(stageLanded([], null, 100, null), false);
});

test('compactEligible: an answered main-loop stage turn of a compacting key, on an open workflow with a next step', () => {
  const workflow = { slug: 'a', status: 'active', terminal: false, currentStage: 'implement', selectedSlice: 'auth', nextInvocation: '/wf verify a auth' };
  const command = { key: 'implement', slug: 'a', slice: 'auth' };
  const end = { reason: 'answer' };
  assert.equal(compactEligible(command, workflow, end), true);
  assert.equal(compactEligible(null, workflow, end), false);
  assert.equal(compactEligible(command, null, end), false);
  assert.equal(compactEligible(command, workflow, { reason: 'aborted' }), false);
  assert.equal(compactEligible(command, workflow, { reason: 'error' }), false);
  assert.equal(compactEligible(command, workflow, { reason: 'answer', agentId: 'sub' }), false);
  assert.equal(compactEligible({ ...command, slug: null }, workflow, end), false);
  assert.equal(compactEligible({ ...command, key: 'review' }, workflow, end), false);
  assert.equal(compactEligible({ ...command, key: 'intake' }, workflow, end), false);
  assert.equal(compactEligible({ ...command, key: 'auto' }, workflow, end), false);
  assert.equal(compactEligible({ ...command, key: 'status' }, workflow, end), false);
  assert.equal(compactEligible(command, { ...workflow, terminal: true }, end), false);
  assert.equal(compactEligible(command, { ...workflow, nextInvocation: null }, end), false);
  assert.deepEqual([...COMPACT_KEYS], ['shape', 'slice', 'plan', 'implement', 'verify', 'handoff', 'ship', 'retro']);
});

test('compactInstructionsOf names the position, the paths (or their count past twelve), and what to keep and drop', () => {
  const workflow = { slug: 'a', status: 'active', terminal: false, currentStage: 'plan', selectedSlice: null, nextInvocation: '/wf implement a ui' };
  const command = { key: 'plan', slug: 'a', slice: 'ui' };
  const one = compactInstructionsOf(workflow, command, ['/r/.ai/workflows/a/04-plan-ui.md', '/r/.ai/workflows/a/04-plan-ui.md']);
  assert.equal(
    one,
    'The /wf plan stage of workflow a is complete. Keep the workflow slug a, the next invocation /wf implement a ui. Keep the paths of the artifacts written this turn: /r/.ai/workflows/a/04-plan-ui.md. Keep verbatim every decision, acceptance criterion, blocker, and answer the person gave that is not yet written to an artifact. Drop tool output, test logs, and file contents; the next stage re-reads the artifacts from disk.',
  );
  const none = compactInstructionsOf({ ...workflow, selectedSlice: 'ui' }, command, []);
  assert.match(none, /^The \/wf plan stage of workflow a is complete\. Keep the workflow slug a, the selected slice ui, the next invocation \/wf implement a ui\. Keep verbatim/u);
  assert.doesNotMatch(none, /written this turn/u);
  const many = compactInstructionsOf(workflow, command, Array.from({ length: 13 }, (_, i) => `/r/.ai/workflows/a/f${i}.md`));
  assert.match(many, / Keep the paths of the 13 artifacts written this turn under \.ai\/workflows\/a\/\. /u);
});

test('compactKeepSentenceOf names the position fields that are present; compactToastOf carries the percent when known', () => {
  assert.equal(
    compactKeepSentenceOf({ slug: 'a', status: 'active', terminal: false, currentStage: 'implement', selectedSlice: 'auth', nextInvocation: '/wf verify a auth' }),
    'Keep the active /wf workflow a, its stage implement, its slice auth, its next invocation /wf verify a auth, the paths under .ai/workflows/a/.',
  );
  assert.equal(
    compactKeepSentenceOf({ slug: 'a', status: 'active', terminal: false, currentStage: null, selectedSlice: null, nextInvocation: null }),
    'Keep the active /wf workflow a, the paths under .ai/workflows/a/.',
  );
  assert.equal(compactToastOf('implement', 62), 'wf: compacting after implement (context 62%)');
  assert.equal(compactToastOf('implement', null), 'wf: compacting after implement');
});

test('settingsOf reads stageCompact like every other boolean field', () => {
  assert.equal(settingsOf({}).stageCompact, true);
  assert.equal(settingsOf({ stageCompact: false }).stageCompact, false);
  assert.equal(settingsOf({ stageCompact: 'no' }).stageCompact, true);
  assert.equal(settingOfKey('sdlc-workflow', 'sdlc-workflow.stageCompact'), 'stageCompact');
});

const NL = String.fromCharCode(10);
const IDENTITY = { session: 'abcdef01', host: 'cli', surface: 'none', interactive: false };

test('a probe row carries the identity, the fact, and a whole-second timestamp', () => {
  const row = rowOf(IDENTITY, { event: 'load', ok: true, detail: 'x'.repeat(200) }, 1_700_000_000_123);
  assert.equal(row.at, '2023-11-14T22:13:20Z');
  assert.equal(row.session, 'abcdef01');
  assert.equal(row.host, 'cli');
  assert.equal(row.surface, 'none');
  assert.equal(row.interactive, false);
  assert.equal(row.detail.length, 200);
  assert.equal(rowOf(IDENTITY, { event: 'turn', ok: false }, 0).detail, '');
});

test('the journal text keeps the newest rows up to the cap, and a broken line is dropped', () => {
  const rows = Array.from({ length: PROBE_CAP + 5 }, (_, i) => rowOf(IDENTITY, { event: 'turn', ok: true, detail: String(i) }, i * 1000));
  const kept = rowsOf(textOf(rows));
  assert.equal(kept.length, PROBE_CAP);
  assert.equal(kept[0].detail, '5');
  assert.equal(kept.at(-1).detail, String(PROBE_CAP + 4));
  assert.equal(textOf([]), '');
  assert.deepEqual(rowsOf(['not json', '{"no":"fields"}', ''].join(NL)), []);
});

test('surfaceAfterAttach keeps a surface the session already had', () => {
  assert.equal(surfaceAfterAttach(null, 'desktop'), 'desktop');
  assert.equal(surfaceAfterAttach('terminal', 'mobile'), 'terminal');
  assert.equal(surfaceAfterAttach('desktop', 'desktop'), 'desktop');
});

test('the verdict groups by host and surface, and calls a host without a load row dead', () => {
  const rows = rowsOf([
    JSON.stringify({ at: '2026-09-22T10:00:00Z', session: 's1', host: 'cli', surface: 'terminal', interactive: true, event: 'load', ok: true, detail: '' }),
    JSON.stringify({ at: '2026-09-22T10:00:01Z', session: 's1', host: 'cli', surface: 'terminal', interactive: true, event: 'commands', ok: true, detail: '24/24' }),
    JSON.stringify({ at: '2026-09-22T10:00:02Z', session: 's1', host: 'cli', surface: 'terminal', interactive: true, event: 'turn', ok: true, detail: 'implement a · landed true · compact' }),
    JSON.stringify({ at: '2026-09-22T10:00:03Z', session: 's1', host: 'cli', surface: 'terminal', interactive: true, event: 'compact', ok: true, detail: 'done' }),
    JSON.stringify({ at: '2026-09-22T11:00:00Z', session: 's2', host: 'desktop', surface: 'none', interactive: false, event: 'commands', ok: false, detail: '0/24' }),
    JSON.stringify({ at: '2026-09-22T11:00:01Z', session: 's2', host: 'desktop', surface: 'none', interactive: false, event: 'call', ok: false, detail: 'fill: refused' }),
  ].join(NL));
  const [newest, older] = verdictOf(rows);
  assert.equal(newest.host, 'desktop');
  assert.equal(newest.status, 'dead');
  assert.equal(newest.commandsOk, false);
  assert.deepEqual(newest.failures, ['fill: refused']);
  assert.equal(older.host, 'cli');
  assert.equal(older.status, 'ok');
  assert.equal(older.sessions, 1);
  assert.equal(older.turns, 1);
  assert.equal(older.actions, 1);
  assert.equal(older.compactions, 'done 1');
  assert.equal(sinceOf(rows, Date.parse('2026-09-22T10:30:00Z')).length, 2);
  assert.equal(sinceOf(rows, null).length, 6);
});

test('the journal serializes its writes, caps the file, and swallows a broken file system', async () => {
  const files = new Map();
  let at = 0;
  const io = {
    read: async (path) => files.get(path) ?? null,
    write: async (path, text) => { files.set(path, text); },
    now: async () => { at += 1000; return at; },
  };
  const journal = new ProbeJournal(io, '/j.jsonl', IDENTITY);
  journal.write({ event: 'load', ok: true, detail: 'one' });
  journal.write({ event: 'commands', ok: true, detail: '24/24' });
  journal.setSurface('desktop');
  await journal.write({ event: 'turn', ok: true, detail: 'two' });
  const rows = rowsOf(files.get('/j.jsonl'));
  assert.deepEqual(rows.map((r) => r.event), ['load', 'commands', 'turn']);
  assert.deepEqual(rows.map((r) => r.surface), ['none', 'none', 'desktop']);
  assert.equal(journal.surface, 'desktop');

  // One kind of call failure is one row per session.
  journal.callFailed('fill', 'refused');
  journal.callFailed('fill', 'refused again');
  await journal.settled();
  assert.equal(rowsOf(files.get('/j.jsonl')).filter((r) => r.event === 'call').length, 1);

  const broken = new ProbeJournal({ read: async () => { throw new Error('EACCES'); }, write: async () => {}, now: async () => 0 }, '/j.jsonl', IDENTITY);
  await broken.write({ event: 'load', ok: true });
});
