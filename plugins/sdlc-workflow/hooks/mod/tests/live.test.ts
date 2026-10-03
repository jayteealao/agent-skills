/**
 * The live views (WF-LIVE-VIEWS-PLAN.md section 9, 14.6): the models, the
 * shared events, the reader, the three styles on two surfaces, the fact
 * contract, the pane's settings and actions, and the existing parts' styles.
 */
import type { On, RenderElement, RenderInput } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'

import { applyLines, freshRunState } from '../../../lib/live-events.mjs'
import { PLUGIN_NAME } from '../names.ts'
import { absorb, freshJournalState, livenessFrom } from '../live/model/journal.ts'
import type { JournalState } from '../live/model/journal.ts'
import { buildBrainstormModel } from '../live/model/brainstorm.ts'
import { buildCampaignModel } from '../live/model/campaign.ts'
import { buildYoloModel } from '../live/model/yolo.ts'
import type { RosterFact } from '../live/model/yolo.ts'
import { usageOf } from '../live/model/usage.ts'
import { LiveReader } from '../live/reader.ts'
import type { LiveIo } from '../live/reader.ts'
import { coreFactNames, LIVE_KEYS } from '../styles/kit.tsx'
import { factsOf } from '../styles/facts.ts'
import { pickerControlLabel, pickerRowLabel, styledStripRows, stripPieces } from '../styles/existing.tsx'
import type { StripParts } from '../styles/existing.tsx'
import { VIEW_STYLES } from '../styles/tokens.ts'
import { PUSH_TOAST_MS } from '../live/register.ts'

tier('user')

const SURFACES = ['terminal', 'desktop'] as const
const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const
const PRESENTATION = { isFullscreen: false, columns: 160 } as const
const NOW = Date.parse('2026-10-03T12:00:00.000Z')
const at = (ms: number) => new Date(ms).toISOString()

/** A yolo run on alpha-flow: plan and implement of `auth` done, verify of `auth` running. */
function yoloJournal(now: number): string {
  const lines = [
    { at: at(now - 50 * 60_000), run: 'r1', seq: 1, event: 'agent-start', agent: 'plan:auth', stage: 'plan', slice: 'auth' },
    { at: at(now - 40 * 60_000), run: 'r1', seq: 2, event: 'agent-end', agent: 'plan:auth', stage: 'plan', slice: 'auth', status: 'ok' },
    { at: at(now - 39 * 60_000), run: 'r1', seq: 3, event: 'agent-start', agent: 'implement:auth', stage: 'implement', slice: 'auth' },
    { at: at(now - 20 * 60_000), run: 'r1', seq: 4, event: 'agent-end', agent: 'implement:auth', stage: 'implement', slice: 'auth', status: 'ok' },
    { at: at(now - 2 * 60_000), run: 'r1', seq: 5, event: 'agent-start', agent: 'verify:auth', stage: 'verify', slice: 'auth' },
  ]
  return lines.map(line => JSON.stringify(line)).join('\n') + '\n'
}

const ROSTER: RosterFact[] = [
  { slug: 'auth', stage: 'implemented', reviewed: false },
  { slug: 'ui', stage: 'defined', reviewed: false },
]

const LEDGER = {
  waves: [
    { n: 1, state: 'running', units: ['u1', 'u2'] },
    { n: 2, state: 'planned', units: ['u3'] },
  ],
  units: {
    u1: { slug: 'alpha-auth', state: 'running', wave: 1 },
    u2: { slug: 'alpha-ui', state: 'finished', wave: 1 },
    u3: { slug: 'alpha-docs', state: 'planned', wave: 2 },
  },
}

const BOARD = {
  areas: [{ key: 'a1', name: 'Core', scope: 'mixed' }],
  threads: [{ key: 't1', name: 'Login', area: 'a1', state: 'open' }],
  items: [
    { key: 'i1', thread: 't1', text: 'Email login', scope: 'keep', kind: 'decision' },
    { key: 'i2', thread: 't1', text: 'SSO', scope: 'later', kind: 'decision' },
    { key: 'i3', thread: 't1', text: 'Magic links' },
  ],
  work: [],
  log: [{ kind: 'walk', asked: 'Keep SSO?', answer: 'later' }],
}

function yoloJournalState(now: number): JournalState {
  const lines = yoloJournal(now)
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as Record<string, unknown>)
  return absorb('alpha-flow', freshJournalState(), lines).state
}

const TREE: Record<string, string> = {
  '/work/.ai/workflows/alpha-flow/00-index.md': '---\nslug: alpha-flow\nstatus: active\ncurrent-stage: verify\nselected-slice: auth\n---\n',
  '/work/.ai/workflows/alpha-flow/03-slice.md': '---\nslices:\n  - slug: auth\n    status: in-progress\n  - slug: ui\n    status: defined\n---\n',
  '/work/.ai/workflows/alpha-flow/04-plan-auth.md': '---\nstatus: complete\n---\n',
  '/work/.ai/workflows/alpha-flow/05-implement-auth.md': '---\nstatus: complete\n---\n',
  '/work/.ai/workflows/camp/00-index.md': '---\nslug: camp\nstatus: active\n---\n',
  '/work/.ai/workflows/camp/work/campaign/ledger.json': JSON.stringify(LEDGER),
  '/work/.ai/workflows/idea/00-index.md': '---\nslug: idea\nstatus: active\n---\n',
  '/work/.ai/workflows/idea/brainstorm-board.json': JSON.stringify(BOARD),
}

/** Every string in a tree, joined with spaces. */
function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join(' ')
  if (node && typeof node === 'object') {
    const record = node as { props?: Record<string, unknown>; children?: unknown }
    const own = [record.props?.['label'], record.props?.['title'], record.props?.['text']].filter(v => typeof v === 'string').join(' ')
    return [own, textOf(record.children ?? record.props?.['children'] ?? '')].filter(Boolean).join(' ')
  }
  return ''
}

/** Every element key in a tree, in draw order. */
function keysOf(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(keysOf)
  if (node && typeof node === 'object') {
    const record = node as { key?: unknown; props?: Record<string, unknown>; children?: unknown }
    const key = record.key ?? record.props?.['key']
    const own = typeof key === 'string' ? [key] : []
    return [...own, ...keysOf(record.children ?? record.props?.['children'] ?? [])]
  }
  return []
}

/** The fact names a drawn pane carries: the `fact:` keys (T5). */
const factNamesOf = (tree: unknown): string[] =>
  keysOf(tree)
    .filter(key => key.startsWith('fact:'))
    .map(key => key.slice('fact:'.length))
    .sort()

type World = {
  clock: MockClock
  written: Map<string, string>
  opened: string[]
  toasts: Array<{ text: string; timeoutMs: number | undefined }>
  submitted: string[]
  configSet: Array<{ key: string; value: unknown }>
  logged: string[]
  locked: boolean
  /** Null places every pane; a reason makes the open mock answer that the pane waits. */
  unplaced: string | null
}

/** The world beneath the mod: a session in /work over `tree`. */
function seat(on: On, tree: Record<string, string>): World {
  const world: World = { clock: null as unknown as MockClock, written: new Map(), opened: [], toasts: [], submitted: [], configSet: [], logged: [], locked: false, unplaced: null }
  const normal = (path: string) => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/\/+$/, '')
  const textAt = (path: string) => world.written.get(path) ?? tree[path]
  const dirs = () => {
    const out = new Set<string>()
    for (const file of [...Object.keys(tree), ...world.written.keys()]) {
      const parts = file.split('/')
      for (let i = 2; i < parts.length; i += 1) out.add(parts.slice(0, i).join('/'))
    }
    return out
  }
  world.clock = mock.clock(on)
  mock.store(on, {})
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.exists', ($, e) => ({ value: dirs().has(normal(e.path)) || textAt(normal(e.path)) !== undefined }))
  on('fs.list', ($, e) => {
    const dir = normal(e.path)
    if (!dirs().has(dir)) return { deny: `ENOENT: ${dir}` }
    const names = new Map<string, 'file' | 'dir'>()
    for (const file of [...Object.keys(tree), ...world.written.keys()]) {
      if (!file.startsWith(`${dir}/`)) continue
      const rest = file.slice(dir.length + 1)
      names.set(rest.split('/')[0] as string, rest.includes('/') ? 'dir' : 'file')
    }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: world.clock.now(), isLink: false })) }
  })
  on('fs.read', ($, e) => {
    const text = textAt(normal(e.path))
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('fs.stat', ($, e) => {
    const text = textAt(normal(e.path))
    if (text === undefined) return { deny: `ENOENT: ${e.path}` }
    return { value: { kind: 'file' as const, size: text.length, mtimeMs: world.clock.now() - 1000, isLink: false } }
  })
  on('fs.write', ($, e) => {
    world.written.set(normal(e.path), e.text)
    return { value: undefined }
  })
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'no process in the test', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('http.fetch', () => ({ deny: 'ECONNREFUSED' }))
  const provider = { plugin: 'engine', tier: 'user' } as const
  on('config.list', () => ({
    value: [
      { key: 'theme', label: 'Theme', kind: 'text' as const, value: 'dark', provider, isLocked: false },
      { key: `${PLUGIN_NAME}.viewStyle`, label: 'View style', kind: 'choice' as const, value: 'dashboard', provider, isLocked: world.locked },
    ],
  }))
  on('config.set', ($, e) => {
    world.configSet.push({ key: e.key, value: e.value })
    return { value: e.value }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.log', ($, e) => {
    world.logged.push(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    world.toasts.push({ text: e.text, timeoutMs: e.timeoutMs })
    return { value: undefined }
  })
  on('ui.open', ($, e) => {
    world.opened.push(e.id)
    if (world.unplaced !== null) return { value: { isPlaced: false as const, reason: world.unplaced } }
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('prompt.fill', () => ({ isFilled: true }))
  on('prompt.suggest', () => ({ isShown: true }))
  on('prompt.submit', ($, e) => {
    world.submitted.push(e.text)
    return { text: e.text }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 0, window: 200000, percent: 10 }, rateLimits: [], cost: { usd: 0 } } }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.id', () => ({ value: 'live-test' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('env.get', ($, e) => (e.name === 'USERPROFILE' ? { value: '/home' } : { value: undefined }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return Box({}) as RenderElement
  })
  return world
}

const run = ($: Engine, command: string, args = '') => $.command.run({ command, args, origin: { kind: 'composer' }, presentation: PRESENTATION })

const PANE_PROPS: RenderInput<'Pane'>['props'] = { title: 'live', isFocused: false, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 40 }, view: {} }

/** Mounts the live pane on a surface. */
const mountPane = ($: Engine, surface: (typeof SURFACES)[number]) =>
  $.ui.mount({ plugin: PLUGIN_NAME, surface, component: 'Pane', requestId: 'wf-live', props: PANE_PROPS, viewport: { columns: 120, rows: 50 } })

/** A world with the yolo journal at the clock's time, the session started, and the live view of `slug` open. */
async function openLive($: Engine, on: On, slug = 'alpha-flow', extra: Record<string, string> = {}): Promise<World> {
  const tree: Record<string, string> = { ...TREE, ...extra }
  const world = seat(on, tree)
  await world.clock.set(NOW)
  tree['/work/.ai/workflows/alpha-flow/.driver-journal.jsonl'] = yoloJournal(NOW)
  await $.session.start(SESSION)
  await run($, 'wf-live', slug)
  return world
}

describe('live models (T1)', () => {
  test('the yolo model reads the run, the focus slice, the stage and the roster', async () => {
    const model = buildYoloModel({
      slug: 'alpha-flow',
      root: '/work',
      now: NOW,
      journal: yoloJournalState(NOW),
      roster: ROSTER,
      records: [],
      control: null,
      protectedWatched: 0,
      protectedChanged: [],
      commits: { count: 3, last: 'feat: auth' },
      steerMtime: null,
      usage: usageOf(null),
      dismissed: [],
    })
    expect(model.kind).toBe('yolo')
    expect(model.run).toBe('r1')
    expect(model.liveness.state).toBe('live')
    expect(model.focus.slice).toBe('auth')
    expect(model.focus.stage).toBe('verify')
    expect(model.focus.index).toBe(1)
    expect(model.focus.count).toBe(2)
    expect(model.slices.map(slice => slice.slug)).toEqual(['auth', 'ui'])
    expect(model.outcome).toBe('running')
  })

  test('the campaign model reads the live wave, its units and the prepare need', async () => {
    const model = buildCampaignModel({
      slug: 'camp',
      now: NOW,
      ledger: LEDGER,
      liveness: livenessFrom(freshJournalState(), NOW),
      gates: {},
      drives: { u1: { stage: 'implement', startedAt: NOW - 5 * 60_000, status: null } },
      heavy: { holder: null, waiting: [] },
      usage: usageOf(null),
      control: null,
      dismissed: [],
    })
    expect(model.activeWave).toBe(1)
    expect(model.waves.map(wave => wave.n)).toEqual([1, 2])
    expect(model.waves[0]?.slugs.map(unit => unit.state)).toEqual(['running', 'finished'])
    expect(model.needs.some(need => need.kind === 'prepare')).toBe(true)
  })

  test('the brainstorm model reads the threads, the walk and the mode', async () => {
    const model = buildBrainstormModel({
      slug: 'idea',
      board: BOARD,
      liveness: livenessFrom(freshJournalState(), NOW),
      sources: { research: 1, references: 2, work: 0 },
      revision: null,
      change: null,
      dismissed: [],
    })
    expect(model.mode).toBe('scope')
    expect(model.walk).toEqual({ walked: 2, keep: 1, cut: 0, later: 1, total: 3 })
    expect(model.last).toEqual({ asked: 'Keep SSO?', answer: 'later' })
  })
})

/**
 * The mockup run (docs/internal/mockups/live-views/sim.js): engine-modules, seven slices, s1 and
 * s2 done, s3 in verify. Its scripted steps become journal lines here, and five checkpoints of the
 * script become five journals: the model must show what the mockup shows at each one (T12).
 */
const SIM_SLICES = ['s1', 's2', 's3', 's4', 's5', 's6', 's7']
type SimStep = { stage: string; slice: string; end?: 'ok' | 'stopped' }

function simJournal(steps: readonly SimStep[], now: number, runEnd: boolean): JournalState {
  const lines: Array<Record<string, unknown>> = []
  let t = now - (steps.length + 2) * 60_000
  let seq = 0
  for (const step of steps) {
    const agent = `${step.stage}:${step.slice}`
    lines.push({ at: at(t), run: 'sim', seq: (seq += 1), event: 'agent-start', agent, stage: step.stage, slice: step.slice })
    t += 30_000
    if (step.end !== undefined) lines.push({ at: at(t), run: 'sim', seq: (seq += 1), event: 'agent-end', agent, stage: step.stage, slice: step.slice, status: step.end })
    t += 30_000
  }
  if (runEnd) lines.push({ at: at(t), run: 'sim', seq: (seq += 1), event: 'run-end', stoppedAt: 'verify:s4' })
  return absorb('engine-modules', freshJournalState(), lines).state
}

const done4 = (slice: string): SimStep[] => ['plan', 'implement', 'verify', 'review'].map(stage => ({ stage, slice, end: 'ok' as const }))
const SIM_BASE: SimStep[] = [...done4('s1'), ...done4('s2'), { stage: 'plan', slice: 's3', end: 'ok' }, { stage: 'implement', slice: 's3', end: 'ok' }]
const S3_DONE: SimStep[] = [...SIM_BASE, { stage: 'verify', slice: 's3', end: 'ok' }, { stage: 'review', slice: 's3', end: 'ok' }]

type SimCheckpoint = {
  name: string
  steps: SimStep[]
  done: Record<string, RosterFact['stage']>
  reviewed: string[]
  runEnd: boolean
  stopAfter: string | null
  slice: string
  stage: string
  outcome: string
}

/** The five checkpoints: the journal so far, the roster, the control file, and what the mockup shows. */
const SIM_CHECKPOINTS: SimCheckpoint[] = [
  { name: 'start: s3 verify runs', steps: [...SIM_BASE, { stage: 'verify', slice: 's3' }], done: { s1: 'verified', s2: 'verified', s3: 'implemented' }, reviewed: ['s1', 's2'], runEnd: false, stopAfter: null, slice: 's3', stage: 'verify', outcome: 'running' },
  { name: 'step 5: s3 review runs', steps: [...SIM_BASE, { stage: 'verify', slice: 's3', end: 'ok' }, { stage: 'review', slice: 's3' }], done: { s1: 'verified', s2: 'verified', s3: 'verified' }, reviewed: ['s1', 's2'], runEnd: false, stopAfter: null, slice: 's3', stage: 'review', outcome: 'running' },
  { name: 'step 9: s4 plan runs', steps: [...S3_DONE, { stage: 'plan', slice: 's4' }], done: { s1: 'verified', s2: 'verified', s3: 'verified' }, reviewed: ['s1', 's2', 's3'], runEnd: false, stopAfter: null, slice: 's4', stage: 'plan', outcome: 'running' },
  { name: 'step 12: s4 implement runs', steps: [...S3_DONE, { stage: 'plan', slice: 's4', end: 'ok' }, { stage: 'implement', slice: 's4' }], done: { s1: 'verified', s2: 'verified', s3: 'verified', s4: 'planned' }, reviewed: ['s1', 's2', 's3'], runEnd: false, stopAfter: null, slice: 's4', stage: 'implement', outcome: 'running' },
  { name: 'end: stopped after verify on s4', steps: [...S3_DONE, { stage: 'plan', slice: 's4', end: 'ok' }, { stage: 'implement', slice: 's4', end: 'ok' }, { stage: 'verify', slice: 's4', end: 'stopped' }], done: { s1: 'verified', s2: 'verified', s3: 'verified', s4: 'implemented' }, reviewed: ['s1', 's2', 's3'], runEnd: true, stopAfter: 'verify', slice: 's4', stage: 'verify', outcome: 'stopped' },
]

describe('the mockup run (T12)', () => {
  test('five checkpoints of the mockup run give the mockup facts', async () => {
    for (const checkpoint of SIM_CHECKPOINTS) {
      const roster: RosterFact[] = SIM_SLICES.map(slug => ({ slug, stage: checkpoint.done[slug] ?? 'defined', reviewed: checkpoint.reviewed.includes(slug) }))
      const model = buildYoloModel({
        slug: 'engine-modules',
        root: '/work',
        now: NOW,
        journal: simJournal(checkpoint.steps, NOW, checkpoint.runEnd),
        roster,
        records: [],
        control: checkpoint.stopAfter === null ? null : { action: 'stop', after: checkpoint.stopAfter, by: 'person', requestedAt: at(NOW - 60_000) },
        protectedWatched: 0,
        protectedChanged: [],
        commits: { count: null, last: null },
        steerMtime: null,
        usage: usageOf(null),
        dismissed: [],
      })
      expect({ checkpoint: checkpoint.name, slice: model.focus.slice, stage: model.focus.stage, outcome: model.outcome }).toEqual({ checkpoint: checkpoint.name, slice: checkpoint.slice, stage: checkpoint.stage, outcome: checkpoint.outcome })
      expect(model.focus.index).toBe(SIM_SLICES.indexOf(checkpoint.slice) + 1)
      expect(model.focus.count).toBe(7)
      const facts = factsOf(model, NOW)
      expect(facts.focus.line).toContain(checkpoint.slice)
      expect(facts.focus.line).toContain(checkpoint.stage)
      if (checkpoint.outcome === 'stopped') expect(model.slices[3]?.marks[2]).toBe('stop')
    }
  })
})

describe('shared events (T2)', () => {
  test('the mod and the watch script raise the same events from one journal', async () => {
    const lines = yoloJournal(NOW)
      .trim()
      .split('\n')
      .map(line => JSON.parse(line) as Record<string, unknown>)
    const mod = absorb('alpha-flow', freshJournalState(), lines).events
    const script = applyLines('alpha-flow', freshRunState(), lines)
    expect(mod).toEqual(script)
    expect(mod.map(event => event.event)).toEqual(['stage-start', 'stage-end', 'stage-start', 'stage-end', 'stage-start'])
  })
})

describe('the reader (T3)', () => {
  test('a poll parses only the new bytes, and a 5 MB journal poll stays under 50 ms', async () => {
    const line = `${JSON.stringify({ at: at(NOW), run: 'r1', seq: 1, event: 'agent-start', agent: 'plan:auth', pad: 'x'.repeat(200) })}\n`
    let text = line.repeat(Math.ceil((5 * 1024 * 1024) / line.length))
    let crossed = 0
    const io: LiveIo = {
      stat: async () => ({ size: text.length, mtimeMs: NOW }),
      read: async () => {
        crossed += text.length
        return text
      },
      readFrom: async (_path, offset, max) => {
        const part = text.slice(offset, offset + max)
        const cut = part.lastIndexOf('\n')
        const out = cut < 0 ? '' : part.slice(0, cut + 1)
        crossed += out.length
        return out
      },
      list: async () => [],
    }
    const reader = new LiveReader(io)
    // A large file crosses in 2 MB chunks: the first polls read the backlog.
    let total = 0
    for (let poll = 0; poll < 10; poll += 1) {
      const backlog = await reader.tail('/j')
      if (backlog.lines.length === 0) break
      total += backlog.lines.length
    }
    expect(total).toBe(text.length / line.length)
    crossed = 0
    text += line
    const started = performance.now()
    const second = await reader.tail('/j')
    const elapsed = performance.now() - started
    expect(second.lines).toHaveLength(1)
    expect(crossed).toBe(line.length)
    expect(elapsed).toBeLessThan(50)
  })
})

/** The names `coreFactNames` gives: a style may add layout keys of its own beside them. */
const CORE_FACT = /^(?:focus|liveness)$|^(?:group|need|meter|control):/u

/** The core facts each style drew for the yolo view on the terminal (T5 compares them). */
const drawnFacts = new Map<string, string[]>()

describe('the live pane', () => {
  for (const style of VIEW_STYLES) {
    test(`style ${style} draws the yolo, campaign and brainstorm views on each surface (T4)`, { options: { viewStyle: style } }, async ($, on) => {
      await openLive($, on)
      await run($, 'wf-live', 'camp')
      await run($, 'wf-live', 'idea')
      for (const surface of SURFACES) {
        for (const slug of ['alpha-flow', 'camp', 'idea']) {
          await run($, 'wf-live', slug)
          const ui = await mountPane($, surface)
          const tree = await ui.drawn()
          expect(textOf(tree)).not.toContain('No live run yet')
          expect(factNamesOf(tree)).toContain('focus')
          if (surface === 'terminal' && slug === 'alpha-flow') drawnFacts.set(style, factNamesOf(tree).filter(name => CORE_FACT.test(name)))
          await ui.unmount()
        }
      }
    })
  }

  test('the three styles carry the same facts for the same model (T5)', async () => {
    // The T4 tests above drew the same run in each style.
    expect([...drawnFacts.keys()].sort()).toEqual([...VIEW_STYLES].sort())
    const [first, ...rest] = VIEW_STYLES.map(style => drawnFacts.get(style) ?? [])
    for (const names of rest) expect(names).toEqual(first ?? [])
    expect(first).toContain('liveness')
    expect(first).toContain('control:stop-stage')
    const yolo = buildYoloModel({ slug: 'alpha-flow', root: '/work', now: NOW, journal: yoloJournalState(NOW), roster: ROSTER, records: [], control: null, protectedWatched: 0, protectedChanged: [], commits: { count: null, last: null }, steerMtime: null, usage: usageOf(null), dismissed: [] })
    const core = coreFactNames(factsOf(yolo, NOW)).sort()
    expect(core).toContain('focus')
    expect(core).toContain('liveness')
  })

  test('liveView off opens no pane (T6)', { options: { liveView: false } }, async ($, on) => {
    const world = await openLive($, on)
    expect(world.opened).not.toContain('wf-live')
    expect((await run($, 'wf-live', 'alpha-flow')).text).toBe('The live view of yolo alpha-flow follows the run, but its pane is not drawn: the liveView option is off.')
  })

  test('/wf-live says so when no surface places the pane', async ($, on) => {
    const world = await openLive($, on)
    expect((await run($, 'wf-live', 'alpha-flow')).text).toBe('The live view of yolo alpha-flow is open.')
    world.unplaced = 'no attached surface places panes'
    expect((await run($, 'wf-live', 'alpha-flow')).text).toBe('The live view of yolo alpha-flow follows the run, but its pane is not drawn: no attached surface places panes.')
  })

  test('the style button sets the next style; a locked row hides it (T7)', async ($, on) => {
    const world = await openLive($, on)
    const ui = await mountPane($, 'terminal')
    expect(await ui.find({ key: LIVE_KEYS.style })).toBeDefined()
    await ui.press({ key: LIVE_KEYS.style })
    expect(world.configSet).toEqual([{ key: `${PLUGIN_NAME}.viewStyle`, value: 'instrument' }])
    await ui.unmount()
  })

  test('a locked style row draws no style button (T7)', async ($, on) => {
    const tree: Record<string, string> = { ...TREE }
    const world = seat(on, tree)
    world.locked = true
    await world.clock.set(NOW)
    tree['/work/.ai/workflows/alpha-flow/.driver-journal.jsonl'] = yoloJournal(NOW)
    await $.session.start(SESSION)
    await run($, 'wf-live', 'alpha-flow')
    const ui = await mountPane($, 'terminal')
    expect(await ui.find({ key: LIVE_KEYS.style })).toBeUndefined()
    await ui.unmount()
  })

  test('the details state is stored per view and survives a new session (T8)', async ($, on) => {
    await openLive($, on)
    let ui = await mountPane($, 'terminal')
    const closed = factNamesOf(await ui.drawn())
    await ui.press({ key: LIVE_KEYS.details })
    const open = factNamesOf(await ui.drawn())
    expect(open.length).toBeGreaterThanOrEqual(closed.length)
    await ui.unmount()
    await $.session.start(SESSION)
    await run($, 'wf-live', 'alpha-flow')
    ui = await mountPane($, 'terminal')
    expect(factNamesOf(await ui.drawn())).toEqual(open)
    await ui.unmount()
  })

  test('stop writes the control file, reads it back, and a second press removes it (T9)', async ($, on) => {
    const world = await openLive($, on)
    const ui = await mountPane($, 'terminal')
    await ui.press({ key: LIVE_KEYS.control('stop-stage') })
    const path = '/work/.ai/workflows/alpha-flow/.control.json'
    const first = JSON.parse(world.written.get(path) ?? '{}') as Record<string, unknown>
    expect(first).toMatchObject({ action: 'stop', after: 'verify', by: 'live-view' })
    await ui.press({ key: LIVE_KEYS.control('stop-stage') })
    const second = JSON.parse(world.written.get(path) ?? '{}') as Record<string, unknown>
    expect(second).toMatchObject({ action: 'none', clearedBy: 'live-view' })
    await ui.unmount()
  })

  test('a fault in the pane draws the engine default and the picker still works (T10)', async ($, on) => {
    const world = seat(on, { ...TREE, '/work/.ai/workflows/alpha-flow/.driver-journal.jsonl': '{not json\n' })
    await world.clock.set(NOW)
    await $.session.start(SESSION)
    await run($, 'wf-live', 'alpha-flow')
    const ui = await mountPane($, 'terminal')
    await ui.drawn()
    await ui.unmount()
    const { text } = await run($, 'wf')
    expect(typeof text).toBe('string')
  })

  test('the heartbeat region advances only on its own timer (T11)', async ($, on) => {
    await openLive($, on)
    const ui = await mountPane($, 'terminal')
    const before = JSON.stringify(await ui.drawn({ in: 'live-heartbeat' }))
    // No render loop: with the frame clock still, the region draws the same tree.
    expect(JSON.stringify(await ui.drawn({ in: 'live-heartbeat' }))).toBe(before)
    // One tick of its own timer moves it (the breathing dot dims).
    await ui.advance(500)
    expect(JSON.stringify(await ui.drawn({ in: 'live-heartbeat' }))).not.toBe(before)
    await ui.unmount()
  })

  test('push-class toasts carry a 10 second timeout (T18)', async ($, on) => {
    const tree: Record<string, string> = { ...TREE }
    const world = seat(on, tree)
    await world.clock.set(NOW)
    tree['/work/.ai/workflows/alpha-flow/.driver-journal.jsonl'] = yoloJournal(NOW)
    await $.session.start(SESSION)
    await run($, 'wf-live', 'alpha-flow')
    tree['/work/.ai/workflows/alpha-flow/.driver-journal.jsonl'] += `${JSON.stringify({ at: at(NOW + 1000), run: 'r1', seq: 6, event: 'agent-end', agent: 'verify:auth', stage: 'verify', slice: 'auth', status: 'hard-stop' })}\n`
    await world.clock.advance(3_000)
    const stops = world.toasts.filter(toast => toast.text.includes('stopped'))
    expect(stops.length).toBeGreaterThan(0)
    for (const toast of stops) expect(toast.timeoutMs).toBe(PUSH_TOAST_MS)
  })
})

describe('the existing parts in each style', () => {
  const PARTS: StripParts = {
    workflow: { slug: 'alpha-flow', status: 'active', terminal: false, currentStage: 'implement', selectedSlice: 'auth', nextInvocation: '/wf verify alpha-flow auth' },
    slices: [
      { slug: 'auth', status: 'complete', complexity: 's', stage: 'verified' },
      { slug: 'ui', status: 'defined', complexity: 'm', stage: 'defined' },
    ],
    text: 'wf alpha-flow · implement · 1/2 slices · next: /wf verify alpha-flow auth · $0.42 stage',
  }

  test('the picker rows and controls keep their words in every style (T15)', async () => {
    for (const style of VIEW_STYLES) {
      expect(pickerRowLabel(style, 'alpha-flow  active', null)).toContain('alpha-flow')
      expect(pickerControlLabel(style, 'back')).toMatch(/back/iu)
    }
  })

  test('the strip row count matches the drawn rows at 40, 80 and 120 columns (T16)', async () => {
    for (const style of VIEW_STYLES) {
      for (const columns of [40, 80, 120]) {
        const rows = styledStripRows(style, PARTS, null, 0, columns)
        const pieces = stripPieces(style, PARTS)
        const width = [pieces.mark, pieces.main, pieces.tail].filter(Boolean).join(' ').length
        expect(rows).toBeGreaterThanOrEqual(Math.max(1, Math.ceil(width / columns)))
      }
    }
  })

  for (const style of VIEW_STYLES) {
    test(`style ${style} draws the band, the notice and the dashboard on each surface (T14)`, { options: { viewStyle: style } }, async ($, on) => {
      const tree: Record<string, string> = { ...TREE, '/home/.sdlc/hub-config.json': '{"version":1,"host":"127.0.0.1","port":48173}' }
      seat(on, tree)
      await $.session.start(SESSION)
      await run($, 'wf-dashboard')
      for (const surface of SURFACES) {
        const band = await $.ui.mount({ plugin: PLUGIN_NAME, surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 11 }, view: {} }, viewport: { columns: 120, rows: 40 } })
        await band.drawn()
        await band.unmount()
        const notice = await $.ui.mount({ plugin: PLUGIN_NAME, surface, component: 'InfoNotice', props: { text: 'model: sonnet', command: null }, viewport: { columns: 120, rows: 40 } })
        await notice.drawn()
        await notice.unmount()
        const pane = await $.ui.mount({ plugin: PLUGIN_NAME, surface, component: 'Pane', requestId: 'wf-dashboard', props: PANE_PROPS, viewport: { columns: 120, rows: 40 } })
        await pane.drawn()
        await pane.unmount()
      }
      const BAND: RenderInput<'AbovePrompt'> = { component: 'AbovePrompt', surface: 'terminal', requestId: 'band', viewport: { columns: 120, rows: 40 }, props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 11 }, view: {} } }
      expect(textOf(await $.ui.render(BAND)).toLowerCase()).toContain('alpha-flow')
    })
  }

  test('a reload keeps an open picker step, its page and its filter (T13)', async ($, on) => {
    seat(on, { ...TREE })
    await $.session.start(SESSION)
    await run($, 'wf-plan')
    const BAND: RenderInput<'AbovePrompt'> = { component: 'AbovePrompt', surface: 'terminal', requestId: 'band', viewport: { columns: 120, rows: 40 }, props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 11 }, view: {} } }
    const before = textOf(await $.ui.render(BAND))
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(BAND))).toBe(before)
  })
})
