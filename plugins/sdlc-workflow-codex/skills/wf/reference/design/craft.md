# Craft

Land the visual direction for a feature so implementation has a concrete contract — confirmed brief + north-star mock + mock fidelity inventory — and then build it.

`craft` is the **Producer** command. It authors the design **brief** (`02b-design.md`) and the visual **contract** (`02c-craft.md`), then — because design owns the downstream flow — continues straight into the build. There is **no hand-back** to a separate `$wf implement` command, and craft does **not** stop after writing the contract.

| Invocation | What `craft` authors | What happens after |
|---|---|---|
| `$wf design <slug> craft` (in-workflow) | `02b-design.md` + `02c-craft.md` against the existing slug. | The dispatcher drives `slice → plan → implement → verify` itself, compressed (`reference/design.md` Step 4A). **Code is written** — at the implement step, not in the contract step. |
| `$wf design craft` (no slug) | `02b-design.md` + `02c-craft.md` on a freshly created slug. | The dispatcher creates the slug and runs the full lifecycle (`intake → … → retro`); craft authors the design spec at the design step. |

Stopping after the contract is the `craft → implement` skip this model exists to close. The implement step (Step 6 below) applies the contract; it is reached by continuing the flow, never by handing back to `$wf implement`.

## Build Gate

The visual contract requires a **confirmed design brief**. `craft` authors that brief itself as Step 0 below — there is no separate `shape` command to run first. Cannot proceed past the contract until all of these are true:

1. PRODUCT context loaded (PRODUCT.md valid, ≥200 chars, no `[TODO]` markers).
2. Design brief authored and **confirmed by the user** (Step 0), OR user supplied an already-confirmed brief.
3. Probe selection recorded: generated and user chose a direction, OR skipped with a stated reason.
4. North-star mock decision recorded (Step 3 below).

**`shape=pass`** requires a separate user response approving the brief. PRODUCT.md and `teach` do not count. A self-authored brief without user confirmation does not pass the gate.

Invalid image-skip reasons: "the implementation will be semantic HTML/CSS/SVG", "a raster mock won't be used directly", "the product is fictional." Probes and mocks are direction artifacts, not implementation assets.

## Step 0: Author the design brief (if not already confirmed)

The design brief (`02b-design.md`) is part of `craft`, not a separate command. If a user-confirmed `02b-design.md` does not already exist for this slug, author it now by following the brief-authoring procedure in `shape.md` (this directory) — the discovery interview, the design-brief sections, the visual-direction probes, and the explicit confirm gate. Write the confirmed brief to `.ai/workflows/<slug>/02b-design.md` (type `design`), including the `recommended-references:` frontmatter array. Do not proceed to the contract until the user confirms the brief (`shape=pass`).

If a confirmed `02b-design.md` already exists (authored in a prior turn, or supplied by the user), load it and continue.

## Step 1: Load the confirmed brief

Read the confirmed design brief. Extract:
- Feature summary and user context
- Color strategy and scene sentence
- Register (brand / product) — load `brand.md` or `product.md` (this directory)
- Visual direction and probe selection
- Anti-goals
- Recommended references

Load the recommended references from the brief. At minimum:
- `typeset.md` for type hierarchy
- The register reference (brand.md or product.md)

Add based on brief needs:
- `animate.md` — if transitions or motion
- `colorize.md` — if significant color work
- `layout.md` — if layout-heavy
- `harden.md` — if accessibility is critical
- `optimize.md` — if performance is critical

## Step 2: Load codebase context (both modes)

Read codebase inspection results from preflight sub-agents. Extract:
- Design tokens found (colors, spacing, fonts)
- Framework and component library
- Existing component patterns to follow or extend
- In-scope files

If codebase context is unavailable (freestanding without prior inspection): search for `package.json` dependencies, relevant CSS files, and existing component examples using your native file-editing tools.

## Step 3: Land the visual direction (both modes)

Generate a high-fidelity north-star mock when:
- Work is net-new or visually open-ended
- Brief scope is mid-fi, high-fi, or production-ready
- Image generation is available

When conditions are met, this step is mandatory for both brand and product work.

Generate 1–3 high-fidelity comps:
- If shape produced direction probes: generate a more resolved mock from the winning lane, not a new exploration
- For brand: push visual identity, composition, and mood aggressively
- For product: push hierarchy, topology, and density while staying grounded in realistic product structure

Generate the north-star comp at **2K** fidelity via the `imagery` skill (it infers
the 2K tier from this north-star context and the output path, and reports the file
back — no flags):
```
imagery "<resolved brief prompt>"
```
(Bare `imagery` fans out; pin one — e.g. `imagery gemini "<resolved brief prompt>"` —
for a single 2K comp.)

Present the mock and ask the user directly in chat: "Does this match your visual direction? (yes to proceed / adjustments needed)"

If image generation unavailable: state in one line that the step is skipped because the harness lacks native image generation. Then proceed.

Record `image_gate=pass` after confirmation, or `image_gate=skipped:<reason>`.

> **Optional live prototype (beside the static mock).** For an interactive HTML
> prototype of the approved direction, you may run `$uiproto <component description>`
> (or `uiproto stitch|llm …`). It writes a sandboxed `<iframe srcdoc>` fragment next
> to the craft artifact. Opt-in, sends the prompt to external engines (Stitch / an
> LLM), gated by `externalDispatch.enabled` — offer it, never run it automatically.

## Step 4: Mock fidelity inventory (both modes)

List the visible ingredients from the approved mock or scene sentence that must survive into implementation:
- Composition and spatial relationships
- Typography choices (sizes, weights, families used)
- Color strategy execution (which elements carry which colors)
- Distinctive visual moves (the things that made the mock look non-generic)

These are the implementation contract. Code that loses them has regressed.

---

## Step 5: Write the visual contract

Write the visual contract artifact at `.ai/workflows/<slug>/02c-craft.md`. This is the spec the implement step applies — writing it does not itself mutate product code, but it is **not** a stopping point: after it is written the flow continues into the build (Step 5.7 → Step 6).

```yaml
---
schema: sdlc/v1
type: design-contract
slug: <slug>
title: <component> visual contract
status: ready
created-at: <timestamp>
updated-at: <timestamp>
component: <component or surface name>
based-on: 02b-design.md
tokens: [list of token names or token groups used]
states: [default, hover, focus, active, disabled, loading, empty, error]
sizes: [mobile, tablet, desktop]
themes: [light, dark]
refs:
  design: 02b-design.md
register: <brand|product>
image-gate: <pass|skipped:<reason>>
north-star-mock: <path or "none">
references-loaded: [union of the brief's recommended-references + any references craft loaded — authoritative; wf-plan and wf-implement re-read this]
---
```

Body sections:

### 1. Visual direction confirmed
One paragraph summarizing the approved direction. Include the chosen probe (if applicable) and any deviations from the original shape brief that emerged during craft.

### 2. North-star mock
- Path to the generated mock image (or "none — text-only direction")
- Scene sentence (always)
- Annotated callouts: 5–10 specific visual elements in the mock, each with a short description and an implementation note

### 3. Mock fidelity inventory
The non-negotiable visible ingredients. Each entry: what it is, where in the mock, why it matters.

Format:
```
1. <ingredient> — <where in mock> — <why non-negotiable>
2. ...
```

### 4. Implementation contract
Specific decisions for `$wf implement` to follow:
- **Token choices**: which existing tokens to use, which new tokens to add
- **Component decisions**: extend existing component X / create new component Y
- **Layout structure**: grid choice, breakpoint behavior
- **Type scale**: which sizes/weights from the brief apply where
- **Color application**: which elements carry which colors in the strategy
- **Motion**: which interactions need transitions (with timing if specified)
- **State coverage**: required states for each interactive element

### 5. Anti-patterns to avoid
Pulled from anti-goals in the brief plus the absolute bans list. Be specific to this feature.

### 6. Implementation references
Which reference docs `$wf implement` should consult (typeset.md, animate.md, harden.md, etc.).

Record this list authoritatively in the `references-loaded:` frontmatter array above as the **union** of (a) the brief's `recommended-references:` (from `02b-design.md`) and (b) any references you loaded or added during craft. Names omit the `.md` extension and resolve to `skills/wf/reference/design/<name>.md`. This is the field `$wf-plan` and `$wf implement` re-read — together with `02b`'s `recommended-references:` — to load design rationale. A reference that appears only in this prose section but **not** in `references-loaded:` will NOT be loaded by implementation, so keep the two in sync.

### 7. Continue the flow — do NOT hand back

Update `00-index.md`:
- `current-stage: design` → unchanged (craft is part of the design stage)

Then **continue straight into the build** as the dispatcher directs (`reference/design.md` Step 4A): drive `slice → plan → implement → verify` yourself, compressed, writing each numbered artifact. The implement step applies this contract and the cited references (Step 6 below). Do **not** write `next-command: $wf implement` and stop — that hand-back is exactly the `craft → implement` skip this model removed.

---

## Step 6: Build against the contract (the implement step)

When the flow reaches the implement step — the dispatcher drives it in the compressed in-workflow flow; it is the implement stage of the full lifecycle in the no-slug flow — build the actual code against the contract.

Build with the project's real stack, following the conventions discovered in codebase context.

### Implementation principles

- Use design tokens from the discovered codebase token system, not hard-coded values
- Follow the existing component vocabulary (don't introduce a new button style if one exists)
- Every interactive component must have: default, hover, focus, active, disabled states
- Loading states: skeletons not spinners for content areas
- `@media (prefers-reduced-motion: reduce)` for all animations — but design for motion first
- OKLCH for any new color values; never `#000` or `#fff`

### Absolute bans

- `border-left` or `border-right` > 1px as a colored decorative stripe — use a full hairline border, background tint, or leading glyph instead
- Purple-blue generic gradients
- Generic hero metric cards without real product proof
- Nested card-inside-card layouts
- Bounce or elastic easing
- Display fonts in UI labels, buttons, or data cells (product register)

## Step 7: Critique-and-fix pass

After the implementation, run at least one critique-and-fix pass:

1. Check the implementation against the mock fidelity inventory — what was lost?
2. Check against the anti-goals in the brief — what should not be there?
3. Check against the relevant register reference (brand.md or product.md) — any violations?
4. Run the slop test: would someone say "AI made this"? Fix the generic moves.
5. Check component states: all required states implemented?
6. Check responsive behavior at relevant breakpoints.

Apply fixes. Repeat until no material defects remain.

---

## Step — Write the rich `.yaml` + fragment (MANDATORY — do not skip)

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
2. Write the sibling **`02b-design.html.fragment`** — the body-only interactive layer
   described next.

Before authoring the fragment, load
`../../wf/reference/_fragment-authoring.md` and apply
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
  — token-copy uses `data-token-copy` attributes and applies `.is-copied`
  flash.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready',
  { detail: { name: 'design', artifact: 'design',
    counts: { tokens: <n>, sizes: <n>, states: <n> } } }))`.
- Inline SVG only. Data deterministic from `02b-design.yaml`.

Full contract:
[`reference/fragment-author-contract.md`](../../../references/fragment-author-contract.md).
Gallery reference (bundled): [`reference/fragments-gallery.html`](../../../references/fragments-gallery.html).

### Use `@include` for shared chrome (v9.20.1+)

The fragment is **body-only** (see `_fragment-authoring.md` → "Scope"): the
`design.mjs` renderer owns the page heading and the metric-row. Do **not** repeat
them in the fragment — it carries the interactive layer (the live swatch matrix,
the token table with copy controls, and the theme toggle):

```html
<section class="fragment-design" data-artifact="design" data-component="checkout-button">
  <!-- No heading, no metric-row here — the page owns them. -->

  <div class="dz-matrix"> …24-cell live swatch matrix… </div>
  <table class="dz-tokens"> …token rows, each with a copy control… </table>
  <svg class="dz-specs"> …annotated specs… </svg>

  <!-- @include fragment-ready { "name": "design", "artifact": "design",
       "detailJson": "{\"counts\":{\"tokens\":14,\"sizes\":4,\"states\":3}}" } -->
</section>
```

Snippet catalogue: `metric-row`, `callout`, `verdict`, `severity-chip`,
`fragment-ready`, `files-touched-row`, `diff-block`.

## Step — Write the contract's own rich `.yaml` + fragment (MANDATORY — do not skip)

The visual contract page (`02c-craft.md`, `type: design-contract`) renders from a
sibling `.yaml` + `.html.fragment` written next to it — **distinct** from the design
brief's `design` fragment above. `design-contract.mjs` gates its interactive
coverage grid on the sibling; **without the `.yaml` the page silently degrades to
the static frontmatter matrix** and the `post-write-verify` hook hard-blocks the
write (exit 2). Author both now, while the contract is in context. If this contract
genuinely has no structured coverage to project, set `fragment: none` in the
`02c-craft.md` frontmatter to opt out.

For the `02c-craft.md` you just wrote:

1. Write the sibling **`02c-craft.yaml`** — the authoritative structured data:
   `artifact: design-contract`, `component:`, `based-on:`, `summary:`, the
   coverage axes `tokens:` / `states:` / `sizes:` / `themes:` (string lists,
   mirroring the frontmatter), an optional `contract:` array of per-element rows
   (`element`, `tokens`, `states`, `requirement`), and optional `anti-patterns:`.
   Schema: `siblingYamlSchemas.design-contract` in `tests/frontmatter.schema.json`.
2. Write the sibling **`02c-craft.html.fragment`** — the body-only interactive
   layer described next.

Before authoring the fragment, load
`../../wf/reference/_fragment-authoring.md` and apply the
shared wrapper, snippet, and verifier rules.

The fragment is one `<section class="fragment-design-contract"
data-artifact="design-contract" data-component="<component-name>">` (body-only —
`design-contract.mjs` owns the page heading and the tokens/states/sizes/themes
metric-row; do **not** repeat them):

- **Coverage grid** — a `tokens × states` (or `sizes × themes`) matrix showing
  which combinations the contract commits to, with committed cells marked. This
  is the interactive layer the static frontmatter matrix can't draw.
- **Per-element contract rows** — one expandable row per `contract[]` entry
  (element → required tokens/states → requirement text), so `$wf implement` can
  scan the obligations.
- **Anti-pattern callouts** — `anti-patterns[]` as `callout-warn` asides.

Authoring rules (verifier enforces):

- Exactly one top-level `<section class="fragment-design-contract">`; no remote
  `<script src>`; inline `<style>`/`<script>` scoped under
  `.fragment-design-contract` / `document.currentScript.closest('.fragment-design-contract')`.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready',
  { detail: { name: 'design-contract', artifact: 'design-contract',
    counts: { tokens: <n>, states: <n>, sizes: <n>, themes: <n> } } }))`.
- Inline SVG only. Data deterministic from `02c-craft.yaml`. Pass
  `node scripts/verify-fragment.mjs <path>` with exit 0.

Full contract:
[`reference/fragment-author-contract.md`](../../../references/fragment-author-contract.md).

## Step — Write free narrative fragments

Beyond the structured page, this artifact ships one or more **free narrative fragments**: `<stem>.<NN-label>.html.fragment` siblings of **unrestricted raw HTML** that tell a story the rendered page can't on its own — a live component preview, an annotated mock, a token swatch board, or a before/after comparison. Author **as many as the story needs**; there is **no contract, no scoping, and no sibling `.yaml`** for these. Prefix the label with `NN-` (`01-`, `02-`, …) to order them; they inject raw-inline below the page body. See [_fragment-authoring.md](../../wf/reference/_fragment-authoring.md) Step F2 and [narrative-fragments.md](../../../references/narrative-fragments.md).
