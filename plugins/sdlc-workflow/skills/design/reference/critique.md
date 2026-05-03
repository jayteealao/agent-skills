Provide prescriptive, actionable design feedback. Unlike `audit` (which measures technical quality), critique evaluates the design *decisions* — whether they serve the user and communicate the brand effectively.

## Register

Brand: critique against distinctiveness. Would someone ask "how was this made?" If the answer is "no — it looks like every other AI landing page," the design has failed. Critique for POV, specific aesthetic lane, and committed visual choices.

Product: critique against earned familiarity. Does the interface feel like a tool a skilled user can trust? Critique for consistency, state completeness, and affordance clarity — not for visual novelty.

---

## Stance

A good critique is specific, not general. "The typography feels off" is not a critique. "The heading weight contrast ratio between h1 and h2 is 1.15× — too flat for the information hierarchy required here" is a critique.

Be direct. Don't soften findings. The goal is to surface the real problems, not to make the designer feel good. Surface-level praise before every criticism ("this is nice but…") wastes the critique.

## Evaluation Dimensions

### 1. Purpose alignment

Does the design serve its stated purpose?
- Is the primary user action immediately obvious?
- Does the information hierarchy match the user's decision path?
- Is the emotional tone appropriate for the context?

Ask: "What would a user do in their first 5 seconds here? Does the design support that?"

### 2. Visual hierarchy

Does the eye travel correctly?
- Is there a clear entry point?
- Does size, weight, color, and spacing guide attention in the right order?
- Are there competing focal points that fight each other?

### 3. Typographic execution

- Does the type scale communicate the content hierarchy?
- Are font choices aligned with the register and brief?
- Are there line length, line height, or tracking issues?
- Check against the font reflex-reject list (brand register): Fraunces, Cormorant, Outlet, Plus Jakarta Sans on new surfaces without a reason.

### 4. Color execution

- Does the color strategy follow the chosen dosage (Restrained / Committed / Full palette / Drenched)?
- Are semantic colors consistent?
- Check for the absolute ban: `border-left`/`border-right` colored accent stripes — call these out explicitly.
- Are neutrals tinted or pure gray?

### 5. Spatial quality

- Is there a consistent spatial system (spacing multiples)?
- Does whitespace have intent or does it feel accidental?
- Are there density problems (too tight / too spread)?

### 6. Component consistency

- Do interactive elements follow a consistent vocabulary?
- Are all required states present (hover, focus, active, disabled)?
- Are there invented affordances where standard ones would serve better?

### 7. Slop check

Would someone say "AI made this"?
- Purple-blue gradients, glassmorphism, hero metric cards, Fraunces + IBM Plex combinations, generic card grids, gradient text — name them explicitly if present.
- Brand register: does it have a POV? Can you name the aesthetic lane?

## Output Format

```
## Design Critique

### What's working
[1–3 specific things that are genuinely strong, with reasons]

### Issues — ordered by impact

1. **[Issue title]** — Impact: High/Medium/Low
   What: [specific problem]
   Where: [file:component or visual area]
   Why it matters: [effect on user or design quality]
   Fix: [specific, actionable recommendation]

2. ...

### Summary assessment
[2–3 sentences: the overall design direction and whether it will serve its purpose]
```

## Output in SDLC context

When invoked as `/wf-design <slug> critique`:
- Write to `.ai/workflows/<slug>/07-design-critique.md`
