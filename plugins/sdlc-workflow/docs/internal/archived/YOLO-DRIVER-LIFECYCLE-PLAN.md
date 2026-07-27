# Yolo Driver Lifecycle & Aggregation-Truth Plan

Status: **SHIPPED as v9.141.0 (2026-07-27, `9bd278d1`, pushed)** — W1–W9 all landed
(W0 was already closed before the build); version bump, dist rebuild and runtime sync
are done and `origin/master` carries it. See "Build record" at the foot of this file.

Built in one session while HANDOFF-SHIP-STREAMLINE was built in another against the same
working tree; the two collided once on `yolo.js` and split cleanly afterwards. Guarded by
the extended `tests/unit/skills/yolo-gates.test.mjs` and `shared-reference-drift.test.mjs`.

One design change from what this document proposed: **W1.1's heartbeat rides the
subagents, not the script.** The Workflow runtime denies the script both a clock and a
filesystem (deliberately — it is what keeps runs resumable), so the journal is appended by
each dispatched agent at start and end, to `.ai/workflows/<slug>/.driver-journal.jsonl`.
That is better than the proposed agent-completion counter: the entries carry real
wall-clock timestamps, so W1.2's staleness rule has an actual cadence to measure silence
against rather than an ordinal.
Source: 2026-07-18 five-project `/wf yolo` transcript audit (Waypoint, Trails,
Isometric, Playster, bot-backend — 15 sessions, 2026-07-12 → 07-18; field
versions 9.108–9.136), consolidated 2026-07-25.
Predecessors: [YOLO-EVIDENCE-INTEGRITY-PLAN.md](YOLO-EVIDENCE-INTEGRITY-PLAN.md)
(BUILT v9.126+128) · [HANDOFF-SHIP-HARDENING-PLAN.md](HANDOFF-SHIP-HARDENING-PLAN.md)
(BUILT v9.138.0) · wall-ownership release v9.140.0.

Audit conclusion: **the yolo contract holds; the driver's lifecycle and
bookkeeping layer is what fails.** Deferral discipline, gate policy, and
mock-vs-real evidence all visibly worked in the field (173 autonomous decisions
with zero intent-bearing escapes in one Playster run; ship correctly BLOCKED on
open deferrals in bot-backend; two textbook mock-vs-real catches). What burned
the user's hours was the layer *around* that contract: a driver that dies with
no signal, aggregation that miscounts or re-labels what subagents actually
recorded, clearing events nobody watches, and control files two writers mutate
blind. Everything below is about making the driver's *self-reports* as
trustworthy as the evidence rules already made its subagents' claims.

Anchors verified against the source tree at **v9.140.0** on 2026-07-25. Line
numbers drift; symbol and step names are the durable reference. `yolo` is
Claude-only (`skills/wf/workflows/yolo.js` + `skills/wf/reference/yolo.md`) —
no codex-mirror leg unless a wave touches shared reference files.

---

## W0 — Closed since the audit (do not rebuild)

Every audited session ran v9.134–9.136; v9.138–9.140 were committed but unpushed
until 2026-07-24 (the marketplace-pin lesson —
[HANDOFF-SHIP-STREAMLINE-PLAN.md](HANDOFF-SHIP-STREAMLINE-PLAN.md) W0). Three of
the audit's headline classes are therefore already fixed on `origin/master`:

| Audit finding | Fixed by | Where |
|---|---|---|
| `probeGaps()` exact-string dedup false-stops on a bare `"AC2"` vs receipted `"AC2 — …"` pair (killed 2 of 4 Playster runs; hot-patched in a scratchpad, patch lost) | v9.138.0 W2 | `acKey()` in `yolo.js`, used by `probeGaps`/`collectDeferrals`/`deferralPressure` |
| Slug-mode roster walk dispatches a plan agent for a `status: skipped` slice (6.7 h Waypoint false stop + poisoned half-plan artifact) | v9.138.0 W2 | slug-mode roster filter in `yolo.js` |
| Environmental walls inherited as fact; "AVD provisioned" claimed from ephemeral subagent shells; no remediation attempt (Playster — user forced provisioning → 10 deferrals cleared, 4 real defects incl. a HIGH launch-crash) | v9.138.0 W2/W6 + v9.140.0 R1–R4 | POLICY.verify rule 5 (re-execute env probes, provisioning must persist), wall-ownership triage, env-remediation rung, provisionable `clearing-event:` |
| Substantive FAILs written into `runtime-evidence-deferrals` (Trails: verify recorded 2 ACs as fails/zero deferrals; driver outcome listed them as deferrals) | v9.138.0 W2, **partially** | driver prompt contract ("result: fail (substantive) — never a deferral"; `substantiveResidual` gates) — see W3.2 for the residual verification owed |

**W0.1 — Field-confirmation note.** This audit independently reproduced the
acKey and skipped-slice failure shapes from different projects than the audit
that produced v9.138.0 — convergent evidence those fixes target real failures.
No action; recorded so a future audit doesn't re-litigate them.

---

## Incident → wave map (provenance)

| # | Incident (project, session) | Wave |
|---|---|---|
| 1 | Slug-mode driver died silently ~17 min into a run (journal last write 22:50Z); no notification, `TaskGet` → "Task not found"; user returned 2 h later to nothing (bot-backend `fceb289d`) | W1 |
| 2 | Resuming session asserted the dead driver was "still running — currently re-verifying older slices" from journal *existence*, never checking its mtime; user made a stop/continue decision on false information (bot-backend) | W1 |
| 3 | Before dying, that driver spent its entire life re-verifying already-terminal slices instead of the slug-wide review it was launched for — its own orientation predicted "the substantive work this run is the slug-wide review" (bot-backend) | W2 |
| 4 | Deferral duplicated with label variance across a corrective re-run; driver announced "deferral pressure: 4 open" (truth: 2); outcome listed AC-NC1 as a runtime-evidence deferral **directly contradicting its own recorded decision** not to reclassify it — steering the user into a wasted `/wf probe … AC-NC1` (Trails `707e52e8`) | W3 |
| 5 | ~25% of recorded autonomous decisions "unclassified" in every run measured (Trails 11/43, 4/15, 5/10; Playster 40/173) — weakening the "intent-bearing: 0" guarantee the hand-backs advertise | W3 |
| 6 | Yolo outcome reported "0 errors" while 6 of 15 subagents had (recovered) error tool-results, incl. schema rejections refilled with `""`/`"n-a"` junk (Isometric `6854c08e`) | W3 |
| 7 | AC6's deferral clearing event ("device available for AC6 run") was satisfied **in the same session** — emulator booted, branch app installed — and nothing noticed; retro: "AC6 shipped uncleared" (Isometric) | W4 |
| 8 | "File has been modified since read" clusters on `00-index.md`: a background driver and foreground session mutate the same control files with no ownership rule; a *dead* driver's last write caused three consecutive edit failures two hours later (Waypoint `33aa78f2`, bot-backend) | W5 |
| 9 | Completed slices left `03-slice.md` at `status: defined` and the index `progress` block stale; next-run orientation had to cross-check artifacts instead of trusting the index (Waypoint `04ab449f`) | W5 |
| 10 | User's explicit "resume /wf yolo" went unfulfilled: `Skill(sdlc-workflow:wf)` blocked by `disable-model-invocation`, while sibling sessions launch `yolo.js` directly via the Workflow tool — two contradictory resume paths (Playster `9c700b35`) | W6 |
| 11 | The probeGaps hot-patch lived only in a session scratchpad and evaporated before the next session; correct instinct (avoided the plugin-cache trap) but no durable home (Playster) | W6 |
| 12 | `/wf intake <slug> <free text>` auto-routes to extension mode: a branch-strategy amendment required the model to refuse its own routing and hand-edit `00-index.md`; a schema-modernization ask needed an improvised backfill via the "Didn't mean to extend" escape hatch (Waypoint `b429ebd7`, Playster `a4c1c125`) | W7 |
| 13 | Consult dispatch failed environmentally on **both** free CLIs (codex temp-dir refusal, claude workspace-trust) — every pre-mortem/plan-critique on this host silently ran single-generator (Playster, twice) | W8 |
| 14 | A spawn-task chip's "running independently" system-reminder escalated into "a background session is **already implementing this exact fix** … guaranteeing a conflict"; user's "what bg task" / "check" found nothing existed (Trails `707e52e8`) | W8 |
| 15 | Slice-authored CI surface (workflow YAML, `/health` e2e, commit hygiene) earned `ship` verdicts on static evidence; first real CI run surfaced pnpm double-version ×5, a secretless-CI false-red, 6 commitlint fails, and a real SSR-XSS (Waypoint `04ab449f`) | W9 |

**Not a finding — worth protecting.** The slice-mode bot-backend run is the
best field evidence the deferral contract works: 5 un-verifiable live ACs
deferred with recorded env probes, ship BLOCKED until the named clearing event,
and the post-deferral slug-wide review caught two live product bugs the deferred
ACs could never reach. Do not trade the deferral→review pipeline away while
fixing the driver around it.

---

## Wave 1 — Driver liveness: a dead driver must look dead (highest payoff)

Files: `skills/wf/workflows/yolo.js`, `skills/wf/reference/yolo.md`,
`skills/wf/reference/_chat-return.md`, `skills/wf/reference/status.md`, tests.

Today the only trace of a running driver is its journal and the harness task
registry — and incident 1 shows the registry can lose the task entirely while
the journal just… stops. Every signal is write-only; nothing distinguishes
"working on a long verify" from "died 2 hours ago".

**W1.1 — Heartbeat in the journal.** The driver appends a `heartbeat` journal
entry at every agent-completion boundary *and* on a coarse timer (the Workflow
script cannot call `Date.now()`, so the heartbeat rides agent completions —
which is exactly the granularity that matters: a driver between agents is a
driver making progress). Each entry carries the current phase, slice, and
agent counter. Cost: one journal line per agent; no new files.

**W1.2 — Staleness rule at every read site.** Any session (or `/wf status`)
that reasons about a live driver MUST compare the journal's last-entry recency
against the run's own cadence before asserting liveness — never infer "running"
from file existence. `yolo.md`'s resume/orientation section and
`_chat-return.md` gain the rule verbatim: *a journal silent for longer than its
own longest observed inter-agent gap is presumed dead; say "presumed dead
since <last entry>", never "still running".* This is the exact inversion of
incident 2, where existence stood in for liveness.

**W1.3 — Dead-driver reconciliation.** When a driver is presumed dead,
orientation (a) treats its partial writes as suspect — re-read `00-index.md`
fresh before any edit (the incident-8 conflict cluster was the dead driver's
last write ambushing a 2-hour-old read), (b) reports what the journal shows it
completed vs. abandoned, and (c) `/wf status` surfaces a `driver: presumed-dead
at <phase>/<slice>` row for the slug instead of silence.

Tests: gate test for heartbeat entries appearing in journal fixtures; drift
guard pinning the staleness rule text in `yolo.md` + `_chat-return.md`.

---

## Wave 2 — Work ordering: the requested target runs first

Files: `skills/wf/workflows/yolo.js` (orientation/roster ordering),
`skills/wf/reference/yolo.md`.

Incident 3: a driver launched to do a slug-wide review burned its whole life
re-verifying terminal-clean slices and died before starting the review. The
re-challenge law is correct — stale walls must be re-probed — but it currently
runs as a *prefix* of the roster walk, so an expensive sweep can starve the work
the run exists for.

**W2.1 — Explicit target precedence.** When the invocation names a target (a
slice arg, "review only", a stage), orientation schedules that target first;
re-challenge sweeps of already-terminal slices run *after* it, in the same run.
**W2.2 — Bounded re-verify.** A re-challenge of a terminal-clean slice is a
probe of its recorded walls (cheap, per v9.140.0 R4's re-triage), not a full
re-verify dispatch. Full re-verify of a terminal slice requires a reason the
driver can name (index drift, failed wall probe) — logged as a decision, so a
future audit can see why the driver chose bookkeeping over new work.

---

## Wave 3 — Aggregation truth: the outcome may not contradict its inputs

Files: `skills/wf/workflows/yolo.js` (verify prompt, outcome assembly,
`deferralPressure`), `skills/wf/reference/verify.md`,
`skills/wf/reference/_decision-classes.md`, tests.

`acKey()` fixed the *consumer* side; three producer/assembly defects remain.

**W3.1 — Stop the double emission at the source.** The verify subagent contract
still yields the same deferral as a receipted `terminal.deferrals[]` entry and a
bare `residual[]` copy — the asymmetry acKey now papers over. Amend the verify
prompt in `yolo.js` (and `verify.md`'s residual guidance): a deferral is
recorded **once**, in `deferrals[]`, with its probe; `residual[]` carries only
what is *not* a deferral. One writer per fact.

**W3.2 — The aggregate inherits recorded classifications.** Incident 4's core:
a decision said "AC-NC1 stays a build-capability deferral, NOT
runtime-evidence" and `outcome.runtimeEvidenceDeferrals` listed it anyway.
Outcome assembly must treat recorded decisions and the index's authoritative
deferral ledger as canonical over its own re-derivation — where they disagree,
the outcome carries the ledger's classification plus a `reconciled:` note,
never a silent re-label. Same rule covers the v9.134-era fail-vs-deferral
conflation: verify's `result: fail` semantics survive into the outcome even
when a deferral-shaped entry exists. Verify at build time how much of this the
v9.138.0 contract text already enforces mechanically vs. by prompt alone.

**W3.3 — `unclassified` is a gap, not a class.** `yolo.js` currently defaults a
missing decision class to `'unclassified'` and moves on; every measured run
leaked ~25%. Two changes: the subagent prompts state that `class` is REQUIRED
per `_decision-classes.md` (one corrective retry on omission, same pattern as
the probe-receipt corrective round), and the hand-back reports `unclassified`
decisions as **suspect** — "intent-bearing escapes: 0 (N decisions
unclassifiable — review them)" — instead of folding them into the reassuring
zero.

**W3.4 — Honest error accounting.** The outcome gains
`subagentErrors: { recovered: N, agents: [...] }` sourced from the journal, so
"0 errors" can no longer coexist with 6/15 subagents having had rejected
writes or schema retries (incident 6). Junk-value schema refills
(`""`/`"n-a"` for stages that haven't run) are the
[EVIDENCE-SCHEMA-CONTRACT.md](EVIDENCE-SCHEMA-CONTRACT.md) surface — this plan
only surfaces the *count*; the schema fix (stage-conditional required fields)
belongs to that contract and is cited, not redefined, here.

---

## Wave 4 — Clearing-event watch: a satisfied event must get noticed

Files: `skills/wf/reference/verify.md` (deferral schema note),
`skills/wf/reference/status.md`, `skills/wf/reference/probe.md`,
`skills/wf/workflows/yolo.js` (orientation), tests.

v9.140.0 R2 made clearing events provisionable acts with named actors — which
kills the *indefinite* deferral. What it doesn't do is notice when the act has
already happened: Isometric's AC6 event ("device available") came true in the
same session, on-screen, and the AC still shipped uncleared (incident 7).

**W4.1 — `clearing-probe:` on the deferral record.** Alongside R2's
`clearing-event:`, a deferral MAY carry a one-line, side-effect-free command
that answers "has the event occurred?" (`adb devices | grep -q emulator`,
`curl -sf localhost:8080/health`). Deferrals whose event is provisionable
should almost always have one; the wall-ownership triage already forces the
author to know what would clear it.

**W4.2 — Run the probes at the cheap moments.** `/wf status` (per slug),
yolo orientation, and probe orientation execute recorded `clearing-probe:`
lines (bounded: one command each, short timeout) and flag hits: *"deferral
AC6's clearing event appears satisfied — run `/wf probe <slug>` now."* No
auto-clearing — the probe stage still owns evidence; this is a tripwire, not a
gate. Total cost per status call: milliseconds per open deferral.

---

## Wave 5 — Control-file concurrency + terminal bookkeeping

Files: `skills/wf/reference/yolo.md`, `skills/wf/reference/_additive-write.md`
(or a new `_control-file-ownership.md` ref), cross-ref
[HANDOFF-SHIP-STREAMLINE-PLAN.md](HANDOFF-SHIP-STREAMLINE-PLAN.md) W5.

**W5.1 — Ownership rule while a driver is live.** While a background driver is
running (or presumed-dead-unreconciled, per W1.3) for a slug, that slug's
`00-index.md` and the registry `INDEX.md` are **driver-owned**: a foreground
session re-reads immediately before any write and treats an edit rejection as
"the driver moved" (re-read, re-derive, retry once), never as a stale-string
puzzle to force. One paragraph in `yolo.md` + the additive-write reference;
this converts incident 8's conflict clusters from surprises into the designed
path.

**W5.2 — Slice-complete write-back rides the driver.** Incident 9
(`03-slice.md` stuck at `status: defined`) is the same defect
HANDOFF-SHIP-STREAMLINE-PLAN W5 confirms at handoff time ("nothing writes slice
status back"). That plan owns the write-back mechanism; this plan adds one
requirement to it: **yolo's slice-complete step is a writer** — the driver
updates the roster status and index `progress` when it completes a slice, so
the fix lands at drive time, not only when a handoff later self-repairs it.

---

## Wave 6 — One resume path, durable patches

Files: `skills/wf/reference/yolo.md`, `skills/wf/reference/_chat-return.md`.

**W6.1 — Sanction the resume mechanism.** Pick one (recommendation: the
Workflow-tool relaunch of `yolo.js` is already the de-facto path and needs no
skill-guard change) and write it into `yolo.md`'s hand-back/resume section:
after a PO answer is recorded, the model resumes by relaunching the driver
script directly; `Skill`-invoking `/wf` remains user-only. The current state —
guard blocks one door while sessions use the other — made the model tell the
user "invoke it yourself" against an explicit resume instruction (incident 10).

**W6.2 — Hot-patches get a durable home.** When a session must patch the
driver to proceed (Playster's scratchpad `probeGaps` patch — lost), the
sanctioned pattern is: patch a copy under the repo's gitignored
`.ai/patches/<date>-<symbol>.md` (diff + provenance + symptom), and
spawn/record a task against the plugin dev tree. A patch that exists only in a
session scratchpad or the plugin cache is a patch that will be re-debugged
from scratch — this exact defect was independently re-diagnosed twice before
v9.138.0 fixed it properly.

---

## Wave 7 — Router verbs: `amend` and `modernize`

Files: `skills/wf/reference/intake/*.md`, `skills/wf/wf.md` (router), possibly
[WF-TASK-KEY-PLAN.md](WF-TASK-KEY-PLAN.md) coordination.

**W7.1 — `amend`: workflow-config edits stop requiring router defiance.**
`/wf intake <slug> <free text>` claims all free text for extension mode; a
branch-strategy change had no lawful home (incident 12). Add an `amend`
recognition arm (intake mode, not a new top-level key — it edits recorded
config: branch strategy, base, ship-plan pointer) with an explicit whitelist of
amendable fields; everything else still routes to extension.
**W7.2 — `modernize`: schema-version drift is detectable.** Intake on an
existing slug compares the artifact schema era against the installed plugin
version and offers "modernize to current schema (RIM/charter backfill)" as a
first-class option instead of the "Didn't mean to extend" escape hatch. The
Playster backfill improvised exactly this; make it a mode so the next one isn't
improvised.

---

## Wave 8 — Host truth: consult on Windows, cross-session claims

**W8.1 — Consult dispatch on Windows (plugin bug, highest sub-priority).**
Both free CLIs fail environmentally — codex refuses its temp dir, claude hits
the workspace-trust dialog — so every consult-backed critique on this host
silently degrades to single-generator (incident 13), *while v9.135–139 made
consult auto-invoke everywhere*. The trigger sweep's value is capped by
dispatch reliability. Needs a live repro on the affected host: capture both
CLIs' exact refusals, then fix the dispatch env (temp-dir override for codex;
pre-trusted workspace or `--dangerously`-equivalent flag for claude) in the
consult skill's runner. A dispatch that fails must also *say so* in the
artifact ("panel of 1 — codex/claude unavailable: <reason>") — today the
degradation is a residual note at best.

**W8.2 — Cross-session activity claims require repo evidence.** A
system-reminder about a spawned chip ("running independently") is a statement
about a *chip*, not about work occurring. Reference-level rule (in
`_chat-return.md` or the steering doc): before asserting another session is
doing/has done something, check the repo (branch, commits, target files);
otherwise say "a task chip exists; I can't see whether it ran." Incident 14's
"guaranteed conflict" narrative — deflated by two words from the user — is the
template for what this forbids.

---

## Wave 9 — Evidence rung for slice-authored CI (smallest, cite-heavy)

Files: `skills/wf/reference/verify.md`.

v9.138.0 W5 gave `ship-plan build` outputs real validations (version-literal
consistency, graph integrity, formatters, provisioning probes). Incident 15
shows *slices* that author `.github/workflows/*` get none of that: static-only
evidence earned `ship` verdicts and first CI contact found five broken files.
One rule in verify's evidence-direction section: **an AC whose deliverable is
CI/pipeline configuration cannot clear on `static` rung evidence** — it needs
at least the W5 validation battery (run the repo's formatter, check version
literals against repo declarations, lint the workflow graph) and records
`evidence-rung:` accordingly per
[EVIDENCE-SCHEMA-CONTRACT.md](EVIDENCE-SCHEMA-CONTRACT.md). A real-executor
probe (`act`, draft-PR smoke) stays recommended-not-required — that cost/benefit
belongs to the project, but the free static battery is not optional.

---

## Build order and sizing

| Wave | Size | Depends on | Rationale for position |
|---|---|---|---|
| W1 liveness | M (driver + 2 refs + tests) | — | Every other wave's diagnostics assume you can tell dead from alive |
| W3 aggregation truth | M (driver prompts + assembly + tests) | — | Wrong numbers steer real user commands (incident 4); cheap, high-trust payoff |
| W2 work ordering | S (driver orientation) | W1 (journal vocabulary) | Prevents the starvation that made incident 1 expensive |
| W5 concurrency + write-back | S (refs; W5.2 lands with streamline-plan W5) | W1.3 | Converts conflict clusters into designed behavior |
| W4 clearing-probe | M (schema field + 3 read sites) | — | Narrow after v9.140.0 R2; tripwire only |
| W6 resume + patches | S (refs only) | — | Pure documentation of the de-facto path |
| W7 router verbs | M (intake modes) | — | Coordinate with WF-TASK-KEY-PLAN if `task` lands first |
| W8 host truth | M (consult runner repro-first) | — | W8.1 needs the affected host; do not fix the matcher blind |
| W9 CI evidence rung | S (one verify rule) | — | Cites v9.138.0 W5 + evidence-schema contract |

Suggested release slicing: **W1+W2+W3** as one driver-correctness release
(shared `yolo.js` surface, one dist rebuild), **W4+W5+W6+W9** as a
reference/schema release, **W7** and **W8** independent. Per
[sdlc_dist_build_step] discipline: any `yolo.js` change rebuilds `dist/` in the
same commit; per the W0 lesson, no release is done until `origin/master`
carries it.

---

## Build record (2026-07-26)

All nine waves built in one pass rather than the suggested slicing — the driver
waves share one file and the reference waves share one vocabulary, so splitting
them would have meant editing the same paragraphs twice.

| Wave | Landed as |
|---|---|
| W1 liveness | `.driver-journal.jsonl` heartbeat written by every dispatched subagent (`heartbeatClause`), `runId` minted by orient, `priorRun` staleness verdict in `ORIENT_RESULT`, `deadDriverClause` injected into every stage, `outcome.priorDriver`; staleness rule single-sourced in the new `_control-file-ownership.md`; `## Driver` row + step 8 in `status.md` |
| W2 ordering | `slices[].reverifyReason` (`new-work` \| `deferral-rechallenge` \| `none`) from orient; slug mode partitions the roster and runs primary → target → bounded sweep via `driveRoster`; `driveWallProbe` + `WALL_PROBE_RESULT` replace the full re-verify, escalating only for a named, decision-logged reason |
| W3 truth | one-writer-per-fact + fail-is-not-a-deferral in `POLICY.verify` and `verify.md`; `classificationIndex`/`isRuntimeEvidenceClass`/`reconcileDeferrals` + `outcome.reconciled`; `collectSubstantiveFailures` → `outcome.substantiveFailures`; `DECISION_CONTRACT` + `classifyDecisions` corrective round; `decisionDigest` now reports `unclassified` and `intentBearingGuarantee`; `collectSubagentErrors` → `outcome.subagentErrors` |
| W4 clearing-probe | `clearing-probe:` on the deferral schema (`verify.md`); executed at yolo orientation (step 8), `/wf status` (step 9), and `/wf probe` (step 0.7); `clearingTripwire` → `outcome.clearingEventsSatisfied`; probe leaves a probe behind on every surviving deferral |
| W5 concurrency | new `_control-file-ownership.md` (cited by `yolo.md`, `_chat-return.md`, `status.md`, `_additive-write.md`, both maintenance modes); `CONTROL_FILE_RULE` on every dispatched agent; `writeBackSliceStatus` runs at slice-complete |
| W6 resume | "Resuming — one sanctioned path" + "Hot-patching the driver mid-run" (`.ai/patches/<date>-<symbol>.md`) in `yolo.md` |
| W7 router verbs | `intake/amend.md` + `intake/modernize.md`; new **branch 0** (maintenance) in `intake.md`, ahead of compressed-slice and extension; schema-era check offered from the extension branch; `wf/SKILL.md` retired-surface message corrected |
| W8 host truth | **repro'd live on this Windows host** — the plan's hypotheses were both wrong (below). `isolatedHomeParent` moves the isolated `CODEX_HOME` out of the OS temp dir; failure classification + the degraded-panel declaration landed in a **concurrent session's** edits to `dispatch.mjs`/`consult/SKILL.md`, which were kept in preference to a duplicate. W8.2 cross-session-claims rule in `_chat-return.md` |
| W9 CI rung | "CI/pipeline configuration cannot clear on `static` evidence" + the free static battery in `verify.md` |

**W8.1 — what the repro actually showed.** The plan predicted a codex temp-dir
refusal and a claude workspace-trust dialog. Neither was the cause:

- `claude` exits 1 having written `{"is_error":true,"result":"Not logged in ·
  Please run /login"}` **to stdout**, with nothing on stderr. Workspace trust was
  never involved — the standalone CLI is simply not authenticated on this host
  (it authenticates separately from the desktop app). Reproduced with a bare
  `claude -p` and no plugin involvement.
- `codex` exits 1 with `Failed to refresh token: … your refresh token was already
  used. Please log out and sign in again.` — also reproduced against the user's
  **real** `CODEX_HOME`, so the isolated-home copy is not the cause either.
- The temp-dir line codex prints (`Refusing to create helper binaries under
  temporary dir …`) is real but **non-fatal**: it literally says "proceeding". It
  led the diagnosis astray precisely because the old runner truncated stderr and
  reported that first line as the failure.

So the plugin defect was never the wall itself — it was that the runner
**discarded the CLI's own diagnostic** and reported `claude exited 1`. Both walls
are credentials, which no repo change dissolves; what the fix buys is that the
next person is told so. Coverage: `tests/unit/skills/consult-dispatch.test.mjs`.

**Deviations from the plan, and why.**

- *W1.1 heartbeat granularity.* The plan specified heartbeats on agent
  **completions**. Shipped as start **and** end. A 40-minute `implement` would
  otherwise look dead for 40 minutes, and W1.2's rule needs the observed
  inter-agent gap to compute a cadence — the start line is what makes the gap
  measurable. Cost is one extra line per agent.
- *W3.3 corrective round.* The plan said "one corrective retry on omission, same
  pattern as the probe-receipt corrective round". The probe-receipt round re-runs
  `verify`; re-running `implement` to recover a missing label would rebuild code
  for a bookkeeping gap. Shipped instead as `classifyDecisions` — a cheap
  read-only agent that reads the artifact the stage already wrote. Same "one
  corrective round, then report honestly" shape; anything still unclassifiable
  stays `unclassified` and is reported as **suspect**.
- *W3.4 error source.* The plan sourced `subagentErrors` "from the journal". The
  Workflow script has no filesystem, so it cannot read one. Shipped as subagent
  self-report (`STAGE_RESULT.errors`) plus driver-observed `null` returns
  (fatal). The W1 journal records the same counts on each `agent-end` line, so a
  human can still reconcile after the fact.
- *W5.1 canonical home.* The staleness rule ended up in
  `_control-file-ownership.md` rather than `yolo.md`, because the Codex build has
  no `yolo.md` to cite and `status.md`/`_chat-return.md` both need the rule. It
  is registered in the `shared-reference-drift` guard, which promptly caught one
  duplicated copy.

**Not done — deliberately.** No version bump, no `dist/` rebuild, no
`sync:codex` runtime sync, no commit. A second session was editing this same
working tree throughout (the HANDOFF-SHIP-STREAMLINE work, plus the consult
fixes above), and a release is a tree-wide act that would package its
half-finished state under a version number. Both trees' **skills** are
consistent and the suite is green (710 tests, 0 failures); the release is a
joint decision.
