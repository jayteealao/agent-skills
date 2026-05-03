Gather and document the design context for a project. Creates or updates PRODUCT.md and DESIGN.md — the context anchors that every wf-design sub-command reads before doing work.

**Run this once per project before any other wf-design command.** Running other commands without context produces generic output that ignores the project.

## What gets created

**PRODUCT.md** (required): Users, brand, tone, anti-references, strategic principles, register.
**DESIGN.md** (optional, strongly recommended): Colors, typography, elevation, components, design tokens.

## Step 1: Discovery interview

Ask these questions one group at a time. Stop and wait for answers between groups. Don't ask more than 3 questions at once.

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

## Tokens
[Token file location if one exists]

## Notes
[Anything else relevant — dark mode support, icon library, illustration style]
```

If no design information is available yet, create DESIGN.md with placeholder sections and a note to fill in when known.

## Step 4: Confirm

Present both files to the user for review:
> "I've created PRODUCT.md and DESIGN.md. Please review and confirm — or tell me what to update."

Wait for confirmation. After confirmation, these files are the context anchors for all future wf-design commands.

## Notes

- If PRODUCT.md already exists: read it first. Update rather than overwrite. Preserve any sections not covered by the interview.
- If the user skips questions: write placeholder sections with `[TODO]` markers and note that the command will ask again when context is missing.
- These files are project-level and should be committed to the repository.
