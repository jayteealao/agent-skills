# Experiment — artifact template (`augment/experiment.md` Step 2)

Load this file from `experiment.md` when you write `04c-experiment.md`.

## `04c-experiment.md` (Step 2)

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
created-at: <real UTC timestamp per _timestamp.md>
next-command: wf-implement
next-invocation: "/wf implement <slug>"
recommended-routes:
  - invocation: "/wf implement <slug>"
    reason: "<one phrase>"
    default: true
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
