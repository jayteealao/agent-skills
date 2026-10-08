# WF-PROTOTYPE-PLAN — `/wf prototype`, a person-steered proof loop

Status **Plan, nothing built** · Date **2026-09-28** · Plugin **v9.171.0** · Owner **jayte**

## 1. Why

The Codex session `01a0e28f-ecd6-72f3-bb71-c97af93c97e6` (SoccerManager,
2026-09-27 → 2026-09-28, 30 person turns, 475 tool calls, 8 compactions)
ran a proof-of-concept on the face pipeline with no `/wf` support. It moved
from an existing POC branch to seven proofs, then to an accepted pipeline
(GNM → SD 1.5 stronger edit → 360° mesh rotation). The person steered every
round. The work was good. The support around the work was missing:

- The report delivery rules came from two failures: images set by JavaScript
  did not load over remote, and a 24 MB report timed out on the phone.
- 59 working scripts went to `%TEMP%\portrait-seven-stage`. The reports were
  split between the worktree and `reports/`. Nothing was committed. The
  person had to ask "where is the worktree".
- "What is accepted now" lived only in the conversation, and the
  conversation compacted 8 times.
- Research from another session came in only because the person pasted its
  session id.

No key covers this job. `brainstorm` thinks and writes no code. `intake`
starts committed lifecycle work. `probe` checks built work against AC.
The `experiment` and `benchmark` augmentations plan a rollout inside a
lifecycle. None of them runs code to answer an open question.

## 2. PO decisions (2026-09-28)

| # | Decision |
|---|---|
| P1 | `prototype` is a **new key** (the 24th). |
| P2 | The work runs in a **POC worktree on its own branch**. The loop **commits at each accepted decision**. |
| P3 | **One rolling report**, unless the person asks for a separate page. The report is an HTML page that explains the work properly, with visualisations. It can be a shareable Claude artifact page. |
| P4 | **Always steered by the person.** No driver (`auto`, `yolo`) runs a prototype round. |

## 3. The loop

A prototype is a series of **rounds**. The person starts every round. The
agent runs one round, returns, and stops. The agent never starts the next
round.

### 3.1 Round kinds

The session showed seven kinds of round. The agent infers the kind from the
person's words (convention over flags) and names the kind in its first line.

| Kind | Person's words in the session | Output |
|---|---|---|
| **research** | "Research ways to massively improve fidelity" | Ranked candidate proofs, each with a question, the smallest experiment, and pass/fail checks |
| **prove** | "Prove out all steps" | Runs, measurements, one proof card per question |
| **compare** | "Test sd1.5 and a small flux" | A matrix of configurations on the same inputs |
| **diagnose** | "Analyze yaw 282" | The root cause, with an ablation as evidence |
| **decide** | "Really happy with sd1.5 stronger edit" | An accepted component and a commit |
| **generalize** | "Different identity, no manual input from you" | A frozen config, a regression run, a held-out run |
| **document** | "Document the full pipeline as it is now" | The accepted pipeline, current, with rejected paths excluded |

A question with no work ("would this work in Rust?") is a **talk** round. It
answers in chat, cites code, and changes no file except the ledger log.

### 3.2 Round procedure

1. Read the proof ledger. It is the memory of the prototype; the chat is not.
2. Name the round kind and the question.
3. Do the work in the worktree.
4. Record each proof as a card in the ledger.
5. Update the rolling report.
6. Return a short summary, the numbers, and the report link. Stop.

### 3.3 The proof card

Each proof records:

- `question`: one sentence.
- `setup`: inputs, seeds, model revisions, hardware.
- `evidence`: measured numbers, with the measured and the estimated values in separate fields.
- `repro`: the repeat check and its result (same process and fresh process).
- `verdict`: `pass` | `mixed` | `fail` | `unresolved`.
- `licenses`: every model and asset license that the proof used.
- `files`: every file that the proof wrote.

A failure stays in the ledger and in the report. The session's aging proof
("unresolved, not promoted") is the model.

### 3.4 Acceptance

Only the person's **decide** round moves a component into the accepted
pipeline. Before the agent records the decision, the component must pass a
**generalize** check: one held-out input, frozen settings, and no manual
selection or retouch by the agent. When the check has not run, the agent
says so and asks whether to run it first. The person can accept without it.
The ledger then records `generalized: false`.

## 4. Worktree and commits

- `/wf prototype <idea>` creates branch `poc/<slug>` from the base branch and
  a worktree for it. When the person names an existing POC branch, the loop
  uses that branch.
- Every file the loop writes is inside the worktree. Scratch goes to
  `<worktree>/.scratch/prototype/`, which is gitignored. Never write to
  `%TEMP%` or to the main checkout.
- Each **decide** round makes one commit on the POC branch: the code, the
  ledger, the accepted-pipeline document, and the report source. Stage by
  explicit path. Message: `poc(<slug>): accept <component>`.
- Other rounds do not commit. The ledger records their files, so a later
  commit can include them.

CAUTION: do not stage with `git add -A` in the worktree. It commits model
weights, downloads and virtual environments that the proofs create.

## 5. Artifacts

The prototype follows the brainstorm pattern: one file for the agent, one
document for the person.

| File | Reader | Content |
|---|---|---|
| `00-index.md` | agents, status | `workflow-type: prototype`, `branch`, `worktree`, `status` |
| `prototype-ledger.json` | agent | Proof cards, round log, decisions, file manifest |
| `01-prototype.md` | person | The accepted pipeline in plain words: stages, settings, measured speed and cost, known limits |
| `report.html` | person | The rolling report (§6) |

The whole `.ai/workflows/<slug>/` folder lives in the worktree, on the POC
branch. The main checkout's `INDEX.md` gets one row that points to the
worktree, so `/wf status` can find the prototype.

## 6. The rolling report

One page for the whole prototype. The agent rebuilds the page after every
round.

**Order on the page:**

1. The accepted pipeline now: a diagram of the stages, and the measured time and cost of each stage.
2. The latest round: what was asked, what was found, and the verdict.
3. Every proof, newest first, with its evidence and media.
4. The rejected and unresolved paths, with the reason.

**Rules** (from the session's two delivery failures):

- All content is readable with scripts disabled. Interactive controls are an addition, never the only way to see a result.
- Media is embedded. The page loads no external resource.
- The page stays under 1 MB. Video goes on a separate small page, or into the artifact's asset store.
- Each visual has one sentence before it that says what to look at. The visuals reuse the explainer snippet set from ARTIFACT-SPLIT-PLAN S2 (sequence, comparison bar, state cycle, dependency graph).
- Measured numbers and estimated numbers look different on the page.

**Where it goes:**

- When the host has the Artifact tool, publish the report as a private Claude artifact. Republish to the same URL each round, so the link the person shares stays the same.
- On other hosts (Codex, pi), write `report.html` in the workflow folder under the same rules.
- When the person asks for a separate page ("write a report on the pipeline"), write a separate page and link it from the rolling report.

## 7. Exit

Only the person ends a prototype, as in brainstorm. The person's options:

- **park**: the prototype stays open. The branch and the worktree stay.
- **graduate**: `01-prototype.md` becomes the brief for
  `/wf intake <idea>`, with `from <slug>` provenance. The POC branch stays as
  the reference implementation.
- **close**: `/wf close <slug>`. The agent lists the worktree and asks
  before it removes the worktree.

WARNING: before removing a worktree, check for `node_modules` junctions.
`git worktree remove --force` deletes through a junction into the main
checkout.

## 8. Invocation

```
/wf prototype <idea>                 Start a prototype on a new poc/<slug> branch.
/wf prototype <poc-branch> <idea>    Start a prototype on an existing POC branch.
/wf prototype <slug> [request]       Resume a prototype and run one round.
```

A resume with no request prints the accepted pipeline, the open proofs,
and the report link, then stops.

## 9. Changes outside the new reference

- `skills/wf/SKILL.md`: key row, key list, argument hint, description.
- The picker catalog and the plugin descriptions.
- `auto` and `yolo`: refuse a slug with `workflow-type: prototype` (P4).
- Frontmatter schema: `type: prototype`; `$defs.prototypeLedger`; a
  post-write validation for the ledger, as for `brainstorm-board.json`.
- Renderer: a report builder for `report.html`, built from the ledger and
  the proof media.
- `status` and `recap`: read the ledger and `01-prototype.md`.
- Surface pins: `keys` 23 → 24, plus `artifactStems` and `frontmatterTypes`.

## 10. Earn rule (SURFACE-POLICY §2)

1. **The job:** answer an open technical question by running code, with the
   person steering each round, and keep an accepted pipeline and a shareable
   report as the answers arrive. No key covers it (§1).
2. **Three workaround invocations:** Codex session `01a0e28f` (this plan's
   source). **Open:** find two more. Candidates are the sessions that built
   the eight earlier iterations on `poc/regen-faces`, and session
   `01a0e3c0-0f06-7b10-8ca3-0bb9c2509201` (motion research).
3. **Budget:** `reference/prototype.md` within its class budget.
4. **Eval:** `tests/evals/cases/prototype.json`.
5. **Pin:** raised in the same pull request.

## 11. Waves

| Wave | Content | Depends on |
|---|---|---|
| W0 | Earn-rule evidence (two more sessions), eval case | — |
| W1 | `reference/prototype.md`, SKILL rows, picker, `auto`/`yolo` refusal | W0 |
| W2 | Ledger schema and validation hook | W1 |
| W3 | Report builder and artifact publish | ARTIFACT-SPLIT W5 (explainer snippets) |
| W4 | Guard tests, red first: person-only round start, commit only on decide, no writes outside the worktree, report without scripts | W1–W3 |
| W5 | Live test on the SoccerManager face pipeline | W4 |

**Sequencing.** The artifact-split build is in progress (2026-09-28). It
changes `SKILL.md`, the renderers, the schema and the hooks. Start W1 only
after that build lands on `origin/master`.

## 12. Open questions

- **Q1.** Does the generalize check block a decide round, or only warn? The plan warns (§3.4).
- **Q2.** Do the round kinds need the person to see them, or are they for the agent only? The plan shows the kind in the first line.
- **Q3.** Can a round fan out sub-agents for independent proofs (the session ran seven proofs in one round)? The plan allows it inside one round; the person still starts every round.
- **Q4.** How large may a proof's media be before it goes to the artifact asset store instead of the page?
