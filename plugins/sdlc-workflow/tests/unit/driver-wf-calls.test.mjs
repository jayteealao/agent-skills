// The driver scripts show each call of wf in a prompt as the call of a tool of the wf MCP server
// on Claude, then the command line. They cannot import lib/ops/render.mjs, so each holds a copy of
// the renderer: the copies are the same text, and they render as the library does.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { opsTable, parseCliLine, renderCall } from '../../lib/ops/render.mjs';

const DIR = join(import.meta.dirname, '..', '..', 'skills', 'wf', 'workflows');
const START = '// --- wf calls: the same text in yolo.js and optimize.js (tests/unit/driver-wf-calls.test.mjs) ---';
const END = '// --- end of wf calls ---';
const blockOf = (name) => {
  const s = readFileSync(join(DIR, name), 'utf8').replace(/\r\n/g, '\n');
  const a = s.indexOf(START);
  const b = s.indexOf(END);
  assert.ok(a >= 0 && b > a, `${name} has the block`);
  return s.slice(a + START.length, b);
};

/** The renderer of the block, run with a host and a table. */
const rendererOf = (host, ops) => new Function('HOST', 'WF_OPS_IN', `${blockOf('yolo.js').replace('const WF_OPS = null', 'const WF_OPS = WF_OPS_IN')}\nreturn { wf, wfCall }`)(host, ops);

test('the two drivers hold the same renderer', () => {
  assert.equal(blockOf('optimize.js'), blockOf('yolo.js'));
});

test('the renderer of a driver gives the call that the library gives', () => {
  const r = rendererOf('claude', opsTable());
  const lines = [
    'node "/p/skills/wf/scripts/wf.mjs" step done "/repo" demo api 3 --sha HEAD',
    'node "/p/skills/wf/scripts/wf.mjs" decide answered "/repo" demo --key db',
    'node "/p/skills/wf/scripts/wf.mjs" record get "/repo" demo 04-plan-api',
    'node "/p/skills/wf/scripts/wf.mjs" talk wait "/repo" demo --as verify:api --job J-1',
    'node "/p/skills/wf/scripts/wf.mjs" findings add "/repo" demo /d/found.json --source review --run r1',
    'node "/p/skills/wf/scripts/wf.mjs" progress set "/repo" demo --run r1 --driver yolo --stage plan --status running',
    'node "/p/skills/wf/scripts/wf.mjs" decide list "/repo" demo --kind steer,note --slice api --rules',
    'node "/p/skills/wf/scripts/optimize.mjs" status "/repo" demo',
    'node "/p/skills/wf/scripts/wf.mjs" talk job "/repo" demo --as verify:api --name suite -- "npm test"',
  ];
  for (const l of lines) {
    const c = parseCliLine(l);
    assert.ok(c, l);
    // The library writes the content of a file of the CLI as a hint; the driver names that file.
    const want = renderCall(c.op, c.fields).replace(/"<the (text|JSON)>"/, '"<the content of that file, inline>"');
    assert.equal(r.wfCall(l), want, l);
  }
  const first = parseCliLine(lines[0]);
  assert.equal(r.wf(lines[0]), `\`${renderCall(first.op, first.fields)}\` (CLI: \`${lines[0]}\`)`);
});

test('on Codex and pi, or with no table, a prompt keeps the command line', () => {
  const line = 'node "/p/skills/wf/scripts/wf.mjs" step done "/repo" demo api 3';
  assert.equal(rendererOf('codex', opsTable()).wf(line), `\`${line}\``);
  assert.equal(rendererOf('pi', opsTable()).wf(line), `\`${line}\``);
  assert.equal(rendererOf('claude', null).wf(line), `\`${line}\``);
});

test('wf_context fills the calls of a brief: slug, slice and stage, each call once', async () => {
  const { readyCalls } = await import('../../lib/ops/render.mjs');
  const pair = (op, f) => `\`${renderCall(op, f)}\` (CLI: \`wf.mjs ${op}\`)`;
  const text = `Run ${pair('step done', { slug: '<slug>', slice: '<slice>', n: '<n>' })}, then ${pair('receipt', {})} and ${pair('receipt', {})}.`;
  const r = readyCalls(text, { slug: 'demo', slice: 'api', stage: 'implement' });
  assert.deepEqual(r.calls, [renderCall('step done', { slug: 'demo', slice: 'api', n: '<n>' }), renderCall('receipt', {})]);
  assert.match(r.text, /"slug": "demo", "slice": "api"/);
  assert.match(r.text, /CLI: `wf\.mjs step done`/, 'the CLI half stays as it was');
});
