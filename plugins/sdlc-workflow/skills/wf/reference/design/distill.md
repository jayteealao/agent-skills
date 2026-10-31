> **Additional context needed**: the person's primary task and what they need most.

Reduce a UI to its essential elements. Remove complexity, decoration and noise. Keep everything that serves the real needs of the person.

---

## Design mode

Persuade: one offer and one working action. Every element serves that offer or goes.

Experience: cut the interface until the work leads.

Operate: cut to the task. A person completes the primary task without meeting anything that is not relevant. Density is a permission, not clutter.

Read: cut the chrome around the column. Never cut wayfinding.

---

## Philosophy

Distill is not minimalism for its look. It removes everything that does not earn its place. When a removal needs an explanation ("but what if the person needs…"), the element can earn its place. When a removal makes no practical difference, the element was always noise.

Ask of every element: "If this was not here, what would break or get worse?" When the answer is "nothing", remove it.

## Find the essence

Name the one primary goal of the surface. When the code and the brief do not show it, ask. Do not guess.

Simplicity does not remove features. It removes obstacles between the person and the goal.

## Step 1: Inventory the current elements

List every element in the UI:
- Text elements (headings, labels, body copy, helper text)
- Interactive elements (buttons, inputs, links, toggles)
- Structural elements (cards, panels, dividers, containers)
- Decorative elements (icons, illustrations, backgrounds, borders)

Count the variation: the colors, the sizes, the weights and the component variants. List each competing action and each extra path forward.

## Step 2: Classify by necessity

Classify each element:
- **Essential:** serves the primary task directly. Keep it.
- **Contextual:** gives information the person needs sometimes. Consider progressive disclosure.
- **Decorative:** visual only, with no information. A candidate for removal.
- **Redundant:** another element carries the same information. Remove one.

## Step 3: Apply progressive disclosure

For a contextual element:
- Put it behind an expand and collapse control.
- Move it to a detail panel or a tooltip.
- Show it only in its state (error text only when there is an error).

## Step 4: Remove decorative noise

Remove or simplify:
- Borders between elements that need no separation. Space separates them better.
- Background fills on cards where the content structure already makes the boundary.
- An icon beside a label when the label alone is enough.
- Headings that repeat what the context already says.
- Inline explanations that a person never reads again after the first visit.

## Step 4b: Simplify the system

- Remove each color, size and weight that has no distinct role.
- Use one spacing scale. Remove one-off gaps.
- Flatten nesting. Remove containers that carry no meaning.
- For each component, ask whether three variants cover most cases.
- Remove unused styles and components.

## Step 5: Simplify interactions

- Give each view one primary action. Make the common choice the default.
- Remove each step that the flow can lose. Combine steps that can collapse.
- Ask only for the fields that the first action needs.
- Remove confirmation dialogs for actions that are not destructive and can be undone.
- Replace a modal dialog with inline editing where you can.
- Replace a multiple choice with a sensible default and an optional override.
- For the words on each step, apply [clarify.md](clarify.md).

## Record removed complexity

For each removed item, write in the design note:
- the item and the reason for its removal;
- the new path to it, when people still need it;
- the signal to watch after release.

## Validate

After you distill:
- Does the primary task flow without obstruction?
- Does one element clearly lead?
- Is anything missing that was removed?
- Does the reduced design still carry the essential brand intent?
- Does the surface load faster?
- Is the result simpler, or only emptier?

## Never

- Removing an element that is essential in a rare but critical case (error states, accessibility affordances).
- Distilling for minimal looks at the cost of usability.
- Hiding information that people need without a clear path to it.
- Removing redundancy that serves accessibility (a visual and a text label together).
- Removing all hierarchy. Some things stand out.
- Simplifying a complex domain below the real complexity of the task.

## In the workflow

This file is a move. [_lane.md](_lane.md) → Moves says how each stage uses it.
Focus: reduction. Checks: the inventory, the classification and the Validate list. Notes record: the primary goal, each removed item with its reason, its new path and the signal to watch.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
