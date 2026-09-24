# Brainstorm a design — plan

Status: **BUILT 2026-09-24 in v9.168.0**, one release, installed on every
host. Drafted against v9.167.1 (`e608340d`).

Related: [DESIGN-LANE-PLAN.md](DESIGN-LANE-PLAN.md) (the human-only design
stage this plan feeds), [SURFACE-POLICY.md](SURFACE-POLICY.md) (the earn rule
for the new key), `skills/wf/reference/intake/brainstorm.md` (the loop).

## 1. Goal

A person can think through the visual design of an idea with the agent, then
carry that thinking into the build. `/wf brainstorm design <idea>` opens a
brainstorm that concentrates on how the idea looks and behaves, with rough
sketches. `/wf brainstorm <feature-slug> design` does the same for a workflow
that exists. When the person scopes the work at `done`, the design thoughts
travel with each piece of work. The design stage presents them again, the
person keeps, changes, or drops each one, and the stage draws and plans from
what the person kept.

## 2. Decisions (confirmed by the operator 2026-09-24)

1. **A new top-level key, `brainstorm`.** `/wf brainstorm [slug] [design]
   [idea]`. `/wf intake brainstorm …` stays valid and runs the same loop.
2. **A slug names either kind of workflow, told apart by `workflow-type`.** A
   `brainstorm` slug resumes that board; `design` sets its focus to design. A
   feature workflow's slug with `design` brainstorms that workflow's design;
   the result goes to that workflow's design stage, with no new intake.
3. **Rough sketches during the brainstorm.** On the design canvas when the
   host has one, else `/imagery`, else a text scene sentence. Every sketch is
   an idea: the brainstorm never writes `02c-craft.md`, never resolves the
   image gate, and never records `direction-confirmed-by`.
4. **The carried thoughts are the design stage's starting direction.** The
   stage presents each carried decision and sketch, asks keep / change / drop,
   asks the carried open questions, and then draws from what the person kept.

## 3. Grammar

| Invocation | Meaning |
|---|---|
| `/wf brainstorm <idea>` | A new standalone board, general focus (same as `/wf intake brainstorm <idea>`). |
| `/wf brainstorm design <idea>` | A new standalone board, `focus: design`. |
| `/wf brainstorm <brainstorm-slug> [design]` | Resume that board; `design` switches its focus to design. |
| `/wf brainstorm <feature-slug> design [idea]` | A design brainstorm on that workflow (§5). |
| `/wf brainstorm <feature-slug> <topic>` | The existing slug-mode brainstorm (a compressed slice). |

The first token resolves by exact existence, like `/wf design`: when
`.ai/workflows/<token>/00-index.md` exists, it is a slug. A closed slug stops.

## 4. The design focus

A new file, `intake/brainstorm/_design.md`, loads when the board's `focus` is
`design`. It adds to the loop and never replaces it:

- **Read the design record** at Step 0 (PRODUCT.md, DESIGN.md,
  `.ai/design/current.md`, `.ai/design/direction.md`), and on a feature slug
  also `02-shape.md`, `02b-design.md`, and `02c-craft.md` when present. A
  missing file is a gap to name, not a stop.
- **Map the design space**: the surfaces; what the person does on each; layout
  and hierarchy; register, color, and type; motion and feedback; the states
  (empty, loading, error, first use); content and voice; the fit with the
  identity, the current design, and the direction.
- **Sketch** when a picture would decide faster than words. Record each sketch
  in the board's `sketches[]` with its thread, its items, its link, and a
  one-line caption. Each area close asks which sketches carry forward.
- **Raise a tension** when an idea pulls against PRODUCT.md or a goal in
  `direction.md`.
- **Mark design items** with `design: true`, so the carried set is explicit on
  a board that also holds other items.

## 5. A design brainstorm on a feature workflow

Files, beside the workflow's other artifacts:
- `brainstorm-board-design.json` — the board (the existing board path rule
  already admits `brainstorm-board-<descriptor>.json`).
- `design-notes/brainstorm-design.md` — the person's document
  (`type: brainstorm`).

A second run resumes the same two files. At `done`, the scope walk runs as
usual; the kept design items become the one piece of work, `shape: design`,
entry `/wf design <slug>`. When `02c-craft.md` is already confirmed, the entry
is `/wf design <slug> amend` and the index records `progress.design:
in-progress` (the reopened state of 9.167.1). No new workflow, no slice.

## 6. How the thoughts travel

1. **At `done`** (standalone board), a piece of work that carries design items
   records `ux-impact` (the proposed value) and `sketches` (keys). Two new
   forms join 3.3: `design` (a feature slug's own design stage) and
   `design-direction` (`/wf design direction from <slug>`, for a change to the
   project's design direction; the direction command presents the carried
   items and writes only what the person confirms).
2. **At intake** (`from <slug>`), the provenance contract proposes the piece's
   `ux-impact` in the stack question; the person confirms it.
3. **At shape**, the brief procedure pre-fills from the carried design items
   and does not ask again what the person decided.
4. **At the design stage**, a new Step 1b runs `design/_carried.md`: find the
   carried thoughts, present them, walk them with the person (keep / change /
   drop, up to four per batch), ask the carried open questions, and hand the
   kept set to Step 4 as the starting direction. `02c-craft.md` records
   `carried-from:` and a `## Carried design thoughts` section. Plan builds from
   the contract as before.

Sources the design stage reads, in order: the index's `origin-brainstorm`
board, filtered to the piece of work whose `routed-to` is this slug; then this
workflow's own `brainstorm-board-design.json`.

## 7. Registration (the earn rule)

1. **The job:** think through how an idea looks and behaves, with sketches,
   before any workflow exists, and carry it to the design stage. No key covered
   it before this release: `intake brainstorm` had no design focus and nothing
   travelled, and `/wf design` needs a shaped workflow and confirms; it does not explore.
2. **The workaround, three real uses** (SoccerManager): the boards
   `brainstorm-realism-additions-20260922` and
   `brainstorm-app-packaging-options-20260923` (thinking before a workflow
   exists), and `task-realism-programme-design-docs` (`origin-brainstorm:
   brainstorm-realism-additions-20260922`), a task written only to carry the
   board's decisions into documents by hand. None carried a visual design,
   because no route for one exists.
3. **Budget:** `reference/brainstorm.md` is a thin router; the loop stays in
   `intake/brainstorm.md`.
4. **Eval:** `tests/evals/cases/brainstorm-design.json`.
5. **Pin:** `keys` 22 → 23.

Also: SKILL.md tables, key list, argument hint, description; the picker
catalog; the plugin descriptions; the load baseline. The mod needs no change:
its question floor applies only to `intake` and `shape`, and it compacts only
at listed stage keys.

## 8. Schema

- Board: `focus` (`general` | `design`), `sketches[]` (`key`, `thread`,
  `items`, `link`, `caption`, `state`: `idea` | `carried` | `dropped`), items
  `design: true`, work `shape` adds `design` and `design-direction`, work
  `ux-impact` and `sketches`.
- Contract (`02c-craft.md`): `carried-from` (array of strings).

## 9. Tests

A guard suite `tests/unit/skills/brainstorm-design.test.mjs`: the key row and
router, the grammar table, the design focus file, the schema admits the new
board fields, the contract field, the carried-thoughts step in the stage, the
provenance and brief pre-fill lines, and the no-commit rule.
