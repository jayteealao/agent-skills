---
name: wf-review
description: Intelligent review dispatch. Reads workflow artifacts and diff, selects relevant review commands, spawns one parallel sonnet sub-agent per command (each writes its findings to file), then aggregates, deduplicates, and triages findings via AskUserQuestion into a unified review verdict. Re-run with "triage" to revisit deferred findings.
argument-hint: <slug> [slice | triage]
disable-model-invocation: true
---

You are running `wf-review`, **stage 7 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → `7·review` → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md`, `03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`, `06-verify-<slice-slug>.md` (recommended) |
| Produces | `07-review.md` + `07-review-<command>.md` per selected command |
| Next | `/wf-handoff <slug> <selected-slice>` (if approved) or `/wf-implement <slug> <selected-slice>` (if changes needed) |

# CRITICAL — execution discipline
You are a **review dispatch orchestrator**, not a problem solver.
- Do NOT fix issues — only report and prioritise them. Fixes belong in `/wf-implement`.
- Do NOT handoff or ship — those are later stages.
- Do NOT run the reviews yourself — you **select commands and dispatch sub-agents**. Each sub-agent runs one review command independently.
- Your job is: **orient → gather change stats → select commands → dispatch sub-agents → aggregate → write verdict**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- If you catch yourself about to start reviewing code directly, STOP — spawn a sub-agent instead.

# TRIAGE MODE

If the second argument is `triage` (e.g., `/wf-review my-feature triage`), skip the full review and jump directly to re-triage:

1. **Resolve slug** from the first argument. Read `00-index.md` for `selected-slice`.
2. **Read `07-review.md`** — parse the `## Triage Decisions` section. Collect all findings marked `deferred` or `untriaged`.
3. **If no findings to triage** → print "No deferred or untriaged findings. Run `/wf-review <slug>` for a full review." and STOP.
4. **Present for triage via AskUserQuestion** — follow the same protocol as Step 4b below, but only show `deferred` and `untriaged` findings.
5. **Update `07-review.md`** — overwrite the `## Triage Decisions` section with updated decisions. Update `## Recommendations` to reflect new fix/defer/dismiss counts. Preserve all other sections.
6. **Print summary** — show counts of fix/defer/dismiss and list findings newly marked for fixing.

Then STOP — do not continue to the full review workflow.

---

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector**. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Resolve the slice-slug**: If a slice-slug was passed, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
4. **Check prerequisites:**
   - `05-implement-<slice-slug>.md` must exist. If missing → STOP. Tell the user: "Run `/wf-implement <slug> <slice-slug>` first."
   - `06-verify-<slice-slug>.md` is recommended but not strictly required — review can proceed without it if the user explicitly skipped verify.
   - If `06-verify-<slice-slug>.md` exists and shows `Status: Awaiting input` → STOP.
   - If `current-stage` in the index is already past review → WARN before overwriting.
5. **Read the slice's full context:**
   - `03-slice-<slice-slug>.md` — acceptance criteria and scope
   - `04-plan-<slice-slug>.md` — what was planned
   - `05-implement-<slice-slug>.md` — what was built
   - `06-verify-<slice-slug>.md` (if exists) — verification results
   - `02-shape.md` — overall spec
   - `03-slice.md` — master slice index (for sibling context)
   - `po-answers.md`
6. **Carry forward** `open-questions` from the index.
7. **Branch check:** Read `branch-strategy` and `branch` from `00-index.md`. If `branch-strategy` is `dedicated`, confirm you are on the correct branch. Review diffs must be generated against the implementation branch. Use `git diff <base-branch>...<branch>` to get the full change set for review dispatch.

# Purpose
Intelligent review dispatch. Analyse the change set, select which of the 30 review commands are relevant, launch one parallel sonnet sub-agent per selected command, then aggregate all findings into a unified review verdict.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <paths>` (list all review files written)
- `verdict: <Ship / Ship with caveats / Don't Ship>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

---

# Task Tracking

After completing Step 2 (command selection), create a task list using TaskCreate before dispatching sub-agents:
- One task per selected review command: `subject: "Review: {command}"`, `activeForm: "Dispatching {command} review"`, `metadata: { slug, stage: "review", slice: "<slice-slug>", command: "{command}" }`.
- Review command tasks are independent — no `addBlockedBy` between them (they run as parallel sub-agents).
- Add bookkeeping tasks:
  - "Aggregate + deduplicate findings" — `addBlockedBy: [all review command tasks]`
  - "Write 07-review.md + verdict" — `addBlockedBy: [aggregate task]`

As each sub-agent returns its `07-review-<command>.md` file: `TaskUpdate(taskId, status: "completed")`.
When starting aggregation: `TaskUpdate(aggregateTaskId, status: "in_progress")`. Mark `completed` when done.
When writing final verdict: `TaskUpdate(writeTaskId, status: "in_progress")`. Mark `completed` when done.

---

# Step 1: Gather Change Statistics

From `05-implement.md`, extract the files changed and the nature of changes. Also run:

```bash
# Changed file list
git diff --name-only HEAD

# Diff stats
git diff --stat HEAD

# Full diff for pattern analysis
git diff HEAD
```

Extract:
- **File types changed** — extensions and directory patterns
- **Change size** — total lines added/removed
- **Change type signals** — new files vs modifications vs deletions
- **Content signals** — patterns in the diff (SQL queries, auth checks, migrations, React components, Terraform, etc.)

---

# Step 2: Select Review Commands

Each command maps to `${CLAUDE_PLUGIN_ROOT}/commands/review/<name>.md`.

### Core (always include for any code change)
- `correctness` — logic, invariants, edge cases
- `security` — vulnerabilities, insecure defaults
- `code-simplification` — missed reuse, unnecessary complexity, inefficiencies

### By File Type

**Backend source** (`.ts`, `.js`, `.mjs`, `.py`, `.go`, `.java`, `.cs`, `.rb`, `.php`, `.rs`, `.kt`, `.swift`, `.scala`, `.ex`, `.exs`):
- `testing` — if test files are absent or coverage looks thin
- `maintainability` — if any function is long or complex

**Backend with concurrency signals** (async/await, goroutines, threads, mutex, locks, Promise, channels, `@Async`, `CompletableFuture`, `select`, `sync.`, `atomic`):
- `backend-concurrency`

**Refactor signals** (large deletion-to-addition ratio, PR mentions "refactor"/"restructure"/"rename"/"extract"/"move"):
- `refactor-safety`
- `maintainability`

**Architecture signals** (new directories, new top-level modules, new service files, changed import graphs, new `index.*` files):
- `architecture`
- `overengineering` — if new abstractions or generic patterns appear

**Performance signals** (SQL queries, ORM calls, loops over collections, `ORDER BY`/`GROUP BY`, caching, algorithms, `reduce`/`map`/`filter` over large arrays):
- `performance`

**Scalability signals** (queue consumers, background jobs, batch operations, fan-out, multi-tenant, horizontal scaling):
- `scalability`

**API/contract signals** (route definitions, OpenAPI/Swagger, REST handlers, GraphQL schemas, gRPC proto, SDK entry points, versioned paths `/v1/`):
- `api-contracts`

**Data persistence signals** (DB queries, ORM models, schema definitions, `INSERT`/`UPDATE`/`DELETE`, transactions):
- `data-integrity`

**Migration files** (`migrations/`, `db/migrate/`, `alembic/versions/`, `flyway/`, `*_migration.*`):
- `migrations`
- `data-integrity` (if not already selected)

**Privacy/PII signals** (user profiles, auth code, personal data fields, payment processing, GDPR, logging in auth/payment paths):
- `privacy`

**Supply chain signals** (`package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, lockfiles, new external imports):
- `supply-chain`

**Infrastructure signals** (Dockerfile, `docker-compose.*`, Terraform `*.tf`, Pulumi, Helm, CloudFormation, K8s YAML, Ansible):
- `infra`
- `infra-security`

**CI/CD signals** (`.github/workflows/*.yml`, `.gitlab-ci.yml`, Jenkinsfile, Makefile deploy targets):
- `ci`

**Release signals** (CHANGELOG.md, version fields, git tags, release configs):
- `release`

**Logging signals** (log statements, logger config, structured logging):
- `logging`

**Observability signals** (metrics, OpenTelemetry, Prometheus, alerting rules, health checks):
- `observability`

**Cost signals** (cloud SDK calls, paid API integrations, storage operations, AI/ML inference):
- `cost`

**Frontend source** (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, `.scss`):
- `accessibility`
- `frontend-accessibility`
- `frontend-performance`
- `ux-copy`

**Documentation signals** (`*.md`, `*.mdx`, `*.rst`, `docs/`, docstrings):
- `docs`

**Style signals** (any code change with naming convention inconsistencies):
- `style-consistency` — only if inconsistency is apparent

**DX signals** (scripts, Makefile, README, CONTRIBUTING, dev tooling config):
- `dx` — only if developer-facing tooling is affected

### Selection Constraints
- **Minimum**: 3 commands (always `correctness` + `security` + `code-simplification`)
- **Maximum**: 12 — prefer depth over breadth for focused changes
- **User focus override**: if the user specified a focus ("check security"), include those + `correctness`, drop unrelated
- **Config/docs-only**: drop `correctness`/`backend-concurrency`/`testing`/`code-simplification`; keep `security`, `docs`, relevant infra/release
- **Test-only changes**: keep `testing`, `correctness`, `code-simplification`; drop most others

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

For EACH selected command, spawn a **sonnet** sub-agent. All agents run in parallel.

**Each sub-agent receives this prompt:**

```
Execute the review command at `${CLAUDE_PLUGIN_ROOT}/commands/review/{command-name}.md`.

Scope: git diff HEAD (or the specific files from the implementation)
Workflow slug: {slug}
Selected slice: {slice}

Read the command file and follow its WORKFLOW exactly. Perform the review for the given scope.

IMPORTANT: Write your complete review findings to the file:
  `.ai/workflows/{slug}/07-review-{command-name}.md`

Use this structure for the file (YAML frontmatter first, then markdown):

```yaml
---
schema: sdlc/v1
type: review-command
slug: {slug}
slice-slug: {slice}
review-command: {command-name}
status: complete
updated-at: "{timestamp}"
metric-findings-total: {N}
metric-findings-blocker: {N}
metric-findings-high: {N}
result: clean | issues-found | blockers-found
tags: []
refs:
  review-master: 07-review.md
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

Write the file, then return a brief summary of what you found.
```

Wait for ALL sub-agents to complete before proceeding.

---

# Step 4: Aggregate and Deduplicate

After all sub-agents finish:

1. **Read every `07-review-<command>.md` file** they wrote.
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

After deduplication, present ALL deduplicated findings to the user for triage using AskUserQuestion. This gives the user explicit control over what gets fixed, deferred, or dismissed.

**For BLOCKER and HIGH findings** — present each individually:

Use AskUserQuestion with one question per finding (batch up to 4 per call):
- **header**: the finding ID (e.g., "CR-1", "CS-2", "SEC-3")
- **question**: `"{Source command}: {one-line issue description} at {file}:{line}"`
- Options:
  - `Fix` / label: "Fix this", description: "Address in next implement pass"
  - `Defer` / label: "Defer", description: "Revisit later — run /wf-review <slug> triage"
  - `Dismiss` / label: "Not an issue", description: "False positive or intentional"

**For MED findings** — present as a batch:

Use AskUserQuestion with `multiSelect: true`:
- **header**: "MED findings"
- **question**: "Select which MED findings to address"
- Options: one per MED finding, label is `{ID}: {title}`, description is `{file}:{line} — {one-line description}`

**For LOW and NIT findings** — list in the report but do NOT prompt. Mention count in the triage summary.

If there are no findings (all commands returned clean), skip this step.

---

# Step 5: Write Review Files

Write the master `07-review.md`:

```yaml
---
schema: sdlc/v1
type: review
slug: <slug>
slice-slug: <slice-slug>
status: complete
stage-number: 7
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
verdict: <ship|ship-with-caveats|dont-ship>
commands-run: [correctness, security, ...]
metric-commands-run: <N>
metric-findings-total: <N>
metric-findings-raw: <N>
metric-findings-blocker: <N>
metric-findings-high: <N>
metric-findings-med: <N>
metric-findings-low: <N>
metric-findings-nit: <N>
tags: []
refs:
  index: 00-index.md
  slice-def: 03-slice-<slice-slug>.md
  implement: 05-implement-<slice-slug>.md
  verify: 06-verify-<slice-slug>.md
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

## Recommendations

### Must Fix (triaged "fix")
{List with finding IDs and estimated effort}

### Should Fix (MED triaged "fix")
{List}

### Deferred (triaged "defer")
{List — re-triage later via `/wf-review <slug> triage`}

### Dismissed
{List with finding IDs and reason}

### Consider (LOW/NIT — not triaged)
{List}

## Recommended Next Stage
- **Option A:** `/wf-handoff <slug> <slice>` — approved [reason]
- **Option B:** `/wf-implement <slug> <slice>` — fix blocking issues [list what needs fixing]
- **Option C:** `/wf-ship <slug> <slice>` — skip handoff [reason, if applicable]
- **Option D:** `/wf-plan <slug> <next-slice>` — next slice [reason, if applicable]

---

# Step 6: Update Index and Return

1. Update `00-index.md` frontmatter:
   - `current-stage: review`
   - `status: active`
   - `progress.review: complete`
   - Add all `07-review*.md` files to `workflow-files`
   - Set `next-command` and `next-invocation` based on verdict
2. Return the compact chat summary with verdict and options.

# Adaptive routing — evaluate what's actually next
After completing the review, evaluate the findings and present the user with ALL viable options:

**Option A: Handoff** → `/wf-handoff <slug> <selected-slice>`
Use when: No blocking issues. Approved (possibly with minor notes).

**Option B: Fix and re-implement** → `/wf-implement <slug> <selected-slice>`
Use when: There are blocking issues. List what needs changing.
**Compact recommended before proceeding** — review dispatch chatter (sub-agent outputs, aggregation, triage) is noise for fixing. Tell the user: "Consider running `/compact` before `/wf-implement` — the PreCompact hook will preserve workflow state and triage decisions are in `07-review.md`."

**Option C: Skip handoff, go to Ship** → `/wf-ship <slug> <selected-slice>`
Use when: No team to hand off to, no PR description needed.

**Option D: Next slice** → `/wf-plan <slug> <next-slice>` or `/wf-implement <slug> <next-slice>`
Use when: This slice is approved AND more slices remain. Check `03-slice.md`.
**Compact recommended** — previous slice's full lifecycle (implement + verify + review) is noise for the next slice.

Write ALL viable options into `## Recommended Next Stage`.
