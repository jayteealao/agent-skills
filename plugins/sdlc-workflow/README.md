# SDLC-Workflow

A Claude Code plugin that gives your AI assistant a structured software delivery lifecycle. Instead of ad-hoc prompts that produce inconsistent results, every feature, fix, or spike moves through the same reproducible sequence of stages — each one writing a permanent artifact to your repo that the next stage reads.

---

## Before you start

**Prerequisites**

- Claude Code with the sdlc-workflow plugin installed
- A project with a git working directory (artifacts are written under `.ai/workflows/`)
- Familiarity with running slash commands in Claude Code (`/command-name arguments`)

**What the plugin provides**

Eleven commands that guide a piece of work from rough idea to shipped and retrospected:

| Command | Stage | Artifact written |
|---|---|---|
| `/wf-intake` | 1 — Intake | `01-intake.md` |
| `/wf-shape` | 2 — Shape | `02-shape.md` |
| `/wf-slice` | 3 — Slice | `03-slice.md` |
| `/wf-plan` | 4 — Plan | `04-plan.md` |
| `/wf-implement` | 5 — Implement | `05-implement.md` |
| `/wf-verify` | 6 — Verify | `06-verify.md` |
| `/wf-review` | 7 — Review | `07-review.md` |
| `/wf-handoff` | 8 — Handoff | `08-handoff.md` |
| `/wf-ship` | 9 — Ship | `09-ship.md` |
| `/wf-retro` | 10 — Retro | `10-retro.md` |
| `/wf-next` | Routing helper | reads `00-index.md`, returns next command |

Every workflow also has a `00-index.md` control file and a `po-answers.md` answers log — both maintained automatically.

---

## How to start a new workflow

Run `/wf-intake` with a plain-language description of your task. You do not need a slug yet — the command derives one from your description.

```
/wf-intake add dark mode toggle to settings page
```

The command will:

1. Ask you a small number of questions that materially affect scope (acceptance criteria, non-goals, known constraints, rollout notes). Answer them in chat — they are written to `po-answers.md`.
2. Create `.ai/workflows/dark-mode-toggle-settings/` and write `00-index.md` and `01-intake.md`.
3. Return a compact summary ending with the exact command to run next.

**The slug** (`dark-mode-toggle-settings`) is derived from your description and stays fixed for the life of the workflow. Every subsequent command takes it as its first argument.

---

## How to progress through a workflow stage by stage

After each stage completes, the command tells you exactly what to run next — including the full invocation with slug. Copy it and run it.

```
/wf-shape dark-mode-toggle-settings
```

```
/wf-slice dark-mode-toggle-settings
```

```
/wf-plan dark-mode-toggle-settings slice-1
```

```
/wf-implement dark-mode-toggle-settings slice-1
```

Each stage reads the artifacts written by earlier stages. You do not need to re-explain context — the commands read `00-index.md` and the relevant stage files automatically.

**If you are not sure what to run next**, use the routing helper:

```
/wf-next dark-mode-toggle-settings
```

It reads `00-index.md` and returns the exact next command with arguments.

---

## How to work with slices

`/wf-slice` breaks shaped work into thin, independently deliverable vertical slices. Once slices exist, all downstream commands target a specific one using the second argument.

```
/wf-plan dark-mode-toggle-settings slice-2
/wf-implement dark-mode-toggle-settings slice-2
/wf-verify dark-mode-toggle-settings slice-2
```

**To implement slices in sequence**, finish the full implement → verify → review → handoff → ship cycle on slice-1 before starting slice-2. The index tracks which slice is currently selected.

**To implement a single slice from a multi-slice workflow**, pass the slice identifier at every stage. The command reads only the artifacts relevant to that slice.

**If you have a small change that does not need slicing**, pass a focus area instead of a slice identifier:

```
/wf-plan dark-mode-toggle-settings css-variables-only
```

---

## How to pick up a workflow after a context gap

If you lose your session or return to a workflow after a break, run the routing helper with the slug:

```
/wf-next dark-mode-toggle-settings
```

It reads the control file, determines the current stage and status, and returns the exact next command. If you have forgotten the slug, omit it — the command searches `.ai/workflows/*/00-index.md` and either infers the most recent active workflow or asks you to choose.

```
/wf-next
```

---

## How to handle a mandatory-question stage

Two stages — **intake** and **ship** — are mandatory-question stages. They will not finalize until you have answered the required questions.

**Intake** asks about scope, acceptance criteria, non-goals, and constraints. If you run `/wf-intake` with no description, it will ask for one before proceeding.

**Ship** asks about:
- Target environment and release window
- Rollout preference (immediate, staged, canary, feature flag, maintenance window)
- Rollback tolerance and business risk
- Stakeholder communication or compliance requirements

If answers are not yet available when you run the command, it writes the stage file with `Status: Awaiting input`, lists the exact unanswered questions, and stops. Return to it when you have the answers:

```
/wf-ship dark-mode-toggle-settings slice-1
```

The command resumes from where it stopped, reads your answers from the session, and completes the stage.

---

## How to run a review with the workflow

`/wf-review` performs an engineering-quality review of your diff inline — it reads the shape, implementation, and verification files, inspects the actual code changes, and produces a prioritised verdict.

```
/wf-review dark-mode-toggle-settings slice-1
```

It produces three tiers:

- **Blocking issues** — must fix before handoff
- **Should-fix issues** — fix in this PR if possible
- **Nice-to-have improvements** — can be follow-up work

If there are blocking issues, the recommended next command returns to `/wf-implement`. If the review passes, it recommends `/wf-handoff`.

---

## How to generate a PR-ready handoff package

`/wf-handoff` reads the implementation, verification, and review artifacts and produces a reviewer-friendly summary package: PR title options, problem/solution summary, affected areas, verification evidence, migration notes, risks, and reviewer focus areas.

```
/wf-handoff dark-mode-toggle-settings slice-1
```

The output in `08-handoff.md` is designed to be copied directly into a PR description or a team handoff doc.

---

## How to close out a completed workflow

After shipping, run the retro to extract reusable lessons:

```
/wf-retro dark-mode-toggle-settings
```

It reads the full workflow trail and produces concrete improvement suggestions for your `CLAUDE.md`, hooks, test coverage, CI checks, and command prompts. It marks the workflow complete in `00-index.md`.

Retro output is in `10-retro.md`. Each recommendation includes a priority and suggested text you can paste directly into your repo instruction files.

---

## How to read and understand the control file

Every workflow has a `00-index.md` at `.ai/workflows/<slug>/00-index.md`. It is the single source of truth for workflow state. Read it directly whenever you want to inspect a workflow without running a command.

The file always contains these fields:

| Field | What it tells you |
|---|---|
| `title` | Human-readable task name |
| `slug` | Stable identifier used in all command arguments |
| `current-stage` | The stage most recently started |
| `stage-status` | `Complete`, `In Progress`, or `Awaiting input` |
| `updated-at` | Timestamp of last write |
| `selected-slice-or-focus` | Which slice is currently active |
| `open-questions` | Unanswered questions blocking progress |
| `recommended-next-stage` | Stage name |
| `recommended-next-command` | Command name |
| `recommended-next-invocation` | Full slash command ready to copy and run |
| `workflow-files` | List of all artifacts written so far |

---

## How to pass supplemental context to a command

Any text after the slug and optional slice is treated as supplemental context. Use it to direct the command's focus without re-running earlier stages.

```
/wf-plan dark-mode-toggle-settings slice-1 prefer CSS custom properties over JS state, must work with existing Tailwind setup
```

```
/wf-review dark-mode-toggle-settings slice-1 pay extra attention to SSR compatibility and hydration order
```

The supplemental context is not persisted — it applies only to this invocation.

---

## How to handle a stage that is not applicable

Some changes do not need every stage. For a documentation-only change, for example, you may not need `/wf-verify` or `/wf-review`.

Run the stage anyway but pass a brief note as supplemental context:

```
/wf-verify dark-mode-docs docs-only no code changed
```

The command will produce a minimal artifact noting the stage was acknowledged but not substantively applicable, which keeps the workflow trail complete and `00-index.md` accurate.

Alternatively, run the stages you do need and jump forward — each command reads whichever prior artifacts exist. A missing stage file is not an error; the command notes the gap and continues.

---

## How to run a freshness pass manually

Every command performs a freshness pass automatically when external knowledge could affect the output. If you want to force an explicit freshness pass — for example, before planning work that touches a rapidly evolving dependency — run the relevant stage with a freshness hint:

```
/wf-plan dark-mode-toggle-settings slice-1 run full freshness pass on CSS color-scheme property and prefers-color-scheme media query support
```

The freshness results are written into the stage file under `## Freshness Research` with source, relevance, and takeaway for each item checked.

---

## Artifact layout reference

All artifacts for a workflow live under a single directory:

```
.ai/workflows/<slug>/
├── 00-index.md          # Control file — current state, next command
├── 01-intake.md         # Intake brief, acceptance criteria, non-goals
├── 02-shape.md          # Mini-spec, edge cases, constraints
├── 03-slice.md          # Vertical slices, sequencing
├── 04-plan.md           # Repo-aware implementation plan
├── 05-implement.md      # Implementation record, diff summary
├── 06-verify.md         # Verification evidence, test results
├── 07-review.md         # Review verdict, blocking/should-fix/nice-to-have
├── 08-handoff.md        # PR-ready package, reviewer focus areas
├── 09-ship.md           # Release readiness, rollout and rollback plan
├── 10-retro.md          # Lessons, concrete improvement actions
├── 90-next.md           # Routing helper output (if wf-next was run)
└── po-answers.md        # Cumulative product-owner answers log
```

These files are plain markdown. Commit them alongside your code — they form a permanent, human-readable record of how and why a change was made.

---

## Command argument syntax

```
/wf-<stage> <slug> [slice-or-focus] [supplemental context...]
```

| Part | Required | Notes |
|---|---|---|
| `slug` | Yes (except intake) | Derived automatically by intake; stable thereafter |
| `slice-or-focus` | No | Required for plan/implement/verify once slices exist |
| `supplemental context` | No | Free text; applies to this invocation only |

**Intake only** takes a plain-language task description instead of a slug:

```
/wf-intake <plain-language task description>
```
