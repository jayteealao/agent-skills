// The versions of a design: the drafts of the rounds, the approved versions that only the answer
// event makes, the restore that is never an approval, the close that deletes the drafts, the check
// that finds a hand edit, and the routes of the design server.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appendAnswerEvent } from '../../lib/answers.mjs';
import { closeWorkflow } from '../../lib/closing.mjs';
import { addDecision } from '../../lib/decisions.mjs';
import { approvalQuestion, approveDesign } from '../../lib/design-approve.mjs';
import { runChecks } from '../../lib/design-check.mjs';
import { designHandler } from '../../lib/design-server.mjs';
import { canvasState } from '../../lib/design-state.mjs';
import { addScreen, initSurface, readManifest, screenFile } from '../../lib/design-surface.mjs';
import { approvedPages, dropRounds, listVersions, restoreVersion, saveApproved, saveRound, versionDir, versionDrift, versionName } from '../../lib/design-versions.mjs';
import { frontmatterOfDoc } from '../../lib/records.mjs';

function project() {
  const top = mkdtempSync(join(tmpdir(), 'design-versions-'));
  const root = join(top, 'Shop');
  const dir = join(root, '.ai', 'workflows', 'w1');
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'config', 'user.email', 't@t']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 't']);
  writeFileSync(join(root, '.gitignore'), '.ai/\n');
  writeFileSync(join(dir, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: w1\nstatus: in-progress\nux-impact: visual\n---\n');
  writeFileSync(join(dir, '02c-craft.md'), '---\nschema: sdlc/v1\ntype: design-contract\nslug: w1\n---\n# Contract\n');
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  initSurface(root);
  addScreen(root, 'basket', { title: 'Basket', area: 'checkout', workflow: 'w1' });
  addScreen(root, 'pay', { title: 'Pay', area: 'checkout', workflow: 'w1' });
  return { root, dir, done: () => { if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved; rmSync(top, { recursive: true, force: true }); } };
}

const edit = (root, key, text) => writeFileSync(screenFile(root, key), `<html><body>${text}</body></html>`);
const at = (m) => new Date(`2026-11-01T10:${String(m).padStart(2, '0')}:00Z`);
const approve = async (root, m, opts = {}) => {
  appendAnswerEvent(root, { tool: 'AskUserQuestion', questions: [{ question: approvalQuestion('w1'), header: 'Design', answer: 'Approve' }] }, { now: at(m) });
  const r = await approveDesign(root, 'w1', { browser: null, now: at(m + 1), since: at(m - 1).toISOString(), ...opts });
  assert.equal(r.ok, true, r.reason);
  return r;
};

test('a round saves the pages with the decisions since the last draft, and a round with no change saves nothing', () => {
  const { root, dir, done } = project();
  try {
    edit(root, 'basket', 'one');
    assert.equal(saveRound(root, 'w1', { now: at(1) }).id, 'v1-r1');
    assert.deepEqual(saveRound(root, 'w1', { now: at(2) }), { ok: true, saved: false, id: 'v1-r1', reason: 'no page changed' });

    addDecision(dir, { stage: 'design', key: 'density', answer: 'compact', by: 'person', at: at(3).toISOString() }, { now: at(3).toISOString() });
    edit(root, 'basket', 'two');
    const r = saveRound(root, 'w1', { now: at(4) });
    assert.deepEqual([r.id, r.changed], ['v1-r2', ['basket']]);
    const { rounds, approved } = listVersions(root, 'w1');
    assert.deepEqual(approved, []);
    assert.deepEqual(rounds.map((x) => [x.id, x.kind]), [['v1-r1', 'round'], ['v1-r2', 'round']]);
    assert.equal(rounds[1].reason, 'density: compact');
    assert.match(readFileSync(join(versionDir(root, 'w1', 'v1-r1'), 'screens', 'basket.html'), 'utf8'), /one/, 'the first draft keeps its page');
    assert.equal(versionName('v1-r2'), 'v1 round 2');
    assert.equal(saveRound(root, 'nope').ok, false);
  } finally { done(); }
});

test('only the approval makes a version: it counts up, holds the approved pages and stamps the contract', async () => {
  const { root, dir, done } = project();
  try {
    edit(root, 'basket', 'first');
    saveRound(root, 'w1', { now: at(1) });
    const first = await approve(root, 2);
    assert.equal(first.version, 'v1');
    assert.equal(frontmatterOfDoc(dir, '02c-craft.md')['design-version'], 'v1');
    assert.equal(readManifest(root).screens.basket.approvals[0].version, 'v1');
    const [v1] = listVersions(root, 'w1').approved;
    assert.deepEqual([v1.kind, v1.commit, v1.reason], ['approved', first.commit, 'The first approved design']);

    // After v1, a draft leads to v2, and the rounds of v1 stay under v1.
    edit(root, 'basket', 'second');
    assert.equal(saveRound(root, 'w1', { now: at(5) }).id, 'v2-r1');
    assert.equal(approvedPages(root, 'w1').version, 'v1', 'a round has no authority');
    assert.match(readFileSync(approvedPages(root, 'w1').pages.find((p) => p.key === 'basket').file, 'utf8'), /first/);

    const second = await approve(root, 7, { reason: 'The total did not fit' });
    assert.equal(second.version, 'v2');
    assert.equal(listVersions(root, 'w1').approved[1].reason, 'The total did not fit');
    assert.deepEqual(listVersions(root, 'w1').approved[1].changed, ['basket']);
    assert.match(readFileSync(approvedPages(root, 'w1').pages.find((p) => p.key === 'basket').file, 'utf8'), /second/);
  } finally { done(); }
});

test('an approval of one screen carries the other screens of the last version, not their drafts', async () => {
  const { root, done } = project();
  try {
    edit(root, 'basket', 'b1');
    edit(root, 'pay', 'p1');
    await approve(root, 1);
    edit(root, 'basket', 'b2');
    edit(root, 'pay', 'p2 unapproved');
    await approve(root, 4, { keys: ['basket'] });
    const pages = Object.fromEntries(approvedPages(root, 'w1').pages.map((p) => [p.key, readFileSync(p.file, 'utf8')]));
    assert.match(pages.basket, /b2/);
    assert.match(pages.pay, /p1/);
    assert.doesNotMatch(pages.pay, /unapproved/);
  } finally { done(); }
});

test('a restore keeps the replaced pages, makes a new round and is never an approval', async () => {
  const { root, dir, done } = project();
  try {
    edit(root, 'basket', 'old');
    await approve(root, 1);
    edit(root, 'basket', 'new, in no round');
    const r = restoreVersion(root, 'w1', 'v1', { now: at(5) });
    assert.equal(r.ok, true, r.reason);
    assert.deepEqual([r.restored, r.id, r.saved, r.tokensDiffer], ['v1', 'v2-r2', true, false]);
    assert.match(readFileSync(screenFile(root, 'basket'), 'utf8'), /old/);
    const { approved, rounds } = listVersions(root, 'w1');
    assert.equal(approved.length, 1, 'no new version');
    assert.deepEqual(rounds.map((x) => x.reason), ['The pages before the restore of v1', 'Restored from v1']);
    assert.match(readFileSync(join(versionDir(root, 'w1', 'v2-r1'), 'screens', 'basket.html'), 'utf8'), /new, in no round/);
    assert.equal(frontmatterOfDoc(dir, '02c-craft.md')['design-version'], 'v1');
    assert.equal(restoreVersion(root, 'w1', 'v9').ok, false);
    assert.equal(restoreVersion(root, 'w1', '../x').ok, false);
  } finally { done(); }
});

test('a restore adds back a screen that the manifest lost, and says when the token sheet differs', async () => {
  const { root, done } = project();
  try {
    edit(root, 'basket', 'kept');
    await approve(root, 1);
    const m = readManifest(root);
    delete m.screens.basket;
    writeFileSync(join(root, '.ai', 'design', 'screens.json'), JSON.stringify(m));
    rmSync(screenFile(root, 'basket'));
    writeFileSync(join(root, '.ai', 'design', 'tokens.css'), ':root { --accent: #000; }\n');
    const r = restoreVersion(root, 'w1', 'v1', { now: at(5) });
    assert.equal(r.tokensDiffer, true);
    assert.deepEqual([readManifest(root).screens.basket.title, readManifest(root).screens.basket.area], ['Basket', 'checkout']);
    assert.match(readFileSync(screenFile(root, 'basket'), 'utf8'), /kept/);
  } finally { done(); }
});

test('the close deletes the rounds and keeps the approved versions; a closed workflow takes no round', async () => {
  const { root, done } = project();
  try {
    edit(root, 'basket', 'a');
    saveRound(root, 'w1', { now: at(1) });
    await approve(root, 2);
    assert.equal(closeWorkflow(root, 'w1', { reason: 'merged', now: at(5) }).closed, true);
    const { approved, rounds } = listVersions(root, 'w1');
    assert.deepEqual([approved.length, rounds.length], [1, 0]);
    assert.equal(dropRounds(root, 'w1'), false, 'no rounds are left');
    assert.match(saveRound(root, 'w1').reason, /closed/);
    assert.match(restoreVersion(root, 'w1', 'v1').reason, /closed/);
    assert.equal(canvasState(root).versions.w1.open, false);
  } finally { done(); }
});

test('a hand edit differs from the approved version with no round that holds it; the check names it', async () => {
  const { root, done } = project();
  try {
    assert.deepEqual(versionDrift(root, ['basket']), [], 'a screen with no version');
    edit(root, 'basket', 'approved\nin two lines');
    await approve(root, 1);
    assert.deepEqual(versionDrift(root, ['basket', 'pay']), []);
    edit(root, 'basket', 'approved\r\nin two lines');
    assert.deepEqual(versionDrift(root, ['basket']), [], 'a checkout that changes the line ends is no edit');
    edit(root, 'basket', 'by hand');
    assert.deepEqual(versionDrift(root, ['basket']), [{ screen: 'basket', workflow: 'w1', version: 'v1' }]);
    const r = await runChecks(root, { browser: null });
    const f = r.failures.find((x) => x.check === 'version');
    assert.match(f.message, /differs from v1 of w1/);
    assert.equal(f.move, null);
    saveRound(root, 'w1', { now: at(5) });
    assert.deepEqual(versionDrift(root, ['basket']), [], 'a round holds the change');
  } finally { done(); }
});

test('the server shows a version, falls back to the surface, and restores only by a same-origin write', async () => {
  const { root, done } = project();
  const server = createServer(designHandler({ repos: () => [{ name: 'shop', root }] }));
  try {
    edit(root, 'basket', 'old page');
    writeFileSync(join(root, '.ai', 'design', 'legacy.png'), 'picture');
    await approve(root, 1);
    edit(root, 'basket', 'new page');
    await new Promise((ok) => { server.listen(0, '127.0.0.1', ok); });
    const base = `http://127.0.0.1:${server.address().port}/r/shop`;

    assert.match(await (await fetch(`${base}/versions/w1/v1/screens/basket.html`)).text(), /old page/);
    assert.equal(await (await fetch(`${base}/versions/w1/v1/legacy.png`)).text(), 'picture', 'a file that a version does not keep');
    assert.equal((await fetch(`${base}/versions/w1/nope/screens/basket.html`)).status, 400);
    assert.equal((await fetch(`${base}/versions/w1/v1/..%2f..%2fsecret`)).status, 400);
    assert.deepEqual((await (await fetch(`${base}/state.json`)).json()).versions.w1.approved.map((v) => v.id), ['v1']);

    const post = (headers, body) => fetch(`${base}/versions/w1/restore`, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal((await post({ 'content-type': 'text/plain' }, { id: 'v1' })).status, 403);
    assert.equal((await post({ 'content-type': 'application/json', origin: 'http://evil.test' }, { id: 'v1' })).status, 403);
    assert.equal((await post({ 'content-type': 'application/json' }, { id: 'v9' })).status, 400);
    const ok = await post({ 'content-type': 'application/json' }, { id: 'v1' });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).restored, 'v1');
    assert.match(readFileSync(screenFile(root, 'basket'), 'utf8'), /old page/);
  } finally { server.close(); done(); }
});

test('an older workflow has no version, and a version names its commit', () => {
  const { root, done } = project();
  try {
    assert.equal(approvedPages(root, 'w1'), null);
    edit(root, 'basket', 'x');
    const id = saveApproved(root, 'w1', ['basket'], { commit: 'abc1234', now: at(1) });
    assert.equal(id, 'v1');
    assert.equal(approvedPages(root, 'w1').commit, 'abc1234');
    assert.ok(existsSync(join(versionDir(root, 'w1', 'v1'), 'version.json')));
    assert.equal(versionDir(root, 'w1', '../x'), null);
  } finally { done(); }
});
