/**
 * Style A · Dashboard (WF-LIVE-VIEWS-PLAN.md 8.1): the calm dark view. One
 * focus, one "Needs you" list, one summary line; the rest behind details.
 *
 * Details off: liveness row, focus block with the stage rail, slice dots,
 * "Needs you", the meters, one summary line with the details button.
 * Details on: the sections too (agents, commits, protected files, steering).
 * A section a need opened shows with details off as well (V8).
 */
import type { RenderElement } from 'claude-code'

import { barOf } from '../live/glyphs.ts'
import type { Section, TrackGroup, ViewFacts } from './facts.ts'
import { factKey, markGlyph, markTone, needActions, paneButtons, tabRow, toneColor } from './kit.tsx'
import type { LiveActions, PaneView, StyleUi } from './kit.tsx'

function railText(rail: NonNullable<ViewFacts['focus']['rail']>): string {
  return rail.steps.map((step, i) => `${i < rail.done ? '━━' : i === rail.at ? '━●' : '┄┄'} ${step}`).join('  ')
}

function groupView(ui: StyleUi, facts: ViewFacts, group: TrackGroup, view: PaneView): RenderElement {
  const { Box, Text } = ui
  const palette = view.palette
  // The slice dots: one per track, the furthest mark of each (details off); one row per track (details on).
  const compact = !view.details && facts.kind === 'yolo'
  return (
    <Box key={factKey(`group:${group.key}`)} flexDirection="column">
      {group.lights.length === 0 && facts.kind !== 'campaign' ? null : (
        <Box flexDirection="row" gap={1}>
          <Text bold>{group.title}</Text>
          {group.lights.map(light => (
            <Text color={light.on ? palette.tones.done : palette.tones.quiet}>{`${light.on ? '●' : '○'} ${light.label}`}</Text>
          ))}
        </Box>
      )}
      {facts.kind === 'brainstorm' ? <Text bold>{group.title}</Text> : null}
      {compact ? (
        <Box flexDirection="row" gap={1}>
          {group.tracks.map(track => {
            const mark = track.marks.includes('stop') ? 'stop' : track.marks.includes('run') ? 'run' : track.marks.every(m => m === 'done') ? 'done' : 'wait'
            return <Text color={toneColor(palette, markTone(mark))}>{markGlyph('dashboard', mark)}</Text>
          })}
          <Text dimColor>{`${group.tracks.filter(track => track.marks.every(m => m === 'done')).length} of ${group.tracks.length} slices done`}</Text>
        </Box>
      ) : (
        group.tracks.map(track => (
          <Box flexDirection="row" gap={1}>
            {track.marks.map(mark => (
              <Text color={toneColor(palette, markTone(mark))}>{markGlyph('dashboard', mark)}</Text>
            ))}
            <Text wrap="truncate-end" color={toneColor(palette, track.tone)}>
              {track.label}
            </Text>
            {track.note === '' ? null : <Text dimColor>{track.note}</Text>}
          </Box>
        ))
      )}
    </Box>
  )
}

function sectionView(ui: StyleUi, section: Section, view: PaneView): RenderElement {
  const { Box, Text } = ui
  return (
    <Box key={factKey(`section:${section.key}`)} flexDirection="column">
      <Text bold>{section.title}</Text>
      {section.lines.map(line => (
        <Text color={toneColor(view.palette, line.tone)} dimColor={line.tone === 'quiet'} wrap="truncate-end">
          {`  ${line.text}`}
        </Text>
      ))}
    </Box>
  )
}

export function dashboardPane(ui: StyleUi, facts: ViewFacts, view: PaneView, act: LiveActions): RenderElement {
  const { Box, Text, Button, Client } = ui
  const palette = view.palette
  const width = Math.max(20, view.columns - 4)
  const live = facts.liveness
  const tabs = tabRow(ui, view, act, false)
  const sections = facts.sections.filter(section => section.lines.length > 0 && (view.details || view.opened.includes(section.key)))
  return (
    <Box flexDirection="column" paddingX={1} gap={1} {...(palette.ground === undefined ? {} : { backgroundColor: palette.ground })}>
      {tabs}
      <Box key={factKey('liveness')} flexDirection="row" gap={1}>
        {Client === undefined ? (
          <Text color={toneColor(palette, live.tone)}>{live.state === 'ended' || live.state === 'none' ? '○' : '●'}</Text>
        ) : (
          <Client
            key="live-heartbeat"
            module="../live/client/heartbeat.tsx"
            props={{ look: 'dot', state: live.state, beats: live.beats, lastLineAt: live.lastLineAt, limitMs: live.limitMs, now: view.now, width: 24, color: palette.tones.done ?? null, quietColor: palette.tones.attention ?? null, stopColor: palette.tones.stop ?? null }}
          />
        )}
        {Client === undefined ? <Text dimColor>{live.text}</Text> : null}
        <Box flexGrow={1} />
        {paneButtons(ui, view, act, { details: view.details ? 'details ▾' : 'details ▸', style: 'style' })}
      </Box>
      <Box key={factKey('focus')} flexDirection="column">
        <Text dimColor>{facts.focus.eyebrow}</Text>
        <Text bold color={toneColor(palette, facts.focus.tone)}>
          {facts.focus.line}
        </Text>
        {facts.focus.sub === '' ? null : <Text dimColor>{facts.focus.sub}</Text>}
        {facts.focus.rail === null ? null : Client === undefined ? (
          <Text color={palette.tones.run}>{railText(facts.focus.rail)}</Text>
        ) : (
          <Client
            key="live-rail"
            module="../live/client/rail.tsx"
            props={{ steps: facts.focus.rail.steps, done: facts.focus.rail.done, at: facts.focus.rail.at, width, doneColor: palette.tones.done ?? null, runColor: palette.tones.run ?? null, waitColor: palette.tones.quiet ?? null }}
          />
        )}
      </Box>
      {facts.groups.map(group => groupView(ui, facts, group, view))}
      {facts.needs.length === 0 ? null : (
        <Box flexDirection="column">
          <Text bold color={palette.tones.attention}>{`Needs you · ${facts.needs.length}`}</Text>
          {facts.needs.map(need => (
            <Box key={factKey(`need:${need.id}`)} flexDirection="column" borderStyle="round" borderColor={toneColor(palette, need.tone)} paddingX={1}>
              <Text bold color={toneColor(palette, need.tone)}>
                {need.title}
              </Text>
              <Text wrap="wrap">{need.body}</Text>
              <Box flexDirection="row" gap={1}>
                {needActions(ui, need, act, { upper: false, arrow: false, primaryFirst: true })}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      <Box flexDirection="column">
        {facts.meters.map(meter => (
          <Box key={factKey(`meter:${meter.key}`)} flexDirection="row" gap={1}>
            <Box width={10} flexShrink={0}>
              <Text dimColor wrap="truncate-end">
                {meter.label}
              </Text>
            </Box>
            <Text color={toneColor(palette, meter.tone)}>{barOf(meter.value === null ? null : (meter.value / meter.max) * 100, Math.min(24, Math.max(8, width - 34)), meter.marks.map(mark => (mark / meter.max) * 100))}</Text>
            <Text dimColor>{meter.text}</Text>
          </Box>
        ))}
      </Box>
      {sections.map(section => sectionView(ui, section, view))}
      {facts.controls.length === 0 ? null : (
        <Box flexDirection="row" gap={1}>
          {facts.controls.map(control => (
            <Box key={factKey(`control:${control.key}`)}>
              <Button key={`live:control:${control.key}`} label={control.armed ? control.armedLabel : control.label} {...(control.isPrimary && !control.armed ? { variant: 'primary' as const } : { dimColor: true })} onPress={() => act.control(control.key)} />
            </Box>
          ))}
        </Box>
      )}
      {view.details ? null : (
        <Text dimColor wrap="truncate-end">
          {facts.summary}
        </Text>
      )}
    </Box>
  )
}
