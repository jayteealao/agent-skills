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
