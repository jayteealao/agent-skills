// WF-CAMPAIGN-ORDER-PLAN — the deps phase of /wf campaign (scripts/campaign.mjs):
// orient seeds the graph and plans no wave, the `deps` commands change the graph in
// the ledger, `deps plan` checks it with no state change, and `deps confirm` writes
// the waves. Setup, prepare and the wave start wait for the confirmation, and a
// ledger of the old form gets its graph on first load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = path.join(pluginRoot, 'scripts', 'campaign.mjs');
const B = 'limits';

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

const campDir = (root) => path.join(root, '.ai', 'workflows', B, 'work', 'campaign');
const readLedger = (root) => JSON.parse(readFileSync(path.join(campDir(root), 'ledger.json'), 'utf8'));
const writeLedger = (root, l) => writeFileSync(path.join(campDir(root), 'ledger.json'), `${JSON.stringify(l, null, 2)}\n`);
const journal = (root) => readFileSync(path.join(campDir(root), '.campaign-journal.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** A packet. `old: true` writes the four graph fields of the old form. */
function packetFile(root, fm, { old = false } = {}) {
  const dir = path.join(root, '.ai', 'workflows', B, 'work');
  mkdirSync(dir, { recursive: true });
  const full = {
    schema: 'sdlc/v1', type: 'work-packet', slug: B, title: `Piece ${fm.key}`, form: 'intake', 'target-slug': null,
    urgency: 'normal', revision: 1, 'origin-brainstorm': B, order: 1,
    ...(old ? { 'depends-on': [], provides: [], expects: [] } : {}),
    'carried-decisions': [{ key: `${fm.key}-d1`, text: `decision of ${fm.key}`, session: 's1', 'decided-at': '2026-10-01' }],
    'ux-impact': 'none', state: 'proposed', 'routed-to': null, ...fm,
  };
  writeFileSync(path.join(dir, `${fm['work-slug']}.md`), `---\n${JSON.stringify(full, null, 2)}\n---\n\n# ${full.title}\n`);
}

function workIndex(root, revision) {
  writeFileSync(path.join(root, '.ai', 'workflows', B, 'work', 'index.md'), `---\n${JSON.stringify({ schema: 'sdlc/v1', type: 'work-set', slug: B, 'work-set': 'multi', 'work-revision': revision })}\n---\n\n# Work set\n`);
}

function makeRepo({ old = false } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'campaign deps '));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'c@test');
  git(root, 'config', 'user.name', 'c');
  packetFile(root, { key: 'rows', 'work-slug': 'cost-rows', order: 1 }, { old });
  packetFile(root, { key: 'limit', 'work-slug': 'spending-limit', order: 2, 'why-here': 'the limit reads the cost rows' }, { old });
  packetFile(root, { key: 'theme', 'work-slug': 'dark-theme', order: 3, 'why-here': 'less urgent than the pieces before it' }, { old });
  workIndex(root, 1);
  writeFileSync(path.join(root, 'README.md'), 'x\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

const SETUP = [['forecast', 'continue'], ['target-version', 'none'], ['release-each-wave', 'false'], ['output', 'none'], ['budget', 'default']];

test('new packets: orient seeds the serial chain; the scout drops an edge with evidence; a shared path warns; confirm writes the waves', () => {
  const root = makeRepo();
  try {
    const o = run(root, 'orient');
    assert.equal(o.ok, true, JSON.stringify(o));
    assert.deepEqual(o.waves, []);
    assert.deepEqual(o.deps, { state: 'proposed', units: ['rows', 'limit', 'theme'], seeded: [], serial: ['rows', 'limit', 'theme'] });
    assert.equal(o.next.action, 'deps');
    const shown = run(root, 'deps', 'show');
    assert.deepEqual(shown.units.limit['depends-on'], [{ key: 'rows', why: 'the limit reads the cost rows', by: 'serial' }]);
    assert.deepEqual(shown.waves.map((w) => w.units), [['rows'], ['limit'], ['theme']], 'with no evidence, the graph is the serial chain (D5)');

    // The scout: theme is independent of limit, and limit and rows both touch one file.
    const drop = run(root, 'deps', 'theme', 'depends-on', 'remove', 'limit', '--why', 'theme changes only src/ui/theme.css; limit never reads it', '--by', 'scout');
    assert.equal(drop.ok, true, JSON.stringify(drop));
    assert.equal(drop.replan, undefined, 'an unconfirmed entry needs no replan');
    assert.equal(run(root, 'deps', 'theme', 'depends-on', 'remove', 'limit', '--why', 'again').ok, false, 'there is no such edge any more');
    assert.equal(run(root, 'deps', 'theme', 'depends-on', 'add', 'rows', '--by', 'robot', '--why', 'x').ok, false, 'an unknown --by is refused');
    run(root, 'deps', 'rows', 'paths', '--set', 'src/billing/rows.ts');
    run(root, 'deps', 'theme', 'paths', '--set', 'src/ui/theme.css,src/billing/rows.ts');
    run(root, 'deps', 'rows', 'provides', 'set', '--line', 'row-per-run', '--text', 'One cost row per run.', '--by', 'scout');
    run(root, 'deps', 'limit', 'expects', 'set', '--from', 'rows', '--line', 'row-per-run', '--text', 'One cost row per run.', '--by', 'scout');

    const plan = run(root, 'deps', 'plan');
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.errors, []);
    assert.deepEqual(plan.serial, [['rows'], ['limit'], ['theme']]);
    assert.deepEqual(plan.waves.map((w) => w.units), [['rows', 'theme'], ['limit']]);
    assert.deepEqual(plan.shared, [{ wave: 1, a: 'rows', b: 'theme', path: 'src/billing/rows.ts' }], 'a shared path warns, and never refuses');
    assert.deepEqual(plan.dropped.map((d) => `${d.unit}<-${d.from}:${d.by}`), ['theme<-limit:scout']);
    assert.deepEqual(readLedger(root).waves, [], 'deps plan changes no state');

    const c = run(root, 'deps', 'confirm');
    assert.equal(c.ok, true, JSON.stringify(c));
    assert.deepEqual(c.confirmed, ['rows', 'limit', 'theme']);
    assert.deepEqual(c.waves, [['rows', 'theme'], ['limit']]);
    assert.deepEqual(c.next, { action: 'setup', question: 'forecast', command: 'Type `/wf campaign limits`.' });
    const l = readLedger(root);
    assert.equal(l.deps.state, 'confirmed');
    assert.deepEqual(l.waves[0]['expected-shared'], [{ a: 'rows', b: 'theme', path: 'src/billing/rows.ts' }]);
    assert.ok(Object.values(l.deps.units).every((e) => e['confirmed-at']));
    const events = journal(root).map((x) => x.event);
    assert.ok(events.includes('deps-confirm'));
    assert.equal(events.filter((e) => e === 'deps-change').length, 5, 'one line per change; a refused change writes none');
    assert.match(readFileSync(path.join(campDir(root), 'ledger.md'), 'utf8'), /## Dependency graph/);

    // After the confirmation, a change needs replan.
    const late = run(root, 'deps', 'limit', 'needs', 'add', '--from', 'theme', '--through', 'finished', '--why', 'the limit banner uses the theme colours', '--by', 'prepare');
    assert.equal(late.ok, true, JSON.stringify(late));
    assert.equal(late.replan, true);
    const r = run(root, 'replan');
    assert.equal(r.ok, true, JSON.stringify(r));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('deps confirm refuses a cycle; setup, prepare and the wave start wait for the confirmation', () => {
  const root = makeRepo();
  try {
    run(root, 'orient');
    run(root, 'deps', 'rows', 'depends-on', 'add', 'theme', '--why', 'a wrong edge');
    const c = run(root, 'deps', 'confirm');
    assert.equal(c.ok, false);
    assert.ok(c.errors.some((e) => /cycle/.test(e)), JSON.stringify(c));
    assert.equal(run(root, 'answer', 'forecast', 'continue').ok, false, 'setup refuses while the graph is proposed');
    assert.equal(run(root, 'unit', 'rows', 'prepared').ok, false, 'prepare refuses an unconfirmed unit');
    assert.equal(run(root, 'status').next.action, 'deps');
    run(root, 'deps', 'rows', 'depends-on', 'remove', 'theme', '--why', 'the person: rows comes first');
    assert.equal(run(root, 'deps', 'confirm').ok, true);
    assert.equal(run(root, 'status').next.action, 'setup');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a ledger with no deps gets it on first load: the started wave keeps its graph, the other units need the deps phase', () => {
  const root = makeRepo({ old: true });
  try {
    run(root, 'orient');
    run(root, 'deps', 'theme', 'depends-on', 'add', 'limit', '--why', 'old graph');
    assert.equal(run(root, 'deps', 'confirm').ok, true);
    for (const [k, v] of SETUP) assert.equal(run(root, 'answer', k, v).ok, true);
    // The ledger before this release: no deps key, and no wave started yet.
    const l0 = readLedger(root);
    delete l0.deps;
    writeLedger(root, l0);
    assert.deepEqual(run(root, 'status').deps, { state: 'proposed', unconfirmed: ['rows', 'limit', 'theme'], unclassified: 0 });
    assert.equal(run(root, 'unit', 'rows', 'prepared').ok, false);
    assert.equal(run(root, 'deps', 'confirm').ok, true);
    run(root, 'unit', 'rows', 'prepared');
    run(root, 'unit', 'limit', 'prepared');
    const st = run(root, 'wave', '1', 'start');
    assert.equal(st.ok, true, JSON.stringify(st));
    assert.deepEqual(st.units.map((u) => u.key), ['rows', 'limit']);

    // The same ledger with a started wave, before this release.
    const l1 = readLedger(root);
    delete l1.deps;
    writeLedger(root, l1);
    const s = run(root, 'status');
    assert.deepEqual(s.deps, { state: 'proposed', unconfirmed: ['theme'], unclassified: 0 }, 'the units of the started wave keep their graph');
    assert.deepEqual(s.ledger.waves.map((w) => w.units), [['rows', 'limit'], ['theme']], 'the migration changes no wave');
    assert.equal(run(root, 'deps', 'rows', 'provides', 'set', '--line', 'x', '--text', 'y').ok, false, 'a unit of a started wave changes only through needs and contract');
    const c = run(root, 'deps', 'confirm');
    assert.deepEqual(c.confirmed, ['theme']);
    assert.deepEqual(c.waves, [['rows', 'limit'], ['theme']]);
    assert.equal(readLedger(root).waves[0].state, 'running');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the wave start refuses a unit of the wave whose graph is not confirmed', () => {
  const root = makeRepo({ old: true });
  try {
    run(root, 'orient');
    assert.equal(run(root, 'deps', 'confirm').ok, true);
    for (const [k, v] of SETUP) run(root, 'answer', k, v);
    for (const k of ['rows', 'limit', 'theme']) run(root, 'unit', k, 'prepared');
    const l = readLedger(root);
    l.deps.units.theme['confirmed-at'] = null;
    writeLedger(root, l);
    const st = run(root, 'wave', '1', 'start');
    assert.equal(st.ok, false);
    assert.deepEqual(st.unconfirmed, ['theme']);
    assert.ok(existsSync(path.join(campDir(root), 'ledger.md')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
