/**
 * Usage for the live views (WF-LIVE-VIEWS-PLAN.md 5.4): the 5-hour and 7-day
 * windows with their reset times, against the budget lines. An unknown value
 * is null and draws as `—`, never as 0 (U3).
 */
import { usageLevelOf } from '../../../../lib/live-events.mjs'
import type { SdlcUsage, SdlcUsageWindow } from '../../../../types'

export type Budget = { fiveHourSlow: number; fiveHourPause: number; sevenDayReserve: number }
export const DEFAULT_BUDGET: Budget = { fiveHourSlow: 75, fiveHourPause: 90, sevenDayReserve: 15 }

/** One rate-limit window as the engine or the usage guard's file gives it. */
export type RateLimitLike = { kind?: unknown; percentUsed?: unknown; resetsAt?: unknown }

function windowOf(limits: readonly RateLimitLike[], kind: string): SdlcUsageWindow {
  const found = limits.find(limit => limit && limit.kind === kind)
  if (found === undefined) return { percent: null, resetsAt: null }
  const percent = typeof found.percentUsed === 'number' && Number.isFinite(found.percentUsed) ? found.percentUsed : null
  const resetsAt = typeof found.resetsAt === 'string' ? found.resetsAt : null
  return { percent, resetsAt }
}

export function usageOf(limits: readonly RateLimitLike[] | null, budget: Budget = DEFAULT_BUDGET): SdlcUsage {
  const list = limits ?? []
  const fiveHour = windowOf(list, 'five_hour')
  const sevenDay = windowOf(list, 'seven_day')
  return { fiveHour, sevenDay, level: usageLevelOf(fiveHour.percent, sevenDay.percent, budget), slow: budget.fiveHourSlow, pause: budget.fiveHourPause }
}

/** The budget lines of `.ai/sdlc-config.json` `yolo.usageBudget`, else the defaults. */
export function budgetOf(configText: string | null): Budget {
  if (configText === null) return DEFAULT_BUDGET
  try {
    const config = JSON.parse(configText) as { yolo?: { usageBudget?: Partial<Budget> } }
    const own = config.yolo?.usageBudget ?? {}
    const pick = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
    return {
      fiveHourSlow: pick(own.fiveHourSlow, DEFAULT_BUDGET.fiveHourSlow),
      fiveHourPause: pick(own.fiveHourPause, DEFAULT_BUDGET.fiveHourPause),
      sevenDayReserve: pick(own.sevenDayReserve, DEFAULT_BUDGET.sevenDayReserve),
    }
  } catch {
    return DEFAULT_BUDGET
  }
}

/** The status-line part of the usage (K1): `5h 76 %`, or null when unknown. */
export function usageStatusOf(usage: SdlcUsage): string | null {
  const percent = usage.fiveHour.percent
  return percent === null ? null : `5h ${Math.round(percent)} %`
}
