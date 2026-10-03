/**
 * Dot-matrix numerals of style D (WF-LIVE-VIEWS-PLAN.md 8.2, 5.6): a word in
 * 5×7 glyphs packed into braille. When the value changes, the dots shimmer
 * for 0.4 s (each dot lights after a delay of its own, at most 260 ms), then
 * the glyph is still.
 *
 * A `Client` region; it moves only on its own `every` timer (N2).
 */
import type { ClientSurface, JsonValue, RenderElement } from 'claude-code'

import { brailleOf, dotRowsOf } from '../glyphs.ts'

export type DotsProps = { text: string; color: string | null }

type DotsState = { text: string; elapsed: number; cancel: (() => void) | null }

const SHIMMER_MS = 400
const FRAME_MS = 80

/** The delay of one dot, from its place: the same word always shimmers the same way. */
function delayOf(x: number, y: number): number {
  return ((x * 7 + y * 13) % 27) * 10
}

export default function Dots(rawProps: JsonValue, surface: ClientSurface<DotsState>): RenderElement {
  const props = rawProps as unknown as DotsProps
  const { Box, Text } = surface.elements
  const current = surface.state
  if (current === undefined) {
    surface.setState({ text: props.text, elapsed: SHIMMER_MS, cancel: null })
  } else if (current.text !== props.text && current.cancel === null) {
    const cancel = surface.every(FRAME_MS, () => {
      const state = surface.state
      if (state === undefined) return
      const elapsed = state.elapsed + FRAME_MS
      if (elapsed >= SHIMMER_MS) {
        state.cancel?.()
        surface.setState({ ...state, elapsed: SHIMMER_MS, cancel: null })
      } else surface.setState({ ...state, elapsed })
    })
    surface.setState({ text: props.text, elapsed: 0, cancel })
  }
  const elapsed = current?.text === props.text ? current.elapsed : 0
  const rows = dotRowsOf(props.text).map((row, y) => [...row].map((cell, x) => (cell === '#' && delayOf(x, y) <= elapsed ? '#' : ' ')).join(''))
  const lines = brailleOf(rows)
  return Box({ flexDirection: 'column', children: lines.map(line => Text({ color: props.color ?? undefined, children: line })) })
}
