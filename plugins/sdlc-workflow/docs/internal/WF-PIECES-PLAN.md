# WF-PIECES-PLAN — one ordered list, one branch, one piece at a time

Status **BUILT in the working tree 2026-10-24 (W0–W8), not committed, not released; W9 live run open** · Date **2026-10-23** · Owner **jayte**

This plan deletes the wave machinery of `/wf campaign` and the work packets, and rebuilds `/wf campaign` as a thin serial walk over **pieces**.

- A **piece** is a significant subset of the work. It is one normal workflow, with its own folder in `.ai/workflows/`.
- A **list** is the ordered set of pieces that one brainstorm writes at `done`, or that one ideate pick writes. Each brainstorm writes exactly one list, in its `work/` folder. One list gets one branch and one PR.
- A **slice** is one capability of a piece: a group of mechanisms that verify checks together. A piece has a target of 10 slices, in a band of 6 to 14.
- A **step** is one small outcome inside a slice. A slice has fewer than 40 steps. Each step has a done check, a commit and a mark.
- `/wf campaign <brainstorm-slug>` asks how far to go, then walks the list one piece at a time: it slices the piece, runs the yolo driver, reads the fidelity table of the review, and pauses for a try-out when the piece can be tried.
- **yolo changes in one place only** (D33): implement runs one agent per slice, with no step groups.

The wave driver, the ledger, the deps graph, the unit worktrees, the waits, the contracts, the heavy-suite lock and the usage guard are deleted.

## 1. Why

The campaign of today splits the work at every layer, and then it pays to coordinate the parts. These figures come from the live ledgers and the merged PRs on 2026-10-23:

| Project | Units | Waves | Shipped | Measured |
|---|---|---|---|---|
| SoccerManager `brainstorm-realism-additions-20260922` | 64 | 33 | 3 waves, 7 units in 4 weeks | 1,734 carried decisions; wave PR #6 (2 units) added 44,265 code lines in 356 files; PR #7 (3 units) added 75,171 code lines in 514 files; 6 to 26 slices per shipped unit |
| Lantern `brainstorm-android-claude-monitor-widget-20261018` | 9 | 5 | 2 waves | wave 2 = 1 unit, 5 slices: 1,093 minutes, 118M tokens (0.6M output) |
| Secbot `brainstorm-own-dots-pi-durable-celld-20261002` | 12 | 6 | 2 waves | wave 1 = 1 unit, 4 slices: 684 minutes, 788M tokens |
| Trails `ideate-sources-20261018` | 9 | 7 | 2 waves | wave 3 paused: 7-day usage window at 100 % |

Notes:

- Nearly all tokens are cache reads, because each agent reads the context again.
- The per-unit token figures in the SoccerManager `cost.jsonl` files are not usable (one unit shows 342,665M tokens). The cost-ledger rebuild of [WF-SYSTEM-REVIEW-2026-10-21.md](WF-SYSTEM-REVIEW-2026-10-21.md) A1 is not applied. The Secbot figure can be too high for the same reason.
- Lantern and Trails were paused by the usage guard, because the 7-day usage window reached the person's reserve.
- In SoccerManager wave 4, only 6 of 138 cross-unit waits were real needs. Of 158 `depends-on` edges, 146 had no code evidence ([WF-CAMPAIGN-THROUGHPUT-PLAN.md](archived/WF-CAMPAIGN-THROUGHPUT-PLAN.md)).
- On SoccerManager, implement took 68 % of the stage time, verify 23 %, plan 6 % and review 3 %. Most of the cost follows the amount of code, not the number of slices.

The weight has three causes:

1. **Too many layers above the slice.** The packet size limit (soft 25, hard 40 carried decisions, `lib/work-packets.mjs:23-24`) split about 27 briefs into 64 units. Each unit got its own intake, shape, slice pass, branch, worktree and wave.
2. **A graph instead of a sequence.** Deps, waits, contracts, provides and expects, reconciles, sibling checks and trial merges exist only because units run in parallel worktrees. On this machine the width is at most 2, and the heavy-suite lock makes the test runs wait for each other. The coordination costs more than the parallel runs save.
3. **Ceremony on every wave.** A version, a tag, a stacked PR, as-built notes, drift, fidelity, refute and a built output repeat on every wave.

The campaign machinery is about 10,800 lines of code and prose, plus about 5,800 lines of tests (section 11).

### Why the campaign has a CLI today

The Workflow runtime gives a driver script no file access (`yolo.js:18-23`). Several units in parallel worktrees, the session and the mod all wrote to one ledger. So `scripts/campaign.mjs` became the only ledger writer, with a lock. It also ran the git worktree and stack commands, and it grew to about 45 subcommands.

The new campaign has no ledger. Its state is the `state` field of each piece file. The new `scripts/campaign.mjs` keeps a few commands (section 6.4). These are writes that must be exact or word for word, so a script does them and a model does not.

## 2. Decisions

All decisions are the PO's, of 2026-10-23. A later decision replaces an earlier one where it says so. The table holds the current text of each decision. Three numbers are not in the tables, because later decisions replace them: D3 ("no slices inside a piece") by D14, D4 ("per piece: plan, implement, verify, review and intent fidelity") by yolo plus D35, and D17 (the slice size) by D31.

### 2.1 The model

| Item | Decision |
|---|---|
| D1 — the model | **One ordered list, one branch, serial drive.** The coordination cost removes the worth of parallel runs. |
| D2 — a piece | **A piece is a significant subset of the work**, and one normal workflow. |
| D5 — open campaigns | **Migrate them** (section 12). |
| D6 — intake and shape | **The brainstorm writes them for every piece**, at `done`, with the person present. There is no intake or shape stage per piece. |
| D11 — the key | **Keep `/wf campaign`**, rebuilt as the walk. The key count stays 19. |
| D12 — the cutover | **Hard cutover.** One release removes the old campaign. The migration script reads the old ledger, so no old campaign code needs to stay. |
| D13 — the usage guard | **Delete it.** The guard also pauses and resumes yolo runs (`hooks/mod/usage-guard.ts:13-16`), so a run now stops at the usage limit and needs a manual restart. The PO chose this after the review. |
| D18 — the SoccerManager scope | **Keep the realism brainstorm as one list.** |

### 2.2 Pieces, slices and steps

| Item | Decision |
|---|---|
| D9 — the standalone slice stage | **Keep it.** The slice stage serves pieces and the standalone lifecycle alike. |
| D14 — who slices | **The campaign walk slices each piece**, with policy answers, before it launches yolo. |
| D15, D22 — slices per piece | **A target of 10, a band of 6 to 14.** |
| D38 — more than 14 slices | **Warn and continue.** The walk tells the person and continues. The person can split the piece later. |
| D16 — steps | **Each slice has ordered, clear steps, and each step is marked off when it is done** (section 6.6). |
| D31 — what a slice is | **A slice is one capability**: a group of mechanisms that verify checks together, for example "the staff attribute model and ratings". The small outcomes of the capability are its steps. This replaces "a slice is one outcome" (the first D17). |
| D32 — steps per slice | **Fewer than 40 steps per slice.** A capability that needs 40 or more becomes two slices. |
| D33 — implement agents | **One implement agent per slice, with no context limit.** The step groups of C3 go. The step commits and the step record of C2 stay. This is the one change to yolo. |
| D40 — implement research | **Implement keeps its full research step** (`implement.md:112`, `implement/_research.md`), also when the plan has a `## Handover` (D28). The handover adds plan output and removes no research, so W9 measures the cost of both together. |
| D26 — grouping | **One family per piece, and platform pieces apart.** Engine and platform work get pieces of their own. |
| D7 — size | **The number of pieces has no cap.** It follows from D15 and D26. |

**Known risk of D31 + D32 + D33** (section 15). The context tokens per step of one implement agent rise with the length of the slice: 2.03M at 11–15 steps, 2.91M at 16–21 steps. A capability slice of 25 to 39 steps is beyond the measured range, and long agents reach a ceiling near 468,000 tokens. The PO kept the three decisions after the review. W9 measures the result (section 14).

### 2.3 Brainstorm `done`

| Item | Decision |
|---|---|
| D20 — `ux-impact` | **The person confirms `ux-impact` for every piece at `done`.** |
| D24 — write-up | **Every piece is written in full at `done`.** Only the slicing is lazy. |
| D36 — decision confirmation | **No re-confirmation at `done`.** The decisions were confirmed in the brainstorm, and the script copies them word for word. `done` confirms only the grouping into pieces. |
| D21 — decisions as data | **Dropped.** W0b showed that it does not lower the slice count (section 15). |
| D23 — goal pruning | **No.** |
| D30 — packing sibling outcomes | **Dropped.** W0b found 2 sibling pairs in 69 decisions. |

### 2.4 The walk

| Item | Decision |
|---|---|
| D39 — how far one call goes | **The walk asks before it starts**: the next piece only, a number of pieces, or the whole list. |
| D19 — design timing | **Design ahead.** The walk opens every piece and lists the pieces that need design. The person designs any of them between pieces, in the walk's checkout. The walk stops only at a piece whose design is not settled. |
| D25, D37 — try-outs | **A try-out pause only for a piece that the person can try**: `ux-impact` is not `none`, or the piece adds a user-facing command. Engine and platform pieces get no pause. |
| D35 — intent fidelity | **The review rubric `intent-fidelity` writes the per-decision table** (`honoured`, `narrowed`, `dropped`) in `07-review.md`. The walk only reads it and asks about unapproved rows. There is no separate fidelity agent. |
| D34 — the review base | **During a piece's yolo run, `base-branch` names a real local branch that marks the end of the piece before. At `done`, `base-branch` goes back to the trunk.** The review sees only the piece, and handoff and ship see the trunk (section 6.2). |
| D27 — forked stages | **No.** Fresh agents per stage stay. |
| D28 — handover | **Yes.** `plan.md` requires a `## Handover` section (section 6.6). |
| D29 — acceptance tests per piece | **No.** |

### 2.5 Handoff and migration

| Item | Decision |
|---|---|
| D8 — the PR cut | **One PR per list.** When the ship plan asks for stacked PRs, the walk pushes the end branch of each piece and stacks one PR per piece (section 9). The PO rejected one PR per piece to the trunk: it adds handoff and ship work for outputs that do not need it. |
| D10 — in-flight units | **Commit, merge and finish each in-flight unit as one of the first pieces of the list** (section 12.3). The person can drop one at the list confirmation. This replaces "the person chooses keep or drop for each unit". |
| D41 — who runs the migration | **The first `/wf campaign` call migrates.** The person runs no migration command (section 12.2). |

## 3. The end state

```
/wf brainstorm <slug> done   or   /wf intake ideate <slug> <ids…>
  └─ writes the list: work/index.md + one work/<piece>.md per piece, strict order 1..n
       the person confirms the pieces, their scope, acceptance criteria, ux-impact and the stack

/wf campaign <brainstorm-slug>
  ├─ an old campaign ledger and no list → migrate first; in-flight units become the first pieces
  ├─ ask: the next piece, N pieces, or the whole list
  ├─ open every written piece: .ai/workflows/<piece-slug>/ (00-index, 01-intake, 02-shape)
  ├─ list the pieces that need the design stage
  ├─ land the tree on the list branch pieces/<brainstorm-slug>
  └─ for each piece, in order, until the asked count is done:
       ├─ not a build form → stop; route the person to the piece's own command
       ├─ design needed and not settled → stop; route the person to /wf design <piece-slug>
       ├─ start:    base-branch = the end branch of the piece before (or the trunk)
       ├─ slice:    the slice stage as an agent with policy answers → 03-slice.md
       ├─ yolo:     plan → implement → verify per slice; one slug-wide review
       ├─ fidelity: read the per-decision table of 07-review.md; ask about unapproved rows
       ├─ try-out:  only when the piece can be tried; a problem → /wf intake extend, then yolo
       └─ done:     state done; end branch at HEAD; base-branch back to the trunk; merge the trunk in
  └─ handoff: one PR for the list (or stacked PRs when the ship plan asks)
```

## 4. The piece

### 4.1 The piece file

The brainstorm board already orders its pieces: each `work[]` entry has `order` and `why-here` (`brainstorm/_work.md:18-26`). This plan keeps the file layout `work/<piece>.md` + `work/index.md`, and renames the type from `work-packet` to `piece`. One term per concept: the word "packet" goes from every file except the archive.

Frontmatter of `work/<piece>.md`:

| Field | Content |
|---|---|
| `type` | `piece` |
| `slug` | the brainstorm or ideate folder (the hooks need it) |
| `key` | the piece key |
| `piece-slug` | the workflow slug that the piece opens (was `work-slug`) |
| `form` | as today (`brainstorm/_work.md:30-44`): `intake`, `fix`, `hotfix`, `extension`, `rca`, `investigate`, `discover`, `task`, `write-now` |
| `target-slug` | as today, for `fix`, `hotfix` and `extension` |
| `order`, `why-here` | as today |
| `state` | `written` → `open` → `built` → `done`, or `dropped` |
| `carried-decisions` | as today: `{key, text, session, decided-at}`, word for word (`lib/work-packets.mjs:356`) |
| `amends` | as today, for a piece that changes a done piece |
| `ux-impact` | confirmed by the person at `done` |
| `try-out` | `yes` or `no` (D37): `yes` when `ux-impact` is not `none` or the piece adds a user-facing command |
| `design-form`, `sketches` | as today (`intake/brainstorm/_design.md`) |

The body has these sections: `## Goal`, `## In scope`, `## Out of scope`, `## Acceptance criteria`, `## Constraints`, `## Risks`. The acceptance criteria are numbered (`AC-1` …), and each criterion is checkable.

`work/index.md` also holds the list's `stack:` block, confirmed once by the person at `done` (section 4.3).

These fields go: `routed-to`, the `prepared` and `routed` states, `depends-on`, `provides`, `expects`, `needs`.

### 4.2 The size rules

The decision-count limits (soft 25, hard 40) go, because they made the split into 64 units. The new rules:

1. Each piece is one deliverable in one area of the product. Engine and platform pieces are deliverables too, but they have nothing for the person to try (D37).
2. A piece holds one family of outcomes, so the setup cost of the family is paid once (D26). Two areas that the person tries together can be one piece.
3. Engine and platform work get pieces of their own (D26).
4. A piece has a target of 10 slices, in a band of 6 to 14 (D15). When the brainstorm expects an area to need more than 14, it splits the area at a point where the first part is complete.
5. The number of pieces has no cap (D7).
6. Every carried decision of the board goes into exactly one piece. `campaign.mjs check` refuses a board where a decision is in no piece, or in two pieces.

The brainstorm estimates the slice count of each piece. The slice stage counts the real slices (section 6.3).

**The SoccerManager count.** The work that is not shipped is about 330 to 570 slices of today's slicing (section 15, W0b). Capability slices (D31) halve that: in the staff packets, 26 mechanism outcomes form about 8 capabilities, where today's slicing gives about 16 slices. So the list is about 165 to 285 capability slices, and at a target of 10 slices per piece, **about 17 to 29 pieces**. The family and platform rules round this up. The halving rests on one area, grouped by Claude, with tags that the person has not confirmed. These counts assume that later units are like the shipped ones. That is not checked.

**One list for SoccerManager (D18).** 17 to 29 pieces is one very large PR, roughly 1M lines or more at today's lines per slice. The walk merges the trunk into the list branch after each piece (section 6.2), so the branch does not drift from the trunk. The early handoff of section 9 lets the person ship the done pieces at any point.

### 4.3 Who writes the piece (D6)

`/wf brainstorm <slug> done` and the ideate pick (`intake/ideate.md:199-211`) write the pieces. They do the work that intake and shape do today for a packet:

1. Propose the pieces, in order, with `why-here` and `form`, under the rules of section 4.2.
2. For each piece, write the goal, the scope, the acceptance criteria, the constraints and the risks.
3. Propose `ux-impact` and `try-out` for each build piece. The person confirms them (D20, D37).
4. Detect the stack once for the list, as intake Step 0.5 does today, and ask the person to confirm it. Write it to `work/index.md` with `user-confirmed: true`.
5. Confirm the list with the person. The person can merge, split, reorder or drop pieces. Do not confirm the decisions again (D36).
6. Run `campaign.mjs write`. It checks the board, then writes the piece files, and it writes `work/index.md` last.

A `write-now` piece is still written in the brainstorm session, as today. The prepare pass of the old campaign goes: the person no longer runs intake, shape and slice for each unit.

## 5. Opening a piece

`node "<skill-dir>/scripts/campaign.mjs" open <brainstorm-dir> <piece-key>` writes the workflow folder of a build piece (`intake`, `fix`, `hotfix`, `extension`). It is a script, not an agent, so the text stays word for word. The folder must pass the preconditions of every later stage.

The script writes:

- `00-index.md`:
  - `workflow-type: feature` for every build piece. The always-on `intent-fidelity` review runs only for `feature` or unset (`review/_stage.md:127`). A `fix`, `hotfix` or `extension` piece records `amends: <target-slug>`; it does not use the change-mode workflow types, because those allow one slice only (`implement.md:78`).
  - `origin-piece: <path>`, `origin-items: [<every carried key>]`
  - `stack:` copied from `work/index.md`, with `user-confirmed: true` (`slice.md:58-60` stops without it)
  - `ux-impact: <value>`, `ux-impact-confirmed: true`
  - `progress.design: skipped` with `design-skip-reason: ux-impact none` when `ux-impact: none`
  - `intent-risks:` seeded from `## Risks`, one entry per risk (an absent key is illegal, `intake/default/_artifact.md:91`), each with `status: carried` and `po-ratified: true`: the person confirmed it at brainstorm done, and no shape stage runs to adjudicate an `open` risk, which `handoff.md:66` refuses. `02-shape.md` lists each one under `## Unknowns / Open Questions`, carried to the slug-wide review.
  - `charter: none-declared`
  - `branch-strategy: dedicated`, `branch: pieces/<brainstorm-slug>`, `base-branch: <trunk>`
  - `review-scope: slug-wide`, `review-scope-confirmed: true`
- `01-intake.md`, `status: complete`: `## Restated Request` (the goal), `## Known Constraints` (each from a carried decision cites `source: <board path>#<item-key>`), and `## Success Criteria` (the acceptance criteria of the piece, word for word). The slug-wide review quotes these word for word (`review/_stage.md:55`).
- `02-shape.md`: the goal, the scope, the acceptance criteria and the constraints of the piece, and the `## Intake Fidelity` table with one row per carried decision, key and text word for word, as `shape.md:166` writes today.
- The row of the piece in `.ai/workflows/INDEX.md`.

It sets the piece `state: open`.

## 6. The campaign walk

### 6.1 The steps

`reference/campaign.md` is rewritten. The session follows it. In these steps, `<brainstorm>` and `<brainstorm-slug>` name the source folder: a brainstorm folder or an ideate folder (section 12.6).

0. When the source folder has an old campaign ledger and no list, migrate first (section 12.2). The person types no other command for it.
1. Run `campaign.mjs status <root> <brainstorm>`. It returns the list, the state of each piece, the current piece (the first piece that is not `done` or `dropped`), and the build pieces whose design is needed and not settled.
2. Ask the person how far to go: the next piece only, a number of pieces, or the whole list (D39).
3. Run `campaign.mjs open` for each build piece that is `written`, so that the person can design a later piece between pieces (D19). Show the person the pieces that need design, in list order.
4. When no piece is left, or the asked count is done, go to step 15.
5. When the current piece is not a build form, stop. Route the person to the command of its form, for example `/wf intake investigate …` or `/wf intake task …`. When the person marks the piece done or dropped, go to step 1.
6. When the design of the current piece is needed and not settled (`design/_lane.md`, "Design is settled"), stop. Route the person to `/wf design <piece-slug>`. Go to step 1 after the person returns.
7. Land the tree on the list branch `pieces/<brainstorm-slug>`. If it does not exist, create it from the trunk. Do not stash, and do not force a switch.
8. Run `campaign.mjs start <root> <brainstorm> <piece-key>`. It sets `base-branch` (section 6.2).
9. When `03-slice.md` is absent, run the slice stage on the piece (section 6.3).
10. Launch the yolo driver on the piece slug, as `/wf yolo <piece-slug>` does: `yolo.md` Steps 0.3 to 0.5, then Step 1 onward. Wait for the run to end. When the run stopped, show its stop to the person, follow the answer, and do not continue to the next piece. When the run ends clean, run `campaign.mjs built`.
11. Read the per-decision fidelity table of `07-review.md` (section 8). For each `narrowed` or `dropped` row that the person has not approved, ask the person: fix it, or approve it.
    - **Approve:** record the answer in `po-answers.md` with the item key.
    - **Fix:** go to step 13 with the finding as the problem text.
12. When the piece has `try-out: yes`, pause for the try-out. Tell the person how to run the piece: the build command, the screen or the command to open, and the acceptance criteria to try. Ask one question: the piece works, or describe the problem.
    - **Works:** record the answer in `po-answers.md` with the key `try-out`. Go to step 14.
    - **A problem:** go to step 13 with the person's words.
13. Add the fix as work: run `/wf intake extend <piece-slug> <problem text>` with the person. It adds a slice to the roster. Then go to step 10. yolo plans, implements and verifies the new slice, and it runs the slug-wide review again over the whole piece (`yolo.js:2908-2912`). A yolo re-run with only a steer changes no code, because yolo skips the slice stages that are already clean (`yolo.md:23`); only the review runs again. When the problem is new scope, the person can add it as a new piece with `/wf intake brainstorm <brainstorm-slug> add <text>` instead.
14. Run `campaign.mjs done <root> <brainstorm> <piece-key>` (section 6.2). Go to step 4.
15. When the list is finished, hand off (section 9). Otherwise, report the next piece and end.

Resume is free: step 1 reads the states again. A stop request stops the yolo run at its next stage boundary, as today.

### 6.2 The review base (D34)

yolo's slug-wide review diffs `<base-branch>...HEAD` (`yolo.js:1741,2053`). yolo also uses `base-branch` to create the branch when it does not exist (`yolo.js:1582-1600`). Handoff and ship read `base-branch` as the trunk: the PR base (`handoff.md:119`), the rebase onto `origin/<base-branch>` (`handoff.md:130`), and the release push (`ship.md:79`). So `base-branch` may point away from the trunk only during the piece's own yolo run.

- **`start`** checks that the end branch of the build piece before is an ancestor of HEAD (`git merge-base --is-ancestor`). When it is, `start` sets `base-branch` to that end branch. Otherwise, and for the first build piece, `start` sets `base-branch` to the trunk.
- **`done`** refuses unless the piece is `built`, the fidelity table has no unapproved row, and the try-out is recorded when `try-out: yes`. Then it:
  1. sets `state: done`
  2. sets `base-branch` back to the trunk in the piece's `00-index.md`
  3. merges the trunk into the list branch when the trunk moved, with a merge commit; a conflict stops `done` and goes to the person
  4. moves the end branch of the piece, `pieces/<brainstorm-slug>--<piece-key>`, to HEAD, after the merge, so the next piece's review does not include the trunk changes
  5. for a migrated piece, removes the old unit worktree with the guarded remove (section 12.7)

For a migrated piece, `start` first commits the uncommitted work of the unit and merges the unit branch into the list branch (section 12.3).

The end branches are real branches, named by piece key and not by order, so a piece inserted later does not rename them. The name uses `--`, not `/`, because git refuses a ref `pieces/<brainstorm-slug>/…` while a branch `pieces/<brainstorm-slug>` exists. For the same reason, the list branch is `pieces/<brainstorm-slug>` and not `campaign/<brainstorm-slug>`: the old unit and wave branches `campaign/<brainstorm-slug>/wave-<n>…` still exist in every migrated project (checked 2026-10-24), and they block a branch `campaign/<brainstorm-slug>`. W2 checks this with a probe before anything else is built on it.

### 6.3 The slice stage in the walk (D14)

yolo never runs the slice stage. The walk runs it once per piece, as one subagent that follows `reference/slice.md` with these policy answers:

- The scope, the acceptance criteria, `ux-impact` and the stack are confirmed. Do not ask about them again.
- Cut one slice per capability (D31): a group of mechanisms that verify checks together. The small outcomes of the capability become the steps of its plan. A slice has fewer than 40 steps (D32). Do not size a slice by lines.
- Aim for 10 slices. When the piece needs more than 14, write them and return a warning (D38).
- Step 6c (review scope): `slug-wide`, recorded with `by: standing default`. `slice.md:96` already has this path; its words change from "a campaign unit" to "a campaign piece".
- When `02c-craft.md` exists, map every slice to its surfaces and board keys, and write `ux-impact` into each slice file (`design/_lane.md`, "One duty per stage").
- An intent-bearing choice, for example a slice that drops or narrows an acceptance criterion, is a stop. The walk asks the person.

### 6.4 The new `scripts/campaign.mjs`

| Command | Use |
|---|---|
| `check <board>` | the board check of section 4.2 |
| `write <board>` | writes the piece files and `work/index.md` |
| `open <brainstorm-dir> <piece-key>` | section 5 |
| `status <root> <brainstorm>` | the list, the current piece, the pieces that need design |
| `start <root> <brainstorm> <piece-key>` | sets `base-branch` of the piece (section 6.2) |
| `built <root> <brainstorm> <piece-key>` | `state: built` after a clean yolo run |
| `done <root> <brainstorm> <piece-key>` | section 6.2 |
| `owner <root> <slug>` | returns `owned: false`, always. yolo calls it (`yolo.md:124`), and the walk's own yolo launches must not stop. With no parallel wave, nothing owns a piece. |
| `slice-order <checkout> <slug> add …` | unchanged. yolo calls it (`yolo.js:2533`). It moves with `lib/roster-edit.mjs`. |
| `archive` | from `work-packets.mjs archive` |
| `migrate <source-dir>` | writes `work/migration.md` and the piece files of the in-flight units. The walk runs it at step 0; the person never types it (section 12.2). |
| `remove-worktree <path>` | the guarded remove (section 12.7). Step 9 of section 12.2 and `done` use it. |

`lib/work-packets.mjs` becomes `lib/pieces.mjs`. `skills/wf/scripts/work-packets.mjs` and the `work-packets` dist entry (`scripts/build.mjs:80`) are deleted.

### 6.5 The yolo change (D33)

`implementSlice` (`yolo.js:2302`) runs one implement agent for the slice and passes no step group. `IMPLEMENT_GROUP` and `implementGroups` go from `yolo.js` and `_shared.js`. The "Step groups (C3)" section goes from `implement/_steps.md`, and `implement.md:112` loses its "a later step group" case. The step commits and `.implement-progress.jsonl` (C2) stay. If an agent stops before the last step, the next implement run continues after the last committed step.

Apart from D33, yolo keeps its code and its text. These references to old campaign code stay valid:

- `yolo.md:124` calls `campaign.mjs owner`, which now returns `owned: false`.
- `yolo.js:2533` calls `campaign.mjs slice-order`, which the new script keeps.
- `scripts/stage-yolo-driver.mjs:43` imports `modelsOf` from `lib/campaign.mjs`. `lib/campaign.mjs` stays as a small file with `modelsOf` and the pure helpers that the new script needs.
- `steeringClause` keeps its `campaignSteerPath` parameter. The walk passes nothing, so the parameter has no effect.
- Decision test 6, "Changes a campaign contract line" (`_decision-classes.md:27`), stays in the text, because three yolo prompts say "the six tests". It can never fire, because pieces have no contract lines.
- yolo's design gate (`yolo.js:1508`) still stops a run on a design that is not settled. The walk checks the same rule first.
- The words "wave" in `yolo.js` (lines 80, 658-667, 900-901, 2763) stay. Most of them name the plan fan-out waves of a standalone workflow, not the campaign.

The shared-driver build (`_shared.js`, `scripts/build-drivers.mjs`, `driver-parity.test.mjs`) stays, with `yolo.js` as its only target.

### 6.6 Steps inside a slice (D16, D28)

Most of D16 exists today:

- `plan.md` writes `## Step-by-Step Plan` with numbered steps and `metric-step-count`.
- Under `branch-strategy: dedicated` (every piece), `implement/_steps.md` commits each step (`wip(<slug>): <slice-slug> step <n>`) and records it in `.implement-progress.jsonl`. A resumed implement continues after the last committed step.
- yolo orient step 2b reads that file and counts the committed steps (`yolo.js:1432-1437`).

Three reference edits finish D16 and D28:

1. **A clear step.** `plan.md` requires each numbered step to name its files and its done check: the command or the observation that shows the step is done.
2. **A precise handover (D28).** `plan.md` requires a `## Handover` section: the exact files and symbols to change, the test command, and the decisions already made. In the research, handovers chosen with care raised the success rate, and handovers that the agent chose for itself lowered it.
3. **A visible mark.** While the slice is in progress, `/wf status <piece-slug>` reads `.implement-progress.jsonl` and shows each step of the plan as done (with its sha) or open, and "step n of m". At the end of the slice, `05-implement-<slice>.md` gets a `## Steps` table: the step number, the step title, `done` or `deviated`, and the commit sha.

## 7. Design

The design lane (`design/_lane.md`) does not change. A piece is a normal workflow, so each rule of the lane applies to it.

### 7.1 Brainstorm and design focus

- A design brainstorm (`intake/brainstorm/_design.md`) works as today: sketches are ideas, items about looks and behaviour carry `design: true`, and sketches are files in `design/sketches/`.
- At `done`, each build piece records `ux-impact`, `design-form` and `sketches`, as each packet does today.
- A `design-direction` piece is not a build piece. The walk routes the person to `/wf design direction from <brainstorm-slug>`, as today.

### 7.2 The design stage of a piece

- `campaign.mjs open` writes `02-shape.md`. The design stage needs only that file. It writes the brief `02b-design.md` itself when the brief is missing, with the person present (`design/stage.md:32`).
- The carried design thoughts reach the stage through `design/_carried.md`. Source 1 changes from "the origin packet" to "the origin piece". Source 2 reads the board piece whose `piece-slug` is this slug, in place of `routed-to`.
- The design stage stays human-only. The person designs ahead between pieces, in the walk's checkout on the list branch. Design work in another worktree or branch does not reach the walk. The design commits land after the end branch of the piece before, so they appear in the next piece's review diff; they are `.ai/` and design files, not code.
- The design stage runs before the slice stage, as the lane requires. The walk slices a piece only after its design is settled, so the slices map to the confirmed boards.
- `design.md` Step 2 and `design/stage.md` "Chat return" name the campaign order today. The new text: "Type `/wf campaign <brainstorm-slug>`." when `00-index.md` has `origin-piece`.

### 7.3 After the design

Plan, implement, verify and review keep their design duties (`design/_lane.md`, "One duty per stage"). They run inside yolo, as today. A finding that the confirmed design cannot be built as drawn stops the yolo run and routes to `/wf design <piece-slug> amend`, as today.

## 8. Intent fidelity per piece (D35)

The review rubric `intent-fidelity` already reads the carried decisions of the origin packet and shape's `## Intake Fidelity` table, and it is always on at slug-wide scope for `workflow-type: feature` (`review/intent-fidelity.md:16`, `review/_stage.md:127`). The review already has refuters (`yolo.js:81`). So the per-piece check goes into that rubric, and the walk adds no agent:

1. `review/intent-fidelity.md` reads `origin-piece` in place of the origin packet.
2. When `origin-piece` is set, the rubric writes a `## Decision Fidelity` table in `07-review.md`: one row per carried key, `honoured`, `narrowed` or `dropped`, with the evidence as `file:line`. A `narrowed` or `dropped` row is a finding, so the review's refuter checks it.
3. A row that cites an approval in `po-answers.md` (with the key) is approved.
4. The walk reads the table at step 11 and asks the person only about unapproved rows.

This replaces the old campaign's wave fidelity checkpoint (`campaign-wave.js:4033,4371`, `campaign/_boundary.md:108-150`).

## 9. Handoff and ship (D8)

When every piece is `done` or `dropped`, the campaign hands off. Each piece's `base-branch` is the trunk again (section 6.2), so handoff and ship work as today. The walk runs `/wf handoff pieces/<brainstorm-slug>`, the batch mode over every slug on the list branch (`handoff.md:57-60`). It names the last done piece as the lead.

- **The ship plan asks for stacked PRs.** The walk pushes the end branch of each piece and opens one PR per piece, each with the end branch of the piece before as its base, the first with the trunk. The steps of today's `campaign/_gh-stack.md` move into `campaign.md`.
  - NOT BUILT (review of 2026-10-24). `.ai/ship-plan.md` has no key that asks for stacked PRs for a list, so nothing can choose this path. An end branch also holds the trunk merge of `done`, so the PR of a piece would show trunk changes. `campaign.md` says that stacked PRs are not built. Build this path with a ship-plan key, and with a PR base that leaves out the trunk merge.
- **Otherwise.** One PR for the list branch. The PR body lists each piece with its title, its acceptance-criteria result and its fidelity table.

Handoff needs all of these:

- every piece `done` or `dropped`
- no unapproved fidelity row
- the open-RIM gate of `handoff.md:66` passes for each piece

The person can hand off early. Then the walk hands off the done pieces. After that PR merges, delete the list branch and the end branches of the shipped pieces. A squash merge leaves the old commits off the trunk, so the next PR must not start from the old list branch. Step 7 then creates the list branch again from the trunk, and `start` uses the trunk as the base, because no end branch is left (section 6.2).

`/wf ship` ships the PR or the stack as today. A version, tag and built output for each wave go.

## 10. The wider `/wf` structure

| Key or mode | With pieces |
|---|---|
| `intake` (default) | Not run for a piece. `campaign.mjs open` writes `01-intake.md`. A request that is not part of a list still starts here, as today. |
| `intake brainstorm` | `done` writes the list (section 4.3). `add <text>` appends a piece to the list: a `fix` or `hotfix` piece goes before the first piece that is not started; any other piece goes last. A started piece is never rewritten; a change to it is a new piece with `amends`, as today. |
| `intake ideate` | The pick writes the list, as it writes packets today (`intake/ideate.md:204-211`). |
| `intake extend` | Adds a slice to a piece for a try-out or fidelity fix (section 6.1 step 13). Otherwise unchanged. |
| other intake modes | Unchanged. A list piece of form `rca`, `investigate`, `discover` or `task` routes to its mode (section 6.1 step 5). `amend`, `close` and `modernize` run on a piece slug like on any workflow. |
| `shape` | Not run for a piece. `/wf shape <piece-slug>` can still reshape a piece before the walk reaches it. |
| `design` | Section 7. |
| `slice` | Run by the walk (section 6.3). `/wf slice <piece-slug>` by hand also works; the walk then skips step 9. |
| `plan`, `implement`, `verify`, `review` | Run by yolo. Implement runs one agent per slice (D33). Review writes the decision fidelity table (D35). |
| `handoff`, `ship` | Section 9. |
| `retro` | `/wf retro pieces/<brainstorm-slug>` runs the batch retro over every piece on the list branch (`retro.md:66-83`). `retro.md:69` loses its old campaign words (`origin-packet`, wave worktrees, `steer <unit>`). |
| `auto`, `yolo` | `/wf auto <piece-slug>` and `/wf yolo <piece-slug>` drive one piece by hand. |
| `probe` | Unchanged, per piece slug. |
| `status` | `status.md:78-80` ("Live campaign first") shows the list: each piece, its state, and the pieces that need design. `/wf status <piece-slug>` shows "step n of m" (section 6.6). |
| `loop goal`, `loop optimize`, `loop prototype` | Unchanged. They do not take part in a list. |
| `project ship-plan` | The ship plan says whether a list ships as stacked PRs (D8). |
| `docs` | Unchanged. A `write-now` piece is still written at `done`. |

## 11. What is deleted and what is edited

The inventory of 2026-10-23 and the review of the same day list each file and line. In short:

**Delete.**

| Group | Lines |
|---|---|
| `skills/wf/workflows/campaign-wave.js` | 4,467 |
| `lib/campaign.mjs` (all but `modelsOf` and the helpers of section 6.4), `lib/campaign-locks.mjs` 109. `lib/campaign-records.mjs` (309) stays, because `migrate` uses its three-way records sync (section 12.2, step 4); it goes in the release after the last migration. | about 1,800 |
| `scripts/campaign.mjs`: every command except those in section 6.4 | about 2,400 |
| `skills/wf/reference/campaign/` (11 files) | 875 |
| `hooks/mod/live/model/campaign.ts` | 271 |
| The usage guard (D13): `hooks/mod/usage.ts` 142, `hooks/mod/usage-guard.ts` 247, the `usageGuard` setting, the guard calls in `register.ts` and `active.ts`, `tests/unit/mod/usage-guard.harness.mjs`, `tests/unit/usage-guard-mod.test.mjs`, the guard tests in `register.test.ts` | about 500 |
| The heavy-suite lock and `heavy-run`: only the old campaign uses them | in the lines above |
| Tests: the CLI, lib, wave-event, mod and skills tests of the old campaign, and the eval case and fixture | about 5,800 |

`dist/campaign.mjs` is generated again by the build.

**Rename.** `lib/work-packets.mjs` (709 lines) becomes `lib/pieces.mjs`. `intake/_packet.md` goes, because the brainstorm does its work. The schema `$defs` for the packet and the work set change to the piece and the list (`tests/frontmatter.schema.json:2159-2213`). This schema is live: `hooks/post-write-verify.mjs:11` checks every artifact against it.

**Edit.**

- `scripts/yolo-watch.mjs`: remove the wave and ledger code (header 34-58, imports 79-80, 87-115, 485-710, and the other lines in the inventory). yolo and optimize keep the watch.
- The mod live view: `live/register.ts` (the wave poll, the toasts, the control file), `model/needs.ts` (the wave needs), `styles/facts.ts` (`campaignFacts`), `types/index.d.ts`, `state.ts`, `readledger.ts`. A small list view replaces the wave view: the pieces, the state of each piece, and the pieces that need design.
- `lib/live-events.mjs` (`resumeCommand` for `campaign-wave`), `lib/cost-ledger.mjs:449-511` (the wave attribution), `lib/brainstorm-page.mjs`, `lib/brainstorm-archive.mjs`.
- `SKILL.md`, `hooks/mod/catalog.ts:47`, both plugin manifests, `README.md:60` and the docs site pages (`commands`, `configuration`, `hooks`, `autonomous-drivers`, `choose-your-entry`, `intake-modes`, `guides/design`, `guides/investigation`): the new meaning of the campaign key. The key count stays 19.
- The config schema: delete the `campaign` object (`schemas/sdlc-config.schema.json:289-431`).
- Brainstorm: `intake/brainstorm.md`, `intake/brainstorm/_artifact.md`, `intake/brainstorm/_work.md` (section 4.3), `intake/default/_artifact.md`.
- Design: `design.md:132`, `design/stage.md:137`, `design/_output.md:60` (the campaign order), `design/_carried.md` sources 1 and 2.
- Slice: `slice.md:96` (the standing-default words), `slice.md:204-206` (the campaign `unit:` roster field goes).
- Review: `review/intent-fidelity.md` (section 8).
- The other references that name the old campaign: `_host-invocation.md`, `_question-craft.md`, `_subagents.md`, `goal.md`, `intake/_intake-context.md`, `intake/extend.md`, `extend/_artifacts.md`, `plan.md:229`, `prototype.md`, `route.md`, `status.md:78-80`, `verify/_deferrals.md:61-81`, `yolo/_commentary.md`, `retro.md:69`. Leave `design/_design-context.md`, `_heuristics.md` and `mode-persuade.md`, because they use "campaign" in its marketing sense.
- The readers of packets: `intake.md:24,32` ("Packet first" goes), `_intake-provenance-consume.md`, `shape.md:87,166`, `scripts/design-boards.mjs:560-587`, `_requires.md:31`, `hooks/pre-write-validate.mjs:27-37,114,151-155`, `lib/hook-utils.mjs:134-147`, `hooks/mod/live/model/brainstorm.ts`.
- Tests that name the campaign in passing: `ideate-sources.test.mjs`, `prototype-guards.test.mjs`, and the others in the inventory.
- Internal docs: move the eight old campaign plan and probe docs to `docs/internal/archived/`. Update the campaign block of `capability-inventory/load-baseline.json:128-180`.

## 12. Migration of the open campaigns (D5, D10, D41)

### 12.1 State on 2026-10-23 and 2026-10-24

The ledger state is of 2026-10-23. The worktrees, branches and PRs were checked with git and `gh` on 2026-10-24.

| Project | Open wave | In flight | Not started |
|---|---|---|---|
| SoccerManager realism | wave 4 `running` | 3 units `running`, 2 `stopped` | 51 `planned`, 1 `prepared` |
| Lantern | wave 3 `running`, paused (usage) | 3 units `running` | 4 `planned` |
| Trails ideate | wave 3 `running`, paused until 2026-10-26 09:00 UTC | 2 unit worktrees | 5 `planned` |
| Secbot | none | none | 5 `prepared`, 5 `planned` |

The old campaign worktrees:

| Project | Worktree | Branch (after `campaign/<source-slug>/`) | Commits ahead of `main` | Wave base in `main` |
|---|---|---|---|---|
| SoccerManager | `C:/Users/jayte/wt/tmhdyb/w4-1` | `wave-4--realism-harness-core-harness-pass-rules-and-checks` | 70 | yes (merged) |
| SoccerManager | `w4-2` | `wave-4--realism-player-record-real-players-researched` | 25 | yes |
| SoccerManager | `w4-3` | `wave-4--realism-team-shape-tactics-phases-and-set-pieces` | 21 | yes |
| Lantern | `~/.sdlc/wt/tn66fs/w3-1` | `wave-3--lantern-notifications` | 101 | yes (merged) |
| Lantern | `w3-2` | `wave-3--lantern-run-pages` | 111 | yes |
| Lantern | `w3-3` | `wave-3--lantern-chip-bar` | 82 | yes |
| Lantern | `w2-1`, `wave-2` | wave 2, shipped | 0 | yes |
| Trails | `~/.sdlc/cw/tn74m9/w3-1` | `wave-3--firestore-and-cloud-functions-hardening` | 155 | squash-merged (wave 2, PR #36) |
| Trails | `w3-2` | `wave-3--android-data-integrity` | 278 | squash-merged |
| Trails | `wave-2` | wave 2, shipped as PR #36 | 43 (the squashed commits) | squash-merged |
| Trails | two `trial` worktrees under `.scratch/campaign/` | detached HEAD | — | — |
| Secbot | `cell-runtime`, `w2-1`, `wave-2` under `.scratch/` | waves 1 and 2, shipped as PRs #1 and #2 | 18 to 34 (the squashed commits) | squash-merged |

Other worktrees in these projects do not belong to the old campaign, and the migration does not touch them: 4 POC worktrees in SoccerManager, 5 worktrees in Trails (`fix-pages`, an agent worktree, `.worktrees/*`), and 2 agent worktrees in Secbot.

Two facts change the migration:

- **`.ai/` is not tracked in git** in all four projects (`.gitignore`: `.ai/*` or `.ai/workflows/*`). The old campaign kept "local records": it copied `.ai/` into each unit worktree and synced the changes back (`reference/campaign/_records.md`). So a git merge of a unit branch carries its code but not its workflow files. On 2026-10-24, the SoccerManager `w4-1` copy of its `00-index.md` was two hours newer than the main copy.
- **Trails and Secbot squash-merge the wave PRs.** A wave base is then not an ancestor of `main`, although its PR is merged. A plain merge of a Trails wave 3 unit would bring the 43 wave 2 commits back.

SoccerManager also has a stray folder `.ai/workflows/{/work/campaign/` (section 12.5).

### 12.2 The first `/wf campaign` call migrates (D41)

The person does not run a migration command. When `/wf campaign <source-slug>` finds an old ledger (version 1 or 2) in the source folder and no list, the walk migrates first. Then it continues at step 1 of section 6.1. The source folder is a brainstorm folder or an ideate folder (section 12.6).

The walk does these steps:

1. Read the old ledger. When a wave is `running` and its last ledger event is less than 30 minutes old, stop. Tell the person that an old wave run is live and must stop first.
2. Run `campaign.mjs migrate <source-dir>`. It writes `work/migration.md`. It changes no branch and deletes nothing. The report lists:
   - each shipped unit: its packet becomes a `done` piece, as history
   - each in-flight unit: its branch, its worktree, its uncommitted files, its commits ahead of the trunk, and the slices that verified
   - each `prepared` and `planned` unit: its packet, its carried keys, its `ux-impact`, and whether it has a settled design
   - each old worktree, and whether it holds work that no branch holds
   - each stray folder (section 12.5)
3. Check that the trunk holds the earlier waves. For the wave base of each in-flight unit, one of these must be true:
   - `git merge-base --is-ancestor <wave-base> <trunk>` passes (the wave PR was merged with a merge commit), or
   - the PR of every earlier wave is merged (`gh pr list --head <wave branch> --state merged`), which is the squash-merge case.

   When neither is true, stop. List the open wave PRs, and tell the person to merge them first. Otherwise the review and the PR of the first piece include the earlier waves. Record the case of each unit, `merged` or `squashed`, in `work/migration.md`.
4. Bring the records home. For each in-flight unit, copy back to the main checkout every `.ai/` file that the unit worktree created or changed. Use the three-way sync of today (`reference/campaign/_records.md`), with the base hashes in `work/campaign/records/<key>.json`. When both sides changed a file, show the person both versions and ask which version to keep. After this step, the main checkout holds the current records of every unit, and nothing reads the `.ai/` copy in a unit worktree again.
5. Write one piece file for each in-flight unit, and edit its `00-index.md` in the main checkout (section 12.3). These pieces come first in the list.
6. Regroup the units that are not started into pieces, with the person: section 12.4 for a brainstorm source, section 12.6 for an ideate source.
7. Confirm the whole list with the person, as in section 4.3. The person can drop any piece, an in-flight piece too. A dropped in-flight piece keeps its branch unmerged, and its carried decisions go back into the regroup.
8. Run `campaign.mjs write`. The old packet files move to `work/archive/packets/`. The old ledger folder, with its record base hashes, moves to `work/archive/campaign/`.
9. Move the stray folders (section 12.5).
10. Remove each old campaign worktree that is not the worktree of an in-flight piece, with the guarded remove (section 12.7).

### 12.3 In-flight units become the first pieces (D10)

An in-flight unit is already a normal sliced workflow, on its own branch in its own worktree. The migration finishes it as a piece. It does not start the unit again.

- **The piece file.** `type: piece`, `piece-slug` is the unit slug, `carried-decisions` come from the packet, `ux-impact` and `try-out` come from the packet, and `state: open`.
- **The unit's `00-index.md`, in the main checkout.** `origin-piece` replaces `origin-packet`. The migration sets `branch: pieces/<source-slug>`, `base-branch: <trunk>`, `workflow-type: feature` and `review-scope: slug-wide`. It also records `migrated-from: <unit branch>`, `wave-base: <wave base branch>` and `land: merged | squashed` (from step 3 of section 12.2).
- **The order.** In-flight pieces keep the unit order of their old wave. Units of one wave had no needs between them.

The unit's code stays on its branch in its worktree until its piece starts. Its records are already in the main checkout (step 4 of section 12.2). For a migrated piece, `start` does these steps before it sets `base-branch`:

1. Commit the uncommitted code in the unit worktree: the changed tracked files and the new files that git does not ignore. `.ai/` is ignored, so no record goes into the commit. The message is `wip(<unit-slug>): migration snapshot`. The step record does not list this commit, so implement does that step again on top of it.
2. When `land: squashed`, rebase the unit's own commits onto the list branch, in the unit worktree: `git rebase --onto pieces/<source-slug> <wave-base> <unit-branch>`. This replays only the commits after the wave base, so the squashed commits of the earlier waves do not come back. A rebase conflict stops `start` and goes to the person.
3. Merge the unit branch into the list branch, in the walk's checkout, with a merge commit. A conflict stops `start` and goes to the person.

`start` merges one unit at a time, at the start of its own piece. If the migration merged every unit at once, the review of each piece would include the commits of the other units.

The walk then continues at step 9 of section 6.1, in the walk's checkout on the list branch. The unit worktree is idle from this point. The unit already has `03-slice.md`, so the slice stage does not run. yolo finishes the slices that are not clean. Then it runs the slug-wide review over the whole diff of the piece: the unit commits and the new commits. A unit that stopped before the migration stops again at the same point, and the walk shows that stop to the person (step 10).

At `done`, the walk removes the unit worktree with the guarded remove (section 12.7), because the list branch now holds its commits. The unit branch stays.

### 12.4 The regroup of a brainstorm source

`/wf brainstorm <slug>` resumes in regroup mode with the person. It proposes pieces from the units that are not started, under the rules of section 4.2. Every carried key goes into exactly one piece. The decisions are not confirmed again (D36).

A unit that already has a settled design (`02c-craft.md` with boards) keeps it. When the regroup makes that unit one piece, the piece slug is the unit slug, and its design files stay. When the regroup merges a designed unit into a larger piece, its `02c-craft.md` and boards move into the piece folder. The design stage of the piece then starts from them as carried thoughts.

A `prepared` Secbot unit already has `01-intake.md` and `02-shape.md`. The regroup can keep it as one piece. Its `03-slice.md` stays, and the walk skips step 9 for it.

### 12.5 Stray folders

The migration scans `.ai/workflows/` for folder names that are not slugs, for example a name with `{`, `}`, `<` or `>`. Such a folder comes from a path template that was not filled. SoccerManager has `.ai/workflows/{/work/campaign/`.

The migration moves each stray folder to `work/archive/stray/` in the source folder. It uses `git mv` when git tracks the folder. It lists each move in `work/migration.md`. It deletes nothing, so the person can read the folder later.

### 12.6 An ideate source (Trails)

The Trails list comes from `/wf intake ideate`, not from a brainstorm. The ideate folder `ideate-sources-20261018` holds `work/` and the old ledger, as a brainstorm folder does. So `/wf campaign <ideate-slug>` works the same way, with these differences:

- **The regroup (step 5 of section 12.2).** The walk follows the pick of `intake/ideate.md` (lines 199-211) in regroup mode. It groups the units that are not started into pieces, under the rules of section 4.2. Every carried item goes into exactly one piece.
- **The list branch.** `pieces/<ideate-slug>`.
- **New pieces.** A later ideate pick on the same folder appends its pieces to the list, as `add` does for a brainstorm (section 10).

### 12.7 The guarded worktree remove

CAUTION: do not run `git worktree remove --force` on an old worktree. It deletes through a `node_modules` junction into the files that the junction points to.

The guarded remove acts only on an old campaign worktree: a worktree whose branch starts with `campaign/<source-slug>/`, or a detached `trial` worktree under `.scratch/campaign/` whose folder name holds the source slug. It lists every other worktree as untouched. It does these steps:

1. Refuse a worktree that has uncommitted changes outside `.ai/`. Refuse a worktree whose `.ai/` holds a file that the records sync did not bring home (step 4 of section 12.2).
2. Refuse a detached worktree whose HEAD no branch holds, for example a `trial` worktree with commits of its own.
3. Remove each junction and symbolic link inside the worktree, as a link only. The remove must not follow the link.
4. Run `git worktree remove` without `--force`.
5. List each refused worktree in `work/migration.md` for the person.

The remove deletes no branch.

### 12.8 Order

1. Before the release, stop every live wave. A live run uses its staged driver from the versioned plugin cache, so it does not stop by itself.
2. Release the plugin.
3. In each project, the first `/wf campaign <source-slug>` migrates. Start with Secbot, because it has no open wave.
4. Then SoccerManager. Its wave 4 units need waves 1 to 3 in the trunk (section 12.2, step 3). On 2026-10-24 the wave 4 base is an ancestor of `main`, so the three units merge without a rebase.
5. Then Lantern and Trails, after the usage window resets. Their in-flight units run yolo at once, and no usage guard pauses a run at the person's reserve.

## 13. Open questions

None. O1 (implement research against the handover) is answered as D40: implement keeps its full research step.

## 14. Work items

| Item | Content | Done when |
|---|---|---|
| W0 | Freeze: no new old-campaign launch. Record the baseline with the transcript method of section 15 (the C3 study): context tokens per carried decision, and person stops per unit, for Secbot wave 1 and Lantern wave 2. | The baseline table is in section 15. |
| W0b | Decision tags for the SoccerManager staff packets (done, section 15). | The person confirms the tags. |
| W1 | The piece format: the schema, `lib/pieces.mjs`, `campaign.mjs check|write`, the size rules, the decision check, `ux-impact`, `try-out` and the stack at `done`, no re-confirmation. Brainstorm `done` and the ideate pick write pieces. | A board with a decision in no piece fails `check`. A board of 3 pieces writes 3 piece files and `work/index.md` with a confirmed `stack:`. |
| W2 | Probe first, on a scratch repo: `campaign.mjs open` writes a folder; the slice stage runs on it with no stop; the yolo driver drives it, with an end branch as `base-branch`; the review sees only that piece's commits and writes the decision fidelity table; `done` resets `base-branch`, merges the trunk and moves the end branch; a batch handoff of two pieces opens one PR against the trunk. Then build `open`, `status`, `start`, `built` and `done`. | Every probe step passes. The `02-shape.md` Intake Fidelity rows and the `01-intake.md` Success Criteria equal the piece text byte for byte. |
| W3 | The slice step of the walk (section 6.3), the `slice.md` edits, the step edits of section 6.6, and D33 in yolo. | A fixture piece is sliced with no question, `review-scope: slug-wide`, and each slice file has `ux-impact`. A piece that needs 15 slices warns and continues. Each plan step names its done check, each plan has a `## Handover`, implement runs one agent per slice, and `05-implement-<slice>.md` lists each committed step with its sha. |
| W4 | The new `reference/campaign.md`: the walk (section 6.1), the design stops (section 7), the fidelity read (section 8), the try-out pause, the extend fix. | A fixture list of 4 pieces (one platform piece, one `none` UI-free piece, one with a settled design, one with no design) walks: the first two have no try-out pause, the third pauses, and the walk stops at the fourth with the `/wf design` route. A fixture piece whose review drops a carried key stops with a question, and a "fix" answer adds a slice through `/wf intake extend`. |
| W5 | Handoff: one PR per list, or stacked PRs per the ship plan (section 9). | Both paths open the right PRs on a scratch repo, against real branches. |
| W6 | Design, review and status edits (sections 7.2, 8 and 10). | `/wf design <piece-slug>` presents the carried thoughts of the origin piece. `07-review.md` has the `## Decision Fidelity` table. `/wf status` shows the list and "step n of m". |
| W7 | The migration at step 0 of the walk, `campaign.mjs migrate`, the in-flight pieces, the brainstorm and ideate regroup modes, the stray-folder move, and the guarded remove (section 12). | `/wf campaign` on a copy of each of the four projects writes a `work/migration.md` that matches section 12.1, with no other command. On a scratch repo with `.ai/` ignored, an in-flight unit with uncommitted code and newer worktree records becomes the first piece: the records sync brings the newer `00-index.md` home, `start` commits and merges it, yolo finishes it in the main checkout, the review diff holds only that unit's commits, and `done` removes its worktree without touching the junction target. A second scratch repo with a squash-merged wave base rebases the unit, and the review diff holds no commit of the earlier wave. A worktree that is not an old campaign worktree stays. A stray folder moves to `work/archive/stray/`. |
| W8 | The deletes and edits of section 11, the usage guard included. | `npm test` passes. `git diff` of `yolo.js` and `yolo.md` shows only the D33 change. No file outside `docs/internal/` and `CHANGELOG.md` names a work packet or the campaign ledger. |
| W9 | Live run: the Secbot remainder as a list. Measure with the method of W0. | The run reaches handoff. Section 15 has its context tokens per carried decision and person stops per piece. It passes when both are lower than the W0 baseline. When the tokens per carried decision are higher, the PO decides again on D31, D32 and D33. |

## 15. Results

### W0b — decision tags, SoccerManager staff packets (2026-10-23)

The tag table is in `.scratch/w0b-staff-tags.md` (agent-skills, not tracked). Claude proposed the tags; the person has not confirmed them. 69 of the 71 decisions of the two packets were read.

| Tag | Decisions | Share |
|---|---|---|
| mechanism | 33 | 48 % |
| parameter | 30 | 43 % |
| content | 3 | 4 % |
| process | 3 | 4 % |

- Grouped by mechanism, the 69 decisions give **26 outcomes**.
- Today's slicing packs more: the shipped realism units carried about 4.4 decisions per slice at the median, so these 69 decisions are about 16 slices today.
- Sibling pairs that differ only by data or rule strictness: 2 (42 + 67, 62 + 64).

The finding: in this area, decisions as data (D21) do not lower the slice count. Today's slices already carry the parameter decisions inside the slice of their mechanism.

From the rate per unit (about 10 slices per unit, 57 units), the SoccerManager work left is about 570 slices of today's size. From the rate per decision (about 1,460 decisions left at 4.4 per slice), it is about 330 slices.

### W0 — baseline of the old wave campaign (2026-10-24)

Each wave had one unit. The script is `w0-baseline.mjs` in the session scratchpad (not tracked). It matches each `agent-start` line of the unit's `.driver-journal.jsonl` to a subagent transcript by its label and a start time within 10 minutes, and sums input + cache reads + cache writes over the turns of each agent. Every journal agent matched a transcript. Carried decisions come from the unit's packet file.

| Unit | Agents | Slices | Carried decisions | Context tokens | Per carried decision | Person stops |
|---|---|---|---|---|---|---|
| Secbot wave 1, `cell-runtime` | 30 | 4 | 17 | 374.9 M | **22.1 M** | 1 (a hard stop at implement) |
| Lantern wave 2, `lantern-app-home` | 73 | 8 | 24 | 709.8 M | **29.6 M** | 1 (an early ask at plan) |

The slice count is the roster of the unit. Secbot has a fifth `03-slice-*.md` file, `03-slice-probe-slug-wide-2026-10-07.md`, which is a review probe and not a slice.

By stage, implement is about half of the context (189 M and 319 M), then verify (68 M and 184 M) and plan (62 M and 140 M).

These figures do not match the table of section 1 (Lantern 5 slices and 118M tokens, Secbot 4 slices and 788M tokens). Section 1 took its figures from the ledgers on 2026-10-23, and this plan does not record how those tokens were counted. The Lantern roster on disk has 8 slices. W9 compares only with the W0 figures, so that both sides use the same count.

Limits of the method:
- The main session that drove the wave is not counted. W9 counts the walk's session the same way: not at all, so the two numbers compare.
- A person stop is a journal stop (`run-end` with `stoppedAt`) or an agent that ended `asked`. A question at the wave boundary, in the main session, is not counted. A try-out pause and a fidelity question of the walk are in the main session, so W9 does not count them either.
- Each row is one unit, and the two projects differ by 35 % per carried decision. One W9 run cannot show a difference smaller than that spread. This plan sets no margin.

W9 runs on the Secbot remainder, so the Secbot row is the comparison. W9 passes when both of these are true over all pieces of the remainder:
1. The context tokens per carried decision are lower than 22.1 M.
2. The person stops per carried decision are lower than 1 / 17 (0.059), the Secbot rate. For example, a remainder of 34 carried decisions passes with at most 1 stop.

### Implement step groups (C3), first measurement (2026-10-23)

C3 of [WF-SYSTEM-REVIEW-2026-10-21.md](WF-SYSTEM-REVIEW-2026-10-21.md) split implement into groups of 6 plan steps, each in a fresh agent (`IMPLEMENT_GROUP = 6`, `yolo.js:75`). Its saving was an estimate, "5–7 % of tokens (uncertain)". It was not measured after it shipped in 9.198.0. D33 removes it.

The measurement reads the transcripts of 334 implement agents in SoccerManager, Lantern, Trails and Secbot. Context tokens are input + cache reads + cache writes, summed over the turns of each agent. Step counts come from the group range, or from `metric-step-count` of the plan for a whole-slice run.

| Run | Agents | Context tokens per step | Median peak context |
|---|---|---|---|
| Whole slice, all projects | 226 (61 with a step count) | 2.39M | 418,000 |
| Grouped, all projects (Lantern and Trails, 9.198.0) | 108 in 45 slices | 2.09M | 229,000 |
| Grouped, first group of a slice | 45 | 1.43M | 200,000 |
| Grouped, later groups | 63 | 2.69M | 260,000 |
| Lantern, whole slice | 12 | 2.17M | 452,000 |
| Lantern, grouped | 59 | 2.40M | 247,000 |
| Trails, whole slice | 18 | 0.63M | 196,000 |
| Trails, grouped | 49 | 1.74M | 212,000 |

Whole-slice agents by plan length:

| Plan steps | Agents | Context tokens per step | Median peak context | Median turns |
|---|---|---|---|---|
| 1 to 10 | 3 | 0.61M | 165,000 | 29 |
| 11 to 15 | 35 | 2.03M | 249,000 | 62 |
| 16 to 21 | 23 | 2.91M | 453,000 | 137 |

Findings:

- In the same project, grouping did not lower the context tokens per step. Lantern rose by about 11 %; Trails rose more, but its whole-slice runs are older and few.
- Grouping halved the peak context, from about 450,000 to about 250,000 tokens. No quality figure was measured.
- A later group costs about 1.9 times the first group per step (2.69M against 1.43M), with more turns per step (13 against 8).
- For one agent, the context tokens per step rise with the length of the plan.
- The largest peak context of the 226 whole-slice agents is 468,000 tokens, and the 90th percentile is 466,000. Long agents stop growing near that ceiling, probably because the context is compacted there. That cause is not confirmed.

Limits: the samples are small and come from different slices; the whole-slice step counts come from plan files that can differ from the plan the agent ran; the figures are tokens, not dollars, because the cache-read and cache-write mix was not split. No plan in the sample had more than 21 steps, so the cost of one agent on a capability slice of 25 to 39 steps is not measured.

### Review of 2026-10-23

A fresh agent reviewed the plan with no access to Claude's conclusions, and Claude checked its main claims against the code. The PO answered each finding that was a choice. This rewrite holds the answers:

- **Kept by the PO after the review:** capability slices with one agent (D31 to D33), the deletion of the usage guard (D13), and one PR per list (D8).
- **Fixed as defects:**
  - the end-tag base, which broke handoff and ship (now D34, section 6.2)
  - the `owner` check, which blocked the walk's own yolo (now `owned: false`)
  - the fix loops, which did nothing on a finished piece (now `/wf intake extend`)
  - the opened folder, which failed the slice stage and switched off the always-on fidelity review (section 5)
  - the duplicate fidelity agent (now D35)
  - the trunk drift of the list branch (the merge at `done`)
  - the missing meter (W0, W9)
  - about 20 sentences that later decisions had made stale
- **Changed by the PO after the review:** no re-confirmation at `done` (D36), try-outs only for pieces that can be tried (D37), a warning above 14 slices (D38), and the walk asks how far to go (D39).
