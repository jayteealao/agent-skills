/**
 * The picker's state machine, pure: which step a command opens at, the
 * options each step offers, and what a pick does (the next step, or the
 * command text to fill into the prompt).
 */
import { CATALOG, entryOf } from './catalog.ts'
import type { ArgumentNeed } from './catalog.ts'
import type { SliceEntry, WorkflowEntry } from './workflows.ts'

export type Step =
  | { kind: 'key' }
  | { kind: 'slug'; key: string }
  | { kind: 'slice'; key: string; slug: string }

export type Option = { value: string; label: string }

export type Outcome =
  | { kind: 'step'; step: Step }
  | { kind: 'fill'; text: string }

/** The value of the option that ends a step without a slug or a slice. */
export const NONE = '-'
/** The value of the `all` option `plan` offers for its slice. */
export const ALL = 'all'

/**
 * Which step a run of `/wf <key> <args>` opens at, or null when the typed
 * arguments already satisfy the key and the command should run as typed.
 *
 * A bare `/wf` opens at the key step. A key with no argument that needs a
 * slug opens at the slug step. A key whose arguments already hold a slug and
 * that may take a slice opens at the slice step only when the slug is the
 * whole of the arguments and the workflow has slices (the caller checks).
 */
export function stepFor(key: string | null, args: string): Step | null {
  const tokens = args.trim() === '' ? [] : args.trim().split(/\s+/u)
  if (key === null) {
    if (tokens.length === 0) return { kind: 'key' }
    const typed = tokens[0] as string
    if (entryOf(typed) === null) return null
    return stepFor(typed, tokens.slice(1).join(' '))
  }
  const entry = entryOf(key)
  if (entry === null) return null
  if (tokens.length === 0) {
    return entry.need === 'none' ? null : { kind: 'slug', key }
  }
  if (tokens.length === 1 && takesSlice(entry.need)) {
    return { kind: 'slice', key, slug: tokens[0] as string }
  }
  return null
}

export function takesSlice(need: ArgumentNeed): boolean {
  return need === 'slug-slice-optional' || need === 'slug-slice-or-all'
}

/** The heading the band draws for a step. */
export function titleOf(step: Step): string {
  if (step.kind === 'key') return '/wf — pick a key'
  if (step.kind === 'slug') return `/wf ${step.key} — pick a workflow`
  return `/wf ${step.key} ${step.slug} — pick a slice`
}

/** The options of the key step: every key with its description. */
export function keyOptions(): Option[] {
  return CATALOG.map(entry => ({ value: entry.key, label: `${entry.key}  ${entry.description}` }))
}

/**
 * The options of the slug step: active workflows first, then closed ones,
 * each with its status, stage, and selected slice. An optional-slug key
 * offers "no slug" first.
 */
export function slugOptions(step: Extract<Step, { kind: 'slug' }>, workflows: readonly WorkflowEntry[]): Option[] {
  const entry = entryOf(step.key)
  const options: Option[] = []
  if (entry?.need === 'slug-optional') options.push({ value: NONE, label: '(no slug)' })
  const ordered = [...workflows.filter(w => !w.terminal), ...workflows.filter(w => w.terminal)]
  for (const workflow of ordered) options.push({ value: workflow.slug, label: workflowLabel(workflow) })
  return options
}

export function workflowLabel(workflow: WorkflowEntry): string {
  const parts = [workflow.terminal ? `closed (${workflow.status})` : workflow.status]
  if (!workflow.terminal && workflow.currentStage) parts.push(`stage ${workflow.currentStage}`)
  if (!workflow.terminal && workflow.selectedSlice) parts.push(`slice ${workflow.selectedSlice}`)
  return `${workflow.slug}  ${parts.join(' · ')}`
}

/**
 * The options of the slice step: "no slice" first, `all` for `plan`, then
 * every slice with its roster status and the furthest stage file present.
 */
export function sliceOptions(step: Extract<Step, { kind: 'slice' }>, slices: readonly SliceEntry[]): Option[] {
  const entry = entryOf(step.key)
  const options: Option[] = [{ value: NONE, label: '(no slice)' }]
  if (entry?.need === 'slug-slice-or-all') options.push({ value: ALL, label: 'all  every slice' })
  for (const slice of slices) options.push({ value: slice.slug, label: sliceLabel(slice) })
  return options
}

export function sliceLabel(slice: SliceEntry): string {
  const parts = [slice.status]
  if (slice.stage !== 'defined') parts.push(slice.stage)
  if (slice.complexity) parts.push(slice.complexity)
  return `${slice.slug}  ${parts.join(' · ')}`
}

/**
 * What a pick does. `hasSlices` says whether the picked workflow carries a
 * roster, so a key that may take a slice skips the slice step without one.
 */
export function pick(step: Step, value: string, hasSlices: (slug: string) => boolean): Outcome {
  if (step.kind === 'key') {
    const entry = entryOf(value)
    if (entry === null || entry.need === 'none') return { kind: 'fill', text: fillOf(value) }
    return { kind: 'step', step: { kind: 'slug', key: value } }
  }
  if (step.kind === 'slug') {
    if (value === NONE) return { kind: 'fill', text: fillOf(step.key) }
    const entry = entryOf(step.key)
    if (entry !== null && takesSlice(entry.need) && hasSlices(value)) {
      return { kind: 'step', step: { kind: 'slice', key: step.key, slug: value } }
    }
    return { kind: 'fill', text: fillOf(step.key, value) }
  }
  if (value === NONE) return { kind: 'fill', text: fillOf(step.key, step.slug) }
  return { kind: 'fill', text: fillOf(step.key, step.slug, value) }
}

/** The command text the prompt receives, with a trailing space for more arguments. */
export function fillOf(key: string, slug?: string, slice?: string): string {
  return `/wf ${[key, slug, slice].filter(part => part !== undefined && part !== '').join(' ')} `
}

/** One page of options: at most `size` rows, `size` never below one. */
export type Page = { items: Option[]; page: number; pages: number }

/**
 * The options a page shows, so every row can carry a one-digit hotkey. The
 * page index wraps, so a "more" press after the last page shows the first.
 */
export function pageOf(options: readonly Option[], page: number, size: number): Page {
  const width = Math.max(1, Math.floor(size))
  const pages = Math.max(1, Math.ceil(options.length / width))
  const index = ((page % pages) + pages) % pages
  return { items: options.slice(index * width, index * width + width), page: index, pages }
}
