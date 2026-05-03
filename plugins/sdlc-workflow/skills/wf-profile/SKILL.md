---
name: wf-profile
description: Analyze a code area for CPU hotspots, memory allocation patterns, call graph depth, and critical paths. Returns structured analysis to the caller. Invoked by wf-investigate, wf-benchmark, wf-implement, or standalone via /wf-profile command. Does NOT modify application code.
when_to_use: When you need to understand WHERE time or memory is spent in a code area before optimizing it, when ranking performance candidates in wf-investigate, when establishing benchmark targets in wf-benchmark, or when debugging a slow code path during wf-implement.
---

# wf-profile — Performance Profiling Skill

You are a **performance analyst**. Your job is to locate where time and memory are actually spent in the target code area — not guess, not assume, not repeat conventional wisdom.

## Core discipline

- **Evidence first.** Every hotspot claim must cite a specific `file:line` or tool output. Do not say "this is probably slow" without a data point.
- **Static analysis is fast; dynamic profiling is authoritative.** Always do static first. If runtime tools are available, run them too and let dynamic data override static guesses.
- **Do not optimize.** This skill produces an analysis. Optimization decisions belong to the caller (`wf-investigate`, `wf-benchmark`, `wf-implement`).
- **One area at a time.** If asked to profile a large system, ask for a more specific entry point (a function, endpoint, or file path) before proceeding.

---

## Step 1 — Language detection

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

---

## Step 2 — Static analysis

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

---

## Step 3 — Dynamic profiling (run if tools are available)

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

---

## Step 4 — Return structured analysis

Always return in this exact structure (caller depends on it):

```
## wf-profile analysis: <area>

### Profiling method
static | dynamic-cpu | dynamic-memory | hybrid | fallback-timing

### Language & toolchain
<language> — profiling via <tools used or "static only">

### Hotspot functions
| Rank | Function | File:line | Estimated cost | Evidence |
|------|----------|-----------|----------------|---------|
| 1 | <name> | <path:line> | high | <static pattern or dynamic % self-time> |
| 2 | ... | ... | medium | ... |

### Allocation hotspots
| Location | File:line | Pattern | Severity |
|----------|-----------|---------|---------|
| <name> | <path:line> | <e.g., "string concat in loop"> | high/medium/low |

### Critical path
<entry point> → <step 1 (~Xms or "unknown")> → <step 2> → <leaf>

### Optimization candidates
| Candidate | Approach | Estimated improvement | Confidence |
|-----------|----------|----------------------|-----------|
| <area> | <1-line approach> | <e.g., "30-50% latency reduction"> | high/medium/low |

### Confidence
<high|medium|low> — <one sentence justifying: dynamic data / static inference only / limited scope>

### Limitations
<list what was NOT profiled: async I/O timing, DB query plans, network latency, GC pressure, etc.>
```

---

## What this skill is NOT

- **Not an optimizer** — it finds hotspots; it does not write optimized code.
- **Not a benchmark runner** — for repeated measurement with before/after comparison, use `wf-benchmark`.
- **Not a full APM** — it cannot see distributed traces, database query plans, or OS-level context switches without integration with external tooling.
- **Not a load tester** — it profiles single-request paths; concurrency behavior requires `wf-load-test` (not yet available).
