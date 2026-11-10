// Process helpers shared by the lib and the scripts: a liveness test, a tree kill, and the
// main-module test of a script.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const realPath = (p) => { try { return realpathSync.native(p); } catch { return realpathSync(p); } };

/**
 * True when the module of `metaUrl` is the script that node was started with (`process.argv[1]`).
 * Both sides are compared as real paths, so a checkout reached through a symlink, a junction or
 * a `subst` drive, or a path with a space or another character that a file URL encodes, still
 * matches. Case does not matter on Windows. False when there is no script path or it cannot be read.
 */
export function isMainModule(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  let a;
  let b;
  try {
    a = realPath(resolve(argv1));
    b = realPath(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** True while the process `pid` runs. A pid that is not a positive integer is false; EPERM means it runs under another user. */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

/**
 * Kill the process `pid` and its children. On Windows, `taskkill /T /F` ends the tree. On POSIX the
 * process group goes first, which reaches the children of a child spawned with `detached: true`; when
 * there is no such group, the pid alone gets SIGKILL. A process that is gone already is no error.
 */
export function killTree(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
}

// The runner of runShell: a node child that reads the spec on stdin, starts the command through the shell, ends the whole
// tree of the command when the time is up, and prints one JSON result. The command's children
// hold the pipes of the runner, never those of the caller, so the caller's wait ends with the
// runner.
const SHELL_RUNNER = `
const { spawn, spawnSync } = require('node:child_process');
const chunks = [];
process.stdin.on('data', (d) => chunks.push(d));
process.stdin.on('end', () => {
const spec = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const child = spawn(spec.command, { cwd: spec.cwd, env: spec.env, shell: true, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
const out = []; const err = []; let timedOut = false; let spawnError = null;
child.stdout.on('data', (d) => out.push(d)); child.stderr.on('data', (d) => err.push(d));
child.on('error', (e) => { spawnError = { code: e.code ?? null, message: e.message }; });
const kill = () => {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch {} } }
};
const timer = spec.timeoutMs ? setTimeout(() => { timedOut = true; kill(); }, spec.timeoutMs) : null;
let done = false;
const finish = (status, signal) => {
  if (done) return; done = true; if (timer) clearTimeout(timer);
  process.stdout.write(JSON.stringify({ status, signal, timedOut, error: spawnError, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }));
};
child.on('close', finish);
// A child that holds the pipes after the tree kill does not hold the result: it goes once the shell is gone.
child.on('exit', (status, signal) => { if (timedOut) setTimeout(() => finish(status, signal), 2000).unref(); });
child.stdin.on('error', () => {});
child.stdin.end(spec.input ?? '');
});
`;

/**
 * Run the shell command `command` in `cwd` and wait for it. When it runs past `timeoutMs`, the
 * whole process tree of the command is ended (killTree), not only the shell. No console window
 * opens on Windows. `env` replaces the environment. Returns the shape of spawnSync:
 * `{ status, signal, stdout, stderr, error, timedOut }`; a command that timed out has
 * `status: null` and `error.code === 'ETIMEDOUT'`.
 */
export function runShell(command, { cwd = process.cwd(), timeoutMs = null, env = process.env, input = '', maxBuffer = 64 * 1024 * 1024 } = {}) {
  const spec = JSON.stringify({ command, cwd, env, input, timeoutMs: timeoutMs || null });
  // The outer time box only guards against a runner that hangs itself.
  const outer = timeoutMs ? timeoutMs + 30_000 : undefined;
  const r = spawnSync(process.execPath, ['-e', SHELL_RUNNER], { input: spec, encoding: 'utf8', windowsHide: true, timeout: outer, maxBuffer });
  let res = null;
  try { res = JSON.parse(r.stdout); } catch { /* the runner failed */ }
  if (!res) {
    return { status: null, signal: r.signal ?? null, stdout: '', stderr: String(r.stderr ?? ''), timedOut: r.error?.code === 'ETIMEDOUT', error: r.error ?? new Error(`the command could not be run: ${String(r.stderr ?? '').trim()}`) };
  }
  if (res.timedOut) return { status: null, signal: res.signal ?? 'SIGKILL', stdout: res.stdout, stderr: res.stderr, timedOut: true, error: Object.assign(new Error(`the command timed out after ${timeoutMs} ms`), { code: 'ETIMEDOUT' }) };
  const error = res.error ? Object.assign(new Error(res.error.message), { code: res.error.code }) : undefined;
  return { status: res.status, signal: res.signal, stdout: res.stdout, stderr: res.stderr, timedOut: false, error };
}
