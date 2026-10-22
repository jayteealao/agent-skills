> **Additional context needed**: the first-value moment, and the people's experience level.

Design the onboarding, the empty states and the first-run experience of a feature or a product. These are the moments when people meet something new and decide to engage or to leave. Get people to first value fast. Onboarding does not teach the whole product. It brings people to the moment that proves the product is worth their time.

---

## Design mode

Persuade: first impressions define the product. The first run is the landing page, and its action works. Design it with the ambition of any other Persuade surface.

Experience: the work leads. No tours.

Operate: onboarding is a teaching path to first value, not decoration. People reach the moment where they understand the value through their own use. Empty states teach. No page-load choreography.

Read: onboarding is wayfinding.

---

## Define first value

Before you design, name:
- the one action that proves the value (the first project, the first invite);
- the least a person must learn to reach it;
- the signal that shows that onboarding worked (completion, time to first value).

Find where people get stuck or leave today. Ask about the audience: their experience level, their motivation and the products they know.

## Empty states

An empty state is a chance to teach, to guide or to delight. A "nothing here" screen misses it.

### What a good empty state does
1. **It explains what will appear here.** Not "no data found" but "your saved items appear here".
2. **It gives a path forward.** A specific action, not only a description.
3. **It sets expectations.** It shows a preview or an example of the filled state.
4. **It does not feel like an error.** Its design looks deliberate, not like a fallback.

### Empty state anatomy
- An illustration or icon that shows what the space is for. Avoid a generic empty-box icon.
- A heading: what this space is for.
- A description of one or two sentences: what the filled state looks like.
- A primary action: a specific action that creates the first item.
- Optional: an example or a preview of the filled state.

Example (plain text):
```
[icon: a project board]
No projects yet
Create your first project to track its progress with your team.
[Create project]
```

### Empty state types
- **First use** (the person never added content): welcome, teach, encourage.
- **Cleared by the person** (the person removed everything): keep it light, make it easy to create again, do not teach again.
- **Filtered empty** (a search or filter returned nothing): say that the filter is active, and offer to clear it.
- **Error empty** (the content failed to load): say what went wrong, and offer a retry.
- **Permissions empty** (the person has no access): say why, and offer a path to request access.

For the words of each state, apply [clarify.md](clarify.md).

## First-run experience

### Principles
- **Show value first, ask for setup later.** People see the product before they configure it.
- **Progressive commitment.** Require no full profile before the first useful action.
- **Ask little.** Ask only for the information that the first action needs. Say why you ask for each item.
- **Contextual hints over upfront tours.** Show guidance when the person reaches a feature, not before.
- **Skip everything.** The person can skip every onboarding step.

### Patterns

**Checklist onboarding** (for a product with clear setup steps):
- 3–5 items at most.
- Show completion and progress.
- Complete a step automatically when the person does it in the product.
- Allow any order.

**Empty-state driven** (for a creation-first product):
- The empty state is the onboarding.
- The first run shows the empty state with a clear first action.
- No separate onboarding flow.

**Overlay or spotlight** (for a feature inside an existing product):
- One spotlight at a time: highlight one element, dismiss it, move to the next.
- The person starts it ("show me how this works"). It does not start on first load.
- The person can skip it and hide it for good.

**Guided tour** (for a complex interface or a large change):
- 3–7 steps.
- Teach the workflow, not the control: "Create a project", not "This is the project button".
- Give sample data, so that each step works on real controls.
- The person can replay the tour from help.

### Remember progress
- Record each finished or dismissed step.
- Never show the first-run flow to a returning person again.
- Never show a dismissed hint again.

## Motion in first-run

A first run or an empty state is a rare moment: the frequency tier where a designed entrance is welcome. It never delays the first action. Split the reveal into semantic chunks (illustration, heading, description, action). Stagger the chunks 30–80 ms apart per [animate.md](animate.md) → Choreography. Combine opacity, a small offset and a light blur. Do not animate one container in. The action is reachable at once; never hold interaction behind the animation. A Persuade first run (a landing hero) can be cinematic. On an Operate surface, keep it to one quick staggered reveal. See [animate.md](animate.md) for the reduced-motion form.

## Never

- A full-screen welcome dialog of five pages before the person sees the product.
- An automatic tour that appears every session.
- A required profile setup before any useful action.
- A generic "welcome to [product]" message without the product's specific value.
- A tutorial mode cut off from the real product.
- A hidden or hard-to-find Skip.

## Validate

- Can a new person complete the first meaningful action without help?
- Does each empty state say what will appear and how to get there?
- Can the person skip every onboarding step?
- Does the first run show value, or demand commitment?
- Can a returning person reach their work with no onboarding in the way?

## Measure

Write these measures in the design note, with the place in the product that records each one:
- the skip rate;
- the completion rate;
- the step where people drop off;
- the time to first value.

## In the workflow

This file is a move, not a stage.
- **Design not confirmed:** `/wf design <slug> onboard` focuses the design stage and its contract `02c-craft.md` on first run and empty states.
- **Design confirmed:** `/wf design <slug> onboard` runs the Validate list against the frozen boards and the built UI, and draws nothing ([stage.md](stage.md) → Move pass).
- `plan` cites this file as a step pointer; `implement` applies it.
- Every run writes `design-notes/onboard-<timestamp>.md` per [_output.md](_output.md) with: the first-value definition, each empty state and its type, and the measures.
- Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
