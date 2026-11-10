---
description: The shape phase of intake. Turn the intake brief into a compact mini-spec with acceptance criteria that verify can check, and with its edge cases.
argument-hint: <slug> [focus hint]
---

You are running the shape phase of `/wf intake`, the second half of stage 1 of 9: 1·intake (brief → shape) → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·ship → 9·retro. It interviews the person until every ambiguity of the brief is closed or parked, then writes the mini-spec `02-shape.md`, and the design brief `02b-design.md` when design is needed. Intake runs it right after the brief, in the same run. `/wf intake <slug>` runs it alone when the brief is written and the shape is not complete; `/wf intake <slug> shape` runs it again on a complete shape; `/wf shape <slug>` is an alias.

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces | `02-shape.md`, and `02b-design.md` (the design brief) when design is needed per [design/_lane.md](design/_lane.md) |
| Next | `/wf slice <slug>` (default) |
| Skip-to | `/wf plan <slug>` when the shaped spec is one coherent unit that slicing would not help |

## Card

- Write a mini-spec: the problem, the desired behavior, the acceptance criteria, what is out of scope, the open questions, the documentation plan and `augmentations-needed`.
- Each acceptance criterion says whether it is observable, and how verify checks it.
- Adjudicate every `open` entry of the RIM ledger.
- Do not design, architect or code the solution. Your only output is the workflow records and the chat return of this card.
- Done when `02-shape.md` is complete, `progress.intake` is `complete`, and every answer is in the decision store.

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `01-intake.md` | artifact | always | |
| `decisions.yaml` | artifact | if-present | |
| `design/_lane.md` | procedure | always | UX impact; The human rule; The design record |
| `design/brief.md` | procedure | mode:design | |
| `02-shape.md` | writes | | |
| `02b-design.md` | writes | | |

# Role
You run the shape phase: you write the mini-spec, never the solution.

# Workflow rules
Apply [_workflow-rules.md](_workflow-rules.md). Ask risk tolerance, appetite and other structured choices as gate questions. Behavior, acceptance criteria and non-goals may take a free-text answer.

`<wf>` below stands for `node "<skill-dir>/scripts/wf.mjs"`, with `<skill-dir>` per [_host-invocation.md](_host-invocation.md). Read and write every record per [_records.md](_records.md). Record every answer with `decide add` per [_decisions.md](_decisions.md).

# Step 0 — Orient (do this before all other steps)
1. The first argument is the slug; the dispatcher refuses a call without one. Text after the slug is a focus hint. Record it with `decide add --key shape-focus --stage shape`, and start the discovery with it.
2. Read the index with `<wf> record get "<root>" <slug> index`. Take `current-stage`, `status`, `selected-slice`, `open-questions` and `appetite` from its frontmatter.
3. Check the prerequisites:

   | Finding | Do |
   |---|---|
   | `<wf> record get "<root>" <slug> 01-intake.md` exits 1 | Stop: "Run `/wf intake` first." |
   | `01-intake.md` shows `Status: Awaiting input` | Stop. Tell the person to answer the open intake questions first. |
   | `02-shape.md` has `status: complete` | Say in chat that this is a re-run, and follow the [Additive-write contract](#additive-write-contract). |

4. Carry `selected-slice` and `open-questions` forward from the index.

# Step 1 — Launch the research agents
Launch the agents before the interview, so that their results are back by Step 3.

- Sub-agent 1 (the codebase) always runs.
- Sub-agent 2 (web research) runs unless all of these hold. This is the one place that states the skip rule:
  - The work adds no external dependency, no new API surface and no version change.
  - It is not security-sensitive: no auth, tokens, crypto, CORS, CSP or input sanitization.
  - It uses no browser or platform API: no Web API, mobile OS API or CSS feature.
  - It integrates no external API: no REST, GraphQL, OAuth, webhook or third-party SDK.
- Add more agents for work that crosses domains.

### research sub-agent 1 — Codebase Architecture & Integration Surface

Charter (a goal, not a script): map the codebase surface this work touches: the modules and entry points; the conventions of the area (naming, error handling, dependency wiring, configuration, logging); the integration surfaces in and out (callers, callees, events, middleware); the main data flow with its models and serialization boundaries; and the test structure, with the coverage gaps that matter here. Every finding cites file:line.

Start from the map of intake. When `01-intake.md` carries `## Affected Areas (preliminary)`, open the prompt of the sub-agent with that section unchanged and this instruction: *"Start from this preliminary map; verify and deepen it — do not re-derive what it already establishes."*

Interactive and visual verification tooling. The sub-agent reports adapters, drivers and candidates, each with why it fits. It picks no tool and asks nothing: you ask the tooling question in Step 3. Work from the `stack:` block of `00-index.md` and [runtime-adapters.md](runtime-adapters.md):
1. Read `stack:` again from the index (`<wf> record get "<root>" <slug> index`). Apply the shape column of the table in [runtime-adapters.md](runtime-adapters.md) → Stack gate.
2. Match `stack.platforms` to the runtime adapters; the adapter registry is the source of truth. Report each matched adapter and its drivers, installed ones first, ones to install last. For example, `[web]` gives in-repo Playwright or Cypress, then Chrome MCP when the session has it, then `dev-browser`. Check `stack.available-skills` for companion skills.
3. List each entry of `stack.available-skills` and `stack.available-mcp` that fits this task as a candidate, not a selection, with one line on why it fits.
4. Note what is already wired in: dev servers, emulator AVDs, simulator configs, screenshot and regression tools, and manual smoke scripts under `docs/`, `scripts/`, `testing/` and `QA/`.

### research sub-agent 2 — External Dependencies & Freshness

Charter: report the external picture: the current and latest version of each touched dependency, with deprecations and breaking changes; what the official docs recommend, against what the codebase does; security advisories and CVEs; known bugs, gotchas, anti-patterns and performance traps for this kind of feature; and any RFC, platform guideline or accessibility standard that prescribes behavior. Every claim names its source. Flag each finding that should shape an acceptance criterion or an edge case.

Start from the freshness pass of intake. When `01-intake.md` carries `## Freshness Research` entries, open the prompt of the sub-agent with their takeaways unchanged and this instruction: *"These are intake's freshness findings; verify they still hold and extend into what they did not cover — do not re-research what they already establish."*

Write only new or corrected findings under `## Affected Areas`, `## Dependencies / Sequencing Notes` and `## Freshness Research`. Refer to the `## Affected Areas (preliminary)` and `## Freshness Research` of intake for the rest; do not copy them. Best-practice and gotcha findings feed the acceptance criteria and edge cases.

# Step 2 — Discovery interview

Interview the person on the decisions, assumptions and unknowns that the brief left open. Ask at least 20 questions: a floor, not a ceiling (Step 2.4).

## Step 2.1 — Write the Ambiguity Inventory (before Round 1)
1. Collect every ambiguity, unstated assumption and unclear item from `01-intake.md`, the live entries of the decision store (`decide list`), the `## Affected Areas (preliminary)` of intake when it is there, and any research that is back.
2. Write them into the draft as `## Ambiguity Inventory`, one line per item, with a stable id and a source pointer:
   ```
   - **AMB-1** — <one-line ambiguity or assumption statement> — source: 01-intake.md#<section>
   ```
3. Brief and shape are one interview. In the same run as the brief, the brief's questions count toward the floor, and an item that a brief answer closed enters as `closed (decision <id>)`. Do not ask it again.
4. A work packet (`origin-packet` is set) seeds the inventory from its file: its decisions and findings enter as `closed (packet <key>)` and are not asked; its tensions and questions enter open.
5. Add an item whenever a later round or late research surfaces a new ambiguity. The inventory shows that the interview covered everything.

## Step 2.2 — Interview rules

- Ask the 20 baseline questions as gate questions per [_gate-question.md](_gate-question.md), in as few rounds as the dependencies allow: a question that builds on an earlier answer waits for it, and independent questions share a round. The themes of Step 2.3 organize the coverage, not the rounds. Packet-closed items count toward the floor. Then apply the extension rule.
- The decision-store entry of each answer starts with the `AMB-n` items it closes or confirms, for example `AMB-1, AMB-3: <answer>`. To confirm an assumption, pre-fill your understanding and ask the person to confirm or revise it; a confirmed assumption closes its item.
- The floor filler. When the open items run out before 20 questions, give the remaining questions to these themes, in this order. Add each as an `AMB-n` item before you ask it. Do not ask a question that closes or confirms no item: that is padding.
  1. **The check cost of this work** (Round 6): the long runs this work needs, the check budget, and the faster paths. Skip it when `<wf> profile budget` prints a budget and the work adds no new long run.
  2. **Meaning.** For each core term of the Restated Request that a later stage must measure or compute (for example "ability", "realistic", "fair"), ask what the term means to the person and how the person will judge it.
  3. **Consequences of earlier answers**, for example "You chose X. That implies Y in the empty state. Is that right?"
  4. **Assumptions, last.** Each assumption question names what changes when the person says no. Do not ask an assumption whose "no" changes nothing.
- Each question names this feature, with concrete details from the brief. The options are different directions, specific to the feature where possible. When intake already answered a question, pre-fill the answer and ask to confirm or revise it.
- Wait for the answers of a round before you write the next one: later questions build on earlier answers.
- Build each question per [_question-craft.md](_question-craft.md). `question` names the feature ("What should the export modal show when the user has no reports yet?"). `header` has at most 12 characters. `options` are 2 to 4 concrete directions; "Other" is always there. `multiSelect` is true only when the options can coexist.

## Step 2.3 — The rounds
- **Round 1 — What does the feature do?** The core interaction: the action the person takes, the input they give, what they get back, and what triggers the use.
- **Round 2 — How does the feature behave?** The dynamics: what happens after the main action, whether it can be undone, the timing model (sync, async, real-time), and its links to other parts of the product.
- **Round 3 — What does the feature look like?** The surface: where it lives (page, modal, inline, CLI), the data volume, the distinct states the person sees (empty, loading, error, success), and whether it follows or breaks existing patterns.
- **Round 3b — The design brief.** Only when design is needed per [design/_lane.md](design/_lane.md); skip it for work with no UI. This is the one round of the design brief: ask every question of [design/brief.md](design/brief.md) Rounds 1 to 3 that no source answers, pre-filled from the sources that procedure names (carried sketches, `PRODUCT.md`, `DESIGN.md`, `.ai/design/`). Unless a source answers them, ask the design mode of each surface (Persuade, Operate, Read, Experience), the color strategy, the reference points and anti-goals, and the state inventory. These are the inputs of `02b-design.md` (Step 5a), on top of the floor of 20.
- **Round 4 — What can go wrong?** The failure modes: the worst-case impact of a bug, invalid input, dependency failures, access and permissions.
- **Round 5 — Where are the boundaries?** Lead with scope restraint: which parts of the brief the first version needs, against speculative generality, gold-plating and "while we're here" scope. Offer each trim as an option for the person ("do you need X, or does Y cover it?"); do not cut on your own. Then ask the explicit out-of-scope, the move from old to new behavior, and the existing code and data touched. Do not trim what the person asked for, and do not trade a non-functional requirement (security, accessibility, data integrity) for a smaller scope.
- **Round 6 — How do we know, and how long may it take?** Which checks prove the work: the tests, measurements and runs that the acceptance criteria need. What each check costs in time on this repo: the suite times of `<wf> profile show`, and the known long runs of [_check-budget.md](_check-budget.md). Which faster path is acceptable for each long run, per [_long-runs.md](_long-runs.md) L3: the touched part, a pilot, a sample, a split, or the packet end. Ask the budget question here, when "When to ask" of [_check-budget.md](_check-budget.md) says to ask it. When the tooling report of sub-agent 1 is back, ask the tooling question of Step 3 in this round. Each option that runs a check states its time ([_question-craft.md](_question-craft.md) rule 9).

## Step 2.4 — Extension rule
After Round 6, list what is still unresolved. A point earns an extension round only when leaving it open would block slicing, make an acceptance criterion unverifiable, or force plan or implement to guess a direction that the person should choose.
1. Run up to 2 more rounds of up to 4 questions each, on the qualifying points only. Each lead-in names the point each question closes.
2. Stop when no point qualifies. Do not pad.
3. Write what is still open after 2 extension rounds into `## Unknowns / Open Questions`, with `status: awaiting-input` when it blocks the spec.

## Step 2.5 — Coverage gate (before you leave Step 2)
Walk the `## Ambiguity Inventory`. Each `AMB-n` item is now in exactly one of these states:

| State | Means |
|---|---|
| closed | An interview answer resolved it. Name the question and the answer. |
| extension-targeted | An extension round closed it. Name the question and the answer. |
| parked | It is in `## Unknowns / Open Questions` with the stage that receives it, and `status: awaiting-input` when it blocks the spec. |

The interview does not end while an item is in none of these states. After the interview (the rounds, Round 3b when it applies, and the extension rounds), record every answer with `decide add --stage shape`, with the AMB ids in the answer text ([intake/default/_artifact.md](intake/default/_artifact.md)).

# Step 3 — Collect the research; ask the tooling question
1. Collect the sub-agent results. When they are not back, wait: `## Verification Strategy` and the tooling question need them.
2. Ask the tooling question yourself, never through a sub-agent: in Round 6 when the report is back in time, else now, as the last question of Round 6. Build one gate question per [_gate-question.md](_gate-question.md) from the tooling report of sub-agent 1, for example: *"For verification, the available drivers are A, B, C. Companion skills: X, Y. Any preference, or any off-limits?"* Build it per [_question-craft.md](_question-craft.md), and record the answer with `decide add --stage shape`. The acceptance criteria name the tools that the person chose, not a default.
3. Fold late findings into the inventory as new `AMB-n` items. When one qualifies under Step 2.4, run the extension rounds now; Step 2.5 applies to them too.

# Step 4 — Synthesize the mini-spec
Turn the answers into a mini-spec about behavior: the body sections of [Artifacts](#artifacts).

# Step 5a — Write the design brief (when design is needed)
When design is needed ([design/_lane.md](design/_lane.md)), write `02b-design.md` per [design/brief.md](design/brief.md), with its `## UX intent`, from the Round 3b answers. Ask no second round: what Round 3b did not answer stays an open question in the brief, for the design stage. The design stage, not shape, draws the surfaces with the person, runs the confirm gate and writes `02c-craft.md`. Leave `image-gate` unset.

When `ux-impact` is `none`, run `<wf> record set "<root>" <slug> index progress.design=skipped design-skip-reason="<one line>"` instead.

# Step 5b — Write the Charter Scenario (when the work has a core interaction loop)
A core interaction loop is numbered in the Restated Request of the brief, or it follows from its prose. An unnumbered loop still counts: derive it.

| The work | Do |
|---|---|
| has a core loop | Write `## Charter Scenario`: the loop as one scripted end-to-end scenario. Each step carries an observable checkpoint that a person or a tool can confirm ("goal entered → probe question shown that references the stated goal → answer captured → …"). Set `charter-scenario: authored`. |
| has no core loop (a pure library change, an internal refactor, no user-facing flow) | Set `charter-scenario: "none — <reason>"`, and leave the section out. A skip is a declaration in the frontmatter, never a silence. |

The key is required either way. Compressed intake modes leave out both the key and the section.

# Step 6a — Documentation plan (Diátaxis)
Classify the documentation that this feature needs:

| The feature adds | Doc type |
|---|---|
| a new API surface or configuration | reference |
| user-facing behavior | how-to guide |
| a major new capability for new users | tutorial |
| an architectural decision or trade-off | explanation |
| a significant change to what the project can do | README update |

Write `## Documentation Plan` per [Artifacts](#artifacts). When no user-facing doc is needed (an internal refactor, a test-only change), write "None required" with the reason.

# Step 6b — Augmentation plan
Decide which of the five augmentations this work needs, so that plan, implement and verify follow it:

| Augmentation | When | Artifact | `## Augmentation Plan` holds |
|---|---|---|---|
| `instrument` (observability) | A new flow could fail silently, or its adoption or latency matters: dark-path detection and signal design. | `04b-instrument.md` | the signals and dark paths; plan folds the signal design in, implement wires it |
| `experiment` (rollout scaffolding) | The change is risky enough to want an A/B test, a feature flag, or a canary with metrics and a rollback. | `04c-experiment.md` | the hypothesis, the mechanism (A/B, flag, canary), the metrics and the rollback |
| `benchmark` (perf baseline and compare) | A hot path, a data-structure change or a rendering loop: a baseline before implement, a compare after. The regression tripwires are >10% CPU and >25% memory. | `05c-benchmark.md` | what to measure, and the perf budget; verify compares against the tripwires |
| `profile` (ad-hoc hotspot) | A specific known hotspot: flag the area so that plan can schedule it, or reach for it later with `/wf probe`. | | the hotspot |
| `tune` (a number to reach) | An acceptance criterion is a measured number that the build must move into a range (a latency, a size, an accuracy): a bounded loop of rounds. | `05d-tune.md` per `augment/tune.md` | the metric, the target range, the harness command and the levers |

1. Fold 1 or 2 questions into the interview, for example: *"Is any part of this perf-sensitive? Is the rollout risky enough for a flag/canary? Is there a behavior change worth instrumenting in production?"* Ask only what the interview did not answer.
2. Write `## Augmentation Plan` and set `augmentations-needed:` in the frontmatter. Both are required when the answer is none: write "None required — [reason]" and `augmentations-needed: []`.

# Step 7 — Route
Write every viable option of [Adaptive routing](#adaptive-routing) into the `recommended-routes` frontmatter, and choose `next-command` and `next-invocation`. Step 10 writes the index, after Step 9a has settled `status`.

# Step 9 — Adversarial pre-mortem (run before Step 9a)
The pre-mortem generates RIMs. It runs in a fresh sub-agent that sees only the intent, so it cannot rationalize decisions it never saw.
1. Give it only `01-intake.md` and the live entries of the decision store (`decide list`); not the draft `02-shape.md`, and no decision of this run. It derives its own expectation of the product and writes the post-mortems against that.
2. Prompt it: *"It is N weeks later and the shipped product betrayed its intake; write the two most likely post-mortems."* Scale N to the `appetite:` of `00-index.md`: a week for small, a quarter for large.
3. Each post-mortem names one specific drift from what the person asked: a narrowed capability, an inverted control authority (deterministic code owning what the intake gave to the model or an agent), or a deferred wall that never cleared.

Adjudicate the returns yourself, since you know the draft:

| The risk | Do |
|---|---|
| The draft already handles it | Dismiss it, with the citation of the artifact section that handles it. |
| The draft does not handle it | Add it to `intent-risks` of the index as a RIM: `status: open`, and a `severity` by blast radius. |
| It is already in the ledger | It confirms that entry. |

Step 9a adjudicates the RIMs of intake and of the pre-mortem alike.

# Step 9a — Adjudicate the intent-risk (RIM) ledger (gate)
Read `intent-risks` from the index. Intake wrote it from "Risks if Misunderstood", and Step 9 extended it. Give each entry with `status: open` exactly one of these:

| Status | Required with it |
|---|---|
| `adjudicated` | `decision:` (the named choice and its trade-off, not a restatement), and `adjudicated-by: 02-shape.md#<section>`. When the risk touches a directive of the person (the Known Constraints of intake, or a recorded answer), `po-ratified` is `true`: a question asked in this stage, cited by the id of its decision-store entry. `false` needs an explicit note that the person declined; `not-required` holds only when the decision changes no directive. |
| `carried` | The risk cannot be resolved at shape. It also appears in `## Unknowns / Open Questions`, with the stage that receives it. |

- A shape with any RIM still `open` does not write `status: complete`.
- A decision that only restates the risk ("we will keep this in mind") is not an adjudication.
- To write the entries, get the index with `record get`, change `intent-risks`, write the draft of `00-index.md`, and put it with `<wf> record put "<root>" <slug>`.

A missing ledger:

| The workflow | Do |
|---|---|
| A compressed intake mode with no RIMs | This step does nothing. |
| A standard-lifecycle slug whose index has neither `intent-risks` entries nor `intent-risks: none-declared` | Intake did not deliver its ledger. Backfill it: derive candidate RIMs from `01-intake.md` (Known Constraints, Restated Request, Risks if Misunderstood), write them into `intent-risks` with `status: open` the same way, then adjudicate each. |

# Step 9b — Write the `## Intake Fidelity` table (required)
Write one row per Known Constraint or directive of intake, and one per numbered item of the Restated Request: `directive | disposition (honored / narrowed / dropped) | how | authority`.

| Disposition | Authority it needs |
|---|---|
| honored | none |
| narrowed | A quoted answer of the person whose scope covers the requirement (the scope-of-authority rule of [_question-craft.md](_question-craft.md)), or a ratification in this stage. |
| dropped | A gate-question ratification in this stage ([_gate-question.md](_gate-question.md)), cited by the id of the new decision-store entry: a drop is always a fresh decision. |

"A consequence of another answer" is not authority: ask one more question. When `00-index.md` records `origin-items`, add one row per carried decision, its key and text word for word, from the `carried-decisions` of the origin work packet or from the origin board; list work packets have them already.

# Step 10 — Write the artifacts
1. Write the draft `<wf-dir>/.draft/02-shape.md` per [Artifacts](#artifacts). When Step 5a applied, also write the draft `<wf-dir>/.draft/02b-design.md`, whose structure [design/brief.md](design/brief.md) defines. Then run `<wf> record put "<root>" <slug>`.
2. Update the index in one call: `<wf> record set "<root>" <slug> index current-stage=intake stage-number=1 progress.intake=complete next-command=<command> next-invocation="<invocation>"`. In the same call:
   - Set `progress.intake=in-progress` instead while `02-shape.md` has `status: awaiting-input`, an open RIM after Step 9a included.
   - When the index still holds a `progress.shape` key, set `progress.shape=complete`. Do not add the key to an index that lacks it.
   - Set `workflow-files` to the whole list, with `02-shape.md` appended.
3. When `branch-strategy` is `dedicated`, list the ship gaps now: run Step R0 of [_ship-plan-readiness.md](_ship-plan-readiness.md) in its listing form, `<wf> ship ready "<root>" <slug>`. Name each gap in the chat return as a task for the person. A gap does not stop intake; ship stops on it.

# Chat return contract
After you write the files, return per [_chat-return.md](_chat-return.md). Lead with the narrative (section *The narrative*). Name the highest-severity RIM of intake and how shape disposed of it. Then give this receipt:
- `slug: <slug>`
- `wrote: <path>`
- `fidelity:` (required): the Intake Fidelity and RIM outcome in one line: `<n> honored · <m> narrowed (each: directive → authority) · <k> dropped (each: directive → authority) · RIMs: <a> adjudicated, <b> carried`. The all-clear form is `fidelity: all directives honored; all RIMs adjudicated`.
- `options:` (every viable next option of Adaptive routing)
- at most 3 short blocker bullets, when needed

# Adaptive routing
Do not recommend `/wf slice` by habit. Write every viable option into `recommended-routes`:

| Option | Invocation | When |
|---|---|---|
| A: Slice (default) | `/wf slice <slug>` | The spec covers several distinct areas, has more than one cluster of acceptance criteria, or gains from incremental delivery. |
| B: Skip to plan | `/wf plan <slug>` | One coherent unit: one scope, one acceptance path, at most 5 files likely touched, no meaningful split. |
| C: Revisit the brief | a new `/wf intake <description>`, then `/wf intake <slug> close` for this one | Shaping showed that the brief is wrong, misses key constraints, or misreads the problem. |
| D: Blocked, answers missing | `/wf intake <slug>`, which resumes this phase | Required answers of the person are still missing. |
| E: Design (the default when design is needed) | `/wf design <slug>` | Shape wrote `02b-design.md`. The person confirms the design at the design stage before slice, plan or any driver runs. Options A and B follow it. |

# Artifacts
Write `02-shape.md` with this frontmatter:

```yaml
---
schema: sdlc/v1
type: shape
slug: <slug>
status: complete
stage-number: 2
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
docs-needed: <true|false>
docs-types: [<reference|how-to|tutorial|explanation|readme>]
augmentations-needed: [<instrument|experiment|benchmark|profile|tune>]   # [] when none (Step 6b)
charter-scenario: <authored | "none — <reason>">   # Step 5b; compressed modes omit
files-in-scope: [<path>]            # from ## Affected Areas; design reads it
tags: []
refs:
  index: 00-index.md
  intake: 01-intake.md
  next: 03-slice.md
next-command: wf-slice              # wf-design when design is needed
next-invocation: "/wf slice <slug>" # "/wf design <slug>" when design is needed
recommended-routes: [{invocation: "/wf slice <slug>", reason: "<one phrase>", default: true}]   # one entry per Adaptive-routing option
---
```

Body sections, in order:
- `## Problem Statement`, `## Primary Actor / User`, `## Desired Behavior`.
- `## Ambiguity Inventory` (Step 2.1): `- **AMB-1** — <statement> — source: <artifact#section> — state: closed (<round/question>) | parked (<Unknowns entry>)`. Every item ends closed, extension-targeted or parked (Step 2.5).
- `## Charter Scenario` (Step 5b): `1. <step> → <observable checkpoint>`. Slice carries it as a standing acceptance criterion with progressive coverage: the visible-milestone slice through step N, the final slice through all steps. Verify runs it as interactive verification, subject to first-light. Compressed intake modes leave it out.
- `## Acceptance Criteria`: `Given … When … Then …`. Classify each one:

  | Class | Proved by |
  |---|---|
  | `automated` | a unit or integration test |
  | `interactive` | running the app and observing it through a browser, emulator or device. Name the tool (Playwright, Maestro, adb, browser automation), what to look for, and the evidence capture (screenshot, recording, console output). |
  | `manual` | human judgement, or a check of an external system |

  Two rules apply:
  - **Direction rule.** A criterion whose subject is a gate, guard, health check, validation or fallback ("an unhealthy revision is caught", "invalid input is rejected") is two criteria with opposite evidence directions: the happy path passes through, and the guarded failure is caught. Write both. The evidence of the fail-closed half is a failure that is induced or observed and caught (fault injection, a bad fixture, a forced timeout), never a green run. Verify and probe check the direction when they clear it.
  - **Named-mechanism rule.** Each architectural mechanism named in a criterion, its verification method or a test-plan line (a state machine, scheduler, queue, cache, pipeline, orchestrator, a controlling regex) is a named decision in the body: one sentence that states the mechanism, what it replaces, and why. Name it there, and adjudicate it per Step 9a when it touches a RIM or a directive of the person; or drop it from the criterion.
- `## Non-Functional Requirements`. An NFR that could conflict with a charter commitment (`charter:` of `00-index.md`) carries its precedence: `yields-to: C<n>` (the commitment wins), or `outranks: C<n> (PO-ratified)` (the NFR wins, by an answer of the person in this stage, cited by the id of its decision-store entry). An unranked conflict is an open question for the person, never your silent call. Plan quotes this ranking when it cites the NFR as the reason for a mechanism.
- `## Edge Cases / Failure Modes`, `## Affected Areas`, `## Dependencies / Sequencing Notes`.
- `## Out of Scope`: each trim of Round 5, with a one-line reason. A trim is a logged decision of the person, not a silent drop.
- `## Unknowns / Open Questions`: each parked item and each carried RIM, with the stage that receives it (Steps 2.4, 2.5 and 9a).
- `## Intake Fidelity` (Step 9b). The intent-fidelity review dimension reads it, and its dispositions feed the `fidelity:` line of the chat return.

  | Intake directive | Disposition | How | Authority |
  |---|---|---|---|
  | ... | honored / narrowed / dropped | ... | quoted PO answer (scope-covering) / this-stage ratification / — |

- `## Definition of Done`.
- `## Verification Strategy`. Write these parts, in order:
  1. The target verification environment, from the tooling findings of sub-agent 1 and the tooling answer of the person (Step 3): the host OS, an Android device or emulator or an iOS simulator, the browser or driver present or installable (Playwright, Cypress, dev-browser, Chrome MCP), and live or staging credentials.
  2. The Observation Model: for each headline outcome, how a person or a tool observes success, and in what environment ("single-column at 375px → observed by driving a 375px-viewport browser and reading the layout"). When you cannot name an observation, re-scope the outcome or flag it now, so that slice and plan inherit the constraint.
  3. The class of each acceptance criterion and edge case: Automated checks, Interactive verification (platform, tool, what to verify, evidence capture), or Human-in-the-loop checks. Purely backend or library work writes "Automated only — no interactive verification needed. [reason]."

  Two rules apply:
  - **Force-scope rule.** Engineer a constraint; do not document it. When the Observation Model or the environment names a dependency on the critical path of a headline outcome (credentials, a device, an external service, an inbound callback, infrastructure that does not exist yet, such as a TURN relay or a staging deploy), route it into scope with exactly one of these:
    - flag a candidate prerequisite slice or harness for slice to scope;
    - state the proxy observation that the plan holds before deploy, and the named event that clears the residual ("cleared by the first `-rc.N` prerelease CI run");
    - record that the person explicitly accepts the risk, with `decide add --stage shape`.

    "Known limitation — document at handoff" is not allowed while an acceptance criterion depends on that limitation. Plan enforces this for each criterion through its `constraint-resolution:` gate.
  - **An outcome metric needs a pre-deploy proxy.** A live outcome metric ("rich-preview rate ≥ 75% over the live corpus") pairs with a proxy observation before deploy (a fixture-corpus assertion over the top-N recorded failure pages), so that verification holds something before ship. The live metric becomes the event that clears the residual.
- `## Documentation Plan` (Diátaxis): for each doc, its Type (tutorial / how-to / reference / explanation / readme-update), Audience (beginner / competent user / maintainer), Must cover, Must NOT cover, and Target location; or "None required — [reason]".
- `## Augmentation Plan` (required, also when none): per Step 6b.
- `## Freshness Research`: Source / Why it matters / Takeaway for each entry.

# Additive-write contract
`02-shape.md` is a revisable artifact. When the shape phase runs again on a slug that has one, follow [_additive-write.md](_additive-write.md): take a snapshot, rewrite the body to the current truth (no stacked `## Revision N` sections), and add one ledger entry.
- The snapshot: write the `record get` output of `02-shape.md` to `<wf-dir>/history/02-shape-<rev>.md`. Snapshot a sibling `02-shape.yaml` only when an older run left one.
- The ledger entry: `trigger: scope-change`, or `answers-returned` when the reshape resolves open questions. `because:` names what prompted the reshape; `changed:` names what moved in the spec.
- `regenerable: true` applies only when the shape phase wraps a shape derived by a script (the regeneration after an amendment). Then write no ledger entry. The history view paths are stable (`<slug>/shape/history/<rev>/INDEX.html`).
