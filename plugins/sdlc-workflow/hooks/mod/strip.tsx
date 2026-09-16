/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ElementTable, RenderElement } from 'claude-code'

import { sliceMarkOf } from './active.ts'
import type { SliceEntry, WorkflowEntry } from './workflows.ts'

export type StripUi = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Button'>

/** The strip under the picker: the workflow row and, when known, the cost row. */
export function stripView(ui: StripUi, text: string, cost: string | null): RenderElement {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text wrap="truncate-end">{text}</Text>
      {cost === null ? null : (
        <Text dimColor wrap="truncate-end">
          {`   ${cost}`}
        </Text>
      )}
    </Box>
  )
}

/** Rows the strip takes: one, or two with a cost row. */
export function stripRows(cost: string | null): number {
  return cost === null ? 1 : 2
}

export const STATUS_KEY_PREFIX = 'wf-dash-status:'
export const PICK_KEY_PREFIX = 'wf-dash-pick:'

export type DashboardModel = {
  workflows: readonly WorkflowEntry[]
  /** The rosters of the workflows, by slug, for those read. */
  slices: ReadonlyMap<string, readonly SliceEntry[]>
  /** Open findings by slug, for those with a ledger. */
  findings: ReadonlyMap<string, number>
  /** Blockers the ship-plan audit holds open, or null when there is no audit. */
  shipPlanBlockers: number | null
  hub: string
  /** The width the pane draws into. */
  columns: number
}

export type DashboardActions = {
  status: (slug: string) => void
  pick: (slug: string) => void
}

/** The dashboard pane: every workflow, the rosters, the open findings, and the hub. */
export function dashboardView(ui: StripUi, model: DashboardModel, actions: DashboardActions): RenderElement {
  const { Box, Text, Button } = ui
  const slugWidth = Math.max(8, ...model.workflows.map(w => w.slug.length))
  const pad = (text: string, width: number) => text.padEnd(width).slice(0, width)
  const header = `${pad('workflow', slugWidth)}  ${pad('status', 8)}  ${pad('stage', 10)}  ${pad('slice', 10)}  next`
  const active = model.workflows.filter(w => !w.terminal)
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor wrap="truncate-end">
        {header}
      </Text>
      {model.workflows.length === 0 ? <Text dimColor>(no workflows under .ai/workflows)</Text> : null}
      {model.workflows.map(workflow => (
        <Box flexDirection="row" gap={2}>
          <Text wrap="truncate-end">
            {`${pad(workflow.slug, slugWidth)}  ${pad(workflow.terminal ? 'closed' : workflow.status, 8)}  ${pad(workflow.currentStage ?? '', 10)}  ${pad(workflow.selectedSlice ?? '', 10)}  ${workflow.terminal ? '' : (workflow.nextInvocation ?? '')}`}
          </Text>
          <Button key={`${STATUS_KEY_PREFIX}${workflow.slug}`} label="status" dimColor onPress={() => actions.status(workflow.slug)} />
          {workflow.terminal ? null : (
            <Button key={`${PICK_KEY_PREFIX}${workflow.slug}`} label="pick" dimColor onPress={() => actions.pick(workflow.slug)} />
          )}
        </Box>
      ))}
      {active.length > 0 ? <Text dimColor>{'─'.repeat(Math.max(10, Math.min(model.columns - 2, 60)))}</Text> : null}
      {active.map(workflow => {
        const roster = model.slices.get(workflow.slug) ?? []
        if (roster.length === 0) return null
        const cells = roster.map(slice => `${slice.slug} ${sliceMarkOf(slice)} ${slice.stage}`).join('   ')
        return (
          <Text wrap="truncate-end">
            {`${workflow.slug} slices   ${cells}`}
          </Text>
        )
      })}
      <Text dimColor wrap="truncate-end">
        {[
          ...[...model.findings].map(([slug, count]) => `${slug} open findings ${count}`),
          ...(model.shipPlanBlockers === null ? [] : [`ship-plan blockers ${model.shipPlanBlockers}`]),
          model.hub,
        ].join(' · ')}
      </Text>
    </Box>
  )
}

/** The notice under the logo: the engine's text, then the hub line. */
export function noticeView(ui: Pick<ElementTable<'terminal'>, 'Box' | 'Text'>, engineText: string, hubText: string, command: string): RenderElement {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column">
      {engineText === '' ? null : <Text dimColor>{engineText}</Text>}
      <Text dimColor>{`${hubText} · ${command}`}</Text>
    </Box>
  )
}
