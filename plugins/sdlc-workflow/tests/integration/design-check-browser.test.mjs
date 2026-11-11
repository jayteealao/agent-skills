// The screen check in a real browser: each kind of failure, the faults that it must find, and the
// good pages that it must leave alone. One run of the check reads every screen of the fixture;
// the tests read its result. With no Chromium on the computer the browser tests skip.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { MAX_PLACES, checkBrowser, failureGroups, runChecks } from '../../lib/design-check.mjs';
import { runDesign } from '../../lib/design-cli.mjs';
import { addComponent } from '../../lib/design-components.mjs';
import { readChecks } from '../../lib/design-records.mjs';
import { addScreen, initSurface, screenFile, setViewports, surfaceDir, writeTokens } from '../../lib/design-surface.mjs';

const DESIGN = '# Design\n\n## Colors\n\n| Role | Token | Value | Used for |\n|---|---|---|---|\n| ground | | #ffffff | page |\n| text | | #111111 | body |\n| accent | | #0055cc | actions |\n| muted | | #999999 | hints |\n';
const SHEET = [
  '[data-component="btn"] { background: var(--accent); color: var(--ground); border: 0; padding: 10px 16px; min-height: 44px; min-width: 44px; }',
  '[data-component="btn"]:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }',
  '[data-component="link"] { display: inline-block; min-height: 44px; line-height: 44px; }',
  '[data-component="link"]:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }',
  '[data-component="field"] { color: var(--text); background: var(--ground); border: 1px solid var(--text); min-height: 44px; }',
  '[data-component="field"]:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }',
  '[data-component="check"]:focus-visible + span { outline: 3px solid var(--accent); }',
  // A small mark with a hit area of 44 px around it.
  '[data-component="dot"] { position: relative; display: inline-block; width: 16px; height: 16px; margin: 14px; background: var(--accent); }',
  '[data-component="dot"]::after { content: ""; position: absolute; inset: -14px; }',
  '[data-component="dot"]:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }',
].join('\n');
const STATES = ['default', 'empty', 'loading', 'error', 'worst'];

/** A screen page: the two sheets, the state switch, `head` and one section for each state. */
function page(key, { head = '', sections = {}, only = STATES } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="wf:screen" content="${key}"><title>${key}</title>
<link rel="stylesheet" href="../tokens.css"><link rel="stylesheet" href="../layout.css"><link rel="stylesheet" href="../components.css">
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:var(--ground);color:var(--text)} body [data-state]{display:none}
${STATES.map((s) => `html[data-state="${s}"] [data-state~="${s}"]`).join(',')}{display:block}</style>
<script>document.documentElement.dataset.state=new URLSearchParams(location.search).get("state")||"default";</script>
${head}</head><body><main>
${only.map((s) => `<section data-state="${s}">${sections[s] ?? `<p>${s}</p>`}</section>`).join('\n')}
</main></body></html>`;
}

const rows = (n, cls) => Array.from({ length: n }, (_, i) => `<p class="${cls}">row ${i + 1}</p>`).join('');

const SCREENS = {
  // One fault of each kind.
  kinds: page('kinds', {
    head: '<link rel="stylesheet" href="gone.css"><style>.low{color:var(--muted)}.raw{color:#aa0000}#tiny{display:inline-block;width:8px;height:8px}.pile{position:relative;height:40px}.pile p{position:absolute;left:0;margin:0}</style>',
    sections: {
      default: '<p class="low">A hint in the muted colour</p><p class="raw">A raw colour</p>'
        + '<a id="tiny" href="#x" data-component="link" style="min-height:0;line-height:0"></a>'
        + '<div style="width:900px;height:10px"></div>'
        + '<img src="nope.png" alt="A picture"><p>undefined</p>'
        + '<div class="pile"><p style="top:0">First overlapping text here</p><p style="top:4px">Second overlapping text here</p></div>'
        + '<button id="nofocus" data-component="btn" style="outline:none">Go</button>'
        + '<button>Plain</button><div data-component="ghost">ghost</div>'
        + '<script>missingFunction()</script><script>alert("hello")</script>',
      worst: '<div style="width:100px;height:20px;overflow:hidden;white-space:nowrap">A very long text that this small box cuts off for sure</div>',
    },
  }),
  // A page with only its default state, and no style rule that names another one.
  bare: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>bare</title><link rel="stylesheet" href="../tokens.css"><link rel="stylesheet" href="../components.css"></head><body><main><section data-state="default"><p>Only one state</p></section></main></body></html>',
  // Good pages that the check must leave alone.
  clean: page('clean', {
    head: '<style>*{margin:0;padding:0;box-sizing:border-box}button,input{font:inherit}'
      + '.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}'
      + '#nav{position:fixed;left:0;right:0;bottom:0;height:56px;background:var(--ground)}'
      + '.ico rect{fill:url(#add)}#lst p{height:60px}#box{height:60px;overflow:auto}</style>',
    sections: {
      default: '<h1>Clean</h1>'
        + '<p><a href="#a" data-component="dot" aria-label="Add"></a></p>'
        + '<label style="display:inline-block;min-height:44px;line-height:44px"><input class="sr" type="checkbox" data-component="check"><span>Accept the terms and conditions</span></label>'
        + '<span class="sr">A long label that only a screen reader reads, longer than its box</span>'
        + '<p><input data-component="field" style="width:120px" value="a very very very very very very very very very long value"></p>'
        + '<p><a href="#more" data-component="link">More with the colours of the browser</a></p>'
        + '<svg class="ico" width="24" height="24" aria-hidden="true"><defs><linearGradient id="add"><stop offset="0" stop-color="currentColor"/></linearGradient></defs><rect width="24" height="24"/></svg>'
        + `<div id="box">${rows(6, 'in')}</div><div id="lst">${rows(20, 'r')}</div>`
        + '<nav id="nav"><span>Home tab</span> <span>Search tab</span></nav>'
        + '<dialog open><p>A dialog that lies over the page</p></dialog>',
    },
  }),
  // Faults that hide: in a shorthand, behind a gradient, in an opacity, in a linked sheet, in another state.
  hidden: page('hidden', {
    head: '<link rel="stylesheet" href="extra.css"><style>#sh{background:var(--my-foreign)}'
      + '#grad{background-image:linear-gradient(var(--ground),var(--ground));color:var(--ground)}#faded{opacity:.15}'
      + '#pic{background-image:url(bg.png)}.banner{background:#ffeeee;color:#cc0000}</style>',
    sections: {
      default: '<p id="sh">A shorthand with a property that is no token</p><p id="grad">White text on a white gradient</p><p id="faded">Text that is nearly gone</p>'
        + '<p class="linked">A raw colour from a linked sheet</p><p id="pic">Text over a picture</p>'
        + '<p><input data-component="field" placeholder="Search" class="ph"></p>',
      error: '<p class="banner">Something failed</p><button id="retry" data-component="btn" style="outline:none">Retry</button>',
    },
  }),
  // One fault 40 times, and one other fault.
  many: page('many', {
    head: '<style>.m{color:var(--muted);margin:0}#tiny{display:inline-block;width:8px;height:8px;min-height:0;line-height:0}</style>',
    sections: { default: `${rows(40, 'm')}<a id="tiny" href="#x" data-component="link"></a>` },
  }),
};

let world = null;
let result = null;
const browser = checkBrowser(process.cwd());
const skip = browser ? false : 'no Chromium on this computer';
const of = (screen, check) => result.new.filter((f) => f.screen === screen && (!check || f.check === check));
const messages = (screen, check) => of(screen, check).map((f) => f.message).join(' | ');

before(async () => {
  const top = mkdtempSync(join(tmpdir(), 'design-check-browser-'));
  const root = join(top, 'Shop');
  mkdirSync(join(root, '.ai', 'workflows', 'w1'), { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  writeFileSync(join(root, '.gitignore'), '.ai/\n');
  writeFileSync(join(root, '.ai', 'workflows', 'w1', '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: w1\nstatus: in-progress\nux-impact: visual\n---\n');
  writeFileSync(join(root, 'DESIGN.md'), DESIGN);
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  initSurface(root);
  writeTokens(root);
  setViewports(root, { phone: '375x812', desktop: '1280x800' });
  for (const key of ['btn', 'link', 'field', 'check', 'dot']) addComponent(root, key);
  writeFileSync(join(surfaceDir(root), 'components.css'), `${SHEET}\n.ph::placeholder { color: var(--ground); }\n`);
  // A server that takes a connection and never answers: the page that waits for it never ends its load.
  const sockets = new Set();
  const silent = createServer((s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); s.on('error', () => {}); });
  await new Promise((ok) => silent.listen(0, '127.0.0.1', ok));
  const screens = { ...SCREENS, hang: page('hang', { head: `<script src="http://127.0.0.1:${silent.address().port}/never.js"></script>` }) };
  for (const [key, html] of Object.entries(screens)) {
    addScreen(root, key, { workflow: 'w1' });
    writeFileSync(screenFile(root, key), html);
  }
  writeFileSync(join(surfaceDir(root), 'screens', 'extra.css'), '.linked{color:#ff00ff}\n');
  writeFileSync(join(surfaceDir(root), 'screens', 'bg.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  world = {
    root,
    done: () => {
      for (const s of sockets) s.destroy();
      silent.close();
      if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
      rmSync(top, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    },
  };
  if (browser) result = await runChecks(root, { workflow: 'w1', loadMs: 2500 });
});

after(() => world?.done());

test('the run reads every screen, and a page that does not load fails that screen only', { skip }, () => {
  assert.equal(result.ran, true, result.reason);
  assert.equal(result.ok, false);
  assert.deepEqual([...result.checked].sort(), ['bare', 'clean', 'hang', 'hidden', 'kinds', 'many']);
  const load = of('hang', 'load');
  assert.ok(load.length >= 1, 'the page that waits is a failure of its screen');
  assert.match(load[0].message, /^The page did not finish loading in 2\.5 s: it waits for http:\/\/127\.0\.0\.1:\d+\/never\.js/);
  assert.equal(load[0].move, null);
  assert.ok(load[0].do, 'a failure with no move says what to do');
  assert.ok(of('kinds').length > 0 && of('many').length > 0, 'the run went on to the other screens');
});

test('each kind of failure is found, with its move or what to do', { skip }, () => {
  const has = (check, re, move) => {
    const found = of('kinds', check).filter((f) => re.test(f.message));
    assert.ok(found.length, `${check} ${re}: ${messages('kinds', check)}`);
    assert.equal(found[0].move, move, `${check} goes to ${move}`);
    if (!move) assert.ok(found[0].do, `${check} says what to do`);
  };
  has('contrast', /The text #999999 on #ffffff is 2\.85:1/, 'colorize');
  has('token', /The color #aa0000 of \.raw is not a token/, 'colorize');
  has('target-size', /The target is 8×8 px/, 'harden');
  has('viewport-fit', /past the 375 px viewport/, 'layout');
  has('display', /The image nope\.png does not load/, 'harden');
  has('display', /The text shows "undefined"/, 'harden');
  has('overlap', /overlaps the text/, 'layout');
  has('focus', /The button shows no focus indicator/, 'harden');
  has('worst-case', /The content is cut off/, 'harden');
  has('component', /The library has no component ghost/, null);
  has('component', /A button of this page is not a component of the library/, null);
  has('script', /The page script fails: .*missingFunction/, null);
  has('script', /The page opens a dialog at load: "hello"\. The check closed it/, null);
  has('resource', /The file screens\/gone\.css does not load/, null);
  assert.match(messages('bare', 'states'), /The page has no empty, loading, error, worst state/);
  assert.ok(of('kinds', 'viewport-fit').every((f) => f.viewport === 'phone'), 'the wide element fits the desktop');
  assert.ok(of('kinds', 'worst-case').every((f) => f.state === 'worst'));
});

test('a good page has no failure: hit areas, hidden inputs, reader text, fixed bars, resets, URLs and browser colours', { skip }, () => {
  assert.deepEqual(of('clean').map((f) => `${f.check} (${f.viewport}; ${f.state}): ${f.message}`), []);
});

test('the faults that hide are found: shorthands, gradients, opacity, linked sheets, other states, placeholders', { skip }, () => {
  assert.match(messages('hidden', 'token'), /The background of #sh uses the custom property --my-foreign, which is not a token/);
  assert.match(messages('hidden', 'token'), /The color #ff00ff of \.linked is not a token/);
  assert.match(messages('hidden', 'token'), /The color #cc0000 of \.banner is not a token/, 'a rule whose element shows only in the error state');
  assert.match(messages('hidden', 'contrast'), /The text #ffffff on #ffffff is 1\.00:1/, 'text on a gradient of its own colour');
  assert.match(messages('hidden', 'contrast'), /The text #dbdbdb on #ffffff is 1\.3\d:1/, 'the opacity of the element counts');
  assert.match(messages('hidden', 'contrast'), /The placeholder text #ffffff on #ffffff is 1\.00:1/);
  const ring = of('hidden', 'focus').filter((f) => /The button shows no focus indicator/.test(f.message));
  assert.deepEqual([...new Set(ring.map((f) => f.state))], ['error'], 'a control that only the error state shows');
  assert.deepEqual([...new Set(ring.map((f) => f.viewport))].sort(), ['desktop', 'phone'], 'the interaction checks run in every viewport');
  const notice = result.notices.find((n) => n.kind === 'contrast-over-image' && n.screen === 'hidden');
  assert.ok(notice, JSON.stringify(result.notices));
  assert.match(notice.message, /^not measured: text over an image \(1 element\(s\)\)/);
  assert.ok(!of('hidden', 'contrast').some((f) => /#pic/.test(f.selector ?? '')), 'text over a picture is a notice, not a failure');
});

test('one fault that repeats is capped by its check and counted, and the other checks stay', { skip }, () => {
  const contrast = of('many', 'contrast');
  assert.equal(contrast.length, MAX_PLACES * 2, 'five places for each of the two viewports');
  assert.equal(result.truncated.contrast, (40 - MAX_PLACES) * 2);
  assert.ok(of('many', 'target-size').length >= 1, 'the small target is not pushed out of the list');
  const group = failureGroups(contrast);
  assert.equal(group.length, 1);
  assert.deepEqual([group[0].viewports, group[0].move], [['phone', 'desktop'], 'colorize']);
});

test('the text and the JSON of the check agree: exit 1, the failures once, and one next action', { skip }, async () => {
  const lines = [];
  const code = await runDesign(['check', world.root, 'many'], { json: true }, (v) => lines.push(v));
  const r = lines.at(-1);
  assert.equal(code, 1);
  assert.deepEqual([r.ok, r.ran, r.passed, r.checked], [false, true, false, ['many']]);
  assert.ok(r.failures.length && r.groups.length && r.truncated.contrast > 0);
  assert.equal(r.next.step, 'fix');
  assert.ok(r.error && r.fix, 'a failed check carries its fix');
  assert.ok(r.kept.failures > 0, 'the failures of the screens that this run did not read stay in the record');
  const text = [];
  assert.equal(await runDesign(['check', world.root, 'many'], {}, (v) => text.push(v)), 1);
  const out = text.join('\n');
  assert.equal(out.match(/The text #999999 on #ffffff/g).length, 1, 'one line for one cause');
  assert.match(out, /not shown: \d+ more contrast failure\(s\)/);
  assert.ok(!/^ask: /m.test(out), 'no approval question while the check fails');
  assert.match(out.trim().split('\n').at(-1), /^(run|do|type): /, 'the last line is the one next action');
});

test('with no browser the check runs what it can, says why, and fails with a fix for the person', async () => {
  const r = await runChecks(world.root, { keys: ['bare'], browser: null });
  assert.deepEqual([r.ok, r.ran], [false, false]);
  assert.match(r.reason, /no browser can run the checks/);
  assert.equal(r.fix.who, 'person');
  assert.match(r.new.map((f) => f.message).join('|'), /The page has no empty, loading, error, worst state/);
  await assert.rejects(runChecks(world.root, { keys: ['nope'], browser: null }), (e) => /no screen nope/.test(e.message) && /kinds/.test(JSON.stringify(e.fix)), 'an unknown key is refused with the screens that exist');
});

test('the record drops the failures of a screen that left the manifest', { skip }, async () => {
  assert.ok(readChecks(world.root).failures.some((f) => f.screen === 'bare'));
  const lines = [];
  assert.equal(await runDesign(['screen', 'remove', world.root, 'bare'], { json: true }, (v) => lines.push(v)), 0, JSON.stringify(lines.at(-1)));
  const r = await runChecks(world.root, { keys: ['clean'] });
  const stored = readChecks(world.root);
  assert.ok(!stored.failures.some((f) => f.screen === 'bare'), 'no failure of a screen that is gone');
  assert.ok(!(stored.screens ?? []).includes('bare'));
  assert.ok(!r.failures.some((f) => f.screen === 'bare'));
});

test('the system check: every kind of token, the own tokens of a page, a var() of no token, look-alikes, undeclared variants, repeated rules and the library lint', { skip }, async () => {
  const top = mkdtempSync(join(tmpdir(), 'design-check-system-'));
  const root = join(top, 'Shop');
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  try {
    mkdirSync(join(root, '.ai', 'workflows', 'w1'), { recursive: true });
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, '.gitignore'), '.ai/\n');
    writeFileSync(join(root, 'DESIGN.md'), [
      '# Design', '', '## Colors', '', '| Role | Value | Used for |', '|---|---|---|', '| ground | #ffffff | page |', '| text | #111111 | body |', '| accent | #0055cc | actions |', '',
      '## Typography', '', '| Role | Value | Used for |', '|---|---|---|', '| font-body | system-ui, sans-serif | body |', '| text-body | 16px | body |', '',
      '## Layout', '', '| Role | Value | Used for |', '|---|---|---|', '| space-1 | 4px | tight |', '| space-2 | 8px | default |', '| space-3 | 16px | loose |', '| size-target | 44px | targets |', '| z-overlay | 100 | overlays |', '',
      '## Shapes', '', '| Role | Value | Used for |', '|---|---|---|', '| radius-1 | 4px | controls |', '',
    ].join('\n'));
    initSurface(root);
    writeTokens(root);
    setViewports(root, { phone: '375x812' });
    addComponent(root, 'btn');
    addComponent(root, 'card');
    rmSync(join(surfaceDir(root), 'components', 'card.html'));
    writeFileSync(join(surfaceDir(root), 'components', 'btn.html'), '<!doctype html><html><head><meta name="wf:component" content="btn"><meta name="wf:kind" content="component">'
      + '<meta name="wf:variants" content="tone=solid|ghost"><meta name="wf:states" content="default"></head><body><section data-theme="default" data-theme-source>'
      + '<div data-spec="tone=solid"><span data-component="btn" data-variant="tone=solid">A</span></div><div data-spec="tone=ghost"><span data-component="btn" data-variant="tone=ghost">B</span></div></section></body></html>');
    writeFileSync(join(surfaceDir(root), 'components.css'), [
      '.btn { color: var(--ground); background: var(--accent); padding: var(--space-2) var(--space-3); border-radius: var(--radius-1); --btn-ink: var(--ground); }',
      '/* a card with a raw padding and a raw custom property */',
      '.card { padding: 12px; --card-edge: #dddddd; }',
    ].join('\n'));
    const states = ['default', 'empty', 'loading', 'error', 'worst'];
    const mini = (key, { style = '', body = '', script = '', sheets = ['tokens', 'layout', 'components'] } = {}) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${key}</title>
${sheets.map((s) => `<link rel="stylesheet" href="../${s}.css">`).join('')}
<style>body{margin:0;font-family:var(--font-body);font-size:var(--text-body);background:var(--ground);color:var(--text)} body [data-state]{display:none}
${states.map((s) => `html[data-state="${s}"] [data-state~="${s}"]`).join(',')}{display:block} .wrap{display:flex} ${style}</style>
<script>document.documentElement.dataset.state=new URLSearchParams(location.search).get("state")||"default";${script}</script></head><body><main>
${states.map((s) => `<section data-state="${s}"><div class="wrap">${s === 'default' ? body : `<p>${s}</p>`}</div></section>`).join('\n')}</main></body></html>`;
    const pages = {
      faults: mini('faults', {
        style: ':root{--ink:#111111} .wrap{gap:12px} .t{font-size:14px;font-family:Georgia, serif;color:var(--nope);z-index:50}'
          + ' .ok{padding:var(--space-2);margin:0 auto;width:100%;border-radius:1px;height:calc(100% - var(--space-1));transition-duration:200ms;--l-min:10rem;z-index:1}',
        // A script that makes an element with an inline style in the error state only.
        script: 'if(document.documentElement.dataset.state==="error")document.addEventListener("DOMContentLoaded",()=>{const d=document.createElement("div");d.id="late";d.style.marginTop="13px";d.textContent="Late";document.body.append(d)})',
        body: '<p class="t">Hi</p><p class="ok">Fine</p><span class="btn">Fake</span><span data-component="btn" data-variant="tone=loud">Loud</span><span data-component="btn" data-variant="tone=ghost">Ghost</span>',
      }),
      two: mini('two', { body: '<p>Two</p>' }),
      three: mini('three', { body: '<p>Three</p>' }),
      unlinked: mini('unlinked', { body: '<p>No layout sheet</p>', sheets: ['tokens', 'components'] }),
    };
    for (const [key, html] of Object.entries(pages)) {
      addScreen(root, key, { workflow: 'w1' });
      writeFileSync(screenFile(root, key), html);
    }
    const r = await runChecks(root, { workflow: 'w1', loadMs: 2500 });
    assert.equal(r.ran, true, r.reason);
    const msgs = (screen, check) => r.new.filter((f) => f.screen === screen && f.check === check).map((f) => f.message).join(' | ');
    const token = msgs('faults', 'token');
    assert.match(token, /The gap 12px of \.wrap is not a token; the nearest space token is --space-[23]/);
    assert.match(token, /The font-size 14px of \.t is not a token; the nearest font size token is --text-body \(16px\)/);
    assert.match(token, /The font-family Georgia, serif of \.t is not a token/);
    assert.match(token, /The page declares its own token --ink/);
    assert.match(token, /uses the custom property --nope, which is not a token/);
    assert.match(token, /The z-index 50 of \.t is not a token; the nearest layer token is --z-overlay \(100\)/);
    assert.ok(!/\.ok|--l-min|--btn-ink/.test(token), `the token values, the hairline, the keywords and the layout parameter pass: ${token}`);
    const space = r.new.find((f) => f.screen === 'faults' && f.check === 'token' && f.cause === '12px');
    assert.deepEqual([space.kind, space.move], ['space', 'layout']);
    // Every load is scanned, and a rule that five states show is one failure, at the first state.
    const gaps = r.new.filter((f) => f.screen === 'faults' && f.check === 'token' && f.cause === '12px');
    assert.deepEqual(gaps.map((f) => f.state), ['default'], 'one failure for the rule .wrap');
    const late = r.new.filter((f) => f.screen === 'faults' && f.check === 'token' && f.cause === '13px');
    assert.deepEqual(late.map((f) => [f.state, f.selector]), [['error', '#late']], 'an inline style that a script sets in one state is checked');
    assert.equal(r.new.find((f) => f.cause === '14px')?.move, 'typeset');
    assert.ok(r.notices.some((n) => n.kind === 'no-motion-token' && n.screen === 'faults'), 'a raw duration with no motion token is a notice');
    const component = msgs('faults', 'component');
    assert.match(component, /A hand-built look-alike of btn: mark it data-component="btn"/);
    assert.match(component, /The btn names the variant tone=loud, which its spec \(wf:variants\) does not declare/);
    assert.ok(!/tone=ghost/.test(component), 'a declared variant passes');
    for (const key of ['faults', 'two', 'three', 'unlinked']) assert.match(msgs(key, 'layout'), /The rule \.wrap is repeated in 4 screens/);
    assert.match(msgs('unlinked', 'layout'), /The page does not link layout\.css/);
    assert.equal(msgs('two', 'token'), '', 'a page of tokens only has no token failure');
    const lib = r.library.map((i) => `${i.component}|${i.cause}|${i.message}`).join('\n');
    assert.match(lib, /card\|12px\|The padding 12px of \.card in components\.css is not a token/);
    assert.match(lib, /card\|custom:--card-edge\|/);
    assert.match(lib, /card\|no-page:card\|/);
    assert.ok(!/btn\|/.test(lib), `the button with its spec and its token values passes: ${lib}`);
    assert.equal(r.passed, false);
    assert.equal(readChecks(root).library.length, r.library.length, 'the record keeps the library lint');
  } finally {
    if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved;
    rmSync(top, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
