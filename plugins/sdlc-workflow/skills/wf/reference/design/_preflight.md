# Design stage inspection (`_preflight.md`)

The four codebase inspection sub-agents of the design stage. Only `design/stage.md` Step 3 loads this file.

> Load with: `design/_preflight.md`

## Codebase inspection sub-agents (4, parallel)

Run the four sub-agents in parallel. When their output is already in this session, do not run them again. When the `stack:` block of `00-index.md` answers a framework or library question, use it.

1. **Token scanner.** Find design tokens: CSS custom properties (`--color-*`, `--spacing-*`, `--font-*`, `--radius-*`), Tailwind config `theme.extend`, `tokens.json`, Style Dictionary source files. Return the extracted token table.
2. **Framework + component detector.** Identify the UI framework (React/Vue/Svelte/Angular from package.json), component library (shadcn/ui, Radix, Headless UI, MUI, Mantine, Ant Design, Chakra), CSS approach (Tailwind, CSS modules, styled-components, plain CSS), Tailwind version, sample component path.
3. **Context loader.** Read PRODUCT.md and DESIGN.md (project root → `.agents/context/` → `docs/`). Extract users, purpose, positioning, brand commitments, evidence on hand, and design principles. Report an old `## Register` once, as a hint only.
4. **Surface ranger.** Find files relevant to the current task: active page/component files, related CSS, primary component. In workflow context, read `02-shape.md` with `wf.mjs record get` for `files-in-scope`.
