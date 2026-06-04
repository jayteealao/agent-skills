# SELF-CONTAINED-BUILD-PLAN — Retire the runtime `npm install`

Status: **planning** · scope locked via Q&A 2026-06-01 · target plugin v9.37.x+

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
| `hooks/pre-compact-preserve.mjs` | hooks.json PreCompact | `dist/…` |
| `hooks/pre-write-validate.mjs` | hooks.json PreToolUse | `dist/…` |
| `hooks/post-write-auto-stage.mjs` | hooks.json PostToolUse | `dist/…` |
| `hooks/post-write-verify.mjs` | hooks.json PostToolUse | `dist/…` |
| `hooks/post-write-render.mjs` | hooks.json PostToolUse | `dist/…` |
| `scripts/render-sunflower.mjs` | spawned (bootstrap + render jobs) | `dist/render-sunflower.mjs` |
| `scripts/hub-serve.mjs` | spawned by hub-lifecycle | `dist/hub-serve.mjs` |
| `scripts/render-sunflower-serve.mjs` | spawned by serve-lifecycle | `dist/render-sunflower-serve.mjs` |
| `scripts/tray.mjs` (later) | user `npm run tray` | `dist/tray.cjs` |

Check whether `hooks/render-on-artifact-write.mjs` is still reachable (it is **not**
wired in `hooks.json` — possibly legacy). If used, bundle it too; if dead, retire it.

**Not bundled** (stay as on-disk files, read via `fs` at depth-1-correct paths):
`schemas/*.json`, `assets/*` (copied into the view at render time), `tests/*`.
**Maintainer-only** scripts (`migrate-*`, `verify-*`, `rewrite-*`, `relocate-*`) stay
as source `.mjs` requiring dev `node_modules` — they're never end-user entrypoints.

## Re-pointing the call sites

Self-spawns auto-correct when bundled (they spawn `import.meta.url`/`__filename`,
which becomes the bundle): `scripts/render-sunflower.mjs:907`,
`hooks/render-on-artifact-write.mjs:116`. **No change.**

Cross-spawns hardcode `scripts/<name>.mjs` and need a resolver:

- `hooks/session-start-orient.mjs:52` → render-sunflower
- `hooks/render-on-artifact-write.mjs:144` → render-sunflower
- `lib/hub-lifecycle.mjs:80` → hub-serve
- `lib/serve-lifecycle.mjs:99` → render-sunflower-serve

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

## Phased checklist

- [ ] **P0 — Build infra:** `scripts/build.mjs` (multi-entry esbuild → `dist/`); `npm run build`; `.gitignore` allow-rule for `dist/*.mjs`; commit first bundles.
- [ ] **P1 — Resolver + re-point:** `lib/entrypoint.mjs`; update the 4 cross-spawn sites; point `hooks.json` at `dist/`. Verify self-spawns. Smoke-test a fresh-clone run with `node_modules` absent.
- [ ] **P2 — Freshness:** CI workflow (build + diff + smoke) and the pre-commit hook.
- [ ] **P3 — Deps + docs:** move runtime deps → devDeps; rewrite `sunflower-view.md` (drop "npm install once"); CHANGELOG; version bump.
- [ ] **P4 — Tray:** add `scripts/tray.mjs` as a `dist/` entrypoint per [TRAY-APP-PLAN.md](TRAY-APP-PLAN.md) — now just one more entry in the same build, plus the vendored binaries + icons.
```
