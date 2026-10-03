/**
 * The usage guard (WF-CAMPAIGN-PLAN.md section 17, Stage D3). It is its own
 * file, and `register.ts` calls its two handlers from its own `session.start`
 * and `session.measure` hooks: a plugin names one hooks module, and a module
 * hooks each event once. The handlers catch their own failures, so a fault
 * here never reaches the `/wf` hooks.
 *
 * 1. Reading: `session.measure` when the rate limits moved, and a 60-second
 *    timer that asks `$.session.usage()`.
 * 2. Recording: the newest reading to `~/.claude/sdlc/usage/<sessionId>.json`,
 *    and each change to `<sessionId>.history.jsonl` (probe P4).
 * 3. Showing: both windows in the status line; a toast when a budget line is crossed.
 * 4. Pausing: when a live campaign or yolo run crosses its pause line, the
 *    guard writes the pause into the run's control file. The next agent of the
 *    run stops at its stage boundary. No model turn runs.
 * 5. Resuming: when the reset time passed, the guard clears its own pause and
 *    submits the resume command as a prompt (probe P5), with a toast as well.
 * 6. Restarting: the timer starts at `session.start`, and again from the first
 *    `session.measure` when no timer runs (after `/clear` or `/resume`).
 *
 * The switch is `usageGuard`.
 */
import type { Hook } from 'claude-code'

import {
  GUARD_TAG, HISTORY_CAP, budgetOfConfig, clearedControlOf, crossToastOf, historyLineOf, levelOf, pauseControlOf,
  pauseTargetsOf, readingOf, resumeDue, resumePromptOf, usageFileOf, usageHistoryFileOf, usageStatusOf,
} from './usage.ts'
import type { GuardPause, Level, RateLimit, Target } from './usage.ts'
import { findProjectRoot, joinPath } from './workflows.ts'
import type { Reader } from './workflows.ts'

const TICK_MS = 60_000
const PAUSES_KEY = 'usage-guard:pauses'

export type GuardIo = {
  cwd: string
  home: () => Promise<string | undefined>
  sessionId: () => Promise<string>
  now: () => Promise<number>
  usage: () => Promise<readonly RateLimit[]>
  read: (path: string) => Promise<string | null>
  write: (path: string, text: string) => Promise<void>
  list: (path: string) => Promise<Array<{ name: string; kind: string }>>
  exists: (path: string) => Promise<boolean>
  status: (text: string | undefined) => void
  toast: (text: string) => void
  submit: (text: string) => Promise<unknown>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  every: (ms: number, fn: () => void) => { cancel: () => void }
}

const parse = (text: string | null): unknown => {
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

type MeasureInput = Parameters<Hook<'session.measure'>>[1]

export type UsageGuard = {
  /** From the `session.start` hook: binds the host and starts the timer. */
  start: (host: GuardIo) => void
  /** From the `session.measure` hook. */
  measure: (e: MeasureInput) => Promise<void>
}

/** `isEnabled` reads the `usageGuard` switch at each call, so a change takes effect at the next reading. */
export function createUsageGuard(isEnabled: () => boolean): UsageGuard {
  let io: GuardIo | null = null
  let timer: { cancel: () => void } | null = null
  /** The highest level seen per target file, for the toast and so a pause is written once. */
  const levels = new Map<string, Level['level']>()
  let lastHistory = ''
  /** One write at a time: the engine's file write is not atomic. */
  let queue: Promise<void> = Promise.resolve()
  const serial = (fn: () => Promise<void>) => {
    queue = queue.then(fn).catch(() => undefined)
    return queue
  }

  async function liveTargets(root: string): Promise<Target[]> {
    if (!io) return []
    const dir = joinPath(root, '.ai', 'workflows')
    const entries = (await io.list(dir)).filter(e => e.kind === 'dir')
    const campaigns: Array<{ brainstorm: string; ledger: never | null }> = []
    const watches: Array<{ slug: string; state: { ended?: boolean } | null }> = []
    for (const e of entries) {
      const ledger = parse(await io.read(joinPath(dir, e.name, 'work', 'campaign', 'ledger.json')))
      if (ledger) campaigns.push({ brainstorm: e.name, ledger: ledger as never })
      const state = parse(await io.read(joinPath(dir, e.name, '.watch-state.json')))
      if (state) watches.push({ slug: e.name, state: state as { ended?: boolean } })
    }
    const config = parse(await io.read(joinPath(root, '.ai', 'sdlc-config.json')))
    return pauseTargetsOf({ campaigns, watches, budget: budgetOfConfig(config) })
  }

  async function record(limits: readonly RateLimit[], source: string) {
    if (!io || !limits.length) return
    const home = await io.home()
    const sessionId = await io.sessionId()
    const now = await io.now()
    if (home && sessionId) {
      const reading = readingOf({ sessionId, at: now, rateLimits: limits, source })
      await serial(async () => {
        if (!io) return
        await io.write(usageFileOf(home, sessionId), `${JSON.stringify(reading, null, 2)}\n`)
        const line = historyLineOf(reading)
        const key = line.replace(/"at":"[^"]*",/u, '')
        if (key === lastHistory) return
        lastHistory = key
        const file = usageHistoryFileOf(home, sessionId)
        const prior = (await io.read(file)) ?? ''
        const lines = `${prior}${line}\n`.split('\n').filter(Boolean).slice(-HISTORY_CAP)
        await io.write(file, `${lines.join('\n')}\n`)
      })
    }
    const text = usageStatusOf(limits)
    if (text) io.status(text)
    const root = await findProjectRoot(io.cwd, { list: p => io!.list(p) as never, read: async p => (await io!.read(p)) ?? '', exists: p => io!.exists(p) } satisfies Reader)
    if (!root) return
    for (const target of await liveTargets(root)) {
      const file = joinPath(root, target.file)
      const level = levelOf(limits, target.budget)
      const previous = levels.get(file) ?? null
      const toast = crossToastOf(previous, level)
      if (toast) io.toast(toast)
      levels.set(file, level.level)
      if (level.level !== 'pause' || previous === 'pause') continue
      await serial(async () => {
        if (!io) return
        await io.write(file, pauseControlOf(target, { until: level.until, reason: `usage guard: ${level.reason}`, now }))
        const pauses = ((await io.storeGet(PAUSES_KEY)) as GuardPause[] | undefined) ?? []
        await io.storeSet(PAUSES_KEY, [...pauses.filter(p => p.file !== file), { file, until: level.until, kind: target.kind, name: target.name }])
      })
    }
  }

  async function resume() {
    if (!io) return
    const pauses = ((await io.storeGet(PAUSES_KEY)) as GuardPause[] | undefined) ?? []
    const due = resumeDue(pauses, await io.now())
    if (!due.length) return
    for (const p of due) {
      const current = parse(await io.read(p.file)) as { by?: string; until?: string } | null
      // Clear only the guard's own pause: the person may have written another request since.
      if (current?.by === GUARD_TAG && current.until === p.until) await io.write(p.file, clearedControlOf(await io.now()))
      levels.delete(p.file)
      const text = resumePromptOf({ kind: p.kind === 'campaign' ? 'campaign' : 'yolo', name: p.name ?? '' })
      io.toast(text)
      try {
        await io.submit(text)
      } catch {
        // P5 fallback: the toast stands, and the person types the command.
      }
    }
    await io.storeSet(PAUSES_KEY, pauses.filter(p => !due.includes(p)))
  }

  async function tick() {
    try {
      if (!io || !isEnabled()) return
      await record(await io.usage(), 'timer')
      await resume()
    } catch {
      // A failed tick waits for the next one.
    }
  }

  function startTimer() {
    if (timer || !io || !isEnabled()) return
    timer = io.every(TICK_MS, () => {
      void tick()
    })
  }

  function start(host: GuardIo) {
    timer?.cancel()
    timer = null
    io = host
    if (!isEnabled()) return
    startTimer()
  }

  async function measure(e: MeasureInput) {
    if (!isEnabled() || !io) return
    try {
      startTimer()
      if (e.changed.includes('rateLimits')) await record(e.rateLimits, 'measure')
    } catch {
      // The guard never blocks a measurement.
    }
  }

  return { start, measure }
}
