// Code mode of the wf MCP server, over stdio on the code-mode fixture: wf_query reads and writes
// nothing, wf_run writes all or nothing, and the code reaches no file or process of its own.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PLUGIN_ROOT, SLUG, makeFixture } from '../evals/code-mode/fixture.mjs';
import { permissionFlag } from '../../lib/ops/code-host.mjs';

function digest(dir) {
  const h = createHash('sha1');
  const walk = (d) => {
    for (const e of existsSync(d) ? readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)) : []) {
      const p = join(d, e.name);
      if (e.name.endsWith('.lock') || e.name === '.api-log.jsonl') continue;
      if (e.isDirectory()) walk(p); else h.update(p).update(readFileSync(p));
    }
  };
  walk(dir);
  return h.digest('hex');
}

function server(root, home) {
  const p = spawn(process.execPath, [join(PLUGIN_ROOT, 'mcp', 'server.mjs')], { env: { ...process.env, CLAUDE_PROJECT_DIR: root, SDLC_HOME: home, SDLC_RECORDS_PUSH: 'off', WF_ACTOR: '' }, stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = new Map();
  let buf = '';
  p.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); waiting.get(m.id)?.(m); }
  });
  let id = 0;
  const rpc = (method, params = {}) => new Promise((ok) => { id += 1; waiting.set(id, ok); p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
  const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result.structuredContent;
  return { rpc, call, stop: () => p.kill() };
}

test('code mode: reads, all-or-nothing writes, and no door to the files', { timeout: 180_000, skip: permissionFlag() ? false : 'no permission model in this Node' }, async () => {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-code-')));
  const root = join(top, 'p');
  makeFixture(root);
  const s = server(root, join(top, 'home'));
  const status = "return wf.records.field('03-slice', 'slices[s4].status')";
  try {
    await s.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {} });
    const before = digest(join(root, '.ai'));

    const q = await s.call('wf_query', { slug: SLUG, code: "return { records: wf.records.list().length, open: wf.findings.list({ open: true }).map((f) => f.id), next: wf.steps.where('s3').next }" });
    assert.equal(q.ok, true, JSON.stringify(q));
    assert.ok(q.data.records > 0 && Array.isArray(q.data.open) && q.data.next.n === 3, JSON.stringify(q.data));
    const qw = await s.call('wf_query', { slug: SLUG, code: "wf.records.set('03-slice', 'slices[s4].status', 'in-progress')" });
    assert.equal(qw.ok, false);
    assert.match(qw.error.message, /not a function here[\s\S]*wf_run/);
    for (const code of ["return typeof require + typeof process + typeof Buffer", "return typeof globalThis.process"]) {
      const r = await s.call('wf_query', { slug: SLUG, code });
      assert.equal(r.ok, true);
      assert.doesNotMatch(String(r.data), /function|object/, code);
    }
    assert.equal(digest(join(root, '.ai')), before, 'wf_query changed no file');

    const dry = await s.call('wf_run', { slug: SLUG, dryRun: true, code: "wf.records.set('03-slice', 'slices[s4].status', 'in-progress'); return 1" });
    assert.equal(dry.ok, true, JSON.stringify(dry));
    assert.equal(dry.applied, false);
    const thrown = await s.call('wf_run', { slug: SLUG, code: "wf.records.set('03-slice', 'slices[s4].status', 'in-progress'); throw new Error('stop here')" });
    assert.equal(thrown.ok, false);
    assert.match(thrown.error.message, /stop here/);
    assert.equal(digest(join(root, '.ai')), before, 'a dry run and a throw keep no change');

    const person = await s.call('wf_run', { slug: SLUG, code: "wf.decisions.add({ kind: 'answer', key: 'q9', question: 'Which?', answer: 'x', by: 'person' })" });
    assert.equal(person.ok, false);
    assert.match(person.error.message, /in the name of the person/);

    const kept = await s.call('wf_run', { slug: SLUG, code: `wf.records.set('03-slice', 'slices[s4].status', 'in-progress'); ${status}` });
    assert.equal(kept.ok, true, JSON.stringify(kept));
    assert.equal(kept.data, 'in-progress');
    assert.deepEqual(kept.changed, [SLUG]);
    assert.equal((await s.call('wf_query', { slug: SLUG, code: status })).data, 'in-progress');

    const both = await s.call('wf_run', { slug: SLUG, op: 'record set', code: 'return 1' });
    assert.match(both.error.message, /op or code, not both/);
  } finally {
    s.stop();
    rmSync(top, { recursive: true, force: true, maxRetries: 5 });
  }
});
