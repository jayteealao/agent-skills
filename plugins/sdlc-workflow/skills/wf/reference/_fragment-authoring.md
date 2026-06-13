# Shared Fragment Authoring Contract

Use this whenever a command writes a sibling `.html.fragment` next to its `.md`
and `.yaml` artifacts.

> **Two tiers (v9.70.0).** This contract governs the **typed** fragment —
> `<stem>.html.fragment`, exactly one per artifact, contract-bound and projected
> from the sibling `.yaml`. An artifact may ALSO ship any number of **free
> narrative fragments** named `<stem>.<label>.html.fragment`: unrestricted raw
> HTML with **none** of the rules below, available to every artifact and every
> subcommand, injected raw-inline below the page body. The free tier is
> documented separately in
> [`reference/narrative-fragments.md`](../../../reference/narrative-fragments.md)
> — the rules in THIS file do not apply to it.

## Authoring steps (cite these from each subcommand)

When a subcommand's reference reaches its "write the view fragments" step, it
performs **one or both** of these, depending on the artifact:

- **Step F1 — Fixed fragment** *(rich artifacts only: review, plan, design,
  design-brief, ship-run, rca, simplify-run, profile, benchmark, experiment,
  instrument, review-dimension)*. **Mandatory** for these types:
  1. Write the sibling `<stem>.yaml` (the structured data; the renderer gates the
     whole rich figure/table on it — a missing `.yaml` hard-blocks at write time).
  2. Write the sibling `<stem>.html.fragment` — the one contract-bound interactive
     layer, per **Required shape** below.
  A rich artifact with genuinely no structured data may opt out with
  `fragment: none` in its frontmatter.

- **Step F2 — Free narrative fragments** *(available to ANY artifact, any
  subcommand)*. **Author as many as the story needs.**
  For each beat the structured page can't tell — a bespoke architecture diagram,
  a before/after flow, a state machine, an annotated mock, an interactive widget —
  write a sibling `<stem>.<label>.html.fragment` of **unrestricted raw HTML**
  (no wrapper, no scoping, no sibling `.yaml`, no contract). Prefix the label with
  `NN-` (`01-`, `02-`, …) to control order; they inject raw-inline below the page
  body in label order. Full guidance:
  [`reference/narrative-fragments.md`](../../../reference/narrative-fragments.md).

A non-rich artifact (intake, slice, implement, verify, handoff, retro, sync,
amendments, …) skips Step F1 entirely and uses **only** Step F2 when a custom
visual would help.

## Required shape (typed fragment only)

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
