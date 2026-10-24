import type { On } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'

tier('user')

const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const
const ARM = '/work/.ai/workflows/alpha/goal/arm.json'
const REQUEST = JSON.stringify({ slug: 'alpha', host: 'claude-code', arming: 1, condition: 'The goal is met only when the check passes.', command: '/goal The goal is met only when the check passes.', requestedAt: '2026-10-24T10:00:00Z', state: 'pending' })

type World = {
  filled: string[]
  submitted: string[]
  toasts: string[]
  logged: string[]
  written: Map<string, string>
  clock: MockClock
}

/** The world beneath the mod: a session in /work with one goal slug, and what the prompt box answers. */
// The Desktop hand-over (`no_composer`, then a submit) is an engine answer no hook can give;
// tests/unit/mod/goal-arm.harness.mjs covers `armHowOf` for it.
function seat(on: On, fill: { isFilled: boolean } = { isFilled: true }): World {
  const tree: Record<string, string> = { '/work/.ai/workflows/alpha/00-index.md': '---\nslug: alpha\n---\n', [ARM]: REQUEST }
  const world: World = { filled: [], submitted: [], toasts: [], logged: [], written: new Map(), clock: null as unknown as MockClock }
  // The engine resolves a path against the process's working directory before
  // a hook sees it: on Windows "/work" arrives as "C:\work". Strip the drive.
  const normal = (path: string) => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/\/+$/, '')
  const dirs = new Set(['/work', '/work/.ai', '/work/.ai/workflows', '/work/.ai/workflows/alpha', '/work/.ai/workflows/alpha/goal'])
  world.clock = mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('fs.exists', ($, e) => ({ value: dirs.has(normal(e.path)) || normal(e.path) in tree || world.written.has(normal(e.path)) }))
  on('fs.read', ($, e) => {
    const text = world.written.get(normal(e.path)) ?? tree[normal(e.path)]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('fs.write', ($, e) => {
    world.written.set(normal(e.path), e.text)
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', ($, e) => {
    world.logged.push(e.text)
    return { value: undefined }
  })
  on('prompt.fill', ($, e) => {
    world.filled.push(e.text)
    return fill
  })
  on('prompt.submit', ($, e) => {
    world.submitted.push(e.text)
    return { text: e.text }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('command.run', ($, e) => ({ text: e.args }))
  return world
}

/** A main turn from a typed prompt: start, then the end. */
async function turn($: Engine, text: string, reason: 'answer' | 'aborted' = 'answer'): Promise<void> {
  await $.turn.start({ text, turnId: 't' })
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: reason === 'aborted', turnId: 't', reason })
}

/** Lets the timer the hand-over waits on, and its promise chain, run to their end. */
async function settle(world: World): Promise<void> {
  await world.clock.advance(1)
  for (let i = 0; i < 200; i += 1) await Promise.resolve()
}

const stateOf = (world: World) => (JSON.parse(world.written.get(ARM) ?? '{}') as { state?: string }).state

describe('register', () => {
  test('a /wf loop goal turn puts the /goal line into the prompt box and records it', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await turn($, '/wf loop goal alpha')
    await settle(world)
    expect(world.filled).toEqual(['/goal The goal is met only when the check passes. '])
    expect(stateOf(world)).toBe('filled')
    expect(world.toasts.at(-1)).toContain('Press Enter')
  })

  test('a busy prompt box arms nothing and prints the line to paste', async ($, on) => {
    const world = seat(on, { isFilled: false })
    await $.session.start(SESSION)
    await turn($, '/wf loop goal alpha')
    await settle(world)
    expect(world.submitted).toEqual([])
    expect(stateOf(world)).toBe('refused')
    expect(world.logged.at(-1)).toContain('/goal The goal is met')
  })

  test('the dispatcher run names the turn whose text is the expanded skill', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await $.command.run({ command: 'wf', args: 'loop goal alpha', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
    await turn($, 'Base directory for this skill: ...')
    await settle(world)
    expect(stateOf(world)).toBe('filled')
  })

  test('a request is handed over once; another key, an aborted turn and a sub-agent arm nothing', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await turn($, '/wf plan alpha')
    await turn($, '/wf loop goal alpha', 'aborted')
    await $.turn.start({ text: '/wf loop goal alpha', turnId: 'm' })
    await $.turn.complete({ answer: 'sub done', durationMs: 1, isAborted: false, turnId: 's', reason: 'answer', agentId: 'agent-1' })
    await settle(world)
    expect(world.filled).toEqual([])
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 'm', reason: 'answer' })
    await settle(world)
    await turn($, '/wf loop goal alpha')
    await settle(world)
    expect(world.filled).toHaveLength(1)
  })
})
