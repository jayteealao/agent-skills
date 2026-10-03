/**
 * model → the facts every style draws (WF-LIVE-VIEWS-PLAN.md L1, L6, T5).
 *
 * A style arranges and decorates these facts; it never computes one. So the
 * three styles show the same facts for the same model, and each fact answers
 * one of the five questions: alive (Q1), where (Q2), decided (Q3), needs me
 * (Q4), cost (Q5).
 */
import type { SdlcBrainstormModel, SdlcCampaignModel, SdlcLiveModel, SdlcNeed, SdlcStageMark, SdlcUsage, SdlcYoloModel } from '../../../types'
import { ageText, clockOf, percentText } from '../live/glyphs.ts'
import type { Tone } from './tokens.ts'

export type Track = { key: string; label: string; marks: SdlcStageMark[]; note: string; tone: Tone }
export type TrackGroup = { key: string; title: string; lights: Array<{ label: string; on: boolean }>; tracks: Track[]; tone: Tone }
export type Meter = { key: string; label: string; value: number | null; max: number; marks: number[]; text: string; tone: Tone }
export type Section = { key: string; title: string; lines: Array<{ text: string; tone: Tone }>; detail: boolean }
export type Control = { key: string; label: string; armedLabel: string; armed: boolean; isPrimary: boolean }

export type ViewFacts = {
  kind: SdlcLiveModel['kind']
  slug: string
  title: string
  focus: {
    /** A small line above the value: `slice 3 of 7`. */
    eyebrow: string
    /** The one word a dot-matrix glyph or a headline draws: `VERIFY`. */
    word: string
    /** The focus as a line: `s3 match-clock · verify`. */
    line: string
    /** Time against the usual time, or the mode's detail. */
    sub: string
    tone: Tone
    /** The stage rail of style A: the steps, how many are done, the one running (-1 none). */
    rail: { steps: string[]; done: number; at: number } | null
  }
  /** A number for the time card of style D and the second headline line of E. */
  clock: { label: string; value: string; unit: string; sub: string } | null
  liveness: { state: string; text: string; tone: Tone; beats: number[]; lastLineAt: number | null; limitMs: number }
  /** The step names a track's marks stand for. */
  steps: string[]
  groups: TrackGroup[]
  needs: SdlcNeed[]
  meters: Meter[]
  /** One dim line: the summary of the parts behind the details button (A). */
  summary: string
  sections: Section[]
  controls: Control[]
}

const STEP_NAMES = ['plan', 'implement', 'verify', 'review']

/** The liveness facts at a moment (Q1). */
function livenessFacts(model: SdlcLiveModel, now: number): ViewFacts['liveness'] {
  const live = model.liveness
  const age = live.lastLineAt === null ? null : now - live.lastLineAt
  const text =
    live.state === 'none'
      ? 'no journal yet'
      : live.state === 'stale'
        ? `quiet for ${ageText(age)} · past its ${ageText(live.limitMs)} limit`
        : live.state === 'ended'
          ? `ended · last line ${ageText(age)} ago`
          : live.state === 'quiet'
            ? `quiet for ${ageText(age)}`
            : `last line ${ageText(age)} ago`
  const tone: Tone = live.state === 'stale' ? 'stop' : live.state === 'quiet' ? 'attention' : live.state === 'ended' || live.state === 'none' ? 'quiet' : 'done'
  return { state: live.state, text, tone, beats: live.beats, lastLineAt: live.lastLineAt, limitMs: live.limitMs }
}

/** The two usage meters, marked at the slow and pause lines (Q5). */
function usageMeters(usage: SdlcUsage): Meter[] {
  const tone = (percent: number | null): Tone => (percent === null ? 'quiet' : percent >= usage.pause ? 'stop' : percent >= usage.slow ? 'attention' : 'done')
  const resets = (iso: string | null) => (iso === null ? '' : ` · resets ${clockOf(iso)}`)
  return [
    { key: 'usage-5h', label: '5-hour', value: usage.fiveHour.percent, max: 100, marks: [usage.slow, usage.pause], text: `${percentText(usage.fiveHour.percent)}${resets(usage.fiveHour.resetsAt)}`, tone: tone(usage.fiveHour.percent) },
    { key: 'usage-7d', label: 'weekly', value: usage.sevenDay.percent, max: 100, marks: [], text: `${percentText(usage.sevenDay.percent)}${resets(usage.sevenDay.resetsAt)}`, tone: tone(usage.sevenDay.percent) },
  ]
}

function markTone(marks: readonly SdlcStageMark[]): Tone {
  if (marks.includes('stop')) return 'stop'
  if (marks.includes('run')) return 'run'
  if (marks.every(mark => mark === 'done')) return 'done'
  return 'quiet'
}

function needsTone(needs: readonly SdlcNeed[]): Tone | null {
  if (needs.some(need => need.tone === 'stop')) return 'stop'
  if (needs.some(need => need.tone === 'intent')) return 'intent'
  if (needs.length > 0) return 'attention'
  return null
}

function yoloFacts(model: SdlcYoloModel, now: number): ViewFacts {
  const focus = model.focus
  const stageIndex = focus.stage === null ? -1 : STEP_NAMES.indexOf(focus.stage)
  const used = focus.startedAt === null ? null : now - focus.startedAt
  const time = used === null ? '' : focus.usualMs === null ? `${ageText(used)} in` : `${ageText(used)} of a usual ${ageText(focus.usualMs)}`
  const where = focus.index === null ? `${focus.count} slices` : `slice ${focus.index} of ${focus.count}`
  const outcomeWord = model.outcome === 'stopped' ? 'STOPPED' : model.outcome === 'ended' ? 'DONE' : model.outcome === 'stale' ? 'QUIET' : model.outcome === 'none' ? 'WAITING' : (focus.stage ?? 'running').toUpperCase()
  const tone: Tone = model.outcome === 'stale' || model.outcome === 'stopped' ? 'stop' : model.outcome === 'running' ? 'run' : 'quiet'
  const sections: Section[] = [
    {
      key: 'commits',
      title: 'Commits',
      lines: [{ text: model.commits.count === null ? 'commits —' : `${model.commits.count} commit${model.commits.count === 1 ? '' : 's'} this run`, tone: 'plain' }, ...(model.commits.last === null ? [] : [{ text: model.commits.last, tone: 'quiet' as Tone }])],
      detail: true,
    },
    {
      key: 'agents',
      title: 'Agents',
      lines: model.agents.length === 0 ? [{ text: 'no agent out', tone: 'quiet' }] : model.agents.map(agent => ({ text: agent.model === null ? agent.label : `${agent.label} · ${agent.model}`, tone: agent.isStage ? 'plain' : 'quiet' })),
      detail: true,
    },
    {
      key: 'protected',
      title: 'Protected files',
      lines: model.protectedFiles.changed.length === 0 ? [{ text: `${model.protectedFiles.watched} watched · intact`, tone: 'done' }] : model.protectedFiles.changed.map(file => ({ text: `${file} changed`, tone: 'attention' as Tone })),
      detail: true,
    },
    {
      key: 'steering',
      title: 'Steering',
      lines: model.steering === null ? [{ text: 'no steer.md', tone: 'quiet' }] : [{ text: `steer.md edited ${clockOf(new Date(model.steering.editedAt ?? 0).toISOString())} · ${model.steering.readers} agent${model.steering.readers === 1 ? '' : 's'} read it since`, tone: model.steering.readers === 0 ? 'attention' : 'plain' }],
      detail: true,
    },
    {
      key: 'decisions',
      title: 'Decisions',
      lines: model.needs.filter(need => need.section === 'decisions').map(need => ({ text: `${need.title}: ${need.body}`, tone: need.tone })),
      detail: true,
    },
  ]
  const stopAt = model.stop
  const runningStage = focus.stage ?? 'current'
  const controls: Control[] =
    model.outcome === 'running' || model.outcome === 'stale'
      ? [
          { key: 'stop-stage', label: 'Stop after this stage', armedLabel: `Stop requested · after ${runningStage}`, armed: stopAt !== null && stopAt.after === runningStage, isPrimary: true },
          { key: 'stop-verify', label: 'Stop after verify', armedLabel: 'Stop requested · after verify', armed: stopAt !== null && stopAt.after === 'verify' && runningStage !== 'verify', isPrimary: false },
        ]
      : []
  return {
    kind: 'yolo',
    slug: model.slug,
    title: `yolo · ${model.slug}`,
    focus: {
      eyebrow: where,
      word: outcomeWord,
      line: [focus.slice, focus.stage].filter(Boolean).join(' · ') || model.outcome,
      sub: time || (model.run === null ? 'no run yet' : `run ${model.run}`),
      tone,
      rail: { steps: STEP_NAMES, done: focus.stagesDone, at: model.outcome === 'running' ? stageIndex : -1 },
    },
    clock: used === null ? null : { label: 'STAGE TIME', value: String(Math.round(used / 60000)), unit: 'MIN', sub: focus.usualMs === null ? 'no usual time yet' : `usual ${Math.round(focus.usualMs / 60000)} min` },
    liveness: livenessFacts(model, now),
    steps: STEP_NAMES,
    groups: [{ key: 'slices', title: 'Slices', lights: [], tracks: model.slices.map(slice => ({ key: slice.slug, label: slice.slug, marks: slice.marks, note: '', tone: markTone(slice.marks) })), tone: needsTone(model.needs) ?? 'plain' }],
    needs: model.needs,
    meters: usageMeters(model.usage),
    summary: [
      model.commits.count === null ? null : `${model.commits.count} commits`,
      `${model.agents.length} agent${model.agents.length === 1 ? '' : 's'} out`,
      model.protectedFiles.changed.length === 0 ? 'protected files intact' : `${model.protectedFiles.changed.length} protected changed`,
      model.steering === null ? null : `steer read by ${model.steering.readers}`,
    ]
      .filter(Boolean)
      .join(' · '),
    sections,
    controls,
  }
}

const GATE_LABELS: Array<[keyof SdlcCampaignModel['waves'][number]['gates'], string]> = [
  ['merge', 'merge'],
  ['verify', 'verify'],
  ['drift', 'drift'],
  ['refuter', 'refuter'],
  ['fidelity', 'fidelity'],
  ['ship', 'ship'],
]

function campaignFacts(model: SdlcCampaignModel, now: number): ViewFacts {
  const paused = model.paused
  const countdown = paused?.until == null ? null : Math.max(0, Date.parse(paused.until) - now)
  const word = paused !== null ? 'PAUSED' : model.activeWave === null ? 'IDLE' : `WAVE ${model.activeWave}`
  const groups: TrackGroup[] = model.waves.map(wave => ({
    key: `wave-${wave.n}`,
    title: `Wave ${wave.n} · ${wave.state}${wave.version === null ? '' : ` · ${wave.version}`}`,
    lights: GATE_LABELS.map(([gate, label]) => ({ label, on: wave.gates[gate] })),
    tracks: wave.slugs.map(slug => ({ key: slug.key, label: slug.slug, marks: slug.marks, note: slug.note, tone: slug.note === 'needs prepare' ? 'attention' : markTone(slug.marks) })),
    tone: wave.state === 'shipped' ? 'done' : wave.state === 'planned' ? 'quiet' : 'run',
  }))
  const controls: Control[] = []
  if (paused !== null) controls.push({ key: 'resume', label: 'Resume now', armedLabel: 'Resume requested', armed: false, isPrimary: true })
  else if (model.activeWave !== null) controls.push({ key: 'stop-wave', label: 'Stop after this wave', armedLabel: 'Stop requested · after this wave', armed: model.stop !== null, isPrimary: true })
  const prepare = model.needs.find(need => need.kind === 'prepare')
  if (prepare !== undefined) controls.push({ key: 'prepare-next', label: 'Prepare next', armedLabel: 'Prepare asked', armed: false, isPrimary: paused === null && model.activeWave === null })
  return {
    kind: 'campaign',
    slug: model.slug,
    title: `campaign · ${model.slug}`,
    focus: {
      eyebrow: model.activeWave === null ? `${model.waves.length} waves` : `wave ${model.activeWave} of ${model.waves.length}`,
      word,
      line: paused !== null ? `paused · resumes ${clockOf(paused.until)}` : `${model.running} drive${model.running === 1 ? '' : 's'} running`,
      sub: paused !== null ? (paused.reason ?? 'usage limit') : model.forecast === null ? 'forecast —' : `forecast ${model.forecast.replace(/-/gu, ' ')}`,
      tone: paused !== null ? 'stop' : model.activeWave === null ? 'quiet' : 'run',
      rail: null,
    },
    clock: countdown === null ? null : { label: 'RESUMES IN', value: `${Math.floor(countdown / 60000)}:${String(Math.floor((countdown % 60000) / 1000)).padStart(2, '0')}`, unit: 'MIN', sub: `at ${clockOf(paused?.until ?? null)}` },
    liveness: livenessFacts(model, now),
    steps: STEP_NAMES,
    groups,
    needs: model.needs,
    meters: usageMeters(model.usage),
    summary: [`${model.outputs.length} PR${model.outputs.length === 1 ? '' : 's'}`, model.build === null ? null : `try ${model.build}`, model.heavy.holder === null ? 'heavy suites free' : `${model.heavy.holder} holds heavy suites`].filter(Boolean).join(' · '),
    sections: [
      { key: 'outputs', title: 'Outputs', lines: model.outputs.length === 0 ? [{ text: 'no wave PR yet', tone: 'quiet' }] : model.outputs.map(output => ({ text: `wave ${output.wave} · ${output.pr ?? 'no PR'} · ${output.state}${output.label === null ? '' : ` · ${output.label}`}`, tone: output.state === 'shipped' ? 'done' : 'plain' as Tone })), detail: true },
      { key: 'build', title: 'Build to try', lines: [{ text: model.build ?? 'nothing unshipped', tone: model.build === null ? 'quiet' : 'run' }], detail: true },
      { key: 'heavy', title: 'Heavy suites', lines: [{ text: model.heavy.holder === null ? 'free' : `held by ${model.heavy.holder}`, tone: model.heavy.holder === null ? 'quiet' : 'run' }, ...model.heavy.waiting.map(slug => ({ text: `${slug} waits`, tone: 'attention' as Tone }))], detail: true },
    ],
    controls,
  }
}

function callTone(call: 'keep' | 'cut' | 'later' | null): Tone {
  return call === 'keep' ? 'done' : call === 'cut' ? 'stop' : call === 'later' ? 'quiet' : 'plain'
}

function brainstormFacts(model: SdlcBrainstormModel, now: number): ViewFacts {
  const walk = model.walk
  return {
    kind: 'brainstorm',
    slug: model.slug,
    title: `brainstorm · ${model.slug}`,
    focus: {
      eyebrow: model.mode === 'scope' ? `walked ${walk.walked} of ${walk.total}` : `${model.threads.length} threads · ${walk.total} items`,
      word: model.mode.toUpperCase(),
      line: model.last?.answer ?? model.last?.asked ?? 'no turn yet',
      sub: model.revision.n === null ? '' : `revision ${model.revision.n}${model.revision.change === null ? '' : ` · ${model.revision.change}`}`,
      tone: model.mode === 'done' ? 'done' : model.mode === 'scope' ? 'attention' : 'run',
      rail: null,
    },
    clock: model.mode === 'scope' ? { label: 'WALKED', value: String(walk.walked), unit: `OF ${walk.total}`, sub: `keep ${walk.keep} · cut ${walk.cut} · later ${walk.later}` } : null,
    liveness: livenessFacts(model, now),
    steps: [],
    groups: model.threads.map(thread => ({
      key: `thread-${thread.key}`,
      title: thread.name,
      lights: [],
      tracks: thread.items.map(item => ({ key: item.key, label: item.text || item.key, marks: [], note: item.call ?? (model.mode === 'explore' ? '' : 'undecided'), tone: callTone(item.call) })),
      tone: 'plain',
    })),
    needs: model.needs,
    meters: model.packets.map(packet => ({ key: `packet-${packet.key}`, label: packet.key, value: packet.size, max: 50, marks: [25, 40], text: `${packet.size} decisions · ${packet.state}`, tone: packet.size > 40 ? 'stop' : packet.size > 25 ? 'attention' : 'done' })),
    summary: `research ${model.sources.research} · references ${model.sources.references} · packets ${model.sources.work}`,
    sections: [
      { key: 'walk', title: 'Walk', lines: [{ text: `keep ${walk.keep} · cut ${walk.cut} · later ${walk.later} · ${walk.total - walk.walked} undecided`, tone: 'plain' }], detail: model.mode === 'explore' },
      { key: 'sources', title: 'Sources', lines: [{ text: `research ${model.sources.research} · references ${model.sources.references} · work ${model.sources.work}`, tone: 'plain' }], detail: true },
      { key: 'revision', title: 'Revision', lines: [{ text: model.revision.n === null ? 'no work revision yet' : `work-revision ${model.revision.n}`, tone: 'plain' }, ...(model.revision.change === null ? [] : [{ text: model.revision.change, tone: 'quiet' as Tone }])], detail: true },
    ],
    controls: [],
  }
}

export function factsOf(model: SdlcLiveModel, now: number): ViewFacts {
  if (model.kind === 'yolo') return yoloFacts(model, now)
  if (model.kind === 'campaign') return campaignFacts(model, now)
  return brainstormFacts(model, now)
}

/** The band's focus line for a model (K3): the same words in every style. */
export function bandFocusOf(facts: ViewFacts): string {
  const needs = facts.needs.length === 0 ? '' : ` · ${facts.needs.length} need${facts.needs.length === 1 ? 's' : ''} you`
  return `${facts.title} · ${facts.focus.line} · ${facts.liveness.text}${needs}`
}

/** The status-line part of a live view (K1): the heartbeat age, then the 5-hour usage. */
export function liveStatusOf(facts: ViewFacts): string {
  const usage = facts.meters.find(meter => meter.key === 'usage-5h')
  const age = facts.liveness.state === 'none' ? null : facts.liveness.text.replace(/^last line /u, '')
  return [facts.kind, facts.focus.line, age, usage === undefined || usage.value === null ? null : `5h ${Math.round(usage.value)} %`].filter(Boolean).join(' · ')
}
