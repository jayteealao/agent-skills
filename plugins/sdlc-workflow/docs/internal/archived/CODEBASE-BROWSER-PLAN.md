# CODEBASE-BROWSER-PLAN — Serve each repo's source in an in-browser file browser

Status: **IMPLEMENTED end-to-end as v9.52.0 (2026-06-10)** — all 4 slices + the §6 security
review (verdict: Ship; the review added the loopback-only `serveSecrets` enforcement). Suite
298/298 + e2e + verify + verify:docs green; browser-verified (CSP clean, lazy tree, warm
theme). Deviations from this plan: bundle is ~994 KiB minified (over the ~600 KB soft budget —
react-dom + 9 grammars are irreducible; `typescript`/`jsx` alias onto the `tsx` grammar),
`motion`/`react-icons`/radix/shadcn-primitives were stripped from the vendored kibo components,
the topbar link is injected at SERVE time per §0.2-7, and the per-repo daemon gained the
Host-allowlist gate per §0.2-4. · drafted 2026-06-01 · reconciled 2026-06-10 against v9.50.0
(§0) · depends on [SELF-CONTAINED-BUILD-PLAN.md](SELF-CONTAINED-BUILD-PLAN.md) — landed v9.45.0

Add a read-only **code browser** to every registered repo: a file tree + syntax-highlighted
viewer, reachable from the repo's existing top bar at `/r/<id>/__code/`. Visual shell is the
kibo-ui [Codebase block](https://www.kibo-ui.com/blocks/codebase) (`@repo/code-block` +
`@repo/tree`), reskinned to the warm-paper palette and bundled with esbuild into a **committed**
artifact so end users never `npm install` and the runtime hub stays dep-free.

This is the **first browser-target consumer** of the esbuild rail in SELF-CONTAINED-BUILD-PLAN.
(The original "proves the build before the tray bets on it" sequencing is moot: the build rail
landed v9.45.0 and the tray shipped v9.46.0. The browser half — `platform:'browser'`, CSS output —
was never specified in that plan; **this plan defines it.**)

---

## 0. Implementation-readiness reconciliation (2026-06-10, against v9.50.0)

Full code audit of every file this plan touches. §§1–10 below are kept as drafted (decision
provenance); **where §0 and a later section disagree, §0 wins.**

### 0.1 Verified current — the plan's assumptions that still hold

- **Hook points** (line refs as of v9.50.0): the `/r/<id>/` branch hands off to `serveRepoFile` at
  `scripts/hub-serve.mjs:504–509` (plan said 435–440); `/__sdlc/hub-reload.js` route at `:468`;
  the global `hostAllowed` DNS-rebinding gate at `:460` wraps all hub routes, so the new routes do
  inherit it **on the hub**. The v9.50 `/docs` route (`:497–502` + `serveDocsFile`) is the exact
  precedent to copy: route-family regex, asset root resolved once via
  `new URL('../docs/site', import.meta.url)` (works identically from `scripts/` and `dist/` — the
  depth-1 invariant), and a route-scoped CSP constant. Resolve the bundle the same way:
  `new URL('../dist/code-browser.js', import.meta.url)`.
- **CSP: zero changes needed.** The strict CSP (`hub-serve.mjs:59`) already admits everything the
  page needs: `script-src 'self'` + `style-src 'self' 'unsafe-inline'` cover the same-origin
  bundle/css, and `connect-src` falls back to `default-src 'self'` for the fetch calls.
- **Registry entry shape** (v2, SLUG-BRANCH-IDENTITY): `{ id, repoRoot, headBranch, worktreeLabel,
  viewDir, lastRenderedAt, slugs, slugMeta[], configHash, registeredAt, updatedAt }`; id =
  `sha256(repoRoot)[0:12]`, branch-insensitive. `serveCodeBrowser` must mirror `serveRepoFile`'s
  guard: look up the entry, run `validateEntry(entry)` (drop + 410 on failure), then root the
  kernel at `entry.repoRoot`.
- **Config**: `lib/hub-config.mjs` `HUB_CONFIG_DEFAULTS` + `deepMerge` migration → adding the
  `codeBrowser` block (§5) is zero-migration, and `hubConfigHash` already covers it, so editing
  the config auto-restarts the hub (drift detection). There is no JSON schema for hub-config
  (plain defaults-merge) and the per-repo `.ai/sdlc-config.json` schema is untouched — codeBrowser
  is machine-wide only.
- **Config transport**: daemons are argv-configured by the supervisors (`hub-lifecycle.mjs`
  childArgs / `serve-lifecycle.mjs` spawn). Pass the whole block as ONE flag —
  `--code-browser '<json>'` — parsed in `parseHubArgs`/`parseServeArgs`; 7 granular flags would
  be noise. (Token stays in env; this config is not secret.)
- **Build rail**: `scripts/build.mjs` starts with `rmSync(DIST, …)` — the browser target MUST be
  emitted by the same script, after the node build (a separate script's output would be wiped).
  Non-`.mjs` files in dist/ are precedented (`launch-hidden.vbs` lib-asset copy).
- **dist tracking**: `.gitignore` already has `!dist/` + `!dist/**` — `dist/code-browser.js|.css`
  are tracked automatically. §4.3's "add a .gitignore allow-rule" step is **unnecessary**.
- **Freshness gate**: CI (`.github/workflows/sdlc-build-freshness.yml`) runs
  `npm ci && npm run build && git -c core.fileMode=false diff --exit-code -- dist`. Two required
  edits: add `plugins/sdlc-workflow/view-src/**` to BOTH trigger-path lists, and extend the
  pre-commit hook regex (`.githooks/pre-commit` `INPUT_RE`) with `view-src`. Add a bundle
  smoke line to the no-runtime-deps CI step (`test -s dist/code-browser.js -a -s
  dist/code-browser.css` — the IIFE can't be node-run).
- **Because CI rebuilds dist from the lockfile, every browser-bundle dep must be a committed
  devDependency** (+ package-lock). The tray's "ad-hoc tools not in devDeps" exemption does NOT
  apply — that covers rare regeneration of committed binaries; this bundle is rebuilt on every PR.
- **Tests**: `node:test`; follow `tests/unit/lib/multi-repo-hub.test.mjs` (hermetic `SDLC_HOME`
  temp homes, `initRepo()` real-git fixtures, `createHubServer` on an ephemeral port).
  ⚠ `package.json`'s `test` script **enumerates test files explicitly** — the new
  `tests/unit/lib/code-browser.test.mjs` must be appended there or it never runs.
  ⚠ No symlink fixtures exist anywhere in the suite yet; on Windows `symlinkSync` needs
  Developer Mode/admin, so symlink-escape tests must try/catch and `t.skip()` on `EPERM`.
- **Palette tokens** (for the Shiki theme + page CSS) confirmed in `assets/sdlc.css:11–21`:
  `--paper #fbfaf6 · --paper-2 #f3f1ea · --paper-3 #ebe7dc · --ink #1f1b16 · --ink-2 #4a443c ·
  --ink-3 #8a8377 · --accent #4a6c8c · --accent-soft #e9eef4` — §4.2's values are correct.
- **Shiki is now v4** (4.2.0): the fine-grained no-WASM API this plan names is unchanged
  (`shiki/core`, `shiki/engine/javascript`, `@shikijs/langs/<lang>`). Optional upgrade path:
  precompiled grammars (`@shikijs/langs-precompiled`) if target-browser RegExp support allows.
- **kibo-ui**: vendor via `npx kibo-ui add codebase` (the block pulls `tree` + `code-block`),
  run in a scratch workspace at implementation time, sources copied into
  `view-src/code-browser/components/`. Requires network at implementation time only.

### 0.2 Corrections — where the plan no longer matches reality

1. **`transformIndexHtml` → `transformServedHtml`** (`hub-serve.mjs:361`). Since v9.50 it
   transforms EVERY served `.html` (not just INDEX.html) and already injects
   `<meta name="sdlc-repo-id">` — §4.1's meta-tag assumption holds, under the new name.
2. **Data contract `branch` → `headBranch`** (§3.6 sample): registry v2 renamed it; emit
   `headBranch` in `tree` responses (legacy `branch` is read-tolerated but never emitted).
3. **Per-repo daemon repoRoot derivation** (§3.5): no `dirname(dirname(viewDir))` guessing —
   `serve-lifecycle` already passes `--project-root` and `parseServeArgs` parses it. Thread a
   `projectRoot` option into `createSdlcStaticServer` (default: derive from viewRoot) and use it
   as the kernel root.
4. **NEW security gap the plan missed: `render-sunflower-serve.mjs` has NO Host-header
   allowlist** — `hostAllowed` is hub-only. View-serving shipped without it, but source-serving
   must not: add the same allowlist gate (port of `hostnameOf`/`hostAllowed`) applied to the new
   `__code/*` + `/__sdlc/code-browser.*` routes at minimum, honoring `--allow-all-hosts` and a
   new `--allowed-hosts` flag; `serve-lifecycle` mirrors `hub-lifecycle:97–100` (tailnet MagicDNS
   allowlisting) when tailscale is enabled. Existing view routes keep current behaviour (no
   regression risk); tightening them too is a separate decision.
5. **Raw-route response hardening** (addition to §3.4/§6): the `raw` endpoint must force
   `X-Content-Type-Options: nosniff` and NEVER serve repo bytes as `text/html` —
   `kind:text` → `text/plain; charset=utf-8`, `kind:image` → image MIME by extension (inline),
   everything else → `application/octet-stream` + `Content-Disposition: attachment`. A repo file
   served as HTML would be same-origin stored XSS; CSP would soften it, but don't rely on CSP.
   JSON endpoints also get `nosniff`.
6. **`gitIgnoredSet` refinement** (§3.3): use `git ls-files -o -i --exclude-standard --directory
   -z` — `--directory` collapses ignored dirs (a 200k-file `node_modules` becomes ONE entry
   `node_modules/`), and badge propagation is prefix-matching. Spawn with the `lib/registry.mjs`
   `git()` conventions (2s timeout, `windowsHide`, stdio pipe/ignore).
7. **Topbar "Code" link belongs at SERVE time, not render time** (§4.5 revision). `_shell.mjs`
   markup is baked into static files at render time, but `__code/` is a server-only route: a
   render-time link dead-ends under `file://` browsing and can't track the machine-wide
   `codeBrowser.enabled` state. Instead: the hub injects the link in `transformServedHtml`
   (alongside the brand rewrite, `hub-serve.mjs:384–398`), gated on `enabled` — inject into
   `.b-topbar .actions` with a stable class (e.g. `code-link`), href built from the entry id.
   The per-repo daemon does no HTML transforms today; skip injection there (the route stays
   reachable by URL) rather than adding transform machinery. `renderers/_shell.mjs` is NOT
   modified. Hub landing: add `code →` beside `open view →` in `repoCard`
   (`renderers/hub-dashboard.mjs:253`).
8. **kibo tree reality check**: the tree component depends on **`motion`** (framer-motion) +
   `lucide-react`, and its documented API has NO lazy-loading / onExpand contract — but
   `lazyTree:true` is this plan's default. Vendored code is owned code (the shadcn model), so the
   vendored tree gets two surgical edits: (a) strip `motion` (CSS transitions / conditional
   render — also saves ~35–45 KB gz), (b) add an expand callback that fetches `…/tree?path=` and
   merges children into state. If the adaptation balloons, the fallback is: keep kibo
   `code-block`, hand-roll the tree (it's a styled `<ul>` with toggles). The §1 "real kibo block"
   decision stands, with this contingency named.
9. **Tailwind decision closed (was §10.4)**: Tailwind **v4** at build time — devDeps
   `tailwindcss` + `@tailwindcss/cli`, CSS-first config (`@theme` in `styles.css`; no
   `tailwind.config.js` needed — §4.1's file list updates accordingly), shadcn semantic vars
   (`--background`, `--foreground`, …) mapped to the warm-paper tokens. The hand-written-CSS
   fallback stays available if v4's preflight/utility output fights the reskin.
10. **Slice 4 docs interactions**: `verify:docs` enforces (a) a version brand on every
    `docs/site/**/*.html` equal to plugin.json's version and (b) Previous/Next pager adjacency
    against `nav.html` — so doc edits ride the doc-site generator flow, and the release re-stamps
    all 53 pages (v9.50 precedent). Version bump = the 4 usual spots (plugin.json, package.json,
    marketplace.json entry + top-level).
11. Drive-by (unrelated, do NOT fold in): `renderers/_shell.mjs:10` hardcodes
    `PLUGIN_VERSION = '9.35.0'` — stale cache-buster for sdlc.css/js. Fix separately.

### 0.3 devDependencies to add (browser bundle build + vendored-component imports)

`react`, `react-dom`, `shiki@^4`, `@shikijs/langs` (direct subpath imports), `lucide-react`,
`clsx`, `tailwind-merge`, `class-variance-authority`, `tailwindcss@^4`, `@tailwindcss/cli`.
(`motion` intentionally NOT added — stripped from the vendored tree, §0.2-8. Exact final list is
pinned when the kibo sources are vendored; anything the vendored code imports must land here or
CI's `npm ci` rebuild fails.) No `typescript` needed — esbuild transpiles `.tsx` without
type-checking.

### 0.4 File inventory (complete touch list)

| Action | Path | What |
|---|---|---|
| NEW | `lib/code-browser.mjs` | kernel + walk + ignored-badging + blob + denylist + `serveCodeBrowser` adapter + bundle-asset serving |
| NEW | `renderers/code-browser-page.mjs` | server-rendered HTML shell (string; hub-landing pattern) |
| NEW | `view-src/code-browser/` | `main.tsx`, vendored `components/{tree,code-block}/`, `highlighter.ts`, `theme-warm-paper.json`, `styles.css` (Tailwind v4 `@theme`) |
| NEW | `tests/unit/lib/code-browser.test.mjs` | kernel + walk + blob unit tests AND hub/per-repo integration tests |
| MOD | `scripts/hub-serve.mjs` | `__code` intercept in the `/r/<id>/` branch; `/__sdlc/code-browser.js\|.css` routes; Code-link injection in `transformServedHtml`; `--code-browser` arg |
| MOD | `scripts/render-sunflower-serve.mjs` | `__code/*` + asset routes; `projectRoot` option; Host-allowlist gate; `--code-browser` / `--allowed-hosts` args |
| MOD | `lib/hub-config.mjs` | `codeBrowser` block in `HUB_CONFIG_DEFAULTS` |
| MOD | `lib/hub-lifecycle.mjs`, `lib/serve-lifecycle.mjs` | pass `--code-browser <json>` (+ serve-lifecycle tailnet `--allowed-hosts`) |
| MOD | `renderers/hub-dashboard.mjs` | `code →` affordance in `repoCard` |
| MOD | `scripts/build.mjs` | browser target (esbuild `platform:'browser'` iife + Tailwind CLI css step) |
| MOD | `.github/workflows/sdlc-build-freshness.yml`, `.githooks/pre-commit` | `view-src` trigger paths; bundle smoke check |
| MOD | `package.json` (+lock) | devDeps §0.3; append new test file to `test` script; version |
| MOD | docs (`docs/site/reference/serve.html` et al), `CHANGELOG.md`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` | Slice 4 ship chores |

---

## 1. Decision record (why this shape)

| Question | Answer | Rationale |
|---|---|---|
| Adopt the real kibo React block, or hand-roll vanilla? | **Real kibo block, bundled** | esbuild is in the toolchain and users never install — so a committed prebuilt bundle keeps the *runtime* dep-free while giving pixel-fidelity. The earlier "hand-roll vanilla" recommendation only held under a no-build constraint that no longer applies. |
| Syntax highlighter | **Shiki, fine-grained, no-WASM JS engine** | `createHighlighterCore` (`shiki/core`) + `createJavaScriptRegexEngine()` → a plain-JS bundle (no `.wasm` to inline, no esbuild WASM plugin), only the langs we choose. ([Shiki best-performance](https://shiki.style/guide/best-performance)) |
| File discovery + what's excluded | **Full working-tree walk; gitignored files ARE shown (badged); only `.git/**` + a secret denylist excluded** | Per the "display gitignored files" requirement, git is NOT the allowlist — a filesystem walk under `repoRoot` is, bounded by the containment kernel + caps. `.git/**` stays denied (plumbing, not source); a secret denylist (`.env*`, keys; default-on, configurable) prevents auto-leaking credentials over the network. Tracked-vs-ignored is computed only to *badge* nodes in the UI. See §6 — this removes the strongest defense layer, so the denylist + network gate are now load-bearing. |
| Where does the serving logic live | **Shared `lib/code-browser.mjs`**, consumed by BOTH `hub-serve.mjs` and `render-sunflower-serve.mjs` | feature works whether the hub or the per-repo fallback daemon is serving. |
| Containment root | **`entry.repoRoot`**, via a NEW kernel | the existing `lib/resolve-request-path.mjs` is deliberately rooted at `viewDir` (`.ai/_view`) and must NOT be widened — source-serving gets its own audited resolver. |

---

## 2. Architecture — two halves

```
        ┌─────────────────────────── BUILD TIME (maintainer) ───────────────────────────┐
        │  view-src/code-browser/  (vendored kibo + warm Shiki theme + app entry)        │
        │        │  esbuild (platform=browser) + tailwind CLI                            │
        │        ▼                                                                        │
        │  dist/code-browser.js  +  dist/code-browser.css   ──commit──►  git              │
        └─────────────────────────────────────────────────────────────────────────────┘
                                          │ served statically, no install
        ┌──────────────────────────── SERVE TIME (user, dep-free) ──────────────────────┐
        │  hub-serve.mjs / render-sunflower-serve.mjs                                     │
        │    GET /__sdlc/code-browser.js|.css   → stream committed bundle (shared asset) │
        │    GET /r/<id>/__code/                → server-rendered HTML shell (string)     │
        │    GET /r/<id>/__code/tree[?path=]    → JSON  ┐                                 │
        │    GET /r/<id>/__code/blob?path=      → JSON  ├─ lib/code-browser.mjs           │
        │    GET /r/<id>/__code/raw?path=       → bytes ┘   (walk · read · contain)       │
        └─────────────────────────────────────────────────────────────────────────────┘
```

- **Half A (backend)** is the real engineering: routes + a `repoRoot`-rooted containment kernel +
  gitignore allowlist + caps. Pure `node:http` + built-ins. Identical regardless of frontend.
- **Half B (frontend)** is the kibo block fed by Half-A's JSON, bundled once, committed.

---

## 3. Half A — backend file-serving

### 3.1 New shared module `lib/code-browser.mjs`

Pure built-ins (`node:fs`, `node:path`, `node:child_process`, `node:url`). Exports:

```js
// Recursively walk repoRoot's working tree (INCL. gitignored), minus `.git/` + secret denylist.
export function walkDir(repoRoot, { subPath = '', lazy = false })   // → { nodes, truncated }
// Set of repo-relative paths git WOULD ignore — used ONLY to badge nodes in the UI, never to filter.
export function gitIgnoredSet(repoRoot)             // → Set<relPath>, cached per repoRoot w/ TTL
// Resolve+validate a request path to an absolute file inside repoRoot (the kernel).
export function resolveRepoPath(repoRoot, relPath)  // → { abs } | throws ContainmentError
// Read one file with caps + kind detection.
export function readBlob(repoRoot, relPath, opts)   // → { kind, language, content?, size, truncated, rawUrl }
export function denyGlobsDefault()                  // → string[]  (`.git/**` + secret globs; configurable)
```

### 3.2 The containment kernel (`resolveRepoPath`) — the security core

Every check, in order; any failure → `ContainmentError` (caller returns 403):

1. Reject `null` byte, absolute paths, Windows drive letters / UNC, and any segment `==='..'`
   (string-level, before touching fs).
2. `abs = path.resolve(repoRoot, relPath)`; assert `abs` is under `repoRoot` (prefix check on
   `path.relative` — must not start with `..` and must not be absolute).
3. `realRoot = fs.realpathSync(repoRoot)`, `realAbs = fs.realpathSync(abs)`; assert `realAbs`
   is under `realRoot`. **This is what stops symlink escapes** (a tracked symlink pointing at
   `/etc/passwd` or `../other-repo`).
4. Assert `relPath` does not match the **denylist** (`.git/**` + secret globs), applied to every
   request regardless of git status. With gitignored files now served, this denylist is the
   **primary content gate** — the former git allowlist (layer 4) is gone — so it must stay
   conservative. See §6.

### 3.3 Discovery via filesystem walk + ignored-badging

**Gitignored files ARE displayed** (the requirement). Discovery is therefore a plain recursive
`fs.readdir(…, {withFileTypes:true})` walk of `repoRoot` — NOT `git ls-files`:

- Skip exactly two things during the walk: the `.git/` directory (always) and any path matching the
  **secret denylist** `denyGlobsDefault()` = `['.git/**', '.env', '.env.*', '*.pem', '*.key',
  'id_rsa*', '*.p12', '*.keystore']` + `codeBrowser.denyGlobs`. Everything else — including
  `node_modules/`, `dist/`, logs, generated artifacts, local config — appears in the tree.
- **Badge, don't filter, by git status:** `gitIgnoredSet(repoRoot)` runs
  `git -C <repoRoot> ls-files --others --ignored --exclude-standard -z` (the ignored set) once,
  cached with a short TTL; each node gets `ignored:true|false` so the UI can dim/tag ignored files.
  Presentation only — it never removes a node.
- **Heavy directories** make an eager whole-tree walk huge once `node_modules/` is included, so
  **`lazyTree` defaults to `true`** now: the root listing is cheap and a folder is walked only when
  expanded (`…/tree?path=`). `maxTreeEntries` still caps any single listing.
- TTL-cache `gitIgnoredSet` per `realRoot` (~5s), busted on the same fs-watch / registry-upsert
  signals the dashboards use. The walk itself is always live (no allowlist to rebuild).
- If `repoRoot` is not a git repo at request time, the walk still works; `gitIgnoredSet` is empty
  (nothing badged) rather than failing.

### 3.4 Blob reading (`readBlob`) — caps & kinds

- `kind`: sniff first 8 KB for NUL → `binary`; image extension (`.png/.jpg/.jpeg/.gif/.webp/.svg/.ico`)
  → `image`; else `text`.
- `text`: read up to `maxBlobBytes` (default **512 KB**). If file larger → `truncated:true`,
  return the head + a `rawUrl`.
- `binary`/`image`: **never** dump bytes as JSON — return metadata + `rawUrl` only.
- `language`: extension → Shiki lang id (`ts→typescript`, `tsx→tsx`, `js→javascript`, `mjs→javascript`,
  `json→json`, `md→markdown`, `css→css`, `html→html`, `sh→bash`, `py→python`, `yml/yaml→yaml`,
  `toml→toml`, `rs→rust`, `go→go`, …); unknown → `plaintext`.

### 3.5 Routes (added to both servers via a shared adapter)

In `hub-serve.mjs`, the `/r/<id>/` branch ([scripts/hub-serve.mjs:435-440](../../../scripts/hub-serve.mjs)) currently
hands everything to `serveRepoFile`. Intercept `__code` first:

```js
const m = p.match(/^\/r\/([^/]+)(\/.*)?$/);
if (m) {
  if (m[2] === undefined) { res.writeHead(301, { location:`/r/${m[1]}/` }).end(); return; }
  const id = decodeURIComponent(m[1]);
  if (m[2] === '/__code/' || m[2].startsWith('/__code/')) {
    serveCodeBrowser({ req, res, entry: entries.find(e => e.id === id), rest: m[2], url });
    return;
  }
  serveRepoFile({ req, res, id, rest: m[2] });
  return;
}
```

Shared shasset route (alongside `/__sdlc/hub-reload.js` at [scripts/hub-serve.mjs:409](../../../scripts/hub-serve.mjs)):
`GET /__sdlc/code-browser.js` and `/__sdlc/code-browser.css` → stream `dist/code-browser.*`
(read once, cache in memory; long `cache-control` keyed by plugin version).

`render-sunflower-serve.mjs` (per-repo fallback): same shared `serveCodeBrowser`, but it serves at
the repo root (no `/r/<id>/` prefix), so it matches `/__code/*` directly and derives `repoRoot` from
its view root (`repoRoot = dirname(dirname(viewDir))`, cross-checked against the registry shard).

The global `hostAllowed` DNS-rebinding gate ([scripts/hub-serve.mjs:401](../../../scripts/hub-serve.mjs)) and the
`0.0.0.0` Tailscale gate already wrap **all** routes — the new routes inherit both for free.

### 3.6 Data contracts

```jsonc
// GET /r/<id>/__code/tree            (whole tree)
// GET /r/<id>/__code/tree?path=src   (one folder, lazy mode)
{
  "id": "ab12cd34ef56", "headBranch": "main", "generatedAt": "<iso>",
  "truncated": false,                       // hit maxTreeEntries
  "nodes": [
    { "name": "node_modules", "path": "node_modules", "type": "dir", "ignored": true,  "hasChildren": true },
    { "name": "src",          "path": "src",          "type": "dir", "ignored": false, "hasChildren": true,
      "children": [ { "name": "utils.ts", "path": "src/utils.ts", "type": "file", "lang": "typescript", "ignored": false } ] }
  ]
}
// `ignored` drives the UI badge (dim + tag), not filtering. In lazyTree mode dirs carry
// `hasChildren` and omit inline `children` until expanded via …/tree?path=.

// GET /r/<id>/__code/blob?path=src/utils.ts
{
  "path": "src/utils.ts", "name": "utils.ts", "size": 1234,
  "kind": "text", "language": "typescript", "truncated": false,
  "content": "import …",
  "rawUrl": "/r/ab12cd34ef56/__code/raw?path=src%2Futils.ts"
}
// binary/image: { kind:"binary"|"image", size, rawUrl }  (no content)

// GET /r/<id>/__code/raw?path=…  → streamed bytes, content-type by ext,
//   Content-Disposition: attachment for binary, inline for image. Same kernel + caps.
```

All `path` values are repo-relative, forward-slash, validated by the kernel on every request.

---

## 4. Half B — frontend bundle (rides the esbuild rail)

### 4.1 Source workspace `view-src/code-browser/` (build-only, not served as source)

```
view-src/code-browser/
  main.tsx                 // app entry: fetch endpoints → drive kibo tree + CodeBlock
  components/code-block/    // vendored from `npx kibo-ui add code-block` (build-time)
  components/tree/          // vendored from `npx kibo-ui add codebase`/tree
  highlighter.ts            // fine-grained Shiki core, no-WASM
  theme-warm-paper.json     // custom Shiki theme mapped to the palette tokens
  styles.css                // Tailwind entry (@tailwind …) + a few token overrides
  tailwind.config.js        // theme.colors mapped to --paper/--ink/--accent (build-only)
```

`main.tsx` replaces the demo's hardcoded `fileContents` with live data: on load `GET …/__code/tree`,
feed `TreeProvider`/`TreeNode`; on select `GET …/__code/blob?path=`, feed `CodeBlock`'s `data` and
`CodeBlockContent`. The repo `id` comes from a `<meta name="sdlc-repo-id">` (the hub already injects
this in `transformServedHtml` — §0.2-1; the shell page emits it directly).

**Gitignored nodes are badged, not hidden:** a node with `ignored:true` renders its `TreeLabel`
dimmed (`--ink-3`) with a small "ignored" tag, so a glance distinguishes tracked source from
generated/local files. With `lazyTree` on, `TreeProvider` lazy-loads a folder's children from
`…/tree?path=` on expand (kibo's tree is controlled, so wire `onExpand`→fetch→merge into state).

### 4.2 Fine-grained, no-WASM Shiki (`highlighter.ts`)

```ts
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'   // ← no WASM
import warm from './theme-warm-paper.json'
export const getHighlighter = createHighlighterCore.bind(null, {
  themes: [warm],
  langs: [ import('@shikijs/langs/typescript'), import('@shikijs/langs/tsx'),
           import('@shikijs/langs/javascript'), import('@shikijs/langs/json'),
           import('@shikijs/langs/markdown'),  import('@shikijs/langs/css'),
           import('@shikijs/langs/html'),      import('@shikijs/langs/bash'),
           import('@shikijs/langs/yaml'),      import('@shikijs/langs/python') ],
  engine: createJavaScriptRegexEngine(),
})
```

`theme-warm-paper.json` maps token scopes to the palette: bg `--paper-2 #f3f1ea`, fg `--ink #1f1b16`,
comments `--ink-3 #8a8377`, keywords/strings to muted earth tones + the slate `--accent #4a6c8c`.
(This is the "warm highlight map" the design brief asks the design agent to specify.)

### 4.3 esbuild target (extend `scripts/build.mjs`)

The node-entrypoint build stays as SELF-CONTAINED-BUILD-PLAN specifies. Add a **second, browser**
target in the same `scripts/build.mjs`:

```js
// browser bundle — React + kibo + Shiki(JS engine), single IIFE, no install at runtime
await esbuild.build({
  entryPoints: ['view-src/code-browser/main.tsx'],
  bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
  loader: { '.tsx': 'tsx', '.ts': 'ts', '.json': 'json' },
  jsx: 'automatic', minify: true, sourcemap: false,
  outfile: 'dist/code-browser.js',
})
// CSS: tailwind CLI scans view-src/code-browser → dist/code-browser.css (build-only devDep)
```

- **Tailwind**: run `tailwindcss` CLI at build time (devDep), config scoped to `view-src/code-browser`,
  theme colors aliased to the palette tokens, output committed to `dist/code-browser.css`. (Alternative
  if we want zero Tailwind: replace kibo's utility classes with hand-written token CSS — more work,
  fully controlled. Decide in Slice 2; Tailwind-at-build is the default.)
- **No WASM** to handle because of the JS engine → no esbuild WASM plugin needed.
- React + react-dom bundle into the IIFE (~45 KB gz); total bundle target **< ~600 KB** with the 10
  langs above. If it grows, trim langs or split.
- Commit `dist/code-browser.js` + `.css`; add both to the `.gitignore` allow-rule next to `dist/*.mjs`.

### 4.4 Per-repo HTML shell (new renderer `renderers/code-browser-page.mjs`)

A small server-rendered string (the hub-landing pattern — no framework), returned by
`serveCodeBrowser` for `GET /r/<id>/__code/`:

```html
<!doctype html><meta name="sdlc-repo-id" content="<id>">
<link rel="stylesheet" href="/__sdlc/code-browser.css">
<div id="sdlc-code-root" data-base="/r/<id>/__code"></div>
<script src="/__sdlc/code-browser.js"></script>
```

`data-base` lets the same bundle work under the hub (`/r/<id>/__code`) and the per-repo daemon
(`/__code`). Reuse the existing topbar markup so the page reads as the same product.

### 4.5 Entry point in the UI

Add a **"Code"** link to the per-repo top bar in `renderers/_shell.mjs` (the `.b-topbar .crumb`/
`.actions` area), href relative: `__code/`. Works under both the hub (rewritten alongside the brand
href in `transformIndexHtml`) and the standalone daemon. Hub landing page (`renderers/hub-dashboard.mjs`)
optionally gets a per-repo "Code" affordance next to each slug list.

### 4.6 CSP

hub-serve serves a strict `CSP`. The bundle needs `script-src 'self'` + `style-src 'self'` only —
**no `unsafe-eval`**: Shiki's JS engine compiles grammars via the `RegExp` constructor (allowed
without `unsafe-eval`), React's production build needs none. Verify in Slice 2 with the browser
console clean. Keep `connect-src 'self'` for the fetch calls.

---

## 5. Configuration (machine-wide, `~/.sdlc/hub-config.json` via `lib/hub-config.mjs`)

```jsonc
"codeBrowser": {
  "enabled": true,            // machine-wide kill switch (mirrors perRepoServe)
  "maxBlobBytes": 524288,     // 512 KB text cap
  "maxTreeEntries": 5000,     // per-listing truncation guard
  "lazyTree": true,           // DEFAULT-ON now that ignored files (node_modules/…) are shown
  "showIgnoredBadge": true,   // dim + tag gitignored nodes (presentation only)
  "serveSecrets": false,      // ⚠ when true, drops the secret denylist so .env/keys ARE served
  "denyGlobs": []             // appended to denyGlobsDefault() (.git/** + secrets); add dirs to hide
}
```

`enabled:false` → all `__code/*` routes 404 and the topbar "Code" link is omitted. Defaults are ON
because the containment kernel + denylist + caps keep the default safe even with ignored files shown.
**`serveSecrets` defaults `false`:** gitignored files are displayed, but `.env*`/keys/certs stay
denied so credentials don't auto-leak — especially over a tailnet. Flipping it to `true` honors
"show *everything* gitignored" literally; do that only for a strictly local (`127.0.0.1`) hub.

---

## 6. Security model (the dominant concern)

Serving source is a **strictly larger perimeter** than the current `.ai/_view/` confinement — and
the "display gitignored files" requirement **removed the strongest convenience layer** (the git
allowlist). The whole working tree is now reachable, so layers 1–3 (containment) and the denylist +
caps + network gate are doing all the work. Treat this section as load-bearing, not boilerplate.

1. **String validation** — reject `..`, NUL, absolute, drive/UNC before fs access.
2. **Prefix containment** — `path.relative(repoRoot, abs)` must stay inside `repoRoot`.
3. **Realpath containment** — post-symlink-resolution check (stops symlink escapes). *More important
   now:* the walk descends into ignored dirs, so a symlink inside `node_modules/` pointing at `/`
   must not escape.
4. **Denylist (now the primary content gate)** — `.git/**` always; `.env*`/keys/certs unless
   `serveSecrets:true`. Because the git allowlist is gone, a denylist miss = an exposed file, so
   match defensively (case-insensitive, both `/` and `\`, every path segment, dotfiles).
5. **Caps** — 512 KB text cap, binary never JSON-dumped, `maxTreeEntries` per listing, `lazyTree`
   so a 200k-file `node_modules` is never walked eagerly (also a DoS guard).
6. **Network** — inherits `hostAllowed` DNS-rebinding gate + the `0.0.0.0` Tailscale ack gate
   unchanged. **Now sharper:** a tailnet-exposed hub exposes the *entire working tree* (incl.
   gitignored files) to the tailnet. Document loudly; keep behind the public-acknowledgement flag;
   strongly recommend `serveSecrets:false` whenever `host !== 127.0.0.1`.

**Run `/review security` against `lib/code-browser.mjs` before Slice 1 merges**, with explicit
attention to: the denylist matcher (the new single point of failure), symlink escape from inside
ignored dirs, and the `serveSecrets` + non-loopback-host interaction.

---

## 7. Testing

- **Unit (`tests/unit/lib/code-browser.test.mjs`)** — kernel: `../` traversal, NUL, absolute, drive,
  symlink-escape (fixture repo with a symlink inside an *ignored* dir pointing outside) all →
  ContainmentError; a gitignored file IS in the tree with `ignored:true` (shown, badged); `.env` and
  `.git/HEAD` are denied with `serveSecrets:false` and `.env` becomes servable with `serveSecrets:true`;
  `node_modules/` appears as `ignored:true` and is not eager-walked under `lazyTree`; language
  inference table; blob truncation + binary/image detection.
- **Integration** — spin `createHubServer` on an ephemeral port against a fixture git repo; assert
  `tree`/`blob`/`raw` shapes, 403 on escape attempts, 404 when `enabled:false`. Follow the
  `tests/unit/lib/multi-repo-hub.test.mjs` pattern; add to the `test` script in package.json.
- **Bundle smoke (CI)** — after `npm run build`: assert `dist/code-browser.js`/`.css` exist and are
  non-empty; optional headless load to confirm no console errors / no CSP violations.
- **Freshness** — `dist/code-browser.*` joins the existing CI `git diff --exit-code dist/` gate and
  the pre-commit rebuild hook (trigger paths += `view-src/`).

---

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Perimeter expansion leaks secrets/source** (worse: git allowlist removed) | §6 layered model + dedicated `/review security` + `serveSecrets:false` default (denies `.env`/keys) + `enabled` kill switch + tailnet warning. |
| **Gitignored `node_modules` floods the tree / DoS** | `lazyTree:true` default (never eager-walk) + `maxTreeEntries` per-listing cap + realpath symlink check inside ignored dirs. |
| Bundle size (React + Shiki + langs) | no-WASM JS engine + fine-grained langs; budget < ~600 KB; trim langs if over. |
| Tailwind adds build complexity | build-time-only devDep; or fall back to hand-written token CSS (Slice 2 decision). |
| source↔dist divergence (browser bundle) | same CI diff gate + smoke test as the node bundles. |
| Huge monorepos slow the tree walk | `maxTreeEntries` cap + `lazyTree` per-folder mode (default-on). |
| Binary/large-file DoS | streamed `raw`, 512 KB JSON cap, binary never inlined. |
| CSP regressions | verify no `unsafe-eval`; keep `script/style/connect-src 'self'`. |
| Per-repo vs hub path drift for links/assets | `data-base` attribute + shared `serveCodeBrowser`; tested under both servers. |

---

## 9. Phased checklist

- [ ] **Slice 1 — backend (JSON only, flag-gated).** `lib/code-browser.mjs` (kernel + working-tree
      walk + `gitIgnoredSet` badging + denylist + blob); `serveCodeBrowser` adapter wired into
      `hub-serve.mjs` and `render-sunflower-serve.mjs`;
      `tree`/`blob`/`raw` routes; `codeBrowser` config in `hub-config.mjs`; unit + integration tests;
      **`/review security` pass**. Ships testable behind a flag with no UI.
- [ ] **Slice 2 — build target.** `view-src/code-browser/` (vendored kibo + fine-grained Shiki +
      warm theme + Tailwind/CSS); extend `scripts/build.mjs` with the browser target; commit
      `dist/code-browser.js|.css`; `.gitignore` allow-rule; CI smoke + diff; bundle-size check.
- [ ] **Slice 3 — wire the UI.** `/__sdlc/code-browser.js|.css` static routes; `renderers/code-browser-page.mjs`
      shell at `/r/<id>/__code/`; "Code" link in `renderers/_shell.mjs` topbar (+ hub landing); CSP verify.
- [ ] **Slice 4 — config, docs, ship.** Document `codeBrowser.*` + the tailnet-exposure note in
      `docs/site/sunflower-view.md`; CHANGELOG; version bump; register any new artifact/asset types.

---

## 10. Open decisions (tuning, not forks)

1. **Shiki engine** — no-WASM JS RegExp (default; clean commit) vs Oniguruma WASM (max grammar
   fidelity, esbuild WASM plugin + bigger bundle).
2. **Tree loading** — `lazyTree` per-folder (now **default-on**, since ignored `node_modules` makes
   eager walks huge) vs whole-tree up front (simpler, only viable for small repos).
3. **Language allowlist** — which `@shikijs/langs/*` to bundle (drives size). Start with the 10 in §4.2.
4. **Tailwind at build vs hand-written token CSS** — fidelity vs zero-Tailwind. **CLOSED §0.2-9: Tailwind v4 at build** (hand-written CSS remains the named fallback).
5. **`codeBrowser.enabled` default** — ON (safe-by-defenses, discoverable) vs OFF (opt-in, conservative).
6. **`serveSecrets` default** — `false` (gitignored files shown, but `.env`/keys still denied — the
   safe reading of the requirement) vs `true` (literally *everything* gitignored, incl. secrets;
   loopback-only). Currently defaulted `false`; flip if you want true show-everything.
