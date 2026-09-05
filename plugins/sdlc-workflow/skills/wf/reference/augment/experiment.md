---
description: Experiment design augmentation for an existing workflow. Extracts the hypothesis from the workflow's shape, designs a controlled experiment (feature flag, A/B test, or canary rollout) with explicit success metrics and rollback criteria, and writes the design as 04c-experiment.md into the existing workflow directory. Does NOT implement flag infrastructure. Registers itself in the workflow's 00-index.md augmentations list so wf-implement can build the rollout scaffolding to spec.
argument-hint: <slug>
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `wf-experiment`, an **experiment design augmentation** that designs a controlled rollout for an existing workflow's change.

> **Loaded as a sub-procedure (not a standalone key).** Augmentation is now *shape-decided* (`augmentations-needed` in `02-shape.md`) and applied by the lifecycle: `plan` loads this file to author its artifact, `implement` wires it, `verify` re-checks it. There is no `/wf experiment` key anymore. Run only the mode the calling stage requests.

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
| When to run | After `/wf shape` (which decides both augmentations) and ideally with the **instrument** augmentation authored first (observability is needed to measure outcomes). Before `/wf implement` so the flag scaffolding is planned before coding begins. |
| Warning | If `04b-instrument.md` is NOT present, surface a warning — experiments are hard to evaluate without observable signals. Do NOT block. |

> **Auto second opinion (objective triggers).** After the design sub-agent returns (before writing
> `04c-experiment.md`), **auto-invoke** `/consult codex <critique this hypothesis and metric choice —
> primary metric, guardrails, stopping rules>` (pinning `codex`/`claude` keeps it free) when ANY of:
> (a) the primary metric is a proxy rather than the outcome the shape's AC names; (b) no stopping
> rule or guardrail could be derived from the artifacts; (c) the experiment gates a charter
> commitment or a carried intent-risk (RIM). A misjudged metric compounds silently once the
> experiment is live — that is exactly the error class a second model catches. Skip only when none
> of the triggers hold; the user may invoke it explicitly with any provider.

# CRITICAL — scope discipline
You are an **experiment designer**, not an implementer.
- Do NOT write application code. Do NOT write feature flag code. Do NOT modify `02-shape.md`, `04-plan-*.md`, or any existing artifact.
- Your output is the experiment *design*. `wf-implement` builds the flag scaffold and rollout code.
- Be specific enough to implement (name flag keys, cohort logic, metric names) but do not write the implementation itself.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug** from `$ARGUMENTS`. Must match an existing workflow directory.
   - If `.ai/workflows/<slug>/` does not exist → STOP: "No workflow `<slug>` found. Start one with `/wf intake <description>`."
   - If `02-shape.md` does not exist → STOP: "Workflow `<slug>` has no shape yet. Run `/wf shape <slug>` first."
2. **Check for existing experiment:**
   - If `04c-experiment.md` already exists → WARN: "An experiment design already exists for `<slug>`. Running again will overwrite it. Proceed? (yes to continue)"
3. **Check for instrumentation:**
   - If `04b-instrument.md` does NOT exist → surface this warning in the handoff: "No instrumentation plan found (`04b-instrument.md`). It is strongly recommended to include the **instrument** augmentation (shape adds it to `augmentations-needed`; `plan` authors `04b-instrument.md`) before or alongside this experiment — you need observable signals to measure experimental outcomes."
   - Do NOT block. Proceed regardless.
4. **Read the workflow context:**
   - Read `02-shape.md` in full — the hypothesis lives here.
   - Read `04b-instrument.md` if present — this names the metrics available for the experiment.
   - Read `00-index.md` frontmatter — check `current-stage`, `status`, existing `augmentations:`, and `tags`.

# Step 1 — Hypothesis extraction & experiment design
Launch the sub-agent to design the experiment. Do not skip to writing the artifact before the sub-agent returns.

### research sub-agent — Experiment design

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

Write `04c-experiment.md` with the frontmatter and the seven body sections in [experiment/_artifact.md](experiment/_artifact.md).

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

Return per [_chat-return.md](../_chat-return.md) — narrative lead (what was found, built, or measured, and what it means for the user), then the structured anchors below.

Emit a compact chat summary:

```
wf-experiment complete: <slug>
Hypothesis: <one-line>
Type: <feature-flag|a-b-test|canary|shadow>
Flag: <flag-name> (default: false)
Split: <ratio> by <dimension>
Primary metric: <name>
Guardrails: <comma-separated list>
Flag framework: <detected | "none — env var recommended">
Instrumentation: <present | "MISSING — author the instrument augmentation (shape/plan) before shipping">
Next: /wf implement <slug> — build the flag scaffold per §6
Artifact: .ai/workflows/<slug>/04c-experiment.md
```

If `04b-instrument.md` was not found, prefix with:

> ⚠ No instrumentation plan found. The experiment metrics may not be observable. Ensure the **instrument** augmentation is authored (shape decides it, plan writes `04b-instrument.md`) before or alongside implement.

# What this sub-procedure is NOT

- **Not a flag infrastructure builder** — `wf-experiment` designs the experiment. `wf-implement` builds the flag scaffold and rollout code.
- **Not a stats engine** — sample size and significance calculations are directional guidelines, not rigorous statistical analysis. For high-stakes experiments, run a proper power calculation.
- **Not a rollout orchestrator** — it does not flip flags, monitor rollouts, or trigger rollbacks automatically. Those are operational tasks.
- **Not a substitute for product judgment** — it designs the experiment framework; deciding whether the hypothesis is worth testing, and what constitutes a meaningful result, requires human judgment.

---

## Step — Sibling YAML `experiment`

Write the sibling `04c-experiment.yaml` per [experiment/_artifact.md](experiment/_artifact.md) → *Sibling YAML*.

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](../_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
