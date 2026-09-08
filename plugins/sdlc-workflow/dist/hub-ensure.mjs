#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  logDeprecatedConfig
} from "./chunk-4J55QJF2.mjs";
import {
  ensureHubLifecycle
} from "./chunk-AQHSBCX2.mjs";
import "./chunk-KIZZEX5M.mjs";
import {
  readHubConfig
} from "./chunk-PSP4GYGJ.mjs";
import "./chunk-LYPLZSMD.mjs";
import "./chunk-EQC6XDOG.mjs";
import "./chunk-K6PBZI5W.mjs";
import "./chunk-KRRL2TSM.mjs";
import {
  loadConfig
} from "./chunk-XLUSO7MY.mjs";
import {
  appendError,
  countPending,
  enqueue,
  upsertRegistryEntry,
  writeStatus
} from "./chunk-KXEWPJJ7.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/hub-ensure.mjs
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function hasFlag(name) {
  return process.argv.includes(name);
}
var CONFIRM = hasFlag("--confirm");
async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const pluginRoot = argValue("--plugin-root", resolve(here, ".."));
  const projectRoot = argValue("--project-root", process.cwd());
  const viewDir = argValue("--view", resolve(projectRoot, ".ai", "_view"));
  const skipEnsure = hasFlag("--no-ensure");
  if (hasFlag("--session-start")) {
    try {
      const config = await loadConfig(projectRoot);
      logDeprecatedConfig({ config, hubConfig: readHubConfig({ create: false }), log: (l) => process.stderr.write(`${l}
`) });
    } catch {
    }
  }
  if (hasFlag("--bootstrap") && existsSync(join(projectRoot, ".ai", "workflows"))) {
    try {
      mkdirSync(viewDir, { recursive: true });
      enqueue(viewDir, {
        repoRoot: projectRoot,
        kind: "bootstrap",
        bucket: "__bootstrap__",
        enqueuedBy: { host: process.env.SDLC_HOST || "claude", pid: process.pid }
      });
    } catch {
    }
  }
  let hubUp = false;
  let confirmed = false;
  if (!skipEnsure) {
    try {
      const r = await ensureHubLifecycle({ pluginRoot, log: () => {
      } });
      hubUp = r.action === "already-running" || r.action === "started" || r.action === "started-unconfirmed";
      confirmed = r.action === "already-running" || r.action === "started";
    } catch (err) {
      try {
        appendError(viewDir, `ensure-hub failed: ${err?.message ?? err}`);
      } catch {
      }
    }
  }
  let registerError = null;
  try {
    const r = await upsertRegistryEntry({ projectRoot, viewDir });
    if (r?.action === "skipped-not-git") registerError = "not a git repo \u2014 run git init to register with the hub";
  } catch {
  }
  try {
    writeStatus(viewDir, {
      pendingCount: countPending(viewDir),
      lastError: registerError ?? (hubUp || skipEnsure ? null : "hub unreachable"),
      hubLastSeenAt: hubUp ? (/* @__PURE__ */ new Date()).toISOString() : null
    });
  } catch {
  }
  return confirmed;
}
main().then((confirmed) => process.exit(CONFIRM && !confirmed ? 1 : 0)).catch(() => process.exit(CONFIRM ? 1 : 0));
