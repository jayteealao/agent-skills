Help the user write or improve PRODUCT.md and DESIGN.md — the context anchors that every wf-design command reads before doing work.

**The difference from `setup`**: `setup` runs a discovery interview for a fresh project. `teach` is for projects where partial context exists — when PRODUCT.md is outdated, missing key sections, or uses `[TODO]` placeholders.

Run `teach` when:
- PRODUCT.md exists but is incomplete or stale
- The user wants to add design principles or anti-references to an existing document
- DESIGN.md needs to be created from an existing product's actual visual system
- The brand or product direction has changed and context needs updating

---

## Step 1: Read existing context

Read PRODUCT.md and DESIGN.md (if they exist). Identify:
- Which sections are complete
- Which sections have `[TODO]` markers or are missing
- Which sections feel generic or non-specific to this project

## Step 2: Targeted questions (only for missing/incomplete sections)

Ask only about what's missing. Don't re-ask about complete sections. Examples:

For missing register:
> "Is this primarily a **brand** surface (landing page, marketing) or a **product** surface (app, dashboard, tool)?"

For missing anti-references:
> "Which 1–2 things should this NOT look like? Specific products, brands, or aesthetic movements."

For missing brand voice words:
> "Describe the brand in 3 concrete words — not 'modern' or 'clean', but physical-object words like 'industrial', 'clinical', 'handmade'."

For missing user description:
> "Who are the primary users? What's their role, their context when they use this, and their expertise level?"

For stale content:
> "Has anything changed about the product's direction, audience, or design principles since this was written?"

Ask 1–3 questions at a time, then stop and wait.

## Step 3: Update the files

Update or create PRODUCT.md and DESIGN.md based on answers. Preserve all existing content; only add to or replace sections that were discussed.

**PRODUCT.md sections**:
```markdown
# Product

## Register
brand | product

## Users
[Specific user description — role, context, expertise, frequency]

## Brand Personality
[3–5 concrete brand-voice words with meaning]

## Tone
[Emotional tone the design should communicate. What it should NOT feel like.]

## Positive References
- [Name] — [why/what to take from it]

## Anti-references
- [Name] — [why to avoid this direction]

## Strategic Principles
[2–4 sentences on design priorities specific to this project]
```

**DESIGN.md sections**:
```markdown
# Design

## Colors
[Palette — hex or oklch values, named with purpose: primary, surface, accent, border, text]

## Typography
[Font families and scale — type sizes, weights, line heights if documented]

## Components
[Component library if any — shadcn, Radix, MUI, Tailwind UI, custom]

## Design Tokens
[Token file location and naming convention]

## Elevation and Shadows
[Shadow levels or elevation system if used]

## Notes
[Dark mode support, icon library, illustration style, anything else]
```

## Step 4: Confirm

Present the updated files:
> "Here's the updated context. Does this accurately represent the project? Anything to correct?"

After confirmation, these files are the anchors for all future wf-design commands in this project.

## Notes

- Never synthesize values the user didn't provide — if something is unknown, mark it `[TODO: add X]`
- If the user wants to skip a section entirely, mark it `<!-- intentionally omitted -->` rather than removing the heading
- Commit these files to the repository — they're project-level context, not personal configuration
