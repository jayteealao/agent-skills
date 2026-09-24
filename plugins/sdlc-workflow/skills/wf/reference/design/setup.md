Gather and document the design context for a project. Creates or updates PRODUCT.md and DESIGN.md, and the `.ai/design/` record ([record.md](record.md)) — the context anchors that the design stage and every design duty read before doing work.

**Run this once per project before the first design stage.** The design stage runs it for you when PRODUCT.md is missing. `extract` needs no prior context. Running the design stage without context produces generic output that ignores the project.

## What gets created

**PRODUCT.md** (required): Users, brand, tone, anti-references, strategic principles, register.
**DESIGN.md** (optional, strongly recommended): Colors, typography, elevation, components, design tokens.
**`.ai/design/current.md` and `.ai/design/direction.md`**: the current design and the design goals, per [record.md](record.md).

## Step 1: Discovery interview

Apply the Release valve in [../_autonomy-guards.md](../_autonomy-guards.md). Before you ask any question, pre-fill the answers:

1. For each question in the groups below, search the user prompt, PRODUCT.md, DESIGN.md, and the codebase for an answer.
2. When a source answers a question, record the answer and the source. Do not ask that question.
3. Ask the unanswered questions in ONE batched round. Then stop and wait for the answers.
4. When no unanswered questions remain, skip the round and continue to Step 2.

### Group 1: Register and purpose
- Is this primarily a **brand** surface (landing page, marketing, campaign, portfolio) or a **product** surface (app, dashboard, tool, authenticated experience)?
- What is this product/site for? Who uses it?
- How would you describe the brand in three concrete words? (Not "modern" — think physical objects, textures, contexts)

### Group 2: Users and tone
- Who are the primary users? What's their context and expertise level?
- What emotional tone should the design communicate? (Serious? Warm? Technical? Playful?)
- What's the most important thing a visitor should feel or understand in their first 5 seconds?

### Group 3: Visual direction
- Name 2–3 specific products, sites, or brands you'd use as positive references — things you want to be similar to.
- Name 1–2 anti-references — things you explicitly do NOT want this to look like.
- Are there existing brand assets (logo, color palette, type choices) to follow?

### Group 4: Constraints
- Any technical constraints? (Must use Tailwind? Specific component library? CSS-in-JS?)
- Any existing design documentation? (Figma file, brand guidelines PDF, design tokens?)
- Anything else that's off-limits or important to know?

### Group 5: Goals and direction
- What should the design achieve in the next few releases? Name two or three goals.
- Where do you expect the design to go after that? (New surfaces, a new audience, a rebrand, a design system?)
- Which parts of the current design do you already know are wrong or out of date?

## Step 2: Write PRODUCT.md

Write to `PRODUCT.md` in the project root:

```markdown
# Product

## Register
brand | product

## Users
[2–3 sentence description of primary users, their context, and their expertise]

## Brand Personality
[3–5 concrete brand-voice words and what they mean for design choices]

## Tone
[How the design should feel emotionally. What it should NOT feel like.]

## Positive References
- [Name] — [why/what to take from it]
- [Name] — [why/what to take from it]

## Anti-references
- [Name] — [why to avoid this direction]

## Strategic Principles
[2–4 sentences on design priorities and trade-offs specific to this project]
```

## Step 3: Write DESIGN.md (if information available)

Write to `DESIGN.md` in the project root:

```markdown
# Design

## Colors
[Primary, secondary, accent, neutrals — hex or oklch values if known]

## Typography
[Font families, scale, key sizes if known]

## Components
[Existing component library if any — shadcn, Radix, MUI, Tailwind UI, etc.]

## Design Tokens
[Token file location if one exists]

## Elevation and Shadows
[Shadow levels or elevation system if used]

## Notes
[Anything else relevant — dark mode support, icon library, illustration style]
```

If no design information is available yet, create DESIGN.md with placeholder sections and a note to fill in when known.

## Step 3b: Write the `.ai/design/` record

Write `.ai/design/current.md` and `.ai/design/direction.md` from the templates in [record.md](record.md). Group 5 fills `## Goals` and `## Future direction`. List the surfaces the codebase inspection found under `## Surfaces`. Put the known problems from Group 5 under `## Design debt`.

## Step 4: Confirm

Present both files to the user for review. List each pre-filled answer with its source in the same message:
> "I've created PRODUCT.md, DESIGN.md, and the `.ai/design/` record. Please review and confirm — or tell me what to update."

Wait for confirmation. After confirmation, set `confirmed-by: setup` in `direction.md`. These files are the context anchors for every later design stage.

## Notes

- If PRODUCT.md already exists: read it first. Update rather than overwrite. Preserve any sections not covered by the interview.
- If the user skips questions: write placeholder sections with `[TODO]` markers and note that the design stage asks again when it finds a `[TODO]` marker.
- These files are project-level and should be committed to the repository.
