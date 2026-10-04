import type { On, PromptEditInput, RenderElement, RenderInput, RenderSurface, SessionMessage } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'

import { BACK_KEY, CLOSE_KEY, DASHBOARD_KEY, FILTER_KEY, MORE_KEY, OPTION_KEY_PREFIX, PLUGIN_NAME } from '../names.ts'
import { stageWordOf, styledStripRows } from '../styles/existing.tsx'
import { VIEW_STYLES } from '../styles/tokens.ts'
import { contrastFaults } from './contrast.ts'

tier('user')

const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

const BAND: RenderInput<'AbovePrompt'> = {
  component: 'AbovePrompt',
  surface: 'terminal',
  requestId: 'band',
  viewport: { columns: 120, rows: 40 },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  },
}

const DESKTOP_BAND: RenderInput<'AbovePrompt'> = { ...BAND, surface: 'desktop', requestId: 'band-desktop' }

const PRESENTATION = { isFullscreen: false, columns: 120 } as const

/**
 * A session started without a surface, as Claude Code Desktop starts one
 * through the SDK. The kit fills a null surface in with `terminal`, so these
 * tests cover the parts that do not depend on the surface; the surface gate
 * itself is covered by `surfaceAfterAttach` in the harness and by the live
 * probe journal (MOD-DESKTOP-PLAN.md §6).
 */
const SDK_SESSION = { surface: null, isInteractive: false, cwd: '/work' } as const

const HUB_HEALTH = '{"ok":true,"status":"ok","version":"9.157.0","entries":[{"id":"a","stale":false},{"id":"b","stale":true},{"id":"c","stale":true}]}'
const LEDGER = {
  '/work/.ai/workflows/alpha-flow/cost.jsonl':
    '{"turn":1,"key":"plan","slug":"alpha-flow","main":{"input_tokens":1000,"output_tokens":200},"subagents":[{"input_tokens":300,"output_tokens":100}]}\n{"turn":2,"main":{"input_tokens":400,"output_tokens":0}}\n',
  '/work/.ai/workflows/alpha-flow/07-review-auth.md': '- [ ] one\n- [x] two\n- [ ] three\n',
  '/work/.ai/workflows/alpha-flow/07-review-auth.yaml':
    'rev: 1\nfindings:\n  - id: r1\n    severity: HIGH\n    status: open\n  - id: r2\n    status: deferred\n  - id: r3\n    status: could-not-fix\n  - id: r4\n    status: fixed\ncounts:\n  open: 3\n',
  '/work/.ai/workflows/alpha-flow/07-review-auth-security.yaml': 'findings:\n  - id: s1\n  - id: s2\n  - id: s3\n  - id: s4\n  - id: s5\n',
  '/work/.ai/ship-plan-audit.md':
    '---\nkind: ship-plan-audit\ntriage-status: pending\nfindings:\n  - id: a1\n    severity: BLOCKER\n  - id: a2\n    severity: HIGH\n    status: acknowledged\n  - id: a3\n    severity: LOW\n    status: open\n  - id: a4\n    severity: high\n    status: open\n---\n# Audit\n',
}
/** The hub config the hub tests add; without it the strip has no hub row and the picker tests keep a one-row strip. */
const HUB_CONFIG = { '/home/.sdlc/hub-config.json': '{"version":1,"host":"127.0.0.1","port":48173}' }
/** One transcript message, for a compaction's input; the compact mock answers one summary. */
const MESSAGE: SessionMessage = { role: 'user', text: 'hello', toolUses: [] }
const SUMMARY: SessionMessage = { role: 'assistant', text: 'summary', toolUses: [] }
/** The stat mock's time for a path no write touched: before any turn starts. */
const UNTOUCHED = -1

/** A repository with one active workflow of two slices and one closed workflow. */
const TREE: Record<string, string> = {
  '/work/.ai/workflows/alpha-flow/00-index.md':
    '---\nslug: alpha-flow\nstatus: active\ncurrent-stage: implement\nselected-slice: auth\nnext-invocation: /wf verify alpha-flow auth\n---\n',
  '/work/.ai/workflows/alpha-flow/03-slice.md':
    '---\nslices:\n  - slug: auth\n    status: complete\n    complexity: s\n  - slug: ui\n    status: defined\n    complexity: m\n---\n',
  '/work/.ai/workflows/alpha-flow/06-verify-auth.md': '',
  '/work/.ai/workflows/beta/00-index.md': '---\nslug: beta\nstatus: closed\n---\n',
}

/** Every string in a tree, joined with spaces: what the band would show. */
function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join(' ')
  if (node && typeof node === 'object') {
    const record = node as { props?: Record<string, unknown>; children?: unknown }
    const own = [record.props?.['label'], record.props?.['title']].filter(v => typeof v === 'string').join(' ')
    const options = Array.isArray(record.props?.['options'])
      ? (record.props?.['options'] as Array<{ label?: string; value: string }>).map(o => o.label ?? o.value).join(' ')
      : ''
    return [own, options, textOf(record.children ?? record.props?.['children'] ?? '')].filter(Boolean).join(' ')
  }
  return ''
}

type World = {
  registered: string[]
  filled: string[]
  logged: string[]
  /** The element keys the ring landed on, as the chain's bottom saw them. */
  focused: string[]
  toasts: string[]
  suggested: string[]
  statuses: Array<string | undefined>
  opened: string[]
  /** The session cost the usage mock answers; a test raises it between turns. */
  usd: number
  /** The context percent the usage mock answers; null leaves the figure out, 'reject' fails the read. */
  percent: number | null | 'reject'
  /** The instructions each `session.compact` call carried, in order. */
  compacted: string[]
  /** What the compact mock answers, one entry per call, the last repeating: a compaction, a veto, or a rejection. */
  compactAnswers: Array<'done' | 'skip' | 'reject'>
  /** The hub health body the fetch mock answers, or null for a dead hub. */
  hub: string | null
  /** Modification times by path, for the stat mock; absent paths are untouched. */
  mtimes: Map<string, number>
  clock: MockClock
  /** The props the bottom render hook last saw, after every rewrite above it. */
  props: unknown
  /** Every file the mod wrote through `$.fs.write`, by path. */
  written: Map<string, string>
  /** What `$.session.surfaces()` answers. */
  surfaces: RenderSurface[]
  /** True makes the status-line mock throw, as a surface without one would. */
  statusThrows: boolean
  /** Every prompt a plugin submitted, in order. */
  submitted: string[]
}

/** The world beneath the mod: a session in /work, the tree above, an empty band, and what the store holds. */
function seat(on: On, tree: Record<string, string> = TREE, store: Record<string, unknown> = {}): World {
  const world: World = { registered: [], filled: [], logged: [], focused: [], toasts: [], suggested: [], statuses: [], opened: [], usd: 1, percent: 62, compacted: [], compactAnswers: ['done'], hub: HUB_HEALTH, mtimes: new Map(), clock: null as unknown as MockClock, props: null, written: new Map(), surfaces: ['terminal'], statusThrows: false, submitted: [] }
  const dirs = new Set<string>()
  for (const file of Object.keys(tree)) {
    const parts = file.split('/')
    for (let i = 2; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'))
  }
  // The engine resolves a path against the process's working directory before
  // a hook sees it: on Windows "/work" arrives as "C:\work". Strip the drive.
  const normal = (path: string) => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/\/+$/, '')

  world.clock = mock.clock(on)
  mock.store(on, store)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => {
    world.registered.push(e.name)
    return { value: { command: e.name } }
  })
  // A written file answers a later read: the probe journal reads its own text
  // back before each append. It stays out of `tree`, which some tests share.
  on('fs.exists', ($, e) => ({ value: dirs.has(normal(e.path)) || normal(e.path) in tree || world.written.has(normal(e.path)) }))
  on('fs.list', ($, e) => {
    const dir = normal(e.path)
    if (!dirs.has(dir)) return { deny: `ENOENT: ${dir}` }
    const names = new Map<string, 'file' | 'dir'>()
    for (const file of Object.keys(tree)) {
      if (!file.startsWith(`${dir}/`)) continue
      const rest = file.slice(dir.length + 1)
      const head = rest.split('/')[0] as string
      names.set(head, rest.includes('/') ? 'dir' : 'file')
    }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', ($, e) => {
    const text = tree[normal(e.path)] ?? world.written.get(normal(e.path))
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.scroll', () => ({}))
  on('ui.focus', ($, e) => {
    if (e.element !== undefined) world.focused.push(e.element)
    return {}
  })
  on('ui.status', ($, e) => {
    if (world.statusThrows) throw new Error('no status line here')
    world.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', ($, e) => {
    world.opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('prompt.suggest', ($, e) => {
    world.suggested.push(e.text)
    return { isShown: true }
  })
  on('session.usage', () => {
    if (world.percent === 'reject') return { deny: 'no usage' }
    const context = world.percent === null ? { tokens: 0, window: 200000 } : { tokens: 0, window: 200000, percent: world.percent }
    return { value: { startedAt: 0, context, rateLimits: [], cost: { usd: world.usd } } }
  })
  on('session.compact', ($, e) => {
    world.compacted.push(e.instructions ?? '')
    const answer = (world.compactAnswers.length > 1 ? world.compactAnswers.shift() : world.compactAnswers[0]) ?? 'done'
    if (answer === 'reject') throw new Error('a turn is running')
    if (answer === 'skip') return { skip: 'off' }
    return { messages: [SUMMARY], tokensBefore: 1000, tokensAfter: 100 }
  })
  on('env.get', ($, e) => {
    if (e.name === 'USERPROFILE') return { value: '/home' }
    if (e.name === 'CLAUDE_CODE_ENTRYPOINT') return { value: 'cli' }
    return { value: undefined }
  })
  on('session.id', () => ({ value: 'abcdef0123456789' }))
  on('session.surfaces', () => ({ value: [...world.surfaces] }))
  on('session.attach', ($, e) => ({ clientId: e.clientId }))
  on('prompt.submit', ($, e) => {
    world.submitted.push(e.text)
    return { text: e.text }
  })
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('fs.write', ($, e) => {
    world.written.set(normal(e.path), e.text)
    return { value: undefined }
  })
  on('http.fetch', () => (world.hub === null ? { deny: 'ECONNREFUSED' } : { value: { status: 200, ok: true, headers: {}, text: world.hub } }))
  on('fs.stat', ($, e) => {
    const path = normal(e.path)
    if (!(path in tree)) return { deny: `ENOENT: ${path}` }
    return { value: { kind: 'file' as const, size: tree[path]?.length ?? 0, mtimeMs: world.mtimes.get(path) ?? UNTOUCHED, isLink: false } }
  })
  on('config.set', ($, e) => ({ value: e.value }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('ui.log', ($, e) => {
    world.logged.push(e.text)
    return { value: undefined }
  })
  on('prompt.fill', ($, e) => {
    world.filled.push(e.text)
    return { isFilled: true }
  })
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    world.props = e.props
    return Box({}) as RenderElement
  })
  on('tool.call', { tool: /^AskUserQuestion$/u }, () => ({ result: {} }))
  on('tool.call', { tool: 'Write' }, ($, e) => {
    const path = normal(e.file_path)
    tree[path] = e.content
    world.mtimes.set(path, world.clock.now() + 1)
    return { result: { filePath: e.file_path, success: true } }
  })
  return world
}

/** The person types `text` into an empty box: one `prompt.edit` (the kit runs it; its `$` type lists no `edit`). */
const editPrompt = ($: Engine, text: string) =>
  ($.prompt as unknown as { edit: (input: PromptEditInput) => Promise<unknown> }).edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text })

const run = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: PRESENTATION })

/** Presses the band's row for one option value, as its digit hotkey does. */
const pickRow = ($: Engine, value: string) => $.ui.press({ plugin: PLUGIN_NAME, key: `${OPTION_KEY_PREFIX}${value}` })

/** Draws the band, turns its pages until the row of `value` shows, then picks that row. */
async function pickShown($: Engine, value: string): Promise<void> {
  const key = `${OPTION_KEY_PREFIX}${value}`
  for (let page = 0; page < 5 && !JSON.stringify(await $.ui.render(BAND)).includes(`"${key}"`); page += 1) {
    await $.ui.press({ plugin: PLUGIN_NAME, key: MORE_KEY })
  }
  await pickRow($, value)
}

/** A wheel tick over the band, or a page key while it holds the keyboard. */
const wheel = ($: Engine, by: number) =>
  $.ui.scroll({ component: 'AbovePrompt', requestId: 'band', offset: 0, by, bodyRows: 11, contentRows: 11, origin: { kind: 'person' } })

/** The person moves the ring onto one of the mod's elements. */
const ringTo = ($: Engine, element: string) =>
  $.ui.focus({ component: 'AbovePrompt', requestId: 'band', plugin: PLUGIN_NAME, element, origin: { kind: 'person' } })

const MODE: RenderInput<'SessionMode'> = { component: 'SessionMode', surface: 'terminal', requestId: 'mode', viewport: { columns: 120, rows: 40 }, props: { modes: ['focus'] } }
const SPINNER: RenderInput<'Spinner'> = { component: 'Spinner', surface: 'terminal', requestId: 'spin', viewport: { columns: 120, rows: 40 }, props: { word: 'Sauteing', message: null, suffix: '', mode: 'thinking' } }
const NOTICE: RenderInput<'InfoNotice'> = { component: 'InfoNotice', surface: 'terminal', requestId: 'notice', viewport: { columns: 120, rows: 40 }, props: { text: 'model: sonnet', command: null } }
const QUESTION: RenderInput<'AskUserQuestion'> = { component: 'AskUserQuestion', surface: 'terminal', requestId: 'q1', viewport: { columns: 120, rows: 40 }, props: { tool: 'AskUserQuestion', questions: [{ question: 'Which host?', header: 'Host', options: [{ label: 'a', description: '' }, { label: 'b', description: '' }], multiSelect: false }] } }
const PANE: RenderInput<'Pane'> = { component: 'Pane', surface: 'terminal', requestId: 'wf-dashboard', viewport: { columns: 120, rows: 40 }, props: { title: 'sdlc workflows', isFocused: false, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 12 }, view: {} } }

/** A turn from a typed prompt: start, the writes, and the end. */
async function turn($: Engine, text: string, writes: readonly string[] = [], reason: 'answer' | 'aborted' = 'answer'): Promise<void> {
  await $.turn.start({ text, turnId: `t-${text.length}-${writes.length}` })
  for (const path of writes) await $.tool.call({ tool: 'Write', file_path: path, content: 'x' })
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: reason === 'aborted', turnId: 't', reason })
}

/**
 * The main model's Agent call with `run_in_background`, as the engine raises
 * it: the test engine passes only the arguments given, so `background` is set here.
 */
const spawnBackground = ($: Engine, prompt: string) => $.agent.spawn({ prompt, background: true } as Parameters<Engine['agent']['spawn']>[0])

/** Lets the promise chains a timer or the probe journal started run to their end. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 200; i += 1) await Promise.resolve()
}

const setSetting = ($: Engine, name: string, value: boolean) =>
  $.config.set({ key: `sdlc-workflow.${name}`, value, previous: !value, provider: { plugin: PLUGIN_NAME, tier: 'user' }, origin: { kind: 'composer' } })

/** The probe journal's rows, as the mod wrote them. */
const probeRows = (world: World): Array<Record<string, unknown>> =>
  (world.written.get('/home/.sdlc/mod-probe.jsonl') ?? '')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line) as Record<string, unknown>)

const modesOf = (props: unknown): string[] => ((props as { modes?: string[] })?.modes ?? [])
const wordOf = (props: unknown): string => ((props as { word?: string })?.word ?? '')

/** The props of the element keyed `key` in a tree, or null. */
function elementOf(node: unknown, key: string): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = elementOf(child, key)
      if (hit) return hit
    }
    return null
  }
  if (node && typeof node === 'object') {
    const record = node as { props?: Record<string, unknown>; children?: unknown }
    if (record.props?.['key'] === key) return record.props
    return elementOf(record.children ?? record.props?.['children'] ?? [], key)
  }
  return null
}

/** The hotkey digits on screen, sorted: `0 more` sits in the footer, the rows above it. */
function hotkeysOf(node: unknown): string[] {
  return hotkeysIn(node).sort()
}

function hotkeysIn(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(hotkeysIn)
  if (node && typeof node === 'object') {
    const record = node as { props?: Record<string, unknown>; children?: unknown }
    const own = typeof record.props?.['hotkey'] === 'string' ? [record.props['hotkey'] as string] : []
    return [...own, ...hotkeysIn(record.children ?? record.props?.['children'] ?? [])]
  }
  return []
}

describe('register', () => {
  test('session start registers no command: /wf is the one way in', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    expect(world.registered).toEqual([])
  })

  test('a bare /wf opens the key list; /wf <key> opens the workflow list', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')

    const { text } = await run($, 'wf')
    expect(text).toContain('Pick from the list')
    const keys = textOf(await $.ui.render(BAND))
    expect(keys).toContain('pick a key')
    expect(keys).toContain('plan Plan one or more workflow slices.')

    await run($, 'wf', 'plan')
    const slugs = textOf(await $.ui.render(BAND))
    expect(slugs).toContain('/wf › plan › pick a workflow')
    expect(slugs).toContain('alpha-flow VERIFY')
    expect(slugs).toContain('beta CLOSED')
    expect(slugs.indexOf('alpha-flow')).toBeLessThan(slugs.indexOf('beta'))
  })

  test('/wf plan lists workflows, then slices with status and stage, then fills the prompt', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)

    await run($, 'wf', 'plan')
    expect(textOf(await $.ui.render(BAND))).toContain('pick a workflow')

    await run($, 'wf', 'plan alpha-flow')
    const slices = textOf(await $.ui.render(BAND))
    expect(slices).toContain('/wf › plan › alpha-flow › pick a slice')
    expect(slices).toContain('(no slice)')
    expect(slices).toContain('all every slice')
    expect(slices).toContain('auth complete · verified · s')
    expect(slices).toContain('ui defined · m')

    await pickRow($, 'auth')
    expect(world.filled).toEqual(['/wf plan alpha-flow auth '])
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')
  })

  test('a typed /wf status runs as typed; a slug-optional key opens no step', async ($, on) => {
    const world = seat(on)
    let ran = 0
    on('command.run', () => {
      ran += 1
      return { text: 'passed on' }
    })
    await $.session.start(SESSION)
    expect(await run($, 'wf', 'status')).toEqual({ text: 'passed on' })
    expect(ran).toBe(1)
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')
    expect(world.filled).toEqual([])
  })

  test('(no slice) issues the command once; its run does not open the picker again', async ($, on) => {
    const world = seat(on)
    let ran = 0
    on('command.run', () => {
      ran += 1
      return { text: 'passed on' }
    })
    await $.session.start(SESSION)
    await run($, 'wf', 'plan alpha-flow')
    expect(textOf(await $.ui.render(BAND))).toContain('/wf › plan › alpha-flow › pick a slice')
    await pickRow($, '-')
    expect(world.filled).toEqual(['/wf plan alpha-flow '])
    // The person presses Enter on the filled line: it runs, and no step opens.
    expect(await run($, 'wf', 'plan alpha-flow')).toEqual({ text: 'passed on' })
    expect(ran).toBe(1)
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')
    // Typed again by the person, the same line opens the slice step as before.
    await run($, 'wf', 'plan alpha-flow')
    expect(textOf(await $.ui.render(BAND))).toContain('pick a slice')
  })

  test('the first draw of a picker step writes one draw row with its timing', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await run($, 'wf', 'plan')
    await $.ui.render(BAND)
    await $.ui.render(BAND)
    await settle()
    const draws = probeRows(world).filter(row => row['event'] === 'draw')
    expect(draws.length).toBe(1)
    expect(draws[0]?.['detail']).toMatch(/^picker slug · terminal · read \d+ ms · drawn \d+ ms after the command$/u)
  })

  test('typing /wf opens the picker over the strip, and each word moves it', async ($, on) => {
    const world = seat(on)
    // The engine's own edit: the splice applied to the draft.
    on('prompt.edit', ($, e) => {
      const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
      return { text, cursor: e.start + e.inputText.length }
    })
    const type = (text: string) => editPrompt($, text)
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(BAND))).toContain('alpha-flow VERIFY')
    await type('/wf')
    let band = textOf(await $.ui.render(BAND))
    expect(band).toContain('/wf › pick a key')
    expect(band).toContain('keep typing to narrow')
    // The strip gives its place to the picker, and the band draws no field of its own.
    expect(band).not.toContain('alpha-flow VERIFY')
    expect(JSON.stringify(await $.ui.render(BAND))).not.toContain(FILTER_KEY)
    await type('/wf pl')
    band = textOf(await $.ui.render(BAND))
    expect(band).toContain('filter: pl')
    expect(band).toContain('plan')
    expect(band).not.toContain('intake')
    await type('/wf plan ')
    expect(textOf(await $.ui.render(BAND))).toContain('/wf › plan › pick a workflow')
    // A click puts the pick in the box, and the next step opens on it.
    await pickRow($, 'alpha-flow')
    expect(world.filled).toEqual(['/wf plan alpha-flow '])
    expect(textOf(await $.ui.render(BAND))).toContain('/wf › plan › alpha-flow › pick a slice')
    // A draft that is no /wf command closes it, and the strip comes back.
    await type('hello')
    band = textOf(await $.ui.render(BAND))
    expect(band).not.toContain('pick a')
    expect(band).toContain('alpha-flow VERIFY')
    await settle()
    const prompts = probeRows(world).filter(row => row['event'] === 'prompt').map(row => row['detail'])
    expect(prompts).toContain('edit raised · terminal')
    expect(prompts).toContain('edit drives the picker · terminal')
  })

  test('a picker a command opened keeps its own field; typing does not move it', async ($, on) => {
    seat(on)
    on('prompt.edit', ($, e) => ({ text: e.inputText, cursor: e.inputText.length }))
    await $.session.start(SESSION)
    await run($, 'wf', 'plan')
    await editPrompt($, '/wf sh')
    const band = textOf(await $.ui.render(BAND))
    expect(band).toContain('/wf › plan › pick a workflow')
    expect(JSON.stringify(await $.ui.render(BAND))).toContain(FILTER_KEY)
  })

  test('a workflow without a roster skips the slice step', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await run($, 'wf', 'verify')
    await pickShown($, 'beta')
    expect(world.filled).toEqual(['/wf verify beta '])
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')
  })

  test('a key that takes no argument fills the prompt at once', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')
    await pickShown($, 'ship-plan')
    expect(world.filled).toEqual(['/wf ship-plan '])
  })

  test('an optional-slug key offers "(no slug)" first', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')
    await pickShown($, 'status')
    const text = textOf(await $.ui.render(BAND))
    expect(text.indexOf('(no slug)')).toBeLessThan(text.indexOf('alpha-flow'))
    expect(world.filled).toEqual([])
  })

  test('/wf plan <slug> typed in full opens the slice step; with a slice it runs as typed', async ($, on) => {
    const world = seat(on)
    let ran = 0
    on('command.run', () => {
      ran += 1
      return { text: 'the skill ran' }
    })
    await $.session.start(SESSION)

    await run($, 'wf', 'plan alpha-flow')
    expect(ran).toBe(0)
    expect(textOf(await $.ui.render(BAND))).toContain('pick a slice')

    const { text } = await run($, 'wf', 'plan alpha-flow ui')
    expect(text).toBe('the skill ran')
    expect(ran).toBe(1)
    expect(world.filled).toEqual([])
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')
  })

  test('the close button and a submitted prompt both close the band', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)

    await run($, 'wf')
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key')
    await $.ui.press({ plugin: PLUGIN_NAME, key: CLOSE_KEY })
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')

    await run($, 'wf')
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key')
    await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')
  })

  test('a digit row picks: key, then workflow, then slice, and the last pick fills the prompt', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)

    await run($, 'wf')
    expect(hotkeysOf(await $.ui.render(BAND))).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    await pickRow($, 'plan')
    expect(textOf(await $.ui.render(BAND))).toContain('/wf › plan › pick a workflow')
    expect(world.filled).toEqual([])

    await pickRow($, 'alpha-flow')
    expect(textOf(await $.ui.render(BAND))).toContain('/wf › plan › alpha-flow › pick a slice')

    await pickRow($, 'ui')
    expect(world.filled).toEqual(['/wf plan alpha-flow ui '])
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')
  })

  test('a "(no slice)" row fills the key and the slug alone', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await run($, 'wf', 'verify alpha-flow')
    expect(textOf(await $.ui.render(BAND))).toContain('(no slice)')
    await pickRow($, '-')
    expect(world.filled).toEqual(['/wf verify alpha-flow '])
  })

  test('the key list pages nine rows at a time under twelve with the strip, and the "more" key turns the page', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')

    const first = textOf(await $.ui.render(BAND))
    expect(first).toContain('pick a key 1/3')
    expect(first).toContain('intake Start')
    expect(first).toContain('handoff Prepare')
    expect(first).not.toContain('ship Execute')
    expect(first).toContain('more')

    await $.ui.press({ plugin: PLUGIN_NAME, key: MORE_KEY })
    const second = textOf(await $.ui.render(BAND))
    expect(second).toContain('pick a key 2/3')
    expect(second).toContain('ship Execute')
    expect(second).not.toContain('intake Start')

    await $.ui.press({ plugin: PLUGIN_NAME, key: MORE_KEY })
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key 3/3')
    await $.ui.press({ plugin: PLUGIN_NAME, key: MORE_KEY })
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key 1/3')

    // A new step starts on its first page.
    await pickRow($, 'plan')
    await $.ui.press({ plugin: PLUGIN_NAME, key: CLOSE_KEY })
    await run($, 'wf')
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key 1/3')
  })

  test('a short band shrinks the page so every row keeps a hotkey', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')
    const short = { ...BAND, props: { ...BAND.props, maxRows: 5, scroll: { offset: 0, bodyRows: 4 } } }
    const tree = await $.ui.render(short)
    expect(hotkeysOf(tree)).toEqual(['0', '1', '2', '3'])
    expect(textOf(tree)).toContain('pick a key 1/8')
  })

  test('a tall band still pages nine rows, one digit each, and never arms a letter', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')
    const tall = { ...BAND, props: { ...BAND.props, maxRows: 40, scroll: { offset: 0, bodyRows: 39 } } }
    const tree = await $.ui.render(tall)
    expect(hotkeysOf(tree)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(textOf(tree)).toContain('pick a key 1/3')
    expect(textOf(tree)).not.toContain('observability Route')
  })

  test('the back button returns to the step before, and the key step has none', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')
    expect(textOf(await $.ui.render(BAND))).not.toContain('← back')
    await pickRow($, 'plan')
    await $.ui.render(BAND)
    await pickRow($, 'alpha-flow')
    expect(textOf(await $.ui.render(BAND))).toContain('/wf › plan › alpha-flow › pick a slice')
    await $.ui.press({ plugin: PLUGIN_NAME, key: BACK_KEY })
    expect(textOf(await $.ui.render(BAND))).toContain('/wf › plan › pick a workflow')
    await $.ui.press({ plugin: PLUGIN_NAME, key: BACK_KEY })
    await $.ui.render(BAND)
    const tree = textOf(await $.ui.render(BAND))
    expect(tree).toContain('/wf › pick a key')
    expect(tree).not.toContain('← back')
  })

  test('the wheel over the band turns the page either way, and the window stays', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key 1/3')

    expect(await wheel($, 1)).toEqual({})
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key 2/3')
    await wheel($, 3)
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key 3/3')
    await wheel($, -1)
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key 2/3')
    await wheel($, -1)
    await wheel($, -1)
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key 3/3')
  })

  test('the wheel with no band up passes through', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    expect(await wheel($, 1)).toEqual({})
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')
  })

  test('the ring past the last row lands on the next page, and before the first on the previous', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')
    await $.ui.render(BAND)

    // The ring walks the rows; nothing turns.
    await ringTo($, `${OPTION_KEY_PREFIX}intake`)
    await ringTo($, `${OPTION_KEY_PREFIX}shape`)
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key 1/3')

    // From the last row (handoff) a move onto a title control is Tab past the end.
    await ringTo($, `${OPTION_KEY_PREFIX}handoff`)
    world.focused.length = 0
    await ringTo($, MORE_KEY)
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key 2/3')
    expect(world.focused).toEqual([`${OPTION_KEY_PREFIX}ship`])

    // From the first row of page 2 a move onto the field is Shift+Tab before the start.
    await ringTo($, FILTER_KEY)
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key 1/3')
    expect(world.focused).toEqual([`${OPTION_KEY_PREFIX}ship`, `${OPTION_KEY_PREFIX}handoff`])

    // On a one-page step the ring moves as the engine says.
    await $.ui.press({ plugin: PLUGIN_NAME, key: `${OPTION_KEY_PREFIX}plan` })
    await $.ui.render(BAND)
    world.focused.length = 0
    await ringTo($, `${OPTION_KEY_PREFIX}beta`)
    await ringTo($, CLOSE_KEY)
    expect(world.focused).toEqual([`${OPTION_KEY_PREFIX}beta`, CLOSE_KEY])
    expect(textOf(await $.ui.render(BAND))).toContain('pick a workflow')
  })

  test('a list that fits one page draws no "more" row', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await run($, 'wf', 'plan')
    const tree = await $.ui.render(BAND)
    expect(hotkeysOf(tree)).toEqual(['1', '2'])
    expect(elementOf(tree, MORE_KEY)).toBeNull()
    expect(textOf(tree)).not.toContain('(page')
  })

  test('without .ai/workflows the workflow step says so', async ($, on) => {
    seat(on, {})
    await $.session.start(SESSION)
    await run($, 'wf', 'plan')
    const text = textOf(await $.ui.render(BAND))
    expect(text).toContain('No .ai/workflows directory')
  })

  test('the strip shows the newest workflow with its stage, slice count, next step, and cost', async ($, on) => {
    const world = seat(on, { ...TREE, ...HUB_CONFIG, ...LEDGER })
    world.mtimes.set('/work/.ai/workflows/alpha-flow/00-index.md', 5_000_000)
    await $.session.start(SESSION)
    const text = textOf(await $.ui.render(BAND))
    expect(text).toContain('alpha-flow VERIFY ■■■■■ ■ □□ 1/2 slices next /wf verify alpha-flow auth')
    expect(text).toContain('2k tok')
    expect(text).not.toContain('sdlc hub')
    expect(text).not.toContain('this stage')
    expect(world.statuses.at(-1)).toBe('next /wf verify alpha-flow auth · hub 9.157.0')
    await $.ui.render(MODE)
    expect(modesOf(world.props)).toEqual(['focus', 'wf:implement'])
  })

  test('the rotate button walks every workflow, active first, and a /wf naming one shows it', async ($, on) => {
    const world = seat(on, {
      ...TREE,
      ...HUB_CONFIG,
      '/work/.ai/workflows/gamma/00-index.md': '---\nslug: gamma\nstatus: active\ncurrent-stage: plan\nselected-slice: core\nnext-invocation: /wf implement gamma core\n---\n',
    })
    world.mtimes.set('/work/.ai/workflows/alpha-flow/00-index.md', 5_000_000)
    on('command.run', () => ({ text: '' }))
    await $.session.start(SESSION)
    let text = textOf(await $.ui.render(BAND))
    expect(text).toContain('alpha-flow VERIFY')
    expect(text).toContain('⇄ 2')
    await $.ui.press({ plugin: PLUGIN_NAME, key: 'wf-strip-rotate' })
    text = textOf(await $.ui.render(BAND))
    expect(text).toContain('gamma IMPLEMENT')
    expect(world.statuses.at(-1)).toBe('next /wf implement gamma core · hub 9.157.0')
    await $.ui.press({ plugin: PLUGIN_NAME, key: 'wf-strip-rotate' })
    expect(textOf(await $.ui.render(BAND))).toContain('beta CLOSED')
    await $.ui.press({ plugin: PLUGIN_NAME, key: 'wf-strip-rotate' })
    expect(textOf(await $.ui.render(BAND))).toContain('alpha-flow VERIFY')
    await run($, 'wf', 'status gamma')
    expect(textOf(await $.ui.render(BAND))).toContain('gamma IMPLEMENT')
    // The status line names the workflow the strip names.
    expect(world.statuses.at(-1)).toBe('next /wf implement gamma core · hub 9.157.0')
    // The strip morphs into the picker: while a step is open the strip is gone, so a narrow band pages as many rows.
    const narrow = { ...BAND, props: { ...BAND.props, bodyColumns: 40, maxRows: 12 } }
    await run($, 'wf')
    expect(textOf(await $.ui.render(BAND))).not.toContain('gamma IMPLEMENT')
    expect(hotkeysOf(await $.ui.render(narrow))).toEqual(hotkeysOf(await $.ui.render(BAND)))
  })

  test('the active workflow survives a session restart, and the strip never opens on a closed one', async ($, on) => {
    const world = seat(on)
    // The closed workflow's index is the newest file: the strip still opens on the active one.
    world.mtimes.set('/work/.ai/workflows/beta/00-index.md', 9_000_000)
    world.mtimes.set('/work/.ai/workflows/alpha-flow/00-index.md', 5_000_000)
    on('command.run', () => ({ text: '' }))
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(BAND))).toContain('alpha-flow VERIFY')
    await run($, 'wf', 'status beta')
    expect(textOf(await $.ui.render(BAND))).toContain('beta CLOSED')
    // A reload (a /config change) or the next session starts on the remembered workflow.
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(BAND))).toContain('beta CLOSED')
  })

  test('the band redraws on its own when the active workflow changes, and a word that names no workflow leaves it', async ($, on) => {
    const world = seat(on, {
      ...TREE,
      '/work/.ai/workflows/gamma/00-index.md': '---\nslug: gamma\nstatus: active\ncurrent-stage: plan\nselected-slice: core\nnext-invocation: /wf implement gamma core\n---\n',
    })
    world.mtimes.set('/work/.ai/workflows/alpha-flow/00-index.md', 5_000_000)
    on('command.run', () => ({ text: '' }))
    await $.session.start(SESSION)
    const band = await $.ui.mount({ plugin: PLUGIN_NAME, surface: 'terminal', component: 'AbovePrompt', props: BAND.props, viewport: { columns: 120, rows: 40 } } as Parameters<Engine['ui']['mount']>[0])
    const words = async () => textOf(await band.drawn())
    expect(await words()).toContain('alpha-flow VERIFY')
    // A whole lap and one more: on the second lap every workflow's slices are known, so only the active slug changes.
    for (const slug of ['gamma IMPLEMENT', 'beta CLOSED', 'alpha-flow VERIFY', 'gamma IMPLEMENT']) {
      await band.press({ key: 'wf-strip-rotate' })
      expect(await words()).toContain(slug)
    }
    // Words after the key that name no workflow: the strip stays on gamma.
    await run($, 'wf', 'status advise')
    expect(await words()).toContain('gamma IMPLEMENT')
    await $.turn.start({ text: '/wf intake brainstorm my idea', turnId: 'tb' })
    expect(await words()).toContain('gamma IMPLEMENT')
    expect(world.statuses.at(-1)).toMatch(/^next \/wf implement gamma core/u)
    await band.unmount()
  })

  test('a new session does not open on a closed workflow that another session named last', async ($, on) => {
    seat(on, TREE, { 'active:/work': 'beta' })
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(BAND))).toContain('alpha-flow VERIFY')
  })

  test('a new session opens on the closed workflow it remembers when no workflow is active', async ($, on) => {
    const world = seat(on, { '/work/.ai/workflows/beta/00-index.md': TREE['/work/.ai/workflows/beta/00-index.md'] as string, '/work/.ai/workflows/zeta/00-index.md': '---\nslug: zeta\nstatus: closed\n---\n' }, { 'active:/work': 'beta' })
    // The newer closed workflow is zeta: the remembered one wins.
    world.mtimes.set('/work/.ai/workflows/zeta/00-index.md', 9_000_000)
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(BAND))).toContain('beta CLOSED')
  })

  test('the stage label and cells follow the next command forward, and never back', () => {
    const at = (currentStage: string | null, nextInvocation: string | null) => stageWordOf({ slug: 'x', status: 'active', terminal: false, currentStage, selectedSlice: null, nextInvocation })
    expect(at('plan', '/wf implement x core')).toBe('implement')
    expect(at('implement', '/wf implement x core')).toBe('implement')
    expect(at('review', '/wf implement x fix')).toBe('review')
    expect(at('brainstorm', '/wf intake brainstorm x')).toBe('brainstorm')
    expect(at('plan', null)).toBe('plan')
  })

  test('a strip with no next command keeps its cost on the first row when it fits', () => {
    const closed = { slug: 'task-update-realism-documents', status: 'closed', terminal: true, currentStage: 'retro', selectedSlice: null, nextInvocation: null }
    const open = { ...closed, status: 'active', terminal: false, currentStage: 'plan', nextInvocation: '/wf implement x core' }
    // [ dashboard ] and [ ⇄ 8 ] as the terminal draws them; no live button for a workflow with no run.
    expect(styledStripRows('dashboard', { workflow: closed, slices: [], text: '' }, '51.9M tok', 8, 90, false)).toBe(1)
    // With a live button the same row needs 93 columns.
    expect(styledStripRows('dashboard', { workflow: closed, slices: [], text: '' }, '51.9M tok', 8, 90, true)).toBe(2)
    // Style E's labels are longer (capitals and an arrow).
    expect(styledStripRows('grid', { workflow: closed, slices: [], text: '' }, '51.9M tok', 8, 86, false)).toBe(2)
    expect(styledStripRows('dashboard', { workflow: closed, slices: [], text: '' }, '51.9M tok', 8, 50, false)).toBe(2)
    expect(styledStripRows('dashboard', { workflow: open, slices: [], text: '' }, '51.9M tok', 8, 90)).toBe(2)
    expect(styledStripRows('dashboard', { workflow: open, slices: [], text: '' }, null, 8, 120)).toBe(1)
  })

  test('a /wf run names the active workflow, and the strip draws under the picker', async ($, on) => {
    const world = seat(on)
    on('command.run', () => ({ text: '' }))
    await $.session.start(SESSION)
    await run($, 'wf', 'status beta')
    const text = textOf(await $.ui.render(BAND))
    expect(text).toContain('beta CLOSED')
    expect(text).not.toContain('pick a')
    await $.ui.render(MODE)
    expect(modesOf(world.props)).toEqual(['focus'])
  })

  test('the strip setting off hides the strip, the status, and the mode label', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(BAND))).toContain('wf ')
    await setSetting($, 'strip', false)
    expect(textOf(await $.ui.render(BAND))).toBe('')
    expect(world.statuses.at(-1)).toBeUndefined()
    await $.ui.render(MODE)
    expect(modesOf(world.props)).toEqual(['focus'])
  })

  test('a stage turn that writes its artifact suggests the next step, charges the stage, and names the spinner', async ($, on) => {
    const world = seat(on, { ...TREE, ...HUB_CONFIG })
    await $.session.start(SESSION)
    await $.turn.start({ text: '/wf implement alpha-flow auth', turnId: 't1' })
    await $.ui.render(SPINNER)
    expect(wordOf(world.props)).toBe('Implementing auth')
    world.usd = 1.42
    await $.tool.call({ tool: 'Write', file_path: '/work/.ai/workflows/alpha-flow/05-implement-auth.md', content: 'done' })
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    // The compaction runs inside the turn.complete dispatch, where the engine
    // accepts it; the suggestion follows on the compacted session.
    expect(world.toasts).toEqual(['wf: compacting after implement (context 62%)'])
    expect(world.compacted).toHaveLength(1)
    expect(world.suggested).toEqual([])
    await world.clock.advance(1)
    await settle()
    expect(world.compacted[0]).toBe(
      'The /wf implement stage of workflow alpha-flow is complete. Keep the workflow slug alpha-flow, the selected slice auth, the next invocation /wf verify alpha-flow auth. Keep the paths of the artifacts written this turn: /work/.ai/workflows/alpha-flow/05-implement-auth.md. Keep verbatim every decision, acceptance criterion, blocker, and answer the person gave that is not yet written to an artifact. Drop tool output, test logs, and file contents; the next stage re-reads the artifacts from disk.',
    )
    expect(world.suggested).toEqual(['/wf verify alpha-flow auth'])
    expect(textOf(await $.ui.render(BAND))).toContain('$0.42')
    expect(world.statuses.at(-1)).toBe('next /wf verify alpha-flow auth · $0.42 stage · hub 9.157.0')
    await $.ui.render(SPINNER)
    expect(wordOf(world.props)).toBe('Sauteing')
  })

  test('the dispatcher run names the turn that follows it when the turn text is the expanded skill', async ($, on) => {
    const world = seat(on)
    on('command.run', () => ({ text: '' }))
    await $.session.start(SESSION)
    await run($, 'wf', 'implement alpha-flow auth')
    await $.turn.start({ text: 'You are the implement stage. Read 04-plan-auth.md and ...', turnId: 't9' })
    await $.ui.render(SPINNER)
    expect(wordOf(world.props)).toBe('Implementing auth')
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't9', reason: 'answer' })
    expect(world.toasts).toEqual(['wf: implement ended without 05-implement-auth.md'])
    // A run older than the window names nothing.
    await run($, 'wf', 'verify alpha-flow auth')
    await world.clock.advance(11_000)
    await $.turn.start({ text: 'You are the verify stage ...', turnId: 't10' })
    await $.ui.render(SPINNER)
    expect(wordOf(world.props)).toBe('Sauteing')
  })

  test('a stage turn that writes nothing toasts, and an interrupted one stays quiet', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await turn($, '/wf verify alpha-flow ui')
    expect(world.toasts).toEqual(['wf: verify ended without 06-verify-ui.md'])
    expect(world.suggested).toEqual([])
    await turn($, '/wf verify alpha-flow ui', [], 'aborted')
    expect(world.toasts).toHaveLength(1)
    await turn($, 'hello there')
    expect(world.toasts).toHaveLength(1)
  })

  test('a landed stage compacts at any fill, without a percent when the usage read fails', async ($, on) => {
    const world = seat(on, { ...TREE })
    await $.session.start(SESSION)
    world.percent = 8
    await turn($, '/wf implement alpha-flow auth', ['/work/.ai/workflows/alpha-flow/05-implement-auth.md'])
    await world.clock.advance(1)
    await settle()
    expect(world.toasts).toEqual(['wf: compacting after implement (context 8%)'])
    expect(world.compacted).toHaveLength(1)
    expect(world.suggested).toEqual(['/wf verify alpha-flow auth'])
    world.percent = 'reject'
    await turn($, '/wf verify alpha-flow auth', ['/work/.ai/workflows/alpha-flow/06-verify-auth.md', '/work/.ai/workflows/alpha-flow/06-verify-auth.md'])
    await world.clock.advance(1)
    await settle()
    expect(world.toasts.at(-1)).toBe('wf: compacting after verify')
    expect(world.compacted).toHaveLength(2)
    expect(world.compacted[1]).toContain('written this turn: /work/.ai/workflows/alpha-flow/06-verify-auth.md.')
  })

  test('a review turn, a read-only turn, a sub-agent turn, a driver turn, and an unlanded turn compact nothing', async ($, on) => {
    const world = seat(on, { ...TREE })
    await $.session.start(SESSION)
    await turn($, '/wf review alpha-flow auth', ['/work/.ai/workflows/alpha-flow/07-review-auth.md'])
    await world.clock.advance(1)
    await settle()
    expect(world.compacted).toEqual([])
    expect(world.suggested).toEqual(['/wf verify alpha-flow auth'])
    await turn($, '/wf status alpha-flow', ['/work/.ai/workflows/alpha-flow/status-notes.md'])
    await world.clock.advance(1)
    await settle()
    expect(world.compacted).toEqual([])
    await $.turn.start({ text: '/wf implement alpha-flow auth', turnId: 'sub' })
    await $.tool.call({ tool: 'Write', file_path: '/work/.ai/workflows/alpha-flow/05-implement-auth.md', content: 'x' })
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 'sub', reason: 'answer', agentId: 'agent-1' })
    await world.clock.advance(1)
    await settle()
    expect(world.compacted).toEqual([])
    await turn($, '/wf auto alpha-flow auth', ['/work/.ai/workflows/alpha-flow/05-implement-auth.md'])
    await world.clock.advance(1)
    await settle()
    expect(world.compacted).toEqual([])
    await turn($, '/wf verify alpha-flow ui')
    await world.clock.advance(1)
    await settle()
    expect(world.compacted).toEqual([])
    expect(world.toasts.at(-1)).toBe('wf: verify ended without 06-verify-ui.md')
    await turn($, '/wf verify alpha-flow ui', ['/work/.ai/workflows/alpha-flow/06-verify-ui.md'], 'aborted')
    await world.clock.advance(1)
    await settle()
    expect(world.compacted).toEqual([])
  })

  test('a sub-agent finishing mid-turn does not consume the turn, and the stage still compacts', async ($, on) => {
    // A `/wf plan` turn dispatches per-slice sub-agents. A sub-agent raises no
    // `turn.start` but does raise `turn.complete` with its `agentId`; the main
    // turn's bracket must survive it, writes and all.
    const world = seat(on, { ...TREE })
    await $.session.start(SESSION)
    await $.turn.start({ text: '/wf plan alpha-flow auth', turnId: 'main' })
    await $.turn.complete({ answer: 'sub done', durationMs: 1, isAborted: false, turnId: 'sub-1', reason: 'answer', agentId: 'agent-1' })
    await $.tool.call({ tool: 'Write', file_path: '/work/.ai/workflows/alpha-flow/04-plan-auth.md', content: 'plan' })
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 'main', reason: 'answer' })
    await world.clock.advance(1)
    await settle()
    const turns = probeRows(world).filter(row => row['event'] === 'turn')
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ ok: true, detail: 'plan alpha-flow auth · writes 1 · landed true · compact' })
    expect(world.compacted).toHaveLength(1)
  })

  test('a stage turn that ends while its background sub-agent runs waits for it, then checks and compacts once', async ($, on) => {
    // The main model dispatches a background sub-agent and answers "waiting":
    // its turn ends before the artifact exists. The sub-agent's notification
    // starts the next main turn, which writes the artifact.
    const world = seat(on, { ...TREE })
    on('agent.spawn', () => ({ model: 'sonnet', agentId: 'bg-1' }))
    await $.session.start(SESSION)
    await $.turn.start({ text: '/wf implement alpha-flow auth', turnId: 'main' })
    await spawnBackground($, 'Implement slice auth.')
    await $.turn.complete({ answer: 'Waiting on the agent.', durationMs: 1, isAborted: false, turnId: 'main', reason: 'answer' })
    await world.clock.advance(1)
    await settle()
    expect(world.toasts).toEqual([])
    expect(world.compacted).toEqual([])
    await $.turn.complete({ answer: 'slice done', durationMs: 1, isAborted: false, turnId: 'sub', reason: 'answer', agentId: 'bg-1' })
    await turn($, '<task-notification>agent bg-1 completed</task-notification>', ['/work/.ai/workflows/alpha-flow/05-implement-auth.md'])
    await world.clock.advance(1)
    await settle()
    expect(world.toasts).toEqual(['wf: compacting after implement (context 62%)'])
    expect(world.compacted).toHaveLength(1)
    const turns = probeRows(world).filter(row => row['event'] === 'turn')
    expect(turns.map(row => row['detail'])).toEqual(['implement alpha-flow auth · writes 0 · landed n/a · wait(1)', 'implement alpha-flow auth · writes 1 · landed true · compact'])
  })

  test('a typed /wf command drops a parked stage, and an unlanded stage toasts once its sub-agent ends', async ($, on) => {
    const world = seat(on, { ...TREE })
    on('agent.spawn', () => ({ model: 'sonnet', agentId: 'bg-2' }))
    await $.session.start(SESSION)
    await $.turn.start({ text: '/wf verify alpha-flow ui', turnId: 'v1' })
    await spawnBackground($, 'Verify slice ui.')
    await $.turn.complete({ answer: 'Waiting.', durationMs: 1, isAborted: false, turnId: 'v1', reason: 'answer' })
    // The sub-agent never ends; the person starts another stage.
    await turn($, '/wf verify alpha-flow ui')
    expect(world.toasts).toEqual(['wf: verify ended without 06-verify-ui.md'])
    await $.turn.start({ text: '/wf verify alpha-flow ui', turnId: 'v2' })
    await spawnBackground($, 'Verify slice ui.')
    await $.turn.complete({ answer: 'Waiting.', durationMs: 1, isAborted: false, turnId: 'v2', reason: 'answer' })
    expect(world.toasts).toHaveLength(1)
    await $.turn.complete({ answer: 'no luck', durationMs: 1, isAborted: false, turnId: 'sub', reason: 'answer', agentId: 'bg-2' })
    await turn($, '<task-notification>agent bg-2 completed</task-notification>')
    expect(world.toasts).toEqual(['wf: verify ended without 06-verify-ui.md', 'wf: verify ended without 06-verify-ui.md'])
  })

  test('a vetoed compaction logs the reason and still suggests; a refused call is one row carrying the engine reason', async ($, on) => {
    const world = seat(on, { ...TREE })
    await $.session.start(SESSION)
    world.compactAnswers = ['skip']
    await turn($, '/wf implement alpha-flow auth', ['/work/.ai/workflows/alpha-flow/05-implement-auth.md'])
    await world.clock.advance(1)
    await settle()
    expect(world.compacted).toHaveLength(1)
    expect(world.logged.at(-1)).toBe('wf: compaction skipped: off')
    expect(world.suggested).toEqual(['/wf verify alpha-flow auth'])
    // One refusal, then the first rung of the ladder carries it.
    world.compactAnswers = ['reject']
    await turn($, '/wf verify alpha-flow auth', ['/work/.ai/workflows/alpha-flow/06-verify-auth.md'])
    await world.clock.advance(1)
    await settle()
    expect(world.compacted).toHaveLength(2)
    expect(world.logged.at(-1)).toContain('wf: compaction refused: ')
    // The next step is still proposed: a refused compaction ends nothing.
    expect(world.suggested).toEqual(['/wf verify alpha-flow auth', '/wf verify alpha-flow auth'])
    // A refusal is one call and one row that carries the engine's own reason.
    world.compactAnswers = ['reject']
    await turn($, '/wf implement alpha-flow auth', ['/work/.ai/workflows/alpha-flow/05-implement-auth.md'])
    await settle()
    expect(world.compacted).toHaveLength(3)
    // The row carries the engine's own words, whatever they are: that is how a
    // live refusal is diagnosed without a transcript.
    expect(probeRows(world).at(-1)).toMatchObject({ event: 'compact', ok: false, detail: expect.stringContaining('turn.complete refused: ') })
  })

  test('with stageCompact off nothing compacts and the suggestion is proposed as before', async ($, on) => {
    const world = seat(on, { ...TREE })
    await $.session.start(SESSION)
    await setSetting($, 'stageCompact', false)
    await turn($, '/wf implement alpha-flow auth', ['/work/.ai/workflows/alpha-flow/05-implement-auth.md'])
    await world.clock.advance(1)
    await settle()
    expect(world.compacted).toEqual([])
    expect(world.toasts).toEqual([])
    expect(world.suggested).toEqual(['/wf verify alpha-flow auth'])
    const kept = await $.session.compact({ trigger: 'manual', instructions: 'the plan', messages: [MESSAGE] })
    expect(kept).toEqual({ messages: [SUMMARY], tokensBefore: 1000, tokensAfter: 100 })
    expect(world.compacted).toEqual(['the plan'])
  })

  test('every compaction of the main loop keeps the workflow position while one is active', async ($, on) => {
    const world = seat(on, { ...TREE })
    await $.session.start(SESSION)
    const sentence = 'Keep the active /wf workflow alpha-flow, its stage implement, its slice auth, its next invocation /wf verify alpha-flow auth, the paths under .ai/workflows/alpha-flow/.'
    await $.session.compact({ trigger: 'manual', instructions: 'the plan', messages: [MESSAGE] })
    expect(world.compacted).toEqual([`${sentence} the plan`])
    await $.session.compact({ trigger: 'auto', messages: [MESSAGE] })
    expect(world.compacted[1]).toBe(sentence)
    await $.session.compact({ trigger: 'precompute', messages: [MESSAGE] })
    expect(world.compacted[2]).toBe('')
    await $.session.compact({ trigger: 'auto', agentId: 'agent-1', messages: [MESSAGE] })
    expect(world.compacted[3]).toBe('')
    // The mod's own instructions already name the position: the sentence is added once at most.
    await $.session.compact({ trigger: 'plugin', instructions: `${sentence} more`, messages: [MESSAGE] })
    expect(world.compacted[4]).toBe(`${sentence} more`)
  })

  test('a compaction with no active workflow passes through untouched', async ($, on) => {
    const world = seat(on, { '/work/README.md': '' })
    await $.session.start(SESSION)
    await $.session.compact({ trigger: 'manual', instructions: 'the plan', messages: [MESSAGE] })
    expect(world.compacted).toEqual(['the plan'])
  })

  test('the engine\'s own suggestion yields to the next step while a workflow is active', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    const shown = await $.prompt.suggest({ text: 'continue', origin: { kind: 'suggestion' } })
    expect(shown).toEqual({ isShown: true })
    await setSetting($, 'suggestNext', false)
    await $.prompt.suggest({ text: 'continue', origin: { kind: 'suggestion' } })
  })

  test('an intake turn counts its questions in the dialog', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await $.ui.render(QUESTION)
    expect(JSON.stringify(world.props)).not.toContain('floor')
    await $.turn.start({ text: '/wf intake alpha-flow', turnId: 't2' })
    await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
    await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
    await $.ui.render(QUESTION)
    const questions = (world.props as { questions?: Array<{ question: string }> }).questions ?? []
    expect(questions[0]?.question).toBe('Which host? (question 2, floor 20)')
  })

  test('a brainstorm turn counts its questions but shows no floor', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await $.turn.start({ text: '/wf intake brainstorm a per-slug cost budget', turnId: 't2' })
    await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
    await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
    await $.ui.render(QUESTION)
    const questions = (world.props as { questions?: Array<{ question: string }> }).questions ?? []
    expect(questions[0]?.question).toBe('Which host?')
  })

  test('a /wf yolo turn follows its run at once, and the run takes the status line; /wf auto leaves it', async ($, on) => {
    const tree: Record<string, string> = { ...TREE, ...HUB_CONFIG }
    const world = seat(on, tree)
    const clock = world.clock
    await clock.set(10_000_000)
    await $.session.start(SESSION)
    // /wf auto writes no driver journal: the status line keeps the workflow's line.
    await $.turn.start({ text: '/wf auto alpha-flow', turnId: 't2' })
    expect(world.statuses.at(-1)).toMatch(/^next \/wf verify alpha-flow auth/u)
    // The journal appears after the session's first scan: the yolo turn itself follows the run, no scan needed.
    const at = (ms: number) => new Date(ms).toISOString()
    tree['/work/.ai/workflows/alpha-flow/.driver-journal.jsonl'] =
      `{"at":"${at(clock.now() - 120_000)}","run":"r3","seq":1,"event":"agent-start","agent":"implement:auth","stage":"implement","slice":"auth"}\n`
    await $.turn.start({ text: '/wf yolo alpha-flow', turnId: 't3' })
    expect(world.statuses.at(-1)).toMatch(/^yolo · /u)
    // The driverStatus switch off: the workflow's line comes back.
    await setSetting($, 'driverStatus', false)
    expect(world.statuses.at(-1)).toMatch(/^next \/wf verify alpha-flow auth/u)
  })

  // D and E draw fixed ink colours: the hub row carries their plate, so it reads on any terminal.
  for (const style of ['instrument', 'grid'] as const) {
    test(`style ${style}: the hub row sits on the style's plate on the terminal, and names no command`, { options: { viewStyle: style } }, async ($, on) => {
      seat(on, { ...TREE, ...HUB_CONFIG })
      await $.session.start(SESSION)
      const tree = await $.ui.render(NOTICE)
      // The engine's own words ("model: sonnet") are its own: only the hub row is the mod's.
      const faults = contrastFaults(tree, null).filter(fault => !fault.startsWith('"model: sonnet"'))
      expect(textOf(tree).toLowerCase()).toContain('sdlc hub 9.157.0')
      expect(textOf(tree)).not.toContain('/wf-')
      expect(faults).toEqual([])
    })
  }

  test('the hub line draws under the logo, and a state change is one toast', async ($, on) => {
    const world = seat(on, { ...TREE, ...HUB_CONFIG })
    const clock = world.clock
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(NOTICE))).toBe('model: sonnet ● sdlc hub 9.157.0 · 3 repos · 2 renders stale')
    world.hub = null
    await clock.advance(60_000)
    await clock.advance(60_000)
    expect(world.toasts).toEqual(['sdlc hub stopped answering'])
    world.hub = HUB_HEALTH
    await clock.advance(60_000)
    expect(world.toasts).toEqual(['sdlc hub stopped answering', 'sdlc hub is back (9.157.0)'])
    // Off: the notice is the engine's own and the poll stops; on again: it resumes.
    await setSetting($, 'hubNotice', false)
    expect(textOf(await $.ui.render(NOTICE))).toBe('')
    world.hub = null
    await clock.advance(60_000)
    expect(world.toasts).toHaveLength(2)
    await setSetting($, 'hubNotice', true)
    expect(textOf(await $.ui.render(NOTICE))).toBe('model: sonnet ■ sdlc hub down')
    world.hub = HUB_HEALTH
    await clock.advance(60_000)
    expect(world.toasts).toHaveLength(3)
  })

  test('the hub line joins one notice only, and keeps the engine\'s command', async ($, on) => {
    seat(on, { ...TREE, ...HUB_CONFIG })
    await $.session.start(SESSION)
    const first = { ...NOTICE, requestId: 'n1', props: { text: 'model: sonnet', command: '/model' } }
    const second = { ...NOTICE, requestId: 'n2', props: { text: 'tip', command: null } }
    expect(textOf(await $.ui.render(first))).toBe('model: sonnet /model ● sdlc hub 9.157.0 · 3 repos · 2 renders stale')
    expect(textOf(await $.ui.render(second))).toBe('')
  })

  test('without a hub config the notice is the engine\'s own', async ($, on) => {
    seat(on, { '/work/.ai/workflows/beta/00-index.md': '---\nslug: beta\nstatus: closed\n---\n' })
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(NOTICE))).toBe('')
  })

  test('the strip\'s dashboard button opens the pane; its rows fill a status command or open the picker', async ($, on) => {
    const world = seat(on, { ...TREE, ...HUB_CONFIG, ...LEDGER })
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(BAND))).toContain('dashboard')
    await $.ui.press({ plugin: PLUGIN_NAME, key: DASHBOARD_KEY })
    expect(world.opened).toEqual(['wf-dashboard'])
    const pane = textOf(await $.ui.render(PANE))
    // E3: one row per open workflow (mark, slug, stage rail, findings, next step); closed ones wait for details (Y5).
    expect(pane).toContain('● alpha-flow VERIFY ■ □ 3 open /wf verify alpha-flow auth status pick')
    expect(pane).toContain('WORKFLOW STAGE SLICES FINDINGS NEXT')
    expect(pane).toContain('ship-plan blockers 2 · hub 9.157.0 ok')
    expect(pane).toContain('details ▸ (1 closed)')
    expect(pane).not.toContain('beta')
    await $.ui.press({ plugin: PLUGIN_NAME, key: 'wf-dash-details' })
    expect(textOf(await $.ui.render(PANE))).toContain('beta')

    await $.ui.press({ plugin: PLUGIN_NAME, key: 'wf-dash-status:beta' })
    expect(world.filled).toEqual(['/wf status beta '])
    await $.ui.press({ plugin: PLUGIN_NAME, key: 'wf-dash-pick:alpha-flow' })
    expect(textOf(await $.ui.render(BAND))).toContain('/wf › plan › alpha-flow › pick a slice')
  })

  test('a surfaceless session binds the host, registers no command, and draws nothing', async ($, on) => {
    const world = seat(on, { ...TREE })
    world.surfaces = []
    let ran = 0
    on('command.run', () => {
      ran += 1
      return { text: 'passed on' }
    })
    await $.session.start(SDK_SESSION)
    // Claude Code Desktop runs the engine through the SDK: no surface, no
    // person at the prompt. The module still binds; it registers no command.
    expect(world.registered).toEqual([])
    // No surface draws, so the picker never opens: the command runs as typed.
    expect(await run($, 'wf')).toEqual({ text: 'passed on' })
    expect(ran).toBe(1)
    expect(world.statuses).toEqual([])
    expect(world.opened).toEqual([])
  })

  test('a Desktop session draws the picker, the strip, the status line, the notice and the dashboard', async ($, on) => {
    // The Desktop app starts the engine through the SDK (no surface at start) with its client attached.
    const world = seat(on, { ...TREE, ...HUB_CONFIG })
    world.surfaces = ['desktop']
    await $.session.start(SDK_SESSION)
    await settle()
    expect(textOf(await $.ui.render(DESKTOP_BAND))).toContain('alpha-flow')
    expect(world.statuses.at(-1)).toContain('next /wf verify alpha-flow auth')
    await $.ui.press({ plugin: PLUGIN_NAME, key: DASHBOARD_KEY })
    expect(world.opened).toEqual(['wf-dashboard'])
    const pane = textOf(await $.ui.render({ ...PANE, surface: 'desktop', requestId: 'wf-dashboard' }))
    expect(pane).toContain('alpha-flow')
    await run($, 'wf', 'plan')
    const band = textOf(await $.ui.render(DESKTOP_BAND))
    expect(band).toContain('alpha-flow')
    expect(band).not.toBe('')
    const DESKTOP_NOTICE: RenderInput<'InfoNotice'> = { ...NOTICE, surface: 'desktop', requestId: 'notice-desktop' }
    expect(textOf(await $.ui.render(DESKTOP_NOTICE))).toContain('sdlc hub 9.157.0')
    // The Desktop app is the first surface: the band, the notice and the pane validate on its table.
    for (const component of ['AbovePrompt', 'InfoNotice'] as const) {
      const props = component === 'AbovePrompt' ? BAND.props : NOTICE.props
      const ui = await $.ui.mount({ plugin: PLUGIN_NAME, surface: 'desktop', component, props, viewport: { columns: 120, rows: 40 } } as Parameters<Engine['ui']['mount']>[0])
      await ui.drawn()
      await ui.unmount()
    }
  })

  test('style A draws the band in a hairline frame on the light Desktop app, and as before on the terminal', async ($, on) => {
    seat(on, { ...TREE })
    await $.session.start(SESSION)
    await run($, 'wf', 'plan')
    const mountBand = async (surface: 'desktop' | 'terminal') => {
      const ui = await $.ui.mount({ plugin: PLUGIN_NAME, surface, component: 'AbovePrompt', props: BAND.props, viewport: { columns: 120, rows: 40 } } as Parameters<Engine['ui']['mount']>[0])
      const tree = JSON.stringify(await ui.drawn())
      await ui.unmount()
      return tree
    }
    const desktop = await mountBand('desktop')
    // No painted ground: a hairline frame on the app's background, and the words in the app's ink.
    expect(desktop).toContain('"borderStyle":"round"')
    expect(desktop).toContain('"color":"#1f1e1b"')
    expect(desktop).not.toContain('backgroundColor')
    const terminal = await mountBand('terminal')
    expect(terminal).not.toContain('"borderStyle":"round"')
    expect(terminal).not.toContain('#1f1e1b')
  })

  test('a Desktop client that attaches after the start turns the drawing on', async ($, on) => {
    const world = seat(on, { ...TREE })
    world.surfaces = []
    let ran = 0
    on('command.run', () => {
      ran += 1
      return { text: 'passed on' }
    })
    await $.session.start(SDK_SESSION)
    // Before the client attaches, no surface draws: the bare /wf runs as typed.
    expect(await run($, 'wf')).toEqual({ text: 'passed on' })
    expect(world.statuses).toEqual([])
    await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
    await settle()
    // Once it attaches, /wf opens the key list in the Desktop band, and the status line draws.
    await run($, 'wf')
    expect(ran).toBe(1)
    expect(textOf(await $.ui.render(DESKTOP_BAND))).toContain('plan')
    expect(world.statuses.length).toBeGreaterThan(0)
  })

  test('a surfaceless session still checks the stage, compacts, and suggests', async ($, on) => {
    const world = seat(on, { ...TREE })
    world.surfaces = []
    await $.session.start(SDK_SESSION)
    await turn($, '/wf implement alpha-flow auth', ['/work/.ai/workflows/alpha-flow/05-implement-auth.md'])
    await world.clock.advance(1)
    await settle()
    expect(world.compacted).toHaveLength(1)
    expect(world.suggested).toEqual(['/wf verify alpha-flow auth'])
    await turn($, '/wf verify alpha-flow ui')
    expect(world.toasts.at(-1)).toBe('wf: verify ended without 06-verify-ui.md')
  })

  test('the probe journal records the load, the turn, and the compaction', async ($, on) => {
    const world = seat(on, { ...TREE })
    world.surfaces = []
    await $.session.start(SDK_SESSION)
    await settle()
    const load = probeRows(world)
    expect(load[0]).toMatchObject({ event: 'load', ok: true, host: 'cli', session: 'abcdef01' })
    expect(load[0]?.['detail']).toContain('root /work')
    expect(load.some(row => row['event'] === 'commands')).toBe(false)
    await turn($, '/wf implement alpha-flow auth', ['/work/.ai/workflows/alpha-flow/05-implement-auth.md'])
    await world.clock.advance(1)
    await settle()
    const rows = probeRows(world)
    expect(rows.find(row => row['event'] === 'turn')).toMatchObject({ ok: true, detail: 'implement alpha-flow auth · writes 1 · landed true · compact' })
    expect(rows.find(row => row['event'] === 'compact')).toMatchObject({ ok: true, detail: 'turn.complete done' })
  })

  test('a client that attaches becomes the surface, and the journal says so', async ($, on) => {
    const world = seat(on, { ...TREE })
    world.surfaces = []
    await $.session.start(SDK_SESSION)
    await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
    await settle()
    const attach = probeRows(world).find(row => row['event'] === 'attach')
    expect(attach).toMatchObject({ ok: true, detail: 'desktop · client desktop:default' })
    // A session that already draws somewhere keeps that surface; the rows go on.
    await turn($, '/wf implement alpha-flow auth', ['/work/.ai/workflows/alpha-flow/05-implement-auth.md'])
    await settle()
    expect(probeRows(world).find(row => row['event'] === 'turn')).toMatchObject({ detail: 'implement alpha-flow auth · writes 1 · landed true · compact' })
  })

  test('with probeJournal off no journal is written', async ($, on) => {
    const world = seat(on, { ...TREE })
    await setSetting($, 'probeJournal', false)
    await $.session.start(SDK_SESSION)
    await settle()
    expect(world.written.size).toBe(0)
  })

  test('a status line the surface does not carry ends nothing: the engine drops the call', async ($, on) => {
    // A void `$.ui.*` call never rejects at the plugin, so the journal cannot
    // record its failure; the session and its rows carry on regardless.
    const world = seat(on, { ...TREE })
    world.statusThrows = true
    await $.session.start(SESSION)
    await settle()
    expect(probeRows(world).filter(row => row['event'] === 'call')).toEqual([])
    expect(probeRows(world)[0]).toMatchObject({ event: 'load', ok: true })
    await turn($, '/wf implement alpha-flow auth', ['/work/.ai/workflows/alpha-flow/05-implement-auth.md'])
    await world.clock.advance(1)
    await settle()
    expect(world.compacted).toHaveLength(1)
  })
})

describe('usage guard', () => {
  const LEDGER_PATH = '/work/.ai/workflows/realism/work/campaign/ledger.json'
  const CONTROL_PATH = '/work/.ai/workflows/realism/work/campaign/.control.json'
  const liveLedger = JSON.stringify({ waves: [{ n: 1, state: 'running', units: ['A'] }], units: { A: { slug: 'engine' } }, pause: null, answers: { budget: null } })

  test('a reading over the pause line writes the reading, the status, a toast, and the campaign pause; the reset clears it and resumes', async ($, on) => {
    const world = seat(on, { ...TREE, [LEDGER_PATH]: liveLedger })
    await $.session.start(SESSION)
    const resetsAt = new Date(world.clock.now() + 120_000).toISOString()
    await $.session.measure({ context: { window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 91, resetsAt }, { kind: 'seven_day', percentUsed: 20 }], changed: ['rateLimits'] })
    await settle()
    const reading = JSON.parse(world.written.get('/home/.claude/sdlc/usage/abcdef0123456789.json') ?? '{}')
    expect(reading.rateLimits[0]).toMatchObject({ kind: 'five_hour', percentUsed: 91 })
    expect(world.written.get('/home/.claude/sdlc/usage/abcdef0123456789.history.jsonl')).toContain('"five_hour":91')
    expect(world.statuses.some(s => (s ?? '').includes('usage 5h 91% · 7d 20%'))).toBe(true)
    expect(world.toasts.some(t => t.includes('5-hour window at 91%'))).toBe(true)
    const control = JSON.parse(world.written.get(CONTROL_PATH) ?? '{}')
    expect(control).toMatchObject({ action: 'pause', scope: 'campaign', until: resetsAt, by: 'usage-guard' })

    await world.clock.advance(180_000)
    await settle()
    expect(JSON.parse(world.written.get(CONTROL_PATH) ?? '{}')).toMatchObject({ action: 'none', clearedBy: 'usage-guard' })
    expect(world.submitted).toContain('The usage window reset. Resume the run with /wf campaign realism.')
  })

  const RESET = new Date(0).toISOString()
  const guardPause = JSON.stringify({ action: 'pause', scope: 'campaign', until: RESET, by: 'usage-guard' })
  const personStop = JSON.stringify({ action: 'stop', scope: 'wave', after: 'wave', by: 'live-view' })
  const RESUME = 'The usage window reset. Resume the run with /wf campaign realism.'

  test('a pause of another project is never resumed here; another session waits five minutes, then resumes it once', async ($, on) => {
    const world = seat(on, { ...TREE, [LEDGER_PATH]: liveLedger, [CONTROL_PATH]: guardPause, '/other/.ai/workflows/x/work/campaign/.control.json': guardPause }, {
      'usage-guard:pauses': [
        { file: '/other/.ai/workflows/x/work/campaign/.control.json', until: RESET, kind: 'campaign', name: 'x', root: '/other', session: 'abcdef0123456789' },
        { file: CONTROL_PATH, until: RESET, kind: 'campaign', name: 'realism', root: '/work', session: 'another-session' },
      ],
    })
    await $.session.start(SESSION)
    await world.clock.advance(60_000)
    await settle()
    expect(world.submitted).toEqual([])
    await world.clock.advance(5 * 60_000)
    await settle()
    expect(world.submitted).toEqual([RESUME])
    await world.clock.advance(60_000)
    await settle()
    expect(world.submitted).toEqual([RESUME])
  })

  test('a pause the person replaced sends no resume, and a pause never overwrites the person\'s stop', async ($, on) => {
    const world = seat(on, { ...TREE, [LEDGER_PATH]: liveLedger, [CONTROL_PATH]: personStop }, {
      'usage-guard:pauses': [{ file: CONTROL_PATH, until: RESET, kind: 'campaign', name: 'realism', root: '/work', session: 'abcdef0123456789' }],
    })
    await $.session.start(SESSION)
    await world.clock.advance(60_000)
    await settle()
    expect(world.submitted).toEqual([])
    expect(world.toasts.some(text => text.includes('so the guard sent no resume'))).toBe(true)
    expect(world.written.has(CONTROL_PATH)).toBe(false)
    // Usage over the pause line: the person's stop stands.
    const resetsAt = new Date(world.clock.now() + 120_000).toISOString()
    await $.session.measure({ context: { window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 95, resetsAt }, { kind: 'seven_day', percentUsed: 20 }], changed: ['rateLimits'] })
    await settle()
    expect(world.written.has(CONTROL_PATH)).toBe(false)
  })

  test('with usageGuard off nothing is read or written', async ($, on) => {
    const world = seat(on, { ...TREE, [LEDGER_PATH]: liveLedger })
    await setSetting($, 'usageGuard', false)
    await $.session.start(SESSION)
    await $.session.measure({ context: { window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 95 }], changed: ['rateLimits'] })
    await settle()
    expect([...world.written.keys()].some(k => k.includes('/usage/'))).toBe(false)
  })
})

describe('the design: contrast and layout of the band, the notice and the dashboard (MOD-DESIGN)', () => {
  for (const style of VIEW_STYLES) {
    test(`style ${style}: every word of the strip, the picker, the notice and the dashboard reads on the Desktop app`, { options: { viewStyle: style } }, async ($, on) => {
      const world = seat(on, { ...TREE, ...HUB_CONFIG })
      await $.session.start(SESSION)
      await settle()
      const faults: string[] = []
      const look = async (name: string, input: Parameters<Engine['ui']['mount']>[0]) => {
        const ui = await $.ui.mount(input)
        const drawn = await ui.drawn()
        await ui.unmount()
        faults.push(...contrastFaults(drawn).map(fault => `${name}: ${fault}`))
        return textOf(drawn).toLowerCase()
      }
      const band = { plugin: PLUGIN_NAME, surface: 'desktop', component: 'AbovePrompt', props: BAND.props, viewport: { columns: 120, rows: 40 } } as Parameters<Engine['ui']['mount']>[0]
      const notice = { plugin: PLUGIN_NAME, surface: 'desktop', component: 'InfoNotice', requestId: 'notice', props: NOTICE.props, viewport: { columns: 120, rows: 40 } } as Parameters<Engine['ui']['mount']>[0]
      expect(await look('strip', band)).toContain('alpha-flow')
      expect(await look('notice (hub up)', notice)).toContain('sdlc hub')
      world.hub = null
      await world.clock.advance(60_000)
      await world.clock.advance(60_000)
      expect(await look('notice (hub down)', notice)).toContain('sdlc hub')
      await $.ui.render(DESKTOP_BAND)
      await $.ui.press({ plugin: PLUGIN_NAME, key: DASHBOARD_KEY })
      expect(await look('dashboard', { plugin: PLUGIN_NAME, surface: 'desktop', component: 'Pane', requestId: 'wf-dashboard', props: PANE.props, viewport: { columns: 120, rows: 40 } })).toContain('alpha-flow')
      await run($, 'wf', 'plan')
      expect(await look('picker', band)).toContain('pick a workflow')
      expect(faults).toEqual([])
    })
  }

  test('the strip draws a second row on a narrow band, and one row on a wide band', async ($, on) => {
    seat(on, { ...TREE })
    await $.session.start(SESSION)
    const stripAt = async (columns: number) => {
      const ui = await $.ui.mount({ plugin: PLUGIN_NAME, surface: 'desktop', component: 'AbovePrompt', props: { ...BAND.props, bodyColumns: columns }, viewport: { columns: 160, rows: 40 } } as Parameters<Engine['ui']['mount']>[0])
      const tree = JSON.stringify(await ui.drawn())
      await ui.unmount()
      return tree
    }
    const wide = await stripAt(120)
    const narrow = await stripAt(60)
    // The second row sits under the slug, indented two columns, and carries the next command.
    expect(wide).not.toContain('"paddingLeft":2')
    expect(narrow).toContain('"paddingLeft":2')
    expect(narrow).toContain('/wf verify alpha-flow auth')
  })
})
