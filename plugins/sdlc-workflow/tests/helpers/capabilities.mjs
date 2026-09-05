// tests/helpers/capabilities.mjs — inventory lookups for skill tests
// (WIDE-VIEW-REPAIR-PLAN §3.5, outcome 2 "Convert").
//
// A sentence-match assertion (`assert.match(text, /exact wording/)`) breaks on
// every rewording. When the capability the sentence guards is in the inventory,
// replace the match with `hasCapability(file, category, entry)` and the test
// survives the cut while still failing when the capability is gone.
//
//   import { hasCapability, inventory } from '../../helpers/capabilities.mjs';
//   assert.ok(hasCapability('skills/wf/reference/plan.md', 'stops', 'if missing stop.'));
//   assert.ok(hasCapability('*', 'invocations', '/wf intake fix'));   // tree-wide
//
// The inventory is extracted from the WORKING TREE, not the baseline, so a test
// asserts what the prose says today.
import { extractInventory, PER_FILE_CATEGORIES, TREE_WIDE_CATEGORIES } from '../../scripts/extract-capabilities.mjs';

let cached = null;

/** The working-tree inventory, extracted once per process. */
export function inventory() {
  if (!cached) cached = extractInventory();
  return cached;
}

/**
 * True when `entry` is recorded for `category`. Per-file categories need the
 * plugin-relative posix `file`; tree-wide categories take `'*'` (or any file).
 */
export function hasCapability(file, category, entry) {
  const inv = inventory();
  if (TREE_WIDE_CATEGORIES.includes(category)) return inv.treeWide[category].includes(entry);
  if (!PER_FILE_CATEGORIES.includes(category)) throw new Error(`unknown capability category: ${category}`);
  const f = inv.files[file];
  return Boolean(f && f[category].includes(entry));
}

/** Every entry of one category in one file (or tree-wide), for discovery in a REPL. */
export function capabilitiesOf(file, category) {
  const inv = inventory();
  if (TREE_WIDE_CATEGORIES.includes(category)) return inv.treeWide[category];
  return inv.files[file]?.[category] ?? [];
}
