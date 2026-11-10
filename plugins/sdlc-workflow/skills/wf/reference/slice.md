---
description: Break a shaped work item into vertical slices that can each be verified on its own, one capability each. Writes a master index and one file per slice.
argument-hint: <slug> [focus hint]
---

You are running `/wf slice`, stage 3 of 9: 1·intake → 2·design → `3·slice` → 4·plan → 5·implement → 6·verify → 7·review → 8·ship → 9·retro. It asks the person how to cut the work, then cuts the shaped spec into vertical slices, one capability each, with a verification path on each acceptance criterion. It writes one file per slice and the master index `03-slice.md`, which links them and holds what cuts across them.

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces | `03-slice.md` (master index) + `03-slice-<slice-slug>.md` per slice |
| Next | `/wf plan <slug> <best-first-slice>` (default) |
| Alt | `/wf plan <slug> all` to plan all slices in parallel |

## Card

- Cut the shaped spec into vertical slices, one capability each.
- Write each acceptance criterion with its verification path: `observable: true|false`, and a `verify:` stub for an observable criterion.
- Write the per-slice drafts first, then the draft of `03-slice.md`, and put them. Update the index last.
- Do not plan, design or code. Your only output is the workflow records and the compact chat summary of this card.
- To change the body of a record that exists, run `wf.mjs record draft "<root>" <slug> <name>`, edit the draft that it names, then run `wf.mjs record put "<root>" <slug>`.
- To change several records or several list items, write a script for `wf.mjs run`, per [_api.md](_api.md).

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `01-intake.md` | artifact | always | |
| `02-shape.md` | artifact | always | |
| `decisions.yaml` | artifact | if-present | |
| `02b-design.md` | artifact | if-present | |
| `02c-craft.md` | artifact | if-present | |
| `design/_lane.md` | procedure | always | UX impact; The human rule |
| `design/_design-context.md` | procedure | mode:design | Design modes |
| `design/onboard.md` | procedure | mode:design | |
| `design/polish.md` | procedure | mode:design | |
| `03-slice-<slice>.md` | writes | | |
| `03-slice.md` | writes | | |

`mode:design` rows apply when design is needed per [design/_lane.md](design/_lane.md).

# Role

You run the slice stage: you cut the shaped spec into slices, never build them.

# Workflow rules

Apply [_workflow-rules.md](_workflow-rules.md). `<wf>` below stands for `node "<skill-dir>/scripts/wf.mjs"`, with `<skill-dir>` per [_host-invocation.md](_host-invocation.md). Read and write every record per [_records.md](_records.md). Record every answer with `decide add` per [_decisions.md](_decisions.md). On a script answer with `ok: false`, follow the failure rule of [_host-invocation.md](_host-invocation.md).

# Step 0 — Orient (do this before all other steps)
1. The first argument is the slug; the dispatcher refuses a call without one. Text after the slug is a focus hint. Record it with `decide add --key slice-focus --stage slice`, and apply it when you choose the slices.
2. Read the index with `<wf> record get "<root>" <slug> index`: `current-stage`, `status`, `selected-slice`, `open-questions`.
3. Check the prerequisites:

   | Finding | Do |
   |---|---|
   | `<wf> record get "<root>" <slug> <name>` exits 1 for `01-intake.md` or `02-shape.md` | Stop. Tell the person which command to run first ("Run `/wf intake <slug>` first."). |
   | `02-shape.md` shows `Status: Awaiting input` | Stop. Tell the person to answer the open shape questions first. |
   | `current-stage` is past slice | Say in chat that this is a re-run, and go on. [_additive-write.md](_additive-write.md) snapshots the earlier revisions and appends the `revisions:` ledger. |

   Stack gate: Apply the slice column of the table in [runtime-adapters.md](runtime-adapters.md) → Stack gate.
4. Use the design artifacts when they are there. When neither `02b-design.md` nor `02c-craft.md` exists, skip this item.
   - From `02b-design.md`, take the content inventory, the states (empty, error, loading, first-run) and the visual direction. State transitions (empty against populated) and surface boundaries (the main view against a settings drawer) inform the slice boundaries: give each distinct state or surface its own slice, or justify the grouping in `## Slice Strategy` of `03-slice.md`, one sentence per state or surface.
   - From `02c-craft.md`, take the `## Mock fidelity inventory` and the notes of each surface. The same rule applies to distinct visual surfaces (card, detail, drawer) and signature interactions. Do not cut around token choices, motion specs or implementation details; they belong to plan and implement. When `02c-craft.md` adds surfaces or states that neither the shape nor `02b-design.md` has, record an open question on the master index instead of widening the scope.
   - When design is needed per [design/_lane.md](design/_lane.md), structure the slices around the design: a state or surface with its own acceptance criteria usually earns its own slice. The `mode:design` procedure rows help you recognize the substantive states: `onboard.md` gives the empty and first-run states, `polish.md` the 7-state checklist, `_design-context.md` the design modes. This is structuring, not redesigning.
   - Map every slice to its screens by the keys in `screens:` of `02c-craft.md` (a contract from before the design surface names `surfaces:`). Write the keys in the `## Scope` of each slice file, and run `<wf> design screen add "<root>" <key> --workflow <slug> --slice <slice>` for each, so that the canvas shows the screens in the row of the slice in the Slices layout. Plan, implement and verify find the screens of a slice by these keys (`design/_surface.md`).
   - When design is not needed, do not load the design procedures. When design is needed and not settled, stop per the human rule of the lane, and route to `/wf design <slug>`.
5. Carry `selected-slice` and `open-questions` forward from the index.

# Steps
1. Before you cut, ask about the slicing strategy, as gate questions per [_gate-question.md](_gate-question.md): only the questions this cut needs, in as few rounds as the dependencies allow.
   - Each question names concrete parts of the shaped spec, is impartial, and offers cuts that differ. Skip what the shape or intake already answered.
   - Build each question per [_question-craft.md](_question-craft.md). Describe each option by what the person experiences (more PRs and faster feedback, against fewer review passes), not by its mechanism.
   - Ask about: the delivery order (the riskiest part first or the most visible part first; a demo date, milestone or dependency that decides which slice ships first); the granularity (which mechanisms verify together and so form one capability; the review capacity of the team); the rollout coupling (which slices can ship on their own; feature flags, migrations or API contracts that force parts into one slice); and the scope cuts (parts of the spec that the person would defer; must-have-now against nice-to-have-later criteria).
   - Record every answer with `decide add --stage slice`.
2. Run freshness research only where external constraints affect the cut or the order.
3. Break the work into vertical slices that can each be implemented and verified on its own. A slice is one capability: a group of mechanisms that verify checks together, for example "the staff attribute model and ratings". Its small outcomes become the steps of its plan. A slice has fewer than 40 plan steps; cut a larger capability into two slices. Do not size a slice by lines of code.
4. For a campaign work packet (`00-index.md` has `origin-packet`), aim for 10 slices. Above 14, write every slice, go on, and warn in the chat return with the count; the person can split the work packet later.
5. Give each slice a slice-slug: a lowercase kebab-case identifier from its name ("Auth Flow" → `auth-flow`).
6. Put the slices that reduce risk and uncertainty early.
7. Find the best first slice.
8. Charter-scenario coverage, when `02-shape.md` carries a `## Charter Scenario`. Two slices carry the standing acceptance criterion `charter scenario executes through step N`: the visible-milestone slice (the first at which a person sees the core loop work end to end) proves the steps built so far, and the final slice proves all steps. Tag it `observable: true`, so that verify runs it interactively on the same ladder as any user-observable criterion, and give it a `verify:` stub.
9. The review scope is not a question: there is one review per work packet. Keep `review-scope` as `00-index.md` has it. When an older workflow has `review-scope-confirmed: false`, set it to `true` and also set `review-scope: slug-wide`, unless `<wf> record list "<root>" <slug>` names a `07-review*` record (a change of scope would orphan it). Set them with `record set` at step 13.
10. Write one draft `<wf-dir>/.draft/03-slice-<slice-slug>.md` per slice, per [Artifacts](#artifacts) and the [AC verifiability discipline](#ac-verifiability-discipline).
11. Write the draft of the master `03-slice.md` per [Artifacts](#artifacts), with a link to every slice record. Then run `<wf> record put "<root>" <slug>`.
12. Evaluate the [Adaptive routing](#adaptive-routing). Write every viable option into `recommended-routes` of the master frontmatter.
13. Record the end of the stage: `<wf> record stage-done "<root>" <slug> slice`. The command writes `current-stage`, `progress.slice`, `next-command` and `next-invocation` (the default route, `/wf plan <slug> <best-first-slice>`), and adds every slice record to `workflow-files`. When the recommended default is another route, add `--next "<invocation>"`. Set any other index field with `<wf> record set "<root>" <slug> index key=value ...`.

# AC verifiability discipline

Write the verification path with the acceptance criterion. A user-observable criterion is not finished until you can name how it will be observed: one born without a path becomes a wall at verify, rationalized past with a `pass` by static reasoning or a bare "no emulator" deferral. Decide verifiability here, where re-scoping is cheap. For every criterion that you write into a slice file:

1. Partition it with a justified decision, not a bare label: tag it `<!-- observable: true -->` or `<!-- observable: false -->` right after its text. Verify reads the tag; it is set here, never found out at verify.

   | Tag | Means |
   |---|---|
   | `observable: true` | A person would see or feel the outcome: a rendered surface, a navigation, the output of a command. Name the tool that will observe it, in one line. |
   | `observable: false` | An automated assertion proves the outcome fully, with no live runtime ("the util handles null input"). You claim that an existing or cheap automated test covers it fully. `false` turns off the runtime gate downstream. |

2. Give every `observable: true` criterion a verification-plan stub, inline under the criterion:
   ```
   - Given a phone viewport When the board loads Then the carousel is single-column with a tap action sheet at 375px
     <!-- observable: true -->
     verify: { method: playwright, env: 375x812 viewport (install-playwright if absent), fixture: seeded-board, rung: web-1 }
   ```
   `method` is the tool or technique that observes it. `env` is the target environment and what must be installed or booted; plan turns it into an authorized bootstrap step, so a missing tool shows up now. `fixture` is the seed data or deterministic state the criterion needs. `rung` is the expected rung of the constraint-resolution ladder ([runtime-adapters/_ladder.md](runtime-adapters/_ladder.md)). The stub is a sketch; the `## Verification Strategy` of plan engineers it.
3. A user-observable criterion that cannot be planned is not allowed. When no method, tool or environment would observe an `observable: true` criterion in the target environment, do one of these now, never "decide later":
   - re-scope the criterion to an observable proxy that can be verified there; or
   - register the deferral now, with the constraint stated at birth ("operator session required: prod OAuth credentials"), as a logged decision that the person agreed to.
4. Name every architectural mechanism in the body (the named-mechanism rule of shape). Each mechanism named in a criterion, a verification method or a `verify:` line (a state machine, scheduler, queue, cache, pipeline, orchestrator or controlling regex) is a named decision in the body of this slice: one sentence that states the mechanism, what it replaces, and why. A mechanism that enters only through a test method is a design decision that skipped review: name it in the body, or drop it from the criterion.

Plan (`## Verification Strategy`) and verify (the user-observable acceptance criterion gate) both build on this discipline.

# Adaptive routing

Write each viable option as one `recommended-routes` entry, with its reason:

| Option | Invocation | When |
|---|---|---|
| A: Plan the best first slice (default) | `/wf plan <slug> <best-first-slice-slug>` | The standard flow: work through the slices one at a time, from the slice of highest risk or highest value. |
| B: Plan all slices in parallel | `/wf plan <slug> all` | The slices are independent enough that planning them all at once is efficient. |
| C: Revisit shape | `/wf intake <slug> shape` | Slicing showed a spec too vague, contradictory or incomplete to cut. |

# Chat return contract

After you write the files, return per [_chat-return.md](_chat-return.md): lead with the narrative (section *The narrative*), then this receipt:
- `slug: <slug>`
- `wrote: <paths>` (every slice file written)
- `options:` (every viable next option of Adaptive routing)
- at most 3 short blocker bullets, when needed

# Artifacts

Write `03-slice.md` (the master index):

```yaml
---
schema: sdlc/v1
type: slice-index
slug: <slug>
status: complete
stage-number: 3
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
total-slices: <N>
best-first-slice: <slice-slug>
tags: []
slices:
  - slug: <slice-slug>
    status: defined
    complexity: <xs|s|m|l|xl>
    depends-on: []
  - slug: <slice-slug>
    status: defined
    complexity: <xs|s|m|l|xl>
    depends-on: [<other-slice-slug>]
refs:
  index: 00-index.md
  shape: 02-shape.md
next-command: wf-plan
next-invocation: "/wf plan <slug> <best-first-slice>"
recommended-routes:            # Adaptive routing: Option A is the default
  - invocation: "/wf plan <slug> <best-first-slice>"
    reason: "<one phrase>"
    default: true
  - invocation: "/wf plan <slug> all"
    reason: "<one phrase>"
---
```

Body of `03-slice.md`, as `# Slice Index`, in order:
- `## Slice Strategy`, with the grouping sentences of Step 0.4 (one per state or surface).
- `## Recommended Order`: numbered `<slice-slug>` entries, each with a reason.
- `## Cross-Cutting Concerns`, `## Dependencies Between Slices`, `## Deferred / Optional Slices`.
- `## Freshness Research`: Source / Why it matters / Takeaway for each entry.

Write `03-slice-<slice-slug>.md` (the per-slice file):

```yaml
---
schema: sdlc/v1
type: slice
slug: <slug>
slice-slug: <slice-slug>
status: defined
stage-number: 3
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
complexity: <xs|s|m|l|xl>
depends-on: [<other-slice-slugs>]
tags: []
ux-impact: <none|visual|flow|new-surface>  # this slice's own value (design/_lane.md)
refs:
  index: 00-index.md
  slice-index: 03-slice.md
  siblings: [03-slice-<other>.md, ...]
  plan: 04-plan-<slice-slug>.md
  implement: 05-implement-<slice-slug>.md
next-command: wf-plan
next-invocation: "/wf plan <slug> <slice-slug>"
recommended-routes:
  - invocation: "/wf plan <slug> <slice-slug>"
    reason: "<one phrase>"
    default: true
---
```

You write every `refs:` link when you create the file. Later stages do not edit the links of this file.

The `slice-order` command of `campaign.mjs` adds a `depends-on` edge from a plan: `node "<skill-dir>/scripts/campaign.mjs" slice-order "<root>" <slug> add --slice <slice> --after <other slice> --why "<reason>"`. Remove an edge here, with the person.

Body of `03-slice-<slice-slug>.md`, as `# Slice: <slice-name>`, in order:
- `## Goal`, `## Why This Slice Exists`, `## Scope` (what is in; what is out, and which slice handles it).
- `## Likely Files / Areas to Touch`: `path/or/module: why`, one line per entry. Research sub-agent 1 of plan reads this list. Write "Unknown — plan research locates the files" when the shape names no area.
- `## Acceptance Criteria`: each criterion written with its verification path per the [AC verifiability discipline](#ac-verifiability-discipline): `- Given ... When ... Then ...`, then `<!-- observable: true|false — one-line justification of the partition -->`, then, only for `observable: true`, `verify: { method: <tool/technique>, env: <target env / what must be installed or booted>, fixture: <seed data / deterministic state>, rung: <constraint-ladder rung> }`. The visible-milestone slice and the final slice also carry the standing charter-scenario criterion (step 8) when `02-shape.md` has a `## Charter Scenario`.
- `## Dependencies on Other Slices`: `<other-slice-slug>`: what this slice needs from it.
- `## Risks`.

# Additive-write contract

`03-slice.md` and each `03-slice-<slice-slug>.md` are revisable. When `/wf slice` runs again, follow [_additive-write.md](_additive-write.md) for each file you rewrite: a snapshot, the body rewritten to the current truth, and one ledger entry.
- The snapshots go in `<wf-dir>/history/`, each the `record get` output of its record: `03-slice-<rev>.md` for the index, and `03-slice-<slice-slug>-<rev>.md` for a slice file.
- The ledger entry of each rewritten file: `trigger: scope-change` (the default), or `new-slice` when slices were added. `because:` names why the cut changed; `changed:` names what moved.
- A slice added in this run starts fresh: no earlier revision, no history snapshot, `revision-count` 1.
- A removed slice stays in storage. Set `status: dropped` in its frontmatter with a `dropped-reason:` field, and append a last `## Dropped — <ISO>` section: get the record, change it, write its draft and put it. Do not delete a slice record.
