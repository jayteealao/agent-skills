---
description: Break a shaped work item into thin, independently verifiable vertical slices. Writes a master index and one file per slice.
argument-hint: <slug> [focus area]
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a MANDATORY gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `wf-slice`, **stage 3 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → `3·slice` → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `01-intake.md`, `02-shape.md` |
| Conditional inputs (mandatory when present) | `02b-design.md` (design brief — states, edge cases, surfaces MUST inform slice boundaries); `02c-craft.md` (visual contract — distinct visual surfaces in the mock fidelity inventory MUST be reflected in slice boundaries; see Step 0.5 for the per-surface justification escape hatch when surfaces are intentionally grouped) |
| Produces | `03-slice.md` (master index) + `03-slice-<slice-slug>.md` per slice |
| Next | `/wf plan <slug> <best-first-slice>` (default) |
| Alt | `/wf plan <slug> all` to plan all slices in parallel |

> **Optional second opinion.** Once `03-slice.md` is drafted (before adaptive
> routing), you may offer `/consult <critique this slice decomposition —
> independence, ordering, any risky slice buried mid-sequence>` (or `/consult
> <provider> …`) — a read-only multi-model panel that pressure-tests the
> decomposition before rework gets expensive. Model may self-run when clearly valuable (pin `codex`/`claude`); otherwise just offer it.

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT start planning implementation details, writing code, or designing architecture.
- Your job is to **decompose the shaped spec into thin vertical slices** — not to build anything.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start solving the problem, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - `01-intake.md` and `02-shape.md` must exist. If missing → STOP. Tell the user which command to run first (e.g., "Run `/wf shape <slug>` first.").
   - If `02-shape.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve the open shape questions first.
   - **Stack gate (do NOT silently re-detect):** Inspect the `stack:` block in `00-index.md`.
     - If the block is **missing entirely** → STOP. Tell the user: "Step 0.5 stack fingerprint is missing from `00-index.md`. Re-run `/wf intake <slug>` to capture it; that step is the source of truth for downstream tooling decisions." Do NOT attempt to re-detect the stack here — slice is not the place for that, and silent re-detection would diverge from intake's user-confirmed truth.
     - If `stack.user-confirmed: false` → WARN: "`stack:` was auto-detected but the PO has not confirmed it. Slicing decisions that depend on tooling/platform (e.g., which surfaces ship together) may be wrong. Re-run intake's Batch B confirmation, or proceed and accept the risk?" Use AskUserQuestion if available. If the user proceeds, treat the unconfirmed stack as advisory only — do not let it drive slice boundaries.
     - If `stack.user-confirmed: true` → proceed. The slice strategy MAY reference confirmed platforms/tooling to justify groupings, but MUST NOT introduce new tooling assumptions beyond what's in `stack:`.
   - If `current-stage` in the index is already past slice → WARN: "Stage 3 (slice) has already been completed. Running it again will overwrite slice files. Proceed?"
4. **Read** `01-intake.md`, `02-shape.md`, and `po-answers.md`.
5. **Read design artifacts — mandatory when present** (file existence is optional; consumption is required):
   - `02b-design.md` — **mandatory when present.** If the file exists, you MUST read it and slice boundaries MUST reflect its content. Extract the content inventory, state list (empty/error/loading/first-run), and visual direction. State transitions (e.g., empty state vs populated state) and visual surface boundaries (e.g., main view vs settings drawer) MUST inform slice boundaries — either each distinct state/surface gets its own slice, or the master `03-slice.md` `## Slice Strategy` MUST justify the grouping with one sentence per state/surface.
   - `02c-craft.md` — **mandatory when present.** If the file exists, you MUST read it and the resulting slice boundaries MUST honor it. Extract the `## Mock fidelity inventory` and any per-surface notes. Distinct visual surfaces (e.g., card vs detail vs drawer) and signature interactions MUST be reflected as slice boundaries — either each surface gets its own slice, or the master `03-slice.md` `## Slice Strategy` MUST explicitly justify (with one sentence per surface) why surfaces were grouped into a shared slice. Do NOT re-decompose around token choices, motion specs, or implementation details — those belong to plan/implement. If 02c-craft introduces surfaces or states not present in the shape or 02b-design, surface that as an open question on the master index rather than silently expanding scope.
   - **State-completeness knowledge (design consumer — when `stack.ui ≠ ∅`).** `slice` *structures around* the design: the brief's state inventory (empty / error / loading / first-run) and the contract's mock-fidelity inventory are candidate slice boundaries — a state or visual surface that carries its own acceptance criteria usually earns its own thin slice. To recognize which states are substantive enough to slice (rather than fold in), load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/design/onboard.md` (empty / first-run states) and `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/design/polish.md` (the 7-state completeness checklist); also load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/design/_design-context.md` for the register and absolute bans — the design floor that holds even when no `02b`/`02c` design artifact exists (a UI feature sliced without `/wf design`). This is structuring, not redesigning — never re-do design work here. Gate: if the `00-index.md` `stack:` block shows no UI layer (`stack.ui` empty), skip the design-knowledge load entirely; non-UI work is unaffected.
   - If neither file exists, skip this step and proceed normally.
6. **Carry forward** `selected-slice-or-focus` and `open-questions` from the index.

# Purpose
Break a shaped work item into thin, independently verifiable vertical slices. Write a master slice index and one detailed file per slice.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time. Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Use AskUserQuestion** for multiple-choice PO questions (structured decisions, confirmations). Use freeform chat for open-ended questions. Construct every question per [_question-craft.md](_question-craft.md). Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Use parallel Explore/subagents for multi-domain research. Do not spin up subagents for trivial work.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.
- **Conditional inputs are mandatory when present.** If a file in this command's *Conditional inputs* row exists on disk, read it and honor it in the output — existence is optional, consumption is required; silent omission is a contract violation.

# Chat return contract
After writing files, return per [_chat-return.md](_chat-return.md) — narrative lead in the artifact's `## The Slices` story voice, then this receipt:
- `slug: <slug>`
- `wrote: <paths>` (list all slice files written)
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

# Per-slice file pattern
Every slice gets its own file: `03-slice-<slice-slug>.md`. The slice-slug is a lowercase kebab-case identifier derived from the slice name (e.g., "Auth Flow" → `auth-flow`).

The master `03-slice.md` is an **index** that links to each per-slice file and contains cross-cutting information.

Do this in order:
1. **Discovery phase — ask about slicing strategy before cutting.**
   Interview the user with 4–8 questions in 1–2 rounds using AskUserQuestion before finalizing slice boundaries.

   **Rules:**
   - Every question must be about *how to decompose this specific feature* — reference concrete parts of the shaped spec, not abstract slicing theory.
   - Questions must be impartial — present genuinely different decomposition strategies without favoring one.
   - Skip questions already answered in the shape or intake artifacts.
   - Construct each question per [_question-craft.md](_question-craft.md) — decomposition tradeoffs (thin slices vs. chunked, rollout coupling) are technical; describe options by what the PO experiences (more PRs and faster feedback vs. fewer review passes), not by mechanism.

   **What to ask about:**
   - **Delivery order preferences** — Does the user want the riskiest part first or the most visible part first? Is there a demo date, milestone, or dependency that should drive which slice ships earliest?
   - **Slice granularity** — Should slices be as thin as possible (more PRs, faster feedback) or chunked into larger coherent units (fewer context switches, less integration overhead)? What's the team's review capacity?
   - **Rollout coupling** — Can slices ship independently to production, or do some need to land together? Are there feature flags, migrations, or API contracts that force certain things to be in the same slice?
   - **Scope cuts** — Are there parts of the shaped spec the user would consider deferring entirely? Which acceptance criteria are must-have-now vs. nice-to-have-later?

   Append every answer to `po-answers.md` with timestamp and `stage: slice`.

2. Run freshness research only where external constraints affect slicing or order.
3. Break the work into small vertical slices that can be implemented and verified independently.
4. Assign each slice a **slice-slug** (lowercase kebab-case).
5. Put risk-reduction and uncertainty-reduction early.
6. Identify the best first slice.
7. **Write one `03-slice-<slice-slug>.md` per slice** (see template below).
8. **Write the master `03-slice.md`** (see template below) with links to every per-slice file.
9. **Evaluate adaptive routing** (see below) and write ALL viable options into the master file's `## Recommended Next Stage`.
10. Update `00-index.md` with the recommended default option and add all slice files to `workflow-files`.

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the slices and present the user with ALL viable options:

**Option A (default): Plan best-first slice** → `/wf plan <slug> <best-first-slice-slug>`
Use when: Standard flow. Work through slices one at a time, starting with the highest-risk or highest-value slice.

**Option B: Plan all slices in parallel** → `/wf plan <slug> all`
Use when: Slices are independent enough that planning them all upfront is efficient.

**Option C: Revisit Shape** → `/wf shape <slug>`
Use when: Slicing revealed that the spec is too vague, contradictory, or missing key information to decompose properly.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

---

# AC verifiability discipline (author the verification path WITH the AC — MANDATORY)

A user-observable acceptance criterion is not finished being authored until you can name *how* it will be observed. This is the highest-leverage place to prevent the "verified but actually broken" leak: an AC born without a verification path becomes a verify-time wall the model rationalizes past with a static-reasoning `pass` or a bare "no emulator" deferral. Decide verifiability **here**, where re-scoping an AC is cheap — not at verify, where the only exits are a false pass or an honest stall.

For **every** acceptance criterion you write into a per-slice file:

1. **Partition it — `observable:` is a justified feasibility decision, not a bare label.** Tag each criterion `<!-- observable: true -->` or `<!-- observable: false -->` immediately after its text. `verify` reads this tag and it MUST be set here at authoring time, never discovered at verify. `observable: true` = a user would see or experience the outcome (a rendered surface, a navigation, a command's output). `observable: false` = the outcome is fully provable by an automated assertion with no live runtime (e.g., "the util handles null input"). When you mark an AC `observable: true`, **name the tool that will observe it** in one line. When you mark it `observable: false`, you are claiming an existing or cheap automated test fully covers it — be honest, because `false` suppresses the runtime gate downstream.

2. **Attach a verification-plan stub to every `observable: true` AC.** Inline, right under the criterion:
   ```
   - Given a phone viewport When the board loads Then the carousel is single-column with a tap action sheet at 375px
     <!-- observable: true -->
     verify: { method: playwright, env: 375x812 viewport (install-playwright if absent), fixture: seeded-board, rung: web-1 }
   ```
   `method` = the tool/technique that observes it; `env` = the target environment and whether anything must be installed or booted (this is what `plan` turns into an authorized bootstrap step, so a missing tool is surfaced now, not at verify); `fixture` = the seed data or deterministic state the AC needs to be observable; `rung` = the constraint-resolution-ladder rung you expect to land on (see [runtime-adapters.md](runtime-adapters.md) → *Constraint-resolution ladder*). The stub is a sketch, not the final plan — `plan`'s `## Verification Strategy` engineers it — but writing it now forces the feasibility question while the AC can still be re-scoped cheaply.

3. **Ban un-plannable user-observable ACs.** If you cannot name any method/tool/env that would observe an `observable: true` AC in the target environment, do **one** of these — never author it and "decide later":
   - **re-scope** the AC to an observable proxy that *can* be verified in the target environment, or
   - **pre-register the deferral now** — state the constraint at birth (e.g., "operator session required: prod OAuth credentials"), so it is a logged decision the PO agreed to, not a verify-time surprise papered over with a `pass`.

4. **Name every architectural mechanism in the artifact body.** Any architectural mechanism named in an AC, a verification method, or a `verify:` test-plan line — a state machine, scheduler, queue, cache, pipeline, orchestrator, or controlling regex — MUST exist as a named decision in this slice's body: one sentence stating the mechanism, what it replaces, and why. A mechanism that enters only through a test method is a design decision smuggled past review; name it in the body or drop it from the AC. (Mirrors shape's AC-authoring rule.)

This discipline is what `plan` (`## Verification Strategy`) and `verify` (the user-observable AC gate) both build on. Getting it right here is cheaper than every downstream stage that inherits a bad AC.

---

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

# Slice Index

## The Slices
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Voice per `_narrative-voice.md` — no "This slice breakdown implements…" openings. 1–4 short paragraphs. -->

## Slice Strategy

## Recommended Order
1. `<slice-slug>` — [reason]
2. `<slice-slug>` — [reason]

## Cross-Cutting Concerns
- ...

## Dependencies Between Slices
- ...

## Deferred / Optional Slices
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `/wf plan <slug> <best-first-slice-slug>` — [reason]
- **Option B:** `/wf plan <slug> all` — plan all slices in parallel [reason, if applicable]
- **Option C:** `/wf shape <slug>` — revisit shape [reason, if applicable]

---

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

# Slice: <slice-name>

## The Slice
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Voice per `_narrative-voice.md` — no "This slice implements…" openings. 1–4 short paragraphs. -->

## Goal

## Why This Slice Exists

## Scope
- what's in
- what's out (handled by other slices)

## Acceptance Criteria
<!-- Author each AC WITH its verification path — see "AC verifiability discipline" above. Tag every criterion `observable:` (a justified feasibility decision), and attach a `verify:` stub to every `observable: true` one. A user-observable AC with no nameable verification method is re-scoped or pre-registered as a deferral here — never authored to "decide later". -->
- Given ... When ... Then ...
  <!-- observable: true|false — one-line justification of the partition -->
  verify: { method: <tool/technique>, env: <target env / what must be installed or booted>, fixture: <seed data / deterministic state>, rung: <constraint-ladder rung> }   ← only for observable: true

## Dependencies on Other Slices
- `<other-slice-slug>`: what this slice needs from it

## Risks
- ...

---

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

---

## Additive-write contract (v9.20.1+)

Both `03-slice-index.md` and per-slice `03-slices/<slice-slug>.md` are
revisable. When `/wf slice` is re-invoked on an existing slug, follow the
shared additive-write contract in [_additive-write.md](_additive-write.md)
for every file that will be rewritten — snapshot, **rewrite the body to current
truth**, add one ledger entry:

- Snapshots in `.ai/workflows/<slug>/history/`: `03-slice-index-<rev>.md` for
  the index; `slices/<slice-slug>/history/03-slice-<rev>.md` for per-slice
  detail files.
- **Ledger entry** per rewritten file: `trigger: scope-change` (default) or
  `new-slice` when slices were added, `because:` naming why the slicing changed,
  `changed:` naming what moved.

Stage-specific additions:

1. **New slices added in this run** start fresh — they have no prior revision
   and no history snapshot. Their `revision-count` begins at 1 (no ledger yet).
2. **Removed slices** stay in storage. Mark their frontmatter
   `status: dropped` with a `dropped-reason:` field and append a final
   `## Dropped — <ISO>` section to the body. Removal of a slice file from
   disk is reserved for explicit `/wf status` reconcile operations that the
   renderer surfaces with a tombstone view.

The renderer aggregates per-slice history into the slug overview's
prior-revisions block. The slice-grid figure-canvas reflects the current
slice status across the whole slug, including dropped slices (rendered in
`--blocker` with a strikethrough).

