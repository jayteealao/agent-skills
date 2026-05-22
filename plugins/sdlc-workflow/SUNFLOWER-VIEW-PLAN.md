# SUNFLOWER-VIEW-PLAN

Status: proposed (revision 3 — design-handoff fidelity)
Created: 2026-05-19
Revised: 2026-05-19 (calm-reader design system, fragments promoted to phase 1, figure-canvas pattern, sibling-YAML schemas per fragment)
Target version: sdlc-workflow v9.20.0 (minor — new feature, additive)
Driver: jayteealao
Conceptual reference: Thariq Shihipar, "The Unreasonable Effectiveness of HTML" (2026-05-08)
Design handoff: `sdlc-handoff/sdlc/project/` — `sdlc-fragments-gallery.html` (primary), `sdlc-design-iterations.html` (5 canonical pages), `palette-mockup.jsx`, `design-canvas.jsx`

---

## TL;DR

Add an HTML view layer over the existing `.ai/workflows/` storage tree. Storage stays markdown (zero migration). A new renderer walks the slug tree, dispatches by artifact `type:` to per-type render modules, and emits a sunflower-shaped HTML tree under `.ai/_view/` with shared CSS/JS at the root. Tailscale serves the view. Pre-existing slugs render for free.

The view is a **calm paper-and-ink reader** — serif display headings, sandstone neutrals, severity glyphs paired with colour for deuteranope safety — with five rich inline-SVG **fragments** (review, rca, plan, design, ship-run) that the agent writes alongside the markdown. The unit of authorship doesn't change — writers still produce markdown bodies with YAML frontmatter, optionally accompanied by a sibling `.yaml` (structured display data) and a sibling `.html.fragment` (the rich body). The renderer is a pure projection from storage to view; every artifact page **must reproduce the handoff visuals 1:1**, including charts, SVG diagrams, filterable tables, copy-buttons, and the figure-canvas opener that begins each canonical page.

---

## Goals

1. **HTML view of every artifact in `.ai/workflows/`** — including pre-existing slugs authored before this plan lands.
2. **Sunflower folder shape** for the view — every node is a folder with `INDEX.html` (and optionally `INDEX.yaml` for view-tree manifest).
3. **Single shared design system** — one `sdlc.css` + one `sdlc.js` at the view-tree root, referenced absolutely by every artifact page. Calm paper-and-ink palette; serif display headings; sandstone neutrals; deuteranope-safe severity glyphs.
4. **Tailscale-servable** — URL structure mirrors folder structure; deep-links to any artifact work for any tailnet user.
5. **Schema-driven renderers** — one renderer module per `type:` value in `tests/frontmatter.schema.json`. The schema *is* the template.
6. **1:1 fidelity to the design handoff** — every page produced by the renderer matches the visual language of `sdlc-design-iterations.html` (the five canonical pages) and `sdlc-fragments-gallery.html` (the five rich fragments). Including inline-SVG figures, charts, filterable findings tables, severity heatmaps, file-change topology, swatch matrices, deploy timelines — *not* MD-converted prose with emoji severity.
7. **Required rich fragments (phase 1)** — references that own these artifact types **must** emit a sibling `*.html.fragment`: `review`, `review-command`, `rca` (under `augmentation` with `augmentation-type: rca` or the new `rca` type if promoted), `plan`, `design`, `ship-run`. The renderer prefers the fragment over MD-conversion; the contract is documented below. Other types remain MD-converted (intake, shape, slice, retro, handoff, …).
8. **Auto-derived figures** — every canonical page opens with a captioned `<figure class="figure-canvas">` containing one inline SVG diagram, derived from frontmatter + sibling YAML by the renderer (no author work). Dashboard → workflow swimlanes; slug-overview → stage stripe; plan → file-change topology; review → severity × dimension heatmap; slice-index → slice grid figure.
9. **Sibling YAML data files** — references write `<artifact>.yaml` siblings carrying structured display data the fragment + figure renderers consume (findings, timeline events, causal chain, heatmap matrix, file topology with edges, swatch matrix, ship-run stages and checks). Schemas declared in `tests/frontmatter.schema.json` so the validator can enforce them.
10. **Auto-render via PostToolUse hook** — workflow artifact writes trigger the renderer in the background. View tree stays current without an explicit `node scripts/render-sunflower.mjs` invocation.
11. **Additive renderer semantics** — re-running the renderer never wipes the view tree. Only artifacts whose storage source is newer than their view counterpart re-render. Orphans persist until an explicit `--clean` pass. Lets the view tree accumulate stable URLs even as storage churns.
12. **Additive sub-command writes** — slash-commands append revisions as new sections within their artifact files (or write history sidecars) rather than overwriting prior content. Single source-of-truth files keep their stable paths, but their *history* is preserved on-disk and renderable.

## Non-goals

- Restructuring `.ai/workflows/` storage. Storage layout is frozen.
- Changing any router dispatch reference's writing behavior in phase 1 *for new artifacts*. Additive-write semantics ship in phase 1 only as the contract; reference-file rollout phases over v9.20.x patches as each reference is audited.
- Committing `.ai/_view/` to git by default (consumer projects decide).
- Replacing markdown as the source-of-truth for frontmatter or body content.
- Producing standalone (no-server) HTML files that work without the shared assets. Tailscale serve is the assumed runtime.
- Automatic orphan cleanup during normal renders. Orphans are removed only when the user runs the renderer with `--clean`.

---

## Background

### Why HTML at all

Thariq's article argues HTML is a richer container than markdown for agent-authored documents: tables, SVG diagrams, syntax highlighting, color-coded severity, collapsible sections, copy-to-clipboard buttons, sliders, mobile-responsive layouts. Markdown's ASCII-art workarounds (emoji severity, unicode color approximations, fenced code blocks for diffs) are pale substitutes once the artifact crosses ~100 lines or carries multidimensional data.

### Why view-as-projection, not storage rewrite

Two reasons.

1. **The schema is already a template directory.** `tests/frontmatter.schema.json` defines 30+ artifact branches with explicit `required` fields. Building a parallel `templates/<kind>/` directory would duplicate this. A schema-driven renderer reuses what exists.
2. **Back-compat is free.** Consumer projects have `.ai/workflows/<slug>/` trees accumulated across plugin versions. Any storage rewrite needs a migration script and a back-compat window. A view-layer projection renders every existing slug on day one with no migration.

### Why sunflower folder shape

Every node in the view tree has the same anatomy — `INDEX.html` (presentation) optionally paired with `INDEX.yaml` (manifest). Recursive. Implement specifically fans into per-slice sub-blooms because that's where the content already naturally subdivides. The folder graph IS the URL graph IS the workflow state graph — one mental model across three layers.

### Why above-slug shared assets

Absolute-path asset refs (`/sdlc/_assets/sdlc.css`) resolve correctly at every depth. Per-slug copies would mean N copies of the design system on disk and N versions to migrate when CSS changes. Single source-of-truth at the view-tree root.

---

## Design-handoff fidelity (1:1 reproduction contract)

The renderer is not "MD-to-HTML with a stylesheet." It is the **implementation** of the designs in `sdlc-handoff/sdlc/project/`. Every artifact page must reproduce the corresponding design 1:1, including charts, figures, fragments, typography, and the inline SVGs that carry information no markdown could express.

### Source files (read these before implementing)

| File | Role |
|---|---|
| `sdlc-handoff/sdlc/README.md` | Handoff brief — declares the fragments gallery as the primary design |
| `sdlc-handoff/sdlc/project/sdlc-fragments-gallery.html` | **Primary**. Five rich fragments (07-review, 01-rca, 04-plan, 02b-design, 09-ship-run) — complete HTML + CSS + JS the renderer must reproduce |
| `sdlc-handoff/sdlc/project/sdlc-design-iterations.html` | Five canonical pages (Dashboard, Slug Overview, Plan, Review Sweep, Slice Grid) with a captioned figure on each. Variant B (`.vb`) is the chosen calm-reader design |
| `sdlc-handoff/sdlc/project/sdlc-explorations.html` + `palette-mockup.jsx` + `design-canvas.jsx` | Palette explorations + responsive frames (1440/1024/768/414/375); informs breakpoints |

### What "1:1" means

- **Visual fidelity, not file-structure copy.** Replicate the rendered output in whatever modular shape fits `renderers/`. The handoff files are inlined for portability; production code splits into `assets/sdlc.css` + per-fragment scoped blocks.
- **All inline SVGs ship as inline SVG.** Workflow swimlanes (Dashboard), stage stripe (Slug Overview), file-change topology (Plan), severity × dimension heatmap (Review), incident timeline + causal chain + heatmap grid (RCA), swatch matrix + annotated specs (Design), deploy timeline + check matrix (Ship-Run). No external images, no `<iframe>`, no fetch — the gallery is explicit on this.
- **All interactivity ships as inline vanilla JS scoped to the fragment.** Filter chips, severity checkboxes, sort dropdown, copy-as-PR-comment, `<details>` collapsibles, CSS-only `:target` event panels (RCA), `data-token-copy` (Design). No frameworks. No remote scripts.
- **All charts are deterministic projections of frontmatter + sibling YAML.** No randomisation. Re-running the renderer on the same inputs produces byte-identical SVG.

### Calm-reader design language (replaces the original dark-mode token block)

```
Paper:    #fbfaf6   (background)
Paper-2:  #f3f1ea   (subdued cards)
Paper-3:  #ebe7dc   (fragment separators)
Ink:      #1f1b16   (primary text)
Ink-2:    #4a443c   (secondary text)
Ink-3:    #8a8377   (muted, meta, captions)
Rule:     #e0dbcd   (hairline borders)
Rule-2:   #cbc4b1   (medium borders)
Accent:   #4a6c8c   (links, current-stage rings)
Accent-soft: #e9eef4 (current-stage backgrounds, accent chips)

Severity:
  Blocker  #b5305f  bg #fbeaf0  glyph ●
  High     #b94e3d  bg #fbece6  glyph ▲
  Med      #a07417  bg #fbf3df  glyph ◆
  Low      #3e7d4a  bg #ecf3e7  glyph —
  Nit      #8a8377  bg #f0ece1  glyph ·

Verdict glyphs:  ✓ ship  ◐ caveats  ✗ no
RCA event tints: alert=blocker, escalation=med, deploy=accent,
                 mitigation=#ebe1f2/#6b4a8a, resolution=low

Typography:
  Display:  Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif
  Body:     ui-sans-serif, -apple-system, system-ui, Segoe UI, Roboto
  Mono:     ui-monospace, JetBrains Mono, Menlo, Consolas
  Body size: 16px / line-height 1.6   (page bodies use 1.65)
  H1 (display): serif 30px / weight 600 / letter-spacing -0.015em
  H2 (label):   sans  11px / weight 600 / letter-spacing 0.10em / uppercase / underlined
  Metric value: serif 26–30px / weight 600 / tabular-nums
  Page title (.pg-title): serif 36px

Geometry:
  Radius: 4 / 6 / 8 / 10 px scale
  Gap:    16 px default; 24 px between major blocks
  Pad:    16–26 px artifact body; 32–64 px page body (1100 px max content)
  Mobile: column padding collapses to 20–28 px below 720 px
```

### Canonical page-level layouts

The five pages in `sdlc-design-iterations.html` are the templates for these renderers:

| Design page | Renderer module | Figure (auto-derived inline SVG) |
|---|---|---|
| 1 · Dashboard | `dashboard.mjs` | **Workflow swimlanes** — rows = projects, columns = 8 stages (intake → retro), bullet dots at completed stages, ringed accent dot at current stage, dashed line for not-yet-reached stages. Blocked projects flagged in `--blocker`. Three sections: Active, Recently shipped, Closed |
| 2 · Slug Overview | `index.mjs` | **Stage stripe** — 8 stations (intake → retro) with completion dates above and per-stage metrics below the rail (LOC touched, slices, reviews, blockers, tests). Current stage = enlarged accent ring with "← you are here" |
| 3 · Plan | `plan.mjs` | **File-change topology** — modules as dashed-border `<rect>` containers; files as rectangles tinted by role (new/modified/deleted/external); import edges as `<path>` with arrowheads; "replaces" edges dashed in blocker red |
| 4 · Review Sweep | `review.mjs` | **Severity × dimension heatmap** — rows = dimensions, columns = severities, cell tint scales with count, totals row + column, deuteranope-safe glyph row under headers |
| 5 · Slice Grid | `slice-index.mjs` | **Slice grid** — slice cards with `auto-fill, minmax(280px, 1fr)` layout, status tint, per-slice metric counts |

Each renderer opens its `<main>` content with the figure block:

```html
<figure class="figure-canvas">
  <figcaption class="figure-meta">
    <span class="figure-title"><b>Figure N</b> · {auto-derived caption}</span>
    <span class="figure-legend" aria-hidden="true"> … </span>
  </figcaption>
  <svg viewBox="…" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="…"> … </svg>
</figure>
```

Captions and legends are produced by the renderer; the SVG is built deterministically from the slug's `allArtifacts` map (dashboard, slug overview) or the artifact's frontmatter + sibling YAML (plan, review).

### Required fragments (phase 1) — promoted from the original phase 2/3

Each fragment is a self-contained `<section class="fragment-X">` matching the gallery's reference. **Phase 1 ships the renderer's fragment support AND the five authoring instructions for the five fragment-bearing artifact types.** This is the killer feature — deferring it to v9.21 contradicts the handoff README.

The five fragments and what they must contain (verbatim from the gallery — `sdlc-fragments-gallery.html`):

1. **`07-review` · `fragment-review`** — verdict block (`✓` / `◐` / `✗`), 5-cell metric row by severity, dimension chip filter (`.fr-dim-bar`, multi-select aria-pressed), severity checkbox filter + sort dropdown + visible-count badge, finding list (`<ol class="fr-findings">`) with one `<li>` per finding carrying `data-finding / data-severity / data-sev-weight / data-dimension / data-conf / data-conf-weight / data-file`, expandable `<details>` per finding with diff evidence + suggested fix + `Copy as PR comment` button. JS dispatches `sdlc:fragment-ready` with `{name, artifact, findings, rev}`.

2. **`01-rca` · `fragment-rca`** — 5-metric row (duration, time-to-detect, time-to-mitigate, user-failures, revenue impact), **horizontal SVG timeline** with `<a href="#evt-N">` wrapping coloured `<circle>` nodes (alert / escalation / deploy / mitigation / resolution), right-side `.rca-detail-panel` using CSS `:target` to swap event details, **causal-chain SVG** (4 boxes + arrows, root-cause box in `--blocker`), **severity heatmap grid** (rows = systems, columns = 30-min buckets, cells tinted s0–s3), contributing-causes + mitigations-applied callout grids. JS: hover/focus on timeline circles updates detail panel; Esc resets.

3. **`04-plan` · `fragment-plan`** — file-change topology SVG (this is also Figure 3 for the page), `files-touched` table where each path is a `<details>` with planned-change card (intent + diff sketch), 3 risk callouts (risk / warn / info), **prior-revisions block** (`<details class="pl-revs">`) listing entries from `history/`. JS: counts files and modules, dispatches `sdlc:fragment-ready`.

4. **`02b-design` · `fragment-design`** — **24-swatch matrix** (4 sizes × 3 states × 2 themes) with the live `.ck-btn` component rendering its visual states via forced classes (`.is-default` / `.is-hover` / `.is-pressed`), **token table** with per-row inline swatch / spacing bars / easing curve / numeric preview / `Copy` button (`data-token-copy`), **annotated specs SVG** with dimension lines and labels (padding-y, padding-x, gap, border-radius, height). JS: clipboard copy with `is-copied` flash.

5. **`09-ship-run` · `fragment-shiprun`** — deploy-timeline SVG (build → test → stage → canary → prod, segments tinted by status), **check matrix table** (rows = checks, columns = envs, cells `.is-pass / .is-fail / .is-flake / .is-skip / .is-running`), log-panel that expands on cell click, `.sr-actions` with `btn-primary` "Promote to 100%" and `btn-danger` "Roll back". JS: cell click reveals log; dispatches `sdlc:fragment-ready`.

### Fragment contract (reproduced from gallery, normative for phase 1)

A fragment **MUST**:

- Be one `<section class="fragment-<name>" data-artifact="<type>" [data-rev=…] [data-slice=…] [data-component=…]>` with no `<html>`, `<head>`, or `<body>` wrappers.
- Scope every new selector under `.fragment-<name>` — never define globals.
- Use the documented shared classes (`.verdict`, `.verdict-ship / -caveats / -no`, `.sev`, `.severity-*`, `.metric-row`, `.metric`, `.metric-value`, `.metric-label`, `.metric-ann`, `.status-badge`, `.stage-badge`, `.callout`, `.callout-risk / -warn / -info / -ok`, `.files-touched`, `pre.diff`, `.diff-add / -rem / -ctx`, `.btn`, `.btn-primary`, `.btn-danger`, `.sdlc-h1 / -h2 / -lede / -crumb`, `.timeline`). Do not invent globals.
- Embed an inline `<style>` block for fragment-scoped CSS and an inline `<script>` block (vanilla JS only, no fetch, no remote `<script src=…>`, no `<iframe>`) for behaviour.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: {…} }))` on script settle. Detail object always has `{ name, artifact }` plus per-fragment counts.
- Render usefully with JS disabled (filters, sorts, copy buttons degrade; static content remains readable).
- Be mobile-responsive down to 320 px (heatmaps and matrices may scroll horizontally via `overflow-x: auto`).

A fragment **MUST NOT**:

- Load remote stylesheets or scripts.
- Override the shell's topnav, breadcrumb, footer, or `data-artifact-type` attribute.
- Use emoji as the sole carrier of meaning (severity glyphs are deuteranope-safe `●▲◆—·` + colour).
- Mutate `document.body` or anything outside `root = document.currentScript.closest('.fragment-<name>')`.

### Shell integration with fragments

`assets/sdlc.js` subscribes to `sdlc:fragment-ready` events and (a) logs them to the console for debugging, (b) updates the page's `data-fragment-ready` attribute so the orchestrator's manifest pass can record which artifacts produced rich fragments vs. fallback MD. The shell does NOT mutate fragment internals — fragments own their behaviour.

---

## Architecture

### Storage layer (unchanged)

```
.ai/workflows/<slug>/
  00-index.md                    type: index
  00-index.yaml                  (optional sibling — structured slug-level metadata)
  01-intake.md                   type: intake
  01-intake.yaml                 (optional)
  02-shape.md                    type: shape
  02b-design.md                  type: design          (optional)
  02c-craft.md                   type: design-brief    (optional)
  03-slice-index.md              type: slice-index
  03-slices/<slice-slug>.md      type: slice           (one per slice)
  slices/<slice-slug>/
    04-plan.md                   type: plan
    04-plan.yaml                 (optional — structured plan data: file-table rows, step graph, risks)
    05-implement.md              type: implement
    06-verify.md                 type: verify
  04-plan-index.md               type: plan-index
  05-implement-index.md          type: implement-index
  06-verify-index.md             type: verify-index
  07-review.md                   type: review
  07-review.yaml                 (optional — finding rows, rubric scores, severity counts)
  07-review/<command>.md         type: review-command  (per dimension)
  07-review/<command>.yaml       (optional sibling per dimension)
  08-handoff.md                  type: handoff
  ship/<run-id>/
    09-ship-run.md               type: ship-run
  09-ship-runs-index.md          type: ship-runs-index
  10-retro.md                    type: retro
  RESUME.md                      type: resume          (regenerable: true — exempt from additive contract)
  augmentations/<id>.md          type: augmentation    (benchmark|experiment|instrument)
  amendments/<n>-*.md            type: shape-amendment | slice-amendment
  history/                       (NEW — additive sub-command writes archive prior versions here)
    04-plan-<rev>.md             (snapshot of slices/<slice-slug>/04-plan.md before revision <rev>)
    02-shape-<rev>.md            (etc.)

.ai/simplify/<run-id>.md         type: simplify-run    (off-pipeline)
.ai/profiles/<run-id>/
  01-profile.md                  type: profile         (off-pipeline)
```

The renderer never writes here. Storage is read-only to the view layer.

### View layer (new)

```
.ai/_view/                                      ← tailscale-served root
  INDEX.html                                    ← cross-slug dashboard
  INDEX.yaml                                    ← view-tree manifest (regenerated)
  _assets/
    sdlc.css
    sdlc.js
    icons/                                      ← inline-SVG sprite (optional)
  <slug>/
    INDEX.html                                  ← slug overview
    intake/INDEX.html
    shape/INDEX.html
    design/INDEX.html                           (only if 02-design.md exists)
    design-brief/INDEX.html                     (only if 02c-craft.md exists)
    slice/
      INDEX.html                                ← slice-index overview
      <slice-slug>/INDEX.html                   ← per-slice detail
    plan/
      INDEX.html                                ← plan-index overview
      <slice-slug>/INDEX.html                   ← per-slice plan
    implement/
      INDEX.html                                ← implement-index grid
      <slice-slug>/INDEX.html                   ← per-slice implement
    verify/
      INDEX.html
      <slice-slug>/INDEX.html
    review/
      INDEX.html                                ← review verdict + summary
      <command>/INDEX.html                      ← per-dimension findings
    handoff/INDEX.html
    ship/
      INDEX.html                                ← ship-runs-index
      <run-id>/INDEX.html
    retro/INDEX.html
    augmentations/
      <id>/INDEX.html
    amendments/
      <n>-shape/INDEX.html
      <n>-slice/INDEX.html
  simplify/<run-id>/INDEX.html                  ← off-pipeline mirror
  profiles/<run-id>/INDEX.html
```

The view layer is regenerated end-to-end on each renderer run. No incremental update logic in phase 1.

### Pipeline

```
.ai/workflows/<slug>/<file>.md  +  optional <file>.yaml  +  optional <file>.html.fragment
       │
       ▼
[ _mtime.mjs ]   compare storage mtimes to view mtime; skip if view is newer (additive)
       │
       ▼
[ _yaml.mjs ]   parse YAML frontmatter from .md AND optional sibling .yaml
                  → frontmatter = { ...mdFrontmatter, ...siblingYaml }
                  (sibling yaml wins on key conflict; documented)
       │
       ▼
[ _validator.mjs ]   validate merged frontmatter against frontmatter.schema.json
       │
       ▼
{ type, frontmatter, body, siblingYaml, fragment, path }
       │
       ▼
[ _paths.mjs ]   resolve storage-path → view-path
       │
       ▼
[ renderers/<type>.mjs ]   produce { headerHtml, bodyHtml, links, children }
                             (renderers may consume siblingYaml for structured display)
       │
       ▼
[ _markdown.mjs ]   convert body MD → HTML (unless fragment present)
       │
       ▼
[ _shell.mjs ]   wrap with head/nav/footer, link to /_assets/sdlc.css
       │
       ▼
.ai/_view/<slug>/<phase>/<...>/INDEX.html   (written only if storage newer; otherwise skipped)
```

The pipeline is purely functional — same input always produces same output. State is captured per-file via mtime comparison; orphans persist until explicit `--clean`. No shared in-memory cache between runs.

### Why this shape composes

- Adding a new artifact type means adding one file to `renderers/`. No edits to the orchestrator, no edits to existing renderers.
- Bumping the design system means editing `assets/sdlc.css`, re-running the renderer, view refreshes everywhere.
- Adding new behavior (filterable tables, copy buttons) means editing `assets/sdlc.js`. Renderers emit semantic class names; JS attaches behavior at page load.
- The orchestrator walk is type-agnostic. It loads `renderers/<type>.mjs` dynamically.

---

## Renderer module contract

### I/O signature

Every per-type renderer exports a single function:

```js
// renderers/<type>.mjs
export function render(artifact, ctx) {
  // artifact: {
  //   type: string,                 // e.g., "plan"
  //   frontmatter: object,          // merged: .md frontmatter + sibling .yaml (yaml wins on conflict)
  //   body: string,                 // markdown body, no frontmatter
  //   siblingYaml: object | null,   // parsed contents of sibling .yaml (for structured display data)
  //   history: HistoryEntry[],      // prior revisions read from history/<file>-<rev>.md (additive contract)
  //   fragment: string | null,      // optional .html.fragment sibling
  //   path: string,                 // storage path, for diagnostics
  // }
  // ctx: {
  //   slug: string,
  //   slugRoot: string,             // ".ai/workflows/<slug>/"
  //   viewRoot: string,             // ".ai/_view/<slug>/"
  //   assetBase: string,            // "/sdlc/_assets" (tailscale path prefix configurable)
  //   allArtifacts: object,         // type-indexed map of every artifact in the slug
  //   linkGraph: object,            // resolved refs: across artifacts
  //   mode: "additive" | "clean",   // renderer mode; clean wipes view first
  // }
  return {
    headerHtml: string,              // structured header (slug, status, metrics)
    bodyHtml: string,                // rich body (fragment > MD-converted body)
    links: Link[],                   // outbound links for the link-graph pass
    children: ChildEmit[],           // sub-blooms to emit (e.g., per-slice for implement-index)
  };
}
```

`children` is what makes the renderer recursive without the orchestrator special-casing implement. Any renderer can declare "also emit these sub-folders." The orchestrator drains the children queue until empty.

### Shared helpers (`renderers/_*.mjs`)

| Helper | Responsibility |
|---|---|
| `_shell.mjs` | Produce the outer HTML — `<html><head><link></head><body><nav>...</nav><main>{content}</main><footer>...</footer></body></html>`. Takes title, breadcrumbs, content, and emits the full document. |
| `_markdown.mjs` | Convert markdown body to HTML. Wraps a small library (likely `marked` or `markdown-it`) or a minimal hand-rolled subset. Must preserve code blocks with language hints for syntax highlighting. |
| `_yaml.mjs` | Parse YAML frontmatter from `.md` AND read sibling `<artifact>.yaml` file if present. Merges (sibling-yaml wins on conflict). Wraps `js-yaml`. Returns `{frontmatter, body, siblingYaml}`. |
| `_validator.mjs` | Validate merged frontmatter against `tests/frontmatter.schema.json` using a JSON-Schema validator (likely `ajv`). Returns `{valid, errors}`. Render-or-not is configurable; default is "render with warning banner." |
| `_paths.mjs` | Map storage path → view path. Examples: `00-index.md → INDEX.html`, `slices/auth-cache/04-plan.md → plan/auth-cache/INDEX.html`, `07-review/security.md → review/security/INDEX.html`. |
| `_link-graph.mjs` | Resolve cross-artifact `refs:` links to view-tree URLs. Two-pass: first pass collects every artifact's view path; second pass rewrites `refs.<role>` values. |
| `_icons.mjs` | Inline SVG icon helper. Status badges, severity glyphs, check-mark patterns. |
| `_mtime.mjs` | Compare storage-file mtimes to their view counterparts. Returns the set of artifacts needing re-render. Foundation of the additive (incremental) render mode. |
| `_history.mjs` | Walk `history/` subfolders and surface prior revisions of any artifact. Exposes `history(artifact)` returning `[{rev, snapshotPath, snapshotBody, snapshotFrontmatter}]` for renderers that want to show a revision-list. |

### Per-artifact-type renderer catalogue

| Renderer module | Maps to schema branch | View path emitted | Children emitted |
|---|---|---|---|
| `dashboard.mjs` | (synthetic — walks all `00-index.md`) | `.ai/_view/INDEX.html` | none |
| `index.mjs` | `indexFrontmatter` | `<slug>/INDEX.html` | none (links into children) |
| `intake.mjs` | `intakeFrontmatter` | `<slug>/intake/INDEX.html` | none |
| `shape.mjs` | `shapeFrontmatter` | `<slug>/shape/INDEX.html` | none |
| `design.mjs` | `designFrontmatter` | `<slug>/design/INDEX.html` | none |
| `design-brief.mjs` | `designBriefFrontmatter` | `<slug>/design-brief/INDEX.html` | none |
| `slice-index.mjs` | `sliceIndexFrontmatter` | `<slug>/slice/INDEX.html` | one per slice (delegates to `slice.mjs`) |
| `slice.mjs` | `sliceFrontmatter` | `<slug>/slice/<slice-slug>/INDEX.html` | none |
| `plan-index.mjs` | `planIndexFrontmatter` | `<slug>/plan/INDEX.html` | one per slice plan |
| `plan.mjs` | `planFrontmatter` | `<slug>/plan/<slice-slug>/INDEX.html` | none |
| `implement-index.mjs` | `implementIndexFrontmatter` | `<slug>/implement/INDEX.html` | one per slice implement (the sub-bloom expansion) |
| `implement.mjs` | `implementFrontmatter` | `<slug>/implement/<slice-slug>/INDEX.html` | none |
| `verify-index.mjs` | `verifyIndexFrontmatter` | `<slug>/verify/INDEX.html` | one per slice verify |
| `verify.mjs` | `verifyFrontmatter` | `<slug>/verify/<slice-slug>/INDEX.html` | none |
| `review.mjs` | `reviewFrontmatter` | `<slug>/review/INDEX.html` | one per review-command |
| `review-command.mjs` | `reviewCommandFrontmatter` | `<slug>/review/<command>/INDEX.html` | none |
| `handoff.mjs` | `handoffFrontmatter` | `<slug>/handoff/INDEX.html` | none |
| `ship-run.mjs` | `shipRunFrontmatter` | `<slug>/ship/<run-id>/INDEX.html` | none |
| `ship-runs-index.mjs` | `shipRunsIndexFrontmatter` | `<slug>/ship/INDEX.html` | one per ship-run |
| `retro.mjs` | `retroFrontmatter` | `<slug>/retro/INDEX.html` | none |
| `resume.mjs` | `resumeFrontmatter` | `<slug>/resume/INDEX.html` | none |
| `skip-record.mjs` | `skipRecordFrontmatter` | `<slug>/skips/<stage>/INDEX.html` | none |
| `sync-report.mjs` | `syncReportFrontmatter` | (off-pipeline; emits to `.ai/_view/sync/<slug>/INDEX.html`) | none |
| `shape-amendment.mjs` | `shapeAmendmentFrontmatter` | `<slug>/amendments/<n>-shape/INDEX.html` | none |
| `slice-amendment.mjs` | `sliceAmendmentFrontmatter` | `<slug>/amendments/<n>-slice/INDEX.html` | none |
| `simplify-run.mjs` | `simplifyRunFrontmatter` | `.ai/_view/simplify/<run-id>/INDEX.html` | none (off-pipeline) |
| `augmentation.mjs` | `augmentationFrontmatter` | `<slug>/augmentations/<id>/INDEX.html` | none; branches internally by `augmentation-type` |
| `profile.mjs` | `profileFrontmatter` | `.ai/_view/profiles/<run-id>/INDEX.html` | none (off-pipeline) |
| `design-augmentation.mjs` | `designAugmentationFrontmatter` | `<slug>/design-augmentations/<sub-command>/INDEX.html` | none |
| `ship-legacy.mjs` | `shipLegacyFrontmatter` | `<slug>/ship/legacy/INDEX.html` | none (deprecated; rendered with warning banner) |
| `critique-or-audit.mjs` | `designCritiqueOrAuditFrontmatter` | `<slug>/design/<critique\|audit>/INDEX.html` | none |

Total: 30 type-specific renderers + 7 shared helpers + 1 orchestrator.

---

## Shell template

`renderers/_shell.mjs` produces:

```html
<!DOCTYPE html>
<html lang="en" data-sdlc-version="9.20.0">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{title}} — sdlc</title>
  <link rel="stylesheet" href="{{assetBase}}/sdlc.css">
  <script src="{{assetBase}}/sdlc.js" defer></script>
  <link rel="icon" href="{{assetBase}}/favicon.svg" type="image/svg+xml">
</head>
<body class="artifact" data-artifact-type="{{type}}">
  <nav class="topnav">
    <a class="brand" href="{{assetBase}}/../">sdlc</a>
    <ol class="breadcrumb">{{breadcrumbs}}</ol>
    <span class="meta">{{slug}} · {{status}}</span>
  </nav>

  <main class="content">
    {{headerHtml}}
    {{bodyHtml}}
  </main>

  <footer class="bottom">
    <a href="{{viewPath}}/../">↑ up</a>
    <span class="updated">updated {{updatedAt}}</span>
    <a href="{{storagePath}}" class="src-link" title="storage source">md ↗</a>
  </footer>
</body>
</html>
```

Notes:
- `data-artifact-type` lets CSS target per-type styling without each renderer naming a class.
- `assetBase` is configurable (default `/sdlc/_assets`); supports projects that serve under a different path.
- The breadcrumb is computed by the orchestrator from the view path and threaded through `ctx`.
- The footer's `md ↗` link points to the storage `.md` file. Lets reviewers verify against source when needed. Useful for trust during the migration window.

---

## CSS design system

Single hand-rolled `assets/sdlc.css`, ~500 lines (grew from the original ~300 to accommodate the gallery's shared base layer + figure-canvas + page-level Variant-B `.vb` styles). No build step. Mirrors the inlined `<style>` blocks in `sdlc-fragments-gallery.html` and the `.vb` scope in `sdlc-design-iterations.html`.

### Token layer (CSS custom properties)

The full set of tokens, taken from the handoff:

```css
:root {
  /* Paper and ink — calm reader */
  --paper:   #fbfaf6;
  --paper-2: #f3f1ea;
  --paper-3: #ebe7dc;
  --ink:     #1f1b16;
  --ink-2:   #4a443c;
  --ink-3:   #8a8377;
  --rule:    #e0dbcd;
  --rule-2:  #cbc4b1;

  --accent:      #4a6c8c;
  --accent-soft: #e9eef4;

  /* Severity (with paired chip background) */
  --blocker:    #b5305f;  --blocker-bg: #fbeaf0;
  --high:       #b94e3d;  --high-bg:    #fbece6;
  --med:        #a07417;  --med-bg:     #fbf3df;
  --low:        #3e7d4a;  --low-bg:     #ecf3e7;
  --nit:        #8a8377;  --nit-bg:     #f0ece1;

  --sev-blocker: var(--blocker);
  --sev-high:    var(--high);
  --sev-med:     var(--med);
  --sev-low:     var(--low);
  --sev-nit:     var(--nit);

  /* Typography */
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Source Serif Pro", serif;
  --sans:  ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
  --mono:  ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace;

  /* Geometry */
  --rad-sm: 4px;
  --rad-md: 6px;
  --rad-lg: 8px;
  --gap:    16px;
  --pad:    16px;
}

html, body { margin: 0; padding: 0; }
body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
```

### Shared class catalogue (taken from the handoff)

Renderers and fragments emit these classes; `assets/sdlc.css` owns the visual treatment. These are the ONLY classes a fragment may reference outside its own scoped selectors.

| Class | Purpose / consumer |
|---|---|
| `.sdlc-h1 / .sdlc-h2 / .sdlc-lede / .sdlc-crumb` | Display headings, label headings, lede paragraph, monospace crumb path |
| `.verdict` + `.verdict-ship / -caveats / -no` | Hero verdict block (review). Glyphs `✓ ◐ ✗` via `::before`. `.v-label / .v-text / .v-sum` children |
| `.sev` + `.severity-blocker / -high / -med / -low / -nit` | Severity chip with paired glyph + colour |
| `.callout` + `.callout-risk / -warn / -info / -ok` | Coloured aside; `.callout-hd` header inside |
| `.metric-row` + `.metric` + `.metric-label` + `.metric-value` + `.metric-ann` | Hairline-bordered metric row used everywhere |
| `.status-badge` + `.is-ok / -warn / -bad / -skip` | Header status chip (active/complete/blocked/skipped) |
| `.stage-badge` | Lowercase mono pill for stage (intake/shape/plan/...) |
| `.files-touched` + per-row `.role` + `.is-new / -modified / -deleted` | File-changes table |
| `pre.diff` + `.diff-add / .diff-rem / .diff-ctx` | Coloured diff blocks (`+`/`−`/space prefixes via `::before`) |
| `.btn` + `.btn-primary` + `.btn-danger` | Utility buttons (pill, 14px radius) |
| `.timeline` | Base mark for SVG timelines (RCA, ship-run, stage stripe) |
| `.figure-canvas` + `.figure-meta` + `.figure-title` + `.figure-legend` + `.figure-legend .sw` | Page-opening figure pattern; one captioned inline-SVG per canonical page |
| `.warn-banner` | Top-of-page schema-fail or deprecation banner |
| `.fragment-<name>` | Scope class for each rich fragment (see fragment contract above) |
| `.slice-grid` + `.slice-card` | Slice-index grid (`auto-fill, minmax(280px, 1fr)`) |
| `.project-list` + `.project-row` + `.stage-pill` | Dashboard project list rows |
| `.so-grid` + `.so-rail` + `.activity` | Slug-overview two-column layout + recent-activity feed |
| `.stage-stripe` + `.stage-stripe .seg.done/.cur` | (CSS variant) horizontal stage stripe; the SVG variant is preferred but `.stage-stripe` is kept for fallback paths |
| `.frontmatter-card` (`<dl>`) | Compact key-value card for plan/shape/intake headers |
| `.ac-list` + `.chk.done / .todo / .fail` | Acceptance-criteria checklist (plan / verify) |
| `details.revisions` | Collapsible prior-revisions block fed by `history/` |

Fragments add their own scoped classes (`.fr-*` for review, `.rca-*` for rca, `.pl-*` for plan, `.dz-*` and `.ck-*` for design, `.sr-*` for ship-run). The orchestrator's CSS does NOT define these — they live inline within the fragment's `<style>` block, exactly as in the gallery.

### Layout primitives

```css
.content       { max-width: 1100px; margin: 0 auto; padding: 56px 64px; }
.figure-canvas { background: var(--paper); border: 1px solid var(--rule);
                 border-radius: var(--rad-lg); padding: 22px 26px; margin: 16px 0 24px; }
.slice-grid    { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
.metric-row    { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                 border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }

@media (max-width: 880px) {
  .content   { padding: 40px 28px; }
  .so-grid   { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .content   { padding: 32px 20px; }
}
```

Mobile-responsive down to 320 px. Heatmaps and matrices use `overflow-x: auto` and a `min-width` on the inner grid so they scroll horizontally rather than reflowing into illegibility.

---

## JS interactions

Single hand-rolled `assets/sdlc.js`, ~200 lines. No framework, no build step. Two responsibilities:

1. **Shell-level behaviours** (page-wide, attached on `DOMContentLoaded`).
2. **Fragment event subscription** — listen for `sdlc:fragment-ready` and update `data-fragment-ready="<name>"` on `<body>` so manifest tooling can detect which artifacts shipped a rich fragment vs. fell back to MD.

| Behavior | Trigger | What it does |
|---|---|---|
| Fragment ready log | `window.addEventListener('sdlc:fragment-ready', …)` | Logs to console; sets `body.dataset.fragmentReady` |
| Collapsibles | `<details>` native | Browser-native; CSS hides default marker, replaces with chevron rotation |
| Copy-to-clipboard (shell) | `.copy-btn[data-copy-target]` | Reads target's `textContent` or `data-copy-value`; writes to clipboard; flashes "copied" affordance |
| Anchor smooth-scroll | `a[href^="#"]` | One-line smooth scroll; never used inside RCA timeline (that uses raw `:target`) |
| Raw-source toggle (gallery only — out of phase 1 view) | `.gw-raw` | Carried in the gallery for the handoff; not shipped in the rendered view tree |

Fragment-local behaviours (severity filter, dimension chip filter, sort dropdown, copy-as-PR-comment, token-copy, RCA hover details, ship-run cell-click log expand) live **inside each fragment's own `<script>` block**, scoped to `document.currentScript.closest('.fragment-<name>')`. This is the gallery's pattern — keeping each fragment independently authored, testable, and snapshot-comparable.

JS is enhancement only. Every page renders usefully with JS disabled: `<details>` open natively, severity colours and glyphs survive, copy buttons become no-ops, CSS-only `:target` switching keeps RCA event details navigable.

---

## Orchestrator algorithm

`scripts/render-sunflower.mjs`. Single entry point. Default mode is **additive**.

```
1. resolve config
   - storageRoot: --storage or ".ai/workflows"
   - viewRoot:    --view or ".ai/_view"
   - assetBase:   --asset-base or "/sdlc/_assets"
   - mode:        --clean → "clean" | default → "additive"
   - --only <glob>: optional storage-path filter (used by the PostToolUse hook
                    to render just the touched artifact tree quickly)
   - simplifyRoot, profilesRoot

2. ensure viewRoot exists
   - mkdir -p viewRoot
   - if mode === "clean": rm -rf viewRoot/<every-slug-folder> first (keep _assets/)
   - additive mode never deletes view files

3. copy assets (always — cheap, ensures latest CSS/JS)
   - cp -r plugin/assets/ → viewRoot/_assets/
   - append ?v=<plugin-version> query string in shell so browsers re-fetch on bump

4. walk storage
   - glob storageRoot/*/*.{md,yaml,html.fragment} and storageRoot/*/slices/**/*.{md,yaml,html.fragment}
   - also glob storageRoot/*/07-review/*.{md,yaml,html.fragment}, storageRoot/*/ship/*/*.{md,yaml,html.fragment},
     storageRoot/*/augmentations/*.{md,yaml,html.fragment}, storageRoot/*/amendments/*.{md,yaml,html.fragment},
     storageRoot/*/history/*.md
   - off-pipeline: glob .ai/simplify/*.{md,yaml}, .ai/profiles/*/*.{md,yaml}
   - for each .md path, look for sibling .yaml and .html.fragment
   - parse each: { frontmatter (merged), body, siblingYaml, fragment, history[] }
   - validate against schema (warn on failure but still render)
   - bucket by slug; build per-slug allArtifacts map

5. compute work set (additive mode)
   - for each artifact, find its view path via _paths.mjs
   - if --clean: work-set = every artifact
   - if --only <glob>: work-set = artifacts matching glob
   - else (additive default): work-set = artifacts where
     max(mtime(.md), mtime(.yaml), mtime(.html.fragment)) > mtime(viewPath)
   - artifacts not in work-set are skipped; their existing HTML stays untouched

6. link-graph pass 1
   - build pathMap: { storagePath → viewPath } across ALL artifacts (not just work-set —
     because dirty artifacts may link to clean ones and need fresh URLs)

7. link-graph pass 2
   - rewrite refs: values in each work-set artifact's frontmatter to view-tree URLs

8. render pass (work-set only)
   - for each slug with dirty artifacts:
     - load renderers/<type>.mjs, call render(artifact, ctx)
     - drain children queue (sub-blooms — sub-bloom dirtiness inherits from parent)
   - write each result via _shell.mjs to its view path
   - additive mode: never touch view files outside work-set

9. dashboard pass
   - call dashboard.mjs with summary of ALL slugs (the dashboard always re-renders
     because at least one of its inputs may be in the work-set; cost is one file)
   - write viewRoot/INDEX.html

10. manifest pass
    - read existing viewRoot/INDEX.yaml if present
    - update only slugs whose artifacts changed; preserve entries for unchanged slugs
    - emit viewRoot/INDEX.yaml with: { version, generated-at, slugs: [...] }

11. report
    - print summary: N slugs touched, M artifacts re-rendered, K skipped,
      X schema failures, Y missing renderers, Z orphans detected
    - orphans = view files whose storage source no longer exists; reported but not deleted
      unless --clean (in which case they're already gone)
```

**Additive guarantees**:
- A view file is never deleted unless `--clean` is passed.
- A view file is never overwritten unless its storage source changed (mtime-newer).
- Concurrent renders are safe: the PostToolUse hook can fire while a manual render is in progress without corrupting partial output, because writes are file-scoped (no global temp directory swap).

Estimated runtime: full-render of ~10 slugs × ~10 artifacts = 100 files in under 2 seconds. Additive incremental render of one artifact (the common PostToolUse case) in under 100ms.

---

## URL routing under tailscale

```
tailscale serve --bg --https=443 --set-path=/sdlc <project>/.ai/_view
```

Then:

```
https://<host>.<tailnet>/sdlc/                                   → dashboard
https://<host>.<tailnet>/sdlc/<slug>/                            → slug overview
https://<host>.<tailnet>/sdlc/<slug>/plan/                       → plan-index
https://<host>.<tailnet>/sdlc/<slug>/plan/<slice-slug>/          → per-slice plan
https://<host>.<tailnet>/sdlc/<slug>/implement/<slice-slug>/     → per-slice implement (sub-bloom)
https://<host>.<tailnet>/sdlc/<slug>/review/                     → review hero verdict
https://<host>.<tailnet>/sdlc/<slug>/review/security/            → review-command per dimension
https://<host>.<tailnet>/sdlc/simplify/<run-id>/                 → off-pipeline simplify
```

PR comments paste any of these URLs and reviewers land on the exact artifact.

`scripts/serve-sunflower.ps1` (Windows) and `scripts/serve-sunflower.sh` (POSIX) wrap the tailscale invocation; both accept `--root <path>` and `--port`.

---

## PostToolUse hook — auto-render on workflow artifact writes

The hook closes the gap between "artifact written" and "view updated." Defined in `plugins/sdlc-workflow/hooks/render-sunflower.json` (registered via plugin's `hooks/` directory, which Claude Code reads on plugin load).

### Trigger contract

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/render-on-artifact-write.mjs\"",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

The hook script `hooks/render-on-artifact-write.mjs`:

1. **Reads the tool input** from stdin (Claude Code passes `{tool_name, tool_input, tool_response, cwd, ...}` as JSON).
2. **Filters by path**: only proceed if the written path matches `**/.ai/workflows/**/*.{md,yaml,html.fragment}` or `**/.ai/simplify/**/*.{md,yaml}` or `**/.ai/profiles/**/*.{md,yaml}`. Bail silently otherwise.
3. **Debounces**: writes a touch-file at `<cwd>/.ai/_view/.render-pending`. Spawns a detached child that sleeps 2 seconds, then checks if the touch-file is still the same age. If newer writes arrived, re-debounce; if quiet, proceed to render.
4. **Renders incrementally**: invokes `node scripts/render-sunflower.mjs --only "<changed-slug-glob>" --root "<cwd>/.ai/_view"`. Additive mode by default, so only the dirty artifact (and its dashboards) re-render.
5. **Reports via exit code 0 always** (hooks blocking the slash-command on render failure would be worse than a stale view). On error, write to `.ai/_view/.render-errors.log`.

### Why detached + debounce

A single `/wf plan` invocation can write 5–10 artifact files in close succession (plan + per-slice + index). Without debounce, the hook would fire 10 renders. Debounce coalesces them into one. Detaching means the slash-command returns immediately; the render proceeds in the background.

### When the hook is suppressed

- During plugin installation/update (`CLAUDE_PLUGIN_INSTALL=1` env var set): hooks are noisy during bulk extraction.
- When `.ai/_view/.render-suppress` exists: lets the user pause auto-rendering during work-in-progress edits.
- When the touched file is *inside* `.ai/_view/` itself: avoid render → write → re-render loops.

### Why this is safe with additive renders

Because the render is additive, even if two hook invocations race (one for `04-plan.md`, one for `04-plan.yaml`), each only writes its own view files. No global state, no temp-dir swap, no all-or-nothing transaction.

---

## Additive write semantics for sub-commands

Sub-commands write *forward only*. Once content lands in a primary artifact, it stays. New work appends a section; rewrites become a sidecar history file.

### The rules

1. **Frontmatter is mutable at the top of the file.** It's a single block by schema constraint; revisions update it in place. `revision-count` increments. `updated-at` refreshes.
2. **Body content is append-only** for revisions. The first write produces the full body under `## Initial — <ISO date>` (or no heading if the schema discourages it for that type). Each subsequent revision adds a `## Revision <n> — <ISO date>` section listing what changed and why, plus any new content. Prior revision sections are not edited.
3. **Full rewrites snapshot to `history/`.** When a reference *must* rewrite a body (e.g., because the structure changed incompatibly), it first copies the current file to `<slug>/history/<basename>-<rev>.md` (or `slices/<slice>/history/<basename>-<rev>.md` for per-slice files). Then it writes the new body.
4. **`regenerable: true` opt-out.** Artifacts that are conceptually views over other state (`RESUME.md`, slug-level index files when explicitly regenerated, sync reports) carry `regenerable: true` in frontmatter. References may overwrite them freely. Renderer surfaces them with a "regenerated" badge.
5. **`.yaml` siblings follow the same rules.** Schema-bound sibling YAML files are append-only at the array level (e.g., `findings: []` grows; existing rows aren't edited). Top-level scalars (e.g., `verdict`) update in place. Per-revision YAML diffs land in `history/<basename>-<rev>.yaml` on full rewrites.
6. **Amendments stay separate.** Existing `amendments/<n>-shape.md`, `amendments/<n>-slice.md` files are already additive by design (each amendment is a new file). No change needed.

### What references must do

Every reference file under `skills/*/reference/<sub-command>.md` whose write-step touches a primary `.md` (or new `.yaml`) gains a line in its instructions:

> Before rewriting any primary artifact body, first copy the existing file to `<slug>/history/<basename>-<rev>.md`. Bump `revision-count` in frontmatter. Append a `## Revision <revision-count> — <ISO timestamp>` section rather than rewriting earlier body content. Exception: if the artifact carries `regenerable: true`, overwrite freely.

This is a phased rollout — adding the instruction to every reference at once would inflate the v9.20.0 changeset. **Phase plan**: v9.20.0 ships the *contract* (this section, the renderer's understanding of `history/` + `regenerable:`, the schema additions); v9.20.1 audits and updates `/wf plan`, `/wf shape`, `/wf-quick rca`, `/review` references; v9.20.2 covers the rest.

### Why this is worth the friction

Two reasons. First: planning artifacts in particular benefit from a visible revision history — readers can see *why* a plan changed, not just the latest state. Second: it makes the renderer's history-list UI a first-class output instead of an after-thought. The schema-level addition is small (a `regenerable` boolean), and the runtime cost is one extra file copy per rewrite.

### Schema additions

`tests/frontmatter.schema.json` gains:

- `regenerable: boolean` (optional, defaults to false) on every `*Frontmatter` branch that the additive contract covers.
- `revision-count` becomes required on all revisable types (`plan`, `shape`, `slice`, `design`, `review`, etc.). It's already declared optional on most; promote it.

### History rendering

Renderers consume `artifact.history` (the array of prior revision snapshots loaded by `_history.mjs`) and surface them as a collapsible at the bottom of the page:

```
<details class="history">
  <summary>3 prior revisions</summary>
  <ol>
    <li><a href="?rev=3">Rev 3 — 2026-05-18 14:22</a></li>
    <li><a href="?rev=2">Rev 2 — 2026-05-17 09:01</a></li>
    <li><a href="?rev=1">Rev 1 — 2026-05-15 16:45</a></li>
  </ol>
</details>
```

Each prior revision is rendered to a permanent `<artifact-path>/history/<rev>/INDEX.html` URL — old revisions never disappear from the view tree.

---

## Back-compat

### Implicit by design

Storage doesn't change. Existing slugs render on first orchestrator invocation.

### Edge cases the renderer must handle

| Case | Handling |
|---|---|
| Artifact with no frontmatter | Render with `warn-banner` and treat body as raw markdown; `_yaml.mjs` returns `{frontmatter: null, body: wholeFile}`. |
| Frontmatter fails schema validation | Render with `warn-banner` listing schema errors; still emit best-effort HTML. Do not abort. |
| `type:` value with no matching renderer | Log warning; emit a generic "unknown artifact type" page with frontmatter as a `<dl>` and body as MD-converted HTML. |
| Deprecated artifact type (e.g., `shipLegacyFrontmatter`) | Renderer exists (`ship-legacy.mjs`) and adds a deprecation banner: "this artifact type predates v9.2.0; consider re-running /wf ship." |
| Slug missing `00-index.md` | Render whatever artifacts exist; slug overview page is auto-synthesized from artifact list. Banner: "no index file; this slug is in an incomplete state." |
| Two artifacts claim the same view path | Conflict log; first wins, second renders with `warn-banner` "shadowed by <other>." |
| `refs:` pointing to non-existent files | Link rendered with `.broken-link` class; tooltip explains the missing artifact. |
| Slice subfolder with no slice-index | Render slices but slug overview falls back to "loose slices found." |

### Validation step

New verifier check in `scripts/verify-router-migration.mjs` — call it Check 5:

```
5. view-tree freshness (warning-only)
   - if .ai/_view exists and any storage MD is newer than its view HTML, warn:
     "view tree is stale; run scripts/render-sunflower.mjs"
   - this never fails CI; it's a hint
```

And Check 6 (renderer-coverage):

```
6. renderer-coverage
   - for every artifact `type:` value emitted by any storage file,
     confirm renderers/<type>.mjs exists.
   - missing renderer = warning (still rendered via fallback).
```

---

## Required `.html.fragment` (phase 1)

The five fragment-bearing artifact types **must** ship a sibling `*.html.fragment` in phase 1; this is the handoff's primary deliverable.

```
.ai/workflows/<slug>/07-review.md            ← required, source-of-truth
.ai/workflows/<slug>/07-review.yaml          ← required, structured display data
.ai/workflows/<slug>/07-review.html.fragment ← required, rich HTML body

.ai/workflows/<slug>/slices/<slice>/04-plan.md             ← required
.ai/workflows/<slug>/slices/<slice>/04-plan.yaml           ← required
.ai/workflows/<slug>/slices/<slice>/04-plan.html.fragment  ← required

.ai/workflows/<slug>/02b-design.md            ← required (when design artifact exists)
.ai/workflows/<slug>/02b-design.yaml          ← required
.ai/workflows/<slug>/02b-design.html.fragment ← required

.ai/workflows/<slug>/ship/<run-id>/09-ship-run.md            ← required
.ai/workflows/<slug>/ship/<run-id>/09-ship-run.yaml          ← required
.ai/workflows/<slug>/ship/<run-id>/09-ship-run.html.fragment ← required

.ai/workflows/<slug>/augmentations/<rca-id>.md            ← required for rca-type augmentations
.ai/workflows/<slug>/augmentations/<rca-id>.yaml          ← required
.ai/workflows/<slug>/augmentations/<rca-id>.html.fragment ← required
```

For all other artifact types (intake, shape, slice, retro, handoff, sync-report, amendments, skip-records, etc.) the fragment remains optional and the MD-conversion path is the default.

### Renderer precedence

```
if fragment exists:
  validate fragment (must be one <section class="fragment-X">, no remote scripts/styles)
  → bodyHtml = sanitised fragment
else if siblingYaml exists AND renderer has a yaml-driven figure path:
  → bodyHtml = renderer-built figure HTML + MD-converted body
else:
  → bodyHtml = MD-converted body only
```

### Phase 1 reference rollout (NEW — moved up from phase 2/3)

The five fragment-bearing references gain a "Fragment author step" in their write-step:

- `/review sweep` and each `skills/review/reference/<dimension>.md` → writes `07-review.html.fragment` and per-dimension fragment files matching the gallery's review fragment.
- `/wf plan` → writes `<slice>/04-plan.html.fragment` per slice.
- `/wf-design` → writes `02b-design.html.fragment`.
- `/wf ship` → writes `ship/<run-id>/09-ship-run.html.fragment`.
- `/wf-quick rca` (or whichever sub-command produces the rca augmentation) → writes `<rca-id>.html.fragment`.

Each reference gets a documented prompt block: "Build a `<section class="fragment-<name>">` exactly matching the structure in `sdlc-fragments-gallery.html`'s fragment-N. The sibling .yaml has been written with these fields: { … }. Inline all CSS scoped under `.fragment-<name>`, inline all JS scoped via `document.currentScript.closest('.fragment-<name>')`, dispatch `sdlc:fragment-ready`. No remote anything."

### Fragment validation

`scripts/verify-fragment.mjs` (new) checks each `*.html.fragment`:

- One top-level `<section class="fragment-…">` element.
- No `<html>`, `<head>`, `<body>`, `<iframe>`, `<link>`, or `<script src=…>` tags.
- All `<script>` blocks are inline.
- `sdlc:fragment-ready` event present.
- All `.severity-*` and `.verdict-*` references use the documented set.
- No emoji as sole carrier of meaning in severity / verdict positions (paired glyph present).

Run in `verify-router-migration.mjs` as Check 7 (was originally proposed for phase 2; promoted to phase 1).

---

## Verifier additions

`scripts/verify-router-migration.mjs` already has Check 1–4 (router metadata, schema validation, references, models). Adding:

- **Check 5: view-tree freshness** (warn-only) — warns when storage is newer than view.
- **Check 6: renderer coverage** (warn-only) — warns when an artifact `type:` lacks a matching `renderers/<type>.mjs`.
- **Check 7: fragment validity** (**error**, phase 1) — for every required `*.html.fragment` (review, plan, design, ship-run, rca):
  - Must parse as valid HTML5.
  - Must contain exactly one top-level `<section class="fragment-<name>">` matching the expected name.
  - No `<html>`, `<head>`, `<body>`, `<iframe>`, `<link>`, or `<script src=…>` tags.
  - `sdlc:fragment-ready` event dispatch present.
  - Only documented shared classes used outside the `.fragment-<name>` scope.
  - Sibling `.yaml` is present and validates against the per-fragment YAML schema (see Appendix C).
- **Check 8: figure renderability** (warn-only) — for every page that opens with a `<figure class="figure-canvas">`, validate that the inputs needed to derive its SVG exist in `allArtifacts` or the artifact's sibling YAML.

---

## Rollout phases

### Phase 1 (v9.20.0) — renderer + view tree + auto-render hook + additive contract + **all five fragments**

- Add `renderers/` directory with all 30 type modules + 9 helpers (added `_mtime.mjs`, `_history.mjs`).
- Add `assets/sdlc.css` (~500 lines, calm-reader palette per handoff) + `sdlc.js` (~200 lines, shell + `sdlc:fragment-ready` subscription).
- Add `scripts/render-sunflower.mjs` orchestrator (additive default, `--clean`, `--only` modes).
- Add `scripts/serve-sunflower.{ps1,sh}` wrappers.
- Add `hooks/render-sunflower.json` + `hooks/render-on-artifact-write.mjs` (PostToolUse hook).
- Schema additions: `regenerable: boolean`, promote `revision-count` to required on revisable types, **new sibling-YAML schemas** for review / rca / plan / design / ship-run (see Appendix C).
- **Promoted into phase 1**: all five rich fragments (review, rca, plan, design, ship-run) — references rewritten to author them, renderer to consume them, verifier (Check 7) to validate them.
- **Promoted into phase 1**: page-level figure-canvas renderers — dashboard swimlanes, slug-overview stage stripe, plan topology, review heatmap, slice grid.
- Add verifier Check 5–7 (5–6 warning-only; 7 error-on-fragment-invalid).
- Documentation: `docs/site/sunflower-view.md` user guide (covers hook, additive contract, sibling YAML, fragment authoring).
- Reference rewrites in this release: `/review sweep` + each `skills/review/reference/<dimension>.md`, `/wf plan`, `/wf-design`, `/wf ship`, `/wf-quick rca`. The additive sub-command contract is *declared* in the renderer; full additive-write rollover to non-fragment references phases over v9.20.1+ patches.
- **Outcome**: any consumer project gets a calm-reader HTML view that auto-updates on artifact writes; the five fragment-bearing artifact types render Thariq-class rich pages on day one; existing slugs render immediately with no migration.

### Phase 1.x — additive sub-command rollout (v9.20.1, v9.20.2)

- v9.20.1: update revisable references (`/wf shape`, `/wf slice`) to the additive contract (snapshot to `history/`, append `## Revision <n>` sections, bump `revision-count`); **also ships the `components/` snippet helper described in Phase 1.5 below** and refactors the five fragment-author references to use `@include` tokens.
- v9.20.2: cover the remaining revisable references (`/wf intake`, `/wf-quick simplify`, `/wf retro`, `/wf handoff`, sync-report regen).
- Each patch is a small, isolated change to one or two reference files — easy to ship incrementally.

### Phase 1.5 — `components/` snippet helper (v9.20.1)

The five fragment-bearing references each emit a `<section class="fragment-…">` of roughly 200–500 lines, and they overlap significantly: every one carries a `.metric-row` of 5 cells; review / plan / rca all use the same `.callout` shape; every fragment dispatches `sdlc:fragment-ready` with the same boilerplate. Without dedupe, every reference holds its own copy of these substrings — five files re-author the same `.metric-row` markup. Drift becomes inevitable; one update to the callout chip shape requires editing five reference docs.

MDX would solve this with imported components. v9.20.0 rejects MDX (see Risks & open questions #4). Phase 1.5 ships the cheap middle-ground: a `components/` directory of HTML snippets, expanded by the renderer at render-time via a documented include token. No build step, no JSX, no AST — just text substitution scoped to the fragment expansion path.

#### Directory layout

```
plugins/sdlc-workflow/
  components/
    _components.mjs              ← single entry point: expand(html, scope, data) → html
    metric-row.html.snippet      ← 5-cell metric row; data = { metrics: [...] }
    callout.html.snippet         ← .callout-{risk|warn|info|ok}; data = { kind, title, body }
    verdict.html.snippet         ← .verdict-{ship|caveats|no}; data = { kind, label, summary }
    severity-chip.html.snippet   ← .sev .severity-X; data = { sev, count? }
    fragment-ready.html.snippet  ← inline <script> that dispatches sdlc:fragment-ready
    files-touched-row.html.snippet
    diff-block.html.snippet      ← <pre class="diff"> with diff-{add|rem|ctx} lines
```

Each snippet is plain HTML with `{{token}}` placeholders. Snippets MAY include other snippets. Snippets MUST NOT introduce scripts that depend on context outside the snippet.

#### Include syntax (inside `*.html.fragment`)

The fragment uses HTML-comment include directives. Comments are chosen so that an unaware editor displays them as comments (no broken rendering during authoring), and so that the include vocabulary doesn't collide with markdown-it's autolink / inline-HTML rules.

```html
<section class="fragment-review" data-artifact="review" data-rev="2">
  <!-- @include verdict { "kind": "caveats", "label": "Caveats — 2 high", "summary": "..." } -->

  <!-- @include metric-row { "metrics": [
    { "label": "Blocker", "value": 0, "sev": "blocker" },
    { "label": "High",    "value": 2, "sev": "high" },
    { "label": "Med",     "value": 4, "sev": "med" },
    { "label": "Low",     "value": 7, "sev": "low" },
    { "label": "Nit",     "value": 5, "sev": "nit" }
  ] } -->

  <!-- ... rest of fragment ... -->

  <!-- @include fragment-ready { "name": "review", "artifact": "review",
                                  "counts": { "findings": 18 } } -->
</section>
```

The `@include` token carries a snippet name and a JSON payload. Payloads are scoped — they never see the surrounding fragment's variables. Nested includes inside snippet bodies work the same way; the expander runs to fixed point.

#### Expander contract (`components/_components.mjs`)

```js
// components/_components.mjs
export function expand(html, ctx) {
  // html: raw fragment HTML (post-validation, pre-shell-wrap)
  // ctx:  { componentsRoot, maxDepth: 4 }
  //
  // Replaces every `<!-- @include <name> <json> -->` with the corresponding
  // snippet content, substituting {{token}} placeholders from the json payload.
  // Runs to fixed point (snippets may include other snippets) bounded by maxDepth.
  // Throws if a snippet is missing, a payload is invalid JSON, or maxDepth is exceeded.
  return expandedHtml;
}
```

Roughly 80–120 lines. No regex pyramids — uses a small state machine that walks the HTML once and recognises the comment opener/closer. JSON payloads parsed with `JSON.parse`. Placeholders rendered via simple `{{name}}` lookup with HTML-escape by default and `{{{name}}}` for raw insertion (used only inside snippet authoring, not exposed to reference authors).

#### Where expansion sits in the pipeline

Expansion runs **on the fragment path only**, immediately after the fragment-validity check (verifier Check 7) and before the shell wrap:

```
fragment string
  │
  ▼
[ _validator.mjs ]   verify-fragment.mjs sanity checks
  │
  ▼
[ _components.mjs ]  expand <!-- @include … --> tokens (NEW in v9.20.1)
  │
  ▼
[ _shell.mjs ]       wrap with head/nav/footer
```

The MD-to-HTML path (non-fragment artifacts) is untouched — `markdown-it` never sees include tokens, so its autolink / inline-HTML behaviour can't fire on snippet payloads.

#### Why this is worth one patch release of effort

1. **Five reference docs shed ~30% of their fragment-author boilerplate.** The metric-row block alone is ~25 lines × 5 fragments = 125 lines of duplication today. Snippets cut that to one `@include` line per usage.
2. **Design drift becomes a one-file change.** Adjusting the `.metric-row` border-style means editing `components/metric-row.html.snippet`; the five fragments inherit the change on next render. Without snippets, the same change touches five reference docs and any pre-existing rendered fragments stay stale until each is regenerated by an artifact write.
3. **Snippet authoring is the same skill as fragment authoring.** No new language. A reference author who can write `<section class="fragment-X">` can write `<div class="metric">{{label}}</div>`.
4. **It doesn't preclude MDX later.** If v9.22.0 adopts MDX, `components/*.html.snippet` becomes `components/*.mdx` and the expander is retired. The include-token vocabulary is small enough that the migration is mechanical.

#### What this does NOT do

- **Does not introduce a build step.** Expansion happens at render-time, in-process, no compile.
- **Does not change author ergonomics for non-fragment artifacts.** Plain `.md + .yaml` flow is unchanged.
- **Does not let snippets execute arbitrary JS.** Snippets are HTML with `{{token}}` placeholders; no embedded expressions, no conditional logic. If a fragment needs conditionals, it writes them in its own inline `<script>` block (same as today).
- **Does not change the fragment contract from phase 1.** The `sdlc:fragment-ready` dispatch still happens inside the fragment's inline `<script>`; `fragment-ready.html.snippet` is just a documented shape, not a new requirement.

#### Verifier addition (Check 9, warn-only)

`scripts/verify-fragment.mjs` gains a Check 9: warn when a fragment carries inline markup that exactly matches a published snippet (suggesting the author should have used `@include`). Warn-only because suppression is sometimes legitimate (snippet-incompatible variant). Tracked via an allowlist comment `<!-- @include-skip <reason> -->` adjacent to the inline markup.

#### Effort

| Task | Estimate |
|---|---|
| `_components.mjs` expander + tests | 4 hours |
| Initial 7 snippets (metric-row, callout, verdict, severity-chip, fragment-ready, files-touched-row, diff-block) | 3 hours |
| Refactor five fragment-author references to use `@include` | 4 hours |
| Verifier Check 9 + docs | 2 hours |
| **Phase 1.5 total** | **~13 hours** |

Lands as v9.20.1 alongside the additive-write reference rollover for `/wf shape` and `/wf slice` — keeping the patch release small but coherent.

### Phase 2 (v9.21.0) — fragment polish + per-dimension review pages — **shipped 2026-05-21**

- **[shipped]** Per-dimension review pages get their own scoped fragments (currently the gallery shows one combined review fragment; phase 2 splits per-dimension into separate cards).
  - Renderer: `renderers/review-command.mjs` now consumes a new `review-dimension` sibling YAML schema (single-dimension verdict + counts + findings).
  - Verifier: `scripts/verify-fragment.mjs` extends `ALLOWED_FRAGMENT_NAMES` with `review-dimension`.
  - Falls back to the v9.20.x simple renderer when sibling YAML is absent.
- **[shipped]** Plan fragment gains a data-flow lane variant when frontmatter declares cross-service edges.
  - Schema: `plan.edges[].kind` enum gains `crosses-service`; new optional `plan.lanes` array (service + files).
  - Renderer: `renderers/plan.mjs` `dataFlowLaneSvg` + `inferLanes`. Explicit `lanes:` wins; otherwise lanes inferred from first path segment.
- **[shipped]** RCA fragment gains "5 whys" optional drill panel.
  - Schema: `rca.five_whys` optional array (1–7 entries of `{question, answer, root?}`).
  - Renderer: `renderers/augmentation.mjs` `renderFiveWhys` — collapsible `<details>` between causal chain and contributing causes; root entry rendered with a blocker-tinted band.

### Phase 3 (v9.22.0) — simplify, profile, augmentations — **shipped 2026-05-22**

- **[shipped]** `/wf-quick simplify` simplify-run artifacts gain a finding-table fragment styled like the review fragment but at smaller scale.
  - Schema: new `simplify-run` sibling YAML — categorical findings (reuse/quality/efficiency), 6-cell counts row, optional code-deltas table.
  - Renderer: `renderers/simplify-run.mjs` consumes sibling YAML; falls back to v9.21.x simple renderer otherwise.
  - CSS: new `.finding-list-compact` / `.finding-compact` / `.finding-cat.is-{reuse|quality|efficiency}` hooks in `assets/sdlc.css`.
- **[shipped]** `profile` (off-pipeline) gains a benchmark-comparison fragment.
  - Schema: new `profile` sibling YAML — hotspots[], optimization_candidates[], optional comparisons[] (before/after metric pairs).
  - Renderer: `renderers/profile.mjs` emits a hotspots table, optional per-metric-normalised before/after SVG (improvement vs. regression tone derived from each metric's `direction:`), and a candidates list with gain + confidence metadata.
- **[shipped]** Generic augmentation gains a structured-result fragment based on `augmentation-type`.
  - Schema: three new sibling YAML schemas — `benchmark` (metric comparison), `experiment` (arms + guardrails), `instrument` (signals + dark-paths).
  - Renderer: `renderers/augmentation.mjs` dispatches on `augmentation-type` ∈ {`rca`, `benchmark`, `experiment`, `instrument`}; existing RCA branch unchanged.
  - Verifier: `scripts/verify-fragment.mjs` ALLOWED_FRAGMENT_NAMES extended with all five new names.

### Indefinite — most types stay MD-only

Most artifact types (`intake`, `shape`, `slice`, `retro`, `handoff` body, `sync-report`, `amendment`, `skip-record`) get their HTML view from the MD-conversion path inside the calm-reader shell. They don't gain enough by rich fragments to justify the authoring cost. Leave them — the calm typography and `.frontmatter-card` already give them a polished read.

---

## File-by-file change list

### New files (phase 1)

```
plugins/sdlc-workflow/
  assets/
    sdlc.css                                  ← design system
    sdlc.js                                   ← interactions
    favicon.svg                               ← inline-SVG favicon
  hooks/
    render-sunflower.json                     ← PostToolUse hook registration
    render-on-artifact-write.mjs              ← hook entry point (debounce + invoke renderer)
  renderers/
    _shell.mjs                                ← document wrapper
    _markdown.mjs                             ← MD-to-HTML
    _yaml.mjs                                 ← frontmatter parser + sibling .yaml reader
    _validator.mjs                            ← schema-validation wrapper
    _paths.mjs                                ← storage→view path resolution
    _link-graph.mjs                           ← refs: rewriting
    _icons.mjs                                ← inline SVG icons
    _mtime.mjs                                ← additive-mode dirty-set computation
    _history.mjs                              ← history/ folder loader for revisions
    dashboard.mjs
    index.mjs
    intake.mjs
    shape.mjs
    design.mjs
    design-brief.mjs
    slice-index.mjs
    slice.mjs
    plan-index.mjs
    plan.mjs
    implement-index.mjs
    implement.mjs
    verify-index.mjs
    verify.mjs
    review.mjs
    review-command.mjs
    handoff.mjs
    ship-run.mjs
    ship-runs-index.mjs
    retro.mjs
    resume.mjs
    skip-record.mjs
    sync-report.mjs
    shape-amendment.mjs
    slice-amendment.mjs
    simplify-run.mjs
    augmentation.mjs
    profile.mjs
    design-augmentation.mjs
    ship-legacy.mjs
    critique-or-audit.mjs
  scripts/
    render-sunflower.mjs                      ← orchestrator
    serve-sunflower.ps1                       ← Windows tailscale wrapper
    serve-sunflower.sh                        ← POSIX tailscale wrapper
  docs/site/
    sunflower-view.md                         ← user guide
  tests/
    sunflower-fixtures.json                   ← sample slug for renderer tests
    sunflower.test.mjs                        ← per-renderer snapshot tests
```

### Edited files (phase 1)

```
plugins/sdlc-workflow/.claude-plugin/plugin.json    ← version bump 9.19.0 → 9.20.0
.claude-plugin/marketplace.json                     ← version bump 1.54.0 → 1.55.0
plugins/sdlc-workflow/CHANGELOG.md                  ← v9.20.0 entry
plugins/sdlc-workflow/README.md                     ← view-layer section + version-notes
plugins/sdlc-workflow/scripts/verify-router-migration.mjs  ← add Check 5–8
plugins/sdlc-workflow/scripts/verify-fragment.mjs   ← NEW (used by Check 7)
plugins/sdlc-workflow/tests/frontmatter.schema.json ← add `regenerable: boolean`,
                                                       promote `revision-count` to required
                                                       on revisable type branches,
                                                       add 5 sibling-YAML schemas
                                                       (review/rca/plan/design/ship-run)

# Fragment-author rewrites (promoted from phase 2/3 into phase 1):
plugins/sdlc-workflow/skills/review/SKILL.md         ← sweep step emits .yaml + .html.fragment
plugins/sdlc-workflow/skills/review/reference/*.md   ← each dimension emits .yaml + .html.fragment
plugins/sdlc-workflow/skills/wf-plan/reference/plan.md         ← emits .yaml + .html.fragment per slice
plugins/sdlc-workflow/skills/wf-design/reference/design.md     ← emits .yaml + .html.fragment
plugins/sdlc-workflow/skills/wf-ship/reference/ship-run.md     ← emits .yaml + .html.fragment per run
plugins/sdlc-workflow/skills/wf-quick/reference/rca.md         ← emits .yaml + .html.fragment per incident
```

Phase 1 includes the five fragment-author rewrites because the handoff README declares fragments the primary design.

---

## Dependencies

Phase 1 introduces three Node dependencies:

| Dep | Why | Bundle size |
|---|---|---|
| `js-yaml` | parse YAML frontmatter | ~40KB |
| `ajv` + `ajv-formats` | validate against frontmatter.schema.json | ~120KB |
| `marked` (or `markdown-it`) | MD → HTML conversion | ~60KB |

All MIT or BSD. All run-time only — no build step. Pinned in `plugins/sdlc-workflow/package.json` (new file). The renderer runs under Node 20+.

Alternative: hand-roll all three. ~600 lines total. Cost: maintenance burden; benefit: zero deps. **Recommendation**: take the deps; this isn't a hot path.

---

## Versioning & changelog

Phase 1 = **v9.20.0** (minor — additive new feature, no breaking changes).

CHANGELOG entry:

```
## [9.20.0] - 2026-05-19

### Added

- Sunflower view layer: HTML projection of `.ai/workflows/` artifacts. New
  `scripts/render-sunflower.mjs` walks the storage tree and emits a navigable
  HTML site under `.ai/_view/` with shared CSS/JS at the root. Pre-existing
  slugs render with no migration. Visual design follows the calm paper-and-ink
  reader from `sdlc-handoff/sdlc/project/`. Conceptual reference: Thariq
  Shihipar, "The Unreasonable Effectiveness of HTML" (2026-05-08).
- Per-artifact-type renderer modules (30) under `renderers/`, each mapped 1:1
  to a branch of `tests/frontmatter.schema.json`.
- Shared design system: `assets/sdlc.css` (~500 lines), `assets/sdlc.js` (~200
  lines). Single file each. No build step. Paper/ink palette, serif display
  headings (Iowan Old Style), severity glyphs paired with colour for
  deuteranope safety.
- **Five rich `*.html.fragment` writers** for the highest-value artifact types,
  matching the handoff's `sdlc-fragments-gallery.html`:
  - `07-review` — verdict block, severity chip filter, dimension chip filter,
    sort dropdown, expandable findings with copy-as-PR-comment buttons.
  - `01-rca` / rca augmentation — SVG incident timeline with `:target` event
    panels, causal-chain SVG, severity × time heatmap, contributing-causes
    callouts.
  - `04-plan` — file-change topology SVG, files-touched table with collapsible
    planned-change cards, risk callouts, prior-revisions list fed from
    `history/`.
  - `02b-design` — 24-cell swatch matrix (sizes × states × themes), token
    table with inline swatches + copy-as-CSS, annotated specs SVG.
  - `09-ship-run` — deploy timeline SVG, check matrix table with log expand,
    rollback affordance.
- **Five page-level figure-canvas SVG builders** (dashboard workflow swimlanes,
  slug-overview stage stripe, plan file topology, review severity × dimension
  heatmap, slice grid figure) — derived automatically from frontmatter +
  sibling YAML.
- `scripts/serve-sunflower.{ps1,sh}` wrappers around `tailscale serve`.
- PostToolUse hook (`hooks/render-sunflower.json` + `render-on-artifact-write.mjs`)
  auto-renders touched artifacts in the background with 2s debounce.
- Sibling YAML data files: any artifact `.md` may have a sibling `.yaml` carrying
  structured display data (table rows, timelines, finding lists). Renderer merges
  it into frontmatter (sibling-yaml wins on conflict). **New schemas** for
  `review`, `rca`, `plan`, `design`, and `ship-run` sibling YAML — see
  Appendix C of the plan.
- Additive renderer mode (default): only artifacts with newer storage mtimes
  re-render; existing view files are preserved. `--clean` flag forces full wipe.
- Additive sub-command write contract: primary artifacts append `## Revision <n>`
  sections; full rewrites snapshot to `<slug>/history/<basename>-<rev>.md` first.
  `regenerable: true` frontmatter flag opts out for view-style artifacts (RESUME,
  sync reports). Schema now requires `revision-count` on revisable types.
- Verifier Check 5–8: view-tree freshness (warn), renderer coverage (warn),
  fragment validity (**error**), figure renderability (warn).
- `sdlc:fragment-ready` window event — every fragment dispatches one when its
  script settles; `assets/sdlc.js` subscribes and records `data-fragment-ready`
  on `<body>` for manifest tooling.

### Decisions

- View-as-projection over storage-rewrite: existing markdown stays the
  source-of-truth; HTML is regenerated. Trade-off: HTML diffs not git-tracked
  by default. Benefit: back-compat is free.
- Schema-driven renderers reuse `frontmatter.schema.json` as the template
  directory rather than introducing a parallel `templates/<kind>/` tree.
- **Fragments promoted from phase 2/3 into phase 1.** The handoff README
  declares `sdlc-fragments-gallery.html` the primary design, so deferring
  fragments would ship a partial product. Five fragments + five
  figure-canvas builders land together.
- **Calm-reader palette over the originally-proposed dark mode.** The handoff
  designs use a paper-and-ink reader (Iowan Old Style serif, sandstone neutrals,
  sandstone severity palette). The plan's original dark tokens were superseded.
- Reference-file rollover to additive writes phases over v9.20.1 + v9.20.2
  patches for non-fragment references; the five fragment-bearing references
  (review, plan, design, ship-run, rca) ship their rewrites in v9.20.0.
- Sibling-yaml-wins-on-conflict: documented because the alternative (merge-error
  on conflict) would block valid use cases like "yaml overrides a frontmatter
  default."
- PostToolUse hook is enabled by default on plugin install. Users who want to
  pause auto-rendering touch `.ai/_view/.render-suppress`; users who want to
  disable entirely can edit `hooks/render-sunflower.json` locally or skip the
  plugin entirely. No env-var gate, no opt-in toggle — the hook is the value.
- No retroactive migration of pre-v9.20.0 artifacts to the additive contract.
  Existing slugs continue forward with append-only semantics from v9.20.0 onward;
  prior body content stays as the de-facto "Initial" section. No `history/`
  seeding, no `/wf-meta migrate-additive` command. Renderer treats absent
  history as an empty array.
- Pre-v9.20.0 artifacts also do not get retroactive `*.html.fragment` files.
  They render via the MD-conversion path inside the calm-reader shell on day
  one; the next rewrite of any fragment-bearing artifact authors its fragment.

### Files

(see SUNFLOWER-VIEW-PLAN.md for the full change list)
```

---

## Risks & open questions

### Risks

1. **Renderer drift from schema.** If `frontmatter.schema.json` grows a new branch and no one adds a `renderers/<type>.mjs`, the orchestrator falls back to generic rendering. Mitigated by verifier Check 6. Cost: low — fallback is usable.
2. **Asset path coupling to tailscale serve config.** Default `assetBase: /sdlc/_assets` assumes `--set-path=/sdlc`. Users who serve at root will need to override. Documented; configurable via orchestrator flag.
3. **Browser caching of `sdlc.css/js`.** When the design system changes, browsers may serve stale CSS. Phase 1 fix: append `?v=<sdlc-version>` query string. Phase 2 fix: content hash in filename.
4. **Schema validation throwing on malformed YAML.** Mitigated: `_yaml.mjs` returns `null` on parse failure; orchestrator renders a warn-banner page rather than crashing the whole run.
5. **Large slugs (100+ artifacts) slow the render.** Phase 1 ignores this; if it becomes real, add incremental rendering keyed by storage-file mtime in phase 4+.

### Open questions

1. **Should `.ai/_view/` be `.gitignore`'d by default?**
   - Pro: keeps repo clean, no HTML diffs.
   - Con: PR reviewers can't see the view without running the renderer.
   - Recommendation: gitignored by default; users opt in to commit via per-project config. Documented in `docs/site/sunflower-view.md`.

2. **Where do the Node deps install?**
   - `plugins/sdlc-workflow/package.json` (plugin-local node_modules).
   - Requires consumers to run `npm install` once per plugin update.
   - Document this clearly in the user guide.

3. **Markdown library choice: `marked` vs `markdown-it`.**
   - `marked` is smaller and faster; `markdown-it` has a plugin ecosystem (footnotes, anchor IDs, syntax highlighting hooks).
   - Recommendation: `markdown-it` for the anchor-ID and highlight hooks; the size cost is worth the extension surface.

4. **MDX considered and rejected for v9.20.0.** Switching to `.mdx` would collapse the `.md + .yaml + .html.fragment` trio into one file with embedded JSX components — five clear wins (one file per artifact, reusable components, type-checked authoring, hot reload, less HTML for the agent to emit). Six clear costs: requires a real build step, output is less inspectable, breaks the "any text editor authors a fragment" property, storage diverges from the "all markdown" mental model, PostToolUse hook gets ~200–500ms heavier per touched file, agent ergonomics aren't necessarily better (writing JSX inside MD is its own learning curve). **Decision**: stay on `.md + .yaml + .html.fragment` for v9.20.0; revisit at v9.22.0 if richer fragments justify the build step. The middle-ground that gets ~80% of MDX's dedupe benefit without a compiler is the `components/` snippet directory described in the [Phase 1.5 — components/ snippet helper](#phase-15--components-snippet-helper-v9201) section below.

5. **`sync-report` view path placement** — currently proposed `.ai/_view/sync/<slug>/INDEX.html`, but it could live under `<slug>/sync/INDEX.html`. Decision: under-slug is more navigable. Will adjust in implementation.

6. **`INDEX.yaml` at view-tree root** — strictly redundant with `00-index.md` per slug, but useful as a single-file machine-readable summary of the entire view tree. Worth emitting for tooling that consumes the view without walking it. Cheap to produce. Keep.

---

## Effort estimate

| Phase | Work | Estimate |
|---|---|---|
| 1a | Helpers (`_shell`, `_yaml` w/ sibling-yaml merge, `_validator`, `_markdown`, `_paths`, `_link-graph`, `_icons`, `_mtime`, `_history`, `_figure`) | 10 hours |
| 1b | Orchestrator (`render-sunflower.mjs`) with additive default + `--clean` + `--only` modes | 4 hours |
| 1c | Renderer modules (30 × ~30 lines avg; 5 fragment-bearing modules also have figure-canvas builders consuming siblingYaml) | 13 hours |
| 1d | `sdlc.css` calm-reader design system (paper/ink palette, severity glyphs, figure-canvas, .vb page styles, shared fragment classes) | 7 hours |
| 1e | `sdlc.js` interactions (shell + `sdlc:fragment-ready` subscription) | 2 hours |
| 1f | Tailscale wrappers + docs | 1 hour |
| 1g | Verifier Check 5–8 (incl. `verify-fragment.mjs`) | 3 hours |
| 1h | PostToolUse hook + debounce + filter | 3 hours |
| 1i | Schema additions (`regenerable`, promote `revision-count`, 5 sibling-YAML schemas) + fixtures | 4 hours |
| 1j | **Five fragment-author reference rewrites** (review-sweep + per-dimension, plan, design, ship-run, rca) — each with embedded fragment-template instructions | 16 hours |
| 1k | **Page-level figure-canvas SVG builders** (workflow swimlanes, stage stripe, file topology, severity heatmap, slice grid) | 10 hours |
| 1l | Tests + fixtures (incl. sibling-yaml, history/, hook-debounce, fragment-snapshot, figure-canvas snapshots) | 10 hours |
| 1m | CHANGELOG + README + docs section on calm-reader design + fragment authoring | 2 hours |
| **Phase 1 total** | | **~85 hours** |

The original ~43h estimate was for the renderer-only scope. Promoting fragments + figure-canvas into phase 1 roughly doubles the surface — fair trade, because the handoff README explicitly declares this as the primary deliverable.

Phase 1.x reference rollover for the remaining (non-fragment) revisable references: ~6 hours total split across 2 patches.

Phase 2 (per-dimension review fragment split + plan data-flow lane variant + RCA 5-whys panel): ~10 hours.
Phase 3 (simplify fragment + profile fragment + generic augmentation fragment): ~12 hours.

Phase 1 is the load-bearing phase. Everything after is incremental polish on top of the calm-reader / fragment foundation.

---

## Decision checkpoints (pre-implementation)

Before phase 1 lands, confirm:

- [ ] Markdown library choice (`markdown-it` recommended).
- [ ] `.ai/_view/` default gitignore policy (recommend: ignored).
- [ ] Asset base path default (recommend: `/sdlc/_assets`, override via flag).
- [ ] Whether Node deps are acceptable (recommend: yes, the alternative is 600 lines of hand-rolled parsing).
- [ ] Whether `components/` snippet helper ships in phase 1.5 (recommend: yes — see Phase 1.5 section).

### Resolved (2026-05-19)

- [x] **Fragments ship in phase 1.** All five (`review`, `rca`, `plan`, `design`,
  `ship-run`) plus the five page-level figure-canvas builders land in v9.20.0.
  The earlier "renderer-alone, fragments-in-phase-2" recommendation predates the
  design-handoff fidelity revision and is superseded. Driver: the handoff README
  explicitly names `sdlc-fragments-gallery.html` the primary design — shipping
  the rendering layer without fragments would deliver a partial product.
- [x] **MDX rejected for v9.20.0.** Stay on `.md + .yaml + .html.fragment`. Build
  step cost outweighs the component-reuse benefit at this surface area. Revisit
  at v9.22.0. The `components/` snippet directory (phase 1.5) covers the
  dedupe motivation without a compiler.
- [x] **PostToolUse hook is enabled by default on plugin install.** No opt-in
  gate. Suppress via `.ai/_view/.render-suppress` touch-file (per-project).
- [x] **No retroactive migration of pre-v9.20.0 artifacts.** Existing slugs
  continue forward with additive semantics; `history/` is seeded only by future
  rewrites, not by walking git history. The renderer treats missing history as
  an empty list and renders the current body as the latest revision.

Once confirmed, implementation proceeds in the order: helpers → orchestrator → one renderer (`index.mjs`) end-to-end → CSS scaffold → remaining renderers in bulk → JS interactions → docs → verifier → tests → release.

---

## Appendix A: sample renderer (`plan.mjs`)

To make the contract concrete, here is one renderer in full:

```js
// renderers/plan.mjs
import { md2html } from "./_markdown.mjs";
import { metricRow, statusBadge, breadcrumb } from "./_shell.mjs";

export function render(artifact, ctx) {
  const fm = artifact.frontmatter;

  const headerHtml = `
    <header class="artifact-header">
      <h1>Plan · <code>${fm["slice-slug"]}</code></h1>
      <div class="meta-row">
        ${statusBadge(fm.status)}
        ${stageBadge(fm["stage-number"])}
        <span class="meta">slug: <code>${fm.slug}</code></span>
        <span class="meta">revised ${fm["revision-count"]}× · ${fm["updated-at"]}</span>
      </div>
      ${metricRow([
        { label: "files to touch", value: fm["metric-files-to-touch"] },
        { label: "steps", value: fm["metric-step-count"] },
        { label: "blockers", value: fm["has-blockers"] ? "yes" : "none",
          tone: fm["has-blockers"] ? "warn" : "ok" },
      ])}
    </header>
  `;

  const bodyHtml = artifact.fragment
    ? `<div class="fragment">${artifact.fragment}</div>`
    : `<div class="prose">${md2html(artifact.body)}</div>`;

  return {
    headerHtml,
    bodyHtml,
    links: extractLinks(fm.refs ?? {}),
    children: [],   // plans don't fan out; plan-index fans out to plans
  };
}
```

Approximately 30 lines. Each renderer is small because the heavy lifting lives in helpers.

---

## Appendix B: sample dashboard (`dashboard.mjs`) output

The top-level `INDEX.html` is a single-page overview:

```
┌────────────────────────────────────────────────────────────┐
│  sdlc                                                       │
│  generated 2026-05-19 21:14 · 7 slugs · 53 artifacts       │
├────────────────────────────────────────────────────────────┤
│  ACTIVE (3)                                                 │
│  ────────                                                   │
│  ◉ fix/login-timeout       implement · slice 2 of 3 · 3d  │
│  ◉ feat/checkout-redesign  shape · awaiting input · 1d    │
│  ◉ feat/onboarding-v2      verify · 0 issues · 4h         │
│                                                             │
│  COMPLETE (2)                                               │
│  ────────                                                   │
│  ◎ feat/billing-rewrite    shipped 2026-05-15 · v3.2.0    │
│  ◎ fix/dashboard-perf      shipped 2026-05-12 · v3.1.4    │
│                                                             │
│  CLOSED (2)                                                 │
│  ────────                                                   │
│  ○ feat/experimental-api   abandoned 2026-04-30           │
│  ○ fix/legacy-import       superseded by /feat/imports-v2 │
└────────────────────────────────────────────────────────────┘
```

Each row links to `<slug>/INDEX.html`. Status icons (◉ active, ◎ complete, ○ closed) use the same color tokens as the rest of the design system.

In practice the dashboard renders not as the ASCII sketch above but as the **workflow-swimlanes figure-canvas** from `sdlc-design-iterations.html` (Figure 1): rows are projects, columns are the 8 stages (intake → retro), bullet dots mark completed stages, an accent ring marks current stage, dashed-line tail marks not-yet-reached stages. Blocked projects flag in `--blocker`. Below the figure: three sectioned project lists (Active, Recently shipped, Closed) using `.project-row`.

---

## Appendix C: sibling-YAML schemas (phase 1, fragment-bearing artifacts)

These schemas land in `tests/frontmatter.schema.json` under a new `siblingYamlSchemas` root. The renderer reads `<artifact>.yaml`, validates it against the appropriate schema, and passes it to the fragment-author reference and the figure-canvas builder.

### `review.yaml`

```yaml
artifact: review                                   # required, literal
parent: feat/checkout-v2                           # required, slug
rev: 2                                             # required, integer
model: claude-opus-4-7                             # required
run_at: 2026-05-18T14:22:00Z                       # required, ISO-8601
verdict: caveats                                   # required: ship | caveats | no
summary: "No blockers remain…"                     # required, ≤500 chars
counts:                                            # required
  blocker: 0
  high:    2
  med:     4
  low:     7
  nit:     5
dimensions:                                        # required, ≥1
  - { name: security,        count: 3 }
  - { name: correctness,     count: 4 }
  - { name: accessibility,   count: 3 }
  - { name: performance,     count: 2 }
  - { name: refactor-safety, count: 6 }
findings:                                          # required, ≥0
  - id: F-038
    severity: high                                 # blocker | high | med | low | nit
    dimension: security
    file: server/billing/intent.ts
    line: 42
    confidence: high                               # high | med | low
    action: accept                                 # accept | defer | reject
    msg: "Hardcoded JWT secret fallback…"
    evidence:
      diff: |
        - const secret = process.env.X ?? 'dev'
        + const secret = process.env.X
    fix: "Remove the fallback…"
```

### `rca.yaml`

```yaml
artifact: rca
incident: INC-2026-0512-checkout                   # required
title: "Checkout outage"                            # required
started_at: 2026-05-15T14:02:11Z                   # required
resolved_at: 2026-05-15T15:48:55Z                  # required
metrics:                                           # required (5 metric-row cells)
  duration: "3h 43m"
  time_to_detect: "6m"
  time_to_mitigate: "32m"
  user_failures: 12400
  revenue_impact_usd: 38000
timeline:                                          # required, ≥2 events
  - id: evt-1
    at: 14:02:11
    kind: alert                                    # alert | escalation | deploy | mitigation | resolution
    title: "checkout-confirm error rate > 5%"
    body: "Datadog monitor fired…"
    who: "source: datadog · routed to: #oncall-billing"
chain:                                             # required, exactly 4 steps
  - { step: TRIGGER,     body: "rev 2 deployed without load-test gate" }
  - { step: CHANGE,      body: "PaymentForm.tsx took a path that did not memoise Stripe" }
  - { step: CASCADE,     body: "Each rerender opened a WebSocket; pool saturated" }
  - { step: ROOT_CAUSE,  body: "Client retries multiplied load until pool was full" }
heatmap:                                           # required for the heatmap grid
  buckets: ["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"]
  systems:
    checkout-api:    [3, 3, 2, 1, 0, 0, 0, 0]
    billing-service: [2, 3, 2, 1, 0, 0, 0, 0]
    frontend-cdn:    [1, 1, 0, 0, 0, 0, 0, 0]
    postgres-primary:[0, 2, 2, 1, 0, 0, 0, 0]
    stripe-webhooks: [1, 2, 1, 0, 0, 0, 0, 0]
contributing_causes:                               # optional, ≥0
  - { kind: process,       title: "Load-test gate not enforced", body: "…" }
  - { kind: infra,         title: "Pool sized for steady state", body: "…" }
  - { kind: observability, title: "Alert fires after user impact", body: "…" }
mitigations:                                       # optional, ≥0
  - { at: "14:21", kind: hotfix,   title: "Memoise Stripe instance", body: "…" }
  - { at: "15:02", kind: rollback, title: "Revert PR #1842",          body: "…" }
```

### `plan.yaml`

```yaml
artifact: plan
slice: 04-checkout-multi-region                    # required
parent: feat/checkout-v2                           # required
rev: 3                                             # required
modules:                                           # required, ≥1
  - app/components/checkout
  - app/hooks
  - app/data
  - server/billing
  - shared/types
  - tests/checkout
files:                                             # required, ≥1
  - path: app/components/checkout/PaymentForm.tsx
    role: modified                                 # new | modified | deleted | external
    loc: 412                                       # null permitted for new
    delta: { add: 118, rem: 96 }
    imports: [useRegion, CurrencyDisplay]
    planned_change:
      intent: "Wire useRegion()…"
      diff: |
        + import { useRegion } from '../../hooks/useRegion';
        - const methods = ['card', 'apple_pay'];
        + const methods = region.paymentMethods;
edges:                                             # optional, drives topology SVG arrows
  - { from: PaymentForm.tsx, to: useRegion.ts, kind: import }
  - { from: useRegion.ts,    to: RegionRepo.ts, kind: import }
  - { from: RegionRepo.ts,   to: LegacyCurrency.ts, kind: replaces }
risks:                                             # required, ≥0
  - { level: high, title: "Region detection silently wrong", body: "…" }
  - { level: med,  title: "Tax surcharge moves server-side", body: "…" }
  - { level: low,  title: "Bundle size +3.2 KB gz",          body: "…" }
history: history/                                  # literal pointer; renderer walks it
```

### `design.yaml`

```yaml
artifact: design
component: checkout-button                         # required
themes: [light, dark]                              # required, ≥1
states: [default, hover, pressed]                  # required, ≥1
sizes:                                             # required, ≥1
  - { id: sm, height: 28, padx: 10, pady: 5,  font: 12, radius: 4  }
  - { id: md, height: 36, padx: 14, pady: 8,  font: 14, radius: 6  }
  - { id: lg, height: 44, padx: 18, pady: 11, font: 15, radius: 8  }
  - { id: xl, height: 52, padx: 22, pady: 14, font: 17, radius: 10 }
tokens:                                            # required, ≥1
  - { name: --ck-bg,        category: color,   value: "#2a6f8a", note: "steel-blue" }
  - { name: --ck-bg-hover,  category: color,   value: "#245d75", note: "−8% L" }
  - { name: --ck-radius-md, category: radius,  value: "6px" }
  - { name: --ck-padx-md,   category: spacing, value: "14px" }
  - { name: --ck-font-md,   category: font,    value: "14px / 600" }
  - { name: --ck-ease,      category: easing,  value: "cubic-bezier(0.32, 0.72, 0, 1)", note: "ease-out" }
specs:                                             # required for annotated SVG
  reference: md.default                            # which cell in the matrix to annotate
  annotate: [padding-y, padding-x, gap, radius, height]
```

### `ship-run.yaml`

```yaml
artifact: ship-run
release: v3.2.0                                    # required
run_at: 2026-05-19T09:14:00Z                       # required
stages:                                            # required, drives deploy-timeline SVG
  - { name: build,   started_at: "09:14", ended_at: "09:21", status: ok }      # ok | flake | fail | running
  - { name: test,    started_at: "09:21", ended_at: "09:28", status: ok }
  - { name: stage,   started_at: "09:28", ended_at: "09:36", status: ok }
  - { name: canary,  started_at: "09:36", ended_at: "—",     status: running }
  - { name: prod,    started_at: "—",     ended_at: "—",     status: pending }
checks:                                            # required, ≥1; drives check matrix
  - name: e2e-checkout
    kind: e2e                                      # e2e | unit | int | perf | smoke
    results:
      staging:    { status: pass,    duration_s: 182 }
      canary:     { status: pass,    duration_s: 168 }
      production: { status: pending, duration_s: null }
    logs:
      staging:    s3://ci-logs/run-9821/staging.log
      canary:     s3://ci-logs/run-9821/canary.log
rollback:                                          # required
  window_minutes: 60
  target_release: v3.1.4
  approvers: [release-managers]
```

---

## Appendix D: fragment-author reference template (phase 1, embedded in each of the five fragment-bearing references)

Each of the five fragment-bearing references (`skills/review/reference/<dimension>.md`, `skills/wf-plan/reference/plan.md`, `skills/wf-design/reference/design.md`, `skills/wf-ship/reference/ship-run.md`, `skills/wf-quick/reference/rca.md`) gains a "Fragment author step" block like:

```
## Step N — write the rich fragment

After writing <slug>/<artifact>.md and <slug>/<artifact>.yaml, write the
sibling <slug>/<artifact>.html.fragment.

The fragment is one `<section class="fragment-<name>" data-artifact="<type>" …>`.
Reproduce the structure documented in `sdlc-handoff/sdlc/project/sdlc-fragments-gallery.html`
under the corresponding fragment block. Specifically:

1. Header: `.sdlc-crumb` (file path) + `.sdlc-h1` (title) + `.sdlc-lede` (intro).
2. <Section-specific structure — see gallery for review|rca|plan|design|ship-run>.
3. Inline `<style>` block, every selector scoped under `.fragment-<name>`.
4. Inline `<script>` block, scoped via `document.currentScript.closest('.fragment-<name>')`.
   On settle, dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready',
   { detail: { name: '<name>', artifact: '<type>', … per-fragment counts … } }))`.

Constraints:
- One <section>. No <html>/<head>/<body>/<iframe>/<link>/<script src=…>.
- Only documented shared classes used outside the .fragment-<name> scope:
  .verdict, .verdict-{ship|caveats|no}, .sev, .severity-{blocker|high|med|low|nit},
  .metric-row, .metric, .metric-{label|value|ann}, .callout, .callout-{risk|warn|info|ok},
  .files-touched + role classes, pre.diff + .diff-{add|rem|ctx}, .btn, .btn-{primary|danger},
  .status-badge, .stage-badge, .sdlc-{h1|h2|lede|crumb}, .timeline, .figure-canvas.
- Inline SVG only (no external images). All data deterministic from
  the sibling .yaml — re-running on the same .yaml must produce byte-identical output.
- Mobile-responsive down to 320px. Heatmaps and matrices may scroll horizontally.
- No emoji as the sole carrier of meaning (severity always = glyph + colour).

Source-of-truth checklist for the YAML → fragment mapping:
<per-fragment field-by-field mapping table>
```

The renderer's role is to take the fragment as-is, drop it into the `<main>` slot of the shell, append the figure-canvas at the top, and append the prior-revisions block at the bottom (driven by `history/`).

---

End of plan.
