# SDLC Workflow

A plugin that runs software work as a disciplined lifecycle. Every feature, fix, or spike moves through the same sequence of stages. Each stage writes a permanent, machine-readable record under `.ai/workflows/<slug>/` in your repository, and the next stage reads it. The records are YAML files that scripts write: a stage agent writes a draft, and a script checks it and writes the record.

Every command, mode and setting is on one page: [docs/commands.html](docs/commands.html). Open it in a browser. This file is the map.

## Hosts

One source tree serves three hosts. The skill prose is written once and is host-neutral; five contract files under `skills/wf/reference/` hold everything a host does differently.

| Host | Reads | You type |
|---|---|---|
| Claude Code | `.claude-plugin/plugin.json`, `hooks/hooks.json` | `/wf …` |
| Codex | `.codex-plugin/plugin.json`, `hooks/codex.hooks.json` | `$wf …` |
| pi | `pi/package.json`, the pi package of this plugin | `/skill:wf …` |

All three hosts share the hooks and the `.ai/` artifacts. A workflow started under one host resumes under another. `/wf yolo` runs on all three hosts. Codex selects the skills (`$wf`, `$consult`, `$diataxis`, `$study-sources`) only when you name them. The command page names each host difference.

## Install

The plugin needs Node.js 22 or newer and git. On Claude Code and Codex it has no dependencies to install. The pi package needs one `npm install`.

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

pi: clone this repo, install the dependencies of the pi package, and install the package from the clone. pi loads it where it is.

```bash
git clone https://github.com/jayteealao/agent-skills
cd agent-skills/plugins/sdlc-workflow/pi
npm install
pi install .
```

When pi still loads `pi-unified` or `pi-sdlc`, remove it with `pi remove`. These older packages register the same tools. `npm run doctor`, run from `plugins/sdlc-workflow/`, reports each host.

To confirm the install, type `/wf` with no arguments. It asks what you want to do.

## Your first workflow

The lifecycle has nine stages. Each stage writes its part of the workflow's records:

```text
/wf intake <description>   → intake.yaml: the brief and the shape
/wf design <slug>          → design.yaml and the screens (only when the work changes screens)
/wf slice <slug>           → slices.yaml: the slices
/wf plan <slug> [slice]    → slice-<slice>.yaml: the plan
/wf implement <slug>       → slice-<slice>.yaml: the build
/wf verify <slug>          → slice-<slice>.yaml: the checks
/wf review <slug>          → review.yaml
/wf ship <slug>            → ship.yaml: the PR, the go/no-go gate and the merge
/wf retro <slug>           → retro.yaml
```

`state.yaml` and `meta.yaml` hold the index of the workflow.

You can also type plain words: `/wf keep going on export` or `/wf how do I ship a hotfix`. `/wf` shows the command it would run and runs it after your yes. `/wf status` shows every workflow and the next command for each. `/wf yolo <slug>` drives the lifecycle on any host and stops before ship. For small work, `/wf intake fix <description>` runs a compressed entry; the command page lists the lanes.

## Design

When a workflow changes screens, `/wf design` draws each screen as an HTML page in `.ai/design/` of your repo, with its five states. It checks the screens in a headless browser and records your approval as a commit. The folder is tracked in git.

`scripts/wf.mjs design server start` serves a canvas of every screen of every repo on this computer, on 127.0.0.1 and your tailnet. Open it on a phone to review the screens and comment on them. `scripts/wf.mjs design migrate <repo>` moves the design boards of an older workflow onto the surface, once per repo. [skills/wf/reference/design/_surface.md](skills/wf/reference/design/_surface.md) lists every design command.

## The 18 keys

<!-- generated from skills/wf/keys.json by npm run generate; edit keys.json -->
| Key | Does |
|---|---|
| `intake` | Entry dispatcher. A description starts stage 1: the brief and the shape (acceptance criteria, documentation plan, augmentations) in one run, or the small path that you choose: implement and verify now, one commit on the checked-out branch, one note; a mode (`fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `brainstorm`, `adopt`, `optimize`, `simplify`, `task`) runs an entry flow. A slug plus `amend`, `modernize` or `close` edits, backfills or closes the workflow or one slice. `brainstorm` thinks an idea through with you until you say `done`; `simplify` runs three read-only reviewers; `task` is work whose deliverable is not a code change. |
| `shape` | Alias of `intake` for this release: runs the shape phase on an existing workflow. |
| `design` | Human-only design stage between intake and slice: the person approves the screens on the design surface before any driver runs. `explore` sketches ideas and settles nothing. Also keeps the project's design record (`setup`, `teach`, `extract`, `direction`, `sync`). |
| `slice` | Decomposes the shape into shippable slices. |
| `plan` | Per-slice plan with a reuse scan. |
| `implement` | Codes the slice. `reviews` runs the fix-blockers mode. |
| `verify` | Tests, lints, typecheck, the user-observable AC gate, one user-gated fix loop. |
| `review` | Workflow review over an accumulating ledger; ad-hoc rubric or `sweep <aggregate>` without a slug. |
| `handoff` | Alias of `ship` for this release: ship opens the PR first. |
| `ship` | The last mile: the PR and CI, the go/no-go gate, then the merge and release via `.ai/ship-plan.md`; `announce`, `rollback`. |
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
