# Shared Fragment Authoring Contract

Use this whenever a command writes a sibling `.html.fragment` next to its `.md`
and `.yaml` artifacts.

## Required shape

- Write exactly one top-level `<section class="fragment-<name>">`.
- Keep all selectors scoped to that fragment class or a fragment-specific prefix.
- Use inline SVG only for figures and charts.
- Use inline scripts only; no remote scripts, iframes, links, full HTML
  documents, or external assets.
- Dispatch `sdlc:fragment-ready` with a deterministic detail payload after the
  fragment initializes.
- Make the fragment deterministic from the sibling YAML so re-rendering the same
  YAML produces stable markup.

## Scope: additive, body-only

A fragment is **additive** — a detail block the renderer appends *below* the page
chrome it already builds. The **page (renderer) owns the chrome**: the one page
heading (`pg-title`/`sdlc-h1` + breadcrumb), the lede, and the `metric-row`.

- **Do NOT emit a page heading or a `metric-row` inside the fragment.** The page
  already renders them; a copy in the fragment double-renders (two titles, two
  metric strips). Start the fragment at its interactive content.
- The fragment owns the **interactive detail layer** the static renderer can't
  produce: collapsible diff rows, clickable check cells + log panels, live
  swatches + copy controls, severity filters, sortable findings lists,
  `:target` timelines.
- For a section the renderer *also* draws from the YAML (a hero figure or a
  structured table), the fragment owns the **interactive** version and the
  renderer suppresses its static copy — never ship both (Decision 3, precedence).
  Do not include a second, static duplicate of the hero figure in the fragment.
- Consequence: the `metric-row` and `verdict` snippets below are **page chrome**.
  Only `@include` them in a fragment whose renderer does *not* already emit them
  (the rich-tier review/plan/design/ship-run pages all do — so omit them there).

## Shared snippets

Prefer snippets from `${CLAUDE_PLUGIN_ROOT}/components/` instead of hand-copying
shared chrome:

- `metric-row`
- `callout`
- `verdict`
- `severity-chip`
- `fragment-ready`
- `files-touched-row`
- `diff-block`

Example:

```html
<!-- @include fragment-ready { "name": "plan", "artifact": "plan",
     "detailJson": "{\"counts\":{\"items\":3}}" } -->
```

The renderer expands `@include` tokens after validation and before the shell is
written. Missing snippets, invalid JSON, or recursive includes fail render.

## Verification

`scripts/verify-fragment.mjs` enforces the wrapper, forbidden tags, sibling YAML,
and `sdlc:fragment-ready` dispatch. It also warns when inline markup matches a
published snippet that should usually be emitted with `@include`.
