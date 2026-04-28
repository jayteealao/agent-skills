---
name: wf-design:setup
description: Establish design context for the project — gather brand personality, audience, aesthetic direction, and write .impeccable.md. One-time setup that all design commands and skills require.
disable-model-invocation: true
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf-design:setup`, the **one-time design context setup** for the project.

This is NOT a pipeline stage — it does not produce an SDLC artifact or update `00-index.md`. It produces `.impeccable.md` at the project root, which is a prerequisite for all design commands: `/wf-design`, `/wf-design:critique`, `/wf-design:audit`, `/wf-design:extract`, and all `/design-*` skills.

# CRITICAL — execution discipline
You are a **context gatherer**, not a designer or implementer.
- Do NOT start designing, building, or modifying any code.
- Do NOT produce design artifacts, mockups, or visual decisions.
- Your job is to **establish the project's design context** by exploring the codebase and interviewing the user.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- If you catch yourself about to start making design decisions, STOP and return to the next unfinished step.

# Step 1 — Explore the Codebase

Before asking questions, thoroughly scan the project to discover what you can. Launch an Explore sub-agent covering ALL of the following:

**README and docs:**
- Read the project README for purpose, target audience, stated goals
- Check for any existing brand documentation, style guides, or design docs
- Look in `docs/`, `design/`, `.github/`, or any documentation directories

**Package manifest & config files:**
- Read `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, or equivalent
- Identify the tech stack, framework, and existing design-related dependencies (UI libraries, CSS frameworks, icon packs, font packages)
- Check for Tailwind config, PostCSS config, theme files, or other styling configuration

**Existing components:**
- Scan for component directories (`components/`, `ui/`, `shared/`, `design-system/`)
- Read 3-5 representative components to understand current design patterns: spacing, typography in use, color usage, layout approach
- Note the component architecture style (atomic design, feature-based, flat, etc.)

**Brand assets:**
- Search for logos, favicons, brand color definitions, font files
- Check for `public/`, `assets/`, `static/`, or similar directories
- Look for SVG icons, illustration sets, or image assets that indicate visual direction

**Design tokens / CSS variables:**
- Search for existing color palettes (CSS custom properties, SCSS variables, Tailwind theme, token JSON files)
- Map existing font stacks, spacing scales, shadow definitions, border-radius values
- Check for dark mode or multi-theme infrastructure

**Style guides or brand documentation:**
- Search for `.impeccable.md`, `STYLE_GUIDE.md`, `BRAND.md`, or similar
- Check CLAUDE.md or similar instruction files for any existing `## Design Context` section
- Look for Storybook configuration or component catalog

**Note what you've learned and what remains unclear.** Present a brief summary of findings to the user before proceeding to questions.

# Step 2 — Ask UX-Focused Questions

STOP and call the AskUserQuestion tool to clarify. Focus only on what you couldn't infer from the codebase. Have a natural conversation — don't dump all questions at once.

### Users & Purpose
- Who uses this product? What's their context when using it? (Role, environment, frequency, device)
- What job are they trying to get done? What's the core problem being solved?
- What emotions should the interface evoke? (Confidence, delight, calm, urgency, trust, excitement, etc.)
- When and where do users interact with this? (Time of day, physical setting, attention level)

### Brand & Personality
- How would you describe the brand personality in 3 words? (Not "modern" or "elegant" — those are dead categories. Think: "warm and mechanical and opinionated", "calm and clinical and careful", "fast and dense and unimpressed", "handmade and a little weird".)
- Any reference sites or apps that capture the right feel? What specifically about them?
- What should this explicitly NOT look like? Any anti-references?
- If this product were a physical object, what would it be? (A museum exhibit caption, a hand-painted shop sign, a 1970s mainframe terminal manual, a fabric label inside a coat, a children's book on cheap newsprint?)

### Aesthetic Preferences
- Any strong preferences for visual direction? (Minimal, bold, elegant, playful, technical, organic, brutalist, editorial, industrial, retro-futuristic, soft/pastel, art deco, etc.)
- Light mode, dark mode, or both? Consider the user's actual context — when and where they use the product.
- Any colors that must be used or avoided? Existing brand colors?
- Any typography preferences or constraints? Existing font choices?

### Accessibility & Inclusion
- Specific accessibility requirements? (WCAG level, known user needs)
- Considerations for reduced motion, color blindness, or other accommodations?
- Internationalization or localization requirements? (RTL support, variable text length)

**Skip questions where the answer is already clear from the codebase exploration.** Acknowledge what you found and only ask about gaps.

# Step 3 — Write Design Context

Synthesize your codebase exploration findings and the user's answers into a comprehensive design context document.

Write `.impeccable.md` in the project root with the following structure:

```markdown
# Design Context

## Users
[Who they are, their context, the job to be done, when and where they use the product, their emotional state]

## Brand Personality
[Voice, tone, the 3-word personality, emotional goals, the physical object metaphor if applicable]

## Aesthetic Direction
[Visual tone, specific references and anti-references, theme choice (light/dark) with reasoning, color direction, typography direction]

## Design Principles
[3-5 principles derived from the conversation that should guide ALL design decisions. These should be specific and actionable, not generic platitudes. Each principle should help resolve ambiguity during implementation.]

## Technical Context
[Framework, CSS approach, existing design system state, accessibility requirements, responsive requirements]

## Anti-Patterns
[What this should explicitly NOT look like. Styles, patterns, and aesthetic directions to avoid.]
```

If `.impeccable.md` already exists, update the Design Context sections in place. Preserve any other sections that may exist in the file.

# Step 4 — Ask about CLAUDE.md

STOP and call the AskUserQuestion tool to clarify:

> "I've written the design context to `.impeccable.md`. Would you also like me to append a `## Design Context` summary to `CLAUDE.md`? This ensures the design direction is always loaded in every Claude session, not just when design commands are invoked."

Use AskUserQuestion with options:
- **Yes, append to CLAUDE.md** — "Add a Design Context section to CLAUDE.md so all Claude sessions have design awareness."
- **No, keep it in .impeccable.md only** — "Design commands will read .impeccable.md when needed. Other commands won't see it."

If the user says yes:
1. Read `CLAUDE.md` (create it if it doesn't exist).
2. If a `## Design Context` section already exists, replace it.
3. If not, append a `## Design Context` section with a condensed version of the key principles: users, brand personality (3 words), aesthetic direction (1-2 sentences), and the design principles list.
4. Do NOT duplicate the full `.impeccable.md` content — just enough for design-aware behavior in non-design commands.

# Chat return contract
After writing files, return ONLY:
- `wrote: .impeccable.md` (and `CLAUDE.md` if updated)
- Brief summary of the key design principles established
- Reminder: "All design commands (`/wf-design`, `/wf-design:critique`, `/wf-design:audit`, `/wf-design:extract`, and `/design-*` skills) will now use this context."
