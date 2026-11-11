// scripts/release.mjs: the version rules, the CHANGELOG section, the plan archive, and one
// release end to end against a temporary repository and a bare remote, with a stop and a resume.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ReleaseStop, STATE_FILE, changelogFor, nextCatalogVersion, nextVersion, relink, release, shippedVersionOf,
} from '../../scripts/release.mjs';

test('nextVersion: the four levels and the next channel', () => {
  assert.equal(nextVersion('9.201.0', 'patch'), '9.201.1');
  assert.equal(nextVersion('9.201.0', 'minor'), '9.202.0');
  assert.equal(nextVersion('9.201.0', 'major'), '10.0.0');
  assert.equal(nextVersion('9.201.0', 'next'), '10.0.0-next.0');
  assert.equal(nextVersion('10.0.0-next.0', 'next'), '10.0.0-next.1');
  assert.equal(nextVersion('10.0.0-next.4', 'major'), '10.0.0', 'major ships the release of the next line');
  assert.throws(() => nextVersion('10.0.0-next.4', 'patch'), ReleaseStop);
  assert.throws(() => nextVersion('9.201.0', 'huge'), ReleaseStop);
  assert.equal(nextCatalogVersion('1.226.0', 'next'), '1.226.1');
  assert.equal(nextCatalogVersion('1.226.3', 'major'), '1.227.0');
});

test('changelogFor: the Unreleased text becomes the section, or the commit subjects make one', () => {
  const head = '# Changelog\n\nIntro.\n\n';
  const old = '## [9.201.0] - 2026-10-22\n\n- old\n';
  assert.equal(changelogFor(`${head}## [Unreleased]\n\n- new thing\n\n${old}`, '9.202.0', '2026-10-24'),
    `${head}## [9.202.0] - 2026-10-24\n\n- new thing\n\n${old}`);
  assert.equal(changelogFor(`${head}## [Unreleased]\n\n${old}`, '9.202.0', '2026-10-24', ['feat: a', 'fix: b']),
    `${head}## [9.202.0] - 2026-10-24\n\n- feat: a\n- fix: b\n\n${old}`);
  assert.equal(changelogFor(`${head}${old}`, '9.202.0', '2026-10-24', ['feat: a']), `${head}## [9.202.0] - 2026-10-24\n\n- feat: a\n\n${old}`);
  const done = `${head}## [9.202.0] - 2026-10-24\n\n- x\n`;
  assert.equal(changelogFor(done, '9.202.0', '2026-10-25'), done, 'a second run changes nothing');
  assert.throws(() => changelogFor(`${head}${old}`, '9.202.0', '2026-10-24', []), ReleaseStop);
});

test('shippedVersionOf and relink', () => {
  assert.equal(shippedVersionOf('# P\n\nStatus **SHIPPED v9.189.0** (2026-10-18)\n'), '9.189.0');
  assert.equal(shippedVersionOf('# P\n\nStatus **BUILT in v9.201.0 (W0–W3)**\n'), '9.201.0');
  assert.equal(shippedVersionOf('# P\n\nStatus **BUILT and COMMITTED `13196454` (W0–W8), not released**\n'), null);
  assert.equal(shippedVersionOf('# P\n\nStatus: **DRAFTED 2026-09-21** against v9.157.1\n'), null);
  const moved = new Map([['docs/internal/A.md', 'docs/internal/archived/A.md']]);
  assert.equal(relink('see [a](A.md#x) and [b](B.md) and [w](https://x.y/A.md)', 'docs/internal', 'docs/internal', moved),
    'see [a](archived/A.md#x) and [b](B.md) and [w](https://x.y/A.md)');
  assert.equal(relink('see [b](B.md) and [old](archived/OLD.md)', 'docs/internal', 'docs/internal/archived', moved),
    'see [b](../B.md) and [old](OLD.md)');
});

// ---------------------------------------------------------------- end to end

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function fixture() {
  const top = mkdtempSync(path.join(tmpdir(), 'sdlc-release-'));
  const gitconfig = path.join(top, 'gitconfig');
  writeFileSync(gitconfig, '[user]\n\tname = Release Test\n\temail = release@example.test\n[init]\n\tdefaultBranch = master\n');
  const env = { GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1' };
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);

  const remote = path.join(top, 'remote.git');
  const work = path.join(top, 'work');
  git(top, 'init', '--quiet', '--bare', remote);
  git(top, 'init', '--quiet', '-b', 'master', work);
  const root = path.join(work, 'plugins', 'sdlc-workflow');
  const put = (rel, text) => { const p = path.join(work, rel); mkdirSync(path.dirname(p), { recursive: true }); writeFileSync(p, text); };
  const json = (v) => `${JSON.stringify(v, null, 2)}\n`;
  put('plugins/sdlc-workflow/package.json', json({ name: 'x', version: '9.201.0' }));
  put('plugins/sdlc-workflow/package-lock.json', json({ name: 'x', version: '9.201.0', lockfileVersion: 3, packages: { '': { name: 'x', version: '9.201.0' } } }));
  put('plugins/sdlc-workflow/.claude-plugin/plugin.json', json({ name: 'sdlc-workflow', version: '9.201.0' }));
  put('plugins/sdlc-workflow/.codex-plugin/plugin.json', json({ name: 'sdlc-workflow', version: '9.201.0' }));
  put('plugins/sdlc-workflow/CHANGELOG.md', '# Changelog\n\n## [Unreleased]\n\n- the change\n\n## [9.201.0] - 2026-10-22\n\n- old\n');
  put('plugins/sdlc-workflow/docs/internal/OLD-PLAN.md', '# OLD-PLAN\n\nStatus **SHIPPED v9.100.0**\n\nSee [the other](OTHER.md).\n');
  put('plugins/sdlc-workflow/docs/internal/OTHER.md', '# Other\n\nBuilt on [the old plan](OLD-PLAN.md).\n');
  put('plugins/sdlc-workflow/docs/internal/BUSY.md', '# Busy\n\nNo status.\n');
  put('.claude-plugin/marketplace.json', json({ name: 'm', version: '1.226.0', plugins: [{ name: 'sdlc-workflow', source: './plugins/sdlc-workflow', version: '9.201.0' }] }));
  git(work, 'add', '-A');
  git(work, 'commit', '--quiet', '-m', 'feat: the start');
  git(work, 'tag', '-a', 'v9.201.0', '-m', 'v9.201.0');
  git(work, 'remote', 'add', 'origin', remote);
  git(work, 'push', '--quiet', 'origin', 'master', '--follow-tags');
  // Another session's uncommitted change: it must stay out of the release commit.
  writeFileSync(path.join(root, 'docs', 'internal', 'BUSY.md'), '# Busy\n\nAn edit in progress.\n');

  const cleanup = () => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    rmSync(top, { recursive: true, force: true });
  };
  return { root, work, remote, cleanup };
}

const quiet = { log: () => {}, checkCi: () => ({ ok: true, reason: 'not checked' }), install: () => {}, smoke: () => [], restartDesign: () => ({ restarted: false, reason: 'not running' }), pointShim: () => ({ ok: true, version: 'x' }), generate: () => [] };
const doctorOk = () => ({ ok: true, shipped: 'x', buildId: null, hosts: { claude: [], codex: [], codexConfig: null }, cleanup: { done: true, left: [] }, verdicts: { claude: 'absent', codex: 'absent' } });

test('release next: end to end, with a stop at a gate and a stop at doctor, each resumed', async () => {
  const { root, work, remote, cleanup } = fixture();
  try {
    const source = git(work, 'rev-parse', 'HEAD');

    // A failing gate stops the run before it writes anything.
    await assert.rejects(release('next', { ...quiet, root, gates: [['fails', ['-e', 'process.exit(3)']]], doctor: doctorOk }), /the fails gate failed/);
    assert.ok(existsSync(path.join(root, STATE_FILE)), 'the state file keeps the target version');
    await assert.rejects(release('minor', { ...quiet, root, gates: [], doctor: doctorOk }), /a next release of v10\.0\.0-next\.0 is in progress/);

    // A gate that fails only at the new version stops the run after prepare, before any commit or push.
    const versionGate = [['versioned', ['-e', "process.exit(require('fs').readFileSync('package.json', 'utf8').includes('-next.') ? 3 : 0)"]]];
    await assert.rejects(release('next', { ...quiet, root, gates: versionGate, doctor: doctorOk }), /the versioned gate failed at v10\.0\.0-next\.0/);
    assert.equal(git(work, 'rev-parse', 'HEAD'), source, 'nothing is committed');
    assert.equal(git(remote, 'rev-parse', 'master'), source, 'nothing is pushed');

    // The resumed run passes the gates, then stops at doctor after the push.
    await assert.rejects(release('next', { ...quiet, root, gates: [], doctor: () => ({ ...doctorOk(), ok: false }) }), /doctor/);
    const commit = git(work, 'rev-parse', 'HEAD');
    assert.equal(git(work, 'log', '-1', '--format=%s'), 'release(sdlc-workflow): v10.0.0-next.0');
    assert.equal(git(remote, 'rev-parse', 'master'), commit, 'the remote has the release commit');
    assert.equal(git(remote, 'rev-parse', 'v10.0.0-next.0^{commit}'), commit, 'the remote has the annotated tag');

    // A host that fails the smoke flow stops the install step too.
    await assert.rejects(release('next', { ...quiet, root, gates: [], doctor: doctorOk, smoke: () => [{ host: 'pi', status: true, intake: false, slugs: [], ok: false, tail: 'no index' }] }), /smoke/);

    // The next resume reinstalls and finishes; it makes no second commit.
    // The install step starts a running design server again from the installed copy.
    // The install step points the shim at the installed copy and says when it is still behind.
    const lines = [];
    const shimFor = [];
    const pointShim = (_ctx, st) => { shimFor.push(st.version); return { ok: false, reason: `the shim still runs 9.201.0, behind ${st.version}`, fix: 'node "<copy>/lib/wf-shim.mjs"' }; };
    const state = await release('next', { ...quiet, root, gates: [], doctor: doctorOk, log: (l) => lines.push(l), pointShim, restartDesign: () => ({ restarted: true, from: '10.0.0-next.0' }) });
    assert.deepEqual(shimFor, ['10.0.0-next.0']);
    assert.ok(lines.includes('[release]   wf.mjs shim: the shim still runs 9.201.0, behind 10.0.0-next.0: run node "<copy>/lib/wf-shim.mjs" (NOT OK)'), lines.join('\n'));
    assert.ok(lines.includes('[release]   design server: restarted from 10.0.0-next.0'));
    assert.equal(state.version, '10.0.0-next.0');
    assert.equal(git(work, 'rev-parse', 'HEAD'), commit);
    assert.ok(!existsSync(path.join(root, STATE_FILE)), 'the last step deletes the state file');

    const read = (rel) => readFileSync(path.join(work, rel), 'utf8');
    for (const rel of ['package.json', 'package-lock.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
      assert.match(read(`plugins/sdlc-workflow/${rel}`), /"version": "10\.0\.0-next\.0"/, rel);
    }
    const catalog = JSON.parse(read('.claude-plugin/marketplace.json'));
    assert.equal(catalog.version, '1.226.1');
    assert.equal(catalog.plugins[0].version, '10.0.0-next.0');
    assert.match(read('plugins/sdlc-workflow/CHANGELOG.md'), /## \[10\.0\.0-next\.0\] - \d{4}-\d\d-\d\d\n\n- the change\n/);
    assert.equal(read('plugins/sdlc-workflow/BUILD_SHA').trim(), source, 'BUILD_SHA names the commit the release ships');

    // The shipped plan moved, with the links on both sides.
    assert.ok(!existsSync(path.join(root, 'docs/internal/OLD-PLAN.md')));
    assert.match(read('plugins/sdlc-workflow/docs/internal/archived/OLD-PLAN.md'), /\[the other\]\(\.\.\/OTHER\.md\)/);
    assert.match(read('plugins/sdlc-workflow/docs/internal/OTHER.md'), /\[the old plan\]\(archived\/OLD-PLAN\.md\)/);

    // The other session's file is still dirty and is not in the commit.
    assert.match(git(work, 'status', '--porcelain'), /BUSY\.md/);
    assert.doesNotMatch(git(work, 'show', '--name-only', '--format=', commit), /BUSY\.md/);
    assert.equal(git(work, 'status', '--porcelain', '--', 'plugins/sdlc-workflow/package.json'), '');

    // The next run makes the next prerelease, with the commit subjects as its CHANGELOG section.
    writeFileSync(path.join(root, 'NEW.md'), 'new\n');
    git(work, 'add', '--', 'plugins/sdlc-workflow/NEW.md');
    git(work, 'commit', '--quiet', '-m', 'fix: a second change');
    const again = await release('next', { ...quiet, root, gates: [], doctor: doctorOk });
    assert.equal(again.version, '10.0.0-next.1');
    assert.match(read('plugins/sdlc-workflow/CHANGELOG.md'), /## \[10\.0\.0-next\.1\] - \d{4}-\d\d-\d\d\n\n- fix: a second change\n/);
    assert.equal(git(remote, 'rev-parse', 'master'), git(work, 'rev-parse', 'HEAD'));
  } finally {
    cleanup();
  }
});

const realRun = (cmd, args, { cwd, input, shell = false } = {}) => {
  const r = spawnSync(cmd, args, { cwd, input, encoding: 'utf8', shell, windowsHide: true });
  return { status: r.error ? 127 : r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};
const changedIn = (work, commit) => git(work, 'show', '--name-only', '--format=', commit).split('\n');

test('a prepare that stops after its first writes resumes and commits every path it wrote', async () => {
  const { root, work, cleanup } = fixture();
  try {
    let fail = true;
    const generate = () => { if (fail) { fail = false; throw new Error('EBUSY: generate stopped'); } return []; };
    await assert.rejects(release('next', { ...quiet, root, gates: [], doctor: doctorOk, generate }), /EBUSY/);
    const state = JSON.parse(readFileSync(path.join(root, STATE_FILE), 'utf8'));
    assert.ok(state.paths.includes('CHANGELOG.md') && state.paths.includes('package.json'), 'the state holds the paths written before the stop');
    await release('next', { ...quiet, root, gates: [], doctor: doctorOk, generate });
    const files = changedIn(work, 'HEAD');
    for (const rel of ['CHANGELOG.md', 'package.json', 'package-lock.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
      assert.ok(files.includes(`plugins/sdlc-workflow/${rel}`), `${rel} is in the release commit`);
    }
    assert.ok(files.includes('.claude-plugin/marketplace.json'));
    assert.match(git(work, 'show', 'HEAD:plugins/sdlc-workflow/package.json'), /"version": "10\.0\.0-next\.0"/);
  } finally { cleanup(); }
});

test('a resumed release refuses to publish from another branch; back on master, BUILD_SHA names the parent of the release commit', async () => {
  const { root, work, remote, cleanup } = fixture();
  try {
    const source = git(work, 'rev-parse', 'HEAD');
    const versionGate = [['versioned', ['-e', "process.exit(require('fs').readFileSync('package.json', 'utf8').includes('-next.') ? 3 : 0)"]]];
    await assert.rejects(release('next', { ...quiet, root, gates: versionGate, doctor: doctorOk }), /the versioned gate failed/);
    git(work, 'switch', '--quiet', '-c', 'fix');
    await assert.rejects(release('next', { ...quiet, root, gates: [], doctor: doctorOk }), /HEAD is on fix: release only from master/);
    assert.equal(git(remote, 'rev-parse', 'master'), source, 'nothing is pushed');
    assert.equal(git(work, 'tag', '--list', 'v10.0.0-next.0'), '', 'nothing is tagged');
    // The fix lands on master, then the release resumes there.
    git(work, 'switch', '--quiet', 'master');
    writeFileSync(path.join(root, 'FIX.md'), 'fix\n');
    git(work, 'add', '--', 'plugins/sdlc-workflow/FIX.md');
    // The fix commits its own file only; the prepared release paths stay uncommitted.
    git(work, 'commit', '--quiet', '-m', 'fix: the gate', '--only', '--', 'plugins/sdlc-workflow/FIX.md');
    const fix = git(work, 'rev-parse', 'HEAD');
    await release('next', { ...quiet, root, gates: [], doctor: doctorOk });
    assert.equal(git(work, 'rev-parse', 'HEAD^'), fix);
    assert.equal(git(work, 'show', 'HEAD:plugins/sdlc-workflow/BUILD_SHA').trim(), fix);
    assert.equal(git(remote, 'rev-parse', 'master'), git(work, 'rev-parse', 'HEAD'));
  } finally { cleanup(); }
});

/** A runner whose first push of master meets a remote that another clone moved. */
function racedRun(remote, top) {
  let raced = false;
  return (cmd, args, opts) => {
    if (!raced && cmd === 'git' && args.includes('push') && args.includes('HEAD:refs/heads/master')) {
      raced = true;
      const other = path.join(top, 'other');
      git(top, 'clone', '--quiet', remote, other);
      writeFileSync(path.join(other, 'OTHER.txt'), 'other\n');
      git(other, 'add', '--', 'OTHER.txt');
      git(other, 'commit', '--quiet', '-m', 'feat: another push');
      git(other, 'push', '--quiet', 'origin', 'master');
    }
    return realRun(cmd, args, opts);
  };
}

for (const how of ['merge', 'rebase']) {
  test(`a push that failed and a ${how} of the upstream: the resume finds the release commit and pushes it with an annotated tag`, async () => {
    const { root, work, remote, cleanup } = fixture();
    try {
      // A lightweight tag of the release version, made by hand: the release makes it again, annotated.
      git(work, 'tag', 'v10.0.0-next.0');
      const top = path.dirname(work);
      await assert.rejects(release('next', { ...quiet, root, gates: [], doctor: doctorOk, run: racedRun(remote, top) }), /push/);
      await assert.rejects(release('next', { ...quiet, root, gates: [], doctor: doctorOk }), /HEAD is behind origin\/master/);
        // Another session's edit is dirty, so the pull keeps it aside while it runs.
      git(work, 'pull', '--quiet', how === 'merge' ? '--no-rebase' : '--rebase', '--autostash', 'origin', 'master');
      const state = await release('next', { ...quiet, root, gates: [], doctor: doctorOk });
      const subject = 'release(sdlc-workflow): v10.0.0-next.0';
      const commits = git(work, 'log', '--format=%H %s', 'master').split('\n').filter((l) => l.endsWith(subject));
      assert.equal(commits.length, 1, 'one release commit');
      const commit = commits[0].split(' ')[0];
      assert.equal(state.commit, commit);
      assert.equal(git(remote, 'cat-file', '-t', 'refs/tags/v10.0.0-next.0'), 'tag', 'the pushed tag is annotated');
      assert.equal(git(remote, 'rev-parse', 'v10.0.0-next.0^{commit}'), commit);
      assert.equal(git(remote, 'rev-parse', 'master'), git(work, 'rev-parse', 'HEAD'));
    } finally { cleanup(); }
  });
}
