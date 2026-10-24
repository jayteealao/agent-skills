/**
 * facts → the brainstorm view's model (WF-LIVE-VIEWS-PLAN.md 3.5). Pure (M1).
 *
 * The board (`brainstorm-board.json`) holds the threads, the items, the
 * scope calls and the packets of the list (`work[]`). An item takes its own `scope`
 * when the board records one, else its area's; an area marked `mixed` leaves
 * its items undecided until the board records them (the note of 3.5).
 */
import type { SdlcBrainstormModel, SdlcLiveness, SdlcNeed } from '../../../../types'
import { openNeedsOf, splitNeedOf } from './needs.ts'

export type BrainstormFacts = {
  slug: string
  board: Record<string, unknown> | null
  liveness: SdlcLiveness
  sources: { research: number; references: number; work: number }
  /** The `list-revision` of `work/index.md`, or null. */
  revision: number | null
  /** The newest row of `work/changes.md`, or null. */
  change: string | null
  dismissed: readonly string[]
}

type Call = 'keep' | 'cut' | 'later' | null

const records = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object') : []

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

function callOf(value: unknown): Call {
  return value === 'keep' || value === 'cut' || value === 'later' ? value : value === 'pending-cut' ? 'cut' : null
}

/** WF-PIECES-PLAN 4.2: a packet is sized by its estimated slices (target 10, band 6 to 14), not by its decisions. 0 = no estimate. */
export const SLICE_MAX = 14
function sizeOf(work: Record<string, unknown>): number {
  const est = work['estimated-slices']
  return typeof est === 'number' && Number.isInteger(est) && est > 0 ? est : 0
}

export function buildBrainstormModel(facts: BrainstormFacts): SdlcBrainstormModel {
  const board = facts.board
  const areas = records(board?.['areas'])
  const threads = records(board?.['threads'])
  const items = records(board?.['items'])
  const works = records(board?.['work'])
  const log = records(board?.['log'])
  const areaCall = new Map<string, Call>(areas.map(area => [text(area['key']), area['scope'] === 'mixed' ? null : callOf(area['scope'])]))
  const threadArea = new Map<string, string>(threads.map(thread => [text(thread['key']), text(thread['area'])]))

  const modelThreads = threads
    .filter(thread => thread['state'] !== 'dropped')
    .map(thread => {
      const key = text(thread['key'])
      return {
        key,
        name: text(thread['name']) || key,
        items: items
          .filter(item => item['thread'] === key && !item['replaced-by'])
          .map(item => ({
            key: text(item['key']),
            text: text(item['text']),
            call: item['scope'] !== undefined && item['scope'] !== null ? callOf(item['scope']) : (areaCall.get(threadArea.get(key) ?? '') ?? null),
          })),
      }
    })

  const all = modelThreads.flatMap(thread => thread.items)
  const walk = {
    walked: all.filter(item => item.call !== null).length,
    keep: all.filter(item => item.call === 'keep').length,
    cut: all.filter(item => item.call === 'cut').length,
    later: all.filter(item => item.call === 'later').length,
    total: all.length,
  }

  const isWalking = log.some(entry => entry['kind'] === 'walk') || walk.walked > 0
  const mode: SdlcBrainstormModel['mode'] = works.length > 0 ? 'done' : isWalking ? 'scope' : 'explore'
  const newest = log[log.length - 1]
  const last = newest === undefined ? null : { asked: text(newest['asked']) || null, answer: text(newest['answer']) || null }

  const packets = works
    .slice()
    .sort((a, b) => Number(a['order'] ?? 0) - Number(b['order'] ?? 0))
    .map(work => ({ key: text(work['key']), title: text(work['title']), size: sizeOf(work), state: text(work['state']) || 'proposed' }))

  // D38: above 14 slices the walk warns and continues; the need proposes a split the person may decline.
  const needs: SdlcNeed[] = packets.filter(packet => packet.size > SLICE_MAX && !['open', 'built', 'done', 'dropped'].includes(packet.state)).map(packet => splitNeedOf(facts.slug, packet.key, packet.size))

  return {
    kind: 'brainstorm',
    slug: facts.slug,
    liveness: facts.liveness,
    mode,
    last,
    threads: modelThreads,
    walk,
    packets,
    sources: facts.sources,
    revision: { n: facts.revision, change: facts.change },
    needs: openNeedsOf(needs, facts.dismissed),
  }
}

/** The newest entry of `work/changes.md` (a `- ` line of the last revision, or an old table row), as plain words, or null. */
export function newestChangeOf(changesText: string | null): string | null {
  if (changesText === null) return null
  const lines = changesText.split(/\r?\n/u)
  const bullets = lines.filter(line => line.startsWith('- '))
  const bullet = bullets[bullets.length - 1]
  if (bullet !== undefined) return bullet.slice(2).replace(/`/gu, '').trim()
  const rows = lines
    .filter(line => line.startsWith('|') && !/^\|\s*-/u.test(line))
    .slice(1)
  const last = rows[rows.length - 1]
  if (last === undefined) return null
  return last
    .split('|')
    .map(cell => cell.trim())
    .filter(Boolean)
    .join(' · ')
}
