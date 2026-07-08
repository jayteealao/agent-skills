---
description: Extract reusable lessons and turn them into concrete improvements to prompts, hooks, repo instructions, tests, and automation.
argument-hint: <slug>
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `$wf retro`, **stage 10 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → `10·retro`

| | Detail |
|---|---|
| Requires | `09-ship.md` (strongly recommended), plus as many prior stage files as exist |
| Conditional inputs (mandatory when present) | All design artifacts (`02b-design.md`, `02c-craft.md`, `design-notes/*`, `07-design-audit.md`, `07-design-critique.md`) — every artifact that exists on disk MUST be reflected in the retro. Design decisions and augmentation outcomes are first-class retro inputs, not optional commentary. |
| Produces | `10-retro.md` |
| Next | Workflow complete. No further stages. |

> **Optional second opinion.** At the synthesis step (after the analysis sub-agents
> return), you may offer `$consult <what systemic patterns span this workflow's
> friction?>` (or `$consult <provider> …`) — a read-only multi-model panel that
> spots cross-stage patterns the per-domain sub-agents miss. Model may self-run when clearly valuable (pin `codex`/`claude`); otherwise just offer it.

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT apply the improvements you suggest — only document them.
- Do NOT reopen implementation or start new work.
- Your job is to **extract lessons and propose concrete, copy-paste-ready improvements**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start editing repo files or applying fixes, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - At minimum, `05-implement.md` should exist (there must be something to retro on). If nothing exists beyond intake → STOP. Tell the user: "Not enough completed work to retrospect. Run more stages first."
   - `09-ship.md` is strongly recommended but not blocking — a retro can run after a cancelled or abandoned effort.
   - If `current-stage` in the index shows the workflow is already complete → WARN: "This workflow has already been retrospected. Running retro again will overwrite `10-retro.md`. Proceed?"
4. **Read the full workflow trail** — every stage file that exists, plus `po-answers.md`. This includes design artifacts: `02b-design.md`, `02c-craft.md`, `design-notes/*`, `07-design-audit.md`, `07-design-critique.md`. Retro should reflect on design decisions (was the chosen color strategy right? did the mock fidelity inventory hold?) and augmentation outcomes (did `harden` catch real issues? did `optimize` deliver measurable gains?), not just engineering ones.
5. **Carry forward** `open-questions` from the index.

# Parallel analysis
When the workflow trail is large or spans multiple domains, launch parallel sub-agents. Do not spin up sub-agents for simple, single-slice workflows.

### Analysis sub-agent 1 — Implementation & Verification Friction

Prompt the agent with ALL of the following:

**Plan-to-implementation drift:**
- Compare `04-plan-<slice>.md` → `## Step-by-Step Plan` with `05-implement-<slice>.md` → `## Deviations from Plan`
- Count: steps that went as planned, steps that required adaptation, steps that were skipped, steps that were added
- For each deviation: was it caused by stale plan assumptions, insufficient exploration, scope creep, or legitimate discovery?

**Verification effectiveness:**
- Read `06-verify-<slice>.md`. Count: checks run, checks passed, checks failed, acceptance criteria met vs. not met
- Were there test failures that pointed to real bugs vs. flaky tests vs. test environment issues?
- Did verification catch issues that should have been caught earlier (during planning or implementation)?
- Were there acceptance criteria that couldn't be verified? Why?

**Time & iteration analysis:**
- Check git log for the implementation commits. How many commits? Were there fix-up commits that suggest rework?
- Were there cycles back to earlier stages (re-plan, re-implement)? What triggered them?

**Deferred-debt harvest (this workflow only):**
- Collect every intentional-simplification marker this workflow introduced: grep the workflow's commits for `sdlc-debt:` (`git log -p <base-branch>..HEAD | grep -nE 'sdlc-debt:'`) and read each slice's `05-implement-<slice>.md` → `## Anything Deferred` / `## Known Risks / Caveats`.
- For each marker, record: file:line, the ceiling, the upgrade path, and where it was recorded. **Scope to THIS workflow's debt — do NOT grep the whole repo** (that is `$wf simplify codebase`'s sweep). Retro reconciles only what this workflow deliberately deferred, so already-tracked debt from prior workflows is not re-surfaced.
- Classify each as **act-now** (worth its own follow-up workflow this sprint) or **accept** (a deliberate, acceptable ceiling that just needs to stay visible). The act-now items drive `## Deferred Debt` and Option B routing below.

### Analysis sub-agent 2 — Review & Handoff Quality

Prompt the agent with ALL of the following:

**Review findings analysis:**
- Search / list files in the repository for every `07-review-*.md` file in the workflow directory — there is one master review per slice plus per-command sub-reviews (e.g., `07-review-<slice-slug>-<command>.md`). Aggregate findings across all slices.
- Classify findings: how many were real bugs vs. style nits vs. false positives? Findings carry a `status` (open/resolved/fixed/could-not-fix/dismissed) and a `surfaced-at` stamp — note how many were `resolved` across re-runs vs. still `open` at handoff, and how many passes the frontmatter `runs:` ledger shows the review took.
- Were BLOCKER/HIGH findings things that should have been caught by tests, linting, or planning?
- Did the review miss anything that was later found in ship or production?

**Handoff completeness:**
- Read `08-handoff.md`. Was the PR description clear enough for an external reviewer?
- Were migration notes, config changes, and rollback instructions accurate?
- Did the documentation plan from `02-shape.md` get fulfilled? Check if promised docs were actually written.

**Communication gaps:**
- Read `po-answers.md`. Were there questions that took multiple rounds to resolve?
- Were there assumptions made without asking that later turned out wrong?
- Did any stage produce artifacts that the next stage couldn't use directly?

### Explore sub-agent 3 — Repo Infrastructure Improvement Opportunities

Prompt the agent with ALL of the following:

**AGENTS.md / CLAUDE.md gaps:**
- Read `AGENTS.md` and `CLAUDE.md` (if they exist). Based on the workflow experience, identify:
  - Conventions the team follows that aren't documented
  - Patterns that were discovered during exploration that should be codified
  - Common mistakes or anti-patterns that should be warned against

**Hook & automation opportunities:**
- Read `.ai/reviews/settings.json` and any `hooks/hooks.json` files
- Based on review findings and verification failures, are there checks that should be automated as hooks?
- Were there repetitive manual steps that could be automated (PreToolUse validation, PostToolUse feedback, Stop completeness checks)?

**Test & CI gaps:**
- Based on verification results, are there test categories that are missing (integration tests, E2E, contract tests)?
- Were there CI checks that would have caught issues earlier?
- Are there test helpers or fixtures that should be created to make future testing easier?

Merge all sub-agent findings and deduplicate. Write into `## What Went Well`, `## Friction / Failure Points`, `## Root Causes`, `## Recommended Improvements`, and `## Deferred Debt`.

**Distill durable learnings (0–3) into the solutions corpus.** After the merge, distill
pattern-level learnings from the merged findings. Each must pass ALL THREE durability criteria:

1. **Recurs** — would plausibly bite a *future* workflow, not just this one.
2. **Non-obvious** — not derivable from the repo, AGENTS.md, or the stage references.
3. **Actionable** — a future plan/implement run could change a decision because of it.

Zero learnings is a legitimate outcome; do not pad. A **repeated runtime-evidence deferral** is a
prime candidate ("<wall> blocks all interactive ACs; the one-time harness that retires it = …",
category `testing` or `gotcha`) — plan's learnings scan is what stops the next slug from re-paying
that wall.

**Dedupe before write:** read `.ai/solutions/INDEX.md` (if it exists) and check for overlapping
tags/titles. On overlap, UPDATE the existing file — refresh the evidence, extend
`source-workflow` to a list — rather than writing a near-duplicate (the review ledger's
dedupe-on-merge discipline). Otherwise write each learning to
`.ai/solutions/<category>/<learning-slug>.md`. Categories are a small closed set —
`architecture`, `testing`, `build-tooling`, `process`, `domain`, `gotcha`, plus `misc` (recurring
`misc` overflow is the signal to revisit the set). Frontmatter (schema type `solution`):

```yaml
---
schema: sdlc/v1
type: solution
category: <one of the closed set>
source-workflow: <slug>            # or [<slug>, ...] once later workflows refresh it
created-at: "<iso-8601>"
tags: [<free keywords for the consumer grep>]
status: active
---
```

Body: **Problem / Learning / How to apply** — three short sections, ≤ ~30 lines (a learning that
needs more is probably a workflow, not a note). Append one line per new learning to
`.ai/solutions/INDEX.md` (`- [title](<category>/<file>.md) — <hook>`; create the index with a
`# Solutions` heading if missing — producers append, consumers read the index first and load only
matching files). Stamp `learnings-written: [<paths>]` in the retro frontmatter (empty list
allowed). Writing these files IS part of retro's output contract — it is not "applying
improvements" (Option D's scope stays repo instruction/hook/CI edits, which retro still never
applies).

# Purpose
Extract reusable lessons and turn them into concrete improvements to prompts, hooks, repo instructions, tests, and automation.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, get the current UTC time per [_timestamp.md](_timestamp.md). Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Ask the user directly in chat** for multiple-choice PO questions (structured decisions, confirmations), presenting options as a short numbered list. Use freeform chat for open-ended questions. Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.
- **Conditional inputs are mandatory when present.** If a file in this command's *Conditional inputs* row exists on disk, read it and honor it in the output — existence is optional, consumption is required; silent omission is a contract violation.

# Chat return contract
After writing files, return per [_chat-return.md](_chat-return.md) — narrative lead in the artifact's `## The Retro` story voice, then this receipt:
- `slug: <slug>`
- `wrote: <path>`
- `next: workflow complete` (or options if follow-up is warranted)
- ≤3 short blocker bullets if needed

Do this in order:
1. Identify what worked, what caused friction, and what should be codified.
2. Suggest concrete updates for `AGENTS.md`, `CLAUDE.md`, hooks, test coverage, CI checks, and skill prompts.
3. Prioritize by impact and effort.
4. Distill 0–3 durable learnings into `.ai/solutions/` + its INDEX.md (see the distillation step in *Parallel analysis*) and stamp `learnings-written:`.
5. **Evaluate adaptive routing** (see below) and write options into `## Recommended Next Stage`.
6. Mark the workflow as complete in `00-index.md` unless follow-up work is being opened.
7. Write `.ai/workflows/<slug>/10-retro.md`.

# Adaptive routing — evaluate what's actually next
After completing the retro, evaluate whether the workflow is truly done:

**Option A (default): Complete** → workflow finished
Use when: All slices are shipped, no follow-up work is warranted.

**Option B: Open follow-up workflow** → `$wf intake <new-task-description>`
Use when: The retro identified follow-up work significant enough to warrant its own workflow (e.g., "we deferred X and it should be done next sprint"), OR the `## Deferred Debt` harvest surfaced any `act-now` items — route each to `$wf intake fix` (one-file ceiling) or `$wf intake refactor` (cross-file) so the deliberate shortcut becomes tracked work instead of a buried comment.

**Option C: Next slice** → `$wf plan <slug> <next-slice>` or `$wf implement <slug> <next-slice>`
Use when: The retro is running mid-workflow (e.g., after shipping one slice) and there are more slices.

**Option D: Apply retro improvements** → suggest specific file edits
Use when: The retro identified quick-win improvements to repo instructions, hooks, or CI that the user might want to apply now. List them as actionable suggestions but do NOT apply them. Durable learnings are already written to `.ai/solutions/` by the distillation step — Option D's remaining scope is repo instruction/hook/CI edits only.

Write ALL viable options into `## Recommended Next Stage` so the user can choose.

Write `10-retro.md` with this structure:

```yaml
---
schema: sdlc/v1
type: retro
slug: <slug>
status: complete
stage-number: 10
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
workflow-outcome: <completed|abandoned|partial>
learnings-written: []              # paths of .ai/solutions/ files this retro wrote/updated (empty list allowed)
metric-improvement-count: <N>
metric-stages-completed: <N>
metric-stages-skipped: <N>
tags: []
refs:
  index: 00-index.md
next-command: ""
next-invocation: ""
---
```

# Retro

## The Retro
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Voice per `_narrative-voice.md` — no "This retro implements…" openings. 1–4 short paragraphs. -->

## What Went Well
- ...

## Friction / Failure Points
- ...

## Root Causes
- ...

## Recommended Improvements
- priority: improvement

## Suggested Repo Instruction Updates
```md
<copy-paste-ready additions or edits for AGENTS.md / CLAUDE.md>
```

## Suggested Automation / Hook Opportunities
- ...

## Suggested Test / CI Improvements
- ...

## Keep / Change / Drop
Keep:
- ...
Change:
- ...
Drop:
- ...

## Deferred Debt
<!-- From the deferred-debt harvest (Analysis sub-agent 1). One row per `sdlc-debt:` marker THIS workflow introduced; scoped to this workflow, not the whole repo.
| Marker (file:line) | Ceiling | Upgrade path | Recorded in | Disposition |
|---|---|---|---|---|
| `src/auth.ts:42` | global lock serializes all tenants | per-tenant lock keys | 05-implement-auth.md ## Known Risks | act-now → $wf intake refactor "per-tenant auth locks" |
Disposition is `act-now` (routes to a follow-up workflow via Option B below) or `accept` (a deliberate ceiling that stays visible but needs no action now).
If the workflow introduced no shortcuts: "No deferred debt — no `sdlc-debt:` markers introduced." -->

## Learnings Written
<!-- One line per learning distilled into .ai/solutions/ (path + its index hook), or:
"None — no finding passed the durability filter." Match the frontmatter learnings-written list. -->

## Recommended Next Stage
- **Option A (default):** Workflow complete
- **Option B:** `$wf intake <follow-up>` — [reason, if applicable]
- **Option C:** `$wf plan <slug> <next-slice>` — next slice [reason, if applicable]
- **Option D:** Apply improvements — [list quick wins, if applicable]

---

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

---

## Additive-write contract (v9.20.2+)

`10-retro.md` is usually one-shot (a retro runs once at workflow close), but
it IS revisable — extended retrospectives sometimes add a follow-up "30-day
check" or "quarterly look-back" section. When `$wf retro` is re-invoked on a
slug that already has one, follow the shared additive-write contract in
[_additive-write.md](_additive-write.md) with:

- Snapshot: `.ai/workflows/<slug>/history/10-retro-<rev>.md`.
- **Rewrite the body** so the retro reads as current truth — fold the revisit's
  findings into the relevant sections rather than appending a `## Revision N`
  block. The `## The Retrospective` story section carries the arc (what we said
  at close vs. what actually happened 30 days later).
- **Ledger entry**: append one `revisions:` entry with `trigger: manual` (or
  `scope-change` for an incident-driven revisit), `because:` naming the revisit
  ("30-day check-in", "post-incident follow-up", "quarterly review"), and
  `changed:` naming what moved.

A retro's value is largely *historical* — the point of the revisit is to compare
original intent against later reality. That comparison lives in the story
section and in the verbatim history snapshots, not in a stack of body sections.
