# TERMINAL-PLAN — Persistent in-browser terminal sessions (wterm + node-pty)

Status: **planned** (researched 2026-06-10, against v9.53.0). Not started.
Revised same day after an adversarial gap pass — five plan bugs fixed inline
(attach atomicity §2.5, restart-vs-token §2.4, process-tree reaping §3.7,
spawn-error frame §2.4/§3.4, session-list reconciliation §4.6) and six
features folded in (exit notification, re-run, rename/clear/theme/font,
code-browser launch point, slug/worktree binding, first-class `claude`
launcher — decisions 9–12).
Builds directly on the CODEBASE-BROWSER-PLAN precedent: same config/env
transport, same route-mount shape, same committed-bundle rail, same two-daemon
adapter pattern. Read that plan's §6 first — this feature's perimeter is
strictly larger (it is **command execution by design**, not read-only serving).
One warning the precedent does NOT carry: the code browser is stateless per
request; a terminal is long-lived mutable shared state. The hard parts here
are races, lifecycle, and reconciliation — none of which have a code-browser
analogue to crib from.

Requirements (user, 2026-06-10):
1. Multiple terminal sessions per repo, launched from the served UI.
2. Leave a running terminal page and **return to it** — sessions survive the
   browser tab, with scrollback restored on reattach.
3. Frontend is **wterm** (vercel-labs), per explicit decision.

---

## 0. Research record (all verified against live sources 2026-06-10)

What was evaluated and what survived. Re-verify versions before implementation
starts; everything here moves fast.

### 0.1 Chosen pieces

- **wterm** (`@wterm/dom` + `@wterm/ghostty`) — v0.2.1 (2026-04-29), ~3.2k★,
  Apache-2.0, Vercel Labs. DOM renderer (native selection, browser Ctrl+F,
  screen readers), Zig→WASM core. The API surface we need is confirmed
  present and xterm.js-shaped:
  - `new WTerm(el, { core, cols, rows, autoResize, onData, onResize, onTitle })`
  - `term.write(data)` / core `writeRaw(Uint8Array)` — push output manually
  - `onData(data: string)` — keystrokes out; `onResize(cols, rows)`;
    `onTitle(title)` — OSC title changes (free session auto-naming)
  - `resize(cols, rows)`; `autoResize: true` fits the container
  - Its `WebSocketTransport` is a **separate, optional import** — we skip it
    and speak our own protocol.
  - Core selection: `const core = await GhosttyCore.load(wasmUrl)` →
    full-VT libghostty core (~400 KB .wasm, separate asset we must serve).
    The default ~12 KB Zig core is "lightweight" with unspecified escape
    coverage — **we require the ghostty core** (restore-frame fidelity, §8 R2).
- **`@lydell/node-pty`** — the PTY backend. Prebuilds ship as per-platform
  npm packages via `optionalDependencies` (esbuild-style); **"never calls
  node-gyp."** Per-platform-only packaging (no per-Node-ABI variants) implies
  Node-API/ABI-stable addons — exactly the property committed binaries need.
  Based on microsoft/node-pty 1.2.0-beta line (active: beta.13, 2026-05-13):
  ConPTY-only on Windows (Win10 1809+; winpty removed), bundles its own
  `conpty.dll` (`third_party/conpty/`) — **the dll must travel with the
  .node file** when vendored. MIT.
- **`@xterm/headless` 6.0.0 + `@xterm/addon-serialize` 0.14.0** — the
  server-side session mirror + reattach-restore mechanism (the VS Code
  reconnect pattern, xterm.js #595). Pure JS; esbuild-bundles into dist/.
- **`ws`** — WebSocket server on the raw `node:http` daemons. Pure JS;
  bundles, provided its optional native accelerators (`bufferutil`,
  `utf-8-validate`) are marked `external` (it `require`s them in try/catch
  and falls back to JS when absent).

### 0.2 Rejected

- **ttyd** — would have been "vendor one binary, skip node-pty + ws + broker
  entirely," but: no official Windows release asset (latest 1.7.7 is
  2024-03-30, Linux-only binaries), and it owns its own auth/session model we
  can't gate with ours. Dead end on a Windows-primary machine.
- **wetty** — node-pty underneath anyway, plus Express/socket.io and an
  SSH-oriented design. Strictly worse than building thin on our server.
- **ghostty-web / restty** as frontend — viable family, but the wterm
  decision is made; ghostty-web remains the contingency (xterm.js-compatible
  API) if wterm's v0.2.x churn bites (§8 R1).
- **`@homebridge/node-pty-prebuilt-multiarch`** — prebuilds arrive via
  postinstall *download*, which our zero-install model can't run. Lydell's
  in-package prebuilds fit; homebridge's pattern doesn't.

### 0.3 devDependencies to add (bundled at build time, never user-installed)

```
ws                       — WS server, bundled into the daemon entrypoints
@xterm/headless          — server-side mirror, bundled
@xterm/addon-serialize   — restore frames, bundled
@wterm/dom               — browser bundle (pulls @wterm/core)
@wterm/ghostty           — browser bundle + the .wasm asset we copy to dist/
```

`@lydell/node-pty` is **NOT a permanent devDependency** — it is an ad-hoc
vendoring tool, same policy as systray2 for the tray binaries (package.json
`comment:tray`). See §3.2 for the refresh procedure.

---

## 1. Decision record (why this shape)

1. **Session broker, decoupled from connections.** Requirement 2 forces it:
   the PTY + its state live in the daemon under a session id; a WebSocket is
   just a viewer that attaches/detaches. Everything else (multi-tab viewing,
   reattach restore, exited-session cards, activity badges) falls out of this
   one decision.
2. **Server mirror is `@xterm/headless`, frontend is wterm — a deliberately
   mixed stack.** wterm has no Node-side headless/serialize equivalent. The
   interface between the halves is VT bytes (restore frame + live stream), the
   most standardized wire format there is. Do not "unify" the two ends; the
   mirror choice and renderer choice are independent by design.
3. **Restore = serialize, not raw replay.** A raw output ring-buffer replays
   wrong after resizes and unbounded history. `@xterm/headless` +
   `addon-serialize` snapshots screen + scrollback as a bounded VT string.
   (A small raw ring is still kept per session — debugging + transcript tail
   for `exited` sessions — but it is never the restore path.)
4. **PTY = vendored `@lydell/node-pty` platform packages, feature-dark when
   absent.** Zero-install rules out compile-on-install and postinstall
   downloads. Committed per-platform dirs, probed at boot; missing/unloadable
   binary ⇒ terminal feature reports unavailable with a reason, everything
   else unaffected (the view layer's fail-open precedent).
5. **Default OFF; loopback-only; hard-refused under any public exposure.**
   This is RCE-as-a-feature. Stricter than codeBrowser (default ON, secrets
   downgraded when public): `terminal.enabled` defaults **false**, and when
   the daemon is reachable beyond loopback (`allowAllHosts` or a non-empty
   extra-hosts allowlist — same `publicExposure` predicate the code browser
   uses) the routes 404 and the broker never starts. **No tailnet mode in v1.**
6. **Sessions die with their daemon (v1).** The hub restarts on config-hash
   drift and on version upgrade. A detached broker process that survives
   restarts is real tmux-ness but recreates the zombie-daemon problem class
   (see SDLC hub port-squat history). v1: accept the loss, say so in the UI.
   Revisit only with demonstrated need (§10).
7. **Machine-wide config only.** Serve settings are banned from per-repo
   config by schema (`.ai/sdlc-config.json` comment). The `terminal` block
   lives in `~/.sdlc/hub-config.json`, rides `SDLC_TERMINAL` env to both
   daemons. Per-repo nuance (presets) is *derived* (package.json scripts),
   not configured (§9 Slice 5).
8. **React 19 for the page shell** — matches view-src/code-browser
   conventions and the existing Tailwind rail. wterm itself is vanilla and
   mounts into a ref'd div; React owns only the chrome (tabs, list, banners).
9. **Exit notification rides the EXISTING SSE channel.** When a session
   exits with zero viewers attached, the broker emits and the daemon forwards
   a `terminal-exit` event on `/__sdlc/events` — any open hub/repo page can
   toast it; the tray app adds an OS notification later (Slice 6). "Tell me
   when the build I walked away from finished" is the payoff of the detach
   premise, so it is a planned feature, not an afterthought.
10. **Workflow binding, v1 scope = slug-aware cwd + dashboard surfacing.**
    A terminal opened "for slug X" must land in slug X's **worktree/branch
    checkout**, not the repo's current HEAD (the SLUG-BRANCH v9.49.0 model
    makes `entry.repoRoot` the wrong default for slug-scoped work), and live
    sessions surface in the hub ledger. Deeper binding (stage-derived
    commands, per-slug session keys) is explicitly deferred (§10.6) — this
    keeps the broker generic while making the feature SDLC-shaped, not
    wetty-shaped.
11. **`claude`-in-repo is a first-class launcher, not a preset.** Launching
    Claude Code in a repo/worktree from the hub is a primary motivation and
    has its own considerations (env inheritance, hub-recursion semantics —
    §3.6); it gets a dedicated config key, button, and test, separate from
    the generic package-json presets.
12. **Restart-vs-token resolution: re-fetch the page, don't retry the
    socket.** The per-boot pageToken (§3.4) and reconnect-with-backoff
    (§2.4) are in direct tension across a daemon restart — the old token can
    only ever earn 4401 from the new daemon. The client treats
    4401-after-previously-authed as "daemon restarted": stop retrying, show
    the restart banner, and offer/perform a full page reload (which carries
    the fresh token). R6's messaging hangs off this path.

---

## 2. Architecture

### 2.1 Component map

```
browser (per repo, per tab)                         daemon (hub or standalone)
┌────────────────────────────┐                     ┌──────────────────────────────┐
│ terminal page (React)      │  HTTP (REST+HTML)   │ lib/terminal-routes.mjs      │
│  ├─ session tabs/list      │◄───────────────────►│  (shared adapter, both       │
│  └─ WTerm + GhosttyCore    │                     │   daemons — serveCodeBrowser │
│     onData ──► ws.send     │  WS (1 per viewer)  │   twin)                      │
│     term.write ◄── ws      │◄───────────────────►│ lib/terminal-broker.mjs      │
└────────────────────────────┘                     │  sessions: Map<sid, S>       │
                                                   │  S = { pty, mirror(headless),│
                                                   │        viewers:Set<ws>,      │
                                                   │        meta, ring, state }   │
                                                   │ lib/pty-loader.mjs           │
                                                   │  └─ vendor/pty/<plat>/ .node │
                                                   └──────────────────────────────┘
```

One broker per daemon process. Hub mode: one broker serves all repos
(sessions keyed with `repoId`). Standalone fallback daemon: same modules,
repo-scoped. Sessions do NOT migrate between hub and standalone.

### 2.2 Session model & lifecycle

```
SessionMeta {
  id: crypto.randomUUID(),     // unguessable — part of the security model
  repoId, repoRoot,            // validated registry entry (hub) / cwd (standalone)
  slug: string | null,         // optional workflow binding (decision 10)
  worktreePath: string | null, // resolved slug worktree (§3.6); null = repoRoot
  title, titlePinned: bool,    // last OSC title, else shell basename; a manual
                               // rename sets titlePinned and OSC stops overriding
  launcher: 'shell'|'claude'|'preset',
  shell, args, cwd,            // resolved at spawn (§3.6) — RETAINED verbatim so
                               // re-run (§3.4) can respawn without re-resolving
  cols, rows,
  createdAt, lastActivityAt,   // activity = output | input | attach
  state: 'running' | 'exited',
  exitCode: number | null,
}
```

- `running → exited(code)`: on PTY exit, take one final serialize snapshot,
  free the PTY, keep mirror + snapshot for transcript/restore-as-static.
  Broadcast `{t:'exit'}` to viewers; if `viewers.size === 0`, emit the
  broker-level `session-exit` event (→ SSE `terminal-exit`, decision 9).
  The session card stays visible and offers **Run again** (re-spawn from the
  retained spawn params) alongside transcript/dismiss.
- Reaping: a `running` session is killed when `viewers.size === 0 &&
  now - lastActivityAt > idleTimeoutMin` (default generous — detached-but-
  running is the point). `exited` sessions GC after `keepExitedMin`.
  Explicit `kill` / `dismiss` short-circuit both. Single broker-level
  interval timer; injectable clock for tests.
- Caps: `maxSessions` machine-wide, `maxSessionsPerRepo`, `maxViewersPerSession`.

### 2.3 URL scheme

```
hub:         /r/<idRaw>/__terminal/            page (list + tabs)
             /r/<idRaw>/__terminal/s/<sid>     deep link — THE "return to it" URL
             /r/<idRaw>/__terminal/ws?...      WS upgrade endpoint
             /r/<idRaw>/__terminal/api/...     REST (§3.4)
standalone:  /__terminal/…                     same shapes
assets:      /__sdlc/terminal.js · terminal.css · terminal-ghostty.wasm
```

Intercepted in the daemons **before** the view resolver, exactly like
`__code` (hub-serve.mjs:561) — a route family, never shadowable by a slug.

### 2.4 Wire protocol (versioned: first server frame carries `v:1`)

Text frames = JSON control; binary frames = raw bytes. Auth is **first-frame**
(not query-string — keeps the token out of URLs/logs).

```
client → server
  {t:'auth', token, session?}        within 5s of upgrade, else close 4401.
                                     session absent ⇒ attach to page default
                                     (sid in page URL) — sid arrives here, in
                                     a frame, not in the ws URL.
  {t:'resize', cols, rows}           latest-writer-wins across viewers
  {t:'input-paste', data}            bracketed-paste path (string)
  {t:'clear'}                        clear scrollback — resets the MIRROR too
                                     (§2.5; a client-only clear would resurrect
                                     cleared content on the next restore)
  <binary>                           keystrokes → pty.write (utf-8)
  {t:'ping'}                         client keepalive (15s)

server → client
  {t:'hello', v:1, sid, meta}        after successful auth
  {t:'restore', cols, rows, data}    serialize() output — write to term FIRST
  <binary>                           live PTY output (also fed to mirror)
  {t:'title', title}                 mirrored from OSC / meta change
  {t:'exit', code}                   state change; socket stays open (banner)
  {t:'error', code, message}         runtime failure on a live session (pty
                                     write/resize error, clear failure) —
                                     spawn-time failures surface via REST (§3.4)
  {t:'viewers', n}                   presence
  {t:'pong'}
close codes: 4401 auth · 4404 unknown sid · 4409 viewer cap · 4503 disabled
```

- **Flow control:** when a viewer's `ws.bufferedAmount` exceeds a high-water
  mark, `pty.pause()`; resume when ALL viewers drain. node-pty exposes
  pause/resume; without this, `cat huge.log` balloons daemon memory.
- **Heartbeat:** server pings every 30s, drops dead viewers. Note:
  `server.requestTimeout`/`headersTimeout` (hub-serve.mjs:577) do NOT govern
  upgraded sockets — the broker owns its own liveness.
- Client reconnects with capped exponential backoff (the SSE reload client is
  the precedent); on reconnect it re-auths and receives a fresh restore frame.
  Restore is idempotent ONLY because attach is atomic (§2.5) — do not weaken
  that invariant and expect this paragraph to stay true.
- **Restart detection (decision 12):** a 4401 on a connection that had
  previously authed means the daemon restarted (new pageToken) — and with it,
  ALL sessions died (decision 6). The client stops the backoff loop, shows
  the "daemon restarted — sessions lost" banner (R6), and reloads the page to
  obtain the new token. A 4404 after reconnect means THIS session was reaped
  or killed while detached — reconcile via the session list (§4.6), don't
  retry.

### 2.5 The headless mirror

Per session: `new HeadlessTerminal({ cols, rows, scrollback: cfg.scrollbackLines,
allowProposedApi: true })` + serialize addon. All PTY output is written to the
mirror AND broadcast. On attach: `serialize()` → one `restore` frame. On
resize: mirror resized with the PTY. Memory cost ≈ scrollback × cols cells —
bounded by config; with defaults (5000 × ~200) a few MB/session, ceiling'd by
`maxSessions`.

**Attach is atomic — the load-bearing invariant of this whole design.**
`serialize()` and `viewers.add(ws)` MUST happen in the same synchronous tick
as the output pump, with no `await` between them: a viewer added after a
chunk reached the mirror but before broadcast would see that chunk twice
(restore + live); added before the mirror write, it would miss it entirely.
This is THE classic terminal-reconnect bug. Concretely: the PTY `onData`
handler does `mirror.write(chunk)` then broadcasts to the CURRENT viewer set
synchronously; `attach()` runs `serialize()` + `viewers.add()` back-to-back
with nothing async between. `mirror.write` is callback-async internally —
attach must therefore drain through the same single-writer queue the pump
uses (one per-session FIFO ordering mirror-writes and attaches), not call
`serialize()` ad hoc. The unit suite pins this with an interleaving test
(§7): N chunks racing M attaches ⇒ every viewer sees every byte exactly once.

`{t:'clear'}` goes through the same queue: `mirror.reset()` + drop the raw
ring + broadcast a clear to other viewers — so a restore after clear replays
nothing stale.

---

## 3. Half A — backend

### 3.1 `lib/terminal-broker.mjs` (new; pure logic, no HTTP)

```
createTerminalBroker({ config, loadPty = defaultLoader, now = Date.now })
  .available            → { ok } | { ok:false, reason }     (pty probe result)
  .createSession({ repoId, repoRoot, slug?, cwd?, command?, launcher?, title? })
                        → meta | throws CapError | throws SpawnError
  .attach(sid, viewer)  → { meta, restore:{cols,rows,data} } (viewer = ws-like;
                          atomic per §2.5)
  .detach(sid, viewer)
  .input(sid, bytes) / .resize(sid, cols, rows) / .clear(sid)
  .kill(sid) / .dismiss(sid)
  .rename(sid, title)   → meta   (clamped length; sets titlePinned — OSC titles
                                  no longer override a manual name)
  .rerun(sid)           → meta   (NEW session from an exited session's retained
                                  spawn params {shell,args,cwd,launcher,slug};
                                  the exited card stays until dismissed)
  .list(repoId?)        → meta[] (no secrets in meta — it feeds JSON routes)
  .transcript(sid)      → string  (mirror serialize, exited included)
  .on('session-exit'|'session-created'|'session-reaped', fn)
                        → daemon forwards to SSE (decision 9) + health payload
  .closeAll()           → tree-kill every PTY (§3.7; daemon shutdown hook)
```

Error types: `CapError` (session/viewer caps — REST 429) vs `SpawnError`
(shell missing, cwd vanished, EACCES, ConPTY init failure — REST 502 with the
reason; the boot probe only proves the ADDON loads, not that any given spawn
succeeds). The distinction is part of the route contract (§3.4).

Injectable `loadPty` + clock ⇒ the entire lifecycle is unit-testable with a
fake PTY (no native code in unit tests). The broker never touches req/res.

### 3.2 `lib/pty-loader.mjs` + `vendor/pty/` (new)

- Layout (committed): `vendor/pty/<platform>-<arch>/` = a verbatim copy of the
  `@lydell/node-pty-<platform>-<arch>` package dir (its `.node` files,
  `conpty.dll` + ConPTY helpers on win32, its JS entry, its LICENSE), plus
  `vendor/pty/MANIFEST.json` recording `{ package, version, sha256 }` per dir
  (supply-chain provenance, §6 T8).
- Loader: resolve `vendor/pty/${process.platform}-${process.arch}`, load via
  `createRequire(import.meta.url)` from the **source path** — `../vendor/…`
  works identically from `lib/` and from a depth-1 `dist/` chunk (the DOCS_ROOT
  trick). Try/catch → `{ ok:false, reason }`; never throws at import time.
  **`.node` files are not bundleable — the vendor dir is runtime data, not a
  build input.** Cache the loaded module.
- Initial platform set: `win32-x64` (the dev machine) — others added in
  Slice 5 (`darwin-arm64`, `darwin-x64`, `linux-x64`). Feature-dark elsewhere
  with an honest reason string surfaced in health + UI.
- Refresh procedure (documented in the package.json comment style):
  `npm i -D @lydell/node-pty && node scripts/vendor-pty.mjs` — the script
  copies the platform packages out of node_modules into vendor/, rewrites
  MANIFEST.json, and is also the verifier CI runs (hash check only; CI never
  installs the dep). Then `npm rm @lydell/node-pty`.
- Boot probe: load + `spawn` a trivial command + immediate kill, at daemon
  start when `terminal.enabled` — result lands in `/__sdlc/health` payload
  (`terminal: { enabled, ptyOk, reason, sessions }`).
- Check `.gitignore` admits `vendor/` (nothing currently excludes it; add an
  explicit `!vendor/` only if a future rule collides).

### 3.3 WS layer (inside `lib/terminal-routes.mjs`)

- `ws` in `noServer` mode: both daemons add ONE `server.on('upgrade')`
  handler that (a) gates `hostAllowed(req, …)` — the existing global gate
  covers requests, **not** upgrades; (b) gates `Origin` against the same
  allowlist (a browser always sends Origin on ws; absent/foreign ⇒ destroy
  socket); (c) path-matches the `__terminal/ws` family, else
  `socket.destroy()`; (d) `wss.handleUpgrade` → hand the socket to the
  broker pending first-frame auth (§2.4).
- `maxPayload` set (e.g. 1 MB) — input frames are keystrokes/pastes, not bulk.

### 3.4 REST + shell routes (`lib/terminal-routes.mjs`, the adapter twin)

`serveTerminal({ req, res, url, basePath, repoRoot, repoId, repoLabel,
headBranch, config, broker, pageToken, pluginVersion, csp, renderPage,
publicExposure })` — same calling convention as `serveCodeBrowser` so the
hub mount is a 10-line twin of `serveRepoCode` and the standalone mount
mirrors its `__code` block.

```
GET  <base>/                    HTML shell (renderPage; embeds pageToken).
                                Honors ?cwd=<rel>&slug=<slug> deep-link params
                                (the code-browser launch point, §4.6) — they
                                PRE-FILL the create form, never auto-spawn.
GET  <base>/s/<sid>             same shell, deep-linked session
GET  <base>/api/sessions        list JSON
POST <base>/api/sessions        create { cwd?, slug?, command?, launcher?, title? } → meta
POST <base>/api/sessions/<sid>/kill
POST <base>/api/sessions/<sid>/dismiss
POST <base>/api/sessions/<sid>/rename        { title }
POST <base>/api/sessions/<sid>/rerun         → new meta (from exited card)
GET  <base>/api/sessions/<sid>/transcript    text/plain attachment
```

Status contract (callers must be able to distinguish these):
`404` disabled / publicExposure / unknown sid · `403` missing/bad token
header · `429` CapError (with `{which:'sessions'|'perRepo'|'viewers'}`) ·
`502` SpawnError (with reason — shell missing, cwd gone, ConPTY failure) ·
`503` pty unavailable on this platform (`broker.available.reason`). The cap
check + slot reservation happen synchronously BEFORE the async spawn, so two
concurrent creates cannot both pass the cap.

- `config.enabled === false` OR `publicExposure` OR `!broker.available.ok`
  ⇒ every route 404s (`enabled:false` parity with the code browser; public
  ⇒ hard refusal per decision 5 — note the asymmetry with codeBrowser's
  softer secrets-downgrade is deliberate).
- **Mutating routes require `X-Sdlc-Terminal-Token: <pageToken>`** — a
  custom header forces a CORS preflight, which a foreign origin cannot pass
  (§6 T6). GETs are loopback-gated only, and return no secrets.
- `pageToken`: per-daemon-boot `crypto.randomBytes(32)`, generated beside the
  broker, embedded in the HTML shell, required by WS auth + REST mutations.
  **Distinct from `SDLC_HUB_TOKEN`** — the hub token guards registry writes
  and must never reach a page.

### 3.5 Daemon mounts (edits)

- `scripts/hub-serve.mjs`: intercept `'/__terminal'` inside the existing
  `/r/<id>/…` match exactly where `__code` is intercepted (hub-serve.mjs:561);
  same `validateEntry`-then-trust-repoRoot guard as `serveRepoCode`
  (hub-serve.mjs:290). Asset routes beside the code-browser ones
  (hub-serve.mjs:527), gated on `terminal.enabled`. `upgrade` handler on the
  server. Broker instantiated in `createHubServer` when enabled+local;
  `server.close` override (hub-serve.mjs:581) additionally `broker.closeAll()`.
  Health payload gains the `terminal` block. Topbar entry: extend
  `transformServedHtml` step 4 (hub-serve.mjs:411) with a `term-link` twin of
  `code-link`, gated on effective availability. **SSE forwarding (decision
  9):** the hub subscribes to `broker.on('session-exit')` and `emit()`s a
  `terminal-exit` event `{id: repoId, sid, title, exitCode}` on the EXISTING
  `/__sdlc/events` stream — zero new transport; any page already listening
  for `reload` can toast it.
- `scripts/render-sunflower-serve.mjs`: mirror its `__code` mount for
  `__terminal` + the upgrade handler. NOTE: the standalone daemon applies
  `hostAllowed` only to `__code`/asset routes today — terminal routes AND
  upgrades must be inside that gate.
- `renderers/hub-dashboard.mjs`: Slice 4 — session strip (counts + links)
  from `broker.list()`, passed in like `codeBrowserEnabled` is today; and
  per decision 10, slug-bound running sessions surface as a marker on the
  slug's ledger row ("live terminal"), not just an aggregate count — the
  ledger is where a user looks for slug state.

### 3.6 Spawn semantics

- **Root resolution (decision 10):** the spawn root is the slug's worktree
  when a `slug` is given, else `entry.repoRoot` (hub) / project root
  (standalone). Worktree lookup: the registry's slugMeta already carries the
  slug's `branch` (SLUG-BRANCH v9.49.0); match it against
  `git -C <repoRoot> worktree list --porcelain` (TTL-cached, the
  gitIgnoredSet pattern) → that worktree's path becomes the root; no
  worktree for the branch ⇒ fall back to `repoRoot` and say so in meta
  (`worktreePath:null`). Never create worktrees — resolution only.
- `cwd`: a `cwd` in the create body is root-relative and resolved through
  **`resolveRepoPath(root, cwd)`** (reuse the audited kernel from
  lib/code-browser.mjs — string rejects, lexical, realpath; deny not needed)
  so "open terminal at this folder" can never spawn outside the resolved
  root.
- Shell resolution: `config.shell` if set; else win32 probe order
  `pwsh.exe → powershell.exe → cmd.exe` (PATH probe, cached); else
  `$SHELL || /bin/bash`. `command` (presets, Slice 6) runs via the shell:
  `['-NoExit','-Command',…]` / `-c` form per shell family.
- **The `claude` launcher (decision 11):** `launcher:'claude'` spawns
  `config.claudeCommand` (default `claude`) through the shell at the
  resolved root. Considerations that make it first-class rather than a
  preset string: (a) it must inherit the user's full profile env (auth,
  `CLAUDE_*`) — the scrub below removes ONLY our tokens, which is exactly
  right, but this is now a tested guarantee, not an accident; (b)
  hub-recursion is by design — the spawned Claude's own SDLC hooks will
  render + upsert into the SAME hub, which is the desired loop, and works
  precisely BECAUSE `SDLC_TERMINAL`/`SDLC_CODE_BROWSER`/`SDLC_HUB_TOKEN`
  are scrubbed (the child re-derives hub config from `~/.sdlc/` like any
  session); (c) the command is config-fixed, never request-supplied — the
  create body selects a launcher id, it cannot inject argv.
- **Env scrub:** child env = `process.env` minus `SDLC_HUB_TOKEN`,
  `SDLC_TERMINAL`, `SDLC_CODE_BROWSER`, plus `TERM=xterm-256color`,
  `COLORTERM=truecolor`. The scrub list lives next to the spawn and is
  unit-tested (§7) — leaking the hub token into every child shell would
  hand registry-write capability to anything that reads its own env.
- node-pty options: `{ name:'xterm-256color', cols, rows, cwd, env,
  useConpty:true }`.

### 3.7 Process-tree lifecycle (the gap the code browser never had)

Killing the PTY kills the *shell*; a session running `npm test` → node →
workers leaves a tree, and on Windows ConPTY descendants are NOT reliably
reaped with the pty. Two mechanisms:

- **Tree-kill on every kill path** (`kill()`, idle reap, `closeAll()`):
  win32 ⇒ `taskkill /PID <pid> /T /F` (execFile, windowsHide, best-effort);
  POSIX ⇒ signal the process group (`process.kill(-pid)`; node-pty makes the
  shell a session leader, but SIGHUP-on-pty-close only reaches the
  *foreground* group — backgrounded children survive without this). One
  helper, `treeKill(pid)`, in the broker, fake-able in tests.
- **Orphan reaper for hard daemon death.** Windows has no catchable SIGTERM
  (hub-serve.mjs:650 already documents this) — on a hard kill, `closeAll()`
  never runs and every session's tree orphans, invisibly. Sidecar:
  `~/.sdlc/terminal-sessions.json` records `{pid, startedAt, shell}` per
  live session (written on spawn, removed on exit — atomic-rename, the
  hub-config writeAtomic pattern). On broker start: read it, and for each
  entry whose pid is alive AND whose process start time matches
  `startedAt` (±2s — the PID-REUSE guard; win32 `wmic`/PowerShell
  `Get-Process` gives creation time, POSIX `ps -o lstart=`), `treeKill` it;
  then truncate. The start-time check is mandatory — reaping a recycled pid
  would kill an innocent process (R9).

The registry's stale-PID recovery is the precedent; this is the same idea
one level down.

---

## 4. Half B — frontend bundle (`view-src/terminal/`)

### 4.1 Workspace (build-only, mirrors view-src/code-browser)

```
view-src/terminal/
  main.tsx          mount; reads page-config JSON (token, base, sid, repo)
  app.tsx           layout: session tabs + list + banners
  term-view.ts      wterm wiring: WTerm + GhosttyCore, container ref,
                    onData/onResize/onTitle ↔ protocol client
  protocol.ts       WS client: auth, frame codec, heartbeat, reconnect
                    (capped backoff), restore-before-stream ordering
  sessions.ts       REST client (list/create/kill/dismiss/transcript)
  styles.css        Tailwind v4 input (rail shared with code-browser)
```

Page-config rides a `<script type="application/json" id="sdlc-terminal-config">`
block in the shell — not inline JS, so the strict CSP shape survives.

### 4.2 wterm wiring specifics

- `const core = await GhosttyCore.load('/__sdlc/terminal-ghostty.wasm?v=<ver>')`
  ONCE per page; `new WTerm(el, { core, autoResize:true, onData, onResize,
  onTitle })` per attached session view.
- Restore ordering: open WS → auth → buffer any early binary frames →
  on `restore`: `term.write(restore.data)` → flush buffer → live. Never
  write live bytes before the restore frame (garbled state otherwise).
- `onTitle` → local tab label + meta refresh; `onResize` → `{t:'resize'}`;
  detach = close WS, PTY untouched (that's the feature).
- Renderer note: wterm's DOM rendering means transcript text is selectable
  and browser-find works — do not add a custom find UI.

### 4.3 Build (`scripts/build.mjs` edits)

- **Node build:** add `external: ['bufferutil', 'utf-8-validate']` to the
  EXISTING node `build()` — required for `ws` to bundle (its optional
  accelerators are try/catch'd at runtime; absent ⇒ pure-JS path). This is
  the first `external` in the build — comment it accordingly.
- **Browser build #2:** twin of the code-browser block (build.mjs:154-188):
  `view-src/terminal/main.tsx` → `dist/terminal.js` (iife, minified,
  NODE_ENV define) + Tailwind → `dist/terminal.css`.
- **WASM copy:** resolve `@wterm/ghostty`'s `.wasm` via
  `createRequire(...).resolve` and copy to `dist/terminal-ghostty.wasm`.
  All three outputs are committed (dist freshness gate covers them
  automatically; remember the SAME-COMMIT rule — see memory/house rule).
- Asset serving: generalize the code-browser's frozen `BUNDLE_ASSETS` map +
  `serveCodeBrowserAsset` into a shared `serveBundleAsset({ name })` with
  one map covering both features; `.wasm → application/wasm` (REQUIRED —
  `WebAssembly.instantiateStreaming` rejects other MIME types). Keep the
  memory-cache + immutable-cache-control behavior verbatim.

### 4.4 HTML shell renderer

`renderers/_terminal-page.mjs` (underscore prefix = shared helper, NOT a
type renderer — it must not become a build entrypoint; the `_code-browser-
page.mjs` precedent). Renders topbar (hub-aware brand), the config JSON
block, and `<script src="/__sdlc/terminal.js?v=…">`.

### 4.5 CSP (terminal routes only)

The strict hub CSP (`script-src 'self'`) **blocks WebAssembly compilation**.
Terminal pages get their own constant, the DOCS_CSP precedent:

```
TERMINAL_CSP = default-src 'self'; img-src 'self' data:;
  style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval';
  connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'
```

`'wasm-unsafe-eval'` admits WASM without admitting JS eval. `connect-src`:
CSP3 says `'self'` covers same-origin ws:, but browser behavior has been
inconsistent — list the schemes explicitly and verify in the e2e pass.
Scoped to `__terminal` shell responses only; every other route keeps CSP.

### 4.6 Page UX contract

- **Session-list reconciliation** — the tab list is a CACHE of broker state
  and must re-fetch `/api/sessions` on: WS reconnect, `window` focus,
  `visibilitychange→visible`, and any `4404`. Tabs for vanished sids become
  inline "session ended while you were away" stubs (dismissable), never
  silent ghosts. The restart path (decision 12) supersedes reconciliation:
  4401-after-auth ⇒ banner + reload, no fetch.
- **Exit toast** — subscribe to the existing SSE stream; `terminal-exit`
  for a session this page knows shows a toast with exit code + "view"
  (focus tab) / "run again" actions. Pages of OTHER repos ignore foreign
  repoIds (the `sdlc-repo-id` meta tag is the filter, as with reload).
- **Rename** — inline tab-label edit → `POST …/rename`; sets `titlePinned`
  so OSC stops overriding (decision recorded in §2.2). Title length clamped
  server-side (e.g. 120 chars).
- **Clear** — toolbar action: local `term.clear()` + `{t:'clear'}` (mirror
  reset, §2.5). Never client-only.
- **Run again** — on exited cards/tabs: `POST …/rerun`, focus the new
  session. The single most common loop (re-run the build) is one click.
- **Theme** — the terminal page ships its own light/dark pair (warm-paper
  light to match the view; a dark palette is NEW — the view layer has zero
  theming today, VIEW-FEATURE-IDEAS Tier-3, so this is self-contained
  greenfield): `prefers-color-scheme` default + manual toggle persisted in
  `localStorage`. Both palettes defined as wterm theme objects + CSS vars
  for the chrome.
- **Font size** — wterm's DOM renderer sizes off CSS, so zoom is a
  `font-size` change on the container + `autoResize` recomputing cols/rows;
  toolbar ± controls, persisted in `localStorage`. (No wterm option needed —
  verified absent from its constructor surface, §0.1.)
- **Launch points** — "New terminal" (shell) and "Claude" (decision 11)
  buttons on the terminal page and the hub session strip; the **code
  browser** gains "open terminal here" on directory nodes, linking
  `__terminal/?cwd=<rel>` (pre-fill, §3.4); slug pages link
  `__terminal/?slug=<slug>` for worktree-resolved sessions (decision 10).
  The code-browser button is the one cross-bundle touch (small addition to
  view-src/code-browser, Slice 5).

---

## 5. Configuration (machine-wide, `~/.sdlc/hub-config.json`)

`TERMINAL_DEFAULTS` exported from lib/terminal-broker.mjs and spread into
`HUB_CONFIG_DEFAULTS` (hub-config.mjs:23) — the CODE_BROWSER_DEFAULTS pattern:

```js
terminal: {
  enabled: false,          // ⚠ RCE surface — explicit machine-wide opt-in
  shell: '',               // '' = auto-probe (§3.6)
  maxSessions: 8,          // machine-wide, across repos
  maxSessionsPerRepo: 4,
  maxViewersPerSession: 4,
  idleTimeoutMin: 240,     // running + zero viewers + no activity → kill
  keepExitedMin: 120,      // exited card retention
  scrollbackLines: 5000,   // mirror + restore-frame bound
  notifyOnExit: true,      // emit terminal-exit SSE for viewerless exits
  claudeLauncher: true,    // show the Claude launch button (decision 11)
  claudeCommand: 'claude', // config-fixed, never request-supplied (§3.6)
}
```

- Transport: `SDLC_TERMINAL` env (JSON), injected at BOTH spawn sites —
  lib/hub-lifecycle.mjs:107-111 and lib/serve-lifecycle.mjs:118-123 — beside
  `SDLC_CODE_BROWSER` (JSON can't ride argv through launch-hidden.vbs).
  Parsed by `terminalConfigFromEnv()` (codeBrowserConfigFromEnv twin).
- `hubConfigHash` covers the block ⇒ editing it restarts the hub ⇒ **kills
  sessions** — the settings page / docs must say so (decision 6).
- Normalization mirrors `normalizeCodeBrowserConfig` (boundedInt clamps,
  `enabled === true` — note: default-false means the truthiness flip vs the
  code browser's `!== false`).

---

## 6. Security model (the dominant concern)

Threats and controls. The asset being protected is **the machine** (a session
is a real shell as the user); the repo is not protected *from* the user.

| # | Threat | Control |
|---|--------|---------|
| T1 | Drive-by WS from a malicious website (SOP does NOT gate WebSockets) | First-frame auth with per-boot `pageToken` (4401 + close on timeout/mismatch) — token reachable only by reading the shell page, which loopback + Host gating protects. PLUS Origin allowlist at upgrade. |
| T2 | DNS rebinding | `hostAllowed` applied AT UPGRADE (new — the global gate covers only requests) and on all `__terminal` routes in BOTH daemons. |
| T3 | Accidental public exposure | `enabled:false` default; hard 404 + no broker under `publicExposure` (allowAllHosts ∨ extraHosts) — stricter than codeBrowser's downgrade, no tailnet carve-out in v1. |
| T4 | Hub token theft via child env | Spawn-time env scrub (`SDLC_HUB_TOKEN`, `SDLC_TERMINAL`, `SDLC_CODE_BROWSER`); unit-tested. |
| T5 | Session-id guessing → attach to someone's shell | `crypto.randomUUID()` ids; ids never appear in logs; attach still requires pageToken. |
| T6 | CSRF on create/kill REST | POST-only + custom `X-Sdlc-Terminal-Token` header (preflight-protected); no state-changing GETs. |
| T7 | Resource exhaustion (session floods, output floods, frame bombs) | Session/viewer caps; `pty.pause()` backpressure on `bufferedAmount`; `ws maxPayload`; scrollback bound; reap timers. |
| T8 | Vendored-binary supply chain | `vendor/pty/MANIFEST.json` pins package+version+sha256; `scripts/vendor-pty.mjs --verify` re-hashes in CI; refresh is a deliberate manual act. |
| T9 | Spawn outside the repo via crafted `cwd` | `resolveRepoPath` reuse (§3.6) — audited kernel, not a re-implementation. |

Review checkpoint: a dedicated security pass (the code browser's
review-before-Ship precedent) is REQUIRED at the end of Slice 2 (backend
exposed) and again at Slice 4 (UI affordances multiply reachability).

---

## 7. Testing

- **Unit — broker** (`tests/unit/lib/terminal-broker.test.mjs`, fake PTY +
  fake clock): create/caps/CapError/SpawnError; **attach-atomicity
  interleaving test (§2.5): N output chunks racing M attaches ⇒ every viewer
  sees every byte exactly once — this test is non-negotiable**; concurrent
  creates cannot both pass the cap (synchronous reservation); multi-viewer
  broadcast + latest-resize-wins; detach leaves PTY running; exit→exited(code)
  + final snapshot + `session-exit` emitted ONLY when viewerless; rerun
  respawns from retained params; rename clamps + pins title against OSC;
  clear resets mirror (restore after clear is empty); idle reap ONLY when
  viewerless; keepExitedMin GC; kill/dismiss; closeAll uses treeKill; env
  scrub list; shell resolution table (win32 probe order mocked); slug→
  worktree resolution (mocked `worktree list` output, fallback path); config
  normalization clamps.
- **Unit — lifecycle sidecar** (fake fs + fake process probes): sidecar
  written on spawn / removed on exit; reaper kills pid only when start time
  matches (pid-reuse guard R9); truncates after pass.
- **Unit — protocol/routes** (mock req/res/socket): auth timeout → 4401;
  bad sid → 4404; viewer cap → 4409; disabled/public → 404 family;
  Host/Origin rejection at upgrade; mutating REST without header → 403;
  status contract of §3.4 (429 cap / 502 spawn / 503 unavailable);
  `{t:'error'}` framing; rename/rerun routes; transcript
  content-type/disposition; ?cwd/?slug params pre-fill and never auto-spawn.
- **Integration — real PTY** (skipped unless `vendor/pty/<plat>` present —
  the suite must stay green on platforms we haven't vendored): spawn shell,
  echo roundtrip, resize takes effect (`$COLUMNS`/`mode con` probe), exit
  code surfaces; **tree-kill**: spawn a shell that backgrounds a sleeper,
  `kill(sid)`, assert the sleeper's pid is gone (the win32 ConPTY case is
  the one that matters); **restore fidelity**: write colored/cursor-moving
  output → serialize → replay into a second headless instance → buffers
  equal (guards the serialize path; the wterm-side render check is
  e2e/manual).
- **E2E** (extend `tests/e2e/acceptance.mjs`): boot daemon with
  `SDLC_TERMINAL={"enabled":true}` env, REST-create a session, attach with a
  node `ws` client (no browser): see prompt bytes; send `echo sdlc-e2e\r`;
  expect echo; disconnect; reattach → restore frame CONTAINS `sdlc-e2e`;
  kill → exit frame. Second client with wrong token → 4401. Browser-level
  pass (wterm rendering, WASM-CSP, Ctrl+F) is a manual checklist item until
  a headed harness exists.
- **Manual checklist:** vim/TUI app; `claude` in a session; paste (bracketed);
  IME; resize storm; 2 tabs same session; hub restart messaging; Windows
  Terminal-style quirks (ConPTY clears screen on resize — expected).

---

## 8. Risks & mitigations

| # | Risk | Mitigation |
|---|------|------------|
| R1 | wterm v0.2.x API churn | Pin exact version; committed bundle means breakage only at our upgrade time; contingency = ghostty-web (xterm-compatible) behind the same protocol client — term-view.ts is the only file that knows wterm exists. |
| R2 | Restore-frame renders wrong in wterm's ghostty core (serialize was built against xterm.js) | Fidelity is plain SGR/CSI/OSC; integration test guards the server side; manual matrix item for the render side; worst-case fallback = also keep the raw ring and replay it for the visible screen only. |
| R3 | `@lydell/node-pty` is a beta line | It tracks microsoft/node-pty 1.2.0-beta (what VS Code ships); pin + MANIFEST hashes; boot probe converts any load failure into feature-dark, never a crashed daemon. |
| R4 | ABI break on user's Node major bump (if the addon turns out not to be fully Node-API) | Boot probe again — degrade with reason string; vendor refresh is the fix path. Verify Node-API claim with `process.report`/load test across Node 20/22 during Slice 1, BEFORE building on it. |
| R5 | ConPTY quirks (resize repaints, exit-code timing, hidden conhost) | Known-quirk list in code comments; useConpty:true explicit; integration tests assert behavior we rely on, nothing more. |
| R6 | Hub restart (config edit / upgrade) kills live sessions silently | Detected via the token, not the socket: reconnect → 4401-after-auth ⇒ "daemon restarted — sessions lost" banner + page reload for the fresh token (decision 12). Landing page labels session counts "lost on hub restart". |
| R7 | Bundle weight (≈400 KB wasm + terminal.js + css) | Same order as the accepted 994 KB code-browser bundle; immutable-cached; loaded only on terminal pages. |
| R8 | `ws`/`external` change subtly breaks OTHER bundles | The `external` additions are runtime-optional requires in ws only; build smoke = existing e2e boots the bundled daemon. |
| R9 | Orphan reaper kills an innocent process via PID reuse | Start-time match is mandatory before any reap kill (§3.7); no match ⇒ drop the sidecar entry, never kill. Unit-pinned. |
| R10 | Attach race regression (duplicate/lost bytes on reattach) | The §2.5 single-writer queue + the non-negotiable interleaving test (§7); any future "optimization" that introduces an await into attach must fail that test. |

---

## 9. Phased checklist (slices — each ends: tests green, `npm run build`,
dist committed in the SAME commit, CHANGELOG entry)

- **Slice 0 — optional, cuttable: native launcher.** POST
  `api/launch-native` spawns the OS terminal at the repo root (win32:
  `wt -d <root>` else `start` fallback). Tiny; establishes config block,
  env transport, pageToken, and route mounts with zero PTY/WS surface.
  Skip if Slice 1 starts immediately.
- **Slice 1 — broker + PTY, no HTTP.** `lib/pty-loader.mjs`,
  `scripts/vendor-pty.mjs`, committed `vendor/pty/win32-x64/`,
  `lib/terminal-broker.mjs` (incl. the §2.5 single-writer attach queue,
  rename/rerun/clear, `treeKill`, the §3.7 sidecar + orphan reaper, the
  event emitter), config block + env plumbing (both lifecycles), unit +
  integration tests incl. the attach-interleaving and tree-kill tests.
  **Gates: R4 Node-API verification; the §2.5 interleaving test green.**
- **Slice 2 — wire it.** `ws` devDep + build `external`,
  `lib/terminal-routes.mjs` (full REST table incl. rename/rerun + the §3.4
  status contract; upgrade + first-frame auth; `{t:'error'}`), mounts in
  BOTH daemons, health payload, SSE `terminal-exit` forwarding, e2e over
  node-ws client. **Gate: security review #1 (T1-T9 walkthrough against
  running daemon).**
- **Slice 3 — the page.** view-src/terminal/ workspace, wterm + GhosttyCore,
  build target + wasm asset + `serveBundleAsset` generalization,
  `renderers/_terminal-page.mjs`, TERMINAL_CSP, reconnect/restore UX, the
  §4.6 contract: list reconciliation, restart-banner+reload path, rename,
  clear, run-again, theme pair, font-size. **Gate: manual matrix (TUI,
  paste, resize, two-viewer, restart recovery, CSP/WASM).**
- **Slice 4 — discoverability + notification.** Topbar `term-link`
  injection, hub landing session strip, slug-row live-session markers,
  exit toasts from SSE, exited cards + dismiss, transcript download.
  **Gate: security review #2 (UI affordances multiply reachability).**
- **Slice 5 — workflow binding.** Slug→worktree resolution (§3.6),
  `?slug=` launch points on slug pages, `?cwd=` "open terminal here" button
  in the code browser (the one cross-bundle touch), `claude` launcher
  end-to-end (decision 11) with its env-inheritance test.
- **Slice 6 — reach + quality of life.** Presets derived from package.json
  scripts, `darwin-arm64`/`linux-x64` vendor dirs, tray OS notification for
  `terminal-exit`, docs/site page (mind verify:docs brand pinning), settings
  exposure in the tray (`togglePerRepoServe` precedent).

---

## 10. Open decisions (tuning, not forks)

1. **Detached broker process** (sessions surviving hub restarts) — explicitly
   OUT for v1 (decision 6). Re-open only if restart-loss is a demonstrated
   recurring pain; the protocol (sid + restore) is already shaped for it.
2. **Per-repo terminal presets in `.ai/sdlc-config.json`** — currently banned
   by the serve-settings rule; package-json derivation may make this moot.
3. **Read-only viewer mode** (attach without input) — trivial server-side
   flag; defer until a use case shows up (mobile observer is the candidate).
4. **Transcript persistence to disk** — v1 is in-memory + download endpoint;
   writing under `~/.sdlc/terminal-logs/` raises retention/secret questions
   not worth answering yet.
5. **wterm `@wterm/react` wrapper vs manual mount** — start with manual
   mount in term-view.ts (fewer moving parts, the wrapper is young); revisit
   if ref lifecycle gets messy.
6. **Deeper workflow binding** beyond decision 10's v1 scope —
   stage-derived commands ("run this slug's test gate"), per-slug session
   keys, session state feeding wf-handoff. Revisit after v1 shows how
   slug-bound sessions actually get used.
7. **Cap-eviction policy** — v1 hard-rejects at the cap (429). Evicting the
   oldest idle session instead is friendlier but surprising; decide with
   usage data.
8. **Side-by-side browser layout** of two independent sessions — distinct
   from in-PTY splits (which stay tmux's job, out of scope); cheap CSS-grid
   work if asked for.
