# Hooks → Node + Bootstrap Render + Renderer-Hosted Serve — Implementation Plan

## Summary

Three coupled changes, designed to be shipped as one bundled migration because
they share infrastructure:

1. **Migrate every SDLC plugin hook from bash to Node.** Eliminates the
   runtime dependency on Git Bash / `yq` / `jq` / Python and consolidates
   shallow + deep frontmatter validation into one toolchain.
2. **Add a bootstrap renderer pass at SessionStart.** Detects missing or
   stale view files for every active workflow and renders them in the
   background, so views never drift after `git pull`, fresh clones, or
   external edits.
3. **Move local serving (and optional Tailscale exposure) into the renderer
   itself, as configurable parameters.** No slash command — the user opts in
   by editing `.ai/sdlc-config.json`, and the renderer manages the server's
   lifecycle as part of its bootstrap pass.

These compose: #1 produces a shared Node toolchain; #2 reuses it for a
SessionStart hook that also boots the serve daemon from #3.

---

## Current state (baseline)

Today the plugin ships six hook scripts. Four are wired:

| Script                                                                                       | Event                            | Manifest                                     |
|----------------------------------------------------------------------------------------------|----------------------------------|----------------------------------------------|
| [validate-workflow-write.sh](hooks/scripts/validate-workflow-write.sh)                       | PreToolUse: Write                | [hooks.json](../../../hooks/hooks.json)               |
| [auto-stage.sh](hooks/scripts/auto-stage.sh)                                                 | PostToolUse: Write\|Edit         | [hooks.json](../../../hooks/hooks.json)               |
| [verify-workflow-postwrite.sh](hooks/scripts/verify-workflow-postwrite.sh)                   | PostToolUse: Write\|Edit         | [hooks.json](../../../hooks/hooks.json)               |
| [render-on-artifact-write.mjs](../../../hooks/render-on-artifact-write.mjs)                           | PostToolUse: Write\|Edit\|...    | [render-sunflower.json](hooks/render-sunflower.json) |

Two are dormant (scripts exist, no manifest references them):

- [workflow-discovery.sh](hooks/scripts/workflow-discovery.sh) — designed for SessionStart.
- [pre-compact.sh](hooks/scripts/pre-compact.sh) — designed for PreCompact.

Runtime dependencies today: `bash`, `yq`, `jq`, `git`, `python3`, `node`.
After this migration: `node` and `git` only.

---

## Phase 0 — Foundation (shared modules)

Lay down code that all three phases consume. No behavior change in this phase.

### Files to create

```
plugins/sdlc-workflow/lib/
├── frontmatter.mjs        # gray-matter wrapper → {data, content, raw}
├── schema-validator.mjs   # ajv against tests/frontmatter.schema.json
├── workflow-index.mjs     # walk .ai/workflows/*/00-index.md, parse, classify
├── render-state.mjs       # mtime comparison, staleness detection
├── pid-file.mjs           # write/read/liveness, cross-platform
├── detach.mjs             # spawn detached child w/ windowsHide:true
├── stdin.mjs              # readStdinJson() helper for hook scripts
└── config.mjs             # load .ai/sdlc-config.json with defaults
```

### Dependencies to add

`plugins/sdlc-workflow/package.json` (create if absent):

- `gray-matter` — frontmatter parse
- `ajv` + `ajv-formats` — JSON Schema validation
- `fast-glob` — file enumeration

Native ESM. Target Node ≥ 20 (already required by Claude Code).
No transpilation step.

### Shared config schema — `.ai/sdlc-config.json`

```jsonc
{
  "$schema": "${CLAUDE_PLUGIN_ROOT}/schemas/sdlc-config.schema.json",
  "view": {
    "render": {
      "concurrency": 4,
      "debounceMs": 2000
    },
    "serve": {
      "enabled": false,
      "host": "127.0.0.1",
      "port": 4173,
      "liveReload": true,
      "tailscale": {
        "enabled": false,
        "mode": "serve",        // "serve" or "funnel" (funnel = public)
        "path": "/",            // path prefix in tailscale routing
        "https": true
      }
    },
    "bootstrap": {
      "enabled": true,
      "renderMissing": true,
      "renderStale": true
    }
  },
  "hooks": {
    "autoStage": true,
    "validateOnWrite": true,
    "verifyOnWrite": true
  }
}
```

All fields optional; `config.mjs` applies defaults. Add the file to a
recommended `.gitignore` snippet in the README so projects don't accidentally
commit per-machine state.

### Schema for the config file

`plugins/sdlc-workflow/schemas/sdlc-config.schema.json` — a JSON Schema for
the structure above. Distributed with the plugin. Lets editors give users
autocomplete on the config file via the `$schema` reference.

### Tests

- `tests/unit/lib/schema-validator.test.mjs` — parity corpus: run the new
  Node validator and the existing `tests/verify_frontmatter.py` over every
  artifact in `tests/fixtures/` and assert identical pass/fail + identical
  error messages (modulo formatting).
- `tests/unit/lib/workflow-index.test.mjs` — fixture-based: synthetic
  workflow trees → expected active/stale/complete classification.
- `tests/unit/lib/pid-file.test.mjs` — cross-platform liveness on Windows
  + Linux + macOS.

### Phase 0 exit criteria

- ✅ All shared modules compile and pass unit tests on Node 20.
- ✅ Node validator matches Python verifier output bit-for-bit on the full
  artifact corpus.
- ✅ No `package-lock.json` ambiguities; lockfile checked in.

---

## Phase 1 — Hook consolidation to Node

Rewrite every hook in Node, preserving exact semantics. Ship as one commit
because parity is verified as a single set.

### File map

| Old (bash / current Node)                          | New (Node)                                       | Hook event                                |
|----------------------------------------------------|--------------------------------------------------|-------------------------------------------|
| `hooks/scripts/validate-workflow-write.sh`         | `hooks/pre-write-validate.mjs`                   | PreToolUse: Write                         |
| `hooks/scripts/auto-stage.sh`                      | `hooks/post-write-auto-stage.mjs`                | PostToolUse: Write\|Edit                  |
| `hooks/scripts/verify-workflow-postwrite.sh`       | `hooks/post-write-verify.mjs`                    | PostToolUse: Write\|Edit\|MultiEdit       |
| `hooks/render-on-artifact-write.mjs`               | `hooks/post-write-render.mjs` (rename, refactor) | PostToolUse: Write\|Edit\|MultiEdit\|NotebookEdit |
| `hooks/scripts/workflow-discovery.sh` (dormant)    | `hooks/session-start-orient.mjs`                 | SessionStart                              |
| `hooks/scripts/pre-compact.sh` (dormant)           | `hooks/pre-compact-preserve.mjs`                 | PreCompact                                |

### Hook contracts (all scripts share this shape)

```js
#!/usr/bin/env node
import { readStdinJson } from '../lib/stdin.mjs';
import { loadConfig }    from '../lib/config.mjs';
import { logError }      from '../lib/error-log.mjs';

const input  = await readStdinJson();
const config = await loadConfig(input?.cwd ?? process.cwd());
// …hook-specific logic…
// Exit conventions:
//   0           — silent allow
//   0 + JSON    — allow with {systemMessage}
//   2 + stderr  — block (Claude sees the stderr in its next turn)
```

Every hook:
- Catches its own errors and writes them to `.ai/_view/.hook-errors.log`.
  A hook bug must never tear down the whole hook chain.
- Reads `config.hooks.<name>` to allow opt-out per-hook.
- Honors `CLAUDE_PLUGIN_INSTALL=1` (bulk install suppression).

### Unified hooks.json manifest

Replace both [hooks.json](../../../hooks/hooks.json) and
[render-sunflower.json](hooks/render-sunflower.json) with one file:

```json
{
  "description": "sdlc-workflow hooks (Node)",
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command",
                    "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start-orient.mjs\"",
                    "timeout": 30 }] }
    ],
    "PreCompact": [
      { "hooks": [{ "type": "command",
                    "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/pre-compact-preserve.mjs\"",
                    "timeout": 5 }] }
    ],
    "PreToolUse": [
      { "matcher": "Write",
        "hooks": [{ "type": "command",
                    "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/pre-write-validate.mjs\"",
                    "timeout": 5 }] }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [
          { "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/post-write-auto-stage.mjs\"",
            "timeout": 5 },
          { "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/post-write-verify.mjs\"",
            "timeout": 15 },
          { "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/post-write-render.mjs\"",
            "timeout": 30 }
        ]
      }
    ]
  }
}
```

PostToolUse order is deliberate:
1. **auto-stage** runs first — even if verify fails, the user still has the
   file staged for inspection.
2. **verify** runs second — schema failures need to surface to Claude.
3. **render** runs last — a broken render must not block the validators.

### Per-hook behavior preservation

For each migrated hook, the implementation lives next to a parity table.
One row = one behavior of the old script = one parity test. The hook does
not merge until every row is green.

**Example: `pre-write-validate.mjs`**

| Behavior                             | Bash (today)                                              | Node (new)                                                | Parity test                                |
|--------------------------------------|-----------------------------------------------------------|-----------------------------------------------------------|--------------------------------------------|
| Skip if no file_path                 | `[ -z "$FILE_PATH" ] && exit 0`                           | `if (!input.tool_input.file_path) return 0`                | `pre-write/skip-no-path.test.mjs`          |
| Skip if not workflow file            | bash `case` on `.ai/workflows/*`                          | path regex match                                          | `pre-write/skip-non-workflow.test.mjs`     |
| Filename naming convention           | `case "$FILENAME" in [0-9][0-9]-*.md) …`                  | regex `/^\d{2}[a-z]?-.+\.md$/` + special-set              | `pre-write/filename.test.mjs`              |
| Frontmatter required fields          | grep + yq                                                 | `gray-matter` + Ajv                                       | `pre-write/required-fields.test.mjs`       |
| Slug stability vs. directory         | yq `.slug` + `dirname`                                    | `data.slug === basename(dirname(path))`                   | `pre-write/slug-stability.test.mjs`        |
| Soft warn on INDEX.md missing row    | grep tab-delimited row                                    | parse + Map lookup                                        | `pre-write/index-drift-warn.test.mjs`      |
| Schema version exactly `sdlc/v1`     | grep                                                      | `data.schema === 'sdlc/v1'`                               | `pre-write/schema-version.test.mjs`        |
| Block on error: exit 2 + stderr      | `echo -e "$ERROR_MSG" >&2; exit 2`                        | `console.error(msg); process.exit(2)`                     | `pre-write/exit-codes.test.mjs`            |

Mirror this table inside the source file of each hook as a header comment.

### Hook behavior changes that intentionally diverge

Two old behaviors are not worth preserving — flag them in the CHANGELOG:

1. **`auto-stage.sh` skips workflow artifacts** ([auto-stage.sh:45-47](hooks/scripts/auto-stage.sh)).
   In Node we keep that behavior, but the rationale comment moves into
   `post-write-auto-stage.mjs` as inline doc so the next reader doesn't
   wonder why staging excludes them.
2. **`verify-workflow-postwrite.sh` fails open on missing Python**
   ([verify-workflow-postwrite.sh:51-62](hooks/scripts/verify-workflow-postwrite.sh)).
   In Node there's no equivalent "missing runtime" path — Ajv ships with the
   plugin. Remove the fail-open path and the `systemMessage` warning.

### External dep cleanup

After Phase 1 merges, these are no longer runtime deps:

- `yq` (replaced by `gray-matter`)
- `jq` (replaced by native `JSON.parse`)
- `python3` + `verify_frontmatter.py` (replaced by Ajv)
- `bash` (replaced by `node`)

Keep `tests/verify_frontmatter.py` in `tests/` for one release as a parity
reference. Delete it in v9.28 (or next major).

`git` is still needed by the auto-stage hook — invoke via
`node:child_process.execFile` (not `exec` — argv array avoids shell quoting).

### Phase 1 exit criteria

- ✅ Every parity row is green.
- ✅ Fresh Windows install **without** Git Bash, yq, jq, or python passes
  the full hook test suite.
- ✅ Fresh Linux install with only `node` and `git` passes.
- ✅ README "Requirements" section updated.
- ✅ CHANGELOG entry calls out the dep removal explicitly so any user
  who customized the bash hooks downstream knows their copies are now
  no-ops and can be deleted.

---

## Phase 2 — Bootstrap renderer + SessionStart wiring

### Goal

At every SessionStart: detect any active workflow whose `.ai/_view/<slug>/`
is missing or older than its source artifacts, and render it. Detached.
Non-blocking. Respects a concurrency budget.

### Where this lives

Extend the existing `scripts/render-sunflower.mjs` with a new mode:

```
node scripts/render-sunflower.mjs --bootstrap [--dry-run] [--concurrency 4]
```

This mode:

1. Loads `.ai/sdlc-config.json`; bails if `view.bootstrap.enabled === false`.
2. `workflow-index.mjs` → list of `{slug, status, latestArtifactMtime}` for
   every workflow.
3. Filter to active workflows only (skip `complete | abandoned | cancelled`).
4. For each, `render-state.mjs` returns `viewMtime | null`.
5. Schedule slugs where `viewMtime === null` (missing, governed by
   `bootstrap.renderMissing`) OR `latestArtifactMtime > viewMtime` (stale,
   governed by `bootstrap.renderStale`).
6. Run renders through a worker pool capped at `view.render.concurrency`.
7. Append one line per slug to `.ai/_view/.bootstrap.log` with timestamp,
   slug, action (`render | skip | error`), and duration.
8. If `view.serve.enabled === true`, ensure the serve daemon is running
   (see Phase 3) — same detached spawn pattern, idempotent via PID file.

### `session-start-orient.mjs` integration

The hook does two things, in this order:

**Step 1 — synchronous, fast (<100ms).**
Scan active workflows (the existing `workflow-discovery.sh` logic, ported).
Emit a `{systemMessage}` JSON object orienting Claude to the active
workflow(s). This part *must* be fast — it blocks session start.

**Step 2 — detached, fire-and-forget.**
Spawn `node scripts/render-sunflower.mjs --bootstrap` via `detach.mjs`.
`stdio: 'ignore'`, `windowsHide: true`. Return immediately. The bootstrap
process runs in the background; views catch up within seconds.

### `--dry-run` flag

For CI and debugging. Lists slugs that *would* be rendered, exits 0, no
work. Useful right after a `git pull` to verify the staleness detector's
view matches expectations.

### Edge cases

| Scenario                                   | Behavior                                                        |
|--------------------------------------------|-----------------------------------------------------------------|
| `.ai/_view/` doesn't exist                 | Create it; render all active slugs.                             |
| `00-index.md` has invalid frontmatter      | Skip slug; log error to `.bootstrap.log`. Don't crash.          |
| Workflow status is `complete | abandoned`  | Skip (no view needed for archived work).                        |
| `.ai/_view/.render-suppress` exists        | Honor it; skip all rendering.                                   |
| 50 slugs all stale at once                 | Concurrency cap prevents disk saturation.                       |
| Bootstrap already running (another shell)  | PID-file lock at `.ai/_view/.bootstrap.pid`; second instance exits 0. |
| Artifact mtime newer than view by < 1s     | Render anyway (FS mtime resolution is coarse on some FSes).     |
| Symlinked workflow directories             | Resolve real path before mtime check.                           |

### Phase 2 exit criteria

- ✅ Fresh-clone scenario: `git clone` → open Claude Code → all active
  workflow views appear in `.ai/_view/` within 10s, no user action.
- ✅ Stale-after-pull: `git pull` brings new artifacts → next session
  catches them up automatically.
- ✅ SessionStart latency P95 < 200ms for the orient phase (the render is
  detached so doesn't count).
- ✅ Dry-run output exactly matches what wet-run would actually render.

---

## Phase 3 — Renderer-hosted serve (with optional Tailscale)

### Constraint from the user

**Serving is a configurable parameter of the renderer**, not a slash
command. The user opts in by setting `view.serve.enabled = true` in
`.ai/sdlc-config.json`; the renderer's bootstrap pass manages lifecycle.

### Where this lives

`scripts/render-sunflower-serve.mjs` — a standalone module that
`render-sunflower.mjs --bootstrap` spawns as a detached child when serve is
enabled. Keeping the server in its own file (not inline in the renderer)
makes it independently testable and lets it run as a long-lived process
without holding the renderer's import graph in memory.

### Server implementation

- **Pure Node.** `node:http` + `node:fs/promises` + `node:path`. No Express.
- **Static** files from `.ai/_view/`. `Cache-Control: no-store`, no ETags.
- **Live-reload** via SSE on `/__sdlc/events`:
  - The renderer's PostToolUse pass (existing
    [post-write-render.mjs]) writes a timestamp to
    `.ai/_view/.last-render` after each successful render.
  - The server `fs.watch`es `.last-render` and emits an SSE `reload`
    event to all connected clients.
  - A tiny inline `<script>` injected into rendered HTML by
    `render-sunflower.mjs` listens for the event and calls
    `location.reload()`.
  - Governed by `view.serve.liveReload`. When false, skip both the
    script injection and the SSE endpoint.
- **Bind** to `view.serve.host` (default `127.0.0.1`). Refuse `0.0.0.0`
  unless `tailscale.enabled === true` AND `host: "0.0.0.0"` is explicit
  (require both signals to avoid accidental exposure).
- **Health** endpoint `/__sdlc/health` returns
  `{status: "ok", slugs: [...], renderedAt: <iso>}`. Used by the bootstrap
  pass to confirm a running server is healthy before deciding not to
  restart it.
- **Path safety:**
  `resolve(filePath).startsWith(resolve(viewRoot) + path.sep)` —
  reject anything else with 404.
- **No directory listings.** Serve `index.html` if present, else 404.
- **Read-only.** No PUT/POST/DELETE handlers exist at all.

### Lifecycle

The bootstrap renderer phase, when `view.serve.enabled === true`:

1. Read `.ai/_view/.serve.pid`.
2. If PID exists AND the process is alive (`process.kill(pid, 0)`) AND
   `/__sdlc/health` responds within 500ms → no-op, server already running.
3. Otherwise:
   - Remove stale PID file if present.
   - Spawn `node scripts/render-sunflower-serve.mjs --port <p> --host <h>`
     detached.
   - Wait up to 2s for `/__sdlc/health` to respond green.
   - Write new PID file with `{pid, port, startedAt, configHash}`.
4. If `serve.enabled` flipped from `true` → `false` between sessions, the
   bootstrap pass reads the PID file, sends `SIGTERM`, and removes it.

Server handles `SIGTERM`: flush in-flight responses, close SSE connections
with a final `goodbye` event, remove its own PID file, exit 0.

There is no explicit "stop" command. Lifetime is OS-bound and
config-bound — exactly as the user asked.

### Tailscale integration

If `view.serve.tailscale.enabled === true`, after the local server is
confirmed healthy:

- **mode: "serve"** (default; tailnet-only access)

  ```
  tailscale serve --bg --https=<true|false> <path> http://127.0.0.1:<port>
  ```

- **mode: "funnel"** (public internet)

  ```
  tailscale funnel --bg <port>
  ```

  Refuse to enable funnel unless the config also sets
  `tailscale.acknowledgedPublic: true`. Funnel exposes to the open
  internet; we don't want that to be a one-flag toggle.

Failures are non-fatal:
- `tailscale` not on PATH → log `tailscale.unavailable` to
  `.bootstrap.log`, continue serving locally.
- Auth required → log the `tailscale` stderr verbatim, continue.

The status of the tailscale binding is reflected in `/__sdlc/health`:

```json
{
  "status": "ok",
  "slugs": ["fix-foo", "ship-bar"],
  "renderedAt": "2026-05-23T18:42:00Z",
  "tailscale": {
    "enabled": true,
    "mode": "serve",
    "url": "https://my-machine.tailnet.ts.net/",
    "lastError": null
  }
}
```

### Config flag matrix

| `serve.enabled` | `tailscale.enabled` | `tailscale.mode` | Behavior                                              |
|-----------------|---------------------|------------------|-------------------------------------------------------|
| false           | (ignored)           | (ignored)        | No server. Renderer unchanged vs. today.              |
| true            | false               | (ignored)        | Local server on `127.0.0.1:<port>`.                   |
| true            | true                | `serve`          | Local server + tailscale serve (tailnet-only).        |
| true            | true                | `funnel` + ack   | Local server + tailscale funnel (public).             |
| true            | true                | `funnel` no ack  | Treat as `serve` mode + log warning.                  |
| false           | true                | (any)            | Ignore tailscale flag + log warning. Don't start.     |

### Security checklist

- Default bind: `127.0.0.1`. Anything else requires explicit user action.
- No write endpoints anywhere.
- Path validation prevents traversal.
- `liveReload` script injected only into responses with content-type
  `text/html` — never into raw JSON or YAML.
- README documents that on shared tailnets, users should ACL their served
  port to themselves.
- Funnel requires both `enabled: true` AND a separate `acknowledgedPublic`
  flag — two-step opt-in.

### Phase 3 exit criteria

- ✅ `view.serve.enabled = true` + start Claude Code → server up on next
  SessionStart at `http://127.0.0.1:4173/`.
- ✅ Edit a workflow artifact → open browser tab reloads within ~3s
  (debounce + render).
- ✅ `tailscale.enabled = true` + `tailscale` on PATH → tailnet peers
  reach the view at the URL reported by `/__sdlc/health`.
- ✅ Kill the server process manually → next SessionStart restarts it.
- ✅ Flip `serve.enabled` to `false` → existing server is `SIGTERM`-ed
  on next SessionStart.
- ✅ Path-traversal attempt (`GET /../../etc/passwd`) → 404, no file
  served.
- ✅ Funnel without `acknowledgedPublic: true` → does not enable funnel,
  warning logged.

---

## Cross-cutting concerns

### Backwards compatibility

This is a one-shot break that removes bash hooks and the Python verifier.
Downstream consumers who copied the bash hooks into their own configs must
point at the new Node entries. Spell this out in CHANGELOG.

Default behavior for users who don't edit `.ai/sdlc-config.json`:
- Phase 1 → identical to today (parity-verified).
- Phase 2 → bootstrap render runs but renders nothing unless artifacts
  drift from views, so no visible change for normal flow.
- Phase 3 → server stays off (default `enabled: false`).

### Migration order

Tackle in dependency order:

1. **Phase 0** (foundation, no behavior change) — own commit.
2. **Phase 1** (Node hooks) — own commit; parity verified.
3. **Phase 2** (bootstrap + dormant scripts wired) — own commit.
4. **Phase 3** (serve daemon, opt-in) — own commit.

If shipping incrementally per release:

- `v9.26.0` = Phases 0 + 1 (deps drop, hooks migrated).
- `v9.27.0` = Phase 2 (bootstrap on, dormant scripts wired).
- `v9.28.0` = Phase 3 (serve daemon available, opt-in).

If shipping as one drop: `v10.0.0` — defensible because the runtime
requirement set changes significantly (no yq/jq/python/bash).

### Telemetry / debugging

Add a `--diag` flag to the renderer that prints:

- Parsed config + applied defaults.
- Active workflow list + view freshness per slug.
- Server PID + port + health response + tailscale status.
- Last 20 lines from each of `.hook-errors.log`, `.bootstrap.log`,
  `.render-errors.log`.

This is the single command anyone runs when reporting "the view isn't
updating" or "the server won't start".

### Documentation updates

- [README.md](../../../README.md): rewrite Requirements (Node + git only).
  New section: "Serving the view locally".
  New section: "Tailscale integration".
- New: [docs/site/reference/hooks.html](../../site/reference/hooks.html) updated to
  document all six Node hooks.
- New: `docs/site/reference/serve.html` — config reference + Tailscale
  one-liners + security model.
- CHANGELOG: dep removal, hook renames, opt-in serve.

### Testing strategy

- **Unit tests** for every shared module under `lib/`.
- **Parity tests** for every migrated hook against the fixture corpus.
- **Integration tests** (Phase 2 + 3):
  - Spin up a fixture project with synthetic workflows.
  - Run `node scripts/render-sunflower.mjs --bootstrap`.
  - Assert view files appear + server starts + health endpoint responds.
  - Edit a workflow artifact, assert SSE event fires.
- **Cross-platform CI**: Windows + Linux + macOS matrix on Node 20 and 22.

---

## Open questions to resolve before starting

1. **Test runner:** `node --test` (built-in, no dep) vs. `vitest` (richer
   ergonomics, extra dep). Recommend `node --test` — parity tests are
   straightforward enough.
2. **Config file location:** `.ai/sdlc-config.json` at project root inside
   `.ai/` (proposed) vs. somewhere else. Check whether existing `.ai/`
   conventions imply a better home.
3. **Live-reload protocol:** SSE (proposed, one-way, simpler) vs.
   WebSocket. SSE is sufficient and has no dependencies.
4. **Tailscale invocation:** CLI (proposed) vs. local API (`/localapi/v0/`).
   CLI is simpler and matches how most users already use Tailscale.
5. **Where does the `injected live-reload script` live?** Inline in
   `render-sunflower.mjs` (small, ~20 lines) vs. a templated partial.
   Inline is fine for now.
6. **Concurrent renderer invocations:** today the PostToolUse hook can
   stack — does the new bootstrap mode need a separate lock from the
   per-write debounce file? Recommend yes (separate `.bootstrap.pid` vs.
   `.render-pending`).
7. **Deleting the Python verifier:** retire in v9.28 (after one release of
   parity verification) vs. keep indefinitely. Recommend retire in v9.28.

---

## Risks

| Risk                                                       | Likelihood | Mitigation                                                                |
|------------------------------------------------------------|------------|---------------------------------------------------------------------------|
| Ajv error messages differ from Python verifier's           | High       | Parity tests assert structure, not exact strings; document delta in CHANGELOG. |
| Detached child orphaned if Claude Code dies hard           | Medium     | PID file + liveness check at next session start cleans up.                |
| User edits config to dangerous values (e.g., bind 0.0.0.0) | Low        | Refuse + warning in `.bootstrap.log`; validate against config schema.     |
| Tailscale CLI version drift breaks invocations             | Medium     | Wrap CLI calls in a small adapter; failures non-fatal, logged not thrown. |
| Bootstrap render saturates disk on huge repos              | Low        | Concurrency cap (config default 4) + per-slug timeout.                    |
| `node --watch` semantics differ across Node versions       | Low        | Pin minimum Node 20; use `fs.watch` not `--watch`.                        |
