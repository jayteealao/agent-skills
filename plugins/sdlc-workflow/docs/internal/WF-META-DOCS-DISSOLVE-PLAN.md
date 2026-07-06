# Dissolve `wf-meta` and `wf-docs` into `wf` — Design Plan

> Status: **PROPOSED — not built** (drafted 2026-07-05, compaction round added same day). Third and
> final subsume in the lineage `wf-quick→/wf` (v9.83.0) → `wf-design→/wf design` (v9.82.0) → **this**.
> Retires the last two sibling routers so `/wf` is the *single* SDLC entry point — and then compacts
> the resulting surface from 28 keys to **21** (see **Compaction decisions**). This doc works out how
> to honor the decisions without muddying `/wf`'s contract or drifting the reference tree. Nothing
> here is implemented yet — the user asked for the design first.

## Locked decisions (user, 2026-07-05)

1. **Drop `amend` entirely.** No workflow-slice amend concept survives. Every spec correction becomes
   either a **new slice** (the former `extend` behavior) or a **fix** (`/wf intake … fix`). This is a
   stronger form of the user's standing dislike of amending already-implemented slices: rather than
   gate amend by slice status, remove it. Provenance stays clean by construction — a completed slice
   is never re-specified in place; corrections are new tracked units.
2. **No `extend` keyword — auto-route instead.** `/wf intake <existing-slug> <description>` (a real
   on-disk slug followed by free scope text, no mode keyword) **auto-routes to extension**: add
   net-new slice(s) to that workflow. Convention over flags, taken to its end — the presence of an
   existing slug + new scope *is* the signal. `extend` never becomes a user-visible key.
3. **Full dissolve.** Every `wf-meta` member and all of `wf-docs` collapses into `/wf`. Both sibling
   skills are retired. `/wf` becomes the one command with families of keys.
4. **Deliverable: this internal design doc**, matching the other in-flight plans, before any edits.

## Compaction decisions (user, 2026-07-05 — round 2)

After seeing the 28-key surface, the user chose to shrink it. Five moves, taking 28 → **21**:

5. **Eliminate `how`.** Its D/E modes (explain your plan / explain your findings) fold into **`recap`**
   as focus modes; its A/B/C modes (quick code answer / codebase explain / deep web research) relocate
   to the **`deep-research`** skill. No `/wf how` key. This resolves O4. *(A/B are codebase-scoped and
   C is web-scoped; `deep-research` hosts all three — see O4-note below for the "which skill" question.)*
6. **Augmentations become a `shape` decision, not keys.** The user never reaches for `instrument`/
   `experiment`/`benchmark`/`profile` or thinks about when to run them. So the four keys are **removed**
   and augmentation becomes something **`shape` decides** (an "augmentation plan", like the existing
   doc plan) and downstream stages **apply as needed**. −4 keys.
7. **`announce` folds into `ship`.** Post-publish comms becomes a step of `ship` (it already runs
   strictly after publish and reads ship artifacts). −1 key.
8. **`sync` folds into `status`.** `status` already *detects* registry drift; it gains a reconcile
   **step** that repairs `INDEX.md`. No `/wf sync` key. −1 key.
9. **Keep `probe` and `simplify` as-is.** Their runtime-verification / non-workflow-scope distinctions
   earn their own keys; not folded into verify/review.

## Compaction decisions (user, 2026-07-05 — round 3: skills + review)

A third pass, mostly on the **skill** surface (directories under `skills/`) rather than keys. Takes
the key count 21 → **20** and cuts three skills.

10. **Merge `skip` into `close`.** One lifecycle-termination key. `/wf close <slug> [reason]` closes/
    archives the whole workflow (unchanged); `/wf close <slug> <slice>` closes or skips that **slice**
    (marks it terminated so downstream prerequisites are satisfied — absorbs `skip`'s stub-write, now
    slice-scoped). No `/wf skip` key. −1 key.
11. **Delete `imagegen`.** Already DEPRECATED as a one-release alias of `imagery`; that release has
    passed. Free deletion — −1 skill, −1 doc-site page, −1 codex-parity entry, zero capability loss.
12. **Fold the `wide-event-observability` skill into the instrument augmentation reference.** With
    instrumentation now a `shape` decision whose body lives at `wf/reference/augment/instrument`, that
    skill's knowledge *is* the instrument sub-procedure. Make it the reference `instrument` loads;
    delete the standalone skill. −1 skill, removes a duplicate-knowledge drift risk.
13. **EOB single-sourcing (committed, its own task).** The External Output Boundary block is duplicated
    ~21× and has drifted into 4 versions (PROGRESSIVE-DISCLOSURE-AUDIT F1). Collapse to one canonical
    file that every reference includes/points to. The dissolve already touches most of these files;
    do it in the same pass. This is the highest-leverage *content* reduction in the whole plan.
14. **Unify `review` into one top-level command (like `simplify`); delete the standalone review skill.**
    Today review is split: `/wf review <slug>` is the workflow *stage*, while the separate
    `sdlc-workflow:review` skill (`/review <dim>`, `/review sweep`) is *ad-hoc*. Merge them the way
    `simplify` already unifies standalone + workflow scopes: `/wf review` becomes the single review
    surface — `/wf review <dimension>` / `/wf review sweep <aggregate>` run ad-hoc (no slug),
    `/wf review <slug>` runs the stage. Delete the standalone `sdlc-workflow:review` skill. −1 skill.
    *(External `/code-review` and `/simplify` are built-in / other-plugin commands the sdlc plugin does
    not own — the unification makes them redundant for the user, but the plan cannot delete them; the
    user removes those from their own config. See O7.)*

**Left alone (user-confirmed):** the `patterns` skills (`error-analysis`, `refactoring-patterns`,
`test-patterns`) stay standalone for now; the intake analysis modes (`investigate`/`discover`/`ideate`)
stay separate — they genuinely differ in mechanism and rules; `yolo` stays its own key (auto-merge not
taken this round).

## Context

`/wf` today is the **lifecycle-stage dispatcher** — 19 keys, each *mostly* a stage executor that
writes a numbered stage artifact (plus the `design`/`probe`/`simplify` standalones and the
`auto`/`yolo` drivers). Two sibling routers remain:

- **`wf-meta`** — self-described "lifecycle-navigation dispatcher"; 12 members that "do not produce
  stage artifacts": `next`, `status`, `resume`, `sync`, `amend`, `extend`, `skip`, `close`, `how`,
  `announce`, `init-ship-plan`, `build-pipeline`.
- **`wf-docs`** — documentation subsystem: an orchestrator pipeline (discover→audit→plan→generate→
  review) plus 7 Diátaxis primitives (`plan`/`tutorial`/`how-to`/`reference`/`explanation`/`readme`/
  `review`).

The earlier subsumes worked because the moved things matched `/wf`'s contract: `wf-quick`'s members
were *entry flows* (they became `intake` modes); `wf-design` was a *compressed sub-workflow* (it
became the `/wf design` router-key). The full dissolve now forces in members that do **not** all
produce artifacts (`status`, `how`, `sync`), so the plan's core job is to **generalize `/wf`'s
framing** honestly rather than pretend everything writes a stage artifact.

## The reframe: `/wf` = one SDLC operation per key (not "one stage artifact per key")

`/wf`'s Step 2 "Emit Final Summary" already tolerates non-artifact members — it says *"Use `none`
for read-only sub-commands."* So the router mechanics don't actually assume every key writes an
artifact; only the *prose framing* in the SKILL.md header does. The dissolve updates that framing:
`/wf` runs **one SDLC operation** — a stage, a driver, an entry mode, a navigation query, a
project-pipeline action, or a docs run. The final surface after the dissolve **and** the compaction is
**20 keys**, presented in **families** so the menu stays legible:

| Family | Keys |
|---|---|
| **Stages** | `intake` · `shape` · `slice` · `plan` · `implement` · `verify` · `review` *(now also ad-hoc)* · `handoff` · `ship` · `retro` |
| **Standalone / drivers** | `design` · `probe` · `simplify` · `auto` · `yolo` |
| **Navigation** (from `wf-meta`) | `status` *(absorbs `sync`)* · `recap` *(absorbs `how` D/E)* |
| **Lifecycle control** (from `wf-meta`) | `close` *(absorbs `skip`; workflow- or slice-scoped)* |
| **Project pipeline** (from `wf-meta`) | `ship-plan` (router: `init` · `build` · `edit`) |
| **Docs** (from `wf-docs`) | `docs` (router: primitives + orchestrator) |

Counts: dissolve takes 19 → 28. Compaction round 2 removes 7 (4 augmentations → `shape`; `how` → recap
+ deep-research; `announce` → ship; `sync` → status) → 21. Round 3 removes 1 more (`skip` → `close`)
→ **20 keys**. Round 3 also cuts **3 skills** (`imagegen` deleted, `wide-event-observability` folded
into the instrument reference, standalone `sdlc-workflow:review` folded into `/wf review`). Every
capability survives — it just stops being a separate verb or skill.

## Member disposition (all 13 sources)

| Source member | Disposition | New surface |
|---|---|---|
| `wf-meta amend` | **DROPPED** | corrections → `/wf intake <slug> <desc>` (new slice) or `/wf intake <slug> fix` |
| `wf-meta extend` | **FOLDED into intake, no keyword** | `/wf intake <existing-slug> <desc>` auto-routes to extension |
| `wf-meta next` | **REMOVED (redundant)** | its "tell me the next command" job folds into `/wf status` (already surfaces `next-command`/`next-invocation`); `resume`/`auto` advance |
| `wf-meta status` | move + **absorbs `sync`** | `/wf status [slug]` — dashboard/detail; now also carries the reconcile step (repairs `INDEX.md` on drift) |
| `wf-meta resume` | **RENAMED → `recap`** (O5) + rewritten + **absorbs `how` D/E** | `/wf recap <slug> [slice\|plan\|shape\|slice-slug\|review\|findings]` — recaps what's been done (whole workflow or one slice) AND explains a plan/shape/findings on request (former `how` D/E). Writes `90-recap.md`. Reference: `wf/reference/recap.md` (drafted). `resume` = one-release alias |
| `wf-meta sync` | **FOLDED into `status`** | no `/wf sync` key — reconcile is a `status` step |
| `wf-meta skip` | **FOLDED into `close`** | `/wf close <slug> <slice>` closes/skips a slice (absorbs the stub-write, now slice-scoped). No `/wf skip` key |
| `wf-meta close` | move + **absorbs `skip`** | `/wf close <slug> [reason]` closes the workflow; `/wf close <slug> <slice>` closes/skips that slice |
| `wf-meta how` | **ELIMINATED** | D/E → `recap` focus modes; A/B/C → `deep-research` skill. No `/wf how` key |
| `wf-meta announce` | **FOLDED into `ship`** | post-publish comms is a `ship` step (writes `announce.md`); `/wf ship <slug> announce` re-runs comms only |
| `wf-meta init-ship-plan` | move under router | `/wf ship-plan init [--from-template <kind>]` |
| `wf-meta build-pipeline` | move under router | `/wf ship-plan build [--dry-run]` |
| `wf-docs` (all) | move under router | `/wf docs [<primitive>\|<slug>\|--audit-only\|<path>]` |

### Why `amend`'s ship-plan sub-scope is NOT lost

`amend` had a hidden second identity: `/wf-meta amend ship-plan` edited the project-level
`.ai/ship-plan.md` block-by-block (amend.md Steps S0–S5). Dropping *amend* means dropping the
**workflow-slice** corrector only. Ship-plan block editing survives as **`/wf ship-plan edit`** — a
third sub-command of the ship-plan router, carrying amend.md's Step S0–S5 logic verbatim (block
picker → re-run that block's `init-ship-plan` hypothesis loop → confirm → write + bump
`plan-version` → re-derive Block C/J from Block H). This keeps a single home for everything that
touches `.ai/ship-plan.md` and removes the awkward "amend also edits a non-workflow file" wart.

## The intake dispatcher change (the heart of decisions 1 & 2)

`reference/intake.md` Step 0 gains one branch and loses the amend collision path.

Current Step 0 resolution order: (1) slug-mode requires `token0`=existing-slug **AND** `token1`=mode
keyword → compressed slice; (2) explicit mode; (3) default + suggest-and-confirm, where an
existing-slug-first-token with a non-mode `token1` *falls through to default's collision detection*
(resume / amend / pick-different).

New resolution order:

1. **Slug + mode keyword** (unchanged) → compressed-slice attach. `token0`=existing slug,
   `token1`∈`{fix,rca,investigate,discover,hotfix,refactor,update-deps,ideate}`.
2. **Slug + free description (NEW)** → **extension mode**. `token0`=existing on-disk slug, `token1`
   is *not* a mode keyword and the rest is scope text → load the new `intake/extend.md` mode
   reference. It carries wf-extend's logic: interview → write full `03-slice-<new-slug>.md` file(s) →
   non-destructive `03-slice.md` append (with the stale-count reconciliation from extend.md Step 5)
   → route to `/wf plan <slug> <new-slug>`. Existing slices, especially `status: complete`, are never
   touched.
3. **Explicit mode (no slug)** (unchanged).
4. **Default + suggest-and-confirm** (unchanged) — but the old collision prompt's **"amend"** option
   is **removed** (amend no longer exists). A slug *derived from a description* that collides with an
   existing workflow now offers only **resume** / **extend (add to it)** / **pick a different slug**.

**`from-review` / `from-retro` extension seeding** (was `/wf-meta extend <slug> from-review`): keep as
optional descriptors the extend mode recognizes — `/wf intake <slug> from-review` /
`/wf intake <slug> from-retro` seed the extension from `07-review-*.md` / `10-retro.md` findings
exactly as extend.md Step 1 did. These are *extend sub-modes*, not top-level intake mode keywords, so
they don't enlarge the mode keyword set. (Open sub-decision O2.)

**Quote-escape still holds:** `/wf intake "extend the dashboard"` (quoted) never matches a slug, so a
description that legitimately starts with an existing slug word routes to default.

## Compaction mechanics (decisions 5–8)

### Augmentations become a `shape` decision (decision 6)

The four augmentation keys (`instrument`, `experiment`, `benchmark`, `profile`) are **removed as
top-level verbs**. Augmentation becomes something the lifecycle *decides and applies for you*, so the
user never has to remember to invoke it:

- **`shape` authors an augmentation plan.** Like the existing `## Documentation Plan` in `02-shape.md`
  (with its `docs-needed`/`docs-types` frontmatter), `shape` adds an `## Augmentation Plan` recording
  whether the work needs observability instrumentation, experiment/rollout scaffolding (A/B, flag,
  canary), a performance baseline+compare, and/or profiling — with `augmentations-needed: [...]` in
  frontmatter. The shape interview gains 1–2 questions to elicit this (perf-sensitive? user-facing
  behavior change worth measuring? risky rollout?).
- **Downstream stages apply as needed.** `plan` reads `augmentations-needed` and folds the relevant
  steps into the per-slice plan (e.g. a baseline step if `benchmark`); `implement` executes them
  (instrumentation code, benchmark baseline, flag wiring); `verify` runs the compare. The four
  augmentation *reference bodies* survive as **internal sub-procedures** the stages load when the
  plan opted in — they are no longer user-facing keys, and their artifacts (`04b-instrument.md`,
  `04c-experiment.md`, `05c-benchmark.md`) are written by the owning stage, not a standalone command.
- **`profile` is the outlier.** It is an ad-hoc diagnostic (`<area>`, writes `.ai/profiles/`, touches
  no app code) — not really a lifecycle augmentation. It rides along under the same "shape decides"
  umbrella (shape can flag "profile hotspot X"), but if a standalone diagnostic is ever wanted it can
  be reached through `/wf probe` or diagnosis rather than a dedicated key. (Open sub-decision O6.)
- **Cost:** this is the *largest behavior change* in the compaction — it moves augmentation authorship
  from user-initiated to shape-initiated and teaches `plan`/`implement`/`verify` to honor the plan. It
  is not a pure key-move. Sequence it as its own migration phase.

### `how` → `recap` (D/E) + `deep-research` (A/B/C) (decision 5)

`how`'s five modes split by whether they touch the workflow:

- **D (explain plan/shape/slice) + E (explain review/verify findings)** → **`recap` focus modes.**
  `recap`'s second positional already accepts a slice-slug; it now also accepts a **focus keyword** —
  `plan` / `shape` / `slice` / `review` / `findings`. Resolution: if the token exactly matches an
  existing slice-slug → slice recap; else if it is a focus keyword → explain that artifact (former
  how-D/E behavior); else error. This makes `recap` the one "understand this workflow" verb.
- **A (quick code answer) + B (codebase explain) + C (deep web research)** → the **`deep-research`
  skill.** These have no workflow tie (C already duplicates `deep-research`). They leave `/wf` entirely.
- The `how.md` reference is **deleted**; its D/E logic merges into `recap.md`; A/B/C logic is already
  covered by `deep-research` (add codebase-Q&A modes there if A/B aren't already supported).

### `announce` → a `ship` step (decision 7)

`announce.md`'s logic becomes a **phase of `ship`**: after the publish + post-publish verification,
`ship` drafts the audience/channel-tailored announcements and writes `announce.md`, stamping
`announcements-sent`. A thin sub-invocation `/wf ship <slug> announce` re-runs *only* that phase
(for when the user wants to regenerate comms without re-shipping). `announce.md` relocates to
`wf/reference/ship/announce.md` (or inlines into `ship.md` as a phase). No `/wf announce` key.

### `sync` → a `status` step (decision 8)

`status` already detects registry drift (it prints *"run `/wf sync` to reconcile"*). Fold `sync.md`'s
reconcile logic into `status` as a **step**: when `status` finds `INDEX.md` out of sync with disk
(missing dirs, unregistered workflows), it repairs `INDEX.md` in place and notes what it fixed.
**Read/write nuance:** today `status` promises "no side effects." The fold makes reconciliation a
*write*, so either (a) `status` auto-reconciles and reports the repair (simplest), or (b) reconcile is
gated behind a confirm when drift is found. Recommend (a) — the repair is idempotent and low-risk, and
a silently-stale registry is worse than a self-healing one. No `/wf sync` key.

### `skip` → `close` (decision 10)

`close.md` becomes the single lifecycle-termination key, resolved by whether a slice is named:

- `/wf close <slug> [reason]` → **workflow close** — the original close (five reasons, writes
  `99-close.md`), unchanged.
- `/wf close <slug> <slice>` → **slice close/skip** — marks that slice terminated so downstream
  prerequisites are satisfied; carries `skip.md`'s stub-write, now keyed on a **slice** rather than a
  pipeline stage. Resolution mirrors `recap`: exact slice-slug match → slice-close; else treat the
  second token as a close `reason`.
- `skip.md` merges into `close.md`; delete standalone `skip.md`. **Semantic shift to note:** the old
  `skip` skipped a *stage* (`/wf skip review`); the new form skips a *slice*. If stage-level skipping
  is still wanted, it lives as a sub-option of `close <slug> <slice>` scoped to a stage, or is dropped
  — confirm during migration (O8).

### `review` unified into one command (decision 14)

Mirror how `simplify` already spans standalone + workflow scopes. `wf/reference/review.md` gains a
first-token resolver:

- `/wf review <slug>` → the **stage** (per `review-scope`, writes `07-review*.md`) — unchanged.
- `/wf review <dimension>` / `/wf review sweep <aggregate>` (no slug) → **ad-hoc** review, the former
  standalone `sdlc-workflow:review` skill's behavior (one rubric inline, or fan-out sweep).
- Resolution: exact on-disk slug match → stage; else a known dimension/`sweep` keyword → ad-hoc; else
  the existing "unknown" error. Excluded from Step 0.5 fuzzy-suggest (it owns its own first-token
  resolution, like `simplify`).

The standalone `skills/review/` (`sdlc-workflow:review`) is **deleted**; its rubric bodies relocate
under `wf/reference/review/` for the ad-hoc path to load. External `/code-review` and `/simplify` are
not plugin-owned — see O7.

## Skill deletions (round 3)

Three `skills/` directories go away — a bigger maintenance win than the key cuts (each skill carries
its own EOB copy, doc-site page, and codex-parity entry):

| Skill | Fate |
|---|---|
| `skills/imagegen/` | **Delete** — deprecated one-release alias of `imagery`, now expired (decision 11) |
| `skills/wide-event-observability/` | **Delete as a skill** — its body becomes `wf/reference/augment/instrument`'s sub-procedure (decision 12) |
| `skills/review/` (`sdlc-workflow:review`) | **Delete as a skill** — folded into the unified `/wf review` (decision 14); rubric bodies → `wf/reference/review/` |
| `skills/wf-meta/`, `skills/wf-docs/` | **Delete** — the dissolve (redirect stubs per O3) |

Net plugin skills after: `wf`, `consult`, `imagery`, `uiproto`, `error-analysis`,
`refactoring-patterns`, `test-patterns` (patterns left alone per user). `imagery`/`uiproto` remain
pending the dispatch-isolation check (O-imagery, not committed this round).

## `docs` as a router-key (the `design` precedent)

`wf-docs`'s SKILL.md is already a two-mode dispatcher (orchestrator vs primitive) keyed off the first
token. It maps 1:1 onto a `/wf docs` router-key exactly like `/wf design`:

- `/wf docs` / `/wf docs <slug>` / `/wf docs --audit-only` / `/wf docs <path>` → orchestrator pipeline.
- `/wf docs <primitive> <args>` → single Diátaxis document.

The entire `wf-docs/reference/` tree relocates to `wf/reference/docs/`; `wf/reference/docs.md`
becomes the router (the former wf-docs SKILL.md body, minus its own External Output Boundary — see
Touchpoints). Because `docs` owns its own first-token resolution (primitive vs slug vs path vs flag),
it is **excluded from Step 0.5 fuzzy-suggest**, same as `design`/`probe`/`auto`/`yolo`.

## Hard constraints

- **No new numbered artifact types.** Moved members keep their existing output types
  (`shape-amendment`/`slice-amendment` die with amend; `slice` for extend; `docs-*` for docs; the
  `announce`/`sync`/`skip`/`close`/augmentation types are unchanged even though their *commands* move
  — `announce.md`/augmentation artifacts are now written by `ship`/`shape`+`plan` instead of standalone
  keys). The `resume`→`recap` aux type is the one rename (see below). TYPES otherwise unchanged ⇒
  renderers unchanged ⇒ `buildId` moves for the *skill-set* change, not for artifact schema.
- **Step 0.5 fuzzy-suggest membership** must be re-derived for the 20-key surface: the slug-consuming
  movers (`status`/`recap`/`close`) *are* included; the self-resolving keys (`docs`, `ship-plan`,
  `review` now that it owns dimension-vs-slug resolution) are *excluded*. `sync`/`announce`/`next`/
  `how`/`skip` and the four augmentations are gone. Keep the exclusion list in sync with the table.
- **External Output Boundary single-sourced (decision 13 — committed).** Collapse the ~21 inlined,
  4-way-drifted EOB copies to one canonical file every reference points to. This is now a planned task
  (migration phase 7b), not just a caution — the dissolve touches most of these files anyway, so it is
  the moment to fix it. Do NOT add a new inlined copy in any relocated reference.
- **Codex parity.** `status`/`recap`/`skip`/`close`/`ship-plan`/`docs` and the moved-in logic
  (`announce`→ship, `sync`→status, augmentation→shape/plan) are plain references → they mirror to
  `plugins/sdlc-workflow-codex/` via `npm run sync:codex` (unlike `yolo`, Workflow-tool-based and
  codex-excluded). The 187-case parity test must stay green.

## Touchpoint inventory

**Load-bearing (must edit):**
- `skills/wf/SKILL.md` — dispatch table settles at **21 keys**, grouped by family; "not a known key"
  error list updated (drops `next`/`sync`/`how`/`announce`/`instrument`/`experiment`/`benchmark`/
  `profile`); Step 0.5 include/exclude lists updated; header prose reframed ("one SDLC operation").
- `skills/wf/reference/intake.md` — Step 0 new extension branch; amend removed from collision prompt.
- **New** `skills/wf/reference/intake/extend.md` — wf-extend logic as an auto-routed intake mode.
- **Relocate + relink** `wf-meta/reference/{status,close}.md` → `wf/reference/`, and `recap.md`
  (rewritten, absorbs `how` D/E). Every relative cross-link re-bases (e.g.
  `../../wf/reference/_fragment-authoring.md` → `_fragment-authoring.md`).
- **Round-3 folds:**
  - `skip.md` → merged into `wf/reference/close.md` (slice-scoped); delete `skip.md`.
  - `skills/imagegen/` → **deleted** (+ its doc-site page, codex mirror, parity fixture).
  - `skills/wide-event-observability/` → body relocated to `wf/reference/augment/instrument.md`;
    skill deleted (+ doc-site/parity).
  - `skills/review/` (`sdlc-workflow:review`) → rubric bodies to `wf/reference/review/`; `review.md`
    gains the dimension-vs-slug resolver; skill deleted (+ doc-site/parity). Repoint anything that
    invoked `sdlc-workflow:review` (e.g. the former `how`/`announce` docs paths) to `/wf review`.
  - **EOB single-source:** create one canonical EOB file (e.g. `wf/reference/_output-boundary.md`);
    replace the inlined block in every SKILL.md + reference with a pointer; verify no drift remains.
- **Fold-in edits (compaction):**
  - `sync.md` reconcile logic → a step inside `wf/reference/status.md`; delete `sync.md`.
  - `announce.md` → a phase inside `wf/reference/ship.md` (or `wf/reference/ship/announce.md` loaded by
    ship); add the `/wf ship <slug> announce` re-run path; delete standalone `announce.md`.
  - `how.md` D/E → focus-mode section in `recap.md`; A/B/C → `deep-research` skill; delete `how.md`.
  - **Augmentation → shape/plan:** `shape.md` gains the `## Augmentation Plan` authoring +
    `augmentations-needed` frontmatter + interview questions; `plan.md`/`implement.md`/`verify.md`
    learn to read `augmentations-needed` and load the four augmentation reference bodies as internal
    sub-procedures; the four references move under `wf/reference/augment/` (internal, not keyed).
    Remove `instrument`/`experiment`/`benchmark`/`profile` rows from `wf/SKILL.md`.
- **New** `skills/wf/reference/ship-plan.md` (router) + relocate `init-ship-plan.md`→`ship-plan/init.md`,
  `build-pipeline.md`→`ship-plan/build.md`, and amend.md's Steps S0–S5 → `ship-plan/edit.md`.
  `ship-plan-templates/` moves under `ship-plan/`.
- **Relocate + relink** whole `wf-docs/reference/` → `wf/reference/docs/`; new `wf/reference/docs.md` router.
- **Delete** `wf-meta/`, `wf-docs/`, and the now-dead `wf-meta/reference/{amend,extend}.md`.
- **Redirect stubs** (do NOT hard-delete the invocation surface): if `/wf-meta …` / `/wf-docs …` are
  still invokable as skills, keep thin SKILL.md redirects — *"`/wf-meta <x>` moved to `/wf <x>`;
  `amend` was removed — use `/wf intake <slug> <correction>` (new slice) or `/wf intake <slug> fix`."*
  Mirrors the `/wf-quick` retirement message already in wf/SKILL.md.
- **Hooks:** `hooks/pre-write-validate.mjs`, `hooks/post-write-verify.mjs` reference these paths/types
  (esp. `isProseLogPath` and the amendment types) — drop amendment-type handling, repoint any
  wf-meta/wf-docs path assumptions.
- **Renderers:** `renderers/close-record.mjs`, `renderers/implement-index.mjs`, `renderers/index.mjs`,
  `renderers/docs-*.mjs` reference these skills/types — repoint. `docs-*` renderers stay (types
  unchanged); amendment renderers (if any) retire with the types.
- **`resume` → `recap` rename tails (NOT free):** the aux artifact renames `90-resume.md`/`type:resume`
  → `90-recap.md`/`type:recap`. Touches `renderers/resume.mjs` → `renderers/recap.mjs` (+ its row in
  `renderers/index.mjs`), the `90-resume` basename map in `renderers/_paths.mjs` → `90-recap`, the
  `pre-write-validate.mjs` resume reference, and `tests/frontmatter.schema.json` (the `"const":
  "resume"` type block ~L783 → add `recap`; keep `resume` for the one-release alias). Rebuild `dist/`
  in the same commit. This is a *rename of an existing aux type*, not a net-new numbered stage type —
  the "no new numbered artifact types" constraint still holds for 00–10.
- **Fixtures/tests:** `tests/wf-meta-fixtures.json` → fold into a `wf`-router fixture set; drop
  amend/extend rows, add the moved keys + the intake extension-routing case; `tests/frontmatter.schema.json`
  drops the amendment types.
- **Doc-site generator:** `docs/site/_build_pages.py` builds `reference/wf-meta.html` +
  `reference/wf-docs.html` and the `commands.html`/`skills.html`/`glossary.html` tables — regenerate;
  the two dedicated reference pages retire (or become redirects). Remember `docs/site` rides the codex
  synced payload — **regen BEFORE `sync:codex`** (the v9.96.0 gotcha).

**Provably untouched:** `design`/`probe`/`simplify`/`auto`/`yolo` references, the compressed-slice +
narrative-fragment machinery, tray, hub, render dispatch, `.ai/workflows/` artifact schemas.
*(Note: the 10 stage references are NOT all untouched now — `shape`/`plan`/`implement`/`verify` change
for the augmentation fold, and `ship` changes for the announce fold. Only `slice`/`handoff`/`retro`
plus the standalones above are truly untouched.)*

## Migration phases (atomic commit per phase, dedicated branch)

1. **Drop amend + fold extend into intake** — new `intake/extend.md`, intake Step 0 branch, remove
   amend collision option; delete `wf-meta/reference/{amend,extend}.md`; drop amendment types from
   schema/hooks/renderers. (Behavioral core; land + test first.)
2. **Move the navigation members** — relocate+relink `status/close` (NOT `next`/`skip` — folded) + the
   rewritten `recap` (was `resume`; keep `resume` alias row); fold `skip` into `close` (slice-scoped);
   add rows to wf/SKILL.md; update Step 0.5 lists + fixtures.
   **Scrub dead `/wf-meta amend`/`extend` references inside the moved files** → repoint to
   `/wf intake <slug> …`.
3. **Ship-plan router** — new `ship-plan.md` + `ship-plan/{init,build,edit}.md`; migrate
   `amend ship-plan` logic into `edit`.
4. **Docs router** — relocate `wf-docs` tree → `wf/reference/docs/`; new `docs.md` router; repoint
   `docs-*` renderers.
5. **Compaction: how + announce + sync folds** — merge `how` D/E into `recap` (add focus modes),
   route A/B/C to `deep-research`, delete `how.md`; fold `announce.md` into `ship` (+ re-run path),
   delete standalone; fold `sync.md` reconcile into `status`, delete standalone. Update SKILL.md rows,
   error list, fixtures.
6. **Compaction: augmentation → shape decision** (largest behavior change — own phase). `shape` authors
   the `## Augmentation Plan` + `augmentations-needed`; `plan`/`implement`/`verify` honor it and load
   the four augmentation bodies (relocated to `wf/reference/augment/`) as internal sub-procedures;
   remove the four keys from SKILL.md. Verify each augmentation still produces its artifact via the
   stage path, not a standalone command.
7. **Compaction round 3 — skill deletions + review unify.** Delete `skills/imagegen/`; fold
   `wide-event-observability` body into `wf/reference/augment/instrument.md` and delete the skill;
   unify `review` (add the dimension-vs-slug resolver to `review.md`, relocate rubric bodies to
   `wf/reference/review/`) and delete `skills/review/`. Update SKILL.md, fixtures, doc-site, parity.
7b. **EOB single-source (decision 13).** Extract one canonical `_output-boundary.md`; replace every
   inlined copy across SKILL.md + references with a pointer; grep to prove zero inlined copies remain.
8. **Retire the sibling skills** — redirect stubs (or full removal if invocation surface allows);
   delete `wf-meta/` + `wf-docs/`.
9. **Docs-site + codex + version** — regen `_build_pages.py`; `npm run build` (buildId bump);
   `npm run sync:codex` (parity); version bump (5 source spots + 53 doc brands + top-level mk);
   rebuild `dist/` in the same commit (any hooks/renderers touched).

## Verification

- Router-resolution fixtures: every moved key resolves to its new reference path; the intake
  extension-routing case (`/wf intake <existing-slug> <free desc>` → `intake/extend.md`) resolves;
  amend/extend keys are *gone* (negative fixtures).
- Full suite (currently 490) green; codex parity (187) green; docs gate (53 pages, brand+pager) green.
- Manual: `/wf-meta status` redirect fires; `/wf intake <slug> add X` creates a new slice and never
  edits a `complete` slice; `/wf ship-plan edit` reproduces the old `amend ship-plan` block loop;
  `/wf docs <primitive>` writes one Diátaxis doc.

## Risks

- **Augmentation discoverability flips to shape's shoulders (biggest risk).** Removing the four keys
  means augmentation only happens if `shape` *asks the right question*. If the shape interview doesn't
  reliably surface "is this perf-sensitive / worth instrumenting / a risky rollout?", augmentations
  silently never happen — worse than a key nobody used, because now nobody *decides*. Mitigation: make
  the `## Augmentation Plan` a required shape section (even if the answer is "none"), the way the doc
  plan is; and let `plan`/`verify` re-surface the question if the work turns out perf-sensitive. Also
  keep an escape hatch: `profile` especially may still want an ad-hoc entry (O6).
- **Menu is now lean (20 keys).** Family grouping + the router-key pattern keep it legible; the router
  logic is unchanged (first-token match). This risk is largely retired by the compaction.
- **`review` first-token ambiguity.** Unifying stage + ad-hoc means `/wf review <token>` must decide
  slug vs dimension. Mitigation: exact on-disk slug match wins; else known-dimension/`sweep`; else
  error. A dimension name that collides with a real slug resolves to the slug (stage) — document it.
- **Reference relink drift.** Moving/relocating references re-bases every relative link — the F1 class.
  Mitigation: grep each moved file for `](../` and `${CLAUDE_PLUGIN_ROOT}` after the move; single-source
  the EOB rather than copy it.
- **buildId churn.** Skill-set change bumps buildId → forces clean re-render + version bump + codex
  resync. Mitigation: batch phases 1–7, do the build/version/sync once in phase 8.
- **`status` loses its read-only guarantee.** Absorbing `sync` means `status` can now write `INDEX.md`.
  Anything that assumed `status` is side-effect-free (docs, muscle memory) must be updated; keep the
  write idempotent and reported.
- **Losing `amend`'s pre-build convenience.** Correcting an *un-built* spec now costs a new slice
  instead of a cheap in-place amendment. Accepted by decision 1 — the provenance win outweighs it, and
  a defined-but-unplanned slice can still be corrected by re-running `/wf slice` / `/wf plan`.
- **`from-review`/`from-retro` extend seeding** could feel hidden without a keyword (O2).

## Open sub-decisions (flagged, not blocking)

- **O1 — ship-plan as router vs two flat keys.** This doc proposes `/wf ship-plan {init,build,edit}`
  (router, consistent with `design`/`docs`). Alternative: flat `/wf init-ship-plan` + `/wf build-pipeline`
  + fold edit elsewhere. Router is cleaner but adds a resolution layer.
- **O2 — extend seeding surface.** Keep `from-review`/`from-retro` as extend sub-descriptors
  (proposed), or auto-detect intent from the description, or drop and let the user paste findings.
- **O3 — redirect lifetime.** One release of `/wf-meta`/`/wf-docs` redirect stubs (like wf-quick), or
  hard-remove immediately since these are `disable-model-invocation:true` user-only surfaces.
- **O4 — `how` split (RESOLVED by decision 5).** `how` is eliminated: D/E → `recap` focus modes, A/B/C
  → `deep-research`. One residual question (**O4a**): "wf deep-research" — is A/B/C's new home the
  *existing* standalone `deep-research` skill, or a `/wf deep-research` key? Default taken: the existing
  skill (adds no `/wf` key; A/B codebase-Q&A may need adding there since `deep-research` is web-first).
  Flip to a `/wf deep-research` alias only if the user wants research reachable under the `wf` umbrella.
- **O6 — `profile` escape hatch.** Under decision 6, `profile` stops being a key and rides the "shape
  decides" umbrella. But it's really an ad-hoc diagnostic (profile area X *right now*), not a
  shape-time choice. Options: (a) fully shape-gated (as written); (b) reachable via `/wf probe` /
  diagnosis for ad-hoc runs; (c) keep a single lightweight `profile` key despite the compaction.
  Leaning (b) — no new key, but ad-hoc profiling still has a door.
- **O7 — external `/code-review` + `/simplify` are not plugin-owned.** Decision 14 makes `/wf review`
  the single review surface, which makes the built-in / other-plugin `/code-review` and `/simplify`
  commands redundant *for the user* — but this plan cannot delete them (they live outside
  `sdlc-workflow`). Action item is on the user's own config, not this migration. (`/wf simplify` already
  covers the simplify case.) Confirm the user wants parity between `/wf review` ad-hoc and whatever
  `/code-review` did before retiring it on their end.
- **O8 — stage-skip fate.** Old `skip` skipped a *pipeline stage* (`/wf skip review` writes a stub so
  downstream prereqs pass); the merged `close <slug> <slice>` skips a *slice*. Decide whether stage-
  level skipping is still needed: (a) drop it (slices are the unit that matters); (b) keep it as
  `close <slug> <slice> <stage>` or a `--stage` qualifier. Leaning (a) unless a real stage-skip use
  case survives.
- **O5 — rename `resume` → `recap` (DECIDED).** `resume` did not advance the workflow — it produced a
  context brief — so next to `auto`/`yolo` the name misled. Renamed to **`recap`** and **rewritten**
  (see `wf/reference/recap.md`) to focus on recapping *what has been done so far* for a given slug, or
  a given slug + slice, in plain understandable language rather than a token-optimized sub-agent brief.
  Still NOT redundant with `status` (dashboard breadth vs recap depth — keep both). `resume` stays a
  one-release alias.
