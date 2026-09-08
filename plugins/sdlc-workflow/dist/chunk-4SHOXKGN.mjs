import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  spawnDetachedNode
} from "./chunk-K6PBZI5W.mjs";
import {
  resolveEntrypoint
} from "./chunk-KRRL2TSM.mjs";
import {
  appendError
} from "./chunk-5LBIJZHF.mjs";

// lib/ensure-hub.mjs
function ensureHubEnabled(viewConfig, env = process.env) {
  return viewConfig?.ensureHubOnWrite !== false && env.SDLC_DISABLE_ENSURE_HUB !== "1" && env.SDLC_DISABLE_HUB_ENSURE !== "1";
}
function spawnHubEnsure({ pluginRoot, projectRoot, viewDir, env = process.env, sessionStart = false }) {
  try {
    spawnDetachedNode(
      resolveEntrypoint(pluginRoot, "hub-ensure"),
      ["--plugin-root", pluginRoot, "--project-root", projectRoot, "--view", viewDir, ...sessionStart ? ["--session-start"] : []],
      { cwd: projectRoot, env }
    );
    return true;
  } catch (err) {
    try {
      appendError(viewDir, `ensure-hub spawn failed: ${err?.message ?? err}`);
    } catch {
    }
    return false;
  }
}

export {
  ensureHubEnabled,
  spawnHubEnsure
};
