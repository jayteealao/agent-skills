> **Additional context needed**: user tasks and user context.

Improve the clarity and usability of a UI — reducing cognitive load, improving scannability, and making user tasks easier to accomplish.

---

## Register

Brand: clarity means the message is unmistakable. What does a visitor understand in the first 5 seconds? Is the value proposition clear without cognitive effort?

Product: clarity means task completion is efficient. Can a user who knows what they want to do find it quickly? Can they understand the current state without thinking?

---

## Diagnose the clarity problem

Identify which kind of clarity is failing:

**Visual clarity**: elements compete, hierarchy is flat, focal points are unclear.
**Informational clarity**: copy is too dense, labels are ambiguous, too many options at once.
**Navigational clarity**: it's not obvious where to go next or what the current state is.
**State clarity**: the system's current state (loading, empty, error, selected) isn't communicated clearly.

## Improve Visual Hierarchy

- Establish one clear primary action or message on the current view
- Remove secondary elements that are competing with the primary
- Use size, weight, and color to create 3 tiers: primary → secondary → tertiary
- Increase contrast between adjacent hierarchy levels (not just color — also size and weight)

## Reduce Cognitive Load

- Apply the 5-second rule: what does the user understand in 5 seconds? If it requires more, simplify.
- Cut: remove every element that doesn't directly support the user's primary task
- Chunk: group related elements, separate unrelated ones with consistent whitespace
- Label accurately: every UI label should say exactly what it does, no more

## Improve Scannability

Users scan before they read. Design for the scan path:
- Left-to-right, top-to-bottom in Western locales — the most important information anchors this path
- Use consistent visual patterns so repeated element types are recognized instantly
- Bullet lists, short paragraphs, and clear headings beat dense prose
- Tables beat stacked key-value pairs for comparative information

## Clarify States

Every interactive element needs to communicate its state without ambiguity:
- Empty states: explain why and what to do next (not just "nothing here")
- Loading states: communicate progress, expected duration, and what to expect when done
- Error states: say what went wrong, not just "an error occurred"
- Selected/active states: clearly distinct from unselected — not just a color change if color is the only signal

## Simplify the interface

- Remove decorative elements that add visual complexity without adding information
- Collapse progressive disclosure — reveal only what's needed at each step
- Replace icon-only controls with icon + label (or at minimum a tooltip) for infrequent actions
- Reduce form fields to the minimum required for the task

## Validate

After changes:
- Can a new user identify the primary action in 5 seconds?
- Is the current state of the system obvious at a glance?
- Are all labels unambiguous?
- Is there a clear hierarchy of attention?

## Never
- Removing elements for visual cleanliness at the cost of usability
- Hiding information that users will need in rare but important cases
- Clarity-through-whitespace without hierarchy (spacious + flat is still flat)
