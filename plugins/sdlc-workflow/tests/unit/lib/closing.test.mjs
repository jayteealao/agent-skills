// Closing: the open workflows whose branch is merged, and the close of one.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { closeCandidates, closeWorkflow, mergedReason } from '../../../lib/closing.mjs';
import { frontmatterOfDoc, readDoc } from '../../../lib/records.mjs';

function project(indexes) {
  const root = mkdtempSync(join(tmpdir(), 'closing-'));
  for (const [slug, fm] of Object.entries(indexes)) {
    mkdirSync(join(root, '.ai', 'workflows', slug), { recursive: true });
    writeFileSync(join(root, '.ai', 'workflows', slug, '00-index.md'), `---\nschema: sdlc/v1\ntype: index\nslug: ${slug}\n${fm}\n---\n`);
  }
  return root;
}

/** A fake runner: gh answers the PR state of `prs`; git says the branch is in the base when `inBase`. */
const fake = ({ prs = {}, inBase = false } = {}) => {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === 'gh') return { status: 0, stdout: JSON.stringify({ state: prs[args[2]] ?? 'OPEN' }), stderr: '' };
    if (args[0] === 'merge-base') return { status: inBase ? 0 : 1, stdout: '', stderr: '' };
    return { status: 0, stdout: 'x', stderr: '' };
  };
  return { run, calls };
};

const W = (slug, fm) => ({ slug, directorySlug: slug, frontmatter: fm });

test('a merged PR asks; an open PR, a closed workflow, a declined one and a base branch do not', () => {
  const home = mkdtempSync(join(tmpdir(), 'closing-home-'));
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  try {
    const { run, calls } = fake({ prs: { 1: 'MERGED', 2: 'OPEN' } });
    const ws = [
      W('a', { status: 'active', branch: 'feat/a', 'base-branch': 'main', 'pr-number': 1 }),
      W('b', { status: 'active', branch: 'feat/b', 'base-branch': 'main', 'pr-number': 2 }),
      W('c', { status: 'closed', branch: 'feat/c', 'base-branch': 'main', 'pr-number': 1 }),
      W('d', { status: 'active', branch: 'feat/d', 'base-branch': 'main', 'pr-number': 1, 'close-declined-at': '2026-10-25T00:00:00Z' }),
      W('e', { status: 'active', branch: 'main', 'base-branch': 'main', 'pr-number': 1 }),
    ];
    assert.deepEqual(closeCandidates('/r', ws, { run }), [{ slug: 'a', reason: 'PR 1 is merged' }]);
    const before = calls.length;
    closeCandidates('/r', ws, { run });
    assert.equal(calls.filter((c) => c[0] === 'gh').length, 2, 'the cached answers are not asked again');
    assert.ok(calls.length - before < 4);
  } finally {
    if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
    rmSync(home, { recursive: true, force: true });
  }
});

test('with no PR, a branch in the base counts only once implement is complete', () => {
  const fm = { status: 'active', branch: 'feat/a', 'base-branch': 'main', progress: { implement: 'in-progress' } };
  assert.equal(mergedReason('/r', fm, { run: fake({ inBase: true }).run }), null, 'a new branch is in the base too');
  assert.match(mergedReason('/r', { ...fm, progress: { implement: 'complete' } }, { run: fake({ inBase: true }).run }), /feat\/a is in origin\/main/);
  assert.equal(mergedReason('/r', { ...fm, progress: { implement: 'complete' } }, { run: fake({ inBase: false }).run }), null);
});

test('close writes the close record and the index fields; decline only records the no', () => {
  const root = project({
    a: 'status: active\ncurrent-stage: review\nbranch: feat/a\npr-url: https://x/pull/1\nprogress:\n  intake: complete\n  review: in-progress\nworkflow-files: [01-intake.md]',
    b: 'status: active',
  });
  try {
    assert.equal(closeWorkflow(root, 'a').closed, true);
    const index = frontmatterOfDoc(join(root, '.ai', 'workflows', 'a'), '00-index.md');
    assert.deepEqual([index.status, index['close-reason'], index['workflow-files']], ['closed', 'merged', ['01-intake.md', '99-close.md']]);
    const rec = readDoc(join(root, '.ai', 'workflows', 'a'), '99-close.md');
    assert.deepEqual([rec.frontmatter.type, rec.frontmatter['stages-completed'], rec.frontmatter['stages-incomplete']], ['close-record', ['intake'], ['review']]);
    assert.match(closeWorkflow(root, 'a').reason, /already closed/);
    assert.equal(closeWorkflow(root, 'b', { decline: true }).declined, true);
    assert.ok(frontmatterOfDoc(join(root, '.ai', 'workflows', 'b'), '00-index.md')['close-declined-at']);
    assert.equal(closeWorkflow(root, 'zzz').ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
