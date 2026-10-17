# WF-GOAL-PLAN — a goal contract that the host carries

Status **SHIPPED v9.189.0** (2026-10-18: W1–W4 and W6 docs built; probes P1, P2 and the W5 live run not run) · Date **2026-10-17** · Plugin **v9.187.0** · Owner **jayte**
Pairs with: [WF-OPTIMIZE-PLAN.md](WF-OPTIMIZE-PLAN.md) (the metric loop, which this contract carries on Codex and pi). Related: `docs/internal/ideas/IDEAS-3.md` §8 (a Stop hook that continues while work remains; this plan replaces that idea). Origin: the PO's review of goals and autoresearch, 2026-10-17.

## 1. Why

A goal is an objective that an agent keeps pursuing over many turns until a judge says it is done. Two hosts now ship one.

| Host | Primitive | Who judges done | Cap | Persistence |
|---|---|---|---|---|
| Claude Code | `/goal <condition>` (v2.1.139+) | A small model reads the condition and the transcript after every turn. It runs no tools and reads no files | None built in. The condition text must state one | Survives `--continue` and `--resume`. `/clear` removes it |
| Codex | `/goal <objective>`, with `features.goals = true`; model tools `create_goal`, `get_goal`, `update_goal` | The working model marks the goal complete | Optional token budget. When the budget runs out, the goal soft-pauses | Held by the app server across sessions |
| pi | none | — | — | — |

Both hosts own continuation well. Their judging is weak in two known ways:

- The Claude Code judge sees only what the transcript shows. A claim of "tests pass" with no output gets past the judge.
- The Codex model judges its own work. The reported failure is "verification theatre": the agent writes tests that confirm its own output.

`/wf` has no goal today. `auto` and `yolo` finish when the lifecycle is clean, and campaign finishes when every wave is merged. None of them records an objective that the person states, a check that proves the objective, or a cap. On Codex and pi, nothing carries `auto` across turns.

## 2. Answer to the PO's question

The PO asked whether passing to the host goal works best. It works best for continuation, but not for judging. This plan splits the work:

- **The host carries the loop.** It owns the Stop-hook continuation, pause, resume, and its own budget. `/wf` builds no Stop hook. A second Stop hook would compete with the host's.
- **`/wf` owns the evidence.** A script, `scripts/goal.mjs check`, runs the proof commands and prints the result into the transcript. Its last line is `GOAL: MET`, `GOAL: NOT-MET <reason>`, or `GOAL: BLOCKED <reason>`. The condition tells the host judge to trust only that line.

This gives the Claude Code judge real evidence to read. It also gives the Codex model a rule: it may call `update_goal` to complete only after `check` prints `GOAL: MET` in the same turn.

One limit is real. On Claude Code, the model cannot type the built-in `/goal` command. The mod, the person, or a headless start must submit it (D4).

## 3. Decisions

| # | Decision | By |
|---|---|---|
| D1 | The host goal carries continuation. `/wf` adds no Stop hook for goals. | PO 2026-10-17 (passing to goal) |
| D2 | One new key, `goal`. `/wf goal <slug> [objective]` writes the contract and arms the host goal. `/wf goal <slug> resume`, `status`, and `clear` act on an existing contract. With no objective, the objective is the slug's lifecycle (4.3). | recommendation |
| D3 | `scripts/goal.mjs check` is the only source of a done verdict. It runs commands and reads `00-index.md`. It never asks a model. | recommendation |
| D4 | Arming, per host: on Claude Code Desktop, the mod submits `/goal <condition>` as a prompt, as the usage guard submits its resume prompt. On the Claude Code CLI, `/wf` prints the line for the person to paste. Under Codex, the model calls `create_goal`. Under pi, `/wf goal` runs the in-session loop of `auto`. The spelling lives in `_host-invocation.md`. | recommendation, probe P1 |
| D5 | A human gate ends the goal. While a goal is armed and a `/wf` gate needs the person, the agent runs `goal.mjs park <slug> <gate>`, then `check`. `check` prints `GOAL: BLOCKED gate <id>`, and the condition maps BLOCKED to "impossible". The agent never answers a human gate itself to keep a goal alive. | recommendation (PO rules: the person ends exploration and owns gates) |
| D6 | `goal.mjs` counts checks and enforces the cap in code. Past `max-checks`, `check` prints `GOAL: BLOCKED budget`. The condition text repeats the cap, because Claude Code has no built-in cap. | recommendation |
| D7 | The contract lives in the slug: `.ai/workflows/<slug>/goal.md` and `goal/checks.jsonl`. `/clear` removes the host goal but not the contract. `/wf goal <slug> resume` arms it again. | recommendation |
| D8 | `yolo` and the campaign wave driver do not use goals. They run in the Workflow tool and own their own loop. | recommendation |

## 4. Design

### 4.1 The contract

`goal.md` has YAML frontmatter that `goal.mjs` reads, and one line of prose that the worker reads.

```yaml
objective: "Drive slug billing-limits to handoff-ready"
kind: lifecycle            # lifecycle | optimize | proofs
proofs:                    # kind: proofs only. Each command must exit 0
  - "npm test"
  - "node scripts/coverage-floor.mjs 80"
max-checks: 30
armed-at: 2026-10-17T14:02:11Z
host: claude-code          # claude-code | codex | pi
state: armed               # armed | met | blocked | cleared
```

| `kind` | `check` prints MET when |
|---|---|
| `lifecycle` | `00-index.md` meets the `auto` stop rules: every selected slice has verify `result: pass` with `convergence` in `{not-needed, converged}`, and review is `ship` or `ship-with-caveats` with `metric-findings-blocker == 0` |
| `optimize` | `optimize.mjs status` prints `complete`. `stopped` maps to BLOCKED with its reason |
| `proofs` | every proof command exits 0 |

The `lifecycle` rule is prose in `auto.md` today. W1 moves it into `lib/lifecycle-done.mjs` so that `auto`, `goal.mjs`, and `/wf status` share one copy.

### 4.2 `scripts/goal.mjs`

| Subcommand | Does |
|---|---|
| `arm <root> <slug>` | Validates the contract. Prints the condition text for the host (4.4). Sets `state: armed`. |
| `check <root> <slug>` | Runs the rule for `kind`. Prints the evidence (each command, its exit code, and the last 20 lines of output), then the `GOAL:` line. Appends one line to `checks.jsonl`. Increments the count. |
| `park <root> <slug> <gate-id>` | Records the human gate. The next `check` prints `GOAL: BLOCKED gate <gate-id>`. |
| `status <root> <slug>` | Prints the state, the check count, and the last verdict. |
| `clear <root> <slug>` | Sets `state: cleared`. The host goal must be cleared as well (4.4). |

### 4.3 The worker's turn

While a goal is armed, `reference/goal.md` tells the worker to do these steps in each turn:

1. Do the next unit of work. For `lifecycle`, that is the next stage, as `auto` picks it. For `optimize`, that is one trial, as `optimize.mjs` picks it.
2. When a `/wf` gate needs the person, run `goal.mjs park`. Do not answer the gate.
3. At the end of the turn, run `goal.mjs check`. Its output must be the last tool output of the turn, so the judge reads it.
4. Under Codex, when `check` prints `GOAL: MET`, call `update_goal` to complete. Do not call it on any other line.

### 4.4 The condition text

`goal.mjs arm` prints one condition for every host:

> The goal is met only when the most recent output of `node <plugin>/scripts/goal.mjs check <root> <slug>` in this conversation ends with the line `GOAL: MET`. If that line is `GOAL: BLOCKED`, the goal is impossible. A claim without that output is not evidence. Stop after 30 checks.

| Host | How `/wf goal` arms it |
|---|---|
| Claude Code Desktop | The mod submits `/goal <condition>` as a prompt (P1). It shows a toast with the condition |
| Claude Code CLI | `/wf goal` prints `/goal <condition>` in a fenced block and asks the person to paste it |
| Claude Code headless | `claude -p "/goal <condition>"`, for scripts and scheduled tasks |
| Codex | The model calls `create_goal` with the condition, and with a token budget when the contract has one. When `features.goals` is off, `/wf goal` tells the person how to turn it on and stops |
| pi | No host goal. `/wf goal` runs the `auto` loop in session and runs `check` after each stage |

### 4.5 What this gives

- **Codex and pi get an unattended `auto`.** `/wf goal <slug>` with `kind: lifecycle` drives the lifecycle to handoff-ready across turns and stops at every human gate. `yolo` stays Claude Code only, because `yolo` answers gates by policy, and a goal does not.
- **Optimize runs on Codex.** `kind: optimize` carries the loop of WF-OPTIMIZE-PLAN on hosts with no driver.
- **The person can state a free objective** with `kind: proofs`, for example "CI green and coverage at 80", tied to a slug and its ledger.

## 5. Work

| W | Work | Files |
|---|---|---|
| P1 | Probe on Claude Code Desktop: does a prompt that the mod submits and that starts with `/goal` run as the built-in command? Does the goal survive a compaction in that session? Record the result before W3 | `CAMPAIGN-PROBES.md` style note |
| P2 | Probe under Codex: does `create_goal` accept the condition from a skill turn, given the rule that the model must not infer goals? | probe note |
| W1 | `lib/lifecycle-done.mjs`, used by `auto.md`, `/wf status`, and `goal.mjs`. Tests | `lib/`, `tests/` |
| W2 | `lib/goal.mjs`, `scripts/goal.mjs`, tests | `lib/`, `scripts/`, `tests/` |
| W3 | The mod arm action (Desktop) and its toast | `hooks/mod/` |
| W4 | `reference/goal.md`, the key row in `SKILL.md`, the host rows in `_host-invocation.md`, the park rule in `_autonomy-guards.md` | `skills/wf/` |
| W5 | Live run: `/wf goal <slug>` with `kind: lifecycle` on Claude Code Desktop and on Codex, each to a human gate and past it after `resume` | run notes |
| W6 | Docs page, changelog, release | `docs/site/`, `CHANGELOG.md` |

W1 and W2 come first, because WF-OPTIMIZE-PLAN W5 needs them.

## 6. Open questions

1. Is `goal` a key of its own, or a mode of `auto` (`/wf auto <slug> goal`)? A key keeps `resume`, `status`, and `clear` in one place. A mode adds no key. The recommendation is the key.
2. If P1 fails on Desktop, is a printed line that the person pastes acceptable on Desktop, or does Claude Code need a Workflow-tool driver for `kind: lifecycle` there too? (`yolo` already covers most of that need.)
3. Should `check` be cheap enough to run after every turn? For `kind: proofs` with a slow test suite, a check per turn is expensive. One option is a `check-every` field that reuses the last result between full runs.
