// The checks of the screens in a headless browser, and the approval that a script records
// from the answer event: the commit, the manifest, the pictures, the contract fields and the
// settled rule of the design gate.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appendAnswerEvent } from '../../lib/answers.mjs';
import { approvalQuestion, approveDesign } from '../../lib/design-approve.mjs';
import { CHECK_MOVES, checkBrowser, runChecks } from '../../lib/design-check.mjs';
import { approvalPicture, readChecks } from '../../lib/design-records.mjs';
import { addScreen, initSurface, missingDesignFiles, readManifest, screenFile } from '../../lib/design-surface.mjs';
import { designGateRefusal, designSettled } from '../../lib/design-lane.mjs';
import { frontmatterOfDoc } from '../../lib/records.mjs';

function project() {
  const top = mkdtempSync(join(tmpdir(), 'design-approve-'));
  const root = join(top, 'Shop');
  mkdirSync(join(root, '.ai', 'workflows', 'w1'), { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'config', 'user.email', 't@t']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 't']);
  writeFileSync(join(root, '.gitignore'), '.ai/\n');
  writeFileSync(join(root, '.ai', 'workflows', 'w1', '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: w1\nux-impact: visual\n---\n');
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  initSurface(root);
  addScreen(root, 'basket', { title: 'Basket', area: 'checkout', workflow: 'w1', slice: 's1' });
  const page = readFileSync(screenFile(root, 'basket'), 'utf8')
    .replace('<section data-state="default"><h1>Basket</h1></section>', '<section data-state="default"><h1>Basket</h1><p style="color:#ccc">Two items</p><a href="pay.html" style="font-size:12px">Pay</a></section>')
    .replace('<section data-state="worst"><h1>Basket</h1></section>', '<section data-state="worst"><h1>Basket</h1><p style="width:80px;height:20px;overflow:hidden;white-space:nowrap">A product name that is far too long for its box</p></section>');
  writeFileSync(screenFile(root, 'basket'), page);
  return { root, done: () => { if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved; rmSync(top, { recursive: true, force: true }); } };
}

const answer = (root, slug, text, at) => appendAnswerEvent(root, { tool: 'AskUserQuestion', questions: [{ question: approvalQuestion(slug), header: 'Design', answer: text }] }, { now: new Date(at) });
const contractOf = (root) => frontmatterOfDoc(join(root, '.ai', 'workflows', 'w1'), '02c-craft.md');

test('without a browser, the checks report the missing states and say why they did not run', async () => {
  const { root, done } = project();
  try {
    writeFileSync(screenFile(root, 'basket'), '<html><body><section data-state="default">x</section></body></html>');
    const r = await runChecks(root, { browser: null });
    assert.equal(r.ran, false);
    assert.match(r.reason, /no browser/);
    assert.deepEqual(r.failures.map((f) => [f.check, f.move]), [['states', 'harden']]);
    assert.match(r.failures[0].message, /empty, loading, error, worst/);
  } finally { done(); }
});

test('the approval needs the contract and a new approve in the answer log; then it commits and stamps', async () => {
  const { root, done } = project();
  try {
    const index = frontmatterOfDoc(join(root, '.ai', 'workflows', 'w1'), '00-index.md');
    assert.match((await approveDesign(root, 'w1', { browser: null })).reason, /write 02c-craft\.md first/);
    writeFileSync(join(root, '.ai', 'workflows', 'w1', '02c-craft.md'), '---\nschema: sdlc/v1\ntype: design-contract\nslug: w1\nscreens: [basket]\ndirection-confirmed-by: in-session\nimage-gate: pass\n---\n# Contract\n');
    assert.equal(designSettled(index, contractOf(root), []), false, 'a contract that names screens needs the approval of a script');
    assert.match(designGateRefusal({ index, hasBrief: false, contract: contractOf(root), slug: 'w1', missingBoards: [] }), /no approval is recorded/);

    const none = await approveDesign(root, 'w1', { browser: null });
    assert.deepEqual([none.ok, none.question], [false, approvalQuestion('w1')]);
    answer(root, 'w1', 'Adjust', '2026-10-25T10:00:00Z');
    assert.match((await approveDesign(root, 'w1', { browser: null })).reason, /answered: Adjust/);

    answer(root, 'w1', 'Approve', '2026-10-25T10:05:00Z');
    const r = await approveDesign(root, 'w1', { browser: null, now: new Date('2026-10-25T10:06:00Z') });
    assert.equal(r.ok, true, r.reason);
    assert.deepEqual([r.screens, r.committed, r.pictures], [['basket'], true, 0]);
    const log = execFileSync('git', ['-C', root, 'log', '--format=%s'], { encoding: 'utf8' }).trim().split('\n');
    assert.deepEqual(log, ['design: record the approval of w1', 'design: approve basket for w1']);
    const files = execFileSync('git', ['-C', root, 'show', '--name-only', '--format=', r.commit], { encoding: 'utf8' }).trim().split('\n').sort();
    assert.deepEqual(files, ['.ai/design/screens.json', '.ai/design/screens/basket.html', '.ai/design/tokens.css'], 'only the surface, never the ignored records');
    assert.equal(readManifest(root).screens.basket.approvals[0].commit, r.commit);
    const c = contractOf(root);
    assert.deepEqual([c['direction-confirmed-by'], c['approval-commit'], c['answered-at'], c['screens']], ['answer-event', r.commit, '2026-10-25T10:05:00.000Z', ['basket']]);
    assert.match(c['image-gate'], /^skipped:no browser/);
    assert.equal(designSettled(index, c, missingDesignFiles(root, join(root, '.ai', 'workflows', 'w1'), c)), true);

    assert.match((await approveDesign(root, 'w1', { browser: null })).reason, /no new answer event/, 'one answer approves once');
    rmSync(screenFile(root, 'basket'));
    assert.deepEqual(missingDesignFiles(root, join(root, '.ai', 'workflows', 'w1'), c), ['.ai/design/screens/basket.html']);
    assert.equal(designSettled(index, c, missingDesignFiles(root, join(root, '.ai', 'workflows', 'w1'), c)), false, 'a missing approved screen unsettles the design');
  } finally { done(); }
});

const browser = checkBrowser(process.cwd());
test('in a browser: each check finds its fault with a box and a move, and the approval stores pictures', { skip: browser ? false : 'no Chromium on this machine' }, async () => {
  const { root, done } = project();
  try {
    const r = await runChecks(root, { now: new Date('2026-10-25T09:00:00Z') });
    assert.equal(r.ran, true);
    const kinds = new Set(r.failures.map((f) => f.check));
    for (const k of ['contrast', 'target-size', 'worst-case']) assert.ok(kinds.has(k), `${k} is found`);
    const contrast = r.failures.find((f) => f.check === 'contrast');
    assert.equal(contrast.move, CHECK_MOVES.contrast);
    assert.match(contrast.message, /#cccccc on #ffffff/);
    assert.ok(contrast.rect.width > 0 && contrast.rect.height > 0);
    assert.ok(r.failures.filter((f) => f.check === 'worst-case').every((f) => f.state === 'worst'));
    assert.equal(readChecks(root).failures.length, r.failures.length);

    writeFileSync(join(root, '.ai', 'workflows', 'w1', '02c-craft.md'), '---\nschema: sdlc/v1\ntype: design-contract\nslug: w1\n---\n# Contract\n');
    answer(root, 'w1', 'Approve', '2026-10-25T10:05:00Z');
    const a = await approveDesign(root, 'w1');
    assert.equal(a.ok, true, a.reason);
    assert.equal(a.pictures, 1);
    const png = readFileSync(approvalPicture(root, a.commit, 'basket'));
    assert.equal(png.readUInt32BE(0), 0x89504e47);
    assert.equal(contractOf(root)['image-gate'], 'pass');
    assert.equal(contractOf(root)['check-failures'], r.failures.length);
    assert.ok(existsSync(approvalPicture(root, a.commit, 'basket')));
  } finally { done(); }
});
