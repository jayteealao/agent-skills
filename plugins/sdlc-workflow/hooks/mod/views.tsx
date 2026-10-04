/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ElementTable, RenderElement } from 'claude-code'

import { BACK_KEY, CLOSE_KEY, DRAFT_HINT_TEXT, FILTER_KEY, HINT_TEXT, MORE_KEY, NOTHING_TEXT, NO_MATCH_TEXT, OPTION_KEY_PREFIX } from './names.ts'
import { MAX_PAGE_SIZE, hotkeyOf } from './picker.ts'
import type { Option, Page } from './picker.ts'
import { pickerControlLabel, pickerPageText, pickerTitleView, rowPartsOf } from './styles/existing.tsx'
import { frameProps, say } from './styles/skin.tsx'
import { DEFAULT_VIEW_STYLE, paletteOf } from './styles/tokens.ts'
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
  /** The view style (E1): the words' case, the marks and the control labels; keys, hotkeys and order never change (Y3). */
  style?: ViewStyle
  palette?: Palette
  /** A row's name in its style; absent, the option's own name. */
  labelOf?: (option: Option) => string
  /** What a row draws beside its name: a state mark before it, a stage label and a note after it. */
  rowOf?: (option: Option) => { mark?: RenderElement; chip?: RenderElement; note?: string }
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
 * The picker's band, as a table (MOD-DESIGN 3.3):
 *
 * - a header: the breadcrumb of the command so far, the filter (a field, or
 *   the word being typed when the picker follows the box), then pinned right
 *   the page count, `back` past the first step, and `close`;
 * - one row per option, in fixed columns: the state mark, the hotkey and the
 *   name (one plain `Button`, the clickable part, in a fixed-width column),
 *   the stage label, and the quiet note that ends in an ellipsis;
 * - a footer: the hint, and `0 more` pinned right when the rows page.
 *
 * A row's hotkey is its digit, so a page holds nine rows at most.
 */
export function bandView(ui: Ui, model: BandModel, actions: BandActions): RenderElement {
  const { Box, Text, Button, Input } = ui
  const { items, page, pages } = model.page
  const style = model.style ?? DEFAULT_VIEW_STYLE
  const palette = model.palette ?? paletteOf(style, 'terminal', true)
  const empty = model.filter.trim() === '' ? NOTHING_TEXT : NO_MATCH_TEXT
  const label = (text: string) => pickerControlLabel(style, text)
  const nameOf = (option: Option) => rowPartsOf(model.labelOf === undefined ? option.label : model.labelOf(option))
  const nameWidth = Math.min(34, Math.max(8, ...items.map(option => nameOf(option).name.length + 6)))
  const pageText = pickerPageText(page, pages)
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        {pickerTitleView({ Text }, style, palette, model.title)}
        {model.isDraft === true ? (
          model.filter === '' ? null : <Text dimColor>{`${say(style, 'filter')}: ${model.filter}`}</Text>
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
        <Box flexGrow={1} />
        {pageText === null ? null : <Text dimColor>{pageText}</Text>}
        {model.hasBack ? <Button key={BACK_KEY} label={label('back')} dimColor onPress={() => actions.back()} /> : null}
        <Button key={CLOSE_KEY} label={label('close')} role="dismiss" dimColor onPress={() => actions.close()} />
      </Box>
      {items.length === 0 ? <Text dimColor>{empty}</Text> : null}
      {items.map((option, index) => {
        const hotkey = hotkeyOf(index)
        const { name, note: ownNote } = nameOf(option)
        const extra = model.rowOf?.(option) ?? {}
        const note = extra.note ?? ownNote
        return (
          <Box flexDirection="row" gap={1}>
            {extra.mark ?? null}
            <Box width={nameWidth} flexShrink={0}>
              <Button key={rowKeyOf(option.value)} {...(hotkey === undefined ? {} : { hotkey })} plain label={name} onPress={() => actions.pick(option.value)} />
            </Box>
            {extra.chip ?? null}
            {note === '' ? null : (
              <Box flexGrow={1} flexShrink={1}>
                <Text dimColor wrap="truncate-end">
                  {note}
                </Text>
              </Box>
            )}
          </Box>
        )
      })}
      <Box flexDirection="row" gap={1}>
        <Box flexGrow={1} flexShrink={1}>
          <Text dimColor wrap="truncate-end">
            {model.note ?? (model.isDraft === true ? DRAFT_HINT_TEXT : HINT_TEXT)}
          </Text>
        </Box>
        {pages > 1 ? <Button key={MORE_KEY} hotkey="0" plain label={label('more')} onPress={() => actions.more()} /> : null}
      </Box>
    </Box>
  )
}

/**
 * The band's own parts (the live line, the picker, the strip) as one card in
 * the style's frame: the card ground where the style paints one, and the
 * frame in the line colour. Style A on the terminal draws the parts as they are.
 */
export function bandCard(Box: Ui['Box'], palette: Palette, parts: readonly RenderElement[]): RenderElement {
  if (palette.frame === 'none') return Box({ flexDirection: 'column', children: [...parts] })
  return Box({ flexDirection: 'column', ...frameProps(palette), children: [...parts] })
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
