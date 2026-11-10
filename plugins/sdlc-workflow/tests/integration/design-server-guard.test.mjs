// The guards of the design server: the Host of every request, the writes that come from a design
// page, the references outside the repo, the event stream after a failed state build and after a
// reconnect, the start and the stop of the background server, and the tailnet listeners that
// come and go. The server listens on 127.0.0.1 with a free port.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addScreen, initSurface, writeManifest, readManifest } from '../../lib/design-surface.mjs';
import { addReference, checkReferences } from '../../lib/design-references.mjs';
import { approvalPicture } from '../../lib/design-records.mjs';
import { canvasState } from '../../lib/design-state.mjs';
import { WRITE_HEADER, listenDesignServer, rebindTailnet, serverInfoPath, serverStatus, startServer, stopServer, writeToken } from '../../lib/design-server.mjs';

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
// A write as the canvas sends it: from a page of this server, with the write token of this run.
const post = (port, path, value, headers = {}) => raw(port, path, { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://127.0.0.1:${port}`, [WRITE_HEADER]: writeToken(), ...headers }, body: JSON.stringify(value) });

async function shop(label) {
  const top = mkdtempSync(join(tmpdir(), label));
  const root = join(top, 'Shop');
  mkdirSync(root);
  execFileSync('git', ['init', '-q', root]);
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  initSurface(root);
  addScreen(root, 'basket', { title: 'Basket', workflow: 'w1' });
  const live = await listenDesignServer({ port: 0, hosts: ['127.0.0.1'], log: () => {} });
  return {
    top, root, live, port: live.port,
    done: () => {
      for (const s of live.servers) s.close();
      if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
      rmSync(top, { recursive: true, force: true });
    },
  };
}

test('a request whose Host names another site is refused before any route, reads included', async () => {
  const s = await shop('design-host-');
  try {
    const evil = { host: `evil.test:${s.port}` };
    assert.equal((await raw(s.port, '/r/shop/state.json', { headers: evil })).status, 403, 'a read of a rebound name');
    assert.equal((await raw(s.port, '/r/shop/s/screens/basket.html', { headers: evil })).status, 403);
    const write = await post(s.port, '/r/shop/comments/basket', { text: 'x' }, { ...evil, origin: `http://evil.test:${s.port}` });
    assert.equal(write.status, 403, 'a write with a matching Origin');
    assert.equal(JSON.parse(write.text).reason, 'the Host of the request is not this server');
    assert.equal((await raw(s.port, '/r/shop/state.json', { headers: { host: '127.0.0.1:1' } })).status, 403, 'another port');
    for (const host of [`127.0.0.1:${s.port}`, `localhost:${s.port}`]) {
      assert.equal((await raw(s.port, '/r/shop/state.json', { headers: { host } })).status, 200, host);
    }
    assert.equal((await post(s.port, '/r/shop/comments/basket', { text: 'fine' }, { host: `localhost:${s.port}`, origin: `http://localhost:${s.port}` })).status, 200);
  } finally { s.done(); }
});

test('a write that a design page sends is refused; the canvas writes', async () => {
  const s = await shop('design-referer-');
  try {
    const base = `http://127.0.0.1:${s.port}`;
    for (const page of ['/r/shop/s/screens/basket.html', `/r/shop/at/abcdef1/screens/basket.html`, '/r/shop/versions/w1/v1/screens/basket.html', '/r/shop/ref/logo', '/b/shop/idea/']) {
      const r = await post(s.port, '/r/shop/layout', { positions: { basket: { x: 1, y: 2 } } }, { origin: base, referer: `${base}${page}` });
      assert.equal(r.status, 403, page);
    }
    assert.equal((await post(s.port, '/r/shop/layout', { positions: { basket: { x: 1, y: 2 } } }, { origin: base, referer: `${base}/r/shop/?workflow=w1` })).status, 200);
    // A design page that hides its Referer still has no write token: the address alone writes nothing.
    for (const path of ['/r/shop/layout', '/r/shop/comments/basket', '/r/shop/versions/w1/restore', '/r/shop/audit']) {
      const r = await raw(s.port, path, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: '{}' });
      assert.equal(r.status, 403, path);
      assert.match(JSON.parse(r.text).reason, /write token/);
    }
    assert.equal((await post(s.port, '/r/shop/layout', { positions: {} }, { origin: base, referer: 'http://evil.test/r/shop/' })).status, 403, 'a Referer of another site');
  } finally { s.done(); }
});

test('a reference outside the repo is refused, by a relative or an absolute path', async () => {
  const s = await shop('design-ref-');
  try {
    writeFileSync(join(s.top, 'secret.txt'), 'secret');
    writeFileSync(join(s.root, 'logo.svg'), '<svg/>');
    assert.throws(() => addReference(s.root, { key: 'secret', file: join(s.top, 'secret.txt') }), /outside the repo/);
    assert.doesNotThrow(() => addReference(s.root, { key: 'logo', file: join(s.root, 'logo.svg'), kind: 'image' }), 'an absolute path inside the repo');
    assert.throws(() => addReference(s.root, { key: 'site', file: 'logo.svg', link: 'javascript:alert(1)' }), /not an http or https address/);
    // A hand-written entry with an absolute path outside the repo.
    writeFileSync(join(s.root, '.ai', 'design', 'references.json'), JSON.stringify({ references: [{ key: 'secret', kind: 'page', file: join(s.top, 'secret.txt') }] }));
    assert.equal(checkReferences(s.root).ok, false);
    const r = await raw(s.port, '/r/shop/ref/secret');
    assert.equal(r.status, 404);
    assert.doesNotMatch(r.text, /^secret$/);
  } finally { s.done(); }
});

test('an event stream starts with the boot of the server', async () => {
  const s = await shop('design-hello-');
  let stream = null;
  try {
    const first = await new Promise((ok, no) => {
      stream = request({ host: '127.0.0.1', port: s.port, path: '/r/shop/events' }, (res) => {
        res.setEncoding('utf8');
        res.once('data', ok);
      });
      stream.on('error', no);
      stream.end();
    });
    assert.match(first, /retry: 3000\n\nevent: hello\ndata: \{"boot":"[0-9a-z]+","writeToken":"[\w-]+"\}\n\n/);
    assert.ok(first.includes(`"writeToken":"${writeToken()}"`), 'the hello names the write token of this run');
  } finally { stream?.destroy(); s.done(); }
});

test('a change whose state build failed is sent with the next change', async () => {
  const s = await shop('design-retry-');
  let stream = null;
  try {
    const events = [];
    await new Promise((ok, no) => {
      stream = request({ host: '127.0.0.1', port: s.port, path: '/r/shop/events' }, (res) => {
        res.setEncoding('utf8');
        res.on('data', (t) => { for (const m of t.matchAll(/event: change\ndata: (.+)\n/g)) events.push(JSON.parse(m[1])); });
        ok();
      });
      stream.on('error', no);
      stream.end();
    });
    // A token sheet that the state build cannot read (a folder in its place), with a page change at the same time.
    const sheet = join(s.root, '.ai', 'design', 'tokens.css');
    rmSync(sheet);
    mkdirSync(sheet);
    writeFileSync(join(s.root, '.ai', 'design', 'screens', 'basket.html'), '<html><body><section data-state="default">new</section></body></html>');
    await new Promise((ok) => setTimeout(ok, 1500));
    assert.equal(events.length, 0, 'no event while the state does not build');
    rmSync(sheet, { recursive: true });
    writeFileSync(sheet, ':root {\n}\n');
    for (let i = 0; i < 100 && !events.length; i += 1) await new Promise((ok) => setTimeout(ok, 100));
    assert.ok(events.length, 'a change came');
    assert.deepEqual(events.at(-1).pages, ['basket'], 'the page change is not lost');
  } finally { stream?.destroy(); s.done(); }
});

test('start does not start a second server beside a pid that does not answer; stop kills only a server that answered', async () => {
  const top = mkdtempSync(join(tmpdir(), 'design-control-'));
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  try {
    mkdirSync(join(top, 'home'), { recursive: true });
    writeFileSync(serverInfoPath(), JSON.stringify({ pid: process.pid, port: 1 }));
    const silent = async () => ({ running: false, pid: process.pid, port: 1, addresses: [] });
    const r = await startServer({ status: silent, tries: 1 });
    assert.equal(r.started, false);
    assert.match(r.reason, /holds the server pid but does not answer/);
    const killed = [];
    const stop = await stopServer({ status: silent, kill: (pid) => killed.push(pid) });
    assert.deepEqual([stop.stopped, killed], [false, []]);
    assert.match(stop.reason, /left running/);
    const up = await stopServer({ status: async () => ({ running: true, pid: 4242 }), kill: (pid) => killed.push(pid) });
    assert.deepEqual([up.stopped, killed], [true, [4242]]);
  } finally {
    if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
    rmSync(top, { recursive: true, force: true });
  }
});

test('the server listens on a tailnet address that comes up later, and closes one that went away', async () => {
  const s = await shop('design-rebind-');
  try {
    const logs = [];
    // 127.0.0.2 stands in for a tailnet address: a loopback address that this machine can bind.
    const up = await rebindTailnet(s.live, { hosts: ['127.0.0.2'], log: (t) => logs.push(t) });
    if (!up) { assert.match(logs.join(''), /not listening on 127\.0\.0\.2/, 'a bind that fails is named'); return; }
    assert.ok(s.live.addresses.includes(`http://127.0.0.2:${s.port}/`));
    assert.equal(await rebindTailnet(s.live, { hosts: ['127.0.0.2'] }), false, 'nothing new');
    assert.equal(await rebindTailnet(s.live, { hosts: [] }), true);
    assert.deepEqual(s.live.addresses, [`http://127.0.0.1:${s.port}/`], 'loopback stays');
  } finally { s.done(); }
});

test('a product root in a folder of its git repo keeps its history, its approval picture and its pages at a commit', async () => {
  const top = mkdtempSync(join(tmpdir(), 'design-subdir-'));
  const root = join(top, 'pkg');
  mkdirSync(root);
  execFileSync('git', ['init', '-q', top]);
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  let servers = [];
  try {
    initSurface(root);
    addScreen(root, 'basket', { title: 'Basket', workflow: 'w1' });
    execFileSync('git', ['-C', top, 'add', 'pkg/.ai/design']);
    execFileSync('git', ['-C', top, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'screens']);
    const sha = execFileSync('git', ['-C', top, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const m = readManifest(root);
    m.screens.basket.approvals = [{ commit: sha, at: '2026-10-25T10:00:00Z', workflow: 'w1' }];
    writeManifest(root, m);
    const png = approvalPicture(root, sha, 'basket');
    mkdirSync(dirname(png), { recursive: true });
    writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    let screen = canvasState(root, { repo: 'pkg' }).screens[0];
    assert.equal(screen.history.length, 1, 'the commit of the page');
    assert.ok(screen.picture, 'the approval picture of a clean page');
    writeFileSync(join(root, '.ai', 'design', 'screens', 'basket.html'), '<html><body>changed</body></html>');
    screen = canvasState(root, { repo: 'pkg' }).screens[0];
    assert.equal(screen.picture, null, 'a changed page shows no approval picture');
    const live = await listenDesignServer({ port: 0, hosts: ['127.0.0.1'], log: () => {} });
    servers = live.servers;
    const at = await raw(live.port, `/r/pkg/at/${sha}/screens/basket.html`);
    assert.equal(at.status, 200);
    assert.match(at.text, /wf:screen/);
  } finally {
    for (const s of servers) s.close();
    if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
    rmSync(top, { recursive: true, force: true });
  }
});
