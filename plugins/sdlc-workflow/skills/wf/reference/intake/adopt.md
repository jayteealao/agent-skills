---
description: Adopt work that already happened into the lifecycle. Every other intake mode assumes the change lies ahead; adopt runs the other way — it reads the current working-tree / branch diff, reverse-engineers the planning-and-execution artifacts (01-adopt → 05-implement) from what the code already does, stamps them provenance:adopted, and lands the workflow at /wf verify so the quality tail (verify → review → handoff) can run over work that was done outside the pipeline. Use when you explored-and-patched first and only afterward decided the change deserves recorded verification.
argument-hint: "[description]"
---

# Output boundary & shared context
Load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/intake/_intake-context.md` in full and apply it — the External Output Boundary, the narrative-fragment tier, the workflow-registry / slug rules, **and the "Compressed-lifecycle change-modes" contract (the model, the authorship split, and the gate)**. Do not restate them here.

You are running `/wf intake adopt`, the **reverse-entry** mode. Where `fix`/`hotfix`/`refactor` author a plan and then drive execution *forward*, adopt reconstructs the record *backward* from a diff that already exists, then hands the result to the standard verification chain.

# What adopt is (and is not)

- **Adopt is standalone-only and always creates a NEW workflow** from the current working-tree / branch state. There is no slug-mode: attaching already-done work to an *existing* slug as a slice is deliberately out of scope for this mode (the dispatcher never routes `<slug> adopt` here — see the dispatcher's Step 0). If the dispatcher somehow hands you a slug, STOP and tell the user adopt only roots new workflows.
- **Adopt does not write code and does not undo it.** The change already exists in the tree; adopt records it. The one thing adopt authors *forward* is the verification strategy — that is the entire point of adopting.
- **Adopt is not archaeology.** The adoptable surface is the *working tree plus the unpushed / unmerged branch delta* against the base branch. Work that is already pushed and merged has no quality tail left to gate — adopt refuses it (Step A0).
- **Every artifact adopt writes carries `provenance: adopted`** so no downstream stage, reader, or learnings-harvester mistakes reconstruction for forethought. This is load-bearing: retro's learnings distillation and any pattern-mining over `04-plan`/`05-implement` must be able to tell authored work from adopted work.

# Pipeline
`01-adopt`(intake) → `02-shape` → `03-slice` → `04-plan` → `05-implement` → **[confirm-before-write gate]** → `/wf verify` (→`06`) → `/wf review` (→`07`) → `/wf handoff` → `/wf ship` → `/wf retro`

| | Detail |
|---|---|
| Requires | Uncommitted changes and/or unpushed-unmerged commits against the base branch. Refuses on a clean, fully-published tree (Step A0). |
| Produces (this command) | `01-adopt.md` (`type: intake`), `02-shape.md`, `03-slice.md` (`type: slice-index`, one slice), `04-plan.md`, `05-implement.md`, and a conformant `00-index.md` (`type: index`) — all `provenance: adopted`. |
| Reconstruction | `02`–`05` are inferred from the diff, not authored forward. `04-plan`'s ladder/reuse sections become *retrospective observations*; `04-plan`'s `## Verification Strategy` is authored *forward* — the real deliverable. |
| Gate | Stop-and-confirm the inferred shape (goal / scope / slice split / ACs) **before any artifact is written** (Step 2). Inference from a diff can be wrong, and a wrong adopted shape poisons every downstream stage. |
| Next | `/wf verify <slug>` — the standard verification chain takes over from stage 6. |
| Branch | Adopt **records** the current branch in `00-index.md`; it never creates or switches branches. The work already lives somewhere. |

# CRITICAL — scope discipline
You are a **reconstruction orchestrator**, not a coder and not a shaper inventing new scope.
- Infer scope from *what the diff actually does*, never from what it *could* have done. Scope-in is exactly the changed surface; scope-out is explicitly everything else.
- **Constraint forethought still applies (W2d).** An adopted AC with an environment dependency on its critical path is NOT exempt just because the code exists — resolve it to a prerequisite slice, a proxy AC + named clearing event, or explicit PO risk-acceptance, exactly as a forward plan would. Adopted work does not get to skip verification engineering.
- Ask at most **2 questions** in chat during reconstruction, plus the mandatory confirmation gate. No separate `po-answers.md` — answers go inline into `01-adopt.md`.
- Follow the steps below exactly in order.

# Step A0 — Gather the adoptable surface (MANDATORY — before anything else)

1. **Resolve the base branch.** Use the same resolution the review stage uses: the tracked upstream of the current branch if set, else the repo default (`main`/`master`). Record it as `<base>`.
2. **Collect the surface** via Bash (use real output, never guess):
   - `git status --porcelain` — uncommitted (staged + unstaged + untracked) changes.
   - `git log <base>..HEAD --oneline` — commits ahead of base on this branch.
   - `git diff <base>...HEAD` **and** `git diff` (unstaged) **and** `git diff --cached` (staged) — the full adoptable diff. Include untracked files' contents (`git status` lists them; read the notable ones).
3. **Refuse when there is nothing to adopt.** If the tree is clean (`git status --porcelain` empty) **AND** there are zero commits ahead of `<base>` → STOP with:
   > *"Nothing to adopt — the working tree matches `<base>` and no unmerged commits are ahead. Use `/wf intake <description>` to start new work, or make the change first and re-run adopt."*
4. **Refuse fully-published work.** If every commit ahead is already merged into `<base>` on the remote (no unpushed commits AND no local diff) → STOP: adoption's quality tail has nothing to gate; recommend `/wf intake <slug> <scope>` extension or a fresh workflow instead.
5. **Record the surface** — the changed-file list with per-file insertion/deletion counts (`git diff --stat`), the commit SHAs ahead of base, and the current branch name. This becomes the *provenance evidence* embedded in `01-adopt.md` and referenced by every reconstructed artifact.

# Step A1 — Reconstruct the shape (parallel grounding, then infer)

Use parallel Explore sub-agents to understand the diff before inferring intent — do not reconstruct from the diff text alone.

**Model for every dispatched agent:** `haiku`. REQUIRED on every `Task` call — both do bounded, targeted reads with structured-output extraction.

#### Explore sub-agent 1 — Diff comprehension
Prompt with ALL of the following:
- Given this changed-file set `<files>`, read each changed file around the changed hunks and summarize **what behavior the change introduces or alters** (observable effect, not line-by-line).
- Identify the entry points and callers touched; note anything the change *implies* should also have changed but did not (a smell the adoption should flag).
- Classify the change surface: is it one coherent concern, or clearly-separable concerns (disjoint file sets that are independently revertable)?
- Return structured text: `observed_behavior` (1–3 bullets), `entry_points`, `separable_concerns` (yes/no + grouping), `implied_gaps`.

#### Explore sub-agent 2 — Convention & risk grounding
Prompt with:
- For the changed area, report the nearby patterns the change should have matched (naming, error handling, test placement) and whether it did.
- Search for existing tests that already exercise the changed code paths (so verify knows what baseline exists).
- Run `git log --oneline -10` on the changed files; flag any also touched by *other* recent work (adoption may be racing a parallel change).
- Return: `convention_match` (matches/deviates + note), `existing_tests` (`path — what it covers`), `recent_churn`.

**Then infer the shape** from the diff + sub-agent findings:
- **Goal** — what the change accomplishes, in one sentence, phrased as intent.
- **Scope-in** — exactly the changed surface. **Scope-out** — explicitly everything else ("no changes to X, Y").
- **Acceptance criteria** — derived from the *observed behavior* of the change, each objectively verifiable, authored under the verifiability-first rules (an AC verify cannot evidence is a defect in the AC, not a fact to accept). Apply W2d to any AC with an environment dependency.
- **Slice split** — a **single slice by default** (the workflow slug doubles as the one slice's `slice-slug`). Split into >1 slice **only** when sub-agent 1 reported clearly-separable concerns (disjoint file sets AND independently revertable); when in doubt, one slice.

# Step 2 — Confirmation gate (MANDATORY — before any artifact is written)

Inference from a diff can be wrong, and a wrong adopted shape poisons every downstream stage. **Before writing any file**, present the inferred shape and confirm via `AskUserQuestion`:

```
question: "Adopting <N> changed files on branch `<branch>` as workflow `<slug>`. Inferred goal: “<goal>”. Scope, slice split (<M> slice(s)), and <K> acceptance criteria are drafted from the diff. Adopt this shape?"
options:
  - label: "Adopt"
    description: "Write the reconstructed artifacts (01-adopt → 05-implement) and route to /wf verify."
  - label: "Adjust"
    description: "Correct the goal / scope / slice split / ACs before writing — say what is wrong."
  - label: "Cancel"
    description: "Do not adopt. Nothing is written."
```

- On **Adjust**, revise the contested part and **re-present once**. On a second correction, fall back to interactive shape questions (the default-intake question style) for the still-contested part only, then proceed.
- On **Cancel**, STOP — write nothing.
- Show the AC list and the changed-file roster in the chat around the question so the user is confirming against real content, not a summary.

# Step 3 — Write the reconstructed artifacts (each schema-conformant, each `provenance: adopted`)

Use real timestamps — run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash. Write each artifact atomically (temp path → rename). **Every frontmatter block below includes `provenance: adopted`.**

**`01-adopt.md` — `type: intake` (the adoption record, replaces standalone intake):**
```yaml
---
schema: sdlc/v1
type: intake
slug: <slug>
provenance: adopted
workflow-type: adopt          # mirror of the discriminator on 00-index.md
status: complete              # or awaiting-input if a blocking question remains
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
tags: []
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: wf-shape
next-invocation: "/wf shape <slug>"
---
```
Body (tight): open with `## The Adoption` — the story section (1–2 short paragraphs in the voice of `../_narrative-voice.md`: what already-built change is being adopted and *why it is being brought into the pipeline now*, relevance first, no "This adoption implements…" opening) — then `## Adopted Surface` (the changed-file roster with per-file +/- counts, the commit SHAs ahead of `<base>`, and the branch — the Step A0 evidence, verbatim), `## Restated Intent` (the inferred goal + any user correction from the gate), `## Acceptance Criteria` (each objectively verifiable; environment-dependent ACs carry their W2d resolution as an italic note), `## Assumptions`, `## Open Questions` (if any → set `status: awaiting-input`).

**`02-shape.md` — `type: shape`:**
```yaml
---
schema: sdlc/v1
type: shape
slug: <slug>
provenance: adopted
status: complete
stage-number: 2
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
docs-needed: false
docs-types: []
tags: []
refs:
  index: 00-index.md
  intake: 01-adopt.md
  next: 03-slice.md
next-command: wf-slice
next-invocation: "/wf slice <slug>"
---
```
Body (tight): `## In Scope` (the changed surface, 1–3 bullets), `## Out of Scope` (explicit, 1–3), `## Known Unknowns` (0–2 — including any `implied_gaps` sub-agent 1 flagged: things the diff arguably should have changed but did not).

**`03-slice.md` — `type: slice-index` (one slice unless separable concerns were confirmed):**
```yaml
---
schema: sdlc/v1
type: slice-index
slug: <slug>
provenance: adopted
status: complete
stage-number: 3
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
total-slices: 1
best-first-slice: <slug>
slices:
  - slug: <slug>
    status: implemented
    complexity: <xs|s|m>
tags: []
refs:
  index: 00-index.md
  shape: 02-shape.md
  next: 04-plan.md
next-command: wf-plan
next-invocation: "/wf plan <slug>"
---
```
Body (one line): "Single-slice adoption — the whole adopted change is one slice." (Or, if separable concerns were confirmed at the gate: one `slices[]` entry per concern, each mapped to its file group, and `total-slices` / `best-first-slice` set accordingly. Slice status is `implemented`, not `defined` — the code already exists.)

**`04-plan.md` — `type: plan` (retrospective observation + FORWARD verification):**
```yaml
---
schema: sdlc/v1
type: plan
slug: <slug>
slice-slug: <slug>
provenance: adopted
status: complete
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-to-touch: <int — actual changed-file count>
metric-step-count: <int — reconstructed step count>
has-blockers: false
revision-count: 0
tags: []
refs:
  index: 00-index.md
  slice: 03-slice.md
  next: 05-implement.md
next-command: wf-implement
next-invocation: "/wf implement <slug>"
---
```
Body:
- `## What Was Done` — the reconstructed steps, retrospective: each names the file(s) it touched and the change in 1–2 lines. This is observation, not instruction.
- `## Simplicity Ladder (observed)` — for each capability the change introduced, the rung it *actually* took (stdlib / native / reuse / new-code) as an observation, flagging any place a lower rung was clearly available but not taken (a note for review, not a blocker).
- `## Verification Strategy` — **the forward deliverable.** Per AC: the concrete check verify will run (test command / manual flow / observable), and a `constraint-resolution:` line for any AC with an environment dependency (`prerequisite-slice: <slug>` | `proxy+deferral: <clearing event>` | `po-accepted: <reason>`) per W2d. This section is what makes an adopted workflow verifiable rather than a rubber stamp.

**`05-implement.md` — `type: implement` (synthesized from the diff):**
```yaml
---
schema: sdlc/v1
type: implement
slug: <slug>
slice-slug: <slug>
provenance: adopted
status: complete
stage-number: 5
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-changed: <int — from git diff --stat>
metric-lines-added: <int>
metric-lines-removed: <int>
metric-deviations-from-plan: 0
metric-review-fixes-applied: 0
commit-sha: "<HEAD sha, or empty if the adopted change is still uncommitted>"
tags: []
refs:
  index: 00-index.md
  plan: 04-plan.md
  next: 06-verify.md
next-command: wf-verify
next-invocation: "/wf verify <slug>"
---
```
Body:
- `## What Landed` — the change as it exists in the tree, synthesized from the diff (files, key functions/behaviors added or altered).
- `## Deviations from Plan` — "n/a — adopted (the plan is a reconstruction of this code, not a spec it was built against)."
- `## Anything Deferred` / `## Known Risks / Caveats` — harvest `sdlc-debt:` markers from the diff (`git diff <base>..HEAD | grep -nE 'sdlc-debt:'`) and any TODO/FIXME the change introduced; record them so verify/retro see them.
- If the adopted change is **uncommitted**, note it: `commit-sha` is empty and verify will observe a dirty tree — that is expected for adoption.

## Step — Write free narrative fragments
Author free narrative fragments for any of these artifacts as described in the narrative-fragment tier of `_intake-context.md` — a before/after behavior sketch or a changed-surface map often tells the adoption story better than prose. `<stem>.<NN-label>.html.fragment` siblings of unrestricted raw HTML, ordered with an `NN-` prefix.

# Step 4 — Write `00-index.md` (conformant `type: index`)

Write the **full 22-field `type: index`** overview using the template + required-field set from [intake/default.md](default.md) (the `## Write 00-index.md` block) — the same heavy index a standard feature workflow uses. Adoption-specific values:

```yaml
---
schema: sdlc/v1
type: index
slug: <slug>
title: "<human-readable title>"
provenance: adopted
workflow-type: adopt          # the authoritative discriminator the standard commands + resume read
status: active
current-stage: implement      # execution is done (reconstructed); the workflow enters at verify
stage-number: 5
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
selected-slice: <slug>
branch-strategy: none         # adopt never creates/switches a branch; it records the current one
branch: "<current branch name>"
base-branch: "<base>"
review-scope: slug-wide       # single slice → one 07-review.md
pr-url: ""
pr-number: 0
open-questions: []
tags: []
next-command: wf-verify
next-invocation: "/wf verify <slug>"
workflow-files:
  - 00-index.md
  - 01-adopt.md
  - 02-shape.md
  - 03-slice.md
  - 04-plan.md
  - 05-implement.md
slices:
  - slug: <slug>
    status: implemented
    complexity: <xs|s|m>
progress:
  intake: complete
  shape: complete
  slice: complete
  plan: complete
  implement: complete
  verify: not-started
  review: not-started
  handoff: not-started
  ship: not-started
  retro: not-started
---
```

Notes:
- `current-stage: implement` with `implement: complete` in `progress` — the reconstructed execution is done; `verify` is the first *not-started* stage, and `next-invocation` points there. (Use the standard `current-stage` enum — `implement` — never a bespoke `adopted` value; the adoption fact lives in `provenance` and `workflow-type`, not in `current-stage`.)
- `branch-strategy: none` is deliberate — adoption inherits whatever branch the work was done on.
- Then **register the slug in `.ai/workflows/INDEX.md`** per [intake/default.md](default.md) Step 10 (create-if-absent / append-and-resort / never mutate other rows), with `workflow-type` column = `adopt`.

# Step 5 — Hand off

Lead with a short **narrative** paragraph (prose, no bullets) — what change was adopted, from how many files on which branch, the inferred goal, the slice split, and the single most important thing verify should scrutinize (e.g. an AC whose evidence is deferred, or an `implied_gap` the diff left open) — then the anchors:

```
wf intake adopt complete: <slug>
Branch: <branch> (recorded, not created)
Adopted: <N> files (+<adds>/-<dels>) · <C> commits ahead of <base> · <U> uncommitted
Slices: <M> (status: implemented) · ACs: <K> (<D> with deferred/constraint-resolved evidence)
Provenance: adopted — every artifact stamped
Next: /wf verify <slug>
```

# Resume & crash-safety
- Adopt is resumable: if interrupted after some artifacts are written, re-running adopt on the same tree detects the partially-written `.ai/workflows/<slug>/` (by the recorded branch + adopted-surface match in `01-adopt.md`) and continues from the first unwritten artifact rather than re-confirming. If the surface has changed since (the diff moved), warn and re-run the gate.
- Write each artifact atomically (temp path → rename) so a crash mid-write never leaves a half-written workflow.

# What this command is NOT
- **Not a way to skip verification** — the whole point is to *reach* `/wf verify`. Adoption reconstructs the record; it does not assert the code is correct. Verify still runs its full check suite and AC gate over the adopted change.
- **Not `fix`/`hotfix`/`refactor`** — those author a plan and build forward. Use them when the work has *not* been done yet.
- **Not extension** — `/wf intake <slug> <scope>` adds *new* scope to an existing workflow. Adopt roots a *new* workflow from *existing* code.
