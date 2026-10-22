# WF-SUBPROCEDURE-AUDIT-2026-10-22 — use, impact, and fit of the sub-procedure files

Status **BUILT W0–W5, not committed.** AQ1–AQ4 answered by the PO 2026-10-22 (section 8); the plan is section 10. Not done: the second transcript scan after a release. · Date **2026-10-22** · Plugin **v9.197.0 + c8da0287 (unreleased)** · Owner **jayte**
Origin: the PO, 2026-10-22: "Audit the use and impact and appropriateness of all the sub procedure files."

A sub-procedure file is a `_*.md` file under `skills/wf/reference/`. There are 112 of them, with 114,818 words. This audit measures how often agents read each file, then judges whether each file is loaded on the right condition, is the right size, and agrees with the code and with the other files.

## 1. Method

1. **Measured use.** A scan of every Claude Code transcript of the last 30 days (2026-09-22 to 2026-10-22): 4,809 JSONL files, 5.72 GB, 3,707 distinct agents in the consumer repos (SoccerManager, lynket-browser, Secbot, Lantern, Trails, Waypoint). The scan counts Read-tool reads, `cat`-like shell reads, and Grep calls on each file, and names the reader kind (a stage agent of a driver, the interactive session, or another sub-agent). The dev repos of this plugin are left out. Codex and pi transcripts are not in scope.
2. **Static review.** Three read-only passes read all 112 files in full, every loader (Requires rows and prose pointers), the drivers, and the tests that pin each file. Each claim about the code was checked against `scripts/`, `lib/`, `hooks/`, and the drivers.
3. **Spot checks.** I re-checked 10 of the strongest claims myself: the boundary prompt, the SubagentStart claim, the `_compressed-slice.md` paths, the web-vitals grade, the `block` mode, the `_phases.md` review-scope line, the adopt template keys, the `_packet.md` task link, the `edit.md` pointer, and the `/wf announce` name. All 10 hold.

Raw data: the scan scripts and tables are in the session scratchpad (`usage/report.md`); they are not part of the repo.

## 2. What the measurement shows

**Reads are concentrated.** In 30 days the Read tool loaded 3.3 M words of sub-procedure text (5.6 M as an upper bound with shell reads). The 25 most-read files carry 91 % of it. Three files carry 39.5 %:

| File | Words | Reads | Words loaded | Share | Main readers |
|---|---|---|---|---|---|
| `verify/_sub-agents.md` | 3,224 | 158 | 509 k | 15.4 % | verify agents |
| `runtime-adapters/_ladder.md` | 1,365 | 351 | 479 k | 14.5 % | plan 216, verify 162 |
| `verify/_deferrals.md` | 1,986 | 163 | 316 k | 9.6 % | verify agents |
| `design/_lane.md` | 1,218 | 216 | 260 k | 7.9 % | plan 216 |
| `verify/_artifact.md` | 1,337 | 164 | 214 k | 6.5 % | verify agents |
| `design/_design-context.md` | 1,699 | 91 | 155 k | 4.7 % | plan, implement |
| `campaign/_boundary.md` | 2,805 | 48 | 135 k | 4.1 % | campaign boundary agents |
| `review/_stage.md` | 4,338 | 38 | 133 k | 4.0 % | review agents |

**The stage agents of the drivers are the readers that matter.** Per agent, on average: plan reads 3.2 files (3,300 words), implement 2.3 (1,200), verify 4.5 (7,300), review 7.4 (11,100). Most other driver agents read none: 0 of 168 orient agents, 0 of 175 write-back agents, 13 of 1,050 refuters.

**The interactive session reads by shell.** The session touches the shared files mostly with `cat` (for example `_gate-question.md`: 10 Reads, 75 shell reads; `_host-invocation.md`: 31 and 100). So the shared top-level files cost the person's session, not the drivers.

**21 files had no read of any kind in 30 days,** and 7 more only a shell touch. Most are files of rare keys that load on their own condition (observability, docs, status advise and deep, adopt, simplify, the express and react adapters). Low use alone is no reason to delete them. Three of the 21 are new since yesterday (`implement/_steps.md`, `review/_triage.md`, `verify/_runtime-evidence.md`).

**Removed files were still read from old plugin caches:** `_story-arc.md` (397 reads), `_fragment-authoring.md` (114), and `_consult-triggers.md` (10), all after their removal. Consumers run the version that was installed when their session started.

**Yesterday's E3 change hit a real cost.** `verify/_deferrals.md` (9.6 %) became `mode:deferral`. But the static pass found the mode too narrow (section 4, F3).

## 3. Verdict summary

| Area | Files | Keep | Change |
|---|---|---|---|
| Shared top-level `_*.md` | 24 | 8 | 16 |
| Stage and campaign folders (campaign, yolo, design, review, verify, implement, handoff, ship, status, docs, runtime-adapters, probe, retro) | 45 | 19 | 26 |
| intake, augment, observability, ship-plan | 43 | 30 | 13 |
| **Total** | **112** | **57** | **55** |

"Change" is a fix (section 4), a load change (section 5), or both. One file should go: `design/_commands.md` has one loader and no test, and every row is stated elsewhere. Three files should fold into another: `review/_context.md` into `review/_stage.md`, `verify/_runtime-evidence.md` with sub-agent 3, and the three handoff-only shared files under `handoff/`. No file is unreachable: each one has a loader.

## 4. Fixes: stale or contradictory content

These are wrong today. Each one is small, and each one was verified against the code or a second file.

**Contradictions between files**

- **F1 — Web vitals grade.** `review/_context.md:28` makes an LCP > 2,500 ms or a CLS > 0.1 a `WARN`. `verify/_artifact.md:122` makes them HIGH, and review has no `WARN` severity (BLOCKER/HIGH/MED/LOW/NIT, `review/_stage.md:133`). Make review follow verify.
- **F2 — An intent-bearing gate in an autonomous run.** `_gate-question.md` rung 3 (lines 25–30) settles a gate by its default. `_decision-classes.md:237–239` says an intent-bearing decision is a STOP. Add the stop to rung 3.
- **F3 — The deferral mode is too narrow.** `mode:deferral` (`verify.md`) covers only a deferral that names this slice. The absorption stop (`verify/_deferrals.md:59`) and the `needed-by` escalation (`:83`) bind slices that have no deferral of their own. Make the mode "`00-index.md` has an open `runtime-evidence-deferrals` entry".
- **F4 — Review dimension effort.** `review/_stage.md:120` dispatches each dimension at medium effort. `_subagents.md:37–40` and `review.md:133` say low, with medium only for architecture and security.
- **F5 — PR triage skip.** `handoff/_pr-triage.md:3` says to skip the file when `branch-strategy` is not `dedicated`. `handoff.md:123` runs T5.0, T5.1, and T5.3 for `shared` in batch scope.
- **F6 — Park kinds.** The park-kind table in `campaign/_drive.md:54–65` and the one in `campaign/_waves.md:78–85` drifted: each lists a cause that the other does not.
- **F7 — The review fix prompt is not "identical".** `review/_dispatch.md:114` and `review/_stage.md:176` say the fix prompt is kept identical to `/wf implement reviews`. `implement/_reviews-mode.md:21–38` lacks four of its parts.
- **F8 — `_phases.md:95` tells the session to recommend `slug-wide`** when `/wf slice` asks. Since the B2 change, a campaign unit is not asked (`slice.md:97`, `STANDING_DEFAULTS`).

**Stale against the code**

- **F9 — `_host-invocation.md:137`** says a SubagentStart hook injects context on Claude Code. `hooks/hooks.json` has none; only Codex has one. **`:147`** says SessionStart re-reads the control files after a compaction; `session-start-orient.mjs` does nothing on `compact`.
- **F10 — `_requires.md:48`** marks `block` mode "(later)". Block mode is built and tested.
- **F11 — Wrong paths.** `_compressed-slice.md:3` names `reference/simplify.md` and `reference/task.md`; `intake/_packet.md:28` links `../task.md`. The files are `intake/simplify.md` and `intake/task.md`. A `task` packet points the agent at nothing.
- **F12 — `ship-plan/edit.md:52`** sends each edit to `init.md` (2,239 words) for blocks that moved to `init/_blocks.md`. **`init/_blocks.md:86,88`** name `/wf announce`, which is not a key (`/wf ship <slug> announce`).
- **F13 — `intake/adopt/_artifacts.md`** repeats `recommended-routes:` in four templates (lines 28–29, 54–55, 84–85, 113–114). js-yaml rejects a repeated key, so a copied template can fail to parse.
- **F14 — Driver section pointers.** `yolo.js` (6 places) and `campaign-wave.js` (2) cite verify § "Escape hatch", "Climb the constraint-resolution ladder", and "Attempt before declare". No "Escape hatch" heading exists; the other two are in `verify/_sub-agents.md:53` and `verify/_deferrals.md:9`.
- **F15 — `scripts/measure-artifacts.mjs` `STAGE_WANTS`** still wants `_story-arc.md` (removed) and still lists `verify/_deferrals.md` and `runtime-adapters.md` as wanted verify reads. Since yesterday these are conditional, so a correct skip now counts as a miss. This is a regression of c8da0287.
- **F16 — Smaller stale items:**
  - `campaign/_boundary.md:20` names an old worktree path, and its fallback bypasses the guarded command.
  - `campaign/_drive.md` "Boundary setup" lacks the fourth step that the driver now runs.
  - `campaign/_waves.md:5` lacks the wave-ready start of v9.197.0, and step 8 has no branch for `waiter-failed` or `waiter-cancelled`.
  - `campaign/_phases.md:44` cites a section that moved to `_order.md`.
  - `design/_output.md:3` cites design.md Steps 5 and 6, which do not exist.
  - `_fix-loop.md:135` names `review.md` for Step 4c, which is in `review/_stage.md`.
  - `_ste-procedural.md:82` still lists view fragments, which no stage writes since v9.187.0.
  - `_surface-defects.md:193` names three rubrics; five link the file.
  - `ship-plan/_readiness-signals.md:30` reads `plan-version`; the artifact writes `plan-version-at-run`.
  - `augment/wide-event-observability/_adapter-react.md:7` calls the client tier "Block H"; Block H is Provisioning.
  - `implement/_reviews-mode.md:3` calls `reviews` the second argument; the example shows it third.
  - `intake/simplify/_artifact.md` writes `progress:` as a list and an empty `selected-slice`, which the sibling modes forbid.
  - `ship-plan/_readiness-gate.md:113–122` writes YAML comments into `00-index.md`, which the index rules forbid.
  - All 11 review rubrics point to "`_stage.md` Step 3" for the write target, which moved to `_dispatch.md`.
  - `intake.md:59` says a `design` token on `fix` adds design notes; all four change-modes take `design`, and it runs the design stage.

## 5. Load changes, ranked by measured cost

The savings below are words per 30 days at the measured read rate. They are upper bounds: a mode row that is skipped saves the file only on runs where the condition is false.

| # | Change | Measured cost now | Saving (estimate) | Risk |
|---|---|---|---|---|
| L1 | **Split `verify/_sub-agents.md` by sub-agent.** Sub-agents 1, 2, and 5 stay always (980 words). Sub-agent 3 (1,580) moves into `verify/_runtime-evidence.md` (`mode:user-observable`), which it duplicates in part. Sub-agent 4 (605) moves to a `mode:augmented` file. | 509 k | 200–350 k | medium |
| L2 | **Make `runtime-adapters/_ladder.md` conditional in `plan.md`** (`mode:user-observable`, as verify already is). Plan skips Verification Strategy rows with no user-observable AC (`plan.md:211`). Keep it always in probe. | 295 k in plan | 100–200 k | low–medium |
| L3 | **Trim `design/_lane.md` by section.** plan and slice need "UX impact" and "The human rule"; shape adds "The design record"; fix, hotfix, and refactor need "UX impact"; update-deps needs none (it always writes `none`). Code enforces the gate (`lib/design-lane.mjs`, `pre-write-validate.mjs`). | 260 k | about 150 k | low |
| L4 | **Boundary agents read the header and their own section** of `campaign/_boundary.md`, not the whole file (`campaign-wave.js:3756`). A pure prompt change. | 135 k | about 110 k | low |
| L5 | **Scope `design/_design-context.md` by section,** and move its stage-only sections (about 790 words) to the design stage. Its own contract says each stage loads only its part. | 155 k | about 70 k | low–medium |
| L6 | **Make `implement/_research.md` conditional.** Its own line 3 says to skip it for trivial changes, and each step group re-reads it. | 69 k | about 40 k | low |
| L7 | **Review writer.** `review/_select.md` becomes a mode row for runs that select their own rubrics: on the driver paths a separate agent already selected them. The Step 3 reviewer prompt of `review/_dispatch.md` becomes conditional the same way. `review/_context.md` folds into `review/_stage.md`. The ad-hoc section of `review.md` (793 words) moves to its own file. | review: 11 k words per agent | about 3 k per review agent | medium |
| L8 | **Session loads.** `_host-invocation.md` keeps a 450-word core and moves the surface rows to the stages that use them. The stage blockquote loads `_steering.md` only when `steer.md` exists. `_output-boundary.md` leaves the 11 rubric pointers. `_requires.md` keeps the reader checklist and moves the authoring spec and mod internals out. `_control-file-ownership.md` moves its liveness rules (about 600 words) to a file that status and yolo load. | session shell reads | about 13 k per interactive slice run, if the pointers are followed | medium |
| L9 | **Intake shared files.** The change-mode section of `intake/_intake-context.md` (535 words) moves to `_change-mode-tail.md`. `intake/_intake-provenance.md` splits into Detect (always) and Consume and Link back (`mode:from`, 832 words). Step 10 (registration in INDEX.md) moves from `default.md` into `_intake-context.md`, so six modes stop opening `default.md` (2,611 words). | per intake | 535–1,370 per intake | medium |
| L10 | **Driver skip list.** `preambleClause` also names `_requires.md`, `_steering.md`, `_gate-question.md`, and `_question-craft.md`: the driver prompt already restates each of them (`requiresClause`, `steeringClause`, the POLICY block). | not measured (drivers rarely read them) | small | low |
| L11 | **Campaign session files.** Split `campaign/_phases.md` into setup (Phase 0, 1, and Width) and the recurring prepare. Split `campaign/_waves.md` into running a wave, ship and end, and local records, and cut its copies of `_boundary.md`, `_order.md`, and `_gh-stack.md`. Move "In a campaign" (898 words) out of `yolo/_commentary.md`. Trim `campaign/_drive.md` and `campaign/_order.md` to what the resolve and reconcile agents read. | session reads (low measured) | 2,500–4,000 per campaign step | medium |

**Total.** L1–L6 address about 1.1 M of the 3.3 M words read in 30 days, and could save about 0.7–0.9 M (20–27 %). L7–L11 cut per-run cost where the measurement is thin (review and the interactive session).

## 6. Structure findings

1. **A conditional row leaves the read check.** The mod checks only `always` and `if-present` rows (`_requires.md:15`), and the measured skip rate of procedure files was 3–58 % before the check existed. Every make-conditional in section 5 trades a checked read for a cheaper run. Where possible, prefer a Sections cell on an `always` row (still checked) over a `mode:` row. A mod change that also checks a `mode:` row whose condition the stage records would remove the trade.
2. **Driver prompts read whole files for one section.** `campaign/_boundary.md` and `review/_stage.md` are the clear cases (L4, L7). A prompt that names the section, and a stage reference whose Requires row names the section, are cheaper than a new file.
3. **Rules restated in several places already drift.** Examples: the design-settled rule (5 copies), the park kinds (2, drifted, F6), the if-present rule (3), the stop-one-slug rule (3), the wall-ownership rule (5), the light `workflow-index` template (6 copies, the simplify copy drifted). Each restated rule needs one owner, with the others replaced by a pointer.
4. **Driver mirrors.** `campaign/_drive.md` and `campaign/_order.md` mostly restate prompts that the wave driver builds, and tests pin their headings. Decide whether they are the driver's specification (then a test compares them with the prompts) or session notes (then cut them to what the session does).
5. **Single-loader files at the shared top level.** `_handoff-config.md`, `_ci-red-routing.md`, and `_pr-ci-handoff.md` are used only by handoff. They belong under `handoff/` with `_pr-triage.md`.
6. **Old plugin versions keep loading removed files.** A consumer session runs the plugin version that was installed when it started. A fix to a sub-procedure reaches a project only after a release and a new session there.

## 7. Recommended order

1. **Fix section 4** (F1–F16) in one change. These are small, verified, and wrong today. F15 is a regression of c8da0287.
2. **L1–L6**, the measured cost, with the read-check trade of section 6.1 decided first.
3. **L7–L9** (review, session, intake).
4. **L10–L11** and the structure findings 3–5.

Each Requires change needs `node scripts/build-requires.mjs`, then `tests/unit/mod/build-requires.test.mjs` and `tests/unit/skills/requires-tables.test.mjs`. Tests pin many headings and needles (`campaign-wave-docs`, `brainstorm-mode`, `surface-sweep`, `shared-reference-drift`, `output-boundary`, `capability-inventory`), so each move updates its test and, for moved capability sentences, `docs/internal/capability-inventory/moved.json`.

## 8. Questions

Answered by the PO, 2026-10-22:

- **AQ1 — Check mode rows first.** Before any file becomes conditional, the mod checks a `mode:` row when the mode applies to the write. No read goes unchecked (W0).
- **AQ2 — Session notes.** `campaign/_drive.md` and `campaign/_order.md` are cut to what the session and the resolve and reconcile agents need. The driver prompts are the specification.
- **AQ3 — One shared file.** The light `workflow-index` `00-index.md` template becomes one shared file with the values for each mode.
- **AQ4 — Scope: everything.** The next change covers the section 4 fixes, all load changes L1–L11, and the structure findings of section 6. No commit until the PO asks.

## 9. Not verified

- Whether a driver agent opens a file that its prompt only cites, and whether it reads a whole file or one section. The scan counts reads, not attention.
- The share of slices with a user-observable AC, so the L1 and L2 savings are ranges.
- Codex and pi use: their transcripts are not in `~/.claude/projects`.
- The platform API names in `design/_platforms.md`, the gh GraphQL fields in `handoff/_pr-triage.md`, and the pi rows of `_host-invocation.md`.

## 10. Plan

The work runs in this order. Each work item ends with its tests green. Nothing is committed until the PO asks.

### W0 — The mod checks mode rows (AQ1)

Today `requiredOf` (`hooks/mod/readledger.ts`) keeps only `always` and `if-present` rows. W0 makes it keep a `mode:<name>` row when the mode applies to the write.

1. **A mode applies** when one of these is true:
   - The written artifact's frontmatter lists it in `modes:` (the writer declares the modes it ran under).
   - A resolver in the mod finds it on disk. Each resolver reads a file that the run already has: `deferral` (`00-index.md` has an open `runtime-evidence-deferrals` entry), `user-observable` (the slice file marks an AC `observable: true`, or the verify artifact has an `interactive-verification-results` entry), `design` (`02b-design.md` or `02c-craft.md` exists), `packet` (`00-index.md` has `origin-packet`), `from` (`00-index.md` has `origin-slug`), `triage`, `slug-wide`, `change` (from `review-scope` and `workflow-type`).
   - A mode with no resolver counts only when declared.
2. A disk resolver wins over a missing declaration, so a writer cannot skip a read by leaving a mode out.
3. `_requires.md` defines `modes:` and the resolvers. Every stage artifact schema in `tests/frontmatter.schema.json` admits `modes:`.
4. `scripts/measure-artifacts.mjs` uses the same rule (this also closes F15).
5. Tests: `hooks/mod/tests/readcheck.test.ts` gains a declared mode, a resolved mode, and a mode that does not apply.

### W1 — Section 4 fixes (F1–F16)

All 16, F15 first. F3 widens `mode:deferral` to the resolver of W0.

### W2 — The measured load changes (L1–L6)

Under W0, each new `mode:` row is checked. L1 splits `verify/_sub-agents.md` (sub-agent 3 into `verify/_runtime-evidence.md`, sub-agent 4 into a `mode:augmented` file). L2 makes `runtime-adapters/_ladder.md` `mode:user-observable` in `plan.md`. L3 and L5 add Sections cells to the `design/_lane.md` and `design/_design-context.md` rows and move the stage-only sections of `_design-context.md` to the design stage. L4 changes the boundary prompt to the header and one section. L6 makes `implement/_research.md` conditional.

### W3 — Review, session, and intake (L7–L9)

L7: review mode rows for `_select.md` and the Step 3 prompt; `review/_context.md` into `review/_stage.md`; the ad-hoc section of `review.md` to its own file. L8: the session files (`_host-invocation.md` core, `_steering.md` only with `steer.md`, `_output-boundary.md` off the rubrics, `_requires.md` reader part, a liveness file from `_control-file-ownership.md` and `_chat-return.md`). L9: the intake shared files and Step 10 into `_intake-context.md`.

### W4 — Driver skip list, campaign files, and structure (L10, L11, AQ2, AQ3, section 6)

1. L10: `preambleClause` also names `_requires.md`, `_steering.md`, `_gate-question.md`, and `_question-craft.md`.
2. L11 and AQ2: split `campaign/_phases.md` and `campaign/_waves.md`; move "In a campaign" out of `yolo/_commentary.md`; cut `campaign/_drive.md` and `campaign/_order.md` to session notes.
3. AQ3: one shared light `workflow-index` template, used by brainstorm, ideate, simplify, investigate, rca, and discover.
4. Section 6.3: one owner for each restated rule (design-settled, park kinds, if-present, stop one slug, wall ownership); the other places point to it.
5. Section 6.5: `_handoff-config.md`, `_ci-red-routing.md`, and `_pr-ci-handoff.md` move under `handoff/`.
6. Delete `design/_commands.md`.

### W5 — Close

`npm run build`, `node scripts/build-requires.mjs`, `node scripts/verify-prose-budget.mjs --update`, `docs/internal/capability-inventory/moved.json` for each moved sentence, the full `npm test`, and the CHANGELOG `[Unreleased]` entry. A second transcript scan after a release measures the real saving.
