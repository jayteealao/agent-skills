// The operations of wf.mjs and the tools of the MCP server: every form has a tool, each example
// turns into a call and back into the same command line, the tools stay inside their budget,
// and the guards hold (a read tool does not write, a sub-agent does not call wf_person, an agent
// does not write in the name of the person).
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BOOLEAN_FLAGS } from '../../lib/cli-flags.mjs';
import { SIBLINGS, allOps, argvOf, callOf, headerBlocks } from '../../lib/ops/forms.mjs';
import { fixOf, workerEnv } from '../../lib/ops/invoke.mjs';
import { coverage, refusal, registry } from '../../lib/ops/registry.mjs';
import { callOfCommand, fullOp, toolList } from '../../mcp/tools.mjs';
import { handle, toolResult } from '../../mcp/server.mjs';

const words = (line) => [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2]);
const examples = () => headerBlocks().flatMap((b) => [...b.about.matchAll(/Example:\s*(.*?)(?=\s+Example:|$)/g)].map((m) => m[1]));

/** A command line as a set of flags and a list of positionals, so the order of the flags does not count. */
function canon(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--') { pos.push('--', ...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const n = a.slice(2);
      opt[n] = BOOLEAN_FLAGS.has(n) ? true : [opt[n], argv[(i += 1)]].flat().filter((x) => x !== undefined);
    } else pos.push(a);
  }
  return { pos, opt: Object.fromEntries(Object.entries(opt).sort()) };
}

test('every operation of wf.mjs has one tool, and every row names an operation', () => {
  assert.deepEqual(coverage(), { missing: [], unknown: [] });
  assert.ok(allOps().size >= 170);
});

test('the sibling scripts have their operations too, each with one tool', () => {
  const ops = allOps();
  for (const s of SIBLINGS) {
    const mine = [...ops.values()].filter((o) => o.words[0] === s);
    assert.ok(mine.length >= 1, `${s} has no operation`);
    for (const o of mine) assert.ok(registry().has(o.name), `${o.name} has no tool`);
  }
  assert.equal(registry().get('campaign next').tool, 'wf_run');
  assert.equal(registry().get('campaign skip').tool, 'wf_person');
  assert.equal(registry().get('optimize trial').tool, 'wf_job');
  assert.equal(refusal('wf_query', 'campaign write', { 'dry-run': true }), null, 'a dry run is a read');
  // A plain word of a form is filled by the call; a list of words is its type.
  assert.deepEqual(argvOf('orchestrate path', { root: '.', slug: 's', reason: 'r' }), ['orchestrate', 'path', '.', 's', 'up', '--reason', 'r']);
  assert.deepEqual(argvOf('prototype exit', { root: '.', slug: 's', type: 'park' }), ['prototype', 'exit', '.', 's', 'park']);
  assert.throws(() => argvOf('prototype exit', { root: '.', slug: 's', type: 'later' }), /one of park, graduate, close/);
  // `<root> <slug> | <root> --all`: the second form makes the slug optional.
  assert.deepEqual(argvOf('optimize report', { root: '.', all: true }), ['optimize', 'report', '.', '--all']);
});

test('the example of every form turns into a call and back into the same command line', () => {
  const seen = examples();
  assert.ok(seen.length >= 154);
  for (const ex of seen) {
    const argv = words(ex.replace(/^.*?wf\.mjs"?\s+/, ''));
    const c = callOf(argv);
    assert.ok(c, `no operation for ${ex}`);
    assert.deepEqual(canon(argvOf(c.op, c.fields)), canon(argv), ex);
  }
});

test('a call with a field that its form lacks, or without a needed positional, is refused with the names', () => {
  assert.throws(() => argvOf('record set', { root: '.', slug: 'x', name: 'index', value: 'y' }), /has no field value; its fields are: root, slug, name, path/);
  assert.throws(() => argvOf('step done', { root: '.', slug: 'x', slice: 'a' }), /needs n/);
  assert.throws(() => argvOf('board add', { root: '.', slug: 'x', type: 'nope' }), /type is one of item, thread/);
});

test('the read tools run a writing operation only with its read flag', () => {
  assert.equal(refusal('wf_query', 'index', { check: true }), null);
  assert.match(refusal('wf_query', 'index', {}), /only with check: true/);
  assert.match(refusal('wf_read', 'record set', {}), /belongs to wf_run/);
  for (const r of registry().values()) if (r.tool === 'wf_person') assert.notEqual(refusal('wf_run', r.op), null);
});

test('the ten tools fit the budget, and wf_person asks the person', () => {
  const tools = toolList();
  assert.equal(tools.length, 10);
  // About 6,000 tokens at four characters each.
  assert.ok(JSON.stringify(tools).length < 24_000, `${JSON.stringify(tools).length} characters`);
  const person = tools.find((t) => t.name === 'wf_person');
  assert.equal(person._meta['anthropic/requiresUserInteraction'], true);
  for (const t of tools) assert.equal(t.annotations.readOnlyHint, ['wf_context', 'wf_read', 'wf_query'].includes(t.name), t.name);
});

test('an operation may leave out its first word within its tool', () => {
  assert.equal(fullOp('wf_step', 'done'), 'step done');
  assert.equal(fullOp('wf_decide', 'hold'), 'decide hold');
  assert.equal(fullOp('wf_read', 'record get'), 'record get');
});

test('a fix command of wf.mjs becomes the tool call that does the same', () => {
  assert.deepEqual(callOfCommand('wf.mjs status C:/p'), { tool: 'wf_context', arguments: { op: 'status' } });
  assert.deepEqual(callOfCommand('wf.mjs decide hold . demo --key db --question "Which db?" --stage plan'), { tool: 'wf_decide', arguments: { op: 'decide hold', slug: 'demo', key: 'db', question: 'Which db?', stage: 'plan' } });
  assert.deepEqual(fixOf('fix.who: agent\nfix.do: List the workflows.\nfix: wf.mjs status .'), { who: 'agent', do: 'List the workflows.', command: 'wf.mjs status .' });
});

test('every caller but the person runs with WF_ACTOR, so the person-only guards refuse it', () => {
  assert.equal(workerEnv('agent', {}, {}).WF_ACTOR, 'agent');
  assert.equal(workerEnv(undefined, {}, {}).WF_ACTOR, 'unknown');
  assert.equal(workerEnv('person', {}, { WF_ACTOR: 'x' }).WF_ACTOR, undefined);
});

test('the server speaks both handshakes and returns the same JSON as text and as structured content', async () => {
  const old = await handle({ id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
  assert.equal(old.result.protocolVersion, '2025-11-25');
  const modern = await handle({ id: 2, method: 'server/discover', params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } } });
  assert.equal(modern.result.resultType, 'complete');
  assert.ok(modern.result.supportedVersions.includes('2026-07-28'));
  const r = toolResult({ ok: true, data: { a: 1 } });
  assert.deepEqual(JSON.parse(r.content[0].text), r.structuredContent);
  const big = toolResult({ ok: true, data: 'x'.repeat(50_000) });
  assert.ok(big.content[0].text.length < 41_000 && big.structuredContent.truncated);
  assert.equal((await handle({ id: 3, method: 'nosuch' })).error.code, -32601);
});

test('the hook refuses wf_person for a sub-agent, and lets the session call it', () => {
  const hook = join(import.meta.dirname, '..', '..', 'hooks', 'pre-tool-use-all.mjs');
  const call = (input) => spawnSync(process.execPath, [hook], { input: JSON.stringify(input), encoding: 'utf8' });
  const person = 'mcp__plugin_sdlc-workflow_wf__wf_person';
  assert.equal(call({ agent_id: 'a1', tool_name: person, tool_input: {} }).status, 2);
  assert.equal(call({ tool_name: person, tool_input: {} }).status, 0);
  assert.equal(call({ agent_id: 'a1', tool_name: 'mcp__plugin_sdlc-workflow_wf__wf_step', tool_input: {} }).status, 0);
});
