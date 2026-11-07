// The foundation of a design: a new screen waits for the tokens and the library, a screen reuses
// the library, the contract names the components to build, and the code must then use them.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appendAnswerEvent } from '../../lib/answers.mjs';
import { approvalQuestion, approveDesign } from '../../lib/design-approve.mjs';
import { checkBrowser, runChecks } from '../../lib/design-check.mjs';
import { addComponent, componentFile, componentNames, componentsUsed, foundation, linkComponent, listComponents, scanComponents, setNoComponents, verifyComponents } from '../../lib/design-components.mjs';
import { canvasState } from '../../lib/design-state.mjs';
import { addScreen, initSurface, screenFile, surfaceDir, tokensFromDesign, writeTokens } from '../../lib/design-surface.mjs';
import { restoreVersion, saveRound, versionDir } from '../../lib/design-versions.mjs';
import { frontmatterOfDoc } from '../../lib/records.mjs';

const WF = fileURLToPath(new URL('../../scripts/wf.mjs', import.meta.url));
const DESIGN = '# Design\n\n## Colors\n\n| Role | Token | Value | Used for |\n|---|---|---|---|\n| ground | | #ffffff | page |\n| text | | #111111 | body |\n\n## Layout\n\n| Breakpoint | Width |\n|---|---|\n| phone | 375 |\n\n### Token roles\n| Role | Token | Value | Used for |\n|---|---|---|---|\n| space-2 | | 8px | gaps |\n';

function project({ tokens = true } = {}) {
  const top = mkdtempSync(join(tmpdir(), 'design-components-'));
  const root = join(top, 'Shop');
  const dir = join(root, '.ai', 'workflows', 'w1');
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'config', 'user.email', 't@t']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 't']);
  writeFileSync(join(root, '.gitignore'), '.ai/\n');
  writeFileSync(join(dir, '00-index.md'), '---\nschema: sdlc/v1\ntype: index\nslug: w1\nstatus: in-progress\nux-impact: visual\n---\n');
  writeFileSync(join(dir, '02c-craft.md'), '---\nschema: sdlc/v1\ntype: design-contract\nslug: w1\n---\n# Contract\n');
  if (tokens) writeFileSync(join(root, 'DESIGN.md'), DESIGN);
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  initSurface(root);
  return { root, dir, done: () => { if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved; rmSync(top, { recursive: true, force: true }); } };
}

const wf = (root, ...args) => spawnSync(process.execPath, [WF, 'design', ...args], { encoding: 'utf8', env: process.env, cwd: root });
const page = (body) => `<!doctype html><html><head><link rel="stylesheet" href="../tokens.css"><link rel="stylesheet" href="../components.css"></head><body>${['default', 'empty', 'loading', 'error', 'worst'].map((s) => `<section data-state="${s}"${s === 'default' ? '' : ' hidden'}>${body}</section>`).join('')}</body></html>`;

test('the token sheet reads the roles of each section, and only a token table outside the colors', () => {
  assert.deepEqual(tokensFromDesign(DESIGN).map((r) => r.role), ['ground', 'text', 'space-2']);
  const { root, done } = project();
  try {
    writeTokens(root);
    assert.match(readFileSync(join(surfaceDir(root), 'tokens.css'), 'utf8'), /--space-2: 8px;/);
  } finally { done(); }
});

test('a new screen waits for the tokens and the components, and an existing screen does not', () => {
  const { root, done } = project({ tokens: false });
  try {
    assert.equal(foundation(root).ok, false);
    addScreen(root, 'older', { workflow: 'w0' });
    assert.equal(wf(root, 'screen', 'add', root, 'older', '--workflow', 'w1').status, 0, 'an existing screen joins a workflow');
    const refused = wf(root, 'screen', 'add', root, 'basket', '--workflow', 'w1');
    assert.equal(refused.status, 1);
    assert.match(refused.stdout, /no tokens/);
    assert.equal(existsSync(screenFile(root, 'basket')), false);

    writeFileSync(join(root, 'DESIGN.md'), DESIGN);
    wf(root, 'tokens', root);
    assert.match(wf(root, 'foundation', root).stdout, /no components/);
    assert.equal(wf(root, 'screen', 'add', root, 'basket', '--workflow', 'w1').status, 1);

    assert.equal(wf(root, 'component', 'add', root, 'button', '--title', 'Button').status, 0);
    assert.equal(wf(root, 'foundation', root).status, 0);
    assert.equal(wf(root, 'screen', 'add', root, 'basket', '--workflow', 'w1').status, 0);
    assert.match(readFileSync(screenFile(root, 'basket'), 'utf8'), /href="\.\.\/components\.css"/);
    assert.ok(existsSync(componentFile(root, 'button')));
  } finally { done(); }
});

test('a product with no reusable parts says why', () => {
  const { root, done } = project();
  try {
    assert.throws(() => setNoComponents(root, ''), /--reason/);
    setNoComponents(root, 'A terminal surface');
    assert.equal(foundation(root).ok, true);
    assert.equal(foundation(root).none, 'A terminal surface');
    addComponent(root, 'button');
    assert.equal(foundation(root).none, null);
    assert.throws(() => setNoComponents(root, 'again'), /has components/);
  } finally { done(); }
});

test('a component names a file of the repo, and the library lists its screens', () => {
  const { root, done } = project();
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'Button.tsx'), 'export const Button = 1;\n');
    assert.throws(() => addComponent(root, 'button', { code: 'src/Nope.tsx', name: 'Button' }), /does not exist/);
    assert.throws(() => addComponent(root, 'button', { code: '../outside.tsx', name: 'Button' }), /not a file of this repo/);
    assert.throws(() => addComponent(root, 'button', { code: 'src/Button.tsx' }), /--name/);
    addComponent(root, 'button', { title: 'Button', code: 'src\\Button.tsx'.replace('\\', '/'), name: 'Button' });
    addComponent(root, 'order-row', { title: 'Order row', workflow: 'w1' });
    addScreen(root, 'basket', { workflow: 'w1' });
    writeFileSync(screenFile(root, 'basket'), page('<button data-component="button">Pay</button>'));
    assert.deepEqual(componentsUsed(readFileSync(screenFile(root, 'basket'), 'utf8')), ['button']);
    const rows = listComponents(root);
    assert.deepEqual(rows.map((c) => [c.key, c.status, c.screens]), [['button', 'in code', ['basket']], ['order-row', 'to build', []]]);
    assert.deepEqual(listComponents(root, { workflow: 'w1' }).map((c) => c.key), ['button', 'order-row']);
    const state = canvasState(root, { repo: 'shop' });
    assert.deepEqual(state.screens[0].components, ['button']);
    assert.equal(state.components.length, 2);
  } finally { done(); }
});

test('the approval names the components to build, and the code must make and use them', async () => {
  const { root, dir, done } = project();
  try {
    addComponent(root, 'order-row', { title: 'Order row', workflow: 'w1' });
    addScreen(root, 'basket', { workflow: 'w1', slice: 's1' });
    addScreen(root, 'pay', { workflow: 'w1', slice: 's2' });
    writeFileSync(screenFile(root, 'basket'), page('<div data-component="order-row">One</div>'));
    writeFileSync(join(surfaceDir(root), 'components.css'), '.order-row { color: var(--text); }\n');
    const at = new Date('2026-11-01T10:05:00Z');
    appendAnswerEvent(root, { tool: 'AskUserQuestion', questions: [{ question: approvalQuestion('w1'), header: 'Design', answer: 'Approve' }] }, { now: at });
    const r = await approveDesign(root, 'w1', { browser: null, now: at, since: '2026-11-01T10:00:00Z' });
    assert.equal(r.ok, true, r.reason);
    const contract = frontmatterOfDoc(dir, '02c-craft.md');
    assert.deepEqual(contract.components, ['order-row']);
    assert.deepEqual(contract['components-to-build'], ['order-row']);
    const tracked = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' });
    assert.match(tracked, /components\.css/);
    assert.match(tracked, /components\/order-row\.html/);
    assert.ok(existsSync(join(versionDir(root, 'w1', 'v1'), 'components.css')));

    assert.equal(verifyComponents(root, 'w1', { slice: 's2' }).ok, true, 'the other slice uses no component');
    assert.match(verifyComponents(root, 'w1', { slice: 's1' }).problems[0], /order-row: not built/);

    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'OrderRow.tsx'), 'export const OrderRow = 1;\n');
    linkComponent(root, 'order-row', { code: 'src/OrderRow.tsx', name: 'OrderRow' });
    execFileSync('git', ['-C', root, 'add', 'src']);
    assert.match(verifyComponents(root, 'w1').problems[0], /no file uses OrderRow/);

    writeFileSync(join(root, 'src', 'Basket.tsx'), 'import { OrderRow } from "./OrderRow";\n');
    execFileSync('git', ['-C', root, 'add', 'src']);
    assert.deepEqual(verifyComponents(root, 'w1'), { ok: true, used: ['order-row'], problems: [] });
    assert.equal(wf(root, 'components', 'verify', root, 'w1').status, 0);

    writeFileSync(screenFile(root, 'basket'), page('<div data-component="ghost">One</div>'));
    assert.match(verifyComponents(root, 'w1').problems[0], /no such component/);
  } finally { done(); }
});

test('a change to the component sheet makes a round, and a restore leaves the sheet', () => {
  const { root, done } = project();
  try {
    addComponent(root, 'button');
    addScreen(root, 'basket', { workflow: 'w1' });
    const sheet = join(surfaceDir(root), 'components.css');
    writeFileSync(sheet, '.button { color: var(--text); }\n');
    assert.equal(saveRound(root, 'w1').id, 'v1-r1');
    writeFileSync(sheet, '.button { color: var(--ground); }\n');
    const r = saveRound(root, 'w1');
    assert.deepEqual([r.id, r.changed], ['v1-r2', ['components.css']]);
    const back = restoreVersion(root, 'w1', 'v1-r1');
    assert.equal(back.componentsDiffer, true);
    assert.match(readFileSync(sheet, 'utf8'), /--ground/);
  } finally { done(); }
});

test('the check flags a control outside the library, an unknown component and a raw color of the sheet', async (t) => {
  const { root, done } = project();
  try {
    if (!checkBrowser(root)) { t.skip('no browser'); return; }
    addComponent(root, 'button');
    writeFileSync(join(surfaceDir(root), 'components.css'), '.button { color: #123456; }\n');
    addScreen(root, 'basket', { workflow: 'w1' });
    writeFileSync(screenFile(root, 'basket'), page('<button class="button" data-component="button">Pay</button><button>Back</button><div data-component="ghost">x</div>'));
    const r = await runChecks(root, { workflow: 'w1' });
    assert.equal(r.ran, true, r.reason);
    const of = (check) => r.failures.filter((f) => f.check === check).map((f) => f.message);
    assert.ok(of('component').some((m) => /no component ghost/.test(m)));
    assert.ok(of('component').some((m) => /A button of this page is not a component/.test(m)));
    assert.ok(!of('component').some((m) => /Pay/.test(m)));
    assert.ok(of('token').some((m) => /#123456 of \.button/.test(m)), of('token').join('; '));
  } finally { done(); }
});

test('the scan finds the components of the code: shadcn, Storybook, React, Compose and SwiftUI', () => {
  const { root, done } = project();
  try {
    const put = (rel, text) => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), text); };
    put('components.json', JSON.stringify({ aliases: { ui: '@/components/ui' } }));
    put('src/components/ui/button.tsx', 'export function Button() { return null }\n');
    put('src/components/Card.tsx', 'export const Card = () => null;\nexport function CardTitle() { return null }\n');
    put('src/components/Card.stories.tsx', 'export default { title: "Card" };\n');
    put('src/lib/format.ts', 'export function Format() {}\n');
    put('src/components/Card.test.tsx', 'export function CardSpy() {}\n');
    put('app/src/main/kotlin/Parts.kt', '@Composable\nfun UsageRow(x: Int) {}\n@Composable\nfun HomeScreen() {}\n@Preview @Composable\nfun UsageRowPreview() {}\n');
    put('ios/Views/Badge.swift', 'struct Badge: View { var body: some View { Text("") } }\n');
    addComponent(root, 'card', { code: 'src/components/Card.tsx', name: 'Card' });
    const found = scanComponents(root);
    const by = (name) => found.find((c) => c.name === name);
    assert.equal(by('Button').source, 'shadcn');
    assert.equal(by('Button').key, 'button');
    assert.equal(by('Card').source, 'storybook');
    assert.equal(by('Card').inLibrary, true);
    assert.equal(by('CardTitle').key, 'card-title');
    assert.equal(by('UsageRow').code, 'app/src/main/kotlin/Parts.kt');
    assert.ok(by('Badge'), 'a SwiftUI view');
    for (const name of ['Format', 'CardSpy', 'HomeScreen', 'UsageRowPreview']) assert.equal(by(name), undefined, `${name} is not a part`);
    assert.equal(found.at(-1).inLibrary, true, 'the parts that the library has come last');
    assert.deepEqual(componentNames('src/ui/Toggle.vue', ''), ['Toggle']);
    const r = wf(root, 'components', 'scan', root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /not in the library {2}button: Button in src\/components\/ui\/button\.tsx \(shadcn\)/);
  } finally { done(); }
});

test('the check flags a page that restyles a component, and the hover, press and focus states of each control', async (t) => {
  const { root, done } = project();
  try {
    if (!checkBrowser(root)) { t.skip('no browser'); return; }
    for (const key of ['button', 'link', 'card']) addComponent(root, key);
    writeFileSync(join(surfaceDir(root), 'components.css'), [
      '.button { color: #ffffff; background: #1a5fb4; border: 0; padding: 8px 12px; transition: background 1s; }',
      '.button:hover { background: #9ec5f8; }',
      '.button:focus { outline: none; }',
      '.button[disabled] { color: #bbbbbb; background: #eeeeee; }',
      '.link { color: #1a5fb4; display: inline-block; padding: 4px; }',
      '.link:focus-visible { outline: 2px solid #1a5fb4; outline-offset: 2px; }',
      '.faint:focus-visible { outline: 2px solid #eeeeee; outline-offset: 2px; }',
    ].join('\n'));
    addScreen(root, 'basket', { workflow: 'w1' });
    writeFileSync(screenFile(root, 'basket'), page('<style>.wide { width: 100%; } .card h2 { color: #333333; }</style>'
      + '<button class="button" data-component="button">Pay</button>'
      + '<a class="link" data-component="link" href="#help">Help</a>'
      + '<a class="link faint" data-component="link" href="#more">More</a>'
      + '<button class="button" data-component="button" disabled>Off</button>'
      + '<div class="card wide" data-component="card"><h2>Total</h2></div>'));
    const r = await runChecks(root, { workflow: 'w1' });
    assert.equal(r.ran, true, r.reason);
    const of = (check) => r.failures.filter((f) => f.check === check);
    const restyle = of('component').filter((f) => /restyles/.test(f.message));
    assert.equal(restyle.length, 1, restyle.map((f) => f.message).join('; '));
    assert.match(restyle[0].message, /restyles the component card with \.card h2 \(color\)/);
    const focus = of('focus');
    assert.ok(focus.some((f) => /The button shows no focus indicator/.test(f.message) && f.interaction === 'keyboard focus' && f.move === 'harden'));
    assert.ok(focus.some((f) => /The focus ring #eeeeee on #ffffff is 1\.\d\d:1/.test(f.message)));
    assert.ok(!focus.some((f) => /a:nth-of-type\(1\)/.test(f.selector) && /ring/.test(f.message)), 'the Help ring passes');
    const states = of('contrast').filter((f) => f.interaction);
    assert.ok(states.some((f) => f.interaction === 'hover' && /^On hover, the text #ffffff on #9ec5f8/.test(f.message)), states.map((f) => f.message).join('; '));
    assert.ok(states.some((f) => f.interaction === 'press'));
    assert.ok(!of('contrast').some((f) => /#bbbbbb/.test(f.message)), 'a disabled control is exempt from contrast');
    assert.ok(r.failures.every((f) => !f.interaction || (f.state === 'default' && f.viewport === 'phone')), 'the states run once, in the default state of the first viewport');
  } finally { done(); }
});
