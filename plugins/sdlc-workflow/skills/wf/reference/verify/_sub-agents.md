# Verify sub-agent charters

`verify.md` Step 4 dispatches these charters per [../_subagents.md](../_subagents.md). Children may build, boot, and drive; they never edit source. Each returns evidence; the parent composes the artifact and the verdict. Inject the active `steer.md` entries into every prompt ([../_steering.md](../_steering.md)).

This file holds sub-agents 1, 2, and 5. Two charters have their own file, because they apply only in some runs:

- Sub-agent 3, Interactive & Runtime-Truth Verification: [_runtime-evidence.md](_runtime-evidence.md). Load it when the slice has a user-observable AC.
- Sub-agent 4, Augmentation Re-verification: [_augmentation.md](_augmentation.md). Load it when `02c-craft.md` exists or `augmentations:` is not empty.

### Functional sub-agent 1 — Static Analysis & Build

Prompt the agent with all of the following.

**Lint and format.** Detect the linters from config files (`.eslintrc*`, `biome.json`, `ruff.toml`, `.golangci.yml`, `Cargo.toml [lints]`). Run them (`npm run lint`, `ruff check .`, `golangci-lint run`, `cargo clippy`). Report pass/fail, errors vs warnings, and which errors sit in files this slice changed vs pre-existing.

**Type checking.** Detect the type system (`tsconfig.json`, `mypy.ini`, `pyright`, the Go or Rust compiler); run it (`npx tsc --noEmit`, `mypy .`, `go build ./...`, `cargo check`); report pass/fail and slice-affected vs pre-existing errors.

**Build.** Run the project build (`npm run build`, `go build ./...`, `cargo build`, `make`); report success/failure, warnings, and the output artifact.

**Default performance gate (every slice, with or without the `benchmark` augmentation).**
- **Bundle size (web):** compare the output artifact size against the base branch through a temporary worktree, never a stash: `git worktree add <tmp-dir> <base-branch>`, build there, `du -sh` both outputs, `git worktree remove <tmp-dir>`. The working tree's in-progress state stays untouched. A size increase ≥ 20% in any chunk is HIGH. Record `metric-bundle-size-delta-pct`.
- **Build time delta:** wall-clock time of the current build vs the base-branch build (from the worktree comparison, else CI cache statistics). An increase ≥ 30% is a WARN.
- **Startup time (service/CLI):** measure cold start (`time curl -s localhost:<port>/health` after a fresh start). An increase ≥ 15% vs the base branch is HIGH.
- If the worktree comparison is impossible, record `metric-bundle-size-delta-pct: skipped — <reason>` and the absolute artifact size. This gate is the lightweight floor; the `benchmark` augmentation adds profiling.

**Security scanning (every slice).**
- **Dependency CVEs:** `npm audit --audit-level=high`, `cargo audit`, `pip-audit`, `go list -json -m all | nancy sleuth`, or the project's equivalent. New critical/high CVEs introduced by this slice are BLOCKER.
- **Secret detection:** `git diff <base-branch>...HEAD | trufflehog --stdin` or `gitleaks detect --source=. --log-opts="<base>..<head>"` when available; otherwise grep the diff for API key, secret, password, token, and credential assignments in string literals. Any finding is BLOCKER.
- **SAST:** `semgrep --config=auto` on touched files when semgrep is installed; report new HIGH+ findings in slice-modified files.
- Report `security-scan-result: pass | fail | skipped` (`skipped` only when no tooling is installed and no pattern matched). New findings are BLOCKER regardless of the convergence verdict.

**`sdlc-debt:` marker hygiene (this slice's diff only).** Run `git diff <base-branch>...HEAD | grep -nE 'sdlc-debt:'`. A marker is **well-formed** when it names a ceiling (the known limitation: global lock, O(n²) scan, naive heuristic, hard-coded value) and an upgrade path; a bare marker is LOW. A marker is **recorded** when the shortcut appears in `05-implement-<slice-slug>.md` `## Anything Deferred` or `## Known Risks / Caveats`; an unrecorded marker is invisible debt, MED. Verify validates freshly written markers, not the repo's debt backlog (that is retro's reconcile and `/wf intake simplify codebase`). Report `debt-markers-found`, `debt-markers-malformed`, `debt-markers-unrecorded`; malformed or unrecorded markers enter the Step 7.6 fix loop (Fix = make it well-formed and record it; the shortcut itself stays).

### Functional sub-agent 2 — Test Execution

Prompt the agent with all of the following.

**Test receipt.** Read `.ai/workflows/<slug>/.test-receipt-<slice-slug>.json` when it exists. When its `result` is `pass` and `git diff --quiet <sha> HEAD -- . ':!.ai'` succeeds (no code changed since), its `commands` count as run green: report them with `source: receipt <sha>`, and run only the checks below that the receipt does not cover. Otherwise ignore it.

**Unit tests.** Identify the test files covering the slice's affected modules (grep imports); run them first with verbose output; then run the full unit suite for regressions, unless the receipt covers it. Report total/passed/failed/skipped, failures with full error output, and duration.

**Integration tests.** Identify and run the suites covering the affected area with verbose output; report the same counts; note flaky tests (recent skip/unskip patterns in git log).

**Coverage (when configured).** Report coverage for the files this slice changed; flag new code paths at 0%.

**Skipped-gating-spec mapping (a skip is a missing-evidence event, not a green).** A spec that did not execute (guard exit, `.skip`/`.todo`, missing env or secret, filtered out) produced no evidence for the AC it gates and cannot inherit the suite's green. Map every skipped spec to its AC and record `skipped-gating-specs: [{spec, ac, precondition}]` (`precondition` = the unmet reason, such as `E2E_ADMIN_USER_EMAIL` unset). The AC gate (Step 7.5) routes each such AC through another rung, a deferral with a probe receipt, or `blocked-runtime-evidence-missing`.

**Cross-slice regression check (when sibling slices were verified).** Read `06-verify.md`; collect every other slice with `result: pass` or `partial`. For each sibling, read `files-modified` from `05-implement-<sibling-slug>.md`; an overlap with this slice's `files-modified` marks a regression target. Re-run the suite scoped to the overlapping files (or the sibling's recorded command from `06-verify-<sibling-slug>.md` `## Automated Checks Run`). Report `cross-slice-regressions-found: <N>` and pass/fail per sibling; a newly failing sibling is BLOCKER. No siblings → `cross-slice-regressions-found: 0` and "no prior verified slices."

### Web research sub-agent 5 — Freshness: Dependencies, AC Staleness, and Standards Drift

Launch when any of these holds: a test failure occurred; the plan is older than 14 days (`created-at` in `04-plan-<slice-slug>.md`); the slice modifies an integration point with an external API or schema.

**Dependency drift.** For each failure, check whether the failing library or API released breaking changes since the plan was written; search for known test-compatibility issues with the project's dependency versions; check whether fixtures or mock data reference external schemas or APIs that changed.

**AC staleness (when plan age > 14 days or the slice touches external integrations).** For each AC naming an external API, schema, protocol, or third-party service, search for breaking changes or deprecations since the plan's `created-at`. Flag stale criteria `ac-stale: true` with a one-line change description; staleness is not a verify failure, it surfaces under `## Freshness Research` and routes to `/wf plan` (Option E) when the drift is material. Record `ac-staleness-checked: true | false` and `ac-stale-count: <N>`.
