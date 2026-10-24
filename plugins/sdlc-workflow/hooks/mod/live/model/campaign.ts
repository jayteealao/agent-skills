/**
 * facts → the campaign view's model (WF-PIECES-PLAN.md 6.1). Pure (M1).
 *
 * The campaign keeps no ledger. Its state is the `state` field of each piece
 * file `work/<piece-slug>.md`, in the order `work/index.md` lists the keys.
 * The view shows the pieces in order, the state of each, the current piece
 * (the first that is not done or dropped), and the build pieces whose design
 * waits on the person.
 */
import type { SdlcCampaignModel, SdlcLiveness, SdlcNeed, SdlcPiece } from '../../../../types'
import { designNeedOf, openNeedsOf } from './needs.ts'

/** The forms the walk builds (`lib/pieces.mjs` BUILD_FORMS); the others route to their own command. */
export const BUILD_FORMS: ReadonlySet<string> = new Set(['intake', 'fix', 'hotfix', 'extension'])
/** The states that end a piece: the walk moves past them. */
const FINISHED_STATES: ReadonlySet<string> = new Set(['done', 'dropped'])

/** One piece as the live module read it: the piece file, and the files of the workflow it opened. */
export type PieceFact = {
  key: string
  slug: string
  title: string
  form: string
  state: string
  order: number
  /** The piece file's `ux-impact`. */
  pieceUxImpact: string | null
  /** The workflow's `00-index.md`, or null while the piece is not opened. */
  indexText: string | null
  /** The workflow's `02c-craft.md`, or null. */
  craftText: string | null
}

export type CampaignFacts = {
  slug: string
  /** The `pieces:` keys of `work/index.md`, in list order. */
  order: readonly string[]
  pieces: readonly PieceFact[]
  liveness: SdlcLiveness
  dismissed: readonly string[]
}

function frontmatterBodyOf(text: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text)
  return match ? (match[1] ?? '') : null
}

function unquote(value: string): string {
  const trimmed = value.trim()
  const quoted = /^"(.*)"$|^'(.*)'$/u.exec(trimmed)
  // A plain value ends at its comment; a quoted one keeps its `#`.
  return quoted ? (quoted[1] ?? quoted[2] ?? '').trim() : trimmed.replace(/\s+#.*$/u, '').trim()
}

/** A top-level scalar of the frontmatter, or null. */
export function fieldOf(text: string | null, field: string): string | null {
  const body = text === null ? null : frontmatterBodyOf(text)
  if (body === null) return null
  for (const line of body.split(/\r?\n/u)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line)
    if (match && match[1] === field) return unquote(match[2] ?? '')
  }
  return null
}

/** One child scalar of a top-level map (`progress:` then `  design: skipped`), or null. */
export function childFieldOf(text: string | null, parent: string, child: string): string | null {
  const body = text === null ? null : frontmatterBodyOf(text)
  if (body === null) return null
  const lines = body.split(/\r?\n/u)
  const start = lines.findIndex(line => new RegExp(`^${parent}:\\s*$`, 'u').test(line))
  if (start < 0) return null
  for (const line of lines.slice(start + 1)) {
    if (/^\S/u.test(line)) break
    const match = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line)
    if (match && match[1] === child) return unquote(match[2] ?? '')
  }
  return null
}

/** A top-level list of scalars, as a block (`  - a`) or in flow (`[a, b]`); empty when absent. */
export function listFieldOf(text: string | null, field: string): string[] {
  const body = text === null ? null : frontmatterBodyOf(text)
  if (body === null) return []
  const lines = body.split(/\r?\n/u)
  const start = lines.findIndex(line => line.startsWith(`${field}:`))
  if (start < 0) return []
  const inline = (lines[start] as string).slice(field.length + 1).trim()
  if (inline.startsWith('[')) {
    return inline
      .replace(/^\[|\]$/gu, '')
      .split(',')
      .map(unquote)
      .filter(entry => entry !== '')
  }
  const out: string[] = []
  for (const line of lines.slice(start + 1)) {
    const item = /^\s*-\s+(.*)$/u.exec(line)
    if (item) {
      out.push(unquote(item[1] ?? ''))
      continue
    }
    if (/^\S/u.test(line)) break
  }
  return out.filter(entry => entry !== '')
}

/**
 * Whether the design is settled (`design/_lane.md`, "Design is settled"), from
 * the frontmatter alone: not reopened, and either skipped with a reason or a
 * confirmed `02c-craft.md` with a resolved image gate. The board files are not
 * checked here; `campaign.mjs status` and the pre-write hook check them.
 */
export function designSettledOf(indexText: string | null, craftText: string | null): boolean {
  const progress = childFieldOf(indexText, 'progress', 'design')
  if (progress === 'in-progress') return false
  if (progress === 'skipped' && (fieldOf(indexText, 'design-skip-reason') ?? '') !== '') return true
  if (craftText === null) return false
  const gate = fieldOf(craftText, 'image-gate') ?? ''
  if (gate !== 'pass' && !/^skipped:\s*\S/u.test(gate)) return false
  return (fieldOf(craftText, 'direction-confirmed-by') ?? '') !== ''
}

const isUi = (impact: string | null): boolean => impact !== null && impact !== '' && impact !== 'none'

/** A piece of the list: a build piece needs design once its workflow exists, names a ux-impact other than none, and has not settled it. */
export function pieceOf(fact: PieceFact): SdlcPiece {
  const isBuild = BUILD_FORMS.has(fact.form)
  const indexImpact = fieldOf(fact.indexText, 'ux-impact')
  const uxImpact = indexImpact ?? fact.pieceUxImpact
  const designNeeded = isBuild && !FINISHED_STATES.has(fact.state) && fact.indexText !== null && isUi(indexImpact) && !designSettledOf(fact.indexText, fact.craftText)
  return { key: fact.key, slug: fact.slug, title: fact.title, form: fact.form, state: fact.state, uxImpact, isBuild, designNeeded }
}

export function buildCampaignModel(facts: CampaignFacts): SdlcCampaignModel {
  const rank = new Map(facts.order.map((key, index) => [key, index]))
  // The list's order first; a piece the index does not name goes after, by its own `order`.
  const sorted = [...facts.pieces].sort((a, b) => (rank.get(a.key) ?? facts.order.length + a.order) - (rank.get(b.key) ?? facts.order.length + b.order))
  const pieces = sorted.map(pieceOf)
  const current = pieces.find(piece => !FINISHED_STATES.has(piece.state)) ?? null
  const needs: SdlcNeed[] = pieces.filter(piece => piece.designNeeded).map(piece => designNeedOf(piece.slug, piece.uxImpact ?? 'unset'))
  return {
    kind: 'campaign',
    slug: facts.slug,
    liveness: facts.liveness,
    pieces,
    current: current?.key ?? null,
    needs: openNeedsOf(needs, facts.dismissed),
  }
}
