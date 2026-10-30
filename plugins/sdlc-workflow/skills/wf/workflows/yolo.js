export const meta = {
  name: 'wf-yolo',
  description: 'Autonomous SDLC lifecycle driver. Drives an already-intaked slug through plan→implement→verify→review. Each stage agent gets a brief built by code (the stage card, the slice, the plan section, the decisions in scope), settles implementation detail itself, and returns an intent-bearing decision as a question: the run stops, the main session asks and records the answer, and the next run carries it. Stops before ship. Runs on Claude Code (Workflow), pi (SubagentWorkflow) and Codex (wf.mjs drive).',
  phases: [
    { title: 'Orient', detail: 'read 00-index + roster; resolve scope, file convention, branch posture (create/switch dedicated), resume point' },
    { title: 'Drive', detail: 'sequential plan→implement→verify[→review] per slice; questions stop the run' },
    { title: 'Review', detail: 'default: parallel per-dimension scouts + a refuter for every finding, merged into the findings ledger (reviewFanout: false opts out)' },
  ],
}

// ===========================================================================
// /wf yolo — the autonomous lifecycle driver.
//
// yolo settles each implementation-detail gate itself, by the `## Card` of the
// stage reference, and stops only for an intent-bearing decision.
//
// The Workflow runtime gives THIS SCRIPT no filesystem access — only agent()
// subagents have tools. So every artifact write is done by a stage subagent
// that reads the SAME on-disk reference the manual command reads and follows it
// verbatim. It starts from its brief (`wf.mjs brief`), which code builds from the
// records. The script is pure orchestration: orient → select stage → run it as a
// subagent → gate on its structured return → loop.
//
// QUESTIONS. No call continues a parked agent, so a question ends the run: the
// stage finishes its artifact as awaiting-input and returns the question with a
// key, the options and a recommended option. The main session asks the person,
// records the answer with `wf.mjs decide add`, and launches the next run with
// args.answered. The stage that asked runs again with the answer.
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
//   answered      (optional) the answers of the questions that stopped the last run, each
//                 { key, id (the decision id), question, answer, by, stage, slice }
//   delegate      (optional, default false) the person delegated the intent-bearing decisions
//                 of this run: a stage settles each by its recommended option and records it
//                 with --by delegate, and the run asks nothing
//   host          (optional, default 'claude') the host that runs this script: 'claude' (the
//                 Workflow tool), 'pi' (pi-subagents' workflow runner) or 'codex' (wf.mjs drive)
//   runId         (optional) the run id of this run, from a caller that has a clock (wf.mjs
//                 drive); absent, the orient agent mints one
//   reviewFindings (optional, default false) the walk put defects of a fidelity row or a
//                 try-out in the findings ledger: the slug-wide review fixes them and scans
//                 only its own fix commits
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
const DELEGATE = OPT.delegate === true
const HOST = ['claude', 'pi', 'codex'].includes(OPT.host) ? OPT.host : 'claude'
const GIVEN_RUN_ID = typeof OPT.runId === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(OPT.runId.trim()) ? OPT.runId.trim() : null
// The answers that the main session recorded since the last run. Each reaches the stage that asked it.
const ANSWERED = (Array.isArray(OPT.answered) ? OPT.answered : []).filter(a => a && typeof a === 'object' && String(a.answer || '').trim())
for (const [k, v] of Object.entries({ projectRoot, referenceRoot, slug })) {
  if (!v || typeof v !== 'string' || !v.trim()) {
    // Phase-0 caveat 1: never let a path arg be undefined — it silently writes into cwd.
    return { ok: false, stopped: true, reason: `yolo: required arg '${k}' is missing. Pass an absolute path/slug; a relative or undefined value would write artifacts into the wrong tree.` }
  }
}

// Model and reasoning effort for every agent() call. Explicit ids, because an alias
// can lag a new release. OPUS: orient, the plan/implement/verify stages, the
// review writer, and update-deps exec. HAIKU: the bookkeeping agents, which run
// fixed commands or copy data and judge nothing. SONNET: every other agent.
// On pi and Codex the three tiers name no model: each agent runs on the model of the
// session (pi) or of the Codex config (Codex), at the tier's effort. The models block
// still names a model per stage on every host.
const tier = (model, effort) => (HOST === 'claude' ? { model, effort } : { effort })
// Codex has no file-read tool: there, one shell command that prints the whole file is the read.
const READ_TOOL = HOST === 'codex' ? 'one shell command that prints the whole file (`Get-Content -Raw <path>` or `cat <path>`)' : 'the file-read tool'
const SHELL_READ = HOST === 'codex' ? '' : 'a shell read, '
const SONNET = tier('claude-sonnet-5-5', 'high')
const OPUS = tier('claude-opus-5-5', 'medium')
const HAIKU = tier('claude-haiku-5-5', 'medium')
// The model of each stage agent comes from the `models` block of .ai/sdlc-config.json,
// passed in the args. A stage names an alias or any model id that the host can run; an
// id runs at the effort of Opus. A stage that is not named runs on Opus.
const MODELS = OPT.models && typeof OPT.models === 'object' ? OPT.models : {}
const MODEL_ALIASES = { opus: OPUS, sonnet: SONNET, haiku: HAIKU }
function stageModel(stage) {
  const m = typeof MODELS[stage] === 'string' ? MODELS[stage].trim() : ''
  if (!m) return OPUS
  return MODEL_ALIASES[m] || { model: m, effort: OPUS.effort }
}

// Implement commits each plan step and records it with `wf.mjs step` in the slug's
// steps.jsonl; a re-run resumes after the last committed step. One implement agent runs
// the whole slice. A slice whose implement hard-stopped SPLIT_AFTER_STOPS times stops with
// a split question.
const SPLIT_AFTER_STOPS = 2
// An answered stage can send the slice back to its plan or its implement at most this often in one run.
const MAX_ROUTE_BACKS = 2
// After its fix steps, the slug-wide review scans only its own fix commits, at most this often.
const REVIEW_CHECK_PASSES = 2

// WF-SYSTEM-REVIEW C5: the charter checkpoint runs only after work that touched the charter:
// a stage result with an intent-bearing decision, or a decision that names a charter id.
// The unit review and the wave fidelity are the intent checks of their levels.
// WF-SYSTEM-REVIEW C6: one refuter checks up to REFUTE_GROUP_SIZE findings of one rubric, so
// it pays its cold start once for several findings. Over `limit` refuters, the groups grow.
const REFUTE_GROUP_SIZE = 4
function refuteGroups(raw, limit) {
  for (let size = REFUTE_GROUP_SIZE; ; size++) {
    const byRubric = new Map()
    for (const f of raw) {
      const r = f.rubric || '?'
      if (!byRubric.has(r)) byRubric.set(r, [])
      byRubric.get(r).push(f)
    }
    const groups = []
    for (const list of byRubric.values()) for (let i = 0; i < list.length; i += size) groups.push(list.slice(i, i + size))
    if (groups.length <= limit || size >= raw.length) return groups
  }
}

function touchesCharter(results, charter) {
  const ids = (charter || []).map(c => c && c.id).filter(Boolean)
  return (results || []).some(r => ((r && r.decisions) || []).some(d => d && (d.class === 'intent-bearing' ||
    ids.some(id => String(d.decision || '').split(/[^A-Za-z0-9]+/).includes(id)))))
}

// The step record of implement, through `wf.mjs step` (implement/_steps.md).
function implementStepsClause(wfCmd, slice, retry) {
  const step = (rest) => `\`${wfCmd} step ${rest}\``
  return `\n\nSTEP COMMITS. Before any step, run ${step(`where "${projectRoot}" ${slug} ${slice}`)}: continue at ` +
    `the next open step it names, and never redo a done step. Before each plan step, run ` +
    `${step(`start "${projectRoot}" ${slug} ${slice} <n> --title "<the step title>"`)}. Commit each step with a ` +
    `conventional commit about the product, \`<type>: <what the step does>\` (feat, fix, test, refactor or docs), ` +
    `that names no slug, slice, step number or finding id. After you commit it, run ` +
    `${step(`done "${projectRoot}" ${slug} ${slice} <n> --sha HEAD`)}. When you hard-stop, run ` +
    `${step(`stop "${projectRoot}" ${slug} ${slice} --reason "<one line>"`)}. After the final commit of the slice, ` +
    `run ${step(`complete "${projectRoot}" ${slug} ${slice} --sha HEAD`)}.` +
    (retry ? ` The person answered the split question with a retry: before any other work, run ${step(`retry "${projectRoot}" ${slug} ${slice}`)}.` : '')
}


// ---------------------------------------------------------------------------
// STANDING STEERING — every agent that judges or writes reads the steer entries FRESH.
// Stage agents read them through their stage reference, but the driver's own
// agents (rubric selection, scouts, refuters, wall probe, classifier, charter
// checkpoint) are prompted by this script and never ran the command. A
// steering veto the scouts cannot see is a veto the review cannot enforce.
// The clause names the COMMAND, never a copy of the entries: the person may add
// an entry while the run drives, and each agent that starts after it must see it.
// A snapshot taken at orient would freeze the entries for the whole run.
// Bookkeeping agents (branch, write-back, index write-back, run end) get no
// clause: they change no code and judge nothing a steering entry governs.
// ---------------------------------------------------------------------------
function steeringClause(steerCmd, role, contractPath) {
  const head = `\n\nSTANDING STEERING. The user keeps standing instructions for this workflow in its decision ` +
    `store. Run \`${steerCmd}\` NOW — never use a copy in a prompt or from an earlier run: the user can add an ` +
    `entry while this run drives. If it prints no entries, there is no steering: skip the rest of this block ` +
    `and return no steering fields. The contract is ${contractPath}. No ` +
    `human gate in this run repeats these entries, so the store is the user's voice here. A steering VETO ` +
    `outranks every autonomous-policy default in this prompt. Steering never overrides a mandatory gate (the ` +
    `External Output Boundary, AC verifiability, the constraint-resolution rule), ` +
    `never authorizes a deferral, and never waives a dont-ship verdict.`
  if (role === 'writer') {
    return head +
      `\n- Honor each entry. A preference tilts an autonomous choice; a satisfiable constraint is obeyed. Never ` +
      `take an action a veto forbids, even when the policy above allows it.\n` +
      `- An entry may pre-answer a NAMED intent-bearing question: settle that one decision by the entry and ` +
      `record the entry as its answer. An entry never gives standing leave to settle intent-bearing decisions in ` +
      `general.\n` +
      `- Record what you honored in the stage artifact's \`steering-honored:\` frontmatter list, and return the ` +
      `same list as steeringHonored.\n` +
      `- When an entry conflicts with the stage contract, is impossible for this stage, or is ambiguous, or when ` +
      `the only way to finish crosses a veto: do not obey it into a broken state and do not ignore it. Finish ` +
      `the artifact honestly (status: awaiting-input, the conflict recorded), return status:'hard-stop' with ` +
      `hardStopReason 'steering: <what conflicts>', and return steeringConflict quoting the entry.\n` +
      `- When you dispatch a sub-agent, copy the entries that bear on its task into its prompt.`
  }
  if (role === 'scout') {
    return head +
      ` Your rubric is STEERING COMPLIANCE. For each entry, check the diff against it. A change that crosses a ` +
      `veto (touches what the entry forbids, adds what it rejects) is a finding with severity HIGH. A change that ` +
      `goes against a preference is a finding with severity MED. Quote the entry in the issue. Report nothing ` +
      `for an entry the diff does not touch; with no entries, return findings: [].`
  }
  if (role === 'refute') {
    return head +
      ` A finding that quotes a steering entry is refuted ONLY when the diff does not contradict that entry as ` +
      `the store states it now. "The code works" or "the change is reasonable" does not refute it: the entry is ` +
      `the user's rule. A finding whose fix would cross a veto is still real; say so in reason.`
  }
  if (role === 'classify') {
    return head +
      ` A decision that contradicts an entry is 'intent-bearing'. A decision an entry pre-answers by name keeps ` +
      `the class the six tests give it; say in why which entry answered it.`
  }
  if (role === 'checkpoint') {
    return head +
      ` Also judge the built code against each entry. Return steeringViolations: one { entry (quoted), kind ` +
      `('veto' when the entry forbids something, 'preference' otherwise), note } for each entry the code ` +
      `contradicts; [] when none does or there are no entries.`
  }
  // 'context' — read-only agents whose choices must stay inside the entries.
  return head +
    ` Keep your work inside these entries: never run a command, recommend an action, or select an option an ` +
    `entry forbids. When an entry names a concern your task covers, weigh it.`
}

// steeringDigest() — the hand-back's steering line: what each stage said it honored,
// the stages that stopped on a steering conflict, and the checkpoint violations.
// Null when nothing in the run reported steering (no steer entry, or no entry applied).
function steeringDigest(o) {
  const chains = Array.isArray(o && o.results) ? o.results : (o && o.ran ? [{ ran: o.ran }] : [])
  const stages = chains.flatMap(c => (c && c.ran) || [])
  if (o && o.slugWide) stages.push(o.slugWide)
  const honored = []
  const conflicts = []
  for (const r of stages) {
    if (!r) continue
    for (const h of r.steeringHonored || []) {
      if (h && String(h).trim()) honored.push({ slice: r.slice || null, stage: r.stage, honored: String(h).trim() })
    }
    if (r.steeringConflict && String(r.steeringConflict).trim()) {
      conflicts.push({ slice: r.slice || null, stage: r.stage, entry: String(r.steeringConflict).trim() })
    }
  }
  const violations = ((o && o.charterCheckpoints) || [])
    .flatMap(cp => ((cp && cp.steeringViolations) || []).map(v => ({ throughSlice: cp.throughSlice, ...v })))
  if (!honored.length && !conflicts.length && !violations.length) return null
  return { honored, conflicts, violations }
}

// Y6 — THE REQUIRES TABLE IS A CHECKLIST. Yolo stage agents read their own reference
// almost always, then skipped what it points to: the shape in 8–18% of implement,
// verify and review runs, procedure files in 3–58%. Nothing in the run noticed. The
// stage reference's `## Requires` table now names every input. No hook checks the
// reads, so the prompt asks the agent to read the table before it writes.
function requiresClause(refPath) {
  return `\n\nREQUIRED READS. The \`## Requires\` table in ${refPath} is a CHECKLIST, defined by ` +
    `${referenceRoot}/_requires.md. Before you write the stage artifact, read every row whose When value applies ` +
    `to this run — each whole-file input from its first line to its last, each named section in full — yourself, ` +
    `with ${READ_TOOL}. Read a record row with \`${REC('get')} <name>\` (its whole output), or from your brief when ` +
    `the brief gives its content. A search hit, ${SHELL_READ}a partial read, or a sub-agent's read does not count. ` +
    `A \`mode:<name>\` row applies when its mode applies to this run: list every mode you ran under in the stage ` +
    `artifact's \`modes:\` frontmatter (for example \`modes: [deferral]\`). A mode also applies when its disk fact ` +
    `holds (section "Modes" of ${referenceRoot}/_requires.md lists them), even when \`modes:\` leaves it out. ` +
    `Keep reading ${refPath} in full as well.`
}

// S6 — a dispatch prompt that carries the full text of a Requires input names it, so the
// writer of the named output path counts it as read.
function promptFedLine(inputs, outputPath) {
  const list = (inputs || []).filter(Boolean)
  if (!list.length) return ''
  return `\n\nPrompt-fed inputs: ${list.join(', ')}\nOutput artifact: ${outputPath}`
}

// Liveness of the PREVIOUS driver, judged in code from the journal entries orient reports.
// The yardstick is the run's own cadence: past its longest inter-entry gap (and a 20-minute
// floor, so a run with one slow first agent is not called dead), a newest entry that is an
// agent-start means that agent never returned and its writes may be half-finished
// (presumedDead); a newest agent-end means every agent returned (stoppedCleanly). Entries
// of THIS run (ownRunId) are excluded: orient writes its own heartbeat before it reads.
// An unparseable clock yields neither verdict — a journal that exists proves nothing.
function judgeLiveness(journal, ownRunId) {
  if (!journal || journal.present !== true || !Array.isArray(journal.entries)) return { present: false }
  const all = journal.entries
    .filter(e => e && typeof e.at === 'string' && !Number.isNaN(Date.parse(e.at)) && (!ownRunId || e.run !== ownRunId))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  if (!all.length) return { present: false }
  const newest = all[all.length - 1]
  const entries = newest.run ? all.filter(e => e.run === newest.run) : all
  let longestGapMinutes = 0
  for (let i = 1; i < entries.length; i++) {
    longestGapMinutes = Math.max(longestGapMinutes, (Date.parse(entries[i].at) - Date.parse(entries[i - 1].at)) / 60000)
  }
  const now = Date.parse(journal.nowAt || '')
  const minutesSinceLastEntry = Number.isNaN(now) ? 0 : Math.max(0, (now - Date.parse(newest.at)) / 60000)
  const quiet = !Number.isNaN(now) && minutesSinceLastEntry > Math.max(longestGapMinutes, 20)
  const out = {
    present: true,
    runId: newest.run || journal.runId || '',
    lastEntryAt: newest.at,
    lastEvent: newest.event || '',
    lastStage: newest.stage || '',
    lastSlice: newest.slice || '',
    minutesSinceLastEntry,
    longestGapMinutes,
    presumedDead: quiet && newest.event === 'agent-start',
    stoppedCleanly: quiet && newest.event === 'agent-end',
  }
  if (newest.event === 'agent-end' && newest.status) out.lastStatus = newest.status
  return out
}

function deadDriverClause(priorRun) {
  if (!priorRun || priorRun.presumedDead !== true) return ''
  return `\n\nDEAD-DRIVER RECONCILIATION. A previous driver for this slug is PRESUMED DEAD (its journal went ` +
    `silent at ${priorRun.lastEntryAt || 'an unknown time'}, mid-${priorRun.lastStage || 'stage'}` +
    `${priorRun.lastSlice ? ` on slice '${priorRun.lastSlice}'` : ''}). Treat every artifact and control-file ` +
    `write it may have made as SUSPECT and possibly half-finished: re-read each record you touch with ` +
    `\`${REC('get')} <name>\` before you change it, and if what you find contradicts what the index claims, trust ` +
    `the stage record and correct the index with \`${REC('set')} index key=value ...\`. Do not assume the previous run left a consistent state.`
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
  // An item that a live decision accepts is cleared, whatever its kind: a decision of the person, a
  // standing answer, or a delegate accept. The verify agent lists it in acceptedItems with the id of
  // that decision, and keeps it out of substantiveResidual. Missing evidence that is not deferred is
  // never accepted this way.
  if (Array.isArray(t.acceptedItems) && t.acceptedItems.length > 0 && t.substantiveResidual !== true &&
    t.result !== 'blocked-runtime-evidence-missing') return true
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
// ~500k tokens per recurrence). But verify/_deferrals.md §"Attempt before declare" requires a
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

// evaluateGate() — defensive double-check that a 'complete' status is backed by
// terminal fields that actually clear the gate (catches a subagent mis-report).
function evaluateGate(stage, res) {
  const t = (res && res.terminal) || {}
  if (stage === 'verify') {
    return verifyClean(t, res && res.residual) ? 'proceed' : 'hard-stop'   // same rule as driveVerify — deferral-only partial proceeds
  }
  if (stage === 'review') {
    // The review fixes every finding itself: only a BLOCKER that it could not fix stops the run.
    if (typeof t.couldNotFixBlockers === 'number') return t.couldNotFixBlockers === 0 ? 'proceed' : 'hard-stop'
    return (t.verdict === 'ship' || t.verdict === 'ship-with-caveats') && (t.blockerCount || 0) === 0 ? 'proceed' : 'hard-stop'
  }
  return res && res.status === 'complete' ? 'proceed' : 'hard-stop'   // plan / implement / shape
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
    // The doubtful decisions that a stage settled because they can be undone inside the packet.
    contested: chains.flatMap(c => ((c && c.ran) || []).flatMap(r => ((r && r.decisions) || [])
      .filter(d => d && d.contested === true).map(d => ({ slice: r.slice, stage: r.stage, decision: d.decision || '' })))),
    // The load-bearing qualifier. 'suspect' means the run cannot honestly claim
    // zero intent-bearing escapes — some decisions were never checked.
    intentBearingGuarantee: unclassified.length ? 'suspect' : 'exact',
  }
}

// The verify items that a live decision accepted this run, from every verify result.
function acceptedResiduals(o) {
  const chains = Array.isArray(o && o.results) ? o.results : (o && o.ran ? [{ ran: o.ran }] : [])
  const out = []
  for (const c of chains) {
    for (const r of (c && c.ran) || []) {
      const t = (r && r.terminal) || {}
      for (const a of Array.isArray(t.acceptedItems) ? t.acceptedItems : []) {
        if (a && a.item) out.push({ slice: r.slice || null, item: String(a.item), by: String(a.by || '?') })
      }
    }
  }
  return out
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

// walkOrder() — the walk order of a roster (WF-CAMPAIGN-SLICE-ORDER-PLAN 4.4): topological
// order of dependsOn, with roster order as the tie-break. A cycle, or a name outside the
// roster, keeps roster order for the slices that are left.
function walkOrder(slices) {
  const list = (slices || []).filter(s => s && s.slice)
  const names = new Set(list.map(s => s.slice))
  const placed = new Set()
  const out = []
  let left = list
  while (left.length) {
    const next = left.find(s => (s.dependsOn || []).every(d => d === s.slice || !names.has(d) || placed.has(d)))
    if (!next) return out.concat(left)
    out.push(next)
    placed.add(next.slice)
    left = left.filter(s => s !== next)
  }
  return out
}

// The stage prompt states the shared rules once. A stage agent does not read again the files
// that hold them; the stage reference still points to them for a person. requiresClause
// restates _requires.md (all but its Modes table), steeringClause restates _decisions.md,
// and the question contract below replaces every gate question (_gate-question.md).
function preambleClause() {
  return `- PREAMBLE GIVEN HERE: this prompt states the grounded-progress rule, the early-stop guard, the ` +
    `required-reads checklist, the steering contract and the question contract; you ask the person nothing ` +
    `yourself; and your return is the schema below, not a chat message. When the ` +
    `stage reference points to ${referenceRoot}/_chat-return.md, ${referenceRoot}/_autonomy-guards.md, ` +
    `${referenceRoot}/_grounded-progress.md, ${referenceRoot}/_gate-question.md, or ` +
    `${referenceRoot}/_question-craft.md, do not read those files: apply the rules of this prompt. When it points ` +
    `to ${referenceRoot}/_requires.md, read only its section "Modes": this prompt states the rest.\n`
}

// ---------------------------------------------------------------------------
// QUESTIONS. A stage returns an intent-bearing decision as a question; the run stops and
// the main session asks it. questionsOf() keeps the entries that name a key and a question.
// ---------------------------------------------------------------------------
function questionsOf(res) {
  const list = res && Array.isArray(res.questions) ? res.questions : []
  return list
    .filter(q => q && typeof q === 'object' && String(q.key || '').trim() && String(q.question || '').trim())
    .map(q => ({ ...q, stage: q.stage || (res && res.stage) || null, slice: sliceOf(q.slice || (res && res.slice)) }))
}

// A slug-wide stage has no slice. An agent sometimes names its scope as the slice.
function sliceOf(s) {
  return !s || s === 'slug-wide' ? null : s
}

// The questions as one line each, for the stop reason.
function questionsText(list) {
  return (list || []).map(q => `${q.key}: ${String(q.question).slice(0, 200)}` +
    `${q.recommended ? ` (recommended: ${String(q.recommended).slice(0, 80)})` : ''}`).join('; ')
}

// The answers that reach this stage of this slice: the entries of args.answered whose stage
// and slice match (an entry with no stage or no slice matches any), the newest per key.
// One stage can stop on several questions, so it gets every answer in `all`.
function answeredFor(answered, stage, sliceArg) {
  const hits = (answered || []).filter(a => a && (!a.stage || a.stage === stage) && (!sliceOf(a.slice) || sliceOf(a.slice) === sliceArg))
  const byKey = new Map(hits.map((a, i) => [a.key || `#${i}`, a]))
  const list = [...byKey.values()]
  if (!list.length) return null
  if (list.length === 1) return list[0]
  return { ...list[list.length - 1], key: list.map(a => a.key || 'answer').join(','), all: list }
}

// An answered stage runs again with the answer. A verify can accept the slice on the answer;
// a verify, review or implement whose answer needs a new plan or new code routes back.
function answeredClause(a, stage, sliceArg = null) {
  if (!a) return ''
  const by = a.by || 'person'
  const quote = (s) => JSON.stringify(String(s || '').slice(0, 600))
  const head = a.all
    ? `\n\nANSWERED QUESTIONS (MANDATORY). The last run of this stage stopped on ${a.all.length} questions. The ` +
      `answers are in the decision store: ` +
      a.all.map((x, i) => `(${i + 1}) ${quote(x.question)} (key ${x.key || '?'}${x.id ? `, ${x.id}` : ''}, by ` +
        `${x.by || 'person'}): ${quote(x.answer)}`).join('; ') +
      `. Settle each stopped decision by its answer, and record each as a decision with class 'intent-bearing', ` +
      `the answer quoted, and the person or delegate that answered it as by. Do not ask them again.`
    : `\n\nANSWERED QUESTION (MANDATORY). The last run of this stage stopped on a question: ${quote(a.question)} ` +
      `(key ${a.key || '?'}). The answer, by ${by}, is in the decision store${a.id ? ` as ${a.id}` : ''}: ` +
      `${quote(a.answer)}. Settle the stopped decision by this answer, and record it as a decision with class ` +
      `'intent-bearing', the answer quoted, and by: '${by}'. Do not ask it again.`
  return head +
    (stage === 'verify'
      ? ` When the answer ACCEPTS this slice with its failing or residual items (for example "accept it", "record ` +
        `the miss", "continue to the next slice"), run no fix and no check round to make it pass: keep the result ` +
        `as it is, write accepted-by: '${by}', accepted-at (UTC now) and accepted-items (each failing acceptance ` +
        `criterion or residual, one line each) in the verify frontmatter, set its status: complete, and return ` +
        `acceptedByPerson: true. When the answer asks for a small fix inside this slice's plan, make it, verify ` +
        `again, and return acceptedByPerson: false.`
      : '') +
    (stage === 'verify'
      ? smallChangeClause(stage) +
        ` When the change is NOT small and the answer changes the slice's design, adds plan steps or adds files, ` +
        `change no code: write route-back: plan in the ${stage} frontmatter, and return routeBack: 'plan'. When ` +
        `the change is NOT small and the current plan already describes the work, change no code: write ` +
        `route-back: implement and return routeBack: 'implement'. The driver then runs that stage and every later ` +
        `stage of the slice again, with this answer.`
      : '') +
    (stage === 'implement'
      ? ` When the answer changes the slice's design, its acceptance criteria or its plan, do not revise or undo ` +
        `the work: write route-back: plan in the implement frontmatter, and return routeBack: 'plan'. The driver ` +
        `then runs the plan of the slice again with this answer, and the implement after it revises the work.`
      : '') +
    (a.routedBack
      ? ` The walk already routed back to ${a.routedBack} on this answer, so the plan and the code carry it now. ` +
        `Do not route back again: settle the stage on the work as it is.`
      : '')
}

// An answered verify fixes a small change itself. Only a change that is not small routes back,
// so a label or one screen row does not run plan, implement and verify again.
function smallChangeClause(stage) {
  return ` First decide the size of the change that the answer asks for. The change is SMALL when all five ` +
    `criteria hold: (1) it changes only files that the slug's diff already changes, plus their tests; (2) it adds ` +
    `no schema change, no migration, no new dependency and no new module; (3) it changes no public contract: no ` +
    `API, no rules file, no stored format and no event that another slice reads; (4) it changes the acceptance ` +
    `checks of one slice only; (5) one fix round can make it and check it. Record the size as a decision with ` +
    `class 'implementation-detail', and name the criterion that fails when the change is not small. For a SMALL ` +
    `change: (a) rewrite the acceptance check and the plan step that the answer changes, per rule 5 of ` +
    `${referenceRoot}/_decisions.md, and name the rewritten records with --rewrote when you record the decision; ` +
    `(b) make the change in your fix round; (c) run the checks of the rewritten acceptance check. When a check ` +
    `fails, the change is not small: continue with the route-back rules below. ` +
    `Return no routeBack for a small change that passes its checks.`
}

// A repeated question: an earlier stage asked it under another key, and the person answered it.
function sameQuestionClause() {
  return `When it prints no answer, run \`${WF_CMD} decide list "${projectRoot}" ${slug} --kind answer --json\` and ` +
    `\`${WF_CMD} decide list "${projectRoot}" ${slug} --kind steer --json\`, with --slice <your slice> when you run on ` +
    `a slice. When an entry answers the same question in substance under another key (the same choice in other ` +
    `words), or a standing answer (key standing:<kind>) covers the kind of the question, that entry settles it: ` +
    `cite its id in the decision that you record (--by standing:<id> for a standing answer), and do not ask again. ` +
    `Give a question that can come again the key <kind>:<case>, so a standing answer finds it. `
}

// A failing item that a live decision already settles is accepted, in every mode.
function settledItemsClause(sliceArg) {
  const scope = sliceArg ? ` --slice ${sliceArg}` : ''
  return `\n\nSETTLED ITEMS. Before you fix or report a failing acceptance criterion or residual item, run ` +
    `\`${WF_CMD} decide list "${projectRoot}" ${slug}${scope} --json\`. When a live decision of the person, a ` +
    `standing answer or a delegate decision already settles the item in substance (for example "record the miss, ` +
    `the speed work moves to a later packet"), accept the item: do not fix it, do not stop on it, and do not ask ` +
    `about it. Write accepted-by: <that decision's id>, accepted-at (UTC now) and accepted-items (the item, one ` +
    `line each) in the verify frontmatter. Return it in terminal.acceptedItems as { item, by: <that decision's id> }, ` +
    `and do not count it in substantiveResidual.`
}

// Delegate mode, last verify round: a failing item is accepted and goes to the review as a finding.
function delegateAcceptClause(sliceArg) {
  const s = sliceArg || slug
  const sliceOpt = sliceArg ? ` --slice ${sliceArg}` : ''
  return `\n\nDELEGATE ACCEPT (this is the last verify round of a delegate run). When an item still fails after ` +
    `your fix round, do not stop the run. First, when your own slice moved a measured product behaviour outside ` +
    `its pinned range and the cause is not known, spend one bounded round on finding the cause, then fix it or ` +
    `accept it. For each item that still fails: (1) run \`${WF_CMD} decide add "${projectRoot}" ${slug} --kind ` +
    `answer --by delegate --key verify-accept:${s}:<item> --question "<the item>" --answer "accept, carried to the ` +
    `review" --stage verify${sliceOpt}\`; (2) write accepted-by: delegate, accepted-at (UTC now) and ` +
    `accepted-items (the item, one line each) in the verify frontmatter; (3) write { "findings": [{ "dimension": ` +
    `"residual", "severity": "HIGH", "file": <the main file of the item, or null>, "line": null, "key": "<item>", ` +
    `"issue": "<the item and its measured gap>" }] } to ${DRAFT_DIR}/residual-${s}.json and run \`${WF_CMD} ` +
    `findings add "${projectRoot}" ${slug} ${DRAFT_DIR}/residual-${s}.json --source review${sliceOpt} --dimensions ` +
    `residual\`, so the review tries to fix it. Return each item in terminal.acceptedItems as { item, by: ` +
    `'delegate' }, set substantiveResidual: false, and return status 'complete'. Missing runtime evidence with ` +
    `no deferral is not accepted this way.`
}

// Delegate mode: the person delegated the intent-bearing decisions of this run.
function delegateClause(wfCmd) {
  return `\n\nDELEGATE MODE. The person delegated the intent-bearing decisions of this run. When you reach one, ` +
    `run \`${wfCmd} decide answered "${projectRoot}" ${slug} --key <key>\` first: a live answer settles it. ` +
    sameQuestionClause() +
    `Otherwise settle it by the option you would recommend, record it with \`${wfCmd} decide add "${projectRoot}" ` +
    `${slug} --kind answer --by delegate --key <key> --question "<the question>" --answer "<your choice>" --stage ` +
    `<stage>\`, and continue. Return no questions. When your own slice moves a measured product behaviour ` +
    `outside its pinned range and the cause is not known, do not carry it to later work: spend one bounded round ` +
    `on finding the cause, then decide. The person gets every delegate decision in one list at the end of the run, ` +
    `and reverses any of them in one answer.`
}




// ---------------------------------------------------------------------------
// External Output Boundary — re-asserted to every fresh-context subagent.
// They do NOT inherit it from the dispatcher, so each stage prompt embeds it.
// ---------------------------------------------------------------------------
const EOB =
  `EXTERNAL OUTPUT BOUNDARY: workflow artifact paths (.ai/workflows/…), stage names/numbers, ` +
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
// progress. Silent for longer than its own longest gap, a driver whose newest entry
// is an agent-start is presumed dead; one whose newest entry is an agent-end stopped.
//
// Diagnostic, never a gate: a failed append never fails a stage.
// ---------------------------------------------------------------------------
// The folder of the workflow records. A linked project keeps them in the records home: the
// staging step prints that folder as recordsRoot. The drafts always stay in the local folder.
const RECORDS_ROOT = typeof OPT.recordsRoot === 'string' && OPT.recordsRoot.trim()
  ? OPT.recordsRoot.trim().replace(/\\/g, '/').replace(/\/+$/, '')
  : `${projectRoot}/.ai/workflows`
const WF_DIR = `${RECORDS_ROOT}/${slug}`
const JOURNAL_PATH = `${WF_DIR}/.driver-journal.jsonl`
// The deterministic workflow commands: brief, decide, step, progress, defer, findings.
const WF_CMD = `node "${referenceRoot}/../scripts/wf.mjs"`
// The records of the workflow (_records.md): an agent reads them with `record get`, changes a field with
// `record set`, and writes a whole record as a draft that `record put` checks and writes.
const REC = (verb, rest) => `${WF_CMD} record ${verb} "${projectRoot}" ${slug}${rest ? ` ${rest}` : ''}`
const DRAFT_DIR = `${projectRoot}/.ai/workflows/${slug}/.draft`

// runId is minted by orient (the first subagent — it has the clock this script
// lacks) and threaded into every later heartbeat so one run's entries are
// separable from a previous run's in the same file.
let RUN_ID = ''
let AGENT_SEQ = 0

// WF-SYSTEM-REVIEW A4: an agent appends a journal line with the `line` command of
// yolo-watch, never as text it builds by hand. The command writes the line through
// JSON.stringify and stamps `at`, so a Windows path always parses. Inside the shell's
// single quotes, `'` goes out as \u0027.
const WATCH = `${referenceRoot}/../../../scripts/yolo-watch.mjs`
const jsonArg = (o) => `'${JSON.stringify(o).replace(/'/g, '\\u0027')}'`
// The command names the workflow, not a file, so the line reaches the journal wherever the records live.
const lineCmd = (o) => `node "${WATCH}" line "${projectRoot}" ${slug} ${jsonArg(o)}`
// A3: the agent-end line says why the agent stopped.
const END_FLAGS = `--status <the status you return> --errors <the number of tool errors, rejected writes and schema ` +
  `retries you RECOVERED from, 0 if none>. When your status is not complete, add --reason "<one line: why you ` +
  `stopped>". When you hard-stop, add --hard-stop-reason "<the same line>". When you route back, add ` +
  `--route-back <the stage you route back to>`

function heartbeatClause(label, phaseName, stageName, sliceArg) {
  const seq = ++AGENT_SEQ
  const start = { run: RUN_ID, seq, event: 'agent-start', agent: label, phase: phaseName, ...(stageName ? { stage: stageName } : {}), ...(sliceArg ? { slice: sliceArg } : {}) }
  return `\n\nDRIVER HEARTBEAT (do this FIRST and LAST). A background driver that dies leaves no ` +
    `signal; this journal is the only way a human or a later session can tell a live driver from a dead one. ` +
    `Append each line with the command below, never by hand (it appends to ${JOURNAL_PATH} and stamps the time):\n` +
    `  • BEFORE any other work, run: \`${lineCmd(start)}\`\n` +
    `  • IMMEDIATELY BEFORE you return, run: \`${lineCmd({ ...start, event: 'agent-end' })} ${END_FLAGS}\`.\n` +
    `Never read the journal back into your answer, and never let an append failure change what you do — the ` +
    `heartbeat is diagnostic, never a gate.`
}

// W1.3 / W5.1 — CONTROL-FILE OWNERSHIP. While a driver is live, that slug's
// 00-index.md and the global INDEX.md are DRIVER-OWNED. Two writers mutating them
// blind produced repeated "File has been modified since read" clusters — and once,
// a DEAD driver's last write ambushed a foreground read two hours later. The rule
// is the same in both directions: change an index field with `record set`, which merges in
// one step, and re-read INDEX.md immediately before an edit of it.
const CONTROL_FILE_RULE =
  `\n\nCONTROL-FILE DISCIPLINE. The index of this workflow (00-index.md) and ` +
  `${RECORDS_ROOT}/INDEX.md are shared control files that another session may also be editing. ` +
  `Change an index field with \`${REC('set')} index key=value ...\` (a dotted key names one field of a map): it ` +
  `merges the change in one step, so it loses no field of another writer. Write a draft of the whole index only ` +
  `for a list change with text entries: get the index with \`${REC('get')} index\` IMMEDIATELY before you write ` +
  `the draft ${DRAFT_DIR}/00-index.md, and run \`${REC('put')} 00-index.md\` at once. ` +
  `Re-read INDEX.md IMMEDIATELY before every edit of it — never edit from a copy you read earlier in this agent. If an ` +
  `edit is rejected as modified-since-read, that means the other writer moved: re-read, re-derive your change ` +
  `against the NEW content, and retry ONCE. Never force a stale string through, and never rewrite the whole file ` +
  `to dodge the conflict.`



const STEER_CMD = `${WF_CMD} decide list "${projectRoot}" ${slug} --kind steer`
// The campaign walk runs yolo on one packet slug at a time; yolo reads no campaign file.
const steer = (role) => steeringClause(STEER_CMD, role, `${referenceRoot}/_decisions.md`)

// ---------------------------------------------------------------------------
// STOP AT THE NEXT BOUNDARY (YOLO-COMMENTARY-PLAN G1-G3). The person says "stop
// after the current verify" in chat; the main session writes
// .ai/workflows/<slug>/.control.json through scripts/yolo-watch.mjs control. This
// script cannot read the file, so the agent that starts each stage reads it, fresh,
// by path. When the request holds, the agent does no work
// and returns status 'stopped', and the driver ends cleanly with stoppedAt
// 'stop-request'. Only stage-boundary agents check:
// a stop never lands inside a verify fix round or between the review scouts.
// A stop request is a control signal, not steering: it says WHEN the driver ends,
// never HOW a stage works.
// ---------------------------------------------------------------------------
const CONTROL_PATH = `${WF_DIR}/.control.json`

// The command reads the stop request and the journal, so the rule lives in code (yolo-watch stopCheck),
// and the check finds the request wherever the records live.
function stopCheckClause(cmd) {
  return `\n\nSTOP-REQUEST CHECK (before any other work, after the start heartbeat when this prompt asks for ` +
    `one). Run \`${cmd}\` now. It prints one JSON line. When it prints "stop": false, continue normally and do ` +
    `not mention the check. When it prints "stop": true, stop: do no stage work, write no artifact, and edit no ` +
    `file except your heartbeat lines. Return status 'stopped', stopReason quoting the "reason" of the line, ` +
    `the stage and slice you were asked to run, artifactPath '' and terminal {}. Never edit or delete the ` +
    `control file: the main session owns it.`
}
const stopCheck = () => stopCheckClause(`node "${WATCH}" stop-check "${projectRoot}" ${slug}`)






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
  `\n\nDECISION RECORDING CONTRACT.\n` +
  `- EVERY decision you record carries a \`class\` stamp per ${referenceRoot}/_decision-classes.md. There are ` +
  `exactly two values: \`implementation-detail\` (yours to settle autonomously) and \`intent-bearing\` (never ` +
  `yours — it is a question, per the question contract). Omitting the stamp is not a neutral act: it silently ` +
  `weakens the run's "intent-bearing escapes: 0" report into a number nobody can trust. When a decision is ` +
  `hard to classify and it can be undone inside this packet (no push, no deleted data, no change to a contract ` +
  `line that a later packet reads), settle it by your recommended option, stamp it \`implementation-detail\` with ` +
  `contested: true, and continue: the hand-back lists it. Only a doubtful decision that cannot be undone inside ` +
  `the packet is \`intent-bearing\` and a question.\n` +
  `- Return each decision as an object carrying at least { class, decision } and, where it resolves a specific ` +
  `acceptance criterion, { ac, classification } naming what you concluded that AC is (e.g. ` +
  `classification: 'build-capability' vs 'runtime-evidence'). The run report treats YOUR recorded ` +
  `classification as canonical — it will not re-derive a different one behind your back.\n` +
  `- Report \`errors\`: [{ what, recovered }] for every tool error, rejected write, or schema retry you hit ` +
  `and recovered from this stage (empty list if none). A recovered error is not a failure and will not stop ` +
  `the run. The run report counts them.`

// ---------------------------------------------------------------------------
// THE QUESTION CONTRACT. The stage card holds the rules of each stage; this contract says
// what a driver run does where the reference would ask the person. A stage settles an
// implementation-detail decision itself. An intent-bearing decision is a question: the
// stage finishes its artifact honestly and returns the question, and the run stops.
// ---------------------------------------------------------------------------
function questionContract(stage) {
  return `\n\nQUESTION CONTRACT. Wherever the reference asks the user (AskUserQuestion) or pauses for a human, ` +
    `DO NOT ask. Settle an implementation-detail decision yourself by the card of your brief, and record it. ` +
    `For an intent-bearing decision (per ${referenceRoot}/_decision-classes.md), run ` +
    `\`${WF_CMD} decide answered "${projectRoot}" ${slug} --key <key>\` first: a live answer settles it. ` +
    sameQuestionClause() +
    (DELEGATE
      ? `Otherwise follow DELEGATE MODE below.`
      : `Otherwise do not settle it yet. When other work of this stage does not depend on the decision, hold ` +
        `the question and continue with that work. To hold it, run \`${WF_CMD} decide hold "${projectRoot}" ` +
        `${slug} --key <key> --question "<the question>" --stage ${stage} --options "<a>|<b>" --recommended ` +
        `"<a>"\`, with --slice <your slice> when you run on a slice. The command puts the question in the index, so ` +
        `the person can answer it while you work. Before you return status 'questions', look again for each ` +
        `question that you held: (1) run \`decide answered\` with its key again. (2) When that prints no answer, ` +
        `run \`${WF_CMD} decide list "${projectRoot}" ${slug} --kind answer --json\`, with --slice <your slice> ` +
        `when you run on a slice, and find an entry made after the held-at time of the question that answers the ` +
        `same question under another key. Settle the question by that entry, and cite its id in the decision ` +
        `that you record. (3) Settle each answered question in this run when its work fits this stage. When the ` +
        `answer changes the plan, use the route-back rules of this stage. Then finish the artifact honestly ` +
        `(status: awaiting-input, each open question recorded), and return status 'questions' with only the ` +
        `questions that are still open, in questions: { key (a short stable name), question (one sentence the ` +
        `person can answer without the artifact), options (2 to 4), recommended (one of the options), why (one ` +
        `line) }. Batch every open question of this stage in that one return. Questions are not a failure: the ` +
        `main session asks them, and the next run carries the answers.`) +
    (stage === 'verify'
      ? ` RETURN CONTRACT (verify): set the terminal state honestly — convergence: not-needed | converged | ` +
        `escalated; result: pass | fail | partial | blocked-runtime-evidence-missing. Record each deferral ` +
        `EXACTLY ONCE, in terminal.deferrals [{ac, reason, probe}] with the literal probe command and a one-line ` +
        `output tail of THIS run; residual carries only what is not a deferral. Set substantiveResidual: true ` +
        `iff an acceptance criterion still fails for a CODE reason after the fix round. Return status ` +
        `'complete' when convergence is not-needed or converged, substantiveResidual is false, and result is ` +
        `pass or a partial with at least one recorded deferral. Return status 'complete' also when every item ` +
        `that still fails is in terminal.acceptedItems. Otherwise return status 'hard-stop'.`
      : '') +
    (stage === 'review'
      ? ` RETURN CONTRACT (review): the review asks the person nothing and routes nothing back. It fixes or ` +
        `dismisses every finding at Steps 4b and 4c of review/_stage.md, one fix step and one commit at a time, in ` +
        `your own session. Return status 'complete' with fixCommits (the commit of each fix step, in order) and ` +
        `terminal.couldNotFixBlockers (the BLOCKER findings set could-not-fix). Return status 'hard-stop' only ` +
        `when a BLOCKER is could-not-fix. Never return status 'questions' or routeBack.`
      : '') +
    (stage === 'plan' || stage === 'implement'
      ? ` RETURN CONTRACT (${stage}): status 'complete' when the artifact is status: complete; 'hard-stop' on a ` +
        `blocking ambiguity that is not a decision for the person.`
      : '')
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
    targetSlice: { type: ['string', 'null'] },
    reviewScope: { enum: ['per-slice', 'slug-wide'] },
    workflowType: { type: 'string' },
    // single-scope workflow (a forwarded rca, or a one-slice standard workflow): 03-slice.md is absent and
    // orient synthesized a one-entry roster [selected-slice]. Stage files are un-suffixed; reviewScope is slug-wide.
    singleScope: { type: 'boolean' },
    // honored default review rubric — an rca whose recommended-next is hotfix → 'security'; empty = standard
    // dimension selection. Threaded into the review stage so yolo respects the RCA's recommended build flavor.
    reviewDimension: { type: ['string', 'null'] },
    // W1 — the run's own identity, minted by orient because it holds the clock this
    // script does not. Every later heartbeat carries it, so one run's journal entries
    // stay separable from a prior run's in the same append-only file.
    runId: { type: 'string' },
    // W1.2/W1.3 — the PREVIOUS driver's journal, reported raw. orient() turns it into
    // idx.priorRun with judgeLiveness(): the verdict is arithmetic, so code owns it.
    priorJournal: {
      type: 'object',
      properties: {
        present: { type: 'boolean' },
        nowAt: { type: 'string' },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              at: { type: 'string' }, run: { type: 'string' }, event: { type: 'string' },
              status: { type: 'string' }, stage: { type: 'string' }, slice: { type: 'string' },
            },
          },
        },
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
          // The brief asks for null on an open deferral, so null and a string both pass.
          clearedBy: { type: ['string', 'null'] },     // null/absent = still open
          repeatOf: { type: ['string', 'null'] },      // earlier slice with the same wall
          // true iff the index entry carries ship-override-authorization — the PO's
          // explicit risk-acceptance (recorded via ship step 6.5 route c, never by
          // yolo). An authorized deferral is settled: no re-challenge, no probe-
          // receipt escalation, and a partial verify walled only by it counts done.
          authorized: { type: 'boolean' },
          // W3.2 — the LEDGER's own classification of this wall. The index is the
          // authoritative record of what a deferral IS; when the driver's end-of-run
          // re-derivation disagrees, the ledger wins and the disagreement is reported
          // as `reconciled`, never silently re-labeled.
          ac: { type: ['string', 'null'] },              // the AC the entry names, when it names one
          wallOwnership: { type: 'string' },   // code-owned | environment-negotiable | external
          // W4 — the one-line, side-effect-free command that answers "has the
          // clearing event happened yet?". Run at the cheap moments (orientation,
          // /wf status) purely as a TRIPWIRE — a hit routes to /wf probe, it never
          // clears the deferral itself (the probe stage still owns evidence).
          clearingEvent: { type: ['string', 'null'] },
          clearingProbe: { type: ['string', 'null'] },
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
        // from base-branch if it does not exist yet (mirrors implement.md Step 0, item 11).
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
          // complete | deferred | skipped). Slug-mode skips 'skipped' entries instead of
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
          // the slice's depends-on list in 03-slice.md: the walk runs a slice after these.
          dependsOn: { type: 'array', items: { type: 'string' } },
          // the slice's complexity in 03-slice.md (xs | s | m | l | xl): an xs or s slice verifies in its implement agent.
          complexity: { type: ['string', 'null'] },
          // From `wf.mjs step where`: the plan's step count, the done steps, and the
          // implement hard-stops since the slice's last complete implement or retry.
          planSteps: { type: 'number' },
          stepsCommitted: { type: 'number' },
          implementStops: { type: 'number' },
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
    // 'stopped' — the agent found a stop or pause request in .control.json and did no work.
    // 'questions' — the stage met intent-bearing decisions that no live answer settles.
    status: { enum: ['complete', 'hard-stop', 'stopped', 'questions'] },
    // The questions of a 'questions' return (the question contract).
    questions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['key', 'question'],
        properties: {
          key: { type: 'string' }, question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          recommended: { type: 'string' }, why: { type: 'string' },
        },
      },
    },
    // An answered verify that accepts the slice with its failing or residual items.
    acceptedByPerson: { type: 'boolean' },
    // An answered implement or verify that needs a new plan or new code.
    routeBack: { enum: ['plan', 'implement'] },
    // The review: the commit of each fix step, in order. The driver scans them once more.
    fixCommits: { type: 'array', items: { type: 'string' } },
    // The implement of an xs or s slice: the verify that it ran in the same session, as a verify result.
    verify: {
      type: 'object',
      required: ['status', 'terminal'],
      properties: {
        status: { enum: ['complete', 'hard-stop', 'questions'] },
        artifactPath: { type: 'string' },
        terminal: { type: 'object' },
        residual: { type: 'array' },
        hardStopReason: { type: 'string' },
        sliceWriteBack: { type: 'object', properties: { ok: { type: 'boolean' }, wrote: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } } },
      },
    },
    // E4: the slice-status mirror that the verify agent did as its last step.
    sliceWriteBack: { type: 'object', properties: { ok: { type: 'boolean' }, wrote: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } } },
    stopReason: { type: 'string' },
    artifactPath: { type: 'string' },
    terminal: {
      type: 'object',
      properties: {
        statusField: { type: 'string' },   // plan/implement → complete | awaiting-input
        convergence: { type: 'string' },    // verify → not-needed | converged | escalated
        result: { type: 'string' },         // verify → pass | fail | partial | blocked-runtime-evidence-missing
        verdict: { type: 'string' },        // review → ship | ship-with-caveats | dont-ship
        blockerCount: { type: 'number' },   // review → metric-findings-blocker (OPEN)
        couldNotFixBlockers: { type: 'number' },   // review → BLOCKER findings set could-not-fix
        // verify → user-observable ACs DEFERRED because the environment genuinely
        // could not produce runtime evidence (each written as verify/_deferrals.md's
        // `interactive-verification: deferred` escape hatch + registered in
        // 00-index.md runtime-evidence-deferrals; /wf ship later blocks on them).
        // `probe` is the literal capability-probe command + one-line output tail the
        // subagent executed THIS run to establish the wall (attempt-before-declare —
        // verify/_deferrals.md §"Attempt before declare"). A deferral with no probe is challenged by
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
        // verify → the failing items that a live decision accepts: { item, by } where by is the id
        // of that decision, or 'delegate' for a delegate accept. An accepted item is cleared.
        acceptedItems: {
          type: 'array',
          items: { type: 'object', required: ['item', 'by'], properties: { item: { type: 'string' }, by: { type: 'string' } } },
        },
      },
    },
    // Recorded autonomous calls. W3.3: every entry MUST carry a `class` stamp
    // (implementation-detail | intent-bearing) per _decision-classes.md; an entry
    // that resolves a specific AC also carries { ac, classification }, and THAT
    // classification is canonical over anything the driver would re-derive (W3.2).
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['decision'],
        properties: {
          decision: { type: 'string' },
          class: { enum: ['implementation-detail', 'intent-bearing'] },
          // A doubtful decision that the stage settled because it can be undone inside the packet.
          contested: { type: 'boolean' },
          ac: { type: 'string' },
          classification: { type: 'string' },
          slice: { type: 'string' },
        },
      },
    },
    // W3.1 — deferred / could-not-fix notes that are NOT deferrals. A deferral lives
    // in terminal.deferrals[] once, with its probe; duplicating it here is what the
    // one-writer-per-fact rule now forbids (the driver still tolerates the old shape
    // when it appears, so a stale subagent can't false-stop a compliant slice).
    residual: {
      type: 'array',
      items: {
        type: 'object',
        required: ['reason'],
        properties: {
          ac: { type: 'string' },
          reason: { type: 'string' },
          probe: { type: 'string' },
          slice: { type: 'string' },
        },
      },
    },
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
    // Standing steering — the stage artifact's `steering-honored:` list, returned so the
    // hand-back can show it, and the entry a steering stop names.
    steeringHonored: { type: 'array', items: { type: 'string' } },
    steeringConflict: { type: 'string' },
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
        // The finding shape of the findings ledger (_findings-ledger.md), plus a run-local id.
        properties: {
          id: { type: 'string' },
          dimension: { type: 'string' },
          severity: { enum: ['BLOCKER', 'HIGH', 'MED', 'LOW', 'NIT'] },
          file: { type: 'string' },
          line: { type: 'string' },
          issue: { type: 'string' },
          confidence: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
          preExisting: { type: 'boolean' },
          changesAcceptance: { type: 'boolean' },
        },
      },
    },
  },
}

const RUBRIC_SELECTION = {
  type: 'object',
  required: ['rubrics'],
  properties: {
    rubrics: {
      type: 'array',
      items: {
        type: 'object',
        required: ['rubric', 'file'],
        properties: {
          rubric: { type: 'string' },
          file: { type: 'string' },   // relative to the reference root: review/<name>.md or design/<audit|critique>.md
          focus: { type: 'string' },  // alias section to read; empty = the whole rubric
          reason: { type: 'string' },
        },
      },
    },
    // true iff the store held a live steer entry when this agent read it — the driver then adds the
    // steering-compliance scout. Read at review time, so a mid-run edit counts.
    steeringPresent: { type: 'boolean' },
    // The stop-request check runs here, at the review boundary, before any scout starts.
    stopped: { type: 'boolean' },
    stopReason: { type: 'string' },
    // A check pass over the fix commits of the review: true when that range has no change.
    emptyDiff: { type: 'boolean' },
    // The files of the work packet: the changed files, and the files that call, import or test
    // the changed code. The scouts look only there, and the merge drops a finding elsewhere.
    affectedFiles: { type: 'array', items: { type: 'string' } },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['refuted'],
  properties: { refuted: { type: 'boolean' }, reason: { type: 'string' } },
}
// C6: the verdicts of one grouped refuter.
const REFUTE_GROUP = {
  type: 'object',
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: { type: 'object', required: ['id', 'refuted'], properties: { id: { type: 'string' }, refuted: { type: 'boolean' }, reason: { type: 'string' } } },
    },
  },
}

// ---------------------------------------------------------------------------
// orient() — read-only snapshot of the workflow. Resolves mode, review scope,
// file convention, branch posture, and the per-slice resume point (which stages
// are already terminal-clean on disk, so a killed run resumes for free).
// ---------------------------------------------------------------------------
async function orient() {
  const res = await agent(
    `You are the ORIENT step of an autonomous SDLC driver. READ-ONLY — do not write, edit, commit, or switch ` +
    `anything; just report. The project root is ${projectRoot} (absolute) — resolve every path under it and run ` +
    `git as \`git -C ${projectRoot} …\`.\n\n` +
    `Slug: ${slug}${slice ? `\nTarget slice: ${slice}  (slice mode)` : `\n(no slice given → slug mode)`}\n\n` +
    `0. Run \`${WF_CMD} status "${projectRoot}" ${slug} --json\` first. It reads the records in code: the stage ` +
    `files of each slice, the roster status, the verify result and the convergence of each slice (slices[]), the ` +
    `run record and the next command. Use its values where a step below names the same ` +
    `fact, and read a record only for a fact that the output lacks. Read a record with \`${REC('get')} <name>\` ` +
    `(exit 1 = the record is absent), and list the records with \`${REC('list')}\`. A record name such as ` +
    `03-slice.md is not a file path.\n` +
    `1. Read the index: run \`${REC('get')} index\`. It is CURRENT STATE only: parse the keys this step ` +
    `names and nothing else. Do NOT read index-history.jsonl or history/ — finished history (old next-step ` +
    `commentary, finished sub-pass telemetry) is not state, and must not be mixed into the open deferrals or the ` +
    `charter you report. Parse: status, current-stage, review-scope ` +
    `(default 'per-slice' if the field is absent), workflow-type, branch-strategy (default 'none' if absent), ` +
    `branch, and base-branch. ALSO parse the \`runtime-evidence-deferrals\` list (if present): capture every entry ` +
    `whose \`cleared-by\` is null/absent (STILL OPEN) into priorDeferrals as ` +
    `{ slice, reason (verbatim), deferredAt (= deferred-at), clearedBy (= cleared-by, null if open), repeatOf ` +
    `(= repeat-of, omit if absent), authorized (true iff the entry carries ship-override-authorization — the PO ` +
    `risk-acceptance stamp; omit otherwise), ac (the acceptance criterion the entry names, when its reason names ` +
    `one), wallOwnership (= wall-ownership), clearingEvent (= clearing-event), clearingProbe (= clearing-probe) }. ` +
    `Omit already-cleared entries. Empty/absent list → priorDeferrals: [].\n` +
    `   ALSO parse the \`charter\` list (if present) into charter as { id, commitment (verbatim), status }. ` +
    `Empty/absent (e.g. a compressed lifecycle) → charter: [].\n` +
    `1b. DRIVER JOURNAL — read ${JOURNAL_PATH} if it exists (append-only JSONL; each line is one heartbeat: ` +
    `at, run, seq, event, agent, phase, stage, slice, status). Report priorJournal:
` +
    `   - present: true iff the file exists with at least one parseable line (absent/empty → ` +
    `{ present: false } and nothing else).
` +
    `   - entries: every entry of the newest run OTHER than this run (skip lines whose run is the runId you ` +
    `mint in step 1c), oldest first, each as { at, run, event, status, stage, slice } copied verbatim; omit a ` +
    `field the line lacks.
` +
    `   - nowAt: the current UTC time as ISO-8601, from the same clock you use in step 1c.
` +
    `   Report the entries only. The driver computes the liveness verdict from them in code.
` +
    (GIVEN_RUN_ID
      ? `1c. The runId of THIS run is '${GIVEN_RUN_ID}'. Report it as runId; do not mint another.\n`
      : `1c. Mint runId for THIS run: the current UTC timestamp in ISO-8601 basic form plus the slug — e.g. ` +
        `'20260726T143005Z-${slug}'. Report it as runId. (This script has no clock; you are the only step that does.)\n`) +
    `2. Read the roster from the slices[] of the status output (slice, roster). Run \`${REC('get')} 03-slice.md\` ` +
    `only when the output has no slices. Capture EVERY slice slug in roster ` +
    `order, and record each entry's roster status from 00-index.md slices[] (defined | in-progress | complete | ` +
    `deferred | skipped | dropped) as slices[].status, and its \`complexity:\` (xs | s | m | l | xl; null when the entry has none) as slices[].complexity — capture 'skipped' and 'dropped' entries too (the driver skips them itself; dropping them here ` +
    `would break slice-mode routing to the NEXT slice). If 03-slice.md is ABSENT and the workflow is SINGLE-SCOPE ` +
    `(selected-slice is set on 00-index.md — true ` +
    `for a forwarded rca and for any one-slice standard workflow), synthesize a one-entry roster [selected-slice] ` +
    `(fall back to the slug if selected-slice is empty), set singleScope=true, and set reviewScope='slug-wide' (one ` +
    `un-suffixed 07-review.md — never a per-slice split for a single scope). Do NOT route to '/wf slice' for a ` +
    `single-scope workflow; a roster of one is complete.\n` +
    `2b. IMPLEMENT PROGRESS. For each slice whose implement is not done, run ` +
    `\`${WF_CMD} step where "${projectRoot}" ${slug} <slice> --json\`: planSteps = its total, stepsCommitted = the ` +
    `number of entries of its done list (0 when empty), and implementStops = its hardStops (the fail stops only). ` +
    `The command checks each step commit against the slice branch itself.\n` +
    `3. Resolve fileConvention: 'suffixed' for a multi-slice standard workflow that has per-slice ` +
    `03-slice-<slice>.md files (so stage files are 04-plan-<slice>.md, 06-verify-<slice>.md, 07-review-<slice>.md); ` +
    `'unsuffixed' for a change-mode (workflow-type fix|hotfix|refactor), a forwarded rca driven single-scope, or any ` +
    `single-scope standard workflow (one slice, only a 04-plan.md master) where stage files are 04-plan.md, ` +
    `06-verify.md, 07-review.md.\n` +
    `4. Determine mode: 'slice' if a target slice was given, else 'slug'. In slice mode, confirm the target slice ` +
    `is in the roster — if not, set ok=false, blockReason, route='/wf slice ${slug}'.\n` +
    `5. READINESS GATE (yolo drives from PLAN onward only — it NEVER runs intake (the brief and the shape) autonomously; intake owns ` +
    `product-owner alignment). First CLASSIFY by 00-index.md workflow-type — only workflows with a decided build are ` +
    `drivable, and a non-build type must NOT fall through to the slice check:\n` +
    `   5a. TERMINAL-ANALYSIS, no decided build — workflow-type ∈ {investigate, discover, ideate, brainstorm} (00-index.md ` +
    `type: workflow-index; by design NO 03-slice.md/04-plan.md). Unlike rca, these do NOT converge on one build: ` +
    `investigate emits 2–3 UNPICKED option sketches and writes NO 02-shape.md; discover emits a yes/no VERDICT whose ` +
    `only follow-up is more analysis (e.g. /wf intake rca), not a build; ideate emits a RANKED MENU whose ideas each ` +
    `become their OWN new workflow; brainstorm keeps an OPEN BOARD the person continues by hand. The missing ingredient is a human product decision (pick an option / act on the ` +
    `verdict / choose an idea) — exactly the intake+shape alignment yolo must not make. So yolo drives NOTHING here; ` +
    `'missing 03-slice.md' is EXPECTED and must NEVER route to '/wf slice'. These are also never continued IN PLACE ` +
    `(investigate has no shape to plan) — each SEEDS A NEW /wf intake workflow, so do NOT route to '/wf plan ${slug}' ` +
    `either. Set ok=false, blockReason naming the terminal type, and set route from the workflow's OWN recorded next ` +
    `step (00-index.md next-invocation / the 01-<mode>.md lead): ideate → its recorded '/wf intake <chosen-idea>'; ` +
    `investigate → 'pick an option in 01-investigate.md, then /wf intake fix <option> (or /wf intake <option>) — ` +
    `/wf yolo drives it once intaked+shaped'; discover → 'act on the verdict in 01-discover.md (/wf intake rca ` +
    `<symptom> if it failed; no build if it holds)'; brainstorm → '/wf intake brainstorm ${slug} to continue, or a ` +
    `candidate entry command from 01-brainstorm.md once distilled'.\n` +
    `   5b. RCA with a DECIDED build — workflow-type 'rca'. The diagnosis IS the intake and 02-shape.md is its ` +
    `synthesized shape, so intake+shape are already COMPLETE and yolo may drive plan→implement→verify→review over ` +
    `the single scope (the plan/implement/verify/review references all have a 'forwarded mode' path for this). Read ` +
    `recommended-next from 01-rca.md frontmatter (fallback: the 00-index.md recommended-routes entry with default: true — old slugs: recommended-routes.primary — / next-invocation):\n` +
    `      • human-triage — OR 01-rca.md shows root-cause-confidence: low AND blast-radius: high — is a genuine ` +
    `product STOP: set ok=false, blockReason='RCA recommends human triage (low confidence + high blast radius)', ` +
    `route='read the record 01-rca.md of ${slug} and choose the build route by hand, then /wf yolo ${slug}'.\n` +
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
    `   5b2. PROTOTYPE — workflow-type 'prototype'. A person-steered proof loop: the person starts every round, ` +
    `and no driver runs one. yolo drives NOTHING here. Set ok=false, blockReason='a prototype is steered by the ` +
    `person, one round at a time', route='/wf loop prototype ${slug} <request>'. Do NOT fall through to 5d.\n` +
    `   5c2. OPTIMIZE loop — workflow-type 'optimize'. The metric loop belongs to /wf loop optimize: a person confirms ` +
    `its spec (02-optimize-spec.md, confirmed-by), and the loop runs under its own driver. yolo never runs a trial. ` +
    `READINESS: 05-implement-optimize.md exists with status: complete (the loop's finish wrote it, with ` +
    `03-slice.md and 03-slice-optimize.md). If it is absent or not complete, set ok=false, blockReason='the ` +
    `optimize loop has not finished', route='/wf loop optimize ${slug}'. When it is complete, set ok=true and ` +
    `workflowType='optimize'; the roster is the one slice 'optimize', fileConvention 'suffixed' ` +
    `(06-verify-optimize.md, 07-review-optimize.md), reviewScope from 00-index.md (per-slice). In step 6, mark ` +
    `plan 'done' for that slice: the confirmed spec replaces the plan. yolo then drives verify and review only. ` +
    `Do NOT fall through to 5d.\n` +
    `   5d. STANDARD build lifecycle — everything else (standard/feature, plus the compressed change-modes fix / ` +
    `hotfix / refactor; 00-index.md type: index). Apply the readiness check: the stage-1 intake artifact must exist ` +
    `and not be status: awaiting-input; 02-shape.md must exist; 03-slice.md must exist (UNLESS singleScope was ` +
    `synthesized in step 2 for a one-slice standard workflow). The intake lead is 01-intake.md for a standard ` +
    `workflow, but the change-modes name it after the mode — resolve from workflow-type: fix→01-fix.md, ` +
    `hotfix→01-hotfix.md, refactor→01-refactor.md, else 01-intake.md (all carry frontmatter type: intake, ` +
    `stage-number 1; accept any 01-*.md whose frontmatter is type: intake if the named file is somehow absent). If ` +
    `the resolved intake lead, 02-shape.md, or (when required) 03-slice.md is missing or awaiting-input, set ok=false ` +
    `with blockReason and route='/wf intake <description>' (or '/wf intake ${slug}' / '/wf slice ${slug}' for the ` +
    `specific gap).\n` +
    `   5e. DESIGN GATE (applies to 5b and 5d; a person confirms the design — yolo NEVER runs the design stage). ` +
    `Read ux-impact from 00-index.md. Design is NEEDED when ux-impact ∈ {visual, flow, new-surface}, or when ` +
    `ux-impact is absent and 02b-design.md exists. Design is SETTLED when 02c-craft.md exists with a resolved ` +
    `image-gate (pass or skipped:<reason>) AND a direction-confirmed-by field, or when 00-index.md ` +
    `progress.design is 'skipped' with a design-skip-reason. When 02c-craft.md carries screens:, the design is settled ` +
    `only when direction-confirmed-by is answer-event, approval-commit is set, and every screen page .ai/design/screens/<key>.html ` +
    `exists. When it carries boards: (an older contract) and ux-impact is visual or new-surface, every board file must exist; ` +
    `run node "${referenceRoot}/../scripts/design-boards.mjs" check "${projectRoot}" ${slug} to list the missing ones. ` +
    `The design is NOT settled while 00-index.md records ` +
    `progress.design: in-progress (reopened by an extension or an amend stop). A slice whose 03-slice-<slice>.md ` +
    `carries ux-impact: none changes nothing a person sees, so its plan does not wait for the design; a slice ` +
    `WITHOUT the field keeps the slug rule. When design is needed and not settled, and at least one roster slice ` +
    `whose plan is not yet complete lacks ux-impact: none, set ok=false, blockReason='design not confirmed by a ` +
    `person (design stage pending)', route='/wf design ${slug}' ('/wf design ${slug} amend' when the design is ` +
    `reopened). When every such slice carries ux-impact: none, the run proceeds.\n` +
    `6. For ALL roster slices (in roster order — the COMPLETE list, both modes; the full roster is needed so ` +
    `slice-mode can route to the next slice), check with \`${REC('list')}\` and \`${REC('get')} <name>\` which of ` +
    `plan/implement/verify/review already exist ` +
    `AND are terminal-clean, marking each 'done' | 'todo':\n` +
    `   - plan: artifact present AND frontmatter status: complete\n` +
    `   - implement: artifact present AND status: complete\n` +
    `   - verify: artifact present AND convergence ∈ {not-needed, converged} AND (result: pass, OR result: partial ` +
    `where EVERY open runtime-evidence-deferral for this slice in priorDeferrals has authorized=true — a ` +
    `PO-authorized deferral is settled and needs no re-verify; a partial with any open UN-authorized deferral stays ` +
    `'todo' so the next verify re-challenges the wall)\n` +
    `   - review: artifact present AND verdict ∈ {ship, ship-with-caveats} AND metric-findings-blocker == 0\n` +
    `   In slug-wide review scope, mark every per-slice 'review' as 'n-a' (review runs once at slug level, not per slice).\n` +
    `   dependsOn: the slice's depends-on list in the roster of 03-slice.md ([] when it has none).\n` +
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
    `8. CLEARING-EVENT TRIPWIRE. Run \`${WF_CMD} defer check "${projectRoot}" ${slug} --json\` once. It runs the ` +
    `recorded clearing-probe of each open deferral in code. For each entry of priorDeferrals, set clearingProbeHit ` +
    `to true when its entry in the output has state 'changed', false when 'unchanged', and omit it for 'no-probe'. ` +
    `Do NOT clear the deferral, do NOT edit 00-index.md, and do NOT treat a hit as evidence — this is a ` +
    `TRIPWIRE only: an event that has quietly come true gets noticed.\n\n` +
    `Return the structured orientation. Set ok=true only when the readiness gate passes.` +
    // orient mints RUN_ID, so it writes its own heartbeat with the id it just made.
    `\n\nDRIVER HEARTBEAT. Using the runId you minted in step 1c, append two lines with the command ` +
    `below, never by hand: one BEFORE you start reading — ` +
    `\`${lineCmd({ seq: 0, event: 'agent-start', agent: 'orient', phase: 'Orient' })} --run <runId>\` ` +
    `— and one immediately before you return — ` +
    `\`${lineCmd({ seq: 0, event: 'agent-end', agent: 'orient', phase: 'Orient' })} --run <runId> ` +
    `--status <ok|blocked> --errors <count of errors you recovered from>\`, adding --reason "<blockReason>" when ` +
    `blocked. This journal is how a human tells a live driver from a dead one; an append failure never changes ` +
    `what you do.`,
    { schema: ORIENT_RESULT, label: 'orient', phase: 'Orient', ...OPUS }
  )
  if (res) res.priorRun = judgeLiveness(res.priorJournal, res.runId)
  return res
}

// ensureBranch() — DEDICATED strategy only (the control flow gates on it). Mirrors
// implement.md Step 0, item 11, so yolo lands the run on the slug branch BEFORE any stage
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
    `before any stage runs. Run git as \`git -C ${projectRoot} …\`; make NO ` +
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
      label: 'branch', phase: 'Orient', ...HAIKU, // mechanical git; pinned per _subagents.md
    }
  )
}

// reChallengeClause() — F3: fold the run's OPEN prior deferrals (from orient's
// priorDeferrals) into a RE-CHALLENGE block for the verify prompt. A deferral recorded
// by an earlier run is a CLAIM to re-test, never a fact to inherit — the Crumb
// stale-creds incident (a carried-forward "Firebase creds unavailable" paired with a
// mocked 0-issues verify) is exactly what this stops. Empty list → '' (no clause).
// The check is code: `wf.mjs defer check` runs each recorded clearing-probe, and an entry it
// reports `unchanged` is not probed again (verify/_deferrals.md).
function reChallengeClause(priorDeferrals, deferCmd) {
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
    `These are CLAIMS recorded by earlier runs, NOT facts. Do NOT inherit any of them. First run ` +
    `\`${deferCmd || 'wf.mjs defer check <root> <slug> --next <slice>'}\`: it runs each recorded clearing-probe. ` +
    `An entry that it reports 'unchanged' still stands: keep it, with that probe and its output as this run's ` +
    `receipt, and do not probe it again. For an entry that it reports 'changed' or 'no-probe', and whose ` +
    `constraint could touch what you are verifying now, run its capability probe FRESH in THIS run: a wall that ` +
    `no longer stands must be verified now (produce the evidence and clear the deferral); a wall that still ` +
    `stands gets a FRESH probe receipt on this run's deferral — never the old reason copied forward.`
}

// ---------------------------------------------------------------------------
// runStage() — THE core wrapper. Points a fresh subagent at the on-disk
// reference and overrides only the interactive gate. This is "wrap, not fork":
// yolo inherits every future improvement to plan/implement/verify/review for
// free, with zero duplicated stage logic.
// ---------------------------------------------------------------------------
async function runStage(stage, sliceArg, idx, extra = {}) {
  const sliceClause = sliceArg ? `, slice '${sliceArg}'` : ''
  const roundClause = extra.round > 1
    ? ` This is autonomous verify ROUND ${extra.round} of 2: a prior round already ran one fix pass; ` +
      `resolve only what still fails.`
    : ''
  // A corrective probe round: a prior verify round returned structurally clean but deferred
  // these AC(s) with no capability-probe receipt. It is a demand for the receipt, not a fix pass.
  const probeClause =
    stage === 'verify' && Array.isArray(extra.probeAcs) && extra.probeAcs.length
      ? ` CORRECTIVE PROBE ROUND — a prior round deferred these AC(s) WITHOUT a capability-probe receipt: ` +
        `${extra.probeAcs.join(', ')}. For EACH, execute the capability probe NOW (if the prior round did not) ` +
        `and attach its receipt — the literal command you ran + a one-line output tail — to that deferral's ` +
        `\`probe\` field (and to interactive-verification-defer-reason). If a probe shows the wall no longer ` +
        `stands, produce the evidence INSTEAD of the deferral. A deferral still carrying no probe after this ` +
        `round will hard-stop the run.`
      : ''
  // Open prior deferrals: `defer check` first, then a fresh probe only where the check found a change.
  const deferCmd = `${WF_CMD} defer check "${projectRoot}" ${slug}${sliceArg ? ` --next ${sliceArg}` : ''}`
  const reChallenge = stage === 'verify' ? reChallengeClause(idx.priorDeferrals, deferCmd) : ''
  // A plan that is out of date: the code changed under it.
  const refreshClause = extra.refresh
    ? ` PLAN REFRESH: 04-plan-${sliceArg}.md already exists, and it is out of date: ${extra.refresh.reason}.` +
      ` Run plan.md's review mode on the existing plan (review-and-fix, not a fresh plan): read the code at HEAD ` +
      `that the plan touches, then fix the plan so it matches the code as built and the current sibling plans. ` +
      `Rewrite per ${referenceRoot}/_additive-write.md with trigger scope-change. Do NOT edit the sibling plans ` +
      `or the master 04-plan.md.`
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
  // The review fan-out ran the scouts and the refuters: the writer merges their findings into the ledger.
  const scan = stage === 'review' && extra.scan ? extra.scan : null
  const scanClause = scan
    ? `\n\nREVIEW SCAN GIVEN. A parallel scan per rubric has ALREADY run (${scan.dimensions.join(', ')}), and a ` +
      `refuter checked every finding. Skip Steps 2, 3 and 3b of review/_stage.md. At Step 4, write ` +
      `${DRAFT_DIR}/found.json as { "dimensions": ${JSON.stringify(scan.dimensions)}, ` +
      `"affectedFiles": ${JSON.stringify(scan.affectedFiles || [])}, ` +
      `"findings": <the list below, unchanged> } and run \`${WF_CMD} findings add "${projectRoot}" ${slug} ` +
      `${DRAFT_DIR}/found.json --source review --run ${RUN_ID}` +
      `${sliceArg ? ` --slice ${sliceArg}` : ''}\`. A finding with \`refuted\` stays refuted; re-check a ` +
      `survivor you doubt, but do not drop it.` +
      (scan.checkPass
        ? ` This is a CHECK PASS: the scan read only the commits of your last fix steps, ${scan.checkPass}. Fix ` +
          `its findings the same way, at Steps 4b and 4c, and do not scan the work packet again.`
        : '') +
      ` Findings: ${JSON.stringify(scan.findings)}` +
      promptFedLine(scan.files, `${DRAFT_DIR}/${sliceArg ? `07-review-${sliceArg}.md` : '07-review.md'} (the draft: run \`${REC('put')}\` after you write it)`)
    : stage === 'review' && extra.ledgerOnly
    ? `\n\nFINDINGS FROM THE WALK. The walk put the defects of a fidelity row or a try-out in the findings ` +
      `ledger. Skip Steps 1 to 4 of review/_stage.md: scan nothing. Start at Step 4b with the open findings that ` +
      `\`${WF_CMD} findings list "${projectRoot}" ${slug} --open\` prints, and fix them at Step 4c.`
    : ''
  const label = `${stage}${sliceArg ? ':' + sliceArg : ''}`
  const briefCmd = `${WF_CMD} brief "${projectRoot}" ${slug} ${stage}${sliceArg ? ` ${sliceArg}` : ''}`
  return await agent(
    `Execute the SDLC '${stage}' stage for slug '${slug}'${sliceClause}, FULLY AUTONOMOUSLY (no human in the loop).\n\n` +
    `${EOB}\n\n` +
    `1. Run \`${WF_CMD} progress set "${projectRoot}" ${slug} --run ${RUN_ID} --driver yolo ` +
    `--stage ${stage}${sliceArg ? ` --slice ${sliceArg}` : ''} --status running\`. It records where the run stands.\n` +
    `2. Run \`${briefCmd}\` and read its output in full. It is your brief, built by code from the records: the ` +
    `## Card of the stage (its rules), the slice and its acceptance criteria, the plan sections of the stage, ` +
    `the test suites with the time box, and the live decisions in scope. A live decision in the brief is an ` +
    `answer: do not ask it again.\n` +
    `3. Read ${referenceRoot}/${stage}.md IN FULL and follow it VERBATIM to do the stage's real work and write ` +
    `its record(s): write each as a draft under ${DRAFT_DIR}/ and run \`${REC('put')} <name>\`, per ` +
    `${referenceRoot}/_records.md.` +
    questionContract(stage) + (DELEGATE ? delegateClause(WF_CMD) : '') + answeredClause(extra.answered, stage, sliceArg) +
    (stage === 'verify' ? settledItemsClause(sliceArg) : '') +
    (stage === 'verify' && DELEGATE && (extra.round || 1) >= 2 ? delegateAcceptClause(sliceArg) : '') +
    `${roundClause}${probeClause}${reChallenge}${scopeHint}${refreshClause}${scanClause}` + steer('writer') +
    (extra.stopCheck === true ? stopCheck() : '') +
    requiresClause(`${referenceRoot}/${stage}.md`) + `\n\n` +
    `Operating rules:\n` +
    `- GROUNDED PROGRESS (${referenceRoot}/_grounded-progress.md): before reporting progress or terminal state, ` +
    `audit each claim against a tool result from THIS run. Report only work you can point to evidence for; if ` +
    `something is not yet verified, say so; a failing check is reported as failing with its output; every count ` +
    `you return derives from an artifact or tool result you opened this run, never from memory of your own edits.\n` +
    `- EARLY-STOP GUARD (${referenceRoot}/_autonomy-guards.md): before ending, check your last paragraph — if it ` +
    `is a plan, a question, or a promise about work you have not done, do that work now; end only when the stage ` +
    `contract is complete, or you return questions or a hard-stop.\n` +
    preambleClause() +
    `- Your mandate is ONLY the '${stage}' stage${extra.selfVerify ? ' and its verify (SELF VERIFY below)' : ''} for ${sliceArg ? `slice '${sliceArg}'` : `slug '${slug}'`}. Do ` +
    `NOT run other stages, do NOT claim completion of other slices or of the whole workflow, and do NOT recommend ` +
    `routes beyond what this stage's reference itself returns.\n` +
    `- Project root ${projectRoot} is ABSOLUTE. Resolve every artifact path under it and run git as ` +
    `\`git -C ${projectRoot} …\`. Do not rely on your working directory — it is not this repo.\n` +
    `- Write SCHEMA-COMPLETE frontmatter: a strict validator enforces the full sdlc/v1 frontmatter and rejects an ` +
    `incomplete write. Match the reference's artifact contract field-for-field.\n` +
    `- Record EVERY autonomous decision into the artifact (## Assumptions / ## Fix Status / ## Verify-Owned ` +
    `Fixes, per the reference) so this run is exactly as auditable as a human-gated one. Nothing dies silently ` +
    `inside an artifact.\n` +
    `- When you stop, still finish the artifact in its honest terminal state, then return status 'hard-stop' ` +
    `with hardStopReason, or status 'questions' with the questions.` +
    (stage === 'implement' ? implementStepsClause(WF_CMD, sliceArg || slug, extra.retry === true) : '') +
    (stage === 'implement' && extra.selfVerify && sliceArg ? selfVerifyClause(sliceArg, idx, deferCmd) : '') +
    (stage === 'verify' && sliceArg ? sliceStatusClause(sliceArg) : '') +
    CONTROL_FILE_RULE + deadDriverClause(idx.priorRun) + DECISION_CONTRACT + `\n\n` +
    `Return the terminal state: stage, slice, status ('complete' when the gate is clean, 'hard-stop' when you ` +
    `stopped, 'questions' when an intent-bearing decision waits for the person` +
    `${extra.stopCheck === true ? ", 'stopped' when the stop-request check stopped you" : ''}), the primary ` +
    `artifactPath, and terminal fields — plan/implement: statusField; verify: convergence + result + deferrals ` +
    `([{ac, reason, probe}]; [] if none) + substantiveResidual; review: verdict + blockerCount ` +
    `(= metric-findings-blocker, OPEN) + couldNotFixBlockers, and fixCommits — plus the questions, the class-stamped decisions you recorded, any ` +
    `residual (could-not-fix) notes, your recovered-error list, acceptedByPerson or routeBack when the answered ` +
    `question asks for one, and steeringHonored (plus steeringConflict when a steering entry stopped you) when a ` +
    `steer entry exists.` +
    heartbeatClause(label, 'Drive', stage, sliceArg),
    { schema: STAGE_RESULT, label, phase: 'Drive', ...stageModel(stage) }
  )
}

// An xs or s slice pays for no separate verify agent: its implement agent runs the verify
// procedure in the same session. The slug-wide review, with its refuters, stays the independent check.
const SELF_VERIFY_SIZES = ['xs', 's']

function selfVerifyClause(sliceArg, idx, deferCmd) {
  return `\n\nSELF VERIFY (slice '${sliceArg}' is complexity xs or s, so no separate verify agent runs). After the ` +
    `test receipt, run the verify stage for slice '${sliceArg}' in this session: run \`${WF_CMD} brief ` +
    `"${projectRoot}" ${slug} verify ${sliceArg}\`, then read ${referenceRoot}/verify.md IN FULL and follow it ` +
    `VERBATIM: the AC gate, the runtime checks with the evidence reuse of verify/_runtime-evidence.md, the deferral ` +
    `rules, and the verify record 06-verify-${sliceArg}.md. When the verify fails, fix the code as a new step, ` +
    `commit it, and verify again: at most 2 verify rounds.` + settledItemsClause(sliceArg) +
    (DELEGATE ? delegateAcceptClause(sliceArg).replace('(this is the last verify round of a delegate run)', '(on your second verify round, in a delegate run)') : '') +
    reChallengeClause(idx.priorDeferrals, deferCmd) +
    sliceStatusClause(sliceArg) +
    `\nReturn the verify as \`verify\`: { status, artifactPath, terminal: { convergence, result, deferrals ` +
    `([{ac, reason, probe}]; [] if none), substantiveResidual, acceptedItems }, residual, sliceWriteBack, hardStopReason }. ` +
    `The top-level fields stay the implement result.`
}

// W5.2 — SLICE-COMPLETE WRITE-BACK. Completed slices routinely left `03-slice.md`
// at `status: defined` and the index `progress` block stale, so the next run's
// orientation had to cross-check artifacts instead of trusting the index — and a
// later ship had to self-repair what the drive should have recorded. The
// mechanism belongs to the streamline plan's write-back work; what belongs HERE is
// that yolo's slice-complete step is a WRITER: the fix lands at drive time, when
// the fact is fresh, not two stages later when someone notices the drift.
//
// WF-SYSTEM-REVIEW E4: the verify agent does the mirror as its last step. Verify is the
// one writer of a roster `complete`, so the mirror is its own state, not another slice's.
// This agent runs only as the fallback, when no verify agent of the chain confirmed it.
function sliceStatusClause(sliceArg) {
  return `\n\nLAST STEP — SLICE STATUS MIRROR (only for slice '${sliceArg}'). After you write the verify artifact, ` +
    `take <status>: complete when it records \`result: pass\`; deferred when it records \`result: partial\` and its ` +
    `only residue is open runtime-evidence deferrals. Then: (1) get the index with \`${REC('get')} index\`, set this ` +
    `slice's entry in \`slices[]\` to status: <status>, refresh the \`progress\` block (completed/total counts) to ` +
    `match the roster, write the draft ${DRAFT_DIR}/00-index.md and run \`${REC('put')} 00-index.md\`; (2) in the ` +
    `roster record, set this slice's \`status:\` to <status> when it is not already: for 03-slice.md, get it, change ` +
    `the entry, write its draft and run \`${REC('put')} 03-slice.md\`; for 03-slice-${sliceArg}.md, run ` +
    `\`${REC('set')} 03-slice-${sliceArg}.md status=<status>\`. Never change an entry that close set to \`skipped\`, another ` +
    `slice's entry, or \`current-stage\`, and never mark the WORKFLOW complete. For any other result, write nothing ` +
    `here. Return sliceWriteBack: { ok, wrote: [<the records you changed>], note } (ok: false with a note when you ` +
    `wrote nothing).`
}

async function writeBackSliceStatus(sliceArg, idx, stagesRun) {
  return await agent(
    `SLICE-COMPLETE BOOKKEEPING for slug '${slug}', slice '${sliceArg}'. The autonomous driver just drove this ` +
    `slice through ${stagesRun.join(' → ')} and every gate cleared. Mirror the recorded outcome into the control ` +
    `files so the index tells the truth without anyone re-deriving it from artifacts.\n\n` +
    `${EOB}\n\n` +
    `ONE-WRITER RULE: /wf verify is the one writer of a roster \`status: complete\` or \`deferred\`. You only ` +
    `MIRROR it. Read the frontmatter of this slice's verify record with \`${REC('get')} <name>\` ` +
    `(06-verify-${sliceArg}.md, or 06-verify.md for an un-suffixed change-mode workflow). Take <status>: ` +
    `\`complete\` when it records \`result: pass\`; \`deferred\` when it records \`result: partial\` and its only ` +
    `residue is open runtime-evidence deferrals. Any other result: write nothing and say so in note.\n` +
    `1. Get the index with \`${REC('get')} index\`. Set this slice's entry in \`slices[]\` to ` +
    `status: <status>, and refresh the \`progress\` block (completed/total counts) to match the roster's actual ` +
    `state. Write the draft ${DRAFT_DIR}/00-index.md and run \`${REC('put')} 00-index.md\`.\n` +
    `2. In the roster record (03-slice.md, or the per-slice ` +
    `03-slice-${sliceArg}.md when the workflow uses the suffixed convention), when verify did not already set ` +
    `this slice's \`status:\` to <status>, set it to <status>: for 03-slice.md, get it, change the entry, write ` +
    `its draft and run \`${REC('put')} 03-slice.md\`; for 03-slice-${sliceArg}.md, run ` +
    `\`${REC('set')} 03-slice-${sliceArg}.md status=<status>\`. If the roster records no per-slice status field, ` +
    `leave it alone and say so. Never change an entry that close set to \`skipped\`.\n` +
    `3. Change NOTHING else. Do not touch stage artifacts, do not advance \`current-stage\` past this slice, do ` +
    `not edit another slice's entry, and never mark the WORKFLOW complete — the driver stops before ship and ` +
    `the workflow is not done.` +
    CONTROL_FILE_RULE + deadDriverClause(idx.priorRun) + `\n\n` +
    `Return { ok, wrote: [<the records you actually changed>], note }.` +
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
      label: `writeback:${sliceArg}`, phase: 'Drive', ...HAIKU, // mechanical index edit; pinned per _subagents.md
    }
  )
}




// driveVerify() — verify gets up to N=2 autonomous fix rounds (the reference
// does one fix round per invocation; a second invocation is round 2). A slice
// that is clean — including one whose only residual is environment-DEFERRED
// evidence — proceeds. Still-substantively-escalated after round 2 → HARD-STOP.
// An answered verify can accept the slice on the answer, or route back.
async function driveVerify(sliceArg, idx, extra = {}) {
  let last
  let probeCorrection = null   // set when a prior round was clean but its deferrals lacked probe receipts
  for (let round = 1; round <= 2; round++) {
    // Only the first round checks for a stop request: a stop never lands inside the fix loop.
    // The answer goes to every round: a fix round that drops it would undo the person's decision.
    // Round 1 of an xs or s slice is the verify that its implement agent ran in the same session.
    last = round === 1 && extra.first
      ? { stage: 'verify', slice: sliceArg, artifactPath: '', ...extra.first }
      : await runStage('verify', sliceArg, idx, { round, probeAcs: probeCorrection, stopCheck: round === 1 && !probeCorrection, answered: extra.answered || null })
    // A null return = the verify subagent was skipped or died on a terminal API
    // error after retries (not a quality failure). Stop cleanly; resume retries it.
    if (!last) return { stage: 'verify', slice: sliceArg, status: 'hard-stop', artifactPath: '', terminal: {}, transient: true, hardStopReason: 'verify did not return (subagent skipped or hit a transient API error) — re-run to retry this slice; resume skips completed stages' }
    // The answer needs a new plan or new code: the walk goes back to that stage, before any gate.
    if (extra.answered && (last.routeBack === 'plan' || last.routeBack === 'implement')) return last
    if (last.status === 'hard-stop' || last.status === 'stopped' || last.status === 'questions') return last
    // The person accepted the slice with its failing or residual items: it passes on that answer.
    // Only an answered verify can accept; no fix round runs after it.
    if (extra.answered && last.acceptedByPerson === true) {
      log(`verify:${sliceArg} accepted by ${extra.answered.by || 'person'} (${extra.answered.key || 'answer'}) with result=${(last.terminal || {}).result}`)
      return { ...last, accepted: true }
    }
    const t = last.terminal || {}
    if (verifyClean(t, last.residual)) {
      // Structurally clean — but the deferral law demands a probe receipt on every deferral
      // (verify/_deferrals.md §"Attempt before declare"). verifyClean tolerates a missing receipt (the
      // v9.114 no-hard-gate lesson); probeGaps surfaces it here. First offense with a round
      // left → ONE corrective re-run that demands the receipt (or the evidence, if the wall
      // fell). Still probe-less after that → hard-stop: the law is not optional, and re-running
      // is cheap because resume skips completed stages.
      // A slice whose open deferrals the PO already authorized (ship-override-
      // authorization on the 00-index entry) is settled — demanding fresh probe
      // receipts there re-walls a run the PO explicitly unblocked.
      const sliceAuthorized = Array.isArray(idx.priorDeferrals) &&
        idx.priorDeferrals.some(p => p && p.slice === sliceArg && p.authorized === true)
      const gaps = sliceAuthorized ? [] : probeGaps(t, last.residual)
      // A missing receipt first gets the wall probe: one short agent. When every wall of the
      // gap still stands, its fresh receipts go on the deferrals and the clean result stands.
      // Only a wall that fell, or a probe that did not answer, earns the full verify again.
      if (gaps.length && !probeCorrection) {
        const wp = await driveWallProbe(sliceArg, idx, gaps)
        const walls = (wp && Array.isArray(wp.walls)) ? wp.walls : []
        const receipt = (g) => walls.find(w => w && acKey(w.ac) === acKey(g.ac) && w.stands === true && typeof w.probe === 'string' && w.probe.trim())
        if (gaps.every(receipt)) {
          const attach = (d) => (d && d.ac && !d.probe && receipt(d) ? { ...d, probe: receipt(d).probe } : d)
          log(`verify:${sliceArg} clean; the wall probe attached fresh receipts to ${gaps.length} deferral(s) (${gaps.map(g => g.ac).join(', ')}) — no second verify`)
          return {
            ...last,
            terminal: { ...t, deferrals: (Array.isArray(t.deferrals) ? t.deferrals : []).map(attach) },
            residual: Array.isArray(last.residual) ? last.residual.map(attach) : last.residual,
          }
        }
        log(`verify:${sliceArg} the wall probe did not confirm every wall of ${gaps.map(g => g.ac).join(', ')} — the full verify runs again`)
      }
      if (gaps.length) {
        if (round < 2 && !probeCorrection) {
          probeCorrection = gaps.map(g => g.ac)
          log(`verify:${sliceArg} clean but ${gaps.length} deferral(s) carry no capability-probe receipt (${probeCorrection.join(', ')}) — one corrective re-run to attach receipts (or produce evidence if the wall fell)`)
          continue
        }
        return { ...last, status: 'hard-stop', hardStopReason: `deferral(s) still carry no capability-probe receipt after a corrective re-run: ${gaps.map(g => g.ac).join(', ')} — attach the literal probe command + output tail per verify/_deferrals.md §"Attempt before declare", or produce the evidence if the wall no longer stands` }
      }
      const deferred = (Array.isArray(t.deferrals) ? t.deferrals.length : 0) +
                       (Array.isArray(last.residual) ? last.residual.filter(d => d && d.ac).length : 0)
      if (deferred > 0) log(`verify:${sliceArg} clean with ${deferred} runtime-evidence deferral(s) — recorded in 00-index runtime-evidence-deferrals; review proceeds, /wf ship blocks until cleared`)
      return last
    }
    // Bare blocked-runtime-evidence-missing means the subagent left a user-observable
    // AC un-evidenced WITHOUT applying the deferral the law requires. Proceeding
    // would silently drop that AC — HARD-STOP and make it re-runnable.
    if (t.result === 'blocked-runtime-evidence-missing') {
      return { ...last, status: 'hard-stop', hardStopReason: 'a user-observable AC has no runtime evidence and was not deferred — re-run /wf verify (it should defer un-producible evidence) or /wf probe in a capable environment; never fabricated' }
    }
    log(`verify:${sliceArg} round ${round} → convergence=${t.convergence} result=${t.result} substantiveResidual=${t.substantiveResidual === true}`)
    // The implement agent of an xs or s slice already ran its own 2 verify rounds: no verify agent follows.
    if (extra.first) {
      return { ...last, status: 'hard-stop', hardStopReason: `the verify in the implement agent of '${sliceArg}' did not converge after its 2 fix rounds (substantive issues remain)` }
    }
    if (round === 2) {
      return { ...last, status: 'hard-stop', hardStopReason: 'verify did not converge after 2 autonomous fix rounds (substantive issues remain)' }
    }
  }
  return last
}

// ---------------------------------------------------------------------------
// BOUNDED RE-VERIFY. A terminal-clean slice whose only residue is an open deferral
// gets a WALL PROBE: `wf.mjs defer check` runs the recorded clearing-probes in code,
// nothing else. If a wall fell, the evidence is now producible and a full verify is
// warranted — with a reason the driver can name. If the walls still stand, the slice
// needs no further work this run.
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

// `fresh` names the deferrals that a verify of this run recorded with no probe receipt; without
// it, the probe re-challenges the open deferrals of earlier runs.
async function driveWallProbe(sliceArg, idx, fresh = null) {
  const open = Array.isArray(fresh) && fresh.length
    ? fresh.map(d => ({ slice: sliceArg, ac: d.ac, reason: d.reason }))
    : (idx.priorDeferrals || []).filter(d => d && d.slice === sliceArg && d.authorized !== true)
  const lines = open.map(d => `    • ${d.ac ? `${d.ac} — ` : ''}${d.reason || '(no reason recorded)'}` +
    `${d.clearingEvent ? ` [clearing event: ${d.clearingEvent}]` : ''}` +
    `${d.clearingProbe ? ` [clearing probe: ${d.clearingProbe}]` : ''}`).join('\n')
  return await agent(
    `WALL RE-CHALLENGE for slug '${slug}', slice '${sliceArg}'. This slice is already built, verified, and (where ` +
    `applicable) reviewed — its ONLY residue is open runtime-evidence deferral(s). Your job is NOT to re-verify ` +
    `the slice. It is to answer one question per wall: **does this wall still stand?**\n\n` +
    `${EOB}\n\n` +
    `Open deferrals recorded for this slice in the index (00-index.md):\n${lines || '    (none)'}\n\n` +
    `1. Run \`${WF_CMD} defer check "${projectRoot}" ${slug} --next ${sliceArg} --json\` once. It runs the ` +
    `recorded clearing-probe of each open deferral in code; exit 1 only means that a deferral is needed now. For ` +
    `each entry of this slice: 'unchanged' → stands: true, with the probe and its output tail as the receipt, ` +
    `and do not probe it again; 'changed' → stands: false.\n` +
    `2. Only for an entry with state 'no-probe': run the capability probe named in its defer-reason once, and ` +
    `record the literal command plus a one-line output tail. Report stands: true when the wall is still there, ` +
    `stands: false when it has fallen.\n` +
    `Read-only: run the commands, write NOTHING — no artifacts, no index edits, no commits.` + steer('context') + `\n\n` +
    `Set escalateReason ONLY if you find something that genuinely warrants re-running the whole verify stage — ` +
    `the artifacts contradict the index, or a wall fell and its acceptance criterion now needs real evidence ` +
    `collected. Name it in one line; the driver records your reason as a decision so a later audit can see why ` +
    `the run chose bookkeeping over new work. If every wall still stands, leave escalateReason empty.` +
    heartbeatClause(`wall-probe:${sliceArg}`, 'Drive', 'wall-probe', sliceArg),
    { schema: WALL_PROBE_RESULT, label: `wall-probe:${sliceArg}`, phase: 'Drive', ...SONNET }
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
    `Read ${referenceRoot}/_decision-classes.md IN FULL, then read the stage record with \`${REC('get')} <name>\` ` +
    `(${res.artifactPath || 'the record of that stage'}) for the context each decision was made in. ` +
    `Classify EACH as 'implementation-detail' or 'intent-bearing' by that file's six tests. Write nothing.\n\n` +
    `Two rules that decide this round's worth:\n` +
    `- When a decision could plausibly be intent-bearing, classify it 'intent-bearing'. The cost of a false ` +
    `intent-bearing flag is the user reading one extra line; the cost of a false implementation-detail is an ` +
    `intent-bearing decision an autonomous run made silently, which is the exact escape this taxonomy exists ` +
    `to prevent.\n` +
    `- If you genuinely cannot tell from the artifact, return class 'unclassified' with a reason. Do NOT guess ` +
    `to fill the field — a guessed label is worse than an admitted gap, because it looks like knowledge.` +
    steer('classify') + `\n\n` +
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
      label: `classify:${res.stage}${res.slice ? ':' + res.slice : ''}`, phase: 'Drive', ...SONNET,
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

// A path of a finding or of the work packet: relative to the project root, with forward slashes.
function repoPath(p) {
  const root = String(projectRoot).replace(/\\/g, '/').replace(/\/+$/, '')
  let s = String(p || '').trim().replace(/\\/g, '/')
  if (root && s.toLowerCase().startsWith(`${root.toLowerCase()}/`)) s = s.slice(root.length + 1)
  return s.replace(/^\.\//, '')
}

// driveReview() — default (reviewFanout, on unless args pass false): hoist the
// dimension scan to the workflow for true parallelism, give every finding a refuter,
// then hand the merge, triage and fix loop to a wrapped review.md writer. The writer
// merges the findings into the ledger with `wf.mjs findings add` and writes the review
// file whole from it. Opt-out (args.reviewFanout === false): wrap review.md in ONE
// subagent (it runs the scouts and refuters itself per the reference).
async function driveReview(sliceArg, idx, extra = {}) {
  if (OPT.reviewFanout === false) {
    return await runStage('review', sliceArg, idx, { stopCheck: true, answered: extra.answered || null })
  }
  phase('Review')
  // The fan-out agents journal too, so the watch and the status see the review run.
  const beat = (label) => heartbeatClause(label, 'Review', 'review', sliceArg) +
    ` The two journal lines are the only writes of this agent.`
  const base = idx.branch.base || '<base>'
  // A check pass reads only the fix commits of the last review pass (extra.diffRange).
  const diffRange = extra.diffRange || (sliceArg ? 'HEAD' : `${base}...HEAD`)
  // An answered review runs the writer again with the answer, over the ledger of the last run.
  if (extra.answered && !extra.diffRange) {
    return await runStage('review', sliceArg, idx, { stopCheck: true, answered: extra.answered })
  }
  // 0. Select the rubrics the way the wrapped review stage does (review/_stage.md Step 2 +
  //    review/_select.md), so the fan-out reviews the same dimensions a manual review would.
  //    An RCA-forwarded workflow carries a recommended rubric (idx.reviewDimension) — it is
  //    always selected.
  const selection = await agent(
    `SELECT REVIEW RUBRICS for slug '${slug}'${sliceArg ? `, slice '${sliceArg}'` : ''}. READ-ONLY — write nothing.\n\n` +
    `Read ${referenceRoot}/review/_stage.md "# Step 2: Select Review Commands" and ${referenceRoot}/review/_select.md, ` +
    `then apply them to this change: read the index with \`${REC('get')} index\` (workflow-type), the ` +
    `shape and slice records with \`${REC('get')} <name>\`, and \`git -C ${projectRoot} diff --stat ${diffRange}\` plus the diff itself. Honor ` +
    `the core set (correctness, security, performance, architecture, and intent-fidelity for a lifecycle slug), ` +
    `the signal-driven rules, and the selection constraints (minimum and maximum).` +
    `${idx.reviewDimension ? ` Always include '${idx.reviewDimension}' (the forwarded RCA's recommended rubric).` : ''}` +
    `${extra.diffRange ? ` This scan reads only the fix commits of the last review pass, ${diffRange}: select the ` +
      `rubrics for that diff. When \`git -C ${projectRoot} diff --stat ${diffRange}\` prints nothing, return ` +
      `rubrics: [] and emptyDiff: true.` : ''}\n\n` +
    `Return affectedFiles: every file that \`git -C ${projectRoot} diff --name-only ${diffRange}\` prints, and each ` +
    `file that calls, imports or tests code that the diff changes (find them with \`git -C ${projectRoot} grep\` ` +
    `on the changed exports and names). Give each path relative to the project root, with forward slashes. ` +
    `Return rubrics: one entry per selected rubric as { rubric, file, focus, reason }, where file is the rubric's ` +
    `path relative to ${referenceRoot} (review/<name>.md, or design/audit.md / design/critique.md for the two ` +
    `design dimensions) and focus is the alias section to read, or empty for the whole rubric. Return ` +
    `steeringPresent: true when the steering command prints at least one entry, false otherwise.` + steer('context') +
    stopCheck() + ` When the stop-request check stops you, return rubrics: [], stopped: true and ` +
    `stopReason; otherwise return stopped: false.` + beat('select-rubrics'),
    { schema: RUBRIC_SELECTION, label: 'select-rubrics', phase: 'Review', ...SONNET }
  )
  if (selection && selection.stopped === true) {
    return { stage: 'review', slice: sliceArg || undefined, status: 'stopped', stopReason: selection.stopReason || 'stop request', artifactPath: '', terminal: {} }
  }
  // A check pass whose range holds no change has nothing to scan: the last pass stands.
  if (extra.diffRange && selection && selection.emptyDiff === true) {
    log(`review: no change in ${diffRange} — no check pass`)
    return { stage: 'review', slice: sliceArg || undefined, status: 'complete', emptyDiff: true, artifactPath: '', terminal: {} }
  }
  // The work packet: the scouts look only in these files, and a finding elsewhere is dropped.
  const affected = (selection && Array.isArray(selection.affectedFiles) ? selection.affectedFiles : []).map(repoPath).filter(Boolean)
  const inPacket = new Set(affected)
  const packetLine = affected.length
    ? ` Look for issues ONLY in the files of the work packet: ${JSON.stringify(affected)}. Report only an issue that ` +
      `the change makes or touches; do not report debt that the change did not cause.`
    : ''
  const rubrics =(selection && Array.isArray(selection.rubrics) && selection.rubrics.length)
    ? selection.rubrics.filter(r => r && r.rubric && r.file)
    : [...new Set([idx.reviewDimension, 'correctness', 'security', 'performance', 'architecture'].filter(Boolean))]
        .map(r => ({ rubric: r, file: `review/${r}.md`, focus: '' }))
  if (!selection) log('review fan-out: rubric selection did not return — scouting the core set (correctness, security, performance, architecture)')
  // 1. Parallel read-only dimension scouts. Each returns findings in the shape of the ledger.
  const shape = `Return each finding as { id, dimension, severity (BLOCKER|HIGH|MED|LOW|NIT), confidence, file, line, ` +
    `issue, evidence, fix, preExisting, changesAcceptance }, per ${referenceRoot}/review/_dispatch.md Step 3: ` +
    `preExisting is true when the diff does not touch the flagged lines; changesAcceptance is true when the fix ` +
    `changes an acceptance check of the slice, a confirmed design board or a 02c-craft.md line. Write nothing.`
  const scouts = await parallel(rubrics.map(r => () => agent(
    `READ-ONLY review of slug '${slug}'${sliceArg ? `, slice '${sliceArg}'` : ''} along the '${r.rubric}' rubric ONLY` +
    `${r.focus ? ` (focus: ${r.focus})` : ''}. Read ${referenceRoot}/${r.file}` +
    `${r.focus ? ` — the '${r.focus}' section and '# Severity calibration'` : ' in full'}, and apply it as the ` +
    `rubric's own severity scale. Inspect the diff: \`git -C ${projectRoot} diff ${diffRange}\`. Report only ` +
    `findings the diff supports, with dimension '${r.rubric}'.${packetLine} ${shape}\n\n${EOB}` + steer('context') +
    beat(`scout:${r.rubric}${r.focus ? ':' + r.focus : ''}`),
    { schema: FINDINGS_SCHEMA, label: `scout:${r.rubric}${r.focus ? ':' + r.focus : ''}`, phase: 'Review', ...SONNET }
  ).then(s => (s && Array.isArray(s.findings) ? s.findings : []).map(f => ({ ...f, dimension: f.dimension || r.rubric })))))
  // Standing steering — one more scout whose rubric is the user's steer entries. It runs only
  // when rubric selection saw an entry, and it reads the entries itself (never a copy).
  const steeringScout = selection && selection.steeringPresent === true
    ? await agent(
        `READ-ONLY review of slug '${slug}'${sliceArg ? `, slice '${sliceArg}'` : ''} along the standing-steering ` +
        `rubric ONLY. Inspect the diff: \`git -C ${projectRoot} diff ${diffRange}\`. Use dimension 'steering'.` +
        `${packetLine} ${shape}\n\n${EOB}` + steer('scout') + beat('scout:steering'),
        { schema: FINDINGS_SCHEMA, label: 'scout:steering', phase: 'Review', ...SONNET }
      )
    : null
  const scanned = [
    ...scouts.filter(Boolean).flat(),
    ...((steeringScout && steeringScout.findings) || []).map(f => ({ ...f, dimension: 'steering' })),
  ]
  // A finding outside the work packet gets no refuter: the merge would drop it anyway.
  const raw = inPacket.size ? scanned.filter(f => !f || !f.file || inPacket.has(repoPath(f.file))) : scanned
  if (raw.length < scanned.length) log(`review fan-out: ${scanned.length - raw.length} finding(s) outside the work packet dropped`)
  // 2. Every finding gets a refuter. One refuter checks up to REFUTE_GROUP_SIZE findings
  //    of one rubric. A refuted finding stays, with the refuter's reason: the ledger keeps it.
  const withIds = raw.map((f, i) => ({ ...f, id: f && f.id ? `${f.dimension}:${f.id}` : `f${i + 1}`, rubric: f.dimension }))
  const groups = refuteGroups(withIds, Infinity)
  const checked = await parallel(groups.map((g, gi) => () =>
    agent(
      `Adversarially REFUTE ${g.length === 1 ? 'this code-review finding' : `each of these ${g.length} code-review findings`}. ` +
      `A finding is refuted when the code does not do what it says, when a guard elsewhere prevents the failure, ` +
      `or when the failure cannot happen with the inputs that reach the code. Read the code at HEAD in ` +
      `${projectRoot} (read-only); do not reason from the finding's text alone. When you cannot refute a finding, ` +
      `it stands. Findings: ${JSON.stringify(g)}. Return { verdicts: [{ id, refuted, reason }] }, one for each ` +
      `finding, each reason with file:line.` + steer('refute') +
      beat(`refute:${g.length === 1 ? g[0].id : `${g[0].rubric || 'group'}#${gi + 1}`}`),
      { schema: REFUTE_GROUP, label: `refute:${g.length === 1 ? g[0].id : `${g[0].rubric || 'group'}#${gi + 1}`}`, phase: 'Review', ...SONNET }
    ).then(v => g.map(f => {
      const hit = v && Array.isArray(v.verdicts) ? v.verdicts.find(x => x && x.id === f.id) : null
      const { id, rubric, ...finding } = f
      return hit && hit.refuted === true ? { ...finding, refuted: String(hit.reason || 'refuted') } : finding
    }))
  ))
  const findings = checked.filter(Boolean).flat()
  const refuted = findings.filter(f => f.refuted).length
  log(`review fan-out: ${raw.length} raw findings → ${findings.length - refuted} stand, ${refuted} refuted (kept in the ledger with the refuter's reason)`)
  const dimensions = [...new Set([...rubrics.map(r => r.rubric), ...(steeringScout ? ['steering'] : [])])]
  // 3. Wrapped writer — review.md owns the ledger merge, triage, fix loop and review file.
  return await runStage('review', sliceArg, idx, {
    scan: { dimensions, findings, affectedFiles: affected, files: [...new Set(rubrics.map(r => r.file))], ...(extra.diffRange ? { checkPass: extra.diffRange } : {}) },
    ...(extra.answered ? { answered: extra.answered } : {}),
  })
}

// The commit at HEAD, read by a bookkeeping agent: the script has no shell. Null when the
// agent returns no commit id.
async function headCommit(label) {
  const r = await agent(
    `READ-ONLY bookkeeping for slug '${slug}'. Run exactly \`git -C ${projectRoot} rev-parse HEAD\` and return ` +
    `{ head } with the commit id that it prints. Run nothing else, and write nothing.` +
    heartbeatClause(label, 'Review', 'review', null),
    { schema: { type: 'object', required: ['head'], properties: { head: { type: 'string' } } }, label, phase: 'Review', ...HAIKU } // mechanical git; pinned per _subagents.md
  )
  const head = r && typeof r.head === 'string' ? r.head.trim() : ''
  return /^[0-9a-f]{7,40}$/.test(head) ? head : null
}

// runUpdateDepsExec() — the self-managed execution stage for workflow-type
// update-deps. update-deps does NOT decompose into /wf implement + /wf verify (those
// references redirect back to intake); its intake reference SELF-AUTHORS 05/06 in tier
// order. So yolo wraps intake/update-deps.md Steps 6–9 in ONE subagent — same "wrap,
// not fork" contract as runStage — with the Step 6 scope gate resolved by the card of
// intake/update-deps.md (full plan, defer failures), self-authoring 05-implement.md +
// 06-verify.md, then STOPPING before review. Its terminal gate IS the verify gate, so
// it returns stage:'verify' — evaluateGate('verify') and collectDeferrals then treat it
// identically to a standard verify stage.
async function runUpdateDepsExec(idx) {
  return await agent(
    `Execute the SELF-MANAGED update-deps execution for slug '${slug}', FULLY AUTONOMOUSLY (no human in the loop).\n\n` +
    `${EOB}\n\n` +
    `Read ${referenceRoot}/intake/update-deps.md IN FULL and follow Steps 6–9 VERBATIM. Its scan/research/` +
    `prioritize/slice/plan (Steps 1–5) are ALREADY DONE on disk — 01-update-deps.md, 02-shape.md, 03-slice.md and ` +
    `04-plan.md are complete; you START at Step 6. Wherever the reference asks the user or pauses for a human, ` +
    `resolve it by the "## Card" section of intake/update-deps.md (a driver run): the full plan, a failed ` +
    `package blocked and the run continuing, and the stop after 06-verify.md.` +
    questionContract('update-deps') + (DELEGATE ? delegateClause(WF_CMD) : '') +
    answeredClause(answeredFor(ANSWERED, 'update-deps', null), 'update-deps') +
    reChallengeClause(idx.priorDeferrals, `${WF_CMD} defer check "${projectRoot}" ${slug}`) +
    steer('writer') + `\n\n` +
    `Operating rules:\n` +
    `- Your mandate is ONLY the self-managed update-deps exec (05-implement.md + 06-verify.md) for slug '${slug}'. ` +
    `Do NOT run /wf review or /wf ship, do NOT claim completion of the whole workflow, and do NOT recommend ` +
    `routes beyond what update-deps.md Steps 6–9 themselves return.\n` +
    `- Project root ${projectRoot} is ABSOLUTE. Resolve every artifact path under it and run git as ` +
    `\`git -C ${projectRoot} …\`. Do not rely on your working directory — it is not this repo.\n` +
    `- Write SCHEMA-COMPLETE frontmatter for 05-implement.md and 06-verify.md: a strict validator enforces the full ` +
    `sdlc/v1 contract and rejects an incomplete write. Match update-deps.md Step 7/8 field-for-field.\n` +
    `- Record EVERY autonomous decision into the artifacts (## Updated / ## Blocked / ## Held in 05-implement.md; ` +
    `## Test Result / ## Build / ## Blocked packages in 06-verify.md) so this run is exactly as auditable as a ` +
    `human-gated one. Nothing dies silently inside an artifact.\n` +
    `- STOP after writing 06-verify.md — do NOT route to /wf review or /wf ship and do NOT run the review. yolo ` +
    `runs the slug-wide review as its own next stage.\n\n` +
    `Return the terminal state as a STAGE_RESULT with stage:'verify' (its gate IS the verify gate): status ` +
    `('complete' when 06 is convergence ∈ {not-needed, converged} with result pass or a deferral-only partial; ` +
    `'hard-stop' when the policy stopped you), artifactPath = the 06-verify.md path, and terminal ` +
    `{ convergence, result, deferrals ([] if none), substantiveResidual } — plus the decisions you recorded and ` +
    `any residual (blocked / held packages). Return status 'stopped' when the stop-request check stopped you, ` +
    `and status 'questions' with the questions when an intent-bearing decision waits for the person.` +
    stopCheck() +
    requiresClause(`${referenceRoot}/intake/update-deps.md`) +
    CONTROL_FILE_RULE + deadDriverClause(idx.priorRun) + DECISION_CONTRACT +
    heartbeatClause('update-deps:exec', 'Drive', 'update-deps-exec', null),
    { schema: STAGE_RESULT, label: 'update-deps:exec', phase: 'Drive', ...stageModel('update-deps') }
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
    if (exec && exec.status === 'stopped') {
      return { ok: false, mode: 'update-deps', stopped: true, stoppedAt: 'stop-request', reason: exec.stopReason || 'stop request', ran, route: `/wf yolo ${slug}` }
    }
    ran.push(exec)
    if (exec && exec.status === 'questions') return { ok: false, mode: 'update-deps', ...questionStop(exec), ran }
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
  let rev = await driveReview(null, idx, { answered: answeredFor(ANSWERED, 'review', null) })
  if (rev && rev.status === 'stopped') {
    return { ok: false, mode: 'update-deps', stopped: true, stoppedAt: 'stop-request', reason: rev.stopReason || 'stop request', ran, route: `/wf yolo ${slug}` }
  }
  if (rev && Array.isArray(rev.decisions) && rev.decisions.length) rev = await classifyDecisions(rev, idx)
  ran.push(rev)
  if (rev && rev.status === 'questions') return { ok: false, mode: 'update-deps', ...questionStop(rev), ran, slugWide: rev }
  const stopped = !rev || rev.status === 'hard-stop' || evaluateGate('review', rev) === 'hard-stop'
  const probeGapsField = execProbeGaps.length ? { probeGaps: execProbeGaps } : {}
  return stopped
    ? { ok: false, mode: 'update-deps', stopped: true, stoppedAt: 'review', reason: (rev && rev.hardStopReason) || 'slug-wide review did not clear the gate', ran, slugWide: rev, ...probeGapsField, route: `address the review blockers, then re-run /wf yolo ${slug}` }
    : { ok: true, mode: 'update-deps', stopped: false, ran, slugWide: rev, ...probeGapsField, route: `/wf ship ${slug}` }
}


// The stop of a stage that returned questions: the run stops, and the main session asks them.
function questionStop(res) {
  const questions = questionsOf(res)
  const at = (res && res.stage) || 'stage'
  return {
    stopped: true, stoppedAt: at, questions,
    reason: questions.length
      ? `${at} waits for the person: ${questionsText(questions)}`
      : `${at} returned status questions without a question`,
    route: `answer the questions, then re-run /wf yolo ${slug}`,
  }
}

// The stages of a slice, in walk order. A route back runs its target and every later stage again.
const CHAIN_ORDER = ['plan', 'implement', 'verify', 'review']

// driveChain() — run stages sequentially for one slice, skipping any already
// terminal-clean on disk (free resume), gating each per policy, HARD-STOPping
// (and returning the trail) when the policy says so.
//
// W2.2: `bounded` marks a slice scheduled as a re-challenge sweep rather than as
// new work. Its verify runs as a cheap WALL PROBE first, and only escalates to a
// full verify dispatch for a reason the driver can name and records as a decision.
// W3.3: each stage's decisions pass through one corrective classification round.
// W5.2: a chain that completes writes the slice's status back to the control files.
// A stage that returns questions stops the chain. The relaunch carries the answers in
// args.answered: each answer reaches the stage that asked it. An answered stage can route
// back to an earlier stage; that stage and every later stage run again with the answer.
// Implements that cleared in this run: a plan written before them can be out of date.
let codeMoved = 0

// The plan check of a slice whose plan was written before code changed under it: a read-only agent.
const PLAN_CHECK_RESULT = {
  type: 'object',
  required: ['stale'],
  properties: {
    stale: {
      type: 'array',
      items: { type: 'object', required: ['slice', 'reason'], properties: { slice: { type: 'string' }, reason: { type: 'string' } } },
    },
  },
}

async function planFreshness(sliceArg) {
  const r = await agent(
    `PLAN FRESHNESS CHECK for slice '${sliceArg}' of slug '${slug}'. READ-ONLY — write, edit and commit nothing. ` +
    `The project root ${projectRoot} is ABSOLUTE; run git as \`git -C ${projectRoot} …\`.\n\n${EOB}\n\n` +
    `1. Read the plan IN FULL with \`${REC('get', `04-plan-${sliceArg}.md`)}\`. Its frontmatter carries ` +
    `\`files:\` and \`edges:\`.\n` +
    `2. Find the commits since the plan was last written: \`git -C ${projectRoot} log --oneline <the last commit ` +
    `that changed ${projectRoot}/.ai/workflows/${slug}/slice-${sliceArg}.yaml>..HEAD\`, or the last 20 commits ` +
    `when that file is not committed.\n` +
    `3. Read the files and interfaces that the plan names, as they are at HEAD.\n` +
    `4. The plan is stale only when the code at HEAD contradicts it, so an implement would follow wrong steps: ` +
    `a file it edits moved or changed shape, an interface it calls changed, or work it plans already exists. ` +
    `New code that the plan does not touch does not make it stale. Return stale: [{ slice: '${sliceArg}', ` +
    `reason }] when it is stale, and stale: [] when it still fits.` + steer('context') +
    heartbeatClause(`plan-check:${sliceArg}`, 'Drive', 'plan-check', sliceArg),
    { schema: PLAN_CHECK_RESULT, label: `plan-check:${sliceArg}`, phase: 'Drive', ...SONNET }
  )
  const s = ((r && r.stale) || []).find(x => x && x.slice === sliceArg)
  return s ? { fresh: false, reason: s.reason || 'the code changed under the plan' } : { fresh: true }
}

// One implement agent for the whole slice. A re-run resumes after the last committed step.
async function implementSlice(sliceArg, idx, entry, answered, selfVerify = false) {
  return await runStage('implement', sliceArg, idx, { stopCheck: true, answered, selfVerify })
}

async function driveChain(stages, sliceArg, idx, opts = {}) {
  const entry = idx.slices.find(s => s.slice === sliceArg)
  const done = (entry && entry.stages) || {}
  const ran = []
  const ranStages = []
  // A plan written before an earlier implement of this run gets one check; a stale one is
  // refreshed before the implement runs.
  const queue = [...stages]
  let refresh = null
  let freshChecked = false
  // A route back forces stages that are done on disk, and carries the answer to each of them.
  // A caller that routes back (the slug-wide review) gives the first forced stage and the answer.
  const forced = new Set()
  let carried = null
  let routeBacks = 0
  // The stage that the last route back went to, and whether the forced implement after it
  // moved HEAD. A forced verify at an unchanged HEAD, after a clean verify, runs no checks again.
  let routedTo = null
  let headBefore = null
  let noCodeChange = false
  // An xs or s slice verifies in its implement agent; that verify result stands in for verify round 1.
  const selfVerify = !!entry && SELF_VERIFY_SIZES.includes(entry.complexity) && stages.includes('verify')
  let selfVerified = null
  if (opts.forceFrom && CHAIN_ORDER.includes(opts.forceFrom)) {
    CHAIN_ORDER.slice(CHAIN_ORDER.indexOf(opts.forceFrom)).filter(s => stages.includes(s)).forEach(s => forced.add(s))
    carried = opts.carried ? { ...opts.carried, routedBack: opts.forceFrom } : null
    routedTo = opts.forceFrom
  }
  while (queue.length) {
    const stage = queue.shift()
    if (done[stage] === 'done' && !forced.has(stage) && !(stage === 'plan' && refresh)) { log(`skip ${stage}:${sliceArg} (already terminal-clean)`); continue }
    // A verify that a route back to plan or implement forced, when that implement made no
    // commit and the slice verified clean before: nothing changed, so the clean result stands.
    // A route back to verify itself always runs it: the answer asks verify to check something new.
    if (stage === 'verify' && forced.has('verify') && routedTo !== 'verify' && noCodeChange && done.verify === 'done') {
      log(`skip verify:${sliceArg} (no code change since the clean verify at ${headBefore})`)
      ran.push({
        stage: 'verify', slice: sliceArg, status: 'complete', accepted: true, skipped: true, artifactPath: '', terminal: {},
        decisions: [{ class: 'implementation-detail', decision: `verify of '${sliceArg}' kept its clean result: the implement after the route back made no commit (HEAD ${headBefore})${carried && carried.key ? `; the answer ${carried.key} is carried as accepted` : ''}` }],
      })
      continue
    }
    if (stage === 'implement' && forced.has('implement')) headBefore = await headCommit(`head:before-implement:${sliceArg}`)
    if (stage === 'implement' && !freshChecked && !ranStages.includes('plan') && codeMoved > 0 && done.plan === 'done') {
      freshChecked = true
      const f = await planFreshness(sliceArg)
      if (!f.fresh) {
        log(`the plan of '${sliceArg}' is out of date: ${f.reason} — refreshing it before implement`)
        refresh = { reason: f.reason }
        queue.unshift('plan', 'implement')
        continue
      }
    }

    // ---- W2.2 bounded re-verify -------------------------------------------
    // Only for a slice whose sole residue is an open deferral (reverifyReason
    // 'deferral-rechallenge'). Everything else drives normally.
    if (opts.bounded === true && stage === 'verify' && !forced.has('verify')) {
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

    // C2: an implement that hard-stopped SPLIT_AFTER_STOPS times on this slice runs no third time.
    if (stage === 'implement' && ((entry && entry.implementStops) || 0) >= SPLIT_AFTER_STOPS) {
      return {
        stopped: true, at: 'implement', slice: sliceArg, ran, split: true,
        reason: `implement of '${sliceArg}' hard-stopped ${entry.implementStops} times: split the slice (/wf slice ${slug}), ` +
          `or record a retry (\`${WF_CMD} step retry "${projectRoot}" ${slug} ${sliceArg}\`) and run /wf yolo ${slug} again`,
      }
    }
    // The answer that reaches this stage: one a route back carries, or one from args.answered.
    const answered = carried || answeredFor(ANSWERED, stage, sliceArg)
    log(`yolo → ${stage} ${slug} ${sliceArg}${answered ? ` (answered: ${answered.key || 'answer'})` : ''}`)
    // A verify answer that the implement agent did not see needs its own verify agent.
    const firstVerify = stage === 'verify' && selfVerified && (carried || !answered) ? selfVerified : null
    if (firstVerify) log(`verify:${sliceArg} ran in the implement agent (complexity ${entry.complexity}) — no separate verify agent`)
    if (stage === 'implement') selfVerified = null
    let res =
      stage === 'implement' ? await implementSlice(sliceArg, idx, entry, answered, selfVerify)
      : stage === 'verify' ? await driveVerify(sliceArg, idx, { answered, ...(firstVerify ? { first: firstVerify } : {}) })
      : stage === 'review' ? await driveReview(sliceArg, idx, { answered })
      : stage === 'plan' && refresh ? await runStage(stage, sliceArg, idx, { stopCheck: true, refresh, answered })
      : await runStage(stage, sliceArg, idx, { stopCheck: true, answered })
    // G2 — the stage agent found a stop or pause request and did no work. The stage did
    // not run, so it joins neither ran nor the write-back; the resume runs it again.
    if (res && res.status === 'stopped') {
      return { stopped: true, at: 'stop-request', slice: sliceArg, ran, stopRequest: true, reason: `${res.stopReason || 'stop request'} — stopped before ${stage}:${sliceArg}` }
    }
    // W3.3 — one corrective classification round for decisions the stage left
    // unstamped. Read-only and cheap; never re-runs the stage itself.
    if (res && Array.isArray(res.decisions) && res.decisions.length) res = await classifyDecisions(res, idx)
    ran.push(res)
    ranStages.push(stage)
    // An intent-bearing decision waits for the person: the chain stops, and the run with it.
    if (res && res.status === 'questions') {
      const q = questionStop({ ...res, stage, slice: sliceArg })
      return { stopped: true, at: stage, slice: sliceArg, ran, questions: q.questions, reason: q.reason, route: `answer the questions, then re-run /wf yolo ${slug}${idx.mode === 'slice' ? ' ' + sliceArg : ''}` }
    }
    // An answered stage routes back: its target and every later stage of the slice run again.
    const back = res && answered && CHAIN_ORDER.includes(res.routeBack) && CHAIN_ORDER.indexOf(res.routeBack) <= CHAIN_ORDER.indexOf(stage)
      ? res.routeBack : null
    if (back) {
      if (routeBacks >= MAX_ROUTE_BACKS) {
        return { stopped: true, at: stage, slice: sliceArg, ran, reason: `${stage} of '${sliceArg}' routed back to ${back} ${routeBacks + 1} times on one answer — the answer does not settle; ask the person again` }
      }
      routeBacks++
      const again = CHAIN_ORDER.slice(CHAIN_ORDER.indexOf(back)).filter(s => s === back || stages.includes(s))
      log(`${stage}:${sliceArg} routes back to ${back} on the answer ${answered.key || ''} — running ${again.join(' → ')} again`)
      again.forEach(s => forced.add(s))
      routedTo = back
      noCodeChange = false
      carried = { ...answered, routedBack: back }
      queue.length = 0
      queue.push(...again)
      continue
    }
    if (!res || res.status === 'hard-stop') {
      return { stopped: true, at: stage, slice: sliceArg, ran, reason: (res && res.hardStopReason) || `${stage} stopped` }
    }
    // A verify that the person accepted on an answer passes with its residual items.
    if (!(stage === 'verify' && res.accepted === true) && evaluateGate(stage, res) === 'hard-stop') {
      return { stopped: true, at: stage, slice: sliceArg, ran, reason: `${stage} terminal state did not clear the gate: ${JSON.stringify(res.terminal || {})}` }
    }
    if (stage === 'plan') refresh = null
    if (stage === 'implement') codeMoved++
    if (stage === 'implement' && selfVerify) {
      selfVerified = res.verify && typeof res.verify === 'object' ? res.verify : null
      if (!selfVerified) log(`implement:${sliceArg} returned no verify — a verify agent runs`)
    }
    if (stage === 'implement' && forced.has('implement') && headBefore) {
      const headAfter = await headCommit(`head:after-implement:${sliceArg}`)
      noCodeChange = headAfter === headBefore
    }
  }
  // W5.2 — the chain cleared every gate: record the slice as complete at DRIVE
  // time. Only when this run actually drove something (a chain that skipped every
  // stage as already-done has nothing new to write back).
  // E4: the verify agent of this chain did the mirror as its last step; the agent below is the fallback.
  // A write-back that reports ok but names no record wrote nothing: that is a failure, not a success.
  const wroteSome = (w) => w && w.ok === true && Array.isArray(w.wrote) && w.wrote.length > 0
  const mirrored = ran.find(r => r && wroteSome(r.sliceWriteBack))
  if (ranStages.length && mirrored) {
    log(`slice '${sliceArg}' complete → the verify agent wrote status back to ${mirrored.sliceWriteBack.wrote.join(', ')}`)
  } else if (ranStages.length) {
    const wb = await writeBackSliceStatus(sliceArg, idx, ranStages)
    if (wroteSome(wb)) log(`slice '${sliceArg}' complete → wrote status back to ${wb.wrote.join(', ')}`)
    else if (wb && wb.ok) log(`slice '${sliceArg}' complete but the write-back wrote nothing${wb.note ? `: ${wb.note}` : ''} — /wf ship will self-repair the index`)
    else log(`slice '${sliceArg}' complete but the status write-back did not confirm${wb && wb.note ? `: ${wb.note}` : ''} — /wf ship will self-repair the index`)
  }
  return { stopped: false, slice: sliceArg, ran }
}

// The slug-wide review, the run's target after every slice verified. The review fixes every
// finding itself, one step and one commit at a time; it asks nothing and sends nothing back.
// Then up to REVIEW_CHECK_PASSES passes scan only the fix commits of the pass before, and fix
// what they find the same way. Returns the slug outcome.
async function slugWideReview(idx, results) {
  log(`yolo → review ${slug} (slug-wide)`)
  let from = await headCommit('head:review-start')
  // The walk put the defects of a fidelity row or a try-out in the ledger: the review fixes
  // them and scans only its own fix commits, not the work packet again.
  let rev = OPT.reviewFindings === true
    ? await runStage('review', null, idx, { stopCheck: true, ledgerOnly: true })
    : await driveReview(null, idx, { answered: answeredFor(ANSWERED, 'review', null) })
  for (let pass = 1; pass <= REVIEW_CHECK_PASSES && rev && rev.status === 'complete' && from; pass++) {
    const fixes = Array.isArray(rev.fixCommits) ? rev.fixCommits.filter(Boolean) : []
    if (!fixes.length) break
    const next = await headCommit(`head:review-pass-${pass}`)
    log(`yolo → review ${slug} (check pass ${pass}: the ${fixes.length} fix commit(s) in ${from}...HEAD)`)
    const again = await driveReview(null, idx, { diffRange: `${from}...HEAD` })
    if (!again || again.emptyDiff === true) break
    rev = again
    from = next
  }
  const stopped = !rev || rev.status === 'hard-stop' || evaluateGate('review', rev) === 'hard-stop'
  return !rev
    // A null return = the review subagent was skipped or died on a transient error: a re-run retries it.
    ? { ok: false, mode: 'slug', reviewScope: 'slug-wide', stopped: true, stoppedAt: 'review', transient: true, reason: 'the slug-wide review did not return (subagent skipped or hit a transient API error) — re-run to retry it; resume skips completed stages', results, route: `/wf yolo ${slug}` }
    : rev.status === 'stopped'
    ? { ok: false, mode: 'slug', reviewScope: 'slug-wide', stopped: true, stoppedAt: 'stop-request', reason: `${rev.stopReason || 'stop request'} — stopped before the slug-wide review`, results, route: `/wf yolo ${slug}` }
    : rev.status === 'questions'
    ? { ok: false, mode: 'slug', reviewScope: 'slug-wide', ...questionStop(rev), results, slugWide: rev }
    : stopped
    ? { ok: false, mode: 'slug', reviewScope: 'slug-wide', stopped: true, stoppedAt: 'review', reason: rev.hardStopReason || ((rev.terminal || {}).couldNotFixBlockers ? `the review could not fix ${rev.terminal.couldNotFixBlockers} BLOCKER finding(s)` : 'slug-wide review did not clear the gate'), results, slugWide: rev, route: `address the review blockers, then re-run /wf yolo ${slug}` }
    : { ok: true, mode: 'slug', reviewScope: 'slug-wide', stopped: false, results, slugWide: rev, route: `/wf ship ${slug}` }
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
    // Standing steering — the steer entries (read fresh by the checkpoint) that the built
    // code contradicts. A 'veto' violation stops the run; a 'preference' one is surfaced.
    steeringViolations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['entry', 'kind'],
        properties: {
          entry: { type: 'string' },
          kind: { enum: ['veto', 'preference'] },
          note: { type: 'string' },
        },
      },
    },
  },
}

// charterCheckpoint() — W11.1: every K slices, a cheap read-only subagent reads the charter
// and the last K implement artifacts and asks "is the build still advancing each commitment?".
// A `broken` verdict is a stop; at-risk is surfaced. Read-only — it never writes.
async function charterCheckpoint(idx, throughSlice) {
  const charterList = (idx.charter || []).map(c => `${c.id}: ${c.commitment}`).join('\n    ')
  return await agent(
    `CHARTER FIDELITY CHECKPOINT for slug '${slug}', after slice '${throughSlice}'. READ-ONLY — do not ` +
    `write, edit, or commit. Project root ${projectRoot} is ABSOLUTE; run git as \`git -C ${projectRoot} …\`.\n\n` +
    `The intake committed to these charter commitments:\n    ${charterList}\n\n` +
    `List the records with \`${REC('list')}\`, read the last few implement records with ` +
    `\`${REC('get')} <name>\`, and inspect the built ` +
    `code they touched. For EACH commitment, judge whether the build so far is still ADVANCING it: 'honored' ` +
    `(the code visibly serves it), 'at-risk' (drifting — a decision has weakened it), or 'broken' (the code ` +
    `now contradicts it — e.g. the intake said the model owns a decision and the code hard-codes it). Return ` +
    `{ commitments: [{id, status, note}], summary }. Judge against the CODE, not the artifacts' claims.` +
    steer('checkpoint') +
    heartbeatClause(`checkpoint:${throughSlice}`, 'Drive', 'charter-checkpoint', throughSlice),
    { schema: CHECKPOINT_RESULT, label: `checkpoint:${throughSlice}`, phase: 'Drive', ...SONNET }
  )
}


const RUN_END_RESULT = {
  type: 'object',
  required: ['ended'],
  properties: { ended: { type: 'boolean' }, worktreesKept: { type: 'array', items: { type: 'string' } } },
}

// WF-SYSTEM-REVIEW A3 + E4: the last agent of every run that has a run id. It writes
// the run-end line with the stop and its reason. The `end` command appends nothing when the run has a run-end line
// already, so the main session's own `end` after the Workflow returns is harmless.
function shellText(s) {
  const t = String(s ?? '').replace(/\s+/g, ' ').replace(/[`$"\\]/g, "'").slice(0, 300)
  return '"' + t + '"'
}
async function runEnd(stoppedAt = null, reason = null, progress = null) {
  const endCmd = `node "${WATCH}" end "${projectRoot}" ${slug} --run ${shellText(RUN_ID)} --agent run-end` +
    `${stoppedAt ? ` --stopped-at ${shellText(stoppedAt)}` : ''}${reason ? ` --reason ${shellText(reason)}` : ''}`
  const p = progress || { status: stoppedAt ? 'stopped' : 'done' }
  const progressCmd = `${WF_CMD} progress set "${projectRoot}" ${slug} --run ${shellText(RUN_ID)} --driver yolo ` +
    `--status ${p.status}${p.reason ? ` --reason ${shellText(p.reason)}` : ''}${p.resume ? ` --resume ${shellText(p.resume)}` : ''}`
  const worktreeCmd = `${WF_CMD} worktree remove "${projectRoot}" ${slug}`
  return await agent(
    `RUN END for slug '${slug}'. Bookkeeping only. Never write, edit, or truncate any ` +
    `file other than ${JOURNAL_PATH}, and write that file only with the command below. ` +
    `The command of step 3 removes the scratch worktrees of the slug; delete nothing else.\n` +
    `1. Run \`${endCmd}\`. It appends the run-end line.\n` +
    `2. Run \`${progressCmd}\`. It writes where the run stands.\n` +
    `3. Run \`${worktreeCmd}\`. It removes the copies of the repo that the stages left in .scratch/worktrees/${slug}/. ` +
    `When it exits 1, put each \`kept\` line of its output in worktreesKept.\n` +
    `Return { ended: true } when the commands of steps 1 and 2 exit 0, else { ended: false }. Step 3 does not change ended.` +
    heartbeatClause('run-end', 'Drive', 'run-end', null),
    { schema: RUN_END_RESULT, label: 'run-end', phase: 'Drive', ...HAIKU } // mechanical bookkeeping; pinned per _subagents.md
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
// W1 — adopt the runId orient minted (this script has no clock of its own) so every
// later heartbeat is attributable to THIS run.
RUN_ID = GIVEN_RUN_ID || (idx.runId && String(idx.runId).trim()) || `run-${slug}`
// W1.2/W1.3 — say what the PREVIOUS driver's journal shows, before anything else.
// Silence is the finding: a driver that died leaves a journal that simply stops, and
// the whole point is that this is now stated rather than inferred away.
const priorDriver = idx.priorRun && idx.priorRun.present === true ? idx.priorRun : null
if (priorDriver && priorDriver.presumedDead === true) {
  log(`prior driver PRESUMED DEAD — journal silent since ${priorDriver.lastEntryAt} (${Math.round(priorDriver.minutesSinceLastEntry || 0)} min; its own longest gap was ${Math.round(priorDriver.longestGapMinutes || 0)} min), last seen at ${priorDriver.lastStage || 'an unknown stage'}${priorDriver.lastSlice ? ` on '${priorDriver.lastSlice}'` : ''}. Its partial writes are treated as suspect: every stage re-reads control files fresh before editing.`)
} else if (priorDriver && priorDriver.stoppedCleanly === true) {
  log(`prior driver stopped cleanly at ${priorDriver.lastStage || 'an unknown stage'}${priorDriver.lastSlice ? ` on '${priorDriver.lastSlice}'` : ''} (${priorDriver.lastStatus || 'no status'}, ${priorDriver.lastEntryAt}) — resuming from its recorded state`)
}
if (!idx.ok) {
  const notReady = idx.blockReason || 'workflow not ready (intake/shape/design/slice/plan incomplete, or a terminal-analysis type with no decided build)'
  await runEnd('orient', notReady)
  return { ok: false, stopped: true, mode: idx.mode, reason: notReady, route: idx.route, ...(priorDriver ? { priorDriver } : {}) }
}
// Branch posture — DEDICATED only. Land the tree on the slug branch (create it from
// base-branch if it does not exist yet) BEFORE driving any stage, so the whole run —
// plan included — happens on the dedicated branch rather than leaving implement to
// mint it mid-chain. shared/none never switch: the drive runs on the checked-out tree.
let branchAction = null
if (idx.branch.strategy === 'dedicated' && !idx.branch.match) {
  const b = await ensureBranch(idx)
  if (!b || !b.ok) {
    await runEnd('branch', (b && b.reason) || 'dedicated branch posture could not be resolved')
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
    route = chain.route || `address the gate at '${chain.at}', then re-run /wf yolo ${slug} ${idx.targetSlice}`
  } else if (next) {
    route = `/wf yolo ${slug} ${next}`
  } else {
    route = idx.reviewScope === 'slug-wide' ? `/wf yolo ${slug}` : `/wf ship ${slug}`   // last slice → finalizer
  }
  outcome = { ok: !chain.stopped, mode: 'slice', slice: idx.targetSlice, reviewScope: idx.reviewScope, stopped: chain.stopped, stoppedAt: chain.at, reason: chain.reason, ran: chain.ran, route, ...(chain.questions ? { questions: chain.questions } : {}) }
} else {
  // ---- Slug mode — sequential over the roster. ---------------------------
  // Each slice runs plan → implement → verify before the next slice plans. Implement
  // writes code on the shared tree, so slices run one at a time.
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
    log(`work ordering: ${primary.filter(s => s.status !== 'skipped' && s.status !== 'dropped').length} slice(s) with real work run first; ${sweep.length} terminal-clean slice(s) whose only residue is an open deferral are re-challenged AFTER the target, as a bounded wall probe rather than a full re-verify`)
  }

  // driveRoster() — walk one partition. Returns a stop-outcome, or null when the
  // whole list cleared. `bounded` marks the re-challenge sweep (W2.2).
  async function driveRoster(list, bounded) {
    // A checkpoint window in which no stage ran cannot drift the charter, so it is
    // not re-checked: a resumed run otherwise re-checks every finished slice first.
    let workSinceCheckpoint = false
    for (let si = 0; si < list.length; si++) {
      const s = list[si]
      // An already-skipped roster entry (00-index slices[].status: skipped, with its
      // skip record) has nothing to drive — walking it into verify HARD-STOPs the
      // whole run at a slice a human already retired. Skip it, keep it countable.
      if (s.status === 'skipped' || s.status === 'dropped') {
        log(`slice '${s.slice}' is status: ${s.status} in the roster — skipping (it left the roster; nothing to drive)`)
        results.push({ slice: s.slice, skipped: true, ran: [], stopped: false })
        continue
      }
      const chain = await driveChain(perSliceStages, s.slice, idx, { bounded })
      results.push(chain)
      if (touchesCharter(chain.ran, idx.charter)) workSinceCheckpoint = true
      if (chain.stopped) {
        return { ok: false, mode: 'slug', reviewScope: idx.reviewScope, stopped: true, stoppedAt: chain.at, stoppedSlice: s.slice, reason: chain.reason, results, route: chain.route || `address the gate at '${chain.at}' on slice '${s.slice}', then re-run /wf yolo ${slug}`, ...(chain.questions ? { questions: chain.questions } : {}) }
      }
      // W11.1 — charter fidelity checkpoint every K slices (not after the last, which the
      // slug-wide review + final scenario cover). A `broken` commitment stops the run.
      // Only on the primary pass: the sweep builds nothing, so it cannot drift a charter.
      const isLast = si === list.length - 1
      const checkpointDue = !bounded && (idx.charter || []).length && !isLast && (si + 1) % CHECKPOINT_EVERY === 0
      if (checkpointDue && !workSinceCheckpoint) {
        log(`charter checkpoint after '${s.slice}' skipped — no work since the last checkpoint touched the charter`)
      } else if (checkpointDue) {
        workSinceCheckpoint = false
        const cp = await charterCheckpoint(idx, s.slice)
        if (cp) {
          charterCheckpoints.push({ throughSlice: s.slice, ...cp })
          const broken = (cp.commitments || []).filter(c => c && c.status === 'broken')
          const atRisk = (cp.commitments || []).filter(c => c && c.status === 'at-risk')
          if (atRisk.length) log(`charter checkpoint after '${s.slice}': ${atRisk.length} commitment(s) at-risk — ${atRisk.map(c => c.id).join(', ')}`)
          if (broken.length) {
            return { ok: false, mode: 'slug', reviewScope: idx.reviewScope, stopped: true, stoppedAt: 'charter-checkpoint', stoppedSlice: s.slice, reason: `charter commitment(s) BROKEN after '${s.slice}': ${broken.map(c => `${c.id} (${c.note || 'no note'})`).join('; ')} — the build has departed from what the intake committed to; a human must re-decide before continuing`, results, charterCheckpoints, route: `read the broken commitment(s), decide whether to re-shape or accept, then re-run /wf yolo ${slug}` }
          }
          // Standing steering — a crossed veto outranks every auto-resolve, so it stops the run.
          const vetoes = (cp.steeringViolations || []).filter(v => v && v.kind === 'veto')
          const prefs = (cp.steeringViolations || []).filter(v => v && v.kind === 'preference')
          if (prefs.length) log(`steering check after '${s.slice}': ${prefs.length} preference(s) not followed — ${prefs.map(v => v.entry).join('; ')}`)
          if (vetoes.length) {
            return { ok: false, mode: 'slug', reviewScope: idx.reviewScope, stopped: true, stoppedAt: 'steering-checkpoint', stoppedSlice: s.slice, reason: `steering veto(es) CROSSED after '${s.slice}': ${vetoes.map(v => `"${v.entry}"${v.note ? ` (${v.note})` : ''}`).join('; ')} — the built code contradicts the user's standing instructions in the decision store`, results, charterCheckpoints, route: `read the crossed veto(es) with wf.mjs decide list --kind steer, fix the code or supersede the entry, then re-run /wf yolo ${slug}` }
          }
        }
      }
    }
    return null
  }

  // WF-CAMPAIGN-SLICE-ORDER-PLAN 4.4: the walk follows depends-on, then roster order.
  outcome = await driveRoster(walkOrder(primary), false)
  if (!outcome) {
    if (reviewPer) {
      // Endpoint: every per-slice review clean. Stop before ship.
      outcome = { ok: true, mode: 'slug', reviewScope: 'per-slice', stopped: false, results, route: `/wf ship ${slug}` }
    } else {
      // slug-wide: every slice verified → ONE slug-wide review over the branch diff.
      // This is the run's TARGET, so it runs before the re-challenge sweep.
      outcome = await slugWideReview(idx, results)
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
  log(`runtime-evidence deferrals on this run: ${deferrals.length} — review proceeds; /wf ship blocks until each is cleared by /wf probe or a re-verify in a capable environment`)
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
// A3 — the last agent writes the run-end line, with the stop and its reason.
const cleanStop = outcome.stoppedAt === 'stop-request'
const waiting = Array.isArray(outcome.questions) && outcome.questions.length > 0
const resumeCmd = `/wf yolo ${slug}${slice ? ' ' + slice : ''}`
const ended = await runEnd(outcome.stopped ? (outcome.stoppedAt || 'stopped') : null, outcome.stopped && !cleanStop ? outcome.reason : null,
  waiting ? { status: 'waiting', reason: `${outcome.questions.length} question(s) wait for the person`, resume: resumeCmd }
  : outcome.stopped ? { status: 'stopped', reason: outcome.reason || outcome.stoppedAt || 'stopped', resume: resumeCmd }
  : { status: 'done', resume: outcome.route })
// A scratch worktree that the run end could not remove is the person's to look at.
if (ended?.worktreesKept?.length) {
  outcome.worktreesKept = ended.worktreesKept
  log(`scratch worktrees kept: ${ended.worktreesKept.join('; ')}`)
}
// The questions of a stopped run: the main session asks them, records each answer, and relaunches.
if (waiting) {
  outcome.route = `answer the questions, record each answer with decide add, then re-run ${resumeCmd} with args.answered`
  log(`yolo waits for the person: ${outcome.questions.length} question(s) — ${questionsText(outcome.questions)}`)
}
// Delegate mode: the person gets every delegate decision of this run in one list at the end.
if (DELEGATE) outcome.delegate = { digest: `${WF_CMD} decide list "${projectRoot}" ${slug} --by delegate` }
// Each verify item that a decision accepted: the hand-back names the slice, the item and who accepted it.
const accepted = acceptedResiduals(outcome)
if (accepted.length) {
  outcome.acceptedResiduals = accepted
  log(`accepted verify items: ${accepted.map(a => `${a.slice || slug} ${a.item} (by ${a.by})`).join('; ')} — each delegate accept is a residual finding of the review`)
}
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
// Standing steering — what the stages honored, and where steering stopped or was crossed.
const steering = steeringDigest(outcome)
if (steering) {
  outcome.steering = steering
  log(`steering: ${steering.honored.length} honored, ${steering.conflicts.length} stage stop(s) on a conflict, ${steering.violations.length} checkpoint violation(s)${steering.conflicts.length ? ` — ${steering.conflicts.map(c => `${c.stage}${c.slice ? ':' + c.slice : ''} "${c.entry}"`).join('; ')}` : ''}`)
}
// G2/G3 — a stop request is a clean end, not a HARD-STOP. The resume command
// is the route; the main session deletes the control file and reports the stop.
if (outcome.stoppedAt === 'stop-request') {
  outcome.stopRequest = { kind: outcome.stoppedAt, controlFile: CONTROL_PATH, slice: outcome.stoppedSlice || outcome.slice || null }
  outcome.route = `/wf yolo ${slug}${slice ? ' ' + slice : ''}`
  log(`yolo stopped on a stop request: ${outcome.reason} — resume with ${outcome.route}`)
} else if (!waiting) log(outcome.stopped ? `yolo HARD-STOP at ${outcome.stoppedAt || 'orient'}: ${outcome.reason}` : `yolo reached the endpoint — next: ${outcome.route}`)
return outcome
