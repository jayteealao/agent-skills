import type { On, RenderElement, SessionMessage } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { PLUGIN_NAME } from '../names.ts'
import type { RequiresEntry } from '../readledger.ts'
import { REQUIRES_STORE_KEY } from '../register.ts'

tier('user')

// The read check (ARTIFACT-SPLIT-PLAN.md S6, W4): the mod records Reads per
// agent and checks a stage-artifact write against a fixture Requires table,
// never the generated one, so these tests do not follow the stage references.

const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const
const SUMMARY: SessionMessage = { role: 'assistant', text: 'summary', toolUses: [] }
const MESSAGE: SessionMessage = { role: 'user', text: 'hello', toolUses: [] }

const FIXTURE: RequiresEntry[] = [
  {
    reference: 'fixture/plan.md',
    stage: 'plan',
    rows: [
      { input: '00-index.md', kind: 'artifact', when: 'always', sections: [] },
      { input: '02-shape.md', kind: 'artifact', when: 'always', sections: [] },
      { input: 'po-answers.md', kind: 'artifact', when: 'if-present', sections: [] },
      { input: '03-slice-<slice>.md', kind: 'artifact', when: 'always', sections: ['Acceptance Criteria'] },
      { input: 'steer.md', kind: 'artifact', when: 'on-resume', sections: [] },
      { input: 'plan/_artifact.md', kind: 'procedure', when: 'always', sections: [] },
      { input: '04-plan-<slice>.md', kind: 'writes', when: '', sections: [] },
    ],
  },
]

const W = '/work/.ai/workflows/alpha-flow'
const REF = '/plugins/cache/sdlc-workflow/skills/wf/reference'
const LEDGER = `${W}/.read-ledger.jsonl`
const PLAN = `${W}/04-plan-auth.md`

const TREE: Record<string, string> = {
  [`${W}/00-index.md`]: '---\nslug: alpha-flow\nstatus: active\ncurrent-stage: plan\nselected-slice: auth\nnext-invocation: /wf implement alpha-flow auth\n---\n',
  [`${W}/03-slice.md`]: '---\nslices:\n  - slug: auth\n    status: defined\n---\n',
  [`${W}/02-shape.md`]: '# Shape\n\n## Acceptance Criteria\n\n- one\n- two\n\n## Out of Scope\n\n- three\n',
  [`${W}/03-slice-auth.md`]: '---\nslice: auth\n---\n# Slice auth\n\n## Why\n\nreasons\n\n## Acceptance Criteria\n\n- AC1\n- AC2\n\n## Notes\n\nmore\n',
  [`${REF}/plan/_artifact.md`]: '# Plan artifact\n\nline\nline\n',
  [`${REF}/fixture/slice.md`]: '# Slice\n',
  [`${REF}/fixture/plan.md`]: '# Plan stage\n',
  [`${REF}/fixture/task.md`]: '# Task stage\n',
  [`${REF}/fixture/implement.md`]: '# Implement stage\n',
  [`${REF}/fixture/context.md`]: '# Intake context\n',
}

/** A task stage and an implement stage: only task lists the master `05-implement.md`. */
const MASTERS: RequiresEntry[] = [
  {
    reference: 'fixture/task.md',
    stage: 'task',
    rows: [
      { input: 'fixture/context.md', kind: 'procedure', when: 'always', sections: [] },
      { input: '05-implement.md', kind: 'writes', when: '', sections: [] },
    ],
  },
  {
    reference: 'fixture/implement.md',
    stage: 'implement',
    rows: [
      { input: '02-shape.md', kind: 'artifact', when: 'always', sections: [] },
      { input: '05-implement-<slice>.md', kind: 'writes', when: '', sections: [] },
    ],
  },
  {
    reference: 'fixture/plan.md',
    stage: 'plan',
    rows: [
      { input: '02-shape.md', kind: 'artifact', when: 'always', sections: [] },
      { input: '04-plan.md', kind: 'artifact', when: 'if-present', sections: [] },
      { input: '04-plan.md', kind: 'writes', when: '', sections: [] },
    ],
  },
]

type World = { written: Map<string, string>; tree: Record<string, string> }

const normal = (path: string) => path.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '').replace(/\/+$/, '')

function seat(on: On, requires: readonly RequiresEntry[] = FIXTURE): World {
  const tree: Record<string, string> = { ...TREE }
  const world: World = { written: new Map(), tree }
  const dirs = () => {
    const found = new Set<string>()
    for (const file of Object.keys(tree)) {
      const parts = file.split('/')
      for (let i = 2; i < parts.length; i += 1) found.add(parts.slice(0, i).join('/'))
    }
    return found
  }
  mock.clock(on)
  mock.store(on, { [REQUIRES_STORE_KEY]: requires })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('fs.exists', ($, e) => ({ value: dirs().has(normal(e.path)) || normal(e.path) in tree || world.written.has(normal(e.path)) }))
  on('fs.list', ($, e) => {
    const dir = normal(e.path)
    if (!dirs().has(dir)) return { deny: `ENOENT: ${dir}` }
    const names = new Map<string, 'file' | 'dir'>()
    for (const file of Object.keys(tree)) {
      if (!file.startsWith(`${dir}/`)) continue
      const rest = file.slice(dir.length + 1)
      names.set(rest.split('/')[0] as string, rest.includes('/') ? 'dir' : 'file')
    }
    return { value: [...names].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })) }
  })
  on('fs.read', ($, e) => {
    const text = tree[normal(e.path)] ?? world.written.get(normal(e.path))
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('fs.write', ($, e) => {
    world.written.set(normal(e.path), e.text)
    return { value: undefined }
  })
  on('fs.stat', ($, e) => {
    const path = normal(e.path)
    if (!(path in tree)) return { deny: `ENOENT: ${path}` }
    return { value: { kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false } }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return Box({}) as RenderElement
  })
  on('prompt.suggest', () => ({ isShown: true }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 0, window: 200000, percent: 10 }, rateLimits: [], cost: { usd: 1 } } }))
  on('session.compact', () => ({ messages: [SUMMARY], tokensBefore: 1000, tokensAfter: 100 }))
  on('env.get', ($, e) => ({ value: e.name === 'USERPROFILE' ? '/home' : undefined }))
  on('session.id', () => ({ value: 'abcdef0123456789' }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('http.fetch', () => ({ deny: 'ECONNREFUSED' }))
  on('config.set', ($, e) => ({ value: e.value }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('tool.call', { tool: 'Read' }, ($, e) => {
    const text = tree[normal(e.file_path)]
    if (text === undefined) return { deny: `ENOENT: ${e.file_path}` }
    const lines = text.split('\n')
    const startLine = e.offset ?? 1
    const numLines = Math.max(0, Math.min(e.limit ?? lines.length, lines.length - startLine + 1))
    return { result: { type: 'text', file: { filePath: e.file_path, content: lines.slice(startLine - 1, startLine - 1 + numLines).join('\n'), numLines, startLine, totalLines: lines.length } } }
  })
  on('tool.call', { tool: /^(?:Write|Edit|MultiEdit)$/u }, ($, e) => {
    const input = e as unknown as { file_path: string; content?: string; new_string?: string }
    tree[normal(input.file_path)] = input.content ?? input.new_string ?? 'edited'
    return { result: { filePath: input.file_path, success: true } }
  })
  on('tool.call', { tool: 'Agent' }, () => ({ result: { agentId: 'child', status: 'async_launched' } }))
  return world
}

const read = ($: Engine, path: string, agentId?: string, range: { offset?: number; limit?: number } = {}) =>
  $.tool.call({ tool: 'Read', file_path: path, ...range, ...(agentId === undefined ? {} : { agentId }) } as never)

const write = ($: Engine, path: string, content = '---\nslice: auth\n---\n# Plan\n', agentId?: string) =>
  $.tool.call({ tool: 'Write', file_path: path, content, ...(agentId === undefined ? {} : { agentId }) } as never)

/** The context lines a tool result carries, joined. */
const contextOf = (result: unknown): string => (((result as { context?: readonly string[] }).context ?? []) as readonly string[]).join('\n')

const ledgerRows = (world: World): Array<Record<string, unknown>> =>
  (world.written.get(LEDGER) ?? '')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line) as Record<string, unknown>)

const setReadCheck = ($: Engine, value: string) =>
  $.config.set({ key: `${PLUGIN_NAME}.readCheck`, value, previous: 'warn', provider: { plugin: PLUGIN_NAME, tier: 'user' }, origin: { kind: 'composer' } })

/** Agent A reads its stage reference and everything the fixture requires except the named files. */
async function readAllBut($: Engine, agentId: string | undefined, skip: readonly string[] = []): Promise<void> {
  for (const path of [`${REF}/fixture/plan.md`, `${W}/00-index.md`,`${W}/02-shape.md`, `${W}/03-slice-auth.md`, `${REF}/plan/_artifact.md`]) {
    if (skip.some(name => path.endsWith(name))) continue
    await read($, path, agentId)
  }
}

describe('read check', () => {
  test('a stage write with an unread input succeeds and returns the missing list as context', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    // The main loop's read does not count for agent A.
    await read($, `${W}/02-shape.md`)
    await readAllBut($, 'A', ['02-shape.md'])
    const result = await write($, PLAN, undefined, 'A')
    const text = contextOf(result)
    expect(text).toContain('02-shape.md')
    expect(text).toContain('fixture/plan.md')
    expect(text).toContain('write 04-plan-auth.md again')
    expect(text).not.toContain('po-answers.md')
    expect(text).not.toContain('steer.md')
    expect(text).not.toContain('read-waiver')
    expect((result as { deny?: string }).deny).toBeUndefined()
    expect(world.tree[PLAN]).toContain('# Plan')
    expect(ledgerRows(world)).toEqual([
      { at: expect.any(String), agentId: 'A', stage: 'plan', artifact: '04-plan-auth.md', missing: ['02-shape.md'], partial: [], waiver: null },
    ])
    expect(world.written.has(`${W}/.driver-journal.jsonl`)).toBe(false)
  })

  test('a write with every input read carries no context, and still writes one ledger row', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await readAllBut($, 'A')
    const result = await write($, PLAN, undefined, 'A')
    expect(contextOf(result)).toBe('')
    expect(ledgerRows(world)).toHaveLength(1)
    expect(ledgerRows(world)[0]).toMatchObject({ missing: [], partial: [], waiver: null })
  })

  test('a partial read counts as partial until a second read covers the rest', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await readAllBut($, 'A', ['02-shape.md'])
    await read($, `${W}/02-shape.md`, 'A', { limit: 3 })
    const first = contextOf(await write($, PLAN, undefined, 'A'))
    expect(first).toContain('Read only in part')
    expect(first).toContain('02-shape.md')
    expect(ledgerRows(world)[0]).toMatchObject({ missing: [], partial: ['02-shape.md'] })
    await read($, `${W}/02-shape.md`, 'A', { offset: 4 })
    expect(contextOf(await write($, PLAN, undefined, 'A'))).toBe('')
  })

  test('a read that covers only the named section counts; one that misses it is partial', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await readAllBut($, 'A', ['03-slice-auth.md'])
    // Lines 1-9 hold the frontmatter and `## Why`; the Acceptance Criteria section is lines 10-14.
    await read($, `${W}/03-slice-auth.md`, 'A', { limit: 9 })
    expect(contextOf(await write($, PLAN, undefined, 'A'))).toContain('03-slice-auth.md')
    await read($, `${W}/03-slice-auth.md`, 'A', { offset: 10, limit: 5 })
    expect(contextOf(await write($, PLAN, undefined, 'A'))).toBe('')
    expect(ledgerRows(world).map(row => row['partial'])).toEqual([['03-slice-auth.md'], []])
  })

  test('a tracked read journals one probe row per agent loop', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await read($, `${W}/02-shape.md`, 'A')
    await read($, `${W}/00-index.md`, 'A')
    await read($, `${W}/02-shape.md`)
    for (let i = 0; i < 5000; i += 1) await Promise.resolve()
    const rows = (world.written.get('/home/.sdlc/mod-probe.jsonl') ?? '').split('\n').filter(line => line.includes('"event":"read"'))
    expect(rows).toHaveLength(2)
    expect(rows.join('\n')).toContain('agent A ')
    expect(rows.join('\n')).toContain('agent main ')
  })

  test('MultiEdit triggers the check', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await readAllBut($, 'A', ['00-index.md'])
    const result = await $.tool.call({ tool: 'MultiEdit', file_path: PLAN, edits: [{ old_string: 'a', new_string: 'b' }], agentId: 'A' } as never)
    expect(contextOf(result)).toContain('00-index.md')
    expect(ledgerRows(world)).toHaveLength(1)
  })

  test('sibling yaml, fragments, the index, history and the roster write-back are not checked', async ($, on) => {
    const world = seat(on, [...FIXTURE, { reference: 'fixture/slice.md', stage: 'slice', rows: [{ input: '02-shape.md', kind: 'artifact', when: 'always', sections: [] }, { input: '03-slice.md', kind: 'writes', when: '', sections: [] }] }])
    await $.session.start(SESSION)
    for (const path of [`${W}/04-plan-auth.yaml`, `${W}/04-plan-auth.explainer.html.fragment`, `${W}/00-index.md`, `${W}/history/04-plan-auth.md`, `${W}/03-slice.md`, `${W}/index-history.jsonl`]) {
      expect(contextOf(await write($, path, 'x', 'A'))).toBe('')
    }
    expect(world.written.has(LEDGER)).toBe(false)
  })

  test('the roster is checked for the slice stage writer, known by the reference it read', async ($, on) => {
    const world = seat(on, [...FIXTURE, { reference: 'fixture/slice.md', stage: 'slice', rows: [{ input: '02-shape.md', kind: 'artifact', when: 'always', sections: [] }, { input: '03-slice.md', kind: 'writes', when: '', sections: [] }] }])
    await $.session.start(SESSION)
    await read($, `${REF}/fixture/slice.md`, 'S')
    expect(contextOf(await write($, `${W}/03-slice.md`, '---\nslices: []\n---\n', 'S'))).toContain('02-shape.md')
    expect(ledgerRows(world)).toEqual([{ at: expect.any(String), agentId: 'S', stage: 'slice', artifact: '03-slice.md', missing: ['02-shape.md'], partial: [], waiver: null }])
  })

  test('block mode denies a write without a waiver and allows one with read-waiver', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await setReadCheck($, 'block')
    await readAllBut($, 'A', ['02-shape.md'])
    const denied = (await write($, PLAN, '---\nslice: auth\n---\n# Plan\n', 'A')) as { deny?: string }
    expect(denied.deny).toContain('02-shape.md')
    expect(denied.deny).toContain('read-waiver')
    expect(world.tree[PLAN]).toBeUndefined()
    const allowed = (await write($, PLAN, '---\nslice: auth\nread-waiver: "shape read by the parent"\n---\n# Plan\n', 'A')) as { deny?: string }
    expect(allowed.deny).toBeUndefined()
    expect(world.tree[PLAN]).toContain('read-waiver')
    expect(ledgerRows(world).map(row => row['waiver'])).toEqual([null, 'shape read by the parent'])
  })

  test('off mode checks nothing', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await setReadCheck($, 'off')
    expect(contextOf(await write($, PLAN, undefined, 'A'))).toBe('')
    expect(world.written.has(LEDGER)).toBe(false)
  })

  test('an input a dispatch prompt fed counts as read for the writer of the named output', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await $.tool.call({
      tool: 'Agent',
      description: 'plan auth',
      prompt: 'Write .ai/workflows/alpha-flow/04-plan-auth.md.\nPrompt-fed inputs: 02-shape.md, 00-index.md\n',
    } as never)
    await readAllBut($, 'B', ['02-shape.md', '00-index.md'])
    expect(contextOf(await write($, PLAN, undefined, 'B'))).toBe('')
  })

  test('a sub-agent ledger ends at its turn.complete', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await readAllBut($, 'A')
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 'sub', reason: 'answer', agentId: 'A' })
    await read($, `${REF}/fixture/plan.md`, 'A')
    expect(contextOf(await write($, PLAN, undefined, 'A'))).toContain('02-shape.md')
  })

  test('a write by an agent that read no stage reference, outside a /wf command, is not checked', async ($, on) => {
    const world = seat(on)
    await $.session.start(SESSION)
    await readAllBut($, 'A', ['fixture/plan.md', '02-shape.md'])
    expect(contextOf(await write($, PLAN, undefined, 'A'))).toBe('')
    expect(world.written.has(LEDGER)).toBe(false)
  })

  test('the file being written never counts as a missing input of its own stage', async ($, on) => {
    const world = seat(on, MASTERS)
    await $.session.start(SESSION)
    await read($, `${REF}/fixture/plan.md`, 'P')
    await read($, `${W}/02-shape.md`, 'P')
    const master = `${W}/04-plan.md`
    expect(contextOf(await write($, master, '# Plan\n', 'P'))).toBe('')
    // Again, now that the file exists before the write too.
    expect(contextOf(await write($, master, '# Plan v2\n', 'P'))).toBe('')
    expect(ledgerRows(world).map(row => [row['stage'], row['missing']])).toEqual([
      ['plan', []],
      ['plan', []],
    ])
  })

  test('a master file only another stage lists is not checked for an agent running implement; it is for one running task', async ($, on) => {
    const world = seat(on, MASTERS)
    await $.session.start(SESSION)
    await read($, `${REF}/fixture/implement.md`, 'I')
    await read($, `${W}/02-shape.md`, 'I')
    expect(contextOf(await write($, `${W}/05-implement.md`, '# Implement\n', 'I'))).toBe('')
    expect(world.written.has(LEDGER)).toBe(false)
    await read($, `${REF}/fixture/task.md`, 'T')
    const text = contextOf(await write($, `${W}/05-implement.md`, '# Task\n', 'T'))
    expect(text).toContain('fixture/context.md')
    expect(ledgerRows(world)).toEqual([{ at: expect.any(String), agentId: 'T', stage: 'task', artifact: '05-implement.md', missing: ['fixture/context.md'], partial: [], waiver: null }])
  })

  test('the main loop is checked against the stage its /wf command names', async ($, on) => {
    const world = seat(on, MASTERS)
    await $.session.start(SESSION)
    await $.turn.start({ text: '/wf task alpha-flow', turnId: 't1' })
    expect(contextOf(await write($, `${W}/05-implement.md`, '# Task\n'))).toContain('fixture/context.md')
    expect(ledgerRows(world).map(row => row['stage'])).toEqual(['task'])
  })

  test('a compaction mid-stage keeps the main ledger; one between stages clears it', async ($, on) => {
    seat(on)
    await $.session.start(SESSION)
    await $.turn.start({ text: '/wf plan alpha-flow auth', turnId: 't1' })
    await readAllBut($, undefined)
    await $.session.compact({ trigger: 'auto', messages: [MESSAGE] })
    expect(contextOf(await write($, PLAN))).toBe('')
    await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    await $.session.compact({ trigger: 'manual', messages: [MESSAGE] })
    await $.turn.start({ text: '/wf plan alpha-flow auth', turnId: 't2' })
    const again = contextOf(await write($, PLAN))
    expect(again).toContain('02-shape.md')
    expect(again).toContain('00-index.md')
  })
})
