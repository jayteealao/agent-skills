# Multi-Repo Registry + One-Service Hub + Aggregate Landing Page — Plan

**Status:** Drafted 2026-05-29 via a 4-phase design workflow — 3 independent architectures
generated in parallel, judged, synthesized, then adversarially critiqued against the real
code. The critique surfaced **14 gaps (6 must-fix-before-build)**; all are folded into the
design below and listed verbatim in §9.
**Updated 2026-05-30:** config model switched to **Option C (split scope)** — per-repo files
carry only the `view.hub.enabled` opt-in; all singleton hub settings (host/port/limits/
Tailscale) move to a machine-wide `~/.sdlc/hub-config.json`. Rationale in §6.1; this removes
the cross-repo config-divergence tension and makes `port` a single machine-wide value. **Q4
fully resolved (2026-05-30):** the hub is the **primary** endpoint on **`4173`** — the canonical
SDLC URL in both modes — and the per-repo daemon's fallback port becomes `4174` for the rare
case it is forced to run alongside an active hub (§4.5, §6.1).
**Predecessor:** [HOOKS-NODE-AND-SERVE-PLAN.md](HOOKS-NODE-AND-SERVE-PLAN.md) explicitly
deferred "Multi-repo / centralised registry" as future work. This is that work.
**Authoring provenance:** chosen base = the judged-winner "Filesystem-Aggregator Hub"
(19/25), with grafts from the two runner-up approaches (see §2).

---

## 1. Goal

Give a developer working across many repos **one browser URL** that shows every active SDLC
workflow on their machine — with live reload, correct cross-repo isolation, and **zero port
proliferation**. Three coupled capabilities:

1. **Central registry** — every repo+branch/worktree where `sdlc-workflow` has rendered.
2. **One service** — a single hub daemon serves them all (replacing N per-repo daemons).
3. **Central landing page** — a default starting page visualising all of them at the hub root.

Today the plugin is strictly per-repo: each repo renders to its own `.ai/_view/` and
optionally runs a per-repo static daemon on its own port
([render-sunflower-serve.mjs](scripts/render-sunflower-serve.mjs),
[serve-lifecycle.mjs](lib/serve-lifecycle.mjs)). This design adds a thin aggregation layer
**without changing how per-repo rendering works**.

---

## 2. Chosen architecture: Filesystem-Aggregator Hub

One new Node daemon (`scripts/hub-serve.mjs`, default `127.0.0.1:4173` — the canonical SDLC view URL) reads a machine-wide
registry at `~/.sdlc/registry.json` and routes `/r/<id>/...` requests to each repo's
`.ai/_view` directory using the **existing** `resolveRequestPath` security kernel. No
per-repo sub-processes, no reverse proxy, no port-per-repo. Per-repo daemons remain unchanged
and optional.

```
 Developer machine
 ┌──────────────────────────────────────────────────────────┐
 │  Browser ── http://127.0.0.1:4173 ──►                      │
 │  ┌────────────────────────────────────────────────────┐   │
 │  │  hub-serve.mjs   (one long-lived Node process)      │   │
 │  │  PID: ~/.sdlc/hub.pid   Registry: ~/.sdlc/registry.json │
 │  │                                                     │   │
 │  │  GET  /                  → aggregate landing page    │   │
 │  │  GET  /r/<id>/...        → resolveRequestPath(       │   │
 │  │                              entry.viewDir, stripped)│   │
 │  │  GET  /__sdlc/health     → hub health (all repos)    │   │
 │  │  GET  /__sdlc/events     → one SSE stream (all repos)│   │
 │  │  POST /__sdlc/registry/upsert → registry write       │   │
 │  └──────┬─────────────────────────────────────────────┘   │
 │         │ watch(viewDir) filter '.last-render' per entry   │
 │         ▼                                                  │
 │  repo-A/.ai/_view     repo-B/.ai/_view    A-worktree/.ai/_view │
 │  /r/abc123/           /r/def456/          /r/ghi789/        │
 │                                                            │
 │  Per-repo daemons (render-sunflower-serve.mjs) — OPTIONAL, │
 │  on :4174 when forced alongside an active hub              │
 └──────────────────────────────────────────────────────────┘
```

### Why this base (judged scores)

| Approach | Score | Outcome |
|---|---|---|
| **Filesystem-Aggregator Hub** (chosen) | **19/25** | One process, no proxy, correct per-repo security model, Windows-safe (no symlinks), convention-driven registration. Two judge-found defects (breadcrumb root href; cold-start blocking probe) are fixable without architectural change. |
| Aggregating Hub (single daemon, multi-root) | 16/25 | Same topology; contributed the verified href-correctness analysis, the **hub-as-sole-writer** pattern, livereload **repoId filtering**, and collision-resistant ids — all grafted in. Lost points on the registry write race it under-weighted. |
| Hub + Spokes Reverse-Proxy Federation | 14/25 | Rejected: N-port sprawl + SSE-over-proxy fragility. Its livereload SSE claim was factually wrong (the absolute `/__sdlc/events` URL 404s through a proxy) — the fatal flaw. Contributed the `resolveRequestPath` *extraction* rationale and the SSE fan-out concept. |

### Grafted ideas (from the runner-ups)

- **Hub is the sole registry writer.** Renders `POST /__sdlc/registry/upsert` to the hub when
  it's alive; otherwise fall back to a lock-free per-entry shard write (§3.4). Eliminates the
  concurrent-write race.
- **livereload repoId filtering** via a hub-injected `<meta name="sdlc-repo-id">` so one SSE
  stream can serve every repo without cross-repo spurious reloads (§4.4).
- **`resolveRequestPath` extracted** to `lib/resolve-request-path.mjs` — one shared
  symlink-escape kernel for both the per-repo daemon and the hub (§4.3).
- **Collision-resistant id** — check at upsert, append a 4-char suffix on collision (§3.3).

### Invariants preserved from the per-repo server

1. Read-only — no write endpoints except `POST /__sdlc/registry/upsert`, which is localhost-only
   **and** token-gated (invariant #6).
2. `127.0.0.1` by default; `0.0.0.0` refused unless the **machine-wide** `hub-config.json`
   `tailscale.{enabled,acknowledgedPublic}` are set (deliberately *not* a per-repo, committable
   flag — a public-exposure gate must not be flippable from one repo's checked-in config; §6.1).
3. Same CSP; symlink/realpath containment applied **per-repo against each `entry.viewDir`** (never a shared root).
4. Relative hrefs in rendered HTML are **never** rewritten (verified — see §4.3).
5. **`viewDir` is validated, not trusted** (new — §3.6). `resolveRequestPath` only stops escape
   *within* a `viewDir`; it cannot tell whether the `viewDir` itself is legitimate. So every
   entry is rejected on read/upsert unless its `viewDir` `realpath`s to a path ending in
   `.ai/_view` **and** sits under its own declared `repoRoot`. Without this, a poisoned entry
   (`viewDir: "C:\\"`) would be perfectly "contained" — to the whole drive.
6. **The write endpoint is hardened against cross-origin/DNS-rebinding abuse** (new — §4.2).
   "Localhost-only" does not mean "trusted caller only": a visited webpage can `fetch()` a POST
   to `127.0.0.1`, and DNS-rebinding can make the attacker's origin same-origin with the hub.
   Mitigation: reject any request whose `Host` header is not an allowlisted `127.0.0.1`/
   `localhost[:port]`, and gate `POST upsert` behind a token read from `~/.sdlc/hub.pid` (on disk
   to a real local renderer, unreachable to a remote page).

---

## 3. The Registry

**Location.** `~/.sdlc/registry.json` (`os.homedir() + '/.sdlc/registry.json'`) — machine-user
scope, survives cwd changes, spans all repos. Lives in the home dir, never inside a repo, so
it is never committed. Sibling files: `~/.sdlc/hub.pid`, `~/.sdlc/registry.d/` (write shards,
§3.4), `~/.sdlc/registry.prune.log`, and `~/.sdlc/hub-config.json` (the machine-wide hub
settings — §6.1). The home dir is the correct home for all of these precisely because the hub
is a **single machine-wide process**, not a per-repo one.

**Format.** `{ "version": 1, "entries": [ <entry>, … ] }`. An array (not a keyed map) so two
worktrees of the same repo are represented distinctly; ordered by `registeredAt` ascending.
`version` drives a migration function in `readRegistry()`.

### 3.1 Multi-branch / worktree identity (hard requirement)

Resolved with `git` (via `execFileSync`, matching the existing hook pattern):

- `repoRoot` = `git rev-parse --show-toplevel`, then `realpathSync.native` (canonical, native separators).
- `branch` = `git rev-parse --abbrev-ref HEAD` (detached HEAD → worktree basename fallback).
- **Worktree detection** = `git rev-parse --git-dir` differs from `--git-common-dir` → linked
  worktree; `worktreeLabel` = `basename(repoRoot)` of the physical checkout.

Two worktrees of the same base repo → two entries with **distinct ids, distinct `viewDir`,
distinct `branch`**, served at distinct `/r/<id>/` routes. The landing page groups by
`repoRoot` for display. No dedup across branches — same-repo worktrees are fully distinct SDLC
contexts (exactly the stated requirement).

### 3.2 Entry schema

> **Critique must-fix #8 (slugMeta).** The landing-page swimlanes need each slug's
> `current-stage`/`status`, but a plain `slugs: string[]` can't supply them. The entry carries
> a `slugMeta` array populated at upsert time from
> [scanWorkflowIndexes()](lib/workflow-index.mjs) (which already returns exactly this), so the
> landing page renders fully in-memory with no per-request disk reads.

```jsonc
{
  "id": "a3f1c9d20e4b",          // sha256(repoRoot_fwdslash + "\n" + branch).slice(0,12)
  "repoRoot": "C:\\Users\\jayte\\Documents\\dev\\agent-skills",  // realpath, native seps
  "branch": "master",
  "worktreeLabel": null,          // basename of the worktree dir for linked worktrees
  "viewDir": "C:\\Users\\jayte\\Documents\\dev\\agent-skills\\.ai\\_view",
  "lastRenderedAt": "2026-05-29T14:22:00.000Z",
  "slugs": ["hub-mvp", "quality-gates"],
  "slugMeta": [                   // must-fix #8 — from scanWorkflowIndexes at upsert
    { "slug": "hub-mvp",        "currentStage": "implement", "status": "active",   "blocked": false },
    { "slug": "quality-gates",  "currentStage": "review",    "status": "active",   "blocked": false }
  ],
  "configHash": "abc123de",
  "registeredAt": "2026-05-29T10:00:00.000Z",
  "updatedAt": "2026-05-29T14:22:00.000Z"
}
```

### 3.3 id computation

`lib/registry.mjs computeEntryId(repoRoot, branch)`:
1. Normalise `repoRoot` to forward slashes (cross-platform hash stability).
2. `sha256(repoRoot + "\n" + branch).digest('hex').slice(0, 12)` — 48 bits.
3. **Collision check at upsert:** if an existing entry has the same id but different
   `repoRoot`/`branch`, append a 4-char suffix `sha256(repoRoot).slice(0,4)`. (Practical
   paranoia for repo copies sharing the last path segment + branch.)

> **Design note (branch is part of identity).** The id deliberately **includes** branch, so an
> in-place branch switch produces a *new* `/r/<id>/` route. This makes repo+branch the unit of
> identity (satisfies the multi-branch requirement directly) but means bookmarks to a branch's
> URL change when you switch that checkout to another branch. Flagged in §10 Q (id stability)
> as a confirmable tradeoff.

### 3.4 Population & write strategy (convention over flags)

**Trigger.** `upsertRegistryEntry({ projectRoot, pluginRoot })` is called from
[render-sunflower.mjs](scripts/render-sunflower.mjs) `renderMain()` **immediately after the
`.last-render` flush** — verified at
[render-sunflower.mjs:691](scripts/render-sunflower.mjs:691) (`writeFileAtomic(join(viewRoot,
'.last-render'), …)`), which runs in the `args.sharedOutput` branch. The call is wrapped in
`.catch(() => {})` — **a registry write must never affect render success** (best-effort,
idempotent; the next render re-registers). No new user gesture, no flag — pure convention.

> **Critique note (registration runs on incremental *and* bootstrap renders; hub start does
> not).** Both hook-triggered (`--only <slug>/**`) and bootstrap renders pass through the
> `sharedOutput` branch, so both register. But `ensureHubLifecycle` is called only from
> `bootstrapMain()` — so the hub is *started* only on bootstrap runs, not incremental hook
> renders. Documented, not a defect.

> **Critique must-fix #4 (concurrent-write race).** The naive "read → merge → atomic-rename the
> whole `registry.json`" loses entries when two worktrees render at once (both read stale JSON
> before either writes). **Fix — lock-free shards:** when the hub is up, `POST` the single
> entry to it (the hub is the sole merger). When the hub is down, each render writes **only its
> own entry** to `~/.sdlc/registry.d/<id>.json` (atomic rename of a one-entry file — no
> cross-entry contention). The hub merges all shards into `registry.json` at startup and on
> `POST`, then clears applied shards.

> **Shard-dir self-bounding (writer-as-janitor).** If the hub never runs, shards accumulate
> forever (§8 risk). Hard-bound it without a daemon: when a render's lock-free write sees
> `registry.d/` exceed `SHARD_SOFT_CAP` (default 100), that render *also* performs a best-effort
> merge-into-`registry.json`-and-clear (the same merge the hub does) and logs the count to
> `registry.prune.log`. The writer becomes the janitor — no background sweeper, and a
> hub-less developer never silently leaks shards.

> **Critique must-fix #5 (hub port discovery).** `upsertRegistryEntry` must read the hub's
> **bound** port from `~/.sdlc/hub.pid` via `readPidFile()`
> ([pid-file.mjs](lib/pid-file.mjs)) — *not* from config — so it works when the hub runs on a
> non-default port. The PID file (`{pid,host,port,token,configHash,writtenAt}`) is the
> authoritative address **and credential**: `upsertRegistryEntry` reads `token` from it and sends
> it on the POST (invariant #6), so only a process that can read the local PID file may write to
> the registry. `isPidAlive` gates the probe so there's zero HTTP cost when no hub is configured.

### 3.5 Pruning

Lazy — no background sweeper. On hub startup and on `GET /__sdlc/registry/refresh`,
`pruneRegistry()` drops any entry whose `repoRoot`, `viewDir`, or `viewDir/.last-render` no
longer exists; pruned entries are logged to `~/.sdlc/registry.prune.log`. The landing page
shows soon-to-be-pruned/stale entries dimmed with a "last rendered" age rather than hiding
them.

### 3.6 Entry validation (security gate — invariant #5)

`resolveRequestPath` only stops a request from escaping a `viewDir`; it cannot tell whether the
`viewDir` is legitimate. A buggy or hostile entry with `viewDir: "C:\\"` is perfectly contained
— to the entire drive. So `lib/registry.mjs` exports `validateEntry(entry)`, called at **both**
`upsertRegistryEntry` (write) and `readRegistry` (read), which rejects an entry unless:

1. `realpathSync.native(viewDir)` exists and its basename chain ends in `.ai/_view`.
2. `viewDir` is a descendant of `realpath(repoRoot)` (string-prefix check on canonical paths).
3. `repoRoot` resolves inside a real git repo (`.git` dir or file present).

Rejected entries are dropped and logged to `registry.prune.log` with the reason. Validation is
defence-in-depth: it protects against both registry poisoning (Tier-1 security) and merely
stale/moved checkouts. Because it runs on read, a registry hand-edited to point at sensitive
paths is neutralised even if the writer was bypassed.

---

## 4. The Hub Serve Service (`scripts/hub-serve.mjs`)

Single `http.createServer`, default `127.0.0.1:4173`. Lifecycle in `lib/hub-lifecycle.mjs`
(mirrors `serve-lifecycle.mjs`).

### 4.1 Routing

| Path | Handler |
|---|---|
| `GET /` | Aggregate landing page from in-memory registry (2-second micro-cache). |
| `GET /r/<id>` | 301 → `/r/<id>/`. |
| `GET /r/<id>/...` | Strip `/r/<id>` → `resolveRequestPath(entry.viewDir, stripped)` → serve file. |
| `GET /__sdlc/health` | `{ ok, pid, uptimeMs, entries:[{id,repoRoot,branch,lastRenderedAt,slugs}], metrics:{requests,sseClients,perRepoLastServed,rssBytes} }` (§11.9). |
| `GET /__sdlc/events` | One SSE stream for all repos; each event carries `{id, renderedAt}`. |
| `GET /__sdlc/registry` | Full registry dump. |
| `POST /__sdlc/registry/upsert` | Accept one entry — **Host-checked + token-gated** (invariant #6); `validateEntry` (§3.6) then merge in-memory + persist (sole writer). 403 on bad Host/token, 422 on invalid entry. |
| `GET /__sdlc/registry/refresh` | Run `pruneRegistry()`, 200. |

**Global gate (all routes).** Before routing, reject any request whose `Host` header is not an
allowlisted `127.0.0.1`/`localhost[:port]` with `403` (defeats DNS-rebinding — invariant #6).
`__sdlc/*` write/refresh routes additionally require the `hub.pid` token.

### 4.2 Security

Identical posture to the per-repo daemon: default `127.0.0.1`; `0.0.0.0` refused without
the machine-wide `hub-config.json` `tailscale.{enabled,acknowledgedPublic}` (§6.1); same CSP string. **Containment is per
`entry.viewDir`** — a traversal escaping one repo's view cannot reach another's files because
each `/r/<id>/` request runs `resolveRequestPath` rooted at that entry's own `viewDir`.

**Two additions over the per-repo daemon (the hub's threat model is larger because it has a
write endpoint and serves directories it didn't create):**

- **`viewDir` is validated, not trusted** (§3.6, invariant #5). Containment-within-`viewDir` is
  worthless if the `viewDir` is `C:\`. `validateEntry` gates every entry on read and write.
- **DNS-rebinding / cross-origin-POST defence** (invariant #6). The per-repo daemon is read-only,
  so "127.0.0.1-only" suffices. The hub's `POST /__sdlc/registry/upsert` is state-changing: a
  visited webpage can fire a no-cors POST at `127.0.0.1`, and DNS-rebinding can make the
  attacker's origin same-origin with the hub and read responses back. Defence: (a) a **Host-header
  allowlist** on *every* request (a rebound request still carries the attacker's `Host`); (b) a
  **token** persisted in `~/.sdlc/hub.pid` and required on all `__sdlc/*` write/refresh routes —
  readable from disk by a real local renderer, unreachable to a remote page. The token rotates
  whenever the hub (re)starts.

### 4.3 `resolveRequestPath` reuse + the `/sdlc` strip caveat

Extract `resolveRequestPath()` ([render-sunflower-serve.mjs:162](scripts/render-sunflower-serve.mjs:162))
into `lib/resolve-request-path.mjs`; both daemons import it.

> **Critique gap (major — `/sdlc` strip).** That function unconditionally strips a leading
> `/sdlc` prefix ([lines 170-171](scripts/render-sunflower-serve.mjs:170)). Under the hub, a
> repo with a **slug literally named `sdlc`** would have `/r/<id>/sdlc/...` silently rewritten
> to the view root. **Fix:** extract the core **without** the `/sdlc` strip (it existed for a
> path-prefix deployment of the per-repo daemon, not correctness); the per-repo daemon keeps it
> via a thin wrapper. Belt-and-braces: reserve `sdlc` as a slug name in the schema.

**href correctness (verified, no rewriting).** Rendered HTML uses depth-relative asset hrefs
from `relativeAssetBase()` ([render-sunflower.mjs:104](scripts/render-sunflower.mjs:104)). A
page at `/r/<id>/slug/shape/INDEX.html` references `../../_assets/…`, which the browser
resolves to `/r/<id>/_assets/…`, which the hub maps to `viewDir/_assets/…` (assets are copied
into each `.ai/_view/_assets/` by the render pipeline). **No HTML content is rewritten.**

### 4.4 Live reload across repos

> **Critique must-fix #3 (`fs.watch` crash on Windows).** Watching the `.last-render` *file*
> path throws ENOENT on Windows when a registered repo hasn't rendered yet (a valid state).
> **Fix:** watch the `viewDir` **directory** and filter on `filename === '.last-render'` —
> exactly what the per-repo daemon already does
> ([render-sunflower-serve.mjs:79](scripts/render-sunflower-serve.mjs:79)). Safe before the
> file exists.

On change the hub emits SSE `reload` with `{ id, renderedAt }`. The client filters:

- **`assets/livereload.js`** reads its repo id from `document.querySelector('meta[name=sdlc-repo-id]')?.content`
  and reloads only when `data.id` matches (or when there's no meta tag — the per-repo daemon
  path — in which case it reloads unconditionally, backward compatible).
- **Hub injects the meta tag at serve time**, not render time (keeps registration flag-free):
  for `INDEX.html` responses under `/r/<id>/`, read the file with `fs.readFile`, insert
  `<meta name="sdlc-repo-id" content="<id>">` before `</head>`, fix `content-length`, send the
  buffer (size-guarded; non-INDEX files keep the `createReadStream` pipe). Per critique gap on
  streaming strategy.

`MAX_SSE_CLIENTS` becomes a parameter; hub uses 200 (aggregate across repos; client-side
filtering does the per-repo scoping). Per-repo daemon stays at 50.

### 4.5 Lifecycle & per-repo fallback

`lib/hub-lifecycle.mjs#ensureHubLifecycle()`:

> **Critique must-fix #6 + cold-start fix.** The probe is **PID-file-gated**: check
> `~/.sdlc/hub.pid` exists and `isPidAlive(pid)` *before* any HTTP health probe — so cold
> starts pay **zero** latency (no 2.5 s block waiting for a hub that doesn't exist). And it
> must replicate the per-repo stale-PID recovery exactly: if `isPidAlive` is true but the
> health probe fails (incl. Windows `EPERM`-as-alive on a reused PID), `SIGTERM` → remove
> `hub.pid` → respawn. This logic is written into the spec, not left implicit.

Called from `bootstrapMain()` after `ensureServeLifecycle()`, **only** when the **per-repo**
`config.view?.hub?.enabled === true` (the sole per-repo hub field — the repo's opt-in to
participate). Everything about *how* the single hub binds — `host`, `port`, `maxSseClients`,
`maxWatchedRepos`, `tailscale` — is read from the **machine-wide** `~/.sdlc/hub-config.json`
via `readHubConfig()` (§6.1), created with defaults on first start. So the per-repo file says
*whether* to use the hub; the machine file says *how the one hub is configured* — no field
appears in both places, so there are **no precedence rules to reason about**. `stopHub()` reads
the PID file, `SIGTERM`s, removes it. On Windows (no catchable `SIGTERM`), remove the PID file
via `process.on('exit')`.

**Per-repo daemon fate — additive, opt-in.** `ensureServeLifecycle()` gains a non-blocking hub
check: if `~/.sdlc/hub.pid` exists and `isPidAlive`, log the hub URL for this repo and return
`{ action: 'hub-active' }` without spawning a per-repo daemon. Users who still want direct
per-repo access set `view.serve.enabled: true` (the hub check is skipped). Default
`view.hub.enabled: false` → today's behaviour is unchanged.

**Port `4173` is the canonical SDLC URL in both modes (Q4 resolved).** When the hub is off
(the default), the per-repo daemon owns `4173` exactly as today. When the hub is on, the hub
owns `4173` and the same per-repo view is reachable at `4173/r/<id>/`. The only collision is
the rare both-enabled case (`view.hub.enabled` *and* `view.serve.enabled` both true): both
default to `4173` → `EADDRINUSE`. **Resolution:** when `ensureServeLifecycle()` is force-enabled
*and* detects a live hub on the same host:port, it binds the per-repo daemon to `4174` instead
(or to an explicit `view.serve.port`) and logs the chosen URL — so `4173/` always means "the
SDLC view" and `4174` is purely the per-repo fallback. This is *not* a breaking change to any
shipped behaviour: the hub has never shipped and is opt-in; only enabling it changes what
`4173/` serves (now the aggregate landing page, with each repo at `/r/<id>/`).

### 4.6 Remote access (Tailscale)

Extract `maybeConfigureTailscale()` from `serve-lifecycle.mjs` into `lib/tailscale.mjs`; the
hub becomes the **single** Tailscale-exposed entry point (vs N per-repo bindings). Its config
is the machine-wide `hub-config.json` `tailscale` block (serve|funnel, `acknowledgedPublic`
gate) — the *shape* mirrors `view.serve.tailscale` but the *location* is intentionally the home
dir, not any repo. Because the hub fans out **every** registered repo, a public binding exposes
all of them at once; a one-time per-machine `acknowledgedPublic` is the only safe place for that
gate (a per-repo committable flag could expose unrelated private repos — see §6.1).

---

## 5. The Central Landing Page

**Served at `GET /`** from the in-memory registry (2-second cache; no disk reads per request
thanks to `slugMeta`). Renderer: new `renderers/hub-dashboard.mjs` exporting
`renderHubLanding(entries, { pluginVersion })`.

**Content.**
1. **Summary bar** — total repos, total active slugs, hub uptime/version.
2. **Repo swimlane grid** — rows grouped by `repoRoot` (label `basename`), one sub-row per
   branch/worktree, columns = the 10 `STAGES` from [dashboard.mjs](renderers/dashboard.mjs).
   Reuses `swimlanesSvg()` per entry, fed from `entry.slugMeta`.
   > **Critique must-fix #7.** `swimlanesSvg` is currently **module-private** in
   > [dashboard.mjs:104](renderers/dashboard.mjs:104) — add `export` before Phase 4 or the
   > import fails at runtime. It's a pure helper; the hub builds its own page and does **not**
   > depend on the per-repo dashboard *pass* (which is gated behind `args.sharedOutput`,
   > [render-sunflower.mjs:632](scripts/render-sunflower.mjs:632)).
3. **Slug list** — expandable, grouped by repo, each linking to `/r/<id>/<slug>/INDEX.html`.
4. **Stale warnings** — entries with null/old `lastRenderedAt` shown dimmed.
5. **Live reload** — the landing page connects to `/__sdlc/events` and refreshes on *any*
   render (no id filter on the aggregate view).
6. **Enhancements (§11), opt-in/post-MVP** — a cross-repo "needs attention" **inbox** as the
   default tab (§11.3), **open-in-editor** deep links per repo/slug (§11.4), and aggregate status
   in the **tab title/favicon** (§11.5). All ride on data the registry already carries
   (`slugMeta`, `repoRoot`, `lastRenderedAt`); the MVP landing page (items 1–5) ships first.

> **Critique gap (asset route, minor).** The cleanest resolution is for the landing page to use
> **inline CSS** for its minimal styling — this removes the need for a separate hub `/_assets/`
> route and avoids confusion with per-repo `/r/<id>/_assets/` (which already resolves correctly
> to each repo's own copied assets).

---

## 6. Integration Points

### New files

| File | Purpose |
|---|---|
| `lib/resolve-request-path.mjs` | Shared symlink-escape kernel (extracted, **without** the `/sdlc` strip). |
| `lib/registry.mjs` | `upsertRegistryEntry`, `pruneRegistry`, `readRegistry`, `computeEntryId`, `registryPath`, **`validateEntry`** (§3.6 viewDir gate), shard-cap janitor (§3.4); shard write + git identity. |
| `lib/hub-config.mjs` | `readHubConfig`, `hubConfigPath`, `HUB_CONFIG_DEFAULTS`, `version` migration. Reads/creates the machine-wide `~/.sdlc/hub-config.json` (§6.1). Mirrors `lib/config.mjs` but home-dir-scoped. |
| `lib/hub-lifecycle.mjs` | `ensureHubLifecycle`, `hubPidPath`, `stopHub` (mirrors `serve-lifecycle.mjs`, incl. stale-PID recovery). Mints a fresh **token** into `hub.pid` on each (re)start (invariant #6). |
| `lib/tailscale.mjs` | Extracted `maybeConfigureTailscale` (shared by serve + hub). |
| `scripts/hub-serve.mjs` | The hub daemon. Enforces the Host-header allowlist + `__sdlc/*` token gate (invariant #6), `validateEntry` on upsert, and the `/__sdlc/health` metrics counters (§11.9). |
| `renderers/hub-dashboard.mjs` | `renderHubLanding(entries)` for `GET /` — inbox-default + swimlane views, open-in-editor links, aggregate tab-title status (§11.3–11.5). |

### Modified files

| File | Change |
|---|---|
| [scripts/render-sunflower-serve.mjs](scripts/render-sunflower-serve.mjs) | Import `resolveRequestPath` from the new module (thin wrapper re-adds the `/sdlc` strip). |
| [scripts/render-sunflower.mjs](scripts/render-sunflower.mjs) | `renderMain()`: after the `.last-render` flush ([:691](scripts/render-sunflower.mjs:691)) call `upsertRegistryEntry(...).catch(()=>{})`. `bootstrapMain()`: after `ensureServeLifecycle()` call `ensureHubLifecycle()` when `view.hub.enabled`. |
| [lib/serve-lifecycle.mjs](lib/serve-lifecycle.mjs) | Non-blocking hub check → `{action:'hub-active'}` (PID-gated). When force-enabled (`view.serve.enabled:true`) alongside a live hub on the same host:port, bind the per-repo daemon to `4174` (or explicit `view.serve.port`) to avoid `EADDRINUSE`, and log the chosen URL (§4.5). |
| [renderers/dashboard.mjs](renderers/dashboard.mjs) | `export` `swimlanesSvg`. |
| [renderers/_paths.mjs](renderers/_paths.mjs) | `breadcrumbFromView(viewRel, slug, opts)` — add `opts.hubRootHref` (see §10 tension). |
| [renderers/_shell.mjs](renderers/_shell.mjs) | Brand link ([:67](renderers/_shell.mjs:67)) — accept `hubRootHref` so the topnav "sdlc" brand points to the hub root, not the per-repo dashboard. |
| [assets/livereload.js](assets/livereload.js) | repoId filtering via `<meta name=sdlc-repo-id>`; unconditional reload when absent (backward compatible). |
| [lib/config.mjs](lib/config.mjs) + [schemas/sdlc-config.schema.json](schemas/sdlc-config.schema.json) | Add per-repo `view.hub` block carrying **only** `enabled` (`additionalProperties:false` — singleton settings are rejected here and belong in `hub-config.json`). |
| `package.json` | `hub` / `hub:stop` scripts. |

### 6.1 Config additions — Option C (split by scope)

The hub is a **single machine-wide process**, but the plugin's existing config is strictly
per-repo ([config.mjs#configPathFor](lib/config.mjs) → `<repo>/.ai/sdlc-config.json`). Putting
singleton settings (one `port`, one bind `host`, one Tailscale binding) into N per-repo files
makes the config *lie*: only the first repo to bootstrap the hub wins, and the other repos'
values are silently ignored. So config is **split by the scope of each setting** — each value
lives where the thing it governs actually lives:

**Per-repo — `.ai/sdlc-config.json` (committable, shareable, the repo's opt-in):**

```jsonc
// new optional block — the ONLY per-repo hub field
"view": {
  "hub": {
    "enabled": false          // does THIS repo participate? (register + be willing to start/use the hub)
  }
}
```

**Machine-wide — `~/.sdlc/hub-config.json` (per-developer-machine, never committed, the single hub's runtime config):**

```jsonc
{
  "version": 1,               // drives readHubConfig() migration, mirrors registry.json
  "host": "127.0.0.1",
  "port": 4173,               // the canonical SDLC URL; per-repo daemon falls back to 4174 if forced alongside (§4.5)
  "maxSseClients": 200,
  "maxWatchedRepos": 50,      // beyond this, poll at 5s instead of fs.watch
  "tailscale": { "enabled": false, "mode": "serve", "path": "/", "https": true, "acknowledgedPublic": false }
}
```

**Why this split (decision, 2026-05-30):**

| Setting | Lives in | Because |
|---|---|---|
| `enabled` | per-repo | A genuine per-repo decision; committable so a team shares "this project uses the hub". It is the *only* per-repo hub field — `additionalProperties:false` rejects any singleton setting placed here by mistake. |
| `host`, `port` | machine | The one hub binds exactly once — only one value can be live, so only one place should hold it. Default `port` is **`4173`** (Q4 resolved): the canonical SDLC URL in both single-repo and hub modes; the per-repo daemon falls back to `4174` only when forced alongside a live hub (§4.5). |
| `maxSseClients`, `maxWatchedRepos` | machine | One process, one set of resource caps. |
| `tailscale.*` (esp. `acknowledgedPublic`) | machine | **Security-decisive.** A public binding exposes *every* registered repo at once. A committable per-repo `acknowledgedPublic:true` in one throwaway repo could expose unrelated private repos if the hub is bootstrapped from it. The exposure gate must be a one-time, per-machine acknowledgement. |

**No precedence rules.** The two files share **zero** fields, so there is nothing to merge or
override — `readHubConfig()` reads the machine file (creating it with defaults on first hub
start); the per-repo `view.hub.enabled` is consulted only to decide whether `bootstrapMain()`
calls `ensureHubLifecycle()` at all.

**Intent vs. reality stays distinct.** `hub-config.json` expresses *intent* ("bind 4173");
`~/.sdlc/hub.pid` reports *reality* ("actually bound to 4173"). Must-fix #5 is unchanged: a
render's `upsertRegistryEntry` still reads the **bound** port from `hub.pid` (a render never
starts the hub, so it must discover the running address) — but the config it reconciles against
is now single-valued, so config and reality can no longer disagree *across repos*.

**Precedent.** This is the git model: repo-local choices in `.git/config`, machine identity and
global behaviour in `~/.gitconfig`. The boundary tracks *scope*, not convenience — and it is
fully consistent with convention-over-flags ([[sdlc-convention-over-flags]]): scoping config to
the thing it configures is a convention, not a flag.

---

## 7. Phased plan (each phase independently shippable)

- **Phase 0 — Extract shared primitives (zero user-visible change).** `resolveRequestPath` →
  `lib/resolve-request-path.mjs` (drop `/sdlc` strip; wrapper in per-repo daemon);
  `maybeConfigureTailscale` → `lib/tailscale.mjs`. *Verify:* existing suite passes; per-repo
  serve unchanged.
- **Phase 1 — Registry auto-population (no hub yet).** `lib/registry.mjs` incl. `validateEntry`
  (§3.6) and the shard-cap janitor (§3.4); wire `upsertRegistryEntry` after the `.last-render`
  flush; shard write; `serve-lifecycle` hub guard; per-repo schema `view.hub` carrying only
  `enabled` (`additionalProperties:false`, §6.1). *Verify:* render two repos + a worktree → three
  correct entries; **concurrent renders never lose an entry** (shard stress test); a thrown
  registry error never changes render exit code; **a poisoned entry (`viewDir:"C:\\"`) is rejected
  at write**; >`SHARD_SOFT_CAP` shards trigger a writer-side merge-and-clear.
- **Phase 2 — Hub daemon serving per-repo views.** `lib/hub-config.mjs` (read/create the
  machine-wide `~/.sdlc/hub-config.json` with defaults, §6.1); `scripts/hub-serve.mjs` (`/r/<id>/*`
  with per-`viewDir` containment, `validateEntry` on read, hub health, **Host-header allowlist +
  token-gated `POST upsert`** — invariant #6); `lib/hub-lifecycle.mjs` with stale-PID recovery,
  reading host/port/limits from `readHubConfig()` and minting the `hub.pid` token. *Verify:*
  `/r/<id>/` and deep pages render with working assets; traversal/cross-repo escape → 403; **a
  POST with a wrong/absent token → 403; a request with a non-localhost `Host` header → 403; a
  poisoned entry on read is dropped (§3.6)**; no per-repo daemon spawned (`hub-active`); first
  start writes `hub-config.json` defaults; Windows parity.
- **Phase 3 — Live reload.** Directory-watch + filter; SSE `{id,renderedAt}`; meta-tag
  injection for `INDEX.html`; `livereload.js` filtering. *Verify:* render in repo A reloads only
  repo-A tabs; per-repo daemon reload still unconditional.
- **Phase 4 — Landing page.** `export swimlanesSvg`; `renderers/hub-dashboard.mjs`; `GET /` with
  cache; inline-CSS styling. *Verify:* counts correct; swimlanes render; links resolve into
  `/r/<id>/...`; refresh within 2 s.
- **Phase 5 — Breadcrumb / brand hub-root.** `breadcrumbFromView` + `renderShell` brand accept
  `hubRootHref`; **resolve the convention-over-flags tension** (§10) before implementing.
  *Verify:* deep-page "sdlc" breadcrumb + brand link go to `/`; per-repo daemon path unchanged.
- **Phase 6 — Tailscale + hardening.** Single hub Tailscale binding gated on the **machine-wide**
  `hub-config.json` `tailscale.{enabled,acknowledgedPublic}` (§6.1); Windows `process.on('exit')`
  PID cleanup; per-request read timeout; `maxSseClients`. *Verify:* `tailscale serve` maps the
  hub only when machine-level `acknowledgedPublic:true`; a per-repo config can **never** trigger
  public exposure; simulated crash → PID cleaned on next start; load test to the cap.

---

## 8. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Registry poisoning → arbitrary file read** (a hostile/buggy `viewDir`) | Med (if unguarded) | `validateEntry` (§3.6) on read **and** write: `viewDir` must `realpath` under its `repoRoot` and end in `.ai/_view`. Invariant #5. |
| **Cross-origin POST / DNS-rebinding hits the write endpoint** | Med (if unguarded) | Host-header allowlist on every request + `hub.pid` token on `__sdlc/*` writes (§4.2). Invariant #6. |
| Shard dir grows if hub never runs | Medium | Hub merges + clears shards at startup/POST; **writer-as-janitor merges + clears past `SHARD_SOFT_CAP`** (§3.4); `sdlc hub list` merges-on-read. |
| id hash collision | Very low (48-bit + check) | Upsert-time collision check appends a path-hash suffix. |
| Stale `viewDir` on an unmounted drive flaps | Low | Prune only on startup/refresh; dim, don't delete, in the UI. |
| Hub down between crash and next render | Low | Per-repo daemons still reachable; **next bootstrap of any hub-enabled repo lazily resurrects a stale hub** (§11.7), and the next render restarts it. |
| Windows `fs` mtime coarseness misses a reload | Low | Directory-watch + `>=` epsilon; same coarseness already tolerated by `classifyRenderState`. |
| Meta-tag injection buffers large HTML | Low | Size guard (skip > 1 MB); only `INDEX.html` is rewritten, the rest streams. |
| Token leaks via `hub.pid` readable by other local users | Low | Same exposure as any localhost dev daemon; `hub.pid` is `0600` where the OS supports it; token rotates per (re)start. |

---

## 9. Adversarial critique — must-fixes & full gap list

The critique judged the design **architecturally sound, no gap unfixable without architectural
change**, but flagged that three issues (livereload repoId, breadcrumb scope, watcher-on-missing-file)
would silently fail in the first demo if unaddressed, and that `--hub-root-href`/`--hub-entry-id`
**violate the convention-over-flags philosophy** (see §10).

A follow-up **security pass (2026-05-30)** — looking specifically at the hub's *new* attack
surface vs. the read-only per-repo daemon — added **two further must-fixes** (#15, #16 below).
These were not in the original 14; they are listed separately to keep the critique's record honest.

### Must-fix before build

| # | Fix |
|---|---|
| 3 | **`fs.watch` Windows crash** — watch the `viewDir` directory and filter on filename, never the `.last-render` path. (§4.4) |
| 4 | **Concurrent fallback write race** — per-entry shards `~/.sdlc/registry.d/<id>.json`, hub merges; not whole-file atomic-rename. (§3.4) |
| 5 | **Hub port discovery** — `upsertRegistryEntry` reads the bound port from `~/.sdlc/hub.pid` via `readPidFile`, not config. (§3.4) |
| 7 | **`swimlanesSvg` not exported** — add `export` in `dashboard.mjs` before Phase 4. (§5) |
| 8 | **`slugs[]` lacks frontmatter** — add `slugMeta[]` from `scanWorkflowIndexes` at upsert. (§3.2) |
| 6 | **`hub-lifecycle` stale-PID recovery** — write the EPERM-alive + failed-probe → kill/remove/respawn path explicitly. (§4.5) |
| 15 | **`viewDir` validated, not trusted** — `validateEntry` on read + write; a poisoned `viewDir` (e.g. `C:\`) is "contained" to the whole drive otherwise. (§3.6, invariant #5) |
| 16 | **Write endpoint hardened vs. DNS-rebinding/cross-origin POST** — Host-header allowlist on every request + `hub.pid` token on `__sdlc/*` writes. (§4.2, invariant #6) |

### Full gap list (14 from the critique + 2 from the security pass)

| Severity | Area | Resolution in this doc |
|---|---|---|
| blocker | `fs.watch` on missing `.last-render` crashes on Windows | §4.4 directory-watch |
| blocker | Concurrent first-registration loses entries | §3.4 shards |
| major | `/sdlc` prefix strip collides with a slug named `sdlc` | §4.3 extract without strip + reserve name |
| major | livereload repoId injection / streaming strategy unspecified | §4.4 `fs.readFile` + meta insert, size-guarded |
| major | Hub port not knowable from config alone | §3.4 read from `hub.pid` |
| major | `breadcrumbFromView` is 2-arg today; design proposed 3 conflicting fixes | §6 single `opts.hubRootHref` approach; §10 tension |
| major | `swimlanesSvg` not exported | §5 export |
| major | Registry `slugs[]` can't feed swimlanes | §3.2 `slugMeta` |
| major | `isPidAlive` returns true on Windows `EPERM` (reused PID) | §4.5 replicate stale-PID recovery |
| major | `_shell.mjs` brand link points to per-repo dashboard under the hub | §6 `hubRootHref` on brand |
| minor | Hub `/_assets/` vs per-repo `/r/<id>/_assets/` confusion | §5 inline CSS for landing page |
| minor | Registration hook asymmetry (registers on incremental; hub starts only on bootstrap) | §3.4 documented |
| minor | `view.hub` schema must set `additionalProperties:false` | §6.1 — per-repo `view.hub` allows **only** `enabled`; singleton settings live in machine-wide `hub-config.json` |
| minor | `MAX_SSE_CLIENTS` is an aggregate cap | §4.4 documented; optional per-repo sub-cap |
| **security** | **`viewDir` not validated → registry poisoning serves arbitrary files** | **§3.6 `validateEntry` (invariant #5)** |
| **security** | **Write endpoint reachable by cross-origin POST / DNS-rebinding** | **§4.2 Host allowlist + `hub.pid` token (invariant #6)** |
| minor | Shard dir leaks if hub never runs | §3.4 writer-as-janitor merge past `SHARD_SOFT_CAP` |

---

## 10. Open questions (confirm before/at build)

1. **Convention-over-flags tension (important).** The breadcrumb/brand fix as designed adds
   real CLI flags (`--hub-root-href`, `--hub-entry-id`) to `render-sunflower.mjs` — the critique
   called this out as against your established philosophy ([[sdlc-convention-over-flags]]). The
   flag-free alternative: drive hub-awareness entirely at **serve time** from the registry entry
   (the hub already injects the repoId meta tag this way; it could likewise rewrite the
   breadcrumb/brand hrefs in `INDEX.html` responses, or the landing page could simply accept
   that deep-page "sdlc" links go to the per-repo dashboard). **Recommend: serve-time injection,
   no render flags.** Confirm.
2. **`id` includes branch** → in-place branch switch changes the `/r/<id>/` URL. Keep, or key on
   `repoRoot`+worktree only (URLs survive switches, but a single checkout shows only its current
   branch)?
3. **Hub default `enabled`** — keep `false` (opt-in) through Phase 4, revisit later?
4. **Hub port — RESOLVED (2026-05-30).** Config location: single machine-wide value in
   `hub-config.json` (Option C, §6.1). Default number: the **hub is primary on `4173`** — the
   canonical SDLC URL in both single-repo and hub modes — and the per-repo daemon falls back to
   `4174` only when forced to run alongside a live hub (§4.5). Not a breaking change to shipped
   behaviour (the hub has never shipped and is opt-in).
5. **repoId injection** — serve-time meta tag (minimal, rewrites response bytes) vs render-time
   embed (cleaner HTML, needs re-render on id change)? (Ties into Q1.)
6. **Registry migration** — is `version:1` + a `readRegistry()` migration function enough?
7. **Repo move/rename** — accept that the old `/r/<old-id>/` 404s and a new entry is created
   (current proposal), or fingerprint-match to migrate the entry?
8. **Hub restart on crash — RESOLVED (2026-05-30): lazy supervision, no monitor.** A background
   monitor process contradicts the "one daemon, no sprawl" ethos. Instead, the per-repo daemon's
   existing `ensureServeLifecycle` hub-check doubles as a **lazy resurrector**: when
   `view.hub.enabled` and the `hub.pid` is stale, it restarts the hub on the spot. Every bootstrap
   becomes a healing opportunity at zero extra cost (the check already runs). Detailed in §11.7.

---

## 11. Enhancements (added 2026-05-30)

### 11.1 Scope & sequencing

These extend the design beyond the 6-phase MVP. **The two security items (§3.6 / §4.2,
invariants #5–#6) are *not* here — they are in the core build** because shipping a write endpoint
that serves arbitrary directories would be a regression vs. today's read-only per-repo daemon.
Everything in §11 is genuinely optional and lands **after Phase 6**, except §11.7 (lazy
supervision) and the shard-cap janitor (§3.4), which are small enough that they were folded into
the core sections they harden. None of these change the registry's wire format incompatibly:
§11.6 adds optional fields under `version:1` migration; the rest is view-layer or ops.

> **Why these are worth it:** aggregation alone (N dashboards in one page) barely justifies a
> daemon — *correlation* does. §11.3–11.6 are what turn the hub from a viewer into a cross-repo
> cockpit, and they mostly surface data the registry **already carries** (`slugMeta`, `repoRoot`,
> `lastRenderedAt`), so the cost is in the renderer, not the data model.

### 11.2 Summary

| # | Enhancement | Tier | Rides on | Hooks into |
|---|---|---|---|---|
| 11.3 | Cross-repo "needs attention" inbox | feature | `slugMeta.{status,blocked,currentStage}` | `renderers/hub-dashboard.mjs`, `GET /` |
| 11.4 | Open-in-editor deep links | feature | `repoRoot` | `renderers/hub-dashboard.mjs` |
| 11.5 | Aggregate tab-title / favicon status | feature | live SSE + `slugMeta` | landing page client JS |
| 11.6 | Richer git state per entry | feature | extra `git` calls at **render** time | `lib/registry.mjs` entry schema |
| 11.7 | Lazy hub supervision (crash recovery) | ops | existing `ensureServeLifecycle` check | `lib/serve-lifecycle.mjs` (**folded into core**) |
| 11.8 | `sdlc hub` CLI surface | ops/DX | `hub.pid`, `readHubConfig` | `package.json`, a small CLI entry |
| 11.9 | Health metrics + wide-event logging | ops | per-request counters | `scripts/hub-serve.mjs`, `/__sdlc/health` |

### 11.3 Cross-repo "needs attention" inbox

A single filtered work-queue across **all** repos — *everything `blocked`, everything in
`review`, everything not advanced in N days* — rather than N stacked per-repo dashboards. Make it
the landing page's **default tab**, with the swimlane grid (§5, content item 2) as the secondary view. Pure
view-layer: `slugMeta.{status,blocked,currentStage}` and `lastRenderedAt` already carry
everything. This is the "what needs me today, anywhere" pane that is the whole point of a hub.

### 11.4 Open-in-editor deep links

Each slug already links to `/r/<id>/<slug>/INDEX.html`. Add a second affordance per repo/slug:
a `vscode://file/<repoRoot>` link (and a JetBrains `jetbrains://` variant, scheme configurable in
`hub-config.json`). In a multi-repo workflow the highest-frequency action is "see it's blocked →
jump into that repo in my IDE"; the hub is the only place that knows every `repoRoot`. Render as a
plain link — no new daemon capability, the OS handles the scheme.

### 11.5 Aggregate tab-title / favicon status

`document.title = "(3 blocked) SDLC Hub"` and a colour-coded favicon dot, updated from the live
`/__sdlc/events` stream. With many repos open the value of a hub is *peripheral awareness* — you
should know something went red without looking at the page. Trivial client-side addition on the
SSE channel the plan already builds (§4.4).

### 11.6 Richer git state per entry (opt-in)

The registry already shells to `git` for branch/worktree identity (§3.1). For a few extra **cheap
render-time calls** (never at serve time), capture `dirty` (porcelain non-empty), `ahead`/`behind`
vs. upstream, and short HEAD sha — stored as optional entry fields under the existing `version:1`
migration. The landing page can then show "repo-A · feature-x · 3 behind · dirty". Opt-in via
`hub-config.json` (`captureGitState: false` default) to honour the zero-cost-when-off principle.

### 11.7 Lazy hub supervision (folded into core — resolves Q8)

No background monitor (that would reintroduce process sprawl). The per-repo daemon's existing
`ensureServeLifecycle` hub-check (§4.5) becomes the resurrector: when `view.hub.enabled` and the
`hub.pid` is stale/unhealthy, it runs the same stale-PID recovery (`SIGTERM` → remove → respawn,
must-fix #6) it already does for per-repo daemons, then continues. Every bootstrap of any
hub-enabled repo heals a dead hub at zero added cost. Tradeoff: a crashed hub stays down until the
*next* render in *some* hub-enabled repo — acceptable, since the per-repo views remain reachable
and rendering is the natural trigger.

### 11.8 `sdlc hub` CLI surface

The plan adds `hub`/`hub:stop` scripts; round it out to `start | stop | restart | status | list |
open`. `status` prints the bound address from `hub.pid` + entry count + uptime; `list`
merges-on-read and prints the registry (also the hub-less shard-flush path, §3.4); `open` launches
the browser at the bound URL. This is the "I don't want to remember the port" entry point and the
home for `sdlc hub list` (already referenced in §8).

### 11.9 Health metrics + wide-event logging

The hub is long-lived, so `/__sdlc/health` carries counters: `requests`, active `sseClients`,
`perRepoLastServed`, `rssBytes`, `uptimeMs` (§4.1). Better still, since the plugin already ships
the [wide-event-observability](skills/wide-event-observability) skill, emit **one canonical log
line per render-reload and per upsert** (repo id, route, bytes, duration, outcome). That canonical
line is the only way you'll later debug "why did repo-B stop reloading" after the fact — exactly
the failure mode an aggregating daemon is prone to.
