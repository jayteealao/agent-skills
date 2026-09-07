// tests/unit/hooks/cost-ledger-hook.test.mjs
//
// The Stop hook end to end (WIDE-VIEW-REPAIR-PLAN §10.3): spawn
// hooks/cost-ledger.mjs against a temp repo + temp transcript, read the row
// it appends, and check the cursor, the disable toggle, the pi shape, and the
// Codex wiring (`--plugin-data`, rollout located by session id).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(here, '..', '..', '..');
const HOOK = join(PLUGIN_ROOT, 'hooks', 'cost-ledger.mjs');
const CODEX_ADAPTER = join(PLUGIN_ROOT, 'hooks', 'stop-cost.mjs');
const J = (o) => `${JSON.stringify(o)}\n`;

function runHook(input, { env = {}, args = [], script = HOOK } = {}) {
  const r = spawnSync(process.execPath, [script, ...args], {
    input: JSON.stringify(input),
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PLUGIN_INSTALL: '', SDLC_DISPATCH_ACTIVE: '', ...env },
    timeout: 20_000,
  });
  assert.equal(r.status, 0, `hook must exit 0; stderr: ${r.stderr}`);
  return r;
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-cost-hook-'));
  const repo = join(dir, 'repo');
  const home = join(dir, 'home');
  mkdirSync(join(repo, '.ai', 'workflows', 'demo'), { recursive: true });
  mkdirSync(home, { recursive: true });
  spawnSync('git', ['init', '-q'], { cwd: repo });
  return { dir, repo, home };
}

const claudeAssistant = (requestId, usage, content) => J({
  type: 'assistant', requestId, timestamp: '2026-09-07T10:00:00Z', isSidechain: false, sessionId: 'sess-claude',
  message: { model: 'claude-fable-5-1', usage, content },
});

test('claude Stop: appends one attributed row, keeps a cursor under SDLC_HOME, and writes nothing on a quiet second Stop', () => {
  const { dir, repo, home } = setup();
  try {
    const transcript = join(dir, 'sess-claude.jsonl');
    const usage = { input_tokens: 2, output_tokens: 406, cache_read_input_tokens: 38614, cache_creation_input_tokens: 36574 };
    writeFileSync(transcript, claudeAssistant('r1', usage, [{ type: 'tool_use', name: 'Write', input: { file_path: join(repo, '.ai', 'workflows', 'demo', '04-plan-cli.md'), content: '' } }]));
    const input = { session_id: 'sess-claude', transcript_path: transcript, cwd: repo, hook_event_name: 'Stop' };
    runHook(input, { env: { SDLC_HOME: home } });

    const ledger = join(repo, '.ai', 'workflows', 'demo', 'cost.jsonl');
    assert.ok(existsSync(ledger), 'cost.jsonl written');
    const rows = readFileSync(ledger, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].host, 'claude');
    assert.equal(rows[0].key, 'plan');
    assert.equal(rows[0].slice, 'cli');
    assert.equal(rows[0].turn, 1);
    assert.deepEqual(rows[0].main, { model: 'claude-fable-5-1', ...usage });
    assert.deepEqual(rows[0].subagents, []);
    assert.ok(existsSync(join(home, 'cost-cursor', 'sess-claude.json')), 'cursor under SDLC_HOME/cost-cursor');
    assert.ok(!existsSync(join(repo, '.ai', 'workflows', 'demo', '00-index.md')), 'the hook never writes 00-index.md');

    runHook(input, { env: { SDLC_HOME: home } });
    assert.equal(readFileSync(ledger, 'utf-8').trim().split('\n').length, 1, 'no usage → no row');

    // A gate-question turn: usage, no artifact write → inherits demo/plan.
    appendFileSync(transcript, claudeAssistant('r2', { input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, [{ type: 'text', text: 'ok?' }]));
    runHook(input, { env: { SDLC_HOME: home } });
    const rows2 = readFileSync(ledger, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(rows2.length, 2);
    assert.equal(rows2[1].key, 'plan');
    assert.equal(rows2[1].turn, 3, 'turn counter counts every Stop, including the quiet one');
    assert.equal(rows2[1].main.output_tokens, 7);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('hooks.costLedger:false disables the row; a payload without session_id writes nothing', () => {
  const { dir, repo, home } = setup();
  try {
    writeFileSync(join(repo, '.ai', 'sdlc-config.json'), JSON.stringify({ hooks: { costLedger: false } }));
    const transcript = join(dir, 't.jsonl');
    writeFileSync(transcript, claudeAssistant('r1', { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, [{ type: 'tool_use', name: 'Write', input: { file_path: join(repo, '.ai', 'workflows', 'demo', '04-plan.md') } }]));
    runHook({ session_id: 's', transcript_path: transcript, cwd: repo }, { env: { SDLC_HOME: home } });
    assert.ok(!existsSync(join(repo, '.ai', 'workflows', 'demo', 'cost.jsonl')));
    runHook({ transcript_path: transcript, cwd: repo }, { env: { SDLC_HOME: home } });
    assert.ok(!existsSync(join(home, 'cost-cursor')), 'no session → no cursor');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('pi Stop: the session file is detected by its header; usage names are mapped; error rows are skipped', () => {
  const { dir, repo, home } = setup();
  try {
    const transcript = join(dir, 'pi-session.jsonl');
    writeFileSync(transcript,
      J({ type: 'session', version: 3, id: 'pi-1', cwd: repo })
      + J({ type: 'message', id: 'e', message: { role: 'assistant', model: 'gpt-5.6-sol', stopReason: 'error', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, content: [] } })
      + J({ type: 'message', id: 'm', message: { role: 'assistant', model: 'gpt-5.6-sol', provider: 'openai-codex', usage: { input: 120, output: 30, cacheRead: 900, cacheWrite: 40 }, content: [{ type: 'toolCall', name: 'write', arguments: { path: join(repo, '.ai', 'workflows', 'demo', '06-verify.md') } }] } })
      + J({ type: 'custom', customType: 'sdlc:subagent-usage', data: { id: 'ag1', type: 'explorer', usage: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 } } }));
    runHook({ session_id: 'pi-1', transcript_path: transcript, cwd: repo }, { env: { SDLC_HOME: home } });
    const rows = readFileSync(join(repo, '.ai', 'workflows', 'demo', 'cost.jsonl'), 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].host, 'pi');
    assert.equal(rows[0].key, 'verify');
    assert.deepEqual(rows[0].main, { model: 'gpt-5.6-sol', input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 900, cache_creation_input_tokens: 40 });
    assert.equal(rows[0].subagents.length, 1);
    assert.equal(rows[0].subagents[0].agent_id, 'ag1');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Runs the thin Codex adapter (hooks/stop-cost.mjs), which spawns dist/cost-ledger.mjs —
// so this case needs a built dist/ (npm run build), like the other adapter tests.
test('codex Stop via the adapter: --plugin-data hosts the cursor, the rollout is found by session id, the row is a cumulative delta with codex field names', () => {
  const { dir, repo } = setup();
  try {
    const pluginData = join(dir, 'plugin-data');
    const codexHome = join(dir, 'codex-home');
    const day = join(codexHome, 'sessions', '2026', '09', '07');
    mkdirSync(day, { recursive: true });
    const sid = '019a1b2c-0000-7000-8000-abcdefabcdef';
    const rollout = join(day, `rollout-2026-09-07T10-00-00-${sid}.jsonl`);
    const tc = (n, total) => J({ type: 'event_msg', ordinal: n, payload: { type: 'token_count', info: { total_token_usage: total, last_token_usage: total } } });
    writeFileSync(rollout,
      J({ type: 'session_meta', payload: { session_id: sid, cwd: repo } })
      + J({ type: 'turn_context', payload: { model: 'gpt-5.6', cwd: repo } })
      + J({ type: 'response_item', payload: { type: 'function_call', name: 'apply_patch', arguments: JSON.stringify({ input: '*** Begin Patch\n*** Add File: .ai/workflows/demo/05-implement-cli.md\n*** End Patch' }) } })
      + tc(1, { input_tokens: 1000, cached_input_tokens: 900, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 10, total_tokens: 1050 }));
    const input = { session_id: sid, cwd: repo, hook_event_name: 'Stop' };
    const args = ['--plugin-root', PLUGIN_ROOT, '--plugin-data', pluginData];
    runHook(input, { env: { CODEX_HOME: codexHome }, args, script: CODEX_ADAPTER });
    const ledger = join(repo, '.ai', 'workflows', 'demo', 'cost.jsonl');
    let rows = readFileSync(ledger, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].host, 'codex');
    assert.equal(rows[0].key, 'implement');
    assert.equal(rows[0].slice, 'cli');
    assert.deepEqual(rows[0].main, { model: 'gpt-5.6', fields: 'codex', input_tokens: 1000, cached_input_tokens: 900, cache_write_input_tokens: 0, output_tokens: 50, reasoning_output_tokens: 10 });
    assert.ok(existsSync(join(pluginData, 'cost-cursor', `${sid}.json`)), 'cursor under PLUGIN_DATA/cost-cursor');

    appendFileSync(rollout, tc(2, { input_tokens: 1300, cached_input_tokens: 1100, cache_write_input_tokens: 4, output_tokens: 80, reasoning_output_tokens: 12, total_tokens: 1380 }));
    runHook(input, { env: { CODEX_HOME: codexHome }, args, script: CODEX_ADAPTER });
    rows = readFileSync(ledger, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[1].main, { model: 'gpt-5.6', fields: 'codex', input_tokens: 300, cached_input_tokens: 200, cache_write_input_tokens: 4, output_tokens: 30, reasoning_output_tokens: 2 }, 'the second row is the exact delta');
    assert.equal(rows[1].key, 'implement', 'no write this turn → inherits');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
