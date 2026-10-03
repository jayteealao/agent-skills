/**
 * Style E · Brutalist grid (WF-LIVE-VIEWS-PLAN.md 8.3): a light hairline grid,
 * heavy capital headlines, slash-numbered sections, purple for running, lime
 * for "needs you", red for a cut or a stop, black buttons with ↗.
 *
 * Layout: a top bar (mark, breadcrumb, system box, primary button); a hero
 * (`/01`, the headline, the second line, the purple tag line, the last log
 * line) beside the block matrix and the lime coordinate box; `/02` needs you,
 * `/03` system status, `/04` log (details on; with details off, "Needs you"
 * takes its place, V9); a footer bar with the primary action.
 *
 * On a dark terminal theme the palette is the ink one (Y7); the terminal has
 * no font control, so the headline is one bold line in capitals (S1).
 */
import type { RenderElement } from 'claude-code'

import { stripedBarOf } from '../live/glyphs.ts'
import type { ViewFacts } from './facts.ts'
import { factKey, markGlyph, needActions, paneButtons, tabRow, toneColor } from './kit.tsx'
import type { LiveActions, PaneView, StyleUi } from './kit.tsx'
import { GRID_INK, GRID_LIME, GRID_PURPLE } from './tokens.ts'

function sectionTitle(ui: StyleUi, view: PaneView, number: string, title: string): RenderElement {
  const { Box, Text } = ui
  return (
    <Box flexDirection="row" gap={1}>
      <Text color={view.palette.tones.run}>{number}</Text>
      <Text bold>{title.toUpperCase()}</Text>
    </Box>
  )
}

export function gridPane(ui: StyleUi, facts: ViewFacts, view: PaneView, act: LiveActions): RenderElement {
  const { Box, Text, Button, Client } = ui
  const palette = view.palette
  const live = facts.liveness
  const primary = facts.controls.find(control => control.isPrimary) ?? null
  const others = facts.controls.filter(control => control !== primary)
  const needsTag = facts.needs.length > 0
  const sections = facts.sections.filter(section => section.lines.length > 0 && (view.details || view.opened.includes(section.key)))

  const controlButton = (control: (typeof facts.controls)[number], isPrimary: boolean) => (
    <Box key={factKey(`control:${control.key}`)}>
      <Button key={`live:control:${control.key}`} label={`${(control.armed ? control.armedLabel : control.label).toUpperCase()} ↗`} {...(isPrimary && !control.armed ? { variant: 'primary' as const } : { dimColor: true })} onPress={() => act.control(control.key)} />
    </Box>
  )

  const needsSection = (
    <Box flexDirection="column">
      {sectionTitle(ui, view, '/02', 'needs you')}
      {facts.needs.length === 0 ? <Text color={palette.tones.quiet}>NOTHING WAITS ON YOU</Text> : null}
      {facts.needs.map(need => (
        <Box key={factKey(`need:${need.id}`)} flexDirection="column" borderStyle="single" borderColor={palette.line} paddingX={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={GRID_INK} backgroundColor={need.tone === 'stop' ? palette.tones.stop : GRID_LIME} bold>
              {` ${need.kind.toUpperCase()} `}
            </Text>
            <Text bold>{need.title.toUpperCase()}</Text>
          </Box>
          <Text wrap="wrap">{need.body}</Text>
          <Box flexDirection="row" gap={1}>
            {needActions(ui, need, act, { upper: true, arrow: true, primaryFirst: true })}
          </Box>
        </Box>
      ))}
    </Box>
  )

  return (
    <Box flexDirection="column" paddingX={1} gap={1} {...(palette.ground === undefined ? {} : { backgroundColor: palette.ground })}>
      {tabRow(ui, view, act, true)}
      <Box flexDirection="row" gap={1}>
        <Text bold>SDLC/LIVE</Text>
        <Text color={palette.tones.quiet} wrap="truncate-end">
          {`/ ${facts.title.toUpperCase()}`}
        </Text>
        <Box flexGrow={1} />
        {primary === null ? null : controlButton(primary, true)}
        {paneButtons(ui, view, act, { details: view.details ? 'LOG ▾' : 'LOG ▸', style: 'STYLE ↗' })}
      </Box>
      <Box key={factKey('liveness')} flexDirection="row">
        {Client === undefined ? (
          <Text color={GRID_INK} backgroundColor={live.state === 'live' ? GRID_LIME : live.state === 'stale' ? palette.tones.stop : palette.tones.quiet} bold>
            {` ${live.text.toUpperCase()} `}
          </Text>
        ) : (
          <Client
            key="live-heartbeat"
            module="../live/client/heartbeat.tsx"
            props={{ look: 'bar', state: live.state, beats: live.beats, lastLineAt: live.lastLineAt, limitMs: live.limitMs, now: view.now, width: Math.max(30, Math.min(60, view.columns - 4)), color: palette.isDark ? GRID_LIME : GRID_PURPLE, quietColor: palette.tones.quiet ?? null, stopColor: palette.tones.stop ?? null }}
          />
        )}
      </Box>
      <Box flexDirection="row" gap={2} flexWrap="wrap">
        <Box key={factKey('focus')} flexDirection="column" flexGrow={1}>
          <Text color={palette.tones.run}>/01</Text>
          <Text bold color={toneColor(palette, facts.focus.tone === 'run' ? 'plain' : facts.focus.tone)}>
            {facts.focus.word}
          </Text>
          <Text bold wrap="truncate-end">
            {facts.focus.line.toUpperCase()}
          </Text>
          {facts.focus.sub === '' ? null : <Text color={GRID_PURPLE}>{facts.focus.sub}</Text>}
          {facts.clock === null ? null : <Text bold>{`${facts.clock.value} ${facts.clock.unit} · ${facts.clock.sub.toUpperCase()}`}</Text>}
          <Text dimColor wrap="truncate-end">
            {live.text}
          </Text>
          {others.length === 0 ? null : (
            <Box flexDirection="row" gap={1}>
              {others.map(control => controlButton(control, false))}
            </Box>
          )}
        </Box>
        <Box flexDirection="column">
          {facts.groups.map(group => (
            <Box key={factKey(`group:${group.key}`)} flexDirection="column">
              <Text color={palette.tones.quiet}>{group.title.toUpperCase()}</Text>
              {group.lights.length === 0 ? null : <Text>{group.lights.map(light => (light.on ? '■' : '□')).join('')}</Text>}
              {group.tracks.map(track => (
                <Box flexDirection="row" gap={1}>
                  {track.marks.length === 0 ? null : (
                    <Text color={track.tone === 'attention' ? GRID_INK : toneColor(palette, track.tone)} {...(track.tone === 'attention' ? { backgroundColor: GRID_LIME } : {})}>
                      {track.marks.map(mark => markGlyph('grid', mark)).join('')}
                    </Text>
                  )}
                  <Text wrap="truncate-end">{track.label.toUpperCase()}</Text>
                  {track.note === '' ? null : <Text color={track.tone === 'stop' ? palette.tones.stop : palette.tones.quiet}>{track.note.toUpperCase()}</Text>}
                </Box>
              ))}
            </Box>
          ))}
          <Text color={GRID_INK} backgroundColor={needsTag ? GRID_LIME : palette.line}>
            {` ${facts.focus.eyebrow.toUpperCase()} `}
          </Text>
        </Box>
      </Box>
      {view.details ? needsSection : null}
      <Box flexDirection="column">
        {sectionTitle(ui, view, '/03', 'system status')}
        {facts.meters.map(meter => (
          <Box key={factKey(`meter:${meter.key}`)} flexDirection="row" gap={1}>
            <Box width={12} flexShrink={0}>
              <Text wrap="truncate-end">{meter.label.toUpperCase()}</Text>
            </Box>
            <Text color={meter.tone === 'stop' ? palette.tones.stop : meter.tone === 'attention' ? (palette.isDark ? GRID_LIME : palette.tones.attention) : GRID_PURPLE}>{stripedBarOf(meter.value === null ? null : (meter.value / meter.max) * 100, 20, meter.marks.map(mark => (mark / meter.max) * 100))}</Text>
            <Text>{meter.text.toUpperCase()}</Text>
          </Box>
        ))}
      </Box>
      {view.details ? (
        <Box flexDirection="column">
          {sectionTitle(ui, view, '/04', 'log')}
          {sections.map(section => (
            <Box key={factKey(`section:${section.key}`)} flexDirection="column">
              <Text color={palette.tones.quiet}>{section.title.toUpperCase()}</Text>
              {section.lines.map(line => (
                <Text color={toneColor(palette, line.tone)} wrap="truncate-end">
                  {`— ${line.text}`}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
      ) : (
        <Box flexDirection="column">
          {needsSection}
          {sections.map(section => (
            <Box key={factKey(`section:${section.key}`)} flexDirection="column">
              <Text color={palette.tones.quiet}>{section.title.toUpperCase()}</Text>
              {section.lines.map(line => (
                <Text color={toneColor(palette, line.tone)} wrap="truncate-end">
                  {`— ${line.text}`}
                </Text>
              ))}
            </Box>
          ))}
        </Box>
      )}
      <Box flexDirection="row" gap={1}>
        <Text color="#ffffff" backgroundColor={GRID_PURPLE} bold wrap="truncate-end">
          {` ${facts.summary.toUpperCase()} `}
        </Text>
      </Box>
    </Box>
  )
}
