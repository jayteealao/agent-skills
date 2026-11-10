# Design stage inspection (`_preflight.md`)

The four codebase inspections of the design stage. Only `design/stage.md` Step 3 loads this file.

> Load with: `design/_preflight.md`

## Run the inspections

1. Skip an inspection whose answer is already in this session, or in the `stack:` block of `00-index.md`.
2. Run the others as research sub-agents, in parallel, at **low** effort, per [_subagents.md](../_subagents.md). A child reads and writes nothing.
3. When this session has no sub-agent tool, do the four inspections yourself, one after another, with the same charters.
4. Before you dispatch, run `node "<skill-dir>/scripts/wf.mjs" design refs check "<root>"` one time. A child reads the references as files.

## The child prompt

A child has none of your context. Give each child this prompt, with every `<...>` filled in and every path absolute:

```
You inspect a codebase for a design stage. Read only. Write no file. Ask no question.
Project root: <absolute root>
Workflow: <slug>
Read a workflow record with: node "<resolved skill-dir>/scripts/wf.mjs" record get "<absolute root>" <slug> <name>
The brief of the change:
<the feature summary, the content inventory and the surfaces: list of 02b-design.md, pasted>
Files in scope: <files-in-scope of 02-shape.md, pasted>

Your charter: <one charter of the table below>

Return plain text in this shape, and nothing else:
FOUND: one line per fact, each with its file path and line
NOT FOUND: what you looked for and did not find
```

## The four charters

| Inspection | Charter | Returns |
|---|---|---|
| Token scanner | Find the design tokens: CSS custom properties (`--color-*`, `--spacing-*`, `--font-*`, `--radius-*`), the `theme.extend` of a Tailwind config, `tokens.json`, Style Dictionary sources. | one line per token: name, value, file |
| Framework and component detector | Name the UI framework (from the package manifest), the component library, the CSS approach and its version, the source directories of the UI, and one sample component path. | one line per fact |
| Context loader | Read `PRODUCT.md` and `DESIGN.md` (the project root, then `.agents/context/`, then `docs/`). Report the sections that are missing, empty or marked `[TODO]`, and an old `## Register` section. Run this one only when the session did not read the two files at Step 1 of the stage. | the gaps |
| Surface ranger | List every existing surface that the brief touches: its page and component files, its CSS, its screen key when `.ai/design/screens.json` has one, and its row in `.ai/design/current.md`. | one line per surface |
