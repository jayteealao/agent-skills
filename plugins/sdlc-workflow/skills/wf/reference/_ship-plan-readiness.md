---
description: Shared single-source procedure — the ship-plan readiness pre-check run by `/wf handoff` and `/wf ship`. Detects a missing `.ai/ship-plan.md` and detects drift between the plan and how the code actually ships (version sources, secrets, workflow files, release-relevant change surface, plan staleness), then gates: route to the sanctioned editor (`/wf ship-plan init` | `/wf ship-plan edit`) or record an explicit acknowledgement. Every finding carries a `clears-on: amend | repo | merge` tag and the gate only offers remedies that can actually clear it. It NEVER edits the plan itself — authoring stays in the ship-plan skill.
---

# Ship-plan readiness pre-check (SHARED — single source)

**A ship plan that no longer describes how the code actually ships is worse than no plan at all** — it lends a stale contract false authority at the exact moment (merge, tag, publish) that authority is irreversible. This pre-check is the guard: before `/wf handoff` declares a PR ship-ready and before `/wf ship` runs a release, confirm the project's `.ai/ship-plan.md` exists **and** still matches the repository. Both stages **gate** on the result — they cannot proceed silently past a missing or drifted plan; they require the plan fixed, or an explicit, recorded acknowledgement.

This file is loaded and followed verbatim by `ship.md` and `handoff.md`. It is the ONLY place the pre-check procedure lives — do not inline it elsewhere; cite it.

## Boundary — this check never authors the plan itself

The plan is a contract authored by `/wf ship-plan init` and amended, one block at a time, by `/wf ship-plan edit` (which bumps `plan-version`). This pre-check **detects and routes**; it never opens, rewrites, or bumps the plan **by hand**. Three outcomes are available when a fix is needed:

- **Route + STOP** — print the exact `/wf ship-plan …` command; the caller resumes after the user has run it.
- **Route + run inline** — with the user's explicit choice, invoke `ship-plan edit` as a sub-step **scoped to the drifted blocks**, then re-verify and continue the same run (see the Drift gate's *Amend now and continue*). The editor still does the authoring; this check only decides that it should run and confirms afterwards that it worked. A re-check that is not clean falls back to STOP.
- **Acknowledge** — proceed with known drift, recorded, never silent.

What stays absolutely out of bounds either way: this file never hand-edits `.ai/ship-plan.md`, never bumps `plan-version` itself, and never continues on an amendment it has not re-verified.

**And a fourth rule that governs which of the three it may offer:** a remedy is only offered for drift it can actually clear. Some findings are the plan being wrong about the repo (an amendment ends them); some are the repo being behind the plan (only a repo change ends them); some are true statements about an open branch that stay true until it merges. Offering "amend the plan" for the last kind is not a harmless extra option — it costs a `plan-version` bump, invalidates plan-scoped acknowledgements, and returns the user to the identical question. See `clears-on` in Step R2.

## Shell portability — the commands below are POSIX sketches, not literals

Every command in this file is written in POSIX shell for readability. On Windows the caller may be in PowerShell, where several of them are wrong or silently different. Translate before running; a gate whose own prescribed command produces unusable output makes the operator re-run everything by hand and distrust the gate (one run reported "the `tee` trick produced whitespace noise — let me re-run each check cleanly").

| Written here | PowerShell equivalent |
|---|---|
| `test -f <path>` | `Test-Path <path>` |
| `cmd 2>/dev/null` | `cmd 2>$null` |
| `` VAR=`cmd` `` | `$VAR = cmd` |
| `a && b` | `a; if ($?) { b }` (PowerShell 7 supports `&&`) |
| `cmd \| grep -q X` | `cmd \| Select-String -Quiet X` |

Three standing rules regardless of shell:

1. **One command, one purpose.** Do not chain a check through `tee`, a pager, or a formatter to "capture it too". Run it, read the exit status, run the next. Output-capture pipelines are where whitespace noise and swallowed exit codes come from.
2. **Never let a pipeline mask an exit code.** In POSIX shells a pipeline reports the *last* command's status, so `cmd | tee log` succeeds when `cmd` fails. If output must be captured, redirect (`cmd > log 2>&1`) and test the status directly.
3. **Quote paths.** Windows paths contain spaces far more often than the examples suggest.

## Inputs the caller passes in

| Input | From | Used by |
|---|---|---|
| `base-branch` | `00-index.md` | change-surface diff, staleness window |
| commit range | `git merge-base HEAD origin/<base-branch>`..`HEAD` (handoff) / the release HEAD (ship) | change-surface signal |
| `has-migration` | handoff frontmatter / `00-index.md` | rollback-playbook signal |
| `branch-strategy` | `00-index.md` | not-applicable path (local-only work) |
| caller | `handoff` or `ship` | which missing-plan gate applies (see Step R3) |

---

# Step R1 — Plan presence

`test -f .ai/ship-plan.md`.

- **Present** → parse Blocks A–G (and any inbound H–K) into memory; go to Step R2.
- **Missing** → skip R2; go to Step R3 with `verdict: missing`.

# Step R2 — Drift detection (three signal groups)

Run all three groups. Collect every mismatch into `drift-findings[]` as `{ signal, detail, suggested-block, clears-on }` where `suggested-block` names the ship-plan block the user would amend (`B` version, `C` CI/CD + secrets, `D` post-publish, `E` rollout/rollback, `F` recovery-playbooks). A run with an empty `drift-findings[]` is **clean**.

## `clears-on` — what actually ends a finding

**A remedy that cannot clear a finding is not a remedy.** Every signal carries a `clears-on` tag naming the one action that ends it, and the R3 gate offers remedies keyed to that tag. This field exists because the gate once did the opposite: a branch answered *Amend the plan*, amended block C exactly as instructed, and got the identical question back twelve minutes later — the surviving finding was one that only merging can clear, and the `plan-version` bump had wiped the ledger entry that would otherwise have suppressed it. The amendment was correct, useful, and structurally incapable of clearing the thing it was offered to clear.

| `clears-on` | Meaning | Signals |
|---|---|---|
| `amend` | An edit to the named block ends it — the plan is wrong about the repo. | `version-source-missing`, `version-source-new`, `secret-unplanned`, `secret-orphaned`, `workflow-missing`, `workflow-new`, `migration-without-rollback`, `plan-stale` |
| `repo` | A change **to the repository**, not to the plan, ends it — the plan is right and the repo is behind. | `version-already-released` (bump the working-tree version or cut from a new base), `compliance-stale` (re-run `/wf ship-plan build --dry-run`) |
| `merge` | Nothing ends it while the branch is open — it is a true statement about the branch that stays true until the branch lands. | `release-surface-touched`, `dependencies-changed` |

`clears-on` and fingerprint scope (R2.5) are **separate axes** and neither implies the other: `migration-without-rollback` fingerprints on the branch yet clears on an amendment, because adding the missing playbook to block F makes it false. Tag each finding from the table when you raise it; do not derive it.

## Group 1 — Version sources, secrets, workflow files (plan-vs-repo mismatch)

1. **Version source-of-truth files.** For each path in `plan.version-source-of-truth[]`: `test -f <path>`. A path that no longer exists → finding `{ signal: version-source-missing, detail: "<path> in the plan no longer exists", suggested-block: B }`. Then glob the repo for version-bearing manifests not covered by the plan — `package.json`, `pyproject.toml`, `setup.py`, `Cargo.toml`, `build.gradle*`, `pom.xml`, `*.gemspec`, `go.mod`, `*.csproj` — and for any that is version-bearing but absent from `version-source-of-truth[]` → finding `{ signal: version-source-new, detail: "<path> carries a version but the plan does not list it", suggested-block: B }`. (In a monorepo a new package is the common trigger.)

2. **Required secrets.** Collect every `${{ secrets.NAME }}` reference across `.github/workflows/*.y*ml` (exclude the auto-provided `GITHUB_TOKEN`). Diff against `plan.ci-pipeline.required-secrets[].name`:
   - referenced in a workflow but **absent from the plan** → finding `{ signal: secret-unplanned, detail: "<NAME> is used by <workflow> but not in required-secrets[]", suggested-block: C }`.
   - listed in the plan but **referenced nowhere** → soft finding `{ signal: secret-orphaned, detail: "<NAME> is in the plan but no workflow references it", suggested-block: C }` (advisory — never the sole blocker).

3. **Workflow files.** Confirm `plan.ci-pipeline.release-workflow-file` (and `plan.release-workflow-file`, `plan.release-workflow-file`'s equivalents) still exist on disk → missing → finding `{ signal: workflow-missing, detail: "<file> named by the plan does not exist", suggested-block: C }`. Then list `.github/workflows/*.y*ml` files added since the plan's `updated-at` (`git log --since="<plan.updated-at>" --name-only --diff-filter=A -- .github/workflows`) and for each → finding `{ signal: workflow-new, detail: "<file> was added after the plan was last updated", suggested-block: C }`.

4. **Version already released.** For each path in `plan.version-source-of-truth[]`, read the version it currently carries and check it against existing release identities: `git tag -l "v<version>" "<version>"` and (when a remote exists) `gh release view <tag> --json tagName` for the matching tag form. A working-tree version that already has a tag/release → finding `{ signal: version-already-released, detail: "<path> carries <version> but tag <tag> already exists (released <date>) — the branch's release identity is stale", suggested-block: B }`. This is the collision a handoff once certified as "release identity frozen" four days after that identity had shipped — nothing structural caught it; session memory did.

5. **Compliance record staleness (advisory).** If `.ai/pipeline-compliance.md` exists and its `plan-version` is lower than the plan's current `plan-version` → soft finding `{ signal: compliance-stale, detail: "pipeline-compliance.md records build state for plan v<M> but the plan is v<N> — re-run /wf ship-plan build --dry-run to re-verify", suggested-block: C }` (advisory — never the sole blocker). The compliance file is a build **receipt**, not trusted state: it can survive branch resets and keep asserting "done" for infrastructure that no longer exists. Any consumer must re-verify against the live repo/remote; this finding is only the cheap nudge to do so.

## Group 2 — Release-relevant change surface (the packaged diff)

Diff the caller's commit range name-only (`git diff --name-only <range>`). Raise findings when the change touches release-shaping surface the plan may not yet reflect:

- Any path under `.github/workflows/`, or a CI/build config (`Dockerfile`, `docker-compose*`, `*.tf`, `helm/`, `k8s/`, `.github/`, build config for the ecosystem) → `{ signal: release-surface-touched, detail: "the packaged change edits <path> — the shipping pipeline moved", suggested-block: C }`.
- A dependency manifest or lockfile changed (`package.json`/`package-lock.json`/`pnpm-lock.yaml`/`yarn.lock`, `pyproject.toml`/`poetry.lock`, `Cargo.toml`/`Cargo.lock`, `go.mod`/`go.sum`, `*.gradle*`, `pom.xml`) → `{ signal: dependencies-changed, detail: "dependencies changed in <path> — a new registry/target may need planning", suggested-block: C }`.
- `has-migration: true` on the workflow **and** no `plan.recovery-playbooks[]` entry whose `id`/`triggers` covers a migration/rollback path → `{ signal: migration-without-rollback, detail: "this change carries a migration but the plan has no matching rollback playbook", suggested-block: F }`.

Each Group-2 finding means "the plan should be revisited," not necessarily "the plan is wrong". The first two are `clears-on: merge` — they describe the *packaged diff*, so no edit to the plan can falsify them while the branch is open; `migration-without-rollback` is `clears-on: amend`, because adding the playbook to block F does falsify it. Tag them accordingly, because the gate's remedy menu is built from that tag.

## Group 3 — Plan staleness heuristic

Count infra-touching commits since the plan was last updated:
`git log --since="<plan.updated-at>" --oneline -- .github/workflows package.json pyproject.toml Cargo.toml build.gradle build.gradle.kts pom.xml go.mod`
If the count `≥ 5` (and no more-specific Group-1/2 finding already fired for the same surface) → finding `{ signal: plan-stale, detail: "<N> pipeline/manifest commits since the plan was last updated (plan-version <v>, updated <date>) — the plan may be stale", suggested-block: C }`. This is a heuristic nudge: it flags "a lot moved under the plan" even when nothing mismatches exactly.

> **Deeper than drift.** This pre-check only catches *mechanical mismatch* (a file moved, a secret unplanned). When a lot has moved — or before a first real release — the plan may be drift-free yet still **unsound** (ordering hazards, a rollback that isn't a rollback, over-broad permissions). That is `/wf ship-plan audit`'s job, not this gate's. When `plan-stale` fires, it is reasonable to suggest the user run `/wf ship-plan audit` for a soundness pass — but this pre-check never blocks on it.

# Step R2.5 — Acknowledgement-ledger filter (persistence without silence)

Acknowledgements live in a sibling ledger, `.ai/ship-plan-acks.yaml` (list of entries `{ signals: [], fingerprint, fingerprint-scope, branch, plan-version, stage, at, via, reason }` plus an optional `pending-amend: { signals: [], plan-version, at }`). The pre-check reads and appends to this ledger; it still **never** edits the plan itself. `via` records how the entry was earned — `ack` (the user accepted the drift) or `amendment` (the plan was amended in response to it; see the Drift gate).

**Invalidation is scoped, not wholesale.** The original rule — a `plan-version` bump deletes every entry — is right about plan-scoped acks and wrong about branch-scoped ones, and that difference is precisely what turned one honest amendment into a repeat gate:

- **`fingerprint-scope: plan`** entries are invalidated by a `plan-version` bump: delete those recorded below the plan's current version. These are claims *about the plan*, and an amended plan must re-earn them.
- **`fingerprint-scope: branch`** entries **survive** a `plan-version` bump. They assert a fact about the branch ("this branch edits `.github/workflows/`") that an amendment does not make false — and that the amendment was very often made *in response to*. Invalidate them when `branch` is not the current branch; they die with the branch at merge. Deleting them on a version bump destroys the one piece of state that keeps a settled question settled, at the exact moment the user has earned it.
- **`pending-amend`** is cleared once `plan-version` rises above the value recorded alongside it — the amendment it was waiting for has happened. What to do with the findings it covered is the Drift gate's *amendment-landed* guard, not a silent drop.

Before gating, partition `drift-findings[]` against the surviving ledger:

- A finding whose `(signal, fingerprint)` matches a surviving ledger entry is **already settled** — drop it from the gate and report it as one advisory line ("previously <acknowledged|amended for>: <signal> — <reason> (<at>)"). It never re-asks.
- The fingerprint is what makes this safe: **new drift always still gates.**
  - Group-1/Group-3 findings fingerprint on the finding's `detail` surface (the specific path/secret/workflow/version named), `fingerprint-scope: plan` — a *different* mismatch is a *new* finding.
  - The structural Group-2 signals (`release-surface-touched`, `dependencies-changed`) fingerprint on `(signal, branch)`, `fingerprint-scope: branch` — they re-fire on every new commit to the same branch *by construction* (any branch that touches workflows/manifests keeps touching them) and cannot clear until merge, so one entry covers the branch for its whole life. One prior branch acknowledged the identical pair three times across handoff and ship; that third ask protected nothing.
  - `migration-without-rollback` fingerprints on `(signal, branch)`, `fingerprint-scope: branch`; `plan-stale` on `(signal, plan-version)`, `fingerprint-scope: plan`.

Findings that survive the filter proceed to the R3 gate as before.

# Step R3 — Verdict + gate

Compute the verdict from R1/R2 (post-R2.5 filter — a run whose every finding was already acknowledged is verdict `ok` with the advisory lines in the report):

- `missing` — no plan (from R1).
- `drift` — at least one **gating** finding survives. Advisory findings (`secret-orphaned`, `compliance-stale`) are never gating and never counted into the ask — they are printed beneath the table and carried forward.
- `ok` — plan present and no gating finding survives (surviving advisories are fine and are reported). **Record `ship-plan-readiness: ok` and return to the caller — no prompt.**

Both `missing` and `drift` **gate**: present the situation and require an explicit decision. Use AskUserQuestion.

## Missing-plan gate

Infer a `--from-template <kind>` suggestion from the ecosystem (npm→`npm-public`, PyPI→`pypi`, Maven/Gradle→`kotlin-maven-central`, Docker→`container-image`, a deploy→`server-deploy`, otherwise `library-internal`).

- **Caller = `ship`** — ship literally reads the plan; it cannot run without one. Two options only:
  ```yaml
  question: "No ship plan at .ai/ship-plan.md. Ship is plan-driven and cannot run without it. Author one now?"
  header: "Ship plan"
  options:
    - { label: "Create it (Recommended)", description: "STOP here; run /wf ship-plan init --from-template <kind>, then re-run /wf ship." }
    - { label: "Cancel",                  description: "Abort this ship run; leave everything unchanged." }
  multiSelect: false
  ```
  Either way STOP — do not run the release. On "Create it", print the exact command:
  `/wf ship-plan init --from-template <kind>` and set `ship-plan-readiness: missing`.

- **Caller = `handoff`** — a repo may legitimately ship outside this workflow (CI/CD auto-deploy on merge, release owned elsewhere, `branch-strategy: none`). Offer the not-applicable path:
  ```yaml
  question: "No ship plan at .ai/ship-plan.md. /wf ship will require one. Author it now, or is shipping handled outside this workflow?"
  header: "Ship plan"
  options:
    - { label: "Create it now (Recommended)", description: "STOP; run /wf ship-plan init --from-template <kind> before shipping, then re-run handoff." }
    - { label: "Shipping is external",        description: "This work ships outside /wf ship (auto-deploy/owned elsewhere). Proceed; record ship-plan-readiness: not-applicable." }
    - { label: "Cancel",                      description: "Abort the handoff; leave everything unchanged." }
  multiSelect: false
  ```
  - "Create it now" → STOP; print `/wf ship-plan init --from-template <kind>`; set `ship-plan-readiness: missing`. This fires before packaging, so do not emit a partial `08-handoff.md` — point the slug's `00-index.md` `recommended-next-*` at `/wf ship-plan init` and resume handoff after the plan exists.
  - "Shipping is external" → set `ship-plan-readiness: not-applicable`; note the reason in the handoff's `## Risks / Caveats`; return to the caller and continue.
  - "Cancel" → STOP.

## Drift gate

## Two re-fire guards — an answered question is not a new question

**Guard 1 — answered but unexecuted.** If the ledger carries `pending-amend` and the plan's `plan-version` is unchanged since it was recorded, the user already chose "Amend the plan" for these signals and the amendment never happened — do NOT re-ask the identical question as if it were new (one drift once consumed three STOP rounds this way, one of them a verbatim re-fire). Present a reminder instead: "You chose *Amend the plan* at <at> for <signals>, but plan-version is unchanged — amend now, or acknowledge the drift to proceed." Options: **Amend now and continue** (run the scoped inline amendment per the first bullet below; clears `pending-amend` on a clean re-check) / **Amend separately — stop here** (STOP, route as below; keep `pending-amend`) / **Acknowledge and proceed** (as below; clears `pending-amend`) / **Cancel**. A run that already chose to amend and did not is the case the inline path exists for — prefer it here.

**Guard 2 — the amendment landed.** If `pending-amend` was recorded and the plan's `plan-version` has since **risen**, the user did exactly what the gate asked. Clear `pending-amend`, then re-partition the findings it covered by `clears-on`:

- `clears-on: amend` and now **gone** — expected. Say nothing.
- `clears-on: amend` and **still present** — the amendment did not land it. That is genuinely new information: gate on it normally and say plainly that the amendment did not clear it.
- `clears-on: merge`, or `clears-on: repo` where the repo has not moved, and still present — **do not gate.** The amendment could never have cleared these, and the user has already paid its cost. Write a ledger entry per finding with `via: amendment`, `fingerprint-scope: branch`, and `reason: "plan v<N> was amended for block(s) <blocks> in response to this finding; it cannot clear until <merge|the repo action>"`; report each as one advisory line and continue.
- If nothing gating survives this partition the verdict is `ok` — return to the caller with no prompt at all.

This guard exists because its absence was reported from the field. A branch hit the gate with `release-surface-touched` + `plan-stale`, chose *Amend the plan*, ran `/wf ship-plan edit` on block C (correctly, and it improved the plan), bumped `plan-version` 4→5 — which wiped the ledger — and re-ran handoff twelve minutes later into the identical question. `plan-stale` had genuinely cleared; `release-surface-touched` could not have, by construction. Guard 2 plus the scoped invalidation in R2.5 is what ends that loop.

## Remedy menu — offer only what can work

Let `amendable` = the gating findings whose `clears-on` is `amend`. Print the gating findings as a short table (signal · detail · block · `clears-on`), then any advisories beneath as plain lines. `<N>` counts **gating findings only**.

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

Name in the amend options **only the blocks the amendable findings point at.** A `merge`-class finding riding along in the same table does not add its block to the amendment — that is how an amendment gets asked to clear something it cannot.

**When `amendable` is empty — never offer an amendment.** Every surviving finding clears on `merge` or `repo`, so an amend option here proposes a `plan-version` bump that changes nothing, re-opens the plan-scoped ledger, and guarantees this question comes back. Offer the actions that can actually end it:

```yaml
question: "The ship plan is <N> finding(s) out of step with the branch, none of which amending the plan can clear. How do you want to proceed?"
header: "Plan drift"
options:
  - { label: "Acknowledge and proceed (Recommended)", description: "Record a reason. The entry is branch-scoped: it survives plan amendments and does not re-ask for the life of this branch." }
  - { label: "Fix in the repo — stop here",           description: "STOP; run <the repo action named by the finding>, then re-run this stage." }
  - { label: "Cancel",                                description: "Abort; leave everything unchanged." }
multiSelect: false
```

Drop the middle option when no finding is `clears-on: repo` — a two-option gate is honest; a third option that matches no finding is noise. If the user still wants to amend the plan for its own sake, that is `/wf ship-plan edit` on their own terms, not this gate's remedy; say so in the acknowledgement's advisory line rather than offering it as a way out of the gate.

- **Amend now and continue** → the user's answer *is* the authorization; a second invocation adds ceremony, not consent. Run `/wf ship-plan edit` as a **sub-step of this stage**, then re-verify. Five rules keep it honest:
  1. **Scoped.** The inline amendment may touch **only** the block letters named by the *amendable* findings' `suggested-block`. It is not an open editing session — a drift about a missing secret does not license rewriting the rollback contract.
  2. **The editor still owns authoring.** Load `ship-plan/edit.md` and follow it for the named blocks (it re-runs those blocks' questions pre-filled with current values, and bumps `plan-version`). This pre-check still never writes the plan itself — the boundary at the top of this file is unchanged; it now *invokes* the sanctioned editor rather than only printing its name.
  3. **Re-check, don't assume.** After the edit, re-run Step R2 against the plan's new `updated-at`/`plan-version`. Only a re-run with no surviving **gating** finding continues the caller into its next step. The `plan-version` bump invalidates the *plan-scoped* half of the ledger by design (R2.5) — every plan-scoped claim must re-earn its verdict, including ones acknowledged earlier in this same run. Branch-scoped entries survive, which is what keeps the re-check from re-raising what rule 4 just settled.
  4. **Bank what the amendment bought.** An amendment made in response to a drift gate is evidence about every finding in that gate, not only the ones it could clear. On a successful edit, write a ledger entry for each co-occurring `clears-on: merge` finding with `via: amendment`, `fingerprint-scope: branch`, and a reason naming the blocks and the new `plan-version`. Skip this and the re-check in rule 3 re-raises the untouchable findings immediately, inside the same run — the loop in Guard 2, compressed.
  5. **Still dirty → fall back to STOP.** If the re-check still reports a gating finding, or if the amendment needs judgment the repo cannot supply (a block whose correct content is not derivable from the code — an org's signing policy, a human approval chain), do **not** continue on an unverified amendment. Fall through to the STOP path below, carrying what the inline attempt learned.

  On a clean re-check: set `ship-plan-readiness: ok`, clear any `pending-amend`, record the amendment (blocks touched, old→new `plan-version`) in the caller's artifact, and return to the caller to continue. This is exactly the sequence one project performed by hand across two sessions and a context compaction — the gate was right both times; only the restart was waste.

- **Amend separately — stop here** → STOP. Print `/wf ship-plan edit` and the block letters from the **amendable** findings' `suggested-block`. Say explicitly which findings the amendment will *not* clear and why (`clears-on: merge` / `repo`) — a user who returns expecting a clean gate and meets the same question has been misled by the STOP message, not by the gate. Set `ship-plan-readiness: drift` and record `pending-amend: { signals, plan-version, at }` in `.ai/ship-plan-acks.yaml`, stamping the plan-version the amendment is expected to move — that is what lets Guard 2 tell "landed" from "not yet". For `handoff`, point the slug's `00-index.md` `recommended-next-*` at `/wf ship-plan edit` and resume after the amendment (no partial package); for `ship`, do not start the run. **Before stopping, preserve the orientation work** so the resumed run is cheap — see `## Preserving orientation across a STOP` below.
- **Acknowledge and proceed** → capture a freeform reason. Append it to `po-answers.md` with `stage: <handoff|ship>` and the finding signals, AND append a ledger entry to `.ai/ship-plan-acks.yaml` (`{ signals, fingerprint, fingerprint-scope, branch, plan-version, stage, at, via: ack, reason }` per finding, fingerprinted and scoped per Step R2.5; clear any `pending-amend` covering these signals). Set `ship-plan-readiness: acknowledged` and record the reason + finding signals in the artifact (handoff: `## Risks / Caveats`; ship: `## Pre-flight`). Return to the caller and continue. The acknowledgement **persists via the ledger** — a plan-scoped entry until the next `plan-version` bump, a branch-scoped one for the life of the branch — while new drift always still gates (R2.5).
- **Cancel** → STOP.

# Step R3.5 — Preserving orientation across a STOP

Every STOP path above throws away work the run already did correctly. This gate fires **after** the caller has resolved its roster, run every prerequisite check, and computed its commit range — and a resumed run re-derives all of it from scratch, sometimes in a later session across a context compaction. The fingerprint guard already proves this idea works for *packaging*; this extends it to *orientation*.

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

# Step R4 — Record the outcome

Whatever the path, stamp `ship-plan-readiness: <ok | missing | drift | acknowledged | amended-inline | not-applicable>` into the calling stage's artifact frontmatter (`08-handoff.md` / `09-ship-run-<run-id>.md`) and, on the lead slug in batch mode, once for the branch (the plan is project-level — one check per repo per run, not per slug). Older artifacts without the field predate this pre-check; treat an absent field as `skipped`.

---

# Caller integration (quick reference)

- **`/wf ship`** — run this pre-check inside Step 0 immediately after reading `.ai/ship-plan.md`. `missing`/`drift`/`cancel` all STOP before the 13-step sequence. `ok`, `acknowledged`, and `amended-inline` proceed.
- **`/wf handoff`** — run this pre-check once the roster and commit range are known (after the fingerprint/roster report, before packaging). `missing`/`drift` STOP and route via `00-index.md` `recommended-next-*` (no partial package written, but `resume-orientation` **is** written per R3.5 so the resumed run skips re-deriving the roster and prereqs); `ok`, `acknowledged`, `amended-inline`, and `not-applicable` proceed to packaging. In batch mode the lead owns the single check.

**On `amended-inline`:** the caller records, in its artifact, which blocks were amended and the `plan-version` before→after — the amendment happened inside a stage run, so the artifact is the only place a reader will find it.
