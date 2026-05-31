# Sunflower view — parity fix plan

Derived from [`SUNFLOWER-PARITY-AUDIT.md`](SUNFLOWER-PARITY-AUDIT.md). Scope decision (2026-05-30):
**full parity, all clusters, every severity**, with two deliberate exclusions:

- **D3.1 — won't fix** (user decision): keep the 10-stage dashboard swimlane (`intake → shape →
  slice → plan → implement → verify → review → handoff → ship → retro`). The design's 8-column
  Figure 1 omits `slice` and `handoff`; the renderer's lifecycle is the correct side. Column rules,
  progress overlay, separators, etc. still apply — laid out across 10 columns via `evenX()`.
- **D4.3 — won't fix (proposed, flagged)**: same 10-vs-8 question for the slug-overview stage
  stripe. Held consistent with D3.1. Override if you want the slug page to show 8 stations while the
  dashboard shows 10.

Sequencing principle: lay the CSS + shell foundation first; rebuild the static figures (no data
dependency); then stand up the sibling-YAML data tier; then the structured renderers that consume
it; then the authored-fragment interactivity tier last (highest effort, depends on the rest).

---

## Slice plan (dependency-ordered)

### Slice 1 — CSS + token foundation  · `assets/sdlc.css`, `renderers/_figure.mjs`
**Effort S · Risk very-low · Depends: none.** Pure styling + the shared legend-swatch helper. Lands
every class later slices emit against, so it must go first.

- Token nudges: `--rad-sm` 4→3px (D1.12/D1.14); `.sdlc-h1` line-height 1.15 + margin (D1.3);
  `.sdlc-h2` margin-top 28px (D1.2); `.sdlc-crumb` 12.5px, drop tracking (D1.4).
- Metric type: `.metric-label` 11px/0.08em/normal (D1.5); `.metric-value` 26px/1.1/−0.01em (D1.6);
  `.metric-row` padding 14px 18px (D1.7).
- Color/treatment: verdict desaturated border tints (D1.9); `a:hover` slide-in border-bottom (D1.10);
  global `code` chip styling (D1.11); `.sdlc-lede` 60ch/36px (D2.7).
- Add `.v-text` rule (30px serif) so the verdict display line can render (D1.8 / D6.9 CSS half).
- Component CSS for downstream emission: `.files-touched` as `<table>` (D5.10); `.frontmatter-card`
  responsive grid + uppercase `dt` (D5.14); `.ac-list .chk` Unicode glyph (D5.13 CSS); align callout
  class names to `callout risk-high|risk-med|risk-low` (D5.11 CSS); `.fact.accept|defer|reject` (D6.15);
  curated heatmap tint table (D6.14, optional).
- **C9 swatch classes**: rewrite `_figure.mjs:legendEntry()` to emit `<span class="sw {state}">` and add
  `.sw.done|review|blocked|queued|new|modified|deleted|external` rules incl. `sw.queued` dashed border
  (D3.13, D4.13, D5.6, D7.9 — one fix, four findings).
- No-op verification: D1.13 (serif stack already matches iterations), D2.9 (multi-`.pg` hairline doesn't map).

### Slice 2 — Shell / chrome  · `renderers/_shell.mjs`, `assets/sdlc.css`
**Effort M · Risk med (touches every page) · Depends: Slice 1.**

- Rebuild topbar as `div.b-topbar` grid `auto 1fr auto`, padding 22px 64px, `--paper-2` (D2.1).
- Brand text `.ai/workflows`, letter-spacing 0.005em (D2.2).
- Replace `ol.breadcrumb` with editorial `div.crumb` sans 14px, bold current segment (D2.3).
- Add third-column `div.actions` (`⌘K to search · viewing as <b>you</b>`) (D2.4).
- `h1.sdlc-h1` → `h1.pg-title` at 36px (D2.5); `h2.sdlc-h2` → `h2.sec` 12px/40px (D2.6, fixes D3.14).
- Move `data-artifact-type` from `<body>` to `<html>` so fragment JS contract resolves (D8.7, gap §8).
- Drop renderer-added `position:sticky` on nav, or confirm intentional (D2.8). Keep footer (D2.10).

### Slice 3 — Dashboard Figure 1 + ledger  · `renderers/dashboard.mjs`
**Effort M · Risk low · Depends: Slice 1.** D3.1 excluded (10 stages retained).

- `swimlanesSvg()`: vertical column-rule lines for all 10 stages (D3.2); solid `ink` progress overlay
  start→current before the dashed tail (D3.3); `SHIPPED` separator rule + mono label between active and
  shipped groups (D3.4); dashed queued circle for not-started stages (D3.5); inline `· N blockers` /
  `· rev N` annotations beside current dot (D3.6).
- `projectRow()`: `<article>` with stacked serif `.name` + mono `.slug` (D3.10); `.desc` description
  (D3.7); `.status .glyph` health state replacing raw date (D3.8); `.time` human-relative (D3.9);
  `stage-pill cur|done` variants (D3.11); rename bucket `Complete` → `Recently shipped` (D3.12).
- Keep `quickSection()` (D3.16 — required for quick-slug reachability).

### Slice 4 — Slug overview Figure 2 + activity + rail  · `renderers/index.mjs`, `renderers/workflow-index.mjs`
**Effort L · Risk low · Depends: Slice 1.** D4.3 excluded (10 stations retained, flagged).

- `stageStripeSvg()`: viewBox `0 0 920 230` (D4.2); solid `ink-strong` progress overlay (D4.4);
  per-station date labels from frontmatter (D4.5); semantic per-station annotations ("6/7 slices",
  "214 ✓") (D4.6); enlarge current station to r=22 + inner dashed ring (D4.7); bottom metric-callout
  band — second rule + 5 groups LOC/SLICES/REVIEWS/BLOCKERS/TESTS (D4.8).
- Page frame: `.so-hd` two-column identity block, restore `lede` (stop hard-coding ''), branch badge (D4.1);
  `.so-grid` correct roles (activity left, jump rail right) + `1fr 280px` ratio (D4.11); trim extra
  `stagesGrid`/`slicesPreview` or reorder below activity (D4.14).
- Activity: rewrite `buildActivityList()` to `span.when` + `span.what > span.file + span.who` (D4.9);
  add `aside > nav.so-rail` jump links with `.count` per stage (D4.10).
- `workflow-index.mjs`: import `_figure` and render Figure 2 for quick/investigative slugs (D4.12).

### Slice 5 — Slice grid + cards  · `renderers/slice-index.mjs`, `assets/sdlc.css`
**Effort M · Risk low · Depends: Slice 1.**

- `sliceGridFigure()`: replace rect grid with a dependency-graph SVG from `depends-on` — positioned
  nodes, directed `<path>` edges, `<polygon>` arrowheads (D7.1); title "slice dependency graph" (D7.8);
  4-entry legend incl. `queued`, relabel `active`→`in review` (D7.7).
- `sliceCard()`: `sc-hd` (serif `sc-name` + tinted `sc-pill`) (D7.2); `sc-meta` file/review/blocker
  counts (D7.3); `sc-bar` state-colored progress (D7.4); `sc-foot` recency + `.pct` (D7.5); map status
  to design state classes `complete|in-progress|blocked|not-started` (D7.6); drop always-empty
  `.slice-title` span (D7.10).

### Slice 6 — Sibling-YAML data tier  · schema + write-time authoring + renderer consumption
**Effort L · Risk med · Depends: none (but gates Slices 7–9 structured output).**

- Define and document a `NN-<type>.yaml` schema per artifact type (plan files/topology, review
  dimensions/heatmap, rca timeline/causes, design tokens/specs, ship-run checks) (D8.10).
- Wire the artifact-write step (skill prompts / commands) to emit the YAML sibling alongside every
  `NN-<type>.md`. Until `sy` is non-null, `plan.mjs`/`review*.mjs`/`rca.mjs`/`design.mjs`/`ship-run.mjs`
  fall back to `renderSimple()`.
- Verify the renderers' existing `sy`-gated tiers fire once data exists (unblocks D5.1, D6.3, D8.3/5/6).

### Slice 7 — Plan structured components + topology  · `renderers/plan.mjs`, `assets/sdlc.css`
**Effort L · Risk med · Depends: Slice 1 (CSS), Slice 6 (topology data).**

- Topology figure: render from sibling YAML; provide a placeholder-node default when data absent so the
  figure is never wholly missing (D5.1). File nodes: LOC sublabel (D5.2), `line-through` on deleted
  (D5.3), edge labels "replaces"/"styles" (D5.4).
- Structured body sections (all currently absent): `dl.frontmatter-card` from frontmatter (D5.7);
  `ul.ac-list` with `.chk` glyph + `.ac-id` + `.ac-note` (D5.8, D5.13 emission); `table.files-touched`
  with role pills + signed deltas + expandable rows (D5.9); `callout risk-*` blocks (D5.11 emission);
  `details.revisions` from frontmatter (D5.12). Section headings via `h2.sec` (D5.15).

### Slice 8 — Review master renderer + heatmap/verdict  · `renderers/review-master.mjs` (new), `review.mjs`, `review-dimension.mjs`, `_icons.mjs`, router
**Effort M · Risk med · Depends: Slice 1 (CSS), Slice 6 (dimension data).**

- Create `review-master.mjs` and wire it into the type router so the review index stops hitting
  `fallbackRender` (D6.2, D6.4 root). Invoke `verdictBlock()` (emit `.v-text` 30px serif — D6.9) and
  `metricRow()`/`sev-row` (D6.4).
- `heatmapSvg()`: width 920, add Σ totals column + totals row (D6.10); curated cell tints (D6.14).
- Render verdict + metric-row + structured findings on per-dimension pages instead of prose (D6.13).
- `.fact.*` action chips (D6.15 emission); suppress dev frontmatter dump once a fragment is present (D6.16).
- Heatmap data from Slice 6 sibling YAML (D6.3 data half).

### Slice 9 — Authored-fragment interactivity tier  · write-time fragment authoring + embedding
**Effort XL · Risk med-high · Depends: Slice 2 (html attr), Slice 6 (data), Slice 8 (review-master coexist).**

- Author one `.html.fragment` per gallery type at artifact-write time — the ingestion in
  `render-sunflower.mjs:441–474` is already correct; only the authoring is missing (D8.1):
  - `fragment-review`: dim-bar chips, severity filter + sort controls, findings `<ol>` with confidence
    bars, evidence `<details>` diffs, copy-as-PR buttons, inline `<script>` (D8.2 → covers D6.1, D6.5,
    D6.6, D6.7, D6.8, D6.11).
  - `fragment-rca`: clickable SVG timeline (`:target`), heatmap, causes grid (D8.3).
  - `fragment-plan`: collapsible diff rows, topo legend, revisions (D8.4).
  - `fragment-design`: swatch matrix, token-copy buttons, annotated spec panel (D8.5).
  - `fragment-shiprun`: animated canary pulse, log-cell viewer, rollback dialog (D8.6).
- Each fragment dispatches `sdlc:fragment-ready` (D8.7).
- Embedding polish: drop the wrapping `<div class="fragment">` so `.gw-fragment > section` padding
  applies (D8.8); use CSS-class hover/focus states in fragment SVGs (D8.9).

---

## Recommended execution order

```
Slice 1 (CSS foundation)
  └─ Slice 2 (shell/chrome)
  └─ Slice 3 (dashboard)        ┐ independent of data tier —
  └─ Slice 4 (slug overview)    │ can run in parallel after Slice 1
  └─ Slice 5 (slice grid)       ┘
Slice 6 (sibling-YAML tier)     ← gate for structured output
  └─ Slice 7 (plan components)
  └─ Slice 8 (review master)
       └─ Slice 9 (fragments)   ← last; needs Slices 2 + 6 + 8
```

Slices 1–5 deliver visible parity (chrome + all four static figures) with no data-tier dependency.
Slices 6–9 deliver the structured + interactive tiers.

---

## Won't-fix / keep ledger

| Finding | Decision | Rationale |
|---|---|---|
| D3.1 | won't fix | Keep 10-stage lifecycle; design Figure 1 (8 cols) omits slice+handoff and is the stale side. |
| D4.3 | won't fix (flagged) | Held consistent with D3.1; override if slug page should show 8 while dashboard shows 10. |
| D3.16 | keep | `Quick & investigative` section is required so quick-slug pages are reachable. |
| D2.10 | keep | Renderer footer is a benign, palette-consistent addition. |
| D1.13 | no-op | `--serif` already matches `sdlc-design-iterations.html`; two design sources disagree. |
| D2.9 | no-op | Per-`.pg` hairline is a multi-page-per-scroll device; one-file-per-artifact doesn't map. |

---

## Traceability — every finding mapped

- **Slice 1**: D1.2 D1.3 D1.4 D1.5 D1.6 D1.7 D1.8(css) D1.9 D1.10 D1.11 D1.12 D1.14 · D2.7 · D3.13 D4.13 D5.6 D5.10 D5.13(css) D5.14 D5.11(css) · D6.14 D6.15(css) D7.9 · no-op D1.13 D2.9
- **Slice 2**: D2.1 D2.2 D2.3 D2.4 D2.5 D2.6 D2.8 · D8.7 · keep D2.10
- **Slice 3**: D3.2 D3.3 D3.4 D3.5 D3.6 D3.7 D3.8 D3.9 D3.10 D3.11 D3.12 · keep D3.16 · won't-fix D3.1
- **Slice 4**: D4.1 D4.2 D4.4 D4.5 D4.6 D4.7 D4.8 D4.9 D4.10 D4.11 D4.12 D4.14 · won't-fix D4.3
- **Slice 5**: D7.1 D7.2 D7.3 D7.4 D7.5 D7.6 D7.7 D7.8 D7.10
- **Slice 6**: D8.10
- **Slice 7**: D5.1 D5.2 D5.3 D5.4 D5.7 D5.8 D5.9 D5.11 D5.12 D5.13(emit) D5.15
- **Slice 8**: D6.2 D6.3 D6.4 D6.9 D6.10 D6.13 D6.16
- **Slice 9**: D8.1 D8.2 D8.3 D8.4 D8.5 D8.6 D8.7 D8.8 D8.9 · D6.1 D6.5 D6.6 D6.7 D6.8 D6.11

All 94 confirmed + 7 needs-nuance findings are accounted for across 9 slices + the won't-fix/keep ledger.
