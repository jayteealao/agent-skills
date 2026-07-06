---
description: End-to-end lifecycle driver. Drives an already-started workflow forward, running each stage in-process and proceeding when a stage returns a clean terminal state; pauses when a stage's own gate fires (unmet user-observable AC, unresolved review blocker, pending PO question). Two modes — `$wf auto <slug>` drives every slice then the final review and stops BEFORE handoff; `$wf auto <slug> <slice>` drives one slice to its end and routes to the next. Slug-mode only; writes no artifact of its own; never opens a PR, runs handoff/ship/retro, or fixes CI.
argument-hint: <slug> [<slice>]
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `$wf auto`, the **end-to-end lifecycle driver**. Your job is to sequence the existing `$wf` stages on an already-started workflow so the user gets a one-command run, **without** weakening any of sdlc's quality gates and **without** opening a PR or releasing on its own.

# What `$wf auto` is (and is not)

- **A driver, not a stage.** `$wf auto` writes **no artifact of its own.** It reads `00-index.md`, decides which stage runs next, executes that stage's reference **in-process** (exactly as the `$wf` dispatcher's Step 1 does — load the reference, follow it verbatim), then reads the artifact the stage just wrote to decide whether to continue. Every artifact in `.ai/workflows/<slug>/` is written by the delegated stage, never by `auto`.
- **It removes inter-stage friction, not intra-stage gates.** Each delegated stage keeps its own user gate: `verify` owns its blocking-question Fix/Skip/Escalate loop, `review` owns its Fix/Defer/Dismiss triage. `auto` does **not** suppress, replace, or pre-answer any of them. When a stage asks the user a question, the user answers it in the normal way and the stage continues; `auto` resumes the chain afterward.
- **It stops before handoff — always.** `auto` ends at the **review**. It never opens a PR or runs `handoff`, `ship`, or `retro`; those are deliberate, separately-invoked steps. There is no flag to extend past review — run `$wf handoff <slug>` yourself when the review is clean. CI never enters `auto`'s scope, so it is never silently fixed.
- **Resume is free.** Because every stage updates `00-index.md` (`progress:`, `current-stage`, `selected-slice`, `updated-at`) and writes its own artifact, the artifact trail *is* the run log. If a run is interrupted (compaction, a fired gate), re-invoke and it picks up from the frontmatter. `auto` keeps no separate state file.

# Slug-mode contract (read before proceeding)

`auto` is **slug-mode only.** It drives an existing slug from `.ai/workflows/INDEX.md` forward. There is no fresh-workflow form: starting a workflow requires `$wf intake <description>`, which owns the product-owner alignment questions that must not be skipped autonomously. If the user gave a description instead of a slug, STOP and tell them to run `$wf intake <description>` first, then `$wf auto <slug>`.

The `$wf` dispatcher routes `$wf auto` and passes through the positional tokens. If you reach this reference, you own slug + slice resolution and the drive loop.

# Two modes

`auto` runs in one of two modes, chosen by whether a `<slice>` token was given:

- **Slug mode — `$wf auto <slug>`** drives the **whole workflow**: every slice in the roster forward, then the final review, then stops **before handoff**.
  - `review-scope: per-slice` → each slice is driven `plan → implement → verify → review`; the run ends when the last slice's review is clean.
  - `review-scope: slug-wide` → each slice is driven `plan → implement → verify` (no per-slice review); once every slice is verified, the single **slug-wide review** (`07-review.md` over the whole branch diff) runs once. The run ends there.
- **Slice mode — `$wf auto <slug> <slice>`** drives **just that one slice**, then **routes the user to the next slice**.
  - `review-scope: per-slice` → `plan → implement → verify → review` for the slice.
  - `review-scope: slug-wide` → `plan → implement → verify`, then **stop just before review** — the slug-wide review is a whole-branch pass that runs once, later, in slug mode.

# Argument grammar

The dispatcher passes through everything after `auto`. Parse it as:

| Form | Meaning |
|---|---|
| `<slug>` | **Slug mode** — drive every slice, then the final review, then stop before handoff. |
| `<slug> <slice>` | **Slice mode** — drive only `<slice>` to its end (per scope), then route to the next slice. |
| `(empty)` | Infer the slug from `.ai/workflows/INDEX.md`: if exactly one workflow has `status: active`, use it (slug mode); otherwise STOP and ask which slug. |

There are no flags. `auto` always stops at the review; `handoff`, `ship`, and `retro` are run with their own commands. For finer-grained control than slug mode, use slice mode (one slice at a time) or the individual stage commands.

# Step 0 — Orient (MANDATORY)

1. **Resolve slug + mode.** First positional = slug (or single-active inference per the grammar). Second positional, if present, = `<slice>` → **slice mode**; absent → **slug mode**. If slug is empty and not exactly one `active` workflow exists, STOP with: *"`$wf auto` needs a slug. Active workflows: `<list>`. Run `$wf auto <slug>`."*
2. **Read `.ai/workflows/<slug>/00-index.md`.** Parse `status`, `current-stage`, `progress`, `selected-slice`, `review-scope`, `workflow-type`, `branch-strategy`, `branch`, `base-branch`, `pr-number`, and `compressed-slices` (if present).
3. **Read the `03-slice.md` roster** (standard and compressed change-modes both write it). Capture every slice slug in roster order. In **slice mode**, confirm `<slice>` is in the roster; if not, STOP and tell the user to run `$wf slice <slug>` (or the right intake mode) to define it first.
4. **Resolve the per-slice file convention** once, from `workflow-type`, matching exactly how `implement`/`verify` resolve it:
   - **Multi-slice standard** (roster with per-slice `03-slice-<slice>.md` files) → **suffixed**: `04-plan-<slice>.md`, `05-implement-<slice>.md`, `06-verify-<slice>.md`, `07-review-<slice>.md`.
   - **Change-mode** (`workflow-type: fix | hotfix | refactor`) and **single-scope standard** (one slice, only a `04-plan.md` master, no per-slice plan files) → **un-suffixed**: `04-plan.md`, `05-implement.md`, `06-verify.md`, `07-review.md`. (Note: `05-implement.md`/`06-verify.md` also serve as *master indices* in suffixed mode — in suffixed mode always key off the suffixed per-slice files, never the master.)
   - **`workflow-type: update-deps`** → implement and verify are self-managed by the mode; `auto` does NOT drive them. If the slug is not yet past verify, PAUSE and route the user to `$wf intake update-deps <slug>`.
5. **Branch posture.** Run `git branch --show-current`. If it differs from `00-index.md.branch` (and `branch` is non-empty), ask the user with the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini):

```yaml
question: "Working tree is on `<current-branch>`, but workflow `<slug>` is on `<slug-branch>`. `$wf auto` will run implement/verify against the checked-out tree. How should it proceed?"
header: "Branch posture"
options:
  - { label: "Switch to <slug-branch> (Recommended)", description: "Run `git switch <slug-branch>`. Refuses if uncommitted changes would be lost." }
  - { label: "Run on <current-branch>",                description: "Drive against whatever is checked out. Only correct if you know why you are here." }
  - { label: "Abort",                                  description: "Stop. No stages run." }
multiSelect: false
```

If **switch**: attempt `git switch <slug-branch>`; on a git refusal (uncommitted changes), surface the error and STOP — do not stash or force. If **run-on-current**: proceed and note the divergence in the final summary. If **abort**: emit `wf auto aborted: branch mismatch.` and STOP.

# Step 1 — The driver loop

Repeat until the mode's endpoint is reached **or** a gate pauses the chain:

1. **Select the next stage** (selection rule below).
2. **Announce it** in one chat line: `auto → <stage> <slug> [<slice>]`. (Internal narration; the External Output Boundary still governs anything that reaches an external surface — it should not.)
3. **Run the stage in-process.** Read `reference/<stage>.md` in full and execute it verbatim against `<slug>` (and the slice for per-slice stages), passing the same `$ARGUMENTS` the manual command would. The stage does its own work, writes its own artifact, and updates `00-index.md`. Do not summarize or shortcut it.
4. **Evaluate the gate** by reading the artifact the stage just wrote (Gate table below). **PROCEED** → loop. **PAUSE** → stop the chain and run Step 2 (residual durability), then Step 3 (hand back).
5. **Re-read `00-index.md`** at the top of each iteration so `current-stage`, `progress`, and `selected-slice` reflect what the last stage wrote.

## Stage-selection rule

Gate on **artifact existence + the artifact's terminal status**, not the `progress:` map alone — the map can lag what the stages actually wrote on disk. Use the per-slice file convention resolved in Step 0.4. Drive the pre-slice band first, then the mode-specific band.

**Pre-slice band (both modes, only if not yet done):**
- `02-shape.md` missing → `shape`. (Change-modes author `02-shape.md` in their entry flow, so this is normally already satisfied.)
- Else `03-slice.md` missing → `slice`. (Also authored up front by change-modes.)
- `intake` is assumed complete — `auto` is started after intake. If `01-intake.md` is missing or `status: awaiting-input`, PAUSE and route to `$wf intake`.

### Slice mode — `$wf auto <slug> <slice>`

Drive the single named slice, in order, running the first incomplete stage each iteration:
- `<plan-file>` missing → `plan`; else
- `<implement-file>` missing → `implement`; else
- `<verify-file>` missing, or present but not clean (gate table) → `verify`; else
- **branch on `review-scope`:**
  - `per-slice` → `<review-file>` missing or not clean → `review`. Endpoint = this slice's review clean.
  - `slug-wide` → **endpoint reached at clean verify; do NOT run review.** The slug-wide review is a whole-branch pass run once, later (slug mode).

When the endpoint is reached, go to **Step 3** and **route to the next slice**: recommend `$wf auto <slug> <next-slice>` for the next roster slice after `<slice>`. If `<slice>` was the **last** roster slice, recommend the finalizer instead — `review-scope: slug-wide` → `$wf auto <slug>` (runs the final slug-wide review); `review-scope: per-slice` → `$wf handoff <slug>` (all reviews are done).

### Slug mode — `$wf auto <slug>`

Iterate the roster:
- `review-scope: per-slice` → the per-slice terminal is a clean `review`. Pick the **first slice whose review is missing or not clean** and run its next incomplete stage (`plan` → `implement` → `verify` → `review`). When every slice's review is clean → **endpoint reached** (stop before handoff).
- `review-scope: slug-wide` → the per-slice terminal is a clean `verify`. Pick the **first slice whose verify is missing or not clean** and run its next incomplete stage (`plan` → `implement` → `verify`). When **every** slice is verified, run the single **slug-wide `review`** (one `07-review.md` over `git diff <base>...HEAD`). When it is clean → **endpoint reached** (stop before handoff).

When the endpoint is reached, go to **Step 3** and recommend `$wf handoff <slug>`.

## Gate table — PROCEED vs PAUSE

After each stage, read the named keys from the just-written artifact (or `00-index.md` for `status`). **PAUSE** ends the chain and hands control back; **PROCEED** continues. `auto` drives no stage past `review`.

| Stage | Artifact | PROCEED when | PAUSE when |
|---|---|---|---|
| `shape` | `02-shape.md` | `status: complete` | `status: awaiting-input` |
| `slice` | `03-slice.md` | roster written | the stage STOPped with an error |
| `plan` | `04-plan[-<slice>].md` | `status: complete` | `status: awaiting-input` (a scope/decision fork the stage surfaced) |
| `implement` | `05-implement[-<slice>].md` | `status: complete`, code committed | `status: awaiting-input` (plan drift, blocking ambiguity) |
| `verify` | `06-verify[-<slice>].md` | `convergence ∈ {not-needed, converged}` AND `result: pass` | `convergence: escalated` OR `result: blocked-runtime-evidence-missing` OR `status: awaiting-input` |
| `review` | `07-review[-<slice>].md` | `verdict ∈ {ship, ship-with-caveats}` AND `metric-findings-blocker == 0` (open blockers; → endpoint) | `verdict: dont-ship` OR `metric-findings-blocker > 0` |

Notes that bind the table:

- **The stage already asked.** When a stage PAUSEs because it set `awaiting-input` / `escalated`, that state is the *result of the stage's own user interaction*, not something `auto` decides. `auto` reads the recorded verdict and stops — it does not re-prompt and never overrides the stage's own gate.
- **One fix pass per stage, then hand back.** `verify` enforces a single fix round per invocation by design; `review` accumulates findings across runs and runs its fix loop once per invocation. `auto` does **not** auto-re-invoke either for another pass — that is a deliberate user decision. When a stage PAUSEs (verify `escalated`, or `review` leaving open blockers), `auto` PAUSEs and recommends the re-invocation in the summary.
- **A clean `review` is the endpoint, not a PROCEED into handoff.** `auto` stops there and recommends `$wf handoff <slug>`.

# Step 2 — Residual durability (on PAUSE or at the endpoint)

Make unresolved findings durable so nothing dies silently inside an artifact.

1. Read the latest `07-review[-<slice>].md` for any slice in the roster. Collect findings still OPEN — `metric-findings-blocker > 0` (open blockers), or HIGH findings whose `status` is `deferred` or `could-not-fix`.
2. **If a PR already exists** (`pr-number` > 0 — e.g. the user ran `$wf handoff` on an earlier pass and came back for more slices): compose a `## Residual Review Findings` section (one bullet per finding: severity, file:line, short title, recommended action — **product language only, leak-checked per the External Output Boundary**). Read the current body with `gh pr view <pr-number> --json body`, append or replace that one section, write the merged body to a temp file, and run `gh pr edit <pr-number> --body-file <file>`.
3. **If no PR exists** (the usual case — `auto` never opens one): name the unresolved findings explicitly in the Step 3 summary so the user sees them. Do not invent a tracker. The review artifact is already the durable record; the summary makes it visible.
4. Never block the hand-back on a `gh` failure — report it and fall back to listing the findings inline.

# Step 3 — Hand back to the user (MANDATORY)

End every run with a chat summary. Lead with a short **narrative** paragraph (prose, no bullets) telling the story: which stages ran, what they produced, why the chain stopped (reached the endpoint, or which gate paused it), and the single most important next action. Then the anchors:

```
wf auto complete: <slug> [<slice>]  (mode: <slug|slice> — stopped at: <stage> — <endpoint | gate: <what fired>>)

<Narrative paragraph — the stages driven this run, the key decisions/counts each produced,
 and the reason the chain ended. Weave in the residual-findings status.>

Stages run: <the per-slice sequence actually executed>
Artifacts: <comma-separated paths written this run>
Residual findings: <none | N recorded in <artifact> | N surfaced to PR #<n>>
Next: <the routing command — see below>
```

`Next` routing:
- **Slice mode, endpoint reached:** the next roster slice → `$wf auto <slug> <next-slice>`. If it was the last slice → `$wf auto <slug>` (slug-wide scope, to run the final review) or `$wf handoff <slug>` (per-slice scope).
- **Slug mode, endpoint reached:** `$wf handoff <slug>`.
- **Any mode, gate paused:** the paused stage's own recommended next command (e.g. `$wf verify <slug> <slice>` for a second round), followed by `$wf auto <slug> [<slice>]` to resume.

Rules:
- **Always emit**, even on an early PAUSE. The narrative explains *why* it stopped — never end silently.
- **Internal audience.** `.ai/` paths are allowed in this chat block; the External Output Boundary still governs anything written to a PR, commit, or other external surface.
- **Honesty.** Report what actually ran and what failed. If `auto` ran three stages then paused at verify, say so — do not imply the workflow is further along than the artifacts show.

# Worked shapes (for grounding, not a script)

- **Slice mode, per-slice scope:** `$wf auto myfeat slice-a` → `plan` (clean) → `implement` (clean) → `verify` (converged, pass) → `review` (ship, 0 blockers). Endpoint. Summary routes to `$wf auto myfeat slice-b`.
- **Slice mode, slug-wide scope:** `$wf auto myfeat slice-a` → `plan` → `implement` → `verify` (clean). **Stops before review.** Routes to `$wf auto myfeat slice-b`. (The slug-wide review runs later, once, via `$wf auto myfeat`.)
- **Slug mode, slug-wide scope:** `$wf auto myfeat` → drives slice-a `plan→implement→verify`, slice-b `plan→implement→verify`, … then the single slug-wide `review` over the branch. Endpoint = review clean. Stops before handoff; routes to `$wf handoff myfeat`.
- **Slug mode, per-slice scope:** `$wf auto myfeat` → slice-a `plan→implement→verify→review`, slice-b `plan→implement→verify→review`, … endpoint = last review clean. Stops before handoff; routes to `$wf handoff myfeat`.
- **Paused at verify:** any mode — `verify` returns `convergence: escalated`. `auto` PAUSEs, surfaces the unresolved issues, recommends `$wf verify <slug> <slice>` for a second round, then `$wf auto <slug> [<slice>]` to resume.

# What this skill is NOT

- **Not a stage** — it writes no artifact; the stages it drives do.
- **Not a fresh-start** — it never runs `$wf intake` from a bare description; intake's PO-alignment gates must be driven explicitly.
- **Not a PR opener or releaser** — it always stops at the review; `handoff`, `ship`, and `retro` are run with their own commands.
- **Not a CI auto-fixer** — CI is never in its scope; that stays handoff's diagnose-then-ask job, on a separate run.
- **Not a gate remover** — every delegated stage's own user gate still fires; `auto` only removes the friction of typing each stage command by hand.
- **Consults at the designated gates (sparingly)** — `$consult` is model-invocable, so at the plan, review, and diagnosis gates `auto` drives, the model may **auto-invoke** `$consult codex …` (pinned to free `codex`/`claude`) when a gate is genuinely borderline. It stays sparing — a routine stage gets no consult and adds no external round-trip — so the low-friction sequencing `auto` exists for is preserved. The paid REST oracles are never fanned out unattended.
