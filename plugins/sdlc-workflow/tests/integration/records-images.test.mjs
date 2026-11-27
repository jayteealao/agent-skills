// Images outside git: the signature of a store request, the upload of design images and the
// local reference of evidence, the fetch on another computer with the hash checked, a store that
// cannot be reached, and a sync that commits the references and no image. The store is a fake
// storage server in a child process (a synchronous upload blocks this process, so the server cannot
// run in it).
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IMAGE_GLOBS, fetchImages, foldFetch, isDesignImage, isImage, readRef, refPathOf, signRequest, uploadImages } from '../../lib/records-images.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sha = (b) => createHash('sha256').update(b).digest('hex');

/** A fake store: PUT with If-None-Match, GET; every request must carry a signature. */
const SERVER = `
const http = require('node:http');
const objects = new Map();
let puts = 0;
const s = http.createServer((q, r) => {
  const chunks = [];
  q.on('data', (c) => chunks.push(c));
  q.on('end', () => {
    if (!/^AWS4-HMAC-SHA256 Credential=key\\//.test(q.headers.authorization ?? '')) { r.writeHead(403); return r.end(); }
    if (q.url === '/count') { r.end(String(puts)); return; }
    if (q.method === 'PUT') {
      if (objects.has(q.url) && q.headers['if-none-match'] === '*') { r.writeHead(412); return r.end(); }
      objects.set(q.url, Buffer.concat(chunks)); puts += 1; r.writeHead(200); return r.end();
    }
    if (q.method === 'GET' && objects.has(q.url)) { r.writeHead(200); return r.end(objects.get(q.url)); }
    r.writeHead(404); r.end();
  });
});
s.listen(0, '127.0.0.1', () => process.stdout.write(String(s.address().port) + '\\n'));
`;

async function store() {
  const p = spawn(process.execPath, ['-e', SERVER], { stdio: ['ignore', 'pipe', 'inherit'] });
  const port = await new Promise((done) => p.stdout.once('data', (d) => done(Number(String(d).trim()))));
  const cfg = { endpoint: `http://127.0.0.1:${port}`, bucket: 'b', keyId: 'key', secret: 'secret', region: 'auto' };
  return { cfg, stop: () => p.kill() };
}

function world() {
  const top = mkdtempSync(join(tmpdir(), 'records-images-'));
  const put = (dir, rel, data) => { const f = join(dir, ...rel.split('/')); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, data); return f; };
  return { top, put, done: () => rmSync(top, { recursive: true, force: true, maxRetries: 5 }) };
}

test('the signature of a request is the one of the AWS example (GET Object)', () => {
  const h = signRequest({
    method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', headers: { Range: 'bytes=0-9' },
    keyId: 'AKIAIOSFODNN7EXAMPLE', secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', now: new Date('2013-05-24T00:00:00Z'),
  });
  assert.equal(h.authorization, 'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

test('which images go to the store', () => {
  assert.equal(isDesignImage('p/_design/approvals/a/s.png'), true);
  assert.equal(isDesignImage('p/w1/design-round-2/board.png'), true);
  assert.equal(isDesignImage('p/w1/verify/evidence/e.png'), false);
});

test('design images go up once, evidence stays local, and another computer fetches with the hash checked', async () => {
  const w = world();
  const s = await store();
  try {
    const a = join(w.top, 'alpha');
    const design = w.put(a, 'p/_design/approvals/a/s.png', 'png-bytes');
    const evidence = w.put(a, 'p/w1/verify/e.png', 'evidence');
    const home = join(w.top, 'home-alpha');
    mkdirSync(home);
    const u = await uploadImages(a, { home, machine: 'alpha', cfg: s.cfg });
    assert.deepEqual([u.uploaded, u.local, u.failed], [['p/_design/approvals/a/s.png'], ['p/w1/verify/e.png'], []]);
    assert.equal(readRef(design).sha256, sha('png-bytes'));
    assert.equal(readRef(evidence).local, 'alpha');
    const again = await uploadImages(a, { home, machine: 'alpha', cfg: s.cfg });
    assert.deepEqual([again.uploaded, again.local], [[], []], 'an image that did not change is not sent again');

    // beta has the references, and no image.
    const b = join(w.top, 'beta');
    w.put(b, 'p/_design/approvals/a/s.png.img.json', readFileSync(refPathOf(design)));
    w.put(b, 'p/w1/verify/e.png.img.json', readFileSync(refPathOf(evidence)));
    const bhome = join(w.top, 'home-beta');
    mkdirSync(bhome);
    const f = await fetchImages([join(b, 'p')], { home: bhome, machine: 'beta', cfg: s.cfg });
    assert.equal(f.fetched.length, 1);
    assert.equal(readFileSync(join(b, 'p', '_design', 'approvals', 'a', 's.png'), 'utf8'), 'png-bytes');
    assert.deepEqual(f.local.map((l) => l.machine), ['alpha'], 'evidence is on alpha only');
    assert.ok(existsSync(join(bhome, 'cache', 'sha256', sha('png-bytes'))), 'the cache holds it, outside the records');

    // A wrong reference is never written to the folder.
    w.put(b, 'p/_design/approvals/a/t.png.img.json', JSON.stringify({ sha256: sha('other'), bytes: 5, machine: 'alpha' }));
    const bad = await fetchImages([join(b, 'p')], { home: bhome, machine: 'beta', cfg: s.cfg });
    assert.match(bad.failed[0].why, /no such object/);
    assert.equal(existsSync(join(b, 'p', '_design', 'approvals', 'a', 't.png')), false);

    // The gate says "cannot fetch" for it, and nothing for the evidence of alpha.
    const problems = foldFetch(['p/_design/approvals/a/t.png is missing', 'p/w1/verify/e.png is missing', 'p/w1/plan.md is missing'], bad, b);
    assert.deepEqual(problems, ['cannot fetch a/t.png: the store has no such object', 'p/w1/plan.md is missing']);
  } finally { s.stop(); w.done(); }
});

test('a store that cannot be reached: the image waits, and no reference runs ahead of its object', async () => {
  const w = world();
  try {
    const a = join(w.top, 'alpha');
    const design = w.put(a, 'p/_design/approvals/a/s.png', 'png-bytes');
    const home = join(w.top, 'home');
    mkdirSync(home);
    const u = await uploadImages(a, { home, machine: 'alpha', cfg: { endpoint: 'http://127.0.0.1:9', bucket: 'b', keyId: 'key', secret: 's' } });
    assert.equal(u.failed.length, 1);
    assert.equal(existsSync(refPathOf(design)), false);
  } finally { w.done(); }
});

test('with an image store, a sync commits the references and no image', async () => {
  const w = world();
  const s = await store();
  const saved = { ...process.env };
  try {
    const bare = join(w.top, 'records.git');
    git(w.top, 'init', '-q', '--bare', '-b', 'main', bare);
    const home = join(w.top, 'sdlc');
    mkdirSync(home);
    Object.assign(process.env, { SDLC_HOME: home, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x', SDLC_RECORDS_PUSH: 'off' });
    writeFileSync(join(home, 'config.json'), JSON.stringify({ records: { machine: 'alpha', sync: 'compose', images: s.cfg } }));
    const clone = join(home, 'records');
    git(w.top, 'clone', '-q', bare, clone);
    w.put(clone, 'p/_design/approvals/a/s.png', 'png-bytes');
    w.put(clone, 'p/w1/verify/e.png', 'evidence');
    w.put(clone, 'p/w1/notes.md', 'notes\n');
    const { composeNow } = await import('../../lib/records-sync.mjs');
    const r = composeNow(clone, { project: 'p' });
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(r.images, { uploaded: 1, local: 1, failed: 0 });
    const files = git(w.top, '--git-dir', bare, 'ls-tree', '-r', '--name-only', 'main').split('\n');
    assert.ok(files.includes('p/_design/approvals/a/s.png.img.json') && files.includes('p/w1/verify/e.png.img.json') && files.includes('p/w1/notes.md'), files.join(' '));
    assert.equal(files.filter((f) => /\.png$/.test(f)).length, 0, 'no image in the commit');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    s.stop();
    w.done();
  }
});

test('a read fills the cache and nothing else, and the gate counts the cached image as present', async () => {
  const w = world();
  const s = await store();
  try {
    const a = join(w.top, 'alpha');
    const design = w.put(a, 'p/_design/approvals/a/s.png', 'png-bytes');
    const home = join(w.top, 'home');
    mkdirSync(home);
    await uploadImages(a, { home, machine: 'alpha', cfg: s.cfg });
    const b = join(w.top, 'beta');
    w.put(b, 'p/_design/approvals/a/s.png.img.json', readFileSync(refPathOf(design)));
    const bhome = join(w.top, 'home-beta');
    mkdirSync(bhome);
    const f = await fetchImages([join(b, 'p')], { home: bhome, machine: 'beta', cfg: s.cfg, place: false });
    assert.deepEqual([f.fetched.length, f.cached.length], [0, 1]);
    assert.equal(existsSync(join(b, 'p', '_design', 'approvals', 'a', 's.png')), false, 'no file of the records changed');
    assert.ok(existsSync(join(bhome, 'cache', 'sha256', sha('png-bytes'))));
    assert.deepEqual(foldFetch(['p/_design/approvals/a/s.png is missing'], f, b), []);
  } finally { s.stop(); w.done(); }
});

test('the image globs name the same files as the image test', () => {
  for (const e of IMAGE_GLOBS.map((g) => g.slice('**/*.'.length))) assert.equal(isImage(`p/a.${e}`), true, e);
  assert.ok(['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm'].every((e) => IMAGE_GLOBS.includes(`**/*.${e}`)));
});

test('an upload past its time budget waits for the next pass, and the next pass sends it', async () => {
  const w = world();
  const s = await store();
  try {
    const a = join(w.top, 'alpha');
    const one = w.put(a, 'p/_design/approvals/a/one.png', 'one');
    const home = join(w.top, 'home');
    mkdirSync(home);
    const late = await uploadImages(a, { home, machine: 'alpha', cfg: s.cfg, budgetMs: -1 });
    assert.deepEqual([late.uploaded.length, late.deferred], [0, 1]);
    assert.equal(existsSync(refPathOf(one)), false, 'no reference for an image that waits');
    const next = await uploadImages(a, { home, machine: 'alpha', cfg: s.cfg, budgetMs: 60_000 });
    assert.deepEqual([next.uploaded.length, next.deferred], [1, 0]);
    assert.equal(readRef(one).sha256, sha(Buffer.from('one')));
  } finally { s.stop(); w.done(); }
});
