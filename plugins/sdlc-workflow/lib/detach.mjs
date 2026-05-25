import { spawn } from 'node:child_process';

export function spawnDetached(command, args = [], {
  cwd = process.cwd(),
  env = process.env,
  stdio = 'ignore',
} = {}) {
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio,
    windowsHide: true,
  });
  child.unref();
  return child;
}

export function spawnDetachedNode(scriptPath, args = [], opts = {}) {
  return spawnDetached(process.execPath, [scriptPath, ...args], opts);
}
