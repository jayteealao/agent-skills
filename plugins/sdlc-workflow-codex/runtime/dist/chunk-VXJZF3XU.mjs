import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  spawnDetachedNode
} from "./chunk-K6PBZI5W.mjs";
import {
  appendError
} from "./chunk-LCWXHILT.mjs";
import {
  resolveEntrypoint
} from "./chunk-4TSW2YJ2.mjs";

// lib/ensure-hub.mjs
function ensureHubEnabled(viewConfig, env = process.env) {
  return viewConfig?.ensureHubOnWrite !== false && env.SDLC_DISABLE_ENSURE_HUB !== "1";
}
function spawnHubEnsure({ pluginRoot, projectRoot, viewDir, env = process.env }) {
  try {
    spawnDetachedNode(
      resolveEntrypoint(pluginRoot, "hub-ensure"),
      ["--plugin-root", pluginRoot, "--project-root", projectRoot, "--view", viewDir],
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
