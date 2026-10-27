export const meta = {
  name: 'wf-optimize',
  description: 'The driver of /wf loop optimize. It runs the metric loop of one optimize slug: each trial is a fresh proposer that reads only the digest of its trunk or branch, a fresh editor, and a bookkeeping agent that runs optimize.mjs trial. optimize.mjs owns every git write, measurement and keep or revert; this script only sequences agents. Branch rounds open on the fixed schedule and on a plateau; in a round, every branch proposes and edits in its own worktree at the same time, and the trials measure one at a time. Never pushes, never opens a PR.',
  phases: [
    { title: 'Orient', detail: 'the status of the loop and the agent ceiling' },
    { title: 'Loop', detail: 'trials on the trunk and on the branches of each round; round-open, round-close and checkpoints when optimize.mjs names them' },
    { title: 'Finish', detail: 'the squash, when the kept value reached the target' },
  ],
}

// ===========================================================================
// /wf loop optimize — the Workflow driver (docs/internal/WF-OPTIMIZE-PLAN.md section 5).
//
// The script has no file access, no clock and no Node API. Every command is an agent.
// `optimize.mjs status` decides the next action (4.6): a trial on the trunk or on the
// branch whose turn it is, round-open, round-close, checkpoint, or a stop. The control
// file (.control.json) is read by `status`, so a stop request or a usage pause ends the
// loop at the next boundary. The branch rounds follow arXiv 2610.07447 (fork-and-flush):
// a branch proposer is a fresh agent that reads the flushed digest of its own branch.
// ===========================================================================

let OPT = args
if (typeof OPT === 'string') { try { OPT = JSON.parse(OPT) } catch { OPT = null } }
if (!OPT || typeof OPT !== 'object') {
  return { ok: false, stopped: true, reason: 'optimize requires { projectRoot, referenceRoot, slug } as a JSON object.' }
}
const { projectRoot, referenceRoot, slug } = OPT
for (const [k, v] of Object.entries({ projectRoot, referenceRoot, slug })) {
  if (!v || typeof v !== 'string' || !v.trim()) return { ok: false, stopped: true, reason: `optimize: required arg '${k}' is missing.` }
}

// The proposer runs on Opus; the editor and the bookkeeping on Sonnet (the A/B result of 2026-10-16). No haiku.
const SONNET = { model: 'claude-sonnet-5-5', effort: 'high' }
const OPUS = { model: 'claude-opus-5-5', effort: 'medium' }

const SCRIPT = `${referenceRoot}/../scripts/optimize.mjs`
const DECIDE = `node "${referenceRoot}/../scripts/wf.mjs" decide`
const HYP_DIR = `${projectRoot}/.scratch/optimize/${slug}`
const RUN = OPT.runId || `${slug}-optimize`
const cmd = (sub, rest = '') => `node "${SCRIPT}" ${sub} "${projectRoot}" ${slug}${rest ? ` ${rest}` : ''}`

const EOB =
  `EXTERNAL OUTPUT BOUNDARY (MANDATORY): workflow artifact paths (.ai/workflows/…), stage names, slash-command ` +
  `names, sub-agent names, and the optimize bookkeeping are PRIVATE implementation context. They must NEVER appear ` +
  `in code, code comments, commit messages, or docs. Write product language only.`

let SEQ = 0
// WF-SYSTEM-REVIEW A4: every journal line goes out through the `line` command of
// yolo-watch, which writes it with JSON.stringify and stamps `at`.
const WATCH = `${referenceRoot}/../../../scripts/yolo-watch.mjs`
const jsonArg = (o) => `'${JSON.stringify(o).replace(/'/g, '\\u0027')}'`
// The command names the workflow, not a file, so the line reaches the journal wherever the records live.
const lineCmd = (o) => `node "${WATCH}" line "${projectRoot}" ${slug} ${jsonArg(o)}`
function heartbeat(label, phaseName) {
  const seq = ++SEQ
  const start = { run: RUN, seq, event: 'agent-start', agent: label, phase: phaseName, stage: 'optimize', driver: 'optimize' }
  return `\n\nDRIVER HEARTBEAT (do this FIRST and LAST). Append each line to the journal of the workflow with the command below, never ` +
    `by hand: before any other work, run \`${lineCmd(start)}\`; immediately before you return, run ` +
    `\`${lineCmd({ ...start, event: 'agent-end' })} --status <your status> --errors <the errors you ` +
    `recovered from>\`, adding --reason "<one line: why you stopped>" when your status is not complete. A failed ` +
    `append never changes what you do.`
}

const steering = `\n\nSTANDING STEERING. The person keeps standing instructions for this workflow in its decision store. Run ` +
  `\`${DECIDE} list "${projectRoot}" ${slug} --kind steer\` NOW, and keep your work inside the entries it prints. An entry never widens ` +
  `allowed-paths and never permits an edit of an off-limits path.`

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const BOOK_SCHEMA = {
  type: 'object', required: ['ok', 'result'],
  properties: { ok: { type: 'boolean' }, result: { type: 'object' }, error: { type: 'string' } },
}
const PROPOSE_SCHEMA = {
  type: 'object', required: ['hypotheses'],
  properties: {
    hypotheses: {
      type: 'array',
      items: { type: 'object', required: ['text', 'expected', 'plan'], properties: { text: { type: 'string' }, expected: { type: 'string' }, plan: { type: 'string' } } },
    },
    prepared: { type: 'boolean' },
    lane: { type: 'string' },
    worktree: { type: 'string' },
  },
}
const EDIT_SCHEMA = {
  type: 'object', required: ['ok', 'changed'],
  properties: { ok: { type: 'boolean' }, changed: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } },
}

// ---------------------------------------------------------------------------
// The agent count and the ceiling (section 5): 3 agents per trial × budget.trials,
// plus 2 per branch round, plus 10.
// ---------------------------------------------------------------------------
let AGENTS = 0
const CEILING_ARG = Number(OPT.agentCeiling) || 0
let CEILING = CEILING_ARG
const events = []
async function call(prompt, opts) {
  AGENTS++
  return await agent(prompt, opts)
}

/** A bookkeeping agent: runs one optimize.mjs command and changes nothing else. */
async function book(sub, rest, label, phaseName, pre = '') {
  const res = await call(
    `BOOKKEEPING for the optimize loop of '${slug}'. ${pre}Run exactly this command and nothing else:\n` +
    `  ${cmd(sub, rest)}\n` +
    `Return { ok, result } where result is the JSON object that the command printed on stdout, parsed, every field ` +
    `as printed. When the command exits non-zero it still prints JSON: return it as result with ok false. Do not ` +
    `edit any other file, do not run git, and do not try to repair a failure.` + heartbeat(label, phaseName),
    { schema: BOOK_SCHEMA, label, phase: phaseName, ...SONNET, effort: 'low' }
  )
  return res && res.result ? res.result : { ok: false, error: (res && res.error) || `${label}: no result` }
}

// The hypothesis of the trial in flight on each lane: the editor writes it before its edit, so a
// resume can measure an edit that waited through a stop; the bookkeeping writes it again.
const laneTag = (lane) => { const m = /--(r\d+b\d+)$/.exec(String(lane || '')); return m ? m[1] : 'trunk' }
const laneFile = (lane) => `${HYP_DIR}/${laneTag(lane)}.txt`
const isBranchLane = (lane) => /--r\d+b\d+$/.test(String(lane || ''))

function proposePrompt(n, width, on = null) {
  return `PROPOSER for trial ${n} of the optimize loop of '${slug}'. You write ${width === 1 ? 'one hypothesis' : `${width} different hypotheses`}; ` +
    `you edit nothing.\n` +
    `1. Run \`${cmd('propose-context', on ? `--on ${on}` : '')}\`. Its "digest" is everything you may know about the run: the objective, the ` +
    `spec prose, the metric and its direction, the best value and the number to beat (threshold), allowed-paths, ` +
    `off-limits, the trials of your own trunk or branch, and the hypotheses that failed there. It also names ` +
    `the worktree of your lane and its branch ("worktree" and "branch"). When "prepared" is not null, the worktree ` +
    `already holds an edit from before a stop: read nothing more and return { hypotheses: [], prepared: true, lane, worktree }.\n` +
    `2. Read the code in the worktree that the metric exercises. Read only inside the worktree.\n` +
    `3. Do NOT read the optimize folder of the workflow, the results ledger, or the git history of other branches. ` +
    `When digest.flushed is true, you are a branch of a branch round: work out the intent of the code from the ` +
    `code itself. That fresh start is the purpose of the round.\n` +
    `4. Write each hypothesis: text (what to change and why, in one or two sentences), expected (the expected gain, ` +
    `in the metric's unit), and plan (the exact files and the change, for the editor). Every file must be inside ` +
    `allowed-paths and outside off-limits. Never propose a change to the metric command, the guard, the holdout, ` +
    `or their fixtures, and never special-case the inputs that the metric measures: a gain that only the metric ` +
    `sees is worthless. Prefer a simpler change at equal gain.\n` +
    `Return { hypotheses, lane, worktree } with lane and worktree copied from the digest.` + steering + heartbeat(`propose:${n}`, 'Loop')
}

function editPrompt(n, h, lane) {
  return `EDITOR for trial ${n} of the optimize loop of '${slug}', on ${lane}. The optimize worktree is ` +
    `${h.worktree || 'the "worktree" that propose-context prints'}; it has ${lane} checked out. Make this change ` +
    `there, and only this change:\n  hypothesis: ${JSON.stringify(h.text)}\n  plan: ${JSON.stringify(h.plan)}\n` +
    `First write the hypothesis text above to the file ${laneFile(lane)} with the file-write tool (create the folder ` +
    `when absent). That file is the one file outside the worktree that you write.\n` +
    `Rules: edit files only inside the worktree; never edit an off-limits path or the metric, guard or holdout ` +
    `files; do not commit, do not reset. Do not build, compile, test, format, or run the metric or any other command ` +
    `of the project: another trial can be measuring on this machine, and a build corrupts its numbers. optimize.mjs ` +
    `formats, commits, checks, measures, and keeps or reverts the change. When the plan cannot be done inside ` +
    `allowed-paths, change nothing and return ok false with the reason in note.\n` + EOB +
    `\nReturn { ok, changed, note } with changed listing the paths you edited, relative to the worktree.` + steering + heartbeat(`edit:${n}`, 'Loop')
}

const trialPre = (lane, h) => `First write the text ${JSON.stringify(h.text)} to the file ${laneFile(lane)} with the file-write tool (create the folder when absent). Then `

/** One trial: the bookkeeping agent writes the hypothesis file and runs `trial`. `on` names the lane in a round with branch worktrees. */
async function runTrial(n, h, lane, on) {
  const rest = `h${n}${on ? ` --on ${on}` : ''} --hypothesis-file "${laneFile(lane)}"${h.expected ? ` --expected ${JSON.stringify(h.expected)}` : ''}`
  return await book('trial', rest, `trial:${n}`, 'Loop', h.prepared ? '' : trialPre(lane, h))
}

/** The proposer and the editor of one branch trial. They change no file that a measurement reads. */
async function prepare(lane, n) {
  const p = await call(proposePrompt(n, 1, lane), { schema: PROPOSE_SCHEMA, label: `propose:${n}`, phase: 'Loop', ...OPUS })
  if (p && p.prepared) return { lane, n, h: { text: '', prepared: true } }
  const hs = (p && Array.isArray(p.hypotheses) ? p.hypotheses : []).filter(x => x && x.text)
  if (!hs.length) return { lane, n, error: `the proposer of trial ${n} returned no hypothesis` }
  const h = { ...hs[0], worktree: (p && p.worktree) || '' }
  const e = await call(editPrompt(n, h, lane), { schema: EDIT_SCHEMA, label: `edit:${n}`, phase: 'Loop', ...SONNET })
  if (!e || e.ok !== true) log(`edit:${n} changed nothing (${(e && e.note) || 'no answer'}); the trial records it as rejected`)
  return { lane, n, h }
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------
phase('Orient')
let st = await book('status', '', 'status', 'Orient')
if (!st || st.ok === false) return { ok: false, stopped: true, slug, reason: `status failed: ${(st && st.error) || 'no result'}`, agentsUsed: AGENTS }
if (!CEILING_ARG) {
  const trials = Number(st.budget && st.budget.trials) || 60
  const rounds = Number(st.budget && st.budget.roundsMax) || 5
  CEILING = 3 * trials + 2 * rounds + 10
}
const width = Math.max(1, Number(st.budget && st.budget.width) || 1)
log(`optimize '${slug}': ${st.state}, next ${(st.next && st.next.action) || 'none'}; agent ceiling ${CEILING}`)

phase('Loop')
let stoppedAt = null
let reason = null
const queue = []
// The trial ids continue from the ledger, so a resumed run does not reuse them.
let SEQ_T = Number(st.counters && st.counters.trials) || 0
// A round whose branches have their own worktrees overlaps the work that is not a measurement:
// every ready branch proposes and edits at the same time, and the trials measure one at a time.
const inflight = new Map()
const prepared = []
const drain = async () => { if (inflight.size) await Promise.all([...inflight.values()]) }
while (st && st.state === 'running') {
  const next = st.next || {}
  if (AGENTS + 3 > CEILING) { stoppedAt = 'agent-ceiling'; reason = `${AGENTS} of the ceiling of ${CEILING} agents are used: start the driver again, and the loop continues from state.json`; break }
  const overlap = next.action === 'trial' && Array.isArray(next.ready) && next.ready.length > 0 && isBranchLane(next.on)
  if (!overlap) {
    // A boundary waits for the editors in flight. round-close discards an edit that was not measured.
    await drain()
    prepared.length = 0
  }
  if (next.action === 'round-open' || next.action === 'round-close' || next.action === 'checkpoint') {
    queue.length = 0
    const r = await book(next.action, '', next.action, 'Loop')
    events.push({ event: next.action, ok: r.ok !== false, why: next.why || '', winner: r.winner || null })
    if (r.ok === false) { stoppedAt = 'bookkeeping'; reason = `${next.action}: ${r.error || 'failed'}`; break }
    log(`${next.action}: ${next.why || ''}${r.winner ? ` → winner ${typeof r.winner === 'string' ? r.winner : r.winner.name}` : ''}`)
    st = r.state ? r : await book('status', '', 'status', 'Loop')
    continue
  }
  if (next.action !== 'trial') { stoppedAt = 'unknown-action'; reason = `status names the action '${next.action}'`; break }
  let n, h, lane, on = null
  if (overlap) {
    for (const l of next.ready) {
      if (inflight.has(l) || prepared.some(x => x.lane === l)) continue
      const k = ++SEQ_T
      inflight.set(l, prepare(l, k).then(r => {
        inflight.delete(l)
        prepared.push(r || { lane: l, n: k, error: `the agents of trial ${k} returned nothing` })
      }))
    }
    if (!prepared.length) {
      if (!inflight.size) { stoppedAt = 'proposer'; reason = 'no branch of the round can take a trial'; break }
      await Promise.race([...inflight.values()])
      continue
    }
    const item = prepared.shift()
    if (item.error) { stoppedAt = 'proposer'; reason = item.error; break }
    n = item.n; h = item.h; lane = item.lane; on = item.lane
  } else {
    n = ++SEQ_T
    lane = next.on
    const onTrunk = !isBranchLane(lane)
    // A queued trunk hypothesis is used only while the next trial stays on the trunk.
    h = onTrunk && queue.length ? queue.shift() : null
    if (!h) {
      queue.length = 0
      const p = await call(proposePrompt(n, onTrunk ? width : 1), { schema: PROPOSE_SCHEMA, label: `propose:${n}`, phase: 'Loop', ...OPUS })
      if (p && p.prepared) h = { text: '', prepared: true }
      else {
        const hs = (p && Array.isArray(p.hypotheses) ? p.hypotheses : []).filter(x => x && x.text)
        if (!hs.length) { stoppedAt = 'proposer'; reason = `the proposer of trial ${n} returned no hypothesis`; break }
        for (const x of hs) x.worktree = (p && p.worktree) || ''
        h = hs.shift()
        if (onTrunk) queue.push(...hs)
      }
    }
    if (!h.prepared) {
      const e = await call(editPrompt(n, h, lane), { schema: EDIT_SCHEMA, label: `edit:${n}`, phase: 'Loop', ...SONNET })
      if (!e || e.ok !== true) log(`edit:${n} changed nothing (${(e && e.note) || 'no answer'}); the trial records it as rejected`)
    }
  }
  const t = await runTrial(n, h, lane, on)
  if (t.ok === false) { stoppedAt = 'bookkeeping'; reason = `trial ${n}: ${t.error || 'failed'}`; break }
  events.push({ event: 'trial', trial: t.trial ?? n, lane: t.lane, verdict: t.verdict, median: t.median ?? null })
  log(`trial ${t.trial ?? n} on ${t.lane}: ${t.verdict}${t.median !== null && t.median !== undefined ? ` (${t.median})` : ''}${t.reason ? ` — ${t.reason}` : ''}`)
  const done = Number(t.trial) || ((Number(st.counters && st.counters.trials) || 0) + 1)
  st = t.next && t.next.action ? { ...st, state: 'running', next: t.next, counters: { ...(st.counters || {}), trials: done } } : await book('status', '', 'status', 'Loop')
  // The next action of a trial is computed without a stop; read the full status at a round boundary or a stop.
  if (st.next && st.next.action !== 'trial') st = await book('status', '', 'status', 'Loop')
}
// An editor in flight finishes its edit; a stop leaves that edit in its worktree for the resume to measure.
await drain()
if (!stoppedAt && st && st.state !== 'running') { stoppedAt = st.state === 'complete' ? null : st.reason; reason = st.detail || st.reason }

let finish = null
if (st && st.state === 'complete') {
  phase('Finish')
  finish = await book('finish', '', 'finish', 'Finish')
  log(finish.ok === false ? `finish failed: ${finish.error}` : `finished: ${finish.commit || 'no commit'}; next /wf verify ${slug} optimize`)
}
const last = finish && finish.ok !== false ? null : await book('status', '', 'status', 'Finish')
return {
  ok: !!finish && finish.ok !== false,
  slug,
  state: finish && finish.ok !== false ? 'finished' : (last && last.state) || (st && st.state) || 'unknown',
  stoppedAt,
  reason,
  next: finish && finish.ok !== false ? `/wf verify ${slug} optimize` : ((last && last.next) || null),
  best: (last && last.best) || (st && st.best) || null,
  baseline: (last && last.baseline) || (st && st.baseline) || null,
  finish,
  events,
  agentsUsed: AGENTS,
}
