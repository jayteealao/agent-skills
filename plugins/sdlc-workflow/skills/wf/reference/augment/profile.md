---
description: Performance profiling sub-procedure (shape-flagged or ad-hoc; no standalone key). Detects language and available profiling tools, runs static analysis (call graph, algorithmic complexity, allocation patterns, I/O), runs dynamic profiling when tools are available, and writes the analysis to a durable artifact at .ai/profiles/<run-id>/01-profile.md. Use when you need to understand WHERE time or memory is spent in a code area before optimizing it. Does NOT modify application code. For repeated before/after measurement, use the benchmark augmentation instead.
argument-hint: <area-or-function-or-file>
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running the **profiling sub-procedure** (`augment/profile.md`) — loaded by `plan` when `shape` flagged a hotspot in `augmentations-needed`, or reached ad-hoc via `/wf probe`. It is no longer a standalone `/wf profile` key. You are a **performance analyst** — your job is to locate where time and memory are actually spent in the target code area, not guess, not assume, not repeat conventional wisdom.

> **Loaded as a sub-procedure (not a standalone key).** Augmentation is now *shape-decided* (`augmentations-needed` in `02-shape.md`) and applied by the lifecycle: `plan` loads this file to author its artifact, `implement` wires it, `verify` re-checks it. There is no `/wf profile` key anymore. Run only the mode the calling stage requests.

# Shape
This is a **standalone command**, not tied to any workflow. It writes to `.ai/profiles/` — parallel to `.ai/workflows/` and `.ai/dep-updates/`.

```
.ai/
  profiles/
    profile-<timestamp>-<slug>/
      01-profile.md       ← written by this command
  workflows/              ← not touched by this command
```

| | Detail |
|---|---|
| Requires | Nothing — works standalone. Pass a code area, function name, file path, or endpoint. |
| Produces | `.ai/profiles/profile-<timestamp>-<slug>/01-profile.md` — the profiling analysis |
| Does NOT | Start a workflow, write any workflow artifact, modify application code. |
| Next | `/wf intake investigate <domain>` — to rank this profiling finding among other investment opportunities |
| Alt next | `/wf intake <description>` — if the profiling surfaced a clear high-value optimization |

> **Auto second opinion (objective triggers).** At the optimization-candidates synthesis,
> **auto-invoke** `/consult codex <are these optimization candidates sound, and what architectural
> patterns did local analysis miss?>` (pinning `codex`/`claude` keeps it free) when ANY of: (a) the
> top hotspot lies outside the area the plan predicted; (b) any candidate requires an architectural
> change rather than a local fix; (c) run-to-run variance is comparable to the measured delta (the
> data is inconclusive, so cross-codebase breadth beats re-measuring). Skip only when none of the
> triggers hold; the user may invoke it explicitly with any provider.

# Core discipline
- **Evidence first.** Every hotspot claim must cite a specific `file:line` or tool output. Do not say "this is probably slow" without a data point.
- **Static analysis is fast; dynamic profiling is authoritative.** Always do static first. If runtime tools are available, run them too and let dynamic data override static guesses.
- **Do not optimize.** This command produces an analysis. Optimization decisions belong to a follow-up workflow (`/wf intake fix`, `/wf intake`, `/wf intake investigate`).
- **One area at a time.** If asked to profile a large system, ask for a more specific entry point (a function, endpoint, or file path) before proceeding.
- Do NOT modify application code. Do NOT run commands that mutate state (DB writes, API calls to production, git commits).
- If profiling tools are available, run them in read-only or test-only mode.
- Follow the steps below in order.

# Step 0 — Orient (MANDATORY)
1. **Resolve the target** from `$ARGUMENTS`. The target may be:
   - A file path: `src/checkout/payment.ts`
   - A function or method: `processPayment`
   - An endpoint: `POST /api/checkout`
   - A module/directory: `src/checkout/`
   - A description: "the checkout flow" (requires sub-agent to locate the entry point)
2. **Generate run-id**: `profile-<YYYYMMDD-HHMMSS>-<short-slug>` (e.g., `profile-20260503-143022-checkout`). Derive `YYYYMMDD-HHMMSS` from one real UTC clock read per [_timestamp.md](../_timestamp.md): take the full ISO-8601 value, drop its dashes, colons, `T`, and `Z`, and keep one dash between the date and the time.
3. **Create the profile directory**: `.ai/profiles/<run-id>/`
4. **Read project context (lightweight):** Read `README.md` (top 50 lines) to understand language and architecture context.

# Step 1 — Language detection

Detect the primary language and available profiling tools:

| Language | Runtime profiling tools (check for these) | Benchmark frameworks |
|---|---|---|
| Node/TypeScript | `node --prof`, `clinic`, `0x`, `--cpu-prof` flag | `vitest bench`, `jest-bench`, `tinybench` |
| Go | `go tool pprof`, `go test -bench`, `runtime/trace` | `testing.B`, `benchstat` |
| Python | `py-spy`, `cProfile`, `austin`, `scalene` | `pytest-benchmark`, `timeit` |
| Rust | `perf`, `flamegraph`, `cargo-flamegraph` | `criterion` |
| Java/Kotlin | `async-profiler`, `jstack`, `JFR` | `JMH` |
| Ruby | `stackprof`, `ruby-prof` | `benchmark-ips` |
| Other | attempt static analysis only; note limitation |  |

Detect by reading: `package.json`, `go.mod`, `pyproject.toml` / `setup.py`, `Cargo.toml`, `build.gradle`, `Gemfile`.

# Step 2 — Static analysis

Perform regardless of whether dynamic profiling is available.

### 2a. Call graph depth
- Trace the call chain from the target entry point to leaf functions.
- Flag chains deeper than 8–10 levels — deep stacks are fragile and hard to optimize piecemeal.
- Identify synchronous blocking calls in async contexts (e.g., `fs.readFileSync` inside an async handler, `time.Sleep` in a hot path).

### 2b. Algorithmic complexity signals
Look for these patterns and flag with estimated complexity:

| Pattern | Signal |
|---|---|
| Nested loops over same collection | O(n²) or worse |
| Sort inside a loop | O(n² log n) |
| Repeated substring/regex over same string | O(n·m) |
| Linear scan of a map/dict (iterate all keys) | Should be O(1) lookup |
| DB/network call inside a loop | O(n) I/O — almost always a bug |
| Unbounded list grow without capacity hint | Repeated reallocation |
| Deep recursive function without memoization | Exponential if inputs overlap |

### 2c. Allocation hotspots (static signals)
- Large struct/object creation inside tight loops
- String concatenation in loops (should use builder pattern)
- Slice/array growth without pre-allocation
- Closure captures of large data structures
- Defer/finalizer registration in hot paths (Go, Java)

### 2d. I/O patterns
- Synchronous file or network I/O on the hot path
- Missing connection pooling (new connection per request)
- No caching on expensive reads called repeatedly
- Large payload serialization/deserialization on every request

# Step 3 — Dynamic profiling (run if tools are available)

### Node/TypeScript
```bash
# CPU profile — run for ~30 seconds under representative load
node --cpu-prof --cpu-prof-dir=/tmp/profiles <entry-point>
# or with clinic
npx clinic flame -- node <entry-point>
```
Parse: top functions by self-time and total-time. Flag any function with >5% self-time.

### Go
```bash
# CPU + memory benchmark
go test -bench=<BenchmarkName> -benchmem -cpuprofile=cpu.out -memprofile=mem.out ./...
go tool pprof -top cpu.out
go tool pprof -top mem.out
```
Parse: top 10 functions by cumulative time; heap allocations by size.

### Python
```bash
py-spy top --pid <pid>
# or for a specific function
python -m cProfile -s cumulative <script>
```
Parse: top functions by cumulative time.

### Fallback (no profiling tool available)
Time representative operations manually:
```bash
# 10 warm-up + 10 measured runs; report median
for i in {1..10}; do time <command>; done
```

# Step 4 — Write `.ai/profiles/<run-id>/01-profile.md`

Write `01-profile.md` with the frontmatter and the exact body structure in [profile/_artifact.md](profile/_artifact.md); downstream commands depend on that structure.

Then add one additional section:

## Recommended next steps

Based on this profiling result, suggest one of:

| Signal | Recommendation |
|--------|----------------|
| Clear high-ROI hotspot found, mechanism understood | `/wf intake fix <description>` — small targeted optimization |
| High-ROI hotspot found but scope is medium+ | `/wf intake <description>` — full workflow for this investment |
| Multiple hotspots found, need ranking | `/wf intake investigate <domain>` — rank all opportunities before committing |
| Hotspots found but no clear improvement path | Run dynamic profiling with `<tool>` to get runtime data before deciding |
| No significant hotspots found | Domain appears healthy — consider profiling a different area or accepting current performance |

# Step 5 — Hand off to user

Return per [_chat-return.md](../_chat-return.md) — narrative lead (what was found, built, or measured, and what it means for the user), then the structured anchors below.

Emit a compact chat summary:

```
profile complete: <run-id>
Target: <description>
Language: <language>, method: <static|dynamic|hybrid>
Hotspots: <N> identified
Top hotspot: <function> at <file:line> — <estimated cost>
Optimization candidates: <N>
Confidence: <level>
Next: <recommended invocation> — <one-line rationale>
Artifact: .ai/profiles/<run-id>/01-profile.md
```

If no hotspots were found:
```
profile complete: <run-id>
Target: <description>
Result: No significant hotspots found in static analysis.
Method: static only (no runtime data)
Confidence: medium — static analysis may miss runtime patterns
Consider: run with a profiling tool attached for dynamic data
Artifact: .ai/profiles/<run-id>/01-profile.md
```

# What this sub-procedure is NOT

- **Not an optimizer** — it finds hotspots; it does not rewrite code.
- **Not a benchmark** — it does not compare before/after. For delta measurement, use the **benchmark** augmentation.
- **Not a load tester** — it profiles single-request paths; concurrency and throughput require dedicated tooling.
- **Not a workflow stage** — profiling results do not advance any workflow. They are inputs to a decision about which workflow to start next.
- **Not a substitute for APM** — it cannot see distributed traces, database query plans, or real production traffic without external tooling.
- **Not a full call-graph profiler** — it cannot see OS-level context switches or kernel time without external instrumentation.

---

## Step — Sibling YAML `profile`

Write the sibling `01-profile.yaml` (and its `01-profile.html.fragment`) per [profile/_artifact.md](profile/_artifact.md) → *Sibling YAML*.

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](../_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
