/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ElementTable, RenderElement } from 'claude-code'

import { BACK_KEY, CLOSE_KEY, FILTER_KEY, HINT_TEXT, MORE_KEY, NOTHING_TEXT, NO_MATCH_TEXT, OPTION_KEY_PREFIX } from './names.ts'
import { MAX_PAGE_SIZE, hotkeyOf } from './picker.ts'
import type { Page } from './picker.ts'

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
  const title = pages > 1 ? `${model.title}  (page ${page + 1} of ${pages})` : model.title
  const empty = model.filter.trim() === '' ? NOTHING_TEXT : NO_MATCH_TEXT
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={2}>
        <Text bold>{title}</Text>
        <Input
          key={FILTER_KEY}
          placeholder="filter"
          value={model.filter}
          submitLabel="pick"
          autoFocus
          onInput={text => actions.filter(text)}
          onSubmit={text => actions.submit(text)}
        />
        {pages > 1 ? <Button key={MORE_KEY} hotkey="0" plain label="more" onPress={() => actions.more()} /> : null}
        {model.hasBack ? <Button key={BACK_KEY} label="← back" dimColor onPress={() => actions.back()} /> : null}
        <Button key={CLOSE_KEY} label="close" dimColor onPress={() => actions.close()} />
      </Box>
      {items.length === 0 ? <Text dimColor>{empty}</Text> : null}
      {items.map((option, index) => {
        const hotkey = hotkeyOf(index)
        return (
          <Button
            key={rowKeyOf(option.value)}
            {...(hotkey === undefined ? {} : { hotkey })}
            plain
            label={option.label}
            onPress={() => actions.pick(option.value)}
          />
        )
      })}
      <Text dimColor wrap="truncate-end">
        {model.note ?? HINT_TEXT}
      </Text>
    </Box>
  )
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
