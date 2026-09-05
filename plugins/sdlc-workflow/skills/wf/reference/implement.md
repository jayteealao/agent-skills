---
description: Implement one selected planned slice. Writes per-slice implementation record with cross-links to slice definition and plan.
argument-hint: <slug> [slice-slug|reviews]
---

Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output this operation produces.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf implement`, **stage 5 of 10**: 1·intake → 2·shape → 3·slice → 4·plan → `5·implement` → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro.

| | Detail |
|---|---|
| Requires | One of: (a) standard mode — `02-shape.md` + `04-plan-<slice-slug>.md` (or `04-plan.md` for single-scope); (b) compressed mode (`workflow-type: quick`) — `01-quick.md`; (c) forwarded mode (`workflow-type: rca`) — `02-shape.md` (synthesized) + optional `04-plan.md`; (d) change-mode (`workflow-type: fix` / `hotfix` / `refactor`) — the compressed lifecycle's **un-suffixed single-slice** standard files (`04-plan.md`). `update-deps` self-authors its own `05`/`06` and redirects here; `docs` uses its own implement command. |
| Conditional inputs (mandatory when present) | `02b-design.md` (design brief: honor register, color strategy, anti-goals), `02c-craft.md` (visual contract: mock fidelity inventory items are acceptance criteria), `04b-instrument.md` (add the instrumentation signals to the code), `04c-experiment.md` (add the feature-flag and cohort wiring), `05c-benchmark.md` (baseline the implementation may not regress), `augmentations:` list in `00-index.md` (consume every entry per type, Step 0.8). |
| Produces | `05-implement-<slice-slug>.md` + updates `05-implement.md` master. Schemas: [implement/_artifact.md](implement/_artifact.md). |
| Next | `/wf verify <slug> <slice-slug>` (default); skip to `/wf review <slug> <slice-slug>` if verification is trivial. |
| Special | `/wf implement <slug> reviews` — fix the findings in `07-review-<slice-slug>.md` in parallel, per [implement/_reviews-mode.md](implement/_reviews-mode.md). Example: `/wf implement my-slug reviews`. |

**Auto second opinion (objective triggers).** **Auto-invoke** `/consult codex <question>` (pinning `codex`/`claude` keeps it free) when ANY of: (a) **reviews mode** is about to merge a sub-agent's fix touching auth, data integrity, money, or concurrency; (b) **plan drift is significant**: the adapted approach departs from a named plan step; (c) this run wrote a new suppression (`sdlc-debt:` marker) to get the build green. Routine implementation with none of these: skip. The user may invoke it explicitly with any provider.

**Read the source before you code against it.** When you are about to write code that calls a dependency, framework, or SDK whose exact API, types, or edge-case behavior matter, and the answer is not already in the repo, invoke the `study-sources` skill to read its **installed source** (`node_modules`, `~/.m2`, the Go/Rust/NuGet caches, Android SDK `sources/`, …) rather than guessing signatures. Match the version the project resolved. Reads land in gitignored `.scratch/` and never enter the change.

**A limitation claim carries its evidence.** Any code comment or deviation asserting a dependency capability does not exist (not exposed, removed, broke, "the API can't do X") carries evidence at the site or in the record: a `study-sources` read of the **installed** source (name the `node_modules/` or vendored path actually opened), a failing minimal repro, or an upstream issue link. Two corollaries:
1. **Comments are hypotheses.** An existing in-repo comment claiming a limitation is never sufficient authority to replicate its workaround in new code; re-verify the premise first (one `study-sources` read).
2. **Recalled API shapes never justify `as any` / `@ts-ignore` alone.** The suppression cites the type actually read from the installed package, or the mismatch repro; a remembered signature is not authority.
A warn-only hook (`limitationClaimLint`) flags an uncited limitation comment at write time; the citation markers it looks for are `source:` / `node_modules/` / `repro:` / `issue:` / a URL within ±3 lines.

# Role

You are a **workflow orchestrator** running the implementation stage.
- Read prior workflow artifacts (index, shape, slice, plan) first; do not skip them.
- Do not verify, review, or ship; those are later stages.
- Implement **only** the selected slice as described in the plan. Do not broaden scope.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.
- Your only output is the code changes, the workflow artifacts, and the compact chat summary defined below.
- If you catch yourself about to skip ahead to verification or review, STOP and return to the next unfinished step.

# Workflow rules

Apply [_workflow-rules.md](_workflow-rules.md). One implement-specific rule: **conditional inputs are mandatory when present.** If a file in this command's *Conditional inputs* row exists on disk, read and honor it; silent omission is a contract violation.

# Step 0 — Orient
1. **Resolve the slug** from `$ARGUMENTS` (first argument). The second argument, if present, is the **slice-slug**. If no slug, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`, **`workflow-type`**.
3. **Check for reviews mode.** If the second argument is literally `reviews`, this is a **review-fix** invocation: load [implement/_reviews-mode.md](implement/_reviews-mode.md), skip the rest of Step 0, and follow that file.
4. **Determine workflow source mode** from `workflow-type`:
   - `workflow-type: quick` → **compressed mode**. The source artifact is `01-quick.md` (brief, shape, design, slice, and plan in one document). No `02-shape.md` / `03-slice-*.md` / `04-plan-*.md` files exist; do not require them.
   - `workflow-type: rca` → **forwarded mode**. The rich context lives in `01-rca.md`; a synthesized `02-shape.md` exists (the RCA writes it as a forwarding contract). Planning may have been added via `/wf plan`, or this may be a quick-style continuation.
   - `workflow-type: investigate` → **terminal analysis, not built in place.** `/wf intake investigate` produces option sketches and **no `02-shape.md`** (and no plan); a chosen option is re-intaked via `/wf intake <option>` as a NEW workflow that does its own shape pass. A bare `investigate` slug has no plan, so the plan prerequisite in Step 0.6 already STOPs; if you reach here, direct the user to `/wf intake <option>`.
   - `workflow-type: fix` / `hotfix` / `refactor` (legacy `rf`) → **change-mode (compressed standard lifecycle).** Authored as STANDARD, single-slice, **un-suffixed** files: `01-<mode>.md` (`type: intake`; `01-fix.md` / `01-hotfix.md` / `01-refactor.md`), `02-shape.md`, `03-slice.md` (`type: slice-index`, one slice), `04-plan.md`. Exactly **one** slice; `selected-slice` on the index is its slug. Implement as **standard mode** with one substitution: every per-slice file is **un-suffixed**: read `04-plan.md` and write `05-implement.md`, not the `-<slice-slug>`-suffixed files of multi-slice standard mode. Wherever a step below names a suffixed file, use the un-suffixed name. hotfix's `07-review` defaults to `security`; refactor's to `refactor-safety`. **refactor**: one atomic green step per plan step, never combined; commit per step; if verify fails, fix the refactor, not the test.
   - `workflow-type: update-deps` → **self-managed change-mode.** It self-authors `05-implement.md` / `06-verify.md` inside its own flow, then routes to `/wf review`. STOP and direct the user back to `/wf intake update-deps <slug>`.
   - `workflow-type: docs` → **alternate workflow** with its own implement stage. STOP and direct the user to that workflow's implement command.
   - `workflow-type: feature` (default for `/wf intake`) or unset → **standard mode**. Use the canonical pipeline files.
5. **Resolve the slice-slug.** If passed, use it. Otherwise use `selected-slice-or-focus` from the index. In compressed mode the slice-slug may be empty: `01-fix.md` (or legacy `01-quick.md`) covers a single intentional change.
6. **Check prerequisites by mode:**
   - **Compressed mode**: `01-fix.md` must exist (or legacy `01-quick.md`; check both). If missing → STOP. "Run `/wf intake fix <slug>` first or use a different workflow type."
   - **Standard / forwarded / change-mode**: a plan must exist, either `04-plan-<slice-slug>.md` or `04-plan.md` (change-mode always uses un-suffixed). If missing → STOP. "Run `/wf plan <slug> <slice-slug>` first."
   - If the source plan/quick artifact shows `Status: Awaiting input` → STOP.
   - If `05-implement-<slice-slug>.md` (or `05-implement.md` in compressed mode) already exists, note the re-run in chat and proceed. [_additive-write.md](_additive-write.md) snapshots the prior revision and appends the `revisions:` ledger; no permission question is needed.
7. **Read the source context by mode.** Compressed: `01-quick.md` end-to-end. Forwarded: `01-rca.md` (rich context), `02-shape.md` (forwarding contract), `04-plan.md` if `/wf plan` ran after the forward. Standard: `03-slice-<slice-slug>.md` (acceptance criteria), `04-plan-<slice-slug>.md`, `02-shape.md`. Change-mode: the standard set **un-suffixed** plus the lead `01-<mode>.md` (`type: intake`; hotfix's lead also carries `## Diagnosis`; refactor's `02-shape.md` carries the API-surface baseline) and `03-slice.md` (`type: slice-index`). All modes also read `po-answers.md` if it exists.
8. **Read augmentation context** (optional; a workflow may have any combination). Read the `augmentations:` list in `00-index.md` if present. For each entry, read the artifact and apply the type-specific behavior:

   | Type | Artifact | What `/wf implement` does |
   |---|---|---|
   | `design-<sub>` (for example `design-harden`, `design-colorize`) | `design-notes/<sub>-<timestamp>.md` | Design code was already applied in a prior pass. Keep the documented changes. |
   | `design-audit` | `07-design-audit.md` | Resolve every "critical" or "high" finding flagged. |
   | `design-critique` | `07-design-critique.md` | Apply critique recommendations where they conflict with default choices. |
   | `instrument` | `04b-instrument.md` | **Implement the instrumentation signals defined in the plan.** Each dark-path entry has a designed signal; add the log/metric/trace call to the code being implemented, with the framework named in the artifact. |
   | `experiment` | `04c-experiment.md` | **Wire up the experiment.** Add the feature flag, cohort split logic, and metric instrumentation defined in the artifact, with both the variant and control paths. |
   | `benchmark` (status: baseline) | `05c-benchmark.md` | Note the baseline numbers; the implementation may not regress them. `verify` re-runs the compare (loads `augment/benchmark.md` in compare mode). |

   **Read design planning artifacts** (separate from augmentations):
   - `02b-design.md`, the design brief, if present. Carry forward register (brand/product), color strategy, and anti-goals.
   - **Baseline design canon** (when `stack.ui ≠ ∅` and neither `02b` nor `02c` exists): read `design/_design-context.md` for the register, shared design laws, absolute bans, and the motion/interface-detail summary, the design floor for any UI code. When code touches motion, interface detail, or typography, also load the specific home (`animate.md` / `polish.md` / `typeset.md`). Its preflight, image, and mutation sections govern `/wf design`, not implement; skip those.
   - **Recommended references** (whenever `02b-design.md` OR `02c-craft.md` is present): build the reference set as the **union** of `recommended-references:` in `02b-design.md` and `references-loaded:` in `02c-craft.md`. Strip a trailing `.md` before de-duplicating, then read `design/<name>.md` for each unique name. The union is load-bearing: references craft introduced live only in `02c`, so reading `02b` alone drops them. Loaded references are **read-only judgment context**: they disambiguate the visual contract but never expand scope. If an entry does not resolve to a file, log a one-line warning and continue. If neither file declares a reference field, skip silently.
   - `02c-craft.md`, the **visual contract**; if the file exists, read it. The `## Mock fidelity inventory` items are **additional acceptance criteria**; honor every item in code. The `## Implementation contract` names the token choices, component decisions, and motion specs to follow.
   - **Applying design transforms** (when `stack.ui ≠ ∅`): when this pass is the implement step of a `/wf design` transform (dispatcher drives slice→plan→**implement**→verify), read the transform's playbook from `design/<name>.md`, apply it during the build, then **register it as a `design-<sub>` augmentation** in `00-index.md` and write `design-notes/<sub>-<timestamp>.md` (contract in `design.md` Step 5). If `stack.ui` is empty, skip.
9. **Read sibling implementations.** Check for existing `05-implement-<other-slice>.md` files to avoid duplicating work or creating conflicts.
10. **Carry forward** `open-questions` from the index.
11. **Branch check** (required if `branch-strategy: dedicated`). Read `branch-strategy`, `branch`, and `base-branch` from `00-index.md`. If `dedicated`: run `git branch --show-current`; when not on the workflow branch, create it with `git checkout -b <branch>` from `<base-branch>` if missing or `git checkout <branch>` if it exists, and confirm the branch before proceeding. If `shared`, commits go to the current branch (do not create or switch). If `none`, skip all branch management.

# Parallel research

Before implementing, launch parallel sub-agents to verify the plan is still accurate. Skip for trivial single-file changes. The two charters (codebase verification; dependency and API freshness, only when external dependencies are involved) are in [implement/_research.md](implement/_research.md). Merge the findings; if the codebase diverged significantly, note deviations in the implementation record and adapt plan steps before implementing.

# Build discipline — climb the ladder before writing each step

Shape settled *what* to build and plan settled *which strategy* (build-avoidance ladder, rungs 1–4). Your job: the **fewest lines that satisfy the plan and acceptance criteria**, minimal because sufficient, not golfed. Before writing each plan step's code:
- **Honor the plan's ladder decisions.** If the plan landed on rung 1/2/3 (stdlib, native platform, reuse), do not reintroduce a dependency or hand-roll it.
- **Climb once more at the code level.** Prefer a stdlib or native call over a hand-rolled helper, a direct call over a wrapper, a literal over a config knob, one line over a block, deletion over addition. Introduce no abstraction the plan did not ask for (an interface, factory, strategy, generic, or options object with a single implementation or call site). This restraint is about *code structure only*; never trim an acceptance criterion, because shape and plan own what exists.

**Lazy ≠ negligent. Never trimmed for brevity:** trust-boundary input validation, error handling that prevents data loss, security, accessibility, real-hardware calibration, and anything an acceptance criterion requires. Minimal code missing a safety check is *unfinished*, not lazy; the review and verify gates bounce it as a BLOCKER, so the shortcut only defers rework. Non-trivial logic leaves its verification behind; trivial one-liners do not.

**Mark deliberate shortcuts.** When you take an intentional simplification with a known ceiling (global lock, O(n²) scan, naive heuristic, hard-coded value), leave a one-line `sdlc-debt:` comment at the site naming the ceiling and upgrade path, and record it in `## Anything Deferred` (deferral) or `## Known Risks / Caveats` (ceiling live in shipped code). The marker keeps the shortcut visible and harvestable by `/wf simplify codebase`.

**Every new type or lint suppression is debt; mark it.** Any suppression you introduce (`as any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, or a language equivalent such as `# type: ignore`, `@Suppress`, `#[allow(...)]`, `// nolint`) carries an `sdlc-debt:` marker with a reason at the site. The existing debt machinery inherits the class: verify validates the marker, retro reconciles it, `/wf simplify` sweeps it. A warn-only hook (`suppressionDebtLint`) flags an unmarked suppression at write time; it looks for `sdlc-debt:` within ±2 lines.

**A build decision that touches a `carried` intent-risk is intent-bearing; never auto-resolve it.** If a decision during the build would resolve an intent-risk (RIM) that `00-index.md`'s `intent-risks` still marks `status: carried`, it is by definition intent-bearing: ask the PO on a human-gated run, and treat it as a **stop condition** on an autonomous run, not an assumption to fill. The carried-RIM case is one instance of the general boundary in [_decision-classes.md](_decision-classes.md); apply that taxonomy to classify every autonomous-vs-ask fork. A recorded autonomous decision carries a `class: implementation-detail` stamp; an autonomous record never carries `class: intent-bearing` (writing one is the tell that the policy overstepped).

**Build for verifiability; the planned verification seams are part of *done*.** The plan's `## Verification Strategy` names what makes each user-observable AC observable: a seeded fixture, a deterministic clock, a `data-testid` / accessibility id, an emulator or test config, an exported test hook. Build those seams as part of this slice. A seam the plan named but implement skipped becomes a verify-time wall that gets papered over with a deferral or a static-reasoning `pass`. Record each seam built in `## Verification Seams Built`; if you could not build one the plan named, say so there and in `## Deviations from Plan`.

# Design build discipline (when `stack.ui ≠ ∅` and a contract or design canon applies)

When this slice builds UI, the build is held to the design floor in [design/_design-context.md](design/_design-context.md). Apply it; do not restate its rules. Principles: use codebase design tokens, not hard-coded values; follow the existing component vocabulary (no new button style when one exists); every interactive component has default, hover, focus, active, and disabled states; skeletons, not spinners, for content areas; `@media (prefers-reduced-motion: reduce)` for all animations, designed motion-first; OKLCH for any new color value, never `#000` or `#fff`. If the deliverable is a **reusable component** (design-system primitive or shared widget, not a one-off screen), apply [design/_component-craft.md](design/_component-craft.md): DX-first API, excellent defaults, memorable naming, a touchable example. **Absolute bans** are in `design/_design-context.md` → *Absolute bans*; introducing one is a defect the review and verify gates bounce.

**Contract-check pass (when `02c-craft.md` was present).** After building against a visual contract, dispatch one **fresh-context check agent** before writing the implementation record: the blind pre-mortem pattern (`shape.md` Step 9), not a self-critique. Give the agent ONLY the contract inputs (`02c-craft.md`, `02b-design.md`, the relevant register reference) and the built surface; it has no memory of your build decisions to defend. Its charter: report every material departure from the mock-fidelity inventory, the anti-goals, and the register rules, each with file:line evidence. Fix the material defects it reports. Record what the pass caught, and the file:line each fix landed at, in `## Visual Contract Honored`.

# Chat return contract

After writing files, return per [_chat-return.md](_chat-return.md): a narrative lead in the artifact's `## The Implementation` voice, then this receipt:
- `slug: <slug>`
- `wrote: <paths>` (per-slice file + master update)
- `options:` (all viable next options per Adaptive routing)
- ≤3 short blocker bullets if needed

Do this in order:
1. **Ensure the correct branch** (the Step 0.11 branch check is complete).
2. **Track the stage's units in a work-tracking checklist.** One item per plan step from `04-plan-<slice-slug>.md` → `## Step-by-Step Plan`, plus the artifact write and the atomic commit. Keep statuses truthful as you work; record a blocked step as blocked with its reason.
3. Re-check the current code before editing (research sub-agents if needed), including files that sibling slice implementations may have changed.
4. If the implementation depends on evolving external APIs, libraries, or patterns, run a freshness pass before editing.
5. **Implement the selected slice**, step by step, keeping the checklist truthful.
6. Update tests, docs, types, configs, or migrations only where required for this slice.
7. Summarize the exact change set.
8. **Write `05-implement-<slice-slug>.md`** per [implement/_artifact.md](implement/_artifact.md). Ground the record per [_grounded-progress.md](_grounded-progress.md): every `## Verification Seams Built` and `## Visual Contract Honored` entry cites a file:line you **re-opened after editing**, not memory of your own edits.
9. **Write or update `05-implement.md`** (master index, same file).
10. **Update cross-links** in `03-slice-<slice-slug>.md` and `04-plan-<slice-slug>.md` to point to the new implementation file.
11. **Evaluate adaptive routing** and write ALL viable options into `## Recommended Next Stage`.
12. Update `00-index.md` and add files to `workflow-files`. **Then write the slice's status back to the roster**: `03-slice.md`'s `slices:` entry for `<slice-slug>` gets `status: in-progress` (or `status: complete` when this implement record itself is `status: complete` and the slice needs no further build pass). Set only this slice's entry; do not touch siblings and do not renumber (same discipline as `close.md` Step S3, the only other writer of this field). The roster is the index handoff trusts: before this rule, a fully built, verified, and reviewed slug reported "no implemented slices" because nothing but a skip ever moved the `defined` status. Change-modes (`fix` / `hotfix` / `refactor` and any single-scope workflow) write an un-suffixed one-slice `03-slice.md`; the same rule applies to its single entry. A workflow with no `03-slice.md` at all (a forwarded `rca`) has no roster to update; skip silently.
13. **Atomic commit (if `branch-strategy` is `dedicated` or `shared`).** **Stage by explicit path, classified** (the same discipline as `ship.md` Step 1.1): (a) code files this slice changed, each by path; (b) workflow artifacts under `.ai/workflows/<slug>/`, by path; (c) any OTHER dirty path is NOT yours: fail closed and ask before staging it. `git add -A`, `git add .`, and any pathless `git add` are **forbidden**: concurrent sessions leave unrelated work in this tree, and a sweep commits it. Commit `feat(<slug>): implement <slice-slug>` with a brief summary of what the slice does. No push; pushing happens at handoff. Record the commit SHA in the per-slice frontmatter (`commit-sha`). If `branch-strategy` is `none`, skip the commit.

# Adaptive routing

Present ALL viable options and write them into `## Recommended Next Stage`:
- **Option A (default): Verify** → `/wf verify <slug> <slice-slug>` when the implementation touches testable behavior. **Compact recommended**: tell the user "Consider compacting the session before `/wf verify`; workflow state lives in artifact files on disk and the SessionStart hook re-reads it after compaction."
- **Option B: Skip to Review** → `/wf review <slug> <slice-slug>` for a purely declarative change with no testable behavior. **Compact recommended**, same reason as Option A.
- **Option C: Revisit Plan** → `/wf plan <slug> <slice-slug>` when the plan was wrong: missed files, wrong assumptions.
- **Option D: Blocked** → explain what is blocking.
