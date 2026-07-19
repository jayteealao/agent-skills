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
//   reviewFanout  (optional, default false) Phase-3 parallel-dimension review
//   planFanout    (optional, default false) plan all slices concurrently first
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
    `DEFER-DON'T-CANCEL for UN-PRODUCIBLE runtime evidence — this RESTATES verify.md's deferral law (§"Climb the ` +
    `constraint-resolution ladder", §"Escape hatch"); it does NOT relax it. A deferral is lawful ONLY over a ` +
    `PROBED incapability, never a bare excuse:\n` +
    `  1. CLIMB THE LADDER FIRST. "No device / no display / no creds / no service" is the START of a ` +
    `constraint-resolution climb (runtime-adapters.md), not a defer-reason. Execute any tool bootstrap the plan's ` +
    `## Verification Strategy authorized, record the highest rung that produced evidence, and defer ONLY the ` +
    `residual no rung can reach. Headless/emulator/container rungs are real evidence; reach for them before ` +
    `deferring (headless runtimes boot by default — see runtime-adapters.md).\n` +
    `  2. ATTEMPT BEFORE DECLARE. "The environment cannot produce X" is writable ONLY after you EXECUTE a ` +
    `capability probe THIS run and record its literal command + one-line output tail — e.g. \`firebase ` +
    `projects:list\`, \`adb devices\`, an env-var check for a keyed service, one spec run past the guard for a ` +
    `credential-gated suite. A defer-reason with no recorded probe is INVALID. The defer-reason must also ` +
    `enumerate the rungs tried (bare phrases — "no emulator", "no creds", "deferred to user", "decidable by ` +
    `static reasoning" — are rejected).\n` +
    `  3. NEVER INHERIT A PRIOR DEFERRAL. A defer-reason from a prior artifact, prior slice, or prior run is a ` +
    `CLAIM to re-test, not a fact. Re-run its probe fresh in THIS run: if the wall no longer stands, produce the ` +
    `evidence now; if it still stands, attach THIS run's probe receipt. Copying forward a stale wall (the Crumb ` +
    `stale-creds incident) is the failure this guard exists to stop.\n` +
    `  4. A SKIPPED OR GUARD-EXITED SPEC IS NOT EVIDENCE for the AC it gates. Treat that AC as un-evidenced: climb ` +
    `to another rung, or defer with a probe receipt, or write result: blocked-runtime-evidence-missing naming the ` +
    `unmet precondition. An all-skipped sweep (0 specs executed) is blocked-runtime-evidence-missing, NEVER a ` +
    `deferral.\n` +
    `When a deferral is lawful under 1–4, apply verify.md's escape hatch for that AC: set ` +
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
    `Then self-author 06-verify.md by running the FULL suite + build against the updated state. Apply the SAME ` +
    `runtime-evidence deferral LAW as the verify policy: a deferral is lawful ONLY over a PROBED incapability — ` +
    `climb the constraint-resolution ladder (runtime-adapters.md) first; the defer-reason must enumerate the ` +
    `rungs tried and include the literal capability-probe command + output tail executed THIS run; never inherit a ` +
    `prior run's defer-reason (re-probe it fresh); and a skipped/guard-exited spec is not evidence for the AC it ` +
    `gates (an all-skipped sweep is blocked-runtime-evidence-missing, never a deferral). For a lawfully deferred ` +
    `AC record it in 00-index.md runtime-evidence-deferrals, write result: partial (NOT ` +
    `blocked-runtime-evidence-missing), keep substantiveResidual false. STOP after 06-verify.md — do NOT route to ` +
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
    decisions: { type: 'array', items: { type: 'object' } },   // recorded autonomous calls
    residual: { type: 'array', items: { type: 'object' } },    // deferred / could-not-fix
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
    `(= repeat-of, omit if absent) }. Omit already-cleared entries. Empty/absent list → priorDeferrals: [].\n` +
    `   ALSO parse the \`charter\` list (if present) into charter as { id, commitment (verbatim), status }. ` +
    `Empty/absent (e.g. a compressed lifecycle) → charter: [].\n` +
    `2. Read ${projectRoot}/.ai/workflows/${slug}/03-slice.md (the roster). Capture EVERY slice slug in roster ` +
    `order. If 03-slice.md is ABSENT and the workflow is SINGLE-SCOPE (selected-slice is set on 00-index.md — true ` +
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
    `   - verify: artifact present AND convergence ∈ {not-needed, converged} AND result: pass\n` +
    `   - review: artifact present AND verdict ∈ {ship, ship-with-caveats} AND metric-findings-blocker == 0\n` +
    `   In slug-wide review scope, mark every per-slice 'review' as 'n-a' (review runs once at slug level, not per slice).\n` +
    `7. Branch posture (READ-ONLY — report, never switch or create): run ` +
    `\`git -C ${projectRoot} branch --show-current\`. Report branch.current, branch.target (= 00-index.md branch), ` +
    `branch.base (= base-branch), branch.strategy (= branch-strategy: dedicated | shared | none), branch.match ` +
    `(current === target, or target empty), and branch.exists — true iff branch.target resolves as a local ref ` +
    `(\`git -C ${projectRoot} rev-parse --verify --quiet refs/heads/<target>\`) OR an already-fetched ` +
    `remote-tracking ref (refs/remotes/origin/<target>); do NOT run \`git fetch\` or \`git ls-remote\` (no network). ` +
    `For strategy shared/none, or an empty target, set exists=false — yolo will not switch in those modes.\n\n` +
    `Return the structured orientation. Set ok=true only when the readiness gate passes.`,
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
    `Report the action you took.`,
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
    `${POLICY[stage]}${roundClause}${probeClause}${reChallenge}${scopeHint}\n\n` +
    `Operating rules:\n` +
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
    `status:'hard-stop' with hardStopReason.\n\n` +
    `Return the terminal state: stage, slice, status ('complete' when the gate is clean, 'hard-stop' when the ` +
    `policy stopped you), the primary artifactPath, and terminal fields — plan/implement: statusField; verify: ` +
    `convergence + result + deferrals ([{ac, reason, probe}] — ACs deferred for un-producible runtime evidence, ` +
    `each with the literal capability-probe command + output tail you ran THIS round to establish the wall; [] if ` +
    `none) + substantiveResidual (true iff an AC fails/partials for a CODE reason); review: verdict + blockerCount ` +
    `(= metric-findings-blocker, OPEN) — plus the decisions you recorded and any residual ` +
    `(deferred / could-not-fix) findings.`,
    { schema: STAGE_RESULT, label: `${stage}${sliceArg ? ':' + sliceArg : ''}`, phase: 'Drive' }
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
  const probed = new Set()       // ac → some copy carries a non-empty probe
  const gapEntry = new Map()     // ac → first probe-less entry seen (dedupe by ac)
  const scan = (arr) => {
    if (!Array.isArray(arr)) return
    for (const d of arr) {
      if (!d || !d.ac) continue   // ac-less notes are not deferrals — ignored (matches collectDeferrals)
      if (typeof d.probe === 'string' && d.probe.trim() !== '') probed.add(d.ac)
      else if (!gapEntry.has(d.ac)) gapEntry.set(d.ac, d)
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
      const gaps = probeGaps(t, last.residual)
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

// driveReview() — default: wrap review.md in ONE subagent (it fans out the
// dimensions internally per the reference, and produces the accumulating
// ledger). Opt-in (args.reviewFanout): hoist the dimension scan to the workflow
// for true parallelism + adversarial verify, then delegate the WRITE/triage/fix/
// ledger back to a wrapped review.md subagent given the pre-verified findings.
async function driveReview(sliceArg, idx) {
  if (OPT.reviewFanout !== true) {
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
    `schema-complete frontmatter. Return the terminal state (verdict + blockerCount, decisions, residual).`,
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
    `any residual (blocked / held packages).`,
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
    const exec = await runUpdateDepsExec(idx)
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
  const rev = await driveReview(null, idx)
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
async function driveChain(stages, sliceArg, idx) {
  const entry = idx.slices.find(s => s.slice === sliceArg)
  const done = (entry && entry.stages) || {}
  const ran = []
  for (const stage of stages) {
    if (done[stage] === 'done') { log(`skip ${stage}:${sliceArg} (already terminal-clean)`); continue }
    log(`yolo → ${stage} ${slug} ${sliceArg}`)
    const res =
      stage === 'verify' ? await driveVerify(sliceArg, idx)
      : stage === 'review' ? await driveReview(sliceArg, idx)
      : await runStage(stage, sliceArg, idx)
    ran.push(res)
    if (!res || res.status === 'hard-stop') {
      return { stopped: true, at: stage, slice: sliceArg, ran, reason: (res && res.hardStopReason) || `${stage} stopped` }
    }
    if (evaluateGate(stage, res) === 'hard-stop') {
      return { stopped: true, at: stage, slice: sliceArg, ran, reason: `${stage} terminal state did not clear the gate: ${JSON.stringify(res.terminal || {})}` }
    }
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
    const key = `${slice || ''}::${ac}`
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
  for (const d of run) consider(d && d.slice, (d && d.ac) || (d && d.reason), null, null)
  return { open, oldestDeferredAt, repeatWalls }
}

// decisionDigest() — W11.1 end-of-run rollup. Groups EVERY autonomous decision the run
// recorded (across all chains) by its W4 class stamp (`class: implementation-detail`), so the
// human's post-run inspection is one structured section, not twelve artifacts. An
// intent-bearing stamp on an autonomous record is the tell that the policy overstepped —
// surfaced under `intentBearing` so it can't hide. Pure + extractable like the other rollups.
function decisionDigest(o) {
  const chains = Array.isArray(o && o.results) ? o.results : (o && o.ran ? [{ ran: o.ran }] : [])
  const groups = {}
  let total = 0
  const intentBearing = []
  for (const c of chains) {
    for (const r of (c && c.ran) || []) {
      for (const d of (r && r.decisions) || []) {
        if (!d) continue
        total++
        const cls = (d.class && String(d.class).trim()) || 'unclassified'
        groups[cls] = (groups[cls] || 0) + 1
        if (cls === 'intent-bearing') intentBearing.push({ slice: r.slice, stage: r.stage, decision: d.decision || d.what || d.summary || '' })
      }
    }
  }
  if (!total) return null
  return { total, byClass: groups, intentBearing }
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
    `{ commitments: [{id, status, note}], summary }. Judge against the CODE, not the artifacts' claims.`,
    { schema: CHECKPOINT_RESULT, label: `checkpoint:${throughSlice}`, phase: 'Drive' }
  )
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
if (!idx.ok) {
  return { ok: false, stopped: true, mode: idx.mode, reason: idx.blockReason || 'workflow not ready (intake/shape/slice/plan incomplete, or a terminal-analysis type with no decided build)', route: idx.route }
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
  // principle: serialize anything that writes code). Optional read-only plan
  // fan-out is opt-in (args.planFanout) — it races the shared 00-index.md, so
  // it stays off until artifact-parity vs the sequential path is validated.
  if (OPT.planFanout === true) {
    log('plan fan-out (opt-in): planning all un-planned slices concurrently — note: races 00-index.md writes')
    await parallel(idx.slices.filter(s => (s.stages || {}).plan !== 'done').map(s => () => runStage('plan', s.slice, idx)))
    idx = await orient()                          // re-snapshot so driveChain sees the new plans as done
    if (!idx || !idx.ok) return { ok: false, stopped: true, reason: (idx && idx.blockReason) || 're-orient after plan fan-out failed', route: idx && idx.route }
  }

  const reviewPer = idx.reviewScope === 'per-slice'
  const perSliceStages = reviewPer ? ['plan', 'implement', 'verify', 'review'] : ['plan', 'implement', 'verify']
  const results = []
  const CHECKPOINT_EVERY = 3   // W11.1 default K
  const charterCheckpoints = []
  let brokenCharter = null
  for (let si = 0; si < idx.slices.length; si++) {
    const s = idx.slices[si]
    const chain = await driveChain(perSliceStages, s.slice, idx)
    results.push(chain)
    if (chain.stopped) {
      outcome = { ok: false, mode: 'slug', reviewScope: idx.reviewScope, stopped: true, stoppedAt: chain.at, stoppedSlice: s.slice, reason: chain.reason, results, route: `address the gate at '${chain.at}' on slice '${s.slice}', then re-run /wf yolo ${slug}` }
      break
    }
    // W11.1 — charter fidelity checkpoint every K slices (not after the last, which the
    // slug-wide review + final scenario cover). A `broken` commitment stops the run.
    const isLast = si === idx.slices.length - 1
    if ((idx.charter || []).length && !isLast && (si + 1) % CHECKPOINT_EVERY === 0) {
      const cp = await charterCheckpoint(idx, s.slice)
      if (cp) {
        charterCheckpoints.push({ throughSlice: s.slice, ...cp })
        const broken = (cp.commitments || []).filter(c => c && c.status === 'broken')
        const atRisk = (cp.commitments || []).filter(c => c && c.status === 'at-risk')
        if (atRisk.length) log(`charter checkpoint after '${s.slice}': ${atRisk.length} commitment(s) at-risk — ${atRisk.map(c => c.id).join(', ')}`)
        if (broken.length) {
          brokenCharter = { throughSlice: s.slice, broken }
          outcome = { ok: false, mode: 'slug', reviewScope: idx.reviewScope, stopped: true, stoppedAt: 'charter-checkpoint', stoppedSlice: s.slice, reason: `charter commitment(s) BROKEN after '${s.slice}': ${broken.map(c => `${c.id} (${c.note || 'no note'})`).join('; ')} — the build has departed from what the intake committed to; a human must re-decide before continuing`, results, charterCheckpoints, route: `read the broken commitment(s), decide whether to re-shape or accept, then re-run /wf yolo ${slug}` }
          break
        }
      }
    }
  }
  if (!outcome) {
    if (reviewPer) {
      // Endpoint: every per-slice review clean. Stop before handoff.
      outcome = { ok: true, mode: 'slug', reviewScope: 'per-slice', stopped: false, results, route: `/wf handoff ${slug}` }
    } else {
      // slug-wide: every slice verified → ONE slug-wide review over the branch diff.
      log(`yolo → review ${slug} (slug-wide)`)
      const rev = await driveReview(null, idx)
      const stopped = !rev || rev.status === 'hard-stop' || evaluateGate('review', rev) === 'hard-stop'
      outcome = stopped
        ? { ok: false, mode: 'slug', reviewScope: 'slug-wide', stopped: true, stoppedAt: 'review', reason: (rev && rev.hardStopReason) || 'slug-wide review did not clear the gate', results, slugWide: rev, route: `address the review blockers, then re-run /wf yolo ${slug}` }
        : { ok: true, mode: 'slug', reviewScope: 'slug-wide', stopped: false, results, slugWide: rev, route: `/wf handoff ${slug}` }
    }
  }
  // W11.1 — surface the charter checkpoints on the slug hand-back (both the stop and the endpoint).
  if (charterCheckpoints.length && !outcome.charterCheckpoints) outcome.charterCheckpoints = charterCheckpoints
}

const deferrals = collectDeferrals(outcome)
if (deferrals.length) {
  outcome.runtimeEvidenceDeferrals = deferrals
  log(`runtime-evidence deferrals on this run: ${deferrals.length} — review/handoff proceed; /wf ship blocks until each is cleared by /wf probe or a re-verify in a capable environment`)
}
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
  const parts = Object.entries(digest.byClass).map(([k, n]) => `${n} ${k}`).join(', ')
  log(`autonomous decisions this run: ${digest.total} (${parts})${digest.intentBearing.length ? ` — ${digest.intentBearing.length} stamped intent-bearing (should have been a stop; inspect)` : ''}`)
}
log(outcome.stopped ? `yolo HARD-STOP at ${outcome.stoppedAt || 'orient'}: ${outcome.reason}` : `yolo reached the endpoint — next: ${outcome.route}`)
return outcome
