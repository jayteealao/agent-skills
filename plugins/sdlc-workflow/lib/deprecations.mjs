/**
 * W11.9 step 1 (WIDE-VIEW-REPAIR-PLAN §14.2.9): the dead paths are deprecated
 * in 9.154.0 and deleted in the next release. Three settings select them:
 *
 *   view.renderDispatch: 'inline'  (.ai/sdlc-config.json) — the write hook
 *                                  spawns `render-sunflower` itself
 *   perRepoServe: true             (hub-config.json) — the standalone per-repo
 *                                  daemon (lib/serve-lifecycle.mjs)
 *   liveReload: false              (hub-config.json) — a setting of that daemon
 *                                  only; the hub always live-reloads
 *
 * A default-valued key is not "set": the defaults are the surviving paths.
 * deprecatedConfigWarnings is pure. logDeprecatedConfig writes one
 * `deprecated-config` lifecycle line per warning; scripts/hub-ensure.mjs calls
 * it once per session (--session-start) on every host.
 */
import { logLifecycle } from './runtime-log.mjs';

export const DEPRECATED_IN = '9.154.0';

const REMOVAL = `deprecated in ${DEPRECATED_IN} and removed in the next release`;

export const DEPRECATIONS = Object.freeze([
  {
    key: 'view.renderDispatch',
    file: '.ai/sdlc-config.json',
    scope: 'repo',
    isSet: (config) => config?.view?.renderDispatch === 'inline',
    message: `view.renderDispatch is 'inline' in .ai/sdlc-config.json. The value is ${REMOVAL}. Delete the key; 'hub' is the default and renders through the hub queue.`,
  },
  {
    key: 'perRepoServe',
    file: 'hub-config.json',
    scope: 'machine',
    isSet: (hubConfig) => hubConfig?.perRepoServe === true,
    message: `perRepoServe is true in hub-config.json. The key is ${REMOVAL}. Delete the key; the hub serves every repository at /r/<id>/.`,
  },
  {
    key: 'liveReload',
    file: 'hub-config.json',
    scope: 'machine',
    isSet: (hubConfig) => hubConfig?.liveReload === false,
    message: `liveReload is false in hub-config.json. The key is ${REMOVAL}. Delete the key; the hub always live-reloads.`,
  },
]);

/** Pure: `[{ key, file, message }]` for every deprecated setting in use. */
export function deprecatedConfigWarnings({ config = null, hubConfig = null } = {}) {
  const out = [];
  for (const d of DEPRECATIONS) {
    const source = d.scope === 'repo' ? config : hubConfig;
    if (source && d.isSet(source)) out.push({ key: d.key, file: d.file, message: d.message });
  }
  return out;
}

/**
 * Write one `deprecated-config` lifecycle line per warning and hand the same
 * text to `log`. Returns the warning count. Never throws.
 */
export function logDeprecatedConfig({ config = null, hubConfig = null, log = () => {}, host = process.env.SDLC_HOST || 'claude' } = {}) {
  const warnings = deprecatedConfigWarnings({ config, hubConfig });
  for (const w of warnings) {
    try { logLifecycle({ event: 'deprecated-config', host, reason: w.message, key: w.key, file: w.file }); } catch { /* never block */ }
    try { log(`[sdlc] ${w.message}`); } catch { /* never block */ }
  }
  return warnings.length;
}
