# Sunflower view — parity audit against sdlc-handoff

## 1. Executive summary

The Sunflower renderer produces pages that are structurally navigable but fail design parity at every major figure and all interactive layers. The single most consequential gap is that **zero `.html.fragment` files have ever been authored** (D8/D8.1), meaning all five rich fragment experiences — the interactive review sweep, RCA timeline, plan topology, design swatch matrix, and ship-run log viewer — are entirely absent from every rendered page. Compounding this, **no sibling `.yaml` files exist for any workflow artifact** (D8/D8.10), so every renderer that gates structured output on `sy` (rca.mjs, design.mjs, ship-run.mjs, plan.mjs) falls back to `renderSimple()` — plain frontmatter + prose — universally. The visual figures mandated by the design (Figure 1 swimlane, Figure 2 stage stripe, Figure 3 topology, Figure 4 heatmap, Figure 5 dependency graph) are either absent or structurally divergent in every case. The base color palette and CSS custom-property names reach approximate parity; headline typography values (font-sizes, margins) drift by 1–4 px/px across most tokens. The shell chrome (topbar, breadcrumb, brand text) diverges structurally from the design's three-column grid layout. Of 101 raw findings across 8 dimensions, **94 are confirmed** and **7 need nuance**; 4 were excluded as false positives after adversarial re-verification.

---

## 2. Parity scorecard

| Dimension | Parity verdict | Confirmed findings | Headline gap |
|---|---|---|---|
| D1 · Base design system — palette, typography, tokens | minor-drift | 11 | Font-size, margin, and token values drift 1–4 units on most typographic primitives |
| D2 · Shell / page chrome / navigation | major-drift | 9 | Topbar is flex not 3-col grid; brand text, crumb model, and actions slot all wrong |
| D3 · Figure 1 — Dashboard swimlanes + project ledger | major-drift | 15 | Solid progress rail, column rules, SHIPPED separator, blocker annotations, status glyphs all absent |
| D4 · Figure 2 — Slug Overview stage progress + activity + jump rail | major-drift | 14 | SVG metric callout row absent; jump rail absent; quick/investigative slugs have no figure at all |
| D5 · Figure 3 — Plan: file-topology graph + plan body | major-drift | 14 | Topology graph absent (no sibling YAML); frontmatter-card, ac-list, files-touched table, risk callouts, revisions all absent |
| D6 · Figure 4 — Review Sweep: verdict + heatmap + interactive findings | major-drift | 12 | Review master renders via `fallbackRender` (no `review-master.mjs`); heatmap, verdict block, all interactive controls absent |
| D7 · Figure 5 — Slice Grid + slice cards | major-drift | 10 | Dependency graph absent (plain rect grid instead); sc-hd, sc-meta, sc-bar, sc-foot all absent from slice cards |
| D8 · Rich fragment delivery + interaction layer (cross-cutting) | absent | 9 | No `.html.fragment` files authored; no sibling YAMLs; `sdlc:fragment-ready` never dispatched |

---

## 3. Deviations by dimension

### D1 · Base design system — palette, typography, tokens

| ID | Sev | Kind | Design mandate | Actual output | Impact |
|---|---|---|---|---|---|
| D1/D1.8 | high | divergent | `.verdict` has `.v-label` (11 px uppercase) + `.v-text` (26 px serif) — `sdlc-fragments-gallery.html:100–112` | `verdictBlock()` emits only `.v-label`; `.v-text` never generated — `renderers/_icons.mjs:33–38`; no `.v-text` rule in `sdlc.css` | All verdict blocks collapse the two-level typographic hierarchy into a single 24 px heading |
| D1/D1.5 | medium | divergent | `.metric-label` 11 px, letter-spacing 0.08 em, no font-weight — `sdlc-fragments-gallery.html:171–174` | 10 px, letter-spacing 0.10 em, font-weight 600 — `sdlc.css:307–314` | Metric labels are smaller, tighter, and bold across all metric-row components |
| D1/D1.6 | medium | divergent | `.metric-value` 26 px, line-height 1.1, letter-spacing −0.01 em — `sdlc-fragments-gallery.html:175–178` | 28 px, no line-height, no letter-spacing — `sdlc.css:315–322` | Values render 2 px larger; loose multi-digit values may feel wider than designed |
| D1/D1.9 | medium | token-mismatch | Verdict borders: desaturated soft tints (e.g. ship `#c9deba`) — `sdlc-fragments-gallery.html:97–99` | Full-strength severity foreground tokens (e.g. ship `var(--low)=#3e7d4a`) — `sdlc.css:286–288` | Verdict borders are visually stronger than the design's calm desaturated palette |
| D1/D1.11 | medium | missing | Global `code` rule: background `var(--paper-2)`, padding 1 px 5 px, border-radius 3 px, color `var(--ink-2)` — `sdlc-fragments-gallery.html:52` | `code, pre { font-family: var(--mono); }` only — `sdlc.css:67` | Inline `<code>` outside `.prose` (breadcrumbs, slice-slug, meta rows) renders as bare monospace with no chip |
| D1/D1.2 | low | divergent | `.sdlc-h2` margin-top 28 px — `sdlc-fragments-gallery.html:72` | margin-top 24 px — `sdlc.css:146` | Section headings sit 4 px closer to preceding content on all pages |
| D1/D1.3 | low | missing | `.sdlc-h1` line-height 1.15, margin-bottom 6 px — `sdlc-fragments-gallery.html:57–64` | No line-height; margin-bottom 8 px — `sdlc.css:131–138` | Long page titles may wrap at browser default line-height |
| D1/D1.4 | low | divergent | `.sdlc-crumb` font-size 12.5 px, margin-bottom 4 px, no letter-spacing — `sdlc-fragments-gallery.html:83–88` | 11 px, margin-bottom 6 px, letter-spacing 0.02 em — `sdlc.css:156–162` | Crumb labels are 1.5 px smaller with unspecified tracking |
| D1/D1.10 | low | divergent | `a:hover` reveals `border-bottom-color: var(--accent)` — `sdlc-fragments-gallery.html:53–54` | `a:hover { text-decoration: underline; }` — `sdlc.css:65–66` | Link hover uses native underline instead of the slide-in border-bottom |
| D1/D1.12 | low | token-mismatch | Inline code border-radius 3 px — `sdlc-fragments-gallery.html:52` | `border-radius: var(--rad-sm)` = 4 px — `sdlc.css:43,113` | 1 px systematic overshoot on all `.prose code` elements |
| D1/D1.7 | low | divergent | `.metric-row` margin-bottom 22 px; `.metric` padding 14 px 18 px — `sdlc-fragments-gallery.html:158–169` | margin-bottom 16 px (via `--gap`); `.metric` padding 14 px 16 px — `sdlc.css:295–304` | **Note (needs nuance):** bottom margin is 16 px, not 0 as originally stated; the gap is 6 px, not 22 px. Padding is 2 px narrower per side. |
| D1/D1.14 | info | extra | `--sev-*`, `--gap`, `--pad`, `--rad-*` tokens not in any design spec — `sdlc-fragments-gallery.html:17–41` | Defined in `sdlc.css:30–49` | Undocumented token surface; `--rad-sm: 4px` is the root cause of D1/D1.12 |
| D1/D1.13 | info | extra | `--serif` stack: Iowan / Palatino / Georgia — `sdlc-fragments-gallery.html:38` | Adds "Source Serif Pro" — `sdlc.css:37` | **Note (needs nuance):** `sdlc-design-iterations.html:268` also includes Source Serif Pro; two design sources disagree. Renderer matches design-iterations. |

---

### D2 · Shell / page chrome / navigation

| ID | Sev | Kind | Design mandate | Actual output | Impact |
|---|---|---|---|---|---|
| D2/D2.1 | critical | divergent | `div.b-topbar` — `display:grid; grid-template-columns: auto 1fr auto; padding: 22 px 64 px; background: var(--paper-2)` — `sdlc-design-iterations.html:284–294` | `nav.topnav` — `display:flex; padding: 14 px 32 px; background: var(--paper)` — `renderers/_shell.mjs:66; sdlc.css:72–82` | Three-slot grid layout not reproduced; 8 px vertical / 32 px horizontal padding shortfall; wrong background token |
| D2/D2.2 | high | divergent | Brand text `.ai/workflows`, letter-spacing 0.005 em — `sdlc-design-iterations.html:1025,295–301` | Brand text `sdlc`, letter-spacing −0.01 em — `renderers/_shell.mjs:67; sdlc.css:83–88` | Brand string and tracking direction both wrong |
| D2/D2.3 | high | divergent | `div.crumb` — sans 14 px editorial prose with bold current segment — `sdlc-design-iterations.html:1026,302–303` | `ol.breadcrumb` — mono 12 px with `/` separators — `renderers/_shell.mjs:40–46,68; sdlc.css:94–96` | Editorial register replaced by path-list semantics |
| D2/D2.4 | high | missing | Actions slot: `⌘K to search · viewing as <b>you</b>` (third grid column) — `sdlc-design-iterations.html:1027,304` | `span.meta` with slug + status, empty on dashboard — `renderers/_shell.mjs:69; _view/INDEX.html:15` | Search affordance and viewer identity entirely absent |
| D2/D2.5 | high | divergent | `h1.pg-title` 36 px — `sdlc-design-iterations.html:1033,307–315` | `h1.sdlc-h1` 30 px; `.pg-title` declared in CSS but never emitted — `renderers/_shell.mjs:103; sdlc.css:131–138,164` | All page titles 6 px smaller than designed; `.pg-title` is a dead CSS declaration |
| D2/D2.6 | medium | divergent | `h2.sec` 12 px, margin 40 px 0 14 px, padding-bottom 8 px — `sdlc-design-iterations.html:323–333` | `.sdlc-h2` 11 px, margin 24 px 0 12 px, padding-bottom 6 px — `renderers/dashboard.mjs:108; sdlc.css:139–149` | All section headings smaller and more compressed than specified |
| D2/D2.7 | low | divergent | `p.pg-sub` max-width 60 ch, margin-bottom 36 px, line-height 1.55 — `sdlc-design-iterations.html:316–320` | `p.sdlc-lede` max-width 64 ch, margin-bottom ~16 px, no line-height — `sdlc.css:150–154` | Lede sits 20 px closer to next element than designed |
| D2/D2.8 | low | extra | `.b-topbar` is static — `sdlc-design-iterations.html:284–294` | `.topnav { position: sticky; top: 0; z-index: 10; }` — `sdlc.css:81` | Nav overlaps content on scroll; not in design spec |
| D2/D2.9 | info | missing | Per-section top hairline `border-top: 1px solid var(--rule)` (suppressed on first) — `sdlc-design-iterations.html:277–278` | No border-top on `.content` — `sdlc.css:101–105` | **Note (needs nuance):** The design's `.pg` hairline is a multi-`.pg`-in-one-scroll-document device; the renderer uses one artifact per file, so the concept does not map. Architectural difference rather than an oversight. |
| D2/D2.10 | info | extra | No footer defined for Variant B pages | `<footer class="bottom">` with up/updated/md links — `renderers/_shell.mjs:78–84; sdlc.css:1138–1152` | Benign addition; styling is consistent with the calm-reader palette |

---

### D3 · Figure 1 — Dashboard swimlanes + project ledger

| ID | Sev | Kind | Design mandate | Actual output | Impact |
|---|---|---|---|---|---|
| D3/D3.1 | high | divergent | 8 stage columns (intake → retro) — `sdlc-design-iterations.html:1060–1067` | 10 columns adding `slice` and `handoff` — `renderers/dashboard.mjs:18–21; _view/INDEX.html:35` | Column count and stage vocabulary do not match design; extra columns compress spacing |
| D3/D3.2 | high | missing | `<g class="rule-light">` with 8 vertical `<line>` column separators at x = 220…780 — `sdlc-design-iterations.html:1048–1057` | No vertical rule lines emitted — `renderers/dashboard.mjs:151–191` | Swimlane has no column delineation |
| D3/D3.3 | high | missing | Solid `<line class="ink">` progress overlay from start to current stage, then dashed tail — `sdlc-design-iterations.html:1073–1074` | Only dashed tail emitted; no solid ink progress line — `renderers/dashboard.mjs:181–183` | Progress vs. upcoming visual distinction entirely absent |
| D3/D3.4 | high | missing | Full-width dashed separator at y = 278 and `SHIPPED` mono label below it — `sdlc-design-iterations.html:1144–1146` | No separator or label emitted — `renderers/dashboard.mjs:151–191` | Active and shipped projects separated by HTML headings, not the unified SVG rule |
| D3/D3.6 | high | missing | Inline `<text>` annotations `· 2 blockers` / `· rev 3` adjacent to current-stage dot — `sdlc-design-iterations.html:1093,1115,1126` | No annotation text emitted; only dot fill color signals blocked state — `renderers/dashboard.mjs:166–185` | Blocker counts and revision numbers invisible in the swimlane |
| D3/D3.7 | high | missing | `<div class="desc">` multi-sentence project description per row — `sdlc-design-iterations.html:1181–1185` | No `.desc` emitted — `renderers/dashboard.mjs:139–148` | Ledger rows carry no contextual description |
| D3/D3.8 | high | missing | `<span class="status bad/ok/warn/idle"><span class="glyph">●/◉/◐/◎</span>` per row — `sdlc-design-iterations.html:1183–1185` | `<span class="meta">` with raw ISO timestamp — `renderers/dashboard.mjs:147` | At-a-glance health state column replaced by machine-readable date string |
| D3/D3.5 | medium | missing | Not-started rows use dashed-stroke circle (r = 6, stroke-dasharray = "2.5 2") with only a dashed tail, no filled dots — `sdlc-design-iterations.html:1137–1142` | All non-current non-done stages get identical solid open circle — `renderers/dashboard.mjs:171–179` | Queued/not-started visual vocabulary not implemented |
| D3/D3.9 | medium | missing | `<span class="time">` with human-relative string ('12 min ago') — `sdlc-design-iterations.html:1185,1195` | `fm['updated-at']` emitted verbatim as `.meta` — `renderers/dashboard.mjs:147` | Time column shows ISO-8601 instead of human-relative format |
| D3/D3.10 | medium | divergent | `<article class="project-row">` with nested `.name` (serif 19 px) + `.slug` stacked below — `sdlc-design-iterations.html:1178–1186` | `<a class="project-row">` with flat sibling spans `.slug` + `.title` — `renderers/dashboard.mjs:143–148` | Serif/monospace stacked hierarchy not reproduced; rows are a flat link list |
| D3/D3.11 | medium | missing | `<span class="stage-pill cur/done">` variant classes — `sdlc-design-iterations.html:1183,1250,1281` | Bare `<span class="stage-pill">` with no variant — `renderers/dashboard.mjs:146; sdlc.css:551–558` | All stage pills render with identical accent-blue styling regardless of status |
| D3/D3.12 | medium | divergent | Section label `Recently shipped` — `sdlc-design-iterations.html:1243` | Rendered as `Complete` — `renderers/dashboard.mjs:50,76; _view/INDEX.html:54` | Temporal `recently` qualifier and vocabulary alignment with SVG SHIPPED label lost |
| D3/D3.13 | low | divergent | Legend uses semantic `<span class="sw done/review/blocked/queued">` — `sdlc-design-iterations.html:1040–1043` | `<span class="sw" style="background:#hex">` inline style only — `renderers/_figure.mjs:32–37` | `.sw.queued` dashed-border swatch not reproducible via inline style |
| D3/D3.14 | low | divergent | `h2.sec` 12 px, margin 40 px 0 14 px — `sdlc-design-iterations.html:323–333` | `.sdlc-h2` 11 px, margin 24 px 0 12 px — same as D2/D2.6; applies to dashboard section headings | Visual compression of ledger sections |
| D3/D3.16 | info | extra | No quick/investigative section in Figure 1 design — `sdlc-design-iterations.html:1036–1295` | `quickSection()` emits `Quick & investigative` with 5 entries — `renderers/dashboard.mjs:118–137` | Additive extension with no design basis; pushes no existing element out of position |

---

### D4 · Figure 2 — Slug Overview stage progress + activity + jump rail

| ID | Sev | Kind | Design mandate | Actual output | Impact |
|---|---|---|---|---|---|
| D4/D4.8 | critical | missing | Bottom SVG metric callout row: second rule at y = 186, five `text.metric-lbl` + `text.metric-num` groups (LOC TOUCHED, SLICES, REVIEWS, BLOCKERS, TESTS) — `sdlc-design-iterations.html:1382–1405` | `stageStripeSvg()` emits only baseline rule and station elements; no second rule or metric groups — `renderers/index.mjs:100–130` | Entire summary metric callout band absent |
| D4/D4.10 | critical | missing | `<aside>` with `<nav class="so-rail">` jump links per stage, each with `<span class="count">N</span>` — `sdlc-design-iterations.html:1421–1430` | `so-grid` aside contains activity feed; no `nav.so-rail` anywhere — `renderers/index.mjs:77,85–93` | Quick-navigation sidebar entirely absent |
| D4/D4.12 | critical | missing | Figure 2 `figure-canvas` opening element mandated for all slug overview pages — `sdlc-design-iterations.html:1308–1407` | `workflow-index.mjs` emits no `figureCanvas`; no import of `_figure.mjs` — `renderers/workflow-index.mjs:1–67; rca-google-signin-broken/INDEX.html:18–85` | Entire Figure 2 stage-stripe absent for all quick/investigative workflow slugs |
| D4/D4.1 | high | missing | `.so-hd` two-column grid: `h1.pg-title` + `p.lede` + `aside span.badge` — `sdlc-design-iterations.html:1300–1306` | Flat `.artifact-header` with `h1.sdlc-h1`; `lede` hard-coded to empty string — `renderers/index.mjs:38–49` | Two-column project identity block absent; lede and branch badge missing |
| D4/D4.4 | high | missing | Solid `<line class="ink-strong">` overlay from x1 = 60 to current stage x — `sdlc-design-iterations.html:1321` | Single baseline rule only — `renderers/index.mjs:106; brutalist-redesign/INDEX.html:34` | Done-vs-upcoming progress rail absent |
| D4/D4.5 | high | missing | Per-station date `<text y="-28">05-NN</text>` above each circle — `sdlc-design-iterations.html:1326–1365` | No date text emitted; frontmatter dates not read — `renderers/index.mjs:108–123` | Dated timeline entirely absent |
| D4/D4.9 | high | divergent | Activity list: `span.when` (human-relative), `span.what > span.file + span.who`; two-column 110 px / 1 fr grid — `sdlc-design-iterations.html:1412–1418` | `ol.activity-list > li > a > span.stage-badge + span.meta (ISO date) + br + code` — `renderers/index.mjs:149–155` | Human-narrative structure replaced by machine artifact metadata |
| D4/D4.2 | medium | divergent | SVG `viewBox="0 0 920 230"` — `sdlc-design-iterations.html:1317` | `viewBox="0 0 980 130"` — `renderers/index.mjs:101,126` | Canvas 100 px shorter and 60 px wider; upper/lower annotation zones cannot display |
| D4/D4.3 | medium | divergent | 8 stations (intake → retro) — `sdlc-design-iterations.html:1322–1380` | 10 stations (adds `slice`, `handoff`) — `renderers/index.mjs:13–16` | Stage rail does not match the canonical 8-station figure |
| D4/D4.6 | medium | divergent | Semantic per-station annotations: `3 revisions`, `6/7 slices`, `214 ✓` — `sdlc-design-iterations.html:1341,1349,1357` | Generic `N artifact(s)` count — `renderers/index.mjs:119–121` | Semantic progress cues replaced by raw artifact counts |
| D4/D4.11 | medium | divergent | `.so-grid`: left = activity, right = jump rail; `grid-template-columns: 1fr 280px` — `sdlc-design-iterations.html:1409–1431` | Left = prose fallback, right = activity; `grid-template-columns: 1.6fr 1fr` — `renderers/index.mjs:85–93; sdlc.css:563–569` | Column roles inverted; sizing ratio wrong |
| D4/D4.7 | low | divergent | Current station `<circle r="22">` with inner dashed ring r = 14 — `sdlc-design-iterations.html:1362` | Current station r = 11, outer ring r = 16 — `renderers/index.mjs:113–115` | `you-are-here` accent understated relative to design |
| D4/D4.13 | low | token-mismatch | Legend uses `<span class="sw done/review/queued">` — `sdlc-design-iterations.html:1312–1314` | `<span class="sw" style="background:#hex">` — `renderers/_figure.mjs:32–37` | `.sw.queued` dashed-border not reproducible; same root cause as D3/D3.13 |
| D4/D4.14 | info | extra | Page 2 contains: so-hd + figure-canvas + so-grid only — `sdlc-design-iterations.html:1297–1433` | `stagesGrid()` and `slicesPreview()` inserted between figure and so-grid — `renderers/index.mjs:77–95` | Extra sections push activity feed and prose far down the page |

---

### D5 · Figure 3 — Plan: file-topology graph + plan body

| ID | Sev | Kind | Design mandate | Actual output | Impact |
|---|---|---|---|---|---|
| D5/D5.1 | critical | missing | `<figure class="figure-canvas">` opening every plan page with inline SVG topology graph — `sdlc-design-iterations.html:1442–1513` | Figure gated on `sy?.files?.length`; no sibling YAML exists for any plan artifact; zero plan pages contain `figure-canvas` — `renderers/plan.mjs:33–61` | Topology figure absent from every rendered plan page |
| D5/D5.7 | critical | missing | `<dl class="frontmatter-card">` with slug/parent/files/revisions/blockers/est-LOC/depends-on/tags — `sdlc-design-iterations.html:1515–1525` | No `frontmatter-card` emission in `plan.mjs` — `renderers/plan.mjs:11–76` | All plan-level metadata absent as a structured visual component |
| D5/D5.8 | critical | missing | `<ul class="ac-list">` with `.chk.done/.todo/.fail` + `.ac-id` + criterion text + `.ac-note` — `sdlc-design-iterations.html:1527–1535` | No `ac-list` emission — `renderers/plan.mjs:11–76` | Acceptance criteria section entirely absent from all plan pages |
| D5/D5.9 | critical | missing | `<table class="files-touched">` with thead (Path/LOC/Δ/Role), expandable `<details>` path cells, `.pos`/`.neg` delta spans, `.role` pills — `sdlc-design-iterations.html:1537–1593` | No table generated; delegated to absent fragment — `renderers/plan.mjs:65–66` | Files-touched section absent from all plan pages |
| D5/D5.2 | high | missing | Each file node has second `<text>` with LOC sublabel (e.g. `new · +142`) — `sdlc-design-iterations.html:1461–1486` | `fileSvg` emits one `<text>` per node (filename only) — `renderers/plan.mjs:130–145` | When figure does render, file nodes lack LOC delta information |
| D5/D5.11 | high | missing | `<div class="callout risk-high/risk-med/risk-low">` with `.callout-hd` — `sdlc-design-iterations.html:1596–1608`; design CSS uses compound modifier `callout risk-high` — `sdlc-design-iterations.html:615–620` | No callout emission; renderer CSS uses standalone `callout-risk/warn/info/ok` — `sdlc.css:353–360` | Risk callouts absent; CSS class names incompatible with design markup |
| D5/D5.12 | high | missing | `<details class="revisions">` with `<summary>Prior revisions (N)</summary>` and `.when` revision items — `sdlc-design-iterations.html:1610–1617` | No `details.revisions` emission; `renderHistoryBlock` handles git history only — `renderers/plan.mjs:63–75` | Plan revision narrative absent from all plan pages |
| D5/D5.15 | high | degraded | Five `<h2 class="sec">` section headings introducing structured components (Frontmatter / AC / Files / Risks / Revisions) — `sdlc-design-iterations.html:1515–1617` | `<div class="prose">` with markdown-derived headings only — `renderers/plan.mjs:63–75` | Plan pages are a markdown document reader; all structured interactive components absent |
| D5/D5.3 | medium | missing | Deleted file nodes: `text-decoration="line-through"` — `sdlc-design-iterations.html:1480` | No `text-decoration` attribute on any node — `renderers/plan.mjs:130–145` | Deleted files visually indistinguishable from modified except by fill color |
| D5/D5.4 | medium | missing | Inline edge labels `replaces` / `styles` as freestanding `<text>` elements — `sdlc-design-iterations.html:1502–1503` | `edgeSvg` emits `<path>` only; no text labels — `renderers/plan.mjs:147–157` | Relationship semantics between files not communicated |
| D5/D5.10 | medium | divergent | `<table class="files-touched">` with `<thead>/<tbody>/<th>/<td>` — `sdlc-design-iterations.html:1537–1545,554–596` | `.files-touched .row` as CSS `display:grid; grid-template-columns: 80px 1fr 80px` — `sdlc.css:364–387` | Even if a fragment emits the design's `<table>`, the CSS would not style it correctly |
| D5/D5.13 | medium | divergent | `.ac-list .chk` is a mono text glyph (✓/○/✗ literal Unicode) — `sdlc-design-iterations.html:543–550,1529–1534` | `.chk` is a 16×16 px CSS box with `::after` pseudo-element — `sdlc.css:649–661` | Todo state shows empty box instead of `○` glyph; structural divergence |
| D5/D5.6 | low | divergent | Legend uses `<span class="sw new/modified/deleted/external">` — `sdlc-design-iterations.html:1445–1450` | `<span class="sw" style="background:#hex">` — `renderers/_figure.mjs:32–37` | Legend colors hardcoded; not updateable via token changes |
| D5/D5.14 | low | divergent | `.frontmatter-card` uses `repeat(auto-fit, minmax(180 px, 1fr))`; `dt` is uppercase — `sdlc-design-iterations.html:520–530` | Fixed `grid-template-columns: minmax(140 px, 220 px) 1fr`; `dt` not uppercase — `sdlc.css:609–627` | Layout and label treatment diverge from responsive multi-column spec |

---

### D6 · Figure 4 — Review Sweep: verdict + heatmap + interactive findings

| ID | Sev | Kind | Design mandate | Actual output | Impact |
|---|---|---|---|---|---|
| D6/D6.1 | critical | missing | `<section class="fragment-review">` with dim-bar, severity filter + sort controls, findings `<ol>` with confidence bars, copy-as-PR buttons, and inline `<script>` — `sdlc-fragments-gallery.html:661–1081` | Only `<div class="prose">` — `scripts/render-sunflower.mjs:452–454; brutalist-redesign/review/INDEX.html:24–1228` | Entire interactive review experience absent |
| D6/D6.2 | critical | missing | Prominent `.verdict.caveats` block as first visible element — `sdlc-design-iterations.html:1627–1631` | No `.verdict` element; verdict buried as markdown `<h2>` — `brutalist-redesign/review/INDEX.html` | **Note (needs nuance):** `07-review.md` frontmatter does have `verdict: Ship with caveats`; the real cause is no `review-master.mjs` renderer exists, so `fallbackRender` is invoked instead. The verdict block is genuinely absent; only the cited mechanism was wrong. |
| D6/D6.3 | critical | missing | `<figure class="figure-canvas">` heatmap SVG 920×340 with six columns, per-dimension rows, Sigma totals row — `sdlc-design-iterations.html:1633–1758` | No `figure-canvas` anywhere — `brutalist-redesign/review/INDEX.html` | **Note (needs nuance):** Proximate cause is the missing `review-master.mjs` renderer (fallbackRender used), not the heatmap gate in `review.mjs`. Even if correctly wired, no sibling YAML with dimensions data exists. Both the absent renderer and absent data are real problems. |
| D6/D6.5 | high | missing | Severity filter-bar and sort controls — `sdlc-design-iterations.html:1761–1769; sdlc-fragments-gallery.html:691–710` | `renderSimple` fallback (no `.yaml` sibling); only `<dl class="frontmatter-card">` + `<div class="prose">` — `renderers/review-dimension.mjs:20–27` | All interactive controls missing from per-dimension review pages |
| D6/D6.6 | high | missing | `.fr-row .fconf.is-high/is-med/is-low::before` gradient confidence bars (90%/60%/30%) — `sdlc-fragments-gallery.html:594–603` | No `.fconf` elements; no confidence-bar CSS — `renderers/_icons.mjs:66–91` | Per-finding confidence signal absent |
| D6/D6.7 | high | missing | `<details><summary>Evidence…</summary>` with `<pre>` diff (`.add/.del/.ctx` spans) + `<button class="copy-pr" data-copy-finding>` — `sdlc-design-iterations.html:1782–1793` | No `<details>`, no diff `<pre>`, no copy-PR button — `renderers/_icons.mjs:66–91; assets/sdlc.js:38–57` | Evidence diffs and PR-comment workflow entirely missing |
| D6/D6.8 | high | missing | `.fr-dim-bar` with per-dimension `<button class="fr-chip" aria-pressed>` — `sdlc-fragments-gallery.html:682–689` | No `.fr-dim-bar` or `.fr-chip`; no CSS or JS — `renderers/review.mjs,review-dimension.mjs` | Dimension-level filtering completely absent |
| D6/D6.4 | high | missing | 5-cell `.sev-row` / `.metric-row` with glyph + label + serif count per severity — `sdlc-design-iterations.html:656–681` | No `.sev-row` or `.metric-row` on any review page | **Note (needs nuance):** For the main page the proximate cause is the missing `review-master.mjs`; `review.mjs` does generate `metricRow()` unconditionally, but it is never invoked. For per-dimension pages, `renderSimple` suppresses it. Net result (absent) is accurate for all pages. |
| D6/D6.13 | high | degraded | Per-dimension pages: structured verdict + metric-row + `<ol class="fr-findings">` — `sdlc-design-iterations.html:1621–1892` | All 19 per-dimension review pages render as `<dl class="frontmatter-card">` + `<div class="prose">` — `renderers/review-dimension.mjs:20–27` | All per-dimension review pages are static prose |
| D6/D6.9 | medium | divergent | Verdict: `.v-label` (12 px uppercase) + `.v-text` (30 px serif with glyph `::before`) + `.v-sum` — `sdlc-design-iterations.html:1627–1631,644–654` | Two children only (`.v-label` 24 px + `.v-sum`); no `.v-text`; no `.v-text` CSS rule — `renderers/_icons.mjs:33–38; sdlc.css:263–278` | When verdict block renders, 30 px serif display text layer is absent |
| D6/D6.10 | medium | divergent | Heatmap SVG `viewBox="0 0 920 340"`, 6 columns including Σ totals column, horizontal rule + totals row — `sdlc-design-iterations.html:1640–1757` | W = 800, 5-column `SEVS` array, no Sigma column, no totals row — `renderers/review.mjs:64–115` | When heatmap renders, it is narrower and lacks the totals column and row |
| D6/D6.11 | medium | missing | Fragment inline `<script>`: filter (severity + dimension), sort (4 modes), copy-as-PR-comment — `sdlc-fragments-gallery.html:979–1080` | `sdlc.js` implements none of these; only `data-copy-target` (not `data-copy-finding`) wired — `assets/sdlc.js:38–57` | **Note:** fragment JS is self-contained and does not rely on `sdlc.js`; the gap is the absent fragment (D6/D6.1), not `sdlc.js`. The filed gap is real but the dependency description is misleading. |
| D6/D6.14 | low | divergent | Heatmap cells use curated per-count sandstone tint hex values — `sdlc-design-iterations.html:1663–1743` | Programmatic `fill-opacity` overlay: 0.05 (zero) or 0.15 + 0.7×(count/max) — `renderers/review.mjs:100–106` | Visual cell tints differ from hand-tuned design palette when heatmap renders |
| D6/D6.15 | low | token-mismatch | Finding action chip: `.fact.accept/.fact.defer/.fact.reject` — `sdlc-design-iterations.html:776–778` | `finding-action is-${action}` — `renderers/_icons.mjs:77; sdlc.css:814–816` | Renderer and its CSS are internally consistent; both diverge from design's `.fact` hierarchy |
| D6/D6.16 | info | extra | No frontmatter dump on review pages — `sdlc-design-iterations.html:1620–1892` | `renderSimple()` emits `<dl class="frontmatter-card">` — `renderers/review-dimension.mjs:20–27` | Developer-facing frontmatter dump present with no design basis; suppressed when fragment is present |

---

### D7 · Figure 5 — Slice Grid + slice cards

| ID | Sev | Kind | Design mandate | Actual output | Impact |
|---|---|---|---|---|---|
| D7/D7.1 | critical | divergent | Figure 5 is a dependency graph SVG 920×260 with directed `<path>` edges and `<polygon>` arrowheads — `sdlc-design-iterations.html:1902–1975` | Plain rectangle grid of `<rect>` cells; no edges or arrowheads; viewBox `0 0 980 N` — `renderers/slice-index.mjs:67–93` | Entire semantic meaning of Figure 5 (dependency order) absent |
| D7/D7.2 | critical | missing | `sc-hd` flex row with `sc-name` (serif 19 px 600) + `sc-pill` (uppercase 11.5 px tinted badge) — `sdlc-design-iterations.html:844–859,1979–1984` | `span.slice-slug` + `span.slice-title` + `span.slice-status` only — `renderers/slice-index.mjs:55–65` | Serif slice name and status pill absent from every card |
| D7/D7.3 | high | missing | `<div class="sc-meta">` with file count, review count, `.blocker-cnt` blocker count — `sdlc-design-iterations.html:860–867,1981` | No `sc-meta`; no CSS rule — `renderers/slice-index.mjs:55–65` | Per-slice quantitative metadata absent |
| D7/D7.4 | high | missing | `<div class="sc-bar"><i style="width:%">` 6 px progress bar with state-driven fill color — `sdlc-design-iterations.html:868–881,1982` | No `sc-bar`; no CSS rule — `renderers/slice-index.mjs:55–65` | Progress bar entirely absent from every slice card |
| D7/D7.5 | high | missing | `<div class="sc-foot"><span>shipped N days ago</span><span class="pct">100%</span>` — `sdlc-design-iterations.html:882–891,1983` | No `sc-foot`; no CSS rule — `renderers/slice-index.mjs:55–65` | Completion percentage and recency label absent |
| D7/D7.6 | medium | divergent | State classes: `complete`, `in-progress`, `blocked`, `not-started` on `.slice-card` — `sdlc-design-iterations.html:857–881` | `is-ok`, `is-bad`, `is-current` — `renderers/slice-index.mjs:56–64; sdlc.css:505–507` | State-driven pill/bar coloring inoperative; only a left-border accent applied |
| D7/D7.7 | medium | missing | Four-entry legend: complete, in-review, blocked, queued — `sdlc-design-iterations.html:1906–1909` | Three-entry legend: complete, active, blocked (second entry also wrong label) — `renderers/slice-index.mjs:35–39` | `queued` legend entry absent; `active` should be `in review` |
| D7/D7.8 | low | divergent | Figure title: `Figure 5 · 7 slices, depends-on arrows · slice dependency graph` — `sdlc-design-iterations.html:1904` | Title: `Figure 5 · Slice grid` — `renderers/slice-index.mjs:33` | Figure does not communicate dependency semantics in its title |
| D7/D7.9 | low | divergent | Legend swatches as named CSS classes `.sw.complete` etc. — `sdlc-design-iterations.html:935–940` | `<span class="sw" style="background:#hex">` inline — `renderers/_figure.mjs:32–37` | Same root cause as D3/D3.13 and D4/D4.13 |
| D7/D7.10 | info | extra | Cards are `<article>` elements — `sdlc-design-iterations.html:1979` | `<a class="slice-card">` anchors; `<span class="slice-title"></span>` always empty — `renderers/slice-index.mjs:60–64` | Anchor is a pragmatic navigation adaptation; empty span adds markup noise |

---

### D8 · Rich fragment delivery + interaction layer (cross-cutting)

| ID | Sev | Kind | Design mandate | Actual output | Impact |
|---|---|---|---|---|---|
| D8/D8.1 | critical | missing | Five `.html.fragment` files authored at artifact-write time — `sdlc-fragments-gallery.html:453–464` | Zero `.html.fragment` files exist anywhere in `Crumb/.ai/` — `render-sunflower.mjs:111,441–474` | All five rich fragment experiences (review, rca, plan, design, ship-run) absent from every page |
| D8/D8.2 | critical | missing | `<section class="fragment-review">` with dim-bar, filter/sort controls, findings `<ol>`, confidence bars, copy buttons, `sdlc:fragment-ready` dispatch — `sdlc-fragments-gallery.html:661–1082` | Only prose fallback; `review.mjs:50–51` fragment conditional never triggers | Entire interactive review UX absent |
| D8/D8.3 | critical | missing | `<section class="fragment-rca">` with clickable SVG timeline (`:target` detail panel), heatmap, causes grid, mouseenter/focus JS — `sdlc-fragments-gallery.html:1259–1566` | No fragment; `rca.mjs:12` returns `renderSimple` (no sibling YAML) — confirmed in `rca-google-signin-broken/rca/INDEX.html` | **Note (needs nuance):** Renderer emits `renderSimple` prose (not the deterministic SVG timeline) because no sibling YAML exists. The deterministic SVG tier at `rca.mjs:47–156` is also never reached in practice. |
| D8/D8.10 | high | degraded | Sibling `.yaml` spec files feed structured renderer output and agent fragment authoring — `sdlc-fragments-gallery.html:2960–3050` | Zero `.yaml` sibling files in `Crumb/.ai/workflows/`; `rca.mjs:12`, `design.mjs:21`, `ship-run.mjs:36` all return `renderSimple` universally — `Crumb/.ai/` | The entire sibling-YAML-driven rendering tier has never been exercised |
| D8/D8.4 | high | missing | `<section class="fragment-plan">` with `.pl-topo-legend`, collapsible `.planned-change` rows, `.pl-revs`, `sdlc:fragment-ready` dispatch — `sdlc-fragments-gallery.html:1720–2039` | Fragment conditional at `plan.mjs:65–66` never triggers; structured plan header renders but no fragment content — `brutalist-redesign/plan/tokens/INDEX.html` | Collapsible per-file diff rows, legend overlay, revision history absent |
| D8/D8.5 | high | missing | `<section class="fragment-design">` with `.dz-matrix` swatch grid, `.tk-copy` token copy buttons, `.dz-specs` annotated SVG panel — `sdlc-fragments-gallery.html:2271–2540` | `design.mjs:21` returns `renderSimple` (no `sy`); `sdlc.js:61–73` wires `[data-token-copy]` which is never emitted | Live swatch matrix, per-token copy, and annotated spec panel absent |
| D8/D8.6 | high | missing | `<section class="fragment-shiprun">` with `.pulse` animated SVG circles, `<button class="sr-cell" data-cell>` log viewer, `.sr-actions` rollback dialog, `sdlc:fragment-ready` — `sdlc-fragments-gallery.html:2661–2955` | `ship-run.mjs:36` returns `renderSimple`; even the deterministic SVG/table (lines 98–163) never fires — `sdlc-fragments-gallery.html` | Check log viewer, animated canary, rollback dialog absent |
| D8/D8.7 | high | missing | Each fragment dispatches `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', ...))` — `sdlc-fragments-gallery.html:1076–1079,2949–2951` | Zero rendered pages contain a dispatch call; `sdlc.js:12–20` listener never triggered — `assets/sdlc.js:12–20` | `body.dataset.fragmentReady` never set; event-driven registration layer non-functional |
| D8/D8.8 | low | divergent | Fragments embed as bare `<section class="fragment-*">` directly in body — `sdlc-fragments-gallery.html:382,661` | All renderers wrap in `<div class="fragment">` — `render-sunflower.mjs:344; rca.mjs:55; plan.mjs:66` | Extra ancestor div; `.gw-fragment > section` padding rule from gallery would not apply correctly |
| D8/D8.9 | low | divergent | Fragment SVGs use CSS class selectors for hover/focus states (`.nodelink:hover .node`, `.file.is-modified`) — `sdlc-fragments-gallery.html:1137–1250` | Renderer SVGs hard-code inline `fill` and `stroke` hex values — `renderers/rca.mjs:119–128; plan.mjs:130–157` | Hover/focus interactivity and token-override inapplicable to renderer SVGs |

---

## 4. What already reaches parity

- **Base CSS custom-property names**: `--paper`, `--paper-2`, `--ink`, `--ink-2`, `--ink-3`, `--accent`, `--accent-soft`, `--rule`, `--mono`, `--serif`, `--blocker`, `--low`, `--med`, and the full severity foreground/background family all match the fragments-gallery spec names and approximate values.
- **`.sdlc-h1` / `.sdlc-h2` class existence**: Both classes are defined and emitted; font-family, font-weight, letter-spacing, and text-transform values are correct. Deviations are numeric (size and margin), not structural.
- **`.prose` markdown rendering**: Standard markdown-to-HTML conversion is applied correctly; `h1`–`h6`, `p`, `ul`, `ol`, `table.prose-table`, and `code` within `.prose` receive consistent styling. No structural findings affect the prose layer.
- **`.metric-row` / `.metric` component existence**: The component is implemented, emits correct `.metric-label` + `.metric-value` structure, and renders on plan and artifact-header pages where invoked (value and label typography drift is filed under D1 but the structure is wired).
- **`.figure-canvas` + `.figure-legend` shell**: The SVG wrapper component, title, and legend scaffold are implemented and rendered on plan/slice/slug overview pages that do reach the figure code path. Inner content deviates but the shell is present.
- **`renderHistoryBlock` git history**: The `<details class="history">` git-commit history block renders correctly where git history is available (`artifactHeader` path).
- **`<dl class="frontmatter-card">` via `renderSimple`**: The frontmatter dump — while not matching the design's styled card — correctly surfaces all frontmatter fields on all fallback-rendered pages, ensuring no data is lost.
- **Page layout scaffold**: Max-width 1100 px centered content column, `padding: 56 px 64 px`, and the overall single-column artifact page structure match the design's `.pg` geometry.

---

## 5. Coverage caveats

### Items the completeness critic identified that are not covered by any confirmed finding

1. **`h3.subsec` heading** (`sdlc-design-iterations.html:337–341`): A third heading class (serif 22 px, 600 weight, margin 32 px 0 12 px) specified in the design system has no confirmed finding on its presence or divergence in the renderer.

2. **`.figures` stat strip on Slug Overview** (`sdlc-design-iterations.html:411–438`): A horizontal `.figures > .figure` grid of borderless metric figures (LOC, slices, stage, etc.) sits between `so-hd` and the SVG timeline. This component is entirely distinct from the SVG metric callout row (D4/D4.8) and is not covered by any finding.

3. **`<p class="figure-caption">`** (`sdlc-design-iterations.html:994–1001`): An italic 13.5 px muted caption block immediately after the plan-page hero figure; no finding covers its absence.

4. **`.section-label` vs `h2.sec` distinction** (`sdlc-design-iterations.html:390–397`): The design uses two heading treatments — a `<p class="section-label">` (no border) and `<h2 class="sec">` (with border-bottom). D2/D2.6 and D3/D3.14 cover `h2.sec` drift but no finding addresses `.section-label` as a separate component.

5. **`ac-list` `.ac-id` and `.ac-note` sub-elements** (`sdlc-design-iterations.html:1529–1534`): D5/D5.8 covers the outer `ac-list` absence but does not enumerate the `<span class="ac-id">` prefix or `<span class="ac-note">` annotation anatomy of each criterion row.

6. **Renderer-only `.refs-card` component** (`sdlc.css:629–638`): A `<dl>` cross-reference grid with no counterpart in any design file. The inverse of D1/D1.14 (extra tokens) — a full structural component with no design basis.

7. **Renderer-only `.rca-five-whys` collapsible panel** (`sdlc.css:694–697`): Defined as a Phase 2 component (v9.21.0) in the renderer CSS with no corresponding element in either `sdlc-design-iterations.html` or `sdlc-fragments-gallery.html`.

8. **`html[data-artifact-type]` vs `body[data-artifact-type]` attribute contract** (`renderers/_shell.mjs:56,65`): The design gallery sets `<html data-artifact-type="gallery">` and fragment JS reads `html[data-artifact-type]`. The renderer puts `data-sdlc-version` on `<html>` and `data-artifact-type` on `<body class="artifact">`. Fragment JS reading `html[data-artifact-type]` will find nothing in the renderer's DOM.

9. **`sdlc.js` `wireSmoothAnchors` guard for `.fragment-rca` `:target`** (`sdlc.js:86–100`): The JS intercepts `a[href^="#"]` and exempts `.fragment-rca`, but since no RCA fragment is ever rendered (D8/D8.3), this exemption is dead code and the `:target` navigation path for RCA detail panels has never been exercised.

### False-positive exclusions

4 raw findings were excluded after adversarial re-verification. They are not present in this report. The net corpus is 94 confirmed + 7 needs-nuance findings as documented above.

---

## 6. Prioritized remediation

### Phase 0 — Critical data blockers (unblock all other phases)

These two gaps are prerequisites; without them the renderer's structured and interactive output can never fire.

| Priority | Finding IDs | Action |
|---|---|---|
| 0-A | D8/D8.10 | Define and document the sibling `.yaml` schema per artifact type; wire the agent prompt to write `NN-type.yaml` alongside every artifact at write-time. Until `sy` is non-null, `rca.mjs`, `design.mjs`, `ship-run.mjs`, and `plan.mjs` universally fallback. |
| 0-B | D8/D8.1, D8/D8.2–D8/D8.7 | Define the agent prompt that produces `.html.fragment` files (one per gallery type). The fragment-read wiring in `render-sunflower.mjs:441–474` is already correct; only the authoring step is missing. |

---

### Phase 1 — Token / typography alignment (low-risk, high-coverage)

Fixes here improve fidelity across every rendered page simultaneously.

| Priority | Finding IDs | Action |
|---|---|---|
| 1-A | D1/D1.14 | Change `--rad-sm` from 4 px to 3 px in `sdlc.css:42`. Fixes D1/D1.12 automatically. |
| 1-B | D1/D1.5, D1/D1.6 | Fix `.metric-label` (11 px, 0.08 em, weight normal) and `.metric-value` (26 px, line-height 1.1, letter-spacing −0.01 em) in `sdlc.css:307–322`. |
| 1-C | D1/D1.3, D1/D1.2 | Add `line-height: 1.15` to `.sdlc-h1` (`sdlc.css:131`); correct margin to `0 0 6 px`. Fix `.sdlc-h2` margin-top to 28 px (`sdlc.css:146`). |
| 1-D | D1/D1.4 | Fix `.sdlc-crumb` to 12.5 px, remove unspecified `letter-spacing`, reduce margin-bottom to 4 px (`sdlc.css:156–162`). |
| 1-E | D1/D1.9 | Replace full-strength `var(--low/--med/--blocker)` verdict border tokens with bespoke desaturated tints (`#c9deba`, `#e6d49d`, `#e2b5c5`) in `sdlc.css:286–288`. |
| 1-F | D1/D1.10 | Add `border-bottom: 1px solid transparent` to `a` and replace `a:hover { text-decoration: underline }` with `a:hover { border-bottom-color: var(--accent) }` (`sdlc.css:65–66`). |
| 1-G | D1/D1.11 | Move `background: var(--paper-2); padding: 1 px 5 px; border-radius: 3 px; color: var(--ink-2)` from `.prose code` to the global `code` rule (`sdlc.css:67`). |
| 1-H | D3/D3.13, D4/D4.13, D5/D5.6, D7/D7.9, D7/D7.10 | Replace inline `style="background:#hex"` on `.sw` spans with semantic state classes (`sw done`, `sw review`, `sw blocked`, `sw queued`) in `renderers/_figure.mjs:32–37`; add CSS rules for each variant including the `sw.queued` dashed border. |

---

### Phase 2 — Shell / chrome reconstruction

| Priority | Finding IDs | Action |
|---|---|---|
| 2-A | D2/D2.1 | Rewrite `_shell.mjs` topbar as `div.b-topbar` using `display:grid; grid-template-columns: auto 1fr auto; padding: 22 px 64 px; background: var(--paper-2)`. |
| 2-B | D2/D2.2 | Change brand text to `.ai/workflows`; fix `letter-spacing` to 0.005 em in `sdlc.css:87`. |
| 2-C | D2/D2.3 | Replace `ol.breadcrumb` with `div.crumb` editorial prose in `_shell.mjs:68`; update CSS to sans 14 px. |
| 2-D | D2/D2.4 | Add `div.actions` third-column slot with `⌘K to search · viewing as <b>you</b>` text in `_shell.mjs:69`. |
| 2-E | D2/D2.5 | Change `h1.sdlc-h1` → `h1.pg-title` in `_shell.mjs:103`; update CSS to 36 px. |
| 2-F | D2/D2.6 | Change `h2.sdlc-h2` → `h2.sec` in all renderers; update CSS to 12 px, margin 40 px 0 14 px, padding-bottom 8 px. |

---

### Phase 3 — Figure reconstruction

Address each figure in dependency order (dashboard first, slug overview second, plan/review/slice in parallel).

| Priority | Finding IDs | Action |
|---|---|---|
| 3-A | D3/D3.1 | Reduce `STAGES` array to 8 entries (intake → retro) in `renderers/dashboard.mjs:18–21`. Mirror change in `renderers/index.mjs:13–16` (D4/D4.3). |
| 3-B | D3/D3.2, D3/D3.3, D3/D3.4, D3/D3.6 | In `swimlanesSvg()`: add `<g class="rule-light">` with 8 vertical column lines; add solid ink progress overlay before dashed tail; add SHIPPED separator rule + label; add inline `<text>` blocker/revision annotations adjacent to current-stage dot. |
| 3-C | D3/D3.7, D3/D3.8, D3/D3.9, D3/D3.10, D3/D3.11, D3/D3.12 | In `projectRow()`: add `<div class="desc">` description field; replace `.meta` ISO date with `<span class="status bad/ok/warn/idle"><span class="glyph">` semantic health; emit `<span class="time">` with human-relative formatting; convert to `<article>` with nested `.name`/`.slug`; add `cur`/`done` variant classes on `.stage-pill`; rename `Complete` bucket to `Recently shipped`. |
| 3-D | D4/D4.1 | Wrap opening header in `.so-hd` two-column grid (`1fr auto`); restore `p.lede` from `lede` param (stop hard-coding `''`); add `aside span.badge` branch pill. |
| 3-E | D4/D4.2, D4/D4.4, D4/D4.5, D4/D4.8 | In `stageStripeSvg()`: change viewBox to `0 0 920 230`; add `<line class="ink-strong">` progress overlay; add per-station `<text y="-28">` date labels; add second rule at y = 186 and five metric-callout groups at y = 200. |
| 3-F | D4/D4.9, D4/D4.10, D4/D4.11 | Rewrite `buildActivityList()` to emit `span.when` (relative time), `span.what > span.file + span.who`; replace right aside with `nav.so-rail` jump links per stage with `.count` spans; restore design column assignment (activity left, jump rail right). |
| 3-G | D4/D4.12 | Add `figureCanvas` import and call to `renderers/workflow-index.mjs`; ensure Figure 2 renders for quick/investigative slugs. |
| 3-H | D5/D5.1, D5/D5.7, D5/D5.8, D5/D5.9, D5/D5.11, D5/D5.12 | In `plan.mjs`: (a) lift `figure` gate from `sy?.files?.length` to a default SVG with placeholder nodes when YAML absent; (b) add `frontmatter-card` generation from `fm`; (c) add `ac-list` generation from frontmatter `acceptance-criteria`; (d) add `files-touched` `<table>` generation (fix CSS at `sdlc.css:364–387` to match `<table>` structure); (e) add `callout risk-high/risk-med/risk-low` generation and align CSS class names; (f) add `<details class="revisions">` block. |
| 3-I | D6/D6.2, D6/D6.3 | Create `renderers/review-master.mjs`; wire it in `render-sunflower.mjs` type-router; ensure `verdictBlock()` and `heatmapSvg()` are called. Add Sigma column and totals row to `heatmapSvg()` (D6/D6.10); fix canvas width to 920 (D6/D6.10). Fix `verdictBlock()` to emit `.v-text` at 30 px serif (D6/D6.9, D1/D1.8). |
| 3-J | D7/D7.1, D7/D7.2, D7/D7.3, D7/D7.4, D7/D7.5, D7/D7.6, D7/D7.7 | In `slice-index.mjs`: replace rect grid in `sliceGridFigure()` with positioned dependency-graph SVG using `depends-on` data, directed `<path>` edges, and `<polygon>` arrowheads; add `sc-hd > sc-name + sc-pill` to `sliceCard()`; add `sc-meta` (files/reviews/blocker-cnt); add `sc-bar` with state-driven fill; add `sc-foot` with relative timestamp and `.pct`; map status → design state classes (`complete`, `in-progress`, `blocked`, `not-started`); add `queued` legend entry. |

---

### Phase 4 — Interactive / fragment delivery

| Priority | Finding IDs | Action |
|---|---|---|
| 4-A | D8/D8.7, coverage gap §8 | Change `<html data-sdlc-version>` to `<html data-artifact-type="${type}">` in `_shell.mjs:56` to match the fragment JS contract. Verify `body.dataset.fragmentReady` setter in `sdlc.js:15` fires correctly once a fragment dispatch exists. |
| 4-B | D6/D6.5, D6/D6.6, D6/D6.7, D6/D6.8 | These all depend on the fragment file being authored (Phase 0-B). Once `.html.fragment` files exist, verify `fr-dim-bar`, `fconf` bars, `<details>` evidence, and `fr-copy` buttons are present in the authored fragment; no renderer code change needed beyond the `review-master.mjs` addition. |
| 4-C | D8/D8.8 | Remove `<div class="fragment">` wrapper in `render-sunflower.mjs:344` and all per-type renderers; embed the fragment `<section>` directly so `.gw-fragment > section` padding rule applies. |
| 4-D | D6/D6.15 | Align finding-action chip class to `.fact.is-accept/.fact.is-defer/.fact.is-reject` in `renderers/_icons.mjs:77` and update `sdlc.css` to match, so the renderer's internal CSS aligns with both the design spec and any fragment CSS that uses `.fact`. |