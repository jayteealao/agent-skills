// tests/unit/snapshots/renderers.test.mjs
//
// Golden-file snapshot tests for every renderer added in the gap-closure phases
// (plus profile). Each renderer contributes one snapshot per fixture variant:
//   - full      : the rich (sibling-YAML / rich-frontmatter) projection
//   - fallback  : no sibling YAML — the renderSimple degradation path
//   - fragment  : full + a .html.fragment block (fragment-emitting renderers)
//   - product/design : project-context's two authoring shapes
//
// Goldens live at tests/snapshots/<renderer>/<variant>.html — plain files in
// git so PRs show the rendered-output diff.
//
// This file deliberately mirrors the codebase's existing convention of testing
// many renderers in one file (see tests/unit/gap-closure/renderers-phase2.test.mjs)
// rather than the plan's file-per-renderer split; fixtures are shared with the
// determinism suite via _fixtures.mjs so the two can never drift.

import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CASES, renderToString } from './_fixtures.mjs';
import { assertSnapshot } from './snapshot-harness.mjs';

const GOLDENS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'snapshots');

for (const c of CASES) {
  for (const [variant, art] of Object.entries(c.variants)) {
    test(`snapshot: ${c.name} · ${variant}`, (t) => {
      const out = c.render(art, c.ctx ?? {});
      assertSnapshot(t, renderToString(out), join(GOLDENS, c.name, `${variant}.html`));
    });
  }
}
