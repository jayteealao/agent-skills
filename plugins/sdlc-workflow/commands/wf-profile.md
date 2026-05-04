---
name: wf-profile
description: Standalone performance profiling command. Invokes the wf-profile skill against a code area or function, then writes the analysis to a standalone artifact at .ai/profiles/<run-id>/01-profile.md. Use this outside of a workflow context when you want to understand WHERE time or memory is spent before deciding on an investment. For profiling within a workflow, the wf-profile skill is invoked directly by wf-investigate and wf-benchmark.
argument-hint: <area-or-function-or-file>
disable-model-invocation: true
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-profile`, the **standalone profiling command** that invokes the `wf-profile` skill and persists the results as a durable artifact.

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
| Next | `/wf-quick quick investigate <domain>` — to rank this profiling finding among other investment opportunities |
| Alt next | `/wf-quick quick intake <description>` — if the profiling surfaced a clear high-value optimization |

# CRITICAL — scope discipline
- Do NOT modify application code. Do NOT optimize anything. Analysis only.
- Do NOT run commands that mutate state (DB writes, API calls to production, git commits).
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

# Step 1 — Invoke the wf-profile skill

The `wf-profile` skill lives at `skills/wf-profile/SKILL.md`. Follow it exactly to perform the profiling analysis on the target identified in Step 0.

The skill will:
1. Detect the language and available profiling tools.
2. Perform static analysis (call graph, algorithmic complexity, allocation patterns, I/O patterns).
3. Run dynamic profiling if tools are available.
4. Return structured analysis: hotspot functions, allocation hotspots, critical path, optimization candidates, confidence, and limitations.

Hold the skill's output in working memory. Proceed to Step 2.

# Step 2 — Write `.ai/profiles/<run-id>/01-profile.md`

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

**Body: paste the wf-profile skill's structured output in full**, formatted as markdown. The skill's output format is already structured — do not reformat or summarize it.

The full output includes:
- Language & toolchain
- Hotspot functions table
- Allocation hotspots table
- Critical path
- Optimization candidates table
- Confidence & limitations

Then add one additional section:

## Recommended next steps

Based on this profiling result, suggest one of:

| Signal | Recommendation |
|--------|----------------|
| Clear high-ROI hotspot found, mechanism understood | `/wf-quick quick <description>` — small targeted optimization |
| High-ROI hotspot found but scope is medium+ | `/wf-quick quick intake <description>` — full workflow for this investment |
| Multiple hotspots found, need ranking | `/wf-quick quick investigate <domain>` — rank all opportunities before committing |
| Hotspots found but no clear improvement path | Run dynamic profiling with `<tool>` to get runtime data before deciding |
| No significant hotspots found | Domain appears healthy — consider profiling a different area or accepting current performance |

# Step 3 — Hand off to user

Emit a compact chat summary, no more than 10 lines:

```
wf-profile complete: <run-id>
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
wf-profile complete: <run-id>
Target: <description>
Result: No significant hotspots found in static analysis.
Method: static only (no runtime data)
Confidence: medium — static analysis may miss runtime patterns
Consider: run with a profiling tool attached for dynamic data
Artifact: .ai/profiles/<run-id>/01-profile.md
```

# What this command is NOT

- **Not an optimizer** — it finds hotspots; it does not rewrite code.
- **Not a benchmark** — it does not compare before/after. For delta measurement, use `/wf-benchmark`.
- **Not a load tester** — it profiles single code paths; for concurrency and throughput, `wf-load-test` is needed (not yet available).
- **Not a workflow stage** — profiling results do not advance any workflow. They are inputs to a decision about which workflow to start next.
- **Not a substitute for APM** — it cannot see distributed traces, database query plans, or real production traffic without external tooling.
