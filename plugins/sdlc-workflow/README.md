# SDLC Workflow

A plugin that runs software work as a disciplined lifecycle. Every feature, fix, or spike moves through the same sequence of stages. Each stage writes a permanent, machine-readable artifact under `.ai/workflows/<slug>/` in your repository, and the next stage reads it. Hooks verify each artifact as it lands.

Every command, mode and setting is on one page: [docs/commands.html](docs/commands.html). Open it in a browser. This file is the map.

## Hosts

One source tree serves three hosts. The skill prose is written once and is host-neutral; five contract files under `skills/wf/reference/` hold everything a host does differently.

| Host | Reads | You type |
|---|---|---|
| Claude Code | `.claude-plugin/plugin.json`, `hooks/hooks.json` | `/wf …` |
| Codex | `.codex-plugin/plugin.json`, `hooks/codex.hooks.json` | `$wf …` |
| pi (`pi-code` extension) | the Claude Code plugin cache and hook wiring | `/skill:wf …` |

All three hosts share the hooks and the `.ai/` artifacts. A workflow started under one host resumes under another. `/wf yolo` runs under Claude Code only. Codex selects the skills (`$wf`, `$consult`, `$diataxis`, `$study-sources`, `$imagery`, `$uiproto`) only when you name them. The command page names each host difference.

## Install

The plugin needs Node.js 22 or newer and git. It has no dependencies to install.

Claude Code: add the marketplace, then install the plugin, then start a new session.

```text
/plugin marketplace add jayteealao/agent-skills
/plugin install sdlc-workflow@agent-skills-marketplace
```

Codex: `codex features list` must show `plugins` and `hooks` as true. Add the marketplace and the plugin:

```bash
codex plugin marketplace add https://github.com/jayteealao/agent-skills
codex plugin add sdlc-workflow@agent-skills-marketplace
```

Then open a Codex session and run `/hooks`. Trust all seven events (SessionStart, SubagentStart, PreToolUse, PermissionRequest, PostToolUse, Stop, SubagentStop). Codex skips an untrusted hook without an error. `npm run verify:deployment`, run from the installed plugin folder, reports the Codex state.

To confirm the install, type `/wf` with no arguments. It asks what you want to do.

## Your first workflow

The standard lifecycle is:

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

You can also type plain words: `/wf keep going on export` or `/wf how do I ship a hotfix`. `/wf` shows the command it would run and runs it after your yes. `/wf status` shows every workflow and the next command for each. `/wf yolo <slug>` drives the lifecycle on any host and stops before handoff. For small work, `/wf intake fix <description>` runs a compressed entry; the command page lists the lanes.

## The 18 keys

<!-- generated from skills/wf/keys.json by npm run generate; edit keys.json -->
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
| `yolo` | Autonomous driver. Resolves each gate by written policy. |
| `campaign` | Walks the ordered list of work packets that a brainstorm or an ideate pick wrote, one work packet at a time on one branch: slices and yolo-drives each work packet, reads its decision fidelity, and pauses for a try-out when the work packet can be tried. One PR per list, or stacked PRs per work packet. |
| `loop` | Three loops. `loop goal` hands a slug to the host goal, and `goal.mjs check` decides that the goal is met. `loop optimize` changes the code toward one metric and keeps or reverts each trial. `loop prototype` proves an idea by running code in its own worktree, one round per request of the person. |
| `status` | Dashboard; per-slug detail with the next command; `deep` drift check; `advise` sequencing. `status recap` is the plain-language catch-up for a slug or a branch. |
| `project` | The project-level contracts: `project ship-plan` (`init`, `build`, `edit`, `audit` for `.ai/ship-plan.md`) and `project observability` (`init`, `build`, `audit` for `.ai/observability.md`). |
| `docs` | Documentation router: the orchestrator pipeline, or one Diátaxis primitive. |

`loop optimize` has a gap on Codex and pi.
<!-- end generated -->

Arguments and artifacts for each key are on the [command page](docs/commands.html). The surface is frozen by [docs/internal/SURFACE-POLICY.md](docs/internal/SURFACE-POLICY.md); `npm run verify:surface` enforces the pins.

## Hooks

Hooks verify each managed artifact on write, stage it, and record the turn's exact token usage to `.ai/workflows/<slug>/cost.jsonl`. They never block a valid write. One setting in `.ai/sdlc-config.json`, `checks`, sets how the checks act: `strict` (the default) refuses a write that fails a gate, `warn` lets it stand with a warning, and `off` runs no check. The command page lists every setting.

One hook is a Claude Code mod: `hooks/mod/register.ts`, a function-hooks module with one job. The model cannot type the built-in `/goal`, so at the end of a `/wf loop goal` turn the mod puts the `/goal` line into the prompt box for your Enter; in the Desktop app it sends the line at once. It needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. Without the flag the module does not load, and you paste the `/goal` line that `/wf loop goal` prints.

## Develop

```bash
npm test                # core tests, under 30 s; CI and the release run them
npm run test:integration  # git, CLI and process tests, one file at a time, local only
npm run lint:drift      # forms, links, settings and generated files against the source
npm run verify:docs     # the command page lists the registry; this file's line and name rules
```

The hooks and scripts run from the source with Node 22 and no dependencies, so there is no build step and no `npm install`. When the keys change, update [docs/commands.html](docs/commands.html), and republish its artifact from it.

Release steps are in [docs/internal/RELEASE-DISCIPLINE.md](docs/internal/RELEASE-DISCIPLINE.md). The change log is [CHANGELOG.md](CHANGELOG.md).
