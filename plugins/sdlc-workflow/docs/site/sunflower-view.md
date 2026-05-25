---
title: Sunflower view layer
description: HTML projection of .ai/workflows/ artifacts
---

# Sunflower view layer

The sunflower view is an HTML projection of workflow artifacts, off-pipeline
runs, and project context. Storage stays markdown; the view layer is
regenerated. You get a calm paper-and-ink reader with inline-SVG figures on
canonical pages and an optional local/Tailscale server.

## How it works

```
.ai/workflows/<slug>/<file>.md (+.yaml +.html.fragment)
.ai/simplify/<run-id>.md
.ai/profiles/<run-id>/01-profile.md
PRODUCT.md / DESIGN.md / .ai/ship-plan.md
       │
       ▼  scripts/render-sunflower.mjs
       ▼
.ai/_view/<slug>/<phase>/.../INDEX.html
```

The renderer walks `.ai/workflows/`, `.ai/simplify/`, `.ai/profiles/`, and
project context files, dispatches each artifact to its per-type renderer under
`renderers/<type>.mjs`, and writes the result into `.ai/_view/`. A PostToolUse
hook re-renders touched artifacts automatically (2s debounce), and session
start launches a detached bootstrap pass for missing/stale active workflows.

## Quick start

```sh
# Install dependencies once
cd plugins/sdlc-workflow
npm install

# Render the view tree
node scripts/render-sunflower.mjs

# Bootstrap missing/stale active workflow views
node scripts/render-sunflower.mjs --bootstrap --dry-run
node scripts/render-sunflower.mjs --bootstrap

# Serve locally (normally started by bootstrap when enabled in config)
node scripts/render-sunflower-serve.mjs --view .ai/_view --host 127.0.0.1 --port 4173
```

Then visit `http://127.0.0.1:4173/sdlc/` for the dashboard, or any artifact at
`http://127.0.0.1:4173/sdlc/<slug>/`. If `view.serve.tailscale.enabled` is set,
bootstrap can also configure Tailscale Serve/Funnel after the local server is
healthy.

## Modes

| Flag | Behaviour |
|---|---|
| (none) | **Additive** — only artifacts with storage-mtime > view-mtime re-render. Safe default for the PostToolUse hook. |
| `--clean` | Wipe the view tree first, then full re-render. Use when changing CSS/JS and you want a guaranteed fresh build. |
| `--only <glob>` | Narrow the work-set to a glob (e.g. `feat-auth-cache/**`). The hook uses this to render a single slug. |
| `--bootstrap` | Scan active workflows, project context, and docs indexes; schedule missing/stale render jobs, then ensure the serve daemon matches config. |
| `--dry-run` | With `--bootstrap`, log the exact jobs without rendering or touching serve lifecycle. |
| `--concurrency <n>` | With `--bootstrap`, cap concurrent render jobs. Defaults to `view.render.concurrency`. |
| `--include-project-context` / `--no-include-project-context` | Include or suppress `PRODUCT.md`, `DESIGN.md`, and `.ai/ship-plan.md` rendering. Default: include. |
| `--asset-base <url>` | Override the CSS / JS prefix in the rendered HTML. Defaults to `/sdlc/_assets`. Pass `/_assets` for local preview at `http://localhost:N/` (without the `/sdlc/` mount). |
| `--plugin-root <path>` | Locate plugin assets (templates, schema) when the renderer is invoked outside the plugin source tree (used by tests). |

## Sibling files

Any artifact `.md` may have two siblings:

| Sibling | Purpose |
|---|---|
| `<artifact>.yaml` | Structured display data the renderer + figure-canvas builders consume. Validated against `siblingYamlSchemas` in `tests/frontmatter.schema.json`. |
| `<artifact>.html.fragment` | Pre-authored rich HTML body. When present, the renderer shows it above the markdown body. |

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

## Fragment contract

A `*.html.fragment` is **one** `<section class="fragment-<name>" data-artifact="<type>">`
with no `<html>`, `<head>`, `<body>`, `<iframe>`, `<link>`, or `<script src="…">`.
Inline `<style>` and `<script>` blocks only. Every fragment dispatches
`window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: {…} }))`
on settle.

Eleven fragment-bearing artifact types ship across three phases:

| Phase | Type | Sibling YAML `artifact:` | Page |
|---|---|---|---|
| 1 (v9.20.0) | `review` | `review` | `/sdlc/<slug>/review/` hero verdict |
| 1 (v9.20.0) | `rca` | `rca` | augmentation incident page (with optional `five_whys`) |
| 1 (v9.20.0) | `plan` | `plan` | per-slice plan page (with optional `lanes`) |
| 1 (v9.20.0) | `design` | `design` | design artifact page (tokens table, sizes, themes/states) |
| 1 (v9.20.0) | `ship-run` | `ship-run` | per-deploy run page (stages timeline + checks + rollback) |
| 2 (v9.21.0) | `review-command` | `review-dimension` | `/sdlc/<slug>/review/<dimension>/` per-dimension page |
| 3 (v9.22.0) | `simplify-run` | `simplify-run` | `/sdlc/simplify/<run-id>/` finding-table page |
| 3 (v9.22.0) | `profile` | `profile` | `/sdlc/profiles/<run-id>/` hotspots + comparisons |
| 3 (v9.22.0) | `augmentation` (benchmark) | `benchmark` | benchmark comparison table |
| 3 (v9.22.0) | `augmentation` (experiment) | `experiment` | arm-allocation bar + guardrails |
| 3 (v9.22.0) | `augmentation` (instrument) | `instrument` | signal table + dark paths |

Each type's authoring contract — when to emit the sibling YAML, what
shape it takes, and what gets surfaced visually — lives in the
relevant `skills/wf*/reference/*.md` writer doc. Without the sibling
YAML the page falls back to a plain frontmatter card + body render.

Validation: `node scripts/verify-fragment.mjs` (also runs as Check 7 of
`verify-router-migration.mjs`).

Shared authoring rules live in `skills/wf/reference/_fragment-authoring.md`.

### Phase 2 / Phase 3 highlights

- **Per-dimension review pages.** When `07-review/<dim>.yaml` ships
  with `artifact: review-dimension`, the renderer emits a focused
  page narrowed to that dimension's findings.
- **Plan data-flow lanes.** When `04-plan.yaml` includes a `lanes:`
  block (or any edge with `kind: crosses-service`), the per-module
  file-topology figure is swapped for a swim-lane figure that visually
  separates the services the plan touches.
- **RCA 5-whys drill panel.** When `<rca-id>.yaml` includes a
  `five_whys:` block of 1–7 question/answer pairs, the renderer adds
  a collapsible drill panel under the causal-chain figure.
- **Simplify finding-table.** Off-pipeline simplify runs at
  `.ai/simplify/<run-id>.md` render with categorical chips
  (reuse/quality/efficiency) and an optional code-deltas summary.
- **Profile hotspots + benchmark comparison.** Off-pipeline profile
  runs at `.ai/profiles/<run-id>/01-profile.md` render with a
  hotspots table and (when `comparisons:` is populated) a before/after
  metric figure that auto-tones each bar from `direction:` + delta sign.
- **Augmentation subtypes.** `augmentation` artifacts dispatch on the
  sibling YAML's `artifact:` field — `benchmark`, `experiment`, and
  `instrument` each get a dedicated rich body. Unknown subtypes still
  render via the simple fallback.
- **Project context and docs index.** `PRODUCT.md`, `DESIGN.md`, and
  `.ai/ship-plan.md` render under `/sdlc/project/`; workflow extras render at
  `/announce/`, `/risk-register/`, and `/estimate/`; workflow-scoped
  `08b-docs-index.md` renders at `/docs-index/`; project/path docs runs under
  `.ai/docs/<run-id>/08b-docs-index.md` render at
  `/sdlc/docs/<run-id>/docs-index/`.

## Renderer-hosted serve

Set `.ai/sdlc-config.json`:

```json
{
  "view": {
    "serve": {
      "enabled": true,
      "host": "127.0.0.1",
      "port": 4173,
      "liveReload": true
    }
  }
}
```

Bootstrap starts `scripts/render-sunflower-serve.mjs` when enabled. The server
serves only `.ai/_view`, blocks traversal, has no directory listings, exposes
`/__sdlc/health` with `status: "ok"`, and streams `reload` SSE events from
`/__sdlc/events`. Host `0.0.0.0` is refused unless Tailscale integration is
explicitly enabled.

## Auto-render hook

The PostToolUse hook fires after `Write|Edit|MultiEdit|NotebookEdit`. It
filters to `.ai/workflows/**/*.{md,yaml,html.fragment}`,
`.ai/simplify/**/*.{md,yaml}`, `.ai/profiles/**/*.{md,yaml}`,
`.ai/docs/<run-id>/08b-docs-index.{md,yaml,html.fragment}`, `PRODUCT.md`,
`DESIGN.md`, and `.ai/ship-plan.md`,
debounces 2s via `.ai/_view/.render-pending`, and spawns a detached render
in the background. Failures land in `.ai/_view/.render-errors.log`. Exit
code is always 0 so a stale view never blocks a slash command.

### Suppression

- `CLAUDE_PLUGIN_INSTALL=1` in env (set during bulk installs).
- `touch .ai/_view/.render-suppress` (per-project pause).
- Edits inside `.ai/_view/` itself (avoids render→write loops).

## URL routing

The folder graph IS the URL graph IS the workflow state graph:

```
/sdlc/                                   → dashboard
/sdlc/<slug>/                            → slug overview (stages grid + slices preview)
/sdlc/<slug>/intake/                     → intake / shape / slice / verify / handoff / retro
/sdlc/<slug>/plan/                       → plan-index
/sdlc/<slug>/plan/<slice-slug>/          → per-slice plan (lanes figure when present)
/sdlc/<slug>/implement/<slice-slug>/     → per-slice implement
/sdlc/<slug>/verify/<slice-slug>/        → per-slice verify
/sdlc/<slug>/review/                     → review hero verdict
/sdlc/<slug>/review/<dimension>/         → per-dimension review
/sdlc/<slug>/announce/                   → workflow announcement
/sdlc/<slug>/risk-register/              → workflow risk register
/sdlc/<slug>/estimate/                   → workflow estimate
/sdlc/<slug>/docs-index/                 → docs run index
/sdlc/<slug>/ship/<run-id>/              → single ship run
/sdlc/<slug>/augmentations/<id>/         → augmentation (rca / benchmark / experiment / instrument)
/sdlc/simplify/<run-id>/                 → off-pipeline simplify
/sdlc/profiles/<run-id>/                 → off-pipeline profile
/sdlc/docs/<run-id>/docs-index/          → project/path docs run index
/sdlc/project/PRODUCT.html               → product context
/sdlc/project/DESIGN.html                → design context
/sdlc/project/ship-plan.html             → project ship plan
```

PR comments paste any of these and reviewers land on the exact artifact.

## Customising the design

Edit `assets/sdlc.css`. The top of the file is a token block (`--paper`,
`--ink`, `--accent`, severity pairs) — most palette tweaks live there. The
shared class catalogue is documented in the
[SUNFLOWER-VIEW-PLAN](../../SUNFLOWER-VIEW-PLAN.md) §"CSS design system".

Re-render with `node scripts/render-sunflower.mjs --clean` to pick up CSS
changes everywhere; for incremental work, the version cache-bust query string
(`?v=9.27.0`) is bumped by the plugin version.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Page renders without styles | View tree served at a path other than `/sdlc` — pass `--path /your-path` to the serve wrapper, or override `--asset-base` on the renderer. |
| `module 'ajv' not found` | `npm install` in `plugins/sdlc-workflow/`. |
| Hook fires but view stays stale | Check `.ai/_view/.render-errors.log`. Or `.render-suppress` is set. |
| Session start does not refresh the view | Check `.ai/_view/.bootstrap.log` and `.ai/_view/.bootstrap.pid`. Run `node scripts/render-sunflower.mjs --bootstrap --dry-run` for the planned jobs. |
| Local server does not start | Check `.ai/_view/.serve.pid`, `view.serve.enabled`, and `/__sdlc/health`. Host `0.0.0.0` requires Tailscale config. |
| `[render] no renderer for: <type>` warning | Add `renderers/<type>.mjs`. The fallback renderer still emits a usable page. |
| Fragment shows raw HTML | Check 7 of `verify-router-migration.mjs` — the fragment likely violates the gallery contract. |
