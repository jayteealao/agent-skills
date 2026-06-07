# SELF-CONTAINED-BUILD-PLAN — Retire the runtime `npm install`

Status: **planning — 0% landed as of v9.44.1** · scope locked 2026-06-01 · reconciled 2026-06-07 · target plugin v9.45.x+

Ship the plugin so a **fresh marketplace install runs with zero manual steps and
zero runtime `node_modules`**. esbuild-bundle every Claude-invoked entrypoint into
committed `dist/*.mjs` files with `markdown-it`/`js-yaml`/`ajv` inlined. The view
(and later the tray — see [TRAY-APP-PLAN.md](TRAY-APP-PLAN.md)) ride on this.

This is the **foundation**; the tray is the final entrypoint added to the same build.

## The problem (traced)

Claude Code never auto-runs `npm install`; `node_modules/` is gitignored; there is
no postinstall. The runtime third-party deps therefore reach users **only via a
manual `npm install`** in the plugin dir — undocumented to most installers and
silently load-bearing:

- `lib/frontmatter.mjs` → `js-yaml`; `lib/config.mjs` + `lib/schema-validator.mjs` → `ajv-formats`; `renderers/_markdown.mjs` → `markdown-it` + `markdown-it-anchor`.
- The **SessionStart hook** `session-start-orient.mjs` imports `loadConfig` → `lib/config.mjs`'s **top-level** `import 'ajv-formats'`. A missing dep throws at **module-load, before any try/catch** → the hook hard-crashes on a fresh install (Claude tolerates it, so the failure is silent: no orientation, no auto-render).

So today the manual install is required for the hooks, not just the dashboard.
(It "works" on existing dev machines only because `node_modules` was installed there once.)

## Goal & approach

**Goal:** end users get pre-built, self-contained artifacts; the only `npm install`
left is a **maintainer/dev** concern (building + running tests), never an end-user one.

**Approach:** one esbuild call, many entrypoints, output to `dist/` at **depth-1**.
esbuild inlines the pure-JS deps (no native bits). Because every path-sensitive read
in `lib/` uses `resolve(__dirname, '..', …)` / `new URL('../…', import.meta.url)`
(verified for `config`, `schema-validator`, `hub-lifecycle`, `serve-lifecycle`),
emitting bundles one level under the plugin root preserves identical `..` semantics —
they keep resolving to the real plugin-root files.

```
esbuild <entrypoints> --bundle --platform=node --format=esm \
  --outdir=dist --out-extension:.js=.mjs --target=node20
```

(ESM output keeps `import.meta.url` natural and tolerates top-level `await`; CJS deps
are interop-wrapped automatically.)

## Entrypoint inventory → `dist/`

| Source | Invoked by | Bundle target |
|---|---|---|
| `hooks/session-start-orient.mjs` | hooks.json SessionStart | `dist/session-start-orient.mjs` |
| `hooks/pre-write-validate.mjs` | hooks.json PreToolUse | `dist/…` |
| `hooks/post-write-auto-stage.mjs` | hooks.json PostToolUse | `dist/…` |
| `hooks/post-write-verify.mjs` | hooks.json PostToolUse | `dist/…` |
| `hooks/post-write-render.mjs` | hooks.json PostToolUse | `dist/…` |
| `scripts/render-sunflower.mjs` | spawned (bootstrap + render jobs) | `dist/render-sunflower.mjs` |
| `scripts/hub-serve.mjs` | spawned by hub-lifecycle | `dist/hub-serve.mjs` |
| `scripts/render-sunflower-serve.mjs` | spawned by serve-lifecycle | `dist/render-sunflower-serve.mjs` |
| `scripts/tray.mjs` | user `npm run tray` | `dist/tray.mjs` (ESM, landed v9.46.0) |

`hooks/render-on-artifact-write.mjs` is **live, not legacy** (reconciled 2026-06-07 —
the original "not wired — possibly legacy" guess was stale). `hooks/post-write-render.mjs`
is the wired PostToolUse entry and is a one-line shim: `import './render-on-artifact-write.mjs';`.
So esbuild **inlines** render-on-artifact-write into `dist/post-write-render.mjs`; it gets
**no `dist/` entry of its own** and **must not be retired**.

**Not bundled** (stay as on-disk files, read via `fs` at depth-1-correct paths):
`schemas/*.json`, `assets/*` (copied into the view at render time), `tests/*`.
**Maintainer-only** scripts (`migrate-*`, `verify-*`, `rewrite-*`, `relocate-*`) stay
as source `.mjs` requiring dev `node_modules` — they're never end-user entrypoints.

## Re-pointing the call sites

Self-spawns auto-correct when bundled (they spawn `import.meta.url`/`__filename`,
which becomes the bundle): `scripts/render-sunflower.mjs:933`,
`hooks/render-on-artifact-write.mjs:119`. **No change** — with one nuance: because
render-on-artifact-write is inlined into `dist/post-write-render.mjs` (above), its
`__filename` self-spawn re-enters that bundle as `node dist/post-write-render.mjs
--debounce-stage2 …`. That routes correctly because the `--debounce-stage2` argv branch
is top-level module code (inlined, runs on re-entry) and its
`PLUGIN_ROOT = resolve(__dirname, '..')` still lands on the plugin root from `dist/`
(the depth-1 invariant). ✓

Cross-spawns hardcode `scripts/<name>.mjs` and need a resolver:

- `hooks/session-start-orient.mjs:52` → render-sunflower ✓ (line exact)
- `hooks/render-on-artifact-write.mjs:148` → render-sunflower (was :144; now inlined into `dist/post-write-render.mjs`, so this resolver call lives in that bundle)
- `lib/hub-lifecycle.mjs:80` → hub-serve ✓ (line exact)
- `lib/serve-lifecycle.mjs:99` → render-sunflower-serve ✓ (line exact)

Add `lib/entrypoint.mjs` → `resolveEntrypoint(pluginRoot, name)`: return
`dist/<name>.mjs` if it exists, else fall back to `scripts/<name>.mjs`. This gives
**prod = bundle / dev-with-node_modules = source** transparently. The 4 sites call it.

`hooks.json` (static JSON, no logic) points directly at `dist/<name>.mjs` — `dist/`
is always committed, so it's always present. (Dev iteration on a hook = rebuild, or
temporarily point at source.)

## Dependency reshuffle

Move `markdown-it`, `markdown-it-anchor`, `js-yaml`, `ajv`, `ajv-formats` from
`dependencies` → `devDependencies` (bundled, not installed at runtime; tests still
import them from source). Add `esbuild` to `devDependencies`. Runtime `dependencies`
becomes **empty**. Add `"build": "node scripts/build.mjs"` (multi-entry esbuild).

## Freshness enforcement (both chosen)

1. **CI freshness check** — `.github/workflows/`: `npm ci` → `npm run build` →
   `git diff --exit-code dist/`. PR fails if committed `dist/` ≠ fresh build.
   Add a **bundle smoke test** after build (`node dist/render-sunflower.mjs
   --bootstrap --dry-run` against a fixture) to catch source↔bundle divergence.
2. **Pre-commit hook** — `core.hooksPath` script (no husky dep) that rebuilds `dist/`
   and `git add`s it when `scripts/`, `hooks/`, `lib/`, `renderers/`, `components/`,
   or `package.json` changed under the plugin. Scoped to this plugin in the monorepo.

## Risks

1. **Source↔bundle divergence** — tests run source, runtime runs bundles. Mitigate with the CI smoke test on the built artifact (above).
2. **`ajv` runtime codegen** (`new Function`) — in-process eval, not native/fs; bundles & runs fine in a single-file Node bundle.
3. **Top-level await** in any entrypoint → must be ESM output (we use `--format=esm`). ✓
4. **Stale `dist/`** — the dual enforcement (CI + pre-commit) covers forgetful commits.
5. **`hooks.json` → `dist/`** means a broken build breaks hooks; the CI gate prevents shipping one.

## Reconciliation snapshot (2026-06-07, repo at plugin v9.44.1)

Verified against the live tree — **none of P0–P4 has landed**; the plan is fully pending
and unaffected by intervening releases:

- **P0** — no `dist/`, no `scripts/build.mjs`, no `build` script, `.gitignore` ignores only `node_modules/`.
- **P1** — no `lib/entrypoint.mjs`; `hooks.json` still points at `hooks/*.mjs` (0 `dist/` refs); all 4 cross-spawn sites still hardcode `scripts/`.
- **P2** — only CI workflow is `verify-router-migration.yml`; no build→diff→smoke gate; no pre-commit hook.
- **P3** — all 5 deps still in `dependencies`; `devDependencies` empty (no `esbuild`); docs unchanged.
- **P4** — tray not started.

Corrections folded in above: dropped the `pre-compact-preserve` entry (hook deleted v9.41.0);
reclassified `render-on-artifact-write` as a live transitive import (not legacy); refreshed
the drifted line numbers. Also noted: `package.json` version (`9.40.0`) trails `plugin.json`
(`9.44.1`) — fix during P3's bump.

## Phased checklist

- [ ] **P0 — Build infra:** `scripts/build.mjs` (multi-entry esbuild → `dist/`); `npm run build`; `.gitignore` allow-rule for `dist/*.mjs`; commit first bundles.
- [ ] **P1 — Resolver + re-point:** `lib/entrypoint.mjs`; update the 4 cross-spawn sites; point `hooks.json` at `dist/`. Verify self-spawns. Smoke-test a fresh-clone run with `node_modules` absent.
- [ ] **P2 — Freshness:** CI workflow (build + diff + smoke) and the pre-commit hook.
- [ ] **P3 — Deps + docs:** move runtime deps → devDeps; rewrite `sunflower-view.md` (drop "npm install once"); CHANGELOG; version bump — reconcile the `package.json` (9.40.0) ↔ `plugin.json` (9.44.1) skew while bumping.
- [x] **P4 — Tray:** ✅ LANDED v9.46.0 — `scripts/tray.mjs` added to `SCRIPT_ENTRIES` → `dist/tray.mjs` (one more entry in the same build), plus vendored binaries (`bin/tray/`) + icons (`assets/app-icon*`). See [TRAY-APP-PLAN.md](TRAY-APP-PLAN.md) (the tray drives the helper via `lib/tray-protocol.mjs`, so no systray2 JS enters the bundle).
```
