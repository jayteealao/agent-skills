# Brief (design-brief authoring procedure)

Author the **design brief**: a structured artifact that guides UI implementation through discovery, not guesswork. This is **not a standalone command** — it is the brief-authoring procedure that the **`shape` lifecycle stage** runs (`../shape.md` Step 5a) when design is needed ([_lane.md](_lane.md)). The design stage runs it too when the brief is missing ([stage.md](stage.md) Step 2). It produces `02b-design.md`.

**Scope**: Design planning only. This procedure does NOT write code, does NOT generate image probes, and does NOT confirm visual direction. It produces the thinking that makes code good. The visual-direction gates (image probes + confirm) and the visual contract `02c-craft.md` are authored downstream by the **design stage** with the person (see [stage.md](stage.md) and [contract.md](contract.md)); this procedure leaves the image gate **unresolved** — it writes no resolved `image-gate` to `02b-design.md` — for the design stage to resolve.

## Philosophy

Most AI-generated UIs fail not because of bad code, but because of skipped thinking. They jump to "here's a card grid" without asking "what is the user trying to accomplish?" Shape inverts that: understand deeply first, so implementation is precise.

A sparse prompt is not a brief. Do **not** invent answers that no source provides. When at least one discovery question has no source answer, discovery requires one user-answer round. When every question is pre-filled from a recorded source, write the brief without a round.

## Phase 1: Discovery Interview

Do not write any code or make any design decisions during this phase. Your only job is to understand the feature deeply enough to make excellent design decisions later.

Apply the Release valve in [../_autonomy-guards.md](../_autonomy-guards.md). Before you ask any question, pre-fill the answers:

1. For each question in the rounds below, search the user prompt, the carried design thoughts ([_carried.md](_carried.md) → In the brief), PRODUCT.md, DESIGN.md, `.ai/design/current.md`, `.ai/design/direction.md`, and the codebase for an answer.
2. When a source answers a question, record the answer and the source in the brief. Do not ask that question.
3. Ask the unanswered questions in ONE batched round. Then stop and wait for the answers.
4. When no unanswered questions remain, skip the round and continue to Phase 2.

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

### 3b. UX intent
- The flows this change adds or alters, as numbered steps a person takes
- The states each step can reach (empty, loading, error, success, first-run) and what the person reads in each
- The user-facing text that changes
- How the change fits the current design (`.ai/design/current.md`) and which design goal in `.ai/design/direction.md` it serves; name any goal it strains

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
**NOT** draw surfaces or generate image probes, and does **NOT** run a confirm gate. Those two moves belong
to the design stage, which a person runs:

- **Drawings + north-star mock** — the design stage draws every changed surface when it authors
  the visual contract (see [contract.md](contract.md) → *Land the visual direction*). Do
  not run the design canvas or `imagery` here.
- **Confirm gate** — the design stage presents the resolved direction and gets the person's approval
  (`shape=pass`) before writing `02c-craft.md`. The brief is revisable discovery output, not
  a locked contract.

Do **not** write a resolved `image-gate` to `02b-design.md` — its *absence* is the unresolved
state. The design stage writes the resolved `image-gate` (`pass`, or a reasoned `skipped:<reason>`) to
`02c-craft.md` when it lands the direction. (`image-gate` is a schema-validated frontmatter field
whose only values are `pass` and `skipped:*` — there is no `pending` value to write; "pending" is
just the conceptual state of an unwritten gate.)

## Output

When `shape` runs this procedure (`../shape.md` Step 5a):
- Write the brief to `.ai/workflows/<slug>/02b-design.md` (type `design`), with
  `recommended-references:` populated and **no** resolved `image-gate` (it stays unresolved for the design stage).
- Write the sibling `02b-design.yaml` + `02b-design.html.fragment` (see below).
- Leave `00-index.md` `current-stage: shape` (the brief is part of shape).
- Continue the normal shape flow (documentation plan, routing). Shape routes to `/wf design <slug>`;
  the design stage reads `02b-design.md`, resolves the direction gates with the person, and authors
  the visual contract `02c-craft.md`.

## Step — Write the rich `.yaml` + fragment for `02b-design.md` (do not skip)

The sunflower view renders the design page from a sibling `.yaml` + `.html.fragment`
written next to `02b-design.md`. **Without the `.yaml` the page silently degrades to
plain prose** — the swatch matrix, the token table, and the annotated specs never
appear (`design.mjs` gates the rich body on the sibling YAML). Managed-artifact enforcement ([_host-invocation.md](../_host-invocation.md))
blocks the `.md` write if you forget; author them here, now.

For the `02b-design.md` you just wrote:

1. Write the sibling **`02b-design.yaml`** — the structured data: `component:`,
   `themes:`, `states:`, `sizes:` (id, height, padx, pady), `tokens:` (name, category,
   value), `specs:` (reference, annotate). Schema: `siblingYamlSchemas.design` in
   `tests/frontmatter.schema.json`.
2. Write the sibling **`02b-design.html.fragment`** — the body-only interactive layer.

Before authoring the fragment, load
`../_fragment-authoring.md` and apply
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
[`reference/fragment-author-contract.md`](../../../../reference/fragment-author-contract.md).
Gallery reference (bundled): [`reference/fragments-gallery.html`](../../../../reference/fragments-gallery.html).
