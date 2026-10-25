// The first-run setup: the .ai/ tree, the project line, and the facts that ship needs.

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ignoreAi, needsSetup, setupProject } from '../../../lib/setup.mjs';

/** A fake runner: git says `.ai/` is not ignored; gh is not logged in. */
const fake = ({ ignored = false } = {}) => (cmd, args) => {
  if (cmd === 'git' && args[0] === 'check-ignore') return { status: ignored ? 0 : 1, stdout: '', stderr: '' };
  return { status: 1, stdout: '', stderr: 'not logged in' };
};

test('setup writes the tree and the project line, and keeps the first time', () => {
  const root = mkdtempSync(join(tmpdir(), 'setup-'));
  try {
    assert.equal(needsSetup(root), true);
    const r = setupProject(root, { about: 'A CLI for notes', run: fake(), now: new Date('2026-10-25T10:00:00Z') });
    assert.equal(r.created, true);
    assert.ok(existsSync(join(root, '.ai', 'workflows')));
    assert.equal(needsSetup(root), false);
    assert.deepEqual(r.project, { about: 'A CLI for notes', setupAt: '2026-10-25T10:00:00Z' });
    assert.equal(r.ignored, false);
    assert.deepEqual(r.gaps.map((g) => g.code), ['no-plan', 'no-gh-login']);
    assert.match(r.facts.reason, /gh repo view failed/);
    const again = setupProject(root, { run: fake(), now: new Date('2026-10-26T10:00:00Z') });
    assert.equal(again.created, false);
    assert.deepEqual(again.project, { about: 'A CLI for notes', setupAt: '2026-10-25T10:00:00Z' });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the .gitignore line is added once, and only with --ignore', () => {
  const root = mkdtempSync(join(tmpdir(), 'setup-'));
  try {
    writeFileSync(join(root, '.gitignore'), 'node_modules/');
    assert.equal(setupProject(root, { run: fake() }).ignoreAdded, false);
    const r = setupProject(root, { ignore: true, run: fake() });
    assert.deepEqual([r.ignoreAdded, r.ignored], [true, true]);
    assert.equal(readFileSync(join(root, '.gitignore'), 'utf8'), 'node_modules/\n.ai/\n');
    assert.equal(ignoreAi(root), false, 'a second add changes nothing');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
