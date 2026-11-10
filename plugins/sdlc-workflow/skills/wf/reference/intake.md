---
description: Entry-point dispatcher for the SDLC lifecycle, and the keeper of each workflow's record. Plain `/wf intake <description>` runs the default product-owner intake (stage 1 of 9: the brief, then the shape in the same run). A mode keyword routes to a compressed or standalone entry flow — `fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `brainstorm`, `adopt`, `optimize`, `simplify`, `task`. `brainstorm` is the rubber-duck mode; `adopt` adopts work already done into the lifecycle; `audit` hunts defects in a named subsystem with no symptom, hypothesis or diff; `simplify` is read-only triage; `task` is work that is not a code change. An existing slug before a mode attaches the run as a compressed slice. Three maintenance words need a slug and change a workflow without touching built work: `amend` (whitelisted config — branch strategy, base, review scope, title, tags), `modernize` (additive schema backfill to the current plugin era) and `close` (end the workflow or one slice). With no keyword, intake may propose a mode (suggest-and-confirm) before it falls back to the default flow.
argument-hint: "[slug] [fix|rca|investigate|discover|audit|hotfix|refactor|update-deps|ideate|brainstorm|adopt|optimize|simplify|task] <description> | <slug> amend|modernize|close [...] | <description>"
---

You are the **entry dispatcher** of the SDLC plugin, run as `/wf intake`. Intake is the front door of the lifecycle. It has modes: the ways a piece of work enters.

- The **default** mode is the full product-owner intake, the canonical stage 1: the brief, then the shape phase ([shape.md](shape.md)) in the same run.
- The fourteen entry-mode keywords are arguments to this one key: `fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `brainstorm`, `adopt`, `optimize`, `simplify`, `task`. Each is a compressed or standalone entry flow.
  - `simplify` is the read-only triage mode.
  - `task` is the minimal lifecycle for work that is not a code change.
  - `audit` is the defect hunt: a read-only terminal mode that scrutinizes a named subsystem for unknown defects (no symptom, no hypothesis, no diff), and owns an accumulating findings ledger (`intake/audit.md`).
  - `brainstorm` is the rubber-duck mode: the person thinks aloud, and the agent asks and keeps a board (`intake/brainstorm.md`).
  - `adopt` is the reverse entry: it adopts a change already made in the working tree into the lifecycle, and lands it at verify (`intake/adopt.md`).
- **Extension** is the one mode with no keyword. An existing slug followed by free scope text (`/wf intake <existing-slug> <new scope>`) routes to `intake/extend.md`, which adds new slices to that workflow.
- Three more words are **maintenance** words, and each needs an existing slug. `amend` edits the recorded configuration of a workflow against a strict whitelist. `modernize` backfills the artifacts of an older workflow to the current schema. `close` ends the workflow or one slice (`intake/close.md`). None writes a numbered stage artifact or a compressed slice, and none touches built work.

Your job: parse the invocation, and resolve the mode and the shape (maintenance, standalone, slug-mode or extension). Load the shared context. Then load the reference of the mode, and run only the span of the flow that the mode names.

> Runtime-truth verification (`/wf probe`) is not an intake mode. It is its own `/wf` key, because it acts on built code and does not enter the lifecycle. Do not route to it from here.
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

`$ARGUMENTS` reaches you without the leading `intake` key: `wf/SKILL.md` strips it. Split it into tokens with shell quoting: `"two words"` is one token.

The **mode keyword set** is: `fix`, `rca`, `investigate`, `discover`, `audit`, `hotfix`, `refactor`, `update-deps`, `ideate`, `brainstorm`, `adopt`, `optimize`, `simplify`, `task`, `amend`, `modernize`, `close`. The last three are the **maintenance words**. After a slug, the word `shape` is reserved too: it runs the shape phase again (branch 1d).

Two groups have their own shapes, and the branches below enforce both:
- `adopt` and `optimize` are standalone only. They never attach to a slug, and intake never proposes them.
- `amend`, `modernize` and `close` need a slug. They are never compressed slices, and intake never proposes them.

**List work packet.** A brainstorm `done` or an ideate pick writes work packets: `<wf-dir>/../<source-slug>/work/<packet-slug>.md`, `type: packet` (`campaign.md`). Check these before the order below:
- When `token0` is the path of a work packet file whose `form` is `intake`, `fix`, `hotfix` or `extension`, stop: *"The campaign walk opens and builds this work packet. Type `/wf campaign <source-slug>`."* Intake does not open a build work packet: `campaign.mjs open` writes its folder.
- When `token0` is `investigate`, `discover`, `rca` or `task`, and `token1` is the `packet-slug` of a work packet file of that form, run that mode standalone with the work packet as its source. The slug of the new workflow is the work packet slug. The token `from <source-slug>` is implied ([intake/_intake-provenance-consume.md](intake/_intake-provenance-consume.md), row `brainstorm`). A `token0` path to such a work packet file runs the same way.

Resolve the branches in this order. The slug checks come first, because a slug can look like a mode word. `token0` names an existing workflow when `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <token0> index` exits 0 ([_records.md](_records.md)).

0. **Slug + maintenance word → maintenance mode.** When `token0` names an existing workflow and `token1` is `amend`, `modernize` or `close`, this is **maintenance mode**. Take `token0` as `<slug>` and `token1` as `<mode>`. The rest are the instructions of the mode. Load `intake/amend.md`, `intake/modernize.md` or `intake/close.md`, and follow it. These are not compressed slices (no `_compressed-slice.md` override), and they write no numbered artifact. For `close`, the rest is a slice slug or a close reason (`intake/close.md` Step 0), and a `prototype` row of `.ai/workflows/INDEX.md` also matches `token0`: its folder is in the POC worktree.
   - When `token0` is `amend` or `modernize` and does not match a slug, this is not a maintenance invocation. Stop: *"`<mode>` acts on an existing workflow. Run `/wf intake <slug> <mode>`; `/wf status` lists your workflows."* Never fall through to a standalone mode or to the default intake.
   - When `token0` is `close` and `token1` matches an existing slug exactly, stop: *"Run `/wf intake <token1> close` — the slug comes first."*
   - Otherwise a `token0` of `close` starts a description ("close the dropdown"): go to branch 4.

1. **Slug + mode keyword → compressed slice.** When `token0` names an existing workflow and `token1` is in the mode keyword set, except `adopt`, `optimize`, `amend` and `modernize`, this is **slug-mode**. Take `token0` as `<slug>` and `token1` as `<mode>`. The rest are the instructions of the mode. The run attaches as one compressed slice on that workflow (Step 4).
   - When `token1` is `adopt`, this is not slug-mode. Stop, and tell the person: *"`adopt` roots a new workflow from the current diff; it can't attach to an existing slug. Run `/wf intake adopt` (no slug), or `/wf intake <slug> <scope>` to extend `<slug>` with new work."* An exact slug match on disk is an intended attach, so it does not raise the collision question of `_intake-context.md`.
   - `<slug> optimize` stops too: run `/wf loop optimize <slug>`.
   - When `token0` matches a **closed** workflow, ask: *"Workflow `<token0>` is closed. Append a compressed slice anyway?"* On yes, go on in slug-mode. On no, stop.

1a. **Slug alone, small path → the small path.** Otherwise, when `token0` names an existing workflow whose index has `workflow-type: small`, and no token follows it, load [intake/small.md](intake/small.md) and resume it.

1b. **Slug alone, brief not written → resume the interview.** Otherwise, when all of these hold, the interview stopped before the brief:
   - `token0` names an existing workflow, and no token follows it;
   - its index has no `workflow-type`, or `workflow-type: feature`;
   - `record get` of its `01-intake.md` exits 1.

   `intake/default.md` writes the index before its first question, and the brief at its last item. Load [intake/default.md](intake/default.md), and resume it for `<slug>`: its sub-step 3 finds the index and carries the open questions forward. It runs the shape phase after the brief.

1c. **Slug alone, shape still to write → the shape phase.** Otherwise, when `token0` names an existing workflow, no token follows it, `record get` of its `01-intake.md` exits 0, and `record get` of its `02-shape.md` exits 1 or shows `status: awaiting-input`, the intake of this workflow is not finished.
   - When `01-intake.md` itself shows `status: awaiting-input`, the brief has open questions, and the shape phase stops on them (shape.md Step 0.3). Load [intake/default.md](intake/default.md), and resume it for `<slug>` first: it asks the open questions and finishes the brief. Then run the shape phase.
   - Otherwise load [shape.md](shape.md), and run the shape phase for `<slug>`.

   A change mode (`fix`, `hotfix`, `refactor`, `update-deps`) and `rca` write their own `02-shape.md`, so this branch never fires for them.

1d. **Slug + `shape` → the shape phase again.** Otherwise, when `token0` names an existing workflow and `token1` is `shape`, load [shape.md](shape.md) for `<slug>`. The rest is its focus hint. A complete `02-shape.md` is shaped again under its additive-write contract ([_additive-write.md](_additive-write.md)). This is the way back to the shape after slicing: to settle an open intent risk, to revisit an acceptance criterion, or to record a new tool in `stack:`.

2. **Slug + free scope (or nothing) → extension.** Otherwise, when `token0` names an existing workflow and `token1` is not a mode keyword or `shape` (it is free scope text, `from-review`, `from-retro`, or absent), this is **extension mode**. Take `token0` as `<slug>`. The rest is the new scope (the seed), passed through unchanged. Load `intake/extend.md`, and follow it. It adds new slices to that workflow, and never touches completed work. A defect of built work is fixed by a review run (`/wf review <slug>`), or by `/wf intake <slug> fix` for a change after ship. It never becomes a new slice or a re-specification in place.
   - **Schema-era check.** When you read the index (`record get "<root>" <slug> index`) for this branch, note whether the workflow predates the current schema: no `charter:`, no `intent-risks:`, or open `runtime-evidence-deferrals` entries with no `wall-ownership` or `clearing-event`.
   - **Nag suppression.** When the index has a `schema-modernized-at:` stamp, skip the offer for each field in its `schema-absent-fields:`. A modernize run already judged those fields honestly unanswerable. Only markers outside that list, added by a later era, still fire.
   - When the drift fires, say so in one line before you run the extension, and offer `modernize` as a full option: *"`<slug>` was authored before `<the missing block>`, so `<the stage that reads it>` silently gets nothing. Extend now, or run `/wf intake <slug> modernize` first?"* Do not modernize silently, and do not block the extension on it.
   - When `token0` matches a **closed** workflow, the extension is still valid. Go on.

3. **Explicit mode (no slug).** Otherwise, when `token0` is in the mode keyword set, this is **explicit mode, standalone**. Load `intake/<token0>.md`. The rest are its instructions. A description that begins with a mode word ("fix the typo") routes to that mode. For a real collision, the person quotes the whole description as one token (Quote-escape, below).

4. **Default + suggest-and-confirm.** Otherwise the tokens are a raw task description, for the default intake flow (`intake/default.md`). Before you load it, run the auto-route classification (below). On one strong match, propose that mode as a gate question per [_gate-question.md](_gate-question.md). On accept, load the reference of that mode instead, standalone. On decline, run `intake/default.md`. With no strong match, go straight to `intake/default.md`.

**Empty `$ARGUMENTS`.** Load `intake/default.md`, which owns the path that asks for a task description, or show the mode menu and ask which entry the person wants.

**Quote-escape.** A quoted first token of several words (`/wf intake "rca dashboard refresh"`) never matches a slug or a bare keyword, so it routes to branch 4 (default).

**Trailing tokens.** The mode owns these, and takes them from the end of `$ARGUMENTS`. The dispatcher passes them through.
- `from <slug>` is the provenance token. Each mode that reads provenance strips it per `intake/_intake-provenance.md`.
- A trailing `design` token on a change mode runs the design stage (`intake/_change-mode-tail.md`).
- A trailing `dry-run` on `amend` or `modernize` previews without writing.

## Auto-route classification (branch 4 only)

Propose a mode only when all of these hold. Otherwise run `intake/default.md` without a question.
- (a) There is no explicit mode keyword and no slug match: you are in branch 4.
- (b) The description has no lifecycle word: `shape`, `slice`, `plan`, `implement`, `verify`, `review`, `handoff`, `ship`, `retro`. Such a word says that the person knows the stage they want.
- (c) The description matches exactly one of the patterns below strongly.

Ten modes can be proposed: `fix`, `rca`, `investigate`, `discover`, `hotfix`, `refactor`, `update-deps`, `ideate`, `audit` and `brainstorm`. Intake never proposes `adopt`, `optimize`, `simplify`, `task`, `amend`, `modernize` or `close`. Match on the intent of the description:

| Signal in the description | Propose |
|---|---|
| A failure or a regression in the past tense, with an unknown cause ("X broke / stopped working / is blank/500/NaN after …") | `rca` |
| A named, local defect with an obvious correction ("the label says 'Lable'", "total is off by one", "wrong colour on the button") | `fix` |
| An active production emergency ("outage", "prod down", "users can't … right now", "urgent") | `hotfix` |
| A cleanup or a restructure that keeps the behaviour ("this is messy", "tech debt in X", "extract/split/deduplicate", "clean up the structure of") | `refactor` |
| Dependency maintenance ("update/bump/upgrade the dependencies/packages", "deps are outdated", "security advisories in deps") | `update-deps` |
| A yes/no question about the truth of the system ("is it true that …", "does X actually …", "why does …") | `discover` |
| An open question of design or approach ("how should I …", "what are the options for …", "approaches to …") | `investigate` |
| An open scan for improvements with no specific defect ("ideas for X", "what could we improve in …", "find things worth doing in …"), or a page, a changelog or an issue list to mine for improvements | `ideate` |
| The person's own thought, to examine ("help me think through …", "talk me through …", "rubber duck", "brainstorm with me") | `brainstorm` |
| A defect hunt across a named subsystem with no specific symptom ("review/scrutinize/audit X for bugs, wrong assumptions, mistakes", "check the paint-ordering code for errors") | `audit` |

**Discriminators.** These are the near-collisions. A description that spans two patterns is not one strong match, so it falls to the default.
- `fix` vs `rca`: both describe something wrong. Propose `fix` only when the correction is self-evident and local. Propose `rca` when the cause is unknown and needs diagnosis.
- `refactor` vs `investigate`/`ideate`: `refactor` is a decision to restructure known code; `investigate` and `ideate` are still open questions. "Messy, and I'm not sure how" spans two, so it goes to the default.
- `ideate` vs `investigate`: `ideate` ranks improvement candidates with no target decision; `investigate` sketches approaches to a stated problem.
- `brainstorm` vs `ideate`: who generates the ideas, the person (`brainstorm`) or a scan of the codebase (`ideate`). "Brainstorm ways to X", with no thought of the person's own, is `ideate`.
- `brainstorm` vs `investigate`: `investigate` has a stated problem; `brainstorm` has none yet.
- `audit` vs `rca`: both hunt defects. Propose `rca` when the description gives a specific symptom ("X broke", "Y returns 500"). Propose `audit` when it names a subsystem to scrutinize and the defects are unknown.
- `audit` vs `discover`: `discover` judges a stated hypothesis (yes or no); `audit` has none, and lists the defects that the lenses find.
- `audit` vs `investigate`: `investigate` assumes that the problem is real and sketches approaches; `audit` decides whether problems exist at all.
- `fix` vs `hotfix`: propose `hotfix` only for an active production incident.
- `fix` vs `refactor`: `fix` changes behaviour; `refactor` keeps it.
- `discover` vs `rca` / `investigate`: `discover` tests a stated theory; `rca` starts from a symptom; `investigate` starts from a stated problem.

Propose at most one mode, once, as a gate question per [_gate-question.md](_gate-question.md): the proposed mode (recommended), or "Plain intake (default)". On accept, load the reference of that mode standalone. On decline, load `intake/default.md`. Nothing routes into a mode that commits to a build (`fix`, `hotfix`, `refactor`, `update-deps`) without the person's yes.

**Record** the resolved shape (slug-mode, small path, shape phase, extension, explicit or default), the slug (if any), the mode and the instructions before you go on.

# Step 1 — Load shared context

Apply `intake/_intake-context.md`: the External Output Boundary and the rules of the workflow registry and the slug. Do not restate or fork its rules.
- In **slug-mode** (branch 1), `_compressed-slice.md` governs the slice output. It overrides each standalone step of the mode reference that creates a workflow, a branch or a top-level index.
- **Extension mode** (branch 2) does not use `_compressed-slice.md`. It writes full slice files per `intake/extend.md`.

# Step 2 — Resolve mode → flow span

The mode reference owns the span of the flow: run only the stages, the artifact writes and the next step that it names. `default` has this row:

| Mode | Reference | Writes | Next |
|---|---|---|---|
| `default` (never slug-attached) | `intake/default.md`, then [shape.md](shape.md); [intake/small.md](intake/small.md) on the small path | `00-index.md`, `01-intake.md` and `02-shape.md`: the interview and the stack fingerprint, then the shape phase in the same run. The small path writes `00-index.md` (`workflow-type: small`) and `01-small.md`, and implements and verifies in the same run with one commit on the checked-out branch. | the shape phase names `/wf design <slug>` or `/wf slice <slug>`; the small path ends `Done`, or `/wf review <slug>` when the person wants a PR |

# Step 3 — Load the mode reference

Load `intake/<mode>.md` (`intake/extend.md` for an extension) in full, and follow it as written. Do not summarize it, paraphrase it, or skip a part.

# Step 4 — Execute

1. Run the loaded mode reference.
   - In the **standalone** shape, honor each artifact write, branch step and routing rule that it describes.
   - In **slug-mode** (branch 1), the `_compressed-slice.md` contract overrides each instruction that would create a new workflow, a branch, a top-level `00-index.md`, a standalone `01-<mode>.md` / `hf-*` / `rf-*` artifact, or an off-pipeline companion. Write only the one compressed slice and the additive index updates.
   - In **extension** (branch 2), follow `intake/extend.md` as written. The compressed-slice override does not apply.
   - In **maintenance** (branch 0), follow `intake/amend.md`, `intake/modernize.md` or `intake/close.md` as written.
2. The rest of `$ARGUMENTS`, after the matched mode and after the slug when it was taken, are the arguments of the mode. Pass them through unchanged.

# Step 5 — Emit Final Summary

When the logic of the mode is done, write a chat summary as the last output before you return control.

**Format (narrative first, then anchors):**

```
wf intake <mode> complete: <slug-or-scope>     (slug-mode: wf intake <mode> → compressed slice <slice-slug> on <slug>)

<Narrative of the lead artifact, per *The narrative* in _chat-return.md.>

Artifacts: <comma-separated paths, or "none">
Next: <recommended command, or "Done">
```

**Rules:**
- **First line.** Name the mode and the slug. Standalone: the workflow created (`ideate`, `brainstorm`, `investigate` and `discover` may have none). Slug-mode: the workflow that the slice attached to.
- **Artifacts** are the paths created or changed in this run: `"none"` for a read-only run.
- **Next** is a concrete invocation, or `Done`. In slug-mode, put `<slug>` first in `Next` (`/wf implement <slug>`).
- When the mode reference has its own "Chat return contract", treat it as the spec of the content, and keep it compact.
- The framing follows [_chat-return.md](_chat-return.md).
