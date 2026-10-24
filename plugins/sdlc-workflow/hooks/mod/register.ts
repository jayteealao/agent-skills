/**
 * The goal arming as a Claude Code mod. It has one job.
 *
 * The model cannot type the built-in `/goal`. When the turn of
 * `/wf loop goal <slug>` ends with an answer, the mod reads the arm request that
 * `goal.mjs arm` wrote (`hooks/mod/goal.ts`). It puts the `/goal` line into the
 * prompt box for the person's Enter. Where the surface draws its own prompt box
 * (the Desktop app), it sends the line as the person's prompt. The request
 * records how, so it is handed over once.
 *
 * Codex arms its goal with `create_goal`, and pi with the way that
 * `goal.mjs arm` prints; neither runs this module.
 */
import type { On, PluginOptions } from 'claude-code'

import { armHowOf, armRequestPathOf, armToastOf, armedRequestOf, findProjectRoot, goalSlugOf, pendingArmOf } from './goal.ts'

/** The names the bare dispatcher command may resolve to at `command.run`. */
const DISPATCHER_COMMANDS: readonly string[] = ['wf', 'sdlc-workflow:wf']
/** How long a dispatcher run names the turn that follows it. */
const LAST_RUN_WINDOW_MS = 10_000
const FILL_REFUSED_TEXT = 'The prompt box is not free; type the command in full: '

/** Every `$.noun.event` the mod calls after a dispatch is over, bound once at `session.start`. */
type Host = {
  exists: (path: string) => Promise<boolean>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  fill: (text: string) => Promise<{ isFilled: boolean; refusal?: string }>
  /** Queues `text` as the person's own prompt; it runs once the session is idle. */
  submit: (text: string) => Promise<unknown>
  toast: (text: string) => void
  log: (text: string) => void
  /** Runs `fn` once the current dispatch is over. */
  later: (fn: () => void) => void
  now: () => Promise<number>
}

export function register(on: On, _options: PluginOptions = {}) {
  let host: Host | null = null
  /** The directory holding `.ai/workflows`, or null when none. */
  let root: string | null = null
  /** The goal slug the dispatcher last ran, for a `turn.start` whose text is the expanded skill. */
  let lastRun: { slug: string; at: number } | null = null
  /** The goal slug of the main turn under way, or null. */
  let turnSlug: string | null = null

  on('session.start', async ($, e, next) => {
    host = {
      exists: path => $.fs.exists(path),
      read: path => $.fs.read(path),
      write: (path, text) => $.fs.write(path, text),
      fill: text => $.prompt.fill({ text }),
      submit: text => $.prompt.submit({ text, asUser: true }),
      toast: text => $.ui.toast(text),
      log: text => $.ui.log(text),
      later: fn => {
        $.clock.after(0, fn)
      },
      now: () => $.clock.now(),
    }
    root = null
    lastRun = null
    turnSlug = null
    try {
      root = await findProjectRoot(e.cwd, { read: path => $.fs.read(path), exists: path => $.fs.exists(path) })
    } catch {
      root = null
    }
    return next(e)
  })

  on('command.run', async ($, e, next) => {
    if (DISPATCHER_COMMANDS.includes(e.command)) {
      const slug = goalSlugOf(`/wf ${e.args}`)
      lastRun = slug === null ? null : { slug, at: await $.clock.now() }
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    const startedAt = await $.clock.now()
    // The text of a slash-command turn may be the expanded skill; the
    // dispatcher's own run, seconds before, names the command then.
    turnSlug = goalSlugOf(e.text) ?? (lastRun !== null && startedAt - lastRun.at < LAST_RUN_WINDOW_MS ? lastRun.slug : null)
    lastRun = null
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // A sub-agent raises `turn.complete` with its `agentId`. It is not the person's turn.
    if (e.agentId !== undefined) return result
    const slug = turnSlug
    turnSlug = null
    if (host !== null && root !== null && slug !== null && e.reason === 'answer') await armGoal(host, root, slug)
    return result
  })
}

/**
 * Hands the `/goal` line of a pending arm request over, once the current
 * dispatch is over, then records how and says it in a toast.
 */
async function armGoal(host: Host, root: string, slug: string): Promise<void> {
  const path = armRequestPathOf(root, slug)
  let text: string | null = null
  try {
    text = (await host.exists(path)) ? await host.read(path) : null
  } catch (error) {
    host.log(messageOf(error))
    return
  }
  const request = pendingArmOf(text, slug)
  if (request === null || request.command === null) return
  const command = request.command
  host.later(() => {
    void (async () => {
      let isFilled = false
      let refusal: string | undefined
      try {
        const filled = await host.fill(`${command} `)
        isFilled = filled.isFilled
        refusal = filled.refusal
      } catch (error) {
        host.log(messageOf(error))
      }
      const how = armHowOf(isFilled, refusal)
      if (how === 'submitted') {
        // Not awaited: the prompt runs once the session is idle.
        void host.submit(command).catch(error => host.log(`${FILL_REFUSED_TEXT}${command} (${messageOf(error)})`))
      }
      if (how === 'refused') host.log(`${FILL_REFUSED_TEXT}${command}`)
      try {
        await host.write(path, armedRequestOf(request, how, new Date(await host.now()).toISOString()))
      } catch (error) {
        host.log(messageOf(error))
      }
      host.toast(armToastOf(how))
    })()
  })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
