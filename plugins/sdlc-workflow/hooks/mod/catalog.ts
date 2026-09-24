/**
 * The 23 `/wf` keys as the picker offers them: the command each key gets in
 * the typeahead (`/wf-<key>`), the one-line description the typeahead shows,
 * the dim argument hint, and what the picker has to ask for before the
 * command is complete.
 *
 * `need` says which picker steps a key runs through:
 * - `none`: nothing to pick; the prompt is filled with `/wf <key> ` at once.
 * - `slug-optional`: a slug may follow; the list offers "no slug" first.
 * - `slug`: a slug must follow.
 * - `slug-slice-optional`: a slug must follow; a slice may follow the slug.
 * - `slug-slice-or-all`: as above, and `all` is an option for the slice.
 */
export type ArgumentNeed =
  | 'none'
  | 'slug-optional'
  | 'slug'
  | 'slug-slice-optional'
  | 'slug-slice-or-all'

export type CatalogEntry = {
  key: string
  description: string
  argumentHint: string
  need: ArgumentNeed
}

export const CATALOG: readonly CatalogEntry[] = [
  { key: 'intake', description: 'Start, extend, adopt, or maintain workflow scope.', argumentHint: '[slug] [mode] <description>', need: 'slug-optional' },
  { key: 'shape', description: 'Shape product intent and acceptance criteria.', argumentHint: '[slug] [hint]', need: 'slug-optional' },
  { key: 'design', description: 'Confirm the design with the person before the build.', argumentHint: '[slug] [move|amend|audit|critique] [instructions] | <setup|teach|extract|direction|sync>', need: 'slug-optional' },
  { key: 'slice', description: 'Decompose shaped scope into deliverable slices.', argumentHint: '<slug>', need: 'slug' },
  { key: 'plan', description: 'Plan one or more workflow slices.', argumentHint: '<slug> [slice|all] [feedback]', need: 'slug-slice-or-all' },
  { key: 'implement', description: 'Implement an approved slice plan.', argumentHint: '<slug> [slice|reviews]', need: 'slug-slice-optional' },
  { key: 'verify', description: 'Verify implementation and acceptance evidence.', argumentHint: '<slug> [slice]', need: 'slug-slice-optional' },
  { key: 'review', description: 'Review a workflow or an ad-hoc scope.', argumentHint: '<slug> [slice|triage] | <dimension> | sweep <aggregate>', need: 'slug-slice-optional' },
  { key: 'handoff', description: 'Prepare a pull-request handoff.', argumentHint: '<slug|pr#N|#N|N|branch> [slice]', need: 'slug-slice-optional' },
  { key: 'ship', description: 'Execute an approved ship plan.', argumentHint: '<slug|pr#N|#N|N|branch> [environment|announce|rollback] [run-id]', need: 'slug' },
  { key: 'retro', description: 'Record workflow lessons and outcomes.', argumentHint: '<slug|pr#N|#N|N|branch> [deep]', need: 'slug' },
  { key: 'brainstorm', description: 'Think an idea through; design adds sketches.', argumentHint: '[slug] [design] [idea]', need: 'slug-optional' },
  { key: 'probe', description: 'Collect runtime evidence without source mutation.', argumentHint: '<slug> [target|sweep] | sweep [path]', need: 'slug' },
  { key: 'simplify', description: 'Review a bounded scope for simplification.', argumentHint: '[branch [base]|commit range|plan slug slice|codebase [path]]', need: 'none' },
  { key: 'auto', description: 'Drive stages until the pre-handoff boundary.', argumentHint: '<slug> [slice]', need: 'slug-slice-optional' },
  { key: 'yolo', description: 'Run policy-governed autonomy with an external grant.', argumentHint: '<slug> [slice]', need: 'slug-slice-optional' },
  { key: 'task', description: 'Run the minimal non-code lifecycle.', argumentHint: '<description|task-slug|existing-slug description>', need: 'none' },
  { key: 'status', description: 'Inspect workflow state and next actions.', argumentHint: '[slug|pr#N|#N|N|branch] [deep] | advise [scope|fast]', need: 'slug-optional' },
  { key: 'recap', description: 'Explain recorded workflow context.', argumentHint: '<slug|pr#N|#N|N|branch> [slice|focus]', need: 'slug-slice-optional' },
  { key: 'close', description: 'Close a workflow or slice.', argumentHint: '<slug> [slice|reason]', need: 'slug-slice-optional' },
  { key: 'ship-plan', description: 'Route release-pipeline configuration.', argumentHint: '<init|build|edit|audit> [args]', need: 'none' },
  { key: 'docs', description: 'Route documentation operations.', argumentHint: '[primitive|slug|--audit-only|path]', need: 'slug-optional' },
  { key: 'observability', description: 'Route observability operations.', argumentHint: '<init|build|audit> [args]', need: 'none' },
]

/** The command name a key is registered under: `wf-<key>`. */
export function commandNameOf(key: string): string {
  return `wf-${key}`
}

/** The key a registered command name stands for, or null for another name. */
export function keyOfCommand(command: string): string | null {
  const bare = command.includes(':') ? command.slice(command.lastIndexOf(':') + 1) : command
  if (!bare.startsWith('wf-')) return null
  const key = bare.slice(3)
  return CATALOG.some(entry => entry.key === key) ? key : null
}

export function entryOf(key: string): CatalogEntry | null {
  return CATALOG.find(entry => entry.key === key) ?? null
}
