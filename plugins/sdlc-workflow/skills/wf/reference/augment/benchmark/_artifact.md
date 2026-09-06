# Benchmark — artifact templates (`augment/benchmark.md` Baseline Step 3 and Compare Step 4)

Load this file from `benchmark.md` when you write or update `05c-benchmark.md`.

## Baseline Step 3 — `05c-benchmark.md`

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
measured-at: <real UTC timestamp per _timestamp.md>
---
```

**Body sections:**

## The Benchmark
<!-- STORY SECTION — first, and self-sufficient. must follow `../../_story-arc.md`: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. Language must follow `../../_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs. -->

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

These must be reproduced identically in compare mode.

## Targets That Could Not Be Measured

If any targets failed:

| Target | Reason | Manual measurement approach |
|--------|--------|-----------------------------|
| `<target>` | `<reason>` | `<how to measure manually>` |

## Compare Step 4 — comparison data

Add a `## Comparison Results` section to the existing `05c-benchmark.md`. Do not overwrite baseline data.

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
| `<target>` | `+X%` | `<one-line: e.g., "new validation loop added in step 3 of plan">` | `<one-line: profile this target via `/wf probe` or the `augment/profile.md` sub-procedure, or accept if within acceptable range>` |

**Tripwires** (warn-and-continue — do NOT refuse to complete the comparison):

- `[performance-regression]: <target> slowdown +X% exceeds 10% threshold` — recorded, wf-verify should review.
- `[memory-regression]: <target> allocations +X% exceeds 25% threshold` — recorded.
- `[no-improvement]: performance investment produced no measurable improvement` — flag for product decision.

For each fired tripwire, write one line. Then add:

> One or more wf-benchmark tripwires fired. The comparison is valid, but review the regressions before proceeding to `/wf verify`.
