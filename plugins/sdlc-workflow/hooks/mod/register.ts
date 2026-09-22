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
 *
 * After a stage turn lands its artifact (POST-STAGE-COMPACT-PLAN.md), the mod
 * compacts the session between turns with instructions that keep the
 * workflow's position and the person's decisions, then proposes the next
 * step; every other compaction while a workflow is active gains one sentence
 * that names the position. The switch is `stageCompact`.
 *
 * The module binds its host on every session, whatever the surface
 * (MOD-DESKTOP-PLAN.md): Claude Code Desktop runs the engine through the SDK,
 * where `session.start` reports no surface and no person at the prompt, and
 * the parts that never draw belong there too. Each draw gates on its own
 * `e.surface === 'terminal'`; each prompt or notice call is attempted and its
 * failure recorded. `hooks/mod/probe.ts` keeps the journal that says which
 * parts ran, on which host, for `scripts/mod-probe.mjs` to judge.
 */
import type { On, PluginOptions, RenderElement } from 'claude-code'

import {
  DEFAULT_SETTINGS,
  beatsOf,
  compactEligible,
  compactInstructionsOf,
  compactKeepSentenceOf,
  compactToastOf,
  costTextOf,
  driverStatusOf,
  expectedArtifactOf,
  hubHealthOf,
  hubNoticeTextOf,
  isWorkflowPath,
  nextActiveSlug,
  ledgerTokensOf,
  openingCandidatesOf,
  modeLabelOf,
  openFindingsOf,
  reviewLedgerNameOf,
  settingOfKey,
  shipPlanBlockersOf,
  settingsOf,
  slugOfPath,
  spinnerWordOf,
  stageLanded,
  statusTextOf,
  stripTextOf,
  wfCommandOf,
} from './active.ts'
import type { HubHealth, Settings, WfCommand } from './active.ts'

import { CATALOG, commandNameOf, keyOfCommand } from './catalog.ts'
import {
  CLOSED_TEXT,
  DASHBOARD_TERMINAL_TEXT,
  DISPATCHER_COMMANDS,
  FILL_REFUSED_TEXT,
  NO_ROOT_TEXT,
  NO_WORKFLOWS_TEXT,
  OPENED_TEXT,
  PLUGIN_NAME,
  RUN_TEXT,
  registerFailedTextOf,
} from './names.ts'
import { backOf, filterOptions, filterTextOf, keyOptions, pageOf, pick, sliceOptions, slugOptions, stepFor, submitActionOf, titleOf } from './picker.ts'
import type { Option, Step } from './picker.ts'
import { PICK_KEY_PREFIX, ROTATE_KEY, STATUS_KEY_PREFIX, dashboardView, noticeView, stripRows, stripView } from './strip.tsx'
import type { StripModel } from './strip.tsx'
import { bandView, pageSizeOf, rowKeyOf, stack } from './views.tsx'
import { PROBE_FILE, ProbeJournal, surfaceAfterAttach } from './probe.ts'
import type { ProbeIdentity } from './probe.ts'
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
  /** The context window's fill as a whole percent, or null when the engine has no figure. */
  contextPercent: () => Promise<number | null>
  /** Compacts the session between turns; `{ skip }` when a hook vetoed it. Rejects while a turn runs. */
  compact: (instructions: string) => Promise<{ skip?: string | undefined }>
  /** A GET of `url`: the body when the answer is ok, else null. */
  fetchText: (url: string) => Promise<string | null>
  /** The person's home directory, from USERPROFILE then HOME. */
  home: () => Promise<string | undefined>
  every: (ms: number, fn: () => void) => { cancel: () => void }
  now: () => Promise<number>
  openPane: (id: string, title: string) => Promise<void>
  /** The plugin's store, kept across sessions and reloads. */
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  /** Writes the whole text of a file, making its directories; the probe journal alone uses it. */
  writeFile: (path: string, text: string) => Promise<void>
  /** The session's id, or an empty string when the engine gives none. */
  sessionId: () => Promise<string>
  /** The host's own name, from `CLAUDE_CODE_ENTRYPOINT`. */
  entrypoint: () => Promise<string | undefined>
  /** The machine-wide sdlc state directory, `SDLC_HOME` or `<home>/.sdlc`. */
  sdlcHome: () => Promise<string | null>
  /** Every surface the session draws on now. */
  surfaces: () => Promise<readonly string[]>
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
  /** Where the session draws: `terminal` under the REPL, else a surface that attached, else null. */
  surface: string | null
  /** Whether a person is at the prompt, as `session.start` reported it. */
  interactive: boolean
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
  surface: null,
  interactive: false,
}

const DASHBOARD_COMMAND = 'wf-dashboard'
const ACTIVE_COMMAND = 'wf-active'
const DASHBOARD_PANE = 'wf-dashboard'
const DOCTOR_COMMAND = '/wf-doctor'
const QUESTION_FLOOR = 20
/** The intake mode whose question batches carry no floor annotation. */
const NO_FLOOR_INTAKE_MODE = 'brainstorm'
const HUB_DEFAULT_PORT = 48173
const WRITE_TOOLS = ['Write', 'Edit', 'NotebookEdit'] as const
const DRIVER_TICK_MS = 5_000
/** How long a dispatcher run names the turn that follows it. */
const LAST_RUN_WINDOW_MS = 10_000
/** The store key of the active workflow, per repository root. */
const activeStoreKeyOf = (root: string) => `active:${root}`
/** Every command the module registers: one per key, plus the dashboard and the active-workflow commands. */
const COMMAND_TOTAL = CATALOG.length + 2
/** Keys whose turn is not a stage: no "this stage" cost. */
const READ_ONLY_KEYS: ReadonlySet<string> = new Set(['status', 'recap'])

export function register(on: On, options: PluginOptions = {}) {
  let host: Host | null = null
  let model: Model = EMPTY
  let settings: Settings = settingsOf(options ?? {})
  let bracket: Bracket | null = null
  let driverTimer: { cancel: () => void } | null = null
  /** The driver line the status shows while a driver is watched; null hands the line back to the strip. */
  let driverText: string | null = null
  /** The run a presumed-dead toast went out for, so it goes out once. */
  let deadToastedRun: string | null = null
  let hubTimer: { cancel: () => void } | null = null
  /** The complete `/wf` command the dispatcher last ran, for a `turn.start` whose text is the expanded skill. */
  let lastRun: { command: WfCommand; at: number } | null = null
  /** The InfoNotice instance the hub line joins: the first one drawn. */
  let noticeRequestId: string | null = null
  /** The work the last row press started: a press settles once it is done. */
  let pending: Promise<void> = Promise.resolve()
  /** The rows the band had at its last draw; the focus hook pages by the same size. */
  let ringMaxRows = 12
  /** The probe journal of this session, or null when the switch is off or no home was found. */
  let journal: ProbeJournal | null = null

  const commandNames: string[] = [...DISPATCHER_COMMANDS, ...CATALOG.map(entry => commandNameOf(entry.key))]

  /** True where the band, the pinned line, and the pane draw: the terminal alone. */
  function isTerminal(): boolean {
    return model.surface === 'terminal'
  }

  /**
   * A void `$.ui.*` call never rejects at the plugin: where a surface does not
   * carry it the engine drops the call and reports it in its own log. So the
   * journal records the calls that answer — `prompt.suggest` and
   * `prompt.fill` — and the `load` and `turn` rows carry the rest.
   */

  async function registerCommands(engine: Host): Promise<number> {
    let registered = 0
    for (const entry of CATALOG) {
      const name = commandNameOf(entry.key)
      try {
        await engine.registerCommand({ name, description: entry.description, argumentHint: entry.argumentHint })
        registered += 1
      } catch (error) {
        engine.log(registerFailedTextOf(name, messageOf(error)))
      }
    }
    return registered
  }

  /**
   * Opens this session's probe journal, or leaves it closed when the switch is
   * off or no home directory answers. The identity it carries names the host
   * and the surface every row is written under.
   */
  async function openJournal(engine: Host, surface: string | null, interactive: boolean): Promise<ProbeJournal | null> {
    if (!settings.probeJournal) return null
    const home = await engine.sdlcHome()
    if (home === null) return null
    const identity: ProbeIdentity = {
      session: (await engine.sessionId()).slice(0, 8),
      host: (await engine.entrypoint()) ?? 'unknown',
      surface: surface ?? 'none',
      interactive,
    }
    return new ProbeJournal(
      {
        read: path => readIfPresent(engine, path),
        write: (path, text) => engine.writeFile(path, text),
        now: () => engine.now(),
      },
      joinPath(home, PROBE_FILE),
      identity,
    )
  }

  /** Reads the workflow list once per session; a later `/wf` re-reads it. */
  async function readWorkflows(engine: Host, isFresh: boolean): Promise<void> {
    if (model.isRead && !isFresh) return
    const root = await findProjectRoot(engine.cwd, engine.reader)
    const workflows = root === null ? [] : await listWorkflows(root, engine.reader)
    model = { ...model, root, isRead: true, workflows, slices: new Map() }
    if (model.active === null || !workflows.some(w => w.slug === model.active)) {
      const remembered = await rememberedSlug(engine, root)
      const active = remembered !== null && workflows.some(w => w.slug === remembered) ? remembered : await newestSlug(engine, root, workflows)
      model = { ...model, active }
    }
  }

  /** The slug the store holds for this root: the last one a run, a write, or a rotate named. */
  async function rememberedSlug(engine: Host, root: string | null): Promise<string | null> {
    if (root === null) return null
    try {
      const value = await engine.storeGet(activeStoreKeyOf(root))
      return typeof value === 'string' && value !== '' ? value : null
    } catch {
      return null
    }
  }

  /** Keeps the active slug across a module reload (a `/config` change) and across sessions. */
  async function remember(engine: Host): Promise<void> {
    if (model.root === null || model.active === null) return
    try {
      await engine.storeSet(activeStoreKeyOf(model.root), model.active)
    } catch (error) {
      engine.log(messageOf(error))
    }
  }

  /**
   * The active workflow whose index changed last, by mtime; a closed one only
   * when no workflow is active; the first when none can be read.
   */
  async function newestSlug(engine: Host, root: string | null, workflows: readonly WorkflowEntry[]): Promise<string | null> {
    if (root === null || workflows.length === 0) return null
    let best: { slug: string; at: number } | null = null
    for (const workflow of openingCandidatesOf(workflows)) {
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
    if (model.step === null) drawStatus(engine)
    engine.invalidate()
  }

  /** The pinned status line: the driver's heartbeat while one is watched, else the strip's short text. */
  function drawStatus(engine: Host): void {
    if (!isTerminal()) return
    if (driverText !== null) {
      engine.status(driverText)
      return
    }
    const workflow = activeWorkflow()
    engine.status(settings.strip && workflow !== null ? statusTextOf(workflow, settings.cost ? model.lastStageUsd : null, settings.hubNotice ? model.hub : null) : undefined)
  }

  function stopDriver(): void {
    driverTimer?.cancel()
    driverTimer = null
  }

  /** Marks a workflow active, as a `/wf` run or a write names it. */
  function setActive(engine: Host, slug: string | null): void {
    if (slug === null || slug === model.active) return
    model = { ...model, active: slug }
    void remember(engine)
    engine.invalidate()
  }

  /** The strip's rows for the active workflow, or null when nothing is active. */
  async function stripOf(engine: Host, columns: number): Promise<StripModel | null> {
    if (!settings.strip) return null
    const workflow = activeWorkflow()
    if (workflow === null) return null
    const slices = await readSlices(engine, workflow.slug)
    let tokens: number | null = null
    if (settings.cost && model.root !== null) {
      const ledger = await readIfPresent(engine, joinPath(model.root, '.ai', 'workflows', workflow.slug, 'cost.jsonl'))
      tokens = ledger === null ? null : ledgerTokensOf(ledger)
    }
    const detail = costTextOf(settings.cost ? model.lastStageUsd : null, tokens)
    const others = model.workflows.length - 1
    return { text: stripTextOf(workflow, slices), detail, others, columns }
  }

  /** A file's text, or null when it is absent; an absent file is no error to log. */
  async function readIfPresent(engine: Host, path: string): Promise<string | null> {
    try {
      if (!(await engine.reader.exists(path))) return null
      return await engine.reader.read(path)
    } catch {
      return null
    }
  }

  /** The rotate button and `/wf-active`: the next workflow in the ring (active first, then closed), or the named one. */
  async function rotateActive(engine: Host, slug: string | null): Promise<void> {
    const target = slug ?? nextActiveSlug(model.workflows, model.active)
    if (target === null || !model.workflows.some(w => w.slug === target)) return
    model = { ...model, active: target }
    await remember(engine)
    await readSlices(engine, target)
    if (model.step === null) drawStatus(engine)
    engine.invalidate()
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
    drawStatus(engine)
    engine.invalidate()
  }

  function show(engine: Host, step: Step): void {
    model = { ...model, step, page: 0, filter: '', ring: null }
    engine.invalidate()
  }

  /** The `back` button: the step before, on its first page. */
  function back(engine: Host): void {
    const previous = model.step === null ? null : backOf(model.step)
    if (previous !== null) show(engine, previous)
  }

  function turnPage(engine: Host, by: number): void {
    model = { ...model, page: model.page + by }
    engine.invalidate()
  }

  function setFilter(engine: Host, text: string): void {
    model = { ...model, filter: text, page: 0 }
    engine.invalidate()
  }

  /** The rows of the step after the filter, before paging; a bare digit in the field narrows nothing. */
  async function rowsOf(engine: Host, step: Step): Promise<{ options: Option[]; note?: string }> {
    const { options, note } = await optionsOf(engine, step)
    return { options: filterOptions(options, filterTextOf(model.filter)), ...(note === undefined ? {} : { note }) }
  }

  async function fill(engine: Host, text: string): Promise<string> {
    let isFilled = false
    try {
      isFilled = (await engine.fill(`${text} `)).isFilled
    } catch (error) {
      journal?.callFailed('fill', messageOf(error))
      engine.log(messageOf(error))
    }
    if (!isFilled) journal?.callFailed('fill', FILL_REFUSED_TEXT.trim())
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
    model = { ...EMPTY, surface: e.surface, interactive: e.isInteractive }
    host = null
    journal = null
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
          if (!(await $.fs.exists(path))) return null
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
      contextPercent: async () => {
        try {
          return (await $.session.usage()).context.percent ?? null
        } catch {
          return null
        }
      },
      compact: async instructions => {
        const result = await $.session.compact({ instructions })
        return result.skip === undefined ? {} : { skip: result.skip }
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
      storeGet: key => $.store.get(key),
      storeSet: (key, value) => $.store.set(key, value),
      writeFile: (path, text) => $.fs.write(path, text),
      sessionId: async () => {
        try {
          return await $.session.id()
        } catch {
          return ''
        }
      },
      entrypoint: () => $.env.get('CLAUDE_CODE_ENTRYPOINT'),
      sdlcHome: async () => {
        const override = await $.env.get('SDLC_HOME')
        if (override !== undefined && override.trim() !== '') return override.trim()
        const home = await ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')))
        return home === undefined || home === '' ? null : joinPath(home, '.sdlc')
      },
      surfaces: async () => {
        try {
          return await $.session.surfaces()
        } catch {
          return []
        }
      },
    }
    bracket = null
    stopDriver()
    driverText = null
    deadToastedRun = null
    lastRun = null
    noticeRequestId = null
    hubTimer?.cancel()
    hubTimer = null
    try {
      journal = await openJournal(engine, e.surface, e.isInteractive)
      let registered = await registerCommands(engine)
      try {
        await engine.registerCommand({ name: DASHBOARD_COMMAND, description: 'Open the sdlc workflows dashboard pane.' })
        registered += 1
      } catch (error) {
        engine.log(registerFailedTextOf(DASHBOARD_COMMAND, messageOf(error)))
      }
      try {
        await engine.registerCommand({ name: ACTIVE_COMMAND, description: 'Show the named workflow in the strip, or the next active one.', argumentHint: '[slug]' })
        registered += 1
      } catch (error) {
        engine.log(registerFailedTextOf(ACTIVE_COMMAND, messageOf(error)))
      }
      host = engine
      await refreshActive(engine)
      if (settings.hubNotice && isTerminal()) await watchHub(engine)
      const surfaces = await engine.surfaces()
      void journal?.write({ event: 'load', ok: true, detail: `surfaces ${surfaces.join(',') || 'none'} · root ${model.root ?? 'none'} · workflows ${model.workflows.length}` })
      void journal?.write({ event: 'commands', ok: registered === COMMAND_TOTAL, detail: `${registered}/${COMMAND_TOTAL}` })
    } catch (error) {
      engine.log(messageOf(error))
      void journal?.write({ event: 'load', ok: false, detail: messageOf(error) })
    }
    return next(e)
  })

  on('session.attach', async ($, e, next) => {
    // A remote client (the Desktop app, a phone) joined after the session
    // started. It is the surface the session draws on from now on, and the
    // one positive signal that does not depend on `isInteractive`.
    const engine = host
    const result = await next(e)
    if (!engine) return result
    const surface = surfaceAfterAttach(model.surface, e.surface)
    model = { ...model, surface }
    journal?.setSurface(surface)
    void journal?.write({ event: 'attach', ok: true, detail: `${e.surface} · client ${e.clientId}` })
    await refreshActive(engine)
    return result
  })

  /** Reads the hub's health once, then every minute; a change of state is one toast. */
  async function watchHub(engine: Host): Promise<void> {
    if (hubTimer !== null) return
    const url = await hubUrl(engine)
    if (url === null) return
    // A hub that does not answer is down, not unknown: the line says so.
    const read = async () => hubHealthOf((await engine.fetchText(url)) ?? '')
    model = { ...model, hub: await read() }
    if (model.step === null) drawStatus(engine)
    engine.invalidate()
    hubTimer = engine.every(60_000, () => {
      void read().then(health => {
        const wasUp = model.hub?.ok === true
        const isUp = health?.ok === true
        model = { ...model, hub: health }
        if (wasUp === isUp) return
        engine.toast(isUp ? `sdlc hub is back (${health?.version ?? '?'})` : 'sdlc hub stopped answering')
        if (model.step === null) drawStatus(engine)
        engine.invalidate()
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
      if (host) {
        if (name === 'hubNotice') {
          if (result.value) await watchHub(host)
          else {
            hubTimer?.cancel()
            hubTimer = null
            model = { ...model, hub: null }
          }
        }
        if (name === 'driverStatus' && !result.value) {
          stopDriver()
          driverText = null
        }
        await refreshActive(host)
      }
    }
    return result
  })

  on('command.run', async ($, e, next) => {
    const engine = host
    if (!engine) return next(e)
    if (e.command === DASHBOARD_COMMAND || e.command === `${PLUGIN_NAME}:${DASHBOARD_COMMAND}`) {
      if (!isTerminal()) return { text: DASHBOARD_TERMINAL_TEXT }
      if (model.step !== null) close(engine)
      await refreshActive(engine)
      for (const workflow of model.workflows) if (!workflow.terminal) await readSlices(engine, workflow.slug)
      model = { ...model, isDashboardOpen: true }
      await engine.openPane(DASHBOARD_PANE, 'sdlc workflows')
      return { text: 'The workflows dashboard is open above the prompt (docked in fullscreen); ctrl+x x closes it.' }
    }
    if (e.command === ACTIVE_COMMAND || e.command === `${PLUGIN_NAME}:${ACTIVE_COMMAND}`) {
      await readWorkflows(engine, true)
      const slug = e.args.trim() === '' ? null : e.args.trim()
      if (slug !== null && !model.workflows.some(w => w.slug === slug)) return { text: `No workflow named ${slug} under .ai/workflows.` }
      await rotateActive(engine, slug)
      return { text: model.active === null ? 'No active workflow.' : `The strip shows ${model.active}.` }
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
    // The band draws on the terminal alone, so a step that cannot be shown is
    // not opened: the command runs as typed, or goes into the prompt box.
    const step = isTerminal() ? stepFor(key, e.args) : null
    if (step === null) {
      // The arguments are complete. A `/wf-<key>` run becomes the dispatcher's
      // command in the prompt box; the bare `/wf` runs as typed. A band still
      // up from an earlier pick closes either way.
      if (model.step !== null) close(engine)
      if (key === null) {
        if (named !== null) lastRun = { command: named, at: await engine.now() }
        return next(e)
      }
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
    const strip = await stripOf(engine, e.props.bodyColumns)
    const stripTree = strip === null ? null : stripView({ Box, Text, Button }, strip, () => {
      pending = rotateActive(engine, null).catch(error => engine.log(messageOf(error)))
    })
    const stripHeight = strip === null ? 0 : stripRows(strip)
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
      { title: titleOf(step), page, filter: model.filter, hasBack: backOf(step) !== null, ...(note === undefined ? {} : { note }) },
      {
        pick: pickRow,
        filter: text => setFilter(engine, text),
        submit: text => {
          const action = submitActionOf(text, page, options)
          if (action === null) return
          if (action.kind === 'pick') {
            pickRow(action.value)
            return
          }
          setFilter(engine, '')
          turnPage(engine, 1)
        },
        back: () => back(engine),
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
    // The hub line joins one notice, the first drawn; the others stay the engine's.
    noticeRequestId ??= e.requestId
    if (e.requestId !== noticeRequestId) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const engineText = e.props.command === null ? e.props.text : `${e.props.text} ${e.props.command}`
    return noticeView({ Box, Text }, engineText, hubNoticeTextOf(model.hub), DOCTOR_COMMAND)
  })

  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    const key = bracket?.command?.key
    if (!settings.questionProgress || bracket === null || (key !== 'intake' && key !== 'shape')) return next(e)
    // A brainstorm has no question floor: its batches run until the person says `done`.
    if (key === 'intake' && bracket.command?.slug === NO_FLOOR_INTAKE_MODE) return next(e)
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
        const count = await openFindingsCount(engine, model.root, workflow)
        if (count !== null) findings.set(workflow.slug, count)
      }
      const audit = await readIfPresent(engine, joinPath(model.root, '.ai', 'ship-plan-audit.md'))
      shipPlanBlockers = audit === null ? null : shipPlanBlockersOf(audit)
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

  /** Open findings of a workflow's review ledger: the sweep-level sibling YAML, else the markdown. */
  async function openFindingsCount(engine: Host, root: string, workflow: WorkflowEntry): Promise<number | null> {
    const dir = joinPath(root, '.ai', 'workflows', workflow.slug)
    let names: string[]
    try {
      names = (await engine.reader.list(dir)).filter(entry => entry.kind === 'file').map(entry => entry.name)
    } catch {
      return null
    }
    const chosen = reviewLedgerNameOf(names, workflow.selectedSlice)
    if (chosen === null) return null
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
    if (!engine || model.root === null || result.deny !== undefined || result.isError === true) return result
    const path = 'file_path' in e && typeof e.file_path === 'string' ? e.file_path : 'notebook_path' in e && typeof e.notebook_path === 'string' ? e.notebook_path : null
    if (path === null || !isWorkflowPath(model.root, path)) return result
    if (bracket !== null) bracket.writes.push(path)
    const slug = slugOfPath(model.root, path)
    if (slug !== null && bracket?.command?.slug == null) {
      model = { ...model, active: slug }
      await remember(engine)
    }
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
    const startedAt = await engine.now()
    // The text of a slash-command turn may be the expanded skill; the
    // dispatcher's own run, seconds before, names the command then.
    const typed = wfCommandOf(e.text)
    const command = typed ?? (lastRun !== null && startedAt - lastRun.at < LAST_RUN_WINDOW_MS ? lastRun.command : null)
    lastRun = null
    bracket = { turnId: e.turnId, startedAt, command, costAtStart: await engine.costUsd(), writes: [], questions: 0 }
    if (command?.slug) setActive(engine, command.slug)
    // A watched driver that ended or died hands the status line back at the next turn.
    if (driverTimer === null && driverText !== null) {
      driverText = null
      drawStatus(engine)
    }
    if (settings.driverStatus && command !== null && (command.key === 'auto' || command.key === 'yolo') && command.slug !== null) {
      stopDriver()
      deadToastedRun = null
      const slug = command.slug
      const key = command.key
      const tick = () => {
        void driverTick(engine, key, slug)
      }
      driverTimer = engine.every(DRIVER_TICK_MS, tick)
      await driverTick(engine, key, slug)
    }
    return result
  })

  /**
   * One read of the driver journal into the status line. The driver runs in
   * the background past its own turn, so the watch outlives the turn; it stops
   * at the first presumed-dead reading, with one toast, and the line stays
   * until the next turn starts.
   */
  async function driverTick(engine: Host, key: string, slug: string): Promise<void> {
    if (model.root === null) return
    const text = (await readIfPresent(engine, joinPath(model.root, '.ai', 'workflows', slug, '.driver-journal.jsonl'))) ?? ''
    const beats = beatsOf(text)
    driverText = driverStatusOf(key, beats, await engine.now())
    if (model.step === null) engine.status(driverText)
    if (driverText.includes('presumed dead')) {
      const run = beats[beats.length - 1]?.run ?? ''
      if (deadToastedRun !== run) {
        deadToastedRun = run
        engine.toast(`wf ${key} ${slug}: driver ${driverText.slice(driverText.indexOf('presumed dead'))}`)
      }
      stopDriver()
    }
  }

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const engine = host
    // A sub-agent raises no `turn.start` but does raise `turn.complete` with
    // its `agentId`. It is not the person's turn: it must not consume the
    // bracket, or the first sub-agent to finish ends the stage's bookkeeping
    // and the writes that follow it are counted against nothing.
    if (e.agentId !== undefined) return result
    const turn = bracket
    bracket = null
    if (!engine || turn === null) return result
    const command = turn.command
    if (command !== null && !READ_ONLY_KEYS.has(command.key)) {
      const costNow = await engine.costUsd()
      if (costNow !== null && turn.costAtStart !== null) model = { ...model, lastStageUsd: Math.max(0, costNow - turn.costAtStart) }
    }
    if (turn.writes.length > 0 || command !== null) await refreshActive(engine)
    else return result
    const workflow = activeWorkflow()
    // Whether the stage landed: a `/wf <key> <slug> [slice]` turn the person
    // did not interrupt must have written the key's artifact. The check's
    // toast and the compaction read the same answer.
    let landed: boolean | null = null
    if (command !== null && command.slug !== null && e.reason === 'answer' && model.root !== null) {
      const expected = expectedArtifactOf(command)
      const at = expected === null ? null : await engine.mtime(joinPath(model.root, '.ai', 'workflows', command.slug, expected))
      landed = stageLanded(turn.writes, expected, turn.startedAt, at)
      if (settings.stageCheck && expected !== null && !landed) {
        const text = `wf: ${command.key} ended without ${expected}`
        engine.toast(text)
        engine.log(text)
      }
    }
    // The next step, dim in the prompt box, Tab to take.
    const suggestion = settings.suggestNext && workflow !== null && !workflow.terminal && workflow.nextInvocation && turn.writes.length > 0 ? workflow.nextInvocation : null
    const suggest = () => {
      if (suggestion === null) return
      engine.suggest(suggestion).catch(error => {
        journal?.callFailed('suggest', messageOf(error))
        engine.log(messageOf(error))
      })
    }
    // The post-stage compaction, between turns; the suggestion follows it so
    // the dim text is proposed on the compacted session.
    if (settings.stageCompact && landed === true && command !== null && workflow !== null && compactEligible(command, workflow, e)) {
      const instructions = compactInstructionsOf(workflow, command, turn.writes)
      const key = command.key
      journalTurn(command, turn, landed, 'compact')
      // Inside this dispatch, not in a timer it starts: the engine accepts
      // `session.compact` from a `turn.complete` hook and refuses it from a
      // later event, which is what a detached call becomes.
      await compactAfterStage(engine, key, instructions)
      engine.later(suggest)
      return result
    }
    if (command !== null) journalTurn(command, turn, landed, compactSkipReason(command, workflow, landed, e, suggestion))
    // Proposed once this dispatch is over: the engine drops a suggestion made while a turn runs.
    if (suggestion !== null) engine.later(suggest)
    return result
  })

  /**
   * One journal row per `/wf` turn: what ran, what it wrote, whether its
   * artifact landed, and what followed. A turn that compacted nothing says
   * which test refused it, so one row answers "why did it not compact".
   */
  function journalTurn(command: WfCommand, turn: Bracket, landed: boolean | null, action: string): void {
    const target = `${command.key} ${command.slug ?? '-'}${command.slice === null ? '' : ` ${command.slice}`}`
    void journal?.write({
      event: 'turn',
      ok: action === 'compact' || action === 'suggest',
      detail: `${target} · writes ${turn.writes.length} · landed ${landed === null ? 'n/a' : String(landed)} · ${action}`,
    })
  }

  /** Why a `/wf` turn compacted nothing, in one word the journal carries. */
  function compactSkipReason(command: WfCommand, workflow: WorkflowEntry | null, landed: boolean | null, end: { reason: string; agentId?: string | undefined }, suggestion: string | null): string {
    if (!settings.stageCompact) return 'off'
    if (landed !== true) return 'unlanded'
    if (!compactEligible(command, workflow, end)) return `ineligible(${command.key})`
    return suggestion === null ? 'none' : 'suggest'
  }

  /**
   * One compaction after a landed stage: the toast, the call, one retry when
   * the engine refused the first as inside a turn, and a log line for a veto
   * or a second refusal. Never throws.
   */
  async function compactAfterStage(engine: Host, key: string, instructions: string): Promise<void> {
    engine.toast(compactToastOf(key, await engine.contextPercent()))
    // One attempt, here. The engine accepts `session.compact` from a
    // `turn.complete` hook and refuses it from any later event, so a retry on
    // a timer would ask from the one place that cannot be answered.
    await compactOnce(engine, instructions, 'turn.complete')
  }

  /** One compaction call, journalled with the engine's own words for a refusal. */
  async function compactOnce(engine: Host, instructions: string, label: string): Promise<'done' | 'skipped' | 'refused'> {
    try {
      const outcome = await engine.compact(instructions)
      if (outcome.skip === undefined) {
        void journal?.write({ event: 'compact', ok: true, detail: `${label} done` })
        return 'done'
      }
      engine.log(`wf: compaction skipped: ${outcome.skip}`)
      void journal?.write({ event: 'compact', ok: false, detail: `${label} skipped: ${outcome.skip}` })
      return 'skipped'
    } catch (error) {
      const message = messageOf(error)
      engine.log(`wf: compaction refused: ${message}`)
      void journal?.write({ event: 'compact', ok: false, detail: `${label} refused: ${message}` })
      return 'refused'
    }
  }

  on('session.compact', async ($, e, next) => {
    // Every compaction of the main conversation, while a workflow is active,
    // keeps the workflow's position: one sentence ahead of the instructions.
    // A precompute installs nothing and passes through.
    const workflow = activeWorkflow()
    if (!settings.stageCompact || e.agentId !== undefined || e.trigger === 'precompute' || workflow === null) return next(e)
    const sentence = compactKeepSentenceOf(workflow)
    if (e.instructions?.includes(sentence)) return next(e)
    const instructions = e.instructions === undefined || e.instructions === '' ? sentence : `${sentence} ${e.instructions}`
    return next({ ...e, instructions })
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
    // Any submission ends the pick: the person typed past it. A compaction
    // never happens here: the engine refuses `session.compact` from this hook,
    // because the hook holds the turn it would compact under.
    if (host && model.step !== null) close(host)
    return next(e)
  })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export { PLUGIN_NAME }
