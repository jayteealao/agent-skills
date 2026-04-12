---
name: wf-design:extract
description: Identify reusable patterns, components, and design tokens from the codebase and extract them into a consolidated design system for systematic reuse.
argument-hint: "[target area]"
disable-model-invocation: true
---

You are running `wf-design:extract`, a **design system extraction utility** for the SDLC lifecycle. This identifies reusable patterns, components, and design tokens from the codebase and extracts them into a consolidated design system.

This is a **utility command**, not a pipeline stage. It can be run at any time when the codebase has enough implemented UI to extract patterns from. It is especially useful after `/wf-design:critique` or `/wf-design:audit` identify inconsistencies and duplicated patterns.

| | Detail |
|---|---|
| Requires | Implemented UI code in the codebase |
| Produces | Extracted components, design tokens, and updated design system documentation |
| Next | `/design-polish` to refine extracted components, or `/wf-design:audit` to verify quality |

# CRITICAL — execution discipline
You are a **pattern extractor and systematizer**, working carefully and incrementally.
- Do NOT invent new patterns — extract what already exists and make it reusable.
- Do NOT prematurely abstract — only extract things used 3+ times with the same intent.
- Do NOT break existing functionality — every migration must maintain visual and functional parity.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- If you catch yourself about to create something that doesn't exist yet in the codebase, STOP. Extraction is about consolidating what IS, not inventing what SHOULD BE.

# Design Context Check (MANDATORY)
1. **Read `.impeccable.md`** from the project root.
2. If `.impeccable.md` does not exist → WARN: "No design context found. Extraction can still proceed, but naming conventions and token semantics will be less precise. Consider running `/wf-design:setup` first." Proceed anyway.
3. If `.impeccable.md` exists, extract: Design Principles, Technical Context. These inform naming conventions and organizational decisions.
4. **Read design guidelines:** Read `${CLAUDE_PLUGIN_ROOT}/reference/design/design-guidelines.md`.

# Step 1 — Discover the Design System

Find the existing design system, component library, or shared UI directory. Understand its current state:

**Search for existing infrastructure:**
- Component library directories: `components/`, `ui/`, `shared/`, `design-system/`, `lib/`, `common/`
- Design token files: CSS custom property files, SCSS variable files, Tailwind theme config, token JSON, theme files
- Storybook or component catalog configuration: `.storybook/`, `storybook/`, `*.stories.*`
- Documentation: component README files, style guide docs, usage examples

**Map the current structure:**
- How are components organized? (Atomic design, feature-based, flat, by concern)
- What naming conventions are used? (PascalCase components, kebab-case files, BEM CSS, etc.)
- How are components exported and consumed? (Named exports, barrel files, direct imports)
- What is the import convention? (`@/components/...`, `~/ui/...`, relative paths)
- What type system is in use? (TypeScript interfaces, PropTypes, JSDoc, none)

**Assess maturity:**
- Is there an established design system? If so, what's its scope and completeness?
- Are there shared tokens? How many components use them vs. hard-code values?
- Is there documentation? Is it current?

**CRITICAL**: If no design system exists at all, STOP and call the AskUserQuestion tool to clarify before creating one. Understand:
- Where should the design system live? (e.g., `src/components/ui/`, `packages/design-system/`, `lib/ui/`)
- What structure does the user prefer? (Atomic design? Flat? Feature-based?)
- Should tokens be CSS custom properties, SCSS variables, JS/TS constants, or Tailwind config?

Resolve the target argument from `$ARGUMENTS` if provided. If a target area was specified (e.g., "forms", "navigation", "dashboard"), scope the extraction to that area. If no target, scan the full codebase.

# Step 2 — Identify Patterns

Look for extraction opportunities in the target area. Launch an Explore sub-agent (or scan directly) covering ALL of the following:

**Repeated components:**
- UI patterns used 3+ times with the same intent: buttons, cards, inputs, modals, alerts, badges, tooltips, dropdowns, navigation items, list items, table rows
- For each, note: how many instances, which files, how they vary (size, color, content structure)
- Flag components that look similar but serve different purposes — these should NOT be merged

**Hard-coded values:**
- Color values not using tokens (grep for hex codes, rgb(), hsl(), oklch() in component files)
- Spacing values not using a scale (grep for pixel values in padding, margin, gap)
- Typography not using a scale (grep for font-size, font-weight, line-height literals)
- Shadow, border-radius, z-index values scattered across files
- Breakpoint values hard-coded instead of using shared constants
- Animation durations and easing functions repeated across files

**Inconsistent variations:**
- Multiple implementations of the same concept (e.g., 3 different button styles, 2 different card layouts, inconsistent form input styling)
- Similar components with slight differences that should be variants of one component
- Color variations that should be semantic tokens (e.g., same blue used as "primary" in one place and "info" in another)

**Composition patterns:**
- Layout patterns that repeat: form rows, toolbar groups, page headers, empty states, list/detail views
- Interaction patterns that repeat: confirm dialogs, toast notifications, dropdown menus, search/filter combinations
- Content patterns that repeat: user avatars + name, timestamp displays, status indicators, metric displays

**Type styles:**
- Repeated font-size + font-weight + line-height + letter-spacing combinations
- Heading styles used inconsistently
- Body text styles with hard-coded values

**Animation patterns:**
- Repeated easing functions, durations, or keyframe sequences
- Transition patterns applied to multiple elements
- Enter/exit animation pairs

For each identified pattern, assess extraction value:
- **High value**: Used 5+ times, same intent, high inconsistency between instances
- **Medium value**: Used 3-4 times, same intent, minor inconsistencies
- **Low value**: Used 2 times or intent differs between instances — do NOT extract yet

# Step 3 — Plan Extraction

Create a systematic extraction plan. Present it to the user for confirmation before proceeding. STOP and call the AskUserQuestion tool to get explicit approval.

### Components to Extract
For each component:
- **Name**: Following the project's naming conventions
- **Current instances**: File paths where this pattern exists (count)
- **Variants needed**: Size variants, color variants, content variants
- **Props API**: What props the reusable component needs (with types and defaults)
- **Accessibility**: ARIA attributes, keyboard navigation, focus management required
- **Migration complexity**: Low (drop-in replacement), Medium (minor refactor), High (significant restructuring)

### Tokens to Create
For each token category:
- **Color tokens**: Primitive palette + semantic tokens (e.g., `--color-surface`, `--color-text-primary`, `--color-border`)
- **Spacing tokens**: Scale values mapped from existing usage (e.g., `--space-xs: 4px`, `--space-sm: 8px`)
- **Typography tokens**: Font families, size scale, weight scale, line-height scale
- **Shadow tokens**: Elevation levels extracted from existing shadows
- **Border-radius tokens**: Consistent rounding values
- **Animation tokens**: Durations, easing functions, common keyframes
- **Z-index tokens**: Layering scale

### Naming Conventions
- Component names: following existing project conventions
- Token names: semantic over primitive (e.g., `--color-text-secondary` not `--color-gray-600`)
- Prop names: consistent with existing component APIs
- File structure: matching existing project organization

### Migration Path
- Order of operations: tokens first, then foundational components, then composite components
- Which files will be modified during migration (count per component)
- Testing strategy: how to verify visual and functional parity after migration
- Rollback approach: how to revert if something breaks

# Step 4 — Extract & Enrich

Build improved, reusable versions. Work in this order:

**Phase A: Design Tokens**
1. Create or update the token file(s) in the project's preferred format (CSS custom properties, SCSS variables, Tailwind config, or JS/TS constants)
2. Organize tokens into categories: color, spacing, typography, shadows, borders, z-index, animation
3. Use semantic naming that describes purpose, not appearance (e.g., `--color-text-secondary` not `--gray-500`)
4. Include dark mode / theme variants where the project uses theming
5. Document each token's purpose and usage context

**Phase B: Foundational Components**
For each component to extract:
1. Create the component file in the design system directory
2. Build a clean props API with TypeScript types (if project uses TS), sensible defaults, and JSDoc/comments
3. Support all identified variants via props (not separate components)
4. Build in accessibility: proper ARIA attributes, keyboard navigation, focus management
5. Use design tokens for all visual values — no hard-coded colors, spacing, or typography
6. Add usage examples as comments or in a companion documentation file

**Phase C: Composite Components**
After foundational components are stable:
1. Build higher-level components that compose foundational ones
2. Maintain the same patterns: tokens, a11y, typed props, documentation

**Quality checklist for every extracted component:**
- [ ] Uses design tokens for all visual values
- [ ] Has TypeScript types / prop documentation
- [ ] Includes all identified variants
- [ ] Has proper ARIA attributes and keyboard navigation
- [ ] Works in both light and dark mode (if project supports theming)
- [ ] Has sensible defaults so it works with minimal props
- [ ] Follows existing project naming and file conventions

# Step 5 — Migrate

Replace existing uses with the new shared versions:

**For each extracted component/token:**
1. **Find all instances**: Search for the patterns you extracted (use Grep to find all files that contain the old pattern)
2. **Replace systematically**: Update each use to consume the shared version. Change imports, swap inline styles or hard-coded values for tokens, replace ad-hoc implementations with the shared component
3. **Test thoroughly**: After each migration:
   - Run the project's lint and type-check commands
   - Run existing tests to catch regressions
   - If browser automation is available, visually verify key pages to ensure visual parity
   - Check both light and dark mode if applicable
4. **Delete dead code**: Remove the old inline implementations, unused CSS, duplicated style definitions. Do NOT leave the old code "just in case."

**Migration order:**
1. Tokens first (lowest risk — changing variable references)
2. Simple foundational components (buttons, inputs, badges)
3. Complex foundational components (modals, dropdowns, forms)
4. Composite components (page layouts, feature-specific compositions)

**If something breaks during migration**, stop the current migration, fix the component, and re-verify before continuing.

# Step 6 — Document

Update design system documentation:

**Component documentation** (for each extracted component):
- Purpose and when to use it
- Props API with types, defaults, and descriptions
- Usage examples (basic usage, with variants, composition patterns)
- Accessibility notes (keyboard shortcuts, screen reader behavior)
- Do's and don'ts (correct vs. incorrect usage)

**Token documentation** (for the token system):
- Token categories and their purpose
- Naming convention explanation
- How to add new tokens
- Theme/dark mode token mapping

**Integration documentation:**
- How to import and use design system components
- How to add new components to the system
- Migration guide for converting existing code

**Update existing docs:**
- Add new components to any Storybook or component catalog
- Update the project README if the design system is new
- Update any existing style guide documentation

# Chat return contract
After completing extraction, return ONLY:
- `extracted:` list of components and token categories created
- `migrated:` count of files updated
- `deleted:` count of dead code files/sections removed
- `options:`
  - `/design-polish` — refine and polish the extracted components
  - `/wf-design:audit` — verify technical quality of the design system
  - `/wf-design:critique` — evaluate UX quality holistically
- <=3 short bullets on anything that needs manual attention
