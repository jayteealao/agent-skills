/**
 * The read ledger and the read check (ARTIFACT-SPLIT-PLAN.md S6, W4, Y3–Y5).
 *
 * The mod records every Read of a workflow artifact or a `/wf` procedure file
 * with its line ranges, per agent. When an agent writes a stage artifact that
 * a `## Requires` table names in a `writes` row of a stage the agent runs
 * (`writerStagesOf`), the check compares those
 * reads with the table's `always` and `if-present` rows. A file counts as read
 * only when the ranges cover it, or cover each named `##` section.
 *
 * Everything here is pure: the file checks take an `Io` the caller binds.
 * Nothing here touches the engine.
 */

/** The kind cell of a `## Requires` row. */
export type RequiresKind = 'artifact' | 'procedure' | 'writes'

/** One row of a `## Requires` table, as `scripts/build-requires.mjs` emits it. */
export type RequiresRow = {
  /** The path in the Input cell, without backticks; placeholders `<slice>`, `<mode>`, glob `*`. */
  input: string
  kind: RequiresKind
  /** `always`, `if-present`, `on-resume`, `mode:<name>`; empty on a `writes` row. */
  when: string
  /** The exact `##` heading texts the read must cover; empty means the whole file. */
  sections: readonly string[]
}

/** One stage reference's `## Requires` table. */
export type RequiresEntry = {
  /** The reference path relative to `skills/wf/reference/` (`intake/fix.md`). */
  reference: string
  /** The stage key (`plan`, `intake:fix`, `augment:benchmark`). */
  stage: string
  rows: readonly RequiresRow[]
}

/** The ledger key of the main conversation, which carries no `agentId`. */
export const MAIN_AGENT = 'main'

/** The check's setting: `warn` adds context after the write, `block` denies before it, `off` does nothing. */
export type ReadCheckMode = 'warn' | 'block' | 'off'

export const READ_CHECK_MODES: readonly ReadCheckMode[] = ['warn', 'block', 'off']

/** The mode a setting value names, `warn` for anything else. */
export function readCheckModeOf(value: unknown): ReadCheckMode {
  return typeof value === 'string' && (READ_CHECK_MODES as readonly string[]).includes(value) ? (value as ReadCheckMode) : 'warn'
}

/** The per-workflow file each check appends one row to. Never `.driver-journal.jsonl`. */
export const READ_LEDGER_FILE = '.read-ledger.jsonl'

/** The slice roster: a write-back by a non-slice writer is not checked. */
export const SLICE_MASTER = '03-slice.md'

/** The ledger key of an agent: its id, or `main`. */
export function agentKeyOf(agentId: string | undefined): string {
  return agentId === undefined || agentId === '' ? MAIN_AGENT : agentId
}

// ---------------------------------------------------------------------------
// Paths

/** Where a read or written path sits for the check, with the id the ledger keys it by. */
export type PathClass =
  | { kind: 'artifact'; slug: string; file: string; id: string }
  | { kind: 'procedure'; rel: string; id: string }
  | { kind: 'project'; rel: string; id: string }

const WORKFLOWS_MARKER = '/.ai/workflows/'
const REFERENCE_MARKER = '/skills/wf/reference/'

/** Forward slashes, one at a time, no trailing slash; the case is kept. */
export function slashPath(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/{2,}/gu, '/').replace(/\/+$/u, '')
}

/**
 * Classifies a path: a workflow artifact (`.ai/workflows/<slug>/<file>`), a
 * procedure file (`skills/wf/reference/<rel>` anywhere, a plugin cache dir
 * too), a project-level `.ai/` file under `root`, or null for anything else.
 */
export function classifyPath(path: string, root: string | null = null): PathClass | null {
  const normal = slashPath(path)
  const probe = normal.startsWith('/') ? normal : `/${normal}`
  const lower = probe.toLowerCase()
  const workflows = lower.lastIndexOf(WORKFLOWS_MARKER)
  if (workflows >= 0) {
    const rest = probe.slice(workflows + WORKFLOWS_MARKER.length)
    const slash = rest.indexOf('/')
    if (slash <= 0 || slash === rest.length - 1) return null
    const slug = rest.slice(0, slash)
    const file = rest.slice(slash + 1)
    return { kind: 'artifact', slug, file, id: artifactIdOf(slug, file) }
  }
  const reference = lower.lastIndexOf(REFERENCE_MARKER)
  if (reference >= 0) {
    const rel = probe.slice(reference + REFERENCE_MARKER.length)
    if (rel === '') return null
    return { kind: 'procedure', rel, id: procedureIdOf(rel) }
  }
  if (root !== null) {
    const base = `${slashPath(root).toLowerCase()}/.ai/`
    const plain = normal.toLowerCase()
    if (plain.startsWith(base) && plain.length > base.length) {
      const rel = normal.slice(base.length - '.ai/'.length)
      return { kind: 'project', rel, id: projectIdOf(rel) }
    }
  }
  return null
}

function cleanInput(input: string): string {
  return slashPath(input.trim().replace(/^`|`$/gu, '')).replace(/^\.\//u, '')
}

export function artifactIdOf(slug: string, file: string): string {
  return `wf:${slug.toLowerCase()}/${cleanInput(file).toLowerCase()}`
}

export function procedureIdOf(rel: string): string {
  return `ref:${cleanInput(rel).replace(/^\/+/u, '').toLowerCase()}`
}

export function projectIdOf(rel: string): string {
  return `prj:${cleanInput(rel).replace(/^\/+/u, '').toLowerCase()}`
}

/** The ledger id of a Requires input for a workflow. */
export function inputIdOf(kind: RequiresKind, input: string, slug: string): string {
  if (kind === 'procedure') return procedureIdOf(input)
  if (input.startsWith('/.ai/')) return projectIdOf(input)
  return artifactIdOf(slug, input)
}

// ---------------------------------------------------------------------------
// Reads

/** A covered line range, 1-based, both ends included. */
export type Range = readonly [number, number]

/**
 * What one agent read of one file: the merged ranges, the file's length, the
 * last path read, and the sequence number of its last read (`readMarkOf`).
 */
export type FileReads = { path: string; ranges: Range[]; totalLines: number; seq?: number }

/** The count of reads recorded in this module's life: a turn notes it at its start. */
let readSeq = 0

/** The sequence number of the last read recorded: a read after the mark has a higher one. */
export function readMarkOf(): number {
  return readSeq
}

/** One agent's reads, by ledger id. */
export type AgentReads = Map<string, FileReads>

/** Every agent's reads, by agent key. */
export type ReadLedger = Map<string, AgentReads>

/** One Read as the tool answered it. */
export type ReadFact = { startLine: number; numLines: number; totalLines: number }

/** Merges a range into sorted, merged ranges; adjacent ranges join. */
export function mergeRanges(ranges: readonly Range[], next: Range): Range[] {
  const all = [...ranges, next].filter(range => range[1] >= range[0]).sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const [start, end] of all) {
    const last = merged[merged.length - 1]
    if (last !== undefined && start <= last[1] + 1) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

/** Whether the ranges cover every line from `start` to `end`. */
export function coversSpan(ranges: readonly Range[], start: number, end: number): boolean {
  if (end < start) return true
  let reach = start - 1
  for (const [from, to] of ranges) {
    if (from > reach + 1) break
    reach = Math.max(reach, to)
    if (reach >= end) return true
  }
  return reach >= end
}

/** Records one Read in the ledger under the agent, by the path's id. */
export function recordRead(ledger: ReadLedger, agent: string, id: string, path: string, fact: ReadFact): void {
  let reads = ledger.get(agent)
  if (reads === undefined) {
    reads = new Map()
    ledger.set(agent, reads)
  }
  const known = reads.get(id)
  const start = Math.max(1, Math.floor(fact.startLine))
  const range: Range = [start, start + Math.max(0, Math.floor(fact.numLines)) - 1]
  readSeq += 1
  reads.set(id, {
    path,
    ranges: mergeRanges(known?.ranges ?? [], range),
    totalLines: Math.max(0, Math.floor(fact.totalLines)),
    seq: readSeq,
  })
}

// ---------------------------------------------------------------------------
// Sections

/** A section's lines, 1-based, heading included. */
export type Span = { start: number; end: number }

/**
 * The line span of each named `##` section in a file's text: from its heading
 * to the line before the next heading of level 1 or 2, or the end. Fenced code
 * and the frontmatter are skipped. A name the file does not carry maps to null.
 * Names match without regard to case or surrounding space.
 */
export function sectionSpansOf(text: string, names: readonly string[]): Map<string, Span | null> {
  const lines = text.split(/\r?\n/u)
  let last = lines.length
  if (last > 0 && lines[last - 1] === '') last -= 1
  const wanted = new Map(names.map(name => [name.trim().toLowerCase(), name]))
  const spans = new Map<string, Span | null>(names.map(name => [name, null]))
  let fence: string | null = null
  let open: { name: string; start: number } | null = null
  let index = 0
  if (lines[0]?.trim() === '---') {
    const close = lines.findIndex((line, at) => at > 0 && line.trim() === '---')
    if (close > 0) index = close + 1
  }
  const closeOpen = (end: number) => {
    if (open !== null) spans.set(open.name, { start: open.start, end: Math.max(open.start, end) })
    open = null
  }
  for (; index < last; index += 1) {
    const line = lines[index] as string
    const fenceMatch = /^\s*(```+|~~~+)/u.exec(line)
    if (fenceMatch) {
      const mark = (fenceMatch[1] as string).slice(0, 3)
      if (fence === null) fence = mark
      else if (mark === fence) fence = null
      continue
    }
    if (fence !== null) continue
    const heading = /^(#{1,2})\s+(.*?)\s*#*\s*$/u.exec(line)
    if (heading === null) continue
    closeOpen(index)
    if ((heading[1] as string).length !== 2) continue
    const name = wanted.get((heading[2] as string).trim().toLowerCase())
    if (name !== undefined && spans.get(name) === null) open = { name, start: index + 1 }
  }
  closeOpen(last)
  return spans
}

/** How much of a required file the reads cover. */
export type Coverage = 'read' | 'partial' | 'missing'

/**
 * Whether the reads cover the whole file (`spans` null) or every span. The
 * last line of a file may go unread: a trailing newline counts as a line in
 * some reports.
 */
export function coverageOf(reads: FileReads | undefined, spans: readonly Span[] | null): Coverage {
  if (reads === undefined) return 'missing'
  if (spans === null) {
    const need = Math.max(1, reads.totalLines - 1)
    if (reads.totalLines <= 0) return 'read'
    return coversSpan(reads.ranges, 1, need) ? 'read' : 'partial'
  }
  return spans.every(span => coversSpan(reads.ranges, span.start, span.end)) ? 'read' : 'partial'
}

// ---------------------------------------------------------------------------
// Writes

/** A written file matched to the `writes` row of one stage entry. */
export type WriteMatch = { entry: RequiresEntry; slice: string | null; mode: string | null }

/** Files inside a workflow directory the check never runs on. */
export function isExcludedWrite(file: string): boolean {
  const name = slashPath(file).toLowerCase()
  if (name.endsWith('.yaml') || name.endsWith('.html.fragment')) return true
  if (name.startsWith('history/') || name.startsWith('probe-evidence/') || name.startsWith('verify-evidence/')) return true
  return name === '00-index.md' || name === 'index-history.jsonl' || name === READ_LEDGER_FILE || name === '.driver-journal.jsonl'
}

type Pattern = { regex: RegExp; groups: Array<'slice' | 'mode'>; literal: number }

/** A `writes` or input path as a regex: `<slice>`, `<mode>` capture; `*` matches within one path segment. */
export function patternOf(input: string): Pattern {
  const groups: Array<'slice' | 'mode'> = []
  let literal = 0
  let source = ''
  const text = cleanInput(input).toLowerCase()
  for (let index = 0; index < text.length; ) {
    const rest = text.slice(index)
    const holder = /^<(slice|mode)>/u.exec(rest)
    if (holder !== null) {
      groups.push(holder[1] as 'slice' | 'mode')
      source += '([^/]+?)'
      index += holder[0].length
      continue
    }
    const char = text[index] as string
    if (char === '*') source += '[^/]*'
    else {
      source += char.replace(/[.+?^${}()|[\]\\]/gu, '\\$&')
      literal += 1
    }
    index += 1
  }
  return { regex: new RegExp(`^${source}$`, 'u'), groups, literal }
}

/**
 * The stage entry whose `writes` row names the written file, or null. When
 * several match, the first of `preferStages` that has a match wins, then a
 * plain stage over an intake or augment mode, then the most literal pattern,
 * then the reference name. `acceptSlice` refuses a `<slice>` capture that is
 * not a slice of the workflow, so a review dimension file
 * (`07-review-auth-security.md`) does not read as the review of a slice
 * `auth-security`. `onlyStages`, when given, keeps only the entries of those
 * stages: the stages the writer runs (`writerStagesOf`).
 */
export function matchWrite(
  requires: readonly RequiresEntry[],
  file: string,
  preferStages: readonly string[] = [],
  acceptSlice: (slice: string) => boolean = () => true,
  onlyStages: readonly string[] | null = null,
): WriteMatch | null {
  const name = cleanInput(file).toLowerCase()
  const hits: Array<WriteMatch & { literal: number }> = []
  for (const entry of requires) {
    if (onlyStages !== null && !onlyStages.includes(entry.stage)) continue
    for (const row of entry.rows) {
      if (row.kind !== 'writes') continue
      const pattern = patternOf(row.input)
      const match = pattern.regex.exec(name)
      if (match === null) continue
      let slice: string | null = null
      let mode: string | null = null
      for (const [at, group] of pattern.groups.entries()) {
        const value = match[at + 1] ?? null
        if (group === 'slice') slice = value
        else mode = value
      }
      if (slice !== null && !acceptSlice(slice)) continue
      hits.push({ entry, slice, mode, literal: pattern.literal })
    }
  }
  if (hits.length === 0) return null
  for (const stage of preferStages) {
    const preferred = hits.filter(hit => hit.entry.stage === stage)
    if (preferred.length > 0) return strip(pickBest(preferred))
  }
  return strip(pickBest(hits))
}

function pickBest<T extends WriteMatch & { literal: number }>(hits: readonly T[]): T {
  return [...hits].sort((a, b) => {
    const colon = Number(a.entry.stage.includes(':')) - Number(b.entry.stage.includes(':'))
    if (colon !== 0) return colon
    if (a.literal !== b.literal) return b.literal - a.literal
    return a.entry.reference.localeCompare(b.entry.reference)
  })[0] as T
}

function strip(hit: WriteMatch & { literal: number }): WriteMatch {
  return { entry: hit.entry, slice: hit.slice, mode: hit.mode }
}

/** The stages a `/wf` command prefers when several entries write the same file. */
export function preferredStagesOf(command: { key: string; slug: string | null } | null): string[] {
  if (command === null) return []
  if (command.key === 'intake' || command.key === 'augment') return command.slug === null ? [command.key] : [`${command.key}:${command.slug}`, command.key]
  return [command.key]
}

/**
 * The stages a writer runs, most preferred first: every stage whose reference
 * the writer read since `since` (`skills/wf/reference/<reference>` in its
 * reads, `readMarkOf` at the turn's start), then the stages its `/wf` command
 * maps to (the main loop's bracket command), then the stages whose reference
 * it read before. The main loop keeps its reads for the session: a reference
 * read for an earlier turn must not beat this turn's command. A
 * `writes` row matches a write only for one of these stages: a file several
 * stages write (`05-implement.md`, `04-plan.md`, `02-shape.md`, `03-slice.md`)
 * is checked against the stage the writer runs, never another stage that
 * happens to name it. An empty list means no stage: the check does not run.
 * An intake or augment command whose slug names no mode maps to its `default`
 * mode (`/wf intake <idea>`).
 */
export function writerStagesOf(
  requires: readonly RequiresEntry[],
  reads: AgentReads | undefined,
  command: { key: string; slug: string | null } | null,
  since = 0,
): string[] {
  const known = new Set(requires.map(entry => entry.stage))
  const stages: string[] = []
  const add = (stage: string) => {
    if (known.has(stage) && !stages.includes(stage)) stages.push(stage)
  }
  const readSince = (entry: RequiresEntry, isFresh: boolean) => {
    const read = reads?.get(procedureIdOf(entry.reference))
    return read !== undefined && ((read.seq ?? 0) > since) === isFresh
  }
  for (const entry of requires) if (readSince(entry, true)) add(entry.stage)
  const named = preferredStagesOf(command).filter(stage => known.has(stage))
  if (command !== null && named.length === 0 && (command.key === 'intake' || command.key === 'augment')) named.push(`${command.key}:default`)
  for (const stage of named) add(stage)
  for (const entry of requires) if (readSince(entry, false)) add(entry.stage)
  return stages
}

/** One input the check requires for a write, placeholders filled. */
export type RequiredInput = {
  /** The input as the table names it, placeholders filled: the name the agent sees. */
  input: string
  kind: 'artifact' | 'procedure'
  when: 'always' | 'if-present'
  sections: readonly string[]
  id: string
  /** True when the input carries `*`: every existing match is required. */
  isGlob: boolean
}

/** The rows the check runs for a matched write: `always` and `if-present` rows, placeholders filled. */
export function requiredOf(match: WriteMatch, slug: string): RequiredInput[] {
  const required: RequiredInput[] = []
  for (const row of match.entry.rows) {
    if (row.kind === 'writes') continue
    const when = row.when.trim().toLowerCase()
    if (when !== 'always' && when !== 'if-present') continue
    let input = cleanInput(row.input)
    if (input.includes('<slice>')) {
      if (match.slice === null) continue
      input = input.split('<slice>').join(match.slice)
    }
    if (input.includes('<mode>')) {
      if (match.mode === null) continue
      input = input.split('<mode>').join(match.mode)
    }
    if (/<[a-z-]+>/u.test(input)) continue
    required.push({ input, kind: row.kind, when, sections: row.sections, id: inputIdOf(row.kind, input, slug), isGlob: input.includes('*') })
  }
  return required
}

// ---------------------------------------------------------------------------
// Prompt-fed inputs

/** A dispatch prompt's `Prompt-fed inputs:` line, and every workflow path the prompt names. */
export type PromptFed = { inputs: string[]; outputs: Array<{ slug: string; file: string }> }

/** The prompt-fed inputs a dispatch prompt declares, or null when it has no such line. */
export function promptFedOf(prompt: string): PromptFed | null {
  const line = /^[ \t>*_-]*Prompt-fed inputs:[ \t*_]*(.+)$/imu.exec(prompt)
  if (line === null) return null
  const inputs = (line[1] as string)
    .split(',')
    .map(item => cleanInput(item.replace(/`/gu, '').replace(/[.;]\s*$/u, '')))
    .filter(item => item !== '')
  const outputs: Array<{ slug: string; file: string }> = []
  const seen = new Set<string>()
  for (const found of prompt.matchAll(/\.ai[\\/]workflows[\\/]([A-Za-z0-9._-]+)[\\/]([^\s`'",;)<>]+)/gu)) {
    const slug = found[1] as string
    const file = slashPath((found[2] as string).replace(/[.:]+$/u, ''))
    const id = artifactIdOf(slug, file)
    if (seen.has(id)) continue
    seen.add(id)
    outputs.push({ slug, file })
  }
  return { inputs, outputs }
}

/** Whether a prompt-fed input list covers a required input: the same path, or a path ending in it. */
export function fedCovers(input: string, fed: readonly string[]): boolean {
  const want = cleanInput(input).replace(/^\/+/u, '').toLowerCase()
  return fed.some(item => {
    const have = cleanInput(item).replace(/^\/+/u, '').toLowerCase()
    return have === want || have.endsWith(`/${want}`)
  })
}

// ---------------------------------------------------------------------------
// The check

/** The file access the check needs; each call may fail, and a failure reads as absent. */
export type Io = {
  exists: (path: string) => Promise<boolean>
  read: (path: string) => Promise<string | null>
  /** The file names in a directory, or an empty list. */
  list: (dir: string) => Promise<string[]>
}

/** What the check knows about the writer. */
export type CheckContext = {
  /** The directory holding `.ai/`. */
  root: string
  slug: string
  /** The writer's reads, or undefined when it read nothing. */
  reads: AgentReads | undefined
  /** Inputs a dispatch prompt fed for this output path. */
  fed: readonly string[]
  /**
   * The ledger id of the file being written. A required input with this id is
   * the writer's own output (`04-plan.md` as an `if-present` Sibling Plans
   * input of the plan that writes it): it never counts as missing or partial.
   */
  self?: string
}

/** The inputs the writer did not read, and the ones it read only in part. */
export type CheckResult = { missing: string[]; partial: string[] }

function joinParts(...parts: string[]): string {
  return slashPath(parts.filter(part => part !== '').join('/'))
}

/** Where an input sits on disk, or null for a procedure file (it ships with the plugin). */
function inputPathOf(required: { kind: string; input: string }, context: CheckContext): string | null {
  if (required.kind === 'procedure') return null
  if (required.input.startsWith('/.ai/')) return joinParts(context.root, required.input.slice(1))
  return joinParts(context.root, '.ai', 'workflows', context.slug, required.input)
}

/** Runs the check for one write: which required inputs the writer's reads do not cover. */
export async function checkReads(required: readonly RequiredInput[], context: CheckContext, io: Io): Promise<CheckResult> {
  const result: CheckResult = { missing: [], partial: [] }
  for (const item of required) {
    if (item.isGlob) {
      for (const expanded of await expandGlob(item, context, io)) await checkOne(expanded, context, io, result)
      continue
    }
    await checkOne(item, context, io, result)
  }
  return result
}

async function expandGlob(item: RequiredInput, context: CheckContext, io: Io): Promise<RequiredInput[]> {
  if (item.kind === 'procedure') return []
  const path = inputPathOf(item, context)
  if (path === null) return []
  const slash = path.lastIndexOf('/')
  const dir = path.slice(0, slash)
  const name = path.slice(slash + 1)
  const pattern = patternOf(name).regex
  let names: string[] = []
  try {
    names = await io.list(dir)
  } catch {
    names = []
  }
  const inputDir = item.input.includes('/') ? item.input.slice(0, item.input.lastIndexOf('/') + 1) : ''
  return names
    .filter(entry => pattern.test(entry.toLowerCase()))
    .sort()
    .map(entry => {
      const input = `${inputDir}${entry}`
      return { ...item, input, id: inputIdOf(item.kind, input, context.slug), isGlob: false, when: 'if-present' as const }
    })
}

async function checkOne(item: RequiredInput, context: CheckContext, io: Io, result: CheckResult): Promise<void> {
  if (context.self !== undefined && item.id === context.self.toLowerCase()) return
  if (fedCovers(item.input, context.fed)) return
  const reads = context.reads?.get(item.id)
  if (reads === undefined && item.when === 'if-present') {
    const path = inputPathOf(item, context)
    if (path !== null && !(await safe(() => io.exists(path), false))) return
  }
  let spans: Span[] | null = null
  if (reads !== undefined && item.sections.length > 0 && !coversAll(reads)) {
    const text = await safe(() => io.read(reads.path), null)
    if (text !== null) {
      spans = [...sectionSpansOf(text, item.sections).values()].filter((span): span is Span => span !== null)
    }
  }
  const coverage = coverageOf(reads, spans)
  if (coverage === 'missing') result.missing.push(item.input)
  else if (coverage === 'partial') result.partial.push(item.input)
}

function coversAll(reads: FileReads): boolean {
  return coverageOf(reads, null) === 'read'
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

/** True when the check found nothing to report. */
export function isClean(result: CheckResult): boolean {
  return result.missing.length === 0 && result.partial.length === 0
}

// ---------------------------------------------------------------------------
// What the agent and the ledger file get

/** The `read-waiver:` reason in written text, or null when there is none or it is empty. */
export function waiverOf(text: string): string | null {
  const match = /^[ \t]*read-waiver:[ \t]*(.*)$/mu.exec(text)
  if (match === null) return null
  const reason = (match[1] as string).trim().replace(/^(["'])(.*)\1$/u, '$2').trim()
  return reason === '' ? null : reason
}

/** The text a write tool call puts into the file: Write content, Edit and MultiEdit new text, a notebook cell. */
export function writtenTextOf(input: Record<string, unknown>): string {
  const parts: string[] = []
  for (const key of ['content', 'new_string', 'new_source']) {
    const value = input[key]
    if (typeof value === 'string') parts.push(value)
  }
  const edits = input['edits']
  if (Array.isArray(edits)) {
    for (const edit of edits) {
      if (edit && typeof edit === 'object' && typeof (edit as { new_string?: unknown }).new_string === 'string') parts.push((edit as { new_string: string }).new_string)
    }
  }
  return parts.join('\n')
}

/**
 * The text the agent reads after the tool result (warn), or the deny text
 * (block): which files, why they matter, and what to do. Only block mode
 * names the waiver.
 */
export function contextTextOf(args: { artifact: string; reference: string; result: CheckResult; mode: 'warn' | 'block' }): string {
  const { artifact, reference, result, mode } = args
  const lines: string[] = []
  lines.push(
    mode === 'block'
      ? `wf read check: the write of ${artifact} was refused. The stage requires inputs you have not read (${reference}, ## Requires).`
      : `wf read check: you wrote ${artifact}, but you did not read every input its stage requires (${reference}, ## Requires).`,
  )
  if (result.missing.length > 0) lines.push(`Not read: ${result.missing.join(', ')}.`)
  if (result.partial.length > 0) lines.push(`Read only in part (the named sections, or the whole file, are not covered): ${result.partial.join(', ')}.`)
  lines.push('The stage acts on these inputs. An artifact written without them can contradict the acceptance criteria, the PO answers or the procedure.')
  lines.push(`Read them now with the Read tool, in full or the named sections, then write ${artifact} again.`)
  if (mode === 'block') lines.push('If you cannot read them, add `read-waiver: "<reason>"` to the frontmatter of the artifact and write it again.')
  return lines.join('\n')
}

/** One `.read-ledger.jsonl` row (S6): the check's result for one write. */
export type LedgerRow = {
  at: string
  agentId: string
  stage: string
  artifact: string
  missing: readonly string[]
  partial: readonly string[]
  waiver: string | null
}

/** The row as one JSON line, newline included. */
export function ledgerLineOf(row: LedgerRow): string {
  return `${JSON.stringify({ at: row.at, agentId: row.agentId, stage: row.stage, artifact: row.artifact, missing: row.missing, partial: row.partial, waiver: row.waiver })}\n`
}

/** Past this size, an append keeps the newer half of the file. */
export const LEDGER_FILE_CAP = 1_000_000

/** The ledger file's text after one appended line, trimmed to the newer rows past the cap. */
export function appendedTextOf(prior: string, line: string): string {
  let kept = prior
  if (kept.length > LEDGER_FILE_CAP) {
    const cut = kept.indexOf('\n', kept.length - Math.floor(LEDGER_FILE_CAP / 2))
    kept = cut < 0 ? '' : kept.slice(cut + 1)
  }
  if (kept !== '' && !kept.endsWith('\n')) kept += '\n'
  return kept + line
}
