---
description: Observability augmentation for an existing workflow. Scans the files in scope for the given workflow, identifies dark paths (code with no logging, metrics, or tracing), and writes a structured instrumentation plan (04b-instrument.md) into the existing workflow directory. Does NOT write application code. Registers itself in the workflow's 00-index.md augmentations list so wf-implement and wf-verify can read the plan as additional context.
argument-hint: <slug>
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `wf-instrument`, an **observability augmentation** that adds an instrumentation plan to an existing workflow.

> **Loaded as a sub-procedure (not a standalone key).** Shape decides augmentation (`augmentations-needed` in `02-shape.md`): `plan` loads this file to author its artifact, `implement` wires it, `verify` re-checks it. Run only the mode the calling stage requests.

> **Deep reference — wide-event observability.** For the canonical wide-event / structured-logging patterns (tail sampling, canonical log lines, context-rich queryable events) this augmentation designs against, load [wide-event-observability.md](wide-event-observability.md). It holds this augmentation's knowledge base.

> **Foundation vs. per-change (the boundary).** This augmentation designs signals for **one change**, against the
> project's existing observability foundation. To establish or audit that **project-wide** foundation — the schema,
> emit layer, sampling, pipeline, backend, and dashboards — use `/wf observability` (`init` → `build` → `audit`).
> **When `.ai/observability.md` exists, design against it:** use its Block-A schema as the canonical field
> vocabulary (do not invent divergent keys) and its Block-E pipeline as the delivery path. Read it in Step 0.

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
| Requires | See [## Requires](#requires). |
| Produces | `04b-instrument.md` — observability plan for the workflow scope |
| Updates | `00-index.md` — adds entry to `augmentations:` list |
| Does NOT | Write application code, modify the plan, or advance the workflow stage. |
| When to run | After `/wf shape` and before or during `/wf implement`. Running during implement is fine — wf-implement reads this file as additional context. |
| Next | `/wf implement <slug>` (if not already running), or continue the existing implement stage. |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `02-shape.md` | artifact | always | |
| `04-plan-*.md` | artifact | if-present | |
| `/.ai/observability.md` | artifact | if-present | |
| `augment/instrument/_artifact.md` | procedure | always | |
| `_story-arc.md` | procedure | always | |
| `04b-instrument.md` | writes | | |

# Scope discipline
You are an **observability architect**, not an implementer.
- Do not write application code. Do not modify `02-shape.md`, `04-plan-*.md`, or any stage artifact.
- Your output is the instrumentation *plan*, not the implementation. `wf-implement` builds the code; this command tells it what to build.
- Be specific enough to implement (name exact files, functions, and signal fields) but do not write the implementation itself.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step 0 — Orient
1. **Resolve slug** from `$ARGUMENTS`. This must match an existing workflow directory.
   - If `.ai/workflows/<slug>/` does not exist → STOP: "No workflow `<slug>` found. Start one with `/wf intake <description>`."
   - If `02-shape.md` does not exist → STOP: "Workflow `<slug>` has no shape yet. Run `/wf shape <slug>` first."
2. **Check for existing augmentation:**
   - If `04b-instrument.md` already exists → WARN: "An instrumentation plan already exists for `<slug>`. Running again will overwrite it. Proceed? (yes to continue)"
   - If confirmed to proceed, note this is a re-instrumentation run.
3. **Use the workflow context.** `02-shape.md` defines the scope. The plan files name specific files and steps. The index shows `current-stage`, `status`, and existing `augmentations:` entries.
   - When `.ai/observability.md` exists, use its **Block A** schema field vocabulary and its **Block E** pipeline. Do not invent a new convention. When it does not exist, design against the shared doctrine. Note that `/wf observability init` establishes the project-wide contract.
4. **Identify files in scope:**
   - Extract the file list from `02-shape.md` `## Affected Areas` and from the plan files' `## Likely Files / Areas to Touch`.
   - This is the set of files the instrumentation must cover.

# Step 1 — Observability gap analysis
Launch both sub-agents in parallel. Do not proceed to write the plan until both complete.

### research sub-agent 1 — Current instrumentation inventory

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

### research sub-agent 2 — Instrumentation design

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
  - **If `.ai/observability.md` exists, use its Block-A canonical field names** — do not invent divergent keys
    (`user.id`, not `userId`/`user_id`). Schema consistency is what makes the project's dashboards queryable.
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

Write `04b-instrument.md` with the frontmatter and the five body sections in [instrument/_artifact.md](instrument/_artifact.md). The body is direction, not a plan.

# Step 2a — Write the explainer

Write the explainer `04b-instrument.explainer.html.fragment` per [_story-arc.md](../_story-arc.md).

# Step 3 — Update `00-index.md` augmentations registry

Read `00-index.md`, then add or update the `augmentations:` field in its YAML frontmatter:

```yaml
augmentations:
  - type: instrument
    artifact: 04b-instrument.md
    status: ready          # authored; implement wires it, verify re-checks it
    created-at: <timestamp>
```

If `augmentations:` already exists (from a prior augmentation on this workflow), append to the list. Do not overwrite existing entries.

Also update `updated-at` to the current timestamp.

# Step 4 — Hand off to user

Return per [_chat-return.md](../_chat-return.md) — a narrative lead that quotes the explainer's summary paragraph, then the structured anchors below.

Emit a compact chat summary:

```
wf-instrument complete: <slug>
Files in scope: <N>
Dark paths found: <N>
Signals designed: <N> (<log/metric/trace/error breakdown>)
PII warnings: <none | N fields require redaction — see §4>
Framework: <detected>
Next: /wf implement <slug> — instrumentation plan will be read as additional context
Consider: /wf experiment <slug> to design a controlled rollout for this change
Artifact: .ai/workflows/<slug>/04b-instrument.md
```

If dark paths are zero, note:

> No dark paths found — the files in scope already have adequate observability coverage. The plan documents existing signals for reference.

# What this sub-procedure is NOT

- **Not an implementer** — `wf-instrument` designs the instrumentation plan. `wf-implement` builds it. Do not write application code.
- **Not the project-wide foundation** — it does not set up the schema, emit layer, sampling, pipeline, backend, or dashboards. That is `/wf observability` (`init`/`build`/`audit`). This augmentation plans **per-change** signals *against* that foundation; when `.ai/observability.md` exists it designs to that contract's schema and pipeline.
- **Not a logging style guide** — it designs signals for this specific workflow change, not a general logging policy for the entire codebase.
- **Not a prerequisite** — instrumentation is optional. `wf-implement` works without it. But if you're shipping something to production and you can't tell whether it worked, you should run this.

---

## Step — Sibling YAML `instrument`

Write the sibling `04b-instrument.yaml` per [instrument/_artifact.md](instrument/_artifact.md) → *Sibling YAML*.

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](../_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
