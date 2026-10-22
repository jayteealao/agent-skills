// skills/wf/workflows/_shared.js — WF-SYSTEM-REVIEW-2026-10-21 E1.
//
// The helpers that yolo.js and campaign-wave.js share, word for word. A Workflow script
// cannot import, so scripts/build-drivers.mjs (run by npm run build) writes this file into
// the BEGIN SHARED block of each driver. Edit the helpers here, never in a driver.
// Only function declarations go here: they hoist, so the block can sit anywhere in a driver.

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

function implementGroups(planSteps, committed, size) {
  const total = Number(planSteps) || 0
  if (total <= size) return [null]
  const out = []
  for (let a = Math.max(0, Number(committed) || 0) + 1; a <= total; a += size) out.push({ from: a, to: Math.min(total, a + size - 1), total })
  return out.length ? out : [null]
}

function implementStepsClause(slice, steps, progressPath, handoverPath, retry) {
  const rec = (event, fields) => `\`${lineCmd(progressPath, { slice, event })}${fields ? ` --fields '${fields}'` : ''}\``
  return `\n\nSTEP COMMITS (C2). After each plan step, commit it as the reference says, and record it: ` +
    `${rec('step', '{"step":<n>,"sha":"<commit sha>"}')}. When ${progressPath} records steps of this slice ` +
    `already, continue after the last one whose sha is an ancestor of HEAD; never redo it. When you hard-stop, ` +
    `record ${rec('hard-stop', '')} with --reason "<one line>". After the final commit of the slice, record ` +
    `${rec('complete', '{"sha":"<commit sha>"}')}.` +
    (retry ? ` The person answered the split question with a retry: before any other work, record ${rec('retry', '')}.` : '') +
    (!steps ? '' : `\n\nSTEP GROUP (C3). Implement plan steps ${steps.from} to ${steps.to} of ${steps.total} ONLY. ` +
      `Read ${handoverPath} first when it exists. ` + (steps.to >= steps.total
      ? `This is the last group: finish the stage as the reference says (the record, the roster, the final commit, and the test receipt).`
      : `When step ${steps.to} is committed, overwrite ${handoverPath} with a short hand-over note (what is done, ` +
        `what is next, the traps you found), and return status 'complete' with stepsDone: ${steps.to}. Do NOT ` +
        `write the implementation record, the roster status, the final commit, or the test receipt: the last group writes them.`))
}

// ---------------------------------------------------------------------------
// STANDING STEERING — every agent that judges or writes reads steer.md FRESH.
// Stage agents read steer.md through their stage reference, but the driver's own
// agents (rubric selection, scouts, refuters, wall probe, classifier, charter
// checkpoint, plan reconcile) are prompted by this script and never opened it. A
// steering veto the scouts cannot see is a veto the review cannot enforce.
// The clause names the PATH, never a copy of the text: the user may edit steer.md
// while the run drives, and each agent that starts after the edit must see it. A
// snapshot taken at orient would freeze the entries for the whole run.
// Bookkeeping agents (branch, write-back, index write-back, ledger report) get no
// clause: they change no code and judge nothing a steering entry governs.
// ---------------------------------------------------------------------------
function steeringClause(steerPath, role, contractPath, campaignSteerPath = null) {
  // WF-CAMPAIGN-RUN-FIXES-PLAN C2: in a campaign, one more steer file applies to every slug of the campaign.
  const files = campaignSteerPath
    ? `${steerPath}, and for every slug of the campaign in ${campaignSteerPath}. Read BOTH files NOW, in full, with ` +
      `the file-read tool — never from a copy in a prompt or from an earlier run: the user can edit them while this ` +
      `run drives. Where an entry of this slug's own file and an entry of the campaign file conflict, this slug's ` +
      `entry wins. If both files are absent or empty, there is no steering`
    : `${steerPath}. Read that file NOW, in full, with the file-read tool — never from a copy in a prompt or from ` +
      `an earlier run: the user can edit it while this run drives. If the file is absent or empty, there is no ` +
      `steering`
  const head = `\n\nSTANDING STEERING (MANDATORY). The user keeps standing instructions for this workflow in ` +
    `${files}: skip the rest of this block and return no steering fields. The contract is ${contractPath}. No ` +
    `human gate in this run repeats these entries, so the file is the user's voice here. A steering VETO ` +
    `outranks every autonomous-policy default in this prompt. Steering never overrides a mandatory gate (the ` +
    `External Output Boundary, sibling-fragment enforcement, AC verifiability, the constraint-resolution rule), ` +
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
      `for an entry the diff does not touch; with no steer.md, return findings: [].`
  }
  if (role === 'refute') {
    return head +
      ` A finding that quotes a steering entry is refuted ONLY when the diff does not contradict that entry as ` +
      `the file states it now. "The code works" or "the change is reasonable" does not refute it: the entry is ` +
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
      `contradicts; [] when none does or there is no steer.md.`
  }
  // 'context' — read-only agents whose choices must stay inside the entries.
  return head +
    ` Keep your work inside these entries: never run a command, recommend an action, or select an option an ` +
    `entry forbids. When an entry names a concern your task covers, weigh it.`
}

// steeringDigest() — the hand-back's steering line: what each stage said it honored,
// the stages that stopped on a steering conflict, and the checkpoint violations.
// Null when nothing in the run reported steering (no steer.md, or no entry applied).
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
// stage reference's `## Requires` table now names every input, the mod checks the
// writer's reads against it, and a missing read comes back as feedback in the write's
// tool result (warn mode: the write lands). The prompt says so, so the agent reads
// the table before it writes and acts on the feedback instead of ignoring it.
function requiresClause(refPath) {
  return `\n\nREQUIRED READS (CHECKED). The \`## Requires\` table in ${refPath} is a CHECKLIST, defined by ` +
    `${referenceRoot}/_requires.md. Before you write the stage artifact, read every row whose When value applies ` +
    `to this run — each whole-file input from its first line to its last, each named section in full — yourself, ` +
    `with the file-read tool. A search hit, a shell read, a partial read, or a sub-agent's read does not count. ` +
    `A \`mode:<name>\` row applies when its mode applies to this run: list every mode you ran under in the stage ` +
    `artifact's \`modes:\` frontmatter (for example \`modes: [deferral]\`). The mod also finds some modes on disk ` +
    `(section "Modes" of ${referenceRoot}/_requires.md lists them), and a mode it finds there applies even when ` +
    `\`modes:\` leaves it out. The mod checks your reads when you write the stage artifact: a missing or partial read comes back as ` +
    `feedback (context) in that write's tool result. When it does, read each named input, then write the ` +
    `artifact again in this same run. Keep reading ${refPath} in full as well.`
}

// S6 — a dispatch prompt that carries the full text of a Requires input names it, so the
// read check counts it as read for the writer of the named output path.
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
    `write it may have made as SUSPECT and possibly half-finished: re-read each file you touch fresh from disk ` +
    `before editing it, and if what you find contradicts what the index claims, trust the artifact on disk and ` +
    `correct the index. Do not assume the previous run left a consistent state.`
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
    // The load-bearing qualifier. 'suspect' means the run cannot honestly claim
    // zero intent-bearing escapes — some decisions were never checked.
    intentBearingGuarantee: unclassified.length ? 'suspect' : 'exact',
  }
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

// reconcileDue() — reconcile runs whenever the durable marker is set, on a fresh run
// and on a resume alike. update-deps never fans out, so it never reconciles.
function reconcileDue(idx) {
  return !!idx && idx.reconcilePending === true && idx.workflowType !== 'update-deps'
}

// planWaves() — the fan-out order: a slice plans after the slices it depends on, so its
// plan builds on theirs. The slices with no open dependency plan together. A cycle or a
// name outside the fan-out does not block: the slices left plan in one last wave.
function planWaves(slices) {
  const names = new Set((slices || []).map(s => s.slice))
  const left = new Map((slices || []).map(s => [s.slice, (s.dependsOn || []).filter(d => d !== s.slice && names.has(d))]))
  const placed = new Set()
  const waves = []
  while (left.size) {
    const ready = [...left.keys()].filter(n => left.get(n).every(d => placed.has(d)))
    const wave = ready.length ? ready : [...left.keys()]
    waves.push(wave)
    for (const n of wave) { placed.add(n); left.delete(n) }
  }
  return waves
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

// orderEdgesOf() — the orderEdges of plan results that name two slices of the roster, de-duplicated.
function orderEdgesOf(results, roster) {
  const names = new Set((roster || []).map(s => s.slice))
  const seen = new Set()
  const out = []
  for (const r of results || []) {
    for (const e of (r && r.orderEdges) || []) {
      if (!e || !e.slice || !e.after || e.slice === e.after || !names.has(e.slice) || !names.has(e.after)) continue
      const k = `${e.slice}<${e.after}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ slice: String(e.slice), after: String(e.after), why: String(e.why || '') })
    }
  }
  return out
}

// overlappingSlices() — normalize the reconcile agent's answer into the re-plan list:
// one entry per slice, in roster order, skipped and unknown slices dropped, the
// overlapping siblings and the shared files/edges merged into one detail line.
function overlappingSlices(overlaps, roster) {
  const want = new Map()
  for (const o of overlaps || []) {
    if (!o || !o.slice) continue
    const cur = want.get(o.slice) || { with: new Set(), details: [] }
    for (const w of o.with || []) if (w && w !== o.slice) cur.with.add(w)
    for (const f of o.files || []) if (f) cur.details.push(`file ${f}`)
    for (const e of o.edges || []) if (e) cur.details.push(`edge ${e}`)
    if (o.reason) cur.details.push(String(o.reason))
    want.set(o.slice, cur)
  }
  return (roster || [])
    .filter(s => s && s.slice && s.status !== 'skipped' && want.has(s.slice))
    .map(s => ({ slice: s.slice, with: [...want.get(s.slice).with], detail: [...new Set(want.get(s.slice).details)].join('; ') }))
}

// runStartFromId() — orient mints the runId from the clock ('20260726T143005Z-<slug>');
// its timestamp is the earliest moment a row of THIS run can carry.
function runStartFromId(runId) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/.exec(String(runId || ''))
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null
}

function readCheckRows(rows, runStartAt) {
  const start = runStartAt ? Date.parse(runStartAt) : NaN
  const gap = r => (Array.isArray(r.missing) && r.missing.length > 0) || (Array.isArray(r.partial) && r.partial.length > 0)
  const inRun = (rows || [])
    .filter(r => r && typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at)))
    .filter(r => Number.isNaN(start) || Date.parse(r.at) >= start)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const out = []
  inRun.forEach((r, i) => {
    if (!gap(r)) return
    const resolved = inRun.slice(i + 1).some(l => l.artifact === r.artifact && l.agentId === r.agentId && !gap(l))
    out.push({
      at: r.at, stage: r.stage || '', artifact: r.artifact || '', agentId: r.agentId || '',
      missing: r.missing || [], partial: r.partial || [], resolved,
      ...(r.waiver ? { waiver: r.waiver } : {}),
    })
  })
  return out
}

// WF-SYSTEM-REVIEW E3: the stage prompt states the shared rules once. A stage agent does not
// read again the files that hold them; the stage reference still points to them for a person.
// Audit L10: requiresClause restates _requires.md (all but its Modes table), steeringClause
// restates _steering.md, and the POLICY block + DECISION_CONTRACT replace every gate
// question (_gate-question.md) and its wording (_question-craft.md): the run asks nothing.
function preambleClause() {
  return `- PREAMBLE GIVEN HERE: this prompt states the grounded-progress rule, the early-stop guard, the ` +
    `required-reads checklist, and the steering contract; the policy above settles or stops each question the ` +
    `reference would ask, so you ask none; and your return is the schema below, not a chat message. When the ` +
    `stage reference points to ${referenceRoot}/_chat-return.md, ${referenceRoot}/_autonomy-guards.md, ` +
    `${referenceRoot}/_grounded-progress.md, ${referenceRoot}/_steering.md, ${referenceRoot}/_gate-question.md, or ` +
    `${referenceRoot}/_question-craft.md, do not read those files: apply the rules of this prompt. When it points ` +
    `to ${referenceRoot}/_requires.md, read only its section "Modes": this prompt states the rest.\n`
}

// WF-DESIGN-PLAN B1 (P2): a review finding against the confirmed design is the person's decision.
// Both drivers add this clause to POLICY.review, so its text is the same in each driver.
function designAmendClause() {
  return ` DESIGN FINDINGS: a finding against a confirmed board (a frozen board under ` +
    `.ai/workflows/<slug>/design/r<N>/) or against a line of the 02c-craft.md contract is the person's decision. ` +
    `Do not fix it, do not dismiss it, and do not defer it. Record it open, with triage needs-amend and the reason ` +
    `"the person decides: amend, keep, or defer". List it in amendFindings as { key (the finding id), severity, ` +
    `summary (one line), contract (the board or the 02c-craft.md line that it contradicts, with its path) }. A ` +
    `needs-amend finding is no reason to hard-stop: the driver asks the person. Return amendFindings: [] when no ` +
    `finding is against the confirmed design.`
}

// The amendFindings field of STAGE_RESULT.
function amendFindingsSchema() {
  return {
    type: 'array',
    items: {
      type: 'object',
      required: ['key', 'summary'],
      properties: { key: { type: 'string' }, severity: { type: 'string' }, summary: { type: 'string' }, contract: { type: 'string' } },
    },
  }
}

// The design findings of a review result: the entries that name a finding.
function amendFindingsOf(res) {
  const list = res && Array.isArray(res.amendFindings) ? res.amendFindings : []
  return list.filter(f => f && typeof f === 'object' && String(f.key || '').trim())
}

// The design findings as one line each, for a question or a stop reason.
function amendFindingsText(list) {
  return (list || []).map(f => `${f.key} (${f.severity || '?'}): ${String(f.summary || '').slice(0, 160)}` +
    `${f.contract ? ` [against ${String(f.contract).slice(0, 160)}]` : ''}`).join('; ')
}
