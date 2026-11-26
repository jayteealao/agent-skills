// A new computer and a cloud session join the records: the clone settings, the name of a cloud
// session, the sparse checkout and a sync that leaves the paths outside it alone; the map from a
// product remote to its project; and the names that two systems would read as one file.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { joinRecords, nameProblems, normalizeRemote, projectsForRemote, sparsePaths } from '../../lib/records-join.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('the remote of a product repo, in one form', () => {
  for (const u of ['git@github.com:Owner/App.git', 'https://github.com/Owner/App', 'https://user@GitHub.com/Owner/App.git/', 'ssh://git@github.com:22/Owner/App.git']) {
    assert.equal(normalizeRemote(u), 'github.com/Owner/App', u);
  }
  assert.equal(normalizeRemote(''), null);
});

test('names that two systems would read as one file are kept out', () => {
  const nfd = 'p/w1/cafe\u0301.md';
  const p = nameProblems(['p/w1/Notes.md', 'p/w1/notes.md', nfd, 'p/w1/plan.md']);
  assert.match(p.get('p/w1/notes.md'), /only in case/);
  assert.match(p.get(nfd), /NFC/);
  assert.equal(p.has('p/w1/plan.md'), false);
  assert.equal(p.has('p/w1/Notes.md'), false, 'the first name stays');
});

function world() {
  const top = mkdtempSync(join(tmpdir(), 'records-join-'));
  const bare = join(top, 'records.git');
  git(top, 'init', '-q', '--bare', '-b', 'main', bare);
  const seed = join(top, 'seed');
  git(top, 'clone', '-q', bare, seed);
  for (const [k, v] of [['user.name', 't'], ['user.email', 't@x']]) git(seed, 'config', k, v);
  const put = (rel, s) => { const f = join(seed, ...rel.split('/')); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, s); };
  put('.machines/dragon.json', JSON.stringify({ machine: 'dragon', projects: { app: { root: 'C:/dev/App', remote: 'github.com/Owner/App' }, web: { root: 'C:/dev/Web', remote: 'github.com/Owner/Web' } } }));
  put('app/w1/plan.md', 'plan\n');
  put('web/w2/plan.md', 'other\n');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-q', '-m', 'seed');
  git(seed, 'push', '-q', 'origin', 'HEAD:main');
  return { top, bare, done: () => rmSync(top, { recursive: true, force: true, maxRetries: 5 }) };
}

test('a computer joins: the clone settings, its name, and the map finds the project', () => {
  const w = world();
  try {
    const sdlc = join(w.top, 'sdlc');
    mkdirSync(sdlc);
    writeFileSync(join(sdlc, 'config.json'), JSON.stringify({ records: { machine: 'laptop' } }));
    const r = joinRecords(w.bare, { home: join(sdlc, 'records'), sdlc });
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.machine, 'laptop');
    assert.equal(git(r.home, 'config', 'core.autocrlf'), 'false');
    assert.equal(git(r.home, 'config', 'core.longpaths'), 'true');
    assert.deepEqual(projectsForRemote(r.home, 'github.com/Owner/App'), ['app']);
    assert.deepEqual(projectsForRemote(r.home, 'github.com/Owner/None'), []);
    assert.equal(joinRecords(w.bare, { home: r.home, sdlc }).ok, false, 'a second join is refused');
  } finally { w.done(); }
});

test('a cloud session joins with one project: blobless, sparse, and a name of its own', () => {
  const w = world();
  try {
    const sdlc = join(w.top, 'cloud');
    mkdirSync(sdlc);
    // A file URL, so the clone goes through the transport that honours the blob filter.
    const url = `file:///${w.bare.replace(/\\/g, '/').replace(/^\/+/, '')}`;
    const r = joinRecords(url, { home: join(sdlc, 'records'), sdlc, cloud: true, project: 'app' });
    assert.equal(r.ok, true, r.reason);
    assert.match(r.machine, /^cloud-[0-9a-f]{6}$/);
    assert.equal(JSON.parse(readFileSync(join(sdlc, 'config.json'), 'utf8')).records.machine, r.machine);
    assert.ok(existsSync(join(r.home, 'app', 'w1', 'plan.md')));
    assert.equal(existsSync(join(r.home, 'web')), false, 'another project is not checked out');
    assert.deepEqual(sparsePaths(r.home).sort(), ['.machines', 'app']);
  } finally { w.done(); }
});

test('a sync from a sparse clone sends its project and deletes nothing outside it', async () => {
  const w = world();
  const saved = { ...process.env };
  try {
    const sdlc = join(w.top, 'cloud');
    mkdirSync(sdlc);
    Object.assign(process.env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' });
    const url = `file:///${w.bare.replace(/\\/g, '/').replace(/^\/+/, '')}`;
    const r = joinRecords(url, { home: join(sdlc, 'records'), sdlc, cloud: true, project: 'app' });
    assert.equal(r.ok, true, r.reason);
    writeFileSync(join(r.home, 'app', 'w1', 'notes.md'), 'from the cloud\n');
    const { composeSync } = await import('../../lib/records-compose.mjs');
    const s = composeSync(r.home, { me: r.machine, held: () => null, kill: null });
    assert.equal(s.pushed, true, JSON.stringify(s));
    const files = git(w.top, '--git-dir', w.bare, 'ls-tree', '-r', '--name-only', 'main').split('\n');
    assert.ok(files.includes('app/w1/notes.md'));
    assert.ok(files.includes('web/w2/plan.md'), 'the project outside the sparse checkout is still on the remote');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    w.done();
  }
});

test('a fresh checkout of a product links itself through the map', async () => {
  const w = world();
  const saved = { ...process.env };
  try {
    const sdlc = join(w.top, 'sdlc');
    mkdirSync(sdlc);
    Object.assign(process.env, { SDLC_HOME: sdlc, SDLC_RECORDS_PUSH: 'off', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@x' });
    delete process.env.WF_ACTOR;
    writeFileSync(join(sdlc, 'config.json'), JSON.stringify({ records: { machine: 'dragon' } }));
    git(w.top, 'clone', '-q', w.bare, join(sdlc, 'records'));
    const product = (name) => {
      const root = join(w.top, name);
      mkdirSync(join(root, '.ai', 'workflows'), { recursive: true });
      git(w.top, 'init', '-q', root);
      git(root, 'remote', 'add', 'origin', 'git@github.com:Owner/Shop.git');
      return root;
    };
    const { linkProject } = await import('../../lib/records-sync.mjs');
    assert.equal(linkProject(product('shop-a'), 'shop').ok, true);
    const facts = JSON.parse(readFileSync(join(sdlc, 'records', '.machines', 'dragon.json'), 'utf8'));
    assert.equal(facts.projects.shop.remote, 'github.com/Owner/Shop');
    const WF = join(import.meta.dirname, '..', '..', 'scripts', 'wf.mjs');
    const r = execFileSync(process.execPath, [WF, 'records', 'link', product('shop-b')], { encoding: 'utf8', env: process.env });
    assert.match(r, /linked as shop/);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    w.done();
  }
});
