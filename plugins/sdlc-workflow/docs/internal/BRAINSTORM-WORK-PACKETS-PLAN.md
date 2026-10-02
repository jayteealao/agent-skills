# BRAINSTORM-WORK-PACKETS-PLAN — a brainstorm that keeps its sources and ends in work packets

Status **Built 2026-10-03 (W0–W5a, W7), unreleased; W6 waits for the person (section 13)** · Date **2026-10-02** · Plugin **v9.176.0** · Owner **jayte**
Companion plan: [WF-CAMPAIGN-PLAN.md](WF-CAMPAIGN-PLAN.md). The campaign reads what this plan writes. This plan is Stage B1 of the campaign plan (section 5): it ships first, and it helps single-slug work without the campaign.

## 1. Why

The three SoccerManager brainstorms show the gap. Each session improvised a
different layout, because the rules name no place for sources or for work.

| Session | Folders | What it improvised |
|---|---|---|
| `brainstorm-realism-additions-20260922` | `history/`, `work/` | 27 hand-made briefs in `work/`, each with an order, a "Depends on" line, sources, and a start command. 42 `work[]` entries on the board. |
| `brainstorm-app-packaging-options-20260923` | `history/` | Nothing. Findings live only on the board. |
| `brainstorm-regen-faces-and-aging-20260924` | `history/`, `references/` | 229 copied files in `references/{code,lab-notes,reports,transcripts}/`. |

The realism briefs cite `.scratch/out/F16_part_a.md`, `.scratch/data/`, and
other paths outside the session. `.scratch/` is gitignored, so these
citations break on another machine, in a worktree, and after a cleanup.

The rules today (verified 2026-10-02):

- `look it up` records a **finding on the board** and keeps no file
  (`intake/brainstorm.md:150`). A second opinion folds in as findings with
  `source: consult` (`:173`). No rule names a research folder or a
  references folder.
- A brief the person brings goes into `briefs[]` with `source: pasted` or a
  path (`intake/brainstorm/_brief.md:6`). The file is not copied.
- `done` writes `work[]` entries and prints entry commands
  (`intake/brainstorm.md:225`). It writes no file per piece. `work[]` has
  `order` but no dependency field (`tests/frontmatter.schema.json:1925-1947`).
  Dependencies exist only as plain words in 3.3 (`:215`).
- Intake reads the routed `work[]` entry under "re-verify, do not copy"
  (`intake/_intake-provenance.md:38,47`). Only `design/_carried.md:21,31`
  treats a carried board item as an answer the person already gave. No RIM,
  charter entry, or Intake Fidelity row records a brainstorm item key.
- Intake has no form that takes a packet file. A slug followed by free text
  routes to extension (`intake.md:40`).

The result: the person's decisions reach a successor workflow as a list of
keys that intake re-reads and may re-word. Nothing downstream can prove that
a kept decision was honoured, and nothing can order the successors.

## 2. Goal

A brainstorm keeps every source it uses inside its own folder. At `done` it
writes one **work packet** per resulting workflow slug. A packet carries the
kept decisions verbatim, their item keys, the sources, the dependencies, and
the contract lines (`provides`, `expects`). A packet is complete enough for a
person to run intake and shape from it, and for `/wf campaign` to order and
drive the slugs.

## 3. Terms

One term per concept (STE W1). These terms are new or are narrowed here.

| Term | Meaning |
|---|---|
| **work packet** | The file `work/<slug>.md` that `done` writes for one resulting slug. Not "brief": `brief` already names the person's input document in `_brief.md`. |
| **write-now piece** | A piece of work that changes only documents, which the brainstorm writes itself in the same session after the person confirms the scope (section 4.4). It has no packet and no successor workflow. |
| **work set** | All packets of one brainstorm. One packet = a **single-slug** work set. Two or more = a **multi-slug** work set. |
| **research note** | A file in `research/` that one research act wrote. |
| **reference** | A file in `references/` that the session copied in from outside. |
| **contract line** | One `provides` or `expects` entry on a packet. |
| **carried decision** | A kept `decision` item that a packet carries verbatim. |

## 4. Folder layout

```
.ai/workflows/brainstorm-<topic>-<date>/
  00-index.md
  01-brainstorm.md
  brainstorm-board.json
  brainstorm-page.html
  steer.md                 (person-owned, unchanged)
  cost.jsonl               (hook-owned, unchanged)
  history/                 (unchanged)
  sketches/                (design focus, unchanged)
  research/
    index.md
    R01-<label>.md ...
  references/
    index.md
    <group>/...            (for example code/, transcripts/, reports/)
  work/
    index.md
    <slug>.md ...
```

### 4.1 `research/`

- **R1.** Every research act writes one research note:
  - a `look it up` dispatch
  - a research sub-agent
  - a coherence-pass sub-agent that reads outside the board
  - a second-opinion panel
  - a talk turn that cites external sources
- **R2.** The name is `R<NN>-<label>.md`. `NN` counts up per session folder and never reuses a number.
- **R3.** The note has frontmatter: `id`, `question`, `asked-in` (session and batch), `method`, `sources` (URL, path, or reference id), and `date`. The body gives the result and the evidence.
- **R4.** A board finding that comes from research sets `evidence: research/R<NN>-<label>.md#<anchor>`. The board item stays short. The research note holds the detail.
- **R5.** `research/index.md` lists each note in one line: id, question, and the item keys that cite it. `done` and each coherence pass regenerate this list from the board.

### 4.2 `references/`

- **F1.** A reference is any outside material that the session reads and cites: a pasted brief, a document, a dataset extract, code from another repo or branch, or a transcript.
- **F2.** Copy the reference into `references/<group>/`. Record it in `references/index.md` with: `id` (`F<NN>`), `path`, `origin` (URL, path, commit, or session id), `copied-at`, `sha256`, and `bytes`.
- **F3.** When a file is larger than the size limit, do not copy it. The default limit is 5 MB. Record a pointer row instead: `origin`, `sha256`, `bytes`, `copy: no`, and how to fetch it. A raw dataset is the usual case.
- **F4.** A board item, a research note, or a packet never cites `.scratch/` or another gitignored path. To use such a path, copy the file in (F2) or record a pointer row (F3), then cite the reference id.
- **F5.** A person's brief (`_brief.md`) is copied to `references/briefs/`. `briefs[].source` holds the reference id.

### 4.3 `work/`

- **K1.** `done` writes one packet per agreed piece of work whose form opens or extends a workflow slug. The forms are `intake`, `investigate`, `discover`, `fix`, `hotfix`, `task`, and `extension`. `design` and `design-direction` are not separate packets. They are flags on the packet of the slug they serve (`brainstorm/_design.md`). A `write-now` piece (4.4) gets no packet. Section 9.3a of the campaign plan says which packet forms the campaign drives in its waves.
- **K2.** `work/index.md` is the overview of the work set. It holds:
  - the frontmatter `work-set: single|multi`, `slugs`, and `waves`
  - a dependency table
  - a contract table (each `expects` line beside the `provides` line that meets it)
  - an ordered list of start commands
- **K3.** The board's `work[]` stays the single truth. `done` regenerates the packets and `work/index.md` from the board. A later `done` regenerates them again. A packet says at its top that the board wins on a difference. The realism briefs already said this.
- **K4.** A packet that a successor already routed is not rewritten. Its `state` changes, and a regenerated body goes to `history/` beside the old one.

### 4.4 Write-now pieces

Source: PO, 2026-10-02. In SoccerManager session `b253a8c5`, the person confirmed a scope whose first piece only changed design documents. The shipped procedure routed that piece to `/wf task update-for-real-players` (`intake/brainstorm.md:217-218`). The person then had to say "just do the required work inline here", and the session ran the full `task` lifecycle for a document edit. The brainstorm already holds every decision and source for such a piece, so a successor workflow only re-reads what the session knows.

- **K5. Document-only pieces are written now.** In 3.3, a piece whose whole deliverable is a change to documents in the repository takes the form `write-now`. Examples: a design document section, a work brief, a research guide, a packet that is not started. The brainstorm writes it in the same session, after the person confirms the scope in 3.4. The rule "writes no code and no plan" (`intake/brainstorm.md:2`) still holds: a write-now piece writes no code, no test, no configuration and no plan.
- **K6. What stays a `task`.** A piece stays a `task` packet when any of these is true:
  - It changes a file that is not a document, such as code, a test, configuration or CI.
  - It acts outside the repository: an external service, a published page, an issue, or a sign-off. The `task` lifecycle keeps its blast-radius gates for these (`task.md`).
  - It rewrites a packet that is `prepared` or `routed` (V3).
  - The person chooses `task` in 3.4.
- **K7. The session must have room.** 3.3 proposes `task` instead of `write-now` when either is true:
  - The session's context is more than 70 % used.
  - The piece changes more than 6 documents.

  The person decides. The proposal gives the reason.
- **K8. How a write-now piece runs.** After the board write in 3.4, and before the packets are written:
  1. Copy each document that the piece changes to `history/` with the session number.
  2. Write the changes. Each changed section names the item keys that it carries.
  3. Read back each changed section. Every carried decision key of the piece must appear in the changed text. A missing key is a failed check.
  4. If a check fails, fix the text and read it back again. If the check fails a second time, stop and ask the person. Do not change the piece's form to `task` without the person.
  5. Record the piece on the board: `state: written`, `written-files` (each path with its section), and `written-at`.
  6. Add one entry to `work/changes.md` that lists the changed documents. The campaign reads it, and its drift check runs over every slug that carries or expects a changed document (campaign plan, 15.2).
- **K9. Order.** A write-now piece runs before every packet that depends on it. A packet may list a write-now piece in `depends-on`. The dependency is met when the piece's `state` is `written`.
- **K10. Coverage.** A kept decision that lands in a write-now piece counts as covered for I6.

## 5. The work packet

### 5.1 Board fields

Add these fields to the `work[]` entry. The schema has no `additionalProperties: false`, so the new fields do not break old boards.

| Field | Type | Meaning |
|---|---|---|
| `slug` | kebab string | The slug the packet opens. For an extension, the new scope's descriptor. |
| `target-slug` | kebab string or null | For `extension` only: the existing slug. |
| `depends-on` | list of `work[].key` | The packets that must merge first. |
| `provides` | list of `{key, text}` | What this slug makes true, for example "the engine exposes one module contract". |
| `expects` | list of `{from, key, text}` | What this slug needs from an earlier packet's `provides` line. |
| `size` | `small|medium|large|too-large` | Counts the carried decisions, not all kept items (Q5). More than 25 is `large`: 3.3 proposes a split with its reason, and the person may keep the piece whole. More than 40 is `too-large`: the piece must be split before 3.4 confirms. |
| `research` | list of `R<NN>` | The research notes the packet draws on. |
| `references` | list of `F<NN>` or repo paths | The sources. This replaces the free-form path list the realism board used. |

### 5.2 Packet file

```markdown
---
type: work-packet
schema: sdlc/v1
key: <work[].key>
slug: <slug>
form: intake|investigate|discover|fix|hotfix|task|extension
target-slug: <slug or null>
amends: <packet key or null>
urgency: normal|urgent
revision: <work-revision that wrote this packet>
origin-brainstorm: <brainstorm-slug>
order: <n>
depends-on: [<key>, ...]
provides: [{key, text}]
expects: [{from, key, text}]
carried-decisions: [{key, session, decided-at}, ...]
open-ideas: [<item-key>, ...]
findings: [<item-key>, ...]
assumptions: [<item-key>, ...]
later: [<item-key>, ...]
research: [R01, ...]
references: [F03, ...]
ux-impact: none|visual|flow|new-surface
design: none|design|design-direction
size: small|medium|large
state: proposed|prepared|routed
routed-to: <slug or null>
generated-at: <timestamp>
---
# <title>

The board wins where this packet and the board differ.

## Start
## What the person decided      (carried decisions, verbatim, each with its key, session, and date)
## What is still open          (open ideas and questions for the plan)
## What we found               (findings, each with its evidence path)
## What we assume              (assumptions and accepted risks)
## Provides and expects        (the contract lines in plain words)
## Depends on / needed by      (the packets before and after, with links)
## Left for later and cut      (items in scope `later`, and cut items with reasons)
## Sources                     (research notes and references, as links)
```

### 5.3 Cross-references

- **X1.** Every item a packet names links to `../brainstorm-board.json#<item-key>` and to the anchor of the item in `01-brainstorm.md`.
- **X2.** "Depends on" and "needed by" link to the sibling packets. "Needed by" is computed from the other packets' `depends-on` lists.
- **X3.** Each `expects` line names the `provides` key it needs. `done` refuses to confirm (3.4) when an `expects` line has no matching `provides` line on a packet that comes earlier.
- **X4.** `01-brainstorm.md` `## Work` lists the packets in order, with links. It holds no second copy of the packet content.

## 6. Intent fidelity

The rule today is "re-verify, do not copy" for everything a successor reads. That rule is right for facts and wrong for decisions. A decision is the person's answer. Re-wording the answer is how intent drifts.

- **I1. Decisions travel verbatim.** A carried decision goes into the packet word for word, with its key, the session that made it, and its date. Intake does not re-word the answer.
- **I1a. Decisions are confirmed before use.** A decision made weeks earlier can be stale. Intake shows the carried decisions with their dates, in groups of up to 8, and asks the person to confirm each group. The person keeps a decision, or changes it.
  - A kept decision is a question the person already answered, the same way `design/_carried.md:21` treats design items. Intake does not ask it again.
  - A changed decision is the person's new answer. Intake records it in `po-answers.md` with the item key and the old text. Intake marks the packet `decision-changed: [<key>]`. The board is not edited by intake, because the brainstorm owns it. The next brainstorm resume shows each changed decision and asks the person to record it on the board.
  - The campaign runs the drift check over the slugs that carry or expect a changed decision (campaign plan, 15.2).
- **I2. Facts are re-verified.** Findings and assumptions keep the "re-verify, do not copy" rule. A finding that intake contradicts becomes a known unknown, as it does today.
- **I3. Item keys reach the intent ledgers.** Intake records `origin-items` in `00-index.md`. Each charter entry from a carried decision sets `source: <board>#<item-key>`. An RIM that comes from a carried decision cites the same key.
- **I4. Shape reports every carried decision.** The `## Intake Fidelity` table in `02-shape.md` gets one row per carried decision, as confirmed in I1a, with the disposition `honoured`, `narrowed`, or `dropped`. A narrowing needs a quoted answer from the person. A drop needs a new ratification. These are the rules that `shape.md:164` already applies to intake directives.
- **I5. Review sees the packet.** The `intent-fidelity` review rubric reads the packet's carried decisions beside the intake's Restated Request.
- **I6. Coverage at `done`.** Every kept decision lands in exactly one packet, or is marked `shared` with the packets that share it. 3.4 refuses to confirm while a kept decision has no packet.

## 7. Changes to `done`

- **3.3 Shape the work** adds these to what is agreed with the person:
  - the slug of each piece
  - the `depends-on` list
  - the `provides` and `expects` lines
  - the size of each piece
  - the form of each piece: `write-now` for a piece that changes only documents (K5–K7)

  The agent proposes the contract lines and the person confirms them. A piece with more than 25 carried decisions gets a proposed split, which the person may decline. A piece with more than 40 carried decisions must be split before the walk continues. The realism piece `realism-harness-core`, with 155 decisions, is the example.
- **3.4 Confirm and record** adds these steps after the board write:
  1. Check the contracts (X3), the coverage (I6 and K10), and that the dependency graph has no cycle.
  1a. Run each write-now piece (K8). The confirm question names the write-now pieces, so the person's confirmation also starts them.
  2. Write each packet, then `research/index.md`, then `work/index.md` last. A reader that sees the new `work-revision` then finds every packet already written.
  3. When the work set is multi-slug, print the campaign command `/wf campaign <brainstorm-slug>` as `Next`. Do not print the per-slug start commands as `Next`.
  4. When the work set is single-slug, print the one start command as `Next`.
- **Slug-mode** (a compressed brainstorm slice on a workflow) is out of scope. Slug-mode writes into the parent workflow and has no folder of its own. See Q3.

## 8. Intake reads a packet

Add a packet form to intake. The argument is a path. Convention over flags.

```
/wf intake .ai/workflows/<brainstorm>/work/<slug>.md
```

- **P1.** When the first argument resolves to a file with `type: work-packet`, intake runs the packet's `form` with the packet's `slug`. The `from <slug>` token is implied by `origin-brainstorm`.
- **P2.** When the packet's form is `extension`, intake routes to `extend.md` with `target-slug` and the packet as the scope.
- **P3.** Intake seeds the Restated Request, the Known Constraints, and the charter from the carried decisions (I1, I3). Intake still asks its own questions for gaps the packet leaves open.
- **P4.** On completion, intake sets the packet `state: prepared` and `routed-to`. The link-back rules in `_intake-provenance.md:55-68` still apply.
- **P5.** The older form `/wf intake <description> from <slug>` keeps working.

## 9. Reopening while a campaign runs

A person can resume a brainstorm at any time, also while `/wf campaign` runs
its packets. The resumed session can add new slugs, add extension scope to
existing slugs, and add bugs and hotfixes. The person also learns from
trying each wave's output. The campaign picks up the changes at its next wave
boundary ([WF-CAMPAIGN-PLAN.md](WF-CAMPAIGN-PLAN.md), section 15).

- **V1. The brainstorm owns the board and the packets.** The campaign only reads them. The campaign writes only `work/campaign/`. Intake still writes the link-back fields (`state`, `routed-to`), as `_intake-provenance.md:55-68` says today.
- **V2. The work set has a revision.** Each `done` that changes the work set adds 1 to `work-revision` in `work/index.md`. It also appends one entry to `work/changes.md`, which lists each packet that was added, changed, or cut in that revision, with the reason.
- **V3. A started packet is never rewritten.** A packet whose `state` is `prepared` or `routed` keeps its text. A new decision about its slug becomes a **new packet**:
  - `extension` when it adds scope to the slug
  - `fix` when it corrects what the slug built
  - `hotfix` when it is urgent and corrects a version that people already use

  The new packet sets `target-slug` to the slug and `amends: <old packet key>`.
- **V4. Two more packet forms.** Add `fix` and `hotfix` to the packet forms, with an `urgency: normal|urgent` field. They use the existing intake modes `fix.md` and `hotfix.md`.
- **V5. A quick capture path.** When the person finds a bug while trying a wave, a full brainstorm session is too heavy. `/wf brainstorm <brainstorm-slug> add <text>` does three things:
  1. It records the item on the board.
  2. It asks one batch: the form, the target slug, and the urgency.
  3. It writes the packet and a new work revision.

  The board stays the single writer of packets, so the campaign has one place to read.
- **V6. A cut of a started packet is a question, not a cut.** When the person cuts a kept decision whose packet is `prepared` or `routed`, `done` records the cut as `pending-cut`. The campaign asks the person whether to remove the work. Removing built work is a revert, and a revert is the person's decision.
- **V7. The brainstorm runs in its own session.** A reopened brainstorm and the `add` capture run in a brainstorm session, not in the campaign session (campaign plan, section 8). The two sessions never write the same file: the brainstorm writes the board and the packets, and the campaign writes `work/campaign/`.

## 10. Migration

- **M1.** Old boards stay valid. All new board fields are optional.
- **M2.** A resumed old brainstorm is given the folders on its next `done`. The coherence pass lists each citation of `.scratch/` or another gitignored path, and asks the person whether to copy it in or record a pointer row.
- **M3.** The realism session is the conversion fixture. Convert its 27 hand-made briefs to packets, add `depends-on` from their "Depends on" lines, and move its `.scratch/` citations into `references/` pointer rows. The converted session is also the first input for the campaign plan.
- **M3a.** The size rule applies to migrated pieces too. Counted on 2026-10-02, 11 proposed realism pieces carry more than 40 decisions: `realism-harness-core` (155), `realism-action-resolution` (112), `squad-careers-youth-staff` (104), `club-business-fans-nations-week` (91), `world-and-competitions` (90), `market-contracts-dressing-room` (84), `realism-player-record` (71), `realism-team-shape` (53), `the-players-mind` (51), `conditions-officials-fatigue-injuries` (50), and `event-contract-and-match-output` (41). The conversion splits each one with the person, as a joint walk, the same way 3.3 shapes work. The conversion never splits a piece without the person. A piece left whole is marked `too-large`, and the campaign cannot prepare it.
- **M3b.** `realism-speed-and-replay-foundation` (45 decisions) is already routed to its own workflow. V3 says a started packet is never rewritten, so the conversion does not split it. Its workflow's own slices carry the work.
- **M4.** The regen-faces `references/` folder already fits F2. It needs `references/index.md`.

## 11. Build waves

| Wave | Content |
|---|---|
| W0 | Red-first tests: the schema accepts the new `work[]` fields and the packet frontmatter. A packet whose `expects` line has no match fails. A board that cites `.scratch/` fails the coherence check. |
| W1 | Folder rules R1–R5 and F1–F5 in `intake/brainstorm.md` and `_artifact.md`. `look it up`, second opinion, and the brief procedure write files. |
| W2 | `done` 3.3 and 3.4 changes, packet template, `work/index.md` template, generation from the board. Write-now pieces K5–K10: the `write-now` form and the `written` state in the schema, the read-back check, and a test that a document-only piece is written in the session and never printed as `/wf task`. |
| W3 | Intake packet form P1–P5, `_intake-provenance.md` I1–I3, decision confirmation I1a, shape I4, review I5. Test that a changed decision reaches `po-answers.md` with its key and marks the packet. |
| W4 | Hooks and validators: `lib/hook-utils.mjs:146-152`, `lib/schema-validator.mjs:189-197`, `hooks/post-write-verify.mjs:561-583`. Rebuild `hooks/mod/requires.ts` with `scripts/build-requires.mjs`. Rebuild `dist/` in the same commit. |
| W5 | Update the tests that assert brainstorm wording: `tests/unit/skills/brainstorm-mode.test.mjs` (:85-115, :148-162, :248-263), `brainstorm-design.test.mjs`, `hooks.test.mjs:432-487`, `requires-tables.test.mjs`, `intake-terminus-contracts.test.mjs`, the evals in `tests/evals/cases/brainstorm*.json`. |
| W5a | Reopen rules V1–V7: `work-revision`, `work/changes.md`, the `amends` field, the `fix` and `hotfix` packet forms, and the `add` quick capture. Test that a `done` never rewrites a `prepared` packet. |
| W6 | Convert the realism fixture (M3, M3a) in SoccerManager, with the person for the splits. Run a fresh short brainstorm end to end to a multi-slug `done`. |
| W7 | Docs: doc-site pages, `archived/BRAINSTORM-MODE-PLAN.md` status line, CHANGELOG, version bump. |

## 12. Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Is the packet term right? "Brief" is taken by the person's input brief. | Use "work packet". |
| Q2 | What is the size limit for copying a reference? | 5 MB per file, with a pointer row above it. |
| Q3 | Does slug-mode get the folders, under `brainstorm-<descriptor>/` in the parent workflow? | Not in this plan. Revisit after W6. |
| Q4 | Does a cut item appear in the packet? | Yes, under "Left for later and cut", so the next stage does not re-propose it. |
| Q5 | What is the size limit for a packet? | **Decided 2026-10-02:** count carried decisions. Soft limit 25: a split is proposed, and the person may decline it. Hard limit 40: a split is required. 25 is the largest size that ran end to end (`engine-modules`, 26 decisions); the median realism piece carries 11. |

## 13. Build status

Built on 2026-10-03, not yet released. Waves W0–W5a and W7 are in the tree. W6 is not done (below).

**Where each part lives.**
- `lib/work-packets.mjs`: the check (X3, I6, K10, cycles, size, F4) and the generator (packets, `work/index.md`, `research/index.md`, `work/changes.md`, K4 history copies, V6 cuts). `scripts/work-packets.mjs` is the command line, bundled to `dist/work-packets.mjs`. The skill runs it through `skills/wf/scripts/work-packets.mjs`.
- `intake/brainstorm/_work.md`: 3.3 fields and forms, write-now pieces (K5–K9), check and write, `Next`, reopening (V1–V7), the `add` capture, older boards (M2).
- `intake/brainstorm/_artifact.md`: the new `work[]` fields and the Sources section (R1–R5, F1–F5).
- `intake/_packet.md`: the packet form of intake (P1–P5, I1, I1a, I3). Shape Step 9b holds I4; `review/intent-fidelity.md` holds I5.
- Hooks: `lib/hook-utils.mjs` (`isFreeFormWorkflowPath`, `isWorkPacketPath`), `hooks/pre-write-validate.mjs` (the V3 guard), `hooks/post-write-verify.mjs`, `hooks/render-on-artifact-write.mjs`, `scripts/render-sunflower.mjs`, `lib/workflow-index.mjs`.
- Tests: `tests/unit/skills/work-packets.test.mjs`, `tests/unit/hooks/work-packet-hooks.test.mjs`, eval `tests/evals/cases/brainstorm-packet-intake.json` with fixture `brainstorm-packets`.

**Departures from the plan.**
- **Packet `slug`.** Every file in a workflow folder carries that folder's slug, and both write hooks check it. So a packet's `slug` is the brainstorm slug, and the slug the packet opens is `work-slug`. The board's `work[].slug` keeps its meaning.
- **Generated, not hand-written.** A script writes the packets from the board. The plan said `done` writes them. The script makes I1 (verbatim decisions) a property of code, not of the writer.
- **`Next` for a multi-slug set.** `/wf campaign` is not built, so 3.4 prints the start commands of the first wave and the path of `work/index.md`. The campaign build changes `_work.md` "Next" to print `/wf campaign <slug>`.
- **`prepared` and `routed`.** Intake sets `prepared`; shape sets `routed`. The plan named only `prepared` for intake.
- **`history/` is free-form.** A write-now piece copies documents that have no workflow frontmatter into `history/`, so the write hooks no longer hold `history/` files to the NN- name and frontmatter rules.
- **V3 guard covers Write only.** The pre-write hook sees the full content of a Write. An Edit of a started packet is not checked.

**W6 is open.** It needs the person:
- M3 and M3a: convert the 27 realism briefs in SoccerManager to packets. Eleven pieces carry more than 40 decisions, and each split is a joint walk with the person.
- M4: write `references/index.md` for the regen-faces session.
- Run a fresh short brainstorm end to end to a multi-slug `done`.

**Earn rule (SURFACE-POLICY.md section 2) for `work-packet` and `work-set`.**
1. User job: a brainstorm's decisions reach the successor workflow word for word, with their sources and their order.
2. Workarounds: the 27 hand-made briefs of `brainstorm-realism-additions-20260922`, the 229 copied files of `brainstorm-regen-faces-and-aging-20260924`, and session `b253a8c5`, which routed a document edit to `/wf task`.
3. Every new reference file is within its class budget (`npm run verify:prose`).
4. Eval: `tests/evals/cases/brainstorm-packet-intake.json`.
5. `surface-policy.json` `frontmatterTypes` 67 → 69.

