---
description: Compressed planning workflow for small intentional changes. Collapses intake, shape, design, slice, and plan into a single artifact in one pass. Routes to /wf-implement for the standard execute-verify-review-handoff-ship lifecycle. Use when the change is small enough that the full 5-stage planning ceremony is overkill but you still want a recorded plan, a branch, and the standard implementation/review pipeline.
argument-hint: <description-or-slug>
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-quick`, a **compressed planning workflow** for small intentional changes.

# Pipeline
`1·quick-plan` → `/wf-implement` → `/wf-verify` → `/wf-review` → `/wf-handoff` → `/wf-ship`

| | Detail |
|---|---|
| Requires | Nothing — starts fresh. Pass a description or an existing slug to resume. |
| Produces | `01-quick.md` (compressed brief + shape + plan) and `00-index.md` |
| Skips | Stage 2 (shape standalone), stage 2b (design), stage 3 (slice), stage 4 (plan standalone) — all merged into `01-quick.md`. Design is **never auto-included**; user must opt in by passing `--design`. |
| Next | `/wf-implement <slug>` (full lifecycle takes over from stage 5 onward) |
| Escalate | If during planning the work no longer fits the wf-quick envelope, **warn and continue** — record the breach in the artifact and recommend `/wf-quick intake <description>` for next time. Do not refuse. |

# CRITICAL — scope discipline
You are a **compressed-planning orchestrator**, not an incident responder and not a feature shaper.
- This command exists to skip ceremony, not to skip thinking. The output must still be a real plan.
- Ask at most **2 questions** in chat. No `AskUserQuestion`, no separate `po-answers.md` — answers go inline into the artifact.
- Do NOT auto-include design. If the change visibly touches UI and `--design` was not passed, surface a one-line note in the artifact's "Skipped" section recommending `/wf-design <slug>` as a follow-up. Do not block.
- Follow the steps below exactly in order. Do not skip, reorder, or combine steps. The compression happens *within* a step, not by removing steps.

# Step 0 — Orient (MANDATORY)
1. **Resolve slug and mode** from `$ARGUMENTS`:
   - If the argument matches an existing `.ai/workflows/*/00-index.md` with `workflow-type: quick` → **resume mode**. Read that index and `01-quick.md`. If `01-quick.md` is complete, the user likely meant to run `/wf-implement` — tell them and stop. If incomplete, pick up from the missing section.
   - Otherwise → **new wf-quick**. Derive a slug: `quick-<short-description>` (kebab-case, max 5 words, e.g., `quick-fix-checkout-button-spacing`).
2. **Collision check:** If `.ai/workflows/<slug>/00-index.md` already exists and `workflow-type` is NOT `quick` → WARN: "Workflow `<slug>` already exists with type `<existing-type>`. Choose a different description, or run `/wf-meta resume <slug>` to continue the existing workflow." Stop.
3. **Branch check:**
   - Default `branch-strategy: dedicated` with branch name `quick/<slug>`. Create the branch off the current base if it does not exist: `git checkout -b quick/<slug>`.
   - If the user explicitly passed `branch-strategy: none` or is mid-task on an existing branch they want to keep using → record `branch-strategy: none` in the index and do not switch branches.
4. **Read project context (lightweight):**
   - Read `.impeccable.md` if present (for design context — informs the warn-and-continue if UI is touched).
   - Read `README.md` (top 100 lines) for project shape.
   - Do NOT read the full codebase here. The Step 1 sub-agent does targeted exploration.

# Step 1 — Compressed planning (single pass, parallel research)
Write `01-quick.md` in **one pass** covering all five collapsed sections. Use parallel Explore sub-agents to gather what is needed before writing — do not write from memory.

### Parallel research (use sub-agents)
Launch sub-agents in parallel before writing the artifact. Do not spin up sub-agents if the change is a one-line fix in a file the user has explicitly named.

#### Explore sub-agent 1 — Codebase grounding

Prompt with ALL of the following:
- Identify the files most likely to be touched based on the user's description.
- For each candidate file, note: current shape (~5 lines of summary), nearby patterns the change should match, callers that may need updating.
- Run `git log --oneline -10` on the candidate files — flag if any have changed in the last 7 days (signal that the area is in flux and the change may need to coordinate with that work).
- Search for existing utilities or helpers that solve the same problem; flag any reuse opportunities.

Return as structured text:
- `files_in_scope`: list of paths
- `nearby_patterns`: 1-3 patterns to match
- `reuse_candidates`: list of `path:symbol — what it does`
- `recent_churn`: list of files touched in last 7 days (or empty)

#### Explore sub-agent 2 — Web freshness (skip if pure internal change)

Skip this sub-agent if the change is purely internal (no new external dependency, no API integration, no platform/browser API usage, no security surface). Otherwise:

Prompt with ALL of the following:
- Search for the relevant library/API documentation for the latest stable version syntax.
- Look for known gotchas, deprecation notices, or breaking changes in the last 12 months for the affected API surface.
- Return: 2-3 source URLs, 1-line takeaway each, and a **go/no-go** signal on whether the planned approach is current.

# Step 2 — Write `01-quick.md`

After both sub-agents return (or sub-agent 1 only, if 2 was skipped), merge findings and write the artifact in one pass.

**`01-quick.md` frontmatter:**
```yaml
---
schema: sdlc/v1
type: quick-plan
slug: <slug>
workflow-type: quick
intent: <one-line description>
files-in-scope: [<list>]
estimated-steps: <number, must be ≤ 5>
status: ready-for-implement
created-at: <run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get the real timestamp>
---
```

**Body sections (in order, each tight):**

## 1. Brief (replaces intake)

One paragraph: what the user wants and why. ≤3 acceptance criteria as a bulleted list — each must be objectively verifiable. If you needed to ask the user up to 2 questions to nail this down, embed the answers here as italicized inline notes; do not write a separate `po-answers.md`.

## 2. Shape (replaces shape)

- **In scope:** 1-3 bullets of what this change includes.
- **Out of scope:** 1-3 bullets of what this change explicitly does NOT include.
- **Known unknowns:** 0-2 bullets — flag anything you are guessing about.

## 3. Design (skipped by default)

If `--design` was passed, include 3-5 bullets of design notes (visual hierarchy, copy, interaction). Otherwise write exactly:

> Design step skipped. If the change touches UI surface, run `/wf-design <slug>` after `/wf-implement` completes — or restart with `/wf-quick intake <description>` for a full design pass before implementation.

If you observe that the change *does* touch UI surface (HTML/CSS/JSX/SwiftUI/Compose components, copy strings, layout files) but `--design` was not passed → still skip design, but add a one-line "**UI touched — design skipped:** consider `/wf-design <slug>` follow-up" warning to the "Skipped" section. Do not block.

## 4. Slice (skipped by definition)

Write exactly:

> Single-slice workflow. No slicing needed.

## 5. Plan (replaces plan)

A numbered list of **at most 5 implementation steps**, each step:
- Names the file(s) it touches.
- States the change in 1-2 lines.
- Lists verification — how do we know this step is correct (lint? test? manual check? screenshot?).

Then a **Verification section** at the bottom:
- **Tests to run:** specific commands.
- **Manual checks:** specific URLs, flows, or visual checks.

## 6. Skipped (always present)

A short list of what was deliberately not done in this compressed flow:
- "Design step skipped" (always — design is never auto-included).
- "Slicing skipped" (always — single slice).
- "Separate `po-answers.md` skipped" (always — answers inlined above).
- Plus any per-run notes (e.g., "UI touched — design follow-up recommended", "web freshness check skipped — pure internal change", or a tripwire breach note).

## 7. Tripwire breaches (only if any fired)

A "wf-quick envelope" section listing any tripwires that fired during planning. Tripwires are **warn-and-continue** — do NOT refuse to write the plan. Just record the breach so the user has the data to decide whether to keep going or restart with `/wf-quick intake`. Tripwires:

- **>3 files touched** in the planned changes.
- **>5 implementation steps** required.
- **New external dependency** introduced.
- **Architectural change** — new module, schema migration, public API surface, or cross-cutting behavior change (auth, logging, error handling).
- **>2 open questions** the user could not answer in chat.

For each tripwire that fired, write one line: `[tripwire-name]: <what specifically tripped it>`. Then add a single closing line:

> One or more wf-quick tripwires fired. The plan is still valid, but the work has grown beyond the wf-quick envelope. Consider restarting with `/wf-quick intake <description>` for a full workflow next time. Run `/wf-implement <slug>` to proceed with the current plan.

# Step 3 — Write `00-index.md`

Standard index file, with:

```yaml
---
schema: sdlc/v1
type: workflow-index
slug: <slug>
workflow-type: quick
current-stage: implement
status: ready
selected-slice: <slug>
branch-strategy: <dedicated|none>
branch: <branch-name-or-empty>
base-branch: <base-branch>
next-command: /wf-implement
next-invocation: /wf-implement <slug>
open-questions: []
progress:
  - quick-plan: complete
created-at: <timestamp>
---
```

Body: one-line description of the workflow + a short pointer to `01-quick.md`.

# Step 4 — Hand off to user

Emit a compact chat summary, no more than 8 lines:

```
wf-quick complete: <slug>
Branch: <branch-name or "current branch">
Files in scope: <comma-separated list, max 3 — say "+N more" if longer>
Steps: <N> implementation steps planned
Tripwires: <none | comma-separated list of tripwire names>
Skipped: design (always), slicing (always)<, web freshness if applicable>
Next: /wf-implement <slug>
Restart bigger: /wf-quick intake <description>
```

If any tripwire fired, prefix the summary with one extra line:

> ⚠ Plan is valid but exceeds wf-quick envelope. Consider /wf-quick intake for the next change like this.

# Compact and crash-safe behavior

- Write `01-quick.md` and `00-index.md` atomically (write to a temp path within the run, then rename) so a crash mid-write does not leave a half-written workflow.
- If the run is interrupted before `01-quick.md` exists, resume mode (Step 0) treats this as a fresh start — there is nothing to resume from.
- If the run is interrupted after `01-quick.md` exists but before `00-index.md`, resume mode reads `01-quick.md` and writes `00-index.md` as the only remaining work.

# What this command is NOT

- **Not a hotfix** — `wf-hotfix` exists for production incidents (forces production-branch base, requires diagnosis sub-agents, has tighter scope locks). Use `wf-hotfix` if there is an active incident.
- **Not a refactor workflow** — `wf-refactor` exists for behavior-preserving refactoring with test baselines. Use `wf-refactor` if the change is "make the code better without changing what it does."
- **Not a way to skip review** — `/wf-implement` still routes through `/wf-verify` and `/wf-review`. The compression is in *planning*, not in *quality gates*.
