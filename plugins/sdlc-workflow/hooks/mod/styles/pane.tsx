/**
 * The live pane (MOD-DESIGN 7, 2026-10-04): one compact layout, three skins.
 *
 * Narrow (docked beside the transcript):
 * - row 1: the heartbeat, the driver's label, the workflow, the age (the part
 *   that shrinks), the other runs as tabs, then `details` and `style`;
 * - row 2: what runs now, then the stage cells; the one slice group's cells
 *   and count join it at its right end;
 * - one row per further group, one row per need with its actions;
 * - the meters two to a row, the bars stretching to fill it, with the
 *   controls pinned right on the last one.
 * Wide: a row under row 2 names every stage (the running one lit), and each
 * group row names its tracks. Details on: one row per section entry.
 *
 * Every fact keeps its key (`fact:…`), so the three styles carry the same facts (T5).
 */
import type { RenderElement } from 'claude-code'

import { barOf } from '../live/glyphs.ts'
import type { Meter, TrackGroup, ViewFacts } from './facts.ts'
import { factKey, LIVE_KEYS, markTone, needActions, paneButtons } from './kit.tsx'
import type { LiveActions, PaneView, StyleUi } from './kit.tsx'
import { cellsView, chipView, controlLabel, say } from './skin.tsx'
import type { Palette, ViewStyle } from './tokens.ts'

/** From this width the pane is wide: it names the stages and the tracks. */
export const PANE_WIDE_COLUMNS = 100

/** A group's tracks as cells: done, running (the first running one), waiting. */
function groupCells(ui: StyleUi, style: ViewStyle, palette: Palette, group: TrackGroup): RenderElement[] {
  const done = group.tracks.filter(track => track.marks.length > 0 && track.marks.every(mark => mark === 'done')).length
  const running = group.tracks.findIndex(track => track.marks.includes('run') || track.marks.includes('stop'))
  return cellsView(ui, style, palette, done, running === -1 ? -1 : done, group.tracks.length)
}

/** A group's count: `2/5`. */
function groupCount(group: TrackGroup): string {
  const done = group.tracks.filter(track => track.marks.length > 0 && track.marks.every(mark => mark === 'done')).length
  return `${done}/${group.tracks.length}`
}

/** One group: its title, its cells and count, and (wide) its tracks by name. */
function groupView(ui: StyleUi, style: ViewStyle, palette: Palette, group: TrackGroup, isWide: boolean, isInline: boolean): RenderElement {
  const { Box, Text } = ui
  return (
    <Box key={factKey(`group:${group.key}`)} flexDirection="row" gap={1} flexShrink={isInline ? 0 : 1}>
      {isInline ? null : <Text dimColor>{say(style, group.title)}</Text>}
      {group.lights.map(light => (
        <Text color={light.on ? palette.tones.done : palette.tones.quiet}>{say(style, `${light.on ? '●' : '○'} ${light.label}`)}</Text>
      ))}
      <Box flexDirection="row" flexShrink={0}>
        {groupCells(ui, style, palette, group)}
      </Box>
      <Text dimColor>{groupCount(group)}</Text>
      {isWide && !isInline
        ? group.tracks.map(track => (
            <Text color={palette.tones[markTone(track.marks.includes('run') ? 'run' : track.marks.includes('stop') ? 'stop' : track.marks.every(mark => mark === 'done') ? 'done' : 'wait')]} bold={track.marks.includes('run')}>
              {say(style, track.label)}
            </Text>
          ))
        : null}
    </Box>
  )
}

/** One meter: its label, a bar that stretches, and its figure. */
function meterView(ui: StyleUi, style: ViewStyle, palette: Palette, meter: Meter, barWidth: number, isWide: boolean): RenderElement {
  const { Box, Text } = ui
  const percent = meter.value === null ? null : (meter.value / meter.max) * 100
  const figure = isWide ? meter.text : (meter.text.split(' · ')[0] ?? meter.text)
  return (
    <Box key={factKey(`meter:${meter.key}`)} flexDirection="row" gap={1} flexGrow={1} flexShrink={1}>
      <Text dimColor>{say(style, meter.label)}</Text>
      <Text color={palette.tones[meter.tone]}>{barOf(percent, barWidth, meter.marks.map(mark => (mark / meter.max) * 100), style === 'instrument' ? { fill: '▮', empty: '▯', mark: '│' } : { fill: '█', empty: '░', mark: '│' })}</Text>
      <Text dimColor>{say(style, figure)}</Text>
    </Box>
  )
}

export function livePane(ui: StyleUi, facts: ViewFacts, view: PaneView, act: LiveActions): RenderElement {
  const { Box, Text, Button, Client } = ui
  const style = view.style
  const palette = view.palette
  const isWide = view.columns >= PANE_WIDE_COLUMNS
  const live = facts.liveness
  const rail = facts.focus.rail
  const inlineGroup = facts.groups.length === 1 ? facts.groups[0] : undefined
  const restGroups = inlineGroup === undefined ? facts.groups : []
  const sections = facts.sections.filter(section => section.lines.length > 0 && (view.details || view.opened.includes(section.key)))
  const others = view.tabs.filter(tab => !tab.isCurrent)
  const [kind = facts.kind, slug = facts.slug] = facts.title.split(' · ')
  // Two meters to a row; the bars share what the row leaves.
  const meterRows: Meter[][] = []
  for (let i = 0; i < facts.meters.length; i += 2) meterRows.push(facts.meters.slice(i, i + 2))
  const barWidth = Math.max(6, Math.min(40, Math.floor((view.columns - (facts.controls.length > 0 ? 44 : 24)) / 2) - 12))
  const controls = facts.controls.map(control => (
    <Box key={factKey(`control:${control.key}`)} flexShrink={0}>
      <Button key={LIVE_KEYS.control(control.key)} label={controlLabel(style, control.armed ? control.armedLabel : control.label)} {...(control.isPrimary && !control.armed ? { variant: 'primary' as const } : { dimColor: true })} onPress={() => act.control(control.key)} />
    </Box>
  ))
  const liveText = say(style, live.text)
  return (
    <Box flexDirection="column" paddingX={1} {...(palette.ground === undefined ? {} : { backgroundColor: palette.ground })}>
      <Box flexDirection="row" gap={1}>
        <Box key={factKey('liveness')} flexDirection="row" gap={1} flexShrink={1} flexGrow={1}>
          {Client === undefined ? (
            <Text color={palette.tones[live.tone]}>{live.state === 'ended' || live.state === 'none' ? '○' : '●'}</Text>
          ) : (
            <Client
              key="live-heartbeat"
              module="../live/client/heartbeat.tsx"
              props={{ look: 'dot', state: live.state, beats: live.beats, lastLineAt: live.lastLineAt, limitMs: live.limitMs, now: view.now, width: 24, color: palette.tones.done ?? null, quietColor: palette.tones.attention ?? null, stopColor: palette.tones.stop ?? null, textColor: palette.tones.quiet ?? null }}
            />
          )}
          {chipView(ui, style, palette, 'run', kind)}
          <Text bold>{say(style, slug)}</Text>
          {Client === undefined ? (
            <Box flexShrink={1}>
              <Text dimColor wrap="truncate-end">
                {liveText}
              </Text>
            </Box>
          ) : null}
        </Box>
        {others.length === 0 ? null : <Text dimColor>{say(style, 'also')}</Text>}
        {others.map(tab => (
          <Button key={LIVE_KEYS.tab(tab.kind, tab.slug)} label={controlLabel(style, tab.slug)} dimColor onPress={() => act.tab(tab.kind, tab.slug)} />
        ))}
        {paneButtons(ui, view, act, { details: controlLabel(style, view.details ? 'details ▾' : 'details ▸'), style: controlLabel(style, 'style') })}
      </Box>
      <Box flexDirection="row" gap={1}>
        <Box key={factKey('focus')} flexDirection="row" gap={1} flexGrow={1} flexShrink={1}>
          <Text bold color={palette.tones[facts.focus.tone]} wrap="truncate-end">
            {say(style, facts.focus.line)}
          </Text>
          {facts.focus.sub === '' ? null : (
            <Box flexShrink={1}>
              <Text dimColor wrap="truncate-end">
                {say(style, facts.focus.sub)}
              </Text>
            </Box>
          )}
        </Box>
        {rail === null ? null : (
          <Box flexDirection="row" flexShrink={0}>
            {cellsView(ui, style, palette, rail.done, rail.at, rail.steps.length)}
          </Box>
        )}
        {inlineGroup === undefined ? null : groupView(ui, style, palette, inlineGroup, isWide, true)}
      </Box>
      {isWide && rail !== null ? (
        <Box flexDirection="row" gap={1}>
          {rail.steps.map((step, index) => (
            <Text bold={index === rail.at} color={index === rail.at ? palette.tones.run : index < rail.done ? undefined : palette.tones.quiet}>
              {say(style, step)}
            </Text>
          ))}
          {inlineGroup === undefined ? null : <Box flexGrow={1} />}
          {inlineGroup === undefined
            ? null
            : inlineGroup.tracks.map(track => (
                <Text bold={track.marks.includes('run')} color={track.marks.includes('run') ? palette.tones.run : track.marks.length > 0 && track.marks.every(mark => mark === 'done') ? undefined : palette.tones.quiet}>
                  {say(style, `${track.label}${track.marks.length > 0 && track.marks.every(mark => mark === 'done') ? ' ✓' : ''}`)}
                </Text>
              ))}
        </Box>
      ) : null}
      {restGroups.map(group => groupView(ui, style, palette, group, isWide, false))}
      {facts.needs.map(need => (
        <Box key={factKey(`need:${need.id}`)} flexDirection="column" borderStyle={style === 'grid' ? 'bold' : style === 'instrument' ? 'single' : 'round'} borderColor={palette.tones[need.tone] ?? palette.line}>
          <Box flexDirection="row" gap={1}>
            <Text bold color={palette.tones[need.tone]}>
              {say(style, `${style === 'dashboard' ? '◆ ' : ''}${need.title}`)}
            </Text>
            <Box flexGrow={1} flexShrink={1}>
              <Text dimColor wrap="truncate-end">
                {view.details ? '' : say(style, need.body)}
              </Text>
            </Box>
            {needActions(ui, need, act, { upper: style !== 'dashboard', arrow: style === 'grid', primaryFirst: true })}
          </Box>
          {view.details ? <Text wrap="wrap">{say(style, need.body)}</Text> : null}
        </Box>
      ))}
      {meterRows.map((row, index) => (
        <Box flexDirection="row" gap={2}>
          {row.map(meter => meterView(ui, style, palette, meter, barWidth, isWide))}
          {index === meterRows.length - 1 ? controls : null}
        </Box>
      ))}
      {meterRows.length === 0 && controls.length > 0 ? (
        <Box flexDirection="row" gap={1}>
          {controls}
        </Box>
      ) : null}
      {sections.map(section => (
        <Box key={factKey(`section:${section.key}`)} flexDirection="row" gap={1}>
          <Text dimColor>{say(style, section.title.toLowerCase())}</Text>
          <Box flexShrink={1}>
            <Text wrap="truncate-end">{say(style, section.lines.map(line => line.text).join(' · '))}</Text>
          </Box>
        </Box>
      ))}
      {isWide && !view.details && facts.summary !== '' ? (
        <Text dimColor wrap="truncate-end">
          {say(style, facts.summary)}
        </Text>
      ) : null}
    </Box>
  )
}
