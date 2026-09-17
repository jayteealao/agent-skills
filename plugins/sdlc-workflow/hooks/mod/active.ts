/**
 * The active workflow and the turn bracket: pure helpers the strip, the
 * next-step suggestion, the stage-landed check, the driver status, and the
 * dashboard read. Nothing here touches the engine.
 */
import { entryOf } from './catalog.ts'
import type { SliceEntry, WorkflowEntry } from './workflows.ts'

/** The settings the manifest's `userConfig` declares, defaults filled in. */
export type Settings = {
  strip: boolean
  suggestNext: boolean
  stageCheck: boolean
  questionProgress: boolean
  driverStatus: boolean
  spinnerVerb: boolean
  cost: boolean
  hubNotice: boolean
}

export const SETTING_NAMES: ReadonlyArray<keyof Settings> = [
  'strip',
  'suggestNext',
  'stageCheck',
  'questionProgress',
  'driverStatus',
  'spinnerVerb',
  'cost',
  'hubNotice',
]

/** Every setting on, as the manifest defaults them. */
export const DEFAULT_SETTINGS: Settings = {
  strip: true,
  suggestNext: true,
  stageCheck: true,
  questionProgress: true,
  driverStatus: true,
  spinnerVerb: true,
  cost: true,
  hubNotice: true,
}

/** The settings from the plugin's options: a boolean field takes its value, anything else its default. */
export function settingsOf(options: Readonly<Record<string, unknown>>): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS }
  for (const name of SETTING_NAMES) {
    const value = options[name]
    if (typeof value === 'boolean') settings[name] = value
  }
  return settings
}

/** The setting a `config.set` key names (`sdlc-workflow.strip`), or null. */
export function settingOfKey(pluginName: string, key: string): keyof Settings | null {
  const prefix = `${pluginName}.`
  if (!key.startsWith(prefix)) return null
  const name = key.slice(prefix.length)
  return (SETTING_NAMES as readonly string[]).includes(name) ? (name as keyof Settings) : null
}

/** The `/wf` command a turn ran, parsed from the prompt text. */
export type WfCommand = { key: string; slug: string | null; slice: string | null }

/**
 * The `/wf <key> [slug] [slice]` a prompt starts with, or null. A
 * `/wf-<key> ...` command and the namespaced `/sdlc-workflow:wf` form parse
 * the same way. An unknown key is null: the dispatcher refuses it.
 */
export function wfCommandOf(text: string): WfCommand | null {
  const match = /^\s*\/(?:sdlc-workflow:)?wf(?:-([a-z-]+))?(?:\s+(.*))?$/su.exec(text)
  if (match === null) return null
  const rest = (match[2] ?? '').trim()
  const tokens = rest === '' ? [] : rest.split(/\s+/u)
  let key = match[1] ?? null
  if (key === null) {
    key = tokens.shift() ?? null
  }
  if (key === null || entryOf(key) === null) return null
  const slug = tokens[0] ?? null
  const slice = tokens[1] ?? null
  return { key, slug: slug === undefined ? null : slug, slice: slice === undefined ? null : slice }
}

/** The stage file a key writes for a slug and a slice, or null when the key writes none the check can name. */
export function expectedArtifactOf(command: WfCommand): string | null {
  const { key, slice } = command
  const withSlice = (stem: string) => (slice === null || slice === 'all' ? null : `${stem}-${slice}.md`)
  switch (key) {
    case 'shape':
      return '02-shape.md'
    case 'slice':
      return '03-slice.md'
    case 'plan':
      return withSlice('04-plan')
    case 'implement':
      return withSlice('05-implement')
    case 'verify':
      return withSlice('06-verify')
    case 'handoff':
      return '08-handoff.md'
    case 'ship':
      return '09-ship.md'
    case 'retro':
      return '10-retro.md'
    default:
      return null
  }
}

/** True when `path` lies under `<root>/.ai/workflows`, on either slash. */
export function isWorkflowPath(root: string, path: string): boolean {
  const base = `${normalizePath(root)}/.ai/workflows/`
  return normalizePath(path).startsWith(base)
}

/** The workflow slug a path under `.ai/workflows` belongs to, or null. */
export function slugOfPath(root: string, path: string): string | null {
  const base = `${normalizePath(root)}/.ai/workflows/`
  const normal = normalizePath(path)
  if (!normal.startsWith(base)) return null
  const rest = normal.slice(base.length)
  const slug = rest.split('/')[0] ?? ''
  return slug === '' || rest.indexOf('/') === -1 ? null : slug
}

/** The file name at the end of a path. */
export function basenameOf(path: string): string {
  const normal = normalizePath(path)
  return normal.slice(normal.lastIndexOf('/') + 1)
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** The strip's first row for a workflow: slug, stage, slice with its roster count, and the next step. */
export function stripTextOf(workflow: WorkflowEntry, slices: readonly SliceEntry[]): string {
  const parts = [`wf ${workflow.slug}`]
  if (workflow.terminal) {
    parts.push(`closed (${workflow.status})`)
    return parts.join(' · ')
  }
  if (workflow.status !== 'active') parts.push(workflow.status)
  if (workflow.currentStage) parts.push(workflow.currentStage)
  if (workflow.selectedSlice) {
    const complete = slices.filter(slice => slice.status === 'complete' || slice.status === 'completed').length
    const count = slices.length > 0 ? ` (${complete} of ${slices.length} complete)` : ''
    parts.push(`slice ${workflow.selectedSlice}${count}`)
  }
  if (workflow.nextInvocation) parts.push(`next: ${workflow.nextInvocation}`)
  return parts.join(' · ')
}

/**
 * The pinned status line, the one row that stays when the band is hidden:
 * the next invocation (the strip's identity and roster are not repeated),
 * the last stage's dollars, and the hub in short.
 */
export function statusTextOf(workflow: WorkflowEntry, stageUsd: number | null = null, hub: HubHealth | null = null): string {
  const parts: string[] = []
  if (workflow.terminal) parts.push(`wf ${workflow.slug} · closed`)
  else if (workflow.nextInvocation) parts.push(`next ${workflow.nextInvocation}`)
  else parts.push([`wf ${workflow.slug}`, workflow.currentStage, workflow.selectedSlice].filter(Boolean).join(' · '))
  if (stageUsd !== null) parts.push(`$${stageUsd.toFixed(2)} stage`)
  if (hub !== null) parts.push(hubShortTextOf(hub))
  return parts.join(' · ')
}

/** `hub 9.157.0` or `hub down`, for the rows that have no room for the notice. */
export function hubShortTextOf(hub: HubHealth): string {
  return hub.ok ? `hub ${hub.version ?? '?'}` : 'hub down'
}

/** The workflows the strip rotates through: the active ones by slug, in a ring. */
export function nextActiveSlug(workflows: readonly WorkflowEntry[], current: string | null): string | null {
  const ring = workflows.filter(w => !w.terminal).map(w => w.slug).sort()
  if (ring.length === 0) return null
  const at = current === null ? -1 : ring.indexOf(current)
  return ring[(at + 1) % ring.length] ?? null
}

/** Rows a text takes when wrapped into `columns` cells (one at least). */
export function wrappedRowsOf(text: string, columns: number): number {
  const width = Math.max(1, columns)
  return Math.max(1, Math.ceil(text.length / width))
}

/** The footer mode label for a workflow, or null for a closed one. */
export function modeLabelOf(workflow: WorkflowEntry): string | null {
  if (workflow.terminal || !workflow.currentStage) return null
  return `wf:${workflow.currentStage}`
}

/** The spinner's word while a `/wf <key>` turn runs, or null to keep the engine's. */
export function spinnerWordOf(command: WfCommand): string | null {
  const verbs: Record<string, string> = {
    shape: 'Shaping',
    slice: 'Slicing',
    plan: 'Planning',
    implement: 'Implementing',
    verify: 'Verifying',
    review: 'Reviewing',
    handoff: 'Handing off',
    ship: 'Shipping',
    retro: 'Reflecting',
    design: 'Designing',
    probe: 'Probing',
    simplify: 'Simplifying',
    auto: 'Driving',
    yolo: 'Driving',
    task: 'Working',
    status: 'Inspecting',
    recap: 'Recapping',
    close: 'Closing',
    docs: 'Documenting',
    observability: 'Instrumenting',
  }
  const verb = verbs[command.key]
  if (verb === undefined) return null
  const target = command.slice ?? command.slug
  return target === null ? verb : `${verb} ${target}`
}

/** The tokens a `cost.jsonl` ledger sums to, main and subagent rows alike. */
export function ledgerTokensOf(text: string): number {
  let total = 0
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() === '') continue
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (!row || typeof row !== 'object') continue
    const record = row as { main?: unknown; subagents?: unknown }
    total += tokensOf(record.main)
    if (Array.isArray(record.subagents)) for (const sub of record.subagents) total += tokensOf(sub)
  }
  return total
}

function tokensOf(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0
  const u = usage as Record<string, unknown>
  const int = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0)
  return (
    int(u['input_tokens']) +
    int(u['output_tokens']) +
    int(u['cache_read_input_tokens']) +
    int(u['cached_input_tokens']) +
    int(u['cache_creation_input_tokens']) +
    int(u['cache_write_input_tokens']) +
    int(u['reasoning_output_tokens'])
  )
}

/** `1.2M`, `340k`, `900` for a token count. */
export function tokensText(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`
  return String(count)
}

/** The strip's detail row: the last stage in dollars, the workflow in ledger tokens, and the hub. */
export function costTextOf(stageUsd: number | null, ledgerTokens: number | null, hub: HubHealth | null = null): string | null {
  const parts: string[] = []
  if (stageUsd !== null) parts.push(`$${stageUsd.toFixed(2)} this stage`)
  if (ledgerTokens !== null) parts.push(`${tokensText(ledgerTokens)} tokens workflow`)
  if (hub !== null) parts.push(hubNoticeTextOf(hub))
  return parts.length === 0 ? null : parts.join(' · ')
}

/** One heartbeat line of `.driver-journal.jsonl`. */
export type Beat = { at: number; run: string; event: string; agent: string | null; phase: string | null; stage: string | null; slice: string | null }

export function beatsOf(text: string): Beat[] {
  const beats: Beat[] = []
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() === '') continue
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const at = typeof r['at'] === 'string' ? Date.parse(r['at']) : typeof r['at'] === 'number' ? r['at'] : NaN
    if (!Number.isFinite(at)) continue
    const str = (v: unknown) => (typeof v === 'string' ? v : null)
    beats.push({ at, run: str(r['run']) ?? '', event: str(r['event']) ?? '', agent: str(r['agent']), phase: str(r['phase']), stage: str(r['stage']), slice: str(r['slice']) })
  }
  return beats
}

/** The presumed-dead floor: a single slow first agent is never called dead. */
export const DEAD_FLOOR_MS = 20 * 60 * 1000

/**
 * The driver status line from the newest run's beats: running with its
 * elapsed time and last beat, or presumed dead when the silence exceeds the
 * run's own longest gap (20-minute floor), the rule of `_control-file-ownership.md`.
 */
export function driverStatusOf(key: string, beats: readonly Beat[], now: number): string {
  if (beats.length === 0) return `${key} · no driver journal`
  const last = beats[beats.length - 1] as Beat
  const run = beats.filter(beat => beat.run === last.run)
  const first = run[0] as Beat
  let longestGap = 0
  for (let i = 1; i < run.length; i += 1) longestGap = Math.max(longestGap, (run[i] as Beat).at - (run[i - 1] as Beat).at)
  const silence = now - last.at
  // An `agent-end` row may omit the stage: the newest row of the run that names one says where.
  const placed = [...run].reverse().find(beat => beat.stage !== null) ?? last
  const where = [placed.stage, placed.slice].filter(Boolean).join(' ')
  if (silence > Math.max(longestGap, DEAD_FLOOR_MS)) {
    return `${key} · presumed dead since ${clockText(last.at)} · last: ${where || last.event}`
  }
  const parts = [key, `run ${last.run}`]
  if (where) parts.push(where)
  if (last.agent) parts.push(`agent ${last.agent}`)
  parts.push(`${minutesText(now - first.at)} min`, `last beat ${minutesText(silence)} min ago`)
  return parts.join(' · ')
}

function minutesText(ms: number): string {
  return String(Math.max(0, Math.round(ms / 60000)))
}

function clockText(at: number): string {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** The hub health answer's fields the notice draws. */
export type HubHealth = { version: string | null; repos: number | null; stale: number | null; ok: boolean }

export function hubHealthOf(text: string): HubHealth {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return { version: null, repos: null, stale: null, ok: false }
  }
  if (!body || typeof body !== 'object') return { version: null, repos: null, stale: null, ok: false }
  const r = body as Record<string, unknown>
  const version = typeof r['version'] === 'string' ? r['version'] : null
  const entries = Array.isArray(r['entries']) ? (r['entries'] as Array<Record<string, unknown>>) : null
  const repos = entries === null ? null : entries.length
  const stale = entries === null ? null : entries.filter(entry => entry['stale'] === true).length
  return { version, repos, stale, ok: r['ok'] === true }
}

export function hubNoticeTextOf(health: HubHealth | null): string {
  if (health === null || !health.ok) return 'sdlc hub down'
  const parts = [`sdlc hub ${health.version ?? '?'}`]
  if (health.repos !== null) parts.push(`${health.repos} repos`)
  if (health.stale !== null && health.stale > 0) parts.push(`${health.stale} renders stale`)
  return parts.join(' · ')
}

/** The three-cell progress mark of a slice: plan, implement, verify. */
export function sliceMarkOf(slice: SliceEntry): string {
  const filled = slice.stage === 'verified' ? 3 : slice.stage === 'implemented' ? 2 : slice.stage === 'planned' ? 1 : 0
  return '▰'.repeat(filled) + '▱'.repeat(3 - filled)
}

/**
 * The items of a YAML list under a top-level key (`findings:`), each as its
 * scalar fields; null when the text has no such list. Enough YAML for the
 * ledgers: a list item starts with `- `, its fields are `key: value` lines
 * indented past the dash, and nested lists are skipped.
 */
export function yamlListItemsOf(text: string, key: string): Array<Record<string, string>> | null {
  const lines = text.split(/\r?\n/u)
  const start = lines.findIndex(line => line.replace(/\s+$/u, '') === `${key}:`)
  if (start === -1) return null
  const items: Array<Record<string, string>> = []
  let item: Record<string, string> | null = null
  /** The column of the items' dashes, from the first; a deeper dash is a nested list. */
  let itemIndent = -1
  /** The column of the items' fields, from the first; a deeper line is nested. */
  let fieldIndent = -1
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue
    if (/^\S/u.test(line)) break
    const indent = line.length - line.trimStart().length
    const dash = /^\s*-\s*(.*)$/u.exec(line)
    if (dash !== null && (itemIndent === -1 || indent === itemIndent)) {
      itemIndent = indent
      item = {}
      items.push(item)
      const field = /^([\w-]+):\s*(.*)$/u.exec(dash[1] ?? '')
      if (field !== null) {
        fieldIndent = indent + 2
        item[field[1] as string] = unquoted(field[2] ?? '')
      }
      continue
    }
    if (dash !== null || item === null || indent <= itemIndent) continue
    if (fieldIndent === -1) fieldIndent = indent
    if (indent !== fieldIndent) continue
    const field = /^([\w-]+):\s*(.*)$/u.exec(line.trimStart())
    if (field !== null && !((field[1] as string) in item)) item[field[1] as string] = unquoted(field[2] ?? '')
  }
  return items
}

function unquoted(value: string): string {
  const trimmed = value.trim()
  const quoted = /^"(.*)"$|^'(.*)'$/u.exec(trimmed)
  return quoted ? (quoted[1] ?? quoted[2] ?? '').trim() : trimmed
}

/** The finding statuses a review ledger counts as open (review/_artifact.md Step 5b). */
const OPEN_FINDING_STATUSES: ReadonlySet<string> = new Set(['open', 'deferred', 'could-not-fix'])

/**
 * Open rows of a review ledger: the `findings:` items whose status is open
 * (absent counts as open), else, without such a list, unchecked markdown rows.
 */
export function openFindingsOf(text: string): number {
  const items = yamlListItemsOf(text, 'findings')
  if (items !== null) return items.filter(item => OPEN_FINDING_STATUSES.has((item['status'] ?? 'open').toLowerCase())).length
  return (text.match(/^\s*[-*]\s+\[ \]\s/gmu) ?? []).length
}

/** Open BLOCKER and HIGH findings of `.ai/ship-plan-audit.md`: the rows its triage gate counts. */
export function shipPlanBlockersOf(text: string): number {
  const items = yamlListItemsOf(text, 'findings') ?? []
  return items.filter(item => (item['status'] ?? 'open').toLowerCase() === 'open' && /^(?:BLOCKER|HIGH)$/iu.test(item['severity'] ?? '')).length
}

/**
 * The review ledger a workflow's dashboard row reads, from the names in its
 * directory: the sweep-level sibling YAML (`07-review.yaml`, else the selected
 * slice's), else the last YAML by name; the markdown by the same rule when
 * there is no YAML.
 */
export function reviewLedgerNameOf(names: readonly string[], selectedSlice: string | null): string | null {
  const ledgers = names.filter(name => /^07-review.*\.(?:md|yaml)$/u.test(name)).sort()
  for (const extension of ['yaml', 'md']) {
    const own = ledgers.filter(name => name.endsWith(`.${extension}`))
    if (own.length === 0) continue
    const sweep =
      own.find(name => name === `07-review.${extension}`) ??
      (selectedSlice === null ? undefined : own.find(name => name === `07-review-${selectedSlice}.${extension}`))
    return sweep ?? (own[own.length - 1] as string)
  }
  return null
}
