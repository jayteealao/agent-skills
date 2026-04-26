---
name: wf-design
description: Create a design brief for a feature — discovery interview, UX strategy, layout approach, key states, interaction model. Produces 02b-design.md artifact. Slots between shape and slice.
argument-hint: [slug]
disable-model-invocation: true
---

You are running `wf-design`, the **design brief stage** in the SDLC lifecycle. This stage slots between shape and slice.

# Pipeline
1·intake → 2·shape → **2b·design** → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | `02-shape.md` |
| Produces | `02b-design.md` |
| Next | `/wf-slice <slug>` (default) |
| Skip-to | `/wf-plan <slug>` if the shaped spec is a single coherent unit that does not benefit from slicing |

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT start implementing, coding, or building anything.
- Do NOT jump ahead to slicing, planning, or implementation.
- Your job is to produce a **design brief** — a structured artifact that guides implementation through discovery, not guesswork.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start solving the problem or writing code, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - `02-shape.md` must exist. If missing → STOP. Tell the user: "Run `/wf-shape <slug>` first."
   - If `02-shape.md` shows `status: awaiting-input` → STOP. Tell the user to resolve the open shape questions first.
   - If `02b-design.md` already exists → WARN: "Design brief has already been created. Running it again will overwrite `02b-design.md`. Proceed?" Use AskUserQuestion if available, otherwise ask in chat.
4. **Read** `02-shape.md` and `po-answers.md`.
5. **Carry forward** `selected-slice-or-focus` and `open-questions` from the index.

# Step 1 — Design Context Check (MANDATORY)
1. **Read `.impeccable.md`** from the project root.
2. If `.impeccable.md` does not exist or does not contain a `## Design Context` section → STOP. Tell the user:
   > "Design context has not been established. Run `/wf-design:setup` first to gather brand personality, audience, and aesthetic direction. All design commands require this context."
3. If `.impeccable.md` exists and contains design context, extract: Users, Brand Personality, Aesthetic Direction, Design Principles.

# Step 2 — Load Design Guidelines
Read `../reference/design/design-guidelines.md` for the project's design reference material. These guidelines inform the discovery interview and design brief.

# Step 3 — Exploration Sub-Agent
Launch an Explore sub-agent to scan the codebase for design-relevant context. Prompt the agent with ALL of the following:

**Design system & component library:**
- Search for existing component libraries or shared UI directories (e.g., `components/`, `ui/`, `design-system/`, `shared/`)
- Identify existing components: buttons, cards, inputs, modals, navigation, layout primitives
- Check for a component catalog or Storybook configuration

**Design tokens & CSS approach:**
- Search for design token files (CSS custom properties, SCSS variables, Tailwind config, theme files, token JSON)
- Identify the CSS methodology in use: CSS Modules, Tailwind, styled-components, CSS-in-JS, vanilla CSS, utility classes
- Map existing color palettes, spacing scales, typography scales, shadow definitions, border-radius values
- Check for dark mode / theming infrastructure

**Current visual patterns:**
- Read 3-5 representative UI files to understand current visual approach: layout patterns, spacing conventions, typography usage, color usage
- Identify any existing design inconsistencies or pattern divergence
- Check for responsive design approach: breakpoints, container queries, fluid values

**Tech stack:**
- Identify the frontend framework: React, Vue, Svelte, Angular, Astro, plain HTML, etc.
- Identify the styling approach and build tools
- Check for animation libraries, icon systems, image handling

**Brand assets:**
- Search for logos, favicons, brand colors, font files
- Check for existing brand documentation or style guides

Report findings for each section. Note gaps where the project lacks design infrastructure.

# Step 4 — Phase 1: Discovery Interview
**Do NOT write any code or make any design decisions during this phase.** Your only job is to understand the feature deeply enough to make excellent design decisions in Phase 2.

First, review the acceptance criteria, desired behavior, and user context from `02-shape.md`. Many questions below may already be answered by the shape. **Skip questions already answered by the shape** — do not re-ask what is already settled.

Ask remaining questions in conversation, adapting based on answers. Don't dump them all at once; have a natural dialogue. STOP and call the AskUserQuestion tool to clarify.

### Purpose & Context (skip if covered by shape)
- What is the user's state of mind when they reach this feature? (Rushed? Exploring? Anxious? Focused?)
- What does success look like visually? What should the user see and feel when the feature is working?

### Content & Data
- What content or data does this feature display or collect?
- What are the realistic ranges? (Minimum, typical, maximum — e.g., 0 items, 5 items, 500 items)
- What are the visual edge cases? (Empty state, error state, first-time use, power user with lots of data)
- Is any content dynamic? What changes and how often?

### Design Goals
- What's the single most important thing a user should do or understand here?
- What should this feel like? (Fast/efficient? Calm/trustworthy? Fun/playful? Premium/refined?)
- Are there existing patterns in the product this should be consistent with?
- Are there specific examples (inside or outside the product) that capture the visual direction you're going for?

### Constraints
- Are there content constraints? (Localization, dynamic text length, user-generated content)
- Mobile/responsive requirements beyond what the shape specifies?
- Accessibility requirements beyond WCAG AA?

### Anti-Goals
- What should this NOT look like? What would be a wrong visual direction?
- What's the biggest risk of getting the design wrong?

Append every answer to `po-answers.md` with timestamp and stage (`design`).

# Step 5 — Phase 2: Design Brief
After the interview, synthesize everything — the shape file, design context from `.impeccable.md`, codebase exploration findings, design guidelines, and interview answers — into a structured design brief.

Present the brief to the user for confirmation before writing the artifact. STOP and call the AskUserQuestion tool to get explicit confirmation. If the user disagrees with any part, revisit the relevant discovery questions.

### Brief Structure

**1. Feature Summary** (2-3 sentences)
What this is, who it's for, what it needs to accomplish. Reference the acceptance criteria from the shape.

**2. Primary User Action**
The single most important thing a user should do or understand here.

**3. Design Direction**
How this should feel. What aesthetic approach fits. Reference the project's design context from `.impeccable.md` and explain how this feature should express the brand personality and design principles. Commit to a BOLD direction — not "modern and clean" but a specific, memorable approach.

**4. Layout Strategy**
High-level spatial approach: what gets emphasis, what's secondary, how information flows. Describe the visual hierarchy and rhythm, not specific CSS. Reference existing layout patterns from the codebase exploration where consistency matters.

**5. Key States**
List every state the feature needs: default, empty, loading, error, success, edge cases. For each, note what the user needs to see and feel. Empty states should teach the interface, not just say "nothing here."

**6. Interaction Model**
How users interact with this feature. What happens on click, hover, scroll? What feedback do they get? What's the flow from entry to completion? Use progressive disclosure: start simple, reveal sophistication through interaction.

**7. Content Requirements**
What copy, labels, empty state messages, error messages, and microcopy are needed. Note any dynamic content and its realistic ranges.

**8. Recommended References**
Based on the brief, list which design reference files would be most valuable during implementation. Always include:
- `../reference/design/spatial-design.md` for layout and spacing
- `../reference/design/typography.md` for type hierarchy

Then add based on the brief's needs:
- Complex interactions or forms? → `interaction-design.md`
- Animation or transitions? → `motion-design.md`
- Color-heavy or themed? → `color-and-contrast.md`
- Responsive requirements? → `responsive-design.md`
- Heavy on copy, labels, or errors? → `ux-writing.md`

**9. Open Questions**
Anything unresolved that the implementer should resolve during build.

# Step 6 — Write Artifact
Once the brief is confirmed, write `02b-design.md` to `.ai/workflows/<slug>/02b-design.md`.

**Timestamps must be real:** Run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time. Never guess or use `T00:00:00Z`.

```yaml
---
schema: sdlc/v1
type: design
slug: <slug>
status: confirmed
stage-number: 2.5
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
design-context: .impeccable.md
recommended-references:
  - typography.md
  - spatial-design.md
tags: []
refs:
  index: 00-index.md
  shape: 02-shape.md
  next: 03-slice.md
next-command: wf-slice
next-invocation: "/wf-slice <slug>"
---
```

# Design Brief: <feature name>

## Feature Summary

## Primary User Action

## Design Direction

## Layout Strategy

## Key States
- **Default**: ...
- **Empty**: ...
- **Loading**: ...
- **Error**: ...
- **Success**: ...
- **Edge Cases**: ...

## Interaction Model

## Content Requirements

## Recommended References
- `../reference/design/spatial-design.md`
- `../reference/design/typography.md`
- ...

## Open Questions

## Questions Asked This Stage

## Answers Captured This Stage

## Recommended Next Stage

# Step 7 — Update 00-index.md
Update `00-index.md` frontmatter:
- Set `current-stage` to `design` (or `slice` if design is complete and the user wants to proceed).
- Set `stage-status` to `complete`.
- Update `updated-at` with the real timestamp.
- Add `02b-design.md` to `workflow-files`.
- Set `recommended-next-command` and `recommended-next-invocation` based on adaptive routing.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time. Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- **Use AskUserQuestion** for multiple-choice PO questions (structured decisions, confirmations). Use freeform chat for open-ended questions. Append every answer to `po-answers.md` with timestamp and stage.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (list all viable next options — see Adaptive Routing below)
- <=3 short blocker bullets if needed

# Adaptive routing — evaluate what's actually next
After completing this stage, evaluate the design brief and present the user with ALL viable options:

**Option A (default): Slice** → `/wf-slice <slug>`
Use when: The spec covers multiple distinct areas, has more than one acceptance criterion cluster, or would benefit from incremental delivery.

**Option B: Skip to Plan** → `/wf-plan <slug>`
Use when: The shaped spec is a single coherent unit — one clear scope, one acceptance path, no meaningful way to split it further. Criteria: single concern, <=5 files likely touched, one delivery unit.

**Option C: Revisit Shape** → `/wf-shape <slug>`
Use when: The design interview revealed that the shape spec is incomplete or contradictory — the problem definition needs rework before design can be finalized.

**Option D: Revisit Design Context** → `/wf-design:setup`
Use when: The design interview revealed that the project's design context (`.impeccable.md`) is missing critical information or is stale.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.
