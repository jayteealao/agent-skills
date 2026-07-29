# Compressed standard lifecycles for the intake change-modes — Implementation Plan

> Status: **BUILT & SHIPPED (v9.86.0).** The build change-modes (`fix`/`hotfix`/`refactor`/`update-deps`)
> are now compressed *standard* lifecycles and the 14 bespoke renderers were retired. Follow-on to
> wf-quick→/wf (the v9.83.0 subsume). Supersedes the earlier "relocate off-pipeline" draft.
> **⚠ Deviations from this plan as written (see D8 below):** `rca`/`investigate` stayed *forwarded*
> mode (NOT rebuilt as standalone `type:index` lifecycles), and `simplify` shipped as a *terminal
> router* (`type:workflow-index`, routing findings to downstream commands) rather than the multi-slice
> build-capable mode D8 proposed. `ideate`/`simplify` root a `type:workflow-index` slug; `probe` got
> no standalone mode (it is slug-only by design). Read the **D8 analysis-seeded** sections as the
> *proposed* design, not what shipped.

## Context

After the wf-quick subsume, the `/wf intake` change-modes still write **bespoke parallel pipelines**
instead of standard SDLC artifacts: `hotfix` writes `hf-brief/plan/implement/verify.md` (`type: hf-*`),
`refactor` writes `rf-*`, `update-deps` writes OFF-pipeline `.ai/dep-updates/<run>/…` (`type: dep-*`),
and `fix` writes `01-fix.md` then routes away to `/wf implement`. They render through **15** bespoke
renderers (4 `hf-*` + 5 `rf-*` + 5 `dep-*` + `fix-plan`) and don't look like real workflows.

**Goal (user decisions):** make each change-mode a **compressed *standard* lifecycle** that passes
through **every** SDLC stage — **no steps skipped** — just compressed/expedited per stage:
`01-<mode>`(intake) → `02-shape` → `03-slice` → `04-plan` → **stop and prompt the human before
implement** (the mode may run end-to-end without pausing when it judges the change low-risk) →
`05-implement` → `06-verify`, then route through the standard `07-review` → `08-handoff` → `09-ship`
→ `10-retro`. **Authorship is split** (see **D7**): the *mode skill* authors only the planning half
(`01-<mode>` → `04-plan`) then gates; the *standard stage commands* author execution onward
(`05-implement` → `10-retro`), taught to recognize the change-mode `workflow-type`s. Every stage emits
its **standard** numbered artifact with **standard types/renderers**, rendered as a **`type: index`**
full-lifecycle slug overview. This applies to `fix` too. Retire the `hf-*`/`rf-*`/`dep-*` bespoke
namespaces (delete their renderers; keep their types + path rows for legacy fall-through — see D5).
The terminal *analysis* modes (`ideate`/`simplify`/`probe`) are not build lifecycles — they root in a
workflow with their lead artifact only.

## The model

- **Lead = `01-<mode>.md` with `type: intake`** (the compressed brief/diagnosis). The filename carries
  the mode (`01-hotfix.md`, `01-refactor.md`, `01-update-deps.md`, `01-fix.md`). The **authoritative
  `workflow-type` discriminator lives on `00-index.md`** (that is what the stage commands + resume read,
  see fix.md Step 0); mirror it onto the lead for readability but the index is canonical. Because the
  *type* is `intake`, the renderer is `renderers/intake.mjs` (dispatch is by frontmatter `type`, not
  filename) and it counts toward `STAGE_NAV.intake` — **no `STAGE_NAV` change needed**. The lead must
  also satisfy `intakeFrontmatter`'s required set (`status` ∈ `{complete, awaiting-input}`,
  `stage-number: 1`, `created-at`/`updated-at`, `tags`, `refs`, `next-command`, `next-invocation`).
- **View-path placement is by *filename*, separately from the renderer.** `resolveViewPath`
  (`PHASE_BY_BASENAME`) maps `01-<mode>` → a view dir; the `type:index` overview's intake card / jump
  rail / stripe all link to the **fixed** `STAGE_NAV.intake.dir = 'intake'`. So **every** change-mode
  lead — including `01-fix` — must map to `['intake', null]`, or the intake card 404s. `01-fix` is
  currently `['fix', null]`: it **must be remapped**, not left as-is (see Touchpoints).
- **Downstream stages use STANDARD types** (`shape`/`slice`/`plan`/`implement`/`verify`) → standard
  renderers + view dirs already wired in `PHASE_BY_BASENAME`.
- **The gate** (stop-and-prompt before `05-implement`) is generalized from hotfix's existing
  `AskUserQuestion` (Proceed / Adjust / Escalate). Canonicalize it as a named convention in
  `intake/_intake-context.md`; each mode applies it inline. A mode MAY run end-to-end without pausing at
  this prompt when it judges the change low-risk — its discretion, per the user. (This skips only the
  human *pause*, never an SDLC *stage*.)
- **Stage authorship (D7) — the mode authors planning; standard commands author execution.** The mode
  skill writes only `01-<mode>`(intake) → `02-shape` → `03-slice` → `04-plan`, then **gates**. On
  proceed it routes into the **standard execution chain — each its own command**: `/wf implement`
  (→`05`), `/wf verify` (→`06`), `/wf review` (→`07`), `/wf handoff` (→`08`), `/wf ship` (→`09`),
  `/wf retro` (→`10`). Those commands are *taught* the change-mode `workflow-type`s (see Touchpoints) so
  they don't reject/misread the slug. This reuses the standard pipeline rather than re-implementing it
  per mode, and is what makes the workflow *resumable* via those commands (verification (e)).
  **Exception — `update-deps`:** its tier-ordered execution (per-package commands, per-tier commits,
  blocked handling) is specialized, so update-deps authors its own `05-implement`/`06-verify` inline
  (it does this today, off-pipeline) and then routes to `/wf review` — so it never invokes `/wf implement`
  or `/wf verify`, but it DOES reach `/wf review`. "Compressed" means single-pass/lightweight, never a
  skipped stage.
- **No stage is skipped.** Every change-mode's lifecycle *passes through* `01-intake` → `02-shape` →
  `03-slice` → `04-plan` → `05-implement` → `06-verify` (each stage single-pass/lightweight but present,
  with a real `03-slice.md` even when there's one slice — written as **`type: slice-index`** carrying a
  one-entry `slices[]` + `total-slices: 1` so the overview's slice/implement stations derive their
  counts via `sliceRoster()`), then routes through standard `07-review` → `08-handoff` → `09-ship` →
  `10-retro`.
- **`type: index` overview** (full 10-stage grid). Because nothing is skipped, intake→verify all light
  up as the run progresses; review/handoff/ship/retro light up as the standard post-implement commands run.
  ⚠ **`type: index` is the heaviest schema in the system** — `indexFrontmatter` requires **22 fields**,
  `status` ∈ `{active, complete, closed}` (NOT `ready`), and `progress` as a **stage→status object**
  (`{intake: complete, shape: complete, …}` with enum values `not-started|in-progress|complete|skipped`),
  NOT the YAML list (`- fix-plan: complete`) the current `type: workflow-index` overview writes. Because
  the schema is a `oneOf` keyed on `type`, a `type: index` doc missing any required field matches **zero**
  branches → schema-invalid. **This is a HARD WRITE BLOCK, not a soft warn:** `post-write-verify.mjs`
  runs full Ajv validation and `exit 2`s on any violation (gated by `hooks.verifyOnWrite`, default on) —
  so a non-conformant `00-index.md` is *rejected at write time* and the agent must re-Edit it. The
  rewritten mode skills MUST emit a fully-conformant `00-index.md` (and conformant `02-shape`/`03-slice`/
  `04-plan` — see Risks) on the first write, or every compressed run churns on write-block retries.
- **Mandatory sibling `.yaml` for the plan stage (and rca lead) — also a HARD block.** `post-write-verify`
  treats `type: plan` (and `type: rca`) as RICH_TIER: writing `04-plan.md` (type plan) without a sibling
  `04-plan.yaml` `exit 2`s, and `plan` is in `SIBLING_YAML_VALIDATED_TYPES` so the `.yaml`'s shape
  (`modules[]` ≥1, `files[]` ≥1) is validated too. So the mode-authored `04-plan` MUST ship a conformant
  `04-plan.yaml`, or carry `fragment: none` to opt out. (rca's lead already does this today.) `intake`/
  `shape`/`slice-index` are NOT rich-tier, so they need no sibling.
- **Backward-compat (LEGACY, not hard-break)** — mirrors the `workflow-type: quick`/`01-quick.md`
  precedent: keep the `hf-*`/`rf-*`/`dep-*`/`fix-plan` **types in the schema** so existing on-disk
  artifacts still validate, add them to the e2e `NOT_RENDERED` set, and **delete only the renderers**.
  **CRITICAL: keep the legacy *path resolution* too** — the `hf-*`/`rf-*` `PHASE_BY_BASENAME` rows and
  the `kind: 'deps'` branch in `_paths.mjs`, plus the `.ai/dep-updates/` discovery in
  `render-sunflower.mjs`. A deleted renderer with a *retained* view path falls through to
  `fallbackRender` (a plain readable page) — but a **removed** path row / kind branch makes
  `resolveViewPath` return `null`, and the orchestrator then **skips the artifact entirely** (no page at
  all; this is exactly the failure the `_paths.mjs:25-29` comment warns about). So to keep the
  "degrade to a plain page" promise (verification (f)), the rows/kind/discovery must STAY; only the
  renderers go. New runs write standard types. Hard-deletion of the rows+types is a later major bump.

### Per-mode mapping — every change-mode's lifecycle passes through the FULL set `01-intake → 02-shape → 03-slice → 04-plan → [gate] → 05-implement → 06-verify`, then `07-review → 08-handoff → 09-ship → 10-retro`. **Authorship (D7): the mode writes `01-<mode>`→`04-plan`; the standard commands write `05`→`10` (update-deps writes its own `05`/`06`).**

| Mode | lead `01-<mode>.md` (type) carries | Mode-authored planning stages (compressed, none skipped) | Execution (05+) |
|---|---|---|---|
| `fix` | (`intake`) the request | planning single-pass; one `03-slice` (`type: slice-index`) | std chain `/wf implement`→`verify`→`review`→… (un-suffixed single-slice) |
| `hotfix` | (`intake`) incident brief + diagnosis | `02-shape` = diagnosis/scope; one `03-slice`; `07-review` defaults to `security` | std chain (as fix) |
| `refactor` | (`intake`) brief + **baseline** (test snapshot in `02-shape` body) | `02-shape` = baseline + refactor scope; slices = the refactor units | std chain (as fix) |
| `update-deps` | (`intake`) scan inventory (`--security-only` filters) | `02-shape` = research/prioritize; `03-slice` = the P0/P1/P2 tiers; `04-plan` = tiered commands; `--audit-only` stops at the gate after `04-plan` | **self-authored** `05`/`06` (tiered exec) → `/wf review` (skips `/wf implement`+`/wf verify`) |
| `rca` *(analysis-seeded, D8)* | (`rca`, RICH — needs sibling `.yaml`) diagnosis **is** the intake; rca already synthesizes `02-shape` | single-build; one `03-slice`; chain continues *if a fix is warranted* | std chain (read-only lead; `STAGE_NAV.intake.types += rca`) |
| `investigate` *(analysis-seeded, D8)* | (`investigate`) option sketches **are** the intake | user picks an option → `02-shape`/slice on it; **continue the chain, stop routing back to `/wf intake`** | std chain (`STAGE_NAV.intake.types += investigate`) |
| `simplify` *(analysis-seeded, D8)* | (triage — lead type TBD: rich `simplify-run` vs `intake`) findings **are** the intake | **MULTI-slice**: triage fans findings into N `03-slice` entries on ONE slug; triage decides what becomes a slice | std chain plans/implements **each** slice; add `simplify` to `workflow-type` enum |
| terminal (D6): `ideate` (intake mode) + `probe` / `discover` | the analysis | NOT a build lifecycle — `type: workflow-index` lead only (probe keeps `probe-evidence/`); recommends a downstream command | n/a |

- **All of `fix`/`hotfix`/`refactor`/`update-deps`/`rca`/`investigate`/`simplify`/`discover` already have the *slug fork*** (`_compressed-slice.md`): *slug given* → one compressed `03-slice-<mode>-…` on the existing slug (no new workflow); *no slug* → the standalone path in the table above. The slug fork needs **no new work** — only the no-slug standalone path changes.

- `current-stage` must use the **standard enum** (`intake`/`shape`/`slice`/`plan`/`implement`/`verify`…)
  — NOT bespoke names like `diagnose`. Put descriptive labels in the free-form `stage-status` field.
- **Every compressed stage artifact must satisfy its `$def`'s required set** — not just `02-shape`
  (`docs-needed`/`docs-types`/`tags`/`refs`/`next-command`/`next-invocation`), but the `00-index`
  (`type: index`, 22 fields — see The model), `03-slice` (`type: slice-index`:
  `total-slices`/`best-first-slice`/`slices`), `04-plan`, and (for update-deps) `05-implement`/
  `06-verify` (the per-stage `metric-*` fields, `commit-sha`, `result`, `evidence-dir`). Provide them
  minimally (zeros/empty arrays where applicable), or relax the `$def`s for `compressed: true` — prefer
  minimal-provide to avoid schema churn, but **budget for the full required set, not just shape's**.

## Touchpoints

**Renderer path wiring — `renderers/_paths.mjs`:**
- ADD `PHASE_BY_BASENAME`: `01-hotfix`/`01-refactor`/`01-update-deps` → `['intake', null]`.
- **REMAP `01-fix` from `['fix', null]` → `['intake', null]`.** It is *present* but points at the wrong
  view dir for the new `type: index` overview, whose intake card/jump-rail/stripe link to the fixed
  `STAGE_NAV.intake.dir = 'intake'`. Leaving it at `['fix', null]` 404s the intake card on every fix
  overview (the lead renders to `fix/`, the card links to `intake/`). All four change-mode leads must
  land at `intake/`.
- **Do NOT remove** the four `hf-*` + five `rf-*` `PHASE_BY_BASENAME` rows or the `kind: 'deps'` branch
  — keeping them is what lets legacy artifacts fall through to `fallbackRender` (D5). Removing them
  makes `resolveViewPath` return `null` → the orchestrator skips the artifact (no page), breaking
  verification (f). They cost nothing (new runs never write those basenames) and harden the legacy path.
- Downstream `02-shape`/`03-slice`(-index)/`04-plan`/`05-implement`/`06-verify` already mapped.
- The analysis-seeded modes (`rca`/`investigate`) ALSO remap their leads `01-rca`/`01-investigate` →
  `['intake', null]` (so their `type: index` intake card resolves) — see the **D8 analysis-seeded block**.

**Renderers — DELETE (legacy compat via schema `$defs` + e2e `NOT_RENDERED` + retained path rows):**
`renderers/{hf-brief,hf-plan,hf-implement,hf-verify,rf-brief,rf-baseline,rf-plan,rf-implement,rf-verify,
dep-scan,dep-research,dep-plan,dep-implement,dep-verify,fix-plan}.mjs` (15 files). With the path rows
kept (above), each retired type resolves a view path but loads no renderer → `fallbackRender`.
`STAGE_NAV` in `index.mjs` — **no change for the build change-modes**; the analysis-seeded modes (D8) add
`rca`/`investigate` (+ maybe `simplify-run`) to `STAGE_NAV.intake.types`.

**e2e — `tests/e2e/acceptance.mjs`:** add the 15 retired types to `NOT_RENDERED` (so the schema-driven
test stops expecting their renderers). Keep the types in `frontmatter.schema.json` `$defs`/enums for
back-compat validation.

**On-pipeline move (update-deps only; profile/simplify/ideation handled separately):** the move happens
in the **skill** — update-deps writes standard artifacts under `.ai/workflows/<slug>/` (caught by the
existing `incremental` workflows arm) instead of `.ai/dep-updates/`. **KEEP the off-pipeline plumbing for
legacy fall-through** (parity with the retained `hf-*`/`rf-*` rows, D5): `deps` in `OFF_PIPELINE_BUCKET`,
the `--dep-updates` flag + `depUpdatesRoot` discovery (~10 references across `discoverArtifacts`, the
render + bootstrap paths, `filterStoragePath`, and the bootstrap re-spawn args at `render-sunflower.mjs`
~L1165), the `kind: 'deps'` branch, and the **two** `.ai/dep-updates/` arms in
`hooks/render-on-artifact-write.mjs` (`shouldSkipForPath` L56 + `detectRenderBucket` L97). With the
`dep-*` renderers deleted, legacy dep runs render via `fallbackRender`. (Alternative: hard-remove the
plumbing — then legacy `.ai/dep-updates/` views go stale rather than degrading, and the Risks/verification
"fall through to fallbackRender" language must be corrected to say so. Recommend KEEP for D5 parity.)

**Hooks:** `hooks/pre-write-validate.mjs` — drop `hf|rf` from the filename exemption
(`/^(?:hf|rf|skip)-/` → `/^skip-/`); `01-<mode>.md` already matches `NN-name.md`. (Do this per-phase,
same commit as the matching reference, to avoid a write-block window.)

**Skill mode references (both trees, `$wf` mirror):**
- Rewrite `intake/{fix,hotfix,refactor,update-deps}.md` to the compressed-standard-lifecycle shape
  (standard artifact names/types, `type: index` `00-index`, the gate, `current-stage` standard enum).
- `intake/_intake-context.md` — add the canonical **compressed-lifecycle gate** convention.
- **Fix the change-mode `workflow-type` gap in the standard stage commands.** Today these commands
  recognize only `quick` (compressed, reads one `01-quick.md`), `rca`/`investigate` (forwarded), and
  `feature`/unset (standard). The change-modes match none of those. Precise per-file state (verified):
  - **`implement.md`** has an explicit **"STOP — use your own command" arm** for `hotfix`/`rf`/`dep-update`
    (`implement.md:43`) and no `fix` case. **`verify.md` / `review.md` have NO STOP arm** — they just
    lack a change-mode case and fall through ambiguously.
  - **Add a NEW change-mode branch** (a 4th mode, distinct from quick/forwarded/standard) to
    `implement.md` + `verify.md` recognizing `workflow-type: fix | hotfix | refactor`, and to
    **`review.md` also `update-deps`** (update-deps self-authors `05`/`06` then routes *to* `/wf review`).
    **Pin the artifact naming:** the compressed lifecycle writes **un-suffixed single-slice** files
    (`02-shape.md`, `03-slice.md`, `04-plan.md`, `05-implement.md`, `06-verify.md`) — NOT the
    `-<slice-slug>`-suffixed files the existing **standard mode** reads, and NOT the single `01-quick.md`
    of compressed mode. The branch must read the un-suffixed names explicitly. (Decide up front: if you
    instead give the one slice a real slug and write `-<slice-slug>` files, you can lean on standard mode
    almost as-is — but then `00-index`/the overview must use that slug consistently. Recommend un-suffixed
    to match this plan's verification examples and `implement.md:20`'s "or `04-plan.md` for single-scope".)
  - **In `implement.md`, replace the `hotfix`/`rf` STOP arm** with the new branch (those modes no longer
    have their own implement command). **`update-deps` stays the exception:** `/wf implement` and
    `/wf verify` should redirect `workflow-type: update-deps` back to its own flow (it self-handles
    `05`/`06`); only `/wf review` accepts it. Just adding a `fix` case is insufficient — the other
    workflow-types won't match it.
  - `probe.md` Step 0: read the change-mode lead (`01-<mode>.md`) + `02-shape`/`04-plan` (it currently
    only knows `quick`/standard).
- `intake/_intake-context.md` already cited above for the gate convention.
- **Terminal modes (D6) — `ideate` / `probe` / `discover`** (NOT all intake modes): `ideate` is an intake
  mode (`skills/wf/reference/intake/ideate.md`); `probe` is a **top-level `/wf` key**
  (`skills/wf/reference/probe.md`); `discover` is an intake mode (`skills/wf/reference/intake/discover.md`),
  **kept terminal per #3** — it already writes `01-discover.md` + `00-index.md` in-slug, so no relocation.
  Each roots a `type: workflow-index` workflow (lead only, recommends downstream). For `ideate`: `_paths.mjs`
  add `01-ideate` → `['ideate', null]`; relocate off `.ai/ideation`. **Caveat (Phase 6):**
  `ideationFrontmatter` has **no `slug`** (keyed on `focus`) — rooting it in a slug workflow needs the lead
  to carry a slug (allowed; base only requires `schema`/`type`). Per D5, KEEP the legacy `.ai/ideation`
  off-pipeline discovery for fall-through. `probe` gains a standalone workflow mode. **`simplify` is NOT a
  terminal mode — see the analysis-seeded block below.**
- **Analysis-seeded build modes (D8) — `rca` / `investigate` / `simplify`.** Their *slug fork already
  exists* (`_compressed-slice.md`); only the **no-slug standalone path** changes — it now produces a
  `type: index` lifecycle whose intake stage is the read-only analysis, continued by the standard chain.
  - `_paths.mjs`: **remap `01-rca`/`01-investigate` → `['intake', null]`** (like `01-fix`) so the
    `type: index` overview's intake card resolves; the rich lead renderer is still chosen by `type`
    (`rca.mjs` etc.), it just lands in `intake/`.
  - `index.mjs` **`STAGE_NAV.intake.types` += `rca`, `investigate`** (+ simplify's lead type if it stays
    rich — see below). **This is the STAGE_NAV change** the rest of the plan said wasn't needed; it's
    scoped to the analysis-seeded leads only.
  - `frontmatter.schema.json`: **add `simplify` to `indexFrontmatter.workflow-type`** (rca/investigate/
    update-deps already present); decide simplify's lead type — keep the rich `simplify-run` triage (then
    `STAGE_NAV.intake.types += simplify-run` and the lead keeps its mandatory sibling `.yaml`) **or** a
    generic `type: intake` triage lead (no STAGE_NAV add, loses the findings-table figure).
  - **Standard-chain coverage must extend to the planning commands too.** The change-mode branch (already
    planned for `/wf implement`/`verify`/`review`) must ALSO be added to **`/wf shape`, `/wf slice`,
    `/wf plan`** for `rca`/`investigate`/`simplify`, so the analysis can flow the full chain. (Today only
    implement/verify/review have any workflow-type awareness; shape/slice/plan have none.)
  - Skill rewrites (no-slug path, all stay READ-ONLY — they author only intake/shape, never code):
    - `rca`: already synthesizes `02-shape.md`; switch its `00-index` to `type: index`; the chain
      continues to `/wf plan`→`implement` when a fix is warranted.
    - `investigate`: after the user picks an option, **continue the chain (stop routing back to
      `/wf intake`)**; synthesize `02-shape` on the chosen option.
    - `simplify`: **multi-slice** — write `00-index` (`type: index`, `workflow-type: simplify`) + the
      triage as intake + a `03-slice` roster with **one slice per routed finding-group**; the standard
      chain plans/implements each. Its no-slug standalone moves from `.ai/simplify/<run-id>.md` into
      `.ai/workflows/<slug>/` (KEEP the legacy `.ai/simplify` discovery + `lib/hook-utils.mjs` arm for
      fall-through, per D5).

**Schema descriptions:** `dep-*` descriptions stay **legacy off-pipeline** — new update-deps runs write
**standard** types (`shape`/`slice`/`plan`/`implement`/`verify`) in-slug, so `dep-*` types are retained
only for back-compat validation of old `.ai/dep-updates/` artifacts (do NOT relabel them "in-workflow").
Only `ideation`/`simplify-run` descriptions change to in-workflow (those types are *relocated*, not
abandoned — Phase 6). The `workflow-type` enum keeps existing values for back-compat (it already
includes `fix`/`hotfix`/`refactor`/`update-deps`).

**Tests:** `tests/unit/snapshots/_fixtures.mjs` — remove the 15 deleted-renderer imports/snapshot
fixtures; `tests/unit/lib/foundation.test.mjs` — drop the loop that asserts dedicated `dep-*` (and
`hf-*`/`rf-*`/`fix-plan`) renderers. **Because the off-pipeline plumbing is KEPT (D5),** the
`tests/unit/lib/bootstrap-offpipeline.test.mjs` + `tests/unit/hooks/hooks.test.mjs` dep/simplify cases
should **stay green as legacy-fall-through proof** (a `dep-*` artifact now renders via `fallbackRender`
rather than a dedicated renderer — assert the page exists, not the renderer). Add `_paths` cases for the
new basenames **including the `01-fix` → `intake/` remap** (regression-guard the 404 fix) and
`01-hotfix`/`01-refactor`/`01-update-deps` → `intake/`. Keep one `profile` case proving off-pipeline
still works.

**Codex + release:** mirror skill edits (`$wf`, file-relative); `dist`/`schemas`/`docs/site` ride
`build` + `sync:codex`. **Version bump — verify the live version at execution time (contested tree).**
As of this review: HEAD commits `9.83.0`, but the **working tree already has an uncommitted bump to
`9.84.0`** (a parallel session is mid-flight). So **target the next free minor — `9.85.0`** (do NOT
reuse `9.84.0`); reconcile if the parallel bump has landed by then. The bump surface is the usual 5
source/config spots + marketplace top-level (currently `1.110.0`) + Codex `0.3.0`→`0.4.0`
(`plugins/sdlc-workflow-codex/.codex-plugin/plugin.json`) + restamp 53 doc brands; `npm run build` is
required (PLUGIN_VERSION is bundled into `_shell.mjs`). Doc-site sweep of bespoke-artifact / off-pipeline
mentions.

## Migration phases (atomic commit per phase, dedicated branch off master)

1. **Infra (no behavior change)** — `_paths.mjs` add the 3 new lead rows **and remap `01-fix` →
   `['intake', null]`**; add the 15 legacy types to `NOT_RENDERED`; **keep** the `hf-*`/`rf-*` rows +
   `kind:'deps'` branch; confirm e2e + suite still green (the e2e uses `01-intake.md` fixtures, so it
   won't exercise legacy basenames — that's covered by smoke (f)).
2. **`fix`** — rewrite `intake/fix.md` so the mode authors `01-fix`(type intake)→`02-shape`→`03-slice`
   (type slice-index)→`04-plan` + gate, with a **conformant `type: index` `00-index`** (22 fields,
   `status: active`, `progress` as a stage-status object); add the `workflow-type: fix` **change-mode
   branch** to implement/verify/review + `probe.md` Step 0; delete `fix-plan.mjs` (the remapped `01-fix`
   row stays → fallback for legacy `type: fix-plan` leads).
3. **`hotfix`** — rewrite to standard artifacts (diagnosis→`02-shape`); **extend the change-mode branch
   to `workflow-type: hotfix` in implement/verify/review, and remove the `hotfix` STOP arm in
   `implement.md` only (verify/review have none — they just gain the case), same commit**; delete
   `hf-*.mjs`; drop `hf` from the filename exemption; **keep** the `hf-*` `PHASE_BY_BASENAME` rows.
4. **`refactor`** — rewrite (baseline→`02-shape` body); **extend the branch to `workflow-type: refactor`
   in implement/verify/review, remove the `rf` STOP arm in `implement.md` only**; delete `rf-*.mjs`;
   drop `rf` from exemption; **keep** the `rf-*` rows.
5. **`update-deps`** — skill writes standard artifacts in-slug + **self-authors `05`/`06`** (tiered exec)
   then routes to `/wf review`; teach **`review.md`** the `workflow-type: update-deps` case, while
   **`implement.md` + `verify.md` redirect** `update-deps` back to its own flow (it self-handles 05/06);
   preserve `--audit-only`/`--security-only`; delete `dep-*.mjs` only (**keep** the off-pipeline
   plumbing for legacy fall-through); define resume/slug semantics (`update-deps-<date>` slug).
6. **Analysis-seeded modes (D8) — `rca`/`investigate`/`simplify`.** Slug fork already exists (no change).
   Rewrite their **no-slug standalone** path to a `type: index` lifecycle (read-only lead = intake): remap
   `01-rca`/`01-investigate` → `['intake', null]`; **`STAGE_NAV.intake.types += rca`/`investigate`** (+
   simplify lead type if rich); add `simplify` to the `workflow-type` enum; **extend the change-mode branch
   to `/wf shape`/`slice`/`plan`** (not just implement/verify/review) for rca/investigate/simplify;
   `investigate` stops routing back to `/wf intake`; `simplify` writes a **multi-slice `03-slice` roster**
   (findings→slices) and relocates its no-slug standalone into `.ai/workflows/<slug>/` (keep legacy
   `.ai/simplify` discovery). All three stay read-only (author intake/shape only, never code).
7. **Terminal modes (D6)** — relocate `ideate` into a `type: workflow-index` workflow (off `.ai/ideation`);
   `probe` gains a standalone workflow mode; `discover` kept terminal (already in-slug, no change); resolve
   the no-slug friction on `ideation`; keep legacy off-pipeline discovery for fall-through.
8. **Tests + docs + build/sync + version bump** — fixtures, foundation, off-pipeline tests; doc-site;
   bump; `build`; `sync:codex`; `verify:docs`/`verify:codex`.

## Verification

- `npm test` green (rewritten off-pipeline/snapshot tests + new `_paths` cases); `verify:docs` +
  `verify:codex` green; two-tree `diff`/`grep` skill parity.
- **End-to-end smoke** in a scratch repo: run `/wf intake fix …`, `/wf intake hotfix …`,
  `/wf intake refactor …`, `/wf intake update-deps`, then `npm run render`, and confirm:
  (a) **after the intake command** the slug has the mode-authored planning set `01-<mode>.md`(type
  intake) + `02-shape.md` + **`03-slice.md`** (type slice-index) + `04-plan.md` + `00-index.md`, and NOT
  `hf-*`/`rf-*`/`.ai/dep-updates` (update-deps additionally self-authors `05`/`06`);
  (b) `00-index.md` **passes `post-write-verify` (no `exit 2`) as `type: index`** (22 fields present,
  `status: active`, `progress` a stage-status object) — and the overview's **intake stage card resolves**
  (`intake/INDEX.html` exists; the `01-fix` remap is in place, not a 404);
  (c) it renders on the **full 10-stage** slug overview, intake→plan lit after intake, implement→verify
  lighting up as the standard commands run;
  (d) the gate fires before implement;
  (e) the separate commands `/wf implement <slug>` (→`05`) → `/wf verify <slug>` (→`06`) →
  `/wf review <slug>` (→`07`) **resume correctly for `fix`, `hotfix`, AND `refactor`** (new change-mode
  branch reads the un-suffixed files; `implement.md`'s `hotfix`/`rf` STOP arm replaced); `update-deps`
  self-authors `05`/`06` and still reaches `/wf review`;
  (f) a planted legacy `hf-brief.md` (and a legacy `.ai/dep-updates/<run>/scan.md`) still validates and
  **degrades to a plain `fallbackRender` page** — proving the retained path rows/kind branch (back-compat);
  (g) **analysis-seeded (D8):** `/wf intake rca …` (no slug) writes a `type: index` lifecycle whose intake
  station **lights from the `type: rca` lead** (the `STAGE_NAV.intake.types` change) and continues via
  `/wf plan`→`/wf implement`; `/wf simplify` (no slug) writes ONE slug with **multiple `03-slice` entries**
  (findings→slices); `/wf intake rca <existing-slug>` still writes a single compressed slice (slug fork
  intact); `/wf intake discover …` stays terminal (no `type: index` lifecycle).

## Risks

- **Stage authorship is split (D7)** — the mode writes planning (`01`–`04`) only; the standard commands
  write execution (`05`+). "Every change-mode emits 01→06" was ambiguous; treat it as "the *lifecycle*
  passes through 01→06," not "the *mode skill* writes 01→06." `update-deps` is the one mode that authors
  its own `05`/`06`.
- **Standard-command `workflow-type` coverage** — the commands know only quick/forwarded/standard. Only
  `implement.md:43` has a STOP arm (for `hotfix`/`rf`/`dep-update`); `verify.md`/`review.md` just lack a
  case. The new branch must cover `fix|hotfix|refactor` in implement+verify and **`+update-deps` in
  review** (update-deps routes to review after self-verifying); in `implement.md` it **replaces** the
  STOP arm. It is a NEW 4th mode reading **un-suffixed** single-slice files (`04-plan.md`/`05-implement.md`,
  not `-<slice-slug>` suffixed, not the single `01-quick.md`) — do not assume it equals existing
  "standard mode." Adding only a `fix` case is insufficient. Do this per-phase, same commit as each
  mode's rewrite, so no half-migrated mode flows through the wrong arm.
- **Analysis-seeded modes (D8) widen the blast radius** — `rca`/`investigate`/`simplify` "work like fix":
  - **STAGE_NAV invariant is broken** (intentionally): `intake.types` gains `rca`/`investigate`
    (+ maybe `simplify-run`). Every place that enumerates intake membership keys off this, so audit the
    overview's intake station/jump-rail/stripe after the change. Confirm a `00-index.md` (type index)
    whose only intake-stage artifact is `01-rca.md` (type rca) lights the intake station.
  - **Read-only → lifecycle is a behavior shift, not just plumbing.** rca/investigate/simplify are
    documented "do NOT write code / do NOT plan." Keep that on the *analysis command*; only the standard
    chain writes code. The skill bodies must NOT start implementing — the gate + `/wf implement` do.
  - **Planning-command coverage:** the branch must reach `/wf shape`/`slice`/`plan` too (they have zero
    workflow-type awareness today), or the analysis-seeded lifecycle stalls after intake.
  - **simplify multi-slice + off-pipeline move:** findings→slices on ONE slug needs `simplify` in the
    `workflow-type` enum, a real `03-slice` roster, and relocation off `.ai/simplify/<run-id>.md`; its
    rich `simplify-run` lead (if kept) still hard-requires its sibling `.yaml`.
- **`discover` stays terminal (#3)** — do NOT scope it into the build chain; it keeps its slug fork and
  recommends `/wf intake rca` / `/wf-docs how`.
- **e2e atomicity** — never delete a renderer without first adding its type to `NOT_RENDERED` (or
  removing the type from the schema in the same commit). Note the e2e writes every fixture as
  `01-intake.md`, so it does **not** test legacy basenames — back-compat is proven only by smoke (f).
- **`current-stage` enum** — bespoke names (`diagnose`/`baseline`/`scan`) are NOT valid; map to standard
  stages, descriptive label → `stage-status`.
- **Compressed-stage required fields are HARD-gated at write time (ALL stages, not just shape)** — the
  `oneOf` is keyed on `type`, so any missing required field = zero matching branch = schema-invalid, and
  **`post-write-verify.mjs` `exit 2`s on it** (full Ajv, gated by `hooks.verifyOnWrite`, default on) —
  the write is rejected, not just warned. Budget for: `00-index` (`type: index`, **22 fields**,
  `status: active` not `ready`, `progress` a stage-status **object** not a list), `02-shape`
  (`docs-needed`/`docs-types`/…), `03-slice` (`type: slice-index`: `total-slices`/`best-first-slice`/
  `slices`), `04-plan` (**+ mandatory sibling `04-plan.yaml` with `modules[]`/`files[]` — also hard-blocked
  + shape-validated, since `plan` is RICH_TIER + SIBLING_YAML_VALIDATED**), and (update-deps) `05`/`06`
  `metric-*` fields. Provide minimally, set `fragment: none` where there's no structured data, or relax
  the `$def`s for `compressed: true`. The full write-time chain: `pre-write-validate` (presence of
  schema/type/slug + filename) → `post-write-verify` (full schema + RICH_TIER sibling `.yaml`).
- **`01-fix` view path** — remap to `['intake', null]` (Phase 1) or the intake stage card 404s on every
  fix overview; do not leave it at `['fix', null]`.
- **update-deps slug/run-id** — define resume semantics (`update-deps-<date>` slug); keep `run-id` as an
  optional field for continuity.
- **Legacy artifact downgrade depends on KEEPING the path rows** — old `hf-*`/`rf-*`/`dep-*` views fall
  through to `fallbackRender` **only if** their `PHASE_BY_BASENAME` rows / `kind:'deps'` branch /
  `.ai/dep-updates/` discovery are retained. Remove them and `resolveViewPath` returns `null` → the
  orchestrator skips the artifact (no page, not a plain page). Keep rows; delete only renderers;
  document in CHANGELOG; hard-delete rows+types only at a major bump.
- **Two-tree drift** — mirror skills by hand; parity-check after each phase.

## Resolved decisions

- **D1** — change-modes become compressed STANDARD lifecycles (user); applies to `fix` too. The
  **build-capable** set is `fix`/`hotfix`/`refactor`/`update-deps` **plus the analysis-seeded
  `rca`/`investigate`/`simplify`** (see **D8**).
- **D2** — `type: index` full overview (user). NB: this is the heavy 22-field `indexFrontmatter`, not the
  light `type: workflow-index` the current change-modes write — the rewrite must emit a conformant index.
- **D3** — for the **build change-modes** (`fix`/`hotfix`/`refactor`/`update-deps`) the lead =
  `01-<mode>.md` with `type: intake`; the **authoritative `workflow-type` discriminator lives on
  `00-index.md`** (mirrored onto the lead for readability). Renderer dispatch is by `type` (→
  `intake.mjs`); the lead's **view path** is by filename, so every lead — including `01-fix` — must map to
  `['intake', null]`. **STAGE_NAV is unchanged for these.** It is NOT unchanged for the analysis-seeded
  modes (D8), whose rich leads (`type: rca`/`investigate`) force a `STAGE_NAV.intake.types` extension.
- **D4** — gate generalized as an `_intake-context.md` convention; mode may skip the human *pause* when
  low-risk (user) — never an SDLC *stage*.
- **D5** — backward-compat: keep bespoke TYPES in schema + e2e `NOT_RENDERED` **and keep their
  `_paths.mjs` resolution (rows / `kind` / off-pipeline discovery)**; delete only RENDERERS → legacy
  artifacts fall through to `fallbackRender`. (Removing the path resolution would *skip* them, not
  degrade them.)
- **D6** — terminal/analysis modes root in `type: workflow-index` workflows (lead only, recommend
  downstream): **`ideate`, `probe`, and `discover`** — `discover` is kept terminal per the #3 decision
  (a holds/fails verdict isn't a change to build; it routes to `/wf intake rca` or `/wf-docs how`).
  **`simplify` is no longer here** — it moved to the build-capable set (D8). `ideate` is an intake mode;
  `probe`/`simplify` are top-level `/wf` keys (not `intake/` files) since v9.83.0.
- **D8** *(new — `rca`/`investigate`/`simplify` "work like fix", user)* — build-capable via the **slug
  fork they already have**: *slug given* → compressed slice (`_compressed-slice.md`, already wired in all
  three); *no slug* → a standalone `type: index` lifecycle where **the read-only analysis IS the intake
  stage** and the standard chain (`/wf shape`→`slice`→`plan`→`implement`→`verify`→`review`) continues it
  *if a build is warranted*. The analysis commands STAY read-only — they don't write code; the chain does.
  - **`rca`/`investigate` — single-build.** Lead keeps its rich type (`rca`/`investigate`), so
    **`STAGE_NAV.intake.types` gains `rca`/`investigate`** (the one accepted STAGE_NAV change) for the
    intake stage to light up. rca already synthesizes `02-shape.md`; investigate must stop routing back
    through `/wf intake` and instead continue the chain on the chosen option.
  - **`simplify` — multi-slice.** The triage fans out to **ONE slug with MULTIPLE slices** (one per routed
    finding-group); the triage *decides what becomes a slice*. Add **`simplify` to the `workflow-type`
    enum**; the standard chain plans/implements each slice. (Resolves the earlier fan-out mismatch:
    findings → slices within one slug, not N separate commands.)
- **D7** *(new — resolves the authorship ambiguity)* — **the mode skill authors the planning half
  (`01-<mode>`→`04-plan`) then gates; the standard stage commands (`/wf implement`→`05`, `/wf verify`→`06`,
  `/wf review`→`07`, … each its own command) author execution**. Teach `implement`+`verify` the
  `workflow-type: fix|hotfix|refactor` case (a NEW 4th mode reading **un-suffixed** single-slice files,
  not the `-<slice-slug>` standard files nor the single `01-quick.md`), replacing `implement.md`'s STOP
  arm; teach `review` the same plus `update-deps`. This makes the workflow resumable via the standard
  commands. **`update-deps` is the exception**: it self-authors `05`/`06` (tiered exec), so it never hits
  `/wf implement`/`/wf verify` — but it DOES route to `/wf review`.
