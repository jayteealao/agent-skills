/**
 * The existing visual parts in the three styles (WF-LIVE-VIEWS-PLAN.md 14.3):
 * E1 the picker band's title and rows, E2 the strip, E3 the workflows
 * dashboard, E4 the hub notice.
 *
 * Y3: a restyle changes no fact, no hotkey, no element key and no row order.
 * Y4: the strip's row count is measured on the styled text.
 */
import type { ElementTable, RenderElement } from 'claude-code'

import { sliceMarkOf, wrappedRowsOf } from '../active.ts'
import type { HubHealth } from '../active.ts'
import type { SliceEntry, WorkflowEntry } from '../workflows.ts'
import { GRID_INK, GRID_LIME, INSTRUMENT_ORANGE } from './tokens.ts'
import type { Palette, Tone, ViewStyle } from './tokens.ts'

type Ui = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Button'>

const STAGE_ORDER = ['intake', 'shape', 'design', 'slice', 'plan', 'implement', 'verify', 'review', 'handoff', 'ship', 'retro']

/** The tone of a workflow's stage: done when closed, attention when it waits for the person, run otherwise. */
export function workflowTone(workflow: WorkflowEntry): Tone {
  if (workflow.terminal) return 'done'
  if (needsPerson(workflow)) return 'attention'
  return 'run'
}

/** A workflow that waits for the person: its index says so. */
export function needsPerson(workflow: WorkflowEntry): boolean {
  return /awaiting|blocked|needs/iu.test(workflow.status)
}

/** Four cells for a stage among plan, implement, verify, review. */
function stageCells(stage: string | null, on: string, off: string): string {
  const index = stage === null ? -1 : ['plan', 'implement', 'verify', 'review'].indexOf(stage)
  const before = stage === null ? 0 : STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf('review') ? 4 : index + 1
  return on.repeat(Math.max(0, before)) + off.repeat(Math.max(0, 4 - before))
}

// ---------------------------------------------------------------------------
// E1 — the picker band
// ---------------------------------------------------------------------------

/** The band's title row texts: the lead (style mark), the title, the page count. */
export function pickerTitleParts(style: ViewStyle, title: string, page: number, pages: number): { lead: string | null; title: string; tail: string | null } {
  const paging = pages > 1
  if (style === 'instrument') return { lead: '01', title: title.toUpperCase(), tail: paging ? `${page + 1}/${pages}` : null }
  if (style === 'grid') return { lead: '/01', title: title.toUpperCase(), tail: paging ? `${page + 1}/${pages}` : null }
  return { lead: null, title, tail: paging ? `(page ${page + 1} of ${pages})` : null }
}

/** The title row's leading elements (E1). */
export function pickerTitleView(ui: Pick<Ui, 'Text'>, style: ViewStyle, palette: Palette, title: string, page: number, pages: number): RenderElement[] {
  const { Text } = ui
  const parts = pickerTitleParts(style, title, page, pages)
  const out: RenderElement[] = []
  if (parts.lead !== null) out.push(<Text color={style === 'grid' ? palette.tones.run : palette.tones.quiet}>{parts.lead}</Text>)
  out.push(<Text bold>{parts.title}</Text>)
  if (parts.tail !== null) out.push(<Text color={style === 'instrument' ? INSTRUMENT_ORANGE : undefined} dimColor={style === 'dashboard'}>{parts.tail}</Text>)
  return out
}

/**
 * A workflow row's label with its style mark (E1 rows). Only a workflow row
 * takes one; the filter matches the words, which the mark leaves as they are.
 */
export function pickerRowLabel(style: ViewStyle, label: string, workflow: WorkflowEntry | null): string {
  if (workflow === null) return label
  const waits = needsPerson(workflow)
  if (style === 'instrument') return `${stageCells(workflow.currentStage, '▪', '▫')} ${label}${waits ? ' !' : ''}`
  if (style === 'grid') return waits ? `${label}  NEEDS YOU` : label
  return `${workflow.terminal ? '○' : '●'} ${label}`
}

/** The labels of the band's own controls (E1): the same keys, in capitals for D and E. */
export function pickerControlLabel(style: ViewStyle, label: string): string {
  if (style === 'dashboard') return label
  return style === 'grid' ? `${label.toUpperCase()} ↗` : label.toUpperCase()
}

// ---------------------------------------------------------------------------
// E2 — the strip
// ---------------------------------------------------------------------------

export type StripParts = {
  workflow: WorkflowEntry
  slices: readonly SliceEntry[]
  /** The strip text the helpers compose (`stripTextOf`). */
  text: string
}

/** The strip row as styled pieces: the mark, the main text, the dim tail. Y4 counts these. */
export function stripPieces(style: ViewStyle, parts: StripParts): { mark: string; main: string; tail: string } {
  const cut = parts.text.indexOf(' · next: ')
  const head = cut === -1 ? parts.text : parts.text.slice(0, cut)
  const next = cut === -1 ? '' : parts.text.slice(cut + 3)
  if (style === 'instrument') {
    const done = parts.slices.filter(slice => slice.status === 'complete' || slice.status === 'completed').length
    const count = parts.slices.length > 0 ? `  ${done}/${parts.slices.length}` : ''
    return { mark: '', main: `${head.replace(/ · /gu, '  ').toUpperCase()}${count}`, tail: next === '' ? '' : `NEXT ${next.replace(/^next: /u, '')}` }
  }
  if (style === 'grid') {
    const blocks = parts.slices.map(slice => (slice.status === 'complete' || slice.status === 'completed' ? '■' : '□')).join('')
    const tag = parts.workflow.terminal ? 'CLOSED' : needsPerson(parts.workflow) ? 'NEEDS YOU' : 'RUNNING'
    return { mark: tag, main: `${head.replace(/^wf /u, '').replace(/ · /u, ' — ').toUpperCase()}${blocks === '' ? '' : ` ${blocks}`}`, tail: next }
  }
  return { mark: parts.workflow.terminal ? '○' : '●', main: head, tail: next === '' ? '' : next }
}

/** Rows the styled strip takes at a width (Y4): the workflow row, then the detail row. */
export function styledStripRows(style: ViewStyle, parts: StripParts, detail: string | null, others: number, columns: number): number {
  const width = Math.max(1, columns - 2)
  const button = others === 0 ? 0 : `⇄ ${others} more`.length + 1
  const pieces = stripPieces(style, parts)
  const text = [pieces.mark, pieces.main, pieces.tail === '' ? '' : `· ${pieces.tail}`].filter(Boolean).join(' ')
  const rows = wrappedRowsOf(text, Math.max(1, width - button))
  return rows + (detail === null ? 0 : wrappedRowsOf(`   ${styledDetail(style, detail)}`, width))
}

/** The detail row's text: dim in every style, in capitals for D and E. */
export function styledDetail(style: ViewStyle, detail: string): string {
  return style === 'dashboard' ? detail : detail.toUpperCase()
}

/** The strip (E2): the workflow row with the rotate button, then the dim detail row. */
export function stripStyledView(ui: Ui, style: ViewStyle, palette: Palette, parts: StripParts, detail: string | null, others: number, rotateKey: string, rotate: () => void): RenderElement {
  const { Box, Text, Button } = ui
  const pieces = stripPieces(style, parts)
  const tone = workflowTone(parts.workflow)
  const markColour = style === 'grid' ? (pieces.mark === 'NEEDS YOU' ? GRID_INK : palette.tones[tone]) : palette.tones[tone]
  const markBackground = style === 'grid' && pieces.mark === 'NEEDS YOU' ? GRID_LIME : undefined
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" gap={1}>
        {pieces.mark === '' ? null : (
          <Text color={markColour} {...(markBackground === undefined ? {} : { backgroundColor: markBackground })} bold={style === 'grid'}>
            {pieces.mark}
          </Text>
        )}
        <Text wrap="wrap" bold={style === 'grid'}>
          {pieces.main}
        </Text>
        {pieces.tail === '' ? null : (
          <Text wrap="wrap" dimColor>
            {`· ${pieces.tail}`}
          </Text>
        )}
        {others === 0 ? null : <Button key={rotateKey} label={style === 'dashboard' ? `⇄ ${others} more` : `⇄ ${others} MORE`} dimColor onPress={rotate} />}
      </Box>
      {detail === null ? null : (
        <Text dimColor wrap="wrap">
          {`   ${styledDetail(style, detail)}`}
        </Text>
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

function hubLine(style: ViewStyle, hub: HubHealth | null): string {
  if (hub === null) return style === 'dashboard' ? 'hub unknown' : 'HUB UNKNOWN'
  if (!hub.ok) return style === 'dashboard' ? `hub ${hub.version ?? '?'} down` : 'HUB DOWN'
  if (style === 'grid') return `HUB ${hub.version ?? '?'} · OPERATIONAL`
  if (style === 'instrument') return `HUB ${hub.version ?? '?'} OK`
  return `hub ${hub.version ?? '?'} ok`
}

/** One cell of a dashboard row: a fixed-width Box, so a proportional font keeps the columns (F7). */
function cell(ui: Ui, width: number, children: RenderElement): RenderElement {
  const { Box } = ui
  return (
    <Box width={width} flexShrink={0}>
      {children}
    </Box>
  )
}

/** The workflows dashboard (E3) in a style. */
export function workflowsStyledView(ui: Ui, style: ViewStyle, palette: Palette, model: WorkflowsModel, actions: WorkflowsActions): RenderElement {
  const { Box, Text, Button } = ui
  const shown = model.details ? model.workflows : model.workflows.filter(workflow => !workflow.terminal)
  const hidden = model.workflows.length - shown.length
  const upper = style !== 'dashboard'
  const arrow = style === 'grid' ? ' ↗' : ''
  const slugWidth = Math.max(8, ...model.workflows.map(workflow => workflow.slug.length)) + 2
  const buttons = (workflow: WorkflowEntry) => [
    <Button key={`${WORKFLOW_STATUS_KEY}${workflow.slug}`} label={`${upper ? 'STATUS' : 'status'}${arrow}`} dimColor onPress={() => actions.status(workflow.slug)} />,
    workflow.terminal ? null : <Button key={`${WORKFLOW_PICK_KEY}${workflow.slug}`} label={`${upper ? 'PICK' : 'pick'}${arrow}`} {...(style === 'grid' ? { variant: 'primary' as const } : { dimColor: true })} onPress={() => actions.pick(workflow.slug)} />,
  ]
  const findingsText = (workflow: WorkflowEntry) => {
    const count = model.findings.get(workflow.slug)
    return count === undefined ? '' : `${count} open finding${count === 1 ? '' : 's'}`
  }
  const footer = [model.shipPlanBlockers === null ? null : `ship-plan blockers ${model.shipPlanBlockers}`, hubLine(style, model.hub)].filter(Boolean).join(' · ')
  const detailsButton = (
    <Button key={WORKFLOW_DETAILS_KEY} hotkey="d" label={model.details ? (upper ? 'HIDE CLOSED' : 'details ▾') : hidden > 0 ? (upper ? `${hidden} CLOSED ▸` : `details ▸ (${hidden} closed)`) : upper ? 'DETAILS ▸' : 'details ▸'} dimColor onPress={() => actions.details()} />
  )

  if (style === 'instrument') {
    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        {shown.length === 0 ? <Text dimColor>NO WORKFLOWS UNDER .AI/WORKFLOWS</Text> : null}
        {shown.map((workflow, index) => {
          const roster = model.slices.get(workflow.slug) ?? []
          const findings = findingsText(workflow)
          return (
            <Box key={`wf-card:${workflow.slug}`} flexDirection="column" borderStyle="round" borderColor={palette.line} paddingX={1}>
              <Box flexDirection="row" gap={1}>
                <Text color={palette.tones.quiet}>{String(index + 1).padStart(2, '0')}</Text>
                <Text bold>{workflow.slug.toUpperCase()}</Text>
                <Text color={palette.tones[workflowTone(workflow)]}>{workflow.terminal ? 'CLOSED' : (workflow.currentStage ?? workflow.status).toUpperCase()}</Text>
                {buttons(workflow)}
              </Box>
              {roster.length === 0 ? null : <Text color={palette.tones.done}>{roster.map(slice => (slice.stage === 'verified' ? '■' : slice.stage === 'defined' ? '□' : '▣')).join('')}</Text>}
              {findings === '' ? null : <Text color={INSTRUMENT_ORANGE}>{findings.toUpperCase()}</Text>}
              {workflow.terminal || workflow.nextInvocation === null ? null : <Text dimColor wrap="truncate-end">{`NEXT ${workflow.nextInvocation}`}</Text>}
            </Box>
          )
        })}
        <Box flexDirection="row" gap={1} borderStyle="round" borderColor={palette.line} paddingX={1}>
          <Text color={palette.tones.quiet}>{String(shown.length + 1).padStart(2, '0')}</Text>
          <Text color={model.hub?.ok === true ? palette.tones.done : INSTRUMENT_ORANGE}>{footer}</Text>
          {detailsButton}
        </Box>
      </Box>
    )
  }

  if (style === 'grid') {
    const widths = { slug: slugWidth, stage: 12, slices: 10, findings: 12 }
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="row" gap={1}>
          <Text color={palette.tones.run}>/01</Text>
          <Text bold>WORKFLOWS</Text>
        </Box>
        <Box flexDirection="row">
          {cell(ui, widths.slug, <Text dimColor>SLUG</Text>)}
          {cell(ui, widths.stage, <Text dimColor>STAGE</Text>)}
          {cell(ui, widths.slices, <Text dimColor>SLICES</Text>)}
          {cell(ui, widths.findings, <Text dimColor>FINDINGS</Text>)}
          <Text dimColor>NEXT</Text>
        </Box>
        {shown.length === 0 ? <Text dimColor>NO WORKFLOWS UNDER .AI/WORKFLOWS</Text> : null}
        {shown.map(workflow => {
          const roster = model.slices.get(workflow.slug) ?? []
          return (
            <Box flexDirection="row">
              {cell(ui, widths.slug, <Text bold wrap="truncate-end">{workflow.slug.toUpperCase()}</Text>)}
              {cell(ui, widths.stage, <Text color={palette.tones[workflowTone(workflow)]} wrap="truncate-end">{workflow.terminal ? 'CLOSED' : (workflow.currentStage ?? workflow.status).toUpperCase()}</Text>)}
              {cell(ui, widths.slices, <Text>{roster.map(slice => (slice.stage === 'verified' ? '■' : '□')).join('') || '—'}</Text>)}
              {cell(ui, widths.findings, <Text color={palette.tones.attention}>{findingsText(workflow).toUpperCase() || '—'}</Text>)}
              <Text dimColor wrap="truncate-end">{workflow.terminal ? '' : (workflow.nextInvocation ?? '')}</Text>
              {buttons(workflow)}
            </Box>
          )
        })}
        <Box flexDirection="row" gap={1}>
          <Text color={model.hub?.ok === true ? GRID_INK : '#ffffff'} backgroundColor={model.hub?.ok === true ? GRID_LIME : palette.tones.stop} bold>
            {` ${footer} `}
          </Text>
          {detailsButton}
        </Box>
      </Box>
    )
  }

  // Style A: one row per workflow, Box columns (F7), then one summary line.
  const widths = { dot: 2, slug: slugWidth, rail: 6, stage: 12, slices: 10, findings: 18 }
  const active = model.workflows.filter(workflow => !workflow.terminal)
  return (
    <Box flexDirection="column" paddingX={1}>
      {shown.length === 0 ? <Text dimColor>(no workflows under .ai/workflows)</Text> : null}
      {shown.map(workflow => {
        const roster = model.slices.get(workflow.slug) ?? []
        return (
          <Box flexDirection="row">
            {cell(ui, widths.dot, <Text color={palette.tones[workflowTone(workflow)]}>{workflow.terminal ? '○' : '●'}</Text>)}
            {cell(ui, widths.slug, <Text wrap="truncate-end">{workflow.slug}</Text>)}
            {cell(ui, widths.rail, <Text color={palette.tones.run}>{stageCells(workflow.currentStage, '━', '┄')}</Text>)}
            {cell(ui, widths.stage, <Text dimColor={workflow.terminal} wrap="truncate-end">{workflow.terminal ? 'closed' : (workflow.currentStage ?? workflow.status)}</Text>)}
            {cell(ui, widths.slices, <Text>{roster.map(sliceMarkOf).join(' ').slice(0, widths.slices - 1)}</Text>)}
            {cell(ui, widths.findings, <Text color={palette.tones.attention}>{findingsText(workflow)}</Text>)}
            <Text dimColor wrap="truncate-end">{workflow.terminal ? '' : (workflow.nextInvocation ?? '')}</Text>
            {buttons(workflow)}
          </Box>
        )
      })}
      {active
        .filter(workflow => (model.slices.get(workflow.slug) ?? []).length > 0)
        .map(workflow => (
          <Text dimColor wrap="truncate-end">
            {`${workflow.slug} slices   ${(model.slices.get(workflow.slug) ?? []).map(slice => `${slice.slug} ${sliceMarkOf(slice)} ${slice.stage}`).join('   ')}`}
          </Text>
        ))}
      <Box flexDirection="row" gap={1}>
        <Text dimColor wrap="truncate-end">
          {footer}
        </Text>
        {detailsButton}
      </Box>
    </Box>
  )
}

// ---------------------------------------------------------------------------
// E4 — the hub notice
// ---------------------------------------------------------------------------

/** The hub line under the logo (E4) in a style. */
export function noticeStyledView(ui: Pick<Ui, 'Box' | 'Text'>, style: ViewStyle, palette: Palette, engineText: string, hub: HubHealth | null, hubText: string, command: string): RenderElement {
  const { Box, Text } = ui
  const isUp = hub !== null && hub.ok
  const line = style === 'instrument' ? hubText.replace(/^sdlc /u, '').toUpperCase() : style === 'grid' ? `/${hubText.replace(/^sdlc /u, '').replace(/ · /u, ' — ').toUpperCase()}` : hubText
  return (
    <Box flexDirection="column">
      {engineText === '' ? null : <Text dimColor>{engineText}</Text>}
      <Box flexDirection="row" gap={1}>
        {style === 'dashboard' ? <Text color={isUp ? palette.tones.done : palette.tones.stop}>●</Text> : null}
        <Text dimColor={style === 'dashboard'} color={style === 'dashboard' ? undefined : isUp ? palette.tones.plain : palette.tones.stop}>
          {`${line} · ${command}`}
        </Text>
      </Box>
    </Box>
  )
}
