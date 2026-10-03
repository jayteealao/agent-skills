/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ElementTable, RenderElement } from 'claude-code'

import { BACK_KEY, CLOSE_KEY, DRAFT_HINT_TEXT, FILTER_KEY, HINT_TEXT, MORE_KEY, NOTHING_TEXT, NO_MATCH_TEXT, OPTION_KEY_PREFIX } from './names.ts'
import { MAX_PAGE_SIZE, hotkeyOf } from './picker.ts'
import type { Option, Page } from './picker.ts'
import { pickerControlLabel, pickerTitleView } from './styles/existing.tsx'
import { DEFAULT_VIEW_STYLE, paletteOf, quietOf } from './styles/tokens.ts'
import type { Palette, ViewStyle } from './styles/tokens.ts'

/** The element constructors the band draws with; the terminal carries all four. */
export type Ui = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Button' | 'Input'>

export type BandModel = {
  title: string
  /** The rows on screen; each carries the hotkey of its position. */
  page: Page
  /** The filter text drawn in the field. */
  filter: string
  /** A line drawn dim under the list, in place of the key hint. */
  note?: string
  /** True when a step lies before this one, so the band draws `back`. */
  hasBack: boolean
  /** The view style (E1): the title, the row marks and the control labels; keys, hotkeys and order never change (Y3). */
  style?: ViewStyle
  palette?: Palette
  /** A row's label with its style mark; absent, the option's own label. */
  labelOf?: (option: Option) => string
  /**
   * True when the picker follows the prompt box: the box keeps the keys, so
   * the band draws no field of its own (an autofocused one would take them)
   * and shows the word being typed instead.
   */
  isDraft?: boolean
}

export type BandActions = {
  pick: (value: string) => void
  more: () => void
  close: () => void
  back: () => void
  filter: (text: string) => void
  submit: (text: string) => void
}

/** The element key of the row for one option value. */
export function rowKeyOf(value: string): string {
  return `${OPTION_KEY_PREFIX}${value}`
}

/**
 * The picker's band: a title row (the title, a filter field, `0: more` when
 * the rows do not fit one page, `back` past the first step, and `close`),
 * one plain `Button` per row, and a dim hint.
 *
 * A row's hotkey is its digit, so a page holds nine rows at most: a digit
 * pressed in an empty composer picks the row without the band holding the
 * keyboard. The filter field takes the ring when the band takes the keyboard
 * (a click, or ctrl+x tab): typing narrows the rows, Enter picks the first
 * row left, a digit then Enter picks that row of the page shown (`0` turns
 * the page), Tab moves the ring onto the rows.
 */
export function bandView(ui: Ui, model: BandModel, actions: BandActions): RenderElement {
  const { Box, Text, Button, Input } = ui
  const { items, page, pages } = model.page
  const style = model.style ?? DEFAULT_VIEW_STYLE
  const palette = model.palette ?? paletteOf(style, 'terminal', true)
  const empty = model.filter.trim() === '' ? NOTHING_TEXT : NO_MATCH_TEXT
  const label = (text: string) => pickerControlLabel(style, text)
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={2}>
        <Box flexDirection="row" gap={1}>
          {pickerTitleView({ Text }, style, palette, model.title, page, pages)}
        </Box>
        {model.isDraft === true ? (
          model.filter === '' ? null : <Text {...quietOf(palette)}>{`filter: ${model.filter}`}</Text>
        ) : (
          <Input
            key={FILTER_KEY}
            placeholder="filter"
            value={model.filter}
            submitLabel="pick"
            autoFocus
            onInput={text => actions.filter(text)}
            onSubmit={text => actions.submit(text)}
          />
        )}
        {pages > 1 ? <Button key={MORE_KEY} hotkey="0" plain label={label('more')} onPress={() => actions.more()} /> : null}
        {model.hasBack ? <Button key={BACK_KEY} label={`← ${label('back')}`} dimColor onPress={() => actions.back()} /> : null}
        <Button key={CLOSE_KEY} label={label('close')} role="dismiss" dimColor onPress={() => actions.close()} />
      </Box>
      {items.length === 0 ? <Text {...quietOf(palette)}>{empty}</Text> : null}
      {items.map((option, index) => {
        const hotkey = hotkeyOf(index)
        return (
          <Button
            key={rowKeyOf(option.value)}
            {...(hotkey === undefined ? {} : { hotkey })}
            plain
            label={model.labelOf === undefined ? option.label : model.labelOf(option)}
            onPress={() => actions.pick(option.value)}
          />
        )
      })}
      <Text wrap="truncate-end" {...quietOf(palette)}>
        {model.note ?? (model.isDraft === true ? DRAFT_HINT_TEXT : HINT_TEXT)}
      </Text>
    </Box>
  )
}

/**
 * The band's own parts (the live line, the picker, the strip) as one card in
 * the style's colours: the card ground and a rounded border in the line
 * colour. A style that follows the surface (style A on the terminal) draws
 * the parts as they are.
 */
export function bandCard(Box: Ui['Box'], palette: Palette, parts: readonly RenderElement[]): RenderElement {
  if (palette.card === undefined) return Box({ flexDirection: 'column', children: [...parts] })
  return Box({ flexDirection: 'column', backgroundColor: palette.card, borderStyle: 'round', ...(palette.line === undefined ? {} : { borderColor: palette.line }), children: [...parts] })
}

/** The band's tree over whatever the hooks beneath drew there. */
export function stack(Box: Ui['Box'], below: RenderElement, band: RenderElement): RenderElement {
  return Box({ flexDirection: 'column', children: [below, band] })
}

/**
 * Rows one page may hold so the whole band fits `maxRows`: under the title
 * row and above the hint row, at most nine (one digit each). A band taller
 * than `maxRows` scrolls, and a scrolling band arms no digit.
 */
export function pageSizeOf(maxRows: number): number {
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(maxRows) - 2))
}
