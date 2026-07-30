---
description: Entry-point dispatcher for the SDLC lifecycle. Plain `$wf intake <description>` runs the default product-owner intake (stage 1 of 10). A mode keyword routes a compressed/standalone entry flow — `fix`, `rca`, `investigate`, `discover`, `hotfix`, `refactor`, `update-deps`, `ideate`, `adopt` — most a former `$wf-quick` sub-command, now an intake mode (`adopt` is the reverse-entry mode: it adopts work already done into the lifecycle). Passing an existing slug before a mode attaches the run as a compressed slice. Two slug-required maintenance modes edit an existing workflow without touching built work: `amend` (whitelisted config — branch strategy, base, review scope, title, tags) and `modernize` (additive schema backfill to the current plugin era). With no keyword, intake may propose a mode (suggest-and-confirm) before falling back to the default flow.
argument-hint: "[slug] [fix|rca|investigate|discover|hotfix|refactor|update-deps|ideate|adopt|amend|modernize] <description> | <description>"
---

You are the **entry dispatcher** for the SDLC plugin, invoked as `$wf intake`. Intake is the
*front door* of the lifecycle, and it has **modes** — alternative ways a piece of work enters.
The **default** mode is the full product-owner intake (the canonical stage 1). The eleven mode
keywords (`fix`, `rca`, `investigate`, `discover`, `hotfix`, `refactor`, `update-deps`, `ideate`,
`adopt`, `amend`, `modernize`) are *arguments* to this one key — most were formerly standalone `$wf-quick` sub-commands and are now
compressed/standalone entry flows. `adopt` is the **reverse-entry** mode: instead of entering with
work ahead of you, it adopts a change *already made in the working tree* into the lifecycle and
lands it at verify (see `reference/intake/adopt.md`). Intake also owns one **keyword-less** mode, **extension**: naming
an existing on-disk slug followed by free scope text (`$wf intake <existing-slug> <new scope>`)
auto-routes to `reference/intake/extend.md`, which adds net-new slices to that workflow. This is where scope
corrections and follow-on work land — already-built work is never re-specified in place.

Two further modes are **maintenance**, and both require an existing slug: `amend` edits a workflow's
recorded *configuration* against a strict whitelist, and `modernize` backfills an older workflow's
artifacts to the current schema. Neither writes a numbered stage artifact and neither touches built
work — they exist because config edits and schema drift previously had no lawful home, so the model
had to defy its own routing (or improvise a backfill) to do either.

Your job: parse the invocation, resolve the **mode** and the **shape** (maintenance vs standalone vs
slug-mode vs extension), load the shared context, then load the mode's reference and run only the
flow span the mode dictates.

> Runtime-truth verification (`$wf probe`) and read-only triage (`$wf simplify`) are NOT intake
> modes — they are their own top-level `$wf` keys, because they act on already-built or existing
> code rather than entering the lifecycle. Do not route to them from here.

# Step 0 — Parse the invocation (mode + shape resolution)

`$ARGUMENTS` reaches you with the leading `intake` key already stripped by `wf/SKILL.md`.
Tokenize respecting shell quoting (`"two words"` is one token). The **mode keyword set** is:
`fix`, `rca`, `investigate`, `discover`, `hotfix`, `refactor`, `update-deps`, `ideate`, `adopt`,
`amend`, `modernize`.

Two modes carry **shape carve-outs** at opposite ends:

- **`adopt` is standalone-only** — it always roots a *new* workflow from the working tree and is
  **never** slug-attachable (it cannot be a compressed slice of an existing workflow); it is also
  never auto-proposed.
- **`amend` and `modernize` are slug-REQUIRED** — they act on a workflow that already exists, so
  they are meaningless without one, are never compressed slices, and are never auto-proposed.
  Both are **maintenance** modes: `amend` edits a workflow's recorded *configuration* (a strictly
  whitelisted field set); `modernize` backfills an older workflow's artifacts to the current schema.
  Neither writes a numbered stage artifact, and neither ever re-specifies built work.

The carve-outs below enforce all three.

Resolve in this exact order (the order matters — the slug checks come FIRST):

0. **Slug + `amend` / `modernize` → maintenance mode.** If `token0` exactly matches an existing
   `.ai/workflows/<token0>/00-index.md` on disk **AND** `token1` is `amend` or `modernize` →
   **maintenance mode**. Consume `token0` as `<slug>` and `token1` as `<mode>`; the rest are the
   mode's instructions. Load `reference/intake/amend.md` or `reference/intake/modernize.md` and follow it — these are
   **not** compressed slices (no `_compressed-slice.md` override) and write no numbered artifact.
   This branch runs **first** because both keywords would otherwise be swallowed: `amend` reads as
   free scope (branch 2, extension) and `modernize` as a mode keyword with no slug (branch 3).
   - If `token0` does **not** match a slug, these are not maintenance invocations — STOP:
     *"`<mode>` acts on an existing workflow. Run `$wf intake <slug> <mode>`; `$wf status` lists
     your workflows."* Never fall through to a standalone mode or to default intake.

1. **Slug + mode keyword → compressed slice.** If `token0` exactly matches an existing
   `.ai/workflows/<token0>/00-index.md` on disk **AND** `token1` is in the mode keyword set
   *(except `adopt`, `amend`, `modernize`)* → **slug-mode**. Consume `token0` as `<slug>` and `token1` as `<mode>`; the
   rest are the mode's instructions. The run will attach as **one compressed slice** on that
   workflow (Step 4). **If `token1` is `adopt`**, this is not slug-mode — STOP and tell the user:
   *"`adopt` roots a new workflow from the current diff; it can't attach to an existing slug. Run
   `$wf intake adopt` (no slug), or `$wf intake <slug> <scope>` to extend `<slug>` with new work."*
   *(An exact on-disk slug match is an intentional attach — it does NOT trigger the collision
   prompt, which guards only against an accidentally re-derived slug. See `_intake-context.md`.)*
   - If `token0` matches a **closed** workflow → ask the user directly in chat: *"Workflow `<token0>` is closed. Append a
     compressed slice anyway?"* On yes → slug-mode; on no → STOP.

2. **Slug + free scope (or nothing) → extension.** Else if `token0` exactly matches an existing
   `.ai/workflows/<token0>/00-index.md` on disk **AND** `token1` is *not* a mode keyword (it is
   free scope text, `from-review`, `from-retro`, or absent) → **extension mode**. Consume `token0`
   as `<slug>`; the rest is the new scope (seed) passed through verbatim. Load `reference/intake/extend.md`
   and follow it — it adds net-new slice(s) to that workflow and never touches completed work. This
   is the auto-route that replaces the former `$wf-meta extend` command: *an existing slug plus new
   scope is the signal*, no keyword required (convention over flags). **Extension writes full slice
   files, so the `_compressed-slice.md` override does NOT apply** (unlike branch 1's compressed
   slice). Correcting already-built **work** is still a *new* slice (this branch) or
   `$wf intake <slug> fix` — never an in-place re-specification. That rule is unchanged; `amend`
   (branch 0) covers only recorded **configuration** (branch strategy, base branch, review scope,
   title, tags), which extension never had a home for.
   - **Schema-era check.** While reading `00-index.md` for this branch, note whether the
     workflow predates the current schema — no `charter:`, no `intent-risks:`, or open
     `runtime-evidence-deferrals` entries missing `wall-ownership` / `clearing-event`.
     **Nag suppression:** when the index carries a `schema-modernized-at:` stamp, skip the offer
     for any field listed in its `schema-absent-fields:` — a modernize run already adjudicated
     those as honestly unanswerable; only markers outside that list (a later era's additions)
     still fire. When drift does fire,
     say so in one line **before** running the extension and offer `modernize` as a first-class
     option: *"`<slug>` was authored before `<the missing block>`, so `<the stage that reads it>`
     silently gets nothing. Extend now, or run `$wf intake <slug> modernize` first?"* Do not
     modernize silently, and do not block the extension on it — the point is that the drift becomes
     visible at the one moment someone is already looking at this workflow.
   - If `token0` matches a **closed** workflow → extension is still valid (new scope may extend a
     closed workflow). Proceed; `extend.md` handles closed/complete workflows by construction.

3. **Explicit mode (no slug).** Else if `token0` is in the mode keyword set → **explicit mode,
   standalone**. Load `reference/intake/<token0>.md`; the rest are its instructions. *(`amend` and `modernize`
   never reach here — branch 0 claims them with a slug and STOPs them without one, since neither
   means anything standalone.)* *(This matches
   the former `$wf-quick <sub> …` behavior: a description that legitimately begins with a mode word —
   e.g. "fix the typo" — routes to that mode, which is almost always what the user wants. For
   the rare genuine collision, the user quotes the whole description as one token; see below.)*

4. **Default + suggest-and-confirm.** Else the tokens are a **raw task description** → the
   default intake flow (`reference/intake/default.md`). **Before loading it**, run the lightweight
   auto-route classification (below). On a strong single match, propose that mode to the user
   directly in chat; on accept, load that mode's reference instead (standalone); on decline, run
   `reference/intake/default.md`. With no strong match, go straight to `reference/intake/default.md`.

**Empty `$ARGUMENTS`** → load `reference/intake/default.md` (it owns the "ask for a task description" path)
or render the mode menu and ask which entry the user wants.

**Quote-escape.** A quoted multi-word first token (`$wf intake "rca dashboard refresh"`) never
matches a slug or a bare keyword, so it routes to branch 4 (default) — the escape hatch for a
description that legitimately begins with a slug or mode word.

**Trailing tokens (mode-owned, consumed from the END of `$ARGUMENTS`):** `from <slug>` is the
provenance token every provenance-aware mode strips per `intake/_intake-provenance.md`; a trailing
`design` token on `fix` opts the fix into design notes; a trailing `dry-run` on `amend`/`modernize`
previews without writing. These are positional conventions, not flags — the dispatcher passes them
through with the mode's instructions and the mode reference consumes them.

## Auto-route classification (branch 4 only)

Propose a mode **only when ALL** of these hold — otherwise run `reference/intake/default.md` silently:
- (a) no explicit mode keyword and no slug match (you are in branch 4); and
- (b) the description contains **no lifecycle vocabulary** (`shape`, `slice`, `plan`, `implement`,
  `verify`, `review`, `handoff`, `ship`, `retro` — those signal the user knows the stage they want);
  and
- (c) it strongly matches exactly **one** of the patterns below.

**Any of the eight former `$wf-quick`-lineage modes may be proposed.** `adopt` is **never** auto-proposed —
and neither are `amend` / `modernize`, which cannot reach branch 4 at all (they require a slug, and a
slug means branch 0). (`adopt` exclusion
— adopting an existing diff is an explicit decision the user states with `$wf intake adopt`, never
something inferred from a task description). Match on the description's *shape of intent*:

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

Propose **at most one** mode, **once**. Ask the user directly in chat offering the proposed mode
(recommended) vs "Plain intake (default)". On accept, load that mode reference standalone; on
decline, `reference/intake/default.md`. The confirm step is what makes proposing a
**build-committing** mode (`fix`, `hotfix`, `refactor`, `update-deps`) safe — nothing routes into
code-writing without the user's yes, and the user can always state the mode explicitly
(`$wf intake fix …`) to skip the prompt.

**Record** the resolved shape (slug-mode | extension | explicit | default), slug (if any), mode,
and instructions before proceeding.

# Step 1 — Load shared context

Load `reference/intake/_intake-context.md` in full and apply it:
the External Output Boundary, the narrative-fragment tier, and the workflow-registry / slug
semantics. Do not restate or fork its rules. If **slug-mode** (branch 1, a mode keyword on an
existing slug), also load `reference/_compressed-slice.md` — it governs the slice output and
overrides any standalone "create workflow / branch / top-level index" step in the mode reference.
**Extension mode (branch 2) does NOT load `_compressed-slice.md`** — it
writes full slice files per `reference/intake/extend.md`.

# Step 2 — Resolve mode → flow span

The mode decides how far the flow travels. Run only the stages the mode needs. This is the single
mode→span map (a future mode is one new row):

| Mode | Standalone (no slug) | Slug-mode (`<slug> <mode>`) | Terminus / Next |
|---|---|---|---|
| `default` | `00-index.md` + `01-intake.md`; PO interview + stack fingerprint | n/a — default is never slug-attached | recommends `$wf shape <slug>` |
| `fix` | compressed **standard** lifecycle — `01-fix`(`type:intake`) → `02-shape` → `03-slice`(`slice-index`) → `04-plan` → **[gate]**, on a `type:index` overview; branch `fix/<slug>` | compressed slice (branch suppressed) | → `$wf implement <slug>` (standard chain authors `05`→`10`) |
| `rca` | `01-rca.md` (`type:rca`) **+ `02-shape.md`** (forwarding) + `00-index.md`; no branch | compressed slice, **no `02-shape.md`** | terminal → route recorded via `rca <slug> <route>` (`plan` continues the slug; `fix`/`hotfix` close it and forward `from <slug>`; `human-triage` after the ladder) |
| `investigate` | `01-investigate.md` + `00-index.md`; no branch | compressed slice | terminal → user picks; pick recorded via `investigate <slug> <option>` (closes the workflow) → `fix` / `intake` with `from <slug>` |
| `discover` | `01-discover.md` + `00-index.md`; no branch | compressed slice | terminal → **closes at write time** (`close-reason: verdict-recorded`); verdict-dependent routes forward `from <slug>` |
| `hotfix` | compressed **standard** lifecycle — `01-hotfix`(intake) → `02-shape` (diagnosis) → `03-slice` → `04-plan` → **[gate]**; branch `hotfix/<slug>` off the production branch | compressed slice, **branch suppressed** | → `$wf implement <slug>` (`07-review` defaults to `security`) |
| `refactor` | compressed **standard** lifecycle — `01-refactor`(intake) → `02-shape` (baseline) → `03-slice` → `04-plan` → **[gate]**; branch `refactor/<slug>` (opt-in) | compressed slice, **branch suppressed** | → `$wf implement <slug>` (`07-review` defaults to `refactor-safety`) |
| `update-deps` | compressed **standard** lifecycle in-slug — `01-update-deps`(intake) → `02-shape` → `03-slice` → `04-plan` → **[gate]** → **self-authored** `05-implement`/`06-verify`; branch `deps/<slug>` | compressed slice **only** (companion dir suppressed) | → `$wf review <slug>` (self-authors `05`/`06`; skips `$wf implement`+`$wf verify`); audit-only → `$wf close <slug> deferred`; a bare existing run-slug resumes |
| `ideate` | **terminal analysis** — roots a `type:workflow-index` slug with the `01-ideate` lead only (no build stages) | compressed slice | terminal → user picks; pick recorded via `ideate <slug> <idea-id>` (closes the workflow) → successor `from <slug>` |
| `adopt` | **reverse-entry** — reconstructs `01-adopt`(intake) → `02-shape` → `03-slice` → `04-plan` → **`05-implement`** from the working-tree diff (all `provenance: adopted`), confirm-before-write gate; records the current branch, never creates one | n/a — adopt is standalone-only (never slug-attachable) | → `$wf verify <slug>` (the standard verification chain takes over from stage 6) |
| `extend` | n/a — extension always attaches to an existing slug | **adds full net-new `03-slice-<new>.md` file(s)** to the named workflow; never a compressed slice; never touches completed work | → `$wf plan <slug> <new-slice>` |
| `amend` | n/a — slug-required | **maintenance**: edits whitelisted config on `00-index.md` (branch-strategy, branch, base-branch, review-scope, title, tags) + the registry row. No numbered artifact, no slice, never touches built work | → whatever the workflow was already doing |
| `modernize` | n/a — slug-required | **maintenance**: additive schema backfill across the workflow's existing artifacts (charter, intent-risks, deferral wall-ownership/clearing-event, revision ledgers). Never rewrites a decision, verdict, or criterion | → the command that resolves the largest remaining gap |

Notes:
- **The dispatcher is a pure router.** It does not itself create the workflow folder — each mode
  reference owns its artifact writes. Build modes (`fix`/`hotfix`/`refactor`/`update-deps`) emit a
  full `type:index` overview; the terminal analysis modes (`ideate`, standalone `discover`) root a
  lightweight `type:workflow-index` lead.
- **The mode reference is authoritative** for the exact artifacts and the terminus — this table is a
  summary; the per-mode reference loaded in Step 3 governs what gets written and where the flow routes.
- **Slug-mode is uniform:** the compressed slice is the sole output, branch creation is suppressed,
  and off-pipeline companion dirs are not written — per `reference/_compressed-slice.md`.

# Step 3 — Load the mode reference

Load the resolved reference in full and follow it verbatim. Do not summarize, paraphrase, or skip.

| Mode | Reference file |
|---|---|
| `default` | `reference/intake/default.md` |
| `fix` | `reference/intake/fix.md` |
| `rca` | `reference/intake/rca.md` |
| `investigate` | `reference/intake/investigate.md` |
| `discover` | `reference/intake/discover.md` |
| `hotfix` | `reference/intake/hotfix.md` |
| `refactor` | `reference/intake/refactor.md` |
| `update-deps` | `reference/intake/update-deps.md` |
| `ideate` | `reference/intake/ideate.md` |
| `adopt` | `reference/intake/adopt.md` |
| `extend` *(auto-routed — branch 2)* | `reference/intake/extend.md` |
| `amend` *(maintenance — branch 0)* | `reference/intake/amend.md` |
| `modernize` *(maintenance — branch 0)* | `reference/intake/modernize.md` |

The reference is the authoritative instruction for *what* the mode does; this dispatcher governs
*how far the flow runs* around it and the standalone-vs-slug-mode / extension shape. `extend` has no
keyword — it is reached only via branch 2 (an existing slug followed by free scope).

# Step 4 — Execute

1. Run the loaded mode reference. In **standalone** shape, honor every artifact write, branch step,
   and routing rule it describes. In **slug-mode** (branch 1), the `reference/_compressed-slice.md` contract
   overrides any instruction that would create a new workflow, branch, top-level `00-index.md`,
   standalone `01-<mode>.md` / `hf-*` / `rf-*` artifact, or off-pipeline companion — write only the
   one compressed slice plus the additive index updates. In **extension** (branch 2), follow
   `reference/intake/extend.md` as written — it adds full net-new slice files to the existing workflow and
   never touches completed work; the compressed-slice override does not apply. In **maintenance**
   (branch 0), follow `reference/intake/amend.md` / `reference/intake/modernize.md` as written — no compressed slice, no
   numbered artifact, no new workflow; both confirm before writing and both are bounded by their own
   whitelist (amend) or additive-only rule (modernize).
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
- **Artifacts** are the paths created or modified this run. `"none"` for read-only runs.
- **Next** is a concrete invocation, or `Done`. In slug-mode, scope `Next` with `<slug>` as the
  first positional (`$wf implement <slug>`).
- If the mode reference defines its own "Chat return contract", treat it as the *content* spec —
  pick the load-bearing fields and keep it compact.
- Framing rules — narrative definition, "return only" caveat, internal audience, always-emit — are single-sourced in [_chat-return.md](_chat-return.md); apply them here.
