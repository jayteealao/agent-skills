---
description: Design producer + dispatcher for UI/UX work, run as a compressed `wf` workflow. `/wf design <slug> <cmd>` produces the brief + visual contract then drives slice→plan→implement→verify itself; `/wf design <cmd>` runs the full lifecycle on a new slug. 21 design commands (craft, the 15 transforms, audit, critique, extract, setup, teach) are arguments, never their own keys.
argument-hint: "[slug] <craft|audit|critique|extract|setup|teach|animate|bolder|clarify|colorize|delight|distill|harden|layout|onboard|optimize|overdrive|polish|quieter|typeset|adapt> [instructions]"
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are the **design producer + dispatcher** for the SDLC plugin, invoked as `/wf design`.
Design is **one `wf` sub-command that runs as a compressed workflow** — not a parallel router.
You author the design brief and visual contract, run the design transforms, and (for build
commands) **drive the downstream lifecycle stages yourself**, compressed, so design knowledge
is both *produced* here and *consumed* by `slice`/`plan`/`implement`/`verify`/`review`.

The 21 design commands are *arguments* to this one key. `craft` and the 15 transforms produce
or modify code; `audit`/`critique` produce review reports; `extract` reverse-engineers tokens;
`setup`/`teach` author project context. Your job: parse the invocation, resolve the command,
load the shared design context, run preflight, load the command's reference, then run the
flow span the command's category dictates.

> **Narrative fragments — any artifact.** Beyond the typed `.html.fragment` the rich stages
> project from a sibling `.yaml`, *any* artifact you write may also ship free **narrative
> fragments**: `<stem>.<label>.html.fragment` siblings of unrestricted raw HTML — as many as
> the story needs, no contract and no sibling `.yaml` required — rendered raw-inline below the
> page. Design work especially benefits: drop in a live component preview, an annotated mock,
> or a token swatch board. Full guidance: `${CLAUDE_PLUGIN_ROOT}/reference/narrative-fragments.md`.

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
`craft`, `audit`, `critique`, `extract`, `setup`, `teach`, `animate`, `bolder`, `clarify`,
`colorize`, `delight`, `distill`, `harden`, `layout`, `onboard`, `optimize`, `overdrive`,
`polish`, `quieter`, `typeset`, `adapt`.

**Zero design-command** (no command resolvable) → STOP. Render usage:
```
Usage:
  /wf design <slug> <command> [instructions]   In-workflow: produce the design, then build it
                                                (compressed slice→plan→implement→verify).
  /wf design <command> [instructions]          No slug: create a new workflow and run the full
                                                lifecycle (intake → … → retro), seeded by design.

Commands: craft · audit · critique · extract · setup · teach · animate · bolder · clarify ·
colorize · delight · distill · harden · layout · onboard · optimize · overdrive · polish ·
quieter · typeset · adapt
```

**Record** the resolved shape (in-workflow | no-slug), slug (if any), command, and instructions
before proceeding.

# Step 1 — Load shared context + preflight

1. **Load the shared design context** in full:
   `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/design/_design-context.md`. It is the single
   source of truth for the **register** (brand/product), the **shared design laws**, the
   **absolute bans**, the **preflight gates**, the **4 codebase-inspection sub-agents**, and the
   **image gate** (the mutation lock). Apply it; do not restate or fork its rules here.
2. **In-workflow shape** — read `.ai/workflows/<slug>/00-index.md`. Parse `title`,
   `current-stage`, `status`, `branch`, `stack`, `open-questions`, `augmentations`. If
   `status: closed` → STOP (*"Workflow `<slug>` is closed. Use `/wf-meta resume <slug>` to
   reopen."*). Reuse the `stack` fingerprint for the inspection sub-agents where it answers the
   question.
3. **Run the preflight gates** from `_design-context.md`. The **image gate** stays
   `pending` (blocks code mutation) until the brief/contract step resolves it to `pass` or a
   reasoned `skipped:<reason>`. `setup`/`teach`/`extract`/`audit`/`critique` relax the codebase
   gate (read-only or context-authoring).
4. **`craft` brief gate** — the visual contract requires a confirmed design brief. In the
   compressed flow you author the brief first (Step 4), so this is satisfied inline; for an
   ad-hoc `craft` with no prior brief, author and confirm the brief before the contract.

# Step 2 — Resolve command → category → flow span

The `<design-command>` resolves to a **category**, and the category decides how far the flow
travels. Run only the stages the category needs. This is the single category→span map (a future
operator is one new row):

| Category | Commands | In-workflow span (`<slug>` given) | No-slug span |
|---|---|---|---|
| **Producer** | `craft` | `02b-design` → `02c-craft` → `slice` → `plan` → `implement` → `verify` (design the spec, then build it) | create slug → **full lifecycle** `intake → … → retro` |
| **Transformation** | the 15 (`colorize`, `harden`, `typeset`, `adapt`, `animate`, `bolder`, `clarify`, `delight`, `distill`, `layout`, `onboard`, `optimize`, `overdrive`, `polish`, `quieter`) | focused `02c-craft` → `slice` → `plan` → `implement` → `verify` (the transform **is** the implement step) | create slug → **full lifecycle** `intake → … → retro` |
| **Review / analysis** | `audit`, `critique` | single review step → `07-design-audit.md` / `07-design-critique.md`; **no slice/plan/implement** (audit reads the slug's `06-verify` metrics) | standalone one-shot report against the target code (lightweight record) |
| **Inspection** | `extract` | single read-only step → `design-notes/extract-<timestamp>.md` + `design-notes/tokens-extracted.css`; no build | standalone extract report |
| **Context** | `setup`, `teach` | write `PRODUCT.md` / `DESIGN.md` (project-root, slug-independent) | identical — project-root files, no stages |

Notes:
- Only **Producer + Transformation** produce code, so they are the only categories that run the
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
| `craft` | `design/craft.md` | Design brief + visual contract (then build) |
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

## 4A — Producer & Transformation (build commands)

These produce code, so they run the build span. The compressed flow reuses the compressed intake modes'
collapsed-stage machinery — thin single slice, minimal plan, no multi-round interviews — but
**still emits each numbered artifact** so the rendered views and downstream gates see a normal
workflow.

**In-workflow shape (`<slug>` given) — compressed, NO hand-back:**

1. **Author the design spec.**
   - `craft` (Producer): author the **design brief** `02b-design.md` (type `design`) — register,
     `recommended-references:`, anti-goals, state inventory — resolving the image gate via probes
     (or a reasoned skip); then author the **visual contract** `02c-craft.md` (type
     `design-contract`) — north-star mock, mock-fidelity inventory, implementation contract,
     `references-loaded:`. Follow `design/craft.md` for both.
   - A transform (Transformation): author a **focused `02c-craft.md`** scoped to the transform's
     surface (the transform's reference defines the goal — e.g. `colorize`'s color strategy,
     `typeset`'s type scale). The transform's playbook is what `implement` applies.
   - Write the sibling `.yaml` + `.html.fragment` for each rich artifact (see `design/craft.md`).
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
   - **Do NOT write the brief/contract and stop.** Design *owns* the downstream flow — there is
     no hand-back to `/wf slice`. Continuing straight through is what fires the slice/plan/
     implement/verify design-consumers; stopping early is the latent `craft → implement` skip
     this model exists to close.
3. Update `00-index.md` `current-stage` as you advance; keep `augmentations:` current.

**No-slug shape — full lifecycle:** create a new slug (run `intake`), then run the complete
`intake → shape → slice → plan → implement → verify → review → handoff → ship → retro` flow with
the design intent seeding it (the brief/contract are authored at the design step between shape
and slice). Use the standard stage references; the compression is lighter than the in-workflow
shape because the lifecycle is being established fresh.

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
  in the producer's brief/contract steps.

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
| `craft` (Producer) | `02b-design.md`, `02c-craft.md`, then `03-slice*`/`04-plan-*`/`05-implement-*`/`06-verify-*` | advance `current-stage` through the span; register each applied transform under `augmentations:` |
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
- **Always emit** unless the flow STOPped with an error — then the error replaces the summary.
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
- **Image gate** records whether the imagegen check passed for commands that use it; `n/a` for
  commands that don't run it.
- **Artifacts.** Comma-separate the `.ai/workflows/<slug>/` paths written (build runs list the
  whole span). No-slug standalone reports may write `"none"` if nothing persisted.
- **Next** is a concrete invocation, or `Done`. A completed in-workflow build typically routes to
  `/wf review <slug>`; `audit`/`critique` route to `/wf review <slug>`; standalone runs usually
  `Done`.
- **Internal audience.** Workflow artifact paths under `.ai/` ARE allowed here; this is the chat
  return, not external-facing copy. Outside this block, the External Output Boundary still applies.
- If the command reference defines its own "Chat return contract", treat that as the *content*
  spec — pick the load-bearing fields and keep it compact. **A reference that says to "return
  ONLY" a receipt means only those *receipt fields* — it does NOT waive the substance summary
  above.** Keep the full detail in the artifact; the chat summary carries the gist.
