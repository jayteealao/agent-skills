/**
 * The mod's probe journal: what ran, on which host and surface (MOD-DESKTOP-PLAN.md).
 *
 * The mod loads wherever Claude Code loads a hooks module, and only some
 * surfaces draw. A person cannot read that from a transcript, so every
 * session appends a few rows to `<home>/.sdlc/mod-probe.jsonl`, and
 * `scripts/mod-probe.mjs` turns the rows into one verdict per host and
 * surface. `verdictOf` below is that judgment; the script imports it, so the
 * table and the tests read the same code.
 *
 * Nothing here throws at its caller: a journal that cannot be read or written
 * leaves the mod as it is.
 */

/** The events a row carries, in the order a session writes them. */
export type ProbeEvent = 'load' | 'attach' | 'commands' | 'turn' | 'compact' | 'call'

/** One line of the journal. */
export type ProbeRow = {
  /** ISO-8601 UTC, to the second. */
  at: string
  /** The first 8 characters of the session's id, to group a session's rows. */
  session: string
  /** The host, from `CLAUDE_CODE_ENTRYPOINT`; `unknown` when the variable is absent. */
  host: string
  /** Where the session draws at the moment of the row; `none` before any surface. */
  surface: string
  /** Whether a person is at the prompt, as `session.start` reported it. */
  interactive: boolean
  event: ProbeEvent
  /** False for a call that failed or a decision that did not run. */
  ok: boolean
  /** One short phrase: the counts, the key, the outcome, or the error message. */
  detail: string
}

/** The journal's path under the sdlc home directory. */
export const PROBE_FILE = 'mod-probe.jsonl'
/** Rows past this count are dropped from the front at the next write. */
export const PROBE_CAP = 400
/** A detail longer than this is cut, so one row stays one short line. */
const DETAIL_CAP = 160

/** The row a caller hands the journal, without the fields every row shares. */
export type ProbeFact = { event: ProbeEvent; ok: boolean; detail?: string }

/** The fields every row of one session shares. */
export type ProbeIdentity = { session: string; host: string; surface: string; interactive: boolean }

/** One row from an identity, a fact, and the clock. */
export function rowOf(identity: ProbeIdentity, fact: ProbeFact, nowMs: number): ProbeRow {
  return {
    at: new Date(nowMs).toISOString().replace(/\.\d{3}Z$/u, 'Z'),
    session: identity.session,
    host: identity.host,
    surface: identity.surface,
    interactive: identity.interactive,
    event: fact.event,
    ok: fact.ok,
    detail: (fact.detail ?? '').slice(0, DETAIL_CAP),
  }
}

/** Every row a journal text holds; a line that does not parse is dropped. */
export function rowsOf(text: string): ProbeRow[] {
  const rows: ProbeRow[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      const value = JSON.parse(trimmed) as Partial<ProbeRow>
      if (typeof value.at !== 'string' || typeof value.event !== 'string') continue
      rows.push({
        at: value.at,
        session: typeof value.session === 'string' ? value.session : '',
        host: typeof value.host === 'string' ? value.host : 'unknown',
        surface: typeof value.surface === 'string' ? value.surface : 'none',
        interactive: value.interactive === true,
        event: value.event as ProbeEvent,
        ok: value.ok !== false,
        detail: typeof value.detail === 'string' ? value.detail : '',
      })
    } catch {
      // A half-written line from a killed process is not an error; drop it.
    }
  }
  return rows
}

/** The journal's text from its rows, newest last, capped at `PROBE_CAP`. */
export function textOf(rows: readonly ProbeRow[]): string {
  const kept = rows.slice(Math.max(0, rows.length - PROBE_CAP))
  return kept.map(row => JSON.stringify(row)).join('\n') + (kept.length > 0 ? '\n' : '')
}

/** What one host and surface did, as the table prints it. */
export type ProbeVerdict = {
  host: string
  surface: string
  /** Sessions seen for this host and surface. */
  sessions: number
  /** The newest row's `at`. */
  lastAt: string
  /** True when at least one session bound the host here. */
  loaded: boolean
  /** The commands registered, from the newest `commands` row; null when none was written. */
  commands: string | null
  /** Whether every command registered; null when no `commands` row was written. */
  commandsOk: boolean | null
  /** `/wf` turns seen, and the turns that took a workflow action. */
  turns: number
  actions: number
  /** Compactions by outcome, for example `done 3 · refused 1`; empty when none ran. */
  compactions: string
  /** The capability calls that failed here, newest first, at most three. */
  failures: string[]
  /** `ok` when the module loaded here, `dead` when it did not. */
  status: 'ok' | 'dead'
}

/** One verdict per host and surface, newest activity first. */
export function verdictOf(rows: readonly ProbeRow[]): ProbeVerdict[] {
  const groups = new Map<string, ProbeRow[]>()
  for (const row of rows) {
    const key = `${row.host}\u0000${row.surface}`
    const known = groups.get(key)
    if (known === undefined) groups.set(key, [row])
    else known.push(row)
  }
  const verdicts: ProbeVerdict[] = []
  for (const [key, group] of groups) {
    const [host = 'unknown', surface = 'none'] = key.split('\u0000')
    const compactions = new Map<string, number>()
    for (const row of group) {
      if (row.event !== 'compact') continue
      const outcome = row.detail === '' ? 'done' : row.detail
      compactions.set(outcome, (compactions.get(outcome) ?? 0) + 1)
    }
    const turnRows = group.filter(row => row.event === 'turn')
    const commandRow = group.filter(row => row.event === 'commands').at(-1)
    verdicts.push({
      host,
      surface,
      sessions: new Set(group.map(row => row.session)).size,
      lastAt: group.map(row => row.at).sort().at(-1) ?? '',
      loaded: group.some(row => row.event === 'load' && row.ok),
      commands: commandRow?.detail ?? null,
      commandsOk: commandRow === undefined ? null : commandRow.ok,
      turns: turnRows.length,
      actions: turnRows.filter(row => row.ok).length,
      compactions: [...compactions].map(([name, count]) => `${name} ${count}`).join(' · '),
      failures: group
        .filter(row => row.event === 'call' && !row.ok)
        .slice(-3)
        .reverse()
        .map(row => row.detail),
      status: group.some(row => row.event === 'load' && row.ok) ? 'ok' : 'dead',
    })
  }
  return verdicts.sort((a, b) => b.lastAt.localeCompare(a.lastAt))
}

/**
 * The surface a session draws on after a client attaches: the one it already
 * had, else the one the client brought. A terminal session that a phone joins
 * keeps drawing its band and its pinned line in the terminal.
 */
export function surfaceAfterAttach(current: string | null, attached: string): string {
  return current ?? attached
}

/** Rows newer than `sinceMs`; every row when `sinceMs` is null. */
export function sinceOf(rows: readonly ProbeRow[], sinceMs: number | null): ProbeRow[] {
  if (sinceMs === null) return [...rows]
  return rows.filter(row => {
    const at = Date.parse(row.at)
    return Number.isNaN(at) || at >= sinceMs
  })
}

/** What the journal needs of the engine: a read that may fail, and a write. */
export type ProbeIo = {
  read: (path: string) => Promise<string | null>
  write: (path: string, text: string) => Promise<void>
  now: () => Promise<number>
}

/**
 * The journal a session writes through. Writes are serialized on one promise
 * chain, because `$.fs.write` replaces the whole file and two writes at once
 * would lose a row.
 */
export class ProbeJournal {
  #io: ProbeIo
  #path: string
  #identity: ProbeIdentity
  #queue: Promise<void> = Promise.resolve()
  /** The call kinds already recorded as failed, so one kind is one row per session. */
  #reported = new Set<string>()

  constructor(io: ProbeIo, path: string, identity: ProbeIdentity) {
    this.#io = io
    this.#path = path
    this.#identity = identity
  }

  /** Moves the session onto a surface, for the rows that follow. */
  setSurface(surface: string): void {
    this.#identity = { ...this.#identity, surface }
  }

  get surface(): string {
    return this.#identity.surface
  }

  /**
   * Appends one row. Never rejects; a failed journal is silent.
   *
   * The identity is taken now, not when the queued write runs, so a row keeps
   * the surface the fact happened under even when a client attaches meanwhile.
   */
  write(fact: ProbeFact): Promise<void> {
    const identity = this.#identity
    this.#queue = this.#queue.then(async () => {
      try {
        const text = (await this.#io.read(this.#path)) ?? ''
        const rows = rowsOf(text)
        rows.push(rowOf(identity, fact, await this.#io.now()))
        await this.#io.write(this.#path, textOf(rows))
      } catch {
        // A journal that cannot be written changes nothing else.
      }
    })
    return this.#queue
  }

  /** Records the first failure of one call kind, and drops the rest. */
  callFailed(kind: string, message: string): void {
    if (this.#reported.has(kind)) return
    this.#reported.add(kind)
    void this.write({ event: 'call', ok: false, detail: `${kind}: ${message}` })
  }

  /** Waits for every queued write; the tests use it. */
  settled(): Promise<void> {
    return this.#queue
  }
}
