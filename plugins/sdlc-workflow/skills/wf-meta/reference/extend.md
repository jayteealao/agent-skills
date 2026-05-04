---
description: "Add net-new slices to an existing workflow — in-progress or completed — without modifying completed work. Two modes: general (describe new scope) or from-review/from-retro (seed from findings). Creates new slice files and updates the master index non-destructively. Routes to wf-plan for the new slices."
argument-hint: <slug> [from-review | from-retro]
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-extend`, a **scope expansion utility** for the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

This is a **utility command**, not a pipeline stage. It adds net-new slices to any workflow — whether in-progress or fully complete — without touching existing slice artifacts. It does NOT correct existing slices (use `/wf-meta amend`) and does NOT fix bugs in existing implementation (use `/wf-implement`).

| | Detail |
|---|---|
| Requires | `00-index.md`, `03-slice.md` (master index) |
| Produces | New `03-slice-<new-slug>.md` files + updated `03-slice.md` (non-destructive append) |
| Does NOT modify | Any `03-slice-<slug>.md` file with `status: complete` or `status: in-progress` |
| Next | `/wf-plan <slug> <new-slice-slug>` for each new slice |

# CRITICAL — execution discipline
You are a **scope expander**, not a problem solver.
- Do NOT modify any existing slice files.
- Do NOT change `status: complete` entries in `03-slice.md`.
- Do NOT write implementation code or plans.
- Your job is: **orient → extract new scope → interview → write new slice files → update index**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.

---

# Step 0 — Orient (MANDATORY)

1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, use AskUserQuestion to list options.
2. **Resolve the mode** from `$ARGUMENTS` (second argument, if present):
   - `from-review` — extract new scope from `07-review-*.md` findings (every per-slice review file is read; missing capability typically spans slices)
   - `from-retro` — extract new scope from `10-retro.md` findings
   - Nothing — general extension (user will describe new scope)
3. **Read `00-index.md`** — parse `title`, `slug`, `current-stage`, `status`, `selected-slice-or-focus`, `workflow-files`.
4. **Read `03-slice.md`** — parse the `slices:` array. For each slice entry, note its `slug`, `status`, and `depends-on`. This is the existing slice inventory — it must not be broken.
5. **Read all `03-slice-<slug>.md` files** referenced in `workflow-files`. Note which are `status: complete`, `status: in-progress`, `status: defined`.
6. **Read source artifacts** based on mode:
   - `from-review`: glob and read every `07-review-*.md` file in the workflow directory (one per reviewed slice). Aggregate full findings, triage decisions, and recommendations across all of them — extension candidates often emerge from siblings' reviews.
   - `from-retro`: read `10-retro.md` — action items, follow-up work, tech debt
   - General: read `02-shape.md` and `po-answers.md` for context about the original scope
7. **Summarise current state to chat:**
   ```
   Workflow: <title> (<slug>)
   Stage: <current-stage> | Status: <status>
   Existing slices: <N> (<N-complete> complete, <N-in-progress> in-progress, <N-defined> defined)
   ```

---

# Step 1 — Extract New Scope

Depending on mode:

## `from-review` mode

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

If no qualifying findings exist, STOP and tell the user: "Review findings are all implementation bugs — no new scope identified. Use `/wf-implement <slug> <slice-slug>` to fix them."

## `from-retro` mode

Read `10-retro.md`. Extract action items, follow-up work, tech debt items, and "what we'd do differently" sections that imply new development work. Group into candidate slices.

## General mode

The user will describe new scope in Step 2's discovery interview. Skip extraction — proceed directly to the interview.

---

# Step 2 — Discovery Interview

Ask 4–8 targeted questions using AskUserQuestion (up to 4 per round) to define the new slices precisely.

**What to ask about — generate questions specific to this workflow's artifacts and the extracted candidates:**

- **What new work needs doing?** (General mode only) — Ask the user to describe the new scope. What capability is missing? What problem does it solve that the original slices didn't address? Reference the original shape to anchor the question.
- **Slice grouping** — For each candidate (from-review/from-retro) or for the described new work: should this be one slice or multiple? Ask by referencing the candidate content and the size/complexity tradeoff.
- **Insertion position** — Should new slices come after all existing slices, or should they be interleaved? Are there dependencies on existing slices that constrain order? Ask specifically about dependencies on in-progress or defined (not yet implemented) slices.
- **Priority among new slices** — If multiple new slices are added, which should be planned and implemented first? Ask whether this is driven by risk, value, dependency, or timeline.
- **Scope boundaries** — For each new slice candidate, ask what is deliberately *not* in it. What gets deferred, left out, or handled by a subsequent slice?

Rules:
- Reference actual findings/retro items when asking about from-review/from-retro candidates
- Confirm proposed slice slugs with the user (propose readable kebab-case names)
- Ask about dependencies on existing slices explicitly — the user knows whether implementation ordering matters
- Append every answer to `po-answers.md` with timestamp and `stage: extend`

---

# Step 3 — Confirm New Slices

Before writing anything, present the proposed new slices for confirmation using AskUserQuestion:

- **header**: "Proposed new slices — confirm before writing"
- **question**: "This will add the following new slice(s) to workflow `<slug>`: [list each: slug, goal, complexity, depends-on]. Existing slices will not be modified. Proceed?"
- Options:
  - `Confirm` / label: "Confirm — create slices", description: "Write the new slice files"
  - `Revise` / label: "Revise", description: "I want to adjust the slice definitions"
  - `Cancel` / label: "Cancel", description: "Don't add any new slices"

If Revise, return to Step 2 with the feedback. If Cancel, STOP.

---

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
source: <from-review | from-retro | extension>
source-ref: <07-review-<slice-slug>.md | 10-retro.md | "user description">
extension-round: <N>  # 1 for first wf-extend call, 2 for second, etc.
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

# Step 5 — Update Master Slice Index (non-destructive)

Read the current `03-slice.md`. Update it by:

1. **Incrementing `total-slices`** by the number of new slices added.
2. **Appending new entries** to the `slices:` YAML array — do NOT modify existing entries:
   ```yaml
   - slug: <new-slug>
     status: defined
     complexity: <xs|s|m|l|xl>
     depends-on: [<if-any>]
     source: <from-review | from-retro | extension>
     extension-round: <N>
   ```
3. **Updating `updated-at`** to the current ISO 8601 timestamp.
4. **Appending a new section** to the markdown body:

```markdown
## Extension Round <N> — <ISO date>
Source: <from-review | from-retro | user request>

### New Slices Added
| Slice | Goal | Complexity | Depends On |
|-------|------|------------|------------|
| `<new-slug>` | <one-line goal> | <size> | <deps or —> |

### Motivation
<Why these slices were added — what the review/retro/user said that created this scope.>
```

Do NOT modify any existing slice entries. Do NOT change `status: complete` on done slices.

---

# Step 6 — Update Index

Read `00-index.md` frontmatter. Update ONLY:
- `updated-at` → current ISO 8601 timestamp
- Add all new `03-slice-<new-slug>.md` files to `workflow-files`

Do NOT change `current-stage`, `status`, `selected-slice-or-focus`, or any other field.

---

# Chat return contract
Return ONLY:
- `slug: <slug>`
- `wrote:` list of new slice files written, plus `03-slice.md` (updated)
- `new-slices:` list of new slice slugs with one-line goals
- `extension-source:` from-review | from-retro | user request
- `options:`
  - `/wf-plan <slug> <first-new-slice-slug>` — plan the first new slice (default)
  - `/wf-plan <slug> all` — if you want to plan all new slices in parallel
  - `/wf-meta status <slug>` — see full workflow state including all slices
- ≤2 bullets noting dependency ordering if new slices depend on existing in-progress work
