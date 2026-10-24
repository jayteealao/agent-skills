import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  logLifecycle,
  machineConfigPath,
  sdlcHomeDir
} from "./chunk-BSVWX5RF.mjs";

// lib/machine-cleanup.mjs
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var MARKER = ".v10-cleanup.json";
var STATE_ENTRIES = Object.freeze([
  "hub.pid",
  "hub-config.json",
  "hub-history.jsonl",
  "hub.log",
  "hub.log.1",
  "hub.log.2",
  "active-runtime.json",
  "runtime",
  "registry.json",
  "registry.d",
  "registry.prune.log",
  "registry.prune.log.1",
  "registry.prune.log.2",
  "hub.lock",
  "hub-upgrade.lock",
  "hub-upgrade.previous.json",
  "tray.heartbeat.json",
  ".tray-heal",
  "bin",
  "doctor.txt"
]);
var HUB_SCRIPT = /hub-serve\.mjs/i;
var TRAY_SCRIPT = /[\\/]tray\.mjs/i;
function trayLauncherPath({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  if (platform === "win32") {
    const appData = env.APPDATA || join(home, "AppData", "Roaming");
    return join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "SDLC Sunflower Tray.vbs");
  }
  if (platform === "darwin") return join(home, "Library", "LaunchAgents", "com.sdlc.sunflower-tray.plist");
  return join(env.XDG_CONFIG_HOME || join(home, ".config"), "autostart", "sdlc-sunflower-tray.desktop");
}
function readPid(path) {
  try {
    const n = Number(JSON.parse(readFileSync(path, "utf-8"))?.pid);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
function carryConsent(home) {
  let old;
  try {
    old = JSON.parse(readFileSync(join(home, "hub-config.json"), "utf-8"));
  } catch {
    return true;
  }
  if (!old || typeof old.externalDispatch !== "object" || old.externalDispatch === null) return true;
  const target = machineConfigPath(home);
  let cfg = {};
  try {
    cfg = JSON.parse(readFileSync(target, "utf-8")) ?? {};
  } catch {
  }
  if (cfg.externalDispatch !== void 0) return true;
  try {
    writeFileSync(target, `${JSON.stringify({ ...cfg, externalDispatch: old.externalDispatch }, null, 2)}
`, "utf-8");
    return true;
  } catch {
    return false;
  }
}
function commandLineOf(pid, { platform = process.platform, exec = spawnSync } = {}) {
  const r = platform === "win32" ? exec("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`
  ], { encoding: "utf-8", timeout: 15e3, windowsHide: true }) : exec("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf-8", timeout: 5e3 });
  const text = String(r?.stdout ?? "").trim();
  return r?.status === 0 && text ? text : null;
}
function stopProcessTree(pid, { platform = process.platform, exec = spawnSync } = {}) {
  if (platform === "win32") {
    return exec("taskkill", ["/F", "/T", "/PID", String(pid)], { encoding: "utf-8", timeout: 15e3, windowsHide: true })?.status === 0;
  }
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}
function runMachineCleanup({
  home = sdlcHomeDir(),
  platform = process.platform,
  env = process.env,
  userHome = homedir(),
  exec = spawnSync,
  now = () => /* @__PURE__ */ new Date()
} = {}) {
  const marker = join(home, MARKER);
  if (existsSync(marker)) return { skipped: true };
  const stopped = [];
  const left = [];
  for (const [name, file, script] of [["hub", "hub.pid", HUB_SCRIPT], ["tray", "tray.heartbeat.json", TRAY_SCRIPT]]) {
    const pid = readPid(join(home, file));
    if (!pid) continue;
    const cmd = commandLineOf(pid, { platform, exec });
    if (!cmd) continue;
    if (!script.test(cmd)) continue;
    if (stopProcessTree(pid, { platform, exec })) stopped.push(`${name} ${pid}`);
    else left.push(`${name} process ${pid}`);
  }
  const removed = [];
  const launcher = trayLauncherPath({ platform, env, home: userHome });
  try {
    if (existsSync(launcher) && /tray/i.test(readFileSync(launcher, "utf-8"))) {
      rmSync(launcher, { force: true });
      removed.push(launcher);
    }
  } catch {
    left.push(launcher);
  }
  const consentKept = carryConsent(home);
  if (!consentKept) left.push(join(home, "hub-config.json"));
  for (const entry of STATE_ENTRIES) {
    const path = join(home, entry);
    if (!existsSync(path)) continue;
    if (entry === "hub-config.json" && !consentKept) continue;
    try {
      rmSync(path, { recursive: true, force: true });
      removed.push(path);
    } catch {
      left.push(path);
    }
  }
  const done = left.length === 0;
  if (done) {
    try {
      writeFileSync(marker, `${JSON.stringify({ at: now().toISOString(), stopped, removed: removed.length }, null, 2)}
`, "utf-8");
    } catch {
    }
  }
  if (stopped.length || removed.length || left.length) {
    logLifecycle({ event: "v10-cleanup", host: env.SDLC_HOST || "claude", reason: done ? "done" : `left: ${left.join(", ")}`, stopped, removed: removed.length }, { home });
  }
  return { stopped, removed, left, done };
}

export {
  MARKER,
  STATE_ENTRIES,
  runMachineCleanup
};
