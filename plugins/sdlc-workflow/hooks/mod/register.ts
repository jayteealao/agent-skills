/**
 * The `/wf` picker as a Claude Code mod.
 *
 * Two rungs. At `session.start` the mod registers one command per key,
 * `/wf-<key>`, so the native typeahead lists every key with its description
 * when the person types `/wf`. At `command.run` of a bare `/wf`, of a
 * `/wf <key>` that still needs a slug, or of any `/wf-<key>`, the mod draws a
 * numbered list above the prompt (a digit picks a row from the empty composer;
 * ctrl+x tab gives the band the keys for the arrows): the keys, then the workflows under `.ai/workflows`
 * (active first, closed marked), then the slices of the picked workflow
 * (roster status and the furthest stage file present). The last pick writes
 * the full command into the prompt box with `$.prompt.fill`; the person
 * presses Enter to run it, or edits it first.
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
import { keyOptions, pick, sliceOptions, slugOptions, stepFor, titleOf } from './picker.ts'
import type { Option, Step } from './picker.ts'
import { bandView, fitPage, stack } from './views.tsx'
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
  registerCommand: (spec: { name: string; description: string; argumentHint?: string }) => Promise<unknown>
}

type Model = {
  step: Step | null
  /** The page of the step's options on screen; reset to the first at every step. */
  page: number
  /** The directory holding `.ai/workflows`; null before a read, or when none. */
  root: string | null
  isRead: boolean
  workflows: WorkflowEntry[]
  slices: Map<string, SliceEntry[]>
}

const EMPTY: Model = { step: null, page: 0, root: null, isRead: false, workflows: [], slices: new Map() }

export function register(on: On) {
  let host: Host | null = null
  let model: Model = EMPTY
  /** The work the last row press started: a press settles once it is done. */
  let pending: Promise<void> = Promise.resolve()

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
    model = { ...model, step: null }
    engine.status(undefined)
    engine.invalidate()
  }

  function show(engine: Host, step: Step): void {
    model = { ...model, step, page: 0 }
    engine.invalidate()
  }

  function turnPage(engine: Host): void {
    model = { ...model, page: model.page + 1 }
    engine.invalidate()
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
    const { Box, Text, Button, Select } = $.ui.resolve(e)
    const { options, note } = await optionsOf(engine, step)
    // Every row carries a digit hotkey, and a digit arms only while the whole
    // band fits the rows the site gives it: size the page to those rows.
    const page = fitPage(options, model.page, e.props.maxRows, e.props.bodyColumns)
    const band = bandView(
      { Box, Text, Button, Select },
      { title: titleOf(step), page, ...(note === undefined ? {} : { note }) },
      {
        pick: value => {
          pending = advance(engine, value).catch(error => engine.log(messageOf(error)))
        },
        more: () => turnPage(engine),
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
