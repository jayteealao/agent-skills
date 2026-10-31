---
description: Entry-point dispatcher for the SDLC lifecycle, and the keeper of each workflow's record. Plain `/wf intake <description>` runs the default product-owner intake (stage 1 of 9: the brief, then the shape in the same run). A mode keyword routes a compressed/standalone entry flow — `fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `brainstorm`, `adopt`, `optimize`, `simplify`, `task` (`brainstorm` is the rubber-duck mode; `adopt` is the reverse-entry mode: it adopts work already done into the lifecycle; `audit` is the defect hunt: it scrutinizes a named subsystem with no symptom, hypothesis, or diff; `simplify` is read-only triage; `task` is work that is not a code change). Passing an existing slug before a mode attaches the run as a compressed slice. Three slug-required maintenance words change an existing workflow without touching built work: `amend` (whitelisted config — branch strategy, base, review scope, title, tags), `modernize` (additive schema backfill to the current plugin era) and `close` (end the workflow or one slice). With no keyword, intake may propose a mode (suggest-and-confirm) before falling back to the default flow.
argument-hint: "[slug] [fix|rca|investigate|discover|audit|hotfix|refactor|update-deps|ideate|brainstorm|adopt|optimize|simplify|task] <description> | <slug> amend|modernize|close [...] | <description>"
---

You are the **entry dispatcher** for the SDLC plugin, invoked as `/wf intake`. Intake is the *front door* of the lifecycle, and it has **modes** — alternative ways a piece of work enters. The **default** mode is the full product-owner intake (the canonical stage 1): the brief, then the shape phase ([shape.md](shape.md)) in the same run. The fourteen entry-mode keywords (`fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `brainstorm`, `adopt`, `optimize`, `simplify`, `task`) are *arguments* to this one key, and each is a compressed or standalone entry flow. `simplify` is the read-only **triage** mode; `task` is the **minimal lifecycle** for work that is not a code change. `audit` is the **defect-hunt** mode: a read-only terminal that scrutinizes a named subsystem for unknown defects (no symptom, no hypothesis, no diff) and owns an accumulating findings ledger (see `intake/audit.md`). `brainstorm` is the **rubber-duck** mode: the person thinks aloud, the agent asks and keeps a board (see `intake/brainstorm.md`). `adopt` is the **reverse-entry** mode: it adopts a change *already made in the working tree* into the lifecycle and lands it at verify (see `intake/adopt.md`). Intake also owns one **keyword-less** mode, **extension**: naming an existing on-disk slug followed by free scope text (`/wf intake <existing-slug> <new scope>`) auto-routes to `intake/extend.md`, which adds net-new slices to that workflow.

Three further words are **maintenance**, and each requires an existing slug: `amend` edits a workflow's recorded *configuration* against a strict whitelist, `modernize` backfills an older workflow's artifacts to the current schema, and `close` ends the workflow or one slice (see `intake/close.md`). None writes a numbered stage artifact, none writes a compressed slice, and none touches built work.

Your job: parse the invocation, resolve the **mode** and the **shape** (maintenance vs standalone vs slug-mode vs extension), load the shared context, then load the mode's reference and run only the flow span the mode dictates.

> Runtime-truth verification (`/wf probe`) is NOT an intake mode — it is its own top-level `/wf` key, because it acts on already-built code rather than entering the lifecycle. Do not route to it from here.
>
> `wf/SKILL.md` Step 0 runs `/wf intake <mode> …` with no slug without this file (the intake fast path).

## Card

- Restate the request. Record the intended outcome, the known constraints, the risks if misunderstood (the RIM ledger) and the charter.
- Do not design, plan or build the solution.
- Ask the person the open questions, and record each answer per [_decisions.md](_decisions.md).
- The default mode runs the shape phase ([shape.md](shape.md)) right after the brief, in the same run, as one interview.
- Done when `01-intake.md`, `02-shape.md` (default mode) and `00-index.md` are written and `next-invocation` names the next stage.

## Requires

Read every row before you run the mode reference. [_requires.md](_requires.md) defines the check. The mode reference owns its own table and its `writes` rows.

| Input | Kind | When | Sections |
|---|---|---|---|
| `intake/_intake-context.md` | procedure | always | |
| `_compressed-slice.md` | procedure | mode:slug | |

# Step 0 — Parse the invocation (mode + shape resolution)

`$ARGUMENTS` reaches you with the leading `intake` key already stripped by `wf/SKILL.md`. Tokenize respecting shell quoting (`"two words"` is one token). The **mode keyword set** is: `fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `brainstorm`, `adopt`, `optimize`, `simplify`, `task`, `amend`, `modernize`, `close`. The last three are the **maintenance words**.

Two shape carve-outs: `adopt` and `optimize` are **standalone-only** (never slug-attachable, never auto-proposed); `amend`, `modernize` and `close` are **slug-REQUIRED** (never compressed slices, never auto-proposed). The branches below enforce both.

**List work packet.** A brainstorm `done` or an ideate pick writes work packets: `<wf-dir>/../<source-slug>/work/<packet-slug>.md`, `type: packet` (`campaign.md`). Check these before the order below:
- When `token0` is the path of a work packet file whose `form` is `intake`, `fix`, `hotfix` or `extension`, STOP: *"The campaign walk opens and builds this work packet. Type `/wf campaign <source-slug>`."* Intake does not open a build work packet: `campaign.mjs open` writes its folder.
- When `token0` is `investigate`, `discover`, `rca` or `task`, and `token1` is the `packet-slug` of a work packet file of that form, run that mode standalone with the work packet as its source. The new workflow's slug is the work packet slug. The token `from <source-slug>` is implied ([intake/_intake-provenance-consume.md](intake/_intake-provenance-consume.md), row `brainstorm`). A `token0` path to such a work packet file runs the same way.

Resolve in this exact order (the order matters — the slug checks come FIRST). `token0` names an existing workflow when `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <token0> index` exits 0 ([_records.md](_records.md)).

0. **Slug + maintenance word → maintenance mode.** If `token0` names an existing workflow **AND** `token1` is `amend`, `modernize` or `close` → **maintenance mode**. Consume `token0` as `<slug>` and `token1` as `<mode>`; the rest are the mode's instructions. Load `intake/amend.md`, `intake/modernize.md` or `intake/close.md` and follow it — these are **not** compressed slices (no `_compressed-slice.md` override) and write no numbered artifact. For `close`, the rest is a slice slug or a close reason (`intake/close.md` Step 0), and a `prototype` row of `.ai/workflows/INDEX.md` also matches `token0`: its folder is in the POC worktree.
   - If `token0` is `amend` or `modernize` and does **not** match a slug, these are not maintenance invocations — STOP: *"`<mode>` acts on an existing workflow. Run `/wf intake <slug> <mode>`; `/wf status` lists your workflows."* Never fall through to a standalone mode or to default intake.
   - If `token0` is `close` and `token1` exactly matches an existing slug → STOP: *"Run `/wf intake <token1> close` — the slug comes first."*
   - Otherwise a `token0` of `close` starts a description ("close the dropdown"): go to branch 4.

1. **Slug + mode keyword → compressed slice.** If `token0` names an existing workflow **AND** `token1` is in the mode keyword set *(except `adopt`, `optimize`, `amend`, `modernize`)* → **slug-mode**. Consume `token0` as `<slug>` and `token1` as `<mode>`; the rest are the mode's instructions. The run will attach as **one compressed slice** on that workflow (Step 4). **If `token1` is `adopt`**, this is not slug-mode —
   STOP and tell the user:
   *"`adopt` roots a new workflow from the current diff; it can't attach to an existing slug. Run `/wf intake adopt` (no slug), or `/wf intake <slug> <scope>` to extend `<slug>` with new work."* *(An exact on-disk slug match is an intentional attach and does not trigger the collision prompt in `_intake-context.md`.)* `<slug> optimize` ends too: run `/wf loop optimize <slug>`.
   - If `token0` matches a **closed** workflow → ASK: *"Workflow `<token0>` is closed. Append a
     compressed slice anyway?"* On yes → slug-mode; on no → STOP.

1a. **Slug alone, small path → the small path.** Else if `token0` names an existing workflow whose index has `workflow-type: small` **AND** no token follows it → load [intake/small.md](intake/small.md) and resume it.

1b. **Slug alone, shape still to write → the shape phase.** Else if `token0` names an existing workflow **AND** no token follows it **AND** `record get` of the workflow's `01-intake.md` exits 0 **AND** `record get` of its `02-shape.md` exits 1 or shows `status: awaiting-input` → the intake of this workflow is not finished. Load [shape.md](shape.md) and run the shape phase for `<slug>`. A change mode (`fix`, `hotfix`, `refactor`, `update-deps`) and `rca` write their own `02-shape.md`, so this branch never fires for them.

2. **Slug + free scope (or nothing) → extension.** Else if `token0` names an existing workflow **AND** `token1` is *not* a mode keyword (it is free scope text, `from-review`, `from-retro`, or absent) → **extension mode**. Consume `token0` as `<slug>`; the rest is the new scope (seed) passed through unchanged. Load `intake/extend.md` and follow it — it adds net-new slice(s) to that workflow and never touches completed work. Correcting already-built **work** is still a *new* slice (this branch) or `/wf intake <slug> fix` — never an in-place re-specification.
   - **Schema-era check.** While reading the index (`record get "<root>" <slug> index`) for this branch, note whether the workflow predates the current schema — no `charter:`, no `intent-risks:`, or open `runtime-evidence-deferrals` entries missing `wall-ownership` / `clearing-event`. **Nag suppression:** when the index carries a `schema-modernized-at:` stamp, skip the offer for any field listed in its `schema-absent-fields:` — a modernize run already adjudicated those as honestly unanswerable; only markers outside that list (a later era's additions) still fire. When drift does fire, say so in one line **before** running the extension and offer `modernize` as a first-class option: *"`<slug>` was authored before `<the missing block>`, so `<the stage that reads it>` silently gets nothing. Extend now, or run `/wf intake <slug> modernize` first?"* Do not modernize silently, and do not block the extension on it.
   - If `token0` matches a **closed** workflow → extension is still valid. Proceed.

3. **Explicit mode (no slug).** Else if `token0` is in the mode keyword set → **explicit mode, standalone**. Load `intake/<token0>.md`; the rest are its instructions. *(A description that legitimately begins with a mode word — "fix the typo" — routes to that mode. For a genuine collision, the user quotes the whole description as one token; see below.)*

4. **Default + suggest-and-confirm.** Else the tokens are a **raw task description** → the default intake flow (`intake/default.md`). **Before loading it**, run the lightweight auto-route classification (below). On a strong single match, propose that mode as a gate question per [_gate-question.md](_gate-question.md); on accept, load that mode's reference instead (standalone); on decline, run `intake/default.md`. With no strong match, go straight to `intake/default.md`.

**Empty `$ARGUMENTS`** → load `intake/default.md` (it owns the "ask for a task description" path) or render the mode menu and ask which entry the user wants.

**Quote-escape.** A quoted multi-word first token (`/wf intake "rca dashboard refresh"`) never matches a slug or a bare keyword, so it routes to branch 4 (default).

**Trailing tokens (mode-owned, consumed from the END of `$ARGUMENTS`):** `from <slug>` is the provenance token every provenance-aware mode strips per `intake/_intake-provenance.md`; a trailing `design` token on a change-mode runs the design stage (`intake/_change-mode-tail.md`); a trailing `dry-run` on `amend`/`modernize` previews without writing. The dispatcher passes them through; the mode reference consumes them.

## Auto-route classification (branch 4 only)

Propose a mode **only when ALL** of these hold — otherwise run `intake/default.md` silently:
- (a) no explicit mode keyword and no slug match (you are in branch 4); and
- (b) the description contains **no lifecycle vocabulary** (`shape`, `slice`, `plan`, `implement`, `verify`, `review`, `handoff`, `ship`, `retro` — those signal the user knows the stage they want); and
- (c) it strongly matches exactly **one** of the patterns below.

**Ten modes are proposable: `fix`, `rca`, `investigate`, `discover`, `hotfix`, `refactor`, `update-deps`, `ideate`, `audit`, and `brainstorm`.** `adopt`, `optimize`, `simplify`, `task`, `amend`, `modernize`, and `close` are **never** auto-proposed. Match on the description's *shape of intent*:

| Signal in the description | Propose |
|---|---|
| Past-tense failure / regression with **unknown cause** ("X broke / stopped working / is blank/500/NaN after …") | `rca` |
| A **named, localized defect with an obvious correction** ("the label says 'Lable'", "total is off by one", "wrong colour on the button") | `fix` |
| **Active production emergency** ("outage", "prod down", "users can't … right now", "urgent") | `hotfix` |
| **Behaviour-preserving cleanup / restructure** ("this is messy", "tech debt in X", "extract/split/deduplicate", "clean up the structure of") | `refactor` |
| **Dependency maintenance** ("update/bump/upgrade the dependencies/packages", "deps are outdated", "security advisories in deps") | `update-deps` |
| **Yes/no truth question about the system** ("is it true that …", "does X actually …", "why does …") | `discover` |
| **Open design / approach question** ("how should I …", "what are the options for …", "approaches to …") | `investigate` |
| **Open-ended improvement scan with no specific defect** ("ideas for X", "what could we improve in …", "find things worth doing in …"), or a page, changelog, or issue list to mine for improvements | `ideate` |
| **The person's own thought, wanting examination** ("help me think through …", "talk me through …", "rubber duck", "brainstorm with me") | `brainstorm` |
| **Defect hunt across a named subsystem with no specific symptom** ("review/scrutinize/audit X for bugs, wrong assumptions, mistakes", "check the paint-ordering code for errors") | `audit` |

**Discriminators (the near-collisions — when a description spans two patterns it is *not* exactly-one-strong-match, so fall to default):**
- `fix` vs `rca` — both describe something wrong. Propose `fix` only when the correction is self-evident and localized; propose `rca` when the cause is unknown and needs diagnosis.
- `refactor` vs `investigate`/`ideate` — `refactor` is a decision to restructure known code; `investigate`/`ideate` are still open questions. "Messy *and* I'm not sure how" spans two → default.
- `ideate` vs `investigate` — `ideate` ranks improvement candidates with no target decision; `investigate` sketches approaches to a *stated* problem.
- `brainstorm` vs `ideate` — who generates: the person (`brainstorm`) or a codebase scan (`ideate`). "Brainstorm ways to X" with no thought of the person's own is `ideate`.
- `brainstorm` vs `investigate` — `investigate` has a stated problem; `brainstorm` has none yet.
- `audit` vs `rca` — both hunt defects. Propose `rca` when a **specific symptom** is described ("X broke", "Y returns 500"); propose `audit` when the description names a **subsystem** to scrutinize and the defects are unknown.
- `audit` vs `discover` — `discover` adjudicates a **stated hypothesis** (yes/no); `audit` has none and enumerates whatever defects the lenses surface.
- `audit` vs `investigate` — `investigate` assumes the problem is real and sketches approaches; `audit` decides whether problems exist at all.
- `fix` vs `hotfix` — propose `hotfix` only for an active production incident.
- `fix` vs `refactor` — `fix` changes behaviour; `refactor` keeps it.
- `discover` vs `rca` / `investigate` — `discover` tests a stated theory; `rca` starts from a symptom; `investigate` starts from a stated problem.

Propose **at most one** mode, **once**, as a gate question per [_gate-question.md](_gate-question.md) offering the proposed mode (recommended) vs "Plain intake (default)". On accept, load that mode reference standalone; on decline, `intake/default.md`. Nothing routes into a build-committing mode (`fix`, `hotfix`, `refactor`, `update-deps`) without the user's yes.

**Record** the resolved shape (slug-mode | small path | shape phase | extension | explicit | default), slug (if any), mode, and instructions before proceeding.

# Step 1 — Load shared context

Apply `intake/_intake-context.md`: the External Output Boundary and the workflow-registry / slug semantics. Do not restate or fork its rules. In **slug-mode** (branch 1), `_compressed-slice.md` governs the slice output and overrides any standalone "create workflow / branch / top-level index" step in the mode reference. **Extension mode (branch 2) does NOT use `_compressed-slice.md`** — it writes full slice files per `intake/extend.md`.

# Step 2 — Resolve mode → flow span

The mode reference owns the flow span: run only the stages, the artifact writes and the next step that it names. `default` has this row:

| Mode | Reference | Writes | Next |
|---|---|---|---|
| `default` (never slug-attached) | `intake/default.md`, then [shape.md](shape.md); [intake/small.md](intake/small.md) on the small path | `00-index.md`, `01-intake.md` and `02-shape.md`: the interview and the stack fingerprint, then the shape phase in the same run. The small path writes `00-index.md` (`workflow-type: small`) and `01-small.md`, and implements and verifies in the same run with one commit on the checked-out branch. | the shape phase names `/wf design <slug>` or `/wf slice <slug>`; the small path ends `Done`, or `/wf review <slug>` when the person wants a PR |

# Step 3 — Load the mode reference

Load `intake/<mode>.md` (`intake/extend.md` for an extension) in full and follow it exactly. Do not summarize, paraphrase, or skip.

# Step 4 — Execute

1. Run the loaded mode reference. In **standalone** shape, honor every artifact write, branch step, and routing rule it describes. In **slug-mode** (branch 1), the `_compressed-slice.md` contract overrides any instruction that would create a new workflow, branch, top-level `00-index.md`, standalone `01-<mode>.md` / `hf-*` / `rf-*` artifact, or off-pipeline companion — write only the one compressed slice plus the additive index updates. In **extension** (branch 2), follow `intake/extend.md` as written; the compressed-slice override does not apply. In **maintenance** (branch 0), follow `intake/amend.md`, `intake/modernize.md` or `intake/close.md` as written.
2. The remaining `$ARGUMENTS` after the matched mode (and after the slug, if consumed) are the mode's own arguments — pass them through unchanged.

# Step 5 — Emit Final Summary

After the mode's logic completes, emit a chat summary as the LAST output before returning control.

**Format (narrative first, then anchors):**

```
wf intake <mode> complete: <slug-or-scope>     (slug-mode: wf intake <mode> → compressed slice <slice-slug> on <slug>)

<Narrative of the lead artifact, per *The narrative* in _chat-return.md.>

Artifacts: <comma-separated paths, or "none">
Next: <recommended command, or "Done">
```

**Rules:**
- **First line.** Name the mode and the slug (standalone: the workflow created — `ideate`/`brainstorm`/`investigate`/ `discover` may have none; slug-mode: the workflow the slice attached to).
- **Artifacts** are the paths created or modified this run. `"none"` for read-only runs.
- **Next** is a concrete invocation, or `Done`. In slug-mode, scope `Next` with `<slug>` as the first positional (`/wf implement <slug>`).
- If the mode reference defines its own "Chat return contract", treat it as the *content* spec, and keep it compact.
- Framing follows [_chat-return.md](_chat-return.md).
