/**
 * The heartbeat (WF-LIVE-VIEWS-PLAN.md 5.6, N2, N3): the one looping motion.
 *
 * A `Client` region. It advances on its own `every` timer, never on its own
 * render, so it is no render loop. It loops only while the run is live or
 * quiet; when the run ends or goes stale, the timer stops (N3).
 *
 * Three looks, one per style: `dot` (A, a breathing dot and the age),
 * `wave` (D, a braille waveform with one spike per journal line), `bar`
 * (E, the health bar).
 */
import type { ClientSurface, JsonValue, RenderElement } from 'claude-code'

import { ageText, waveOf } from '../glyphs.ts'

export type HeartbeatProps = {
  look: 'dot' | 'wave' | 'bar'
  state: string
  beats: number[]
  lastLineAt: number | null
  limitMs: number
  /** The time of the hook's draw; the region adds its own clock to it. */
  now: number
  width: number
  color: string | null
  quietColor: string | null
  stopColor: string | null
  /** The colour of the age words; null leaves them dim in the surface's colour (style A on the terminal). */
  textColor?: string | null
}

/**
 * The region's own clock. `elapsed` counts the ticks since the region first
 * drew (the pulse and the spike read it). `baseNow` is the last hook time the
 * region saw and `baseElapsed` the tick count then: the time drawn is
 * `props.now` plus the ticks since that draw, never since the first one.
 */
type HeartbeatState = { elapsed: number; cancel: (() => void) | null; spikeAt: number | null; lastBeat: number | null; baseNow: number; baseElapsed: number }

const TICK_MS = 500
const SPIKE_MS = 900

function isMoving(state: string): boolean {
  return state === 'live' || state === 'quiet'
}

export default function Heartbeat(rawProps: JsonValue, surface: ClientSurface<HeartbeatState>): RenderElement {
  const props = rawProps as unknown as HeartbeatProps
  const { Box, Text } = surface.elements
  const current = surface.state
  const newest = props.beats[props.beats.length - 1] ?? null
  const startClock = () =>
    surface.every(TICK_MS, () => {
      const state = surface.state
      if (state !== undefined) surface.setState({ ...state, elapsed: state.elapsed + TICK_MS })
    })
  if (current === undefined) {
    // The first draw: the clock runs only while the run is live or quiet.
    surface.setState({ elapsed: 0, cancel: isMoving(props.state) ? startClock() : null, spikeAt: null, lastBeat: newest, baseNow: props.now, baseElapsed: 0 })
  } else {
    let next = current
    // A new hook time: the ticks count from it, so the age is never the pane's own lifetime.
    if (props.now !== current.baseNow) next = { ...next, baseNow: props.now, baseElapsed: current.elapsed }
    if (!isMoving(props.state) && next.cancel !== null) {
      // The run stopped: the heartbeat stops with it (N3).
      next.cancel()
      next = { ...next, cancel: null }
    } else if (isMoving(props.state) && next.cancel === null) {
      // The run is live again, or became live after a first draw that was not: the clock starts.
      next = { ...next, cancel: startClock() }
    }
    // A new journal line: one spike (5.6, 0.9 s).
    if (newest !== null && newest !== next.lastBeat) next = { ...next, spikeAt: next.elapsed, lastBeat: newest }
    if (next !== current) surface.setState(next)
  }
  const elapsed = current?.elapsed ?? 0
  const sinceDraw = current === undefined || props.now !== current.baseNow ? 0 : elapsed - current.baseElapsed
  const now = props.now + sinceDraw
  const age = props.lastLineAt === null ? null : now - props.lastLineAt
  const spiking = current?.spikeAt != null && elapsed - current.spikeAt < SPIKE_MS
  const tone = props.state === 'stale' ? props.stopColor : props.state === 'quiet' ? props.quietColor : props.color
  const colour = tone ?? undefined

  if (props.look === 'wave') {
    // Quiet slows the sweep: the window spans twice the time.
    const windowMs = props.state === 'quiet' ? 20 * 60_000 : 10 * 60_000
    const line = waveOf(props.beats, now, windowMs, Math.max(8, props.width))
    return Box({ flexDirection: 'row', children: [Text({ color: colour, bold: spiking, children: line })] })
  }

  if (props.look === 'bar') {
    const label = props.state === 'live' ? 'ALL SYSTEMS OPERATIONAL' : props.state === 'quiet' ? `QUIET · ${ageText(age).toUpperCase().replace(/ /gu, '')}` : props.state === 'stale' ? 'STALE · NO JOURNAL LINE' : props.state === 'none' ? 'WAITING FOR A JOURNAL' : 'STOPPED'
    const width = Math.max(label.length + 4, props.width)
    const pulse = isMoving(props.state) ? Math.floor(elapsed / TICK_MS) % Math.max(1, width - label.length - 2) : -1
    const fill = Array.from({ length: Math.max(0, width - label.length - 2) }, (_, i) => (i === pulse || (spiking && i === pulse - 1) ? '█' : '▌')).join('')
    return Box({ flexDirection: 'row', gap: 1, children: [Text({ color: colour, bold: true, children: label }), Text({ color: colour, dimColor: !spiking, children: fill })] })
  }

  // The breathing dot: full on even ticks, dim on odd ones; a spike holds it full.
  const breath = isMoving(props.state) && !spiking && Math.floor(elapsed / TICK_MS) % 2 === 1
  const words = props.state === 'none' ? 'no journal yet' : props.state === 'stale' ? `quiet for ${ageText(age)} · past its ${ageText(props.limitMs)} limit` : props.state === 'ended' ? `ended · last line ${ageText(age)} ago` : props.state === 'quiet' ? `quiet for ${ageText(age)}` : `last line ${ageText(age)} ago`
  return Box({
    flexDirection: 'row',
    gap: 1,
    children: [Text({ color: colour, dimColor: breath, children: props.state === 'ended' || props.state === 'none' ? '○' : '●' }), Text({ ...(props.textColor == null ? { dimColor: true } : { color: props.textColor }), wrap: 'truncate-end', children: words })],
  })
}
