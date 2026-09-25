# Visual contract (visual-contract authoring procedure)

Author the **visual contract** `02c-craft.md`: the concrete spec `implement` builds against — a resolved visual direction + north-star mock + mock fidelity inventory + implementation contract.

This is **not a standalone command** — it is the contract-authoring procedure that the **design stage** runs ([stage.md](stage.md)) with the person, between `shape` and `slice`. It covers every surface the feature changes, not one slice. It produces `02c-craft.md` (type `design-contract`).

**The design stage owns both design gates.** No driven stage resolves them. The brief (`02b-design.md`) is authored upstream at `shape` as plain discovery with the image gate left **unresolved** (no `image-gate` field written). This procedure resolves the two gates the brief deferred:

1. **Image gate** — generate the north-star mock/probes via the `imagery` skill, or record a reasoned skip. Writes the resolved `image-gate` — `pass` or `skipped:<reason>` — to `02c` (there is no `pending` value; the brief simply left it unset).
2. **Brief-confirm gate** — resolve `shape=pass` from a recorded user-backed direction source before writing the contract: an in-session user response, a user-confirmed PRODUCT.md, or a prior `teach` answer. When no recorded source exists, present the resolved visual direction and get the user's approval.

**Scope**: writing the contract does not itself mutate product code. `implement` applies the contract during the build.

## Build Gate

The visual contract requires a **confirmed visual direction** and a resolved image gate. Cannot write `02c-craft.md` until all of these are true:

1. PRODUCT context loaded (PRODUCT.md valid, ≥200 chars, no `[TODO]` markers). When it is not, the design stage runs `/wf design setup` with the person first; it does not stop the workflow.
2. **Direction source.** `02b-design.md` exists (authored at `shape`, or by the design stage when it was missing) and its direction is **confirmed** by one of the `shape=pass` sources below. When the person named a move, the move's reference focuses the direction; it does not replace the brief.
3. Visual-direction decision recorded: probes generated and the user chose a direction, OR skipped with a stated reason.
4. North-star mock decision recorded (Step 3 below).

**`shape=pass`** requires a direction the user confirmed. Three sources satisfy the gate: a user response in this session, a user-confirmed PRODUCT.md, or a prior `teach` answer from the user. Record which source satisfied the gate. A self-authored direction with no user-confirmed source does not pass the gate.

Apply the Release valve in [../_autonomy-guards.md](../_autonomy-guards.md). Pre-fill every question that the user prompt, PRODUCT.md, DESIGN.md, or the codebase already answers, and record each pre-filled answer with its source. Ask only the unanswered questions, in ONE batched round.

Invalid image-skip reasons: "the implementation will be semantic HTML/CSS/SVG", "a raster mock won't be used directly", "the product is fictional." Probes and mocks are direction artifacts, not implementation assets.

## Step 1: Load the direction source

Read `02b-design.md` and the design record (`.ai/design/current.md`, `.ai/design/direction.md`), and extract:
- Feature summary and user context
- Color strategy and scene sentence
- Register (brand / product) — load `brand.md` or `product.md` (this directory)
- Visual direction and anti-goals
- Recommended references (`recommended-references:` frontmatter array)
- The UX intent (flows, states, user-facing text)
- The design goals and future direction the surfaces must serve

Load the recommended references from the brief, plus the move the person named. At minimum:
- `typeset.md` for type hierarchy
- The register reference (brand.md or product.md)

Add based on brief needs:
- `animate.md` — if transitions or motion
- `colorize.md` — if significant color work
- `layout.md` — if layout-heavy
- `harden.md` — if accessibility is critical
- `optimize.md` — if performance is critical

## Step 2: Load codebase context

Read codebase inspection results from the design stage's preflight inspectors. Extract:
- Design tokens found (colors, spacing, fonts)
- Framework and component library
- Existing component patterns to follow or extend
- In-scope files

If codebase context is unavailable: run a quick scan to identify `package.json` dependencies, relevant CSS files, existing component examples.

## Step 3: Land the visual direction (resolve the image gate + confirm)

Draw the direction when:
- Work is net-new or visually open-ended
- Brief scope is mid-fi, high-fi, or production-ready
- The design canvas or image generation is available

When conditions are met, this step is mandatory for both brand and product work.

- For brand: push visual identity, composition, and mood aggressively
- For product: push hierarchy, topology, and density while staying grounded in realistic product structure

**First choice — the design canvas.** When the host offers one (`_host-invocation.md`, row "Design canvas"), draw one artboard per surface and state, using the tokens and components in `DESIGN.md`. Record the canvas link as `canvas:` and name the north-star artboard in `north-star-mock:`.

**Fallback — generated comps.** When the host has no design canvas, generate 1–3 north-star comps at **2K** fidelity via the `imagery` skill (it infers
the 2K tier from this north-star context and the output path, and reports the file
back — no flags):
```
/imagery "<resolved brief prompt>"
```
(Bare `/imagery` fans out to every available backend; pin one — e.g.
`/imagery gemini "<resolved brief prompt>"` — for a single 2K comp.) When the person wants an
interactive prototype of the approved direction, offer `/uiproto <component description>` (or
`/uiproto stitch|llm …`). It writes a sandboxed `<iframe srcdoc>` fragment next to the contract,
sends the prompt to external engines, and is gated by `externalDispatch.enabled`. Offer it; never
run it automatically.

Present the drawings. The approval question is asked by `stage.md` Step 5 (approve / adjust / stop).

If no canvas and no provider in `/imagery`'s table is available (no built-in tool on this host, no key for a scripted provider, egress consent off): state in one line that the step is skipped and why. Then proceed with a text direction.

Record the resolved `image-gate` in `02c-craft.md`'s frontmatter: `pass` after confirmation, or `skipped:<reason>`. (`02c` is authoritative; the `02b` brief left the gate unset — you may mirror the resolved value onto `02b` too, but it is not required.)

**Confirm gate.** `shape=pass` is satisfied by the "yes to proceed" answer above, or by a recorded user-backed direction source (a user-confirmed PRODUCT.md, or a prior `teach` answer) — record which source satisfied the gate. Do not write the contract while no user-backed source exists, and never leave the mock neither confirmed nor explicitly skipped with a reason.

> **Auto second opinion.** When the direction chose among competing options, introduces
> a new interaction pattern or primary surface, or the brief left a visual-direction
> gate open, **auto-invoke** `/consult codex <critique this design direction — does it
> satisfy the brief, and what visual or interaction risks does it carry?>` (pinning
> `codex`/`claude` keeps it free). Dispatch the consult **concurrently with the Step 4
> mock fidelity inventory** — start both at the same time; do not wait for one before
> you start the other. The consult is a read-only panel that gives the approved
> direction an independent design eye. Read the panel result before Step 5 writes the
> contract. Fire it rather than offering it; skip it only for a trivial, single-option
> surface. The user may invoke it explicitly with any provider.

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
north-star-mock: <path, artboard name, or "none">
canvas: <design canvas link, or "none">
direction-confirmed-by: <in-session|product-md|teach>
confirmed-at: <timestamp>
surfaces: [every surface drawn]
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
Specific decisions for `/wf implement` to follow:
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
Which reference docs `/wf implement` should consult (typeset.md, animate.md, harden.md, etc.).

Record this list authoritatively in the `references-loaded:` frontmatter array above as the **union** of (a) the brief's `recommended-references:` (from `02b-design.md`) and (b) any references you loaded or added while authoring the contract. Names omit the `.md` extension and resolve to `skills/wf/reference/design/<name>.md`. This is the field `/wf implement` re-reads — together with `02b`'s `recommended-references:` — to load design rationale. A reference that appears only in this prose section but **not** in `references-loaded:` will NOT be loaded by implementation, so keep the two in sync.

### 7. How the later stages carry the contract
The contract is a design-stage artifact. `slice` maps its surfaces to slices; `plan` turns every `## Mock fidelity inventory` item into a concrete plan step and every `## Implementation contract` token/component/motion decision into a plan-step pointer; `implement` applies them ([_lane.md](_lane.md) → One duty per stage). Update `00-index.md` per [stage.md](stage.md) Step 6. A later stage that cannot build the contract as drawn routes to `/wf design <slug> amend`; it never edits the contract itself.

---

## Step 6: Write the contract's rich `.yaml` + fragment (do not skip)

The visual contract page (`02c-craft.md`, `type: design-contract`) renders from a
sibling `.yaml` + `.html.fragment` written next to it. `design-contract.mjs` gates its
interactive coverage grid on the sibling; **without the `.yaml` the page silently
degrades to the static frontmatter matrix** and managed-artifact enforcement ([_host-invocation.md](../_host-invocation.md)) hard-blocks
the write. Author both now, while the contract is in context. If this contract
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

Before authoring the fragment, load
`../_fragment-authoring.md` and apply the
shared wrapper, snippet, and verifier rules.

The fragment is one `<section class="fragment-design-contract"
data-artifact="design-contract" data-component="<component-name>">` (body-only —
`design-contract.mjs` owns the page heading and the tokens/states/sizes/themes
metric-row; do **not** repeat them):

- **Coverage grid** — a `tokens × states` (or `sizes × themes`) matrix showing
  which combinations the contract commits to, with committed cells marked.
- **Per-element contract rows** — one expandable row per `contract[]` entry
  (element → required tokens/states → requirement text), so `/wf implement` can
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
[`reference/fragment-author-contract.md`](../../../../reference/fragment-author-contract.md).

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](../_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).
