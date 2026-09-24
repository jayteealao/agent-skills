# Design lane — plan

Status: **BUILT 2026-09-24 in v9.167.0**, all waves in one release, as the
operator asked. Drafted against v9.166.0 (`03935400`). The operator chose Option 1 (fix what feeds design) as Phase A and
Option 2 (design as a lane in every stage) as Phase B, with one hard rule:
**design has a human in the loop, so design finishes before any stage that
`/wf auto` or `/wf yolo` can drive.**

Related: [HOST-NEUTRALITY.md](HOST-NEUTRALITY.md),
[RELEASE-DISCIPLINE.md](RELEASE-DISCIPLINE.md),
`skills/wf/reference/design.md` (the router today),
`skills/wf/reference/design/contract.md` (the contract procedure today),
`skills/wf/reference/_host-invocation.md` (host-contract table).

## 1. Goal

Design stops being a side workflow. Every change that touches UI or UX
carries design from intake to retro, and every stage sees five things: the
current design, the design goals, the product identity, the current plan,
and the future direction. A person confirms the design direction before any
autonomous stage runs. Claude Design (claude.ai/design) is the drawing
surface. `/imagery` and `uiproto` stay as the fallback on a host without a
design canvas.

## 2. The problem this plan fixes

1. **Design has no memory across workflows.** `02b-design.md` and
   `02c-craft.md` belong to one slug. PRODUCT.md and DESIGN.md do not
   change after `setup`. Nothing records the current design, the direction,
   or the unpaid design problems.
2. **Design starts on a stack flag.** `stack.ui ≠ ∅` loads design rules for
   a backend-only change in a UI repo. A flow, copy, or error-state change
   with no new screen gets no brief.
3. **The human design decision sits inside an autonomous stage.** `plan`
   resolves the image gate and the confirm gate (`plan.md` Step 6,
   `design/contract.md` Step 3). `yolo` drives from `plan` onward
   (`yolo.md:43`), and `auto` drives `shape` onward (`auto.md:81-83`). So
   the one decision that needs a person runs inside a stage a driver owns.
4. **The direction does not reach the build.** `/imagery` gives a flat
   raster. `uiproto` is optional and sends the prompt off-host.
5. **The gates are prose.** No hook reads `image-gate` before a plan or a
   code write (`hooks/post-write-verify.mjs`, `hooks/pre-write-validate.mjs`).
6. **Ten consistency defects** in the design files (list in W-A3).

## 3. Decisions

Fixed for the build. A wave that needs a different answer stops and asks
the operator. Items marked **(default — confirm)** are the author's
recommendation and are open until the operator confirms them.

1. **The human rule.** No stage that `auto` or `yolo` drives may resolve a
   design direction. A stage that `auto` or `yolo` drives may only consume
   a confirmed direction, or stop and route to the person.
2. **A new human-only stage, `design`, sits between `shape` and `slice`.**
   It writes `02c-craft.md` (the number already sits between `02` and
   `03`). `yolo` treats it like `intake` and `shape`: never autonomous.
   `auto` stops at it and routes to `/wf design <slug>`.
   **Confirmed by the operator 2026-09-24:** a separate stage.
3. **UX impact, not the stack flag, turns design on.** `intake` records
   `ux-impact: none | visual | flow | new-surface` from the request and the
   files in scope. The person confirms the value at intake. `none` skips the
   `design` stage with a recorded reason.
4. **The design record lives at the project level.** PRODUCT.md (identity)
   and DESIGN.md (system) stay at the project root, because other tools read
   them there (**confirmed by the operator**). `.ai/design/` adds
   `current.md` (the current design, design debt, and the design-system
   link in its frontmatter) and `direction.md` (goals, future direction,
   open design decisions). The planned `README.md` was dropped: the link
   lives in `current.md`.
5. **Claude Design becomes the first choice for mockups.** A new
   host-contract row, "Design canvas", follows the "Published page" row
   pattern. On a host without the Artifact tool, `/imagery` and `/uiproto`
   are the fallback (**confirmed by the operator**: both stay, for Codex).
6. **The repo is the main copy of the design system.** When the project has
   a Claude Design design system, `/design-sync` keeps the two in step. The
   plugin never depends on claude.ai to work.
7. **Changes to direction are human decisions.** `retro` updates
   `current.md` by itself (facts). `retro` proposes changes to
   `direction.md`, and the person confirms each one.

## 4. The lifecycle after Phase B

```
intake ── ux-impact set, person confirms           (human)
shape  ── 02b-design.md: UX intent vs identity,    (human; auto can drive)
          current design and direction
design ── Claude Design artboards for every        (HUMAN ONLY — auto and
          changed surface, person confirms,          yolo stop here)
          02c-craft.md written
─────────────── autonomous drivers may start below this line ───────────────
slice  ── slices map to artboards
plan   ── cites playbooks, lists system components and new components
implement ─ builds from system components; fresh contract-check sub-agent
verify ── design floor + screenshot of each surface next to its artboard
review ── drift from system and direction
retro  ── updates current.md; proposes direction.md changes   (human)
```

When `plan` or `implement` finds that the confirmed design cannot be built
as drawn, the stage stops with `awaiting-input` and routes to
`/wf design <slug> amend`. `yolo` already treats a UX-behavior fork as
intent-bearing (`yolo.md:91`); this plan names the route.

## 5. Phase A — fix what feeds design (Option 1)

The router and its 20 commands stay. One release.

### W-A1 — The design record

- Add `.ai/design/current.md` and `direction.md` templates and
  their frontmatter types to `tests/frontmatter.schema.json`.
- `setup` writes all four parts (the two root files and the two record files). `teach` updates them. `extract` writes the
  token findings into `current.md`.
- `shape`, `plan`, `implement`, `review` read the record when
  `stack.ui ≠ ∅` (Phase B changes this trigger to `ux-impact`).

### W-A2 — Claude Design in, `uiproto` out

- Add the "Design canvas" row to `_host-invocation.md`: create a Design
  artifact (Artifact tool, Design type), one artboard per surface, record
  its link as `canvas:` in `02c-craft.md`.
- `design/contract.md` Step 3 uses the canvas first and `/imagery` only as
  the fallback.
- Keep `skills/uiproto/` and `skills/imagery/`; describe both as the design
  stage's fallback on a host without a design canvas.
- Remove the unused `pen-doc` field from the contract schema (**confirmed**).

### W-A3 — Fix the ten defects

1. `design/shape.md:3` says Step 5b; the brief is `shape.md` Step 5a.
2. The `designContractFrontmatter` description names the deleted `craft`
   command.
3. A transform contract has no `02b-design.md`, but `based-on` is required
   and the template points to it. Make `based-on` accept
   `transform:<name>`.
4. `design/contract.md` Build Gate item 1 stops every UI `plan` when
   PRODUCT.md is absent. Route to `/wf design setup` once, then continue.
5. `design/extract.md:128` writes `extract.md`; the router expects
   `extract-<timestamp>.md`. Remove the hard-coded `src/` from its greps.
6. Bounce: `_design-context.md` bans it in both registers; `brand.md:48`,
   `overdrive.md:95`, `animate.md` allow it for brand. Scope the ban to the
   product register.
7. `design/audit.md` does not use the `06-verify` measurements and has no
   score-to-verdict mapping.
8. Numbers disagree: hit area (40 / 44 / 32 px), motion durations, line
   length, `colorize.md` 60/30/10 without a register condition.
   `critique.md:40` writes "Outlet" for Outfit.
9. Ten transforms do not point to the ban list.
10. The 15 transforms do not mention the workflow. Add one shared footer
    that points to `design.md` Step 4A.

### W-A4 — A real gate

`pre-write-validate` refuses a `04-plan*.md` write when `stack.ui ≠ ∅`
(Phase B: `ux-impact` ≠ `none`), a `02b-design.md` exists, and
`02c-craft.md` has no resolved `image-gate` or no `direction-confirmed-by:`.
Opt out with `hooks.designDirectionGate: false`. Add a red-first test.

## 6. Phase B — design as a lane (Option 2)

Two releases. B1–B3 first, because they carry the human rule.

### W-B1 — UX impact at intake

- `intake` sets `ux-impact` in `00-index.md` from the request and the files
  in scope, and asks the person to confirm it with the other intake
  answers. Compressed modes set it too (`fix` often has `flow`).
- Every stage that loads design context keys on `ux-impact`, not
  `stack.ui`.

### W-B2 — The human-only `design` stage

- New reference `skills/wf/reference/design-stage.md` (or `design.md`
  Step 4 rewritten): read the design record and `02b-design.md`; create the
  canvas; present it; get the person's confirmation; write `02c-craft.md`
  with `canvas:`, `image-gate`, `direction-confirmed-by:`, and the mock
  fidelity inventory for **every** surface in the feature, not one slice.
- Move `plan.md` Step 6 (contract authoring) into this stage. `plan` only
  consumes `02c-craft.md`.
- `ux-impact: none` writes a one-line skip declaration and advances.
- `amend` sub-mode handles a design change found later.

### W-B3 — Drivers respect the stage

- `yolo.md`: add `design` to the never-autonomous row with `intake` and
  `shape`. Start precondition: `02c-craft.md` confirmed or a skip
  declaration.
- `auto.md`: add `design` to the stage-selection rule; it PAUSES and routes
  to `/wf design <slug>`.
- Add `design` to every stage list: `renderers/index.mjs`,
  `renderers/dashboard.mjs`, `tests/sunflower.test.mjs`,
  `hooks/mod/catalog.ts` (picker order), `tests/unit/mod/wf-picker.harness.mjs`,
  `status`. `lib/branch-liveness.mjs:58` already lists `design` as a
  pre-branch stage.

### W-B4 — One design duty per stage

- `shape`: `02b-design.md` gains a UX-intent section (flows, states, copy),
  written against `current.md` and `direction.md`.
- `slice`: map each slice to its artboards.
- `plan`: cite playbooks; list the system components used and a component
  delta (new or changed components).
- `implement`: build from system components; keep the fresh contract check.
- `verify`: screenshot each built surface and place it next to its
  artboard in `06-verify`; the difference list is evidence, not a pass rule.
- `review`: the design dimensions judge drift from `DESIGN.md` and
  `direction.md`.

### W-B5 — Retro writes back

`retro` updates `current.md` (surfaces changed, drift found, debt created
or paid) and writes proposed `direction.md` changes as questions to the
person.

### W-B6 — The command set shrinks

- The 15 transforms become playbooks that `plan` cites. An ad-hoc request
  ("polish the settings page") starts with `/wf intake`, which sets
  `ux-impact` and runs the short lifecycle with the `design` stage in it.
- `audit` and `critique` live only as `review` dimensions.
- `/wf design` keeps two jobs: run the human-only stage
  (`/wf design <slug>`, `/wf design <slug> amend`) and maintain the record
  (`setup`, `teach`, `extract`, `sync`, `direction`).

### W-B7 — Optional sync with a Claude Design design system

`/wf design sync` hands off to `/design-sync` when the project links a
Claude Design design-system project in the `design-system:` field of
`.ai/design/current.md`.

## 7. Release shape

| Release | Waves | Contents |
|---|---|---|
| 1 | W-A1 … W-A4 | Design record, Claude Design canvas, `uiproto` deleted, ten defects, plan-write gate |
| 2 | W-B1 … W-B3 | UX impact, human-only `design` stage, drivers stop at it |
| 3 | W-B4 … W-B7 | Stage duties, retro write-back, command set, sync |

Each release follows RELEASE-DISCIPLINE.md: stage by path, rebuild `dist/`
when `lib/`, `hooks/`, `renderers/` or `scripts/` change, `npm run
verify:versions`, push to `origin/master`.

## 8. Open questions

1. **Probe:** can a plugin skill reliably create and update a Claude Design
   artifact from Claude Code on the CLI, or only on Desktop? The built
   "Design canvas" row keys on whether the session lists the Artifact tool,
   so a host without it falls back to `/imagery`. A live run is still
   needed to confirm the canvas path end to end.

## 9. Build notes (v9.167.0)

- The 15 transforms were not deleted as commands: `/wf design <slug> <move>`
  runs the design stage focused on the move, and `/wf design <move> …`
  without a slug starts a workflow through intake. `audit` and `critique`
  stay as on-demand review dimensions.
- The design stage is not a numbered stage. `stage N of 10` wording stays;
  `design` sits between `shape` and `slice` in the dispatcher table, the
  picker, and the view's stage rail (`current-stage: design` was already
  in the index schema).
- Stage bodies cite `design/_lane.md` with a backticked path where a markdown
  link would pull the whole design graph into another key's referenced set
  (the measure-load test caps it below 60 files; `intake` reached 63).
- Change-modes write `04-plan.md` at intake, so they run a compressed design
  stage inside intake before `03-slice.md`; the plan-write gate enforces it.
- **9.167.1 cohesion fixes.** A sweep after the release found routes into
  plan that skipped the design lane: `rca` (no `ux-impact`, straight to
  plan), `extend` (new slices could add undrawn surfaces), and `update-deps`
  (no explicit value). Default intake still described plan as the contract
  author. The fix adds the reopened state, `progress.design: in-progress`:
  `designSettled()` returns false while it is set, the hook names `amend`,
  and the design stage clears it in Step 6.
