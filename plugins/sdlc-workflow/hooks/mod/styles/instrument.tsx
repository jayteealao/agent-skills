/**
 * Style D · Dot-matrix instrument (WF-LIVE-VIEWS-PLAN.md 8.2): dark numbered
 * cards, dot-matrix numerals, dotted charts, one orange accent for attention.
 *
 * D has no hidden parts: its cards are its details (V9). Details off draws
 * the core cards (status, needs, the track card, time, usage, control);
 * details on adds one card per section (commits, agents, and the rest).
 *
 * S1: on the terminal the glyphs are braille dots (a `Client` that shimmers
 * on change); on the desktop the stage word is an SVG of circles and the
 * usage is an SVG tick ring.
 */
import type { RenderElement } from 'claude-code'

import { barOf, dotTextOf, dotWordSvg, tickRingSvg } from '../live/glyphs.ts'
import type { ViewFacts } from './facts.ts'
import { factKey, markGlyph, needActions, paneButtons, tabRow } from './kit.tsx'
import type { LiveActions, PaneView, StyleUi } from './kit.tsx'
import { INSTRUMENT_ORANGE } from './tokens.ts'

type Card = { key: string; title: string; body: RenderElement[]; wide: boolean; isAlert: boolean }

/** A dot-matrix word: braille on the terminal (shimmering in a Client), circles in an SVG on the desktop. */
function dotWord(ui: StyleUi, view: PaneView, key: string, text: string, color: string | undefined): RenderElement {
  const { Box, Text, Svg, Client } = ui
  const word = text.slice(0, 12)
  if (view.surface !== 'terminal' && Svg !== undefined) {
    return <Svg source={dotWordSvg({ text: word, dot: 6, lit: color ?? '#ececec', dim: '#1f1f1f', label: text, animate: true })} alt={text} isInteractive />
  }
  if (Client !== undefined && key === 'status') return <Client key="live-dots-status" module="../live/client/dots.tsx" props={{ text: word, color: color ?? null }} />
  if (Client !== undefined && key === 'clock') return <Client key="live-dots-clock" module="../live/client/dots.tsx" props={{ text: word, color: color ?? null }} />
  return (
    <Box flexDirection="column">
      {dotTextOf(word).map(line => (
        <Text color={color}>{line}</Text>
      ))}
    </Box>
  )
}

function cardView(ui: StyleUi, view: PaneView, card: Card, index: number): RenderElement {
  const { Box, Text } = ui
  const palette = view.palette
  const isNarrow = view.surface === 'terminal' && view.columns < 90
  return (
    <Box
      key={factKey(card.key)}
      flexDirection="column"
      borderStyle="round"
      borderColor={card.isAlert ? INSTRUMENT_ORANGE : palette.line}
      paddingX={1}
      width={isNarrow ? '100%' : card.wide ? '66%' : '33%'}
      {...(palette.card === undefined ? {} : { backgroundColor: palette.card })}
    >
      <Text color={card.isAlert ? INSTRUMENT_ORANGE : palette.tones.quiet}>{`${String(index + 1).padStart(2, '0')} ${card.title.toUpperCase()}`}</Text>
      {card.body}
    </Box>
  )
}

export function instrumentPane(ui: StyleUi, facts: ViewFacts, view: PaneView, act: LiveActions): RenderElement {
  const { Box, Text, Button, Svg, Client } = ui
  const palette = view.palette
  const live = facts.liveness
  const cards: Card[] = []

  cards.push({
    key: 'focus',
    title: facts.kind === 'yolo' ? 'run status' : facts.kind === 'campaign' ? 'campaign status' : 'session',
    wide: true,
    isAlert: facts.focus.tone === 'stop',
    body: [
      <Text color={palette.tones.quiet}>{facts.focus.eyebrow.toUpperCase()}</Text>,
      dotWord(ui, view, 'status', facts.focus.word, facts.focus.tone === 'stop' ? INSTRUMENT_ORANGE : palette.text),
      <Text wrap="truncate-end">{facts.focus.line.toUpperCase()}</Text>,
      ...(facts.focus.sub === '' ? [] : [<Text dimColor wrap="truncate-end">{facts.focus.sub.toUpperCase()}</Text>]),
      <Box key={factKey('liveness')} flexDirection="column">
        {Client === undefined ? null : (
          <Client
            key="live-heartbeat"
            module="../live/client/heartbeat.tsx"
            props={{ look: 'wave', state: live.state, beats: live.beats, lastLineAt: live.lastLineAt, limitMs: live.limitMs, now: view.now, width: Math.max(12, Math.min(40, view.columns - 10)), color: palette.text ?? null, quietColor: palette.tones.quiet ?? null, stopColor: INSTRUMENT_ORANGE }}
          />
        )}
        <Text color={live.tone === 'stop' ? INSTRUMENT_ORANGE : palette.tones.quiet}>{live.text.toUpperCase()}</Text>
      </Box>,
    ],
  })

  cards.push({
    key: 'needs',
    title: 'needs you',
    wide: false,
    isAlert: facts.needs.length > 0,
    body:
      facts.needs.length === 0
        ? [<Text color={palette.tones.quiet}>NOTHING</Text>]
        : facts.needs.map(need => (
            <Box key={factKey(`need:${need.id}`)} flexDirection="column">
              <Text bold color={INSTRUMENT_ORANGE}>
                {need.title.toUpperCase()}
              </Text>
              <Text wrap="wrap">{need.body}</Text>
              <Box flexDirection="row" gap={1}>
                {needActions(ui, need, act, { upper: true, arrow: false, primaryFirst: true })}
              </Box>
            </Box>
          )),
  })

  for (const group of facts.groups) {
    cards.push({
      key: `group:${group.key}`,
      title: group.title,
      wide: facts.kind !== 'yolo',
      isAlert: false,
      body: [
        ...(group.lights.length === 0 ? [] : [<Text>{group.lights.map(light => (light.on ? '●' : '○')).join(' ')}</Text>, <Text color={palette.tones.quiet}>{group.lights.map(light => light.label.slice(0, 3).toUpperCase()).join(' ')}</Text>]),
        ...group.tracks.map(track => (
          <Box flexDirection="row" gap={1}>
            {track.marks.length === 0 ? null : (
              <Text>
                {track.marks.map(mark => markGlyph('instrument', mark)).join('')}
              </Text>
            )}
            <Text wrap="truncate-end" color={track.tone === 'attention' || track.tone === 'stop' ? INSTRUMENT_ORANGE : palette.text}>
              {track.label.toUpperCase()}
            </Text>
            {track.note === '' ? null : <Text color={track.note === 'needs prepare' ? INSTRUMENT_ORANGE : palette.tones.quiet}>{track.note.toUpperCase()}</Text>}
          </Box>
        )),
      ],
    })
  }

  if (facts.clock !== null) {
    cards.push({
      key: 'clock',
      title: facts.clock.label,
      wide: false,
      isAlert: false,
      body: [dotWord(ui, view, 'clock', facts.clock.value, palette.text), <Text color={palette.tones.quiet}>{`${facts.clock.unit} · ${facts.clock.sub.toUpperCase()}`}</Text>],
    })
  }

  if (facts.meters.length > 0) {
    cards.push({
      key: 'meters',
      title: facts.kind === 'brainstorm' ? 'packets' : 'usage',
      wide: facts.kind === 'brainstorm',
      isAlert: facts.meters.some(meter => meter.tone === 'stop'),
      body: facts.meters.map(meter => {
        const percent = meter.value === null ? null : (meter.value / meter.max) * 100
        const marks = meter.marks.map(mark => (mark / meter.max) * 100)
        const ring =
          view.surface !== 'terminal' && Svg !== undefined && facts.kind !== 'brainstorm' ? (
            <Svg source={tickRingSvg({ percent, marks, size: 72, lit: palette.text ?? '#ececec', dim: '#2a2a2a', accent: INSTRUMENT_ORANGE, label: `${meter.label} ${meter.text}`, animate: false })} alt={`${meter.label} ${meter.text}`} />
          ) : (
            <Text color={meter.tone === 'stop' || meter.tone === 'attention' ? INSTRUMENT_ORANGE : palette.text}>{barOf(percent, 20, marks, { fill: '▮', empty: '▯', mark: '┃' })}</Text>
          )
        return (
          <Box key={factKey(`meter:${meter.key}`)} flexDirection="column">
            <Text color={palette.tones.quiet}>{meter.label.toUpperCase()}</Text>
            {ring}
            <Text>{meter.text.toUpperCase()}</Text>
          </Box>
        )
      }),
    })
  }

  // Details on: one card per section (V9: the card set grows).
  for (const section of facts.sections) {
    if (section.lines.length === 0) continue
    if (!view.details && !view.opened.includes(section.key)) continue
    cards.push({
      key: `section:${section.key}`,
      title: section.title,
      wide: false,
      isAlert: section.lines.some(line => line.tone === 'attention' || line.tone === 'stop'),
      body: section.lines.map(line => (
        <Text wrap="truncate-end" color={line.tone === 'attention' || line.tone === 'stop' ? INSTRUMENT_ORANGE : line.tone === 'quiet' ? palette.tones.quiet : palette.text}>
          {line.text}
        </Text>
      )),
    })
  }

  cards.push({
    key: 'control',
    title: 'control',
    wide: false,
    isAlert: false,
    body: [
      <Box flexDirection="row" gap={1} flexWrap="wrap">
        {facts.controls.map(control => (
          <Box key={factKey(`control:${control.key}`)}>
            <Button key={`live:control:${control.key}`} label={(control.armed ? control.armedLabel : control.label).toUpperCase()} {...(control.isPrimary && !control.armed ? { variant: 'primary' as const } : { dimColor: true })} onPress={() => act.control(control.key)} />
          </Box>
        ))}
        {paneButtons(ui, view, act, { details: view.details ? 'FEWER CARDS' : 'MORE CARDS', style: 'STYLE' })}
      </Box>,
    ],
  })

  const tabs = tabRow(ui, view, act, true)
  return (
    <Box flexDirection="column" paddingX={1} {...(palette.ground === undefined ? {} : { backgroundColor: palette.ground })}>
      {tabs}
      <Box flexDirection="row" flexWrap="wrap">
        {cards.map((card, index) => cardView(ui, view, card, index))}
      </Box>
    </Box>
  )
}
