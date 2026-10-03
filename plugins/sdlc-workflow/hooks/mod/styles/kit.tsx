/**
 * What every style shares (WF-LIVE-VIEWS-PLAN.md 8, K4): the element table a
 * renderer draws with, the pane's view state, the actions, the element keys,
 * and the band's live line, which keeps one layout in every style so the
 * hotkeys stay in the same places (Q2).
 */
import type { ElementTable, RenderElement } from 'claude-code'

import type { SdlcLiveBand, SdlcNeed, SdlcStageMark } from '../../../types'
import type { ViewFacts } from './facts.ts'
import type { Palette, Tone, ViewStyle } from './tokens.ts'

type Terminal = ElementTable<'terminal'>
type Desktop = ElementTable<'desktop'>

/** The elements a renderer draws with; `Svg` and `Client` only where the surface has them. */
export type StyleUi = Pick<Terminal, 'Box' | 'Text' | 'Button' | 'Markdown'> & { Svg?: Desktop['Svg']; Client?: Terminal['Client'] }

/** The renderer's table from the surface's: the optional elements only where the surface carries them. */
export function styleUiOf(table: unknown): StyleUi {
  const t = table as Record<string, unknown>
  const ui = { Box: t['Box'], Text: t['Text'], Button: t['Button'], Markdown: t['Markdown'] } as StyleUi
  if (typeof t['Svg'] === 'function') ui.Svg = t['Svg'] as Desktop['Svg']
  if (typeof t['Client'] === 'function') ui.Client = t['Client'] as Terminal['Client']
  return ui
}

/** What a pane draws besides the facts: the surface, the time, the details state, the tabs. */
export type PaneView = {
  surface: string
  now: number
  columns: number
  details: boolean
  /** Sections a need opened (V8): drawn even with details off. */
  opened: readonly string[]
  tabs: ReadonlyArray<{ kind: string; slug: string; isCurrent: boolean }>
  /** False hides the style button: a locked row (V6). */
  hasStyleButton: boolean
  style: ViewStyle
  palette: Palette
}

export type LiveActions = {
  control: (key: string) => void
  need: (id: string, action: string) => void
  details: () => void
  style: () => void
  tab: (kind: string, slug: string) => void
}

/** The element keys of the live pane: the tests press them, and every style uses the same ones (T5). */
export const LIVE_KEYS = {
  control: (key: string) => `live:control:${key}`,
  need: (id: string, action: string) => `live:need:${id}:${action}`,
  details: 'live:details',
  style: 'live:style',
  tab: (kind: string, slug: string) => `live:tab:${kind}:${slug}`,
  band: (key: string) => `live:band:${key}`,
  open: 'live:band:open',
}

/** The key of the Box that carries one fact (T5): every style wraps the same facts in the same keys. */
export const factKey = (name: string) => `fact:${name}`

/** The colour of a tone in a palette. */
export function toneColor(palette: Palette, tone: Tone): string | undefined {
  return palette.tones[tone]
}

/** The glyph of a stage mark, per style. */
export function markGlyph(style: ViewStyle, mark: SdlcStageMark): string {
  if (style === 'instrument') return mark === 'done' ? '■' : mark === 'run' ? '▣' : mark === 'stop' ? '▧' : '□'
  if (style === 'grid') return mark === 'done' ? '██' : mark === 'run' ? '▓▓' : mark === 'stop' ? '╳╳' : '░░'
  return mark === 'done' ? '●' : mark === 'run' ? '◉' : mark === 'stop' ? '✕' : '○'
}

/** The tone of a stage mark. */
export function markTone(mark: SdlcStageMark): Tone {
  return mark === 'done' ? 'done' : mark === 'run' ? 'run' : mark === 'stop' ? 'stop' : 'quiet'
}

/** The facts the pane keeps in every style, whatever the details state: the keys T5 compares. */
export function coreFactNames(facts: ViewFacts): string[] {
  return ['focus', 'liveness', ...facts.groups.map(group => `group:${group.key}`), ...facts.needs.map(need => `need:${need.id}`), ...facts.meters.map(meter => `meter:${meter.key}`), ...facts.controls.map(control => `control:${control.key}`)]
}

/** The actions of a need as Buttons; a link action is a Markdown link, which opens a file. */
export function needActions(ui: StyleUi, need: SdlcNeed, act: LiveActions, options: { upper: boolean; arrow: boolean; primaryFirst: boolean }): RenderElement[] {
  const { Button, Markdown } = ui
  return need.actions.map((action, index) => {
    const label = `${options.upper ? action.label.toUpperCase() : action.label}${options.arrow ? ' ↗' : ''}`
    if (action.kind === 'link' && action.path !== undefined) {
      return <Markdown text={`[${label}](${fileUrlOf(action.path)})`} dimColor />
    }
    return <Button key={LIVE_KEYS.need(need.id, action.key)} label={label} {...(options.primaryFirst && index === 0 ? { variant: 'primary' as const } : { dimColor: true })} onPress={() => act.need(need.id, action.key)} />
  })
}

/** A `file:` URL for a path, as Markdown draws a link the surface opens. */
export function fileUrlOf(path: string): string {
  const slashed = path.replace(/\\/gu, '/')
  const absolute = /^[A-Za-z]:/u.test(slashed) ? `/${slashed}` : slashed
  return `file://${absolute.split('/').map(part => encodeURIComponent(part).replace(/%3A/gu, ':')).join('/')}`
}

/** The tab row of a pane that follows several drivers (O3). */
export function tabRow(ui: StyleUi, view: PaneView, act: LiveActions, upper: boolean): RenderElement | null {
  if (view.tabs.length < 2) return null
  const { Box, Button } = ui
  return (
    <Box flexDirection="row" gap={1}>
      {view.tabs.map(tab => (
        <Button key={LIVE_KEYS.tab(tab.kind, tab.slug)} label={upper ? `${tab.kind} · ${tab.slug}`.toUpperCase() : `${tab.kind} · ${tab.slug}`} {...(tab.isCurrent ? {} : { dimColor: true })} onPress={() => act.tab(tab.kind, tab.slug)} />
      ))}
    </Box>
  )
}

/** The pane's own buttons: details (hotkey d) and style (hotkey s, absent on a locked row). */
export function paneButtons(ui: StyleUi, view: PaneView, act: LiveActions, labels: { details: string; style: string }): RenderElement[] {
  const { Button } = ui
  const out: RenderElement[] = [<Button key={LIVE_KEYS.details} hotkey="d" label={labels.details} dimColor onPress={() => act.details()} />]
  if (view.hasStyleButton) out.push(<Button key={LIVE_KEYS.style} hotkey="s" label={labels.style} dimColor onPress={() => act.style()} />)
  return out
}

/**
 * The band's live line (K3): the focus and up to two primary actions, hotkeys
 * `1` and `2`. One layout in every style; the style gives only the colours.
 */
export function liveBandView(ui: Pick<Terminal, 'Box' | 'Text' | 'Button'>, band: SdlcLiveBand, palette: Palette, open: () => void, press: (key: string) => void): RenderElement {
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="row" gap={1} paddingX={1}>
      <Text color={palette.tones[band.tone]}>{band.tone === 'stop' ? '■' : band.tone === 'attention' || band.tone === 'intent' ? '◆' : '●'}</Text>
      <Text wrap="truncate-end">{band.focus}</Text>
      {band.actions.map((action, index) => (
        <Button key={LIVE_KEYS.band(action.key)} hotkey={action.hotkey} label={action.label} {...(index === 0 ? { variant: 'primary' as const } : { dimColor: true })} onPress={() => press(action.key)} />
      ))}
      {band.isPaneSeated ? null : <Button key={LIVE_KEYS.open} label="live view" dimColor onPress={() => open()} />}
    </Box>
  )
}
