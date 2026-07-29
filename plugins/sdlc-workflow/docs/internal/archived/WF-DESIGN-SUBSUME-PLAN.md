# Subsume `wf-design` into `wf` — Implementation Plan

> Status: DRAFT for review. Author: planning session 2026-06-16 (branch `feat/sdlc-runtime-store`).
> Model settled after iteration; supersedes the orphaned-side-car architecture.

## Goal

Retire the standalone `/wf-design` router and re-home design as **one `wf` sub-command, `/wf design`,
that runs as a compressed workflow** (the wf-quick pattern). `/wf design` is the design *producer*;
the existing lifecycle stages become design-aware on the *consumption* side. Design stops being a
parallel router you must know to invoke and becomes a first-class, compressed member of `wf`.

## The model in one picture

```
PRODUCER (one new wf key)            CONSUMERS (woven into existing stages)
  /wf design  ──────────────────▶   slice · plan · implement · verify · review
  (compressed workflow)                 (each pulls its slice of design knowledge)
       │                                            ▲
       ▼                                            │
  reference/design/  ◀───────────────────────────── one shared knowledge library
  (15 transforms + brand + product + _design-context)
```

- **Producer:** `/wf design` — compressed/standalone *and* in-workflow. Authors the brief, the visual
  contract, runs the 15 transforms, and hosts setup/teach/extract/audit/critique — all as arguments,
  not as new keys.
- **Consumers:** `slice`/`plan`/`implement`/`verify`/`review` already read design artifacts; they gain
  explicit design-knowledge awareness from the shared library (the gradient below).
- **One library:** the 17 knowledge files relocate under `wf`; both the producer and the consuming
  stages load from it.

## Hard constraints (from the requester, as iterated)

1. **`/wf-design` (hyphenated router) is retired.** No surviving parallel design router; no wf-quick
   detour for freestanding design.
2. **`design` is a single new `wf` sub-command** (`/wf design`) that runs as a **compressed wf
   workflow**. The 14-key table grows by exactly one → 15. The 22 design operators are *arguments* to
   `/wf design`, never their own keys. (This deliberately relaxes the earlier "no new sub-commands"
   line in favor of one compressed-workflow key.)
3. **Lifecycle stages gain design-reference awareness** — `slice`, `plan`, `implement`, `verify`,
   `review` each pull the design knowledge relevant to their job.
4. **Lose no functionality** — every capability in the inventory below lands somewhere, intact.
5. **Full physical move** — the reference library relocates under `wf`; every path citation updates.
   Both trees.

## The `/wf design` sub-command (compressed / full workflow)

`reference/design.md` becomes the dispatcher (the old `wf-design/SKILL.md` brain — preflight,
register, image gate, design laws/bans — moved in).

**Grammar:** `/wf design <possible-slug> <design-command> <possible-additional-instructions>`
- The first token is a **slug** *iff* it matches an existing `.ai/workflows/<slug>/00-index.md`;
  otherwise the first token is the design-command (the no-slug shape).
- `<design-command>` (required) — `craft`, `colorize`, `audit`, `critique`, `setup`, `teach`,
  `extract`, or any of the 15 transforms.
- Trailing tokens — free-text instructions passed to the operator.

**Two invocation shapes, keyed on slug presence:**

| Shape | Behavior | Artifacts (emitted as it progresses) |
|---|---|---|
| `/wf design <slug> <cmd> [instr]` — existing workflow | **Compressed in-workflow flow.** Produces the design brief + contract, then **drives `slice → plan → implement → verify` itself**, compressed. Design *owns* the downstream flow — there is **no hand-back** to `/wf slice`. | `02b-design.md`, `02c-craft.md` → `03-slice*` → `04-plan-*` → `05-implement-*` → `06-verify-*` |
| `/wf design <cmd> [instr]` — no slug | **Full lifecycle.** Creates a new slug and runs the complete flow **intake → … → retro**, the design intent seeding it. | the full `00`–`10` artifact set |

Notes:
- **2b hand-back, fixed.** The in-workflow shape does *not* write a brief and stop — it continues
  straight into slice→plan→implement→verify, so the slice/plan/implement/verify design-consumers
  always fire. This closes the original `craft → implement` skip (the latent bug from the review).
- `wf/SKILL.md` Step 0 gains the `design` row. Step 0.5 (fuzzy-slug): `design`'s first token is an
  *optional* slug, so resolve by **existence check** — match → compressed in-workflow; no match → the
  token is the command, run the no-slug full flow. Do **not** fuzzy-suggest a non-matching first token
  as a typo'd slug — for `design` it is a command.
- The compressed flow reuses `wf-quick`'s collapsed-stage machinery, but still emits each numbered
  artifact so the rendered views and downstream gates see a normal workflow.
- `image_gate` mutation lock, `shape=pass` approval, register detection, and the 4
  codebase-inspection sub-agents all live in `reference/design.md` (carried from the old preflight).

## Per-category flow span

`slice→plan→implement→verify` is the span for *build* commands only. The `<design-command>` decides
how far the flow travels: the dispatcher resolves the command to a category (the old router's
groupings) and runs only the stages that category needs.

| Category | Commands | `<slug>` provided — compressed span | no slug |
|---|---|---|---|
| **Producer** | `craft` | `02b-design` → `02c-craft` → `slice` → `plan` → `implement` → `verify` (design the spec, then build it) | create slug → **full lifecycle** `intake → … → retro` |
| **Transformation** | the 15 (`colorize`, `harden`, `typeset`, `adapt`, …) | focused `02c-craft` → `slice` → `plan` → `implement` → `verify` (the transform *is* the implement step) | create slug → **full lifecycle** `intake → … → retro` |
| **Review / analysis** | `audit`, `critique` | single review step → `07-design-audit` / `07-design-critique`; **no slice/plan/implement** (audit reads the slug's `06-verify` metrics) | standalone one-shot report against the target code (lightweight record) |
| **Inspection** | `extract` | single read-only step → `design-notes/extract-*` + `tokens-extracted.css`; no build | standalone extract report |
| **Context** | `setup`, `teach` | write `PRODUCT.md` / `DESIGN.md` (project-root, slug-independent) | identical — project-root files, no stages |

Notes:
- Only **Producer + Transformation** produce code, so they are the only categories that run the build
  span (and the no-slug full lifecycle). Review / inspection / context commands are single-step
  regardless of slug; the slug only decides whether the artifact attaches to an existing workflow or a
  standalone record.
- The old *"you can't transform code that doesn't exist yet"* gate **inverts**: the compressed flow now
  *builds* the code at its `implement` step, so a transform no longer needs pre-existing code — it
  either creates the surface or modifies the slug's existing implementation, both at `implement`.
- The category → span map lives in `reference/design.md` (the same table the old router used for
  stage-gating), so a future operator is one new row.

## Per-stage design-knowledge consumption (the gradient)

`/wf design` *produces*; these five stages *consume*, each pulling only its relevant slice from the
shared `reference/design/` library + `_design-context.md`. Gated behind `stack.ui≠∅` so non-UI work
is unaffected.

- **slice — *structures* around it.** Consumes the brief's state inventory (empty/error/loading/
  first-run → candidate slice boundaries) and the contract's mock-fidelity inventory (distinct visual
  surfaces → slice boundaries). Loads `onboard`/`polish` state-completeness knowledge to recognize
  states worth their own slice. *(Already reads 02b/02c "mandatory when present.")*
- **plan — *cites* it.** The reference union-loader (already present) turns each recommended reference
  into a concrete plan-step pointer (`follow reference/design/typeset.md for the type scale`). Carries
  register + anti-goals.
- **implement — *applies* it.** Reads the transform playbook for the cited references and applies them
  during the build; registers each as a `design-<sub>` augmentation. The deepest consumer. *(Already
  has the full augmentation dispatch + union-loader.)*
- **verify — *measures* it.** The existing a11y / perf / responsive / web-vitals gates are the
  measurable design floor for any UI slice; per-augmentation re-checks confirm each applied transform
  hit its goal. These are the measurements `review`'s audit dimension reads.
- **review — *judges* it.** `design-audit` + `design-critique` run as two dimensions in the parallel
  review fan-out (see below); contract anti-goals are checked. *(Already runs frontend-accessibility/
  frontend-performance/ux-copy on frontend changes.)*

`shape` keeps its existing role (feature discovery, incl. the round-3 visual-surface questions) and
simply *recommends `/wf design`* when `stack.ui≠∅` — it does not absorb brief/contract authoring.

## Audit & critique → `review` fan-out dimensions

Both run as dimensions inside `review`'s existing parallel dispatch — and are *also* reachable ad-hoc
via `/wf design audit|critique`:

- **`audit`** consumes `verify`'s already-measured a11y/perf/web-vitals (from `06-verify-*.md`) instead
  of re-running axe-core; adds theming/responsive/anti-pattern judgment + 0–4 scoring; emits
  `07-design-audit.md`. If no verify ran (ad-hoc), it measures itself. **a11y stays isolated to
  review/verify — never folded into the producer's brief/contract steps.**
- **`critique`** is register-forked (brand=distinctiveness, product=earned-familiarity); emits
  `07-design-critique.md`. Stance rules + font reflex-reject preserved.

Single-source-of-truth: a11y/perf are measured once (in verify), interpreted in review — the two
stages can't disagree about the same number.

## Functionality inventory → destination mapping (the spine — "lose nothing")

| wf-design capability | Destination | Mechanism / preserved by |
|---|---|---|
| `shape` (design brief → 02b) | **`/wf design`** producer | 3-round visual-direction interview, imagegen probes, `recommended-references:` authoring, `02b-design.md` (type `design`). Multi-round wait + separate `shape=pass` approval preserved. |
| `craft` (visual contract → 02c) | **`/wf design`** producer | North-star mock, mock-fidelity inventory, implementation contract, `references-loaded:` array, `02c-craft.md` (type `design-contract`) + sibling yaml/fragments. Build gate + invalid-skip-reason enforcement preserved. |
| `craft` freestanding (brief→mock→code) | **`/wf design <description>`** compressed | The no-lifecycle fast path = the standalone compressed mode. |
| `setup` / `teach` (PRODUCT.md/DESIGN.md) | **`/wf design setup|teach`** | Project-root files (shared across features) — NOT per-slug artifacts. `[TODO]` + `<!-- intentionally omitted -->` conventions preserved. |
| `extract` (reverse-engineer tokens) | **`/wf design extract`** | Raw-grep token/system extraction; `design-notes/tokens-extracted.css`. No prior context needed (its defining trait). |
| 15 transformations (animate…adapt) | **implement** applies; **`/wf design <op>`** ad-hoc; library at `reference/design/` | Implement applies the playbook per `recommended-references:` and registers `design-<sub>` augmentations; ad-hoc/post-hoc via `/wf design <op>`. |
| `audit` (07-design-audit) | **review** dimension + **`/wf design audit`** | Consumes verify's measurements; theming/anti-pattern/scoring judgment. |
| `critique` (07-design-critique) | **review** dimension + **`/wf design critique`** | 7-dimension register-forked eval. |
| register detection (brand/product) | **`_design-context.md`** (shared) | Loaded by `/wf design` + the consuming stages. Load-bearing across all transforms + critique. |
| design laws + absolute bans | **`_design-context.md`** (shared) | colorize border-stripe ban, typeset 18-font reject, etc. — single source. |
| imagegen waterfall + `image_gate` lock | **`/wf design`** (probes/mock) | imagegen skill unchanged; `image_gate=pending` blocks code mutation until visual direction confirmed. |
| 4 codebase-inspection sub-agents | **`/wf design`** preflight | Token scanner + framework detector reuse the `stack` fingerprint where possible. |

### Easy-to-lose list (must be carried explicitly)

Multi-round interview wait + `shape=pass` approval · image gate as mutation lock + invalid skip
reasons · `harden` structured report format · `optimize` profile-before-optimizing · `colorize`
border-stripe ABSOLUTE BAN + rationale · `typeset` 18-font reject · `adapt` four planes (incl.
dark-mode tokens + print) · `delight` performance-delight · `polish` 7-state completeness · `distill`
classify-then-cut · transformation artifact §5 "no bans introduced" + `register:` field · setup/teach
project-root (not per-slug) scope.

## Reference-library relocation (physical move)

- Move `skills/wf-design/reference/{15 transforms, brand, product}.md` → `skills/wf/reference/design/`.
- New shared `skills/wf/reference/design/_design-context.md` (laws + bans + register + preflight + image gate).
- Old `wf-design/SKILL.md` brain → `skills/wf/reference/design.md` (the `design` key dispatcher).
- Update path citations: `skills/wf/reference/plan.md` + `implement.md` (`skills/wf-design/reference/<name>.md`
  → `skills/wf/reference/design/<name>.md`), and `/wf design`'s own authoring of `recommended-references:`.
- `renderers/index.mjs` `STAGE_NAV`: keep `design`/`design-contract`/`design-brief` under `shape`'s
  bucket (or a new `design` bucket); **add the orphaned `design-critique`/`design-audit`** under `review`.
- `post-write-verify.mjs` sibling-YAML allowlist (`design`, `design-audit`, `design-critique`,
  `design-contract`) unchanged — artifact `type:` values are preserved, so **renderers don't change**.

## Migration phases

1. **Library move + shared context + dispatcher** — relocate 17 refs, write `_design-context.md`,
   move the router brain to `reference/design.md`, update the 2 path citations. Mechanical.
2. **Add the `design` key to `wf`** — `SKILL.md` row + Step 0.5 optional-slug handling;
   `reference/design.md` resolves the two shapes (slug → compressed `slice→plan→implement→verify`;
   no-slug → full `intake→…→retro`). Retire `/wf-design` command surface; repoint to `/wf design`.
3. **Weave consumption into the stages** — `slice`/`plan`/`implement` design-knowledge pulls (mostly
   present; fill gaps); `verify` measurable floor; gate everything on `stack.ui≠∅`.
4. **Audit + critique as review dimensions** — add to review's fan-out; audit consumes verify's numbers.
5. **Routing** — `intake`/`shape` adaptive routing recommend `/wf design` when `stack.ui≠∅`.
6. **Renderer `STAGE_NAV` fix** + confirm all `design*` types still resolve.
7. **Docs + brand stamps + version bump** — rewrite `docs/site/reference/wf-design.html` +
   `how-to/use-design.html` to the `/wf design` model; bump version (5 source spots + marketplace
   top-level + ~53 doc brands); `npm run build`; `npm run sync:codex`.
8. **Codex skills hand-mirror** — apply phases 1–5 under `sdlc-workflow-codex/skills/` (`$wf` prefix +
   `agents/openai.yaml`); drop `wf-design` from the Codex manifest. `dist`/`schemas`/`docs/site` ride
   the Phase 7 sync — no hand-work there. See Codex alignment below.

## Codex (`sdlc-workflow-codex`) alignment

`sync:codex` copies the **runtime payload** — `PAYLOAD_DIRS = [dist, assets, components, schemas,
docs/site]` + `runtime-manifest.json` — into `sdlc-workflow-codex/runtime/`, byte-for-byte, behind a
buildId-parity gate (`scripts/sync-codex-runtime.mjs`). So Codex alignment splits cleanly into "free"
and "by hand":

**Auto-synced — do it once in the Claude tree, then `npm run build && npm run sync:codex`:**
- **Renderers + hooks + lib** (`dist/`) — the `STAGE_NAV` fix and all compiled logic. The Codex
  renderers update for free.
- **Schemas + components + assets** — artifact `type:` values are preserved, so schemas don't change.
- **The entire doc site** (`docs/site/` is in the payload) — the rewritten `wf-design.html` /
  `use-design.html` + the ~53 brand stamps sync. **Do not hand-mirror docs to Codex.**
- `verify:codex` (`--check`) fails the release if any payload byte or the buildId differs.

**Hand-mirrored — `skills/` is the ONLY manual Codex surface.** Apply every Phase 1–5 skill edit a
second time under `plugins/sdlc-workflow-codex/skills/`, with two systematic differences:
- **Prefix:** `$wf design`, not `/wf design`, throughout the refs (Codex's invocation convention).
- **Native interface files (`agents/openai.yaml`):** each Codex skill carries one. **Delete**
  `skills/wf-design/agents/openai.yaml` on retirement; fold its `display_name`/`default_prompt`
  ("Run a freestanding design audit…") into `skills/wf/agents/openai.yaml` so the `wf` skill
  advertises design. No new agent files — `design` is a `wf` argument and `wf` already has its file.
- Same moves as the Claude tree: relocate the library to `skills/wf/reference/design/`, the brain to
  `skills/wf/reference/design.md`, write `_design-context.md`, add the `design` key to
  `skills/wf/SKILL.md`, weave consumption + per-category span into the stage refs, retire
  `skills/wf-design/`.

**Codex manifest:** remove `wf-design` from the Codex plugin manifest + marketplace skill list.

**Verification order:** `npm run build` (Claude) → `npm run sync:codex` (runtime+docs parity, buildId
lockstep) → `npm run verify:codex` (gate) → `grep -h` the design-ref filenames across both `skills/`
trees and `sort -u` to confirm the hand-mirror is complete → Codex test suite. The `grep -h | sort -u`
parity diff is the repo's standard guard against the two-tree drift that bites every cross-tree change.

## Parity & cost surface

- **Both trees, by hand** — `sync:codex` does *not* mirror `skills/`. Every edit lands in
  `plugins/sdlc-workflow` *and* `plugins/sdlc-workflow-codex`. Codex uses the `$wf` prefix
  (so `$wf design`).
- **Build required** — `PLUGIN_VERSION` is bundled into `dist/` (`_shell.mjs`) and `renderers/index.mjs`
  changes; `npm run build` then `npm run sync:codex` (buildId in lockstep).
- **Gates** — `verify:docs` + `verify:codex` + the full ~418-test suite green. Tests that name
  `wf-design`/its router resolution must be **ported** to `/wf design`, not just deleted.
- Large, multi-commit change on a dedicated branch; atomic commit per phase.

## Resolved decisions

- **D1 (shape bloat) — dissolved.** `/wf design` produces the brief + contract; `shape` only recommends it.
- **D2 (intake scope-creep) — dissolved.** setup/teach/extract are `/wf design` arguments, not intake steps.
- **D3 (a11y isolation) — kept.** a11y stays in review/verify, never in the producer's brief/contract.
- **D4 (freestanding home) — `/wf design` compressed**, not `/wf-design`, not wf-quick. `/wf-design` retired.

## Risks

- **One new `wf` key** — re-confirm the table-growth is acceptable (it is, per requester); the 22 ops
  stay arguments so the table doesn't explode.
- **Two-tree drift** — the repo's highest-frequency failure mode. Verify parity with `grep -h | sort -u`
  on the reference list after each phase.
- **Slug-vs-command resolution** in `reference/design.md` — the first token is an *optional* slug;
  resolve by exact existence check (match → compressed in-workflow; else the token is the command →
  no-slug full flow). A wrong guess sends the work down the wrong flow, so this check must be exact,
  never fuzzy.
- **Compressed depth vs the full flow** — `<slug>` compresses `slice→verify` (skips intake/shape,
  which the existing workflow already has); no-slug runs the *complete* lifecycle. Confirm a
  single-operator run (`/wf design <slug> colorize`) still produces a real, thin slice/plan/
  implement/verify set rather than a fire-and-forget edit — that artifact trail is the point.
- **Ported tests** — router-resolution + artifact-production tests fail loudly on the rename; budget
  time to move coverage to `/wf design` rather than drop it.
