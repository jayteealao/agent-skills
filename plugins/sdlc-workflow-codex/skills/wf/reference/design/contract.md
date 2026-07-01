# Visual contract (visual-contract authoring procedure)

Author the **visual contract** `02c-craft.md`: the concrete spec `implement` builds against — a resolved visual direction + north-star mock + mock fidelity inventory + implementation contract.

This is **not a standalone command** — it is the contract-authoring procedure that the **`plan` stage** runs (`../plan.md`) when a design brief `02b-design.md` exists for the slice and no `02c-craft.md` has been written yet. It is also the procedure the standalone design **transforms** run to author their focused contract (`../design.md` Step 4A). It produces `02c-craft.md` (type `design-contract`).

**`plan` owns both design gates.** The brief (`02b-design.md`) is authored upstream at `shape` as plain discovery with the image gate left **unresolved** (no `image-gate` field written). This procedure resolves the two gates the brief deferred:

1. **Image gate** — generate the north-star mock/probes via the `imagery` skill, or record a reasoned skip. Writes the resolved `image-gate` — `pass` or `skipped:<reason>` — to `02c` (there is no `pending` value; the brief simply left it unset).
2. **Brief-confirm gate** — present the resolved visual direction and get the user's explicit approval (`shape=pass`) before writing the contract.

**Scope**: writing the contract does not itself mutate product code. `implement` applies the contract during the build.

## Build Gate

The visual contract requires a **confirmed visual direction** and a resolved image gate. Cannot write `02c-craft.md` until all of these are true:

1. PRODUCT context loaded (PRODUCT.md valid, ≥200 chars, no `[TODO]` markers).
2. **Direction source.** *Plan path:* `02b-design.md` exists (authored at `shape`) and its direction is **confirmed by the user** at this step, OR the user supplied an already-confirmed brief. *Transform path (`$wf design <slug> <transform>`, no brief):* there is **no `02b` to require** — the transform's own reference (e.g. `colorize.md`) plus `PRODUCT.md`/`DESIGN.md` are the direction source; confirm the transform's focused direction instead.
3. Visual-direction decision recorded: probes generated and the user chose a direction, OR skipped with a stated reason.
4. North-star mock decision recorded (Step 3 below).

**`shape=pass`** requires a user response approving the direction. PRODUCT.md and `teach` do not count. A self-authored direction without user confirmation does not pass the gate.

Invalid image-skip reasons: "the implementation will be semantic HTML/CSS/SVG", "a raster mock won't be used directly", "the product is fictional." Probes and mocks are direction artifacts, not implementation assets.

## Step 1: Load the direction source

**Transform path (no `02b`):** there is no brief to read — take the direction from the transform's own reference (e.g. `colorize.md`, `typeset.md`) plus `PRODUCT.md`/`DESIGN.md`, then skip to Step 2. **Plan path:** read `02b-design.md` and extract:
- Feature summary and user context
- Color strategy and scene sentence
- Register (brand / product) — load `brand.md` or `product.md` (this directory)
- Visual direction and anti-goals
- Recommended references (`recommended-references:` frontmatter array)

Load the recommended references from the brief. At minimum:
- `typeset.md` for type hierarchy
- The register reference (brand.md or product.md)

Add based on brief needs:
- `animate.md` — if transitions or motion
- `colorize.md` — if significant color work
- `layout.md` — if layout-heavy
- `harden.md` — if accessibility is critical
- `optimize.md` — if performance is critical

## Step 2: Load codebase context

Read codebase inspection results from prior sub-agents (plan's parallel research, or the `$wf design` preflight inspectors). Extract:
- Design tokens found (colors, spacing, fonts)
- Framework and component library
- Existing component patterns to follow or extend
- In-scope files

If codebase context is unavailable: search for `package.json` dependencies, relevant CSS files, and existing component examples using your native file-editing tools.

## Step 3: Land the visual direction (resolve the image gate + confirm)

Generate a high-fidelity north-star mock when:
- Work is net-new or visually open-ended
- Brief scope is mid-fi, high-fi, or production-ready
- Image generation is available

When conditions are met, this step is mandatory for both brand and product work.

Generate 1–3 high-fidelity comps:
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

Record the resolved `image-gate` in `02c-craft.md`'s frontmatter: `pass` after confirmation, or `skipped:<reason>`. (`02c` is authoritative; the `02b` brief left the gate unset — you may mirror the resolved value onto `02b` too, but it is not required.)

**Confirm gate.** The "yes to proceed" answer above is the `shape=pass` confirm gate. Do not write the contract until the user approves the direction (or explicitly skips the mock with a reason).

> **Optional live prototype (beside the static mock).** For an interactive HTML
> prototype of the approved direction, you may run `$uiproto <component description>`
> (or `uiproto stitch|llm …`). It writes a sandboxed `<iframe srcdoc>` fragment next
> to the contract artifact. Opt-in, sends the prompt to external engines (Stitch / an
> LLM), gated by `externalDispatch.enabled` — offer it, never run it automatically.

> **Auto second opinion.** Before writing the contract, **auto-invoke** `$consult codex
> <critique this design direction — does it satisfy the brief, and what visual or
> interaction risks does it carry?>` (pin `codex`/`claude` to stay free) whenever the
> direction involves real trade-offs — a read-only panel that gives the approved
> direction an independent design eye before the contract locks it in. Skip it for a
> trivial surface. The user may invoke it explicitly with any provider.

## Step 4: Mock fidelity inventory

List the visible ingredients from the approved mock or scene sentence that must survive into implementation:
- Composition and spatial relationships
- Typography choices (sizes, weights, families used)
- Color strategy execution (which elements carry which colors)
- Distinctive visual moves (the things that made the mock look non-generic)

These are the implementation contract. Code that loses them has regressed.

---

## Step 5: Write the visual contract

Write the visual contract artifact at `.ai/workflows/<slug>/02c-craft.md`. This is the spec the implement step applies — writing it does not itself mutate product code.

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
references-loaded: [union of the brief's recommended-references + any references loaded while authoring the contract — authoritative; wf-plan and wf-implement re-read this]
---
```

Body sections:

### 1. Visual direction confirmed
One paragraph summarizing the approved direction. Include the chosen probe (if applicable) and any deviations from the original brief that emerged during this step.

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
- **Motion**: which interactions need transitions — with timing, easing, and (for anything frequently-seen) whether it should animate at all; `animate.md` carries the frequency / easing / interruptibility rules
- **Finish & detail**: the interface-craft decisions that read as "off" when missed — concentric radius on nested surfaces, optical alignment, shadows-vs-borders for elevation, hit-area minimums (`polish.md`)
- **State coverage**: required states for each interactive element

### 5. Anti-patterns to avoid
Pulled from anti-goals in the brief plus the absolute bans list (`_design-context.md`). Be specific to this feature.

### 6. Implementation references
Which reference docs `$wf implement` should consult (typeset.md, animate.md, harden.md, etc.).

Record this list authoritatively in the `references-loaded:` frontmatter array above as the **union** of (a) the brief's `recommended-references:` (from `02b-design.md`) and (b) any references you loaded or added while authoring the contract. Names omit the `.md` extension and resolve to `skills/wf/reference/design/<name>.md`. This is the field `$wf implement` re-reads — together with `02b`'s `recommended-references:` — to load design rationale. A reference that appears only in this prose section but **not** in `references-loaded:` will NOT be loaded by implementation, so keep the two in sync.

### 7. Carry the contract into the plan
The contract is a `plan`-stage artifact. Reflect its obligations in the `04-plan-<slice>.md` steps: every `## Mock fidelity inventory` item becomes a concrete plan step, and the `## Implementation contract` token/component/motion decisions become plan-step pointers so `implement` applies them. Update `00-index.md` `current-stage: plan` (the contract is part of the plan stage). There is no hand-back to a separate design command.

---

## Step 6: Write the contract's rich `.yaml` + fragment (MANDATORY — do not skip)

The visual contract page (`02c-craft.md`, `type: design-contract`) renders from a
sibling `.yaml` + `.html.fragment` written next to it. `design-contract.mjs` gates its
interactive coverage grid on the sibling; **without the `.yaml` the page silently
degrades to the static frontmatter matrix** and the `post-write-verify` hook hard-blocks
the write (exit 2). Author both now, while the contract is in context. If this contract
genuinely has no structured coverage to project, set `fragment: none` in the
`02c-craft.md` frontmatter to opt out.

For the `02c-craft.md` you just wrote:

1. Write the sibling **`02c-craft.yaml`** — the authoritative structured data:
   `artifact: design-contract`, `component:`, `based-on:`, `summary:`, the
   coverage axes `tokens:` / `states:` / `sizes:` / `themes:` (string lists,
   mirroring the frontmatter), an optional `contract:` array of per-element rows
   (`element`, `tokens`, `states`, `requirement`), and optional `anti-patterns:`.
   Schema: `siblingYamlSchemas.design-contract` in `tests/frontmatter.schema.json`.
2. Write the sibling **`02c-craft.html.fragment`** — the body-only interactive layer.

Before authoring the fragment, load `../../wf/reference/_fragment-authoring.md` and apply
the shared wrapper, snippet, and verifier rules.

The fragment is one `<section class="fragment-design-contract"
data-artifact="design-contract" data-component="<component-name>">` (body-only —
`design-contract.mjs` owns the page heading and the tokens/states/sizes/themes
metric-row; do **not** repeat them):

- **Coverage grid** — a `tokens × states` (or `sizes × themes`) matrix showing
  which combinations the contract commits to, with committed cells marked.
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

Beyond the structured page, this artifact may ship one or more **free narrative fragments**: `<stem>.<NN-label>.html.fragment` siblings of **unrestricted raw HTML** that tell a story the rendered page can't on its own — a live component preview, an annotated mock, a token swatch board, or a before/after comparison. Author **as many as the story needs**; there is **no contract, no scoping, and no sibling `.yaml`** for these. Prefix the label with `NN-` (`01-`, `02-`, …) to order them; they inject raw-inline below the page body. See [_fragment-authoring.md](../../wf/reference/_fragment-authoring.md) Step F2 and [narrative-fragments.md](../../../references/narrative-fragments.md).
