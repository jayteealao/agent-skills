---
description: Extract reusable lessons and turn them into concrete improvements to prompts, hooks, repo instructions, tests, and automation. A `pr#N` or branch-name first argument retrospects EVERY slug on that branch (batch mode), one 10-retro.md each, and synthesizes the cross-slug lessons that span the whole branch.
argument-hint: <slug|pr#N|branch>
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf retro`, **stage 10 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → `10·retro`

| | Detail |
|---|---|
| Requires | `09-ship.md` (strongly recommended), plus as many prior stage files as exist |
| Conditional inputs (mandatory when present) | All design artifacts (`02b-design.md`, `02c-craft.md`, `design-notes/*`, `07-design-audit.md`, `07-design-critique.md`) — every artifact that exists on disk must be reflected in the retro. Design decisions and augmentation outcomes are first-class retro inputs, not optional commentary. |
| Produces | `10-retro.md` |
| Next | Workflow complete. No further stages. |

> **Auto second opinion (objective triggers).** At the synthesis step (after the analysis
> sub-agents return), **auto-invoke** `/consult codex <what systemic patterns span this workflow's
> friction?>` (pinning `codex`/`claude` keeps it free) when ANY of: (a) the workflow carried a
> hotfix, rollback, or production incident; (b) any finding implicates the workflow tooling itself
> (plugin-feedback entries exist); (c) the same friction class recurs across 2+ stages. Skip only when none of the
> triggers hold.

# Role
You are a **workflow orchestrator**, not a problem solver.
- Do not apply the improvements you suggest — only document them.
- Do not reopen implementation or start new work.
- Your job is to **extract lessons and propose concrete, copy-paste-ready improvements**.
- If you catch yourself about to start editing repo files or applying fixes, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (do this before all other steps)
1. **Resolve the first argument — it is polymorphic** (`slug` | `pr#N`/`#N`/bare int | branch name), first match wins so a slug is never mistaken for a branch:
   - **Exact slug**: `.ai/workflows/<arg>/00-index.md` exists → **single-slug retro** (`retro-scope: slug`). The classic path — continue with items 2–5 for that one slug.
   - **PR reference** `pr#N` / `#N` / bare integer → resolve the branch via `gh pr view <N> --json headRefName -q .headRefName`, then the branch path below.
   - **Branch name**: matches a `branch:` recorded in some `00-index.md` / `.ai/workflows/INDEX.md` (or an existing git branch) → **batch retro** (`retro-scope: branch`) — see `## Batch retro` below, then return here per-slug.
   - **Absent**: infer the most recent active workflow from `.ai/workflows/*/00-index.md` → single-slug. If ambiguous, ask the user.
   - **`deep` token** (anywhere in the arguments, alongside the slug) → set `deep-retro: true` and run the deep-retro pass in *Deep retro* below. **Opt-in, never default** — omit the token and retro runs from artifacts alone. The deep pass's richest source (session transcripts) exists only under a host that keeps them; elsewhere `deep` falls back to an artifact-only deep pass (see *Deep retro*).
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - At minimum, `05-implement.md` should exist (there must be something to retro on). If nothing exists beyond intake → STOP. Tell the user: "Not enough completed work to retrospect. Run more stages first."
   - `09-ship.md` is strongly recommended but not blocking — a retro can run after a cancelled or abandoned effort.
   - If `current-stage` in the index shows the workflow is already complete → note the re-run in chat and proceed. [_additive-write.md](_additive-write.md) snapshots the prior revision and appends the `revisions:` ledger; no permission question is needed.
4. **Read the full workflow trail** — every stage file that exists, plus `po-answers.md`. This includes design artifacts: `02b-design.md`, `02c-craft.md`, `design-notes/*`, `07-design-audit.md`, `07-design-critique.md`. Retro reflects on design decisions and augmentation outcomes, not only engineering ones.
5. **Carry forward** `open-questions` from the index.

# Batch retro (`pr#N` / branch)

Runs when Step 0 resolved a branch: the slugs that shipped together on one branch are retrospected together.

1. **Build the roster.** Scan every `.ai/workflows/*/00-index.md`; the roster is every slug whose `branch:` equals the resolved branch. If none → STOP: *"No workflows are on branch `<branch>`. Run `/wf status` to list workflows."* Record the roster as `branch-slugs:`.
2. **Per-slug retro.** For each roster slug, run the full single-slug procedure — Step 0 items 2–5 (orient + prereq check + read the trail), the parallel analysis, and the write of `10-retro.md` — with `retro-scope: branch`, `branch:`, and `branch-slugs:` added to that slug's retro frontmatter. **Prerequisite skip, don't abort:** a slug with nothing beyond intake (no `05-implement*.md`) is marked "nothing to retro" in the roster and skipped. Mark each retrospected slug complete in its `00-index.md`.
3. **Synthesize cross-slug lessons — the value batch retro adds.** After the per-slug retros, look across the whole branch for patterns no single-slug retro can see: friction that recurred across slugs, a root cause shared by multiple slugs, a plan assumption that broke the same way twice, sequencing pain between slugs. Distill these into `.ai/solutions/` under the **same durability filter and dedupe-on-merge discipline** as the single-slug distillation step (see *Parallel analysis*), setting `source-workflow` to the list of contributing roster slugs. Zero cross-slug learnings is a legitimate outcome; do not pad.
4. **Return in chat** per the *Chat return contract* — a combined branch-level retro narrative (what went well / what hurt across the whole branch, the cross-slug root causes, the top improvements) first, then a per-slug roster of outcomes (slug · retrospected / skipped · learnings written).

# Deep retro (`deep` token — opt-in)

Runs only when Step 0 set `deep-retro: true`. The deep pass mines the repo's session transcripts for the
decision moments the stage files did not record and feeds that evidence into the analysis sub-agents below.

- **Transcript mining is host-gated.** Session transcripts exist only under a host that keeps a
  per-repo transcript directory (see [_host-invocation.md](_host-invocation.md)); when this host has
  one, scan the slug's transcripts. Otherwise a `deep` run is still honored but **falls back to an
  artifact-only deep pass**: a deeper, more adversarial re-read of the existing stage trail,
  `po-answers.md`, and the git history for the same decision moments. The retro then notes that
  transcript mining was skipped (host-gated). It never instructs a read of a transcript path this host lacks.
- **Opt-in, never default.** Only the explicit `deep` token turns it on.
- **What the deep pass looks for.** **Decision moments** — points where an approach was chosen, an
  assumption locked in, or a user instruction interpreted (especially "mirror/match exactly", "just like
  X", silent narrowings). Extract the moment, what was decided, and whether the artifacts recorded it.
  Un-recorded decisions are prime `## Root Causes` and durable-learning input. Without transcripts the
  evidence comes from the artifact trail + git history.
- Fold the findings into the parallel analysis (intent-drift especially) — the deep pass supplies
  evidence, the analysis sub-agents and distillation still own the write.

# Parallel analysis
When the workflow trail is large or spans multiple domains, launch parallel sub-agents. Do not spin up sub-agents for simple, single-slice workflows.

### Analysis sub-agent 1 — Implementation & Verification Friction

Charter: read the plan, implement, and verify artifacts plus the git log, and report where the build fought its plan — plan-to-implementation drift with a cause per deviation (stale assumption, thin exploration, scope creep, or legitimate discovery), verification effectiveness (what the checks caught, what should have been caught earlier, what could not be verified and why), and rework signals in the commit history. Every count names the artifact or tool result it came from. The harvest below is CONTRACT — pass it unchanged:

**Deferred-debt harvest (this workflow only):**
- Collect every intentional-simplification marker this workflow introduced: grep the workflow's commits for `sdlc-debt:` (`git log -p <base-branch>..HEAD | grep -nE 'sdlc-debt:'`) and read each slice's `05-implement-<slice>.md` → `## Anything Deferred` / `## Known Risks / Caveats`.
- For each marker, record: file:line, the ceiling, the upgrade path, and where it was recorded. **Scope to THIS workflow's debt — do NOT grep the whole repo** (that is `/wf simplify codebase`'s sweep).
- Classify each as **act-now** (worth its own follow-up workflow this sprint) or **accept** (a deliberate, acceptable ceiling that just needs to stay visible). The act-now items drive `## Deferred Debt` and Option B routing below.

### Analysis sub-agent 2 — Review & Handoff Quality

Charter: read every `07-review-*.md` (master per slice plus per-command sub-reviews), `08-handoff.md`, `po-answers.md`, and `02-shape.md`, and report — findings quality (real bugs vs. nits vs. false positives, what stayed `open` at handoff, what tests or planning should have caught, what review missed that ship or production later found); handoff completeness (PR clarity, migration/rollback accuracy, whether the shape's documentation plan was fulfilled); communication friction (multi-round questions, wrong unasked assumptions, artifacts the next stage could not use); and adoption-matrix `USE` rows that never earned their install. Every count names the artifact it came from. The block below is CONTRACT — pass it unchanged:

**Intent drift (transitive fidelity — code vs. intake):**
- Which intake directives did the shipped code **narrow**, and was each narrowing **ratified**? Cross-reference `02-shape.md`'s `## Intake Fidelity` table and any `07-review-*intent-fidelity*.md` findings against what actually shipped.
- Which **RIMs** (the `00-index.md` `intent-risks` ledger) turned out **mis-adjudicated** — the shape-time decision looked right but the shipped behaviour proved it wrong?
- Which **limitation-claims** (the "known limitation — document at handoff" deferrals) were later **disproven** — the wall cleared on its own, or was never really a wall?

### research sub-agent 3 — Repo Infrastructure Improvement Opportunities

Charter: from this workflow's experience, report the repo improvements that would make the next workflow cheaper — undocumented conventions and discovered patterns that belong in `AGENTS.md`/`CLAUDE.md`; checks worth automating as hooks given the review findings and verification failures; and missing test categories, CI checks, or test helpers the verification results expose. Each recommendation names the finding or failure that motivates it.

Merge all sub-agent findings and deduplicate. Write into `## What Went Well`, `## Friction / Failure Points`, `## Root Causes`, `## Recommended Improvements`, and `## Deferred Debt`.

**Distill durable learnings (0–3) into the solutions corpus.** After the merge, distill
pattern-level learnings from the merged findings. Each must pass ALL THREE durability criteria:

1. **Recurs** — would plausibly bite a *future* workflow, not just this one.
2. **Non-obvious** — not derivable from the repo, its durable guidance (`AGENTS.md`/`CLAUDE.md`), or the stage references.
3. **Actionable** — a future plan/implement run could change a decision because of it.

Zero learnings is a legitimate outcome; do not pad. A **repeated runtime-evidence deferral** is a
prime candidate ("<wall> blocks all interactive ACs; the one-time harness that retires it = …",
category `testing` or `gotcha`). A **standing-steering entry that recurs across workflows** (from this or prior slugs'
`steer.md`; see `_steering.md`) is likewise a candidate (usually `process` or the category matching its
subject); the durability filter still applies.

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

Body: **Problem / Learning / How to apply** — three short sections, ≤ ~30 lines. Append one line per new learning to
`.ai/solutions/INDEX.md` (`- [title](<category>/<file>.md) — <hook>`; create the index with a
`# Solutions` heading if missing — producers append, consumers read the index first and load only
matching files). Stamp `learnings-written: [<paths>]` in the retro frontmatter (empty list
allowed). Writing these files is part of retro's output contract, not "applying improvements".

**Classify each learning `about-the-project` vs `about-the-workflow`.** A project lesson is about
*this repo* (its code, stack, domain); a workflow lesson is about `/wf` itself (a stage prompt
misfired, a gate was wrong, a reference misled). The two go different places:
- **Promote a project lesson to the global corpus (W12.1) — user-confirmed, never automatic.** Only
  when `.ai/sdlc-config.json` sets `solutions.globalDir` (default `null` = disabled). Promotion is a **privacy
  decision the user makes**: offer it as a gate question per [_gate-question.md](_gate-question.md) and copy to the global dir ONLY on an
  explicit yes. Never promote silently or by policy (a stop condition on an autonomous run).
- **Channel a workflow lesson to plugin-backlog (W12.2).** When `solutions.globalDir` is set, append
  each `about-the-workflow` lesson to a user-reviewable `plugin-feedback.md` in that dir. Append only; never edit `/wf`
  itself. If `globalDir` is unset, keep the lesson in the repo corpus and note it in the retro body.

# Workflow rules
Apply [_workflow-rules.md](_workflow-rules.md).

# Chat return contract
Apply [_grounded-progress.md](_grounded-progress.md): every count this stage reports (checks run/passed, commits, findings) names the artifact or tool result it came from. After writing files, return per [_chat-return.md](_chat-return.md) — narrative lead in the artifact's `## The Retro` story voice, then this receipt:
- `slug: <slug>`
- `wrote: <path>`
- `next: workflow complete` (or options if follow-up is warranted)
- ≤3 short blocker bullets if needed

**Batch mode** (`retro-scope: branch`): lead with the combined branch-level retro narrative (the cross-slug story), then the receipt as a per-slug roster — one `wrote:` line per retrospected slug, the skipped slugs named with their reason, and a single `cross-slug learnings:` line pointing at the `.ai/solutions/` files the synthesis wrote.

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

**Option B: Open follow-up workflow** → `/wf intake <new-task-description>`
Use when: The retro identified follow-up work significant enough to warrant its own workflow, OR the `## Deferred Debt` harvest surfaced any `act-now` items — route each to `/wf intake fix` (one-file ceiling) or `/wf intake refactor` (cross-file).

**Option C: Next slice** → `/wf plan <slug> <next-slice>` or `/wf implement <slug> <next-slice>`
Use when: The retro is running mid-workflow and there are more slices.

**Option D: Apply retro improvements** → suggest specific file edits
Use when: The retro identified quick-win improvements to repo instructions, hooks, or CI that the user might want to apply now. List them as actionable suggestions but do NOT apply them. Durable learnings are already written to `.ai/solutions/` by the distillation step — Option D's remaining scope is repo instruction/hook/CI edits only.

Write ALL viable options into `## Recommended Next Stage` so the user can choose.

Write `10-retro.md` with the frontmatter and body sections in [retro/_artifact.md](retro/_artifact.md). On a re-run over an existing `10-retro.md`, follow the additive-write contract in the same file.

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

