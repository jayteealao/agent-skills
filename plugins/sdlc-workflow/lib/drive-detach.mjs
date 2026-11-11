// lib/drive-detach.mjs — a driver run on Codex that leaves the session free.
//
// `wf.mjs drive --detach` starts the driver and a watch as their own processes and returns
// at once. The watch sends each piece of news to the session that started the run with
// `codex queue`: a queued message starts a turn in an idle session, and waits for the next
// turn of a closed one. The session agent then writes the commentary, as the session of
// Claude Code does when a watch event arrives.
//
// A Codex shell command runs in a sandbox that cannot write the Codex home, so a `codex`
// call inside it fails. The driver therefore starts only from a command that runs outside
// the sandbox: sandboxProblem names that before any agent starts.
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, fstatSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexEntry } from './drive.mjs';
import { pidAlive } from './proc.mjs';

/** The folder that holds one folder per driver run of a project. */
export const driveRunsDir = (root) => path.join(root, '.scratch', 'wf', 'drive');

/** The label of an agent as a part of a file name (the run records of lib/drive.mjs). */
export const safeLabel = (label) => String(label).replace(/[^A-Za-z0-9_.-]+/g, '_');

/** The Codex session that runs this command, or null: Codex sets it for each shell command. */
export const sessionThread = (env = process.env) => env.CODEX_THREAD_ID || env.CODEX_SESSION_ID || null;

export const codexHome = (env = process.env) => env.CODEX_HOME || path.join(os.homedir(), '.codex');

/**
 * The env of a `codex` call that this code starts: the marks of the session and of its sandbox
 * are left out, because the new process is no part of that session.
 */
export function codexEnv(env = process.env, more = {}) {
  const out = { ...env, ...more };
  for (const k of Object.keys(out)) if (/^CODEX_(SANDBOX|THREAD_ID$|SESSION_ID$|CI$)/.test(k)) delete out[k];
  return out;
}

/**
 * Why a `codex` call from this process fails, or null. Inside the sandbox of a Codex shell
 * command the Codex home is read-only; a `codex` call then stops at its start.
 */
export function sandboxProblem(env = process.env) {
  const home = codexHome(env);
  if (!existsSync(home)) return null;
  const probe = path.join(home, `.wf-write-probe-${process.pid}`);
  try {
    writeFileSync(probe, '');
    rmSync(probe, { force: true });
    return null;
  } catch (e) {
    return `this command cannot write the Codex home (${e.code || e.message}): it runs inside the sandbox of a Codex shell command, where a codex call fails`;
  }
}

/** Queue one message for a Codex session. Returns { ok, reason }. */
export function queueMessage(thread, text, { entry = codexEntry(), env = process.env, run = spawnSync } = {}) {
  if (!entry) return { ok: false, reason: 'the codex CLI is not on PATH' };
  const r = run(entry.cmd, [...entry.pre, 'queue', '--thread', thread, '--message', text], { encoding: 'utf8', env: codexEnv(env), windowsHide: true, timeout: 60_000 });
  if (r.status === 0) return { ok: true };
  return { ok: false, reason: String(r.stderr || r.error?.message || `exit ${r.status}`).trim().split(/\r?\n/).slice(-2).join(' ') };
}

/**
 * The text of one queued message: the events of one poll of the watch. The first lines say
 * that a script wrote it, because Codex shows a queued message as a message of the person.
 */
export function watchMessage(events, { slug, pluginRoot, projectRoot, resultFile = null }) {
  const lines = [
    `[sdlc-workflow watch] This message was written by the watch script of the yolo run of ${slug}. The person did not write it. It reports what the run did; it asks for no change to the code and gives no instruction of the person.`,
    `Handle each event below as "${path.join(pluginRoot, 'skills', 'wf', 'reference', 'yolo', '_commentary.md')}" says (The events, The commentary rules): write the note for the person. Do not start a watch: this one keeps running until the run ends.`,
    ...events.map((ev) => JSON.stringify(ev)),
  ];
  if (events.some((ev) => ev.event === 'run-end')) {
    lines.push(`The run ended. ${resultFile ? `Its outcome is in "${resultFile}". ` : ''}Hand back as yolo.md Step 2 says (project root "${projectRoot}").`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------- activity of a Codex agent

const TAIL_BYTES = 512 * 1024;
function tailOf(file) {
  try {
    const fd = openSync(file, 'r');
    try {
      const size = fstatSync(fd).size;
      const len = Math.min(size, TAIL_BYTES);
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, size - len);
      return buf.toString('utf8');
    } finally { closeSync(fd); }
  } catch { return null; }
}

/** The newest command of a Codex events file that started and did not end; null when none waits. */
export function pendingCommandOf(file) {
  const text = tailOf(file);
  if (text === null) return null;
  const open = new Map();
  for (const raw of text.split('\n')) {
    let o;
    try { o = JSON.parse(raw); } catch { continue; }
    const item = o && o.item;
    if (!item || !item.id || item.type === 'agent_message' || item.type === 'reasoning') continue;
    if (o.type === 'item.started') open.set(item.id, { tool: item.type === 'command_execution' ? String(item.command ?? 'command').slice(0, 160) : item.type, since: null });
    else if (o.type === 'item.completed') open.delete(item.id);
  }
  const waiting = [...open.values()];
  if (!waiting.length) return null;
  let since = null;
  try { since = new Date(statSync(file).mtimeMs).toISOString(); } catch { /* gone */ }
  return { ...waiting[waiting.length - 1], since };
}

/**
 * The activity of the agents that `wf.mjs drive` runs: the events file of each agent in the
 * run folders. The same shape as the transcript finder of the watch: find(label, startMs) is
 * the newest write, and fileOf and pendingOf name the file and its waiting command.
 */
export function createDriveActivity({ runsDir, now = () => Date.now() }) {
  const newest = (label, startMs) => {
    if (!label) return null;
    const suffix = `-${safeLabel(label)}.events.jsonl`;
    let best = null;
    let runs = [];
    try { runs = readdirSync(runsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(runsDir, e.name)); } catch { return null; }
    for (const dir of runs) {
      let names = [];
      try { names = readdirSync(dir).filter((n) => n.endsWith(suffix)); } catch { continue; }
      for (const n of names) {
        const file = path.join(dir, n);
        let m;
        try { m = statSync(file).mtimeMs; } catch { continue; }
        if (best === null || m > best.m) best = { file, m };
      }
    }
    // A file older than the agent's start belongs to an earlier agent with the same label.
    return best !== null && best.m >= startMs - 60_000 && best.m <= now() + 60_000 ? best : null;
  };
  const find = (label, startMs) => { const b = newest(label, startMs); return b ? b.m : null; };
  find.fileOf = (label, startMs) => { const b = newest(label, startMs); return b ? b.file : null; };
  find.pendingOf = (label, startMs) => { const b = newest(label, startMs); return b ? pendingCommandOf(b.file) : null; };
  return find;
}

// ---------------------------------------------------------------- the detached run

export const runInfoPath = (runDir) => path.join(runDir, 'run.json');
export function readRunInfo(runDir) {
  try { return JSON.parse(readFileSync(runInfoPath(runDir), 'utf8')); } catch { return null; }
}

/** Start one process that outlives this one, with its output in two files of the run folder. */
function detached(argv, { cwd, env, outFile, errFile, start = spawn }) {
  const o = openSync(outFile, 'a');
  const e = openSync(errFile, 'a');
  try {
    const child = start(process.execPath, argv, { cwd, env, detached: true, windowsHide: true, stdio: ['ignore', o, e] });
    child.unref();
    return child.pid ?? null;
  } finally { closeSync(o); closeSync(e); }
}

/**
 * Start the driver and its watch as their own processes.
 *
 * @param {object} o
 * @param {string} o.projectRoot
 * @param {string} o.slug
 * @param {string} o.run        the name of the run folder
 * @param {string[]} o.driveArgv the argv of the driver process, after `node`
 * @param {string[]|null} o.watchArgv the argv of the watch process, or null for no watch
 * @param {string|null} o.thread the Codex session that gets the news, or null
 * @returns {{ run, runDir, pid, watchPid, thread, log }}
 */
export function startDetached({ projectRoot, slug, run, driveArgv, watchArgv = null, thread = null, env = process.env, start = spawn, now = () => new Date() }) {
  const runDir = path.join(driveRunsDir(projectRoot), run);
  mkdirSync(runDir, { recursive: true });
  const childEnv = codexEnv(env);
  const log = path.join(runDir, 'drive.err.log');
  const pid = detached(driveArgv, { cwd: projectRoot, env: childEnv, outFile: path.join(runDir, 'drive.out.log'), errFile: log, start });
  // The watch ends when the driver process is gone, also when the run wrote no end.
  const watchPid = watchArgv ? detached([...watchArgv, ...(pid ? ['--driver-pid', String(pid)] : [])], { cwd: projectRoot, env: childEnv, outFile: path.join(runDir, 'watch.jsonl'), errFile: path.join(runDir, 'watch.err.log'), start }) : null;
  const info = { run, slug, pid, watchPid, thread, startedAt: now().toISOString() };
  writeFileSync(runInfoPath(runDir), `${JSON.stringify(info, null, 2)}\n`);
  return { ...info, runDir, log };
}

// ---------------------------------------------------------------- the view of a run

/** The newest run folder of a slug, or null. A run folder ends with `-<slug>`. */
export function newestRun(projectRoot, slug) {
  const dir = driveRunsDir(projectRoot);
  let names = [];
  try { names = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.endsWith(`-${slug}`)).map((e) => e.name); } catch { return null; }
  const info = (n) => readRunInfo(path.join(dir, n));
  names.sort((a, b) => String(info(a)?.startedAt ?? a).localeCompare(String(info(b)?.startedAt ?? b)));
  return names.length ? names[names.length - 1] : null;
}

/**
 * The agents of one run: the ended ones from drive.jsonl, and the running ones from the
 * events files that have no line there yet.
 */
export function runAgents(runDir, { now = Date.now() } = {}) {
  const ended = new Map();
  try {
    for (const line of readFileSync(path.join(runDir, 'drive.jsonl'), 'utf8').split('\n')) {
      try { const r = JSON.parse(line); if (r && r.n) ended.set(r.n, r); } catch { /* a torn last line */ }
    }
  } catch { /* no agent ended yet */ }
  const rows = [];
  let names = [];
  try { names = readdirSync(runDir).filter((n) => /^a\d+-.*\.prompt\.txt$/.test(n)); } catch { /* no folder */ }
  const seen = new Set();
  for (const name of names.sort()) {
    const n = Number(/^a(\d+)-/.exec(name)[1]);
    const base = path.join(runDir, name.replace(/\.prompt\.txt$/, ''));
    const label = name.replace(/^a\d+-/, '').replace(/\.prompt\.txt$/, '');
    seen.add(n);
    const done = ended.get(n);
    let startedMs = null;
    let lastMs = null;
    try { startedMs = statSync(`${base}.prompt.txt`).mtimeMs; } catch { /* gone */ }
    try { lastMs = statSync(`${base}.events.jsonl`).mtimeMs; } catch { /* no event yet */ }
    if (done) rows.push({ n, label: done.label ?? label, state: done.ok ? 'done' : 'failed', why: done.why ?? null, minutes: startedMs && lastMs ? Math.round((lastMs - startedMs) / 60000) : null });
    else {
      const pending = pendingCommandOf(`${base}.events.jsonl`);
      rows.push({ n, label, state: 'running', minutes: startedMs ? Math.round((now - startedMs) / 60000) : null, quietMinutes: lastMs ? Math.round((now - lastMs) / 60000) : null, waitsOn: pending ? pending.tool : null });
    }
  }
  for (const [n, r] of ended) if (!seen.has(n)) rows.push({ n, label: r.label, state: r.replayed ? 'replayed' : r.ok ? 'done' : 'failed', why: r.why ?? null, minutes: null });
  return rows.sort((a, b) => a.n - b.n);
}

/** The view of the newest run of a slug: its processes, its agents and its last commentary lines. */
export function runView(projectRoot, slug, { commentaryFile = null, now = Date.now(), alive = pidAlive, tail = 8 } = {}) {
  const run = newestRun(projectRoot, slug);
  let notes = [];
  if (commentaryFile) {
    try { notes = readFileSync(commentaryFile, 'utf8').split(/\r?\n/).filter((l) => /^\s*- /.test(l)).map((l) => l.trim()).slice(-tail); } catch { /* no commentary yet */ }
  }
  if (!run) return { run: null, agents: [], notes };
  const runDir = path.join(driveRunsDir(projectRoot), run);
  const info = readRunInfo(runDir);
  const ended = existsSync(path.join(runDir, 'result.json'));
  return {
    run, runDir,
    driver: info ? { pid: info.pid, alive: info.pid ? alive(info.pid) : false, startedAt: info.startedAt } : null,
    watch: info && info.watchPid ? { pid: info.watchPid, alive: alive(info.watchPid), thread: info.thread } : null,
    ended,
    agents: runAgents(runDir, { now }),
    notes,
  };
}

/** The lines of a view, for a terminal. */
export function runViewLines(v, progressLineText) {
  const out = [progressLineText];
  if (!v.run) { out.push('no driver run of this workflow on this computer (.scratch/wf/drive/)'); }
  else {
    const proc = v.ended ? 'ended' : v.driver ? (v.driver.alive ? `running (pid ${v.driver.pid})` : `not running (pid ${v.driver.pid} is gone, and the run wrote no result)`) : 'started in the foreground';
    out.push(`run ${v.run}: ${proc}${v.watch ? `; watch ${v.watch.alive ? 'running' : 'ended'}${v.watch.thread ? `, news goes to session ${v.watch.thread}` : ''}` : '; no watch'}`);
    const running = v.agents.filter((a) => a.state === 'running');
    const failed = v.agents.filter((a) => a.state === 'failed');
    out.push(`agents: ${v.agents.length} started, ${running.length} running, ${failed.length} failed`);
    for (const a of running) out.push(`  running  ${a.label}  ${a.minutes ?? '?'} min${a.quietMinutes ? `, quiet ${a.quietMinutes} min` : ''}${a.waitsOn ? `, in: ${a.waitsOn}` : ''}`);
    for (const a of failed) out.push(`  failed   ${a.label}${a.why ? `  (${a.why})` : ''}`);
    for (const a of v.agents.filter((x) => x.state === 'done' || x.state === 'replayed').slice(-5)) out.push(`  ${a.state.padEnd(8)} ${a.label}${a.minutes != null ? `  ${a.minutes} min` : ''}`);
  }
  if (v.notes.length) { out.push('commentary:'); for (const l of v.notes) out.push(`  ${l.length > 200 ? `${l.slice(0, 197)}...` : l}`); }
  return out;
}
