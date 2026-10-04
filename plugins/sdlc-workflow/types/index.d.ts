/**
 * The state contract of the sdlc-workflow mod (WF-LIVE-VIEWS-PLAN.md 14.5).
 *
 * Every value a drawing reads lives in `$.state` under `sdlc-workflow`, so a
 * reload of the module (a `/config` change, a hot reload) keeps what the
 * person sees. The module writes each value from a handler, an event or a
 * timer, never while drawing. Values that outlive the session also go to
 * `$.store` (the active slug per root, the details state of each view).
 */
/** A value kept under a shape tag: the engine's `Shaped<T>`, spelled here so the contract stays self-contained. */
export type SdlcShaped<T> = { shape: string; value: T }

/** One step of the `/wf` picker. */
export type SdlcPickerStep = { kind: 'key' } | { kind: 'slug'; key: string } | { kind: 'slice'; key: string; slug: string }

/** The open pick: the step, the page on screen, the filter text, the element under the focus ring. */
export type SdlcPicker = { step: SdlcPickerStep | null; page: number; filter: string; ring: string | null }

export type SdlcWorkflowEntry = {
  slug: string
  status: string
  terminal: boolean
  currentStage: string | null
  selectedSlice: string | null
  nextInvocation: string | null
}

export type SdlcSliceEntry = {
  slug: string
  status: string
  complexity: string | null
  stage: 'defined' | 'planned' | 'implemented' | 'verified'
}

/** The workflow tree as last read: the root, the entries, the rosters read so far. */
export type SdlcWorkflows = {
  root: string | null
  isRead: boolean
  entries: SdlcWorkflowEntry[]
  slices: Record<string, SdlcSliceEntry[]>
  /** How many reads so far: each read redraws the strip, the band and the dashboard. */
  reads: number
}

export type SdlcDashboard = { isOpen: boolean; details: boolean }

export type SdlcHub = { version: string | null; repos: number | null; stale: number | null; ok: boolean }

/** The three styles of `viewStyle`. */
export type SdlcViewStyle = 'dashboard' | 'instrument' | 'grid'

/** The kinds of live view. */
export type SdlcLiveKind = 'yolo' | 'campaign' | 'brainstorm'

/** What the live module hands the status line (K1): the heartbeat age and the 5-hour usage. */
export type SdlcLiveStatus = { text: string }

/** One primary action of the live line in the band (K3). */
/** A live-line action. It has no hotkey: a bare digit in an empty prompt box presses a band button, and these write stop requests. */
export type SdlcLiveAction = { key: string; label: string; armed: boolean }

/** What the live module hands the band (K3): the focus line and the primary actions. */
export type SdlcLiveBand = { kind: SdlcLiveKind; slug: string; focus: string; tone: SdlcTone; actions: SdlcLiveAction[]; isPaneSeated: boolean }

/** The meaning of a colour, which each style maps to its own palette. */
export type SdlcTone = 'done' | 'run' | 'attention' | 'stop' | 'intent' | 'quiet' | 'plain'

/** The live pane's own state (M3): the open view, the tabs, the dismissed needs, the armed requests. */
export type SdlcLiveView = {
  /** The tab on screen: a kind and a slug. */
  current: { kind: SdlcLiveKind; slug: string } | null
  /** Every driver the pane follows, one tab each (O3). */
  tabs: Array<{ kind: SdlcLiveKind; slug: string }>
  /** Need ids the person kept, put off or dismissed: they leave "Needs you" (section 6). */
  dismissed: string[]
  /** The details state per view, as last read from the store (V7). */
  details: Partial<Record<SdlcLiveKind, boolean>>
  /** The sections a need opened (V8), by need id: the section closes when the need goes. */
  opened: Record<string, string>
  /** Whether the pane is open, from `ui.open` and `ui.close`. */
  isOpen: boolean
  /** Whether the person opened it (seats at any width), or the mod did (144 columns). */
  isAsked: boolean
}

/** One usage window: the percent used and the reset time; null when unknown (U3). */
export type SdlcUsageWindow = { percent: number | null; resetsAt: string | null }

export type SdlcUsage = {
  fiveHour: SdlcUsageWindow
  sevenDay: SdlcUsageWindow
  level: 'ok' | 'slow' | 'pause' | 'unknown'
  slow: number
  pause: number
}

/** One action a need offers. `prompt` is submitted; `path` is opened as a link. */
export type SdlcNeedAction = { key: string; label: string; kind: 'prompt' | 'link' | 'dismiss' | 'fill'; prompt?: string; path?: string }

/** One item of "Needs you" (L5). */
export type SdlcNeed = {
  id: string
  kind: 'decision' | 'awaiting' | 'protected' | 'prepare' | 'asked' | 'outside' | 'split' | 'stale' | 'paused'
  title: string
  body: string
  /** The section of the view that holds its detail (V8). */
  section: string
  tone: SdlcTone
  actions: SdlcNeedAction[]
}

/** The liveness of a driver: the seconds since its last line against its own limit. */
export type SdlcLiveness = {
  state: 'none' | 'live' | 'quiet' | 'stale' | 'ended'
  lastLineAt: number | null
  limitMs: number
  /** The newest line, as a few words ("agent-start verify:s3"). */
  lastLine: string | null
  /** The times of the newest lines, oldest first: the heartbeat draws one spike per line. */
  beats: number[]
}

export type SdlcStageMark = 'done' | 'run' | 'wait' | 'stop'

export type SdlcYoloModel = {
  kind: 'yolo'
  slug: string
  run: string | null
  liveness: SdlcLiveness
  focus: {
    slice: string | null
    /** 1-based place of the slice in the roster, or null. */
    index: number | null
    count: number
    stage: 'plan' | 'implement' | 'verify' | 'review' | null
    /** 0 to 4: the stages of the focus slice that are done. */
    stagesDone: number
    startedAt: number | null
    /** The usual length of the stage on this run, from its finished stages; null when none finished. */
    usualMs: number | null
  }
  slices: Array<{ slug: string; marks: SdlcStageMark[] }>
  needs: SdlcNeed[]
  commits: { count: number | null; last: string | null }
  agents: Array<{ label: string; isStage: boolean; model: string | null }>
  steering: { editedAt: number | null; readers: number } | null
  protectedFiles: { watched: number; changed: string[] }
  usage: SdlcUsage
  stop: { after: string; by: string; requestedAt: string | null } | null
  outcome: 'running' | 'stopped' | 'ended' | 'stale' | 'none'
}

export type SdlcGates = { merge: boolean; verify: boolean; drift: boolean; refuter: boolean; fidelity: boolean; ship: boolean }

export type SdlcCampaignModel = {
  kind: 'campaign'
  slug: string
  liveness: SdlcLiveness
  activeWave: number | null
  running: number
  paused: { until: string | null; reason: string | null } | null
  waves: Array<{
    n: number
    state: string
    version: string | null
    gates: SdlcGates
    slugs: Array<{ key: string; slug: string; state: string; marks: SdlcStageMark[]; note: string }>
  }>
  needs: SdlcNeed[]
  usage: SdlcUsage
  forecast: 'fits' | 'tight' | 'does-not-fit' | null
  outputs: Array<{ wave: number; pr: string | null; state: string; label: string | null }>
  build: string | null
  heavy: { holder: string | null; waiting: string[] }
  stop: { after: string; by: string; requestedAt: string | null } | null
}

export type SdlcBrainstormModel = {
  kind: 'brainstorm'
  slug: string
  liveness: SdlcLiveness
  mode: 'explore' | 'scope' | 'done'
  last: { asked: string | null; answer: string | null } | null
  threads: Array<{ key: string; name: string; items: Array<{ key: string; text: string; call: 'keep' | 'cut' | 'later' | null }> }>
  walk: { walked: number; keep: number; cut: number; later: number; total: number }
  packets: Array<{ key: string; title: string; size: number; state: string }>
  sources: { research: number; references: number; work: number }
  revision: { n: number | null; change: string | null }
  needs: SdlcNeed[]
}

export type SdlcLiveModel = SdlcYoloModel | SdlcCampaignModel | SdlcBrainstormModel

/** Every value carries a shape tag (14.5 Z2): a reload whose code names another tag reads it as absent. */
declare module 'claude-code' {
  interface PluginState {
    'sdlc-workflow': {
      picker: SdlcShaped<SdlcPicker>
      active: SdlcShaped<string | null>
      workflows: SdlcShaped<SdlcWorkflows>
      /** The `wf-dashboard` pane: its open state, from `ui.open` and `ui.close`, and its details state (Y5). */
      dashboard: SdlcShaped<SdlcDashboard>
      hub: SdlcShaped<SdlcHub | null>
      /** The usage guard's two windows for the status line. */
      usage: SdlcShaped<string | null>
      /** The dollars the last `/wf` turn cost, for the strip's cost row. */
      lastStageUsd: SdlcShaped<number | null>
      liveStatus: SdlcShaped<SdlcLiveStatus | null>
      liveBand: SdlcShaped<SdlcLiveBand | null>
      liveView: SdlcShaped<SdlcLiveView>
      /** The models of the live views, by `<kind>:<slug>`. */
      liveModels: SdlcShaped<Record<string, SdlcLiveModel>>
    }
  }
}
