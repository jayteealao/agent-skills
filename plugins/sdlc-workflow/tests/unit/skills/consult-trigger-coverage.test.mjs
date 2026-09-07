// Drift guards for the consult objective-trigger posture (v9.135.0 primary six,
// v9.136.0 intake three, v9.139.0 weak-remainder sweep of 18 secondary stages).
// The diagnosed failure mode was consult authored behind SELF-GRADED discretion
// ("when clearly valuable", "otherwise just offer it") — a model optimistic about
// its own just-written work never rates it risky, so the free second opinion got
// punted to the user as a next-step. These tests pin the cure repo-wide: every
// consult second-opinion block auto-invokes on objective triggers, and the weak
// vocabulary may never reappear anywhere in either tree's reference set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const trees = [
  { name: 'main', root: pluginRoot },
];

const refDir = (root) => path.join(root, 'skills', 'wf', 'reference');
const ref = (root, rel) => readFileSync(path.join(refDir(root), rel), 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

// The v9.139.0 sweep — every secondary stage that carried a weak block.
const SWEPT = [
  'augment/benchmark.md', 'augment/experiment.md', 'augment/instrument.md', 'augment/profile.md',
  'docs.md',
  'ship-plan/init.md', 'ship-plan/build.md', 'ship-plan/audit.md',
  'observability/init.md', 'observability/build.md', 'observability/audit.md',
  'slice.md', 'probe.md', 'retro.md',
  'implement.md', 'ship.md', 'ship/announce.md', 'simplify.md',
  // WORK-WITHOUT-A-HOME W4 — both new surfaces carry objective triggers from birth:
  // task fires at the authorization gate (shared-env/external-party/irreversible,
  // credentials/billing/prod data, no rollback); audit fires on zero-findings-on-a-
  // large-surface, any BLOCKER, needs-runtime-evidence, or a sensitive surface.
  'task.md', 'intake/audit.md',
];

test('sweep — every formerly-weak stage carries an objective-trigger block that auto-invokes', () => {
  for (const { name, root } of trees) {
    for (const rel of SWEPT) {
      const src = ref(root, rel);
      assert.match(src, /Auto second opinion \(objective triggers\)/,
        `${name}/${rel}: lost the objective-trigger consult block`);
      assert.match(src, /auto-invoke/i, `${name}/${rel}: consult reverted to offer-only`);
      // Wrap-tolerant: "when\n> ANY of" is legal inside a blockquote.
      assert.match(src, /when[\s>]+ANY of/, `${name}/${rel}: lost the objective trigger list`);
    }
  }
});

test('posture — the self-graded-discretion vocabulary is extinct across both reference trees', () => {
  for (const { name, root } of trees) {
    for (const file of walk(refDir(root))) {
      const src = readFileSync(file, 'utf8');
      const rel = path.relative(refDir(root), file);
      assert.ok(!/Optional second opinion/.test(src),
        `${name}/${rel}: an "Optional second opinion" block reappeared — consult blocks must auto-invoke on objective triggers`);
      assert.ok(!/otherwise (just )?offer it/.test(src),
        `${name}/${rel}: the "otherwise offer it" punt reappeared`);
      assert.ok(!/self-run when clearly valuable/i.test(src),
        `${name}/${rel}: the self-graded "when clearly valuable" gate reappeared`);
    }
  }
});

test('dialect — trigger blocks use the canonical /consult spelling (single-source: $consult lives only in _host-invocation.md)', () => {
  for (const rel of SWEPT) {
    const main = ref(pluginRoot, rel);
    // Wrap-tolerant: the invocation may break as "`/consult\n> codex <…>`".
    assert.match(main, /`\/consult[\s>]+codex/, `${rel}: trigger block lost the /consult invocation`);
    assert.ok(!/\$consult/.test(main), `${rel}: a $consult token leaked into shared prose — the host sigil maps in _host-invocation.md`);
  }
});

// WIDE-VIEW-REPAIR-PLAN §10.5 — the trigger vocabulary is exclusive. Every
// backticked kebab-case name a consult block cites must be a row of
// `_consult-triggers.md`; a stage may not invent a trigger the table lacks.
// The scan covers every "Auto second opinion" / "Second opinion" / "Consult
// pre-mortem" paragraph (blockquote-wrapped or not) across the reference tree.
test('triggers — every trigger name a consult block cites is a row in _consult-triggers.md', () => {
  for (const { name, root } of trees) {
    const table = ref(root, '_consult-triggers.md');
    const rows = [...table.matchAll(/^\| `([a-z][a-z0-9-]*)` \|/gm)].map((m) => m[1]);
    assert.ok(rows.length >= 29, `${name}: the trigger table lost rows (${rows.length})`);
    assert.equal(new Set(rows).size, rows.length, `${name}: duplicate trigger rows`);
    const known = new Set(rows);
    // Words that are legitimately backticked inside these paragraphs but are not triggers.
    const NOT_TRIGGERS = new Set(['codex', 'claude', 'consult-runs', 'sdlc-debt', 'intent-risk', 'carried', 'ship-with-caveats', 'severity', 'trigger', 'provider', 'at']);
    const cited = new Set();
    for (const file of walk(refDir(root))) {
      if (file.endsWith('_consult-triggers.md')) continue;
      const src = readFileSync(file, 'utf8');
      const rel = path.relative(refDir(root), file);
      const blocks = src.match(/\*\*(?:Auto second opinion|Second opinion|Consult pre-mortem)[^\n]*(?:\n>[^\n]*)*/g) ?? [];
      for (const block of blocks) {
        if (!/_consult-triggers\.md/.test(block)) continue; // legacy prose blocks name no triggers
        for (const m of block.matchAll(/`([a-z][a-z0-9]*(?:-[a-z0-9]+)+)`/g)) {
          const word = m[1];
          if (NOT_TRIGGERS.has(word)) continue;
          cited.add(word);
          assert.ok(known.has(word), `${name}/${rel}: cites trigger \`${word}\` that _consult-triggers.md does not list`);
        }
      }
    }
    assert.ok(cited.size >= 20, `${name}: expected the primary stages to cite the table (${cited.size} names cited)`);
  }
});
