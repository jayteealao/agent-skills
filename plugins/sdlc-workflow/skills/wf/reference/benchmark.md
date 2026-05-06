---
description: Performance benchmarking wrapper for an existing workflow. Runs in two modes: baseline (before implement — measures current performance) and compare (after implement — measures delta and flags regressions). Auto-detects which mode is needed based on whether a baseline already exists. Pass an explicit mode arg to override. Writes or updates 05c-benchmark.md in the existing workflow directory.
argument-hint: <slug> [baseline|compare]
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-benchmark`, a **performance benchmarking wrapper** that runs twice in the lifecycle — once before implement to record a baseline, and once after to measure the delta.

# Shape
This is a **wrapper**, not an entry point and not a standalone workflow. It writes `05c-benchmark.md` into an existing workflow directory.

```
existing-workflow/
  00-index.md          ← updated (augmentations registry)
  02-shape.md          ← read (scope + performance targets)
  04-plan-*.md         ← read (what is changing)
  05c-benchmark.md     ← written (baseline) / updated (compare)
```

# Two modes

| Mode | When to run | What it does |
|------|-------------|--------------|
| **baseline** | Before `/wf implement` | Identifies benchmark targets, runs benchmarks on current code, records numbers |
| **compare** | After `/wf implement`, before or during `/wf verify` | Runs same benchmarks on modified code, calculates delta, flags regressions |
| **auto-detect** (default) | Either time | If no `05c-benchmark.md` exists → baseline. If baseline exists with no comparison → compare. |

**Usage:**
- `/wf benchmark <slug>` — auto-detect mode (recommended)
- `/wf benchmark <slug> baseline` — force baseline (re-baseline after a major change)
- `/wf benchmark <slug> compare` — force compare

| | Detail |
|---|---|
| Requires | An existing workflow at `.ai/workflows/<slug>/` with `02-shape.md` present. |
| Produces | `05c-benchmark.md` (baseline run) or updated `05c-benchmark.md` (compare run) |
| Updates | `00-index.md` — adds entry to `augmentations:` list (baseline only) |
| Does NOT | Write application code, modify the plan, or advance the workflow stage. |
| Next (baseline) | `/wf implement <slug>` |
| Next (compare) | `/wf verify <slug>` — comparison data is available as additional context |

# CRITICAL — measurement discipline
You are a **performance analyst**, not an optimizer.
- Do NOT modify application code. Do NOT rewrite benchmarks to make them faster.
- Benchmarks must be run on the **actual code** as it currently exists — not on hypothetical or refactored versions.
- If no benchmark framework exists, construct ad-hoc timing measurements using shell commands or language built-ins. Document the measurement method so it can be reproduced exactly in compare mode.
- Do NOT mutate database state, send real API calls to production, or otherwise cause side effects. Benchmarks must be safe to run in a development environment.
- Follow the steps below in order. Mode-specific sections are labeled clearly.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug** from first argument. Must match an existing workflow directory.
   - If `.ai/workflows/<slug>/` does not exist → STOP: "No workflow `<slug>` found."
   - If `02-shape.md` does not exist → STOP: "No shape found for `<slug>`. Run `/wf shape <slug>` first."
2. **Resolve mode:**
   - If second argument is `baseline` → force baseline mode.
   - If second argument is `compare` → force compare mode.
   - If no second argument → auto-detect:
     - No `05c-benchmark.md` → baseline mode.
     - `05c-benchmark.md` exists with `mode: baseline` and no `comparison:` block → compare mode.
     - `05c-benchmark.md` exists with both baseline and comparison → WARN: "Benchmark already has baseline AND comparison data. Pass `baseline` to re-baseline or `compare` to re-compare. Stopping." Stop.
3. **Read the workflow context:**
   - Read `02-shape.md` — identifies the performance-sensitive areas in scope.
   - Read any `04-plan-*.md` — identifies which files and functions are being modified.
   - In compare mode, also read `05c-benchmark.md` in full — you must run the exact same targets.

# ━━━━━━━━━━━━━━━━━━━━━━
# BASELINE MODE
# ━━━━━━━━━━━━━━━━━━━━━━

## Baseline Step 1 — Identify benchmark targets

### Explore sub-agent — Benchmark target discovery

Prompt with ALL of the following:
- Read `02-shape.md` and any `04-plan-*.md` files. Identify the functions, endpoints, operations, or modules that:
  - Are explicitly named in the shape's "Scope in" section
  - Are performance-sensitive (called frequently, latency-critical, or processing-heavy)
  - Will be modified by this workflow (from the plan)
- Detect the benchmark framework by reading: `package.json` (look for `vitest`, `jest`, `tinybench`, `benchmark` in devDependencies or scripts), `go.mod` (no special package needed — `testing.B` is built-in), `pyproject.toml` or `requirements.txt` (look for `pytest-benchmark`), `Cargo.toml` (look for `criterion`).
- Search for existing benchmark files: `**/*.bench.ts`, `**/*_bench_test.go`, `**/*_test.py` with `@pytest.mark.benchmark`, `**/*.bench.rs`, `**/bench/**`, `**/benches/**`.
- For each benchmark target:
  - If an existing benchmark covers it → record the benchmark command and target name.
  - If no benchmark exists → propose a minimal benchmark (a direct function call timed N times).
- Check for benchmark scripts in `package.json` (`"bench"`, `"benchmark"`, `"perf"`).

Return as structured text:
- `language`: detected primary language
- `benchmark_framework`: detected framework (or "none — will use timing fallback")
- `existing_benchmarks`: list of `{file, target_name, command}`
- `proposed_benchmarks`: list of `{target_function, file:line, proposed_command, type: cpu|memory|throughput|latency}`
- `benchmark_command`: the single command to run all benchmarks (or a list of commands)

## Baseline Step 2 — Run benchmarks

Run the benchmark commands identified in Step 1. Rules:
- **Warm up**: run each benchmark at least 3 times and discard the first run (cold-start effects).
- **Minimum iterations**: 10 runs minimum per target. Use the framework's auto-sizing if available.
- **Capture both CPU time and memory allocation** if the framework supports it (e.g., Go `-benchmem`, Vitest `bench` with memory reporter).
- **Record exact commands** so compare mode can reproduce them identically.

If benchmarks fail to run (missing dependency, build error, missing test fixtures):
- Document the failure in the artifact.
- Record "manual measurement required" for that target.
- Do NOT block — write the artifact with whatever ran successfully.

## Baseline Step 3 — Write `05c-benchmark.md` (baseline)

**`05c-benchmark.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: augmentation
augmentation-type: benchmark
slug: <slug>
parent-workflow: <slug>
mode: baseline
language: <detected>
benchmark-framework: <detected or "timing-fallback">
targets-measured: <N>
targets-failed: <N>
baseline-branch: <current-branch>
baseline-commit: <run `git rev-parse --short HEAD`>
measured-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"`>
---
```

**Body sections:**

## Benchmark Targets

| Target | Type | File:line | Framework | Command |
|--------|------|-----------|-----------|---------|
| `<function/endpoint>` | cpu/memory/throughput/latency | `path:line` | `<framework>` | `<command>` |

## Baseline Results

| Target | Median | P95 | P99 | Allocs/op | Bytes/op | Runs | Notes |
|--------|--------|-----|-----|-----------|----------|------|-------|
| `<target>` | `<Xms>` | `<Xms>` | `<Xms>` | `<N>` | `<N bytes>` | `<N>` | — |

Fill in N/A for columns the framework doesn't support.

## Measurement Commands

Exact commands to reproduce these results, in order:

```bash
# 1. <target-name>
<exact command>

# 2. <target-name>
<exact command>
```

These MUST be reproduced identically in compare mode.

## Targets That Could Not Be Measured

If any targets failed:

| Target | Reason | Manual measurement approach |
|--------|--------|-----------------------------|
| `<target>` | `<reason>` | `<how to measure manually>` |

## Baseline Step 4 — Update `00-index.md` augmentations registry

Add to `augmentations:` list:
```yaml
augmentations:
  - type: benchmark
    artifact: 05c-benchmark.md
    mode: baseline
    status: complete
    created-at: <timestamp>
```

If `augmentations:` already has a benchmark entry (e.g., from a prior run), update its `mode` and `status` rather than duplicating.

# ━━━━━━━━━━━━━━━━━━━━━━
# COMPARE MODE
# ━━━━━━━━━━━━━━━━━━━━━━

## Compare Step 1 — Read baseline

Read `05c-benchmark.md` in full. Extract:
- All targets from "## Benchmark Targets" — these are the ONLY targets to measure.
- All commands from "## Measurement Commands" — run these EXACTLY as recorded.
- All baseline numbers from "## Baseline Results".

Do NOT add new targets or change commands. Compare mode must be a faithful reproduction of baseline mode.

## Compare Step 2 — Run benchmarks

Run every command from the baseline's "Measurement Commands" section exactly as recorded. Same warm-up, same iteration count, same flags.

For targets that previously "Could Not Be Measured": attempt again. If still failing, record the continued failure.

## Compare Step 3 — Calculate delta

For each measured target, calculate:
- `delta_ms` = `compare_median` − `baseline_median`
- `delta_pct` = `(compare_median − baseline_median) / baseline_median × 100`
- `alloc_delta_pct` = same calculation for allocations/op
- `regression` = true if `delta_pct > +10%` (slowdown) or `alloc_delta_pct > +25%`
- `improvement` = true if `delta_pct < -10%` (speedup)

## Compare Step 4 — Update `05c-benchmark.md` with comparison data

Add a `## Comparison Results` section to the existing `05c-benchmark.md`. Do NOT overwrite baseline data.

Update frontmatter to add:
```yaml
mode: complete
compare-branch: <current-branch>
compare-commit: <git rev-parse --short HEAD>
compared-at: <timestamp>
regressions-found: <N>
improvements-found: <N>
```

**Body additions:**

## Comparison Results

| Target | Baseline median | Compare median | Delta | Delta% | Alloc delta% | Verdict |
|--------|----------------|---------------|-------|--------|--------------|---------|
| `<target>` | `<X>ms` | `<X>ms` | `<±X>ms` | `<±X>%` | `<±X>%` | ✓ improvement / ✓ no change / ⚠ regression |

**Regression summary** (only if regressions found):

| Target | Delta% | Likely cause | Recommendation |
|--------|--------|-------------|----------------|
| `<target>` | `+X%` | `<one-line: e.g., "new validation loop added in step 3 of plan">` | `<one-line: profile this target with /wf profile, or accept if within acceptable range>` |

**Tripwires** (warn-and-continue — do NOT refuse to complete the comparison):

- `[performance-regression]: <target> slowdown +X% exceeds 10% threshold` — recorded, wf-verify should review.
- `[memory-regression]: <target> allocations +X% exceeds 25% threshold` — recorded.
- `[no-improvement]: performance investment produced no measurable improvement` — flag for product decision.

For each fired tripwire, write one line. Then add:

> One or more wf-benchmark tripwires fired. The comparison is valid, but review the regressions before proceeding to /wf verify.

# Step 5 — Hand off to user

**Baseline mode summary** (8 lines max):
```
wf-benchmark baseline complete: <slug>
Language: <language>, framework: <framework>
Targets measured: <N> (<N> failed)
Branch: <branch> @ <commit>
Next: /wf implement <slug> — baseline is recorded
Re-baseline: /wf benchmark <slug> baseline
Artifact: .ai/workflows/<slug>/05c-benchmark.md
```

**Compare mode summary** (10 lines max):
```
wf-benchmark compare complete: <slug>
Targets compared: <N>
Regressions: <N> (<list target names>) | none
Improvements: <N> (<list target names>) | none
Largest delta: <target> <±X%>
Tripwires: <none | comma-separated>
Next: /wf verify <slug> — comparison data available as context
Artifact: .ai/workflows/<slug>/05c-benchmark.md
```

If regressions found, prefix compare summary with:

> ⚠ Performance regression(s) detected. Review before verifying — see §Regression summary in artifact.

# What this command is NOT

- **Not a profiler** — `wf-benchmark` measures aggregate time and allocations at the function/endpoint level. For flamegraphs and call-graph analysis, use `/wf profile`.
- **Not a load tester** — it measures single-request or single-operation performance. For concurrency and throughput under load, `wf-load-test` is needed (not yet available).
- **Not a CI gate** — it is a developer workflow tool. Integrating benchmark regression detection into CI is a separate infrastructure concern.
- **Not a profiling substitute** — if a regression is found but the cause is unclear, run `/wf profile <area>` to find the hotspot before attempting to fix it.
