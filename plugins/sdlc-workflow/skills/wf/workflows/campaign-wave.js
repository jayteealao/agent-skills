export const meta = {
  name: 'wf-campaign-wave',
  description: 'The wave driver of /wf campaign. One run drives every unit of one wave, each in its own worktree: orient, plan, the cross-unit reconcile, then plan→implement→verify→review for each unit at once, with waits merged in at the cleared commit, parks that ask the person and continue in the same run, and heavy slots that follow the budget. Then the boundary: merge, wave verify, revert search, the wave review, as-built notes, fidelity, and the wave output. Never opens a PR, never ships, never pushes.',
  phases: [
    { title: 'Orient', detail: 'one orient for each unit; resume orients keep the run id' },
    { title: 'Plan', detail: 'every unplanned slice of every unit at once, the plan reconcile, then the cross-unit reconcile' },
    { title: 'Drive', detail: 'each unit walks its roster; waits merge the cleared commit before the implement that needs it' },
    { title: 'Review', detail: 'each unit reviews its own commits: per slice, or once slug-wide' },
    { title: 'Merge', detail: 'the boundary setup and the merge of the finished units into the wave branch' },
    { title: 'Verify', detail: 'quiet-window checks, the wave verify, and the revert search' },
    { title: 'Wave review', detail: 'one review of the merged wave diff, for the defects where units meet' },
    { title: 'Record', detail: 'as-built notes, the refuter, and the fidelity checkpoint' },
    { title: 'Output', detail: 'slug outputs, the wave output, and the try-it note' },
  ],
}

// ===========================================================================
// /wf campaign — the wave driver (docs/internal/WF-CAMPAIGN-DRIVER-PLAN.md).
//
// One Workflow run drives one wave. The session runs `campaign.mjs wave <n> launch`
// first: it adds every worktree, writes every context file, and prints the args of
// this script. The session runs `wave <n> record --outcome <file>` after it.
//
// The script has no file access, no clock and no Node API. Every read, write, git
// command and ledger change is an agent. The walks of the units are plain async
// functions; they share one engine concurrency cap and the heavy slots of section
// 5.4a. This script shares no code with yolo.js (D1): the helpers below are copies,
// and tests/unit/skills/driver-parity.test.mjs shows when two copies differ.
// ===========================================================================

let OPT = args
if (typeof OPT === 'string') { try { OPT = JSON.parse(OPT) } catch { OPT = null } }
if (!OPT || typeof OPT !== 'object') {
  return { ok: false, stopped: true, reason: 'campaign-wave requires the args of `campaign.mjs wave <n> launch` as a JSON object.' }
}
const { projectRoot, referenceRoot, brainstorm } = OPT
const mode = OPT.mode || 'wave'
const wave = Number(OPT.wave)
for (const [k, v] of Object.entries({ projectRoot, referenceRoot, brainstorm })) {
  if (!v || typeof v !== 'string' || !v.trim()) return { ok: false, stopped: true, reason: `campaign-wave: required arg '${k}' is missing. Pass the args that \`wave <n> launch\` printed, as they are.` }
}
if (!Number.isInteger(wave) || wave < 1) return { ok: false, stopped: true, reason: 'campaign-wave: wave must be a positive integer' }
if (!['wave', 'boundary', 'drift'].includes(mode)) return { ok: false, stopped: true, reason: `campaign-wave: unknown mode '${mode}'` }

// Models, as in yolo.js: Opus for orient, the stages, the writers and the boundary
// merge and verify; Sonnet for every other agent. No haiku.
const SONNET = { model: 'claude-sonnet-5-5', effort: 'high' }
const OPUS = { model: 'claude-opus-5-5', effort: 'medium' }

const CAMP = OPT.campaignDir || `${projectRoot}/.ai/workflows/${brainstorm}/work/campaign`
const CAMPAIGN_JOURNAL = `${CAMP}/.campaign-journal.jsonl`
const CAMPAIGN_CONTROL = OPT.campaignControlPath || `${CAMP}/.control.json`
const CAMPAIGN_STEER = OPT.campaignSteerPath || `${CAMP}/steer.md`
const RUN = OPT.campaignRunId || `${brainstorm}-w${wave}`
const CANCEL_PATH = OPT.cancelPath || `${projectRoot}/.scratch/campaign/${RUN}/wave-${wave}/cancel`
const OUT = `${projectRoot}/.scratch/campaign/${RUN}`
const SCRIPT = `${referenceRoot}/../scripts/campaign.mjs`
const WATCH = `${referenceRoot}/../../../scripts/yolo-watch.mjs`
const DRIVE_PROC = `${referenceRoot}/campaign/_drive.md`
const BOUNDARY_PROC = `${referenceRoot}/campaign/_boundary.md`
const WAVE_BRANCH = OPT.waveBranch || `campaign/${brainstorm}/wave-${wave}`
const WAVE_BASE = OPT.base || ''
const WIDTH_MAX = Math.max(1, Number(OPT.widthMax) || 1)
const CEILING = Math.max(50, Number(OPT.agentCeiling) || 900)
const REFUTER_LIMIT = 12
const CHECKPOINT_EVERY = 3
// `node "<script>" <command> "<projectRoot>" <brainstorm> …` — every bookkeeping command.
const cmd = (sub, rest = '') => `node "${SCRIPT}" ${sub} "${projectRoot}" ${brainstorm}${rest ? ` ${rest}` : ''}`
const q = (s) => JSON.stringify(String(s ?? ''))

// ---------------------------------------------------------------------------
// External Output Boundary — every fresh-context agent gets it (yolo.js:74).
// ---------------------------------------------------------------------------
const EOB =
  `EXTERNAL OUTPUT BOUNDARY (MANDATORY): workflow artifact paths (.ai/workflows/…), stage names/numbers, ` +
  `slash-command names, sub-agent names, campaign bookkeeping, and control-file metadata are PRIVATE implementation ` +
  `context. They must NEVER appear in any external-facing output — commit messages, branch names, PR text, release ` +
  `notes, code comments, or docs. Translate to product language (user-visible change, rationale, affected areas, ` +
  `verification, risk) and leak-check before any commit.`

// ---------------------------------------------------------------------------
// The units (section 5.2). Every prompt of a unit takes its paths from its object.
// ---------------------------------------------------------------------------
const U = (Array.isArray(OPT.units) ? OPT.units : []).map((raw) => {
  const wf = `${raw.root}/.ai/workflows/${raw.slug}`
  return {
    key: String(raw.key), slug: String(raw.slug), form: raw.form || 'intake', order: Number(raw.order) || 0,
    root: String(raw.root), branch: String(raw.branch || ''), contextPath: String(raw.contextPath || ''),
    reviewScope: raw.reviewScope === 'slug-wide' ? 'slug-wide' : 'per-slice',
    ledgerState: raw.state || 'running',
    runId: raw.runId ? String(raw.runId) : '',
    seq: 0,
    wf,
    journal: `${wf}/.driver-journal.jsonl`,
    control: `${wf}/.control.json`,
    steer: `${wf}/steer.md`,
    index: `${wf}/00-index.md`,
    // The mod writes the read ledger at the session root, never in a worktree (section 5.9).
    readLedger: `${projectRoot}/.ai/workflows/${raw.slug}/.read-ledger.jsonl`,
    cleared: Array.isArray(raw.cleared) ? raw.cleared.slice() : [],
    waits: Array.isArray(raw.waits) ? raw.waits : [],
    questions: Array.isArray(raw.questions) ? raw.questions : [],
    qCount: Array.isArray(raw.questions) ? raw.questions.length : 0,
    mergedIn: (Array.isArray(raw.waits) ? raw.waits : []).filter((w) => w && w.state === 'met' && w.sha).map((w) => w.sha),
    idx: null,
    results: [],
    planStops: {},
    charterCheckpoints: [],
    parks: [],
    startParks: [],
    ended: false, finished: false, moved: false,
    blockedOn: null,
    parked: null,
    faults: 0,
    output: null,
    readCheck: null,
    priorDriver: null,
    unitReview: null,
  }
})
const byKey = new Map(U.map((u) => [u.key, u]))

// ---------------------------------------------------------------------------
// DRIVER HEARTBEAT (yolo.js:114), for one unit. Every line carries the unit's run
// id and its own counter, the driver and campaign fields of section 5.9, and
// `campaignRun`, so `runLive` sees the run (D25). The label ends with `@<slug>`.
// ---------------------------------------------------------------------------
const lbl = (u, label) => `${label}@${u.slug}`

function heartbeat(u, label, phaseName, stageName, sliceArg, isHeavy = false) {
  const seq = ++u.seq
  return `\n\nDRIVER HEARTBEAT (MANDATORY — do this FIRST and LAST). A background driver that dies leaves no ` +
    `signal; this journal is the only way a human or a later session can tell a live driver from a dead one. ` +
    `Append (never rewrite, never truncate) to ${u.journal}, creating it if absent:\n` +
    `  • BEFORE any other work, one line: ` +
    `{"at":"<ISO-8601 UTC now, from the system clock>","run":"${u.runId}","seq":${seq},"event":"agent-start",` +
    `"agent":"${lbl(u, label)}","phase":"${phaseName}","stage":"${stageName || ''}","slice":"${sliceArg || ''}",` +
    `"driver":"campaign-wave","campaign":"${brainstorm}","campaignRun":"${RUN}"${isHeavy ? ',"heavy":true' : ''}}\n` +
    `  • IMMEDIATELY BEFORE you return, one line of the same shape with "event":"agent-end", plus ` +
    `"status":"<the status you are returning>" and "errors":<the number of tool errors / rejected writes / ` +
    `schema retries you RECOVERED from this agent, 0 if none>.\n` +
    `Never read the journal back into your answer, and never let an append failure change what you do — the ` +
    `heartbeat is diagnostic, never a gate.`
}

// The agents of the wave (cross-unit reconcile, boundary, wave review, waiter) write to
// the campaign journal with `phase` and `wave`, as the boundary agents did (section 5.9 item 7).
let WAVE_SEQ = 0
function waveHeartbeat(label, step) {
  const seq = ++WAVE_SEQ
  return `\n\nCAMPAIGN HEARTBEAT (do this FIRST and LAST). Append one JSON line to ${CAMPAIGN_JOURNAL} (create it when ` +
    `absent; never rewrite it): before any other work {"at":"<ISO-8601 UTC now>","run":"${RUN}","seq":${seq},` +
    `"event":"agent-start","agent":"${label}","phase":"${step}","wave":${wave},"driver":"campaign-wave"}, and ` +
    `immediately before you return the same shape with "event":"agent-end", "status":"<your status>" and ` +
    `"errors":<errors you recovered from>. A failed append never changes what you do.`
}

function campaignEvent(name, fields) {
  return `\n\nCAMPAIGN EVENT. After your work, append one more line to ${CAMPAIGN_JOURNAL}: {"at":"<ISO-8601 UTC now>",` +
    `"run":"${RUN}","event":"${name}","wave":${wave},${fields}}. The campaign watch turns it into a commentary note.`
}

// CONTROL-FILE DISCIPLINE (yolo.js:136), for the unit's own 00-index.md only. The stage
// agents never write .ai/workflows/INDEX.md: the boundary merge regenerates it (5.9 item 9).
function controlFileRule(u) {
  return `\n\nCONTROL-FILE DISCIPLINE (MANDATORY). ${u.index} is a shared control file that another session may ` +
    `also be editing. Re-read the file IMMEDIATELY before every edit — never edit from a copy you read earlier in ` +
    `this agent. If an edit is rejected as modified-since-read, that means the other writer moved: re-read, ` +
    `re-derive your change against the NEW content, and retry ONCE. Never force a stale string through, and never ` +
    `rewrite the whole file to dodge the conflict. Do NOT edit ${u.root}/.ai/workflows/INDEX.md: in a campaign wave ` +
    `the boundary merge regenerates it from each slug's 00-index.md.`
}

// ---------------------------------------------------------------------------
// STANDING STEERING (yolo.js:156) — copied. The campaign steer file is always present.
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

// steeringDigest() — copied (yolo.js:220).
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

// CAMPAIGN CONTEXT (yolo.js:254) — copied, always on.
function campaignClause(contextPath, role) {
  if (!contextPath) return ''
  const head = `\n\nCAMPAIGN CONTEXT (MANDATORY). This slug runs in a campaign of several slugs. Its context file is ` +
    `${contextPath}. Read that file NOW, in full, with the file-read tool, never from a copy: the campaign updates ` +
    `it while this run drives. It lists this slug's carried decisions and provides lines, what the earlier slugs ` +
    `actually built, and the expects lines of the slugs that come after this one.`
  if (role === 'writer') {
    return head +
      `\n- Treat each line under "3. Succeeding slugs" as a Known Constraint: never break it.\n` +
      `- A choice that would break one of those lines, or change a provides line of this slug, is intent-bearing ` +
      `(class 6 in ${referenceRoot}/_decision-classes.md, "changes a campaign contract line"): stop as for any ` +
      `intent-bearing decision.\n` +
      `- Where "2. Preceding slugs" says that an as-built line differs from a provides line, build on the as-built ` +
      `line, not on the packet.`
  }
  if (role === 'classify') {
    return head + ` A decision that breaks a succeeding expects line, or changes a provides line of this slug, is ` +
      `'intent-bearing' (class 6).`
  }
  if (role === 'refute') {
    return head + ` A finding that quotes a campaign contract line is refuted only when the diff meets that line.`
  }
  // scout, checkpoint, context: weigh the lines; never recommend breaking one.
  return head + ` Never recommend or take an action that breaks a succeeding expects line.`
}

const steer = (u, role) => steeringClause(u.steer, role, `${referenceRoot}/_steering.md`, CAMPAIGN_STEER) + campaignClause(u.contextPath, role)

// ---------------------------------------------------------------------------
// STOP-REQUEST CHECK (yolo.js:294), for one unit. It also reads the budget and the
// answers of the wave (the free check, section 5.5a step 4). Condition (d) is the
// second guard of section 5.6, for implement only: the plans run before any wait is
// met, against the needed unit's plan (D23), so a plan never stops for a wait.
// ---------------------------------------------------------------------------
function stopCheckClause(u, stage, sliceArg) {
  const waitCondition = stage === 'implement'
    ? `  (d) section "7. Waits" of ${u.contextPath} (read it fresh) has an **Open** or **Ready** line whose slice is ` +
      `'${sliceArg}' (a line that says "the first slice" names the first slice of this slug's roster). The wave ` +
      `driver merges the code that the wait names before this implement; never build a stand-in for it.\n`
    : ''
  return `\n\nSTOP-REQUEST CHECK (MANDATORY — before any other work, after the start heartbeat). Read ` +
    `${u.control} now, fresh, with the file-read tool. When the file is absent, continue normally. When it does ` +
    `not parse as JSON, read it once more; when it still does not parse, treat it as {"action":"pause"}. A request in ` +
    `that file always applies. Then read ${CAMPAIGN_CONTROL} the same way. A request in that file applies to this ` +
    `run when its "scope" is "campaign", or when its "scope" is "slug" and its "slug" is "${u.slug}". A request with ` +
    `"scope" "wave" is for the campaign session: ignore it here. ` +
    `Stop when one of these holds for a request that applies:\n` +
    `  (a) "action" is "stop" and "after" is "current";\n` +
    `  (b) "action" is "stop", "after" names a stage (plan, implement, verify, review), and ${u.journal} holds ` +
    `an "agent-end" line for that stage (its "stage" field, or its "agent" label before the first ':') whose "at" ` +
    `is later than the request's "requestedAt";\n` +
    `  (c) "action" is "pause" and "until" is absent or later than now.\n` +
    waitCondition +
    `Then run \`${cmd('budget')}\` and return its state, width, until and reason as budget. When its width is 0, stop as ` +
    `for a pause. Then run \`${cmd('await', `--wave ${wave} --max 0`)}\` and return its "answered" list as answered ` +
    `([] when it has none).\n` +
    `To stop: do no stage work, write no artifact, and edit no file except your heartbeat lines. Return ` +
    `status 'stopped', stopKind ('stop' for a stop request whose scope is not "slug", 'slug-stop' for a request ` +
    `whose scope is "slug" — with stopThen copied from its "then" field, 'hold' when the field is absent —, ` +
    `'pause' for a pause or a budget width of 0${waitCondition ? `, 'wait' for an open wait, with waitsFor "<unit>: <slice>" from the wait line` : ''}), ` +
    `stopReason quoting the request${waitCondition ? ' or the wait line' : ''}, the stage and slice you were asked ` +
    `to run, artifactPath '' and terminal {}. Never edit or delete a control file: the session owns it. When no ` +
    `condition holds, continue normally and do not mention the file.`
}

// The run's stoppedAt for an agent that honored a stop request.
function stopKindOf(res) {
  if (res && res.stopKind === 'wait') return 'waits'
  return res && res.stopKind === 'pause' ? 'usage-pause' : 'stop-request'
}

// REQUIRED READS (yolo.js:341) and the prompt-fed line (yolo.js:353) — copied.
function requiresClause(refPath) {
  return `\n\nREQUIRED READS (CHECKED). The \`## Requires\` table in ${refPath} is a CHECKLIST, defined by ` +
    `${referenceRoot}/_requires.md. Before you write the stage artifact, read every row whose When value applies ` +
    `to this run — each whole-file input from its first line to its last, each named section in full — yourself, ` +
    `with the file-read tool. A search hit, a shell read, a partial read, or a sub-agent's read does not count. ` +
    `The mod checks your reads when you write the stage artifact: a missing or partial read comes back as ` +
    `feedback (context) in that write's tool result. When it does, read each named input, then write the ` +
    `artifact again in this same run. Keep reading ${refPath} in full as well.`
}

function promptFedLine(inputs, outputPath) {
  const list = (inputs || []).filter(Boolean)
  if (!list.length) return ''
  return `\n\nPrompt-fed inputs: ${list.join(', ')}\nOutput artifact: ${outputPath}`
}

// judgeLiveness() — copied (yolo.js:366). One verdict for each unit.
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

// DECISION RECORDING CONTRACT (yolo.js:418) — copied, with `by` for an answered escalation.
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
  `- A decision that records the person's answer to an escalation carries \`by\` ('person' or 'session') and the ` +
  `answer quoted.\n` +
  `- Report \`errors\`: [{ what, recovered }] for every tool error, rejected write, or schema retry you hit ` +
  `and recovered from this stage (empty list if none). A recovered error is not a failure and will not stop ` +
  `the run. The run report counts them.`

// ---------------------------------------------------------------------------
// The Autonomous Decision Policy (yolo.js:439) — copied for plan, implement, verify
// and review. The plan policy adds the crossUnit field (section 5.7 item 1).
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
    `open question recorded, and return status:'hard-stop'. Otherwise finish status: complete, has-blockers: false. ` +
    `CROSS-UNIT FILES: read the plan files of the PARALLEL UNITS named below. When this slice changes a file that ` +
    `a slice of another unit also changes, return crossUnit: [{ key (the other unit), slice (its slice), files, ` +
    `kind }] — kind 'order' when the two slices only touch the same file, 'contract' when a provides or expects ` +
    `line of either unit would change. Return crossUnit: [] when no file is shared.`,
  implement:
    `AUTONOMOUS OVERRIDE — build the slice per its plan and COMMIT the code (honor the External Output Boundary ` +
    `on the commit message). Minor plan drift you can resolve in-scope: resolve it, record it in the implement ` +
    `artifact, proceed. HARD-STOP only on blocking ambiguity or a drift that changes user-observable scope: ` +
    `finish status: awaiting-input with the reason recorded and return status:'hard-stop'. Before you change ` +
    `anything, read \`git rev-parse HEAD\` and return it as startSha.`,
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
    `Defer only a probed impossibility. Never defer to avoid verification you could run, and never defer a ` +
    `substantive failure: if you drove an AC and the behavior was wrong, that AC is result: fail (substantive). ` +
    `Record it as a failure, never in deferrals[] and never in the index's runtime-evidence-deferrals. The ` +
    `driver reports your fail/deferral split verbatim and never relabels either side downstream. A ` +
    `user-observable AC with neither evidence nor a lawful deferral is result: blocked-runtime-evidence-missing, ` +
    `and the run does not proceed on it. Reserve convergence: escalated for substantive unresolved issues. A ` +
    `slice whose only residual is deferred-evidence AC (all checks pass, all code-only AC met, all producible ` +
    `user-observable AC evidenced) is convergence: converged (or not-needed if no fix was required), not ` +
    `escalated.\n\n` +
    `ONE WRITER PER FACT (deferral emission). A deferral is recorded EXACTLY ONCE, in terminal.deferrals[], ` +
    `complete with its probe receipt. Do NOT also copy it into residual[] — residual[] carries only what is ` +
    `NOT a deferral (could-not-fix notes, out-of-scope observations). If you are unsure whether an entry is a ` +
    `deferral, it belongs in deferrals[] with a probe or it is not a deferral at all.\n\n` +
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
}

// ---------------------------------------------------------------------------
// Schemas — copied from yolo.js, with the fields of the wave driver.
// ---------------------------------------------------------------------------
const BUDGET_FIELD = {
  type: 'object',
  properties: { state: { type: 'string' }, width: { type: 'number' }, until: { type: 'string' }, reason: { type: 'string' } },
}
const ANSWERED_FIELD = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' }, unit: { type: 'string' }, kind: { type: 'string' }, answer: { type: 'string' },
      by: { type: 'string' }, move: { type: 'boolean' },
    },
  },
}

// UNIT_ORIENT — yolo's ORIENT_RESULT (yolo.js:535) without slice mode, the terminal
// types, update-deps and the RCA branch: a campaign unit is always a build form.
const UNIT_ORIENT = {
  type: 'object',
  required: ['ok', 'slug', 'reviewScope', 'fileConvention', 'slices'],
  properties: {
    ok: { type: 'boolean' },
    blockReason: { type: 'string' },
    route: { type: 'string' },
    slug: { type: 'string' },
    reviewScope: { enum: ['per-slice', 'slug-wide'] },
    workflowType: { type: 'string' },
    singleScope: { type: 'boolean' },
    runId: { type: 'string' },
    lastSeq: { type: 'number' },
    mergeAborted: { type: 'boolean' },
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
    priorDeferrals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slice: { type: 'string' }, reason: { type: 'string' }, deferredAt: { type: 'string' }, clearedBy: { type: 'string' },
          repeatOf: { type: 'string' }, authorized: { type: 'boolean' }, ac: { type: 'string' }, wallOwnership: { type: 'string' },
          clearingEvent: { type: 'string' }, clearingProbe: { type: 'string' }, clearingProbeHit: { type: 'boolean' },
        },
      },
    },
    charter: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, commitment: { type: 'string' }, status: { type: 'string' } } },
    },
    reconcilePending: { type: 'boolean' },
    fileConvention: { enum: ['suffixed', 'unsuffixed'] },
    base: { type: 'string' },
    slices: {
      type: 'array',
      items: {
        type: 'object',
        required: ['slice', 'stages'],
        properties: {
          slice: { type: 'string' },
          status: { type: 'string' },
          reverifyReason: { type: 'string' },
          stages: {
            type: 'object',
            properties: { plan: { type: 'string' }, implement: { type: 'string' }, verify: { type: 'string' }, review: { type: 'string' } },
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
    status: { enum: ['complete', 'hard-stop', 'stopped'] },
    stopKind: { enum: ['stop', 'pause', 'wait', 'slug-stop'] },
    stopThen: { enum: ['move', 'hold'] },
    stopReason: { type: 'string' },
    waitsFor: { type: 'string' },
    artifactPath: { type: 'string' },
    startSha: { type: 'string' },
    terminal: {
      type: 'object',
      properties: {
        statusField: { type: 'string' },
        convergence: { type: 'string' },
        result: { type: 'string' },
        verdict: { type: 'string' },
        blockerCount: { type: 'number' },
        deferrals: {
          type: 'array',
          items: { type: 'object', properties: { ac: { type: 'string' }, reason: { type: 'string' }, probe: { type: 'string' } } },
        },
        substantiveResidual: { type: 'boolean' },
      },
    },
    decisions: { type: 'array', items: { type: 'object' } },
    residual: { type: 'array', items: { type: 'object' } },
    errors: {
      type: 'array',
      items: { type: 'object', properties: { what: { type: 'string' }, recovered: { type: 'boolean' } } },
    },
    hardStopReason: { type: 'string' },
    steeringHonored: { type: 'array', items: { type: 'string' } },
    steeringConflict: { type: 'string' },
    // Section 5.7 item 1: a file this slice shares with a slice of another unit.
    crossUnit: {
      type: 'array',
      items: {
        type: 'object',
        properties: { key: { type: 'string' }, slice: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, kind: { enum: ['order', 'contract'] } },
      },
    },
    // Sections 5.4a and 5.5a step 4: the budget reading and the free check of the stop check.
    budget: BUDGET_FIELD,
    answered: ANSWERED_FIELD,
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
          units: { type: 'array', items: { type: 'string' } },
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
        properties: { rubric: { type: 'string' }, file: { type: 'string' }, focus: { type: 'string' }, reason: { type: 'string' } },
      },
    },
    steeringPresent: { type: 'boolean' },
    stopped: { type: 'boolean' },
    stopKind: { enum: ['stop', 'pause', 'slug-stop'] },
    stopThen: { enum: ['move', 'hold'] },
    stopReason: { type: 'string' },
    budget: BUDGET_FIELD,
    answered: ANSWERED_FIELD,
  },
}

// One refuter checks one finding, or a group of findings of one rubric (section 5.4 item 4).
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

const OK_SCHEMA = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, wrote: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } } }

// ---------------------------------------------------------------------------
// The agent count, the ceiling (section 5.12), the stop, and the heavy slots.
// ---------------------------------------------------------------------------
let AGENTS = 0
let STOP = null            // { at, reason, until } once the run stops
const widthChanges = []
const events = []          // the driver's own decisions, for the outcome (D27)

async function call(prompt, opts) {
  AGENTS++
  return await agent(prompt, opts)
}

function reserve(n, what) {
  if (STOP) return false
  if (AGENTS + n <= CEILING) return true
  stopRun('agent-ceiling', `the ${what} needs up to ${n} agents, and ${AGENTS} of the ceiling of ${CEILING} are used: launch the wave again, and the run continues from the ledger and the disk`)
  return false
}

// The heavy slots (section 5.4a): a promise queue whose size follows the budget. When the
// size goes down, an agent in a slot keeps it until it ends; no new heavy agent starts
// while the slots in use are at or above the new size.
const slots = { size: Math.max(1, Math.min(WIDTH_MAX, Number(OPT.width) || WIDTH_MAX)), used: 0, queue: [], peak: 0 }
function pump() {
  while (slots.queue.length && (STOP || slots.used < slots.size)) {
    slots.used++
    slots.peak = Math.max(slots.peak, slots.used)
    slots.queue.shift()()
  }
}
function acquire() {
  return new Promise((resolve) => { slots.queue.push(resolve); pump() })
}
function release() { slots.used--; pump() }
const STOPPED = { status: 'stopped', stopKind: 'run', stopReason: 'the run stops', artifactPath: '', terminal: {} }
async function heavy(fn) {
  await acquire()
  if (STOP) { release(); return STOPPED }
  try { return await fn() } finally { release() }
}

function setSlots(to, reading) {
  const n = Math.max(1, Math.min(WIDTH_MAX, Math.round(to)))
  if (n === slots.size) return
  const from = slots.size
  slots.size = n
  widthChanges.push({ readingAt: (reading && reading.readingAt) || null, state: (reading && reading.state) || null, from, to: n })
  log(`heavy slots: ${from} → ${n} (budget ${(reading && reading.state) || '?'})`)
  pendingEvents.push({ event: 'width', fields: { from, to: n, state: (reading && reading.state) || null, until: (reading && reading.until) || null } })
  pump()
  flushEvents()
}

function applyBudget(b) {
  if (!b || typeof b !== 'object') return
  const w = Number(b.width)
  if (b.state === 'pause' || w === 0) {
    stopRun('usage-pause', b.reason || 'the budget width is 0', b.until || null)
    return
  }
  if (Number.isFinite(w) && w > 0) setSlots(Math.min(WIDTH_MAX, w), b)
}

// A stage result carries the budget reading and the free check of its stop check.
function absorb(res) {
  if (!res || typeof res !== 'object') return res
  if (res.budget) applyBudget(res.budget)
  if (Array.isArray(res.answered) && res.answered.length) onAnswered(res.answered)
  return res
}

// ---------------------------------------------------------------------------
// The driver's events (D27). An event agent appends them to the campaign journal,
// several at a time. `needs add` and the revert step append their own.
// ---------------------------------------------------------------------------
const pendingEvents = []
// The flushes run one after the other on one chain. A width change starts a flush that
// nothing awaits; the engine drops an agent that is still out when the script returns
// (P9), so the last `await flushEvents()` waits for the whole chain.
let FLUSHING = Promise.resolve()
function flushEvents() {
  FLUSHING = FLUSHING.then(flushBatch, flushBatch)
  return FLUSHING
}
async function flushBatch() {
  if (!pendingEvents.length) return
  const batch = pendingEvents.splice(0, pendingEvents.length)
  for (const e of batch) events.push(e)
  const tag = `event:${batch.map(e => e.event).join('+')}`
  await call(
    `CAMPAIGN JOURNAL EVENTS for campaign '${brainstorm}', wave ${wave}. Bookkeeping only: run each command below, in ` +
    `order, and change nothing else.\n` +
    batch.map(e => `- \`${cmd('journal', `${e.event} ${q(JSON.stringify({ run: RUN, wave, ...e.fields }))}`)}\``).join('\n') +
    `\n\nReturn { ok, note }.` + waveHeartbeat(tag, 'event'),
    { schema: OK_SCHEMA, label: tag, phase: 'Drive', ...SONNET }
  )
}

// ---------------------------------------------------------------------------
// orientUnit() — yolo's orient (yolo.js:819) for one unit. A first orient mints the
// unit's run id only when the ledger has none; a resume orient keeps it and counts
// `seq` on. With MERGE_HEAD, it aborts the half merge (section 5.3 step 1).
// ---------------------------------------------------------------------------
async function orientUnit(u, opts = {}) {
  const resume = opts.resume === true
  const keep = u.runId ? u.runId : ''
  const label = resume ? 'orient:resume' : 'orient'
  const res = await call(
    `You are the ORIENT step of the campaign wave driver for unit ${u.key} (slug '${u.slug}'). READ-ONLY — do not ` +
    `write, edit, commit, or switch anything, except the merge abort of step 9 and your heartbeat lines. The unit's ` +
    `worktree is ${u.root} (absolute): resolve every path under it and run git as \`git -C ${u.root} …\`.\n\n` +
    `1. Read ${u.index}. It is CURRENT STATE only: parse the keys this step names and nothing else. Do NOT read ` +
    `index-history.jsonl or history/. Parse: status, current-stage, review-scope (default 'per-slice' when absent), ` +
    `workflow-type, base-branch, and reconcile-pending (reconcilePending = true iff the key is literally true). ` +
    `ALSO parse the \`runtime-evidence-deferrals\` list: capture every entry whose \`cleared-by\` is null/absent into ` +
    `priorDeferrals as { slice, reason (verbatim), deferredAt, clearedBy, repeatOf, authorized (true iff the entry ` +
    `carries ship-override-authorization), ac, wallOwnership, clearingEvent, clearingProbe }. ALSO parse the ` +
    `\`charter\` list into charter as { id, commitment (verbatim), status }. Report base (= base-branch).\n` +
    `2. DRIVER JOURNAL — read ${u.journal} if it exists (append-only JSONL). ` +
    (keep
      ? `This unit's run id is '${keep}': keep it, report it as runId, and report lastSeq = the largest "seq" of the ` +
        `lines whose run is '${keep}' (0 when none). Report priorJournal: present, entries (every line of run '${keep}', ` +
        `oldest first, each as { at, run, event, status, stage, slice }), and nowAt (the current UTC time).\n`
      : `Report priorJournal: present (true iff the file has at least one parseable line), entries (every line of the ` +
        `newest run, oldest first, each as { at, run, event, status, stage, slice }), and nowAt (the current UTC time). ` +
        `Then mint runId for THIS run: the current UTC timestamp in ISO-8601 basic form plus the slug — e.g. ` +
        `'20261016T143005Z-${u.slug}' — and report lastSeq: 0.\n`) +
    `3. Read ${u.wf}/03-slice.md (the roster). Capture EVERY slice in roster order, with its roster status from ` +
    `00-index.md slices[] (defined | in-progress | complete | skipped). When 03-slice.md is ABSENT and selected-slice ` +
    `is set on 00-index.md, synthesize a one-entry roster [selected-slice], set singleScope=true and ` +
    `reviewScope='slug-wide'.\n` +
    `4. Resolve fileConvention: 'suffixed' for per-slice 03-slice-<slice>.md files (stage files 04-plan-<slice>.md, ` +
    `06-verify-<slice>.md, 07-review-<slice>.md); 'unsuffixed' for a change mode (fix, hotfix, refactor) or a single ` +
    `scope.\n` +
    `5. READINESS GATE. The intake lead (01-intake.md, or 01-fix.md / 01-hotfix.md / 01-refactor.md by workflow-type) ` +
    `must exist and not be awaiting-input; 02-shape.md must exist; 03-slice.md must exist unless singleScope. ` +
    `Otherwise set ok=false with blockReason.\n` +
    `5e. DESIGN GATE (a person confirms the design — never run the design stage). Read ux-impact from 00-index.md. ` +
    `Design is NEEDED when ux-impact ∈ {visual, flow, new-surface}, or when ux-impact is absent and 02b-design.md ` +
    `exists. Design is SETTLED when 02c-craft.md exists with a resolved image-gate (pass or skipped:<reason>) AND a ` +
    `direction-confirmed-by field, or when progress.design is 'skipped' with a design-skip-reason. When 02c-craft.md ` +
    `carries boards: and ux-impact is visual or new-surface, the design is settled only when every board file of that ` +
    `manifest exists: run node "${referenceRoot}/../scripts/design-boards.mjs" check "${u.root}" ${u.slug}. The design ` +
    `is NOT settled while progress.design is in-progress. A slice whose 03-slice-<slice>.md carries ux-impact: none ` +
    `does not wait for the design. When design is needed and not settled, and a slice whose plan is not complete ` +
    `lacks ux-impact: none, set ok=false, blockReason='design not confirmed by a person (design stage pending)'.\n` +
    `6. For ALL roster slices, in roster order, mark plan/implement/verify/review 'done' | 'todo':\n` +
    `   - plan: artifact present AND status: complete\n` +
    `   - implement: artifact present AND status: complete\n` +
    `   - verify: artifact present AND convergence ∈ {not-needed, converged} AND (result: pass, OR result: partial ` +
    `where EVERY open deferral of this slice in priorDeferrals has authorized=true)\n` +
    `   - review: artifact present AND verdict ∈ {ship, ship-with-caveats} AND metric-findings-blocker == 0\n` +
    `   In slug-wide review scope, mark every per-slice 'review' as 'n-a'.\n` +
    `6b. reverifyReason for each slice: 'new-work' (a stage is todo for a real reason), 'deferral-rechallenge' (every ` +
    `stage is otherwise clean and the only reason verify is todo is an open UN-authorized deferral), or 'none'.\n` +
    `7. CLEARING-EVENT TRIPWIRE. For every open entry in priorDeferrals with a clearing-probe, run that one command ` +
    `with a short timeout; set clearingProbeHit true when the event has occurred, false when it has not, and omit it ` +
    `when the probe could not run. Do NOT clear the deferral or edit 00-index.md.\n` +
    `8. Run \`git -C ${u.root} branch --show-current\`. When it is not '${u.branch}', set ok=false with blockReason ` +
    `'the worktree is on <branch>, not ${u.branch}'.\n` +
    `9. MERGE CHECK. When \`git -C ${u.root} rev-parse -q --verify MERGE_HEAD\` succeeds, a merge-in stopped half way: ` +
    `run \`git -C ${u.root} merge --abort\` and report mergeAborted: true, so the wait agent can merge again.\n\n` +
    `Return the structured orientation. Set ok=true only when the readiness gate passes.` +
    `\n\nDRIVER HEARTBEAT (MANDATORY). Using the runId of step 2, append two lines to ${u.journal} (append only): ` +
    `one when you have the runId — {"at":"<ISO-8601 UTC now>","run":"<runId>","seq":<lastSeq + 1>,"event":"agent-start",` +
    `"agent":"${lbl(u, label)}","phase":"Orient","stage":"orient","slice":"","driver":"campaign-wave","campaign":"${brainstorm}",` +
    `"campaignRun":"${RUN}"} — and one immediately before you return, the same shape with seq <lastSeq + 2>, ` +
    `"event":"agent-end", "status":"<ok|blocked>" and "errors":<count of errors you recovered from>.`,
    { schema: UNIT_ORIENT, label: lbl(u, label), phase: 'Orient', ...OPUS }
  )
  if (!res) return null
  u.runId = (res.runId && String(res.runId).trim()) || keep || `run-${u.slug}`
  u.seq = Math.max(u.seq, (Number(res.lastSeq) || 0) + 2)
  if (!resume) {
    const prior = judgeLiveness(res.priorJournal, keep ? null : u.runId)
    u.priorDriver = prior && prior.present === true ? prior : null
  }
  if (res.mergeAborted) log(`${u.slug}: orient aborted a half merge (MERGE_HEAD); the wait agent merges again`)
  return res
}

// reChallengeClause() — copied (yolo.js:1046).
function reChallengeClause(priorDeferrals) {
  if (!Array.isArray(priorDeferrals) || !priorDeferrals.length) return ''
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

// PARALLEL UNITS (section 6, runStage): the other units of the wave and their plan files.
function parallelUnitsClause(u) {
  const others = U.filter(x => x.key !== u.key && !x.moved)
  if (!others.length) return ''
  return `\n\nPARALLEL UNITS. These units of the same wave build at the same time, each in its own worktree. Their ` +
    `plans are on disk: ${others.map(x => `${x.key} '${x.slug}' — ${x.wf}/04-plan-<slice>.yaml (files, edges)`).join('; ')}. ` +
    `Never edit their worktrees. Their code reaches this branch only through a wait (section 7 of your context ` +
    `file) or at the boundary.`
}

// ANSWERED ESCALATION (section 5.5a step 6): the stage runs again with the person's answer.
function answeredClause(a) {
  if (!a) return ''
  return `\n\nANSWERED ESCALATION (MANDATORY). This stage stopped earlier in this run and asked the person ` +
    `(question ${a.id}): ${q(a.question || '')}. The answer, by ${a.by || 'person'}: ${q(a.answer || '')}. Settle the ` +
    `stopped decision by this answer, and record it as a decision with class 'intent-bearing', the answer quoted, ` +
    `and by: '${a.by || 'person'}'.` +
    (a.startSha
      ? ` The stopped implement began at ${a.startSha}: read \`git diff ${a.startSha}..HEAD\` and \`git status\` for ` +
        `the work it left, then revise or undo that work to fit the answer.`
      : '') +
    ` As the last command before your end heartbeat, run \`${cmd('question', `${a.id} consumed`)}\`.`
}

// ---------------------------------------------------------------------------
// runStage() — yolo's runStage (yolo.js:1074) for one unit.
// ---------------------------------------------------------------------------
async function runStage(u, stage, sliceArg, extra = {}) {
  const idx = u.idx || {}
  const sliceClause = sliceArg ? `, slice '${sliceArg}'` : ''
  const roundClause = extra.round
    ? ` This is autonomous fix ROUND ${extra.round} of up to 2 — a prior round already applied one fix pass; ` +
      `resolve only what still fails. If warned the slice was already verified, proceed with the overwrite.`
    : ''
  const probeClause =
    stage === 'verify' && Array.isArray(extra.probeAcs) && extra.probeAcs.length
      ? ` CORRECTIVE PROBE ROUND — a prior round deferred these AC(s) WITHOUT a capability-probe receipt: ` +
        `${extra.probeAcs.join(', ')}. For EACH, execute the capability probe NOW (if the prior round did not) ` +
        `and attach its receipt — the literal command you ran + a one-line output tail — to that deferral's ` +
        `\`probe\` field (and to interactive-verification-defer-reason). If a probe shows the wall no longer ` +
        `stands, produce the evidence INSTEAD of the deferral. A deferral still carrying no probe after this ` +
        `round will hard-stop the run.`
      : ''
  const reChallenge = stage === 'verify' ? reChallengeClause(idx.priorDeferrals) : ''
  const noIndexClause = extra.noIndexWrites
    ? ` INDEX WRITES WITHHELD: do NOT edit 00-index.md in this run — the driver records your stage completion ` +
      `itself (single-writer). Write only your own stage artifact(s).`
    : ''
  const fanoutClause = extra.fanout
    ? ` PLAN FAN-OUT: you plan '${sliceArg}' CONCURRENTLY with ${extra.fanout.siblings.length ? `these sibling ` +
      `slices: ${extra.fanout.siblings.join(', ')}` : 'no other slice'}. Do NOT create or edit the master ` +
      `04-plan.md — not its body, not its \`## Sibling Plans\` table, not its frontmatter. Write only ` +
      `04-plan-${sliceArg}.md and its sibling 04-plan-${sliceArg}.yaml, and put every file you touch in the .yaml ` +
      `\`files\` list and every cross-slice dependency in \`edges\`, complete: the reconcile step compares those ` +
      `rows across slices after the fan-out and re-plans any slice that overlaps. The master's sibling table for ` +
      `this fan-out is this prompt: the concurrent siblings above have no plan on disk yet. Read the existing ` +
      `04-plan-<other>.md of any slice NOT in that list as plan.md directs.` +
      promptFedLine(['04-plan.md'], `${u.wf}/04-plan-${sliceArg}.md`)
    : ''
  const reconcileClause = extra.reconcile
    ? ` RECONCILE RE-PLAN: 04-plan-${sliceArg}.md already exists, and the fan-out reconcile found that it overlaps ` +
      `${extra.reconcile.with.length ? extra.reconcile.with.join(', ') : 'a sibling plan'}` +
      `${extra.reconcile.detail ? ` (${extra.reconcile.detail})` : ''}. Run plan.md's review mode on the existing ` +
      `plan (review-and-fix, not a fresh plan): read each overlapping sibling plan IN FULL, then fix migration ` +
      `order, shared fixtures, API changes across files and duplicated utilities so the plans agree. Rewrite per ` +
      `${referenceRoot}/_additive-write.md with trigger scope-change, and keep the .yaml files and edges current. ` +
      `Do NOT edit the sibling plans or the master 04-plan.md.`
    : ''
  const scopeHint =
    stage === 'review'
      ? ` Review scope is '${u.reviewScope}': ${u.reviewScope === 'slug-wide'
          ? 'write the single 07-review.md over this unit\'s own commits'
          : 'write 07-review-' + sliceArg + '.md over git diff HEAD for this slice'}.`
      : ''
  const label = `${stage}${sliceArg ? ':' + sliceArg : ''}`
  const phaseName = stage === 'review' ? 'Review' : stage === 'plan' ? 'Plan' : 'Drive'
  return await call(
    `Execute the SDLC '${stage}' stage for slug '${u.slug}'${sliceClause}, FULLY AUTONOMOUSLY (no human in the loop). ` +
    `This slug is unit ${u.key} of wave ${wave} of campaign '${brainstorm}'.\n\n` +
    `${EOB}\n\n` +
    `Read ${referenceRoot}/${stage}.md IN FULL and follow it VERBATIM to do the stage's real work and write its ` +
    `artifact(s) under ${u.wf}/ — with ONE override: wherever the reference tells you ` +
    `to ask the user (AskUserQuestion) or pause for a human, DO NOT. Resolve it yourself by this policy:\n\n` +
    `${POLICY[stage]}${roundClause}${probeClause}${reChallenge}${scopeHint}${noIndexClause}${fanoutClause}` +
    `${reconcileClause}` + steer(u, 'writer') + parallelUnitsClause(u) + answeredClause(extra.answered) +
    (extra.stopCheck === true ? stopCheckClause(u, stage, sliceArg) : '') +
    requiresClause(`${referenceRoot}/${stage}.md`) + `\n\n` +
    `Operating rules:\n` +
    `- GROUNDED PROGRESS (${referenceRoot}/_grounded-progress.md): before reporting progress or terminal state, ` +
    `audit each claim against a tool result from THIS run. Report only work you can point to evidence for; if ` +
    `something is not yet verified, say so; a failing check is reported as failing with its output; every count ` +
    `you return derives from an artifact or tool result you opened this run, never from memory of your own edits.\n` +
    `- EARLY-STOP GUARD (${referenceRoot}/_autonomy-guards.md): before ending, check your last paragraph — if it ` +
    `is a plan, a question, or a promise about work you have not done, do that work now; end only when the stage ` +
    `contract is complete or the policy hard-stopped you.\n` +
    `- Your mandate is ONLY the '${stage}' stage for ${sliceArg ? `slice '${sliceArg}'` : `slug '${u.slug}'`}. Do ` +
    `NOT run other stages, do NOT claim completion of other slices or of the whole workflow, and do NOT recommend ` +
    `routes beyond what this stage's reference itself returns.\n` +
    `- The unit's worktree ${u.root} is ABSOLUTE and is the project root of this stage. Resolve every artifact path ` +
    `under it and run git as \`git -C ${u.root} …\`. Do not rely on your working directory — it is not this worktree. ` +
    `Never check out another branch: the worktree stays on ${u.branch}.\n` +
    `- Write SCHEMA-COMPLETE frontmatter: a strict validator enforces the full sdlc/v1 frontmatter and rejects an ` +
    `incomplete write. Match the reference's artifact contract field-for-field.\n` +
    `- Record EVERY autonomous decision into the artifact (## Assumptions / ## Triage Decisions / ## Fix Status / ` +
    `## Verify-Owned Fixes, per the reference) so this run is exactly as auditable as a human-gated one.\n` +
    `- When the policy says STOP, still finish the artifact in its honest terminal state, then return ` +
    `status:'hard-stop' with hardStopReason.` +
    controlFileRule(u) + deadDriverClause(u.priorDriver) + DECISION_CONTRACT + `\n\n` +
    `Return the terminal state: stage, slice, status ('complete' when the gate is clean, 'hard-stop' when the ` +
    `policy stopped you${extra.stopCheck === true ? ", 'stopped' when the stop-request check stopped you" : ''}), the ` +
    `primary artifactPath, and terminal fields — plan/implement: statusField; verify: convergence + result + ` +
    `deferrals ([{ac, reason, probe}]; [] if none) + substantiveResidual; review: verdict + blockerCount (= ` +
    `metric-findings-blocker, OPEN) — plus the class-stamped decisions you recorded, any residual (could-not-fix) ` +
    `notes, your recovered-error list, steeringHonored (plus steeringConflict when a steering entry stopped you), ` +
    `${stage === 'plan' ? 'crossUnit, ' : ''}${stage === 'implement' ? 'startSha, ' : ''}and the budget and answered ` +
    `fields of the stop check when it ran.` +
    heartbeat(u, label, phaseName, stage, sliceArg, extra.heavy === true),
    { schema: STAGE_RESULT, label: lbl(u, label), phase: phaseName, ...OPUS }
  )
}

// SLICE-COMPLETE WRITE-BACK (yolo.js:1194), then `slice-done` (D24, section 5.6a).
const SLICE_DONE = {
  type: 'object',
  required: ['ok'],
  properties: {
    ok: { type: 'boolean' },
    wrote: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
    sliceDone: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        sha: { type: 'string' },
        ready: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, from: { type: 'string' }, through: { type: 'string' }, sha: { type: 'string' } } } },
        budget: BUDGET_FIELD,
        answered: ANSWERED_FIELD,
        error: { type: 'string' },
      },
    },
  },
}

async function writeBackSliceStatus(u, sliceArg, stagesRun) {
  return await call(
    `SLICE-COMPLETE BOOKKEEPING for slug '${u.slug}' (unit ${u.key}), slice '${sliceArg}'. The wave driver drove ` +
    `this slice through ${stagesRun.length ? stagesRun.join(' → ') : 'its stages'} and every gate cleared. Mirror ` +
    `the recorded outcome into the control files, then record the slice in the campaign ledger.\n\n` +
    `${EOB}\n\n` +
    `ONE-WRITER RULE: /wf verify is the one writer of a roster \`status: complete\`. You only MIRROR it. Read ` +
    `the frontmatter of this slice's verify artifact (06-verify-${sliceArg}.md, or 06-verify.md for an ` +
    `un-suffixed workflow). Mirror \`complete\` ONLY when it records \`result: pass\`. Any other result (a ` +
    `deferral-only \`partial\` included) is not complete: write nothing in steps 1 and 2, and say so in note.\n` +
    `1. In ${u.index}, set this slice's entry in \`slices[]\` to status: complete, and refresh the \`progress\` ` +
    `block (completed/total counts) to match the roster's actual state. Refresh \`updated-at\`.\n` +
    `2. In the roster file (${u.wf}/03-slice.md, or the per-slice 03-slice-${sliceArg}.md when the workflow uses ` +
    `the suffixed convention), when verify did not already set this slice's \`status:\` to complete, set it to ` +
    `complete. Never change an entry that close set to \`skipped\`.\n` +
    `3. Change NOTHING else. Never mark the WORKFLOW complete.\n` +
    `4. LAST, run \`${cmd('slice-done', `${u.key} ${sliceArg} --run ${u.runId}`)}\` and return its JSON object as ` +
    `sliceDone. It commits the records of this slug on the unit branch and marks the waits on this slice ready.` +
    controlFileRule(u) + deadDriverClause(u.priorDriver) + `\n\n` +
    `Return { ok, wrote: [<the files you actually changed>], note, sliceDone }.` +
    heartbeat(u, `writeback:${sliceArg}`, 'Drive', 'writeback', sliceArg),
    { schema: SLICE_DONE, label: lbl(u, `writeback:${sliceArg}`), phase: 'Drive', ...SONNET }
  )
}

// verifyClean(), acKey(), probeGaps() — copied (yolo.js:1262-1313).
function verifyClean(t, residual) {
  if (!t) return false
  const converged = t.convergence === 'converged' || t.convergence === 'not-needed'
  if (!converged || t.substantiveResidual === true) return false
  if (t.result === 'pass') return true
  const hasAc = (arr) => Array.isArray(arr) && arr.some((d) => d && d.ac)
  return t.result === 'partial' && (hasAc(t.deferrals) || hasAc(residual))
}

function acKey(ac) {
  const s = String(ac ?? '').trim()
  const m = s.match(/^AC[-\s]?[\w.]+/i)
  return (m ? m[0] : s).replace(/[-\s]/g, '').toUpperCase()
}

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

// evaluateGate() — copied (yolo.js:1723).
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

// driveVerify() — yolo's verify loop (yolo.js:1319), inside a heavy slot.
async function driveVerify(u, sliceArg, extra = {}) {
  const idx = u.idx || {}
  let last
  let probeCorrection = null
  for (let round = 1; round <= 2; round++) {
    last = absorb(await heavy(() => runStage(u, 'verify', sliceArg, { round, probeAcs: probeCorrection, stopCheck: round === 1 && !probeCorrection, heavy: true, answered: round === 1 ? extra.answered : null })))
    if (!last) return { stage: 'verify', slice: sliceArg, status: 'hard-stop', artifactPath: '', terminal: {}, transient: true, hardStopReason: 'verify did not return (subagent skipped or hit a transient API error)' }
    if (last.status === 'hard-stop' || last.status === 'stopped') return last
    const t = last.terminal || {}
    if (verifyClean(t, last.residual)) {
      const sliceAuthorized = Array.isArray(idx.priorDeferrals) &&
        idx.priorDeferrals.some(p => p && p.slice === sliceArg && p.authorized === true)
      const gaps = sliceAuthorized ? [] : probeGaps(t, last.residual)
      if (gaps.length) {
        if (round < 2 && !probeCorrection) {
          probeCorrection = gaps.map(g => g.ac)
          log(`verify:${sliceArg}@${u.slug} clean but ${gaps.length} deferral(s) carry no capability-probe receipt (${probeCorrection.join(', ')}) — one corrective re-run`)
          continue
        }
        return { ...last, status: 'hard-stop', hardStopReason: `deferral(s) still carry no capability-probe receipt after a corrective re-run: ${gaps.map(g => g.ac).join(', ')} — attach the literal probe command + output tail per verify.md §"Attempt before declare", or produce the evidence if the wall no longer stands` }
      }
      return last
    }
    if (t.result === 'blocked-runtime-evidence-missing') {
      return { ...last, status: 'hard-stop', hardStopReason: 'a user-observable AC has no runtime evidence and was not deferred — re-run /wf verify (it should defer un-producible evidence) or /wf probe in a capable environment; never fabricated' }
    }
    log(`verify:${sliceArg}@${u.slug} round ${round} → convergence=${t.convergence} result=${t.result} substantiveResidual=${t.substantiveResidual === true}`)
    if (round === 2) {
      return { ...last, status: 'hard-stop', hardStopReason: 'verify did not converge after 2 autonomous fix rounds (substantive issues remain)', notConverged: true }
    }
  }
  return last
}

// The wall probe (yolo.js:1388-1433) — copied, inside a heavy slot.
const WALL_PROBE_RESULT = {
  type: 'object',
  required: ['walls'],
  properties: {
    walls: {
      type: 'array',
      items: {
        type: 'object',
        required: ['ac', 'stands'],
        properties: { ac: { type: 'string' }, stands: { type: 'boolean' }, probe: { type: 'string' }, note: { type: 'string' } },
      },
    },
    escalateReason: { type: 'string' },
  },
}

async function driveWallProbe(u, sliceArg) {
  const open = ((u.idx && u.idx.priorDeferrals) || []).filter(d => d && d.slice === sliceArg && d.authorized !== true)
  const lines = open.map(d => `    • ${d.ac ? `${d.ac} — ` : ''}${d.reason || '(no reason recorded)'}` +
    `${d.clearingEvent ? ` [clearing event: ${d.clearingEvent}]` : ''}` +
    `${d.clearingProbe ? ` [clearing probe: ${d.clearingProbe}]` : ''}`).join('\n')
  return await heavy(() => call(
    `WALL RE-CHALLENGE for slug '${u.slug}', slice '${sliceArg}'. This slice is already built, verified, and (where ` +
    `applicable) reviewed — its ONLY residue is open runtime-evidence deferral(s). Your job is NOT to re-verify ` +
    `the slice. It is to answer one question per wall: **does this wall still stand?**\n\n` +
    `${EOB}\n\n` +
    `Open deferrals recorded for this slice in ${u.index}:\n${lines || '    (none)'}\n\n` +
    `For EACH, re-execute its capability probe FRESH now (the recorded clearing-probe when one exists, otherwise ` +
    `the probe named in the defer-reason), in the worktree ${u.root}, and record the literal command plus a one-line ` +
    `output tail. Report stands: true when the wall is still there, stands: false when it has fallen. Read-only: ` +
    `run the probes, write NOTHING — no artifacts, no index edits, no commits.` + steer(u, 'context') + `\n\n` +
    `Set escalateReason ONLY if you find something that genuinely warrants re-running the whole verify stage — ` +
    `the artifacts contradict the index, or a wall fell and its acceptance criterion now needs real evidence ` +
    `collected. If every wall still stands, leave escalateReason empty.` +
    heartbeat(u, `wall-probe:${sliceArg}`, 'Drive', 'wall-probe', sliceArg, true),
    { schema: WALL_PROBE_RESULT, label: lbl(u, `wall-probe:${sliceArg}`), phase: 'Drive', ...SONNET }
  ))
}

// classifyDecisions() — copied (yolo.js:1445).
async function classifyDecisions(u, res) {
  const bare = (res.decisions || []).filter(d => d && !(d.class && String(d.class).trim()))
  if (!bare.length) return res
  const listed = bare.map((d, i) => `    ${i + 1}. ${d.decision || d.what || d.summary || JSON.stringify(d)}`).join('\n')
  const tag = `classify:${res.stage}${res.slice ? ':' + res.slice : ''}`
  const out = await call(
    `DECISION CLASSIFICATION (read-only) for slug '${u.slug}', stage '${res.stage}'` +
    `${res.slice ? `, slice '${res.slice}'` : ''}. The stage recorded these decisions WITHOUT the mandatory ` +
    `\`class\` stamp:\n${listed}\n\n` +
    `Read ${referenceRoot}/_decision-classes.md IN FULL, then read the stage artifact at ` +
    `${res.artifactPath || `${u.wf}/`} for the context each decision was made in. ` +
    `Classify EACH as 'implementation-detail' or 'intent-bearing' by that file's six tests. Write nothing.\n\n` +
    `Two rules that decide this round's worth:\n` +
    `- When a decision could plausibly be intent-bearing, classify it 'intent-bearing'.\n` +
    `- If you genuinely cannot tell from the artifact, return class 'unclassified' with a reason. Do NOT guess ` +
    `to fill the field.` +
    steer(u, 'classify') + `\n\n` +
    `Return { classified: [{ index (1-based, from the list above), class, why }] }.` +
    heartbeat(u, tag, 'Drive', 'classify', res.slice),
    {
      schema: {
        type: 'object',
        required: ['classified'],
        properties: {
          classified: {
            type: 'array',
            items: { type: 'object', required: ['index', 'class'], properties: { index: { type: 'number' }, class: { type: 'string' }, why: { type: 'string' } } },
          },
        },
      },
      label: lbl(u, tag), phase: 'Drive', ...SONNET,
    }
  )
  if (!out || !Array.isArray(out.classified)) return res
  for (const c of out.classified) {
    const target = bare[(c && c.index || 0) - 1]
    if (!target || !c.class) continue
    const cls = String(c.class).trim()
    if (cls && cls !== 'unclassified') {
      target.class = cls
      target.classifiedBy = 'corrective-round'
      if (c.why) target.classReason = c.why
    }
  }
  return res
}

// ---------------------------------------------------------------------------
// reviewUnit() — yolo's driveReview (yolo.js:1509) for one unit, over the unit's own
// commits (section 5.4 item 4): the code that came in through a merge-in belongs to
// the other unit and passed its checks. At most 12 refuters run. The writer takes a
// heavy slot; the selection, the scouts and the refuters take none. `writerOnly`
// runs only the writer again, with the stored findings and the answer (kind review).
// ---------------------------------------------------------------------------
function ownCommits(u, sliceArg, from) {
  const base = from || (u.idx && u.idx.base) || WAVE_BASE || 'HEAD~1'
  const not = u.mergedIn.length ? ` --not ${u.mergedIn.join(' ')}` : ''
  return `git -C ${u.root} log -p --no-merges ${base}..HEAD${not}`
}

// Group the findings so that at most REFUTER_LIMIT refuters run: one finding each up to
// the limit, then groups of 4 (or more) findings of one rubric.
function refuteGroups(raw) {
  if (raw.length <= REFUTER_LIMIT) return raw.map(f => [f])
  for (let size = 4; ; size++) {
    const byRubric = new Map()
    for (const f of raw) {
      const r = f.rubric || '?'
      if (!byRubric.has(r)) byRubric.set(r, [])
      byRubric.get(r).push(f)
    }
    const groups = []
    for (const list of byRubric.values()) for (let i = 0; i < list.length; i += size) groups.push(list.slice(i, i + size))
    if (groups.length <= REFUTER_LIMIT) return groups
  }
}

async function refuteAll(raw, labelOf, promptOf) {
  const groups = refuteGroups(raw)
  const verdicts = await Promise.all(groups.map((g, i) => call(promptOf(g), { schema: REFUTE_GROUP, label: labelOf(g, i), phase: 'Review', ...SONNET })))
  const kept = []
  groups.forEach((g, i) => {
    const v = verdicts[i]
    for (const f of g) {
      const hit = v && Array.isArray(v.verdicts) ? v.verdicts.find(x => x && x.id === f.id) : null
      if (hit && hit.refuted === false) kept.push(f)
    }
  })
  return kept
}

async function reviewUnit(u, sliceArg, opts = {}) {
  const tag = sliceArg ? `:${sliceArg}` : ''
  const startSha = sliceArg ? (opts.startSha || ((u.cleared[u.cleared.length - 1] || {}).sha) || null) : null
  const diffCmd = ownCommits(u, sliceArg, startSha)
  const outPath = `${u.wf}/${sliceArg ? `07-review-${sliceArg}.md` : '07-review.md'}`
  let verified = opts.writerOnly && u.lastReview ? u.lastReview.verified : null
  let rubrics = opts.writerOnly && u.lastReview ? u.lastReview.rubrics : null
  if (!verified) {
    if (!reserve(1 + 10 + 2 + REFUTER_LIMIT + 1, `review of ${u.slug}`)) return STOPPED
    const selection = absorb(await call(
      `SELECT REVIEW RUBRICS for slug '${u.slug}'${sliceArg ? `, slice '${sliceArg}'` : ''}. READ-ONLY — write nothing.\n\n` +
      `Read ${referenceRoot}/review/_stage.md "# Step 2: Select Review Commands" and ${referenceRoot}/review/_select.md, ` +
      `then apply them to this change: read ${u.index} (workflow-type), the shape and slice artifacts, and this unit's ` +
      `own commits: \`${diffCmd}\` (the commits that came in through a merge-in are left out: they belong to another ` +
      `unit and passed its review). Honor the core set, the signal-driven rules, and the selection constraints.\n\n` +
      `Return rubrics: one entry per selected rubric as { rubric, file, focus, reason }, where file is the rubric's ` +
      `path relative to ${referenceRoot} (review/<name>.md, or design/audit.md / design/critique.md). Return ` +
      `steeringPresent: true when ${u.steer} or ${CAMPAIGN_STEER} exists with at least one entry, false otherwise.` +
      steer(u, 'context') + stopCheckClause(u, 'review', sliceArg) +
      ` When the stop-request check stops you, return rubrics: [], stopped: true, stopKind, stopThen and stopReason; ` +
      `otherwise return stopped: false.` +
      heartbeat(u, `select-rubrics${tag}`, 'Review', 'review', sliceArg),
      { schema: RUBRIC_SELECTION, label: lbl(u, `select-rubrics${tag}`), phase: 'Review', ...SONNET }
    ))
    if (selection && selection.stopped === true) {
      return { stage: 'review', slice: sliceArg || undefined, status: 'stopped', stopKind: selection.stopKind || 'stop', stopThen: selection.stopThen, stopReason: selection.stopReason || 'stop request', artifactPath: '', terminal: {}, budget: selection.budget }
    }
    if (STOP) return STOPPED
    rubrics = (selection && Array.isArray(selection.rubrics) && selection.rubrics.length)
      ? selection.rubrics.filter(r => r && r.rubric && r.file)
      : ['correctness', 'security', 'architecture'].map(r => ({ rubric: r, file: `review/${r}.md`, focus: '' }))
    const scoutPrompt = (r) =>
      `READ-ONLY review of slug '${u.slug}'${sliceArg ? `, slice '${sliceArg}'` : ''} along the '${r.rubric}' rubric ONLY` +
      `${r.focus ? ` (focus: ${r.focus})` : ''}. Read ${referenceRoot}/${r.file}` +
      `${r.focus ? ` — the '${r.focus}' section and '# Severity calibration'` : ' in full'}, and apply it as the ` +
      `rubric's own severity scale. Inspect this unit's own commits: \`${diffCmd}\`. Report only findings those ` +
      `commits support. Return each as { id, severity (BLOCKER|HIGH|MED|LOW|NIT), file, line, issue, confidence }. ` +
      `Write nothing.\n\n${EOB}` + steer(u, 'context')
    const scoutCalls = rubrics.map(r => call(scoutPrompt(r), { schema: FINDINGS_SCHEMA, label: lbl(u, `scout:${r.rubric}${r.focus ? ':' + r.focus : ''}${tag}`), phase: 'Review', ...SONNET })
      .then(s => ((s && s.findings) || []).map((f, i) => ({ ...f, id: `${r.rubric}-${f.id || i + 1}`, rubric: r.rubric }))))
    if (selection && selection.steeringPresent === true) {
      scoutCalls.push(call(
        `READ-ONLY review of slug '${u.slug}'${sliceArg ? `, slice '${sliceArg}'` : ''} along the standing-steering ` +
        `rubric ONLY. Inspect this unit's own commits: \`${diffCmd}\`. Return each finding as { id, severity ` +
        `(BLOCKER|HIGH|MED|LOW|NIT), file, line, issue, confidence }. Write nothing.\n\n${EOB}` + steer(u, 'scout'),
        { schema: FINDINGS_SCHEMA, label: lbl(u, `scout:steering${tag}`), phase: 'Review', ...SONNET }
      ).then(s => ((s && s.findings) || []).map((f, i) => ({ ...f, id: `steering-${f.id || i + 1}`, rubric: 'steering' }))))
    }
    // The campaign-contract scout (yolo.js:1572): the slug's contract lines in the context file.
    scoutCalls.push(call(
      `READ-ONLY review of slug '${u.slug}'${sliceArg ? `, slice '${sliceArg}'` : ''} along the campaign-contract ` +
      `rubric ONLY. Read ${u.contextPath} in full, fresh. Inspect this unit's own commits: \`${diffCmd}\`. ` +
      `${sliceArg ? `This is a per-slice review: report a provides line or a succeeding expects line only when the ` +
        `commits contradict it, because a later slice can still meet it.` : `This is the slug-wide review: a provides ` +
        `line of this slug that the commits do not meet is a finding with severity HIGH.`} A change that breaks a ` +
      `succeeding expects line is a finding with severity HIGH. Quote the line in the issue. Return each finding as ` +
      `{ id, severity (BLOCKER|HIGH|MED|LOW|NIT), file, line, issue, confidence }; with no contract line touched, ` +
      `return findings: []. Write nothing.\n\n${EOB}`,
      { schema: FINDINGS_SCHEMA, label: lbl(u, `scout:campaign-contract${tag}`), phase: 'Review', ...SONNET }
    ).then(s => ((s && s.findings) || []).map((f, i) => ({ ...f, id: `contract-${f.id || i + 1}`, rubric: 'campaign-contract' }))))
    const raw = (await Promise.all(scoutCalls)).flat()
    if (STOP) return STOPPED
    verified = await refuteAll(
      raw,
      (g, i) => lbl(u, `refute:${g.length === 1 ? g[0].id : `${g[0].rubric}#${i + 1}`}${tag}`),
      (g) => `Adversarially REFUTE ${g.length === 1 ? 'this code-review finding' : `each of these ${g.length} code-review findings`}. ` +
        `Default to refuted=true if uncertain or unreproducible. Inspect ${u.root} (read-only) and this unit's own ` +
        `commits (\`${diffCmd}\`) to check. Findings: ${JSON.stringify(g.map(({ rubric, ...f }) => f))}. Return ` +
        `{ verdicts: [{ id, refuted, reason }] }, one for each finding.` + steer(u, 'refute')
    )
    u.lastReview = { verified, rubrics, slice: sliceArg }
    log(`review of ${u.slug}${tag}: ${raw.length} raw findings → ${verified.length} survived the refuters (${refuteGroups(raw).length} refuter agents)`)
  }
  return absorb(await heavy(() => call(
    `Execute the SDLC 'review' stage for slug '${u.slug}'${sliceArg ? `, slice '${sliceArg}'` : ''}, FULLY AUTONOMOUSLY.\n\n` +
    `${EOB}\n\n` +
    `Read ${referenceRoot}/review.md IN FULL and follow it VERBATIM for the artifact write, triage, fix loop, and ` +
    `accumulating ledger. Review scope is '${u.reviewScope}'. The review reads this unit's own commits only ` +
    `(\`${diffCmd}\`). A parallel per-dimension scan has ALREADY been run and adversarially verified; record and ` +
    `triage these surviving findings (re-confirm any you doubt, but do not discard the scan): ${JSON.stringify(verified)}.\n\n` +
    `Apply the autonomous triage policy: ${POLICY.review}` + steer(u, 'writer') + answeredClause(opts.answered) + `\n\n` +
    `The unit's worktree ${u.root} is ABSOLUTE; resolve paths under it and run \`git -C ${u.root} …\`. Fix code on ` +
    `${u.branch} only. Write schema-complete frontmatter. Return the terminal state (verdict + blockerCount, ` +
    `decisions, residual, and steeringHonored / steeringConflict when steer.md exists).` +
    requiresClause(`${referenceRoot}/review.md`) +
    promptFedLine([...new Set((rubrics || []).map(r => r.file))], outPath) +
    controlFileRule(u) + deadDriverClause(u.priorDriver) + DECISION_CONTRACT +
    heartbeat(u, `review${tag}`, 'Review', 'review', sliceArg, true),
    { schema: STAGE_RESULT, label: lbl(u, `review${tag}`), phase: 'Review', ...OPUS }
  )))
}

// ---------------------------------------------------------------------------
// The hand-back collectors (yolo.js:1828-2055) — copied, applied to each unit.
// ---------------------------------------------------------------------------
function collectDeferrals(o) {
  const chains = Array.isArray(o.results) ? o.results : (o.ran ? [{ ran: o.ran }] : [])
  const out = []
  const seen = new Set()
  const push = (slice, ac, reason, probe) => {
    if (!ac) return
    const key = `${slice || ''}::${acKey(ac)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(probe ? { slice, ac, reason, probe } : { slice, ac, reason })
  }
  for (const c of chains) {
    for (const r of (c && c.ran) || []) {
      if (!r || r.stage !== 'verify') continue
      const t = r.terminal || {}
      if (Array.isArray(t.deferrals)) for (const d of t.deferrals) push(r.slice || (d && d.slice), d && d.ac, d && d.reason, d && d.probe)
      if (Array.isArray(r.residual)) for (const d of r.residual) if (d && d.ac) push(r.slice || d.slice, d.ac, d.reason, d.probe)
    }
  }
  return out
}

function classificationIndex(o, priorDeferrals) {
  const map = new Map()   // acKey → { classification, source }
  for (const d of (priorDeferrals || [])) {
    if (!d || !d.ac) continue
    const cls = d.classification || d.wallOwnership
    if (cls) map.set(acKey(d.ac), { classification: String(cls), source: 'index-ledger' })
  }
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
    intentBearingGuarantee: unclassified.length ? 'suspect' : 'exact',
  }
}

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

// ---------------------------------------------------------------------------
// The charter checkpoint (yolo.js:2095) — copied. It also judges the carried
// decisions of section 1 of the context file (section 5.4).
// ---------------------------------------------------------------------------
const CHECKPOINT_RESULT = {
  type: 'object',
  required: ['commitments'],
  properties: {
    commitments: {
      type: 'array',
      items: { type: 'object', required: ['id', 'status'], properties: { id: { type: 'string' }, status: { enum: ['honored', 'at-risk', 'broken'] }, note: { type: 'string' } } },
    },
    summary: { type: 'string' },
    steeringViolations: {
      type: 'array',
      items: { type: 'object', required: ['entry', 'kind'], properties: { entry: { type: 'string' }, kind: { enum: ['veto', 'preference'] }, note: { type: 'string' } } },
    },
  },
}

async function charterCheckpoint(u, throughSlice) {
  const charterList = ((u.idx && u.idx.charter) || []).map(c => `${c.id}: ${c.commitment}`).join('\n    ')
  return await call(
    `CHARTER FIDELITY CHECKPOINT for slug '${u.slug}', after slice '${throughSlice}'. READ-ONLY — do not ` +
    `write, edit, or commit. The worktree ${u.root} is ABSOLUTE; run git as \`git -C ${u.root} …\`.\n\n` +
    `The intake committed to these charter commitments:\n    ${charterList || '(none)'}\n\n` +
    `Also read section "1. This slug's carried decisions" of ${u.contextPath}: each carried decision is one more ` +
    `commitment, with its key as the id.\n\n` +
    `Read the last few implement artifacts under ${u.wf}/ and inspect the built code they touched. For EACH ` +
    `commitment, judge whether the build so far is still ADVANCING it: 'honored' (the code visibly serves it), ` +
    `'at-risk' (drifting — a decision has weakened it), or 'broken' (the code now contradicts it). Return ` +
    `{ commitments: [{id, status, note}], summary }. Judge against the CODE, not the artifacts' claims.` +
    steer(u, 'checkpoint') +
    heartbeat(u, `checkpoint:${throughSlice}`, 'Drive', 'charter-checkpoint', throughSlice),
    { schema: CHECKPOINT_RESULT, label: lbl(u, `checkpoint:${throughSlice}`), phase: 'Drive', ...SONNET }
  )
}

// ---------------------------------------------------------------------------
// The plan reconcile of one unit (yolo.js:2140-2232) — copied, always on (D23).
// ---------------------------------------------------------------------------
const RECONCILE_RESULT = {
  type: 'object',
  required: ['overlaps'],
  properties: {
    overlaps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['slice'],
        properties: {
          slice: { type: 'string' },
          with: { type: 'array', items: { type: 'string' } },
          files: { type: 'array', items: { type: 'string' } },
          edges: { type: 'array', items: { type: 'string' } },
          reason: { type: 'string' },
        },
      },
    },
    note: { type: 'string' },
  },
}

function reconcileDue(idx) {
  return !!idx && idx.reconcilePending === true && idx.workflowType !== 'update-deps'
}

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

async function reconcilePlans(u) {
  const r = await call(
    `PLAN RECONCILE for slug '${u.slug}'. READ-ONLY — do not write, edit, or commit anything. Parallel plan agents ` +
    `planned slices without seeing each other's plans; find the plans that must be re-planned together.\n\n` +
    `1. Read the \`## Sibling Plans\` table in ${u.wf}/04-plan.md, and read every ${u.wf}/04-plan-<slice>.yaml in ` +
    `full (\`files\` and \`edges\`). Where the table and a .yaml disagree, the .yaml is the record.\n` +
    `2. Two slices OVERLAP when they list the same file, when an edge of one names the other slice or one of its ` +
    `files, or when both change one migration sequence, one shared fixture, or one public API.\n` +
    `3. Return overlaps: one entry per slice that must be re-planned, as { slice, with, files, edges, reason }. When ` +
    `two slices overlap, name the later one in roster order. Return overlaps: [] when no plans overlap.` + steer(u, 'context') +
    heartbeat(u, 'plan-reconcile', 'Plan', 'plan-reconcile', null),
    { schema: RECONCILE_RESULT, label: lbl(u, 'plan-reconcile'), phase: 'Plan', ...SONNET }
  )
  if (!r) return { ok: false, stopped: true, reason: 'plan reconcile did not return — reconcile-pending stays set', overlaps: [], ran: [] }
  const targets = overlappingSlices(r.overlaps, (u.idx && u.idx.slices) || [])
  const ran = []
  for (const t of targets) {
    log(`plan reconcile ${u.slug} → re-plan '${t.slice}' (overlaps ${t.with.join(', ') || 'a sibling'}${t.detail ? `: ${t.detail}` : ''})`)
    let res = absorb(await runStage(u, 'plan', t.slice, { reconcile: { with: t.with, detail: t.detail } }))
    if (res && Array.isArray(res.decisions) && res.decisions.length) res = await classifyDecisions(u, res)
    ran.push(res)
    if (!res || res.status === 'hard-stop' || evaluateGate('plan', res) === 'hard-stop') {
      return { ok: false, stopped: true, stoppedSlice: t.slice, result: res, reason: (res && res.hardStopReason) || `reconcile re-plan of '${t.slice}' did not clear the plan gate`, overlaps: targets, ran }
    }
  }
  const cleared = await call(
    `PLAN RECONCILE BOOKKEEPING for slug '${u.slug}'. The reconcile step finished: ` +
    `${targets.length ? `the driver re-planned ${targets.map(t => `'${t.slice}'`).join(', ')}` : 'no sibling plans overlap'}.\n\n${EOB}\n\n` +
    `1. ${targets.length ? `In ${u.wf}/04-plan.md, rewrite the \`## Sibling Plans\` rows of the re-planned slices from ` +
    `their 04-plan-<slice>.yaml \`files\` and \`edges\`. Change no other row.` : 'Leave 04-plan.md unchanged.'}\n` +
    `2. In ${u.index}, DELETE the \`reconcile-pending\` key from the frontmatter, and refresh \`updated-at\`. Change ` +
    `NOTHING else.` + controlFileRule(u) +
    `\n\nReturn { ok, wrote: [<files changed>], note }.` +
    heartbeat(u, 'plan-reconcile-clear', 'Plan', 'plan-reconcile', null),
    { schema: OK_SCHEMA, label: lbl(u, 'plan-reconcile-clear'), phase: 'Plan', ...SONNET }
  )
  return { ok: true, stopped: false, overlaps: targets, ran, markerCleared: !!(cleared && cleared.ok) }
}

// ---------------------------------------------------------------------------
// The read-check report (yolo.js:2240-2299) — copied. It reads the main checkout's
// read ledger: the mod writes it at the session root, not in a worktree (5.9).
// ---------------------------------------------------------------------------
const READ_LEDGER_RESULT = {
  type: 'object',
  required: ['present'],
  properties: {
    present: { type: 'boolean' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          at: { type: 'string' }, agentId: { type: 'string' }, stage: { type: 'string' }, artifact: { type: 'string' },
          missing: { type: 'array', items: { type: 'string' } },
          partial: { type: 'array', items: { type: 'string' } },
          waiver: { type: 'string' },
        },
      },
    },
  },
}

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

async function readLedgerReport(u, runStartAt) {
  return await call(
    `READ-CHECK REPORT for slug '${u.slug}'. READ-ONLY — never write, edit, or truncate any file, and never write ` +
    `to ${u.journal} except your own heartbeat lines.\n\n` +
    `Read ${u.readLedger} if it exists. It is append-only JSONL that the mod writes: one row per read check, ` +
    `{"at","agentId","stage","artifact","missing":[...],"partial":[...],"waiver"}. Report present: false when the ` +
    `file is absent or empty. Otherwise report present: true and rows: every row whose \`at\` is at or after ` +
    `${runStartAt || 'the start of this run'}, copied verbatim, clean rows included. Omit a field the row lacks.` +
    heartbeat(u, 'read-check-report', 'Drive', 'read-check', null),
    { schema: READ_LEDGER_RESULT, label: lbl(u, 'read-check-report'), phase: 'Drive', ...SONNET }
  )
}

// ===========================================================================
// The scheduler: questions, the waiter, waits, parks, and the stop.
// ===========================================================================

// ---- The stop (section 5.10) ----------------------------------------------
// Every open wait and every open question resolves with `stopped`, so no walk parks
// for the stop; no new stage agent starts; each walk returns at its next await.
function stopRun(at, reason, until = null) {
  if (STOP) return
  STOP = { at, reason, until }
  log(`wave ${wave}: the run stops (${at}): ${reason}`)
  for (const e of W) settle(e, { stopped: true })
  for (const e of Q.values()) if (e.state === 'open') { e.state = 'stopped'; e.resolve({ stopped: true }) }
  pump()
}

// ---- Questions (section 5.5a) ---------------------------------------------
// One state for each question: open, seen (an answer arrived; its resume runs),
// consumed. The first source that reports an answer moves it to seen.
const Q = new Map()
function openQuestion(id, unitKey, kind, text, ctx = {}) {
  if (Q.has(id)) return Q.get(id)
  let resolve
  const promise = new Promise(r => { resolve = r })
  const e = { id, unit: unitKey, kind, question: text, ctx, state: 'open', resolve, promise }
  Q.set(id, e)
  if (STOP) { e.state = 'stopped'; resolve({ stopped: true }) }
  return e
}
const openQuestions = () => [...Q.values()].filter(e => e.state === 'open')
function onAnswered(list) {
  for (const a of list || []) {
    const e = a && Q.get(a.id)
    if (!e || e.state !== 'open') continue
    e.state = 'seen'
    e.resolve({ id: e.id, kind: e.kind, answer: a.answer, by: a.by || 'person', move: a.move === true, question: e.question, startSha: e.ctx.startSha || null, stage: e.ctx.stage || null, slice: e.ctx.slice || null })
  }
}

// ---- The waiter (section 5.5a step 3) -------------------------------------
const WAITER_RESULT = {
  type: 'object',
  required: ['result'],
  properties: {
    result: { enum: ['answered', 'stopped', 'paused', 'cancelled', 'timeout'] },
    answered: ANSWERED_FIELD,
    kind: { type: 'string' },
    until: { type: 'string' },
    reason: { type: 'string' },
    calls: { type: 'number' },
  },
}
let WAITER = null
let WAITERS = 0
// P14: one waiter agent lived 54 minutes. A wake after 9 minutes found the prompt cache gone
// (about 417k tokens an hour); a wait under 5 minutes keeps each wake a cache read.
const WAIT_S = 270
const WAIT_RUNS = 12
function ensureWaiter() {
  if (WAITER || STOP || !openQuestions().length) return
  WAITER = (async () => {
    let dead = 0
    try {
      while (!STOP && openQuestions().length) {
        if (!reserve(1, 'waiter')) break
        WAITERS++
        const seen = [...Q.values()].filter(e => e.state !== 'open').map(e => e.id)
        const r = await call(
          `WAITER for wave ${wave} of campaign '${brainstorm}'. You wait for the person's answers; you judge nothing ` +
          `and write nothing.\n\nRun this command through Bash, with a Bash timeout of 600000 ms:\n` +
          `  ${cmd('await', `--wave ${wave} --max ${WAIT_S}${seen.length ? ` --seen ${seen.join(',')}` : ''}`)}\n` +
          `It prints one JSON object. When the object has "timeout": true, run the same command again; run it at ` +
          `most ${WAIT_RUNS} times in all. Return at the first object without "timeout": result 'answered' with its answered ` +
          `list, 'stopped' with kind, until and reason, 'paused' with until and reason (copy them from its "paused" ` +
          `field), or 'cancelled'. After ${WAIT_RUNS} timeouts, return result 'timeout'. Return calls: the number of times you ` +
          `ran the command.` + waveHeartbeat(`waiter#${WAITERS}`, 'waiter'),
          { schema: WAITER_RESULT, label: `waiter#${WAITERS}`, phase: 'Drive', ...SONNET }
        )
        if (!r) { if (++dead >= 3) { stopRun('waiter-failed', 'three waiter agents in a row returned nothing; the open questions stay in the ledger for the next launch'); break } continue }
        dead = 0
        if (Array.isArray(r.answered) && r.answered.length) onAnswered(r.answered)
        if (r.result === 'stopped') stopRun(r.kind === 'pause' ? 'usage-pause' : 'stop-request', r.reason || 'stop request', r.until || null)
        else if (r.result === 'paused') stopRun('usage-pause', r.reason || 'usage limit', r.until || null)
        else if (r.result === 'cancelled') {
          // A cancel with no stop in this run is a marker that nobody here wrote: stop, so no parked unit waits forever.
          if (!STOP) stopRun('waiter-cancelled', 'the waiter found a cancel marker that this run did not write; the open questions stay in the ledger for the next launch')
          break
        }
      }
    } finally { WAITER = null }
  })()
}

// ---- Waits (section 5.6) --------------------------------------------------
const W = []
function settle(e, v) {
  if (!e || e.settled) return
  e.settled = true
  e.value = v
  e.resolve(v)
}
function arm(e) {
  e.settled = false
  e.value = null
  e.promise = new Promise(r => { e.resolve = r })
}
function addWait(key, w) {
  if (!w || !w.from) return null
  const through = w.through || 'finished'
  const before = w.before || null
  const have = W.find(x => x.key === key && x.from === w.from && x.through === through && x.before === before)
  if (have) return have
  const e = { key, from: w.from, through, before, why: w.why || '', source: w.source || 'packet', state: w.state || 'open', sha: w.sha || null, passed: false, settled: false }
  arm(e)
  W.push(e)
  const from = byKey.get(e.from)
  if (e.state === 'met') { e.passed = true; settle(e, { met: true }) }
  else if (e.state === 'rejected' || !from || from.moved) settle(e, { rejected: true })
  else if (e.state === 'ready' && e.sha) settle(e, { sha: e.sha })
  return e
}
// `slice-done` returns the waits that its slice made ready.
function onReady(list) {
  for (const r of list || []) {
    for (const e of W) {
      if (e.settled || e.key !== r.key || e.from !== r.from || e.through !== r.through) continue
      e.state = 'ready'
      e.sha = r.sha
      settle(e, { sha: r.sha })
    }
  }
}
function rejectWaitsOn(fromKey) {
  for (const e of W) if (!e.passed && e.from === fromKey) { if (e.settled) arm(e); settle(e, { rejected: true }) }
}
// The slice before which wait e must be met: its `before`, or the first slice of the roster.
function waitSlice(u, e) {
  const roster = ((u.idx && u.idx.slices) || []).map(s => s.slice)
  return e.before && roster.includes(e.before) ? e.before : roster[0]
}

// ---- Deadlock (section 5.6 step 6) ----------------------------------------
// Every walk that is not finished waits, no wait can become ready, no question is
// open, and the run is not stopping. A unit that waits on a parked unit with an open
// question is not a deadlock: the waiter waits for the answer.
function checkDeadlock() {
  if (STOP) return
  const live = U.filter(u => !u.ended)
  if (!live.length) return
  if (!live.every(u => u.blockedOn && !u.blockedOn.settled)) return
  if (openQuestions().length) return
  if ([...Q.values()].some(e => e.state === 'seen' && !e.resumed)) return
  log(`wave ${wave}: deadlock — ${live.map(u => `${u.slug} waits for ${u.blockedOn.from}: ${u.blockedOn.through}`).join('; ')}`)
  for (const u of live) settle(u.blockedOn, { deadlock: true })
}

async function awaitWait(u, e) {
  u.blockedOn = e
  checkDeadlock()
  const v = await e.promise
  u.blockedOn = null
  return v
}

// ---- Parks (section 5.5) --------------------------------------------------
// An answer that lets a stopped unit go on (a slug stop, a move-out question).
const CONTINUE_RE = /^\s*(continue|yes|resume|go on|go)\b/i

const PARK_TEXT = {
  stage: (u, r, c) => `${u.slug} stopped at ${c.stage || 'a stage'}${c.slice ? ` of slice '${c.slice}'` : ''}: ${r}. How should it continue?`,
  review: (u, r, c) => `The review of ${u.slug}${c.slice ? ` (slice '${c.slice}')` : ''} did not clear: ${r}. Fix the open findings this way, or accept them as they are?`,
  'merge-conflict': (u, r, c) => `Merging ${c.from || 'a needed unit'} into ${u.slug} conflicts: ${r}. How should the conflict be resolved?`,
  contract: (u, r) => `${u.slug} would change a campaign contract line: ${r}. Approve the change (give the new line), or refuse it?`,
  'needs-cycle': (u, r) => `A needs entry for ${u.slug} closes a cycle: ${r}. Which slice comes first, or which unit moves out?`,
  deadlock: (u, r) => `${u.slug} waits on a unit that can never finish its slice: ${r}. Which wait should be dropped, or which unit moves out?`,
  'moved-dependency': (u, r) => `${u.slug} waits on a unit that moved out of the wave: ${r}. Drop the wait and continue, or move ${u.slug} out too?`,
  orient: (u, r) => `${u.slug} could not orient: ${r}. Say "continue" when it is fixed, or move it out.`,
  'slug-stop': (u) => `The person asked to stop ${u.slug}. Continue ${u.slug}? (Clear the stop request first.)`,
  'driver-fault': (u, r) => `The wave driver faulted while it drove ${u.slug}: ${r}. Continue from the disk state, or move it out?`,
}

function nextQid(u) {
  u.qCount++
  return `w${wave}-${u.key}-${u.qCount}`
}

const PARK_RESULT = { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, note: { type: 'string' } } }

async function park(u, kind, reason, ctx = {}) {
  if (STOP) return { stopped: true }
  const id = nextQid(u)
  const text = (PARK_TEXT[kind] || PARK_TEXT.stage)(u, String(reason || '').slice(0, 600), ctx)
  const route = `parked: ${kind}: ${String(reason || '').slice(0, 200)}`
  const flags = `--wave ${wave} --unit ${u.key} --kind ${kind}${ctx.stage ? ` --stage ${ctx.stage}` : ''}${ctx.slice ? ` --slice ${ctx.slice}` : ''}`
  await call(
    `PARK unit ${u.key} (slug '${u.slug}') of wave ${wave}, campaign '${brainstorm}'. Bookkeeping only: run these ` +
    `steps in order, and change nothing else (${DRIVE_PROC}, "Park").\n` +
    `1. \`${cmd('unit', `${u.key} stopped --route ${q(route)}`)}\`\n` +
    `2. \`${cmd('ask', `${id} ${flags} ${q(text)}`)}\`\n` +
    `3. Append one line to ${u.journal}: {"at":"<ISO-8601 UTC now>","run":"${u.runId}","event":"waiting","question":"${id}",` +
    `"kind":"${kind}","agent":"${lbl(u, `park:${kind}`)}","stage":"${ctx.stage || ''}","slice":"${ctx.slice || ''}",` +
    `"driver":"campaign-wave","campaign":"${brainstorm}","campaignRun":"${RUN}"}\n` +
    `4. \`${cmd('journal', `park ${q(JSON.stringify({ run: RUN, wave, key: u.key, kind, question: id, reason: String(reason || '').slice(0, 300) }))}`)}\`\n` +
    `Return { ok, note }.` + heartbeat(u, `park:${kind}`, 'Drive', 'park', ctx.slice || null),
    { schema: PARK_RESULT, label: lbl(u, `park:${kind}`), phase: 'Drive', ...SONNET }
  )
  events.push({ event: 'park', fields: { key: u.key, kind, question: id, reason: String(reason || '').slice(0, 300) } })
  u.parks.push({ kind, question: id, reason: String(reason || '').slice(0, 300), stage: ctx.stage || null, slice: ctx.slice || null })
  log(`${u.slug} parks (${kind}): question ${id}`)
  const e = openQuestion(id, u.key, kind, text, ctx)
  u.parked = { kind, id }
  ensureWaiter()
  const a = await e.promise
  u.parked = null
  e.resumed = true
  return a
}

// The unit moves out of the wave: it stays `stopped` with the route `moved by the
// person`, and every wait on it rejects (section 5.5a step 7).
async function moveOut(u, why) {
  await call(
    `MOVE unit ${u.key} (slug '${u.slug}') out of wave ${wave}. Bookkeeping only: run ` +
    `\`${cmd('unit', `${u.key} stopped --route ${q(`moved by the person${why ? `: ${why}` : ''}`)}`)}\` and change ` +
    `nothing else. Return { ok, note }.` + heartbeat(u, 'move', 'Drive', 'move', null),
    { schema: OK_SCHEMA, label: lbl(u, 'move'), phase: 'Drive', ...SONNET }
  )
  u.moved = true
  u.ended = true
  rejectWaitsOn(u.key)
  log(`${u.slug} moves out of wave ${wave}${why ? `: ${why}` : ''}`)
}

// After an answer: stop, move out, or resume (section 5.5a steps 5-7).
// The kinds whose answer a resolve agent reads (afterAnswer). That agent marks the answer consumed.
const RESOLVE_KINDS = ['contract', 'needs-cycle', 'deadlock', 'moved-dependency']

async function onAnswer(u, a, opts = {}) {
  if (!a || a.stopped || STOP) return 'stop'
  if (a.move) { await moveOut(u, a.answer); return 'ended' }
  // A stage that runs again with the answer marks it consumed itself (answeredClause). Any other
  // answer is used up here, so a relaunch does not act on it a second time.
  const carried = ['stage', 'review', 'slug-stop'].includes(a.kind) && !!a.slice
  // opts.consume: the caller runs the stage again with no answer clause.
  const consume = opts.consume === true || (!carried && !RESOLVE_KINDS.includes(a.kind))
  await call(
    `RESUME unit ${u.key} (slug '${u.slug}') after the answer to question ${a.id}. Bookkeeping only: run these ` +
    `commands in order, and change nothing else.\n` +
    `1. \`${cmd('unit', `${u.key} running`)}\`\n` +
    `2. \`${cmd('journal', `resume ${q(JSON.stringify({ run: RUN, wave, key: u.key, question: a.id, by: a.by }))}`)}\`\n` +
    (consume ? `3. \`${cmd('question', `${a.id} consumed`)}\`\n` : '') +
    `Return { ok, note }.` + heartbeat(u, 'resume', 'Drive', 'resume', null),
    { schema: OK_SCHEMA, label: lbl(u, 'resume'), phase: 'Drive', ...SONNET }
  )
  events.push({ event: 'resume', fields: { key: u.key, question: a.id, by: a.by } })
  return 'resume'
}

// The kinds whose answer needs reading (contract, needs-cycle, deadlock,
// moved-dependency): one agent reads it and runs the commands it names.
const RESOLVE_RESULT = {
  type: 'object',
  required: ['action'],
  properties: {
    action: { enum: ['continue', 'replan', 'move'] },
    dropped: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, through: { type: 'string' }, before: { type: 'string' } } } },
    added: { type: 'array', items: { type: 'object', properties: { from: { type: 'string' }, through: { type: 'string' }, before: { type: 'string' }, state: { type: 'string' }, sha: { type: 'string' } } } },
    amended: { type: 'boolean' },
    note: { type: 'string' },
  },
}

async function resolveAnswer(u, a, kind, ctx = {}) {
  return await call(
    `RESOLVE the answer to question ${a.id} (kind ${kind}) for unit ${u.key} (slug '${u.slug}'), wave ${wave}. ` +
    `Read ${DRIVE_PROC}, section "Resume actions", the part for kind ${kind}, and follow it.\n\n` +
    `The question: ${q(a.question)}\nThe answer, by ${a.by}: ${q(a.answer)}\nThe context: ${JSON.stringify(ctx)}\n\n` +
    `The commands you may run: \`${cmd('needs', `${u.key} remove --from <key> --through <slice> --before <slice>`)}\` to ` +
    `drop a derived wait; \`${cmd('needs', `${u.key} add --from <key> --through <slice> --before <slice> --why <text> --by person`)}\` ` +
    `to add the entry the answer gives; \`${cmd('contract', `${ctx.key || u.key} amend --line <line key> --text <text>`)}\` ` +
    `to record an approved contract change. Run only what the answer asks for. Return action: 'continue' (the unit ` +
    `goes on), 'replan' (the plan of the slice runs again with the answer: a refused contract change), or 'move' ` +
    `(the answer moves the unit out of the wave); dropped and added: the waits you removed and added (added with ` +
    `the "wait" of the needs result: state and sha); amended: true when you ran contract amend.` +
    ` When your action is not 'replan', run \`${cmd('question', `${a.id} consumed`)}\` last; a replan passes the ` +
    `answer to the plan, which marks it consumed.` +
    heartbeat(u, `resolve:${kind}`, 'Drive', 'resolve', ctx.slice || null),
    { schema: RESOLVE_RESULT, label: lbl(u, `resolve:${kind}`), phase: 'Drive', ...SONNET }
  )
}

// Apply a resolver result to the driver's waits. Returns 'continue' | 'replan' | 'ended'.
async function applyResolve(u, r) {
  if (!r) return 'continue'
  for (const d of r.dropped || []) {
    for (const e of W) {
      if (e.key !== u.key || e.from !== d.from || (d.through && e.through !== d.through) || (d.before && e.before !== d.before)) continue
      e.passed = true
      if (e.settled) arm(e)
      settle(e, { dropped: true })
    }
  }
  for (const w of r.added || []) addWait(u.key, { ...w, source: 'person' })
  if (r.action === 'move') { await moveOut(u, 'by the answer'); return 'ended' }
  return r.action === 'replan' ? 'replan' : 'continue'
}

// ---- Derived needs entries (section 5.7) -----------------------------------
const derivedNeeds = []
const focus = []
const NEEDS_RESULT = {
  type: 'object',
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' }, from: { type: 'string' }, through: { type: 'string' }, before: { type: 'string' },
          ok: { type: 'boolean' }, exists: { type: 'boolean' }, late: { type: 'boolean' },
          cycle: { type: 'array', items: { type: 'string' } },
          wait: { type: 'object', properties: { state: { type: 'string' }, sha: { type: 'string' } } },
          error: { type: 'string' },
        },
      },
    },
  },
}

// A pair { a, aSlice, b, bSlice }: the later unit in packet order needs the earlier one.
function directPair(p) {
  const A = byKey.get(p.a), B = byKey.get(p.b)
  if (!A || !B || A.key === B.key) return null
  const aFirst = A.order < B.order || (A.order === B.order && A.key < B.key)
  return aFirst
    ? { key: B.key, from: A.key, through: p.aSlice || 'finished', before: p.bSlice || null }
    : { key: A.key, from: B.key, through: p.bSlice || 'finished', before: p.aSlice || null }
}

async function addNeeds(entries, source, labelUnit) {
  if (!entries.length) return []
  const tag = `needs-add${labelUnit ? `:${labelUnit.slug}` : ''}`
  const r = await call(
    `DERIVED NEEDS ENTRIES for wave ${wave} of campaign '${brainstorm}'. Bookkeeping only (${DRIVE_PROC}, "Derived ` +
    `needs"): run each command below, in order, and return its JSON object in results, with the key, from, ` +
    `through and before of its entry. Change nothing else.\n` +
    entries.map(e => `- \`${cmd('needs', `${e.key} add --from ${e.from} --through ${e.through}${e.before ? ` --before ${e.before}` : ''} --why ${q(e.why || '')} --by driver --source ${e.source || source}`)}\``).join('\n') +
    `\n\nReturn { results }.` + waveHeartbeat(tag, 'needs'),
    { schema: NEEDS_RESULT, label: tag, phase: 'Plan', ...SONNET }
  )
  const out = (r && Array.isArray(r.results)) ? r.results : []
  for (const x of out) {
    const e = entries.find(y => y.key === x.key && y.from === x.from && String(y.through) === String(x.through)) || {}
    const u = byKey.get(x.key)
    if (!u) continue
    if (x.cycle && x.cycle.length) { u.startParks.push({ kind: 'needs-cycle', reason: `${x.from} through ${x.through} before ${x.before || 'the first slice'} closes the cycle ${x.cycle.join(' -> ')}`, ctx: { from: x.from, through: x.through, before: x.before } }); continue }
    if (x.late) { focus.push({ a: x.from, aSlice: x.through, b: x.key, bSlice: x.before, files: e.why || '' }); continue }
    if (x.ok && x.wait && !x.exists) {
      derivedNeeds.push({ key: x.key, from: x.from, through: x.through, before: x.before || null, why: e.why || '', source: e.source || source })
      addWait(x.key, { from: x.from, through: x.through, before: x.before || null, why: e.why || '', source: e.source || source, state: x.wait.state, sha: x.wait.sha })
    }
  }
  return out
}

// A crossUnit report of a plan during the walk (section 5.7 item 1).
async function handleCrossUnit(u, sliceArg, list) {
  const order = []
  for (const c of list || []) {
    if (!c || !c.key || !byKey.has(c.key) || c.key === u.key) continue
    if (c.kind === 'contract') {
      u.startParks.push({ kind: 'contract', reason: `slice '${sliceArg}' shares ${(c.files || []).join(', ')} with ${c.key} slice '${c.slice || '?'}' and would change a contract line`, ctx: { slice: sliceArg, key: c.key, files: c.files || [] } })
      continue
    }
    const d = directPair({ a: u.key, aSlice: sliceArg, b: c.key, bSlice: c.slice })
    if (d) order.push({ ...d, why: (c.files || []).join(', '), source: `plan:${sliceArg}` })
  }
  if (order.length) await addNeeds(order, `plan:${sliceArg}`, u)
}

// ---- The cross-unit reconcile (section 5.3 step 3, D23) -------------------
const CROSS_RESULT = {
  type: 'object',
  required: ['pairs'],
  properties: {
    pairs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['a', 'b'],
        properties: {
          a: { type: 'string' }, aSlice: { type: 'string' }, b: { type: 'string' }, bSlice: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } }, kind: { enum: ['order', 'contract'] },
        },
      },
    },
    note: { type: 'string' },
  },
}

async function crossUnitReconcile() {
  const planned = U.filter(u => u.idx && !u.ended)
  if (planned.length < 2 || STOP) return null
  const r = await call(
    `CROSS-UNIT RECONCILE for wave ${wave} of campaign '${brainstorm}'. READ-ONLY — write nothing. Follow ` +
    `${DRIVE_PROC}, section "Cross-unit reconcile".\n\n` +
    `The units, in packet order:\n` +
    planned.map(u => `- ${u.key} '${u.slug}': plans ${u.wf}/04-plan-<slice>.yaml; context ${u.contextPath}`).join('\n') +
    `\n\nRead every 04-plan-<slice>.yaml of every unit in full (its \`files\` and \`edges\`), and the provides and ` +
    `expects lines of every context file. Return pairs: each pair of slices of two DIFFERENT units that change the ` +
    `same file, as { a, aSlice, b, bSlice, files, kind } — kind 'contract' when the shared change would change a ` +
    `provides or expects line of either unit, 'order' otherwise. Return pairs: [] when no two units share a file. ` +
    `A pair that a needs entry of a packet already orders (section 7 of the later unit's context file) is not ` +
    `returned.` + waveHeartbeat('cross-unit-reconcile', 'plan'),
    { schema: CROSS_RESULT, label: 'cross-unit-reconcile', phase: 'Plan', ...SONNET }
  )
  if (!r || !Array.isArray(r.pairs)) return { pairs: [] }
  const order = []
  for (const p of r.pairs) {
    const d = directPair(p)
    if (!d) continue
    if (p.kind === 'contract') {
      const later = byKey.get(d.key)
      later.startParks.push({ kind: 'contract', reason: `slice '${d.before || 'first'}' shares ${(p.files || []).join(', ')} with ${d.from} slice '${d.through}', and the change would change a contract line`, ctx: { slice: d.before, key: d.from, files: p.files || [] } })
      continue
    }
    order.push({ ...d, why: (p.files || []).join(', '), source: 'cross-unit' })
  }
  if (order.length) await addNeeds(order, 'cross-unit')
  log(`cross-unit reconcile: ${r.pairs.length} shared pair(s) → ${derivedNeeds.length} derived needs entr${derivedNeeds.length === 1 ? 'y' : 'ies'}, ${focus.length} late pair(s)`)
  return r
}

// ---- Merge-in (section 5.6 steps 3-4) -------------------------------------
const MERGE_IN_RESULT = {
  type: 'object',
  required: ['ok'],
  properties: {
    ok: { type: 'boolean' },
    conflict: { type: 'array', items: { type: 'string' } },
    error: { type: 'string' },
    closed: { type: 'array', items: { type: 'string' } },
  },
}

async function waitAgent(u, e, sha) {
  return await call(
    `WAIT AGENT for unit ${u.key} (slug '${u.slug}'), wave ${wave}: merge the cleared commit ${sha} of ${e.from} ` +
    `(through '${e.through}') before the implement of '${waitSlice(u, e)}'. Bookkeeping only (${DRIVE_PROC}, "Wait ` +
    `agent"): run these commands in order, and change nothing else.\n` +
    `1. \`${cmd('unit', `${u.key} waiting --on ${q(`${e.from}: ${e.through}`)}`)}\`\n` +
    `2. \`${cmd('merge-in', `${u.key} ${e.from} --at ${sha}`)}\` — it prints one JSON object.\n` +
    `3. Only when step 2 returned "ok": true, run \`${cmd('unit', `${u.key} running`)}\`.\n` +
    `Return { ok, conflict, error, closed } from the object of step 2.` + heartbeat(u, `wait:${e.from}`, 'Drive', 'wait', waitSlice(u, e)),
    { schema: MERGE_IN_RESULT, label: lbl(u, `wait:${e.from}`), phase: 'Drive', ...SONNET }
  )
}

async function mergeAgent(u, e, sha, files, rule) {
  return await heavy(() => call(
    `MERGE CONFLICT in unit ${u.key} (slug '${u.slug}'), wave ${wave}: merging the cleared commit ${sha} of ` +
    `${e.from} conflicts in ${(files || []).join(', ') || 'some files'}. Read ${BOUNDARY_PROC}, section "Merge", and ` +
    `follow it for this one merge, in the worktree ${u.root} (run git as \`git -C ${u.root} …\`): ` +
    `\`git -C ${u.root} -c rerere.enabled=true merge --no-ff ${sha}\`, resolve each conflict so that both units' ` +
    `intent holds, run the tests of both units, and commit the merge. The context files are ${u.contextPath} and ` +
    `${(byKey.get(e.from) || {}).contextPath || ''}.` +
    (rule ? ` The person's rule for this conflict: ${q(rule)}.` : '') +
    ` When a conflict needs a product decision that neither context file settles, run \`git -C ${u.root} merge ` +
    `--abort\` and return resolved: false with the reason. ${EOB}` +
    `\n\nReturn { resolved, reason, sha (the merge commit) }.` + heartbeat(u, `merge:${e.from}`, 'Drive', 'merge', waitSlice(u, e), true),
    { schema: { type: 'object', required: ['resolved'], properties: { resolved: { type: 'boolean' }, reason: { type: 'string' }, sha: { type: 'string' } } }, label: lbl(u, `merge:${e.from}`), phase: 'Drive', ...OPUS }
  ))
}

// Returns 'ok' | 'stop' | 'ended'.
async function mergeIn(u, e, sha) {
  let rule = null
  for (let attempt = 0; attempt < 4; attempt++) {
    if (STOP) return 'stop'
    const r = await waitAgent(u, e, sha)
    if (r && r.ok) { u.mergedIn.push(sha); e.state = 'met'; e.passed = true; return 'ok' }
    let reason = (r && r.error) || 'the wait agent did not return'
    if (r && Array.isArray(r.conflict) && r.conflict.length) {
      const m = await mergeAgent(u, e, sha, r.conflict, rule)
      if (m && m.status === 'stopped') return 'stop'
      if (m && m.resolved) continue   // merge-in again records the merge
      reason = `the merge agent aborted: ${(m && m.reason) || 'no reason'} (files: ${r.conflict.join(', ')})`
    }
    const a = await park(u, 'merge-conflict', reason, { from: e.from, through: e.through, sha, slice: waitSlice(u, e) })
    const h = await onAnswer(u, a)
    if (h !== 'resume') return h
    rule = a.answer
  }
  return 'stop'
}

// Before the implement of slice S, every wait whose `before` is S (section 5.4 item 1).
// Returns 'go' | 'stop' | 'ended'.
async function passWaits(u, sliceArg) {
  for (const e of W.filter(x => x.key === u.key && !x.passed && waitSlice(u, x) === sliceArg)) {
    for (;;) {
      if (STOP) return 'stop'
      const v = await awaitWait(u, e)
      if (!v || v.stopped || STOP) return 'stop'
      if (v.met || v.dropped) { e.passed = true; break }
      if (v.sha) {
        const m = await mergeIn(u, e, v.sha)
        if (m !== 'ok') return m
        break
      }
      const kind = v.rejected ? 'moved-dependency' : 'deadlock'
      const reason = v.rejected ? `${e.from} moved out of the wave; ${u.slug} needs it through '${e.through}'` : `${u.slug} waits for ${e.from} through '${e.through}', and no unit of the wave can move`
      const a = await park(u, kind, reason, { from: e.from, through: e.through, before: e.before, slice: sliceArg })
      const h = await onAnswer(u, a)
      if (h !== 'resume') return h
      const r = await resolveAnswer(u, a, kind, { from: e.from, through: e.through, before: e.before, slice: sliceArg })
      const k = await applyResolve(u, r)
      if (k === 'ended') return 'ended'
      // The answer drops this wait, or keeps it: an answer that drops nothing drops it here.
      if (!e.passed) {
        if (v.rejected || kind === 'moved-dependency') { e.passed = true; break }
        arm(e)
      } else break
    }
  }
  return 'go'
}

// ===========================================================================
// The walks (section 5.4).
// ===========================================================================

// A stage agent that stopped. Returns 'retry' | 'stop' | 'ended'.
async function onStageStop(u, res, stage, sliceArg) {
  if (!res || res.stopKind === 'run' || STOP) return 'stop'
  if (res.stopKind === 'wait') {
    // The second guard of section 5.6: the driver let an implement start before its wait.
    u.waitStops = (u.waitStops || 0) + 1
    log(`${u.slug}: implement:${sliceArg} stopped for a wait (${res.waitsFor || '?'}) — a scheduling fault of the driver; it awaits the wait`)
    if (u.waitStops > 2) {
      const a = await park(u, 'stage', `the context file names a wait (${res.waitsFor || '?'}) that the wave driver does not hold`, { stage, slice: sliceArg })
      const h = await onAnswer(u, a, { consume: true })
      return h === 'resume' ? 'retry' : h
    }
    const w = await passWaits(u, sliceArg)
    return w === 'go' ? 'retry' : w
  }
  if (res.stopKind === 'slug-stop') {
    if (res.stopThen === 'move') { await moveOut(u, 'a stop request moved it out'); return 'ended' }
    const a = await park(u, 'slug-stop', res.stopReason || 'stop request', { stage, slice: sliceArg })
    if (!a || a.stopped) return 'stop'
    if (a.move || !CONTINUE_RE.test(String(a.answer || ''))) { await moveOut(u, a.answer); return 'ended' }
    const h = await onAnswer(u, a, { consume: true })
    return h === 'resume' ? 'retry' : h
  }
  if (res.stopKind === 'pause') { stopRun('usage-pause', res.stopReason || 'pause', (res.budget && res.budget.until) || null); return 'stop' }
  stopRun('stop-request', res.stopReason || 'stop request')
  return 'stop'
}

// One stage of one slice, with its slot and its extras.
async function runOne(u, stage, sliceArg, answered) {
  if (stage === 'plan') {
    const res = absorb(await runStage(u, 'plan', sliceArg, { stopCheck: true, answered }))
    if (res && Array.isArray(res.crossUnit) && res.crossUnit.length) await handleCrossUnit(u, sliceArg, res.crossUnit)
    return res
  }
  if (stage === 'implement') return absorb(await heavy(() => runStage(u, 'implement', sliceArg, { stopCheck: true, heavy: true, answered })))
  if (stage === 'verify') return await driveVerify(u, sliceArg, { answered })
  return await reviewUnit(u, sliceArg, { answered, writerOnly: !!answered && !!u.lastReview && u.lastReview.slice === sliceArg, startSha: u.sliceStart && u.sliceStart[sliceArg] })
}

// walkSlice() — yolo's driveChain (yolo.js:1743) for one unit: waits before implement,
// heavy slots, and the slice clears before `slice-done`.
async function walkSlice(u, s, bounded) {
  const sliceArg = s.slice
  const done = s.stages || {}
  const stages = u.reviewScope === 'per-slice' ? ['plan', 'implement', 'verify', 'review'] : ['plan', 'implement', 'verify']
  const ran = []
  const ranStages = []
  for (const stage of stages) {
    // A refused contract change runs the plan of its slice again, with the answer.
    const replan = stage === 'plan' && u.carryAnswer && u.carryAnswer.replan === true && u.carryAnswer.slice === sliceArg
    if ((done[stage] === 'done' || done[stage] === 'n-a') && !replan) continue
    if (STOP) return { stop: true, ran }
    if (stage === 'implement') {
      const w = await passWaits(u, sliceArg)
      if (w !== 'go') return w === 'stop' ? { stop: true, ran } : { ended: true, ran }
    }
    if (bounded === true && stage === 'verify') {
      const wp = await driveWallProbe(u, sliceArg)
      if (wp && wp.status === 'stopped') return { stop: true, ran }
      if (wp) {
        const fell = (wp.walls || []).filter(w => w && w.stands === false)
        const reason = wp.escalateReason && String(wp.escalateReason).trim()
          ? String(wp.escalateReason).trim()
          : (fell.length ? `${fell.length} wall(s) fell (${fell.map(w => w.ac).join(', ')})` : '')
        const rec = { stage: 'wall-probe', slice: sliceArg, status: 'complete', artifactPath: '', terminal: {}, walls: wp.walls || [] }
        if (!reason) {
          rec.decisions = [{ class: 'implementation-detail', decision: `bounded re-challenge only: every recorded wall on '${sliceArg}' still stands under a fresh probe, so the slice was not re-verified this run` }]
          ran.push(rec); u.results.push(rec); ranStages.push('wall-probe')
          continue
        }
        rec.decisions = [{ class: 'implementation-detail', decision: `escalated '${sliceArg}' from bounded re-challenge to a full verify — ${reason}` }]
        ran.push(rec); u.results.push(rec); ranStages.push('wall-probe')
      }
    }
    // An answer of a question that was open at launch reaches the stage that asked it.
    let answered = null
    if (u.carryAnswer && u.carryAnswer.slice === sliceArg && (!u.carryAnswer.stage || u.carryAnswer.stage === stage)) { answered = u.carryAnswer; u.carryAnswer = null }
    for (;;) {
      let res
      if (stage === 'plan' && u.planStops[sliceArg] && !answered) { res = u.planStops[sliceArg]; delete u.planStops[sliceArg] }
      else res = await runOne(u, stage, sliceArg, answered)
      if (STOP) return { stop: true, ran }
      if (res && res.status === 'stopped') {
        const k = await onStageStop(u, res, stage, sliceArg)
        if (k === 'retry') continue
        return k === 'stop' ? { stop: true, ran } : { ended: true, ran }
      }
      if (stage === 'implement' && res && res.startSha) { u.sliceStart = u.sliceStart || {}; u.sliceStart[sliceArg] = res.startSha }
      if (res && Array.isArray(res.decisions) && res.decisions.length) res = await classifyDecisions(u, res)
      if (res) { ran.push(res); u.results.push(res) }
      const bad = !res || res.status === 'hard-stop' || evaluateGate(stage, res) === 'hard-stop'
      if (!bad) { ranStages.push(stage); break }
      const kind = stage === 'review' ? 'review' : 'stage'
      const reason = (res && res.hardStopReason) || (res ? `${stage} terminal state did not clear the gate: ${JSON.stringify(res.terminal || {})}` : `${stage} did not return`)
      const a = await park(u, kind, reason, { stage, slice: sliceArg, startSha: res && res.startSha, artifact: res && res.artifactPath })
      const h = await onAnswer(u, a)
      if (h !== 'resume') return h === 'stop' ? { stop: true, ran } : { ended: true, ran }
      // A resume orient (same run id), then the stopped stage again with the answer.
      if (kind === 'stage') {
        const o = await orientUnit(u, { resume: true })
        if (o && o.ok) u.idx = o
      }
      answered = a
    }
  }
  // The slice clears: the write-back, then `slice-done` (section 5.6a).
  if (!u.cleared.some(c => c.slice === sliceArg)) {
    const wb = await writeBackSliceStatus(u, sliceArg, ranStages)
    const sd = wb && wb.sliceDone
    if (sd && sd.ok !== false && sd.sha) {
      u.cleared.push({ slice: sliceArg, sha: sd.sha })
      onReady(sd.ready)
      absorb(sd)
    } else log(`${u.slug}: slice '${sliceArg}' cleared, but slice-done did not confirm${(wb && wb.note) || (sd && sd.error) ? `: ${(sd && sd.error) || wb.note}` : ''}`)
  }
  return { slice: sliceArg, ran }
}

// A park whose kind needs its answer read (start parks of the cross-unit reconcile, a
// question that was open at launch). Returns 'go' | 'stop' | 'ended'.
async function parkAndResolve(u, p) {
  const a = await park(u, p.kind, p.reason, p.ctx || {})
  const h = await onAnswer(u, a)
  if (h !== 'resume') return h
  return await afterAnswer(u, a, p.kind, p.ctx || {})
}

async function afterAnswer(u, a, kind, ctx) {
  if (RESOLVE_KINDS.includes(kind)) {
    const r = await resolveAnswer(u, a, kind, ctx)
    const k = await applyResolve(u, r)
    if (k === 'ended') return 'ended'
    if (k === 'replan' && ctx.slice) u.carryAnswer = { ...a, stage: 'plan', slice: ctx.slice, replan: true }
    return 'go'
  }
  if (['stage', 'review', 'slug-stop'].includes(kind) && ctx.slice) u.carryAnswer = { ...a, stage: ctx.stage || null, slice: ctx.slice }
  return 'go'
}

// walkUnit() — yolo's driveRoster (yolo.js:2468) for one unit, with the parks.
async function walkUnitInner(u) {
  if (u.ended) return
  // A question that was open at launch: the unit waits for its answer, with no orient.
  if (u.pending) {
    const e = u.pending
    u.pending = null
    u.parked = { kind: e.kind, id: e.id }
    ensureWaiter()
    const a = await e.promise
    u.parked = null
    e.resumed = true
    if (a && !a.stopped && !a.move && e.kind === 'slug-stop' && !CONTINUE_RE.test(String(a.answer || ''))) { await moveOut(u, a.answer); return }
    const h = await onAnswer(u, a)
    if (h !== 'resume') return
    const k = await afterAnswer(u, a, e.kind, e.ctx || {})
    if (k !== 'go') return
  }
  // An orient of the plan phase that failed parks first; the orient runs again after the answer.
  if (u.idx && u.idx.ok === false) {
    const k = await parkAndResolve(u, { kind: 'orient', reason: u.idx.blockReason || 'the unit is not ready' })
    if (k !== 'go') return
    u.idx = null
  }
  while (!u.idx) {
    if (STOP) return
    const o = await orientUnit(u)
    if (STOP) return
    if (o && o.ok) { u.idx = o; break }
    const k = await parkAndResolve(u, { kind: 'orient', reason: (o && o.blockReason) || 'orient did not return' })
    if (k !== 'go') return
  }
  for (const p of u.startParks.splice(0)) {
    const k = await parkAndResolve(u, p)
    if (k !== 'go') return
  }
  const slices = u.idx.slices || []
  const isSweep = (s) => s && s.reverifyReason === 'deferral-rechallenge'
  const primary = slices.filter(s => !isSweep(s))
  const sweep = slices.filter(isSweep)
  let workSinceCheckpoint = false
  for (let si = 0; si < primary.length; si++) {
    const s = primary[si]
    if (s.status === 'skipped') continue
    const r = await walkSlice(u, s, false)
    if (r.stop || r.ended || u.ended || STOP) return
    // A crossUnit contract found during the walk parks the unit before its next slice.
    for (const p of u.startParks.splice(0)) {
      const k = await parkAndResolve(u, p)
      if (k !== 'go') return
    }
    if (r.ran.length) workSinceCheckpoint = true
    const isLast = si === primary.length - 1
    const due = ((u.idx.charter || []).length || u.contextPath) && !isLast && (si + 1) % CHECKPOINT_EVERY === 0
    if (due && workSinceCheckpoint) {
      workSinceCheckpoint = false
      const cp = await charterCheckpoint(u, s.slice)
      if (cp) {
        u.charterCheckpoints.push({ throughSlice: s.slice, ...cp })
        const broken = (cp.commitments || []).filter(c => c && c.status === 'broken')
        const vetoes = (cp.steeringViolations || []).filter(v => v && v.kind === 'veto')
        if (broken.length || vetoes.length) {
          const reason = broken.length
            ? `charter commitment(s) BROKEN after '${s.slice}': ${broken.map(c => `${c.id} (${c.note || 'no note'})`).join('; ')}`
            : `steering veto(es) CROSSED after '${s.slice}': ${vetoes.map(v => `"${v.entry}"`).join('; ')}`
          const a = await park(u, 'stage', reason, { stage: 'charter-checkpoint', slice: s.slice })
          const h = await onAnswer(u, a)
          if (h !== 'resume') return
        }
      }
    }
  }
  // A slug-wide unit runs one review after its last slice cleared verify.
  if (u.reviewScope === 'slug-wide') {
    let answered = u.carryAnswer && u.carryAnswer.stage === 'review' ? u.carryAnswer : null
    u.carryAnswer = null
    for (;;) {
      let rev = await reviewUnit(u, null, { answered, writerOnly: !!answered && !!u.lastReview })
      if (STOP) return
      if (rev && rev.status === 'stopped') {
        const k = await onStageStop(u, rev, 'review', null)
        if (k === 'retry') continue
        return
      }
      if (rev && Array.isArray(rev.decisions) && rev.decisions.length) rev = await classifyDecisions(u, rev)
      if (rev) u.results.push(rev)
      if (rev && rev.status !== 'hard-stop' && evaluateGate('review', rev) === 'proceed') { u.unitReview = rev; break }
      const a = await park(u, 'review', (rev && rev.hardStopReason) || `the review did not clear: ${JSON.stringify((rev && rev.terminal) || {})}`, { stage: 'review' })
      const h = await onAnswer(u, a)
      if (h !== 'resume') return
      answered = a
    }
  }
  // The bounded re-challenge sweep, after the unit's real work.
  for (const s of sweep) {
    const r = await walkSlice(u, s, true)
    if (r.stop || r.ended || u.ended || STOP) return
  }
  if (STOP) return
  // The slug output, when the setup answer names a recipe ("Slug output" of _boundary.md).
  // A build that fails is a verify failure for the slug: the unit parks, and builds again after the answer.
  if (OPT.output) {
    for (;;) {
      u.output = await heavy(() => slugOutput(u))
      if (STOP || u.output === STOPPED || (u.output && u.output.status === 'stopped')) return
      if (u.output && u.output.built !== false && u.output.status !== 'failed') break
      const why = u.output ? String(u.output.failure || u.output.reason || 'the build command failed').slice(0, 400) : 'the slug output agent returned nothing'
      const a = await park(u, 'stage', `the slug output failed: ${why}`, { stage: 'slug-output' })
      const h = await onAnswer(u, a)
      if (h !== 'resume') return
    }
  }
  await unitEnd(u)
}

async function walkUnit(u) {
  try {
    await walkUnitInner(u)
  } catch (err) {
    if (STOP) return
    u.faults++
    const why = String((err && err.message) || err).slice(0, 300)
    log(`${u.slug}: the walk threw: ${why}`)
    u.blockedOn = null
    if (u.faults > 2) { u.ended = true; u.faulted = true; return }
    const a = await park(u, 'driver-fault', why)
    const h = await onAnswer(u, a)
    if (h === 'resume') {
      const o = await orientUnit(u, { resume: true })
      if (o && o.ok) u.idx = o
      return await walkUnit(u)
    }
  } finally {
    checkDeadlock()
  }
}

// The unit end agent (section 5.2): the run-end line, the commentary note, the watch
// end, `slice-done --final` (it marks the waits with `through: finished` ready), and
// `unit <key> finished --digest`.
const UNIT_END = {
  type: 'object',
  required: ['ok'],
  properties: { ok: { type: 'boolean' }, note: { type: 'string' }, sliceDone: SLICE_DONE.properties.sliceDone },
}

async function unitEnd(u) {
  const d = decisionDigest({ results: [{ ran: u.results }] })
  const digest = d ? { total: d.total, byClass: d.byClass, intentBearing: d.intentBearing.length, unclassified: d.unclassified.length, guarantee: d.intentBearingGuarantee } : null
  u.digest = d
  const r = await call(
    `UNIT END for unit ${u.key} (slug '${u.slug}'), wave ${wave}. Its review is clean. Bookkeeping only (${DRIVE_PROC}, ` +
    `"Unit end"): run these steps in order, and change nothing else.\n` +
    `1. Append one line to ${u.journal}: {"at":"<ISO-8601 UTC now>","run":"${u.runId}","event":"run-end","agent":"${lbl(u, 'unit-end')}",` +
    `"driver":"campaign-wave","campaign":"${brainstorm}","campaignRun":"${RUN}"}\n` +
    `2. Pipe a one-paragraph run-end note (what the unit built, in product language) into ` +
    `\`node "${WATCH}" note "${u.root}" ${u.slug} --event run-end\`.\n` +
    `3. \`node "${WATCH}" end "${u.root}" ${u.slug}\`\n` +
    `4. \`${cmd('slice-done', `${u.key} --final --run ${u.runId}`)}\` — return its JSON object as sliceDone.\n` +
    `5. \`${cmd('unit', `${u.key} finished --digest ${q(JSON.stringify(digest))}`)}\`\n` +
    `Return { ok, note, sliceDone }.` + heartbeat(u, 'unit-end', 'Drive', 'unit-end', null),
    { schema: UNIT_END, label: lbl(u, 'unit-end'), phase: 'Drive', ...SONNET }
  )
  const sd = r && r.sliceDone
  if (sd && sd.sha) {
    u.cleared.push({ slice: 'finished', sha: sd.sha })
    onReady(sd.ready)
    absorb(sd)
  }
  u.readCheck = await readLedgerReport(u, runStartFromId(u.runId))
  u.finished = true
  u.ended = true
  log(`${u.slug} finished in wave ${wave}`)
}

// ---- The plan phase (section 5.3 steps 1-2) -------------------------------
async function planPhase(u) {
  if (u.ended || u.pending || STOP) return
  const o = await orientUnit(u)
  if (!o || !o.ok) { u.idx = o ? { ...o, ok: false } : { ok: false, blockReason: 'orient did not return' }; return }
  u.idx = o
  const unplanned = (o.slices || []).filter(s => (s.stages || {}).plan !== 'done' && s.status !== 'skipped')
  if (unplanned.length) {
    if (!reserve(unplanned.length + 3, `the plan of ${u.slug}`)) return
    const fan = unplanned.map(s => s.slice)
    const planned = await Promise.all(unplanned.map(s => runStage(u, 'plan', s.slice, {
      noIndexWrites: true, stopCheck: true, fanout: { siblings: fan.filter(x => x !== s.slice) },
    }).then(absorb)))
    const doneSlices = []
    for (let i = 0; i < planned.length; i++) {
      let r = planned[i]
      const sl = unplanned[i].slice
      if (r && r.status === 'stopped') {
        if (r.stopKind === 'slug-stop') { u.planStops[sl] = r; continue }
        if (r.stopKind === 'pause') stopRun('usage-pause', r.stopReason || 'pause', (r.budget && r.budget.until) || null)
        else if (r.stopKind !== 'run') stopRun('stop-request', r.stopReason || 'stop request')
        continue
      }
      if (r && Array.isArray(r.decisions) && r.decisions.length) r = await classifyDecisions(u, r)
      if (r) u.results.push(r)
      if (r && r.status === 'complete' && evaluateGate('plan', r) === 'proceed') {
        // The cross-unit reconcile reads every plan after this phase, so a fan-out plan's crossUnit is not used here.
        doneSlices.push(r.slice || sl)
      } else u.planStops[sl] = r || { stage: 'plan', slice: sl, status: 'hard-stop', artifactPath: '', terminal: {}, hardStopReason: 'plan did not return' }
    }
    if (STOP) return
    if (doneSlices.length) {
      await call(
        `PLAN FAN-OUT BOOKKEEPING for slug '${u.slug}'. The driver planned these slices concurrently and each plan ` +
        `agent wrote ONLY its per-slice 04-plan artifact and .yaml. Do the bookkeeping of plan.md Step 7:\n\n${EOB}\n\n` +
        `A. Read ${referenceRoot}/plan.md for the master 04-plan.md contract and its \`## Sibling Plans\` table. In ` +
        `${u.wf}/04-plan.md (create it per that contract, with schema-complete frontmatter, if it is absent), write the ` +
        `\`## Sibling Plans\` table with one row for EVERY 04-plan-<slice>.yaml on disk, built from its \`files\` and ` +
        `\`edges\`. Read each .yaml in full; copy, do not summarize.\n` +
        `B. In ${u.index}: (1) add ${doneSlices.map(s => `04-plan-${s}.md`).join(', ')} and 04-plan.md to ` +
        `\`workflow-files\` (skip any already listed); (2) set \`current-stage\` to plan if it names an earlier stage; ` +
        `(3) set \`reconcile-pending: true\`; (4) refresh \`updated-at\`. Change NOTHING else.` + controlFileRule(u) +
        `\n\nReturn { ok, wrote: [<files changed>], note }.` + heartbeat(u, 'plan-index-writeback', 'Plan', 'plan', null),
        { schema: OK_SCHEMA, label: lbl(u, 'plan-index-writeback'), phase: 'Plan', ...SONNET }
      )
      const o2 = await orientUnit(u, { resume: true })
      if (o2 && o2.ok) u.idx = o2
      u.idx = { ...u.idx, reconcilePending: true }
    }
  }
  if (reconcileDue(u.idx) && !STOP) {
    const rp = await reconcilePlans(u)
    u.planReconcile = { replanned: (rp.overlaps || []).map(t => t.slice), stopped: rp.stopped === true, markerCleared: rp.markerCleared === true }
    if (rp.stopped && rp.stoppedSlice) u.planStops[rp.stoppedSlice] = rp.result || { stage: 'plan', slice: rp.stoppedSlice, status: 'hard-stop', artifactPath: '', terminal: {}, hardStopReason: rp.reason }
    u.idx = { ...u.idx, reconcilePending: false }
  }
}

// unitOutcome() — yolo's hand-back assembly (yolo.js:2548-2648) for one unit.
function unitOutcome(u) {
  const o = { results: [{ ran: u.results }], charterCheckpoints: u.charterCheckpoints }
  const collected = collectDeferrals(o)
  const { deferrals, reconciled } = reconcileDeferrals(o, collected, (u.idx && u.idx.priorDeferrals) || [])
  const lastPark = u.parks[u.parks.length - 1] || null
  const openQ = [...Q.values()].filter(e => e.unit === u.key && e.state === 'open')
  const state = u.finished ? 'finished' : u.moved ? 'stopped' : (u.parked || openQ.length) ? 'stopped' : 'running'
  const out = {
    key: u.key, slug: u.slug, state,
    park: u.parked ? u.parked.kind : null,
    moved: u.moved === true,
    stoppedAt: u.finished ? null : (u.parked ? `park:${u.parked.kind}` : (STOP ? STOP.at : null)),
    reason: u.parked && lastPark ? lastPark.reason : null,
    route: u.moved ? 'moved by the person' : (u.parked && lastPark ? `parked: ${lastPark.kind}: ${lastPark.reason}` : null),
    waitsFor: u.blockedOn ? `${u.blockedOn.from}: ${u.blockedOn.through}` : null,
    cleared: u.cleared,
    questions: [...Q.values()].filter(e => e.unit === u.key).map(e => ({ id: e.id, kind: e.kind, asked: e.question, state: e.state })),
    runId: u.runId || null,
    decisionDigest: u.digest || decisionDigest(o),
    output: u.output || null,
    faulted: u.faulted === true,
  }
  if (deferrals.length) out.runtimeEvidenceDeferrals = deferrals
  if (reconciled.length) out.reconciled = reconciled
  const failures = collectSubstantiveFailures(o)
  if (failures.length) out.substantiveFailures = failures
  const errs = collectSubagentErrors(o)
  if (errs) out.subagentErrors = errs
  const tripwire = clearingTripwire((u.idx && u.idx.priorDeferrals) || [])
  if (tripwire) out.clearingEventsSatisfied = tripwire
  const pressure = deferralPressure((u.idx && u.idx.priorDeferrals) || [], deferrals)
  if (pressure && pressure.open > 0) out.deferralPressure = pressure
  const st = steeringDigest(o)
  if (st) out.steering = st
  if (u.charterCheckpoints.length) out.charterCheckpoints = u.charterCheckpoints
  if (u.readCheck && u.readCheck.present === true) out.readCheck = readCheckRows(u.readCheck.rows, runStartFromId(u.runId))
  if (u.priorDriver) out.priorDriver = u.priorDriver
  if (u.planReconcile) out.planReconcile = u.planReconcile
  if (u.unitReview) out.unitReview = { verdict: (u.unitReview.terminal || {}).verdict || null, path: u.unitReview.artifactPath || null }
  return out
}

// ===========================================================================
// The boundary (section 5.3 steps 6-10). The prompts are those of the boundary
// driver of WF-CAMPAIGN-PLAN, and the agents follow _boundary.md.
// ===========================================================================
const STOP_CHECK =
  `\n\nSTOP-REQUEST CHECK (before any work, after the start heartbeat). Read ${CAMPAIGN_CONTROL} fresh. When it is absent ` +
  `or empty, continue. When "action" is "stop" with "scope" "campaign", or "action" is "pause" with "until" absent ` +
  `or later than now, do no work and return status 'stopped' with stopReason quoting the request. A request with ` +
  `"scope" "wave" or "slug" does not stop a boundary step: the wave finishes its boundary. Never edit the file.`

const STOP_FIELDS = { status: { enum: ['complete', 'stopped', 'failed'] }, stopReason: { type: 'string' }, note: { type: 'string' } }
const obj = (required, properties) => ({ type: 'object', required, properties: { ...STOP_FIELDS, ...properties } })

let WAVE_WT = null   // the wave worktree, from the boundary setup
const common = (step) =>
  `Read ${BOUNDARY_PROC} IN FULL and follow its section "${step}" exactly. Project root ${projectRoot} is ABSOLUTE: ` +
  `resolve every path under it. ${WAVE_WT ? `The wave branch ${WAVE_BRANCH} is checked out in the wave worktree ${WAVE_WT}: run ` +
  `every git and build command of the wave branch there, as \`git -C ${WAVE_WT} …\`, and never check the wave branch out ` +
  `anywhere else.` : `Run git as \`git -C ${projectRoot} …\`.`} The campaign folder is ${CAMP}. The campaign script is ` +
  `\`node "${SCRIPT}" <command> "${projectRoot}" ${brainstorm} …\`.\n\n${EOB}`

// The slug output (14.3), from the unit branch in its worktree.
async function slugOutput(u) {
  return await call(
    `BUILD THE SLUG OUTPUT for slug '${u.slug}' (packet ${u.key}) of campaign '${brainstorm}', wave ${wave}. ` +
    common('Slug output') +
    `\n\nSlug branch: ${u.branch}. The branch is checked out in the worktree ${u.root}: build there, and do not check ` +
    `the branch out anywhere else. Output folder: ${OUT}/slugs/${u.slug}/. The recipe: ${JSON.stringify(OPT.output || null)}.` +
    STOP_CHECK + heartbeat(u, 'slug-output', 'Output', 'slug-output', null, true) +
    `\n\nReturn { status, label, path, built (true when the build command passed), failure (the failing output tail) }.`,
    { schema: obj(['status'], { label: { type: 'string' }, path: { type: 'string' }, built: { type: 'boolean' }, failure: { type: 'string' } }), label: lbl(u, 'slug-output'), phase: 'Output', ...SONNET }
  )
}

const SETUP_RESULT = obj(['status'], {
  worktree: { type: 'string' },
  units: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        key: { type: 'string' }, slug: { type: 'string' }, branch: { type: 'string' }, worktree: { type: 'string' },
        tip: { type: 'string' }, through: { type: 'string' }, quiet: { type: 'array', items: { type: 'object' } },
      },
    },
  },
  error: { type: 'string' },
})

// The boundary setup agent (section 5.2).
async function boundarySetup() {
  return await call(
    `BOUNDARY SETUP of wave ${wave} of campaign '${brainstorm}'. Bookkeeping only (${DRIVE_PROC}, "Boundary setup"): ` +
    `run these commands in order, and change nothing else.\n` +
    `1. \`${cmd('wave', `${wave} set boundary`)}\`\n` +
    `2. \`${cmd('worktree', `wave-${wave} add`)}\` — it prints the wave worktree; return its "path" as worktree.\n` +
    `3. \`${cmd('merge-order', `${wave}`)}\` — return its "units" list as units, verbatim (each with key, slug, branch, ` +
    `worktree, tip, quiet, and through for a carried unit).\n` +
    `When a command fails, return status 'failed' with error quoting it.` +
    STOP_CHECK + waveHeartbeat('boundary-setup', 'boundary') + `\n\nReturn { status, worktree, units, error }.`,
    { schema: SETUP_RESULT, label: 'boundary-setup', phase: 'Merge', ...SONNET }
  )
}

async function mergeUnits(toMerge, carried) {
  return await heavy(() => call(
    `MERGE THE FINISHED SLUGS of wave ${wave} of campaign '${brainstorm}' into the wave branch ${WAVE_BRANCH}. ` +
    common('Merge') +
    `\n\nMerge these slug branches, in this order, each with \`git -C ${WAVE_WT || projectRoot} -c rerere.enabled=true merge --no-ff\`, ` +
    `so that a conflict that a campaign merge-in already resolved is replayed from rerere: ` +
    `${JSON.stringify(toMerge.map(u => ({ key: u.key, slug: u.slug, branch: u.branch })))}.` +
    (carried.length ? ` Do not merge these slugs on their own: each one is inside the branch named by its "through", at its tip: ${JSON.stringify(carried.map(u => ({ key: u.key, slug: u.slug, through: u.through })))}. When "through" merges, report each of them as merged with the same merge commit.` : '') +
    ` After the last merge, regenerate the rows of .ai/workflows/INDEX.md on the wave branch from each slug's 00-index.md, ` +
    `by the rule of the section, and commit it.` +
    STOP_CHECK + waveHeartbeat('merge', 'merge') + campaignEvent('merge', '"key":"<packet key>","slug":"<slug>","sha":"<merge commit>","result":"merged|stopped"') +
    ` Append that event once per slug.` +
    `\n\nReturn { status, merged: [{ key, slug, sha }] in merge order, notMerged: [{ key, slug, reason }] }.`,
    {
      schema: obj(['status', 'merged'], {
        merged: { type: 'array', items: { type: 'object', required: ['key', 'sha'], properties: { key: { type: 'string' }, slug: { type: 'string' }, sha: { type: 'string' } } } },
        notMerged: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, slug: { type: 'string' }, reason: { type: 'string' } } } },
      }),
      label: 'merge', phase: 'Merge', ...OPUS,
    }
  ))
}

async function quietRun(u) {
  return await heavy(() => call(
    `RUN THE QUIET-WINDOW CHECKS of slug '${u.slug}' (packet ${u.key}) of campaign '${brainstorm}', wave ${wave}. ` +
    common('Quiet-window checks') +
    `\n\nThe checks: ${JSON.stringify(u.quiet)}. ${u.worktree ? `Run them in the worktree ${u.worktree}, on branch ${u.branch}.` : `Run them on branch ${u.branch}.`} ` +
    `No drive of this wave runs now, so the machine is idle: confirm it first.` +
    STOP_CHECK + waveHeartbeat(`quiet:${u.slug}`, 'quiet-window') +
    campaignEvent('quiet-window', `"key":"${u.key}","passed":<true|false>`) +
    `\n\nReturn { status, passed (true when every check met its limit), results: [{ slice, command, limit, measured, passed }] }.`,
    { schema: obj(['status', 'passed'], { passed: { type: 'boolean' }, results: { type: 'array', items: { type: 'object', properties: { slice: { type: 'string' }, command: { type: 'string' }, limit: { type: 'string' }, measured: { type: 'string' }, passed: { type: 'boolean' } } } } }), label: `quiet:${u.slug}`, phase: 'Verify', ...OPUS }
  ))
}

const VERIFY_SCHEMA = obj(['status', 'green'], {
  green: { type: 'boolean' }, rounds: { type: 'number' }, commands: { type: 'array', items: { type: 'string' } }, failures: { type: 'string' },
})

async function waveVerify(fixRounds, label) {
  return await heavy(() => call(
    `RUN THE WAVE VERIFY on ${WAVE_BRANCH} for campaign '${brainstorm}', wave ${wave}. ` + common('Wave verify') +
    `\n\n${fixRounds ? `You may run up to ${fixRounds} fix rounds, each committed on the wave branch, then the env-remediation rung.` : 'Run the commands once. Fix nothing: this run judges one revert step.'}` +
    STOP_CHECK + waveHeartbeat(label, 'wave-verify') +
    (fixRounds ? campaignEvent('wave-verify', '"green":<true|false>,"rounds":<n>') : '') +
    `\n\nReturn { status, green, rounds, commands (the commands you ran), failures (the failing output tail, or "") }.`,
    { schema: VERIFY_SCHEMA, label, phase: 'Verify', ...OPUS }
  ))
}

// 12.2 — revert one merge (newest first), or merge a reverted slug again, then judge the verify.
async function revertStep(m, again, fromReview = null) {
  return await heavy(() => call(
    `${again ? 'MERGE AGAIN' : 'REVERT'} slug '${m.slug}' (packet ${m.key}) on ${WAVE_BRANCH}, campaign '${brainstorm}', ` +
    `wave ${wave}. ` + common('Revert search') +
    `\n\n${again ? `Revert the revert of merge ${m.sha} (the slug did not break the verify), then run the wave verify commands once.` : `Run \`git -C ${WAVE_WT || projectRoot} revert -m 1 --no-edit ${m.sha}\`, then run the wave verify commands once.`} ` +
    `Fix nothing.` + STOP_CHECK + waveHeartbeat(`${again ? 'remerge' : 'revert'}:${m.slug}`, 'revert-search') +
    (fromReview ? campaignEvent('wave-revert', `"key":"${m.key}","merge":"${m.sha}","blockers":${JSON.stringify(fromReview)}`) : '') +
    `\n\nReturn { status, green, commands, failures, sha (the new commit) }.`,
    { schema: obj(['status', 'green'], { green: { type: 'boolean' }, commands: { type: 'array', items: { type: 'string' } }, failures: { type: 'string' }, sha: { type: 'string' } }), label: `${again ? 'remerge' : 'revert'}:${m.slug}`, phase: 'Verify', ...OPUS }
  ))
}

async function asBuilt(m, u, findings) {
  return await call(
    `WRITE THE AS-BUILT NOTE for slug '${m.slug}' (packet ${m.key}) of campaign '${brainstorm}', wave ${wave}. ` +
    common('As-built note') +
    `\n\nMerge commit: ${m.sha}. Slug output: ${JSON.stringify((u && u.output) || null)}. Decision digest from the unit's ` +
    `walk: ${JSON.stringify((u && u.digest) || null)}. The wave review findings that name this unit, fixed or open: ` +
    `${JSON.stringify(findings || [])}. Write ${CAMP}/as-built/${m.slug}.md and ${CAMP}/as-built/${m.slug}.json.` +
    STOP_CHECK + waveHeartbeat(`as-built:${m.slug}`, 'as-built') +
    `\n\nReturn { status, path, lines: [{ key, status }] }.`,
    { schema: obj(['status'], { path: { type: 'string' }, lines: { type: 'array', items: { type: 'object' } } }), label: `as-built:${m.slug}`, phase: 'Record', ...OPUS }
  )
}

async function refute(target, label) {
  return await call(
    `REFUTE the claims in ${target} (campaign '${brainstorm}', wave ${wave}). Default to "not shown" when you cannot ` +
    `check a claim. ` + common('Refuter') +
    waveHeartbeat(label, 'refuter') + campaignEvent('refuter', `"target":"${target}","upheld":<n>,"changed":<n>,"unverified":<n>`) +
    `\n\nReturn { status, path (your refute/ file), upheld, changed, unverified }.`,
    { schema: obj(['status'], { path: { type: 'string' }, upheld: { type: 'number' }, changed: { type: 'number' }, unverified: { type: 'number' } }), label, phase: 'Record', ...SONNET }
  )
}

async function fidelity(merged) {
  return await call(
    `WRITE THE FIDELITY CHECKPOINT for wave ${wave} of campaign '${brainstorm}'. ` + common('Fidelity checkpoint') +
    `\n\nMerged slugs: ${JSON.stringify(merged.map(m => ({ key: m.key, slug: m.slug })))}. Write ${CAMP}/fidelity/wave-${wave}.md.` +
    STOP_CHECK + waveHeartbeat('fidelity', 'fidelity') +
    campaignEvent('fidelity', '"honoured":<n>,"narrowed":<n>,"dropped":<n>,"unratified":["<item key>"]') +
    `\n\nReturn { status, path, honoured, narrowed, dropped, unratified: [item keys narrowed or dropped with no quoted answer from the person] }.`,
    { schema: obj(['status'], { path: { type: 'string' }, honoured: { type: 'number' }, narrowed: { type: 'number' }, dropped: { type: 'number' }, unratified: { type: 'array', items: { type: 'string' } } }), label: 'fidelity', phase: 'Record', ...OPUS }
  )
}

async function waveOutput(record) {
  return await heavy(() => call(
    `BUILD THE WAVE OUTPUT and WRITE THE TRY-IT NOTE for wave ${wave} of campaign '${brainstorm}'. ` + common('Wave output') +
    `\n\nWave branch: ${WAVE_BRANCH}. Output folder: ${OUT}/wave-${wave}/. The recipe: ${JSON.stringify(OPT.output || null)}. ` +
    `This wave's record: ${JSON.stringify(record)}. List the open wave review findings under "known limits". Write ` +
    `${CAMP}/waves/wave-${wave}.md for a person.` +
    STOP_CHECK + waveHeartbeat('wave-output', 'wave-output') + campaignEvent('wave-ready', '"label":"<build label>","note":"<try-it note path>"') +
    `\n\nReturn { status, label, path, note, built }.`,
    { schema: obj(['status'], { label: { type: 'string' }, path: { type: 'string' }, note: { type: 'string' }, built: { type: 'boolean' } }), label: 'wave-output', phase: 'Output', ...SONNET }
  ))
}

// mode "drift" — before wave `wave`, classify each changed contract line (11.2).
async function driftRun() {
  return await call(
    `DRIFT CHECK before wave ${wave} of campaign '${brainstorm}'. ` + common('Drift check') +
    STOP_CHECK + waveHeartbeat('drift', 'drift') +
    `\n\nReturn { status, contract: [packet keys with a contract difference], implementation: [packet keys with only implementation-detail differences], path }.`,
    { schema: obj(['status'], { contract: { type: 'array', items: { type: 'string' } }, implementation: { type: 'array', items: { type: 'string' } }, path: { type: 'string' } }), label: 'drift', phase: 'Record', ...OPUS }
  )
}

const stoppedBy = (r) => (r && r.status === 'stopped' ? { stopped: true, stoppedAt: 'stop-request', reason: r.stopReason || 'stop request' } : null)

// ---------------------------------------------------------------------------
// The wave review (section 5.8): the defects where units meet.
// ---------------------------------------------------------------------------
let WAVE_QCOUNT = Array.isArray(OPT.waveQuestions) ? OPT.waveQuestions.length : 0
let WAVE_CARRY = null   // an answered wave question of an earlier run, not consumed

async function waveQuestion(text) {
  if (STOP) return { stopped: true }
  WAVE_QCOUNT++
  const id = `w${wave}-wave-${WAVE_QCOUNT}`
  await call(
    `PARK the wave review of wave ${wave}, campaign '${brainstorm}'. Bookkeeping only: run these commands in order, ` +
    `and change nothing else.\n` +
    `1. \`${cmd('ask', `${id} --wave ${wave} --kind wave-review ${q(text)}`)}\`\n` +
    `2. \`${cmd('journal', `park ${q(JSON.stringify({ run: RUN, wave, key: null, kind: 'wave-review', question: id, reason: text.slice(0, 300) }))}`)}\`\n` +
    `Return { ok, note }.` + waveHeartbeat('park:wave-review', 'wave-review'),
    { schema: PARK_RESULT, label: 'park:wave-review', phase: 'Wave review', ...SONNET }
  )
  events.push({ event: 'park', fields: { key: null, kind: 'wave-review', question: id, reason: text.slice(0, 300) } })
  const e = openQuestion(id, null, 'wave-review', text, {})
  ensureWaiter()
  const a = await e.promise
  e.resumed = true
  return a
}

const ATTRIBUTION = {
  type: 'object',
  required: ['units'],
  properties: { units: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } } } } },
}
const WAVE_WRITER = {
  type: 'object',
  required: ['verdict'],
  properties: {
    status: { type: 'string' },
    verdict: { type: 'string' },
    blockerCount: { type: 'number' },
    open: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string' }, units: { type: 'array', items: { type: 'string' } }, issue: { type: 'string' } } } },
    fixed: { type: 'array', items: { type: 'string' } },
    committed: { type: 'boolean' },
    revert: { type: 'array', items: { type: 'string' } },
    path: { type: 'string' },
    stopReason: { type: 'string' },
  },
}

async function waveReview(merged, carriers = new Set()) {
  phase('Wave review')
  const out = { scope: 'contract-only', rubrics: [], raw: 0, survived: 0, verdict: null, fixed: [], open: [], path: `${CAMP}/review/wave-${wave}.md`, questions: [] }
  const mergedUnits = merged.map(m => ({ ...m, unit: byKey.get(m.key) })).filter(m => m.unit)
  const att = await call(
    `ATTRIBUTE THE WAVE DIFF of wave ${wave}, campaign '${brainstorm}'. READ-ONLY — write nothing (${BOUNDARY_PROC}, ` +
    `"Wave review", step 1). For each unit below, list the files of its own commits: \`git -C ${WAVE_WT || projectRoot} log ` +
    `--no-merges --name-only --format= ${WAVE_BASE || '<wave base>'}..<merge sha>^2 --not <each merged-in sha>\`.\n` +
    mergedUnits.map(m => `- ${m.key} '${m.slug}': merge ${m.sha}; merged-in ${m.unit.mergedIn.length ? m.unit.mergedIn.join(', ') : 'none'}`).join('\n') +
    `\n\nReturn { units: [{ key, files }] }.` + waveHeartbeat('wave-review:attribute', 'wave-review'),
    { schema: ATTRIBUTION, label: 'wave-review:attribute', phase: 'Wave review', ...SONNET }
  )
  const fileUnits = new Map()
  for (const x of (att && att.units) || []) for (const f of x.files || []) {
    if (!fileUnits.has(f)) fileUnits.set(f, new Set())
    fileUnits.get(f).add(x.key)
  }
  const shared = [...fileUnits].filter(([, ks]) => ks.size >= 2).map(([f, ks]) => ({ file: f, units: [...ks] }))
  const full = shared.length > 0 || U.some(u => u.mergedIn.length) || W.length > 0 || focus.length > 0
  out.scope = full ? 'full' : 'contract-only'
  const diff = `git -C ${WAVE_WT || projectRoot} diff ${WAVE_BASE || '<wave base>'}...${WAVE_BRANCH}`
  const crossRule = `Report only a finding that needs two or more units to show: a call across units, a shared file, a ` +
    `duplicated helper, a migration order, or a value that one unit writes and another unit reads. A finding that one ` +
    `unit's own diff shows already passed that unit's review: do not report it. Name the units of each finding in units. ` +
    `The attribution of each file to its units: ${JSON.stringify([...fileUnits].map(([f, ks]) => ({ file: f, units: [...ks] })))}. ` +
    `The focus list (pairs of slices that a late needs entry named): ${JSON.stringify(focus)}.`
  let rubrics = []
  if (full) {
    if (!reserve(1 + 10 + 2 + REFUTER_LIMIT + 1, 'wave review')) return out
    const sel = await call(
      `SELECT REVIEW RUBRICS for the merged diff of wave ${wave}, campaign '${brainstorm}'. READ-ONLY — write nothing.\n\n` +
      `Read ${referenceRoot}/review/_stage.md "# Step 2: Select Review Commands" and ${referenceRoot}/review/_select.md, ` +
      `then apply them to \`${diff}\`. Always include 'correctness' and 'architecture'. Return rubrics: one entry per ` +
      `selected rubric as { rubric, file, focus, reason }.` + waveHeartbeat('wave-review:select', 'wave-review'),
      { schema: RUBRIC_SELECTION, label: 'wave-review:select', phase: 'Wave review', ...SONNET }
    )
    rubrics = (sel && Array.isArray(sel.rubrics) && sel.rubrics.length) ? sel.rubrics.filter(r => r && r.rubric && r.file) : []
    for (const must of ['correctness', 'architecture']) if (!rubrics.some(r => r.rubric === must)) rubrics.push({ rubric: must, file: `review/${must}.md`, focus: '' })
  }
  out.rubrics = rubrics.map(r => r.rubric)
  const scoutCalls = rubrics.map(r => call(
    `READ-ONLY review of the merged diff of wave ${wave} along the '${r.rubric}' rubric ONLY${r.focus ? ` (focus: ${r.focus})` : ''}. ` +
    `Read ${referenceRoot}/${r.file}${r.focus ? ` — the '${r.focus}' section and '# Severity calibration'` : ' in full'}. ` +
    `Inspect \`${diff}\`. ${crossRule} Return each as { id, severity, file, line, issue, confidence, units }. Write ` +
    `nothing.\n\n${EOB}` + steeringClause(CAMPAIGN_STEER, 'context', `${referenceRoot}/_steering.md`),
    { schema: FINDINGS_SCHEMA, label: `wave-scout:${r.rubric}`, phase: 'Wave review', ...SONNET }
  ).then(s => ((s && s.findings) || []).map((f, i) => ({ ...f, id: `${r.rubric}-${f.id || i + 1}`, rubric: r.rubric }))))
  scoutCalls.push(call(
    `READ-ONLY review of the merged diff of wave ${wave} along the campaign-contract rubric ONLY. Read every context ` +
    `file in full, fresh: ${mergedUnits.map(m => m.unit.contextPath).join(', ')}. Inspect \`${diff}\`. A provides line ` +
    `that the wave diff does not meet is HIGH. A broken expects line is HIGH. Quote the line in the issue, and name ` +
    `the units in units. Return findings: [] when every line is met. Write nothing.\n\n${EOB}`,
    { schema: FINDINGS_SCHEMA, label: 'wave-scout:campaign-contract', phase: 'Wave review', ...SONNET }
  ).then(s => ((s && s.findings) || []).map((f, i) => ({ ...f, id: `contract-${f.id || i + 1}`, rubric: 'campaign-contract' }))))
  scoutCalls.push(call(
    `READ-ONLY review of the merged diff of wave ${wave} along the standing-steering rubric ONLY. Inspect \`${diff}\`. ` +
    `Name the units of each finding in units. Return each finding as { id, severity, file, line, issue, confidence, ` +
    `units }. Write nothing.\n\n${EOB}` + steeringClause(CAMPAIGN_STEER, 'scout', `${referenceRoot}/_steering.md`),
    { schema: FINDINGS_SCHEMA, label: 'wave-scout:steering', phase: 'Wave review', ...SONNET }
  ).then(s => ((s && s.findings) || []).map((f, i) => ({ ...f, id: `steering-${f.id || i + 1}`, rubric: 'steering' }))))
  const raw = (await Promise.all(scoutCalls)).flat()
  out.raw = raw.length
  const verified = await refuteAll(
    raw,
    (g, i) => `wave-refute:${g.length === 1 ? g[0].id : `${g[0].rubric}#${i + 1}`}`,
    (g) => `Adversarially REFUTE ${g.length === 1 ? 'this wave review finding' : `each of these ${g.length} wave review findings`}. ` +
      `Default to refuted=true if uncertain or unreproducible. Also refute a finding that one unit's own diff alone ` +
      `shows: that unit's review already judged it. Inspect \`${diff}\` (read-only). Findings: ` +
      `${JSON.stringify(g.map(({ rubric, ...f }) => f))}. Return { verdicts: [{ id, refuted, reason }] }.` +
      steeringClause(CAMPAIGN_STEER, 'refute', `${referenceRoot}/_steering.md`)
  )
  out.survived = verified.length
  let answered = WAVE_CARRY
  WAVE_CARRY = null
  for (let round = 0; round < 4; round++) {
    const w = await heavy(() => call(
      `WRITE THE WAVE REVIEW of wave ${wave}, campaign '${brainstorm}'. Read ${BOUNDARY_PROC}, section "Wave review", and ` +
      `${referenceRoot}/review.md for the triage, the fix loop and the ledger, with the autonomous review policy: ` +
      `${POLICY.review}\n\n${EOB}\n\nThe surviving findings: ${JSON.stringify(verified)}. Fix code on the wave branch ` +
      `only, in ${WAVE_WT || projectRoot}. Write ${out.path} and its sibling ${out.path.replace(/\.md$/, '.yaml')}, with the ` +
      `units of each finding. Never write a unit's review record.` +
      (answered ? `\n\nThe person answered question ${answered.id} (${q(answered.question)}): ${q(answered.answer)}. ` +
        `Apply it. When it names units to revert, return them in revert. When it accepts a finding as it is, record ` +
        `the person's override as a decision. Run \`${cmd('question', `${answered.id} consumed`)}\` last.` : '') +
      STOP_CHECK + waveHeartbeat('wave-review', 'wave-review') +
      `\n\nReturn { status, verdict, blockerCount, open: [{ id, severity, units, issue }], fixed: [ids], committed ` +
      `(true when you committed a fix), revert: [unit keys], path }.`,
      { schema: WAVE_WRITER, label: 'wave-review', phase: 'Wave review', ...OPUS }
    ))
    if (!w || w.status === 'stopped') { out.stopped = true; return out }
    out.verdict = w.verdict || null
    out.fixed = w.fixed || []
    out.open = w.open || []
    if (w.path) out.path = w.path
    if (w.committed) {
      const v = await waveVerify(2, `wave-verify:review-${round + 1}`)
      if (stoppedBy(v)) { out.stopped = true; return out }
      if (!v || !v.green) {
        const a = await waveQuestion(`The wave verify is red after the wave review's fixes: ${(v && v.failures) || 'no detail'}. Which unit should be reverted, or how should the fix change?`)
        if (!a || a.stopped) { out.stopped = true; return out }
        out.questions.push(a.id)
        answered = a
        continue
      }
    }
    const reverts = Array.isArray(w.revert) ? w.revert : []
    if (w.verdict !== 'dont-ship' && !reverts.length) return out
    // A dont-ship verdict: one unit that no other unit merged in is reverted; otherwise ask.
    const owners = new Set(out.open.flatMap(f => (f && f.units) || []))
    const single = reverts.length ? reverts : (owners.size === 1 && out.open.every(f => (f.units || []).length === 1) ? [...owners] : [])
    // A unit that another unit merged in, or that carries or is carried at the boundary, cannot be reverted alone.
    const carriedBy = (k) => W.some(e => e.from === k && e.state === 'met') || carriers.has(k)
    if (single.length && single.every(k => !carriedBy(k))) {
      out.reverted = []
      for (const k of single) {
        const m = merged.find(x => x.key === k)
        if (!m) continue
        const r = await revertStep(m, false, out.open.filter(f => (f.units || []).includes(k)).map(f => f.id))
        if (stoppedBy(r)) { out.stopped = true; return out }
        out.reverted.push({ key: k, green: !!(r && r.green) })
        events.push({ event: 'wave-revert', fields: { key: k, merge: m.sha, blockers: out.open.filter(f => (f.units || []).includes(k)).map(f => f.id) } })
      }
      return out
    }
    const a = await waveQuestion(`The wave review of wave ${wave} says dont-ship: ${out.open.map(f => `${f.id} (${(f.units || []).join('+') || '?'}): ${f.issue || ''}`).join('; ')}. Which units should be reverted, or which findings are accepted as they are?`)
    if (!a || a.stopped) { out.stopped = true; return out }
    out.questions.push(a.id)
    answered = a
  }
  return out
}

// ---------------------------------------------------------------------------
// runBoundary() — the boundary steps of WF-CAMPAIGN-PLAN 9.4 steps 6-10, with the
// wave review after the wave verify (section 5.3 steps 6-10).
// ---------------------------------------------------------------------------
async function runBoundary() {
  phase('Merge')
  const finished = U.filter(u => u.finished)
  const bd = { quiet: [], merged: [], notMerged: [], needsFix: [], verify: null, asBuilt: [], fidelity: null, output: null }
  if (!finished.length) return { ...bd, stopped: true, stoppedAt: 'merge', reason: 'no unit of the wave finished' }
  if (!reserve(1 + finished.length + 1 + 3 + finished.length + 2 * finished.length + 2 + 2, 'boundary')) return { ...bd, stopped: true, stoppedAt: 'agent-ceiling', reason: STOP && STOP.reason }
  const setup = await boundarySetup()
  if (stoppedBy(setup)) return { ...bd, ...stoppedBy(setup) }
  if (!setup || setup.status === 'failed' || !Array.isArray(setup.units)) return { ...bd, stopped: true, stoppedAt: 'boundary-setup', reason: (setup && setup.error) || 'the boundary setup did not return' }
  WAVE_WT = setup.worktree || null
  const units = setup.units.map(x => ({ ...x, quiet: Array.isArray(x.quiet) ? x.quiet : [] }))
  let toMerge = units.filter(x => !x.through)
  let carried = units.filter(x => x.through)
  // C4 — the quiet-window checks, one unit at a time, while no drive runs.
  const quietUnits = units.filter(x => x.quiet.length)
  if (quietUnits.length) {
    phase('Verify')
    for (const x of quietUnits) {
      const r = await quietRun(x)
      if (stoppedBy(r)) return { ...bd, ...stoppedBy(r) }
      bd.quiet.push({ key: x.key, slug: x.slug, passed: !!(r && r.passed), results: (r && r.results) || [] })
    }
    const failed = bd.quiet.filter(x => !x.passed)
    if (failed.length) {
      const outKeys = new Set(failed.map(x => x.key))
      for (const x of failed) bd.needsFix.push({ key: x.key, slug: x.slug, reason: `a quiet-window timed check failed on an idle machine: ${(x.results || []).filter(r => !r.passed).map(r => `${r.slice || '?'} ${r.measured || ''}`.trim()).join('; ') || 'no detail'}` })
      for (const x of units) if (outKeys.has(x.key) && x.through && !outKeys.has(x.through)) {
        outKeys.add(x.through)
        bd.needsFix.push({ key: x.through, slug: (units.find(y => y.key === x.through) || {}).slug, reason: `it carries '${x.slug}', whose quiet-window check failed` })
      }
      for (const x of units) if (x.through && outKeys.has(x.through) && !outKeys.has(x.key)) x.through = null
      const left = units.filter(x => !outKeys.has(x.key))
      toMerge = left.filter(x => !x.through)
      carried = left.filter(x => x.through)
    }
  }
  phase('Merge')
  const m = await mergeUnits(toMerge, carried)
  if (stoppedBy(m)) return { ...bd, ...stoppedBy(m) }
  if (!m || !Array.isArray(m.merged)) return { ...bd, stopped: true, stoppedAt: 'merge', reason: 'the merge agent did not return' }
  bd.notMerged = m.notMerged || []
  let merged = m.merged.map(x => ({ ...x, slug: x.slug || (units.find(y => y.key === x.key) || {}).slug }))
  if (!merged.length) return { ...bd, stopped: true, stoppedAt: 'merge', reason: 'no slug merged into the wave branch' }
  // 7. Wave verify, then the revert search (12.2).
  phase('Verify')
  const v = await waveVerify(2, 'wave-verify')
  if (stoppedBy(v)) return { ...bd, merged, ...stoppedBy(v) }
  bd.verify = { green: !!(v && v.green), rounds: (v && v.rounds) || 0, commands: (v && v.commands) || [] }
  if (!v || !v.green) {
    const order = [...merged].reverse()
    const reverted = []
    let culprit = null
    for (const step of order) {
      const r = await revertStep(step, false)
      if (stoppedBy(r)) return { ...bd, merged, ...stoppedBy(r) }
      reverted.push(step)
      if (r && r.green) { culprit = step; break }
    }
    if (!culprit) {
      bd.verify.revert = { base: true, reverted: reverted.map(x => x.key) }
      return { ...bd, merged: [], stopped: true, stoppedAt: 'wave-verify', reason: 'the wave verify is red with every slug reverted: the fault is in the wave branch base, not in a slug — ask the person', failures: v && v.failures }
    }
    for (const again of reverted.slice(0, -1)) {
      const r = await revertStep(again, true)
      if (stoppedBy(r)) return { ...bd, merged, ...stoppedBy(r) }
      if (!r || !r.green) return { ...bd, stopped: true, stoppedAt: 'wave-verify', reason: `merging '${again.slug}' again after the revert of '${culprit.slug}' turned the verify red — two slugs interact; ask the person`, merged: merged.filter(x => x.key !== culprit.key && x.key !== again.key) }
    }
    merged = merged.filter(x => x.key !== culprit.key)
    bd.verify = { ...bd.verify, green: true, revert: { culprit: culprit.key, reverted: reverted.map(x => x.key), reapplied: reverted.slice(0, -1).map(x => x.key) } }
    bd.needsFix.push({ key: culprit.key, slug: culprit.slug, reason: 'its merge broke the wave verify; reverted (12.2)' })
  }
  bd.merged = merged
  if (!merged.length) return { ...bd, stopped: true, stoppedAt: 'wave-verify', reason: 'no slug is left merged after the revert search' }
  // 8. The wave review (section 5.8).
  const wr = await waveReview(merged, new Set(units.flatMap(x => (x.through ? [x.key, x.through] : []))))
  WAVE_REVIEW = wr
  if (wr.stopped) return { ...bd, stopped: true, stoppedAt: STOP ? STOP.at : 'wave-review', reason: STOP ? STOP.reason : 'the wave review stopped' }
  for (const r of wr.reverted || []) {
    merged = merged.filter(x => x.key !== r.key)
    bd.needsFix.push({ key: r.key, slug: (byKey.get(r.key) || {}).slug, reason: 'the wave review found a dont-ship blocker in this unit alone; its merge is reverted' })
  }
  bd.merged = merged
  if (!merged.length) return { ...bd, stopped: true, stoppedAt: 'wave-review', reason: 'no slug is left merged after the wave review' }
  // 9. As-built notes and the refuter (11.1, 11.3), then the fidelity checkpoint (18, F3).
  phase('Record')
  for (const x of merged) {
    const u = byKey.get(x.key)
    const a = await asBuilt(x, u, (wr.open || []).concat((wr.fixed || []).map(id => ({ id, fixed: true }))).filter(f => !f.units || f.units.includes(x.key)))
    if (stoppedBy(a)) return { ...bd, ...stoppedBy(a) }
    const r = await refute(`${CAMP}/as-built/${x.slug}.md`, `refute:${x.slug}`)
    bd.asBuilt.push({ key: x.key, slug: x.slug, path: a && a.path, refute: r ? { path: r.path, upheld: r.upheld, changed: r.changed, unverified: r.unverified } : null })
  }
  const f = await fidelity(merged)
  if (stoppedBy(f)) return { ...bd, ...stoppedBy(f) }
  const fr = await refute(`${CAMP}/fidelity/wave-${wave}.md`, 'refute:fidelity')
  bd.fidelity = { path: f && f.path, honoured: f && f.honoured, narrowed: f && f.narrowed, dropped: f && f.dropped, unratified: (f && f.unratified) || [], refute: fr ? { path: fr.path, changed: fr.changed, unverified: fr.unverified } : null }
  // 10. The wave output and the try-it note (14.4).
  const o = await waveOutput({ merged: merged.map(x => x.key), notMerged: bd.notMerged, needsFix: bd.needsFix, moved: OPT.moved || [], verify: bd.verify, fidelity: bd.fidelity, waveReview: { verdict: wr.verdict, open: wr.open } })
  if (stoppedBy(o)) return { ...bd, ...stoppedBy(o) }
  bd.output = o
  if (bd.fidelity.unratified.length) {
    bd.stopBeforeNextWave = true
    bd.reason = `fidelity: ${bd.fidelity.unratified.join(', ')} narrowed or dropped with no answer from the person (F3)`
  }
  return bd
}

// ===========================================================================
// Control flow
// ===========================================================================
let WAVE_REVIEW = null

// The questions and waits of the ledger at launch (D22).
for (const u of U) {
  if (u.ledgerState === 'finished') { u.ended = true; u.finished = true; continue }
  for (const qq of u.questions) {
    if (!qq || !qq.id || qq.consumed) continue
    const e = openQuestion(qq.id, u.key, qq.kind || 'stage', qq.text || '', { stage: qq.stage || null, slice: qq.slice || null })
    if (qq.answered) onAnswered([{ id: qq.id, answer: qq.answer, by: qq.by, move: qq.move }])
    if (!u.pending) u.pending = e
  }
}
for (const qq of Array.isArray(OPT.waveQuestions) ? OPT.waveQuestions : []) {
  if (!qq || !qq.id || qq.consumed || !qq.answered) continue
  WAVE_CARRY = { id: qq.id, answer: qq.answer, by: qq.by || 'person', question: qq.text || '' }
}
for (const u of U) for (const w of u.waits) addWait(u.key, w)

if (mode === 'drift') {
  phase('Record')
  const r = await driftRun()
  return stoppedBy(r) ? { ok: false, mode, wave, held: true, ...stoppedBy(r) } : { ok: !!r && r.status === 'complete', mode, wave, contract: (r && r.contract) || [], implementation: (r && r.implementation) || [], path: r && r.path, agentsUsed: AGENTS }
}

log(`wave ${wave} of '${brainstorm}': ${U.length} unit(s), ${slots.size} heavy slot(s) of at most ${WIDTH_MAX}, mode ${mode}`)
if (mode === 'wave') {
  phase('Orient')
  await Promise.all(U.map(u => planPhase(u).catch(err => { log(`${u.slug}: the plan phase threw: ${String((err && err.message) || err)}`); u.idx = null })))
  phase('Plan')
  if (!STOP) await crossUnitReconcile()
  await flushEvents()
  phase('Drive')
  if (!STOP) {
    ensureWaiter()
    await Promise.allSettled(U.map(u => walkUnit(u)))
  }
  await flushEvents()
}

const settledWave = U.every(u => u.finished || u.moved)
let held = !!STOP || !settledWave
let stoppedAt = STOP ? STOP.at : (!settledWave ? 'unit-fault' : null)
let reason = STOP ? STOP.reason : (!settledWave ? `the walk of ${U.filter(u => !u.finished && !u.moved).map(u => u.slug).join(', ')} ended without a finish or a move: launch the wave again` : null)
if (!held && OPT.stopBefore === 'boundary') { held = true; stoppedAt = 'stop-before-boundary'; reason = 'the args asked to stop before the boundary' }
let boundary = null
if (!held) {
  boundary = await runBoundary()
  if (boundary.stopped) { stoppedAt = boundary.stoppedAt; reason = boundary.reason; if (STOP) held = true }
}
// The waiter may block in an `await` call: the cancel marker ends it within 10 seconds.
if (WAITER) {
  await call(
    `CANCEL THE WAITER of wave ${wave}, campaign '${brainstorm}'. Run \`${cmd('await', `--wave ${wave} --cancel`)}\` and ` +
    `change nothing else. Return { ok, note }.` + waveHeartbeat('cancel', 'cancel'),
    { schema: OK_SCHEMA, label: 'cancel', phase: 'Drive', ...SONNET }
  )
  await WAITER
}
await flushEvents()

const outcome = {
  ok: !held && !!boundary && !boundary.stopped,
  mode, wave, campaignRunId: RUN,
  held,
  stoppedAt,
  reason,
  until: STOP ? STOP.until : null,
  agentsUsed: AGENTS,
  heavyPeak: slots.peak,
  widthChanges,
  units: U.map(unitOutcome),
  derivedNeeds,
  focus,
  driverEvents: events,
  waveReview: WAVE_REVIEW,
  boundary,
  stopBeforeNextWave: !!(boundary && boundary.stopBeforeNextWave),
}
log(held
  ? `wave ${wave} held at ${stoppedAt}: ${reason} — record the outcome, then launch the wave again`
  : outcome.ok ? `wave ${wave} reached its boundary: merged ${(boundary.merged || []).map(x => x.key).join(', ')} — record the outcome, then handoff`
  : `wave ${wave} stopped at ${stoppedAt}: ${reason}`)
return outcome
