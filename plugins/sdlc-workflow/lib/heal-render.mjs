// lib/heal-render.mjs
//
// Stale-render healing — STALE-RENDER-HEAL-PLAN ("Option B"). The render-time
// version gate (render-sunflower.mjs) forces a clean re-render whenever the
// recorded `.last-render` version differs from the running PLUGIN_VERSION — but
// ONLY when a render is actually invoked. After a plugin upgrade a quiescent
// repo's already-rendered pages stay frozen at the old version (old markup under
// freshly-recopied CSS = a split-brain page) until something happens to
// re-render it.
//
// This module supplies the missing caller. The serving daemons (the multi-repo
// hub + the standalone per-repo fallback) already run a level-triggered
// reconcile tick; on each tick they ask the controller to `consider(entry)`,
// and when that entry's rendered version drifts from PLUGIN_VERSION the
// controller spawns a background `render-sunflower --clean` for the repo — OFF
// the HTTP request path. The render rewrites `.last-render`, the daemon's
// existing fs.watch fires live-reload, and any open tab refreshes with fresh
// markup. The render's own internal version gate ensures the spawned pass is a
// clean one regardless, so the two layers compose.
//
// Decoupling the heal from requests (vs a render-on-request design) is the
// security crux: a remote GET over a public binding can never trigger a render —
// only the daemon's own timer can. It is also resource-bounded: a concurrency
// cap, a per-repo cooldown, and an attempt ceiling that surfaces a visible
// `failed` state rather than respawning a wedged render forever.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { resolveEntrypoint } from './entrypoint.mjs';
import { readRenderedIdentity, renderIdentityMatches } from './runtime-manifest.mjs';
import { resolveActiveRuntimeRootSync } from './runtime-store.mjs';

// Machine-wide defaults. HUB_CONFIG_DEFAULTS.staleRender folds these in via
// deepMerge (mirroring CODE_BROWSER_DEFAULTS), so a sparse or older hub-config
// picks up every key without a migration branch. heal:true — the upgrade-time
// split-brain is a real correctness bug, the heal is idempotent and triply
// bounded, and it only ever runs the same renderer the in-repo hooks run.
export const STALE_RENDER_DEFAULTS = Object.freeze({
  heal: true,
  maxConcurrent: 1,   // simultaneous heal renders across all repos
  cooldownMs: 60000,  // per-repo minimum interval between heal spawns (anti-thrash)
  maxAttempts: 3,     // give up + surface `failed` after this many spawns per drift episode
});

/**
 * Normalise an arbitrary staleRender config object against the defaults. Coerces
 * out-of-range numbers and treats `heal` as opt-out (anything but explicit
 * `false` enables). Never throws.
 */
export function normalizeStaleRenderConfig(cfg) {
  const c = cfg && typeof cfg === 'object' ? cfg : {};
  const posInt = (v, d) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : d);
  return {
    heal: c.heal !== false,
    maxConcurrent: posInt(c.maxConcurrent, STALE_RENDER_DEFAULTS.maxConcurrent),
    cooldownMs: Number.isFinite(c.cooldownMs) && c.cooldownMs >= 0
      ? Math.floor(c.cooldownMs)
      : STALE_RENDER_DEFAULTS.cooldownMs,
    maxAttempts: posInt(c.maxAttempts, STALE_RENDER_DEFAULTS.maxAttempts),
  };
}

/**
 * Parse the staleRender block delivered to a daemon via env. JSON can't ride
 * argv through the Windows launch-hidden.vbs shim, so both lifecycle supervisors
 * pass it as SDLC_STALE_RENDER — the same channel as SDLC_CODE_BROWSER. Merged
 * over defaults; a malformed or absent value yields the defaults. Never throws.
 */
export function staleRenderConfigFromEnv(env = process.env) {
  let raw = {};
  try {
    const text = env?.SDLC_STALE_RENDER;
    if (text) raw = JSON.parse(text);
  } catch { raw = {}; }
  return normalizeStaleRenderConfig(raw);
}

/**
 * The renderer-resolution seam (RENDER-DISPATCH-PLAN "Renderer resolution seam").
 * Every render the daemon spawns — drift-driven heal OR queue-driven dispatch —
 * resolves its entrypoint HERE, and nowhere else. NATIVE-INTEROP Workstream C
 * repoints it (as the plan foretold) at the ACTIVE MACHINE RUNTIME so the hub is
 * host-neutral: resolution order is the live hub PID record's runtimeRoot →
 * active-runtime.json → the caller's own bundled pluginRoot. So whichever host
 * started the hub, every render — including a hook-spawned fallback render — runs
 * the active runtime and stamps the active buildId, with zero changes to the
 * queue protocol, the hooks, or the drain loop.
 */
export function resolveRenderEntrypoint(pluginRoot) {
  const activeRoot = resolveActiveRuntimeRootSync();
  return resolveEntrypoint(activeRoot ?? pluginRoot, 'render-sunflower');
}

/**
 * Read the `version` recorded in a view's `.last-render` marker. Returns null
 * when the marker is absent, torn, or pre-9.60 (no `version` field) — all of
 * which sort as "stale" against any real PLUGIN_VERSION, which is exactly right:
 * unversioned content is the very split-brain this heals.
 */
export function readRenderedVersion(markerPath) {
  try {
    const parsed = JSON.parse(readFileSync(markerPath, 'utf-8'));
    return typeof parsed.version === 'string' && parsed.version ? parsed.version : null;
  } catch {
    return null;
  }
}

// Default spawn seam: a TRACKED (non-detached) child so we receive the 'exit'
// event that drives queue draining + completion logging. A heal render is
// short-lived; if the daemon dies mid-render the child dies with it and the next
// reconcile tick re-heals — acceptable. Tests inject a stub instead.
function defaultSpawnRender(script, args, opts) {
  return spawn(process.execPath, [script, ...args], {
    stdio: 'ignore',
    windowsHide: true,
    ...opts,
  });
}

/**
 * Create a heal controller. Shared by the hub (many entries) and the standalone
 * daemon (one synthetic entry). The caller drives it by calling `consider(entry)`
 * once per entry on each reconcile tick.
 *
 * @param {object}   o
 * @param {string}   o.pluginRoot     plugin root, for resolveEntrypoint('render-sunflower')
 * @param {string}   o.pluginVersion  the running daemon's shared runtimeVersion (the source of truth)
 * @param {string}   [o.buildId]      the running daemon's shared runtime buildId. When BOTH this
 *                                    and the view's `.last-render` carry a buildId, freshness keys
 *                                    on buildId (precise — catches a same-version rebuild); else it
 *                                    falls back to runtimeVersion, so legacy markers still heal.
 * @param {object}   [o.healCfg]      staleRender config (normalised internally)
 * @param {Function} [o.log]          line logger (prefixed by the caller)
 * @param {Function} [o.emitReload]   emitReload(id) — belt-and-braces tab refresh on completion
 * @param {Function} [o.spawnRender]  injectable (script, args, opts) => child — defaults to a tracked node spawn
 * @param {object}   [o.env]          env passed to the spawned render (defaults to process.env)
 * @param {Function} [o.now]          clock seam for cooldown (defaults to Date.now)
 */
export function createHealController({
  pluginRoot,
  pluginVersion,
  buildId = null,
  healCfg = {},
  log = () => {},
  emitReload = () => {},
  spawnRender = defaultSpawnRender,
  env = process.env,
  now = () => Date.now(),
} = {}) {
  const cfg = normalizeStaleRenderConfig(healCfg);

  const queue = [];              // [{ entry, renderedVersion }] awaiting a slot
  const inFlight = new Set();    // ids currently rendering
  const lastHealAt = new Map();  // id → ms of last spawn (cooldown clock)
  const attempts = new Map();    // id → spawn count this drift episode (retry cap)
  const failed = new Map();      // id → { attempts, renderedVersion } (surfaced in health)

  const markerOf = (entry) => join(entry.viewDir, '.last-render');

  /**
   * Inspect one entry and act on version drift. Returns a small decision object
   * (consumed by tests; the daemons ignore it). Never throws — a heal failure
   * must never escalate to the reconcile loop.
   */
  function consider(entry) {
    try {
      if (!cfg.heal) return { action: 'disabled' };
      if (!entry || !entry.id || !entry.viewDir || !entry.repoRoot) return { action: 'invalid' };
      // Compare the FULL recorded identity (version + buildId) against the active
      // runtime. renderIdentityMatches keys on buildId when both sides carry one,
      // else on runtimeVersion — so a legacy `version`-only marker still heals.
      const recorded = readRenderedIdentity(markerOf(entry));
      const renderedVersion = recorded.version;   // display + `failed` snapshot (back-compat)
      if (renderIdentityMatches(recorded, { runtimeVersion: pluginVersion, buildId })) {
        // Fresh — clear transient state so a FUTURE drift heals from a clean slate.
        attempts.delete(entry.id);
        failed.delete(entry.id);
        return { action: 'fresh', renderedVersion };
      }
      // Drift in EITHER direction heals: the running daemon IS the active shared
      // runtime, so its identity is authoritative — content should always match
      // it, whether the runtime moved forward (upgrade) or back (downgrade).
      return enqueue(entry, renderedVersion);
    } catch (err) {
      log(`heal: consider error for ${entry?.id ?? '?'}: ${err?.message ?? err}`);
      return { action: 'error' };
    }
  }

  function enqueue(entry, renderedVersion) {
    const id = entry.id;
    if (inFlight.has(id) || queue.some((q) => q.entry.id === id)) {
      return { action: 'pending', renderedVersion };
    }
    // Cooldown clock starts at -Infinity so the FIRST heal is never gated (a 0
    // default would wrongly block when now() < cooldownMs, e.g. under a mock clock).
    if (now() - (lastHealAt.get(id) ?? -Infinity) < cfg.cooldownMs) {
      return { action: 'cooldown', renderedVersion };
    }
    if ((attempts.get(id) ?? 0) >= cfg.maxAttempts) {
      // Give up visibly rather than respawn a wedged render every tick. Logged
      // once; the `failed` snapshot keeps it surfaced until the version goes fresh.
      if (!failed.has(id)) {
        log(`heal: ${id} FAILED after ${cfg.maxAttempts} attempts — still ${renderedVersion ?? 'unversioned'} (want ${pluginVersion})`);
      }
      failed.set(id, { attempts: cfg.maxAttempts, renderedVersion: renderedVersion ?? null });
      return { action: 'failed', renderedVersion };
    }
    // isHeal marks a drift-driven render: it owns the attempts/cooldown/failed
    // accounting below. The args are computed here so spawnOne is render-source
    // agnostic — the SAME spawnOne also runs queue-driven renders (submit).
    // --clean forces a full re-render; --view is belt-and-braces against a
    // symlink/realpath divergence (render-sunflower has no --project-root, so
    // cwd=repoRoot in spawnOne is what actually anchors the project).
    queue.push({
      entry,
      renderedVersion,
      isHeal: true,
      args: ['--clean', '--view', entry.viewDir],
    });
    pump();
    return { action: 'enqueued', renderedVersion };
  }

  /**
   * Queue-driven render submission (RENDER-DISPATCH-PLAN). The render-queue
   * drainer calls this with an explicit argv and an onSettled callback (which
   * acks/fails the on-disk queue files). It funnels through the SAME inFlight /
   * pump / spawnOne machinery as heal, so a queue render and a heal render for
   * one repo can never run concurrently and clobber the same view dir. Unlike
   * heal it is NOT cooldown- or attempt-gated here — the queue owns its own
   * retry accounting on disk; the only gate is "one render per repo at a time".
   * Returns { action: 'enqueued' | 'pending' | 'invalid' | 'error' }.
   */
  function submit(entry, { args, label, onSettled } = {}) {
    try {
      if (!entry || !entry.id || !entry.viewDir || !entry.repoRoot) return { action: 'invalid' };
      if (!Array.isArray(args)) return { action: 'invalid' };
      if (isBusy(entry.id)) return { action: 'pending' };
      queue.push({ entry, args, label, isHeal: false, onSettled });
      pump();
      return { action: 'enqueued' };
    } catch (err) {
      log(`render-queue: submit error for ${entry?.id ?? '?'}: ${err?.message ?? err}`);
      return { action: 'error' };
    }
  }

  /**
   * True when a render for this repo is already in flight or queued (from EITHER
   * source). The drainer checks this before claiming work so it doesn't churn
   * the queue while a render is mid-flight.
   */
  function isBusy(id) {
    return inFlight.has(id) || queue.some((q) => q.entry.id === id);
  }

  function pump() {
    while (inFlight.size < cfg.maxConcurrent && queue.length) {
      spawnOne(queue.shift());
    }
  }

  function spawnOne({ entry, renderedVersion, args, label, isHeal, onSettled }) {
    const id = entry.id;
    const tag = isHeal ? 'heal' : 'render-queue';
    inFlight.add(id);
    // Only the drift path owns the cooldown clock + attempt counter; a
    // queue-driven render manages its own retry accounting on disk.
    if (isHeal) {
      lastHealAt.set(id, now());
      attempts.set(id, (attempts.get(id) ?? 0) + 1);
    }
    const script = resolveRenderEntrypoint(pluginRoot);
    log(label ?? `heal: ${id} rendered ${renderedVersion ?? 'unversioned'} ≠ ${pluginVersion} → clean re-render (attempt ${attempts.get(id)}/${cfg.maxAttempts})`);

    let child;
    try {
      // cwd:repoRoot is load-bearing — render-sunflower has no --project-root
      // flag; it derives the checkout via resolveProjectRoot() climbing from cwd.
      // args carry --clean/--only/--bootstrap + --view depending on the source.
      child = spawnRender(script, args, {
        cwd: entry.repoRoot,
        env,
      });
    } catch (err) {
      inFlight.delete(id);
      log(`${tag}: ${id} spawn failed: ${err?.message ?? err}`);
      try { onSettled?.(1); } catch { /* settle errors are swallowed */ }
      pump();
      return;
    }

    let settled = false;
    const finish = (code) => {
      if (settled) return;   // 'error' + 'exit' can both fire; collapse to one
      settled = true;
      inFlight.delete(id);
      if (code === 0) {
        log(`${tag}: ${id} render complete`);
        try { emitReload(id); } catch { /* the fs.watch backstop also fires reload */ }
      } else {
        log(`${tag}: ${id} render exited ${code}`);
      }
      try { onSettled?.(code); } catch { /* the drainer's ack/fail must not wedge the pump */ }
      pump();
    };

    if (child && typeof child.on === 'function') {
      child.on('exit', (code) => finish(code ?? 0));
      child.on('error', (err) => { log(`${tag}: ${id} child error: ${err?.message ?? err}`); finish(1); });
    } else {
      // A stub with no event surface — treat as instantly done so we never wedge.
      finish(0);
    }
  }

  /** Observable state for /__sdlc/health. */
  function snapshot() {
    return {
      heal: cfg.heal,
      maxConcurrent: cfg.maxConcurrent,
      inFlight: [...inFlight],
      queued: queue.map((q) => q.entry.id),
      failed: [...failed.entries()].map(([id, v]) => ({ id, ...v })),
    };
  }

  return { consider, submit, isBusy, snapshot, config: cfg };
}
