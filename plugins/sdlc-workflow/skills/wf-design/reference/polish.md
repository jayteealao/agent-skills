Apply finishing details that elevate a design from functional to refined — micro-interactions, typographic fine-tuning, spacing consistency, state completeness, and the small decisions that distinguish careful craft from a first pass.

---

## Register

Brand: polish means the details are surprising in their specificity. A hover state that's not just a color change. A transition that has character. The 10% of decisions that make someone ask "who made this?"

Product: polish means the interface behaves exactly as a skilled user expects — no surprises, no missing states, no rough edges. Polished product UI is invisible in the best way.

---

## What polish addresses

Polish is not a single category of change — it is attention to the full surface of the design. Work through each dimension:

### Typographic fine-tuning
- Heading tracking: display sizes (48px+) benefit from negative tracking (−0.02 to −0.04 em)
- Body line height: 1.6–1.75 for long-form, 1.4–1.5 for dense UI text
- Optical size adjustments: lighter weight for large type, slightly heavier for very small labels
- Smart quotes and proper apostrophes in user-facing copy
- Hanging punctuation for block quotes (CSS `hanging-punctuation: first last`)
- Widow/orphan control on headings (adjust break points or add `&nbsp;`)

### Spacing consistency
- All spacing values should be multiples of the base unit (4px or 8px)
- Find and fix one-off values that break the system (13px, 17px, 22px are symptoms)
- Padding asymmetry in components: check that it's intentional
- Icon/label alignment: icons should align to the text cap-height, not the line-height box

### Color refinement
- Remove any remaining `#000` or `#fff` — tint toward the brand hue
- Check neutral colors: pure gray reads as clinical; a chroma of 0.005–0.01 adds warmth
- Ensure dark-mode variants use the same token system, not separate hard-coded values

### State completeness

Every interactive element needs all its states. Audit the following for each interactive component:
- Default
- Hover
- Focus (with visible focus ring meeting 3:1 contrast)
- Active / pressed
- Disabled (reduced opacity is the minimum — better to also reduce interactivity)
- Loading (for async actions — button should show spinner or loading state)
- Error (for inputs)

### Transition quality
- All state changes should be animated — no instant property switches (except `display`)
- Transition property should be specific, not `all` (avoid accidental transitions)
- `ease-out` for entering elements, `ease-in` for leaving elements
- Duration: 150–250ms for micro-interactions, 200–350ms for component transitions

Implement `@media (prefers-reduced-motion: reduce)` for all animations — but design for motion first.

### Empty and loading states
- Empty states should explain what will appear here and give the user a path forward
- Loading skeletons should match the shape of the content they're replacing
- Error states should be specific and actionable

### Detail moments
- Icon sizing consistent across the surface (16px, 20px, or 24px — pick one as the baseline)
- Button padding: minimum 8px vertical, 12px horizontal for standard buttons
- Border radius consistent across similar components
- Shadow levels consistent (if using elevation system: one shadow per elevation tier, not per component)

## Validate

Run through the surface looking for:
- Any state that's missing from an interactive element
- Any spacing value that doesn't fit the system
- Any color that's `#000` or `#fff`
- Any transition that's instant where it should be animated
- Anything that doesn't match across similar components

## Never
- Micro-polish without macro-structure (fixing hover states on a broken layout)
- Adding decorative detail to elements that should be invisible (scrollbars, dividers, container borders)
- Bounce or elastic easing in production transitions
- Polishing for visual complexity rather than functional completeness
