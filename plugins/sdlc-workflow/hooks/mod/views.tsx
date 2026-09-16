/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ElementTable, RenderElement } from 'claude-code'

import { CLOSE_KEY, HINT_TEXT, PICK_KEY } from './names.ts'
import type { Option } from './picker.ts'

/** The element constructors the band draws with; the terminal carries all four. */
export type Ui = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Select' | 'Button'>

export type BandModel = {
  title: string
  options: readonly Option[]
  /** The value the Select opens on; the first option when absent. */
  value?: string
  /** A line drawn dim under the list, in place of the key hint. */
  note?: string
}

export type BandActions = {
  pick: (value: string) => void
  close: () => void
}

/** The picker's band: a title, the list, a dim hint, and a close button. */
export function bandView(ui: Ui, model: BandModel, actions: BandActions): RenderElement {
  const { Box, Text, Select, Button } = ui
  const options = model.options.length > 0 ? model.options : [{ value: '', label: '(nothing to pick)' }]
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        <Text bold>{model.title}</Text>
        <Button key={CLOSE_KEY} label="close" dimColor onPress={() => actions.close()} />
      </Box>
      <Select
        key={PICK_KEY}
        options={options}
        value={model.value ?? options[0]?.value}
        autoFocus
        onSelect={value => actions.pick(value)}
      />
      <Text dimColor>{model.note ?? HINT_TEXT}</Text>
    </Box>
  )
}

/** The band's tree over whatever the hooks beneath drew there. */
export function stack(Box: Ui['Box'], below: RenderElement, band: RenderElement): RenderElement {
  return Box({ flexDirection: 'column', children: [below, band] })
}
