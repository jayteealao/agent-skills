export const meta = {
  name: 'wf-yolo',
  description: 'Autonomous SDLC lifecycle driver. Drives an already-intaked slug through plan→implement→verify→review with NO human gates — resolves each stage gate by a written Autonomous Decision Policy, records every decision into the artifact, and stops before handoff exactly like /wf auto. Claude-only (built on the Workflow tool, which the Codex runtime lacks).',
  phases: [
    { title: 'Orient', detail: 'read 00-index + roster; resolve scope, file convention, branch, resume point' },
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
if (!args || typeof args !== 'object') {
  return { ok: false, stopped: true, reason: 'yolo requires args { projectRoot, referenceRoot, slug, [slice] } with absolute paths.' }
}
const { projectRoot, referenceRoot, slug } = args
const slice = args.slice && String(args.slice).trim() ? String(args.slice).trim() : null
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
    `proceed (re-running is intended). After the one round, set the terminal state HONESTLY: ` +
    `convergence: not-needed (no issues found) | converged (issues fixed, none remain) | escalated (issues ` +
    `remain). result: pass | fail | partial | blocked-runtime-evidence-missing. NEVER fabricate runtime ` +
    `evidence — if a user-observable AC needs interactive proof the environment cannot produce, record ` +
    `result: blocked-runtime-evidence-missing. Do not weaken the user-observable AC gate. Return status:'complete' ` +
    `only when convergence ∈ {not-needed, converged} AND result: pass; otherwise return status:'hard-stop'.`,
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
    fileConvention: { enum: ['suffixed', 'unsuffixed'] },
    branch: {
      type: 'object',
      required: ['current', 'target', 'match'],
      properties: {
        current: { type: 'string' },
        target: { type: 'string' },
        base: { type: 'string' },
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
    `(default 'per-slice' if the field is absent), workflow-type, branch, base-branch.\n` +
    `2. Read ${projectRoot}/.ai/workflows/${slug}/03-slice.md (the roster). Capture EVERY slice slug in roster order.\n` +
    `3. Resolve fileConvention: 'suffixed' for a multi-slice standard workflow that has per-slice ` +
    `03-slice-<slice>.md files (so stage files are 04-plan-<slice>.md, 06-verify-<slice>.md, 07-review-<slice>.md); ` +
    `'unsuffixed' for a change-mode (workflow-type fix|hotfix|refactor) or a single-scope standard workflow (one ` +
    `slice, only a 04-plan.md master) where stage files are 04-plan.md, 06-verify.md, 07-review.md.\n` +
    `4. Determine mode: 'slice' if a target slice was given, else 'slug'. In slice mode, confirm the target slice ` +
    `is in the roster — if not, set ok=false, blockReason, route='/wf slice ${slug}'.\n` +
    `5. READINESS GATE (yolo never runs intake/shape autonomously — they own product-owner alignment): ` +
    `01-intake.md must exist and not be status: awaiting-input; 02-shape.md must exist; 03-slice.md must exist. ` +
    `If any is missing or awaiting-input, set ok=false with blockReason and route='/wf intake <description>' (or ` +
    `'/wf shape ${slug}' / '/wf slice ${slug}' for the specific gap). Also: if workflow-type is 'update-deps', ` +
    `set ok=false, route='/wf intake update-deps ${slug}' (yolo does not drive that self-managed mode).\n` +
    `6. For each IN-SCOPE slice (the target slice in slice mode; ALL roster slices in slug mode), check on disk ` +
    `which of plan/implement/verify/review already exist AND are terminal-clean, marking each 'done' | 'todo':\n` +
    `   - plan: artifact present AND frontmatter status: complete\n` +
    `   - implement: artifact present AND status: complete\n` +
    `   - verify: artifact present AND convergence ∈ {not-needed, converged} AND result: pass\n` +
    `   - review: artifact present AND verdict ∈ {ship, ship-with-caveats} AND metric-findings-blocker == 0\n` +
    `   In slug-wide review scope, mark every per-slice 'review' as 'n-a' (review runs once at slug level, not per slice).\n` +
    `7. Branch posture: run \`git -C ${projectRoot} branch --show-current\`. Report branch.current, branch.target ` +
    `(= 00-index.md branch), branch.base (= base-branch), and branch.match (current === target, or target empty). ` +
    `Do NOT switch — just report.\n\n` +
    `Return the structured orientation. Set ok=true only when the readiness gate passes.`,
    { schema: ORIENT_RESULT, label: 'orient', phase: 'Orient' }
  )
}

// ensureBranch() — only when orient reports a mismatch. Policy: switch if it is
// safe; HARD-STOP (never stash/force) if the switch would clobber uncommitted work.
async function ensureBranch(idx) {
  return await agent(
    `Autonomous branch posture for SDLC slug '${slug}'. The working tree is on '${idx.branch.current}' but the ` +
    `workflow targets '${idx.branch.target}'. Attempt exactly: \`git -C ${projectRoot} switch ${idx.branch.target}\`.\n` +
    `- Success → return { ok: true, switched: true }.\n` +
    `- git REFUSES because uncommitted changes would be overwritten → DO NOT stash or force. Return ` +
    `{ ok: false, reason: 'switching to ${idx.branch.target} would clobber uncommitted work on ${idx.branch.current}' }.\n` +
    `- Target branch does not exist → return { ok: false, reason: 'target branch ${idx.branch.target} does not exist' }.\n` +
    `Make no commits and change nothing else.`,
    {
      schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, switched: { type: 'boolean' }, reason: { type: 'string' } } },
      label: 'branch', phase: 'Orient',
    }
  )
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
  const scopeHint =
    stage === 'review'
      ? ` Review scope is '${idx.reviewScope}' (per 00-index.md): ${idx.reviewScope === 'slug-wide'
          ? 'write the single 07-review.md over the whole branch diff (git diff ' + (idx.branch.base || '<base>') + '...HEAD)'
          : 'write 07-review-' + sliceArg + '.md over git diff HEAD for this slice'}.`
      : ''
  return await agent(
    `Execute the SDLC '${stage}' stage for slug '${slug}'${sliceClause}, FULLY AUTONOMOUSLY (no human in the loop).\n\n` +
    `${EOB}\n\n` +
    `Read ${referenceRoot}/${stage}.md IN FULL and follow it VERBATIM to do the stage's real work and write its ` +
    `artifact(s) under ${projectRoot}/.ai/workflows/${slug}/ — with ONE override: wherever the reference tells you ` +
    `to ask the user (AskUserQuestion) or pause for a human, DO NOT. Resolve it yourself by this policy:\n\n` +
    `${POLICY[stage]}${roundClause}${scopeHint}\n\n` +
    `Operating rules:\n` +
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
    `convergence + result; review: verdict + blockerCount (= metric-findings-blocker, OPEN) — plus the decisions ` +
    `you recorded and any residual (deferred / could-not-fix) findings.`,
    { schema: STAGE_RESULT, label: `${stage}${sliceArg ? ':' + sliceArg : ''}`, phase: 'Drive' }
  )
}

// driveVerify() — verify gets up to N=2 autonomous fix rounds (the reference
// does one fix round per invocation; a second invocation is round 2). Still
// escalated after round 2, or runtime evidence unproducible → HARD-STOP.
async function driveVerify(sliceArg, idx) {
  let last
  for (let round = 1; round <= 2; round++) {
    last = await runStage('verify', sliceArg, idx, { round })
    if (!last) return { stage: 'verify', slice: sliceArg, status: 'hard-stop', artifactPath: '', terminal: {}, hardStopReason: 'verify subagent returned nothing' }
    if (last.status === 'hard-stop') return last
    const t = last.terminal || {}
    if (t.result === 'blocked-runtime-evidence-missing') {
      return { ...last, status: 'hard-stop', hardStopReason: 'user-observable AC has no runtime evidence and the environment cannot produce it (never fabricated)' }
    }
    const clean = (t.convergence === 'converged' || t.convergence === 'not-needed') && t.result === 'pass'
    if (clean) return last
    log(`verify:${sliceArg} round ${round} → convergence=${t.convergence} result=${t.result}`)
    if (round === 2) {
      return { ...last, status: 'hard-stop', hardStopReason: 'verify did not converge after 2 autonomous fix rounds' }
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
  if (args.reviewFanout !== true) {
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

// evaluateGate() — defensive double-check that a 'complete' status is backed by
// terminal fields that actually clear the gate (catches a subagent mis-report).
function evaluateGate(stage, res) {
  const t = (res && res.terminal) || {}
  if (stage === 'verify') {
    return (t.convergence === 'converged' || t.convergence === 'not-needed') && t.result === 'pass' ? 'proceed' : 'hard-stop'
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

// ===========================================================================
// Control flow
// ===========================================================================
phase('Orient')
log(`yolo: orienting slug '${slug}'${slice ? ` slice '${slice}'` : ' (slug mode)'}`)
let idx = await orient()
if (!idx || !idx.ok) {
  return { ok: false, stopped: true, mode: idx && idx.mode, reason: (idx && idx.blockReason) || 'orientation failed (could not read 00-index.md / roster)', route: idx && idx.route }
}
if (!idx.branch.match) {
  const b = await ensureBranch(idx)
  if (!b || !b.ok) {
    return { ok: false, stopped: true, reason: (b && b.reason) || 'branch posture could not be resolved', route: `resolve the branch on '${idx.branch.current}', then re-run /wf yolo ${slug}${slice ? ' ' + slice : ''}` }
  }
}

phase('Drive')
let outcome

if (idx.mode === 'slice') {
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
  if (args.planFanout === true) {
    log('plan fan-out (opt-in): planning all un-planned slices concurrently — note: races 00-index.md writes')
    await parallel(idx.slices.filter(s => (s.stages || {}).plan !== 'done').map(s => () => runStage('plan', s.slice, idx)))
    idx = await orient()                          // re-snapshot so driveChain sees the new plans as done
    if (!idx || !idx.ok) return { ok: false, stopped: true, reason: (idx && idx.blockReason) || 're-orient after plan fan-out failed', route: idx && idx.route }
  }

  const reviewPer = idx.reviewScope === 'per-slice'
  const perSliceStages = reviewPer ? ['plan', 'implement', 'verify', 'review'] : ['plan', 'implement', 'verify']
  const results = []
  for (const s of idx.slices) {
    const chain = await driveChain(perSliceStages, s.slice, idx)
    results.push(chain)
    if (chain.stopped) {
      outcome = { ok: false, mode: 'slug', reviewScope: idx.reviewScope, stopped: true, stoppedAt: chain.at, stoppedSlice: s.slice, reason: chain.reason, results, route: `address the gate at '${chain.at}' on slice '${s.slice}', then re-run /wf yolo ${slug}` }
      break
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
}

log(outcome.stopped ? `yolo HARD-STOP at ${outcome.stoppedAt || 'orient'}: ${outcome.reason}` : `yolo reached the endpoint — next: ${outcome.route}`)
return outcome
