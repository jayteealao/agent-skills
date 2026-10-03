/**
 * The empty values of the mod's `$.state` (WF-LIVE-VIEWS-PLAN.md 14.5),
 * declared in `types/index.d.ts`. The atoms themselves live in the file that
 * reads or writes them: the engine's scan accepts only an atom written in a
 * const of the same file. A drawing reads them with `read`, which subscribes
 * it; a handler, an event or a timer writes them with `update`. Never written
 * while drawing (Z1).
 */
import type { SdlcDashboard, SdlcLiveView, SdlcPicker, SdlcWorkflows } from '../../types'

export const EMPTY_PICKER: SdlcPicker = { step: null, page: 0, filter: '', ring: null }
export const EMPTY_WORKFLOWS: SdlcWorkflows = { root: null, isRead: false, entries: [], slices: {}, reads: 0 }
export const EMPTY_DASHBOARD: SdlcDashboard = { isOpen: false, details: false }
export const EMPTY_LIVE_VIEW: SdlcLiveView = { current: null, tabs: [], dismissed: [], details: {}, opened: {}, isOpen: false, isAsked: false }


/** The store key of a view's details state (V7, Y5): `yolo`, `campaign`, `brainstorm` or `workflows`. */
export const detailsStoreKeyOf = (kind: string) => `live-view.details.${kind}`
