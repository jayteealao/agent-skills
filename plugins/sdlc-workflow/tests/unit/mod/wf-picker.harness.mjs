// The pure parts of the /wf picker mod (hooks/mod/picker.ts, workflows.ts),
// run under `node --experimental-strip-types --test`. The wrapper
// tests/unit/wf-picker-mod.test.mjs spawns this file; run-all.mjs never runs
// it directly (no `.test.mjs` suffix). The hooks module itself is covered by
// the kit tests in hooks/mod/tests/, run with `claude plugin test hooks/mod`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CATALOG, commandNameOf, keyOfCommand } from '../../../hooks/mod/catalog.ts';
import { ALL, NONE, fillOf, filterOptions, hotkeyOf, keyOptions, pageOf, pick, sliceOptions, slugOptions, stepFor, titleOf } from '../../../hooks/mod/picker.ts';
import { findProjectRoot, frontmatterOf, joinPath, listSlices, listWorkflows, rosterOf } from '../../../hooks/mod/workflows.ts';
import {
  beatsOf, costTextOf, driverStatusOf, expectedArtifactOf, hubHealthOf, hubNoticeTextOf, isWorkflowPath,
  ledgerTokensOf, modeLabelOf, openFindingsOf, settingOfKey, settingsOf, slugOfPath, spinnerWordOf, statusTextOf,
  reviewLedgerNameOf, shipPlanBlockersOf, stripTextOf, wfCommandOf, yamlListItemsOf,
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

test('the catalog holds the 22 keys, each with a wf-<key> command name', () => {
  assert.equal(CATALOG.length, 22);
  assert.deepEqual(CATALOG.slice(0, 10).map((e) => e.key), ['intake', 'shape', 'slice', 'plan', 'implement', 'verify', 'review', 'handoff', 'ship', 'retro']);
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
  assert.equal(keyOptions().length, 22);
  assert.equal(keyOptions()[3].label, 'plan  Plan one or more workflow slices.');

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
  assert.equal(keys.length, 22);
  const first = pageOf(keys, 0, 9);
  assert.deepEqual({ page: first.page, pages: first.pages, length: first.items.length }, { page: 0, pages: 3, length: 9 });
  assert.equal(first.items[0].value, 'intake');
  const last = pageOf(keys, 2, 9);
  assert.deepEqual({ page: last.page, length: last.items.length }, { page: 2, length: 4 });
  assert.equal(last.items[3].value, 'observability');
  assert.equal(pageOf(keys, 3, 9).page, 0, 'a page past the last wraps to the first');
  assert.equal(pageOf(keys, -1, 9).page, 2, 'a page before the first wraps to the last');
  const one = pageOf(keys, 0, 0);
  assert.deepEqual({ pages: one.pages, length: one.items.length }, { pages: 22, length: 1 }, 'a width below one is one');
  const empty = pageOf([], 4, 9);
  assert.deepEqual(empty, { items: [], page: 0, pages: 1 });
});

test('hotkeyOf gives the nine digits, then the letters, then nothing', () => {
  assert.deepEqual([0, 8, 9, 34, 35].map(hotkeyOf), ['1', '9', 'a', 'z', undefined]);
  assert.equal(hotkeyOf(-1), undefined);
});

test('filterOptions keeps the rows whose value or label holds every word, case-insensitively', () => {
  const keys = keyOptions();
  assert.equal(filterOptions(keys, '').length, 22, 'no text keeps every row');
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
  assert.equal(statusTextOf(wf), 'wf alpha · implement · auth');
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
