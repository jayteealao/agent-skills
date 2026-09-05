# Product-owner question batches (Step 3 of `intake/default.md`)

Ask focused product-owner questions in two batches: substance first (Batch B), process second (Batch A). The process answers (branch, appetite) are far better informed after the PO has described the work, so the historical batch labels stay but the ORDER is B → A.

**Batch B — Freeform substance questions (in chat — ASK THESE FIRST):**
Ask freeform questions covering the areas below. 2–5 is typical, but the count is need-driven, not fixed: keep asking (in small batches, building on earlier answers) while the desired outcome is vague, a success criterion is not yet falsifiable, or a mentioned constraint is uncaptured, and stop the moment those are pinned down. Never pad to reach a count; park anything the PO cannot answer now in `open-questions` (`status: awaiting-input`) instead of pressing. **Ground questions in the Step 0.7 research findings where relevant**: "the code already has X — does this request replace it or extend it?" beats asking the PO to describe what the code already answers. Cover:
- desired outcome and who benefits
- concrete success criteria
- explicit non-goals
- timeline, compliance, operational, or platform constraints
- already-decided technical constraints or vendor choices
- **stack confirmation** (always include this): summarize the Step 0.5 `stack:` block in one or two human-readable lines and ask: *"I detected this is a `<platforms>` repo using `<ui>` + `<build>`, with `<testing>` for tests and `<observability>` for logging. Available session tooling that looks relevant: `<top 3-5 skills/MCP by name>`. Anything missing, wrong, or off-limits for this task?"* Capture corrections word for word in `po-answers.md`. After the answer arrives, update the `stack:` block in `00-index.md` (add/remove entries to match reality) and set `stack.user-confirmed: true`. This is the descriptive contract: detection proposes, the PO disposes. Do **not** use the detected stack to recommend an implementation approach at this stage; that conversation belongs in shape.

**Batch A — Structured process questions (gate questions — asked AFTER Batch B):**
Ask these as gate questions per [_gate-question.md](../../_gate-question.md) (adjust based on what is already known from `$ARGUMENTS` and Batch B):
```
Question 1:
  question: "What branch strategy should this workflow use?"
  header: "Branch"
  options:
    - label: "Dedicated (Recommended)"
      description: "New feature branch, PR at handoff, rebase+merge at ship. Best for tracked, reviewable work."
    - label: "Shared"
      description: "Commits on current branch, no PR created. Good for quick fixes on an existing branch."
    - label: "None"
      description: "No git management. Workflow artifacts only, you handle commits yourself."
  multiSelect: false

Question 2:
  question: "What is the appetite for this work?"
  header: "Appetite"
  options:
    - label: "Small"
      description: "A few hours. Single file or minor change. No slicing needed."
    - label: "Medium"
      description: "A day or two. Multiple files, may benefit from slicing."
    - label: "Large"
      description: "Multiple days. Definitely needs slicing and incremental delivery."
  multiSelect: false
```
Record the appetite answer as `appetite:` in `00-index.md` frontmatter; it is machine-read downstream (shape scales its pre-mortem horizon by it; slice reads it for slice-count expectations; plan's consult trigger keys off it).

**Review scope is NOT asked here:** the PO cannot judge review layout before slicing exists. `00-index.md` carries the provisional default `review-scope: per-slice` with `review-scope-confirmed: false`; `slice` asks the PO once the roster is known (`plan` asks instead on the skip-to-plan path that bypasses slice).

If the user chose "Dedicated" for branch strategy, follow up (in chat or as a second gate question) for:
- Preferred branch name (default: `feat/<slug>`)
- Base branch (default: `main` or `master`, whichever exists)
