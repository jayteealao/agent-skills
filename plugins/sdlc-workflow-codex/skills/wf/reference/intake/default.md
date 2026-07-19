---
description: Convert a rough request into a clear intake brief, create the workflow folder, capture the first product-owner answers, and establish the canonical slug.
argument-hint: <task description>
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](../_steering.md): honor the user's standing instructions, never
> above a MANDATORY gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `$wf intake`, **stage 1 of 10** in the SDLC lifecycle.

# Pipeline
`1·intake` → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | *(nothing — this is the first stage)* |
| Produces | `01-intake.md` |
| Next | `$wf shape <slug>` (default) |
| Skip-to | `$wf plan <slug>` if the task is trivially scoped and needs no shaping or slicing |

> **Auto second opinion (objective triggers).** Once the intake brief is drafted (Step 6c — after
> the misreading pass, before writing `01-intake.md`), **auto-invoke** `$consult codex <critique
> this restated request, charter, and RIM ledger — did I misread the ask?>` (pinning
> `codex`/`claude` keeps it free) when ANY of: (a) the work introduces a new capability or
> externally-observable surface AND appetite is medium or larger; (b) any authored RIM has
> `severity: high`; (c) the request touches security, payments, auth, data migration, or deletion
> semantics. Intake is where a misread request is cheapest to catch — fire it rather than offering
> it in next-steps; skip only when none of the triggers hold. The user may invoke it explicitly
> with any provider.

# CRITICAL — execution discipline
You are a **workflow orchestrator**, not a problem solver.
- Do NOT attempt to diagnose, debug, fix, implement, design, or otherwise work on the user's task.
- Do NOT jump ahead to later lifecycle stages (shaping, planning, implementation, etc.).
- Treat `$ARGUMENTS` as **raw input to be captured and processed through this stage's workflow** — not as a request to act on.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- Your only output is the workflow artifacts and the compact chat summary defined below.
- If you catch yourself about to start solving the problem, STOP and return to the next unfinished workflow step.

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Derive the slug** from `$ARGUMENTS`. Use the task description to create a lowercase kebab-case slug. If `$ARGUMENTS` looks like an existing slug, use it.
2. **Registry collision check** (v9.11.0; opportunistic-bootstrap added in v9.25.0). Before touching disk, consult `.ai/workflows/INDEX.md` if it exists:
   - **If `INDEX.md` does NOT exist** → no registry yet, so no collision detection is possible at this step (the disk check in sub-step 3 still gates the fresh-vs-resume decision). Do NOT bail out — Step 10 (below) will bootstrap `.ai/workflows/INDEX.md` with a header line + this workflow's row at the end of intake, so the *next* intake gets full collision detection without requiring an explicit `$wf status`. (Status auto-reconciles for full refresh — removing stale rows, fixing status drift across all workflows. Intake only does additive "append self if absent.")
   - **If `INDEX.md` exists**, search / list files in the repository for an exact slug match: `grep -P "^<derived-slug>\t" .ai/workflows/INDEX.md`. Three branches based on the result:
     - **Row exists AND status column ≠ `closed`** → the slug is already in active use. STOP and ask the user directly in chat, presenting the options as a short numbered list:
       ```
       Slug `<slug>` is already an open workflow (status: <status>). What do you want to do?
       1. Catch up on the existing workflow — run `$wf recap <slug>` to see what's been done, or `$wf status <slug>` for where it stands and the next command.
       2. Add new scope to it — run `$wf intake <slug> <new scope>` to add net-new slice(s) (extension). Corrections to already-built work also land as a new slice — there is no in-place amend.
       3. Pick a different slug for this new workflow — pass a different slug as the first argument and re-run `$wf intake <new-slug> <description>`.
       4. Cancel — don't start anything.
       ```
       Do NOT proceed past Step 0 regardless of the answer — every option redirects to a different command or aborts. Surface the chosen command verbatim and STOP.
     - **Row exists AND status column = `closed`** → reusing a closed slug would orphan its committed history and break the slug-is-stable invariant. STOP and ask the user directly in chat, presenting the options as a short numbered list:
       ```
       Slug `<slug>` belongs to a closed workflow. Slugs are stable — a new workflow cannot reuse it. What do you want to do?
       1. Pick a different slug for this new workflow — pass a different slug as the first argument and re-run `$wf intake <new-slug> <description>`.
       2. Add new scope to the closed workflow — run `$wf intake <slug> <new scope>` to extend it with net-new slice(s); the closed workflow's artifacts stay intact. Run `$wf recap <slug>` first to review what it did.
       3. Cancel — don't start anything.
       ```
       Do NOT proceed past Step 0. STOP.
     - **No row** → no collision; continue to sub-step 3.
3. **Check if the workflow already exists** at `.ai/workflows/<slug>/00-index.md` (disk-level fallback; catches the case where INDEX.md is missing or stale).
   - If it exists and `stage-status` is `Awaiting input` on this stage → this is a **resume**. Read the existing `01-intake.md` and `po-answers.md`. Pick up from where the previous run left off instead of starting fresh.
   - If it exists and `current-stage` is past intake → WARN: "Intake has already been completed. Running it again will overwrite `01-intake.md`. Proceed?" Ask the user in chat. Only proceed if confirmed.
   - If it does not exist → this is a fresh start. Proceed normally.
4. **Carry forward** any `open-questions` from the index if resuming.

# Step 0.5 — Repo stack fingerprint (MANDATORY — observation only, do NOT prescribe)

Goal: cheaply observe what the repo *already uses* and what *tooling is available in this session*, then write both into `00-index.md` as durable signal for shape/plan/implement. This is **not** a recommendation step — those happen in shape, with the user in the loop. Stay descriptive: record only what is actually detected.

1. **Repo signals (cheap globs/reads, no network).** Run these probes and record what hits. Do not infer beyond direct evidence; absence ≠ proof of absence, leave keys out rather than guess.
   - **Manifests:** `package.json`, `pyproject.toml` / `requirements.txt` / `setup.py`, `Cargo.toml`, `go.mod`, `pom.xml` / `build.gradle*` / `settings.gradle*`, `Gemfile`, `composer.json`, `pubspec.yaml`, `mix.exs`, `*.csproj` / `*.sln`. Capture language(s) + package manager(s).
   - **Platforms:** `AndroidManifest.xml` or `app/src/main/**` → `android`. `*.xcodeproj` / `*.xcworkspace` or `ios/Runner.xcodeproj` → `ios`. `next.config.*` / `vite.config.*` / `nuxt.config.*` / `astro.config.*` / `remix.config.*` / `svelte.config.*` → `web`. `src-tauri/` or `electron` dep → `desktop`. `Dockerfile` exposing HTTP or HTTP server framework imports → `service`. `*.ipynb` → `notebook`. `[[bin]]` in `Cargo.toml`, `bin` in `package.json`, `cmd/<name>/main.go` → `cli`.
   - **UI / framework:** React/Vue/Svelte/Angular (from `package.json`), Jetpack Compose (`androidx.compose.*` in gradle), XML views (`res/layout/`), SwiftUI, UIKit, Flutter, React Native.
   - **Build / package managers:** npm vs pnpm vs yarn vs bun (lockfile present), gradle/AGP version, cargo, go modules.
   - **Testing & verification tooling:** Jest, Vitest, pytest, JUnit, Go testing, RSpec, XCTest, **Maestro** (`maestro/` dir or `*.maestro.yaml`), Detox, Playwright, Cypress, Appium, Selenium, Espresso. Visual: Percy, Chromatic.
   - **Observability / logging:** `.lazylogcat*`, Perfetto trace configs, Sentry/OpenTelemetry SDKs, structured-log setup files.
   - **Marker files for known integrations:** Hilt/Dagger (`hilt-` deps), Room (`androidx.room.*`), Engage SDK, Play Billing, R8/ProGuard rules.

2. **Session catalog (what's available to *this* agent run).** Enumerate skills and MCP servers visible in the current session. Record names + a one-line description each — these become the matching surface in shape. Do not invent entries; only record what the session actually exposes.

3. **Write into `00-index.md` frontmatter** as a `stack:` block (sibling to `tags:`). Every key is optional; omit rather than guess. Example shape (Android case):
   ```yaml
   stack:
     detected-at: "<iso-8601>"
     platforms: [android]
     languages: [kotlin]
     ui: [compose]
     build: [gradle]
     package-managers: [gradle]
     testing: [junit, maestro]
     observability: [lazylogcat]
     integrations: [hilt, room]
     available-skills:
       - {name: android-cli, hint: "Android project + SDK orchestration"}
       - {name: lazylogcat, hint: "Non-interactive logcat capture/filter"}
       - {name: adaptive, hint: "Multi-form-factor UI adaptation"}
     available-mcp: []
     user-confirmed: false
   ```
   `user-confirmed: false` means "auto-detected, awaiting Batch B confirmation." Batch B (below) flips it to `true` after the PO has had a chance to correct.

4. **Do NOT recommend anything yet.** No "you should use X." That happens in shape, after the user has confirmed or corrected the fingerprint. This step's only output is observation written to disk.

# Step 0.7 — Bounded Explore pass (ground the questions in the code — conditional)

Intake questions asked blind push ambiguities the codebase would resolve for free onto the PO, or
leak them into shape. So, **when the request names or implies a specific area of the codebase and
is not trivially scoped**, launch **one** research sub-agent (per [_subagents.md](../_subagents.md),
medium breadth) before Batch B.

**Skip criteria — skip ONLY if ANY of these hold** (mirrors shape's research skips):
- The request is a trivial mechanical change (typo, rename, version bump, config flip)
- The request names no codebase area and implies none (a green-field capability with no existing
  surface to map)

**The agent's one job:** *map the affected area — what exists today, what the request would touch,
which ambiguities the code already answers.* No solutioning, no recommendations.

**Findings land in `01-intake.md` → `## Affected Areas (preliminary)`** (see the template below) —
file paths, the existing behavior in one line each, and any request-ambiguity the code already
resolves. Two consumers depend on this exact section: Batch B questions MUST reference the findings
where relevant ("the code already has X — does this request replace it or extend it?"), and shape's
research sub-agent 1 opens with it ("verify and deepen, do not re-derive") — that handoff clause is
what keeps total research cost flat across the two stages.

# Purpose
Convert a rough request into a clear intake brief, create the workflow folder, capture the first product-owner answers, and establish the canonical slug.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, get the current UTC time per [_timestamp.md](../_timestamp.md). Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` frontmatter must always have: `schema`, `type`, `slug`, `title`, `status`, `current-stage`, `stage-number`, `updated-at`, `created-at`, `selected-slice`, `branch-strategy`, `branch`, `base-branch`, `review-scope`, `review-scope-confirmed`, `appetite`, `pr-url`, `pr-number`, `open-questions`, `tags`, `stack`, `next-command`, `next-invocation`, `workflow-files`, `progress`, and (if slices exist) `slices`. The `stack` block is written by Step 0.5 (repo + session fingerprint) and confirmed/corrected in Batch B; it is observational, not prescriptive.
- **Ask the user directly in chat** for multiple-choice PO questions (branch strategy, rollout preference, merge strategy, go/no-go, risk tolerance), presenting options as a short numbered list. Use freeform chat for open-ended questions (requirements, constraints, acceptance criteria). Construct every question per [_question-craft.md](../_question-craft.md). Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Use parallel subagents for multi-domain research per [_subagents.md](../_subagents.md). Do not spin up subagents for trivial work.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return per [_chat-return.md](../_chat-return.md) — narrative lead in the artifact's `## The Intake` story voice, then this receipt:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

**This is a mandatory-question stage.** Do not finalize until the required questions are asked.

Inputs: `$ARGUMENTS` (full raw request), `$0` (first token if supplied).

Do this in order:
1. Parse the request and derive the workflow slug.
2. Create `.ai/workflows/<slug>/` directory. Write `00-index.md` using the index template below. Create `po-answers.md` if missing.
3. Ask focused product-owner questions in two batches — **substance first (Batch B), process
   second (Batch A)**. The process answers (branch, appetite) are far better informed after the PO
   has described the work, so the historical batch labels stay but the ORDER is B → A.

   **Batch B — Freeform substance questions (in chat — ASK THESE FIRST):**
   Ask freeform questions covering the areas below. 2–5 is typical, but the count is need-driven, not fixed: keep asking (in small batches, building on earlier answers) while the desired outcome is vague, a success criterion is not yet falsifiable, or a mentioned constraint is uncaptured — and stop the moment those are pinned down. Never pad to reach a count; park anything the PO can't answer now in `open-questions` (`status: awaiting-input`) instead of pressing. Cover:
   - desired outcome and who benefits
   - concrete success criteria
   - explicit non-goals
   - timeline, compliance, operational, or platform constraints
   - already-decided technical constraints or vendor choices
   - **stack confirmation** (always include this) — summarize the Step 0.5 `stack:` block in one or two human-readable lines and ask: *"I detected this is a `<platforms>` repo using `<ui>` + `<build>`, with `<testing>` for tests and `<observability>` for logging. Available session tooling that looks relevant: `<top 3-5 skills/MCP by name>`. Anything missing, wrong, or off-limits for this task?"* Capture corrections verbatim in `po-answers.md`. After the answer arrives, update the `stack:` block in `00-index.md` (add/remove entries to match reality) and set `stack.user-confirmed: true`. This is the descriptive contract: detection proposes, the PO disposes. Do **not** use the detected stack to recommend an implementation approach at this stage — that conversation belongs in shape.
   **Ground questions in the Step 0.7 Explore findings where relevant** — "the code already has X —
   does this request replace it or extend it?" beats asking the PO to describe what the code
   already answers.

   **Batch A — Structured process questions (ask in chat with numbered options — asked AFTER Batch B):**
   Ask these questions presenting options as a short numbered list (adjust based on what's already known from `$ARGUMENTS` and Batch B):
   ```
   Question 1: "What branch strategy should this workflow use?"
   Options:
     1. Dedicated (Recommended) — New feature branch, PR at handoff, rebase+merge at ship. Best for tracked, reviewable work.
     2. Shared — Commits on current branch, no PR created. Good for quick fixes on an existing branch.
     3. None — No git management. Workflow artifacts only, you handle commits yourself.

   Question 2: "What is the appetite for this work?"
   Options:
     1. Small — A few hours. Single file or minor change. No slicing needed.
     2. Medium — A day or two. Multiple files, may benefit from slicing.
     3. Large — Multiple days. Definitely needs slicing and incremental delivery.
   ```
   Record the appetite answer as `appetite:` in `00-index.md` frontmatter — it is machine-read
   downstream (shape scales its pre-mortem horizon by it; slice reads it for slice-count
   expectations; plan's consult trigger keys off it).

   **Review scope is NOT asked here** (moved in v9.136.0): the PO cannot judge review layout
   before slicing exists. `00-index.md` carries the provisional default `review-scope: per-slice`
   with `review-scope-confirmed: false`; `slice` asks the PO once the roster is known (`plan` asks
   instead on the skip-to-plan path that bypasses slice).

   If the user chose "Dedicated" for branch strategy, follow up in chat for:
   - Preferred branch name (default: `feat/<slug>`)
   - Base branch (default: `main` or `master`, whichever exists)
4. Capture ALL answers (structured + freeform) in `po-answers.md`.
5. Run freshness research for any external technology, dependency, platform, API, or standard that is mentioned or obviously implicated.
6. **Draft** the intake brief without designing the implementation (steps 6a–6c refine it before it is written to disk in Step 9).
6a. **Misreading pass (MANDATORY — the RIM quality floor).** Before the brief is final, run one
   short in-run pass: *"Name the 3 most likely ways this request could be misread."* Each candidate
   either becomes a RIM entry in `## Risks if Misunderstood` or is dismissed in that section with a
   stated reason ("considered: <misreading> — dismissed because <reason>"). In-run, no sub-agents —
   this is the floor; shape's blind pre-mortem stays the deep pass. The `## Risks if Misunderstood`
   and `## Charter` sections may NEVER be silently absent in default mode: zero entries is legal
   only as the explicit declaration `intent-risks: none-declared` / `charter: none-declared` in
   `00-index.md` frontmatter plus a one-line reason in the body ("pure mechanical rename; no
   interpretive surface"). Silence is illegal — shape's Step 9a backfills a missing ledger instead
   of waving it through.
6b. **Ratify the charter with the PO (MANDATORY when a charter is authored).** Present the 3–7
   distilled commitments in ONE chat question — *"These are the promises I heard — confirm or
   correct"* (numbered list per [_question-craft.md](../_question-craft.md)). Record the
   ratification in `po-answers.md`; ratified charter entries carry `po-ratified: true` in the
   `00-index.md` `charter` ledger. A charter the PO ratified at stage 1 carries real authority
   downstream (shape's adjudications and the intent-fidelity review dimension cite it); an
   unratified charter is only inferred authority.
6c. **Auto second opinion** — apply the objective triggers in the blockquote above the CRITICAL
   section; when any holds, fire `$consult` now, and fold material findings back into the brief
   (a confirmed misreading becomes a RIM or a reworded Restated Request).
7. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
8. Update `00-index.md` with the recommended default option.
9. Write `.ai/workflows/<slug>/01-intake.md`.
10. **Register this workflow in `.ai/workflows/INDEX.md`** (additive bootstrap, v9.25.0). After `00-index.md` is finalized, ensure the registry contains a row for this slug. Re-read the just-written `00-index.md` frontmatter so the row reflects the *final* values (the branch/status/workflow-type fields can change between Step 0 and now based on PO answers in Batch A).
    - **If `.ai/workflows/INDEX.md` does NOT exist** → create it with the header comment (verbatim from the sync spec) followed by exactly one row for this workflow. Use the canonical column order: `slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at`. Header line:
      ```
      # .ai/workflows/INDEX.md — global workflow registry. Reconciled by $wf status (bootstrap+refresh) and additively touched by slug-mode compressed-slice writes from $wf intake/$wf probe/$wf simplify (updated-at only) and by $wf intake (append self if absent). Columns: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at. Sorted alphabetically by slug. Closed workflows are retained.
      ```
      Surface in the chat return: *"Bootstrapped `.ai/workflows/INDEX.md` with this workflow's row. Positional slug detection (compressed-slice attach) is now enabled."*
    - **If `.ai/workflows/INDEX.md` exists AND the slug is already present** → do nothing (the collision check in Step 0 should have already redirected us; reaching Step 10 with a matching row means this is a resume on a row written by an earlier intake run — leave the existing row in place so sync owns updates).
    - **If `.ai/workflows/INDEX.md` exists AND the slug is missing** → append a single new row for this workflow, then **re-sort the file alphabetically by slug** (preserving the header line at the top). Surface in the chat return: *"Added `<slug>` to `.ai/workflows/INDEX.md`."*
    - **Do NOT mutate other rows.** Status/branch/updated-at drift on other workflows is sync's responsibility, not intake's. Intake's contract here is strictly *append self if absent*.

# Adaptive routing — evaluate what's actually next
After completing this stage, do NOT blindly recommend `$wf shape`. Evaluate the intake and present the user with ALL viable options:

**Option A (default): Shape** → `$wf shape <slug>`
Use when: The task has ambiguity in behavior, acceptance criteria, or scope. Most tasks should go here.

**Option B: Skip to Plan** → `$wf plan <slug>`
Use when: The task is a well-understood, single-scope fix (e.g., "bump version X", "rename variable Y", "fix typo in Z"). No behavior ambiguity, no slicing needed. Criteria: ≤3 files likely touched, single acceptance criterion, no edge cases worth capturing.

**Option C: Blocked — re-run intake** → `$wf intake <slug>`
Use when: Required PO answers are still missing. Mark `Status: Awaiting input`.

**UI-aware path note:** If the Step 0.5 `stack:` fingerprint shows a UI/frontend layer (`stack.ui ≠ ∅`) and the task has visual surface, note in `## Recommended Next Stage` that design is woven into the normal path — `shape` authors the design brief (`02b-design.md`), `plan` authors the visual contract (`02c-craft.md`) and resolves the direction gates, and `implement` builds against it. There is no separate design command in the critical path (the standalone `$wf design <slug> <transform>` operators are for focused, ad-hoc moves). Keep `shape` as the immediate next command: it owns feature discovery, including the visual-surface questions and the design brief. This is a path heads-up only, consistent with intake staying descriptive.

Write ALL viable options (not just the default) into `## Recommended Next Stage` so the user can choose.

Write `00-index.md` with this structure:

```yaml
---
schema: sdlc/v1
type: index
slug: <slug>
title: "<human-readable title>"
status: active
current-stage: intake
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
selected-slice: ""
branch-strategy: <dedicated|shared|none>
branch: "<feat/slug or empty>"
base-branch: "<main|master|develop>"
review-scope: per-slice               # PROVISIONAL default — confirmed at slice (or plan on the skip-to-plan path), NOT asked at intake. Drives $wf review file layout and $wf handoff gating.
review-scope-confirmed: false         # slice/plan flips to true after the PO answers with the roster known
appetite: <small|medium|large>        # Batch A answer. Machine-read downstream: shape's pre-mortem horizon, slice's count expectations, plan's consult trigger.
pr-url: ""
pr-number: 0
open-questions: []
tags: []
stack:                                  # Step 0.5 fingerprint. Observation only — user confirms in Batch B.
  detected-at: "<iso-8601>"
  platforms: []                         # e.g., [android], [web], [ios, web]
  languages: []                         # e.g., [kotlin], [typescript]
  ui: []                                # e.g., [compose], [react, tailwind]
  build: []                             # e.g., [gradle], [vite]
  package-managers: []                  # e.g., [gradle], [pnpm]
  testing: []                           # e.g., [junit, maestro], [vitest, playwright]
  observability: []                     # e.g., [lazylogcat], [sentry]
  integrations: []                      # e.g., [hilt, room], [stripe, prisma]
  available-skills: []                  # [{name, hint}] — session-visible skills
  available-mcp: []                     # [{name, hint}] — session-visible MCP servers
  user-confirmed: false                 # flipped to true after Batch B
next-command: wf-shape
next-invocation: "$wf shape <slug>"
workflow-files:
  - 00-index.md
  - 01-intake.md
  - po-answers.md
progress:
  intake: in-progress
  shape: not-started
  slice: not-started
  plan: not-started
  implement: not-started
  verify: not-started
  review: not-started
  handoff: not-started
  ship: not-started
  retro: not-started
---
```

(No markdown body needed in the index — frontmatter IS the content.)

---

Write `01-intake.md` with this structure:

```yaml
---
schema: sdlc/v1
type: intake
slug: <slug>
status: complete
stage-number: 1
created-at: "<iso-8601>"
updated-at: "<iso-8601>"
tags: []
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: wf-shape
next-invocation: "$wf shape <slug>"
---
```

# Intake

## The Intake
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Voice per `../_narrative-voice.md` — no "This intake implements…" openings. 1–4 short paragraphs. -->

## Restated Request
<!-- If the request implies a sequence of user actions (a core loop — "user does A, gets B, then C"),
state that loop as NUMBERED STEPS. The numbered loop is a deliberate artifact: shape derives the
Charter Scenario (the executable end-to-end spine) from it. An unnumbered loop does not exempt shape
— it will derive one from prose — but numbering it here is the honest, cheap form. -->

## Intended Outcome

## Primary User / Actor

## Affected Areas (preliminary)
<!-- Step 0.7's bounded Explore findings — file paths, one-line existing behavior each, and any
request-ambiguity the code already resolves. Omit the section only when Step 0.7's skip criteria
held. Consumed twice downstream: Batch B questions reference it, and shape's research sub-agent 1
opens with it ("verify and deepen, do not re-derive"). -->
- ...

## Known Constraints
- ...

## Assumptions
- ...

## Product Owner Questions Asked
- ...

## Product Owner Answers
- ...

## Unknowns / Open Questions
- ...

## Dependencies / External Factors
- ...

## Risks if Misunderstood
<!-- Each risk here is ALSO a tracked ledger entry (INTENT-FIDELITY W1). Give each a stable id RIM-1..n and a severity; the prose stays, the ids are additive. The ledger is what forces shape to adjudicate each one in writing instead of letting it evaporate. NEVER silently absent in default mode (Step 6a): zero entries requires the explicit declaration `intent-risks: none-declared` in 00-index.md frontmatter plus a one-line reason here. Record the Step 6a misreading pass in this section too: each dismissed candidate as "considered: <misreading> — dismissed because <reason>". -->
- **RIM-1** (severity: high|medium|low) — <one-line risk statement>
- ...

<!-- LEDGER AUTHORING: write these into 00-index.md frontmatter as `intent-risks` — one entry per RIM with `id`, `risk` (the one-line statement), `severity`, `status: open`, and empty `adjudicated-by` / `decision` / `po-ratified: null`. When the section legitimately has zero entries, write `intent-risks: none-declared` instead (an absent key is ILLEGAL in default mode — shape's Step 9a backfills it). Shape MUST adjudicate every `open` entry before it can complete (see shape.md Step 9a); handoff/ship HARD-BLOCK on any that stay `open`. This reuses the exact machinery `runtime-evidence-deferrals` already proves out. Compressed intake modes (fix/hotfix/refactor/update-deps/adopt): author entries ONLY if the risk section produces any — the ledger is optional there, and `none-declared` is not required. Terminal-analysis modes (investigate/discover/ideate): no ledger (no build follows). -->

## Charter
<!-- The 3–7 positive commitments this build must honor — deliberately FEW. A charter that restates the
whole intake is boilerplate; keep only the load-bearing promises. Each commitment must be FALSIFIABLE BY
CODE (a reader can point at a behavior that proves or breaks it), not a mood or an aspiration. Distilled
from the Restated Request, Intended Outcome, and Known Constraints. NEVER silently absent in default
mode: zero commitments requires `charter: none-declared` in 00-index.md frontmatter plus a one-line
reason here. Ratified with the PO in Step 6b before writing. Compressed intake modes
(fix/hotfix/refactor/update-deps/adopt): SKIP — no charter, no declaration needed. -->
- **C1** — <one positive commitment, falsifiable by code> — source: `01-intake.md#<section>`
- ...

<!-- LEDGER AUTHORING: write these into 00-index.md frontmatter as `charter` — one entry per commitment
with `id` (C1..), `commitment` (the one-line statement), `source` (the `01-intake.md#section` it distills),
`status: honored`, and `po-ratified: true` once Step 6b's confirmation lands (false with an explicit
PO-declined note otherwise). When zero commitments, write `charter: none-declared` instead. Additive
cross-wiring downstream (ids only, no new machinery): shape's RIM
adjudications (Step 9a) MAY name the charter ids they protect; the `## Intake Fidelity` table rows MAY
reference charter ids; the intent-fidelity review dimension checks its question 1 per charter id.
Compressed intake modes: skip (no charter). -->

## Success Criteria
- ...

## Out of Scope for Now
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `$wf shape <slug>` — [reason]
- **Option B:** `$wf-<other> <slug>` — [reason, if applicable]
- **Option C:** Blocked — [what's missing]

If required answers are still missing, set frontmatter `status: awaiting-input` and set `next-invocation` to rerun `$wf intake <same-slug>` after answers arrive.

---

## Step — Write free narrative fragments

Author **free narrative fragments** for any beat the structured page can't tell — as many as the story needs. Follow [_fragment-authoring.md](_fragment-authoring.md) **Step F2** for the rules (unrestricted raw HTML, no contract or sibling `.yaml`, `NN-` label ordering).

---

## Additive-write contract (v9.20.2+)

`01-intake.md` is a revisable artifact. Re-invocation happens when the user
returns with answers to open questions, when scope changes, or when a related
intake informs the current one. Follow the shared additive-write contract in
[_additive-write.md](../_additive-write.md) — snapshot, **rewrite the body to
current truth**, add one ledger entry:

- Snapshot: `.ai/workflows/<slug>/history/01-intake-<rev>.md`.
- **Ledger entry**: `trigger: answers-returned` (user returned with answers),
  `scope-change` (scope expanded), or `manual` (a related intake informed this
  one); `because:` and `changed:` naming the prompt and the effect.

Stage-specific additions:

1. **Open-question resolution**: when a previously-open question is now
   answered, fold the answer into the problem statement so the body reads as
   current truth — add the answer below the original question with a `→` marker
   rather than leaving the question dangling. Name the resolution in the ledger
   entry's `changed:` phrase; the verbatim prior wording lives in the snapshot.
2. **`status: awaiting-input` transitions**: if this run resolves all open
   questions, transition `status` to `complete` and clear `open-questions`
   in frontmatter. Note the transition in the new revision section.

History view paths are stable (`<slug>/intake/history/<rev>/INDEX.html`) —
prior intakes remain linkable from later artifacts (shape, plan) that
reference an intake-at-the-time.
