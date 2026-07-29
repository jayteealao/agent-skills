# Render Dispatch Plan — Hooks Enqueue, the Hub Renders

## Status

**IMPLEMENTED — v9.73.0.** All five phases landed. Prerequisite refactor that
lands **before** the native Codex interop work
(`plugins/sdlc-workflow-codex/docs/internal/NATIVE-INTEROP-REWRITE-PLAN.md` →
*Rendering Is Owned by the Hub*). Implemented in the Claude plugin
(`plugins/sdlc-workflow`); defines a **host-neutral** dispatch protocol the future
Codex hooks adopt unchanged.

- Shipped at Claude plugin `9.73.0` (started from baseline `9.72.0`).
- Touched: `lib/render-queue.mjs` (new), `lib/heal-render.mjs`, `hooks/render-on-artifact-write.mjs`,
  `hooks/session-start-orient.mjs`, `scripts/hub-serve.mjs`, `scripts/render-sunflower-serve.mjs`,
  `scripts/hub-ensure.mjs` (new), `lib/config.mjs`, `schemas/sdlc-config.schema.json`, tests, dist.
- Does **not** depend on the native-interop runtime store, runtime manifest, or
  cross-host lock. It composes with them later through one explicit seam
  (`resolveRenderEntrypoint()` in `lib/heal-render.mjs`).

### Implementation notes (where the plan met the code)

- **Registration reuses `upsertRegistryEntry()`** (Open Question 1 resolved): hub
  up → token POST to live `entries`; hub down → `registry.d/` shard folded in at
  the hub's startup `reload()`. The detached `scripts/hub-ensure.mjs` helper runs
  ensure-hub + register + status OFF the hook's critical path (the hook just
  enqueues, ~ms), gated by `ensureHubOnWrite` + a `SDLC_DISABLE_ENSURE_HUB=1`
  kill switch, debounced ~3s to bound bursts.
- **The drain reuses the heal controller** rather than a sibling engine: `submit()`
  / `isBusy()` share its per-repo `inFlight` so a queue render and a heal can't
  clobber one view. Coalescing collapses to ONE render per repo per tick (single
  bucket → `--only`, else `--bootstrap`), matching the renderer's existing CLI.
- **`.processing/` orphan-reclaim TTL** (Open Question 2) = 120 s
  (`RENDER_QUEUE_DEFAULTS.orphanTtlMs`).

## Problem

Today every managed-artifact write spawns its own renderer:

- `hooks/render-on-artifact-write.mjs` writes a `.render-pending` debounce file,
  waits 2s in a detached child, then spawns `render-sunflower --only <bucket>/**`.
- `hooks/session-start-orient.mjs` spawns a detached `render-sunflower
  --bootstrap`.

This works, but:

1. **N short-lived renderers.** Across repos and bursts of writes, each hook
   spawns a fresh `node render-sunflower` that re-resolves the project root,
   re-reads config, and cold-starts — instead of reusing the long-running hub
   that is *already a bounded render engine* (`lib/heal-render.mjs`:
   concurrency cap, per-repo cooldown, attempt ceiling, `fs.watch` live-reload).
2. **Two renderer identities.** A hook renders from *its* plugin-cache payload.
   Under two host plugins (native interop) that means Claude and Codex stamp
   different versions into `.last-render` and the `9.63.0` healer thrashes. The
   only durable fix is *one* renderer — the hub.
3. **No durability when the hub is down.** A write that happens while no daemon
   is running renders inline (fine today) but there is no record the hub can use
   to catch up; the inline path is exactly what we want to remove.

The hub already runs a level-triggered reconcile tick that calls
`healController.consider(entry)` per repo. We extend that same tick to also drain
a durable per-repo **render queue** that the hooks write to.

## Goals

- Hooks **report** changes to a durable queue; they do not render.
- The hub **drains** the queue and renders through its existing bounded engine.
- If no hub is running when a hook fires, the hook:
  1. still records the change to the durable queue,
  2. attempts a best-effort detached hub start,
  3. reports failure visibly (never silently),
  and the queued change is rendered when the hub comes up (**catch-up on
  start**).
- Preserve the heal-render **security crux**: rendering is triggered only by the
  hub's own timer reading local files — **never** by a network request.
- The queue protocol is host-neutral so Codex hooks reuse it verbatim.
- Renderer resolution is a single seam so native interop can later point it at
  the active machine runtime without touching the queue protocol.

## Non-Goals

- The machine-wide runtime store, runtime manifest/`buildId`, and cross-host
  startup lock — those stay in the native-interop plan.
- Changing what gets rendered, the renderers, fragments, or off-pipeline
  semantics. This moves *where rendering is invoked from*, not its output.
- An HTTP render endpoint. Render-on-request stays rejected.

## Design

### The render queue (the durable "list")

A per-repo, filesystem-local, maildir-style queue under the view root:

```text
<repo>/.ai/_view/.render-queue/
  <epoch-ms>-<rand>.json     # one request per managed write (atomic temp+rename)
  .processing/               # claimed-by-the-hub items during a drain
  .failed/                   # items past the attempt ceiling (surfaced in health)
  .status.json               # { pendingCount, lastError, hubLastSeenAt }
```

It lives inside `.ai/_view/`, which is already git-ignored and already skipped by
the write hooks (`shouldSkipForPath` treats anything under the view root as
non-triggering), so queue writes never re-enter the hooks.

Each request file:

```json
{
  "v": 1,
  "repoRoot": "/abs/path/to/repo",
  "viewDir": "/abs/path/to/repo/.ai/_view",
  "kind": "incremental",
  "bucket": "account-export",
  "paths": [".ai/workflows/account-export/04-plan.md"],
  "enqueuedAt": "2026-06-13T18:40:00Z",
  "enqueuedBy": { "host": "claude", "pid": 1234 }
}
```

- `kind`: `incremental` (a known slug/`project`/`docs` bucket), `bootstrap`
  (whole-repo freshness pass — supersedes incrementals for that repo), or
  `offpipeline` (`simplify`/`profiles`/`dep-updates`/`ideation`).
- `bucket`: the slug, or `project` / `docs`, or `__bootstrap__`.
- `enqueuedBy.host` is `claude` today, `codex` later — the only host-specific
  field, and it is provenance only.

Written atomically: temp file in the same dir + `rename` into place. The queue is
**at-least-once**; rendering is idempotent (the render version-gate + additive
dirty-check make a redundant render a near no-op), so duplicate delivery is safe.

### Coalescing keeps the queue bounded

A repo has a finite bucket set (its slugs + `project` + `docs` + off-pipeline
buckets), so the queue is bounded by *buckets touched*, not *writes made*: the
hub coalesces all pending requests for a repo by `(kind, bucket)` before
rendering, and a single `bootstrap` request supersedes that repo's incrementals.
A hard cap (config) with oldest-eviction + a logged warning is a backstop only.

### Hook responsibilities

Both write hooks become thin and fast. New shared helper `lib/render-queue.mjs`
exposes `enqueue(item)` / `readPending(viewDir)` / `ack(viewDir, files)` /
`fail(...)` / `writeStatus(...)`.

`hooks/render-on-artifact-write.mjs` (and its `post-write-render.mjs` wrapper):

1. Resolve project root + view root (unchanged climbing logic).
2. Honor existing suppression (`CLAUDE_PLUGIN_INSTALL`, `.render-suppress`,
   view-internal paths).
3. Detect the bucket(s) from the touched paths (existing `detectRenderBucket`,
   extended to also classify off-pipeline buckets instead of dropping them).
4. `enqueue()` one request per affected bucket (atomic write).
5. **Ensure the hub, best-effort and non-blocking:** probe `/__sdlc/health` with
   a short timeout; if unreachable, attempt a detached start via the existing
   `lib/hub-lifecycle.mjs` ensure path. Do **not** wait for readiness — the queue
   guarantees the render once the hub is up.
6. On ensure failure, `fail()` (append to the existing
   `.ai/_view/.render-errors.log` + update `.status.json`). The request stays in
   the queue.
7. Best-effort register the repo so the hub will iterate it (see *Registration*).
8. Always `exit 0`. The 2s detached debounce stage is **removed** — the hub's
   tick + coalescing provide batching.

`hooks/session-start-orient.mjs`:

- Keep the fast orientation `systemMessage`.
- Replace the detached `render-sunflower --bootstrap` spawn with a
  `enqueue({ kind: 'bootstrap' })` + the same best-effort ensure-hub.
- Additionally surface a one-line advisory in orientation when `.status.json`
  shows pending work and a stale `hubLastSeenAt` ("N view renders pending; hub
  unreachable — start the hub or run `render-sunflower` manually").

There is **no inline-render fallback**. The deliberate trade (per the request) is
that when the hub cannot be started, views lag until it comes up — the queue +
restart attempt + visible failure are the resilience, not an inline render. (A
config escape hatch restores the old inline behavior during rollout; see
*Config*.)

### Registration (so the hub iterates the repo)

The hub renders the repos it knows from the registry (`lib/registry.mjs`,
`~/.sdlc/registry.json` + `registry.d/`). `enqueue()` performs a best-effort
registry upsert for the repo:

- hub up → authenticated upsert via the PID token (existing path).
- hub down → drop `~/.sdlc/registry.d/<id>.json`; the hub ingests drop files on
  startup, so a brand-new repo's first write while the hub is down is still
  picked up at catch-up.

As a belt-and-braces backstop, the startup catch-up also ingests any `repoRoot`
referenced by a queue record it can reach, so a missed registration never
strands a queued render. *(Confirm the exact upsert/drop API against
`lib/registry.mjs` during implementation.)*

### Hub responsibilities

Reuse the bounded engine. `lib/heal-render.mjs`'s controller already has the
queue, concurrency cap, cooldown, attempt ceiling, `failed` surfacing, and
`emitReload`. Generalize it (or add a sibling that shares the same machinery) so
it accepts two request sources through one enqueue path:

- **drift-driven** (today): `.last-render` version ≠ running renderer → clean
  re-render.
- **queue-driven** (new): pending requests in `.ai/_view/.render-queue/`.

Per reconcile tick, for each repo entry `{ id, viewDir, repoRoot }` (the same
entries `consider()` already receives):

1. `readPending(viewDir)` → snapshot of request files.
2. Coalesce by `(kind, bucket)`; a `bootstrap` request collapses that repo to one
   whole-repo pass.
3. **Claim**: move the covered files into `.processing/` (rename) so an
   overlapping restart can't double-render them.
4. Enqueue the coalesced renders into the bounded engine:
   - `incremental` → `render-sunflower --only <bucket>/**`
   - `offpipeline` → the off-pipeline render path (`--dep-updates` / `--ideation`
     forwarding, as `9.68.0` bootstrap does)
   - `bootstrap` → `render-sunflower --bootstrap`
5. On success → `ack()` (delete the claimed files), `emitReload(id)`.
6. On failure → return to the queue with an incremented attempt; past the ceiling
   → move to `.failed/` and surface in `/__sdlc/health`.

**Catch-up on start (the "fetch the list once it starts" requirement):** on
daemon startup, run one immediate drain across all registered repos before
settling into the timer cadence, so everything queued while the hub was down
renders right away.

Both daemons get this: the multi-repo hub (`scripts/hub-serve.mjs`) and the
standalone per-repo daemon (`scripts/render-sunflower-serve.mjs` /
`lib/serve-lifecycle.mjs`) — exactly as both already share `heal-render`.

### Renderer resolution seam

In this plan the hub renders with the **running daemon's own renderer** (today's
behavior). The resolution is isolated to one function
(`resolveRenderEntrypoint()`), so the native-interop work later swaps it to
"resolve from the active machine runtime (`hub.pid.runtimeRoot` →
`active-runtime.json`)" without touching the queue protocol, the hooks, or the
drain loop. That swap is the *only* change native interop needs to make rendering
fully host-neutral.

### Health + observability

Extend `/__sdlc/health` with:

```json
{
  "renderQueue": {
    "pending": { "<repoId>": 3 },
    "inFlight": ["<repoId>"],
    "failed": [{ "repoId": "...", "bucket": "...", "attempts": 3 }],
    "lastDrainAt": "..."
  }
}
```

Hook-side `.status.json` gives the agent/tray visibility even when the hub is
down.

## Component Changes

| File | Change |
|---|---|
| `lib/render-queue.mjs` *(new)* | enqueue / readPending / claim / ack / fail / writeStatus / coalesce; host-neutral; atomic temp+rename; Windows-safe replace |
| `lib/heal-render.mjs` | generalize the controller to accept queue-driven requests through the same bounded engine (or expose its `enqueue` for a sibling drainer) |
| `hooks/render-on-artifact-write.mjs` | enqueue instead of spawn; best-effort ensure-hub; report failure; drop the 2s debounce child; extend bucket detection to off-pipeline |
| `hooks/post-write-render.mjs` | unchanged thin wrapper |
| `hooks/session-start-orient.mjs` | enqueue `bootstrap` instead of spawning it; surface pending/hub-down advisory |
| `scripts/hub-serve.mjs` | add per-tick queue drain + startup catch-up; health fields |
| `scripts/render-sunflower-serve.mjs` / `lib/serve-lifecycle.mjs` | same drain + catch-up for the standalone daemon |
| `lib/hub-lifecycle.mjs` | expose a bounded, non-blocking "ensure (best-effort, detached)" entry the hooks can call and that reports start failure |
| `lib/registry.mjs` | confirm/extend best-effort upsert + `registry.d/` drop ingestion at startup |
| `lib/config.mjs` / `lib/hub-config.mjs` | `view.renderDispatch` (`hub` \| `inline`), queue cap, ensure-hub-on-write toggle |
| `tests/…` | see *Test Strategy* |

## Config + kill switch

```jsonc
// project config (lib/config.mjs)
{
  "view": {
    "renderDispatch": "hub",      // "hub" (new) | "inline" (legacy spawn) — default flips to "hub" at the end of rollout
    "ensureHubOnWrite": true,     // hooks attempt a detached hub start when it's down
    "renderQueue": { "maxPending": 500 }
  }
}
```

- `renderDispatch: "inline"` restores the exact current spawn behavior — the
  rollback switch and the A/B seam during rollout.
- Existing `.render-suppress`, `hooks.renderOnWrite`, `view.bootstrap.enabled`
  continue to suppress.

## Security

- No network render trigger: the hub renders only from its own timer reading
  local queue files (identical posture to `heal-render`).
- The queue is local to each repo's `.ai/_view/` (git-ignored, not served).
- Registry drop files and the PID token follow the existing trust model; the
  ensure-hub start uses the existing detached, `windowsHide` launch path.

## Edge Cases

- **Windows atomic write/replace:** queue files use temp+`rename` into an empty
  name (never over an existing file); claim uses `rename` into `.processing/`.
  No POSIX atomic-replace-over-existing assumption.
- **Unbounded growth:** bounded by coalescing (buckets, not writes) + `maxPending`
  hard cap with oldest-eviction + a logged warning.
- **Double drain across a restart overlap:** the claim step (`.processing/`)
  prevents two drains from rendering the same files; orphaned `.processing/`
  files older than a TTL are reclaimed on catch-up.
- **Partial multi-file rich artifacts** (`.md` landed, sibling `.yaml` not yet):
  the renderer already degrades gracefully; coalescing + the next tick re-render
  once the sibling lands. (The *validation* of that pairing stays in the verify
  hook, unchanged.)
- **Repo never had a view dir:** `enqueue()` `mkdir -p`s the queue dir, same as
  the current hook `mkdir`s the view root.
- **Hub up but unhealthy/wrong:** ensure-hub reuses existing recovery; the queue
  persists across the recovery.

## Test Strategy

1. Write while hub down → request file persists; no inline render occurs.
2. Hub start → catch-up drain renders all queued buckets, then deletes them.
3. Coalescing: many writes to one bucket → one render; a bootstrap request
   supersedes incrementals for that repo.
4. Ack/delete on success; attempt increment on failure; ceiling → `.failed/` +
   health surfaces it.
5. Ensure-hub-on-write: down → bounded detached start attempt; start failure →
   `.render-errors.log` + `.status.json` updated, request retained.
6. Idempotent re-render: redelivered request is a near no-op (version-gate).
7. Security: a queue file never triggers a render except via the hub tick; no
   HTTP path renders.
8. Both daemons (multi-repo hub + standalone) drain identically.
9. `renderDispatch: "inline"` reproduces the legacy spawn behavior exactly
   (rollback proof).
10. Windows: temp+rename queue writes and `.processing/` claims; paths with
    spaces.
11. Registry: drop-file registration while hub down → catch-up ingests + renders.
12. Off-pipeline buckets (`simplify`/`profiles`/`dep-updates`/`ideation`) enqueue
    and render through the off-pipeline path.
13. Existing renderer snapshots, fragment determinism, heal-render, and
    off-pipeline bootstrap gates stay green.

## Phased Delivery

### Phase 0 — Baseline
`npm run build && npm run verify && npm test && npm run test:e2e && node
scripts/verify-fragment.mjs`. Record current render behavior.

### Phase 1 — Queue lib + hub drain (behind the flag)
Add `lib/render-queue.mjs`; generalize `heal-render` to accept queue requests;
add drain + catch-up to both daemons; health fields. Default
`renderDispatch: "inline"` — no hook behavior change yet. Tests 1–4, 8, 13.

### Phase 2 — Incremental writes enqueue
Flip `render-on-artifact-write.mjs` to enqueue under `renderDispatch: "hub"`;
add best-effort ensure-hub + failure reporting; remove the debounce child; extend
off-pipeline detection. Tests 5–7, 9–12.

### Phase 3 — Bootstrap enqueues
Convert `session-start-orient.mjs` bootstrap spawn to an enqueue + pending/hub-down
advisory.

### Phase 4 — Default to hub
Flip the default to `renderDispatch: "hub"`, keep `inline` as the documented
escape hatch. Full suite + manual soak on a multi-workflow repo. Bump the plugin
version (shared-runtime change → see [[plugin-version-bump-locations]] + dist
rebuild) and update docs.

## Rollback

- `view.renderDispatch: "inline"` restores the current per-write spawn instantly,
  with no on-disk migration.
- Queue files are inert when ignored; no destructive change to `.ai` or
  `.ai/_view` content.

## Handoff to Native Interop

After this lands, the native-interop plan's *Rendering Is Owned by the Hub* is
already satisfied for Claude. Native interop then only:

1. points `resolveRenderEntrypoint()` at the active machine runtime
   (`hub.pid.runtimeRoot` → `active-runtime.json`) instead of the daemon's
   bundled renderer, and
2. has the Codex `post-tool-use.mjs` and `session-start.mjs` call the **same**
   `lib/render-queue.mjs` `enqueue()` — no new render path.

Everything else (queue protocol, drain loop, catch-up, ensure-hub, health) is
reused unchanged.

## Open Questions

1. Exact registry upsert / `registry.d/` drop API in `lib/registry.mjs`.
2. `.processing/` orphan-reclaim TTL value.
3. Whether to keep a *minimal* inline fallback for the standalone (no-hub-ever)
   single-repo user, or require the daemon in all cases. (Current plan: no inline
   fallback; the standalone daemon is the renderer.)
4. Whether the SessionStart advisory should also offer to start the hub
   synchronously when pending work is detected.
