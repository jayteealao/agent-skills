import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const isWin = process.platform === 'win32';
const HERE = dirname(fileURLToPath(import.meta.url));
// Resolve from the plugin root (HERE/..), NOT HERE, so the path survives esbuild
// bundling into dist/ (depth-1): lib/ (source) and dist/ (bundled) both sit one
// level under the plugin root, so `../lib/launch-hidden.vbs` resolves to the real
// committed shim in both modes. (The .vbs is data, not bundled, so it stays in lib/.)
const HIDDEN_VBS = join(HERE, '..', 'lib', 'launch-hidden.vbs');

// Resolve wscript.exe from the system dir; fall back to the bare name on PATH.
const WSCRIPT = (() => {
  if (!isWin) return null;
  const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
  const p = join(sysRoot, 'System32', 'wscript.exe');
  return existsSync(p) ? p : 'wscript.exe';
})();

export function spawnDetached(command, args = [], {
  cwd = process.cwd(),
  env = process.env,
  stdio = 'ignore',
} = {}) {
  // On Windows, detached:true forces a console window that windowsHide cannot
  // suppress (nodejs/node#21825) — a terminal "flash" on every detached spawn.
  // Route through wscript.exe (a GUI-subsystem host with no console) which
  // launches the real command with a hidden window via launch-hidden.vbs.
  // wscript itself is spawned detached so the launched process lands in a new
  // process group and survives the parent's group signals; cwd and env are
  // inherited by wscript and passed through to the child. Falls back to the
  // legacy detached spawn if WSH is unavailable (it flashes, but still works).
  if (isWin && WSCRIPT && existsSync(HIDDEN_VBS)) {
    const child = spawn(
      WSCRIPT,
      ['//nologo', '//b', HIDDEN_VBS, command, ...args],
      { cwd, env, detached: true, stdio: 'ignore', windowsHide: true },
    );
    child.unref();
    return child;
  }

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
