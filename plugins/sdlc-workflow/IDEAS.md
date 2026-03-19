# SDLC-Workflow — Ideas & Roadmap

High-value commands, tools, and hooks to make the workflow indispensable.

---

## Original 5

### 1. `wf-status`
**Type:** Command (meta / read-only)
**Value:** Dashboard across all active workflows. Reads every `.ai/workflows/*/00-index.md` and renders a single view: slug, current stage, stage status, last updated, next recommended command. Zero side effects — run it any time to reorient.
**Why indispensable:** Without it, you have to remember which workflows exist and grep around. With it, picking up after a context gap takes 2 seconds.

### 2. `wf-resume`
**Type:** Command
**Value:** Finds the most recently active workflow (or lets you pick from a list), reads all its files, summarises where you are, surfaces open questions, and drops the exact next command invocation into chat ready to run.
**Why indispensable:** Context gaps are the #1 workflow killer. This closes them instantly without a manual file trawl.

### 3. `wf-skip`
**Type:** Command
**Value:** Marks a stage as deliberately skipped with a required reason, updates `00-index.md`, and recommends the next command. Prevents workflows getting stranded when a stage is genuinely not applicable (e.g. skipping `wf-verify` on a docs-only change).
**Why indispensable:** Without a sanctioned skip path, people abandon the workflow entirely or fake a stage. A first-class skip keeps the audit trail clean.

### 4. `wf-amend`
**Type:** Command
**Value:** Re-opens a completed stage, appends a diff-style amendment block, and marks it `Amended` without destroying the original content. Updates `00-index.md`. Useful when new information invalidates a planning or shaping decision mid-flight.
**Why indispensable:** Real work is non-linear. Without amend, you either re-run the whole stage (wasteful) or silently let stale artifacts mislead later stages.

### 5. Retro auto-apply hook (`PostToolUse: wf-retro`)
**Type:** Hook
**Value:** After every `wf-retro` completes, parses the retro's "Process improvements" section and opens a PR / creates tasks for each actionable item, rather than leaving them to rot in a markdown file.
**Why indispensable:** Retrospectives are only valuable if their outputs get actioned. This closes the loop automatically.

---

## New 10

### 6. `wf-context`
**Type:** Command
**Value:** Generates a dense, token-efficient context brief for a workflow — all key decisions, constraints, open questions, and current state compressed into ~500 words. Designed to be pasted into a new session or handed to a subagent that needs onboarding.
**Why high value:** The workflow files are thorough but verbose. When spawning a parallel agent or resuming in a new context window, you need a tight brief, not 10 markdown files.

### 7. `wf-branch`
**Type:** Command
**Value:** Takes the current workflow and forks a speculative variant — same slug, new suffix (e.g. `my-feature--alt-1`). Copies all files to the new slug, marks it `Speculative`, and lets you explore an alternative approach without polluting the main workflow. `wf-status` shows both.
**Why high value:** Spike-and-compare is a legitimate engineering practice. Without first-class branching, people either abandon the original or work in their head.

### 8. `wf-checklist`
**Type:** Command
**Value:** Reads the current stage and generates a concise, actionable checklist of everything that must be true before the stage is complete — derived from the stage file's open questions, acceptance criteria, and recommended next actions. Outputs as a `TodoWrite` list.
**Why high value:** Bridges the gap between the rich narrative in stage files and the tactical "what do I do right now" question. Especially useful at `wf-implement` and `wf-verify`.

### 9. `wf-risk`
**Type:** Command
**Value:** Dedicated risk analysis command. Reads all stages completed so far and produces a structured risk register: id, description, likelihood, impact, mitigation, owner, status. Writes to `.ai/workflows/<slug>/risk-register.md`. Can be run at any point — most valuable between shape and plan.
**Why high value:** Risk surfaces in nearly every stage but is never the primary focus of any one stage. A dedicated command forces the synthesis that ad-hoc notes never achieve.

### 10. `wf-diff`
**Type:** Command
**Value:** Compares two stages (or two runs of the same stage) for a workflow and surfaces what changed: new decisions, reversed decisions, scope changes, risk changes. Output is a structured diff, not a raw file diff.
**Why high value:** When a workflow spans days or weeks, understanding what changed between the plan you made on Monday and the one you're executing on Friday is non-trivial. `wf-diff plan shape` is immediately legible.

### 11. `wf-validate` hook (`PreToolUse: Write`)
**Type:** Hook
**Value:** Before any Write to a `.ai/workflows/` file, validates that: the slug is stable, `00-index.md` will be updated in the same operation, the required fields are all present, and the stage file follows the prescribed structure. Blocks the write and returns a structured error if not.
**Why high value:** Workflow integrity degrades silently without enforcement. A pre-write hook catches structural drift at the moment it happens, not retrospectively.

### 12. `wf-sync`
**Type:** Command
**Value:** Reconciles workflow state with reality — checks whether the code, tests, and PRs that the workflow references actually exist, whether referenced tickets are still open, and whether any external dependencies have changed since the last freshness pass. Writes a sync report to `00-sync.md`.
**Why high value:** Long-running workflows go stale. Decisions made in `wf-shape` can be invalidated by a library release or a teammate's merged PR. `wf-sync` surfaces drift before it causes rework.

### 13. `wf-estimate`
**Type:** Command
**Value:** Reads `03-slice.md` and `04-plan.md` and produces a structured effort estimate: task breakdown, complexity signals, dependency graph, confidence level, and a range (optimistic / realistic / pessimistic) with explicit assumptions. Writes to `.ai/workflows/<slug>/estimate.md`.
**Why high value:** Estimates are routinely done informally or not at all. A command that derives estimates directly from the artefacts that informed the plan produces more honest numbers and makes assumptions visible.

### 14. `wf-announce`
**Type:** Command
**Value:** Generates a stakeholder-facing announcement for a completed or shipped workflow — plain language, no jargon, focused on what changed and why it matters. Tailored by audience (eng, product, users). Pulls from `08-handoff.md` and `09-ship.md`. Outputs announcement copy to `.ai/workflows/<slug>/announce.md`.
**Why high value:** The gap between "shipped" and "communicated" is where value gets lost. `wf-announce` closes it without requiring the engineer to context-switch into comms writing.

### 15. `wf-rollback`
**Type:** Command
**Value:** Guides rollback planning for a workflow that has shipped but needs reverting. Reads `09-ship.md` for the deployment record, generates a structured rollback runbook (steps, verification, comms, post-rollback checks), and writes to `.ai/workflows/<slug>/10-rollback.md`.
**Why high value:** Rollback plans written *before* an incident are dramatically better than those written *during* one. This forces the plan to exist while context is fresh, immediately after ship.

---

## Summary Table

| # | Name | Type | Stage affinity |
|---|------|------|---------------|
| 1 | `wf-status` | Command (read-only) | Any |
| 2 | `wf-resume` | Command | Any |
| 3 | `wf-skip` | Command | Any |
| 4 | `wf-amend` | Command | Any |
| 5 | Retro auto-apply | Hook (PostToolUse) | retro |
| 6 | `wf-context` | Command | Any |
| 7 | `wf-branch` | Command | Any |
| 8 | `wf-checklist` | Command | implement, verify |
| 9 | `wf-risk` | Command | shape → plan |
| 10 | `wf-diff` | Command | Any |
| 11 | `wf-validate` | Hook (PreToolUse) | Any write |
| 12 | `wf-sync` | Command | Any |
| 13 | `wf-estimate` | Command | slice, plan |
| 14 | `wf-announce` | Command | post-ship |
| 15 | `wf-rollback` | Command | post-ship |
