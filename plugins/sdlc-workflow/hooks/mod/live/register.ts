/**
 * The live views of `/wf yolo`, `/wf campaign` and `/wf brainstorm`
 * (WF-LIVE-VIEWS-PLAN.md): one pane, `wf-live`, that answers at a glance
 * whether the run is alive, where it is, what it decided, what it needs from
 * the person, and what it costs.
 *
 * The engine takes one hooks module per plugin (probe P10, 2026-10-03), so
 * this file is not a second module: `hooks/mod/register.ts` calls
 * `registerLive` from its own `register`. Its hooks stay apart: they hook the
 * live pane, the open rules, the poll and the actions. The shared sites (the
 * band, the status line, the spinner, the mode label) stay with
 * `register.ts`; this module hands them its facts through `$.state` (K1–K3).
 *
 * M4: every hook body catches its own errors and passes the event on, so a
 * fault here never costs the person the picker.
 */
import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, PluginOptions, RenderElement } from 'claude-code'

import type { SdlcLiveAction, SdlcLiveBand, SdlcLiveStatus, SdlcLiveKind, SdlcLiveModel, SdlcLiveView, SdlcNeed } from '../../../types'
import { frontmatterField, intentRecordsOf, STAGE_FILE, stageOf } from '../../../lib/live-events.mjs'
import type { ArtifactFact, LiveEvent } from '../../../lib/live-events.mjs'
import { wfCommandOf } from '../active.ts'
import { EMPTY_LIVE_VIEW, detailsStoreKeyOf } from '../state.ts'
import { bandFocusOf, factsOf, liveStatusOf } from '../styles/facts.ts'
import { paneRendererOf } from '../styles/index.ts'
import { styleUiOf } from '../styles/kit.tsx'
import type { LiveActions, PaneView } from '../styles/kit.tsx'
import { isDarkThemeOf, nextViewStyle, paletteOf, viewStyleOf } from '../styles/tokens.ts'
import type { ViewStyle } from '../styles/tokens.ts'
import { findProjectRoot, joinPath, listSlices } from '../workflows.ts'
import { buildBrainstormModel, newestChangeOf } from './model/brainstorm.ts'
import { buildCampaignModel, gatesAfter, heavyHolderOf, lockWaitsAfter } from './model/campaign.ts'
import type { UnitDrive } from './model/campaign.ts'
import { absorb, freshJournalState, judge, livenessFrom, openStagesOf } from './model/journal.ts'
import type { JournalState } from './model/journal.ts'
import type { RecordFact } from './model/needs.ts'
import { budgetOf, usageOf } from './model/usage.ts'
import type { Budget, RateLimitLike } from './model/usage.ts'
import { buildYoloModel, controlOf } from './model/yolo.ts'
import type { RosterFact } from './model/yolo.ts'
import { LiveReader, hashOf } from './reader.ts'
import type { LiveIo } from './reader.ts'

export const LIVE_PANE = 'wf-live'
export const LIVE_COMMAND = 'wf-live'
/** The command as typed, or under the plugin's namespace. */
const LIVE_COMMAND_PATTERN = /^(?:sdlc-workflow:)?wf-live$/u

/** R1: the poll while the pane shows, while it is hidden, and while no driver is live. */
export const POLL_SHOWN_MS = 2_000
export const POLL_HIDDEN_MS = 15_000
export const POLL_IDLE_MS = 60_000
/** The protected files and the commits are read every 20 s, and only while a run is live. */
const SLOW_FACTS_MS = 20_000
/** A protected file over this size is not hashed. */
const PROTECTED_MAX_BYTES = 1024 * 1024
/** A journal or board changed this recently is a driver to follow (O1). */
const FRESH_MS = 3 * 60_000
/** F8: a push-class toast stays 10 s, so a person who looked away can read it. */
export const PUSH_TOAST_MS = 10_000

type Kind = SdlcLiveKind

/** What one followed driver keeps between polls. The module's own: a reload rebuilds it from the files. */
type Tracker = {
  kind: Kind
  slug: string
  journal: JournalState
  watchStart: number
  isPrimed: boolean
  records: Map<string, RecordFact>
  protectedBase: Map<string, string>
  protectedChanged: Set<string>
  protectedWatched: number
  commits: { count: number | null; last: string | null }
  slowAt: number
  roster: RosterFact[]
  rosterAt: number
  gates: Record<string, string[]>
  lockWaits: string[]
  drives: Map<string, { journal: JournalState }>
  boardAt: number | null
  boardBeats: number[]
  toasted: Set<string>
  modelText: string
}

/**
 * The link between the two halves (K1, K3). `register.ts` owns the band and
 * the status line: it calls `press` and `open` from the band's live line, and
 * this module calls `onStatus` with its part of the status line. The engine
 * keeps no value a call that takes `on` returns, so the link is passed in and
 * this module fills its half.
 */
export type LiveLink = {
  press: (key: string) => void
  open: () => void
  onStatus: (text: string | null) => void
  /** Called from `register.ts`'s `session.measure` hook (U1). */
  measure: (rateLimits: readonly unknown[]) => void
  /** Writes one `draw` row to the probe journal; `register.ts` fills it. */
  note: (ok: boolean, detail: string) => void
}

export type LiveContext = {
  options: PluginOptions
  pluginName: string
  link: LiveLink
}

/*
 * The `$.state` atoms this file reads and writes (14.5). Each carries a shape tag (Z2): bump it
 * when the code's idea of the value changes, so a reload does not read the old form.
 */
const liveStatusAtom = atom({ plugin: 'sdlc-workflow', key: 'liveStatus' } as const, null, { shape: 'live-status-1' })
const liveBandAtom = atom({ plugin: 'sdlc-workflow', key: 'liveBand' } as const, null, { shape: 'live-band-1' })
const liveViewAtom = atom({ plugin: 'sdlc-workflow', key: 'liveView' } as const, EMPTY_LIVE_VIEW, { shape: 'live-view-1' })
const liveModelsAtom = atom({ plugin: 'sdlc-workflow', key: 'liveModels' } as const, {}, { shape: 'live-models-1' })

const keyOf = (kind: string, slug: string) => `${kind}:${slug}`

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function newTracker(kind: Kind, slug: string, now: number): Tracker {
  return {
    kind,
    slug,
    journal: freshJournalState(),
    watchStart: now,
    isPrimed: false,
    records: new Map(),
    protectedBase: new Map(),
    protectedChanged: new Set(),
    protectedWatched: 0,
    commits: { count: null, last: null },
    slowAt: 0,
    roster: [],
    rosterAt: -1,
    gates: {},
    lockWaits: [],
    drives: new Map(),
    boardAt: null,
    boardBeats: [],
    toasted: new Set(),
    modelText: '',
  }
}

/** The kind of live view a `/wf` command starts, or null. */
export function liveKindOf(key: string): Kind | null {
  if (key === 'yolo' || key === 'campaign' || key === 'brainstorm') return key
  return null
}

/** The push-class toast of a shared event, or null (commentary plan C5; K5). */
export function toastTextOf(event: LiveEvent): string | null {
  const where = [event['stage'], event['slice']].filter(Boolean).join(' ')
  switch (event.event) {
    case 'decision':
      return `wf yolo ${event.slug}: ${where} needs you · ${(event['reasons'] as string[] | undefined)?.join(', ') ?? 'decision'}`
    case 'stop':
      return `wf yolo ${event.slug}: stopped at ${where} (${String(event['kind'] ?? 'stop')})`
    case 'stale':
      return `wf yolo ${event.slug}: no journal line for ${String(event['silentMinutes'] ?? '?')} min`
    case 'run-end':
      return `wf yolo ${event.slug}: the run ended${event['stoppedAt'] ? ` at ${String(event['stoppedAt'])}` : ''}`
    default:
      return null
  }
}

/** The campaign journal lines that raise a toast (K5). */
const CAMPAIGN_TOASTS: Record<string, (line: Record<string, unknown>, slug: string) => string> = {
  'wave-ready': (line, slug) => `wf campaign ${slug}: wave ${String(line['wave'] ?? '?')} is ready to try`,
  asked: (line, slug) => `wf campaign ${slug}: a question needs you · ${String(line['text'] ?? '')}`.trim(),
  paused: (line, slug) => `wf campaign ${slug}: paused until ${String(line['until'] ?? '?').slice(11, 16)}`,
  'wave-end': (line, slug) => `wf campaign ${slug}: wave ${String(line['wave'] ?? '?')} shipped`,
  'campaign-end': (_line, slug) => `wf campaign ${slug}: the campaign ended`,
}

/*
 * The module's own variables. `register` runs again on a reload, and `registerLive` sets them
 * afresh; the engine lets `$` reach only functions declared at the top of the file, so the
 * helpers below read these instead of closing over a `registerLive` scope.
 */
let style: ViewStyle = 'dashboard'
let isPaneOn = true
let detailsDefault = false
let pluginName = 'sdlc-workflow'
let onStatus: (text: string | null) => void = () => undefined
let engine: LiveEngine | null = null
let reader: LiveReader | null = null
let root: string | null = null
let home: string | null = null
let budget: Budget = budgetOf(null)
let rateLimits: RateLimitLike[] | null = null
let isDarkTheme = true
let isStyleLocked = false
let timer: { cancel: () => void } | null = null
let pollMs = 0
let polling: Promise<void> = Promise.resolve()
let lastScanAt = 0
const trackers = new Map<string, Tracker>()
/** One log line per hook fault (M4). */
const faulted = new Set<string>()

/**
 * Every `$.noun.method` the live helpers call, bound once per hook. The engine lets `$` reach no
 * variable and no other file, so a hook builds this from its own `$` and the helpers take it.
 */
export type LiveEngine = {
  readView: () => Promise<SdlcLiveView>
  updateView: (change: (value: SdlcLiveView | undefined) => SdlcLiveView) => Promise<SdlcLiveView>
  readModels: () => Promise<Record<string, SdlcLiveModel>>
  updateModels: (change: (value: Record<string, SdlcLiveModel> | undefined) => Record<string, SdlcLiveModel>) => Promise<unknown>
  updateStatus: (change: (value: SdlcLiveStatus | null | undefined) => SdlcLiveStatus | null) => Promise<unknown>
  updateBand: (change: (value: SdlcLiveBand | null | undefined) => SdlcLiveBand | null) => Promise<unknown>
  exists: (path: string) => Promise<boolean>
  stat: (path: string) => Promise<{ size: number; mtimeMs: number }>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  list: (path: string) => Promise<Array<{ name: string; kind: 'file' | 'dir' | 'other'; mtimeMs?: number | undefined }>>
  run: (argv: string[], options: { timeoutMs: number }) => Promise<{ exitCode: number | null; stdout: string }>
  now: () => Promise<number>
  every: (ms: number, fn: () => void) => { cancel: () => void }
  toast: (text: string, timeoutMs: number) => void
  open: (id: string, title: string) => Promise<unknown>
  log: (text: string) => void
  submit: (text: string) => Promise<unknown>
  fill: (text: string) => Promise<unknown>
  configSet: (key: string, value: string) => Promise<unknown>
  configList: () => Promise<ReadonlyArray<{ key: string; value?: unknown; isLocked?: boolean | undefined }>>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  usage: () => Promise<{ rateLimits?: readonly unknown[] | null | undefined }>
  /** The person's home directory, from USERPROFILE then HOME. */
  home: () => Promise<string | undefined>
  registerCommand: (spec: { name: string; description: string; argumentHint?: string }) => Promise<unknown>
}

function liveEngineOf($: EngineInterface): LiveEngine {
  return {
    readView: () => read($, liveViewAtom),
    updateView: change => update($, liveViewAtom, change),
    readModels: () => read($, liveModelsAtom),
    updateModels: change => update($, liveModelsAtom, change),
    updateStatus: change => update($, liveStatusAtom, change),
    updateBand: change => update($, liveBandAtom, change),
    exists: path => $.fs.exists(path),
    stat: path => $.fs.stat(path),
    read: path => $.fs.read(path),
    write: (path, text) => $.fs.write(path, text),
    list: async path => [...(await $.fs.list(path))],
    run: (argv, options) => $.process.run(argv, options),
    now: () => $.clock.now(),
    every: (ms, fn) => $.clock.every(ms, fn),
    toast: (text, timeoutMs) => $.ui.toast(text, { timeoutMs }),
    open: (id, title) => $.ui.open({ id, title }),
    log: text => $.ui.log(text),
    submit: text => $.prompt.submit({ text }),
    fill: text => $.prompt.fill({ text }),
    configSet: (key, value) => $.config.set({ key, value }),
    configList: () => $.config.list(),
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    usage: () => $.session.usage(),
    home: async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')),
    registerCommand: spec => $.command.register(spec),
  }
}

function fault(where: string, error: unknown): void {
  if (faulted.has(where)) return
  faulted.add(where)
  try {
    engine?.log(`sdlc-workflow live view: ${where}: ${messageOf(error)}`)
  } catch {
    // No log: the fault stays silent.
  }
}

function ioOf(x: LiveEngine): LiveIo {
  return {
    stat: async path => {
      try {
        if (!(await x.exists(path))) return null
        const stat = await x.stat(path)
        return { size: stat.size, mtimeMs: stat.mtimeMs }
      } catch {
        return null
      }
    },
    read: async path => {
      try {
        return await x.read(path)
      } catch {
        return null
      }
    },
    readFrom: async (path, offset, max) => {
      // A child reads the bytes after the offset: `$.fs.read` has no offset and stops at 4 MiB.
      const script =
        'const fs=require("fs");const[p,o,m]=process.argv.slice(1);const fd=fs.openSync(p,"r");const size=fs.fstatSync(fd).size;const start=Math.min(+o,size);const n=Math.min(size-start,+m);const b=Buffer.alloc(n);fs.readSync(fd,b,0,n,start);const cut=b.lastIndexOf(10);process.stdout.write(cut<0?"":b.subarray(0,cut+1));'
      try {
        const result = await x.run(['node', '-e', script, path, String(offset), String(max)], { timeoutMs: 10_000 })
        return result.exitCode === 0 ? result.stdout : null
      } catch {
        return null
      }
    },
    list: async path => {
      try {
        return (await x.list(path)).map(entry => ({ name: entry.name, kind: entry.kind, mtimeMs: entry.mtimeMs ?? 0 }))
      } catch {
        return []
      }
    },
  }
}

async function git(x: LiveEngine, args: string[]): Promise<string | null> {
  if (root === null) return null
  try {
    const result = await x.run(['git', '-C', root, ...args], { timeoutMs: 5_000 })
    return result.exitCode === 0 ? result.stdout : null
  } catch {
    return null
  }
}

// -------------------------------------------------------------------------
// The view state
// -------------------------------------------------------------------------

async function viewOf(x: LiveEngine): Promise<SdlcLiveView> {
  try {
    return await x.readView()
  } catch {
    return EMPTY_LIVE_VIEW
  }
}

async function setView(x: LiveEngine, change: (view: SdlcLiveView) => SdlcLiveView): Promise<SdlcLiveView> {
  return x.updateView(view => change(view ?? EMPTY_LIVE_VIEW))
}

async function detailsOf(x: LiveEngine, kind: Kind): Promise<boolean> {
  try {
    const stored = await x.storeGet(detailsStoreKeyOf(kind))
    return typeof stored === 'boolean' ? stored : detailsDefault
  } catch {
    return detailsDefault
  }
}

/** Follows a driver: a tab in the pane (O3), and the pane opened when the rules say so (O1, O2, O5). */
async function follow(x: LiveEngine, kind: Kind, slug: string, isAsked: boolean): Promise<void> {
  const now = await x.now()
  const key = keyOf(kind, slug)
  if (!trackers.has(key)) trackers.set(key, newTracker(kind, slug, now))
  const details = await detailsOf(x, kind)
  const models = await x.readModels().catch(() => ({}) as Record<string, SdlcLiveModel>)
  await setView(x, view => {
    // O4: a new driver closes the tabs of runs that ended.
    const kept = view.tabs.filter(tab => {
      if (tab.kind === kind && tab.slug === slug) return true
      const model = models[keyOf(tab.kind, tab.slug)]
      return !(model?.kind === 'yolo' && (model.outcome === 'ended' || model.outcome === 'stopped'))
    })
    const tabs = kept.some(tab => tab.kind === kind && tab.slug === slug) ? kept : [...kept, { kind, slug }]
    return { ...view, tabs, current: { kind, slug }, details: { ...view.details, [kind]: details }, isAsked: view.isAsked || isAsked }
  })
  const kept = await viewOf(x)
  for (const stale of [...trackers.keys()]) if (!kept.tabs.some(tab => keyOf(tab.kind, tab.slug) === stale)) trackers.delete(stale)
  await pollAll(x)
  // Q3: a brainstorm opens by itself in scope mode and after done; while exploring, on request.
  const model = (await x.readModels().catch(() => ({}) as Record<string, SdlcLiveModel>))[key]
  const opensItself = kind !== 'brainstorm' || (model?.kind === 'brainstorm' && model.mode !== 'explore')
  if (isAsked || opensItself) await openPane(x, kind, slug, isAsked)
  schedule(x)
}

/**
 * Opens the live pane. Resolves to null when a surface draws it, else to why
 * it does not draw: the pane option is off, the engine refused it, or the pane
 * waits (`isPlaced: false`, with the engine's reason).
 */
async function openPane(x: LiveEngine, kind: Kind, slug: string, isAsked: boolean): Promise<string | null> {
  if (!isPaneOn) return 'the liveView option is off'
  let isPlaced = true
  let why: string | null = null
  try {
    const result = (await x.open(LIVE_PANE, `${kind} · ${slug}`)) as { isPlaced?: boolean; reason?: string } | null | undefined
    isPlaced = result === undefined || result === null || result.isPlaced !== false
    if (!isPlaced) why = result?.reason ?? 'no surface here places it'
  } catch (error) {
    fault('open', error)
    isPlaced = false
    why = messageOf(error)
  }
  await setView(x, view => ({ ...view, isOpen: true, isAsked: view.isAsked || isAsked }))
  await writeBand(x, isPlaced)
  return why
}

/** What `/wf-live` answers: the pane is open, or it is not drawn and why. */
function openedTextOf(kind: Kind, slug: string, why: string | null): string {
  if (why === null) return `The live view of ${kind} ${slug} is open.`
  return `The live view of ${kind} ${slug} follows the run, but its pane is not drawn: ${why}.`
}

// -------------------------------------------------------------------------
// The poll (R1–R3)
// -------------------------------------------------------------------------

function schedule(x: LiveEngine): void {
  void viewOf(x).then(view => {
    const anyLive = [...trackers.values()].some(tracker => tracker.modelText !== '' && !/"outcome":"(ended|stopped)"/u.test(tracker.modelText))
    const want = trackers.size === 0 || !anyLive ? POLL_IDLE_MS : view.isOpen ? POLL_SHOWN_MS : POLL_HIDDEN_MS
    if (timer !== null && want === pollMs) return
    timer?.cancel()
    pollMs = want
    timer = x.every(want, () => {
      polling = polling.then(() => pollAll(x)).catch(error => fault('poll', error))
    })
  })
}

async function pollAll(x: LiveEngine): Promise<void> {
  if (reader === null || root === null) return
  const now = await x.now()
  if (now - lastScanAt >= POLL_IDLE_MS || trackers.size === 0) {
    lastScanAt = now
    await scan(x, now)
  }
  for (const tracker of trackers.values()) {
    try {
      if (tracker.kind === 'yolo') await pollYolo(x, tracker, now)
      else if (tracker.kind === 'campaign') await pollCampaign(x, tracker, now)
      else await pollBrainstorm(x, tracker, now)
    } catch (error) {
      fault(`poll ${tracker.kind}`, error)
    }
  }
  await writeShared(x)
  schedule(x)
}

/** O1, second half: a journal or a board that changed in the last minutes is a driver to follow. */
async function scan(x: LiveEngine, now: number): Promise<void> {
  if (reader === null || root === null) return
  const dir = joinPath(root, '.ai', 'workflows')
  const campaignSlugs = new Set<string>()
  for (const tracker of trackers.values()) if (tracker.kind === 'campaign') for (const slug of tracker.drives.keys()) campaignSlugs.add(slug)
  for (const entry of await reader.list(dir)) {
    if (entry.kind !== 'dir') continue
    const slug = entry.name
    const journal = await reader.mtime(joinPath(dir, slug, '.driver-journal.jsonl'))
    if (journal !== null && now - journal < FRESH_MS && !campaignSlugs.has(slug) && !trackers.has(keyOf('yolo', slug))) {
      const ledger = await reader.mtime(joinPath(dir, slug, 'work', 'campaign', 'ledger.json'))
      if (ledger === null) await follow(x, 'yolo', slug, false)
    }
    const campaign = await reader.mtime(joinPath(dir, slug, 'work', 'campaign', '.campaign-journal.jsonl'))
    if (campaign !== null && now - campaign < FRESH_MS && !trackers.has(keyOf('campaign', slug))) await follow(x, 'campaign', slug, false)
    const board = await reader.mtime(joinPath(dir, slug, 'brainstorm-board.json'))
    if (board !== null && now - board < FRESH_MS && !trackers.has(keyOf('brainstorm', slug))) await follow(x, 'brainstorm', slug, false)
  }
}

function toast(x: LiveEngine, tracker: Tracker, id: string, text: string | null): void {
  if (text === null || tracker.toasted.has(id) || !tracker.isPrimed) {
    if (text !== null) tracker.toasted.add(id)
    return
  }
  tracker.toasted.add(id)
  try {
    x.toast(text, PUSH_TOAST_MS)
  } catch (error) {
    fault('toast', error)
  }
}

/** The stage artifact a stage end wrote: `<prefix>-<slice>.md` first, then `<prefix>.md`. */
async function artifactFor(slugDir: string, stage: string, slice: string | null): Promise<{ path: string; rel: string } | null> {
  if (reader === null || root === null) return null
  const prefix = STAGE_FILE[stage]
  if (prefix === undefined) return null
  for (const name of slice === null ? [`${prefix}.md`] : [`${prefix}-${slice}.md`, `${prefix}.md`]) {
    const path = joinPath(slugDir, name)
    const mtime = await reader.mtime(path)
    if (mtime !== null) return { path, rel: path.slice(root.length + 1).replace(/\\/gu, '/') }
  }
  return null
}

/** Reads the artifacts the new lines' stage ends name, so the shared rules can judge them (M2). */
async function readArtifacts(slug: string, lines: ReadonlyArray<Record<string, unknown>>, tracker: Tracker): Promise<Map<string, ArtifactFact>> {
  const out = new Map<string, ArtifactFact>()
  if (reader === null || root === null) return out
  const slugDir = joinPath(root, '.ai', 'workflows', slug)
  for (const line of lines) {
    if (line['event'] !== 'agent-end') continue
    const { stage, slice } = stageOf(line)
    if (stage === null) continue
    const found = await artifactFor(slugDir, stage, slice)
    if (found === null) continue
    const text = (await reader.changed(found.path)).text ?? ''
    const yaml = (await reader.changed(found.path.replace(/\.md$/u, '.yaml'))).text ?? ''
    const intents = intentRecordsOf(text, yaml)
    const status = frontmatterField(text, 'status')
    const signal = intents.length > 0 || status === 'awaiting-input' ? { reasons: [...(status === 'awaiting-input' ? ['awaiting-input'] : []), ...(intents.length > 0 ? ['intent-bearing'] : [])], intentBearing: intents.length } : null
    const mtime = (await reader.mtime(found.path)) ?? 0
    out.set(`${stage}:${slice ?? ''}`, { rel: found.rel, status, signal, mtime })
    if (signal !== null) tracker.records.set(found.rel, { rel: found.rel, path: found.path, stage: stage === 'update-deps-exec' ? 'verify' : stage, slice, status, intents })
    else tracker.records.delete(found.rel)
  }
  return out
}

async function pollYolo(x: LiveEngine, tracker: Tracker, now: number): Promise<void> {
  if (reader === null || root === null) return
  const slugDir = joinPath(root, '.ai', 'workflows', tracker.slug)
  const { lines, reset } = await reader.tail(joinPath(slugDir, '.driver-journal.jsonl'))
  if (reset) tracker.journal = freshJournalState()
  let events: LiveEvent[] = []
  if (lines.length > 0) {
    const artifacts = await readArtifacts(tracker.slug, lines, tracker)
    const result = absorb(tracker.slug, tracker.journal, lines, (stage, slice) => artifacts.get(`${stage}:${slice ?? ''}`) ?? null)
    tracker.journal = result.state
    events = result.events
  }
  const judged = judge(tracker.slug, tracker.journal, now, tracker.watchStart)
  tracker.journal = judged.state
  for (const event of [...events, ...judged.events]) toast(x, tracker, `${event.event}:${String(event['run'])}:${String(event['at'])}:${String(event['stage'] ?? '')}`, toastTextOf(event))

  if (lines.length > 0 || tracker.rosterAt < 0) {
    tracker.rosterAt = now
    const slices = await listSlices(root, tracker.slug, { list: path => x.list(path), read: path => x.read(path), exists: path => x.exists(path) }).catch(() => [])
    const roster: RosterFact[] = []
    for (const slice of slices) {
      const reviewed = (await reader.mtime(joinPath(slugDir, `07-review-${slice.slug}.md`))) !== null
      roster.push({ slug: slice.slug, stage: slice.stage, reviewed })
    }
    tracker.roster = roster
  }

  const isLive = livenessFrom(tracker.journal, now).state !== 'ended'
  if (isLive && now - tracker.slowAt >= SLOW_FACTS_MS) {
    tracker.slowAt = now
    await readSlowFacts(x, tracker, now)
  }

  const control = controlOf((await reader.changed(joinPath(slugDir, '.control.json'))).text)
  const steerMtime = await reader.mtime(joinPath(slugDir, 'steer.md'))
  const view = await viewOf(x)
  const model = buildYoloModel({
    slug: tracker.slug,
    root,
    now,
    journal: tracker.journal,
    roster: tracker.roster,
    records: [...tracker.records.values()],
    control,
    protectedWatched: tracker.protectedWatched,
    protectedChanged: [...tracker.protectedChanged],
    commits: tracker.commits,
    steerMtime,
    usage: usageOf(rateLimits, budget),
    dismissed: view.dismissed,
  })
  for (const need of model.needs) if (need.kind === 'protected') toast(x, tracker, `protected:${need.id}`, `wf yolo ${tracker.slug}: ${need.title}`)
  tracker.isPrimed = true
  await writeModel(x, tracker, model)
}

/** The protected files (hash, files ≤ 1 MiB) and the commits of the run (P8: through `$.process`). */
async function readSlowFacts(x: LiveEngine, tracker: Tracker, now: number): Promise<void> {
  if (reader === null || root === null) return
  const config = (await reader.changed(joinPath(root, '.ai', 'sdlc-config.json'))).text
  budget = budgetOf(config)
  if (tracker.protectedBase.size === 0) {
    const files = new Set(['PRODUCT.md', 'DESIGN.md'])
    try {
      const own = (JSON.parse(config ?? '{}') as { yolo?: { protectedFiles?: unknown } }).yolo?.protectedFiles
      if (Array.isArray(own)) for (const file of own) if (typeof file === 'string' && file !== '') files.add(file)
    } catch {
      // A config that does not parse names no more files.
    }
    const dirty = await git(x, ['status', '--porcelain', '--untracked-files=no'])
    for (const line of (dirty ?? '').split(/\r?\n/u)) {
      const file = line.slice(3).trim().replace(/^"|"$/gu, '')
      if (file !== '' && !file.startsWith('.ai/') && !file.startsWith('.scratch/')) files.add(file.includes(' -> ') ? (file.split(' -> ').pop() as string) : file)
    }
    for (const file of files) {
      const path = joinPath(root, file)
      const stat = await ioOf(x).stat(path)
      if (stat === null || stat.size > PROTECTED_MAX_BYTES) continue
      const text = await ioOf(x).read(path)
      if (text !== null) tracker.protectedBase.set(file, hashOf(text))
    }
    tracker.protectedWatched = tracker.protectedBase.size
  } else {
    for (const [file, base] of tracker.protectedBase) {
      const text = await ioOf(x).read(joinPath(root, file))
      if (text !== null && hashOf(text) !== base) tracker.protectedChanged.add(file)
    }
  }
  const since = new Date(tracker.journal.run.lastLineAt === null ? tracker.watchStart : Math.min(tracker.watchStart, firstLineOf(tracker.journal) ?? now)).toISOString()
  const log = await git(x, ['log', `--since=${since}`, '--format=%s'])
  if (log !== null) {
    const subjects = log.split(/\r?\n/u).filter(line => line.trim() !== '')
    tracker.commits = { count: subjects.length, last: subjects[0] ?? null }
  }
}

function firstLineOf(journal: JournalState): number | null {
  return journal.beats[0] ?? null
}

async function pollCampaign(x: LiveEngine, tracker: Tracker, now: number): Promise<void> {
  if (reader === null || root === null) return
  const campDir = joinPath(root, '.ai', 'workflows', tracker.slug, 'work', 'campaign')
  const ledgerText = (await reader.changed(joinPath(campDir, 'ledger.json'))).text
  let ledger: Record<string, unknown> | null = null
  try {
    ledger = ledgerText === null ? null : (JSON.parse(ledgerText) as Record<string, unknown>)
  } catch {
    ledger = null
  }
  const { lines, reset } = await reader.tail(joinPath(campDir, '.campaign-journal.jsonl'))
  if (reset) {
    tracker.journal = freshJournalState()
    tracker.gates = {}
    tracker.lockWaits = []
  }
  if (lines.length > 0) {
    tracker.journal = absorb(tracker.slug, tracker.journal, lines).state
    tracker.gates = gatesAfter(tracker.gates, lines)
    tracker.lockWaits = lockWaitsAfter(tracker.lockWaits, lines)
    for (const line of lines) {
      const text = CAMPAIGN_TOASTS[String(line['event'] ?? '')]?.(line, tracker.slug) ?? null
      toast(x, tracker, `campaign:${String(line['event'])}:${String(line['at'])}`, text)
    }
  }
  // The drives: each running unit's driver journal, in the main checkout or its worktree.
  const units = (ledger?.['units'] ?? {}) as Record<string, { slug?: unknown; state?: unknown }>
  const drives: Record<string, UnitDrive> = {}
  let lastLineAt = tracker.journal.run.lastLineAt
  const beats = [...tracker.journal.beats]
  for (const unit of Object.values(units)) {
    const slug = typeof unit.slug === 'string' ? unit.slug : null
    if (slug === null) continue
    const drive = tracker.drives.get(slug) ?? { journal: freshJournalState() }
    tracker.drives.set(slug, drive)
    if (unit.state !== 'running') continue
    const runId = typeof ledger?.['run-id'] === 'string' ? (ledger['run-id'] as string) : 'run'
    const candidates = [joinPath(root, '.ai', 'workflows', slug, '.driver-journal.jsonl'), joinPath(root, '.scratch', 'campaign', runId, 'wt', slug, '.ai', 'workflows', slug, '.driver-journal.jsonl')]
    for (const path of candidates) {
      const tail = await reader.tail(path)
      if (!tail.exists) continue
      if (tail.lines.length > 0) drive.journal = absorb(slug, drive.journal, tail.lines).state
      break
    }
    const open = openStagesOf(drive.journal)[0]
    drives[slug] = { stage: open?.stage ?? drive.journal.lastStage?.stage ?? null, startedAt: open?.at ?? null, status: drive.journal.lastStage?.status ?? null }
    if (drive.journal.run.lastLineAt !== null && (lastLineAt === null || drive.journal.run.lastLineAt > lastLineAt)) lastLineAt = drive.journal.run.lastLineAt
    beats.push(...drive.journal.beats)
  }
  const liveness = livenessFrom({ ...tracker.journal, run: { ...tracker.journal.run, lastLineAt }, beats: beats.sort((a, b) => a - b).slice(-40) }, now)
  const heavy = heavyHolderOf((await reader.changed(joinPath(root, '.scratch', 'campaign', 'heavy.lock'))).text)
  const control = controlOf((await reader.changed(joinPath(campDir, '.control.json'))).text)
  const view = await viewOf(x)
  const model = buildCampaignModel({
    slug: tracker.slug,
    now,
    ledger,
    liveness,
    gates: tracker.gates,
    drives,
    heavy: { holder: heavy, waiting: tracker.lockWaits.filter(slug => slug !== heavy) },
    usage: usageOf((await guardUsage(x)) ?? rateLimits, budget),
    control,
    dismissed: view.dismissed,
  })
  for (const need of model.needs) if (need.kind === 'prepare') toast(x, tracker, `prepare:${need.id}`, `wf campaign ${tracker.slug}: ${need.title.toLowerCase()} · ${need.body}`)
  tracker.isPrimed = true
  await writeModel(x, tracker, model)
}

/** U2: the newest reading the usage guard wrote to `~/.claude/sdlc/usage/`, or null. */
async function guardUsage(x: LiveEngine): Promise<RateLimitLike[] | null> {
  if (reader === null || home === null) return null
  const dir = joinPath(home, '.claude', 'sdlc', 'usage')
  const files = (await reader.list(dir)).filter(entry => entry.kind === 'file' && entry.name.endsWith('.json'))
  const newest = files.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
  if (newest === undefined) return null
  const text = (await reader.changed(joinPath(dir, newest.name))).text
  try {
    const value = JSON.parse(text ?? '') as { rateLimits?: unknown }
    return Array.isArray(value.rateLimits) ? (value.rateLimits as RateLimitLike[]) : null
  } catch {
    return null
  }
}

async function pollBrainstorm(x: LiveEngine, tracker: Tracker, now: number): Promise<void> {
  if (reader === null || root === null) return
  const dir = joinPath(root, '.ai', 'workflows', tracker.slug)
  const boardPath = joinPath(dir, 'brainstorm-board.json')
  const boardRead = await reader.changed(boardPath)
  let board: Record<string, unknown> | null = null
  try {
    board = boardRead.text === null ? null : (JSON.parse(boardRead.text) as Record<string, unknown>)
  } catch {
    board = null
  }
  const boardAt = await reader.mtime(boardPath)
  if (boardRead.changed && boardAt !== null) tracker.boardBeats = [...tracker.boardBeats, boardAt].slice(-40)
  tracker.boardAt = boardAt
  const count = async (sub: string, filter: (name: string) => boolean) => (await reader?.list(joinPath(dir, sub)) ?? []).filter(entry => filter(entry.name)).length
  const sources = {
    research: await count('research', name => /^R\d+/u.test(name)),
    references: await count('references', name => name !== 'index.md'),
    work: await count('work', name => name.endsWith('.md') && name !== 'index.md' && name !== 'changes.md'),
  }
  const index = (await reader.changed(joinPath(dir, 'work', 'index.md'))).text
  const revision = Number(frontmatterField(index ?? '', 'work-revision'))
  const change = newestChangeOf((await reader.changed(joinPath(dir, 'work', 'changes.md'))).text)
  // A brainstorm is a conversation: its pulse is the board's writes, judged against the 20-minute floor.
  const liveness = livenessFrom({ ...freshJournalState(), run: { ...freshJournalState().run, lastLineAt: boardAt, run: tracker.slug }, beats: tracker.boardBeats, lastLine: boardAt === null ? null : 'board written' }, now)
  const view = await viewOf(x)
  const model = buildBrainstormModel({ slug: tracker.slug, board, liveness, sources, revision: Number.isFinite(revision) && index !== null ? revision : null, change, dismissed: view.dismissed })
  for (const need of model.needs) toast(x, tracker, `split:${need.id}`, `wf brainstorm ${tracker.slug}: ${need.title} · ${need.body}`)
  const wasExploring = tracker.modelText === '' || /"mode":"explore"/u.test(tracker.modelText)
  tracker.isPrimed = true
  await writeModel(x, tracker, model)
  // Q3: the scope walk and done open the pane by themselves.
  if (wasExploring && model.mode !== 'explore' && !view.isOpen) await openPane(x, 'brainstorm', tracker.slug, false)
}

/** R3: the model is written only when it changed; the write redraws the pane. V8: a new need opens its section. */
async function writeModel(x: LiveEngine, tracker: Tracker, model: SdlcLiveModel): Promise<void> {
  const text = JSON.stringify(model)
  if (text === tracker.modelText) return
  tracker.modelText = text
  const key = keyOf(tracker.kind, tracker.slug)
  await x.updateModels(models => ({ ...(models ?? {}), [key]: model }))
  const needs = new Map(model.needs.map(need => [need.id, need]))
  await setView(x, view => {
    // The ids are `<kind>:<slug>|<need id>`: a section stays open while its need is on the list.
    const opened: Record<string, string> = {}
    for (const [id, section] of Object.entries(view.opened)) {
      if (!id.startsWith(`${key}|`) || needs.has(id.slice(key.length + 1))) opened[id] = section
    }
    for (const need of needs.values()) opened[`${key}|${need.id}`] ??= need.section
    return { ...view, opened }
  })
}

/** K1, K3: the status-line part and the band's live line, from the tab on screen. */
async function writeShared(x: LiveEngine): Promise<void> {
  const view = await viewOf(x)
  const current = view.current
  const models = await x.readModels().catch(() => ({}) as Record<string, SdlcLiveModel>)
  const model = current === null ? undefined : models[keyOf(current.kind, current.slug)]
  if (model === undefined) {
    await x.updateStatus(() => null)
    await x.updateBand(() => null)
    onStatus(null)
    return
  }
  const now = await x.now()
  const facts = factsOf(model, now)
  const isOver = facts.liveness.state === 'ended' || facts.liveness.state === 'none'
  const text = isOver ? null : liveStatusOf(facts)
  await x.updateStatus(previous => (text === null ? null : previous?.text === text ? previous : { text }))
  onStatus(text)
  await writeBand(x, null)
}

async function writeBand(x: LiveEngine, isPlaced: boolean | null): Promise<void> {
  const view = await viewOf(x)
  const current = view.current
  const models = await x.readModels().catch(() => ({}) as Record<string, SdlcLiveModel>)
  const model = current === null ? undefined : models[keyOf(current.kind, current.slug)]
  if (model === undefined || current === null) {
    await x.updateBand(() => null)
    return
  }
  const facts = factsOf(model, await x.now())
  const actions: SdlcLiveAction[] = facts.controls.slice(0, 2).map((control, index) => ({ key: control.key, label: control.armed ? control.armedLabel : control.label, hotkey: index === 0 ? '1' : '2', armed: control.armed }))
  const tone = facts.needs.length > 0 ? (facts.needs[0] as SdlcNeed).tone : facts.liveness.tone === 'stop' ? 'stop' : facts.focus.tone
  await x.updateBand(previous => {
    const band: SdlcLiveBand = { kind: current.kind, slug: current.slug, focus: bandFocusOf(facts), tone, actions, isPaneSeated: isPlaced ?? previous?.isPaneSeated ?? !isPaneOn }
    return JSON.stringify(previous) === JSON.stringify(band) ? (previous as SdlcLiveBand) : band
  })
}

// -------------------------------------------------------------------------
// Actions (section 6)
// -------------------------------------------------------------------------

/** The control file of the tab on screen: the slug's for yolo, the campaign's for a campaign. */
function controlPathOf(kind: Kind, slug: string): string | null {
  if (root === null) return null
  if (kind === 'campaign') return joinPath(root, '.ai', 'workflows', slug, 'work', 'campaign', '.control.json')
  if (kind === 'yolo') return joinPath(root, '.ai', 'workflows', slug, '.control.json')
  return null
}

/**
 * A3: the whole file in one write, then a read-back. The mod is a second
 * writer of `.control.json` beside the main session: it marks its own
 * requests with `by: "live-view"`, and clears only those.
 */
async function writeControl(x: LiveEngine, path: string, value: Record<string, unknown>): Promise<boolean> {
  const text = `${JSON.stringify(value, null, 2)}\n`
  try {
    await x.write(path, text)
    const back = await x.read(path)
    if (back === text) return true
  } catch (error) {
    fault('control write', error)
  }
  x.toast('wf live view: the stop request was not written', PUSH_TOAST_MS)
  return false
}

async function pressControl(x: LiveEngine, key: string): Promise<void> {
  const view = await viewOf(x)
  const current = view.current
  if (current === null) return
  const models = await x.readModels()
  const model = models[keyOf(current.kind, current.slug)]
  if (model === undefined) return
  const now = await x.now()
  const requestedAt = new Date(now).toISOString()
  const path = controlPathOf(current.kind, current.slug)
  if (model.kind === 'yolo' && path !== null && (key === 'stop-stage' || key === 'stop-verify')) {
    const after = key === 'stop-verify' ? 'verify' : (model.focus.stage ?? 'current')
    // A2: a second press of an armed button removes the request, while no agent acted on it.
    if (model.stop !== null && model.stop.after === after) {
      if (model.stop.by === 'live-view' && model.outcome === 'running') await writeControl(x, path, { action: 'none', clearedBy: 'live-view', at: requestedAt })
    } else {
      await writeControl(x, path, { action: 'stop', after, by: 'live-view', requestedAt, at: requestedAt })
    }
  } else if (model.kind === 'campaign' && path !== null && key === 'stop-wave') {
    if (model.stop !== null) {
      if (model.stop.by === 'live-view') await writeControl(x, path, { action: 'none', clearedBy: 'live-view', at: requestedAt })
    } else {
      await writeControl(x, path, { action: 'stop', scope: 'wave', after: 'wave', by: 'live-view', requestedAt, at: requestedAt })
    }
  } else if (model.kind === 'campaign' && path !== null && key === 'resume') {
    if (await writeControl(x, path, { action: 'resume', by: 'live-view', requestedAt })) await submit(x, `/wf campaign ${model.slug}`)
  } else if (model.kind === 'campaign' && key === 'prepare-next') {
    const need = model.needs.find(entry => entry.kind === 'prepare')
    const prompt = need?.actions.find(action => action.key === 'prepare')?.prompt
    if (prompt !== undefined) await submit(x, prompt)
  }
  const tracker = trackers.get(keyOf(current.kind, current.slug))
  if (tracker !== undefined) tracker.modelText = ''
  await pollAll(x)
}

async function submit(x: LiveEngine, text: string): Promise<void> {
  try {
    await x.submit(text)
  } catch (error) {
    fault('submit', error)
  }
}

async function needAction(x: LiveEngine, id: string, actionKey: string): Promise<void> {
  const view = await viewOf(x)
  const current = view.current
  if (current === null) return
  const model = (await x.readModels())[keyOf(current.kind, current.slug)]
  const need = model?.needs.find(entry => entry.id === id)
  const action = need?.actions.find(entry => entry.key === actionKey)
  if (need === undefined || action === undefined) return
  if (action.kind === 'prompt' && action.prompt !== undefined) await submit(x, action.prompt)
  if (action.kind === 'fill' && action.prompt !== undefined) {
    try {
      await x.fill(action.prompt)
    } catch (error) {
      fault('fill', error)
    }
  }
  // Keep, later and dismiss take the need off the list; so does a confirm, which the main session records.
  if (action.kind === 'dismiss' || actionKey === 'confirm') {
    await setView(x, state => ({ ...state, dismissed: [...new Set([...state.dismissed, id])].slice(-200) }))
    const tracker = trackers.get(keyOf(current.kind, current.slug))
    if (tracker !== undefined) tracker.modelText = ''
    await pollAll(x)
  }
}

async function toggleDetails(x: LiveEngine): Promise<void> {
  const view = await viewOf(x)
  const kind = view.current?.kind
  if (kind === undefined) return
  const next = !(view.details[kind] ?? detailsDefault)
  await setView(x, state => ({ ...state, details: { ...state.details, [kind]: next } }))
  try {
    await x.storeSet(detailsStoreKeyOf(kind), next)
  } catch (error) {
    fault('details store', error)
  }
}

async function cycleStyle(x: LiveEngine): Promise<void> {
  if (isStyleLocked) return
  try {
    await x.configSet(`${pluginName}.viewStyle`, nextViewStyle(style))
  } catch (error) {
    fault('style', error)
  }
}

async function selectTab(x: LiveEngine, kind: string, slug: string): Promise<void> {
  const live = kind === 'yolo' || kind === 'campaign' || kind === 'brainstorm' ? kind : null
  if (live === null) return
  await setView(x, view => ({ ...view, current: { kind: live, slug } }))
  await writeShared(x)
}

function actionsOf(x: LiveEngine): LiveActions {
  const run = (where: string, work: () => Promise<void>) => {
    void work().catch(error => fault(where, error))
  }
  return {
    control: key => run('control', () => pressControl(x, key)),
    need: (id, action) => run('need', () => needAction(x, id, action)),
    details: () => run('details', () => toggleDetails(x)),
    style: () => run('style', () => cycleStyle(x)),
    tab: (kind, slug) => run('tab', () => selectTab(x, kind, slug)),
  }
}

/** The live views start after the engine (`session.start` in `register.ts`): one hook per event per plugin. */
async function startLive(x: LiveEngine, cwd: string): Promise<void> {
  try {
    engine = x
    reader = new LiveReader(ioOf(x))
    trackers.clear()
    faulted.clear()
    timer?.cancel()
    timer = null
    pollMs = 0
    lastScanAt = 0
    root = await findProjectRoot(cwd, { list: path => x.list(path), read: path => x.read(path), exists: path => x.exists(path) })
    const profile = await x.home()
    home = profile === undefined || profile === '' ? null : profile
    try {
      const rows = await x.configList()
      isDarkTheme = isDarkThemeOf(rows.find(row => row.key === 'theme')?.value)
      isStyleLocked = rows.find(row => row.key === `${pluginName}.viewStyle`)?.isLocked === true
    } catch {
      // No config rows: the defaults stand.
    }
    try {
      rateLimits = ((await x.usage()).rateLimits ?? null) as RateLimitLike[] | null
    } catch {
      rateLimits = null
    }
    try {
      await x.registerCommand({ name: LIVE_COMMAND, description: 'Open the live view of the running yolo, campaign or brainstorm.', argumentHint: '[slug]' })
    } catch (error) {
      fault('command', error)
    }
    // V2: a reload keeps the view in `$.state`; the trackers re-read the files from the start.
    const view = await viewOf(x)
    for (const tab of view.tabs) trackers.set(keyOf(tab.kind, tab.slug), newTracker(tab.kind, tab.slug, await x.now()))
    for (const tracker of trackers.values()) tracker.isPrimed = false
    if (root !== null) await pollAll(x)
    schedule(x)
  } catch (error) {
    fault('session.start', error)
  }
}

/** O1: a `/wf yolo`, `/wf campaign` or `/wf brainstorm` turn follows its run (`turn.start` in `register.ts`). */
async function liveTurnStarted(x: LiveEngine, text: string): Promise<void> {
  try {
    const command = wfCommandOf(text)
    const kind = command === null ? null : liveKindOf(command.key)
    if (command !== null && kind !== null && command.slug !== null && root !== null) await follow(x, kind, command.slug, false)
  } catch (error) {
    fault('turn.start', error)
  }
}

export function registerLive(on: On, ctx: LiveContext): void {
  style = viewStyleOf(ctx.options['viewStyle'])
  isPaneOn = ctx.options['liveView'] !== false
  detailsDefault = ctx.options['liveViewDetails'] === true
  pluginName = ctx.pluginName
  onStatus = ctx.link.onStatus
  engine = null

  // -------------------------------------------------------------------------
  // Hooks
  // -------------------------------------------------------------------------

  // `$` never crosses an import, so these two events are hooked here, each with a matcher: the
  // engine allows one hook per event per plugin without one, and `register.ts` holds that one.
  on('session.start', { cwd: /./u }, async ($, e, next) => {
    const result = await next(e)
    // The live views start after the engine: they read the tree and follow a run a reload left open.
    await startLive(liveEngineOf($), e.cwd)
    return result
  })

  on('turn.start', { text: /(?:yolo|campaign|brainstorm)/u }, async ($, e, next) => {
    await liveTurnStarted(liveEngineOf($), e.text)
    return next(e)
  })

  ctx.link.measure = limits => {
    // U1: the engine pushes a new value when a window moves; no poll for usage.
    rateLimits = limits as RateLimitLike[]
  }

  on('command.run', { command: LIVE_COMMAND_PATTERN }, async ($, e) => {
    try {
      const x = liveEngineOf($)
      const slug = e.args.trim()
      const view = await viewOf(x)
      const tab = slug === '' ? view.current : (view.tabs.find(entry => entry.slug === slug) ?? null)
      if (tab !== null) {
        await follow(x, tab.kind, tab.slug, true)
        return { text: openedTextOf(tab.kind, tab.slug, await openPane(x, tab.kind, tab.slug, true)) }
      }
      if (slug !== '' && root !== null) {
        const isCampaign = (await reader?.mtime(joinPath(root, '.ai', 'workflows', slug, 'work', 'campaign', 'ledger.json'))) != null
        const isBoard = (await reader?.mtime(joinPath(root, '.ai', 'workflows', slug, 'brainstorm-board.json'))) != null
        const kind: Kind = isCampaign ? 'campaign' : isBoard ? 'brainstorm' : 'yolo'
        await follow(x, kind, slug, true)
        return { text: openedTextOf(kind, slug, await openPane(x, kind, slug, true)) }
      }
      return { text: 'No yolo, campaign or brainstorm runs here. Start one, or name its slug: /wf-live <slug>.' }
    } catch (error) {
      fault('command', error)
      return { text: `The live view did not open: ${messageOf(error)}` }
    }
  })

  on('ui.render', { component: 'Pane', requestId: LIVE_PANE }, async ($, e, next) => {
    try {
      const view = await read($, liveViewAtom)
      const models = await read($, liveModelsAtom)
      const current = view.current
      const model = current === null ? undefined : models[keyOf(current.kind, current.slug)]
      const table = $.ui.resolve(e)
      const ui = styleUiOf(table)
      if (model === undefined || current === null) {
        noteDraw(true, `live pane · ${e.surface} · no model${current === null ? '' : ` for ${current.kind} ${current.slug}`}`)
        const { Text } = ui
        return Text({ dimColor: true, children: 'No live run yet. It opens when a yolo, campaign or brainstorm starts.' }) as RenderElement
      }
      const now = await $.clock.now()
      const facts = factsOf(model, now)
      const key = keyOf(current.kind, current.slug)
      const opened = Object.entries(view.opened)
        .filter(([id]) => id.startsWith(`${key}|`))
        .map(([, section]) => section)
      const paneView: PaneView = {
        surface: e.surface,
        now,
        columns: e.props.bodyColumns,
        details: view.details[current.kind] ?? detailsDefault,
        opened,
        tabs: view.tabs.map(tab => ({ kind: tab.kind, slug: tab.slug, isCurrent: tab.kind === current.kind && tab.slug === current.slug })),
        hasStyleButton: !isStyleLocked,
        style,
        palette: paletteOf(style, e.surface, isDarkTheme),
      }
      const tree = paneRendererOf(style)(ui, facts, paneView, actionsOf(liveEngineOf($)))
      noteDraw(true, `live pane · ${e.surface} · ${current.kind} ${current.slug} · ${style}`)
      return tree
    } catch (error) {
      fault('ui.render', error)
      noteDraw(false, `live pane · ${e.surface} · ${messageOf(error)}`)
      return next(e)
    }
  })

  on('ui.close', { id: LIVE_PANE }, async ($, e, next) => {
    const result = await next(e)
    try {
      const x = liveEngineOf($)
      await setView(x, view => ({ ...view, isOpen: false, isAsked: false }))
      schedule(x)
    } catch (error) {
      fault('ui.close', error)
    }
    return result
  })

  /** One row per distinct outcome a session: the pane redraws every poll. */
  const noted = new Set<string>()
  const noteDraw = (ok: boolean, detail: string): void => {
    if (noted.has(detail)) return
    noted.add(detail)
    ctx.link.note(ok, detail)
  }

  ctx.link.press = key => {
    const x = engine
    if (x === null) return
    void pressControl(x, key).catch(error => fault('band', error))
  }
  ctx.link.open = () => {
    const x = engine
    if (x === null) return
    void viewOf(x)
      .then(view => (view.current === null ? undefined : openPane(x, view.current.kind, view.current.slug, true)))
      .catch(error => fault('band open', error))
  }
}
