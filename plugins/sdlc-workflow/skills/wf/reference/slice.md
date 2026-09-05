---
description: Break a shaped work item into thin, independently verifiable vertical slices. Writes a master index and one file per slice.
argument-hint: <slug> [focus area]
---

Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output this operation produces.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf slice`, **stage 3 of 10**: 1·intake → 2·shape → `3·slice` → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro.

| | Detail |
|---|---|
| Requires | `01-intake.md`, `02-shape.md` |
| Conditional inputs (required when present) | `02b-design.md` (design brief: its states, edge cases, and surfaces inform slice boundaries); `02c-craft.md` (visual contract: distinct visual surfaces in the mock fidelity inventory are reflected in slice boundaries; Step 0.5 holds the per-surface justification escape hatch for intentional grouping) |
| Produces | `03-slice.md` (master index) + `03-slice-<slice-slug>.md` per slice |
| Next | `/wf plan <slug> <best-first-slice>` (default) |
| Alt | `/wf plan <slug> all` to plan all slices in parallel |

**Auto second opinion (objective triggers).** Once `03-slice.md` is drafted (before adaptive routing), auto-invoke `/consult codex <critique this slice decomposition — independence, ordering, any risky slice buried mid-sequence>` (pinning `codex`/`claude` keeps it free) when ANY of: (a) the roster has more than 3 slices or a dependency chain 3+ deep; (b) any slice carries the charter-scenario AC or a carried intent-risk (RIM); (c) distinct visual surfaces or states were grouped into one slice via the justified-grouping escape. Skip only when none of the triggers hold; the user may invoke it explicitly with any provider.

# Role

You are a **workflow orchestrator**, not a problem solver.
- Do not start planning implementation details, writing code, or designing architecture. Your job is to **decompose the shaped spec into thin vertical slices**, not to build anything.
- Write the per-slice files before the master `03-slice.md`, and update `00-index.md` last.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start solving the problem, STOP and return to the next unfinished workflow step.

# Workflow rules

Apply [_workflow-rules.md](_workflow-rules.md).

# Step 0 — Orient (do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`: `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - `01-intake.md` and `02-shape.md` exist. If missing → STOP. Tell the user which command to run first ("Run `/wf shape <slug>` first.").
   - If `02-shape.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve the open shape questions first.
   - **Stack gate (do not silently re-detect).** Inspect the `stack:` block in `00-index.md`.
     - If the block is **missing entirely** → STOP. Tell the user: "Step 0.5 stack fingerprint is missing from `00-index.md`. Re-run `/wf intake <slug>` to capture it; that step is the source of truth for downstream tooling decisions." Slice does not re-detect the stack; silent re-detection would diverge from intake's user-confirmed truth.
     - If `stack.user-confirmed: false` → WARN: "`stack:` was auto-detected but the PO has not confirmed it. Slicing decisions that depend on tooling or platform (which surfaces ship together) may be wrong. Re-run intake's Batch B confirmation, or proceed and accept the risk?" Ask it as a gate question per [_gate-question.md](_gate-question.md). If the user proceeds, treat the unconfirmed stack as advisory only; it does not drive slice boundaries.
     - If `stack.user-confirmed: true` → proceed. The slice strategy may reference confirmed platforms and tooling to justify groupings, and introduces no tooling assumptions beyond `stack:`.
   - If `current-stage` is already past slice → note the re-run in chat and proceed. [_additive-write.md](_additive-write.md) snapshots the prior revisions and appends the `revisions:` ledger.
4. **Read** `01-intake.md`, `02-shape.md`, and `po-answers.md`.
5. **Read design artifacts (required when present).**
   - `02b-design.md`: extract the content inventory, the state list (empty / error / loading / first-run), and the visual direction. State transitions (empty vs populated) and visual surface boundaries (main view vs settings drawer) inform slice boundaries: either each distinct state or surface gets its own slice, or the master `03-slice.md` `## Slice Strategy` justifies the grouping with one sentence per state or surface.
   - `02c-craft.md`: extract `## Mock fidelity inventory` and the per-surface notes. Distinct visual surfaces (card vs detail vs drawer) and signature interactions are reflected as slice boundaries under the same rule: own slice, or one justifying sentence per surface in `## Slice Strategy`. Do not re-decompose around token choices, motion specs, or implementation details; those belong to plan and implement. If `02c-craft.md` introduces surfaces or states absent from the shape or `02b-design.md`, record an open question on the master index rather than silently expanding scope.
   - **State-completeness knowledge (when `stack.ui ≠ ∅`).** `slice` structures around the design: a state or visual surface that carries its own acceptance criteria usually earns its own thin slice. To recognize which states are substantive enough to slice, load `design/onboard.md` (empty / first-run states), `design/polish.md` (the 7-state completeness checklist), and `design/_design-context.md` (register and absolute bans; the design floor that holds even when no `02b`/`02c` exists). This is structuring, not redesigning; never re-do design work here. When `stack.ui` is empty, skip the design-knowledge load.
   - If neither file exists, skip this step.
6. **Carry forward** `selected-slice-or-focus` and `open-questions` from the index.

# Chat return contract

After writing files, return per [_chat-return.md](_chat-return.md): a narrative lead in the artifact's `## The Slices` voice, then this receipt:
- `slug: <slug>`
- `wrote: <paths>` (every slice file written)
- `options:` (all viable next options per Adaptive routing)
- ≤3 short blocker bullets if needed

# Per-slice file pattern

Every slice gets its own file, `03-slice-<slice-slug>.md`; the slice-slug is a lowercase kebab-case identifier derived from the slice name ("Auth Flow" → `auth-flow`). The master `03-slice.md` is an index that links to each per-slice file and carries the cross-cutting information.

Do this in order:
1. **Discovery phase — ask about slicing strategy before cutting.**
   Interview the user with gate questions per [_gate-question.md](_gate-question.md) before you finalize slice boundaries. Ask only the questions this decomposition needs, batched into as few rounds as the dependency structure allows.

   **Rules:** every question is about how to decompose this specific feature and references concrete parts of the shaped spec; questions are impartial and present genuinely different decomposition strategies; skip questions the shape or intake artifacts already answered; construct each question per [_question-craft.md](_question-craft.md), describing options by what the PO experiences (more PRs and faster feedback vs fewer review passes), not by mechanism.

   **What to ask about:** delivery order (riskiest part first or most visible part first; a demo date, milestone, or dependency that drives which slice ships earliest); slice granularity (as thin as possible vs chunked into larger coherent units; the team's review capacity); rollout coupling (which slices can ship independently; feature flags, migrations, or API contracts that force things into one slice); scope cuts (parts of the spec the user would defer; must-have-now vs nice-to-have-later criteria). Append every answer to `po-answers.md` with timestamp and `stage: slice`.

2. Run freshness research only where external constraints affect slicing or order.
3. Break the work into small vertical slices that can be implemented and verified independently.
4. Assign each slice a **slice-slug** (lowercase kebab-case).
5. Put risk-reduction and uncertainty-reduction early.
6. Identify the best first slice.
6b. **Charter-scenario coverage (when `02-shape.md` carries a `## Charter Scenario`).** The **visible-milestone slice** (the first slice at which a user sees the core loop working end-to-end) and the **final slice** each carry a standing acceptance criterion, `charter scenario executes through step N`: the milestone slice proves the steps built so far, the final slice proves ALL steps. Tag it `observable: true` (verify runs it interactively, on the same ladder as any user-observable AC) and attach a `verify:` stub like any other. Skip when the shape authored no Charter Scenario.
6c. **Confirm review scope (the roster is now known; intake deliberately did not ask this).** `00-index.md` carries the provisional default `review-scope: per-slice` with `review-scope-confirmed: false`, because the PO cannot judge review layout before slicing exists. Ask ONE gate question per [_gate-question.md](_gate-question.md) with the recommendation informed by the roster: a 1-slice roster recommends `Slug-wide` ("One `07-review.md` against the cumulative branch diff"); a >1-slice roster recommends `Per slice (Recommended)` ("Each slice gets its own `07-review-<slice>.md`; handoff aggregates per-slice verdicts"). Offer both options either way, per [_question-craft.md](_question-craft.md). Record the answer in `po-answers.md` (`stage: slice`); set `review-scope:` to the choice and `review-scope-confirmed: true` in `00-index.md` (step 10 carries it). Skip ONLY if `review-scope-confirmed` is already `true` (a re-run, or an older workflow asked at intake).
7. **Write one `03-slice-<slice-slug>.md` per slice** (template below).
8. **Write the master `03-slice.md`** (template below) with links to every per-slice file.
9. **Evaluate adaptive routing** and write ALL viable options into the master file's `## Recommended Next Stage`.
10. Update `00-index.md` with the recommended default option and add all slice files to `workflow-files`.

# Adaptive routing

Present ALL viable options and write them into `## Recommended Next Stage`:
- **Option A (default): Plan the best-first slice** → `/wf plan <slug> <best-first-slice-slug>`. Standard flow: work through slices one at a time, starting with the highest-risk or highest-value slice.
- **Option B: Plan all slices in parallel** → `/wf plan <slug> all` when the slices are independent enough that planning them all upfront is efficient.
- **Option C: Revisit shape** → `/wf shape <slug>` when slicing revealed a spec too vague, contradictory, or incomplete to decompose.

# AC verifiability discipline (author the verification path WITH the AC)

A user-observable acceptance criterion is not finished until you can name how it will be observed. An AC born without a verification path becomes a verify-time wall the model rationalizes past with a static-reasoning `pass` or a bare "no emulator" deferral. Decide verifiability here, where re-scoping an AC is cheap. For **every** acceptance criterion you write into a per-slice file:

1. **Partition it; `observable:` is a justified feasibility decision, not a bare label.** Tag each criterion `<!-- observable: true -->` or `<!-- observable: false -->` immediately after its text; `verify` reads this tag, and it is set here at authoring time, never discovered at verify. `observable: true` = a user would see or experience the outcome (a rendered surface, a navigation, a command's output); name the tool that will observe it in one line. `observable: false` = the outcome is fully provable by an automated assertion with no live runtime ("the util handles null input"); you are claiming an existing or cheap automated test fully covers it, and `false` suppresses the runtime gate downstream.
2. **Attach a verification-plan stub to every `observable: true` AC**, inline under the criterion:
   ```
   - Given a phone viewport When the board loads Then the carousel is single-column with a tap action sheet at 375px
     <!-- observable: true -->
     verify: { method: playwright, env: 375x812 viewport (install-playwright if absent), fixture: seeded-board, rung: web-1 }
   ```
   `method` = the tool or technique that observes it; `env` = the target environment and what must be installed or booted (`plan` turns this into an authorized bootstrap step, so a missing tool surfaces now); `fixture` = the seed data or deterministic state the AC needs; `rung` = the expected constraint-resolution-ladder rung ([runtime-adapters.md](runtime-adapters.md) → *Constraint-resolution ladder*). The stub is a sketch; `plan`'s `## Verification Strategy` engineers it.
3. **Ban un-plannable user-observable ACs.** If no method, tool, or env would observe an `observable: true` AC in the target environment, do one of these, never "decide later": **re-scope** the AC to an observable proxy that can be verified there, or **pre-register the deferral now**, stating the constraint at birth ("operator session required: prod OAuth credentials") as a logged decision the PO agreed to.
4. **Name every architectural mechanism in the artifact body.** Any mechanism named in an AC, a verification method, or a `verify:` line (a state machine, scheduler, queue, cache, pipeline, orchestrator, or controlling regex) exists as a named decision in this slice's body: one sentence stating the mechanism, what it replaces, and why. A mechanism that enters only through a test method is a design decision smuggled past review; name it in the body or drop it from the AC. This mirrors shape's AC-authoring rule.

`plan` (`## Verification Strategy`) and `verify` (the user-observable AC gate) both build on this discipline.

# Artifacts

Write `03-slice.md` (master index):

```yaml
---
schema: sdlc/v1
type: slice-index
slug: <slug>
status: complete
stage-number: 3
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
total-slices: <N>
best-first-slice: <slice-slug>
tags: []
slices:
  - slug: <slice-slug>
    status: defined
    complexity: <xs|s|m|l|xl>
    depends-on: []
  - slug: <slice-slug>
    status: defined
    complexity: <xs|s|m|l|xl>
    depends-on: [<other-slice-slug>]
refs:
  index: 00-index.md
  shape: 02-shape.md
next-command: wf-plan
next-invocation: "/wf plan <slug> <best-first-slice>"
---
```

Body of `03-slice.md`, as `# Slice Index`, in order:
- `## The Slices` — first, and self-sufficient. Follow `_story-arc.md`: three beats in order (the state this stage inherited, the load-bearing decisions with reasons and counts, what this stage enables next plus the top open risk). Language follows `_ste-procedural.md` sections 1 and 3. No "This <stage> implements…" opening. 1–3 short paragraphs.
- `## Slice Strategy` (including the one-sentence-per-surface grouping justifications from Step 0.5).
- `## Recommended Order` — numbered `<slice-slug>` with a reason each.
- `## Cross-Cutting Concerns`, `## Dependencies Between Slices`, `## Deferred / Optional Slices`.
- `## Freshness Research` — Source / Why it matters / Takeaway per entry.
- `## Recommended Next Stage` — Option A (default) `/wf plan <slug> <best-first-slice-slug>`; Option B `/wf plan <slug> all`; Option C `/wf shape <slug>`; each with its reason, when applicable.

Write `03-slice-<slice-slug>.md` (per-slice file):

```yaml
---
schema: sdlc/v1
type: slice
slug: <slug>
slice-slug: <slice-slug>
status: defined
stage-number: 3
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
complexity: <xs|s|m|l|xl>
depends-on: [<other-slice-slugs>]
tags: []
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-<other>.md, ...]
  plan: 04-plan-<slice-slug>.md
  implement: 05-implement-<slice-slug>.md
---
```

Body of `03-slice-<slice-slug>.md`, as `# Slice: <slice-name>`, in order:
- `## The Slice` — the story section, under the same rules as `## The Slices` above.
- `## Goal`, `## Why This Slice Exists`, `## Scope` (what is in; what is out and which slice handles it).
- `## Acceptance Criteria` — each criterion authored WITH its verification path per the discipline above. `- Given ... When ... Then ...`, then `<!-- observable: true|false — one-line justification of the partition -->`, then, only for `observable: true`, `verify: { method: <tool/technique>, env: <target env / what must be installed or booted>, fixture: <seed data / deterministic state>, rung: <constraint-ladder rung> }`. The visible-milestone slice and the final slice also carry the standing charter-scenario AC (step 6b) when `02-shape.md` has a `## Charter Scenario`.
- `## Dependencies on Other Slices` — `<other-slice-slug>`: what this slice needs from it.
- `## Risks`.

Then author free narrative fragments for any beat the structured page cannot tell, per [_fragment-authoring.md](_fragment-authoring.md) **Step F2** (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

# Additive-write contract

Both `03-slice-index.md` and the per-slice `03-slices/<slice-slug>.md` are revisable. When `/wf slice` is re-invoked on an existing slug, follow [_additive-write.md](_additive-write.md) for every file that will be rewritten: snapshot, **rewrite the body to current truth**, add one ledger entry.
- Snapshots in `.ai/workflows/<slug>/history/`: `03-slice-index-<rev>.md` for the index; `slices/<slice-slug>/history/03-slice-<rev>.md` for per-slice files.
- **Ledger entry** per rewritten file: `trigger: scope-change` (default) or `new-slice` when slices were added; `because:` names why the slicing changed; `changed:` names what moved.
- **New slices added in this run** start fresh: no prior revision, no history snapshot, `revision-count` 1.
- **Removed slices** stay in storage: mark the frontmatter `status: dropped` with a `dropped-reason:` field and append a final `## Dropped — <ISO>` section. Deleting a slice file from disk is reserved for explicit `/wf status` reconcile operations, which the renderer surfaces with a tombstone view.

The renderer aggregates per-slice history into the slug overview's prior-revisions block; the slice-grid figure reflects current slice status across the slug, including dropped slices (rendered in `--blocker` with a strikethrough).
