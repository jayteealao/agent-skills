// WF-CAMPAIGN-PLAN C2-C7 — the disk side of /wf campaign (scripts/campaign.mjs):
// orient writes the ledger, ledger.md and forecast.md; the setup answers, the
// rolling prepare, the wave start, the context file, the drift check, the
// versions at ship time, the questions, the pause, and the re-plan after the
// brainstorm changes its work set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(pluginRoot, 'scripts', 'campaign.mjs');
const B = 'realism';

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function run(root, ...args) {
  try {
    return JSON.parse(execFileSync(process.execPath, [SCRIPT, args[0], root, B, ...args.slice(1)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    return JSON.parse(e.stdout);
  }
}

function packetFile(root, fm) {
  const dir = path.join(root, '.ai', 'workflows', B, 'work');
  mkdirSync(dir, { recursive: true });
  const full = {
    schema: 'sdlc/v1', type: 'work-packet', slug: B, title: `Piece ${fm.key}`, form: 'intake', 'target-slug': null,
    urgency: 'normal', revision: 1, 'origin-brainstorm': B, order: 1, 'depends-on': [], provides: [], expects: [],
    'carried-decisions': [{ key: `${fm.key}-d1`, text: `decision of ${fm.key}`, session: 's1', 'decided-at': '2026-10-01' }],
    'ux-impact': 'none', state: 'proposed', 'routed-to': null, ...fm,
  };
  writeFileSync(path.join(dir, `${fm['work-slug']}.md`), `---\n${JSON.stringify(full, null, 2)}\n---\n\n# ${full.title}\n`);
}

function workIndex(root, revision) {
  writeFileSync(path.join(root, '.ai', 'workflows', B, 'work', 'index.md'), `---\n${JSON.stringify({ schema: 'sdlc/v1', type: 'work-set', slug: B, 'work-set': 'multi', 'work-revision': revision })}\n---\n\n# Work set\n`);
}

function makeRepo() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'campaign cli '));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'c@test');
  git(root, 'config', 'user.name', 'c');
  packetFile(root, { key: 'W1', 'work-slug': 'engine', order: 1, provides: [{ key: 'tick', text: 'a match tick function' }] });
  packetFile(root, { key: 'W2', 'work-slug': 'squads', order: 2 });
  packetFile(root, { key: 'W3', 'work-slug': 'season', order: 3, 'depends-on': ['W1'], expects: [{ from: 'W1', key: 'tick', text: 'a match tick function' }] });
  packetFile(root, { key: 'W4', 'work-slug': 'pick-sim', form: 'investigate', order: 4 });
  packetFile(root, { key: 'W5', 'work-slug': 'ai-coach', order: 5, 'depends-on': ['W4'] });
  workIndex(root, 1);
  writeFileSync(path.join(root, 'README.md'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  git(root, 'tag', 'v0.2.0');
  return root;
}

test('orient writes the ledger, ledger.md and forecast.md, with the waves and the packets that need the person', () => {
  const root = makeRepo();
  try {
    const o = run(root, 'orient');
    assert.equal(o.ok, true, JSON.stringify(o));
    assert.deepEqual(o.waves, [['W1', 'W2'], ['W3']]);
    assert.deepEqual(o.outside, ['W4']);
    assert.deepEqual(o.waiting.map((w) => `${w.key}:${w.reason}:${w.on.join(',')}`), ['W5:needs-you:W4']);
    assert.equal(o.next.action, 'setup');
    const camp = path.join(root, '.ai', 'workflows', B, 'work', 'campaign');
    for (const f of ['ledger.json', 'ledger.md', 'forecast.md', '.campaign-journal.jsonl']) assert.ok(existsSync(path.join(camp, f)), f);
    assert.match(readFileSync(path.join(camp, 'forecast.md'), 'utf8'), /an estimate/);
    assert.equal(run(root, 'orient').ok, false, 'a second orient refuses: the ledger decides the phase');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a single build packet is not a campaign; a gitignored .ai/ stops orient', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'campaign single '));
  try {
    git(root, 'init', '-q');
    packetFile(root, { key: 'W1', 'work-slug': 'engine' });
    workIndex(root, 1);
    const o = run(root, 'orient');
    assert.equal(o.single, true);
    assert.match(o.start, /\/wf intake \.ai\/workflows\/realism\/work\/engine\.md/);
    packetFile(root, { key: 'W2', 'work-slug': 'squads' });
    writeFileSync(path.join(root, '.gitignore'), '.ai/\n');
    assert.match(run(root, 'orient').error, /does not track \.ai/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('setup, rolling prepare, and a wave that starts with its prepared units', () => {
  const root = makeRepo();
  try {
    run(root, 'orient');
    assert.equal(run(root, 'answer', 'forecast', 'continue').next.action, 'setup');
    run(root, 'answer', 'target-version', '"0.3.0"');
    run(root, 'answer', 'release-each-wave', 'false');
    const last = run(root, 'answer', 'output', '{"build-cmd":"cargo build --release","artifacts":["target/release/sm"],"try":"run target/release/sm"}');
    assert.deepEqual(last.next, { action: 'prepare', wave: 1, units: ['W1', 'W2'] });
    run(root, 'unit', 'W1', 'prepared');
    const st = run(root, 'wave', '1', 'start');
    assert.equal(st.ok, true, JSON.stringify(st));
    assert.equal(st.branch, 'campaign/realism/wave-1');
    assert.deepEqual(st.units, [{ key: 'W1', slug: 'engine' }]);
    assert.deepEqual(st.moved, [{ key: 'W2', reason: 'not prepared' }]);
    const s = run(root, 'status');
    assert.equal(s.next.action, 'running');
    assert.deepEqual(s.ledger.waves.map((w) => [w.n, w.state, w.units.join(',')]), [[1, 'running', 'W1'], [2, 'planned', 'W2,W3']]);
    assert.match(run(root, 'wave', '2', 'start').error, /wave 1 is running/);
    const journal = readFileSync(path.join(root, '.ai', 'workflows', B, 'work', 'campaign', '.campaign-journal.jsonl'), 'utf8');
    assert.match(journal, /"event":"wave-start"/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the context file names the carried decisions, the succeeding expects lines and the as-built differences', () => {
  const root = makeRepo();
  try {
    run(root, 'orient');
    const c = run(root, 'context', 'W1');
    assert.equal(c.ok, true);
    const text = readFileSync(c.path, 'utf8');
    assert.match(text, /\*\*W1-d1\*\* — decision of W1/);
    assert.match(text, /W3 `season` expects `tick`: a match tick function/);
    const camp = path.join(root, '.ai', 'workflows', B, 'work', 'campaign');
    mkdirSync(path.join(camp, 'as-built'), { recursive: true });
    writeFileSync(path.join(camp, 'as-built', 'engine.json'), JSON.stringify({ key: 'W1', slug: 'engine', lines: [{ key: 'tick', status: 'changed', class: 'implementation-detail', note: 'tick takes a seed' }] }));
    const c3 = readFileSync(run(root, 'context', 'W3').path, 'utf8');
    assert.match(c3, /\*\*Differs:\*\* `tick` is changed: tick takes a seed/);
    assert.match(c3, /\[as-built\]\(\.\.\/as-built\/engine\.md\)/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the drift check: an implementation-detail change continues; a contract change stops the slug and its dependents', () => {
  const root = makeRepo();
  try {
    run(root, 'orient');
    const camp = path.join(root, '.ai', 'workflows', B, 'work', 'campaign');
    mkdirSync(path.join(camp, 'as-built'), { recursive: true });
    writeFileSync(path.join(camp, 'as-built', 'engine.json'), JSON.stringify({ key: 'W1', lines: [{ key: 'tick', status: 'changed', class: 'implementation-detail', note: 'renamed' }] }));
    let d = run(root, 'drift', '2');
    assert.deepEqual(d.results, [{ key: 'W3', class: 'implementation-detail' }]);
    assert.deepEqual(d.stop, []);
    assert.match(readFileSync(run(root, 'context', 'W3').path, 'utf8'), /## 5\. Drift notes[\s\S]*`W1\/tick`/);
    writeFileSync(path.join(camp, 'as-built', 'engine.json'), JSON.stringify({ key: 'W1', lines: [{ key: 'tick', status: 'unverified' }] }));
    d = run(root, 'drift', '2');
    assert.deepEqual(d.stop, ['W3']);
    assert.match(readFileSync(path.join(camp, 'drift', 'wave-2.md'), 'utf8'), /Contract differences: W3/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('versions at ship time follow the tags; no target means build labels only (V2, V6)', () => {
  const root = makeRepo();
  try {
    run(root, 'orient');
    assert.equal(run(root, 'version', 'wave').version, null, 'no ship plan: no versioning');
    run(root, 'answer', 'target-version', '"0.3.0"');
    assert.equal(run(root, 'version', 'wave').version, '0.3.0-beta.1');
    git(root, 'tag', 'v0.3.0-beta.1');
    assert.equal(run(root, 'version', 'wave').version, '0.3.0-beta.2');
    assert.equal(run(root, 'version', 'hotfix').version, '0.3.0-beta.2');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('questions, the pause, and the re-plan when the brainstorm adds a packet', () => {
  const root = makeRepo();
  try {
    run(root, 'orient');
    for (const [k, v] of [['forecast', 'continue'], ['target-version', '"0.3.0"'], ['release-each-wave', 'false'], ['output', '{"build-cmd":"make","artifacts":["out"],"try":"open out"}']]) run(root, 'answer', k, v);
    run(root, 'ask', 'q1', '--wave', '1', 'CI', 'is', 'red', 'on', 'the', 'wave', 'PR');
    assert.equal(run(root, 'status').next.action, 'ask');
    run(root, 'reply', 'q1', 'fix', 'the', 'flaky', 'test');
    const p = run(root, 'pause', '2026-10-03T15:00:00Z', 'five-hour', 'window');
    assert.equal(p.pause.reason, 'five-hour window');
    const ctl = JSON.parse(readFileSync(path.join(root, '.ai', 'workflows', B, 'work', 'campaign', '.control.json'), 'utf8'));
    assert.equal(ctl.action, 'pause');
    assert.equal(ctl.scope, 'campaign');
    assert.equal(run(root, 'status').next.action, 'paused');
    run(root, 'resume');
    packetFile(root, { key: 'W6', 'work-slug': 'engine-fix', form: 'fix', 'target-slug': 'engine', order: 6 });
    workIndex(root, 2);
    assert.equal(run(root, 'status').next.action, 'work-changed');
    const r = run(root, 'replan');
    assert.deepEqual(r.added, ['W6']);
    assert.deepEqual(r.waves.map((w) => w.units), [['W1', 'W2'], ['W3', 'W6']].map((x) => x), 'R1: the fix of engine never shares a wave with engine');
    run(root, 'outside', 'W4', 'closed');
    const after = run(root, 'status');
    assert.ok(after.ledger.waves.some((w) => w.units.includes('W5')), 'a closed investigate releases its dependents');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
