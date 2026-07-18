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
const codexRoot = path.resolve(pluginRoot, '..', 'sdlc-workflow-codex');

const trees = [
  { name: 'main', root: pluginRoot },
  { name: 'codex', root: codexRoot },
].filter((t) => existsSync(path.join(t.root, 'skills', 'wf', 'reference')));

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

test('dialect — codex trigger blocks use $consult, main uses /consult', () => {
  for (const rel of SWEPT) {
    const main = ref(pluginRoot, rel);
    // Wrap-tolerant: the invocation may break as "`/consult\n> codex <…>`".
    assert.match(main, /`\/consult[\s>]+codex/, `main/${rel}: trigger block lost the /consult invocation`);
    if (!existsSync(path.join(refDir(codexRoot), rel))) continue;
    const codex = ref(codexRoot, rel);
    assert.match(codex, /\$consult[\s>]+codex/, `codex/${rel}: trigger block lost the $consult invocation`);
    assert.ok(!/`\/consult/.test(codex), `codex/${rel}: a /consult token leaked into the codex dialect`);
  }
});
