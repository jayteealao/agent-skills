// The references show each call of wf as the tool call of the wf MCP server first, then its CLI
// form: no reference shows a whole operation of wf as a command line alone. The call and the CLI
// form of a pair are the same operation with the same fields.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cliAlone, parseCliLine, renderCall, renderCli, renderOp } from '../../lib/ops/render.mjs';

const SKILL = join(import.meta.dirname, '..', '..', 'skills', 'wf');
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.md')) files.push(p); } };
walk(SKILL);

test('no reference shows a call of wf as a command line alone', () => {
  const alone = files.flatMap((f) => cliAlone(readFileSync(f, 'utf8')).map((a) => `${f.slice(SKILL.length + 1)}:${a.line}: ${a.text}`));
  assert.deepEqual(alone, [], 'put the tool call first: `<call>` (CLI: `<line>`)');
});

test('the call of each pair is the operation of its CLI form', () => {
  const bad = [];
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/`([^`\n]*)` \(CLI: `([^`\n]*)`\)/g)) {
      const c = parseCliLine(m[2]);
      if (c && renderCall(c.op, c.fields) !== m[1]) bad.push(`${f.slice(SKILL.length + 1)}: ${m[1]} ≠ ${m[2]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('a call renders by host: the tool on Claude, the command line on Codex and pi', () => {
  assert.equal(renderOp('claude', 'step done', { slug: 'demo', slice: 'api', n: 3 }), 'wf_step { "op": "step done", "slug": "demo", "slice": "api", "n": 3 }');
  assert.equal(renderOp('codex', 'step done', { slug: 'demo', slice: 'api', n: 3 }), 'node "<skill-dir>/scripts/wf.mjs" step done "<root>" demo api 3');
  assert.equal(renderOp('pi', 'campaign next', { source: 'ideas' }), renderCli('campaign next', { source: 'ideas' }));
  assert.equal(renderOp('claude', 'record get', { slug: 'demo', name: 'index' }), 'wf_read { "slug": "demo", "items": [{ "op": "record get", "name": "index" }] }');
  assert.equal(renderOp('claude', 'record edit', { slug: 'demo', name: '04-plan', from: 'x.md' }), 'wf_run { "op": "record edit", "slug": "demo", "name": "04-plan", "text": "<the text>" }', 'content goes inline');
  assert.deepEqual(cliAlone('Run `node "<skill-dir>/scripts/wf.mjs" step done "<root>" demo api 3`.').map((a) => a.op), ['step done']);
});
