# Ship-plan readiness — ledger filter and gate (Steps R2.5, R3, R3.5 of `_ship-plan-readiness.md`)

The verdict rules, the `clears-on` taxonomy, and the two menu principles (`amendable`, gating-only counts) are in [../_ship-plan-readiness.md](../_ship-plan-readiness.md). This file carries the ledger filter, the question texts, the re-fire guards, the inline-amendment rules, and the orientation snapshot a STOP writes. Ask every question as a gate question per [../_gate-question.md](../_gate-question.md).

# Step R2.5 — Acknowledgement-ledger filter (persistence without silence)

Acknowledgements live in a sibling ledger, `.ai/ship-plan-acks.yaml` (a list of entries `{ signals: [], fingerprint, fingerprint-scope, branch, plan-version, stage, at, via, reason }` plus an optional `pending-amend: { signals: [], plan-version, at }`). The pre-check reads and appends to this ledger; it still **never** edits the plan itself. `via` records how the entry was earned: `ack` (the user accepted the drift) or `amendment` (the plan was amended in response to it; see the Drift gate).

**Invalidation is scoped, not wholesale.** The original rule (a `plan-version` bump deletes every entry) is right about plan-scoped acks and wrong about branch-scoped ones, and that difference is what turned one honest amendment into a repeat gate:
- **`fingerprint-scope: plan`** entries are invalidated by a `plan-version` bump: delete those recorded below the plan's current version. These are claims *about the plan*, and an amended plan must re-earn them.
- **`fingerprint-scope: branch`** entries **survive** a `plan-version` bump. They assert a fact about the branch ("this branch edits `.github/workflows/`") that an amendment does not make false, and that the amendment was very often made *in response to*. Invalidate them when `branch` is not the current branch; they die with the branch at merge.
- **`pending-amend`** is cleared once `plan-version` rises above the value recorded alongside it: the amendment it was waiting for has happened. What to do with the findings it covered is the Drift gate's Guard 2, not a silent drop.

Before gating, partition `drift-findings[]` against the surviving ledger:
- A finding whose `(signal, fingerprint)` matches a surviving ledger entry is **already settled**: drop it from the gate and report it as one advisory line ("previously <acknowledged|amended for>: <signal> — <reason> (<at>)"). It never re-asks.
- The fingerprint is what makes this safe: **new drift always still gates.** Group-1 and Group-3 findings fingerprint on the finding's `detail` surface (the specific path, secret, workflow, or version named), `fingerprint-scope: plan`; a *different* mismatch is a *new* finding. The structural Group-2 signals (`release-surface-touched`, `dependencies-changed`) fingerprint on `(signal, branch)`, `fingerprint-scope: branch`: they re-fire on every new commit to the same branch *by construction* and cannot clear until merge, so one entry covers the branch for its whole life (one prior branch acknowledged the identical pair three times across handoff and ship; that third ask protected nothing). `migration-without-rollback` fingerprints on `(signal, branch)`, `fingerprint-scope: branch`; `plan-stale` on `(signal, plan-version)`, `fingerprint-scope: plan`.

Findings that survive the filter proceed to the R3 gate.

# Step R3 — Gate questions

## Missing-plan gate

Infer a `--from-template <kind>` suggestion from the ecosystem (npm→`npm-public`, PyPI→`pypi`, Maven/Gradle→`kotlin-maven-central`, Docker→`container-image`, a deploy→`server-deploy`, otherwise `library-internal`).

- **Caller = `ship`**: ship literally reads the plan; it cannot run without one. Two options only:
  ```yaml
  question: "No ship plan at .ai/ship-plan.md. Ship is plan-driven and cannot run without it. Author one now?"
  header: "Ship plan"
  options:
    - { label: "Create it (Recommended)", description: "STOP here; run /wf ship-plan init --from-template <kind>, then re-run /wf ship." }
    - { label: "Cancel",                  description: "Abort this ship run; leave everything unchanged." }
  multiSelect: false
  ```
  Either way STOP — do not run the release. On "Create it", print the exact command `/wf ship-plan init --from-template <kind>` and set `ship-plan-readiness: missing`.
- **Caller = `handoff`**: a repo may legitimately ship outside this workflow (CI/CD auto-deploy on merge, release owned elsewhere, `branch-strategy: none`). Offer the not-applicable path:
  ```yaml
  question: "No ship plan at .ai/ship-plan.md. /wf ship will require one. Author it now, or is shipping handled outside this workflow?"
  header: "Ship plan"
  options:
    - { label: "Create it now (Recommended)", description: "STOP; run /wf ship-plan init --from-template <kind> before shipping, then re-run handoff." }
    - { label: "Shipping is external",        description: "This work ships outside /wf ship (auto-deploy/owned elsewhere). Proceed; record ship-plan-readiness: not-applicable." }
    - { label: "Cancel",                      description: "Abort the handoff; leave everything unchanged." }
  multiSelect: false
  ```
  - "Create it now" → STOP; print `/wf ship-plan init --from-template <kind>`; set `ship-plan-readiness: missing`. This fires before packaging, so do not emit a partial `08-handoff.md`; point the slug's `00-index.md` `recommended-next-*` at `/wf ship-plan init` and resume handoff after the plan exists.
  - "Shipping is external" → set `ship-plan-readiness: not-applicable`; note the reason in the handoff's `## Risks / Caveats`; return to the caller and continue.
  - "Cancel" → STOP.

## Drift gate — two re-fire guards (an answered question is not a new question)

**Guard 1 — answered but unexecuted.** If the ledger carries `pending-amend` and the plan's `plan-version` is unchanged since it was recorded, the user already chose "Amend the plan" for these signals and the amendment never happened; do not re-ask the identical question as if it were new (one drift once consumed three STOP rounds this way, one of them an identical re-fire). Present a reminder instead: "You chose *Amend the plan* at <at> for <signals>, but plan-version is unchanged — amend now, or acknowledge the drift to proceed." Options: **Amend now and continue** (the scoped inline amendment below; clears `pending-amend` on a clean re-check) / **Amend separately — stop here** (STOP, route as below; keep `pending-amend`) / **Acknowledge and proceed** (as below; clears `pending-amend`) / **Cancel**. A run that already chose to amend and did not is the case the inline path exists for; prefer it here.

**Guard 2 — the amendment landed.** If `pending-amend` was recorded and the plan's `plan-version` has since **risen**, the user did exactly what the gate asked. Clear `pending-amend`, then re-partition the findings it covered by `clears-on`:
- `clears-on: amend` and now **gone**: expected. Say nothing.
- `clears-on: amend` and **still present**: the amendment did not land it. That is genuinely new information: gate on it normally and say plainly that the amendment did not clear it.
- `clears-on: merge`, or `clears-on: repo` where the repo has not moved, and still present — **do not gate.** The amendment could never have cleared these, and the user has already paid its cost. Write a ledger entry per finding with `via: amendment`, `fingerprint-scope: branch`, and `reason: "plan v<N> was amended for block(s) <blocks> in response to this finding; it cannot clear until <merge|the repo action>"`; report each as one advisory line and continue.
- If nothing gating survives this partition, the verdict is `ok`: return to the caller with no prompt at all.

This guard exists because its absence was reported from the field. A branch hit the gate with `release-surface-touched` + `plan-stale`, chose *Amend the plan*, ran `/wf ship-plan edit` on block C (correctly, and it improved the plan), bumped `plan-version` 4→5, which wiped the ledger, and re-ran handoff twelve minutes later into the identical question. `plan-stale` had genuinely cleared; `release-surface-touched` could not have, by construction. Guard 2 plus the scoped invalidation in R2.5 is what ends that loop.

## Drift gate — remedy menu

Print the gating findings as a short table (signal · detail · block · `clears-on`), then any advisories beneath as plain lines.

**When `amendable` is non-empty:**

```yaml
question: "The ship plan drifted from the repo (<N> gating finding(s)). Amend it before continuing?"
header: "Plan drift"
options:
  - { label: "Amend now and continue (Recommended)", description: "Amend block(s) <blocks> here, re-check drift, and carry on in THIS run — no restart." }
  - { label: "Amend separately — stop here",         description: "STOP; run /wf ship-plan edit yourself, then re-run this stage." }
  - { label: "Acknowledge and proceed",              description: "The drift is known/intentional. Record a reason and continue on the current plan." }
  - { label: "Cancel",                               description: "Abort; leave everything unchanged." }
multiSelect: false
```

**When `amendable` is empty**, every surviving finding clears on `merge` or `repo`, so an amend option would propose a `plan-version` bump that changes nothing, re-opens the plan-scoped ledger, and guarantees this question comes back. Offer the actions that can actually end it:

```yaml
question: "The ship plan is <N> finding(s) out of step with the branch, none of which amending the plan can clear. How do you want to proceed?"
header: "Plan drift"
options:
  - { label: "Acknowledge and proceed (Recommended)", description: "Record a reason. The entry is branch-scoped: it survives plan amendments and does not re-ask for the life of this branch." }
  - { label: "Fix in the repo — stop here",           description: "STOP; run <the repo action named by the finding>, then re-run this stage." }
  - { label: "Cancel",                                description: "Abort; leave everything unchanged." }
multiSelect: false
```

Drop the middle option when no finding is `clears-on: repo`: a two-option gate is honest; a third option that matches no finding is noise. If the user still wants to amend the plan for its own sake, that is `/wf ship-plan edit` on their own terms, not this gate's remedy; say so in the acknowledgement's advisory line.

## Drift gate — what each answer does

- **Amend now and continue** → the user's answer *is* the authorization; a second invocation adds ceremony, not consent. Run `/wf ship-plan edit` as a **sub-step of this stage**, then re-verify. Five rules keep it honest:
  1. **Scoped.** The inline amendment may touch **only** the block letters named by the *amendable* findings' `suggested-block`. It is not an open editing session: a drift about a missing secret does not license rewriting the rollback contract.
  2. **The editor still owns authoring.** Load `edit.md` in this directory and follow it for the named blocks (it re-runs those blocks' questions pre-filled with current values, and bumps `plan-version`). The pre-check still never writes the plan itself; it *invokes* the sanctioned editor rather than only printing its name.
  3. **Re-check, don't assume.** After the edit, re-run Step R2 against the plan's new `updated-at`/`plan-version`. Only a re-run with no surviving **gating** finding continues the caller into its next step. The `plan-version` bump invalidates the *plan-scoped* half of the ledger by design (R2.5); branch-scoped entries survive, which is what keeps the re-check from re-raising what rule 4 just settled.
  4. **Bank what the amendment bought.** An amendment made in response to a drift gate is evidence about every finding in that gate, not only the ones it could clear. On a successful edit, write a ledger entry for each co-occurring `clears-on: merge` finding with `via: amendment`, `fingerprint-scope: branch`, and a reason naming the blocks and the new `plan-version`. Skip this and the re-check in rule 3 re-raises the untouchable findings immediately, inside the same run.
  5. **Still dirty → fall back to STOP.** If the re-check still reports a gating finding, or if the amendment needs judgment the repo cannot supply (an org's signing policy, a human approval chain), do not continue on an unverified amendment. Fall through to the STOP path below, carrying what the inline attempt learned.

  On a clean re-check: set `ship-plan-readiness: ok`, clear any `pending-amend`, record the amendment (blocks touched, old→new `plan-version`) in the caller's artifact, and return to the caller to continue.
- **Amend separately — stop here** → STOP. Print `/wf ship-plan edit` and the block letters from the **amendable** findings' `suggested-block`. Say explicitly which findings the amendment will *not* clear and why (`clears-on: merge` / `repo`); a user who returns expecting a clean gate and meets the same question has been misled by the STOP message, not by the gate. Set `ship-plan-readiness: drift` and record `pending-amend: { signals, plan-version, at }` in `.ai/ship-plan-acks.yaml`, stamping the plan-version the amendment is expected to move; that is what lets Guard 2 tell "landed" from "not yet". For `handoff`, point the slug's `00-index.md` `recommended-next-*` at `/wf ship-plan edit` and resume after the amendment (no partial package); for `ship`, do not start the run. **Before stopping, preserve the orientation work** so the resumed run is cheap (Step R3.5, Preserving orientation across a STOP).
- **Acknowledge and proceed** → capture a freeform reason. Append it to `po-answers.md` with `stage: <handoff|ship>` and the finding signals, AND append a ledger entry to `.ai/ship-plan-acks.yaml` (`{ signals, fingerprint, fingerprint-scope, branch, plan-version, stage, at, via: ack, reason }` per finding, fingerprinted and scoped per Step R2.5; clear any `pending-amend` covering these signals). Set `ship-plan-readiness: acknowledged` and record the reason and finding signals in the artifact (handoff: `## Risks / Caveats`; ship: `## Pre-flight`). Return to the caller and continue. The acknowledgement persists via the ledger (a plan-scoped entry until the next `plan-version` bump, a branch-scoped one for the life of the branch) while new drift always still gates.
- **Cancel** → STOP.

# Step R3.5 — Preserving orientation across a STOP

Every STOP path above throws away work the run already did correctly. This gate fires **after** the caller has resolved its roster, run every prerequisite check, and computed its commit range, and a resumed run re-derives all of it from scratch, sometimes in a later session across a context compaction.

Before returning a STOP verdict, write into the slug's `00-index.md` (or, for `ship`, the run's own scratch state):

```yaml
resume-orientation:                     # cheap re-entry state; safe to ignore, safe to delete
  at: "<iso-8601>"
  stage: <handoff | ship>
  roster: [<slug>, ...]                 # the resolved roster (batch) or the single slug
  prereq-results:                       # per slug: what the prerequisite pass already decided
    <slug>: { ready: <true|false>, reason: "<why not, if not>" }
  commit-range: "<merge-base>..<head-sha>"
  blocked-on: ship-plan-<missing|drift>
  blocked-signals: [<signal>, ...]
```

A resumed run **may trust these only while the inputs have not moved**: if `HEAD` still matches the recorded range's head and no roster slug's `00-index.md` has a newer `updated-at`, skip re-deriving the roster and prereqs and go straight to the gate. Anything moved → discard the block and re-derive. Stale re-entry state that is silently trusted is worse than none; the head-SHA check is what makes it safe to keep.
