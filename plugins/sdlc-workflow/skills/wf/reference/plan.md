---
description: Create or review-and-fix implementation plans. First invocation creates plans. Re-invocation auto-reviews against current codebase and artifacts, fixes issues found. Supports single slice, all slices (parallel), or explicit feedback.
argument-hint: <slug> [slice-slug|all] [review/fix instructions]
---

Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output this operation produces.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf plan`, **stage 4 of 10**: 1·intake → 2·shape → 3·slice → `4·plan` → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro.

| | Detail |
|---|---|
| Requires | `02-shape.md`, `03-slice.md` + `03-slice-<slice-slug>.md` (if slices exist) |
| Conditional inputs (mandatory when present) | `02b-design.md` (design brief; when it exists and `02c-craft.md` does not, plan authors the visual contract — Step 0.4c), `02c-craft.md` (visual contract; the plan carries explicit steps for every mock fidelity inventory item and the implementation contract) |
| Produces | `04-plan.md` (master) + `04-plan-<slice-slug>.md` per planned slice + (design brief without a contract) `02c-craft.md` |
| Next | `/wf implement <slug> <slice-slug>` |

**Second opinion (default on).** After the plan is written, invoke `/consult codex <question about this plan>` and embed the read-only critique panel next to the plan artifact. Fire it when any objective signal is present: the slice touches concurrency, auth, data migration, money/billing, or an external API; the plan carries a `## Unknowns / Open Questions` entry; any `intent-risk` (RIM) is `carried`; or appetite is medium or larger. Skip it only for a plan with none of these and a small appetite.

**Plan against the real API.** When plan steps call a dependency, framework, or SDK, invoke the `study-sources` skill and read the installed source first, so each step cites real signatures and version-correct behavior. Reads land in gitignored `.scratch/`; the plan stays the only written artifact.

**A limitation claim carries its evidence.** A plan step that asserts a dependency capability does not exist cites evidence in the same artifact: a `study-sources` read of the installed source (name the `node_modules/` or vendored path opened), a failing minimal repro, or an upstream issue link. An existing in-repo comment claiming a limitation is a hypothesis, never sufficient authority for a workaround; re-verify it with one `study-sources` read. A recalled API shape never justifies `as any` / `@ts-ignore` alone; cite the type read from the installed package or the mismatch repro. The warn-only `limitationClaimLint` hook flags an uncited limitation comment; its citation markers are `source:` / `node_modules/` / `repro:` / `issue:` / a URL within ±3 lines.

# Role
You are a workflow orchestrator, not a problem solver. Do not write code, edit files, or implement the plan you produce. Produce execution-ready plans by inspecting the repo and prior artifacts. Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave. Your only output is the workflow artifacts and the chat summary.
- If you catch yourself implementing, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). The second argument, if present, is the slice-slug or the keyword `all`. If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse `current-stage`, `status`, `selected-slice`, `open-questions`.
3. **Check prerequisites:**
   - `02-shape.md` must exist. If missing → STOP. Tell the user which command to run first.
   - If `03-slice.md` exists, read it and every `03-slice-<slice-slug>.md` it links to. If it does not exist, this is a single-scope workflow; use single-plan mode.
   - If any prerequisite shows `Status: Awaiting input` → STOP.
   - **Stack gate.** Inspect the `stack:` block in `00-index.md`. Do not re-detect the stack inside plan; sub-agent 3 reads from `stack:`, not from a fresh repo scan.
     - If the block is **missing entirely** → STOP. Tell the user: "Step 0.5 stack fingerprint is missing from `00-index.md`. Re-run `/wf intake <slug>` to capture it; planning's verification tooling decisions depend on it."
     - If `stack.user-confirmed: false`, ask one gate question per [_gate-question.md](_gate-question.md): "`stack:` was auto-detected but not PO-confirmed. The plan's interactive verification may pick tooling the PO does not want. Re-run intake's Batch B confirmation, or proceed and accept the risk?" If the user proceeds, set `stack-source: unconfirmed-auto-detect` in the plan's frontmatter.
     - If `stack.user-confirmed: true`, proceed. Sub-agent 3 and the interactive verification template consume this block as their source of truth.
   - If `current-stage` is already past plan, note the re-run in chat and proceed. [_additive-write.md](_additive-write.md) snapshots the prior revision and appends the `revisions:` ledger; no permission question is needed.
   - **Review-scope fallback (skip-to-plan path only).** If `00-index.md` shows `review-scope-confirmed: false` (absent means the question was asked at intake), the workflow bypassed `slice`, where the question normally lands. Ask it here with one gate question per [_gate-question.md](_gate-question.md); for a single-scope workflow recommend `Slug-wide` ("one 07-review.md against the cumulative diff") over `Per slice`. Record the answer in `po-answers.md` (`stage: plan`); set `review-scope:` and `review-scope-confirmed: true` in `00-index.md`. The question is asked once per workflow.
4. **Read** `02-shape.md`, `03-slice.md` (if it exists), the relevant `03-slice-<slice-slug>.md` file(s), and `po-answers.md`.
5. **Read design context (mandatory when present).** If `stack.ui` is empty and no design artifacts exist, skip this step. When `stack.ui ≠ ∅`, load `design/_design-context.md` for the register, shared design laws, absolute bans, and the motion/interface-detail summary; when the feature touches motion, interface detail, or typography, also load `animate.md` / `polish.md` / `typeset.md`. Use only those sections; the preflight/image/mutation sections govern `/wf design`. Then:
   - `02b-design.md` — register, recommended references, anti-goals.
   - `02c-craft.md` — the visual contract. If the file exists, read it. Every `## Mock fidelity inventory` item becomes a concrete plan step. The `## Implementation contract` (token choices, component decisions, motion specs) binds the plan. If the plan must contradict the contract, surface the conflict before implementation.
   - **Design references — union of both files.** Build the reference set from `recommended-references:` in `02b-design.md` and `references-loaded:` in `02c-craft.md`. Strip a trailing `.md` before de-duplicating. Every UI plan step cites its reference as a pointer ("follow `design/typeset.md` for type scale"); each resolves to `design/<name>.md`. Reading `02b` alone drops the references the contract step introduced.
6. **Author the visual contract (mandatory when a design brief exists without one).** If `02b-design.md` exists and `02c-craft.md` does not, plan is the design producer: resolve the two gates `shape` deferred (image gate, visual-direction confirm gate) and write `02c-craft.md` per [design/contract.md](design/contract.md) — land the visual direction via the `imagery` skill, build the mock fidelity inventory, write `02c-craft.md` (type `design-contract`) and its sibling `.yaml` + `.html.fragment`. Run it inside the planning sequence, after the research sub-agents return and before you write the plan steps, so the inventory and the implementation contract become plan steps. If `02c-craft.md` exists, consume it per step 5. If `stack.ui` is empty or no `02b-design.md` exists, skip this step.
7. **Apply the augmentation plan.** Read `augmentations-needed` from `02-shape.md` frontmatter (absent or `[]` → skip). Augmentation is shape-decided and plan-authored. For each entry, load its sub-procedure and run only its artifact-authoring mode, then record it in `00-index.md` so `implement` / `verify` consume it. Run this inside the planning sequence, after the research sub-agents return. Order when multiple: `instrument` → `experiment` → `benchmark` → `profile`.
   - `instrument` → `augment/instrument.md`; author `04b-instrument.md` (dark-path detection + signal design). Fold the signals into the plan steps.
   - `experiment` → `augment/experiment.md`; author `04c-experiment.md` (hypothesis, A/B/flag/canary, metrics, rollback). Fold the flag/cohort wiring into the plan steps.
   - `benchmark` → `augment/benchmark.md` (baseline mode); capture the pre-implementation baseline into `05c-benchmark.md`. Add a "compare after implement" step so `verify` re-runs it against the tripwires (>10% CPU / >25% memory).
   - `profile` → a plan step only when shape flagged a hotspot; run it later via `/wf probe` or `augment/profile.md`.
   - Record each authored augmentation in `00-index.md` under `augmentations:` with `status: ready` (consumed by `implement` Step 0.7 and `verify` Step 0.6).
8. **Determine planning mode** (check top to bottom):
   - a) `all` and `04-plan.md` exists with linked per-slice plans → **review-all mode**.
   - b) `all` and no plans exist → **parallel plan mode**.
   - c) slice-slug + supplemental text + `04-plan-<slice-slug>.md` exists → **directed fix mode**.
   - d) slice-slug + `04-plan-<slice-slug>.md` exists + no supplemental text → **auto-review mode**.
   - e) slice-slug and no plan → **single plan mode**.
   - f) no second argument → use `selected-slice-or-focus` from the index; if missing and slices exist, choose the best first slice from `03-slice.md` or ask the user; then apply (d) or (e).
   - g) no slices → single plan mode for the whole shaped spec; if `04-plan.md` exists, auto-review (d).
9. Read every existing `04-plan-<other-slice>.md`, so the plan knows what sibling slices already plan. Carry forward `open-questions` from the index.

# Parallel research (use sub-agents for all planning)
Launch parallel sub-agents to gather information before writing the plan. Each sub-agent has its own skip criteria; do not apply a blanket "trivial" exemption. For single-plan mode launch all of these in parallel. Every finding cites file:line. The blocks marked CONTRACT are passed to the agent verbatim.

### research sub-agent 1 — Affected Code Deep Dive
Charter: read every file in the slice definition's `## Likely Files / Areas to Touch` and report the modification surface (changed versus new, including generated files), the call graph in and out, the data flow through the affected path, the conventions the area follows, and the integration surfaces around it (events, middleware, configuration, migrations). CONTRACT:

**Build-avoidance ladder.** For each capability the slice needs, climb these rungs and record the highest that holds. Scope existence is settled in shape's Round 5; do not re-litigate it. (1) Stdlib / language built-in. (2) Native platform feature (runtime, browser, framework, OS — the web-research sub-agent checks official docs). (3) Already-installed dependency or in-repo utility (the reuse scan below). (4) Minimum new code, with the reason rungs 1–3 did not hold. Pick the highest rung that meets the acceptance criteria; never trade an edge-case-correct built-in for a hand-rolled one. Record the outcome per capability in the plan's `## Simplicity Ladder`.

**Rung 3 — reuse opportunities.** Read the slice's `## Goal` and `## Scope (In)`. For each new function, class, utility, or capability, search the whole codebase for keywords, type names, domain terms, similar logic (transformations, validation, formatting, API wrappers, error handling, business rules), and extensible base classes, mixins, or higher-order functions. For each candidate report: path and symbol; what it does and how closely it matches; whether modifying it is backward-compatible; and a recommendation — reuse as-is / reuse with modification / extract into a shared utility / implement fresh (with reason). If nothing exists, state "No reuse candidates found for [capability]." Do not skip this section.

**Learnings scan.** Read `.ai/solutions/INDEX.md` if it exists; match the slice's goal and scope keywords against the index hooks; load matching files (typically 0–3) and use their `tags:` for a second pass. When `.ai/sdlc-config.json` sets `solutions.globalDir` (default `null`), read that directory's `INDEX.md` too; on a conflicting learning the repo corpus wins. For each match report its path, the learning in one line, and what this plan does differently because of it; a learning that changes nothing is a non-match. If nothing matches, report "No applicable learnings found." Results land in `## Applied Learnings`.

**Repeat-deferral tripwire.** Read `00-index.md` → `runtime-evidence-deferrals`. If an entry's defer-reason matches an environment dependency this slice's `## Verification Strategy` will also name (same credential wall, device class, missing service), the slug is about to pay the same wall twice.
- **Re-classify the wall first — never inherit the prior entry's verdict.** Ask the ladder's triage question ([runtime-adapters/_ladder.md](runtime-adapters/_ladder.md) → *Classify the wall before you climb it*): would a change to code in this repo dissolve it? Record `wall-ownership: code-owned | environment-negotiable | external`. A `code-owned` wall (a hard-coded host/port/endpoint in a debug source set, a fixture uid production rules reject, a harness pinned to one env-var name) is **not** eligible for `harness-declined` on grounds of environment; it is scoped, or declined as a deliberate refusal to fix reachable code.
- **Cost the wall before choosing.** Once the tripwire fires, write under the AC's row: `wall-cost: retire ≈ <effort> | carry = <N> deferred AC across <M> slice(s) riding "<clearing event>"`. `harness-declined:` is lawful only *after* this line is written.
- Then either scope the harness that retires the wall (the force-scope rule's prerequisite-slice option) or record an explicit PO decision not to (`harness-declined: <reason>` under the AC's row). Silence is non-compliant.

### research sub-agent 2 — Second Domain (only if the slice crosses domain boundaries)
Launch only if the slice touches a second distinct domain (frontend + backend, CLI + library, API + worker, infra + application). Charter: map the second domain's structure and conventions, the public API surface between the domains, how they communicate, where the contract is defined, and what a contract change propagates to.

### research sub-agent 3 — Test & Verification Infrastructure
Charter: report the test frameworks and configuration; existing coverage of the touched modules (run the affected tests when possible; report pass/fail/skip counts) and the gaps; the helpers, factories, fixtures, and mocks new tests reuse; and the assertion, mocking, and async patterns in use. CONTRACT:

**Interactive & visual verification tooling.** Read the `stack:` block from `00-index.md` (written by intake Step 0.5, confirmed by the PO in Batch B). It is the source of truth: do not re-derive recommendations from a repo scan, and do not propose new tools without going back through shape. Describe how `stack:`-listed tooling is wired into this slice's verification.
1. Quote `stack.platforms`, `stack.testing`, `stack.observability`, and relevant `stack.available-skills` / `stack.available-mcp` entries verbatim. If `stack-source: unconfirmed-auto-detect`, note that tooling assumptions are advisory.
2. For each platform in `stack.platforms`, locate the matched adapter in [runtime-adapters.md](runtime-adapters.md), load its `runtime-adapters/<key>.md`, and confirm the slice's verification uses its drivers (for example `platforms: [web]` + `stack.testing: [playwright]` → the in-repo Playwright suite; `[android]` + `[maestro]` → the existing `.maestro.yaml` flows plus listed companion skills such as `lazylogcat`; `[ios]` + `[xcuitest]` → the XCUITest schemes, simctl only for flows the suite lacks).
3. If an acceptance criterion needs a capability `stack:` does not cover, do not auto-recommend an install and do not leave it to verify. Record the resolution per AC in `## Verification Strategy`: (a) add it to the stack → route back through shape; or (b) authorize a verify-time bootstrap → a PO-approved install step verify executes.
4. Record the exact dev/preview command (`npm run dev`, `./gradlew installDebug`, `xcodebuild`, …) read from the build manifest.
5. Report which acceptance criteria need interactive verification and how the confirmed stack covers each. A criterion that needs tooling outside `stack:` is a blocker, not a gap to fill.
Do not rerun shape's "what driver should we use?" question. If the PO answered it, execute against that answer; if missing, route back to shape.

### Web research sub-agent — Dependencies & External Knowledge
**Launch this sub-agent for every slice.** Skip only when all of these hold: pure refactoring with zero dependency changes and zero new API surface; or config/env changes only; or text/copy/i18n changes only. Do not skip because the slice "feels small". Charter: report the touched dependencies' current versus latest versions, deprecations, and breaking changes; official-doc patterns versus what the codebase does; CVEs, known bugs, and mitigations; ecosystem consensus and anti-patterns; and gotchas, performance traps, and limitations the steps must account for. Every claim names its source. CONTRACT: before endorsing a new dependency or a hand-rolled implementation, search the standard library and platform/framework docs for a built-in (ladder rungs 1–2); report it when one exists.

Merge all findings into `## Current State`, `## Likely Files / Areas to Touch`, and `## Freshness Research`. Best practices and gotchas shape the implementation steps directly.

**Parallel plan mode (`all`).** Launch one sub-agent PER SLICE. Each receives the slug, its slice-slug, the `03-slice-<slice-slug>.md` and `02-shape.md` content, the output path `.ai/workflows/<slug>/04-plan-<slice-slug>.md`, and the list of other slice-slugs. Each runs all four playbooks above for its slice, writes its plan to that path with the per-slice template below, and writes the rich siblings `04-plan-<slice-slug>.yaml` and `04-plan-<slice-slug>.html.fragment` per Step F. The orchestrator never backfills siblings. Each sub-agent prompt includes Step F verbatim with every reference path resolved to an absolute path per [_host-invocation.md](_host-invocation.md); a sub-agent told only to "write the plan .md" skips the siblings, and managed-artifact enforcement blocks the `.md` write when the `.yaml` is missing. After all sub-agents complete: read every plan; run the cohesion check (files in several plans, conflicting or ordered migrations, shared fixtures one slice creates and another assumes, API contract changes that break another slice, interacting config/env changes); write or update the master `04-plan.md` with summaries, cross-cutting concerns, and implementation order; update cross-links in each per-slice plan; if cohesion issues are severe, recommend revisiting `/wf slice` before implementing.

# Workflow rules
Apply [_workflow-rules.md](_workflow-rules.md).

# Chat return contract
After writing files, return per [_chat-return.md](_chat-return.md) — the narrative lead in the artifact's `## The Plan` voice, then the receipt: `slug:`, `wrote:` (all plan files), `options:` (every viable next option per Adaptive routing), and ≤3 blocker bullets if needed.

Do this in order:
1. Determine planning mode from Step 0.
2. **Discovery phase (new plans only; skip for review-and-fix modes).** Before writing a plan, interview the user about implementation decisions shape and slice left open: 8–12 questions across 2–3 rounds as gate questions per [_gate-question.md](_gate-question.md), up to 4 per round. Every question is about how to build this slice and cites files, modules, patterns, and tradeoffs the sub-agents found. Do not re-ask anything decided in shape or slice; pre-fill known decisions and confirm only when findings contradict them. Present genuinely different approaches, not a right answer with decoys. Later rounds build on earlier answers. Legibility per [_question-craft.md](_question-craft.md) is mandatory here above all: frame each decision in outcome terms, gloss every technical term, describe options by consequence (effort, risk, what gets harder later), state reversibility, mark a recommendation with its reason, and name the safe option. Ask about the implementation approach (competing patterns, extend versus write new, which library API), sequencing and dependencies (order, cycles, migration timing), test strategy (coverage gaps, unit/integration/E2E, new patterns), and risk (deprecations, version mismatches, advisories, shape assumptions the codebase contradicts, spikes). Append every answer to `po-answers.md` with timestamp and `stage: plan`.
   **A decision that touches a `carried` intent-risk is intent-bearing — never auto-resolve it.** If a planning decision resolves an intent-risk (RIM) that `00-index.md` still marks `status: carried`, ask the PO on a human-gated run; on an autonomous run it is a stop condition. Classify every autonomous-versus-ask fork per [_decision-classes.md](_decision-classes.md). A recorded autonomous decision carries `class: implementation-detail`; an autonomous record never carries `class: intent-bearing`.
3. **Single plan mode (new):** run the research sub-agents and the freshness research; run the discovery phase; if a design brief exists without a contract, author the visual contract now (Step 0.6); if `augmentations-needed` is set, author the augmentation artifacts now (Step 0.7); produce a minimal execution-ready plan; write `04-plan-<slice-slug>.md`; update the master `04-plan.md`.
4. **Parallel plan mode (new, all):** Launch one sub-agent per slice. Wait for all. Read their files. Run the cohesion check. Run the discovery phase once, for cross-cutting decisions. Write or update the master `04-plan.md`. Update cross-links.
5. **Review-and-fix mode (any sub-mode):** see below.
6. Evaluate adaptive routing and write every viable option into `## Recommended Next Stage`.
7. Update `00-index.md`; add all plan files to `workflow-files`. Write the plan file(s).

# Review-and-fix mode
Triggered when an existing plan is re-invoked. The body stays current truth; never append a `## Revision N` section. Every change gets a snapshot and a ledger entry per [_additive-write.md](_additive-write.md): byte-copy the pre-edit file to `history/04-plan-<slice-slug>-<rev>.md`, append one `revisions:` entry, bump `revision-count`. An unchanged plan is a no-op: no snapshot, no ledger entry.
- **Directed fix** (`/wf plan <slug> <slice-slug> <feedback text>`): read the existing plan in full; parse the feedback; re-inspect the codebase with research sub-agents when the feedback changes which files or patterns matter; apply the feedback surgically, preserving what is still correct, and start over only on a complete rejection; ledger `trigger: review-feedback`, `because:` the feedback trimmed to a phrase, `changed:` what moved; re-check cohesion with sibling plans; update the master `04-plan.md` if strategy or key risks changed; write the plan.
- **Auto-review** (`/wf plan <slug> <slice-slug>`, plan exists, no feedback): read the existing plan in full. Dispatch ONE fresh-context review sub-agent (the same sub-agent policy review-all uses per slice; a reviewer with no memory of authoring the plan beats a self-critique). It reads the plan, `03-slice-<slice-slug>.md`, `02-shape.md`, and the sibling plans, re-inspects the codebase for the slice's scope, and returns issues with severity: drift from current code (moved, renamed, or deleted files, new sibling code, dependency/API drift), misalignment with acceptance criteria (missing or extra steps, ordering, missing verification coverage), overengineering the build-avoidance ladder rules out, and cross-plan conflicts or duplication. Summarize the findings with severity; fix them; ledger `trigger: manual`, `because: "auto-review — {count} issues found"`; update the master if anything changed; write the plan. With no issues, leave the file byte-for-byte unchanged and report "Auto-review: no issues found. Plan is current."
- **Review-all** (`/wf plan <slug> all`, plans exist): read `04-plan.md` and every `04-plan-<slice-slug>.md`. Launch one review sub-agent PER SLICE in parallel; each reads its plan, its `03-slice-<slice-slug>.md`, and `02-shape.md`, re-inspects the codebase for its scope, checks the plan against acceptance criteria, current code, and feasibility, and returns its issues or "no issues". Wait for all. Run the cross-plan cohesion check (conflicting assumptions, integration gaps, ordering, duplicated work). Fix every issue; ledger each modified plan with `trigger: manual`, `because: "review-all pass"`. Update the master `04-plan.md`. Write all files. In the chat return, list which plans were updated and which were clean.

# Adaptive routing
After completing this stage, present every viable option:
- **Option A (default): Implement** → `/wf implement <slug> <slice-slug>`. The plan is complete. Recommend compacting the session first: planning research is noise for implementation, and the SessionStart hook re-reads the artifacts after compaction.
- **Option B: Implement all (sequential)** → `/wf implement <slug> <first-slice-slug>`. Every slice is planned. Same compaction advice.
- **Option C: Revisit slice** → `/wf slice <slug>`. Planning revealed wrong slice boundaries.
- **Option D: Revisit shape** → `/wf shape <slug>`. Planning revealed an incomplete or contradictory spec.

# Artifacts

`04-plan.md` (master index). Frontmatter: `schema: sdlc/v1`, `type: plan-index`, `slug:`, `status: complete`, `stage-number: 4`, `created-at:`, `updated-at:`, `planning-mode: <single|all>`, `slices-planned:`, `slices-total:`, `implementation-order: [<slice-slug>, …]`, `conflicts-found:`, `tags: []`, `refs:` (`index: 00-index.md`, `slice-index: 03-slice.md`), `next-command: wf-implement`, `next-invocation: "/wf implement <slug> <first-slice-slug>"`. Body: `# Plan Index`, then `## Slice Plan Summaries` (per slice: files to touch, strategy, key risk), `## Cross-Cutting Concerns`, `## Integration Points Between Slices`, `## Recommended Implementation Order` (with reasons), `## Conflicts Found`, `## Freshness Research`, `## Recommended Next Stage` (Option A `/wf implement <slug> <first-slice-slug>`; Option B `/wf slice <slug>` when cohesion issues exist).

`04-plan-<slice-slug>.md` (per-slice plan). Frontmatter:

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
stack-source: <confirmed|unconfirmed-auto-detect>   # from 00-index.md stack.user-confirmed; downstream stages may refuse `unconfirmed-auto-detect`
refs: { index: 00-index.md, plan-index: 04-plan.md, slice-def: 03-slice-<slice-slug>.md, siblings: [04-plan-<other>.md], implement: 05-implement-<slice-slug>.md }
next-command: wf-implement
next-invocation: "/wf implement <slug> <slice-slug>"
---
```

Body sections, in order:
- `# Plan: <slice-name>`, then `## The Plan` — the story section, first and self-sufficient, per [_story-arc.md](_story-arc.md) (the state inherited, the load-bearing decisions with reasons and counts, what this enables next plus the top open risk) in the language of [_ste-procedural.md](_ste-procedural.md) sections 1 and 3; 1–3 short paragraphs; no "This stage implements…" opening.
- `## Current State`.
- `## Simplicity Ladder` — from sub-agent 1's ladder: one row per capability, `<capability> → rung 1 stdlib | rung 2 native-platform | rung 3 reuse | rung 4 new-code — <API / path / recommendation>`; rung 3 rows carry `path` → `symbol()`, match quality, recommendation; rung 4 rows state why rungs 1–3 did not hold. With no new capability code: "No new capabilities — ladder N/A."
- `## Applied Learnings` — one entry per matched learning (path, the learning in one line, what this plan does differently), or "No applicable learnings found." Repeat-deferral tripwire outcomes land here too: the repeated wall and either the harness scoped into the steps or the recorded `harness-declined: <reason>`.
- `## Likely Files / Areas to Touch` — `path/or/module: why`.
- `## Proposed Change Strategy` — when an NFR is the rationale for a mechanism choice, quote its charter ranking from `02-shape.md` `## Non-Functional Requirements` (`yields-to: C<n>` / `outranks: C<n> (PO-ratified)`). An unranked NFR that narrows a charter commitment is an intent-bearing decision: classify it per [_decision-classes.md](_decision-classes.md) and route it to the PO; on an autonomous run it is a stop condition.
- `## Step-by-Step Plan`.
- `## Verification Strategy` — see below.
- `## Test / Verification Plan` — `### Automated checks` (lint/typecheck, unit, integration) and `### Interactive verification (human-in-the-loop)`: for each user-observable AC, the exact drive — what to verify; platform and tool read from `stack.platforms` and the PO's shape selection (name the exact tool, for example "Android — Maestro flow `flows/auth.maestro.yaml` + `lazylogcat`"); companion skills from `stack.available-skills`; steps (exact commands to run the app, navigate, observe; bootstrap commands match the runtime adapter); evidence capture per the matched adapter's layout in its `runtime-adapters/<key>.md` file; pass criteria. Do not introduce drivers, screenshot tools, or skills outside `stack:`; a missing capability is resolved in `## Verification Strategy`, never filled on the fly. With no interactive verification: "Automated only — [reason]". A criterion that needs tooling outside `stack:` gets a `## Blockers` entry and routes back to shape.
- `## Risks / Watchouts`, `## Dependencies on Other Slices`, `## Assumptions`, `## Blockers`, `## Freshness Research`, `## Recommended Next Stage` (Option A `/wf implement <slug> <slice-slug>` — reason). No `## Revision History`; revisions live in the `revisions:` ledger.

## Verification Strategy
One row per user-observable AC, engineered to fit the real constraints so `verify` executes a plan instead of improvising past a wall. Source the AC list and `verify:` stubs from `03-slice-<slice-slug>.md`. With no user-observable AC: "No user-observable AC — automated only."

| AC | Tool / method + ladder rung | Environment need — satisfiable in target env? | What must be BUILT to make it verifiable | Fallback chain |
|----|------------------------------|-----------------------------------------------|------------------------------------------|----------------|
| `<id / text>` | `<tool>` (`<rung>`) | `<device/browser/creds/OS>` — `<yes / needs install / needs creds>` | `<fixture / data-testid / emulator config / test hook>` | `<next rung>` → … → pre-registered deferral |

Per row: the constraint-resolution-ladder rung ([runtime-adapters/_ladder.md](runtime-adapters/_ladder.md)) with the concrete tool — a user-observable AC is never satisfied by static reasoning or a mock/unit test alone; the environment need and whether the target environment (`00-index.md` `stack:` + shape's Observation Model) provides it; the seams the AC needs to be observable (a seeded fixture, a deterministic clock, a `data-testid`, an emulator config, an exported test hook), each added as a Step-by-Step Plan task; and the fallback rungs, ending in an explicit pre-registered deferral.

**Force-scope rule — a named wall is an engineered wall.** Every environment dependency on a user-observable AC's critical path (credentials, a device, an external service, an inbound callback, a deploy target, missing infrastructure) resolves, before this plan completes, to exactly one `constraint-resolution:` line in a per-AC list under the table:
1. `constraint-resolution: prerequisite-slice: <slug>` — a prerequisite slice or harness scoped into the slug (TURN provisioning, an emulator debug build variant, a seeded-fixture harness). The harness is implementation work: add its tasks to the Step-by-Step Plan, or route back to `slice`.
2. `constraint-resolution: proxy+deferral: <named clearing event>` — a lower-rung proxy AC verify can evidence now, plus a deferral authored in advance whose clearing event becomes the deferral's `cleared-by` target. **The clearing event must be provisionable — an act someone can perform, not a state someone must await.** "Once host port 8080 frees" or "when a device becomes available" is rejected: a deferral pinned to uncontrolled state is indefinite by construction. Write the actor and the act ("after slice `X` lands the configurable-port change, run `/wf probe <slug>` against any free port").
3. `constraint-resolution: po-accepted: <reason>` — explicit PO risk acceptance, recorded here and appended to `po-answers.md`.

Each line carries `wall-ownership: code-owned | environment-negotiable | external`. **Option 2 is unavailable to a `code-owned` wall**: when the repo's own source pins the constraint, the wall is dissolved by option 1 or refused on the record by option 3, never parked behind a clearing event that a code change you can already write would trigger.

"Known limitation — document at handoff" is illegal wording when an AC depends on the limitation. **Hard gate:** if any user-observable AC's named dependency has none of the three, the plan is not complete; raise it as a gate question per [_gate-question.md](_gate-question.md) (scope the harness / author the proxy+deferral / PO-accept the risk) before writing the artifact. Verify's Step 0 refuses an unresolved wall (`blocked-runtime-evidence-missing`, deferral hatch unavailable).

**Outcome-metric ACs need a pre-deploy proxy** — a fixture-corpus assertion verify can hold now, with the live metric as the deferral's clearing event. **Mandated-mitigation ACs are code-only-forbidden** — a fallback, escape hatch, or kill switch a shape mandates traces to an AC that exercises the wired path (fault injection, a forced fallback, a flag flip); add the seam (injection hook, forced-error fixture, flag toggle) as a plan task. **Tooling resolution** — when a slice `verify:` stub names a tool not in `stack:`, the PO decides here: add it to the stack (`/wf shape <slug>`), or authorize a verify-time bootstrap recorded as a PO-approved install and a verification-seam task. If the PO declines both, re-scope the AC or pre-register a deferral, never a static-reasoning `pass`. If no verification path exists for a user-observable AC, route back to slice/shape before any code is written.

## Step F — Write the rich `.yaml` + fragment
Follow [_fragment-authoring.md](_fragment-authoring.md) Step F1 for each per-slice `04-plan-<slice-slug>.md`; the siblings are flat in the slug dir (`04-plan-<slice-slug>.{yaml,html.fragment}`). Without the `.yaml` the page degrades to plain prose (`plan.mjs` gates the topology figure, files table, and risk callouts on it), and managed-artifact enforcement ([_host-invocation.md](_host-invocation.md)) blocks the `.md` write when the sibling `.yaml` is missing, so write the `.yaml` first or in the same turn. A plan with no file-change topology sets `fragment: none`.

1. `04-plan-<slice-slug>.yaml` — schema `siblingYamlSchemas.plan` in `tests/frontmatter.schema.json`, validated at write time under `hooks.validateSiblingYaml`. Required: `artifact: plan`, `slice`, `modules:`, `files:`. `modules:` entries are path-prefix strings or `{ id, label, role }` objects that files reference via `module:`. `files:` entries carry `path` plus `status:` (`new | modified | deleted | external` — the change-type the topology colors by; legacy plans put it in `role`), `role:` (a free category such as `config`, `ui`, `domain`), `module:`, `loc`, `delta: { add, rem }`, `imports:`, and `planned_change:` (`{ intent, diff }` or a string). `edges:` link `from` + `to` with optional `kind:` (`import | replaces | calls | extends | crosses-service`). `risks:` carry `title` plus `severity`/`level`, `body`, `mitigation`. `history:` is the prior-revision log. `lanes:` (only for plans that span two or more services, or when any edge is `crosses-service`) is a projection `[{ service, label, files }]`; every lane file also appears in `files:`, and `crosses-service` edges name files, not lanes. The renderer then draws a swim-lane data-flow figure instead of the module topology.
2. `04-plan-<slice-slug>.html.fragment` — one `<section class="fragment-plan" data-artifact="plan" data-slice="<slice-slug>" data-rev="<n>">`, body-only: the page owns the heading, metric row, and topology figure. Start at the `<table class="files-touched">` with collapsible planned-change rows, then the `.callout-*` risk callouts, then a `<details class="pl-revs">` prior-revisions block from `history/`. Use the shared snippets (`files-touched-row`, `callout`, `diff-block`, `fragment-ready`, `metric-row`, `verdict`, `severity-chip`) via `<!-- @include <snippet> {json} -->`; a hand-inlined copy of a published snippet warns unless `<!-- @include-skip <reason> -->` sits beside it. Scope every selector under `.fragment-plan` / `.pl-*`, scope the script via `document.currentScript.closest('.fragment-plan')`, dispatch `sdlc:fragment-ready` with `{ name: 'plan', artifact: 'plan', counts: { files, modules, risks } }`, inline SVG only, and derive everything from `04-plan.yaml` so the same YAML yields byte-identical output. The full contract is [`reference/fragment-author-contract.md`](../../../reference/fragment-author-contract.md); the gallery is [`reference/fragments-gallery.html`](../../../reference/fragments-gallery.html).

Author free narrative fragments for any beat the structured page cannot tell, per [_fragment-authoring.md](_fragment-authoring.md) Step F2.
