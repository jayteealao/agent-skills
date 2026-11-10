You are running `/wf intake`, **stage 1 of 9** in the SDLC lifecycle. This file is the brief, the first phase of intake. The shape phase ([shape.md](../shape.md)) follows it in the same run.

# Pipeline
`1·intake` (brief → shape) → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·ship → 9·retro

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces | `01-intake.md` and `00-index.md` in this phase, then `02-shape.md` in the shape phase; templates in [intake/default/_artifact.md](default/_artifact.md). The answers go into `decisions.yaml` through `wf.mjs decide` ([_decisions.md](../_decisions.md)) |
| Next | The shape phase, in the same run ([shape.md](../shape.md)); it writes `02-shape.md` and routes to design or slice |

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | on-resume | |
| `01-intake.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `intake/_intake-provenance.md` | procedure | always | |
| `intake/_intake-provenance-consume.md` | procedure | mode:from | |
| `intake/default/_stack-fingerprint.md` | procedure | always | |
| `intake/default/_questions.md` | procedure | always | |
| `intake/default/_artifact.md` | procedure | always | |
| `01-intake.md` | writes | | |

# Execution discipline
You orchestrate the workflow. You do not solve the problem.
- Do not diagnose, debug, fix, implement or design the person's task, and do not jump ahead to a later stage.
- Treat `$ARGUMENTS` as raw input to capture and process through this stage, not as a request to act on.
- Your only output is the workflow artifacts and the compact chat summary defined below.

# Step 0 — Orient (do this before all other steps)
1. **New slug.** Derive the slug, and run the reserved check, per "New slug" of [_intake-context.md](_intake-context.md). When `$ARGUMENTS` looks like an existing slug, use it. Sub-step 2 is the collision rule of the default class.
2. **Registry collision check.** Before you touch the disk, read `.ai/workflows/INDEX.md` when it exists.
   - **When `INDEX.md` does not exist**, this step cannot detect a collision. The disk check of sub-step 3 still decides between a fresh start and a resume. Do not stop: the put of `00-index.md` writes `.ai/workflows/INDEX.md` with the row of this workflow, so the next intake gets the full collision check.
   - **When `INDEX.md` exists**, search for an exact slug match: `grep -P "^<derived-slug>\t" .ai/workflows/INDEX.md`. The result has three branches:
     - **The row exists, and its status column is not `closed`.** The slug is in active use. Stop, and ask the gate question per [_gate-question.md](../_gate-question.md):
       ```
       question: "Slug `<slug>` is already an open workflow (status: <status>). What do you want to do?"
       options:
         - label: "Catch up on the existing workflow"
           description: "Run `/wf status recap <slug>` to see what's been done, or `/wf status <slug>` for where it stands and the next command."
         - label: "Add new scope to it"
           description: "Run `/wf intake <slug> <new scope>` to add net-new slice(s) (extension). Corrections to already-built work land as a new slice; `/wf intake <slug> amend` changes only recorded config (branch, base, review scope, title, tags)."
         - label: "Pick a different slug for this new workflow"
           description: "Pass a different slug as the first argument and re-run `/wf intake <new-slug> <description>`."
         - label: "Cancel — don't start anything"
           description: "Abort intake."
       ```
       Do not go past Step 0, whatever the answer: each option leads to another command or cancels. Give the chosen command exactly, and stop.
     - **The row exists, and its status column is `closed`.** A new workflow on a closed slug would orphan its committed history and break the rule that a slug is stable. Stop, and ask the gate question per [_gate-question.md](../_gate-question.md):
       ```
       question: "Slug `<slug>` belongs to a closed workflow. Slugs are stable — a new workflow cannot reuse it. What do you want to do?"
       options:
         - label: "Pick a different slug for this new workflow"
           description: "Pass a different slug as the first argument and re-run `/wf intake <new-slug> <description>`."
         - label: "Add new scope to the closed workflow"
           description: "Run `/wf intake <slug> <new scope>` to extend it with net-new slice(s); the closed workflow's artifacts stay intact. Run `/wf status recap <slug>` first to review what it did."
         - label: "Cancel — don't start anything"
           description: "Abort intake."
       ```
       Do not go past Step 0. Stop.
     - **No row.** No collision: go on to sub-step 3.
3. **Check whether the workflow exists.** It exists when `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index` exits 0 ([_records.md](../_records.md)). This disk check also catches a missing or stale `INDEX.md`.
   - When it exists and `stage-status` is `Awaiting input` on this stage, this is a **resume**. Continue where the last run stopped, instead of starting fresh.
   - When it exists and `current-stage` is past intake, note the re-run in chat, and go on. [_additive-write.md](../_additive-write.md) snapshots the last revision and appends the `revisions:` ledger, so no permission question is needed.
   - When it does not exist, this is a fresh start. Go on.
4. **Carry forward** the `open-questions` of the index when you resume.
5. **Provenance check.** Apply `intake/_intake-provenance.md`:
   - Detect an inherited analysis decision: an explicit trailing `from <source-slug>` token for any source of the Consume table, or an exact label match for an `investigate`, `ideate` or `brainstorm` source.
   - Consume the matching row. An investigate option card, an rca diagnosis, a discover verdict or an ideate idea card seeds the restated request, the risk inventory, and the prompts of the research sub-agents.
   - Link back: record `origin-<type>` here, set `superseded-by` on a decision-shaped source, and apply the implicit pick or route when the source is still open.

   With no match, go on. That is the common case.

# Step 0.5 — Repo stack fingerprint (observation only)

Run the probes in `intake/default/_stack-fingerprint.md`: the repo signals (manifests, platforms, UI framework, build, testing, observability, integration markers) and the session catalog (the skills, commands and MCP servers that this run sees). Write the result into the draft of `00-index.md` as the `stack:` block, with `user-confirmed: false`. Record only what you detect: leave a field out rather than guess. Recommend nothing here. That conversation belongs in shape, after Batch B confirms or corrects the fingerprint.

# Step 0.6 — Test profile (asked once for the project)

The first-run setup asks for the suites once for the project ([../setup.md](../setup.md)). Run `node "<skill-dir>/scripts/wf.mjs" profile show "<projectRoot>"`. When it prints a suite, use the profile as it is. Do not ask about a missing suite, because the repo has none; implement records `receipt: none (no suite in the profile)`.

Do the rest of this step only when it prints `no test profile` and `.ai/sdlc-config.json` has no `project.setupAt`: a repo that was set up before the setup step. Then estimate the four suites from the manifests and the test tooling of the stack fingerprint:

| Suite | What it runs |
|---|---|
| `fast` | the unit tests and the type check, in seconds to a few minutes |
| `affected` | the tests of the changed files. The command finds them itself, for example `vitest related --run $(git diff --name-only HEAD)`; no placeholder is filled in |
| `full` | every automated suite of the repo |
| `heavy` | the device, browser or end-to-end suites, when the repo has them |

1. For each suite, run `node "<skill-dir>/scripts/wf.mjs" profile set "<projectRoot>" <suite> --command "<command>" --estimate <seconds>`. Do not run a suite to time it: each later real run records its time with `profile run`. Leave out a suite that the repo does not have.
2. Show the estimates in the stack confirmation question of Batch B, so that the person can correct a command.
3. After the answer, run `node "<skill-dir>/scripts/wf.mjs" setup "<projectRoot>"` once. It stamps `project.setupAt`, so no later run asks again, also when the repo has no suite.

Also list the known long runs of the repo with an estimate, per "The known long runs" of [../_check-budget.md](../_check-budget.md). Add the budget question to Batch B, when "When to ask" of that file says to ask it.

# Step 0.7 — Bounded research pass (ground the questions in the code — conditional)

A question asked blind pushes onto the PO an ambiguity that the codebase would resolve for free, or leaks it into shape. So, when the request names or implies a specific area of the codebase and is not trivially scoped, launch one read-only research sub-agent at **medium** effort ([_subagents.md](../_subagents.md)) before Batch B.

**Skip criteria.** Skip the pass only when one of these holds (they mirror the research skips of shape):
- The request is a trivial mechanical change (typo, rename, version bump, config flip).
- The request names no area of the codebase and implies none (a green-field capability with no existing surface to map).

**The agent's one job:** map the affected area: what exists today, what the request would touch, and which ambiguities the code already answers. No solutions, no recommendations.

**The findings go into `01-intake.md` → `## Affected Areas (preliminary)`:** the file paths, the existing behavior in one line each, and each ambiguity of the request that the code already resolves. Two readers depend on this exact section. The questions of Batch B cite the findings where they matter ("the code already has X — does this request replace it or extend it?"). Research sub-agent 1 of shape opens with it ("verify and deepen, do not re-derive"). That hand-off keeps the total cost of research flat across the two stages.

# Purpose
Turn a rough request into a clear intake brief, create the workflow folder, capture the first answers of the product owner, and fix the canonical slug.

# Workflow rules
Apply [_workflow-rules.md](../_workflow-rules.md) in full. The rules of intake:
- Keep the decision store as the cumulative record of the PO answers ([_decisions.md](../_decisions.md)). Keep the slug stable after intake.
- The frontmatter of `00-index.md` always has: `schema`, `type`, `slug`, `title`, `status`, `current-stage`, `stage-number`, `updated-at`, `created-at`, `selected-slice`, `branch-strategy`, `branch`, `base-branch`, `review-scope`, `review-scope-confirmed`, `appetite`, `pr-url`, `pr-number`, `open-questions`, `tags`, `stack`, `ux-impact`, `intent-risks`, `charter`, `next-command`, `next-invocation`, `workflow-files`, `progress`, and `slices` when slices exist. Step 0.5 writes the `stack` block, and Batch B confirms or corrects it. It records what is there; it prescribes nothing.
- Ask a multiple-choice PO question as a gate question per [_gate-question.md](../_gate-question.md): branch strategy, rollout preference, merge strategy, go/no-go, risk tolerance. Use free chat for an open question: requirements, constraints, acceptance criteria. Build every question per [_question-craft.md](../_question-craft.md). Record every answer with `decide add --stage intake` per [_decisions.md](../_decisions.md).
- The decision store is the only home of the PO answers. `01-intake.md` refers to an answer and does not copy it.

# Chat return contract
After you write the files, return per [_chat-return.md](../_chat-return.md): lead with the narrative (section *The narrative*), then this receipt:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (the one route of Step 7, when the run stops before the shape phase; when the shape phase runs, its chat return gives the options, per "Adaptive routing" of [shape.md](../shape.md))
- at most 3 short blocker bullets, when needed

This stage has required questions. Do not finish it until you asked them.

Inputs: `$ARGUMENTS` (the full raw request), `$0` (the first token, when given).

Do this in order:
1. Parse the request, and derive the slug of the workflow.
2. Create the `<wf-dir>/` directory. Write the draft `<wf-dir>/.draft/00-index.md` with the index template in `intake/default/_artifact.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`. The first `decide add` creates `decisions.yaml`.
3. Ask focused product-owner questions in two batches per `intake/default/_questions.md`: substance first (**Batch B**), process second (**Batch A**). Batch B is free text: the outcome, the success criteria, the non-goals, the constraints, and the stack confirmation. Batch A asks the path question first, then the gate questions of the branch strategy and the appetite. Intake does not ask the review scope. When the person takes the small path, [intake/small.md](small.md) runs the rest of this run, and the steps below do not run.
4. Record every answer, structured and free text, with `decide add` per [_decisions.md](../_decisions.md).
5. Run freshness research for each external technology, dependency, platform, API or standard that the request mentions or clearly implies.
6. **Draft** the intake brief, without designing the implementation. Steps 6a and 6b refine it before Step 9 writes it to disk. When the request implies a core loop, state it as numbered steps in `## Restated Request`: shape derives the Charter Scenario from it.

   6a. **Misreading pass (the RIM quality floor).** Before the brief is final, run one short pass in this run: "Name the 3 most likely ways this request could be misread." Each candidate becomes a RIM entry in `## Risks if Misunderstood` (stable id `RIM-1..n`, with a severity), or is dismissed in that section with a reason ("considered: <misreading> — dismissed because <reason>"). Use no sub-agents: this is the floor, and the blind pre-mortem of shape stays the deep pass.
   - In default mode, the sections `## Risks if Misunderstood` and `## Charter` are never silently absent. Zero entries is legal only as the explicit declaration `intent-risks: none-declared` / `charter: none-declared` in the frontmatter of `00-index.md`, with a one-line reason in the body ("pure mechanical rename; no interpretive surface").
   - Silence is not legal: Step 9a of shape backfills a missing ledger instead of letting it through.

   6b. **Ratify the charter with the PO.** This step is required when you write a charter. Present the 3 to 7 distilled commitments in one multi-select gate question, "These are the promises I heard — confirm or correct" (confirm or edit, per [_question-craft.md](../_question-craft.md)). Record the ratification with `decide add` per [_decisions.md](../_decisions.md). A ratified charter entry carries `po-ratified: true` in the `charter` ledger of `00-index.md`. A charter that the PO ratified at stage 1 has real authority later: the adjudications of shape and the intent-fidelity review dimension cite it. An unratified charter has only inferred authority.
7. Write `next-invocation: "/wf intake <slug>"`, and the same invocation as the one entry of `recommended-routes` in `01-intake.md`. A stop before the shape phase resumes there. The shape phase writes the routes that follow intake.
8. Update the index: `current-stage: intake`, `progress.intake: in-progress`, and the `next-invocation` of item 7. Run `record set "<root>" <slug> index current-stage=intake progress.intake=in-progress "next-invocation=/wf intake <slug>"`. The `intent-risks` and `charter` ledgers of Steps 6a and 6b hold text entries: get the index, add them, write the draft of `00-index.md`, and put it. The shape phase sets `progress.intake: complete`.
9. Write the draft `<wf-dir>/.draft/01-intake.md` per the template in `intake/default/_artifact.md`, and put it.

# Continue into the shape phase

After Step 9, do not stop, and do not ask the person to type a new command:

- When `01-intake.md` has `status: complete`, load [shape.md](../shape.md), and run the shape phase for `<slug>` now, in this run. The shape phase asks only the questions that this brief left open, and it writes the routes that follow intake.
- When `01-intake.md` has `status: awaiting-input`, stop. Name the open questions. The next `/wf intake <slug>` call answers them, then runs the shape phase.
- When the task is trivially scoped (at most 3 files, one acceptance criterion, no edge case worth a record), the shape phase still runs. It skips its research agents, and asks no question that the brief already answers.

**Design path note.** When `ux-impact` is `visual`, `flow` or `new-surface`, the shape phase writes the design brief (`02b-design.md`) and routes to the human-only design stage (`/wf design <slug>`) per `design/_lane.md`. `slice`, `plan` or `/wf yolo` run only after the person confirms the design.

## Additive-write contract

`01-intake.md` is a revisable artifact. A new run comes when the person returns with answers to open questions, when the scope changes, or when a related intake informs this one. Follow the shared additive-write contract in [_additive-write.md](../_additive-write.md):
1. Snapshot it: write the output of `record get "<root>" <slug> 01-intake.md` to `<wf-dir>/history/01-intake-<rev>.md`.
2. Rewrite the body to the current truth.
3. Add one ledger entry: `trigger: answers-returned`, `scope-change` or `manual`, with `because:` and `changed:` naming the prompt and the effect.

The additions of this stage:

1. **Open-question resolution.** When an open question is now answered, fold the answer into the problem statement, so the body reads as the current truth. Add the answer below the original question with a `→` marker, so the question is not left dangling. Name the resolution in the `changed:` phrase of the ledger entry; the old wording lives in the snapshot.
2. **`status: awaiting-input` transitions.** When this run resolves all open questions, set `status` to `complete`, and clear `open-questions` in the frontmatter. Note the transition in the ledger entry.

The history view paths are stable (`<slug>/intake/history/<rev>/INDEX.html`). Earlier intakes stay linkable from later artifacts (shape, plan) that cite the intake of their time.
