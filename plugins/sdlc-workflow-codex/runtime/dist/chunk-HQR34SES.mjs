import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/detach.mjs
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
var isWin = process.platform === "win32";
var HERE = dirname(fileURLToPath(import.meta.url));
var HIDDEN_VBS = join(HERE, "..", "lib", "launch-hidden.vbs");
var WSCRIPT = (() => {
  if (!isWin) return null;
  const sysRoot = process.env.SystemRoot || process.env.windir || "C:\\Windows";
  const p = join(sysRoot, "System32", "wscript.exe");
  return existsSync(p) ? p : "wscript.exe";
})();
function spawnDetached(command, args = [], {
  cwd = process.cwd(),
  env = process.env,
  stdio = "ignore"
} = {}) {
  if (isWin && WSCRIPT && existsSync(HIDDEN_VBS)) {
    const child2 = spawn(
      WSCRIPT,
      ["//nologo", "//b", HIDDEN_VBS, command, ...args],
      { cwd, env, detached: true, stdio: "ignore", windowsHide: true }
    );
    child2.unref();
    return child2;
  }
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio,
    windowsHide: true
  });
  child.unref();
  return child;
}
function spawnDetachedNode(scriptPath, args = [], opts = {}) {
  return spawnDetached(process.execPath, [scriptPath, ...args], opts);
}

export {
  spawnDetachedNode
};
