/**
 * The three view styles and their colours (WF-LIVE-VIEWS-PLAN.md 8, 14.3).
 *
 * One setting, `viewStyle`, styles every view the plugin draws: the live
 * pane, the picker band, the strip, the hub notice and the workflows
 * dashboard (V3). A style changes how a view looks, never what it shows (L1).
 */
import type { SdlcTone, SdlcViewStyle } from '../../../types'

export type ViewStyle = SdlcViewStyle
export type Tone = SdlcTone

export const VIEW_STYLES: readonly ViewStyle[] = ['dashboard', 'instrument', 'grid']
export const DEFAULT_VIEW_STYLE: ViewStyle = 'dashboard'

/** The style a stored value names; a value outside the options counts as unset (V1). */
export function viewStyleOf(value: unknown): ViewStyle {
  return typeof value === 'string' && (VIEW_STYLES as readonly string[]).includes(value) ? (value as ViewStyle) : DEFAULT_VIEW_STYLE
}

/** The style after this one, for the pane's style button (V4). */
export function nextViewStyle(style: ViewStyle): ViewStyle {
  const index = VIEW_STYLES.indexOf(style)
  return VIEW_STYLES[(index + 1) % VIEW_STYLES.length] as ViewStyle
}

/**
 * The colours of one style. `undefined` draws the surface's own colour.
 *
 * Style A uses theme keys, so it follows the person's terminal theme (Y6).
 * Styles D and E use the raw colours of section 8.
 */
export type Palette = {
  /** The pane's own ground, or undefined to leave the surface's. */
  ground: string | undefined
  /** The ground of a card or a section, or undefined. */
  card: string | undefined
  text: string | undefined
  line: string | undefined
  tones: Record<Tone, string | undefined>
  /** True for a style drawn light on a dark ground. */
  isDark: boolean
}

const DASHBOARD: Palette = {
  ground: undefined,
  card: undefined,
  text: undefined,
  line: 'inactive',
  tones: { done: 'success', run: 'suggestion', attention: 'warning', stop: 'error', intent: 'permission', quiet: 'inactive', plain: undefined },
  isDark: true,
}

/** Style A on the desktop: section 8.1's raw colours, because a page has no terminal theme. */
const DASHBOARD_DESKTOP: Palette = {
  ground: '#080b10',
  card: '#0f141c',
  text: '#d9dfe9',
  line: '#232b37',
  tones: { done: '#4ade80', run: '#60a5fa', attention: '#fbbf24', stop: '#f87171', intent: '#a78bfa', quiet: '#7c8696', plain: '#d9dfe9' },
  isDark: true,
}

const INSTRUMENT: Palette = {
  ground: '#0a0a0a',
  card: '#151515',
  text: '#ececec',
  line: '#2a2a2a',
  tones: { done: '#3ee6a8', run: '#ececec', attention: '#ff4a1c', stop: '#ff4a1c', intent: '#ff4a1c', quiet: '#8a8a8a', plain: '#ececec' },
  isDark: true,
}

const GRID_LIGHT: Palette = {
  ground: '#f4f4f2',
  card: '#ffffff',
  text: '#0d0d0d',
  line: '#d2d2cd',
  tones: { done: '#0d0d0d', run: '#7b5cff', attention: '#5f7a00', stop: '#ff3b30', intent: '#7b5cff', quiet: '#7a7a74', plain: '#0d0d0d' },
  isDark: false,
}

/**
 * Style E inverted for a dark terminal theme (Y7): an ink ground with the
 * same accents. Lime reads on ink, so "needs you" keeps its lime.
 */
const GRID_DARK: Palette = {
  ground: undefined,
  card: undefined,
  text: '#f4f4f2',
  line: '#3a3a36',
  tones: { done: '#f4f4f2', run: '#9d86ff', attention: '#d7ff3a', stop: '#ff3b30', intent: '#9d86ff', quiet: '#8f8f88', plain: '#f4f4f2' },
  isDark: true,
}

/** The lime of style E, for tags drawn as a filled block. */
export const GRID_LIME = '#d7ff3a'
export const GRID_PURPLE = '#7b5cff'
export const GRID_INK = '#0d0d0d'
export const INSTRUMENT_ORANGE = '#ff4a1c'

/**
 * The palette of a style on a surface. `isDarkTheme` is the person's theme
 * row (Y7); it changes style E on the terminal only.
 */
export function paletteOf(style: ViewStyle, surface: string, isDarkTheme: boolean): Palette {
  if (style === 'instrument') return INSTRUMENT
  if (style === 'grid') return surface === 'terminal' && isDarkTheme ? GRID_DARK : GRID_LIGHT
  return surface === 'terminal' ? DASHBOARD : DASHBOARD_DESKTOP
}

/**
 * The text colour of a style's own words: none where the style follows the
 * surface (style A on the terminal), else the palette's text colour, so words
 * stay readable on the style's card.
 */
export function inkOf(palette: Palette): { color?: string } {
  return palette.text === undefined ? {} : { color: palette.text }
}

/** The colour of a style's quiet words: dim on the surface's colours, else the palette's quiet tone. */
export function quietOf(palette: Palette): { color?: string; dimColor?: boolean } {
  return palette.text === undefined ? { dimColor: true } : { color: palette.tones.quiet }
}

/** Rows the band card's border takes: two where the style draws a card, none where it follows the surface. */
export function cardRowsOf(palette: Palette): number {
  return palette.card === undefined ? 0 : 2
}

/** True when a theme row's value names a dark theme; an unknown value counts as dark, the terminal default. */
export function isDarkThemeOf(value: unknown): boolean {
  if (typeof value !== 'string') return true
  return !/light/iu.test(value)
}
