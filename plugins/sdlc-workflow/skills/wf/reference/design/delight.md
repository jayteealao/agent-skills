> **Additional context needed**: the target moments, and the product's emotional range.

Add moments of joy, surprise and delight to a UI: the micro-interactions, unexpected moments and personality touches that make an experience feel crafted, not assembled.

---

## Design mode

Persuade and Experience: show personality through voice, composition, motion and discovery. Delight can be theatrical here. A spring may bounce 0.1–0.3.

Operate and Read: place delight at first use, completion, recovery and mastery. Reliability carries the rest. The person feels the delight but does not notice it.

---

## Philosophy

Delight is not decoration added on top of a functional design. It is what happens when the functional design is executed at a level of craft that exceeds expectation. The first source of delight is always: does this work, exactly as expected, faster than the person thought it would?

The second source is surprise — moments where the design reveals it was made by someone who cared about the details.

## Define one delight thesis

Write one sentence: what the person feels at this moment, and why that feeling belongs to this product. Then choose the smallest means that delivers it. Derive the means from the product, not from a stock catalog. Record the thesis in the design note.

## Identify delight opportunities

Not every interaction should be delightful. Target:
- **High-frequency interactions**: do not add animated delight to actions the person does many times per session (keyboard shortcuts, recurring tasks, navigation). They fail the frequency gate in [animate.md](animate.md). Their delight is speed alone.
- **Emotional moments**: task completion, onboarding completion, first success, empty state
- **Persuade and Experience moments**: landing page hero, welcome screen, key feature reveals
- **Waiting moments**: loading states, empty states, processing feedback

## Build for the moment

- **Success:** match the response to the effort and the consequence.
- **Waiting:** show true progress. Never fake work.
- **Empty and first use:** make the next action clear first. Add personality after that.
- **Repeated use:** keep the response satisfying on the hundredth use.
- **Discovery:** reward curiosity. Never hide a required function.

Generic whimsy is worse than neutral clarity.

## Types of delight

### Micro-interaction delight
Small, fast, precise. The person does not consciously notice but feels the quality:
- Scale a pressed control to 0.96–0.97, then return it to 1. Use no overshoot on an Operate or Read surface.
- A checkbox or toggle settles with a spring of correct physics. Its thumb overshoots only on a Persuade or Experience surface.
- Validation success with a green check that draws in from left to right

### Personality moments
The design reveals it was made by a specific person for a specific audience:
- Error messages that are specific and warm, not "An error occurred". Never a joke.
- Empty states with a perspective, not just an icon and "Nothing here"
- Loading messages that are honest about what is happening, not just "Loading..."
- 404 pages that are part of the product's world, not afterthoughts

### Surprise moments (Persuade and Experience surfaces primarily)
Reserved for interactions where surprise is welcome and the person has the attention to notice:
- Hover states that go further than expected (an image that reveals a second layer)
- Scroll reveals that tell a story
- Interactive elements with hidden depth (a button that has a press state, a ripple, and a hover reveal)
- Easter eggs: keyboard shortcuts that trigger something unexpected, seasonal themes, a callback to an earlier product version

### Performance delight
The most underrated form:
- Instant responses (under 100 ms feels synchronous)
- Predictive loading (preload the most likely next page)
- Optimistic UI (update the UI at once on action, roll back if the server fails; see [harden.md](harden.md))
- Skeleton screens instead of spinners (shows progress, not just activity)

**Perception of speed is itself a feature.** How fast something *feels* matters as much as how fast it *is*. A faster-spinning spinner makes a load feel quicker at identical actual time; a 180ms transition feels more responsive than a 400ms one; once one tooltip in a toolbar is open, the next opening instantly (skip the delay *and* the animation) makes the whole toolbar feel faster. Design the *perceived* timeline, not only the measured one.

## Implementation

### Press feedback

- Return a pressed control on release with the ease-out curve token of [animate.md](animate.md).
- Use a spring with bounce 0.1–0.3 only where the direction calls for play.
- Never fake a spring with an overshoot curve.
- For icon-swap delight (a like that pops, a check that draws in), use the icon-swap values in [animate.md](animate.md) → Choreography.
- Take the platform form from [_platforms.md](_platforms.md) → press feedback.

### Staggered reveals

Stagger a group entrance per [animate.md](animate.md) → Choreography.

## Validate

- Is each moment right for its context? On an Operate or Read surface, is it earned, not theatrical?
- Does delight appear after the functional quality is already excellent?
- Does each moment have a reduced-motion form per [animate.md](animate.md)?
- Would a person notice if the delight was removed? (If yes, it adds value. If no, it is noise.)
- No neighboring product could use the moment unchanged.
- The interface stays clear without the flourish.
- Repetition does not turn charm into friction.
- The muted, keyboard, touch and translated paths work.

## Never

- Delight that delays the person's task (a success animation that plays for 2 seconds before the UI proceeds)
- Mandatory animations the person cannot skip
- Play or jokes on an error, a loss, money, privacy or blocked work. Lead with the problem and the recovery. Warm words are allowed.
- Gratuitous animation that exists to demonstrate capability rather than serve the person
- Bounce or elastic easing masquerading as "spring physics"
- Sound without consent, or sound that ignores the mute setting
- A claim nobody asked for
- An asset cost out of proportion to the moment
- A non-essential loop that runs while hidden

## In the workflow

This file is a move, not a stage.
- **Design not confirmed:** `/wf design <slug> delight` focuses the design stage and its contract `02c-craft.md` on the target moments.
- **Design confirmed:** `/wf design <slug> delight` runs the opportunity list and the Validate list against the frozen boards and the built UI, and draws nothing ([stage.md](stage.md) → Move pass).
- `plan` cites this file as a step pointer; `implement` applies it.
- Every run writes `design-notes/delight-<timestamp>.md` per [_output.md](_output.md) with: the delight thesis, each moment with its frequency tier, the reduced-motion form of each, and the moments rejected.
- Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

---

> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*

> *The perceived-performance principle and the spring-vs-bounce press guidance here are adapted from Emil Kowalski's design-engineering philosophy ([animations.dev](https://animations.dev/)); the exact icon-swap and press values live in `animate.md`. Used under MIT license.*
