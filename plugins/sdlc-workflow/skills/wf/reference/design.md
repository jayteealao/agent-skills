---
description: Design dispatcher for UI/UX transforms + analysis, run as a compressed `wf` workflow. The design brief (`02b-design.md`) is authored upstream at `shape` and the visual contract (`02c-craft.md`) at `plan`; this command hosts the ad-hoc design operators. `/wf design <slug> <cmd>` authors a focused contract then drives slice→plan→implement→verify itself; `/wf design <cmd>` runs the full lifecycle on a new slug. 20 design commands (the 15 transforms, audit, critique, extract, setup, teach) are arguments, never their own keys.
argument-hint: "[slug] <audit|critique|extract|setup|teach|animate|bolder|clarify|colorize|delight|distill|harden|layout|onboard|optimize|overdrive|polish|quieter|typeset|adapt> [instructions]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are the **design dispatcher** for the SDLC plugin, invoked as `/wf design`.
Design is **one `wf` sub-command that runs as a compressed workflow** — not a parallel router.
The design **brief** (`02b-design.md`) is authored upstream at `shape` and the visual **contract**
(`02c-craft.md`) at `plan` (following `design/shape.md` and `design/contract.md`); this command
hosts the ad-hoc design operators — the transforms and the analysis/context commands. For build
commands you **drive the downstream lifecycle stages yourself**, compressed, so design knowledge
is both applied here and consumed by `slice`/`plan`/`implement`/`verify`/`review`.

The 20 design commands are *arguments* to this one key. The 15 transforms produce
or modify code; `audit`/`critique` produce review reports; `extract` reverse-engineers tokens;
`setup`/`teach` author project context. Your job: parse the invocation, resolve the command,
load the shared design context, run preflight, load the command's reference, then run the
flow span the command's category dictates.

> **Narrative fragments.** Any artifact may ship free narrative fragments — design work
> especially benefits (a live component preview, an annotated mock, a token swatch board).
> Rules: [_fragment-authoring.md](_fragment-authoring.md) Step F2.

# Step 0 — Parse the invocation (slug-vs-command resolution)

**Grammar:** `/wf design <possible-slug> <design-command> <possible-additional-instructions>`

`$ARGUMENTS` reaches you with the leading `design` key already stripped by `wf/SKILL.md`. The
first remaining token is an **optional slug**. Resolve it by **exact existence check — never
fuzzy** (a wrong guess sends the work down the wrong flow):

1. **If `.ai/workflows/<token0>/00-index.md` exists** → `token0` is the **slug**; `token1` is
   the `<design-command>`; the rest are instructions. This is the **in-workflow** shape.
2. **Else** → `token0` is the `<design-command>` (the **no-slug** shape); the rest are
   instructions. Do NOT treat a non-matching first token as a typo'd slug — for `design` the
   first token is a command, so Step 0.5 fuzzy-suggest in `wf/SKILL.md` is intentionally
   bypassed for this key.

**Known design commands** (the `<design-command>` must be one of these — otherwise STOP and
render usage):
`audit`, `critique`, `extract`, `setup`, `teach`, `animate`, `bolder`, `clarify`,
`colorize`, `delight`, `distill`, `harden`, `layout`, `onboard`, `optimize`, `overdrive`,
`polish`, `quieter`, `typeset`, `adapt`.

**Zero design-command** (no command resolvable) → STOP. Render usage:
```
Usage:
  /wf design <slug> <command> [instructions]   In-workflow: produce the design, then build it
                                                (compressed slice→plan→implement→verify).
  /wf design <command> [instructions]          No slug: create a new workflow and run the full
                                                lifecycle (intake → … → retro), seeded by design.

Commands: audit · critique · extract · setup · teach · animate · bolder · clarify ·
colorize · delight · distill · harden · layout · onboard · optimize · overdrive · polish ·
quieter · typeset · adapt

(The design brief + visual contract are authored by the normal lifecycle — `shape` writes
`02b-design.md`, `plan` writes `02c-craft.md` — not by a design command here.)
```

**Record** the resolved shape (in-workflow | no-slug), slug (if any), command, and instructions
before proceeding.

# Step 1 — Load shared context + preflight

1. **Load the shared design context** in full:
   `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/design/_design-context.md`. It is the single
   source of truth for the **register** (brand/product), the **shared design laws**, the
   **absolute bans**, the **preflight gates**, the **4 codebase-inspection sub-agents**, and the
   **image gate** (the mutation lock). Apply it; do not restate or fork its rules here.
   - **Reusable-component targets** — if the command's target is a *reusable design-system
     component* (a shared primitive or widget, not a one-off screen), also load
     `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/design/_component-craft.md` for the DX-first
     API, excellent-defaults, memorable-naming, and touchable-example canon. This mirrors what
     `/wf implement` loads for reusable components, so a standalone `/wf design <transform>` on a
     component is held to the same bar as the lifecycle path. Skip it for one-off screens and for
     `setup`/`teach`/`audit`/`critique`/`extract`.
2. **In-workflow shape** — read `.ai/workflows/<slug>/00-index.md`. Parse `title`,
   `current-stage`, `status`, `branch`, `stack`, `open-questions`, `augmentations`. If
   `status: closed` → STOP (*"Workflow `<slug>` is closed. Use `/wf recap <slug>` to
   reopen."*). Reuse the `stack` fingerprint for the inspection sub-agents where it answers the
   question.
3. **Run the preflight gates** from `_design-context.md`. The **image gate** stays
   `pending` (blocks code mutation) until the contract step (`design/contract.md`, run for a
   transform's focused contract) resolves it to `pass` or a reasoned `skipped:<reason>`.
   `setup`/`teach`/`extract`/`audit`/`critique` relax the codebase gate (read-only or
   context-authoring).
4. **Transform contract gate** — a transform that produces code authors a **focused
   `02c-craft.md`** for its surface (following `design/contract.md`) and resolves the image gate
   before mutation. There is no separate brief step here — a full design brief (`02b-design.md`)
   is authored at `shape` when the work runs through the normal lifecycle.

# Step 2 — Resolve command → category → flow span

The `<design-command>` resolves to a **category**, and the category decides how far the flow
travels. Run only the stages the category needs. This is the single category→span map (a future
operator is one new row):

| Category | Commands | In-workflow span (`<slug>` given) | No-slug span |
|---|---|---|---|
| **Transformation** | the 15 (`colorize`, `harden`, `typeset`, `adapt`, `animate`, `bolder`, `clarify`, `delight`, `distill`, `layout`, `onboard`, `optimize`, `overdrive`, `polish`, `quieter`) | focused `02c-craft` → `slice` → `plan` → `implement` → `verify` (the transform **is** the implement step) | create slug → **full lifecycle** `intake → … → retro` |
| **Review / analysis** | `audit`, `critique` | single review step → `07-design-audit.md` / `07-design-critique.md`; **no slice/plan/implement** (audit reads the slug's `06-verify` metrics) | standalone one-shot report against the target code (lightweight record) |
| **Inspection** | `extract` | single read-only step → `design-notes/extract-<timestamp>.md` + `design-notes/tokens-extracted.css`; no build | standalone extract report |
| **Context** | `setup`, `teach` | write `PRODUCT.md` / `DESIGN.md` (project-root, slug-independent) | identical — project-root files, no stages |

> **Where the brief + full contract come from.** The design **brief** (`02b-design.md`) is
> authored at `shape` and the full **visual contract** (`02c-craft.md`) at `plan` — the normal
> lifecycle, not a command here. A **transform** authors only a *focused* `02c-craft.md` scoped
> to its one move. There is no `craft` Producer command; UI work that needs a full brief +
> contract flows `shape → plan → implement`.

Notes:
- Only **Transformation** produces code, so it is the only category that runs the
  build span (and the no-slug full lifecycle). Review / inspection / context commands are
  single-step regardless of slug; the slug only decides whether the artifact attaches to an
  existing workflow or is a standalone record.
- **The old "you can't transform code that doesn't exist yet" gate inverts.** The compressed
  flow *builds* the code at its `implement` step, so a transform no longer needs pre-existing
  code — it either creates the surface or modifies the slug's existing implementation, both at
  `implement`. Do not block a transform for "nothing to transform yet."

# Step 3 — Load the command reference

Load the reference for the resolved command from
`${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/design/<command>.md` and follow it verbatim. Do not
summarize, paraphrase, or skip. The reference is the authoritative instruction for *what* the
command does; this dispatcher governs *how far the flow runs* around it.

| Command | Reference file | Purpose |
|---|---|---|
| `audit` | `design/audit.md` | Technical quality scan (a11y, perf, theming, responsive, anti-patterns) + 0–4 scoring |
| `critique` | `design/critique.md` | Prescriptive, register-forked design feedback |
| `extract` | `design/extract.md` | Reverse-engineer design tokens from existing code |
| `setup` | `design/setup.md` | Create PRODUCT.md and DESIGN.md |
| `teach` | `design/teach.md` | Update or improve existing context files |
| `animate` | `design/animate.md` | Purposeful motion and micro-interactions |
| `bolder` | `design/bolder.md` | Increase visual presence and hierarchy |
| `clarify` | `design/clarify.md` | Reduce cognitive load and improve scannability |
| `colorize` | `design/colorize.md` | Strategic color (border-stripe ABSOLUTE BAN) |
| `delight` | `design/delight.md` | Moments of joy and personality (performance-delight) |
| `distill` | `design/distill.md` | Remove complexity to the essential core (classify-then-cut) |
| `harden` | `design/harden.md` | Accessibility and robustness (structured report) |
| `layout` | `design/layout.md` | Spatial structure, grid, alignment |
| `onboard` | `design/onboard.md` | Empty states and first-run experience |
| `optimize` | `design/optimize.md` | Performance (profile-before-optimizing) |
| `overdrive` | `design/overdrive.md` | Technically extraordinary visual effects |
| `polish` | `design/polish.md` | Finishing details and 7-state completeness |
| `quieter` | `design/quieter.md` | Reduce noise and visual complexity |
| `typeset` | `design/typeset.md` | Typography quality and hierarchy (18-font reject) |
| `adapt` | `design/adapt.md` | Context adaptation (responsive, platform, theme + dark-mode tokens + print) |

# Step 4 — Run the flow span

## 4A — Transformation (build commands)

These produce code, so they run the build span. The compressed flow reuses the compressed intake modes'
collapsed-stage machinery — thin single slice, minimal plan, no multi-round interviews — but
**still emits each numbered artifact** so the rendered views and downstream gates see a normal
workflow.

**In-workflow shape (`<slug>` given) — compressed, NO hand-back:**

1. **Author the focused design contract.**
   - A transform authors a **focused `02c-craft.md`** (type `design-contract`) scoped to the
     transform's surface (the transform's reference defines the goal — e.g. `colorize`'s color
     strategy, `typeset`'s type scale), following `design/contract.md` — resolve the image gate,
     record the mock-fidelity inventory and `references-loaded:`. The transform's playbook is what
     `implement` applies.
   - Write the sibling `.yaml` + `.html.fragment` for the contract (see `design/contract.md`).
2. **Drive the build, compressed, yourself.** For each stage in the span, load
   `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/<stage>.md` and run it in compressed mode, writing
   its numbered artifact:
   - `slice` → `03-slice*` (a single thin slice unless the brief's state/surface inventory
     clearly demands more),
   - `plan` → `04-plan-<slice>.md` (cites the design references as concrete plan-step pointers),
   - `implement` → `05-implement-<slice>.md` (applies the transform playbook for each cited
     reference; **registers each as a `design-<sub>` augmentation** in `00-index.md`),
   - `verify` → `06-verify-<slice>.md` (the measurable design floor — a11y/perf/responsive +
     per-augmentation re-checks).
   - **Do NOT write the contract and stop.** A transform *owns* its downstream flow — there is
     no hand-back to `/wf slice`. Continuing straight through is what fires the slice/plan/
     implement/verify design-consumers; stopping early is the latent contract → implement skip.
3. Update `00-index.md` `current-stage` as you advance; keep `augmentations:` current.

**No-slug shape — full lifecycle:** create a new slug (run `intake`), then run the complete
`intake → shape → slice → plan → implement → verify → review → handoff → ship → retro` flow with
the design intent seeding it (the brief is authored at `shape`, the visual contract at `plan`).
Use the standard stage references; the compression is lighter than the in-workflow shape because
the lifecycle is being established fresh.

## 4B — Review / analysis (`audit`, `critique`)

Single step, no build. Follow the command reference and write the report:
- `audit` → `07-design-audit.md`. **Consume `verify`'s already-measured a11y/perf/web-vitals
  from `06-verify-*.md` rather than re-running axe-core**; add theming/responsive/anti-pattern
  judgment + 0–4 scoring. If no verify ran (ad-hoc / no-slug), measure it yourself.
- `critique` → `07-design-critique.md`. Register-forked (brand=distinctiveness,
  product=earned-familiarity); preserve the stance rules + font reflex-reject.
- These are *also* run as dimensions inside `/wf review`'s parallel fan-out (see `review.md`);
  the ad-hoc `/wf design audit|critique` path here is the same logic invoked standalone.
- a11y/perf are **measured once in `verify`, interpreted in `review`/`audit`** — never re-measured
  in the brief/contract authoring steps (`shape`/`plan`).

## 4C — Inspection (`extract`)

Read-only. Follow `design/extract.md`; write `design-notes/extract-<timestamp>.md` +
`design-notes/tokens-extracted.css`. No code, no build. Needs no prior context (its defining
trait).

## 4D — Context (`setup`, `teach`)

Write `PRODUCT.md` / `DESIGN.md` at the **project root** (shared across features — NOT per-slug
artifacts). Preserve the `[TODO]` + `<!-- intentionally omitted -->` conventions. Identical
behavior with or without a slug.

# Step 5 — Artifact output + augmentation registration

| Command | Artifact(s) | `00-index.md` updates |
|---|---|---|
| `setup`, `teach` | PRODUCT.md / DESIGN.md (project root) | none |
| Transformation (15) | focused `02c-craft.md`, then the build-span artifacts; `design-notes/<sub>-<timestamp>.md` documenting changes | append `design-<sub>` to `augmentations:` |
| `audit` | `07-design-audit.md` | append `design-audit` to `augmentations:` |
| `critique` | `07-design-critique.md` | append `design-critique` to `augmentations:` |
| `extract` | `design-notes/extract-<timestamp>.md` + `tokens-extracted.css` | none |

**Augmentation registration** (transformations, audit, critique) — create `augmentations:` in
`00-index.md` if absent:

```yaml
augmentations:
  - type: design-<sub-command>
    artifact: design-notes/<sub-command>-<timestamp>.md   # or 07-design-audit.md / 07-design-critique.md
    created-at: <timestamp>
    files-modified: [list of code files changed]   # transformations only
```

**Transformation artifact contract** (`design-notes/<sub-command>-<timestamp>.md`):

```yaml
---
schema: sdlc/v1
type: design-augmentation
sub-command: <name>
slug: <slug>
created-at: <timestamp>
register: <brand|product>
files-modified: [list]
---
```

Body sections: (1) **What changed** — bullets per file; (2) **Why** — design rationale; (3)
**Reference followed** — which `design/<name>.md` guided this; (4) **Verification needed** — what
`verify` re-checks (visual regression? a11y? perf?); (5) **Anti-patterns avoided** — confirm
none of the absolute bans were introduced (and, for transforms, the `register:` field). This
artifact lets `/wf review` and `/wf handoff` see exactly what design augmentations were applied.

# Step 6 — Emit Final Summary (MANDATORY)

After the flow completes, emit a chat summary as the LAST output before returning control. This
contract is uniform across every design command and both invocation shapes.

**Format (narrative first, then the anchors):**

```
wf design <command> complete: <slug-or-"freestanding">

<Narrative — a short prose paragraph (no bullets, no field labels) telling the story: what this
run produced or decided, how far the flow traveled, the load-bearing counts/decisions, and the
top risk or caveat. See the Narrative rule below.>

Register: <brand|product>
Image gate: <pass | skipped:<reason> | n/a>
Artifacts: <comma-separated paths, or "none">
Next: <recommended command, or "Done">
```

**Rules:**
- **First line.** Name the command and the slug; no-slug runs that created a slug name the new
  slug; truly standalone runs use `"freestanding"`.
- **Narrative — the heart of the summary, REQUIRED for any command that produces an artifact.**
  Write a short **prose paragraph** (2–5 sentences, no bullets, no field labels) that *tells the
  user what happened*: for a build command, what was designed AND built and how far the
  compressed flow ran; for `audit`/`critique`, the verdict and top findings; for `extract`, what
  was reverse-engineered; for `setup`/`teach`, what context was established. Weave in the
  load-bearing counts, decisions, and the top risk. Write it like you're telling a colleague, not
  filling a form. Omit only for genuinely read-only runs with nothing to narrate.
- **Register** is `brand` or `product` — always emit; it is the load-bearing design-mode signal.
- **Image gate** records whether the imagery check passed for commands that use it; `n/a` for
  commands that don't run it.
- **Artifacts.** Comma-separate the `.ai/workflows/<slug>/` paths written (build runs list the
  whole span). No-slug standalone reports may write `"none"` if nothing persisted.
- **Next** is a concrete invocation, or `Done`. A completed in-workflow build typically routes to
  `/wf review <slug>`; `audit`/`critique` route to `/wf review <slug>`; standalone runs usually
  `Done`.
- If the command reference defines its own "Chat return contract", treat that as the *content*
  spec — pick the load-bearing fields and keep it compact.
- Framing rules — narrative definition, "return only" caveat, internal audience, always-emit — are single-sourced in [_chat-return.md](_chat-return.md); apply them here.
