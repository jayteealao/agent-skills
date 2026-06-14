// lib/ensure-hub.mjs
//
// Shared "ensure the hub is up" spawn used by the write hook and SessionStart
// under 'hub' render dispatch (RENDER-DISPATCH-PLAN). Both hooks need the same
// enable-guard + detached spawn of scripts/hub-ensure.mjs; keeping it here means
// one place to evolve the guard (and the future Codex hooks reuse it verbatim).
// The write-hook's per-burst debounce stays local to that hook — only the
// guard + spawn are shared.

import { spawnDetachedNode } from './detach.mjs';
import { resolveEntrypoint } from './entrypoint.mjs';
import { appendError } from './render-queue.mjs';

/**
 * Whether a write/session hook may auto-start the hub: opt-out via
 * `view.ensureHubOnWrite:false`, or the SDLC_DISABLE_ENSURE_HUB=1 kill switch
 * (used by tests + operators). `viewConfig` is the `view` config sub-object.
 */
export function ensureHubEnabled(viewConfig, env = process.env) {
  return viewConfig?.ensureHubOnWrite !== false && env.SDLC_DISABLE_ENSURE_HUB !== '1';
}

/**
 * Fire-and-forget the detached hub-ensure helper (ensure-hub + register +
 * status), OFF the hook's critical path. Reports a spawn failure to the view's
 * .render-errors.log. Returns true if the spawn was issued. Never throws.
 */
export function spawnHubEnsure({ pluginRoot, projectRoot, viewDir, env = process.env }) {
  try {
    spawnDetachedNode(
      resolveEntrypoint(pluginRoot, 'hub-ensure'),
      ['--plugin-root', pluginRoot, '--project-root', projectRoot, '--view', viewDir],
      { cwd: projectRoot, env },
    );
    return true;
  } catch (err) {
    try { appendError(viewDir, `ensure-hub spawn failed: ${err?.message ?? err}`); } catch { /* best-effort */ }
    return false;
  }
}
