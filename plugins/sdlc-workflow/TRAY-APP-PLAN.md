# TRAY-APP-PLAN — System-tray control app for the sunflower hub

Status: **planning** · scope locked via Q&A 2026-06-01 · target plugin v9.37.x+

> **Depends on [SELF-CONTAINED-BUILD-PLAN.md](SELF-CONTAINED-BUILD-PLAN.md)** (foundation-first,
> chosen 2026-06-01). The tray is the **final entrypoint** added to that shared
> `scripts/build.mjs` esbuild build — `scripts/tray.mjs` → `dist/tray.cjs`. The
> view's manual `npm install` is retired there, plugin-wide; this doc covers only
> the tray-specific additions (UI, vendored binaries, icons).

A user-launched **system-tray (notification-area) app** that controls the existing
sunflower hub / per-repo daemon — start/stop/restart, open dashboard, status,
refresh, settings — with a sunflower **app icon**. Built on **systray2**, shipped
**fully self-contained** (vendored multiplatform binaries + esbuild-bundled JS).

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Service model | **Tray only, no autostart** | Hub keeps starting via the existing SessionStart bootstrap; the tray is a *manual control surface + visibility layer*, not a boot supervisor. |
| Tray tech | **systray2** | Cross-platform; spawns a small Go helper and speaks line-delimited JSON over stdio. |
| Delivery | **Fully self-contained** | Vendor the 3 platform helper binaries + esbuild-bundle the tray JS to one committed file → works on a fresh clone with **zero `npm install`**. |
| Icon | **`.ico`/`.png` from `assets/favicon.svg`** | Reuse the existing sunflower mark; status conveyed by swapping to a desaturated "down" variant. |

## Goal & non-goals

**Goal:** `node dist/tray.cjs` (or `npm run tray`) puts a sunflower icon in the
tray. Its menu drives the hub over the endpoints/lifecycle functions that already
exist. No admin, no service registration, no autostart.

**Non-goals (this iteration):** Windows Service / Session-0 registration; logon
autostart (Task Scheduler / Startup); a settings *window* (we open the JSON file
instead); macOS/Linux polish beyond "the binary runs."

## Current architecture (recap)

- **Renderer** [`scripts/render-sunflower.mjs`](scripts/render-sunflower.mjs) — batch build (markdown → HTML in `.ai/_view`). Needs `markdown-it` et al. Not a server.
- **Hub daemon** [`scripts/hub-serve.mjs`](scripts/hub-serve.mjs) — long-lived HTTP server on 4173, serves all repos at `/r/<id>/`, token-gated write endpoint. **Built-ins + local `lib/` only — no third-party deps.**
- **Per-repo daemon** [`scripts/render-sunflower-serve.mjs`](scripts/render-sunflower-serve.mjs) — read-only single-repo server (4173/4174).
- **Lifecycle** [`lib/hub-lifecycle.mjs`](lib/hub-lifecycle.mjs) (`ensureHubLifecycle`, `stopHub`) + [`lib/serve-lifecycle.mjs`](lib/serve-lifecycle.mjs). Detached spawn via [`lib/detach.mjs`](lib/detach.mjs); PID files at `~/.sdlc/hub.pid` and `.ai/_view/.serve.pid`; version-aware reaping on upgrade (v9.37.0).
- **Start trigger today:** SessionStart hook → `render-sunflower.mjs --bootstrap` → `ensureHubLifecycle` + `ensureServeLifecycle` ([`hooks/session-start-orient.mjs`](hooks/session-start-orient.mjs)).

## Constraint: dependency delivery (traced)

Claude Code **never auto-runs `npm install`**; `node_modules/` is **gitignored**;
there is **no postinstall** and the only SessionStart hook does orientation, not
install. Third-party deps (`markdown-it`/`js-yaml`/`ajv`) reach users **only via a
manual `npm install`** ([`docs/site/sunflower-view.md`](docs/site/sunflower-view.md)). Design is fail-open: no deps → the
*view* doesn't render; the engine is unaffected.

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
| `dist/tray.cjs` | **committed build** | esbuild bundle of `scripts/tray.mjs` (+ systray2 JS + `lib/*`). Emitted at **depth-1** so `import.meta`/`__dirname` `..`-relative reads stay correct. Run via `node dist/tray.cjs`. |
| `bin/tray/tray_windows_release.exe`<br>`bin/tray/tray_darwin_release`<br>`bin/tray/tray_linux_release` | **committed binaries** | The 3 systray2 Go helpers, copied from `node_modules/systray2/traybin/`. Unix two committed with `git update-index --chmod=+x`. |
| `assets/app-icon.ico` / `.png` (+ `-down` variants) | **committed assets** | Sunflower mark rasterized from `favicon.svg` (16/32/48/256). `.ico` for Windows, `.png` for mac/Linux; `-down` = desaturated. |
| `scripts/build-tray.mjs` | dev | esbuild bundle step (`esbuild` = devDep). |
| `scripts/build-icon.mjs` | dev | `favicon.svg` → PNG sizes → ICO (`sharp` + `to-ico` = devDeps). |
| `scripts/tray.ps1` / `.cmd` | source | Thin launchers matching `serve-sunflower.ps1` convention (optional). |
| `tests/unit/lib/tray-actions.test.mjs` | test | Verb coverage against a mock hub (mirrors `multi-repo-hub.test.mjs`). |

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
- Manual: `node dist/tray.cjs` on Windows → icon appears, hover shows the tooltip
  summary, `Health ▸` lists detail + repos, icon dims when the hub is stopped.

## Risks & open questions

1. **systray2 binary-path override** — confirm it can target our vendored copy; else use the thin stdio wrapper (removes the systray2 JS dep). *Resolve at implementation.*
2. **Unsigned `.exe`** — Windows SmartScreen / AV may flag the vendored helper. Document; consider signing later.
3. **Repo weight** — 3 Go binaries ≈ a few MB committed. Acceptable; note in CHANGELOG.
4. **Empty dashboard without render deps** — tray "restart hub" works dep-free, but the dashboard is empty until the user runs the view's `npm install`. Tray could detect (health shows 0 rendered repos) and surface a "run npm install" hint. *Nice-to-have.*
5. **macOS/Linux** — design is cross-platform, but first validation is Windows-only per scope.

## Phased checklist

- [ ] **P0 — Actions + health format:** `lib/tray-actions.mjs` (`getHealth` et al.) and `lib/tray-format.mjs` (`formatHealth` + helpers) + tests. Pure, fully unit-tested; no tray UI yet.
- [ ] **P1 — Icon:** `scripts/build-icon.mjs`; commit `app-icon{,-down}.{ico,png}` (+ amber `-stale` variant for the version-mismatch state).
- [ ] **P2 — Vendor + bundle:** copy binaries to `bin/tray/` (+x); `scripts/build-tray.mjs` → `dist/tray.cjs`; `.gitignore` allow-rules.
- [ ] **P3 — Tray UI:** `scripts/tray.mjs` — menu builder mapping `formatHealth` output (tooltip + summary row + `Health ▸` submenu + clickable repo entries), click routing, 5s poll that re-renders health, icon swap by `iconState`, writable-dir binary copy. Resolve risk #1 here.
- [ ] **P4 — Wire-up:** npm scripts, `scripts/tray.ps1`, docs section in `sunflower-view.md`, CHANGELOG entry, version bump.
```
