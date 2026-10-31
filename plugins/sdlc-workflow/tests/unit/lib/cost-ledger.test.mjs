// tests/unit/lib/cost-ledger.test.mjs
//
// The exact cost ledger (WIDE-VIEW-REPAIR-PLAN §10). Fixtures copy the record
// shapes observed on this machine: Claude Code transcript lines (one request
// spans several apiBlockIndex lines that repeat the same usage), Codex rollout
// `token_count` events (cumulative totals), pi session entries (`usage.input`,
// `stopReason: "error"` zero rows), and the pi-subagents custom entry.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readNewLines, parseJsonLines, detectTranscriptHost,
  parseClaudeEntries, parseCodexEntries, codexDelta, parsePiEntries, applyPatchPaths,
  keyFromArtifactName, attributeWrites, workflowPathParts,
  sumMain, sumSubagents, collectTurn, newCursor, readCursor, writeCursor, stageOfLabel,
  agentTotalsFromFiles, rebuildLedgerRows,
  appendCostRow, readCostRows, aggregateCost, usageColumns, COST_FILE,
} from '../../../lib/cost-ledger.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'sdlc-cost-'));
const J = (o) => `${JSON.stringify(o)}\n`;

const claudeLine = (over = {}) => ({
  type: 'assistant', requestId: 'req_1', timestamp: '2026-09-07T10:00:00Z', isSidechain: false,
  message: { model: 'claude-fable-5-1', usage: { input_tokens: 2, output_tokens: 406, cache_read_input_tokens: 38614, cache_creation_input_tokens: 36574 }, content: [{ type: 'text', text: 'x' }] },
  ...over,
});
const writeBlock = (file_path) => ({ type: 'tool_use', name: 'Write', input: { file_path, content: '' } });

/* ───────────────────────── incremental reading ───────────────────────── */

test('readNewLines: returns complete lines only, advances the offset, and restarts on truncation', () => {
  const dir = tmp();
  try {
    const f = join(dir, 't.jsonl');
    writeFileSync(f, 'a\nb\npartial');
    let r = readNewLines(f, 0);
    assert.deepEqual(r.lines, ['a', 'b']);
    assert.equal(r.offset, 4, 'the partial third line is left for the next read');
    appendFileSync(f, '-done\nc\n');
    r = readNewLines(f, r.offset);
    assert.deepEqual(r.lines, ['partial-done', 'c']);
    const end = r.offset;
    assert.deepEqual(readNewLines(f, end), { lines: [], offset: end }, 'nothing new → nothing read');
    writeFileSync(f, 'z\n');
    r = readNewLines(f, end);
    assert.deepEqual(r.lines, ['z'], 'a shorter file (rotated) is read from the start');
    assert.deepEqual(readNewLines(join(dir, 'missing'), 7), { lines: [], offset: 7 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('detectTranscriptHost: pi by the session header, codex by name or session_meta, else claude', () => {
  const dir = tmp();
  try {
    const pi = join(dir, 'pi.jsonl'); writeFileSync(pi, J({ type: 'session', version: 3, id: 'x' }));
    const cx = join(dir, 'rollout-2026-09-07T00-00-00-abc.jsonl'); writeFileSync(cx, J({ type: 'session_meta', payload: {} }));
    const cx2 = join(dir, 'other.jsonl'); writeFileSync(cx2, J({ type: 'session_meta', payload: {} }));
    const cl = join(dir, 'claude.jsonl'); writeFileSync(cl, J(claudeLine()));
    assert.equal(detectTranscriptHost(pi), 'pi');
    assert.equal(detectTranscriptHost(cx), 'codex');
    assert.equal(detectTranscriptHost(cx2), 'codex');
    assert.equal(detectTranscriptHost(cl), 'claude');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ───────────────────────── parsers ───────────────────────── */

test('parseClaudeEntries: dedupes by requestId (last line wins), copies the four fields, collects writes', () => {
  const entries = [
    claudeLine({ apiBlockIndex: 0, message: { model: 'claude-fable-5-1', usage: { input_tokens: 2, output_tokens: 100, cache_read_input_tokens: 5, cache_creation_input_tokens: 6 }, content: [{ type: 'thinking' }] } }),
    claudeLine({ apiBlockIndex: 1, message: { model: 'claude-fable-5-1', usage: { input_tokens: 2, output_tokens: 406, cache_read_input_tokens: 5, cache_creation_input_tokens: 6 }, content: [writeBlock('C:\\repo\\.ai\\workflows\\demo\\04-plan-cli.md')] } }),
    { type: 'user', message: { content: 'hi' } },
    claudeLine({ requestId: 'req_2', message: { model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 26072 }, content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/r/.ai/workflows/demo/00-index.md' } }, { type: 'tool_use', name: 'Read', input: { file_path: '/r/x.md' } }] } }),
  ];
  const r = parseClaudeEntries(entries);
  assert.equal(r.usages.length, 2, 'two requests, not four lines');
  assert.deepEqual(r.usages[0].usage, { input_tokens: 2, output_tokens: 406, cache_read_input_tokens: 5, cache_creation_input_tokens: 6 }, 'the last line of req_1 wins');
  assert.deepEqual(r.writes.map((w) => w.path), ['C:\\repo\\.ai\\workflows\\demo\\04-plan-cli.md', '/r/.ai/workflows/demo/00-index.md'], 'Read is not a write');
});

test('parseCodexEntries + codexDelta: latest cumulative total, model from turn_context, apply_patch paths; delta is exact', () => {
  const entries = [
    { type: 'session_meta', payload: { session_id: 's' } },
    { type: 'turn_context', payload: { model: 'gpt-5.6', cwd: '/r' } },
    { type: 'event_msg', ordinal: 1, payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 80, cache_write_input_tokens: 0, output_tokens: 10, reasoning_output_tokens: 0, total_tokens: 110 } } } },
    { type: 'response_item', payload: { type: 'function_call', name: 'apply_patch', arguments: JSON.stringify({ input: '*** Begin Patch\n*** Update File: .ai/workflows/demo/05-implement-cli.md\n@@\n*** End Patch' }) } },
    { type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch', input: '*** Begin Patch\n*** Add File: src/a.js\n*** End Patch' } },
    { type: 'event_msg', ordinal: 2, payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 150, cached_input_tokens: 120, cache_write_input_tokens: 4, output_tokens: 25, reasoning_output_tokens: 3, total_tokens: 175 } } } },
  ];
  const r = parseCodexEntries(entries);
  assert.equal(r.model, 'gpt-5.6');
  assert.deepEqual(r.latestTotal, { input_tokens: 150, cached_input_tokens: 120, cache_write_input_tokens: 4, output_tokens: 25, reasoning_output_tokens: 3 });
  assert.deepEqual(r.writes.map((w) => w.path), ['.ai/workflows/demo/05-implement-cli.md', 'src/a.js']);
  assert.deepEqual(codexDelta(r.latestTotal, { input_tokens: 100, cached_input_tokens: 80, cache_write_input_tokens: 0, output_tokens: 10, reasoning_output_tokens: 0 }),
    { input_tokens: 50, cached_input_tokens: 40, cache_write_input_tokens: 4, output_tokens: 15, reasoning_output_tokens: 3 });
  assert.deepEqual(codexDelta(r.latestTotal, null).input_tokens, 150, 'no previous total → the total is the turn');
  assert.equal(codexDelta({ input_tokens: 5, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 }, { input_tokens: 9, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 }).input_tokens, 5, 'a reset counter starts over');
  assert.equal(codexDelta({ input_tokens: 7, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 }, { input_tokens: 7, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 }), null, 'no movement → no usage');
  assert.deepEqual(applyPatchPaths('*** Delete File: a/b.md\n*** Update File: c.md  \n'), ['a/b.md', 'c.md']);
});

test('parsePiEntries: maps pi usage names, skips error rows, reads sub-agent custom entries, collects write tool calls', () => {
  const entries = [
    { type: 'session', version: 3, id: 'sess' },
    { type: 'message', id: 'm1', timestamp: 1, message: { role: 'assistant', model: 'gpt-5.6-sol', provider: 'openai-codex', stopReason: 'error', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, content: [] } },
    { type: 'message', id: 'm2', timestamp: 2, message: { role: 'assistant', model: 'gpt-5.6-sol', provider: 'openai-codex', usage: { input: 120, output: 30, cacheRead: 900, cacheWrite: 40, totalTokens: 1090 }, content: [{ type: 'toolCall', name: 'write', arguments: { path: '/r/.ai/workflows/demo/06-verify-cli.md', content: '' } }, { type: 'toolCall', name: 'read', arguments: { path: '/r/x' } }] } },
    { type: 'message', id: 'm2', timestamp: 2, message: { role: 'assistant', usage: { input: 999, output: 999 } } },
    { type: 'message', id: 'u1', message: { role: 'user', content: 'hi' } },
    { type: 'custom', customType: 'sdlc:subagent-usage', data: { id: 'ag1', type: 'explorer', status: 'completed', toolUses: 4, durationMs: 1200, usage: { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, cost: { total: 0.1 } } } },
    { type: 'custom', customType: 'other', data: { usage: { input: 1 } } },
  ];
  const r = parsePiEntries(entries);
  assert.equal(r.usages.length, 1, 'the error row is skipped and the duplicate id is deduped');
  assert.deepEqual(r.usages[0].usage, { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 900, cache_creation_input_tokens: 40 });
  assert.deepEqual(r.subagents, [{ agent_id: 'ag1', type: 'explorer', status: 'completed', model: null, input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 }]);
  assert.deepEqual(r.writes.map((w) => w.path), ['/r/.ai/workflows/demo/06-verify-cli.md']);
});

/* ───────────────────────── attribution ───────────────────────── */

test('keyFromArtifactName: number → key, slice suffix only for sliced keys, 01-<mode> is intake', () => {
  assert.deepEqual(keyFromArtifactName('04-plan-cli-json.md'), { key: 'plan', slice: 'cli-json' });
  assert.deepEqual(keyFromArtifactName('04-plan.md'), { key: 'plan', slice: null });
  assert.deepEqual(keyFromArtifactName('01-rca.md'), { key: 'intake', slice: null });
  assert.deepEqual(keyFromArtifactName('07-review-cli-security.md'), { key: 'review', slice: 'cli-security' });
  assert.deepEqual(keyFromArtifactName('02-shape.md'), { key: 'intake', slice: null });
  assert.deepEqual(keyFromArtifactName('02c-craft.md'), { key: 'design', slice: null });
  assert.deepEqual(keyFromArtifactName('02b-design.md'), { key: 'design', slice: null });
  assert.deepEqual(keyFromArtifactName('08-handoff.md'), { key: 'ship', slice: null });
  assert.deepEqual(keyFromArtifactName('09-ship-run-3.md'), { key: 'ship', slice: null });
  assert.equal(keyFromArtifactName('00-index.md'), null);
  assert.equal(keyFromArtifactName('po-answers.md'), null);
  assert.equal(keyFromArtifactName('cost.jsonl'), null);
});

test('attributeWrites: last artifact write wins, index writes keep the key on the same slug, no writes inherit', () => {
  assert.equal(attributeWrites([], null), null);
  const prev = { slug: 'a', key: 'plan', slice: 'x', root: '/r/.ai/workflows' };
  assert.deepEqual(attributeWrites([], prev), prev, 'a gate-question turn inherits');
  assert.deepEqual(attributeWrites([{ path: '/r/.ai/workflows/a/00-index.md' }], prev), prev, 'index write keeps key + slice');
  assert.deepEqual(attributeWrites([{ path: '/r/.ai/workflows/b/00-index.md' }], prev), { slug: 'b', key: null, slice: null, root: '/r/.ai/workflows' }, 'a different slug resets the key');
  assert.deepEqual(attributeWrites([
    { path: '/r/.ai/workflows/a/04-plan-x.md' }, { path: '/r/src/app.js' }, { path: 'C:\\r\\.ai\\workflows\\a\\05-implement-x.md' },
  ], null), { slug: 'a', key: 'implement', slice: 'x', root: 'C:/r/.ai/workflows' });
  assert.deepEqual(workflowPathParts('.ai/workflows/demo/07-review.md'), { root: '.ai/workflows', slug: 'demo', storageRel: '07-review.md', filename: '07-review.md' }, 'a cwd-relative Codex path');
  assert.equal(workflowPathParts('/r/.ai/simplify/x.md'), null);
});

/* ───────────────────────── summing ───────────────────────── */

test('sumMain / sumSubagents: per-model sums; several models keep each exact under models[]', () => {
  const u = (model, input) => ({ model, usage: { input_tokens: input, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
  assert.equal(sumMain([]), null);
  assert.deepEqual(sumMain([u('m', 2), u('m', 3)]), { model: 'm', input_tokens: 5, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
  const two = sumMain([u('a', 1), u('b', 10)]);
  assert.equal(two.model, 'a+b');
  assert.equal(two.input_tokens, 11);
  assert.equal(two.models.length, 2);
  assert.deepEqual(sumSubagents([
    { agent_id: 'x', model: 'm', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    { agent_id: 'x', model: 'm', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    { agent_id: 'y', model: 'm', input_tokens: 5, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  ]).map((s) => [s.agent_id, s.input_tokens]), [['x', 2], ['y', 5]]);
});

/* ───────────────────────── collectTurn end to end ───────────────────────── */

test('collectTurn (claude): main + subagent usage, attribution, cursor offsets; a quiet second Stop has no usage and inherits', () => {
  const dir = tmp();
  try {
    const sid = 'sess-1';
    const transcript = join(dir, `${sid}.jsonl`);
    const subDir = join(dir, sid, 'subagents');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(transcript, J(claudeLine({ message: { model: 'claude-fable-5-1', usage: { input_tokens: 2, output_tokens: 406, cache_read_input_tokens: 38614, cache_creation_input_tokens: 36574 }, content: [writeBlock(join(dir, 'repo', '.ai', 'workflows', 'demo', '04-plan-cli.md'))] } })));
    writeFileSync(join(subDir, 'agent-a1.jsonl'), J(claudeLine({ requestId: 'r9', agentId: 'a1', isSidechain: true, message: { model: 'claude-opus-5', usage: { input_tokens: 2, output_tokens: 1, cache_read_input_tokens: 13525, cache_creation_input_tokens: 12182 }, content: [] } })));
    const cursor = newCursor();
    const t1 = collectTurn({ transcriptPath: transcript, subagentsDir: subDir, cursor });
    assert.equal(t1.host, 'claude');
    assert.equal(t1.hadUsage, true);
    assert.equal(t1.main.output_tokens, 406);
    assert.deepEqual(t1.subagents, [{ agent_id: 'a1', model: 'claude-opus-5', input_tokens: 2, output_tokens: 1, cache_read_input_tokens: 13525, cache_creation_input_tokens: 12182, start: '2026-09-07T10:00:00Z', end: '2026-09-07T10:00:00Z' }]);
    assert.equal(t1.attributed.slug, 'demo');
    assert.equal(t1.attributed.key, 'plan');
    assert.equal(t1.attributed.slice, 'cli');
    assert.ok(cursor.mainOffset > 0 && cursor.files['/a1'].off > 0);

    const t2 = collectTurn({ transcriptPath: transcript, subagentsDir: subDir, cursor });
    assert.equal(t2.hadUsage, false, 'nothing appended → no usage');
    assert.equal(t2.main, null);
    assert.deepEqual(t2.attributed, t1.attributed, 'the attribution is inherited');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('collectTurn (claude): Workflow agents are read, and each sub-agent is booked to the slug it writes in', () => {
  const dir = tmp();
  try {
    const sid = 'sess-wf';
    const transcript = join(dir, `${sid}.jsonl`);
    const subDir = join(dir, sid, 'subagents');
    const wfDir = join(subDir, 'workflows', 'wf_1');
    mkdirSync(wfDir, { recursive: true });
    const use = (out) => ({ input_tokens: 1, output_tokens: out, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
    const line = (requestId, out, content) => J(claudeLine({ requestId, isSidechain: true, message: { model: 'claude-sonnet-5-5', usage: use(out), content } }));
    // The main session works in the brainstorm; the drive works in a worktree.
    writeFileSync(transcript, line('m1', 10, [writeBlock(join(dir, 'repo', '.ai', 'workflows', 'brain', 'work', 'campaign', 'ledger.md'))]));
    writeFileSync(join(subDir, 'agent-a1.jsonl'), line('s1', 20, []));
    // The scout sorts before the stage agent and writes nothing; it shares the stage agent's Workflow.
    writeFileSync(join(wfDir, 'agent-a2.jsonl'), line('w0', 30, []));
    writeFileSync(join(wfDir, 'agent-a3.jsonl'), line('w1', 40, [writeBlock(join(dir, 'repo', 'wt', 'drive', '.ai', 'workflows', 'drive', '05-implement-core.md'))]));
    writeFileSync(join(wfDir, 'journal.jsonl'), J({ type: 'result', usage: use(999) }));
    const cursor = newCursor();
    const t = collectTurn({ transcriptPath: transcript, subagentsDir: subDir, cursor });
    assert.deepEqual(t.subagents.map((s) => s.agent_id).sort(), ['a1', 'a2', 'a3'], 'Workflow agents count; the Workflow journal does not');
    assert.equal(t.groups.length, 2);
    assert.equal(t.groups[0].attributed.slug, 'brain');
    assert.equal(t.groups[0].main.output_tokens, 10);
    assert.deepEqual(t.groups[0].subagents.map((s) => s.agent_id), ['a1'], 'an agent that writes nothing stays with the turn');
    assert.equal(t.groups[1].attributed.slug, 'drive');
    assert.equal(t.groups[1].attributed.key, 'implement');
    assert.equal(t.groups[1].main, null);
    assert.deepEqual(t.groups[1].subagents.map((s) => s.agent_id).sort(), ['a2', 'a3'], 'a silent agent goes with its Workflow');
    assert.equal(t.attributed.slug, 'brain', 'sub-agent writes never move the turn attribution');

    // A later Stop: the stage agent goes on without a write; it keeps its slug.
    appendFileSync(join(wfDir, 'agent-a3.jsonl'), line('w2', 5, []));
    const t2 = collectTurn({ transcriptPath: transcript, subagentsDir: subDir, cursor });
    assert.equal(t2.groups.length, 2);
    assert.equal(t2.groups[0].main, null);
    assert.deepEqual(t2.groups[0].subagents, []);
    assert.equal(t2.groups[1].attributed.slug, 'drive');
    assert.equal(t2.groups[1].subagents[0].output_tokens, 5);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('collectTurn (claude): a silent wave driver agent is booked by the @slug of its label; a silent wave agent goes to the campaign', () => {
  const dir = tmp();
  try {
    const sid = 'sess-wave';
    const transcript = join(dir, `${sid}.jsonl`);
    const subDir = join(dir, sid, 'subagents');
    const wfDir = join(subDir, 'workflows', 'wf_w');
    mkdirSync(wfDir, { recursive: true });
    const use = (out) => ({ input_tokens: 1, output_tokens: out, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
    const line = (requestId, out, content) => J(claudeLine({ requestId, isSidechain: true, message: { model: 'claude-sonnet-5-5', usage: use(out), content } }));
    const meta = (id, description) => writeFileSync(join(wfDir, `agent-${id}.meta.json`), JSON.stringify({ description }));
    writeFileSync(transcript, line('m1', 10, []));
    // The writers: a stage agent of each unit in its worktree, and a wave agent in the campaign folder.
    writeFileSync(join(wfDir, 'agent-b1.jsonl'), line('w1', 1, [writeBlock(join(dir, 'cw', 'w1-A', '.ai', 'workflows', 'alpha', '05-implement-s1.md'))]));
    meta('b1', 'implement:s1@alpha');
    writeFileSync(join(wfDir, 'agent-b2.jsonl'), line('w2', 2, [writeBlock(join(dir, 'cw', 'w1-B', '.ai', 'workflows', 'beta', '05-implement-p1.md'))]));
    meta('b2', 'implement:p1@beta');
    writeFileSync(join(wfDir, 'agent-b3.jsonl'), line('w3', 3, [writeBlock(join(dir, 'repo', '.ai', 'workflows', 'brain', 'work', 'campaign', 'ledger.json'))]));
    meta('b3', 'cross-unit-reconcile');
    // The silent agents: a scout of alpha (the run's last writer is the wave agent), and the waiter.
    writeFileSync(join(wfDir, 'agent-c1.jsonl'), line('s1', 30, []));
    meta('c1', 'scout:correctness:s1@alpha');
    writeFileSync(join(wfDir, 'agent-c2.jsonl'), line('s2', 40, []));
    meta('c2', 'waiter#1');
    const t = collectTurn({ transcriptPath: transcript, subagentsDir: subDir, cursor: newCursor() });
    const group = (slug) => t.groups.find((g) => g.attributed && g.attributed.slug === slug);
    assert.deepEqual(group('alpha').subagents.map((s) => s.agent_id).sort(), ['b1', 'c1'], 'the silent scout goes to its own slug');
    assert.equal(group('alpha').attributed.root, join(dir, 'cw', 'w1-A', '.ai', 'workflows').replace(/\\/g, '/'));
    assert.deepEqual(group('beta').subagents.map((s) => s.agent_id), ['b2']);
    assert.deepEqual(group('brain').subagents.map((s) => s.agent_id).sort(), ['b3', 'c2'], 'the silent waiter goes to the campaign');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('collectTurn (codex): the turn is the delta of cumulative totals; fields stay codex-named', () => {
  const dir = tmp();
  try {
    const f = join(dir, 'rollout-2026-09-07T10-00-00-sid.jsonl');
    const tc = (n) => J({ type: 'event_msg', ordinal: n, payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100 * n, cached_input_tokens: 10 * n, cache_write_input_tokens: 0, output_tokens: 5 * n, reasoning_output_tokens: 0 } } } });
    writeFileSync(f, J({ type: 'session_meta', payload: {} }) + J({ type: 'turn_context', payload: { model: 'gpt-5.6' } }) + tc(1));
    const cursor = newCursor();
    const t1 = collectTurn({ transcriptPath: f, cursor });
    assert.equal(t1.host, 'codex');
    assert.deepEqual(t1.main, { model: 'gpt-5.6', fields: 'codex', input_tokens: 100, cached_input_tokens: 10, cache_write_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0 });
    appendFileSync(f, tc(3));
    const t2 = collectTurn({ transcriptPath: f, cursor });
    assert.deepEqual(usageColumns(t2.main), { input: 200, output: 10, cacheRead: 20, cacheWrite: 0 }, 'exact delta between the two Stops');
    assert.equal(t2.attributed, null, 'no artifact write → no slug');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ───────────────────────── ledger file ───────────────────────── */

test('appendCostRow / readCostRows / aggregateCost: atomic append, torn lines skipped, external counted apart', () => {
  const dir = tmp();
  try {
    const slugDir = join(dir, '.ai', 'workflows', 'demo');
    const row = (turn, key, main, extra = {}) => ({ ts: '2026-10-05T10:00:00Z', host: 'claude', session: 's', turn, key, slug: 'demo', slice: null, main, subagents: [], external: [], ...extra });
    const m = (input, output) => ({ model: 'm', input_tokens: input, output_tokens: output, cache_read_input_tokens: 7, cache_creation_input_tokens: 3 });
    appendCostRow(slugDir, row(1, 'plan', m(2, 500)));
    appendFileSync(join(slugDir, 'cost-2026-10.jsonl'), '{torn');
    appendCostRow(slugDir, row(2, 'plan', m(1, 10), { subagents: [{ agent_id: 'a', model: 'x', input_tokens: 4, output_tokens: 4, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }] }));
    appendCostRow(slugDir, row(null, 'plan', null, { host: 'external', external: [{ provider: 'codex', fields: 'codex', input_tokens: 18176, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 142 }] }));
    appendCostRow(slugDir, row(3, 'review', m(9, 9)));
    const text = readFileSync(join(slugDir, 'cost-2026-10.jsonl'), 'utf-8');
    assert.equal(text.split('\n').filter(Boolean).length, 5, 'four rows + the torn line stay on disk');
    const rows = readCostRows(slugDir);
    assert.equal(rows.length, 4, 'the torn line is skipped on read');
    const agg = aggregateCost(rows);
    assert.deepEqual(Object.keys(agg.byKey).sort(), ['plan', 'review']);
    assert.equal(agg.byKey.plan.turns, 2, 'the external row is not a turn');
    assert.equal(agg.byKey.plan.subagents, 1);
    assert.equal(agg.byKey.plan.input, 2 + 1 + 4);
    assert.equal(agg.byKey.plan.output, 500 + 10 + 4);
    assert.equal(agg.byKey.plan.cacheRead, 14);
    assert.equal(agg.byKey.plan.external, 1);
    assert.equal(agg.byKey.plan.externalInput, 18176);
    assert.equal(agg.byKey.plan.externalOutput, 142);
    assert.equal(agg.total.turns, 3);
    assert.equal(agg.total.input, 16);
    assert.deepEqual(readCostRows(join(dir, 'nope')), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('parseJsonLines: torn lines are dropped, never thrown', () => {
  assert.deepEqual(parseJsonLines(['{"a":1}', '{bad', '']), [{ a: 1 }]);
});

/* ───────────────────────── WF-SYSTEM-REVIEW A1: book each agent once ───────────────────────── */

test('A1: a copy of a Workflow agent transcript in subagents/ books nothing again, on any later Stop', () => {
  const dir = tmp();
  try {
    const sid = 'sess-copy';
    const transcript = join(dir, `${sid}.jsonl`);
    const subDir = join(dir, sid, 'subagents');
    const wfDir = join(subDir, 'workflows', 'wf_1');
    mkdirSync(wfDir, { recursive: true });
    const use = (out) => ({ input_tokens: 1, output_tokens: out, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 });
    // Two lines of one response (the same message id), then a second response.
    const resp = (id, out, extra = {}) => J({ type: 'assistant', isSidechain: true, timestamp: '2026-10-14T07:00:00Z', ...extra, message: { id, model: 'claude-opus-5-5', usage: use(out), content: [] } });
    writeFileSync(transcript, '');
    const wfText = resp('msg_1', 7, { requestId: 'r1' }) + resp('msg_1', 7, { requestId: 'r1' }) + resp('msg_2', 9, { requestId: 'r2' });
    writeFileSync(join(wfDir, 'agent-a1.jsonl'), wfText);
    writeFileSync(join(wfDir, 'agent-a1.meta.json'), JSON.stringify({ description: 'implement:s1@alpha' }));
    const cursor = newCursor();
    const t1 = collectTurn({ transcriptPath: transcript, subagentsDir: subDir, cursor });
    const total = (t) => t.subagents.reduce((n, s) => n + s.output_tokens, 0);
    assert.equal(total(t1), 16, 'two responses: 7 + 9, the repeated line of msg_1 counts once');
    assert.equal(t1.subagents[0].label, 'implement:s1@alpha');
    assert.equal(t1.subagents[0].stage, 'implement');
    assert.equal(t1.subagents[0].slice, 's1');
    // The host writes a copy with no requestId into subagents/: it books nothing.
    writeFileSync(join(subDir, 'agent-a1.jsonl'), resp('msg_1', 7) + resp('msg_1', 7) + resp('msg_2', 9));
    for (let i = 0; i < 3; i++) assert.equal(total(collectTurn({ transcriptPath: transcript, subagentsDir: subDir, cursor })), 0, `Stop ${i + 2}`);
    // The agent goes on in its Workflow file: only the new response is booked.
    appendFileSync(join(wfDir, 'agent-a1.jsonl'), resp('msg_3', 4, { requestId: 'r3' }));
    assert.equal(total(collectTurn({ transcriptPath: transcript, subagentsDir: subDir, cursor })), 4);
    assert.equal(total(collectTurn({ transcriptPath: transcript, subagentsDir: subDir, cursor })), 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('A1: a later line of the same response books only its growth; a response that straddles two Stops counts once', () => {
  const dir = tmp();
  try {
    const sid = 'sess-grow';
    const transcript = join(dir, `${sid}.jsonl`);
    const subDir = join(dir, sid, 'subagents');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(transcript, '');
    const resp = (out) => J({ type: 'assistant', isSidechain: true, requestId: 'r1', message: { id: 'msg_1', model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: out, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, content: [] } });
    writeFileSync(join(subDir, 'agent-b1.jsonl'), resp(10));
    const cursor = newCursor();
    const out = () => collectTurn({ transcriptPath: transcript, subagentsDir: subDir, cursor }).subagents.reduce((n, s) => n + s.output_tokens, 0);
    assert.equal(out(), 10);
    appendFileSync(join(subDir, 'agent-b1.jsonl'), resp(25));
    assert.equal(out(), 15, 'the last line of the response wins: 25 in all');
    appendFileSync(join(subDir, 'agent-b1.jsonl'), resp(25));
    assert.equal(out(), 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('A1: a cursor of the old form migrates: the bytes it knew count as booked, and two files of one id stop resetting each other', () => {
  const dir = tmp();
  try {
    const sid = 'sess-old';
    const transcript = join(dir, `${sid}.jsonl`);
    const subDir = join(dir, sid, 'subagents');
    const wfDir = join(subDir, 'workflows', 'wf_9');
    mkdirSync(wfDir, { recursive: true });
    writeFileSync(transcript, '');
    const resp = (id, out, extra = {}) => J({ type: 'assistant', isSidechain: true, ...extra, message: { id, model: 'claude-opus-5-5', usage: { input_tokens: 0, output_tokens: out, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, content: [] } });
    writeFileSync(join(wfDir, 'agent-c1.jsonl'), resp('m1', 5, { requestId: 'r1' }) + resp('m2', 6, { requestId: 'r2' }));
    writeFileSync(join(subDir, 'agent-c1.jsonl'), resp('m1', 5));
    const cursorDir = join(dir, 'cursors');
    // The old form: one offset for the id, the size of the larger file.
    writeCursor(cursorDir, sid, { mainOffset: 0, agents: { c1: 999 }, turn: 7, last: null });
    const cursor = readCursor(cursorDir, sid);
    assert.equal(cursor.files, undefined, 'the old cursor is not mistaken for the new form');
    const out = () => collectTurn({ transcriptPath: transcript, subagentsDir: subDir, cursor }).subagents.reduce((n, s) => n + s.output_tokens, 0);
    assert.equal(out(), 0, 'the migration books nothing again');
    assert.equal(cursor.agents, undefined);
    assert.equal(out(), 0);
    appendFileSync(join(wfDir, 'agent-c1.jsonl'), resp('m3', 8, { requestId: 'r3' }));
    assert.equal(out(), 8);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('A1: stageOfLabel reads the stage and the slice of a driver label', () => {
  assert.deepEqual(stageOfLabel('implement:s1@alpha'), { stage: 'implement', slice: 's1' });
  assert.deepEqual(stageOfLabel('scout:correctness:s1@alpha'), { stage: 'scout', slice: 's1' });
  assert.deepEqual(stageOfLabel('waiter#3'), { stage: 'waiter', slice: null });
  assert.deepEqual(stageOfLabel('cross-unit-reconcile'), { stage: 'cross-unit-reconcile', slice: null });
});

test('A1 rebuild: agentTotalsFromFiles counts each response once across copies; rebuildLedgerRows keeps one true entry in the earliest row', () => {
  const dir = tmp();
  try {
    const resp = (id, out, extra = {}) => J({ type: 'assistant', ...extra, message: { id, model: 'claude-opus-5-5', usage: { input_tokens: 0, output_tokens: out, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 }, content: [] } });
    writeFileSync(join(dir, 'wf.jsonl'), resp('m1', 5, { requestId: 'r1' }) + resp('m1', 5, { requestId: 'r1' }) + resp('m2', 7, { requestId: 'r2' }));
    writeFileSync(join(dir, 'copy.jsonl'), resp('m1', 5) + resp('m2', 7));
    const truth = agentTotalsFromFiles([{ id: 'a1', file: join(dir, 'wf.jsonl') }, { id: 'a1', file: join(dir, 'copy.jsonl') }]);
    assert.deepEqual(truth.get('a1'), [{ model: 'claude-opus-5-5', input_tokens: 0, output_tokens: 12, cache_read_input_tokens: 200, cache_creation_input_tokens: 0 }]);
    const e = (id, out, extra = {}) => ({ agent_id: id, model: 'claude-opus-5-5', input_tokens: 0, output_tokens: out, cache_read_input_tokens: 200, cache_creation_input_tokens: 0, ...extra });
    const files = [
      { path: 'x/cost.jsonl', rows: [
        { ts: '2026-10-14T08:00:00Z', slug: 'x', main: { output_tokens: 1 }, subagents: [e('a1', 12, { label: 'implement:s1@x', stage: 'implement', slice: 's1' }), e('b1', 3)] },
        { ts: '2026-10-14T09:00:00Z', slug: 'x', main: null, subagents: [e('a1', 12)] },
      ] },
      { path: 'y/cost.jsonl', rows: [{ ts: '2026-10-14T10:00:00Z', slug: 'y', main: null, subagents: [e('a1', 12)] }] },
    ];
    const r = rebuildLedgerRows(files, new Map([...truth, ['b1', [{ model: 'claude-opus-5-5', input_tokens: 0, output_tokens: 3, cache_read_input_tokens: 200, cache_creation_input_tokens: 0 }]]]));
    assert.deepEqual(r.agents.map((a) => a.id), ['a1'], 'b1 is booked at its true total: not inflated');
    assert.equal(r.files[0].rows.length, 1, 'the row left with no usage goes');
    assert.deepEqual(r.files[0].rows[0].subagents.map((s) => [s.agent_id, s.output_tokens, s.rebuilt ?? false, s.stage ?? null]), [['b1', 3, false, null], ['a1', 12, true, 'implement']]);
    assert.deepEqual(r.files[1].rows, [], 'the later re-read in another slug goes');
    assert.equal(r.files[1].changed, true);
    // An agent with no transcript stays as it is.
    assert.equal(rebuildLedgerRows(files, new Map()).files.every((f) => !f.changed), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
