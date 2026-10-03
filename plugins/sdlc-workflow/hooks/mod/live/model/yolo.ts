/**
 * facts → the yolo view's model (WF-LIVE-VIEWS-PLAN.md 3.3). Pure (M1): the
 * live module reads the files, this function never does, and a style never
 * reads a file.
 */
import type { SdlcNeed, SdlcStageMark, SdlcUsage, SdlcYoloModel } from '../../../../types'
import type { JournalState } from './journal.ts'
import { livenessFrom, openStagesOf, usualMsOf } from './journal.ts'
import { openNeedsOf, protectedNeedsOf, recordNeedsOf, staleNeedOf } from './needs.ts'
import type { RecordFact } from './needs.ts'

export const YOLO_STAGES = ['plan', 'implement', 'verify', 'review'] as const
export type YoloStage = (typeof YOLO_STAGES)[number]

/** One slice of the roster: the furthest stage file present, and whether a review file exists. */
export type RosterFact = { slug: string; stage: 'defined' | 'planned' | 'implemented' | 'verified'; reviewed: boolean }

/** The stop request of `.control.json`, when one applies. */
export type ControlFact = { action: string; after: string | null; by: string | null; requestedAt: string | null }

export type YoloFacts = {
  slug: string
  root: string
  now: number
  journal: JournalState
  roster: readonly RosterFact[]
  records: readonly RecordFact[]
  control: ControlFact | null
  protectedWatched: number
  protectedChanged: readonly string[]
  commits: { count: number | null; last: string | null }
  steerMtime: number | null
  usage: SdlcUsage
  dismissed: readonly string[]
}

const DONE_BY_STAGE: Record<RosterFact['stage'], number> = { defined: 0, planned: 1, implemented: 2, verified: 3 }

/** The stages of a roster slice that are done: plan, implement and verify from the files, review from its file. */
function doneOf(slice: RosterFact): number {
  return DONE_BY_STAGE[slice.stage] + (slice.reviewed && slice.stage === 'verified' ? 1 : 0)
}

function isYoloStage(stage: string | null): stage is YoloStage {
  return stage !== null && (YOLO_STAGES as readonly string[]).includes(stage)
}

export function buildYoloModel(facts: YoloFacts): SdlcYoloModel {
  const { journal, roster, now, slug } = facts
  const liveness = livenessFrom(journal, now)
  const open = openStagesOf(journal)
  const running = open[0] ?? null
  const last = journal.lastStage
  const stoppedStatus = last !== null && last.event === 'agent-end' && (last.status === 'hard-stop' || last.status === 'stopped') ? last : null
  const focusStage = running?.stage ?? last?.stage ?? null
  const focusSlice = running?.slice ?? last?.slice ?? null
  const index = focusSlice === null ? -1 : roster.findIndex(slice => slice.slug === focusSlice)
  const focusRoster = index === -1 ? null : (roster[index] as RosterFact)

  const slices = roster.map(slice => {
    const done = doneOf(slice)
    const marks: SdlcStageMark[] = YOLO_STAGES.map((stage, i) => {
      if (open.some(agent => agent.stage === stage && agent.slice === slice.slug)) return 'run'
      if (i < done) return 'done'
      if (stoppedStatus !== null && stoppedStatus.stage === stage && stoppedStatus.slice === slice.slug) return 'stop'
      return 'wait'
    })
    return { slug: slice.slug, marks }
  })

  let outcome: SdlcYoloModel['outcome'] = 'running'
  if (liveness.state === 'none') outcome = 'none'
  else if (liveness.state === 'stale') outcome = 'stale'
  else if (liveness.state === 'ended') outcome = stoppedStatus !== null ? 'stopped' : 'ended'

  const needs: SdlcNeed[] = [...recordNeedsOf(slug, facts.records), ...protectedNeedsOf(facts.root, facts.protectedChanged)]
  if (outcome === 'stale' && liveness.lastLineAt !== null) needs.unshift(staleNeedOf(slug, 'yolo', Math.round((now - liveness.lastLineAt) / 60000)))

  const agents = Object.keys(journal.agents)
    .sort((a, b) => (journal.agents[b] ?? 0) - (journal.agents[a] ?? 0))
    .map(label => ({ label, isStage: open.some(agent => agent.label === label), model: null }))

  const steering =
    facts.steerMtime === null
      ? null
      : { editedAt: facts.steerMtime, readers: journal.starts.filter(at => at >= (facts.steerMtime as number)).length }

  const control = facts.control
  const stop = control !== null && control.action === 'stop' && control.after !== null ? { after: control.after, by: control.by ?? 'person', requestedAt: control.requestedAt } : null

  return {
    kind: 'yolo',
    slug,
    run: journal.run.run,
    liveness,
    focus: {
      slice: focusSlice,
      index: index === -1 ? null : index + 1,
      count: roster.length,
      stage: isYoloStage(focusStage) ? focusStage : null,
      stagesDone: focusRoster === null ? 0 : doneOf(focusRoster),
      startedAt: running?.at ?? null,
      usualMs: focusStage === null ? null : usualMsOf(journal, focusStage),
    },
    slices,
    needs: openNeedsOf(needs, facts.dismissed),
    commits: facts.commits,
    agents,
    steering,
    protectedFiles: { watched: facts.protectedWatched, changed: [...facts.protectedChanged] },
    usage: facts.usage,
    stop,
    outcome,
  }
}

/** The stop request the control file holds, or null; a cleared or unparsable file holds none. */
export function controlOf(text: string | null): ControlFact | null {
  if (text === null || text.trim() === '') return null
  try {
    const value = JSON.parse(text) as Record<string, unknown>
    const action = typeof value['action'] === 'string' ? value['action'] : null
    if (action === null || action === 'none') return null
    const str = (field: string) => (typeof value[field] === 'string' ? (value[field] as string) : null)
    return { action, after: str('after'), by: str('by'), requestedAt: str('requestedAt') }
  } catch {
    return null
  }
}
