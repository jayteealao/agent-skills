---
description: Dependency update workflow. Scans package manifests for outdated and vulnerable dependencies, researches each via web search, plans updates grouped by risk, implements, and verifies.
argument-hint: [package-name|--security-only|--audit-only]
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-update-deps`, a **dependency maintenance workflow**.

# Slug-mode (read before proceeding)

If `/wf-quick`'s dispatcher selected **slug-mode** in Step 0 (the first argument after the sub-command matched a non-closed slug in `.ai/workflows/INDEX.md`), the *Step 1 — Slug-mode contract* in `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/SKILL.md` overrides the standalone instructions below. Substantively:

- **One artifact, in the existing workflow.** Write `.ai/workflows/<slug>/03-slice-update-deps-<descriptor>.md` (collision suffix `-2`, `-3` if needed; descriptor defaults to scope or UTC date). Frontmatter: `type: slice`, `slice-slug: update-deps-<descriptor>`, `slice-type: update-deps`, `compressed: true`, `origin: wf-quick/update-deps`, `stage-number: 3`, `status: defined`.
- **Same content, different home.** Body carries the same sections the standalone update-deps would have written to `01-update-deps.md` (dependency scan, proposed bumps, lockfile-change plan, compatibility/breaking-change notes, verification plan), under a `# Compressed Slice: update-deps` heading with a one-line provenance preamble. The companion `.ai/dep-updates/` artifacts (if the standalone flow normally writes them) may still be written — they live outside `.ai/workflows/` and are unaffected by slug-mode.
- **No new workflow, no new branch, no `01-update-deps.md`, no new top-level `00-index.md`.** The slug already owns those.
- **Index updates:** append the slice file to `00-index.md.workflow-files`, append `{slug: update-deps-<descriptor>, slice-type: update-deps, created-at: <iso>}` to `00-index.md.compressed-slices` (create the array if missing). If `.ai/workflows/<slug>/03-slice.md` exists, also append `{slug, status: defined, slice-type: update-deps, compressed: true}` to its `slices`, bump `total-slices`, update `updated-at`. Do not modify `current-stage`, `selected-slice`, `status`, `branch`, or `progress`. Also rewrite the `updated-at` column on `<slug>`'s row in `.ai/workflows/INDEX.md` (see SKILL.md Step 1 step 6).
- **Chat return:** one line — `wf-quick update-deps → compressed slice update-deps-<descriptor> on <slug>` — plus the recommended next step (`/wf implement <slug>` to apply the bumps, or `/wf-meta status <slug>` to inspect).

If slug-mode was not selected (first argument was not a known slug, or `INDEX.md` did not exist), ignore this section and proceed standalone per the instructions below.

# Pipeline
`1·scan` → `2·research` → `3·prioritize` → `4·plan` → `5·implement` → `6·verify`

| | Detail |
|---|---|
| Requires | A project with a package manifest (`package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pom.xml`, `pubspec.yaml`, etc.) |
| Produces | `.ai/dep-updates/<run-id>/` artifacts |
| No argument | Scan and update all dependencies |
| `<package-name>` | Focus on a single named package |
| `--security-only` | Prioritize and update only CVE-affected packages |
| `--audit-only` | Run scan and research only — write the plan but do not implement |

# CRITICAL — execution discipline
You are a **dependency update orchestrator**.
- Do NOT make application code changes beyond what is required by a dependency update (e.g., API changes forced by a major version bump).
- Do NOT update lock files manually — always use the package manager's own commands (`npm update`, `pip install --upgrade`, `go get`, `cargo update`, etc.).
- Do NOT batch major version updates across multiple packages in a single commit. Major updates are implemented one at a time.
- If an update causes test failures that are not trivially fixable → mark that package as `blocked` and continue to the next. Do not fix application code to make tests pass — surface the blocker.
- Follow the numbered steps below exactly in order.

# Step 0 — Orient (MANDATORY)
1. **Parse arguments** from `$ARGUMENTS`:
   - No argument → `mode: all`
   - Argument is a package name → `mode: single`, `target-package: <name>`
   - Argument is `--security-only` → `mode: security-only`
   - Argument is `--audit-only` → `mode: audit-only` (stop after Step 4, do not implement)
2. **Identify package manager(s):** Read the project root for manifest files. A project may have multiple (e.g., Node.js frontend + Python backend). List all.
3. **Generate run ID:** `deps-<YYYYMMDD-HHMM>` (use `date +"%Y%m%d-%H%M"` via Bash).
4. **Create run directory:** `.ai/dep-updates/<run-id>/`.

# Step 1 — Scan
Read all package manifests and produce a complete dependency inventory.

For each manifest found:
- Read the manifest file (package.json, requirements.txt, go.mod, Cargo.toml, etc.)
- Run the package manager's built-in outdated/audit command:
  - Node.js: `npm outdated --json` and `npm audit --json`
  - Python: `pip list --outdated` and `pip-audit` (if available) or `safety check`
  - Go: `go list -u -m all` and `govulncheck ./...` (if available)
  - Rust: `cargo outdated` and `cargo audit`
  - Java: check for `mvn versions:display-dependency-updates` or `gradle dependencyUpdates`
- For `mode: single`, filter to only the target package.
- For `mode: security-only`, run the audit command and identify all packages with CVE findings.

Write `scan.md` with the full dependency inventory.

**`scan.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: dep-scan
run-id: <run-id>
mode: <all|single|security-only|audit-only>
target-package: <name or "all">
package-managers: [<list>]
total-deps: <count>
outdated-count: <count>
vulnerable-count: <count>
status: complete
created-at: <real timestamp via bash>
---
```

**`scan.md` body — Required sections:**
- `## Security Vulnerabilities` — list CVEs with severity, affected package, and fix version
- `## Outdated Packages` — table: package | current | latest | update-type (major/minor/patch) | days-behind
- `## Up to Date` — count only, no list needed

# Step 2 — Research
For each package that needs updating, launch parallel web research sub-agents. Group packages into batches of 3–5 to avoid over-parallelization.

**Model for every dispatched batch agent:** `haiku` (resolved from `${CLAUDE_PLUGIN_ROOT}/skills/wf-quick/router-metadata.json` `models.default` — `update-deps` has no override). REQUIRED on every `Task` call. Each agent does web search + structured extraction (CVE list, breaking-change list, migration steps) per package — bounded extraction, not cross-package reasoning. Haiku is the right tier.

**For each package batch, launch one general-purpose sub-agent** prompted with:

For each package in this batch:

**Version & compatibility:**
- Web search for the latest stable version and release date
- Web search for the changelog or release notes between the current version and the latest
- Identify all breaking changes — API removals, renamed exports, changed behavior, new required config
- Check if there is a migration guide for the version jump

**Security:**
- Web search for CVEs, security advisories, or GitHub security alerts for this package at the current version
- Note the CVSS score and whether a fixed version is available

**Implementation best practices:**
- Web search for current recommended patterns for this package at the latest version
- Note any anti-patterns the project may currently use that the new version discourages
- Check for known gotchas specific to upgrading this package (common test failures, subtle behavior changes, peer dependency conflicts)

**Ecosystem compatibility:**
- Check whether the latest version is compatible with the project's runtime/language version
- Check whether it conflicts with other packages in the manifest (peer dependency requirements)

Each batch agent returns: package name, current version, latest version, update-type, breaking changes (list), migration steps (list), CVEs, compatibility notes, recommendation (update-now / update-with-migration / hold).

Write findings to `research.md`.

**`research.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: dep-research
run-id: <run-id>
packages-researched: <count>
packages-update-now: <count>
packages-migration-needed: <count>
packages-hold: <count>
status: complete
created-at: <real timestamp>
---
```

**`research.md` body — one section per package:**
```
## <package-name>
- Current: <version> | Latest: <version> | Update type: major/minor/patch
- CVEs: <list or "none">
- Breaking changes: <list or "none">
- Migration steps: <numbered list or "none required">
- Recommendation: update-now | update-with-migration | hold
- Reason: <one sentence>
```

# Step 3 — Prioritize
Group packages into four priority tiers based on scan + research findings:

| Tier | Condition | Action |
|------|-----------|--------|
| **P0 — Security** | Any active CVE at current version with a fix available | Update immediately, one at a time |
| **P1 — Major with migration** | Major version bump with breaking changes | Update with migration, one at a time |
| **P2 — Minor/patch, safe** | Minor or patch update, no breaking changes | Batch update (up to 10 at once) |
| **Hold** | Incompatible with runtime, blocked by peer conflict, or recommended hold | Document reason, do not update |

Append `## Priority Groups` to `research.md` with the four tiers listed.

If `mode: audit-only` → **STOP HERE**. Write `plan.md` (see Step 4) and return. Do not implement.

# Step 4 — Plan
Write `plan.md` — the complete update execution plan.

**`plan.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: dep-plan
run-id: <run-id>
p0-count: <count>
p1-count: <count>
p2-count: <count>
hold-count: <count>
estimated-commits: <count>
status: complete
created-at: <real timestamp>
---
```

**`plan.md` body:**
```
## P0 — Security Updates (implement first, one at a time)
For each package:
- Command to update: `<exact package manager command>`
- Test command to run after: `<test command>`
- What to verify: <specific behavior to check>
- Rollback: `<exact rollback command>`

## P1 — Major Updates with Migration (implement after P0, one at a time)
For each package:
- Migration steps: <numbered>
- Command to update: `<exact command>`
- Application code changes required: <list or "none">
- Test command: `<command>`
- Rollback: `<command>`

## P2 — Safe Batch Update
- Command to update all P2 packages: `<exact command>`
- Test command: `<command>`

## Hold — Not Updating
For each package:
- Reason: <one sentence>
- Revisit condition: <what would need to change>
```

**After writing:** Present a summary and ask the user to confirm before implementing:
```
AskUserQuestion:
  question: "Dependency update plan ready. P0: <N> security, P1: <N> major, P2: <N> safe, Hold: <N>. Proceed?"
  options:
    - Proceed with full plan
    - Proceed with P0 security updates only
    - Audit-only — save plan, do not implement
    - Adjust plan (describe changes)
```

# Step 5 — Implement
Execute the plan in tier order. Never mix tiers in a single commit.

**For each P0 package (sequential):**
1. TaskCreate: `"Update <package> (P0 security fix)"`
2. Run the update command
3. Run migration steps if any (from plan)
4. Run the test command — check for failures
5. If tests pass → **commit**: `fix(deps): update <package> to <version> (CVE-<id>)`
6. If tests fail → mark `blocked`, document failures, move to next package
7. TaskUpdate to completed

**For each P1 package (sequential):**
1. TaskCreate: `"Update <package> to v<version> (major)"`
2. Run migration steps
3. Apply any required application code changes (ONLY those forced by API changes in this package)
4. Run the test command
5. If tests pass → **commit**: `fix(deps): update <package> to <version> (major, migration applied)`
6. If tests fail → mark `blocked`, document failures, move to next package
7. TaskUpdate to completed

**For P2 packages (single batch):**
1. TaskCreate: `"Batch update safe dependencies (P2)"`
2. Run the batch update command
3. Run the full test suite
4. If tests pass → **commit**: `fix(deps): batch update <N> safe dependencies`
5. If tests fail → identify the culprit package via bisect or rollback individual packages, mark the failing one `blocked`
6. TaskUpdate to completed

Write `implement.md` after all tiers complete.

**`implement.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: dep-implement
run-id: <run-id>
updated: [<package@version>, ...]
blocked: [<package — reason>, ...]
commits: [<sha>, ...]
status: complete
created-at: <real timestamp>
---
```

# Step 6 — Verify
Run the full test suite against the updated state.

1. Run the complete test suite (not just the targeted tests from implementation): report pass/fail/skip counts
2. Run the build: `npm run build`, `go build ./...`, `cargo build`, etc.
3. If the project has integration tests or E2E tests, run them
4. Confirm no blocked packages left a broken state in the manifest (check for inconsistent lockfile)

Write `verify.md`.

**`verify.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: dep-verify
run-id: <run-id>
test-pass: <count>
test-fail: <count>
test-skip: <count>
build-pass: <true|false>
result: <PASS|PARTIAL|FAIL>
blocked-packages: [<list>]
status: complete
created-at: <real timestamp>
---
```

**`result: PARTIAL`** is valid when some packages were updated successfully and some were blocked. Document which packages remain at their old version and why.

# Workflow rules
- Store all artifacts under `.ai/dep-updates/<run-id>/`. Do not use `.ai/workflows/` for dep update runs.
- **Every artifact MUST have YAML frontmatter** with `schema: sdlc/v1`.
- **Timestamps must be real:** run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash for every `created-at`.
- Always use the package manager's own commands — never edit lockfiles directly.
- Never mix security updates with major version migrations in a single commit.
- Web search for every package being updated — do not rely solely on `npm outdated` output.

# Chat return contract
After completing, return ONLY:
- `run-id: <run-id>`
- `wrote: <paths>`
- Summary table: packages updated | blocked | held | test result
- ≤3 bullets on what needs attention (blocked packages, failed tests, hold packages to revisit)
- `options:` — always include "Review blocked packages manually" and "Run full test suite" as options
