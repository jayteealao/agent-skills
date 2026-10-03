/**
 * facts → the campaign view's model (WF-LIVE-VIEWS-PLAN.md 3.4). Pure (M1).
 *
 * The ledger (`work/campaign/ledger.json`) is the truth of waves and units.
 * The campaign journal adds the gate lights: each boundary step writes one
 * line with its wave (merge, wave-verify, drift, refuter, fidelity, then
 * released, merged or wave-end for the ship).
 */
import type { SdlcCampaignModel, SdlcGates, SdlcLiveness, SdlcNeed, SdlcStageMark, SdlcUsage } from '../../../../types'
import { askedNeedOf, openNeedsOf, outsideNeedOf, pausedNeedOf, prepareNeedOf, staleNeedOf } from './needs.ts'
import type { ControlFact } from './yolo.ts'
import { YOLO_STAGES } from './yolo.ts'

/** The gate each campaign journal event lights. */
const GATE_OF_EVENT: Record<string, keyof SdlcGates> = {
  merge: 'merge',
  'wave-verify': 'verify',
  drift: 'drift',
  refuter: 'refuter',
  fidelity: 'fidelity',
  released: 'ship',
  merged: 'ship',
  'wave-end': 'ship',
}

/** The gates each wave passed, by wave number, after new campaign journal lines. */
export function gatesAfter(previous: Readonly<Record<string, string[]>>, lines: ReadonlyArray<Record<string, unknown>>): Record<string, string[]> {
  const next: Record<string, string[]> = Object.fromEntries(Object.entries(previous).map(([wave, gates]) => [wave, [...gates]]))
  for (const line of lines) {
    const gate = GATE_OF_EVENT[String(line['event'] ?? '')]
    const wave = Number(line['wave'] ?? line['n'])
    if (gate === undefined || !Number.isFinite(wave)) continue
    const key = String(wave)
    const list = next[key] ?? []
    if (!list.includes(gate)) list.push(gate)
    next[key] = list
  }
  return next
}

/** The slugs that wrote a `lock-wait` line since the lock last changed hands. */
export function lockWaitsAfter(previous: readonly string[], lines: ReadonlyArray<Record<string, unknown>>): string[] {
  let waiting = [...previous]
  for (const line of lines) {
    const event = String(line['event'] ?? '')
    const slug = typeof line['slug'] === 'string' ? line['slug'] : typeof line['holder'] === 'string' ? line['holder'] : null
    if (slug === null) continue
    if (event === 'lock-wait' && !waiting.includes(slug)) waiting.push(slug)
    if (event === 'lock' || event === 'lock-acquired' || event === 'lock-release') waiting = waiting.filter(entry => entry !== slug)
  }
  return waiting
}

/** Where one running unit's drive stands, from its own driver journal. */
export type UnitDrive = { stage: string | null; startedAt: number | null; status: string | null }

export type CampaignFacts = {
  slug: string
  now: number
  ledger: Record<string, unknown> | null
  liveness: SdlcLiveness
  gates: Readonly<Record<string, readonly string[]>>
  drives: Readonly<Record<string, UnitDrive>>
  heavy: { holder: string | null; waiting: readonly string[] }
  usage: SdlcUsage
  control: ControlFact | null
  dismissed: readonly string[]
}

type Wave = { n: number; state: string; units: string[]; version: string | null; label: string | null; pr: string | null }
type Unit = { slug: string; state: string; wave: number | null; title: string | null }

const LIVE_WAVE_STATES = new Set(['running', 'boundary', 'handoff', 'shipping'])

function wavesOf(ledger: Record<string, unknown> | null): Wave[] {
  const raw = Array.isArray(ledger?.['waves']) ? (ledger?.['waves'] as unknown[]) : []
  return raw
    .filter((wave): wave is Record<string, unknown> => wave !== null && typeof wave === 'object')
    .map(wave => ({
      n: Number(wave['n']),
      state: typeof wave['state'] === 'string' ? wave['state'] : 'planned',
      units: Array.isArray(wave['units']) ? (wave['units'] as unknown[]).filter((unit): unit is string => typeof unit === 'string') : [],
      version: typeof wave['version'] === 'string' ? wave['version'] : null,
      label: typeof wave['label'] === 'string' ? wave['label'] : null,
      pr: typeof wave['pr'] === 'string' ? wave['pr'] : typeof wave['pr'] === 'number' ? `#${wave['pr']}` : null,
    }))
    .filter(wave => Number.isFinite(wave.n))
}

function unitsOf(ledger: Record<string, unknown> | null): Record<string, Unit> {
  const raw = ledger?.['units']
  if (raw === null || typeof raw !== 'object') return {}
  const out: Record<string, Unit> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === null || typeof value !== 'object') continue
    const unit = value as Record<string, unknown>
    out[key] = {
      slug: typeof unit['slug'] === 'string' ? unit['slug'] : key,
      state: typeof unit['state'] === 'string' ? unit['state'] : 'planned',
      wave: typeof unit['wave'] === 'number' ? unit['wave'] : null,
      title: typeof unit['title'] === 'string' ? unit['title'] : null,
    }
  }
  return out
}

function marksOf(unit: Unit, drive: UnitDrive | undefined): SdlcStageMark[] {
  if (['finished', 'merged', 'shipped'].includes(unit.state)) return YOLO_STAGES.map(() => 'done')
  const at = drive?.stage === null || drive === undefined ? -1 : (YOLO_STAGES as readonly string[]).indexOf(drive.stage)
  if (unit.state === 'stopped' || unit.state === 'needs-fix') return YOLO_STAGES.map((_, i) => (i < at ? 'done' : i === at ? 'stop' : 'wait'))
  if (unit.state !== 'running' || at === -1) return YOLO_STAGES.map(() => 'wait')
  return YOLO_STAGES.map((_, i) => (i < at ? 'done' : i === at ? 'run' : 'wait'))
}

function noteOf(unit: Unit, drive: UnitDrive | undefined, heavy: CampaignFacts['heavy'], now: number, needsPrepare: boolean): string {
  if (unit.state === 'running') {
    const parts = [drive?.stage ?? 'starting']
    if (drive?.startedAt != null) parts.push(`${Math.max(0, Math.round((now - drive.startedAt) / 60000))}m`)
    if (heavy.holder === unit.slug) parts.push('holds lock')
    else if (heavy.waiting.includes(unit.slug)) parts.push('waits for lock')
    return parts.join(' · ')
  }
  if (needsPrepare) return 'needs prepare'
  if (unit.state === 'prepared') return 'prepared'
  if (unit.state === 'stopped' || unit.state === 'needs-fix') return unit.state
  if (unit.state === 'planned') return 'waiting'
  return ''
}

export function buildCampaignModel(facts: CampaignFacts): SdlcCampaignModel {
  const { ledger, slug, now } = facts
  const waves = wavesOf(ledger)
  const units = unitsOf(ledger)
  const live = waves.filter(wave => LIVE_WAVE_STATES.has(wave.state))
  const activeWave = live[0]?.n ?? null
  const next = waves.find(wave => wave.state === 'planned') ?? null
  // The units that need a prepare: those of the next planned wave, and of a live wave, still planned.
  const prepareWaves = new Set([...live.map(wave => wave.n), ...(next === null ? [] : [next.n])])
  const needsPrepare = (key: string) => {
    const unit = units[key]
    return unit !== undefined && unit.state === 'planned' && unit.wave !== null && prepareWaves.has(unit.wave)
  }

  const needs: SdlcNeed[] = []
  const pauseRaw = ledger?.['pause']
  const paused =
    pauseRaw !== null && typeof pauseRaw === 'object'
      ? { until: typeof (pauseRaw as Record<string, unknown>)['until'] === 'string' ? ((pauseRaw as Record<string, unknown>)['until'] as string) : null, reason: typeof (pauseRaw as Record<string, unknown>)['reason'] === 'string' ? ((pauseRaw as Record<string, unknown>)['reason'] as string) : null }
      : null
  if (paused !== null) needs.push(pausedNeedOf(slug, paused.until, paused.reason))
  for (const wave of waves) for (const key of wave.units) if (needsPrepare(key)) needs.push(prepareNeedOf(slug, key, units[key]?.slug ?? key, wave.n))
  const questions = Array.isArray(ledger?.['questions']) ? (ledger?.['questions'] as unknown[]) : []
  for (const raw of questions) {
    if (raw === null || typeof raw !== 'object') continue
    const question = raw as Record<string, unknown>
    if (question['answered-at']) continue
    needs.push(askedNeedOf(slug, String(question['id'] ?? '?'), String(question['text'] ?? ''), typeof question['wave'] === 'number' ? question['wave'] : null))
  }
  const outside = ledger?.['outside']
  if (outside !== null && typeof outside === 'object') {
    for (const [key, raw] of Object.entries(outside as Record<string, unknown>)) {
      if (raw === null || typeof raw !== 'object') continue
      const entry = raw as Record<string, unknown>
      if (entry['state'] !== 'needs-you') continue
      needs.push(outsideNeedOf(slug, key, String(entry['slug'] ?? key), String(entry['form'] ?? 'task'), String(entry['title'] ?? '')))
    }
  }
  if (facts.liveness.state === 'stale' && activeWave !== null && facts.liveness.lastLineAt !== null) needs.unshift(staleNeedOf(slug, 'campaign', Math.round((now - facts.liveness.lastLineAt) / 60000)))

  const modelWaves = waves.map(wave => {
    const passed = new Set(facts.gates[String(wave.n)] ?? [])
    const shipped = wave.state === 'shipped'
    const gates: SdlcGates = {
      merge: shipped || passed.has('merge'),
      verify: shipped || passed.has('verify'),
      drift: shipped || passed.has('drift'),
      refuter: shipped || passed.has('refuter'),
      fidelity: shipped || passed.has('fidelity'),
      ship: shipped || passed.has('ship'),
    }
    return {
      n: wave.n,
      state: wave.state,
      version: wave.version,
      gates,
      slugs: wave.units.map(key => {
        const unit = units[key] ?? { slug: key, state: 'planned', wave: wave.n, title: null }
        const drive = facts.drives[unit.slug]
        return { key, slug: unit.slug, state: unit.state, marks: marksOf(unit, drive), note: noteOf(unit, drive, facts.heavy, now, needsPrepare(key)) }
      }),
    }
  })

  const outputs = waves.filter(wave => wave.pr !== null || wave.version !== null).map(wave => ({ wave: wave.n, pr: wave.pr, state: wave.state, label: wave.version ?? wave.label }))
  const unshipped = waves.filter(wave => wave.state !== 'shipped' && wave.label !== null)
  const usage = facts.usage
  const forecast: SdlcCampaignModel['forecast'] = usage.level === 'unknown' ? null : usage.level === 'pause' ? 'does-not-fit' : usage.level === 'slow' ? 'tight' : 'fits'
  const control = facts.control
  const stop = control !== null && control.action === 'stop' && control.after !== null ? { after: control.after, by: control.by ?? 'person', requestedAt: control.requestedAt } : null

  return {
    kind: 'campaign',
    slug,
    liveness: facts.liveness,
    activeWave,
    running: Object.values(units).filter(unit => unit.state === 'running').length,
    paused,
    waves: modelWaves,
    needs: openNeedsOf(needs, facts.dismissed),
    usage,
    forecast,
    outputs,
    build: unshipped[unshipped.length - 1]?.label ?? null,
    heavy: { holder: facts.heavy.holder, waiting: [...facts.heavy.waiting] },
    stop,
  }
}

/** The holder of `.scratch/campaign/heavy.lock`, or null. */
export function heavyHolderOf(text: string | null): string | null {
  if (text === null) return null
  try {
    const value = JSON.parse(text) as { holder?: unknown }
    return typeof value.holder === 'string' ? value.holder : null
  } catch {
    return null
  }
}
