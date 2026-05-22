# Sunflower view audit — v9.22.0

**Date:** 2026-05-22
**Branch:** `feature/sunflower-view` at `0ba55ca`
**Scope:** Cross-reference the four sources that must stay in sync — plan
([SUNFLOWER-VIEW-PLAN.md](SUNFLOWER-VIEW-PLAN.md)), schema
([tests/frontmatter.schema.json](tests/frontmatter.schema.json)),
renderers ([renderers/](renderers/)), and skills/handoff
([skills/wf*/](skills/)). Generated `.scratch/test-ai/_view/` tree was used
as ground truth for what actually reaches the user.

The audit covers everything shipped through Phase 3 (v9.22.0) — Phase 1
foundation, Phase 1.5 components helper, Phase 1.x additive-write
contract, Phase 2 review/plan/RCA polish, and Phase 3
simplify/profile/augmentation fragments.

## TL;DR

The implementation is **structurally complete** but **functionally
dormant**. Every layer (schema, verifier, renderer, CSS) is wired
correctly for the eleven fragment-bearing types. The missing layer is
**authoring**: no skill writer instructs the agent to emit the sibling
`.yaml` that the renderers consume. In real workflow use, every Phase 2
and Phase 3 capability falls through to the `_simple.mjs` fallback. The
fix is small (six skill-reference edits, ~3 hours) but until it lands,
v9.21.0 and v9.22.0 ship the rendering pipeline for content that nothing
actually writes.

A secondary structural gap: `design` and `ship-run` — declared
fragment-bearing in the Phase 1 plan — never grew sibling-YAML
branches in their renderers. Both schemas exist, both are in
`ALLOWED_FRAGMENT_NAMES`, but the renderers are `renderSimple` shims.
This is the same shape of bug as the orchestrator-sibling-discovery bug
fixed in `0ba55ca` — each layer correct in isolation, the
contract between layers broken.

## Methodology

1. **Structural surveys (parallel).** Enumerated every artifact `type`
   declared in the schema's `oneOf` branches, every renderer file, every
   skill reference doc, every `ALLOWED_FRAGMENT_NAMES` entry.
2. **Type-to-renderer alignment.** Cross-referenced each schema-declared
   `type` against the existence of `renderers/<type>.mjs` and vice versa.
3. **Sibling-YAML coverage matrix.** For each of the eleven
   fragment-bearing types, checked three cells: schema present in
   `siblingYamlSchemas`, name in `ALLOWED_FRAGMENT_NAMES`, renderer has a
   `siblingYaml` branch.
4. **Skill→renderer contract.** Grep-audited `skills/wf*/SKILL.md` and
   `skills/wf*/reference/*.md` for the eleven `artifact:` schema names
   and for instructions to write `.yaml` / `.html.fragment` siblings.
5. **Plan claim spot-check.** Verified a sample of "[shipped]" claims in
   `SUNFLOWER-VIEW-PLAN.md` against actual disk state.
6. **Path-resolver coverage.** Cross-referenced `_paths.mjs` regex/table
   entries against the storage paths every `kind` uses (workflow,
   simplify, profile, augmentation, amendment, history).
7. **Doc-site coverage.** Read `docs/site/sunflower-view.md`
   end-to-end; checked Phase 2/3 features against its content.
8. **CSS hook orphan check.** Grepped `renderers/*.mjs` for emitted
   `class="..."` block-level names; cross-referenced against
   `assets/sdlc.css`.

## Severity 1 — feature unreachable in real workflow use

### S1.1 — No skill writers emit Phase 2 or Phase 3 sibling YAMLs

**Evidence.** Zero hits across `plugins/sdlc-workflow/skills/**/*.md`
for any of:

- `artifact: review-dimension` (Phase 2)
- `five_whys` (Phase 2)
- `lanes:` (Phase 2 cross-service plan)
- `artifact: simplify-run` (Phase 3)
- `artifact: profile` (Phase 3)
- `artifact: benchmark` (Phase 3)
- `artifact: experiment` (Phase 3)
- `artifact: instrument` (Phase 3)

**Why it matters.** The renderers consume sibling YAML correctly (proven
by the `.scratch/test-ai/_view/` smoke render — every class hook
present, all 52 unit tests green). But no `skills/wf*/reference/*.md`
instructs the agent to author the YAML. In real workflow use, the
renderer's `if (!sy) return renderSimple(...)` fallback fires on every
artifact.

**Fix surface (minimum).**

- [skills/review/SKILL.md](skills/review/SKILL.md) and any
  `skills/review/reference/<dimension>.md` — add a "Sibling YAML"
  section showing the `review-dimension` schema shape and when to write
  it (one per dimension MD).
- [skills/wf-quick/reference/rca.md](skills/wf-quick/reference/rca.md)
  — already covers `.html.fragment`, but doesn't instruct to populate
  `five_whys[]` in the sibling YAML.
- [skills/wf/reference/plan.md](skills/wf/reference/plan.md) —
  already covers `.html.fragment`, but doesn't instruct to add `lanes:`
  / `crosses-service` edges when a plan spans services.
- [skills/wf-quick/reference/simplify.md](skills/wf-quick/reference/simplify.md)
  (if exists) — add `simplify-run` sibling YAML instructions.
- New `skills/wf/reference/profile.md` — profile sibling YAML.
- New `skills/wf/reference/benchmark.md` / `experiment.md` /
  `instrument.md` — augmentation subtype sibling YAML. Or fold into a
  single `skills/wf/reference/augmentation.md`.

### S1.2 — `renderers/design.mjs` and `renderers/ship-run.mjs` lack sibling-YAML branches

**Evidence.** `grep -c siblingYaml` returns **0** on both files. The
schemas `siblingYamlSchemas.design` and `siblingYamlSchemas.ship-run`
exist in [tests/frontmatter.schema.json](tests/frontmatter.schema.json),
both are in `ALLOWED_FRAGMENT_NAMES` in
[scripts/verify-fragment.mjs](scripts/verify-fragment.mjs).

**Why it matters.** These were declared fragment-bearing types in the
Phase 1 plan — *before* the Phase 2/3 renderer pattern existed — but
never grew the branch. So Phase 1's claim of "five fragment-bearing
types fully shipped" was already only 60% true at the renderer layer.
Same structural bug shape as the orchestrator-sibling-discovery bug
just fixed in commit `0ba55ca`.

**Fix surface.** Apply the same template as `review-command.mjs` /
`simplify-run.mjs` / `profile.mjs`:

```js
export function render(artifact, ctx) {
  const sy = artifact.siblingYaml ?? null;
  if (!sy) return renderSimple(artifact, ctx, {...});
  // rich render: header + metric row + structured payload
}
```

Then add unit tests for the new branches (`design`: tokens table +
states + sizes; `ship-run`: stages timeline + checks table + rollback
metadata).

### S1.3 — `docs/site/sunflower-view.md` is stuck at Phase 1

**Evidence.**

- Line 83: *"The five fragment-bearing types are: `review`, `rca`,
  `plan`, `design`, `ship-run`."* Reality: eleven, after Phase 2 added
  `review-dimension` and Phase 3 added 5 more.
- Lines 107-116 (URL routing): omits `/sdlc/profiles/<run-id>/`.
- Cache-bust example reads `?v=9.21.0` (now `9.22.0` — already fixed in
  `a76057e` but worth noting other version references may exist).
- Nothing mentions: 5-whys panel, data-flow lane variant, per-dimension
  review filter behavior, simplify-run finding table, profile
  benchmark figure, augmentation subtypes, `--simplify` / `--profiles`
  CLI flags, the `--asset-base` local-preview pattern.

**Why it matters.** The CHANGELOG documents every shipped feature; the
user-facing docs site doesn't. A user reading the guide cold won't
know features exist.

## Severity 2 — significant gaps, degraded UX but not blocking

### S2.1 — Documentation drift across Phase 2 + Phase 3

Covered above in S1.3 details. Worth pulling into its own follow-up
because the fix is purely additive and isolated to one file.

### S2.2 — `_paths.mjs` can't resolve off-pipeline artifacts

`resolveViewPath()` is keyed to slug-rooted storage paths. The
orchestrator works around this at
[scripts/render-sunflower.mjs:277-279](scripts/render-sunflower.mjs:277)
by computing view paths inline for `kind === 'simplify' | 'profile'`.

**Risk.** Any other caller invoking `resolveViewPath()` on an
off-pipeline path gets `null` — silent failure. The link-graph rewriter
in [renderers/_link-graph.mjs](renderers/_link-graph.mjs) is the most
likely casualty; if a cross-link points at a simplify-run, it won't
rewrite.

**Fix.** Either fold the inline computation into `_paths.mjs` (adding
two new regex matches + return `{viewRel, kind}` for simplify/profile),
or add a kind-aware variant `resolveViewPath(storageRel, {kind})`.

### S2.3 — `renderers/profile.mjs:90` CSS modifier inconsistency

Emits `<span class="hotspot-cand is-cand">`. The modifier name
tautologically repeats the base class. Pattern elsewhere is
`is-{semantic-value}` (`is-ok`, `is-bad`, `is-high`). Cosmetic but
inconsistent — `is-yes` / `is-no` or `hotspot-cand-yes` /
`hotspot-cand-no` would match conventions.

### S2.4 — No tests for recent navigation fixes

The four nav fixes shipped without test coverage:

- `index.mjs` stages grid + slices preview + clickable activity
- `slice.mjs` stages nav grid + reviews nav grid + `is-missing` cards
- `render-sunflower.mjs` off-pipeline sibling-YAML discovery (commit
  `0ba55ca`)

All four are verified only by eyeball over the `.scratch` render. A
subtle regression slips through 52/52 passing tests. Add unit tests
that assert specific hrefs in the rendered HTML.

## Severity 3 — cleanup / nice-to-have

### S3.1 — Dashboard renderer has no schema type

`renderers/dashboard.mjs` is orchestrator-synthesized — no
`frontmatter.type: dashboard` exists in the schema's `oneOf`. This is
intentional (the dashboard is generated from the cross-slug index at
the end of the render pass), but undocumented. A one-line comment at
the top of `dashboard.mjs` saying
*"// Synthetic — invoked by orchestrator after slug renders; no
storage artifact backs this."* would prevent future-reader confusion.

### S3.2 — Plan claims aspirational "[shipped]" status

[SUNFLOWER-VIEW-PLAN.md](SUNFLOWER-VIEW-PLAN.md) Phase 2 line 1081
declares *"[shipped] Per-dimension review pages get their own scoped
fragments"* — but per S1.1, the *renderer* shipped while the *writer
that produces the sibling YAML* didn't. The "[shipped]" marker
conflates "rendering pipeline supports it" with "feature works
end-to-end in a real workflow." Consider a more granular status
convention: `[renderer-shipped, writer-pending]` or move the writer
work into the marker scope.

### S3.3 — Renderer helper duplication across phases

`review-command.mjs:88` and `simplify-run.mjs:87` both define a
near-identical `findingItem()` helper differing only in the
chip-rendering line. Candidate for extraction to `_icons.mjs` as
`findingHead({chip, file, line, action})`. Noted as `SR-1` in our own
scratch fixture (`.scratch/test-ai/simplify/sr-2026-05-22.yaml`).

## Cross-cutting theme

The dominant structural pattern across all S1 findings is **layer
contract drift**. Each phase shipped four layers — schema, verifier,
renderer, CSS — but left the fifth layer (skill-writer instructions)
behind. Result: every Phase 2/3 capability passes its own tests, the
verifier accepts the schema, the renderer produces correct HTML when
given correct input — and yet *no agent run ever produces the input*.

The same bug shape recurs at smaller scope:

- Phase 1 declared 5 fragment-bearing types but only 3 got renderer
  branches (`review`, `rca`, `plan`) — `design` and `ship-run` were
  left at `renderSimple`.
- Phase 3 orchestrator wired sibling-YAML for `workflow` artifacts but
  forced `null` for `simplify` and `profile` artifacts (fixed in
  `0ba55ca`).
- Every nav-grid renderer page emits clickable cards; the SVG
  stage-stripe figure that visually shows the same stages is
  non-clickable.

**Suggested mitigation.** Add a verifier check that walks `skills/`
and warns if any `ALLOWED_FRAGMENT_NAMES` entry has no
`artifact: <name>` writer mention. This catches the contract drift at
CI time rather than at "we shipped it and nothing changed" time.

## Recommended Phase 4 — writer rollout

Pure-additive, no schema / renderer / CSS changes. Scoped at ~3 hours.

1. **`skills/review/SKILL.md` + reference files** (1.5h) — add a
   "Sibling YAML" section to each dimension reference. Each
   `<dimension>.md` artifact written by the review skill must also
   write `<dimension>.yaml` with `artifact: review-dimension` +
   `dimension: <name>` + verdict + counts + findings.
2. **Extend `skills/wf-quick/reference/rca.md`** (0.5h) — add the
   optional `five_whys[]` block to the sibling-YAML template.
3. **Extend `skills/wf/reference/plan.md`** (0.5h) — add the optional
   `lanes:` block + `crosses-service` edge kind to the sibling-YAML
   template. Document when to emit (≥2 services touched, or any edge
   crosses a process boundary).
4. **New `skills/wf-quick/reference/simplify.md`** (0.5h) —
   `simplify-run` sibling-YAML template.
5. **New `skills/wf/reference/profile.md` + augmentation subtype
   templates** (1h) — profile, benchmark, experiment, instrument
   sibling-YAML templates. Could fold into one
   `skills/wf/reference/augmentation.md` since the subtypes share a
   storage location.

Bump to **v9.23.0**. CHANGELOG entry under "Added — Phase 4: skill
writer rollout (closes the contract)". The renderers don't change;
only the agent's authoring instructions do.

## Appendix A — Type/renderer/skill matrix

| Schema type | Renderer | Sibling-YAML branch? | Writer in skills/? |
|---|---|---|---|
| `index` | `index.mjs` | n/a | wf/SKILL.md |
| `intake` | `intake.mjs` | n/a | wf/SKILL.md |
| `shape` | `shape.mjs` | n/a | wf/SKILL.md |
| `design` | `design.mjs` | **NO (S1.2)** | wf-design |
| `craft` / `design-brief` | `design-brief.mjs` | n/a | wf-design |
| `slice-index` | `slice-index.mjs` | n/a | wf |
| `slice` | `slice.mjs` | n/a | wf |
| `plan-index` | `plan-index.mjs` | n/a | wf |
| `plan` | `plan.mjs` | yes (lanes added Phase 2) | wf + `.yaml` ref but no `lanes:` instructions (S1.1) |
| `implement-index` / `implement` | yes / yes | n/a | wf |
| `verify-index` / `verify` | yes / yes | n/a | wf |
| `review` | `review.mjs` | yes (Phase 1) | wf-quick / review — no `artifact: review` instructions (S1.1) |
| `review-command` | `review-command.mjs` | yes (Phase 2) | **NO writer (S1.1)** |
| `handoff` | `handoff.mjs` | n/a | wf |
| `ship-runs-index` / `ship-run` | yes / yes | **ship-run: NO (S1.2)** | wf-ship reference |
| `retro` | `retro.mjs` | n/a | wf |
| `simplify-run` | `simplify-run.mjs` | yes (Phase 3) | **NO writer (S1.1)** |
| `profile` | `profile.mjs` | yes (Phase 3) | **NO writer (S1.1)** |
| `augmentation` (rca) | `augmentation.mjs` | yes (Phase 2) | wf-quick/rca.md — no `five_whys` (S1.1) |
| `augmentation` (benchmark/experiment/instrument) | yes (Phase 3) | yes (Phase 3) | **NO writer (S1.1)** |
| `resume` / `skip-record` / `sync-report` | yes / yes / yes | n/a | wf-meta |
| `shape-amendment` / `slice-amendment` | yes / yes | n/a | wf |
| `critique-or-audit` | yes | n/a | wf-design |
| `design-augmentation` | yes | n/a | wf-design |
| `ship-legacy` | yes | n/a (deprecated) | n/a |
| `dashboard` | `dashboard.mjs` | n/a (synthetic — S3.1) | n/a |

## Appendix B — Verified by ground-truth grep at audit time

```text
$ grep -c siblingYaml plugins/sdlc-workflow/renderers/design.mjs
0
$ grep -c siblingYaml plugins/sdlc-workflow/renderers/ship-run.mjs
0
$ grep -rln "artifact: review-dimension\|five_whys\|lanes:" plugins/sdlc-workflow/skills
(zero results)
$ grep -rln "artifact: simplify-run\|artifact: profile\|artifact: benchmark\|artifact: experiment\|artifact: instrument" plugins/sdlc-workflow/skills
(zero results)
$ grep -n "fragment-bearing\|five fragment" plugins/sdlc-workflow/docs/site/sunflower-view.md
83:on settle. The five fragment-bearing types are: `review`, `rca`, `plan`,
```

## Appendix C — what's known good

The audit also surfaced what's working correctly:

- **PostToolUse hook** correctly matches `.ai/workflows/`,
  `.ai/simplify/`, `.ai/profiles/` paths
  ([hooks/render-on-artifact-write.mjs](hooks/render-on-artifact-write.mjs)).
- **Schema warnings count stable** at 48 across all renders before and
  after Phase 3 — no Phase 3 schema additions caused regressions.
- **All 52 unit tests pass** at `0ba55ca`.
- **All emitted block-level CSS classes** (~40 names) have matching
  styles in `assets/sdlc.css`.
- **Augmentation subtype dispatch** (`renderers/augmentation.mjs:18-30`)
  correctly handles `rca`, `benchmark`, `experiment`, `instrument` and
  falls back to `renderSimple` for unknown subtypes.
- **Components snippet helper** (`components/_components.mjs`,
  Phase 1.5) is correctly invoked at
  [scripts/render-sunflower.mjs:252-258](scripts/render-sunflower.mjs:252).
- **Additive vs `--clean` mode** correctly gates re-renders via mtime
  comparison; after the `0ba55ca` fix, sibling-YAML mtimes for
  simplify/profile artifacts are now included in the
  `storageInputs` array.

---

*Audit generated 2026-05-22 against `feature/sunflower-view@0ba55ca`.*
