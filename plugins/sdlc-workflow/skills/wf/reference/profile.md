---
description: Standalone performance profiling command. Detects language and available profiling tools, runs static analysis (call graph, algorithmic complexity, allocation patterns, I/O), runs dynamic profiling when tools are available, and writes the analysis to a durable artifact at .ai/profiles/<run-id>/01-profile.md. Use when you need to understand WHERE time or memory is spent in a code area before optimizing it. Does NOT modify application code. For repeated before/after measurement, use /wf benchmark instead.
argument-hint: <area-or-function-or-file>
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `/wf profile`, the **standalone profiling command**. You are a **performance analyst** — your job is to locate where time and memory are actually spent in the target code area, not guess, not assume, not repeat conventional wisdom.

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
| Next | `/wf-quick investigate <domain>` — to rank this profiling finding among other investment opportunities |
| Alt next | `/wf intake <description>` — if the profiling surfaced a clear high-value optimization |

# Core discipline
- **Evidence first.** Every hotspot claim must cite a specific `file:line` or tool output. Do not say "this is probably slow" without a data point.
- **Static analysis is fast; dynamic profiling is authoritative.** Always do static first. If runtime tools are available, run them too and let dynamic data override static guesses.
- **Do not optimize.** This command produces an analysis. Optimization decisions belong to a follow-up workflow (`/wf-quick fix`, `/wf intake`, `/wf-quick investigate`).
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
2. **Generate run-id**: `profile-<YYYYMMDD-HHMMSS>-<short-slug>` (e.g., `profile-20260503-143022-checkout`). Use `date +"%Y%m%d-%H%M%S"` for the timestamp.
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

**`01-profile.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: profile
run-id: <run-id>
target: <description of what was profiled>
language: <detected>
profiling-method: static | dynamic-cpu | dynamic-memory | hybrid | fallback-timing
hotspots-found: <N>
optimization-candidates: <N>
confidence: <high|medium|low>
created-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get the real timestamp>
---
```

**Body — use this exact structure** (downstream commands depend on it):

```
## Profile analysis: <area>

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

Then add one additional section:

## Recommended next steps

Based on this profiling result, suggest one of:

| Signal | Recommendation |
|--------|----------------|
| Clear high-ROI hotspot found, mechanism understood | `/wf-quick fix <description>` — small targeted optimization |
| High-ROI hotspot found but scope is medium+ | `/wf intake <description>` — full workflow for this investment |
| Multiple hotspots found, need ranking | `/wf-quick investigate <domain>` — rank all opportunities before committing |
| Hotspots found but no clear improvement path | Run dynamic profiling with `<tool>` to get runtime data before deciding |
| No significant hotspots found | Domain appears healthy — consider profiling a different area or accepting current performance |

# Step 5 — Hand off to user

Emit a compact chat summary, no more than 10 lines:

```
profile complete: <run-id>
Target: <description>
Language: <language>, method: <static|dynamic|hybrid>
Hotspots: <N> identified
Top hotspot: <function> at <file:line> — <estimated cost>
Optimization candidates: <N>
Confidence: <level>
Next: <recommended command> — <one-line rationale>
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

# What this command is NOT

- **Not an optimizer** — it finds hotspots; it does not rewrite code.
- **Not a benchmark** — it does not compare before/after. For delta measurement, use `/wf benchmark`.
- **Not a load tester** — it profiles single-request paths; concurrency and throughput require dedicated tooling.
- **Not a workflow stage** — profiling results do not advance any workflow. They are inputs to a decision about which workflow to start next.
- **Not a substitute for APM** — it cannot see distributed traces, database query plans, or real production traffic without external tooling.
- **Not a full call-graph profiler** — it cannot see OS-level context switches or kernel time without external instrumentation.
