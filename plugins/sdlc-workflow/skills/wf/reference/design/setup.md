Gather and document the design context for a project. Creates or updates PRODUCT.md and DESIGN.md, and the `.ai/design/` record ([record.md](record.md)) — the context anchors that the design stage and every design duty read before doing work.

Parts adapted from impeccable v4.7.0 (`pbakaus/impeccable`, `374a0e179`), Apache-2.0.

**Run this once per project before the first design stage.** The design stage runs it for you when PRODUCT.md is missing. `extract` needs no prior context. Running the design stage without context produces generic output that ignores the project.

## What gets created

**PRODUCT.md** (required): Users, purpose, positioning, operating context, capabilities and constraints, brand commitments, evidence on hand, strategic principles.
**DESIGN.md** (optional, strongly recommended): Overview, colors and token roles, typography, layout, elevation and depth, shapes, components, do's and don'ts.
**`.ai/design/current.md` and `.ai/design/direction.md`**: the current design and the design goals, per [record.md](record.md).

PRODUCT.md holds product facts only. The aesthetic questions (brand words, tone, references) belong to the design brief, per surface: `shape` asks them ([brief.md](brief.md)). Do not ask for an aesthetic direction, colors, type or style here. When the person gives a binding visual constraint, record it under `## Brand Commitments` as given.

## Step 1: Discovery interview

Apply the Release valve in [../_autonomy-guards.md](../_autonomy-guards.md). Before you ask any question, pre-fill the answers:

1. For each question in the groups below, search the user prompt, PRODUCT.md, DESIGN.md, and the codebase for an answer.
2. When a source answers a question, record the answer and the source. Do not ask that question.
3. Ask the unanswered questions in ONE batched round. Then stop and wait for the answers.
4. When no unanswered questions remain, skip the round and continue to Step 2.

### Group 1: Purpose and position
- What is this product/site for? Who uses it?
- What does the product make possible? What mechanism or position could a neighboring product not truthfully copy?

### Group 2: Users and context
- Who are the primary users? What's their context and expertise level?
- Where and how do people use or evaluate the product: workflows, environments, tools, documents?

### Group 3: Brand commitments and evidence
- Are there existing brand assets (name, logo, color palette, type choices, voice) that future work must keep?
- What real content, data, demonstrations, testimonials, or case studies exist? Which do not exist yet?

### Group 4: Constraints
- Any technical constraints? (Must use Tailwind? Specific component library? CSS-in-JS?)
- Any existing design documentation? (Figma file, brand guidelines PDF, design tokens?)
- Anything else that's off-limits or important to know?

### Group 5: Goals and direction
- What should the design achieve in the next few releases? Name two or three goals.
- Where do you expect the design to go after that? (New surfaces, a new audience, a rebrand, a design system?)
- Which parts of the current design do you already know are wrong or out of date?

## Step 2: Write PRODUCT.md

Write to `PRODUCT.md` in the project root. Write only confirmed facts and open decisions marked as open. Omit a section that does not apply.

```markdown
# Product

## Users
[Primary users, their situation, and the job they do. Add other audiences only when confirmed.]

## Product Purpose
[What the product does, why it exists, and what success means.]

## Positioning
[The mechanism or claim that a neighboring product could not truthfully copy.]

## Operating Context
[The workflows, environments, tools and documents that are part of using or evaluating the product.]

## Capabilities and Constraints
[Confirmed functions, technical constraints, terminology, and product facts that are still undecided.]

## Brand Commitments
[Existing name, voice, assets, personality, and references the person made binding. Omit when none exist.]

## Evidence on Hand
[Real content, data, demonstrations, testimonials, case studies and assets, with paths. State each absence that future work must not fabricate.]

## Strategic Principles
[Two to four durable principles on priorities and trade-offs. No visual recipes.]
```

Do not write a `## Register` section: the design mode is chosen per surface ([_design-context.md](_design-context.md) → Design modes). An older PRODUCT.md keeps its legacy sections (Register, Brand Personality, Tone, references) until the person agrees to remove them.

## Step 3: Write DESIGN.md (if information available)

Write to `DESIGN.md` in the project root. Write no frontmatter.

```markdown
# Design

## Overview
[The personality, density and aesthetic stance of the system, in two or three paragraphs. State only confirmed rejections. Token file: <path, or none>.]

## Colors
[The palette character in one sentence. Each color with its value (hex or oklch), its name and where it is used. Light and dark support.]

### Token roles
| Role | Token | Value | Used for |
|---|---|---|---|
| ground | | | page background |
| surface | | | raised panels and cards |
| text | | | body text |
| text-secondary | | | secondary text |
| accent | | | primary action, current selection |
| border | | | dividers and control outlines |
| focus | | | focus ring |
| error, warning, success, info | | | state colors |

## Typography
[Families with fallbacks. The hierarchy roles (display, headline, title, body, label) with weight, size and line height. The body measure.]

## Layout
[The grid or spatial model, container behavior, density, responsive changes, and the spacing rhythm.]

## Elevation & Depth
[Shadows, tonal layers, or both. With no shadows, say how depth shows.]

## Shapes
[The radius strategy, borders, clipping, and recurring geometry.]

## Components
[The component library, if any, and the icon library. For each main component (buttons, inputs, cards, navigation): its shape, color roles and states.]

## Do's and Don'ts
[Concrete guardrails from the existing system or the person's choices. Start each with "Do" or "Don't".]
```

Fill the token roles that a source gives. The design stage fills the rest at freeze ([record.md](record.md) → Token roles at freeze). If no design information is available yet, create DESIGN.md with placeholder sections and a note to fill in when known.

## Step 3b: Write the `.ai/design/` record

Write `.ai/design/current.md` and `.ai/design/direction.md` from the templates in [record.md](record.md). Group 5 fills `## Goals` and `## Future direction`. List the surfaces the codebase inspection found under `## Surfaces`. Put the known problems from Group 5 under `## Design debt`. Apply [record.md](record.md) → Floor guard to every write.

## Step 4: Confirm

Present both files to the user for review. List each pre-filled answer with its source in the same message:
> "I've created PRODUCT.md, DESIGN.md, and the `.ai/design/` record. Please review and confirm — or tell me what to update."

Wait for confirmation. After confirmation, set `confirmed-by: setup` in `direction.md`. These files are the context anchors for every later design stage.

## Notes

- If PRODUCT.md already exists: read it first. Update rather than overwrite. Preserve any sections not covered by the interview.
- If the user skips questions: write placeholder sections with `[TODO]` markers and note that the design stage asks again when it finds a `[TODO]` marker.
- These files are project-level and should be committed to the repository.
