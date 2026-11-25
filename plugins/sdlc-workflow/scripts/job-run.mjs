#!/usr/bin/env node
// The runner of one long command of a run (`wf.mjs talk job`). It is started detached, with the
// record of the job as its one argument. It runs the command with its output in the log file,
// keeps the claim of the job alive, marks the run as busy, and writes the exit code at the end.
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { JOB_BEAT_MS, killTree, readJob, writeJob } from '../lib/jobs.mjs';
import { markBusy } from '../lib/progress.mjs';
import { pidAlive } from '../lib/proc.mjs';
import { release, renew } from '../lib/talk.mjs';

const file = process.argv[2];
const job = file ? readJob(file) : null;
if (!job) process.exit(2);

const iso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const quiet = (fn) => { try { return fn(); } catch { return null; } };

// The commit and the state of the tree that the command runs on: a check takes its commit from here.
const gitOut = (args) => { const r = spawnSync('git', ['-C', job.cwd, ...args], { encoding: 'utf8', windowsHide: true }); return r.status === 0 ? r.stdout.trim() : null; };
const headOf = () => gitOut(['rev-parse', 'HEAD']);
const head = headOf();
const dirty = (gitOut(['status', '--porcelain', '--untracked-files=no']) ?? '').split(/\r?\n/).filter(Boolean).map((l) => l.slice(3));

const fd = openSync(job.log, 'a');
const child = spawn(job.command, { cwd: job.cwd, shell: true, stdio: ['ignore', fd, fd], windowsHide: true });
writeJob(file, { runnerPid: process.pid, childPid: child.pid ?? null, head, dirty });
const startedMs = Date.now();
let timedOut = false;
let hostGone = false;
quiet(() => markBusy(job.projectRoot, `the job ${job.name}`));

let claimLost = false;
const beat = setInterval(() => {
  quiet(() => writeJob(file, { beatAt: iso() }));
  quiet(() => markBusy(job.projectRoot, `the job ${job.name}`));
  if (job.hold && !claimLost) {
    // A lease that is lost stays lost: the command runs on, and the end of the job says so.
    try { renew(job.hold.dir, job.by, job.hold.resource, { epoch: job.hold.epoch, scope: job.hold.scope ?? null, ...(job.hold.leaseMs ? { leaseMs: job.hold.leaseMs } : {}) }); } catch { claimLost = true; }
  }
}, JOB_BEAT_MS);

// The two ends that the command does not choose, looked at every 2 seconds:
// - The job belongs to a run. When the host process of that run is gone, nobody waits for the job.
// - A command that outlives its limit is ended: a job that hangs holds no resource for ever.
const guard = setInterval(() => {
  if (timedOut || hostGone) return;
  if (job.hostPid && !pidAlive(job.hostPid)) hostGone = true;
  else if (job.maxMs && Date.now() - startedMs > job.maxMs) timedOut = true;
  if (timedOut || hostGone) quiet(() => killTree(child.pid));
}, 2000);

function end(exit, signal) {
  clearInterval(beat);
  clearInterval(guard);
  quiet(() => closeSync(fd));
  if (job.hold && !claimLost) quiet(() => release(job.hold.dir, job.by, job.hold.resource, { epoch: job.hold.epoch, scope: job.hold.scope ?? null }));
  quiet(() => markBusy(job.projectRoot, null));
  // A job that `talk jobs --stop` ended keeps that end.
  if (readJob(file)?.state === 'running') writeJob(file, { state: 'done', exit: timedOut || hostGone ? null : exit ?? null, ...(timedOut ? { timedOut: true } : {}), ...(hostGone ? { hostGone: true, stopped: true } : {}), headEnd: headOf(), ...(signal ? { signal } : {}), ...(claimLost ? { claimLost: true } : {}), endedAt: iso() });
  process.exit(0);
}
child.on('exit', (code, signal) => end(code, signal));
child.on('error', (e) => { quiet(() => writeJob(file, { error: e.message })); end(127, null); });
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { quiet(() => child.kill()); });
