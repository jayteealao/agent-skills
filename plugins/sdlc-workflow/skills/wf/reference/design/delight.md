> **Additional context needed**: target interactions, brand personality.

Add moments of joy, surprise, and delight to a UI — the micro-interactions, unexpected moments, and personality touches that make an experience feel crafted rather than assembled.

---

## Register

Brand: delight can be theatrical. Page-load reveals, hover choreography, scroll-driven storytelling, interactive illustrations, playful Easter eggs, sound design (when appropriate). Delight IS the value proposition on brand surfaces.

Product: delight should be felt, not noticed. The right product delight is a button press that responds 10ms faster than expected, a success animation that's slightly more joyful than functional necessity requires, an empty state that's charming rather than generic. It earns trust through craft; it doesn't entertain for its own sake.

---

## Philosophy

Delight is not decoration added on top of a functional design. It is what happens when the functional design is executed at a level of craft that exceeds expectation. The first source of delight is always: does this work, exactly as expected, faster than the user thought it would?

The second source is surprise — moments where the design reveals it was made by someone who cared about the details.

## Identify delight opportunities

Not every interaction should be delightful. Target:
- **High-frequency interactions**: actions the user does many times per session (keyboard shortcuts, recurring tasks, navigation)
- **Emotional moments**: task completion, onboarding completion, first success, empty state
- **Brand expression moments**: landing page hero, welcome screen, key feature reveals
- **Waiting moments**: loading states, empty states, processing feedback

## Types of delight

### Micro-interaction delight
Small, fast, precise. The user doesn't consciously notice but feels the quality:
- Button press with exact-right timing (≈150ms, `scale(0.96–0.97)` settling back to `1` — a `1.02` overshoot is a brand/playful license, not a product default)
- Checkbox check with a satisfying spring animation (not bounce — spring, with correct physics)
- Toggle with momentum (the thumb overshoots slightly, snaps back)
- Validation success with a green check that draws in from left to right

### Personality moments
The design reveals it was made by a specific person for a specific audience:
- Error messages that are specific and human, not "An error occurred"
- Empty states with a perspective, not just an icon and "Nothing here"
- Loading messages that are honest about what's happening, not just "Loading..."
- 404 pages that are part of the brand experience, not afterthoughts

### Surprise moments (brand register primarily)
Reserved for interactions where surprise is welcome and the user has the cognitive bandwidth to notice:
- Hover states that go further than expected (an image that reveals a second layer)
- Scroll reveals that tell a story
- Interactive elements with hidden depth (a button that has a press state, a ripple, AND a hover reveal)
- Easter eggs: keyboard shortcuts that trigger something unexpected, seasonal themes, callback to an earlier product version

### Performance delight
The most underrated form:
- Instant responses (< 100ms feels synchronous to the human perception system)
- Predictive loading (preload the most likely next page)
- Optimistic UI (update the UI immediately on action, roll back if server fails)
- Skeleton screens instead of spinners (shows progress, not just activity)

**Perception of speed is itself a feature.** How fast something *feels* matters as much as how fast it *is*. A faster-spinning spinner makes a load feel quicker at identical actual time; a 180ms transition feels more responsive than a 400ms one; once one tooltip in a toolbar is open, the next opening instantly (skip the delay *and* the animation) makes the whole toolbar feel faster. Design the *perceived* timeline, not only the measured one.

## Implementation

### Spring physics for satisfying interactions

Genuine spring physics is not a bouncy easing curve. In the **product** register a press *settles* — it doesn't overshoot: `scale(0.96–0.97)` on `:active`, returning on release with a short `ease-out`, no curve that crosses past `1`:

```css
/* Product: tactile press, no overshoot */
button { transition: transform 150ms ease-out; }
button:active { transform: scale(0.96); }
```

A subtle **overshoot** (passing `1`, then settling) is a *brand/playful* license only — and when you want it, use a real spring with `bounce: 0.1–0.3` (or `useSpring`), never a `cubic-bezier(…, 1.56, …)` overshoot curve masquerading as spring physics in product UI. For icon-swap delight (a like that pops, a check that draws in), use the exact `scale 0.25 → 1` / `blur 4px → 0` / `bounce: 0` recipe in `animate.md`.

### Staggered reveals
```css
.item { animation: fadeUp 400ms ease-out both; }
.item:nth-child(1) { animation-delay: 0ms; }
.item:nth-child(2) { animation-delay: 60ms; }
.item:nth-child(3) { animation-delay: 120ms; }
```

### Progress feedback
```javascript
// Optimistic UI: update immediately, rollback on failure
const previousState = items;
setItems([...items, newItem]); // instant UI update
try {
  await api.addItem(newItem);
} catch {
  setItems(previousState); // rollback
  showError("Couldn't save — try again");
}
```

## Validate

- Is each moment of delight appropriate for its context? (Product: earned, not theatrical)
- Does delight appear after the functional quality is already excellent?
- Is the `@media (prefers-reduced-motion: reduce)` fallback graceful?
- Would a user notice if the delight was removed? (If yes, it's adding value. If no, it's noise.)

## Never
- Delight that delays the user's task (a success animation that plays for 2 seconds before the UI proceeds)
- Mandatory animations the user can't skip
- Delight on error or failure states (this is not the time for playfulness)
- Gratuitous animation that exists to demonstrate capability rather than serve the user
- Bounce or elastic easing masquerading as "spring physics"

---

> *The perceived-performance principle and the spring-vs-bounce press guidance here are adapted from Emil Kowalski's design-engineering philosophy ([animations.dev](https://animations.dev/)); the exact icon-swap and press values live in `animate.md`. Used under MIT license.*
