// lib/test-receipt.mjs and `wf.mjs receipt`: a stray change outside .ai is named in the receipt,
// not refused, and the receipt stays reusable only while that file keeps its hash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { receiptState, treeChanges } from '../../lib/test-receipt.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = (...a) => spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), ...a], { encoding: 'utf8' });

function repo() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-receipt-'));
  const git = (...a) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'core.autocrlf=false', ...a], { encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'core.autocrlf', 'false');
  writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n');
  writeFileSync(path.join(root, 'a.js'), 'export const a = 1;\n');
  mkdirSync(path.join(root, '.ai', 'workflows', 'demo'), { recursive: true });
  writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), `${JSON.stringify({ testProfile: { fast: { command: 'node --version', estimateSeconds: 1 } } }, null, 2)}\n`);
  writeFileSync(path.join(root, '.ai', 'workflows', 'demo', 'notes.md'), 'one\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  return { root, git, done: () => rmSync(root, { recursive: true, force: true }) };
}

test('a receipt with a stray .gitignore change is written with a dirty entry, and is reusable while the file is unchanged', () => {
  const r = repo();
  try {
    writeFileSync(path.join(r.root, '.gitignore'), 'node_modules/\ncoverage/\n');
    const hash = r.git('hash-object', '--', '.gitignore');
    assert.deepEqual(treeChanges(r.root), [{ path: '.gitignore', hash }]);

    const run = cli('receipt', r.root, 'demo', 'api', '--json');
    assert.equal(run.status, 0, run.stderr);
    const file = path.join(r.root, '.ai', 'workflows', 'demo', '.test-receipt-api.json');
    const receipt = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(receipt.result, 'pass');
    assert.deepEqual(receipt.commands, ['node --version']);
    assert.deepEqual(receipt.dirty, [{ path: '.gitignore', hash }]);

    // Reusable while the file keeps its hash; a change under .ai does not count.
    writeFileSync(path.join(r.root, '.ai', 'workflows', 'demo', 'notes.md'), 'two\n');
    assert.deepEqual(receiptState(r.root, receipt), { reusable: true, reason: null });
    const check = cli('receipt', r.root, 'demo', 'api', '--check');
    assert.equal(check.status, 0);
    assert.equal(check.stdout.trim(), `receipt reusable: node --version passed at ${receipt.sha.slice(0, 8)}`);

    // The listed file changes again: stale.
    writeFileSync(path.join(r.root, '.gitignore'), 'node_modules/\ncoverage/\ndist/\n');
    const stale = cli('receipt', r.root, 'demo', 'api', '--check');
    assert.equal(stale.status, 1);
    assert.equal(stale.stdout.trim(), 'receipt stale: .gitignore changed after the receipt');

    // Back to the receipt's content: reusable again. A change in a file that a suite reads: stale.
    writeFileSync(path.join(r.root, '.gitignore'), 'node_modules/\ncoverage/\n');
    assert.equal(receiptState(r.root, receipt).reusable, true);
    writeFileSync(path.join(r.root, 'a.js'), 'export const a = 2;\n');
    assert.deepEqual(receiptState(r.root, receipt), { reusable: false, reason: 'a.js changed after the receipt' });

    // A listed file that goes back to HEAD is not the tree that ran either.
    writeFileSync(path.join(r.root, 'a.js'), 'export const a = 1;\n');
    writeFileSync(path.join(r.root, '.gitignore'), 'node_modules/\n');
    assert.deepEqual(receiptState(r.root, receipt), { reusable: false, reason: `.gitignore is back to ${receipt.sha.slice(0, 8)} after the receipt` });

    // A code commit after the receipt's sha: stale.
    writeFileSync(path.join(r.root, '.gitignore'), 'node_modules/\ncoverage/\n');
    writeFileSync(path.join(r.root, 'b.js'), 'export const b = 1;\n');
    r.git('add', '--', 'b.js');
    r.git('commit', '-q', '-m', 'b');
    assert.deepEqual(receiptState(r.root, receipt), { reusable: false, reason: 'b.js changed after the receipt' });
  } finally { r.done(); }
});

test('receipt --check: no receipt file, and an old receipt with no dirty list needs a clean tree', () => {
  const r = repo();
  try {
    const none = cli('receipt', r.root, 'demo', 'api', '--check');
    assert.equal(none.status, 1);
    assert.equal(none.stdout.trim(), 'no receipt');
    const old = { sha: r.git('rev-parse', 'HEAD'), commands: ['node --version'], result: 'pass', at: '2026-10-01T00:00:00Z' };
    assert.equal(receiptState(r.root, old).reusable, true);
    writeFileSync(path.join(r.root, '.gitignore'), 'x\n');
    assert.deepEqual(receiptState(r.root, old), { reusable: false, reason: '.gitignore changed after the receipt' });
    assert.equal(receiptState(r.root, { ...old, result: 'fail' }).reusable, false);
  } finally { r.done(); }
});
