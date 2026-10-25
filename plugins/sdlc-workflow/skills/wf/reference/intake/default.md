---
description: Convert a rough request into a clear intake brief, create the workflow folder, capture the first product-owner answers, and establish the canonical slug.
argument-hint: <task description>
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steer.** Only when the decision store holds a live `steer` entry (`decide list --kind steer`, per [_decisions.md](../_decisions.md)): apply it. Honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

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
You are a **workflow orchestrator**, not a problem solver.
- Do not diagnose, debug, fix, implement, design, or otherwise work on the user's task, and do not jump ahead to later lifecycle stages.
- Treat `$ARGUMENTS` as **raw input to be captured and processed through this stage's workflow**, not as a request to act on.
- Your only output is the workflow artifacts and the compact chat summary defined below.

# Step 0 — Orient (do this before all other steps)
1. **Derive the slug** from `$ARGUMENTS`. Use the task description to create a lowercase kebab-case slug. If `$ARGUMENTS` looks like an existing slug, use it. When the slug is a reserved name ([_intake-context.md](_intake-context.md)), STOP and ask for another slug: *"`<slug>` is a `/wf` command word, so it cannot name a workflow. Re-run `/wf intake <new-slug> <description>`."*
2. **Registry collision check.** Before touching disk, consult `.ai/workflows/INDEX.md` if it exists:
   - **If `INDEX.md` does NOT exist**, no collision detection is possible at this step (the disk check in sub-step 3 still gates the fresh-vs-resume decision). Do not bail out: Step 10 bootstraps `.ai/workflows/INDEX.md` with a header line + this workflow's row at the end of intake, so the *next* intake gets full collision detection. Intake only does additive "append self if absent"; `/wf status` owns the full reconcile.
   - **If `INDEX.md` exists**, search for an exact slug match: `grep -P "^<derived-slug>\t" .ai/workflows/INDEX.md`. Three branches based on the result:
     - **Row exists AND status column ≠ `closed`**: the slug is already in active use. STOP and ask the gate question per [_gate-question.md](../_gate-question.md):
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
       Do not proceed past Step 0 regardless of the answer; every option redirects to a different command or aborts. Surface the chosen command exactly and STOP.
     - **Row exists AND status column = `closed`**: reusing a closed slug would orphan its committed history and break the slug-is-stable invariant. STOP and ask the gate question per [_gate-question.md](../_gate-question.md):
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
       Do not proceed past Step 0. STOP.
     - **No row**: no collision; continue to sub-step 3.
3. **Check if the workflow already exists**: `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index` exits 0 (per [_records.md](../_records.md); disk-level fallback; catches the case where INDEX.md is missing or stale).
   - If it exists and `stage-status` is `Awaiting input` on this stage, this is a **resume**. Pick up from where the previous run left off instead of starting fresh.
   - If it exists and `current-stage` is past intake, note the re-run in chat and proceed. [_additive-write.md](../_additive-write.md) snapshots the prior revision and appends the `revisions:` ledger; no permission question is needed.
   - If it does not exist, this is a fresh start. Proceed normally.
4. **Carry forward** any `open-questions` from the index if resuming.
5. **Provenance check:** apply `intake/_intake-provenance.md`: detect an inherited analysis decision (an explicit trailing `from <source-slug>` token for any Consume-table source, or an exact label match for an `investigate`, `ideate`, or `brainstorm` source), consume the matching row (an investigate option card, an rca diagnosis, a discover verdict, or an ideate idea card seeds the restated request, the risk inventory, and the research sub-agent prompts), and link back (record `origin-<type>` here, set `superseded-by` on a decision-shaped source, and apply the implicit pick/route if the source is still open). No match → continue; that is the common case.

# Step 0.5 — Repo stack fingerprint (observation only)

Run the probes in `intake/default/_stack-fingerprint.md`: repo signals (manifests, platforms, UI framework, build, testing, observability, integration markers) and the session catalog (skills, commands, MCP servers visible to this run). Write the result into the index (the draft of `00-index.md`) as the `stack:` block with `user-confirmed: false`. Record only what is detected; omit rather than guess. Recommend nothing here; that conversation belongs in shape, after Batch B confirms or corrects the fingerprint.

# Step 0.6 — Test profile estimate (no run)

Run `node "<skill-dir>/scripts/wf.mjs" profile show "<projectRoot>"`. When it prints `no test profile`, or a suite is missing, estimate the four suites from the manifests and the test tooling of the stack fingerprint:

| Suite | What it runs |
|---|---|
| `fast` | the unit tests and the type check, in seconds to a few minutes |
| `affected` | the tests of the changed files; `{files}` stands for the files |
| `full` | every automated suite of the repo |
| `heavy` | the device, browser or end-to-end suites, when the repo has them |

For each suite, run `node "<skill-dir>/scripts/wf.mjs" profile set "<projectRoot>" <suite> --command "<command>" --estimate <seconds>`. Do not run a suite to time it: each later real run records its time with `profile record`. Omit a suite that the repo does not have. Show the estimates in the stack confirmation question of Batch B, so that the person can correct a command.

# Step 0.7 — Bounded research pass (ground the questions in the code — conditional)

Intake questions asked blind push ambiguities the codebase would resolve for free onto the PO, or
leak them into shape. So, **when the request names or implies a specific area of the codebase and
is not trivially scoped**, launch **one** read-only research sub-agent at **medium** effort (per [_subagents.md](../_subagents.md)) before Batch B.

**Skip criteria — skip ONLY if ANY of these hold** (mirrors shape's research skips):
- The request is a trivial mechanical change (typo, rename, version bump, config flip)
- The request names no codebase area and implies none (a green-field capability with no existing surface to map)

**The agent's one job:** *map the affected area: what exists today, what the request would touch, which ambiguities the code already answers.* No solutioning, no recommendations.

**Findings land in `01-intake.md` → `## Affected Areas (preliminary)`**: file paths, the existing behavior in one line each, and any request-ambiguity the code already resolves. Two consumers depend on this exact section: Batch B questions reference the findings where relevant ("the code already has X — does this request replace it or extend it?"), and shape's research sub-agent 1 opens with it ("verify and deepen, do not re-derive"). That handoff clause is what keeps total research cost flat across the two stages.

# Purpose
Convert a rough request into a clear intake brief, create the workflow folder, capture the first product-owner answers, and establish the canonical slug.

# Workflow rules
Apply [_workflow-rules.md](../_workflow-rules.md) in full. Intake-specific rules:
- Keep the decision store as the cumulative record of the PO answers ([_decisions.md](../_decisions.md)). Keep the slug stable after intake.
- `00-index.md` frontmatter must always have: `schema`, `type`, `slug`, `title`, `status`, `current-stage`, `stage-number`, `updated-at`, `created-at`, `selected-slice`, `branch-strategy`, `branch`, `base-branch`, `review-scope`, `review-scope-confirmed`, `appetite`, `pr-url`, `pr-number`, `open-questions`, `tags`, `stack`, `ux-impact`, `intent-risks`, `charter`, `next-command`, `next-invocation`, `workflow-files`, `progress`, and (if slices exist) `slices`. The `stack` block is written by Step 0.5 and confirmed/corrected in Batch B; it is observational, not prescriptive.
- Ask multiple-choice PO questions as gate questions per [_gate-question.md](../_gate-question.md) (branch strategy, rollout preference, merge strategy, go/no-go, risk tolerance). Use freeform chat for open-ended questions (requirements, constraints, acceptance criteria). Construct every question per [_question-craft.md](../_question-craft.md). Record every answer with `decide add --stage intake` per [_decisions.md](../_decisions.md).
- The decision store is the only home of PO answers. `01-intake.md` refers to answers and does not copy them.

# Chat return contract
After writing files, return per [_chat-return.md](../_chat-return.md): lead with the narrative (section *The narrative*), then this receipt:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (list all viable next options; see Adaptive Routing below)
- ≤3 short blocker bullets if needed

**This is a mandatory-question stage.** Do not finalize until the required questions are asked.

Inputs: `$ARGUMENTS` (full raw request), `$0` (first token if supplied).

Do this in order:
1. Parse the request and derive the workflow slug.
2. Create `.ai/workflows/<slug>/` directory. Write the draft `.ai/workflows/<slug>/.draft/00-index.md` using the index template in `intake/default/_artifact.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`. The first `decide add` creates `decisions.yaml`.
3. Ask focused product-owner questions in two batches per `intake/default/_questions.md`: **substance first (Batch B), process second (Batch A)**. Batch B is freeform (outcome, success criteria, non-goals, constraints, stack confirmation). Batch A asks the path question first, then the branch-strategy and appetite gate questions; review scope is not asked at intake. When the person takes the small path, [intake/small.md](small.md) runs the rest of this run, and the steps below do not run.
4. Record ALL answers (structured + freeform) with `decide add` per [_decisions.md](../_decisions.md).
5. Run freshness research for any external technology, dependency, platform, API, or standard that is mentioned or obviously implicated.
6. **Draft** the intake brief without designing the implementation (steps 6a–6c refine it before it is written to disk in Step 9). When the request implies a core loop, state it as NUMBERED STEPS in `## Restated Request`; shape derives the Charter Scenario from it.
6a. **Misreading pass (the RIM quality floor).** Before the brief is final, run one short in-run pass: *"Name the 3 most likely ways this request could be misread."* Each candidate either becomes a RIM entry in `## Risks if Misunderstood` (stable id `RIM-1..n`, with severity) or is dismissed in that section with a stated reason ("considered: <misreading> — dismissed because <reason>"). In-run, no sub-agents; this is the floor, and shape's blind pre-mortem stays the deep pass. The `## Risks if Misunderstood` and `## Charter` sections may never be silently absent in default mode: zero entries is legal only as the explicit declaration `intent-risks: none-declared` / `charter: none-declared` in `00-index.md` frontmatter plus a one-line reason in the body ("pure mechanical rename; no interpretive surface"). Silence is illegal; shape's Step 9a backfills a missing ledger instead of waving it through.
6b. **Ratify the charter with the PO (mandatory when a charter is authored).** Present the 3–7 distilled commitments in ONE multi-select gate question, *"These are the promises I heard — confirm or correct"* (confirm/edit per [_question-craft.md](../_question-craft.md)). Record the ratification with `decide add` per [_decisions.md](../_decisions.md); ratified charter entries carry `po-ratified: true` in the `00-index.md` `charter` ledger. A charter the PO ratified at stage 1 carries real authority downstream (shape's adjudications and the intent-fidelity review dimension cite it); an unratified charter is only inferred authority.
7. Write `next-invocation: "/wf intake <slug>"`, and the same invocation as the one entry of the `01-intake.md` `recommended-routes`. A stop before the shape phase resumes there; the shape phase writes the routes that follow intake.
8. Update the index: `current-stage: intake`, `progress.intake: in-progress`, and the `next-invocation` of item 7. Run `record set "<root>" <slug> index current-stage=intake progress.intake=in-progress "next-invocation=/wf intake <slug>"`. The `intent-risks` and `charter` ledgers of Steps 6a–6b hold text entries: get the index, add them, write the draft of `00-index.md` and put it. The shape phase sets `progress.intake: complete`.
9. Write the draft `.ai/workflows/<slug>/.draft/01-intake.md` per the template in `intake/default/_artifact.md`, and put it.
10. **Register this workflow in `.ai/workflows/INDEX.md`** per [_intake-context.md](_intake-context.md) → Register the workflow in INDEX.md.

# Continue into the shape phase

After Step 10, do not stop and do not ask the person to type a new command:

- When `01-intake.md` has `status: complete`, load [shape.md](../shape.md) and run the shape phase for `<slug>` now, in this run. The shape phase asks only the questions that this brief left open, and it writes the routes that follow intake.
- When `01-intake.md` has `status: awaiting-input`, STOP. Name the open questions. The next `/wf intake <slug>` call answers them, then runs the shape phase.
- When the task is trivially scoped (at most 3 files, one acceptance criterion, no edge case worth a record), the shape phase still runs. It skips its research agents and asks no question that the brief already answers.

**Design path note:** When `ux-impact` is `visual`, `flow`, or `new-surface`, the shape phase writes the design brief (`02b-design.md`) and routes to the human-only design stage (`/wf design <slug>`) per `design/_lane.md`. Only after the person confirms the design can `slice`, `plan`, or `/wf yolo` run.

## Additive-write contract

`01-intake.md` is a revisable artifact. Re-invocation happens when the user returns with answers to open questions, when scope changes, or when a related intake informs the current one. Follow the shared additive-write contract in [_additive-write.md](../_additive-write.md): snapshot (write the output of `record get "<root>" <slug> 01-intake.md`) to `.ai/workflows/<slug>/history/01-intake-<rev>.md`, **rewrite the body to current truth**, add one ledger entry (`trigger: answers-returned`, `scope-change`, or `manual`; `because:` and `changed:` naming the prompt and the effect).

Stage-specific additions:

1. **Open-question resolution**: when a previously-open question is now answered, fold the answer into the problem statement so the body reads as current truth; add the answer below the original question with a `→` marker rather than leaving the question dangling. Name the resolution in the ledger entry's `changed:` phrase; the prior wording lives in the snapshot.
2. **`status: awaiting-input` transitions**: if this run resolves all open questions, transition `status` to `complete` and clear `open-questions` in frontmatter. Note the transition in the ledger entry.

History view paths are stable (`<slug>/intake/history/<rev>/INDEX.html`); prior intakes remain linkable from later artifacts (shape, plan) that reference an intake-at-the-time.
