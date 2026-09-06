---
description: Convert a rough request into a clear intake brief, create the workflow folder, capture the first product-owner answers, and establish the canonical slug.
argument-hint: <task description>
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](../_steering.md): honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf intake`, **stage 1 of 10** in the SDLC lifecycle.

# Pipeline
`1·intake` → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | *(nothing — this is the first stage)* |
| Produces | `01-intake.md` and `00-index.md`; templates in [intake/default/_artifact.md](default/_artifact.md) |
| Next | `/wf shape <slug>` (default); shape writes `02-shape.md` |
| Skip-to | `/wf plan <slug>` if the task is trivially scoped and needs no shaping or slicing |

> **Auto second opinion (objective triggers).** Once the intake brief is drafted (Step 6c, after the misreading pass, before writing `01-intake.md`), **auto-invoke** `/consult codex <critique this restated request, charter, and RIM ledger — did I misread the ask?>` (pinning `codex`/`claude` keeps it free) when ANY of: (a) the work introduces a new capability or externally-observable surface AND appetite is medium or larger; (b) any authored RIM has `severity: high`; (c) the request touches security, payments, auth, data migration, or deletion semantics. Intake is where a misread request is cheapest to catch: fire it rather than offering it in next-steps; skip only when none of the triggers hold. The user may invoke it explicitly with any provider.

# Execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do not diagnose, debug, fix, implement, design, or otherwise work on the user's task, and do not jump ahead to later lifecycle stages.
- Treat `$ARGUMENTS` as **raw input to be captured and processed through this stage's workflow**, not as a request to act on.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start solving the problem, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (do this before all other steps)
1. **Derive the slug** from `$ARGUMENTS`. Use the task description to create a lowercase kebab-case slug. If `$ARGUMENTS` looks like an existing slug, use it.
2. **Registry collision check.** Before touching disk, consult `.ai/workflows/INDEX.md` if it exists:
   - **If `INDEX.md` does NOT exist**, no collision detection is possible at this step (the disk check in sub-step 3 still gates the fresh-vs-resume decision). Do not bail out: Step 10 bootstraps `.ai/workflows/INDEX.md` with a header line + this workflow's row at the end of intake, so the *next* intake gets full collision detection. Intake only does additive "append self if absent"; `/wf status` owns the full reconcile.
   - **If `INDEX.md` exists**, search for an exact slug match: `grep -P "^<derived-slug>\t" .ai/workflows/INDEX.md`. Three branches based on the result:
     - **Row exists AND status column ≠ `closed`**: the slug is already in active use. STOP and ask the gate question per [_gate-question.md](../_gate-question.md):
       ```
       question: "Slug `<slug>` is already an open workflow (status: <status>). What do you want to do?"
       options:
         - label: "Catch up on the existing workflow"
           description: "Run `/wf recap <slug>` to see what's been done, or `/wf status <slug>` for where it stands and the next command."
         - label: "Add new scope to it"
           description: "Run `/wf intake <slug> <new scope>` to add net-new slice(s) (extension). Corrections to already-built work also land as a new slice — there is no in-place amend."
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
           description: "Run `/wf intake <slug> <new scope>` to extend it with net-new slice(s); the closed workflow's artifacts stay intact. Run `/wf recap <slug>` first to review what it did."
         - label: "Cancel — don't start anything"
           description: "Abort intake."
       ```
       Do not proceed past Step 0. STOP.
     - **No row**: no collision; continue to sub-step 3.
3. **Check if the workflow already exists** at `.ai/workflows/<slug>/00-index.md` (disk-level fallback; catches the case where INDEX.md is missing or stale).
   - If it exists and `stage-status` is `Awaiting input` on this stage, this is a **resume**. Read the existing `01-intake.md` and `po-answers.md`. Pick up from where the previous run left off instead of starting fresh.
   - If it exists and `current-stage` is past intake, note the re-run in chat and proceed. [_additive-write.md](../_additive-write.md) snapshots the prior revision and appends the `revisions:` ledger; no permission question is needed.
   - If it does not exist, this is a fresh start. Proceed normally.
4. **Carry forward** any `open-questions` from the index if resuming.
5. **Provenance check:** apply `_intake-provenance.md`: detect an inherited analysis decision (an explicit trailing `from <source-slug>` token for any Consume-table source, or an exact label match for `investigate`/`ideate` sources), consume the matching row (an investigate option card, an rca diagnosis, a discover verdict, or an ideate idea card seeds the restated request, the risk inventory, and the research sub-agent prompts), and link back (record `origin-<type>` here, set `superseded-by` on a decision-shaped source, and apply the implicit pick/route if the source is still open). No match → continue; that is the common case.

# Step 0.5 — Repo stack fingerprint (observation only)

Run the probes in [intake/default/_stack-fingerprint.md](default/_stack-fingerprint.md): repo signals (manifests, platforms, UI framework, build, testing, observability, integration markers) and the session catalog (skills, commands, MCP servers visible to this run). Write the result into `00-index.md` as the `stack:` block with `user-confirmed: false`. Record only what is detected; omit rather than guess. Recommend nothing here; that conversation belongs in shape, after Batch B confirms or corrects the fingerprint.

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
- Keep `po-answers.md` as the cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` frontmatter must always have: `schema`, `type`, `slug`, `title`, `status`, `current-stage`, `stage-number`, `updated-at`, `created-at`, `selected-slice`, `branch-strategy`, `branch`, `base-branch`, `review-scope`, `review-scope-confirmed`, `appetite`, `pr-url`, `pr-number`, `open-questions`, `tags`, `stack`, `next-command`, `next-invocation`, `workflow-files`, `progress`, and (if slices exist) `slices`. The `stack` block is written by Step 0.5 and confirmed/corrected in Batch B; it is observational, not prescriptive.
- Ask multiple-choice PO questions as gate questions per [_gate-question.md](../_gate-question.md) (branch strategy, rollout preference, merge strategy, go/no-go, risk tolerance). Use freeform chat for open-ended questions (requirements, constraints, acceptance criteria). Construct every question per [_question-craft.md](../_question-craft.md). Append every answer to `po-answers.md` with timestamp and stage.

# Chat return contract
After writing files, return per [_chat-return.md](../_chat-return.md): narrative lead in the artifact's `## The Intake` story voice, then this receipt:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (list all viable next options; see Adaptive Routing below)
- ≤3 short blocker bullets if needed

**This is a mandatory-question stage.** Do not finalize until the required questions are asked.

Inputs: `$ARGUMENTS` (full raw request), `$0` (first token if supplied).

Do this in order:
1. Parse the request and derive the workflow slug.
2. Create `.ai/workflows/<slug>/` directory. Write `00-index.md` using the index template in [intake/default/_artifact.md](default/_artifact.md). Create `po-answers.md` if missing.
3. Ask focused product-owner questions in two batches per [intake/default/_questions.md](default/_questions.md): **substance first (Batch B), process second (Batch A)**. Batch B is freeform (outcome, success criteria, non-goals, constraints, stack confirmation). Batch A asks the branch-strategy and appetite gate questions; review scope is not asked at intake.
4. Capture ALL answers (structured + freeform) in `po-answers.md`.
5. Run freshness research for any external technology, dependency, platform, API, or standard that is mentioned or obviously implicated.
6. **Draft** the intake brief without designing the implementation (steps 6a–6c refine it before it is written to disk in Step 9). When the request implies a core loop, state it as NUMBERED STEPS in `## Restated Request`; shape derives the Charter Scenario from it.
6a. **Misreading pass (the RIM quality floor).** Before the brief is final, run one short in-run pass: *"Name the 3 most likely ways this request could be misread."* Each candidate either becomes a RIM entry in `## Risks if Misunderstood` (stable id `RIM-1..n`, with severity) or is dismissed in that section with a stated reason ("considered: <misreading> — dismissed because <reason>"). In-run, no sub-agents; this is the floor, and shape's blind pre-mortem stays the deep pass. The `## Risks if Misunderstood` and `## Charter` sections may never be silently absent in default mode: zero entries is legal only as the explicit declaration `intent-risks: none-declared` / `charter: none-declared` in `00-index.md` frontmatter plus a one-line reason in the body ("pure mechanical rename; no interpretive surface"). Silence is illegal; shape's Step 9a backfills a missing ledger instead of waving it through.
6b. **Ratify the charter with the PO (mandatory when a charter is authored).** Present the 3–7 distilled commitments in ONE multi-select gate question, *"These are the promises I heard — confirm or correct"* (confirm/edit per [_question-craft.md](../_question-craft.md)). Record the ratification in `po-answers.md`; ratified charter entries carry `po-ratified: true` in the `00-index.md` `charter` ledger. A charter the PO ratified at stage 1 carries real authority downstream (shape's adjudications and the intent-fidelity review dimension cite it); an unratified charter is only inferred authority.
6c. **Auto second opinion**: apply the objective triggers in the blockquote above the Execution discipline section; when any holds, fire `/consult` now, and fold material findings back into the brief (a confirmed misreading becomes a RIM or a reworded Restated Request).
7. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
8. Update `00-index.md` with the recommended default option.
9. Write `.ai/workflows/<slug>/01-intake.md` per the template in [intake/default/_artifact.md](default/_artifact.md).
10. **Register this workflow in `.ai/workflows/INDEX.md`** (additive bootstrap). After `00-index.md` is finalized, ensure the registry contains a row for this slug. Re-read the just-written `00-index.md` frontmatter so the row reflects the *final* values (branch/status/workflow-type can change between Step 0 and now based on Batch A answers).
    - **If `.ai/workflows/INDEX.md` does NOT exist**, create it with the header comment (exactly from the [`/wf status` reconcile spec](../status.md)) followed by exactly one row for this workflow. Use the canonical column order: `slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at`. Header line:
      ```
      # .ai/workflows/INDEX.md — global workflow registry. Reconciled by /wf status (bootstrap+refresh) and additively touched by slug-mode compressed-slice writes from /wf intake/probe/simplify (updated-at only) and by /wf intake (append self if absent). Columns: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at. Sorted alphabetically by slug. Closed workflows are retained.
      ```
      Surface in the chat return: *"Bootstrapped `.ai/workflows/INDEX.md` with this workflow's row. Positional slug detection (compressed-slice attach via `/wf intake`/`/wf probe`/`/wf simplify`) is now enabled."*
    - **If `.ai/workflows/INDEX.md` exists AND the slug is already present**, do nothing. Reaching Step 10 with a matching row means this is a resume on a row written by an earlier intake run; leave the existing row in place so sync owns updates.
    - **If `.ai/workflows/INDEX.md` exists AND the slug is missing**, append a single new row for this workflow, then **re-sort the file alphabetically by slug** (preserving the header line at the top). Surface in the chat return: *"Added `<slug>` to `.ai/workflows/INDEX.md`."*
    - **Mutate no other row.** Status/branch/updated-at drift on other workflows is sync's responsibility, not intake's. Intake's contract here is strictly *append self if absent*.

# Adaptive routing — evaluate what's actually next
After completing this stage, do not blindly recommend `/wf shape`. Evaluate the intake and present the user with ALL viable options:

**Option A (default): Shape** → `/wf shape <slug>`
Use when: The task has ambiguity in behavior, acceptance criteria, or scope. Most tasks should go here.

**Option B: Skip to Plan** → `/wf plan <slug>`
Use when: The task is a well-understood, single-scope fix (for example "bump version X", "rename variable Y", "fix typo in Z"). No behavior ambiguity, no slicing needed. Criteria: ≤3 files likely touched, single acceptance criterion, no edge cases worth capturing.

**Option C: Blocked — re-run intake** → `/wf intake <slug>`
Use when: Required PO answers are still missing. Mark `Status: Awaiting input`.

**UI-aware path note:** If the Step 0.5 `stack:` fingerprint shows a UI/frontend layer (`stack.ui ≠ ∅`) and the task has visual surface, note in `## Recommended Next Stage` that design is woven into the normal path: `shape` authors the design brief (`02b-design.md`), `plan` authors the visual contract (`02c-craft.md`) and resolves the direction gates, and `implement` builds against it. There is no separate design command in the critical path (the standalone `/wf design <slug> <transform>` operators are for focused, ad-hoc moves). Keep `shape` as the immediate next command: it owns feature discovery, including the visual-surface questions and the design brief. This is a path heads-up only, consistent with intake staying descriptive.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page cannot tell, as many as the story needs. Follow [_fragment-authoring.md](../_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

## Additive-write contract

`01-intake.md` is a revisable artifact. Re-invocation happens when the user returns with answers to open questions, when scope changes, or when a related intake informs the current one. Follow the shared additive-write contract in [_additive-write.md](../_additive-write.md): snapshot to `.ai/workflows/<slug>/history/01-intake-<rev>.md`, **rewrite the body to current truth**, add one ledger entry (`trigger: answers-returned`, `scope-change`, or `manual`; `because:` and `changed:` naming the prompt and the effect).

Stage-specific additions:

1. **Open-question resolution**: when a previously-open question is now answered, fold the answer into the problem statement so the body reads as current truth; add the answer below the original question with a `→` marker rather than leaving the question dangling. Name the resolution in the ledger entry's `changed:` phrase; the prior wording lives in the snapshot.
2. **`status: awaiting-input` transitions**: if this run resolves all open questions, transition `status` to `complete` and clear `open-questions` in frontmatter. Note the transition in the ledger entry.

History view paths are stable (`<slug>/intake/history/<rev>/INDEX.html`); prior intakes remain linkable from later artifacts (shape, plan) that reference an intake-at-the-time.
