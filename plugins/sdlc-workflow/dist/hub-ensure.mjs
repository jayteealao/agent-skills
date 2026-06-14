#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  ensureHubLifecycle
} from "./chunk-MUYXQH7Z.mjs";
import "./chunk-HQR34SES.mjs";
import "./chunk-NHBE6SKM.mjs";
import {
  upsertRegistryEntry
} from "./chunk-GQ3CJSFD.mjs";
import "./chunk-2J6GCTGA.mjs";
import "./chunk-NTSUEAI6.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-LFGT2BKG.mjs";
import {
  appendError,
  countPending,
  writeStatus
} from "./chunk-ELXHT3DD.mjs";
import "./chunk-KGLQRRIU.mjs";

// scripts/hub-ensure.mjs
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function hasFlag(name) {
  return process.argv.includes(name);
}
async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const pluginRoot = argValue("--plugin-root", resolve(here, ".."));
  const projectRoot = argValue("--project-root", process.cwd());
  const viewDir = argValue("--view", resolve(projectRoot, ".ai", "_view"));
  const skipEnsure = hasFlag("--no-ensure");
  let hubUp = false;
  if (!skipEnsure) {
    try {
      const r = await ensureHubLifecycle({ pluginRoot, log: () => {
      } });
      hubUp = r.action === "already-running" || r.action === "started" || r.action === "started-unconfirmed";
    } catch (err) {
      try {
        appendError(viewDir, `ensure-hub failed: ${err?.message ?? err}`);
      } catch {
      }
    }
  }
  try {
    await upsertRegistryEntry({ projectRoot, viewDir });
  } catch {
  }
  try {
    writeStatus(viewDir, {
      pendingCount: countPending(viewDir),
      lastError: hubUp || skipEnsure ? null : "hub unreachable",
      hubLastSeenAt: hubUp ? (/* @__PURE__ */ new Date()).toISOString() : null
    });
  } catch {
  }
}
main().then(() => process.exit(0)).catch(() => process.exit(0));
