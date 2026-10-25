// tests/unit/lib/records-root.test.mjs
//
// The one resolver of the record paths, and the refusal of a write into a nested `.ai/`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { nestedAiDir, parseWorkflowPath, workflowDir, workflowRel, workflowsRoot } from '../../../lib/records-root.mjs';

test('the resolver gives the records folder and the folder of one workflow', () => {
  assert.equal(workflowsRoot('/r'), join('/r', '.ai', 'workflows'));
  assert.equal(workflowDir('/r', 'demo'), join('/r', '.ai', 'workflows', 'demo'));
  assert.equal(workflowRel('demo'), '.ai/workflows/demo');
});

test('a record path parses back to its root, slug and file', () => {
  assert.deepEqual(parseWorkflowPath('C:\\r\\.ai\\workflows\\demo\\verify-evidence\\a\\checks.md'), {
    root: 'C:/r/.ai/workflows', slug: 'demo', storageRel: 'verify-evidence/a/checks.md', filename: 'checks.md',
  });
  assert.equal(parseWorkflowPath('/r/.ai/simplify/x.md'), null);
});

test('a write into a nested .ai folder is refused; the project, a checkout and another tool are not', () => {
  const root = mkdtempSync(join(tmpdir(), 'records-root-'));
  try {
    mkdirSync(join(root, '.ai', 'workflows', 'demo'), { recursive: true });
    mkdirSync(join(root, 'sub', 'wt'), { recursive: true });
    writeFileSync(join(root, 'sub', 'wt', '.git'), 'gitdir: elsewhere\n');
    const at = (...p) => join(root, ...p);
    assert.equal(nestedAiDir(at('.ai', 'workflows', 'demo', '01-intake.md'), root), null, 'the project store');
    assert.equal(nestedAiDir(at('src', 'app.ts'), root), null, 'no .ai at all');
    assert.equal(nestedAiDir(at('sub', 'wt', '.ai', 'workflows', 'demo', 'x.md'), root), null, 'a worktree has its own store');
    assert.equal(nestedAiDir(at('tools', '.ai', 'prompts', 'p.md'), root), null, 'another tool owns that .ai folder');
    assert.equal(nestedAiDir(at('src', '.ai', 'workflows', 'demo', 'x.md'), root), join(root, 'src', '.ai'), 'a subfolder store');
    assert.equal(nestedAiDir(at('.ai', 'workflows', 'demo', '.ai', '_view', 'i.html'), root), join(root, '.ai', 'workflows', 'demo', '.ai'), 'a store inside a workflow folder');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
