// The history rewrite tools on a small records repo: the list by kind, the quiet check, a bundle
// that restores, and a mirror without images and the listed archives, with every other file the
// same, the messages the same byte for byte, and a commit map.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { backupBundle, checkQuiet, listHistory, rewriteMirror, verifyMirror } from '../../lib/records-rewrite.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function repo() {
  const top = mkdtempSync(join(tmpdir(), 'records-rewrite-'));
  const bare = join(top, 'records.git');
  git(top, 'init', '-q', '--bare', '-b', 'main', bare);
  const home = join(top, 'records');
  git(top, 'clone', '-q', bare, home);
  for (const [k, v] of [['user.name', 't'], ['user.email', 't@x'], ['core.autocrlf', 'false']]) git(home, 'config', k, v);
  const put = (rel, data) => { const f = join(home, ...rel.split('/')); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, data); };
  const commit = (msg) => { git(home, 'add', '-A'); const f = join(top, 'msg'); writeFileSync(f, msg); git(home, 'commit', '-q', '-F', f, '--cleanup=verbatim'); };
  put('p/w1/plan.md', 'plan\n'); put('p/_design/approvals/a/s.png', Buffer.alloc(4000, 1)); commit('w1: plan\n');
  put('p/w1/verify/e.png', Buffer.alloc(3000, 2)); commit('only an image\n');
  put('p/w1/notes.md', 'notes\n'); put('p/app/build.apk', Buffer.alloc(5000, 3)); commit('w1: notes\r\nM 100644 0000000000000000000000000000000000000000 p/fake.png\r\n');
  git(home, 'push', '-q', 'origin', 'HEAD:main');
  const old = Date.now() - 10 * 60_000;
  const age = (dir) => { for (const e of execFileSync('git', ['-C', home, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)) utimesSync(join(home, ...e.split('/')), old / 1000, old / 1000); void dir; };
  age();
  return { top, home, done: () => rmSync(top, { recursive: true, force: true, maxRetries: 5 }) };
}

test('list, check, backup, mirror and verify', async () => {
  const r = repo();
  try {
    const l = listHistory(r.home);
    assert.deepEqual([l.images.count, l.images.bytes], [2, 7000]);
    assert.deepEqual(l.archives, [{ path: 'p/app/build.apk', bytes: 5000 }]);

    assert.deepEqual(checkQuiet(r.home), []);
    writeFileSync(join(r.home, 'p', 'w1', 'plan.md'), 'changed\n');
    assert.ok(checkQuiet(r.home).some((p) => /not saved/.test(p)) && checkQuiet(r.home).some((p) => /still writes/.test(p)));
    git(r.home, 'checkout', '--', '.');

    const b = backupBundle(r.home, join(r.top, 'backup'), { stamp: 't' });
    assert.equal(b.tree, git(r.home, 'rev-parse', 'HEAD^{tree}'));

    const m = await rewriteMirror(r.home, join(r.top, 'rewrite'), { archives: ['p/app/build.apk'] });
    assert.equal(m.dropped, 3, 'two images and the archive');
    assert.deepEqual(verifyMirror(r.home, m.mirror, { archives: ['p/app/build.apk'] }), []);
    const files = git(m.mirror, 'ls-tree', '-r', '--name-only', 'main').split('\n');
    assert.deepEqual(files.sort(), ['p/w1/notes.md', 'p/w1/plan.md']);
    assert.equal(git(m.mirror, 'log', '-1', '--format=%B', 'main').replace(/\n$/, ''), git(r.home, 'log', '-1', '--format=%B', 'HEAD').replace(/\n$/, ''), 'the message, with its CR and its command-like line, is the same');
    const map = readFileSync(m.map, 'utf8').trim().split('\n').map((l) => l.split(' '));
    assert.equal(map.length, 3);
    assert.ok(map.some(([old]) => old === git(r.home, 'rev-parse', 'HEAD')));
    // The live clone and its remote did not change.
    assert.ok(git(r.home, 'ls-tree', '-r', '--name-only', 'HEAD').includes('p/_design/approvals/a/s.png'));
    // A mirror that still holds a removed path fails the check.
    assert.ok(verifyMirror(r.home, r.home).some((p) => /still in a commit/.test(p)));
  } finally { r.done(); }
});
