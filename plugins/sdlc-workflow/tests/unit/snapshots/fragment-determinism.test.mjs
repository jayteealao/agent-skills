// tests/unit/snapshots/fragment-determinism.test.mjs
//
// Property test (NOT a golden comparison): every fragment-emitting renderer must
// produce byte-identical output when called twice on the same input. This locks
// in idempotency without pinning the output to an exact string — it's the guard
// that catches a future regression introducing Date.now(), Math.random(), Set
// iteration order, or any other hidden non-determinism into a fragment path.

import { test } from 'node:test';
import { equal } from 'node:assert/strict';

import { CASES, FRAGMENT_RENDERERS, renderToString } from './_fixtures.mjs';

for (const c of CASES) {
  if (!FRAGMENT_RENDERERS.has(c.name)) continue;
  const art = c.variants.fragment ?? c.variants.full;
  test(`determinism: ${c.name} renders byte-identical across repeated calls`, () => {
    const first = renderToString(c.render(art, c.ctx ?? {}));
    const second = renderToString(c.render(art, c.ctx ?? {}));
    equal(first, second);
  });
}
