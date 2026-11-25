// The wf MCP server over stdio on a fixture project: the reads change no file, the writes land
// as the CLI writes them, and the guards of the person hold.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PLUGIN_ROOT, SLUG, makeFixture } from '../evals/code-mode/fixture.mjs';

function digest(dir) {
  const h = createHash('sha1');
  const walk = (d) => {
    for (const e of existsSync(d) ? readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)) : []) {
      const p = join(d, e.name);
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
    while ((i = buf.indexOf('\n')) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      waiting.get(m.id)?.(m);
    }
  });
  let id = 0;
  const rpc = (method, params = {}) => new Promise((ok) => { id += 1; waiting.set(id, ok); p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
  const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result.structuredContent;
  return { rpc, call, stop: () => p.kill() };
}

test('the server reads without a change, writes like the CLI, and keeps the person\'s calls to the person', { timeout: 180_000 }, async () => {
  const top = realpathSync(mkdtempSync(join(tmpdir(), 'mcp-server-')));
  const root = join(top, 'p');
  makeFixture(root);
  const s = server(root, join(top, 'home'));
  try {
    await s.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {} });
    assert.equal((await s.rpc('tools/list')).result.tools.length, 10);

    const before = digest(join(root, '.ai'));
    const reads = [
      ['wf_context', { slug: SLUG }],
      ['wf_context', { argv: ['implement', SLUG, 's3'] }],
      ['wf_context', { slug: SLUG, stage: 'implement', slice: 's3' }],
      ['wf_read', { slug: SLUG, items: [{ op: 'record get', name: ['04-plan-s3'], section: 'Step-by-Step Plan' }, { op: 'decide list' }, { op: 'findings list' }, { op: 'step where', slice: 's3' }] }],
      ['wf_query', { op: 'index', check: true }],
      ['wf_query', { op: 'progress show', slug: SLUG }],
      ['wf_query', { op: 'help', command: 'record' }],
    ];
    for (const [tool, args] of reads) {
      const r = await s.call(tool, args);
      assert.equal(r.ok, true, `${tool} ${JSON.stringify(args)}: ${JSON.stringify(r.error ?? r.data)}`);
    }
    assert.equal(digest(join(root, '.ai')), before, 'no read changed a file');

    const route = await s.call('wf_context', { argv: ['implement', SLUG, 's3'] });
    assert.equal(route.data.key, 'implement');
    const where = (await s.call('wf_read', { slug: SLUG, items: [{ op: 'step where', slice: 's3' }] })).data[0].data;
    assert.equal(where.next.n, 3);

    const done = await s.call('wf_step', { op: 'done_next', slug: SLUG, slice: 's3', n: 3, 'no-change': true, next_title: 'Docs' });
    assert.equal(done.ok, true, JSON.stringify(done));
    const after = (await s.call('wf_read', { slug: SLUG, items: [{ op: 'step where', slice: 's3' }] })).data[0].data;
    assert.equal((after.current?.n ?? after.current), 4, JSON.stringify(after));

    const set = await s.call('wf_run', { op: 'record set', slug: SLUG, name: '03-slice', path: ['slices[s4].status=in-progress'] });
    assert.equal(set.ok, true, JSON.stringify(set));
    const field = await s.call('wf_read', { slug: SLUG, items: [{ op: 'record get', name: ['03-slice'], field: 'slices[s4].status' }] });
    assert.match(JSON.stringify(field.data[0].data), /in-progress/);

    const agentAnswer = await s.call('wf_decide', { op: 'add', slug: SLUG, key: 'q2', answer: 'sqs', by: 'person' });
    assert.equal(agentAnswer.ok, false);
    assert.match(agentAnswer.error.message, /in the name of the person/);
    const stage = await s.call('wf_decide', { op: 'add', slug: SLUG, key: 'q2', question: 'Which queue?', answer: 'sqs', by: 'stage' });
    assert.equal(stage.ok, true, JSON.stringify(stage));
    const person = await s.call('wf_person', { op: 'decide add', slug: SLUG, key: 'q5', question: 'Which region?', answer: 'eu-west-1', by: 'person' });
    assert.equal(person.ok, true, JSON.stringify(person));

    const wrong = await s.call('wf_query', { op: 'record set', slug: SLUG, name: 'index', path: ['current-stage=verify'] });
    assert.match(wrong.error.message, /belongs to wf_run/);
    const missing = await s.call('wf_read', { items: [{ op: 'record get', slug: 'nosuch', name: ['index'] }] });
    assert.equal(missing.data[0].error.call.tool, 'wf_context', 'the fix comes as a tool call');
  } finally {
    s.stop();
    rmSync(top, { recursive: true, force: true, maxRetries: 5 });
  }
});
