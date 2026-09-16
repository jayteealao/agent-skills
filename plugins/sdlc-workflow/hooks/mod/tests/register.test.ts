import type { On, RenderElement, RenderInput } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

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

/** A repository with one active workflow of two slices and one closed workflow. */
const TREE: Record<string, string> = {
  '/work/.ai/workflows/alpha-flow/00-index.md':
    '---\nslug: alpha-flow\nstatus: active\ncurrent-stage: implement\nselected-slice: auth\n---\n',
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
}

/** The world beneath the mod: a session in /work, the tree above, an empty band. */
function seat(on: On, tree: Record<string, string> = TREE): World {
  const world: World = { registered: [], filled: [], logged: [], focused: [] }
  const dirs = new Set<string>()
  for (const file of Object.keys(tree)) {
    const parts = file.split('/')
    for (let i = 2; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/'))
  }
  // The engine resolves a path against the process's working directory before
  // a hook sees it: on Windows "/work" arrives as "C:\work". Strip the drive.
  const normal = (path: string) => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/\/+$/, '')

  mock.clock(on)
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
  on('ui.status', () => ({ value: undefined }))
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
    return Box({}) as RenderElement
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
    expect(world.registered).toEqual(CATALOG.map(entry => `wf-${entry.key}`))
    expect(world.registered).toHaveLength(22)
  })

  test('a bare /wf opens the key list; /wf <key> opens the workflow list', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    expect(textOf(await $.ui.render(BAND))).toBe('')

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
    expect(textOf(await $.ui.render(BAND))).toBe('')
  })

  test('a workflow without a roster skips the slice step', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    const { text } = await run($, 'wf-verify', 'beta')
    expect(text).toContain('Press Enter to run /wf verify beta')
    expect(world.filled).toEqual(['/wf verify beta '])
    expect(textOf(await $.ui.render(BAND))).toBe('')
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
    expect(textOf(await $.ui.render(BAND))).toBe('')
  })

  test('the close button and a submitted prompt both close the band', async ($, on) => {
    seat(on)
    on('prompt.submit', ($, e) => ({ text: e.text }))
    await $.session.start(SESSION)

    await run($, 'wf')
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key')
    await $.ui.press({ plugin: PLUGIN_NAME, key: CLOSE_KEY })
    expect(textOf(await $.ui.render(BAND))).toBe('')

    await run($, 'wf')
    expect(textOf(await $.ui.render(BAND))).toContain('pick a key')
    await $.prompt.submit({ text: 'hello', wait: false, origin: { kind: 'composer' } })
    expect(textOf(await $.ui.render(BAND))).toBe('')
  })

  test('a digit row picks: key, then workflow, then slice, and the last pick fills the prompt', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)

    await run($, 'wf')
    expect(hotkeysOf(await $.ui.render(BAND))).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a'])
    await pickRow($, 'plan')
    expect(textOf(await $.ui.render(BAND))).toContain('/wf plan — pick a workflow')
    expect(world.filled).toEqual([])

    await pickRow($, 'alpha-flow')
    expect(textOf(await $.ui.render(BAND))).toContain('/wf plan alpha-flow — pick a slice')

    await pickRow($, 'ui')
    expect(world.filled).toEqual(['/wf plan alpha-flow ui '])
    expect(textOf(await $.ui.render(BAND))).toBe('')
  })

  test('a "(no slice)" row fills the key and the slug alone', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await run($, 'wf-verify', 'alpha-flow')
    expect(textOf(await $.ui.render(BAND))).toContain('(no slice)')
    await pickRow($, '-')
    expect(world.filled).toEqual(['/wf verify alpha-flow '])
  })

  test('the key list pages ten rows at a time under twelve, and the "more" key turns the page', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await run($, 'wf')

    const first = textOf(await $.ui.render(BAND))
    expect(first).toContain('(page 1 of 3)')
    expect(first).toContain('intake  ')
    expect(first).toContain('retro  ')
    expect(first).not.toContain('design  ')
    expect(first).toContain('more')

    await $.ui.press({ plugin: PLUGIN_NAME, key: MORE_KEY })
    const second = textOf(await $.ui.render(BAND))
    expect(second).toContain('(page 2 of 3)')
    expect(second).toContain('design  ')
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
    expect(hotkeysOf(tree)).toEqual(['0', '1', '2', '3', '4'])
    expect(textOf(tree)).toContain('(page 1 of 6)')
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
    expect(textOf(await $.ui.render(BAND))).toBe('')
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

    // From the last row (retro) a move onto a title control is Tab past the end.
    await ringTo($, `${OPTION_KEY_PREFIX}retro`)
    world.focused.length = 0
    await ringTo($, MORE_KEY)
    expect(textOf(await $.ui.render(BAND))).toContain('(page 2 of 3)')
    expect(world.focused).toEqual([`${OPTION_KEY_PREFIX}design`])

    // From the first row of page 2 a move onto the field is Shift+Tab before the start.
    await ringTo($, FILTER_KEY)
    expect(textOf(await $.ui.render(BAND))).toContain('(page 1 of 3)')
    expect(world.focused).toEqual([`${OPTION_KEY_PREFIX}design`, `${OPTION_KEY_PREFIX}retro`])

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
