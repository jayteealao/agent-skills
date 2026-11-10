# Output boundary & shared context
Apply `intake/_intake-context.md` — the External Output Boundary and the workflow-registry / slug rules. Apply the "Compressed-lifecycle change-modes" contract in `intake/_change-mode-tail.md`: the model, the authorship split, and the gate. Do not restate them here.

You are running `/wf intake fix`, a **compressed standard lifecycle** for small intentional changes.

# Slug-mode

When the dispatcher selected slug-mode, follow [_compressed-slice.md](../_compressed-slice.md) with `<op>` = `fix`: it overrides the standalone steps below.

# Pipeline
`01-fix`(intake) → `02-shape` → `03-slice` → `04-plan` → **[gate]** → `/wf implement` (→`05`) → `/wf verify` (→`06`) → `/wf review` (→`07`) → `/wf ship` → `/wf retro`

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces (this command) | `01-fix.md` (`type: intake`), `02-shape.md`, `03-slice.md` (`type: slice-index`, one slice), `04-plan.md`, and a conformant `00-index.md` (`type: index`). |
| Compression | Each planning stage is one light pass, and no stage is skipped. One slice, written as a real `03-slice.md`. Design runs when `ux-impact` is not `none` (`_change-mode-tail.md` → UX impact and the design stage); the trailing token `design` forces it. |
| Gate | Stop and ask before `05-implement` (`_change-mode-tail.md` → Compressed-lifecycle change-modes; the same file handles Adjust and Escalate). The run may go to the end without the pause when the change is judged low-risk. |
| Next | `/wf implement <slug>`: the standard execution chain takes over from stage 5. |
| Escalate | When the work no longer fits the fix envelope during planning, warn and continue. Record the breach per `_change-mode-tail.md`, and offer the "Escalate" option of the gate, which closes this slug and restarts as `/wf intake "<description>" from <slug>`. Do not refuse. |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | on-resume | |
| `01-fix.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_change-mode-tail.md` | procedure | always | |
| `intake/_intake-provenance.md` | procedure | always | |
| `intake/_intake-provenance-consume.md` | procedure | mode:from | |
| `design/_lane.md` | procedure | always | UX impact |
| `design/stage.md` | procedure | mode:design | |
| `_compressed-slice.md` | procedure | mode:slug | |
| `01-fix.md` | writes | | |
| `02-shape.md` | writes | | |
| `03-slice.md` | writes | | |
| `04-plan.md` | writes | | |

# Scope discipline
You orchestrate a compressed planning. You are not an incident responder, and you do not shape a feature.
- This command skips ceremony, not stages and not thinking. Every stage artifact is real and conforms to the schema.
- Ask at most 2 planning questions in chat. Record each answer with `decide add` per [_decisions.md](../_decisions.md), and also write it inline into `01-fix.md`.
- Set `ux-impact`, and confirm it with the stack question. When design is needed, run the compressed design stage per `_change-mode-tail.md` before `03-slice.md`. The person confirms the drawing in this same run.
- Keep the stated order only where a step uses the output of an earlier step or crosses a gate. Reading and research may interleave freely. The compression happens inside a step, not by removing steps.

# Step 0 — Orient
1. **Resolve the slug and the mode** from `$ARGUMENTS`:
   - When the argument matches an existing workflow whose index (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`) has `workflow-type: fix` (new) or `workflow-type: quick` (old), this is **resume mode**. Read that index, and the lead with `record get`: `01-fix.md` (new), or the old `01-quick.md` / `01-fix.md` with `type: fix-plan` from before the migration. Check both. Continue from the first unwritten planning artifact. When the planning is complete, the person likely meant `/wf implement`: tell them, and stop.
   - Otherwise this is a **new `/wf intake fix` workflow**.
2. **New slug.** Name it per "New slug" of [_intake-context.md](_intake-context.md), with the form `fix-<short-description>` (the old alias for fix: `quick`).
3. **Provenance check.** Apply `_intake-provenance.md`:
   - Detect an inherited analysis decision: an explicit trailing `from <source-slug>` token, or an exact label match for an `investigate`, `ideate` or `brainstorm` source.
   - Use the matching row of the Consume table. An `investigate` option card, an `rca` diagnosis or an `ideate` idea card seeds `01-fix.md` and the prompts of the Step 1 sub-agents.
   - Link back: record `origin-<type>` here, set `superseded-by` on the source index, and apply the implicit pick or route when the source is still open.

   With no match, go on. That is the common case.
4. **Stack fingerprint.** Apply the stack policy in `_change-mode-tail.md`: detect cheaply, then spend one of the two allowed questions on the one-line confirmation, and set `stack.user-confirmed: true`. In the same question, confirm `ux-impact` per `_change-mode-tail.md` → UX impact and the design stage.
5. **Branch check:**
   - The default is `branch-strategy: dedicated`, with the branch `fix/<slug>`. Create it from the current base when it is absent: run the base check first (`node "<skill-dir>/scripts/wf.mjs" base check "<root>" --base <base>`, [_workflow-rules.md](../_workflow-rules.md)), then `git checkout -b fix/<slug>`.
   - When the person passed `branch-strategy: none`, or is in the middle of a task on a branch they want to keep, record `branch-strategy: none`, and do not switch branches.
6. **Read the project context, lightly:** `PRODUCT.md` and `DESIGN.md` when present (the design context), and the top ~100 lines of `README.md`. Do not read the whole codebase here: the sub-agent of Step 1 explores where it matters.
7. **One slice.** This is a single-slice lifecycle. The workflow slug is also the `slice-slug` of that slice: use `<slug>` for `slice-slug`, `selected-slice` and `best-first-slice`. The later stages write un-suffixed files (`04-plan.md`, `05-implement.md`, `06-verify.md`).

# Step 1 — Author the planning artifacts (single pass, parallel research)

**Write the index first.** Before the first question or research of this step, write the draft of `00-index.md` from the shared change-mode index template in [_change-mode-tail.md](_change-mode-tail.md), with the values of the `fix` column, `progress.intake: in-progress` and `next-invocation: /wf intake fix <slug>`, and put it. A run that stops before the gate can then resume (the resume test of Step 0 reads this index), and a close or a probe route of a later step has an index to act on.

Use research sub-agents in parallel to gather what you need before you write. Do not write from memory.

### Parallel research (use sub-agents)
Launch them in parallel before you write. Skip them when the change is a one-line fix in a file that the person named.

**Effort tier.** Give every agent the tier **low** ([_subagents.md](../_subagents.md)). Both agents do bounded targeted reads with structured output.

#### research sub-agent 1 — Codebase grounding
Give it all of these:
- Find the files most likely to be touched, from the person's description.
- For each candidate file, note its current shape (~5 lines), the nearby patterns that the change should match, and the callers that may need an update.
- Run `git log --oneline -10` on the candidates. Flag each file touched in the last 7 days: the area is in flux.
- Search for existing utilities and helpers that solve the same problem, and flag the reuse opportunities.

It returns structured text: `files_in_scope`, `nearby_patterns` (1 to 3), `reuse_candidates` (`path:symbol — what it does`), `recent_churn`.

#### research sub-agent 2 — Web freshness (skip if pure internal change)
Skip it when the change is purely internal: no new external dependency, no API integration, no platform or browser API, no security surface. Otherwise it searches the docs of the relevant library or API for the latest stable syntax, and for the known gotchas and deprecations of the last 12 months. It returns 2 or 3 source URLs with a one-line takeaway each, and a **go/no-go** on whether the approach is current.

### Then write all four planning artifacts
Each artifact conforms to the schema. Use real timestamps per [_timestamp.md](../_timestamp.md). Write each one as a draft `<wf-dir>/.draft/<name>`, then run `record put "<root>" <slug>`. Take the frontmatter of each record from the planning templates in [_change-mode-tail.md](_change-mode-tail.md), with the `fix` values.

**`01-fix.md` — `type: intake`** (the compressed brief, in place of a standalone intake):
Body (tight): `## Restated Request` (what the person wants, and why), `## Acceptance Criteria` (at most 3, each objectively verifiable; embed the answers to the inline questions as italic notes), `## Assumptions`, `## Open Questions` (when there are any, set `status: awaiting-input`).

**`02-shape.md` — `type: shape`:**
Body (tight): `## In Scope` (1 to 3 bullets), `## Out of Scope` (1 to 3), `## Known Unknowns` (0 to 2). When design is needed, add 3 to 5 design-note bullets here, and point to `02b-design.md` and `02c-craft.md`, which the compressed design stage writes before `03-slice.md`.

**`03-slice.md` — `type: slice-index`** (one slice: the lifecycle never skips slicing):
Body (one line): "Single-slice lifecycle — the whole fix is one slice."

**`04-plan.md` — `type: plan`:**
Body: `## Steps`, a numbered list of at most 5 implementation steps. Each step names the files it touches, states the change in 1 or 2 lines, and lists its verification (lint? test? manual check? screenshot?). Then `## Verification`: **Tests to run** (specific commands) and **Manual checks** (specific URLs, flows and visual checks).

### Tripwires (warn-and-continue — never refuse)
The fix tripwires are: more than 3 files touched; more than 5 implementation steps; a new external dependency; an architectural change (a new module, a schema migration, the public API surface, a cross-cutting behavior change); more than 2 questions that cannot be answered. Record every breach per the tripwire-breach mechanism in [_change-mode-tail.md](_change-mode-tail.md): the `## Tripwire breaches` section in `04-plan.md`, and the mirrored `intent-risks` entry. Still write a valid plan.

# Step 2 — Finish `00-index.md` (conformant `type: index`)

Get the index that Step 1 wrote (`record get "<root>" <slug> index`), and finish it. Write its draft from the shared change-mode index template in [_change-mode-tail.md](_change-mode-tail.md), with the values of the `fix` column: the final `workflow-files`, `progress` and terminus route. Include the `stack:` block of Step 0 (`user-confirmed: true` after the confirmation) and, when provenance attached, the `origin-<type>` key. Put it.

# Step 3 — Gate before implement (required unless auto-proceeding)

Apply the gate and the family gate rules in [_change-mode-tail.md](_change-mode-tail.md):
- Record the decision in `01-fix.md` on every branch.
- Adjust revises the plan and gates again.
- Escalate closes this slug (`close-reason: superseded`) and prints `/wf intake "<description>" from <slug>`.

You may go on without the pause when the change is clearly low-risk: at most 3 files, no tripwires, no open questions.

# Step 4 — Hand off

Lead with a short narrative paragraph, in prose with no bullets, that tells the story: what the fix is, the files in scope, the step count, any tripwire, and the gate decision. Then the structured anchors:

```
wf intake fix complete: <slug>
Branch: <branch-name or "current branch">
Files in scope: <comma-separated, max 3 — say "+N more" if longer>
Plan: <N> steps · Slices: 1 · Tripwires: <none | names>
Gate: <proceeded | adjusted | escalated | auto-proceeded (low-risk)>
Next: /wf implement <slug>
```

If escalated, `Next:` is the successor invocation that the tail printed: `/wf intake "<description>" from <slug>`.

# Workflow rules
Apply the shared workflow rules in [_change-mode-tail.md](_change-mode-tail.md): the artifact home, the frontmatter and real timestamps, drafts and puts, and the resume from the first unwritten artifact. Resume mode (Step 0) continues from the first unwritten planning artifact. A run that stopped after `02-shape.md` and before `03-slice.md` writes the slice, the plan and the index, and gates.

# What this command is NOT

- **Not a way to skip review.** `/wf implement`, `/wf verify` and `/wf review` still run. The compression is in the planning, never in the stages or the quality gates.
