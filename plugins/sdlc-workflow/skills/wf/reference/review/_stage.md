# Review stage body (slug mode — loaded by `review.md` Step 00)

This file is the **workflow-stage** half of `/wf review`. `review.md` resolved the first token to an existing slug and instructed you to read this file — follow it verbatim. Ad-hoc review (dimension / sweep, no slug) never loads this file.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → `7·review` → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires (per-slice mode) | `02-shape.md`, `03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`, `06-verify-<slice-slug>.md` (recommended) |
| Requires (slug-wide mode) | `02-shape.md`, `03-slice.md`, and at least one `05-implement-<slice>.md`. Reads every present per-slice implement/verify file for context. |
| Conditional inputs (mandatory when present) | `02b-design.md`, `02c-craft.md`, `04b-instrument.md`, `04c-experiment.md`, `05c-benchmark.md`, `07-design-audit.md`, `07-design-critique.md`, `augmentations:` list in `00-index.md` — every artifact that exists MUST be checked by the relevant review (e.g., 02c-craft.md anti-goals MUST be honored; 04b-instrument.md signals MUST be present; 05c-benchmark.md baseline MUST not regress; every augmentation MUST get a type-specific re-check). |
| Produces (per-slice mode) | `07-review-<slice-slug>.md` + `07-review-<slice-slug>-<command>.md` per selected command. These are an **accumulating ledger** — a re-run on the same slice MERGES new findings into the existing files (dedupe + resolve-sweep), never overwrites. Running review on a different slice never touches a sibling slice's files. |
| Produces (slug-wide mode) | `07-review.md` + `07-review-<command>.md` per selected command (single set per workflow). Re-running review **merges into the existing files** (accumulating ledger — new findings deduped + appended in place, cleared findings marked `resolved`; nothing overwritten or deleted). Sibling per-slice review files (if any from prior runs) are left untouched. |
| Next | `/wf handoff <slug>` (when `verdict: ship`/`ship-with-caveats` and no OPEN blocker findings remain + all slices complete). If OPEN blockers remain: re-invoke `/wf review <slug> [<slice>]` (a normal accumulating re-run that re-checks the fixed code and merges fresh findings), or escalate to `/wf implement <slug> [<slice>] reviews` as a manual escape. Also: `/wf plan <slug> <next-slice>` (if more slices remain), or `/wf intake <slug> from-review` (if the review surfaced new scope — adds net-new slices via extension; a wrong spec becomes a new slice too, since there is no in-place amend). |

> **Auto second opinion.** After findings are merged and the verdict is derived, **auto-invoke** `/consult codex review <scope>` (pin `codex`/`claude`) for borderline verdicts — especially ship-with-caveats. Skip for a clean pass or obvious block. The user may invoke it with any provider.

# CRITICAL — execution discipline
You are a **review dispatch orchestrator that owns an accumulating findings ledger and its own triage→fix loop**.
- Do NOT run reviews yourself — **select review commands and dispatch sub-agents**. Each sub-agent runs one command independently and reports findings.
- The review artifacts **accumulate across invocations**. Before writing, READ the existing `07-review[-<slice>].md` + per-command files (if present) and **MERGE** this run's findings — dedupe against prior findings, preserve prior IDs and `surfaced-at` stamps, and mark findings a re-run of a dimension no longer surfaces as `resolved`. Never overwrite or delete a prior finding.
- Do NOT improvise fixes while sub-agents are running. The fix loop runs only at Step 4c, AFTER aggregation and AFTER user triage at Step 4b.
- At Step 4c: every finding marked `Fix` at Step 4b spawns a fix sub-agent that applies the minimal patch. After all fix sub-agents return, record each outcome **onto its finding** (`status: fixed` / `could-not-fix` + `fixed-at`) and refresh `## Fix Status`.
- Do not auto-loop **within this invocation**: dispatch fix sub-agents once, record outcomes, stop. A further pass is a fresh `/wf review` that merges into the same ledger. **No round counter and no `convergence` state.** Verify-after-fixes requires the user to re-invoke `/wf verify`.
- Do NOT handoff or ship — those are later stages.
- Your job: **orient → read existing ledger → gather change stats → select commands → dispatch review sub-agents → merge + dedupe + resolve-sweep → triage → dispatch fix sub-agents → record outcomes → write merged verdict + Fix Status**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- If you catch yourself reviewing code directly, STOP — spawn a sub-agent. If you catch yourself fixing code outside Step 4c, STOP — the fix loop only runs at Step 4c.

# TRIAGE MODE

If the second argument is `triage` (e.g., `/wf review my-feature triage`), skip the full review and jump directly to re-triage:

1. **Resolve slug** from the first argument. Read `00-index.md` for `review-scope` and `selected-slice`.
   - `review-scope: slug-wide` → target is `07-review.md`; ignore any third-argument slice selector.
   - `review-scope: per-slice` → use the third argument as slice slug if present, else `selected-slice`; if neither, ask. Target is `07-review-<slice-slug>.md`.
2. **Read the target review file** — parse `## Triage Decisions`. Collect findings with `status: deferred` or `open`. Findings already `resolved`/`fixed`/`dismissed` are not re-presented unless the user names them.
3. **If no findings to triage** → print "No deferred or untriaged findings. Run `/wf review <slug> [<slice>]` for a full review." and STOP.
4. **Present for triage via AskUserQuestion** — same protocol as Step 4b, but show only `deferred` and `open` findings. A `Fix` decision here may also run the Step 4c fix loop.
5. **Edit the target review file in place** — update `## Triage Decisions` rows for re-triaged findings only; set each finding's `status` in `## All Findings`, `## Findings (Detailed)`, and the sibling `.yaml`; update `## Recommendations` counts. Preserve every other section verbatim. Do NOT overwrite the file.
6. **Print summary** — show fix/defer/dismiss counts and list findings newly marked for fixing.

Then STOP — do not continue to the full review workflow.

---

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector** (per-slice mode only; ignored in slug-wide mode). If no slug given, infer from `.ai/workflows/*/00-index.md`. If ambiguous, ask.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`, **`review-scope`**.
3. **Resolve `review-scope`** from `00-index.md`. Default: `per-slice` (back-compat with pre-v9.x).
   - `per-slice` → continue with slice-resolution below; all artifact paths use `-<slice-slug>` suffix.
   - `slug-wide` → **skip slice resolution entirely**; no `<slice-slug>` this run; paths drop the slice suffix (`07-review.md`, `07-review-<command>.md`). Re-runs **merge** into the prior `07-review.md` (dedupe, resolve-sweep re-run dimensions, append a `runs:` entry; never overwritten). The diff is the cumulative branch diff (`git diff <base-branch>...HEAD`). Findings reflect all code on the branch; verdict is "ship this branch" not "ship this slice".
4. **Resolve the slice-slug** (per-slice mode only; skip if `review-scope: slug-wide`): Use the passed slug; else `selected-slice-or-focus` from the index; else ask.
5. **Check prerequisites (workflow-type-aware AND review-scope-aware):**
   Read `workflow-type` from `00-index.md`. Recognize these modes:
   - **Compressed mode** (`workflow-type: quick`): the implement record is `05-implement.md` (no slice slug). Acceptance criteria source is `01-quick.md`. No per-slice plan/slice files exist.
   - **Forwarded mode** (`workflow-type: rca`): rich context lives in `01-rca.md`; `02-shape.md` is synthesized; `04-plan.md` exists if planning ran.
   - **Terminal analysis** (`workflow-type: investigate`): produces option sketches and **no `02-shape.md`** — it is not built or reviewed in place. A chosen option is re-intaked via `/wf intake <option>` as a NEW workflow; a bare `investigate` slug has no implement record to review.
   - **Change-mode** (`workflow-type: fix` / `hotfix` / `refactor`): the compressed-lifecycle's **un-suffixed single-slice** standard files (`03-slice.md`, `04-plan.md`, `05-implement.md`, optional `06-verify.md`) + the lead `01-<mode>.md` (`01-fix.md` / `01-hotfix.md` / `01-refactor.md`). Exactly one slice; `selected-slice` is its slug. Review as standard mode with the un-suffixed names. (`review-scope: slug-wide` — one `07-review.md`.) Default rubric by mode: **hotfix** → `security`, **refactor** → `refactor-safety` (`/wf review <slug> <rubric>`); widen only if the change warrants it.
   - **update-deps** (`workflow-type: update-deps`): update-deps self-authors `05-implement.md` / `06-verify.md` (tier-ordered) in its own flow and **routes here** for review. The implement/verify records are the un-suffixed `05-implement.md` / `06-verify.md`; the plan is `04-plan.md`. Review against `01-update-deps.md` (the scan/research brief) + `03-slice.md` (the P0/P1/P2 tiers). `review-scope: slug-wide`.
   - **Standard mode**: per-slice files (`03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`).

   In all modes, an implement record (slice or master) must exist. If missing → STOP: "Run `/wf implement <slug>` first."

   **Per-slice mode** (`review-scope: per-slice`):
   - `06-verify-<slice-slug>.md` (or `06-verify.md`) is recommended but not required.
   - If verify shows `Status: Awaiting input` → STOP.
   - If `07-review-<slice-slug>.md` already exists → this run **merges** into it. Read it now (with its sibling `.yaml`) for dedupe + resolve-sweep at Step 4; nothing is overwritten. Sibling slices' review files are never touched.

   **Slug-wide mode** (`review-scope: slug-wide`):
   - At least one `05-implement-<slice-slug>.md` must exist. If `03-slice.md` lists slices with `status: complete` but only some have implement records, WARN: "Slug-wide review covers the entire branch diff. Slices without implement records: <list>. Their code may appear in the diff; their ACs will not be checked."
   - Any `06-verify-*.md` files are read for context but never block.
   - **Adoption-matrix reconciliation (mechanical pass over shape).** If `02-shape.md` carries an adoption matrix (the table of dependencies/libraries with a `USE`/`AVOID`/etc. decision per row), reconcile every `USE` row against the branch diff: each must cite at least one production usage site — a real import/call in shipped code. A `USE` row with zero usage (installed, never wired in) becomes a finding, severity **MED**, titled "committed and abandoned" (installed, zero usage) and routed through the normal ledger. This is a mechanical check, not a judgment call: no production import/call for a `USE` dependency ⇒ finding.
   - If `07-review.md` already exists → this run **merges** into it. Read it now (with its sibling `.yaml`) for dedupe + resolve-sweep at Step 4; nothing is overwritten. Prior per-slice `07-review-<slice>.md` files are left untouched.
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

   Also read `02b-design.md` and `02c-craft.md` for register, anti-goals, and visual contract — **`02c-craft.md` is mandatory when present** — review must check anti-goals were honored.

   Cross-reference `06-verify-<slice-slug>.md` (per-slice mode) or every `06-verify-*.md` file (slug-wide mode). Mandatory reads from each verify artifact:
   - `## Augmentation Verification` — failed augmentation re-checks become BLOCKER or HIGH findings automatically.
   - `stability-check-flaky-count` (frontmatter) — any value > 0 is a HIGH finding; flaky criteria indicate race conditions or state leakage that review sub-agents should investigate in the diff.
   - `adversarial-tests-failed` (frontmatter) — any value > 0 means `## Adversarial Tests` contains BLOCKER or HIGH findings; surface them in the aggregated finding list.
   - `cross-browser-delta` (frontmatter) — if `findings`, read `## Cross-Browser Delta` and surface each divergence as a HIGH compatibility finding.
   - `web-vitals-inp-ms` (frontmatter) — if > 200, surface as a HIGH performance finding; `web-vitals-lcp-ms` > 2500 and `web-vitals-cls` > 0.1 are WARN.
   - `## Friction Notes` and `## Free Exploration Notes` — these are informational (not auto-promoted to issues) but must appear in the review's `## Soft Findings` or `## Reviewer Notes` section so the human reviewer can see them. They represent observations a first-time user would notice that no AC captured.
8. **Carry forward** `open-questions` from the index.
9. **Branch check:** Read `branch-strategy` and `branch` from `00-index.md`. If `branch-strategy: dedicated`, confirm you are on the correct branch. Use `git diff <base-branch>...<branch>` for the full change set.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. Machine-readable state goes in frontmatter; markdown body is human-readable narrative only.
- **Timestamps must be real:** run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash for `created-at`/`updated-at`. Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.
- **Conditional inputs are mandatory when present.** If a file in this command's *Conditional inputs* row exists on disk, read and honor it — silent omission is a contract violation.

# Chat return contract
After writing files, return per [_chat-return.md](../_chat-return.md) — narrative lead in the artifact's `## The Review` story voice, then this receipt:
- `slug: <slug>`
- `wrote: <paths>` (list all review files written)
- `verdict: <Ship / Ship with caveats / Don't Ship>`
- `findings: <O open / R resolved-this-run / F fixed-this-run>` — the merged-ledger snapshot, plus a one-line "what the merge did" note: how many net-new findings were added, how many prior findings were re-confirmed, how many a re-run cleared (`resolved`), and how many the fix loop patched (e.g., "merged 2 new, re-confirmed 3, resolved 1 cleared; fix loop patched 2 of 2; 4 open").
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed (remaining OPEN BLOCKERs only — anything fixed/dismissed/resolved is no longer a blocker)

---

# Task Tracking

After completing Step 2 (command selection), create a task list using TaskCreate before dispatching sub-agents:
- One task per selected review command: `subject: "Review: {command}"`, `activeForm: "Dispatching {command} review"`, `metadata: { slug, stage: "review", slice: "<slice-slug>", command: "{command}" }`.
- Review command tasks are independent — no `addBlockedBy` between them (they run as parallel sub-agents).
- Add bookkeeping tasks:
  - "Merge + dedupe + resolve-sweep findings (against existing ledger)" — `addBlockedBy: [all review command tasks]`
  - "Triage findings via AskUserQuestion" — `addBlockedBy: [merge task]`
  - "Fix loop (Step 4c)" — `addBlockedBy: [triage task]` — gets `status: deleted` if Step 4b produced zero `Fix` decisions.
  - "Write merged 07-review-<slice-slug>.md + verdict + Fix Status" — `addBlockedBy: [fix-loop task]`

Inside the fix loop (Step 4c), `TaskCreate` one additional task per `Fix` decision: `subject: "Fix [{ID}] {SEV}: {title}"`, `activeForm: "Fixing [{ID}]"`, `addBlockedBy: ["Fix loop (Step 4c)"]` (parent — the loop coordinates them sequentially). Mark each `completed` (with `description: "COULD NOT FIX: <reason>"` if applicable) before moving to the next.

As each review sub-agent returns its `07-review-<slice-slug>-<command>.md` file: `TaskUpdate(taskId, status: "completed")`.
When starting aggregation: `TaskUpdate(aggregateTaskId, status: "in_progress")`. Mark `completed` when done.
When starting triage: `TaskUpdate(triageTaskId, status: "in_progress")`. Mark `completed` when AskUserQuestion finishes.
When starting the fix loop: `TaskUpdate(fixLoopTaskId, status: "in_progress")`. Mark `completed` when every per-finding fix task is done.
When writing final verdict: `TaskUpdate(writeTaskId, status: "in_progress")`. Mark `completed` when done.

---

# Step 1: Gather Change Statistics

From the relevant implement record(s), extract files changed and nature of changes. **Diff scope depends on `review-scope`:**

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

Substitute `<base-branch>` from `00-index.md` frontmatter (typically `main` or `master`).

Extract:
- **File types changed** — extensions and directory patterns
- **Change size** — total lines added/removed
- **Change type signals** — new files vs modifications vs deletions
- **Content signals** — patterns in the diff (SQL queries, auth checks, migrations, React components, Terraform, etc.)

---

# Step 2: Select Review Commands

Each command maps to `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/review/<name>.md` — **except** the two design dimensions `design-audit` and `design-critique`, which map to `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/design/audit.md` and `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/design/critique.md` respectively (the relocated design library; see the "design work" selection rule below).

**Selection philosophy:** Use shape, slice, and implementation artifacts — not just raw diff patterns — to reason about what the change *is*. A feature that adds async data fetching needs `backend-concurrency` even if the diff contains no "mutex". Lean toward inclusion: a missed review is worse than a redundant one. The max prevents sprawl, not thorough coverage.

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
- `interface-craft` — static visual-detail craft (concentric radius, optical alignment, shadows-vs-borders, image outlines, tabular-nums, text-wrap, hit areas)
- `ux-copy`

### Include when the change involves design work — `review` is the design consumer that *judges it*
(any `design-*` entry in `00-index.md` `augmentations:`, a `02c-craft.md` visual contract present, or substantive UI changes when `stack.ui ≠ ∅`)
- `design-audit` — theming / responsive / anti-pattern judgment + 0–4 scoring. **Consumes the a11y / perf / web-vitals already measured in `06-verify-*.md` rather than re-running axe-core** (if no verify ran, it measures itself). Checks the `02c-craft.md` anti-goals were honored. Emits `07-design-audit.md`. Maps to `skills/wf/reference/design/audit.md`. Its absolute-ban checklist is single-sourced from `skills/wf/reference/design/_design-context.md` (Absolute bans) — load it when `stack.ui ≠ ∅` even if no `02b`/`02c` exists, so audit judges against the same canon design authored to.
- `design-critique` — register-forked prescriptive critique (brand = distinctiveness, product = earned-familiarity); preserves the stance rules + font reflex-reject. Emits `07-design-critique.md`. Maps to `skills/wf/reference/design/critique.md`.

These run as ordinary dimensions inside the parallel fan-out — reachable ad-hoc via `/wf design audit|critique`. a11y/perf are measured once (in `verify`) and *interpreted* here; never re-measured.

### Include based on what the feature does (reason from shape + slice, not just diff patterns)

**The feature adds or changes animation, transition, or gesture motion** (`transition`, `animation`, `@keyframes`, `cubic-bezier`, `transform`, Motion/Framer Motion, `useSpring`, `whileTap`, `AnimatePresence`, drag/swipe handlers):
- `motion` — easing, timing, interruptibility, origin/physicality, GPU performance, and whether the motion should exist at all

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
- **Minimum**: 3 (`correctness` + `security` + `code-simplification`)
- **Maximum**: 15 — raise only if the change genuinely spans many domains; do not artificially cap thorough coverage
- **User focus override**: include named dimensions + `correctness`; suppress unrelated commands
- **Config/docs-only**: drop `correctness`/`backend-concurrency`/`testing`/`code-simplification`; keep `security`, `docs`, relevant infra/release
- **Test-only**: keep `testing`, `correctness`, `code-simplification`; drop most others
- **When in doubt, include**: a false positive costs one sub-agent; a missed issue costs a production incident

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

For EACH selected command, spawn a sub-agent **with explicit `model: sonnet`** on the `Task` call. All agents run in parallel. The model parameter is REQUIRED — do not omit it (per [_fix-loop.md](../_fix-loop.md) rule 3). Synthesis (Step 4 — aggregation, dedup, triage) keeps the parent model.

**Each sub-agent receives this prompt** (substitute the per-slice or slug-wide variant based on the current `review-scope`):

```
Execute the review command at `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/review/{command-name}.md`.

Scope:
  - Per-slice mode: `git diff HEAD` (working-tree diff for the current slice)
  - Slug-wide mode: `git diff <base-branch>...HEAD` (full branch diff)
Workflow slug: {slug}
Review scope: {review-scope}                              # per-slice or slug-wide
Selected slice: {slice or "(none — slug-wide)"}

Read the command file and follow its WORKFLOW exactly. Perform the review for the given scope.

PRE-EXISTING determination (per finding, MANDATORY): check whether the finding's flagged
line(s) appear in the workflow diff above. Lines untouched by this workflow's diff →
`pre-existing: true` (the defect was already on the base branch); lines the diff
added/modified → `pre-existing: false`. For moved or renamed code where the diff test is
ambiguous, use `git blame` as the tiebreaker — reviewer judgment decides. A re-run may flip
a prior finding's `pre-existing` value if the diff has since grown to touch those lines.

ACCUMULATE — do not overwrite. Before writing, READ your target file below if it already
exists (plus its sibling `.yaml`). It holds prior findings for THIS dimension with stable
IDs and `surfaced-at` stamps. MERGE your fresh findings into it:
  - A fresh finding that matches a prior one (same/overlapping file:line OR same root cause)
    → KEEP the prior `id` and `surfaced-at`, set `last-seen-at` to now, refresh evidence/
    severity only if yours is more specific, and keep its prior `status`. If the prior status
    was `resolved`, flip it back to `open` and note it re-surfaced.
  - A genuinely new finding → allocate the next ID in this dimension's prefix sequence
    (max existing +1; never reuse a retired ID), `status: open`, and set
    `surfaced-at = last-seen-at = now`.
  - A prior `open` finding you did NOT re-surface this run → set `status: resolved`,
    `resolved-at: now` (your dimension WAS re-run, so absence means cleared). Keep the row;
    never delete it.
  - Leave `deferred` / `dismissed` / `fixed` / `could-not-fix` findings' status untouched
    unless you re-surface them (then `last-seen-at` only).
Get `now` from `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash. Emit the FULL merged set (open AND resolved), not just this run's deltas.

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
metric-findings-total: {N}        # OPEN findings only (status open|deferred|could-not-fix)
metric-findings-blocker: {N}      # OPEN blockers with pre-existing: false — pre-existing defects never count here
metric-findings-high: {N}         # OPEN highs with pre-existing: false
metric-findings-pre-existing: {N} # OPEN findings with pre-existing: true (any severity) — surfaced as debt, not verdict input
metric-findings-resolved: {N}     # findings cleared on a re-run (status resolved)
result: clean | issues-found | blockers-found    # by OPEN findings
tags: []
refs:
  review-master: {07-review-{slice-slug}.md | 07-review.md}
---
```

# Review: {command-name}

## Findings
| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |
|----|-----|------|--------|-----|----------|-----------|-------|
(ALL findings — open AND resolved — with severity BLOCKER/HIGH/MED/LOW/NIT, confidence
High/Med/Low, status open|deferred|dismissed|fixed|could-not-fix|resolved, the `Pre` column
(`pre-existing: true|false` from the diff test), and the `surfaced-at` date. Keep resolved
rows for history; mark them clearly.)

## Detailed Findings
### {ID}: {Title} [{SEVERITY}]
**Location:** `{file}:{line-range}`
**Evidence:**
```
{snippet}
```
**Issue:** {description}
**Fix:** {suggestion for HIGH+}
**Severity:** {level} | **Confidence:** {High/Med/Low} | **Pre-existing:** {true/false}
**Status:** {status} | **Surfaced:** {surfaced-at} | **Last seen:** {last-seen-at}{ | **Resolved:** {resolved-at} if resolved}

## Summary
- Open findings: {N}    (resolved this run: {N})
- Open blockers: {N}    (pre-existing excluded; pre-existing findings: {N})
- Status: {Clean / Issues Found / Blockers Found}

Then author the rich siblings next to that `.md` (do NOT leave this for the orchestrator):
  1. Write `<stem>.yaml` — schema `siblingYamlSchemas.review-dimension` in
     `tests/frontmatter.schema.json` (`artifact: review-dimension`, `dimension`,
     `parent`, `rev`, `verdict`, `summary`, `counts`, `findings`), scoped to THIS
     dimension only. (`<stem>` = the review `.md` filename without `.md`.)
     - `findings:` = **OPEN findings only** (status open|deferred|could-not-fix). Resolved/
       fixed/dismissed findings live in the `.md` body, not the `.yaml` — this keeps the
       rendered heatmap + counts honest about live state. Each `.yaml` finding carries
       `surfaced-at` + `status` + `pre-existing` (additive fields; schema-validated).
     - `counts:` = OPEN counts. `rev:` = number of times this dimension file has been
       written (increment the prior `.yaml`'s `rev` by 1; first write = 1).
  2. Write `<stem>.html.fragment` — one
     `<section class="fragment-review-dimension" data-artifact="review-dimension">`
     per the per-dimension shape in this reference's Step 5b tail and
     `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_fragment-authoring.md`.
The `post-write-verify` hook BLOCKS (exit 2) the `.md` write when the sibling
`.yaml` is missing — write the `.yaml` first (or in the same turn). If this
dimension has zero OPEN findings (clean, or everything resolved), set `fragment: none`
in the `.md` frontmatter instead of authoring an empty fragment.

Write the files, then return a brief summary of what you found.
```

Wait for ALL sub-agents to complete before proceeding.

---

# Step 4: Merge into the existing ledger (dedupe + resolve-sweep)

After all sub-agents finish, **MERGE** this run's findings into the existing master ledger — edit `07-review[-<slice>].md` + `.yaml` **in place**, never overwriting.

1. **Read the existing master** `07-review[-<slice-slug>].md` + sibling `.yaml` (if present). Capture every prior finding: `id`, `surfaced-at`, `status`, `dimension`, triage decision. If no prior master, every finding below is net-new.
2. **Read every `07-review-<slice-slug>-<command>.md`** the sub-agents wrote this run; collect every row with ID, severity, file:line, description. (Sub-agents already merged within their dimension; you reconcile across dimensions and against the master.)
3. **Cross-dimension dedupe (this run):** two findings are duplicates if:
   - Same `file:line` (or overlapping line range)
   - Same root cause, even if different categories (e.g., missing validation flagged as both
     "correctness" and "injection vector")
   - One is a symptom and another is the root cause
   Merge duplicates: keep the highest severity, the most specific evidence (longest snippet, most
   precise line range), combine category labels (e.g., "Correctness + Security"), keep the most
   actionable fix. A merged duplicate is ONE finding with one ID.
4. **Reconcile against the master (cross-run dedupe):**
   - **Re-surfaced** (matches prior finding by file:line / root cause) → KEEP prior `id` and `surfaced-at`, set `last-seen-at = now`, refresh evidence/severity only if more specific, PRESERVE prior triage `status`. If prior status was `resolved`, flip to `open` and note "re-surfaced {now}".
   - **Net-new** (no prior match) → assign next ID in that dimension's prefix sequence (max+1; never reuse retired ID), `status: open`, `surfaced-at = last-seen-at = now`.
5. **Resolve-sweep:** prior master findings whose dimension WAS re-run but NOT in this run's findings → `status: resolved`, `resolved-at = now`. Keep the row. Findings from dimensions NOT re-run → carry forward untouched.
6. **Sort by severity:** BLOCKER → HIGH → MED → LOW → NIT, then alphabetically by file path within each level. Resolved findings sort last, clearly marked.
7. **Determine verdict** from OPEN, non-pre-existing findings only (status ∈ open / deferred / could-not-fix AND `pre-existing: false`):
   - Any OPEN BLOCKER → **Don't Ship**
   - OPEN HIGH only → **Ship with caveats** (if addressable as follow-ups)
   - OPEN MED/LOW/NIT only, or no open findings → **Ship**
   Fixed / dismissed / resolved findings never count against the verdict. **Neither do `pre-existing: true` findings — including pre-existing BLOCKERs**: the verdict is about *this change*. Pre-existing findings surface in `## Pre-existing Debt` and route to `/wf intake fix|refactor`.

Get `now` from `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash (one stamp for the whole run).

---

# Step 4b: Triage findings needing a decision via AskUserQuestion

After the merge, present findings that **need a decision** via AskUserQuestion: net-new findings, re-surfaced findings that were previously `resolved`, and prior `open` (untriaged) findings. **Skip `pre-existing: true` findings** — they land in `## Pre-existing Debt` with `/wf intake` routing (a user may still request an in-run fix, but the default flow never prompts for it). Findings already triaged `deferred` or `dismissed` **keep that decision** — re-triage via `/wf review <slug> triage`. **`Fix` decisions execute in Step 4c.**

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
- **question**: "Select which MED findings to fix now (Step 4c will spawn fix sub-agents for selected ones)"
- Options: one per MED finding, label `{ID}: {title}`, description `{file}:{line} — {one-line description}`

Unselected MED findings default to `Defer`.

**For LOW and NIT findings** — list in the report; do NOT prompt and do NOT fix in this run.

If all commands returned clean, skip Steps 4b and 4c.

---

# Step 4c: Review-owned fix loop

Runs only if Step 4b produced at least one `Fix` decision. Dispatch fix sub-agents **once** this invocation, record each outcome onto its finding, then stop. **No round counter and no `convergence` state** — a further pass is a fresh `/wf review`. The dispatch conforms to [_fix-loop.md](../_fix-loop.md); everything below is review-specific parameterization.

## Snapshot

Before dispatching, note the count of findings triaged `Fix` at Step 4b (transient — not persisted to frontmatter). If 0, skip to Step 5.

## Fix dispatch (sequential)

For each finding triaged `Fix`, sequentially (one at a time):
1. `TaskCreate` or `TaskUpdate`: `subject: "Fix [{ID}] {SEV}: {title}"`, `activeForm: "Fixing [{ID}]"`, `metadata: { slug, stage: "review-fix", slice: "<slice-slug or empty>", findingId: "{ID}", severity: "{SEV}", sourceCommand: "{command}" }`.
2. Spawn ONE sub-agent **with explicit `model: sonnet`** on the `Task` call (REQUIRED — do not omit; the model pin follows [_fix-loop.md](../_fix-loop.md) rule 3). This is the same fix prompt shape used by `/wf implement reviews` mode — kept identical so behavior matches when the user routes through either path:
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
4. Read the changed file(s) and sanity-check the patch addresses the finding without breaking sibling code.
5. **Record the outcome ON the finding** — set `status` and `fixed-at = now` in `## All Findings`, `## Findings (Detailed)`, `## Fix Status`, and the sibling `.yaml`:
   - fixed → `status: fixed` (drops out of OPEN counts and verdict).
   - could not fix → `status: could-not-fix` (stays OPEN; still counts against verdict) + `TaskUpdate(... description: "COULD NOT FIX: <reason>")`.
   Then `TaskUpdate(taskId, status: "completed")`.

## After the fix dispatch (no re-review this invocation)

Do **not** re-dispatch reviews this invocation — re-checking the fixed code is a fresh `/wf review` run.
- `fixed` findings drop out of OPEN counts → verdict recomputes from remaining open.
- `could-not-fix` findings stay OPEN and surface under `## Recommendations → Must Fix (remaining)` with the sub-agent's reason.

## Commit (only when fixes landed)

If at least one `Fix` sub-agent successfully modified files: follow the shared commit discipline ([_fix-loop.md](../_fix-loop.md) rule 7) with message `fix(<slug>): review-time fixes for <slice-slug>` (per-slice mode) or `fix(<slug>): review-time fixes` (slug-wide mode), and record the commit SHA in the review artifact's `## Fix Status` section AND in this run's `runs:` frontmatter entry (`fix-commit`).

The fix sub-agents and commit replace the manual `/wf implement <slug> [<slice>] reviews` round-trip for the common case. That mode remains as a manual escape (e.g., `could-not-fix` findings remain, or the user prefers the sequential per-finding fix UI).

---

# Step 5: Write the merged master ledger

Write (merge into) the master artifact. Filename depends on `review-scope`:
- **Per-slice** → `07-review-<slice-slug>.md`
- **Slug-wide** → `07-review.md`

When the file already exists, **edit in place** — preserve sections not changing (especially `## Triage Decisions` rows not re-triaged), update finding rows by ID, append net-new findings in severity-sorted position, mark resolved findings, and **append one entry to `runs:`**. Never overwrite the file wholesale.

```yaml
---
schema: sdlc/v1
type: review
slug: <slug>
review-scope: <per-slice|slug-wide>
slice-slug: <slice-slug or "" if slug-wide>
status: complete
stage-number: 7
created-at: "<iso-8601>"        # first run's timestamp — PRESERVE across re-runs
updated-at: "<iso-8601>"        # this run's timestamp
verdict: <ship|ship-with-caveats|dont-ship>     # from OPEN findings with pre-existing: false only
commands-run: [correctness, security, ...]      # cumulative union of every dimension ever run
metric-commands-run: <N>
metric-findings-total: <N>       # OPEN findings (status open|deferred|could-not-fix)
metric-findings-raw: <N>         # raw findings collected this run, pre-dedup
metric-findings-blocker: <N>     # OPEN blockers with pre-existing: false. Handoff's blocker gate reads this field; pre-existing defects never count here.
metric-findings-pre-existing: <N> # OPEN findings with pre-existing: true (any severity) — the ## Pre-existing Debt bucket
metric-findings-high: <N>        # OPEN, pre-existing: false
metric-findings-med: <N>         # OPEN
metric-findings-low: <N>         # OPEN
metric-findings-nit: <N>         # OPEN
metric-findings-resolved: <N>    # findings cleared by a re-run (status resolved)
metric-findings-total-ever: <N>  # every finding ever recorded (open + closed) — ledger size
runs:                            # compact per-invocation audit trail (frontmatter only; append one entry per run)
  - at: "<iso-8601>"
    dimensions: [correctness, security, ...]    # commands run THIS invocation
    verdict: <ship|ship-with-caveats|dont-ship>  # verdict snapshot after this run
    fix-commit: "<SHA | null>"                   # review-time fix commit this run, if any
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

## The Review
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Voice per `_narrative-voice.md` — no "This review implements…" openings. 1–4 short paragraphs. -->

## Verdict

**{Ship / Ship with caveats / Don't Ship}**

{3-4 sentence rationale. Name the most critical finding. State whether any blockers exist.}

## Domain Coverage

| Domain | Command | Status |
|--------|---------|--------|
| {domain} | `{command}` | {Clean / Issues / Blockers} |

## All Findings

ALL findings ever recorded — open AND closed. Resolved / fixed / dismissed rows are kept for history; they sort last within their severity.

| ID | Sev | Conf | Status | Pre | Surfaced | Source | File:Line | Issue |
|----|-----|------|--------|-----|----------|--------|-----------|-------|

**Open:** BLOCKER: {X} | HIGH: {X} | MED: {X} | LOW: {X} | NIT: {X}   **Pre-existing:** {X}
**Closed:** resolved: {X} | fixed: {X} | dismissed: {X}   **Ledger size (ever):** {N}
*(This run: {A} net-new, {B} re-confirmed, {C} resolved; merged from {M} raw findings across {K} commands)*

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

**Severity:** {level} | **Confidence:** {High/Med/Low} | **Pre-existing:** {true/false}
**Status:** {status} | **Surfaced:** {surfaced-at} | **Last seen:** {last-seen-at}  {— **Resolved:** {resolved-at} / **Fixed:** {fixed-at} when applicable}

## Pre-existing Debt

Findings whose defect exists on the base branch untouched by this diff (`pre-existing: true`, determined by diff test with `git blame` as tiebreaker). They do NOT count toward the verdict or blocker gate but are real debt — must not be silently dropped. Route each to `/wf intake fix <description>` (defects) or `/wf intake refactor <description>` (structural). Omit this section when no pre-existing findings exist.

| ID | Sev | Source | File:Line | Issue | Suggested routing |
|----|-----|--------|-----------|-------|-------------------|
| {ID} | {SEV} | {command} | {file}:{line} | {one-line issue} | `/wf intake fix\|refactor <desc>` |

## Triage Decisions

Accumulates across runs — decisions persist until re-triaged (Step 4b or `/wf review <slug> triage`). Update rows by ID; never drop a prior row.

| ID | Sev | Source | Decision | Notes |
|----|-----|--------|----------|-------|
| {ID} | {SEV} | {command} | {fix/defer/dismiss} | {user's reason or —} |

{All BLOCKER/HIGH/MED findings ever triaged. LOW/NIT listed as "untriaged".}

## Fix Status

Present once any finding has been through the fix loop. **Accumulating per-finding ledger** (one row per finding ever marked `Fix`), keyed by ID — update in place; never start a new per-run "round" table. Omit only when no finding has ever been fixed.

| ID | Sev | Source | Status | Fixed-at | Commit | Notes |
|----|-----|--------|--------|----------|--------|-------|
| {ID} | {SEV} | {command} | fixed / could-not-fix | {fixed-at} | {SHA or —} | {one-line summary} |

{List each `could-not-fix` finding under `## Recommendations → Must Fix (remaining)` with the
sub-agent's stated reason so the next stage knows what is still open.}

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
- **Option A:** `/wf handoff <slug>` — no OPEN blockers; all slices complete, ready for PR [reason]
- **Option B:** `/wf review <slug> [<slice>]` — OPEN blockers or `could-not-fix` findings remain; re-invoke to re-check the fixed code and merge fresh findings into the ledger (it resolve-sweeps what the fixes cleared) [reason, only if applicable]
- **Option C:** `/wf implement <slug> [<slice>] reviews` — escape hatch; remaining findings need stage-5 fix UI [reason, only if applicable]
- **Option D:** `/wf plan <slug> <next-slice>` or `/wf implement <slug> <next-slice>` — more slices to implement before handoff [reason, if applicable]
- **Option E:** `/wf ship <slug>` — skip handoff [reason, if applicable]
- **Option F:** `/wf intake <slug> from-review` — add new slices from findings (extension) [reason, if applicable]
- **Option G:** `/wf plan <slug> <slice> <correction>` — correct an *unbuilt* slice's plan directly (a built slice's correction is a new slice via Option F) [reason, if applicable]

---

# Step 5b: Write the rich fragment (MANDATORY — do not skip)

The sunflower view renders the review page from a sibling `.yaml` + `.html.fragment`. **Without them the page silently degrades to plain prose** — the Σ severity-heatmap, dimension chips, severity filter, and findings list never appear. The `post-write-verify` hook **BLOCKS the `.md` write (exit 2) when the sibling `.yaml` is missing** — author the `.yaml` first (or in the same turn) while findings are in context.

For each review `.md` written (`07-review.md` slug-wide, or `07-review-<slice-slug>.md` per-slice):

1. Write **`<stem>.yaml`** — structured data: `dimensions:` (severity × dimension heatmap matrix), `verdict:`, `findings:` (id, severity, dimension, file, line, message, evidence/diff, triage, **status**, **surfaced-at**), and metric counts. Schema: `siblingYamlSchemas.review` in `tests/frontmatter.schema.json`. **`findings:` and `counts:` = OPEN findings only** (open|deferred|could-not-fix) — resolved/fixed/dismissed history lives in the `.md` body. Bump `rev:` by 1 each run (first write = 1).
2. Write **`<stem>.html.fragment`** — one `<section class="fragment-review" data-artifact="review" data-rev="<n>">` carrying the **interactive layer**: Σ severity-heatmap, dimension chips + severity filter, findings list with per-finding evidence/diff/copy controls. **Body-only** (see `_fragment-authoring.md` → "Scope"): `review.mjs` already renders the heading, verdict block, and metric-row — do **not** repeat them; start at the heatmap.

Authoring rules (verifier Check 7 enforces these):

- Inline `<style>` scoped under `.fragment-review` / `.fr-*`.
- Inline `<script>` scoped via `document.currentScript.closest('.fragment-review')`.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: { name: 'review', artifact: 'review', counts: { findings: <n>, blockers: <n> } } }))`.
- Inline SVG only; no remote anything.
- All data deterministic from `.yaml` — same YAML → byte-identical output.

Full contract in [`reference/fragment-author-contract.md`](../../../../reference/fragment-author-contract.md); gallery at [`reference/fragments-gallery.html`](../../../../reference/fragments-gallery.html).

---

# Step 5c: Write per-dimension rich fragments (MANDATORY — do not skip)

Step 5b covers the sweep-level review page. Each **per-dimension** file — `07-review-<command>.md` (slug-wide) or `07-review-<slice-slug>-<command>.md` (per-slice) — renders through `review-dimension.mjs`. **Without a sibling `.yaml` it falls back to `renderSimple`** (plain prose, no interactive findings); `post-write-verify` BLOCKS (exit 2) a `type: review-command` `.md` written without it.

Per-dimension siblings are authored by the **Step-3 review sub-agent** (which holds the findings in context). This section is the shape spec that sub-agent follows. At Step 5b, confirm every per-dimension `.md` has its `.yaml` (or `fragment: none` for a clean dimension) and author any the sub-agent missed. For each per-dimension review `.md`:

1. Write **`<stem>.yaml`** — schema `siblingYamlSchemas.review-dimension` in `tests/frontmatter.schema.json`: `artifact: review-dimension`, `dimension`, `parent` (the sweep `07-review.md`), `rev`, `verdict` (`ship|caveats|no`), `summary`, `counts` (blocker/high/med/low/nit), `findings` (id, severity, file, line, confidence, action, msg, evidence, fix, **status**, **surfaced-at**) — scoped to this dimension only. `findings:` + `counts:` = OPEN findings only; bump `rev:` by 1 each run.
2. Write **`<stem>.html.fragment`** — one `<section class="fragment-review-dimension" data-artifact="review-dimension" data-rev="<n>">` carrying the **interactive layer**: severity-filter pill bar, sortable findings list (by severity / file:line), per-finding expandable evidence→fix rows. **Body-only**: `review-dimension.mjs` already renders the heading, verdict block, and metric-row, and suppresses its static findings list when a fragment is present (see `renderers/review-dimension.mjs` lines 64–67) — start at the filter bar, do not repeat the chrome.

Authoring rules (verifier Check 7 enforces these):

- Inline `<style>` scoped under `.fragment-review-dimension`. Use a **distinct prefix** (e.g. `.rd-*`) — both fragments can appear on one slug page.
- Inline `<script>` scoped via `document.currentScript.closest('.fragment-review-dimension')`.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: { name: 'review-dimension', artifact: 'review-dimension', dimension: '<dim>', counts: { findings: <n>, blockers: <n> } } }))`.
- Inline SVG only; no remote anything.
- All data deterministic from `.yaml` — same YAML → byte-identical output.

Load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_fragment-authoring.md` first; full contract in [`reference/fragment-author-contract.md`](../../../../reference/fragment-author-contract.md).

---

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](../_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

---

# Step 6: Update Index and Return

1. Update `00-index.md` frontmatter:
   - `current-stage: review`, `status: active`, `progress.review: complete` (stays `complete` on every accumulating re-run)
   - Add review artifacts to `workflow-files` (idempotent — do not duplicate entries a prior run already added):
     - **Per-slice**: add `07-review-<slice-slug>.md` and every `07-review-<slice-slug>-<command>.md` (do NOT remove sibling slices' review files).
     - **Slug-wide**: add `07-review.md` and every `07-review-<command>.md`. Leave any prior per-slice review files in `workflow-files`.
   - Set `next-command` and `next-invocation` based on verdict.
2. Return the compact chat summary with verdict and options.

# Adaptive routing — evaluate what's actually next

Routing is **driven by OPEN findings** plus `verdict:`. The fix loop is owned by this stage; `/wf implement <slug> [<slice>] reviews` survives only as a manual escape.

After completing the fix loop, evaluate the (open-findings) verdict and present the user with ALL viable options:

**Option A: Handoff** → `/wf handoff <slug>`
Use when: `verdict: ship` (or ship-with-caveats where caveats are not blockers) AND no OPEN blockers remain AND all intended slices are complete. Handoff aggregates all complete slices automatically.
**If more slices remain**: use Option D first, then run `/wf handoff <slug>` once for the full PR.

**Option B: Re-invoke review (accumulating re-run)** → `/wf review <slug> [<slice>]`
Use when: OPEN blocker or `could-not-fix` findings remain. Re-invocation re-checks the fixed code, merges fresh findings, and resolve-sweeps what the fixes cleared (no round counter, no `convergence` state). State unresolved findings clearly before recommending.
**Compact recommended before re-invoking** — tell the user: "Consider `/compact` first — workflow state lives in the artifact files on disk and SessionStart re-reads it automatically after compaction."

**Option C: Escalate to manual implement** → `/wf implement <slug> [<slice>] reviews`
Use when: Remaining findings need design rethink, cross-cutting refactor, or input the review agent cannot supply — i.e., re-invoking review would surface the same unfixable findings again. Also when the user prefers stage 5's per-finding sequential UI.

**Option D: Next slice** → `/wf plan <slug> <next-slice>` or `/wf implement <slug> <next-slice>`
Use when: This slice is approved AND more slices remain. Check `03-slice.md`.
**Compact recommended** — prior slice lifecycle is noise for the next slice.

**Option E: Skip handoff, go to Ship** → `/wf ship <slug>`
Use when: No team to hand off to, no PR description needed, CI/CD handles the rest.

**Option F: Extend scope** → `/wf intake <slug> from-review`
Use when: Findings reveal **missing capability** rather than broken implementation (never built, not wrong). Signal: "X should also do Y" / "no handler for Z" rather than "X does Y incorrectly".

**Option G: Correct an unbuilt slice** → `/wf plan <slug> <slice> <correction>` (built work → new slice via F)
Use when: Findings reveal the **slice definition or ACs were wrong** — the implementation did what it was told, but what it was told was incorrect. Signal: multiple findings stem from the same incorrect spec assumption, or the approach is fundamentally wrong rather than buggy.

Write ALL viable options into `## Recommended Next Stage`.

---

