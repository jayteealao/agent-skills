# SDLC Workflow

A plugin that runs software work as a disciplined lifecycle. Every feature, fix, or spike moves through the same sequence of stages. Each stage writes a permanent, machine-readable artifact under `.ai/workflows/<slug>/` in your repository, and the next stage reads it. Hooks verify each artifact as it lands.

The full documentation is the site under [docs/site/](docs/site/index.html). This file is the map.

## Hosts

One source tree serves three hosts. The skill prose is written once and is host-neutral; five contract files under `skills/wf/reference/` hold everything a host does differently.

| Host | Reads | You type |
|---|---|---|
| Claude Code | `.claude-plugin/plugin.json`, `hooks/hooks.json` | `/wf …` |
| Codex | `.codex-plugin/plugin.json`, `hooks/codex.hooks.json` | `$wf …` |
| pi (`pi-code` extension) | the Claude Code plugin cache and hook wiring | `/skill:wf …` |

All three hosts share the hooks and the `.ai/` artifacts. A workflow started under one host resumes under another. `/wf yolo` runs under Claude Code only. Codex selects the skills (`$wf`, `$consult`, `$diataxis`, `$study-sources`, `$imagery`, `$uiproto`) only when you name them. The per-host differences are in [reference/hosts.html](docs/site/reference/hosts.html).

## Install

Follow [start/installation.html](docs/site/start/installation.html). It covers the marketplace add for each host, the one-time Codex hook trust, and the checks that confirm the install (`npm run verify:deployment`).

## Your first workflow

Follow [start/your-first-workflow.html](docs/site/start/your-first-workflow.html). The standard lifecycle is:

```text
/wf intake <description>   → 01-intake.md
/wf shape <slug>           → 02-shape.md
/wf slice <slug>           → 03-slice.md
/wf plan <slug> [slice]    → 04-plan-<slice>.md
/wf implement <slug>       → 05-implement-<slice>.md
/wf verify <slug>          → 06-verify-<slice>.md
/wf review <slug>          → 07-review-<slice>.md
/wf handoff <slug>         → 08-handoff.md
/wf ship <slug>            → 09-ship-run-<run-id>.md
/wf retro <slug>           → 10-retro.md
```

You can also type plain words: `/wf keep going on export` or `/wf how do I ship a hotfix`. `/wf` shows the command it would run and runs it after your yes. `/wf status` shows every workflow and the next command for each. `/wf auto <slug>` drives the lifecycle and pauses only at a stage's own gate. For small work, `/wf intake fix <description>` runs a compressed entry; [start/everyday-fixes.html](docs/site/start/everyday-fixes.html) lists the lanes.

## The 19 keys

| Key | Does |
|---|---|
| `intake` | Entry dispatcher. A description starts stage 1; a mode (`fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `brainstorm`, `adopt`, `optimize`, `simplify`, `task`) runs an entry flow. A slug plus `amend`, `modernize` or `close` edits, backfills or closes the workflow or one slice. `brainstorm` thinks an idea through with you until you say `done`; `simplify` runs three read-only reviewers; `task` is work whose deliverable is not a code change. |
| `shape` | Product-owner discovery: acceptance criteria, documentation plan, augmentations. |
| `design` | Human-only design stage between shape and slice: the person confirms the drawings before any driver runs. Also keeps the project's design record (`setup`, `teach`, `extract`, `direction`, `sync`). |
| `slice` | Decomposes the shape into shippable slices. |
| `plan` | Per-slice plan with a reuse scan. |
| `implement` | Codes the slice. `reviews` runs the fix-blockers mode. |
| `verify` | Tests, lints, typecheck, the user-observable AC gate, one user-gated fix loop. |
| `review` | Workflow review over an accumulating ledger; ad-hoc rubric or `sweep <aggregate>` without a slug. |
| `handoff` | Aggregates completed slices into a PR. Batch mode over `pr#N` or a branch. |
| `ship` | Release via `.ai/ship-plan.md`; `announce`, `rollback`. |
| `retro` | Post-mortem, per slug or per branch. |
| `probe` | Runtime-truth verification of built work; `sweep` enumerates the user surface. |
| `auto` | Lifecycle driver. Pauses only at a stage's own gate. Stops before handoff. |
| `yolo` | Autonomous driver. Resolves each gate by written policy. Claude Code only. |
| `campaign` | Walks the ordered list of work packets that a brainstorm or an ideate pick wrote, one work packet at a time on one branch: slices and yolo-drives each work packet, reads its decision fidelity, and pauses for a try-out when the work packet can be tried. One PR per list, or stacked PRs per work packet. The yolo runs are Claude Code only. |
| `loop` | Three loops. `loop goal` hands a slug to the host goal, and `goal.mjs check` decides that the goal is met. `loop optimize` changes the code toward one metric and keeps or reverts each trial; its driver is Claude Code only. `loop prototype` proves an idea by running code in its own worktree, one round per request of the person. |
| `status` | Dashboard; per-slug detail with the next command; `deep` drift check; `advise` sequencing. `status recap` is the plain-language catch-up for a slug or a branch. |
| `project` | The project-level contracts: `project ship-plan` (`init`, `build`, `edit`, `audit` for `.ai/ship-plan.md`) and `project observability` (`init`, `build`, `audit` for `.ai/observability.md`). |
| `docs` | Documentation router: the orchestrator pipeline, or one Diátaxis primitive. |

Arguments and artifacts for each key are in [reference/commands.html](docs/site/reference/commands.html). The surface is frozen by [docs/internal/SURFACE-POLICY.md](docs/internal/SURFACE-POLICY.md); `npm run verify:surface` enforces the pins.

## Hooks

Hooks verify each managed artifact on write, stage it, and record the turn's exact token usage to `.ai/workflows/<slug>/cost.jsonl`. They never block a valid write. [reference/hooks.html](docs/site/reference/hooks.html) lists every hook and its event. One setting in `.ai/sdlc-config.json`, `checks`, sets how the checks act: `strict` (the default) refuses a write that fails a gate, `warn` lets it stand with a warning, and `off` runs no check ([reference/configuration.html](docs/site/reference/configuration.html)).

One hook is a Claude Code mod: `hooks/mod/register.ts`, a function-hooks module with one job. The model cannot type the built-in `/goal`, so at the end of a `/wf loop goal` turn the mod puts the `/goal` line into the prompt box for your Enter; in the Desktop app it sends the line at once. It needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. Without the flag the module does not load, and you paste the `/goal` line that `/wf loop goal` prints.

## Site map

- Start: [installation](docs/site/start/installation.html) · [your first workflow](docs/site/start/your-first-workflow.html) · [everyday fixes](docs/site/start/everyday-fixes.html)
- Concepts: [why artifacts](docs/site/concepts/why-artifacts.html) · [evidence and gates](docs/site/concepts/evidence-and-gates.html) · [the machinery](docs/site/concepts/the-machinery.html)
- Guides: [choose your entry](docs/site/guides/choose-your-entry.html) · [the standard lifecycle](docs/site/guides/the-standard-lifecycle.html) · [quick lanes](docs/site/guides/quick-lanes.html) · [investigation](docs/site/guides/investigation.html) · [design](docs/site/guides/design.html) · [autonomous drivers](docs/site/guides/autonomous-drivers.html) · [releasing](docs/site/guides/releasing.html) · [staying oriented](docs/site/guides/staying-oriented.html)
- Reference: [commands](docs/site/reference/commands.html) · [intake modes](docs/site/reference/intake-modes.html) · [review dimensions](docs/site/reference/review-dimensions.html) · [artifacts](docs/site/reference/artifacts.html) · [hooks](docs/site/reference/hooks.html) · [configuration](docs/site/reference/configuration.html) · [hosts](docs/site/reference/hosts.html) · [skills](docs/site/reference/skills.html) · [glossary](docs/site/reference/glossary.html)

## Develop

```bash
npm test                # unit suite
npm run build           # bundle hooks and scripts into dist/
npm run verify:docs     # doc-site gate, including this file's line and name rules
```

Release steps are in [docs/internal/RELEASE-DISCIPLINE.md](docs/internal/RELEASE-DISCIPLINE.md). The change log is [CHANGELOG.md](CHANGELOG.md).
