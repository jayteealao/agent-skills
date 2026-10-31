# Deferrals — the `interactive-verification: deferred` escape hatch

`verify.md` Step 7.5 applies this file when a user-observable AC has no runtime evidence and no reachable rung can produce it. Load it also when `00-index.md` has an open `runtime-evidence-deferrals` entry (`cleared-by: null`) for any slice (`mode:deferral`). An open entry binds slices that have no deferral of their own: the stacking stop and the `needed-by` escalation below apply to them. Deferral is a last resort: it is honest only after the constraint-resolution ladder ([../runtime-adapters/_ladder.md](../runtime-adapters/_ladder.md)) was climbed and each rung's outcome recorded. Defer only the residual that no rung can reach.

**The defer-reason names every rung tried**, per the rule and the example of [_ladder.md](../runtime-adapters/_ladder.md) → Constraint-resolution ladder; a defer-reason that names no attempted rung is rejected.

**Classify the wall before deferring it (`wall-ownership`).** Every deferral records `wall-ownership: code-owned | environment-negotiable | external`, decided by the ladder's triage ([runtime-adapters/_ladder.md](../runtime-adapters/_ladder.md) → *Classify the wall before you climb it*), which owns the verdicts and the three routes for a `code-owned` wall. For a `code-owned` wall, the deferral hatch is **unavailable** until the repo-change option was surfaced as a decision.

**Attempt before declare** per [_ladder.md](../runtime-adapters/_ladder.md) → attempt-before-declare: a defer-reason with no recorded capability probe is invalid.

**An unchanged deferral is not probed again.** Before you probe a wall that an open entry of `runtime-evidence-deferrals` already records, run `node "<skill-dir>/scripts/wf.mjs" defer check "<projectRoot>" <slug>`. It runs the `clearing-probe` of each open entry. An `unchanged` entry keeps its deferral and its recorded probe receipt: do not climb the ladder for it again. Probe an entry again only when the check says `changed` (the clearing event happened: clear the entry with evidence) or `no-probe`. A deferral is a person task: a run stops for it only when `defer check --next <slice>` exits 1, because the next slice needs it now.

**Provision before declare, and provisioning persists.** Before declaring an environment wall, check whether the repo or the plan's `## Verification Strategy` already ships provisioning for exactly this capability (a `scripts/create-*-avd.ps1`, an emulator bootstrap, a seed script) and run it; a wall whose cure sits unexecuted in the repo is not a wall. Capability provisioned inside this run counts only if it persists beyond the run: invoke the repo's script, or write one and record its path in the evidence; an emulator provisioned only inside a sub-agent's ephemeral context does not exist afterward. Environment claims are sub-agent-untrusted: when a delegated verify reports "no device / port held / no emulator", the orchestrator re-executes that probe itself once before accepting the deferral.

**A skipped-guard sweep is an error, not a deferral.** When every spec exits via a credential or environment guard (0 specs executed), the criterion is `blocked-runtime-evidence-missing` with the unmet precondition named ("set `E2E_ADMIN_USER_EMAIL`/`_PASSWORD` and re-run"), never `interactive-verification: deferred`. **A per-AC skip is the same error, one AC deep**: when the spec that is the designated evidence for a specific AC was skipped (guard exit, `.skip`/`.todo`, missing env or secret, filtered out), that AC produced no evidence and cannot inherit the suite's green. Route it through another rung, defer it with a probe receipt, or write `blocked-runtime-evidence-missing`; sub-agent 2 records the skips as `skipped-gating-specs: [{spec, ac, precondition}]`.

## The annotation

Once the residual is genuinely environment-bound, the slice author adds to the per-slice verify frontmatter:

```yaml
interactive-verification: deferred
interactive-verification-defer-reason: "<rungs tried + env-remediation attempted + the residual that survives them — not a bare 'no device'>"
interactive-verification-wall-ownership: code-owned | environment-negotiable | external
```

When the annotation is present on a slice:
- The gate writes `result: partial` (not `pass`) with a note that runtime evidence was deferred.
- The deferral is appended to `00-index.md` under `runtime-evidence-deferrals` (schema below).
- `/wf review` and the PR phase of `/wf ship` proceed with a soft warning; the release of `/wf ship` hard-blocks until every deferral is cleared by a later `/wf probe` run that produces matching evidence, or by re-running verify in a capable environment.
- **Clearing evidence matches the AC's direction.** A prove-fail-closed AC (a gate, guard, or health check catching a failure; see shape.md's direction rule) is cleared only by evidence of the failure branch firing: an induced fault caught, a bad input rejected, a forced timeout falling back. A green happy-path run clears only the prove-pass half. A healthy run never proves the failure branch fired. When the mismatch is detected, say what evidence would qualify (the fault to inject) instead of clearing.

**A clearing event names an actor, not a hope.** `cleared-by` targets a provisionable event, something a person or a run can cause: "after `<slice>` lands the configurable-port change, run `/wf probe <slug>` with the emulator on any free port", "cleared by the `-rc.N` prerelease CI run", "cleared once `scripts/create-verify-avd.ps1` has been run on this host." Passive waits are not clearing events: "once host port 8080 frees", "when a device becomes available", "when the environment allows" pin the deferral to state nobody in the loop controls, so it is indefinite by construction, and it reads as progress in `/wf status` while nothing can ever move it. When the only honest clearing event is passive, that is itself the finding: provision the capability (which nearly always means the wall was `code-owned` or `environment-negotiable` all along; re-run the ownership triage), or record an explicit PO acceptance that this AC waits on an uncontrolled event. A `code-owned` wall can never have a passive clearing event: its clearing event is a change you are able to write.

**One writer per fact; a deferral is recorded once.** The deferral lives in exactly one place per surface: the frontmatter annotation on the slice, the `runtime-evidence-deferrals` entry in `00-index.md`, and, when a driver is orchestrating, the structured `deferrals[]` return, each carrying the probe receipt. Do not also park a bare copy in the sibling "residual / could-not-fix" list; that list carries only what is not a deferral. Two copies of one deferral, receipted in one place and bare in the other, read to any consumer as two different ACs, one of them apparently un-probed, so consumers false-stop. Emitting once is the fix.

**A fail is not a deferral, in either direction.** A deferral says evidence could not be produced; a `fail` says the behavior is wrong. An AC you drove and found broken is `result: fail` and is recorded as a failure, never in `deferrals[]`, never in the index ledger. A run report may not re-label a recorded fail as a deferral, because that tells the user to go collect evidence for a defect. Name and date every deferral, and show it in the progress view and dashboard. The block applies at ship, so in-flight work that waits on an environment does not stall.

## 00-index.md ledger

When a slice's verify writes a deferral, append an entry to the `runtime-evidence-deferrals` list of the workflow index. Get the index with `node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index`, add the entry, write the draft `<wf-dir>/.draft/00-index.md`, and run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>` ([_records.md](../_records.md)). The entry has this form:

```yaml
runtime-evidence-deferrals:
  - slice: <slice-slug>
    reason: "<the defer-reason, copied unchanged>"
    deferred-at: "<iso-8601>"
    wall-ownership: code-owned | environment-negotiable | external   # ladder triage verdict
    clearing-event: "<the provisionable act that clears this — never a passive wait>"
    clearing-probe: "<ONE side-effect-free command answering 'has that act happened yet?'>"
    cleared-by: null    # set to <probe-descriptor> when a probe run clears the deferral
    repeat-of: <slice-slug>   # only when this deferral's constraint matches an earlier entry
    absorbed-by: [<slice-slug>, ...]   # slices that inherit this open deferral instead of clearing it
    needed-by: <slice-slug>   # the slice that consumes this prerequisite; set at plan time
```

**`clearing-probe`: how anyone finds out the event happened.** A deferral whose clearing event is provisionable also carries a one-line, side-effect-free command that answers "has it happened yet?": `adb devices | grep -q emulator`, `curl -sf localhost:8080/health`, `test -f .env.e2e`, `gh run list --workflow release -L1 --json conclusion`. `/wf status <slug>`, the autonomous driver's orientation, and `/wf probe` orientation execute these at their cheap moments (one command each, short timeout) and flag hits: "deferral AC6's clearing event appears satisfied — run `/wf probe <slug>` now." It is a tripwire, not a gate: nothing is cleared automatically, and the probe stage still owns evidence. Omit the field only when no single command can answer the question (a human judgement, a third-party release); an omitted probe is a silent "nobody is watching this one".

**Repeat-deferral marker.** Before appending, scan existing `runtime-evidence-deferrals` for an entry naming the same environment dependency (fuzzy match: same credential gate, device class, or missing service). On a match, append `repeat-of: <slice-slug of the first occurrence>`; the accumulation becomes visible in the artifact, `/wf status`, and the dashboard. A wall paid twice is plan's tripwire: the next plan for this slug scopes the harness that retires it or records `harness-declined: <reason>` (plan.md's repeat-deferral tripwire).

**Deferral stacking is a stop, not an absorption.** When a later slice would inherit an open deferral rather than clear it, append its slug to `absorbed-by`. Change the index as a draft, as for a new entry. Absorbing a deferral into a **third** slice is a **STOP**: verify surfaces it as a decision ("foundation gap: N slices now stack on unproven `<X>` — provision the clearing event now, or PO-accept explicitly") and records the resolution with `decide add --stage verify` per [_decisions.md](../_decisions.md). Do not silently let the stack grow. **Re-run the ownership triage at the STOP, do not inherit the original verdict**: a wall first classified `external` under time pressure is exactly the kind that turns out `code-owned` on a second look, and a stack of three is the loudest signal that the first classification deserves re-examination. "Provision the clearing event" is the default branch, not a co-equal option; PO-accept is for walls genuinely outside the team's reach.

**`needed-by` escalation.** External prerequisites and deferrals carry `needed-by: <slice>` (the consuming slice, set at plan time). When the `needed-by` slice reaches `complete` while the prerequisite is still unmet (`cleared-by: null`), the deferral escalates: a completed consumer standing on an unmet prerequisite is a surfaced decision, not a quiet carry-forward. `/wf status` and `/wf ship` read this list; `/wf ship` refuses to start while any entry has `cleared-by: null`.
