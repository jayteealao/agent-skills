// The pure parts of the /wf picker mod (hooks/mod/picker.ts, workflows.ts),
// run under `node --experimental-strip-types --test`. The wrapper
// tests/unit/wf-picker-mod.test.mjs spawns this file; run-all.mjs never runs
// it directly (no `.test.mjs` suffix). The hooks module itself is covered by
// the kit tests in hooks/mod/tests/, run with `claude plugin test hooks/mod`.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CATALOG, commandNameOf, keyOfCommand } from '../../../hooks/mod/catalog.ts';
import { ALL, NONE, fillOf, keyOptions, pageOf, pick, sliceOptions, slugOptions, stepFor, titleOf } from '../../../hooks/mod/picker.ts';
import { findProjectRoot, frontmatterOf, joinPath, listSlices, listWorkflows, rosterOf } from '../../../hooks/mod/workflows.ts';

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
