/**
 * The design system every view draws with (MOD-DESIGN, 2026-10-04): one
 * layout, three skins.
 *
 * - The ink layer: every word gets a colour from its own ground, so no word
 *   falls back to a surface colour that the style's ground hides.
 * - The skin parts: the stage label, the progress cells, the state mark, and
 *   the words' case. A style changes these, never the rows, the slots, the
 *   order or the hotkeys.
 */
import type { ElementTable, RenderElement } from 'claude-code'

import { GRID_INK, GRID_LIME, INSTRUMENT_ORANGE } from './tokens.ts'
import type { Palette, Tone, ViewStyle } from './tokens.ts'

type TextProps = Parameters<ElementTable<'terminal'>['Text']>[0]
type TextLike = (props: TextProps) => RenderElement

/**
 * The element table with the ink layer on its Text: a word with no colour
 * takes the palette's text colour, a dim word the palette's quiet colour.
 * Where the palette follows the surface (style A on the terminal) the table
 * is returned as it is.
 */
export function inked<T extends { Text: TextLike }>(ui: T, palette: Palette): T {
  if (palette.text === undefined) return ui
  const Text = ui.Text
  const ink = palette.text
  const quiet = palette.tones.quiet ?? ink
  const inkedText: TextLike = props => {
    if (props.color !== undefined) {
      if (props.dimColor !== true) return Text(props)
      // A coloured word stays its colour: dimming it would cost contrast.
      const { dimColor: _dim, ...rest } = props
      return Text(rest)
    }
    const { dimColor, ...rest } = props
    return Text({ ...rest, color: dimColor === true ? quiet : ink })
  }
  return { ...ui, Text: inkedText }
}

/** The words of a style: capitals for D and E. */
export function say(style: ViewStyle, text: string): string {
  return style === 'dashboard' ? text : text.toUpperCase()
}

/** A control's label: capitals for D, capitals and an arrow for E. */
export function controlLabel(style: ViewStyle, text: string): string {
  if (style === 'dashboard') return text
  return style === 'grid' ? `${text.toUpperCase()} ↗` : text.toUpperCase()
}

/** The stages the progress cells stand for, in lifecycle order. */
export const CELL_STAGES = ['intake', 'shape', 'slice', 'plan', 'implement', 'verify', 'review', 'ship'] as const

/** Where a stage sits among the cells: the cells done before it, and its own cell (-1 when none runs). */
export function stagePlaceOf(stage: string | null, isClosed: boolean): { done: number; at: number } {
  if (isClosed) return { done: CELL_STAGES.length, at: -1 }
  if (stage === null) return { done: 0, at: -1 }
  const alias: Record<string, string> = { design: 'shape', handoff: 'ship', 'ship-plan': 'ship' }
  if (stage === 'retro') return { done: CELL_STAGES.length, at: -1 }
  const index = CELL_STAGES.indexOf((alias[stage] ?? stage) as (typeof CELL_STAGES)[number])
  return index === -1 ? { done: 0, at: -1 } : { done: index, at: index }
}

/** The glyphs of the progress cells: done, running, waiting. */
function cellGlyphs(style: ViewStyle): { done: string; at: string; wait: string } {
  if (style === 'instrument') return { done: '■', at: '▣', wait: '□' }
  if (style === 'grid') return { done: '█', at: '▓', wait: '░' }
  return { done: '■', at: '■', wait: '□' }
}

/** Progress as cells: the done ones, the running one lit, the waiting ones quiet. */
export function cellsView(ui: { Text: TextLike }, style: ViewStyle, palette: Palette, done: number, at: number, total: number): RenderElement[] {
  const { Text } = ui
  const glyphs = cellGlyphs(style)
  const doneCount = Math.max(0, Math.min(total, done))
  const running = at >= 0 && at < total ? 1 : 0
  const waiting = Math.max(0, total - doneCount - running)
  const runColour = style === 'instrument' ? INSTRUMENT_ORANGE : palette.tones.run
  const out: RenderElement[] = []
  if (doneCount > 0) out.push(<Text color={style === 'dashboard' ? palette.tones.done : palette.text}>{glyphs.done.repeat(doneCount)}</Text>)
  if (running > 0) out.push(<Text color={runColour}>{glyphs.at}</Text>)
  if (waiting > 0) out.push(<Text color={palette.tones.quiet} {...(palette.tones.quiet === undefined ? { dimColor: true } : {})}>{glyphs.wait.repeat(waiting)}</Text>)
  return out
}

/** A state mark: a dot in A, a square in D and E, coloured by its tone. */
export function markView(ui: { Text: TextLike }, style: ViewStyle, palette: Palette, tone: Tone): RenderElement {
  const { Text } = ui
  const glyph =
    style === 'dashboard'
      ? tone === 'attention' || tone === 'intent'
        ? '◆'
        : tone === 'quiet'
          ? '○'
          : tone === 'stop'
            ? '■'
            : '●'
      : tone === 'quiet'
        ? '□'
        : '■'
  const colour = style === 'grid' && tone === 'attention' ? palette.tones.attention : palette.tones[tone]
  return <Text color={colour}>{glyph}</Text>
}

/**
 * A stage label: bold capitals in the tone's colour (A), the same in brackets
 * (D), or a solid block with light words, lime with ink for "needs you" (E).
 */
export function chipView(ui: { Text: TextLike }, style: ViewStyle, palette: Palette, tone: Tone, text: string): RenderElement {
  const { Text } = ui
  const words = text.toUpperCase()
  if (style === 'grid') {
    // "Needs you" is a black block with lime words: lime as a fill is 1.04:1 on the grey plate, and read as plain text.
    if (tone === 'attention') return <Text bold color={GRID_LIME} backgroundColor={GRID_INK}>{` ${words} `}</Text>
    if (tone === 'quiet') return <Text bold color={palette.tones.quiet}>{`[${words}]`}</Text>
    return <Text bold color="#ffffff" backgroundColor={palette.tones[tone] ?? GRID_INK}>{` ${words} `}</Text>
  }
  if (style === 'instrument') return <Text bold color={palette.tones[tone]}>{`[${words}]`}</Text>
  return (
    <Text bold color={palette.tones[tone]}>
      {words}
    </Text>
  )
}

/** The props of a framed card in a style: the ground, and the frame in the line colour. */
export function frameProps(palette: Palette): Record<string, unknown> {
  return {
    ...(palette.card === undefined ? {} : { backgroundColor: palette.card }),
    ...(palette.frame === 'none' ? {} : { borderStyle: palette.frame, ...(palette.line === undefined ? {} : { borderColor: palette.line }) }),
  }
}
