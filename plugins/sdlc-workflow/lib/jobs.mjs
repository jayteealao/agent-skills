// The long commands of a run (`wf.mjs talk job`): a command that takes longer than one shell
// call of an agent runs as a job. The job is its own process with its output in a log file of
// this machine, and the agent waits for its end with `talk wait --job`, a call that also returns
// when a message arrives.
//
// A job is recorded in <root>/.ai/run/<slug>/jobs/<id>.json: the command, the log, the process
// of its runner, and at its end the exit code. A job may hold a shared resource: its runner
// renews the lease while the command runs, and gives the resource back at the end.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileAtomic } from './atomic-write.mjs';
import { agentFix, refuse } from './fix.mjs';
import { pidAlive } from './proc.mjs';
import { runDir, runRoot } from './records-root.mjs';
import { SUITE_LOG_DIR, ensureRunDir } from './run-files.mjs';
import { release } from './talk.mjs';

export const JOBS_DIR = 'jobs';
/** The lines from the end of the log that the end of a job prints. */
export const JOB_TAIL = 40;
/** The runner writes that it lives this often. */
export const JOB_BEAT_MS = 30 * 1000;

const RUNNER = fileURLToPath(new URL('../scripts/job-run.mjs', import.meta.url));
const iso = (ms = Date.now()) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
const safe = (s) => String(s ?? '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60) || 'job';

export const jobsDir = (projectRoot, slug) => join(runDir(projectRoot, slug), JOBS_DIR);
export const jobFile = (projectRoot, slug, id) => join(jobsDir(projectRoot, slug), `${safe(id)}.json`);

export function readJob(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

/** Change fields of a job record. */
export function writeJob(file, change) {
  const next = { ...(readJob(file) ?? {}), ...change };
  writeFileAtomic(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

/**
 * Start a command as a job and return at once.
 *
 * @param {string} projectRoot
 * @param {string} slug
 * @param {object} o
 * @param {string} o.command the command line, run in a shell
 * @param {string} o.by the actor that starts it
 * @param {string} [o.name] a short name for the log file
 * @param {string} [o.cwd] the folder of the command; the project root when absent
 * @param {{ dir: string, resource: string, epoch: number, leaseMs?: number }} [o.hold] the claim that the job keeps
 * @returns {object} the job record
 */
export function startJob(projectRoot, slug, { command, by, name = 'job', cwd = null, hold = null, maxMs = JOB_MAX_MS, hostPid = null, now = Date.now(), run = spawn } = {}) {
  if (!String(command ?? '').trim()) {
    throw refuse('talk job: the command is required', agentFix('Run the command again with the command line after `--`.', null));
  }
  const dir = join(ensureRunDir(projectRoot, slug), JOBS_DIR);
  mkdirSync(dir, { recursive: true });
  let logDir = join(runRoot(projectRoot), SUITE_LOG_DIR);
  try { mkdirSync(logDir, { recursive: true }); } catch { logDir = join(tmpdir(), 'sdlc-suite-logs'); mkdirSync(logDir, { recursive: true }); }
  const stamp = iso(now).replace(/[-:]/g, '');
  const id = `J-${stamp}-${Math.random().toString(16).slice(2, 6)}`;
  const file = join(dir, `${id}.json`);
  const job = {
    id, name: safe(name), by, command: String(command), cwd: cwd ?? projectRoot, log: join(logDir, `${safe(name)}-${stamp}-${id.slice(-4)}.log`),
    state: 'running', startedAt: iso(now), ...(hold ? { hold } : {}), maxMs, ...(Number.isInteger(hostPid) && hostPid > 0 ? { hostPid } : {}), projectRoot, slug,
  };
  writeFileAtomic(file, `${JSON.stringify(job, null, 2)}\n`);
  const child = run(process.execPath, [RUNNER, file], { detached: true, stdio: 'ignore', windowsHide: true, cwd: job.cwd });
  child.unref?.();
  // The runner writes its own process into the record: a second writer here would race it.
  return { ...job, runnerPid: child.pid ?? null };
}

/** The last lines of a log file. */
export function tailOf(log, lines = JOB_TAIL) {
  try {
    const size = statSync(log).size;
    const text = readFileSync(log, 'utf8');
    return { size, tail: text.split(/\r?\n/).filter((l, i, a) => l.length || i < a.length - 1).slice(-lines).join('\n') };
  } catch { return { size: 0, tail: '' }; }
}

/**
 * The state of a job now: `running`, `done` (with `exit`), or `lost` (its runner is gone and it
 * wrote no end: the machine restarted, or the process was killed).
 */
export function jobState(projectRoot, slug, id, { alive = pidAlive, now = Date.now() } = {}) {
  const file = jobFile(projectRoot, slug, id);
  const job = readJob(file);
  if (!job) throw refuse(`talk: no job ${id}`, agentFix('Run talk jobs to see the jobs of this workflow.'));
  // A runner that never wrote its process did not start.
  if (job.state === 'running' && !Number.isInteger(job.runnerPid) && now - Date.parse(job.startedAt) > 30_000) return { ...job, state: 'lost' };
  if (job.state === 'running' && Number.isInteger(job.runnerPid) && !alive(job.runnerPid)) {
    // The runner writes its end before it exits: read once more before the job is called lost.
    const again = readJob(file);
    if (again?.state === 'running') return { ...again, state: 'lost' };
    return again;
  }
  return job;
}

/** The jobs of a workflow, newest first, each with its state now. */
export function listJobs(projectRoot, slug, o = {}) {
  const dir = jobsDir(projectRoot, slug);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith('.json')).sort().reverse()
    .map((n) => { try { return jobState(projectRoot, slug, n.replace(/\.json$/, ''), o); } catch { return null; } })
    .filter(Boolean);
}

/**
 * End a process and every process that it started. The command of a job runs under a shell, so
 * the end of the shell alone leaves the command running.
 */
export function killTree(pid) {
  if (process.platform === 'win32') { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); return; }
  // The runner is the leader of its own process group: the group is the runner, the shell and the command.
  try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } }
}

/** The time limit of a job when the starter gives none: 2 hours. */
export const JOB_MAX_MS = 2 * 60 * 60 * 1000;

/** Stop the jobs of a workflow that still run (with `by`: only the jobs of that actor). Returns the ids that were stopped. */
export function stopJobs(projectRoot, slug, { by = null, kill = killTree, alive = pidAlive } = {}) {
  const stopped = [];
  for (const job of listJobs(projectRoot, slug, { alive })) {
    if (job.state !== 'running' || (by && job.by !== by)) continue;
    for (const pid of [job.runnerPid, job.childPid]) {
      if (Number.isInteger(pid) && alive(pid)) { try { kill(pid); } catch { /* a process that is gone is stopped */ } }
    }
    // The runner had no time to give the resource back.
    if (job.hold) { try { release(job.hold.dir, job.by, job.hold.resource, { epoch: job.hold.epoch, scope: job.hold.scope ?? null }); } catch { /* the lease is over */ } }
    writeJob(jobFile(projectRoot, slug, job.id), { state: 'done', exit: null, stopped: true, endedAt: iso() });
    stopped.push(job.id);
  }
  return stopped;
}

/** One line of a job. */
export function jobLine(j) {
  const end = j.state === 'done' ? (j.hostGone ? 'ended, because the host of its run was gone' : j.stopped ? 'stopped' : j.timedOut ? `ended at its time limit of ${Math.round(j.maxMs / 60000)} minutes` : `exit ${j.exit}`) : j.state;
  return `${j.id} ${j.name} by ${j.by}: ${end}, started ${String(j.startedAt).slice(11, 16)}${j.endedAt ? `, ended ${String(j.endedAt).slice(11, 16)}` : ''}${j.hold ? `, holds ${j.hold.resource}` : ''} — ${j.log}`;
}
