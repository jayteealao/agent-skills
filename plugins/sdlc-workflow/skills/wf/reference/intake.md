---
description: Entry-point dispatcher for the SDLC lifecycle. Plain `/wf intake <description>` runs the default product-owner intake (stage 1 of 10). A mode keyword routes a compressed/standalone entry flow — `fix`, `rca`, `investigate`, `discover`, `hotfix`, `refactor`, `update-deps`, `ideate` — each a former `/wf-quick` sub-command, now an intake mode. Passing an existing slug before a mode attaches the run as a compressed slice. With no keyword, intake may propose a mode (suggest-and-confirm) before falling back to the default flow.
argument-hint: "[slug] [fix|rca|investigate|discover|hotfix|refactor|update-deps|ideate] <description> | <description>"
---

You are the **entry dispatcher** for the SDLC plugin, invoked as `/wf intake`. Intake is the
*front door* of the lifecycle, and it has **modes** — alternative ways a piece of work enters.
The **default** mode is the full product-owner intake (the canonical stage 1). The eight mode
keywords (`fix`, `rca`, `investigate`, `discover`, `hotfix`, `refactor`, `update-deps`, `ideate`)
are *arguments* to this one key — each was a standalone `/wf-quick` sub-command and is now a
compressed/standalone entry flow. Intake also owns one **keyword-less** mode, **extension**: naming
an existing on-disk slug followed by free scope text (`/wf intake <existing-slug> <new scope>`)
auto-routes to `intake/extend.md`, which adds net-new slices to that workflow. This is where scope
corrections and follow-on work land — there is no `amend`; already-built work is never re-specified
in place. Your job: parse the invocation, resolve the **mode** and the **shape** (standalone vs
slug-mode vs extension), load the shared context, then load the mode's reference and run only the
flow span the mode dictates.

> Runtime-truth verification (`/wf probe`) and read-only triage (`/wf simplify`) are NOT intake
> modes — they are their own top-level `/wf` keys, because they act on already-built or existing
> code rather than entering the lifecycle. Do not route to them from here.

# Step 0 — Parse the invocation (mode + shape resolution)

`$ARGUMENTS` reaches you with the leading `intake` key already stripped by `wf/SKILL.md`.
Tokenize respecting shell quoting (`"two words"` is one token). The **mode keyword set** is:
`fix`, `rca`, `investigate`, `discover`, `hotfix`, `refactor`, `update-deps`, `ideate`.

Resolve in this exact order (the order matters — the slug checks come FIRST):

1. **Slug + mode keyword → compressed slice.** If `token0` exactly matches an existing
   `.ai/workflows/<token0>/00-index.md` on disk **AND** `token1` is in the mode keyword set →
   **slug-mode**. Consume `token0` as `<slug>` and `token1` as `<mode>`; the rest are the mode's
   instructions. The run will attach as **one compressed slice** on that workflow (Step 4).
   *(An exact on-disk slug match is an intentional attach — it does NOT trigger the collision
   prompt, which guards only against an accidentally re-derived slug. See `_intake-context.md`.)*
   - If `token0` matches a **closed** workflow → ASK: *"Workflow `<token0>` is closed. Append a
     compressed slice anyway?"* On yes → slug-mode; on no → STOP.

2. **Slug + free scope (or nothing) → extension.** Else if `token0` exactly matches an existing
   `.ai/workflows/<token0>/00-index.md` on disk **AND** `token1` is *not* a mode keyword (it is
   free scope text, `from-review`, `from-retro`, or absent) → **extension mode**. Consume `token0`
   as `<slug>`; the rest is the new scope (seed) passed through verbatim. Load `intake/extend.md`
   and follow it — it adds net-new slice(s) to that workflow and never touches completed work. This
   is the auto-route that replaces the former `/wf-meta extend` command: *an existing slug plus new
   scope is the signal*, no keyword required (convention over flags). **Extension writes full slice
   files, so the `_compressed-slice.md` override does NOT apply** (unlike branch 1's compressed
   slice). There is no `amend` path — correcting already-built work is a *new* slice (this branch)
   or `/wf intake <slug> fix`, never an in-place amendment.
   - If `token0` matches a **closed** workflow → extension is still valid (new scope may extend a
     closed workflow). Proceed; `extend.md` handles closed/complete workflows by construction.

3. **Explicit mode (no slug).** Else if `token0` is in the mode keyword set → **explicit mode,
   standalone**. Load `intake/<token0>.md`; the rest are its instructions. *(This matches the
   old `/wf-quick <sub> …` behavior: a description that legitimately begins with a mode word —
   e.g. "fix the typo" — routes to that mode, which is almost always what the user wants. For
   the rare genuine collision, the user quotes the whole description as one token; see below.)*

4. **Default + suggest-and-confirm.** Else the tokens are a **raw task description** → the
   default intake flow (`intake/default.md`). **Before loading it**, run the lightweight
   auto-route classification (below). On a strong single match, propose that mode via
   `AskUserQuestion`; on accept, load that mode's reference instead (standalone); on decline, run
   `intake/default.md`. With no strong match, go straight to `intake/default.md`.

**Empty `$ARGUMENTS`** → load `intake/default.md` (it owns the "ask for a task description" path)
or render the mode menu and ask which entry the user wants.

**Quote-escape.** A quoted multi-word first token (`/wf intake "rca dashboard refresh"`) never
matches a slug or a bare keyword, so it routes to branch 4 (default) — the escape hatch for a
description that legitimately begins with a slug or mode word.

## Auto-route classification (branch 4 only)

Propose a mode **only when ALL** of these hold — otherwise run `intake/default.md` silently:
- (a) no explicit mode keyword and no slug match (you are in branch 4); and
- (b) the description contains **no lifecycle vocabulary** (`shape`, `slice`, `plan`, `implement`,
  `verify`, `review`, `handoff`, `ship`, `retro` — those signal the user knows the stage they want);
  and
- (c) it strongly matches exactly **one** of the patterns below.

**Any of the eight modes may be proposed.** Match on the description's *shape of intent*:

| Signal in the description | Propose |
|---|---|
| Past-tense failure / regression with **unknown cause** ("X broke / stopped working / is blank/500/NaN after …") | `rca` |
| A **named, localized defect with an obvious correction** ("the label says 'Lable'", "total is off by one", "wrong colour on the button") | `fix` |
| **Active production emergency** ("outage", "prod down", "users can't … right now", "urgent") | `hotfix` |
| **Behaviour-preserving cleanup / restructure** ("this is messy", "tech debt in X", "extract/split/deduplicate", "clean up the structure of") | `refactor` |
| **Dependency maintenance** ("update/bump/upgrade the dependencies/packages", "deps are outdated", "security advisories in deps") | `update-deps` |
| **Yes/no truth question about the system** ("is it true that …", "does X actually …", "why does …") | `discover` |
| **Open design / approach question** ("how should I …", "what are the options for …", "approaches to …") | `investigate` |
| **Open-ended improvement brainstorm with no specific defect** ("ideas for X", "brainstorm ways to …", "what could we improve in …") | `ideate` |

**Discriminators (the near-collisions — when a description spans two patterns it is *not*
exactly-one-strong-match, so fall to default):**
- `fix` vs `rca` — both describe something wrong. Propose `fix` only when the correction is
  self-evident and localized; propose `rca` when the cause is unknown and needs diagnosis.
- `refactor` vs `investigate`/`ideate` — `refactor` is a decision to restructure known code;
  `investigate`/`ideate` are still open questions. "Messy *and* I'm not sure how" spans two → default.
- `ideate` vs `investigate` — `ideate` ranks improvement candidates with no target decision;
  `investigate` sketches approaches to a *stated* problem.

Propose **at most one** mode, **once**, via `AskUserQuestion` offering the proposed mode
(recommended) vs "Plain intake (default)". On accept, load that mode reference standalone; on
decline, `intake/default.md`. The confirm step is what makes proposing a **build-committing** mode
(`fix`, `hotfix`, `refactor`, `update-deps`) safe — nothing routes into code-writing without the
user's yes, and the user can always state the mode explicitly (`/wf intake fix …`) to skip the prompt.

**Record** the resolved shape (slug-mode | extension | explicit | default), slug (if any), mode,
and instructions before proceeding.

# Step 1 — Load shared context

Load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/intake/_intake-context.md` in full and apply it:
the External Output Boundary, the narrative-fragment tier, and the workflow-registry / slug
semantics. Do not restate or fork its rules. If **slug-mode** (branch 1, a mode keyword on an
existing slug), also load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_compressed-slice.md` — it
governs the slice output and overrides any standalone "create workflow / branch / top-level index"
step in the mode reference. **Extension mode (branch 2) does NOT load `_compressed-slice.md`** — it
writes full slice files per `intake/extend.md`.

# Step 2 — Resolve mode → flow span

The mode decides how far the flow travels. Run only the stages the mode needs. This is the single
mode→span map (a future mode is one new row):

| Mode | Standalone (no slug) | Slug-mode (`<slug> <mode>`) | Terminus / Next |
|---|---|---|---|
| `default` | `00-index.md` + `01-intake.md`; PO interview + stack fingerprint | n/a — default is never slug-attached | recommends `/wf shape <slug>` |
| `fix` | compressed **standard** lifecycle — `01-fix`(`type:intake`) → `02-shape` → `03-slice`(`slice-index`) → `04-plan` → **[gate]**, on a `type:index` overview; branch `fix/<slug>` | compressed slice (branch suppressed) | → `/wf implement <slug>` (standard chain authors `05`→`10`) |
| `rca` | `01-rca.md` (`type:rca`) **+ `02-shape.md`** (forwarding) + `00-index.md`; no branch | compressed slice, **no `02-shape.md`** | terminal → recommends `plan` / `fix` / `hotfix` / human-triage |
| `investigate` | `01-investigate.md` + `00-index.md`; no branch | compressed slice | terminal → user picks → `fix` / `intake` |
| `discover` | `01-discover.md` + `00-index.md`; no branch | compressed slice | terminal → verdict-dependent |
| `hotfix` | compressed **standard** lifecycle — `01-hotfix`(intake) → `02-shape` (diagnosis) → `03-slice` → `04-plan` → **[gate]**; branch `hotfix/<slug>` off the production branch | compressed slice, **branch suppressed** | → `/wf implement <slug>` (`07-review` defaults to `security`) |
| `refactor` | compressed **standard** lifecycle — `01-refactor`(intake) → `02-shape` (baseline) → `03-slice` → `04-plan` → **[gate]**; branch `refactor/<slug>` (opt-in) | compressed slice, **branch suppressed** | → `/wf implement <slug>` (`07-review` defaults to `refactor-safety`) |
| `update-deps` | compressed **standard** lifecycle in-slug — `01-update-deps`(intake) → `02-shape` → `03-slice` → `04-plan` → **[gate]** → **self-authored** `05-implement`/`06-verify`; branch `deps/<slug>` | compressed slice **only** (companion dir suppressed) | → `/wf review <slug>` (self-authors `05`/`06`; skips `/wf implement`+`/wf verify`) |
| `ideate` | **terminal analysis** — roots a `type:workflow-index` slug with the `01-ideate` lead only (no build stages) | compressed slice | terminal → user picks → `/wf intake <idea>` |
| `extend` | n/a — extension always attaches to an existing slug | **adds full net-new `03-slice-<new>.md` file(s)** to the named workflow; never a compressed slice; never touches completed work | → `/wf plan <slug> <new-slice>` |

Notes:
- **The dispatcher is a pure router.** It does not itself create the workflow folder — each mode
  reference owns its artifact writes. Build modes (`fix`/`hotfix`/`refactor`/`update-deps`) emit a
  full `type:index` overview; the terminal analysis modes (`ideate`, standalone `discover`) root a
  lightweight `type:workflow-index` lead.
- **The mode reference is authoritative** for the exact artifacts and the terminus — this table is a
  summary; the per-mode reference loaded in Step 3 governs what gets written and where the flow routes.
- **Slug-mode is uniform:** the compressed slice is the sole output, branch creation is suppressed,
  and off-pipeline companion dirs are not written — per `_compressed-slice.md`.

# Step 3 — Load the mode reference

Load the resolved reference in full and follow it verbatim. Do not summarize, paraphrase, or skip.

| Mode | Reference file |
|---|---|
| `default` | `intake/default.md` |
| `fix` | `intake/fix.md` |
| `rca` | `intake/rca.md` |
| `investigate` | `intake/investigate.md` |
| `discover` | `intake/discover.md` |
| `hotfix` | `intake/hotfix.md` |
| `refactor` | `intake/refactor.md` |
| `update-deps` | `intake/update-deps.md` |
| `ideate` | `intake/ideate.md` |
| `extend` *(auto-routed — branch 2)* | `intake/extend.md` |

The reference is the authoritative instruction for *what* the mode does; this dispatcher governs
*how far the flow runs* around it and the standalone-vs-slug-mode / extension shape. `extend` has no
keyword — it is reached only via branch 2 (an existing slug followed by free scope).

# Step 4 — Execute

1. Run the loaded mode reference. In **standalone** shape, honor every artifact write, branch step,
   and routing rule it describes. In **slug-mode** (branch 1), the `_compressed-slice.md` contract
   overrides any instruction that would create a new workflow, branch, top-level `00-index.md`,
   standalone `01-<mode>.md` / `hf-*` / `rf-*` artifact, or off-pipeline companion — write only the
   one compressed slice plus the additive index updates. In **extension** (branch 2), follow
   `intake/extend.md` as written — it adds full net-new slice files to the existing workflow and
   never touches completed work; the compressed-slice override does not apply.
2. The remaining `$ARGUMENTS` after the matched mode (and after the slug, if consumed) are the
   mode's own arguments — pass them through verbatim.

# Step 5 — Emit Final Summary (MANDATORY)

After the mode's logic completes, emit a chat summary as the LAST output before returning control.

**Format (narrative first, then anchors):**

```
wf intake <mode> complete: <slug-or-scope>     (slug-mode: wf intake <mode> → compressed slice <slice-slug> on <slug>)

<Narrative — a short prose paragraph (no bullets, no field labels) telling the story: what this
run produced or decided, how far the flow traveled, the load-bearing counts/decisions, and the
top risk or caveat.>

Artifacts: <comma-separated paths, or "none">
Next: <recommended command, or "Done">
```

**Rules:**
- **Always emit** unless the mode STOPped with an error — then the error replaces the summary.
- **First line.** Name the mode and the slug (standalone: the workflow created — `ideate`/`investigate`/
  `discover` may have none; slug-mode: the workflow the slice attached to).
- **Narrative — the heart, REQUIRED for any mode that produces an artifact.** A short prose
  paragraph (2–5 sentences, no bullets, no field labels): what was produced/decided, the
  load-bearing counts and the top risk. Write it like telling a colleague, not filling a form.
  Omit only for genuinely read-only runs with nothing to narrate.
- **Artifacts** are the paths created or modified this run. `"none"` for read-only runs.
- **Next** is a concrete invocation, or `Done`. In slug-mode, scope `Next` with `<slug>` as the
  first positional (`/wf implement <slug>`).
- **Internal audience.** `.ai/` paths ARE allowed here (chat return, not external copy). Outside
  this block the External Output Boundary still applies.
- If the mode reference defines its own "Chat return contract", treat it as the *content* spec —
  pick the load-bearing fields and keep it compact. **A reference that says to "return ONLY" a
  receipt means only those *receipt fields* — it does NOT waive the substance narrative above.**
  Keep the full detail in the artifact; the chat summary carries the gist.
