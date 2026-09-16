/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ElementTable, RenderElement } from 'claude-code'

import { CLOSE_KEY, HINT_TEXT, MORE_KEY, OPTION_KEY_PREFIX, PICK_KEY } from './names.ts'
import { pageOf } from './picker.ts'
import type { Option, Page } from './picker.ts'

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
 * The picker's band: a title, a `Select` over one page of options, a key
 * row of digit Buttons, a dim hint, and a close button.
 *
 * The `Select` takes the arrows once the band has the keyboard (a click, or
 * ctrl+x tab): arrows move, Enter picks. Each Button in the key row carries
 * the digit of its row: a digit pressed in an empty composer picks that row
 * without the band holding the keyboard. A `0: more` Button turns the page.
 */
export function bandView(ui: Ui, model: BandModel, actions: BandActions): RenderElement {
  const { Box, Text, Button, Select } = ui
  const { items, page, pages } = model.page
  const title = pages > 1 ? `${model.title}  (page ${page + 1} of ${pages})` : model.title
  const options = items.length > 0 ? items : [{ value: '', label: '(nothing to pick)' }]
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        <Text bold>{title}</Text>
        <Button key={CLOSE_KEY} label="close" dimColor onPress={() => actions.close()} />
      </Box>
      <Select
        key={PICK_KEY}
        options={options.map((option, index) => ({ value: option.value, label: `${index + 1}  ${option.label}` }))}
        value={options[0]?.value}
        autoFocus
        onSelect={value => {
          if (value !== '') actions.pick(value)
        }}
      />
      <Box flexDirection="row" flexWrap="wrap" gap={2}>
        {items.map((option, index) => (
          <Button
            key={`${OPTION_KEY_PREFIX}${option.value}`}
            hotkey={String(index + 1)}
            plain
            label={option.short}
            onPress={() => actions.pick(option.value)}
          />
        ))}
        {pages > 1 ? <Button key={MORE_KEY} hotkey="0" plain label="more" onPress={() => actions.more()} /> : null}
      </Box>
      <Text dimColor>{model.note ?? HINT_TEXT}</Text>
    </Box>
  )
}

/** The band's tree over whatever the hooks beneath drew there. */
export function stack(Box: Ui['Box'], below: RenderElement, band: RenderElement): RenderElement {
  return Box({ flexDirection: 'column', children: [below, band] })
}

/** Cells a plain Button takes in the key row: the digit, a colon, a space, the label. */
function keyCellsOf(short: string): number {
  return 3 + short.length
}

/** Rows the key row takes at `columns` wide, with two cells between the keys. */
export function keyRowsOf(shorts: readonly string[], columns: number): number {
  const width = Math.max(1, Math.floor(columns))
  let rows = 1
  let used = 0
  for (const short of shorts) {
    const cells = keyCellsOf(short)
    const next = used === 0 ? cells : used + 2 + cells
    if (next <= width || used === 0) {
      used = next
    } else {
      rows += 1
      used = cells
    }
  }
  return rows
}

/**
 * The widest page that keeps the whole band inside `maxRows` at `columns`
 * wide, at most nine rows for the digits: the Select's rows, plus the title
 * row, the key row (which wraps on a narrow band), and the hint row. A band
 * taller than `maxRows` scrolls, and a scrolling band arms no digit.
 */
export function fitPage(options: readonly Option[], page: number, maxRows: number, columns: number): Page {
  for (let size = 9; size > 1; size -= 1) {
    const candidate = pageOf(options, page, size)
    const shorts = [...candidate.items.map(item => item.short), ...(candidate.pages > 1 ? ['more'] : [])]
    if (size + 2 + keyRowsOf(shorts, columns) <= Math.floor(maxRows)) return candidate
  }
  return pageOf(options, page, 1)
}
