// The design commands as an agent meets them: every form is in the help of wf.mjs, a wrong call is
// a refusal with a fix, a name that does not exist fails with the names that do, and `design next`
// reads the one next action from disk. No test starts a browser; the server test uses a temp
// SDLC_HOME and a free port.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appendAnswerEvent } from '../../lib/answers.mjs';
import { approvalQuestion, approveDesign } from '../../lib/design-approve.mjs';
import { DESIGN_FORMS, DESIGN_USAGE, DESIGN_VERBS, runDesign } from '../../lib/design-cli.mjs';
import { writeChecks } from '../../lib/design-records.mjs';
import { stopServer } from '../../lib/design-server.mjs';
import { restoreVersion } from '../../lib/design-versions.mjs';
import { readDesignRepos, readManifest, screenFile, surfaceDir } from '../../lib/design-surface.mjs';

const WF = fileURLToPath(new URL('../../scripts/wf.mjs', import.meta.url));
// Every kind that a surface needs: colours, a family, a font size, the space steps, a size and a radius.
const DESIGN = '# Design\n\n## Colors\n\n| Role | Token | Value | Used for |\n|---|---|---|---|\n| ground | | #ffffff | page |\n| text | | #111111 | body |\n'
  + '\n## Typography\n\n| Role | Value | Used for |\n|---|---|---|\n| font-body | system-ui, sans-serif | body |\n| text-body | 16px | body |\n'
  + '\n## Layout\n\n| Role | Value | Used for |\n|---|---|---|\n| space-1 | 4px | tight |\n| space-2 | 8px | default |\n| size-target | 44px | targets |\n'
  + '\n## Shapes\n\n| Role | Value | Used for |\n|---|---|---|\n| radius-1 | 4px | controls |\n';
const INDEX = (more = '') => `---\nschema: sdlc/v1\ntype: index\nslug: w1\nstatus: in-progress\n${more}---\n`;

/** A project in a git repo with the workflow w1, and a temp SDLC_HOME. `surface: false` makes no design surface. */
function project({ surface = true, index = INDEX('ux-impact: visual\n') } = {}) {
  const top = mkdtempSync(join(tmpdir(), 'design-cli-'));
  const root = join(top, 'Shop');
  const dir = join(root, '.ai', 'workflows', 'w1');
  mkdirSync(dir, { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  execFileSync('git', ['-C', root, 'config', 'user.email', 't@t']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 't']);
  writeFileSync(join(root, '.gitignore'), '.ai/\n');
  writeFileSync(join(dir, '00-index.md'), index);
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  // A server that just stopped can hold its folder for a moment: the remove tries for a few seconds.
  const done = () => { if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved; rmSync(top, { recursive: true, force: true, maxRetries: 40, retryDelay: 150 }); };
  return { top, root, dir, done, ready: surface ? null : null };
}

/** Run one design command in this process: `{ code, out }`, `out` is the JSON result or the text. */
async function design(pos, opt = { json: true }) {
  const lines = [];
  const code = await runDesign(pos, opt, (v) => lines.push(v));
  return { code, out: opt.json ? lines.at(-1) : lines.join('\n') };
}

/** A project with a surface, tokens, one component and the drawn screen basket of w1. */
async function drawn() {
  const p = project();
  writeFileSync(join(p.root, 'DESIGN.md'), DESIGN);
  for (const call of [['init', p.root], ['tokens', p.root], ['component', 'add', p.root, 'button'], ['screen', 'add', p.root, 'basket']]) {
    const r = await design(call, { json: true, workflow: 'w1' });
    assert.equal(r.code, 0, `${call.join(' ')}: ${JSON.stringify(r.out)}`);
  }
  writeFileSync(screenFile(p.root, 'basket'), readFileSync(screenFile(p.root, 'basket'), 'utf8').replace('<section data-state="default">', '<section data-state="default"><p>Two items</p>'));
  return p;
}

test('the help of wf.mjs lists every design form, and every form reaches the dispatch', async () => {
  const header = readFileSync(WF, 'utf8').split('*/')[0];
  const listed = [...header.matchAll(/^ \* {3}design {3}(.+)$/gm)].map((m) => m[1].trim());
  assert.deepEqual(listed, DESIGN_FORMS.map((f) => f.form), 'the header of wf.mjs and DESIGN_FORMS hold the same forms in the same order');
  for (const f of DESIGN_FORMS) {
    assert.ok(header.includes(`Example: ${f.example}`), `${f.form} has its example in the help`);
    assert.ok(DESIGN_USAGE.includes(f.form));
    const words = f.form.split(/ [<[]/)[0].split(' ');
    if (words[0] === 'server') continue;
    // The form with no argument is a usage error of that form, never an unknown command.
    const r = await design(words.map((w) => w.split('|')[0]));
    assert.equal(r.code, 2, f.form);
    assert.ok(!/has no command/.test(r.out.error), `${f.form}: ${r.out.error}`);
    assert.ok(r.out.fix.do, `${f.form} names its fix`);
  }
  assert.ok(DESIGN_VERBS.includes('next') && DESIGN_VERBS.includes('doctor'));
  const help = spawnSync(process.execPath, [WF, 'help', 'design'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  for (const form of ['design   next <root> <slug>', 'design   screen rename <root> <old> <new> [--force]', 'design   server url [<root>] [--workflow slug] [--no-start]']) assert.ok(help.stdout.includes(form), form);
});

test('an unknown design command exits 2 with the usage and a fix, in text and in JSON', () => {
  const text = spawnSync(process.execPath, [WF, 'design', 'nope', '.'], { encoding: 'utf8' });
  assert.equal(text.status, 2);
  assert.match(text.stderr, /design has no form nope/);
  assert.match(text.stderr, /fix\.who: agent/);
  assert.match(text.stderr, /fix\.do: /);
  const json = spawnSync(process.execPath, [WF, 'design', 'nope', '.', '--json'], { encoding: 'utf8' });
  assert.equal(json.status, 2);
  const out = JSON.parse(json.stdout);
  assert.equal(out.ok, false);
  assert.match(out.error, /design has no form nope/);
  assert.equal(out.fix.command, 'wf.mjs help design');
  assert.equal(out.fix.who, 'agent');
});

test('a read makes no design surface, and a folder that is no project is refused with a fix', async () => {
  const p = project({ surface: false });
  try {
    for (const call of [['list', p.root], ['state', p.root], ['components', p.root], ['foundation', p.root], ['check', p.root], ['comments', p.root], ['viewports', p.root], ['versions', p.root, 'w1'], ['server', 'url', p.root]]) {
      const r = await design(call, { json: true, 'no-start': true });
      assert.equal(r.code, 1, call.join(' '));
      assert.equal(r.out.ok, false);
      assert.match(r.out.error, /has no design surface/, call.join(' '));
      assert.match(r.out.fix.command, /wf\.mjs design init /);
    }
    assert.equal(existsSync(join(p.root, '.ai', 'design')), false, 'no command made .ai/design/');
    assert.deepEqual(readDesignRepos(), [], 'no command added the folder to the repos of the server');
    const gone = await design(['list', join(p.top, 'no-such-folder')]);
    assert.equal(gone.code, 1);
    assert.match(gone.out.error, /^no folder /);
    assert.equal(gone.out.fix.who, 'agent');
    const doctor = await design(['doctor', p.root]);
    assert.equal(doctor.code, 1, 'a project with no surface is not ready for a check');
    assert.deepEqual([doctor.out.ok, doctor.out.surface, doctor.out.viewports], [false, false, {}]);
    for (const k of ['root', 'browser', 'server', 'records', 'git', 'error', 'fix']) assert.ok(k in doctor.out, `the doctor reports ${k}`);
    assert.deepEqual(Object.keys(doctor.out.server), ['running', 'port', 'pid']);
    assert.deepEqual(Object.keys(doctor.out.records), ['linked', 'project', 'dir']);
    assert.match(doctor.out.fix.command, /wf.mjs design init /);
    assert.equal(existsSync(join(p.root, '.ai', 'design')), false, 'the doctor only reads');
  } finally { p.done(); }
});

test('a slug, a screen or a version that does not exist fails with the names that do', async () => {
  const p = await drawn();
  try {
    const refused = async (call, opt, re, names) => {
      const r = await design(call, { json: true, ...opt });
      assert.equal(r.code, 1, `${call.slice(0, 2).join(' ')}: ${JSON.stringify(r.out).slice(0, 300)}`);
      assert.equal(r.out.ok, false);
      assert.match(r.out.error, re);
      assert.match(JSON.stringify(r.out.fix), names, `${call[0]}: the fix lists the valid names`);
    };
    await refused(['list', p.root], { workflow: 'nope' }, /no workflow nope/, /w1/);
    await refused(['check', p.root], { workflow: 'nope' }, /no workflow nope/, /w1/);
    await refused(['comments', p.root], { workflow: 'nope' }, /no workflow nope/, /w1/);
    await refused(['components', p.root], { workflow: 'nope' }, /no workflow nope/, /w1/);
    await refused(['server', 'url', p.root], { workflow: 'nope', 'no-start': true }, /no workflow nope/, /w1/);
    for (const verb of ['next', 'status', 'round', 'versions', 'approved', 'approve']) await refused([verb, p.root, 'nope'], {}, /no workflow nope/, /w1/);
    await refused(['restore', p.root, 'nope', 'v1'], {}, /no workflow nope/, /w1/);
    await refused(['components', 'verify', p.root, 'nope'], {}, /no workflow nope/, /w1/);
    await refused(['check', p.root, 'ghost'], {}, /no screen ghost/, /basket/);
    await refused(['comments', p.root, 'ghost'], {}, /no screen ghost/, /basket/);
    await refused(['screen', 'remove', p.root, 'ghost'], {}, /no screen ghost/, /basket/);
    await refused(['screen', 'rename', p.root, 'ghost', 'spirit'], {}, /no screen ghost/, /basket/);
    await refused(['component', 'remove', p.root, 'ghost'], {}, /no component ghost/, /button/);
    await refused(['restore', p.root, 'w1', 'v9'], {}, /w1 has no version v9/, /version/);
    await refused(['viewports', p.root, 'phone=wide'], {}, /the viewport phone=wide is not name=WxH/, /375x812/);
    await refused(['screen', 'add', p.root, 'Bad_Key'], {}, /must be kebab-case/, /order-list/);
    await refused(['screen', 'add', p.root, 'pay'], { order: 'first' }, /--order first is not a number/, /whole number/);
    assert.deepEqual(Object.keys(readManifest(p.root).screens), ['basket'], 'no refused call changed the manifest');
  } finally { p.done(); }
});

test('the foundation, a refused screen and the tokens name the command for each missing part', async () => {
  const p = project();
  try {
    assert.equal((await design(['init', p.root])).code, 0);
    const tokens = await design(['tokens', p.root]);
    assert.equal(tokens.code, 1, 'no DESIGN.md is a failure, with a fix');
    assert.equal(tokens.out.ok, false);
    assert.ok(tokens.out.fix.do);
    const f = await design(['foundation', p.root]);
    assert.equal(f.code, 1);
    assert.equal(f.out.missing.length, 2);
    assert.match(f.out.next[0].command, /wf\.mjs design tokens /);
    assert.match(f.out.next[1].command, /wf\.mjs design components scan /);
    assert.equal(f.out.fix.command, f.out.next[0].command);
    const text = await design(['foundation', p.root], {});
    assert.match(text.out, /no tokens.*\n {2}run: wf\.mjs design tokens /);
    const add = await design(['screen', 'add', p.root, 'basket']);
    assert.equal(add.code, 1);
    assert.deepEqual([add.out.ok, add.out.next.length], [false, 2]);
    assert.match(add.out.fix.then, /wf\.mjs design screen add .* basket/);
    assert.equal(existsSync(screenFile(p.root, 'basket')), false);
  } finally { p.done(); }
});

test('design next names the one next action at each step, and design status has one shape', async () => {
  const p = project({ index: INDEX() });
  const step = async () => (await design(['next', p.root, 'w1'])).out;
  const put = (name, text) => writeFileSync(join(p.dir, name), text);
  try {
    let n = await step();
    assert.deepEqual([n.ok, n.slug, n.step], [true, 'w1', 'intake']);
    assert.equal(n.route, '/wf intake w1');
    put('02-shape.md', '---\nschema: sdlc/v1\ntype: shape\nslug: w1\nstatus: complete\n---\n# Shape\n');
    n = await step();
    assert.equal(n.step, 'no-design');
    assert.ok(n.ask, 'the person decides whether the workflow changes what a person sees');
    put('00-index.md', INDEX('ux-impact: visual\n'));
    n = await step();
    assert.equal(n.step, 'record');
    assert.deepEqual(n.missing, ['PRODUCT.md', 'DESIGN.md', '.ai/design/current.md', '.ai/design/direction.md']);
    writeFileSync(join(p.root, 'PRODUCT.md'), '# Product\n\nA shop.\n');
    writeFileSync(join(p.root, 'DESIGN.md'), '# Design\n');
    mkdirSync(surfaceDir(p.root), { recursive: true });
    writeFileSync(join(surfaceDir(p.root), 'current.md'), '# Current\n');
    writeFileSync(join(surfaceDir(p.root), 'direction.md'), '# Direction\n');
    n = await step();
    assert.equal(n.step, 'init');
    assert.match(n.command, /^wf\.mjs design init /);
    assert.equal((await design(['init', p.root])).code, 0);
    n = await step();
    assert.equal(n.step, 'foundation');
    assert.match(n.command, /wf\.mjs design tokens /);
    writeFileSync(join(p.root, 'DESIGN.md'), DESIGN);
    assert.equal((await design(['tokens', p.root])).code, 0);
    assert.equal((await design(['component', 'add', p.root, 'button'])).code, 0);
    n = await step();
    assert.equal(n.step, 'draw');
    assert.match(n.command, /wf\.mjs design screen add .* <key> --workflow w1/);
    assert.equal((await design(['screen', 'add', p.root, 'basket'], { json: true, workflow: 'w1' })).code, 0);
    n = await step();
    assert.equal(n.step, 'draw', 'a screen that still holds the template is not drawn');
    assert.match(n.why, /basket still holds the template/);
    writeFileSync(screenFile(p.root, 'basket'), readFileSync(screenFile(p.root, 'basket'), 'utf8').replace('<section data-state="default">', '<section data-state="default"><p>Two items</p>'));
    n = await step();
    assert.equal(n.step, 'check');
    assert.match(n.command, /wf\.mjs design check .* --workflow w1/);

    // The result of a check that failed, newer than the page.
    const later = new Date(Date.now() + 5000);
    const failure = { screen: 'basket', viewport: 'phone', state: 'default', check: 'contrast', cause: 'text/#999999/#ffffff/4.5', message: 'The text #999999 on #ffffff is 2.85:1; 4.5:1 is the minimum for body text', selector: 'p', move: 'colorize' };
    writeChecks(p.root, { at: later.toISOString(), ran: true, screens: ['basket'], passed: false, failures: [failure], truncated: {}, notices: [] });
    n = await step();
    assert.equal(n.step, 'fix');
    assert.deepEqual([n.groups.length, n.groups[0].move, n.groups[0].check], [1, 'colorize', 'contrast']);
    const status = (await design(['status', p.root, 'w1'])).out;
    assert.deepEqual(Object.keys(status).sort(), ['check', 'contract', 'drift', 'next', 'ok', 'question', 'round', 'screens', 'slug', 'threads', 'unsaved', 'version']);
    assert.deepEqual([status.check.passed, status.check.failures, status.check.stale, status.next.step], [false, 1, false, 'fix']);
    assert.deepEqual(status.contract, { exists: false, approved: false, reopened: false, restored: null, problems: [] });
    const text = (await design(['status', p.root, 'w1'], {})).out;
    assert.match(text, /next: fix — the check fails: 1 failure\(s\) from 1 cause\(s\)/);
    assert.equal(text.match(/The text #999999 on #ffffff/g).length, 1, 'the failures print once');

    // The check passes: the pages need a round, then the question.
    writeChecks(p.root, { at: later.toISOString(), ran: true, screens: ['basket'], passed: true, failures: [], truncated: {}, notices: [] });
    n = await step();
    assert.equal(n.step, 'round');
    assert.equal((await design(['round', p.root, 'w1'])).code, 0);
    n = await step();
    assert.equal(n.step, 'ask');
    assert.equal(n.ask, approvalQuestion('w1'));
    assert.equal(n.command, undefined, 'a question for the person is no command');

    // The person approves: first the contract, then the approval.
    appendAnswerEvent(p.root, { tool: 'AskUserQuestion', questions: [{ question: approvalQuestion('w1'), header: 'Design', answer: 'Approve' }] }, { now: new Date(Date.now() + 10000) });
    n = await step();
    assert.equal(n.step, 'contract');
    put('02c-craft.md', '---\nschema: sdlc/v1\ntype: design-contract\nslug: w1\n---\n# Contract\n');
    n = await step();
    assert.equal(n.step, 'approve');
    assert.match(n.command, /^wf\.mjs design approve .* w1$/);

    // The approval is recorded: the next stage. A restore then needs a new approval.
    const approval = await approveDesign(p.root, 'w1', { browser: null });
    assert.equal(approval.ok, true, approval.reason);
    n = await step();
    assert.equal(n.step, 'approved', JSON.stringify(n));
    assert.ok(n.route, 'the key of the next stage');
    assert.equal((await design(['status', p.root, 'w1'])).out.contract.approved, true);
    // A second version, then the first one is put back.
    writeFileSync(screenFile(p.root, 'basket'), readFileSync(screenFile(p.root, 'basket'), 'utf8').replace('<p>Two items</p>', '<p>Three items</p>'));
    assert.equal((await design(['round', p.root, 'w1'])).code, 0);
    appendAnswerEvent(p.root, { tool: 'AskUserQuestion', questions: [{ question: approvalQuestion('w1'), header: 'Design', answer: 'Approve' }] }, { now: new Date(Date.now() + 40000) });
    const second = await approveDesign(p.root, 'w1', { browser: null, now: new Date(Date.now() + 50000) });
    assert.deepEqual([second.ok, second.version], [true, 'v2'], second.reason);
    const back = restoreVersion(p.root, 'w1', 'v1', { now: new Date(Date.now() + 60000) });
    assert.equal(back.ok, true, back.reason);
    writeChecks(p.root, { at: new Date(Date.now() + 90000).toISOString(), ran: true, screens: ['basket'], passed: true, failures: [], truncated: {}, notices: [] });
    n = await step();
    assert.equal(n.step, 'ask', JSON.stringify(n));
    assert.match(n.why, /^restored: .* ask for approval again$/);
    assert.equal(n.ask, approvalQuestion('w1'));
    const after = (await design(['status', p.root, 'w1'])).out.contract;
    assert.deepEqual([after.approved, after.restored], [false, 'v1']);
  } finally { p.done(); }
});

test('a screen is renamed and removed with every reference, and a part that is in use needs --force', async () => {
  const p = await drawn();
  try {
    assert.equal((await design(['screen', 'add', p.root, 'pay'], { json: true, workflow: 'w1' })).code, 0);
    writeFileSync(screenFile(p.root, 'pay'), readFileSync(screenFile(p.root, 'pay'), 'utf8').replace('<section data-state="default">', '<section data-state="default"><a href="basket.html">Back</a><button data-component="button">Pay</button>'));
    writeFileSync(join(surfaceDir(p.root), 'layout.json'), JSON.stringify({ positions: { basket: { x: 1, y: 2 }, pay: { x: 3, y: 4 } } }));

    const taken = await design(['screen', 'rename', p.root, 'basket', 'pay']);
    assert.equal(taken.code, 1);
    assert.match(taken.out.error, /pay/);
    const r = await design(['screen', 'rename', p.root, 'basket', 'cart']);
    assert.equal(r.code, 0, JSON.stringify(r.out));
    assert.deepEqual([r.out.ok, r.out.from, r.out.to, r.out.links], [true, 'basket', 'cart', ['pay']]);
    assert.deepEqual(Object.keys(readManifest(p.root).screens).sort(), ['cart', 'pay']);
    assert.equal(existsSync(screenFile(p.root, 'basket')), false);
    assert.match(readFileSync(screenFile(p.root, 'cart'), 'utf8'), /name="wf:screen" content="cart"/);
    assert.match(readFileSync(screenFile(p.root, 'pay'), 'utf8'), /href="cart\.html"/);
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(surfaceDir(p.root), 'layout.json'), 'utf8')).positions).sort(), ['cart', 'pay']);

    const used = await design(['component', 'remove', p.root, 'button']);
    assert.equal(used.code, 1);
    assert.match(used.out.error, /pay/, 'the refusal names the screen that uses the part');
    assert.match(used.out.fix.command ?? used.out.fix.do, /--force/);
    assert.ok(readManifest(p.root).components.button);
    const forced = await design(['component', 'remove', p.root, 'button'], { json: true, force: true });
    assert.equal(forced.code, 0, JSON.stringify(forced.out));
    assert.equal(readManifest(p.root).components.button, undefined);

    // A screen that an approval names stays until --force.
    const m = readManifest(p.root);
    m.screens.pay.approvals = [{ commit: 'abc', at: '2026-11-01T10:00:00Z', workflow: 'w1' }];
    writeFileSync(join(surfaceDir(p.root), 'screens.json'), `${JSON.stringify(m, null, 2)}\n`);
    const named = await design(['screen', 'remove', p.root, 'pay']);
    assert.equal(named.code, 1);
    assert.match(named.out.error, /approval/);
    assert.ok(existsSync(screenFile(p.root, 'pay')));
    assert.equal((await design(['screen', 'remove', p.root, 'pay'], { json: true, force: true })).code, 0);
    const gone = await design(['screen', 'remove', p.root, 'cart']);
    assert.equal(gone.code, 0, JSON.stringify(gone.out));
    assert.deepEqual(Object.keys(readManifest(p.root).screens), []);
    assert.equal(existsSync(screenFile(p.root, 'cart')), false);
    assert.deepEqual(JSON.parse(readFileSync(join(surfaceDir(p.root), 'layout.json'), 'utf8')).positions, {});
  } finally { p.done(); }
});

test('publish writes inside the surface by default, and --out names another file', async () => {
  const p = await drawn();
  try {
    const r = await design(['publish', p.root]);
    assert.equal(r.code, 0);
    assert.equal(r.out.file, join(surfaceDir(p.root), 'published', 'canvas.html'));
    assert.match(readFileSync(r.out.file, 'utf8'), /<html/i);
    assert.equal(existsSync(join(p.root, 'canvas.html')), false, 'nothing is written at the project root');
    const out = join(p.top, 'share', 'page.html');
    assert.equal((await design(['publish', p.root], { json: true, out })).out.file, out);
    assert.ok(existsSync(out));
  } finally { p.done(); }
});

test('server url starts the server when it is stopped, and prints the address for the computer and for the phone', async () => {
  const p = await drawn();
  const probe = createServer();
  await new Promise((ok) => probe.listen(0, '127.0.0.1', ok));
  const { port } = probe.address();
  await new Promise((ok) => probe.close(ok));
  try {
    mkdirSync(process.env.SDLC_HOME, { recursive: true });
    writeFileSync(join(process.env.SDLC_HOME, 'config.json'), JSON.stringify({ design: { port } }));
    const still = await design(['server', 'url', p.root], { json: true, 'no-start': true, workflow: 'w1' });
    assert.equal(still.code, 0);
    assert.deepEqual([still.out.ok, still.out.running, still.out.started, still.out.port, still.out.registered], [true, false, false, port, false]);
    assert.equal(still.out.computer, `http://127.0.0.1:${port}/r/${still.out.repo}/?workflow=w1`);
    assert.ok(still.out.phone === null || still.out.phone.endsWith(`:${port}/r/${still.out.repo}/?workflow=w1`));

    const text = await design(['server', 'url', p.root], {});
    assert.equal(text.code, 0, text.out);
    assert.match(text.out, new RegExp(`^computer: http://127\\.0\\.0\\.1:${port}/r/shop/$`, 'm'));
    assert.match(text.out, /^phone: (http\S+\/r\/shop\/|none \(no tailnet address\))$/m);
    assert.match(text.out, /the design server was stopped: it runs now/);
    const again = await design(['server', 'url', p.root]);
    assert.deepEqual([again.out.running, again.out.started], [true, false], 'a second call starts nothing');
  } finally {
    await stopServer();
    p.done();
  }
});

test('a token, component, layout or library failure blocks the approval: design next asks no question until each cause is repaired or waived', async () => {
  const p = await drawn();
  try {
    writeFileSync(join(p.dir, '02-shape.md'), '---\nschema: sdlc/v1\ntype: shape\nslug: w1\nstatus: complete\n---\n# Shape\n');
    writeFileSync(join(p.root, 'PRODUCT.md'), '# Product\n');
    writeFileSync(join(surfaceDir(p.root), 'current.md'), '# Current\n');
    writeFileSync(join(surfaceDir(p.root), 'direction.md'), '# Direction\n');
    const later = new Date(Date.now() + 5000).toISOString();
    const token = { screen: 'basket', viewport: 'phone', state: 'default', check: 'token', kind: 'color', cause: '#aa0000', message: 'The color #aa0000 of .raw is not a token', selector: 'p', move: 'colorize' };
    const contrast = { screen: 'basket', viewport: 'phone', state: 'default', check: 'contrast', cause: 'text/#999999/#ffffff/4.5', message: 'The text #999999 on #ffffff is 2.85:1', selector: 'p', move: 'colorize' };
    const library = [{ component: 'button', check: 'library', cause: 'button/no-spec', message: 'button: The page declares no spec', do: 'Repair the library.' }];
    writeChecks(p.root, { at: later, ran: true, screens: ['basket'], passed: false, failures: [token, contrast], library, truncated: {}, notices: [] });
    let n = (await design(['next', p.root, 'w1'])).out;
    assert.equal(n.step, 'fix', JSON.stringify(n));
    assert.equal(n.question, undefined, 'no approval question while a system failure stays');
    assert.deepEqual(n.blocking, ['#aa0000', 'button/no-spec']);
    assert.match(n.do, /design waive .* w1 --cause/);
    assert.ok(n.groups.some((g) => g.check === 'library'), 'the library items are among the groups');

    const unknown = await design(['waive', p.root, 'w1'], { json: true, cause: '#123456', reason: 'r' });
    assert.equal(unknown.code, 1);
    assert.match(unknown.out.error, /has the cause #123456/);
    assert.match(unknown.out.fix.do, /#aa0000, button\/no-spec/);
    assert.equal((await design(['waive', p.root, 'w1'], { json: true, cause: '#aa0000' })).code, 1, 'a waiver needs its reason');
    for (const cause of ['#aa0000', 'button/no-spec']) {
      const r = await design(['waive', p.root, 'w1'], { json: true, cause, reason: 'The person keeps it as it is' });
      assert.equal(r.code, 0, JSON.stringify(r.out));
    }
    const list = await design(['waive', p.root, 'w1'], {});
    assert.match(list.out, /waived: #aa0000 \(.*\): The person keeps it as it is/);
    assert.ok(!/still blocking/.test(list.out));
    n = (await design(['next', p.root, 'w1'])).out;
    assert.equal(n.step, 'fix', 'the contrast failure stays, and the person may approve with it');
    assert.equal(n.question, approvalQuestion('w1'));
    assert.deepEqual(readManifest(p.root).waivers.map((w) => w.cause), ['#aa0000', 'button/no-spec']);
  } finally { p.done(); }
});
