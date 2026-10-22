Polish refines. It never hides a redesign. Keep the established world, content, behavior and everything outside scope. When the concept is wrong, say so and recommend `bolder` or an amend.

---

## Design mode

Persuade and Experience: the details are surprising in their specificity. A hover state that is more than a color change. A transition that has character. The 10% of decisions that make someone ask "who made this?"

Operate: the interface behaves exactly as a skilled user expects. No surprises, no missing state, no rough edges. Polished Operate UI is invisible in the best way.

Read: a calm column. Wayfinding stays consistent. Code, tables and notes use known forms.

---

## Establish the system

1. Read DESIGN.md, the tokens, the shared components and the neighboring flows.
2. Classify each drift before you fix it:
   - **missing token** — the system needs a reusable value;
   - **one-off** — a shared component or pattern should replace it;
   - **conceptual mismatch** — the flow, structure or hierarchy differs from comparable areas;
   - **local defect** — the build is incomplete or inconsistent.
3. Fix the cause at the narrowest correct level.
4. When a system principle is not clear, ask the person. Do not guess.

## Gather evidence

- Use the feature yourself at representative sizes and on each device class it ships to.
- Find the quality bar, the constraints and the work left unfinished on purpose.
- When a critique note exists in `design-notes/`, use it as one input. Do your own pass too.

## Triage

Fix in this order:
1. Broken tasks, data loss, misleading state and inaccessible paths.
2. Missing states.
3. Flow, hierarchy, responsive and system drift.
4. Visual and motion inconsistency.
5. Code and asset cleanup.

Do not perfect one corner while the rest is below the bar.

## Flow and hierarchy

- Match the terms, the disclosure and the save behavior of neighboring flows.
- Make the primary task and the current state obvious. Do not flatten every element to equal weight.
- Connect the arrival, empty and recovery paths. They are not isolated screens.

## What polish addresses

Polish is not a single category of change — it is attention to the full surface of the design. Work through each dimension:

### Typographic fine-tuning
- Heading tracking: display sizes (48px+) benefit from negative tracking (−0.02 to −0.04 em)
- Body line height: 1.6–1.75 for long-form, 1.4–1.5 for dense UI text
- Optical size adjustments: lighter weight for large type, slightly heavier for very small labels
- Smart quotes and proper apostrophes in user-facing copy
- Hang the opening quotation mark of a block quote outside the text edge: **hanging punctuation** ([_platforms.md](_platforms.md))
- Control line breaks per [typeset.md](typeset.md) → Line breaks
- Test measure, wrapping, translation length, zoom and font loading at every supported width

### Spacing consistency
- All spacing values should be multiples of the base unit (4px or 8px)
- Find and fix one-off values that break the system (13px, 17px, 22px are symptoms)
- Padding asymmetry in components: check that it is intentional
- Icon/label alignment: icons should align to the text cap-height, not the line-height box

### Color refinement
- Every color comes from a token. Replace a hard-coded value with its token.
- Tint a neutral toward the brand hue only when it creates cohesion. A plain neutral is valid.
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
- Success (for an action that completes)

### Transition quality
- Animate only the state changes that pass the frequency gate in `animate.md` — no instant property switches on those (except `display`)
- Transition property should be specific, not `all` (avoid accidental transitions)
- ease-out for entering and leaving elements; never ease-in on UI
- Duration: use the timing table in `animate.md`
- For the motion mechanics behind these — curve tokens, retargetable animations, icon/enter-exit choreography, gesture physics — see `animate.md` (this directory); platform forms are in `_platforms.md`
- Do not add motion only to make polish visible.

Every animation honors the reduced-motion setting: fewer and gentler motion, not zero.

### Empty and loading states
- Empty states should explain what will appear here and give the user a path forward
- Loading skeletons should match the shape of the content they're replacing
- Error states should be specific and actionable
- Load worst-case content per [harden.md](harden.md) §11.

### Detail moments
- Icon sizing consistent across the surface (16px, 20px, or 24px — pick one as the baseline)
- Button padding: minimum 8px vertical, 12px horizontal for standard buttons
- Border radius consistent across similar components
- Shadow levels consistent (if using elevation system: one shadow per elevation tier, not per component)
- System parts carry the design: text selection, caret, scrollbar, focus ring, link underline, table numerals. Theme their color. Never change their behavior. See **system-part colors** in [_platforms.md](_platforms.md).

### Concentric border radius
When nesting rounded surfaces, the outer radius must equal the inner radius plus the padding between them: `outerRadius = innerRadius + padding`. Equal radius on a padded parent and child is the single most common thing that makes a UI feel "off." (When padding exceeds ~24px, treat the layers as separate surfaces and pick radii independently.)

```tsx
// Web:
<div className="rounded-2xl p-2"><div className="rounded-lg"> … </div></div>  {/* 16px outer, 8px inner = 16 − 8 ✓ */}
```

### Optical alignment
When geometric centering looks off, align optically: icon-side button padding ≈ text-side − 2px; shift play-triangles ~2px right (the geometric center is not the visual center); fix asymmetric icons (stars, carets) in the icon's own drawing where possible.

### Shadows over borders (for depth)
For buttons, cards, and containers that use a border for *elevation*, prefer a layered transparent shadow — it adapts to any background; a solid border does not. Keep real dividers, table boundaries, and input outlines as borders.

```css
/* Web: */
--shadow-border: 0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06), 0 2px 4px 0 rgba(0,0,0,0.04); /* light: ring + lift + ambient */
--shadow-border-hover: 0 0 0 1px rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.08), 0 2px 4px 0 rgba(0,0,0,0.06); /* hover: deepen ring + lift */
/* dark: a single white ring — layered depth isn't visible on dark backgrounds */
--shadow-border: 0 0 0 1px rgba(255,255,255,0.08);
--shadow-border-hover: 0 0 0 1px rgba(255,255,255,0.13);
```
Transition the shadow (≈150ms ease-out) between the resting and hover variants for a smooth lift on hover/focus.

### Image outlines
Give images a subtle 1px inset outline for consistent depth — but the color must be **pure** black at 10% in light mode or **pure** white at 10% in dark. Never a near-black/near-white from the palette or the brand accent: a tinted outline picks up the surface color and reads as dirt on the edge. Draw it inside the image edge so it does not affect layout.

```tsx
// Web:
<img className="outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />
```

### Minimum hit area
Give every touch target the platform's **minimum hit area** ([_platforms.md](_platforms.md)). When the visible control is smaller (a 20px checkbox, a small icon button), extend the hit area around its center — but never let two interactive elements' hit areas overlap.

```tsx
// Web:
<button className="relative size-5 after:absolute after:top-1/2 after:left-1/2 after:size-10 after:-translate-1/2">
```

## Content and code

- Keep terms, capitals and punctuation consistent.
- Ask before you change a factual claim.
- Remove debug output, dead code, unused imports and obsolete styles.
- Replace a custom part with the shared component when the system owns the pattern.
- Do not create a token for one local exception.

## Validate

Run through the surface looking for:
- Any state that is missing from an interactive element
- Any spacing value that does not fit the system
- Any color that does not come from a token
- Any transition that is instant where it should be animated
- Any nested rounded surface where the radii are not concentric
- Any image with a tinted (non-pure-black/white) outline
- Any touch target under the platform's minimum hit area without an extended hit area
- Anything that does not match across similar components

Then walk the full path again:
1. Use mouse, keyboard and touch where the surface supports them.
2. Check zoom, focus and screen-reader names.
3. Check runtime errors, layout shift and input response.
4. Check agreement with DESIGN.md and with the scope.
5. Run the Verify list of [_craft-floor.md](_craft-floor.md).
6. End with a diff review. Remove accidental changes and temporary files.

## Never

- Micro-polish without macro-structure (fixing hover states on a broken layout)
- Reinventing the behavior of a system part
- Polishing for visual complexity rather than functional completeness

## In the workflow

This file is a move, not a stage.
- **Design not confirmed:** `/wf design <slug> polish` focuses the design stage and its contract `02c-craft.md` on finishing detail.
- **Design confirmed:** `/wf design <slug> polish` runs the triage and the Validate list against the frozen boards and the built UI, and draws nothing ([stage.md](stage.md) → Move pass).
- `plan` cites this file as a step pointer; `implement` applies it.
- Every run writes `design-notes/polish-<timestamp>.md` per [_output.md](_output.md) with: each drift and its class, the triage order, the fix, and the checks that code alone cannot settle.
- Before you draw or edit UI, load [_craft-floor.md](_craft-floor.md). Check the result against its Refuse and Verify lists.

---

> *The concentric-radius, optical-alignment, shadows-over-borders, image-outline, and hit-area details here are adapted from Jakub Krehel's "Details that make interfaces feel better" ([jakub.kr](https://jakub.kr/writing/details-that-make-interfaces-feel-better)), used under MIT license.*
>
> *Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.*
