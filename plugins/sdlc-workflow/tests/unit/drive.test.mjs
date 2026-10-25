// lib/drive.mjs: the Node runner of a workflow script on Codex. A fake exec stands in for
// `codex exec`: it reads the argv, writes the last-message file, and prints usage events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { boundedParallel, codexArgs, driveScript, fromStrict, readRun, strictSchema, usageOf } from '../../lib/drive.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// A fake exec: `answer(label, prompt)` gives the last message; each call reports 10 input tokens.
function fakeExec(answer, calls = []) {
  return async ({ args, prompt, eventsFile }) => {
    const last = args[args.indexOf('-o') + 1];
    const label = path.basename(last).replace(/^a\d+-/, '').replace(/\.last\.txt$/, '');
    calls.push({ label, args, prompt });
    const a = answer(label, prompt);
    if (a !== undefined) writeFileSync(last, typeof a === 'string' ? a : JSON.stringify(a));
    const events = `${JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 2 } })}\n`;
    writeFileSync(eventsFile, events);
    return { code: a === undefined ? 1 : 0, events, timedOut: false };
  };
}

test('strictSchema closes every object, makes optional keys nullable, and fromStrict undoes it', () => {
  const s = { type: 'object', required: ['a'], properties: { a: { type: 'string' }, b: { enum: ['x', 'y'] }, c: { type: 'object' }, d: { type: 'array', items: { type: 'object', properties: { e: { type: 'number' } } } } } };
  const strict = strictSchema(s);
  assert.deepEqual(strict.required, ['a', 'b', 'c', 'd']);
  assert.equal(strict.additionalProperties, false);
  assert.deepEqual(strict.properties.b.enum, ['x', 'y', null]);
  assert.deepEqual(strict.properties.c.type, ['string', 'null'], 'a free-form object is a JSON string');
  assert.deepEqual(strict.properties.d.type, ['array', 'null']);
  assert.deepEqual(strict.properties.d.items.required, ['e']);
  assert.deepEqual(fromStrict({ a: 'v', b: null, c: '{"k":1}', d: [{ e: null }] }, s), { a: 'v', c: { k: 1 }, d: [{}] });
});

test('codexArgs sends the prompt on stdin, the schema and the last message by file, and the sandbox', () => {
  const a = codexArgs({ cwd: '/r', lastFile: '/l.txt', schemaFile: '/s.json', model: 'gpt-x', effort: 'high' });
  assert.deepEqual(a, ['exec', '-C', '/r', '--skip-git-repo-check', '--json', '-s', 'workspace-write', '-o', '/l.txt', '--output-schema', '/s.json', '-m', 'gpt-x', '-c', 'model_reasoning_effort=high', '-']);
  assert.ok(!codexArgs({ cwd: '/r', lastFile: '/l' }).includes('--output-schema'));
});

test('usageOf sums the turn.completed events', () => {
  const ev = [{ type: 'turn.completed', usage: { input_tokens: 5, cached_input_tokens: 1, output_tokens: 2, reasoning_output_tokens: 1 } }, { type: 'item.completed' }, { type: 'turn.completed', usage: { input_tokens: 3 } }].map((o) => JSON.stringify(o)).join('\n');
  assert.deepEqual(usageOf(ev), { input: 8, cached: 1, output: 2, reasoning: 1 });
});

test('boundedParallel keeps order, caps the agents that run at once, and gives null for a throw', async () => {
  let live = 0;
  let peak = 0;
  const job = (v, ms) => async () => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, ms)); live--; if (v === 'x') throw new Error('x'); return v; };
  const r = await boundedParallel([job('a', 20), job('x', 5), job('c', 5), job('d', 5)], 2);
  assert.deepEqual(r, ['a', null, 'c', 'd']);
  assert.equal(peak, 2);
});

const SCRIPT = `export const meta = { name: 't', description: 't' }
phase('One')
const a = await agent('first ' + args.n, { label: 'first', schema: { type: 'object', required: ['v'], properties: { v: { type: 'number' }, w: { type: 'string' } } } })
const [b, c] = await parallel([() => agent('second', { label: 'second' }), () => agent('third', { label: 'third' })])
const piped = await pipeline([1, 2], (x) => x * 10, (y) => y + 1)
log('done')
return { ok: true, a, b, c, piped }`;

test('driveScript runs a workflow script with agent, parallel, pipeline and log, and sums the usage', async () => {
  const runDir = mkdtempSync(path.join(tmpdir(), 'drive-'));
  const calls = [];
  const lines = [];
  const r = await driveScript({
    source: SCRIPT, args: { n: 7 }, cwd: '/repo', runDir, say: (l) => lines.push(l),
    exec: fakeExec((label) => (label === 'first' ? { v: 1, w: null } : `text of ${label}`), calls),
  });
  assert.deepEqual(r.result, { ok: true, a: { v: 1 }, b: 'text of second', c: 'text of third', piped: [11, 21] });
  assert.equal(calls[0].prompt, 'first 7');
  assert.ok(calls[0].args.includes('--output-schema'));
  assert.deepEqual(r.totals.usage, { input: 30, cached: 12, output: 6, reasoning: 0 });
  assert.ok(lines.includes('phase One') && lines.includes('done'));
  const schema = JSON.parse(readFileSync(calls[0].args[calls[0].args.indexOf('--output-schema') + 1], 'utf8'));
  assert.deepEqual(schema.required, ['v', 'w'], 'the strict schema goes to Codex');
  assert.equal(JSON.parse(readFileSync(path.join(runDir, 'result.json'), 'utf8')).result.ok, true);
});

test('a failed agent gives null and is recorded; a resumed run replays the agents that did not change', async () => {
  const runDir = mkdtempSync(path.join(tmpdir(), 'drive-'));
  const first = await driveScript({ source: SCRIPT, args: { n: 1 }, cwd: '/repo', runDir, exec: fakeExec((label) => (label === 'third' ? undefined : label === 'first' ? { v: 2 } : 'ok')) });
  assert.equal(first.result.c, null);
  assert.equal(first.totals.failed, 1);
  const calls = [];
  const second = await driveScript({ source: SCRIPT, args: { n: 1 }, cwd: '/repo', runDir, resume: readRun(runDir), exec: fakeExec((label) => (label === 'first' ? { v: 9 } : 'live'), calls) });
  assert.deepEqual(calls.map((c) => c.label), ['third'], 'only the failed agent runs live');
  assert.equal(second.result.a.v, 2, 'the first agent is replayed');
  assert.equal(second.result.c, 'live');
  assert.equal(second.totals.replayed, 2);
});

test('the yolo driver runs under driveScript on Codex and passes no Claude model id', async () => {
  const source = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');
  const runDir = mkdtempSync(path.join(tmpdir(), 'drive-'));
  const calls = [];
  const r = await driveScript({
    source, cwd: '/repo', runDir,
    args: { projectRoot: '/repo', referenceRoot: '/p/skills/wf/reference', slug: 'demo', host: 'codex' },
    exec: fakeExec((label) => (label === 'orient' ? { ok: false, slug: 'demo', mode: 'slug', blockReason: 'not ready', route: '/wf plan demo', runId: 'run-1', slices: [], branch: {} } : label === 'run-end' ? { ended: true } : undefined), calls),
  });
  assert.equal(r.result.ok, false);
  assert.equal(r.result.reason, 'not ready');
  assert.deepEqual(calls.map((c) => c.label), ['orient', 'run-end']);
  for (const c of calls) assert.ok(!c.args.includes('-m'), `${c.label} names no model on Codex`);
  assert.ok(calls[0].args.includes('model_reasoning_effort=medium'));
});
