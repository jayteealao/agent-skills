---
name: wf-instrument
description: Observability augmentation for an existing workflow. Scans the files in scope for the given workflow, identifies dark paths (code with no logging, metrics, or tracing), and writes a structured instrumentation plan (04b-instrument.md) into the existing workflow directory. Does NOT write application code. Registers itself in the workflow's 00-index.md augmentations list so wf-implement and wf-verify can read the plan as additional context.
argument-hint: <slug>
disable-model-invocation: true
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-instrument`, an **observability augmentation** that adds an instrumentation plan to an existing workflow.

# Shape
This is an **augmentation**, not an entry point. It writes into an existing workflow directory — it never starts a new workflow.

```
existing-workflow/
  00-index.md          ← updated (augmentations registry)
  02-shape.md          ← read (scope)
  04-plan-*.md         ← read (what will change)
  04b-instrument.md    ← written by this command
```

| | Detail |
|---|---|
| Requires | An existing workflow at `.ai/workflows/<slug>/` with at least `02-shape.md` present. |
| Produces | `04b-instrument.md` — observability plan for the workflow scope |
| Updates | `00-index.md` — adds entry to `augmentations:` list |
| Does NOT | Write application code, modify the plan, or advance the workflow stage. |
| When to run | After `/wf-shape` and before or during `/wf-implement`. Running during implement is fine — wf-implement reads this file as additional context. |
| Next | `/wf-implement <slug>` (if not already running), or continue the existing implement stage. |

# CRITICAL — scope discipline
You are an **observability architect**, not an implementer.
- Do NOT write application code. Do NOT modify `02-shape.md`, `04-plan-*.md`, or any stage artifact.
- Your output is the instrumentation *plan*, not the implementation. `wf-implement` builds the code; this command tells it what to build.
- Be specific enough to implement (name exact files, functions, and signal fields) but do not write the implementation itself.
- Follow the steps below exactly in order.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug** from `$ARGUMENTS`. This MUST match an existing workflow directory.
   - If `.ai/workflows/<slug>/` does not exist → STOP: "No workflow `<slug>` found. Start one with `/wf-quick quick intake <description>`."
   - If `02-shape.md` does not exist → STOP: "Workflow `<slug>` has no shape yet. Run `/wf-shape <slug>` first."
2. **Check for existing augmentation:**
   - If `04b-instrument.md` already exists → WARN: "An instrumentation plan already exists for `<slug>`. Running again will overwrite it. Proceed? (yes to continue)"
   - If confirmed to proceed, note this is a re-instrumentation run.
3. **Read the workflow context:**
   - Read `02-shape.md` in full — this defines what is in scope.
   - Read any `04-plan-*.md` files present — these name specific files and steps.
   - Read `00-index.md` frontmatter — check `current-stage`, `status`, and any existing `augmentations:` entries.
4. **Identify files in scope:**
   - Extract the explicit file list from `02-shape.md` ("Scope in" or "Files in scope" section) and any plan files.
   - This is the set of files the instrumentation must cover.

# Step 1 — Observability gap analysis
Launch both sub-agents in parallel. Do not proceed to write the plan until both complete.

### Explore sub-agent 1 — Current instrumentation inventory

Prompt with ALL of the following:
- For each file in scope (from Step 0), read the file and identify all existing observability signals:
  - **Logging**: any log statement (`console.log`, `logger.info`, `log.Printf`, `logging.info`, structured log calls, etc.)
  - **Metrics**: any metric emission (`counter.inc`, `histogram.observe`, `statsd.increment`, `prometheus.Counter`, etc.)
  - **Tracing**: any span or trace call (`span.setAttributes`, `tracer.startSpan`, `opentelemetry`, distributed trace context propagation)
  - **Error tracking**: any error capture (`Sentry.captureException`, `bugsnag.notify`, error logger calls)
- For each file, classify its instrumentation quality:
  - `good`: structured logging with business context, metrics, or tracing present
  - `partial`: some logging but missing business context, metrics, or tracing
  - `poor`: no structured logging, only bare `console.error` or `fmt.Println`
  - `dark`: no observability whatsoever
- Identify **dark paths**: functions or code paths that will be changed by this workflow but have no observable signal — you won't be able to tell if they're working after the change.

Return as structured text:
- `instrumentation_inventory`: list of `{file, quality: good|partial|poor|dark, existing_signals: [description]}`
- `dark_paths`: list of `{file:function, reason: "no signals on this code path"}`
- `instrumentation_framework`: detected logging/metrics/tracing libraries (e.g., "pino + prometheus", "zerolog + otel", "python logging + datadog")

### Explore sub-agent 2 — Instrumentation design

Prompt with ALL of the following context:
- The workflow's `02-shape.md` (what is being changed and why)
- The list of `dark_paths` from sub-agent 1
- The detected `instrumentation_framework` from sub-agent 1

For each dark path and for each partially-instrumented path that will be touched:
- Design the minimum set of signals that would let someone:
  1. **Verify** the change worked correctly in production (observable success state)
  2. **Debug** a regression introduced by this change (observable failure state + context)
  3. **Measure** the performance or business impact of this change (observable magnitude)
- Signal design rules:
  - Use the existing instrumentation framework (do not introduce a new logging library)
  - Follow wide-event patterns: emit structured fields, not string-formatted messages
  - Include business context where relevant (user ID type, request ID, relevant entity IDs)
  - Flag any fields that must be redacted or hashed (PII, secrets, tokens)
  - Keep signals at the right level: function-level for internal hotspots, request-level for endpoints, event-level for async operations

Return as structured text:
- `instrumentation_plan`: list of `{file, function_or_path, signal_type: log|metric|trace|error, signal_name, fields: [{name, type, example, pii: true|false}], rationale}`
- `pii_warnings`: list of any fields that require redaction
- `new_signals_count`: number of new signals designed

# Step 2 — Write `04b-instrument.md`

Merge findings from both sub-agents into the instrumentation plan artifact.

**`04b-instrument.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: augmentation
augmentation-type: instrument
slug: <slug>
parent-workflow: <slug>
instrumentation-framework: <detected framework>
dark-paths-found: <N>
signals-designed: <N>
pii-warnings: <true|false>
status: ready
created-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get the real timestamp>
---
```

**Body sections (in order):**

## 1. Current state

A table of instrumentation quality across the files in scope:

| File | Quality | Existing signals | Dark paths |
|------|---------|-----------------|------------|
| `path/to/file.ts` | good/partial/poor/dark | log: yes, metrics: no, traces: no | — or list |

Summary: `<N>` dark paths found across `<M>` files. Framework: `<detected>`.

## 2. Instrumentation plan

A table of what to add:

| File | Function/path | Signal type | Signal name | Key fields | Rationale |
|------|--------------|-------------|-------------|------------|-----------|
| `path/to/file.ts` | `functionName()` | log | `payment_processed` | `user_id`, `amount_cents`, `provider`, `duration_ms` | Verify payment outcome in production |

## 3. Signal designs

For each signal in the plan, the exact shape of the event/log/metric. Use the detected framework's idioms.

**Example (pino/Node):**
```typescript
// In path/to/file.ts — functionName()
logger.info({
  event: 'payment_processed',
  user_id: redact(user.id),   // hashed — PII
  amount_cents: payment.amount,
  provider: payment.provider,
  duration_ms: endTime - startTime,
  outcome: 'success' | 'failure',
  error_code: error?.code,    // null on success
}, 'payment processing complete');
```

**Example (Go/zerolog):**
```go
// In path/to/handler.go — ProcessPayment()
log.Info().
    Str("event", "payment_processed").
    Str("user_id", hashUserID(userID)).
    Int64("amount_cents", payment.Amount).
    Str("provider", payment.Provider).
    Int64("duration_ms", elapsed.Milliseconds()).
    Str("outcome", outcome).
    Msg("payment processing complete")
```

Adapt to the actual detected framework. Show the exact field names and types.

## 4. PII & security notes

List any fields in the plan that require special handling:

| Field | Risk | Recommended handling |
|-------|------|---------------------|
| `user.email` | PII | Hash with SHA-256 before logging |
| `payment.card_number` | PCI sensitive | Never log — use last-4 only |
| `auth_token` | Secret | Redact entirely |

If no PII concerns: write "No PII concerns identified in the planned signals."

## 5. Implementation notes

Specific guidance for `wf-implement`:
- Which files to touch and in what order (to avoid re-touching a file multiple times)
- Whether any new imports are needed (and whether they're already in `package.json` / `go.mod`)
- Whether any new environment variables are needed (e.g., `LOG_LEVEL`, `METRICS_ENDPOINT`)
- Any conflicts with the existing plan steps in `04-plan-*.md` that might affect ordering

This section is **direction, not a plan** — do not enumerate full implementation steps. `wf-implement` owns the implementation.

# Step 3 — Update `00-index.md` augmentations registry

Read `00-index.md`, then add or update the `augmentations:` field in its YAML frontmatter:

```yaml
augmentations:
  - type: instrument
    artifact: 04b-instrument.md
    status: complete
    created-at: <timestamp>
```

If `augmentations:` already exists (from a prior augmentation on this workflow), append to the list. Do not overwrite existing entries.

Also update `updated-at` to the current timestamp.

# Step 4 — Hand off to user

Emit a compact chat summary, no more than 10 lines:

```
wf-instrument complete: <slug>
Files in scope: <N>
Dark paths found: <N>
Signals designed: <N> (<log/metric/trace/error breakdown>)
PII warnings: <none | N fields require redaction — see §4>
Framework: <detected>
Next: /wf-implement <slug> — instrumentation plan will be read as additional context
Consider: /wf-experiment <slug> to design a controlled rollout for this change
Artifact: .ai/workflows/<slug>/04b-instrument.md
```

If dark paths are zero, note:

> No dark paths found — the files in scope already have adequate observability coverage. The plan documents existing signals for reference.

# What this command is NOT

- **Not an implementer** — `wf-instrument` designs the instrumentation plan. `wf-implement` builds it. Do not write application code.
- **Not an observability platform** — it does not set up Datadog, Grafana, Prometheus, or any tooling. It plans what signals to emit; the platform choice is the user's.
- **Not a logging style guide** — it designs signals for this specific workflow change, not a general logging policy for the entire codebase.
- **Not a prerequisite** — instrumentation is optional. `wf-implement` works without it. But if you're shipping something to production and you can't tell whether it worked, you should run this.
