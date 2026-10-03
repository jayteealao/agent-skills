/**
 * The driver journal as the live views keep it between polls: the run state of
 * the shared event rules (lib/live-events.mjs), plus what the views draw and
 * the watch does not need (the open agents, the stage times, the beats).
 *
 * Pure: `absorb` returns a new state and the events of the new lines.
 */
import { applyLines, freshRunState, judgeSilence, livenessOf, stageOf } from '../../../../lib/live-events.mjs'
import type { ArtifactFact, JournalLine, LiveEvent, RunState } from '../../../../lib/live-events.mjs'
import type { SdlcLiveness } from '../../../../types'

export type FinishedStage = { stage: string; slice: string | null; ms: number }

export type JournalState = {
  run: RunState
  /** Every agent of the run still out, by label: its start time. */
  agents: Record<string, number>
  /** Stage times of every finished stage agent in the journal, newest last. */
  finished: FinishedStage[]
  /** The times of the newest lines, oldest first. */
  beats: number[]
  /** The times of the agent starts, oldest first: the steering readers count from them. */
  starts: number[]
  /** The newest line as a few words. */
  lastLine: string | null
  /** The newest stage line: where the run is or stopped. */
  lastStage: { stage: string; slice: string | null; event: string; status: string | null; at: number } | null
  /** The lines absorbed so far. */
  count: number
}

const BEATS_KEPT = 60
const STARTS_KEPT = 200
const FINISHED_KEPT = 200

export function freshJournalState(): JournalState {
  return { run: freshRunState(), agents: {}, finished: [], beats: [], starts: [], lastLine: null, lastStage: null, count: 0 }
}

/** A copy deep enough that `absorb` never changes its input. */
function copyOf(state: JournalState): JournalState {
  return JSON.parse(JSON.stringify(state)) as JournalState
}

const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

/**
 * The state after new lines, and the events they raise under the shared rules.
 *
 * @param artifactOf what a stage's artifact says now, for a stage end; the caller read it before
 */
export function absorb(slug: string, previous: JournalState, lines: readonly JournalLine[], artifactOf: (stage: string, slice: string | null) => ArtifactFact | null = () => null): { state: JournalState; events: LiveEvent[] } {
  const state = copyOf(previous)
  const priorRun = state.run.run
  const events = applyLines(slug, state.run, lines, { artifactOf })
  if (state.run.run !== priorRun && priorRun !== null) state.agents = {}
  for (const line of lines) {
    const at = Date.parse(str(line['at']) ?? '')
    if (!Number.isFinite(at)) continue
    state.count += 1
    state.beats.push(at)
    const event = str(line['event']) ?? ''
    const agent = str(line['agent'])
    state.lastLine = [event, agent].filter(Boolean).join(' ') || null
    if (event === 'agent-start' && agent !== null) {
      state.agents[agent] = at
      state.starts.push(at)
    }
    if (event === 'agent-end' && agent !== null) {
      const startedAt = state.agents[agent]
      delete state.agents[agent]
      const { stage, slice } = stageOf(line)
      if (stage !== null && startedAt !== undefined) state.finished.push({ stage, slice, ms: Math.max(0, at - startedAt) })
    }
    if (event === 'run-end') state.agents = {}
    const { stage, slice } = stageOf(line)
    if (stage !== null) state.lastStage = { stage, slice, event, status: str(line['status']), at }
  }
  state.beats = state.beats.slice(-BEATS_KEPT)
  state.starts = state.starts.slice(-STARTS_KEPT)
  state.finished = state.finished.slice(-FINISHED_KEPT)
  return { state, events }
}

/** The silence events at a moment (stale, an inferred end), with the state they change. */
export function judge(slug: string, previous: JournalState, now: number, watchStart: number): { state: JournalState; events: LiveEvent[] } {
  const state = copyOf(previous)
  const events = judgeSilence(slug, state.run, now, watchStart)
  return { state, events }
}

/** The liveness the views draw (Q1). */
export function livenessFrom(state: JournalState, now: number): SdlcLiveness {
  const { state: kind, limitMs } = livenessOf(state.run, now)
  return { state: kind, lastLineAt: state.run.lastLineAt, limitMs, lastLine: state.lastLine, beats: state.beats.slice(-40) }
}

/** The median length of a stage's finished agents, or null when none finished. */
export function usualMsOf(state: JournalState, stage: string): number | null {
  const times = state.finished.filter(entry => entry.stage === stage).map(entry => entry.ms).sort((a, b) => a - b)
  if (times.length === 0) return null
  return times[Math.floor(times.length / 2)] ?? null
}

/** The open stage agents, newest first: label, stage, slice and start. */
export function openStagesOf(state: JournalState): Array<{ label: string; stage: string; slice: string | null; at: number }> {
  const out: Array<{ label: string; stage: string; slice: string | null; at: number }> = []
  for (const [label, at] of Object.entries(state.agents)) {
    const { stage, slice } = stageOf({ agent: label })
    if (stage !== null) out.push({ label, stage, slice, at })
  }
  return out.sort((a, b) => b.at - a.at)
}
