// lib/tailscale.mjs
//
// Configure a Tailscale `serve`/`funnel` mapping for a localhost port. Extracted
// from lib/serve-lifecycle.mjs (v9.33.0) so it is shared by the per-repo daemon
// and the multi-repo hub (lib/hub-lifecycle.mjs).
//
// The `tailscale` block has the SAME shape in both the per-repo
// `view.serve.tailscale` config and the machine-wide hub-config.json
// `tailscale` block; only its *location* differs. The hub is the single
// Tailscale-exposed entry point — because it fans out every registered repo, a
// public binding exposes all of them at once, which is why the hub's
// `acknowledgedPublic` gate lives per-machine and never in a committable
// per-repo file (see MULTI-REPO-REGISTRY-PLAN §6.1, §4.6).

import { spawnSync } from 'node:child_process';

/**
 * @param {object} params
 * @param {{ enabled?: boolean, mode?: 'serve'|'funnel', path?: string,
 *           https?: boolean, acknowledgedPublic?: boolean }} params.tailscale
 * @param {number} params.port — the localhost port to expose.
 * @param {(line: string) => void} [params.log]
 */
export function maybeConfigureTailscale({ tailscale = {}, port, log = () => {} } = {}) {
  if (tailscale.enabled !== true) return;

  const target = `http://127.0.0.1:${port}`;
  const mode = tailscale.mode === 'funnel' ? 'funnel' : 'serve';
  if (mode === 'funnel' && tailscale.acknowledgedPublic !== true) {
    log('[tailscale] refused funnel without acknowledgedPublic:true');
    return;
  }

  const args = [mode, '--bg'];
  if (mode === 'serve') {
    if (tailscale.https === false) args.push('--http=80');
    const path = tailscale.path || '/';
    if (path !== '/') args.push(`--set-path=${path}`);
  }
  args.push(target);

  const result = spawnSync('tailscale', args, {
    encoding: 'utf-8',
    windowsHide: true,
    timeout: 10000,
  });
  if (result.error) {
    log(`[tailscale] ${mode} unavailable: ${result.error.message}`);
  } else if (result.status !== 0) {
    log(`[tailscale] ${mode} failed: ${(result.stderr || result.stdout || '').trim()}`);
  } else {
    log(`[tailscale] ${mode} configured for ${target}`);
  }
}
