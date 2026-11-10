// The rules of the older board layout (lib/design-boards.mjs) and the board tool
// (scripts/design-boards.mjs). The tool has two commands, check and ansi; every failure it prints
// is `{ ok: false, error, fix }`.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { deepEqual, equal, match, ok, throws } from 'node:assert/strict';

import {
  ANSI_SCHEMES, BOARDS_SCHEMA, designModesOf, isBoardKey, isInsidePath, missingBoardFiles, needsPictures, parseBoardKey, parseViewport,
  renderAnsi, validateManifest,
} from '../../lib/design-boards.mjs';
import { validateFrontmatter, validateBrainstormBoard } from '../../lib/schema-validator.mjs';
import { writeDoc } from '../../lib/records.mjs';
import { COMMANDS } from '../../scripts/design-boards.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(PLUGIN_ROOT, 'scripts', 'design-boards.mjs');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const manifest = (slug, boards = []) => ({ schema: BOARDS_SCHEMA, slug, revision: 0, viewports: { phone: '390x844' }, boards });
const cart = { key: 'cart--empty', surface: 'cart', state: 'empty', png: 'boards/cart--empty.png' };

// ── the rules ─────────────────────────────────────────────────────────────────

test('board keys: <surface>--<state>[--<viewport>]', () => {
  deepEqual(parseBoardKey('squad-list--sorted--phone'), { surface: 'squad-list', state: 'sorted', viewport: 'phone' });
  deepEqual(parseBoardKey('squad-list--worst'), { surface: 'squad-list', state: 'worst', viewport: null });
  equal(parseBoardKey('01-squad-default'), null, 'a numbered file name is not a board key');
  equal(isBoardKey('a--b--c--d'), false);
  deepEqual(parseViewport('390x844'), { width: 390, height: 844 });
  equal(parseViewport('1280'), null);
});

test('needsPictures: visual and new-surface only', () => {
  equal(needsPictures({ 'ux-impact': 'visual' }), true);
  equal(needsPictures({ 'ux-impact': 'new-surface' }), true);
  equal(needsPictures({ 'ux-impact': 'flow' }), false);
  equal(needsPictures({}), false);
});

test('validateManifest: schema, keys, the two names of a board, paths, viewports and the canvas record', () => {
  deepEqual(validateManifest(manifest('demo')), []);
  deepEqual(validateManifest(manifest('demo', [cart])), []);
  const bad = { ...manifest('demo'), schema: 'x', boards: [{ key: 'Cart', png: '../../../etc/passwd' }, { ...cart, viewport: 'tv', png: 'boards/a.png' }] };
  const errors = validateManifest(bad).join('\n');
  match(errors, /schema must be/);
  match(errors, /'Cart' is not/);
  match(errors, /leaves the design folder/);
  match(errors, /viewport 'tv' is not in viewports/);
  const unnamed = validateManifest(manifest('demo', [{ key: 'cart--empty', png: 'boards/cart--empty.png' }])).join('\n');
  match(unnamed, /surface/, 'a board names its surface, as the schema requires');
  match(unnamed, /state/, 'a board names its state, as the schema requires');
  equal(isInsidePath('boards/a.png'), true);
  equal(isInsidePath('C:/x.png'), false);
  equal(isInsidePath('/x.png'), false);
  const m = manifest('demo', [{ ...cart, html: 'boards/cart--empty.html', canvas: { link: 'x' } }]);
  match(validateManifest(m).join('\n'), /canvas\.sha256 must be 64 hex/);
  m.boards[0].canvas.sha256 = hash('x');
  deepEqual(validateManifest(m), []);
});

test('missingBoardFiles: the check result', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdlc-boards-'));
  try {
    const contract = { boards: 'design/r1/boards.json' };
    deepEqual(missingBoardFiles(dir, {}), [], 'no boards: keeps the old rule');
    deepEqual(missingBoardFiles(dir, contract), ['design/r1/boards.json']);
    mkdirSync(join(dir, 'design', 'r1', 'boards'), { recursive: true });
    const m = { ...manifest('demo', [cart]), revision: 1 };
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

test('the schema accepts a canvas record and state reference on sketches and packets', () => {
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
    schema: 'sdlc/v1', type: 'packet', slug: 'demo', key: 'home', 'packet-slug': 'home', form: 'intake', 'origin-source': 'demo',
    'carried-decisions': [], state: 'written', sketches: [{ key: 'home', path: '.ai/workflows/demo/design/sketches/screens.html#home', link: canvas.link, canvas }],
  };
  ok(validateFrontmatter(packet).valid, JSON.stringify(validateFrontmatter(packet).errors));
  equal(validateFrontmatter({ ...packet, sketches: [{ key: 'home', path: null, canvas: { sha256: hash('a') } }] }).valid, false);
});

test('designModesOf reads surface-modes, then design-mode, then the older register', () => {
  deepEqual(designModesOf({ 'surface-modes': { home: 'persuade', settings: 'operate' }, register: 'brand' }).modes,
    [{ surface: 'home', mode: 'persuade' }, { surface: 'settings', mode: 'operate' }]);
  deepEqual(designModesOf({ 'design-mode': 'read' }), { modes: [{ surface: null, mode: 'read' }], from: 'design-mode', register: null });
  deepEqual(designModesOf({ register: 'brand' }).modes, [{ surface: null, mode: 'persuade' }]);
  deepEqual(designModesOf({ register: 'product' }), { modes: [{ surface: null, mode: 'operate' }], from: 'register', register: 'product' });
  deepEqual(designModesOf({}).modes, []);
});

test('renderAnsi maps SGR 33 and 90 to the colours of each scheme', () => {
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
  throws(() => renderAnsi('x', 'nope'), (e) => /unknown colour scheme/.test(e.message) && Boolean(e.fix), 'an unknown scheme is a refusal with a fix');
});

// ── the tool ──────────────────────────────────────────────────────────────────

function project() {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-boards-tool-'));
  mkdirSync(join(root, '.ai', 'workflows', 'demo', 'design', 'r1', 'boards'), { recursive: true });
  writeFileSync(join(root, '.ai', 'workflows', 'demo', '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nux-impact: new-surface\n---\n');
  writeFileSync(designFile(root, 'r1/boards.json'), JSON.stringify({ ...manifest('demo', [cart]), revision: 1 }));
  writeFileSync(designFile(root, 'r1/boards/cart--empty.png'), 'x');
  return root;
}

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* the test reports stdout */ }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr };
}

function designFile(root, rel) { return join(root, '.ai', 'workflows', 'demo', 'design', ...rel.split('/')); }
const CONTRACT = { schema: 'sdlc/v1', type: 'design-contract', 'image-gate': 'pass', 'direction-confirmed-by': 'in-session', boards: 'design/r1/boards.json', 'design-revision': 1 };

test('tool: check reads 02c-craft.md boards: and lists missing files, each failure with a fix', () => {
  const root = project();
  try {
    const none = run(['check', root, 'demo']);
    equal(none.status, 1);
    deepEqual([none.json.ok, none.json.contract, none.json['ux-impact']], [false, false, 'new-surface']);
    equal(none.json.fix.who, 'person', 'a design with no approval is for the person');
    writeFileSync(join(root, '.ai', 'workflows', 'demo', '02c-craft.md'), '---\nschema: sdlc/v1\ntype: design-contract\nimage-gate: pass\ndirection-confirmed-by: in-session\nboards: design/r1/boards.json\ndesign-revision: 1\n---\n');
    const good = run(['check', root, 'demo']);
    equal(good.status, 0, good.stdout);
    deepEqual([good.json.ok, good.json.missing], [true, []]);
    rmSync(designFile(root, 'r1/boards/cart--empty.png'));
    const bad = run(['check', root, 'demo']);
    equal(bad.status, 1);
    deepEqual(bad.json.missing, ['design/r1/boards/cart--empty.png']);
    match(bad.json.fix.command, /wf\.mjs design migrate .* demo --check/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tool: check reads the index and the contract of the record layout', () => {
  const root = project();
  try {
    const dir = join(root, '.ai', 'workflows', 'demo');
    rmSync(join(dir, '00-index.md'));
    writeDoc(dir, '00-index.md', { frontmatter: { schema: 'sdlc/v1', type: 'index', slug: 'demo', 'ux-impact': 'new-surface' } });
    const none = run(['check', root, 'demo']).json;
    deepEqual([none.contract, none['ux-impact']], [false, 'new-surface']);
    writeDoc(dir, '02c-craft.md', { frontmatter: CONTRACT });
    const good = run(['check', root, 'demo']);
    equal(good.status, 0, good.stdout);
    deepEqual([good.json.contract, good.json.revision, good.json.missing], [true, 1, []]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tool: a slug that does not exist is refused with the workflows that do', () => {
  const root = project();
  try {
    const r = run(['check', root, 'nope']);
    equal(r.status, 1);
    equal(r.json.ok, false);
    match(r.json.error, /no workflow folder/);
    match(r.json.fix.do, /demo/);
    const swapped = run(['check', 'demo', root]);
    equal(swapped.json.ok, false, 'the arguments in the wrong order are a refusal, not a defect');
    ok(swapped.json.fix);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tool: the commands are check and ansi; any other command exits 2 with the usage and a fix', () => {
  deepEqual([...COMMANDS], ['check', 'ansi']);
  for (const cmd of ['render', 'freeze', 'sheet', 'canvas-stale', 'nope']) {
    const r = run([cmd, '.', 'demo']);
    equal(r.status, 2, cmd);
    equal(r.json.ok, false);
    match(r.json.error, /has no command/);
    ok(r.json.fix.do, 'the failure carries a fix');
    match(r.stderr, /usage: design-boards\.mjs check <projectRoot> <slug>/);
  }
  equal(run([]).status, 2);
});

test('tool ansi writes the page; an unknown scheme and a missing file are refused with a fix', () => {
  const root = project();
  try {
    writeFileSync(join(root, 'out.txt'), '\x1b[33mwarn\x1b[0m\n');
    const r = run(['ansi', join(root, 'out.txt'), '--scheme', 'solarized-light', '--out', join(root, 'b', 'out.html')]);
    equal(r.status, 0, r.stdout);
    equal(r.json.theme, 'light');
    match(readFileSync(join(root, 'b', 'out.html'), 'utf8'), /color:#b58900">warn/);
    const bad = run(['ansi', join(root, 'out.txt'), '--scheme', 'nope']);
    equal(bad.status, 1);
    match(bad.json.error, /--scheme is one of campbell, solarized-light/);
    ok(bad.json.fix.command);
    const gone = run(['ansi', join(root, 'gone.txt'), '--scheme', 'campbell']);
    equal(gone.status, 1);
    match(gone.json.error, /does not exist/);
    ok(gone.json.fix.do);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
