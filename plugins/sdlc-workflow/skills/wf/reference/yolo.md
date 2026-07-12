---
description: Autonomous end-to-end lifecycle driver. The Claude-only, no-human-gates sibling of `/wf auto` — drives an already-started workflow forward by running each stage as a background-workflow subagent and RESOLVING each stage gate itself by a written Autonomous Decision Policy (instead of pausing for the user), recording every decision into the artifact. Two modes — `/wf yolo <slug>` drives every slice then the final review and stops BEFORE handoff; `/wf yolo <slug> <slice>` drives one slice to its end and routes to the next. Built on Claude Code's Workflow tool; writes no artifact of its own; never opens a PR, runs handoff/ship/retro, or fixes CI.
argument-hint: <slug> [<slice>]
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0 work, read the active workflow's `steer.md` if it
> exists and apply the contract in [_steering.md](_steering.md): honor the user's standing instructions, never
> above a MANDATORY gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf yolo`, the **autonomous lifecycle driver**. It does what `/wf auto` does — sequence the existing `/wf` stages on an already-started workflow — but where `auto` **pauses** at every stage gate for the user, `yolo` **resolves that gate itself**, in the user's best interest, by the Autonomous Decision Policy, and drives the slug to the review endpoint **without stopping**. It runs the stages as background-workflow subagents via Claude Code's **Workflow** tool. The user typing `/wf yolo <slug>` **is** the explicit opt-in to run that tool.

> **Claude-only.** `yolo` is built on the Workflow tool, which the Codex runtime does not have. It exists only in the Claude build of this plugin and is never mirrored to `sdlc-workflow-codex`. There is no Codex `/wf yolo`.

> **Relationship to `/wf auto`.** `auto` is unchanged — the human-in-the-loop driver. `yolo` does not replace, modify, or weaken it. They are two drivers over the same stage references and the same artifact state-machine; the only difference is **who answers the gates**. Prefer `auto` when you want to review each gate; reach for `yolo` when you want the slug built and reviewed autonomously and will inspect the recorded decisions afterward.

# What `/wf yolo` is (and is not)

- **A driver, not a stage.** It writes **no artifact of its own.** Every artifact in `.ai/workflows/<slug>/` is written by a delegated stage subagent that reads the on-disk reference (`plan.md` / `implement.md` / `verify.md` / `review.md`) and follows it **verbatim**, with one override: where the reference asks the user, the subagent resolves it by policy. `yolo` is pure orchestration.
- **It resolves gates; it does not remove them.** Each stage's quality gate still runs — `verify` still enforces the user-observable AC gate, `review` still computes its verdict from open findings. `yolo` does not weaken any of them; it supplies the **answer** the user would otherwise give, by the policy below, and **records every decision into the artifact** so the run is exactly as auditable as a human-gated one. Where it genuinely *cannot* produce the runtime proof a criterion needs, it **defers** that criterion through verify's own `interactive-verification: deferred` escape hatch — recorded, ship-blocking, and visible — rather than cancelling the run or pretending the check passed.
- **It stops before handoff — always.** `yolo` ends at the **review**, identical to `auto`. It never opens a PR or runs `handoff`, `ship`, or `retro`. CI is never in its scope. The autonomy is bounded to *building and reviewing*, never *publishing*.
- **Resume is free.** The durable record is the on-disk artifact trail (`00-index.md` + numbered files). A killed run resumes on re-invocation: orientation re-reads which stages are already terminal-clean and skips them. No separate state file.

# Slug-mode contract (read before proceeding)

`yolo` drives from **plan onward** — it never runs `intake` or `shape` autonomously, because those own the product-owner alignment that must not be skipped without a human. What it needs is a slug whose intake and shape are already **complete**; it drives `plan → implement → verify → review` from there. If the user gave a description instead of a slug, STOP and tell them to run `/wf intake <description>` first, then `/wf yolo <slug>`.

**Intake modes — what `yolo` drives.** Orientation classifies the slug by `00-index.md`'s `workflow-type`. Four classes:

- **Build lifecycles** — standard/feature, and the compressed change-modes `fix` / `hotfix` / `refactor`. A change-mode slug is a *compressed standard lifecycle*: its planning half (`01-<mode>` → `02-shape` → `03-slice` → `04-plan`) is already written and it sits at the pre-implement gate — exactly the state `yolo` picks up. `yolo` drives all of these from `implement` onward; orientation resolves the mode-named intake lead (`01-fix.md` / `01-hotfix.md` / `01-refactor.md`, all `type: intake`) from `workflow-type` rather than the literal `01-intake.md`. Readiness requires the intake lead + `02-shape.md` + `03-slice.md` (a single-scope standard workflow with no `03-slice.md` is driven as a synthesized roster of one).
- **RCA (forwarded, single-scope)** — `workflow-type: rca`. An RCA's diagnosis (`01-rca.md`, `type: rca`) **is** its intake, and it synthesizes `02-shape.md` — so intake and shape are complete and `yolo` drives it from `plan` onward over its single scope (the `plan`/`implement`/`verify`/`review` references each have a "forwarded mode" path for `workflow-type: rca`). It has no `03-slice.md`; orientation synthesizes a one-entry roster from `selected-slice`. `yolo` **honors the RCA's `recommended-next`** as the build flavor without re-running intake: `hotfix` → the review stage defaults to the `security` rubric; `plan`/`fix` → standard review. The one refusal is **`recommended-next: human-triage`** (low root-cause confidence ∧ high blast radius) — a genuine product stop; orientation blocks and routes you to read `01-rca.md` and choose the build route by hand. `yolo` never mints a new branch or changes the base for an RCA — it drives on the tree the RCA recorded.
- **Self-managed build** — `update-deps`. Unlike a standard build it does **not** decompose into `/wf implement` + `/wf verify` (those redirect back to intake); its intake reference self-authors `05-implement.md` + `06-verify.md` in tier order (P0 security → P1 major+migration → P2 safe batch), then routes to `/wf review`. `yolo` **drives** this via a *self-managed exec* path: it wraps `intake/update-deps.md` Steps 6–9 in one subagent — the Step 6 scope gate resolved by the autonomous policy (see the policy table) — which self-authors `05`/`06`, then `yolo` runs the standard **slug-wide review**. Like every class, `yolo` drives from the **plan gate onward**: readiness requires `01-update-deps.md` (`type: intake`, complete), `02-shape.md`, `03-slice.md`, and `04-plan.md` all `status: complete` — the human's own `/wf intake update-deps` run authors those. If any of `01`–`04` is missing or incomplete, orientation blocks with `route='/wf intake update-deps <slug>'` (or `/wf plan <slug>` when `04-plan` is the only gap).
- **Terminal-analysis, no decided build** — `investigate`, `discover`, `ideate` (their `00-index.md` is `type: workflow-index`). Unlike RCA, these deliberately do **not** converge on a single build: `investigate` emits 2–3 unpicked option sketches and writes no `02-shape.md`; `discover` emits a yes/no verdict whose only follow-up is more analysis (`/wf intake rca`), not a build; `ideate` emits a ranked menu whose ideas each become their own new workflow. The missing ingredient is a human product decision (pick an option / act on the verdict / choose an idea) — exactly the intake+shape alignment `yolo` must not make. So `yolo` drives **nothing**, and never routes them to `/wf slice` *or* to `/wf plan <slug>` (they are never continued in place — each **seeds a new `/wf intake` workflow**). Orientation blocks and hands back the mode's own recorded next step: `ideate` → its `/wf intake <chosen-idea>`; `investigate` → pick an option in `01-investigate.md`, then `/wf intake fix <option>`; `discover` → act on the verdict in `01-discover.md`. Once that new workflow is intaked+shaped, `/wf yolo` drives it.

# Two modes

- **Slug mode — `/wf yolo <slug>`** drives the **whole workflow**: every slice in the roster, then the final review, then stops **before handoff**.
  - `review-scope: per-slice` → each slice is driven `plan → implement → verify → review`; the run ends when the last slice's review is clean.
  - `review-scope: slug-wide` → each slice is driven `plan → implement → verify`; then the single slug-wide review (`07-review.md` over the branch diff) runs once. The run ends there.
- **Slice mode — `/wf yolo <slug> <slice>`** drives **just that one slice**, then **routes you to the next slice**.
  - `review-scope: per-slice` → `plan → implement → verify → review` for the slice.
  - `review-scope: slug-wide` → `plan → implement → verify`, then stop just before review (the slug-wide review runs once, later, in slug mode).

# The Autonomous Decision Policy (what replaces each gate)

Every gate `auto` defers to the user, `yolo` resolves by this rule. Two tiers: **auto-resolve** (proceed, recording the decision into the artifact) and **HARD-STOP** (end the run with the artifact trail and a reason — even an autonomous driver refuses to cross these).

| Gate | Auto-resolve | HARD-STOP |
|---|---|---|
| `plan` discovery interview / scope fork | Implementation-detail forks: pick the option best satisfying the slice AC at least cost; **record the assumption** in `## Assumptions`. | A fork that changes **user-observable scope or a contract** (public API, data shape, UX behavior, migration) — a product decision, not a best-interest call. |
| `verify` failing check / unmet AC | Auto-fix: apply the minimal patch, run the stage's single fix round. Up to **2 rounds** (a second invocation). A user-observable AC the environment **genuinely cannot** evidence is **deferred** (verify's `interactive-verification: deferred` hatch) — lawful ONLY over a **probed** incapability (verify's attempt-before-declare rule: the capability probe's command + output tail is carried as a structured `probe` **receipt** on the deferral; an all-specs-skipped-at-guard sweep is never an auto-deferral). A deferral that arrives with **no** probe receipt draws exactly **one corrective re-run** demanding it (produce the evidence if the wall fell); still receipt-less after that → HARD-STOP. A deferral recorded by an **earlier run** is a claim to **re-probe fresh, never inherit**. Recorded in `00-index.md` `runtime-evidence-deferrals`; the run continues at `result: partial`. | A **substantive** failure still unresolved after 2 rounds (`convergence: escalated`), a bare `result: blocked-runtime-evidence-missing` — an un-producible AC that was *not* deferred — or a deferral still carrying no probe receipt after the corrective re-run. Never fabricate runtime proof. |
| `review` triage | **Fix** every BLOCKER + HIGH + **MED (always)**. **Fix** LOW/NIT when in-scope ∧ localized ∧ safe; else **defer-and-record**. Never silently dismiss. | `verdict: dont-ship`, or an unfixable **security / data-loss** blocker after the fix loop. |
| `update-deps` scope gate (Step 6) | **Proceed with the full plan** — drive P0 security + P1 major+migration (one at a time, only the API-forced app-code changes) + P2 safe batch. A package that fails its test/build is marked `blocked` and the run continues (`result: partial`); its `06-verify.md` deferrals reuse the same runtime-evidence hatch as `verify`. Never audit-only, never hand-edit lockfiles, never mix a security update with a major migration in one commit. | A substantive `06-verify.md` failure unresolved (same rule as `verify`), or a slug-wide review that returns `dont-ship` / an unfixable security blocker. |
| branch posture (`dedicated` only) | Land the tree on the slug branch **before any stage runs**: switch to it if it exists, else **create it from `base-branch`** (mirrors implement.md's branch step). `shared`/`none` never switch — the drive runs on the checked-out tree. | A switch or create that would clobber uncommitted work (never stash/force), or a missing `base-branch` that blocks the create. |
| intent-bearing decision (per [_decision-classes.md](_decision-classes.md)) | Never autonomous. | STOP: record the pending decision in the artifact + `po-answers.md` as awaiting-input, surface in the run report. |
| `intake` / `shape` (PO alignment) | **Never autonomous.** | Missing or `awaiting-input` → stop, route to `/wf intake` / `/wf shape`. |
| standing steering (`steer.md`) | Apply each entry to the decisions below: a preference tilts an auto-resolve, a satisfiable constraint is obeyed and logged in the stage's `steering-honored`. | A steering **veto** an otherwise-lawful autonomous action would cross. A veto outranks every auto-resolve above — the run stops and surfaces it rather than override the user's standing voice. |

The fix posture, precisely: the default action on any finding is **fix**. MEDs lose the option to defer. LOW/NITs keep a defer escape only when fixing them would reach outside the slice's diff, be non-localized, or risk a convention conflict — and the defer is always recorded with its reason. An unfixable finding is recorded `could-not-fix`, and only escalates to a HARD-STOP if it is a security/data-loss BLOCKER or the verdict is `dont-ship`.

Branch posture, precisely: when `branch-strategy: dedicated`, `yolo` puts the working tree on the slug branch during orientation — **before `plan` runs** — so the entire run lands on the dedicated branch instead of leaving `implement` to mint it mid-chain. If the branch already exists (locally or as an already-fetched remote-tracking ref) it switches to it; if it does **not** exist yet it **creates it from `base-branch`** — the same create-or-switch `implement`'s own branch step would do, just done up front. It never stashes or force-switches: a switch or create that git refuses because uncommitted work would be lost is a HARD-STOP, routing you to resolve the branch by hand and re-run. `branch-strategy: shared` and `none` are left untouched — the drive runs on whatever is checked out, exactly as those strategies intend. When `yolo` did create or switch a branch, it reports the action (`outcome.branch`) so the hand-back names where the run landed.

Standing steering, precisely: `steer.md` (the contract lives in `_steering.md`) is the user's standing voice, and in an unattended run it is the *only* voice — so it outranks every auto-resolve default above. `yolo` reads it during orientation and injects the relevant entries into each stage subagent's prompt (subagents never re-read the workflow directory, so an un-propagated steering file is silently lost). A **preference** ("prefer the queue approach") tilts an implementation-detail fork; a satisfiable **constraint** ("never touch `config/loader.ts`") is obeyed and recorded in that stage's `steering-honored`. A steering entry `yolo` cannot honor without crossing a MANDATORY gate or a HARD-STOP is surfaced, never obeyed into a broken state — and a steering **veto** that a lawful auto-resolve would violate is itself a HARD-STOP: the run ends with the artifact trail rather than override the user. Steering only ever *constrains* or *directs* within the policy; it never *loosens* a gate — it cannot authorize shipping with an open deferral or waive a `dont-ship` verdict.

Deferring un-verifiable acceptance criteria, precisely: a user-observable AC sometimes needs runtime proof the current environment simply cannot produce — no emulator or device, no display, an external service or API key that isn't reachable here, a runtime adapter whose bootstrap won't come up. Rather than cancel the whole run over a check it *cannot* perform, `yolo` defers **that one criterion**: it applies verify's sanctioned `interactive-verification: deferred` annotation with a reason, registers the deferral in `00-index.md` `runtime-evidence-deferrals` (with `cleared-by: null`), writes the slice `result: partial`, and drives on. This is **not** a weakening of the gate. The deferral is durable and visible; `/wf review` and `/wf handoff` proceed with only a soft warning, but `/wf ship` **HARD-BLOCKS** until every deferral is cleared by a `/wf probe` (or a re-verify) in a capable environment — and because `yolo` always stops before handoff, a deferred criterion can never reach production on its watch. The boundary is strict in three directions: deferral is **only** for *un-producible* evidence — if `yolo` actually drove the AC and the behavior was wrong, that is a substantive `fail` and still HARD-STOPs; an AC left with **neither** evidence **nor** a deferral (`blocked-runtime-evidence-missing`) still HARD-STOPs; and "cannot produce" must be **proven, not assumed** — verify's attempt-before-declare rule applies unchanged under `yolo`, so an auto-deferral is lawful only when the recorded capability probe (command + output) shows the incapability, and a suite whose specs all exited via a credential guard is an unmet precondition to fix (set the variable, re-run), never a deferral. Two structural guards keep this honest across runs: the probe is carried as a **receipt** on the deferral, and a deferral that arrives without one draws a single corrective re-run before the driver will accept it; and a deferral **inherited from an earlier run** is never taken as fact — `yolo` reads the open `runtime-evidence-deferrals` at orientation and injects a **RE-CHALLENGE** block into the verify prompt, so each prior wall is re-probed fresh (a wall that no longer stands is verified now; one that still stands earns a new receipt). The standing pile is surfaced in the hand-back as `outcome.deferralPressure` (open count, oldest wall, repeat-of clusters) so it can't hide inside artifacts. `yolo` never silently drops a criterion.

# Step 0 — Resolve arguments (MANDATORY)

1. **Slug + mode.** First positional after `yolo` = slug. Second positional, if present, = `<slice>` → **slice mode**; absent → **slug mode**. `yolo` owns its own slug resolution (the dispatcher excludes it from fuzzy-suggest, like `auto`). If the slug is empty, infer it from `.ai/workflows/INDEX.md`: exactly one `status: active` workflow → use it (slug mode); otherwise STOP with: *"`/wf yolo` needs a slug. Active workflows: `<list>`. Run `/wf yolo <slug>`."*
2. **Existence check.** Confirm `.ai/workflows/<slug>/00-index.md` exists. If not, STOP: *"No workflow `<slug>`. Run `/wf status` to list workflows, or `/wf intake <description>` to start one."* (Do not fuzzy-correct here — the dispatcher already skipped Step 0.5 for `yolo`.) If a description was given instead of a slug, STOP and route to `/wf intake <description>` first.
3. **Resolve the absolute paths the Workflow script needs.** The script and its stage subagents have **no inherited working directory**, so every path must be absolute:
   - `projectRoot` = the absolute root of the repo that owns `.ai/workflows/<slug>/` (the nearest ancestor containing `.ai/workflows`, capped at the git toplevel — resolve it; do not pass a relative path or a sub-folder).
   - `pluginRoot` = the absolute install path of **this** plugin — the directory you loaded this reference from (`<pluginRoot>/skills/wf/reference/yolo.md`), equivalently `$CLAUDE_PLUGIN_ROOT` if set in your shell.
   - `referenceRoot` = `<pluginRoot>/skills/wf/reference`.
   - `scriptPath` = `<pluginRoot>/skills/wf/workflows/yolo.js`.

# Step 1 — Invoke the Workflow tool

Call the **Workflow** tool with the shipped script and the resolved absolute args. Pass `slice` only in slice mode (omit it in slug mode):

```
Workflow({
  scriptPath: "<pluginRoot>/skills/wf/workflows/yolo.js",
  args: {
    projectRoot:   "<absolute repo root owning .ai/workflows>",
    referenceRoot: "<pluginRoot>/skills/wf/reference",
    slug:          "<slug>",
    slice:         "<slice>"        // slice mode only — omit for slug mode
    // reviewFanout / planFanout: omit (default off; opt-in, see the script header)
  }
})
```

The workflow runs in the background and returns immediately with a task id; a completion notification arrives when it finishes. **Do not start a second driver** (`auto` or another `yolo`) for the same slug while it runs. The script orients, drives the stage chain autonomously, and returns a structured `outcome` object describing where it ended.

> **Iteration / prototype note.** The same script can be invoked directly during development by passing `scriptPath` to the dev checkout's `…/skills/wf/workflows/yolo.js`. No plugin rebuild is needed — skills and this script are read from source, not from `dist/`.

# Step 2 — Hand back to the user (MANDATORY)

When the workflow completes, read its returned `outcome` and emit a chat summary. Lead with a short **narrative** paragraph (prose, no bullets) telling the story: which stages ran, the load-bearing decisions/counts each produced, **the autonomous calls the driver made** (assumptions recorded, findings fixed vs deferred, acceptance criteria deferred for un-producible runtime evidence), and why the run ended — reached the endpoint, or HARD-STOPped at which gate and why. Then the anchors:

```
wf yolo complete: <slug> [<slice>]  (mode: <slug|slice> — <endpoint reached | HARD-STOP at <stage>: <reason>>)

<Narrative paragraph — the stages driven this run, the key decisions/counts, the autonomous
 resolutions and any residual deferred/could-not-fix findings, and the reason the run ended.>

Branch: <from outcome.branch — "created <target> from <base>" | "switched to <target>"; omit the line when yolo did not move the branch (already on it, or shared/none)>
Stages run: <the per-slice sequence actually executed>
Autonomous decisions: <count + one-line gist, or "none recorded">
Residual findings: <none | N deferred/could-not-fix recorded in <artifact>>
Runtime-evidence deferrals: <none | from outcome.runtimeEvidenceDeferrals: N — slice/AC + reason (+ probe receipt), recorded in 00-index.md; /wf ship is BLOCKED until each is cleared by /wf probe or a re-verify in a capable environment>
Deferral pressure: <omit when absent | from outcome.deferralPressure: N open, oldest since <date>, M repeat-of wall(s) — the standing pile across prior runs + this one; plan's repeat-deferral tripwire governs retiring it>
Next: <outcome.route — the routing command>
```

`Next` routing comes straight from `outcome.route`:
- **Endpoint, slice mode:** the next roster slice → `/wf yolo <slug> <next-slice>`; last slice → `/wf yolo <slug>` (slug-wide, to run the final review) or `/wf handoff <slug>` (per-slice).
- **Endpoint, slug mode:** `/wf handoff <slug>`.
- **HARD-STOP:** the gate that fired and the command to resolve it, then `/wf yolo <slug> [<slice>]` to resume.

Rules:
- **Always emit**, even on a HARD-STOP or an orientation block. The narrative explains *why* it stopped — never end silently.
- **Surface the autonomy.** A `yolo` run's value is in the decisions it made for the user. Name the assumptions it recorded and the findings it fixed vs deferred, so the user can audit them. Point at the artifacts that hold the full record.
- **Flag ship-blocking deferrals.** If `outcome.runtimeEvidenceDeferrals` is non-empty, call them out explicitly: the slug passed verify only because runtime evidence for those acceptance criteria was deferred, and `/wf ship` will refuse until each is cleared by `/wf probe` (or a re-verify in a capable environment). This is the one residual with a downstream hard gate — do not bury it.
- **Internal audience.** `.ai/` paths are allowed in this chat block; the External Output Boundary still governs anything written to a PR, commit, or other external surface.
- **Honesty.** Report what actually ran. If `yolo` drove two slices then HARD-STOPped at verify on the third, say so — do not imply the workflow is further along than the artifacts show.

# What this command is NOT

- **Not a stage** — it writes no artifact; the stages it drives do.
- **Not a fresh-start** — it never runs `intake`/`shape` from a bare description; their PO-alignment gates are driven explicitly by a human.
- **Not a PR opener or releaser** — it always stops at the review; `handoff`, `ship`, and `retro` are separate commands.
- **Not a CI auto-fixer** — CI is never in its scope.
- **Not a gate remover** — every stage's quality gate still runs; `yolo` supplies the answer by policy and records it, rather than pausing for the user.
- **Consults at the designated gates (free only)** — `consult` is model-invocable and pins a free subscription CLI (`codex`/`claude`), so `yolo` may **auto-invoke** it at a genuinely borderline plan/review/diagnosis gate to de-risk an autonomous decision. It stays sparing and never spends on the paid REST oracles, so it fits the Autonomous Decision Policy (no unattended cost) rather than breaching it.
- **Not in the Codex build** — Claude-only, by design.
