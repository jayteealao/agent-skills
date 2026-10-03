export const meta = {
  name: 'wf-campaign-boundary',
  description: 'The wave boundary of /wf campaign (Stage C, width 1, main checkout). mode "slug-output" builds one slug\'s output; mode "wave" merges the finished slugs into the wave branch, runs the wave verify with the revert search, writes the as-built notes and the fidelity checkpoint with a refuter on each, and builds the wave output and the try-it note; mode "drift" classifies the changed contract lines before the next wave. Never opens a PR, never ships, never pushes.',
  phases: [
    { title: 'Merge', detail: 'merge each finished slug branch into the wave branch with --no-ff, in packet order (12.3)' },
    { title: 'Verify', detail: 'wave verify, up to 2 fix rounds, then the revert search (12.2)' },
    { title: 'Record', detail: 'as-built notes, the refuter, the fidelity checkpoint (11.1, 11.3, 18)' },
    { title: 'Output', detail: 'slug and wave outputs with build labels, the try-it note (14)' },
  ],
}

// ===========================================================================
// /wf campaign — the boundary between drives (WF-CAMPAIGN-PLAN 9.4 steps 5-10
// and 13, section 19). The campaign session launches one yolo Workflow per slug,
// one at a time, then this script for the wave's boundary steps. Like yolo.js,
// the script has no file access: every read and write is done by an agent() that
// follows reference/campaign/_boundary.md. Paths are absolute; agents run git as
// `git -C <projectRoot>`.
//
// The campaign session owns the ledger. This script never edits ledger.json: it
// returns an outcome, and the session records it with scripts/campaign.mjs.
// ===========================================================================

let OPT = args
if (typeof OPT === 'string') { try { OPT = JSON.parse(OPT) } catch { OPT = null } }
if (!OPT || typeof OPT !== 'object') {
  return { ok: false, stopped: true, reason: 'campaign-boundary requires args { projectRoot, referenceRoot, brainstorm, mode, wave, ... } as a JSON object.' }
}
const { projectRoot, referenceRoot, brainstorm, mode } = OPT
const wave = Number(OPT.wave)
for (const [k, v] of Object.entries({ projectRoot, referenceRoot, brainstorm, mode })) {
  if (!v || typeof v !== 'string' || !v.trim()) return { ok: false, stopped: true, reason: `campaign-boundary: required arg '${k}' is missing` }
}
if (!Number.isInteger(wave) || wave < 1) return { ok: false, stopped: true, reason: 'campaign-boundary: wave must be a positive integer' }

// Models (yolo.js presets): Opus for the merge agent, the verify, and the writers;
// Sonnet for the refuter and the output builds. No haiku.
const SONNET = { model: 'claude-sonnet-5-5', effort: 'high' }
const OPUS = { model: 'claude-opus-5-5', effort: 'medium' }

const CAMP = `${projectRoot}/.ai/workflows/${brainstorm}/work/campaign`
const JOURNAL = `${CAMP}/.campaign-journal.jsonl`
const CONTROL = `${CAMP}/.control.json`
const PROCEDURE = `${referenceRoot}/campaign/_boundary.md`
const SCRIPT = `${referenceRoot}/../scripts/campaign.mjs`
const units = Array.isArray(OPT.units) ? OPT.units : []
const waveBranch = OPT.waveBranch || `campaign/${brainstorm}/wave-${wave}`
const runId = OPT.runId || brainstorm
const OUT = `${projectRoot}/.scratch/campaign/${runId}`

const EOB =
  `EXTERNAL OUTPUT BOUNDARY (MANDATORY): workflow artifact paths (.ai/workflows/…), stage names, slash-command ` +
  `names, sub-agent names, and campaign bookkeeping are PRIVATE. They never appear in a commit message, a branch ` +
  `description, a code comment, or a doc. Write commit messages in product language.`

let SEQ = 0
function heartbeat(label, step) {
  const seq = ++SEQ
  return `\n\nCAMPAIGN HEARTBEAT (do this FIRST and LAST). Append one JSON line to ${JOURNAL} (create it when absent; ` +
    `never rewrite it): before any other work {"at":"<ISO-8601 UTC now>","run":"${runId}","seq":${seq},` +
    `"event":"agent-start","agent":"${label}","phase":"boundary","step":"${step}","wave":${wave}}, and immediately ` +
    `before you return the same shape with "event":"agent-end", "status":"<your status>" and "errors":<errors you ` +
    `recovered from>. A failed append never changes what you do.`
}

function event(name, fields) {
  return `\n\nCAMPAIGN EVENT. After your work, append one more line to ${JOURNAL}: {"at":"<ISO-8601 UTC now>",` +
    `"run":"${runId}","event":"${name}","wave":${wave},${fields}}. The campaign watch turns it into a commentary note.`
}

const STOP_CHECK =
  `\n\nSTOP-REQUEST CHECK (before any work, after the start heartbeat). Read ${CONTROL} fresh. When it is absent ` +
  `or empty, continue. When "action" is "stop" with "scope" "campaign", or "action" is "pause" with "until" absent ` +
  `or later than now, do no work and return status 'stopped' with stopReason quoting the request. A request with ` +
  `"scope" "wave" or "slug" does not stop a boundary step: the wave finishes its boundary. Never edit the file.`

const STOP_FIELDS = { status: { enum: ['complete', 'stopped', 'failed'] }, stopReason: { type: 'string' }, note: { type: 'string' } }
const obj = (required, properties) => ({ type: 'object', required, properties: { ...STOP_FIELDS, ...properties } })

const common = (step) =>
  `Read ${PROCEDURE} IN FULL and follow its section "${step}" exactly. Project root ${projectRoot} is ABSOLUTE: ` +
  `resolve every path under it and run git as \`git -C ${projectRoot} …\`. The campaign folder is ${CAMP}. The ` +
  `campaign script is \`node "${SCRIPT}" <command> "${projectRoot}" ${brainstorm} …\`.\n\n${EOB}`

// ---------------------------------------------------------------------------
// mode "slug-output" — 14.3. One slug's output from its slug branch.
// ---------------------------------------------------------------------------
async function slugOutput(u) {
  phase('Output')
  return await agent(
    `BUILD THE SLUG OUTPUT for slug '${u.slug}' (packet ${u.key}) of campaign '${brainstorm}', wave ${wave}. ` +
    common('Slug output') +
    `\n\nSlug branch: ${u.branch}. Output folder: ${OUT}/slugs/${u.slug}/. The recipe: ${JSON.stringify(OPT.output || null)}.` +
    STOP_CHECK + heartbeat(`slug-output:${u.slug}`, 'slug-output') +
    `\n\nReturn { status, label, path, built (true when the build command passed), failure (the failing output tail) }.`,
    { schema: obj(['status'], { label: { type: 'string' }, path: { type: 'string' }, built: { type: 'boolean' }, failure: { type: 'string' } }), label: `slug-output:${u.slug}`, phase: 'Output', ...SONNET }
  )
}

// ---------------------------------------------------------------------------
// mode "wave" — 9.4 steps 6-10.
// ---------------------------------------------------------------------------
async function merge() {
  phase('Merge')
  return await agent(
    `MERGE THE FINISHED SLUGS of wave ${wave} of campaign '${brainstorm}' into the wave branch ${waveBranch}. ` +
    common('Merge') +
    `\n\nMerge these slug branches, in this order, each with \`--no-ff\`: ` +
    `${JSON.stringify(units.map(u => ({ key: u.key, slug: u.slug, branch: u.branch })))}.` +
    STOP_CHECK + heartbeat('merge', 'merge') + event('merge', '"key":"<packet key>","slug":"<slug>","sha":"<merge commit>","result":"merged|stopped"') +
    ` Append that event once per slug.` +
    `\n\nReturn { status, merged: [{ key, slug, sha }] in merge order, notMerged: [{ key, slug, reason }] }.`,
    {
      schema: obj(['status', 'merged'], {
        merged: { type: 'array', items: { type: 'object', required: ['key', 'sha'], properties: { key: { type: 'string' }, slug: { type: 'string' }, sha: { type: 'string' } } } },
        notMerged: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, slug: { type: 'string' }, reason: { type: 'string' } } } },
      }),
      label: 'merge', phase: 'Merge', ...OPUS,
    }
  )
}

const VERIFY_SCHEMA = obj(['status', 'green'], {
  green: { type: 'boolean' }, rounds: { type: 'number' }, commands: { type: 'array', items: { type: 'string' } }, failures: { type: 'string' },
})

async function waveVerify(fixRounds, label) {
  return await agent(
    `RUN THE WAVE VERIFY on ${waveBranch} for campaign '${brainstorm}', wave ${wave}. ` + common('Wave verify') +
    `\n\n${fixRounds ? `You may run up to ${fixRounds} fix rounds, each committed on the wave branch, then the env-remediation rung.` : 'Run the commands once. Fix nothing: this run judges one revert step.'}` +
    STOP_CHECK + heartbeat(label, 'wave-verify') +
    (fixRounds ? event('wave-verify', '"green":<true|false>,"rounds":<n>') : '') +
    `\n\nReturn { status, green, rounds, commands (the commands you ran), failures (the failing output tail, or "") }.`,
    { schema: VERIFY_SCHEMA, label, phase: 'Verify', ...OPUS }
  )
}

// 12.2 — revert one merge (newest first), or merge a reverted slug again, then judge the verify.
async function revertStep(m, again) {
  return await agent(
    `${again ? 'MERGE AGAIN' : 'REVERT'} slug '${m.slug}' (packet ${m.key}) on ${waveBranch}, campaign '${brainstorm}', ` +
    `wave ${wave}. ` + common('Revert search') +
    `\n\n${again ? `Revert the revert of merge ${m.sha} (the slug did not break the verify), then run the wave verify commands once.` : `Run \`git -C ${projectRoot} revert -m 1 --no-edit ${m.sha}\`, then run the wave verify commands once.`} ` +
    `Fix nothing.` + STOP_CHECK + heartbeat(`${again ? 'remerge' : 'revert'}:${m.slug}`, 'revert-search') +
    `\n\nReturn { status, green, commands, failures, sha (the new commit) }.`,
    { schema: obj(['status', 'green'], { green: { type: 'boolean' }, commands: { type: 'array', items: { type: 'string' } }, failures: { type: 'string' }, sha: { type: 'string' } }), label: `${again ? 'remerge' : 'revert'}:${m.slug}`, phase: 'Verify', ...OPUS }
  )
}

async function asBuilt(m, u) {
  phase('Record')
  return await agent(
    `WRITE THE AS-BUILT NOTE for slug '${m.slug}' (packet ${m.key}) of campaign '${brainstorm}', wave ${wave}. ` +
    common('As-built note') +
    `\n\nMerge commit: ${m.sha}. Slug output: ${JSON.stringify(u.output || null)}. Decision digest from the slug's ` +
    `yolo outcome: ${JSON.stringify(u.digest || null)}. Write ${CAMP}/as-built/${m.slug}.md and ${CAMP}/as-built/${m.slug}.json.` +
    STOP_CHECK + heartbeat(`as-built:${m.slug}`, 'as-built') +
    `\n\nReturn { status, path, lines: [{ key, status }] }.`,
    { schema: obj(['status'], { path: { type: 'string' }, lines: { type: 'array', items: { type: 'object' } } }), label: `as-built:${m.slug}`, phase: 'Record', ...OPUS }
  )
}

async function refute(target, label) {
  return await agent(
    `REFUTE the claims in ${target} (campaign '${brainstorm}', wave ${wave}). Default to "not shown" when you cannot ` +
    `check a claim. ` + common('Refuter') +
    heartbeat(label, 'refuter') + event('refuter', `"target":"${target}","upheld":<n>,"changed":<n>,"unverified":<n>`) +
    `\n\nReturn { status, path (your refute/ file), upheld, changed, unverified }.`,
    { schema: obj(['status'], { path: { type: 'string' }, upheld: { type: 'number' }, changed: { type: 'number' }, unverified: { type: 'number' } }), label, phase: 'Record', ...SONNET }
  )
}

async function fidelity(merged) {
  return await agent(
    `WRITE THE FIDELITY CHECKPOINT for wave ${wave} of campaign '${brainstorm}'. ` + common('Fidelity checkpoint') +
    `\n\nMerged slugs: ${JSON.stringify(merged.map(m => ({ key: m.key, slug: m.slug })))}. Write ${CAMP}/fidelity/wave-${wave}.md.` +
    STOP_CHECK + heartbeat('fidelity', 'fidelity') +
    event('fidelity', '"honoured":<n>,"narrowed":<n>,"dropped":<n>,"unratified":["<item key>"]') +
    `\n\nReturn { status, path, honoured, narrowed, dropped, unratified: [item keys narrowed or dropped with no quoted answer from the person] }.`,
    { schema: obj(['status'], { path: { type: 'string' }, honoured: { type: 'number' }, narrowed: { type: 'number' }, dropped: { type: 'number' }, unratified: { type: 'array', items: { type: 'string' } } }), label: 'fidelity', phase: 'Record', ...OPUS }
  )
}

async function waveOutput(record) {
  phase('Output')
  return await agent(
    `BUILD THE WAVE OUTPUT and WRITE THE TRY-IT NOTE for wave ${wave} of campaign '${brainstorm}'. ` + common('Wave output') +
    `\n\nWave branch: ${waveBranch}. Output folder: ${OUT}/wave-${wave}/. The recipe: ${JSON.stringify(OPT.output || null)}. ` +
    `This wave's record: ${JSON.stringify(record)}. Write ${CAMP}/waves/wave-${wave}.md for a person.` +
    STOP_CHECK + heartbeat('wave-output', 'wave-output') + event('wave-ready', '"label":"<build label>","note":"<try-it note path>"') +
    `\n\nReturn { status, label, path, note, built }.`,
    { schema: obj(['status'], { label: { type: 'string' }, path: { type: 'string' }, note: { type: 'string' }, built: { type: 'boolean' } }), label: 'wave-output', phase: 'Output', ...SONNET }
  )
}

// ---------------------------------------------------------------------------
// mode "drift" — 9.4 step 13 / 11.2. Before wave `wave`, classify each changed
// contract line, then the script computes the classes and writes drift/.
// ---------------------------------------------------------------------------
async function drift() {
  return await agent(
    `DRIFT CHECK before wave ${wave} of campaign '${brainstorm}'. ` + common('Drift check') +
    STOP_CHECK + heartbeat('drift', 'drift') +
    `\n\nReturn { status, contract: [packet keys with a contract difference], implementation: [packet keys with only implementation-detail differences], path }.`,
    { schema: obj(['status'], { contract: { type: 'array', items: { type: 'string' } }, implementation: { type: 'array', items: { type: 'string' } }, path: { type: 'string' } }), label: 'drift', phase: 'Record', ...OPUS }
  )
}

const stoppedBy = (r) => (r && r.status === 'stopped' ? { ok: false, stopped: true, stoppedAt: 'stop-request', reason: r.stopReason || 'stop request' } : null)

// ---------------------------------------------------------------------------
if (mode === 'slug-output') {
  const u = units[0]
  if (!u) return { ok: false, stopped: true, reason: 'slug-output needs one unit' }
  const r = await slugOutput(u)
  return stoppedBy(r) || { ok: !!(r && r.built), mode, wave, key: u.key, slug: u.slug, output: r, reason: r && !r.built ? `the slug output did not build: ${r.failure || 'no detail'}` : undefined }
}

if (mode === 'drift') {
  const r = await drift()
  return stoppedBy(r) || { ok: !!r && r.status === 'complete', mode, wave, contract: (r && r.contract) || [], implementation: (r && r.implementation) || [], path: r && r.path }
}

if (mode !== 'wave') return { ok: false, stopped: true, reason: `campaign-boundary: unknown mode '${mode}'` }

const outcome = { ok: false, mode, wave, branch: waveBranch }
// 6. Merge.
const m = await merge()
if (stoppedBy(m)) return { ...outcome, ...stoppedBy(m) }
if (!m || !Array.isArray(m.merged)) return { ...outcome, stopped: true, stoppedAt: 'merge', reason: 'the merge agent did not return' }
outcome.notMerged = m.notMerged || []
let merged = m.merged.map(x => ({ ...x, slug: x.slug || (units.find(u => u.key === x.key) || {}).slug }))
if (!merged.length) return { ...outcome, stopped: true, stoppedAt: 'merge', reason: 'no slug merged into the wave branch', merged }
log(`wave ${wave}: merged ${merged.map(x => x.key).join(', ')}${outcome.notMerged.length ? `; not merged ${outcome.notMerged.map(x => x.key).join(', ')}` : ''}`)

// 7. Wave verify, then the revert search (12.2).
phase('Verify')
const v = await waveVerify(2, 'wave-verify')
if (stoppedBy(v)) return { ...outcome, merged, ...stoppedBy(v) }
outcome.verify = { green: !!(v && v.green), rounds: (v && v.rounds) || 0, commands: (v && v.commands) || [] }
if (!v || !v.green) {
  const order = [...merged].reverse()
  const reverted = []
  let culprit = null
  for (const step of order) {
    const r = await revertStep(step, false)
    if (stoppedBy(r)) return { ...outcome, merged, ...stoppedBy(r) }
    reverted.push(step)
    if (r && r.green) { culprit = step; break }
  }
  if (!culprit) {
    outcome.verify.revert = { base: true, reverted: reverted.map(x => x.key) }
    return { ...outcome, merged: [], stopped: true, stoppedAt: 'wave-verify', reason: `the wave verify is red with every slug reverted: the fault is in the wave branch base, not in a slug — ask the person`, failures: v && v.failures }
  }
  // The other slugs stay merged: merge again each slug reverted before the breaker.
  for (const again of reverted.slice(0, -1)) {
    const r = await revertStep(again, true)
    if (stoppedBy(r)) return { ...outcome, merged, ...stoppedBy(r) }
    if (!r || !r.green) return { ...outcome, stopped: true, stoppedAt: 'wave-verify', reason: `merging '${again.slug}' again after the revert of '${culprit.slug}' turned the verify red — two slugs interact; ask the person`, merged: merged.filter(x => x.key !== culprit.key && x.key !== again.key) }
  }
  merged = merged.filter(x => x.key !== culprit.key)
  outcome.verify = { ...outcome.verify, green: true, revert: { culprit: culprit.key, reverted: reverted.map(x => x.key), reapplied: reverted.slice(0, -1).map(x => x.key) } }
  outcome.needsFix = [{ key: culprit.key, slug: culprit.slug, reason: 'its merge broke the wave verify; reverted (12.2)' }]
  log(`wave ${wave}: '${culprit.slug}' broke the wave verify; reverted, the other slugs stay merged`)
}
outcome.merged = merged
if (!merged.length) return { ...outcome, stopped: true, stoppedAt: 'wave-verify', reason: 'no slug is left merged after the revert search' }

// 8. As-built notes and the refuter (11.1, 11.3).
outcome.asBuilt = []
for (const x of merged) {
  const u = units.find(y => y.key === x.key) || {}
  const a = await asBuilt(x, u)
  if (stoppedBy(a)) return { ...outcome, ...stoppedBy(a) }
  const r = await refute(`${CAMP}/as-built/${x.slug}.md`, `refute:${x.slug}`)
  outcome.asBuilt.push({ key: x.key, slug: x.slug, path: a && a.path, refute: r ? { path: r.path, upheld: r.upheld, changed: r.changed, unverified: r.unverified } : null })
}

// 9. Fidelity checkpoint and its refuter (18, F3).
const f = await fidelity(merged)
if (stoppedBy(f)) return { ...outcome, ...stoppedBy(f) }
const fr = await refute(`${CAMP}/fidelity/wave-${wave}.md`, 'refute:fidelity')
outcome.fidelity = { path: f && f.path, honoured: f && f.honoured, narrowed: f && f.narrowed, dropped: f && f.dropped, unratified: (f && f.unratified) || [], refute: fr ? { path: fr.path, changed: fr.changed, unverified: fr.unverified } : null }

// 10. Wave output and the try-it note (14.4).
const o = await waveOutput({ merged: merged.map(x => x.key), notMerged: outcome.notMerged, needsFix: outcome.needsFix || [], moved: OPT.moved || [], verify: outcome.verify, fidelity: outcome.fidelity })
if (stoppedBy(o)) return { ...outcome, ...stoppedBy(o) }
outcome.output = o

// F3: a narrowed or dropped decision with no quoted answer from the person stops the
// campaign before the next wave. The wave itself is built and can still ship.
if (outcome.fidelity.unratified.length) {
  return { ...outcome, ok: true, stopBeforeNextWave: true, reason: `fidelity: ${outcome.fidelity.unratified.join(', ')} narrowed or dropped with no answer from the person (F3)` }
}
return { ...outcome, ok: true }
