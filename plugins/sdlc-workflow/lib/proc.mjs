// Process helpers shared by the lib and the scripts: a liveness test and a tree kill.
import { spawnSync } from 'node:child_process';

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
