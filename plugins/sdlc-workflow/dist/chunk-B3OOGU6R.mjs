import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  logLifecycle
} from "./chunk-5LBIJZHF.mjs";

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

export {
  deprecatedConfigWarnings,
  logDeprecatedConfig
};
