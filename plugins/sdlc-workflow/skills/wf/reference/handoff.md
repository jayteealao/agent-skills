---
description: Turn the completed and reviewed work into a PR-ready handoff package with reviewer and QA context. Aggregates ALL complete slices by default — pass a slice-slug only when each slice has its own separate PR.
argument-hint: <slug> [slice-slug]
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-handoff`, **stage 8 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → `8·handoff` → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires (per-slice review mode) | `05-implement-<slice-slug>.md` AND `07-review-<slice-slug>.md` for every slice in scope (handoff aggregates one review per slice). |
| Requires (slug-wide review mode) | `05-implement-<slice-slug>.md` for every slice in scope AND a single `07-review.md`. Per-slice review files are not required and not checked when `review-scope: slug-wide`. |
| Conditional inputs (mandatory when present) | `02b-design.md`, `02c-craft.md`, `04b-instrument.md`, `04c-experiment.md`, `05c-benchmark.md`, `augmentations:` list — each MUST contribute reviewer-visible context to the handoff package (translated to product/user language per External Output Boundary). The handoff is incomplete if any present artifact is omitted from the package. |
| Produces | `08-handoff.md` — one document covering all complete slices (or one slice if explicitly scoped) |
| Next | `/wf ship <slug>` (default) |
| Skip-to | `/wf retro <slug>` if shipping is handled externally or not applicable |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT make code changes, fix issues, or modify the implementation.
- Do NOT ship, merge, or deploy — that is a later stage.
- Your job is to **summarise the completed work into a reviewer-friendly handoff package, push the branch, and create a pull request**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start editing code or merging, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** — parse `current-stage`, `status`, `selected-slice-or-focus`, `open-questions`, `branch-strategy`, `branch`, `base-branch`, **`review-scope`** (default `per-slice` if absent).
3. **Resolve handoff scope** — determines which slice artifacts this handoff covers:
   - **Explicit slice mode**: A slice-slug was passed as the second argument → scope to that one slice only. Use this when each slice ships as its own separate PR. Skip to step 4 using that single slice.
   - **Aggregate mode** (default — no second argument): Read `03-slice.md`. Collect every slice entry with `status: complete` or `status: in-progress`. These are the slices on the feature branch being handed off. If no complete/in-progress slices exist → STOP: "No implemented slices found. Run `/wf implement <slug> <slice>` first."
4. **Check prerequisites for each slice in scope** (branches on `review-scope`):

   In **all modes**: `05-implement-<slice-slug>.md` must exist for every slice in scope. List any missing and STOP: "Run `/wf implement <slug> <slice>` for each missing slice."

   **Per-slice review mode** (`review-scope: per-slice` or absent):
   - `07-review-<slice-slug>.md` must exist for every slice in scope. List any missing and STOP: "Run `/wf review <slug> <slice>` for each missing slice — every slice in the handoff scope must have its own review."
   - For each `07-review-<slice-slug>.md`, parse the `verdict:` and `metric-findings-blocker:` fields in the YAML frontmatter. If ANY slice's verdict is `dont-ship`, or any slice has `metric-findings-blocker > 0` with no resolution recorded in `## Fix Status`, STOP. Print the offending slice slug(s) and tell the user to resolve via `/wf implement <slug> <slice> reviews` first.

   **Slug-wide review mode** (`review-scope: slug-wide`):
   - A single `07-review.md` must exist. If missing → STOP: "Run `/wf review <slug>` first."
   - Parse the `verdict:` and `metric-findings-blocker:` fields in `07-review.md` frontmatter. If `verdict: dont-ship`, or `metric-findings-blocker > 0` with no resolution recorded in the file's `## Fix Status` section, STOP. Print the count and tell the user to resolve via `/wf implement <slug> <slice> reviews` first (slice argument is required even in slug-wide review mode because fixes still happen per slice).

   In all modes: If `current-stage` in the index is already past handoff → WARN before overwriting.
5. **Read full context:**
   - `02-shape.md` — overall spec and docs plan
   - `03-slice.md` — master index (slice statuses)
   - For each slice in scope: `03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`, `06-verify-<slice-slug>.md` (if exists). Plus `07-review-<slice-slug>.md` if `review-scope: per-slice`.
   - If `review-scope: slug-wide`: read the single `07-review.md` (review verdict and all findings for the whole branch).
   - `po-answers.md`
6. **Read augmentation context (optional — surfaces all augmentation work for the reviewer):**
   Read `02b-design.md` and `02c-craft.md` if present for register, anti-goals, and visual contract. The mock fidelity inventory items are user-visible changes the PR description should highlight (translated to product language).

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

   Do NOT cite workflow artifact paths or sub-command names in any external-facing field of the handoff package or PR.
7. **Carry forward** `open-questions` from the index.

# Purpose
Turn the completed and reviewed work into a PR-ready handoff package with reviewer and QA context.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time. Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Use AskUserQuestion** for multiple-choice PO questions (structured decisions, confirmations). Use freeform chat for open-ended questions. Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.
- **Conditional inputs are mandatory when present.** If any file listed in the *Conditional inputs* row of this command's preamble exists on disk, you MUST read it and the stage's output MUST honor it as described. Existence is what's optional; consumption is required. Silent omission of a present artifact is a workflow contract violation, not a permitted shortcut.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

Do this in order:
1. **Read branch strategy** from `00-index.md` frontmatter: `branch-strategy`, `branch`, `base-branch`. Also read the optional PR-readiness config keys (silent skip if absent): `public-surface`, `docs-mirror`, `review-bots` — see `## Project-level handoff config` below.
2. **Create task list.** Use TaskCreate for the handoff sequence. All metadata: `{ slug, stage: "handoff", slices: "<comma-separated list of slice-slugs in scope>", mode: "<aggregate|single-slice>" }`.
   - T1: `subject: "Read prior artifacts"`, `activeForm: "Reading workflow artifacts"`.
   - T2: `subject: "Write handoff summary"`, `activeForm: "Writing handoff summary"`, `addBlockedBy: ["T1"]`.
   - T3: `subject: "Generate Diátaxis docs"`, `activeForm: "Generating documentation"`, `addBlockedBy: ["T2"]`. If `docs-needed: false`, this task will be deleted in step 5.
   - T3.5: `subject: "Commitlint pass"`, `activeForm: "Linting commit messages"`, `addBlockedBy: ["T3"]`. If no commitlint config is detected, will be deleted in step 5b.
   - T3.6: `subject: "Public-surface drift check"`, `activeForm: "Checking public-surface drift"`, `addBlockedBy: ["T3.5"]`. If `00-index.md` has no `public-surface:` block, will be deleted in step 5c.
   - T3.7: `subject: "Doc-mirror regen"`, `activeForm: "Regenerating doc mirrors"`, `addBlockedBy: ["T3.6"]`. If `00-index.md` has no `docs-mirror:` block, will be deleted in step 5d.
   - T4: `subject: "Push branch to remote"`, `activeForm: "Pushing branch"`, `addBlockedBy: ["T3.7"]`. If `branch-strategy` is not `dedicated` or `shared`, will be deleted.
   - T5: `subject: "Create or update pull request"`, `activeForm: "Creating/updating PR"`, `addBlockedBy: ["T4"]`. If `branch-strategy` is not `dedicated`, will be deleted.
   - T5.1: `subject: "PR comment triage"`, `activeForm: "Triaging PR comments"`, `addBlockedBy: ["T5"]`. If `branch-strategy` is not `dedicated` or no PR exists, will be deleted in step 7b.
   - T5.2: `subject: "Rebase onto base"`, `activeForm: "Rebasing onto base"`, `addBlockedBy: ["T5.1"]`. If `branch-strategy` is not `dedicated`, will be deleted (shared branches cannot be force-pushed).
   - T5.3: `subject: "Live PR readiness check"`, `activeForm: "Checking live PR readiness"`, `addBlockedBy: ["T5.2"]`. If `branch-strategy` is not `dedicated`, will be deleted.
   - T6: `subject: "Write 08-handoff.md"`, `activeForm: "Writing handoff artifact"`, `addBlockedBy: ["T5.3"]`.
3. Mark T1 `in_progress`. Read all prior artifacts needed for the summary. Mark T1 `completed`.
4. Mark T2 `in_progress`. Summarize the problem, solution, affected areas, verification evidence, risks, and follow-ups in reviewer-friendly language. Mark T2 `completed`.
5. Mark T3 `in_progress`. **Documentation generation (Diátaxis):**
   a. Read `02-shape.md` and check the `## Documentation Plan` section and `docs-needed` / `docs-types` frontmatter.
   b. If `docs-needed: true`, for each identified doc type, load the matching primitive reference from the `wf-docs` skill and follow it verbatim. Each primitive contains the full Diátaxis discipline for its quadrant — structure, writing rules, anti-patterns, and final self-check.

      | `docs-types` value | Primitive reference to load |
      |---|---|
      | `reference` | `${CLAUDE_PLUGIN_ROOT}/skills/wf-docs/reference/reference.md` |
      | `how-to` | `${CLAUDE_PLUGIN_ROOT}/skills/wf-docs/reference/how-to.md` |
      | `tutorial` | `${CLAUDE_PLUGIN_ROOT}/skills/wf-docs/reference/tutorial.md` |
      | `explanation` | `${CLAUDE_PLUGIN_ROOT}/skills/wf-docs/reference/explanation.md` |
      | `readme` or `readme-update` | `${CLAUDE_PLUGIN_ROOT}/skills/wf-docs/reference/readme.md` |

      Treat the loaded primitive as authoritative for that doc type. Pass the feature context (from the handoff summary, shape, and verification artifacts) to the primitive as the writing target.
   c. For each doc, respect Diátaxis boundaries — do NOT mix types. If a doc would need to cover both "how to" and "reference", split into two files.
   d. Write generated docs to the appropriate location in the repo (as identified in the shape's docs plan). If no location was specified, write to `docs/` or update the existing file.
   e. Include the doc paths in `## Documentation Changes` in the handoff file.
   f. If `docs-needed: false` or no docs plan exists, `TaskUpdate(T3, status: "deleted")`. Note "No documentation changes" in the handoff.
   g. Mark T3 `completed` (if not deleted).

5b. **T3.5 — Commitlint pass.** Mark T3.5 `in_progress`.
   a. Detect commitlint config: look for `.commitlintrc`, `.commitlintrc.json`, `.commitlintrc.yaml`, `.commitlintrc.js`, `commitlint.config.js`, or `commitlint.config.cjs` at repo root. If none exist, `TaskUpdate(T3.5, status: "deleted")` and set `commitlint-status: skipped` in handoff frontmatter; skip 5b.
   b. Resolve `merge-base`: `git merge-base HEAD origin/<base-branch>`.
   c. Run `npx commitlint --from <merge-base> --to HEAD` (or `pnpm commitlint ...` / `yarn commitlint ...` matching the project's package manager). Capture output.
   d. Classification:
      - All commits pass → `commitlint-status: pass`
      - Any commit contains `BREAKING CHANGE` footer or `!:` in subject → `commitlint-status: warn` (record breaking commits in `## Reviewer Focus Areas`; do NOT block)
      - One or more commits violate the config → `commitlint-status: fail`. STOP. Print the violating commits and ask the user to amend (do NOT auto-fix).
   e. Mark T3.5 `completed`.

5c. **T3.6 — Public-surface drift.** Mark T3.6 `in_progress`.
   a. Read `public-surface:` block from `00-index.md` frontmatter. If absent, `TaskUpdate(T3.6, status: "deleted")` and set `public-surface-drift: skipped`; skip 5c.
   b. Capture pre-state: `git diff --quiet HEAD -- <files>` (using `public-surface.files`); record clean/dirty.
   c. Execute `public-surface.regen-cmd`. Wait for completion.
   d. Re-check `git status` against the `files` list:
      - No changes → `public-surface-drift: none`
      - Files changed AND they were clean before → regen produced new surface; stage + commit `chore(api): regenerate <kind> surface mirror` → `public-surface-drift: regenerated`
      - Files changed AND they were dirty before → drift exists with no regeneration committed in the branch → `public-surface-drift: drift-without-regen`. STOP. Tell the user the public surface drifted and the regen output disagrees with the staged version; ask them to reconcile via `/wf implement <slug> <slice>` before re-running handoff.
   e. Record the regen-cmd output summary in `## Reviewer Focus Areas` if the kind is `kotlin-api`, `openapi`, `graphql-schema`, `typescript-dts`, or `sql-ddl` — these are surfaces reviewers should explicitly check.
   f. Mark T3.6 `completed`.

5d. **T3.7 — Doc-mirror regen.** Mark T3.7 `in_progress`.
   a. Read `docs-mirror:` block from `00-index.md` frontmatter. If absent, `TaskUpdate(T3.7, status: "deleted")` and set `docs-mirror-status: skipped`; skip 5d.
   b. Execute `docs-mirror.regen-cmd`. Wait for completion.
   c. Check `git status` for changes under `docs-mirror.mirror-paths`:
      - No diff → `docs-mirror-status: up-to-date`
      - Diff present → stage the changed mirror paths and commit `docs: regenerate doc mirrors` → `docs-mirror-status: regenerated`
   d. Mark T3.7 `completed`.

6. If release behavior depends on current external platform guidance or vendor changes, run a targeted freshness pass.
7. Mark T4 `in_progress`. **Push and create-or-update PR (if `branch-strategy` is `dedicated`):**
   a. Confirm you are on the workflow branch (`branch` field). If not, `git checkout <branch>`.
   b. Push the branch to remote: `git push -u origin <branch>`.
   c. Mark T4 `completed`. Mark T5 `in_progress`.
   d. **PR existence check (idempotent):** Run `gh pr list --head <branch> --json number,url,state --limit 1`. Three cases:
      - **No PR exists** → Run `gh pr create`:
        - Title: best PR title from the handoff summary
        - Body: full handoff summary (Summary, Problem, Solution, Affected Areas, Verification Evidence, Risks, Follow-Up Work, Reviewer Focus Areas), formatted as the PR description
        - Base: `<base-branch>` from the index
        - Do NOT merge. The PR is for review.
      - **PR exists, state=OPEN** → Run `gh pr edit <pr-number> --body-file <tmp-file>` to refresh the PR body with the current handoff summary. Title is left as-is unless it materially mismatches.
      - **PR exists, state=CLOSED|MERGED** → STOP. The branch's prior PR is closed; ask the user whether to reopen it (`gh pr reopen <pr-number>`), open a new one (delete `pr-number` from `00-index.md` then re-run), or treat the workflow as already shipped (route to `/wf retro <slug>`).
   e. **PR template checkbox sweep.** If `.github/PULL_REQUEST_TEMPLATE.md` exists, cross-reference its checkboxes against the handoff state and tick the ones the artifact provides evidence for (e.g., "Tests pass" if `06-verify-*.md` shows green; "Docs updated" if `docs-generated:` is non-empty). Do not tick checkboxes the artifact does not justify.
   f. Record the PR URL and number. Update `00-index.md` with `pr-url` and `pr-number`. Mark T5 `completed`.
   - If `branch-strategy` is `shared`: Push the branch but do NOT create a PR automatically — note in the handoff that the user should create the PR manually or use the handoff content. `TaskUpdate(T5, status: "deleted")`. `TaskUpdate(T5.1, status: "deleted")`. `TaskUpdate(T5.2, status: "deleted")` (no force-push on shared branches). Mark T4 `completed`. T5.3 still runs if a `pr-number` is recorded.
   - If `branch-strategy` is `none`: Skip push/PR entirely. `TaskUpdate(T4, status: "deleted")`, `TaskUpdate(T5, status: "deleted")`, `TaskUpdate(T5.1, status: "deleted")`, `TaskUpdate(T5.2, status: "deleted")`, `TaskUpdate(T5.3, status: "deleted")`. The handoff document is the deliverable.

7b. **T5.1 — PR comment triage loop.** See the dedicated section `## PR comment triage (T5.1)` below for the full loop. Mark T5.1 `in_progress` before entering the loop, `completed` on exit, and record the loop's outcome in handoff frontmatter (`triage-iterations`, `triage-fixes-applied`, `triage-fixes-skipped`, `triage-deferred-thread-ids`, `has-deferred-comments`). Skip this step entirely if `branch-strategy` is not `dedicated` or no `pr-number` was recorded.

7c. **T5.2 — Rebase onto base.** Mark T5.2 `in_progress` (only when `branch-strategy: dedicated`).
   a. Fetch latest base: `git fetch origin <base-branch>`.
   b. Determine fast-forward eligibility: `git merge-base --is-ancestor origin/<base-branch> HEAD` exits 0 → already up-to-date → `rebase-status: fast-forward`; record `rebase-onto-sha: <git rev-parse origin/<base-branch>>` and skip to step 7d.
   c. Otherwise rebase: `git rebase origin/<base-branch>`.
      - **Conflicts** → `rebase-status: conflicts`. Run `git rebase --abort`. STOP. Print the conflicting files. Recommend `/wf implement <slug> <slice>` to resolve. Set `readiness-verdict: blocked` in handoff frontmatter and proceed to step 9 (update index, write artifact). T5.3 stays pending.
      - **Clean** → `git push --force-with-lease origin <branch>`. If `--force-with-lease` fails (lease moved during T5.1 triage), re-fetch and retry once. If the second attempt also fails, set `rebase-status: lease-failure` and STOP — recommend re-running handoff. Otherwise `rebase-status: rebased-clean`; record `rebase-onto-sha`.
   d. Mark T5.2 `completed`.

7d. **T5.3 — Live PR readiness check.** Mark T5.3 `in_progress` (only when `pr-number` is recorded).
   a. Run `gh pr view <pr-number> --json reviewDecision,statusCheckRollup,mergeable,mergeStateStatus`.
   b. Record into handoff frontmatter:
      - `live-review-decision`: from `.reviewDecision` (`APPROVED` | `CHANGES_REQUESTED` | `REVIEW_REQUIRED` | null)
      - `live-checks-failing`: list of `name` from `.statusCheckRollup[]` where `conclusion` ∈ {`FAILURE`, `CANCELLED`, `TIMED_OUT`, `ACTION_REQUIRED`}
      - `live-checks-pending`: list of `name` from `.statusCheckRollup[]` where `status` ∈ {`QUEUED`, `IN_PROGRESS`, `PENDING`}
   c. Compute `readiness-verdict`:
      - `ready` — `live-review-decision` ∈ {`APPROVED`, `null` if no reviewers required}, `live-checks-failing` is empty, `commitlint-status` ≠ `fail`, `public-surface-drift` ≠ `drift-without-regen`, `rebase-status` ∈ {`fast-forward`, `rebased-clean`, `skipped`}, `has-deferred-comments` is `false`.
      - `awaiting-input` — there are pending checks, deferred comments, or required reviewers haven't responded. Not blocked but not green either.
      - `blocked` — anything that hard-fails the criteria above (failing checks, requested-changes review, drift without regen, rebase conflicts, deferred 🔴 blockers).
   d. Mark T5.3 `completed`.

8. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
9. Update `00-index.md` accordingly.
10. Mark T6 `in_progress`. Write `.ai/workflows/<slug>/08-handoff.md`. Mark T6 `completed`.

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the handoff and present the user with ALL viable options:

**Option A (default): Ship** → `/wf ship <slug>`
Use when: The PR is created, all complete slices are covered, and the work needs deployment planning, rollout strategy, and rollback guidance.

**Option B: Skip to Retro** → `/wf retro <slug>`
Use when: Shipping is handled entirely outside this workflow (e.g., CI/CD auto-deploys on merge, or shipping is someone else's responsibility). The handoff document IS the final deliverable.

**Option C: Implement remaining slices first** → `/wf plan <slug> <next-slice>` or `/wf implement <slug> <next-slice>`
Use when: `03-slice.md` shows slices still in `status: defined` that belong on this branch. Implement them, then re-run `/wf handoff <slug>` to update the PR description with the full picture. Do NOT ship until all intended slices are complete.

**Option D: Fix** → `/wf implement <slug> <selected-slice>`
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
status: complete
stage-number: 8
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
pr-title: "<suggested PR title>"
pr-url: "<url or empty if branch-strategy is not dedicated>"
pr-number: <N or 0>
branch: "<branch name>"
base-branch: "<target branch>"
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
next-invocation: "/wf ship <slug>"
---
```

# Project-level handoff config (read from `00-index.md` frontmatter)

The PR-readiness block (T3.5/T3.6/T3.7/T5.1) is driven by optional config keys in the workflow's `00-index.md`. Each key's block is independent — handoff skips the corresponding step silently if the key is absent. Authored by `/wf-meta amend index` or `/wf-quick setup`; can be edited directly.

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

# Optional. Overrides the default review-bots list used by T5.1 (PR comment triage).
# Default if absent: [coderabbitai, greptile-dev, gemini-code-assist, "chatgpt-codex-connector[bot]"]
review-bots:
  - <login>
  - ...
```

# PR comment triage (T5.1)

This is the body of step 7b. T5.1 is a **bounded loop**, not a one-shot pass. It runs until either no unresolved 🔴 blockers remain or the user opts to defer. Skip this section entirely when `branch-strategy ≠ dedicated` or no `pr-number` is recorded.

## Loop bound

Maximum **5 iterations**. After the bound, set `readiness-verdict: awaiting-input` and STOP. This avoids infinite ping-pong with bots that re-comment after every fix.

## Default review-bots list

Used to distinguish bot reviews (often more aggressive on style) from human reviewers. Override per-project via the `review-bots:` key in `00-index.md`.

```
coderabbitai
greptile-dev
gemini-code-assist
chatgpt-codex-connector[bot]
```

Add `[bot]` suffix only for GitHub App accounts whose login carries it.

## Iteration

For each iteration N (1..5):

### 1. Fetch unresolved review threads

Use `gh api graphql` with this query (replace `<owner>`, `<repo>`, `<pr-number>`):

```graphql
query {
  repository(owner: "<owner>", name: "<repo>") {
    pullRequest(number: <pr-number>) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          path
          line
          comments(first: 50) {
            nodes { id author { login } body createdAt }
          }
        }
      }
    }
  }
}
```

Filter `nodes` to those with `isResolved == false`. Capture `{ threadId, author, file, line, body }` for each.

### 2. Fetch top-level PR comments and formal review submissions

```bash
gh pr view <pr-number> --json comments,reviews
```

Top-level comments live under `.comments[]`; formal review bodies live under `.reviews[]` (with `.state` ∈ {`COMMENTED`, `APPROVED`, `CHANGES_REQUESTED`, `DISMISSED`}). Top-level comments are not resolvable via API; capture them for the triage table only.

### 3. Classify each comment

| Severity | Trigger heuristics |
|---|---|
| 🔴 **Blocking** | A reviewer marked `CHANGES_REQUESTED`; a finding mentions correctness, crash, security, data loss, missing migration, breaking API change without bump; bot output flagged with severity ≥ "high"; comment body contains "must fix", "blocker", or "do not merge". |
| 🟡 **Suggestion** | Style, naming, doc gap, test gap, refactor recommendation, nit-with-merit, performance hint without measured regression. |
| 🟢 **Informational** | Walkthrough/summary, praise, declined-nit acknowledgment, FYI, "considered alternatives" notes. |

When ambiguous, prefer the more severe class. Bots producing very long walkthrough summaries should not auto-elevate to 🔴 — read the actual finding text.

### 4. Report the triage table to the user

```
| Source | File:Line | Severity | Summary | Recommended action |
```

`Source` is the reviewer login (or `<login> [bot]` for bot accounts). `Summary` is one short sentence in product language (per External Output Boundary — do not cite workflow artifact paths in the summary, even though the table is internal).

### 5. Address 🔴 blockers

For each 🔴 thread:
- Hand off to `/wf implement <slug> <slice> reviews` with the thread context as a sub-invocation. The implement-reviews mode is responsible for reading the thread, applying the fix, committing, and returning the resulting commit SHA.
- Record `{ threadId, fix-sha }` for the resolve step in 7.

If the user has a strong reason to decline a 🔴 (e.g., the bot is wrong about correctness) and confirms via AskUserQuestion, route to "deferred" and add `threadId` to `triage-deferred-thread-ids`. Set `has-deferred-comments: true`.

### 6. Address 🟡 suggestions

Use a single AskUserQuestion call (multi-select) listing all 🟡 items:

```yaml
question: "Which suggestions should we apply now?"
header: "Suggestions"
options:
  - label: "<short summary> (<source>)"
    description: "<file:line> — apply | defer | decline"
  - ...
multiSelect: true
```

For selected ones: route through the same `/wf implement <slug> <slice> reviews` path. For unselected: ask in a freeform chat round whether to **defer** (keep open, add to `triage-deferred-thread-ids`) or **decline** (resolve the thread with a brief decline rationale recorded in the comment via `gh pr comment`).

### 7. Push fixes and resolve threads

After all selected fixes commit:
- `git push origin <branch>` (regular push within the dedicated branch).
- For each `{ threadId, fix-sha }` whose fix landed: run the `resolveReviewThread` GraphQL mutation:

```graphql
mutation {
  resolveReviewThread(input: { threadId: "<threadId>" }) {
    thread { id isResolved }
  }
}
```

Do NOT resolve a thread whose fix was deferred or declined — those stay open with the deferral/decline rationale in a fresh `gh pr comment`.

### 8. Re-fetch and decide loop continuation

Re-run step 1. Compare the fresh unresolved-thread set against the prior iteration's:
- Empty → exit loop, set `readiness-verdict` per T5.3's logic.
- Has new 🔴 (bot re-commented or human added) → loop again (iteration N+1).
- Has only 🟢/🟡 already triaged this run → exit loop.

## Exit conditions

| Condition | Frontmatter outcome |
|---|---|
| No unresolved 🔴 AND user has triaged every 🟡 | `readiness-verdict` decided in T5.3 (likely `ready` or `awaiting-input`) |
| User chose "defer remaining" | `has-deferred-comments: true`; verdict `awaiting-input` unless 🔴 deferred → `blocked` |
| 5-iteration bound hit | `readiness-verdict: awaiting-input`. STOP. Tell the user the loop terminated by bound. |

## Frontmatter contract

After the loop completes:

```yaml
triage-iterations: <N actual iterations run>
triage-fixes-applied: <count of 🔴+🟡 that landed via implement reviews>
triage-fixes-skipped: <count of 🟡 declined or 🔴 deferred>
triage-deferred-thread-ids: [<id>, ...]
has-deferred-comments: <true if any thread is still unresolved>
```

🟢 informational comments are summarised in the artifact's `## Reviewer Comments Triaged` table with action `noted`. They are never resolved (top-level PR comments are not threadable via API).

# Handoff

## PR Title Options
1. ...

## Summary

## Problem

## Solution

## Augmentations Applied (only if `augmentations:` list is non-empty)
List every augmentation in user-facing language. Do NOT cite workflow artifact paths or sub-command names — translate per the External Output Boundary. Group by category for readability:

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
- **Option A (default):** `/wf ship <slug>` — [reason]
- **Option B:** `/wf retro <slug>` — skip ship [reason, if applicable]
- **Option C:** `/wf plan <slug> <next-slice>` or `/wf implement <slug> <next-slice>` — implement remaining slices before shipping [reason, if applicable]
- **Option D:** `/wf implement <slug> <slice>` — fix issue found while writing handoff [reason, if applicable]
