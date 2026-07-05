#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  isAutostartEnabled,
  refreshAutostart
} from "./chunk-ERHYJB4B.mjs";
import {
  projectRootFromInput,
  readStdinJson
} from "./chunk-UBR42YUU.mjs";
import {
  logError
} from "./chunk-SCQPZLF2.mjs";
import {
  ensureHubEnabled,
  spawnHubEnsure
} from "./chunk-DBOSGXVI.mjs";
import "./chunk-UTP6CBAZ.mjs";
import {
  spawnDetachedNode
} from "./chunk-K6PBZI5W.mjs";
import {
  loadConfig
} from "./chunk-IEGE3GWR.mjs";
import {
  enqueue,
  resolveEntrypoint,
  sdlcHomeDir
} from "./chunk-JH5USZ6A.mjs";
import "./chunk-NTSUEAI6.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// hooks/session-start-orient.mjs
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var __dirname = dirname(fileURLToPath(import.meta.url));
var PLUGIN_ROOT = resolve(__dirname, "..");
async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === "1") return;
  if (process.env.SDLC_DISPATCH_ACTIVE === "1") return;
  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  startBootstrap(projectRoot, config);
  healAutostartLauncher();
  healRunningTray();
}
function healAutostartLauncher() {
  try {
    if (!isAutostartEnabled()) return;
    refreshAutostart({ trayBundle: resolveEntrypoint(PLUGIN_ROOT, "tray") });
  } catch {
  }
}
function healRunningTray() {
  try {
    if (process.env.SDLC_DISABLE_TRAY_HEAL === "1") return;
    if (process.platform !== "win32") return;
    if (!isAutostartEnabled()) return;
    if (!trayHealDue()) return;
    spawnDetachedNode(resolveEntrypoint(PLUGIN_ROOT, "tray-heal"), [], { cwd: PLUGIN_ROOT, env: process.env });
  } catch {
  }
}
var TRAY_HEAL_DEBOUNCE_MS = 6e4;
function trayHealDue(now = Date.now()) {
  try {
    const marker = join(sdlcHomeDir(), ".tray-heal");
    try {
      const age = now - statSync(marker).mtimeMs;
      if (age >= 0 && age < TRAY_HEAL_DEBOUNCE_MS) return false;
    } catch {
    }
    writeFileSync(marker, `${now}
`, "utf-8");
    return true;
  } catch {
    return false;
  }
}
function startBootstrap(projectRoot, config) {
  if (process.env.SDLC_DISABLE_BOOTSTRAP === "1") return;
  if (config.view?.bootstrap?.enabled === false) return;
  const dispatch = config.view?.renderDispatch ?? "hub";
  if (dispatch === "inline") {
    try {
      spawnDetachedNode(
        resolveEntrypoint(PLUGIN_ROOT, "render-sunflower"),
        ["--bootstrap", "--plugin-root", PLUGIN_ROOT],
        { cwd: projectRoot, env: process.env }
      );
    } catch {
    }
    return;
  }
  try {
    const viewRoot = resolve(projectRoot, ".ai", "_view");
    mkdirSync(viewRoot, { recursive: true });
    enqueue(viewRoot, {
      repoRoot: projectRoot,
      kind: "bootstrap",
      bucket: "__bootstrap__",
      enqueuedBy: { host: "claude", pid: process.pid }
    }, { maxPending: config.view?.renderQueue?.maxPending });
    if (ensureHubEnabled(config.view)) {
      spawnHubEnsure({ pluginRoot: PLUGIN_ROOT, projectRoot, viewDir: viewRoot });
    }
  } catch {
  }
}
main().catch(async (err) => {
  try {
    await logError("session-start-orient", err);
  } catch {
  }
  process.exit(0);
});
