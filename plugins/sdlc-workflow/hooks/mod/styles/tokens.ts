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
 * Style A on the terminal uses theme keys, so it follows the person's terminal
 * theme (Y6). Everywhere else the styles follow a light ground (the Desktop
 * app's, or their own light plate), and every colour passes WCAG AA (4.5:1)
 * on that ground (MOD-DESIGN, 2026-10-04).
 */
export type Palette = {
  /** The pane's own ground, or undefined to leave the surface's. */
  ground: string | undefined
  /** The ground of the band card, or undefined to leave the surface's. */
  card: string | undefined
  /** The colour of every word; undefined leaves the surface's (style A on the terminal). */
  text: string | undefined
  line: string | undefined
  tones: Record<Tone, string | undefined>
  /** The frame of the band card: none, a hairline, a plate's single line, or a heavy line. */
  frame: 'none' | 'round' | 'single' | 'bold'
  /** True for a style drawn light on a dark ground. */
  isDark: boolean
}

const DASHBOARD: Palette = {
  ground: undefined,
  card: undefined,
  text: undefined,
  line: 'inactive',
  tones: { done: 'success', run: 'suggestion', attention: 'warning', stop: 'error', intent: 'permission', quiet: 'inactive', plain: undefined },
  frame: 'none',
  isDark: true,
}

/** Style A on the Desktop app: no painted ground, a hairline frame, the app's ink, AA accents. */
const DASHBOARD_LIGHT: Palette = {
  ground: undefined,
  card: undefined,
  text: '#1f1e1b',
  line: '#d9d6cc',
  tones: { done: '#15803d', run: '#1d4ed8', attention: '#b45309', stop: '#b91c1c', intent: '#6d28d9', quiet: '#5f6672', plain: '#1f1e1b' },
  frame: 'round',
  isDark: false,
}

/** Style D: white plates, hairline frames, black ink, one orange signal. */
const INSTRUMENT: Palette = {
  ground: '#ffffff',
  card: '#ffffff',
  text: '#111111',
  line: '#c8c8c8',
  tones: { done: '#0f7b55', run: '#111111', attention: '#c2410c', stop: '#c2410c', intent: '#c2410c', quiet: '#666666', plain: '#111111' },
  frame: 'single',
  isDark: false,
}

/** Style E: a warm grey plate in a heavy black frame, purple for what runs, lime (with ink on it) for what needs you. */
const GRID: Palette = {
  ground: '#f4f4f2',
  card: '#f4f4f2',
  text: '#0d0d0d',
  line: '#0d0d0d',
  tones: { done: '#0d0d0d', run: '#5b3fd9', attention: '#4d6300', stop: '#c4271b', intent: '#5b3fd9', quiet: '#5f5f5a', plain: '#0d0d0d' },
  frame: 'bold',
  isDark: false,
}

/** The lime of style E, always a fill with ink on it. */
export const GRID_LIME = '#d7ff3a'
export const GRID_PURPLE = '#5b3fd9'
export const GRID_INK = '#0d0d0d'
export const INSTRUMENT_ORANGE = '#c2410c'

/**
 * The palette of a style on a surface. Style A follows the terminal theme on
 * the terminal and the light app elsewhere; D and E draw their light plates
 * everywhere. `isDarkTheme` is kept for callers; no palette reads it now.
 */
export function paletteOf(style: ViewStyle, surface: string, _isDarkTheme: boolean): Palette {
  if (style === 'instrument') return INSTRUMENT
  if (style === 'grid') return GRID
  return surface === 'terminal' ? DASHBOARD : DASHBOARD_LIGHT
}

/** Every palette a surface can draw, for the contrast test. */
export const ALL_PALETTES: ReadonlyArray<{ name: string; palette: Palette }> = [
  { name: 'dashboard light', palette: DASHBOARD_LIGHT },
  { name: 'instrument', palette: INSTRUMENT },
  { name: 'grid', palette: GRID },
]

/**
 * The text colour of a style's own words: none where the style follows the
 * surface (style A on the terminal), else the palette's text colour.
 */
export function inkOf(palette: Palette): { color?: string } {
  return palette.text === undefined ? {} : { color: palette.text }
}

/** The colour of a style's quiet words: dim on the surface's colours, else the palette's quiet tone. */
export function quietOf(palette: Palette): { color?: string; dimColor?: boolean } {
  return palette.text === undefined ? { dimColor: true } : { color: palette.tones.quiet }
}

/** Rows the band card's frame takes: two with a frame, none without. */
export function cardRowsOf(palette: Palette): number {
  return palette.frame === 'none' ? 0 : 2
}

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminanceOf(hex: string): number {
  const channels = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255)
  const [r, g, b] = channels.map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The WCAG contrast ratio of two `#rrggbb` colours. */
export function contrastOf(left: string, right: string): number {
  const [high, low] = [luminanceOf(left), luminanceOf(right)].sort((x, y) => y - x) as [number, number]
  return (high + 0.05) / (low + 0.05)
}

/** True when a theme row's value names a dark theme; an unknown value counts as dark, the terminal default. */
export function isDarkThemeOf(value: unknown): boolean {
  if (typeof value !== 'string') return true
  return !/light/iu.test(value)
}
