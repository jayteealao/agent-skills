// WF-CAMPAIGN-SLICE-ORDER-PLAN — the CLI side in scripts/campaign.mjs: `needs add --kind
// merge` (D4), the drop record (D5), the version 2 upgrade and `sort-waits` (5.2, 5.3),
// `slice-order add` (4.4), the Cross-Unit Needs check of `wave start` (4.7), `await`
// with a person's needs change (4.3), and `unit absorb` and `unit defer` (5.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(pluginRoot, 'scripts', 'campaign.mjs');
const B = 'realism';
if (!process.env.SDLC_HOME?.trim()) process.env.SDLC_HOME = mkdtempSync(path.join(os.tmpdir(), 'campaign-home-'));

const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function runIn(root, b, args) {
  try {
    return JSON.parse(execFileSync(process.execPath, [SCRIPT, args[0], root, b, ...args.slice(1)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    return JSON.parse(e.stdout);
  }
}
const run = (root, ...args) => runIn(root, B, args);

function packetFile(root, fm) {
  const dir = path.join(root, '.ai', 'workflows', B, 'work');
  mkdirSync(dir, { recursive: true });
  const full = {
    schema: 'sdlc/v1', type: 'work-packet', slug: B, title: `Piece ${fm.key}`, form: 'intake', 'target-slug': null,
    urgency: 'normal', revision: 1, 'origin-brainstorm': B, order: 1, 'depends-on': [], provides: [], expects: [],
    'carried-decisions': [], 'ux-impact': 'none', state: 'proposed', 'routed-to': null, ...fm,
  };
  writeFileSync(path.join(dir, `${fm['work-slug']}.md`), `---\n${JSON.stringify(full, null, 2)}\n---\n\n# ${full.title}\n`);
}

const ISOLATION = { parallel: true, 'port-env': { PORT: 3000 }, 'build-dirs': ['target'], 'heavy-suites': ['npm test'], 'min-free-gb': 0 };
const ledgerFile = (root) => path.join(root, '.ai', 'workflows', B, 'work', 'campaign', 'ledger.json');
const readLedger = (root) => JSON.parse(readFileSync(ledgerFile(root), 'utf8'));
const writeLedger = (root, l) => writeFileSync(ledgerFile(root), JSON.stringify(l, null, 2));

/**
 * W1 `engine` (slices s1, s2) and W2 `squads` (slices p1, p2) in one wave. With `need`,
 * W2 needs W1 through s1 before p2. `extra` adds packets, `rosters` adds 03-slice.md texts.
 */
function makeRepo({ need = true, extra = [], slices = {} } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cord '));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'c@test');
  git(root, 'config', 'user.name', 'c');
  packetFile(root, { key: 'W1', 'work-slug': 'engine', order: 1 });
  packetFile(root, { key: 'W2', 'work-slug': 'squads', order: 2, ...(need ? { needs: [{ from: 'W1', through: 's1', before: 'p2', why: 'the tick' }] } : {}) });
  for (const p of extra) packetFile(root, p);
  writeFileSync(path.join(root, '.ai', 'workflows', B, 'work', 'index.md'), `---\n${JSON.stringify({ schema: 'sdlc/v1', type: 'work-set', slug: B, 'work-set': 'multi', 'work-revision': 1 })}\n---\n`);
  for (const [slug, list] of [['engine', ['s1', 's2']], ['squads', ['p1', 'p2']]]) {
    mkdirSync(path.join(root, '.ai', 'workflows', slug), { recursive: true });
    writeFileSync(path.join(root, '.ai', 'workflows', slug, '00-index.md'), `---\nslug: ${slug}\nslices:\n${list.map((s) => `  - {slug: ${s}, status: defined}`).join('\n')}\n---\n`);
  }
  for (const [slug, text] of Object.entries(slices)) writeFileSync(path.join(root, '.ai', 'workflows', slug, '03-slice.md'), text);
  writeFileSync(path.join(root, 'README.md'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  writeFileSync(path.join(root, '.ai', 'sdlc-config.json'), JSON.stringify({ campaign: { isolation: ISOLATION } }));
  return root;
}

function setup(root, keys = ['W1', 'W2']) {
  assert.equal(run(root, 'orient').ok, true);
  assert.equal(run(root, 'deps', 'confirm').ok, true);
  for (const [k, v] of [['forecast', 'continue'], ['target-version', 'none'], ['release-each-wave', 'false'], ['output', 'none'], ['budget', 'default']]) run(root, 'answer', k, v);
  for (const k of keys) run(root, 'unit', k, 'prepared');
}

function startWave(root) {
  setup(root);
  const st = run(root, 'wave', '1', 'start');
  assert.equal(st.ok, true, JSON.stringify(st));
  git(root, 'branch', st.branch, st.base);
  return st;
}

test('D4: needs add --kind merge writes a merge note of the wave, opens no wait, and is idempotent', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const r = run(root, 'needs', 'W2', 'add', '--kind', 'merge', '--from', 'W1', '--through', 's2', '--before', 'p1', '--why', 'CHANGELOG.md', '--by', 'driver', '--source', 'cross-unit');
    assert.equal(r.merge, true, JSON.stringify(r));
    assert.equal(r.exists, false);
    assert.equal(run(root, 'needs', 'W2', 'add', '--kind', 'merge', '--from', 'W1', '--through', 's2', '--before', 'p1', '--why', 'CHANGELOG.md').exists, true);
    const l = readLedger(root);
    assert.deepEqual(l.waves[0]['merge-notes'].map((m) => [m.a, m.aSlice, m.b, m.bSlice, m.files]), [['W1', 's2', 'W2', 'p1', 'CHANGELOG.md']]);
    assert.equal(l.units.W2.waits.length, 1, 'only the packet wait');
    assert.equal(run(root, 'needs', 'W2', 'list').mergeNotes.length, 1);
    assert.equal(run(root, 'needs', 'W2', 'add', '--kind', 'contract', '--from', 'W1', '--through', 's2').ok, false, 'a contract pair parks; it is no needs entry');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('D5: needs remove leaves a drop record; the driver cannot add the wait again; the person can', () => {
  const root = makeRepo();
  try {
    startWave(root);
    const add = ['needs', 'W2', 'add', '--kind', 'need', '--from', 'W1', '--through', 's2', '--before', 'p1', '--why', 'src/x.ts', '--evidence', 'squads/04-plan-p1.yaml:4 reads the s2 table'];
    assert.equal(run(root, ...add, '--by', 'driver').ok, true);
    const rm = run(root, 'needs', 'W2', 'remove', '--from', 'W1', '--through', 's2', '--before', 'p1');
    assert.equal(rm.dropRecord, true, JSON.stringify(rm));
    assert.equal(readLedger(root).units.W2['dropped-needs'][0].by, 'person', 'remove defaults to the person');
    assert.equal(run(root, 'needs', 'W2', 'list').dropped.length, 1);
    const again = run(root, ...add, '--by', 'driver');
    assert.equal(again.dropped, true, JSON.stringify(again));
    const back = run(root, ...add, '--by', 'person');
    assert.equal(back.ok, true, JSON.stringify(back));
    assert.equal(back.wait.state, 'open');
    const l = readLedger(root);
    assert.equal((l.units.W2['dropped-needs'] ?? []).length, 0, 'the person clears the drop record');
    assert.equal(l.units.W2.waits.find((w) => w.through === 's2').kind, 'need');
    assert.equal(l.units.W2['derived-needs'][0].evidence, 'squads/04-plan-p1.yaml:4 reads the s2 table');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('5.2, 5.3: a version 1 ledger with a driver wait refuses the launch with next sort-waits; wave sorted keeps it as a need', () => {
  const root = makeRepo();
  try {
    startWave(root);
    assert.equal(run(root, 'needs', 'W2', 'add', '--from', 'W1', '--through', 's2', '--before', 'p1', '--why', 'src/x.ts', '--evidence', 'q', '--source', 'cross-unit').ok, true);
    // Make the ledger as version 1 wrote it: no version 2 field, no kind.
    const l = readLedger(root);
    l.version = 1;
    for (const w of l.units.W2.waits) delete w.kind;
    for (const n of l.units.W2['derived-needs']) delete n.kind;
    writeLedger(root, l);
    const r = run(root, 'wave', '1', 'launch');
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.equal(r.next, 'sort-waits');
    assert.deepEqual(r.legacy.map((x) => [x.key, x.from, x.through, x.before]), [['W2', 'W1', 's2', 'p1']]);
    assert.equal(run(root, 'status').next.action, 'sort-waits');
    const s = run(root, 'wave', '1', 'sorted');
    assert.equal(s.kept, 1, JSON.stringify(s));
    const m = readLedger(root);
    assert.equal(m.version, 2);
    assert.equal(m.waves[0]['legacy-order'], undefined);
    assert.equal(m.units.W2.waits.find((w) => w.through === 's2').kind, 'need');
    const go = run(root, 'wave', '1', 'launch');
    assert.equal(go.ok, true, JSON.stringify(go));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('4.4: slice-order add writes the edge into the roster and the slice file, and refuses a cycle', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sord '));
  try {
    const dir = path.join(root, '.ai', 'workflows', 'engine');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '03-slice.md'), '---\nslug: engine\nslices:\n  - {slug: s1, status: defined}\n  - {slug: s2, status: defined}\n  - {slug: s3, status: defined}\n---\n\n# Slices\n');
    writeFileSync(path.join(dir, '03-slice-s1.md'), '---\nslice: s1\ndepends-on: []\n---\n');
    writeFileSync(path.join(dir, '04-plan.md'), '---\nslug: engine\nimplementation-order:\n  - s1\n  - s2\n  - s3\n---\n');
    const r = runIn(root, 'engine', ['slice-order', 'add', '--slice', 's1', '--after', 's3', '--why', 'the plan of s3 makes the table']);
    assert.equal(r.added, true, JSON.stringify(r));
    assert.deepEqual(r.walkOrder, ['s2', 's3', 's1']);
    assert.match(readFileSync(path.join(dir, '03-slice.md'), 'utf8'), /- \{slug: s1, status: defined, depends-on: \[s3\]\}/);
    assert.match(readFileSync(path.join(dir, '03-slice-s1.md'), 'utf8'), /depends-on: \[s3\]/);
    assert.match(readFileSync(path.join(dir, '04-plan.md'), 'utf8'), /implementation-order: \[s2, s3, s1\]/);
    assert.match(readFileSync(path.join(dir, 'index-history.jsonl'), 'utf8'), /slice-order: 's1' after 's3': the plan of s3 makes the table/);
    assert.equal(runIn(root, 'engine', ['slice-order', 'add', '--slice', 's1', '--after', 's3']).added, false, 'the same edge again adds nothing');
    const cyc = runIn(root, 'engine', ['slice-order', 'add', '--slice', 's3', '--after', 's1']);
    assert.equal(cyc.ok, false);
    assert.equal(cyc.cycle, true, JSON.stringify(cyc));
    assert.equal(runIn(root, 'engine', ['slice-order', 'add', '--slice', 's9', '--after', 's1']).ok, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('4.7: wave start refuses a Cross-Unit Needs item that no graph need covers', () => {
  const doc = (item) => `---\nslug: engine\nslices:\n  - {slug: s1, status: defined}\n---\n\n## Cross-Unit Needs\n\n${item}\n\n## Slices\n\n- s1 names squads here, outside the section\n`;
  const root = makeRepo({ need: false, slices: { engine: doc('- s2 reads the roster table that squads writes') } });
  try {
    setup(root);
    const r = run(root, 'wave', '1', 'start');
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.deepEqual(r.gaps.map((g) => [g.key, g.names]), [['W1', 'W2']]);
    assert.match(r.error, /deps <key> needs add/);
    writeFileSync(path.join(root, '.ai', 'workflows', 'engine', '03-slice.md'), doc('- none'));
    assert.equal(run(root, 'wave', '1', 'start').ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('4.3: await returns a needs change of the person, once; a driver change is not returned', () => {
  const root = makeRepo();
  try {
    startWave(root);
    assert.equal(run(root, 'wave', '1', 'launch').ok, true);
    run(root, 'needs', 'W2', 'add', '--from', 'W1', '--through', 's2', '--before', 'p1', '--evidence', 'q', '--by', 'driver');
    assert.equal(run(root, 'await', '--wave', '1', '--max', '0').timeout, true, 'a driver change is not returned');
    run(root, 'needs', 'W2', 'remove', '--from', 'W1', '--through', 's2', '--before', 'p1', '--by', 'person');
    const got = run(root, 'await', '--wave', '1', '--max', '0');
    assert.equal(got.needsChanged?.length, 1, JSON.stringify(got));
    const c = got.needsChanged[0];
    assert.deepEqual([c.key, c.from, c.through, c.before, c.action], ['W2', 'W1', 's2', 'p1', 'remove']);
    assert.match(c.id, /^nc[0-9a-f]{10}$/);
    assert.equal(run(root, 'await', '--wave', '1', '--max', '0', '--seen', c.id).timeout, true, 'a seen change does not come back');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('5.4: unit absorb puts an extension in the started wave of its target; unit defer names the unit of its slices', () => {
  const ext = { key: 'W3', 'work-slug': 'engine-more', order: 3, form: 'extension', 'target-slug': 'engine' };
  const slice = '---\nslug: engine\nslices:\n  - {slug: s1, status: defined}\n  - {slug: s2, status: defined}\n  - {slug: x1, status: defined, source: extension, extension-round: 1}\n---\n';
  for (const mode of ['absorb', 'defer']) {
    const root = makeRepo({ extra: [ext], slices: { engine: slice } });
    try {
      startWave(root);
      const before = readLedger(root);
      assert.equal(before.units.W3.wave, 2, 'an extension waits for a later wave than its target');
      if (mode === 'absorb') {
        const r = run(root, 'unit', 'W3', 'absorb');
        assert.equal(r.absorbedInto, 'W1', JSON.stringify(r));
        const l = readLedger(root);
        assert.equal(l.units.W3.wave, 1);
        assert.equal(l.units.W3.state, l.units.W1.state);
        assert.ok(!l.waves.some((w) => w.state === 'planned' && w.units.includes('W3')));
      } else {
        const r = run(root, 'unit', 'W3', 'defer');
        assert.deepEqual(r.slices, ['x1'], JSON.stringify(r));
        assert.match(readFileSync(path.join(root, '.ai', 'workflows', 'engine', '03-slice.md'), 'utf8'), /- \{slug: x1, status: defined, source: extension, extension-round: 1, unit: W3\}/);
      }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});
