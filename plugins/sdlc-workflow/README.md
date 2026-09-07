# SDLC Workflow

A plugin that runs software work as a disciplined lifecycle. Every feature, fix, or spike moves through the same sequence of stages. Each stage writes a permanent, machine-readable artifact under `.ai/workflows/<slug>/` in your repository, and the next stage reads it. A hub renders the artifacts as a local site, and hooks verify each artifact as it lands.

The full documentation is the site under [docs/site/](docs/site/index.html). This file is the map.

## Hosts

One source tree serves three hosts. The skill prose is written once and is host-neutral; five contract files under `skills/wf/reference/` hold everything a host does differently.

| Host | Reads | You type |
|---|---|---|
| Claude Code | `.claude-plugin/plugin.json`, `hooks/hooks.json` | `/wf …` |
| Codex | `.codex-plugin/plugin.json`, `hooks/codex.hooks.json` | `$wf …` |
| pi (`pi-code` extension) | the Claude Code plugin cache and hook wiring | `/skill:wf …` |

All three hosts share the runtime, the hub, the renderer, and the `.ai/` artifacts. A workflow started under one host resumes under another. `/wf yolo` runs under Claude Code only. Codex selects the skills (`$wf`, `$consult`, `$diataxis`, `$study-sources`, `$imagery`, `$uiproto`) only when you name them. The per-host differences are in [reference/hosts.html](docs/site/reference/hosts.html).

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

`/wf status` shows every workflow and the next command for each. `/wf auto <slug>` drives the lifecycle and pauses only at a stage's own gate. For small work, `/wf intake fix <description>` runs a compressed entry; [start/everyday-fixes.html](docs/site/start/everyday-fixes.html) lists the lanes.

## The 22 keys

| Key | Does |
|---|---|
| `intake` | Entry dispatcher. A description starts stage 1; a mode (`fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `adopt`, `amend`, `modernize`) runs a compressed or maintenance flow. |
| `shape` | Product-owner discovery: acceptance criteria, documentation plan, augmentations. |
| `slice` | Decomposes the shape into shippable slices. |
| `plan` | Per-slice plan with a reuse scan. |
| `implement` | Codes the slice. `reviews` runs the fix-blockers mode. |
| `verify` | Tests, lints, typecheck, the user-observable AC gate, one user-gated fix loop. |
| `review` | Workflow review over an accumulating ledger; ad-hoc rubric or `sweep <aggregate>` without a slug. |
| `handoff` | Aggregates completed slices into a PR. Batch mode over `pr#N` or a branch. |
| `ship` | Release via `.ai/ship-plan.md`; `announce`, `rollback`. |
| `retro` | Post-mortem, per slug or per branch. |
| `design` | Compressed design workflow; 20 design commands are its arguments. |
| `probe` | Runtime-truth verification of built work; `sweep` enumerates the user surface. |
| `simplify` | Three read-only reviewers over a branch, a commit range, a plan, or a path. |
| `auto` | Lifecycle driver. Pauses only at a stage's own gate. Stops before handoff. |
| `yolo` | Autonomous driver. Resolves each gate by written policy. Claude Code only. |
| `task` | Work whose deliverable is not a code change; observable ACs and a blast-radius gate. |
| `status` | Dashboard; per-slug detail with the next command; `deep` drift check; `advise` sequencing. |
| `recap` | Plain-language catch-up for a slug or a branch. |
| `close` | Archives a workflow, or closes one slice. |
| `ship-plan` | Release-pipeline router: `init`, `build`, `edit`, `audit` for `.ai/ship-plan.md`. |
| `docs` | Documentation router: the orchestrator pipeline, or one Diátaxis primitive. |
| `observability` | Observability router: `init`, `build`, `audit` for `.ai/observability.md`. |

Arguments and artifacts for each key are in [reference/commands.html](docs/site/reference/commands.html). The surface is frozen by [docs/internal/SURFACE-POLICY.md](docs/internal/SURFACE-POLICY.md); `npm run verify:surface` enforces the pins.

## Hooks

Hooks verify each managed artifact on write, stage it, render it, and record the turn's exact token usage to `.ai/workflows/<slug>/cost.jsonl`. They never block a valid write. [reference/hooks.html](docs/site/reference/hooks.html) lists every hook, its event, and its toggle in `.ai/sdlc-config.json` ([reference/configuration.html](docs/site/reference/configuration.html)).

## Site map

- Start: [installation](docs/site/start/installation.html) · [your first workflow](docs/site/start/your-first-workflow.html) · [everyday fixes](docs/site/start/everyday-fixes.html)
- Concepts: [why artifacts](docs/site/concepts/why-artifacts.html) · [evidence and gates](docs/site/concepts/evidence-and-gates.html) · [the machinery](docs/site/concepts/the-machinery.html) · [controlled language](docs/site/concepts/controlled-language.html)
- Guides: [choose your entry](docs/site/guides/choose-your-entry.html) · [the standard lifecycle](docs/site/guides/the-standard-lifecycle.html) · [quick lanes](docs/site/guides/quick-lanes.html) · [investigation](docs/site/guides/investigation.html) · [design](docs/site/guides/design.html) · [autonomous drivers](docs/site/guides/autonomous-drivers.html) · [releasing](docs/site/guides/releasing.html) · [staying oriented](docs/site/guides/staying-oriented.html)
- Reference: [commands](docs/site/reference/commands.html) · [intake modes](docs/site/reference/intake-modes.html) · [review dimensions](docs/site/reference/review-dimensions.html) · [artifacts](docs/site/reference/artifacts.html) · [hooks](docs/site/reference/hooks.html) · [configuration](docs/site/reference/configuration.html) · [hosts](docs/site/reference/hosts.html) · [skills](docs/site/reference/skills.html) · [glossary](docs/site/reference/glossary.html)

## Develop

```bash
npm test                # unit suite
npm run build           # bundle hooks and scripts into dist/
npm run verify:docs     # doc-site gate, including this file's line and name rules
```

Release steps are in [docs/internal/RELEASE-DISCIPLINE.md](docs/internal/RELEASE-DISCIPLINE.md). The change log is [CHANGELOG.md](CHANGELOG.md).
