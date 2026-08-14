---
description: Implement one selected planned slice. Writes per-slice implementation record with cross-links to slice definition and plan.
argument-hint: <slug> [slice-slug|reviews]
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a MANDATORY gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `$wf implement`, **stage 5 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → `5·implement` → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | One of: (a) standard mode — `02-shape.md` + `04-plan-<slice-slug>.md` (or `04-plan.md` for single-scope); (b) compressed mode (`workflow-type: quick`) — `01-quick.md`; (c) forwarded mode (`workflow-type: rca`) — `02-shape.md` (synthesized) + optional `04-plan.md`; (d) change-mode (`workflow-type: fix` / `hotfix` / `refactor`) — the compressed-lifecycle's **un-suffixed single-slice** standard files (`04-plan.md`). `update-deps` self-authors its own `05`/`06` and redirects here; `docs` uses its own implement command. |
| Conditional inputs (mandatory when present) | `02b-design.md` (design brief — register, color strategy, anti-goals MUST be honored), `02c-craft.md` (visual contract — mock fidelity inventory items MUST be honored as acceptance criteria), `04b-instrument.md` (instrumentation signals MUST be added to the code), `04c-experiment.md` (feature flag/cohort wiring MUST be added), `05c-benchmark.md` (baseline — implementation MUST NOT regress), `augmentations:` list in `00-index.md` (every entry MUST be consumed per type — see Step 0.7) |
| Produces | `05-implement-<slice-slug>.md` + updates `05-implement.md` master |
| Next | `$wf verify <slug> <slice-slug>` (default) |
| Skip-to | `$wf review <slug> <slice-slug>` if verification is trivial |
| Special | `$wf implement <slug> reviews` — fix review findings in parallel |

> **Auto second opinion (objective triggers).** **Auto-invoke** `$consult codex <question>` (pinning `codex`/`claude` keeps it free) when ANY of: (a) **reviews mode** is about to merge a sub-agent's fix touching auth, data integrity, money, or concurrency; (b) **plan drift is significant** — the adapted approach departs from a named plan step; (c) this run wrote a new suppression (`sdlc-debt:` marker) to get the build green. Routine implementation with none of these: skip. The user may invoke it explicitly with any provider.

> **Read the source before you code against it.** When you're about to write code
> that calls a dependency/framework/SDK whose exact API, types, or edge-case behavior
> matter — and the answer isn't already in the repo — invoke the `study-sources` skill
> to read its **installed source** (`node_modules`, `~/.m2`, the Go/Rust/NuGet caches,
> Android SDK `sources/`, …) rather than guessing signatures. Match the version the
> project resolved. Reads land in gitignored `.scratch/` and never enter the change.

> **A limitation claim carries its evidence.** Any code comment or deviation asserting a
> dependency capability DOES NOT EXIST — not exposed, removed, broke, "the API can't do
> X" — must carry evidence at the site or in the record: a `study-sources` read of the
> **installed** source (name the `node_modules/` or vendored path actually opened), a
> failing minimal repro, or an upstream issue link.
> 1. **Comments are hypotheses.** An existing in-repo comment claiming a limitation is
>    NEVER sufficient authority to replicate its workaround in new code — re-verify the
>    premise first (one `study-sources` read; the skill exists for exactly this).
> 2. **Recalled API shapes never justify `as any` / `@ts-ignore` alone.** The suppression
>    must cite the type actually read from the installed package, or the mismatch repro —
>    a remembered signature is not authority.
> A warn-only hook (`limitationClaimLint`) flags an uncited limitation comment at write
> time; the citation markers it looks for are `source:` / `node_modules/` / `repro:` /
> `issue:` / a URL within ±3 lines.

# CRITICAL — execution discipline
You are a **workflow orchestrator** running the implementation stage.
- Read prior workflow artifacts (index, shape, slice, plan) FIRST — do not skip.
- Do NOT verify, review, or ship — those are later stages.
- Implement **only** the selected slice as described in the plan. Do not broaden scope.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.
- Your only output is the code changes, the workflow artifacts, and the compact chat summary defined below.
- If you catch yourself about to skip ahead to verification or review, STOP and return to the next unfinished step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice-slug**. If no slug, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`, **`workflow-type`**.
3. **Check for reviews mode:** If the second argument is literally `reviews` → **review-fix** invocation. See "Reviews Mode" below. Skip the rest of Step 0 and go directly to that section.
4. **Determine workflow source mode** from `workflow-type`:
   - `workflow-type: quick` → **compressed mode**. Source artifact is `01-quick.md` (brief, shape, design, slice, and plan in one document). No `02-shape.md` / `03-slice-*.md` / `04-plan-*.md` files exist; do not require them.
   - `workflow-type: rca` → **forwarded mode**. The rich context lives in `01-rca.md`; a synthesized `02-shape.md` exists (the RCA writes it as a forwarding contract). Planning may have been added via `$wf plan`, or this may be a quick-style continuation.
   - `workflow-type: investigate` → **terminal analysis — not built in place.** `$wf intake investigate` produces option sketches and **no `02-shape.md`** (and no plan); a chosen option is re-intaked via `$wf intake <option>` as a NEW workflow that does its own shape pass. A bare `investigate` slug therefore has no plan, so the plan-prerequisite in Step 0.6 already STOPs; if you reach here, direct the user to `$wf intake <option>`.
   - `workflow-type: fix` / `hotfix` / `refactor` (legacy `rf`) → **change-mode (compressed standard lifecycle).** Authored as STANDARD, single-slice, **un-suffixed** files: `01-<mode>.md` (`type: intake`; `01-fix.md` / `01-hotfix.md` / `01-refactor.md`), `02-shape.md`, `03-slice.md` (`type: slice-index`, one slice), `04-plan.md`. Exactly **one** slice; `selected-slice` on the index is its slug. Implement as **standard mode** with one substitution: every per-slice file is **un-suffixed** — read `04-plan.md` and write `05-implement.md` (NOT the `-<slice-slug>`-suffixed files of multi-slice standard mode). Wherever a step below names a suffixed file, use the un-suffixed name. (hotfix's `07-review` defaults to `security`; refactor's to `refactor-safety`. **refactor**: one atomic green step per plan step — never combine; commit per step; if verify fails, fix the refactor, not the test.)
   - `workflow-type: update-deps` → **self-managed change-mode.** Self-authors `05-implement.md` / `06-verify.md` inside its own flow, then routes to `$wf review`. Should NOT use `$wf implement`. STOP and direct the user back to `$wf intake update-deps <slug>`.
   - `workflow-type: docs` → **alternate workflow** with its own implement stage. STOP and direct the user to that workflow's implement command.
   - `workflow-type: feature` (default for `$wf intake`) or unset → **standard mode**. Use the canonical pipeline files.
5. **Resolve the slice-slug**: If passed, use it. Otherwise use `selected-slice-or-focus` from the index. In compressed mode, slice-slug may be empty — `01-fix.md` (or legacy `01-quick.md` for pre-v9.18.0 slugs) covers a single intentional change.
6. **Check prerequisites by mode:**
   - **Compressed mode**: `01-fix.md` must exist (or legacy `01-quick.md` for pre-v9.18.0 slugs — check both). If missing → STOP. "Run `$wf intake fix <slug>` first or use a different workflow type."
   - **Standard / forwarded / change-mode**: A plan must exist: either `04-plan-<slice-slug>.md` or `04-plan.md` (change-mode always uses un-suffixed). If missing → STOP. "Run `$wf plan <slug> <slice-slug>` first."
   - If the source plan/quick artifact shows `Status: Awaiting input` → STOP.
   - Check if `05-implement-<slice-slug>.md` (or `05-implement.md` in compressed mode) already exists → note the re-run in chat and proceed. [_additive-write.md](_additive-write.md) snapshots the prior revision and appends the `revisions:` ledger; no permission question is needed.
7. **Read the source context by mode:**
   - **Compressed mode**:
     - `01-quick.md` — single source for brief, shape, slice, and plan. Read end-to-end.
   - **Forwarded mode**:
     - `01-rca.md` — rich source artifact (read for context beyond the synthesized shape).
     - `02-shape.md` — synthesized shape forwarding contract.
     - `04-plan.md` (if `$wf plan` was run after the forward) — full plan.
   - **Standard mode**:
     - `03-slice-<slice-slug>.md` — slice definition with acceptance criteria
     - `04-plan-<slice-slug>.md` — implementation plan
     - `02-shape.md` — shaped spec for overall context
   - **Change-mode** (`fix` / `hotfix` / `refactor`): same as standard but **un-suffixed**, plus the lead:
     - `01-<mode>.md` (`type: intake`; `01-fix.md` / `01-hotfix.md` / `01-refactor.md`) — compressed brief + acceptance criteria (hotfix's lead also carries `## Diagnosis`; refactor's `02-shape.md` carries the API-surface baseline)
     - `03-slice.md` (`type: slice-index`) — the one-slice roster
     - `04-plan.md` — implementation plan · `02-shape.md` — shaped spec
   - All modes also read `po-answers.md` if it exists.
8. **Read augmentation context (optional — workflow may have any combination):**
   Read the `augmentations:` list in `00-index.md` if present. For each entry, read the artifact and apply the type-specific behavior:

   | Type | Artifact | What `$wf implement` must do |
   |---|---|---|
   | `design-<sub>` (e.g., `design-harden`, `design-colorize`) | `design-notes/<sub>-<timestamp>.md` | Design code was already applied in a prior pass. Do NOT undo the documented changes. |
   | `design-audit` | `07-design-audit.md` | Resolve any "critical" or "high" findings flagged. |
   | `design-critique` | `07-design-critique.md` | Apply critique recommendations where they conflict with default choices. |
   | `instrument` | `04b-instrument.md` | **Implement the instrumentation signals defined in the plan.** Each dark-path entry has a designed signal — add the log/metric/trace call to the code being implemented. Use the framework named in the artifact. |
   | `experiment` | `04c-experiment.md` | **Wire up the experiment.** Add the feature flag, cohort split logic, and metric instrumentation defined in the artifact. The implementation must include both the variant and control paths. |
   | `benchmark` (status: baseline) | `05c-benchmark.md` | Note baseline numbers — implementation must not regress. `verify` re-runs the compare (loads `augment/benchmark.md` in compare mode). Benchmark is a shape-decided augmentation authored by `plan`, not a standalone skill. |

   **Read design planning artifacts** (separate from augmentations):
   - `02b-design.md` — design brief if present. Carry forward register (brand/product), color strategy, and anti-goals.
   - **Baseline design canon (when `stack.ui ≠ ∅` and neither `02b`/`02c` exists).** Read `design/_design-context.md` for the register, shared design laws, absolute bans, and the motion/interface-detail summary — the design floor for any UI code. When code touches motion, interface detail, or typography, also load the specific home (`animate.md` / `polish.md` / `typeset.md`). `_design-context.md`'s preflight/image/mutation sections govern `$wf design`, not implement — skip those.
   - **Recommended references** (whenever `02b-design.md` OR `02c-craft.md` is present): build the reference set as the **union** of `recommended-references:` in `02b-design.md`'s frontmatter AND `references-loaded:` in `02c-craft.md`'s frontmatter. Normalize each entry by stripping a trailing `.md` before de-duplicating, then read `design/<name>.md` for each unique name. The union is load-bearing: references craft introduced live only in `02c`, so reading `02b` alone silently drops them. Treat loaded references as **read-only judgment context** — they disambiguate the visual contract but do NOT expand scope (do not implement features from the references that are not in the contract). If an entry doesn't resolve to an existing file, log a one-line warning and continue. If neither file declares any reference field, skip silently.
   - `02c-craft.md` — **visual contract. Mandatory when present: if the file exists you MUST read it.** The `## Mock fidelity inventory` items are **additional acceptance criteria** for this implementation — every inventory item must be honored in code. The `## Implementation contract` section names specific token choices, component decisions, and motion specs to follow.
   - **Applying design transforms (when `stack.ui ≠ ∅`).** When this implement pass is the implement step of a `$wf design` transform (dispatcher drives slice→plan→**implement**→verify), `implement` *applies* the design: read the transform's playbook from `design/<name>.md`, apply it during the build, then **register it as a `design-<sub>` augmentation** in `00-index.md` and write `design-notes/<sub>-<timestamp>.md` (contract in `design.md` Step 5). A transform may create the surface or modify existing implementation. Gate: if `stack.ui` is empty, skip.
9. **Read sibling implementations:** Check for any existing `05-implement-<other-slice>.md` files to avoid duplicating work or creating conflicts.
10. **Carry forward** `open-questions` from the index.
11. **Branch check (MANDATORY if `branch-strategy: dedicated`):**
   - Read `branch-strategy`, `branch`, and `base-branch` from `00-index.md` frontmatter.
   - If `dedicated`: run `git branch --show-current`. If not on the workflow branch:
     - Branch missing → `git checkout -b <branch>` from `<base-branch>`.
     - Branch exists → `git checkout <branch>`.
     - Confirm correct branch before proceeding.
   - If `shared` → commits go to the current branch (do not create or switch).
   - If `none` → skip all branch management.

# Parallel research
Before implementing, launch parallel sub-agents to verify the plan is still accurate. Skip for trivial single-file changes.

### Explore sub-agent 1 — Pre-Implementation Codebase Verification

Prompt with ALL of the following. Agent must report findings for each section:

**Plan drift detection:**
- For each file in `04-plan-<slice-slug>.md` → `## Likely Files / Areas to Touch`, read the current version and compare against plan assumptions
- Check `git log --oneline --since="<plan-created-at>"` on each affected file for changes since planning
- If sibling slices were implemented since planning, read their `05-implement-<other>.md` to understand what changed
- Flag any file that has moved, been renamed, deleted, or significantly refactored since planning

**Current state of the implementation target:**
- Read each file to be modified. Report: line count, key functions/classes, any TODO/FIXME/HACK in the affected area
- Check for merge conflicts or uncommitted changes (`git status`, `git diff` on those paths)
- Verify imports, types, and interfaces the plan depends on still exist with the same signatures

**Convention verification:**
- Read 2–3 recently modified files in the same module/directory to confirm coding conventions (naming, error handling, logging) haven't changed
- Check for new linting rules, config changes, or dependency updates that affect the implementation approach

### Explore sub-agent 2 — Dependency & API Freshness (only if external dependencies are involved)

Launch ONLY if the plan involves external APIs, third-party libraries, or cross-service communication. Prompt with:

**Dependency state:**
- Check if any dependency versions in the manifest changed since planning
- Web search for breaking changes, deprecations, or security advisories since the plan was written
- Verify API endpoints, SDK methods, or library functions the plan references still exist with the same signatures

**Cross-service state:**
- If the slice communicates with another service (API, queue, database), check that service's current schema/contract hasn't changed
- Check for new environment variables, config keys, or feature flags that affect the integration

Merge findings. If the codebase has diverged significantly, note deviations in the implementation record and adapt plan steps before implementing.

# Purpose
Implement one selected planned slice with the smallest coherent diff that fits the repo and current best practices. Write a per-slice implementation record with cross-links.

# Build discipline — climb the ladder before writing each step
Shape settled *what* to build and plan settled *which strategy* (build-avoidance ladder, rungs 1–4). Your job: **fewest lines that satisfy the plan and acceptance criteria** — minimal because sufficient, not golfed. Before writing each plan step's code:

- **Honor the plan's ladder decisions.** If the plan landed a capability on rung 1/2/3 (stdlib, native-platform, reuse), do not reintroduce a dependency or hand-roll it. If the plan says "native `<input type="date">`, no library," keep it that way.
- **Climb once more at the code level.** Prefer a stdlib/native call over a hand-rolled helper, a direct call over a wrapper, a literal over a config knob, one line over a block, deletion over addition. Do **not** introduce an abstraction the plan did not ask for — an interface, factory, strategy, generic, or options-object with a single implementation or call site. This restraint is about *code structure only* — never trim an acceptance criterion; shape and plan own what exists.

**Lazy ≠ negligent — NON-NEGOTIABLE, never trimmed for brevity:** trust-boundary input validation, error handling that prevents data loss, security, accessibility, real-hardware calibration, and anything an acceptance criterion requires. Minimal code missing a safety check is *unfinished*, not lazy — review/verify gates bounce it as a BLOCKER, so the shortcut only defers rework. Non-trivial logic leaves its verification behind; trivial one-liners do not.

**Mark deliberate shortcuts.** When you take an intentional simplification with a known ceiling (global lock, O(n²) scan, naive heuristic, hard-coded value), leave a one-line `sdlc-debt:` comment at the site naming the ceiling and upgrade path, and record it in `## Anything Deferred` (deferral) or `## Known Risks / Caveats` (ceiling is live in shipped code). The marker keeps the shortcut visible and harvestable by `$wf simplify codebase`.

**Every new type/lint suppression is debt — mark it.** Any suppression you introduce — `as any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, or a language equivalent (`# type: ignore`, `@Suppress`, `#[allow(...)]`, `// nolint`) — must carry an `sdlc-debt:` marker with a reason at the site. This adds no new lifecycle: the existing debt machinery inherits the class — verify validates the marker, retro reconciles it, `$wf simplify` sweeps it. A warn-only hook (`suppressionDebtLint`) flags an unmarked suppression at write time; it looks for `sdlc-debt:` within ±2 lines.

**A build decision that touches a `carried` intent-risk is intent-bearing — never auto-resolve it.** If a decision during the build would resolve an intent-risk (RIM) that `00-index.md`'s `intent-risks` still marks `status: carried` (one shape could not settle and deferred to a named later stage), it is by definition intent-bearing: ask the PO (human-gated run), never settle it by an autonomous policy. On an autonomous run it is a **stop condition**, not an assumption to fill. The carried-RIM case is one instance of the general boundary in [_decision-classes.md](_decision-classes.md) — apply that taxonomy to classify every autonomous-vs-ask fork. A recorded autonomous decision carries a mandatory `class: implementation-detail` stamp; an autonomous record may NEVER carry `class: intent-bearing` (writing one is the tell that the policy overstepped).

**Build for verifiability — the planned verification seams are part of *done*.** The plan's `## Verification Strategy` names what must be built to make each user-observable AC observable: a seeded fixture, a deterministic clock, a `data-testid` / accessibility id, an emulator or test config, an exported test hook. Build those seams as part of this slice. A seam the plan named but implement skipped becomes a verify-time wall that gets papered over with a deferral or a static-reasoning `pass`. Record each seam built in `## Verification Seams Built`; if you could not build one the plan named, say so there and in `## Deviations from Plan`.

# Design build discipline (when `stack.ui ≠ ∅` and a contract or design canon applies)
When this slice builds UI — whether against a `02c-craft.md` visual contract, a design transform playbook (Step 0.8), or just the baseline design canon — the build is held to the design floor in [design/_design-context.md](design/_design-context.md). Apply it; do not restate its rules.

**Implementation principles:**
- Use codebase design tokens, not hard-coded values.
- Follow the existing component vocabulary (don't introduce a new button style if one exists).
- Every interactive component must have: default, hover, focus, active, disabled states.
- Loading states: skeletons not spinners for content areas.
- `@media (prefers-reduced-motion: reduce)` for all animations — but design for motion first.
- OKLCH for any new color values; never `#000` or `#fff`.
- If the deliverable is a **reusable component** (a design-system primitive or shared widget, not a one-off screen), apply [design/_component-craft.md](design/_component-craft.md) — DX-first API, excellent defaults, memorable naming, a touchable example.

**Absolute bans** are in `design/_design-context.md` → *Absolute bans*. Introducing one is a defect the review/verify gates bounce.

## Contract-check pass (mandatory when `02c-craft.md` was present)
After building against a visual contract, dispatch one **fresh-context check agent** before writing the implementation record — the blind pre-mortem pattern (`shape.md` Step 9), not a self-critique. Give the agent ONLY the contract inputs (`02c-craft.md`, `02b-design.md`, the relevant register reference) and the built surface; it has no memory of your build decisions to defend. Its charter: report every material departure from the mock-fidelity inventory, the anti-goals, and the register rules, each with file:line evidence. Apply fixes for the material defects it reports. Record what the pass caught — and the file:line each fix landed at — in `## Visual Contract Honored`.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave canonical results only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) first. All machine-readable state goes in frontmatter; the markdown body is human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, get the current UTC time per [_timestamp.md](_timestamp.md). Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Ask the user directly in chat** for multiple-choice PO questions (structured decisions, confirmations) as a short numbered list; use freeform chat for open-ended questions. Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.
- **Conditional inputs are mandatory when present.** If a file in this command's *Conditional inputs* row exists on disk, read and honor it — silent omission is a contract violation.

# Chat return contract
After writing files, return per [_chat-return.md](_chat-return.md) — narrative lead in the artifact's `## The Implementation` story voice, then this receipt:
- `slug: <slug>`
- `wrote: <paths>` (per-slice file + master update)
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. **Ensure correct branch** (branch check must have been completed in Step 0.11).
2. **Track the stage's units in a work-tracking checklist.** One item per plan step from `04-plan-<slice-slug>.md` → `## Step-by-Step Plan`, plus the artifact write and the atomic commit. Keep statuses truthful as you work; record a blocked step as blocked with its reason.
3. Re-check the current code before editing (Explore sub-agents if needed). Pay attention to files sibling slice implementations may have changed.
4. If the implementation depends on evolving external APIs, libraries, or patterns, run a freshness pass before editing.
5. **Implement the selected slice**, step by step with your native file-editing tools, keeping the checklist truthful. If blocked or failed: note the blocker and use the error handling guidance below.
6. Update tests, docs, types, configs, or migrations only where required for this slice.
7. Summarize the exact change set.
8. **Write `05-implement-<slice-slug>.md`** (per-slice file, see template below). Ground the record per [_grounded-progress.md](_grounded-progress.md): every `## Verification Seams Built` and `## Visual Contract Honored` entry cites a file:line you **re-opened after editing**, not memory of your own edits.
9. **Write/update `05-implement.md`** (master index, see template below).
10. **Update cross-links** in `03-slice-<slice-slug>.md` and `04-plan-<slice-slug>.md` to point to the new implementation file.
11. **Evaluate adaptive routing** and write ALL viable options into `## Recommended Next Stage`.
12. Update `00-index.md` and add files to `workflow-files`. **Then write the slice's status back to the roster** — `03-slice.md`'s `slices:` entry for `<slice-slug>` gets `status: in-progress` (or `status: complete` when this implement record itself is `status: complete` and the slice needs no further build pass). Set only this slice's entry; do not touch siblings and do not renumber (same discipline as `close.md` Step S3, which is the only other writer of this field).

    **Why this step exists.** `03-slice.md` is written at `defined` by `slice`/`probe`/`simplify` and, before this rule, nothing but a skip ever moved it. Handoff's aggregate mode collects only `complete`/`in-progress` entries, so a fully built, verified and reviewed slug reported **"no implemented slices"** and was skipped — real work made invisible by one un-updated bookkeeping field. The roster is the index handoff trusts; the stage that changes the truth is the stage that records it.

    **Change-modes** (`fix` / `hotfix` / `refactor` and any single-scope workflow) write an un-suffixed one-slice `03-slice.md` — the same rule applies to its single entry. A workflow with no `03-slice.md` at all (a forwarded `rca`) has no roster to update; skip silently.
13. **Atomic commit (if `branch-strategy` is `dedicated` or `shared`):**
    - **Stage by explicit path, classified** (the same discipline as `ship.md` Step 1.1): (a) code files this slice changed — stage each by path; (b) workflow artifacts under `.ai/workflows/<slug>/` — stage by path; (c) any OTHER dirty path is NOT yours — fail closed and ask before staging it. `git add -A`, `git add .`, and any pathless `git add` are **forbidden**: concurrent sessions leave unrelated work in this tree, and a sweep commits it.
    - Commit: `feat(<slug>): implement <slice-slug>` — include a brief summary of what the slice does.
    - Do NOT push. Pushing happens at handoff.
    - Record the commit SHA in the per-slice frontmatter (`commit-sha` field).
    - If `branch-strategy` is `none`, skip this step.

# Adaptive routing — evaluate what's actually next
After completing, evaluate and present ALL viable options:

**Option A (default): Verify** → `$wf verify <slug> <slice-slug>`
Use when: The implementation touches testable behavior.
**Compact recommended** — tell the user: "Consider compacting the session before `$wf verify` — workflow state lives in artifact files on disk and the SessionStart hook re-reads it after compaction."

**Option B: Skip to Review** → `$wf review <slug> <slice-slug>`
Use when: Purely declarative change with no testable behavior.
**Compact recommended** — same reason as Option A.

**Option C: Revisit Plan** → `$wf plan <slug> <slice-slug>`
Use when: The plan was wrong — missed files, wrong assumptions.

**Option D: Blocked** → explain what's blocking.

# Reviews Mode — fix review findings
Triggered when: second argument is literally `reviews`. Example: `$wf implement my-slug reviews`

Reads findings from `07-review-<slice-slug>.md`, extracts all BLOCKER and HIGH findings (and optionally MED if the user requests), then fixes them **in parallel** using sub-agents — the findings are independent by construction; only a patch-overlap conflict forces the conflicting pair back to serial.

Do this in order for reviews mode:
1. **Resolve the slice-slug.** If a slice-slug was passed as a third argument (e.g., `$wf implement my-slug auth-flow reviews`), use it. Otherwise use `selected-slice-or-focus` from `00-index.md`. If neither is set, ask the user.
2. **Read `07-review-<slice-slug>.md`** and all `07-review-<slice-slug>-<command>.md` for that slice. Other slices' review files are out of scope.
3. **Extract the findings list.** Build an ordered list sorted by severity (BLOCKER first, then HIGH, then MED if requested). Each finding has: ID, severity, file:line, issue description, suggested fix.
4. **Present the findings list** to the user before starting:
   ```
   ## Review Findings to Fix ({N} total)
   1. [{ID}] {SEVERITY} — {title} @ {file}:{line}
   2. [{ID}] {SEVERITY} — {title} @ {file}:{line}
   ...
   Starting parallel fixes...
   ```
5. **Dispatch ALL finding fixes in parallel, one sub-agent per finding** (one batch of dispatches) when their target files are disjoint; findings touching the same files run serially against each other.
   a. For each sub-agent, use this prompt:
      ```
      Fix the following review finding in the codebase:

      Finding ID: {ID}
      Severity: {severity}
      Location: {file}:{line-range}
      Issue: {issue description}
      Suggested Fix: {fix suggestion}

      Read the file(s) at the specified location. Apply the minimal fix that resolves the issue without introducing new problems. Do NOT change anything beyond what is needed for this finding.

      After fixing, verify:
      - The fix addresses the specific issue described
      - No new lint/type/test failures introduced
      - Surrounding code still makes sense

      Return a brief summary of what you changed and whether the fix is confirmed correct.
      ```
   b. **As each sub-agent completes, verify its fix (the merge gate):** read the changed file(s), confirm the fix addresses the finding, and check for regressions.
   c. **On a patch-overlap conflict** (two fixes touch the same lines), fall back to serial for the conflicting pair only: keep one, re-dispatch the other against the patched state.
   d. If a fix failed or was partial, record `COULD NOT FIX: <reason>` for it.

6. **After all findings are processed:**
   a. Write/update `05-implement-<slice-slug>.md` with a `## Review Fixes Applied` section listing all findings and resolution status.
   b. Update `05-implement.md` master index.
   c. **Update `07-review-<slice-slug>.md` (accumulating ledger — edit in place, do not overwrite):** Set each finding's `status` (`fixed` / `could-not-fix`) + `fixed-at` in `## All Findings`, `## Findings (Detailed)`, and the sibling `.yaml`. Update its row in the `## Fix Status` ledger (one row per finding, keyed by ID — update in place, never start a new round table):
      ```
      ## Fix Status
      | ID | Sev | Source | Status | Fixed-at | Commit | Notes |
      |----|-----|--------|--------|----------|--------|-------|
      | {ID} | {sev} | {command} | fixed / could-not-fix | {fixed-at} | {SHA or —} | {notes} |
      ```
   d. Update `00-index.md`.
   e. **Atomic commit (if `branch-strategy` is `dedicated` or `shared`):** stage by explicit path, classified exactly as mainline Step 13 (slice code by path, workflow artifacts by path, unknown dirty paths fail closed; `git add -A` / pathless `git add` forbidden). Commit: `fix(<slug>): review fixes for <slice-slug>`. Record commit SHA. Do NOT push. If `branch-strategy` is `none`, skip the commit.

7. **Evaluate adaptive routing:**

**Option A (default): Re-verify** → `$wf verify <slug> <slice-slug>`
Use when: Fixes were applied.
**Compact recommended** — review fix context is noise for re-verification.

**Option B: Re-review** → `$wf review <slug> <slice-slug>`
Use when: Some findings could not be fixed and need re-assessment.
**Compact recommended** — fresh review needs clean context.

**Option C: Handoff** → `$wf handoff <slug> <slice-slug>`
Use when: All findings were fixed and the change was already verified.

---

Write `05-implement.md` (master index):

```yaml
---
schema: sdlc/v1
type: implement-index
slug: <slug>
status: in-progress
stage-number: 5
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
slices-implemented: <N>
slices-total: <N>
metric-total-files-changed: <N>
metric-total-lines-added: <N>
metric-total-lines-removed: <N>
tags: []
refs:
  index: 00-index.md
  plan-index: 04-plan.md
next-command: wf-verify
next-invocation: "$wf verify <slug> <slice-slug>"
---
```

# Implement Index

## Cross-Slice Integration Notes
- ...

## Recommended Next Stage

---

Write `05-implement-<slice-slug>.md` (per-slice implementation record):

```yaml
---
schema: sdlc/v1
type: implement
slug: <slug>
slice-slug: <slice-slug>
status: complete
stage-number: 5
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-changed: <N>
metric-lines-added: <N>
metric-lines-removed: <N>
metric-deviations-from-plan: <N>
metric-review-fixes-applied: 0
commit-sha: "<sha or empty if branch-strategy is none>"
tags: []
refs:
  index: 00-index.md
  implement-index: 05-implement.md
  slice-def: 03-slice-<slice-slug>.md
  plan: 04-plan-<slice-slug>.md
  siblings: [05-implement-<other>.md, ...]
  verify: 06-verify-<slice-slug>.md
next-command: wf-verify
next-invocation: "$wf verify <slug> <slice-slug>"
---
```

# Implement: <slice-name>

## The Implementation
<!-- STORY SECTION — first, and self-sufficient. MUST follow `_story-arc.md`: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. Language MUST follow `_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs. -->

## Summary of Changes
- ...

## Files Changed
- path: what changed and why

## Shared Files (also touched by sibling slices)
- ...

## Notes on Design Choices
- ...

## Verification Seams Built
<!-- Seams the plan's `## Verification Strategy` named to make each user-observable AC observable: seeded fixtures, deterministic clocks, `data-testid` / a11y ids, emulator / test config, exported test hooks, authorized tool install. `verify` relies on these; list each. If none needed: "None needed — [reason]." -->
- <AC id / text> → <seam built> at <file:line> (enables <tool / method> to observe it)

## Visual Contract Honored (only if `02c-craft.md` was present)
For each item in `02c-craft.md` → `## Mock fidelity inventory`, confirm honored or note deviation:
- <inventory item> — honored at <file:line> | deviation: <what differs and why>
- ...

## Deviations from Plan
<!-- A deviation of kind "planned API not found" (the plan assumed a capability the
     installed source does not expose) MUST NAME the source file read that established
     the absence — the `node_modules/` or vendored path, the failing repro, or the
     upstream issue. A bare "the API didn't work" is not a recorded deviation. -->
- ...

## Anything Deferred
<!-- Capabilities deferred by shape's Round 5 restraint or the plan's ladder, plus any `sdlc-debt:` shortcut — each with its ceiling and upgrade path. -->
- ...

## Known Risks / Caveats
<!-- Any `sdlc-debt:` shortcut whose ceiling is live in shipped code (global lock, O(n²) scan, naive heuristic, hard-coded value). -->
- ...

## Freshness Research

## Recommended Next Stage
- **Option A (default):** `$wf verify <slug> <slice-slug>` — [reason]
- **Option B:** `$wf review <slug> <slice-slug>` — skip verify [reason, if applicable]

---

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell. Follow [_fragment-authoring.md](_fragment-authoring.md) **Step F2** for rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
