// The board commands: add, move, regroup and remove change the brainstorm board in one call
// each, and a change that would break the board writes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { INDEX_NAME, writeDoc } from '../../lib/records.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const wf = path.join(pluginRoot, 'scripts', 'wf.mjs');
const run = (args) => spawnSync(process.execPath, [wf, ...args], { encoding: 'utf8', env: { ...process.env, SDLC_HOME: path.join(tmpdir(), 'sdlc-board-home') } });

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-board-'));
  const dir = path.join(root, '.ai', 'workflows', 'ideas');
  mkdirSync(dir, { recursive: true });
  writeDoc(dir, INDEX_NAME, { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'ideas', status: 'active', 'workflow-type': 'brainstorm' } });
  const doc = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', 'intake', 'brainstorm', '_artifact.md'), 'utf8');
  const board = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(doc)[1]);
  Object.assign(board, { slug: 'ideas', 'updated-at': '2026-10-25T10:00:00Z' });
  const file = path.join(dir, 'brainstorm-board.json');
  writeFileSync(file, JSON.stringify(board, null, 2));
  return { root, dir, read: () => JSON.parse(readFileSync(file, 'utf8')), done: () => rmSync(root, { recursive: true, force: true }) };
}

test('board add, move into a new thread, regroup and remove', () => {
  const f = fixture();
  try {
    const add = run(['board', 'add', f.root, 'ideas', 'item', '--key', 'cap-per-run', '--kind', 'idea', '--thread', 'limit-per-project', '--text', 'A cap per run.', '--source', 'person']);
    assert.equal(add.status, 0, add.stderr);
    assert.ok(f.read().items.some((i) => i.key === 'cap-per-run'));
    const move = run(['board', 'move', f.root, 'ideas', 'cap-per-run', 'limit-is-one-number', '--new', 'caps', '--name', 'Spending caps', '--area', 'seeing-the-cost']);
    assert.equal(move.status, 0, move.stderr);
    const b = f.read();
    assert.deepEqual(b.threads.find((t) => t.key === 'caps'), { key: 'caps', name: 'Spending caps', area: 'seeing-the-cost', state: 'live', 'routed-to': null });
    assert.deepEqual(b.items.filter((i) => i.thread === 'caps').map((i) => i.key), ['limit-is-one-number', 'cap-per-run']);
    assert.equal(run(['board', 'add', f.root, 'ideas', 'area', '--key', 'limits', '--name', 'Limits', '--side', 'solution']).status, 0);
    assert.equal(run(['board', 'regroup', f.root, 'ideas', 'caps', '--to', 'limits']).status, 0);
    assert.equal(f.read().threads.find((t) => t.key === 'caps').area, 'limits');
    assert.equal(run(['board', 'remove', f.root, 'ideas', 'cap-per-run']).status, 0);
    assert.ok(!f.read().items.some((i) => i.key === 'cap-per-run'));
  } finally { f.done(); }
});

test('board refusals: a used key, a missing thread, an item that another entry names, and a change that breaks the schema', () => {
  const f = fixture();
  try {
    const before = JSON.stringify(f.read());
    assert.match(run(['board', 'add', f.root, 'ideas', 'item', '--key', 'ledger-format', '--kind', 'idea', '--text', 'x', '--source', 'person']).stderr, /the key ledger-format is in use/);
    assert.match(run(['board', 'move', f.root, 'ideas', 'ledger-format', '--to', 'nope']).stderr, /no thread nope; the threads are: limit-per-project/);
    assert.match(run(['board', 'remove', f.root, 'ideas', 'limit-warns-only']).stderr, /limit-warns-only is named by .*budget monthly-spend-cap/);
    const bad = run(['board', 'add', f.root, 'ideas', 'item', '--key', 'odd', '--kind', 'wish', '--text', 'x', '--source', 'person']);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /the change would break the board, so nothing is written/);
    assert.equal(JSON.stringify(f.read()), before, 'no refused change touched the board');
  } finally { f.done(); }
});
