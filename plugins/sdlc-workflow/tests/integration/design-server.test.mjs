// The design server: the routes of the canvas and the brainstorm pages, the two write routes,
// and the refusals. The server listens on 127.0.0.1 with a free port.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addScreen, initSurface } from '../../lib/design-surface.mjs';
import { formatDoctorTable } from '../../lib/doctor.mjs';
import { listenDesignServer, saveLayout, tailnetAddresses, taskCreateArgs, taskStatus } from '../../lib/design-server.mjs';

function raw(port, path, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((ok, no) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', no);
    if (body !== null) req.write(body);
    req.end();
  });
}
const post = (port, path, value, headers = {}) => raw(port, path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value) });

test('the design server serves the canvas and the brainstorm pages, and writes only comments and layout', async () => {
  const top = mkdtempSync(join(tmpdir(), 'design-server-'));
  const root = join(top, 'Shop');
  mkdirSync(root);
  execFileSync('git', ['init', '-q', root]);
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  let servers = [];
  try {
    initSurface(root);
    addScreen(root, 'basket', { title: 'Basket', workflow: 'w1' });
    execFileSync('git', ['-C', root, 'add', '.ai/design']);
    execFileSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'screens']);
    const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    mkdirSync(join(root, '.ai', 'workflows', 'idea', 'page'), { recursive: true });
    writeFileSync(join(root, '.ai', 'workflows', 'idea', 'page', 'index.html'), '<h1>Idea</h1>');
    writeFileSync(join(top, 'secret.txt'), 'secret');

    const live = await listenDesignServer({ port: 0, hosts: ['127.0.0.1'] });
    servers = live.servers;
    const { port } = live;

    const index = await raw(port, '/');
    assert.match(index.text, /href="\/r\/shop\/"/);
    assert.match(index.text, /href="\/b\/shop\/idea\/"/);
    assert.equal((await raw(port, '/r/shop')).status, 301);
    assert.match((await raw(port, '/r/shop/')).text, /canvas\.js/);
    assert.equal((await raw(port, '/canvas/canvas.js')).status, 200);
    assert.equal((await raw(port, '/canvas/other.js')).status, 404);
    const state = JSON.parse((await raw(port, '/r/shop/state.json')).text);
    assert.deepEqual([state.repo, state.writable, state.screens.map((s) => s.key)], ['shop', true, ['basket']]);
    assert.match((await raw(port, '/r/shop/s/screens/basket.html')).text, /wf:screen/);
    assert.match((await raw(port, `/r/shop/at/${sha}/screens/basket.html`)).text, /wf:screen/);
    const page = await raw(port, '/b/shop/idea/');
    assert.equal(page.text, '<h1>Idea</h1>');
    assert.equal(page.headers['content-security-policy'], 'sandbox allow-scripts', 'a brainstorm page runs with no origin');

    for (const path of ['/r/shop/s/..%2f..%2fsecret.txt', '/r/shop/s/%2e%2e/%2e%2e/secret.txt', '/r/nope/', '/r/shop/at/zzz/screens/basket.html', '/r/shop/at/abcdef1/..%2f..%2fsecret.txt']) {
      const r = await raw(port, path);
      assert.ok(r.status >= 400, `${path} is refused`);
      assert.doesNotMatch(r.text, /secret/);
    }

    const c = await post(port, '/r/shop/comments/basket', { text: 'Bigger total', author: 'po', anchor: { x: 0.5, y: 0.5, state: 'default' } });
    assert.equal(c.status, 200);
    assert.equal(JSON.parse((await raw(port, '/r/shop/state.json')).text).screens[0].openComments, 1);
    assert.equal((await post(port, '/r/shop/comments/ghost', { text: 'x' })).status, 400, 'no comment on a screen that does not exist');
    assert.equal((await raw(port, '/r/shop/comments/basket', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"text":"x"}' })).status, 403, 'a write must be JSON');
    assert.equal((await post(port, '/r/shop/comments/basket', { text: 'x' }, { origin: 'http://evil.test' })).status, 403, 'a write from another page is refused');
    assert.equal((await post(port, '/r/shop/other', {})).status, 404, 'there is no other write route');
    assert.equal((await post(port, '/r/shop/layout', { positions: { basket: { x: 12.4, y: 30 } } })).status, 200);
    assert.deepEqual(JSON.parse(readFileSync(join(root, '.ai', 'design', 'layout.json'), 'utf8')).positions, { basket: { x: 12, y: 30 } });
    assert.equal((await post(port, '/r/shop/layout', { positions: { ghost: { x: 1, y: 1 } } })).status, 400);
    assert.throws(() => saveLayout(root, { basket: { x: 'a', y: 1 } }), /two numbers/);
  } finally {
    for (const s of servers) s.close();
    if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
    rmSync(top, { recursive: true, force: true });
  }
});

test('the tailnet addresses, the scheduled task and its doctor row', () => {
  assert.deepEqual(tailnetAddresses({ eth: [{ family: 'IPv4', address: '192.168.1.4' }], ts: [{ family: 'IPv4', address: '100.101.7.9' }, { family: 'IPv6', address: 'fd7a::1' }], x: [{ family: 'IPv4', address: '100.200.1.1' }] }), ['100.101.7.9']);
  const args = taskCreateArgs({ node: 'C:\\node.exe', script: 'C:\\p\\design-server.mjs' });
  assert.deepEqual(args.slice(0, 6), ['/Create', '/F', '/TN', 'sdlc-design-server', '/SC', 'ONLOGON']);
  assert.equal(args.at(-1), '"C:\\node.exe" "C:\\p\\design-server.mjs"');
  assert.deepEqual(taskStatus({ platform: 'linux' }), { supported: false, installed: false });
  assert.deepEqual(taskStatus({ platform: 'win32', run: () => ({ status: 1 }) }), { supported: true, installed: false });
  const gone = taskStatus({ platform: 'win32', run: () => ({ status: 0, stdout: 'TaskName: \\sdlc-design-server\nTask To Run: "C:\\node.exe" "C:\\nowhere\\design-server.mjs"\n' }) });
  assert.deepEqual([gone.installed, gone.targetExists], [true, existsSync('C:\\nowhere\\design-server.mjs')]);
  const table = formatDoctorTable({ shipped: '1.0.0', buildId: null, hosts: { claude: [], codex: [], pi: [] }, cleanup: { done: true, left: [] }, designTask: gone, verdicts: { claude: 'absent', codex: 'absent', pi: 'absent' }, ok: true });
  assert.match(table, /design server task\s+installed, its script is gone\s+run design server install/);
});
