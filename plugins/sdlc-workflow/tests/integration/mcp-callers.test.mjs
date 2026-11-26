// Who calls the wf MCP server: the PreToolUse hook writes one row for each call that passes, the
// server reads it once by the tool use id, and an agent that the row names cannot call as the
// session or the person. A shell call of a wf script gets a note with the tool call, and runs.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { callerOf, takeCaller, writeBeat, writeCaller } from '../../lib/mcp-callers.mjs';
import { callTool } from '../../mcp/tools.mjs';

const HOOK = join(import.meta.dirname, '..', '..', 'hooks', 'pre-tool-use-all.mjs');
const TOOL = (n) => `mcp__plugin_sdlc-workflow_wf__${n}`;

function project() {
  const root = mkdtempSync(join(tmpdir(), 'mcp-callers-'));
  mkdirSync(join(root, '.ai', 'workflows', 'demo'), { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  const rows = join(root, '.rows');
  return { root, rows, env: { SDLC_MCP_CALLERS_DIR: rows, SDLC_MCP_SHELL_CALLS: join(root, '.shell-calls.jsonl') }, done: () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) };
}

function hook(payload, p) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: p.root, ...payload }), encoding: 'utf8', cwd: p.root, env: { ...process.env, ...p.env, CLAUDE_PROJECT_DIR: p.root } });
  let out = null;
  try { out = JSON.parse(r.stdout.trim().split('\n').at(-1)); } catch { /* no answer */ }
  return { exit: r.status, stderr: r.stderr, out };
}

test('the hook writes one row for a call that passes, and none for a call it blocks', () => {
  const p = project();
  try {
    const ok = hook({ tool_name: TOOL('wf_read'), tool_use_id: 'toolu_01pass', agent_id: 'a1', agent_type: 'workflow-subagent', session_id: 's1', tool_input: { slug: 'demo', items: [{ op: 'decide list' }] } }, p);
    assert.equal(ok.exit, 0, ok.stderr);
    const row = JSON.parse(readFileSync(join(p.rows, 'toolu_01pass.json'), 'utf8'));
    assert.deepEqual([row.agent_id, row.agent_type, row.session_id], ['a1', 'workflow-subagent', 's1']);
    const blocked = hook({ tool_name: TOOL('wf_person'), tool_use_id: 'toolu_01block', agent_id: 'a1', tool_input: { op: 'decide add' } }, p);
    assert.equal(blocked.exit, 2);
    assert.equal(existsSync(join(p.rows, 'toolu_01block.json')), false);
  } finally { p.done(); }
});

test('a row serves one call; the caller of a row is the session or the agent, else unknown', () => {
  const p = project();
  try {
    assert.equal(writeCaller({ tool_use_id: 'toolu_x', cwd: p.root }, p.env), true);
    const row = takeCaller('toolu_x', p.env);
    assert.equal(callerOf(row), 'session');
    assert.equal(takeCaller('toolu_x', p.env), null, 'a row is read once');
    assert.equal(callerOf(null), 'unknown');
    assert.equal(callerOf({ agent_id: 'a', agent_type: 'workflow-subagent' }), 'agent:workflow-subagent');
    assert.equal(writeCaller({ tool_use_id: '../../etc' }, p.env), true);
    assert.deepEqual(readdirSync(p.rows), ['etc.json'], 'an id is a file name, never a path');
  } finally { p.done(); }
});

test('the server: an agent that the row names does not call wf_person, nor as the session or the person', async () => {
  const p = project();
  const identity = { agent_id: 'a1', agent_type: 'workflow-subagent' };
  try {
    const person = await callTool('wf_person', { op: 'decide add', slug: 'demo', key: 'db', question: 'q', answer: 'x' }, { root: p.root, identity, caller: callerOf(identity) });
    assert.equal(person.ok, false);
    assert.match(person.error.message, /does not call wf_person/);
    for (const as of ['session', 'person']) {
      const r = await callTool('wf_decide', { op: 'decide hold', slug: 'demo', key: 'db', question: 'q', as }, { root: p.root, identity, caller: callerOf(identity) });
      assert.equal(r.ok, false);
      assert.match(r.error.message, new RegExp(`does not call as "${as}"`));
    }
    const read = await callTool('wf_read', { slug: 'demo', items: [{ op: 'decide list' }] }, { root: p.root, identity, caller: callerOf(identity) });
    assert.equal(read.ok, true, JSON.stringify(read.error));
  } finally { p.done(); }
});

test('a shell call of a wf script gets a note with the tool call, runs, and is counted', () => {
  const p = project();
  try {
    const stale = hook({ tool_name: 'Bash', session_id: 'S1', tool_input: { command: `node "/p/skills/wf/scripts/wf.mjs" status "${p.root}"` } }, p);
    assert.equal(stale.out?.hookSpecificOutput?.additionalContext, undefined, 'no live server of the session: no note');
    writeBeat('S1', p.env);
    const cmd = `node "${join(import.meta.dirname, '..', '..', 'skills', 'wf', 'scripts', 'wf.mjs').replace(/\\/g, '/')}" step done "${p.root.replace(/\\/g, '/')}" demo api 3 --sha HEAD | tail -1`;
    const r = hook({ tool_name: 'Bash', session_id: 'S1', tool_input: { command: cmd } }, p);
    assert.equal(r.exit, 0, r.stderr);
    assert.equal(r.out?.hookSpecificOutput?.permissionDecision, undefined, 'the call is not denied or asked');
    assert.match(r.out?.hookSpecificOutput?.additionalContext ?? '', /wf_step \{ "op": "step done", "slug": "demo", "slice": "api"/);
    const lines = readFileSync(p.env.SDLC_MCP_SHELL_CALLS, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).op, 'step done');
    const plain = hook({ tool_name: 'Bash', session_id: 'S1', tool_input: { command: 'node build.mjs && ls' } }, p);
    assert.equal(plain.exit, 0);
    assert.equal(plain.out?.hookSpecificOutput?.additionalContext, undefined);
  } finally { p.done(); }
});
