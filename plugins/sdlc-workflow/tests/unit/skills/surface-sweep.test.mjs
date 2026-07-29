// Drift guards for the SURFACE-SWEEP build (W1-W6).
//
// Origin: the 2026-07-24 Playster `/wf probe editorial-reader-redesign` run.
// Of its 12 findings exactly ONE came from an AC; three came from the slug's
// `charter:` constraints — a block probe.md never read — and the rest from an
// unwritten defect taxonomy the model happened to carry. W1 makes the charter
// and the taxonomy structural, W2 makes coverage auditable, W3 adds the `sweep`
// mode, W4 makes the method's own boundary declarable, W5 induces the failure
// branch instead of waiting for it, W6 stops a single corrupted observation
// from becoming a HIGH finding.
//
// These tests pin the load-bearing phrases so a future edit cannot silently
// drop a gate. Reference prose is mirrored to the codex tree (with `$wf` in
// place of `/wf`), so every guard iterates BOTH trees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const codexRoot = path.resolve(pluginRoot, '..', 'sdlc-workflow-codex');

const trees = [
  { name: 'main', root: pluginRoot },
  { name: 'codex', root: codexRoot },
].filter((t) => existsSync(path.join(t.root, 'skills', 'wf', 'reference')));

const refPath = (root, rel) => path.join(root, 'skills', 'wf', 'reference', rel);
const ref = (root, rel) => readFileSync(refPath(root, rel), 'utf8');

const CLASSES = [
  'dead-affordance',
  'error-surface-leak',
  'terminal-wait',
  'fabricated-value',
  'dependency-collapse',
  'branch-gap',
  'boundary-overflow',
  'env-interference',
];

const ADAPTERS = ['web', 'android', 'ios', 'cli', 'desktop', 'service', 'notebook'];

// ── W1 — comparison basis: charter + taxonomy ────────────────────────────────
test('W1.1 — probe Step 0 parses the charter block', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'probe.md');
    assert.match(src, /`charter:` block/,
      `${name}: probe Step 0 no longer names the charter block`);
    // The charter must be parsed in Step 0, i.e. before Step 1.
    assert.ok(src.indexOf('`charter:` block') < src.indexOf('# Step 1 —'),
      `${name}: the charter read drifted out of Step 0`);
  }
});

test('W1.1 — Step 5 compares against charter constraints at their own weight', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'probe.md');
    assert.match(src, /Comparison basis \(MANDATORY\)/,
      `${name}: probe lost the Step 5 comparison-basis block`);
    assert.match(src, /charter constraint.*whose subject the observation touches/s,
      `${name}: charter constraints are no longer a comparison basis`);
    assert.match(src, /finding at the constraint's own weight whether or not any AC covers it/,
      `${name}: a constraint violation no longer stands on its own without an AC`);
  }
});

test('W1.2 — the taxonomy file exists and defines every class', () => {
  for (const { name, root } of trees) {
    const p = refPath(root, '_surface-defects.md');
    assert.ok(existsSync(p), `${name}: _surface-defects.md is missing`);
    const src = readFileSync(p, 'utf8');
    for (const c of CLASSES) {
      assert.ok(src.includes(`\`${c}\``), `${name}: taxonomy lost the \`${c}\` class`);
      // Every class carries a detection question, not just a name.
      assert.match(src, new RegExp(`### \`${c}\`[\\s\\S]{0,400}?\\*\\*Question:\\*\\*`),
        `${name}: \`${c}\` has no detection question`);
    }
  }
});

test('W1.4 — severity discipline and the growth rule survive', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_surface-defects.md');
    assert.match(src, /one line.*in the coverage table.*never a paragraph of reassurance/s,
      `${name}: the anti-grind rule (one line per silent class) is gone`);
    assert.match(src, /leads with the top five/,
      `${name}: the >15-findings short-list rule is gone`);
    assert.match(src, /A class earns a row here only when a \*\*real run produced it\*\*/,
      `${name}: the growth rule (no speculative classes) is gone`);
  }
});

test('W1.2 — the taxonomy is wired into review dimensions and verify', () => {
  for (const { name, root } of trees) {
    for (const dim of ['reliability.md', 'correctness.md', 'ux-copy.md']) {
      assert.match(ref(root, path.join('review', dim)), /_surface-defects\.md/,
        `${name}: review/${dim} no longer cites the shared taxonomy`);
    }
    assert.match(ref(root, 'verify.md'), /_surface-defects\.md/,
      `${name}: verify's runtime leg no longer cites the shared taxonomy`);
  }
});

// ── W2 — enumeration ladder + coverage accounting ────────────────────────────
test('W2.1 — every adapter ships an Enumerate section', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'runtime-adapters.md');
    for (const key of ADAPTERS) {
      const block = src.split(`# Adapter: \`${key}\``)[1];
      assert.ok(block, `${name}: adapter \`${key}\` is missing from the registry`);
      const body = block.split('\n# Adapter:')[0];
      assert.match(body, /^## Enumerate$/m, `${name}: adapter \`${key}\` has no Enumerate section`);
      // Enumerate must precede Drive — you inventory before you drive.
      assert.ok(body.indexOf('## Enumerate') < body.indexOf('## Drive'),
        `${name}: \`${key}\` Enumerate drifted after Drive`);
    }
  }
});

test('W2.1a — the enumeration ladder names all four rungs and the floor caveat', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'runtime-adapters.md');
    assert.match(src, /Surface enumeration ladder/,
      `${name}: the enumeration ladder is gone`);
    for (const rung of ['recipe', 'static', 'traversal', 'named']) {
      assert.ok(src.includes(`\`${rung}\``), `${name}: ladder lost the \`${rung}\` rung`);
    }
    assert.match(src, /FLOOR, not a total/,
      `${name}: a traversal denominator is no longer described as a floor`);
    assert.match(src, /an adapter with no recipe is \*\*NOT unsupported\*\*/i,
      `${name}: the recipe-less adapter is no longer explicitly supported`);
  }
});

test('W2.1a — a recipe-less adapter is never called unsupported', () => {
  for (const { name, root } of trees) {
    for (const rel of ['runtime-adapters.md', 'probe.md']) {
      const src = ref(root, rel);
      for (const line of src.split('\n')) {
        if (!/unsupported/i.test(line)) continue;
        assert.match(line, /NOT unsupported|not unsupported/,
          `${name}: ${rel} calls something unsupported without the negation: ${line.trim()}`);
      }
    }
  }
});

test('W2.2 — the coverage block and enumeration-method reach the artifact', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'probe.md');
    assert.match(src, /surface-coverage:/, `${name}: probe lost the surface-coverage frontmatter`);
    assert.match(src, /enumeration-method: recipe \| static \| traversal \| named/,
      `${name}: enumeration-method is not in the frontmatter contract`);
    assert.match(src, /out-of-authority/,
      `${name}: out-of-authority is no longer a first-class unreached class`);
    assert.match(src, /environment-class: production \| staging \| local-emulated \| mocked/,
      `${name}: environment-class lost its four values`);
  }
});

test('W2.2 — the traversal floor is stated wherever the count is rendered', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'probe.md');
    // Once in the frontmatter contract...
    assert.match(src, /a FLOOR when enumeration-method is `traversal`/,
      `${name}: the frontmatter no longer marks a traversal count as a floor`);
    // ...and once for the chat return, so the caveat is not file-only.
    assert.match(src, /chat return[\s\S]{0,400}?denominator is a floor/,
      `${name}: the chat return no longer states the floor caveat`);
  }
});

test('W2.3 — a zero-finding sweep must still render coverage', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'probe.md');
    assert.match(src, /In `sweep` mode that alone is insufficient/,
      `${name}: a zero-finding sweep can again report "No findings" alone`);
    assert.match(src, /"I found no bugs" is not a result/,
      `${name}: the coverage-over-count principle is gone`);
  }
});

// ── W3 — the sweep mode ──────────────────────────────────────────────────────
test('W3.1 — sweep is a reserved keyword, not a target string', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'probe.md');
    assert.match(src, /`sweep` \(reserved keyword\)/,
      `${name}: sweep is no longer reserved in the argument grammar`);
    assert.match(src, /`sweep` is reserved in both positions/,
      `${name}: sweep is not reserved in both token positions`);
  }
});

test('W3.2 — the slug-less form and its project-level artifact are documented', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'probe.md');
    assert.match(src, /first-token resolution/,
      `${name}: probe no longer owns its first-token resolution`);
    assert.match(src, /\.ai\/surface-sweep-<utc-date>\.md/,
      `${name}: the slug-less artifact destination is gone`);
    assert.match(src, /no `00-index\.md` mutation/,
      `${name}: a slug-less sweep no longer promises to leave the index alone`);
  }
});

test('W3 — SKILL.md probe row matches probe.md grammar (drift guard)', () => {
  for (const { name, root } of trees) {
    const skill = readFileSync(path.join(root, 'skills', 'wf', 'SKILL.md'), 'utf8');
    const row = skill.split('\n').find((l) => l.startsWith('| `probe`'));
    assert.ok(row, `${name}: SKILL.md has no probe row`);
    assert.match(row, /sweep/, `${name}: SKILL.md probe row never mentions sweep`);
    assert.match(row, /_surface-defects\.md/,
      `${name}: SKILL.md probe row does not point at the taxonomy`);
    assert.ok(!/Slug-only/.test(row),
      `${name}: SKILL.md still calls probe slug-only after the slug-less sweep landed`);
  }
});

// ── W4 — decidability ────────────────────────────────────────────────────────
test('W4.1 — decidability is declared BEFORE driving', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'probe.md');
    assert.match(src, /Declare decidability BEFORE driving/,
      `${name}: the decidability declaration is gone`);
    // Ordering is the whole point: it sits in Step 0, ahead of Step 5's drive.
    assert.ok(src.indexOf('Declare decidability BEFORE driving') < src.indexOf('# Step 5 —'),
      `${name}: the decidability declaration drifted after the drive step`);
    assert.match(src, /decidability:/, `${name}: the decidability frontmatter block is gone`);
  }
});

test('W4.2 — every not-observable row routes somewhere that exists', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_surface-defects.md');
    assert.match(src, /Standing not-observable set/,
      `${name}: the standing not-observable set is gone`);
    for (const kind of [
      'Statistical / generative correctness',
      'Long-horizon behavior',
      'Concurrency and load',
      'Absence properties',
      'Library / SDK / compiler / runtime correctness',
      'Embedded / real-time / continuous surfaces',
    ]) {
      assert.ok(src.includes(kind), `${name}: not-observable set lost "${kind}"`);
    }
    // The routes it names must resolve to real dimension files.
    for (const dim of ['backend-concurrency.md', 'scalability.md', 'security.md', 'api-contracts.md']) {
      assert.ok(src.includes(dim), `${name}: not-observable set no longer routes to ${dim}`);
      assert.ok(existsSync(refPath(root, path.join('review', dim))),
        `${name}: not-observable set routes to review/${dim}, which does not exist`);
    }
  }
});

test('W4.3 — a primary unobservable class is announced before any finding', () => {
  for (const { name, root } of trees) {
    assert.match(ref(root, '_surface-defects.md'), /Refuse rather than under-report/,
      `${name}: the refuse-rather-than-under-report rule is gone`);
    assert.match(ref(root, 'probe.md'), /before any finding/,
      `${name}: probe no longer front-loads an unobservable primary class`);
  }
});

test('W4 — the two axes stay separate (tooling gap vs method gap)', () => {
  for (const { name, root } of trees) {
    for (const rel of ['_surface-defects.md', 'runtime-adapters.md']) {
      // Emphasis markers vary between the two files; the distinction is what matters.
      assert.match(ref(root, rel), /\*?tooling\*? gap[\s\S]{0,240}?\*?method\*? gap/,
        `${name}: ${rel} no longer distinguishes a tooling gap from a method gap`);
    }
  }
});

// ── W5 — perturbation ────────────────────────────────────────────────────────
test('W5.1 — every adapter ships a Perturb section', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'runtime-adapters.md');
    for (const key of ADAPTERS) {
      const body = src.split(`# Adapter: \`${key}\``)[1].split('\n# Adapter:')[0];
      assert.match(body, /^## Perturb$/m, `${name}: adapter \`${key}\` has no Perturb section`);
      assert.ok(body.indexOf('## Perturb') < body.indexOf('## Tear down'),
        `${name}: \`${key}\` Perturb drifted after Tear down`);
    }
  }
});

test('W5.2 — perturbation is bounded by authority and cites the env-remediation rung', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'runtime-adapters.md');
    assert.match(src, /Perturbation protocol/, `${name}: the shared perturbation protocol is gone`);
    assert.match(src, /One dependency at a time/, `${name}: the one-fault rule is gone`);
    assert.match(src, /Always reversible, always restored/, `${name}: the restore rule is gone`);
    assert.match(src, /Never state the run does not own/,
      `${name}: perturbation lost its authority boundary`);
    // It must CITE the existing rung rather than restate a parallel rule.
    assert.match(src, /same boundary as the env-remediation\s+rung above, which this cites rather than restates/,
      `${name}: perturbation no longer cites the env-remediation rung`);
    assert.match(src, /without explicit\s+authorization/,
      `${name}: perturbing a shared/production backend no longer needs authorization`);
  }
});

test('W5.3 — perturbation is tied to the classes it exists to find', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'runtime-adapters.md');
    assert.match(src, /`dependency-collapse` and `branch-gap`/,
      `${name}: the perturbation protocol no longer names its target classes`);
  }
});

// ── W6 — observation hygiene ─────────────────────────────────────────────────
test('W6.1 — findings above low get a clean-state re-observation', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'probe.md');
    assert.match(src, /Re-observe before recording \(MANDATORY\)/,
      `${name}: the re-observation rule is gone`);
    assert.match(src, /above `low`/, `${name}: the re-observation threshold is gone`);
    assert.match(src, /clean state/, `${name}: clean-state re-observation is no longer required`);
    assert.match(src, /Corroboration by\s+two tools does NOT satisfy this/,
      `${name}: the corroboration-is-not-enough rule is gone — this is the whole point of W6`);
  }
});

test('W6.3 — retractions are structural, not prose', () => {
  for (const { name, root } of trees) {
    assert.match(ref(root, 'probe.md'), /retracted-findings:/,
      `${name}: retracted-findings is no longer in the frontmatter contract`);
  }
});

test('W6.2 — env-interference explains a withdrawal rather than padding findings', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_surface-defects.md');
    assert.match(src, /### `env-interference`[\s\S]{0,600}?not a product finding by default/,
      `${name}: env-interference is no longer anchored as a non-finding by default`);
  }
});

// ── Cross-tree hygiene ───────────────────────────────────────────────────────
test('main tree spells the commands it names (no shell path mangling)', () => {
  // Git Bash rewrites a bare `/wf` argument into `C:/Program Files/Git/wf`.
  // This landed in probe.md once; the guard makes the class non-recurring.
  const main = trees.find((t) => t.name === 'main');
  for (const rel of ['_surface-defects.md', 'probe.md', 'runtime-adapters.md']) {
    const src = ref(main.root, rel);
    assert.ok(!/Program Files/.test(src),
      `main: ${rel} carries a shell-mangled path where a command spelling belongs`);
  }
  const probe = ref(main.root, 'probe.md');
  assert.match(probe, /`\/wf probe sweep \[path\]`/,
    'main: probe.md no longer spells the slug-less invocation');
  for (const cmd of ['/wf intake fix', '/wf intake rca']) {
    assert.ok(probe.includes(cmd), `main: probe.md lost the \`${cmd}\` routing target`);
  }
});

test('codex mirror carries no `/wf` spelling in the new surfaces', () => {
  const codex = trees.find((t) => t.name === 'codex');
  if (!codex) return; // codex tree not present in this checkout
  for (const rel of ['_surface-defects.md', 'probe.md', 'runtime-adapters.md']) {
    const src = ref(codex.root, rel);
    // Command spelling only — relative paths like `../../wf/reference/x.md` are legitimate.
    const hits = src.split('\n').filter((l) => /(?<![\w./-])\/wf\b/.test(l));
    assert.equal(hits.length, 0,
      `codex: ${rel} carries Claude \`/wf\` spelling:\n  ${hits.slice(0, 3).join('\n  ')}`);
  }
});
