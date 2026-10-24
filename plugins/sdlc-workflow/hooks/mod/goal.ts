/**
 * The goal arm action, its pure parts. `register.ts` calls them from its
 * `turn.complete` hook.
 *
 * On Claude Code the model cannot type the built-in `/goal`. `goal.mjs arm` writes
 * `.ai/workflows/<slug>/goal/arm.json` with the command and `state: pending`. When
 * the turn of `/wf loop goal <slug>` ends, the mod reads that request and puts the
 * command into the prompt box. Where the surface draws its own prompt box (the
 * Desktop app), the fill is refused and the mod submits the command as the
 * person's prompt instead. The request then records what happened, so a second
 * turn never arms it twice.
 */

export type ArmRequest = {
  slug: string
  host: string
  arming: number
  condition: string
  command: string | null
  requestedAt: string
  state: string
}

/** How the mod handed the command over: into the box, sent as a prompt, or neither. */
export type ArmHow = 'filled' | 'submitted' | 'refused'

/** The file reads the mod makes; the hooks module binds `$.fs`, a test binds a tree in memory. */
export type Reader = {
  read: (path: string) => Promise<string>
  exists: (path: string) => Promise<boolean>
}

/** Claude Code accepts a condition of up to 4,000 characters. */
export const GOAL_CONDITION_LIMIT = 4000

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
 * The slug of a `/wf loop goal <slug> ...` command, or null. The namespaced
 * `/sdlc-workflow:wf` form parses the same way. A first word that is no slug
 * gives null, so no path is built from it.
 */
export function goalSlugOf(text: string): string | null {
  const match = /^\s*\/(?:sdlc-workflow:)?wf\s+loop\s+goal\s+(\S+)/u.exec(text)
  if (match === null) return null
  const slug = match[1] as string
  return SLUG_PATTERN.test(slug) ? slug : null
}

export function armRequestPathOf(root: string, slug: string): string {
  return joinPath(root, '.ai', 'workflows', slug, 'goal', 'arm.json')
}

/**
 * The request the mod must act on, or null: a pending request of this slug, for
 * Claude Code, whose command is a `/goal` line within the limit.
 */
export function pendingArmOf(text: string | null, slug: string): ArmRequest | null {
  if (text === null || text.trim() === '') return null
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const request = value as Partial<ArmRequest>
  if (request.state !== 'pending' || request.slug !== slug || request.host !== 'claude-code') return null
  if (typeof request.command !== 'string' || !request.command.startsWith('/goal ')) return null
  if (typeof request.condition !== 'string' || request.condition.length > GOAL_CONDITION_LIMIT) return null
  return request as ArmRequest
}

/** The request after the mod acted: the new state and when. */
export function armedRequestOf(request: ArmRequest, how: ArmHow, at: string): string {
  return `${JSON.stringify({ ...request, state: how, handledAt: at }, null, 2)}\n`
}

export function armToastOf(how: ArmHow): string {
  if (how === 'submitted') return 'wf goal: the /goal command is sent. The host goal carries the loop; only goal.mjs check decides that it is met.'
  if (how === 'filled') return 'wf goal: the /goal command is in the prompt box. Press Enter to arm the goal.'
  return 'wf goal: the prompt box is not free. Paste the /goal line that /wf loop goal printed.'
}

/**
 * How the hand-over goes, from the answer of `$.prompt.fill`. A surface that
 * draws its own prompt box refuses every fill with `no_composer`; there the
 * command goes out as the person's prompt.
 */
export function armHowOf(isFilled: boolean, refusal: string | undefined): ArmHow {
  if (isFilled) return 'filled'
  return refusal === 'no_composer' ? 'submitted' : 'refused'
}

