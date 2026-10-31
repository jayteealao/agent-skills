// The captures of a slice reach the records: after the screenshots, `wf.mjs design captures`
// commits them on the main branch of the records clone of a linked project. An unlinked project
// keeps them in its own folder, with no commit. The clone is a temp folder; the push is off.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runDesign } from '../../lib/design-cli.mjs';
import { capturePicture } from '../../lib/design-records.mjs';
import { INDEX_NAME } from '../../lib/records.mjs';
import { linkProject } from '../../lib/records-sync.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

function world() {
  const top = mkdtempSync(join(tmpdir(), 'design-captures-'));
  const bare = join(top, 'records.git');
  git(top, 'init', '-q', '--bare', '-b', 'main', bare);
  const home = join(top, 'home');
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'config.json'), JSON.stringify({ records: { machine: 'alpha' } }));
  const clone = join(home, 'records');
  git(top, 'clone', '-q', bare, clone);
  const root = join(top, 'project');
  const dir = join(root, '.ai', 'workflows', 'w1');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, INDEX_NAME), '---\nschema: sdlc/v1\ntype: index\nslug: w1\ntitle: W1\nstatus: active\ncurrent-stage: verify\n---\n');
  const saved = { ...process.env };
  Object.assign(process.env, { SDLC_HOME: home, SDLC_RECORDS_PUSH: 'off', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' });
  const done = () => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    rmSync(top, { recursive: true, force: true });
  };
  return { clone, root, done };
}

async function design(...pos) {
  const lines = [];
  const code = await runDesign(pos, { json: true }, (v) => lines.push(v));
  return { code, out: lines.at(-1) };
}

test('the captures of a slice are committed to the records of a linked project', async () => {
  const w = world();
  try {
    assert.equal(linkProject(w.root, 'notes').ok, true);
    const before = git(w.clone, 'rev-parse', 'HEAD');
    for (const key of ['basket', 'basket--worst']) {
      const { out } = await design('capture-path', w.root, 'w1', 's1', key);
      writeFileSync(out.file, PNG);
    }
    const r = await design('captures', w.root, 'w1', 's1');
    assert.equal(r.code, 0);
    assert.deepEqual(r.out.files, ['basket--worst.png', 'basket.png']);
    assert.match(r.out.commit, /^[0-9a-f]{40}$/);
    assert.notEqual(r.out.commit, before);
    assert.equal(git(w.clone, 'rev-parse', 'HEAD'), r.out.commit, 'the commit is on the main branch of the clone');
    assert.deepEqual(git(w.clone, 'ls-files', 'notes/_design/captures/w1/s1').split('\n'), ['notes/_design/captures/w1/s1/basket--worst.png', 'notes/_design/captures/w1/s1/basket.png']);
    assert.equal(git(w.clone, 'status', '--porcelain', '--', 'notes/_design'), '', 'nothing of the design records is left out');
  } finally { w.done(); }
});

test('an unlinked project keeps its captures with no commit; a slice with no capture commits nothing', async () => {
  const w = world();
  try {
    const before = git(w.clone, 'log', '--oneline', '--all');
    const file = capturePicture(w.root, 'w1', 's1', 'basket');
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, PNG);
    const r = await design('captures', w.root, 'w1', 's1');
    assert.deepEqual([r.code, r.out.files, r.out.commit], [0, ['basket.png'], null]);
    assert.ok(file.startsWith(join(w.root, '.ai', 'workflows', '_design')));
    assert.deepEqual((await design('captures', w.root, 'w1', 's2')).out.files, []);
    assert.equal(git(w.clone, 'log', '--oneline', '--all'), before);
    await assert.rejects(design('captures', w.root, '..', 's1'), /design captures <root> <slug> <slice> is required/);
  } finally { w.done(); }
});
