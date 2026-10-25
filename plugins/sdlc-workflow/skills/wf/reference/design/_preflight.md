# Design stage preflight (`_preflight.md`)

The design stage's own gates: context gathering, the image gate, the preflight gates, and the
mutation types. Only the design stage (`design/stage.md`, `design.md` stage mode) loads this
file. The design modes and laws that every design consumer shares stay in
[_design-context.md](_design-context.md). The refusals stay in [_craft-floor.md](_craft-floor.md).

> Load with: `design/_preflight.md`

## Context gathering

Two files, case-insensitive. Search project root first, then `.agents/context/`, then `docs/`.

- **PRODUCT.md** — required. Users, purpose, positioning, operating context, capabilities and constraints, brand commitments, evidence on hand, strategic principles.
- **DESIGN.md** — optional, strongly recommended. Overview, colors and token roles, typography, layout, elevation, shapes, components, do's and don'ts.

The design record adds two more files, `.ai/design/current.md` and `.ai/design/direction.md`
(`design/record.md`). The design stage, `review`, and `retro` read them.

If PRODUCT.md is missing, empty, or has `[TODO]` markers: run `/wf design setup` and resume
after context is established. If DESIGN.md is missing: nudge once per session (*"Run
`/wf design setup` or `/wf design teach` for better on-brand output"*), then proceed.

## Image gate (mutation lock)

`image_gate` is the lock that prevents code mutation before visual direction is confirmed.
It lives in the design artifact frontmatter as `image-gate` (values `pass` or `skipped:<reason>`
only — an *unwritten* gate is the "pending" state; there is no `pending` value). `shape` authors
the brief (`02b-design.md`) leaving `image-gate` unset; **the design stage resolves it** with the
person when it authors the visual contract (`02c-craft.md`, following `design/stage.md` and
`design/contract.md`) — drawing every changed surface, confirming direction, then writing the
resolved `image-gate`. No driven stage resolves it.

- `image_gate=pending` — **blocks all code mutation.** Visual direction is not yet confirmed.
- `image_gate=pass` — the person saw the boards of every changed surface and confirmed them, and
  `freeze` wrote them to `design/r<N>/` ([_boards.md](_boards.md)). When the design is settled
  is owned by [_lane.md](_lane.md) → "The human rule".
- `image_gate=skipped:<reason>` — direction confirmed without a picture, with a recorded reason.
  Only a `flow` change with no visual change may skip. An empty or generic reason is **INVALID** —
  name *why* no picture was needed (for example, "flow-only change: the error text moves, no surface changes").

A generated image from the `imagery` skill (`../../../imagery/SKILL.md`) is a mood image. It never
resolves the gate and is never a board.

## Preflight gates (run before any design work that edits files)

Skipping these produces generic output that ignores the project.

| Gate | Required check | If fail |
|---|---|---|
| Context | PRODUCT.md exists and is valid (≥200 chars, no `[TODO]` markers) | If the command is `setup` or `teach` → proceed (these create/update PRODUCT.md). Otherwise run `/wf design setup` with the person, then continue. |
| Design mode | A design mode (`persuade`, `operate`, `read`, `experience`) is chosen for each changed surface | Choose it per [_design-context.md](_design-context.md) → Design modes. Ask the person when the task cue and the surface leave it open. |
| Codebase | Codebase inspection sub-agents have run | Run the 4 parallel inspection sub-agents (below). Skip if their output is already in this session, or reuse the `stack` fingerprint from `00-index.md` where possible. |
| Brief | Design brief `02b-design.md` authored (at `shape`, following `design/shape.md`) and its direction backed by a recorded user source at contract time (an in-session confirmation, a user-confirmed PRODUCT.md, or a prior `teach` answer) | The brief is authored by the shape phase of `intake`; the design stage confirms its direction (`shape=pass`) with the person before writing the contract (`design/contract.md`). When the brief is missing, the design stage writes it first. |
| Image gate | Surfaces drawn as boards, or skipped with a recorded reason | Resolve at the design stage before any stage plans or builds. |
| Mutation | All gates above pass; mutation type matches the command | Do not edit project files until mutation is open. |

**Codebase gate is relaxed for**: `audit`, `critique`, `extract`, `setup`, `teach`, `direction`, `sync` — these are read-only or record-authoring.

### Codebase inspection sub-agents (4, parallel)

Run in the design stage (skip for `audit`, `critique`, `extract`,
`setup`, `teach`, `direction`, `sync`). If output is already in session history, don't re-run. Reuse the `stack`
fingerprint from `00-index.md` for framework/library facts where it already answers the question.

1. **Token scanner.** Find design tokens: CSS custom properties (`--color-*`, `--spacing-*`, `--font-*`, `--radius-*`), Tailwind config `theme.extend`, `tokens.json`, Style Dictionary source files. Return the extracted token table.
2. **Framework + component detector.** Identify the UI framework (React/Vue/Svelte/Angular from package.json), component library (shadcn/ui, Radix, Headless UI, MUI, Mantine, Ant Design, Chakra), CSS approach (Tailwind, CSS modules, styled-components, plain CSS), Tailwind version, sample component path.
3. **Context loader.** Read PRODUCT.md and DESIGN.md (project root → `.agents/context/` → `docs/`). Extract users, purpose, positioning, brand commitments, evidence on hand, and design principles. Report an old `## Register` once, as a hint only.
4. **Surface ranger.** Find files relevant to the current task: active page/component files, related CSS, primary component. In workflow context, read `02-shape.md` for `files-in-scope`.

## Mutation types

- **Code** — the lifecycle build span (`implement`), which also applies the moves. Requires `image_gate` resolved AND the stage's build gate.
- **Artifact** — contract authoring at the design stage (writes `02c-craft.md`), plus `audit`, `critique`. No code touched.
- **Context** — `setup`, `teach`, `direction`, `sync`. The design record only (PRODUCT.md, DESIGN.md, `.ai/design/`); allowed unconditionally.
- **Report** — `extract`. Writes its report, its token file, and `## System in code` of `.ai/design/current.md`. It changes no product code.

Do not edit any file until the appropriate mutation gate is open.
