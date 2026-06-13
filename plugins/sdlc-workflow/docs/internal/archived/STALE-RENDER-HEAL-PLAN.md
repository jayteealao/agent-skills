# STALE-RENDER-HEAL-PLAN — background healing of version-stale views ("Option B")

Status: **implemented v9.63.0.** This document is the design of record; the code
comments cite it by section.

## §0 Problem & goal

The render-time version gate (v9.60.0, `scripts/render-sunflower.mjs`) forces a
clean re-render whenever a view's recorded `.last-render` version differs from the
running `PLUGIN_VERSION` — **but only when a render is actually invoked.** After a
plugin upgrade, a quiescent repo's already-rendered pages stay frozen at the old
version while the unconditionally-recopied assets race ahead, producing
split-brain pages (current CSS over stale markup) until something happens to
re-render that repo.

**Goal.** When a *served* view's rendered version drifts from the running daemon's
version, the serving daemon heals it by spawning a background
`render-sunflower --clean` for that repo — **off the HTTP request path**, paced and
bounded — and the existing live-reload refreshes any open tab.

**Rejected alternative — render-on-request.** Re-rendering lazily when the hub
receives a request for a stale page was considered and rejected: it is write-on-read
on a GET, drags the renderer's dependency surface onto the request hot-path, adds
unbounded latency + thundering-herd risk, can be triggered by a remote request over
a public binding, and is impossible for the hub to do generally for foreign repos
mid-request. The level-triggered, timer-driven heal here has none of those
problems.

## §1 Two version identities

Nothing previously reconciled the **daemon's** version (read live from
`package.json`) with the **content's** version (frozen in `.last-render` /
`data-sdlc-version` at render time). The v9.60 gate reconciles content-vs-code, but
only at render time. This plan reconciles daemon-vs-content at serve time.

## §2 Surface the rendered version

`lib/registry.mjs` `readLastRender()` now also returns `version`; `buildEntry()`
carries it on the entry as `renderedVersion` (null for a pre-9.60 marker). The
registry round-trip (`repoScopeEntries`/`mergeCollapsedEntries` spreads) preserves
it for free.

## §3 Config (machine-wide)

`HUB_CONFIG_DEFAULTS.staleRender` in `lib/hub-config.mjs`, defaults from
`STALE_RENDER_DEFAULTS` in `lib/heal-render.mjs`:

```js
staleRender: { heal: true, maxConcurrent: 1, cooldownMs: 60000, maxAttempts: 3 }
```

`heal` defaults **on**: drift is rare (≈once per repo per upgrade), the heal is
idempotent and triply bounded, and it only ever runs the same renderer the in-repo
hooks run. `heal:false` → detection-only (the hub still flags `stale` in health).
Delivered to both daemons via env at spawn (`SDLC_STALE_RENDER`), like
`SDLC_CODE_BROWSER`, because JSON can't ride argv through the Windows
launch-hidden.vbs shim.

## §4 Detection — `reconcile()`

The hub's level-triggered reconcile tick (`scripts/hub-serve.mjs`) gains a third
job after prune + the mtime backstop: `for (const e of entries) heal.consider(e)`.
Runs for **all** entries (drift is independent of fs.watch coverage). No-ops when
heal is off or the version matches.

## §5 Heal controller — `lib/heal-render.mjs`

`createHealController({ pluginRoot, pluginVersion, healCfg, log, emitReload,
spawnRender, env, now })` → `{ consider(entry), snapshot(), config }`. Shared by the
hub (many entries) and the standalone daemon (one synthetic entry).

- **Bounds.** A queue + `inFlight` set drained at `maxConcurrent`; a per-repo
  `cooldownMs` clock (starts at -Infinity so the first heal is never gated); an
  `attempts` ceiling that, once `maxAttempts` is hit, surfaces a visible `failed`
  state and stops respawning (logged once). Going fresh clears attempts/failed so a
  later drift heals from a clean slate.
- **Spawn.** `render-sunflower --clean --view <viewDir>` with **`cwd: repoRoot`** —
  load-bearing, because `render-sunflower` has no `--project-root` flag and derives
  the checkout via `resolveProjectRoot()` climbing from cwd. A TRACKED (non-detached)
  child gives the `exit` event that drives queue draining; `spawnRender` is an
  injectable seam for tests.
- **Direction-agnostic.** Any mismatch heals — the installed daemon is the machine's
  source of truth, so content should match it whether the install moved forward
  (upgrade) or back (downgrade). Unversioned (pre-9.60) counts as stale.
- **Completion.** On exit 0 the controller calls `emitReload(id)` (belt-and-braces;
  the render's `.last-render` rewrite also trips the fs.watch). The render's own
  internal version gate makes the spawned pass clean regardless, so the two layers
  compose.

## §6 Live-reload closes the loop

No new code: the heal render rewrites `.last-render`, the daemon's existing
fs.watch (or mtime backstop) fires a coalesced reload, and open tabs refresh with
fresh markup over the already-current assets.

## §7 Standalone daemon parity

`scripts/render-sunflower-serve.mjs` has no reconcile loop, so it builds a heal
controller for a single synthetic entry (`{ id:'local', repoRoot, viewDir:root }`)
and runs a light unref'd `setInterval(reconcileMs)` calling `heal.consider`, armed
only when heal is enabled. Secondary to the hub (it runs only when a repo opted out
of the hub). A `staleRender` config change is picked up on its next respawn (the
hub, the primary, restarts on the hub-config hash).

## §8 Observability (§9 in the original sketch)

`/__sdlc/health`:
- per-entry `renderedVersion` + `stale` (read **live** from `.last-render`, the
  source of truth), on both the hub and standalone daemons;
- a top-level `heal` snapshot: `{ heal, maxConcurrent, inFlight, queued, failed }`.

## §9 Security

- **Requests cannot trigger renders.** Heal is timer-driven from reconcile, fully
  decoupled from HTTP. A remote viewer over `0.0.0.0`/tailscale cannot cause a
  render — only the daemon's own timer can.
- **No new perimeter.** Only repos that already passed `validateEntry` and are
  already served get healed; the heal runs exactly one command (`render-sunflower`,
  cwd-scoped to a validated `repoRoot`), never anything repo-supplied.
- **Resource-bounded** — concurrency cap + per-repo cooldown + attempt ceiling;
  upgrade-time herd self-paces across reconcile ticks.

## §10 Tests

- `tests/unit/lib/heal-render.test.mjs` — config normalisation, `readRenderedVersion`,
  drift detection, the bounds (pending/cooldown/concurrency/retry→failed),
  direction-agnostic healing, spawn shape, spawn-throw recovery, snapshot.
- `tests/unit/lib/multi-repo-hub.test.mjs` — health surfaces `renderedVersion` +
  `stale` with heal off (detection); reconcile heals a version-stale view via an
  injected spawn stub (asserts `--clean`, `cwd=repoRoot`, health goes fresh, a
  reload fires).

## §11 Release

Five version spots bumped in lockstep (plugin.json, package.json, marketplace
top-level + sdlc plugins[] entry, `_shell.mjs` PLUGIN_VERSION) + 53 doc-site
brands; `npm run build` refreshes the committed `dist/` (the freshness gate runs
source, so a green suite ≠ fresh dist).
