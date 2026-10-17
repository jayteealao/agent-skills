/**
 * The goal arm action (WF-GOAL-PLAN W3, D4), its pure parts. `register.ts` calls
 * them from its `turn.complete` hook.
 *
 * On Claude Code the model cannot type the built-in `/goal`. `goal.mjs arm` writes
 * `.ai/workflows/<slug>/goal/arm.json` with the command and `state: pending`. When
 * the turn of `/wf goal <slug>` ends, the mod reads that request and puts the
 * command into the prompt box. Where the surface draws its own prompt box (the
 * Desktop app), the fill is refused and the mod submits the command as the
 * person's prompt instead: the same path as the picker (probe P1 checks that a
 * submitted `/goal` runs as the built-in command). The request then records what
 * happened, so a second turn never arms it twice.
 */
import { joinPath } from './workflows.ts'

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

/** Claude Code accepts a condition of up to 4,000 characters. */
export const GOAL_CONDITION_LIMIT = 4000

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
  return 'wf goal: the prompt box is not free. Paste the /goal line that /wf goal printed.'
}

/** The state of the hand-over, from the text the picker's fill returns. */
export function armHowOf(shown: string, runText: string, submitText: string): ArmHow {
  if (shown.startsWith(submitText)) return 'submitted'
  if (shown.startsWith(runText)) return 'filled'
  return 'refused'
}
