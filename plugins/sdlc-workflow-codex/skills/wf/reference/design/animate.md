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
- Button click: quick scale down then up (0.95 → 1), ripple effect
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
