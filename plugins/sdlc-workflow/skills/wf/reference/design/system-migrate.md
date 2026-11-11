# Migrate the design system (`design/system-migrate.md`)

Move a design surface from before typed tokens and component specs onto the design system: typed token tables with a column for each theme, layout primitives, a spec for each component, and screens that use them. In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root.

> Load with: `design/system-migrate.md`

## When to run it

Every design pass runs it first when the surface is old. A design pass is any run of the design stage, a move, an amend, or a design audit fix. The surface is old when one of these is true:

- `<wf> design foundation <root>` names a missing token kind, a token sheet from before typed tokens, or a component with no spec.
- `<wf> design tokens <root>` refuses a row, or names a table that it ignored.
- `<wf> design check <root>` reports a `library` failure, or a `token`, `layout` or `component` failure on a screen that this pass does not change.

Migrate the whole surface once, before the screens of the workflow. Do not migrate a part and leave the rest: the check fails on every screen until the system holds. Ask the person no question during the migration. The stop message of the round names it as the first change: "Migrated the design system: N tokens in K kinds, T themes, C components with specs, S screens moved onto the primitives."

## Step 1 — The token tables

1. Read `DESIGN.md` whole. Find every place that gives a design value: each token table, each prose line with a size, a radius, a space, a font or a duration, and each colour that `components.css` or a screen declares in its own `:root` or `[data-theme]` block.
2. Write one token table under each of these sections of `DESIGN.md`. A section can keep its prose above the table.

   | Section | Kinds | Roles, at the least |
   |---|---|---|
   | `## Colors` | color | ground, surface, raised, text, text-secondary, border, accent, accent-text, focus, error, warning, success, info |
   | `## Typography` | font, type, weight, leading | font-body, font-display, font-mono (when code shows), text-xs, text-sm, text-md, text-lg, text-xl |
   | `## Layout` | space, size | space-1 to space-6; size-target (the smallest touch or click target), size-control (the height of a control), size-icon, and each fixed size of the shell (sidebar, header, rail, tab bar) |
   | `## Shapes` | radius | radius-sm, radius-md, radius-lg, radius-full |
   | `## Elevation & Depth` | shadow, layer | shadow-raised, shadow-overlay; layer-overlay, layer-toast when the product stacks layers |
   | `## Motion` | motion | duration-fast, duration-base, ease-standard, when the product animates |

3. Use this table form. The first value column is the default theme. A theme column names the theme and, in brackets, the colour scheme that it follows:

   ```markdown
   | Role | Kind | Moss (dark) | Paper (light) | Used for |
   |---|---|---|---|---|
   | ground | color | #121815 | #fafaf9 | page background |
   | radius-md | radius | 8px | | panels and cards |
   ```

   - One role in each Role cell, in kebab-case. Leave a theme cell empty when the value is the same in every theme.
   - A value is a value, never a sentence. A colour is hex, `rgb()`, `hsl()` or `oklch()`. A length has its unit (`px`, `rem`; `dp` and `sp` are pixels on the web).
   - The Kind column is optional when the section and the role prefix say the kind.
   - Put the theme values into the table. Do not keep a theme as `-dark` names, as a `.dark` block, or as a `[data-theme]` block written by hand.
   - When two places of `DESIGN.md` give two values for one role, keep the value that the built product uses, and delete the other place.
4. When the product code has a token file, or must have one, name it in the Overview: `Token file: <path>`, for example `app/src/main/java/com/example/ui/theme/DesignTokens.kt`. `<wf> design tokens` writes it for Kotlin, Swift, TypeScript, JavaScript and CSS when the file is missing or was written by the command. A file that a person wrote stays as it is: move its values into `DESIGN.md`, delete it, and run the command again.
5. Run `<wf> design tokens <root>`. It must exit 0: no refused row, no missing kind. It writes `tokens.css`, `tokens.json`, `layout.css` and the token file of the code.
6. Delete each colour or theme block that `components.css` declared by hand. `components.css` may declare a custom property only as a name for tokens, for example `--button-bg: var(--accent)`.

## Step 2 — The layout primitives

`layout.css` holds the layout primitives, made from the space scale. A screen arranges its parts with them:

| Class | Does |
|---|---|
| `l-stack` | a column with a gap |
| `l-row` | a row, centred on the cross axis, with a gap |
| `l-cluster` | a row that wraps |
| `l-grid` | a grid of equal columns; `--l-min` sets the smallest column |
| `l-split` | two or more panes side by side; the pane that grows has `l-fill` |
| `l-fill` | takes the rest of the space |
| `l-scroll` | scrolls inside its box |
| `l-center` | centres its child |
| `l-push` | pushes itself to the end of a row |
| `l-layer` with `l-over` | puts a layer over its box |

`data-gap="<step>"` and `data-pad="<step>"` take a step of the space scale without its `space-` prefix: `data-gap="3"` is `var(--space-3)`.

1. A page shell, such as the app frame, a split view or a settings layout, is a component with `<meta name="wf:kind" content="layout">`. Its regions are named slots. Every screen of the shell uses it.
2. In each screen, replace each layout helper of its `<style>` (`.stack`, `.row`, `.grow`, `.fill` and the like) with the primitives. Replace each fixed position or size with a size token, or with a component.
3. What stays in the `<style>` of a screen is placement only: a grid area or the order of a part, with token values. The check fails a rule that three or more screens repeat, a raw length, a raw colour and a token that the page declares.
4. Each screen links `../tokens.css`, `../layout.css` and `../components.css`, in that order.

## Step 3 — The component specs

For each component of `<wf> design components <root>`:

1. Decide its kind (component, or layout for a shell), its variant dimensions and their values, and its states. Read the component in the code when it is in code, and its uses in the screens. A dimension is one axis of choice, for example `tone=solid|ghost|danger` or `size=sm|md`. Name a variant by its job, not by its colour.
2. An interactive component has at least the states `default hover pressed focus disabled`. Add `loading`, `error`, `selected` or `open` when the component has them.
3. Run `<wf> design component spec <root> <key> --variants "<dim>=<a>|<b>; <dim2>=<x>|<y>" --states "default hover pressed focus disabled" [--kind layout]`. The command writes the spec into the page, adds a panel for each theme, and adds an empty specimen cell for each case that the page lacks.
4. Fill each empty cell with one instance: the markup of the component, with `class="<key>"`, `data-component="<key>"` and its `data-variant`. Show a forced state with the attribute that `components.css` styles for it, for example `data-ui="hover"`, so that the cell shows the state without a pointer. Every value comes from a token.
5. Run `<wf> design component spec <root> <key>` again. It prints no problem when the page is complete.
6. Merge two components that do one job into one component with a variant. Remove the extra one with `<wf> design component remove`.

## Step 4 — The screens

1. In each screen, mark each use of a component with `data-component="<key>"` and its `data-variant`. Give the outer element of each use the class of the component key.
2. Replace each part that the screen draws by hand and that a component covers with that component.
3. Take out each restyle of a component. When a screen needs a look that the component does not have, add a variant to its spec.

## Step 5 — Check

1. Run `<wf> design foundation <root>`. It must exit 0.
2. Run `<wf> design check <root>`. Repair each `token`, `layout`, `component` and `library` failure. A failure that cannot be repaired in this pass, such as a value that the product must keep for a reason that the person gave, is waived with `<wf> design waive <root> <slug> --cause "<cause>" --reason "<why>"`. Waive a cause only for a reason that the person gave or that the code forces. Approval refuses each failure of these four checks that is not repaired or waived.
3. Save the migration as a round: `<wf> design round <root> <slug>`.
