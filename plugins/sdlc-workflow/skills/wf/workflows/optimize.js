export const meta = {
  name: 'wf-optimize',
  description: 'The driver of /wf loop optimize. It runs the metric loop of one optimize slug: each trial is a fresh proposer that reads only the digest of its trunk or branch, a fresh editor, and a bookkeeping agent that runs optimize.mjs trial. optimize.mjs owns every git write, measurement and keep or revert; this script only sequences agents. Branch rounds open on the fixed schedule and on a plateau; in a round, every branch proposes and edits in its own worktree at the same time, and the trials measure one at a time. Never pushes, never opens a PR.',
  phases: [
    { title: 'Orient', detail: 'the status of the loop and the agent ceiling' },
    { title: 'Loop', detail: 'trials on the trunk and on the branches of each round; round-open, round-close, the merge step and checkpoints when optimize.mjs names them' },
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
      items: { type: 'object', required: ['text', 'expected', 'plan'], properties: { text: { type: 'string' }, expected: { type: 'string' }, plan: { type: 'string' }, idea: { type: 'string' } } },
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
    `   TIME: you have digest.proposeMinutes minutes. Run \`date\` when you start. When the time is up, stop the research ` +
    `and return your best hypothesis.\n` +
    `   MEASURE ONLY WITH A PROBE. Another trial can be measuring on this machine, and a build, a test or a benchmark ` +
    `corrupts its numbers. So never build, test, format or run the project in the lane worktree, and never copy the ` +
    `worktree to another folder. To build, profile or time something:\n` +
    `   a. Run \`${cmd('probe-open', `--on ${on || 'trunk'}`)}\`. It prints the path of a probe worktree at the best ` +
    `code of your lane. You may edit that worktree freely, for example to add timer counters.\n` +
    `   b. Run each build or benchmark as \`${cmd('probe', `--on ${on || 'trunk'} --label "<what>" --cmd "<command>"`)}\`. The ` +
    `probe waits for the measure lock, runs the command in the probe worktree, and prints its output.\n` +
    `3. Do NOT read the optimize folder of the workflow, the results ledger, or the git history of other branches. ` +
    `When digest.flushed is true, you are a branch of a branch round: work out the intent of the code from the ` +
    `code itself. That fresh start is the purpose of the round.\n` +
    `   SEED: when digest.seed is not null, it names the part of the profile where your branch starts. Start there.\n` +
    `   PROFILE: when digest.profile is not null, start from it. Each entry gives the share of the work, and maxGain, ` +
    `the gain if that cost went to zero. An entry with alone: false cannot pass the threshold by itself: do not ` +
    `propose a change to it alone.\n` +
    `   IDEAS: digest.ideas lists the idea of every trial of every lane: its target, status and pooled gain. Do not ` +
    `repeat a target that failed, or that another lane claims now.\n` +
    `4. Write each hypothesis: text (what to change and why, in one or two sentences), expected (the expected gain, ` +
    `in the metric's unit), and plan (the exact files and the change, for the editor). Every file must be inside ` +
    `allowed-paths and outside off-limits. Never propose a change to the metric command, the guard, the holdout, ` +
    `or their fixtures, and never special-case the inputs that the metric measures: a gain that only the metric ` +
    `sees is worthless. Prefer a simpler change at equal gain.\n` +
    `5. CLAIM each hypothesis before you return it: run \`${cmd('idea-claim', `--on ${on || 'trunk'} --target "<the function or profile entry that the change targets>" --family "<a few words, for example memoize>"`)}\`. ` +
    `When it refuses, choose another target; or, when you have a new reason to try that target again, add ` +
    `--again "<the reason>". Put the id that it prints (idea.id) in the hypothesis as idea.\n` +
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
  const rest = `h${n}${on ? ` --on ${on}` : ''} --hypothesis-file "${laneFile(lane)}"${h.expected ? ` --expected ${JSON.stringify(h.expected)}` : ''}${h.idea ? ` --idea ${h.idea}` : ''}`
  return await book('trial', rest, `trial:${n}`, 'Loop', h.prepared ? '' : trialPre(lane, h))
}

/** The consider step after a round: one agent decides which other kept branches to merge into the trunk. */
function considerPrompt(mg) {
  const open = (mg.candidates || []).filter(c => !c.conflict)
  const shown = open.filter(c => c.kind !== 'port').map(c => ({ name: c.name, short: `b${c.k}`, commit: c.commit, gain: c.gain, hypotheses: c.hypotheses, paths: c.paths, sharedWithWinner: c.shared }))
  const ports = open.filter(c => c.kind === 'port').map(c => ({ name: c.name, branch: c.branch, gain: c.gain, hypothesis: c.hypothesis, paths: c.paths, diff: c.patchFile }))
  return `MERGE CONSIDER for round ${mg.round} of the optimize loop of '${slug}'. The round chose its winner, and the trunk ` +
    `now holds the winner's code. These other branches kept a gain over the round base, and each one merges cleanly onto the trunk:\n` +
    `${JSON.stringify(shown, null, 2)}\n` +
    (ports.length ? `These kept trials of the other branches are ports: the editor makes the same change again on the trunk code. ` +
      `Use a port when its branch as a whole is not worth a merge, but this one change is:\n${JSON.stringify(ports, null, 2)}\n` : '') +
    `For each candidate, decide try or skip:\n` +
    `1. Read its diff against the round base: \`git -C "${mg.worktree || '<the trunk worktree>'}" diff ${mg.from || '<round base>'} <commit>\`. Read the winner's ` +
    `change in the trunk worktree too. For a port, read the file that its diff names. Read nothing else: not the rest of the optimize folder, not the ledger.\n` +
    `2. Skip a candidate whose change removes the same cost as the winner's change: the gains do not add, and the ` +
    `measurement only confirms that. Try a candidate whose change is independent of the winner's. Do not try a branch and a port of the same branch.\n` +
    `3. Put the tries in order, the largest expected added gain first. Each try is measured as one trial against the budget.\n` +
    `Then run exactly one command, with every candidate in --try or in one --skip:\n` +
    `  ${cmd('merge-consider', '--try <b2,t7> --skip "<b3>:<one-line reason>"')}\n` +
    `(leave out --try when you skip all; repeat --skip for each skipped branch). Return { ok, result } where result is the ` +
    `JSON object that the command printed, parsed. When the command exits non-zero it still prints JSON: return it as ` +
    `result with ok false. Do not edit any file and do not run any other git command than the diffs.` + heartbeat(`merge-consider:${mg.round}`, 'Loop')
}

/** The hypothesis of a port or a bundle: the kept diffs, made again on the current trunk code. */
function reuseHypothesis(next, worktree) {
  const items = next.port
    ? [{ text: (next.portOf && next.portOf.hypothesis) || `trial ${next.port}`, patches: next.portOf ? [next.portOf.patch] : [] }]
    : (next.bundleOf || []).map(b => ({ text: (b.hypotheses || []).filter(Boolean).slice(-1)[0] || `${b.target}: ${b.family}`, patches: (b.patches || []).slice(-1) }))
  const text = next.port
    ? `Port of trial ${next.portOf ? next.portOf.trial : next.port} of ${next.portOf ? next.portOf.branch : 'a branch'}: ${items[0].text}`
    : `Bundle of ${(next.bundle || []).join(', ')}: ${items.map(i => i.text).join(' | ')}`
  const plan = `Make the change of each diff below again in the current code. The code may have moved since the diff was made: ` +
    `where a diff does not apply as it is, make the same change by hand. Read each diff file; do not edit it.\n` +
    items.map((i, k) => `${k + 1}. ${i.text}\n   diff: ${i.patches.join(', ') || 'none'}`).join('\n')
  return { text, expected: String(next.port ? (next.portOf && next.portOf.gain) || '' : ''), plan, worktree: worktree || '' }
}

/** The profiler: it measures where the work of the metric goes on the trunk best, with probes only. */
function profilerPrompt(st) {
  const metric = (st.metric && st.metric.command) || 'the metric command of the spec'
  const patch = st.profile && st.profile.patch
  return `PROFILER for the optimize loop of '${slug}'. You measure where the work of the metric goes, on the best code ` +
    `of the trunk. Every proposer reads your profile, so it must be measured, not guessed. You change no file of a lane.\n` +
    `1. Run \`${cmd('probe-open', '--on trunk')}\`. It prints the path of the probe worktree of the trunk. Work only there.\n` +
    (patch ? `2. Apply the counters of the last profile: \`git -C "<the probe worktree>" apply "${patch}"\`. When the patch does not ` +
      `apply, add the counters again by hand.\n` : `2. Read the code that the metric command runs: ${metric}\n`) +
    `3. Add timer counters, and call counters where they help, around the main parts of that code: the top-level ` +
    `steps and the largest functions under them. Print, at the end of the run, one JSON line for each part: ` +
    `{"name": "<function or part>", "share": <its part of the total time, 0 to 1>, "calls": <calls for each unit of the metric>, "where": "<file:first-last line>"}.\n` +
    `4. Build and run only with probes: \`${cmd('probe', '--on trunk --label "profile" --cmd "<command>"')}\`. Never build or ` +
    `run anything outside a probe: another command can be measuring on this machine.\n` +
    `5. Write the entries, at least the 10 largest, as one JSON array to ${HYP_DIR}/profile.json with the file-write tool. ` +
    `The shares need not add up to 1.\n` +
    `6. Run \`${cmd('profile-record', `--file "${HYP_DIR}/profile.json"`)}\`. When you cannot make a profile in 30 minutes, run ` +
    `\`${cmd('profile-record', '--skip "<the reason>"')}\` instead.\n` +
    `Return { ok, result } where result is the JSON object that profile-record printed, parsed. When it exits non-zero it ` +
    `still prints JSON: return it as result with ok false.` + EOB + heartbeat('profile', 'Loop')
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
  // The merge step adds one consider agent and at most branches - 1 merge trials for each round.
  const branches = Number(st.budget && st.budget.branches) || 4
  // A profile before the first trial and before each round adds one profiler agent and one status agent each.
  // A prune adds one bookkeeping agent and one status agent; at most 2 for each round are counted.
  CEILING = 3 * trials + 2 * rounds + 10 + branches * rounds + 2 * (rounds + 1) + 4 * rounds
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
  if (['round-open', 'round-close', 'checkpoint', 'merge-trial', 'merge-close', 'prune'].includes(next.action)) {
    queue.length = 0
    const isMerge = next.action === 'merge-trial'
    const r = await book(next.action, isMerge ? `--branch ${next.branch}` : '', isMerge ? `merge:${laneTag(next.branch)}` : next.action, 'Loop')
    events.push({ event: next.action, ok: r.ok !== false, why: next.why || '', winner: r.winner || null, ...(isMerge ? { branch: next.branch, verdict: r.verdict, median: r.median ?? null } : {}) })
    if (r.ok === false) { stoppedAt = 'bookkeeping'; reason = `${next.action}: ${r.error || 'failed'}`; break }
    log(isMerge
      ? `merge of ${next.branch}: ${r.verdict}${r.median !== null && r.median !== undefined ? ` (${r.median})` : ''}${r.reason ? ` — ${r.reason}` : ''}`
      : `${next.action}: ${next.why || ''}${r.winner ? ` → winner ${typeof r.winner === 'string' ? r.winner : r.winner.name}` : ''}`)
    st = r.state ? r : await book('status', '', 'status', 'Loop')
    continue
  }
  if (next.action === 'profile') {
    queue.length = 0
    if (!st.profile) st = await book('status', '', 'status', 'Loop')
    const agentMode = st.profile && st.profile.mode === 'agent'
    let r
    if (agentMode) {
      const a = await call(profilerPrompt(st), { schema: BOOK_SCHEMA, label: 'profile', phase: 'Loop', ...OPUS })
      r = a && a.result ? a.result : { ok: false, error: (a && a.error) || 'profile: no result' }
    } else r = await book('profile', '', 'profile', 'Loop')
    events.push({ event: 'profile', ok: r.ok !== false, entries: r.entries ?? 0, skipped: !!r.skipped })
    if (r.ok === false) { stoppedAt = 'bookkeeping'; reason = `profile: ${r.error || 'failed'}`; break }
    log(r.skipped ? 'profile: skipped' : `profile: ${r.entries ?? '?'} entries`)
    st = r.state ? r : await book('status', '', 'status', 'Loop')
    continue
  }
  if (next.action === 'merge-consider') {
    queue.length = 0
    if (!st.merge) st = await book('status', '', 'status', 'Loop')
    const mg = st.merge || { round: '?', candidates: [] }
    const r = await call(considerPrompt(mg), { schema: BOOK_SCHEMA, label: `merge-consider:${mg.round}`, phase: 'Loop', ...OPUS })
    const res = r && r.result ? r.result : { ok: false, error: (r && r.error) || 'merge-consider: no result' }
    events.push({ event: 'merge-consider', ok: res.ok !== false, try: res.try || [] })
    if (res.ok === false) { stoppedAt = 'bookkeeping'; reason = `merge-consider: ${res.error || 'failed'}`; break }
    log(`merge-consider: round ${mg.round}, try ${(res.try || []).join(', ') || 'none'}`)
    st = res.state ? res : await book('status', '', 'status', 'Loop')
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
  } else if (next.port || next.bundle) {
    // G4: a port or a bundle has no proposer. The editor makes the change of the kept diffs again on the trunk code.
    queue.length = 0
    n = ++SEQ_T
    lane = next.on
    h = reuseHypothesis(next, st.worktree)
    const e = await call(editPrompt(n, h, lane), { schema: EDIT_SCHEMA, label: `edit:${n}`, phase: 'Loop', ...SONNET })
    if (!e || e.ok !== true) log(`edit:${n} changed nothing (${(e && e.note) || 'no answer'}); the trial records it as rejected`)
  } else {
    n = ++SEQ_T
    lane = next.on
    const onTrunk = !isBranchLane(lane)
    // A queued trunk hypothesis is used only while the next trial stays on the trunk.
    h = onTrunk && queue.length ? queue.shift() : null
    if (!h) {
      queue.length = 0
      const p = await call(proposePrompt(n, onTrunk ? width : 1, onTrunk ? null : lane), { schema: PROPOSE_SCHEMA, label: `propose:${n}`, phase: 'Loop', ...OPUS })
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
