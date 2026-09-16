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
 *
 * Around the picker, the session aids (WF-MOD-UX-PLAN.md): a strip under the
 * picker with the active workflow's stage, slice, next step, and cost; the
 * same in the pinned status line and the footer's mode labels; the next
 * invocation as the prompt box's dim suggestion after a stage turn; a toast
 * when a stage turn ends without its artifact; the question count in the
 * AskUserQuestion dialog during intake and shape; the driver's heartbeat in
 * the status line during auto and yolo; the spinner's verb from the stage;
 * the hub's health under the logo; and a `/wf-dashboard` pane. Each has a
 * switch in the plugin's settings.
 */
import type { On, PluginOptions, RenderElement } from 'claude-code'

import {
  DEFAULT_SETTINGS,
  basenameOf,
  beatsOf,
  costTextOf,
  driverStatusOf,
  expectedArtifactOf,
  hubHealthOf,
  hubNoticeTextOf,
  isWorkflowPath,
  ledgerTokensOf,
  modeLabelOf,
  openFindingsOf,
  settingOfKey,
  settingsOf,
  slugOfPath,
  spinnerWordOf,
  statusTextOf,
  stripTextOf,
  wfCommandOf,
} from './active.ts'
import type { HubHealth, Settings, WfCommand } from './active.ts'

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
import { PICK_KEY_PREFIX, STATUS_KEY_PREFIX, dashboardView, noticeView, stripRows, stripView } from './strip.tsx'
import { bandView, pageSizeOf, rowKeyOf, stack } from './views.tsx'
import { findProjectRoot, joinPath, listSlices, listWorkflows } from './workflows.ts'
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
  /** A file's modification time in ms, or null when it is absent. */
  mtime: (path: string) => Promise<number | null>
  toast: (text: string) => void
  suggest: (text: string) => Promise<unknown>
  /** The session's cost so far in dollars, or null where the host keeps none. */
  costUsd: () => Promise<number | null>
  /** A GET of `url`: the body when the answer is ok, else null. */
  fetchText: (url: string) => Promise<string | null>
  /** The person's home directory, from USERPROFILE then HOME. */
  home: () => Promise<string | undefined>
  every: (ms: number, fn: () => void) => { cancel: () => void }
  now: () => Promise<number>
  openPane: (id: string, title: string) => Promise<void>
}

/** The turn under way: what it ran, when it started, what it wrote. */
type Bracket = {
  turnId: string
  startedAt: number
  command: WfCommand | null
  costAtStart: number | null
  /** Paths under `.ai/workflows` the turn's Write and Edit calls touched. */
  writes: string[]
  /** AskUserQuestion calls so far in the turn. */
  questions: number
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
  /** The workflow the strip shows: the last `/wf` named it, else the newest index. */
  active: string | null
  /** The dollars the last `/wf` turn cost, for the strip's cost row. */
  lastStageUsd: number | null
  hub: HubHealth | null
  /** The pane's open state; the render hook draws only while open. */
  isDashboardOpen: boolean
}

const EMPTY: Model = {
  step: null,
  page: 0,
  filter: '',
  ring: null,
  root: null,
  isRead: false,
  workflows: [],
  slices: new Map(),
  active: null,
  lastStageUsd: null,
  hub: null,
  isDashboardOpen: false,
}

const DASHBOARD_COMMAND = 'wf-dashboard'
const DASHBOARD_PANE = 'wf-dashboard'
const DOCTOR_COMMAND = '/wf-doctor'
const QUESTION_FLOOR = 20
const HUB_DEFAULT_PORT = 48173
const WRITE_TOOLS = ['Write', 'Edit', 'NotebookEdit'] as const

export function register(on: On, options: PluginOptions = {}) {
  let host: Host | null = null
  let model: Model = EMPTY
  let settings: Settings = settingsOf(options ?? {})
  let bracket: Bracket | null = null
  let driverTimer: { cancel: () => void } | null = null
  let hubTimer: { cancel: () => void } | null = null
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
    if (model.active === null || !workflows.some(w => w.slug === model.active)) {
      model = { ...model, active: await newestSlug(engine, root, workflows) }
    }
  }

  /** The workflow whose index changed last, by mtime; the first when none can be read. */
  async function newestSlug(engine: Host, root: string | null, workflows: readonly WorkflowEntry[]): Promise<string | null> {
    if (root === null || workflows.length === 0) return null
    let best: { slug: string; at: number } | null = null
    for (const workflow of workflows) {
      const at = (await engine.mtime(joinPath(root, '.ai', 'workflows', workflow.slug, '00-index.md'))) ?? 0
      if (best === null || at > best.at) best = { slug: workflow.slug, at }
    }
    return best?.slug ?? null
  }

  function activeWorkflow(): WorkflowEntry | null {
    return model.workflows.find(w => w.slug === model.active) ?? null
  }

  /** Re-reads the tree and redraws the strip, the status line, and the pane. */
  async function refreshActive(engine: Host): Promise<void> {
    await readWorkflows(engine, true)
    const workflow = activeWorkflow()
    if (workflow !== null) await readSlices(engine, workflow.slug)
    if (model.step === null) engine.status(settings.strip && workflow !== null ? statusTextOf(workflow) : undefined)
    engine.invalidate()
  }

  /** Marks a workflow active, as a `/wf` run or a write names it. */
  function setActive(engine: Host, slug: string | null): void {
    if (slug === null || slug === model.active) return
    model = { ...model, active: slug }
    engine.invalidate()
  }

  /** The strip's rows for the active workflow, or null when nothing is active. */
  async function stripOf(engine: Host): Promise<{ text: string; cost: string | null } | null> {
    if (!settings.strip) return null
    const workflow = activeWorkflow()
    if (workflow === null) return null
    const slices = await readSlices(engine, workflow.slug)
    let cost: string | null = null
    if (settings.cost) {
      let tokens: number | null = null
      if (model.root !== null) {
        try {
          tokens = ledgerTokensOf(await engine.reader.read(joinPath(model.root, '.ai', 'workflows', workflow.slug, 'cost.jsonl')))
        } catch {
          tokens = null
        }
      }
      cost = costTextOf(model.lastStageUsd, tokens)
    }
    return { text: stripTextOf(workflow, slices), cost }
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
    const workflow = activeWorkflow()
    engine.status(settings.strip && workflow !== null ? statusTextOf(workflow) : undefined)
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
      mtime: async path => {
        try {
          return (await $.fs.stat(path)).mtimeMs
        } catch {
          return null
        }
      },
      toast: text => $.ui.toast(text),
      suggest: text => $.prompt.suggest({ text }),
      costUsd: async () => {
        try {
          return (await $.session.usage()).cost?.usd ?? null
        } catch {
          return null
        }
      },
      fetchText: async url => {
        try {
          const answer = await $.http.fetch(url)
          return answer.ok ? answer.text : null
        } catch {
          return null
        }
      },
      home: async () => (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')),
      every: (ms, fn) => $.clock.every(ms, fn),
      now: () => $.clock.now(),
      openPane: (id, title) => $.ui.open({ id, title }),
    }
    bracket = null
    driverTimer?.cancel()
    driverTimer = null
    hubTimer?.cancel()
    hubTimer = null
    try {
      await registerCommands(engine)
      try {
        await engine.registerCommand({ name: DASHBOARD_COMMAND, description: 'Open the sdlc workflows dashboard pane.' })
      } catch (error) {
        engine.log(registerFailedTextOf(DASHBOARD_COMMAND, messageOf(error)))
      }
      host = engine
      await refreshActive(engine)
      if (settings.hubNotice) await watchHub(engine)
    } catch (error) {
      engine.log(messageOf(error))
    }
    return next(e)
  })

  /** Reads the hub's health once, then every minute; a change of state is one toast. */
  async function watchHub(engine: Host): Promise<void> {
    const url = await hubUrl(engine)
    if (url === null) return
    const read = async () => {
      const text = await engine.fetchText(url)
      return text === null ? null : hubHealthOf(text)
    }
    model = { ...model, hub: await read() }
    engine.invalidate()
    hubTimer = engine.every(60_000, () => {
      void read().then(health => {
        const wasUp = model.hub?.ok === true
        const isUp = health?.ok === true
        model = { ...model, hub: health }
        if (wasUp !== isUp) engine.toast(isUp ? `sdlc hub is back (${health?.version ?? '?'})` : 'sdlc hub stopped answering')
      })
    })
  }

  /** The hub's health URL from `~/.sdlc/hub-config.json`, or null without a home or a config. */
  async function hubUrl(engine: Host): Promise<string | null> {
    const home = await engine.home()
    if (home === undefined || home === '') return null
    const path = joinPath(home, '.sdlc', 'hub-config.json')
    if (!(await engine.reader.exists(path))) return null
    let port = HUB_DEFAULT_PORT
    let hostName = '127.0.0.1'
    try {
      const config = JSON.parse(await engine.reader.read(path)) as { port?: unknown; host?: unknown }
      if (typeof config.port === 'number') port = config.port
      if (typeof config.host === 'string' && config.host !== '') hostName = config.host
    } catch {
      // A config that does not parse still names the default port.
    }
    return `http://${hostName}:${port}/__sdlc/health`
  }

  on('config.set', { key: /^sdlc-workflow\./u }, async ($, e, next) => {
    const result = await next(e)
    const name = settingOfKey(PLUGIN_NAME, e.key)
    if (name !== null && result.deny === undefined && typeof result.value === 'boolean') {
      settings = { ...settings, [name]: result.value }
      if (host) await refreshActive(host)
    }
    return result
  })

  on('command.run', async ($, e, next) => {
    const engine = host
    if (!engine) return next(e)
    if (e.command === DASHBOARD_COMMAND || e.command === `${PLUGIN_NAME}:${DASHBOARD_COMMAND}`) {
      if (model.step !== null) close(engine)
      await refreshActive(engine)
      for (const workflow of model.workflows) if (!workflow.terminal) await readSlices(engine, workflow.slug)
      model = { ...model, isDashboardOpen: true }
      await engine.openPane(DASHBOARD_PANE, 'sdlc workflows')
      return { text: 'The workflows dashboard is open above the prompt (docked in fullscreen); ctrl+x x closes it.' }
    }
    const isOwn = commandNames.includes(e.command)
    if (!isOwn) {
      // Another command while the band is up closes it.
      if (model.step !== null) close(engine)
      return next(e)
    }
    const key = keyOfCommand(e.command)
    const named = wfCommandOf(`/wf ${key === null ? '' : `${key} `}${e.args}`)
    if (named?.slug) setActive(engine, named.slug)
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
    if (!engine || e.surface !== 'terminal' || e.props.hasSurvey) return below
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    const strip = await stripOf(engine)
    const stripTree = strip === null ? null : stripView({ Box, Text, Button }, strip.text, strip.cost)
    const stripHeight = strip === null ? 0 : stripRows(strip.cost)
    if (step === null) return stripTree === null ? below : stack(Box, below, stripTree)
    ringMaxRows = e.props.maxRows - stripHeight
    const { options, note } = await rowsOf(engine, step)
    // Every row carries a hotkey, and a digit arms only while the whole band
    // fits the rows the site gives it: size the page to those rows, less the
    // strip's.
    const page = pageOf(options, model.page, pageSizeOf(e.props.maxRows - stripHeight))
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
    return stripTree === null ? stack(Box, below, band) : stack(Box, stack(Box, below, band), stripTree)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    const workflow = activeWorkflow()
    const label = workflow === null || !settings.strip ? null : modeLabelOf(workflow)
    if (label === null || e.props.modes.includes(label)) return next(e)
    return next({ ...e, props: { ...e.props, modes: [...e.props.modes, label] } })
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const command = bracket?.command ?? null
    const word = command === null || !settings.spinnerVerb ? null : spinnerWordOf(command)
    if (word === null) return next(e)
    return next({ ...e, props: { ...e.props, word } })
  })

  on('ui.render', { component: 'InfoNotice' }, async ($, e, next) => {
    if (!settings.hubNotice || model.hub === null || e.surface !== 'terminal') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return noticeView({ Box, Text }, e.props.text, hubNoticeTextOf(model.hub), DOCTOR_COMMAND)
  })

  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const key = bracket?.command?.key
    if (!settings.questionProgress || bracket === null || (key !== 'intake' && key !== 'shape')) return next(e)
    const count = bracket.questions
    if (count === 0 || !Array.isArray(e.props.questions)) return next(e)
    const questions = e.props.questions.map(question => {
      if (!question || typeof question !== 'object') return question
      const q = question as { question?: unknown }
      if (typeof q.question !== 'string') return question
      return { ...q, question: `${q.question} (question ${count}, floor ${QUESTION_FLOOR})` }
    })
    return next({ ...e, props: { ...e.props, questions } })
  })

  on('ui.render', { component: 'Pane', requestId: DASHBOARD_PANE }, async ($, e, next) => {
    const engine = host
    if (!engine || !model.isDashboardOpen || e.surface !== 'terminal') return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const findings = new Map<string, number>()
    let shipPlanBlockers: number | null = null
    if (model.root !== null) {
      for (const workflow of model.workflows) {
        if (workflow.terminal) continue
        const count = await openFindingsCount(engine, model.root, workflow.slug)
        if (count !== null) findings.set(workflow.slug, count)
      }
      try {
        const audit = await engine.reader.read(joinPath(model.root, '.ai', 'ship-plan-audit.md'))
        shipPlanBlockers = (audit.match(/^\s*(?:-\s+)?severity:\s*(?:BLOCKER|HIGH)\b/gimu) ?? []).length
      } catch {
        shipPlanBlockers = null
      }
    }
    const hub = model.hub === null ? 'hub unknown' : `hub ${model.hub.version ?? '?'} ${model.hub.ok ? 'ok' : 'down'}`
    return dashboardView(
      { Box, Text, Button },
      { workflows: model.workflows, slices: model.slices, findings, shipPlanBlockers, hub, columns: e.props.bodyColumns },
      {
        status: slug => {
          void fill(engine, `/wf status ${slug}`).then(text => engine.log(text))
        },
        pick: slug => {
          setActive(engine, slug)
          show(engine, { kind: 'slice', key: 'plan', slug })
        },
      },
    )
  })

  /** Open findings of the newest review ledger of a workflow: the sibling YAML, else the markdown. */
  async function openFindingsCount(engine: Host, root: string, slug: string): Promise<number | null> {
    const dir = joinPath(root, '.ai', 'workflows', slug)
    let names: string[]
    try {
      names = (await engine.reader.list(dir)).filter(entry => entry.kind === 'file').map(entry => entry.name)
    } catch {
      return null
    }
    const ledgers = names.filter(name => /^07-review.*\.(?:md|yaml)$/u.test(name)).sort()
    const yaml = ledgers.filter(name => name.endsWith('.yaml')).pop()
    const markdown = ledgers.filter(name => name.endsWith('.md')).pop()
    const chosen = yaml ?? markdown
    if (chosen === undefined) return null
    try {
      return openFindingsOf(await engine.reader.read(joinPath(dir, chosen)))
    } catch {
      return null
    }
  }

  on('ui.close', { id: DASHBOARD_PANE }, async ($, e, next) => {
    model = { ...model, isDashboardOpen: false }
    return next(e)
  })

  on('tool.call', { tool: [...WRITE_TOOLS] }, async ($, e, next) => {
    const result = await next(e)
    const engine = host
    if (!engine || model.root === null) return result
    const path = 'file_path' in e && typeof e.file_path === 'string' ? e.file_path : 'notebook_path' in e && typeof e.notebook_path === 'string' ? e.notebook_path : null
    if (path === null || !isWorkflowPath(model.root, path)) return result
    if (bracket !== null) bracket.writes.push(path)
    const slug = slugOfPath(model.root, path)
    if (slug !== null && bracket?.command?.slug == null) model = { ...model, active: slug }
    await refreshActive(engine)
    return result
  })

  on('tool.call', { tool: /^AskUserQuestion$/u }, async ($, e, next) => {
    if (bracket !== null) bracket.questions += 1
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const engine = host
    const result = await next(e)
    if (!engine) return result
    const command = wfCommandOf(e.text)
    bracket = { turnId: e.turnId, startedAt: await engine.now(), command, costAtStart: await engine.costUsd(), writes: [], questions: 0 }
    if (command?.slug) setActive(engine, command.slug)
    driverTimer?.cancel()
    driverTimer = null
    if (settings.driverStatus && command !== null && (command.key === 'auto' || command.key === 'yolo') && command.slug !== null) {
      const slug = command.slug
      const key = command.key
      const tick = () => {
        void driverTick(engine, key, slug)
      }
      driverTimer = engine.every(5_000, tick)
      await driverTick(engine, key, slug)
    }
    return result
  })

  /** One read of the driver journal into the status line. */
  async function driverTick(engine: Host, key: string, slug: string): Promise<void> {
    if (model.root === null) return
    let text = ''
    try {
      text = await engine.reader.read(joinPath(model.root, '.ai', 'workflows', slug, '.driver-journal.jsonl'))
    } catch {
      text = ''
    }
    engine.status(driverStatusOf(key, beatsOf(text), await engine.now()))
  }

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const engine = host
    const turn = bracket
    bracket = null
    driverTimer?.cancel()
    driverTimer = null
    if (!engine || turn === null) return result
    const command = turn.command
    if (command !== null) {
      const costNow = await engine.costUsd()
      if (costNow !== null && turn.costAtStart !== null) model = { ...model, lastStageUsd: Math.max(0, costNow - turn.costAtStart) }
    }
    if (turn.writes.length > 0 || command !== null) await refreshActive(engine)
    else return result
    const workflow = activeWorkflow()
    // The stage-landed check: a `/wf <key> <slug> [slice]` turn the person
    // did not interrupt must have written the key's artifact.
    if (settings.stageCheck && command !== null && command.slug !== null && e.reason === 'answer' && model.root !== null) {
      const expected = expectedArtifactOf(command)
      if (expected !== null) {
        const wrote = turn.writes.some(path => basenameOf(path) === expected.toLowerCase())
        const at = await engine.mtime(joinPath(model.root, '.ai', 'workflows', command.slug, expected))
        if (!wrote && (at === null || at < turn.startedAt)) {
          const text = `wf: ${command.key} ended without ${expected}`
          engine.toast(text)
          engine.log(text)
        }
      }
    }
    // The next step, dim in the prompt box, Tab to take.
    if (settings.suggestNext && workflow !== null && !workflow.terminal && workflow.nextInvocation && turn.writes.length > 0) {
      try {
        await engine.suggest(workflow.nextInvocation)
      } catch (error) {
        engine.log(messageOf(error))
      }
    }
    return result
  })

  on('prompt.suggest', { origin: { kind: 'suggestion' } }, async ($, e, next) => {
    // The engine's own guess yields to the workflow's next step while one is active.
    const workflow = activeWorkflow()
    if (!settings.suggestNext || workflow === null || workflow.terminal || !workflow.nextInvocation) return next(e)
    return next({ ...e, text: workflow.nextInvocation })
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
