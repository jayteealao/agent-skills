# Decision classes — the taxonomy for autonomous resolution (single source)

INTENT-FIDELITY W4. Every workflow decision is one of two classes. The class decides *who*
may resolve it: an **implementation-detail** decision may be settled by an autonomous policy
(and recorded); an **intent-bearing** decision may NOT — it is asked of the product owner in a
human-gated run, or is a stop condition in an autonomous run. This file is the single source;
`plan.md`, `implement.md`, `yolo.md`, and `auto.md` cite it instead of restating the boundary.

## Intent-bearing (never resolved by an autonomous policy)

A decision is intent-bearing if it does ANY of the following:

1. **Touches a ledgered RIM** — resolves, narrows, or depends on an `intent-risks` entry
   (00-index) that is still `open` or `carried`.
2. **Alters or narrows a PO directive** — changes, drops, or reinterprets anything in intake's
   Known Constraints, the Restated Request, or a recorded PO answer (a *narrowing* counts, per
   `_question-craft.md`'s scope-of-authority rule — a vendor answer is not authority to drop the
   requirement it served).
3. **Assigns control authority** — decides *which component* (deterministic code, or the
   model/agent) owns a user-facing behaviour at runtime. The waypoint control-authority
   inversion ("the state machine is the source of truth, not the prompt") is the canonical case.
4. **Changes the core-loop mechanism** — alters the mechanism of the product's core loop as
   stated in the intake's Restated Request (for non-AI products this resolves against the
   charter, when one exists).
5. **Drops or stubs a committed capability** — removes, stubs, or defers a capability the shape
   committed to (an adoption-matrix `USE` row included).

Everything else is **implementation-detail**: naming, file layout, internal data shapes, test
scaffolding, error-message wording, and library idioms *within* an already-committed choice.

## The 6-example table

| Decision | Class | Why |
|---|---|---|
| "The interview state machine (app code), not the model, decides the next question" | **intent-bearing** | assigns control authority (#3) — the product's heart |
| "Chips are client-side constants instead of a model call, to save latency" | **intent-bearing** | changes core-loop mechanics (#4) — borderline, but it removes a model decision the user experiences |
| "Drop the `sync` engine from v1; ship local-first only" | **intent-bearing** | narrows a PO directive (#2) unless the PO ratified exactly that |
| "Use `react-query` (a committed `USE` row) but abandon it, hand-rolling fetches" | **intent-bearing** | drops a committed capability (#5) |
| "Which directory holds the FSM state file" | implementation-detail | file layout within a committed choice |
| "Name the helper `parseGoal` vs `extractGoal`" | implementation-detail | naming |

## The rule

- **Human-gated run** (plan/implement/verify with a PO present): an intent-bearing decision is
  ASKED — an `AskUserQuestion` constructed per `_question-craft.md` (consequence-framed per W10.2).
- **Autonomous run** (`/wf yolo`, or `/wf auto` at a gate): an intent-bearing decision is a
  **STOP** — record the pending decision in the artifact + `po-answers.md` as awaiting-input,
  surface it in the run report, and halt rather than settle it.
- A recorded autonomous decision carries a mandatory `class: implementation-detail` stamp. An
  autonomous record may NEVER carry `class: intent-bearing` — writing one is the tell that the
  policy overstepped.
- Standing steering (`_steering.md`) may pre-answer a *named* intent-bearing question (that is
  ratification in advance); it may not blanket-authorize the class.
