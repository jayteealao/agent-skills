---
title: Sunflower view layer
description: HTML projection of .ai/workflows/ artifacts
---

# Sunflower view layer

The sunflower view is an HTML projection of every artifact in
`.ai/workflows/`. Storage stays markdown; the view layer is regenerated. You
get a calm paper-and-ink reader served by tailscale to your tailnet, with
inline-SVG figures on every canonical page.

## How it works

```
.ai/workflows/<slug>/<file>.md (+.yaml +.html.fragment)
       │
       ▼  scripts/render-sunflower.mjs
       ▼
.ai/_view/<slug>/<phase>/.../INDEX.html
```

The renderer walks `.ai/workflows/`, dispatches each artifact to its per-type
renderer under `renderers/<type>.mjs`, and writes the result into `.ai/_view/`.
A PostToolUse hook re-renders touched artifacts automatically (2s debounce).

## Quick start

```sh
# Install dependencies once
cd plugins/sdlc-workflow
npm install

# Render the view tree
node scripts/render-sunflower.mjs

# Serve over tailscale
./scripts/serve-sunflower.sh           # POSIX
./scripts/serve-sunflower.ps1          # Windows
```

Then visit `https://<host>.<tailnet>/sdlc/` for the dashboard, or any
artifact at `https://<host>.<tailnet>/sdlc/<slug>/`.

## Modes

| Flag | Behaviour |
|---|---|
| (none) | **Additive** — only artifacts with storage-mtime > view-mtime re-render. Safe default for the PostToolUse hook. |
| `--clean` | Wipe the view tree first, then full re-render. Use when changing CSS/JS and you want a guaranteed fresh build. |
| `--only <glob>` | Narrow the work-set to a glob (e.g. `feat-auth-cache/**`). The hook uses this to render a single slug. |

## Sibling files

Any artifact `.md` may have two siblings:

| Sibling | Purpose |
|---|---|
| `<artifact>.yaml` | Structured display data the renderer + figure-canvas builders consume. Validated against `siblingYamlSchemas` in `tests/frontmatter.schema.json`. |
| `<artifact>.html.fragment` | Pre-authored rich HTML body. When present, the renderer uses it verbatim instead of converting the `.md` body. |

Sibling YAML wins on key conflict during the frontmatter merge.

## Additive write contract

Sub-commands write *forward only*. Once content lands in a primary artifact,
it stays:

1. **Frontmatter is mutable.** `revision-count` increments; `updated-at` refreshes.
2. **Body is append-only.** Revisions add `## Revision <n> — <ISO>` sections;
   prior content stays.
3. **Full rewrites snapshot to `history/`** first. The renderer surfaces
   prior revisions as a collapsible `<details class="history">`.
4. **`regenerable: true`** in frontmatter opts an artifact out (e.g.,
   `RESUME.md`, sync reports). The view shows a regenerable badge.

## Fragment contract (phase 1)

A `*.html.fragment` is **one** `<section class="fragment-<name>" data-artifact="<type>">`
with no `<html>`, `<head>`, `<body>`, `<iframe>`, `<link>`, or `<script src="…">`.
Inline `<style>` and `<script>` blocks only. Every fragment dispatches
`window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: {…} }))`
on settle. The five fragment-bearing types are: `review`, `rca`, `plan`,
`design`, `ship-run`.

Validation: `node scripts/verify-fragment.mjs` (also runs as Check 7 of
`verify-router-migration.mjs`).

## Auto-render hook

The PostToolUse hook fires after `Write|Edit|MultiEdit|NotebookEdit`. It
filters to `.ai/workflows/**/*.{md,yaml,html.fragment}`, debounces 2s via
`.ai/_view/.render-pending`, and spawns a detached render in the background.
Failures land in `.ai/_view/.render-errors.log`. Exit code is always 0 so a
stale view never blocks a slash command.

### Suppression

- `CLAUDE_PLUGIN_INSTALL=1` in env (set during bulk installs).
- `touch .ai/_view/.render-suppress` (per-project pause).
- Edits inside `.ai/_view/` itself (avoids render→write loops).

## URL routing

The folder graph IS the URL graph IS the workflow state graph:

```
/sdlc/                                   → dashboard
/sdlc/<slug>/                            → slug overview
/sdlc/<slug>/plan/                       → plan-index
/sdlc/<slug>/plan/<slice-slug>/          → per-slice plan
/sdlc/<slug>/review/                     → review hero verdict
/sdlc/<slug>/review/<dimension>/         → per-dimension review
/sdlc/<slug>/ship/<run-id>/              → single ship run
/sdlc/simplify/<run-id>/                 → off-pipeline simplify
```

PR comments paste any of these and reviewers land on the exact artifact.

## Customising the design

Edit `assets/sdlc.css`. The top of the file is a token block (`--paper`,
`--ink`, `--accent`, severity pairs) — most palette tweaks live there. The
shared class catalogue is documented in the
[SUNFLOWER-VIEW-PLAN](../../SUNFLOWER-VIEW-PLAN.md) §"CSS design system".

Re-render with `node scripts/render-sunflower.mjs --clean` to pick up CSS
changes everywhere; for incremental work, the version cache-bust query string
(`?v=9.20.0`) is bumped by the plugin version.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Page renders without styles | View tree served at a path other than `/sdlc` — pass `--path /your-path` to the serve wrapper, or override `--asset-base` on the renderer. |
| `module 'ajv' not found` | `npm install` in `plugins/sdlc-workflow/`. |
| Hook fires but view stays stale | Check `.ai/_view/.render-errors.log`. Or `.render-suppress` is set. |
| `[render] no renderer for: <type>` warning | Add `renderers/<type>.mjs`. The fallback renderer still emits a usable page. |
| Fragment shows raw HTML | Check 7 of `verify-router-migration.mjs` — the fragment likely violates the gallery contract. |
