/**
 * The `/wf` commands as the picker offers them: the 19 keys, with `loop` and
 * `project` as one row per sub-key, and `status recap` as a row of its own.
 * Each row has the one-line description it shows, the dim argument hint, and
 * what the picker has to ask for before the command is complete. The mod
 * registers no `/wf-<key>` command: `/wf` is the one way in.
 *
 * `need` says which picker steps a row runs through:
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
  /** The words the person types after `/wf`: a key, or a key and its sub-key (`loop goal`). */
  key: string
  /** The name the rest of the mod uses for the command: the sub-key of a two-word row (`goal`). */
  name: string
  description: string
  argumentHint: string
  need: ArgumentNeed
}

export const CATALOG: readonly CatalogEntry[] = [
  { key: 'intake', name: 'intake', description: 'Start, extend, adopt, or maintain workflow scope.', argumentHint: '[slug] [mode] <description>', need: 'slug-optional' },
  { key: 'shape', name: 'shape', description: 'Shape product intent and acceptance criteria.', argumentHint: '[slug] [hint]', need: 'slug-optional' },
  { key: 'design', name: 'design', description: 'Confirm the design with the person before the build.', argumentHint: '[slug] [move|amend|import|audit|critique] [instructions] | <setup|teach|extract|direction|sync>', need: 'slug-optional' },
  { key: 'slice', name: 'slice', description: 'Decompose shaped scope into deliverable slices.', argumentHint: '<slug>', need: 'slug' },
  { key: 'plan', name: 'plan', description: 'Plan one or more workflow slices.', argumentHint: '<slug> [slice|all] [feedback]', need: 'slug-slice-or-all' },
  { key: 'implement', name: 'implement', description: 'Implement an approved slice plan.', argumentHint: '<slug> [slice|reviews]', need: 'slug-slice-optional' },
  { key: 'verify', name: 'verify', description: 'Verify implementation and acceptance evidence.', argumentHint: '<slug> [slice]', need: 'slug-slice-optional' },
  { key: 'review', name: 'review', description: 'Review a workflow or an ad-hoc scope.', argumentHint: '<slug> [slice|triage] | <dimension> | sweep <aggregate>', need: 'slug-slice-optional' },
  { key: 'handoff', name: 'handoff', description: 'Prepare a pull-request handoff.', argumentHint: '<slug|pr#N|#N|N|branch> [slice]', need: 'slug-slice-optional' },
  { key: 'ship', name: 'ship', description: 'Execute an approved ship plan.', argumentHint: '<slug|pr#N|#N|N|branch> [environment|announce|rollback] [run-id]', need: 'slug' },
  { key: 'retro', name: 'retro', description: 'Record workflow lessons and outcomes.', argumentHint: '<slug|pr#N|#N|N|branch> [deep]', need: 'slug' },
  { key: 'probe', name: 'probe', description: 'Collect runtime evidence without source mutation.', argumentHint: '<slug> [target|sweep] | sweep [path]', need: 'slug' },
  { key: 'auto', name: 'auto', description: 'Drive stages until the pre-handoff boundary.', argumentHint: '<slug> [slice]', need: 'slug-slice-optional' },
  { key: 'yolo', name: 'yolo', description: 'Run policy-governed autonomy with an external grant.', argumentHint: '<slug> [slice]', need: 'slug-slice-optional' },
  { key: 'campaign', name: 'campaign', description: 'Walk the packets of one list, one at a time.', argumentHint: '<slug>', need: 'slug' },
  { key: 'loop goal', name: 'goal', description: 'Hand a slug to the host goal; a script judges done.', argumentHint: '<slug> [objective|resume|status|clear]', need: 'slug' },
  { key: 'loop optimize', name: 'optimize', description: 'Run the metric loop of an optimize slug.', argumentHint: '<slug> | <description>', need: 'slug' },
  { key: 'loop prototype', name: 'prototype', description: 'Prove an idea by running code, one round per request.', argumentHint: '<idea> | <poc-branch> <idea> | <slug> [request]', need: 'slug-optional' },
  { key: 'status', name: 'status', description: 'Inspect workflow state and next actions.', argumentHint: '[slug|pr#N|#N|N|branch] [deep] | advise [scope|fast]', need: 'slug-optional' },
  { key: 'status recap', name: 'recap', description: 'Explain recorded workflow context.', argumentHint: '<slug|pr#N|#N|N|branch> [slice|focus]', need: 'slug-slice-optional' },
  { key: 'project ship-plan', name: 'ship-plan', description: 'Route release-pipeline configuration.', argumentHint: '<init|build|edit|audit> [args]', need: 'none' },
  { key: 'project observability', name: 'observability', description: 'Route observability operations.', argumentHint: '<init|build|audit> [args]', need: 'none' },
  { key: 'docs', name: 'docs', description: 'Route documentation operations.', argumentHint: '[primitive|slug|--audit-only|path]', need: 'slug-optional' },
]

export function entryOf(key: string): CatalogEntry | null {
  return CATALOG.find(entry => entry.key === key) ?? null
}

/**
 * The row that the first words of a command name, and how many words it used:
 * a two-word row (`loop goal`) wins over a one-word row (`status`). Null when
 * the first word starts no row.
 */
export function entryAt(tokens: readonly string[]): { entry: CatalogEntry; words: number } | null {
  const [first, second] = tokens
  if (first === undefined) return null
  if (second !== undefined) {
    const pair = entryOf(`${first} ${second}`)
    if (pair !== null) return { entry: pair, words: 2 }
  }
  const one = entryOf(first)
  return one === null ? null : { entry: one, words: 1 }
}
