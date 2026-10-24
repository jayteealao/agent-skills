// DESIGN-BOARDS-PLAN W1 + W2: the board rules (lib/design-boards.mjs) and the board
// tool (scripts/design-boards.mjs). The tool runs as a child process with a test
// double for the browser (SDLC_BROWSER=<file>.mjs), so no real browser is needed.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepEqual, equal, match, ok, throws } from 'node:assert/strict';

import {
  ANSI_SCHEMES, BOARDS_SCHEMA, boardKey, canvasStale, capturePath, designModesOf, directionSketches, emptyManifest, ignoreAdvice, isBoardKey, isInsidePath,
  missingBoardFiles, needsPictures, parseBoardKey, parseViewport, renderAnsi, renderSheet, sketchAdvice, splitAnchor, validateManifest,
} from '../../../lib/design-boards.mjs';
import { createHash } from 'node:crypto';
import { validateFrontmatter, validateBrainstormBoard } from '../../../lib/schema-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const SCRIPT = join(PLUGIN_ROOT, 'scripts', 'design-boards.mjs');

// ── the rules ─────────────────────────────────────────────────────────────────

test('board keys: <surface>--<state>[--<viewport>]', () => {
  equal(boardKey({ surface: 'Squad List', state: 'default' }), 'squad-list--default');
  equal(boardKey({ surface: 'squad-list', state: 'sorted', viewport: 'phone' }), 'squad-list--sorted--phone');
  deepEqual(parseBoardKey('squad-list--sorted--phone'), { surface: 'squad-list', state: 'sorted', viewport: 'phone' });
  equal(parseBoardKey('01-squad-default'), null, 'the SoccerManager numbering is not a board key');
  equal(isBoardKey('a--b--c--d'), false);
  throws(() => boardKey({ surface: '', state: 'x' }));
  deepEqual(parseViewport('390x844'), { width: 390, height: 844 });
  equal(parseViewport('1280'), null);
  equal(capturePath('Squad Screens', 'squad-list--default'), 'design/captures/squad-screens/squad-list--default.png');
  throws(() => capturePath('s', 'not a key'));
});

test('needsPictures: visual and new-surface only', () => {
  equal(needsPictures({ 'ux-impact': 'visual' }), true);
  equal(needsPictures({ 'ux-impact': 'new-surface' }), true);
  equal(needsPictures({ 'ux-impact': 'flow' }), false);
  equal(needsPictures({}), false);
});

test('validateManifest: schema, keys, paths, viewports', () => {
  const m = emptyManifest('demo');
  deepEqual(validateManifest(m), []);
  m.boards.push({ key: 'cart--empty', surface: 'cart', state: 'empty', png: 'boards/cart--empty.png' });
  deepEqual(validateManifest(m), []);
  const bad = { ...m, schema: 'x', boards: [{ key: 'Cart', png: '../../../etc/passwd' }, { key: 'cart--empty', surface: 'cart', state: 'empty', viewport: 'tv', png: 'boards/a.png' }] };
  const errors = validateManifest(bad).join('\n');
  match(errors, /schema must be/);
  match(errors, /'Cart' is not/);
  match(errors, /leaves the design folder/);
  match(errors, /viewport 'tv' is not in viewports/);
  equal(isInsidePath('boards/a.png'), true);
  equal(isInsidePath('C:/x.png'), false);
  equal(isInsidePath('/x.png'), false);
});

test('missingBoardFiles: the check result', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-boards-'));
  try {
    const contract = { boards: 'design/r1/boards.json' };
    deepEqual(missingBoardFiles(dir, {}), [], 'no boards: keeps the old rule');
    deepEqual(missingBoardFiles(dir, contract), ['design/r1/boards.json']);
    mkdirSync(join(dir, 'design', 'r1', 'boards'), { recursive: true });
    const m = { ...emptyManifest('demo'), revision: 1, boards: [{ key: 'cart--empty', surface: 'cart', state: 'empty', png: 'boards/cart--empty.png' }] };
    writeFileSync(join(dir, 'design', 'r1', 'boards.json'), JSON.stringify(m));
    deepEqual(missingBoardFiles(dir, contract), ['design/r1/boards/cart--empty.png']);
    writeFileSync(join(dir, 'design', 'r1', 'boards', 'cart--empty.png'), 'x');
    deepEqual(missingBoardFiles(dir, contract), []);
    writeFileSync(join(dir, 'design', 'r1', 'boards.json'), JSON.stringify({ ...m, boards: [] }));
    match(missingBoardFiles(dir, contract)[0], /lists no board/);
    match(missingBoardFiles(dir, { boards: '../x/boards.json' })[0], /leaves the workflow folder/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('renderSheet: groups by surface, escapes text, and never links outside the folder', () => {
  const m = {
    ...emptyManifest('demo'), revision: 2,
    boards: [
      { key: 'cart--empty', surface: 'cart', state: 'empty', png: 'boards/cart--empty.png', caption: '<b>Cart</b>' },
      { key: 'cart--full', surface: 'cart', state: 'full', png: null, html: 'boards/cart--full.html', render: 'none — no browser' },
      { key: 'pay--error', surface: 'pay', state: 'error', png: '../../secret.png' },
    ],
    confirmed: [{ revision: 2, at: '2026-10-08T00:00:00Z', by: 'in-session', canvas: 'https://claude.ai/a/1', 'canvas-version': 4 }],
  };
  const html = renderSheet(m, { frozen: true });
  match(html, /<h2>cart<\/h2>/);
  match(html, /<h2>pay<\/h2>/);
  match(html, /&lt;b&gt;Cart&lt;\/b&gt;/);
  match(html, /No PNG: none — no browser/);
  match(html, /Revision 2 confirmed/);
  match(html, /href="https:\/\/claude\.ai\/a\/1">canvas<\/a> v4/);
  ok(!html.includes('../../secret.png'));
});

test('worst-case boards: <surface>--worst is a board key (DESIGN-CRAFT-PORT-PLAN C8)', () => {
  equal(boardKey({ surface: 'Squad List', state: 'worst' }), 'squad-list--worst');
  deepEqual(parseBoardKey('squad-list--worst--phone'), { surface: 'squad-list', state: 'worst', viewport: 'phone' });
  equal(capturePath('squad', 'squad-list--worst'), 'design/captures/squad/squad-list--worst.png');
});

test('directionSketches: one entry per direction-<name> file, sorted (C10)', () => {
  deepEqual(directionSketches(['direction-quiet.html', 'direction-quiet.png', 'direction-dense.html', 'idea-1.html', 'direction-.html', 'Direction-Bold.PNG']), [
    { name: 'bold', html: null, png: 'sketches/Direction-Bold.PNG' },
    { name: 'dense', html: 'sketches/direction-dense.html', png: null },
    { name: 'quiet', html: 'sketches/direction-quiet.html', png: 'sketches/direction-quiet.png' },
  ]);
  deepEqual(directionSketches(undefined), []);
});

test('renderSheet: the working sheet shows directions first; the frozen copy never does (C10)', () => {
  const m = { ...emptyManifest('demo'), boards: [{ key: 'cart--empty', surface: 'cart', state: 'empty', png: 'boards/cart--empty.png' }] };
  const directions = [{ name: 'quiet', html: 'sketches/direction-quiet.html', png: 'sketches/direction-quiet.png' }, { name: '<x>', html: null, png: null }];
  const working = renderSheet(m, { directions });
  match(working, /<h2>Directions<\/h2>/);
  ok(working.indexOf('<h2>Directions</h2>') < working.indexOf('<h2>cart</h2>'));
  match(working, /src="sketches\/direction-quiet\.png"/);
  match(working, /&lt;x&gt;/);
  ok(!renderSheet(m, { directions, frozen: true }).includes('Directions'));
  ok(!renderSheet(m).includes('Directions'));
});

test('ignoreAdvice: the D9 exception block for each way a repo ignores .ai/', () => {
  equal(ignoreAdvice(null, false).change, false);
  const star = ignoreAdvice('.ai/*');
  equal(star.style, 'star');
  match(star.block, /^!\.ai\/workflows\/\*\/design\/r\*\/$/m);
  equal(ignoreAdvice('.ai/**/*').style, 'globstar');
  const folder = ignoreAdvice('/.ai/');
  equal(folder.style, 'folder');
  equal(folder.replace, '.ai/*');
  equal(ignoreAdvice('.ai/workflows/').change, false);
});

// ── the tool ──────────────────────────────────────────────────────────────────

const FAKE_BROWSER = `
import { writeFileSync } from 'node:fs';
const arg = (k) => process.argv.find((a) => a.startsWith('--' + k + '='))?.split('=').slice(1).join('=');
if (process.env.FAKE_BROWSER_HANG) setInterval(() => {}, 1000);
else {
  const [w, h] = arg('window-size').split(',').map(Number);
  const b = Buffer.alloc(33);
  b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  writeFileSync(arg('screenshot'), b);
}
`;

function project() {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-boards-tool-'));
  mkdirSync(join(root, '.ai', 'workflows', 'demo', 'design', 'boards'), { recursive: true });
  writeFileSync(join(root, '.ai', 'workflows', 'demo', '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nux-impact: new-surface\n---\n');
  writeFileSync(join(root, 'fake-browser.mjs'), FAKE_BROWSER);
  return root;
}

function run(root, args, env = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, args[0], root, ...args.slice(1)], {
    encoding: 'utf8', env: { ...process.env, SDLC_BROWSER: join(root, 'fake-browser.mjs'), ...env },
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* the test reports stdout */ }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr };
}

const board = (root, key) => writeFileSync(join(root, '.ai', 'workflows', 'demo', 'design', 'boards', `${key}.html`), `<p>${key}</p>`);
const designFile = (root, rel) => join(root, '.ai', 'workflows', 'demo', 'design', ...rel.split('/'));

test('tool: init, render at each viewport, sheet, freeze, and a refused second freeze of the same revision', () => {
  const root = project();
  try {
    equal(run(root, ['init', 'demo', '--viewport', 'phone=390x844']).status, 0);
    board(root, 'cart--empty');
    board(root, 'cart--empty--phone');
    mkdirSync(designFile(root, 'sketches'), { recursive: true });
    writeFileSync(designFile(root, 'sketches/s3.html'), '<p>sketch</p>');
    const r = run(root, ['render', 'demo']);
    equal(r.status, 0, r.stdout);
    deepEqual(r.json.added, ['cart--empty', 'cart--empty--phone']);
    deepEqual(r.json.sketches, [{ sketch: 'sketches/s3.html', png: 'sketches/s3.png' }]);
    ok(existsSync(designFile(root, 'sketches/s3.png')), 'a sketch renders, but is not a board');
    deepEqual(r.json.rendered.map((x) => x.viewport), ['1280x800', '390x844']);
    ok(existsSync(designFile(root, 'boards/cart--empty.png')));
    ok(existsSync(designFile(root, 'index.html')));
    const m = JSON.parse(readFileSync(designFile(root, 'boards.json'), 'utf8'));
    equal(m.schema, BOARDS_SCHEMA);
    deepEqual(validateManifest(m), []);

    const f = run(root, ['freeze', 'demo', '--canvas', 'https://claude.ai/a/1', '--canvas-version', '3']);
    equal(f.status, 0, f.stdout);
    equal(f.json.boards, 'design/r1/boards.json');
    equal(f.json['north-star-mock'], 'design/r1/boards/cart--empty.png', 'the north star is at the main viewport');
    const frozen = JSON.parse(readFileSync(designFile(root, 'r1/boards.json'), 'utf8'));
    equal(frozen.revision, 1);
    equal(frozen.confirmed[0].canvas, 'https://claude.ai/a/1');
    ok(existsSync(designFile(root, 'r1/boards/cart--empty--phone.png')));
    ok(existsSync(designFile(root, 'r1/index.html')));

    // Freeze refuses to write over a revision: put r2/ in place by hand first.
    mkdirSync(designFile(root, 'r2'), { recursive: true });
    const again = run(root, ['freeze', 'demo']);
    equal(again.status, 1);
    match(again.json.error, /r2\/ exists; a frozen revision is never changed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tool: check reads 02c-craft.md boards: and lists missing files', () => {
  const root = project();
  try {
    board(root, 'cart--empty');
    run(root, ['render', 'demo']);
    run(root, ['freeze', 'demo']);
    const c = join(root, '.ai', 'workflows', 'demo', '02c-craft.md');
    equal(run(root, ['check', 'demo']).json.contract, false);
    writeFileSync(c, '---\nschema: sdlc/v1\ntype: design-contract\nimage-gate: pass\ndirection-confirmed-by: in-session\nboards: design/r1/boards.json\ndesign-revision: 1\n---\n');
    const good = run(root, ['check', 'demo']);
    equal(good.status, 0, good.stdout);
    deepEqual(good.json.missing, []);
    rmSync(designFile(root, 'r1/boards/cart--empty.png'));
    const bad = run(root, ['check', 'demo']);
    equal(bad.status, 1);
    deepEqual(bad.json.missing, ['design/r1/boards/cart--empty.png']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tool: no browser keeps the board as HTML and records why', () => {
  const root = project();
  try {
    board(root, 'cart--empty');
    const r = run(root, ['render', 'demo'], { SDLC_BROWSER: 'none' });
    equal(r.status, 0, r.stdout);
    equal(r.json.htmlOnly[0].key, 'cart--empty');
    const m = JSON.parse(readFileSync(designFile(root, 'boards.json'), 'utf8'));
    equal(m.boards[0].png, null);
    match(m.boards[0].render, /^none — SDLC_BROWSER=none/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tool: a browser that hangs is stopped after the timeout', () => {
  const root = project();
  try {
    board(root, 'cart--empty');
    const r = run(root, ['render', 'demo'], { FAKE_BROWSER_HANG: '1', SDLC_BROWSER_TIMEOUT_MS: '700' });
    equal(r.status, 0, r.stdout);
    match(r.json.htmlOnly[0].reason, /no PNG after 700 ms/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tool: capture-name and import', () => {
  const root = project();
  try {
    const c = run(root, ['capture-name', 'demo', 'cart-slice', 'cart--empty']);
    equal(c.json.path, 'design/captures/cart-slice/cart--empty.png');
    ok(existsSync(dirname(designFile(root, 'captures/cart-slice/cart--empty.png'))));
    mkdirSync(join(root, 'handoff'), { recursive: true });
    writeFileSync(join(root, 'handoff', 'screen.html'), '<p>x</p>');
    const i1 = run(root, ['import', 'demo', 'handoff']);
    equal(i1.json.dir, '.ai/workflows/demo/design/source/import-1');
    equal(run(root, ['import', 'demo', 'handoff']).json.dir, '.ai/workflows/demo/design/source/import-2');
    ok(existsSync(designFile(root, 'source/import-1/handoff/screen.html')));
    equal(run(root, ['render', 'nope']).json.ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tool: track writes the exception block that git honours', () => {
  const root = project();
  try {
    if (spawnSync('git', ['init', '-q', root]).status !== 0) return;
    writeFileSync(join(root, '.gitignore'), 'node_modules/\n.ai/\n');
    const dry = run(root, ['track']);
    equal(dry.json.style, 'folder');
    equal(dry.json.written, false);
    const w = run(root, ['track', '--write']);
    equal(w.status, 0, w.stdout);
    deepEqual(w.json.stillIgnored, []);
    const text = readFileSync(join(root, '.gitignore'), 'utf8');
    match(text, /^\.ai\/\*$/m);
    ok(!/^\.ai\/$/m.test(text));
    const ignored = (rel) => spawnSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', rel]).status === 0;
    equal(ignored('.ai/design/current.md'), false);
    equal(ignored('.ai/workflows/demo/design/r1/boards/a--b.png'), false);
    equal(ignored('.ai/workflows/demo/design/boards/a--b.png'), true);
    equal(ignored('.ai/workflows/demo/design/sketches/home.html'), false, 'WF-DESIGN-PLAN A5: the sketches are tracked');
    equal(ignored('.ai/workflows/demo/00-index.md'), true);
    equal(ignored('.ai/workflows/INDEX.md'), true);
    equal(run(root, ['track']).json.change, false, 'a second run finds nothing to change');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── WF-DESIGN-PLAN A5, A5b, A8 ───────────────────────────────────────────────

test('A5: the exception blocks track the sketches; an old block gets only the sketch lines', () => {
  match(ignoreAdvice('.ai/*').block, /^!\.ai\/workflows\/\*\/design\/sketches\/$/m);
  const glob = ignoreAdvice('.ai/**/*').block;
  match(glob, /^!\.ai\/workflows\/\*\/design\/sketches\/$/m);
  match(glob, /^!\.ai\/workflows\/\*\/design\/sketches\/\*\*$/m);
  const star = sketchAdvice('.ai/workflows/*/design/*');
  equal(star.change, true);
  equal(star.upgrade, true);
  ok(!/r\*/.test(star.block), 'the upgrade adds only the sketch lines');
  match(sketchAdvice('/.ai/**/*').block, /sketches\/\*\*$/m);
  equal(sketchAdvice(null).change, false);
  equal(sketchAdvice('design/').style, 'other');
  match(ignoreAdvice('.ai/workflows/').manual, /design\/sketches\//);
});

test('A5: track upgrades a repo with the block from before the sketches (change: true)', () => {
  const root = project();
  try {
    if (spawnSync('git', ['init', '-q', root]).status !== 0) return;
    const oldBlock = ['# old block', '!.ai/design/', '!.ai/workflows/', '.ai/workflows/*', '!.ai/workflows/*/', '.ai/workflows/*/*',
      '!.ai/workflows/*/design/', '.ai/workflows/*/design/*', '!.ai/workflows/*/design/r*/'].join('\n');
    writeFileSync(join(root, '.gitignore'), `node_modules/\n.ai/*\n${oldBlock}\n`);
    const ignored = (rel) => spawnSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', rel]).status === 0;
    equal(ignored('.ai/workflows/demo/design/sketches/home.html'), true, 'the old block ignores the sketches');
    const dry = run(root, ['track']);
    equal(dry.json.change, true, dry.stdout);
    equal(dry.json.upgrade, true);
    equal(dry.json.written, false);
    const w = run(root, ['track', '--write']);
    equal(w.status, 0, w.stdout);
    deepEqual(w.json.stillIgnored, []);
    equal(ignored('.ai/workflows/demo/design/sketches/home.html'), false);
    equal(ignored('.ai/workflows/demo/design/sketches/sheet.png'), false);
    equal(ignored('.ai/workflows/demo/design/boards/a--b.html'), true, 'design/boards/ stays ignored');
    equal(ignored('.ai/workflows/demo/design/r1/boards.json'), false);
    equal(run(root, ['track']).json.change, false, 'a second run finds nothing to change');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const hash = (text) => createHash('sha256').update(text).digest('hex');

test('A5b: canvasStale reports a changed file, a missing file and a foreign account', () => {
  const canvas = (sha, account = 'me') => ({ link: 'https://claude.ai/a/1', account, 'published-at': '2026-10-22T10:00:00Z', sha256: sha });
  const entries = [
    { kind: 'sketch', key: 'fresh', where: 'w', path: 'a.html', canvas: canvas(hash('a')), sha256: hash('a') },
    { kind: 'sketch', key: 'changed', where: 'w', path: 'b.html', canvas: canvas(hash('old')), sha256: hash('new') },
    { kind: 'sketch', key: 'gone', where: 'w', path: 'c.html', canvas: canvas(hash('c')), sha256: null },
    { kind: 'board', key: 'home--default', where: 'w', path: 'd.html', canvas: canvas(hash('d'), 'outlook'), sha256: hash('d') },
    { kind: 'sketch', key: 'no-canvas', where: 'w', path: 'e.html', canvas: null, sha256: hash('e') },
  ];
  deepEqual(canvasStale(entries).map((e) => [e.key, e.reasons]), [['changed', ['changed']], ['gone', ['missing-file']]]);
  deepEqual(canvasStale(entries, { account: 'me' }).map((e) => [e.key, e.reasons]),
    [['changed', ['changed']], ['gone', ['missing-file']], ['home--default', ['account']]]);
  deepEqual(splitAnchor('design/sketches/screens.html#home'), { file: 'design/sketches/screens.html', anchor: 'home' });
  deepEqual(splitAnchor('a.png'), { file: 'a.png', anchor: null });
  const m = { ...emptyManifest('demo'), boards: [{ key: 'cart--empty', surface: 'cart', state: 'empty', html: 'boards/cart--empty.html', canvas: { link: 'x' } }] };
  match(validateManifest(m).join('\n'), /canvas\.sha256 must be 64 hex/);
  m.boards[0].canvas.sha256 = hash('x');
  deepEqual(validateManifest(m), []);
});

test('A5b: the schema accepts a canvas record and state reference on sketches and pieces', () => {
  const canvas = { link: 'https://claude.ai/a/1', account: 'me', 'published-at': '2026-10-22T10:00:00Z', sha256: hash('a'), previous: ['https://claude.ai/a/0', { link: 'https://claude.ai/a/00', account: 'outlook' }] };
  const board = {
    schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: 'demo', areas: [], threads: [], items: [],
    sketches: [
      { key: 'home', thread: 't', caption: 'Home', state: 'carried', path: 'design/sketches/screens.html#home', canvas },
      { key: 'outside', thread: 't', caption: 'A reference', state: 'reference', link: 'https://claude.ai/a/9', path: null },
    ],
  };
  ok(validateBrainstormBoard(board).valid, JSON.stringify(validateBrainstormBoard(board).errors));
  equal(validateBrainstormBoard({ ...board, sketches: [{ ...board.sketches[0], canvas: { link: 'x' } }] }).valid, false, 'a canvas records its sha256');
  equal(validateBrainstormBoard({ ...board, sketches: [{ ...board.sketches[0], state: 'kept' }] }).valid, false);
  const packet = {
    schema: 'sdlc/v1', type: 'piece', slug: 'demo', key: 'home', 'piece-slug': 'home', form: 'intake', 'origin-source': 'demo',
    'carried-decisions': [], state: 'written', sketches: [{ key: 'home', path: '.ai/workflows/demo/design/sketches/screens.html#home', link: canvas.link, canvas }],
  };
  ok(validateFrontmatter(packet).valid, JSON.stringify(validateFrontmatter(packet).errors));
  equal(validateFrontmatter({ ...packet, sketches: [{ key: 'home', path: null, canvas: { sha256: hash('a') } }] }).valid, false);
});

test('A5b: tool canvas-stale reads the board, the pieces and boards.json', () => {
  const root = project();
  try {
    const wdir = join(root, '.ai', 'workflows', 'demo');
    mkdirSync(join(wdir, 'design', 'sketches'), { recursive: true });
    mkdirSync(join(wdir, 'work'), { recursive: true });
    writeFileSync(designFile(root, 'sketches/screens.html'), '<p>v2</p>');
    writeFileSync(designFile(root, 'sketches/strip.png'), 'png');
    writeFileSync(designFile(root, 'boards/cart--empty.html'), '<p>cart</p>');
    const canvas = (text, account = 'me') => ({ link: 'https://claude.ai/a/1', account, sha256: hash(text) });
    writeFileSync(join(wdir, 'brainstorm-board.json'), JSON.stringify({
      schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: 'demo', areas: [], threads: [], items: [],
      sketches: [
        { key: 'home', thread: 't', caption: 'Home', state: 'carried', path: 'design/sketches/screens.html#home', canvas: canvas('<p>v1</p>') },
        { key: 'strip', thread: 't', caption: 'Strip', state: 'carried', path: 'design/sketches/strip.png' },
      ],
    }));
    writeFileSync(join(wdir, 'work', 'home.md'), `---\nschema: sdlc/v1\ntype: piece\nslug: demo\nkey: home\nsketches:\n  - key: home\n    path: .ai/workflows/demo/design/sketches/screens.html#home\n    link: https://claude.ai/a/1\n    canvas:\n      link: https://claude.ai/a/1\n      account: outlook\n      sha256: ${hash('<p>v2</p>')}\n---\n`);
    writeFileSync(designFile(root, 'boards.json'), JSON.stringify({ ...emptyManifest('demo'), boards: [{ key: 'cart--empty', surface: 'cart', state: 'empty', html: 'boards/cart--empty.html', png: null, canvas: canvas('<p>cart</p>') }] }));
    const r = run(root, ['canvas-stale', 'demo', '--account', 'me']);
    equal(r.status, 0, r.stdout);
    equal(r.json.checked, 3);
    deepEqual(r.json.stale.map((e) => [e.kind, e.key, e.reasons]), [['sketch', 'home', ['changed']], ['sketch', 'home', ['account']]]);
    equal(r.json.stale[0].path, '.ai/workflows/demo/design/sketches/screens.html#home', 'the anchor stays in the path');
    equal(r.json.stale[0].sha256, hash('<p>v2</p>'));
    deepEqual(r.json.unpublished.map((e) => [e.key, e.sha256]), [['strip', hash('png')]]);
    deepEqual(run(root, ['canvas-stale', 'demo']).json.stale.map((e) => e.key), ['home'], 'with no account, only the changed file');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('A8: renderAnsi maps SGR 33 and 90 to the colours of each scheme', () => {
  const text = 'ok \x1b[33mwarn\x1b[0m \x1b[90mhint\x1b[39m \x1b[1;31mfail\x1b[0m\x1b[2K <tag>\r\n';
  const dark = renderAnsi(text, 'campbell');
  match(dark, /<span style="color:#c19c00">warn<\/span>/);
  match(dark, /<span style="color:#767676">hint<\/span>/);
  match(dark, /<span style="color:#c50f1f;font-weight:bold">fail<\/span>/);
  match(dark, /background:#0c0c0c/);
  match(dark, /&lt;tag&gt;/);
  ok(!dark.includes('\x1b'), 'no escape survives');
  const light = renderAnsi(text, 'solarized-light');
  match(light, /<span style="color:#b58900">warn<\/span>/);
  match(light, /<span style="color:#073642">hint<\/span>/);
  match(light, /background:#fdf6e3/);
  equal(ANSI_SCHEMES.campbell.theme, 'dark');
  equal(ANSI_SCHEMES['solarized-light'].theme, 'light');
  match(renderAnsi('\x1b[38;5;196mred\x1b[48;2;1;2;3mbg', 'campbell'), /color:#ff0000">red<\/span><span style="color:#ff0000;background:#010203">bg/);
  match(renderAnsi('\x1b[7minv', 'campbell'), /color:#0c0c0c;background:#cccccc">inv/);
  throws(() => renderAnsi('x', 'nope'), /unknown colour scheme/);
});

test('A8: tool ansi writes the page; an unknown scheme is refused', () => {
  const root = project();
  try {
    writeFileSync(join(root, 'out.txt'), '\x1b[33mwarn\x1b[0m\n');
    const r = spawnSync(process.execPath, [SCRIPT, 'ansi', join(root, 'out.txt'), '--scheme', 'solarized-light', '--out', join(root, 'b', 'out.html')], { encoding: 'utf8' });
    equal(r.status, 0, r.stdout);
    equal(JSON.parse(r.stdout).theme, 'light');
    match(readFileSync(join(root, 'b', 'out.html'), 'utf8'), /color:#b58900">warn/);
    const bad = spawnSync(process.execPath, [SCRIPT, 'ansi', join(root, 'out.txt'), '--scheme', 'nope'], { encoding: 'utf8' });
    equal(bad.status, 1);
    match(JSON.parse(bad.stdout).error, /--scheme is one of campbell, solarized-light/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Release E: designModesOf reads surface-modes, then design-mode, then the deprecated register', () => {
  deepEqual(designModesOf({ 'surface-modes': { home: 'persuade', settings: 'operate' }, register: 'brand' }).modes,
    [{ surface: 'home', mode: 'persuade' }, { surface: 'settings', mode: 'operate' }]);
  deepEqual(designModesOf({ 'design-mode': 'read' }), { modes: [{ surface: null, mode: 'read' }], from: 'design-mode', register: null });
  deepEqual(designModesOf({ register: 'brand' }).modes, [{ surface: null, mode: 'persuade' }]);
  deepEqual(designModesOf({ register: 'product' }), { modes: [{ surface: null, mode: 'operate' }], from: 'register', register: 'product' });
  deepEqual(designModesOf({}).modes, []);
});
