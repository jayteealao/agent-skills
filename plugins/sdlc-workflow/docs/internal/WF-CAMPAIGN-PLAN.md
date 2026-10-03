# WF-CAMPAIGN-PLAN — `/wf campaign`, many slugs in dependency waves

Status **Stage C shipped v9.178.0; Stage A run, Stage D built, and the C8/D4 scratch trial run 2026-10-03 (unreleased); the realism run is open — see section 23** · Date **2026-10-02** · Plugin **v9.176.0** · Owner **jayte**
Depends on: [BRAINSTORM-WORK-PACKETS-PLAN.md](BRAINSTORM-WORK-PACKETS-PLAN.md) (the campaign reads work packets) and [YOLO-COMMENTARY-PLAN.md](YOLO-COMMENTARY-PLAN.md) (the watch and the control file). Section 5 gives the order.

## 1. Why

A brainstorm can end in many workflow slugs. The realism brainstorm ended in
26 slugs with dependencies between them. Today a person starts each slug by
hand, in an order the person must keep in their head. Three gaps block an
autonomous run (verified 2026-10-02):

- **No cross-slug ordering.** `depends-on` exists only between slices inside one slug (`slice.md:150-154`). yolo ignores even that and drives in roster order (`yolo.js:823`). ship-plan does not order workflows (`ship-plan.md:28`). Handoff batch mode groups slugs that already share a branch (`handoff.md:50-60`). It does not order or merge them.
- **No worktrees for drivers.** yolo uses one `projectRoot` checkout and switches branches in place (`yolo.js:880-925`). Worktrees exist only for fix and review sub-agents (`_subagents.md:70`).
- **No view across slugs.** A yolo run knows its own slug. It does not know what earlier slugs actually built or what later slugs need from it. No `expects`, `as-built`, or `blocked-by` concept exists anywhere.

## 2. Name

**`/wf campaign <brainstorm-slug>`**.

A campaign is a planned series of operations, in stages, toward one goal. The
word names the whole run, not one wave or one slug, and no `/wf` key uses it.
The design references use "campaign page" for a marketing page
(`design/brand.md:3`). That is a different sense of the word in a different
context, and the key name does not collide with it.

| Candidate | Against it |
|---|---|
| `convoy` | Says "travel together". The slugs do not travel together. They go in waves. |
| `relay` | Says one runner at a time. A wave runs several slugs at once. |
| `programme` | The realism board used it for a group of pieces inside one brainstorm, so it would mean two things. |

## 3. PO decisions (2026-10-02)

| # | Decision |
|---|---|
| D1 | A brainstorm ends in one slug or many slugs. "Multi" means many slugs, not many slices. |
| D2 | A **prepare pass** with the person runs intake and shape for each slug. The campaign does not make intake or shape decisions. The yolo rule stays (`yolo.md:44,101`). |
| D3 | The orchestrator keeps in view all preceding and succeeding slugs as the waves proceed. |
| D4 | The yolo runs and the orchestrator must stay faithful to the person's intent. |
| D5 | The next wave does not wait for the person to try the output. |
| D6 | The campaign asks in Phase 1 (Prepare) whether to push each wave tag as a pre-release. The answer is recorded in the ledger and holds for the whole campaign. |
| D7 | Every slug and every wave gets a built output. There is no opt-out. |
| D8 | One PR per wave. The wave PRs form a stack, managed with `gh stack` (from Stage D2; section 5). |
| D9 | The campaign runs handoff and ship for each wave, by the project's ship plan. |
| D10 | The campaign asks the person when handoff or ship meets an issue or an ambiguity. It never guesses past one. |
| D11 | The campaign knows how much of the 5-hour and 7-day usage limits is left. It pauses its agents before a limit stops them, and resumes them after the reset. |
| D12 | The campaign state lives in the brainstorm's `work/campaign/` folder. |
| D13 | The person asked for this revision: fix every issue the 2026-10-02 review found. Section 4 lists them. |
| D14 | The usage guard is a separate small mod (Q9). |
| D15 | The budget defaults are 75% slow, 90% pause, and a 15% weekly reserve (Q10). |
| D16 | At most 2 unshipped waves wait above the trunk by default (Q11). |
| D17 | Stage C, the minimal campaign, is released to the person before Stage D (Q13). |
| D18 | A packet's size counts its carried decisions. Above 25, a split is proposed. Above 40, a split is required (Q12). |

## 4. What the review changed

The review on 2026-10-02 gave the verdict **revise**. This table maps each
finding to the section that fixes it.

| Finding | Fix | Section |
|---|---|---|
| Nothing delivers value until about 20 build waves are done | Four stages. Each stage works alone. Probes come first. | 5 |
| Parallel yolo drives in one Workflow are unproven | Probe P1 decides between one Workflow per slug and `parallel()` in one Workflow. Stage C runs one slug at a time. | 5, 19 |
| Parallel verify runs collide on ports, CPU, build folders, browsers | A resource isolation contract per worktree, a lock for heavy suites, and a disk check | 13 |
| Handoff and ship assume a PR against the trunk | Probe P2. Stage C uses PRs against the trunk. Stacking waits for Stage D2. | 5, 16 |
| A usage-limit error may not be told apart from other failures | Probe P3, with a fallback rule | 5, 17.4 |
| Usage readings may be stale | Probe P4. Stage C pauses on errors and on the person's word only. The guard comes in Stage D3. | 5, 17 |
| Carried decisions can be stale | Intake shows each carried decision with its date. The person confirms it. | 9.2, brainstorm plan section 6 |
| No partial-wave rule | A wave ships with the slugs that finished | 12.1 |
| No way to undo a merged slug | Revert the slug's merge commit | 12.2 |
| Fixes to a lower wave are not handled | Rebase only at a wave boundary | 12.4 |
| No limit on stack height | At most 2 unshipped waves | 12.5 |
| Versions assigned too early | The version is assigned at ship time | 14 |
| No forecast of time or usage | Phase 0 writes `forecast.md` | 9.1 |
| No rule for which session does what | Session roles | 8 |
| Fidelity is self-graded | A refuter checks each as-built note and each fidelity checkpoint | 11.3 |
| Migration breaks the size rule | Split pieces over 40 decisions during migration, with the person | brainstorm plan section 10 |
| Prepare runs as one big batch | Rolling prepare: wave n+1 is prepared while wave n runs | 9.3 |

## 5. Delivery stages

Each stage ends in something that works by itself. A later stage starts only
when the probes it depends on have passed.

### Stage A — Probes

Run the probes on a scratch copy of SoccerManager, on Claude Code 2.1.287 or
later, with the type file regenerated by `/plugin-types`. Write each result to
`docs/internal/CAMPAIGN-PROBES.md`.

| Probe | Question | Pass | When it fails |
|---|---|---|---|
| P1 | Can two yolo drives run at the same time, each in its own worktree? Test (a) the main session launching two Workflows, and (b) one Workflow with two drives in `parallel()`. | Both drives finish, and each writes only to its own worktree. | Stage D1 stays at width 1. |
| P2 | Do handoff and ship work for a PR whose base is another branch, not the trunk? | The readiness gate, the CI watch, and the ship steps run with no change, or with a change that the probe lists. | Stage D2 waits for that change. Stage C keeps PRs against the trunk. |
| P3 | When a Workflow `agent()` fails because of a usage limit, does the script see the error kind? | The failure carries a kind, or a message that a fixed pattern matches. | Rule 17.4 uses the fallback: an agent failure while the newest reading is over 95% counts as a usage pause. |
| P4 | Do background Workflow agents move `rateLimits` in the main session? How old does a reading get during a 2-hour stage, in the CLI and in the Desktop Code tab? | A reading is never older than 10 minutes while agents run. | The guard treats readings as unknown during long stages. The campaign runs at width 1 under the unknown rule (17.5). |
| P5 | Does a `$.prompt.submit` text that names `/wf campaign <slug>` make the model run the command? | The model runs it in the next turn. | The guard sends a push notification and a toast, and the person types the command. |
| P6 | Does gh-stack v0.1.1 append by stack number (`link <n> <pr>`) and merge the bottom PR with `merge --yes`? | Both work on a scratch repo. | Stage D2 uses plain PRs with chained bases, and `gh pr merge` on the bottom PR. |
| P7 | Can two worktrees run the SoccerManager verify at the same time? Measure ports, CPU, disk, and run time. | No collision when the isolation contract (13) is in force. | The heavy-suite lock serializes those suites. Width stays 1 for projects that declare `campaign.parallel: false`. |
| P8 | Does `gh stack rebase --upstack` move an upper wave branch cleanly after a commit lands on a lower wave branch? | A clean rebase, or a conflict that exit code 3 reports. | Rule 12.4 uses a merge of the lower branch into the upper branch, and no rebase. |

### Stage B — Parts that help today

These two plans ship before the campaign, and each helps single-slug work now.

- **B1.** [BRAINSTORM-WORK-PACKETS-PLAN.md](BRAINSTORM-WORK-PACKETS-PLAN.md): the fixed folders, the work packets, the intake packet form, decision confirmation, and the reopen rules.
- **B2.** [YOLO-COMMENTARY-PLAN.md](YOLO-COMMENTARY-PLAN.md): the watch, the commentary, and the control file with the stop request.

### Stage C — A minimal campaign

The minimal campaign runs every part of the design with the simplest
mechanics:

- One slug at a time, in the main checkout, on the slug's own branch. yolo already works this way.
- One PR per wave, against the trunk. The next wave starts when the previous wave has merged.
- No worktrees, and no `gh stack`.
- A pause comes only from a usage-limit error (17.4) or from the person (17.7). There is no usage guard yet.
- Rolling prepare, decision confirmation, the context file, as-built notes with a refuter, the drift check, the fidelity checkpoint, the failure paths, versions at ship time, outputs, try-it notes, the forecast, and reopen pick-up all work.

### Stage D — The full campaign

Each part needs the probes named.

| Part | Adds | Needs |
|---|---|---|
| D1 | Parallel slugs in worktrees, with the isolation contract (13) | P1, P7 |
| D2 | Stacked wave PRs with `gh stack`; the next wave starts before the previous wave merges | P2, P6, P8 |
| D3 | The usage guard mod and the budget (17) | P3, P4, P5 |

## 6. Shape of the command

One command. The campaign infers its phase from its ledger (convention over flags).

```
/wf campaign <brainstorm-slug>
```

| Ledger state | What the command does |
|---|---|
| No ledger | Phase 0 Orient, then Phase 1 Setup. |
| Setup not finished | Continue Phase 1 at the first open question. |
| A slug of the next wave is not prepared | Continue the rolling prepare (9.3) with the person. |
| Ready, no wave started | Show the forecast and the wave plan. Ask the person to start. |
| A wave runs | Show where it stands. Continue the rolling prepare when slugs wait for it. |
| A wave stopped | Show why. When the person answered the stop, resume the wave. |
| New or changed packets since the ledger's `work-revision` | Show the changes. Prepare the new packets with the person, then re-plan the waves that have not started. |
| A wave waits in handoff or ship for the person | Show the question again (16.4). |
| Paused for usage | Show the readings, the reason, and the reset time. Resume when the person asks, or when the usage guard resumes it (17.6). |
| All waves shipped | Ask the final release question (9.5). Show the report. Route to retro. |

`yolo` runs on Claude Code only, so the autonomous phases do too. The prepare
and setup phases are interactive and run on every host.

## 7. Files

The campaign keeps its state inside the brainstorm, beside the packets (D12).

```
.ai/workflows/<brainstorm>/work/
  index.md                      (from the brainstorm plan)
  <slug>.md ...                 (packets)
  campaign/
    ledger.json                 (the truth: phases, waves, slug states, commits, answers)
    ledger.md                   (generated view for the person)
    forecast.md                 (time and usage forecast; section 9.1)
    .campaign-journal.jsonl     (agent-start / agent-end heartbeat)
    .control.json               (pause and stop requests, read by every agent; section 17.4)
    context/<slug>.md           (the context file each yolo run reads; section 10)
    as-built/<slug>.md          (written after the slug merges; section 11.1)
    refute/<slug>.md            (the refuter's verdict on the as-built note; section 11.3)
    drift/wave-<n>.md           (the drift check before wave n; section 11.2)
    fidelity/wave-<n>.md        (the fidelity checkpoint after wave n; section 18)
    waves/wave-<n>.md           (the try-it note; section 14.4)
    commentary.md               (the campaign commentary)
    report.md                   (the campaign report)
```

Built outputs are binaries and do not go into `.ai/`. They go to:

```
<projectRoot>/.scratch/campaign/<run-id>/
  wave-<n>/                     (the wave output)
  slugs/<slug>/                 (the slug output)
  worktrees/<slug>/             (Stage D1 only)
```

The usage readings are per machine, not per campaign. They live in
`~/.claude/sdlc/usage/<sessionId>.json` (17.1).

## 8. Session roles

One session must not do everything. Monitor events would interrupt a
brainstorm question batch, and the session would compact again and again.

| Session | Runs | Does not run |
|---|---|---|
| **Campaign session** | `/wf campaign`: setup, rolling prepare, the waves in the background Workflow, the watch and the commentary, handoff and ship questions | the brainstorm |
| **Brainstorm session** | `/wf brainstorm <brainstorm-slug>` to reopen it, and `add` for a bug | no watch, no campaign commentary |
| **Any other session** | the person's own work | |

- The brainstorm owns the board and the packets. The campaign session only reads them, so the two sessions never write the same file.
- The campaign session announces in chat that it is the campaign session. When the person opens the brainstorm in it, the campaign session says once that the brainstorm belongs in another session, and continues.
- The commentary keeps notes short while the person prepares slugs (9.3). It holds full notes until the prepare batch ends, except for the push-notification events.
- The ledger and `commentary.md` hold everything the session needs after a compaction.

## 9. Phases

### 9.1 Phase 0 — Orient

1. Read the board, `work/index.md`, and every packet. Stop when the work set is single-slug. Route the person to the packet's start command.
2. Build the dependency graph from `depends-on`. Stop on a cycle, or on an `expects` line with no matching `provides` line.
3. Compute the waves. A wave is every slug whose dependencies are all in earlier waves. Two units that touch the same slug never share a wave.
4. Check that the repo tracks `.ai/`. When `artifact-tracking: ignored` (`ship-plan/init.md:128-140`), stop. A worktree of such a repo has no `.ai/workflows`, and `stage-yolo-driver.mjs:67-69` throws.
5. Read the version contract and the output recipe (14).
6. Check the tools for the stage in force: Claude Code 2.1.287 or later (17.1); gh-stack v0.1.0 or later (16.0, Stage D2); the usage guard mod (Stage D3). Record each gap for Phase 1.
7. **Write the forecast.** `forecast.md` estimates, for each slug and for the campaign:
   - the run time, from the driver journals of earlier yolo runs in this repo, per stage kind and per slice
   - the usage, from `cost.jsonl` and from the 7-day readings before and after earlier runs
   - the number of weeks the 7-day limit allows, with the reserve (17.2)
   - the slugs whose estimate has no history, marked as unknown

   The forecast is an estimate, and `forecast.md` says so. The campaign updates it after each wave with the real numbers.
8. Write the ledger, with the `work-revision` that it planned from.

### 9.2 Phase 1 — Setup (interactive)

Ask the person the campaign questions in batches, and record the answers in the ledger:

- the forecast, and whether to continue at that size or to cut the work set first
- the target version (V1)
- the output recipe, when none exists (14.2)
- whether to push each wave tag as a pre-release (D6)
- the usage budget (17.2), from Stage D3
- each tool gap from Phase 0 step 6: update Claude Code, run `gh extension upgrade stack`, or install the usage guard. The campaign does not change the person's tools by itself.
- the isolation contract (13), from Stage D1, when the project has none

### 9.3 Rolling prepare (interactive, the person decides)

Prepare runs one wave ahead, not all at once.

1. **Before wave 1,** prepare the slugs of wave 1. For each slug, run `/wf intake <packet-path>` (brainstorm plan, section 8), then `/wf shape <slug>`, then `/wf slice <slug>`. When the packet has `ux-impact` other than `none`, run the design lane too (`design/_lane.md`).
2. **Decision confirmation.** Intake shows each carried decision with the session and the date it was made, in groups of up to 8. The person confirms each group, or changes a decision (brainstorm plan, I1a). The campaign does not skip this step.
3. Set each prepared slug's `branch-strategy: dedicated`. The campaign sets `branch:` and `base-branch:` when the slug's wave starts.
4. After each shape, compare the shape with the packet's contract lines. The person confirms each change. The change is written back to the packet with `revised-by: shape`.
5. **While wave n runs,** prepare the slugs of wave n+1. When wave n's as-built notes exist before the person starts a slug of wave n+1, intake shows them.
6. **A wave starts with its prepared slugs.** An unprepared slug moves to the next wave, and its dependents move with it. The commentary tells the person which slugs wait for prepare, with a push notification.
7. The person can stop at any time. The ledger holds the progress.

### 9.3a Which packets the campaign drives

A wave is a set of yolo drives. yolo drives only the build lifecycles: standard, `fix`, `hotfix` and `refactor` (`yolo.md:48`). It refuses `investigate` and `discover` (`yolo.md:51`) and `task` (`yolo.md:52`), because their next step is the person's decision or needs the person's authorization. The campaign therefore handles each packet form as follows:

| Form | Who runs it | Where | What it gives the waves |
|---|---|---|---|
| `intake` | prepare with the person (9.3), then yolo | a wave | the built slug |
| `extension` | prepare with the person, then yolo on the existing slug | a later wave (15.2) | new slices on the slug |
| `fix` | compressed fix intake with the person, then yolo | the next wave | the corrected slug |
| `hotfix` | hotfix intake with the person, then yolo | before the next wave, on the trunk (15.2, V3) | a hotfix release |
| `task` | the person, in the campaign session, through `/wf task <slug>` | between waves; never inside a wave | the task's outcome. A packet that depends on the task waits until the task is closed. |
| `investigate` | the person, in prepare, through `/wf intake <packet-path>` | before the dependent packets are prepared | the person's pick. The pick goes back to the brainstorm (`/wf brainstorm <slug> add`), which writes the resulting packet. |
| `discover` | the person, in prepare | before the dependent packets are prepared | the verdict. A verdict that changes a carried decision goes back to the brainstorm, and the drift check runs. |
| `write-now` (brainstorm plan, 4.4) | the brainstorm session, at `done` | never reaches the campaign | the changed documents. Their `work/changes.md` entry starts the drift check. |

- **W1. A wave holds only build forms.** A `task`, `investigate` or `discover` packet never enters a wave, because yolo refuses it.
- **W2. A non-build packet blocks its dependents, not the wave.** The campaign lists it as "needs you" at each wave boundary, with a push notification. Waves whose slugs do not depend on it continue.
- **W3. Only the brainstorm writes packets.** An `investigate` pick or a `discover` verdict becomes a new or changed packet through the brainstorm (brainstorm plan, V1 and V5). The campaign never turns a result into a packet by itself.

### 9.4 Phase 2 — Waves (autonomous)

For each wave, in order:

1. **Budget and stack check.** Check the usage budget (17.3). Check the stack height (12.5). Wait when either says wait.
2. **Branch.** Create the wave branch `campaign/<brainstorm-slug>/wave-<n>`. In Stage C it starts from the trunk. In Stage D2 it starts from the tip of the wave branch below it. Create one slug branch per slug from the wave branch tip.
3. **Context file.** Write `context/<slug>.md` for each slug (10).
4. **Run.** Drive each slug with yolo.
   - Stage C: one slug at a time, in the main checkout.
   - Stage D1: up to `campaign.width` slugs at once, each in its own worktree, with the isolation contract (13). Section 19 says how the drives start.
5. **Slug output.** Build the slug output (14.3).
6. **Merge.** Merge each finished slug branch into the wave branch with `--no-ff`, in packet order (12.3).
7. **Wave verify.** Run the project's test commands on the wave branch. Use the verify rules: up to 2 fix rounds, then the env-remediation rung. A failure follows 12.2.
8. **As-built and refuter.** Write `as-built/<slug>.md` for each merged slug (11.1). Run the refuter (11.3).
9. **Fidelity checkpoint.** Write `fidelity/wave-<n>.md` (18), and run the refuter on it.
10. **Wave output.** Build the wave output and write the try-it note (14.4).
11. **Hand off and ship.** Run handoff and ship for the wave (16). In Stage C the next wave waits until this wave merges. In Stage D2 the next wave starts at once, within the stack height limit.
12. **Pick up changes.** Read `work/index.md`. When `work-revision` changed, re-plan the waves that have not started (15).
13. **Drift check.** Before the next wave, write `drift/wave-<n+1>.md` (11.2).
14. **Forecast.** Update `forecast.md` with the real time and usage of this wave.
15. **Clean up.** Stage D1: remove the worktrees of merged slugs (13, caution). Remove the slug branches that merged.

### 9.5 Phase 3 — End

When the last wave has shipped, ask the person whether to release the target
version (V1) as a final release, by the ship plan's rollout stages. A final
release is a release decision, so the campaign never makes it alone. Then
write `report.md`. The campaign runs no retro. It routes to `/wf retro` for
each slug, which the person runs.

## 10. The context file: preceding and succeeding slugs

Each yolo run gets the absolute path to its context file, in the main
checkout. Every stage agent reads the file fresh, by path, never from a copy
made at orient. This is the `steer.md` rule (`yolo.js:140-157`, since
v9.175.0). A drift note written during a wave therefore reaches the later
stages of a run that is still going.

The context file has six parts:

1. **This slug's carried decisions.** Copied verbatim from the packet, with their item keys, as the person confirmed them in prepare.
2. **Preceding slugs.** For each slug in `depends-on`, recursively: its `provides` lines and the link to its as-built note. When an as-built line differs from a `provides` line, the difference is stated first.
3. **Succeeding slugs.** For each slug that depends on this one: its `expects` lines against this slug, verbatim. The rule is "do not break these".
4. **Parallel slugs.** The other slugs in the same wave, with their `provides` lines. They have not merged yet.
5. **Drift notes.** The implementation-detail differences that the drift check recorded for this slug.
6. **Isolation.** In Stage D1, the slug's port base, build folder, and heavy-suite rule (13).

When parts 2 and 3 are longer than 200 lines, the file lists each slug in one
line with a link, and keeps the full lines only for the direct dependencies
and the direct dependents.

What the yolo run does with the context file:

- **Plan** treats each succeeding `expects` line as a constraint, the same as a Known Constraint.
- A **plan fork** that would break a succeeding `expects` line is **intent-bearing**. It adds a sixth class to `_decision-classes.md`: "changes a campaign contract line". On yolo, an intent-bearing decision stops the run.
- **Review** gets a campaign-contract scout when a context file is present. This follows the steering-scout pattern (`yolo.js:1438-1446`). A `provides` line that the diff does not meet is a HIGH finding.

## 11. As-built, drift, and the refuter

### 11.1 As-built note

For each merged slug, the note records:

- **Each `provides` line,** as one of:
  - **met**, with evidence: a commit, a `file:line`, and a test
  - **changed**, with the difference
  - **missing**
- **Each carried decision,** with its disposition from the shape `## Intake Fidelity` table and from review: `honoured`, `narrowed`, or `dropped`.
- **The decision digest** from the yolo outcome (`yolo.js:1876`), and every `## Assumptions` entry.
- **Every deferral,** with its receipt.
- **The merge commit, and the slug output.**

### 11.2 Drift check

Before each wave, compare each waiting slug's `expects` lines with the
as-built notes of the slugs it names. Use only claims that the refuter
upheld. Sort each difference into one class:

| Class | Example | Action |
|---|---|---|
| none | The line is met. | Continue. |
| implementation-detail | A function name differs. The contract is the same. | Record a drift note in the slug's context file. Continue. |
| contract | A data shape differs, or a capability is missing. | **Stop this slug and every slug that depends on it.** Continue the independent slugs. Ask the person to choose: amend the waiting slug's shape, or add a fix slug before it. |

The person owns the answer, because a contract change is a shape decision (D2).

### 11.3 The refuter

The agents that built a slug do not grade it alone. A refuter agent, separate
from the run, checks each claim in the as-built note and in the fidelity
checkpoint. This follows the yolo review pattern, where refuters check the
writer's findings (v9.174.1).

- For each **met** or **honoured** claim, the refuter tries to show that it is false: it reads the diff, runs the named test, and checks the cited `file:line`.
- A claim it disproves becomes **changed**, **missing**, or **narrowed**, with the refuter's evidence.
- A claim it cannot check, for example a test that cannot run, becomes **unverified**. The drift check treats an unverified line as a contract difference.
- The model is Sonnet 5.5 at high effort, the yolo refuter preset (`yolo.js:59-63`). No haiku.
- The verdicts go to `refute/<slug>.md`. The as-built note links them.

## 12. Failure paths

### 12.1 A slug stops during its wave

A wave ships with the slugs that finished.

1. The stopped slug keeps its branch, and its worktree in Stage D1. The ledger records the stop and its route.
2. The slugs that depend on it move to a later wave.
3. The wave PR and the try-it note list the stopped slug as moved.
4. When the person answers the stop, the slug resumes and joins the earliest wave that its dependencies allow.

### 12.2 A merged slug breaks the wave verify

1. Run the fix rounds on the wave branch (up to 2).
2. When the verify is still red, find the slug that broke it: revert the merge commits one at a time, newest first, and run the verify after each revert. Each slug merged with `--no-ff`, so one `git revert -m 1 <merge>` removes one slug.
3. Keep the other slugs merged. The reverted slug returns to "needs fix", and its branch stays. Its dependents move to a later wave.
4. When the verify is red with every slug reverted, stop the wave and ask the person. The fault is in the wave branch base, not in a slug.

The wave branch has no PR and is not pushed before the verify passes, so a
revert changes nothing that another person can see.

### 12.3 Merge conflicts inside a wave

| File | Rule |
|---|---|
| `.ai/workflows/INDEX.md` | On a conflict, regenerate the conflicting rows from each slug's `00-index.md`. Never hand-merge. |
| Origin board, `01-brainstorm.md`, and the packets | The brainstorm owns them (15). Intake writes the link-back fields in prepare, in the main checkout. The campaign only reads them. A yolo run never writes them. |
| `.ai/solutions/`, `.ai/ship-plan*`, `.ai/design/*` | yolo does not write them. A change to one of these files in a slug branch stops the merge. |
| Code | A merge agent resolves a conflict only when both sides keep their tests green and no `provides` line changes. Otherwise it stops that slug's merge (12.1) and asks the person. |

Worktree cautions, from earlier sessions:

- **CAUTION:** do not run `git add -A` in a worktree. It stages files that belong to other work.
- **WARNING:** do not run `git worktree remove --force` while the worktree has a `node_modules` junction. The command deletes through the junction into the main checkout. Remove the junction first, then run `git worktree remove` without `--force`.

### 12.4 A change lands on a lower wave (Stage D2)

CI fixes, review changes, and a hotfix can change a lower wave branch or the
trunk while a higher wave runs.

1. Never rebase a wave while its slugs run. The running slugs keep the base they started from.
2. At the next wave boundary, move the higher waves onto the new base with `gh stack rebase --upstack`. When P8 failed, merge the lower branch into the higher branch instead.
3. A conflict follows 12.3. When the rebase changes code that a merged slug's as-built note cites, run the wave verify again on the higher wave.

### 12.5 Stack height (Stage D2)

At most `campaign.max-unshipped` waves (default 2) may wait unshipped above the
trunk. When the limit is reached, the next wave does not start. The campaign
continues the rolling prepare and asks the person about the waves that wait
in handoff or ship. Each unshipped wave makes every rebase larger, so the
limit keeps the stack small.

## 13. Resource isolation (Stage D1)

Parallel slugs share one machine. The SoccerManager verify runs Playwright
with `workers: 1`, and its browser tests take about 7.5 minutes each. The
campaign therefore needs an isolation contract in
`.ai/sdlc-config.json` → `campaign.isolation`:

| Field | Meaning | Example |
|---|---|---|
| `parallel` | `false` keeps width 1 for this project. | `true` |
| `port-env` | The environment variables that set the ports the app and the tests use. Each worktree gets `base + 100 × index`. | `["PORT", "E2E_PORT"]` |
| `build-dirs` | The build folders each worktree keeps for itself. | `["target", "web/node_modules"]` |
| `heavy-suites` | The test commands that only one worktree may run at a time. | `["npx playwright test"]` |
| `min-free-gb` | The free disk space a new worktree needs. | `20` |

- The context file (10, part 6) gives each slug its ports, its build folders, and the heavy-suite rule. The verify agent applies them.
- A heavy suite takes the lock file `.scratch/campaign/heavy.lock` before it runs, and releases it after. A worktree that waits for the lock is not stalled: the verify agent appends a `lock-wait` line to the driver journal every 5 minutes while it waits, and the liveness rule counts that line as activity.
- Before the campaign creates a worktree, it checks the free disk space. When the space is below `min-free-gb`, the slug waits for a merged slug's worktree to be removed.
- When the project has no isolation contract, the campaign asks for one in Phase 1. Until the contract exists, the width is 1.

## 14. Versions and outputs

Each wave is a release unit. It ends with an output that people can install,
open, or run, and with a version when the project uses versions (D7).

### 14.1 The version contract

The campaign reads the versioning contract from `.ai/ship-plan.md` Block B:
`version-scheme`, `version-source-of-truth`, and `version-bump-cmd`. It does
not invent a second contract. SoccerManager, for example, uses `semver`,
`Cargo.toml`, and `cargo release version <x.y.z-beta.N> --execute`.

- **V1. Target version.** In Phase 1, the person sets the campaign's target version, for example `0.3.0`.
- **V2. Versions are assigned at ship time.** A wave gets its version when it becomes the next wave to ship, not when it builds. The version is the next pre-release of the target after the newest released tag: `0.3.0-beta.1`, then `0.3.0-beta.2`. The pre-release label comes from the plan's `rollout-stages` when the plan has them. Waves and hotfixes then get their numbers in the order they ship, and no two get the same number.
- **V3. Hotfix version.** A hotfix gets the next version after the newest released tag, at its own ship time. After a final release, that is the next patch, for example `0.2.0` becomes `0.2.1`. During a pre-release series, it is the next pre-release number. The person confirms the number.
- **V4. Build labels before ship.** Before a wave ships, its outputs carry a build label, not a version: `wave-<n>+<short-sha>` for a wave and `wave-<n>.<slug>+<short-sha>` for a slug. The try-it note says that the wave ships as the next pre-release.
- **V5. Bump at ship time.** When the wave is next to ship, run `version-bump-cmd` on the wave branch and commit. The wave PR carries this commit, and CI runs again on it. Ship creates the tag on the trunk after the merge, as the ship plan says (for SoccerManager, `release-trigger: tag-on-main`).
- **V6. No versioning.** When the project has no ship-plan, or `version-scheme` is `none`, there is no bump and no tag. The outputs and the try-it notes still exist, with build labels.

**WARNING:** do not push a wave tag, and do not publish a release, unless the person chose "release each wave" (D6). A pushed tag is permanent: SoccerManager's plan says "a fixed release takes a new version, never a re-used one". In Phase 1, the person chooses one of two answers:

- **Release each wave.** Ship pushes each wave tag and publishes the wave as a pre-release.
- **Merge each wave only.** Ship merges each wave PR and pushes no tag. The final release question comes in Phase 3.

### 14.2 The output recipe

The output recipe says how to build the output and how a person uses it. The
campaign takes it from the first source that has one:

1. **`campaign.output` in `.ai/sdlc-config.json`.** It holds `build-cmd`, `artifacts` (paths or globs), and `try` (how a person runs it, in plain words).
2. **The ship-plan's build jobs** (Block C `release-jobs`), when they can run locally.
3. **The person.** In Phase 1, the campaign asks the person once and writes the answer to `campaign.output`.

### 14.3 The slug output

When a slug's yolo run ends, build the slug output from the slug branch. Copy
the artifacts to `.scratch/campaign/<run-id>/slugs/<slug>/`, with the build
label (V4). A build failure is a verify failure for the slug and follows the
verify rules. The as-built note links the output.

### 14.4 The wave output and the try-it note

After the wave verify passes, build the wave output from the wave branch tip.
Copy it to `.scratch/campaign/<run-id>/wave-<n>/`, with the build label. When
the wave ships with a version, build it again from the tagged commit, and
replace the label with the version. Then write `waves/wave-<n>.md` for a
person, not for an agent. The note holds:

- the build label, and the version when the wave has shipped
- what changed for a person, slug by slug, in plain words
- the slugs that moved to a later wave (12.1)
- how to install or run the output (from the recipe's `try`)
- what to try first, taken from the slugs' acceptance criteria
- known limits: deferrals, `partial` verify results, unverified refuter lines, and open risks
- how to report a bug: `/wf brainstorm <brainstorm-slug> add <text>`, in the brainstorm session (8)

The commentary sends a push notification: "Wave 2 is ready to try."

The next wave does not wait for the person to try the output (D5). Bugs that
the person finds come back as packets (15).

## 15. A brainstorm reopened during the campaign

The person can resume the brainstorm in the brainstorm session (8) while the
campaign runs. The brainstorm owns the board and the packets. The campaign
only reads them ([BRAINSTORM-WORK-PACKETS-PLAN.md](BRAINSTORM-WORK-PACKETS-PLAN.md), section 9).

### 15.1 How the campaign sees a change

- The watch reads `work-revision` in `work/index.md`. When the revision changes, the watch emits a `work-changed` event. The commentary says what changed and which packets need prepare. It sends a push notification.
- At each wave boundary (9.4, step 12), the campaign compares `work/changes.md` with the ledger's `work-revision`. Waves that already started are never re-planned. The waves that have not started are computed again.
- `work/index.md` is written by a different session, and the write may not be atomic. A read that does not parse is retried once at the next boundary.

### 15.2 What the campaign does with each change

| Change | Action |
|---|---|
| New `intake` packet | Joins the rolling prepare. When it is prepared, it enters the earliest wave its `depends-on` allows. |
| New `task`, `investigate` or `discover` packet | Runs with the person outside the waves (9.3a). Its dependents wait for it (W2). |
| New `write-now` entry in `work/changes.md` | Run the drift check over every slug that carries or expects a changed document. |
| `extension` of a slug that merged | A new unit on that slug. It runs as extension slices in a later wave. |
| `extension` of a slug in the running wave | Waits until the slug merges, then runs in a later wave. |
| `extension` of a slug that is prepared but not started | The person re-prepares the slug (shape and slice) with the new scope. No separate unit. |
| `fix` (a bug) | Prepare is the compressed fix intake, with the person. It enters the next wave. When it changes a `provides` line, the drift check runs over the waiting slugs. |
| `hotfix` (`urgency: urgent`) | A hotfix runs before the next planned wave. It branches from the newest released tag on the trunk. Its PR targets the trunk directly, outside any stack, and ships first. It takes its version at ship time (V3). The higher waves move onto it at the next wave boundary (12.4). |
| Changed contract lines | Run the drift check over every waiting slug. |
| `pending-cut` of a started packet | Stop the slugs that depend on it. Ask the person: keep the work, or revert it (12.2 gives the revert). |
| New `depends-on` that makes a prepared slug wait for a new packet | Move the prepared slug to a later wave. The commentary says so. |
| A carried decision changed in prepare (brainstorm plan, I1a) | Run the drift check over the slugs that carry or expect that decision. |

### 15.3 Rules

- **R1. One slug, one unit at a time.** Two units that touch the same slug never share a wave. This covers extension units and fix units.
- **R2. Prepare runs beside the waves,** in the campaign session (8). The person can prepare new packets while a wave runs.
- **R3. The ledger records the revision.** Each wave records the `work-revision` it was planned from. The report lists each revision and what it added.

## 16. Handoff and ship per wave

Each wave is one PR (D8). The campaign runs handoff and ship for each wave by
the project's ship plan (D9). It asks the person at every issue or ambiguity
(D10).

- **Stage C:** each wave PR targets the trunk. The next wave starts when the previous wave has merged.
- **Stage D2:** the wave PRs form a stack, and each wave branch builds on the wave branch below it.

```
main (trunk)
 └── campaign/<brainstorm>/wave-1   → PR (base: main)
  └── campaign/<brainstorm>/wave-2  → PR (base: wave-1)
```

`gh stack` stacks are strictly linear, and waves are linear too. The slugs
inside a wave merge into one wave branch before the wave has a PR.

### 16.0 gh-stack version (Stage D2)

The campaign needs gh-stack **v0.1.0 or later**, for `gh stack merge`. The
latest release is v0.1.1 (2026-09-02). This machine has v0.0.2.

- When the version is older than v0.1.0, Phase 1 asks the person to run `gh extension upgrade stack`. The campaign does not upgrade a tool of the person's by itself.
- v0.1.1 bundles a new, shorter `gh-stack` agent skill. The copy in `.claude/skills/gh-stack` of this repo predates v0.1.0, and it still says that the CLI cannot merge stacked PRs. Replace that copy with the bundled skill before Stage D2.
- Each command the campaign uses is listed in one place, `reference/campaign/_gh-stack.md`, with the lowest version that has it. A newer gh-stack then changes one file.

### 16.1 Handoff

1. Set each merged slug's `branch:` to the wave branch, and its `base-branch:` to the trunk (Stage C) or to the wave branch below (Stage D2).
2. Run handoff in batch mode on the wave branch. Batch mode already builds a roster of the slugs that share one branch, and opens one PR with one package (`handoff.md:50-60`). The ship-plan readiness check and the RIM hard-block run as today. In Stage D2, apply the handoff changes that P2 listed.
3. **Stage D2:** link the wave PR into the stack.
   - Wave 1 creates the stack with `gh stack link <pr-wave-1>`. The bottom PR targets the repo's default branch, or `--base` when the trunk is another branch.
   - Each later wave appends with `gh stack link <stack-number> <pr-wave-n>`. The ledger records the stack number.
   - When the repo does not have stacked PRs (exit code 9), keep plain PRs with chained bases.
4. Watch CI to its end state, as handoff does today.

**CAUTION:** run every `gh stack` command non-interactively. Give `link`, `checkout` and `merge` their arguments. Use `submit --auto`, `view --json`, and `merge --yes`. A command without its arguments opens a prompt or a TUI, and the campaign hangs.

**CAUTION:** do not turn on auto-merge for a wave PR. `link` rejects a PR with auto-merge on, and an auto-merged PR breaks the wave order.

### 16.2 Ship

1. Ship the waves in order. Wave n ships only after wave n−1 shipped.
2. When the wave is next to ship, bump the version (V5) and wait for CI on the bump commit.
3. Run ship in batch mode for the wave PR. Batch mode is all-or-nothing per PR (`ship.md:56,63-65`).
4. Merge the wave PR.
   - Stage C: ship's own merge step.
   - Stage D2: `gh stack merge <pr-wave-n> --yes --<method>`, or `gh pr merge` on the bottom PR when P6 failed. The method is the one the ship plan names, or the one the repo allows. `ship.md` gets a merge-command switch for this; P2 lists the exact change.
5. After the merge, follow the ship plan for the D6 answer:
   - **Release each wave:** create the tag, run the release workflow, run the Block D post-publish checks, and move to the rollout stage for a pre-release.
   - **Merge each wave only:** create no tag.
6. Stage D2: run `gh stack sync` at the next wave boundary (12.4). When the local stack and the GitHub stack differ, `sync` in a non-interactive run stops safely. The campaign then asks the person.

### 16.3 What the next wave does meanwhile

- Stage C: the next wave waits for the merge. The campaign continues the rolling prepare.
- Stage D2: the next wave builds on the wave branch below it, within the stack height limit (12.5). A wave that cannot ship holds up only the ship of the waves above it.

### 16.4 When the campaign asks the person (D10)

The campaign stops the handoff or ship of a wave, and asks the person, when
any of these happen:

- **CI red.** Diagnose only, then ask. This is the handoff rule today.
- **The readiness gate finds drift.** The person chooses amend or acknowledge, as `ship-plan/_readiness-gate.md` says.
- **The branch needs a human approval.** A branch-protection rule needs a review. The campaign never approves its own PR.
- **The merge command refuses**, or the merge queue rejects the wave.
- **`gh stack sync` finds that the local and GitHub stacks differ.**
- **The version is already released**, or the version does not match.
- **A post-publish check fails.**
- **A recovery playbook step deletes a tag or a release.**
- **A rebase or merge conflict needs a resolution that changes behaviour.**
- **An open RIM or an intent-bearing decision appears.**
- **Anything the ship plan does not cover**, or covers in two ways.

**WARNING:** do not run a ship-plan recovery step that deletes a tag, a release, or a remote branch without the person's yes. These deletions cannot be undone.

Each question goes out as a push notification and is recorded in the ledger. A
re-run of `/wf campaign <brainstorm-slug>` shows the open question again.

### 16.5 Commentary

The watch adds these events: `pr-opened`, `ci-result`, `merged`, `released`,
and `asked`. `released` and `asked` send a push notification.

## 17. Usage limits: pause and resume

A campaign can run for days. Its agents spend the same account limits as the
person's own sessions: a 5-hour window and a 7-day window. The same rules
apply to a single `/wf yolo` run.

- **Stage C** pauses only on a usage-limit error (17.4) and on the person's word (17.7). The forecast (9.1) gives the person the expected size before wave 1.
- **Stage D3** adds the usage guard mod and the budget.

### 17.1 Where the numbers come from (Stage D3)

A Claude mod reads the numbers. Sources, read 2026-10-02:

- The announcement, 2026-10-01: https://claude.com/blog/claude-code-mods
- The docs: https://code.claude.com/docs/en/plugins/mods/overview, and the `create`, `reference`, `api`, `events`, `test`, `troubleshoot`, and `admin` pages beside it
- The sample mods: https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods (`token-weather`, `blast-radius`, `replay-theater`)
- The built-in mods: https://github.com/anthropics/claude-code/tree/main/mods
- The type file of the running build, written by Claude Code 2.1.286 when the `plugin-authoring` skill loaded

**Version.** The docs say: "Mods require Claude Code v2.1.287 or later, and they're on by default." This machine runs 2.1.286. Stage D3 therefore requires 2.1.287 or later. Up to 2.1.286 the API was early access, and the sdlc mod in `hooks/mod/` ran under it. The README in `anthropics/claude-code/mods` still says "Early access … may change between releases without notice". The per-build type file stays the authority.

**Where mods run** (the docs' "Where mods run" table):

| Host | Hooks run | Drawing shows |
|---|---|---|
| Terminal `claude`, also in an editor's terminal and in JetBrains | yes | yes |
| Desktop app, Code tab | yes | yes, except terminal-only elements |
| Desktop app, WSL session | no: plugins are not available in WSL sessions | no |
| VS Code extension chat panel | yes | no |
| `claude -p` and the Agent SDK | yes | no |
| Remote Control from claude.ai or mobile | yes, in the session on the person's machine | only in the terminal on that machine |
| Cloud session | only for a plugin that reaches the cloud session | no |

The SoccerManager yolo session ran in the Desktop app (`"entrypoint":"claude-desktop"`). Hooks run there.

**The API the guard uses** (the type file and the docs' API page):

| Part | What it does |
|---|---|
| `session.measure` event | Fires "after each main-thread turn, and when a rate-limit window moves a whole point". Its input carries `rateLimits` and `changed`. The figures are "pushed, not polled". |
| `$.session.usage()` | Returns `{ startedAt, context, rateLimits, cost }`. `rateLimits` is a list of `{ kind, percentUsed, resetsAt }`. `kind` is `five_hour`, `seven_day`, or a gateway's `spend_limit`. `resetsAt` is ISO 8601. "The plain call costs nothing." |
| `$.clock.every(ms, fn)`, `$.clock.after(ms, fn)` | Timers. "The timer's callback runs outside any event, so it keeps running between turns and doesn't start one." Timers stop when the module reloads. |
| `$.prompt.submit({ text })` | "The call waits until the session is idle and then starts a new turn." Claude reads the text after a sentence that names the mod as the sender. The guard does not use `asUser: true`. |
| `$.fs.write(path, text)` | Writes a file with the person's permissions. "`write` isn't atomic." The limit is 4 MiB per file. |
| `$.store` | Values kept across sessions, 4 MiB in total. |

The limits that the docs give:

- `rateLimits` holds "the rate-limit windows the last API response reported". It is "empty off a subscription or before the first reading".
- A hook runs for at most 10 seconds of its own time.
- A reload resets module variables and drops timers. `session.start` fires again on a reload. It does not fire again after `/clear`, `/resume`, or `/branch`.
- Installed mods share one worker thread. Three untraced crashes unload every mod that is not built in, for the rest of the session.
- An organization can block mods: `allowManagedModsOnly`, and `disableAllHooks`, `--safe-mode`, or `--bare` turn them off.

**The usage guard.** A small mod, separate from the `/wf` key logic (Q9), with these parts:

1. **Reading.** A `session.measure` hook reads `e.rateLimits` when `changed` includes `rateLimits`. A `$.clock.every(60_000)` timer calls `$.session.usage()` as well.
2. **Recording.** It writes each reading to `~/.claude/sdlc/usage/<sessionId>.json`. Each session writes only its own file, because `$.fs.write` is not atomic. A reader takes the newest file.
3. **Showing.** It shows both windows with `$.ui.status`. A crossed budget line raises a `$.ui.toast`.
4. **Pausing.** When a live campaign or yolo run crosses its budget (17.2), it writes the pause to the run's control file (17.4). The pause needs no model turn and costs no tokens.
5. **Resuming.** When the reset time of a pause passes, it clears the control file and resumes the run (17.6).
6. **Restarting.** It starts the timer in `session.start`. It also starts the timer from the first `session.measure` event when no timer runs, because `session.start` does not fire again after `/clear` or `/resume`.

**How fresh the numbers are.** P4 decides. When P4 fails, the guard treats readings as unknown while background agents run (17.5).

**The status line is a fallback.** The status line JSON carries the same windows: `rate_limits.five_hour` and `rate_limits.seven_day`, each with `used_percentage` and `resets_at` (https://code.claude.com/docs/en/statusline). When mods are off, a status line wrapper can write the same reading file. The wrapper must chain the person's own status line command, which is `oh-my-posh claude` on this machine. The setup asks the person before it changes `settings.json`.

### 17.2 The budget (Stage D3)

In Phase 1, the campaign asks the person for the budget, with these defaults. The ledger records the answer.

| Setting | Default | Meaning |
|---|---|---|
| `five-hour.slow` | 75% | Above this, the width drops to 1 slug, and no new slug starts while another slug runs. |
| `five-hour.pause` | 90% | Above this, no new agent starts. The campaign pauses until the window resets. |
| `seven-day.reserve` | 15% | The campaign never uses the last 15% of the 7-day window. That part is for the person's own work. |

### 17.3 Before each agent (Stage D3)

The campaign checks the budget at each agent boundary:

1. **Under `slow`.** Continue at full width.
2. **Between `slow` and `pause`.** Finish the slugs that run. Start no new slug. Prefer to finish a wave, so that the wave can ship, before the next wave starts.
3. **Over `pause`, or inside the 7-day reserve.** Request a pause (17.4).
4. **The cost estimate.** The forecast (9.1) gives the expected cost of each stage kind. When the next agent's estimate does not fit under `pause`, wait for the reset instead of starting it. A stage that stops half-way wastes the work it did.

### 17.4 Pause

The Workflow script has no file access (`yolo.js:18-23`). Only its agents can read files. So the pause uses the same path as `steer.md`:

1. The writer puts `{action: "pause", reason, until}` in `work/campaign/.control.json`. For a single yolo run, the file is `.ai/workflows/<slug>/.control.json`. The writer is the usage guard (Stage D3), the main session on a usage-limit error, or the main session on the person's word.
2. Every agent prompt tells the agent to read the control file first, fresh, by path. When the file asks for a pause, the agent does no work and returns `status: "paused"`. An agent that cannot parse the control file reads it again once, and then treats it as a pause.
3. On a `paused` return, the driver starts no new agent. It ends cleanly with `stoppedAt: "usage-pause"`. Agents that already run finish their current stage.
4. The ledger records the pause, the reason, and the reset time. The commentary says why the campaign paused and when it resumes. It sends a push notification.
5. During a pause, the commentary goes quiet. Each note costs tokens from the same limits.

**When a limit stops an agent.** An agent can fail with a usage-limit error. When P3 passed, the driver reads the error kind. When P3 failed, the driver counts an agent failure as a usage pause when the newest reading is over 95%, or when the failure message matches the usage-limit pattern that P3 recorded. A usage pause is not a failure. The stage is not done, so the resume runs it again. In Stage C, the main session writes the pause with the reset time the error states, or asks the person when the error states none.

### 17.5 Numbers unknown

When there is no reading, or the newest reading is older than 10 minutes, the
campaign runs at width 1. It pauses on the first usage-limit error, until the
reset time that the error states. When the error states no time, the
campaign asks the person.

### 17.6 Resume

1. The usage guard's timer sees that the current time passed the reset time that caused the pause. It clears the control file and calls `$.prompt.submit` with the text: "The usage window reset. Resume the run with /wf campaign <brainstorm-slug>." For a yolo run, the text names `/wf yolo <slug>`. When P5 failed, it raises a toast and a push notification instead, and the person types the command.
2. The command relaunches the Workflow.
   - It passes `resumeFromRunId` when the run id is known. The Workflow then returns the finished `agent()` calls from its cache.
   - Without the run id, the resume still works. yolo resume is free: orient reads the artifact trail and skips the stages that are done (`yolo.md:24`).
3. When the session is closed at the reset time, nothing resumes it. The person's next `/wf campaign <brainstorm-slug>` resumes it.
4. In Stage C, the main session resumes at the reset time through a session-scoped scheduled task (`CronCreate`, one shot), or on the person's word.

### 17.7 The person's own pause and resume

The person can say "pause the campaign" or "resume the campaign" at any time. The main session writes or clears the control file. A pause can name one slug, a wave, or the whole campaign. This control file also carries the stop request from the commentary plan.

## 18. Intent fidelity across the campaign

The campaign charter is the union of all carried decisions in all packets. The brainstorm plan makes every kept decision land in exactly one packet (its I6).

- **F1. One chain of keys.** Brainstorm item key → packet `carried-decisions` → intake confirmation and `origin-items` → charter `source` → shape Intake Fidelity row → review → as-built note → refuter verdict. Each link cites the key.
- **F2. Confirmed before use.** The person confirms each carried decision at prepare (9.3, step 2). A changed decision is the person's new answer, and the chain carries the new text.
- **F3. Checkpoint after each wave.** `fidelity/wave-<n>.md` lists every carried decision of the merged slugs with its disposition. The refuter checks each line (11.3). A `narrowed` or `dropped` decision with no quoted answer from the person stops the campaign before the next wave.
- **F4. Coverage before the end.** The report lists every carried decision of the campaign as honoured, narrowed (with the person's answer), dropped (with the ratification), changed at prepare, or not yet built (with its slug).
- **F5. The yolo rules stay.** Intent-bearing decisions stop the run. A steering veto outranks every auto-resolve. The charter checkpoint runs every 3 slices. The campaign adds rules and removes none.
- **F6. A stop is local.** A stopped slug blocks only the slugs that depend on it. The ledger shows what waits on which answer.
- **F7. Size.** A packet with more than 40 carried decisions cannot be prepared (D18). The person splits it first (brainstorm plan, section 7). This keeps each fidelity table readable for the person and the review.

## 19. How the drives start

yolo is a Workflow-tool script (`skills/wf/workflows/yolo.js`, 2487 lines), staged into `.scratch/wf/` by `stage-yolo-driver.mjs`.

- **Stage C.** The campaign session launches one yolo Workflow per slug, one at a time, in the main checkout. yolo needs no change except the context file path and the control file (10, 17.4). The wave steps between drives (merge, verify, as-built, refuter, fidelity, outputs, handoff, ship) run as agents of a separate boundary Workflow, `campaign-boundary.js`, staged the same way.
- **Stage D1, when P1(a) passed.** The campaign session launches up to `campaign.width` yolo Workflows at once, each with `projectRoot` set to its worktree. yolo is not refactored.
- **Stage D1, when only P1(b) passed.** Move the yolo drive phase into a function that takes `{projectRoot, slug, contextPath}`. yolo calls it once. The campaign calls it once per slug, in `parallel()`. A build step writes both staged scripts from one source, so the two drivers cannot drift.
- **Models.** The presets stay (`yolo.js:59-63`): Opus 5.5 for orient, the stages, the merge agent, and the drift and fidelity writers; Sonnet 5.5 for scouts, classifiers, and the refuter. No haiku.
- **Ownership.** The campaign owns `work/campaign/*` and the main checkout's `INDEX.md` while it is live. It does not own the board, the packets, or the brainstorm's `00-index.md` (15). The rules in `_control-file-ownership.md` apply.

## 20. Watch and running commentary

The campaign uses the watch from
[YOLO-COMMENTARY-PLAN.md](YOLO-COMMENTARY-PLAN.md), section 4:

- one watch per wave over every slug in the wave and the campaign journal
- one line per stage end of a parallel slug
- a full note at each slug's end and at each campaign event (merge, wave verify, refuter verdict, drift, fidelity)
- the usage events `usage` and `usage-reset` (17)
- a stop request that can name one slug, the wave, or the campaign
- short notes while the person prepares slugs (8)

## 21. Build plan

| Step | Content | Stage | Needs |
|---|---|---|---|
| A1 | Probes P1–P8 on a scratch copy of SoccerManager; results in `CAMPAIGN-PROBES.md` | A | Claude Code 2.1.287 |
| B1 | Brainstorm packets plan, all its waves | B | |
| B2 | Commentary plan W0–W3 (watch, commentary, control file) | B | |
| C1 | Red-first tests: wave computation, same-slug exclusion, cycle detection, partial waves, revert search, drift classes, version order at ship time | C | B1 |
| C2 | `reference/campaign.md`: Phase 0 (forecast), Phase 1 (setup), rolling prepare with decision confirmation, the ledger and its states, session roles. Register the key in the dispatcher and the docs. | C | C1 |
| C3 | Phase 2 at width 1 in the main checkout: context files, `campaign-boundary.js`, merge, wave verify, failure paths 12.1–12.3, as-built notes, the refuter, the drift check, the fidelity checkpoint. Add the sixth decision class and the campaign-contract review scout. | C | C2, B2 |
| C4 | Versions at ship time, outputs, build labels, try-it notes (14) | C | C3 |
| C5 | Handoff and ship per wave against the trunk (16, Stage C) | C | C4 |
| C6 | Pause on a usage-limit error and on the person's word; resume (17.4, 17.6 step 4, 17.7) | C | C3, P3 |
| C7 | Reopen pick-up (15): the `work-changed` event, re-plan, every row of 15.2, the hotfix | C | C5 |
| C8 | Live run on the converted realism fixture, waves 1 and 2, with one reopen and one `add` between them | C | C1–C7 |
| D1 | Worktrees, the isolation contract, the heavy-suite lock, the disk check, parallel drives (13, 19) | D | P1, P7, C8 |
| D2 | Stacked wave PRs: `_gh-stack.md`, the version check, the stale skill copy, the handoff and ship changes from P2, `max-unshipped`, rule 12.4 | D | P2, P6, P8, C8 |
| D3 | The usage guard mod, the budget, the boundary check, the status line fallback (17.1–17.3, 17.5, 17.6) | D | P3, P4, P5, C6 |
| D4 | Live run at width 3 with stacking and the guard, on later realism waves | D | D1–D3 |
| E1 | Docs, CHANGELOG, version bump for each stage that ships | all | |

## 22. Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Where does the campaign state live? | **Decided: `work/campaign/`** (D12). |
| Q2 | One PR for all waves, or one PR per wave? | **Decided: one PR per wave, stacked with `gh stack`** (D8), from Stage D2. |
| Q3 | How many slugs run at once in one wave? | 3 by default, from Stage D1, set by `campaign.width`. |
| Q4 | Can the person add work in the middle of a campaign? | Yes. Section 15 answers this. |
| Q5 | What happens to a slug whose yolo run stops? | Section 12.1 answers this. |
| Q6 | Does the next wave wait until the person tries the output? | **Decided: no** (D5). |
| Q7 | A standing yes to push each wave tag as a pre-release? | **Decided: the campaign asks in Phase 1** (D6). |
| Q8 | Is the slug output always built? | **Decided: every slug and every wave** (D7). |
| Q9 | Is the usage guard a separate mod, or a module inside the sdlc mod? | **Decided: a separate small mod** (D14). Reading the limits is useful in every session, also without `/wf`. Installed mods share one worker thread, so a small mod also limits the damage of a crash. |
| Q10 | Are the budget defaults right: 75% slow, 90% pause, 15% weekly reserve? | **Decided: yes, as defaults** (D15). The person can change them in Phase 1. |
| Q11 | How many unshipped waves may wait above the trunk? | **Decided: 2 by default** (D16), set by `campaign.max-unshipped`. |
| Q12 | What is the size limit for a packet? | **Decided** (D18): soft limit 25 carried decisions, hard limit 40 (brainstorm plan, Q5). |
| Q13 | Is the minimal campaign (Stage C) worth releasing to the person before Stage D? | **Decided: yes** (D17). It runs the realism waves unattended overnight at width 1, and every later stage adds speed, not new behaviour. |

## 23. Build status and the earn rule

### The earn rule for the 24th key

SURFACE-POLICY.md admits a new key only with five items. These are the five for `campaign`.

1. **The job.** Drive the many workflow slugs that one brainstorm ended in, in dependency waves, so the person does not keep the order in their head. No other key does this: `auto` and `yolo` drive one slug, and `status advise` sequences without driving.
2. **Real use.** In SoccerManager, the brainstorm `brainstorm-realism-additions-20260922` ended in slugs that the person started by hand, in an order the person kept in their head: `realism-speed-and-replay-foundation` (created 2026-09-26, yolo run `20260926T131531Z`), `engine-modules` (2026-09-29, yolo run `20260929T170310Z`), `task-update-realism-documents` (2026-10-02), `task-realism-programme-design-docs`, and `task-update-for-real-players`. Each carries `origin-brainstorm: brainstorm-realism-additions-20260922`.
3. **The budget.** `SKILL.md` gained one table row and one roster word, and stays at its cap (120 lines, 1715 words) after a trim. `load-baseline.json` covers the new key. Its citation graph is 52 files, under the limit of 60.
4. **The eval.** `tests/evals/cases/campaign.json` (order 130) runs `/wf campaign` on the new two-packet fixture `campaign-packets` and checks that orient writes `ledger.json` and `forecast.md`, and changes nothing outside `.ai/`.
5. **The pin.** `surface-policy.json` `keys: 24`; the SURFACE-POLICY.md pin history names this section.

### What is built

| Step | State | Where |
|---|---|---|
| C1 | Built, red first. 12 library tests, 7 script tests, 6 driver tests. | `tests/unit/lib/campaign.test.mjs`, `tests/unit/campaign-cli.test.mjs`, `tests/unit/skills/yolo-campaign.test.mjs` |
| C2 | Built. The key is registered in the dispatcher, the picker catalog, the surface pins, the README, the doc site, and the manifests. | `lib/campaign.mjs`, `scripts/campaign.mjs`, `reference/campaign.md`, `reference/campaign/_phases.md` |
| C3 | Built. The yolo args `contextPath` and `campaignControlPath`, decision class 6, and the campaign-contract review scout. | `workflows/campaign-boundary.js`, `reference/campaign/_boundary.md`, `yolo.js` |
| C4 | Built. `version wave\|hotfix`, `label`, the slug and wave outputs, the try-it note. | `reference/campaign/_waves.md`, "Versions and outputs" |
| C5 | Built as procedure. One PR per wave against the trunk, through `/wf handoff` and `/wf ship` in batch mode. | `_waves.md`, "Handoff and ship per wave" |
| C6 | Built. `pause` writes the campaign control file; every yolo agent reads it fresh. | `scripts/campaign.mjs`, `_waves.md`, "Pause and resume" |
| C7 | Built. The `work-changed` action, `replan`, and the pick-up table. | `_phases.md`, "Reopen pick-up" |
| C8 | Run on a scratch project first (`jayteealao/campaign-probes`, the `tally` tool, 3 packets, 2 waves), by the person's choice. Both waves shipped (PR #6 `0d993e3`, PR #7 `e2c6ff2`); 3 of 3 carried decisions honoured; wave 1 took 43 minutes, wave 2 took 28. No reopen and no `add` ran: the realism run with them is open. Findings below. | `.campaign-probes/trial/` (outside the repo) |
| A1 | Run. P1, P2, P6, P7, P8 pass (P2 and P7 with changes); P3 passes for the session and falls back inside the Workflow; P4 and P5 need a session that runs the usage guard. | `docs/internal/CAMPAIGN-PROBES.md` |
| D1 | Built. `campaign.isolation`, `worktree <key> add\|remove`, `lock acquire\|release`, `budget`, the width rule, and the isolation part of the context file. | `lib/campaign.mjs`, `scripts/campaign.mjs`, `_waves.md` step 5 |
| D2 | Built. `stack enable\|disable\|set`, the gh-stack tool gap below v0.1.0, the stacked wave start, `max-unshipped`, and `_gh-stack.md`. gh-stack on this machine is v0.2.0. | `campaign/_gh-stack.md`, `_waves.md` "Handoff and ship per wave" |
| D3 | Built. The usage guard in the sdlc mod: readings, the status line, the pause into the control file, the resume prompt. Setting `usageGuard`. | `hooks/mod/usage.ts`, `hooks/mod/usage-guard.ts`, `hooks/mod/register.ts` |
| D4 | Partly run with C8: worktrees, stacked PRs (stack #8, `link`, `merge`), ship plan, cleanup. Width stayed 1 (no usage reading in the 9.178.0 mod), so width 3 and the guard are open for the realism run. | — |

The commentary plan's W5 (the watch in a campaign, K1–K6) is built with Stage C. See YOLO-COMMENTARY-PLAN.md section 7.

### Departures from the plan

- **A shape change at prepare goes through the brainstorm.** The plan let prepare record a changed contract line as `revised-by: shape`. The brainstorm owns the packets, and the packet hook freezes a started packet, so the campaign asks the person to change the line with `/wf brainstorm <slug> add` in the brainstorm session instead.
- **"Merge each wave only" uses ship for its gates and its merge.** It bumps nothing, tags nothing, and publishes nothing. When ship has no way to skip one of those steps, the campaign asks the person.
- **The campaign script, not the session, writes the ledger.** Every ledger change goes through `scripts/campaign.mjs`, which also regenerates `ledger.md`. The boundary driver returns its outcome and never edits the ledger.
- **The usage guard runs from `register.ts`.** A mod has one module and may hook each event once, so `usage-guard.ts` exports `start` and `measure`, and `register.ts` calls them from its own `session.start` and `session.measure` hooks.
- **`port-env` is a map.** Each port variable maps to its base value; drive i gets base + 100·i.
- **Setup asks a `budget` answer.** The person keeps 75 / 90 / 15 or sets other lines.
- **P2 changed ship.** A stacked PR merges with `gh stack merge <pr> --yes --<method>`, and `base-branch` moves to the trunk before ship.
- **`gh stack link` needs two PRs.** Wave 1's PR joins the stack when wave 2's PR opens.
- **A budget without a reading gives width 1.** With an isolation contract, the drives then run one at a time in their worktrees (found in the trial; `_waves.md` step 5 now says so).
- **`worktree <key> remove` deletes the watch cursor first.** `.watch-state.json` is machine-local and never committed; left in place, git refuses the remove (found in the trial).
- **`gh stack merge` rebases the next wave.** After a squash merge it rebases the next wave branch onto the trunk and force-pushes it, which drops the wave's merge commits. `_gh-stack.md` says to move the local branch to its remote before a commit.
- **`gh stack sync` needs local tracking.** `link` creates the stack on GitHub only, and `sync` exits with "is not part of a stack". Two waves need no `sync`; three or more are untested.
- **Slug branches are deleted at the boundary.** After a squash merge or a stack rebase, `branch -d` refuses every slug branch. The boundary deletes them in the wave worktree, where the wave branch holds their merge.
- **The wave merge runs in a wave worktree.** The boundary agents checked out each wave branch in `wt/wave-<n>`, so the main checkout stays on the trunk for the rolling prepare. `_boundary.md` now says so.
- **A wave-end ends the watch only when no other wave is open.** Wave n ships while wave n+1 runs; the old rule ended the wave n+1 watch.
- **Open: the tokens per wave are unknown.** The cost hook writes each turn to the active slug of the session, the brainstorm. The yolo drives run inside the campaign session, so the slugs have no `cost.jsonl`, and step 10 reads them.
- **The yolo commentary file does not link `campaign.md`.** That one link put the whole campaign graph into the yolo graph (yolo measured 66 files with the link and 29 without it), so the commentary names the key in plain text.
