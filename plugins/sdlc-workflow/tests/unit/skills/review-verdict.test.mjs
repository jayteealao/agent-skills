// A review verdict has one rule, in the findings ledger. The ad-hoc review cites that rule,
// so one diff never gets two verdicts: an open MED is ship-with-caveats in each mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ref = (...p) => readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', ...p), 'utf8');

test('the findings ledger owns the verdict rule', () => {
  const ledger = ref('_findings-ledger.md');
  assert.match(ledger, /status `open`, `deferred` or `could-not-fix`/);
  assert.match(ledger, /An open HIGH or MED, and no BLOCKER → `ship-with-caveats`/);
});

test('the ad-hoc review cites the verdict rule and keeps no copy of its own', () => {
  const adhoc = ref('review', '_ad-hoc.md');
  assert.match(adhoc, /verdict rule of \[_findings-ledger\.md\]\(\.\.\/_findings-ledger\.md\)/);
  assert.match(adhoc, /An open MED is `ship-with-caveats`, and a deferred finding counts as open/);
  assert.doesNotMatch(adhoc, /caveats = high only/i);
});
