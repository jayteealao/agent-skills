# Craft

Land the visual direction for a feature so implementation has a concrete contract — confirmed brief + north-star mock + mock fidelity inventory.

**Two execution modes** based on invocation context:

| Mode | Trigger | Output |
|---|---|---|
| **Workflow context** | `/wf-design <slug> craft` | `02c-craft.md` artifact (visual contract). Routes to `/wf implement`. **Does NOT write code.** |
| **Freestanding** | `/wf-design craft` | Full loop: brief → mock → code → critique pass. **Writes production code.** |

The split exists because the SDLC workflow has a dedicated implement stage (`wf-implement`) with its own lifecycle (verify → review → handoff → ship). Craft in workflow context produces the visual contract that `wf-implement` consumes; it does not bypass the implement lifecycle.

## Build Gate (both modes)

Cannot proceed until all of these are true:

1. PRODUCT context loaded (PRODUCT.md valid, ≥200 chars, no `[TODO]` markers).
2. Shape design brief confirmed by the user, OR user supplied an already-confirmed brief.
3. Probe selection recorded: generated and user chose a direction, OR skipped with a stated reason.
4. North-star mock decision recorded (Step 3 below).

**`shape=pass`** requires a separate user response approving the brief. PRODUCT.md and `teach` do not count. A self-authored brief does not count.

Invalid image-skip reasons: "the implementation will be semantic HTML/CSS/SVG", "a raster mock won't be used directly", "the product is fictional." Probes and mocks are direction artifacts, not implementation assets.

## Step 1: Load shape brief (both modes)

Read the confirmed design brief. Extract:
- Feature summary and user context
- Color strategy and scene sentence
- Register (brand / product) — load `reference/brand.md` or `reference/product.md`
- Visual direction and probe selection
- Anti-goals
- Recommended references

Load the recommended references from the brief. At minimum:
- `typeset.md` for type hierarchy
- The register reference (brand.md or product.md)

Add based on brief needs:
- `animate.md` — if transitions or motion
- `colorize.md` — if significant color work
- `layout.md` — if layout-heavy
- `harden.md` — if accessibility is critical
- `optimize.md` — if performance is critical

## Step 2: Load codebase context (both modes)

Read codebase inspection results from preflight sub-agents. Extract:
- Design tokens found (colors, spacing, fonts)
- Framework and component library
- Existing component patterns to follow or extend
- In-scope files

If codebase context is unavailable (freestanding without prior inspection): run a quick Glob + Grep to identify `package.json` dependencies, relevant CSS files, existing component examples.

## Step 3: Land the visual direction (both modes)

Generate a high-fidelity north-star mock when:
- Work is net-new or visually open-ended
- Brief scope is mid-fi, high-fi, or production-ready
- Image generation is available

When conditions are met, this step is mandatory for both brand and product work.

Generate 1–3 high-fidelity comps:
- If shape produced direction probes: generate a more resolved mock from the winning lane, not a new exploration
- For brand: push visual identity, composition, and mood aggressively
- For product: push hierarchy, topology, and density while staying grounded in realistic product structure

```
imagegen "<resolved brief prompt>" --output .ai/design-probes/<slug>-craft-north-star.jpg --resolution 2K
```

Present the mock and ask: "Does this match your visual direction? (yes to proceed / adjustments needed)"

If image generation unavailable: state in one line that the step is skipped because the harness lacks native image generation. Then proceed.

Record `image_gate=pass` after confirmation, or `image_gate=skipped:<reason>`.

## Step 4: Mock fidelity inventory (both modes)

List the visible ingredients from the approved mock or scene sentence that must survive into implementation:
- Composition and spatial relationships
- Typography choices (sizes, weights, families used)
- Color strategy execution (which elements carry which colors)
- Distinctive visual moves (the things that made the mock look non-generic)

These are the implementation contract. Code that loses them has regressed.

---

## Step 5 — WORKFLOW MODE: Write the visual contract

When invoked as `/wf-design <slug> craft`, **DO NOT write code**. Instead, write the visual contract artifact at `.ai/workflows/<slug>/02c-craft.md`:

```yaml
---
schema: sdlc/v1
type: craft
slug: <slug>
created-at: <timestamp>
based-on: 02b-design.md
register: <brand|product>
image-gate: <pass|skipped:<reason>>
north-star-mock: <path or "none">
references-loaded: [list of reference files used]
---
```

Body sections:

### 1. Visual direction confirmed
One paragraph summarizing the approved direction. Include the chosen probe (if applicable) and any deviations from the original shape brief that emerged during craft.

### 2. North-star mock
- Path to the generated mock image (or "none — text-only direction")
- Scene sentence (always)
- Annotated callouts: 5–10 specific visual elements in the mock, each with a short description and an implementation note

### 3. Mock fidelity inventory
The non-negotiable visible ingredients. Each entry: what it is, where in the mock, why it matters.

Format:
```
1. <ingredient> — <where in mock> — <why non-negotiable>
2. ...
```

### 4. Implementation contract
Specific decisions for `wf-implement` to follow:
- **Token choices**: which existing tokens to use, which new tokens to add
- **Component decisions**: extend existing component X / create new component Y
- **Layout structure**: grid choice, breakpoint behavior
- **Type scale**: which sizes/weights from the brief apply where
- **Color application**: which elements carry which colors in the strategy
- **Motion**: which interactions need transitions (with timing if specified)
- **State coverage**: required states for each interactive element

### 5. Anti-patterns to avoid
Pulled from anti-goals in the brief plus the absolute bans list. Be specific to this feature.

### 6. Implementation references
Which reference docs `wf-implement` should consult (typeset.md, animate.md, harden.md, etc.).

### 7. Routing

Update `00-index.md`:
- `current-stage: design` → unchanged (craft is part of design stage)
- `next-command: /wf implement`
- `next-invocation: /wf implement <slug>`

Hand off:
> Visual contract written to `.ai/workflows/<slug>/02c-craft.md`.
> The implement stage will use this as the visual contract.
> Run `/wf implement <slug>` to build the feature against this contract.

---

## Step 5 — FREESTANDING MODE: Build the implementation

When invoked as `/wf-design craft` (no slug), build the actual code now.

Build with the project's real stack, following the conventions discovered in codebase context.

### Implementation principles

- Use design tokens from the discovered codebase token system, not hard-coded values
- Follow the existing component vocabulary (don't introduce a new button style if one exists)
- Every interactive component must have: default, hover, focus, active, disabled states
- Loading states: skeletons not spinners for content areas
- `@media (prefers-reduced-motion: reduce)` for all animations — but design for motion first
- OKLCH for any new color values; never `#000` or `#fff`

### Absolute bans

- `border-left` or `border-right` > 1px as a colored decorative stripe — use a full hairline border, background tint, or leading glyph instead
- Purple-blue generic gradients
- Generic hero metric cards without real product proof
- Nested card-inside-card layouts
- Bounce or elastic easing
- Display fonts in UI labels, buttons, or data cells (product register)

## Step 6 — FREESTANDING MODE: Inspect and improve

After initial implementation, run at least one critique-and-fix pass:

1. Check the implementation against the mock fidelity inventory — what was lost?
2. Check against the anti-goals in the brief — what should not be there?
3. Check against the relevant register reference (brand.md or product.md) — any violations?
4. Run the slop test: would someone say "AI made this"? Fix the generic moves.
5. Check component states: all required states implemented?
6. Check responsive behavior at relevant breakpoints.

Apply fixes. Repeat until no material defects remain.
