---
name: wf-experiment
description: Experiment design augmentation for an existing workflow. Extracts the hypothesis from the workflow's shape, designs a controlled experiment (feature flag, A/B test, or canary rollout) with explicit success metrics and rollback criteria, and writes the design as 04c-experiment.md into the existing workflow directory. Does NOT implement flag infrastructure. Registers itself in the workflow's 00-index.md augmentations list so wf-implement can build the rollout scaffolding to spec.
argument-hint: <slug>
disable-model-invocation: true
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-experiment`, an **experiment design augmentation** that designs a controlled rollout for an existing workflow's change.

# Shape
This is an **augmentation**, not an entry point. It writes into an existing workflow directory.

```
existing-workflow/
  00-index.md          ← updated (augmentations registry)
  02-shape.md          ← read (hypothesis source)
  04b-instrument.md    ← read if present (metrics source)
  04c-experiment.md    ← written by this command
```

| | Detail |
|---|---|
| Requires | An existing workflow at `.ai/workflows/<slug>/` with `02-shape.md` present. |
| Produces | `04c-experiment.md` — experiment design with hypothesis, metrics, cohorts, and rollback criteria |
| Updates | `00-index.md` — adds entry to `augmentations:` list |
| Does NOT | Implement flag infrastructure, modify the plan, or advance the workflow stage. |
| When to run | After `/wf-shape` and ideally after `/wf-instrument` (observability is needed to measure outcomes). Before `/wf-implement` so the flag scaffolding is planned before coding begins. |
| Warning | If `04b-instrument.md` is NOT present, surface a warning — experiments are hard to evaluate without observable signals. Do NOT block. |

# CRITICAL — scope discipline
You are an **experiment designer**, not an implementer.
- Do NOT write application code. Do NOT write feature flag code. Do NOT modify `02-shape.md`, `04-plan-*.md`, or any existing artifact.
- Your output is the experiment *design*. `wf-implement` builds the flag scaffold and rollout code.
- Be specific enough to implement (name flag keys, cohort logic, metric names) but do not write the implementation itself.
- Follow the steps below exactly in order.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug** from `$ARGUMENTS`. Must match an existing workflow directory.
   - If `.ai/workflows/<slug>/` does not exist → STOP: "No workflow `<slug>` found. Start one with `/wf-quick quick intake <description>`."
   - If `02-shape.md` does not exist → STOP: "Workflow `<slug>` has no shape yet. Run `/wf-shape <slug>` first."
2. **Check for existing experiment:**
   - If `04c-experiment.md` already exists → WARN: "An experiment design already exists for `<slug>`. Running again will overwrite it. Proceed? (yes to continue)"
3. **Check for instrumentation:**
   - If `04b-instrument.md` does NOT exist → surface this warning in the handoff: "No instrumentation plan found (`04b-instrument.md`). It is strongly recommended to run `/wf-instrument <slug>` before or alongside this experiment — you need observable signals to measure experimental outcomes."
   - Do NOT block. Proceed regardless.
4. **Read the workflow context:**
   - Read `02-shape.md` in full — the hypothesis lives here.
   - Read `04b-instrument.md` if present — this names the metrics available for the experiment.
   - Read `00-index.md` frontmatter — check `current-stage`, `status`, existing `augmentations:`, and `tags`.

# Step 1 — Hypothesis extraction & experiment design
Launch the sub-agent to design the experiment. Do not skip to writing the artifact before the sub-agent returns.

### Explore sub-agent — Experiment design

Prompt with ALL of the following:
- Read `02-shape.md` in full. Extract:
  - The implicit or explicit hypothesis: "We believe that [change] will [outcome] for [users]."
  - The change being made (treatment).
  - What the existing behavior is (control).
  - Any acceptance criteria — these become candidate success metrics.
- If `04b-instrument.md` is present, read it and note the signals that could serve as experiment metrics (prefer already-planned signals over net-new ones).
- Check the codebase for existing feature flag infrastructure:
  - Search for: `LaunchDarkly`, `Unleash`, `Growthbook`, `Flagsmith`, `Split.io`, custom flag files (`featureFlags.ts`, `flags.go`, `flags.py`)
  - If found: note the framework, the existing flag structure, and the naming conventions used for existing flags
  - If not found: note "no feature flag framework detected" and recommend a simple boolean environment variable as fallback

Design the experiment:
1. **Hypothesis** — state it as: "We believe that [treatment] will [metric movement] for [cohort] compared to [control]. We'll know this worked when [primary metric] improves by [threshold] without [guardrail metric] degrading."
2. **Experiment type** — choose ONE:
   - `feature-flag`: boolean on/off, rolled out by cohort or percentage
   - `a-b-test`: two distinct variants shown to split cohorts (UI-facing changes)
   - `canary`: new behavior rolled out to increasing % of traffic (infra/backend changes)
   - `shadow`: new path runs in parallel but results are discarded (for validation without user impact)
3. **Cohort design** — who gets treatment vs control:
   - Split dimension: user ID hash, region, account tier, new vs existing users, percentage of traffic
   - Split ratio: 50/50 for low-risk changes, 10/90 for high-risk (new feature tries 10% first)
   - Exclusions: any cohorts that must NEVER get the treatment (e.g., enterprise accounts on SLA, accounts in migration)
4. **Metrics**:
   - Primary: one metric that proves the hypothesis (conversion rate, latency p99, error rate, retention)
   - Secondary: 2-3 correlated signals to watch
   - Guardrails: metrics that must NOT regress (e.g., checkout error rate, session duration, revenue per user)
5. **Duration & stopping rules**:
   - Minimum runtime: enough for statistical significance (use rough heuristic: ≥1000 users in each cohort, ≥7 days)
   - Early stop — WIN: primary metric moves by threshold with p<0.05 (or practical significance)
   - Early stop — LOSS: guardrail metric regresses by >X% — rollback immediately
6. **Flag design**: name, type, and default value for the feature flag (or env var)

Return as structured text: full experiment design covering all 6 elements above, plus `flag_infrastructure_found: true|false` and `flag_framework` if found.

# Step 2 — Write `04c-experiment.md`

**`04c-experiment.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: augmentation
augmentation-type: experiment
slug: <slug>
parent-workflow: <slug>
experiment-type: feature-flag | a-b-test | canary | shadow
hypothesis: <one-line>
split: <e.g., "50/50 by user_id hash">
flag-name: <e.g., "enable_new_checkout_flow">
flag-framework: <e.g., "LaunchDarkly" | "env-var-fallback" | "none detected">
requires-instrument: <true|false>
status: ready
created-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get the real timestamp>
---
```

**Body sections (in order):**

## 1. Hypothesis

State the hypothesis in the standard form:

> We believe that **[treatment: description of the change]** will **[direction + metric]** for **[cohort]** compared to **[control: existing behavior]**. We'll know this worked when **[primary metric]** improves by **[threshold]** without **[guardrail metric]** degrading.

Also state the null hypothesis (what it means if the experiment shows no effect).

## 2. Experiment design

| Dimension | Value |
|---|---|
| **Type** | feature-flag / a-b-test / canary / shadow |
| **Control** | description of existing behavior |
| **Treatment** | description of new behavior |
| **Split dimension** | user_id hash / region / account_tier / traffic % |
| **Split ratio** | 50/50 / 10/90 / 5/95 (with one-line justification) |
| **Exclusions** | cohorts excluded from the experiment (or "none") |
| **Flag name** | `enable_<slug>` or framework-specific key |
| **Flag default** | `false` (off by default for safety) |

## 3. Metrics

**Primary metric:** `<metric_name>` — one sentence explaining what it measures and why it's the right signal.

**Secondary metrics:**
- `<metric_name>` — one-line description
- `<metric_name>` — one-line description

**Guardrail metrics (must not regress):**
- `<metric_name>` — regression threshold: if this drops by more than X%, trigger early stop
- `<metric_name>` — regression threshold

**Data source:** where these metrics come from (the `04b-instrument.md` signals if present, or existing analytics platform).

## 4. Duration & stopping rules

| Rule | Condition | Action |
|------|-----------|--------|
| **Minimum runtime** | `<N>` days, `<M>` users per cohort | Do not evaluate before this |
| **Early stop — WIN** | Primary metric improves by `<threshold>` with `p < 0.05` | Mark success, roll out to 100% |
| **Early stop — LOSS** | Guardrail regresses by more than `<threshold>` | Rollback immediately, post-mortem |
| **Maximum runtime** | `<N>` days | Force a decision — no indefinite experiments |

## 5. Rollback criteria

Explicit conditions that require immediate rollback:
- `<guardrail-metric>` drops below `<threshold>` — rollback in ≤30 minutes
- Error rate increases by more than `<N>%` — rollback in ≤15 minutes
- Any data integrity issue detected — rollback immediately and page on-call

Rollback procedure: set `<flag-name>` to `false` (or remove treatment code path if no flag infrastructure). No deployment needed if using a flag.

## 6. Implementation notes

Guidance for `wf-implement` on what to build for the flag scaffold:

- **Flag registration**: where to register the new flag (`<file:line>` pattern from existing flags)
- **Flag check**: where in the code to check the flag (cite the specific function and file from `02-shape.md`)
- **Cohort logic**: how to evaluate which cohort a user is in (hash function, lookup, or framework call)
- **Metric instrumentation**: which signals from `04b-instrument.md` already cover the primary and guardrail metrics (or which new ones are needed)
- **Framework**: if `flag_infrastructure_found: false`, recommend using an environment variable as a simple fallback: `ENABLE_<SLUG_UPPERCASE>=false`

## 7. Open questions

List any design decisions that require human input before the experiment can go live:
- Minimum sample size: "Is 1000 users per cohort enough, or do we need statistical power calculation?"
- Guardrail thresholds: "What is the acceptable regression threshold for `<metric>`?"
- Rollout timeline: "How long do we want to run this before forcing a decision?"

If all decisions are made: write "None — experiment design is complete."

# Step 3 — Update `00-index.md` augmentations registry

Read `00-index.md`, then add or update the `augmentations:` field in its YAML frontmatter:

```yaml
augmentations:
  - type: experiment
    artifact: 04c-experiment.md
    status: complete
    created-at: <timestamp>
```

If `augmentations:` already exists (from a prior augmentation), append to the list. Do not overwrite existing entries.

Also update `updated-at` to the current timestamp.

# Step 4 — Hand off to user

Emit a compact chat summary, no more than 12 lines:

```
wf-experiment complete: <slug>
Hypothesis: <one-line>
Type: <feature-flag|a-b-test|canary|shadow>
Flag: <flag-name> (default: false)
Split: <ratio> by <dimension>
Primary metric: <name>
Guardrails: <comma-separated list>
Flag framework: <detected | "none — env var recommended">
Instrumentation: <present | "MISSING — run /wf-instrument <slug> before shipping">
Next: /wf-implement <slug> — build the flag scaffold per §6
Artifact: .ai/workflows/<slug>/04c-experiment.md
```

If `04b-instrument.md` was not found, prefix with:

> ⚠ No instrumentation plan found. The experiment metrics may not be observable. Run `/wf-instrument <slug>` before or alongside implement.

# What this command is NOT

- **Not a flag infrastructure builder** — `wf-experiment` designs the experiment. `wf-implement` builds the flag scaffold and rollout code.
- **Not a stats engine** — sample size and significance calculations are directional guidelines, not rigorous statistical analysis. For high-stakes experiments, run a proper power calculation.
- **Not a rollout orchestrator** — it does not flip flags, monitor rollouts, or trigger rollbacks automatically. Those are operational tasks.
- **Not a substitute for product judgment** — it designs the experiment framework; deciding whether the hypothesis is worth testing, and what constitutes a meaningful result, requires human judgment.
