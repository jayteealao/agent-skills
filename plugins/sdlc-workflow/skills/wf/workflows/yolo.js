export const meta = {
  name: 'wf-yolo',
  description: 'Autonomous SDLC lifecycle driver. Drives an already-intaked slug through plan→implement→verify→review with NO human gates — resolves each stage gate by a written Autonomous Decision Policy, records every decision into the artifact, and stops before handoff exactly like /wf auto. Claude-only (built on the Workflow tool, which the Codex runtime lacks).',
  phases: [
    { title: 'Orient', detail: 'read 00-index + roster; resolve scope, file convention, branch posture (create/switch dedicated), resume point' },
    { title: 'Drive', detail: 'sequential plan→implement→verify[→review] per slice, autonomous gates' },
    { title: 'Review', detail: 'opt-in: parallel per-dimension review + adversarial verify before auto-fix' },
  ],
}

// ===========================================================================
// /wf yolo — autonomous sibling of /wf auto.
//
// auto removes inter-stage friction but PAUSES at every gate for the user.
// yolo makes those gate calls itself, by the Autonomous Decision Policy below,
// and drives the slug to the review endpoint without stopping.
//
// The Workflow runtime gives THIS SCRIPT no filesystem access — only agent()
// subagents have tools. So every artifact write is done by a stage subagent
// that reads the SAME on-disk reference the manual command reads and follows it
// verbatim, with ONE override: where the reference asks the user, the subagent
// resolves it by policy instead. The script is pure orchestration: orient →
// select stage → run it as a subagent → gate on its structured return → loop.
//
// Phase-0 probe verdict (baked in): a subagent Write hits the same plugin hooks
// as a main-session Write and persists to real disk — BUT subagents inherit the
// parent session cwd, so every path passed in MUST be absolute. We hard-fail on
// a missing/relative arg rather than risk writing into an `undefined/.ai/...`
// tree. See docs/internal/YOLO-AUTONOMOUS-DRIVER-PLAN.md §Phase 0 result.
// ===========================================================================

// ---- args contract (the /wf yolo reference passes these absolute paths) ----
//   projectRoot   absolute repo root that owns .ai/workflows/<slug>/
//   referenceRoot absolute path to skills/wf/reference (where plan.md … live)
//   slug          the workflow slug to drive
//   slice         (optional) one slice → slice mode; absent → slug mode
//   reviewFanout  (optional, default true) Phase-3 parallel-dimension review; pass false to opt out
//   planFanout    (optional, default true) plan all slices concurrently first; pass false to opt out
// args may arrive as a JSON object or — depending on how the caller encodes the
// Workflow invocation — as a JSON string. Tolerate both so a stringified payload
// doesn't silently fail the object check (the Workflow runtime can hand a
// JSON-encoded args through verbatim as one string).
let OPT = args
if (typeof OPT === 'string') { try { OPT = JSON.parse(OPT) } catch { OPT = null } }
if (!OPT || typeof OPT !== 'object') {
  return { ok: false, stopped: true, reason: 'yolo requires args { projectRoot, referenceRoot, slug, [slice] } as a JSON object (or JSON string) with absolute paths.' }
}
const { projectRoot, referenceRoot, slug } = OPT
const slice = OPT.slice && String(OPT.slice).trim() ? String(OPT.slice).trim() : null
for (const [k, v] of Object.entries({ projectRoot, referenceRoot, slug })) {
  if (!v || typeof v !== 'string' || !v.trim()) {
    // Phase-0 caveat 1: never let a path arg be undefined — it silently writes into cwd.
    return { ok: false, stopped: true, reason: `yolo: required arg '${k}' is missing. Pass an absolute path/slug; a relative or undefined value would write artifacts into the wrong tree.` }
  }
}

// ---------------------------------------------------------------------------
// External Output Boundary — re-asserted to every fresh-context subagent.
// They do NOT inherit it from the dispatcher, so each stage prompt embeds it.
// ---------------------------------------------------------------------------
const EOB =
  `EXTERNAL OUTPUT BOUNDARY (MANDATORY): workflow artifact paths (.ai/workflows/…), stage names/numbers, ` +
  `slash-command names, sub-agent names, and control-file metadata are PRIVATE implementation context. They ` +
  `must NEVER appear in any external-facing output — commit messages, branch names, PR text, release notes, ` +
  `code comments, or docs. Translate to product language (user-visible change, rationale, affected areas, ` +
  `verification, risk) and leak-check before any commit or push.`

// ---------------------------------------------------------------------------
// W1 — DRIVER LIVENESS. The single hardest failure in the field was not a wrong
// decision, it was SILENCE: a slug-mode driver died ~17 min into a run, the
// harness task registry lost the task entirely ("Task not found"), and the user
// came back two hours later to nothing. A resuming session then asserted the dead
// driver was "still running" from the mere EXISTENCE of its trail — and the user
// made a stop/continue call on that fiction.
//
// The fix is a heartbeat with a real clock. This SCRIPT has neither filesystem
// access nor Date.now() (the Workflow runtime withholds both so runs stay
// resumable) — but its subagents have both. So the heartbeat rides the subagents:
// every dispatched agent appends one line when it starts and one when it ends, to
// a per-slug append-only journal. That gives any later reader two things nothing
// else provides: a real timestamp, and an observable CADENCE (the gaps between
// entries) to judge silence against. A driver between agents is a driver making
// progress; a driver silent for longer than its own longest gap is presumed dead.
//
// Diagnostic, never a gate: a failed append never fails a stage.
// ---------------------------------------------------------------------------
const JOURNAL_PATH = `${projectRoot}/.ai/workflows/${slug}/.driver-journal.jsonl`

// runId is minted by orient (the first subagent — it has the clock this script
// lacks) and threaded into every later heartbeat so one run's entries are
// separable from a previous run's in the same file.
let RUN_ID = ''
let AGENT_SEQ = 0

function heartbeatClause(label, phaseName, stageName, sliceArg) {
  const seq = ++AGENT_SEQ
  return `\n\nDRIVER HEARTBEAT (MANDATORY — do this FIRST and LAST). A background driver that dies leaves no ` +
    `signal; this journal is the only way a human or a later session can tell a live driver from a dead one. ` +
    `Append (never rewrite, never truncate) to ${JOURNAL_PATH}, creating it if absent:\n` +
    `  • BEFORE any other work, one line: ` +
    `{"at":"<ISO-8601 UTC now, from the system clock>","run":"${RUN_ID}","seq":${seq},"event":"agent-start",` +
    `"agent":"${label}","phase":"${phaseName}"${stageName ? `,"stage":"${stageName}"` : ''}` +
    `${sliceArg ? `,"slice":"${sliceArg}"` : ''}}\n` +
    `  • IMMEDIATELY BEFORE you return, one line of the same shape with "event":"agent-end", plus ` +
    `"status":"<the status you are returning>" and "errors":<the number of tool errors / rejected writes / ` +
    `schema retries you RECOVERED from this agent, 0 if none>.\n` +
    `Never read the journal back into your answer, and never let an append failure change what you do — the ` +
    `heartbeat is diagnostic, never a gate.`
}

// W1.3 / W5.1 — CONTROL-FILE OWNERSHIP. While a driver is live, that slug's
// 00-index.md and the global INDEX.md are DRIVER-OWNED. Two writers mutating them
// blind produced repeated "File has been modified since read" clusters — and once,
// a DEAD driver's last write ambushed a foreground read two hours later. The rule
// is the same in both directions: re-read immediately before writing, and treat a
// rejection as "the other writer moved", not as a stale-string puzzle to force.
const CONTROL_FILE_RULE =
  `\n\nCONTROL-FILE DISCIPLINE (MANDATORY). ${projectRoot}/.ai/workflows/${slug}/00-index.md and ` +
  `${projectRoot}/.ai/workflows/INDEX.md are shared control files that another session may also be editing. ` +
  `Re-read the file IMMEDIATELY before every edit — never edit from a copy you read earlier in this agent. If an ` +
  `edit is rejected as modified-since-read, that means the other writer moved: re-read, re-derive your change ` +
  `against the NEW content, and retry ONCE. Never force a stale string through, and never rewrite the whole file ` +
  `to dodge the conflict.`

function deadDriverClause(priorRun) {
  if (!priorRun || priorRun.presumedDead !== true) return ''
  return `\n\nDEAD-DRIVER RECONCILIATION. A previous driver for this slug is PRESUMED DEAD (its journal went ` +
    `silent at ${priorRun.lastEntryAt || 'an unknown time'}, mid-${priorRun.lastStage || 'stage'}` +
    `${priorRun.lastSlice ? ` on slice '${priorRun.lastSlice}'` : ''}). Treat every artifact and control-file ` +
    `write it may have made as SUSPECT and possibly half-finished: re-read each file you touch fresh from disk ` +
    `before editing it, and if what you find contradicts what the index claims, trust the artifact on disk and ` +
    `correct the index. Do not assume the previous run left a consistent state.`
}

// W3.3 — `class` IS REQUIRED ON EVERY RECORDED DECISION. The driver's headline
// guarantee to the user is "intent-bearing escapes: 0". That number is only worth
// the classification behind it, and in every run measured ~25% of recorded
// decisions came back with no class at all (11/43, 4/15, 5/10, 40/173) — silently
// defaulted to 'unclassified' and then folded into the reassuring zero. An
// unclassified decision is a GAP in the guarantee, not a third class.
//
// W3.4 — RECOVERED ERRORS ARE REPORTED, NOT SWALLOWED. One run's outcome said
// "0 errors" while 6 of 15 subagents had hit rejected writes and schema retries
// they recovered from. The script cannot see a subagent's tool history, so the
// subagent reports its own: honest self-accounting beats a confident zero.
const DECISION_CONTRACT =
  `\n\nDECISION RECORDING CONTRACT (MANDATORY).\n` +
  `- EVERY decision you record carries a \`class\` stamp per ${referenceRoot}/_decision-classes.md. There are ` +
  `exactly two values: \`implementation-detail\` (yours to settle autonomously) and \`intent-bearing\` (never ` +
  `yours — it is a STOP). Omitting the stamp is not a neutral act: it silently weakens the run's ` +
  `"intent-bearing escapes: 0" report into a number nobody can trust. If a decision is genuinely hard to ` +
  `classify, stamp it \`intent-bearing\` and STOP — that is the safe direction.\n` +
  `- Return each decision as an object carrying at least { class, decision } and, where it resolves a specific ` +
  `acceptance criterion, { ac, classification } naming what you concluded that AC is (e.g. ` +
  `classification: 'build-capability' vs 'runtime-evidence'). The run report treats YOUR recorded ` +
  `classification as canonical — it will not re-derive a different one behind your back.\n` +
  `- Report \`errors\`: [{ what, recovered }] for every tool error, rejected write, or schema retry you hit ` +
  `and recovered from this stage (empty list if none). A recovered error is not a failure and will not stop ` +
  `the run — but a run that reports "0 errors" while its agents were quietly retrying is lying to the user.`

// ---------------------------------------------------------------------------
// The Autonomous Decision Policy, per stage. This is the override that replaces
// each reference's interactive gate. Quoted field/enum values come from the
// live references (plan.md / verify.md / review.md) so the subagent writes
// schema-complete, gate-accurate artifacts.
// ---------------------------------------------------------------------------
const POLICY = {
  plan:
    `AUTONOMOUS OVERRIDE — the plan reference runs an 8–12 question discovery interview (AskUserQuestion). ` +
    `DO NOT ask the user anything. Instead ANSWER each implementation-detail question yourself in the user's ` +
    `best interest: choose the option that best satisfies the slice acceptance criteria at the least cost and ` +
    `smallest blast radius, and RECORD each choice as an entry in the plan body's "## Assumptions" section ` +
    `(what you assumed + why). HARD-STOP EXCEPTION: if a question would change USER-OBSERVABLE SCOPE or a ` +
    `CONTRACT (public API surface, persisted data shape, user-visible behavior, a migration) — that is a ` +
    `product decision you may not make alone. Finish the artifact honestly with status: awaiting-input and the ` +
    `open question recorded, and return status:'hard-stop'. Otherwise finish status: complete, has-blockers: false.`,
  implement:
    `AUTONOMOUS OVERRIDE — build the slice per its plan and COMMIT the code (honor the External Output Boundary ` +
    `on the commit message). Minor plan drift you can resolve in-scope: resolve it, record it in the implement ` +
    `artifact, proceed. HARD-STOP only on blocking ambiguity or a drift that changes user-observable scope: ` +
    `finish status: awaiting-input with the reason recorded and return status:'hard-stop'.`,
  verify:
    `AUTONOMOUS OVERRIDE — the verify reference triages each failing check / unmet AC via AskUserQuestion ` +
    `(Fix/Skip/Escalate) and runs exactly ONE fix round per invocation. DO NOT ask. AUTO-SELECT "Fix" for every ` +
    `fixable issue: apply the minimal patch and run that single fix round, recording outcomes in ` +
    `"## Verify-Owned Fixes". If the reference warns the slice was already verified and asks to overwrite, ` +
    `proceed (re-running is intended).\n\n` +
    `DEFER-DON'T-CANCEL for UN-PRODUCIBLE runtime evidence — verify.md's deferral law (§"Climb the ` +
    `constraint-resolution ladder", §"Escape hatch") is the single normative statement; apply it EXACTLY as ` +
    `written there, with no relaxation. In particular: a deferral is lawful ONLY over a PROBED incapability ` +
    `(literal probe command + one-line output tail, executed THIS run); climb the constraint-resolution ladder ` +
    `(runtime-adapters.md) before deferring; never inherit a prior deferral or environment claim — re-probe it ` +
    `fresh; a skipped or guard-exited spec is not evidence (an all-skipped sweep is ` +
    `blocked-runtime-evidence-missing, never a deferral); and capability you provision must persist via a repo ` +
    `script or it does not exist for later stages.\n` +
    `When a deferral is lawful under that law, apply verify.md's escape hatch for that AC: set ` +
    `'interactive-verification: deferred' + 'interactive-verification-defer-reason: "<rungs tried + probe receipt ` +
    `+ the residual that survives them>"' in the per-slice verify frontmatter, register the deferral in ` +
    `00-index.md runtime-evidence-deferrals (slice, reason, deferred-at, cleared-by: null), and record it under ` +
    `the slice's ## Acceptance Criteria Status. A deferred AC writes result: partial (NOT ` +
    `blocked-runtime-evidence-missing) and is NOT a substantive residual — the slice PROCEEDS. The deferral does ` +
    `not block review or handoff, but /wf ship HARD-BLOCKS until a later /wf probe or a re-verify in a capable ` +
    `environment clears it.\n\n` +
    `The boundary is STRICT: defer ONLY genuine probed impossibility, never to dodge verification you could ` +
    `actually run, and never a SUBSTANTIVE failure. If you DID drive the AC and the behavior is wrong, that is ` +
    `result: fail (substantive) — never a deferral. A user-observable AC left with neither evidence NOR a lawful ` +
    `deferral is result: blocked-runtime-evidence-missing and is NOT acceptable to proceed on. Reserve ` +
    `convergence: escalated for SUBSTANTIVE unresolved issues — a slice whose only residual is deferred-evidence ` +
    `AC (all checks pass, all code-only AC met, all producible user-observable AC evidenced) is ` +
    `convergence: converged (or not-needed if no fix was required), NOT escalated.\n\n` +
    `ONE WRITER PER FACT (deferral emission). A deferral is recorded EXACTLY ONCE, in terminal.deferrals[], ` +
    `complete with its probe receipt. Do NOT also copy it into residual[] — residual[] carries only what is ` +
    `NOT a deferral (could-not-fix notes, out-of-scope observations). If you are unsure whether an entry is a ` +
    `deferral, it belongs in deferrals[] with a probe or it is not a deferral at all.\n\n` +
    `FAIL IS NOT A DEFERRAL, AND SURVIVES INTO THE RUN REPORT. If you drove an AC and the behavior was wrong, ` +
    `that AC is result: fail (substantive) — record it as a FAILURE, never in deferrals[], never in the index's ` +
    `runtime-evidence-deferrals. The driver reports your recorded fail/deferral split verbatim; an AC you call a ` +
    `fail will never be re-labeled a deferral downstream, and the reverse must be equally true.\n\n` +
    `Set the terminal state HONESTLY: convergence: not-needed | converged | escalated; result: pass | fail | ` +
    `partial | blocked-runtime-evidence-missing. Report deferrals: [{ac, reason, probe}, ...] for EVERY AC you ` +
    `deferred (empty list if none) — where 'probe' is the literal capability-probe command + one-line output ` +
    `tail you executed THIS run to establish the wall (a deferral with no probe will be challenged and re-run). ` +
    `Set substantiveResidual: true iff any AC still fails / is partially met for a CODE reason after the fix ` +
    `round (false when the only residual is deferred-evidence AC). Return status:'complete' when convergence ∈ ` +
    `{not-needed, converged} AND substantiveResidual is false AND result ∈ {pass, OR partial with ≥1 recorded ` +
    `deferral}; otherwise return status:'hard-stop'.`,
  review:
    `AUTONOMOUS OVERRIDE — the review reference triages findings via AskUserQuestion (Fix/Defer/Dismiss). DO NOT ` +
    `ask. Decide by the FIX-AS-MUCH-AS-POSSIBLE policy: FIX every BLOCKER, HIGH, and MED finding (MED has NO ` +
    `defer option — always fix). FIX a LOW/NIT only when NECESSARY = in-scope (touches this diff) AND localized ` +
    `AND safe (no convention conflict); otherwise DEFER it and record the reason. Never silently dismiss — mark ` +
    `"dismissed" only a true false-positive, with a recorded reason. Run the review-owned fix loop (spawn a fix ` +
    `per Fix decision), record decisions in "## Triage Decisions" and outcomes in "## Fix Status", preserve ` +
    `surfaced-at on the accumulating ledger, and compute verdict from OPEN findings only. A clean verdict ` +
    `(ship | ship-with-caveats with metric-findings-blocker == 0) is the ENDPOINT — return status:'complete'. ` +
    `HARD-STOP (return status:'hard-stop') only if verdict: dont-ship, OR an OPEN BLOCKER is a security / ` +
    `data-loss issue you could not fix after the loop.`,
  'update-deps':
    `AUTONOMOUS OVERRIDE for the self-managed update-deps exec — intake/update-deps.md Step 6 asks the user ` +
    `(AskUserQuestion) to choose the update scope (full plan / P0 security only / audit-only / adjust). DO NOT ask. ` +
    `Resolve it as "Proceed with full plan": execute ALL planned tiers — P0 security (sequential, one package at a ` +
    `time), P1 major+migration (sequential, one at a time, applying ONLY the API-forced app-code changes the bump ` +
    `itself demands), and P2 safe minor/patch (single batch). NEVER treat it as audit-only.\n\n` +
    `DEFER-DON'T-FIX on failure: any package whose update fails its test/build command is marked \`blocked\` in ` +
    `05-implement.md and the run CONTINUES — never edit application code to force a package's tests green beyond the ` +
    `migration the bump forces, never mix a security update with a major migration in one commit, never hand-edit ` +
    `lockfiles (use the package manager's own command). A run that updates some packages and blocks others is a ` +
    `legitimate result: partial, not a hard-stop.\n\n` +
    `Then self-author 06-verify.md by running the FULL suite + build against the updated state. Apply verify.md's ` +
    `deferral law EXACTLY as written (§"Climb the constraint-resolution ladder", §"Escape hatch" — probed ` +
    `incapability only, ladder first, fresh probes never inherited, skipped/guard-exited specs are not evidence, ` +
    `an all-skipped sweep is blocked-runtime-evidence-missing). For a lawfully deferred ` +
    `AC record it in 00-index.md runtime-evidence-deferrals, write result: partial (NOT ` +
    `blocked-runtime-evidence-missing), keep substantiveResidual false. Record each deferral EXACTLY ONCE, in ` +
    `terminal.deferrals[] with its probe — never a second bare copy in residual[] (residual[] carries blocked/held ` +
    `packages, which are not deferrals). STOP after 06-verify.md — do NOT route to ` +
    `/wf review or /wf handoff (yolo runs the slug-wide review itself). Return the verify terminal state ` +
    `(convergence, result, deferrals [{ac, reason, probe}], substantiveResidual) so yolo gates on it exactly like ` +
    `a standard verify.`,
}

// ---------------------------------------------------------------------------
// Schemas — force structured returns so the orchestrator gates on real fields.
// ---------------------------------------------------------------------------
const ORIENT_RESULT = {
  type: 'object',
  required: ['ok', 'slug', 'mode', 'reviewScope', 'fileConvention', 'branch', 'slices'],
  properties: {
    ok: { type: 'boolean' },
    blockReason: { type: 'string' },
    route: { type: 'string' },
    slug: { type: 'string' },
    mode: { enum: ['slug', 'slice'] },
    targetSlice: { type: 'string' },
    reviewScope: { enum: ['per-slice', 'slug-wide'] },
    workflowType: { type: 'string' },
    // single-scope workflow (a forwarded rca, or a one-slice standard workflow): 03-slice.md is absent and
    // orient synthesized a one-entry roster [selected-slice]. Stage files are un-suffixed; reviewScope is slug-wide.
    singleScope: { type: 'boolean' },
    // honored default review rubric — an rca whose recommended-next is hotfix → 'security'; empty = standard
    // dimension selection. Threaded into the review stage so yolo respects the RCA's recommended build flavor.
    reviewDimension: { type: 'string' },
    // W1 — the run's own identity, minted by orient because it holds the clock this
    // script does not. Every later heartbeat carries it, so one run's journal entries
    // stay separable from a prior run's in the same append-only file.
    runId: { type: 'string' },
    // W1.2/W1.3 — what the journal says about the PREVIOUS driver for this slug.
    // Liveness is judged against the run's OWN observed cadence, never against file
    // existence: a journal silent for longer than its longest inter-agent gap is
    // presumed dead, and its partial writes are treated as suspect from there on.
    priorRun: {
      type: 'object',
      properties: {
        present: { type: 'boolean' },          // a journal exists with at least one parseable entry
        runId: { type: 'string' },
        lastEntryAt: { type: 'string' },       // iso-8601 of the newest entry
        lastEvent: { type: 'string' },         // agent-start | agent-end
        lastStage: { type: 'string' },
        lastSlice: { type: 'string' },
        minutesSinceLastEntry: { type: 'number' },
        longestGapMinutes: { type: 'number' }, // the run's own cadence — the yardstick
        presumedDead: { type: 'boolean' },
        completed: { type: 'boolean' },        // the prior run reached a terminal hand-back (not dead — done)
      },
    },
    // F3 — open runtime-evidence-deferrals read verbatim from 00-index.md (cleared-by: null only).
    // driveVerify appends a RE-CHALLENGE clause from these so a prior run's wall is re-PROBED, never
    // inherited as fact; the hand-back rolls them into deferralPressure. Visibility, not a new gate.
    priorDeferrals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slice: { type: 'string' },
          reason: { type: 'string' },
          deferredAt: { type: 'string' },   // iso-8601 from the index
          clearedBy: { type: 'string' },     // null/absent = still open
          repeatOf: { type: 'string' },      // earlier slice with the same wall
          // true iff the index entry carries ship-override-authorization — the PO's
          // explicit risk-acceptance (recorded via ship step 6.5 route c, never by
          // yolo). An authorized deferral is settled: no re-challenge, no probe-
          // receipt escalation, and a partial verify walled only by it counts done.
          authorized: { type: 'boolean' },
          // W3.2 — the LEDGER's own classification of this wall. The index is the
          // authoritative record of what a deferral IS; when the driver's end-of-run
          // re-derivation disagrees, the ledger wins and the disagreement is reported
          // as `reconciled`, never silently re-labeled.
          ac: { type: 'string' },              // the AC the entry names, when it names one
          wallOwnership: { type: 'string' },   // code-owned | environment-negotiable | external
          // W4 — the one-line, side-effect-free command that answers "has the
          // clearing event happened yet?". Run at the cheap moments (orientation,
          // /wf status) purely as a TRIPWIRE — a hit routes to /wf probe, it never
          // clears the deferral itself (the probe stage still owns evidence).
          clearingEvent: { type: 'string' },
          clearingProbe: { type: 'string' },
          clearingProbeHit: { type: 'boolean' },   // true = the event appears satisfied → route to /wf probe
        },
      },
    },
    // W11 — the charter (00-index `charter:`): the intake's 3–7 positive commitments.
    // yolo runs a cheap fidelity checkpoint every K slices asking "is the build still
    // advancing each commitment?"; a `broken` verdict is a stop. Empty/absent on
    // compressed lifecycles (no charter) → no checkpoints.
    charter: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          commitment: { type: 'string' },
          status: { type: 'string' },   // honored | at-risk | broken
        },
      },
    },
    fileConvention: { enum: ['suffixed', 'unsuffixed'] },
    branch: {
      type: 'object',
      required: ['current', 'target', 'match', 'strategy'],
      properties: {
        current: { type: 'string' },
        target: { type: 'string' },
        base: { type: 'string' },
        // 'dedicated' → yolo lands the tree on the slug branch up front, creating it
        // from base-branch if it does not exist yet (mirrors implement.md Step 0.9).
        // 'shared'/'none' → yolo NEVER switches; the drive runs on the checked-out
        // tree. Default 'none' if the field is somehow absent (conservative: no switch).
        strategy: { enum: ['dedicated', 'shared', 'none'] },
        // does branch.target already resolve as a local OR already-fetched remote-tracking
        // ref (no network fetch)? Informational — ensureBranch re-checks authoritatively.
        exists: { type: 'boolean' },
        match: { type: 'boolean' },
      },
    },
    slices: {
      type: 'array',
      items: {
        type: 'object',
        required: ['slice', 'stages'],
        properties: {
          slice: { type: 'string' },
          // roster status from 00-index.md slices[] (defined | in-progress |
          // complete | skipped). Slug-mode skips 'skipped' entries instead of
          // driving them into a HARD-STOP (Waypoint 2026-07-14: a 6.7-h run
          // died on an already-skipped slice with a conforming skip record).
          status: { type: 'string' },
          // W2 — WHY this slice still has work. The distinction decides scheduling:
          // 'new-work' (a stage was never run, or is not terminal) is the work a run
          // exists for; 'deferral-rechallenge' (every stage terminal-clean, the only
          // residue an open un-authorized deferral) is BOOKKEEPING. A driver launched
          // for a slug-wide review once spent its whole life on the second kind and
          // died before starting the first, so the two are scheduled separately.
          reverifyReason: { type: 'string' },   // new-work | deferral-rechallenge | none
          stages: {
            type: 'object',
            // each ∈ 'done' (present + terminal-clean on disk) | 'todo' | 'n-a'
            properties: {
              plan: { type: 'string' },
              implement: { type: 'string' },
              verify: { type: 'string' },
              review: { type: 'string' },
            },
          },
        },
      },
    },
  },
}

const STAGE_RESULT = {
  type: 'object',
  required: ['stage', 'status', 'artifactPath', 'terminal'],
  properties: {
    stage: { type: 'string' },
    slice: { type: 'string' },
    status: { enum: ['complete', 'hard-stop'] },
    artifactPath: { type: 'string' },
    terminal: {
      type: 'object',
      properties: {
        statusField: { type: 'string' },   // plan/implement → complete | awaiting-input
        convergence: { type: 'string' },    // verify → not-needed | converged | escalated
        result: { type: 'string' },         // verify → pass | fail | partial | blocked-runtime-evidence-missing
        verdict: { type: 'string' },        // review → ship | ship-with-caveats | dont-ship
        blockerCount: { type: 'number' },   // review → metric-findings-blocker (OPEN)
        // verify → user-observable ACs DEFERRED because the environment genuinely
        // could not produce runtime evidence (each written as verify.md's
        // `interactive-verification: deferred` escape hatch + registered in
        // 00-index.md runtime-evidence-deferrals; /wf ship later blocks on them).
        // `probe` is the literal capability-probe command + one-line output tail the
        // subagent executed THIS run to establish the wall (attempt-before-declare —
        // verify.md §"Escape hatch"). A deferral with no probe is challenged by
        // probeGaps()/driveVerify with one corrective re-run before it is accepted.
        deferrals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ac: { type: 'string' },
              reason: { type: 'string' },
              probe: { type: 'string' },
            },
          },
        },
        // verify → TRUE if any AC still fails / is partially met for a CODE reason
        // (the behavior is wrong) after the fix round — as opposed to merely lacking
        // un-producible runtime evidence. This is the load-bearing distinction: a
        // substantive residual still HARD-STOPs; a pure-deferral residual does not.
        substantiveResidual: { type: 'boolean' },
      },
    },
    // Recorded autonomous calls. W3.3: every entry MUST carry a `class` stamp
    // (implementation-detail | intent-bearing) per _decision-classes.md; an entry
    // that resolves a specific AC also carries { ac, classification }, and THAT
    // classification is canonical over anything the driver would re-derive (W3.2).
    decisions: { type: 'array', items: { type: 'object' } },
    // W3.1 — deferred / could-not-fix notes that are NOT deferrals. A deferral lives
    // in terminal.deferrals[] once, with its probe; duplicating it here is what the
    // one-writer-per-fact rule now forbids (the driver still tolerates the old shape
    // when it appears, so a stale subagent can't false-stop a compliant slice).
    residual: { type: 'array', items: { type: 'object' } },
    // W3.4 — errors this subagent hit AND RECOVERED FROM (tool errors, rejected
    // writes, schema retries). Self-reported because the script cannot see a
    // subagent's tool history. A run that says "0 errors" while its agents were
    // quietly retrying is lying, and this is the field that stops it.
    errors: {
      type: 'array',
      items: {
        type: 'object',
        properties: { what: { type: 'string' }, recovered: { type: 'boolean' } },
      },
    },
    hardStopReason: { type: 'string' },
  },
}

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'severity', 'file', 'issue'],
        properties: {
          id: { type: 'string' },
          severity: { enum: ['BLOCKER', 'HIGH', 'MED', 'LOW', 'NIT'] },
          file: { type: 'string' },
          line: { type: 'string' },
          issue: { type: 'string' },
          confidence: { type: 'string' },
        },
      },
    },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['refuted'],
  properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } },
}

// ---------------------------------------------------------------------------
// orient() — read-only snapshot of the workflow. Resolves mode, review scope,
// file convention, branch posture, and the per-slice resume point (which stages
// are already terminal-clean on disk, so a killed run resumes for free).
// ---------------------------------------------------------------------------
async function orient() {
  return await agent(
    `You are the ORIENT step of an autonomous SDLC driver. READ-ONLY — do not write, edit, commit, or switch ` +
    `anything; just report. The project root is ${projectRoot} (absolute) — resolve every path under it and run ` +
    `git as \`git -C ${projectRoot} …\`.\n\n` +
    `Slug: ${slug}${slice ? `\nTarget slice: ${slice}  (slice mode)` : `\n(no slice given → slug mode)`}\n\n` +
    `1. Read ${projectRoot}/.ai/workflows/${slug}/00-index.md. Parse: status, current-stage, review-scope ` +
    `(default 'per-slice' if the field is absent), workflow-type, branch-strategy (default 'none' if absent), ` +
    `branch, base-branch. ALSO parse the \`runtime-evidence-deferrals\` list (if present): capture every entry ` +
    `whose \`cleared-by\` is null/absent (STILL OPEN) into priorDeferrals as ` +
    `{ slice, reason (verbatim), deferredAt (= deferred-at), clearedBy (= cleared-by, null if open), repeatOf ` +
    `(= repeat-of, omit if absent), authorized (true iff the entry carries ship-override-authorization — the PO ` +
    `risk-acceptance stamp; omit otherwise), ac (the acceptance criterion the entry names, when its reason names ` +
    `one), wallOwnership (= wall-ownership), clearingEvent (= clearing-event), clearingProbe (= clearing-probe) }. ` +
    `Omit already-cleared entries. Empty/absent list → priorDeferrals: [].\n` +
    `   ALSO parse the \`charter\` list (if present) into charter as { id, commitment (verbatim), status }. ` +
    `Empty/absent (e.g. a compressed lifecycle) → charter: [].\n` +
    `1b. DRIVER LIVENESS — read the tail of ${JOURNAL_PATH} if it exists (append-only JSONL; each line is one ` +
    `heartbeat: at, run, seq, event, agent, phase, stage, slice). Report priorRun:\n` +
    `   - present: true iff the file exists with at least one parseable line (absent/empty → ` +
    `{ present: false } and nothing else).\n` +
    `   - runId, lastEntryAt, lastEvent, lastStage, lastSlice from the NEWEST entry.\n` +
    `   - longestGapMinutes: over the entries of that newest run only, the LARGEST gap in minutes between ` +
    `consecutive \`at\` timestamps (0 when there is only one entry). This is the run's own observed cadence.\n` +
    `   - minutesSinceLastEntry: system-clock now minus lastEntryAt, in minutes.\n` +
    `   - completed: true iff the newest entry is an agent-end whose agent was a terminal step (the slug-wide ` +
    `review, or the last stage of the last roster slice) — that run finished, it did not die.\n` +
    `   - presumedDead: true iff NOT completed AND minutesSinceLastEntry exceeds BOTH longestGapMinutes and a ` +
    `20-minute floor (the floor keeps a run with one slow first agent from being called dead). NEVER infer ` +
    `"still running" from the file merely EXISTING — a resuming session once told the user a dead driver was ` +
    `"currently re-verifying older slices" on exactly that reasoning, and the user made a stop/continue ` +
    `decision on the fiction.\n` +
    `1c. Mint runId for THIS run: the current UTC timestamp in ISO-8601 basic form plus the slug — e.g. ` +
    `'20260726T143005Z-${slug}'. Report it as runId. (This script has no clock; you are the only step that does.)\n` +
    `2. Read ${projectRoot}/.ai/workflows/${slug}/03-slice.md (the roster). Capture EVERY slice slug in roster ` +
    `order, and record each entry's roster status from 00-index.md slices[] (defined | in-progress | complete | ` +
    `skipped) as slices[].status — capture 'skipped' entries too (the driver skips them itself; dropping them here ` +
    `would break slice-mode routing to the NEXT slice). If 03-slice.md is ABSENT and the workflow is SINGLE-SCOPE ` +
    `(selected-slice is set on 00-index.md — true ` +
    `for a forwarded rca and for any one-slice standard workflow), synthesize a one-entry roster [selected-slice] ` +
    `(fall back to the slug if selected-slice is empty), set singleScope=true, and set reviewScope='slug-wide' (one ` +
    `un-suffixed 07-review.md — never a per-slice split for a single scope). Do NOT route to '/wf slice' for a ` +
    `single-scope workflow; a roster of one is complete.\n` +
    `3. Resolve fileConvention: 'suffixed' for a multi-slice standard workflow that has per-slice ` +
    `03-slice-<slice>.md files (so stage files are 04-plan-<slice>.md, 06-verify-<slice>.md, 07-review-<slice>.md); ` +
    `'unsuffixed' for a change-mode (workflow-type fix|hotfix|refactor), a forwarded rca driven single-scope, or any ` +
    `single-scope standard workflow (one slice, only a 04-plan.md master) where stage files are 04-plan.md, ` +
    `06-verify.md, 07-review.md.\n` +
    `4. Determine mode: 'slice' if a target slice was given, else 'slug'. In slice mode, confirm the target slice ` +
    `is in the roster — if not, set ok=false, blockReason, route='/wf slice ${slug}'.\n` +
    `5. READINESS GATE (yolo drives from PLAN onward only — it NEVER runs intake or shape autonomously; those own ` +
    `product-owner alignment). First CLASSIFY by 00-index.md workflow-type — only workflows with a decided build are ` +
    `drivable, and a non-build type must NOT fall through to the slice check:\n` +
    `   5a. TERMINAL-ANALYSIS, no decided build — workflow-type ∈ {investigate, discover, ideate} (00-index.md ` +
    `type: workflow-index; by design NO 03-slice.md/04-plan.md). Unlike rca, these do NOT converge on one build: ` +
    `investigate emits 2–3 UNPICKED option sketches and writes NO 02-shape.md; discover emits a yes/no VERDICT whose ` +
    `only follow-up is more analysis (e.g. /wf intake rca), not a build; ideate emits a RANKED MENU whose ideas each ` +
    `become their OWN new workflow. The missing ingredient is a human product decision (pick an option / act on the ` +
    `verdict / choose an idea) — exactly the intake+shape alignment yolo must not make. So yolo drives NOTHING here; ` +
    `'missing 03-slice.md' is EXPECTED and must NEVER route to '/wf slice'. These are also never continued IN PLACE ` +
    `(investigate has no shape to plan) — each SEEDS A NEW /wf intake workflow, so do NOT route to '/wf plan ${slug}' ` +
    `either. Set ok=false, blockReason naming the terminal type, and set route from the workflow's OWN recorded next ` +
    `step (00-index.md next-invocation / the 01-<mode>.md lead): ideate → its recorded '/wf intake <chosen-idea>'; ` +
    `investigate → 'pick an option in 01-investigate.md, then /wf intake fix <option> (or /wf intake <option>) — ` +
    `/wf yolo drives it once intaked+shaped'; discover → 'act on the verdict in 01-discover.md (/wf intake rca ` +
    `<symptom> if it failed; no build if it holds)'.\n` +
    `   5b. RCA with a DECIDED build — workflow-type 'rca'. The diagnosis IS the intake and 02-shape.md is its ` +
    `synthesized shape, so intake+shape are already COMPLETE and yolo may drive plan→implement→verify→review over ` +
    `the single scope (the plan/implement/verify/review references all have a 'forwarded mode' path for this). Read ` +
    `recommended-next from 01-rca.md frontmatter (fallback: 00-index.md recommended-routes.primary / next-invocation):\n` +
    `      • human-triage — OR 01-rca.md shows root-cause-confidence: low AND blast-radius: high — is a genuine ` +
    `product STOP: set ok=false, blockReason='RCA recommends human triage (low confidence + high blast radius)', ` +
    `route='read .ai/workflows/${slug}/01-rca.md and choose the build route by hand, then /wf yolo ${slug}'.\n` +
    `      • otherwise (recommended-next ∈ {/wf plan, /wf intake fix, /wf intake hotfix}) → DRIVABLE single-scope ` +
    `build. Readiness passes when 01-rca.md (type: rca — the intake lead) and 02-shape.md both exist; 03-slice.md is ` +
    `NOT required (single-scope roster was synthesized in step 2, singleScope=true). HONOR the recommendation via ` +
    `reviewDimension = the review stage's default rubric: recommended-next hotfix → 'security'; plan/fix → leave ` +
    `reviewDimension empty (standard selection). yolo drives from PLAN regardless — it does NOT re-run /wf intake ` +
    `fix|hotfix, mint a new branch, or change base-branch; the drive runs on the tree the RCA recorded.\n` +
    `   5c. SELF-MANAGED build — workflow-type 'update-deps'. yolo DRIVES this via a self-managed exec path: it does ` +
    `NOT decompose into /wf implement + /wf verify (those redirect back to intake). Instead yolo wraps ` +
    `intake/update-deps.md Steps 6–9, which self-author 05-implement.md + 06-verify.md in tier order, then runs the ` +
    `standard slug-wide review. yolo drives from the PLAN gate onward — it never authors the scan/research/` +
    `prioritize/plan itself (that is the human's own /wf intake update-deps run). READINESS: 01-update-deps.md ` +
    `(type: intake, status: complete), 02-shape.md, 03-slice.md, and 04-plan.md must ALL exist and be ` +
    `status: complete. If any is missing or not complete, set ok=false with blockReason and ` +
    `route='/wf intake update-deps ${slug}' (or '/wf plan ${slug}' when 04-plan is the only gap). When 01–04 are ` +
    `complete, set ok=true and workflowType='update-deps', then PROCEED to step 6 (the single-slice roster: ` +
    `implement→05-implement.md, verify→06-verify.md, both un-suffixed; reviewScope slug-wide). Do NOT fall through ` +
    `to 5d.\n` +
    `   5d. STANDARD build lifecycle — everything else (standard/feature, plus the compressed change-modes fix / ` +
    `hotfix / refactor; 00-index.md type: index). Apply the readiness check: the stage-1 intake artifact must exist ` +
    `and not be status: awaiting-input; 02-shape.md must exist; 03-slice.md must exist (UNLESS singleScope was ` +
    `synthesized in step 2 for a one-slice standard workflow). The intake lead is 01-intake.md for a standard ` +
    `workflow, but the change-modes name it after the mode — resolve from workflow-type: fix→01-fix.md, ` +
    `hotfix→01-hotfix.md, refactor→01-refactor.md, else 01-intake.md (all carry frontmatter type: intake, ` +
    `stage-number 1; accept any 01-*.md whose frontmatter is type: intake if the named file is somehow absent). If ` +
    `the resolved intake lead, 02-shape.md, or (when required) 03-slice.md is missing or awaiting-input, set ok=false ` +
    `with blockReason and route='/wf intake <description>' (or '/wf shape ${slug}' / '/wf slice ${slug}' for the ` +
    `specific gap).\n` +
    `6. For ALL roster slices (in roster order — the COMPLETE list, both modes; the full roster is needed so ` +
    `slice-mode can route to the next slice), check on disk which of plan/implement/verify/review already exist ` +
    `AND are terminal-clean, marking each 'done' | 'todo':\n` +
    `   - plan: artifact present AND frontmatter status: complete\n` +
    `   - implement: artifact present AND status: complete\n` +
    `   - verify: artifact present AND convergence ∈ {not-needed, converged} AND (result: pass, OR result: partial ` +
    `where EVERY open runtime-evidence-deferral for this slice in priorDeferrals has authorized=true — a ` +
    `PO-authorized deferral is settled and needs no re-verify; a partial with any open UN-authorized deferral stays ` +
    `'todo' so the next verify re-challenges the wall)\n` +
    `   - review: artifact present AND verdict ∈ {ship, ship-with-caveats} AND metric-findings-blocker == 0\n` +
    `   In slug-wide review scope, mark every per-slice 'review' as 'n-a' (review runs once at slug level, not per slice).\n` +
    `6b. For each slice, also classify WHY it still has work, as slices[].reverifyReason — this decides ` +
    `scheduling, so be precise:\n` +
    `   - 'new-work' — any of plan/implement/review is 'todo', OR verify is 'todo' because it was never run, ` +
    `is not converged, or has a SUBSTANTIVE residual (an AC failing for a code reason). This is real work.\n` +
    `   - 'deferral-rechallenge' — every stage is otherwise terminal-clean and the ONLY reason verify is 'todo' ` +
    `is that its result: partial carries an open UN-authorized runtime-evidence deferral. This is bookkeeping: ` +
    `the code is built and reviewed; what is missing is fresh proof about an environment wall.\n` +
    `   - 'none' — every stage is 'done' or 'n-a'.\n` +
    `7. Branch posture (READ-ONLY — report, never switch or create): run ` +
    `\`git -C ${projectRoot} branch --show-current\`. Report branch.current, branch.target (= 00-index.md branch), ` +
    `branch.base (= base-branch), branch.strategy (= branch-strategy: dedicated | shared | none), branch.match ` +
    `(current === target, or target empty), and branch.exists — true iff branch.target resolves as a local ref ` +
    `(\`git -C ${projectRoot} rev-parse --verify --quiet refs/heads/<target>\`) OR an already-fetched ` +
    `remote-tracking ref (refs/remotes/origin/<target>); do NOT run \`git fetch\` or \`git ls-remote\` (no network). ` +
    `For strategy shared/none, or an empty target, set exists=false — yolo will not switch in those modes.\n` +
    `8. CLEARING-EVENT TRIPWIRE (W4). For every open entry in priorDeferrals that carries a \`clearing-probe\`, ` +
    `EXECUTE that one command now (they are contracted to be single, side-effect-free, and fast — e.g. ` +
    `\`adb devices\`, \`curl -sf localhost:8080/health\`). Give each a short timeout and never run more than the ` +
    `one recorded command. Set that entry's clearingProbeHit to true when the command's exit status/output says ` +
    `the clearing event HAS occurred, false when it has not, and omit it when the probe could not be run at all. ` +
    `Do NOT clear the deferral, do NOT edit 00-index.md, and do NOT treat a hit as evidence — this is a ` +
    `TRIPWIRE only. A deferral whose clearing event has quietly come true is the failure it exists to catch: one ` +
    `slug's "device available for AC6" event was satisfied on-screen in the same session — emulator booted, app ` +
    `installed — and the AC still shipped uncleared because nobody was watching for it.\n\n` +
    `Return the structured orientation. Set ok=true only when the readiness gate passes.` +
    // orient mints RUN_ID, so it writes its own heartbeat with the id it just made.
    `\n\nDRIVER HEARTBEAT (MANDATORY). Using the runId you minted in step 1c, append two lines to ` +
    `${JOURNAL_PATH} (create it if absent, append only, never rewrite): one BEFORE you start reading ` +
    `— {"at":"<ISO-8601 UTC now>","run":"<runId>","seq":0,"event":"agent-start","agent":"orient","phase":"Orient"} ` +
    `— and one immediately before you return, the same shape with "event":"agent-end", "status":"<ok|blocked>" ` +
    `and "errors":<count of errors you recovered from>. This journal is how a human tells a live driver from a ` +
    `dead one; an append failure never changes what you do.`,
    { schema: ORIENT_RESULT, label: 'orient', phase: 'Orient' }
  )
}

// ensureBranch() — DEDICATED strategy only (the control flow gates on it). Mirrors
// implement.md Step 0.9 so yolo lands the run on the slug branch BEFORE any stage
// runs, instead of leaving plan/implement to mint it mid-chain: if the slug branch
// already exists (local or an already-fetched remote-tracking ref) → switch to it;
// if it does NOT exist → CREATE it from base-branch (fall back to the current HEAD
// when no base-branch is recorded). Never stash or force — a switch/create that git
// refuses because it would clobber uncommitted work HARD-STOPs (ok:false), exactly
// as the manual flow refuses. Read-only otherwise: no commits, no other writes.
async function ensureBranch(idx) {
  const target = idx.branch.target
  const base = idx.branch.base || ''
  const createCmd = base
    ? `\`git -C ${projectRoot} switch -c ${target} ${base}\``
    : `\`git -C ${projectRoot} switch -c ${target}\` (no base-branch recorded → branch from the current HEAD)`
  const baseStep = base
    ? `6. If the base branch '${base}' itself does not exist (the create fails for that reason) → return ` +
      `{ ok: false, reason: 'base-branch ${base} does not exist; cannot create ${target}' }.\n`
    : ''
  return await agent(
    `Autonomous branch posture for SDLC slug '${slug}' (branch-strategy: dedicated). The working tree is on ` +
    `'${idx.branch.current}' but the workflow's dedicated branch is '${target}'. Land the tree on '${target}' NOW, ` +
    `before any stage runs, by mirroring implement.md Step 0.9. Run git as \`git -C ${projectRoot} …\`; make NO ` +
    `commits and change nothing else.\n\n` +
    `1. If \`git -C ${projectRoot} branch --show-current\` is already '${target}', return ` +
    `{ ok: true, switched: false, action: 'already-on-branch' }.\n` +
    `2. Does '${target}' exist? Check WITHOUT network: \`git -C ${projectRoot} rev-parse --verify --quiet ` +
    `refs/heads/${target}\` (local) and refs/remotes/origin/${target} (already-fetched remote). Do NOT run ` +
    `\`git fetch\` / \`git ls-remote\`.\n` +
    `3. If it EXISTS (local or remote-tracking) → \`git -C ${projectRoot} switch ${target}\` (auto-creates a local ` +
    `tracking branch from origin when only the remote ref exists). On success return ` +
    `{ ok: true, switched: true, action: 'switched' }.\n` +
    `4. If it does NOT exist → CREATE it from the base branch: ${createCmd}. On success return ` +
    `{ ok: true, switched: true, action: 'created', from: '${base || idx.branch.current}' }.\n` +
    `5. If git REFUSES because uncommitted changes would be overwritten → DO NOT stash, force, or commit. Return ` +
    `{ ok: false, reason: 'switching/creating ${target} would clobber uncommitted work on ${idx.branch.current}' }.\n` +
    baseStep +
    `Report the action you took.` +
    heartbeatClause('branch', 'Orient', 'branch', null),
    {
      schema: {
        type: 'object',
        required: ['ok'],
        properties: {
          ok: { type: 'boolean' },
          switched: { type: 'boolean' },
          action: { type: 'string' },   // already-on-branch | switched | created
          from: { type: 'string' },      // base the branch was created from (created only)
          reason: { type: 'string' },
        },
      },
      label: 'branch', phase: 'Orient',
    }
  )
}

// reChallengeClause() — F3: fold the run's OPEN prior deferrals (from orient's
// priorDeferrals) into a RE-CHALLENGE block for the verify prompt. A deferral recorded
// by an earlier run is a CLAIM to re-test, never a fact to inherit — the Crumb
// stale-creds incident (a carried-forward "Firebase creds unavailable" paired with a
// mocked 0-issues verify) is exactly what this stops. Empty list → '' (no clause).
function reChallengeClause(priorDeferrals) {
  if (!Array.isArray(priorDeferrals) || !priorDeferrals.length) return ''
  // A PO-authorized deferral (ship-override-authorization on the index entry) is a
  // settled human decision — re-challenging it re-litigates what the PO already
  // accepted and re-walls a run the PO explicitly unblocked (bot-backend 2026-07-12:
  // accepted deferrals forced hand-crafted slice-mode workarounds). Exclude them.
  priorDeferrals = priorDeferrals.filter(d => !(d && d.authorized === true))
  if (!priorDeferrals.length) return ''
  const lines = priorDeferrals.map(d => {
    const parts = [`slice '${(d && d.slice) || '?'}'`, `reason: ${(d && d.reason) || '(none recorded)'}`]
    if (d && d.deferredAt) parts.push(`deferred-at: ${d.deferredAt}`)
    if (d && d.repeatOf) parts.push(`repeat-of: ${d.repeatOf}`)
    return `    • ${parts.join(' — ')}`
  }).join('\n')
  return ` PRIOR DEFERRALS — RE-CHALLENGE. Earlier runs recorded these OPEN runtime-evidence deferrals ` +
    `(00-index.md, cleared-by: null):\n${lines}\n` +
    `These are CLAIMS recorded by earlier runs, NOT facts. Do NOT inherit any of them. For each whose constraint ` +
    `could touch what you are verifying now, re-run its capability probe FRESH in THIS run: a wall that no longer ` +
    `stands must be verified now (produce the evidence and clear the deferral); a wall that still stands gets a ` +
    `FRESH probe receipt on this run's deferral — never the old reason copied forward.`
}

// ---------------------------------------------------------------------------
// runStage() — THE core wrapper. Points a fresh subagent at the on-disk
// reference and overrides only the interactive gate. This is "wrap, not fork":
// yolo inherits every future improvement to plan/implement/verify/review for
// free, with zero duplicated stage logic.
// ---------------------------------------------------------------------------
async function runStage(stage, sliceArg, idx, extra = {}) {
  const sliceClause = sliceArg ? `, slice '${sliceArg}'` : ''
  const roundClause = extra.round
    ? ` This is autonomous fix ROUND ${extra.round} of up to 2 — a prior round already applied one fix pass; ` +
      `resolve only what still fails. If warned the slice was already verified, proceed with the overwrite.`
    : ''
  // F2 corrective probe round — a prior verify round returned structurally clean but
  // deferred these AC(s) with no capability-probe receipt. This is NOT a fix pass; it is
  // a demand for the receipt the deferral law requires (verify.md §"Attempt before declare").
  const probeClause =
    stage === 'verify' && Array.isArray(extra.probeAcs) && extra.probeAcs.length
      ? ` CORRECTIVE PROBE ROUND — a prior round deferred these AC(s) WITHOUT a capability-probe receipt: ` +
        `${extra.probeAcs.join(', ')}. For EACH, execute the capability probe NOW (if the prior round did not) ` +
        `and attach its receipt — the literal command you ran + a one-line output tail — to that deferral's ` +
        `\`probe\` field (and to interactive-verification-defer-reason). If a probe shows the wall no longer ` +
        `stands, produce the evidence INSTEAD of the deferral. A deferral still carrying no probe after this ` +
        `round will hard-stop the run.`
      : ''
  // F3 — open prior deferrals become a RE-CHALLENGE block (verify only): re-probe, never inherit.
  const reChallenge = stage === 'verify' ? reChallengeClause(idx.priorDeferrals) : ''
  // Plan fan-out: the driver is the single 00-index writer; concurrent plan
  // subagents write ONLY their own per-slice artifact.
  const noIndexClause = extra.noIndexWrites
    ? ` INDEX WRITES WITHHELD: do NOT edit 00-index.md or the global INDEX.md in this run — the driver records ` +
      `your stage completion itself (single-writer). Write only your own stage artifact(s).`
    : ''
  const dimensionHint =
    stage === 'review' && idx.reviewDimension
      ? ` Default review rubric: '${idx.reviewDimension}' — the forwarded RCA recommended a build flavor whose ` +
        `default dimension is '${idx.reviewDimension}' (the review reference does not auto-apply it for ` +
        `workflow-type: rca, so honor it here); widen to additional dimensions only if the diff warrants.`
      : ''
  const scopeHint =
    stage === 'review'
      ? ` Review scope is '${idx.reviewScope}' (per 00-index.md): ${idx.reviewScope === 'slug-wide'
          ? 'write the single 07-review.md over the whole branch diff (git diff ' + (idx.branch.base || '<base>') + '...HEAD)'
          : 'write 07-review-' + sliceArg + '.md over git diff HEAD for this slice'}.${dimensionHint}`
      : ''
  return await agent(
    `Execute the SDLC '${stage}' stage for slug '${slug}'${sliceClause}, FULLY AUTONOMOUSLY (no human in the loop).\n\n` +
    `${EOB}\n\n` +
    `Read ${referenceRoot}/${stage}.md IN FULL and follow it VERBATIM to do the stage's real work and write its ` +
    `artifact(s) under ${projectRoot}/.ai/workflows/${slug}/ — with ONE override: wherever the reference tells you ` +
    `to ask the user (AskUserQuestion) or pause for a human, DO NOT. Resolve it yourself by this policy:\n\n` +
    `${POLICY[stage]}${roundClause}${probeClause}${reChallenge}${scopeHint}${noIndexClause}\n\n` +
    `Operating rules:\n` +
    `- GROUNDED PROGRESS (${referenceRoot}/_grounded-progress.md): before reporting progress or terminal state, ` +
    `audit each claim against a tool result from THIS run. Report only work you can point to evidence for; if ` +
    `something is not yet verified, say so; a failing check is reported as failing with its output; every count ` +
    `you return derives from an artifact or tool result you opened this run, never from memory of your own edits.\n` +
    `- EARLY-STOP GUARD (${referenceRoot}/_autonomy-guards.md): before ending, check your last paragraph — if it ` +
    `is a plan, a question, or a promise about work you have not done, do that work now; end only when the stage ` +
    `contract is complete or the policy hard-stopped you.\n` +
    `- Your mandate is ONLY the '${stage}' stage for ${sliceArg ? `slice '${sliceArg}'` : `slug '${slug}'`}. Do ` +
    `NOT run other stages, do NOT claim completion of other slices or of the whole workflow, and do NOT recommend ` +
    `routes beyond what this stage's reference itself returns.\n` +
    `- Project root ${projectRoot} is ABSOLUTE. Resolve every artifact path under it and run git as ` +
    `\`git -C ${projectRoot} …\`. Do not rely on your working directory — it is not this repo.\n` +
    `- Write SCHEMA-COMPLETE frontmatter: a strict validator enforces the full sdlc/v1 frontmatter and rejects an ` +
    `incomplete write. Match the reference's artifact contract field-for-field.\n` +
    `- Record EVERY autonomous decision into the artifact (## Assumptions / ## Triage Decisions / ## Fix Status / ` +
    `## Verify-Owned Fixes, per the reference) so this run is exactly as auditable as a human-gated one. Nothing ` +
    `dies silently inside an artifact.\n` +
    `- When the policy says STOP, still finish the artifact in its honest terminal state, then return ` +
    `status:'hard-stop' with hardStopReason.` +
    CONTROL_FILE_RULE + deadDriverClause(idx.priorRun) + DECISION_CONTRACT + `\n\n` +
    `Return the terminal state: stage, slice, status ('complete' when the gate is clean, 'hard-stop' when the ` +
    `policy stopped you), the primary artifactPath, and terminal fields — plan/implement: statusField; verify: ` +
    `convergence + result + deferrals ([{ac, reason, probe}] — ACs deferred for un-producible runtime evidence, ` +
    `each with the literal capability-probe command + output tail you ran THIS round to establish the wall; [] if ` +
    `none) + substantiveResidual (true iff an AC fails/partials for a CODE reason); review: verdict + blockerCount ` +
    `(= metric-findings-blocker, OPEN) — plus the class-stamped decisions you recorded, any residual ` +
    `(could-not-fix) notes, and your recovered-error list.` +
    heartbeatClause(`${stage}${sliceArg ? ':' + sliceArg : ''}`, 'Drive', stage, sliceArg),
    { schema: STAGE_RESULT, label: `${stage}${sliceArg ? ':' + sliceArg : ''}`, phase: 'Drive' }
  )
}

// W5.2 — SLICE-COMPLETE WRITE-BACK. Completed slices routinely left `03-slice.md`
// at `status: defined` and the index `progress` block stale, so the next run's
// orientation had to cross-check artifacts instead of trusting the index — and a
// later handoff had to self-repair what the drive should have recorded. The
// mechanism belongs to the streamline plan's write-back work; what belongs HERE is
// that yolo's slice-complete step is a WRITER: the fix lands at drive time, when
// the fact is fresh, not two stages later when someone notices the drift.
//
// Deliberately its own tiny agent rather than a clause on the last stage: the
// stage subagent's mandate is scoped to its own artifact ("do NOT claim completion
// of other slices"), and widening that mandate is exactly how a stage starts
// editing state it does not own.
async function writeBackSliceStatus(sliceArg, idx, stagesRun) {
  return await agent(
    `SLICE-COMPLETE BOOKKEEPING for slug '${slug}', slice '${sliceArg}'. The autonomous driver just drove this ` +
    `slice through ${stagesRun.join(' → ')} and every gate cleared. Record that fact in the control files so the ` +
    `index tells the truth without anyone re-deriving it from artifacts.\n\n` +
    `${EOB}\n\n` +
    `1. In ${projectRoot}/.ai/workflows/${slug}/00-index.md, set this slice's entry in \`slices[]\` to ` +
    `status: complete, and refresh the \`progress\` block (completed/total counts) to match the roster's actual ` +
    `state. Refresh \`updated-at\`.\n` +
    `2. In the roster file (${projectRoot}/.ai/workflows/${slug}/03-slice.md, or the per-slice ` +
    `03-slice-${sliceArg}.md when the workflow uses the suffixed convention), set this slice's ` +
    `\`status:\` to complete. If the roster records no per-slice status field, leave it alone and say so.\n` +
    `3. Change NOTHING else. Do not touch stage artifacts, do not advance \`current-stage\` past this slice, do ` +
    `not edit another slice's entry, and never mark the WORKFLOW complete — the driver stops before handoff and ` +
    `the workflow is not done.` +
    CONTROL_FILE_RULE + deadDriverClause(idx.priorRun) + `\n\n` +
    `Return { ok, wrote: [<the files you actually changed>], note }.` +
    heartbeatClause(`writeback:${sliceArg}`, 'Drive', 'writeback', sliceArg),
    {
      schema: {
        type: 'object',
        required: ['ok'],
        properties: {
          ok: { type: 'boolean' },
          wrote: { type: 'array', items: { type: 'string' } },
          note: { type: 'string' },
        },
      },
      label: `writeback:${sliceArg}`, phase: 'Drive',
    }
  )
}

// verifyClean() — the SINGLE source of truth for "verify cleared the gate so the
// chain may proceed". Two ways to be clean:
//   1. result: pass — every AC met (code-only via tests, user-observable via evidence).
//   2. result: partial whose ONLY residual is user-observable AC the environment
//      genuinely could not evidence and that were therefore DEFERRED (recorded in
//      00-index runtime-evidence-deferrals; /wf ship will block on them later).
// Both require a converged/not-needed loop and NO substantive residual. A bare
// blocked-runtime-evidence-missing (un-evidenced AND un-deferred), a substantive
// fail/partial, or an escalated loop is NOT clean. driveVerify and evaluateGate
// share this so the in-loop decision and the defensive gate can never drift.
//
// The deferral is CONTRACT-authored into terminal.deferrals[], but verify subagents
// routinely park a plan-authorized deferral in the sibling residual[] instead (with
// substantiveResidual:false) — the driver, which can't see residual[] via terminal
// alone, then false-stopped a converged, defect-free slice as "did not converge"
// (~500k tokens per recurrence on any secret/live-service-gated AC). The guard that
// matters is NOT which array holds it — a substantive residual already returned false
// above, so by here any recorded entry is a non-substantive deferral/note. So accept
// the deferral from EITHER terminal.deferrals[] OR the residual[] the caller passes in.
//
// But "something was recorded" is NOT enough on its own: residual[] is the broader
// "deferred / could-not-fix" bucket, and a could-not-fix note need carry no `ac`. The
// collectDeferrals (the ship-block hand-back) surfaces a deferral only when it carries an
// `ac` — its push() guard drops any ac-less entry from BOTH arrays. So "something was
// recorded" is not enough on its own: residual[] is the broader "deferred / could-not-fix"
// bucket and a could-not-fix note need carry no `ac`. If this gate proceeded on a bare
// `.length > 0`, a partial whose only residual is an ac-less note would pass here yet
// record NOTHING for /wf ship to block on — the exact silently-dropped AC this function
// exists to stop. So the clean signal must MATCH the collector: a partial is clean only
// when at least one ac-bearing deferral exists in EITHER array.
function verifyClean(t, residual) {
  if (!t) return false
  const converged = t.convergence === 'converged' || t.convergence === 'not-needed'
  if (!converged || t.substantiveResidual === true) return false
  if (t.result === 'pass') return true
  const hasAc = (arr) => Array.isArray(arr) && arr.some((d) => d && d.ac)
  return t.result === 'partial' && (hasAc(t.deferrals) || hasAc(residual))
}

// acKey() — canonical AC identity for deferral dedupe/matching. Verify subagents
// routinely emit the SAME deferral in two shapes: fully-labeled in
// terminal.deferrals[] ("AC2 — three consecutive turns …", with a probe receipt)
// and bare in the sibling residual[] ("AC2", no receipt). Exact-string keying
// treats those as two different ACs — the bare copy then looks un-probed and
// probeGaps false-HARD-STOPs a compliant slice (Playster 2026-07-15: one 79-min
// resume plus a second run lost to exactly this). Extract the leading AC token
// when one exists (AC2, AC-7a, AC 3.1 …) and normalize case/separators; fall
// back to the trimmed string for free-form labels so unrelated labels never
// collide into one key.
function acKey(ac) {
  const s = String(ac ?? '').trim()
  const m = s.match(/^AC[-\s]?[\w.]+/i)
  return (m ? m[0] : s).replace(/[-\s]/g, '').toUpperCase()
}

// probeGaps() — the deferral-LAW compliance check that verifyClean deliberately does
// NOT enforce. verifyClean's accept condition is untouched (the v9.114 lesson: never
// hard-gate a converged, defect-free slice on a formatting technicality — that cost
// ~500k tokens per recurrence). But verify.md §"Attempt before declare" requires a
// PROBE RECEIPT on every deferral — the literal capability-probe command + output tail
// executed THIS run. probeGaps returns the ac-bearing deferral entries (deduped by ac,
// across BOTH terminal.deferrals[] and the sibling residual[]) that carry no non-empty
// `probe`. Dedupe credits EITHER array: if any copy of an ac records a probe, that ac is
// compliant. driveVerify turns a non-empty result into ONE corrective re-run (soft),
// then a hard-stop (the law is not optional) — never a first-round hard gate.
function probeGaps(t, residual) {
  const probed = new Set()       // acKey → some copy carries a non-empty probe
  const gapEntry = new Map()     // acKey → first probe-less entry seen (dedupe by acKey)
  const scan = (arr) => {
    if (!Array.isArray(arr)) return
    for (const d of arr) {
      if (!d || !d.ac) continue   // ac-less notes are not deferrals — ignored (matches collectDeferrals)
      if (typeof d.probe === 'string' && d.probe.trim() !== '') probed.add(acKey(d.ac))
      else if (!gapEntry.has(acKey(d.ac))) gapEntry.set(acKey(d.ac), d)
    }
  }
  scan(t && t.deferrals)
  scan(residual)
  const gaps = []
  for (const [ac, entry] of gapEntry) if (!probed.has(ac)) gaps.push(entry)
  return gaps
}

// driveVerify() — verify gets up to N=2 autonomous fix rounds (the reference
// does one fix round per invocation; a second invocation is round 2). A slice
// that is clean — including one whose only residual is environment-DEFERRED
// evidence — proceeds. Still-substantively-escalated after round 2 → HARD-STOP.
async function driveVerify(sliceArg, idx) {
  let last
  let probeCorrection = null   // set when a prior round was clean but its deferrals lacked probe receipts
  for (let round = 1; round <= 2; round++) {
    last = await runStage('verify', sliceArg, idx, { round, probeAcs: probeCorrection })
    // A null return = the verify subagent was skipped or died on a terminal API
    // error after retries (not a quality failure). Stop cleanly; resume retries it.
    if (!last) return { stage: 'verify', slice: sliceArg, status: 'hard-stop', artifactPath: '', terminal: {}, transient: true, hardStopReason: 'verify did not return (subagent skipped or hit a transient API error) — re-run to retry this slice; resume skips completed stages' }
    if (last.status === 'hard-stop') return last
    const t = last.terminal || {}
    if (verifyClean(t, last.residual)) {
      // Structurally clean — but the deferral law demands a probe receipt on every deferral
      // (verify.md §"Attempt before declare"). verifyClean tolerates a missing receipt (the
      // v9.114 no-hard-gate lesson); probeGaps surfaces it here. First offense with a round
      // left → ONE corrective re-run that demands the receipt (or the evidence, if the wall
      // fell). Still probe-less after that → hard-stop: the law is not optional, and re-running
      // is cheap because resume skips completed stages.
      // A slice whose open deferrals the PO already authorized (ship-override-
      // authorization on the 00-index entry) is settled — demanding fresh probe
      // receipts there re-walls a run the PO explicitly unblocked. Authorization
      // granularity is the index entry (slice-level), so the whole slice's
      // receipt-escalation is waived; NEW deferrals still register in the index
      // and still block /wf ship until cleared or authorized themselves.
      const sliceAuthorized = Array.isArray(idx.priorDeferrals) &&
        idx.priorDeferrals.some(p => p && p.slice === sliceArg && p.authorized === true)
      const gaps = sliceAuthorized ? [] : probeGaps(t, last.residual)
      if (gaps.length) {
        if (round < 2 && !probeCorrection) {
          probeCorrection = gaps.map(g => g.ac)
          log(`verify:${sliceArg} clean but ${gaps.length} deferral(s) carry no capability-probe receipt (${probeCorrection.join(', ')}) — one corrective re-run to attach receipts (or produce evidence if the wall fell)`)
          continue
        }
        return { ...last, status: 'hard-stop', hardStopReason: `deferral(s) still carry no capability-probe receipt after a corrective re-run: ${gaps.map(g => g.ac).join(', ')} — attach the literal probe command + output tail per verify.md §"Attempt before declare", or produce the evidence if the wall no longer stands` }
      }
      const deferred = (Array.isArray(t.deferrals) ? t.deferrals.length : 0) +
                       (Array.isArray(last.residual) ? last.residual.filter(d => d && d.ac).length : 0)
      if (deferred > 0) log(`verify:${sliceArg} clean with ${deferred} runtime-evidence deferral(s) — recorded in 00-index runtime-evidence-deferrals; review/handoff proceed, /wf ship blocks until cleared`)
      return last
    }
    // Bare blocked-runtime-evidence-missing means the subagent left a user-observable
    // AC un-evidenced WITHOUT applying the deferral the policy now requires. Proceeding
    // would silently drop that AC — HARD-STOP and make it re-runnable. (The fix is for
    // verify to DEFER un-producible evidence, or for /wf probe to capture it.)
    if (t.result === 'blocked-runtime-evidence-missing') {
      return { ...last, status: 'hard-stop', hardStopReason: 'a user-observable AC has no runtime evidence and was not deferred — re-run /wf verify (it should defer un-producible evidence) or /wf probe in a capable environment; never fabricated' }
    }
    log(`verify:${sliceArg} round ${round} → convergence=${t.convergence} result=${t.result} substantiveResidual=${t.substantiveResidual === true}`)
    if (round === 2) {
      return { ...last, status: 'hard-stop', hardStopReason: 'verify did not converge after 2 autonomous fix rounds (substantive issues remain)' }
    }
  }
  return last
}

// ---------------------------------------------------------------------------
// W2.2 — BOUNDED RE-VERIFY. The re-challenge law is right: a wall recorded by an
// earlier run is a claim, not a fact, and must be re-probed. But it was running as
// a FULL verify dispatch over slices that were already built, verified, and
// reviewed — so a driver launched to do a slug-wide review spent its entire life
// re-verifying terminal-clean slices and died before starting the work it existed
// for. The cost was never the probing; it was re-running the whole stage to do it.
//
// So a terminal-clean slice whose only residue is an open deferral gets a WALL
// PROBE: re-execute the recorded capability probes, nothing else. If a wall fell,
// the evidence is now producible and a full verify is warranted — with a reason the
// driver can name. If the walls still stand, the deferrals carry a fresh receipt and
// the slice needs no further work this run.
// ---------------------------------------------------------------------------
const WALL_PROBE_RESULT = {
  type: 'object',
  required: ['walls'],
  properties: {
    walls: {
      type: 'array',
      items: {
        type: 'object',
        required: ['ac', 'stands'],
        properties: {
          ac: { type: 'string' },
          stands: { type: 'boolean' },   // false = the wall fell; the evidence is producible now
          probe: { type: 'string' },     // literal command + one-line output tail, run THIS round
          note: { type: 'string' },
        },
      },
    },
    // The driver escalates to a full re-verify only for a reason it can NAME. A
    // subagent that finds the artifacts contradict the index says so here.
    escalateReason: { type: 'string' },
  },
}

async function driveWallProbe(sliceArg, idx) {
  const open = (idx.priorDeferrals || []).filter(d => d && d.slice === sliceArg && d.authorized !== true)
  const lines = open.map(d => `    • ${d.ac ? `${d.ac} — ` : ''}${d.reason || '(no reason recorded)'}` +
    `${d.clearingEvent ? ` [clearing event: ${d.clearingEvent}]` : ''}` +
    `${d.clearingProbe ? ` [clearing probe: ${d.clearingProbe}]` : ''}`).join('\n')
  return await agent(
    `WALL RE-CHALLENGE for slug '${slug}', slice '${sliceArg}'. This slice is already built, verified, and (where ` +
    `applicable) reviewed — its ONLY residue is open runtime-evidence deferral(s). Your job is NOT to re-verify ` +
    `the slice. It is to answer one question per wall: **does this wall still stand?**\n\n` +
    `${EOB}\n\n` +
    `Open deferrals recorded for this slice in ${projectRoot}/.ai/workflows/${slug}/00-index.md:\n${lines || '    (none)'}\n\n` +
    `For EACH, re-execute its capability probe FRESH now (the recorded clearing-probe when one exists, otherwise ` +
    `the probe named in the defer-reason) and record the literal command plus a one-line output tail. Report ` +
    `stands: true when the wall is still there, stands: false when it has fallen. Read-only: run the probes, ` +
    `write NOTHING — no artifacts, no index edits, no commits.\n\n` +
    `Set escalateReason ONLY if you find something that genuinely warrants re-running the whole verify stage — ` +
    `the artifacts contradict the index, or a wall fell and its acceptance criterion now needs real evidence ` +
    `collected. Name it in one line; the driver records your reason as a decision so a later audit can see why ` +
    `the run chose bookkeeping over new work. If every wall still stands, leave escalateReason empty.` +
    heartbeatClause(`wall-probe:${sliceArg}`, 'Drive', 'wall-probe', sliceArg),
    { schema: WALL_PROBE_RESULT, label: `wall-probe:${sliceArg}`, phase: 'Drive' }
  )
}

// ---------------------------------------------------------------------------
// W3.3 — CORRECTIVE CLASSIFICATION ROUND. A decision with no `class` stamp is a
// hole in the run's headline guarantee ("intent-bearing escapes: 0"), and ~25% of
// recorded decisions arrived that way in every run measured. The probe-receipt
// pattern applies — one corrective round, then report honestly — but the corrective
// round is deliberately NOT a re-run of the stage: re-running `implement` to fetch a
// missing label would rebuild code for a bookkeeping gap. Instead a cheap read-only
// agent reads the artifact the stage already wrote and classifies what it left bare.
// Anything it still cannot classify stays `unclassified` and is reported as SUSPECT.
// ---------------------------------------------------------------------------
async function classifyDecisions(res, idx) {
  const bare = (res.decisions || []).filter(d => d && !(d.class && String(d.class).trim()))
  if (!bare.length) return res
  const listed = bare.map((d, i) => `    ${i + 1}. ${d.decision || d.what || d.summary || JSON.stringify(d)}`).join('\n')
  const out = await agent(
    `DECISION CLASSIFICATION (read-only) for slug '${slug}', stage '${res.stage}'` +
    `${res.slice ? `, slice '${res.slice}'` : ''}. The stage recorded these decisions WITHOUT the mandatory ` +
    `\`class\` stamp:\n${listed}\n\n` +
    `Read ${referenceRoot}/_decision-classes.md IN FULL, then read the stage artifact at ` +
    `${res.artifactPath || `${projectRoot}/.ai/workflows/${slug}/`} for the context each decision was made in. ` +
    `Classify EACH as 'implementation-detail' or 'intent-bearing' by that file's five tests. Write nothing.\n\n` +
    `Two rules that decide this round's worth:\n` +
    `- When a decision could plausibly be intent-bearing, classify it 'intent-bearing'. The cost of a false ` +
    `intent-bearing flag is the user reading one extra line; the cost of a false implementation-detail is an ` +
    `intent-bearing decision an autonomous run made silently, which is the exact escape this taxonomy exists ` +
    `to prevent.\n` +
    `- If you genuinely cannot tell from the artifact, return class 'unclassified' with a reason. Do NOT guess ` +
    `to fill the field — a guessed label is worse than an admitted gap, because it looks like knowledge.\n\n` +
    `Return { classified: [{ index (1-based, from the list above), class, why }] }.` +
    heartbeatClause(`classify:${res.stage}${res.slice ? ':' + res.slice : ''}`, 'Drive', 'classify', res.slice),
    {
      schema: {
        type: 'object',
        required: ['classified'],
        properties: {
          classified: {
            type: 'array',
            items: {
              type: 'object',
              required: ['index', 'class'],
              properties: {
                index: { type: 'number' },
                class: { type: 'string' },
                why: { type: 'string' },
              },
            },
          },
        },
      },
      label: `classify:${res.stage}${res.slice ? ':' + res.slice : ''}`, phase: 'Drive',
    }
  )
  if (!out || !Array.isArray(out.classified)) return res
  for (const c of out.classified) {
    const target = bare[(c && c.index || 0) - 1]
    if (!target || !c.class) continue
    const cls = String(c.class).trim()
    if (cls && cls !== 'unclassified') {
      target.class = cls
      target.classifiedBy = 'corrective-round'   // provenance: not the stage's own stamp
      if (c.why) target.classReason = c.why
    }
  }
  const still = (res.decisions || []).filter(d => d && !(d.class && String(d.class).trim())).length
  log(`decision classes: ${bare.length} unstamped in ${res.stage}${res.slice ? ':' + res.slice : ''} → ${bare.length - still} classified, ${still} still unclassifiable (reported as suspect, never folded into the zero)`)
  return res
}

// driveReview() — default (reviewFanout, on unless args pass false): hoist the
// dimension scan to the workflow for true parallelism + adversarial verify, then
// delegate the WRITE/triage/fix/ledger back to a wrapped review.md subagent given
// the pre-verified findings. Opt-out (args.reviewFanout === false): wrap review.md
// in ONE subagent (it fans out the dimensions internally per the reference).
async function driveReview(sliceArg, idx) {
  if (OPT.reviewFanout === false) {
    return await runStage('review', sliceArg, idx)
  }
  phase('Review')
  const base = idx.branch.base || '<base>'
  const diffRange = sliceArg ? 'HEAD' : `${base}...HEAD`
  const dims = ['correctness', 'security', 'tests', 'performance', 'maintainability']
  // 1. Parallel read-only dimension scouts.
  const scouts = await parallel(dims.map(dim => () => agent(
    `READ-ONLY review of slug '${slug}'${sliceArg ? `, slice '${sliceArg}'` : ''} along the '${dim}' dimension ONLY. ` +
    `Inspect the diff: \`git -C ${projectRoot} diff ${diffRange}\`. Surface real findings only. Return each as ` +
    `{ id, severity (BLOCKER|HIGH|MED|LOW|NIT), file, line, issue, confidence }. Write NOTHING.`,
    { schema: FINDINGS_SCHEMA, label: `scout:${dim}`, phase: 'Review' }
  )))
  const raw = scouts.filter(Boolean).flatMap(s => s.findings || [])
  // 2. Adversarial verify — refute each finding; keep only survivors. Higher
  //    signal BEFORE auto-fix means fewer false-positive fixes.
  const checked = await parallel(raw.map(f => () =>
    agent(
      `Adversarially REFUTE this code-review finding. Default to refuted=true if uncertain or unreproducible. ` +
      `Inspect ${projectRoot} (read-only) to check. Finding: ${JSON.stringify(f)}. Return { refuted, reason }.`,
      { schema: VERDICT_SCHEMA, label: `refute:${f.id || '?'}`, phase: 'Review' }
    ).then(v => (v && v.refuted === false ? f : null))
  ))
  const verified = checked.filter(Boolean)
  log(`review fan-out: ${raw.length} raw findings → ${verified.length} survived adversarial verify`)
  // 3. Wrapped writer — review.md owns the ledger/triage/fix mechanics; we only
  //    pre-filtered the findings. (Wrap, not fork: the artifact contract stays
  //    the reference's.)
  return await agent(
    `Execute the SDLC 'review' stage for slug '${slug}'${sliceArg ? `, slice '${sliceArg}'` : ''}, FULLY AUTONOMOUSLY.\n\n` +
    `${EOB}\n\n` +
    `Read ${referenceRoot}/review.md IN FULL and follow it VERBATIM for the artifact write, triage, fix loop, and ` +
    `accumulating ledger. Review scope is '${idx.reviewScope}'. A parallel per-dimension scan has ALREADY been run ` +
    `and adversarially verified; record and triage these surviving findings (re-confirm any you doubt, but do not ` +
    `discard the scan): ${JSON.stringify(verified)}.\n\n` +
    `Apply the autonomous triage policy: ${POLICY.review}\n\n` +
    `Project root ${projectRoot} is ABSOLUTE; resolve paths under it and run \`git -C ${projectRoot} …\`. Write ` +
    `schema-complete frontmatter. Return the terminal state (verdict + blockerCount, decisions, residual).` +
    CONTROL_FILE_RULE + deadDriverClause(idx.priorRun) + DECISION_CONTRACT +
    heartbeatClause(`review${sliceArg ? ':' + sliceArg : ''}`, 'Review', 'review', sliceArg),
    { schema: STAGE_RESULT, label: `review${sliceArg ? ':' + sliceArg : ''}`, phase: 'Review' }
  )
}

// runUpdateDepsExec() — the self-managed execution stage for workflow-type
// update-deps. update-deps does NOT decompose into /wf implement + /wf verify (those
// references redirect back to intake); its intake reference SELF-AUTHORS 05/06 in tier
// order. So yolo wraps intake/update-deps.md Steps 6–9 in ONE subagent — same "wrap,
// not fork" contract as runStage — with the Step 6 scope gate resolved by
// POLICY['update-deps'] (full plan, defer failures), self-authoring 05-implement.md +
// 06-verify.md, then STOPPING before review. Its terminal gate IS the verify gate, so
// it returns stage:'verify' — evaluateGate('verify') and collectDeferrals then treat it
// identically to a standard verify stage.
async function runUpdateDepsExec(idx) {
  return await agent(
    `Execute the SELF-MANAGED update-deps execution for slug '${slug}', FULLY AUTONOMOUSLY (no human in the loop).\n\n` +
    `${EOB}\n\n` +
    `Read ${referenceRoot}/intake/update-deps.md IN FULL and follow Steps 6–9 VERBATIM. Its scan/research/` +
    `prioritize/slice/plan (Steps 1–5) are ALREADY DONE on disk — 01-update-deps.md, 02-shape.md, 03-slice.md and ` +
    `04-plan.md are complete; you START at Step 6. Apply ONE override wherever the reference asks the user or pauses ` +
    `for a human — resolve it by this policy:\n\n${POLICY['update-deps']}${reChallengeClause(idx.priorDeferrals)}\n\n` +
    `Operating rules:\n` +
    `- Your mandate is ONLY the self-managed update-deps exec (05-implement.md + 06-verify.md) for slug '${slug}'. ` +
    `Do NOT run /wf review or /wf handoff, do NOT claim completion of the whole workflow, and do NOT recommend ` +
    `routes beyond what update-deps.md Steps 6–9 themselves return.\n` +
    `- Project root ${projectRoot} is ABSOLUTE. Resolve every artifact path under it and run git as ` +
    `\`git -C ${projectRoot} …\`. Do not rely on your working directory — it is not this repo.\n` +
    `- Write SCHEMA-COMPLETE frontmatter for 05-implement.md and 06-verify.md: a strict validator enforces the full ` +
    `sdlc/v1 contract and rejects an incomplete write. Match update-deps.md Step 7/8 field-for-field.\n` +
    `- Record EVERY autonomous decision into the artifacts (## Updated / ## Blocked / ## Held in 05-implement.md; ` +
    `## Test Result / ## Build / ## Blocked packages in 06-verify.md) so this run is exactly as auditable as a ` +
    `human-gated one. Nothing dies silently inside an artifact.\n` +
    `- STOP after writing 06-verify.md — do NOT route to /wf review or /wf handoff and do NOT run the review. yolo ` +
    `runs the slug-wide review as its own next stage.\n\n` +
    `Return the terminal state as a STAGE_RESULT with stage:'verify' (its gate IS the verify gate): status ` +
    `('complete' when 06 is convergence ∈ {not-needed, converged} with result pass or a deferral-only partial; ` +
    `'hard-stop' when the policy stopped you), artifactPath = the 06-verify.md path, and terminal ` +
    `{ convergence, result, deferrals ([] if none), substantiveResidual } — plus the decisions you recorded and ` +
    `any residual (blocked / held packages).` +
    CONTROL_FILE_RULE + deadDriverClause(idx.priorRun) + DECISION_CONTRACT +
    heartbeatClause('update-deps:exec', 'Drive', 'update-deps-exec', null),
    { schema: STAGE_RESULT, label: 'update-deps:exec', phase: 'Drive' }
  )
}

// driveUpdateDeps() — control flow for the self-managed update-deps class. One
// exec stage (self-authors 05 + 06) then the standard slug-wide review. Resume is
// free: a terminal-clean 05 AND 06 on disk skip the exec. The outcome mirrors the
// slug-wide endpoint shape so the shared collectDeferrals / hand-back path applies.
async function driveUpdateDeps(idx) {
  const entry = idx.slices[0] || {}
  const done = entry.stages || {}
  const ran = []
  let execProbeGaps = []   // ACs the exec deferred without a probe receipt — surfaced, not re-run (no round loop here)
  // 05 and 06 are authored together in one intake pass, so from yolo's view the exec
  // is one stage: skip it only when implement AND verify are both terminal-clean.
  if (done.implement === 'done' && done.verify === 'done') {
    log(`skip update-deps exec (05/06 already terminal-clean)`)
  } else {
    log(`yolo → update-deps self-managed exec ${slug} (self-authors 05/06)`)
    let exec = await runUpdateDepsExec(idx)
    // W3.3 — same corrective classification round the per-slice chain runs.
    if (exec && Array.isArray(exec.decisions) && exec.decisions.length) exec = await classifyDecisions(exec, idx)
    ran.push(exec)
    if (!exec || exec.status === 'hard-stop') {
      return { ok: false, mode: 'update-deps', stopped: true, stoppedAt: 'exec', reason: (exec && exec.hardStopReason) || 'update-deps self-managed exec stopped', ran, route: `address the exec blocker, then re-run /wf yolo ${slug}` }
    }
    if (evaluateGate('verify', exec) === 'hard-stop') {
      return { ok: false, mode: 'update-deps', stopped: true, stoppedAt: 'exec', reason: `update-deps verify did not clear the gate: ${JSON.stringify(exec.terminal || {})}`, ran, route: `address the verify residual, then re-run /wf yolo ${slug}` }
    }
    // No round loop on this path (the plan/exec is one pass), so a probe-less deferral is
    // surfaced in the hand-back rather than triggering a corrective re-run — the standard
    // verify path is where the corrective-round volume is. Revisit if the pattern recurs here.
    const g = probeGaps(exec.terminal || {}, exec.residual)
    if (g.length) {
      execProbeGaps = g.map(x => x.ac)
      log(`update-deps exec: ${g.length} deferral(s) carry no capability-probe receipt (${execProbeGaps.join(', ')}) — surfaced in the hand-back; re-run /wf verify (to attach receipts) or /wf probe in a capable environment`)
    }
  }
  // slug-wide review over the branch diff — same endpoint as the standard slug-wide path.
  log(`yolo → review ${slug} (slug-wide, update-deps)`)
  let rev = await driveReview(null, idx)
  if (rev && Array.isArray(rev.decisions) && rev.decisions.length) rev = await classifyDecisions(rev, idx)
  ran.push(rev)
  const stopped = !rev || rev.status === 'hard-stop' || evaluateGate('review', rev) === 'hard-stop'
  const probeGapsField = execProbeGaps.length ? { probeGaps: execProbeGaps } : {}
  return stopped
    ? { ok: false, mode: 'update-deps', stopped: true, stoppedAt: 'review', reason: (rev && rev.hardStopReason) || 'slug-wide review did not clear the gate', ran, slugWide: rev, ...probeGapsField, route: `address the review blockers, then re-run /wf yolo ${slug}` }
    : { ok: true, mode: 'update-deps', stopped: false, ran, slugWide: rev, ...probeGapsField, route: `/wf handoff ${slug}` }
}

// evaluateGate() — defensive double-check that a 'complete' status is backed by
// terminal fields that actually clear the gate (catches a subagent mis-report).
function evaluateGate(stage, res) {
  const t = (res && res.terminal) || {}
  if (stage === 'verify') {
    return verifyClean(t, res && res.residual) ? 'proceed' : 'hard-stop'   // same rule as driveVerify — deferral-only partial proceeds
  }
  if (stage === 'review') {
    return (t.verdict === 'ship' || t.verdict === 'ship-with-caveats') && (t.blockerCount || 0) === 0 ? 'proceed' : 'hard-stop'
  }
  return res && res.status === 'complete' ? 'proceed' : 'hard-stop'   // plan / implement / shape
}

// driveChain() — run stages sequentially for one slice, skipping any already
// terminal-clean on disk (free resume), gating each per policy, HARD-STOPping
// (and returning the trail) when the policy says so.
//
// W2.2: `bounded` marks a slice scheduled as a re-challenge sweep rather than as
// new work. Its verify runs as a cheap WALL PROBE first, and only escalates to a
// full verify dispatch for a reason the driver can name and records as a decision.
// W3.3: each stage's decisions pass through one corrective classification round.
// W5.2: a chain that completes writes the slice's status back to the control files.
async function driveChain(stages, sliceArg, idx, opts = {}) {
  const entry = idx.slices.find(s => s.slice === sliceArg)
  const done = (entry && entry.stages) || {}
  const ran = []
  const ranStages = []
  for (const stage of stages) {
    if (done[stage] === 'done') { log(`skip ${stage}:${sliceArg} (already terminal-clean)`); continue }

    // ---- W2.2 bounded re-verify -------------------------------------------
    // Only for a slice whose sole residue is an open deferral (reverifyReason
    // 'deferral-rechallenge'). Everything else drives normally.
    if (opts.bounded === true && stage === 'verify') {
      log(`yolo → wall-probe ${slug} ${sliceArg} (bounded re-challenge: slice is terminal-clean except its open deferral(s))`)
      const wp = await driveWallProbe(sliceArg, idx)
      if (wp) {
        const fell = (wp.walls || []).filter(w => w && w.stands === false)
        const stands = (wp.walls || []).filter(w => w && w.stands === true)
        // A named reason — or a wall that fell, so the evidence is producible now —
        // earns the full stage. Recorded as a decision so a later audit can see WHY
        // the driver chose to spend a verify here instead of moving on.
        const reason = wp.escalateReason && String(wp.escalateReason).trim()
          ? String(wp.escalateReason).trim()
          : (fell.length ? `${fell.length} wall(s) fell (${fell.map(w => w.ac).join(', ')}) — the evidence those AC need is producible now` : '')
        if (!reason) {
          log(`wall-probe:${sliceArg} — all ${stands.length} wall(s) still stand (fresh receipts attached); no full re-verify this run`)
          ran.push({
            stage: 'wall-probe', slice: sliceArg, status: 'complete', artifactPath: '', terminal: {},
            walls: wp.walls || [],
            decisions: [{
              class: 'implementation-detail',
              decision: `bounded re-challenge only: every recorded wall on '${sliceArg}' still stands under a fresh probe, so the slice was not re-verified this run`,
            }],
          })
          ranStages.push('wall-probe')
          continue
        }
        log(`wall-probe:${sliceArg} → escalating to a full verify: ${reason}`)
        ran.push({
          stage: 'wall-probe', slice: sliceArg, status: 'complete', artifactPath: '', terminal: {},
          walls: wp.walls || [],
          decisions: [{ class: 'implementation-detail', decision: `escalated '${sliceArg}' from bounded re-challenge to a full verify — ${reason}` }],
        })
        ranStages.push('wall-probe')
      }
      // fall through to the full verify dispatch below
    }

    log(`yolo → ${stage} ${slug} ${sliceArg}`)
    let res =
      stage === 'verify' ? await driveVerify(sliceArg, idx)
      : stage === 'review' ? await driveReview(sliceArg, idx)
      : await runStage(stage, sliceArg, idx)
    // W3.3 — one corrective classification round for decisions the stage left
    // unstamped. Read-only and cheap; never re-runs the stage itself.
    if (res && Array.isArray(res.decisions) && res.decisions.length) res = await classifyDecisions(res, idx)
    ran.push(res)
    ranStages.push(stage)
    if (!res || res.status === 'hard-stop') {
      return { stopped: true, at: stage, slice: sliceArg, ran, reason: (res && res.hardStopReason) || `${stage} stopped` }
    }
    if (evaluateGate(stage, res) === 'hard-stop') {
      return { stopped: true, at: stage, slice: sliceArg, ran, reason: `${stage} terminal state did not clear the gate: ${JSON.stringify(res.terminal || {})}` }
    }
  }
  // W5.2 — the chain cleared every gate: record the slice as complete at DRIVE
  // time. Only when this run actually drove something (a chain that skipped every
  // stage as already-done has nothing new to write back).
  if (ranStages.length) {
    const wb = await writeBackSliceStatus(sliceArg, idx, ranStages)
    if (wb && wb.ok) log(`slice '${sliceArg}' complete → wrote status back to ${(wb.wrote || ['(nothing)']).join(', ')}`)
    else log(`slice '${sliceArg}' complete but the status write-back did not confirm${wb && wb.note ? `: ${wb.note}` : ''} — /wf handoff will self-repair the index`)
  }
  return { stopped: false, slice: sliceArg, ran }
}

// collectDeferrals() — gather the runtime-evidence deferrals every verify stage
// recorded, across whichever shape this outcome took (slice mode → outcome.ran;
// slug mode → outcome.results[].ran). They are the run's ship-blocking residue:
// the hand-back names them so the user knows what /wf ship will refuse until a
// /wf probe (or a re-verify in a capable environment) clears each one.
function collectDeferrals(o) {
  const chains = Array.isArray(o.results) ? o.results : (o.ran ? [{ ran: o.ran }] : [])
  const out = []
  const seen = new Set()
  const push = (slice, ac, reason, probe) => {
    if (!ac) return
    // acKey-normalized so a labeled terminal copy and a bare residual copy of the
    // same AC count once (same normalization probeGaps uses).
    const key = `${slice || ''}::${acKey(ac)}`
    if (seen.has(key)) return
    seen.add(key)
    // `probe` (the capability-probe receipt) rides through to the ship-block hand-back so
    // /wf ship's block list and the run summary show RECEIPTED deferrals — omitted when absent.
    out.push(probe ? { slice, ac, reason, probe } : { slice, ac, reason })
  }
  for (const c of chains) {
    for (const r of (c && c.ran) || []) {
      if (!r || r.stage !== 'verify') continue
      const t = r.terminal || {}
      if (Array.isArray(t.deferrals)) for (const d of t.deferrals) push(r.slice || (d && d.slice), d && d.ac, d && d.reason, d && d.probe)
      // Verify subagents sometimes park the deferral in the sibling residual[] instead of
      // terminal.deferrals[] (the same mis-placement verifyClean now tolerates). Surface
      // those too — entries carrying an `ac` — so the run's ship-block hand-back isn't
      // blind to a mis-placed deferral. Enforcement is the 00-index registry the subagent
      // writes regardless of array; this only keeps the run summary honest. Dedup by
      // (slice, ac) so a deferral recorded in BOTH arrays counts once.
      if (Array.isArray(r.residual)) for (const d of r.residual) if (d && d.ac) push(r.slice || d.slice, d.ac, d.reason, d.probe)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// W3.2 — THE AGGREGATE MAY NOT CONTRADICT ITS INPUTS.
//
// The run report is a re-derivation: collectDeferrals walks the stage returns and
// decides what counts as a runtime-evidence deferral. When that re-derivation
// disagreed with what was actually RECORDED, the re-derivation won silently — and
// once told the user that an AC was a runtime-evidence deferral while the run's own
// recorded decision said the opposite ("stays a build-capability deferral, NOT
// runtime-evidence"). The user was steered into a `/wf probe` that could not
// possibly help.
//
// The rule is precedence, not cleverness: a classification RECORDED by a stage
// decision, or carried by the index's deferral ledger, is canonical over anything
// the driver re-derives. Where they disagree the ledger's answer is reported,
// annotated `reconciled` — never a silent re-label. Where they agree, nothing
// happens and nothing is reported.
//
// `runtimeEvidence` is the only classification that belongs in
// outcome.runtimeEvidenceDeferrals (that list is what /wf ship blocks on). Anything
// a decision classified otherwise — build-capability, scope, external-dependency —
// moves out of it and into `reconciled`, where it is still visible but no longer
// pointing the user at the wrong command.
// ---------------------------------------------------------------------------
function classificationIndex(o, priorDeferrals) {
  const map = new Map()   // acKey → { classification, source }
  // Lower precedence: the index ledger read at orientation.
  for (const d of (priorDeferrals || [])) {
    if (!d || !d.ac) continue
    const cls = d.classification || d.wallOwnership
    if (cls) map.set(acKey(d.ac), { classification: String(cls), source: 'index-ledger' })
  }
  // Higher precedence: a classification this run's own stage decisions recorded.
  const chains = Array.isArray(o && o.results) ? o.results : (o && o.ran ? [{ ran: o.ran }] : [])
  for (const c of chains) {
    for (const r of (c && c.ran) || []) {
      for (const d of (r && r.decisions) || []) {
        if (!d || !d.ac || !d.classification) continue
        map.set(acKey(d.ac), { classification: String(d.classification), source: 'recorded-decision' })
      }
    }
  }
  return map
}

// A classification counts as "this is a runtime-evidence deferral" only when it
// says so. Absent classification = no disagreement = leave the entry alone.
function isRuntimeEvidenceClass(cls) {
  const s = String(cls || '').trim().toLowerCase()
  if (!s) return true
  return s === 'runtime-evidence' || s === 'environment-negotiable' || s === 'external'
}

function reconcileDeferrals(o, deferrals, priorDeferrals) {
  const map = classificationIndex(o, priorDeferrals)
  if (!map.size) return { deferrals, reconciled: [] }
  const kept = []
  const reconciled = []
  for (const d of deferrals) {
    const rec = map.get(acKey(d && d.ac))
    if (!rec || isRuntimeEvidenceClass(rec.classification)) { kept.push(d); continue }
    reconciled.push({
      ...d,
      driverDerived: 'runtime-evidence',
      recordedClassification: rec.classification,
      source: rec.source,
      note: `the run's ${rec.source === 'recorded-decision' ? 'own recorded decision' : 'index deferral ledger'} classifies this as '${rec.classification}', not a runtime-evidence deferral — the recorded classification is canonical and this entry is NOT in the /wf ship block list`,
    })
  }
  return { deferrals: kept, reconciled }
}

// ---------------------------------------------------------------------------
// W3.2 (second half) — A FAIL SURVIVES INTO THE OUTCOME.
// The v9.134-era conflation ran the other way: verify recorded two ACs as
// substantive FAILS with zero deferrals, and the driver's outcome listed them as
// deferrals. A deferral is a promise that evidence is missing; a fail is a
// statement that the behavior is wrong. Reporting the second as the first tells the
// user to go collect evidence for a defect. So the run report carries verify's
// recorded fail semantics explicitly, beside the deferrals, never merged into them.
// ---------------------------------------------------------------------------
function collectSubstantiveFailures(o) {
  const chains = Array.isArray(o && o.results) ? o.results : (o && o.ran ? [{ ran: o.ran }] : [])
  const out = []
  for (const c of chains) {
    for (const r of (c && c.ran) || []) {
      if (!r || r.stage !== 'verify') continue
      const t = r.terminal || {}
      if (t.result === 'fail' || t.substantiveResidual === true) {
        out.push({ slice: r.slice || null, result: t.result || null, substantiveResidual: t.substantiveResidual === true, artifactPath: r.artifactPath || null })
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// W3.4 — HONEST ERROR ACCOUNTING. One run reported "0 errors" while 6 of 15
// subagents had hit recovered tool errors, including schema rejections refilled
// with ""/"n-a" junk. Two sources, both available to this script:
//   • self-reported: each subagent returns the errors it recovered from (the
//     script cannot see a subagent's tool history, so it asks).
//   • driver-observed: an agent() that returns null died or was skipped — that is
//     a FATAL error for that step, and the run already knows it.
// The count alone is this plan's scope. The junk-value schema refills are the
// EVIDENCE-SCHEMA-CONTRACT's surface (stage-conditional required fields) and are
// cited there, not redefined here.
// ---------------------------------------------------------------------------
function collectSubagentErrors(o) {
  const chains = Array.isArray(o && o.results) ? o.results : (o && o.ran ? [{ ran: o.ran }] : [])
  const agents = []
  let recovered = 0
  let fatal = 0
  const consider = (r) => {
    if (!r) { fatal++; agents.push({ agent: '(a subagent returned nothing — skipped or died after retries)', fatal: true }); return }
    const errs = Array.isArray(r.errors) ? r.errors : []
    if (!errs.length) return
    recovered += errs.length
    agents.push({ agent: `${r.stage || '?'}${r.slice ? ':' + r.slice : ''}`, recovered: errs.length, what: errs.map(e => (e && e.what) || '').filter(Boolean) })
  }
  for (const c of chains) for (const r of (c && c.ran) || []) consider(r)
  if (o && o.slugWide) consider(o.slugWide)
  if (!recovered && !fatal) return null
  return { recovered, fatal, agents }
}

// deferralPressure() — F3 hand-back rollup. Combines the OPEN prior deferrals orient read
// from 00-index (recorded by earlier runs) with THIS run's new deferrals into one pressure
// headline: { open, oldestDeferredAt, repeatWalls }. It makes the standing pile visible in
// every yolo hand-back instead of only inside artifacts — the bot-backend pattern (the same
// 22–24 live-voice ACs deferred run after run with no escalating visibility). Visibility
// only: NO new gate (plan.md's repeat-deferral tripwire already governs retirement).
// oldestDeferredAt is lexicographic-min over ISO-8601 strings (= chronological); yolo scripts
// have no clock, so only prior entries (read from disk) carry a date. Returns null when empty.
function deferralPressure(priorDeferrals, runDeferrals) {
  const prior = Array.isArray(priorDeferrals) ? priorDeferrals : []
  const run = Array.isArray(runDeferrals) ? runDeferrals : []
  if (!prior.length && !run.length) return null
  const seen = new Set()
  let open = 0, repeatWalls = 0, oldestDeferredAt = null
  const consider = (slice, key, deferredAt, repeatOf) => {
    const k = `${slice || ''}::${key || ''}`
    if (seen.has(k)) return
    seen.add(k)
    open++
    if (repeatOf) repeatWalls++
    if (deferredAt && (!oldestDeferredAt || String(deferredAt) < String(oldestDeferredAt))) oldestDeferredAt = deferredAt
  }
  for (const d of prior) consider(d && d.slice, d && d.reason, d && d.deferredAt, d && d.repeatOf)
  for (const d of run) consider(d && d.slice, (d && d.ac) ? acKey(d.ac) : (d && d.reason), null, null)
  return { open, oldestDeferredAt, repeatWalls }
}

// decisionDigest() — W11.1 end-of-run rollup. Groups EVERY autonomous decision the run
// recorded (across all chains) by its W4 class stamp (`class: implementation-detail`), so the
// human's post-run inspection is one structured section, not twelve artifacts. An
// intent-bearing stamp on an autonomous record is the tell that the policy overstepped —
// surfaced under `intentBearing` so it can't hide. Pure + extractable like the other rollups.
// W3.3 — `unclassified` IS A GAP, NOT A CLASS. The old shape defaulted a missing
// stamp to 'unclassified', counted it as just another bucket, and let the headline
// "intent-bearing: 0" absorb it. But an unclassified decision is precisely a
// decision nobody has checked for intent — folding it into the zero inverts what
// the number means. So it is counted separately, it never lands in `byClass`, and
// the guarantee it qualifies is stated: 'exact' when everything is classified,
// 'suspect' when anything is not.
function decisionDigest(o) {
  const chains = Array.isArray(o && o.results) ? o.results : (o && o.ran ? [{ ran: o.ran }] : [])
  const groups = {}
  let total = 0
  const intentBearing = []
  const unclassified = []
  for (const c of chains) {
    for (const r of (c && c.ran) || []) {
      for (const d of (r && r.decisions) || []) {
        if (!d) continue
        total++
        const cls = d.class && String(d.class).trim()
        if (!cls) {
          unclassified.push({ slice: r.slice, stage: r.stage, decision: d.decision || d.what || d.summary || '' })
          continue
        }
        groups[cls] = (groups[cls] || 0) + 1
        if (cls === 'intent-bearing') intentBearing.push({ slice: r.slice, stage: r.stage, decision: d.decision || d.what || d.summary || '' })
      }
    }
  }
  if (!total) return null
  return {
    total,
    byClass: groups,
    intentBearing,
    unclassified,
    // The load-bearing qualifier. 'suspect' means the run cannot honestly claim
    // zero intent-bearing escapes — some decisions were never checked.
    intentBearingGuarantee: unclassified.length ? 'suspect' : 'exact',
  }
}

// CHECKPOINT_RESULT — the charter fidelity checkpoint's structured return (W11.1).
const CHECKPOINT_RESULT = {
  type: 'object',
  required: ['commitments'],
  properties: {
    commitments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'status'],
        properties: {
          id: { type: 'string' },
          status: { enum: ['honored', 'at-risk', 'broken'] },
          note: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

// charterCheckpoint() — W11.1: every K slices, a cheap read-only subagent reads the charter
// and the last K implement artifacts and asks "is the build still advancing each commitment?".
// A `broken` verdict is a stop; at-risk is surfaced. Read-only — it never writes.
async function charterCheckpoint(idx, throughSlice) {
  const charterList = (idx.charter || []).map(c => `${c.id}: ${c.commitment}`).join('\n    ')
  return await agent(
    `CHARTER FIDELITY CHECKPOINT (W11) for slug '${slug}', after slice '${throughSlice}'. READ-ONLY — do not ` +
    `write, edit, or commit. Project root ${projectRoot} is ABSOLUTE; run git as \`git -C ${projectRoot} …\`.\n\n` +
    `The intake committed to these charter commitments:\n    ${charterList}\n\n` +
    `Read the last few implement artifacts under ${projectRoot}/.ai/workflows/${slug}/ and inspect the built ` +
    `code they touched. For EACH commitment, judge whether the build so far is still ADVANCING it: 'honored' ` +
    `(the code visibly serves it), 'at-risk' (drifting — a decision has weakened it), or 'broken' (the code ` +
    `now contradicts it — e.g. the intake said the model owns a decision and the code hard-codes it). Return ` +
    `{ commitments: [{id, status, note}], summary }. Judge against the CODE, not the artifacts' claims.` +
    heartbeatClause(`checkpoint:${throughSlice}`, 'Drive', 'charter-checkpoint', throughSlice),
    { schema: CHECKPOINT_RESULT, label: `checkpoint:${throughSlice}`, phase: 'Drive' }
  )
}

// clearingTripwire() — W4.2 rollup. orient ran each open deferral's recorded
// `clearing-probe` (one bounded command apiece) and reported whether the event
// looks satisfied. This turns the hits into a hand-back line. It is a TRIPWIRE and
// nothing more: no deferral is cleared, no index is edited, no gate moves. The
// probe stage still owns evidence — this only ensures that an event which has
// quietly come true gets NOTICED, instead of an AC shipping uncleared while its
// emulator sat booted on the same screen.
function clearingTripwire(priorDeferrals) {
  const hits = (priorDeferrals || []).filter(d => d && d.clearingProbeHit === true && d.authorized !== true)
  if (!hits.length) return null
  return hits.map(d => ({
    slice: d.slice || null,
    ac: d.ac || null,
    clearingEvent: d.clearingEvent || null,
    clearingProbe: d.clearingProbe || null,
  }))
}

// ===========================================================================
// Control flow
// ===========================================================================
phase('Orient')
log(`yolo: orienting slug '${slug}'${slice ? ` slice '${slice}'` : ' (slug mode)'}`)
let idx = await orient()
if (!idx) {
  // A null return means the orient subagent was skipped or died on a terminal
  // API error after retries — NOT a workflow-readiness problem. Resume is free,
  // so the route is simply to re-run.
  return { ok: false, stopped: true, transient: true, reason: 'orient did not return (subagent skipped or hit a transient API error) — re-run to retry; resume skips completed stages', route: `/wf yolo ${slug}${slice ? ' ' + slice : ''}` }
}
// W1 — adopt the runId orient minted (this script has no clock of its own) so every
// later heartbeat is attributable to THIS run.
RUN_ID = (idx.runId && String(idx.runId).trim()) || `run-${slug}`
// W1.2/W1.3 — say what the PREVIOUS driver's journal shows, before anything else.
// Silence is the finding: a driver that died leaves a journal that simply stops, and
// the whole point is that this is now stated rather than inferred away.
const priorDriver = idx.priorRun && idx.priorRun.present === true ? idx.priorRun : null
if (priorDriver && priorDriver.presumedDead === true) {
  log(`prior driver PRESUMED DEAD — journal silent since ${priorDriver.lastEntryAt} (${Math.round(priorDriver.minutesSinceLastEntry || 0)} min; its own longest gap was ${Math.round(priorDriver.longestGapMinutes || 0)} min), last seen at ${priorDriver.lastStage || 'an unknown stage'}${priorDriver.lastSlice ? ` on '${priorDriver.lastSlice}'` : ''}. Its partial writes are treated as suspect: every stage re-reads control files fresh before editing.`)
} else if (priorDriver && priorDriver.completed === true) {
  log(`prior driver for this slug completed at ${priorDriver.lastEntryAt} — resuming from its recorded state`)
}
if (!idx.ok) {
  return { ok: false, stopped: true, mode: idx.mode, reason: idx.blockReason || 'workflow not ready (intake/shape/slice/plan incomplete, or a terminal-analysis type with no decided build)', route: idx.route, ...(priorDriver ? { priorDriver } : {}) }
}
// Branch posture — DEDICATED only. Land the tree on the slug branch (create it from
// base-branch if it does not exist yet) BEFORE driving any stage, so the whole run —
// plan included — happens on the dedicated branch rather than leaving implement to
// mint it mid-chain. shared/none never switch: the drive runs on the checked-out tree.
let branchAction = null
if (idx.branch.strategy === 'dedicated' && !idx.branch.match) {
  const b = await ensureBranch(idx)
  if (!b || !b.ok) {
    return { ok: false, stopped: true, reason: (b && b.reason) || 'dedicated branch posture could not be resolved', route: `resolve the dedicated branch '${idx.branch.target}' (currently on '${idx.branch.current}'), then re-run /wf yolo ${slug}${slice ? ' ' + slice : ''}` }
  }
  if (b.switched) {
    const from = b.from || idx.branch.base || idx.branch.current
    branchAction = { action: b.action || 'switched', target: idx.branch.target, base: from }
    log(`branch: ${b.action === 'created' ? `created '${idx.branch.target}' from '${from}'` : `switched to '${idx.branch.target}'`} before drive`)
  }
}

phase('Drive')
let outcome

if (idx.workflowType === 'update-deps') {
  // ---- Self-managed class — update-deps drives its own tier-ordered exec. --
  // Not a per-slice chain: one exec (self-authors 05/06) then slug-wide review.
  outcome = await driveUpdateDeps(idx)
} else if (idx.mode === 'slice') {
  // ---- Slice mode — drive one slice, then route to the next. -------------
  const stages = idx.reviewScope === 'per-slice'
    ? ['plan', 'implement', 'verify', 'review']
    : ['plan', 'implement', 'verify']           // slug-wide: stop before review (it runs once, later)
  const chain = await driveChain(stages, idx.targetSlice, idx)
  const sliceList = idx.slices.map(s => s.slice)
  const i = sliceList.indexOf(idx.targetSlice)
  const next = i >= 0 && i < sliceList.length - 1 ? sliceList[i + 1] : null
  let route
  if (chain.stopped) {
    route = `address the gate at '${chain.at}', then re-run /wf yolo ${slug} ${idx.targetSlice}`
  } else if (next) {
    route = `/wf yolo ${slug} ${next}`
  } else {
    route = idx.reviewScope === 'slug-wide' ? `/wf yolo ${slug}` : `/wf handoff ${slug}`   // last slice → finalizer
  }
  outcome = { ok: !chain.stopped, mode: 'slice', slice: idx.targetSlice, reviewScope: idx.reviewScope, stopped: chain.stopped, stoppedAt: chain.at, reason: chain.reason, ran: chain.ran, route }
} else {
  // ---- Slug mode — sequential over the roster (mirrors /wf auto). --------
  // Cross-slice IMPLEMENT serializes on the shared tree (the governing
  // principle: serialize anything that writes code). Plan fan-out is ON by
  // default (pass planFanout: false to opt out): plan subagents write ONLY
  // their per-slice 04-plan file, and the DRIVER records plan completion in
  // 00-index.md as the single writer — the old 00-index write race is closed
  // by construction, not by retry.
  if (OPT.planFanout !== false) {
    const unplanned = idx.slices.filter(s => (s.stages || {}).plan !== 'done' && s.status !== 'skipped')
    if (unplanned.length > 1) {
      log(`plan fan-out: planning ${unplanned.length} un-planned slices concurrently (per-slice writes only; the driver is the single 00-index writer)`)
      const planned = await parallel(unplanned.map(s => () => runStage('plan', s.slice, idx, { noIndexWrites: true })))
      const done = planned.filter(r => r && r.status === 'complete').map((r, i) => r.slice || unplanned[i].slice)
      if (done.length) {
        await agent(
          `PLAN FAN-OUT BOOKKEEPING for slug '${slug}'. The driver just planned these slices concurrently and ` +
          `each plan subagent wrote ONLY its per-slice 04-plan artifact (index writes were withheld so this step ` +
          `is the single writer).\n\n${EOB}\n\n` +
          `In ${projectRoot}/.ai/workflows/${slug}/00-index.md, for EACH of these slices — ${done.join(', ')} — ` +
          `record the plan stage as done in its slices[] entry (matching the convention already used by completed ` +
          `stages in this index), and refresh updated-at. Change NOTHING else.` +
          CONTROL_FILE_RULE +
          `\n\nReturn { ok, wrote: [<files changed>], note }.`,
          { schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, wrote: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } } }, label: 'plan-index-writeback', phase: 'Drive' }
        )
      }
      idx = await orient()                          // re-snapshot so driveChain sees the new plans as done
      if (!idx || !idx.ok) return { ok: false, stopped: true, reason: (idx && idx.blockReason) || 're-orient after plan fan-out failed', route: idx && idx.route }
    }
  }

  const reviewPer = idx.reviewScope === 'per-slice'
  const perSliceStages = reviewPer ? ['plan', 'implement', 'verify', 'review'] : ['plan', 'implement', 'verify']
  const results = []
  const CHECKPOINT_EVERY = 3   // W11.1 default K
  const charterCheckpoints = []

  // ---- W2.1 — THE WORK THIS RUN EXISTS FOR GOES FIRST. -------------------
  // The re-challenge law (a stale wall must be re-probed) is correct, but it was
  // running as a PREFIX of the roster walk. So a driver launched for a slug-wide
  // review spent its whole life re-verifying already terminal-clean slices — its
  // own orientation had even predicted "the substantive work this run is the
  // slug-wide review" — and then died before starting it. Nothing was wrong with
  // the re-challenge; it was scheduled ahead of the target.
  //
  // Partition, then order: real work → the run's target (the slug-wide review) →
  // the bookkeeping sweep, all in the SAME run. Re-challenging a wall changes what
  // is proven about a slice, never what the slice's diff contains, so the review
  // reads the same code whichever side of it the sweep runs on.
  const isSweep = (s) => s && s.reverifyReason === 'deferral-rechallenge'
  const primary = idx.slices.filter(s => !isSweep(s))
  const sweep = idx.slices.filter(isSweep)
  if (sweep.length) {
    log(`work ordering: ${primary.filter(s => s.status !== 'skipped').length} slice(s) with real work run first; ${sweep.length} terminal-clean slice(s) whose only residue is an open deferral are re-challenged AFTER the target, as a bounded wall probe rather than a full re-verify`)
  }

  // driveRoster() — walk one partition. Returns a stop-outcome, or null when the
  // whole list cleared. `bounded` marks the re-challenge sweep (W2.2).
  async function driveRoster(list, bounded) {
    for (let si = 0; si < list.length; si++) {
      const s = list[si]
      // An already-skipped roster entry (00-index slices[].status: skipped, with its
      // skip record) has nothing to drive — walking it into verify HARD-STOPs the
      // whole run at a slice a human already retired. Skip it, keep it countable.
      if (s.status === 'skipped') {
        log(`slice '${s.slice}' is status: skipped in the roster — skipping (a skip record retires it; nothing to drive)`)
        results.push({ slice: s.slice, skipped: true, ran: [], stopped: false })
        continue
      }
      const chain = await driveChain(perSliceStages, s.slice, idx, { bounded })
      results.push(chain)
      if (chain.stopped) {
        return { ok: false, mode: 'slug', reviewScope: idx.reviewScope, stopped: true, stoppedAt: chain.at, stoppedSlice: s.slice, reason: chain.reason, results, route: `address the gate at '${chain.at}' on slice '${s.slice}', then re-run /wf yolo ${slug}` }
      }
      // W11.1 — charter fidelity checkpoint every K slices (not after the last, which the
      // slug-wide review + final scenario cover). A `broken` commitment stops the run.
      // Only on the primary pass: the sweep builds nothing, so it cannot drift a charter.
      const isLast = si === list.length - 1
      if (!bounded && (idx.charter || []).length && !isLast && (si + 1) % CHECKPOINT_EVERY === 0) {
        const cp = await charterCheckpoint(idx, s.slice)
        if (cp) {
          charterCheckpoints.push({ throughSlice: s.slice, ...cp })
          const broken = (cp.commitments || []).filter(c => c && c.status === 'broken')
          const atRisk = (cp.commitments || []).filter(c => c && c.status === 'at-risk')
          if (atRisk.length) log(`charter checkpoint after '${s.slice}': ${atRisk.length} commitment(s) at-risk — ${atRisk.map(c => c.id).join(', ')}`)
          if (broken.length) {
            return { ok: false, mode: 'slug', reviewScope: idx.reviewScope, stopped: true, stoppedAt: 'charter-checkpoint', stoppedSlice: s.slice, reason: `charter commitment(s) BROKEN after '${s.slice}': ${broken.map(c => `${c.id} (${c.note || 'no note'})`).join('; ')} — the build has departed from what the intake committed to; a human must re-decide before continuing`, results, charterCheckpoints, route: `read the broken commitment(s), decide whether to re-shape or accept, then re-run /wf yolo ${slug}` }
          }
        }
      }
    }
    return null
  }

  outcome = await driveRoster(primary, false)
  if (!outcome) {
    if (reviewPer) {
      // Endpoint: every per-slice review clean. Stop before handoff.
      outcome = { ok: true, mode: 'slug', reviewScope: 'per-slice', stopped: false, results, route: `/wf handoff ${slug}` }
    } else {
      // slug-wide: every slice verified → ONE slug-wide review over the branch diff.
      // This is the run's TARGET, so it runs before the re-challenge sweep.
      log(`yolo → review ${slug} (slug-wide)`)
      const rev = await driveReview(null, idx)
      const stopped = !rev || rev.status === 'hard-stop' || evaluateGate('review', rev) === 'hard-stop'
      outcome = stopped
        ? { ok: false, mode: 'slug', reviewScope: 'slug-wide', stopped: true, stoppedAt: 'review', reason: (rev && rev.hardStopReason) || 'slug-wide review did not clear the gate', results, slugWide: rev, route: `address the review blockers, then re-run /wf yolo ${slug}` }
        : { ok: true, mode: 'slug', reviewScope: 'slug-wide', stopped: false, results, slugWide: rev, route: `/wf handoff ${slug}` }
    }
  }
  // The bounded re-challenge sweep, last — after the target, in the same run. A
  // stop here is real (a wall that fell now needs evidence the slice cannot yet
  // produce), but it can no longer starve the work the run was launched for.
  if (!outcome.stopped && sweep.length) {
    const swept = await driveRoster(sweep, true)
    if (swept) outcome = { ...swept, sweptAfterTarget: true }
  }
  // W11.1 — surface the charter checkpoints on the slug hand-back (both the stop and the endpoint).
  if (charterCheckpoints.length && !outcome.charterCheckpoints) outcome.charterCheckpoints = charterCheckpoints
}

// W3.2 — collect, then RECONCILE against what was actually recorded. The driver's
// re-derivation never overrides a classification a stage decision or the index
// ledger already made; where they disagree the recorded answer is reported and the
// disagreement is named, so the aggregate can no longer contradict its own inputs.
const collected = collectDeferrals(outcome)
const { deferrals, reconciled } = reconcileDeferrals(outcome, collected, idx.priorDeferrals)
if (deferrals.length) {
  outcome.runtimeEvidenceDeferrals = deferrals
  log(`runtime-evidence deferrals on this run: ${deferrals.length} — review/handoff proceed; /wf ship blocks until each is cleared by /wf probe or a re-verify in a capable environment`)
}
if (reconciled.length) {
  outcome.reconciled = reconciled
  log(`reconciled ${reconciled.length} deferral classification(s) against the recorded ledger: ${reconciled.map(r => `${r.ac} is '${r.recordedClassification}' per the ${r.source}, not a runtime-evidence deferral`).join('; ')} — reported, never silently re-labeled`)
}
// W3.2 — verify's recorded FAIL semantics survive into the outcome, beside the
// deferrals and never merged into them. A fail says the behavior is wrong; a
// deferral says evidence is missing. Reporting the first as the second sends the
// user to collect evidence for a defect.
const failures = collectSubstantiveFailures(outcome)
if (failures.length) {
  outcome.substantiveFailures = failures
  log(`substantive verify failures this run: ${failures.length} (${failures.map(f => f.slice || 'slug').join(', ')}) — these are DEFECTS, not deferrals, and no /wf probe will clear them`)
}
// W3.4 — honest error accounting. "0 errors" may no longer coexist with subagents
// that hit rejected writes or schema retries and recovered.
const subagentErrors = collectSubagentErrors(outcome)
if (subagentErrors) {
  outcome.subagentErrors = subagentErrors
  log(`subagent errors this run: ${subagentErrors.recovered} recovered, ${subagentErrors.fatal} fatal across ${subagentErrors.agents.length} agent(s) — recovered errors did not change any verdict, but the run does not claim zero`)
}
// W4 — clearing-event tripwire: an event that already came true gets NOTICED.
const tripwire = clearingTripwire(idx.priorDeferrals)
if (tripwire) {
  outcome.clearingEventsSatisfied = tripwire
  log(`clearing-event tripwire: ${tripwire.length} open deferral(s) appear ALREADY CLEARED by their recorded clearing-probe (${tripwire.map(t => `${t.slice || '?'}/${t.ac || '?'}`).join(', ')}) — run /wf probe ${slug} to capture the evidence; nothing was cleared automatically`)
}
// W1 — the previous driver's fate rides on the hand-back, so a resuming session
// never has to guess (and never gets to guess wrong).
if (priorDriver) outcome.priorDriver = priorDriver
if (RUN_ID) outcome.runId = RUN_ID
outcome.journal = JOURNAL_PATH
// F3 rollup — standing deferral pressure across prior (index) + this run, made visible here.
const pressure = deferralPressure(idx.priorDeferrals, deferrals)
if (pressure && pressure.open > 0) {
  outcome.deferralPressure = pressure
  const bits = [`${pressure.open} open`]
  if (pressure.oldestDeferredAt) bits.push(`oldest since ${pressure.oldestDeferredAt}`)
  if (pressure.repeatWalls) bits.push(`${pressure.repeatWalls} repeat-of wall(s)`)
  log(`deferral pressure: ${bits.join(', ')} — surfaced so the pile does not hide inside artifacts; plan's repeat-deferral tripwire governs retirement`)
}
if (branchAction) outcome.branch = branchAction   // surface the up-front create/switch in the hand-back
// W11.1 — decision digest: every autonomous decision this run recorded, grouped by W4 class,
// so the human's post-run inspection is structured, not archaeological.
const digest = decisionDigest(outcome)
if (digest) {
  outcome.decisionDigest = digest
  const parts = Object.entries(digest.byClass).map(([k, n]) => `${n} ${k}`).join(', ') || 'none classified'
  // W3.3 — the guarantee is stated with its qualifier attached. "0 intent-bearing
  // escapes" out of 173 decisions means nothing if 40 of them were never checked.
  const guarantee = digest.unclassified.length
    ? `intent-bearing escapes: ${digest.intentBearing.length} — SUSPECT: ${digest.unclassified.length} decision(s) could not be classified and are NOT covered by that number; review them`
    : `intent-bearing escapes: ${digest.intentBearing.length} (every decision classified)`
  log(`autonomous decisions this run: ${digest.total} (${parts}) — ${guarantee}`)
}
log(outcome.stopped ? `yolo HARD-STOP at ${outcome.stoppedAt || 'orient'}: ${outcome.reason}` : `yolo reached the endpoint — next: ${outcome.route}`)
return outcome
