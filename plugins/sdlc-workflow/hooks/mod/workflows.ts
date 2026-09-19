/**
 * What the picker knows about the repository: the workflows under
 * `.ai/workflows/<slug>/` and the slices each one carries. Every read goes
 * through a `Reader`, so the hooks module binds `$.fs` and a test binds a
 * tree in memory.
 */

export type FsEntryLike = { name: string; kind: 'file' | 'dir' | 'other' }

export type Reader = {
  list: (path: string) => Promise<FsEntryLike[]>
  read: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
}

export type WorkflowEntry = {
  slug: string
  /** The `status` field of `00-index.md`, trimmed. */
  status: string
  /** True for `complete`, `completed`, `closed`, `abandoned`, `cancelled`. */
  terminal: boolean
  /** The `current-stage` field of `00-index.md`, or null. */
  currentStage: string | null
  /** The `selected-slice` field of `00-index.md`, or null when blank. */
  selectedSlice: string | null
  /** The `next-invocation` field of `00-index.md`, or null. */
  nextInvocation: string | null
}

export type SliceStage = 'defined' | 'planned' | 'implemented' | 'verified'

export type SliceEntry = {
  slug: string
  /** The roster `status` in `03-slice.md`: defined, in-progress, complete, skipped. */
  status: string
  complexity: string | null
  /** The furthest stage file present for the slice: plan, implement, or verify. */
  stage: SliceStage
}

/** The same set `lib/workflow-index.mjs` treats as terminal. */
export const TERMINAL_WORKFLOW_STATUSES: ReadonlySet<string> = new Set([
  'complete',
  'completed',
  'closed',
  'abandoned',
  'cancelled',
])

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/u

export function joinPath(...parts: string[]): string {
  return parts
    .filter(part => part !== '')
    .map((part, index) => (index === 0 ? part.replace(/[\\/]+$/u, '') : part.replace(/^[\\/]+|[\\/]+$/u, '')))
    .join('/')
}

function parentOf(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/u, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (cut <= 0) return null
  const parent = trimmed.slice(0, cut)
  // "C:" alone is not a directory the reader can list; stop at the drive root.
  if (/^[A-Za-z]:$/u.test(parent)) return `${parent}/`
  return parent
}

/**
 * The nearest directory at or above `cwd` that holds `.ai/workflows`, or
 * null when none does within 12 levels.
 */
export async function findProjectRoot(cwd: string, reader: Reader): Promise<string | null> {
  let dir: string | null = cwd
  for (let depth = 0; dir !== null && depth < 12; depth += 1) {
    if (await reader.exists(joinPath(dir, '.ai', 'workflows'))) return dir
    const parent = parentOf(dir)
    if (parent === null || parent === dir) return null
    dir = parent
  }
  return null
}

/**
 * The top-level scalar fields of a YAML frontmatter block: `key: value` at
 * column zero, quotes stripped. Nested and list values are left out.
 */
export function frontmatterOf(text: string): Record<string, string> {
  const fields: Record<string, string> = {}
  const body = frontmatterBodyOf(text)
  if (body === null) return fields
  for (const line of body.split(/\r?\n/u)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line)
    if (!match) continue
    fields[match[1] as string] = unquote(match[2] ?? '')
  }
  return fields
}

/**
 * The `slices:` roster of a `03-slice.md` frontmatter: one entry per `- slug:`
 * item with the `status` and `complexity` fields that follow it.
 */
export function rosterOf(text: string): Array<{ slug: string; status: string; complexity: string | null }> {
  const body = frontmatterBodyOf(text)
  if (body === null) return []
  const lines = body.split(/\r?\n/u)
  const start = lines.findIndex(line => /^slices:\s*$/u.test(line))
  if (start < 0) return []
  const roster: Array<{ slug: string; status: string; complexity: string | null }> = []
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] as string
    if (/^\S/u.test(line)) break
    const item = /^\s*-\s+slug:\s*(.*)$/u.exec(line)
    if (item) {
      roster.push({ slug: unquote(item[1] ?? ''), status: 'defined', complexity: null })
      continue
    }
    const field = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line)
    const current = roster[roster.length - 1]
    if (!field || !current) continue
    if (field[1] === 'status') current.status = unquote(field[2] ?? '')
    if (field[1] === 'complexity') current.complexity = unquote(field[2] ?? '')
  }
  return roster.filter(entry => entry.slug !== '')
}

/** Every workflow under `<root>/.ai/workflows`, by slug, with its index fields. */
export async function listWorkflows(root: string, reader: Reader): Promise<WorkflowEntry[]> {
  const workflowsDir = joinPath(root, '.ai', 'workflows')
  let entries: FsEntryLike[]
  try {
    entries = await reader.list(workflowsDir)
  } catch {
    return []
  }
  const workflows: WorkflowEntry[] = []
  for (const entry of entries) {
    if (entry.kind !== 'dir' || !SLUG_PATTERN.test(entry.name)) continue
    let text: string
    try {
      text = await reader.read(joinPath(workflowsDir, entry.name, '00-index.md'))
    } catch {
      continue
    }
    const fields = frontmatterOf(text)
    const status = (fields['status'] ?? '').trim()
    if (status === '') continue
    workflows.push({
      slug: entry.name,
      status,
      terminal: TERMINAL_WORKFLOW_STATUSES.has(status),
      currentStage: blankToNull(fields['current-stage']),
      selectedSlice: blankToNull(fields['selected-slice']),
      nextInvocation: blankToNull(fields['next-invocation']),
    })
  }
  return workflows.sort((left, right) => left.slug.localeCompare(right.slug))
}

/**
 * The slices of one workflow: the `03-slice.md` roster, each marked with the
 * furthest stage file present (`04-plan-<slice>.md`, `05-implement-<slice>.md`,
 * `06-verify-<slice>.md`). Empty when the workflow has no roster.
 */
export async function listSlices(root: string, slug: string, reader: Reader): Promise<SliceEntry[]> {
  const workflowDir = joinPath(root, '.ai', 'workflows', slug)
  const rosterPath = joinPath(workflowDir, '03-slice.md')
  let text: string
  try {
    // An absent roster is the common case; the exists check keeps it out of the engine's error log.
    if (!(await reader.exists(rosterPath))) return []
    text = await reader.read(rosterPath)
  } catch {
    return []
  }
  const roster = rosterOf(text)
  if (roster.length === 0) return []
  let names: Set<string>
  try {
    names = new Set((await reader.list(workflowDir)).filter(entry => entry.kind === 'file').map(entry => entry.name))
  } catch {
    names = new Set()
  }
  return roster.map(entry => ({
    slug: entry.slug,
    status: entry.status,
    complexity: entry.complexity,
    stage: stageOf(entry.slug, names),
  }))
}

function stageOf(slice: string, names: ReadonlySet<string>): SliceStage {
  if (names.has(`06-verify-${slice}.md`)) return 'verified'
  if (names.has(`05-implement-${slice}.md`)) return 'implemented'
  if (names.has(`04-plan-${slice}.md`)) return 'planned'
  return 'defined'
}

function frontmatterBodyOf(text: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text)
  return match ? (match[1] ?? '') : null
}

function unquote(value: string): string {
  const trimmed = value.trim()
  const quoted = /^"(.*)"$|^'(.*)'$/u.exec(trimmed)
  if (quoted) return (quoted[1] ?? quoted[2] ?? '').trim()
  return trimmed
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}
