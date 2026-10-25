---
description: Autonomous lifecycle driver, on Claude Code, Codex and pi. The no-human-gates sibling of `/wf auto` — runs each stage as a background-workflow subagent and resolves each stage gate itself by a written Autonomous Decision Policy, recording every decision into the artifact. `/wf yolo <slug>` drives every slice then the final review and stops BEFORE handoff; `/wf yolo <slug> <slice>` drives one slice and routes to the next. Writes no artifact of its own; never opens a PR, runs handoff/ship/retro, or fixes CI.
argument-hint: <slug> [<slice>]
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steer.** Only when the decision store holds a live `steer` entry (`decide list --kind steer`, per [_decisions.md](_decisions.md)): apply it. Honor the user's standing instructions, never
> above a mandatory gate, and inject the relevant entries into every sub-agent prompt you dispatch.

You are running `/wf yolo`, the **autonomous lifecycle driver**. It resolves every stage gate by the Autonomous Decision Policy and drives the slug to the review endpoint through the host's workflow runtime (Step 1).

> **Three hosts, one script.** `workflows/yolo.js` runs unchanged on each host. Claude Code runs it with the **Workflow** tool, pi with pi-subagents' **SubagentWorkflow** tool, and Codex with `wf.mjs drive`, where each agent is one `codex exec` call. Step 1 names the call for each host. This file is a named host-contract file and may describe each host's tools directly.

# What `/wf yolo` is (and is not)

- **A driver, not a stage.** Every artifact in `.ai/workflows/<slug>/` is written by a delegated stage subagent that follows the on-disk reference (`plan.md` / `implement.md` / `verify.md` / `review.md`) **exactly**, with one override: where the reference asks the user, the subagent resolves it by policy.
- **Reads are listed.** Each stage prompt names the reference's `## Requires` table as a checklist per [_requires.md](_requires.md).
- **It resolves gates; it does not remove them.** Each stage's quality gate still runs; `yolo` supplies the answer and records it. Where it cannot produce the runtime proof a criterion needs, it defers that criterion through verify's `interactive-verification: deferred` hatch — recorded, ship-blocking, visible.
- **It stops before handoff — always.** It never opens a PR or runs `handoff`, `ship`, or `retro`. CI is never in its scope.
- **Resume is free.** The durable record is the artifact trail (`00-index.md` + numbered files). A killed run resumes on re-invocation: orientation skips stages already terminal-clean. No separate state file.
- **A dead driver looks dead.** Every dispatched subagent writes heartbeats to `.ai/workflows/<slug>/.driver-journal.jsonl`. Read it by the staleness rule; never by its existence.

# Driver liveness

**The heartbeat.** Each dispatched agent appends one JSONL line before it starts and one before it returns, through the driver's `line` command. A stop adds `reason`, `hardStopReason` or `routeBack`:

```json
{"at":"2026-07-26T14:31:07Z","run":"20260726T142950Z-<slug>","seq":4,"event":"agent-start","agent":"verify:auth","phase":"Drive","stage":"verify","slice":"auth"}
{"at":"2026-07-26T14:58:22Z","run":"20260726T142950Z-<slug>","seq":4,"event":"agent-end","agent":"verify:auth","status":"complete","errors":0}
```

It is diagnostic, never a gate: a failed append never changes what a stage does. The last agent, `run-end`, writes the `run-end` line.

**Judging it.** Apply the staleness rule in [_liveness.md](_liveness.md) at every read site, `/wf status <slug>` included. Never infer liveness from a file, a task id, or a "running independently" chip.

**Reconciling a dead driver.** A presumed-dead driver's last writes are suspect. Re-read every control file from disk immediately before editing it. Where an artifact on disk contradicts `00-index.md`, trust the artifact and correct the index. Report what the journal shows the run completed versus abandoned.

# Slug-mode contract

`yolo` drives from **plan onward** — never `intake`, `shape`, or `design`, which own the product-owner alignment. If the user gave a description instead of a slug, STOP and tell them to run `/wf intake <description>` first, then `/wf yolo <slug>`.

**Intake modes — what `yolo` drives.** Orientation classifies the slug by `00-index.md`'s `workflow-type`. Six classes:

- **Build lifecycles** — standard/feature and the compressed change-modes `fix` / `hotfix` / `refactor`. Their planning half (`01-<mode>` → `02-shape` → `03-slice` → `04-plan`) is written; `yolo` drives from `implement` onward. Orientation resolves the mode-named intake lead (`01-fix.md` / `01-hotfix.md` / `01-refactor.md`, all `type: intake`) from `workflow-type`, not the literal `01-intake.md`. Readiness requires the intake lead + `02-shape.md` + `03-slice.md`; a single-scope workflow with no `03-slice.md` is driven as a synthesized roster of one.
- **RCA (forwarded, single-scope)** — `workflow-type: rca`. `01-rca.md` (`type: rca`) is its intake and synthesizes `02-shape.md`; `yolo` drives from `plan` onward over a one-entry roster synthesized from `selected-slice` (each stage reference has a "forwarded mode" path). `recommended-next` sets the build flavor: `hotfix` → review defaults to the `security` rubric; `plan`/`fix` → standard review. **`recommended-next: human-triage`** is a genuine product stop: orientation blocks and routes you to read `01-rca.md` and choose the route by hand. `yolo` never mints a branch or changes the base for an RCA.
- **Self-managed build** — `update-deps`. `yolo` wraps `intake/update-deps.md` Steps 6–9 in one subagent, with the Step 6 scope gate resolved by the policy table; the subagent self-authors `05-implement.md` + `06-verify.md` in tier order (P0 security → P1 major+migration → P2 safe batch); then `yolo` runs the slug-wide review. Readiness requires `01-update-deps.md` (`type: intake`), `02-shape.md`, `03-slice.md`, and `04-plan.md`, all `status: complete`; else orientation blocks with `route='/wf intake update-deps <slug>'` (or `/wf plan <slug>` when `04-plan` is the only gap).
- **Optimize loop** — `workflow-type: optimize`. `yolo` runs no trial. Until the loop's finish writes `05-implement-optimize.md`, orientation blocks with `route='/wf loop optimize <slug>'`. Then `yolo` drives verify and review of the slice `optimize`.
- **Terminal-analysis, no decided build** — `investigate`, `discover`, `ideate`, `audit`, `brainstorm` (`00-index.md` is `type: workflow-index`). `yolo` drives nothing and never routes them to `/wf slice` or `/wf plan <slug>`. Orientation blocks and hands back the mode's recorded next step: `ideate` → `/wf intake <chosen-idea>`; `investigate` → pick an option in `01-investigate.md`, then `/wf intake fix <option>`; `discover` → act on the verdict in `01-discover.md`; `audit` → each finding's route in `07-review.md` `## Triage Decisions`; `brainstorm` → `/wf intake brainstorm <slug>` (resume).
- **Task and prototype — genuine refusals** — `task` (its blast-radius gates are never resolved unattended; route `/wf intake task <slug>`) and `prototype` (the person starts every round; route `/wf loop prototype <slug> <request>`). `yolo` drives nothing on either; orientation blocks.

# Work ordering — the run's target goes first

Orientation classifies every slice by why it still has work, and the driver runs the classes in order:

- **`new-work`** — a stage was never run, is not converged, or has a substantive residual. Runs first, in roster order.
- **`deferral-rechallenge`** — every stage is terminal-clean and the only residue is an open, un-authorized runtime-evidence deferral. Runs after the target, in the same run.

The target itself — the slug-wide review in slug mode, the named slice in slice mode — sits between them.

**Bounded re-verify.** A re-challenge is a wall probe, not a verify. A read-only agent runs the recorded capability probes of the slice's open deferrals again and reports, per wall, whether it still stands. If every wall stands, the deferrals carry fresh receipts and the slice is done for this run. The driver escalates to a full verify only for a named reason — a wall fell, or the artifacts contradict the index — and records that reason as a decision.

# Control files while a driver is live

While a driver is running for a slug — or is presumed-dead and not yet reconciled — that slug's `00-index.md` and the global `.ai/workflows/INDEX.md` are driver-owned. Any writer, foreground or delegated:

1. **Re-reads immediately before every edit.** Never edit from a copy read earlier in the same agent.
2. **Treats an edit rejection as "the other writer moved"** — re-read, re-derive the change, retry once. Never force a stale string through; never rewrite the whole file to dodge the conflict.
3. **Never runs a second driver** (`auto` or another `yolo`) for the same slug while one is live.

**Slice-complete write-back.** When a slice clears every gate, the driver writes the roster entry's `status: complete` and the index `progress` block at drive time.

**Progress record.** Each stage agent runs `wf.mjs progress set` when it starts, and the `run-end` agent writes `done`, `stopped` or `waiting` with the reason and the resume command. `/wf status <slug>` reads that record.

**Plan check.** Before an implement, a read-only agent refreshes a plan that code built earlier this run contradicts.

# Two modes

- **Slug mode — `/wf yolo <slug>`** drives every slice in the roster, then the final review, then stops before handoff.
  - `review-scope: per-slice` → each slice is driven `plan → implement → verify → review`; the run ends when the last slice's review is clean.
  - `review-scope: slug-wide` → each slice is driven `plan → implement → verify`; then the single slug-wide review (`07-review.md` over the branch diff) runs once.
- **Slice mode — `/wf yolo <slug> <slice>`** drives that one slice, then routes you to the next slice.
  - `review-scope: per-slice` → `plan → implement → verify → review` for the slice.
  - `review-scope: slug-wide` → `plan → implement → verify`, then stop before review.

# The Autonomous Decision Policy (what replaces each gate)

Every gate `auto` defers to the user, `yolo` resolves by this rule. Two tiers: **auto-resolve** (proceed, recording the decision into the artifact) and **HARD-STOP** (end the run with the artifact trail and a reason).

| Gate | Auto-resolve | HARD-STOP |
|---|---|---|
| `plan` discovery interview / scope fork | Implementation-detail forks: pick the option best satisfying the slice AC at least cost; **record the assumption** in `## Assumptions`. A fork that changes **user-observable scope or a contract** (public API, data shape, UX behavior, migration) is intent-bearing: the stage returns it as a question (see the intent-bearing row). |
| `verify` failing check / unmet AC | Auto-fix: apply the minimal patch, run the stage's single fix round. Up to **2 rounds**. Before any deferral, climb the **env-remediation rung** (runtime-adapters/_ladder.md): rebind a harness-owned service to a free port and record it, boot the documented headless mode, start an existing AVD, run a provisioning script the repo ships, execute a plan-authorized install — **never defer over a port the run itself binds**. Then classify the wall (`wall-ownership`): a `code-owned` wall (the repo's own hard-coded port/host/endpoint or fixture) is **not** auto-deferrable — it is a surfaced decision. A user-observable AC the environment genuinely cannot evidence is **deferred** (verify's `interactive-verification: deferred` hatch) — lawful ONLY over a **probed** incapability: the capability probe's command + output tail is carried as a structured `probe` **receipt** on the deferral; an all-specs-skipped-at-guard sweep is never an auto-deferral. A deferral that arrives with **no** probe receipt draws exactly **one** corrective re-run demanding it; still receipt-less after that → HARD-STOP. A deferral recorded by an **earlier run** is a claim to **re-probe fresh, never inherit**. Recorded in `00-index.md` `runtime-evidence-deferrals`; the run continues at `result: partial`. | A **substantive** failure still unresolved after 2 rounds (`convergence: escalated`), a bare `result: blocked-runtime-evidence-missing`, a deferral still carrying no probe receipt after the corrective re-run, or a **`code-owned` wall with no scoped resolution**. Never fabricate runtime proof. |
| `review` triage | **Fix** every BLOCKER + HIGH + **MED (always)**. **Fix** LOW/NIT when in-scope ∧ localized ∧ safe; else **defer-and-record**. Never silently dismiss. | `verdict: dont-ship`, or an unfixable **security / data-loss** blocker after the fix loop. A finding whose fix changes an acceptance check, a confirmed design board or a craft line is a question: `wf.mjs findings questions` prints it with its key. |
| charter fidelity checkpoint (every **3** slices) | A commitment judged **honored** — drive on; **at-risk** — drive on but surface it in `outcome.charterCheckpoints`. | A commitment judged **broken**. HARD-STOP with `outcome.stoppedAt = 'charter-checkpoint'`; even an autonomous driver does not silently walk away from a charter commitment. |
| `update-deps` scope gate (Step 6) | **Proceed with the full plan** — P0 security + P1 major+migration (one at a time, only the API-forced app-code changes) + P2 safe batch. A package that fails its test/build is marked `blocked` and the run continues (`result: partial`); its `06-verify.md` deferrals reuse the runtime-evidence hatch. Never audit-only, never hand-edit lockfiles, never mix a security update with a major migration in one commit. | A substantive `06-verify.md` failure unresolved (same rule as `verify`), or a slug-wide review that returns `dont-ship` / an unfixable security blocker. |
| branch posture (`dedicated` only) | Land the tree on the slug branch **before any stage runs**: switch to it if it exists, else **create it from `base-branch`**. `shared`/`none` never switch. | A switch or create that would clobber uncommitted work (never stash/force), or a missing `base-branch` that blocks the create. |
| intent-bearing decision (per [_decision-classes.md](_decision-classes.md)) | Never autonomous, except in delegate mode. A live answer in the decision store settles it (`decide answered`). | The stage records the open question in its artifact as awaiting-input and returns `status: 'questions'`. The run stops as `waiting` with `outcome.questions`. See [Questions](#questions--the-stop-that-waits-for-the-person). |
| `intake` / `shape` / `design` (PO alignment) | **Never autonomous.** | Missing, `awaiting-input`, or unsettled ([design/_lane.md](design/_lane.md)) → stop, route to that key. |
| standing steering (live `steer` entries) | A preference tilts an auto-resolve; a satisfiable constraint is obeyed and logged in the stage's `steering-honored`. | A steering **veto** an otherwise-lawful autonomous action would cross. A veto outranks every auto-resolve above. |

Fix posture: the default action on any finding is **fix**. LOW/NITs keep a recorded defer only when the fix would reach outside the slice's diff, be non-localized, or risk a convention conflict. An unfixable finding is recorded `could-not-fix`, and is a HARD-STOP only per the `review` row.

Branch posture: under `branch-strategy: dedicated`, orientation switches to the slug branch if it exists, else creates it from `base-branch`. It never stashes or force-switches: a switch or create that git refuses because uncommitted work would be lost is a HARD-STOP. A created or switched branch is reported in `outcome.branch`.

Standing steering: each driven agent runs `decide list --kind steer` fresh (new entries reach later agents); a crossed veto stops at `steering-checkpoint`. A steering entry `yolo` cannot honor without crossing a mandatory gate or a HARD-STOP is surfaced, never obeyed into a broken state. Steering cannot authorize shipping with an open deferral or waive a `dont-ship` verdict.

Deferrals: the `verify` row above is the single normative statement of `yolo`'s deferral posture; verify.md's deferral law is the underlying law. Open deferrals from earlier runs are re-challenged fresh at orientation, and the standing pile is surfaced as `outcome.deferralPressure` (open count, oldest wall, repeat-of clusters). `/wf ship` HARD-BLOCKS until every deferral is cleared.

Negotiating the environment, precisely: before any deferral `yolo` climbs the **env-remediation rung** (runtime-adapters/_ladder.md). A reversible, run-scoped change to state the run owns is taken and recorded; state the run does not own is surfaced, never improvised. When a wall is `code-owned`, the driver may **not** quietly patch product code to unblock itself and may not defer around its own constant. A wall classified `code-owned` with no scoped resolution is a HARD-STOP, not an auto-deferral.

Charter fidelity: every **3** slices one read-only subagent reads the `charter:` block in `00-index.md` and the recent `05-implement` artifacts and judges each commitment **honored**, **at-risk**, or **broken**. `honored` drives on silently; `at-risk` drives on but is recorded in `outcome.charterCheckpoints`; **broken** is a HARD-STOP (`outcome.stoppedAt = 'charter-checkpoint'`). The checkpoint never edits or fixes. It skips a due checkpoint when no work since the last one touched the charter, and it never runs after the last slice.

Autonomy guards: apply the early-stop guard and the release valve in [_autonomy-guards.md](_autonomy-guards.md) to the driving session itself.

# Step 0 — Resolve arguments

1. **Slug + mode.** First positional after `yolo` = slug. Second positional, if present, = `<slice>` → **slice mode**; absent → **slug mode**. `yolo` owns its own slug resolution (the dispatcher excludes it from fuzzy-suggest). If the slug is empty, infer it from `.ai/workflows/INDEX.md`: exactly one `status: active` workflow → use it (slug mode); otherwise STOP with: *"`/wf yolo` needs a slug. Active workflows: `<list>`. Run `/wf yolo <slug>`."*
2. **Existence check.** Confirm `.ai/workflows/<slug>/00-index.md` exists. If not, STOP: *"No workflow `<slug>`. Run `/wf status` to list workflows, or `/wf intake <description>` to start one."* Do not fuzzy-correct here. If a description was given instead of a slug, STOP and route to `/wf intake <description>` first.
3. **Resolve the absolute paths the Workflow script needs.** The script and its stage subagents inherit no working directory:
   - `projectRoot` = the absolute root of the repo that owns `.ai/workflows/<slug>/` (the nearest ancestor containing `.ai/workflows`, capped at the git toplevel).
   - `pluginRoot` = the directory you loaded this reference from (`$CLAUDE_PLUGIN_ROOT` when set).
   - `referenceRoot` = `<pluginRoot>/skills/wf/reference`.
4. **Stage the driver script inside the repo.** The Workflow tool refuses a `scriptPath` outside the working directory. On Claude Code and pi, run it at every launch and resume (on Codex, `wf.mjs drive` runs it):

   ```
   node "<pluginRoot>/scripts/stage-yolo-driver.mjs" "<projectRoot>"
   ```

   The script copies the driver to `<projectRoot>/.scratch/wf/yolo.js`, makes `.scratch/` ignore itself, and prints one JSON line that holds `scriptPath`. A `CAUTION` on stderr means a hot-patched copy was overwritten.

# Step 1 — Start the driver

**Claude Code.** Call the **Workflow** tool:

```
Workflow({
  scriptPath: "<projectRoot>/.scratch/wf/yolo.js",   // from Step 0.4
  args: {
    projectRoot:   "<absolute repo root owning .ai/workflows>",
    referenceRoot: "<pluginRoot>/skills/wf/reference",
    slug:          "<slug>",
    slice:         "<slice>",       // slice mode only — omit for slug mode
    models:        { … },           // the `models` block of .ai/sdlc-config.json
    answered:      [ … ],           // a relaunch after questions only — see Questions
    delegate:      true             // delegate mode only — omit otherwise
    // reviewFanout (on): omit unless the person asks
  }
})
```

The workflow runs in the background. Right after this call, start the watch and the running commentary per [yolo/_commentary.md](yolo/_commentary.md).

**pi.** Call the **SubagentWorkflow** tool with the same `scriptPath` and the same `args`, plus `host: "pi"`. The workflow runs in the background. Its result reaches you as context on your next turn, and `/agents` → Workflows shows the live agents. Each agent runs on the session's model unless the `models` block names one.

**Codex.** Run one shell command, with a timeout that covers the run (several hours for a slug):

```
node "<pluginRoot>/scripts/wf.mjs" drive "<projectRoot>" <slug> [<slice>] [--answered <answers.json>] [--delegate]
```

The command stages the driver itself (Step 0.4), runs each agent as one `codex exec` call in the workspace-write sandbox, and prints the `outcome` as JSON. `--answered` names a JSON file with the `answered` array. While it runs, `wf.mjs progress show "<projectRoot>" <slug>` says where the run stands. When the command stops before its end, run it again with `--resume <run>`: the agents whose prompts did not change return their recorded results.

# Resuming — one sanctioned path

- **Slash-command `/wf` stays user-only.** A human typing `/wf yolo <slug>` is the explicit opt-in that authorizes an unattended run.
- **Relaunching the script is not a new opt-in** — it continues the run the user authorized. After a hand-back is answered, repeat Step 0.4, then the Step 1 call of your host with the same args. Orientation skips every stage already terminal-clean.
- Say what you are doing: *"resuming the driver from `<slice>`"* — not *"run `/wf yolo <slug>` yourself"*.

# Questions — the stop that waits for the person

A stage agent never asks the person. It returns each intent-bearing decision as a question: `{ key, question, options, recommended, why }`. The run stops, and `outcome.questions` holds every question with its `stage` and `slice`. The main session asks them and relaunches:

1. End the watch per [yolo/_commentary.md](yolo/_commentary.md).
2. Ask the questions with the host question tool ([_gate-question.md](_gate-question.md)), at most four per call. Put the `recommended` option first.
3. For each answer, run `wf.mjs decide add "<projectRoot>" <slug> --kind answer --by person --key <key> --question "<question>" --answer "<answer>" --stage <stage>`. Add `--slice <slice>` when the question has a slice. Keep the id that the command prints.
4. Repeat Step 0.4.
5. Relaunch with the Step 1 call and the same args, plus `answered`: one entry `{ key, stage, slice, question, answer, by: 'person', id }` per answer.

The answer reaches only the stage and the slice that asked it. Orientation skips every stage that is already terminal-clean, so the relaunch starts at the stage that asked. An answered stage can settle in three ways:

- It settles the decision and continues.
- A verify accepts the slice with its failing or residual items on the answer. The slice passes, and the verify frontmatter records `accepted-by`.
- The answer needs a new plan or new code. The stage routes back to `plan` or `implement`, and the driver runs that stage and every later stage of the slice again with the answer. A slice routes back at most twice on one answer.

**Delegate mode.** When the person says that the run decides for them, launch with `delegate: true`. Each stage settles an intent-bearing decision by the option it recommends, and records it with `--by delegate`. The run returns no questions. At the end, run `outcome.delegate.digest` (`decide list --by delegate`). Show each delegate decision to the person, who confirms or reverses it. A reversal is a `decide add --by person` with the same key: it supersedes the delegate entry. Then relaunch with that answer in `answered`.

# Hot-patching the driver mid-run

1. **Never patch the plugin cache.** A hot-patch to the installed copy is invisible to the dev tree and is erased by the next plugin update. Patch the staged copy instead; the next launch overwrites it.
2. **Write the patch down** at `.ai/patches/<date>-<symbol>.md` in the repo being worked on: the diff, the symptom, and the file + symbol it targets.
3. **Record it against the plugin dev tree** (a task, an issue, or a note).

# Step 2 — Hand back to the user

When the workflow completes, end the watch per [yolo/_commentary.md](yolo/_commentary.md), then read its returned `outcome` and emit a chat summary. Lead with a short **narrative** paragraph (prose, no bullets): which stages ran, the load-bearing decisions each produced, the autonomous calls the driver made, and why the run ended. Then the anchors:

```
wf yolo complete: <slug> [<slice>]  (mode: <slug|slice> — <endpoint reached | HARD-STOP at <stage>: <reason>>)

<Narrative paragraph.>

Prior driver: <omit when absent | outcome.priorDriver, worded per the staleness rule in _liveness.md — never "still running" unless the journal's recency supports it>
Branch: <outcome.branch — "created <target> from <base>" | "switched to <target>"; omit when yolo did not move the branch>
Stages run: <the per-slice sequence actually executed>
Autonomous decisions: <count + one-line gist, or "none recorded">
Charter: <omit when no checkpoint ran | from outcome.charterCheckpoints: all commitments honored | N at-risk (name them) | HARD-STOP on a broken commitment (name it)>
Decisions: <outcome.decisionDigest: N total by class; intent-bearing count WITH its intentBearingGuarantee qualifier — "exact" → "intent-bearing escapes: 0"; "suspect" → "intent-bearing escapes: 0 (SUSPECT — M unclassifiable; review them)"; intentBearing>0 → should-have-been-a-stop escapes>
Residual findings: <none | N deferred/could-not-fix recorded in <artifact>>
Runtime-evidence deferrals: <none | outcome.runtimeEvidenceDeferrals: N — slice/AC + reason (+ probe receipt), in 00-index.md; /wf ship is BLOCKED until each is cleared by /wf probe or a re-verify in a capable environment>
Substantive failures: <omit when absent | outcome.substantiveFailures: N — slice + result. DEFECTS, not deferrals; no /wf probe clears them>
Reconciled: <omit when absent | outcome.reconciled: N deferral classification(s) the recorded decisions or the index ledger classify differently than the driver derived — name each and the canonical source>
Clearing events satisfied: <omit when absent | outcome.clearingEventsSatisfied: N open deferral(s) whose clearing-probe reports the event HAS happened — run /wf probe <slug> to capture the evidence; nothing was cleared automatically>
Subagent errors: <omit when absent | outcome.subagentErrors: N recovered, M fatal — recovered errors changed no verdict, but the run does not claim zero>
Deferral pressure: <omit when absent | outcome.deferralPressure: N open, oldest since <date>, M repeat-of wall(s)>
Questions: <omit when absent | outcome.questions: N — key and question of each; ask them now per Questions>
Delegate decisions: <omit when not delegate mode | the entries that outcome.delegate.digest prints, each with its key and answer>
Next: <outcome.route — the routing command>
```

`Next` routing comes from `outcome.route`:
- **Endpoint, slice mode:** the next roster slice → `/wf yolo <slug> <next-slice>`; last slice → `/wf yolo <slug>` (slug-wide) or `/wf handoff <slug>` (per-slice).
- **Endpoint, slug mode:** `/wf handoff <slug>`.
- **HARD-STOP:** the gate that fired and the command to resolve it, then `/wf yolo <slug> [<slice>]` to resume.
- **Stop request** (`stoppedAt` is `stop-request`): where the run stopped, then `outcome.route`.
- **Questions** (`outcome.questions` is not empty): ask them and relaunch per [Questions](#questions--the-stop-that-waits-for-the-person). Do not wait for the person to type the command.

Rules:
- **Always emit**, even on a HARD-STOP or an orientation block. The narrative explains why it stopped.
- **Surface the autonomy.** Name the assumptions recorded and the findings fixed vs deferred. Point at the artifacts that hold the record.
- **Surface charter drift and the decision digest.** Call out `intentBearing > 0` explicitly. When `decisionDigest.intentBearingGuarantee` is `suspect`, say so in the same sentence as the zero.
- **Flag ship-blocking deferrals.** If `outcome.runtimeEvidenceDeferrals` is non-empty, say that `/wf ship` will refuse until each is cleared.
- **Honesty.** Report what ran. Do not imply the workflow is further along than the artifacts show.
- **Never re-label an input.** A verify that recorded an AC as a substantive **fail** is reported under `Substantive failures:`, never moved into the deferral list. Where the driver's derivation disagrees with a recorded decision or the index ledger, the recorded classification wins and the disagreement is named on the `Reconciled:` line.
- **State the previous driver's fate, do not infer it.** If `outcome.priorDriver` says presumed-dead, say presumed-dead and when.

