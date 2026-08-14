---
description: "Extension mode of intake — add net-new slices to an existing workflow (in-progress, complete, or closed) without modifying completed work. Auto-routed when `$wf intake <existing-slug> <new scope>` names a real on-disk slug followed by free scope text (no mode keyword). Two seeds: general (describe new scope) or from-review/from-retro (seed from findings). Writes full per-slice files and updates the master index non-destructively, then routes to `$wf plan` for the new slices."
argument-hint: <existing-slug> [from-review | from-retro | from-probe | from-simplify | <new scope description>]
---

You are running **intake in extension mode** — the auto-routed path when `$wf intake <existing-slug>`
is followed by free scope text (or nothing, or `from-review`/`from-retro`) rather than a mode keyword.
Extension is a **scope-expansion** flow: it adds net-new slices to an existing workflow — whether
in-progress, fully complete, or closed — **without touching any existing slice artifact**.

> The External Output Boundary, the narrative-fragment tier, and the workflow-registry/slug
> semantics come from `_intake-context.md`, which the `intake` dispatcher loaded before this
> reference. Do not restate or fork those rules here.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

Extension is a **utility flow**, not a pipeline stage. It adds net-new slices; it does **not** correct
existing slices (corrections are a *new* slice or `$wf intake <slug> fix`, never an in-place amend of
built work) and does **not** fix implementation bugs (use `$wf implement`).

| | Detail |
|---|---|
| Requires | `00-index.md`, `03-slice.md` (master index) |
| Produces | New `03-slice-<new-slug>.md` files + updated `03-slice.md` (non-destructive append) |
| Does NOT modify | Any `03-slice-<slug>.md` file with `status: complete` or `status: in-progress` |
| Next | `$wf plan <slug> <new-slice-slug>` for each new slice |

> **Not a compressed slice.** Extension writes **full** `03-slice-<new-slug>.md` files — the
> `_compressed-slice.md` override does **not** apply here (it governs the *mode-keyword* slug-mode
> flows: `fix`/`rca`/`hotfix`/…). The `intake` dispatcher routes extension around that override.

# CRITICAL — execution discipline
You are a **scope expander**, not a problem solver.
- Do NOT modify any existing slice files.
- Do NOT change `status: complete` entries in `03-slice.md`.
- Do NOT write implementation code or plans.
- Your job is: **orient → extract new scope → interview → write new slice files → update index**.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

---

# Step 0 — Orient (MANDATORY)

1. **Resolve the slug.** The `intake` dispatcher consumed the existing on-disk slug as `<slug>` (an
   exact `.ai/workflows/<slug>/00-index.md` match) before routing here — use it. (If you somehow
   arrive with no slug, infer the most recent active workflow from `.ai/workflows/*/00-index.md`; if
   ambiguous, ask the user directly in chat, presenting options as a short numbered list.)
2. **Resolve the seed** from the remaining `$ARGUMENTS`:
   - `from-review` — extract new scope from `07-review-*.md` findings (every per-slice review file is
     read; missing capability typically spans slices).
   - `from-retro` — extract new scope from `10-retro.md` findings.
   - `from-probe` — extract new scope from the workflow's probe slices (`03-slice-probe-*.md`):
     findings whose remediation is net-new capability rather than a fix of built work.
   - `from-simplify` — extract new scope from `$wf simplify` findings routed here (the finding
     entry — id, files, rationale, severity — travels in the invocation text).
   - **Free scope text** (or nothing) — general extension; the user describes the new scope (the free
     text after the slug is your starting description; if empty, the Step 2 interview elicits it).
3. **Read `00-index.md`** — parse `title`, `slug`, `current-stage`, `status`, `selected-slice-or-focus`, `workflow-files`, `workflow-type`.
3b. **Shape pre-flight (entry guard).** Extension requires a slice roster, and the dispatcher's
   branch 2 routes ANY on-disk slug here — including workflows that cannot have one. Check before
   reading further:
   - **Terminal analysis parent** (`workflow-type: rca` / `discover` / `investigate` / `ideate`) —
     there is no roster and never will be. STOP: *"`<slug>` is a `<type>` analysis workflow — it has
     no slice roster to extend. Route its decision instead: record the pick/route (`$wf intake
     <type> <slug> …`) or start the follow-on work with `$wf intake "<scope>" from <slug>`."*
   - **Pre-slice standard parent** (no `03-slice.md` on disk yet) — the workflow has not reached
     slicing. STOP: *"`<slug>` has no slice roster yet (stage: `<current-stage>`). Fold the new
     scope into the normal path instead: run `$wf shape <slug>` / `$wf slice <slug>` (its
     `next-invocation`), which absorbs the scope without an extension round."*
4. **Read `03-slice.md`** — parse the `slices:` array. For each entry, note its `slug`, `status`, and `depends-on`. This is the existing slice inventory — it must not be broken.
5. **Read all `03-slice-<slug>.md` files** referenced in `workflow-files`. Note which are `status: complete`, `status: in-progress`, `status: defined`.
6. **Read source artifacts** based on seed:
   - `from-review`: search and read every `07-review-*.md` file in the workflow directory (one per reviewed slice). Aggregate full findings, triage decisions, and recommendations across all of them — extension candidates often emerge from siblings' reviews.
   - `from-retro`: read `10-retro.md` — action items, follow-up work, tech debt.
   - General: read `02-shape.md` and `po-answers.md` for context about the original scope.
7. **Summarise current state to chat:**
   ```
   Workflow: <title> (<slug>)
   Stage: <current-stage> | Status: <status>
   Existing slices: <N> (<N-complete> complete, <N-in-progress> in-progress, <N-defined> defined)
   Extending with: <free scope text, or "from-review" / "from-retro">
   ```

---

# Step 1 — Extract New Scope

Depending on the seed:

## `from-review` seed

Read every `07-review-<slice-slug>.md` file → `## Recommendations` and `## Triage Decisions` of each. Identify findings that represent **missing capability** rather than implementation bugs (note which source slice flagged each candidate):

Signs that a finding warrants a new slice (not a bug fix):
- Finding says "this feature should also do X, but X was never scoped"
- Finding describes a gap in the system that requires new code paths, not correction of existing ones
- Multiple related findings that together describe an unimplemented capability
- Finding tagged as `defer` (deferred findings often become extension scope)
- Finding describes a non-functional requirement (performance, security, scalability) that requires architectural additions

Signs that a finding is a bug fix, NOT extension scope:
- Finding points to incorrect logic, wrong output, missing validation
- Finding references code that already exists but is broken
- Finding is about how something works, not what it is missing

Extract qualifying extension candidates. Group related findings into candidate slices. Summarise each candidate:
- What new capability is needed
- Which existing slice(s) it relates to (context, not modification)
- Why it can't be addressed in an existing slice fix
- Rough complexity estimate (xs/s/m/l/xl)

If no qualifying findings exist, do not STOP — say so and fall back to the general interview: "Review findings are all implementation bugs — no new scope emerged from them (fix those via `$wf implement <slug> <slice-slug>`). Describe the new scope you want to add, or reply `cancel`." On `cancel`, stop; otherwise proceed with the general seed.

## `from-retro` seed

Read `10-retro.md`. Extract action items, follow-up work, tech debt items, and "what we'd do differently" sections that imply new development work. Group into candidate slices.

## General seed

The user's free scope text (if any) is the starting description; the Step 2 discovery interview sharpens it into precise slices. If no text was given, the interview elicits the scope from scratch. Proceed directly to the interview.

---

# Step 2 — Discovery Interview

Ask 4–8 targeted questions directly in chat (up to 4 per round) to define the new slices precisely.

**What to ask about — generate questions specific to this workflow's artifacts and the extracted candidates:**

- **What new work needs doing?** (General seed only) — Sharpen the user's scope text. What capability is missing? What problem does it solve that the original slices didn't address? Reference the original shape to anchor the question.
- **Slice grouping** — For each candidate (from-review/from-retro) or for the described new work: should this be one slice or multiple? Ask by referencing the candidate content and the size/complexity tradeoff.
- **Insertion position** — Should new slices come after all existing slices, or should they be interleaved? Are there dependencies on existing slices that constrain order? Ask specifically about dependencies on in-progress or defined (not yet implemented) slices.
- **Priority among new slices** — If multiple new slices are added, which should be planned and implemented first? Ask whether this is driven by risk, value, dependency, or timeline.
- **Scope boundaries** — For each new slice candidate, ask what is deliberately *not* in it. What gets deferred, left out, or handled by a subsequent slice?

Rules:
- Reference actual findings/retro items when asking about from-review/from-retro candidates
- Confirm proposed slice slugs with the user (propose readable kebab-case names)
- Ask about dependencies on existing slices explicitly — the user knows whether implementation ordering matters
- Append every answer to `po-answers.md` with timestamp and `stage: extend` (create the file with its standard header if the workflow predates it — a compressed-mode parent has none)

---

# Step 3 — Confirm New Slices (one confirmation)

Extension is additive by contract — it never modifies existing slices — so one confirmation is
enough. In the final interview round, present the proposed slices in one message: each slug, goal,
complexity, and depends-on, plus the sentence "Existing slices are not modified." Ask the user to
confirm. When the user requests changes, apply them and confirm the changed slices in the same
exchange. When the user declines, STOP.

---

# Step 3b — Intent-risk & charter delta (MANDATORY for the new scope)

New scope enters the lifecycle here without passing through `intake default` or `shape`, so this
step is where the intent-fidelity machinery covers it (v9.136.0 — before this, extended scope
carried zero RIM/charter tracking):

This step **computes** the deltas and holds them; **Step 6 is the single index writer** — nothing
here touches `00-index.md`:

1. **RIM delta.** For the confirmed new slices, ask: *what are the most likely ways this new scope
   could be misread?* (the same misreading pass `intake/default.md` Step 6a runs). Each distinct
   risk becomes a drafted `intent-risks` entry — extension has no downstream shape run to
   adjudicate, so author each entry **adjudicated in place**: the Step 2 interview IS the
   adjudication forum (`status: adjudicated`, `decision:` from the interview answer,
   `adjudicated-by: 03-slice-<new-slug>.md#risks`, `po-ratified: true` citing the `po-answers.md`
   entry). Leave an entry `open` ONLY when the interview genuinely could not resolve it — it must
   then appear in the new slice's `## Risks` and the drafted `open-questions` addition, and it will
   correctly hard-block handoff/ship until cleared.
2. **Charter delta.** If the new scope adds a load-bearing commitment the existing charter does not
   cover, draft the ledger addition (`C<next>`, `source:` the new slice file, `po-ratified: true` —
   the Step 3 confirm gate is the ratification). Do NOT rewrite or renumber existing commitments.
3. **Zero-delta escape.** If the new scope genuinely adds no misreading risk and no new commitment
   (a purely mechanical extension), state that in one line in the Extension Round section of
   `03-slice.md` — an explicit declaration, never a silent skip.

# Step 4 — Write New Slice Files

For each confirmed new slice, write `03-slice-<new-slug>.md`:

```yaml
---
schema: sdlc/v1
type: slice
slug: <slug>
slice-slug: <new-slug>
status: defined
stage-number: 3
created-at: "<ISO 8601>"
updated-at: "<ISO 8601>"
complexity: <xs|s|m|l|xl>
depends-on: [<existing-slice-slug-if-any>, ...]
source: <from-review | from-retro | from-probe | from-simplify | extension>
source-ref: <07-review-<slice-slug>.md | 10-retro.md | "user description">
extension-round: <N>  # 1 for the first extension on this workflow, 2 for the second, etc.
tags: []
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  source: <07-review-<slice-slug>.md | 10-retro.md | "">
  plan: 04-plan-<new-slug>.md
  implement: 05-implement-<new-slug>.md
---
```

# Slice: <slice-name>

## Goal

## Why This Slice Exists
Explain what motivated this extension — which review finding, retro item, or user decision created it. Reference the source artifact.

## Scope
- In: ...
- Out: ...

## Acceptance Criteria
- Given ... When ... Then ...

## Dependencies on Other Slices
- `<existing-slice-slug>`: what this slice needs from it

## Risks
- ...

---

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](../_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

# Step 5 — Update Master Slice Index (non-destructive)

Read the current `03-slice.md`. Update it by:

1. **Incrementing `total-slices`** by the number of new slices added.
2. **Appending new entries** to the `slices:` YAML array — do NOT modify existing entries:
   ```yaml
   - slug: <new-slug>
     status: defined
     complexity: <xs|s|m|l|xl>
     depends-on: [<if-any>]
     source: <from-review | from-retro | from-probe | from-simplify | extension>
     extension-round: <N>
   ```
3. **Updating `updated-at`** to the current ISO 8601 timestamp.
4. **Appending a new section** to the markdown body:

```markdown
## Extension Round <N> — <ISO date>
Source: <from-review | from-retro | from-probe | from-simplify | user request>

### New Slices Added
| Slice | Goal | Complexity | Depends On |
|-------|------|------------|------------|
| `<new-slug>` | <one-line goal> | <size> | <deps or —> |

### Motivation
<Why these slices were added — what the review/retro/user said that created this scope.>
```

5. **Reconciling author-written counts in the existing body.** The markdown body the slice stage wrote carries author-facing slice numbers that the rendered view prints **verbatim** — they do NOT recompute from the roster, so they go stale the moment `total-slices` grows. Two spots:
   - **Any summary sentence stating a slice total** (e.g. "These 5 slices cover…") — update the number to the new total so the prose agrees with the header, figure, and metric row (which are all roster-derived and already correct).
   - **The `## Recommended Order` list** — append the new slices as *additional* numbered entries (continue the numbering; do NOT renumber, reorder, or remove existing lines), each with a one-line reason, so the order reflects the full set.
   This is the only edit you make to existing body text, and it is purely clerical — correcting a stale count and extending a list. It is NOT a change to existing slice entries, slice files, or `status: complete` rows.

Do NOT modify any existing slice entries in the `slices:` array. Do NOT change `status: complete` on done slices. (Item 5 above touches only author-written prose, never the roster.)

---

# Step 6 — Update Index (the single authoritative index write)

This is the ONE step that writes `00-index.md` — everything earlier only computed. Read the
frontmatter and apply, additively:

1. `updated-at` → current ISO 8601 timestamp.
2. Append all new `03-slice-<new-slug>.md` files to `workflow-files`.
3. Append the Step 3b **RIM delta** entries to `intent-risks` and the **charter delta** entries to
   the `charter` ledger (never rewrite or renumber existing entries); append any `open` risk to
   `open-questions`.
4. **Re-point the forward pointers at the new work:** set `next-command: wf-plan` and
   `next-invocation: "$wf plan <slug> <first-new-slice-slug>"`; if `03-slice.md` carries
   `best-first-slice` and every prior slice is complete/skipped, set it to the first new slice.
   Without this, `$wf status` and resume point at an already-done slice.
5. **Revive a complete/closed parent:** extension means the workflow has live work again. If
   `status` is `complete` or `closed`, set `status: active` and `current-stage: slice` (leave
   `close-reason`/`closed-at` in place as history — the revival is visible, not erased).
6. **Registry row:** update the slug's row in `.ai/workflows/INDEX.md` (`status`, `updated-at`) to
   match.

Do NOT change `selected-slice-or-focus` or any field not listed above.

---

# Chat return contract
Return per [_chat-return.md](../_chat-return.md) — narrative lead (what this extension added, key decisions and counts, top risk), then this receipt:
- `slug: <slug>`
- `wrote:` list of new slice files written, plus `03-slice.md` (updated)
- `new-slices:` list of new slice slugs with one-line goals
- `extension-source:` from-review | from-retro | user request
- `options:`
  - `$wf plan <slug> <first-new-slice-slug>` — plan the first new slice (default)
  - `$wf plan <slug> all` — if you want to plan all new slices in parallel
  - `$wf status <slug>` — see full workflow state including all slices
- ≤2 bullets noting dependency ordering if new slices depend on existing in-progress work
