---
description: Convert a rough request into a clear intake brief, create the workflow folder, capture the first product-owner answers, and establish the canonical slug.
argument-hint: <task description>
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `wf intake`, **stage 1 of 10** in the SDLC lifecycle.

# Pipeline
`1·intake` → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires | *(nothing — this is the first stage)* |
| Produces | `01-intake.md` |
| Next | `/wf shape <slug>` (default) |
| Skip-to | `/wf plan <slug>` if the task is trivially scoped and needs no shaping or slicing |

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
2. **Registry collision check** (v9.11.0). Before touching disk, consult `.ai/workflows/INDEX.md` if it exists:
   - **If `INDEX.md` does NOT exist** → skip this sub-step entirely (no registry → no collision detection possible; the disk check in sub-step 3 still gates). Append a one-line tip to the final chat return: *"Tip: run `/wf-meta sync` once to bootstrap `.ai/workflows/INDEX.md` — intake gains collision detection against the registry."*
   - **If `INDEX.md` exists**, grep for an exact slug match: `grep -P "^<derived-slug>\t" .ai/workflows/INDEX.md`. Three branches based on the result:
     - **Row exists AND status column ≠ `closed`** → the slug is already in active use. STOP and call `AskUserQuestion`:
       ```
       question: "Slug `<slug>` is already an open workflow (status: <status>). What do you want to do?"
       options:
         - label: "Resume the existing workflow"
           description: "Switch to `/wf-meta resume <slug>` to continue the existing one."
         - label: "Amend the existing workflow"
           description: "Switch to `/wf-meta amend <slug> <scope>` to modify a prior stage of the existing one."
         - label: "Pick a different slug for this new workflow"
           description: "Pass a different slug as the first argument and re-run `/wf intake <new-slug> <description>`."
         - label: "Cancel — don't start anything"
           description: "Abort intake."
       ```
       Do NOT proceed past Step 0 regardless of the answer — every option redirects to a different command or aborts. Surface the chosen command verbatim and STOP.
     - **Row exists AND status column = `closed`** → reusing a closed slug would orphan its committed history and break the slug-is-stable invariant. STOP and call `AskUserQuestion`:
       ```
       question: "Slug `<slug>` belongs to a closed workflow. Slugs are stable — a new workflow cannot reuse it. What do you want to do?"
       options:
         - label: "Pick a different slug for this new workflow"
           description: "Pass a different slug as the first argument and re-run `/wf intake <new-slug> <description>`."
         - label: "Reopen the closed workflow"
           description: "Switch to `/wf-meta resume <slug>`. The closed workflow's artifacts stay intact; resume picks up from where it left off."
         - label: "Cancel — don't start anything"
           description: "Abort intake."
       ```
       Do NOT proceed past Step 0. STOP.
     - **No row** → no collision; continue to sub-step 3.
3. **Check if the workflow already exists** at `.ai/workflows/<slug>/00-index.md` (disk-level fallback; catches the case where INDEX.md is missing or stale).
   - If it exists and `stage-status` is `Awaiting input` on this stage → this is a **resume**. Read the existing `01-intake.md` and `po-answers.md`. Pick up from where the previous run left off instead of starting fresh.
   - If it exists and `current-stage` is past intake → WARN: "Intake has already been completed. Running it again will overwrite `01-intake.md`. Proceed?" Use AskUserQuestion if available, otherwise ask in chat. Only proceed if confirmed.
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

2. **Session catalog (what's available to *this* agent run).** Enumerate skills, slash commands, and MCP servers visible in the current session. Record names + a one-line description each — these become the matching surface in shape. Do not invent entries; only record what the session actually exposes.

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

# Purpose
Convert a rough request into a clear intake brief, create the workflow folder, capture the first product-owner answers, and establish the canonical slug.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time. Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` frontmatter must always have: `schema`, `type`, `slug`, `title`, `status`, `current-stage`, `stage-number`, `updated-at`, `created-at`, `selected-slice`, `branch-strategy`, `branch`, `base-branch`, `review-scope`, `pr-url`, `pr-number`, `open-questions`, `tags`, `stack`, `next-command`, `next-invocation`, `workflow-files`, `progress`, and (if slices exist) `slices`. The `stack` block is written by Step 0.5 (repo + session fingerprint) and confirmed/corrected in Batch B; it is observational, not prescriptive.
- **Use AskUserQuestion** for multiple-choice PO questions (branch strategy, rollout preference, merge strategy, go/no-go, risk tolerance). Use freeform chat for open-ended questions (requirements, constraints, acceptance criteria). Append every answer to `po-answers.md` with timestamp and stage.
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Use parallel Explore/subagents for multi-domain research. Do not spin up subagents for trivial work.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.

# Chat return contract
After writing files, return ONLY:
- `slug: <slug>`
- `wrote: <path>`
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed

**This is a mandatory-question stage.** Do not finalize until the required questions are asked.

Inputs: `$ARGUMENTS` (full raw request), `$0` (first token if supplied).

Do this in order:
1. Parse the request and derive the workflow slug.
2. Create `.ai/workflows/<slug>/` directory. Write `00-index.md` using the index template below. Create `po-answers.md` if missing.
3. Ask focused product-owner questions in two batches:
   **Batch A — Structured questions (use AskUserQuestion):**
   Call AskUserQuestion with these questions (adjust based on what's already known from `$ARGUMENTS`):
   ```
   Question 1:
     question: "What branch strategy should this workflow use?"
     header: "Branch"
     options:
       - label: "Dedicated (Recommended)"
         description: "New feature branch, PR at handoff, rebase+merge at ship. Best for tracked, reviewable work."
       - label: "Shared"
         description: "Commits on current branch, no PR created. Good for quick fixes on an existing branch."
       - label: "None"
         description: "No git management. Workflow artifacts only, you handle commits yourself."
     multiSelect: false

   Question 2:
     question: "What is the appetite for this work?"
     header: "Appetite"
     options:
       - label: "Small"
         description: "A few hours. Single file or minor change. No slicing needed."
       - label: "Medium"
         description: "A day or two. Multiple files, may benefit from slicing."
       - label: "Large"
         description: "Multiple days. Definitely needs slicing and incremental delivery."
     multiSelect: false

   Question 3:
     question: "How should the review stage be scoped?"
     header: "Review scope"
     options:
       - label: "Per slice (Recommended)"
         description: "Each slice gets its own 07-review-<slice>.md. Required when running review repeatedly across multiple slices — handoff aggregates per-slice verdicts."
       - label: "Slug-wide"
         description: "One 07-review.md for the whole workflow against the cumulative branch diff. Re-running review overwrites the file. Best for single-slice or holistic reviews."
     multiSelect: false
   ```
   If the user chose "Dedicated" for branch strategy, follow up (in chat or a second AskUserQuestion) for:
   - Preferred branch name (default: `feat/<slug>`)
   - Base branch (default: `main` or `master`, whichever exists)

   **Batch B — Freeform questions (in chat):**
   Ask 2-5 additional questions covering:
   - desired outcome and who benefits
   - concrete success criteria
   - explicit non-goals
   - timeline, compliance, operational, or platform constraints
   - already-decided technical constraints or vendor choices
   - **stack confirmation** (always include this) — summarize the Step 0.5 `stack:` block in one or two human-readable lines and ask: *"I detected this is a `<platforms>` repo using `<ui>` + `<build>`, with `<testing>` for tests and `<observability>` for logging. Available session tooling that looks relevant: `<top 3-5 skills/MCP by name>`. Anything missing, wrong, or off-limits for this task?"* Capture corrections verbatim in `po-answers.md`. After the answer arrives, update the `stack:` block in `00-index.md` (add/remove entries to match reality) and set `stack.user-confirmed: true`. This is the descriptive contract: detection proposes, the PO disposes. Do **not** use the detected stack to recommend an implementation approach at this stage — that conversation belongs in shape.
4. Capture ALL answers (structured + freeform) in `po-answers.md`.
5. Run freshness research for any external technology, dependency, platform, API, or standard that is mentioned or obviously implicated.
6. Write the intake brief without designing the implementation.
7. **Evaluate adaptive routing** (see below) and write ALL viable options into `## Recommended Next Stage`.
8. Update `00-index.md` with the recommended default option.
9. Write `.ai/workflows/<slug>/01-intake.md`.

# Adaptive routing — evaluate what's actually next
After completing this stage, do NOT blindly recommend `/wf shape`. Evaluate the intake and present the user with ALL viable options:

**Option A (default): Shape** → `/wf shape <slug>`
Use when: The task has ambiguity in behavior, acceptance criteria, or scope. Most tasks should go here.

**Option B: Skip to Plan** → `/wf plan <slug>`
Use when: The task is a well-understood, single-scope fix (e.g., "bump version X", "rename variable Y", "fix typo in Z"). No behavior ambiguity, no slicing needed. Criteria: ≤3 files likely touched, single acceptance criterion, no edge cases worth capturing.

**Option C: Blocked — re-run intake** → `/wf intake <slug>`
Use when: Required PO answers are still missing. Mark `Status: Awaiting input`.

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
review-scope: <per-slice|slug-wide>   # default per-slice; chosen at intake. Drives /wf review file layout and /wf handoff gating.
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
next-invocation: "/wf shape <slug>"
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
next-invocation: "/wf shape <slug>"
---
```

# Intake

## Restated Request

## Intended Outcome

## Primary User / Actor

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
- ...

## Success Criteria
- ...

## Out of Scope for Now
- ...

## Freshness Research
- Source:
  Why it matters:
  Takeaway:

## Recommended Next Stage
- **Option A (default):** `/wf shape <slug>` — [reason]
- **Option B:** `/wf-<other> <slug>` — [reason, if applicable]
- **Option C:** Blocked — [what's missing]

If required answers are still missing, set frontmatter `status: awaiting-input` and set `next-invocation` to rerun `/wf intake <same-slug>` after answers arrive.
