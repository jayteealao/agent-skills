---
name: review
description: Intelligent code review. Analyses the change set or given scope, decides which of the 30 review commands are relevant, launches one parallel agent per selected command (each agent executes its command independently), then aggregates and deduplicates all findings into a single unified report. Use when the user asks to "review", "check", "audit", or "look at" their changes, or proactively before a merge. Each agent runs a full review in its domain; this skill owns the triage, dispatch, and synthesis.
---

# Intelligent Review Dispatch

Analyse what changed → select relevant review commands → run each in a parallel agent → aggregate into one report.

---

## Step 1: Determine Scope

Resolve scope from the invocation context:

1. **Explicit instruction**: if the user specified a PR number, commit range, file path, or branch — use that
2. **SESSION_SLUG context**: if a session is active, read `.claude/<SESSION_SLUG>/README.md` for scope hints
3. **Default**: `worktree` — `git diff HEAD`

Supported scopes:
- `worktree` → `git diff HEAD` + `git diff --name-only HEAD`
- `pr <number|url>` → `gh pr diff <number>` + `gh pr view <number>`
- `diff <range>` → `git diff <range>` + `git diff --name-only <range>`
- `file <path>` → read specific file(s)
- `repo` → recent changes from `git log --oneline -20`

---

## Step 2: Gather Change Statistics

Run the following to understand the shape of the change:

```bash
# Changed file list
git diff --name-only HEAD

# Diff stats (insertions/deletions per file)
git diff --stat HEAD

# Full diff (for pattern analysis)
git diff HEAD
```

From this, extract:
- **File types changed** — extensions and directory patterns
- **Change size** — total lines added/removed
- **Change type signals** — new files vs modifications vs deletions
- **Content signals** — patterns in the diff that indicate domain (SQL queries, auth checks, migrations, React components, Terraform, etc.)

---

## Step 3: Select Review Commands

Apply the rules below to build the command list. Each entry maps to a file at `${CLAUDE_PLUGIN_ROOT}/commands/review/<name>.md`.

### Core (always include for any code change)
- `correctness` — logic, invariants, edge cases
- `security` — vulnerabilities, insecure defaults

### By File Type

**Backend source** (`.ts`, `.js`, `.mjs`, `.py`, `.go`, `.java`, `.cs`, `.rb`, `.php`, `.rs`, `.kt`, `.swift`, `.scala`, `.ex`, `.exs`):
- `testing` — if test files are absent or test coverage looks thin
- `maintainability` — if any function is long or complex

**Backend with concurrency signals** (async/await, goroutines, threads, mutex, locks, Promise, channels, `@Async`, `CompletableFuture`, `select`, `sync.`, `atomic`):
- `backend-concurrency`

**Refactor signals** (large ratio of deletions to additions, PR description mentions "refactor", "restructure", "rename", "extract", "move"):
- `refactor-safety`
- `maintainability`

**Architecture signals** (new directories created, new top-level modules, new service files, changed import graphs, files in `src/`, `lib/`, `packages/`, `modules/`, new `index.*` files):
- `architecture`
- `overengineering` — if new abstractions or generic patterns appear

**Performance signals** (SQL queries, ORM calls, loops over collections, `ORDER BY`, `GROUP BY`, caching code, algorithms, data structures, `reduce`, `map`, `filter` over large arrays):
- `performance`

**Scalability signals** (queue consumers, background jobs, worker processes, batch operations, fan-out patterns, multi-tenant code, horizontal scaling config):
- `scalability`

**API/contract signals** (route definitions, OpenAPI/Swagger files, REST handlers, GraphQL schemas, gRPC proto files, SDK entry points, exported interfaces, versioned paths `/v1/`, `/v2/`):
- `api-contracts`

**Data persistence signals** (database queries, ORM models, repository files, schema definitions, `INSERT`/`UPDATE`/`DELETE` operations, transaction code):
- `data-integrity`

**Migration files** (files in `migrations/`, `db/migrate/`, `alembic/versions/`, `flyway/`, `liquibase/`, `schema/`, files named `*_migration.*`, `*migrate*`):
- `migrations`
- `data-integrity` (if not already selected)

**Privacy/PII signals** (user profile code, authentication code, personal data fields like email/name/phone/address, payment processing, health data, GDPR-related code, logging in auth/payment paths):
- `privacy`

**Supply chain signals** (`package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `Gemfile`, `pom.xml`, `build.gradle`, `pyproject.toml`, lockfiles, new `import` of external packages):
- `supply-chain`

**Infrastructure signals** (Dockerfile, `docker-compose.*`, Terraform `*.tf`, Pulumi, Helm `values.yaml`, CloudFormation, Kubernetes `*.yaml`/`*.yml` in `k8s/`/`infra/`/`deploy/`, Ansible):
- `infra`
- `infra-security`

**CI/CD signals** (`.github/workflows/*.yml`, `.gitlab-ci.yml`, `.circleci/config.yml`, `Jenkinsfile`, `Makefile` with deploy targets, `bitbucket-pipelines.yml`):
- `ci`

**Release signals** (`CHANGELOG.md`, version fields in `package.json`/`pyproject.toml`/`Cargo.toml`, `VERSION`, `version.go`, git tags, release configs):
- `release`

**Logging signals** (log statements, logger configuration, log format code, structured logging setup):
- `logging`

**Observability signals** (metrics registration, OpenTelemetry, Prometheus, Datadog, alerting rules, dashboard config, health check endpoints):
- `observability`

**Cost signals** (cloud SDK calls — AWS, GCP, Azure — paid API integrations, storage operations, AI/ML inference calls, per-request expensive operations):
- `cost`

**Frontend source** (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html` templates, `.css`, `.scss`, `.sass`, `.less`):
- `accessibility`
- `frontend-accessibility`
- `frontend-performance`
- `ux-copy`

**Documentation signals** (`*.md`, `*.mdx`, `*.rst`, `docs/`, `*.yaml` OpenAPI specs, docstrings changed):
- `docs`

**Style signals** (any code change — include if the diff shows naming convention inconsistencies or mixed patterns):
- `style-consistency` — only if style inconsistency is apparent in the diff

**DX signals** (scripts, `Makefile`, `README`, `CONTRIBUTING`, dev tooling config, `tsconfig`, `eslint`, `prettier`, `pre-commit`):
- `dx` — only if developer-facing tooling or onboarding is affected

### Selection Constraints

- **Minimum**: 2 commands (always `correctness` + `security`)
- **Maximum**: Use judgment — 12 commands is a large review; prefer depth over breadth for focused changes
- **If the user specifies a focus** ("check the security", "look at performance"): include those commands plus `correctness`; drop unrelated ones
- **Config/docs-only changes** (no source code): drop `correctness`, `backend-concurrency`, `testing`; keep `security`, `docs`, and any relevant infra/release commands
- **Test-only changes**: keep `testing`, `correctness`; drop most others unless patterns suggest issues

### Output the Selection

Before spawning agents, state clearly:
```
## Review Scope
- Files changed: {N} files, +{added} -{removed} lines
- File types: {list}
- Change signals detected: {list}

## Commands Selected ({N})
1. `{command}` — {reason}
2. `{command}` — {reason}
...
```

---

## Step 4: Spawn Parallel Agents

For each selected command, spawn a Task agent. All agents run in parallel.

**Agent prompt template:**

```
Execute the review command at `${CLAUDE_PLUGIN_ROOT}/commands/review/{command-name}.md`.

Scope: {SCOPE}
{If TARGET provided: Target: {TARGET}}
{If PATHS provided: Paths: {PATHS}}
{If SESSION_SLUG provided: Session: {SESSION_SLUG}}

Read the command file and follow its WORKFLOW exactly. Perform the review for the given scope. Return the complete review report — all sections, all findings, severity ratings, and evidence. Do not save files; return everything as your response.
```

Wait for all agents to complete before proceeding.

---

## Step 5: Aggregate and Deduplicate

### 5a. Collect All Findings

From each agent's returned report, extract the findings table entries (every row with an ID, severity, file:line, and description).

### 5b. Identify Duplicates

Two findings are duplicates if **any** of the following hold:
- Same `file:line` (or overlapping line range) cited in both findings
- Same root cause described, even if attributed to different categories (e.g., missing input validation flagged as both "correctness" and "injection vector")
- One finding is a symptom and another is the root cause — merge under the root cause

### 5c. Merge Rules

When merging duplicates:
- **Keep the highest severity** across all versions
- **Keep the most specific evidence** (prefer the finding with the longest code snippet and most precise line range)
- **Combine category labels** — note which domains flagged it (e.g., "Correctness + Security")
- **Keep the most actionable fix** — use the one with a concrete diff or code example

### 5d. Sort and Group

Final findings sorted by:
1. Severity: BLOCKER → HIGH → MED → LOW → NIT
2. Within each severity: by file path alphabetically

Group into sections by domain of primary responsibility.

---

## Step 6: Output Unified Report

Print the aggregated report to the conversation. Do not save to a file.

```markdown
# Review Report

**Scope:** {SCOPE} / {TARGET}
**Commands run:** {N} — {comma-separated list}
**Files reviewed:** {count} files, +{added} -{removed} lines

---

## Verdict

**{Ship / Ship with caveats / Don't Ship}**

{3-4 sentence rationale. Name the most critical finding. State whether any blockers exist.}

---

## Domain Coverage

| Domain | Command | Status |
|--------|---------|--------|
| {domain} | `{command}` | {✅ Clean / ⚠️ Issues / 🚨 Blockers} |
...

---

## All Findings

| ID | Sev | Conf | Source | File:Line | Issue |
|----|-----|------|--------|-----------|-------|

**Total:** BLOCKER: {X} | HIGH: {X} | MED: {X} | LOW: {X} | NIT: {X}
*(After deduplication: {N} findings merged from {M} raw findings across {K} commands)*

---

## Findings (Detailed)

### {ID}: {Title} [{SEVERITY}]

**Location:** `{file}:{line-range}`
**Source:** {command(s) that flagged this}

**Evidence:**
```
{snippet}
```

**Issue:** {What is wrong. Concrete failure or impact.}

**Fix:** {For HIGH+: specific suggested fix}

**Severity:** {SEVERITY} | **Confidence:** {High/Med/Low}

---

## Recommendations

### Must Fix (BLOCKER/HIGH)
{List with finding IDs and estimated effort}

### Should Fix (MED)
{List}

### Consider (LOW/NIT)
{List}
```
