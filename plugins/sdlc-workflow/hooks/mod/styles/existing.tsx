/**
 * The existing visual parts in the three styles (MOD-DESIGN, 2026-10-04):
 * E1 the picker band's parts, E2 the strip, E3 the workflows dashboard, E4
 * the hub notice.
 *
 * One layout, three skins: every part is a stack of fixed rows. A row has a
 * left part that ends in "…" and a right part (figures, buttons) that never
 * moves. Nothing wraps. A style changes the colours, the glyphs and the case,
 * never a fact, a hotkey, an element key or the row order (Y3).
 */
import type { ElementTable, RenderElement } from 'claude-code'

import type { HubHealth } from '../active.ts'
import { DASHBOARD_KEY, LIVE_KEY, ROTATE_KEY } from '../names.ts'
import type { SliceEntry, WorkflowEntry } from '../workflows.ts'
import { cellsView, chipView, controlLabel, markView, say, stagePlaceOf, CELL_STAGES } from './skin.tsx'
import type { Palette, Tone, ViewStyle } from './tokens.ts'

type Ui = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Button'>

/** The tone of a workflow's stage: done when closed, attention when it waits for the person, run otherwise. */
export function workflowTone(workflow: WorkflowEntry): Tone {
  if (workflow.terminal) return 'quiet'
  if (needsPerson(workflow)) return 'attention'
  return 'run'
}

/** A workflow that waits for the person: its index says so. */
export function needsPerson(workflow: WorkflowEntry): boolean {
  return /awaiting|blocked|needs/iu.test(workflow.status)
}

/** The stage label of a workflow: its stage, "needs you", or "closed". */
export function stageWordOf(workflow: WorkflowEntry): string {
  if (workflow.terminal) return 'closed'
  if (needsPerson(workflow)) return 'needs you'
  return workflow.currentStage ?? workflow.status
}

/** The slices done of a roster, and its size. */
export function slicesDoneOf(slices: readonly SliceEntry[]): { done: number; total: number } {
  return { done: slices.filter(slice => slice.status === 'complete' || slice.status === 'completed' || slice.stage === 'verified').length, total: slices.length }
}

// ---------------------------------------------------------------------------
// E1 — the picker band's parts
// ---------------------------------------------------------------------------

/** The band's title split for the breadcrumb: the command so far, and what the step asks. */
export function pickerCrumbsOf(title: string): { path: string[]; ask: string } {
  const [command = title, ask = ''] = title.split(' — ')
  return { path: command.split(/\s+/u).filter(Boolean), ask }
}

/** The breadcrumb header: `/wf › plan › pick a workflow`. */
export function pickerTitleView(ui: Pick<Ui, 'Text'>, style: ViewStyle, palette: Palette, title: string): RenderElement[] {
  const { Text } = ui
  const { path, ask } = pickerCrumbsOf(title)
  const out: RenderElement[] = []
  path.forEach((part, index) => {
    if (index > 0) out.push(<Text color={palette.tones.quiet} {...(palette.tones.quiet === undefined ? { dimColor: true } : {})}>›</Text>)
    out.push(<Text bold>{say(style, part)}</Text>)
  })
  if (ask !== '') {
    out.push(<Text color={palette.tones.quiet} {...(palette.tones.quiet === undefined ? { dimColor: true } : {})}>›</Text>)
    out.push(<Text>{say(style, ask)}</Text>)
  }
  return out
}

/** The page count of a step that pages: `1/3`. */
export function pickerPageText(page: number, pages: number): string | null {
  return pages > 1 ? `${page + 1}/${pages}` : null
}

/** A row's label split into its name (the clickable part) and its note. */
export function rowPartsOf(label: string): { name: string; note: string } {
  const cut = label.indexOf('  ')
  return cut === -1 ? { name: label, note: '' } : { name: label.slice(0, cut), note: label.slice(cut + 2) }
}

/**
 * The words a workflow row's label keeps (E1 rows): the name the filter
 * matches. The mark and the stage label draw beside it, not in it.
 */
export function pickerRowLabel(style: ViewStyle, label: string, _workflow: WorkflowEntry | null): string {
  return say(style, label)
}

/** The labels of the band's own controls (E1): the same keys, in capitals for D and E. */
export function pickerControlLabel(style: ViewStyle, label: string): string {
  return controlLabel(style, label)
}

// ---------------------------------------------------------------------------
// E2 — the strip
// ---------------------------------------------------------------------------

export type StripParts = {
  workflow: WorkflowEntry
  slices: readonly SliceEntry[]
  /** The strip text the helpers compose (`stripTextOf`), for the status line and the tests. */
  text: string
}

/** The width from which the strip is one row; below it the next command and the cost take a second row. */
export const STRIP_ONE_ROW_COLUMNS = 96

/** Rows the strip takes at a width: one, or two when the next command moves down. */
export function styledStripRows(_style: ViewStyle, parts: StripParts, detail: string | null, _others: number, columns: number): number {
  const hasTail = (parts.workflow.nextInvocation !== null && !parts.workflow.terminal) || detail !== null
  return columns >= STRIP_ONE_ROW_COLUMNS || !hasTail ? 1 : 2
}

/**
 * What the strip's buttons do. The strip is where the person reaches the
 * mod's own views: no slash command opens them.
 */
export type StripActions = {
  /** The other workflows the rotate button walks; 0 hides the button. */
  others: number
  rotate: () => void
  /** Opens the dashboard pane. */
  dashboard: () => void
  /** Opens the live view of the strip's workflow, or null when it has no run (or the live line shows it). */
  live: (() => void) | null
}

/**
 * The strip (E2), one row: the state mark, the workflow, the stage label, the
 * stage cells, the slices done, the next command (the part that shrinks), the
 * cost, then the buttons: live, dashboard, rotate. Below `STRIP_ONE_ROW_COLUMNS`
 * the next command and the cost take a second row.
 */
export function stripStyledView(ui: Ui, style: ViewStyle, palette: Palette, parts: StripParts, detail: string | null, actions: StripActions, columns = 120): RenderElement {
  const { Box, Text, Button } = ui
  const workflow = parts.workflow
  const tone = workflowTone(workflow)
  const place = stagePlaceOf(workflow.currentStage, workflow.terminal)
  const slices = slicesDoneOf(parts.slices)
  const next = workflow.terminal ? null : workflow.nextInvocation
  const isOneRow = styledStripRows(style, parts, detail, actions.others, columns) === 1
  const tail: RenderElement[] = [
    next === null ? (
      <Box flexGrow={1} />
    ) : (
      <Box flexGrow={1} flexShrink={1} flexDirection="row" gap={1}>
        <Text dimColor>{say(style, 'next')}</Text>
        <Text wrap="truncate-end">{next}</Text>
      </Box>
    ),
    detail === null ? null : <Text dimColor>{say(style, detail)}</Text>,
  ].filter((part): part is RenderElement => part !== null)
  const buttons: RenderElement[] = [
    actions.live === null ? null : <Button key={LIVE_KEY} label={controlLabel(style, 'live')} onPress={actions.live} />,
    <Button key={DASHBOARD_KEY} label={controlLabel(style, 'dashboard')} dimColor onPress={actions.dashboard} />,
    actions.others === 0 ? null : <Button key={ROTATE_KEY} label={controlLabel(style, `⇄ ${actions.others}`)} dimColor onPress={actions.rotate} />,
  ].filter((button): button is RenderElement => button !== null)
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        {markView(ui, style, palette, tone)}
        <Text bold wrap="truncate-end">
          {say(style, workflow.slug)}
        </Text>
        {chipView(ui, style, palette, tone, stageWordOf(workflow))}
        <Box flexDirection="row" flexShrink={0}>
          {cellsView(ui, style, palette, place.done, place.at, CELL_STAGES.length)}
        </Box>
        {slices.total === 0 ? null : <Text dimColor>{`${slices.done}/${slices.total}`}</Text>}
        {isOneRow ? tail : <Box flexGrow={1} />}
        {buttons}
      </Box>
      {isOneRow ? null : (
        <Box flexDirection="row" gap={1} paddingLeft={2}>
          {tail}
        </Box>
      )}
    </Box>
  )
}

// ---------------------------------------------------------------------------
// E3 — the workflows dashboard
// ---------------------------------------------------------------------------

export type WorkflowsModel = {
  workflows: readonly WorkflowEntry[]
  slices: ReadonlyMap<string, readonly SliceEntry[]>
  findings: ReadonlyMap<string, number>
  shipPlanBlockers: number | null
  hub: HubHealth | null
  columns: number
  details: boolean
}

export type WorkflowsActions = {
  status: (slug: string) => void
  pick: (slug: string) => void
  details: () => void
}

export const WORKFLOW_STATUS_KEY = 'wf-dash-status:'
export const WORKFLOW_PICK_KEY = 'wf-dash-pick:'
export const WORKFLOW_DETAILS_KEY = 'wf-dash-details'

function hubLine(hub: HubHealth | null): string {
  if (hub === null) return 'hub unknown'
  if (!hub.ok) return `hub ${hub.version ?? '?'} down`
  return `hub ${hub.version ?? '?'} ok`
}

/** One cell of a row: a fixed-width Box, so a proportional font keeps the columns (F7). */
function cell(ui: Ui, width: number, children: RenderElement | RenderElement[]): RenderElement {
  const { Box } = ui
  return (
    <Box width={width} flexShrink={0} flexDirection="row">
      {children}
    </Box>
  )
}

/**
 * The workflows dashboard (E3): a header row with the counts and the details
 * button, a column header, one row per workflow with fixed columns and its
 * buttons pinned right, and a footer.
 */
export function workflowsStyledView(ui: Ui, style: ViewStyle, palette: Palette, model: WorkflowsModel, actions: WorkflowsActions): RenderElement {
  const { Box, Text, Button } = ui
  const shown = model.details ? model.workflows : model.workflows.filter(workflow => !workflow.terminal)
  const open = model.workflows.filter(workflow => !workflow.terminal).length
  const closed = model.workflows.length - open
  const hidden = model.workflows.length - shown.length
  const widths = { mark: 2, slug: Math.min(32, Math.max(10, ...model.workflows.map(workflow => workflow.slug.length)) + 2), stage: 14, slices: 9, findings: 12 }
  const findingsText = (workflow: WorkflowEntry) => {
    const count = model.findings.get(workflow.slug)
    return count === undefined ? '—' : `${count} open`
  }
  const footer = [model.shipPlanBlockers === null ? null : `ship-plan blockers ${model.shipPlanBlockers}`, hubLine(model.hub)].filter(Boolean).join(' · ')
  const detailsLabel = model.details ? 'details ▾' : hidden > 0 ? `details ▸ (${hidden} closed)` : 'details ▸'
  return (
    <Box flexDirection="column" paddingX={1} {...(palette.ground === undefined ? {} : { backgroundColor: palette.ground })}>
      <Box flexDirection="row" gap={1}>
        <Text bold>{say(style, 'workflows')}</Text>
        <Text dimColor>{say(style, `${open} open · ${closed} closed`)}</Text>
        <Box flexGrow={1} />
        <Button key={WORKFLOW_DETAILS_KEY} hotkey="d" label={controlLabel(style, detailsLabel)} dimColor onPress={() => actions.details()} />
      </Box>
      <Box flexDirection="row">
        {cell(ui, widths.mark, <Text> </Text>)}
        {cell(ui, widths.slug, <Text dimColor>WORKFLOW</Text>)}
        {cell(ui, widths.stage, <Text dimColor>STAGE</Text>)}
        {cell(ui, widths.slices, <Text dimColor>SLICES</Text>)}
        {cell(ui, widths.findings, <Text dimColor>FINDINGS</Text>)}
        <Text dimColor>NEXT</Text>
      </Box>
      {shown.length === 0 ? <Text dimColor>{say(style, '(no workflows under .ai/workflows)')}</Text> : null}
      {shown.map(workflow => {
        const tone = workflowTone(workflow)
        const roster = model.slices.get(workflow.slug) ?? []
        const done = slicesDoneOf(roster)
        return (
          <Box key={`wf-row:${workflow.slug}`} flexDirection="row">
            {cell(ui, widths.mark, markView(ui, style, palette, tone))}
            {cell(
              ui,
              widths.slug,
              <Text bold={!workflow.terminal} dimColor={workflow.terminal} wrap="truncate-end">
                {say(style, workflow.slug)}
              </Text>,
            )}
            {cell(ui, widths.stage, chipView(ui, style, palette, tone, stageWordOf(workflow)))}
            {cell(ui, widths.slices, roster.length === 0 ? <Text dimColor>—</Text> : cellsView(ui, style, palette, done.done, -1, done.total))}
            {cell(ui, widths.findings, <Text color={model.findings.has(workflow.slug) ? palette.tones.attention : palette.tones.quiet}>{say(style, findingsText(workflow))}</Text>)}
            <Box flexGrow={1} flexShrink={1}>
              <Text dimColor wrap="truncate-end">
                {workflow.terminal ? '' : (workflow.nextInvocation ?? '')}
              </Text>
            </Box>
            <Button key={`${WORKFLOW_STATUS_KEY}${workflow.slug}`} label={controlLabel(style, 'status')} dimColor onPress={() => actions.status(workflow.slug)} />
            {workflow.terminal ? null : <Button key={`${WORKFLOW_PICK_KEY}${workflow.slug}`} label={controlLabel(style, 'pick')} variant="primary" onPress={() => actions.pick(workflow.slug)} />}
          </Box>
        )
      })}
      <Text dimColor wrap="truncate-end">
        {say(style, footer)}
      </Text>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// E4 — the hub notice
// ---------------------------------------------------------------------------

/** The hub line under the logo (E4): the state mark or tag, the hub, then the rest quiet. */
export function noticeStyledView(ui: Pick<Ui, 'Box' | 'Text'>, style: ViewStyle, palette: Palette, engineText: string, hub: HubHealth | null, hubText: string, command: string): RenderElement {
  const { Box, Text } = ui
  const isUp = hub !== null && hub.ok
  const tone: Tone = isUp ? 'done' : 'stop'
  const [head = hubText, ...rest] = hubText.split(' · ')
  return (
    <Box flexDirection="column">
      {engineText === '' ? null : <Text dimColor>{engineText}</Text>}
      <Box flexDirection="row" gap={1}>
        {style === 'grid' ? chipView(ui, style, palette, isUp ? 'attention' : 'stop', isUp ? 'operational' : 'down') : markView(ui, style, palette, tone)}
        <Text bold={style !== 'dashboard'}>{say(style, head)}</Text>
        <Text dimColor wrap="truncate-end">
          {`· ${say(style, [...rest, command].filter(Boolean).join(' · '))}`}
        </Text>
      </Box>
    </Box>
  )
}
