---
description: Turn the intake brief into a compact implementable mini-spec with explicit acceptance criteria and edge cases.
argument-hint: <slug> [focus area]
---

Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output this operation produces.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf shape`, **stage 2 of 10**: 1·intake → `2·shape` → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro.

| | Detail |
|---|---|
| Requires | `01-intake.md` |
| Produces | `02-shape.md` + (when `stack.ui ≠ ∅` and the work has visual surface) `02b-design.md`, the **design brief** |
| Next | `/wf slice <slug>` (default) |
| Skip-to | `/wf plan <slug>` if the shaped spec is a single coherent unit that does not benefit from slicing |

**Design brief ownership.** When the work has UI surface, shape authors `02b-design.md` (Step 5a). `plan` later resolves the visual-direction gates and authors `02c-craft.md`; `implement` builds against it.

**Auto second opinion.** Once the mini-spec is drafted and before writing `02-shape.md`, auto-invoke `/consult codex <critique these acceptance criteria, edge cases, and scope>` (pinning `codex`/`claude` keeps it free) when a spec error would be expensive to unwind: a new capability or externally-observable surface, more than one slice, or any `intent-risk` (RIM) carried in from intake. Fire it rather than offering it in next-steps; skip it only for a single-slice, internal, low-risk tweak.

# Role
You are a workflow orchestrator, not a problem solver.
- Do not design, architect, implement, or code the solution. Produce a mini-spec with acceptance criteria.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.
- Your only output is the workflow artifacts and the chat return defined below.
- If you catch yourself solving the problem, STOP and return to the next unfinished step.

# Workflow rules
Apply [_workflow-rules.md](_workflow-rules.md). Gate questions here cover risk tolerance, appetite, and structured decisions; behavior, acceptance criteria, and non-goals take freeform chat.

# Step 0 — Orient (do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). If none, infer from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`, `appetite`.
3. **Check prerequisites:**
   - `01-intake.md` must exist. If missing → STOP: "Run `/wf intake` first."
   - If `01-intake.md` shows `Status: Awaiting input` → STOP. Tell the user to resolve open intake questions first.
   - If `current-stage` is already past shape, note the re-run in chat and proceed. [_additive-write.md](_additive-write.md) snapshots the prior revision and appends the `revisions:` ledger; no permission question is needed.
4. Read `01-intake.md` and `po-answers.md`. Carry forward `selected-slice-or-focus` and `open-questions` from the index.

# Step 1 — Launch research agents (launch before the interview so results are back by Step 3)

**Sub-agent 1 (codebase) launches ALWAYS.** **Sub-agent 2 (web search) launches unless ALL of the
following skip criteria hold** — this is the single place the skip criteria are stated:
- Zero new external dependencies; no new API surface, no version changes
- Not security-sensitive (auth, tokens, crypto, CORS, CSP, input sanitization)
- No browser/platform APIs (Web APIs, mobile OS APIs, CSS features)
- No external API integrations (REST, GraphQL, OAuth, webhooks, third-party SDKs)

**When in doubt: launch sub-agent 2.** Web search is fast and frequently surfaces breaking changes,
CVEs, and better patterns before implementation begins. Add more agents for cross-domain work.

### research sub-agent 1 — Codebase Architecture & Integration Surface

Charter (a goal, not a script): map the codebase surface this work touches — module structure and entry points; the conventions the affected area follows (naming, error handling, dependency wiring, configuration, logging); integration surfaces in and out (callers, callees, events, middleware); the primary data flow with its models and serialization boundaries; and the test structure with the coverage gaps relevant to this work. Every finding cites file:line.

**Start from intake's map — do not re-derive.** If `01-intake.md` carries `## Affected Areas (preliminary)`, open the sub-agent prompt with it unchanged and the instruction: *"Start from this preliminary map; verify and deepen it — do not re-derive what it already establishes."*

**Interactive & visual verification tooling (REPORTING ONLY — the PO question belongs to the orchestrator, Step 3).** Drive this block from the `stack:` fingerprint in `00-index.md` and [runtime-adapters.md](runtime-adapters.md). The sub-agent reports adapters, drivers, and candidates with fit rationale; it does not pick a tool and it does not ask the PO anything.
1. **Re-read `stack:`** from `00-index.md`. If missing or `user-confirmed: false`, note it as an open question and propose re-running intake; do not silently re-detect.
2. **Match `stack.platforms` to runtime adapters.** Report each matched adapter and detected drivers, installed ones first, additions-to-install last. The adapter registry is the source of truth; for example `[web]` → in-repo Playwright/Cypress > Chrome MCP if session-available > `dev-browser`. Cross-reference `stack.available-skills` for companion skills.
3. **Cross-reference the session catalog.** From `stack.available-skills` and `stack.available-mcp`, list anything mapping to this task as **candidates** with a one-line "why this fits", not selections.
4. **What is already wired in.** Note dev servers, emulator AVDs, simulator configs, screenshot/regression tools, and manual smoke scripts under `docs/`, `scripts/`, `testing/`, `QA/`.

### research sub-agent 2 — External Dependencies & Freshness

Charter: report the external picture this work depends on — the touched dependencies' current vs. latest versions with deprecations and breaking changes; official-doc recommended patterns vs. what the codebase does; security advisories and CVEs; known bugs, gotchas, anti-patterns, and performance traps for this feature type; and any RFCs, platform guidelines, or accessibility standards that prescribe behavior. Every claim names its source; findings that should shape acceptance criteria or edge cases are flagged for the synthesizer.

**Start from intake's freshness pass — verify and extend, do not repeat.** If `01-intake.md` carries `## Freshness Research` entries, open the sub-agent prompt with their takeaways unchanged and the instruction: *"These are intake's freshness findings; verify they still hold and extend into what they did not cover — do not re-research what they already establish."*

Merge all sub-agent findings into the stage file under `## Affected Areas`, `## Dependencies / Sequencing Notes`, and `## Freshness Research`. Best-practice and gotcha findings directly inform acceptance criteria and edge cases.

# Step 2 — Discovery interview (ambiguity inventory first, then the rounds)

Interview the user to surface the decisions, assumptions, and unknowns the intake brief left ambiguous: **20 baseline questions — a floor, not a ceiling**, extended while unresolved decision points remain (Step 2.4).

## Step 2.1 — Author the Ambiguity Inventory (before Round 1)
Harvest every ambiguity, unstated assumption, and unclear-context item from `01-intake.md`, `po-answers.md`, intake's `## Affected Areas (preliminary)` (if present), and any research already returned. Write them into the artifact-in-progress as `## Ambiguity Inventory`, one line per item with a stable id and a source pointer:
```
- **AMB-1** — <one-line ambiguity or assumption statement> — source: 01-intake.md#<section>
```
The inventory is the interview's coverage instrument and a living list: add entries as later rounds or late research surface new ambiguities.

## Step 2.2 — Interview rules

- Ask 20 baseline questions as gate questions per [_gate-question.md](_gate-question.md), batched into as few rounds as the dependency structure allows (a question that builds on an earlier answer waits for it; independent questions share a round). The five themes below organize coverage, not round boundaries. 20 is a floor, not a ceiling — after the themes are covered, apply the extension rule.
- **Question accountability:** every question names, in `## Questions Asked This Stage`, the `AMB-n` item(s) it closes or confirms. Assumption-confirmation questions are first-class closers: pre-fill your understanding and ask the PO to confirm or revise; a confirmed assumption closes its item.
- When open ambiguities are fewer than the remaining budget, spend the remaining questions confirming assumptions and probing the consequences of earlier answers ("you chose X in Round 2 — that implies Y in the empty state; confirm?"), never invented decoys. Padding = a question that closes or confirms no inventory item; the floor is satisfied by closing and confirming, not inventing.
- Every question is about *this specific feature*: reference it by name with concrete details from the brief. Options represent genuinely different directions, feature-specific where possible. If intake already answered a question, pre-fill and ask to confirm or revise.
- Wait for each round's answers before generating the next round; later questions build on earlier answers.
- Construct each question per [_question-craft.md](_question-craft.md). `question` names the feature ("What should the export modal show when the user has no reports yet?"); `header` is at most 12 chars; `options` are 2–4 concrete directions ("Other" is always available); `multiSelect` is true only when options can coexist.

## Step 2.3 — The rounds
- **Round 1 — What does the feature do?** Core interaction: the action the user takes, the input they provide, what they get back, what triggers use.
- **Round 2 — How does the feature behave?** Dynamics: what happens after the main action, reversibility, timing model (sync/async/real-time), connections to other parts of the product.
- **Round 3 — What does the feature look like?** Surface area: where it lives (page, modal, inline, CLI), data volume, the distinct states the user sees (empty, loading, error, success), whether it follows or breaks existing patterns.
- **Round 3b — Visual direction (CONDITIONAL — only when `stack.ui ≠ ∅` AND the work has visual surface).** 4 questions: **register** (utilitarian / expressive / editorial), **color strategy** (inherit the palette, or a distinct treatment?), **reference points and anti-goals** (what is this like, and what must it NOT look like?), and **state inventory** (which of empty / loading / error / first-run carry design weight?). These are the inputs `02b-design.md` needs (Step 5a); they ride ON TOP of the 20-question floor so design never eats the general budget. Skip entirely for non-UI work.
- **Round 4 — What can go wrong?** Failure modes: worst-case impact of bugs, invalid-input handling, dependency failures, access and permissions.
- **Round 5 — Where are the boundaries?** Lead with scope restraint: which parts of the brief v1 *actually* needs versus speculative generality, gold-plating, or "while we're here" scope. Present these as trim options the PO chooses, never a unilateral cut ("do you actually need X, or does Y cover it?"). Then: explicit out-of-scope, the transition from old to new behavior, existing code and data touched. Never trim what the user explicitly asked for, and never trade away a non-functional requirement (security, accessibility, data integrity) for a smaller scope.

## Step 2.4 — Extension rule (extend while ambiguity blocks, never pad)
After Round 5, inventory what is still unresolved. A decision point qualifies for an extension round only if leaving it open would block slicing, make an acceptance criterion unverifiable, or force plan/implement to guess a direction the PO should choose. If any qualify, run up to 2 additional rounds (up to 4 questions each) targeting ONLY those points; each extension round's lead-in says which unresolved point each question closes. Stop the moment nothing qualifying remains. Anything still unresolved after 2 extension rounds goes to `## Unknowns / Open Questions` (and `status: awaiting-input` if it blocks the spec), not more rounds.

## Step 2.5 — Coverage gate (before leaving Step 2)
Walk the `## Ambiguity Inventory`. Every `AMB-n` item is now in exactly one of three states:
- **closed** — an interview answer resolved it (name the question/answer);
- **extension-targeted** — an extension round closed it (same);
- **parked** — it appears in `## Unknowns / Open Questions` with the receiving stage named (and `status: awaiting-input` if it blocks the spec).

An inventory item in none of those states is ILLEGAL; the interview may not end while the ambiguity space has an uncovered corner. After the interview (five themes + Round 3b when triggered + extension rounds), append every answer to `po-answers.md` with timestamp and `stage: shape`.

# Step 3 — Collect research; relay the tooling question to the PO

1. **Collect the sub-agent results.** If they have not returned, WAIT; the findings are a hard input to `## Verification Strategy` and to the tooling question.
2. **Relay the tooling question (the orchestrator owns it, never a sub-agent).** From sub-agent 1's tooling report, ask the PO ONE gate question per [_gate-question.md](_gate-question.md) built from the actual findings: *"For verification, the available drivers are A, B, C. Companion skills: X, Y. Any preference, or any off-limits?"* Construct it per [_question-craft.md](_question-craft.md); capture the answer in `po-answers.md`. Acceptance criteria reference *whatever the PO chose*, not a baked-in default.
3. **Fold late findings into the inventory.** New ambiguities become `AMB-n` entries; if any qualify under Step 2.4, run the extension round(s) now; the coverage gate (Step 2.5) applies to them too.

# Step 4 — Synthesize the mini-spec
Synthesize the discovery answers into a behavior-focused mini-spec (the artifact body sections below).

# Step 5a — Author the design brief (when `stack.ui ≠ ∅` and the work has visual surface)
If `00-index.md` shows a UI/frontend layer **and** this work introduces meaningful visual surface (new screens, components, states, or a redesign), author `02b-design.md` now per [design/shape.md](design/shape.md). Round 3b gathered the inputs (register, color strategy, references/anti-goals, state inventory); fold them in and ask only what Round 3b did not cover. Write it as plain discovery: register, color strategy, scene sentence, anti-goals, state inventory, recommended references. Do not generate image probes and do not run a visual-direction confirm gate here; those belong to `plan`, which resolves the image gate and authors `02c-craft.md`. Leave `image-gate` unset in `02b-design.md` (the field accepts only `pass`/`skipped:*`); unset marks the gate unresolved for `plan`. If `stack.ui` is empty or there is no visual surface, skip this step. See `design/_design-context.md` for register determination and shared design laws.

# Step 5b — Author the Charter Scenario (when the work has a core interaction loop)
If the work has a **core interaction loop** — numbered in the intake's Restated Request, **or derivable from its prose** (an unnumbered loop does not exempt shape: derive it) — author `## Charter Scenario`: the loop as ONE scripted end-to-end scenario, each step carrying an **observable checkpoint** a human or tool could confirm ("goal entered → probe question shown that references the stated goal → answer captured → …").

**Skipping is a declaration, never a silence.** If the work has no core loop (pure library change, internal refactor, no user-facing flow), set frontmatter `charter-scenario: "none — <reason>"` and omit the section. Otherwise set `charter-scenario: authored`. The key is REQUIRED either way; compressed intake modes skip both the key and the section.

# Step 6a — Documentation plan (Diátaxis)
Classify the documentation this feature needs: new API surface or config → **reference**; user-facing behavior → **how-to guide**; a major new capability for new users → **tutorial**; architectural decisions or trade-offs → **explanation**; a significant change to project capabilities → **README update**. Write the classification into `## Documentation Plan`: for each doc, its type, audience, what it must cover, and what it must NOT cover. If no user-facing docs are needed (internal refactor, test-only change), write "None required" with reasoning.

# Step 6b — Augmentation plan (perf / observability / rollout)
Classify whether this work needs any of the four and record the decision so `plan`/`implement`/`verify` honor it:
- **instrument** (observability): a new flow that could fail silently, or whose adoption/latency matters → dark-path detection + signal design; artifact `04b-instrument.md`.
- **experiment** (rollout scaffolding): risky enough to want A/B, a feature flag, or a canary with metrics + rollback → artifact `04c-experiment.md`.
- **benchmark** (perf baseline+compare): a hot path, data-structure change, or rendering loop → baseline before implement, compare after; artifact `05c-benchmark.md`; regression tripwires >10% CPU / >25% memory.
- **profile** (ad-hoc hotspot): a specific known hotspot → flag the area so `plan` can schedule it, or reach for it later via `/wf probe`.
- Fold 1–2 questions into the discovery interview (*"Is any part of this perf-sensitive? Is the rollout risky enough for a flag/canary? Is there a behavior change worth instrumenting in production?"*). Ask only what the interview did not answer.
- Write the result into `## Augmentation Plan` and set `augmentations-needed:` in frontmatter. REQUIRED even when the answer is none: write `augmentations-needed: []` and a one-line reason.

# Step 7 — Evaluate adaptive routing
Evaluate the options under "Adaptive routing" below and write ALL viable options into `## Recommended Next Stage`.

# Step 8 — Update the index
Update `00-index.md` with the recommended default option.

# Step 9 — Adversarial pre-mortem (the RIM generator — a BLIND sub-agent, run BEFORE 9a)
Before adjudicating the ledger, run one adversarial pre-mortem pass **in a fresh sub-agent whose inputs are `01-intake.md` + `po-answers.md` ONLY. Do not give it the draft `02-shape.md` or any of this run's decisions.** The generator derives its *own* expectation of what the product should be and writes post-mortems against that, so it cannot rationalize decisions it never saw. Prompt it: *"It is N weeks later and the shipped product betrayed its intake; write the two most likely post-mortems."* Scale N to the appetite (`00-index.md` `appetite:`: a week for small, a quarter for large). Each post-mortem names a **specific** way the build could drift from what the PO asked — a narrowed capability, an inverted control authority (deterministic code owning what the intake assigned the model/agent), a deferred wall that never cleared.

**Adjudicate the returns (the orchestrator, who DOES know the draft shape):** a risk the draft already handles is dismissed *with the citation* (the artifact section that handles it); a risk it does not handle **converts to a RIM entry** on `00-index.md` `intent-risks` (`status: open`, `severity` by blast radius). A pre-mortem that surfaces an already-ledgered risk confirms it. Step 9a adjudicates intake-authored and pre-mortem-authored RIMs alike.

**Consult pre-mortem (objective auto-trigger — consult is always available, no config gate).** Auto-dispatch the same blind pre-mortem prompt to `/consult codex …` (pinning `codex`/`claude` keeps it free) when ANY of: a `severity: high` RIM exists on the ledger; more than one slice is expected; or the "Auto second opinion" trigger already fired this run (batch the two consults into one panel call when so). Fold the panel's distinct risks in through the same adjudication.

# Step 9a — Adjudicate the intent-risk (RIM) ledger (gate — mirrors the force-scope rule)
Read `00-index.md` `intent-risks` (authored by intake from "Risks if Misunderstood", extended by Step 9). For EVERY entry with `status: open`, set exactly one of:
- `status: adjudicated` — with `decision:` (the named choice AND its tradeoff, not a restatement) and `adjudicated-by: 02-shape.md#<section>`. If the risk touches a **PO directive** (anything in intake's Known Constraints or a recorded PO answer), `po-ratified` is `true`: a PO question was asked THIS stage; cite the `po-answers.md` entry. `false` is legal only with an explicit PO-declined note; `not-required` only when the decision alters no PO directive.
- `status: carried` — the risk genuinely cannot be resolved at shape; it then appears in `## Unknowns / Open Questions` with the receiving stage named.

A shape that leaves ANY RIM `open` may NOT write `status: complete`. Adjudication prose that merely restates the risk without a decision ("we will keep this in mind") is ILLEGAL. Write the updated `intent-risks` entries back into `00-index.md`.

**Missing-ledger branch (the no-op is for compressed modes ONLY).** Compressed intake modes may carry no RIMs; then this step is a no-op. But a **standard-lifecycle** slug whose index has neither `intent-risks` entries nor an explicit `intent-risks: none-declared` marker means intake under-delivered its ledger; do not wave it through. STOP, **backfill**: re-derive candidate RIMs
from `01-intake.md` (Known Constraints + Restated Request + Risks-if-Misunderstood prose), write them into `00-index.md` `intent-risks` (`status: open`), then adjudicate each per this step.

# Step 9b — Author the `## Intake Fidelity` table (required section)

One row per intake **Known Constraint / directive** and each numbered item of the Restated Request: `directive | disposition (honored / narrowed / dropped) | how | authority`. A `narrowed` row REQUIRES `authority` = a quoted PO answer whose **scope covers the requirement** (per [_question-craft.md](_question-craft.md)'s scope-of-authority rule) or a this-stage PO ratification. A **`dropped` row REQUIRES a this-stage gate-question ratification** ([_gate-question.md](_gate-question.md)): a scope-covering quote from an earlier answer suffices for a narrowing, but dropping a directive is always a fresh decision the PO confirms in the moment; cite the new `po-answers.md` entry. "Consequence of another answer" is NOT authority; owe the PO one more question rather than write an unauthorised narrowing.

# Step 10 — Write the artifacts
Write `.ai/workflows/<slug>/02-shape.md` per `# Artifacts` below. If Step 5a applied, also write `.ai/workflows/<slug>/02b-design.md`; its structure, sibling `.yaml`, and fragment contract are defined in [design/shape.md](design/shape.md).

# Chat return contract
After writing files, return per [_chat-return.md](_chat-return.md): a narrative lead in the artifact's `## The Shape` story voice, then this receipt:
- `slug: <slug>`
- `wrote: <path>`
- `fidelity:` — REQUIRED. The Intake Fidelity + RIM outcome in one line: `<n> honored · <m> narrowed (each: directive → authority) · <k> dropped (each: directive → authority) · RIMs: <a> adjudicated, <b> carried`; all-clear form: `fidelity: all directives honored; all RIMs adjudicated`.
- `options:` (all viable next options, per Adaptive routing)
- ≤3 short blocker bullets if needed

# Adaptive routing — evaluate what is actually next
Do not blindly recommend `/wf slice`. Present ALL viable options and write them into `## Recommended Next Stage`:
- **Option A (default): Slice** → `/wf slice <slug>`. The spec covers multiple distinct areas, has more than one AC cluster, or benefits from incremental delivery.
- **Option B: Skip to Plan** → `/wf plan <slug>`. A single coherent unit: one scope, one acceptance path, ≤5 files likely touched, no meaningful split. `review-scope` confirmation normally happens at slice; on this path `plan` asks it.
- **Option C: Revisit Intake** → `/wf intake <slug>`. Shaping revealed the brief is wrong, misses key constraints, or misunderstands the problem.
- **Option D: Blocked — re-run shape** → `/wf shape <slug>`. Required PO answers are still missing.
- **Option E: design is already in the pipeline.** When `stack.ui ≠ ∅` and the work has visual surface, shape has already authored `02b-design.md`; `plan` authors `02c-craft.md` and resolves the direction gates; `implement` builds against them. Option A or B carries design forward; there is no `/wf design <slug> craft` hand-off. Standalone transforms (`colorize`, `typeset`, `animate`, …) remain available ad-hoc via `/wf design <slug> <transform>`.

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
augmentations-needed: [<instrument|experiment|benchmark|profile>]   # shape-decided; [] when none. plan/implement/verify honor this.
charter-scenario: <authored | "none — <reason>">   # REQUIRED (Step 5b). Skipping is a declaration, never a silence. Compressed modes omit.
tags: []
refs:
  index: 00-index.md
  intake: 01-intake.md
  next: 03-slice.md
next-command: wf-slice
next-invocation: "/wf slice <slug>"
---
```

Body sections, in order. `## The Shape` comes first and is self-sufficient: three beats per `_story-arc.md` (the inherited state; the load-bearing decisions with reasons and counts; what this stage enables next plus the top open risk), language per `_ste-procedural.md` sections 1 and 3, no "This <stage> implements…" opening, 1–3 short paragraphs. The story names the highest-severity RIM carried from intake and how shape disposed of it.
- `## Problem Statement`, `## Primary Actor / User`, `## Desired Behavior`.
- `## Ambiguity Inventory` (Step 2.1): `- **AMB-1** — <statement> — source: <artifact#section> — state: closed (<round/question>) | parked (<Unknowns entry>)`. Every item ends closed, extension-targeted, or parked; an item in none of those states is ILLEGAL (Step 2.5).
- `## Charter Scenario` (Step 5b): `1. <step> → <observable checkpoint>`. `slice` carries it as a standing AC (progressive coverage: the visible-milestone slice through step N, the final slice through all steps); `verify` runs it as interactive verification subject to first-light. Compressed intake modes skip it.
- `## Acceptance Criteria`: `Given … When … Then …`, each classified `automated` (a unit/integration test proves it), `interactive` (running the app and observing through browser, emulator, or device), or `manual` (human judgement or an external-system check). Interactive criteria specify the tool (Playwright, Maestro, adb, browser automation), what to look for, and the evidence capture (screenshot, recording, console output). Two rules apply:
  - **Direction rule.** An AC whose subject is a gate, guard, health check, validation, or fallback ("unhealthy revision is caught", "invalid input is rejected") is TWO criteria with opposite evidence directions: the happy path passes through, AND the guarded failure is caught. Author both; the fail-closed half's evidence is an induced or observed failure being caught (fault injection, a bad fixture, a forced timeout), never a green run. Verify and probe enforce the direction match at clearing time.
  - **Named-mechanism rule.** Any architectural mechanism named in an AC, its verification method, or a test-plan line — a state machine, scheduler, queue, cache, pipeline, orchestrator, a controlling regex — exists as a **named decision in this artifact's body**: one sentence stating the mechanism, what it replaces, and why. Name it in the body (and adjudicate it per Step 9a if it touches a RIM or PO directive) or drop it from the AC.
- `## Non-Functional Requirements`. Constraint precedence: any NFR that could conflict with a charter commitment (`00-index.md` `charter:`) carries `yields-to: C<n>` (the commitment wins) or `outranks: C<n> (PO-ratified)` (the NFR wins; a PO answer THIS stage authorizes it; cite the `po-answers.md` entry). An unranked NFR-vs-charter conflict is an open question routed to the PO, never an author's silent call. `plan` quotes this ranking when it cites the NFR as a mechanism rationale.
- `## Edge Cases / Failure Modes`, `## Affected Areas`, `## Dependencies / Sequencing Notes`, `## Questions Asked This Stage` (each names the AMB-n items it closed or confirmed), `## Answers Captured This Stage`, `## Out of Scope` (each Round 5 trim with a one-line rationale: a logged PO decision, not a silent drop).
- `## Intake Fidelity` (Step 9b). A named input to the intent-fidelity review dimension downstream; its dispositions surface in the chat return's `fidelity:` line.

  | Intake directive | Disposition | How | Authority |
  |---|---|---|---|
  | ... | honored / narrowed / dropped | ... | quoted PO answer (scope-covering) / this-stage ratification / — |

- `## Definition of Done`.
- `## Verification Strategy`. Record the **target verification environment** first: host OS, Android device/emulator or iOS simulator availability, the browser/driver present or installable (Playwright / Cypress / dev-browser / Chrome MCP), live or staging credentials. Source it from sub-agent 1's tooling findings and the PO's tooling answer (Step 3). Then the **Observation Model**: per headline outcome, how a human or tool observes success and in what environment ("single-column at 375px → observed by driving a 375px-viewport browser and reading the layout"). An outcome you cannot name an observation for is re-scoped or flagged now so `slice` and `plan` inherit the constraint. Then classify each AC and edge case as **Automated checks**, **Interactive verification** (platform, tool, what to verify, evidence capture), or **Human-in-the-loop checks**. Purely backend/library work writes "Automated only — no interactive verification needed. [reason]."
  - **Force-scope rule (constraints get engineered, not documented).** When the Observation Model or the environment statement names an environment dependency on a headline outcome's critical path — credentials, a device, an external service, an inbound callback, infrastructure that does not yet exist (a TURN relay, a staging deploy) — route it into scope, not prose. Exactly one of: flag a **candidate prerequisite slice or harness** for `slice` to scope; state the **proxy observation** the plan holds pre-deploy plus the **named event that clears the residual** ("cleared by the first `-rc.N` prerelease CI run"); or record **explicit PO risk-acceptance** in `po-answers.md`. Writing "known limitation — document at handoff" while an AC depends on that limitation is ILLEGAL. `plan` enforces this per-AC through its `constraint-resolution:` gate.
  - **Outcome-metric criteria need a pre-deploy proxy.** A live outcome metric ("rich-preview rate ≥ 75% over the live corpus") pairs with a pre-deploy proxy observation (a fixture-corpus assertion over the top-N recorded failure pages) so verification holds *something* before ship; the live metric becomes the clearing event for the residual.
- `## Documentation Plan` (Diátaxis): per doc, **Type** (tutorial / how-to / reference / explanation / readme-update), **Audience** (beginner / competent user / maintainer), **Must cover**, **Must NOT cover**, **Target location**; or "None required — [reason]".
- `## Augmentation Plan` (required even when none): per flagged augmentation — **instrument** → signals and dark paths (`plan` folds signal design in; `implement` wires it); **experiment** → hypothesis, mechanism (A/B / flag / canary), metrics + rollback; **benchmark** → what to measure and the perf budget (`verify` compares against the tripwires); **profile** → the hotspot. If none: "None required — [reason]" and `augmentations-needed: []`.
- `## Freshness Research`: Source / Why it matters / Takeaway per entry.
- `## Recommended Next Stage`: every viable option with its reason.

Author free narrative fragments for any beat the structured page cannot tell, per [_fragment-authoring.md](_fragment-authoring.md) Step F2 (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

# Additive-write contract
`02-shape.md` is a revisable artifact. When `/wf shape` re-runs on a slug that already has one, follow [_additive-write.md](_additive-write.md): snapshot, rewrite the body to current truth (do not stack `## Revision N` sections), and add one ledger entry.
- Snapshot: `.ai/workflows/<slug>/history/02-shape-<rev>.md` (sibling `02-shape.yaml` per the shared YAML rule).
- Ledger entry: `trigger: scope-change` (or `answers-returned` when the reshape resolves open questions), `because:` naming what prompted the reshape, `changed:` naming what moved in the spec.
- `regenerable: true` applies only when `/wf shape` wraps an auto-derived shape (post-amendment regeneration); then there is no ledger entry. History view paths are stable (`<slug>/shape/history/<rev>/INDEX.html`).
