// `wf.mjs design migrate` on a git repo with two board revisions: one commit per revision, the
// legacy frame, the contract fields, the captures, the map file, and the run that waits for an
// export.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { migrateDesign, readMigrated } from '../../lib/design-migrate.mjs';
import { capturePicture } from '../../lib/design-records.mjs';
import { addScreen, initSurface, missingDesignFiles, readManifest, screenFile, surfaceDir } from '../../lib/design-surface.mjs';
import { designSettled } from '../../lib/design-lane.mjs';
import { frontmatterOfDoc } from '../../lib/records.mjs';

const SHA = 'a'.repeat(64);

function manifest(slug, revision, boards, confirmed = []) {
  return JSON.stringify({ schema: 'sdlc/design-boards/v1', slug, revision, method: 'html', viewports: { desktop: '1280x800' }, boards, confirmed });
}

function project() {
  const top = mkdtempSync(join(tmpdir(), 'design-migrate-'));
  const root = join(top, 'Shop');
  const wf = join(root, '.ai', 'workflows', 'w1');
  const design = join(wf, 'design');
  for (const d of ['r1/boards', 'r2/boards', 'captures/s1']) mkdirSync(join(design, d), { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'config', 'user.email', 't@t']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 't']);
  writeFileSync(join(root, '.gitignore'), '.ai/\n');
  writeFileSync(join(wf, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: w1\nux-impact: visual\n---\n');
  writeFileSync(join(wf, '02c-craft.md'), '---\nschema: sdlc/v1\ntype: design-contract\nslug: w1\nboards: design/r2/boards.json\ndesign-revision: 2\ndirection-confirmed-by: in-session\nimage-gate: pass\n---\n# Contract\n');
  writeFileSync(join(design, 'r1', 'boards', 'home--default.html'), '<html><head><title>Home</title></head><body>first</body></html>');
  writeFileSync(join(design, 'r1', 'boards', 'home--error.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(design, 'r1', 'boards.json'), manifest('w1', 1, [
    { key: 'home--default', surface: 'home', state: 'default', html: 'boards/home--default.html', caption: 'Home' },
    { key: 'home--error', surface: 'home', state: 'error', png: 'boards/home--error.png', caption: 'Home, error' },
  ], [{ revision: 1, at: '2026-09-01T00:00:00Z', by: 'in-session' }]));
  writeFileSync(join(design, 'r2', 'boards', 'home--default.html'), '<html><head><title>Home</title><link rel="stylesheet" href="../source/a.css"></head><body>second</body></html>');
  writeFileSync(join(design, 'r2', 'boards', 'home--error.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 2]));
  writeFileSync(join(design, 'r2', 'boards.json'), manifest('w1', 2, [
    { key: 'home--default', surface: 'home', state: 'default', html: 'boards/home--default.html', caption: 'Home' },
    { key: 'home--error', surface: 'home', state: 'error', png: 'boards/home--error.png', caption: 'Home, error' },
  ], [{ revision: 2, at: '2026-09-05T00:00:00Z', by: 'in-session' }]));
  writeFileSync(join(design, 'captures', 's1', 'home--default.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 3]));
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  // The repo ignores .ai/ and has no design surface yet: migrate makes it.
  execFileSync('git', ['-C', root, 'add', '.gitignore']);
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'start']);
  return { root, wf, design, done: () => { if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved; rmSync(top, { recursive: true, force: true }); } };
}

const log = (root) => execFileSync('git', ['-C', root, 'log', '--format=%H %s'], { encoding: 'utf8' }).trim().split('\n');
const show = (root, sha, rel) => execFileSync('git', ['-C', root, 'show', `${sha}:${rel}`], { encoding: 'utf8' });

test('migrate writes one commit per revision, the legacy frame, the contract and the captures', () => {
  const { root, wf, done } = project();
  try {
    const plan = migrateDesign(root, { write: false });
    assert.deepEqual(plan.results[0], { slug: 'w1', keys: { 'home--default': 'home', 'home--error': 'home-error' }, revisions: [1, 2], confirmed: 2 });
    assert.equal(log(root).length, 1, 'the plan writes nothing');
    assert.equal(existsSync(screenFile(root, 'home')), false);

    const r = migrateDesign(root, { now: new Date('2026-10-25T00:00:00Z') }).results[0];
    assert.equal(r.migrated, true);
    assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /^!\.ai\/design\/$/m, 'the git rule keeps the surface tracked');
    assert.deepEqual(Object.keys(r.commits), ['r1', 'r2']);
    assert.notEqual(r.commits.r1, r.commits.r2);
    assert.equal(r.approved, r.commits.r2);
    assert.deepEqual(r.screens, ['home', 'home-error']);
    assert.equal(r.captures, 1);
    assert.match(r.warnings[0], /home: the board links to \.\.\/source\/a\.css/);
    const subjects = log(root).map((l) => l.slice(41));
    assert.deepEqual(subjects.slice(0, 3), ['design: map the boards of w1 to screens', 'design: revision 2 of w1, from its boards', 'design: revision 1 of w1, from its boards']);

    // Each revision commit holds the page of its own revision.
    assert.match(show(root, r.commits.r1, '.ai/design/screens/home.html'), /first/);
    assert.match(show(root, r.commits.r2, '.ai/design/screens/home.html'), /second/);
    assert.match(show(root, r.commits.r2, '.ai/design/screens/home.html'), /<meta name="wf:migrated-from" content="w1\/design\/r2\/boards\/home--default.html">/);
    assert.match(readFileSync(screenFile(root, 'home-error'), 'utf8'), /<img src="\.\.\/legacy\/home-error\.png"/);
    assert.deepEqual([...readFileSync(join(surfaceDir(root), 'legacy', 'home-error.png'))], [0x89, 0x50, 0x4e, 0x47, 2]);

    const m = readManifest(root);
    assert.equal(m.screens['home-error'].legacy, true);
    assert.deepEqual(m.screens.home.workflows, ['w1']);
    assert.deepEqual(m.screens.home.approvals, [{ commit: r.commits.r2, at: '2026-09-05T00:00:00Z', workflow: 'w1', migrated: true }]);

    const contract = frontmatterOfDoc(wf, '02c-craft.md');
    assert.deepEqual(contract.screens, ['home', 'home-error']);
    assert.equal(contract['approval-commit'], r.commits.r2);
    assert.equal(contract['direction-confirmed-by'], 'migrated');
    assert.equal(contract['migrated-from'], 'design/r2/boards.json');
    assert.equal(contract.boards, 'design/r2/boards.json', 'the old path stays');
    const index = frontmatterOfDoc(wf, '00-index.md');
    assert.equal(designSettled(index, contract, missingDesignFiles(root, wf, contract)), true);

    assert.ok(existsSync(capturePicture(root, 'w1', 's1', 'home')));
    assert.ok(existsSync(join(wf, 'design', 'r2', 'boards', 'home--default.html')), 'the old files stay');
    assert.deepEqual(readMigrated(root).workflows.w1.keys, { 'home--default': 'home', 'home--error': 'home-error' });

    const again = migrateDesign(root).results[0];
    assert.deepEqual(again, { slug: 'w1', skip: 'migrated already' });
  } finally { done(); }
});

test('the boards of one surface in several viewports become one screen that opens the nearest viewport page', async () => {
  const { root, design, wf, done } = project();
  try {
    writeFileSync(join(design, 'r2', 'boards', 'home--default--phone.html'), '<html><head></head><body>narrow</body></html>');
    writeFileSync(join(design, 'r2', 'boards.json'), JSON.stringify({ schema: 'sdlc/design-boards/v1', slug: 'w1', revision: 2, method: 'html', viewports: { desktop: '1280x800', phone: '390x844' }, boards: [
      { key: 'home--default--desktop', surface: 'home', state: 'default', viewport: 'desktop', html: 'boards/home--default.html' },
      { key: 'home--default--phone', surface: 'home', state: 'default', viewport: 'phone', html: 'boards/home--default--phone.html' },
    ], confirmed: [{ revision: 2, at: '2026-09-05T00:00:00Z', by: 'in-session' }] }));
    const r = migrateDesign(root).results[0];
    assert.equal(r.migrated, true);
    assert.deepEqual(r.screens, ['home'], 'two viewport boards, one screen');
    const page = readFileSync(screenFile(root, 'home'), 'utf8');
    assert.match(page, /"href":"home\/desktop\.html"/);
    assert.match(page, /"href":"home\/phone\.html"/);
    assert.match(readFileSync(join(surfaceDir(root), 'screens', 'home', 'phone.html'), 'utf8'), /narrow/);
    assert.match(readFileSync(join(surfaceDir(root), 'screens', 'home', 'desktop.html'), 'utf8'), /second/);
    assert.equal(readManifest(root).viewports.phone, '375x812', 'a viewport the surface has keeps its size');
    assert.deepEqual(frontmatterOfDoc(wf, '02c-craft.md').screens, ['home']);
    // In a browser, the screen page shows the board of the nearest viewport.
    const { checkBrowser, openBrowser } = await import('../../lib/design-check.mjs');
    const browser = checkBrowser(root);
    if (!browser) return;
    const b = await openBrowser(root, { browser });
    try {
      const url = (await import('node:url')).pathToFileURL(screenFile(root, 'home')).href;
      await b.open(url, { width: 390, height: 844 });
      await new Promise((ok) => setTimeout(ok, 300));
      assert.equal(await b.evaluate('document.body.textContent.trim()'), 'narrow');
      await b.open(url, { width: 1280, height: 800 });
      await new Promise((ok) => setTimeout(ok, 300));
      assert.equal(await b.evaluate('document.body.textContent.trim()'), 'second');
    } finally { await b.close(); }
  } finally { done(); }
});

test('a board that lives only on claude.ai stops the workflow until it is exported', () => {
  const { root, wf, design, done } = project();
  try {
    writeFileSync(join(design, 'r2', 'boards.json'), manifest('w1', 2, [
      { key: 'home--default', surface: 'home', state: 'default', html: 'boards/home--default.html' },
      { key: 'cart--default', surface: 'cart', state: 'default', html: 'boards/cart--default.html', canvas: { link: 'https://claude.ai/artifact/x', sha256: SHA } },
    ]));
    const r = migrateDesign(root).results[0];
    assert.equal(r.blocked, true);
    assert.deepEqual(r.exports, [{ key: 'cart--default', revision: 2, file: 'design/r2/boards/cart--default.html', canvas: 'https://claude.ai/artifact/x' }]);
    assert.equal(log(root).length, 1, 'nothing is committed');
    assert.equal(frontmatterOfDoc(wf, '02c-craft.md').screens, undefined);

    writeFileSync(join(design, 'r2', 'boards', 'cart--default.html'), '<html><head></head><body>cart</body></html>');
    const after = migrateDesign(root).results[0];
    assert.equal(after.migrated, true);
    assert.deepEqual(after.screens, ['home', 'cart']);
  } finally { done(); }
});

test('a screen that the newest revision dropped leaves the surface, in one more commit', () => {
  const { root, design, done } = project();
  try {
    writeFileSync(join(design, 'r1', 'boards', 'cart--default.html'), '<html><head><title>Cart</title></head><body>cart</body></html>');
    const r1 = JSON.parse(readFileSync(join(design, 'r1', 'boards.json'), 'utf8'));
    r1.boards.push({ key: 'cart--default', surface: 'cart', state: 'default', html: 'boards/cart--default.html', caption: 'Cart' });
    writeFileSync(join(design, 'r1', 'boards.json'), JSON.stringify(r1));
    const r = migrateDesign(root, { now: new Date('2026-10-25T00:00:00Z') }).results[0];
    assert.equal(r.migrated, true);
    assert.ok(r.commits.dropped, 'a commit for the dropped screens');
    assert.equal(readManifest(root).screens.cart, undefined, 'no screen of the dropped board');
    assert.equal(existsSync(screenFile(root, 'cart')), false);
    const tracked = execFileSync('git', ['-C', root, 'ls-files', '.ai/design/screens'], { encoding: 'utf8' });
    assert.doesNotMatch(tracked, /cart\.html/, 'the page is gone from git too');
    assert.match(tracked, /home\.html/);
  } finally { done(); }
});

test('a board never overwrites a screen of the surface: the plan reports the conflict, and the run refuses that workflow', () => {
  const { root, done } = project();
  try {
    // A screen that the design stage drew under the key that the board home--default maps to.
    initSurface(root);
    addScreen(root, 'home', { workflow: 'w1' });
    const drawn = '<html><head><meta name="wf:screen" content="home"></head><body>drawn by hand</body></html>';
    writeFileSync(screenFile(root, 'home'), drawn);
    const commitsBefore = log(root).length;
    const plan = migrateDesign(root, { write: false });
    assert.equal(plan.ok, false);
    const p = plan.results[0];
    assert.equal(p.blocked, true);
    assert.deepEqual(p.conflicts, [{ key: 'home', screen: '.ai/design/screens/home.html', uncommitted: true, board: 'w1/design/r2/boards/home--default.html' }]);
    assert.equal(p.fix.who, 'agent');
    assert.match(p.fix.do, /\.ai\/design\/screens\/home\.html \(the board w1\/design\/r2\/boards\/home--default\.html\)/, 'the fix names both files');
    assert.match(p.fix.do, /changes that no commit holds/);
    assert.match(p.fix.command, /wf\.mjs design screen rename .* home home-current$/);
    assert.match(p.fix.then, /wf\.mjs design migrate .* w1$/);

    const run = migrateDesign(root);
    assert.deepEqual([run.ok, run.results[0].blocked, run.results[0].migrated], [false, true, undefined]);
    assert.equal(readFileSync(screenFile(root, 'home'), 'utf8'), drawn, 'the screen page is as it was');
    assert.equal(log(root).length, commitsBefore, 'no commit');
    assert.equal(readMigrated(root).workflows.w1, undefined);
  } finally { done(); }
});

test('a revision whose manifest does not read is named, and the workflow waits', () => {
  const { root, design, done } = project();
  try {
    writeFileSync(join(design, 'r1', 'boards.json'), '{ not json');
    const r = migrateDesign(root, { write: false });
    assert.equal(r.ok, false);
    assert.equal(r.results[0].blocked, true);
    assert.equal(r.results[0].invalid.length, 1);
    assert.equal(r.results[0].invalid[0].file, 'w1/design/r1/boards.json');
    assert.match(r.results[0].fix.do, /A board manifest does not read: w1\/design\/r1\/boards\.json/);
    assert.deepEqual(migrateDesign(root).results[0].migrated, undefined, 'the real run leaves the workflow as it is');
    assert.equal(existsSync(screenFile(root, 'home')), false);
    assert.throws(() => migrateDesign(root, { slugs: ['nope'] }), (e) => /no workflow nope/.test(e.message) && /w1/.test(e.fix.do));
  } finally { done(); }
});

test('a run that stopped after a revision goes on from there, with no second commit of that revision', () => {
  const { root, done } = project();
  try {
    const first = migrateDesign(root, { now: new Date('2026-10-25T00:00:00Z') }).results[0];
    // The state of a run that stopped after the commit of revision 1.
    const file = join(surfaceDir(root), 'migrated.json');
    const state = JSON.parse(readFileSync(file, 'utf8'));
    delete state.workflows.w1;
    state.progress = { w1: { commits: { r1: first.commits.r1 } } };
    writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
    const again = migrateDesign(root, { now: new Date('2026-10-26T00:00:00Z') });
    assert.equal(again.ok, true);
    const r = again.results[0];
    assert.deepEqual([r.migrated, r.resumed], [true, true]);
    assert.equal(r.commits.r1, first.commits.r1, 'revision 1 keeps its commit');
    const subjects = log(root).map((l) => l.slice(41));
    assert.equal(subjects.filter((s) => s === 'design: revision 1 of w1, from its boards').length, 1);
    assert.equal(readMigrated(root).progress, undefined, 'the progress is gone when the workflow is done');
    assert.equal(readManifest(root).screens.home.approvals.filter((a) => a.migrated).length, 1, 'the approval is recorded once');
  } finally { done(); }
});

test('design migrate --check plans and changes nothing', () => {
  const { root, done } = project();
  try {
    const WF = fileURLToPath(new URL('../../scripts/wf.mjs', import.meta.url));
    const r = spawnSync(process.execPath, [WF, 'design', 'migrate', root, '--check', '--json'], { encoding: 'utf8', env: process.env });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.deepEqual([out.ok, out.results[0].slug, out.results[0].revisions], [true, 'w1', [1, 2]]);
    assert.equal(existsSync(surfaceDir(root)), false, 'no design surface');
    assert.equal(log(root).length, 1, 'no commit');
    assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'no file of the repo changed');
    assert.equal(existsSync(join(root, '.ai', 'workflows', 'INDEX.md')), false, 'the plan refreshes no index');
  } finally { done(); }
});
