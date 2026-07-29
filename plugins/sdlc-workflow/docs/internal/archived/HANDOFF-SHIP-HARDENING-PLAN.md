# Handoff/Ship Hardening Plan

Status: BUILT — all six waves shipped in v9.138.0 (one release, 2026-07-18)
Source: 2026-07-18 five-project transcript audit of `/wf handoff` + `/wf ship`
(Waypoint, Trails, Isometric, Playster, bot-backend; ~25 sessions, 2026-07-11 → 07-18).
Audit conclusion: the gates fired correctly in every session — failures came from
(1) what feeds the gates (evidence integrity), (2) what `ship-plan build` generates,
and (3) ceremony/schema friction around the gates.

Anchors below were verified against the source tree at v9.137.0 on 2026-07-18.
Line numbers drift; the section/step names are the durable reference.

---

## Incident → fix map (provenance)

| # | Incident (project) | Fix wave |
|---|---|---|
| 1 | `ship-plan build` generated CI broken on first run — pnpm double-version ×5 workflows, unformatted YAML (Waypoint); wired `needs: staging-smoke` with no staging apps → production releases guaranteed-red for days (bot-backend); wrote 34 unreviewed lines into `release.yml`, left uncommitted → entered a production release, CodeRabbit found 3 Major defects (Playster); aspirational required-checks would deadlock all PRs (Isometric, caught) | W5 |
| 2 | `readiness-verdict: ready` while PR merge-BLOCKED on unresolved conversations (Waypoint); handoff froze an already-released versionName (Trails); stale `branch-strategy: none` → handoff delivered a doc when a PR was needed (Playster) | W3 |
| 3 | Same drift question re-fired 3 rounds; "amend first" answer never executed (Playster); same 2 structural findings acknowledged 3× across handoff+ship (Isometric) | W3 |
| 4 | Memory-seed `CLAUDE.md`/`AGENTS.md` halted ship Step 1.1 (Isometric ×3 sessions); 404-path `.ai/` dirty tree forced mid-ship gitignore surgery, 451 tracked `.ai/` files nearly merged to main (Waypoint); dirty-tree decision pushed unreviewed build code into a release (Playster) | W4 |
| 5 | 5 post-write-verify blocks in one ship run — no paused state, forced `go-nogo: no-go` on a run that shipped (Playster); `.md` post-publish enum lacks `skip` while sibling `.yaml` has it — N/A check had to be deleted from frontmatter (Trails); 80-char notes cap tripped in 3 projects; probe evidence `.md` blocked by filename contract (bot-backend) | W1 |
| 6 | `probeGaps()` exact-string AC dedupe → false HARD-STOP ×2, patched only in a session-scratchpad copy of yolo.js (Playster); driver HARD-STOPs on `status: skipped` roster slice (Waypoint); no way to represent a PO-accepted deferral → re-runs re-wall (bot-backend) | W2 |
| 7 | Negative-path AC ("unhealthy revision caught") cleared by a healthy release (Playster); mock-green verify + pass-by-skip smoke fed a 28-deferral override → broken prod (bot-backend); stale subagent environment claims ("no adb device / 8080 held") calcified into a days-long false wall (Playster) | W6 |

---

## Wave 1 — Schema breathing room (cheapest, immediate)

Files: `tests/frontmatter.schema.json` (read at runtime — **no dist rebuild needed**),
`hooks/pre-write-validate.mjs` (+ dist rebuild), `skills/wf/reference/ship.md`, tests.

**W1.1 — `skip` in post-publish-check status (md/yaml parity).**
`tests/frontmatter.schema.json` `shipRunFrontmatter` → `post-publish-checks[].status`
enum is `["pass","fail","pending"]` (~line 887) while the sibling `.yaml` `ship-run`
schema allows `["pass","fail","flake","skip","running","pending"]` (~line 2517).
Change the `.md` enum to `["pass","fail","skip","pending"]` (terminal record — `flake`
and `running` stay yaml-only). Update ship.md Step 9 recording rule (`ship.md:286`,
schema block `:374-375`) to state: **a check that did not run records `skip`, never
`pass`** (see W6.3 — this is the pass-by-skip fix's schema half).

**W1.2 — Representable paused ship run.**
Playster's pre-flight-paused run could not be recorded: `go-nogo` enum
`["go","conditional-go","no-go"]` (~line 860) forced a false `no-go`. Add `"pending"`
to the `go-nogo` enum (meaning: gate not yet reached) and note in ship.md Step 13 that
a run paused before Step 5 records `go-nogo: pending` + `status: awaiting-input`.
`release-workflow-conclusion` already allows `""` — document that `""` means
not-reached. For `00-index.md` `progress.ship`, no schema change: document that a
paused ship is `in-progress` (the enum has no `paused` and doesn't need one).

**W1.3 — Notes cap 80 → 160.**
`shipRunsIndexFrontmatter` `runs[].notes` `maxLength: 80` (~line 939) → `160`, and add
one line to ship.md Step 11 telling the author the cap up front (three projects hit
this blind).

**W1.4 — Sanctioned home for probe/free-form evidence.**
`hooks/pre-write-validate.mjs` `validateFilename` (~lines 36-46) blocks any
non-`NN-`-prefixed `.md` (this is what blocked `runtime-observations.md`; the model
had to smuggle evidence as `.txt`). Probe already writes evidence under
`probe-evidence/<descriptor>/` (probe.md Step 5.1.c). Exempt the `probe-evidence/`
subtree from the filename + frontmatter contract exactly as `design-notes/` is
exempted (~line 103). Requires dist rebuild (hooks run from `dist/`).

**W1.5 — Tests.** Unit tests for each new enum value and the `probe-evidence/`
exemption in the existing frontmatter/hook test suites.

Effort: small. Risk: low. Everything is additive-permissive; no existing artifact
becomes invalid.

---

## Wave 2 — Yolo driver correctness (live bug, ships second)

File: `skills/wf/workflows/yolo.js` (+ dist rebuild), `tests/unit/skills/yolo-gates.test.mjs`.

**W2.1 — Normalize AC keys in `probeGaps()` (the live false-HARD-STOP bug).**
`probeGaps()` (yolo.js:640-656) keys `probed`/`gapEntry` on the raw `d.ac` string, so
a bare `{ac:"AC2"}` in `residual[]` does not dedupe against
`{ac:"AC2 — three…", probe:"…"}` in `terminal.deferrals[]` → false gap → HARD-STOP
(cost Playster a 79-minute resume plus a second run). Fix: extract a canonical AC id
(`const acKey = s => (String(s).match(/^AC[-\s]?[\w.]+/i)?.[0] ?? String(s)).replace(/[-\s]/g,'').toUpperCase()`)
and key both maps on it. Apply the same normalization in `collectDeferrals`
(yolo.js:882-910) and `deferralPressure` (yolo.js:920-937) so counts agree.
NOTE: a working patch exists only in the Playster session's scratchpad copy of the
plugin *cache* — reconcile intent, re-implement in the dev tree (same trap as the
v9.114 verifyClean cache hot-patch; never trust the cache copy as source).

**W2.2 — Filter `status: skipped` slices from the roster walk.**
The slug-mode loop (`for (let si = 0; si < idx.slices.length; si++)`, yolo.js:1079)
drives every slice; a slice already `status: skipped` (index schema
`slices[].status ∈ defined|in-progress|complete|skipped`) reaches verify and
HARD-STOPs (Waypoint: killed a 6.7-hour run at its last slice). Fix: skip
`status: skipped` slices with a log line and count them in the run summary. Also
sweep for stray stage artifacts of skipped slices being counted by `orient()`.

**W2.3 — Recognize PO-accepted deferrals.**
The driver has no concept of an accepted deferral: `verifyClean` (yolo.js:621-628)
and `probeGaps` treat every open deferral identically, so a re-run after PO
acceptance re-walls at the identical stop (bot-backend had to hand-craft slice-mode
runs). The index schema already has the right vocabulary:
`runtime-evidence-deferrals[].ship-override-authorization {by, at, reason}`
(frontmatter.schema.json ~lines 227-235). Fix: when a deferral entry in
`00-index.md` carries `ship-override-authorization`, `probeGaps` treats it as
satisfied and the verify-done disk check (orient step 6, yolo.js:432) accepts the
stage. The driver only ever *reads* an authorization recorded by a human via
ship's Step 6.5 route (c) — it never grants one (preserve ship.md:75-77:
`cleared-by` is for EVIDENCE, never risk-acceptance).

**W2.4 — Tests.** yolo-gates.test.mjs: (a) bare-vs-labeled AC dedupe, (b) skipped
slice traversal, (c) authorized deferral passes the gate while an open one still
hard-stops.

Effort: small-medium. Risk: low-medium (driver logic; the tests are the guard).

---

## Wave 3 — Readiness truth + persistent acknowledgements

Files: `skills/wf/reference/handoff.md`, `ship.md`, `_ship-plan-readiness.md`.
Reference-only → no dist rebuild, but doc-site regen + render version-gate bump apply.

**W3.1 — Consume `mergeStateStatus` in the readiness verdict.**
handoff.md 7d.b (:313-316) already fetches
`--json reviewDecision,statusCheckRollup,mergeable,mergeStateStatus` but the verdict
(7d.c, :317-320) never consumes the last two (Waypoint shipped `ready` on a BLOCKED
PR). Add recorded fields `live-merge-state: <mergeStateStatus>` and
`live-mergeable: <mergeable>`; verdict rules:
- `BLOCKED` or `mergeable: CONFLICTING` → **not `ready`** (`awaiting-input` with the
  blocking reason named; if the cause is unresolved review threads, route into the
  existing T5.1 thread-triage loop from `_pr-ci-handoff.md:61-207` — the machinery
  already exists, it just isn't invoked for *resolution state*, only for comment
  content).
- `UNSTABLE` (non-required checks failing) → `ready` allowed, but record the
  failing non-required check names so ship sees them.
Mirror the check in ship Step 6 idempotency read (ship.md:239) so ship re-verifies
merge-state before attempting the merge.

**W3.2 — Version-vs-existing-tag collision check.**
Trails handoff asserted "release identity frozen at versionName 1.10.25" when tag
`v1.10.25` was already released (caught only by session memory; the retro proposed
exactly this hook). Two insertion points:
- `_ship-plan-readiness.md` Step R2 Group 1: new signal `version-already-released`
  (suggested-block B) — compare the current value in every
  `plan.version-source-of-truth` file against `git tag -l` / `gh release list`;
  fire when the working version already has a tag/release.
- ship.md Step 1.2 (:156-161): before confirming the bump, verify the *computed*
  target version has no existing tag (`git tag -l <version>`,
  `gh release view <version>`); STOP with a clear explanation if it does.

**W3.3 — Re-validate `branch-strategy: none` against packaged content.**
handoff.md reads `branch-strategy` from the index (:61, :181) and dispatches without
re-validation; a stale `none` made handoff deliver a document when the diff was real
CI code (Playster: "needs a pr opened"). Add to step 3: when
`branch-strategy: none` AND the packaged commit range touches non-`.ai/`,
non-doc files, ask one question — "index says no PR, but this packages repo code:
proceed doc-only, or switch to a dedicated branch + PR?" — and record the answer to
the index so it never re-asks for the same range.

**W3.4 — Persistent drift acknowledgements.**
`_ship-plan-readiness.md:121` is explicit: "The acknowledgement is per-run" — by
design, so drift nags until the plan is amended. The audit shows the cost: 3
identical gates for one branch (Isometric), and a re-fired question whose "amend"
answer was never executed (Playster). Keep the boundary (the pre-check never edits
the plan) but add a sibling ledger `.ai/ship-plan-acks.yaml`:
- On "Acknowledge and proceed": append `{signals[], commit-range-fingerprint,
  plan-version, stage, at, reason}` (in addition to today's po-answers.md line).
- In Step R2: drop any finding whose `(signal, fingerprint, plan-version)` already
  appears in the ledger → report as one advisory line, **no gate**.
- Structural Group-2 signals (`release-surface-touched`, `dependencies-changed`) are
  acknowledgeable **once per branch**: fingerprint on `(signal, branch,
  plan-version)` rather than exact commit range, since new commits on the same
  branch re-trigger them by construction and they cannot clear until merge.
- Ledger invalidation: a `plan-version` bump clears all entries (an amended plan
  must re-earn its `ok`).

**W3.5 — Fix the answered-gate re-fire.**
On "Amend the plan (Recommended)", additionally record
`pending-amend: {signals[], at}` in the acks ledger. Next run: if `plan-version` is
unchanged, do not re-ask the identical question — present "you chose *amend* at
<at> for <signals> but the plan hasn't been amended; run `/wf ship-plan edit`
(route) or acknowledge now." One question becomes a reminder with memory.

Effort: medium. Risk: low — all additive gating logic; the hard invariant
(unacknowledged NEW drift still gates) is untouched.

---

## Wave 4 — Ship dirty-tree carve-out + `.ai/` tracking policy

Files: `skills/wf/reference/ship.md`, `handoff.md`, `ship-plan/init.md`,
`lib/memory-seed.mjs` (docs only), possibly `schemas/sdlc-config.schema.json`.

**W4.1 — Classify, don't just STOP, at ship Step 1.1.**
ship.md:154 is an unconditional STOP on any dirty path. Replace with a
classification pass:
1. **Plugin-seeded** — `CLAUDE.md` where the diff is entirely inside the
   `<!-- sdlc:wf-rules-import -->` fence, `AGENTS.md` untracked containing only the
   `<!-- sdlc:wf-rules v1 -->` fence, `.ai/.wf-rules-seeded`. These are verifiable
   mechanically (the fence markers are defined in `lib/memory-seed.mjs:31-36,81-87`).
   Offer one-keystroke resolution: commit as `chore(sdlc): seed wf rules` or add to
   `.gitignore` (for the marker file) — never a bare "go commit/stash it yourself".
2. **`.ai/` bookkeeping** — resolve per the repo's recorded artifact-tracking policy
   (W4.2): tracked → offer "commit bookkeeping now"; ignored → these paths should
   not appear at all (surface the policy violation instead).
3. **`ship-plan build` output** — files carrying the
   `# Added by wf ship-plan build` provenance comment: never silently
   commit-and-include (that is exactly how Playster's unreviewed 34 lines entered a
   release). Route: "these are unreviewed build outputs — route through a review
   slice (W5.3) or explicitly accept as-is (recorded)."
4. **Everything else** — STOP as today.

**W4.2 — Settle the `.ai/` tracked-vs-ignored policy once, at init time.**
Waypoint decided this ad hoc, mid-ship, with 473 `git rm --cached` paths. Add one
question to `ship-plan init` (or first `/wf intake` in a repo):
`artifact-tracking: tracked | ignored`, recorded in `.ai/sdlc-config.json`; when
`ignored`, write the `.gitignore` block (`.ai/` except `ship-plan.md` +
`sdlc-config.json`, or fully ignored — offer both). Handoff/ship read the policy
instead of improvising. Migration note for existing repos: `/wf status` surfaces a
one-time "artifact-tracking unset" advisory.

**W4.3 — Stale-record hygiene for untracked/ignored state artifacts.**
Isometric's project-side-ignored `.ai/pipeline-compliance.md` survived a branch
reset and asserted "done" for a month. The existing `build --dry-run` already
re-audits from scratch (build.md Step 18: the compliance file is an output receipt,
never trusted input) — make that property explicit and universal: add a line to
`_ship-plan-readiness.md` and `ship-plan/audit.md` stating that compliance/ack
records are receipts; any consumer MUST re-verify against the live repo/remote.
Concretely: readiness R2 gains a cheap `compliance-stale` advisory when
`pipeline-compliance.md`'s `plan-version` < the plan's current `plan-version`.

Effort: medium. Risk: medium (Step 1.1 is a safety gate — the classification must
fail closed: unknown → STOP).

---

## Wave 5 — `ship-plan build`: execute-what-you-generate, inert scaffolding, lifecycle routing

File: `skills/wf/reference/ship-plan/build.md` (largest wave; reference-only).

Current state (verified): Step 17 (:976-985) validates **syntax only** (yaml
safe_load, actionlint-if-present, config parse). Build never executes generated
workflows, never runs the repo's own gates over its output, never commits (by
design, :19,:24), and routes nothing through implement/verify/review.

**W5.1 — Deep validation ladder in Step 17.**
Extend from syntax to consistency + provisioning:
- **Action-input consistency:** for every generated/patched workflow, cross-check
  pinned tool versions against repo truth — `pnpm/action-setup version` vs
  `package.json packageManager` (the exact Waypoint bug, ×6 files),
  `node-version` vs `.nvmrc`/`engines`, java/gradle versions vs wrapper
  properties. Rule: **never pin a version literal the repo already declares —
  reference or match it.**
- **Graph integrity:** every `needs:` edge names a job defined in the same file;
  every reusable-workflow `uses:` resolves (repo-local path exists; remote
  pinned ref format valid).
- **Repo-gate conformance:** run the repo's own formatters/linters over every file
  build writes (detected from lefthook/husky/package scripts — the same detection
  Step 0 already does). Waypoint's workflows failed the repo's own `oxfmt --check`
  on first CI run.
- **Provisioning probe:** for every gate the build wires (required context,
  environment, `needs:` on a deploy/smoke job, secret reference), verify the
  referenced infrastructure exists (`gh api` for contexts/environments; the plan's
  own `secrets-to-set-manually` for secrets; deploy-target existence is
  plan-declared). Anything unverifiable → the gate is **unprovisioned** and MUST be
  scaffolded inert (W5.2).

**W5.2 — Inert-scaffold convention + next-release-green invariant.**
New design-contract clause (alongside :14-20): **"Build must never make the next
tag/release guaranteed-red."** An unprovisioned gate (bot-backend:
`deploy-backend: needs: staging-smoke` with no staging apps → production blocked
for days) is written inert: gated on a repo variable
(`if: ${{ vars.SDLC_GATE_<NAME> == 'true' }}`) with the activation step recorded in
a new compliance-artifact ledger `gates-to-activate:` (sibling to
`secrets-to-set-manually`). Step 19's chat return lists pending activations.
`build --dry-run` re-audit reports inert gates as `scaffolded-inert`, not missing.

**W5.3 — Lifecycle routing for build output (close the unreviewed-code hole).**
Build leaves release-critical diff uncommitted in the working tree with no review
path; ship pre-flight then forces a commit-or-drop decision (Playster: 3 Major
defects found only by CodeRabbit post-merge-request). End Step 18 with an explicit
routing question:
- **Commit now** — `chore(ship-plan): build outputs, plan v<N>` with the file list;
  the commit message carries `sdlc-unreviewed: true` trailer so handoff/review can
  see it, and the chat return recommends `/wf review` over the commit.
- **Route to a slice (Recommended when files touch release/deploy workflows)** —
  register a compressed fix-slice (`/wf intake <slug> fix …` seed printed) whose
  scope is exactly the build diff; verify/review then run on it like any other code.
- **Leave uncommitted** remains possible but is recorded in the compliance artifact
  as `uncommitted-outputs: [paths]` — which ship Step 1.1 (W4.1 class 3) will
  refuse to silently sweep.

**W5.4 — Keep the boundary honest.**
No change to "build never pushes/opens PRs/sets secrets/runs a release" (:19,:24).
All W5 additions are validation, scaffolding form, and routing — the remote-mutation
gates (12b/14/15) are untouched.

Effort: large (build.md is ~1100 lines; templates in Steps 3-16 each need the
version-literal sweep). Risk: medium — mitigate by landing W5.1's consistency checks
+ W5.2's invariant first; W5.3 can follow in a second release.

---

## Wave 6 — Evidence direction + environment-claim re-challenge

Files: `skills/wf/reference/verify.md`, `probe.md`, `shape.md` (AC authoring),
`yolo.js` POLICY.verify prose, `ship.md` Step 9.

**W6.1 — Direction-typed ACs and direction-checked clearing.**
Playster's AC "unhealthy revision caught" was cleared by evidence of a *healthy*
release. Extend the AC-verifiability rules (the v9.95 R1–R7 block in
verify/shape): a gate/guard AC must be split into **prove-pass** and
**prove-fail-closed** halves at authoring time, and each half's `cleared-by`
evidence must demonstrate *that* branch (fail-closed evidence = an induced or
observed failure being caught, never a green run). probe.md Step 7 (deferral
matching/clearing, :361-369) gains one check line: refuse to clear a fail-closed
AC with pass-direction evidence; say what evidence would qualify.

**W6.2 — Environment claims are evidence-bearing and re-challenged once.**
Playster's verify subagents recorded "no adb device / port 8080 held" as fact;
provisioning done inside ephemeral subagent contexts didn't persist; the false wall
held for days until the user pushed back — after which real device evidence cleared
10 deferrals and exposed 4 defects all-green verifies had missed. Two rules, added
to verify.md's deferral ladder and yolo.js POLICY.verify (:137-139):
- **An environment-impossibility claim must carry the probe command + raw output**
  (`adb devices`, `netstat`/`Get-NetTCPConnection`, emulator list) as evidence in
  the deferral entry — a bare assertion is not a deferral-qualifying reason.
- **The orchestrator re-runs the environment probe itself once** (main context,
  not a subagent) before accepting the deferral — the driver already re-challenges
  deferral *labels* via the corrective re-run in `driveVerify` (yolo.js:662-706);
  this extends the same skepticism to environment facts. Additionally:
  provisioning performed by a subagent counts only if it persists (script committed
  or artifact recorded) — "ephemeral provisioning doesn't exist."

**W6.3 — Pass-by-skip is `skip`, never `pass`.**
bot-backend's session-create smoke exited 0 printing "SMOKE_CASE_ID not set —
skipping" and was first recorded as ✓. With W1.1's `skip` enum in place, add the
behavioral rule to ship.md Step 9 and verify.md: a check whose own output says it
skipped records `skip` regardless of exit code; `pass` requires positive evidence of
the checked behavior. (This is the smallest wave-6 item but it guards the exact
false-green that fed the worst incident in the corpus.)

Effort: small-medium. Risk: low.

---

## Sequencing, releases, and mechanics

Suggested release train (one release per wave, standard rules):

1. **W1** — schema + probe-evidence exemption. Schema JSON needs no dist rebuild;
   the pre-write-validate change does. Version bump required regardless
   (render version-gate).
2. **W2** — yolo.js fixes + tests. Dist rebuild in the same commit
   (yolo.js ships via dist).
3. **W3** — handoff/readiness (reference-only + new acks ledger). Doc-site regen.
4. **W4** — ship Step 1.1 classification + artifact-tracking policy.
5. **W5** — build.md hardening (optionally split W5.1+W5.2 / W5.3 into two releases).
6. **W6** — evidence direction + environment re-challenge.

Standing rules that apply to every wave (from repo build/release memory):
- Version bump = 5 source/config spots + doc-site brands + marketplace; run
  `npm run build` when scripts/hooks/lib/renderers change, in the SAME commit.
- `npm run sync:codex` after any lib/dist-affecting change; mirror reference-md
  edits into `plugins/sdlc-workflow-codex` (skill subs are non-mechanical — no
  blind sed).
- Doc-site: reference changes need the drift check (`npm run verify`); new
  signals/fields (W3.2, W3.4, W4.2) touch the types/schema pages.
- Stage explicitly by path — an uncommitted docs/internal → archived/ reorg from
  another session is in flight in this working tree; never `git add -A`.

Open questions to settle before W3/W4 build-out:
1. Acks ledger home: `.ai/ship-plan-acks.yaml` (proposed) vs frontmatter on
   `.ai/ship-plan.md` (violates the pre-check's never-edits-the-plan boundary) vs
   po-answers.md structured parsing (fragile). Proposal stands at the sibling file.
2. W4.2 default for existing repos: `tracked` (status quo) with an advisory, or
   force the question on next handoff? Proposal: advisory only, never a new gate.
3. W2.3: should a `ship-override-authorization` recorded on an index deferral also
   flip the corresponding verify artifact, or is index-only enough for the driver?
   Proposal: index-only (single source of truth; verify artifacts stay historical).
