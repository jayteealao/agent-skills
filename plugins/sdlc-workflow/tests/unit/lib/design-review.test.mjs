// The review of the screens by reviewer agents: the packets of the screens changed since the last
// review, the threads that a reviewer posts (once per finding), the stamp, and the mark of a
// review thread on the canvas.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addScreen, initSurface, screenFile } from '../../../lib/design-surface.mjs';
import { addComponent, componentFile } from '../../../lib/design-components.mjs';
import { addComment, readComments, readReviewStamp, reviewPacketsDir, writeChecks } from '../../../lib/design-records.mjs';
import { REVIEW_RULES, reviewDone, reviewPack, reviewState } from '../../../lib/design-review.mjs';
import { runDesign } from '../../../lib/design-cli.mjs';

function repo() {
  const top = mkdtempSync(join(tmpdir(), 'design-review-'));
  const root = join(top, 'Shop');
  mkdirSync(join(root, '.ai', 'workflows', 'w1'), { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  writeFileSync(join(root, '.ai', 'workflows', 'w1', '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: w1\nstatus: in-progress\n---\n');
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  return { root, done: () => { if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved; rmSync(top, { recursive: true, force: true }); } };
}

const page = (body) => `<!doctype html><html><head><link rel="stylesheet" href="../tokens.css"></head><body><section data-state="default">${body}</section><section data-state="empty"><p>Nothing yet</p></section></body></html>`;

/** A surface with four drawn screens of w1, one in template state, and the component button. */
function surface() {
  const r = repo();
  initSurface(r.root);
  addComponent(r.root, 'button', { title: 'Button' });
  for (const k of ['basket', 'pay', 'done', 'help']) {
    addScreen(r.root, k, { workflow: 'w1' });
    writeFileSync(screenFile(r.root, k), page(`<p>${k}</p><button data-component="button" data-variant="tone=solid">Go</button>`));
  }
  addScreen(r.root, 'blank', { workflow: 'w1' });
  return r;
}

const json = async (pos, opt) => { const lines = []; const code = await runDesign(pos, { json: true, ...opt }, (v) => lines.push(v)); return { code, out: lines.at(-1) }; };

test('review-pack writes a packet per batch of the changed drawn screens, with what a reviewer reads', () => {
  const { root, done } = surface();
  try {
    writeChecks(root, { at: new Date().toISOString(), ran: true, screens: ['basket'], failures: [
      { screen: 'basket', viewport: 'phone', state: 'default', check: 'contrast', message: 'low', selector: 'p' },
      { screen: 'basket', viewport: 'desktop', state: 'default', check: 'contrast', message: 'low', selector: 'p' },
    ] });
    addComment(root, 'basket', { text: 'Bigger total', author: 'po', anchor: { selector: '.total' } });
    const r = reviewPack(root, 'w1');
    assert.equal(r.nothing, false);
    assert.deepEqual(r.screens.sort(), ['basket', 'done', 'help', 'pay'], 'the screen that holds the template is left out');
    assert.equal(r.packets.length, 2, 'three screens per packet');
    const p = JSON.parse(readFileSync(r.packets[0], 'utf8'));
    assert.deepEqual(Object.keys(p).sort(), ['at', 'componentsCss', 'layout', 'library', 'packet', 'post', 'rules', 'schema', 'screens', 'slug', 'tokens', 'viewports']);
    assert.equal(p.screens.length, 3);
    assert.equal(p.rules, REVIEW_RULES);
    assert.match(p.post, /^wf\.mjs design comments add .* <key> --author review:<model> --selector/);
    assert.ok(p.tokens.endsWith('tokens.json') && p.layout.endsWith('layout.css') && p.componentsCss.endsWith('components.css'));
    const basket = [...p.screens, ...JSON.parse(readFileSync(r.packets[1], 'utf8')).screens].find((s) => s.key === 'basket');
    assert.equal(resolve(basket.file), resolve(screenFile(root, 'basket')));
    assert.deepEqual(basket.states, ['default', 'empty']);
    assert.deepEqual(basket.components.map((c) => [c.key, c.inLibrary, resolve(c.page)]), [['button', true, resolve(componentFile(root, 'button'))]]);
    assert.ok(basket.components[0].spec && 'variants' in basket.components[0].spec);
    assert.deepEqual(basket.failures, [{ check: 'contrast', message: 'low', selector: 'p' }], 'one failure per element, not per viewport');
    assert.deepEqual(basket.openThreads.map((t) => [t.author, t.text, t.selector]), [['po', 'Bigger total', '.total']]);
    assert.match(basket.fingerprint, /^[0-9a-f]{16}$/);
    assert.ok(REVIEW_RULES.split('\n').length <= 40, 'the rules stay short');
    assert.throws(() => reviewPack(root, 'w1', { size: 0 }), /--size 0/);
    assert.equal(reviewPack(root, 'w1', { size: 10 }).packets.length, 1);
  } finally { done(); }
});

test('review-done stamps the screens of the packets; the next pack takes only what changed since', () => {
  const { root, done } = surface();
  try {
    assert.deepEqual(reviewState(root, 'w1').changed.sort(), ['basket', 'done', 'help', 'pay']);
    const packed = reviewPack(root, 'w1', { now: new Date(Date.now() - 1000) });
    addComment(root, 'pay', { text: 'Token role: the card uses --text as background.', author: 'review:sonnet', anchor: { selector: '.card' } });
    addComment(root, 'pay', { text: 'A person', author: 'po' });
    // A page changes while the reviewers read: the stamp keeps what they read, so it is reviewed again.
    writeFileSync(screenFile(root, 'help'), page('<p>help, changed</p>'));
    const r = reviewDone(root, 'w1', { packets: packed.packets });
    assert.deepEqual([r.screens.length, r.packets, r.added, r.byScreen.pay], [4, 2, 1, 1]);
    assert.equal(existsSync(reviewPacketsDir(root, 'w1')), false, 'the packets go after the review');
    const stamp = readReviewStamp(root, 'w1');
    assert.deepEqual([Object.keys(stamp.screens).length, stamp.added, stamp.history.length], [4, 1, 1]);
    assert.deepEqual(reviewState(root, 'w1').changed, ['help']);
    const again = reviewPack(root, 'w1');
    assert.deepEqual(again.screens, ['help']);
    reviewDone(root, 'w1');
    assert.deepEqual(reviewState(root, 'w1').changed, []);
    assert.deepEqual(reviewPack(root, 'w1'), { ok: true, slug: 'w1', nothing: true, packets: [], screens: [] });
    // With no packet and no pack, the screens changed now are stamped: a review with no team.
    writeFileSync(screenFile(root, 'done'), page('<p>done, changed</p>'));
    assert.deepEqual(reviewDone(root, 'w1').screens, ['done']);
    assert.throws(() => reviewDone(root, 'w1', { packets: [screenFile(root, 'done')] }), /no review packet of w1/);
  } finally { done(); }
});

test('comments add opens a thread for an agent only, once per finding', async () => {
  const { root, done } = surface();
  try {
    const add = (opt) => json(['comments', 'add', root, 'basket'], opt);
    const finding = { author: 'review:sonnet', selector: '.total', state: 'empty', viewport: 'phone', label: 'the total', text: 'Spacing: the total sits 8px from the list; use --space-4 as its twins do.' };
    const first = await add(finding);
    assert.equal(first.code, 0, JSON.stringify(first.out));
    assert.equal(first.out.duplicate, false);
    assert.deepEqual(first.out.thread.anchor, { selector: '.total', x: null, y: null, state: 'empty', viewport: 'phone', label: 'the total' });
    const same = await add({ ...finding, text: '  spacing: THE total sits 8px from the list;   use --space-4 as its twins do. ' });
    assert.deepEqual([same.code, same.out.duplicate, same.out.thread.id], [0, true, first.out.thread.id]);
    assert.equal((await add({ ...finding, selector: '.list' })).out.duplicate, false, 'another element is another finding');
    assert.equal((await add({ ...finding, author: 'review:haiku' })).out.duplicate, false, 'another reviewer is another thread');
    assert.equal(readComments(root, 'basket').threads.length, 3);
    // A resolved thread does not hold the finding back.
    await json(['comments', 'reply', root, 'basket', first.out.thread.id], { text: 'Fixed', resolve: true });
    assert.equal((await add(finding)).out.duplicate, false);
    for (const [opt, re] of [[{ ...finding, author: 'po' }, /is no agent/], [{ ...finding, author: true }, /is no agent/], [{ ...finding, text: ' ' }, /empty/],
      [{ ...finding, state: 'hover' }, /no state of a screen/], [{ ...finding, viewport: 'watch' }, /no viewport/]]) {
      const r = await add(opt);
      assert.equal(r.code, 1, JSON.stringify(opt));
      assert.match(r.out.error, re);
      assert.equal(r.out.fix.who, 'agent');
    }
    assert.equal((await add({ ...finding, author: 'agent', text: 'An agent note' })).code, 0);
    assert.equal((await json(['comments', 'add', root, 'nope'], finding)).code, 1);
  } finally { done(); }
});

test('the CLI packs, stamps and prints nothing to review when nothing changed', async () => {
  const { root, done } = surface();
  try {
    const pack = await json(['review-pack', root, 'w1'], { size: '2' });
    assert.equal(pack.code, 0);
    assert.equal(pack.out.packets.length, 2);
    const lines = [];
    await runDesign(['review-done', root, 'w1'], { packet: pack.out.packets[0] }, (v) => lines.push(v));
    assert.match(lines.join('\n'), /review of w1: 2 screen\(s\) read, 0 thread\(s\) added/);
    const doneAll = await json(['review-done', root, 'w1', pack.out.packets[1]], {});
    assert.equal(doneAll.code, 1, 'review-done deleted the packets: the second one is gone');
    await json(['review-done', root, 'w1'], {});
    const text = [];
    assert.equal(await runDesign(['review-pack', root, 'w1'], {}, (v) => text.push(v)), 0);
    assert.equal(text.join('\n'), 'review: nothing changed since the last review');
    assert.equal((await json(['review-pack', root, 'nope'], {})).code, 1);
  } finally { done(); }
});

test('the canvas marks a thread that a reviewer opened', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'skills', 'wf', 'canvas', 'canvas.js'), 'utf8');
  const context = vm.createContext({ URLSearchParams });
  vm.runInContext(src, context);
  const L = context.WF_CANVAS_LOGIC;
  assert.equal(L.reviewMark({ comments: [{ author: 'review:sonnet', text: 'x' }, { author: 'agent', text: 'fixed' }] }), 'Review');
  assert.equal(L.reviewMark({ comments: [{ author: 'po', text: 'x' }, { author: 'review:sonnet', text: 'y' }] }), null);
  assert.equal(L.reviewMark({}), null);
});
