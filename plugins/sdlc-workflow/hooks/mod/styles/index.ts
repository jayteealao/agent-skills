/**
 * The style renderers (WF-LIVE-VIEWS-PLAN.md 8, K4): one set for both the live
 * pane and the existing parts, so the band, the strip and the dashboard
 * always match the live view (V3).
 */
import type { RenderElement } from 'claude-code'

import { dashboardPane } from './dashboard.tsx'
import type { ViewFacts } from './facts.ts'
import { gridPane } from './grid.tsx'
import { instrumentPane } from './instrument.tsx'
import type { LiveActions, PaneView, StyleUi } from './kit.tsx'
import type { ViewStyle } from './tokens.ts'

export type PaneRenderer = (ui: StyleUi, facts: ViewFacts, view: PaneView, act: LiveActions) => RenderElement

const PANES: Record<ViewStyle, PaneRenderer> = {
  dashboard: dashboardPane,
  instrument: instrumentPane,
  grid: gridPane,
}

/** The live pane's renderer for a style. */
export function paneRendererOf(style: ViewStyle): PaneRenderer {
  return PANES[style]
}
