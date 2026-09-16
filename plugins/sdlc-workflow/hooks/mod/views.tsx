/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ElementTable, RenderElement } from 'claude-code'

import { CLOSE_KEY, HINT_TEXT, MORE_KEY, OPTION_KEY_PREFIX, PICK_KEY } from './names.ts'
import type { Page } from './picker.ts'

/** The element constructors the band draws with; the terminal carries all four. */
export type Ui = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Button' | 'Select'>

export type BandModel = {
  title: string
  /** The rows on screen; each carries the digit hotkey of its position. */
  page: Page
  /** A line drawn dim under the list, in place of the key hint. */
  note?: string
}

export type BandActions = {
  pick: (value: string) => void
  more: () => void
  close: () => void
}

/**
 * The picker's band: a title row, a column of digits beside a `Select` over
 * one page of options, and a dim hint.
 *
 * The `Select` takes the arrows once the band has the keyboard (a click, or
 * ctrl+x tab): arrows move, Enter picks. Each digit is a plain `Button` with
 * no label, drawn on the row it picks: a digit pressed in an empty composer
 * picks that row without the band holding the keyboard. When the options do
 * not fit one page, a `0: more` Button in the title row turns the page.
 */
export function bandView(ui: Ui, model: BandModel, actions: BandActions): RenderElement {
  const { Box, Text, Button, Select } = ui
  const { items, page, pages } = model.page
  const title = pages > 1 ? `${model.title}  (page ${page + 1} of ${pages})` : model.title
  const options = items.length > 0 ? items : [{ value: '', label: '(nothing to pick)' }]
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={2}>
        <Text bold>{title}</Text>
        {pages > 1 ? <Button key={MORE_KEY} hotkey="0" plain label="more" onPress={() => actions.more()} /> : null}
        <Button key={CLOSE_KEY} label="close" dimColor onPress={() => actions.close()} />
      </Box>
      <Box flexDirection="row" gap={1}>
        <Box flexDirection="column">
          {items.map((option, index) => (
            <Button
              key={`${OPTION_KEY_PREFIX}${option.value}`}
              hotkey={String(index + 1)}
              plain
              label=""
              onPress={() => actions.pick(option.value)}
            />
          ))}
        </Box>
        <Select
          key={PICK_KEY}
          options={options.map(option => ({ value: option.value, label: option.label }))}
          value={options[0]?.value}
          autoFocus
          onSelect={value => {
            if (value !== '') actions.pick(value)
          }}
        />
      </Box>
      <Text dimColor>{model.note ?? HINT_TEXT}</Text>
    </Box>
  )
}

/** The band's tree over whatever the hooks beneath drew there. */
export function stack(Box: Ui['Box'], below: RenderElement, band: RenderElement): RenderElement {
  return Box({ flexDirection: 'column', children: [below, band] })
}

/**
 * Rows one page may hold so the whole band fits `maxRows`: at most nine, for
 * the digits, under the title row and above the hint row. A band taller than
 * `maxRows` scrolls, and a scrolling band arms no digit.
 */
export function pageSizeOf(maxRows: number): number {
  return Math.max(1, Math.min(9, Math.floor(maxRows) - 2))
}
