// The brainstorm page: the brief of the page agent, the checks of its draft, and the put.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { boardVersion, checkPage, pageBrief, putPage } from '../../../lib/brainstorm-page.mjs';

const BOARD = {
  areas: [{ key: 'limits', state: 'explored' }],
  threads: [{ key: 'limit-per-project', state: 'live' }],
  items: [
    { key: 'limit-warns-only', kind: 'decision', text: 'A limit warns.' },
    { key: 'cost-rows', kind: 'finding', text: 'One row per run.' },
  ],
  work: [{ key: 'spending-limit', order: 1 }],
};

function project() {
  const root = mkdtempSync(join(tmpdir(), 'bs-page-'));
  const dir = join(root, '.ai', 'workflows', 'b1');
  mkdirSync(join(dir, '.draft'), { recursive: true });
  writeFileSync(join(dir, 'brainstorm-board.json'), JSON.stringify(BOARD));
  writeFileSync(join(dir, 'decisions.yaml'), 'schema: sdlc/v1\ntype: decisions\ndecisions:\n  - id: D-001\n    kind: answer\n    key: store\n    answer: SQLite\n');
  return { root, dir };
}

const page = (version, keys) => `<!doctype html><html><head><meta name="viewport" content="width=device-width"><meta name="wf:board" content="${version}"><title>Limits</title>
<style>@media (prefers-color-scheme: dark) { body { background: #111 } }</style></head><body>${keys.map((k) => `<p data-key="${k}">x</p>`).join('')}</body></html>`;

test('the brief names every key; a good draft goes into place; a later board makes it stale', () => {
  const { root, dir } = project();
  try {
    const b = pageBrief(root, 'b1');
    assert.deepEqual(b.keys, { areas: ['limits'], threads: ['limit-per-project'], decisions: ['limit-warns-only'], work: ['spending-limit'], ledger: ['D-001'] });
    writeFileSync(b.draft, page(b.version, ['limits', 'limit-per-project', 'limit-warns-only', 'spending-limit', 'D-001']));
    assert.deepEqual(putPage(root, 'b1').ok, true);
    assert.ok(existsSync(join(dir, 'page', 'index.html')) && !existsSync(b.draft));
    assert.deepEqual(checkPage(root, 'b1'), { ok: true, exists: true, stale: false, problems: [] });
    writeFileSync(join(dir, 'brainstorm-board.json'), JSON.stringify({ ...BOARD, threads: [...BOARD.threads, { key: 'crowd' }] }));
    const c = checkPage(root, 'b1');
    assert.equal(c.stale, true);
    assert.match(c.problems.join('\n'), /threads: crowd/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a draft with a missing key, a network load or no dark scheme stays a draft', () => {
  const { root, dir } = project();
  try {
    const v = boardVersion(dir);
    const draft = join(dir, '.draft', 'page.html');
    writeFileSync(draft, page(v, ['limits']).replace('prefers-color-scheme: dark', 'min-width: 1px').replace('<title>', '<script src="https://cdn.example/x.js"></script><title>'));
    const r = putPage(root, 'b1');
    assert.equal(r.ok, false);
    // The dark scheme, the network load, and four groups of keys.
    assert.equal(r.problems.length, 6, r.problems.join('\n'));
    assert.match(r.problems.join('\n'), /decisions: limit-warns-only/);
    assert.ok(existsSync(draft));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
