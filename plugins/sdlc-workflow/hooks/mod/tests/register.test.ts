import type { On, RenderElement, RenderInput } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'

import { CATALOG } from '../catalog.ts'
import { CLOSE_KEY, FILTER_KEY, MORE_KEY, OPTION_KEY_PREFIX, PLUGIN_NAME } from '../names.ts'

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

const PRESENTATION = { isFullscreen: false, columns: 120 } as const

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
  /** The hub health body the fetch mock answers, or null for a dead hub. */
  hub: string | null
  /** Modification times by path, for the stat mock; absent paths are untouched. */
  mtimes: Map<string, number>
  clock: MockClock
  /** The props the bottom render hook last saw, after every rewrite above it. */
  props: unknown
}

/** The world beneath the mod: a session in /work, the tree above, an empty band. */
function seat(on: On, tree: Record<string, string> = TREE): World {
  const world: World = { registered: [], filled: [], logged: [], focused: [], toasts: [], suggested: [], statuses: [], opened: [], usd: 1, hub: HUB_HEALTH, mtimes: new Map(), clock: null as unknown as MockClock, props: null }
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
  on('fs.exists', ($, e) => ({ value: dirs.has(normal(e.path)) || normal(e.path) in tree }))
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
    const text = tree[normal(e.path)]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.scroll', () => ({}))
  on('ui.focus', ($, e) => {
    if (e.element !== undefined) world.focused.push(e.element)
    return {}
  })
  on('ui.status', ($, e) => {
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
  on('session.usage', () => ({ value: { context: { tokens: 0, window: 200000 }, rateLimits: [], cost: { usd: world.usd } } }))
  on('env.get', ($, e) => ({ value: e.name === 'USERPROFILE' ? '/home' : undefined }))
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

const setSetting = ($: Engine, name: string, value: boolean) =>
  $.config.set({ key: `sdlc-workflow.${name}`, value, previous: !value, provider: { plugin: PLUGIN_NAME, tier: 'user' }, origin: { kind: 'composer' } })

const modesOf = (props: unknown): string[] => ((props as { modes?: string[] })?.modes ?? [])
const wordOf = (props: unknown): string => ((props as { word?: string })?.word ?? '')

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

  test('a tall band draws every key at once: digits, then letters, and no "more" key', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')
    const tall = { ...BAND, props: { ...BAND.props, maxRows: 40, scroll: { offset: 0, bodyRows: 39 } } }
    const tree = await $.ui.render(tall)
    const keys = hotkeysOf(tree)
    expect(keys).toHaveLength(22)
    expect(keys.slice(0, 9)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
    expect(keys[9]).toBe('a')
    expect(keys[21]).toBe('m')
    expect(textOf(tree)).toContain('observability  ')
    expect(textOf(tree)).not.toContain('(page')
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
    expect(textOf(tree)).not.toContain('more')
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
    expect(text).toContain('2k tokens workflow · sdlc hub 9.157.0 · 3 repos · 2 renders stale')
    expect(text).not.toContain('this stage')
    expect(world.statuses.at(-1)).toBe('next /wf verify alpha-flow auth · hub 9.157.0')
    await $.ui.render(MODE)
    expect(modesOf(world.props)).toEqual(['focus', 'wf:implement'])
  })

  test('the rotate button and /wf-active walk the active workflows; the strip wraps to the band width', async ($, on) => {
    const world = seat(on, {
      ...TREE,
      ...HUB_CONFIG,
      '/work/.ai/workflows/gamma/00-index.md': '---\nslug: gamma\nstatus: active\ncurrent-stage: plan\nselected-slice: core\nnext-invocation: /wf implement gamma core\n---\n',
    })
    world.mtimes.set('/work/.ai/workflows/alpha-flow/00-index.md', 5_000_000)
    await $.session.start(SESSION)
    let text = textOf(await $.ui.render(BAND))
    expect(text).toContain('wf alpha-flow · implement')
    expect(text).toContain('⇄ 1 more')
    await $.ui.press({ plugin: PLUGIN_NAME, key: 'wf-strip-rotate' })
    text = textOf(await $.ui.render(BAND))
    expect(text).toContain('wf gamma · plan · slice core')
    expect(world.statuses.at(-1)).toBe('next /wf implement gamma core · hub 9.157.0')
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
    await world.clock.advance(1)
    expect(world.suggested).toEqual(['/wf verify alpha-flow auth'])
    expect(world.toasts).toEqual([])
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

  test('a non-terminal session registers nothing and passes every command on', async ($, on) => {
    const world = seat(on)
    let ran = 0
    on('command.run', () => {
      ran += 1
      return { text: 'passed on' }
    })
    await $.session.start({ surface: null, isInteractive: false, cwd: '/work' })
    expect(world.registered).toEqual([])
    expect(await run($, 'wf')).toEqual({ text: 'passed on' })
    expect(ran).toBe(1)
  })
})
