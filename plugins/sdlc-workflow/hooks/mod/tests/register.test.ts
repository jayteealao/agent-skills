import type { On, RenderElement, RenderInput, RenderSurface, SessionMessage } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'

import { CATALOG } from '../catalog.ts'
import { BACK_KEY, CLOSE_KEY, FILTER_KEY, MORE_KEY, OPTION_KEY_PREFIX, PLUGIN_NAME } from '../names.ts'

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
}

/** The world beneath the mod: a session in /work, the tree above, an empty band. */
function seat(on: On, tree: Record<string, string> = TREE): World {
  const world: World = { registered: [], filled: [], logged: [], focused: [], toasts: [], suggested: [], statuses: [], opened: [], usd: 1, percent: 62, compacted: [], compactAnswers: ['done'], hub: HUB_HEALTH, mtimes: new Map(), clock: null as unknown as MockClock, props: null, written: new Map(), surfaces: ['terminal'], statusThrows: false }
  const dirs = new Set<string>()
  for (const file of Object.keys(tree)) {
    const parts = file.split('/')
    for (let i = 2; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'))
  }
  // The engine resolves a path against the process's working directory before
  // a hook sees it: on Windows "/work" arrives as "C:\work". Strip the drive.
  const normal = (path: string) => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/\/+$/, '')

  world.clock = mock.clock(on)
  mock.store(on, {})
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
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 0 })) }
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
    return { value: undefined }
  })
  on('ui.close', () => ({ value: undefined }))
  on('prompt.suggest', ($, e) => {
    world.suggested.push(e.text)
    return { isShown: true }
  })
  on('session.usage', () => {
    if (world.percent === 'reject') return { deny: 'no usage' }
    const context = world.percent === null ? { tokens: 0, window: 200000 } : { tokens: 0, window: 200000, percent: world.percent }
    return { value: { context, rateLimits: [], cost: { usd: world.usd } } }
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
  on('fs.write', ($, e) => {
    world.written.set(normal(e.path), e.text)
    return { value: undefined }
  })
  on('http.fetch', () => (world.hub === null ? { deny: 'ECONNREFUSED' } : { value: { status: 200, ok: true, headers: {}, text: world.hub } }))
  on('fs.stat', ($, e) => {
    const path = normal(e.path)
    if (!(path in tree)) return { deny: `ENOENT: ${path}` }
    return { value: { kind: 'file', size: tree[path]?.length ?? 0, mtimeMs: world.mtimes.get(path) ?? UNTOUCHED } }
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

const run = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: PRESENTATION })

/** Presses the band's row for one option value, as its digit hotkey does. */
const pickRow = ($: Engine, value: string) => $.ui.press({ plugin: PLUGIN_NAME, key: `${OPTION_KEY_PREFIX}${value}` })

/** A wheel tick over the band, or a page key while it holds the keyboard. */
const wheel = ($: Engine, by: number) =>
  $.ui.scroll({ component: 'AbovePrompt', requestId: 'band', offset: 0, by, bodyRows: 11, contentRows: 11, origin: { kind: 'person' } })

/** The person moves the ring onto one of the mod's elements. */
const ringTo = ($: Engine, element: string) =>
  $.ui.focus({ component: 'AbovePrompt', requestId: 'band', plugin: PLUGIN_NAME, element, origin: { kind: 'person' } })

const MODE: RenderInput<'SessionMode'> = { component: 'SessionMode', surface: 'terminal', requestId: 'mode', viewport: { columns: 120, rows: 40 }, props: { modes: ['focus'] } }
const SPINNER: RenderInput<'Spinner'> = { component: 'Spinner', surface: 'terminal', requestId: 'spin', viewport: { columns: 120, rows: 40 }, props: { word: 'Sauteing', message: null, mode: 'thinking' } }
const NOTICE: RenderInput<'InfoNotice'> = { component: 'InfoNotice', surface: 'terminal', requestId: 'notice', viewport: { columns: 120, rows: 40 }, props: { text: 'model: sonnet', command: null } }
const QUESTION: RenderInput<'AskUserQuestion'> = { component: 'AskUserQuestion', surface: 'terminal', requestId: 'q1', viewport: { columns: 120, rows: 40 }, props: { tool: 'AskUserQuestion', questions: [{ question: 'Which host?', header: 'Host', options: [{ label: 'a', description: '' }, { label: 'b', description: '' }], multiSelect: false }] } }
const PANE: RenderInput<'Pane'> = { component: 'Pane', surface: 'terminal', requestId: 'wf-dashboard', viewport: { columns: 120, rows: 40 }, props: { title: 'sdlc workflows', isFocused: false, bodyColumns: 100, placement: 'inline', scroll: { offset: 0, bodyRows: 12 }, view: {} } }

/** A turn from a typed prompt: start, the writes, and the end. */
async function turn($: Engine, text: string, writes: readonly string[] = [], reason: 'answer' | 'aborted' = 'answer'): Promise<void> {
  await $.turn.start({ text, turnId: `t-${text.length}-${writes.length}` })
  for (const path of writes) await $.tool.call({ tool: 'Write', file_path: path, content: 'x' })
  await $.turn.complete({ answer: 'done', durationMs: 1000, isAborted: reason === 'aborted', turnId: 't', reason })
}

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

/** The hotkey digits of the rows on screen, in draw order. */
function hotkeysOf(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(hotkeysOf)
  if (node && typeof node === 'object') {
    const record = node as { props?: Record<string, unknown>; children?: unknown }
    const own = typeof record.props?.['hotkey'] === 'string' ? [record.props['hotkey'] as string] : []
    return [...own, ...hotkeysOf(record.children ?? record.props?.['children'] ?? [])]
  }
  return []
}

describe('register', () => {
  test('session start registers one command per key', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    expect(world.registered.slice(0, 22)).toEqual(CATALOG.map(entry => `wf-${entry.key}`))
    expect(world.registered).toEqual([...CATALOG.map(entry => `wf-${entry.key}`), 'wf-dashboard', 'wf-active'])
  })

  test('a bare /wf opens the key list; /wf <key> opens the workflow list', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')

    const { text } = await run($, 'wf')
    expect(text).toContain('Pick from the list')
    const keys = textOf(await $.ui.render(BAND))
    expect(keys).toContain('pick a key')
    expect(keys).toContain('plan  Plan one or more workflow slices.')

    await run($, 'wf', 'plan')
    const slugs = textOf(await $.ui.render(BAND))
    expect(slugs).toContain('/wf plan — pick a workflow')
    expect(slugs).toContain('alpha-flow  active · stage implement · slice auth')
    expect(slugs).toContain('beta  closed (closed)')
    expect(slugs.indexOf('alpha-flow')).toBeLessThan(slugs.indexOf('beta'))
  })

  test('/wf-plan lists workflows, then slices with status and stage, then fills the prompt', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)

    await run($, 'wf-plan')
    expect(textOf(await $.ui.render(BAND))).toContain('pick a workflow')

    await run($, 'wf-plan', 'alpha-flow')
    const slices = textOf(await $.ui.render(BAND))
    expect(slices).toContain('/wf plan alpha-flow — pick a slice')
    expect(slices).toContain('(no slice)')
    expect(slices).toContain('all  every slice')
    expect(slices).toContain('auth  complete · verified · s')
    expect(slices).toContain('ui  defined · m')

    await run($, 'wf-plan', 'alpha-flow auth')
    expect(world.filled).toEqual(['/wf plan alpha-flow auth '])
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')
  })

  test('a workflow without a roster skips the slice step', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    const { text } = await run($, 'wf-verify', 'beta')
    expect(text).toContain('Press Enter to run /wf verify beta')
    expect(world.filled).toEqual(['/wf verify beta '])
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')
  })

  test('a key that takes no argument fills the prompt at once', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await run($, 'wf-ship-plan')
    expect(world.filled).toEqual(['/wf ship-plan '])
  })

  test('an optional-slug key offers "(no slug)" first', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await run($, 'wf-status')
    const text = textOf(await $.ui.render(BAND))
    expect(text.indexOf('(no slug)')).toBeLessThan(text.indexOf('alpha-flow'))
    expect(world.filled).toEqual([])
  })

  test('/wf-implement with a complete argument list fills the dispatcher form', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    const { text } = await run($, 'wf-implement', 'alpha-flow ui')
    expect(text).toContain('Press Enter to run /wf implement alpha-flow ui')
    expect(world.filled).toEqual(['/wf implement alpha-flow ui '])
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
    on('prompt.submit', ($, e) => ({ text: e.text }))
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
    expect(textOf(await $.ui.render(BAND))).toContain('/wf plan — pick a workflow')
    expect(world.filled).toEqual([])

    await pickRow($, 'alpha-flow')
    expect(textOf(await $.ui.render(BAND))).toContain('/wf plan alpha-flow — pick a slice')

    await pickRow($, 'ui')
    expect(world.filled).toEqual(['/wf plan alpha-flow ui '])
    expect(textOf(await $.ui.render(BAND))).not.toContain('pick a')
  })

  test('a "(no slice)" row fills the key and the slug alone', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await run($, 'wf-verify', 'alpha-flow')
    expect(textOf(await $.ui.render(BAND))).toContain('(no slice)')
    await pickRow($, '-')
    expect(world.filled).toEqual(['/wf verify alpha-flow '])
  })

  test('the key list pages nine rows at a time under twelve with the strip, and the "more" key turns the page', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')

    const first = textOf(await $.ui.render(BAND))
    expect(first).toContain('(page 1 of 3)')
    expect(first).toContain('intake  ')
    expect(first).toContain('ship  ')
    expect(first).not.toContain('retro  ')
    expect(first).toContain('more')

    await $.ui.press({ plugin: PLUGIN_NAME, key: MORE_KEY })
    const second = textOf(await $.ui.render(BAND))
    expect(second).toContain('(page 2 of 3)')
    expect(second).toContain('retro  ')
    expect(second).not.toContain('intake  ')

    await $.ui.press({ plugin: PLUGIN_NAME, key: MORE_KEY })
    expect(textOf(await $.ui.render(BAND))).toContain('(page 3 of 3)')
    await $.ui.press({ plugin: PLUGIN_NAME, key: MORE_KEY })
    expect(textOf(await $.ui.render(BAND))).toContain('(page 1 of 3)')

    // A new step starts on its first page.
    await pickRow($, 'plan')
    await $.ui.press({ plugin: PLUGIN_NAME, key: CLOSE_KEY })
    await run($, 'wf')
    expect(textOf(await $.ui.render(BAND))).toContain('(page 1 of 3)')
  })

  test('a short band shrinks the page so every row keeps a hotkey', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')
    const short = { ...BAND, props: { ...BAND.props, maxRows: 6, scroll: { offset: 0, bodyRows: 5 } } }
    const tree = await $.ui.render(short)
    expect(hotkeysOf(tree)).toEqual(['0', '1', '2', '3'])
    expect(textOf(tree)).toContain('(page 1 of 8)')
  })

  test('a tall band still pages nine rows, one digit each, and never arms a letter', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')
    const tall = { ...BAND, props: { ...BAND.props, maxRows: 40, scroll: { offset: 0, bodyRows: 39 } } }
    const tree = await $.ui.render(tall)
    expect(hotkeysOf(tree)).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(textOf(tree)).toContain('(page 1 of 3)')
    expect(textOf(tree)).not.toContain('observability  ')
  })

  test('the back button returns to the step before, and the key step has none', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')
    expect(textOf(await $.ui.render(BAND))).not.toContain('← back')
    await pickRow($, 'plan')
    await $.ui.render(BAND)
    await pickRow($, 'alpha-flow')
    expect(textOf(await $.ui.render(BAND))).toContain('/wf plan alpha-flow — pick a slice')
    await $.ui.press({ plugin: PLUGIN_NAME, key: BACK_KEY })
    expect(textOf(await $.ui.render(BAND))).toContain('/wf plan — pick a workflow')
    await $.ui.press({ plugin: PLUGIN_NAME, key: BACK_KEY })
    await $.ui.render(BAND)
    const tree = textOf(await $.ui.render(BAND))
    expect(tree).toContain('/wf — pick a key')
    expect(tree).not.toContain('← back')
  })

  test('the wheel over the band turns the page either way, and the window stays', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')
    expect(textOf(await $.ui.render(BAND))).toContain('(page 1 of 3)')

    expect(await wheel($, 1)).toEqual({})
    expect(textOf(await $.ui.render(BAND))).toContain('(page 2 of 3)')
    await wheel($, 3)
    expect(textOf(await $.ui.render(BAND))).toContain('(page 3 of 3)')
    await wheel($, -1)
    expect(textOf(await $.ui.render(BAND))).toContain('(page 2 of 3)')
    await wheel($, -1)
    await wheel($, -1)
    expect(textOf(await $.ui.render(BAND))).toContain('(page 3 of 3)')
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
    expect(textOf(await $.ui.render(BAND))).toContain('(page 1 of 3)')

    // From the last row (ship) a move onto a title control is Tab past the end.
    await ringTo($, `${OPTION_KEY_PREFIX}ship`)
    world.focused.length = 0
    await ringTo($, MORE_KEY)
    expect(textOf(await $.ui.render(BAND))).toContain('(page 2 of 3)')
    expect(world.focused).toEqual([`${OPTION_KEY_PREFIX}retro`])

    // From the first row of page 2 a move onto the field is Shift+Tab before the start.
    await ringTo($, FILTER_KEY)
    expect(textOf(await $.ui.render(BAND))).toContain('(page 1 of 3)')
    expect(world.focused).toEqual([`${OPTION_KEY_PREFIX}retro`, `${OPTION_KEY_PREFIX}ship`])

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
    await run($, 'wf-plan')
    const tree = await $.ui.render(BAND)
    expect(hotkeysOf(tree)).toEqual(['1', '2'])
    expect(elementOf(tree, MORE_KEY)).toBeNull()
    expect(textOf(tree)).not.toContain('(page')
  })

  test('without .ai/workflows the workflow step says so', async ($, on) => {
    seat(on, {})
    await $.session.start(SESSION)
    await run($, 'wf-plan')
    const text = textOf(await $.ui.render(BAND))
    expect(text).toContain('No .ai/workflows directory')
  })

  test('the strip shows the newest workflow with its stage, slice count, next step, and cost', async ($, on) => {
    const world = seat(on, { ...TREE, ...HUB_CONFIG, ...LEDGER })
    world.mtimes.set('/work/.ai/workflows/alpha-flow/00-index.md', 5_000_000)
    await $.session.start(SESSION)
    const text = textOf(await $.ui.render(BAND))
    expect(text).toContain('wf alpha-flow · implement · slice auth (1 of 2 complete) · next: /wf verify alpha-flow auth')
    expect(text).toContain('2k tokens workflow')
    expect(text).not.toContain('sdlc hub')
    expect(text).not.toContain('this stage')
    expect(world.statuses.at(-1)).toBe('next /wf verify alpha-flow auth · hub 9.157.0')
    await $.ui.render(MODE)
    expect(modesOf(world.props)).toEqual(['focus', 'wf:implement'])
  })

  test('the rotate button and /wf-active walk every workflow, active first; the strip wraps to the band width', async ($, on) => {
    const world = seat(on, {
      ...TREE,
      ...HUB_CONFIG,
      '/work/.ai/workflows/gamma/00-index.md': '---\nslug: gamma\nstatus: active\ncurrent-stage: plan\nselected-slice: core\nnext-invocation: /wf implement gamma core\n---\n',
    })
    world.mtimes.set('/work/.ai/workflows/alpha-flow/00-index.md', 5_000_000)
    await $.session.start(SESSION)
    let text = textOf(await $.ui.render(BAND))
    expect(text).toContain('wf alpha-flow · implement')
    expect(text).toContain('⇄ 2 more')
    await $.ui.press({ plugin: PLUGIN_NAME, key: 'wf-strip-rotate' })
    text = textOf(await $.ui.render(BAND))
    expect(text).toContain('wf gamma · plan · slice core')
    expect(world.statuses.at(-1)).toBe('next /wf implement gamma core · hub 9.157.0')
    await $.ui.press({ plugin: PLUGIN_NAME, key: 'wf-strip-rotate' })
    expect(textOf(await $.ui.render(BAND))).toContain('wf beta · closed (closed)')
    await $.ui.press({ plugin: PLUGIN_NAME, key: 'wf-strip-rotate' })
    expect(textOf(await $.ui.render(BAND))).toContain('wf alpha-flow · implement')
    const { text: said } = await run($, 'wf-active', 'gamma')
    expect(said).toBe('The strip shows gamma.')
    expect(textOf(await $.ui.render(BAND))).toContain('wf gamma')
    expect((await run($, 'wf-active', 'nope')).text).toContain('No workflow named nope')
    // A narrow band: the strip takes more rows and the key list pages fewer.
    const narrow = { ...BAND, props: { ...BAND.props, bodyColumns: 40, maxRows: 12 } }
    await run($, 'wf')
    expect(hotkeysOf(await $.ui.render(narrow)).length).toBeLessThan(hotkeysOf(await $.ui.render(BAND)).length)
  })

  test('the active workflow survives a session restart, and the strip never opens on a closed one', async ($, on) => {
    const world = seat(on)
    // The closed workflow's index is the newest file: the strip still opens on the active one.
    world.mtimes.set('/work/.ai/workflows/beta/00-index.md', 9_000_000)
    world.mtimes.set('/work/.ai/workflows/alpha-flow/00-index.md', 5_000_000)
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(BAND))).toContain('wf alpha-flow · implement')
    await run($, 'wf-active', 'beta')
    expect(textOf(await $.ui.render(BAND))).toContain('wf beta · closed (closed)')
    // A reload (a /config change) or the next session starts on the remembered workflow.
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(BAND))).toContain('wf beta · closed (closed)')
  })

  test('a /wf run names the active workflow, and the strip draws under the picker', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await run($, 'wf-status', 'beta')
    const text = textOf(await $.ui.render(BAND))
    expect(text).toContain('wf beta · closed (closed)')
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
    expect(world.suggested).toEqual([])
    expect(world.compacted).toEqual([])
    await world.clock.advance(1)
    await settle()
    // The compaction runs first, then the suggestion is proposed on the compacted session.
    expect(world.toasts).toEqual(['wf: compacting after implement (context 62%)'])
    expect(world.compacted).toHaveLength(1)
    expect(world.compacted[0]).toBe(
      'The /wf implement stage of workflow alpha-flow is complete. Keep the workflow slug alpha-flow, the selected slice auth, the next invocation /wf verify alpha-flow auth. Keep the paths of the artifacts written this turn: /work/.ai/workflows/alpha-flow/05-implement-auth.md. Keep verbatim every decision, acceptance criterion, blocker, and answer the person gave that is not yet written to an artifact. Drop tool output, test logs, and file contents; the next stage re-reads the artifacts from disk.',
    )
    expect(world.suggested).toEqual(['/wf verify alpha-flow auth'])
    expect(textOf(await $.ui.render(BAND))).toContain('$0.42 this stage')
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

  test('a vetoed compaction logs the reason and still suggests; a refused call is retried once', async ($, on) => {
    const world = seat(on, { ...TREE })
    await $.session.start(SESSION)
    world.compactAnswers = ['skip']
    await turn($, '/wf implement alpha-flow auth', ['/work/.ai/workflows/alpha-flow/05-implement-auth.md'])
    await world.clock.advance(1)
    await settle()
    expect(world.compacted).toHaveLength(1)
    expect(world.logged.at(-1)).toBe('wf: compaction skipped: off')
    expect(world.suggested).toEqual(['/wf verify alpha-flow auth'])
    world.compactAnswers = ['reject', 'done']
    await turn($, '/wf verify alpha-flow auth', ['/work/.ai/workflows/alpha-flow/06-verify-auth.md'])
    await world.clock.advance(1)
    await settle()
    expect(world.compacted).toHaveLength(2)
    expect(world.logged.at(-1)).toContain('wf: compaction refused: ')
    expect(world.suggested).toHaveLength(1)
    await world.clock.advance(500)
    await settle()
    expect(world.compacted).toHaveLength(3)
    expect(world.suggested).toEqual(['/wf verify alpha-flow auth', '/wf verify alpha-flow auth'])
    world.compactAnswers = ['reject']
    await turn($, '/wf implement alpha-flow auth', ['/work/.ai/workflows/alpha-flow/05-implement-auth.md', '/work/.ai/workflows/alpha-flow/x.md'])
    await world.clock.advance(1)
    await settle()
    await world.clock.advance(500)
    await settle()
    expect(world.compacted).toHaveLength(5)
    expect(world.logged.filter(line => line.startsWith('wf: compaction refused')).length).toBe(3)
    expect(world.suggested).toHaveLength(3)
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

  test('the driver status follows the heartbeat journal during a yolo turn', async ($, on) => {
    const tree: Record<string, string> = { ...TREE, ...HUB_CONFIG }
    const world = seat(on, tree)
    const clock = world.clock
    await clock.set(10_000_000)
    await $.session.start(SESSION)
    await $.turn.start({ text: '/wf yolo alpha-flow', turnId: 't3' })
    expect(world.statuses.at(-1)).toBe('yolo · no driver journal')
    const at = (ms: number) => new Date(ms).toISOString()
    tree['/work/.ai/workflows/alpha-flow/.driver-journal.jsonl'] =
      `{"at":"${at(clock.now() - 600_000)}","run":"r3","seq":1,"event":"start","agent":"a1","phase":"stage","stage":"implement","slice":"auth"}\n{"at":"${at(clock.now() - 120_000)}","run":"r3","seq":2,"event":"finish","agent":"a1","phase":"stage","stage":"implement","slice":"auth"}\n`
    await clock.advance(5_000)
    expect(world.statuses.at(-1)).toMatch(/^yolo · run r3 · implement auth · agent a1 · \d+ min · last beat 2 min ago$/u)
    // The driver runs in the background: the watch outlives the turn, and a write's refresh keeps the driver line.
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' })
    await $.tool.call({ tool: 'Write', file_path: '/work/.ai/workflows/alpha-flow/05-implement-auth.md', content: 'x' })
    expect(world.statuses.at(-1)).toMatch(/^yolo · run r3/u)
    await clock.advance(5_000)
    expect(world.statuses.at(-1)).toMatch(/last beat 2 min ago$/u)
    // Silence past the 20-minute floor: presumed dead, one toast, and the watch stops.
    await clock.advance(20 * 60_000)
    expect(world.statuses.at(-1)).toMatch(/^yolo · presumed dead since \d\d:\d\d · last: implement auth$/u)
    expect(world.toasts).toEqual([expect.stringMatching(/^wf yolo alpha-flow: driver presumed dead since/u)])
    const after = world.statuses.length
    await clock.advance(60_000)
    expect(world.statuses.length).toBe(after)
    expect(world.toasts).toHaveLength(1)
    // The next turn hands the status line back to the strip.
    await $.turn.start({ text: 'hello', turnId: 't4' })
    expect(world.statuses.at(-1)).toBe('next /wf verify alpha-flow auth · $0.00 stage · hub 9.157.0')
  })

  test('the hub line draws under the logo, and a state change is one toast', async ($, on) => {
    const world = seat(on, { ...TREE, ...HUB_CONFIG })
    const clock = world.clock
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(NOTICE))).toBe('model: sonnet sdlc hub 9.157.0 · 3 repos · 2 renders stale · /wf-doctor')
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
    expect(textOf(await $.ui.render(NOTICE))).toBe('model: sonnet sdlc hub down · /wf-doctor')
    world.hub = HUB_HEALTH
    await clock.advance(60_000)
    expect(world.toasts).toHaveLength(3)
  })

  test('the hub line joins one notice only, and keeps the engine\'s command', async ($, on) => {
    seat(on, { ...TREE, ...HUB_CONFIG })
    await $.session.start(SESSION)
    const first = { ...NOTICE, requestId: 'n1', props: { text: 'model: sonnet', command: '/model' } }
    const second = { ...NOTICE, requestId: 'n2', props: { text: 'tip', command: null } }
    expect(textOf(await $.ui.render(first))).toBe('model: sonnet /model sdlc hub 9.157.0 · 3 repos · 2 renders stale · /wf-doctor')
    expect(textOf(await $.ui.render(second))).toBe('')
  })

  test('without a hub config the notice is the engine\'s own', async ($, on) => {
    seat(on, { '/work/.ai/workflows/beta/00-index.md': '---\nslug: beta\nstatus: closed\n---\n' })
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(NOTICE))).toBe('')
  })

  test('/wf-dashboard opens the pane; its rows fill a status command or open the picker', async ($, on) => {
    const world = seat(on, { ...TREE, ...HUB_CONFIG, ...LEDGER })
    await $.session.start(SESSION)
    const { text } = await run($, 'wf-dashboard')
    expect(text).toContain('dashboard is open')
    expect(world.opened).toEqual(['wf-dashboard'])
    const pane = textOf(await $.ui.render(PANE))
    expect(pane).toContain('alpha-flow  active    implement   auth        /wf verify alpha-flow auth')
    expect(pane).toContain('beta        closed')
    expect(pane).toContain('alpha-flow slices   auth ▰▰▰ verified   ui ▱▱▱ defined')
    expect(pane).toContain('alpha-flow open findings 3 · ship-plan blockers 2 · hub 9.157.0 ok')

    await $.ui.press({ plugin: PLUGIN_NAME, key: 'wf-dash-status:beta' })
    expect(world.filled).toEqual(['/wf status beta '])
    await $.ui.press({ plugin: PLUGIN_NAME, key: 'wf-dash-pick:alpha-flow' })
    expect(textOf(await $.ui.render(BAND))).toContain('/wf plan alpha-flow — pick a slice')
  })

  test('a surfaceless session binds the host, registers the commands, and draws nothing', async ($, on) => {
    const world = seat(on, { ...TREE })
    world.surfaces = []
    let ran = 0
    on('command.run', () => {
      ran += 1
      return { text: 'passed on' }
    })
    await $.session.start(SDK_SESSION)
    // Claude Code Desktop runs the engine through the SDK: no surface, no
    // person at the prompt. The module still binds and registers.
    expect(world.registered).toEqual([...CATALOG.map(entry => `wf-${entry.key}`), 'wf-dashboard', 'wf-active'])
    // The band never draws, so the picker never opens: the command runs as typed.
    expect(await run($, 'wf')).toEqual({ text: 'passed on' })
    expect(ran).toBe(1)
    expect(textOf(await $.ui.render(DESKTOP_BAND))).toBe('')
    expect(world.statuses).toEqual([])
    expect(await run($, 'wf-dashboard')).toEqual({ text: 'The workflows dashboard draws in the terminal only; this session draws elsewhere.' })
    expect(world.opened).toEqual([])
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

  test('the probe journal records the load, the commands, the turn, and the compaction', async ($, on) => {
    const world = seat(on, { ...TREE })
    world.surfaces = []
    await $.session.start(SDK_SESSION)
    await settle()
    const load = probeRows(world)
    expect(load[0]).toMatchObject({ event: 'load', ok: true, host: 'cli', session: 'abcdef01' })
    expect(load[0]?.['detail']).toContain('root /work')
    expect(load[1]).toMatchObject({ event: 'commands', ok: true, detail: '24/24' })
    await turn($, '/wf implement alpha-flow auth', ['/work/.ai/workflows/alpha-flow/05-implement-auth.md'])
    await world.clock.advance(1)
    await settle()
    const rows = probeRows(world)
    expect(rows.find(row => row['event'] === 'turn')).toMatchObject({ ok: true, detail: 'implement alpha-flow · landed true · compact' })
    expect(rows.find(row => row['event'] === 'compact')).toMatchObject({ ok: true, detail: 'done' })
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
    expect(probeRows(world).find(row => row['event'] === 'turn')).toMatchObject({ detail: 'implement alpha-flow · landed true · compact' })
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
