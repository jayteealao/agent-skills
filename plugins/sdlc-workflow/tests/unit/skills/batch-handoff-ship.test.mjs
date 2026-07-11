// Drift guards for the branch-scoped batch handoff/ship + revision-ledger work
// (v9.105.0). Two invariants, checked in BOTH trees so a codex mirror that
// silently drops the feature fails CI:
//   1. handoff.md / ship.md / status.md — and recap.md / retro.md — carry the
//      polymorphic first-token resolution (slug | pr#N | branch) — the entry
//      point for batch mode.
//   2. The additive-write contract is the ledger model, not the old in-body
//      `## Revision N` append pattern; the revisable references teach the ledger.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const codexRoot = path.resolve(pluginRoot, '..', 'sdlc-workflow-codex');

const trees = [
  { name: 'main', root: pluginRoot },
  { name: 'codex', root: codexRoot },
].filter((t) => existsSync(path.join(t.root, 'skills')));

function ref(root, name) {
  return readFileSync(path.join(root, 'skills', 'wf', 'reference', name), 'utf8');
}

test('handoff + ship + status expose polymorphic first-token resolution (batch entry point)', () => {
  for (const { name, root } of trees) {
    for (const file of ['handoff.md', 'ship.md', 'status.md']) {
      const src = ref(root, file);
      // Must accept a PR reference and resolve it to a branch.
      assert.match(src, /pr#N|pr#<N>|`#N`/, `${name}: ${file} lost the pr#N first-token form`);
      assert.match(src, /headRefName/, `${name}: ${file} lost the PR→branch resolution (gh pr view headRefName)`);
      // Must build a branch roster.
      assert.match(src, /roster/i, `${name}: ${file} lost the branch roster concept`);
    }
  }
});

test('recap + retro expose polymorphic first-token resolution + branch roster (batch entry point)', () => {
  for (const { name, root } of trees) {
    for (const file of ['recap.md', 'retro.md']) {
      const src = ref(root, file);
      // Must accept a PR reference and resolve it to a branch.
      assert.match(src, /pr#N|pr#<N>|`#N`/, `${name}: ${file} lost the pr#N first-token form`);
      assert.match(src, /headRefName/, `${name}: ${file} lost the PR→branch resolution (gh pr view headRefName)`);
      // Must build a branch roster and record it in frontmatter.
      assert.match(src, /roster/i, `${name}: ${file} lost the branch roster concept`);
      assert.match(src, /branch-slugs/, `${name}: ${file} lost the branch-slugs roster field`);
    }
    // recap batch is whole-workflow only (no slice/focus); retro batch adds the cross-slug synthesis.
    assert.match(ref(root, 'recap.md'), /recap-scope/, `${name}: recap.md lost recap-scope`);
    assert.match(ref(root, 'retro.md'), /retro-scope/, `${name}: retro.md lost retro-scope`);
    assert.match(ref(root, 'retro.md'), /cross-slug/i, `${name}: retro.md lost the cross-slug lesson synthesis (the batch value-add)`);
  }
});

test('handoff carries the lead-slug + fingerprint + AND-verdict batch machinery', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'handoff.md');
    assert.match(src, /handoff-lead/, `${name}: handoff.md lost handoff-lead (branch readiness owner)`);
    assert.match(src, /handoff-fingerprint/, `${name}: handoff.md lost the fingerprint no-op guard`);
    assert.match(src, /readiness-via/, `${name}: handoff.md lost the follower readiness-via pointer`);
    assert.match(src, /pr-readiness-verdict/, `${name}: handoff.md lost the branch-level AND verdict`);
  }
});

test('ship enforces all-or-nothing across the branch roster + single-run ownership', () => {
  for (const { name, root } of trees) {
    const src = ref(root, 'ship.md');
    assert.match(src, /all-or-nothing/i, `${name}: ship.md lost the all-or-nothing batch gate`);
    assert.match(src, /ship-scope/, `${name}: ship.md lost ship-scope`);
    assert.match(src, /shipped-via/, `${name}: ship.md lost the follower shipped-via pointer`);
  }
});

test('additive-write is the ledger model, not in-body Revision-N append', () => {
  for (const { name, root } of trees) {
    const src = ref(root, '_additive-write.md');
    // Positive: teaches the frontmatter revisions ledger + no-op guard.
    assert.match(src, /revisions:/, `${name}: _additive-write.md lost the revisions ledger`);
    assert.match(src, /No-op guard/i, `${name}: _additive-write.md lost the no-op guard`);
    // Negative: must NOT instruct appending `## Revision N` body sections.
    assert.doesNotMatch(
      src,
      /Append\*?\*? a new section to the body/i,
      `${name}: _additive-write.md still teaches the retired in-body Revision-N append`,
    );
  }
});
