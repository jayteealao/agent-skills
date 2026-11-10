---
description: Write implementation plans, or review and fix them. The first call on a slice writes its plan. A later call reviews the plan against the current code and records, and fixes what it finds. Works on one slice, on all slices in parallel, or on feedback that the person gives.
argument-hint: <slug> [<slice> [guidance or fix instructions] | all]
---

You are running `/wf plan`, stage 4 of 9: 1·intake → 2·design → 3·slice → `4·plan` → 5·implement → 6·verify → 7·review → 8·ship → 9·retro. It researches the code and writes a step-by-step plan per slice, with a verification strategy for each criterion a person can observe. On a slice that has a plan, it reviews the plan against the code and fixes it.

| | Detail |
|---|---|
| Requires | See [## Requires](#requires). |
| Produces | `04-plan.md` (master) + `04-plan-<slice-slug>.md` per planned slice |
| Next | `/wf implement <slug> <slice-slug>` |

## Card

- Research the code first. Then write a plan that a builder can follow step by step: each step names its files and its done check.
- A slice has fewer than 40 steps. At 40 or more, route back to slice.
- Settle an implementation-detail decision yourself and record it. Do not settle an intent-bearing decision (per [_decision-classes.md](_decision-classes.md)): run `decide answered` for its key, and when no live entry answers it, return it as a question with a key, the options and a recommended option. Then finish the artifact with `status: awaiting-input`.
- Record each choice that you settle in `## Assumptions`, with the reason.
- A plan or a slice reserves a decision for the person only as [_decision-classes.md](_decision-classes.md) "A reservation needs the person's words" says.
- A step check runs only the tests of the step, or the `fast` and `affected` suites of the test profile. Do not plan a `full` or `heavy` command, a push hook, or a command that takes longer than `budget.slice` of `wf.mjs profile budget` (else the time box of the profile) as a slice check. Name it under `## Packet Checks` of the plan: the review runs it once for the packet.
- A long run is never a slice step ([_long-runs.md](_long-runs.md) L5): put it under `## Packet Checks` or a boundary check, with its pilot measurement.
- Do not write product code, and do not edit files other than the plan records. Your only output is the plan records and the chat summary.
- Done when `04-plan-<slice>.md` has `status: complete` and `has-blockers: false`.
- To change the body of a record that exists, run `wf.mjs record draft "<root>" <slug> <name>`, edit the draft that it names, then run `wf.mjs record put "<root>" <slug>`.
- To change several records or several list items, write a script for `wf.mjs run`, per [_api.md](_api.md).

## Requires

Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `02-shape.md` | artifact | always | |
| `decisions.yaml` | artifact | if-present | |
| `03-slice.md` | artifact | if-present | |
| `03-slice-<slice>.md` | artifact | if-present | |
| `04-plan.md` | artifact | if-present | Sibling Plans |
| `02b-design.md` | artifact | if-present | |
| `02c-craft.md` | artifact | if-present | |
| `design/_lane.md` | procedure | always | UX impact; The human rule |
| `design/_design-context.md` | procedure | mode:design | Design modes; Shared design laws |
| `runtime-adapters/_ladder.md` | procedure | mode:user-observable | |
| `augment/instrument.md` | procedure | mode:instrument | |
| `augment/experiment.md` | procedure | mode:experiment | |
| `augment/benchmark.md` | procedure | mode:benchmark | |
| `augment/profile.md` | procedure | mode:profile | |
| `augment/tune.md` | procedure | mode:tune | |
| `04-plan-<slice>.md` | writes | | |
| `04-plan.md` | writes | | |

`mode:design` rows apply when `design/_lane.md` says design is needed. An augmentation row applies when `augmentations-needed` of `02-shape.md` names its type (list it in `modes:`). A single-scope workflow writes only `04-plan.md`.

Before a plan step calls a dependency, framework or SDK, follow [_source-study.md](_source-study.md).

# Role
You run the plan stage: you write plans from the repo and the records, never product code.

# Workflow rules
Apply [_workflow-rules.md](_workflow-rules.md). `<wf>` below stands for `node "<skill-dir>/scripts/wf.mjs"`, with `<skill-dir>` per [_host-invocation.md](_host-invocation.md). Read and write every record per [_records.md](_records.md). Record every answer with `decide add` per [_decisions.md](_decisions.md). On a script answer with `ok: false`, follow the failure rule of [_host-invocation.md](_host-invocation.md).

# Step 0 — Orient (do this before all other steps)
1. The first argument is the slug; the dispatcher refuses a call without one. The second argument, when given, is a slice-slug or the word `all`.
   - When `03-slice.md` exists and the second argument is neither `all` nor a slice of its roster, write no plan file and stop: *"Unknown slice `<name>` in `<slug>`. Did you mean `<best-match>`? Retry: `/wf plan <slug> <best-match> <text>`"*. The best match has a Levenshtein distance of 2 or less, or is a substring.
2. Read the index with `<wf> record get "<root>" <slug> index`. Take `current-stage`, `status`, `selected-slice` and `open-questions`.
3. Check the prerequisites:

   | Finding | Do |
   |---|---|
   | `<wf> record get "<root>" <slug> 02-shape.md` exits 1 | Stop. Tell the person which command to run first. |
   | `record get` of `03-slice.md` exits 1 | A single-scope workflow: use single plan mode. |
   | A prerequisite shows `Status: Awaiting input` | Stop. |
   | `current-stage` is past plan | Say in chat that this is a re-run, and go on without asking: [_additive-write.md](_additive-write.md) snapshots the earlier revision and appends the `revisions:` ledger. |
   | The index shows `review-scope-confirmed: false` (the skip-to-plan path) | Run `<wf> record set "<root>" <slug> index review-scope-confirmed=true`, with `review-scope=slug-wide` in the same call unless `<wf> record list "<root>" <slug>` names a `07-review*` record. Ask nothing: there is one review per work packet. |

   Stack gate: Apply the plan column of the table in [runtime-adapters.md](runtime-adapters.md) → Stack gate.
4. When design is needed, use the design context:
   - Read `design/_design-context.md` for its design modes, laws and motion summary; its preflight, image and mutation sections govern `/wf design`. When the feature touches motion, interface detail or typography, also read `animate.md`, `polish.md` or `typeset.md`.
   - `02b-design.md` gives the design mode of each surface, the recommended references and the anti-goals.
   - `02c-craft.md` is the visual contract. Each `## Mock fidelity inventory` item becomes a plan step. When `screens:` is set, read the screen pages of the slice on the design surface; a step that builds a screen cites its screen key (`.ai/design/screens/<key>.html`, `design/_surface.md`). The `## Implementation contract` (tokens, components, motion specs) binds the plan; raise a conflict with it before implementation.
   - The design references are the union of `recommended-references:` in `02b-design.md` and `references-loaded:` in `02c-craft.md`, de-duplicated after you strip a trailing `.md`. Every UI plan step cites its reference as a pointer ("follow `design/typeset.md` for type scale") that resolves to `design/<name>.md`.
5. Design gate. Apply the human rule of [design/_lane.md](design/_lane.md): when design is needed and not settled, stop with `status: awaiting-input`, and route to `/wf design <slug>`. Plan never writes `02c-craft.md`. Write `## Design Components` per the `plan` duty of the lane.
6. Find the planning mode. Run `<wf> record list "<root>" <slug>` to see which plan records exist, then take the first row that matches:

   | | Arguments and records | Mode |
   |---|---|---|
   | a | `all`, and `04-plan.md` exists with linked per-slice plans | review-all |
   | b | `all`, and no plan exists | parallel plan |
   | c | a slice-slug with text after it, and `04-plan-<slice-slug>.md` exists | directed fix |
   | d | a slice-slug with no text after it, and `04-plan-<slice-slug>.md` exists | auto-review |
   | e | a slice-slug and no plan | single plan |
   | f | no second argument | Use `selected-slice` from the index. When it is missing and slices exist, choose the best first slice from `03-slice.md`, or ask the person. Then apply (d) or (e). |
   | g | no slices | Single plan mode for the whole shaped spec. When `04-plan.md` exists, auto-review (d). |

   In single plan mode (e), the text after the slice-slug is planning guidance. Record it with `decide add --key plan-guidance --stage plan --slice <slice-slug>`, give it to every research sub-agent as a directive of the person, ask no discovery question it answers, and cite it in `## Applied Learnings` or in the decision it settles.
7. Check the sibling plans: read the `## Sibling Plans` table in `04-plan.md`, or, when it is missing, the `files:` and `edges:` of each `04-plan-<slice-slug>.md`. Read a sibling plan in full with `<wf> record get "<root>" <slug> 04-plan-<slice-slug>.md` when one of these holds:
   - It shares a file with the `## Likely Files / Areas to Touch` of this slice, or with the files of the draft plan.
   - One of its `edges` touches such a file.
   - This slice lists it in `depends-on`.

   Repeat the check after the research, against the files of the draft plan. When this slice needs another slice built first, add the order: `node "<skill-dir>/scripts/campaign.mjs" slice-order "<root>" <slug> add --slice <this slice> --after <the other slice> --why "<the reason>"`.
8. Carry `open-questions` forward from the index.

# The run, in order
1. Take the planning mode of Step 0.6.
2. Run the mode:

   | Mode | Do |
   |---|---|
   | single plan | Run the [research](#research), the [discovery](#discovery) and the [augmentations](#augmentations). Write a minimal plan that a builder can run, as the draft of `04-plan-<slice-slug>.md`, and put it. Get the master `04-plan.md`, update it, write its draft and put it. |
   | parallel plan | Follow [Parallel plan mode](#parallel-plan-mode). |
   | directed fix, auto-review, review-all | Follow [Review-and-fix mode](#review-and-fix-mode). |

3. Evaluate the [Adaptive routing](#adaptive-routing). Write every viable option into the `recommended-routes` frontmatter.
4. Write the draft of each plan record, and put it.
5. Record the end of the stage: `<wf> record stage-done "<root>" <slug> plan [<slice-slug>]`. Give the slice for a plan of one slice, and no slice for a plan of every slice. The command writes `current-stage`, `progress.plan`, `next-command` and `next-invocation` (the default route, `/wf implement <slug> <slice-slug>`), and adds the plan records to `workflow-files`. When you chose another route, add `--next "<invocation>"`. Set any other index field with `<wf> record set "<root>" <slug> index key=value ...`.
6. Whenever a per-slice plan changes, rebuild the `## Sibling Plans` table of the master.

# Research
Launch the research sub-agents in parallel before you write the plan. Each has its own skip rule; do not skip one because the work looks trivial. Every finding cites file:line. Pass each block marked CONTRACT to the agent exactly.

### research sub-agent 1 — Affected Code Deep Dive
Charter: read every file in the `## Likely Files / Areas to Touch` of the slice. Report the modification surface (changed and new files, generated files included), the call graph in and out, the data flow through the affected path, the conventions of the area, and the integration surfaces (events, middleware, configuration, migrations). CONTRACT:

**Build-avoidance ladder.** For each capability the slice needs, climb these rungs and record the highest one that holds. Shape's Round 5 settled whether the scope exists; do not reopen it.
1. Stdlib or language built-in.
2. Native platform feature (runtime, browser, framework, OS); the web research sub-agent checks the official docs.
3. An installed dependency or an in-repo utility (the reuse scan below).
4. Minimum new code, with the reason that rungs 1 to 3 did not hold.

Pick the highest rung that meets the acceptance criteria; never trade a built-in that handles the edge cases for a hand-rolled one. Record each outcome in `## Simplicity Ladder`.

**Rung 3 — reuse.** Read the `## Goal` and `## Scope (In)` of the slice. For each new function, class, utility or capability, search the whole codebase for keywords, type names, domain terms, similar logic, and extensible base classes, mixins or higher-order functions. For each candidate, report the path and symbol; what it does and how closely it matches; whether a change to it stays backward-compatible; and a recommendation: reuse as is, reuse with a change, extract into a shared utility, or write fresh (with the reason). When nothing exists, write "No reuse candidates found for [capability]." Always report this section.

**Learnings scan.** Read `.ai/solutions/INDEX.md` when it exists. Match the goal and scope keywords of the slice against its hooks, load the matching files, and use their `tags:` for a second pass. When `.ai/sdlc-config.json` sets `solutions.globalDir` (default `null`), read the `INDEX.md` of that folder too; on a conflict, the repo corpus wins. For each match, report its path, the learning in one line, and what this plan does differently because of it; a learning that changes nothing is not a match. With no match, report "No applicable learnings found." The results go into `## Applied Learnings`.

**Repeat-deferral tripwire.** Read `runtime-evidence-deferrals` from the index (`<wf> record get "<root>" <slug> index`). It fires when the defer-reason of an entry matches an environment dependency that the `## Verification Strategy` of this slice will also name: the same credential wall, device class or missing service. Then:
1. Classify the wall again; never inherit the verdict of the earlier entry. Ask the triage question of the ladder ([runtime-adapters/_ladder.md](runtime-adapters/_ladder.md) → *Classify the wall before you climb it*): would a change to code in this repo dissolve it? Record `wall-ownership: code-owned | environment-negotiable | external`. A `code-owned` wall cannot take `harness-declined` on grounds of environment: scope it, or decline it as a deliberate refusal to fix reachable code.
2. Cost the wall. Under the row of the criterion, write `wall-cost: retire ≈ <effort> | carry = <N> deferred AC across <M> slice(s) riding "<clearing event>"`. `harness-declined:` is allowed only after this line.
3. Scope the harness that retires the wall (the prerequisite-slice option of the force-scope rule), or record the person's explicit decision not to, as `harness-declined: <reason>` under the row of the criterion. Silence does not comply.

### research sub-agent 2 — Second Domain
Launch it only when the slice touches a second distinct domain (frontend and backend, an API and a worker). Charter: map the conventions of that domain, the API surface between the domains, where the contract is defined, and what a contract change spreads to.

### research sub-agent 3 — Test & Verification Infrastructure
Charter: report the test frameworks and their configuration; the coverage of the touched modules and its gaps (run the affected tests when you can, and report the pass, fail and skip counts); the helpers, factories, fixtures and mocks that new tests reuse; and the assertion, mocking and async patterns in use. CONTRACT:

**Interactive and visual verification tooling.** Read the `stack:` block from the index (`<wf> record get "<root>" <slug> index`). Intake Step 0.5 wrote it, and the person confirmed it in Batch B. Do not derive recommendations again from a repo scan, and propose no new tool without going back through shape. Describe how the tooling of `stack:` is wired into the verification of this slice:
1. Quote `stack.platforms`, `stack.testing`, `stack.observability`, and the relevant entries of `stack.available-skills` and `stack.available-mcp` unchanged. When `stack-source: unconfirmed-auto-detect`, note that the tooling assumptions are advice only.
2. For each platform in `stack.platforms`, find the matched adapter in [runtime-adapters.md](runtime-adapters.md), read its `runtime-adapters/<key>.md`, and confirm that the verification of the slice uses its drivers. For example, `platforms: [web]` with `stack.testing: [playwright]` gives the in-repo Playwright suite; `[android]` with `[maestro]` gives the existing `.maestro.yaml` flows and the listed companion skills.
3. When a criterion needs a capability that `stack:` does not cover, do not recommend an install and do not leave it to verify. Record its resolution in `## Verification Strategy`: (a) add it to the stack, which routes back through shape; or (b) authorize an install at verify time, as an install step that the person approved and verify runs.
4. Record the exact dev or preview command (`npm run dev`, `./gradlew installDebug`, `xcodebuild`, …) from the build manifest.
5. Report which criteria need interactive verification, and how the confirmed stack covers each. A criterion that needs tooling outside `stack:` is a blocker, not a gap to fill.

Do not ask the driver question of shape again: follow the person's answer, and route back to shape when it is missing.

### Web research sub-agent — Dependencies & External Knowledge
Launch it for every slice. Skip it only when one of these holds: a pure refactor with no dependency change and no new API surface; configuration or environment changes only; or text, copy or i18n changes only. Charter: report the versions, deprecations and breaking changes of the touched dependencies; the patterns of the official docs against the codebase; CVEs and known bugs; and the gotchas the steps must handle. Every claim names its source. CONTRACT: before you endorse a new dependency or a hand-rolled implementation, search the standard library and the platform and framework docs for a built-in (ladder rungs 1 and 2), and report one when it exists.

Merge all findings into `## Current State`, `## Likely Files / Areas to Touch` and `## Freshness Research`.

# Augmentations
Write the augmentations after the research. Read `augmentations-needed` from the frontmatter of `02-shape.md`; when it is absent or `[]`, skip this section. Run the artifact-writing mode of each type, in this order: `instrument`, `experiment`, `benchmark`, `profile`, `tune`. Each one has one record for the whole workflow: when its record exists (`record get` exits 0), do not write it again, but read it and fold its content into the steps of this slice.

| Type | Do |
|---|---|
| `instrument` | Write `04b-instrument.md` per `augment/instrument.md`. Fold the signals into the plan steps. |
| `experiment` | Write `04c-experiment.md` per `augment/experiment.md`. Fold the flag and cohort wiring into the plan steps. |
| `benchmark` | Capture the baseline into `05c-benchmark.md` per `augment/benchmark.md` in baseline mode. Add a "compare after implement" step for verify. A second slice adds its targets to the existing baseline; it never runs again a baseline that has a comparison. |
| `profile` | When shape flagged a hotspot, run [augment/profile.md](augment/profile.md) on it, and add a plan step that acts on the hotspot it finds. |
| `tune` | Run the feasibility spike of `augment/tune.md`: write `05d-tune.md` with its baseline, and plan the rounds as steps. |

Each augmentation reference registers its entry in `augmentations:` of `00-index.md` with `status: ready`.

# Parallel plan mode
For `all` with no plans:
1. Write the augmentations first, in this session, before you launch the agents. Each agent folds them into its steps and writes none.
2. Launch one sub-agent per slice. Give each the slug, its slice-slug, the content of `03-slice-<slice-slug>.md` and `02-shape.md`, the draft path `<wf-dir>/.draft/04-plan-<slice-slug>.md`, and the other slice-slugs. Each prompt carries the line `Prompt-fed inputs: 02-shape.md, 03-slice-<slice-slug>.md`, and includes [Step F](#step-f--the-files-and-edges-of-the-plan) unchanged, with every reference path resolved to an absolute path per [_host-invocation.md](_host-invocation.md).
3. Each agent runs the four research playbooks for its slice, writes its plan to its draft path with the `files:` and `edges:` of Step F, and runs `<wf> record put "<root>" <slug> 04-plan-<slice-slug>.md`. It never writes `04-plan.md`.
4. Wait for all of them, and read every plan with `<wf> record get "<root>" <slug> 04-plan-<slice-slug>.md`.
5. Run the cohesion check: shared files, ordered migrations, shared fixtures, breaking API changes, and configuration that interacts.
6. Run the [discovery](#discovery) once, for the decisions that cut across the slices.
7. Write the draft of the master `04-plan.md`, and put it. Only you write `04-plan.md`. On severe cohesion issues, recommend `/wf slice`.

# Discovery
Run it for new plans only; the review-and-fix modes skip it.
- Ask the implementation decisions that shape and slice left open, as gate questions per [_gate-question.md](_gate-question.md) and [_question-craft.md](_question-craft.md): up to 4 per round, in as few rounds as you can.
- Each question cites the files, patterns and trade-offs that the sub-agents found, and offers approaches that differ. Do not ask again a decision of shape or slice.
- Cover the approach, the sequencing, the test strategy, and the risks (deprecations, advisories, shape assumptions that the code contradicts).
- Record every answer with `decide add --stage plan`.
- A planning decision that goes against an intent-risk is intent-bearing, per rule 1 of [_decision-classes.md](_decision-classes.md).

# Review-and-fix mode
An existing plan was called again. Follow [_additive-write.md](_additive-write.md): the body stays the current truth, with no `## Revision N` section. Every change gets a snapshot (the `record get` output before the edit, in `history/04-plan-<slice-slug>-<rev>.md`), one `revisions:` entry and a raised `revision-count`. A plan that does not change gets neither.

| Mode | Do |
|---|---|
| Directed fix (`/wf plan <slug> <slice-slug> <feedback text>`) | 1. Read the plan in full with `<wf> record get "<root>" <slug> 04-plan-<slice-slug>.md`, and parse the feedback. 2. When it changes which files or patterns matter, inspect the code again with research sub-agents. 3. Apply it precisely and keep what is still correct; start over only when it rejects the whole plan. 4. Ledger: `trigger: review-feedback`, `because:` the feedback cut to a phrase, `changed:` what moved. 5. Check the cohesion with the sibling plans again. 6. When the strategy or the key risks changed, update the master `04-plan.md`. 7. Write the draft of the plan, and put it. |
| Auto-review (`/wf plan <slug> <slice-slug>`, the plan exists, no feedback) | 1. Read the plan in full with `record get`. 2. Dispatch one review sub-agent with a fresh context, as review-all does per slice. It reads the plan, `03-slice-<slice-slug>.md`, `02-shape.md` and the sibling plans that Step 0.7 selects, inspects the code again, and returns issues with a severity: drift from the current code, misalignment with the acceptance criteria, overengineering that the build-avoidance ladder rules out, and conflicts between plans. 3. Fix them. Ledger: `trigger: manual`, `because: "auto-review — {count} issues found"`. 4. When anything changed, update the master. 5. Write the draft of the plan, and put it. With no issues, write no draft, so the record stays as it is, and report "Auto-review: no issues found. Plan is current." |
| Review-all (`/wf plan <slug> all`, plans exist) | 1. Read `04-plan.md` and every `04-plan-<slice-slug>.md` with `record get`. 2. Launch one review sub-agent per slice, in parallel; each reads its plan, its `03-slice-<slice-slug>.md` and `02-shape.md`, inspects the code of its scope again, and returns its issues or "no issues". 3. Wait for all, and run the cohesion check across the plans. 4. Fix every issue; ledger each changed plan with `trigger: manual`, `because: "review-all pass"`. 5. Update the master `04-plan.md`. 6. Write the draft of each changed record, and put it. In the chat return, list which plans changed and which were clean. |

# Adaptive routing
Write every viable option as one `recommended-routes` entry, with its reason:

| Option | Invocation | When |
|---|---|---|
| A: Implement (default) | `/wf implement <slug> <slice-slug>` | The plan is complete. Recommend a compaction first. |
| B: Implement all, in sequence | `/wf implement <slug> <first-slice-slug>` | Every slice is planned. |
| C: Revisit slice | `/wf slice <slug>` | The slice boundaries are wrong. |
| D: Revisit shape | `/wf intake <slug> shape` | The spec is incomplete or contradicts itself. |

# Chat return contract
After you write the files, return per [_chat-return.md](_chat-return.md): lead with the narrative (section *The narrative*), then the receipt: `slug:`, `wrote:` (every plan file), `options:` (every viable next option of Adaptive routing), and at most 3 blocker bullets, when needed.

# Artifacts

`04-plan.md` (the master index). Frontmatter: `schema: sdlc/v1`, `type: plan-index`, `slug:`, `status: complete`, `stage-number: 4`, `created-at:`, `updated-at:`, `planning-mode: <single|all>`, `slices-planned:`, `slices-total:`, `implementation-order: [<slice-slug>, …]`, `conflicts-found:`, `tags: []`, `refs:` (`index: 00-index.md`, `slice-index: 03-slice.md`), `next-command: wf-implement`, `next-invocation: "/wf implement <slug> <first-slice-slug>"`, `recommended-routes:` (Option A `/wf implement <slug> <first-slice-slug>` with `default: true`; Option C `/wf slice <slug>` when cohesion issues exist). Body: `# Plan Index`, then:
- `## Sibling Plans`: one row per existing `04-plan-<slice-slug>.md`: `| Slice | Files | Edges | Depends on |`. Files lists each `files[].path` of its frontmatter, Edges each `edges[]` entry as `from → to (kind)`, and Depends on copies the `depends-on` of the slice from `03-slice.md`.
- `## Slice Plan Summaries` (for each slice: the strategy and the key risk), `## Cross-Cutting Concerns`, `## Integration Points Between Slices`, `## Recommended Implementation Order` (with the reasons), `## Conflicts Found`, `## Freshness Research`.

`04-plan-<slice-slug>.md` (the per-slice plan). Frontmatter:

```yaml
---
schema: sdlc/v1
type: plan
slug: <slug>
slice-slug: <slice-slug>
status: complete
stage-number: 4
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
metric-files-to-touch: <N>
metric-step-count: <N>
has-blockers: false
revision-count: 0
revisions: []   # reason-centric ledger per _additive-write.md; one entry per re-run that changed the plan
tags: []
files: []      # Step F: each file that the plan changes
edges: []      # Step F: each cross-file link that the change depends on
stack-source: <confirmed|unconfirmed-auto-detect>   # from 00-index.md stack.user-confirmed; downstream stages may refuse `unconfirmed-auto-detect`
refs: { index: 00-index.md, plan-index: 04-plan.md, slice-def: 03-slice-<slice-slug>.md, siblings: [04-plan-<other>.md], implement: 05-implement-<slice-slug>.md }
next-command: wf-implement
next-invocation: "/wf implement <slug> <slice-slug>"
recommended-routes:            # Adaptive routing options A–D, when applicable
  - invocation: "/wf implement <slug> <slice-slug>"
    reason: "<one phrase>"
    default: true
---
```

Body sections, in order:
- `# Plan: <slice-name>`, then `## Current State`.
- `## Simplicity Ladder`: from the ladder of sub-agent 1, one row per capability: `<capability> → rung 1 stdlib | rung 2 native-platform | rung 3 reuse | rung 4 new-code — <API / path / recommendation>`. A rung 3 row carries `path` → `symbol()`, the match quality and the recommendation; a rung 4 row says why rungs 1 to 3 did not hold. With no new capability code: "No new capabilities — ladder N/A."
- `## Applied Learnings`: one entry per matched learning (the path, the learning in one line, what this plan does differently), or "No applicable learnings found." The outcomes of the repeat-deferral tripwire go here too: the repeated wall, and either the harness scoped into the steps or the recorded `harness-declined: <reason>`.
- `## Likely Files / Areas to Touch`: `path/or/module: why`.
- `## Proposed Change Strategy`. When an NFR is the reason for a mechanism choice, quote its charter ranking from the `## Non-Functional Requirements` of `02-shape.md` (`yields-to: C<n>` or `outranks: C<n> (PO-ratified)`). An unranked NFR that narrows a charter commitment is intent-bearing: classify it per [_decision-classes.md](_decision-classes.md) and route it to the person; on an autonomous run it is a stop condition.
- `## Design Components`, only when design is needed: the components of `## Component map` that the slice uses, and the component delta, per [design/_lane.md](design/_lane.md). A component of `components-to-build:` gets its own plan step, before the first screen that uses it.
- `## Step-by-Step Plan`: one numbered item per step, in work order. Each step names its files and its done check (the command or observation that shows it is done): `` 1. **<title>** — files: `<path>`. Done when: `<command>` passes. `` A slice has fewer than 40 steps; at 40 or more, route back to `/wf slice <slug>`.
- `## Packet Checks`: each check that is too slow for a slice step (the Card), with its pilot measurement for a long run. The review runs each one once for the packet.
- `## Handover` (required): the exact files and symbols to change (`path` → `symbol()`), the test command, and the decisions already made, each with its source.
- `## Verification Strategy`: see [Verification Strategy](#verification-strategy) below.
- `## Test / Verification Plan`:
  - `### Automated checks`: lint and typecheck, unit, integration.
  - `### Interactive verification (human-in-the-loop)`: for each user-observable criterion, the exact drive: what to verify; the platform and tool, from `stack.platforms` and the person's selection at shape (name it exactly, for example "Android — Maestro flow `flows/auth.maestro.yaml` + `lazylogcat`"); the companion skills from `stack.available-skills`; the steps (the exact commands to run the app, navigate and observe; bootstrap commands match the runtime adapter); the evidence capture, per the layout of the matched adapter in its `runtime-adapters/<key>.md` file; and the pass criteria.
  - Bring in no driver, screenshot tool or skill outside `stack:`: a missing capability is resolved in `## Verification Strategy`, never on the fly. A criterion that needs tooling outside `stack:` gets a `## Blockers` entry and routes back to shape. With no interactive verification, write "Automated only — [reason]".
- `## Risks / Watchouts`, `## Dependencies on Other Slices`, `## Assumptions`, `## Blockers`, `## Freshness Research`. Write no `## Revision History`; the revisions live in the `revisions:` ledger.

## Verification Strategy
Write one row per user-observable acceptance criterion, so that verify runs a plan instead of improvising past a wall. Take the acceptance criteria and their `verify:` stubs from `03-slice-<slice-slug>.md`. With no user-observable criterion, write "No user-observable AC — automated only."

| AC | Tool / method + ladder rung | Environment need — satisfiable in target env? | What must be built to make it verifiable | Fallback chain |
|----|------------------------------|-----------------------------------------------|------------------------------------------|----------------|
| `<id / text>` | `<tool>` (`<rung>`) | `<device/browser/creds/OS>` — `<yes / needs install / needs creds>` | `<fixture / data-testid / emulator config / test hook>` | `<next rung>` → … → pre-registered deferral |

- The rung is a rung of the constraint-resolution ladder ([runtime-adapters/_ladder.md](runtime-adapters/_ladder.md)), with the concrete tool. Static reasoning, a mock or a unit test alone never satisfies a user-observable criterion.
- The target environment is `stack:` of `00-index.md` and the Observation Model of shape.
- Each seam that makes the criterion observable (a seeded fixture, a deterministic clock, a `data-testid`, an emulator config, an exported test hook) is also a task of `## Step-by-Step Plan`.
- The fallback chain ends in an explicit deferral registered in advance.

**Force-scope rule.** A named wall is an engineered wall. Before the plan completes, each environment dependency on the critical path of a user-observable criterion (credentials, a device, an external service, an inbound callback, a deploy target, missing infrastructure) resolves to exactly one `constraint-resolution:` line, in a list per criterion under the table:

| Line | Means |
|---|---|
| `constraint-resolution: prerequisite-slice: <slug>` | A prerequisite slice or harness is scoped into the slug (TURN provisioning, an emulator debug build variant, a seeded-fixture harness). The harness is implementation work: add its tasks to `## Step-by-Step Plan`, or route back to slice. |
| `constraint-resolution: proxy+deferral: <named clearing event>` | A lower-rung proxy criterion that verify can evidence now, plus a deferral written in advance whose clearing event becomes its `cleared-by` target. The clearing event is an act someone can perform, not a state someone must wait for: write the actor and the act ("after slice `X` lands the configurable-port change, run `/wf probe <slug>` against any free port"). |
| `constraint-resolution: po-accepted: <reason>` | The person explicitly accepts the risk. Record it here, and with `decide add --stage plan`. |

- Each line carries `wall-ownership: code-owned | environment-negotiable | external`.
- A `code-owned` wall cannot take `proxy+deferral`. When the source of the repo pins the constraint, dissolve the wall with `prerequisite-slice`, or refuse it on the record with `po-accepted`; never park it behind a clearing event.
- "Known limitation — document at handoff" is not allowed wording while a criterion depends on the limitation.
- This is a hard gate: while a named dependency has none of the three lines, the plan is not complete. Before you write the artifact, ask a gate question per [_gate-question.md](_gate-question.md): scope the harness, write the proxy and deferral, or accept the risk. Verify's Step 0 refuses an unresolved wall (`blocked-runtime-evidence-missing`, with no deferral hatch).

Four more rules:
- **An outcome metric needs a pre-deploy proxy:** a fixture-corpus assertion that verify can hold now, with the live metric as the clearing event of the deferral.
- **A mandated mitigation is never proved by code alone.** A fallback, escape hatch or kill switch that the shape mandates traces to a criterion that exercises the wired path (fault injection, a forced fallback, a flag flip). Add the seam (an injection hook, a forced-error fixture, a flag toggle) as a plan task.
- **Tooling resolution.** When a `verify:` stub of the slice names a tool that is not in `stack:`, the person decides here: add it to the stack (`/wf intake <slug> shape`, which records it in `stack:`), or authorize an install at verify time, recorded as an approved install plus a verification-seam task. When the person declines both, re-scope the criterion or register a deferral in advance; never a `pass` by static reasoning.
- When no verification path exists for a user-observable criterion, route back to slice or shape before any code is written.

## Step F — The files and edges of the plan
Each per-slice `04-plan-<slice-slug>.md` carries `files:` and `edges:` in its frontmatter. The master `## Sibling Plans` table and the plan freshness check of the yolo driver read them. A plan that changes no file sets `files: []` and `edges: []`.

- `files:`: one entry for each file that the plan changes: `path` and `status` (`new | modified | deleted | external`).
- `edges:`: one entry for each cross-file link that the change depends on: `from`, `to`, and `kind` (`import | replaces | calls | extends | crosses-service`). An edge names files.

Do not write `modules`, `loc`, `delta`, `imports`, `planned_change`, `history` or `lanes`; older plans carry them.
