// lib/hook-runner.mjs — a stage error passes the tool call, except in a fail-closed
// schema gate (five-layer review F-5).
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const RUNNER = new URL('../../../lib/hook-runner.mjs', import.meta.url).href;

function runPlan(stagesSource) {
  const cwd = mkdtempSync(join(tmpdir(), 'hook-runner-'));
  try {
    const script = `import { runFolded, blockToolCall } from ${JSON.stringify(RUNNER)};
const boom = () => { throw new Error('schema file missing'); };
const block = () => { process.stderr.write('blocked\\n'); blockToolCall(); };
const ok = () => {};
runFolded('t', () => ${stagesSource}, { stopOnBlock: false });`;
    return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd, input: JSON.stringify({ cwd }), encoding: 'utf8',
      env: { ...process.env, CLAUDE_PLUGIN_INSTALL: '', SDLC_DISPATCH_ACTIVE: '' },
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('a stage error passes the tool call', () => {
  const res = runPlan(`[['a', boom], ['b', ok]]`);
  assert.equal(res.status, 0, res.stderr);
});

test('a HookBlock blocks', () => {
  const res = runPlan(`[['a', block], ['b', ok]]`);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /blocked/);
});

test('a fail-closed stage blocks on an error and says why', () => {
  const res = runPlan(`[['gate', boom, { failClosed: true }], ['b', ok]]`);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /gate: the schema gate could not run \(schema file missing\)/);
});

test('a fail-closed stage that passes does not block', () => {
  const res = runPlan(`[['gate', ok, { failClosed: true }]]`);
  assert.equal(res.status, 0, res.stderr);
});

test('the checks of one payload share one project root and one config; another directory resolves again', async () => {
  const { hookConfig, hookProjectRoot } = await import(RUNNER);
  const a = mkdtempSync(join(tmpdir(), 'hook-ctx-a-'));
  const b = mkdtempSync(join(tmpdir(), 'hook-ctx-b-'));
  try {
    const input = { cwd: a, tool_input: { command: 'echo hi > x.txt' } };
    const root = hookProjectRoot(input);
    assert.equal(hookProjectRoot(input), root);
    assert.equal(hookConfig(input), hookConfig(input), 'one config load per payload');
    assert.equal((await hookConfig(input)).checks, 'strict');
    input.cwd = b;
    assert.notEqual(hookProjectRoot(input), root, 'a changed directory resolves again');
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});
