/**
 * lib/entrypoint.mjs — resolve a spawnable entrypoint to its built bundle or source.
 *
 * The plugin ships committed, dependency-inlined bundles under dist/ (see
 * docs/internal/archived/SELF-CONTAINED-BUILD-PLAN.md). Cross-process spawns must launch the bundle in
 * a fresh marketplace install (where node_modules is absent) but may launch the
 * source during maintainer dev. `resolveEntrypoint` picks dist/<name>.mjs when
 * it exists and falls back to scripts/<name>.mjs otherwise:
 *
 *   prod (committed dist, no node_modules) → dist/<name>.mjs  (deps inlined)
 *   maintainer dev before first build       → scripts/<name>.mjs (deps from node_modules)
 *
 * The committed dist is kept in lockstep with source by the CI freshness gate,
 * so "dist exists" is a safe proxy for "use the bundle".
 *
 * NOTE: this is for the SCRIPT entrypoints spawned as child processes
 * (render-sunflower, hub-serve, render-sunflower-serve). Renderer modules are
 * resolved separately inside render-sunflower's loadRenderer, which keys off
 * whether the engine itself is running from dist/ — see that function.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {string} pluginRoot absolute path to the plugin root
 * @param {string} name entrypoint basename without extension (e.g. 'hub-serve')
 * @returns {string} absolute path to dist/<name>.mjs if built, else scripts/<name>.mjs
 */
export function resolveEntrypoint(pluginRoot, name) {
  const dist = join(pluginRoot, 'dist', `${name}.mjs`);
  return existsSync(dist) ? dist : join(pluginRoot, 'scripts', `${name}.mjs`);
}
