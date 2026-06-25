> **Additional context needed**: performance constraints, target devices.

Analyze a feature and strategically add animations and micro-interactions that enhance understanding, provide feedback, and create delight.

---

## Register

Brand: orchestrated page-load sequences, staggered reveals, scroll-driven animation. Motion is part of the brand voice; one well-rehearsed entrance beats scattered micro-interactions. Cinematic and theatrical motion is available and expected.

Product: 150–250 ms on most transitions. Motion conveys state — feedback, reveal, loading, transitions between views. No page-load choreography; users are in a task and won't wait for it. Functional, not decorative.

---

## Motion-first stance

Design for motion first. `@media (prefers-reduced-motion: reduce)` is the accessibility handling — it is not the design default. Users who need reduced motion get it via the media query; users who don't get the full designed experience. Do not let the reduced-motion case dictate the designed case.

Purposeful motion improves comprehension, communicates state, and expresses brand personality. "Animate sparingly" is not a design principle — it is anxiety about motion. Animate exactly as much as the experience requires, then reduce via the media query.

## Should it animate at all? (product register)

Motion-first is the *brand* default. In the **product** register the prior question is whether a given interaction should animate at all — match motion to how often a user sees it:

| Frequency | Decision |
|---|---|
| 100+ times/day (keyboard shortcuts, command-palette toggle) | **No animation. Ever.** |
| Tens/day (hover effects, list navigation) | Remove or drastically reduce |
| Occasional (modals, drawers, toasts) | Standard animation |
| Rare / first-time (onboarding, celebrations) | Can add delight |

**Never animate keyboard-initiated actions** — they repeat hundreds of times daily, and animation makes them feel slow and disconnected from the keypress. (Raycast has no open/close animation; that is the correct call for something opened hundreds of times a day.) Every animation must answer *"why does this animate?"* — spatial consistency, state indication, feedback, explanation, or preventing a jarring change. "It looks cool" on a frequently-seen product element is a reason to delete it. This gate does not apply to genuine brand surfaces, where motion is the message.

## Assess Animation Opportunities

1. **Missing feedback**: actions without visual acknowledgment (button clicks, form submission)
2. **Jarring transitions**: instant state changes that feel abrupt (show/hide, route changes)
3. **Unclear relationships**: spatial or hierarchical relationships that aren't obvious
4. **Lack of delight**: functional but joyless interactions
5. **Missed guidance**: opportunities to direct attention or explain behavior

## Plan Animation Strategy

One well-orchestrated experience beats scattered animations everywhere. Identify:
- **Hero moment**: the ONE signature animation (page load? hero? key interaction?)
- **Feedback layer**: which interactions need acknowledgment
- **Transition layer**: which state changes need smoothing
- **Delight layer**: where to surprise and delight without noise

## Implement Animations

### Entrance Animations (brand: use freely; product: use at page/view level only)
- Page load choreography: stagger element reveals (100–150 ms delays), fade + slide combinations
- Hero section: dramatic entrance for primary content (scale, parallax, or creative effects)
- Content reveals: scroll-triggered via Intersection Observer
- Modal/drawer entry: slide + fade, backdrop fade, focus management

### Micro-interactions
- Button hover: subtle scale (1.02–1.05), color shift, shadow increase
- Button click: subtle scale down on press — `transform: scale(0.96–0.97)` on `:active`, release snaps back (~150ms ease-out). Stay at `0.96–0.97`; below `0.95` reads as exaggerated. Optional ripple.
- Toggle: smooth slide + color transition (200–300 ms)
- Checkbox/radio: check mark animation, ripple effect
- Like/favorite: scale + rotation, particle effect, color transition

### State Transitions
- Show/hide: fade + slide (not instant); 200–300 ms typical
- Expand/collapse: height transition with overflow handling, icon rotation
- Loading: skeleton screen fades, spinner animations, progress bars
- Success/error: color transitions, icon animations, gentle scale pulse
- Enable/disable: opacity transitions

### Navigation and Flow
- Page transitions: crossfade between routes, shared element transitions
- Tab switching: slide indicator, content fade/slide
- Carousel: smooth transforms, snap points

### Scroll Effects (brand: use freely; product: use with restraint)
- Parallax layers
- Sticky headers with state changes
- Scroll progress indicators

## Timing and Easing

| Use case | Duration |
|---|---|
| Micro-interaction (hover, click) | 100–200 ms |
| State transition (show/hide, expand) | 200–300 ms |
| Page-level (modal, drawer) | 250–400 ms |
| Brand entrance (hero, scroll reveal) | 400–800 ms |
| Cinematic brand sequence | 800–1200 ms |

Easing:
- `ease-out` for entrances (fast start, slow finish — feels natural)
- `ease-in` for exits (slow start, fast finish — gets out of the way)
- `ease-in-out` for reversible transitions
- Custom cubic-bezier for signature brand motion
- **Never** `bounce` or `elastic` easing in production UI — it reads as cheap and unpolished
- **Never `ease-in` on an entrance or interaction** — it delays the exact frame the user is watching most and feels sluggish (`ease-out` at 200ms *feels* faster than `ease-in` at the same 200ms). Reserve `ease-in` strictly for exits that get out of the way.

The built-in CSS easings are too weak for deliberate motion — reach for strong custom curves:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);        /* strong ease-out for UI interactions */
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);    /* strong ease-in-out for on-screen movement */
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);     /* iOS-like drawer curve (Ionic) */
```

Find curves at [easing.dev](https://easing.dev/) or [easings.co](https://easings.co/) rather than hand-rolling from scratch.

**Asymmetric timing.** Slow the phase where the user is deciding, snap the phase where the system responds — a hold-to-delete runs slow (e.g. 2s linear) while its release returns fast (~200ms ease-out). Symmetric timing on a press-and-release or hold interaction feels wrong.

## Interruptibility

CSS **transitions** can be interrupted and retargeted mid-animation; **keyframes** restart from zero. For anything triggered rapidly (toasts being added, toggles) or gesture-driven, use transitions or springs — not keyframes. `@starting-style` animates entry without JS.

```css
.toast { transition: transform 400ms ease; }   /* interruptible — good for dynamic UI */
/* avoid for rapid/dynamic UI — restarts from zero on re-trigger: */
@keyframes slideIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
```

## Physicality — origin & scale

- **Never animate from `scale(0)`** — nothing in the real world appears from nothing. Start from `scale(0.9–0.97)` + `opacity: 0`.
- **Origin-aware popovers** — dropdowns/popovers/tooltips scale from their trigger, not center:
  ```css
  .popover { transform-origin: var(--radix-popover-content-transform-origin); } /* Radix */
  .popover { transform-origin: var(--transform-origin); }                       /* Base UI */
  ```
  **Modals are exempt** — they appear centered in the viewport; keep `transform-origin: center`.

## Springs

Springs simulate physics and have no fixed duration — they settle on their parameters and preserve velocity when interrupted, so a gesture the user reverses mid-motion stays smooth. Use them for drag-with-momentum, "alive" elements, and interruptible gestures.

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }            // Apple-style — easier to reason about
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }  // traditional physics — more control
```

Keep `bounce: 0` for product UI — that is the spring equivalent of the no-`bounce`/`elastic`-easing rule. A subtle `0.1–0.3` is reserved for playful brand interactions and drag-to-dismiss, never dashboards or data UI.

## Accessibility

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This handles all users who opt out of motion. Design the animated experience first; the media query is the safety net, not the template.

## Performance
- Animate only `transform` and `opacity` for GPU-composited animations (no layout thrash)
- Use `will-change: transform` for elements that will animate — but only those elements
- Avoid animating `width`, `height`, `top`, `left`, `margin` — these trigger layout
- Check for dropped frames on target devices before shipping complex animations

## Never
- `animation-duration: 0` as the default (design for motion, reduce via media query)
- `bounce` or `elastic` easing
- Animating layout properties (`width`, `height`, `margin`)
- Loading animations that block interaction
- Infinite background animations on the main content thread
- Gratuitous motion that doesn't serve communication, state, or brand expression

---

> *The frequency framework, custom easing curves, interruptibility, physicality, and spring guidance here are adapted from Emil Kowalski's design-engineering philosophy ([animations.dev](https://animations.dev/)), used under MIT license.*
