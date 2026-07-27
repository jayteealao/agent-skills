# Handoff/Ship Streamlining Plan

Status: PROPOSED — not started
Source: 2026-07-24 three-project transcript audit of `/wf handoff` + `/wf ship`
(Playster, Waypoint, Isometric; the post-v9.136.0 sessions 2026-07-19 → 07-24).
Predecessor: [HANDOFF-SHIP-HARDENING-PLAN.md](HANDOFF-SHIP-HARDENING-PLAN.md)
(2026-07-18 five-project audit → BUILT as v9.138.0).

Audit conclusion: **the gates fired correctly again — the cost was in the round
trips.** The prior audit found gates fed bad inputs; this one finds gates fed
*correct* inputs late. One handoff took 29 hours and four CI fix rounds to land a
PR with zero product regressions, because handoff pushes before running anything
locally. Everything below is about removing round trips, not adding gates.

Anchors verified against the source tree at **v9.140.0** on 2026-07-24. Line
numbers drift; the step names are the durable reference.

---

## W0 — Delivery gap (RESOLVED 2026-07-24, guard still owed)

Every session in all three repos — through 2026-07-24 — ran **9.136.0**.
`installed_plugins.json` pinned `sdlc-workflow@agent-skills-marketplace` to
`gitCommitSha: 67e2dbaa` (v9.136.0), sourced from the GitHub remote. v9.137.0,
v9.138.0, `bed65dc0`, v9.139.0 and v9.140.0 were committed locally and never
pushed, so the marketplace could not see them.

**Consequence:** the entire v9.138.0 handoff/ship hardening release had never
executed once in a real project. Findings W6.2 and W6.3 below were *already
fixed on disk* and still cost round trips in the field. Pushed 2026-07-24
(`67e2dbaa..ac2a5a7a`).

**W0.1 — Release-discipline guard.** A release commit is not done when the
version bumps; it is done when `origin/master` carries it. Add to the release
checklist (and the `plugin_version_bump_locations` discipline): after the release
commit, `git push origin master`, then confirm the marketplace can resolve it.
Consider a test or a session-start assertion that warns when `HEAD` is ahead of
`origin/master` **and** the ahead-range contains a `release(sdlc-workflow):`
commit — a stale marketplace pin is silent by construction and cost six days here.

---

## Incident → wave map (provenance)

| # | Incident (project) | Wave |
|---|---|---|
| 1 | `handoff editorial-reader-redesign` ran 2026-07-20 11:11 → 07-21 16:00 (~29 h, 4 CI fix rounds, 9 red checks → 20/20 green, **zero product regressions**). ≥4 of 7 root causes were locally reproducible: `prettier --check` failed on 5 files the branch added ("I reproduced this locally against the current branch tip"); three emulator-backed suites in the unit lane reproduced by `pnpm run test:unit`; a detekt `ReturnCount` violation *introduced by a round-3 fix agent* and pushed unlinted; an `actions/setup-java` pin (`21.0.9+10`) that does not exist in the Adoptium manifest (Playster) | W1 |
| 2 | Round-1 diagnosis said verbatim "Do not hand-add the 3 missing hashes — regenerate so nothing else is missed." The fix subagent hand-added 13 lines, disclosed the deviation in a trailing "Note on method", and still opened with **"Fix confirmed: yes."** The orchestrator accepted and pushed; round 2 hit the predicted next trio (Playster) | W2 |
| 3 | `ci-watch.max-fix-rounds: 2` counted three incomparable situations as one: self-inflicted product bugs; `dependency-audit` going red three times on advisories **published to OSV between runs** with zero repo changes; and Roborazzi goldens where harvesting actuals from a *failing verify run* converges one matrix variant per round ("the token sheet alone could take ~14 more rounds") (Playster) | W3 |
| 4 | Handoff passed every prerequisite, then STOPped at gate 6.7 on 4 drift findings (3 mechanical). User chose "Amend the plan first" → nothing written, `ship-plan edit` at 21:26, full re-run **a day later** after a context compaction, re-doing all orientation/prereq/gate work (Isometric) | W4 |
| 5 | `03-slice.md` slice entries still `status: defined` while implement/verify/review were complete. Handoff's aggregate mode collects only `complete`/`in-progress` → would have reported "no implemented slices"; both runs silently self-repaired it (Isometric, Playster) | W5 |
| 6 | A ship run where **nothing went wrong** still cost three hook-block/retry cycles writing the run artifact: sibling-`.yaml` schema had to be hunted for in the plugin install ("last time I guessed the schema and got blocked"); `release-workflow-conclusion` rejected `empty` (wants `""`); `notes` tripped the 80-char cap (Isometric) | W6 |
| 7 | `roborazzi-record.yml` — the branch's own purpose-built golden-recovery workflow — could not be dispatched: `HTTP 404: workflow not found on the default branch`. Resolved by a throwaway record-mode commit (Playster). CodeRabbit silently skipped PR #29 (>100-file limit) — the bot-settle machinery has no signal for "declined to review" (Playster). Ship's "Ship scope" question asked 07-20 22:57, answered 07-21 15:47 — **17 h with an atomic run held open** (Isometric) | W7 |

**Not a finding — worth protecting.** Waypoint's AC-15 was a deploy-time-circular
runtime-evidence deferral, PO-override-authorized, with rollout scoped
**staging-only and the `v0.1.0` production tag deliberately held**. The
human-driven evidence run then caught a production blocker — lesson SSE
persisting nothing, metering nothing, client `EventSource` auto-reconnecting into
a paid regeneration loop (8+ unmetered generations). The staged rollout is why
that met staging instead of production. Do not trade this away for speed.

---

## Wave 1 — Local pre-push gate (highest payoff)

Files: `skills/wf/reference/handoff.md`, `skills/wf/reference/_pr-ci-handoff.md`, tests.

Today handoff's **only** local gate before `git push` is commitlint
(`handoff.md` step 5b, "T3.5 — Commitlint pass"). Step 7 ("Push and
create-or-update PR") pushes, and step 7a discovers everything else through CI.
The `## Project-level handoff config` block carries `public-surface`,
`docs-mirror`, `review-bots`, `ci-watch`, `review-settle` — nothing that runs the
repo's own PR gates.

**W1.1 — New `pre-push-checks:` config key.** Add to `## Project-level handoff
config`, same optional/silent-skip discipline as its siblings:

```yaml
# Optional. Drives T3.8 — local pre-push gate. Absent → auto-detect (W1.2), else skip.
pre-push-checks:
  - { name: format, cmd: "pnpm exec prettier --check .", blocking: true }
  - { name: lint,   cmd: "cd android && ./gradlew detekt ktlintCheck", blocking: true }
  - { name: unit,   cmd: "pnpm -r run test:unit", blocking: true }
  timeout-minutes: 15        # per-command bound
  on-fail: diagnose          # diagnose | stop
```

**W1.2 — Auto-detect when the key is absent.** Read the PR-gate workflow(s) under
`.github/workflows/` and extract `run:` steps from jobs that are (a) required
checks per the ship plan's Block J, or (b) named `format`/`lint`/`test`/`build`.
Propose the derived list to the user once and offer to persist it into
`00-index.md`. Detection must be conservative — skip any step referencing
`secrets.`, a service container, an emulator, or a matrix `runs-on` the local host
is not. Record what was skipped and why; silent truncation reads as coverage.

**W1.3 — New step 5e / T3.8, before step 7's push.** Runs each check; on failure
routes into the **existing** diagnose→ask→fix-subagent path (`_pr-ci-handoff.md`
`## Fix-subagent contract`) rather than a new mechanism, so a local red and a CI
red feel identical to the user. Local fix rounds do **not** consume
`ci-watch.max-fix-rounds` (see W3.2) — they are strictly cheaper. Record
`pre-push-checks-status: <pass | fixed | fail | skipped | not-configured>` and
`pre-push-fix-rounds: <N>` in handoff frontmatter.

**W1.4 — Workflow-file static validation.** Cheap, catches the Playster Java pin:
before push, if the packaged diff touches `.github/workflows/**`, parse each
changed file as YAML and validate `actions/setup-*` version strings resolve
(`setup-java` against the Adoptium manifest, `setup-node`/`setup-python` against
their manifests). A `java-version: '21.0.9+10'` that the manifest serves as
`21.0.9+10.0.LTS` is a 10-second lookup that cost a full CI round.

**W1.5 — Tests.** Config-absent → step deleted silently. Config-present-and-red →
enters the fix path and does not push. Auto-detect skips a secrets-dependent job
and says so.

Effort: medium. Risk: low — additive, skips silently when unconfigured. This wave
alone removes most of Playster's 29 hours.

---

## Wave 2 — Fix-loop method fidelity

Files: `skills/wf/reference/_fix-loop.md`, `skills/wf/reference/_pr-ci-handoff.md`,
`skills/wf/reference/verify.md` (Step 7.6), `skills/wf/reference/review.md` (Step 4c).

The contract's instincts are right and have no teeth. `_fix-loop.md` rule 5
("Orchestrator sanity check") asks only "does it address the issue; does it
obviously break sibling code" — nothing compares the patch to the **prescribed
method**. The subagent prompt template asks for "one line on whether the fix is
confirmed", which the Gradle agent satisfied with "Fix confirmed: yes" while
having done the one thing the diagnosis forbade.

**W2.1 — Deviation reported first, not last.** Change the return contract in
`## Fix-subagent contract` so the subagent's response **leads** with:

```
Method: as-prescribed | deviated
If deviated: what the proposed fix said, what you did instead, and why.
```

A trailing "Note on method" paragraph is exactly how this was missed.

**W2.2 — Rule 5 gains a method clause.** `_fix-loop.md` rule 5 becomes: the
orchestrator inspects the returned patch against **both** the issue and the
proposed fix's method. `Method: deviated` is never auto-accepted — it is
surfaced to the user with the diagnosis's own words alongside, before push. When
the diagnosis carried an explicit prohibition ("do not hand-add…", "regenerate,
don't patch"), a deviation touching that prohibition is a hard stop.

**W2.3 — Self-check becomes a command, not prose.** Rule 4's "no new lint/type
errors" is unenforceable as written; a fix agent introduced a detekt violation
and pushed. When `pre-push-checks` (W1.1) is configured, the fix-subagent prompt
passes the relevant check command(s) and requires the subagent to run them and
report exit status. Absent config, require the narrowest gate the fix's own file
type implies.

**W2.4 — Tests.** A stub subagent returning `Method: deviated` must not be
auto-accepted; a fix that fails its own passed-in check command must return
`COULD NOT FIX` (rule 6) rather than a confirmation.

Effort: small. Risk: low.

---

## Wave 3 — Class the red before counting it

Files: `skills/wf/reference/handoff.md` (step 7a, config block),
`skills/wf/reference/_pr-ci-handoff.md`.

The diagnosis subagent already emits `class:` (`product-bug` / `flaky-or-infra`)
and used it accurately all four rounds. Nothing downstream consumes it.
`max-fix-rounds: 2` counts a prettier miss, a live-database advisory publication,
and a structurally non-convergent golden loop as the same event.

**W3.1 — Consume `class:` in the CI-red branch.** Route by class:

- `product-bug` — the current apply→push→re-watch path. With W1 in place these
  should be rare on the first CI round; when one appears post-push, note in the
  artifact that a local gate would (or would not) have caught it. That note is
  the feedback loop that tunes `pre-push-checks`.
- `flaky-or-infra` **and externally-moving gates** — do not spend a patch round.
  Surface the structural options directly: severity floor / tolerance /
  re-record path / suppression with justification. Playster's `dependency-audit`
  eventually got the right answer (a CVSS ≥ 7.0 gate) after three patch rounds
  chasing a moving database.
- **Non-convergent** — a new sub-class the diagnosis should be asked for
  explicitly: *does repeating this fix converge?* The golden loop's own
  diagnosis proved it did not (first-mismatch abort inside a matrix loop means
  one variant fixed per round). A `converges: no` answer must escalate to a
  structural decision immediately, never another round.

**W3.2 — Budget by class, not by count.** `max-fix-rounds` continues to bound
`product-bug` rounds. `flaky-or-infra` and non-convergent findings do not
consume the budget — they consume a *decision*. Local (W1) rounds do not consume
it either. Record `ci-fix-rounds-by-class:` in handoff frontmatter so the
artifact shows where the time actually went.

**W3.3 — Name what a bound-exceed cost.** When the bound is hit, the
`awaiting-input` message states which classes remain and what a structural fix
would be, so the authorization ask carries the decision rather than just "may I
have another round."

Effort: small–medium. Risk: low.

---

## Wave 4 — Drift gate amends inline

Files: `skills/wf/reference/_ship-plan-readiness.md` (`## Drift gate`),
`skills/wf/reference/ship-plan/edit.md`, `skills/wf/reference/handoff.md`.

The gate is correct and must keep firing — Isometric's amendment found two
genuinely wrong facts, including a recorded bump command
(`git cliff --bumped-version`) that *errors* on the repo's legacy non-semver tags,
i.e. the contract advertised automation that never existed. Only the
STOP-and-restart cost should go.

Today `## Drift gate` offers "Amend the plan (Recommended) → STOP; run
`/wf ship-plan edit` … then re-run." The v9.138.0 `pending-amend` re-fire guard
(shipped, now delivered) stops the *question* from repeating; it does not stop
the *handoff* from restarting.

**W4.1 — Third option: "Amend now and continue."** The user's answer already is
the authorization. Run `ship-plan edit` as a sub-step scoped to the findings'
`suggested-block` letters, re-run drift detection against the new `updated-at`,
and — on a clean re-run — continue the same handoff into packaging. This is
exactly the sequence Isometric performed manually across two sessions and a
compaction.

**W4.2 — Keep STOP as the honest fallback.** When the amendment needs judgment
the gate cannot supply (a block whose correct content is not derivable from the
repo), or when the re-run drift check is still dirty, fall back to today's STOP
+ `recommended-next-*` routing. Never continue on an unverified amendment.

**W4.3 — Preserve the orientation work across a STOP.** When W4.2 does fire,
record the roster, prereq results, and commit range in `00-index.md` so the
resumed run can skip re-deriving them (the fingerprint guard already exists for
packaging; this extends the idea to orientation).

**W4.4 — Tests.** Inline amend + clean re-check → handoff proceeds and
`ship-plan-readiness: ok` is stamped. Inline amend + still-dirty re-check →
STOP with routing.

Effort: medium. Risk: medium — this is the one wave that lets a gate resolve
itself. W4.2's fallback is what keeps it honest.

---

## Wave 5 — Slice-roster status writeback (confirmed defect)

Files: `skills/wf/reference/implement.md` (step 12),
`skills/wf/reference/verify.md` (step 10), `skills/wf/reference/handoff.md` (:342), tests.

`implement.md:391` and `verify.md:670` set `status: complete` on **their own**
artifact frontmatter. Nothing writes back to the per-slice `status:` field in
`03-slice.md`. `slice.md:176` writes the roster at `defined`; `probe.md:385` and
`simplify.md:23` append at `defined`; only `close.md:166` ever mutates it, to
`skipped`.

Handoff's aggregate mode (`handoff.md:72`) collects only `complete`/`in-progress`
— otherwise the slug is reported **"no implemented slices"** and skipped. Fully
implemented, verified and reviewed work is one silent bookkeeping field away from
being invisible to handoff. Both audited runs caught and repaired it by hand.

**W5.1 — `implement.md` step 12 updates the roster.** Where it already updates
`00-index.md` and `workflow-files`, also set the slice's entry in `03-slice.md`
to `status: in-progress` (or `complete` when the implement record itself is
complete). Change-modes write an un-suffixed one-slice `03-slice.md` — same rule.

**W5.2 — `verify.md` step 10 promotes to `complete`.** Same location as its
existing `00-index.md` update. `result: pass` → `complete`; a failing verify
leaves `in-progress`.

**W5.3 — Handoff self-heals instead of blaming the operator.** `handoff.md:342`
currently documents the symptom as a user recovery path ("Use when… `03-slice.md`
shows slices still in `status: defined`"). Change it: when a slice has an
existing `05-implement*` **and** `06-verify*` with `result: pass` but a roster
status of `defined`, reconcile it and emit a warning naming the stage that should
have written it — do not silently skip the slug, and do not silently fix it either.

**W5.4 — Tests.** A fixture slug with complete implement/verify and a `defined`
roster entry must be packaged, not reported "no implemented slices".

Effort: small. Risk: low. This is the clearest outright bug in the audit.

---

## Wave 6 — Ship artifact ceremony

Files: `skills/wf/reference/ship.md` (Step Z), `skills/wf/reference/_fragment-authoring.md`.

A ship run with nothing wrong still cost three blocked writes. Two of the three
causes are already fixed in source and were undelivered (W0):
`release-workflow-conclusion: ""` is documented at `ship.md:345`, and the notes
cap is 160 at `tests/frontmatter.schema.json:945` with the cap stated up front at
`ship.md:327`. The third is live at v9.140.0.

**W6.1 — Inline the sibling-`.yaml` required fields.** `ship.md:569` says
*"Schema: `siblingYamlSchemas['ship-run']` in `tests/frontmatter.schema.json`"* —
a path that only resolves inside the plugin install, which the author had to go
find at runtime after looking in the project repo first. Inline the required
field list (`release`, `run_at`, `stages`, `checks` [≥1], `rollback`) directly in
Step Z, with a minimal valid skeleton. Do the same for the other write-time
sibling types (see `sdlc_sibling_yaml_schema_reconciliation` — the write-time
allowlist is 5 real types, so this is bounded).

**W6.2 / W6.3 — no code change owed.** Delivered by W0's push. Track only to
confirm the field friction actually disappears in the next real ship run; if the
`""`-vs-`empty` confusion recurs at v9.140.0, the enum needs a clearer name, not
more prose.

Effort: small. Risk: none.

---

## Wave 7 — The remaining round trips

**W7.1 — Recovery workflows are unusable on the branch that creates them.**
`roborazzi-record.yml` was added by the PR *specifically* to recover from golden
drift, then `gh workflow run` returned `HTTP 404: workflow not found on the
default branch` — GitHub only dispatches workflows registered on the default
branch. The escape hatch could not help the PR that built it. Two places should
know this: `ship-plan build` (when it generates a `workflow_dispatch` recovery
workflow, state in the plan that it becomes usable only after the first merge)
and handoff's CI-red path (when a proposed fix is "dispatch workflow X", check
`git show origin/<base-branch>:<path>` first and, if absent, present the
default-branch-landing options instead of dispatching into a 404).

**W7.2 — Detect "review bot declined".** CodeRabbit skipped PR #29 entirely on
its >100-file limit; the `review-bots` list and `review-settle` window have no
signal for a bot that declined rather than one that is slow. Treat a skip/limit
notice from a configured bot as a readiness **caveat** (`bot-review-status:
declined` + reason), not as a settled review. A large PR should not quietly lose
its automated reviewer.

**W7.3 — Batch ship's load-bearing questions at Step 0.** Ship asked "Ship
scope" mid-sequence and waited 17 hours with an atomic run held open. Scope,
version, rollout and window are all knowable at Step 0 from the plan and the
diff; ask them together before the 13-step sequence starts. Questions that
genuinely depend on a mid-run outcome (a Go/No-Go after CI, a merge-path fallback)
stay where they are — this is about the ones that do not.

**W7.4 — `consult` remains environmentally walled on Windows.** It failed at
Isometric verify *and* handoff and at Playster handoff ("codex second opinion
attempted, environmentally walled"), forcing a subagent substitution each time;
Isometric's retro filed it as a new learning. Adjacent to but not covered by
v9.140.0's wall-ownership triage (that governs *AC deferrals*, not a stage's own
tooling). Under W0's own R1 question — "would a change to code in THIS repo
dissolve this wall?" — this one is plausibly **code-owned**. Diagnose the actual
failure before proposing a fix; do not re-plan around it a fourth time.

**W7.5 — Gate command hygiene.** The readiness gate's own prescribed shell
produced unusable output ("the `tee` trick produced whitespace noise — let me
re-run each check cleanly"). Sweep `_ship-plan-readiness.md`'s example commands
for constructs that mangle output on Git Bash / PowerShell.

Effort: small each. Risk: low.

---

## Sequencing

W5 and W6.1 are near-free and independently valuable — land first.
W1 is the payoff wave and W2 protects it (a local gate is worth little if fix
agents can push past it), so land them together.
W3 depends on W1 to be meaningful (classing the red matters once the
self-inflicted class is mostly gone).
W4 is the riskiest and should follow, once the drift gate has run a few times
against the now-delivered v9.138.0 acks ledger — its real re-fire rate at
v9.140.0 is not yet observed.
W7 items are independent; pick them up alongside.

## Open questions for the PO

1. **W1 default posture** — should `pre-push-checks` auto-detect and run when the
   key is absent (opt-out), or stay silent until configured (opt-in)? Opt-out
   catches more, at the cost of handoff running unfamiliar commands on the first
   run in a new repo.
2. **W4.1 scope** — is an inline `ship-plan edit` acceptable inside handoff at
   all, or does the release contract deserve a deliberate separate invocation
   even at the cost of a re-run? The prior audit's finding that acknowledgements
   must persist argues the plan is not sacred; this asks whether *amending* it is.
3. **W3.1 non-convergent class** — worth adding `converges: yes|no|unknown` to
   the diagnosis subagent's required output, or should it be inferred from
   `class: flaky-or-infra`? Inferring is cheaper; the golden loop was
   `flaky-or-infra` **and** non-convergent, and those needed different answers.
