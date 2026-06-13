# Sunflower Coverage Gap Closure Plan

Companion to [HOOKS-NODE-AND-SERVE-PLAN.md](HOOKS-NODE-AND-SERVE-PLAN.md). Where
that plan moves the runtime to Node and adds bootstrap + serve, this plan
closes the **content gaps** between what subcommands produce and what the
sunflower view + hooks actually consume.

## Reconnaissance summary

### `/wf-design` subcommand inventory (verified via filesystem sweep)

24 reference files under [skills/wf-design/reference/](../../../skills/wf-design/reference)
+ the [SKILL.md](../../../skills/wf-design/SKILL.md) router itself. Classified:

| Class             | Subcommands                                                                                                                              | Artifact target                                  |
|-------------------|------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------|
| **Authoring**     | `shape`, `craft`                                                                                                                         | `02b-design.md` (+ sibling YAML + fragment)      |
| **Review (read-only)** | `audit`, `critique`                                                                                                                  | `07-design-audit.md`, `07-design-critique.md`    |
| **Inspection**    | `extract`                                                                                                                                | `design-notes/extract-<ts>.md`                   |
| **Transformations** (16) | `adapt`, `animate`, `bolder`, `clarify`, `colorize`, `delight`, `distill`, `harden`, `layout`, `onboard`, `optimize`, `overdrive`, `polish`, `quieter`, `typeset`, `brand` | Code edits + `design-notes/<sub>-<ts>.md` (type: `design-augmentation`) |
| **Context-author**| `setup` (→ `PRODUCT.md`), `teach` (→ `DESIGN.md`), `product` (→ updates to `PRODUCT.md`)                                                  | Project-root markdown, outside `.ai/`            |

All 24 are confirmed present on disk and stay in scope of this plan. The
agent's earlier enumeration was missing `brand` and `product`; both are
added here.

### Fragment emission — current matrix

Authoritative from [scripts/verify-fragment.mjs](../../../scripts/verify-fragment.mjs).
The validator's whitelisted fragment names are the gate; subcommands either
honor it by emitting a sibling `.html.fragment`, or they don't.

| Fragment name (allowed) | Subcommand emitting today                  | Constraint                                                                                          | Renderer consumer            |
|-------------------------|--------------------------------------------|-----------------------------------------------------------------------------------------------------|------------------------------|
| `plan`                  | `/wf plan`                                 | After writing `04-plan-<slice>.md` + `.yaml`, write `.html.fragment` (per-slice)                    | `renderers/plan.mjs`         |
| `review`                | `/wf review`, `/review sweep`              | After writing `07-review.md` + `.yaml`, write `.html.fragment` (slug-wide or per-slice)             | `renderers/review.mjs`       |
| `review-dimension`      | `/review <dim>`                            | Optional; per-dimension `07-review/<dim>.html.fragment`                                             | `renderers/review-command.mjs` |
| `ship-run` / `shiprun`  | `/wf ship`                                 | After writing `ship/<run-id>/<n>-ship-run.md` + `.yaml`, write `.html.fragment`                     | `renderers/ship-run.mjs`     |
| `design`                | `/wf-design craft`                         | After writing `02b-design.md` + `.yaml`, write `.html.fragment` (24-cell swatch + state matrix)     | `renderers/design.mjs`       |
| `rca`                   | `/wf-quick rca`                            | When RCA produces an augmentation, write sibling `<rca-id>.html.fragment`                           | `renderers/augmentation.mjs` |
| `instrument`            | `/wf instrument`                           | Phase 3 (v9.22.0) sibling-YAML upgrade; emission expected when augmentation produces structured YAML | `renderers/augmentation.mjs` |
| `experiment`            | `/wf experiment`                           | Same as instrument                                                                                  | `renderers/augmentation.mjs` |
| `benchmark`             | `/wf benchmark`                            | Same as instrument                                                                                  | `renderers/augmentation.mjs` |
| `simplify-run`          | `/wf-quick simplify`                       | Phase 3; when run ships sibling `.yaml`                                                             | `renderers/simplify-run.mjs` |
| `profile`               | **none today** — whitelisted but unwired   | n/a                                                                                                 | `renderers/profile.mjs` (currently ignores fragment) |

### verify-fragment.mjs contract (the gate)

[scripts/verify-fragment.mjs](../../../scripts/verify-fragment.mjs) is the source of
truth for what "counts" as a valid fragment. Seven hard checks:

1. Exactly one top-level `<section class="fragment-<name>">`.
2. Forbidden tags: `<html>`, `<head>`, `<body>`, `<iframe>`, `<link>`.
3. No remote `<script src="…">` — inline scripts only.
4. Must dispatch `sdlc:fragment-ready` event on settle.
5. Severity glyphs must pair with `.severity-<level>` class (color + glyph,
   not naked emoji — deuteranope-safe).
6. Sibling `.yaml` required and validated against the matching schema branch.
7. Inline markup matching a published snippet → warn-only suggestion to use
   `<!-- @include <snippet> -->` instead (suppressible).

Plus the **determinism contract**: re-running the author on the same YAML
must produce byte-identical HTML.

### Existing renderers that ignore fragments (problem case)

[renderers/profile.mjs](../../../renderers/profile.mjs) does not read the
`artifact.fragment` field. Whitelisted by verify-fragment.mjs but renderer
won't display it even if a sub emits one. Symmetric gap with
`/wf profile` not authoring fragments — fixing one without the other has
no user-visible effect.

---

## Goals

Five gaps to close, in dependency order:

1. **Schema admission** — admit `design-brief`, `design-critique`,
   `design-audit` as first-class types with required-field branches.
2. **Renderer coverage** — add dedicated renderers for the five schema types
   that currently fall through to `fallbackRender`.
3. **Walker expansion** — make `PRODUCT.md`, `DESIGN.md`, `.ai/ship-plan.md`,
   `announce.md`, `risk-register.md`, `estimate.md` visible to the sunflower.
4. **Fragment-emission rollout** — close the matrix above: every whitelisted
   fragment name should have at least one producer and one consumer.
5. **Renderer-side fragment plumbing** — make every renderer of a
   fragment-eligible type actually render the fragment when present.

---

## Phase 1 — Schema admission for the three design types

### Add type values to enum

[tests/frontmatter.schema.json](../../../tests/frontmatter.schema.json) currently
has 33 artifact types in the `oneOf` branch selector. Add:

- `design-contract` — the **visual contract** authored by `/wf-design craft`
  at `02c-craft.md`. (Renamed from the original `design-brief` proposal,
  which collided with the existing `design` type — `02b-design.md` is the
  actual brief; `02c-craft.md` is the contract built from it.)
- `design-critique`
- `design-audit`

### `design-contract` branch

Required fields (mirror the existing `design` branch + tighten what
[skills/wf-design/reference/craft.md](../../../skills/wf-design/reference/craft.md)
demands). Note `based-on` — the craft contract references the shape brief
it derived from:

```jsonc
{
  "designContractFrontmatter": {
    "type": "object",
    "required": [
      "schema", "type", "slug", "title", "status", "created-at", "updated-at",
      "component", "based-on", "tokens", "states", "sizes", "themes", "refs"
    ],
    "properties": {
      "schema": { "const": "sdlc/v1" },
      "type":   { "const": "design-contract" },
      "slug":   { "$ref": "#/$defs/slug" },
      "title":  { "type": "string" },
      "status": { "enum": ["draft", "ready", "frozen"] },
      "component": { "type": "string", "description": "The component the contract describes (e.g., 'PrimaryButton')." },
      "based-on": { "type": "string", "description": "Filename of the parent design brief (typically '02b-design.md')." },
      "tokens":  { "type": "array", "items": { "type": "string" }, "description": "Design tokens referenced by this contract." },
      "states":  { "$ref": "#/$defs/stringArray", "description": "Component states (e.g., default, hover, active, disabled)." },
      "sizes":   { "$ref": "#/$defs/stringArray" },
      "themes":  { "$ref": "#/$defs/stringArray" },
      "refs":    { "$ref": "#/$defs/refs" },
      "pen-doc": { "type": "string", "description": "Path to the Pencil .pen document, if applicable." },
      "regenerable": { "type": "boolean" }
    },
    "additionalProperties": true
  }
}
```

### `design-critique` branch

Required fields modeled on the existing `review` branch but with
critique-specific severity and finding categories. A critique is
**read-only** — no triage decisions, no slice mapping; just observations and
recommendations.

```jsonc
{
  "designCritiqueFrontmatter": {
    "type": "object",
    "required": [
      "schema", "type", "slug", "title", "status", "created-at", "updated-at",
      "scope", "findings-count", "severity-distribution", "refs"
    ],
    "properties": {
      "schema": { "const": "sdlc/v1" },
      "type":   { "const": "design-critique" },
      "slug":   { "$ref": "#/$defs/slug" },
      "title":  { "type": "string" },
      "status": { "enum": ["draft", "ready"] },
      "scope":  { "enum": ["surface", "flow", "system", "narrative"] },
      "findings-count": { "type": "integer", "minimum": 0 },
      "severity-distribution": {
        "type": "object",
        "required": ["blocker", "high", "medium", "low", "nit"],
        "properties": {
          "blocker": { "type": "integer", "minimum": 0 },
          "high":    { "type": "integer", "minimum": 0 },
          "medium":  { "type": "integer", "minimum": 0 },
          "low":     { "type": "integer", "minimum": 0 },
          "nit":     { "type": "integer", "minimum": 0 }
        }
      },
      "dimensions-touched": { "$ref": "#/$defs/stringArray" },
      "refs":    { "$ref": "#/$defs/refs" },
      "regenerable": { "type": "boolean" }
    },
    "additionalProperties": true
  }
}
```

### `design-audit` branch

Audit is critique + **actionable verdict** — every finding has a remediation
status. Mirrors the verify branch's pass/fail orientation but applied to
design-system conformance.

```jsonc
{
  "designAuditFrontmatter": {
    "type": "object",
    "required": [
      "schema", "type", "slug", "title", "status", "created-at", "updated-at",
      "verdict", "audited-against", "violations-count", "severity-distribution",
      "remediation-state", "refs"
    ],
    "properties": {
      "schema": { "const": "sdlc/v1" },
      "type":   { "const": "design-audit" },
      "slug":   { "$ref": "#/$defs/slug" },
      "title":  { "type": "string" },
      "status": { "enum": ["draft", "ready"] },
      "verdict": { "enum": ["pass", "fail", "conditional"] },
      "audited-against": { "type": "string", "description": "What the implementation was audited against — e.g., '02b-design.md', 'DESIGN.md', 'design tokens v2'." },
      "violations-count": { "type": "integer", "minimum": 0 },
      "severity-distribution": {
        "type": "object",
        "required": ["blocker", "high", "medium", "low"],
        "properties": {
          "blocker": { "type": "integer", "minimum": 0 },
          "high":    { "type": "integer", "minimum": 0 },
          "medium":  { "type": "integer", "minimum": 0 },
          "low":     { "type": "integer", "minimum": 0 }
        }
      },
      "remediation-state": {
        "enum": ["none", "in-progress", "complete", "deferred"]
      },
      "refs": { "$ref": "#/$defs/refs" },
      "regenerable": { "type": "boolean" }
    },
    "additionalProperties": true
  }
}
```

### Sibling-YAML schema branches

The existing schema has sibling-YAML schemas for `review`, `plan`,
`ship-run`, `design`, `rca`, `instrument`, `experiment`, `benchmark`,
`simplify-run`, `profile`, `review-dimension`. Add two more, keyed by
fragment name (which must match the section class):

- `designCritiqueSiblingYaml` — findings list with severity + observation +
  recommendation per row.
- `designAuditSiblingYaml` — violations list with severity + token-or-rule
  reference + remediation status.

**Note on `design-contract`:** no new sibling-YAML branch is needed.
`/wf-design craft` authors a fragment named `design` (sibling of the prior
`02b-design.md` shape artifact, **not** of its own `02c-craft.md`), which
already has a sibling-YAML schema. The contract artifact itself
(`02c-craft.md`) has no fragment.

### Update verify-fragment.mjs whitelist

[scripts/verify-fragment.mjs:33-37](../../../scripts/verify-fragment.mjs:33) must add
`design-critique` and `design-audit` to `ALLOWED_FRAGMENT_NAMES`. The
`design` entry already exists and covers what `/wf-design craft` authors.

### Schema migration of existing artifacts

If any existing `.ai/workflows/*/02b-design.md` or `07-design-critique.md`
files exist on user disks, they will start failing post-write verification
once the new required-field branches land.

**Mitigation:** ship a one-shot migration script
`scripts/migrate-design-types.mjs` that:
- Walks `.ai/workflows/*/` for `02b-*.md`, `07-design-*.md`, `02c-craft.md`.
- Parses frontmatter; if `type` matches one of the new types and required
  fields are missing, fills sensible defaults (`status: draft`,
  `findings-count: 0`, `severity-distribution`: zeros, etc.).
- Idempotent — running twice is a no-op.
- Has a `--dry-run` flag that lists what would change.

### Phase 1 exit criteria

- ✅ All three new branches added to schema with required-field lists.
- ✅ Sibling-YAML schemas added.
- ✅ `verify-fragment.mjs` whitelist updated.
- ✅ Migration script runs cleanly on the existing fixture corpus.
- ✅ `tests/verify_frontmatter.py` (and its Node successor) report no
  regressions on the existing artifact corpus after migration runs.

---

## Phase 2 — Renderers for the five "fall-through" types

Today these five types are accepted by the schema (or about to be) but
fall through to [`fallbackRender`](../../../scripts/render-sunflower.mjs:185).
Add one renderer per type at `renderers/<type>.mjs`. Each follows the
existing renderer contract used by [plan.mjs](../../../renderers/plan.mjs),
[review.mjs](../../../renderers/review.mjs), [ship-run.mjs](../../../renderers/ship-run.mjs).

### `renderers/benchmark.mjs`

Inputs from sibling YAML (must conform to `benchmarkSiblingYaml`):
- `baseline.metrics[]` — name, value, unit
- `comparison.metrics[]` — name, value, unit, delta-pct, verdict
- `regression-threshold`
- `commands-run[]`

Renders:
- Header: benchmark name, slug, link to source code.
- Two-column metrics table (baseline vs after) with delta-pct badges,
  red/green coloration tied to `verdict`.
- Commands-run codeblock.
- Fragment hookpoint: if `artifact.fragment` exists, inline it (figure
  canvas with sparklines / bar comparison).

### `renderers/experiment.mjs`

Inputs:
- `hypothesis`, `success-metric`, `guardrails[]`
- `variants[]` — name, allocation-pct, description
- `flag-name`, `kill-switch`, `ramp-schedule[]`

Renders:
- Hypothesis callout block.
- Variant cards (one per arm).
- Ramp timeline (text or fragment-rendered visualization).
- Guardrails list with severity tags.

### `renderers/instrument.mjs`

Inputs:
- `signals[]` — name, type (counter/gauge/histogram), labels, where-emitted
- `dark-paths[]` — code paths missing instrumentation
- `dashboards[]` — observability surface refs

Renders:
- Signals table grouped by type.
- Dark-paths panel with file:line references.
- Dashboards section.
- Fragment hookpoint: signal-flow diagram if present.

### `renderers/rca.mjs`

Inputs (mirrors what `augmentation.mjs:71-75` already renders for the rca
sub-type — extract that logic into a standalone renderer):
- `incident-id`, `duration`, `time-to-detect`, `time-to-mitigate`,
  `user-failures`, `revenue-impact`
- `timeline[]` — timestamped events
- `causal-chain[]` — ordered causes
- `contributing-causes[]`, `mitigations[]`

Renders:
- 5-metric row at top.
- Timeline component (vertical, with markers at detect / mitigate / resolve).
- Causal chain (left-to-right SVG or fragment).
- Two-column callouts: contributing causes vs mitigations.

**Note:** This involves splitting [augmentation.mjs](../../../renderers/augmentation.mjs)
so the rca codepath becomes a peer, not a sub-render. Other augmentation
types (`instrument`, `experiment`, `benchmark`) similarly get moved to
their dedicated renderers above. `augmentation.mjs` becomes a thin
dispatcher (or is deleted if every concrete type now has its own renderer).

### `renderers/review-dimension.mjs`

Inputs:
- `dimension` (one of the 31)
- `verdict` — pass/conditional/fail
- `findings[]` — severity, finding, recommendation, file:line
- `dimension-specific-metrics` (varies per dimension)

Renders:
- Dimension chip + verdict badge in header.
- Findings table with sort+filter by severity.
- Per-dimension addenda (e.g., a `coverage:` table for the `testing`
  dimension, a `cve:` table for `supply-chain`).

This is what differentiates it from `review-command.mjs` (which currently
handles per-dimension review **at the command level**, less prescriptive).
Plan: rename `review-command.mjs` → `review-dimension.mjs` if they're
actually the same thing, OR clearly delineate their responsibilities in
docstrings. Confirm during implementation by reading both renderers
in full.

### Phase 2 exit criteria

- ✅ All five renderers exist and follow the
  `render({type, frontmatter, body, siblingYaml, history, fragment, path}, ctx) → {headerHtml, bodyHtml, links, children}`
  contract.
- ✅ Each renderer has a snapshot test in `tests/snapshots/` over a
  canonical fixture artifact.
- ✅ `[render] no renderer for: <type>` warning at the end of
  [render-sunflower.mjs:431-433](../../../scripts/render-sunflower.mjs:431) no
  longer lists any of the five.

---

## Phase 3 — Walker expansion for project-level artifacts

### Current walker scope

[`discoverArtifacts`](../../../scripts/render-sunflower.mjs:103) walks three roots:
`.ai/workflows/`, `.ai/simplify/`, `.ai/profiles/`. Everything outside is
invisible to the renderer.

### Files to admit

| File                       | Producer                                   | Role                                                                  |
|----------------------------|--------------------------------------------|-----------------------------------------------------------------------|
| `PRODUCT.md` (project root)| `/wf-design setup`, `/wf-design product`   | Project's product context (target users, brand voice, content rules)  |
| `DESIGN.md` (project root) | `/wf-design teach`                         | Project's design system context (tokens, themes, accessibility rules) |
| `.ai/ship-plan.md`         | `/wf-meta init-ship-plan`                  | Project-level release contract                                        |
| `.ai/workflows/<slug>/announce.md` | `/wf-meta announce`                | External-facing announcement                                          |
| `.ai/workflows/<slug>/risk-register.md` | manual or `/wf shape`         | Per-workflow risk register                                            |
| `.ai/workflows/<slug>/estimate.md` | manual or `/wf plan`               | Per-workflow estimate                                                 |

### Design: where they appear in the view

Three distinct surfaces:

1. **Project-level pane** at `.ai/_view/INDEX.html` (the dashboard) gains a
   new section: "Project context". Pulls from `PRODUCT.md`, `DESIGN.md`,
   `.ai/ship-plan.md`. Each gets a card with its title + last-updated
   timestamp + link to a per-file rendered page.
2. **Per-file pages** at `.ai/_view/project/<filename>.html`. Rendered by
   new renderers `renderers/project-context.mjs` (handles PRODUCT.md +
   DESIGN.md) and `renderers/ship-plan.mjs`.
3. **Workflow-scoped extras** (`announce.md`, `risk-register.md`,
   `estimate.md`) render under the existing slug — admit them as new
   schema types: `announce`, `risk-register`, `estimate`, each with its own
   renderer.

### Implementation: discoverProjectArtifacts()

New function in [render-sunflower.mjs](../../../scripts/render-sunflower.mjs):

```js
function discoverProjectArtifacts({ projectRoot }) {
  const out = [];
  for (const filename of ['PRODUCT.md', 'DESIGN.md']) {
    const abs = join(projectRoot, filename);
    if (existsSync(abs)) {
      out.push({ mdAbs: abs, slug: '__project__', storageRel: filename, kind: 'project' });
    }
  }
  const shipPlan = join(projectRoot, '.ai', 'ship-plan.md');
  if (existsSync(shipPlan)) {
    out.push({ mdAbs: shipPlan, slug: '__project__', storageRel: 'ship-plan.md', kind: 'project' });
  }
  return out;
}
```

Plumb `kind: 'project'` through `resolveViewPath`
([renderers/_paths.mjs:55-76](../../../renderers/_paths.mjs)) so it maps to
`.ai/_view/project/<filename>.html`.

### Schema admission for the new workflow-scoped types

Three new branches mirroring the pattern above:

- `announce` — required: scope (internal/external/customer), audience,
  channel, scheduled-at.
- `risk-register` — required: risks[] (each with id, description,
  likelihood, impact, mitigation, owner, status).
- `estimate` — required: methodology (story-points / t-shirt / hours),
  estimates[] (slice-or-task, value, confidence), total, confidence-range.

### Walker config

Add `--include-project-context` flag (default: on) to
[render-sunflower.mjs](../../../scripts/render-sunflower.mjs). The bootstrap pass
(Phase 2 of the companion plan) passes the flag through.

### Hook coverage

The Node-migrated hooks (Phase 1 of the companion plan) need their match
globs expanded:

- `pre-write-validate.mjs`: also validate `PRODUCT.md`, `DESIGN.md`,
  `.ai/ship-plan.md`, `announce.md`, `risk-register.md`, `estimate.md`.
- `post-write-verify.mjs`: same paths added to its switch.
- `post-write-render.mjs`: detect touches to project-root markdown and
  trigger a project-pane re-render (not just per-slug).

### Phase 3 exit criteria

- ✅ Walker discovers project-root context files.
- ✅ Dashboard renders the "Project context" section with all six file types.
- ✅ Per-file pages exist and validate.
- ✅ Hooks pre-validate and post-verify the new files.
- ✅ Editing `PRODUCT.md` triggers a render of the project pane within the
  debounce window.

---

## Phase 4 — Fragment emission rollout

### Current state (from §Reconnaissance)

10 fragment names are whitelisted by `verify-fragment.mjs`. 9 have at least
one producer. **`profile` is whitelisted but unwired on both ends.**

### Subcommands to add fragment-authoring to

| Sub                  | Fragment to emit          | Constraint                                                                                              | Priority |
|----------------------|---------------------------|---------------------------------------------------------------------------------------------------------|----------|
| `/wf profile`        | `profile`                 | When the profile run produces sibling YAML with hotspots + comparisons; close the symmetric gap         | High     |
| `/wf-design craft`   | `design-brief`            | New (Phase 1 adds the type); 24-cell swatch + spec table + Pencil .pen link                             | High     |
| `/wf-design critique`| `design-critique`         | New (Phase 1); findings table + severity tally + dimension chips                                        | High     |
| `/wf-design audit`   | `design-audit`            | New (Phase 1); verdict badge + violations table + remediation tracker                                   | High     |
| `/wf-quick simplify` | `simplify-run`            | Whitelisted; some emission today but verify that authoring step is in skill body                        | Medium   |
| `/wf benchmark`      | `benchmark`               | Whitelisted; verify authoring step is fully spec'd in skill body                                        | Medium   |
| `/wf experiment`     | `experiment`              | Whitelisted; verify authoring step                                                                      | Medium   |
| `/wf instrument`     | `instrument`              | Whitelisted; verify authoring step                                                                      | Medium   |

### Subcommands explicitly NOT emitting fragments (intentional)

By design, these are markdown-only and should stay that way:

- `/wf-meta` subs — navigation/registry ops, not artifact production.
- `/wf-docs` subs — Diátaxis docs are prose-first; fragments would
  fight the format.
- `/wf-quick {fix, hotfix, investigate, discover, probe, ideate,
  refactor, update-deps}` — light-weight, short-form artifacts where a
  figure-canvas would be overhead. Re-evaluate per-sub if a structured
  output emerges later.
- `/wf-design {extract, setup, teach, product, brand}` — read-only or
  context-authoring; no structured per-artifact YAML to drive a fragment.
- `/wf-design <transformations>` — code-modifying subs; their
  `design-augmentation` artifacts are metadata-only and don't merit a
  figure.

### Authoring spec to add to each skill body

Each fragment-authoring step in a skill body follows the same shape:

```
After writing `<artifact>.md` and `<artifact>.yaml`, write the sibling
`<artifact>.html.fragment` next to them. One `<section class="fragment-<name>"
data-artifact="<type>" data-rev="<n>">…</section>`. The fragment must:

1. Render deterministically from the sibling YAML — re-running on the same
   YAML produces byte-identical HTML.
2. Dispatch `sdlc:fragment-ready` on settle (use `<!-- @include fragment-ready -->`).
3. Pair every severity glyph with `.severity-<level>` (use `<!-- @include severity-chip -->`).
4. Pass `node scripts/verify-fragment.mjs <path>` with exit code 0.

Suggested anatomy: [type-specific guidance + screenshot/wireframe].
```

This template lives in [skills/wf/reference/_fragment-authoring.md](../../../skills/wf/reference/_fragment-authoring.md)
(new shared file) and is referenced by every fragment-emitting skill body.

### Renderer-side plumbing fix (the symmetric gap)

[renderers/profile.mjs](../../../renderers/profile.mjs) needs the fragment block:

```js
const fragmentHtml = artifact.fragment
  ? `<div class="fragment">${artifact.fragment}</div>`
  : '';
// …include in returned bodyHtml…
```

Mirror this in any other renderer that's missing it. Audit all 31
renderers in [renderers/](../../../renderers) and add the block to any that lacks
it. Acceptance: every renderer for a whitelisted type honors a present
fragment.

### Phase 4 exit criteria

- ✅ `profile` fragment whitelist gap closed on both ends.
- ✅ All four high-priority new emitters wired into their skill bodies.
- ✅ Shared `_fragment-authoring.md` template referenced from each
  fragment-emitting skill body.
- ✅ Every whitelisted fragment name has at least one tested fixture
  artifact that emits a valid fragment.
- ✅ `verify-fragment.mjs` passes on the fixture corpus.

---

## Phase 5 — `/wf-design` subcommand coverage table

The verified 24-sub roster, with current and target state:

| Sub          | Class       | Artifact type emitted today | Schema branch | Renderer        | Fragment-emitting? | Action                       |
|--------------|-------------|-----------------------------|---------------|-----------------|--------------------|------------------------------|
| `shape`      | Authoring   | `design`                    | exists        | `design.mjs`    | yes (via craft)    | Keep                         |
| `craft`      | Authoring   | `design-contract` (new) at `02c-craft.md` + sibling `design` fragment at `02b-design.html.fragment` | **add `design-contract`** | `design-contract.mjs` (**add**); fragment renders into `design.mjs` (existing) | yes (fragment is `design`, not new) | Wire schema + renderer; fragment already supported |
| `audit`      | Review      | `design-audit` (new)        | **add**       | `design-audit.mjs` (**add**) | yes (new fragment) | Same                         |
| `critique`   | Review      | `design-critique` (new)     | **add**       | `design-critique.mjs` (**add**) | yes (new fragment) | Same                         |
| `extract`    | Inspection  | `design-augmentation`       | exists        | `design-augmentation.mjs` | no              | Keep                         |
| `adapt`      | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `animate`    | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `bolder`     | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `brand`      | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `clarify`    | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `colorize`   | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `delight`    | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `distill`    | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `harden`     | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `layout`     | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `onboard`    | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `optimize`   | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `overdrive`  | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `polish`     | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `quieter`    | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `typeset`    | Transform   | `design-augmentation`       | exists        | same            | no              | Keep                         |
| `setup`      | Context     | `PRODUCT.md` (project root) | **add**       | `project-context.mjs` (**add**) | no | Walker expansion (Phase 3)   |
| `teach`      | Context     | `DESIGN.md` (project root)  | **add**       | same            | no              | Same                         |
| `product`    | Context     | `PRODUCT.md` (project root) | uses `setup`  | same            | no              | Same                         |

Net effect: 3 new schema branches, 4 new renderers, 1 walker root expansion
(or a project-root inclusion rule).

---

## Phase 6 — `/wf-docs` scope decision

`/wf-docs` writes documentation files to wherever the project's docs tree
lives — typically `docs/`, `documentation/`, or co-located with the code.
None of these paths are reachable by the sunflower walker.

**Options:**

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| A. **Out of scope** (status quo) | sunflower ignores docs outputs entirely | Simple; respects that docs are user-facing artifacts, not workflow internals | Workflow lifecycle has invisible step (writing docs) |
| B. **Docs index per workflow** | A new artifact `08b-docs-index.md` (type: `docs-index`) per workflow lists the docs files written, with paths + Diátaxis type + status | Workflow surfaces "what docs were written" without trying to render the docs themselves | One more artifact type; some duplication with docs source-of-truth |
| C. **Symlink-style rendering** | sunflower renders project docs into `.ai/_view/docs/` | Full docs in the view | High effort; conflicts with existing docs sites (Docusaurus, etc.); user expectations of "sunflower view = workflow state" violated |

**Recommendation: Option B.** A lightweight per-workflow `docs-index`
artifact:

```yaml
---
schema: sdlc/v1
type: docs-index
slug: foo
title: Documentation for foo
status: complete
docs:
  - path: docs/foo/tutorial.md
    diataxis: tutorial
    status: complete
    last-edited: 2026-05-23T...
  - path: docs/foo/reference.md
    diataxis: reference
    status: draft
    last-edited: 2026-05-23T...
---
```

Renderer `renderers/docs-index.mjs` (new): four-column Diátaxis grid,
status badges, click-through links to the actual docs files (relative
links — opens in user's editor or rendered docs site).

This closes the visibility gap without owning docs rendering.

### Phase 6 exit criteria

- ✅ `docs-index` admitted to schema.
- ✅ `renderers/docs-index.mjs` exists with snapshot tests.
- ✅ `/wf-docs` orchestrator-mode emits `08b-docs-index.md` after writing
  its docs files.

---

## Cross-cutting concerns

### Migration order (recommended commit sequence)

1. **Phase 1** — Schema admission (no renderers yet; existing artifacts
   start being validated against new branches; migration script lands at
   the same time). Bump to v9.26.0.
2. **Phase 2** — Renderers for the five fall-through types. v9.27.0.
3. **Phase 3** — Walker expansion + project-level types. v9.28.0.
4. **Phase 4** — Fragment-emission rollout (skill-body changes + renderer
   plumbing). v9.29.0.
5. **Phase 5** — Just bookkeeping; the wf-design coverage table is closed
   out by Phases 1+2+3 and doesn't need its own release.
6. **Phase 6** — `/wf-docs` docs-index. v9.30.0.

Could combine into v10.0.0 if shipping as one drop — the schema additions
plus walker changes are arguably a major bump.

### Testing strategy

- **Schema parity:** every existing artifact in `tests/fixtures/` must
  still validate after Phase 1 (or run through the migration script).
- **Renderer snapshots:** every new renderer gets a snapshot test against
  a canonical fixture.
- **Fragment determinism:** byte-identity tests for every fragment
  emitter — re-run the author on the same YAML twice, diff the outputs.
- **Walker coverage:** integration test that creates `PRODUCT.md`,
  `DESIGN.md`, `.ai/ship-plan.md`, and asserts they appear in the dashboard.
- **End-to-end:** run `render-sunflower.mjs --clean` over a synthetic
  project with one of every artifact type; assert no `[render] no renderer
  for: X` warnings at the end.

### Documentation updates

- README: enumerate every artifact type + producer + renderer in a table
  (this gap closure plan becomes the source of truth, README cites it).
- `docs/site/reference/types.html` (new): per-type schema documentation.
- Each new renderer file: header docstring describing inputs, outputs,
  fragment expectations.

### Risks

| Risk                                                                | Likelihood | Mitigation                                                                  |
|---------------------------------------------------------------------|------------|-----------------------------------------------------------------------------|
| Existing artifacts on user disks fail Phase 1 strict schema         | High       | Migration script runs in `--dry-run` first; clear CHANGELOG migration note  |
| `/wf-design craft` skill body says `02c-craft.md` somewhere         | Medium     | Sweep `skills/wf-design/` for `02c-` references and standardize on `02b-`   |
| Fragment authors hand-write markup the snippets system would emit   | Medium     | verify-fragment.mjs Check 9 already warns; treat warning rate as KPI        |
| Walker change makes view startup slower on big projects             | Low        | Project-root files are 3 paths max; project pane is one extra render       |
| Splitting augmentation.mjs breaks existing rca/instrument fixtures  | Medium     | Keep `augmentation.mjs` as a thin dispatcher for one release as transition  |

### Open questions

1. ~~**`design` vs `design-brief` — same or different?**~~ **RESOLVED.**
   The shape sub writes `02b-design.md` (type: `design`) — the
   lower-fidelity brief. The craft sub writes `02c-craft.md` (type:
   `design-contract`) — the higher-fidelity visual contract referencing the
   brief via `based-on: 02b-design.md`. Both types coexist; the
   `design-brief` name was abandoned because it collided with the brief
   role that `design` already owns.

2. **Should `/wf-design product` and `setup` produce the same type?**
   Both write `PRODUCT.md`. If `product` is incremental updates and `setup`
   is bootstrap, they share the artifact and differ only in command intent
   — no separate type needed.

3. ~~**`02b-design.md` vs `02c-craft.md`**~~ **RESOLVED.** Verified by
   reading [skills/wf-design/reference/shape.md:128](../../../skills/wf-design/reference/shape.md:128)
   and [skills/wf-design/reference/craft.md:96,202](../../../skills/wf-design/reference/craft.md:96).
   Both filenames exist with different roles:
   - shape writes `02b-design.md` (artifact, type: `design`).
   - craft writes `02c-craft.md` (artifact, type: `design-contract`) **AND**
     authors a sibling fragment `02b-design.html.fragment` next to the
     shape artifact. The fragment is named `design` (matches the type of
     the artifact it sits next to), not `design-contract`.

4. **`/wf-quick rca` augmentation vs standalone:** when rca runs in
   `/wf-quick` mode (no parent workflow), does it write to
   `.ai/workflows/__rca__/` or a different root? The walker needs to know.

5. **Sibling YAML for `design-augmentation`:** none today. Worth adding
   one to give the transformations a structured "what changed" record
   (file list, lines touched, before/after snippets)? Probably no for v9
   release; revisit for v10.

---

## Single end-to-end acceptance test

After all phases land, this command must report zero gaps:

```
node scripts/render-sunflower.mjs --clean --diag
```

Output must show:

```
[render] N slugs · M files written · 0 skipped · 0 schema warnings
[render] no renderer for: (none)
[diag]   produced types: …all 33 + 3 new + 4 project-level…
[diag]   types with renderers: …all of them…
[diag]   types with sample fragments: …all whitelisted ones…
[diag]   walker roots: workflows, simplify, profiles, project
```

That single line — `no renderer for: (none)` — is the canonical
acceptance signal.
