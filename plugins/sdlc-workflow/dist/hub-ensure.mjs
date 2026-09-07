#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  ensureHubLifecycle
} from "./chunk-UPEBEO3C.mjs";
import "./chunk-KIZZEX5M.mjs";
import {
  readHubConfig
} from "./chunk-W7SZIRDL.mjs";
import "./chunk-WIOD7AIL.mjs";
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
  logLifecycle,
  upsertRegistryEntry,
  writeStatus
} from "./chunk-O3FUA7PQ.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/hub-ensure.mjs
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// lib/deprecations.mjs
var DEPRECATED_IN = "9.154.0";
var REMOVAL = `deprecated in ${DEPRECATED_IN} and removed in the next release`;
var DEPRECATIONS = Object.freeze([
  {
    key: "view.renderDispatch",
    file: ".ai/sdlc-config.json",
    scope: "repo",
    isSet: (config) => config?.view?.renderDispatch === "inline",
    message: `view.renderDispatch is 'inline' in .ai/sdlc-config.json. The value is ${REMOVAL}. Delete the key; 'hub' is the default and renders through the hub queue.`
  },
  {
    key: "perRepoServe",
    file: "hub-config.json",
    scope: "machine",
    isSet: (hubConfig) => hubConfig?.perRepoServe === true,
    message: `perRepoServe is true in hub-config.json. The key is ${REMOVAL}. Delete the key; the hub serves every repository at /r/<id>/.`
  },
  {
    key: "liveReload",
    file: "hub-config.json",
    scope: "machine",
    isSet: (hubConfig) => hubConfig?.liveReload === false,
    message: `liveReload is false in hub-config.json. The key is ${REMOVAL}. Delete the key; the hub always live-reloads.`
  }
]);
function deprecatedConfigWarnings({ config = null, hubConfig = null } = {}) {
  const out = [];
  for (const d of DEPRECATIONS) {
    const source = d.scope === "repo" ? config : hubConfig;
    if (source && d.isSet(source)) out.push({ key: d.key, file: d.file, message: d.message });
  }
  return out;
}
function logDeprecatedConfig({ config = null, hubConfig = null, log = () => {
}, host = process.env.SDLC_HOST || "claude" } = {}) {
  const warnings = deprecatedConfigWarnings({ config, hubConfig });
  for (const w of warnings) {
    try {
      logLifecycle({ event: "deprecated-config", host, reason: w.message, key: w.key, file: w.file });
    } catch {
    }
    try {
      log(`[sdlc] ${w.message}`);
    } catch {
    }
  }
  return warnings.length;
}

// scripts/hub-ensure.mjs
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
  if (hasFlag("--bootstrap")) {
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
