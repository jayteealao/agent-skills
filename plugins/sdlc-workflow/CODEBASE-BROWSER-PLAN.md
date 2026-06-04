# CODEBASE-BROWSER-PLAN — Serve each repo's source in an in-browser file browser

Status: **planning** · drafted 2026-06-01 · target plugin v9.4x · depends on [SELF-CONTAINED-BUILD-PLAN.md](SELF-CONTAINED-BUILD-PLAN.md)

Add a read-only **code browser** to every registered repo: a file tree + syntax-highlighted
viewer, reachable from the repo's existing top bar at `/r/<id>/__code/`. Visual shell is the
kibo-ui [Codebase block](https://www.kibo-ui.com/blocks/codebase) (`@repo/code-block` +
`@repo/tree`), reskinned to the warm-paper palette and bundled with esbuild into a **committed**
artifact so end users never `npm install` and the runtime hub stays dep-free.

This is the **first browser-target consumer** of the esbuild rail in SELF-CONTAINED-BUILD-PLAN —
it proves the browser half of the build + the CI freshness gate on a low-stakes read-only feature
before the tray bets on the same machinery.

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

In `hub-serve.mjs`, the `/r/<id>/` branch ([scripts/hub-serve.mjs:435-440](scripts/hub-serve.mjs)) currently
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

Shared shasset route (alongside `/__sdlc/hub-reload.js` at [scripts/hub-serve.mjs:409](scripts/hub-serve.mjs)):
`GET /__sdlc/code-browser.js` and `/__sdlc/code-browser.css` → stream `dist/code-browser.*`
(read once, cache in memory; long `cache-control` keyed by plugin version).

`render-sunflower-serve.mjs` (per-repo fallback): same shared `serveCodeBrowser`, but it serves at
the repo root (no `/r/<id>/` prefix), so it matches `/__code/*` directly and derives `repoRoot` from
its view root (`repoRoot = dirname(dirname(viewDir))`, cross-checked against the registry shard).

The global `hostAllowed` DNS-rebinding gate ([scripts/hub-serve.mjs:401](scripts/hub-serve.mjs)) and the
`0.0.0.0` Tailscale gate already wrap **all** routes — the new routes inherit both for free.

### 3.6 Data contracts

```jsonc
// GET /r/<id>/__code/tree            (whole tree)
// GET /r/<id>/__code/tree?path=src   (one folder, lazy mode)
{
  "id": "ab12cd34ef56", "branch": "main", "generatedAt": "<iso>",
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
this in `transformIndexHtml`; the shell page emits it directly).

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
4. **Tailwind at build vs hand-written token CSS** — fidelity vs zero-Tailwind. Default Tailwind-at-build.
5. **`codeBrowser.enabled` default** — ON (safe-by-defenses, discoverable) vs OFF (opt-in, conservative).
6. **`serveSecrets` default** — `false` (gitignored files shown, but `.env`/keys still denied — the
   safe reading of the requirement) vs `true` (literally *everything* gitignored, incl. secrets;
   loopback-only). Currently defaulted `false`; flip if you want true show-everything.
