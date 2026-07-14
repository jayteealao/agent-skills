---
description: Turn the completed and reviewed work into a PR-ready handoff package with reviewer and QA context. Aggregates ALL complete slices of a slug by default; a `pr#N` or branch-name first argument aggregates EVERY slug that shares that branch (batch mode) and reports which slugs are handoff-ready. Pass a slice-slug only when each slice has its own separate PR.
argument-hint: <slug|pr#N|branch> [slice-slug]
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a MANDATORY gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `$wf handoff`, **stage 8 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → `8·handoff` → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires (per-slice review mode) | `05-implement-<slice-slug>.md` AND `07-review-<slice-slug>.md` for every slice in scope (handoff aggregates one review per slice). |
| Requires (slug-wide review mode) | `05-implement-<slice-slug>.md` for every slice in scope AND a single `07-review.md`. Per-slice review files are not required and not checked when `review-scope: slug-wide`. |
| Conditional inputs (mandatory when present) | `02b-design.md`, `02c-craft.md`, `04b-instrument.md`, `04c-experiment.md`, `05c-benchmark.md`, `augmentations:` list — each MUST contribute reviewer-visible context to the handoff package (translated to product/user language per External Output Boundary). The handoff is incomplete if any present artifact is omitted from the package. |
| Produces | `08-handoff.md` per slug — covering all complete slices (or one slice if explicitly scoped). In batch mode: one per slug on the branch, plus a single shared PR and the branch-level readiness block on the lead slug. |
| Next | `$wf ship <slug>` (default) — or `$wf ship pr#N` to ship every ready slug on the branch together |
| Skip-to | `$wf retro <slug>` if shipping is handled externally or not applicable |
| Ship-plan gate (step 6.7) | Runs the shared [_ship-plan-readiness.md](_ship-plan-readiness.md) pre-check — a missing or drifted `.ai/ship-plan.md` STOPs at `awaiting-input`, routing to `$wf ship-plan init` / `edit`, so the PR is never declared ship-ready against a stale release contract. |

> **Auto second opinion.** Before writing the final readiness verdict, **auto-invoke**
> `$consult codex <review this PR diff and open findings for design drift,
> architectural smell, or security blind spots>` (pinning `codex`/`claude` keeps it
> free) whenever the PR carries any open review finding (even non-blocking), touches a
> security-sensitive or externally-observable surface, or any `intent-risk` (RIM) is
> still `carried` at handoff — a read-only panel that catches what CI cannot, right
> before the PR is declared ready. Fire it rather than offering it; skip only a clean,
> low-surface PR with no open findings. The user may invoke it with any provider.

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT make code changes, fix issues, or modify the implementation **yourself**. When CI fails or a review thread needs a code change, you **delegate** it: dispatch a diagnosis/fix **subagent** (see `## Fix-subagent contract` in [_pr-ci-handoff.md](_pr-ci-handoff.md)) and, for CI-red, get user approval first. The orchestrator reads no source and writes no patch — the subagent does, and only its compact result returns to your context.
- You DO wait. CI must reach a terminal state and bot reviews must get their settle window before you decide readiness. Snapshotting "pending" and stopping is a contract violation (see T5.0/T5.3).
- Do NOT ship, merge, or deploy — that is a later stage.
- Your job is to **summarise the completed work into a reviewer-friendly handoff package, push the branch, and create a pull request**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start editing code or merging, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the first argument** — it is polymorphic. Resolve in this exact order (first match wins), so a slug is never mistaken for a branch:
   - **Exact slug**: `.ai/workflows/<arg>/00-index.md` exists → **single-slug handoff**. `handoff-scope: slug`. This is the classic path.
   - **PR reference** `pr#N` / `#N` / a bare integer: resolve the branch via `gh pr view <N> --json headRefName -q .headRefName` → then follow the branch path below. `handoff-scope: branch`.
   - **Branch name**: matches a `branch:` recorded in some `00-index.md` (or an existing git branch) → **batch handoff**. `handoff-scope: branch`.
   - **Absent**: infer the most recent active workflow from `.ai/workflows/*/00-index.md` → single-slug. If ambiguous, ask the user.

   > **Footgun guard.** If the resolved single slug's `branch` is shared by *other* slugs' `00-index.md`, WARN: a single-slug handoff on a shared branch produces a per-slug verdict that goes stale the moment a sibling slug moves the branch. Recommend the batch form `$wf handoff pr#N` (or the branch name). Proceed only if the user confirms.

2. **Build the roster** (the set of slugs this run covers):
   - **Single-slug**: roster = `[<slug>]`.
   - **Batch**: scan every `.ai/workflows/*/00-index.md`; the roster is every slug whose `branch:` equals the resolved branch. If none → STOP: "No workflows are on branch `<branch>`." Record the roster as `branch-slugs:`.

3. **Read each roster slug's `00-index.md`** — parse `current-stage`, `status`, `selected-slice-or-focus`, `open-questions`, `branch-strategy`, `branch`, `base-branch`, **`review-scope`** (default `per-slice` if absent), and any existing `handoff-lead:`.

3a. **Elect the lead slug** (batch only; single-slug is trivially its own lead):
   - If any roster slug already carries `handoff-lead:` in its index, reuse it verbatim — **the lead is stable across re-runs**.
   - Otherwise elect the first roster slug alphabetically and stamp `handoff-lead: <lead>` into **every** roster slug's `00-index.md` now.
   The lead owns the single shared PR and the branch-level readiness block. Followers carry `readiness-via: <lead>/08-handoff.md`.

4. **Resolve per-slug handoff scope** — for each roster slug, determine which of its slice artifacts this handoff covers:
   - **Explicit slice mode**: a slice-slug passed as the second argument (single-slug only) → scope to that one slice. Skip to the prerequisite check with that single slice.
   - **Aggregate mode** (default): Read the slug's `03-slice.md`. Collect every slice entry with `status: complete` or `status: in-progress`. If a slug has none → it is **not handoff-ready**; record it in the roster report as "no implemented slices" and skip packaging it (do not STOP the whole batch).

5. **Check prerequisites for each roster slug** (branches on `review-scope`). A slug that fails any check is marked **not-ready** with the reason and excluded from packaging; it does not abort the run. In **single-slug** mode a not-ready result STOPs with the reason. In **batch** mode not-ready slugs are reported in the roster and skipped while ready siblings proceed.

   For each roster slug, evaluate:

   **Implement gate (all modes)**: `05-implement-<slice-slug>.md` must exist for every slice in the slug's scope. Missing → not-ready: "Run `$wf implement <slug> <slice>` for missing slices."

   **Intent-risk gate (all modes)**: Parse `intent-risks` (the RIM ledger) from the slug's `00-index.md` (absent on older workflows → treat as empty). Any entry with `status: open` → not-ready: "An unadjudicated intent-risk means shape never resolved a load-bearing ambiguity — run `$wf shape <slug>` to adjudicate it (set the entry to `adjudicated` or `carried`)." This mirrors the runtime-evidence-deferral (ship.md step 6.5) and ship-plan-readiness (step 6.7) gates — handoff detects and routes, it never adjudicates. `carried` RIMs are **legal** (consciously deferred to a named stage) but MUST be surfaced in the PR body and the handoff summary's `## Reviewer Focus Areas`.

   **Per-slice review mode** (`review-scope: per-slice` or absent):
   - `07-review-<slice-slug>.md` must exist for every slice in scope. Missing → not-ready: "Run `$wf review <slug> <slice>` for each slice."
   - For each `07-review-<slice-slug>.md`, parse `verdict:` and `metric-findings-blocker:` (OPEN blockers only — ledger excludes `fixed`/`dismissed`/`resolved`). Any slice `verdict: dont-ship` or `metric-findings-blocker > 0` → not-ready, naming the offending slice(s); fix via `$wf implement <slug> <slice> reviews`.

   **Slug-wide review mode** (`review-scope: slug-wide`):
   - A single `07-review.md` must exist. Missing → not-ready: "Run `$wf review <slug>` first."
   - Parse `verdict:` and `metric-findings-blocker:` from `07-review.md`. `verdict: dont-ship` or `metric-findings-blocker > 0` → not-ready.

   In all modes: if a slug's `current-stage` is already past handoff → WARN before overwriting that slug's package.

6. **Fingerprint no-op guard + roster report.** For each **ready** slug, compute its `handoff-fingerprint` — a stable digest of the packaging inputs: the commit range packaged, the in-scope slice slugs and their statuses, and each in-scope review's `verdict`. Compare to the `handoff-fingerprint` stored in the slug's existing `08-handoff.md` (absent on first run):
   - **Match** → the slug's package is already current: skip it entirely (no snapshot, no ledger entry, no rewrite — per the no-op guard in [_additive-write.md](_additive-write.md)). Mark it "unchanged" in the roster.
   - **Differ / absent** → the slug will be (re)packaged this run.

   Then **print the roster report before doing any packaging**:

   | Slug | Stage | Review verdict | Open blockers | Fingerprint | Action |
   |---|---|---|---|---|---|
   | `<slug>` | implement/review/handoff | ship / dont-ship | N | fresh / changed / new | package / skip-unchanged / **not-ready: <reason>** |

   In single-slug mode the roster is one row. In batch mode it is the whole branch.

6.7. **Ship-plan readiness pre-check (gate).** Load [_ship-plan-readiness.md](_ship-plan-readiness.md) and follow it verbatim (caller = `handoff`, commit range = `git merge-base HEAD origin/<base-branch>`..`HEAD`). Handoff produces a PR that `$wf ship` will consume, so it verifies now that the release contract exists and still matches the repo — catching a missing or drifted `.ai/ship-plan.md` *before* the PR is declared ship-ready rather than at the ship gate. This stage **gates**: a missing plan or unacknowledged drift STOPs the run before packaging and routes to `$wf ship-plan init` / `$wf ship-plan edit` via the slug's `00-index.md` `recommended-next-*` (no partial `08-handoff.md` is written — resume handoff after the plan is fixed). `ok`, `acknowledged`, and `not-applicable` (shipping handled externally) proceed. Handoff never edits the plan — it detects and routes. Stamp the returned `ship-plan-readiness` into `08-handoff.md` frontmatter (in batch mode the lead owns the single project-level check). Skip only when a prior run this session already resolved it to `ok`/`not-applicable` and nothing in Group 2's change surface moved since.

7. **Read full context** (for each slug being packaged):
   - `02-shape.md` — overall spec and docs plan
   - `03-slice.md` — master index (slice statuses)
   - For each slice in scope: `03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`, `06-verify-<slice-slug>.md` (if exists). Plus `07-review-<slice-slug>.md` if `review-scope: per-slice`.
   - When reading each `06-verify-<slice-slug>.md`, check the following signals and surface them in `## Reviewer Focus Areas` if present:
     - `stability-check-flaky-count > 0` → note as "N criteria showed intermittent behaviour during verification — may indicate race conditions."
     - `adversarial-tests-failed > 0` → note as "Adversarial edge case failures found during verification — see verify report." List the specific failures from `## Adversarial Tests`.
     - `cross-browser-delta: findings` → note as "Cross-browser rendering divergences found — reviewer should check browser compatibility." List from `## Cross-Browser Delta`.
     - `web-vitals-inp-ms > 200` → note as "Interaction responsiveness (INP) measured above threshold — may affect perceived performance."
     - `## Friction Notes` and `## Free Exploration Notes` (if non-empty) → include under a "Soft Observations" subsection in `## Reviewer Focus Areas`.
   - If `review-scope: slug-wide`: read the single `07-review.md` (review verdict and all findings for the whole branch).
   - `po-answers.md`
6. **Read augmentation context (`02c-craft.md` is mandatory when present; the augmentations list is optional):**
   Read `02b-design.md` and `02c-craft.md` for register, anti-goals, and visual contract — **if `02c-craft.md` exists you MUST read it.** The mock fidelity inventory items are user-visible changes the PR description should highlight (translated to product language).

   Read the `augmentations:` list in `00-index.md`. Every entry must appear in the handoff package's `## Design Changes` and/or `## Reviewer Focus Areas` section. Per-type translation:

   | Type | Reviewer-visible mention (in product language) |
   |---|---|
   | `design-harden` | "Accessibility improvements applied — N components updated, axe-core scan clean" |
   | `design-optimize` | "Performance improvements — measured Xms reduction in [metric]" |
   | `design-adapt` | "Improved mobile/tablet/dark-mode behavior" |
   | `design-colorize` / `design-typeset` / `design-polish` etc. | "Visual refresh of [surface area]" |
   | `design-audit` / `design-critique` | "Design quality review pass — N findings addressed" |
   | `instrument` | "Added observability — N signals (logs/metrics/traces) for previously unobserved code paths" |
   | `experiment` | "Wrapped behind feature flag with cohort split for measured rollout" |
   | `benchmark` | "Performance baseline taken; verify-stage comparison: <within tripwires / regression>" |

   Do NOT cite workflow artifact paths or skill names in any external-facing field of the handoff package or PR.
7. **Carry forward** `open-questions` from the index.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, get the current UTC time per [_timestamp.md](_timestamp.md). Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Ask the user directly in chat** for multiple-choice PO questions (structured decisions, confirmations), presenting options as a short numbered list. Use freeform chat for open-ended questions. Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.
- **Conditional inputs are mandatory when present.** If a file in this command's *Conditional inputs* row exists on disk, read it and honor it in the output — existence is optional, consumption is required; silent omission is a contract violation.

# Chat return contract
After writing files, return per [_chat-return.md](_chat-return.md) — narrative lead in the artifact's `## The Handoff` story voice, then this receipt:
- `scope: <slug|branch>` and, in batch mode, the roster report (one row per slug: package / skip-unchanged / not-ready)
- `slug: <slug>` (lead slug in batch mode)
- `wrote: <path>` (one line per slug packaged)
- `pr: <url>` and `pr-readiness-verdict: <ready|awaiting-input|blocked>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. **Read branch strategy** from `00-index.md` frontmatter: `branch-strategy`, `branch`, `base-branch`. Also read the optional PR-readiness config keys (silent skip if absent): `public-surface`, `docs-mirror`, `review-bots` — see `## Project-level handoff config` below.
2. **Work through the handoff sequence** — work each task sequentially, tracking state in the artifact file. All metadata: `{ slug, stage: "handoff", slices: "<comma-separated list of slice-slugs in scope>", mode: "<aggregate|single-slice>" }`.
   - T1: Read prior artifacts.
   - T2: Write handoff summary.
   - T3: Generate Diátaxis docs.
   - T3.5: Commitlint pass.
   - T3.6: Public-surface drift check.
   - T3.7: Doc-mirror regen.
   - T4: Push branch to remote.
   - T5: Create or update pull request.
   - T5.0: Watch CI to green + settle reviews.
   - T5.1: PR comment triage.
   - T5.2: Rebase onto base.
   - T5.3: Final readiness re-watch.
   - T6: Write `08-handoff.md`.
3. Read all prior artifacts needed for the summary.
4. Summarize the problem, solution, affected areas, verification evidence, risks, and follow-ups in reviewer-friendly language.
5. **Documentation generation (Diátaxis):**
   a. Read `02-shape.md` and check the `## Documentation Plan` section and `docs-needed` / `docs-types` frontmatter.
   b. If `docs-needed: true`, for each identified doc type, load the matching Diátaxis primitive reference (`docs/<primitive>.md`) and follow it verbatim. Each primitive contains the full Diátaxis discipline for its quadrant — structure, writing rules, anti-patterns, and final self-check.

      | `docs-types` value | Primitive reference to load |
      |---|---|
      | `reference` | `docs/reference.md` |
      | `how-to` | `docs/how-to.md` |
      | `tutorial` | `docs/tutorial.md` |
      | `explanation` | `docs/explanation.md` |
      | `readme` or `readme-update` | `docs/readme.md` |

      Treat the loaded primitive as authoritative for that doc type. Pass the feature context (from the handoff summary, shape, and verification artifacts) to the primitive as the writing target.
   c. For each doc, respect Diátaxis boundaries — do NOT mix types. If a doc would need to cover both "how to" and "reference", split into two files.
   d. Write generated docs to the appropriate location in the repo (as identified in the shape's docs plan). If no location was specified, write to `docs/` or update the existing file.
   e. Include the doc paths in `## Documentation Changes` in the handoff file.
   f. If `docs-needed: false` or no docs plan exists, note "No documentation changes" in the handoff.

5b. **T3.5 — Commitlint pass.**
   a. Detect commitlint config: look for `.commitlintrc`, `.commitlintrc.json`, `.commitlintrc.yaml`, `.commitlintrc.js`, `commitlint.config.js`, or `commitlint.config.cjs` at repo root. If none exist, set `commitlint-status: skipped` in handoff frontmatter; skip 5b.
   b. Resolve `merge-base`: `git merge-base HEAD origin/<base-branch>`.
   c. Run `npx commitlint --from <merge-base> --to HEAD` (or `pnpm commitlint ...` / `yarn commitlint ...` matching the project's package manager). Capture output.
   d. Classification:
      - All commits pass → `commitlint-status: pass`
      - Any commit contains `BREAKING CHANGE` footer or `!:` in subject → `commitlint-status: warn` (record breaking commits in `## Reviewer Focus Areas`; do NOT block)
      - One or more commits violate the config → `commitlint-status: fail`. STOP. Print the violating commits and ask the user to amend (do NOT auto-fix).

5c. **T3.6 — Public-surface drift.**
   a. Read `public-surface:` block from `00-index.md` frontmatter. If absent, set `public-surface-drift: skipped`; skip 5c.
   b. Capture pre-state: `git diff --quiet HEAD -- <files>` (using `public-surface.files`); record clean/dirty.
   c. Execute `public-surface.regen-cmd`. Wait for completion.
   d. Re-check `git status` against the `files` list:
      - No changes → `public-surface-drift: none`
      - Files changed AND they were clean before → regen produced new surface; stage + commit `chore(api): regenerate <kind> surface mirror` → `public-surface-drift: regenerated`
      - Files changed AND they were dirty before → drift exists with no regeneration committed in the branch → `public-surface-drift: drift-without-regen`. STOP. Tell the user the public surface drifted and the regen output disagrees with the staged version; ask them to reconcile via `$wf implement <slug> <slice>` before re-running handoff.
   e. Record the regen-cmd output summary in `## Reviewer Focus Areas` if the kind is `kotlin-api`, `openapi`, `graphql-schema`, `typescript-dts`, or `sql-ddl` — these are surfaces reviewers should explicitly check.

5d. **T3.7 — Doc-mirror regen.**
   a. Read `docs-mirror:` block from `00-index.md` frontmatter. If absent, set `docs-mirror-status: skipped`; skip 5d.
   b. Execute `docs-mirror.regen-cmd`. Wait for completion.
   c. Check `git status` for changes under `docs-mirror.mirror-paths`:
      - No diff → `docs-mirror-status: up-to-date`
      - Diff present → stage the changed mirror paths and commit `docs: regenerate doc mirrors` → `docs-mirror-status: regenerated`

6. If release behavior depends on current external platform guidance or vendor changes, run a targeted freshness pass.
7. **Push and create-or-update PR (if `branch-strategy` is `dedicated`):**
   a. Confirm you are on the workflow branch (`branch` field). If not, `git checkout <branch>`.
   b. Push the branch to remote: `git push -u origin <branch>`.
   c. **PR existence check (idempotent):** Run `gh pr list --head <branch> --json number,url,state --limit 1`. Three cases:
      - **No PR exists** → Run `gh pr create`:
        - Title: best PR title from the handoff summary
        - Body: full handoff summary (Summary, Problem, Solution, Affected Areas, Verification Evidence, Risks, Follow-Up Work, Reviewer Focus Areas), formatted as the PR description
        - Base: `<base-branch>` from the index
        - Do NOT merge. The PR is for review.
      - **PR exists, state=OPEN** → Run `gh pr edit <pr-number> --body-file <tmp-file>` to refresh the PR body with the current handoff summary. Title is left as-is unless it materially mismatches.
      - **PR exists, state=CLOSED|MERGED** → STOP. The branch's prior PR is closed; ask the user whether to reopen it (`gh pr reopen <pr-number>`), open a new one (delete `pr-number` from `00-index.md` then re-run), or treat the workflow as already shipped (route to `$wf retro <slug>`).
   d. **PR template checkbox sweep.** If `.github/PULL_REQUEST_TEMPLATE.md` exists, cross-reference its checkboxes against the handoff state and tick the ones the artifact provides evidence for (e.g., "Tests pass" if `06-verify-*.md` shows green; "Docs updated" if `docs-generated:` is non-empty). Do not tick checkboxes the artifact does not justify.
   e. Record the PR URL and number. Update `00-index.md` with `pr-url` and `pr-number`.
   - If `branch-strategy` is `shared`:
     - **Single-slug scope**: push the branch but do NOT create a PR automatically — a shared branch usually hosts other in-flight slugs, so an auto-PR would describe unreviewed sibling work. Note in the handoff that the user should create the PR manually, or re-run in **batch scope** (`$wf handoff pr#N` / branch name) once the siblings are ready.
     - **Batch scope**: this is exactly the case batch mode exists for. Once the roster's ready slugs are all packaged and the branch's not-ready slugs are disclosed in the PR body, the lead **does** create/refresh the single shared PR (T5 runs) — one PR describing the whole branch. Force-push steps (T5.2 rebase) stay deleted for shared branches; T5.0/T5.1/T5.3 run against the created PR.
   - If `branch-strategy` is `none`: Skip push/PR entirely. The handoff document is the deliverable.

7a. **T5.0 — Watch CI to green + settle reviews.** Skip this step entirely if `branch-strategy` is not `dedicated`/`shared` or no `pr-number` is recorded. Otherwise, **read [_pr-ci-handoff.md](_pr-ci-handoff.md) in full now** — it carries the `## CI watch procedure`, the `## Fix-subagent contract`, and the `## PR comment triage (T5.1)` loop that steps 7a–7d execute.

   This step gets CI to a terminal state and gives bot reviewers a bounded window to land, so triage in 7b operates on real signal. T5.3 decides the final verdict after fixes and rebase.

   a. **Read the wait config** from `00-index.md` frontmatter: the optional `ci-watch:` and `review-settle:` blocks (see `## Project-level handoff config`). Absent keys use the defaults documented there (`ci-watch`: poll every 30s, bound 30 min, 2 fix rounds; `review-settle`: 5 min window, poll every 30s).

   b. **Watch CI to a terminal state.** Run the shared **`## CI watch procedure`** (in `_pr-ci-handoff.md`) against `pr-number`. Outcomes:
      - **green** (all checks `SUCCESS`/`NEUTRAL`/`SKIPPED`) → record `ci-watch-conclusion: green`; go to step 7a.d.
      - **bound-exceeded** (checks still `pending` when the wait bound elapsed) → record `ci-watch-conclusion: timed-out`, set `readiness-verdict: awaiting-input`, list the still-pending checks in `live-checks-pending`, and STOP (write the artifact via steps 8–10). Re-run `$wf handoff <slug>` to resume.
      - **red** (one or more checks terminal-failed) → go to step 7a.c.

   c. **On CI red — diagnose-only subagent, then ask (do NOT auto-fix).** Per the configured policy, the orchestrator never patches code itself.
      1. **Dispatch ONE read-only diagnosis subagent**. Prompt it with the failing check names and these instructions: pull the failing logs (`gh pr checks <pr-number>`, `gh run view <run-id> --log-failed`), read the implicated source, and return a structured diagnosis ONLY — **apply no edits, run no fixes, create no commits**. Required return fields: `root-cause` (one paragraph), `proposed-fix` (file:line + the change), `confidence` (high/med/low), and `class` (`product-bug` | `flaky-or-infra` | `preexisting-unrelated`). The subagent keeps the full log dump out of the orchestrator context — only its compact diagnosis returns.
      2. **Surface the diagnosis to the user** asking in chat presenting a short numbered list:
         "CI failed: <check names>. The diagnosis subagent proposes <one-line>. How should we proceed?
         1. Apply proposed fix — Route the fix to a fix subagent, push, and re-watch CI.
         2. Treat as flaky — re-run — Re-run the failed checks and re-watch. Use only if class is flaky-or-infra.
         3. Stop — block handoff — Record the failure; set readiness-verdict: blocked and STOP."
      3. **Apply proposed fix** → dispatch ONE **fix subagent** per the `## Fix-subagent contract` (in `_pr-ci-handoff.md`), passing the diagnosis's `proposed-fix`. It applies the minimal fix, commits `fix(<slug>): resolve CI failure — <short>`, and returns the commit SHA. Then `git push origin <branch>` and **re-run the CI watch procedure** (step 7a.b). Increment `ci-watch-fix-rounds`. Bound the apply→push→re-watch loop by `ci-watch.max-fix-rounds` (default 2); on exceeding it, set `readiness-verdict: awaiting-input` and STOP.
      4. **Re-run** → `gh run rerun <run-id> --failed`, then re-run the watch procedure (does not count against `max-fix-rounds`; cap re-runs at 2 to avoid masking a real failure).
      5. **Stop — block** → record `ci-watch-conclusion: red`, `live-checks-failing: [<names>]`, set `readiness-verdict: blocked`, and proceed to steps 8–10 (write artifact). Recommend `$wf implement <slug> <slice>` in the routing options.

   d. **Settle reviews (bounded — bots only, never block on humans).** Once CI is green, loop on `review-settle.poll-interval-seconds` until every login in the effective `review-bots` list (default list in `_pr-ci-handoff.md`) has posted at least one review/thread OR `review-settle.settle-minutes` elapses — whichever comes first. Record `bot-reviews-landed: [<logins that posted>]` and `review-settle-elapsed-seconds: <N>`. **Do not wait on human reviewers** — a missing required human approval is handled as `awaiting-input` in T5.3.

7b. **T5.1 — PR comment triage loop.** Run the `## PR comment triage (T5.1)` loop in [_pr-ci-handoff.md](_pr-ci-handoff.md). Record the loop's outcome in handoff frontmatter (`triage-iterations`, `triage-fixes-applied`, `triage-fixes-skipped`, `triage-deferred-thread-ids`, `has-deferred-comments`). Skip this step entirely if `branch-strategy` is not `dedicated` or no `pr-number` was recorded.

7c. **T5.2 — Rebase onto base.** (Only when `branch-strategy: dedicated`.)
   a. Fetch latest base: `git fetch origin <base-branch>`.
   b. Determine fast-forward eligibility: `git merge-base --is-ancestor origin/<base-branch> HEAD` exits 0 → already up-to-date → `rebase-status: fast-forward`; record `rebase-onto-sha: <git rev-parse origin/<base-branch>>` and skip to step 7d.
   c. Otherwise rebase: `git rebase origin/<base-branch>`.
      - **Conflicts** → `rebase-status: conflicts`. Run `git rebase --abort`. STOP. Print the conflicting files. Recommend `$wf implement <slug> <slice>` to resolve. Set `readiness-verdict: blocked` in handoff frontmatter and proceed to step 9 (update index, write artifact). T5.3 stays pending.
      - **Clean** → `git push --force-with-lease origin <branch>`. If `--force-with-lease` fails (lease moved during T5.1 triage), re-fetch and retry once. If the second attempt also fails, set `rebase-status: lease-failure` and STOP — recommend re-running handoff. Otherwise `rebase-status: rebased-clean`; record `rebase-onto-sha`.

7d. **T5.3 — Final readiness re-watch.** (Only when `pr-number` is recorded.)
   The triage fixes (7b) and the rebase force-push (7c) both retrigger CI, so the green state proven in T5.0 is now stale. **Re-establish it before deciding the verdict — do NOT reuse the T5.0 result.**
   a. **Re-watch CI.** Re-run the shared `## CI watch procedure` (in `_pr-ci-handoff.md`) against `pr-number`.
      - **timed-out** → set `readiness-verdict: awaiting-input`, record the still-pending checks in `live-checks-pending`, STOP (write the artifact via steps 8–10; re-running handoff resumes the watch).
      - **red** → this is post-fix/post-rebase breakage. Run the same diagnose-only branch as 7a.c once; if it is not resolved (user declines or the fix-round bound is hit), set `readiness-verdict: blocked` and proceed to write the artifact.
      - **green** → continue.
   b. Capture the review snapshot: `gh pr view <pr-number> --json reviewDecision,statusCheckRollup,mergeable,mergeStateStatus`. Record into handoff frontmatter:
      - `live-review-decision`: from `.reviewDecision` (`APPROVED` | `CHANGES_REQUESTED` | `REVIEW_REQUIRED` | null)
      - `live-checks-failing`: terminal-failed `name`s from `.statusCheckRollup[]` (empty after a green re-watch)
      - `live-checks-pending`: still-pending `name`s from `.statusCheckRollup[]` (empty after a green re-watch)
   c. Compute the per-slug `readiness-verdict`:
      - `ready` — `live-review-decision` ∈ {`APPROVED`, `null` if no reviewers required}, `live-checks-failing` is empty, `commitlint-status` ≠ `fail`, `public-surface-drift` ≠ `drift-without-regen`, `rebase-status` ∈ {`fast-forward`, `rebased-clean`, `skipped`}, `has-deferred-comments` is `false`.
      - `awaiting-input` — pending checks remain, there are deferred comments, OR a required human reviewer hasn't responded (`REVIEW_REQUIRED`). **No-hang path**: handoff records the missing approval as `awaiting-input` and returns control rather than blocking the session.
      - `blocked` — anything that hard-fails the criteria above (failing checks after re-watch, `CHANGES_REQUESTED` review, drift without regen, rebase conflicts, deferred 🔴 blockers).
   c2. **Compute `pr-readiness-verdict` (the branch/PR-level verdict — this is what ship gates on).** It is the **logical AND** over the whole roster: it is `ready` only if the PR-level `readiness-verdict` above is `ready` AND **every** slug on the branch is itself package-ready (none `not-ready`). Write `pr-readiness-verdict` and `handoff-lead` onto the **lead's** `08-handoff.md`; each follower sets `readiness-via: <lead>/08-handoff.md` and copies `pr-readiness-verdict`.

8. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
9. Update `00-index.md` for each roster slug: `current-stage`, next-command/invocation, and (batch) `handoff-lead`. Followers also record `readiness-via`.
10. Write `.ai/workflows/<slug>/08-handoff.md` for **each packaged slug** (additive-write + ledger + `handoff-fingerprint`). The lead's artifact carries the full branch-level readiness block and `pr-readiness-verdict`; followers carry `readiness-via` and the copied `pr-readiness-verdict`. Skip-unchanged and not-ready slugs are not written.

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the handoff and present the user with ALL viable options:

**Option A (default): Ship** → `$wf ship <slug>` (single-slug) or `$wf ship pr#N` (batch — ships every ready slug on the branch as one atomic run)
Use when: `pr-readiness-verdict: ready`, the PR is created, all complete slices are covered, and the work needs deployment planning, rollout strategy, and rollback guidance. In batch scope, prefer the `pr#N` form so the whole branch ships together (merge is atomic per PR).

**Option B: Skip to Retro** → `$wf retro <slug>`
Use when: Shipping is handled entirely outside this workflow (e.g., CI/CD auto-deploys on merge, or shipping is someone else's responsibility). The handoff document IS the final deliverable.

**Option C: Package remaining slugs/slices first** → `$wf handoff pr#N` re-run, or `$wf plan|implement <slug> <next-slice>`
Use when: the roster shows `not-ready` slugs on the branch, or `03-slice.md` shows slices still in `status: defined` that belong on this branch. Bring them to ready, then re-run `$wf handoff pr#N` — the fingerprint guard skips the already-current slugs and the PR body converges. Do NOT ship until `pr-readiness-verdict: ready`.

**Option D: Fix** → `$wf implement <slug> <selected-slice>`
Use when: While writing the handoff, you realised something is wrong or missing in a specific slice's implementation.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `08-handoff.md` with this structure:

```yaml
---
schema: sdlc/v1
type: handoff
slug: <slug>
slice-slugs: [<slug-1>, <slug-2>, ...]   # all slices covered by this handoff
handoff-mode: <aggregate|single-slice>   # aggregate = all complete slices; single-slice = explicit override
handoff-scope: <slug|branch>             # branch = batch handoff over every slug on the branch
status: complete
stage-number: 8
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
revisions: []                            # reason-centric ledger (see _additive-write.md)
handoff-fingerprint: "<digest of packaging inputs>"   # no-op guard for re-runs

# Batch fields (present when handoff-scope: branch)
handoff-lead: "<lead-slug>"              # owns the branch-level readiness block + shared PR; == slug on the lead
branch-slugs: [<slug-1>, <slug-2>, ...]  # the roster: every slug on this branch in scope
readiness-via: "<lead-slug>/08-handoff.md"   # followers only — pointer to the lead's readiness block
pr-readiness-verdict: <ready | blocked | awaiting-input>   # AND across the roster; ship gates on this
pr-title: "<suggested PR title>"
pr-url: "<url or empty if branch-strategy is not dedicated>"
pr-number: <N or 0>
branch: "<branch name>"
base-branch: "<target branch>"
ship-plan-readiness: <ok | acknowledged | not-applicable>   # ship-plan pre-check (step 6.7); missing/drift STOP at awaiting-input
has-migration: <true|false>
has-config-change: <true|false>
has-docs-changes: <true|false>
docs-generated: [<list of doc paths written or updated>]

# PR-readiness block (added by T3.5–T5.3; absent fields default to "skipped")
commitlint-status: <pass | warn | fail | skipped>
public-surface-drift: <none | regenerated | drift-without-regen | skipped>
docs-mirror-status: <up-to-date | regenerated | skipped>
triage-iterations: <N>
triage-fixes-applied: <N>
triage-fixes-skipped: <N>
triage-deferred-thread-ids: [<id>, ...]
has-deferred-comments: <true | false>
rebase-status: <fast-forward | rebased-clean | conflicts | lease-failure | skipped>
rebase-onto-sha: "<sha of origin/<base-branch> at rebase time>"

# CI-watch + review-settle block (added by T5.0/T5.3; absent → step was skipped)
ci-watch-conclusion: <green | red | timed-out | skipped>   # terminal state of the final CI watch
ci-watch-rounds: <N>                # total poll iterations across all watches this run
ci-watch-fix-rounds: <N>            # apply-fix → push → re-watch loops run on CI red
bot-reviews-landed: [<login>, ...]  # review-bots that posted within the settle window
review-settle-elapsed-seconds: <N>  # seconds spent in the bot-review settle window

live-review-decision: <APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | null>
live-checks-failing: [<check-name>, ...]
live-checks-pending: [<check-name>, ...]
readiness-verdict: <ready | blocked | awaiting-input>

tags: []
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  implements: [05-implement-<slug-1>.md, 05-implement-<slug-2>.md, ...]
  reviews: [07-review-<slug-1>.md, 07-review-<slug-2>.md, ...]   # per-slice mode: one per slice; slug-wide mode: [07-review.md]
next-command: wf-ship
next-invocation: "$wf ship <slug>"
---
```

# Batch orchestration (how the ordered steps above map onto scope)

- **Single-slug scope** — run the procedure above exactly as written for the one slug.
- **Branch scope (batch)** — split into two layers:
  1. **Per-slug packaging** (T1–T3.7: read artifacts, write handoff summary + Diátaxis docs, commitlint/public-surface/doc-mirror checks) runs **once per slug in the roster whose action is `package`**. Each writes its own `08-handoff.md` (additive-write + ledger + fingerprint). Skip slugs marked `skip-unchanged` or `not-ready`.
  2. **Branch machinery** (T4–T5.3: push, create/update the ONE PR, watch CI, triage, rebase, final readiness) runs **exactly once**, owned by the lead slug. The PR description is generated from the **union** of every packaged slug's summary and names any `not-ready` slug on the branch explicitly. The branch-level readiness block is written to the **lead's** `08-handoff.md`; followers set `readiness-via: <lead>/08-handoff.md` and copy the `pr-readiness-verdict`.
  3. **`pr-readiness-verdict` = logical AND across the whole roster.** A per-slug `readiness-verdict: ready` never means the PR is ready while a sibling slug on the branch is `not-ready`.

# Project-level handoff config (read from `00-index.md` frontmatter)

The PR-readiness block (T3.5/T3.6/T3.7/T5.1) is driven by optional config keys in the workflow's `00-index.md`. Each key's block is independent — handoff skips the corresponding step silently if the key is absent. Edit directly in `00-index.md`.

```yaml
# Optional. Drives T3.6 — public-surface drift check.
# Pattern fits Kotlin .api dump, OpenAPI/Swagger, GraphQL SDL, exported TS .d.ts, SQL DDL.
public-surface:
  kind: <kotlin-api | openapi | graphql-schema | typescript-dts | sql-ddl>
  regen-cmd: "<command that regenerates the surface mirror>"
  files:
    - "<path to surface mirror>"
    - "..."

# Optional. Drives T3.7 — doc-mirror regen.
# For projects whose user-facing docs are generated from source (e.g., Docusaurus mirroring MDX → MD).
docs-mirror:
  regen-cmd: "<command that regenerates doc mirrors>"
  source-paths: ["<glob of doc sources>"]
  mirror-paths: ["<glob of generated mirrors>"]

# Optional. Overrides the default review-bots list used by T5.1 (PR comment triage)
# AND the bot-settle wait in T5.0.
# Default if absent: [coderabbitai, greptile-dev, gemini-code-assist, "chatgpt-codex-connector[bot]"]
review-bots:
  - <login>
  - ...

# Optional. Drives T5.0 / T5.3 — CI watch. Absent → the defaults shown.
ci-watch:
  poll-interval-seconds: 30      # how often to re-read statusCheckRollup
  max-wait-minutes: 30           # bound; on exceed → readiness-verdict: awaiting-input (resumable)
  max-fix-rounds: 2              # apply-fix → push → re-watch loops before giving up (per CI-red policy)

# Optional. Drives T5.0 — bot-review settle window. Absent → the defaults shown.
review-settle:
  settle-minutes: 5              # max time to wait for review-bots to post after CI goes green
  poll-interval-seconds: 30      # how often to re-read PR reviews/threads
```

# PR/CI machinery — load on demand

The CI watch procedure (T5.0/T5.3), the fix-subagent contract (7a CI-red + 7b triage), and the PR comment triage loop (T5.1) live in [_pr-ci-handoff.md](_pr-ci-handoff.md). Read it in full at step 7a when the PR/CI path is active; a local-branch handoff (`branch-strategy: none`) never needs it.

# Handoff

## The Handoff
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Voice per `_narrative-voice.md` — no "This handoff implements…" openings. 1–4 short paragraphs. -->

## PR Title Options
1. ...

## Summary

## Problem

## Solution

## Augmentations Applied (only if `augmentations:` list is non-empty)
List every augmentation in user-facing language. Do NOT cite workflow artifact paths or skill names — translate per the External Output Boundary. Group by category for readability:

**Design improvements**: <list — accessibility, performance, responsive, visual refresh, etc.>
**Observability**: <list — N new signals for previously unobserved code paths>
**Experimentation**: <list — feature flag wiring, cohort split, metrics>
**Performance**: <list — baseline taken, compare-mode results>

For each: include user-visible effect and the verification evidence path.

## Affected Areas
- ...

## Verification Evidence
- ...

## Manual Test Notes
- ...

## Migration / Config / Rollout Notes
- ...

## Risks / Caveats
- ...

## Documentation Changes
List all docs written or updated by this handoff (from the Diátaxis docs plan in shape):
- **Type**: reference / how-to / tutorial / explanation / readme
- **Path**: where it was written
- **What it covers**: ...

If no docs changes: "None — [reason from shape docs plan]"

## Follow-Up Work
- ...

## Reviewer Focus Areas
- ...

## PR Readiness Block
Summary of T3.5–T5.3 outcomes (also recorded in frontmatter for machine consumption).
- **Commitlint:** <pass | warn | fail | skipped> — <one-line note; list breaking commits if warn>
- **Public-surface drift:** <none | regenerated | drift-without-regen | skipped> — <one-line note>
- **Doc-mirror:** <up-to-date | regenerated | skipped> — <one-line note>
- **Rebase onto base:** <fast-forward | rebased-clean | conflicts | lease-failure | skipped> — <one-line note; cite `rebase-onto-sha` if rebased>
- **CI watch:** <green | red | timed-out | skipped> — <N rounds polled; `ci-watch-fix-rounds` fix loops if any>
- **Bot reviews landed:** <list or "none"> — settled in <review-settle-elapsed-seconds>s of the <settle-minutes>m window
- **Live review decision:** <APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | null>
- **Live checks failing:** <list or "none">
- **Live checks pending:** <list or "none">
- **Readiness verdict:** <ready | awaiting-input | blocked> — <reason>

## Reviewer Comments Triaged
Populated by T5.1. Includes 🔴 blockers fixed, 🟡 suggestions applied/deferred/declined, and 🟢 informational items noted. Empty when `branch-strategy: none` or no PR exists.

| Source | File:Line | Severity | Summary | Action |
|---|---|---|---|---|

For each row: `Action` is one of `fixed (sha=<short-sha>)`, `applied (sha=<short-sha>)`, `deferred`, `declined`, or `noted`. Cite commit SHAs only — do not cite workflow artifact paths.

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `$wf ship <slug>` — [reason]
- **Option B:** `$wf retro <slug>` — skip ship [reason, if applicable]
- **Option C:** `$wf plan <slug> <next-slice>` or `$wf implement <slug> <next-slice>` — implement remaining slices before shipping [reason, if applicable]
- **Option D:** `$wf implement <slug> <slice>` — fix issue found while writing handoff [reason, if applicable]

---

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

---

## Additive-write contract (v9.105.0+)

`08-handoff.md` is revisable when reviewers request changes pre-ship, when a
late-breaking issue forces a re-handoff, when a sibling slug joins the branch
(batch mode), or as reviewers add comments. When `$wf handoff` is re-invoked on
a slug that already has one, follow the shared additive-write contract in
[_additive-write.md](_additive-write.md):

- **No-op guard (fingerprint).** Recompute `handoff-fingerprint` (step 6). If it
  matches the stored value, the package is already current: skip the slug
  entirely — no snapshot, no ledger entry, no rewrite. This is what makes batch
  re-runs cheap: only slugs whose inputs actually moved get re-packaged.
- **Snapshot** the pre-run file to `.ai/workflows/<slug>/history/08-handoff-<rev>.md`.
- **Rewrite the body to current truth.** Do NOT stack `## Revision N` sections.
  The `## The Handoff` story section absorbs the *narrative* of change — retell
  it so it reads true now ("review surfaced a race in the retry path, so the
  rollback runbook was reworked"). The verbatim prior wording lives in the
  history snapshot.
- **Ledger entry** (frontmatter `revisions:`): `trigger` is one of
  `review-feedback`, `ci-fix`, `new-slug-joined` (a sibling slug's commits
  changed the branch's readiness), `scope-change`, or `resume`; `because:` and
  `changed:` name the prompt and the effect. Update `handoff-fingerprint`.

**PR description regeneration is now trivial.** Because the body *is* the current
document (not a diff log), re-posting the PR description via `gh pr edit` is a
straight copy of the current body — no reconciliation against prior revisions.
In batch mode the PR body is the union across packaged slugs (regenerated whole
each run), so it converges automatically as laggard slugs become ready.

Handoffs are deliberate communication artifacts, not view-over-state — they keep
the ledger + snapshots. The readiness block, by contrast, is always-current
state: it is overwritten wholesale on every re-run (never revisioned), and in
batch mode lives only on the lead slug so no follower's cached verdict can go
stale when the branch moves.
