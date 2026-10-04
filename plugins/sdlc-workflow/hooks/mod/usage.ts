/**
 * The usage guard's pure parts (WF-CAMPAIGN-PLAN.md section 17). The hooks
 * live in `usage-guard.ts`; everything here takes values and returns values,
 * so `tests/unit/mod/usage-guard.harness.mjs` runs it under Node.
 *
 * A reading is the rate-limit windows the session's last API response
 * reported. The guard writes the newest reading of each session to
 * `~/.claude/sdlc/usage/<sessionId>.json` (one file per session, because a
 * mod's file write is not atomic), and appends each change to
 * `<sessionId>.history.jsonl`, which measures how fresh the readings stay
 * while background agents run (probe P4). The campaign script and the yolo
 * watch read the newest `.json` file.
 */

export type RateLimit = { kind: string; percentUsed: number; resetsAt?: string }
export type Reading = { sessionId: string; at: string; source: string; rateLimits: RateLimit[] }
export type Budget = { fiveHourSlow: number; fiveHourPause: number; sevenDayReserve: number }
export type Level = { level: 'ok' | 'slow' | 'pause'; until: string | null; reason: string }
export type Target = { kind: 'campaign' | 'yolo'; name: string; file: string; budget: Budget }
/**
 * A pause the guard wrote, kept in the plugin store, which every session of
 * every project shares: `root` and `session` say which session resumes it.
 */
export type GuardPause = { file: string; until: string | null; kind?: string; name?: string; root?: string; session?: string }

/** The `by` field of a pause the guard wrote: the guard clears only its own pauses. */
export const GUARD_TAG = 'usage-guard'
export const DEFAULT_BUDGET: Budget = { fiveHourSlow: 75, fiveHourPause: 90, sevenDayReserve: 15 }
const LIVE_WAVE_STATES = ['running', 'boundary', 'handoff', 'shipping']
/** History lines kept per session file; the oldest go first. */
export const HISTORY_CAP = 2000

const usageDirOf = (home: string) => `${home.replace(/[\\/]+$/u, '')}/.claude/sdlc/usage`
export const usageFileOf = (home: string, sessionId: string) => `${usageDirOf(home)}/${sessionId}.json`
export const usageHistoryFileOf = (home: string, sessionId: string) => `${usageDirOf(home)}/${sessionId}.history.jsonl`

export function readingOf(input: { sessionId: string; at: number; rateLimits: readonly RateLimit[]; source: string }): Reading {
  return {
    sessionId: input.sessionId,
    at: new Date(input.at).toISOString(),
    source: input.source,
    rateLimits: input.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, ...(r.resetsAt === undefined ? {} : { resetsAt: r.resetsAt }) })),
  }
}

/** One history line: the time, the source, and each window's percent. */
export function historyLineOf(r: Reading): string {
  const row: Record<string, string | number> = { at: r.at, source: r.source }
  for (const w of r.rateLimits) row[w.kind] = w.percentUsed
  return JSON.stringify(row)
}

const LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

/** The status line text: `usage 5h 42% · 7d 18%`, or null without a reading. */
export function usageStatusOf(limits: readonly RateLimit[]): string | null {
  if (!limits.length) return null
  return `usage ${limits.map(w => `${LABELS[w.kind] ?? w.kind} ${w.percentUsed}%`).join(' · ')}`
}

/** 17.2: the level of a live reading against a budget. */
export function levelOf(limits: readonly RateLimit[], budget: Budget): Level {
  const five = limits.find(w => w.kind === 'five_hour')
  const seven = limits.find(w => w.kind === 'seven_day')
  if (seven && seven.percentUsed >= 100 - budget.sevenDayReserve) {
    return { level: 'pause', until: seven.resetsAt ?? null, reason: `7-day window at ${seven.percentUsed}%: the last ${budget.sevenDayReserve}% is the person's reserve` }
  }
  if (five && five.percentUsed >= budget.fiveHourPause) return { level: 'pause', until: five.resetsAt ?? null, reason: `5-hour window at ${five.percentUsed}%` }
  if (five && five.percentUsed >= budget.fiveHourSlow) return { level: 'slow', until: null, reason: `5-hour window at ${five.percentUsed}%` }
  return { level: 'ok', until: null, reason: '' }
}

const RANK = { ok: 0, slow: 1, pause: 2 } as const

/** The toast for a level that rose, or null. */
export function crossToastOf(previous: Level['level'] | null, next: Level): string | null {
  if (next.level === 'ok' || RANK[next.level] <= RANK[previous ?? 'ok']) return null
  return next.level === 'pause'
    ? `Usage: ${next.reason}. Live runs pause${next.until ? ` until ${next.until}` : ''}.`
    : `Usage: ${next.reason}. Campaigns start no new slug while another runs.`
}

/** A yolo run's budget from `.ai/sdlc-config.json` (`yolo.usageBudget`). */
export function budgetOfConfig(config: unknown): Budget {
  const yolo = (config as { yolo?: { usageBudget?: Partial<Budget> } } | null)?.yolo
  return { ...DEFAULT_BUDGET, ...(yolo?.usageBudget ?? {}) }
}

type LedgerLike = {
  waves?: Array<{ state: string; units: string[] }>
  units?: Record<string, { slug?: string }>
  pause?: unknown
  answers?: { budget?: Partial<Budget> | null }
}

/**
 * 17.1 step 4: the runs a pause goes to. A campaign is live while a wave runs,
 * merges, or waits in handoff or ship, and no pause holds it. A yolo run is
 * live while its watch has not ended; a slug of a live campaign reads the
 * campaign's control file, so it is no separate target.
 */
export function pauseTargetsOf(input: {
  campaigns: Array<{ brainstorm: string; ledger: LedgerLike | null }>
  watches: Array<{ slug: string; state: { ended?: boolean } | null }>
  budget: Budget
}): Target[] {
  const out: Target[] = []
  const campaignSlugs = new Set<string>()
  for (const { brainstorm, ledger } of input.campaigns) {
    if (!ledger || ledger.pause) continue
    const live = (ledger.waves ?? []).filter(w => LIVE_WAVE_STATES.includes(w.state))
    if (!live.length) continue
    for (const w of live) for (const k of w.units) { const s = ledger.units?.[k]?.slug; if (s) campaignSlugs.add(s) }
    out.push({ kind: 'campaign', name: brainstorm, file: `.ai/workflows/${brainstorm}/work/campaign/.control.json`, budget: { ...DEFAULT_BUDGET, ...(ledger.answers?.budget ?? {}) } })
  }
  for (const { slug, state } of input.watches) {
    if (!state || state.ended !== false || campaignSlugs.has(slug)) continue
    out.push({ kind: 'yolo', name: slug, file: `.ai/workflows/${slug}/.control.json`, budget: input.budget })
  }
  return out
}

/** The control file text of a pause the guard writes (17.4 step 1). */
export function pauseControlOf(target: Pick<Target, 'kind'>, p: { until: string | null; reason: string; now: number }): string {
  const scope = target.kind === 'campaign' ? { scope: 'campaign' } : {}
  return `${JSON.stringify({ action: 'pause', ...scope, until: p.until, reason: p.reason, requestedAt: new Date(p.now).toISOString(), by: GUARD_TAG }, null, 2)}\n`
}

/** The control file text after the reset: no request holds (the engine has no delete). */
export function clearedControlOf(now: number): string {
  return `${JSON.stringify({ action: 'none', clearedBy: GUARD_TAG, at: new Date(now).toISOString() }, null, 2)}\n`
}

/** The pauses whose reset time passed. A pause with no reset time waits for the person. */
export function resumeDue<T extends GuardPause>(pauses: readonly T[], now: number): T[] {
  return pauses.filter(p => p.until !== null && Number.isFinite(Date.parse(p.until)) && Date.parse(p.until) <= now)
}

/** 17.6 step 1: the prompt that resumes the run. */
export function resumePromptOf(target: Pick<Target, 'kind' | 'name'>): string {
  return `The usage window reset. Resume the run with /wf ${target.kind === 'campaign' ? 'campaign' : 'yolo'} ${target.name}.`
}
