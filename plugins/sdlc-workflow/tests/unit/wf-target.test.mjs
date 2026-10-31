// lib/wf-target.mjs and `wf.mjs target`: the first argument of handoff, ship, retro, recap and
// status, as {scope, slugs, branch}, for each form of the argument.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { resolveTarget, targetText } from '../../lib/wf-target.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function project() {
  const root = mkdtempSync(path.join(tmpdir(), 'wf-target-'));
  const wf = (slug, { status = 'active', branch = '', at = '2026-10-20T00:00:00Z' } = {}) => {
    mkdirSync(path.join(root, '.ai', 'workflows', slug), { recursive: true });
    writeFileSync(path.join(root, '.ai', 'workflows', slug, '00-index.md'), `---\nslug: ${slug}\nstatus: ${status}\nbranch: "${branch}"\nupdated-at: "${at}"\n---\n`);
  };
  return { root, wf, done: () => rmSync(root, { recursive: true, force: true }) };
}

// A fake of git and gh: PR 12 has the head branch feat/tags; git knows the branch empty-branch.
const fake = (cmd, args) => {
  if (cmd === 'gh') return args[2] === '12' ? { status: 0, stdout: 'feat/tags\n', stderr: '' } : { status: 1, stdout: '', stderr: 'no pull requests found' };
  if (cmd === 'git') return { status: args.at(-1) === 'refs/heads/empty-branch' ? 0 : 1, stdout: '', stderr: '' };
  return { status: 127, stdout: '', stderr: '' };
};

test('target: a slug, with the other workflows on its branch', async () => {
  const p = project();
  try {
    p.wf('tags-api', { branch: 'feat/tags' });
    p.wf('tags-ui', { branch: 'feat/tags' });
    p.wf('solo', { branch: 'feat/solo' });
    const t = await resolveTarget(p.root, 'tags-api', { run: fake });
    assert.deepEqual([t.scope, t.slugs, t.branch, t.siblings], ['slug', ['tags-api'], 'feat/tags', ['tags-ui']]);
    assert.deepEqual((await resolveTarget(p.root, 'solo', { run: fake })).siblings, []);
    assert.match(targetText(t), /shared branch: tags-ui/);
  } finally { p.done(); }
});

test('target: a slug wins over a branch of the same name', async () => {
  const p = project();
  try {
    p.wf('main-work', { branch: 'x' });
    p.wf('other', { branch: 'main-work' });
    assert.equal((await resolveTarget(p.root, 'main-work', { run: fake })).scope, 'slug');
  } finally { p.done(); }
});

test('target: pr#N, #N and a bare number resolve to the head branch and its roster', async () => {
  const p = project();
  try {
    p.wf('tags-api', { branch: 'feat/tags' });
    p.wf('tags-ui', { branch: 'feat/tags', status: 'shipped' });
    for (const arg of ['pr#12', 'PR#12', '#12', '12']) {
      const t = await resolveTarget(p.root, arg, { run: fake });
      assert.deepEqual([t.scope, t.slugs, t.branch, t.pr, t.closed], ['branch', ['tags-api', 'tags-ui'], 'feat/tags', 12, ['tags-ui']], arg);
    }
    const none = await resolveTarget(p.root, 'pr#99', { run: fake });
    assert.deepEqual([none.scope, none.pr], [null, 99]);
    assert.match(none.error, /no head branch: no pull requests found/);
  } finally { p.done(); }
});

test('target: a branch name gives every workflow whose index names it', async () => {
  const p = project();
  try {
    p.wf('a', { branch: 'feat/x' });
    p.wf('b', { branch: 'feat/x', status: 'closed' });
    p.wf('c', { branch: 'feat/y' });
    const t = await resolveTarget(p.root, 'feat/x', { run: fake });
    assert.deepEqual([t.scope, t.slugs, t.branch, t.closed], ['branch', ['a', 'b'], 'feat/x', ['b']]);
    assert.equal(targetText(t), 'branch feat/x: a, b; closed: b');
    // A git branch with no workflow on it, and a word that is none of the forms.
    const empty = await resolveTarget(p.root, 'empty-branch', { run: fake });
    assert.deepEqual([empty.scope, empty.slugs], ['branch', []]);
    assert.match(empty.error, /No workflows are on branch empty-branch/);
    const nothing = await resolveTarget(p.root, 'nope', { run: fake });
    assert.equal(nothing.scope, null);
    assert.match(nothing.error, /not a workflow slug, a PR \(pr#N\) or a branch/);
  } finally { p.done(); }
});

test('target: a prototype row of INDEX.md counts as a workflow on its branch', async () => {
  const p = project();
  try {
    p.wf('a', { branch: 'feat/x' });
    writeFileSync(path.join(p.root, '.ai', 'workflows', 'INDEX.md'), '# header\nproto\tactive\tprototype\tfeat/x\t2026-10-20T00:00:00Z\n');
    assert.deepEqual((await resolveTarget(p.root, 'feat/x', { run: fake })).slugs, ['a', 'proto']);
    assert.equal((await resolveTarget(p.root, 'proto', { run: fake })).scope, 'slug');
  } finally { p.done(); }
});

test('target: no argument takes the one open workflow, or lists several, newest first', async () => {
  const p = project();
  try {
    assert.match((await resolveTarget(p.root, null, { run: fake })).error, /No workflows found/);
    p.wf('old', { status: 'closed', branch: 'b0' });
    p.wf('one', { branch: 'b1', at: '2026-10-01T00:00:00Z' });
    const t = await resolveTarget(p.root, null, { run: fake });
    assert.deepEqual([t.scope, t.slugs, t.branch, t.inferred], ['slug', ['one'], 'b1', true]);
    p.wf('two', { branch: 'b2', at: '2026-10-25T00:00:00Z' });
    const many = await resolveTarget(p.root, '', { run: fake });
    assert.deepEqual([many.scope, many.slugs, many.ambiguous], [null, ['two', 'one'], true]);
  } finally { p.done(); }
});

test('wf.mjs target prints the JSON, and exits 1 when nothing resolves', () => {
  const p = project();
  try {
    p.wf('tags-api', { branch: 'feat/tags' });
    const gh = path.join(p.root, 'fake-gh.mjs');
    writeFileSync(gh, "process.stdout.write(process.argv[4] === '12' ? 'feat/tags\\n' : '');\nprocess.exit(process.argv[4] === '12' ? 0 : 1);\n");
    const cli = (...args) => spawnSync(process.execPath, [path.join(pluginRoot, 'scripts', 'wf.mjs'), 'target', p.root, ...args], { encoding: 'utf8', env: { ...process.env, SDLC_GH_BIN: gh, SDLC_HOME: path.join(p.root, '.sdlc-home') } });
    const pr = cli('pr#12', '--json');
    assert.equal(pr.status, 0, pr.stderr);
    assert.deepEqual(JSON.parse(pr.stdout), { scope: 'branch', slugs: ['tags-api'], branch: 'feat/tags', pr: 12, closed: [] });
    const slug = cli('tags-api', '--json');
    assert.deepEqual(JSON.parse(slug.stdout), { scope: 'slug', slugs: ['tags-api'], branch: 'feat/tags', siblings: [] });
    assert.equal(cli('tags-api').stdout.trim(), 'slug tags-api (branch feat/tags)');
    assert.equal(cli('nope').status, 1);
  } finally { p.done(); }
});
