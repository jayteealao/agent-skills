/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ElementTable, RenderElement } from 'claude-code'

import { CLOSE_KEY, HINT_TEXT, MORE_KEY, OPTION_KEY_PREFIX } from './names.ts'
import type { Page } from './picker.ts'

/** The element constructors the band draws with; the terminal carries all three. */
export type Ui = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Button'>

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
 * The picker's band: a title, one numbered row per option, a "more" row when
 * the options do not fit one page, a dim hint, and a close button.
 *
 * Each row is a plain `Button` with a one-digit hotkey: a digit pressed in
 * an empty composer picks the row without the band holding the keyboard.
 * Once the band has the keys (a click, or ctrl+x tab), the arrow keys move
 * between the rows and Enter presses one.
 */
export function bandView(ui: Ui, model: BandModel, actions: BandActions): RenderElement {
  const { Box, Text, Button } = ui
  const { items, page, pages } = model.page
  const title = pages > 1 ? `${model.title}  (page ${page + 1} of ${pages})` : model.title
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        <Text bold>{title}</Text>
        <Button key={CLOSE_KEY} label="close" dimColor onPress={() => actions.close()} />
      </Box>
      {items.length === 0 ? <Text dimColor>(nothing to pick)</Text> : null}
      {items.map((option, index) => (
        <Button
          key={`${OPTION_KEY_PREFIX}${option.value}`}
          hotkey={String(index + 1)}
          plain
          label={option.label}
          onPress={() => actions.pick(option.value)}
        />
      ))}
      {pages > 1 ? <Button key={MORE_KEY} hotkey="0" plain label="more" onPress={() => actions.more()} /> : null}
      <Text dimColor>{model.note ?? HINT_TEXT}</Text>
    </Box>
  )
}

/** The band's tree over whatever the hooks beneath drew there. */
export function stack(Box: Ui['Box'], below: RenderElement, band: RenderElement): RenderElement {
  return Box({ flexDirection: 'column', children: [below, band] })
}

/** Rows one page may hold so the whole band fits `maxRows`: at most nine, for the digits. */
export function pageSizeOf(maxRows: number, hasPages: boolean): number {
  const chrome = hasPages ? 3 : 2
  return Math.max(1, Math.min(9, Math.floor(maxRows) - chrome))
}
