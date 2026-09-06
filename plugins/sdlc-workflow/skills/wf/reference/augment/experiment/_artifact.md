# Experiment — artifact template and sibling YAML (`augment/experiment.md` Step 2 and the Sibling YAML step)

Load this file from `experiment.md` when you write `04c-experiment.md` and its sibling `04c-experiment.yaml`.

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
---
```

**Body sections (in order):**

## The Experiment
<!-- STORY SECTION — first, and self-sufficient. must follow `../../_story-arc.md`: three beats in order — the state this stage inherited, the load-bearing decisions with reasons and counts, then what this stage enables next plus the top open risk. Language must follow `../../_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs. -->

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

## Step — Sibling YAML `experiment`

After writing the experiment MD (`.ai/workflows/<slug>/04c-experiment.md`
or, when invoked as an augmentation under a slug,
`.ai/workflows/<slug>/augmentations/<exp-id>.md`), write a sibling
`.yaml` next to it with `artifact: experiment`. The view-layer renderer
projects this as an arm-allocation figure (horizontal bar split by
`allocated_pct`) plus a guardrail-threshold table.

**Required whenever you write the `experiment` sibling YAML:** also write the
sibling `.html.fragment` next to it. First load
`../../_fragment-authoring.md` and follow
its wrapper, snippet, and verifier rules. The fragment must stay deterministic
from the sibling YAML (same YAML → byte-identical HTML) and pass
`scripts/verify-fragment.mjs` (Check 7) clean.

Shape:

```yaml
# 04c-experiment.yaml — or augmentations/<exp-id>.yaml
artifact:        experiment
experiment_type: a-b-test          # feature-flag | a-b-test | canary | shadow
flag:            "checkout.board-virtualization"
framework:       "growthbook"
hypothesis:      "Virtualizing the board cuts initial-render time by ≥30% with no change to interaction error rate."
split:           "50/50 by user-id hash"
status:          ready             # ready | running | completed | abandoned
arms:
  - id:            control
    description:   "Existing render path (DOM-virtualised list only)."
    allocated_pct: 50
  - id:            treatment
    description:   "Full virtual-scroller for boards >200 cards."
    allocated_pct: 50
guardrails:
  - name:      "p95_render_ms"
    threshold: 250
    direction: lower-is-better
    unit:      ms
  - name:      "drag_error_rate"
    threshold: 0.005
    direction: lower-is-better
  - name:      "board_engagement_min_per_session"
    threshold: 4.2
    direction: higher-is-better
    unit:      min
```

Authoring rules:
- `arms[]` must have at least 2 entries. Sum of `allocated_pct` should
  be 100; the renderer does not enforce but the arm bar visually
  expects it.
- `guardrails[]` is optional but strongly recommended — without it the
  experiment page documents the hypothesis but gives no shape to the
  decision criteria.
- `flag:` is required for `experiment_type: feature-flag | canary | shadow`
  and recommended for `a-b-test` when implemented via a flag library.
