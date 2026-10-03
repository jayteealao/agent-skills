/**
 * The stage rail of style A (WF-LIVE-VIEWS-PLAN.md 5.6): four segments and a
 * runner. When the stage ends, the runner slides to the next stage in 0.9 s,
 * ease-out. Otherwise the rail is still: a still view means no news (L4).
 *
 * A `Client` region; it moves only on its own `every` timer (N2).
 */
import type { ClientSurface, JsonValue, RenderElement } from 'claude-code'

export type RailProps = {
  steps: string[]
  /** How many steps are done. */
  done: number
  /** The step running, or -1. */
  at: number
  width: number
  doneColor: string | null
  runColor: string | null
  waitColor: string | null
}

type RailState = { position: number; target: number; from: number; started: number; elapsed: number; cancel: (() => void) | null }

const SLIDE_MS = 900
const FRAME_MS = 60

/** Where the runner stands for a rail: on the running step, else after the last done one. */
function targetOf(props: RailProps): number {
  return props.at >= 0 ? props.at : Math.min(props.steps.length - 1, Math.max(0, props.done - 1))
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3
}

export default function Rail(rawProps: JsonValue, surface: ClientSurface<RailState>): RenderElement {
  const props = rawProps as unknown as RailProps
  const { Box, Text } = surface.elements
  const target = targetOf(props)
  const current = surface.state
  if (current === undefined) {
    surface.setState({ position: target, target, from: target, started: 0, elapsed: 0, cancel: null })
  } else if (current.target !== target && current.cancel === null) {
    // The stage changed: slide from where the runner stands now.
    const cancel = surface.every(FRAME_MS, () => {
      const state = surface.state
      if (state === undefined) return
      const elapsed = state.elapsed + FRAME_MS
      const t = Math.min(1, (elapsed - state.started) / SLIDE_MS)
      const position = state.from + (state.target - state.from) * easeOut(t)
      if (t >= 1) {
        state.cancel?.()
        surface.setState({ ...state, position: state.target, elapsed, cancel: null })
      } else surface.setState({ ...state, position, elapsed })
    })
    surface.setState({ ...current, from: current.position, target, started: current.elapsed, cancel })
  }
  const position = current?.position ?? target
  const steps = props.steps
  const segment = Math.max(3, Math.floor((Math.max(24, props.width) - steps.length) / steps.length))
  const runner = Math.round(position * segment + segment / 2)
  const cells: RenderElement[] = []
  steps.forEach((step, i) => {
    const colour = i < props.done ? props.doneColor : i === props.at ? props.runColor : props.waitColor
    let bar = ''
    for (let x = 0; x < segment; x += 1) bar += i * segment + x === runner ? '●' : i < props.done ? '━' : i === props.at ? '━' : '┄'
    cells.push(
      Box({
        flexDirection: 'column',
        width: segment + 1,
        children: [Text({ color: colour ?? undefined, children: bar }), Text({ color: colour ?? undefined, dimColor: i !== props.at, wrap: 'truncate-end', children: step })],
      }),
    )
  })
  return Box({ flexDirection: 'row', children: cells })
}
