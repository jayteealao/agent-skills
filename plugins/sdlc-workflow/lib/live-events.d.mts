// Types of lib/live-events.mjs for the mod's TypeScript (hooks/mod/live).

export type JournalLine = Record<string, unknown>

export type RunState = {
  run: string | null
  lastLineAt: number | null
  prevLineAt: number | null
  longestGapMs: number
  newest: { event: string | null; agent: string | null; status: string | null; at: string | null } | null
  ended: boolean
  staleFor: string | null
  decisionsSeen: string[]
  openStages: Record<string, string | null>
}

export type ArtifactFact = { rel: string; status: string | null; signal: { reasons: string[]; intentBearing: number } | null; mtime: number }

export type LiveEvent = { event: string; slug: string; run: string | null; [field: string]: unknown }

export const STAGE_KINDS: readonly string[]
export const STAGE_FILE: Readonly<Record<string, string>>
export const STALE_FLOOR_MS: number
export function parseJsonLines(text: string): { lines: JournalLine[]; consumed: number }
export function stageOf(line: JournalLine | null | undefined): { stage: string | null; slice: string | null }
export function frontmatterField(text: string | null | undefined, field: string): string | null
export function decisionSignalOf(text: string, yaml?: string): { reasons: string[]; intentBearing: number } | null
export function intentRecordsOf(text: string, yaml?: string): Array<{ id: string; text: string }>
export function freshRunState(): RunState
export function liveLimitMs(st: RunState): number
export function applyLines(
  slug: string,
  st: RunState,
  lines: readonly JournalLine[],
  options?: { emitFrom?: { run: string; seq: number } | null; artifactOf?: (stage: string, slice: string | null) => ArtifactFact | null },
): LiveEvent[]
export function judgeSilence(slug: string, st: RunState, nowMs: number, watchStartMs: number): LiveEvent[]
export function livenessOf(st: RunState, nowMs: number): { state: 'none' | 'live' | 'quiet' | 'stale' | 'ended'; silentMs: number | null; limitMs: number }
export function usageLevelOf(fivePercent: number | null, sevenPercent: number | null, budget: { fiveHourSlow: number; fiveHourPause: number; sevenDayReserve: number }): 'ok' | 'slow' | 'pause' | 'unknown'
