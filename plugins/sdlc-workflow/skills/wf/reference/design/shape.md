# Brief (design-brief authoring procedure)

Author the **design brief**: a structured artifact that guides UI implementation through discovery, not guesswork. This is **not a standalone command** — it is the brief-authoring procedure that the **`shape` lifecycle stage** runs (`../shape.md` Step 5b) when the work has UI surface (`stack.ui ≠ ∅`). It produces `02b-design.md`.

**Scope**: Design planning only. This procedure does NOT write code, does NOT generate image probes, and does NOT confirm visual direction. It produces the thinking that makes code good. The visual-direction gates (image probes + confirm) and the visual contract `02c-craft.md` are authored downstream by **`plan`** (see [contract.md](contract.md)); this procedure leaves the image gate **unresolved** — it writes no resolved `image-gate` to `02b-design.md` — for `plan` to resolve.

## Philosophy

Most AI-generated UIs fail not because of bad code, but because of skipped thinking. They jump to "here's a card grid" without asking "what is the user trying to accomplish?" Shape inverts that: understand deeply first, so implementation is precise.

A sparse prompt is not a brief. Do **not** synthesize a complete brief for confirmation on the first response. Discovery requires at least one user-answer round.

## Phase 1: Discovery Interview

Do NOT write any code or make any design decisions during this phase. Your only job is to understand the feature deeply enough to make excellent design decisions later.

This is a required interaction. Ask questions in conversation, adapting based on answers. Don't dump them all at once — have a natural dialogue. Ask 2–3 questions per round, then stop and wait for answers.

### Round 1 — Purpose and context
- What is this feature for? What problem does it solve?
- Who specifically will use it? (Role, context, frequency — not "users")
- What does success look like?
- What's the user's state of mind when they reach this feature? (Rushed? Exploring? Anxious?)

### Round 2 — Content and states
- What content or data does this feature display or collect?
- What are the realistic ranges? (0 items / 5 items / 500 items)
- What are the edge cases? (Empty state, error state, first-time use, power user)
- Is any content dynamic? What changes and how often?

### Round 3 — Visual direction and scope (ask only what's missing from PRODUCT.md/DESIGN.md)
- **Color strategy for this surface**: Restrained / Committed / Full palette / Drenched — can override the project default if the surface earns it
- **Scene sentence**: One sentence of physical context — who uses this, where, under what ambient light, in what mood. The sentence forces dark vs light. If it doesn't, add detail until it does.
- **Two or three named anchor references**: Specific products, brands, objects — not adjectives
- **Scope**: sketch quality vs. shipped quality — don't guess between them

## Phase 2: Design Brief

Write the design brief after collecting answers. Sections:

### 1. Feature summary
Two sentences: what it is and what problem it solves.

### 2. User and context
Specific user description, their task context, their emotional state at arrival.

### 3. Content inventory
List of content elements, edge cases, and state variants (empty, error, loading, first-run).

### 4. Visual direction
- Color strategy chosen (and why it fits this surface)
- Scene sentence (confirmed by user or inferred)
- Register: brand or product — explain the determination
- Two or three named anchor references with brief rationale
- Anti-goals: what this should NOT look like

### 5. Scope and fidelity
What level of completeness is expected. States to cover.

### 6. Recommended references

Which reference docs from `skills/wf/reference/design/` should be loaded for implementation:
- `typeset.md` — always
- `animate.md` — if transitions/motion needed
- `colorize.md` — if significant color work
- `layout.md` — if layout-heavy
- `harden.md` — if accessibility is a concern
- `optimize.md` — if performance is a concern

**Mirror this list as a `recommended-references:` array in `02b-design.md`'s YAML frontmatter** so `/wf implement` can resolve it deterministically:

```yaml
recommended-references: [typeset, animate, colorize, harden]
```

Names omit the `.md` extension. `/wf implement` reads each as `skills/wf/reference/design/<name>.md` and treats the loaded files as read-only design rationale during implementation. The frontmatter array is authoritative; the human-readable bullet list above is for the design reviewer's eye and may include conditional notes that the array does not.

## Visual direction is captured, not confirmed, here

The design brief records the **intended** visual direction — color strategy, scene
sentence, named anchor references, anti-goals — from the discovery interview. It does
**NOT** generate image probes and does **NOT** run a confirm gate. Those two moves belong
to `plan`:

- **Image probes + north-star mock** — `plan` invokes the `imagery` skill when it authors
  the visual contract (see [contract.md](contract.md) → *Land the visual direction*). Do
  not run `imagery` here.
- **Confirm gate** — `plan` presents the resolved direction and gets the user's approval
  (`shape=pass`) before writing `02c-craft.md`. The brief is revisable discovery output, not
  a locked contract.

Do **not** write a resolved `image-gate` to `02b-design.md` — its *absence* is the unresolved
state. `plan` writes the resolved `image-gate` (`pass`, or a reasoned `skipped:<reason>`) to
`02c-craft.md` when it lands the direction. (`image-gate` is a schema-validated frontmatter field
whose only values are `pass` and `skipped:*` — there is no `pending` value to write; "pending" is
just the conceptual state of an unwritten gate.)

## Output

When `shape` runs this procedure (`../shape.md` Step 5b):
- Write the brief to `.ai/workflows/<slug>/02b-design.md` (type `design`), with
  `recommended-references:` populated and **no** resolved `image-gate` (it stays unresolved for `plan`).
- Write the sibling `02b-design.yaml` + `02b-design.html.fragment` (see below).
- Leave `00-index.md` `current-stage: shape` (the brief is part of shape).
- Continue the normal shape flow (documentation plan, routing). `plan` will read `02b-design.md`,
  resolve the direction gates, and author the visual contract `02c-craft.md`.

## Step — Write the rich `.yaml` + fragment for `02b-design.md` (MANDATORY — do not skip)

The sunflower view renders the design page from a sibling `.yaml` + `.html.fragment`
written next to `02b-design.md`. **Without the `.yaml` the page silently degrades to
plain prose** — the swatch matrix, the token table, and the annotated specs never
appear (`design.mjs` gates the rich body on the sibling YAML). The `post-write-verify`
hook reminds you if you forget; author them here, now.

For the `02b-design.md` you just wrote:

1. Write the sibling **`02b-design.yaml`** — the structured data: `component:`,
   `themes:`, `states:`, `sizes:` (id, height, padx, pady), `tokens:` (name, category,
   value), `specs:` (reference, annotate). Schema: `siblingYamlSchemas.design` in
   `tests/frontmatter.schema.json`.
2. Write the sibling **`02b-design.html.fragment`** — the body-only interactive layer.

Before authoring the fragment, load
`${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_fragment-authoring.md` and apply
the shared wrapper, snippet, and verifier rules in addition to the design-
specific requirements below.

The fragment is one `<section class="fragment-design" data-artifact="design"
data-component="<component-name>">` that reproduces the gallery's design
fragment 1:1:

- **24-cell swatch matrix** (4 sizes × 3 states × 2 themes), each cell
  renders a live `<button class="ck-btn is-{default|hover|pressed}">` so
  the visual states show without JS.
- **Token table** with per-row inline swatch / spacing bar / easing curve
  preview / `<button class="btn copy-btn" data-token-copy="<value>">Copy</button>`.
- **Annotated specs SVG** with dimension lines and labels (padding-y,
  padding-x, gap, border-radius, height) referencing one cell from
  `specs.reference` in the YAML.

Authoring rules (verifier Check 7 enforces):

- Inline `<style>` scoped under `.fragment-design` / `.dz-*` / `.ck-*`.
- Inline `<script>` scoped via `document.currentScript.closest('.fragment-design')`
  — token-copy uses `data-token-copy` attributes and applies `.is-copied` flash.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready',
  { detail: { name: 'design', artifact: 'design',
    counts: { tokens: <n>, sizes: <n>, states: <n> } } }))`.
- Inline SVG only. Data deterministic from `02b-design.yaml`.

The fragment is **body-only**: the `design.mjs` renderer owns the page heading and the
metric-row — do **not** repeat them. Full contract:
[`reference/fragment-author-contract.md`](../../../reference/fragment-author-contract.md).
Gallery reference (bundled): [`reference/fragments-gallery.html`](../../../reference/fragments-gallery.html).
