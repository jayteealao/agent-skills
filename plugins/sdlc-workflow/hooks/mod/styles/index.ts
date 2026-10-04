/**
 * The style renderers (MOD-DESIGN, 2026-10-04): one live-pane layout for the
 * three styles, which change only its colours, marks and case, so the band,
 * the strip and the dashboard always match the live view (V3).
 */
import type { RenderElement } from 'claude-code'

import type { ViewFacts } from './facts.ts'
import type { LiveActions, PaneView, StyleUi } from './kit.tsx'
import { livePane } from './pane.tsx'
import type { ViewStyle } from './tokens.ts'

export type PaneRenderer = (ui: StyleUi, facts: ViewFacts, view: PaneView, act: LiveActions) => RenderElement

/** The live pane's renderer for a style: one layout; the style rides on `view.style`. */
export function paneRendererOf(_style: ViewStyle): PaneRenderer {
  return livePane
}
