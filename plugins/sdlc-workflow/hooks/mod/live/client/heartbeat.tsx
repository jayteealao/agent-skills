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
}

type HeartbeatState = { elapsed: number; cancel: (() => void) | null; spikeAt: number | null; lastBeat: number | null }

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
  if (current === undefined) {
    // Start the clock once; the first state is the only setState a render makes.
    const cancel = isMoving(props.state)
      ? surface.every(TICK_MS, () => {
          const state = surface.state
          if (state !== undefined) surface.setState({ ...state, elapsed: state.elapsed + TICK_MS })
        })
      : null
    surface.setState({ elapsed: 0, cancel, spikeAt: null, lastBeat: newest })
  } else if (!isMoving(props.state) && current.cancel !== null) {
    // The run stopped: the heartbeat stops with it (N3).
    current.cancel()
    surface.setState({ ...current, cancel: null })
  } else if (newest !== null && newest !== current.lastBeat) {
    // A new journal line: one spike (5.6, 0.9 s).
    surface.setState({ ...current, spikeAt: current.elapsed, lastBeat: newest })
  }
  const elapsed = current?.elapsed ?? 0
  const now = props.now + elapsed
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
  const words = props.state === 'none' ? 'no journal yet' : props.state === 'stale' ? `quiet for ${ageText(age)}` : props.state === 'ended' ? `ended · last line ${ageText(age)} ago` : props.state === 'quiet' ? `quiet for ${ageText(age)}` : `last line ${ageText(age)} ago`
  return Box({
    flexDirection: 'row',
    gap: 1,
    children: [Text({ color: colour, dimColor: breath, children: props.state === 'ended' || props.state === 'none' ? '○' : '●' }), Text({ dimColor: true, children: words })],
  })
}
