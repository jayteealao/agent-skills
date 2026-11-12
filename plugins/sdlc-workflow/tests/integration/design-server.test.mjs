// The design server: the routes of the canvas and the brainstorm pages, the two write routes, the audit routes,
// and the refusals. The server listens on 127.0.0.1 with a free port.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addScreen, initSurface, screenFile } from '../../lib/design-surface.mjs';
import { formatDoctorTable } from '../../lib/doctor.mjs';
import { WRITE_HEADER, changeOf, sameStatChanges, designHandler, gzipKeptNow, gzipOf, listenDesignServer, phoneBase, repoList, saveLayout, tailnetAddresses, taskCreateArgs, taskStatus, writeToken } from '../../lib/design-server.mjs';

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
// The bytes of an answer, as they came: a compressed body is not text.
function rawBytes(port, path, headers = {}) {
  return new Promise((ok, no) => {
    const req = request({ host: '127.0.0.1', port, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', no);
    req.end();
  });
}
// A write as the canvas sends it: from a page of this server, with the write token of this run.
const post = (port, path, value, headers = {}) => raw(port, path, { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}`, [WRITE_HEADER]: writeToken(), ...headers }, body: JSON.stringify(value) });

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
    // Any page, sheet or script of the canvas folder is served by a plain name; no other name is.
    assert.equal((await raw(port, '/canvas/canvas-library.js')).status, 200);
    assert.equal((await raw(port, '/canvas/canvas-library.css')).status, 200);
    for (const bad of ['/canvas/Canvas.js', '/canvas/.canvas.js', '/canvas/canvas.mjs', '/canvas/canvas.js.map', '/canvas/%2e%2e%2fpackage.json']) assert.notEqual((await raw(port, bad)).status, 200, bad);
    const state = JSON.parse((await raw(port, '/r/shop/state.json')).text);
    assert.deepEqual([state.repo, state.writable, state.screens.map((s) => s.key)], ['shop', true, ['basket']]);
    // The state names the repos of the list, with no path, and no address for a phone: this server listens on this computer only.
    assert.deepEqual([state.repos, state.phone], [[{ name: 'shop', surface: true }], null]);
    assert.doesNotMatch(JSON.stringify(state.repos), /Shop|home/);
    assert.match((await raw(port, '/r/shop/s/screens/basket.html')).text, /wf:screen/);
    assert.match((await raw(port, `/r/shop/at/${sha}/screens/basket.html`)).text, /wf:screen/);
    const page = await raw(port, '/b/shop/idea/');
    assert.equal(page.text, '<h1>Idea</h1>');
    assert.match(page.headers['content-security-policy'], /^sandbox allow-scripts; default-src 'none'/, 'a brainstorm page runs with no origin and fetches nothing');

    for (const path of ['/r/shop/s/..%2f..%2fsecret.txt', '/r/shop/s/%2e%2e/%2e%2e/secret.txt', '/r/nope/', '/r/shop/at/zzz/screens/basket.html', '/r/shop/at/abcdef1/..%2f..%2fsecret.txt']) {
      const r = await raw(port, path);
      assert.ok(r.status >= 400, `${path} is refused`);
      assert.doesNotMatch(r.text, /secret/);
    }

    const c = await post(port, '/r/shop/comments/basket', { text: 'Bigger total', author: 'po', anchor: { x: 0.5, y: 0.5, state: 'default' } });
    assert.equal(c.status, 200);
    assert.equal(JSON.parse(c.text).threads.length, 1, 'the answer carries the threads of the screen');
    const fresh = await raw(port, '/r/shop/state.json');
    const slim = JSON.parse(fresh.text).screens[0];
    assert.deepEqual([slim.openComments, slim.failures, slim.failureTotal], [1, undefined, 0], 'the state holds the counts of the failures, not the failures');
    assert.ok(fresh.headers.etag, 'the state has an ETag');
    assert.equal((await raw(port, '/r/shop/state.json', { headers: { 'if-none-match': fresh.headers.etag } })).status, 304, 'an unchanged state is not sent again');
    assert.deepEqual(JSON.parse((await raw(port, '/r/shop/failures/basket.json')).text), { failures: [], failureGroups: [] });
    assert.equal((await raw(port, '/canvas/canvas.js', { headers: { 'accept-encoding': 'gzip' } })).headers['content-encoding'], 'gzip');
    assert.equal((await post(port, '/r/shop/comments/ghost', { text: 'x' })).status, 400, 'no comment on a screen that does not exist');
    assert.equal((await raw(port, '/r/shop/comments/basket', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{"text":"x"}' })).status, 403, 'a write must be JSON');
    assert.equal((await post(port, '/r/shop/comments/basket', { text: 'x' }, { origin: 'http://evil.test' })).status, 403, 'a write from another page is refused');
    assert.equal((await post(port, '/r/shop/other', {})).status, 404, 'there is no other write route');
    assert.equal((await post(port, '/r/shop/layout', { positions: { basket: { x: 12.4, y: 30 } } })).status, 200);
    assert.deepEqual(JSON.parse(readFileSync(join(root, '.ai', 'design', 'layout.json'), 'utf8')).positions, { basket: { x: 12, y: 30 } });
    assert.equal((await post(port, '/r/shop/layout', { positions: { ghost: { x: 1, y: 1 } } })).status, 400);
    assert.throws(() => saveLayout(root, { basket: { x: 'a', y: 1 } }), /two numbers/);
    assert.throws(() => saveLayout(root, { basket: { x: null, y: 1 } }), /two numbers/);

    // A null takes the position of a screen away: the canvas sends nulls to lay the board out again.
    const reset = await post(port, '/r/shop/layout', { positions: { basket: null, ghost: null } });
    assert.deepEqual([reset.status, JSON.parse(reset.text)], [200, { ok: true, saved: 0, removed: 1 }]);
    assert.deepEqual(JSON.parse(readFileSync(join(root, '.ai', 'design', 'layout.json'), 'utf8')).positions, {});

    // The state names the write token, and a write without it, or with no origin, is refused.
    assert.equal(JSON.parse((await raw(port, '/r/shop/state.json')).text).writeToken, writeToken());
    assert.deepEqual(JSON.parse((await raw(port, '/r/shop/state.json')).text).recordsCommit, { pending: 0, failed: null });
    assert.equal((await post(port, '/r/shop/layout', { positions: {} }, { [WRITE_HEADER]: 'wrong' })).status, 403, 'a wrong token');
    assert.equal((await post(port, '/r/shop/layout', { positions: {} }, { [WRITE_HEADER]: '' })).status, 403, 'no token');
    assert.equal((await raw(port, '/r/shop/layout', { method: 'POST', headers: { 'content-type': 'application/json', [WRITE_HEADER]: writeToken() }, body: '{"positions":{}}' })).status, 403, 'neither Origin nor Referer');
    assert.equal((await raw(port, '/r/shop/layout', { method: 'POST', headers: { 'content-type': 'application/json', referer: `http://127.0.0.1:${port}/r/shop/`, [WRITE_HEADER]: writeToken() }, body: '{"positions":{}}' })).status, 200, 'the Referer of the canvas alone');
    assert.equal((await post(port, '/r/shop/layout', [1])).status, 400, 'a body that is no object');
    const big = await raw(port, '/r/shop/comments/basket', { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}`, [WRITE_HEADER]: writeToken() }, body: JSON.stringify({ text: 'x'.repeat(70 * 1024) }) }).catch(() => ({ status: 400 }));
    assert.equal(big.status, 400, 'a body over the limit');

    // A design page loads nothing from the network and opens no connection.
    for (const path of ['/r/shop/s/screens/basket.html', `/r/shop/at/${sha}/screens/basket.html`]) {
      const csp = (await raw(port, path)).headers['content-security-policy'];
      assert.match(csp, /default-src 'none'/, path);
      assert.match(csp, /connect-src 'none'; frame-src 'none'/, path);
      assert.match(csp, /form-action 'none'; base-uri 'none'/, path);
      assert.doesNotMatch(csp, /https?:|\*/, `${path} names no outside source`);
    }
    assert.equal((await raw(port, '/r/shop/')).headers['content-security-policy'], undefined, 'the canvas is not a design page');

    // The health answer names the server, so no other program on the port passes for it.
    assert.equal(JSON.parse((await raw(port, '/health')).text).pid, process.pid);
  } finally {
    for (const s of servers) s.close();
    if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
    rmSync(top, { recursive: true, force: true });
  }
});

test('an open canvas gets each change of its repo, with the pages that changed', async () => {
  const top = mkdtempSync(join(tmpdir(), 'design-events-'));
  const root = join(top, 'Shop');
  mkdirSync(root);
  execFileSync('git', ['init', '-q', root]);
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  let servers = [];
  let stream = null;
  try {
    initSurface(root);
    addScreen(root, 'basket', { title: 'Basket', workflow: 'w1' });
    const live = await listenDesignServer({ port: 0, hosts: ['127.0.0.1'] });
    servers = live.servers;
    const events = [];
    await new Promise((ok, no) => {
      stream = request({ host: '127.0.0.1', port: live.port, path: '/r/shop/events' }, (res) => {
        assert.equal(res.headers['content-type'], 'text/event-stream; charset=utf-8');
        res.setEncoding('utf8');
        res.on('data', (t) => { for (const m of t.matchAll(/event: change\ndata: (.+)\n/g)) events.push(JSON.parse(m[1])); });
        ok();
      });
      stream.on('error', no);
      stream.end();
    });
    writeFileSync(join(root, '.ai', 'design', 'screens', 'basket.html'), '<html><body><section data-state="default">new</section></body></html>');
    // The watch tells the server at once; the poll of every 5 seconds is the fallback.
    for (let i = 0; i < 80 && !events.length; i += 1) await new Promise((ok) => setTimeout(ok, 100));
    assert.ok(events.length, 'a change came');
    assert.deepEqual([events[0].pages, events[0].all], [['basket'], false]);
    assert.match(events[0].etag, /^"[0-9a-f]+-\d+-[0-9a-z]+"$/);
    // Another text with the same size and the same time is a change too: the canvas hears of it,
    // the state has another ETag, and the page has another ETag, so no browser keeps the old text.
    const page = join(root, '.ai', 'design', 'screens', 'basket.html');
    // A time of whole seconds, which a later write can be given again.
    const when = new Date(Math.floor(Date.now() / 1000) * 1000);
    let seen = events.length;
    utimesSync(page, when, when);
    for (let i = 0; i < 80 && events.length === seen; i += 1) await new Promise((ok) => setTimeout(ok, 100));
    const first = await raw(live.port, '/r/shop/s/screens/basket.html');
    const stateTag = events.at(-1).etag;
    const was = statSync(page);
    seen = events.length;
    writeFileSync(page, '<html><body><section data-state="default">old</section></body></html>');
    utimesSync(page, when, when);
    assert.deepEqual([statSync(page).size, statSync(page).mtimeMs], [was.size, was.mtimeMs]);
    for (let i = 0; i < 80 && events.length === seen; i += 1) await new Promise((ok) => setTimeout(ok, 100));
    assert.ok(events.length > seen, 'the change of the text came');
    assert.deepEqual(events.at(-1).pages, ['basket']);
    assert.notEqual(events.at(-1).etag, stateTag);
    const second = await raw(live.port, '/r/shop/s/screens/basket.html', { headers: { 'if-none-match': first.headers.etag } });
    assert.equal(second.status, 200);
    assert.match(second.text, />old</);
    assert.notEqual(second.headers.etag, first.headers.etag);
  } finally {
    stream?.destroy();
    for (const s of servers) s.close();
    if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
    rmSync(top, { recursive: true, force: true });
  }
});

test('the changed files name the pages, the parts, and a change of every page', () => {
  const root = join(tmpdir(), 'Shop');
  const at = (rel) => join(root, '.ai', 'design', ...rel.split('/'));
  assert.deepEqual(changeOf(root, [at('screens/pay.html'), at('screens/basket/part.html'), at('explore/nav.html'), at('layout.json')]),
    { pages: ['basket', 'pay'], parts: ['explore/nav.html'], all: false, assets: false });
  assert.deepEqual(changeOf(root, [at('tokens.css')]), { pages: [], parts: [], all: true, assets: false });
  // A sheet of the sources is a sheet. A picture or a font is not: the canvas reads every page again.
  assert.equal(changeOf(root, [at('source/sketch.css')]).assets, false);
  assert.deepEqual(changeOf(root, [at('tokens.css'), at('source/logo.svg')]), { pages: [], parts: [], all: true, assets: true });
  assert.deepEqual(changeOf(root, [join(root, 'elsewhere.txt')]), { pages: [], parts: [], all: false, assets: false });
});

test('the audit routes start one run per repo and serve its report', async () => {
  const top = mkdtempSync(join(tmpdir(), 'design-server-audit-'));
  const root = join(top, 'Shop');
  mkdirSync(root);
  let servers = [];
  try {
    const calls = [];
    let report = { status: 'none' };
    const audit = {
      start: (r, opts) => { calls.push([r, opts]); if (report.status === 'running') return { started: false, reason: 'an audit of this repo runs now' }; report = { status: 'running', ...opts }; return { started: true, report }; },
      read: () => report,
    };
    const live = await listenDesignServer({ port: 0, hosts: ['127.0.0.1'], handler: designHandler({ repos: () => [{ name: 'shop', root }], audit }) });
    servers = live.servers;
    const { port } = live;
    assert.equal(JSON.parse((await raw(port, '/r/shop/audit.json')).text).status, 'none');
    const started = await post(port, '/r/shop/audit', { workflow: 'w1' });
    assert.equal(started.status, 202);
    assert.deepEqual(calls, [[root, { workflow: 'w1', repo: 'shop' }]]);
    assert.equal((await post(port, '/r/shop/audit', {})).status, 409, 'one run per repo');
    assert.equal((await post(port, '/r/shop/audit', { workflow: '../x' })).status, 400);
    assert.equal((await post(port, '/r/shop/audit', {}, { origin: 'http://evil.test' })).status, 403, 'a run from another page is refused');
    assert.equal(JSON.parse((await raw(port, '/r/shop/audit.json')).text).status, 'running');
  } finally {
    for (const s of servers) s.close();
    rmSync(top, { recursive: true, force: true });
  }
});

test('the tailnet addresses, the scheduled task and its doctor row', () => {
  // A carrier-grade NAT address of a modem is in the tailnet range: only Tailscale's own count.
  const ifaces = { eth: [{ family: 'IPv4', address: '192.168.1.4' }], Tailscale: [{ family: 'IPv4', address: '100.101.7.9' }, { family: 'IPv6', address: 'fd7a::1' }], wwan0: [{ family: 'IPv4', address: '100.72.1.1' }], x: [{ family: 'IPv4', address: '100.200.1.1' }] };
  const noBinary = () => ({ status: null, error: new Error('ENOENT') });
  assert.deepEqual(tailnetAddresses(ifaces, { run: noBinary, config: {} }), ['100.101.7.9'], 'no binary: the interface named Tailscale');
  assert.deepEqual(tailnetAddresses({ ...ifaces, utun3: [{ family: 'IPv4', address: '100.88.0.2' }] }, { run: () => ({ status: 0, stdout: '100.88.0.2\n' }), config: {} }), ['100.88.0.2'], 'the binary names the address');
  assert.deepEqual(tailnetAddresses(ifaces, { run: () => ({ status: 0, stdout: '100.99.9.9\n' }), config: {} }), [], 'an address of the binary that no interface holds is not bound');
  assert.deepEqual(tailnetAddresses(ifaces, { run: noBinary, config: { design: { hosts: ['100.72.1.1', '10.0.0.9'] } } }), ['100.72.1.1'], 'design.hosts names them, on this computer only');
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

test('the canvas gets the repos of the list and the address for a phone', () => {
  const top = mkdtempSync(join(tmpdir(), 'design-server-facts-'));
  try {
    mkdirSync(join(top, 'a', '.ai', 'design'), { recursive: true });
    writeFileSync(join(top, 'a', '.ai', 'design', 'screens.json'), '{}');
    mkdirSync(join(top, 'b'));
    // A repo with no surface is named as such; a repo whose folder is gone is left out.
    assert.deepEqual(repoList([{ name: 'a', root: join(top, 'a') }, { name: 'b', root: join(top, 'b') }, { name: 'gone', root: join(top, 'gone') }]),
      [{ name: 'a', surface: true }, { name: 'b', surface: false }]);
    assert.equal(phoneBase(['http://127.0.0.1:4711/']), null, 'a server on this computer only has no address for a phone');
    assert.equal(phoneBase(['http://127.0.0.1:4711/', 'http://100.101.102.103:4711/']), 'http://100.101.102.103:4711/');
    assert.equal(phoneBase([]), null);
  } finally { rmSync(top, { recursive: true, force: true }); }
});

test('a saved page reaches the state at once, and the same bytes are compressed once', async () => {
  const top = mkdtempSync(join(tmpdir(), 'design-save-'));
  const root = join(top, 'Shop');
  mkdirSync(root);
  execFileSync('git', ['init', '-q', root]);
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  let servers = [];
  try {
    initSurface(root);
    addScreen(root, 'basket', { title: 'Basket', workflow: 'w1' });
    addScreen(root, 'pay', { title: 'Pay', workflow: 'w1' });
    const live = await listenDesignServer({ port: 0, hosts: ['127.0.0.1'] });
    servers = live.servers;
    const state = async (headers = {}) => { const r = await raw(live.port, '/r/shop/state.json', { headers }); return { ...r, json: r.status === 200 ? JSON.parse(r.text) : null }; };
    const first = await state();
    assert.deepEqual(first.json.screens.map((s) => [s.key, s.framed, s.links]), [['basket', undefined, []], ['pay', undefined, []]]);
    assert.equal((await state({ 'if-none-match': first.headers.etag })).status, 304, 'nothing changed');

    // Each save of a page is in the next state: the build reads the saved page again and keeps the others.
    const page = screenFile(root, 'pay');
    const template = readFileSync(page, 'utf8');
    for (const [text, framed, links] of [
      [template.replace('</main>', '<a href="basket.html">back</a></main>'), undefined, ['basket']],
      [template.replace('</body>', '<script>document.title = "x"</script></body>'), true, []],
      [template, undefined, []],
    ]) {
      writeFileSync(page, text);
      const next = await state({ 'if-none-match': first.headers.etag });
      assert.equal(next.status, 200);
      const pay = next.json.screens.find((s) => s.key === 'pay');
      assert.deepEqual([pay.framed, pay.links], [framed, links]);
      assert.equal('framed' in next.json.screens.find((s) => s.key === 'basket'), false);
    }
    // A sheet is compressed once for its bytes, and other bytes get their own form.
    const sheet = join(root, '.ai', 'design', 'components.css');
    const css = (n) => `/* ${n} */\n${'.button { color: var(--text); }\n'.repeat(200)}`;
    const get = async () => { const r = await rawBytes(live.port, '/r/shop/s/components.css', { 'accept-encoding': 'gzip' }); return { encoding: r.headers['content-encoding'], text: gunzipSync(r.body).toString('utf8') }; };
    writeFileSync(sheet, css(1));
    assert.deepEqual(await get(), { encoding: 'gzip', text: css(1) });
    const kept = gzipKeptNow().count;
    assert.deepEqual(await get(), { encoding: 'gzip', text: css(1) });
    assert.equal(gzipKeptNow().count, kept, 'the same bytes: no new form');
    // The same size and the same time, other bytes: the answer is the new text.
    const at = statSync(sheet).mtime;
    writeFileSync(sheet, css(2));
    utimesSync(sheet, at, at);
    assert.deepEqual(await get(), { encoding: 'gzip', text: css(2) });
    assert.equal(gzipKeptNow().count, kept + 1);
    assert.ok(gzipKeptNow().bytes <= gzipKeptNow().limit);
  } finally {
    for (const s of servers) s.close();
    if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
    rmSync(top, { recursive: true, force: true });
  }
});

test('the kept compressed forms stay under the limit, and the oldest go first', () => {
  const body = (n) => Buffer.from(`${n}:${'x'.repeat(4000)}`);
  const a = gzipOf(body('a'));
  assert.deepEqual(gunzipSync(a), body('a'));
  assert.equal(gzipOf(body('a')), a, 'the same bytes give the kept form');
  assert.notEqual(gzipOf(body('b')), a);
  const { limit } = gzipKeptNow();
  // Bodies that do not compress fill the store past its limit.
  const chunk = Math.ceil(limit / 6);
  for (let i = 0; i < 8; i += 1) gzipOf(randomBytes(chunk));
  const now = gzipKeptNow();
  assert.ok(now.bytes <= limit, 'the kept bytes stay under the limit');
  assert.ok(now.count <= 6);
  assert.notEqual(gzipOf(body('a')), a, 'the oldest form went, and the body is compressed again');
  assert.deepEqual(gunzipSync(gzipOf(body('a'))), body('a'));
});

test('a new file is read again while a write can keep its size and time', () => {
  const dir = mkdtempSync(join(tmpdir(), 'design-marks-'));
  try {
    const file = join(dir, 'a.css');
    const when = new Date(Math.floor(Date.now() / 1000) * 1000);
    const write = (text) => { writeFileSync(file, text); utimesSync(file, when, when); };
    write('a{color:red}');
    const stat = () => { const st = statSync(file); return new Map([[file, `${st.size}\t${st.mtimeMs}`]]); };
    const t = when.getTime();
    assert.deepEqual(sameStatChanges(stat(), t + 100), [], 'the first read keeps a mark');
    assert.deepEqual(sameStatChanges(stat(), t + 200), [], 'the same text');
    write('a{color:tan}');
    assert.deepEqual(sameStatChanges(stat(), t + 300), [file], 'another text under the same size and time');
    // The file is old now: one last read, then the size and the time are enough.
    write('a{color:blu}');
    assert.deepEqual(sameStatChanges(stat(), t + 5000), [file]);
    write('a{color:sky}');
    assert.deepEqual(sameStatChanges(stat(), t + 9000), [], 'an old file is not read again');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
