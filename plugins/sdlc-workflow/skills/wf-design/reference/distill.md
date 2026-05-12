> **Additional context needed**: user's primary task and what they need most.

Reduce a UI to its essential elements — removing complexity, decoration, and noise while preserving everything that serves the user's actual needs.

---

## Register

Brand: distill means finding the irreducible core of the brand expression. What is the one thing this page must communicate? Every element either serves that or gets cut.

Product: distill means stripping the interface to the minimum required for the task. A user should be able to complete their primary task without encountering anything that isn't directly relevant.

---

## Philosophy

Distill is not minimalism for aesthetic reasons. It is the relentless removal of everything that doesn't earn its place. If removing an element requires explanation ("but what if the user needs…"), the element might earn its place. If removing it makes no practical difference, it was always noise.

The question for every element: "If this wasn't here, what would break or be worse?" If the answer is "nothing," remove it.

## Step 1: Inventory the current elements

List every element in the UI:
- Text elements (headings, labels, body copy, helper text)
- Interactive elements (buttons, inputs, links, toggles)
- Structural elements (cards, panels, dividers, containers)
- Decorative elements (icons, illustrations, backgrounds, borders)

## Step 2: Classify by necessity

For each element, classify:
- **Essential**: directly serves the user's primary task — cannot be removed
- **Contextual**: provides information the user needs sometimes — consider progressive disclosure
- **Decorative**: visual only, no information value — candidate for removal
- **Redundant**: the same information conveyed by another element — remove one

## Step 3: Apply progressive disclosure

For contextual elements (needed sometimes, not always):
- Hide behind expand/collapse
- Move to a detail panel or tooltip
- Show only in the relevant state (error text only when there's an error)

## Step 4: Remove decorative noise

Remove or simplify:
- Borders that separate elements that don't need separation (whitespace does this better)
- Background fills on cards where content structure already creates the boundary
- Icon + label where label alone is sufficient
- Headings that repeat what the current context already communicates
- Inline explanatory text that users after the first visit will never read again

## Step 5: Simplify interactions

- Combine multi-step flows where steps can be collapsed
- Remove confirmation dialogs for non-destructive reversible actions
- Replace modal dialogs with inline editing where possible
- Replace multi-choice selection with sensible defaults + optional override

## Validate

After distilling:
- Does the user's primary task flow without obstruction?
- Is anything missing that was removed?
- Does the reduced design still communicate the essential brand intent?
- Is the result simpler, or just emptier?

## Never
- Removing elements that are essential for rare-but-critical cases (error states, accessibility affordances)
- Distilling for aesthetic minimalism at the cost of usability
- Hiding information that users need without providing a clear path to find it
- Removing redundancy that serves accessibility (visual + text labels together)
