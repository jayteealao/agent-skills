# Quality Gates Plan

Companion to [GAP-CLOSURE-PLAN.md](GAP-CLOSURE-PLAN.md) and
[HOOKS-NODE-AND-SERVE-PLAN.md](HOOKS-NODE-AND-SERVE-PLAN.md). Those plans
landed the implementation. This plan closes the **verification and hygiene
gaps** identified in the post-release review:

1. Missing snapshot test suite — Phase 2 exit criterion never met.
2. Profile fragment authoring is optional in the skill body, not required.
3. wf-docs intermediate artifact types not admitted to the frontmatter schema.
4. End-to-end acceptance test not wired to a CI-runnable npm script.
5. Doc site missing `serve.html` and `types.html` reference pages.
6. Cleanup: `review-command.mjs` alias, Python verifier retirement schedule,
   and the standing open question about standalone `/wf-quick rca` walker
   discovery.

These are independent of each other and can ship in any order, but the
**recommended commit sequence** matches the phase numbers below (phase 1
first because snapshot infrastructure is a prerequisite for phase 2's new
fixture).

---

## Reconnaissance

### Current test coverage matrix

| Suite file | What it covers | Missing |
|---|---|---|
| `tests/sunflower.test.mjs` | Full render-sunflower integration run over fixture tree | Snapshot comparison — produces HTML but does not diff against a stored golden |
| `tests/unit/lib/foundation.test.mjs` | `lib/` modules: frontmatter, schema-validator, render-state, pid-file, config, workflow-index | Nothing critical missing |
| `tests/unit/hooks/hooks.test.mjs` | All six Node hook scripts, end-to-end via stdin/stdout | No parity test for `post-write-render.mjs` debounce behavior |
| `tests/unit/gap-closure/design-phase1.test.mjs` | Schema branches, sibling YAML, migration script | Fragment determinism not tested |
| `tests/unit/gap-closure/renderers-phase2.test.mjs` | Each Phase 2 renderer called with canonical input | Assertions are `match(html, /substring/)` — no golden comparison |
| `tests/unit/gap-closure/walker-phase3.test.mjs` | Walker discovers project context + workflow extras + docs index | Render output not snapshot-tested |

**Root cause of the snapshot gap:** the existing renderer tests assert presence
of CSS class names and text snippets but never compare the complete rendered
HTML against a stored reference. A renderer can be partially broken (wrong
badge color, missing table column, dropped metric row) without tripping any
assertion.

### Profile fragment gap

[`skills/wf/reference/profile.md:256`](skills/wf/reference/profile.md:256):

```
If you also write `01-profile.html.fragment`, first load
${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_fragment-authoring.md and follow
```

"If you also write" is conditional. The plan's Phase 4 exit criterion required
this to be a mandatory step closing the symmetric gap ("profile fragment
whitelist gap closed on **both** ends"). The renderer end is closed —
[`renderers/profile.mjs:78-79`](renderers/profile.mjs:78) renders the fragment
block when present. The skill end is not: the agent will skip fragment authoring
without any signal that it was expected.

### wf-docs intermediate types

`/wf-docs` orchestrator writes four intermediate artifacts under
`.ai/docs/<run-id>/` with `schema: sdlc/v1` and types that are not in
`tests/frontmatter.schema.json`:

| Written by | Frontmatter `type` | In schema? | Hook coverage? |
|---|---|---|---|
| Step 1 | `docs-discover` | ❌ | ❌ (path not matched) |
| Step 2 | `docs-audit` | ❌ | ❌ |
| Step 3 | `docs-plan` | ❌ | ❌ |
| Step 4 | `docs-generate` | ❌ | ❌ |
| Step 5 | `docs-index` | ✅ | ✅ (via `isDocsIndexMarkdownPath`) |

The intermediate artifacts claim `sdlc/v1` conformance they don't have.
Expanding hook coverage to `.ai/docs/` non-index paths in a future release
would immediately start producing spurious validation errors.

### Cleanup inventory

| Item | File | Current state | Target state |
|---|---|---|---|
| `review-command.mjs` alias | [`renderers/review-command.mjs`](renderers/review-command.mjs) | Delegates to `review-dimension.mjs`; no deprecation comment | Clearly marked deprecated with removal target, or deleted |
| Python verifier | [`tests/verify_frontmatter.py`](tests/verify_frontmatter.py) | CHANGELOG says "one release" but no date | Removal commit scheduled for v9.28 per CHANGELOG intent |
| Open question #4 | — | Standalone `/wf-quick rca` walker path undefined | Explicit resolution documented |

---

## Phase 1 — Snapshot test suite

### Goal

Add a golden-file snapshot harness for renderer output. Every renderer that
was newly added in the gap closure phases gets a canonical fixture YAML and a
stored golden HTML fragment. A mismatch fails the test suite — renderers
cannot regress silently.

### Snapshot harness design

New file: **`tests/unit/snapshots/snapshot-harness.mjs`**

```js
// Minimal golden-file harness using node:test.
// Usage:
//   node --test tests/unit/snapshots/*.test.mjs
//   UPDATE_SNAPSHOTS=1 node --test tests/unit/snapshots/*.test.mjs

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UPDATE = process.env.UPDATE_SNAPSHOTS === '1';

export function assertSnapshot(t, actual, goldenPath) {
  if (UPDATE || !existsSync(goldenPath)) {
    mkdirSync(dirname(goldenPath), { recursive: true });
    writeFileSync(goldenPath, actual, 'utf-8');
    if (UPDATE) t.diagnostic(`[snapshot] updated: ${goldenPath}`);
    return;
  }
  const expected = readFileSync(goldenPath, 'utf-8');
  if (actual !== expected) {
    // Print a compact diff using the first mismatched line for quick diagnosis.
    const aLines = actual.split('\n');
    const eLines = expected.split('\n');
    const firstDiff = aLines.findIndex((line, i) => line !== eLines[i]);
    throw new Error(
      `Snapshot mismatch: ${goldenPath}\n` +
      `  Line ${firstDiff + 1} expected: ${JSON.stringify(eLines[firstDiff])}\n` +
      `  Line ${firstDiff + 1} actual:   ${JSON.stringify(aLines[firstDiff])}`
    );
  }
}
```

Key design choices:
- **`UPDATE_SNAPSHOTS=1`** regenerates all goldens from current output.
  Running without the flag in CI fails on any divergence.
- Goldens live under **`tests/snapshots/<renderer>/<fixture>.html`** —
  plain files checked into git so PRs show diffs.
- The harness uses `node:test` — no new dependency, consistent with the
  rest of the suite.

### Fixture format

Each renderer snapshot test lives in
`tests/unit/snapshots/<renderer-name>.test.mjs` and follows this shape:

```js
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '../../../renderers/benchmark.mjs';
import { assertSnapshot } from './snapshot-harness.mjs';

const GOLDENS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'snapshots');

test('benchmark: full sibling-YAML render matches golden', (t) => {
  const out = render({
    type: 'augmentation',
    path: '05c-benchmark.md',
    frontmatter: {
      schema: 'sdlc/v1',
      type: 'augmentation',
      'augmentation-type': 'benchmark',
      status: 'complete',
      slug: 'demo',
    },
    body: '## Notes\nPerf improved.\n',
    siblingYaml: {
      artifact: 'benchmark',
      target: 'cache lookup',
      framework: 'criterion',
      mode: 'compare',
      metrics: [
        { name: 'p95', before: 120, after: 90, unit: 'ms', direction: 'lower-is-better' },
        { name: 'p99', before: 210, after: 185, unit: 'ms', direction: 'lower-is-better' },
      ],
      improvements: ['p95', 'p99'],
      regressions: [],
      'commands-run': ['npm run bench -- --filter cache'],
    },
    history: [],
    fragment: null,
  }, {});
  assertSnapshot(t, out.bodyHtml, join(GOLDENS, 'benchmark', 'full.html'));
});
```

### Renderers requiring snapshot tests

All newly added renderers from the gap closure phases:

| Renderer | Test file | Fixture description |
|---|---|---|
| `benchmark.mjs` | `benchmark.test.mjs` | Two-metric compare run, no fragment; then with fragment |
| `experiment.mjs` | `experiment.test.mjs` | Two-arm feature flag with ramp schedule |
| `instrument.mjs` | `instrument.test.mjs` | Three signals, two dark paths |
| `rca.mjs` | `rca.test.mjs` | Four-event timeline, two causal-chain entries |
| `review-dimension.mjs` | `review-dimension.test.mjs` | Security dimension, one blocker finding |
| `design-contract.mjs` | `design-contract.test.mjs` | Three states, two themes, one token |
| `design-critique.mjs` | `design-critique.test.mjs` | Five findings across two severity levels |
| `design-audit.mjs` | `design-audit.test.mjs` | Two violations, one blocker, remediation in-progress |
| `project-context.mjs` | `project-context.test.mjs` | PRODUCT.md (no frontmatter) + DESIGN.md (with frontmatter) |
| `ship-plan.mjs` | `ship-plan.test.mjs` | Three-phase release with risks |
| `announce.mjs` | `announce.test.mjs` | External channel announcement |
| `risk-register.mjs` | `risk-register.test.mjs` | Two risks, one mitigated |
| `estimate.mjs` | `estimate.test.mjs` | Story-points methodology, three slices |
| `docs-index.mjs` | `docs-index.test.mjs` | Four-doc run with one remaining gap |

Each renderer also gets a **fallback-to-simple** fixture: an artifact with no
sibling YAML, asserting the fallback path renders without throwing.

### Fragment determinism tests

Separate from HTML snapshots, add a determinism assertion to each fragment-
emitting fixture: serialize the sibling YAML to a string, call the renderer
twice, assert `out1.bodyHtml === out2.bodyHtml`. This is a property test, not
a golden comparison — it verifies idempotency without locking output to an
exact string.

File: **`tests/unit/snapshots/fragment-determinism.test.mjs`**

Renderers to cover: `benchmark`, `experiment`, `instrument`, `rca`,
`review-dimension`, `design-critique`, `design-audit`, `profile` (once Phase 2
lands).

### package.json scripts

```json
"scripts": {
  "render":        "node scripts/render-sunflower.mjs",
  "render:clean":  "node scripts/render-sunflower.mjs --clean",
  "verify":        "node scripts/verify-router-migration.mjs",
  "test":          "node --test tests/sunflower.test.mjs tests/unit/lib/foundation.test.mjs tests/unit/hooks/hooks.test.mjs tests/unit/gap-closure/design-phase1.test.mjs tests/unit/gap-closure/renderers-phase2.test.mjs tests/unit/gap-closure/walker-phase3.test.mjs tests/unit/snapshots/*.test.mjs",
  "test:snapshots": "node --test tests/unit/snapshots/*.test.mjs",
  "test:update":   "UPDATE_SNAPSHOTS=1 node --test tests/unit/snapshots/*.test.mjs"
}
```

The `test:update` script is the canonical way to regenerate goldens after an
intentional renderer change. Its invocation in a PR should be accompanied by a
review of the golden diff.

### Phase 1 exit criteria

- ✅ `tests/unit/snapshots/snapshot-harness.mjs` exists.
- ✅ All 14 renderer snapshot tests exist under `tests/unit/snapshots/`.
- ✅ All 14 goldens checked into `tests/snapshots/<renderer>/<fixture>.html`.
- ✅ Fragment determinism test covers all fragment-emitting renderers.
- ✅ `npm test` passes with zero failures on a clean checkout.
- ✅ `UPDATE_SNAPSHOTS=1 npm run test:update` regenerates goldens and produces
  a diff when a renderer's output changes.

---

## Phase 2 — Profile fragment authoring: mandatory

### Current state

[`skills/wf/reference/profile.md:256`](skills/wf/reference/profile.md):

```
If you also write `01-profile.html.fragment`, first load
${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_fragment-authoring.md and follow
```

This lets the agent skip fragment authoring entirely. The symmetric gap is
not closed.

### Target state

Make fragment authoring a **required step**, not an optional branch. The
pattern to follow is how `benchmark.md`, `experiment.md`, and `instrument.md`
phrase their fragment step — read each of those references to confirm the
exact wording, then mirror it in `profile.md`.

### Edit to `skills/wf/reference/profile.md`

Find the paragraph starting with "If you also write" and replace the
conditional block with a mandatory authoring step. Structure it as a numbered
step in the writing sequence, parallel to Steps that write the `.md` and
`.yaml` artifacts:

```
**Step N — Write the fragment**

After writing `01-profile.md` and `01-profile.yaml`, write the sibling
`01-profile.html.fragment` next to them. First load
`${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_fragment-authoring.md` and
follow its contract.

The profile fragment should include:
- A `<section class="fragment-profile" …>` wrapper.
- A hotspot bar chart drawn from `siblingYaml.hotspots`: one horizontal bar
  per hotspot, width proportional to `cost_pct`, candidate hotspots marked
  with a distinct color.
- A comparison sparkline from `siblingYaml.comparisons` if present: a
  side-by-side normalized bar per metric (mirrors the SVG in the renderer).
- No external assets, no remote scripts, no full HTML document structure.
- Deterministic from the sibling YAML — re-running on the same YAML must
  produce byte-identical HTML.
- Must pass `node scripts/verify-fragment.mjs <path>` with exit 0.
```

### Add a profile fragment golden to the snapshot suite

Once Phase 1 snapshots land, add a `profile.test.mjs` fixture that includes a
non-null `fragment` field and asserts the `fragmentBlock` appears in
`bodyHtml`. This is the double-lock: the skill is required to write a fragment;
the renderer is verified to render it.

### Phase 2 exit criteria

- ✅ `skills/wf/reference/profile.md` fragment authoring is a numbered
  required step, not a conditional branch.
- ✅ Language matches the pattern used in `benchmark.md`, `experiment.md`,
  `instrument.md`.
- ✅ `tests/unit/snapshots/profile.test.mjs` covers both the fragment-present
  and fragment-absent render paths.
- ✅ `verify-fragment.mjs` whitelist still includes `profile` (no change
  needed — it was already listed).

---

## Phase 3 — wf-docs intermediate schema admission

### Goal

`docs-discover`, `docs-audit`, `docs-plan`, and `docs-generate` artifacts all
carry `schema: sdlc/v1` but are not validated against any branch. Admit them
with minimal required-field branches so the claim is backed by the schema.

The hooks do **not** currently match `.ai/docs/<run-id>/discover.md` etc.
(only `08b-docs-index.md` is covered). Hook expansion is not part of this
phase — the goal is schema completeness so the claim is accurate, and so
any future hook expansion does not immediately produce spurious failures.

### New schema branches

Add four branches to the `oneOf` array in `tests/frontmatter.schema.json`.
All four share a `run-id` field that links them to the same docs run.

**`docsDiscoverFrontmatter`**

```jsonc
{
  "type": "object",
  "required": ["schema", "type", "run-id", "mode", "doc-files-found", "status", "created-at"],
  "properties": {
    "schema":          { "const": "sdlc/v1" },
    "type":            { "const": "docs-discover" },
    "run-id":          { "type": "string" },
    "mode":            { "enum": ["project", "workflow", "path"] },
    "target-slug":     { "type": "string" },
    "scope":           { "type": "string" },
    "doc-files-found": { "type": "integer", "minimum": 0 },
    "has-docs-folder": { "type": "boolean" },
    "doc-generator":   { "type": "string" },
    "status":          { "enum": ["complete", "in-progress", "error"] },
    "created-at":      { "$ref": "#/$defs/isoDateTime" }
  },
  "additionalProperties": true
}
```

**`docsAuditFrontmatter`**

```jsonc
{
  "type": "object",
  "required": ["schema", "type", "run-id", "files-audited", "accuracy-issues",
               "quadrant-violations", "gaps-found", "status", "created-at"],
  "properties": {
    "schema":               { "const": "sdlc/v1" },
    "type":                 { "const": "docs-audit" },
    "run-id":               { "type": "string" },
    "files-audited":        { "type": "integer", "minimum": 0 },
    "accuracy-issues":      { "type": "integer", "minimum": 0 },
    "quadrant-violations":  { "type": "integer", "minimum": 0 },
    "gaps-found":           { "type": "integer", "minimum": 0 },
    "high-freshness-risk":  { "type": "integer", "minimum": 0 },
    "status":               { "enum": ["complete", "in-progress", "error"] },
    "created-at":           { "$ref": "#/$defs/isoDateTime" }
  },
  "additionalProperties": true
}
```

**`docsPlanFrontmatter`**

```jsonc
{
  "type": "object",
  "required": ["schema", "type", "run-id", "p0-count", "p1-count",
               "total-actions", "audit-only", "status", "created-at"],
  "properties": {
    "schema":         { "const": "sdlc/v1" },
    "type":           { "const": "docs-plan" },
    "run-id":         { "type": "string" },
    "p0-count":       { "type": "integer", "minimum": 0 },
    "p1-count":       { "type": "integer", "minimum": 0 },
    "p2-count":       { "type": "integer", "minimum": 0 },
    "p3-count":       { "type": "integer", "minimum": 0 },
    "p4-count":       { "type": "integer", "minimum": 0 },
    "total-actions":  { "type": "integer", "minimum": 0 },
    "audit-only":     { "type": "boolean" },
    "status":         { "enum": ["complete", "in-progress", "error"] },
    "created-at":     { "$ref": "#/$defs/isoDateTime" }
  },
  "additionalProperties": true
}
```

**`docsGenerateFrontmatter`**

```jsonc
{
  "type": "object",
  "required": ["schema", "type", "run-id", "actions-completed", "status", "created-at"],
  "properties": {
    "schema":             { "const": "sdlc/v1" },
    "type":               { "const": "docs-generate" },
    "run-id":             { "type": "string" },
    "files-created":      { "$ref": "#/$defs/stringArray" },
    "files-updated":      { "$ref": "#/$defs/stringArray" },
    "files-deleted":      { "$ref": "#/$defs/stringArray" },
    "actions-completed":  { "type": "integer", "minimum": 0 },
    "actions-skipped":    { "type": "integer", "minimum": 0 },
    "status":             { "enum": ["complete", "in-progress", "error"] },
    "created-at":         { "$ref": "#/$defs/isoDateTime" }
  },
  "additionalProperties": true
}
```

### Hook coverage note (deferred)

The `isManagedArtifactMarkdownPath` function in
[`lib/hook-utils.mjs`](lib/hook-utils.mjs) does not currently match
`.ai/docs/<run-id>/discover.md`, `audit.md`, `plan.md`, or `generate.md`.
Expanding that regex is intentionally **deferred** to a future phase because:

1. The intermediate files are written in rapid succession during a docs run —
   blocking PostToolUse on each would significantly slow the orchestrator.
2. The content is transient (docs runs are typically one-shot) and the
   artifacts aren't navigated to via the sunflower view.

For now, schema admission makes the frontmatter claim accurate. Hook expansion
is tracked as a future improvement, not part of this plan.

### `pre-write-validate` type list update

[`hooks/pre-write-validate.mjs:106`](hooks/pre-write-validate.mjs) contains
a human-readable list of expected type values in its error message. Add the
four new types to that list so the error message stays accurate.

### Phase 3 exit criteria

- ✅ All four new branches added to `tests/frontmatter.schema.json`.
- ✅ `schema-validator` correctly selects each branch for a minimal valid
  fixture of each type.
- ✅ `tests/unit/lib/foundation.test.mjs` has a test row for each new type
  (valid fixture passes; fixture with missing `run-id` fails).
- ✅ `pre-write-validate.mjs` type list updated.
- ✅ `tests/verify_frontmatter.py` passes on the new fixtures (parity check).

---

## Phase 4 — End-to-end acceptance test as an npm script

### Goal

The plan's canonical acceptance signal:

```
node scripts/render-sunflower.mjs --clean --diag
# → [render] no renderer for: (none)
```

This command exists and works, but it's not in `package.json` and requires a
real `.ai/` directory with fixture artifacts to produce meaningful output.
Wire it to a runnable form that:

1. Works in CI against a synthetic fixture tree (no real project required).
2. Fails loudly if any `[render] no renderer for: X]` line appears.
3. Is trivially runnable by any contributor: `npm run test:e2e`.

### Implementation

**New file: `tests/e2e/acceptance.mjs`**

```js
#!/usr/bin/env node
/**
 * End-to-end acceptance test.
 * Runs render-sunflower.mjs --clean --diag over a synthetic fixture tree
 * that contains one artifact of every admitted type. Fails if any type
 * falls through to fallbackRender ([render] no renderer for: ...).
 *
 * Usage: node tests/e2e/acceptance.mjs
 */

import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RENDER = join(PLUGIN_ROOT, 'scripts', 'render-sunflower.mjs');

// …fixture-tree construction for every admitted schema type…
// …run render-sunflower --clean --diag…
// …parse stdout for "[render] no renderer for:"…
// …exit 1 if any such line appears…
```

The fixture tree must include at minimum one artifact for:
- All 33 original types
- All three Phase 1 design types (`design-contract`, `design-critique`,
  `design-audit`)
- All six Phase 3 project/workflow-extra types (`project-context`, `ship-plan`,
  `announce`, `risk-register`, `estimate`, `docs-index`)
- All four Phase 3 wf-docs intermediate types (from Phase 3 of this plan)

**Acceptance failure modes to check:**

| Signal | Meaning | Exit |
|---|---|---|
| `[render] no renderer for: X` | Type X falls through to fallback | 1 |
| `schema warnings: N > 0` | A fixture fails schema validation | 1 |
| Any `[render] ERROR` line | Renderer threw during the run | 1 |

### npm script additions

```json
"test:e2e":     "node tests/e2e/acceptance.mjs",
"render:diag":  "node scripts/render-sunflower.mjs --clean --diag"
```

`test:e2e` runs in CI because it has no side effects on the working tree
(writes to a temp dir only).

`render:diag` is a developer convenience — runs against the actual project's
`.ai/` tree, same as the plan's canonical command.

**Do not** add `test:e2e` to the default `test` npm script. The e2e test
creates and cleans up a large synthetic fixture tree (~50 files); that
overhead is inappropriate for the fast unit test loop. Run it separately:

```
npm test && npm run test:e2e
```

### Phase 4 exit criteria

- ✅ `tests/e2e/acceptance.mjs` exists and runs without error on a clean
  checkout.
- ✅ `npm run test:e2e` exits 0 with output containing
  `[render] no renderer for: (none)`.
- ✅ Introducing a new schema type without a renderer causes `npm run test:e2e`
  to exit 1 (verified by temporarily removing a renderer import and running).
- ✅ `npm run render:diag` is documented in the README "Local development"
  section.

---

## Phase 5 — Doc site: `serve.html` and `types.html`

### `docs/site/reference/serve.html`

The serve daemon has real security surface area (bind address, Tailscale
funnel exposure). Without a reference page, users must read
`scripts/render-sunflower-serve.mjs` and `schemas/sdlc-config.schema.json`
directly to understand configuration options.

**Content spec:**

```
Title: Renderer-hosted serve

## Enabling the server
Short paragraph: set view.serve.enabled = true in .ai/sdlc-config.json.
Note that sdlc-config.json is intentionally gitignored — per-machine state.

## Configuration reference
Table of every sdlc-config.json key under view.serve:
  enabled, host, port, liveReload
  tailscale.enabled, tailscale.mode, tailscale.path, tailscale.https,
  tailscale.acknowledgedPublic
Default value, type, and one-line description for each.

## Security model
Bullet list:
- Default bind: 127.0.0.1. Requires explicit config to change.
- No write endpoints.
- Path validation prevents directory traversal.
- liveReload script injected only into text/html responses.
- Tailscale funnel requires both enabled:true AND acknowledgedPublic:true.
- Tailscale serve exposes to your tailnet only, not the public internet.
- For shared tailnets: ACL the served port to yourself via Tailscale ACL config.

## Tailscale one-liners
Code block for sdlc-config.json serve + tailscale.mode=serve.
Code block for sdlc-config.json serve + tailscale.mode=funnel + acknowledgedPublic.

## Lifecycle
How the daemon starts (SessionStart → bootstrap → ensureServeLifecycle),
stays running (PID file), and stops (SIGTERM when serve.enabled flips false).

## Health endpoint
GET /__sdlc/health → JSON shape with status, slugs, renderedAt, tailscale.

## Troubleshooting
- Server not starting: check .ai/_view/.bootstrap.log.
- Port conflict: change view.serve.port.
- Tailscale not routing: run tailscale serve status.
```

**Implementation:** follow the pattern of
[`docs/site/reference/hooks.html`](docs/site/reference/hooks.html) — static
HTML, same `style.css` link, same nav partial. No build step needed.

### `docs/site/reference/types.html`

A reference page enumerating every admitted artifact type: its schema branch,
which command produces it, where it's stored, and which renderer consumes it.
This becomes the single source of truth for the mapping that the gap closure
plan's README section described.

**Content spec:**

```
Title: Artifact types

## Pipeline types (per-workflow)
Table: type | producer command | storage path pattern | renderer | fragment-eligible?
Rows: index, intake, shape, slice, plan, implement, verify, review, handoff,
  ship, ship-run, ship-runs-index, retro, announce, risk-register, estimate,
  docs-index

## Design types
Table: same columns
Rows: design, design-contract, design-critique, design-audit,
  design-augmentation

## Augmentation types (off-pipeline)
Table: same columns
Rows: instrument, experiment, benchmark, profile, rca, simplify-run,
  docs-discover, docs-audit, docs-plan, docs-generate

## Project-level types
Table: same columns
Rows: project-context, ship-plan

## Meta / navigation types
Table: same columns
Rows: amendment, resume, skip, sync-report

## Schema version
One paragraph: all types use schema: sdlc/v1.
Reference to tests/frontmatter.schema.json as the source of truth.
Link to schemas/sdlc-config.schema.json for the config file.
```

### Phase 5 exit criteria

- ✅ `docs/site/reference/serve.html` exists, matches the content spec, and
  renders correctly when opened locally.
- ✅ `docs/site/reference/types.html` exists with all type rows populated.
- ✅ Both pages are linked from `docs/site/reference/commands.html` or
  `docs/site/nav.html` so they are discoverable.
- ✅ Types table in `types.html` matches the admitted branches in
  `tests/frontmatter.schema.json` (manually verified at time of writing;
  note a future automated check would be worth adding).

---

## Phase 6 — Cleanup and closure

### 6.1 `review-command.mjs` alias

**Current state:**
[`renderers/review-command.mjs`](renderers/review-command.mjs) is a
compatibility alias that delegates all calls to `review-dimension.mjs`.

**Options:**

| Option | Effort | Risk |
|---|---|---|
| A. Add JSDoc deprecation comment + version target | 5 min | None |
| B. Delete the file and fix any remaining imports | 15 min | Low — one grep |
| C. Leave as-is indefinitely | 0 | Ongoing cognitive overhead |

**Recommendation: Option B.** Grep for any import of `review-command` across
the codebase; if there are no external consumers, delete the file and update
the renderer dispatch table in `render-sunflower.mjs` if it still maps the old
name. If there are consumers (e.g., tests), fix the import and delete.

**Before deleting:** run
```
grep -r "review-command" plugins/sdlc-workflow/ --include="*.mjs" --include="*.json"
```
and confirm all hits are the file itself plus the delegation call. Any hit in
a test or dispatch table is a consumer that must be updated first.

### 6.2 Python verifier retirement

**Current CHANGELOG (v9.26.0):** "Keep `tests/verify_frontmatter.py` in
`tests/` for one release as a parity reference. Delete it in v9.28 (or next
major)."

v9.26.0 is the parity baseline. The plan version target is v9.28 per the
hooks plan. Concretely: the next release after Phase 3 of this plan lands
(which adds new schema branches to validate) should be v9.28, making it the
right moment to delete the Python file.

**Deletion checklist:**
- ✅ `tests/verify_frontmatter.py` deleted.
- ✅ Reference to it in `tests/unit/lib/foundation.test.mjs` guarded by a
  `findPython()` skip is updated — the parity test itself can be removed
  (it existed only to verify Node matches Python; Python is gone).
- ✅ CHANGELOG entry: "Removed `tests/verify_frontmatter.py` (retired as
  planned in v9.26.0)."
- ✅ README "Requirements" no longer lists Python as optional.

### 6.3 Open question #4 — `/wf-quick rca` standalone walker

**Question:** When `/wf-quick rca` runs without a parent workflow slug, where
does it write its artifact? The walker covers `.ai/workflows/*/` and would
catch a synthetic slug like `__rca__`, but this is an implicit assumption not
documented anywhere.

**Resolution steps:**

1. Read [`skills/wf-quick/reference/rca.md`](skills/wf-quick/reference/rca.md)
   to find the actual output path spec.
2. If standalone rca writes to `.ai/workflows/__rca__/<id>-rca.md` (the
   `__rca__` slug pattern):
   - Document the convention at the top of `rca.md`: *"Standalone RCA runs
     write to `.ai/workflows/__rca__/` using a timestamped slug as the run
     ID. The walker discovers this path automatically because `__rca__` is a
     valid slug directory under `.ai/workflows/`."*
   - No code change needed.
3. If standalone rca writes elsewhere:
   - Add the path to `discoverArtifacts` in `render-sunflower.mjs` and update
     `isManagedArtifactMarkdownPath` in `hook-utils.mjs`.
   - Add a walker test in `walker-phase3.test.mjs` for that path.

**Note:** this is a documentation task (option 2) or a small code + doc task
(option 3). It is not a blocker for any other phase.

### Phase 6 exit criteria

- ✅ `review-command.mjs` either deleted (no remaining consumers) or has a
  JSDoc `@deprecated` + version target.
- ✅ `tests/verify_frontmatter.py` deleted; parity test in `foundation.test.mjs`
  cleaned up; README updated.
- ✅ Open question #4 resolved: either a documentation note in `rca.md` or a
  code + test addition in the walker.
- ✅ CHANGELOG entry for each item.

---

## Cross-cutting concerns

### Recommended commit sequence

| Phase | Content | Version bump |
|---|---|---|
| Phase 1 | Snapshot harness + 14 renderer snapshots + fragment determinism tests | v9.28.0 |
| Phase 2 | Profile fragment mandatory + profile snapshot | v9.28.0 (same PR if small) or v9.28.1 |
| Phase 3 | wf-docs intermediate schema types + schema tests | v9.29.0 |
| Phase 4 | e2e acceptance test + npm scripts | v9.29.0 (same PR as Phase 3) |
| Phase 5 | Doc site: serve.html + types.html | v9.29.0 (same PR) |
| Phase 6 | review-command cleanup + Python verifier deletion + rca resolution | v9.29.0 or v9.30.0 |

If shipping Phases 3–6 as one drop, use v9.29.0. The Python verifier deletion
and review-command cleanup are low-risk because they are dead code removal with
no runtime behavior change.

### Testing strategy

- **Phase 1 snapshots** must be generated with `UPDATE_SNAPSHOTS=1` once, then
  committed. Never generate goldens from broken renderer output — always
  visually inspect the HTML before committing a golden.
- **Phase 3 schema additions** — run the full fixture corpus through
  `tests/verify_frontmatter.py` before retiring it in Phase 6 to verify no
  regressions slipped in.
- **Phase 4 acceptance test** — manually verify it fails before the fix by
  temporarily removing a renderer registration from `render-sunflower.mjs`.

### Documentation updates

- `README.md` — add "Local development" section documenting `npm run test:e2e`
  and `npm run render:diag`.
- `docs/site/reference/types.html` (Phase 5) becomes the maintained reference
  for the type-to-renderer mapping; remove the scattered type lists from
  individual SKILL.md router error messages and replace with a pointer to this
  page (a follow-on task, not part of this plan).

### Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Golden snapshots generated from a renderer that still has a subtle bug | Medium | Visual review of all 14 goldens before commit; CI will catch regressions from that point forward |
| Phase 3 schema additions break an existing in-the-wild artifact that has `type: docs-discover` with non-standard frontmatter | Low | All four types are new; no existing fixtures use them; `additionalProperties: true` preserves forwards compatibility |
| Deleting `review-command.mjs` breaks an undiscovered test import | Low | Grep first; all hits are local to the plugin |
| Python verifier deletion removes the only check that catches non-ASCII YAML edge cases Ajv handles differently | Low | Parity test in `foundation.test.mjs` already confirmed bit-for-bit equivalence on the fixture corpus; the test itself can be kept without the Python process invocation |
| `rca.md` standalone path is different from `__rca__` assumption | Medium | Resolved cheaply: read the skill body before writing any code |

### Open questions (new, raised by this plan)

1. **Should the e2e acceptance test run in the default `npm test` script?**
   Recommended: no (too slow for unit test loop). Alternative: add it to CI
   via a separate job that only runs on PRs touching `renderers/` or
   `scripts/render-sunflower.mjs`. This makes the gate targeted rather than
   blanket.

2. **Should `docs/site/reference/types.html` be generated from the schema
   rather than hand-maintained?** A small script that reads
   `tests/frontmatter.schema.json` and emits the types table would eliminate
   drift. This is an enhancement beyond the scope of this plan — track in
   IDEAS.md if desired.

3. **Should hook coverage be extended to `.ai/docs/<run-id>/` intermediate
   files (Phase 3 deferred item)?** Worth revisiting if the wf-docs
   orchestrator gets a `/wf-docs repair` subcommand — at that point validated
   intermediate artifacts become useful for resumable runs.

---

## Single end-to-end acceptance signal

After all phases land, both of these commands must succeed:

```
npm test
```
→ All unit + snapshot + hooks + gap-closure tests pass, zero failures.

```
npm run test:e2e
```
→ `[render] no renderer for: (none)` — all admitted types have renderers.
→ `schema warnings: 0` — all synthetic fixtures are schema-valid.

Those two lines are the joint acceptance condition.
