---
description: Optimize intake. Roots an optimize slug on a full type:index overview (01-optimize → 02-optimize-spec → [the person confirms the spec]). The spec names one metric command, its direction, a guard that must pass after every change, the paths a trial may change, the budget and the branch rounds. The person confirms the spec before the first trial; then /wf loop optimize runs the loop, and the kept trials become one slice for verify and review.
argument-hint: <description> | <optimize-slug>
---

# Output boundary & shared context
Apply `intake/_intake-context.md`: the External Output Boundary and the workflow-registry and slug rules. Do not restate them here.

You are running `/wf intake optimize`. An optimize slug changes code toward one number. Its lifecycle replaces shape and plan with a metric spec, and the loop of `/wf loop optimize` writes the slice and the implement artifacts.

# Pipeline
`01-optimize` (intake) → `02-optimize-spec` → **[the person confirms the spec]** → `/wf loop optimize` (the loop → `03-slice`, `05-implement-optimize`) → `/wf verify <slug> optimize` → `/wf review` → `/wf ship` → `/wf retro`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces (this command) | `01-optimize.md` (`type: intake`, the brief), `02-optimize-spec.md` (`type: optimize-spec`), a conformant `00-index.md` (`type: index`, `workflow-type: optimize`), and the registry row. |
| Gate | The person confirms the spec. The choice of metric is the largest risk of the loop. |
| Next | `/wf loop optimize <slug>`. |

Optimize is standalone only. It roots its own slug, so it never attaches to an existing slug as a compressed slice.

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| the code that the metric exercises | artifact | always | |
| `00-index.md` | artifact | on-resume | |
| `01-optimize.md` | artifact | on-resume | |
| `02-optimize-spec.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_change-mode-tail.md` | procedure | always | |
| `intake/_intake-provenance.md` | procedure | always | |
| `intake/_intake-provenance-consume.md` | procedure | mode:from | |
| `01-optimize.md` | writes | | |
| `02-optimize-spec.md` | writes | | |

# Step 0 — Orient

1. Resolve the slug:
   - When the argument names an existing workflow whose index has `workflow-type: optimize`, this is a resume. Read `00-index.md`, `01-optimize.md` and `02-optimize-spec.md` with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> <name>` (per [_records.md](../_records.md); `index` names the index), then continue at the first step whose artifact is absent or not confirmed.
   - Otherwise, this is a new optimize slug. Derive the slug `optimize-<short-description>` (kebab-case, at most 5 words).
2. Apply the collision check of `_change-mode-tail.md`.
3. Apply `_intake-provenance.md`. A `from <source-slug>` token seeds the objective from the source.
4. Apply the stack policy of `_change-mode-tail.md`. The one-line stack confirm rides the Step 1 question round. Set `ux-impact: none` unless the metric measures a user surface.
5. Branch: ask per [_gate-question.md](../_gate-question.md), with the options `Create dedicated branch (recommended)` and `Use current branch`. On a dedicated branch, run the base check first (`node "<skill-dir>/scripts/wf.mjs" base check "<root>" --base <base>`, [_workflow-rules.md](../_workflow-rules.md)); then run `git checkout -b optimize-run/<slug>`. Do not name the branch `optimize/<slug>`: the loop uses that name for its trunk.

# Step 1 — Brief → `01-optimize.md` (`type: intake`)

Ask per [_gate-question.md](../_gate-question.md), in one round:

1. **The objective.** What number moves, and why does it matter?
2. **The metric command.** Which command prints the number? The last line of its standard output is one number, or a JSON object with the number under one key.
3. **The direction.** Is lower better, or higher?
4. **The guard.** Which command must exit 0 after every change? It is usually the test suite.
5. **The stack confirm**, from Step 0.

Write the draft `.ai/workflows/<slug>/.draft/01-optimize.md` with this frontmatter, and the body sections `## Objective`, `## Metric`, and `## Guard`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`:

```yaml
---
schema: sdlc/v1
type: intake
slug: <slug>
workflow-type: optimize
status: complete
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
tags: [optimize]
refs:
  index: 00-index.md
  next: 02-optimize-spec.md
next-command: wf-optimize
next-invocation: "/wf loop optimize <slug>"
---
```

# Step 2 — Prove the commands

1. Run the metric command once from the project root. The last line of its standard output must parse as one number, or as JSON with the named key. When the line does not parse, show the output and ask again.
2. Run the guard once. The guard must exit 0. When the guard fails, report the failure and end the run. A loop cannot start from a red guard.
3. Record the time of each run. The spec's `trial-timeout` must be larger than the time of the guard plus `repeat` metric runs.

# Step 3 — Spec → `02-optimize-spec.md` (`type: optimize-spec`)

1. Read the code that the metric exercises. Propose `allowed-paths` from that code. Propose `off-limits` for the metric, guard and holdout files and their fixtures: the script adds those files, but name them so the person sees them.
2. Propose the budget and the branch rounds. The defaults follow the table below.
3. Read the commit hooks of the project: `lefthook.yml`, `.pre-commit-config.yaml` and `.husky/`. Every trial commit passes these hooks, and a hook that refuses a commit rejects the trial. When a hook checks the format, propose that formatter as `format` (for example `cargo fmt --all` for a `cargo fmt --check` hook). The loop runs it on each change before the commit.
4. When the build of the stack writes to a folder that one environment variable moves, propose `shared-build` with that variable: `CARGO_TARGET_DIR` for a Rust workspace. Each branch of a round has its own worktree, and the shared folder spares each new worktree a cold build. Leave it out for other stacks.
5. Ask whether a holdout exists. Recommend one when the metric is a score over a fixed data set. The proposer never sees the holdout's output.
6. Ask the person to confirm or edit the spec, per [_gate-question.md](../_gate-question.md). Show the whole frontmatter.
7. Write the draft of `02-optimize-spec.md` and put it. Write `confirmed-by` with the person's name only after the person confirms. Until then, write `status: draft` and `confirmed-by: null`, and end the run.

| Field | Default | Meaning |
|---|---|---|
| `metric.repeat` | 5 | Runs for each measurement. The noise floor is half the spread of the baseline runs |
| `metric.min-gain` | `2%` | The smallest gain to keep, absolute or percent. A keep also needs a gain above 2 × noise |
| `metric.target` | `null` | When the kept value reaches it, the loop is complete |
| `budget.trials` | 60 | Trunk trials and branch trials together |
| `budget.plateau` | 8 | Trunk trials in a row with no keep that open a branch round |
| `budget.wall-clock`, `budget.tokens`, `budget.trial-timeout` | `6h`, `null`, `10m` | The other limits |
| `branch-rounds.at` | `[0%, 33%, 66%]` | The share of `budget.trials` used at which a round opens. `[]` turns the rounds off |
| `branch-rounds.branches` | 4 | Branches of each round |
| `branch-rounds.branch-trials` | 6% of `budget.trials`, at least 3 | Trials of each branch |
| `branch-rounds.max-extra` | 2 | The most rounds that a plateau adds after the scheduled ones |
| `branch-rounds.merge` | `consider` | After a round, consider a merge of the other kept branches into the trunk. `off` keeps only the winner |
| `width` | 1 | Trunk proposals for each batch. Measurement stays serial |
| `checkpoint-every` | 5 | Trunk trials between two holdout checks |
| `format` | `null` | A command that formats each change before its commit. Propose it from the commit hooks |
| `shared-build` | `null` | The variable that moves the build folder. The loop sets it to one folder for every worktree |

```yaml
---
schema: sdlc/v1
type: optimize-spec
slug: <slug>
status: confirmed
objective: "<the objective>"
confirmed-by: "<the person>"
confirmed-at: "<iso-8601>"
metric:
  command: "<command>"
  key: null
  direction: lower
  unit: "<unit>"
  target: null
  repeat: 5
  min-gain: 2%
guard:
  command: "<command>"
holdout:
  command: null
  tolerance: 1%
allowed-paths: ["<glob>"]
off-limits: ["<glob>"]
budget:
  trials: 60
  plateau: 8
  wall-clock: 6h
  tokens: null
  trial-timeout: 10m
branch-rounds:
  at: [0%, 33%, 66%]
  branches: 4
  branch-trials: 3
  max-extra: 2
  merge: consider
width: 1
checkpoint-every: 5
format: null
shared-build: null
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
tags: [optimize]
refs:
  index: 00-index.md
  intake: 01-optimize.md
next-command: wf-optimize
next-invocation: "/wf loop optimize <slug>"
---
```

The body is the prose that every proposer reads: what the code does, where the time or the score goes, and the ideas that the person wants tried or avoided.

# Step 4 — Index and registry

Write the draft of `00-index.md` from the index template of `_change-mode-tail.md`, with these values, and put it:

- `title: "Optimize: <objective>"`, `workflow-type: optimize`, `tags: [optimize]`, `current-stage: implement`, `stage-number: 5`. The loop is the implement stage of this lifecycle.
- `selected-slice: optimize` and one slice, `optimize`, with `status: defined` and `complexity: m`.
- `review-scope: per-slice`.
- `workflow-files`: `00-index.md`, `01-optimize.md`, `02-optimize-spec.md`.
- `progress`: `intake: complete`, `design: skipped`, `slice: not-started`, `plan: skipped`, and every later stage `not-started`.
- `design-skip-reason: "an optimize loop changes code toward a metric; it draws no surface"`.
- `next-command: wf-optimize` and `next-invocation: "/wf loop optimize <slug>"`.

Then register the slug in `.ai/workflows/INDEX.md` per `intake/_intake-context.md` → Register the workflow in INDEX.md.

# Step 5 — Hand off

End with the dispatcher's summary block. The narrative says the metric and its baseline run, the guard, the allowed paths, the budget and the branch rounds, and that the person confirmed the spec. `Next: /wf loop optimize <slug>`.
