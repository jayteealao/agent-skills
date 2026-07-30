# Intake-modes holistic audit — 2026-07-30

Status: **FINDINGS ONLY — nothing fixed.** Companion to the investigate review
that shipped v9.145.0 (`docs/internal/INVESTIGATE-DECISION-LIFECYCLE-PLAN.md`).
Scope: every intake mode except `default` — `fix`, `hotfix`, `refactor`,
`update-deps`, `rca`, `discover`, `ideate`, `extend`, `adopt`, `amend`,
`modernize`. Method: five parallel read-only reviewers (two-three modes each),
each grading goal fit, entry edge, terminus edge, stall rungs, consistency,
and direction, with file:line evidence required; the four most load-bearing
cross-file claims were re-verified by hand (verify.md:74 stack STOP,
ship.md:21/58 handoff requirement, adopt.md:159/275 illegal enum,
frontmatter.schema.json:1899 rca sibling-yaml required set).

## Headline

**Five of eleven modes have a hard dead-end on their own documented happy
path.** These are not style findings; the mode cannot complete as written:

- **adopt** — schema-invalid before it finishes: `slices[].status: implemented`
  (adopt.md:159, :275) is not in the enum `defined|in-progress|complete|skipped`;
  `post-write-verify.mjs` Ajv-blocks the write (exit 2). Adopt also has NO
  Step 0 at all: no slug derivation, no collision check.
- **rca** — three dead-ends: (1) its declared default successor `/wf plan`
  STOPs on the `stack:` block rca's index template never writes (rca.md:290-313
  vs plan.md:76-77); (2) the MANDATORY sibling `.yaml` requires post-incident
  data (`resolved_at`, `time_to_mitigate`, min-2 resolution timeline, heatmap —
  schema.json:1899) that a pre-fix RCA cannot honestly have, and the hook
  BLOCKS the artifact write without it; (3) its recommended routes
  `/wf intake fix <slug>` are malformed under the dispatcher grammar
  (slug after mode → standalone branch → fix.md:40 collision-WARN-stop);
  rca.md:342-343 documents the dead end as expected behavior.
- **hotfix** — pipeline routes review → `/wf ship`, but ship.md:21/:58 STOPs
  without `08-handoff.md` `readiness-verdict: ready`, which the pipeline
  skipped. A production incident cannot exit through its own lifecycle. Also:
  index omits `stack:` entirely → verify.md:74 STOP at stage 6.
- **fix** — index template says `stack:` "optional here" (fix.md:226) while
  verify.md:74 STOPs when it is missing and verify.md:75 hard-gates on
  `user-confirmed: false`, which only default intake's Batch B can flip.
- **update-deps `--audit-only`** — terminates with `next-invocation: /wf review`
  while review/_stage.md STOPs without `05-implement.md` and implement.md STOPs
  update-deps back to intake: both forward commands refuse. No lawful terminus.

The likely reason these survived: the compressed modes were validated as
*authors* (their artifacts render, their tests pass) but never traced as
*callers* into the stage commands' preconditions. Every dead-end above is a
cross-file contract violation, invisible to any single-file check.

## The five systemic classes (cross-cutting)

**C1 — Decisions die in chat; workflows never close.** Closure vocabulary
exists ONLY in investigate.md (post-v9.145.0) and `_investigate-provenance.md`.
Terminal modes rca/discover/ideate park in `/wf status` Active forever with no
record of the route taken, the verdict acted on, or the idea picked. The gate
decisions of fix/refactor/update-deps (escalate, audit-only, P0-only,
coverage-gap-accepted) are recorded nowhere durable — fix/refactor Escalate
leaves `status: active` + `next-command: wf-implement` pointing at abandoned
work. This is investigate gap (b), reproduced ten times.

**C2 — Evidence forwarding exists only for investigate.** `_investigate-provenance.md`
shipped the pattern; nothing else uses it. rca's diagnosis is re-derived by
fix/hotfix (rca.md:343 calls inheritance a "Future enhancement"); simplify's
findings are retyped into refactor (simplify.md:264 routes there; refactor has
no provenance step); discover's counter-hypotheses never seed the rca it
routes to on `fails`; ideate's per-idea `file:line` evidence is dropped from
the machine-readable roster (ideate.md:375-383) and `_investigate-provenance.md:14-17`
explicitly rejects non-investigate slugs; update-deps cold-rescans every run,
re-earning last month's Hold/Blocked research; probe/simplify findings arrive
at extend as bare prose. Gap (a), everywhere.

**C3 — Stall rungs are "ask a human" almost everywhere.** investigate's
escalation ladder (discover slice / study-sources / consult / probe) has no
counterpart: rca low-confidence → "human triage" with no probe rung (probe.md:33
names itself rca's runtime sibling); hotfix low root-cause confidence → a third
guessing agent, then commit the guess; discover's one runtime rung
`/wf probe <area>` is not a valid invocation (probe takes a slug); refactor's
"Add tests first (recommended)" names no mechanism; ideate hard-culls
speculative candidates instead of routing them to a cheap check.

**C4 — Index/artifact frontmatter drift, now with schema-invalid templates.**
Beyond gap (d): rca+discover author `progress:` as a YAML list that
`renderers/workflow-index.mjs:124` silently drops (empty panel); both omit
`title`/`updated-at` (untitled, never-stale dashboard rows); rca's synthesized
shape carries `status: ready`, not in the shape enum; adopt's `implemented`
enum violation; fix/hotfix/refactor/update-deps hardcode `open-questions: []`
and `has-blockers: false` on the very paths that produce accepted risks;
fix/hotfix/adopt omit `review-scope-confirmed`/`appetite`/`stack` from a
template they claim equals default.md's required set — and plan.md:82 reads
ABSENT `review-scope-confirmed` as "already asked", silently skipping the
confirm-once machinery.

**C5 — Shared text has drifted where it must be identical (S5).** fix/hotfix/
refactor share five near-identical blocks with material drift: the gate step
(only fix documents Adjust/re-gate), the collision check (fix full, hotfix/
refactor one clause), the workflow-rules tail (missing from fix), the index
template (stack optional/absent/absent), escalation recording (fix has
warn-and-continue breach record; hotfix instead has an unwritable `≤3` plan
constraint reachable only AFTER the plan is written; refactor has neither).
All three drop `/wf retro` from their pipeline line — hotfix most perversely,
since retro.md:29 auto-triggers its incident consult exactly for hotfixes.
Candidate: a shared `_change-mode-tail.md`.

## Per-mode verdicts (direction + top findings)

Full evidence lives in the reviewer outputs; every claim below carries
file:line there. Severity: H/M/L.

### fix — keep direction; wire the edges
H: stack-block dead-end at verify (fix.md:226 vs verify.md:74-75). H: Escalate
is chat-only, slug stays active (fix.md:230 vs close.md). M: inherits
investigate provenance but not rca (fix.md:41; rca.md:342). M: tripwire
breaches prose-only; `has-blockers` hardcoded false (fix.md:155,169). M:
Step-0 mandates `origin-investigate` but the index template lacks the key
(fix.md:41 vs :181-224). L: `--design` flag unknown to the dispatcher
tokenizer (fix.md:24 vs intake.md:3). Proposals: carry `stack:` with a
one-line confirm; Escalate closes via close.md `superseded`; promote breaches
to `intent-risks` entries.

### hotfix — keep direction; entry, exit, and criteria all leak
H: ship dead-end (no handoff stage; ship.md:21). H: produces NO acceptance
criteria while verify.md:69 and review/_stage.md:75 declare they read them
(fix.md:90 writes them; hotfix doesn't). H: index omits `stack:` → verify
STOP. M: incident severity/impact/timeline never reach handoff/ship
(announce.md reads the literal filename `01-intake.md`, which hotfix never
writes); the mandated `## Rollback` has no consumer (rollback executor reads
ship-plan Block E only). M: no RCA inheritance while rca routes critical
cases here. M: the `≤3 files` plan constraint makes Escalate reachable only
through a schema-violating plan. L: prod-branch detection needs the network
mid-incident. Proposals: restore handoff+retro to the pipeline and push
`## Impact` into `intent-risks`; add ≤2 acceptance criteria to `01-hotfix.md`;
RCA provenance + a confidence floor that stops into probe/human-triage
instead of writing a guessed root cause.

### refactor — keep direction; the baseline must become executable
H: the promised verify-side baseline comparison (refactor.md:221) does not
exist in verify.md — the mode's single acceptance criterion is unenforced.
H: Escalate discards the 2-sub-agent API-surface/coverage baseline and leaves
the slug active. H: simplify routes findings in; refactor has no provenance
step. M: coverage-gap gate decision undurable; `Add tests first` has no
mechanism; branch hardcoded even when the user chose current-branch; Step-4
sub-agent has no model pin. Proposals: `## Baseline Command` + a verify.md
refactor branch that re-runs and diffs it; generalized provenance (simplify
in, Escalate out); Escalate/Abort close the slug.

### update-deps — ADJUST; the research half is exemplary, the lifecycle half is broken
H: self-authored 05/06 never update the index — completed dependency work
reads as unimplemented in `/wf status` forever. H: audit-only two-command
deadlock. H: Hold/Blocked/revisit-when data is write-only prose; next run
cold-rescans and re-derives it. H: no resume grammar can reach a prior run
(bare token parses as a package name). M: `next-command`/`next-invocation`
contradict each other inside single frontmatter blocks; gate decision recorded
only on the audit-only branch; review/_stage.md reads tiers from a file that
contains a pointer line. Proposals: self-authored stages self-report to the
index; audit-only gets a lawful terminus (`/wf close <slug> deferred`) and
Hold → `open-questions`; Step 0 seeds from the last run's Hold/Blocked lists.

### rca — keep direction; strongest artifact, weakest plumbing
The three dead-ends above (plan STOP, sibling-yaml block, malformed routes),
plus: no closure/route record; no provenance contract (its own file defers it
as "future enhancement"); human-triage the only stall rung with probe one
invocation away; list-form `progress:` renders blank; `wf-how` stale ref;
`selected-slice` names a slice that never exists. Proposals:
`_rca-provenance.md` (fix/hotfix/default consume; Section 10 prints the
grammatically-valid `from <slug>` form); `# Route — decision closure`
mirroring investigate's pick (bundling the index-template repairs: stack,
title, updated-at, object progress); adopt investigate's ladder with probe as
the runtime rung. Also: the sibling-yaml requirement needs a pre-fix-shaped
variant or the documented `fragment: none` escape — as specced it forces
fabrication of a resolution timeline that has not happened.

### discover — keep direction; the verdict must close and forward
H: never closes (verdict is by construction terminal; nothing left to pick —
closure should happen at write time, no re-invocation needed). H: the
motivating decision (Q3) is collected, used to size effort, and discarded —
on `fails` nothing records which plan lost its premise. H: `fails`/
`inconclusive` route to rca with no provenance, discarding ranked
counter-hypotheses that are literally candidate root causes. M: `/wf probe
<area>` invalid; haiku REQUIRED with no escalation despite "dig harder"
prose; `/wf recap` recommended five times for a job recap.md explicitly
disclaims (deep-research owns it); list-form progress; no title/updated-at.
Proposals: close-on-verdict + `## 0. What this decides` + `recommended-routes`;
discover-provenance on the fails path; make both rungs executable (probe slug
form + study-sources; sonnet pin when a large decision rides on the verdict).

### ideate — port investigate's lifecycle wholesale
H: the only remaining "user picks" terminal with no pick record, no closure,
no provenance — and `_investigate-provenance.md:14-17` actively rejects its
slugs. H: the `ideas:` roster drops the per-idea `file:line` evidence the
lenses were required to gather. M: the user's multiSelect answer is never
persisted; extension-shaped ideas are always rendered as new-workflow
invocations; a 10-option AskUserQuestion is unbuildable (everywhere else is
2-4); Challenge-1 hard-culls speculative candidates with no cheap-check rung;
entry ignores retro action items, `.ai/solutions/`, deferred review findings,
and debt markers — six haiku lenses re-derive what history already wrote.
Proposals: `_ideate-provenance.md` (or widen the investigate one's type
check); a Pick section copied from investigate.md; seed the lenses from
workflow history + an `evidence:` key on the roster.

### extend — keep the core; guard the entry, unify the index write
H: no entry guard — dispatcher branch 2 routes ANY on-disk slug here,
including pre-slice workflows and terminal analysis modes that never have the
`03-slice.md` it requires on line 25. H: Step 3b mandates index writes
(`intent-risks`, charter delta) that Step 6 explicitly forbids — a direct
self-contradiction at the write boundary. H: a complete/closed parent keeps
its stale `status`/`next-command`; the extension is visible only in chat.
M: `best-first-slice`/`next-invocation` never updated (plan picks an
already-done slice); registry row untouched; probe/simplify route users here
with no from-probe/from-simplify seed; from-review dead-ends on all-bugs
instead of falling back. Proposals: Step-0 shape pre-flight (no roster →
route to `/wf slice` or new-intake per yolo.md:54); make Step 6 the single
authoritative index writer; add from-probe/from-simplify seeds.

### adopt — right mode, right altitude, not currently runnable
H: the enum violation (write-blocked). H: no Step 0 (no slug derivation, no
collision check, no same-branch active-workflow scan; can adopt another
session's `.ai/workflows/**` artifacts as product changes). M: the
already-merged refusal rung is undecidable (never fetches; condition
duplicates the previous refusal); the adopted diff is three overlapping git
commands with no defined union; index omits stack/review-scope-confirmed/
appetite (and plan.md treats absent review-scope-confirmed as confirmed);
no investigate provenance on the very common investigated-then-patched path;
W2d deferral resolutions never land in `runtime-evidence-deferrals`.
Proposals: add Step 0 (derive, collide-check, same-branch scan, provenance,
exclude `.ai/**`+`.scratch/**`); fix enum to `complete` + carry adoption in
`provenance:`; a decidable merged-upstream check via fetch + branch --contains.

### amend — correct altitude; finish the record mechanism
M: writes a `revisions:` ledger onto the index citing a contract
(`_additive-write.md`) that explicitly excludes control files; the field is in
no schema and no renderer reads it — the "whole value" prose is write-only.
M: amending `review-scope` doesn't set `review-scope-confirmed`, so the next
slice/plan ask silently overwrites the PO's amendment. L: no closed-workflow
guard; no dry-run (sibling modernize has one); missing the output-boundary
header. Proposals: schema+renderer for the ledger or drop it; closed-WARN +
confirm; review-scope amendment sets the confirmed flag; accept dry-run.

### modernize — right honesty rule; the era table is a release behind
M: Step 2 claims control-file discipline over "the registry" but no step ever
writes `.ai/workflows/INDEX.md` and no marker detects a missing row. M: era
table misses `review-scope-confirmed`/`appetite`/`stack` — the exact
v9.136-era fields the schema documents as backfillable. M: no marker for the
v9.145.0 decision-lifecycle fields, and the cardinal never-change-a-status
rule forbids the close — modernize cannot reach the gap class investigate
just closed (propose: report-only row naming the pick command). M: nothing
records that a modernize ran, so intake.md W7.2's schema-era nag re-fires
forever on honestly-absent fields (propose `schema-modernized-at:` stamp +
nag suppression). M: the one status write it does perform (`slices[].status`
backfill) reads as prohibited by its own headline rule. Proposals: three new
table rows (v9.136 era, registry row, decision-lifecycle report-only);
idempotence stamp; reword the cardinal rule.

## Recommended program (if/when this is built)

Ordered by leverage; each wave is releasable alone:

1. **W-unbreak (the five dead-ends).** adopt enum + Step 0; rca index repairs
   (stack/title/updated-at/object-progress) + valid route grammar + a
   pre-fix-shaped sibling-yaml contract; hotfix pipeline gains handoff+retro
   and acceptance criteria; fix/hotfix carry `stack:`; update-deps audit-only
   terminus + index self-reporting. Highest severity, mostly mechanical.
2. **W-close (C1).** Generalize investigate's closure: route/verdict/pick
   recording for rca (route), discover (verdict, at write time), ideate
   (pick); Escalate-closes for fix/refactor; gate decisions recorded
   unconditionally per _intake-context.md:100.
3. **W-forward (C2).** Generalize `_investigate-provenance.md` into an
   inherited-evidence contract keyed by `workflow-type` (investigate, rca,
   discover, ideate, simplify→refactor, update-deps prior-run), consumed at
   every mode's Step 0. One file, many `origin-<mode>` keys.
4. **W-ladder (C3).** Stamp investigate's escalation ladder into rca, hotfix,
   discover, refactor, ideate with per-mode rungs (probe for runtime,
   study-sources for dependency facts, discover for truth questions, human
   last).
5. **W-dedup (C5).** Extract `_change-mode-tail.md` (gate incl. Adjust,
   collision check, index template with the full required-field set,
   workflow-rules tail, breach recording) for fix/hotfix/refactor/update-deps.
6. **W-small.** extend's entry guard + single index writer; amend's ledger
   schema/renderer + confirmed-flag coupling; modernize's era-table refresh +
   idempotence stamp; ideate's roster `evidence:` key + history seeding.

Interaction: all of this predates the single-source merge
(`SINGLE-SOURCE-PLAN.md`) — the same dialect-neutral-prose rule applies, and
W-dedup REDUCES the merge surface (three drifted copies become one shared
file), so it is worth sequencing before or with that merge rather than after.
