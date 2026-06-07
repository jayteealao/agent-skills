// lib/hub-config.mjs
//
// The machine-wide hub configuration: `~/.sdlc/hub-config.json`. The hub is a
// single machine-wide process, so every singleton setting that governs how the
// one hub binds — host, port, resource caps, Tailscale exposure — lives here,
// per-developer-machine and never committed. The per-repo `.ai/sdlc-config.json`
// carries ONLY `view.hub.enabled` (whether THIS repo participates). The two
// files share zero fields, so there are no precedence rules to reason about.
// This is the git model: repo-local choices in `.git/config`, machine identity
// and global behaviour in `~/.gitconfig`. See MULTI-REPO-REGISTRY-PLAN §6.1.
//
// Mirrors lib/config.mjs but home-dir-scoped.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { deepMerge, configHash } from './config.mjs';
import { sdlcHomeDir } from './registry.mjs';

export const HUB_CONFIG_VERSION = 1;

export const HUB_CONFIG_DEFAULTS = Object.freeze({
  version: HUB_CONFIG_VERSION,
  host: '127.0.0.1',
  // The canonical SDLC URL in both single-repo and hub modes (Q4 resolved). The
  // per-repo daemon falls back to 4174 only when forced alongside a live hub.
  port: 4173,
  // Machine-wide authority over per-repo daemons. When false, ensureServeLifecycle
  // reaps any running per-repo daemon and never spawns one — overriding even a
  // repo's force `view.serve.enabled:true`. The hub serves every repo at /r/<id>/,
  // so a per-repo daemon is pure redundancy whenever the hub runs, and the only
  // thing that can squat the hub's port (a pre-hub daemon on 4173 = the inbox
  // disappears behind one repo's dashboard). Default true preserves prior
  // behaviour; set false to make the hub the sole server on this machine.
  perRepoServe: true,
  // Live-reload for the standalone per-repo fallback daemon (the hub always
  // live-reloads). Machine-wide because serve settings are not per-repo.
  liveReload: true,
  maxSseClients: 200,    // aggregate across repos; client-side filtering scopes per-repo
  maxWatchedRepos: 50,   // beyond this, poll instead of fs.watch
  tailscale: {
    enabled: false,
    mode: 'serve',
    path: '/',
    https: true,
    // Security-decisive: a public binding exposes EVERY registered repo at once,
    // so this acknowledgement is a one-time, per-machine gate — never a
    // committable per-repo flag (§6.1).
    acknowledgedPublic: false,
  },
});

export function hubConfigPath() {
  return join(sdlcHomeDir(), 'hub-config.json');
}

function migrate(raw) {
  // Deep-merge over defaults so a sparse or older config gets every missing key.
  // version:1 is current; future versions add migration branches here.
  const merged = deepMerge(HUB_CONFIG_DEFAULTS, raw && typeof raw === 'object' ? raw : {});
  merged.version = HUB_CONFIG_VERSION;
  return merged;
}

function writeAtomic(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf-8');
  try { renameSync(tmp, path); }
  catch (err) { try { rmSync(tmp, { force: true }); } catch { /* ignore */ } throw err; }
}

/**
 * Read the machine-wide hub config, creating it with defaults on first start.
 * Never throws — a malformed file falls back to defaults.
 *
 * @param {{ create?: boolean }} [opts] — create the file with defaults if absent.
 */
export function readHubConfig({ create = true } = {}) {
  const path = hubConfigPath();
  if (!existsSync(path)) {
    if (create) { try { writeAtomic(path, HUB_CONFIG_DEFAULTS); } catch { /* best-effort */ } }
    return structuredClone(HUB_CONFIG_DEFAULTS);
  }
  try {
    return migrate(JSON.parse(readFileSync(path, 'utf-8')));
  } catch {
    return structuredClone(HUB_CONFIG_DEFAULTS);
  }
}

/**
 * Persist the machine-wide hub config (atomic temp-file + rename, mirroring
 * readHubConfig). Stamps the current version so a written config is always
 * migration-current. Used by the tray's `togglePerRepoServe`. Never partially
 * writes — a crash mid-write leaves the prior file intact.
 */
export function writeHubConfig(cfg) {
  const next = { ...(cfg && typeof cfg === 'object' ? cfg : {}), version: HUB_CONFIG_VERSION };
  writeAtomic(hubConfigPath(), next);
  return next;
}

/** Stable hash of the effective hub config (stored in hub.pid for drift detection). */
export function hubConfigHash(cfg) {
  return configHash(cfg);
}
