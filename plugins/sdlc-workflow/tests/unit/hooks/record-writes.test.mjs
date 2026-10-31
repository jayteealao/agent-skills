// tests/unit/hooks/record-writes.test.mjs
//
// Scripts write the records: the pre-write hook refuses an agent's Write or Edit of a record
// file, of a store that one command writes and of an old record name beside the records, and
// lets a draft through.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const PLUGIN_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const HOOK = join(PLUGIN_ROOT, 'hooks', 'pre-tool-use-all.mjs');

function write(rel, toolInput) {
  const tmp = mkdtempSync(join(tmpdir(), 'record-writes-'));
  try {
    mkdirSync(join(tmp, '.ai', 'workflows', 'demo'), { recursive: true });
    return spawnSync(process.execPath, [HOOK], {
      cwd: tmp,
      encoding: 'utf-8',
      input: JSON.stringify({ cwd: tmp, tool_input: { file_path: `.ai/workflows/demo/${rel}`, ...toolInput } }),
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, SDLC_HOME: join(tmp, 'home') },
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const PLAN = '---\nschema: sdlc/v1\ntype: plan\nslug: demo\n---\nbody\n';

test('a Write or Edit of a record file is refused', () => {
  for (const name of ['state.yaml', 'slice-a.yaml', 'review-a.yaml', 'intake.yaml']) {
    const r = write(name, { content: 'x: 1\n' });
    assert.equal(r.status, 2, name);
    assert.match(r.stderr, /Scripts write the record files/);
    assert.match(r.stderr, /fix: /);
  }
  const e = write('ship.yaml', { old_string: 'a', new_string: 'b' });
  assert.equal(e.status, 2);
});

test('a write of an old record name beside the records is refused, and names the draft', () => {
  const r = write('04-plan-a.md', { content: PLAN });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\.draft\/04-plan-a\.md/);
  assert.match(r.stderr, /record put/);
});

test('a write of a store that one command writes is refused, and names the command', () => {
  for (const [name, command] of [['decisions.yaml', /decide add/], ['findings.yaml', /findings add/], ['steps.jsonl', /step </]]) {
    const r = write(name, { content: 'x: 1\n' });
    assert.equal(r.status, 2, name);
    assert.match(r.stderr, command, name);
  }
});

test('a draft, a free-form file and a file with no place in the layout go through', () => {
  assert.equal(write('.draft/04-plan-a.md', { content: PLAN }).status, 0);
  assert.equal(write('verify-evidence/a/checks.md', { content: 'notes\n' }).status, 0);
  assert.equal(write('run.txt', { content: 'notes\n' }).status, 0);
});
