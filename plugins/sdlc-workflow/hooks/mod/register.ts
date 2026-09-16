/**
 * The `/wf` picker as a Claude Code mod.
 *
 * Two rungs. At `session.start` the mod registers one command per key,
 * `/wf-<key>`, so the native typeahead lists every key with its description
 * when the person types `/wf`. At `command.run` of a bare `/wf`, of a
 * `/wf <key>` that still needs a slug, or of any `/wf-<key>`, the mod draws a
 * numbered list above the prompt: the keys, then the workflows under
 * `.ai/workflows` (active first, closed marked), then the slices of the picked
 * workflow (roster status and the furthest stage file present). A digit picks
 * a row from the empty composer. The wheel over the band, and `0`, turn the
 * page. Once the band holds the keyboard (a click, or ctrl+x tab) the filter
 * field narrows the rows as the person types, Tab walks the rows and past the
 * last row onto the next page, and Enter picks. The last pick writes the full
 * command into the prompt box with `$.prompt.fill`; the person presses Enter
 * to run it, or edits it first.
 *
 * A `/wf <key> <slug> ...` typed in full runs as before: the hook passes it
 * on with `next(e)`.
 */
import type { On } from 'claude-code'

import { CATALOG, commandNameOf, keyOfCommand } from './catalog.ts'
import {
  CLOSED_TEXT,
  DISPATCHER_COMMANDS,
  FILL_REFUSED_TEXT,
  NO_ROOT_TEXT,
  NO_WORKFLOWS_TEXT,
  OPENED_TEXT,
  PLUGIN_NAME,
  RUN_TEXT,
  registerFailedTextOf,
} from './names.ts'
import { filterOptions, keyOptions, pageOf, pick, sliceOptions, slugOptions, stepFor, titleOf } from './picker.ts'
import type { Option, Step } from './picker.ts'
import { bandView, pageSizeOf, rowKeyOf, stack } from './views.tsx'
import { findProjectRoot, listSlices, listWorkflows } from './workflows.ts'
import type { Reader, SliceEntry, WorkflowEntry } from './workflows.ts'

/** Every `$.noun.event` the mod calls after `session.start`, bound once. */
type Host = {
  cwd: string
  reader: Reader
  fill: (text: string) => Promise<{ isFilled: boolean }>
  invalidate: () => void
  log: (text: string) => void
  status: (text: string | undefined) => void
  /** Moves the band's focus ring onto one of the mod's elements while the band holds the keys. */
  focus: (requestId: string, key: string) => Promise<{ deny?: string }>
  /** Runs `fn` once the current dispatch is over. */
  later: (fn: () => void) => void
  registerCommand: (spec: { name: string; description: string; argumentHint?: string }) => Promise<unknown>
}

type Model = {
  step: Step | null
  /** The page of the step's options on screen; reset to the first at every step. */
  page: number
  /** The filter field's text; the rows shown are the options it matches. */
  filter: string
  /** The element the band's focus ring is on, as the last `ui.focus` said. */
  ring: string | null
  /** The directory holding `.ai/workflows`; null before a read, or when none. */
  root: string | null
  isRead: boolean
  workflows: WorkflowEntry[]
  slices: Map<string, SliceEntry[]>
}

const EMPTY: Model = { step: null, page: 0, filter: '', ring: null, root: null, isRead: false, workflows: [], slices: new Map() }

export function register(on: On) {
  let host: Host | null = null
  let model: Model = EMPTY
  /** The work the last row press started: a press settles once it is done. */
  let pending: Promise<void> = Promise.resolve()
  /** The rows the band had at its last draw; the focus hook pages by the same size. */
  let ringMaxRows = 12

  const commandNames: string[] = [...DISPATCHER_COMMANDS, ...CATALOG.map(entry => commandNameOf(entry.key))]

  async function registerCommands(engine: Host): Promise<void> {
    for (const entry of CATALOG) {
      const name = commandNameOf(entry.key)
      try {
        await engine.registerCommand({ name, description: entry.description, argumentHint: entry.argumentHint })
      } catch (error) {
        engine.log(registerFailedTextOf(name, messageOf(error)))
      }
    }
  }

  /** Reads the workflow list once per session; a later `/wf` re-reads it. */
  async function readWorkflows(engine: Host, isFresh: boolean): Promise<void> {
    if (model.isRead && !isFresh) return
    const root = await findProjectRoot(engine.cwd, engine.reader)
    const workflows = root === null ? [] : await listWorkflows(root, engine.reader)
    model = { ...model, root, isRead: true, workflows, slices: new Map() }
  }

  async function readSlices(engine: Host, slug: string): Promise<SliceEntry[]> {
    const known = model.slices.get(slug)
    if (known !== undefined) return known
    const slices = model.root === null ? [] : await listSlices(model.root, slug, engine.reader)
    const next = new Map(model.slices)
    next.set(slug, slices)
    model = { ...model, slices: next }
    return slices
  }

  function close(engine: Host): void {
    model = { ...model, step: null, filter: '', ring: null }
    engine.status(undefined)
    engine.invalidate()
  }

  function show(engine: Host, step: Step): void {
    model = { ...model, step, page: 0, filter: '', ring: null }
    engine.invalidate()
  }

  function turnPage(engine: Host, by: number): void {
    model = { ...model, page: model.page + by }
    engine.invalidate()
  }

  function setFilter(engine: Host, text: string): void {
    model = { ...model, filter: text, page: 0 }
    engine.invalidate()
  }

  /** The rows of the step after the filter, before paging. */
  async function rowsOf(engine: Host, step: Step): Promise<{ options: Option[]; note?: string }> {
    const { options, note } = await optionsOf(engine, step)
    return { options: filterOptions(options, model.filter), ...(note === undefined ? {} : { note }) }
  }

  async function fill(engine: Host, text: string): Promise<string> {
    let isFilled = false
    try {
      isFilled = (await engine.fill(`${text} `)).isFilled
    } catch (error) {
      engine.log(messageOf(error))
    }
    return isFilled ? `${RUN_TEXT} ${text}` : `${FILL_REFUSED_TEXT}${text}`
  }

  /** What a pick does: the next step, or the command into the prompt box. */
  async function advance(engine: Host, value: string): Promise<void> {
    const step = model.step
    if (step === null) return
    if (step.kind === 'key') await readWorkflows(engine, false)
    if (step.kind === 'slug' && value !== '') await readSlices(engine, value)
    const outcome = pick(step, value, slug => (model.slices.get(slug) ?? []).length > 0)
    if (outcome.kind === 'step') {
      show(engine, outcome.step)
      return
    }
    const text = await fill(engine, outcome.text.trim())
    close(engine)
    engine.log(text)
  }

  /** The list a step draws, with the note a step without data shows instead. */
  async function optionsOf(engine: Host, step: Step): Promise<{ options: Option[]; note?: string }> {
    if (step.kind === 'key') return { options: keyOptions() }
    if (step.kind === 'slug') {
      const options = slugOptions(step, model.workflows)
      if (model.root === null) return { options, note: NO_ROOT_TEXT }
      if (model.workflows.length === 0) return { options, note: NO_WORKFLOWS_TEXT }
      return { options }
    }
    return { options: sliceOptions(step, await readSlices(engine, step.slug)) }
  }

  on('session.start', async ($, e, next) => {
    model = EMPTY
    host = null
    if (e.surface !== 'terminal' || !e.isInteractive) return next(e)
    const engine: Host = {
      cwd: e.cwd,
      reader: {
        list: path => $.fs.list(path),
        read: path => $.fs.read(path),
        exists: path => $.fs.exists(path),
      },
      fill: text => $.prompt.fill({ text }),
      invalidate: () => $.ui.invalidate('ui.render'),
      log: text => $.ui.log(text),
      status: text => $.ui.status(text),
      focus: (requestId, key) => $.ui.focus({ requestId, key }),
      later: fn => {
        $.clock.after(0, fn)
      },
      registerCommand: spec => $.command.register(spec),
    }
    try {
      await registerCommands(engine)
      host = engine
    } catch (error) {
      engine.log(messageOf(error))
    }
    return next(e)
  })

  on('command.run', async ($, e, next) => {
    const engine = host
    if (!engine) return next(e)
    const isOwn = commandNames.includes(e.command)
    if (!isOwn) {
      // Another command while the band is up closes it.
      if (model.step !== null) close(engine)
      return next(e)
    }
    const key = keyOfCommand(e.command)
    const step = stepFor(key, e.args)
    if (step === null) {
      // The arguments are complete. A `/wf-<key>` run becomes the dispatcher's
      // command in the prompt box; the bare `/wf` runs as typed. A band still
      // up from an earlier pick closes either way.
      if (model.step !== null) close(engine)
      if (key === null) return next(e)
      return { text: await fill(engine, `/wf ${key} ${e.args.trim()}`.trimEnd()) }
    }
    await readWorkflows(engine, true)
    if (step.kind === 'slice') {
      // `/wf plan <slug>`: the slice step opens only when the workflow has a
      // roster; without one the command is complete as typed.
      const slices = await readSlices(engine, step.slug)
      if (slices.length === 0) {
        if (model.step !== null) close(engine)
        if (key === null) return next(e)
        return { text: await fill(engine, `/wf ${key} ${step.slug}`) }
      }
    }
    show(engine, step)
    return { text: OPENED_TEXT }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const engine = host
    const step = model.step
    if (!engine || step === null || e.surface !== 'terminal' || e.props.hasSurvey) return below
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    ringMaxRows = e.props.maxRows
    const { options, note } = await rowsOf(engine, step)
    // Every row carries a hotkey, and a digit arms only while the whole band
    // fits the rows the site gives it: size the page to those rows.
    const page = pageOf(options, model.page, pageSizeOf(e.props.maxRows))
    const pickRow = (value: string) => {
      pending = advance(engine, value).catch(error => engine.log(messageOf(error)))
    }
    const band = bandView(
      { Box, Text, Button, Input },
      { title: titleOf(step), page, filter: model.filter, ...(note === undefined ? {} : { note }) },
      {
        pick: pickRow,
        filter: text => setFilter(engine, text),
        submit: text => {
          // Enter in the field picks the first row the text leaves.
          const first = filterOptions(options, text)[0]
          if (first !== undefined) pickRow(first.value)
        },
        more: () => turnPage(engine, 1),
        close: () => {
          close(engine)
          engine.log(CLOSED_TEXT)
        },
      },
    )
    return stack(Box, below, band)
  })

  on('ui.press', { plugin: PLUGIN_NAME }, async ($, e, next) => {
    // A row press reads the workflow tree before it shows the next step or
    // fills the prompt; the press resolves once that work is done.
    const result = await next(e)
    await pending
    return result
  })

  on('ui.scroll', { component: 'AbovePrompt' }, ($, e, next) => {
    // The band never has rows to scroll (a scrolling band arms no digit), so
    // the wheel over it, and the page keys while it holds the keyboard, turn
    // the page instead; the engine's window stays where it is.
    const engine = host
    if (!engine || model.step === null || e.by === 0) return next(e)
    turnPage(engine, e.by < 0 ? -1 : 1)
    return {}
  })

  on('ui.focus', { component: 'AbovePrompt' }, async ($, e, next) => {
    // Tab past the last row lands on the next page's first row; Shift+Tab
    // before the first row lands on the previous page's last row. Any other
    // move is the engine's, remembered so the next one can be judged.
    const engine = host
    const step = model.step
    if (!engine || step === null || e.origin.kind !== 'person') return next(e)
    const { options } = await rowsOf(engine, step)
    const size = pageSizeOf(ringMaxRows)
    const page = pageOf(options, model.page, size)
    const rowKeys = page.items.map(item => rowKeyOf(item.value))
    const first = rowKeys[0]
    const last = rowKeys[rowKeys.length - 1]
    const landsOnRow = e.element !== undefined && rowKeys.includes(e.element)
    let by = 0
    if (page.pages > 1 && !landsOnRow && model.ring === last) by = 1
    else if (page.pages > 1 && !landsOnRow && model.ring === first) by = -1
    if (by === 0 || first === undefined) {
      model = { ...model, ring: e.element ?? null }
      return next(e)
    }
    const target = pageOf(options, model.page + by, size)
    const landing = by > 0 ? target.items[0] : target.items[target.items.length - 1]
    if (landing === undefined) return next(e)
    const key = rowKeyOf(landing.value)
    model = { ...model, page: model.page + by, ring: key }
    engine.invalidate()
    // Land the ring on the new page's row through the chain; when the new
    // tree is not drawn yet, ask again once this dispatch is over.
    const moved = await next({ ...e, element: key })
    if (moved.deny !== undefined) {
      engine.later(() => {
        void engine.focus(e.requestId, key).then(again => {
          if (again.deny !== undefined) engine.log(`sdlc-workflow: the ring did not follow the page: ${again.deny}`)
        })
      })
    }
    return {}
  })

  on('prompt.submit', ($, e, next) => {
    // Any submission ends the pick: the person typed past it.
    if (host && model.step !== null) close(host)
    return next(e)
  })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export { PLUGIN_NAME }
