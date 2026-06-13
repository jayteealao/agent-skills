---
description: Intelligent review dispatch. Reads workflow artifacts and diff, selects relevant review commands, spawns one parallel sonnet sub-agent per command (each writes its findings to file), then aggregates, deduplicates, and triages findings via AskUserQuestion into a unified review verdict. Re-run with "triage" to revisit deferred findings.
argument-hint: <slug> [slice | triage]
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-review`, **stage 7 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → `7·review` → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires (per-slice mode) | `02-shape.md`, `03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`, `06-verify-<slice-slug>.md` (recommended) |
| Requires (slug-wide mode) | `02-shape.md`, `03-slice.md`, and at least one `05-implement-<slice>.md`. Reads every present per-slice implement/verify file for context. |
| Conditional inputs (mandatory when present) | `02b-design.md`, `02c-craft.md`, `04b-instrument.md`, `04c-experiment.md`, `05c-benchmark.md`, `07-design-audit.md`, `07-design-critique.md`, `augmentations:` list in `00-index.md` — every artifact that exists MUST be checked by the relevant review (e.g., 02c-craft.md anti-goals MUST be honored; 04b-instrument.md signals MUST be present; 05c-benchmark.md baseline MUST not regress; every augmentation MUST get a type-specific re-check). |
| Produces (per-slice mode) | `07-review-<slice-slug>.md` + `07-review-<slice-slug>-<command>.md` per selected command (per-slice scoping — running review on a different slice does NOT overwrite a sibling slice's files) |
| Produces (slug-wide mode) | `07-review.md` + `07-review-<command>.md` per selected command (single set per workflow — re-running review overwrites). Sibling per-slice review files (if any from prior runs) are left untouched. |
| Next | `/wf handoff <slug>` (when `convergence: not-needed` or `converged` and `verdict: ship`/`ship-with-caveats` + all slices complete). When `convergence: escalated`: re-invoke `/wf review <slug> [<slice>]` for a second round, or escalate to `/wf implement <slug> [<slice>] reviews` as a manual escape. Also: `/wf plan <slug> <next-slice>` (if more slices remain), `/wf-meta amend <slug> from-review` (if spec was wrong), or `/wf-meta extend <slug> from-review` (if new scope needed). |

# CRITICAL — execution discipline
You are a **review dispatch orchestrator that also owns its own triage→fix loop**.
- Do NOT run the reviews yourself — you **select review commands and dispatch sub-agents**. Each review sub-agent runs one review command independently and reports findings.
- Do NOT improvise fixes while review sub-agents are running. The fix loop runs only at Step 4c, AFTER aggregation and AFTER user triage at Step 4b.
- At Step 4c you own a **single-round, user-gated fix loop**: every finding marked `Fix` by the user at Step 4b spawns a fix sub-agent that applies the minimal patch. After all `Fix` sub-agents return, you write the consolidated review artifact with `## Fix Status`.
- ONE round only. Re-review after fixes requires the user to re-invoke `/wf review`. Verify-after-fixes requires the user to re-invoke `/wf verify`. Do not auto-loop in this invocation.
- Do NOT handoff or ship — those are later stages.
- Your job is: **orient → gather change stats → select commands → dispatch review sub-agents → aggregate → triage → dispatch fix sub-agents for `Fix` decisions → write verdict and Fix Status**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- If you catch yourself about to start reviewing code directly, STOP — spawn a review sub-agent instead. If you catch yourself about to fix code outside the Step 4c fix-sub-agent dispatch, STOP — the fix loop only runs at Step 4c.

# TRIAGE MODE

If the second argument is `triage` (e.g., `/wf review my-feature triage`), skip the full review and jump directly to re-triage:

1. **Resolve slug** from the first argument. Read `00-index.md` for `review-scope` and `selected-slice`.
   - If `review-scope: slug-wide` → the target file is `07-review.md`. Ignore any third-argument slice selector.
   - If `review-scope: per-slice` → If a slice slug is the third argument (e.g., `/wf review my-feature triage auth-flow`), use it; otherwise use `selected-slice`. If neither is set, ask the user which slice to triage. Target file is `07-review-<slice-slug>.md`.
2. **Read the target review file** — parse the `## Triage Decisions` section. Collect all findings marked `deferred` or `untriaged`.
3. **If no findings to triage** → print "No deferred or untriaged findings. Run `/wf review <slug> [<slice>]` for a full review." and STOP.
4. **Present for triage via AskUserQuestion** — follow the same protocol as Step 4b below, but only show `deferred` and `untriaged` findings.
5. **Update the target review file** — overwrite the `## Triage Decisions` section with updated decisions. Update `## Recommendations` to reflect new fix/defer/dismiss counts. Preserve all other sections.
6. **Print summary** — show counts of fix/defer/dismiss and list findings newly marked for fixing.

Then STOP — do not continue to the full review workflow.

---

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector** (per-slice mode only — ignored in slug-wide mode). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`, **`review-scope`**.
3. **Resolve `review-scope`**: Read the `review-scope` field from `00-index.md` frontmatter. Default to `per-slice` if the field is absent (back-compat with pre-v9.x workflows).
   - If `review-scope: per-slice` → continue with the slice-resolution step below. All artifact paths in this run use the `-<slice-slug>` suffix.
   - If `review-scope: slug-wide` → **skip slice resolution entirely**. There is no `<slice-slug>` for this run. All artifact paths drop the slice suffix (`07-review.md`, `07-review-<command>.md`). Re-running review under this mode overwrites the prior `07-review.md` — that is the intended behavior. The reviewed diff is the cumulative branch diff (`git diff <base-branch>...HEAD`), not a per-slice diff. Note: slug-wide reviews findings reflect *all code currently on the branch*, including any partially-implemented or in-progress slices; the verdict is "ship this branch" rather than "ship this slice".
4. **Resolve the slice-slug** (per-slice mode only — skip this step if `review-scope: slug-wide`): If a slice-slug was passed, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
5. **Check prerequisites (workflow-type-aware AND review-scope-aware):**
   Read `workflow-type` from `00-index.md`. Recognize three modes:
   - **Compressed mode** (`workflow-type: quick`): the implement record is `05-implement.md` (no slice slug). Acceptance criteria source is `01-quick.md`. No per-slice plan/slice files exist.
   - **Forwarded mode** (`workflow-type: rca` / `investigate`): rich context lives in `01-rca.md` / `01-investigate.md`; `02-shape.md` is synthesized; `04-plan.md` exists if planning ran.
   - **Standard mode**: per-slice files (`03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`).

   In all modes, an implement record (slice or master) must exist. If missing → STOP. Tell the user: "Run `/wf implement <slug>` first."

   **Per-slice mode** (`review-scope: per-slice`):
   - `06-verify-<slice-slug>.md` (or `06-verify.md`) is recommended but not strictly required — review can proceed without it if verify was skipped.
   - If verify shows `Status: Awaiting input` → STOP.
   - If `07-review-<slice-slug>.md` already exists for the resolved slice → WARN before overwriting that file. Sibling slices' review files are never touched.

   **Slug-wide mode** (`review-scope: slug-wide`):
   - For standard mode workflows, **at least one** `05-implement-<slice-slug>.md` must exist. If `03-slice.md` lists multiple slices with `status: complete` but only some have implement records, WARN: "Slug-wide review covers the entire branch diff. Slices without implement records are: <list>. Their code may still appear in the diff; their acceptance criteria will not be checked."
   - Any present `06-verify-*.md` files are read for context but never block.
   - If `07-review.md` already exists → WARN before overwriting. Per-slice `07-review-<slice>.md` files (if any from prior per-slice runs) are left untouched.
6. **Read the full context:**

   **Per-slice mode** — read the slice's context:
   - `03-slice-<slice-slug>.md` — acceptance criteria and scope
   - `04-plan-<slice-slug>.md` — what was planned
   - `05-implement-<slice-slug>.md` — what was built
   - `06-verify-<slice-slug>.md` (if exists) — verification results
   - `02-shape.md` — overall spec
   - `03-slice.md` — master slice index (for sibling context)
   - `po-answers.md`

   **Slug-wide mode** — read every slice's context plus shape:
   - `02-shape.md` — overall spec (primary acceptance criteria source)
   - `03-slice.md` — master slice index (lists every slice)
   - For every slice listed in `03-slice.md`: `03-slice-<slice>.md`, `04-plan-<slice>.md` (if present), `05-implement-<slice>.md` (if present), `06-verify-<slice>.md` (if present)
   - `po-answers.md`
7. **Read augmentation context (optional — workflow may have any combination):**
   Read the `augmentations:` list in `00-index.md` if present, plus the artifacts each entry references. Per-type guidance:

   | Type | What review must do |
   |---|---|
   | `design-<sub>` | Read `design-notes/<sub>-<timestamp>.md`. The documented design changes are intentional — do NOT flag them as unexpected. Validate them: did they achieve their stated goal? |
   | `design-audit` | Read `07-design-audit.md`. Treat as already-known findings; merge with new findings during dispatch. |
   | `design-critique` | Read `07-design-critique.md`. Same as above. |
   | `instrument` | Read `04b-instrument.md`. Review the instrumentation as a first-class deliverable: are signals appropriate, is PII handled, is the framework usage correct? |
   | `experiment` | Read `04c-experiment.md`. Review the experiment infrastructure: is the cohort logic correct, are metrics appropriate, is the rollback path safe? |
   | `benchmark` | Read `05c-benchmark.md`. Cross-reference with `06-verify` compare-mode results. If verify flagged regressions, surface them as review findings. |

   Also read `02b-design.md` and `02c-craft.md` if present for register, anti-goals, and visual contract — review must check anti-goals were honored.

   Cross-reference `06-verify-<slice-slug>.md` (per-slice mode) or every `06-verify-*.md` file (slug-wide mode). Mandatory reads from each verify artifact:
   - `## Augmentation Verification` — failed augmentation re-checks become BLOCKER or HIGH findings automatically.
   - `stability-check-flaky-count` (frontmatter) — any value > 0 is a HIGH finding; flaky criteria indicate race conditions or state leakage that review sub-agents should investigate in the diff.
   - `adversarial-tests-failed` (frontmatter) — any value > 0 means `## Adversarial Tests` contains BLOCKER or HIGH findings; surface them in the aggregated finding list.
   - `cross-browser-delta` (frontmatter) — if `findings`, read `## Cross-Browser Delta` and surface each divergence as a HIGH compatibility finding.
   - `web-vitals-inp-ms` (frontmatter) — if > 200, surface as a HIGH performance finding; `web-vitals-lcp-ms` > 2500 and `web-vitals-cls` > 0.1 are WARN.
   - `## Friction Notes` and `## Free Exploration Notes` — these are informational (not auto-promoted to issues) but must appear in the review's `## Soft Findings` or `## Reviewer Notes` section so the human reviewer can see them. They represent observations a first-time user would notice that no AC captured.
8. **Carry forward** `open-questions` from the index.
9. **Branch check:** Read `branch-strategy` and `branch` from `00-index.md`. If `branch-strategy` is `dedicated`, confirm you are on the correct branch. Review diffs must be generated against the implementation branch. Use `git diff <base-branch>...<branch>` to get the full change set for review dispatch.

# Purpose
Intelligent review dispatch. Analyse the change set, select which of the 30 review commands are relevant, launch one parallel sonnet sub-agent per selected command, then aggregate all findings into a unified review verdict.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time. Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.
- **Conditional inputs are mandatory when present.** If any file listed in the *Conditional inputs* row of this command's preamble exists on disk, you MUST read it and the stage's output MUST honor it as described. Existence is what's optional; consumption is required. Silent omission of a present artifact is a workflow contract violation, not a permitted shortcut.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <paths>` (list all review files written)
- `verdict: <Ship / Ship with caveats / Don't Ship>`
- `convergence: <not-needed | converged | escalated>` — include `fix-rounds-run` and a one-line "what the loop did" summary when `convergence != not-needed` (e.g., "converged: 3 of 3 Fix sub-agents patched", "escalated: 1 of 2 could-not-fix")
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed (remaining BLOCKERs only — anything Patched is no longer a blocker)

---

# Task Tracking

After completing Step 2 (command selection), create a task list using TaskCreate before dispatching sub-agents:
- One task per selected review command: `subject: "Review: {command}"`, `activeForm: "Dispatching {command} review"`, `metadata: { slug, stage: "review", slice: "<slice-slug>", command: "{command}" }`.
- Review command tasks are independent — no `addBlockedBy` between them (they run as parallel sub-agents).
- Add bookkeeping tasks:
  - "Aggregate + deduplicate findings" — `addBlockedBy: [all review command tasks]`
  - "Triage findings via AskUserQuestion" — `addBlockedBy: [aggregate task]`
  - "Fix loop (Step 4c)" — `addBlockedBy: [triage task]` — gets `status: deleted` if Step 4b produced zero `Fix` decisions.
  - "Write 07-review-<slice-slug>.md + verdict + Fix Status" — `addBlockedBy: [fix-loop task]`

Inside the fix loop (Step 4c), `TaskCreate` one additional task per `Fix` decision: `subject: "Fix [{ID}] {SEV}: {title}"`, `activeForm: "Fixing [{ID}]"`, `addBlockedBy: ["Fix loop (Step 4c)"]` (parent — the loop coordinates them sequentially). Mark each `completed` (with `description: "COULD NOT FIX: <reason>"` if applicable) before moving to the next.

As each review sub-agent returns its `07-review-<slice-slug>-<command>.md` file: `TaskUpdate(taskId, status: "completed")`.
When starting aggregation: `TaskUpdate(aggregateTaskId, status: "in_progress")`. Mark `completed` when done.
When starting triage: `TaskUpdate(triageTaskId, status: "in_progress")`. Mark `completed` when AskUserQuestion finishes.
When starting the fix loop: `TaskUpdate(fixLoopTaskId, status: "in_progress")`. Mark `completed` when every per-finding fix task is done.
When writing final verdict: `TaskUpdate(writeTaskId, status: "in_progress")`. Mark `completed` when done.

---

# Step 1: Gather Change Statistics

From the relevant implement record(s), extract the files changed and the nature of changes. Also run the diff commands. **The diff scope depends on `review-scope`:**

**Per-slice mode** — diff scope is the working tree (the current slice's in-progress or just-completed changes):

```bash
git diff --name-only HEAD     # Changed file list
git diff --stat HEAD          # Diff stats
git diff HEAD                 # Full diff for pattern analysis
```

**Slug-wide mode** — diff scope is the entire branch since divergence from `base-branch`:

```bash
git diff --name-only <base-branch>...HEAD   # Changed file list
git diff --stat <base-branch>...HEAD        # Diff stats
git diff <base-branch>...HEAD               # Full diff for pattern analysis
```

Substitute `<base-branch>` with the value from `00-index.md` frontmatter (typically `main` or `master`).

Extract:
- **File types changed** — extensions and directory patterns
- **Change size** — total lines added/removed
- **Change type signals** — new files vs modifications vs deletions
- **Content signals** — patterns in the diff (SQL queries, auth checks, migrations, React components, Terraform, etc.)

---

# Step 2: Select Review Commands

Each command maps to `${CLAUDE_PLUGIN_ROOT}/skills/review/reference/<name>.md`.

**Selection philosophy:** Use the shape, slice, and implementation artifacts — not just raw diff patterns — to reason about what this change *is* and what reviews matter. A feature that adds async data fetching needs `backend-concurrency` even if the diff doesn't contain the word "mutex". Lean toward inclusion: a missed relevant review is worse than a redundant one. The max exists to prevent sprawl, not to cap thorough coverage.

### Core (always include for any code change)
- `correctness` — logic, invariants, edge cases
- `security` — vulnerabilities, insecure defaults
- `code-simplification` — missed reuse, unnecessary complexity, inefficiencies

### Always include for any backend source change
(`.ts`, `.js`, `.mjs`, `.py`, `.go`, `.java`, `.cs`, `.rb`, `.php`, `.rs`, `.kt`, `.swift`, `.scala`, `.ex`, `.exs`)
- `testing` — always: new code needs test coverage assessment regardless of whether test files appear in the diff
- `maintainability` — always: new or changed functions need readability and coupling review
- `reliability` — always: error handling, retry logic, graceful degradation, fault tolerance

### Always include for any frontend source change
(`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, `.scss`)
- `accessibility`
- `frontend-accessibility`
- `frontend-performance`
- `ux-copy`

### Include based on what the feature does (reason from shape + slice, not just diff patterns)

**The feature adds or modifies async, concurrent, or parallel behaviour** (async/await, goroutines, threads, Promise chains, event loops, message queues, workers, `@Async`, `CompletableFuture`, `select`, `sync.`, `atomic`, streaming, SSE, WebSocket):
- `backend-concurrency`

**The feature is a refactor, restructure, rename, or extraction** (large deletion-to-addition ratio, shape/slice describes "refactor"/"restructure"/"rename"/"extract"/"move"):
- `refactor-safety`

**The feature introduces new modules, services, packages, or architectural layers** (new directories, new top-level modules, new service files, changed import graphs, new `index.*` files, new `*Service`/`*Repository`/`*Controller` classes):
- `architecture`
- `overengineering` — if the shape describes generic/reusable abstractions or the diff introduces new base classes, generic utilities, or factory patterns

**The feature touches data reads or writes, queries, or caching**:
- `performance` — any DB query, ORM call, loop over a collection, sort/filter/aggregate, cache interaction, or algorithm over variable-size data
- `data-integrity` — any DB write, ORM mutation, transaction, schema change, or data validation

**The feature involves DB migrations** (`migrations/`, `db/migrate/`, `alembic/versions/`, `flyway/`, `*_migration.*`):
- `migrations`
- `data-integrity` (if not already selected)

**The feature handles user data, authentication, or anything privacy-sensitive** (user profiles, auth flows, personal data fields, payment processing, GDPR/CCPA scope, session management, logging in auth/payment paths):
- `privacy`

**The feature adds or changes API surface** (route definitions, OpenAPI/Swagger, REST handlers, GraphQL schemas, gRPC proto, SDK entry points, versioned paths `/v1/`, webhook handlers):
- `api-contracts`

**The feature could affect throughput, queuing, or multi-tenancy at scale** (queue consumers, background jobs, batch operations, fan-out patterns, multi-tenant data isolation, horizontal scaling assumptions):
- `scalability`

**The feature adds or changes dependencies** (`package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, lockfiles, new external imports):
- `supply-chain`

**The feature touches infrastructure** (Dockerfile, `docker-compose.*`, Terraform `*.tf`, Pulumi, Helm, CloudFormation, K8s YAML, Ansible):
- `infra`
- `infra-security`

**The feature modifies CI/CD pipelines** (`.github/workflows/*.yml`, `.gitlab-ci.yml`, Jenkinsfile, Makefile deploy targets):
- `ci`

**The feature involves a release, version bump, or changelog** (CHANGELOG.md, version fields, git tags, release configs):
- `release`

**The feature adds or changes logging behaviour** (log statements, logger config, structured logging setup):
- `logging`

**The feature adds or changes observability** (metrics, OpenTelemetry, Prometheus, alerting rules, health checks):
- `observability`

**The feature makes cloud/API calls that cost money** (cloud SDK calls, paid API integrations, storage operations, AI/ML inference):
- `cost`

**The feature touches documentation** (`*.md`, `*.mdx`, `*.rst`, `docs/`, docstrings):
- `docs`

**Style inconsistencies are visible in the diff** (mixed naming conventions, inconsistent patterns within the same file or module):
- `style-consistency`

**The feature changes developer-facing tooling** (scripts, Makefile, README, CONTRIBUTING, dev environment config):
- `dx`

### Selection Constraints
- **Minimum**: 3 commands (always `correctness` + `security` + `code-simplification`)
- **Maximum**: 15 — raise this limit only if the change genuinely spans many domains; do not artificially cap a thorough review
- **User focus override**: if the user specified a focus ("check security"), always include those + `correctness`; suppress unrelated commands
- **Config/docs-only changes**: drop `correctness`/`backend-concurrency`/`testing`/`code-simplification`; keep `security`, `docs`, relevant infra/release
- **Test-only changes**: keep `testing`, `correctness`, `code-simplification`; drop most others
- **When in doubt, include**: a false positive from an extra review command costs one sub-agent; a missed issue costs a production incident

### Output the Selection (before dispatching)

Print to chat:
```
## Review Scope
- Slug: {slug}
- Slice: {slice}
- Files changed: {N} files, +{added} -{removed} lines
- File types: {list}
- Change signals detected: {list}

## Commands Selected ({N})
1. `{command}` — {reason}
2. `{command}` — {reason}
...
```

---

# Step 3: Dispatch Parallel Sub-Agents (sonnet)

For EACH selected command, spawn a sub-agent **with explicit `model: sonnet`** on the `Task` call. All agents run in parallel. The model parameter is REQUIRED — do not omit it; reviewers must not silently inherit the parent session's model. Each review command runs a single rubric and benefits from Sonnet's judgment without needing Opus-tier reasoning. Synthesis (Step 4 — aggregation, dedup, triage) keeps the parent model.

**Each sub-agent receives this prompt** (substitute the per-slice or slug-wide variant based on the current `review-scope`):

```
Execute the review command at `${CLAUDE_PLUGIN_ROOT}/skills/review/reference/{command-name}.md`.

Scope:
  - Per-slice mode: `git diff HEAD` (working-tree diff for the current slice)
  - Slug-wide mode: `git diff <base-branch>...HEAD` (full branch diff)
Workflow slug: {slug}
Review scope: {review-scope}                              # per-slice or slug-wide
Selected slice: {slice or "(none — slug-wide)"}

Read the command file and follow its WORKFLOW exactly. Perform the review for the given scope.

IMPORTANT: Write your complete review findings to the file:
  - Per-slice: `.ai/workflows/{slug}/07-review-{slice-slug}-{command-name}.md`
  - Slug-wide: `.ai/workflows/{slug}/07-review-{command-name}.md`

Use this structure for the file (YAML frontmatter first, then markdown):

```yaml
---
schema: sdlc/v1
type: review-command
slug: {slug}
review-scope: {per-slice|slug-wide}
slice-slug: {slice or "" if slug-wide}
review-command: {command-name}
status: complete
updated-at: "{timestamp}"
metric-findings-total: {N}
metric-findings-blocker: {N}
metric-findings-high: {N}
result: clean | issues-found | blockers-found
tags: []
refs:
  review-master: {07-review-{slice-slug}.md | 07-review.md}
---
```

# Review: {command-name}

## Findings
| ID | Sev | Conf | File:Line | Issue |
|----|-----|------|-----------|-------|
(all findings with severity BLOCKER/HIGH/MED/LOW/NIT and confidence High/Med/Low)

## Detailed Findings
### {ID}: {Title} [{SEVERITY}]
**Location:** `{file}:{line-range}`
**Evidence:**
```
{snippet}
```
**Issue:** {description}
**Fix:** {suggestion for HIGH+}
**Severity:** {level} | **Confidence:** {High/Med/Low}

## Summary
- Total findings: {N}
- Blockers: {N}
- Status: {Clean / Issues Found / Blockers Found}

Then author the rich siblings next to that `.md` (you hold the findings in context —
do NOT leave this for the orchestrator):
  1. Write `<stem>.yaml` — schema `siblingYamlSchemas.review-dimension` in
     `tests/frontmatter.schema.json` (`artifact: review-dimension`, `dimension`,
     `parent`, `rev`, `verdict`, `summary`, `counts`, `findings`), scoped to THIS
     dimension only. (`<stem>` = the review `.md` filename without `.md`.)
  2. Write `<stem>.html.fragment` — one
     `<section class="fragment-review-dimension" data-artifact="review-dimension">`
     per the per-dimension shape in this reference's Step 5b tail and
     `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_fragment-authoring.md`.
The `post-write-verify` hook BLOCKS (exit 2) the `.md` write when the sibling
`.yaml` is missing — write the `.yaml` first (or in the same turn). If this
dimension found NOTHING material (clean, zero findings), set `fragment: none` in the
`.md` frontmatter instead of authoring an empty fragment.

Write the files, then return a brief summary of what you found.
```

Wait for ALL sub-agents to complete before proceeding.

---

# Step 4: Aggregate and Deduplicate

After all sub-agents finish:

1. **Read every `07-review-<slice-slug>-<command>.md` file** they wrote.
2. **Collect all findings** — every row with an ID, severity, file:line, and description.
3. **Identify duplicates** — two findings are duplicates if:
   - Same `file:line` (or overlapping line range)
   - Same root cause, even if different categories (e.g., missing validation flagged as both "correctness" and "injection vector")
   - One is a symptom and another is the root cause
4. **Merge duplicates:**
   - Keep the highest severity
   - Keep the most specific evidence (longest snippet, most precise line range)
   - Combine category labels (e.g., "Correctness + Security")
   - Keep the most actionable fix
5. **Sort by severity:** BLOCKER → HIGH → MED → LOW → NIT, then alphabetically by file path within each level.
6. **Determine verdict:**
   - Any BLOCKER → **Don't Ship**
   - HIGH issues only → **Ship with caveats** (if the HIGHs are addressable as follow-ups)
   - MED/LOW/NIT only → **Ship**
   - Clean → **Ship**

---

# Step 4b: Triage ALL Findings via AskUserQuestion

After deduplication, present ALL deduplicated findings to the user for triage using AskUserQuestion. This gives the user explicit control over what gets fixed, deferred, or dismissed. **`Fix` decisions execute in Step 4c — they are no longer deferred to a separate `/wf implement reviews` invocation.**

**For BLOCKER and HIGH findings** — present each individually:

Use AskUserQuestion with one question per finding (batch up to 4 per call):
- **header**: the finding ID (e.g., "CR-1", "CS-2", "SEC-3")
- **question**: `"{Source command}: {one-line issue description} at {file}:{line}"`
- Options:
  - `Fix` / label: "Fix now", description: "Spawn a sub-agent to apply the minimal patch in this run (Step 4c)."
  - `Defer` / label: "Defer", description: "Record but do not fix — revisit later via `/wf review <slug> triage`."
  - `Dismiss` / label: "Not an issue", description: "False positive or intentional — record the reason."

**For MED findings** — present as a batch:

Use AskUserQuestion with `multiSelect: true`:
- **header**: "MED findings"
- **question**: "Select which MED findings to fix now (Step 4c will spawn fix sub-agents for the selected ones)"
- Options: one per MED finding, label is `{ID}: {title}`, description is `{file}:{line} — {one-line description}`

MED findings not selected default to `Defer` (recorded but not fixed in this run).

**For LOW and NIT findings** — list in the report but do NOT prompt and do NOT fix in this run.

If there are no findings (all commands returned clean), skip Step 4b and Step 4c — there is nothing to triage and nothing to fix.

---

# Step 4c: Single-round review-owned fix loop

This step runs only if Step 4b produced at least one `Fix` decision. It is bounded to **one round** per invocation — a second round requires the user to re-invoke `/wf review`.

## Snapshot

Before dispatching any fix sub-agent, snapshot:
- `metric-issues-found-initial`: total deduplicated findings count (Step 4 output).
- `metric-fix-decisions`: count of findings triaged `Fix` at Step 4b.

If `metric-fix-decisions == 0`, set `fix-rounds-run: 0`, `convergence: not-needed`, and skip to Step 5.

## Fix dispatch (sequential)

For each finding triaged `Fix`, sequentially (one at a time):
1. `TaskCreate` or `TaskUpdate`: `subject: "Fix [{ID}] {SEV}: {title}"`, `activeForm: "Fixing [{ID}]"`, `metadata: { slug, stage: "review-fix", slice: "<slice-slug or empty>", findingId: "{ID}", severity: "{SEV}", sourceCommand: "{command}" }`.
2. Spawn ONE sub-agent **with explicit `model: sonnet`** on the `Task` call (REQUIRED — do not omit; fix-loop sub-agents must not silently inherit the parent session's model). Sonnet handles read-finding-then-patch-code well without Opus cost. This is the same fix prompt shape used by `/wf implement reviews` mode — kept identical so behavior matches when the user routes through either path:
   ```
   Fix the following review finding in the codebase:

   Finding ID: {ID}
   Source review command: {command}
   Severity: {severity}
   Location: {file}:{line-range}
   Issue: {issue description}
   Suggested fix: {fix suggestion}

   Read the file(s) at the specified location. Understand the issue.
   Apply the minimal fix that resolves the issue without introducing
   new problems. Do NOT change anything beyond what is needed for this
   specific finding. Do NOT refactor. Do NOT broaden scope.

   After fixing, verify your change is correct:
   - The fix addresses the specific issue described
   - No new lint/type/test failures are introduced in the affected files
   - The surrounding code still makes sense

   Return a brief summary of what you changed and whether the fix is confirmed correct.
   ```
3. Wait for the sub-agent to complete.
4. Read the changed file(s) yourself; sanity-check the patch addresses the finding and does not obviously break sibling code.
5. `TaskUpdate(taskId, status: "completed")`. If the sub-agent could not fix, record `description: "COULD NOT FIX: <reason>"` then mark completed — this counts toward `convergence: escalated`.

## Re-review (optional, narrow)

After every `Fix` sub-agent has returned, **do not re-dispatch the full review command set**. That would be a second round and contradicts the one-round contract. Instead:
- For each `Fix` finding whose sub-agent returned successfully, mark it as `fix-result: patched` in the Fix Status table.
- For each `Fix` finding whose sub-agent could not fix, mark it as `fix-result: could-not-fix` and surface it under `## Recommendations → Must Fix (remaining)`.
- Do not re-run the review commands — the user re-invokes `/wf review` for that if they want fresh findings.

## Convergence verdict

Compute `metric-issues-found-final` as `metric-issues-found-initial - (count of Fix decisions with fix-result: patched)`.

| Condition | `convergence:` | `verdict:` |
|---|---|---|
| `metric-fix-decisions == 0` AND `metric-findings-blocker == 0` | `not-needed` | unchanged from Step 4.6 verdict |
| `metric-fix-decisions == 0` AND `metric-findings-blocker > 0` | `not-needed` | `dont-ship` (user explicitly chose not to fix blockers) |
| All `Fix` decisions returned `fix-result: patched` AND no remaining `metric-findings-blocker` | `converged` | `ship` (unless HIGH/MED deferrals warrant `ship-with-caveats`) |
| At least one `Fix` decision returned `fix-result: could-not-fix` OR a deferred BLOCKER remains | `escalated` | `dont-ship` (or `ship-with-caveats` if all remaining are HIGH/MED) |

When `convergence: escalated`:
- Adaptive routing surfaces "Option B: Re-invoke `/wf review` for a second round" (if the user wants to attempt more fixes) and "Option C: `/wf implement` (manual escape)" — never auto-loop.
- The `## Recommendations` body lists every `could-not-fix` finding with the sub-agent's reason attached.

## Commit (only when fixes landed)

If at least one `Fix` sub-agent successfully modified files AND `branch-strategy` is `dedicated` or `shared`:
- Stage every file the fix sub-agents touched.
- Commit with message: `fix(<slug>): review-time fixes for <slice-slug>` (per-slice mode) or `fix(<slug>): review-time fixes` (slug-wide mode).
- Record the commit SHA in the review artifact's `## Fix Status` section.
- Do NOT push.
- If `branch-strategy: none`, skip the commit; the fixes remain in the working tree.

The fix sub-agents and the commit replace the manual `/wf implement <slug> [<slice>] reviews` round-trip for the common case. That mode still exists as a manual escape (e.g., when `convergence: escalated` and the user wants the sequential per-finding fix UI again, or when the user prefers to fix outside the review run).

---

# Step 5: Write Review Files

Write the master artifact. The filename and `refs` block depend on `review-scope`:

- **Per-slice mode** → `07-review-<slice-slug>.md`
- **Slug-wide mode** → `07-review.md` (no slice suffix; overwrites any prior slug-wide review)

```yaml
---
schema: sdlc/v1
type: review
slug: <slug>
review-scope: <per-slice|slug-wide>
slice-slug: <slice-slug or "" if slug-wide>
status: complete
stage-number: 7
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
verdict: <ship|ship-with-caveats|dont-ship>
commands-run: [correctness, security, ...]
metric-commands-run: <N>
metric-findings-total: <N>
metric-findings-raw: <N>
metric-findings-blocker: <N>     # POST-fix-loop count — fixes that landed reduce this. Handoff's blocker gate reads this field.
metric-findings-high: <N>
metric-findings-med: <N>
metric-findings-low: <N>
metric-findings-nit: <N>
metric-issues-found-initial: <N>          # findings-total snapshot BEFORE the fix loop
metric-issues-found-final: <N>            # findings-total snapshot AFTER the fix loop
metric-fix-decisions: <N>                 # how many findings the user triaged "Fix" at Step 4b
metric-fix-patched: <N>                   # how many of those the sub-agent successfully fixed
fix-rounds-run: <0 | 1>                   # 0 if no Fix decisions; 1 if Step 4c ran
convergence: <not-needed | converged | escalated>
review-owned-fix-commit: "<SHA | null>"   # null if no fixes landed or branch-strategy: none
tags: []
refs:
  index: 00-index.md
  # Per-slice mode:
  slice-def: 03-slice-<slice-slug>.md
  implement: 05-implement-<slice-slug>.md
  verify: 06-verify-<slice-slug>.md
  sub-reviews: [07-review-<slice-slug>-correctness.md, 07-review-<slice-slug>-security.md, ...]
  # Slug-wide mode (replace the four per-slice keys above with these):
  shape: 02-shape.md
  slice-index: 03-slice.md
  implements: [05-implement-<slice-1>.md, 05-implement-<slice-2>.md, ...]
  verifies: [06-verify-<slice-1>.md, 06-verify-<slice-2>.md, ...]
  sub-reviews: [07-review-correctness.md, 07-review-security.md, ...]
next-command: <wf-handoff|wf-implement>
next-invocation: "<based on verdict>"
---
```

# Review

## Verdict

**{Ship / Ship with caveats / Don't Ship}**

{3-4 sentence rationale. Name the most critical finding. State whether any blockers exist.}

## Domain Coverage

| Domain | Command | Status |
|--------|---------|--------|
| {domain} | `{command}` | {Clean / Issues / Blockers} |

## All Findings (Deduplicated)

| ID | Sev | Conf | Source | File:Line | Issue |
|----|-----|------|--------|-----------|-------|

**Total:** BLOCKER: {X} | HIGH: {X} | MED: {X} | LOW: {X} | NIT: {X}
*(After dedup: {N} findings merged from {M} raw findings across {K} commands)*

## Findings (Detailed)

### {ID}: {Title} [{SEVERITY}]

**Location:** `{file}:{line-range}`
**Source:** {command(s) that flagged this}

**Evidence:**
```
{snippet}
```

**Issue:** {description}

**Fix:** {suggestion for HIGH+}

**Severity:** {level} | **Confidence:** {High/Med/Low}

## Triage Decisions

| ID | Sev | Source | Decision | Notes |
|----|-----|--------|----------|-------|
| {ID} | {SEV} | {command} | {fix/defer/dismiss} | {user's reason or —} |

{All BLOCKER/HIGH/MED findings from Step 4b. LOW/NIT listed as "untriaged".}

## Fix Status

Only present when `fix-rounds-run > 0`. Records what Step 4c actually did.

| ID | Sev | Source | Sub-agent outcome | Notes |
|----|-----|--------|-------------------|-------|
| {ID} | {SEV} | {command} | Patched / Could not fix | {one-line summary} |

**Round count:** {fix-rounds-run}
**Convergence:** {not-needed | converged | escalated}
**Initial findings:** {metric-issues-found-initial} → **Final findings:** {metric-issues-found-final}
**Commit:** {SHA or "(no commit — branch-strategy: none)" or "(no files changed)"}

{If convergence: escalated, list each could-not-fix finding here with the sub-agent's stated reason so the next stage knows what's still broken.}

## Recommendations

### Must Fix (triaged "fix")
{List with finding IDs and estimated effort}

### Should Fix (MED triaged "fix")
{List}

### Deferred (triaged "defer")
{List — re-triage later via `/wf review <slug> triage`}

### Dismissed
{List with finding IDs and reason}

### Consider (LOW/NIT — not triaged)
{List}

## Recommended Next Stage
- **Option A:** `/wf handoff <slug>` — converged or no blockers; all slices complete, ready for PR [reason]
- **Option B:** `/wf review <slug> [<slice>]` — escalated; re-invoke for a second fix round [reason, only if applicable]
- **Option C:** `/wf implement <slug> [<slice>] reviews` — escape hatch; remaining findings need stage-5 fix UI [reason, only if applicable]
- **Option D:** `/wf plan <slug> <next-slice>` or `/wf implement <slug> <next-slice>` — more slices to implement before handoff [reason, if applicable]
- **Option E:** `/wf ship <slug>` — skip handoff [reason, if applicable]
- **Option F:** `/wf-meta extend <slug> from-review` — add new slices from findings [reason, if applicable]
- **Option G:** `/wf-meta amend <slug> from-review` — correct the spec/approach of an existing slice [reason, if applicable]

---

# Step 5b: Write the rich fragment (MANDATORY — do not skip)

The sunflower view renders the review page from a sibling `.yaml` + `.html.fragment`
written next to the review `.md`. **Without them the page silently degrades to plain
prose** — the Σ severity-heatmap, dimension chips, severity filter, and findings list
never appear. The `post-write-verify` hook **BLOCKS the `.md` write (exit 2) when the
sibling `.yaml` is missing**, so author the `.yaml` first (or in the same turn) —
here, now, while the findings are still in context.

For each review `.md` you just wrote (`07-review.md` slug-wide, or each
`07-review-<slice-slug>.md` per-slice):

1. Write the sibling **`<stem>.yaml`** (same stem, `.yaml`) — the structured data:
   `dimensions:` (the severity × dimension heatmap matrix), `verdict:`, `findings:`
   (id, severity, dimension, file, line, message, evidence/diff, triage) and the metric
   counts. Schema: `siblingYamlSchemas.review` in `tests/frontmatter.schema.json`.
2. Write the sibling **`<stem>.html.fragment`** — one
   `<section class="fragment-review" data-artifact="review" data-rev="<n>">` carrying the
   gallery's review fragment's **interactive layer**: the Σ severity-heatmap, dimension
   chips + severity filter, and the findings list with per-finding evidence/diff/copy
   controls. The fragment is **body-only** (see `_fragment-authoring.md` → "Scope"): the
   `review.mjs` page already renders the heading, the verdict block, and the metric-row —
   do **not** repeat them in the fragment, start at the heatmap.

Authoring rules (do not skip — verifier Check 7 enforces these):

- Inline `<style>` with every selector scoped under `.fragment-review` / `.fr-*`.
- Inline `<script>` scoped via `document.currentScript.closest('.fragment-review')`.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: { name: 'review', artifact: 'review', counts: { findings: <n>, blockers: <n> } } }))`.
- Inline SVG only; no remote anything.
- All data deterministic from the `.yaml` — re-running on the same YAML must produce byte-identical output.

The full contract (allowed shared classes, forbidden tags, YAML→fragment mapping) lives in
[`reference/fragment-author-contract.md`](../../../reference/fragment-author-contract.md);
the authoritative gallery is bundled at
[`reference/fragments-gallery.html`](../../../reference/fragments-gallery.html).

---

# Step 5c: Write per-dimension rich fragments (MANDATORY — do not skip)

Step 5b covers the **sweep-level** review page (`07-review.md` / `07-review-<slice-slug>.md`).
Each **per-dimension** review file — `07-review-<command>.md` (slug-wide) or
`07-review-<slice-slug>-<command>.md` (per-slice), one per selected review command
(`security`, `correctness`, …) — renders through `review-dimension.mjs`. **Without a sibling
`.yaml` that page falls back to `renderSimple`** (plain prose, no interactive findings): the
focused-dimension equivalent of the S-1 degradation, and `post-write-verify` now BLOCKS
(exit 2) a `type: review-command` `.md` written without it.

Those siblings are authored by the **Step-3 review sub-agent** that wrote each per-dimension
file (it holds that dimension's findings in context — see the sub-agent prompt above). This
section is the **shape spec** the sub-agent follows; at Step 5b confirm every per-dimension
`.md` has its `.yaml` (or a `fragment: none` opt-out for a clean dimension) and author any the
sub-agent missed. For each per-dimension review `.md`:

1. Write the sibling **`<stem>.yaml`** — schema `siblingYamlSchemas.review-dimension` in
   `tests/frontmatter.schema.json`: `artifact: review-dimension`, `dimension`, `parent`
   (the sweep `07-review.md`), `rev`, `verdict` (`ship|caveats|no`), `summary`, `counts`
   (blocker/high/med/low/nit), and `findings` (id, severity, file, line, confidence, action,
   msg, evidence, fix) — scoped to **this dimension only**.
2. Write the sibling **`<stem>.html.fragment`** — one
   `<section class="fragment-review-dimension" data-artifact="review-dimension" data-rev="<n>">`
   carrying the **interactive layer**: a severity-filter pill bar, a sortable findings list
   (by severity / file:line), and per-finding expandable evidence→fix rows. The fragment is
   **body-only** (see `_fragment-authoring.md` → "Scope"): `review-dimension.mjs` already
   renders the heading, the verdict block, and the metric-row, and suppresses its static
   findings list when a fragment is present (see `renderers/review-dimension.mjs` lines
   64–67) — start at the filter bar, do not repeat the chrome.

Authoring rules (verifier Check 7 enforces these):

- Inline `<style>` with every new selector scoped under `.fragment-review-dimension`. Use a
  **distinct prefix** (e.g. `.rd-*`) so it never collides with the sweep fragment's `.fr-*` —
  both fragments can appear on one slug page.
- Inline `<script>` scoped via `document.currentScript.closest('.fragment-review-dimension')`.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: { name: 'review-dimension', artifact: 'review-dimension', dimension: '<dim>', counts: { findings: <n>, blockers: <n> } } }))`.
- Inline SVG only; no remote anything.
- All data deterministic from the `.yaml` — same YAML → byte-identical output.

Load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_fragment-authoring.md` first; the full
contract lives in [`reference/fragment-author-contract.md`](../../../reference/fragment-author-contract.md).

---

## Step — Write free narrative fragments

Beyond the structured page, this artifact ships one or more **free narrative fragments**: `<stem>.<NN-label>.html.fragment` siblings of **unrestricted raw HTML** that tell a story the rendered page can't on its own — a bespoke diagram, a before/after flow, a state machine, an annotated mock, or an interactive widget. Author **as many as the story needs**; there is **no contract, no scoping, and no sibling `.yaml`** for these. Prefix the label with `NN-` (`01-`, `02-`, …) to order them; they inject raw-inline below the page body. See [_fragment-authoring.md](_fragment-authoring.md) Step F2 and [narrative-fragments.md](../../../reference/narrative-fragments.md).

---

# Step 6: Update Index and Return

1. Update `00-index.md` frontmatter:
   - `current-stage: review`
   - `status: active`
   - `progress.review: complete`
   - Add review artifacts to `workflow-files` based on `review-scope`:
     - **Per-slice**: add the slice-scoped `07-review-<slice-slug>.md` and every `07-review-<slice-slug>-<command>.md` file (do NOT remove sibling slices' review files — they remain valid).
     - **Slug-wide**: add `07-review.md` and every `07-review-<command>.md` file. If prior per-slice review files exist for this workflow, leave them in `workflow-files`; they are not invalidated by a slug-wide run.
   - Set `next-command` and `next-invocation` based on verdict
2. Return the compact chat summary with verdict and options.

# Adaptive routing — evaluate what's actually next

Routing is **driven by `convergence:`** plus the post-fix-loop `verdict:`. Review no longer routes to `/wf implement` as the default fix path — the fix loop is owned by this stage. `/wf implement <slug> [<slice>] reviews` survives only as a manual escape (e.g., when `convergence: escalated` and the user wants to retry fixes with that mode's sequential UI).

After completing the fix loop, evaluate the post-fix verdict and present the user with ALL viable options:

**Option A: Handoff** → `/wf handoff <slug>`
Use when: `convergence: not-needed` OR `convergence: converged` AND `verdict: ship` (or `ship-with-caveats` where the caveats are not blockers) AND all intended slices on this branch are complete. Handoff aggregates all complete slices automatically.
**If more slices remain** on this branch before handoff: use Option D (next slice) — implement remaining slices first, then run `/wf handoff <slug>` once for the full PR.

**Option B: Re-invoke review for a second round** → `/wf review <slug> [<slice>]`
Use when: `convergence: escalated` AND the user wants to attempt another round of fixes on the remaining findings. Review enforces a one-round cap per invocation; a second round requires a fresh invocation. State the unresolved findings (`could-not-fix` plus any deferred BLOCKER) clearly before recommending.
**Compact recommended before re-invoking** — fix sub-agent chatter and triage UI is noise for the next review pass. Tell the user: "Consider running `/compact` before re-invoking — workflow state lives in the artifact files on disk (the triage record is in `07-review-<slice-slug>.md`) and the SessionStart hook re-reads it automatically after compaction."

**Option C: Escalate to manual implement** → `/wf implement <slug> [<slice>] reviews`
Use when: The remaining findings cannot be addressed by sub-agent patches — they need design rethink, cross-cutting refactor, or input the review agent cannot supply. This is the explicit escape hatch back to stage 5; use only when re-invoking review would just escalate again. Also available when the user prefers stage 5's per-finding sequential UI over review's batched fix dispatch.

**Option D: Next slice** → `/wf plan <slug> <next-slice>` or `/wf implement <slug> <next-slice>`
Use when: This slice is approved AND more slices remain. Check `03-slice.md`.
**Compact recommended** — previous slice's full lifecycle (implement + verify + review) is noise for the next slice.

**Option E: Skip handoff, go to Ship** → `/wf ship <slug>`
Use when: No team to hand off to, no PR description needed, CI/CD handles the rest.

**Option F: Extend scope** → `/wf-meta extend <slug> from-review`
Use when: Review findings reveal **missing capability** rather than broken implementation — scope that was never built, not code that is wrong. Signal: findings describe "X should also do Y" or "there is no handler for Z" rather than "X does Y incorrectly". Use this over Option C when the work required is net-new rather than corrective.

**Option G: Amend spec** → `/wf-meta amend <slug> from-review`
Use when: Review findings reveal that the **slice definition or acceptance criteria were themselves wrong** — the implementation did what it was told, but what it was told to do was incorrect. Signal: multiple findings stem from the same incorrect assumption in the spec, or a finding says the approach is fundamentally wrong rather than buggy.

Write ALL viable options into `## Recommended Next Stage`.
