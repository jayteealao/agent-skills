# TRAY-APP-PLAN — System-tray control app for the sunflower hub

Status: **LANDED v9.46.0 (2026-06-07)** — all phases P0–P5 shipped · scope locked via Q&A 2026-06-01 · P5 (logon autostart) added 2026-06-07 · rode the landed self-contained build foundation (P0–P3 of [SELF-CONTAINED-BUILD-PLAN.md](SELF-CONTAINED-BUILD-PLAN.md))

> **Depends on [SELF-CONTAINED-BUILD-PLAN.md](SELF-CONTAINED-BUILD-PLAN.md)** (foundation-first,
> chosen 2026-06-01). The tray is the **final entrypoint** added to that shared
> `scripts/build.mjs` esbuild build — `scripts/tray.mjs` → `dist/tray.mjs`. The
> view's manual `npm install` is retired there, plugin-wide; this doc covers only
> the tray-specific additions (UI, vendored binaries, icons).
>
> **Implementation deviations from the original plan (all for the better, recorded
> here):** (1) **`dist/tray.mjs` (ESM), not `dist/tray.cjs`** — the tray rides the
> shared `scripts/build.mjs` as a normal entry (matching the foundation plan's "one
> more entrypoint"), so there is **no separate `scripts/build-tray.mjs`**. (2) **Own
> the helper protocol** (`lib/tray-protocol.mjs`) instead of importing systray2's JS
> — systray2's binary resolver is cwd/`__dirname`-bound and breaks under bundling
> (risk #1), and owning the ~120-line protocol drops its heavy `request`/`fs-extra`
> deps. (3) The one-off regen tools (`sharp`/`to-ico`/`systray2`) are **ad-hoc dev
> installs, not committed devDeps** (keeps `npm ci`/CI lean + vuln-free).

A user-launched **system-tray (notification-area) app** that controls the existing
sunflower hub / per-repo daemon — start/stop/restart, open dashboard, status,
refresh, settings — with a sunflower **app icon**. Drives the vendored systray2 Go
helper directly over stdio, shipped **fully self-contained** (committed multiplatform
binaries + icons + esbuild-bundled JS).

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Service model | **Tray + opt-in logon autostart** | Default = manual launch (hub still starts via the SessionStart bootstrap). Opt-in autostart (P5) brings the tray up with the user's logon session and lets it *supervise* the hub — see [Autostart (P5)](#autostart-p5). |
| Autostart | **Per-user Startup-folder launcher, off by default** | No admin, no service/registry, no Task Scheduler — a generated hidden-launch `.vbs` in the user's Startup folder. File presence = the on/off truth; toggled from the tray menu. |
| Tray tech | **systray2 Go helper, driven by our own `lib/tray-protocol.mjs`** | Cross-platform; spawns the small Go helper and speaks line-delimited JSON over stdio. We own the protocol (not systray2's JS) — its binary resolver breaks under esbuild bundling (risk #1), and this drops its `request`/`fs-extra` deps. |
| Delivery | **Fully self-contained** | Commit the 3 platform helper binaries (`bin/tray/`) + icons (`assets/app-icon*`) + esbuild-bundle the tray JS (`dist/tray.mjs`) → works on a fresh clone with **zero `npm install`**. |
| Icon | **`.ico`/`.png` from `assets/favicon.svg`** | Reuse the existing sunflower mark; status conveyed by swapping to a desaturated "down" variant. |

## Goal & non-goals

**Goal:** `node dist/tray.cjs` (or `npm run tray`) puts a sunflower icon in the
tray. Its menu drives the hub over the endpoints/lifecycle functions that already
exist. No admin, no service registration; autostart is opt-in and per-user only (P5).

**Non-goals (this iteration):** Windows Service / Session-0 registration; *system-wide*
(all-users) autostart and Task Scheduler hardening; a settings *window* (we open the
JSON file instead); macOS/Linux polish beyond "the binary runs." Per-user logon
autostart is **now in scope as opt-in P5** (Startup-folder launcher, off by default).

## Current architecture (recap)

- **Renderer** [`scripts/render-sunflower.mjs`](../../../scripts/render-sunflower.mjs) — batch build (markdown → HTML in `.ai/_view`). Needs `markdown-it` et al. Not a server.
- **Hub daemon** [`scripts/hub-serve.mjs`](../../../scripts/hub-serve.mjs) — long-lived HTTP server on 4173, serves all repos at `/r/<id>/`, token-gated write endpoint. **Built-ins + local `lib/` only — no third-party deps.**
- **Per-repo daemon** [`scripts/render-sunflower-serve.mjs`](../../../scripts/render-sunflower-serve.mjs) — read-only single-repo server (4173/4174).
- **Lifecycle** [`lib/hub-lifecycle.mjs`](../../../lib/hub-lifecycle.mjs) (`ensureHubLifecycle`, `stopHub`) + [`lib/serve-lifecycle.mjs`](../../../lib/serve-lifecycle.mjs). Detached spawn via [`lib/detach.mjs`](../../../lib/detach.mjs); PID files at `~/.sdlc/hub.pid` and `.ai/_view/.serve.pid`; version-aware reaping on upgrade (v9.37.0).
- **Start trigger today:** SessionStart hook → `render-sunflower.mjs --bootstrap` → `ensureHubLifecycle` + `ensureServeLifecycle` ([`hooks/session-start-orient.mjs`](../../../hooks/session-start-orient.mjs)).

## Constraint: dependency delivery (traced)

Claude Code **never auto-runs `npm install`**; `node_modules/` is **gitignored**;
there is **no postinstall** and the only SessionStart hook does orientation, not
install. Third-party deps (`markdown-it`/`js-yaml`/`ajv`) reach users **only via a
manual `npm install`** ([`docs/site/sunflower-view.md`](../../site/sunflower-view.md)). Design is fail-open: no deps → the
*view* doesn't render; the engine is unaffected.

> **Reconciled 2026-06-07:** P0–P3 of [SELF-CONTAINED-BUILD-PLAN.md](SELF-CONTAINED-BUILD-PLAN.md)
> have since **landed** — the renderer's third-party deps are now esbuild-bundled into
> committed `dist/*.mjs`, so the view renders on a fresh clone with **no manual `npm
> install`**. The paragraph above is the *original* motivation; the tray's "carry its
> own runtime" stance still holds (it vendors Go binaries + a JS bundle), but it now
> *reinforces* an already install-free plugin rather than working around a manual gate.

**Consequence for the tray:** to avoid sitting behind that same manual gate, the
tray must carry its own runtime — hence "fully self-contained." Two artifacts to
vendor: systray2's **JS** (bundled) and its **native Go binaries** (committed).
The tray's control surface (`hub-lifecycle` + `pid-file` + `http`) needs **none**
of the existing third-party deps, so a zero-install tray is achievable.

> ⚠️ The tray is launched by the **user in their own terminal**, NOT by Claude.
> So `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` env vars are **not set** at
> tray runtime. Resolve all paths from the script's own location
> (`resolve(__dirname, '..')` = plugin root, as `render-sunflower.mjs` does) and
> use `sdlcHomeDir()` (`~/.sdlc/`) as the writable scratch dir.

## Design — components

| File | Kind | Role |
|---|---|---|
| `scripts/tray.mjs` | source | Tray entry. Boots the helper, builds the menu, polls health every ~5s, swaps icon on up/down, routes clicks → `tray-actions`. |
| `lib/tray-actions.mjs` | source | Pure, testable verbs: `getHealth`, `openDashboard`, `restartHub`, `stopHubAction`, `refreshRegistry`, `openConfig`, `openLogs`, `togglePerRepoServe`, `readToken`. |
| `lib/tray-format.mjs` | source | Pure formatters (no I/O): `formatHealth(payload, {reachable})` → `{ iconState, tooltip, summary, detailRows[], repoItems[] }`; helpers `fmtUptime(ms)`, `fmtBytes(n)`, `fmtRelTime(iso, now)`. |
| `lib/tray-autostart.mjs` | source | **(P5)** Pure-ish autostart verbs: `enableAutostart`, `disableAutostart`, `isAutostartEnabled`, `refreshAutostart` (self-heal a stale target). Platform-dispatched; the only I/O is writing/removing the per-user launcher file. |
| `lib/tray-protocol.mjs` | source | Own ~120-line stdio driver for the systray2 Go helper (`Tray` + `SEPARATOR`): spawns the binary, exchanges line-delimited JSON, maps `__id`→`onClick`. Replaces systray2's JS (resolves risk #1). |
| `dist/tray.mjs` | **committed build** | esbuild bundle of `scripts/tray.mjs` (+ `lib/*`, **no** systray2 JS). Emitted at **depth-1** by the shared `scripts/build.mjs` (a normal SCRIPT entry) so `import.meta`/`__dirname` `..`-relative reads stay correct. Run via `node dist/tray.mjs`. |
| `bin/tray/tray_windows_release.exe`<br>`bin/tray/tray_darwin_release`<br>`bin/tray/tray_linux_release` | **committed binaries** | The 3 systray2 Go helpers, copied from `node_modules/systray2/traybin/` (v2.1.4). Unix two committed with `git update-index --chmod=+x`. |
| `assets/app-icon.{ico,png}` (+ `-down`, `-stale`) | **committed assets** | Sunflower mark rasterized from `favicon.svg` (16/32/48/256). `.ico` for Windows, `.png` for mac/Linux; `-down` = desaturated grey, `-stale` = amber. |
| ~~`scripts/build-tray.mjs`~~ | — | **Not created** — the tray rides the shared `scripts/build.mjs` instead. |
| `scripts/build-icon.mjs` | dev | `favicon.svg` → PNG sizes → ICO. `sharp` + `to-ico` are **ad-hoc** dev installs (not committed devDeps); `npm run build:icon`. |
| `scripts/tray.ps1` / `.cmd` | source | Thin launchers matching `serve-sunflower.ps1` convention (optional). |
| `tests/unit/lib/tray-actions.test.mjs` | test | Verb coverage against a mock hub (mirrors `multi-repo-hub.test.mjs`). |
| `tests/unit/lib/tray-autostart.test.mjs` | test | **(P5)** Autostart verbs against an injected Startup dir: enable writes a correct hidden-launch entry, disable removes it, `refreshAutostart` rewrites a stale target, status reflects presence. |

## Path & vendoring strategy (the careful part)

1. **Vendor binaries outside `node_modules`** (which is gitignored) → `bin/tray/`.
   `bin/` is auto-added to PATH by Claude Code, but the tray runs outside Claude,
   so we reference the path explicitly.
2. **Never exec in place.** The plugin dir may be read-only/ephemeral. At launch:
   detect `process.platform`/`arch` → pick `bin/tray/<name>` → copy to
   `sdlcHomeDir()/bin/<name>` (writable, persistent) → `chmod 0o755` → run that copy.
   (systray2's `copyDir` does this copy-to-writable dance; if it can't be pointed
   at our vendored path, fall back to a ~50-line stdio-protocol wrapper —
   `lib/tray-protocol.mjs` — which removes the systray2 JS dependency entirely.)
3. **Bundle at depth-1.** Emit `dist/tray.cjs` exactly one level under the plugin
   root so every `resolve(__dirname, '..', …)` and `new URL('../package.json',
   import.meta.url)` in `lib/` (all also depth-1) resolves to the same plugin-root
   files. Verified: `config.mjs`, `schema-validator.mjs`, `hub-lifecycle.mjs`,
   `serve-lifecycle.mjs` all use exactly `'..'`. (The tray's action path is also
   schema-free, so it never reads those files anyway.)
4. **`.gitignore`:** add explicit allow rules so `bin/tray/*`, `dist/tray.cjs`, and
   the icon assets are committed despite any broad ignores; confirm `node_modules`
   stays ignored.

## Tray menu → existing capability

| Item | Backed by | Exists? |
|---|---|---|
| **● Health summary** (top, disabled) + **Health ▸** submenu | `GET /__sdlc/health` → `formatHealth` | ✅ `hub-serve.mjs` / `render-sunflower-serve.mjs` |
| Open dashboard | open `http://127.0.0.1:4173/` (`start`/`open`/`xdg-open`) | ✅ |
| Refresh registry | `POST /__sdlc/registry/refresh` + `x-sdlc-token` (token from `~/.sdlc/hub.pid`) | ✅ |
| Restart hub | `stopHub()` → `ensureHubLifecycle()` | ✅ |
| Stop hub | `stopHub()` | ✅ (`hub:stop`) |
| Open hub config… | open `~/.sdlc/hub-config.json` | ✅ |
| Open logs… | open `.ai/_view/.bootstrap.log` | ✅ |
| Per-repo serve ✓/✗ | toggle `hub-config.perRepoServe` | ✅ (v9.36.0) |
| **Start at login ✓/✗** | toggle Startup-folder launcher (`enableAutostart`/`disableAutostart`) | ➕ P5 |
| Quit | tray exit (hub keeps running) | — |

## Health display

The health endpoint already returns a rich payload; the tray *displays* it (no
backend change). Two response shapes, discriminated by `Array.isArray(payload.entries)`:

- **Hub** (`hub-serve.mjs`): `{ version, pid, uptimeMs, configHash, entries:[{id,repoRoot,branch,lastRenderedAt,slugs}], metrics:{requests,sseClients,perRepoLastServed,rssBytes} }`
- **Per-repo daemon** (`render-sunflower-serve.mjs`): leaner `{ version, pid, configHash, renderedAt }` — **no** `entries`/`metrics`.

Surface it in three places, refreshed by the existing ~5s poll:

1. **Tray tooltip** (hover the icon) — one line: `SDLC hub v9.37.0 · 3 repos · up 2h14m · 248 req`. Per-repo mode: `SDLC repo v9.37.0 · rendered 3m ago`.
2. **Top summary row** (first menu item, `enabled:false`) — `● healthy — v9.37.0 · 3 repos` / `● hub down`. The `●` carries colour-by-state in the label text.
3. **`Health ▸` submenu** (`enabled:false` detail rows): version, pid, uptime (`fmtUptime`), requests, SSE clients, RSS (`fmtBytes`), configHash (short). Per-repo mode swaps in `renderedAt` (`fmtRelTime`) and omits the hub-only metrics.
4. **Per-repo entries** (hub only) — one clickable row per `entries[]`: `↳ <id> · <branch> · <n> slugs · rendered <rel>` → opens `/r/<id>/`. (`perRepoLastServed[id]` shown in that row's tooltip.)

State machine for the icon + summary, derived purely by `formatHealth(payload, {reachable})`:

| Condition | `iconState` | Summary |
|---|---|---|
| 200 + `entries` present | `up` (colour icon) | `● healthy — vX · N repos` |
| 200, no `entries` (per-repo) | `up` | `● serving repo — vX` |
| probe failed / non-200 / parse error | `down` (desaturated icon) | `● hub down — start it?` (Restart enabled) |
| version ≠ tray's PLUGIN_VERSION | `stale` (amber) | `● stale vX → vY (restart)` |

`getHealth` resolves the endpoint from `~/.sdlc/hub.pid` (host/port), falling back to
`127.0.0.1:4173`; returns `{ reachable, payload|null }`. `formatHealth` is pure — it
takes that result + a `now` and returns the tooltip/summary/rows/repoItems the menu
builder maps straight onto systray2 items. Keeping it pure makes every state above a
unit test with a fixture payload (no live server needed).

## Autostart (P5)

Opt-in, **off by default**. This inverts the base relationship: instead of the
(hidden, headless) daemon trying to surface a GUI, the **tray** becomes the always-on,
user-facing process tied to the *logon session*, and from there it ensures and observes
the daemon.

```
logon ──► tray (Startup launcher) ──► ensureHubLifecycle() once ──► hub up
                  │
                  └─ menu: Start at login ✓  ·  Restart / Stop / Health always available
```

### Mechanism — per-user Startup-folder launcher (no admin)

Consistent with the locked "no service/registration" stance, autostart is just **file
presence in the user's Startup folder** — no Task Scheduler, no registry Run key, no
elevation:

- **Windows:** write a generated, self-contained hidden-launch script
  `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SDLC Sunflower Tray.vbs`.
  It runs the tray with a hidden window (window-style `0`, no-wait) so there is no
  console flash at logon — the same invisibility goal as [`launch-hidden.vbs`](../../../lib/launch-hidden.vbs),
  but self-contained so it has **no dependency on the plugin's `lib/` path** at logon:
  ```vbscript
  CreateObject("WScript.Shell").Run """<process.execPath>"" ""<dist/tray.cjs>""", 0, False
  ```
  Both paths are **absolute, captured at enable-time** (`process.execPath` and the
  running bundle's own `__filename`) — at logon there is no guarantee `node` is on a
  GUI session's PATH, so we never rely on the bare name.
- **macOS (deferred):** `~/Library/LaunchAgents/com.sdlc.sunflower-tray.plist` with
  `RunAtLoad` (`launchctl load` / `unload`).
- **Linux (deferred):** XDG `~/.config/autostart/sdlc-sunflower-tray.desktop`.

All three share one shape — *a per-user, no-admin launcher file whose presence is the
on/off truth* — so `lib/tray-autostart.mjs` is a thin platform dispatch over three
"materialize / remove / detect a launcher file" implementations. **No new committed or
vendored artifacts:** the launcher is generated at enable-time, never shipped.

### Source of truth & the toggle

File presence **is** the state — no separate config flag to drift out of sync.
`isAutostartEnabled()` = "does the launcher exist (and point at a live bundle)?"; the
menu's `Start at login ✓/✗` maps directly to `enableAutostart()` / `disableAutostart()`,
re-reading status on the existing ~5s poll.

### Self-heal (the staleness trap)

A marketplace **upgrade/reinstall can relocate the plugin dir**, leaving a Startup
launcher pointing at a dead `dist/tray.cjs`. So on every tray run, if autostart is
enabled, call `refreshAutostart()`: if the launcher's embedded target ≠ the
currently-running bundle path, rewrite it. The tray heals its own autostart entry the
next time it runs from any source. (If the bundle is *gone* — plugin uninstalled — the
launcher's hidden `Run` simply no-ops; see risk #9.)

### Supervise on launch — revises "no boot supervisor", for autostart only

The base plan deliberately made the tray "not a boot supervisor" (the hub starts via
the SessionStart bootstrap). **Autostart intentionally relaxes that:** when the tray
starts *and* autostart is enabled, it calls `ensureHubLifecycle()` once at boot (new
verb `ensureHubOnLaunch()` in `tray-actions.mjs`) so the hub is up from logon — before
any Claude session runs.

This is **safe by construction**: `ensureHubLifecycle` is already idempotent via the
PID-file + version-aware port probe ([`hub-lifecycle.mjs:57`](../../../lib/hub-lifecycle.mjs)).
Whether the tray (at logon) or a Claude SessionStart hook (later) calls it first, the
second caller hits the *adopt* path (`already-running`) — never a second hub. So
tray-as-starter and hook-as-starter compose with **zero double-start risk**. Manual
launch (autostart off) keeps the original pure-control-surface behavior — no auto-ensure.

> Composes with the existing `perRepoServe:false` machine kill-switch (v9.36.0):
> autostart governs only whether the *tray* + *hub-ensure* run at logon; it does not
> change per-repo daemon policy.

## Build steps (devDeps only — never shipped)

```sh
npm i -D esbuild sharp to-ico systray2     # systray2 here only to source binaries + JS
node scripts/build-icon.mjs                # favicon.svg → assets/app-icon{,.-down}.{ico,png}
node scripts/build-tray.mjs                # scripts/tray.mjs → dist/tray.cjs (depth-1, cjs, platform=node)
cp node_modules/systray2/traybin/* bin/tray/
git add --chmod=+x bin/tray/tray_darwin_release bin/tray/tray_linux_release
git add bin/tray dist/tray.cjs assets/app-icon*
```

`package.json`: add `"tray": "node dist/tray.cjs"`, `"build:tray": "node scripts/build-tray.mjs"`, `"build:icon": "node scripts/build-icon.mjs"`; add the test file to the `test` list. Runtime `dependencies` stay **unchanged** (tray rides no npm install).

## Testing

- `tray-actions.test.mjs`: mock-hub server asserts `getHealth` resolves the endpoint
  from `hub.pid` and parses both payload shapes; `refreshRegistry` sends the token
  header; `togglePerRepoServe` flips the config file; `openDashboard`/`openLogs`
  build the correct per-platform command without actually launching.
- `tray-format.test.mjs`: `formatHealth` over fixtures for **all four states**
  (hub-up, per-repo-up, down, stale) → asserts `iconState`, `summary`, `tooltip`,
  the `detailRows`, and (hub) `repoItems` with their `/r/<id>/` targets; plus
  `fmtUptime`/`fmtBytes`/`fmtRelTime` edge cases (0, sub-minute, days, missing iso).
  Pure — no live server. Wire both into `npm test`.
- `tray-autostart.test.mjs` **(P5)**: inject a temp `startupDir` + `nodePath` +
  `trayBundle` (no real Startup-folder writes). Assert `enableAutostart` writes a
  launcher carrying both absolute paths and the hidden window-style; `isAutostartEnabled`
  reflects presence; `disableAutostart` removes it; `refreshAutostart` rewrites when the
  embedded target ≠ the current bundle and is a no-op when they match. Pure tmp I/O.
- Manual: `node dist/tray.cjs` on Windows → icon appears, hover shows the tooltip
  summary, `Health ▸` lists detail + repos, icon dims when the hub is stopped.
- Manual **(P5)**: toggle `Start at login ✓`, reboot/relogin → tray returns hidden and
  the hub is up; toggle off → launcher removed from the Startup folder.

## Risks & open questions

1. **~~systray2 binary-path override~~ (RESOLVED — took the stdio wrapper)** — confirmed at implementation that systray2 **cannot** be pointed at a vendored copy under bundling: its `getTrayBinPath` resolves only `./traybin` (cwd) or `__dirname/traybin`, and esbuild rewrites `__dirname` to `dist/`. So we took the planned fallback — `lib/tray-protocol.mjs` speaks the helper's line-delimited JSON directly (no systray2 JS), and the tray copies the vendored `bin/tray/<bin>` to `~/.sdlc/bin/` and runs that. Bonus: drops systray2's `request`/`fs-extra` deps (and their 12 audit vulns) from the shipped bundle.
2. **Unsigned `.exe`** — Windows SmartScreen / AV may flag the vendored helper. Document; consider signing later.
3. **Repo weight** — 3 Go binaries ≈ a few MB committed. Acceptable; note in CHANGELOG.
4. **~~Empty dashboard without render deps~~ (resolved)** — superseded by the landed build foundation: the renderer's deps are now esbuild-bundled into `dist/` (P0–P3), so the dashboard renders on a fresh clone with no `npm install`. The tray no longer needs a "run npm install" hint.
5. **macOS/Linux** — design is cross-platform, but first validation is Windows-only per scope.
6. **Stale autostart target after plugin relocation (P5)** — an upgrade can move `dist/tray.cjs`; the Startup launcher then points at a dead path. Mitigated by `refreshAutostart()` self-heal on every tray run. *Residual:* the window between an upgrade and the next tray run — the very first logon launch after an upgrade may no-op until healed.
7. **`node` not on the logon session's PATH (P5)** — why we embed the absolute `process.execPath` at enable-time, not the bare `node`. If that runtime is later moved/uninstalled the entry breaks; surface an "autostart target invalid" hint in the menu and self-heal on the next manual run.
8. **AV/SmartScreen on the Startup `.vbs` (P5)** — a script in the Startup folder may draw AV attention (same family as risk #2). Document; the `.vbs` is plain, readable, user-scoped, no elevation.
9. **Orphaned Startup entry after plugin uninstall (P5)** — disabling before uninstall is the clean path; absent that, the launcher's hidden `Run` no-ops on a missing bundle (no error window). *Nice-to-have:* have `refreshAutostart` self-remove when the bundle is gone.
10. **Double-start race — non-issue (P5)** — recorded only to show it was considered: covered by `ensureHubLifecycle` idempotency (adopt-if-running), so tray-at-logon and hook-later never produce two hubs.

## Phased checklist

- [x] **P0 — Actions + health format:** `lib/tray-actions.mjs` (`getHealth`, `refreshRegistry`, `restartHub`, `stopHubAction`, `openDashboard`/`openRepo`/`openConfig`/`openLogs`, `togglePerRepoServe`, `ensureHubOnLaunch`, …) + `lib/tray-format.mjs` (`formatHealth` + `fmtUptime`/`fmtBytes`/`fmtRelTime`) + `writeHubConfig` added to `hub-config.mjs`. 17 unit tests (`tray-format.test.mjs` 4 states + helper edges; `tray-actions.test.mjs` mock-hub). ✅
- [x] **P1 — Icon:** `scripts/build-icon.mjs` (`npm run build:icon`); committed `app-icon{,-down,-stale}.{ico,png}` (colour / desaturated grey / amber), rasterized from `favicon.svg` via sharp + to-ico (ad-hoc dev tools). ✅
- [x] **P2 — Vendor + bundle:** binaries committed to `bin/tray/` (3 platforms); `lib/tray-protocol.mjs` (own stdio driver); `scripts/tray.mjs` added to `scripts/build.mjs` → `dist/tray.mjs` (NOT a separate build-tray.mjs/CJS); `.gitignore` allow-rules for `bin/` + `assets/app-icon*`. ✅
- [x] **P3 — Tray UI:** `scripts/tray.mjs` — menu builder mapping `formatHealth` (summary row + `Health ▸` submenu + clickable repo entries + actions + Per-repo-serve & Start-at-login toggles), click routing, 5s poll re-rendering only on change, icon swap by `iconState`, writable-dir binary copy, `--selfcheck` mode. Risk #1 resolved (stdio wrapper). Smoke-tested live (detected a real stale v9.40.0 hub). ✅
- [x] **P4 — Wire-up:** `package.json` `tray`/`build:icon` scripts + 3 tray tests in `test` + `comment:tray` provenance; `scripts/tray.ps1`; docs section in `sunflower-view.md`; CHANGELOG; version bump 9.45.0 → 9.46.0 (`package.json`, `.claude-plugin/plugin.json`, marketplace); CI freshness gate runs `dist/tray.mjs --selfcheck`. ✅
- [x] **P5 — Autostart (opt-in, off by default):** `lib/tray-autostart.mjs` (Windows Startup `.vbs` + macOS LaunchAgent + Linux XDG content builders) + `ensureHubOnLaunch`; `Start at login ✓/✗` toggle; `refreshAutostart` self-heal at launch; `tray-autostart.test.mjs` (5 tests). Launcher generated at enable-time (no new committed artifacts). ✅
```
