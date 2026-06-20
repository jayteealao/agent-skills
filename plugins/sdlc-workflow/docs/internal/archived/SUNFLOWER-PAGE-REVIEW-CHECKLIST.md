# Sunflower View — Page × Hand-off Review Checklist

> **Gitignored working doc.** Drives a one-page-at-a-time audit of every page the
> sunflower view renders against the design hand-off bundle. Not shipped with the plugin.

> 📋 **2026-06-01 — hand-off deviation audit complete (desktop + mobile).**
> Full line-cited findings: [SUNFLOWER-HANDOFF-DEVIATIONS.md](SUNFLOWER-HANDOFF-DEVIATIONS.md)
> — **desktop: 205 deviations (38 blockers, 64 major, 66 minor, 37 nits)** + **mobile: 123 (37 blockers, 37 major, 31 minor, 18 nits)** = **328 total** across 10 page-families.
> Rows marked ⚠️ below have findings recorded there (cell format: `<blockers>B/<major>M/<minor>m/<nits>n · <ID-prefix>`; mobile findings use the `M-` prefix).
> Start with the **Systemic themes (S-1…S-9)** for desktop and **M-S1…M-S7** for mobile — a handful of
> CSS/contract fixes clear ~60 findings. **M-S4 DECIDED (2026-06-02):** `@media` for page chrome/reflow
> + desktop↔mobile variant toggles; `@container` (`container-type: inline-size`) for `.slice-grid`/
> `.so-grid` card internals + embeddable fragment roots. Dual-DOM accepted; server render-branch is the
> escape hatch. See M-S4 in the deviations doc.
>
> ✅ **2026-06-04 — all 7 open product decisions RESOLVED** (see "Decisions — RESOLVED" in the
> deviations doc). Summary: **(1)** keep 10 stages (re-affirm D3.1; `DASH-01`/`OVR-07` → won't-fix);
> **(2)** callouts standardize on `callout-{risk|warn|info|ok}` (drop plan's `risk-*` compound);
> **(3)** fragment owns overlapping sections, YAML owns the rest (no double-render); **(4)** implement-index
> gets full `sc-*` card anatomy as its own grid; **(5)** dashboard done-dots revert to all-ink;
> **(6)** activity feed = `"{who} updated {file}"` fallback (no schema change); **(7)** BUILD fragment
> nav-registration (the one new feature — `SYS-R05`). Execution is now unblocked end-to-end.
>
> 🎨 **2026-06-04 — design-agent mockups GENERATED for every `NEW` / `ADAPT` / `PARTIAL` page.**
> 9 hand-off mockups + 1 shared kit now live under `sdlc-handoff/sdlc/project/handoff-*` (index:
> `handoff-INDEX.html`). Each carries a desktop calm-reader page, a native mobile screen, and — for the
> 6 NEW data pages — a sibling-YAML contract; all share `_handoff-kit.css` (tokens + components lifted
> verbatim from the three source files). Rows below flipped ☐/⚠️ → 🎨 (mockup ready, implementation
> pending). The old prompt queue is now the **§"Generated mockups — implementation queue"** build plan.

## Purpose & workflow

For **each** page the sunflower view generates, walk these steps and tick the box:

1. **REVIEW** — open the page's renderer + the hand-off mockup section, compare 1:1
   (layout, tokens, components, copy, states, responsive). Record gaps in the row's notes.
2. If the page has **no hand-off** (`⛔ ABSENT`): draft a design-agent prompt in
   §"Design-agent prompt queue" so the design agent can generate the missing mockup.
   - `ADAPT` = a close sibling template already exists in the hand-off (reuse its chrome).
   - `NEW`   = no close sibling; design fresh.
3. **FIX** — bring the renderer into full compliance with the (existing or newly
   generated) hand-off. Log the change in §"Implementation-fix log".

Work top-to-bottom; flip a row to ✅ only when the renderer is *fully* compliant.

### Status legend

| Mark | Meaning |
|------|---------|
| ☐ | not started |
| 🔎 | under review |
| ⚠️ | gaps found (see notes) |
| 🆕 | design-agent prompt drafted (awaiting mockup) |
| 🎨 | mockup generated, implementation pending |
| 🔧 | fixing implementation |
| ✅ | fully compliant with hand-off |
| ➖ | N/A (deprecated / no own UI / inherits parent) |

### Action legend

| Action | Meaning |
|--------|---------|
| `REVIEW` | Hand-off mockup exists → verify implementation matches |
| `PARTIAL` | Hand-off partially covers this page → verify what's covered, design the rest |
| `ADAPT` | No dedicated mockup, but a sibling template exists in the hand-off → prompt = adapt it |
| `NEW` | No hand-off and no close sibling → prompt = design from scratch |
| `N/A` | Deprecated, dispatcher-only, or inherits a parent page's design |

---

## Hand-off source map

All paths are under `sdlc-handoff/sdlc/project/` (the gitignored design bundle from
claude.ai/design). Read `sdlc-handoff/sdlc/README.md` first.

| File | What it covers | Anchors → page |
|------|----------------|----------------|
| `sdlc-design-iterations.html` | Calm-reader **full-page** desktop designs | `#page-1` Team workflows → **Dashboard**; `#page-2` Checkout v2 → **Slug overview**; `#page-3` Migrate to… → **Plan / Slice**; `#page-4` Review sweep → **Review**; `#page-5` Implementation → **Implement** |
| `sdlc-fragments-gallery.html` | Embeddable **interactive fragments** (the rich tier — 10 exemplars) | `#fragment-review` → **Review**; `#fragment-rca` → **RCA**; `#fragment-plan` → **Plan**; `#fragment-design` → **Design artifact**; `#fragment-shiprun` → **Ship-run**; `#fragment-benchmark` → **Benchmark**; `#fragment-experiment` → **Experiment**; `#fragment-instrument` → **Instrument**; `#fragment-profile` → **Profile**; `#fragment-simplify-run` → **Simplify-run**; `#api-summary` Fragment API |
| `sdlc-mobile.html` | **Native mobile** screens (calm-reader + fragments) | Team workflows, Checkout v2, 03 payment-element, Review sweep, Slices, Review findings, Checkout outage (RCA), 04 multi-region (Plan), Checkout button (Design), Release v3.2.0 (Ship-run) |
| `sdlc-mobile-previews.html` | Mobile preview index (5 iterations + 5 fragments) | thumbnail index only |
| `sdlc-explorations.html` | **Palettes + responsive breakpoints** (cross-cutting design system) | `#palettes`; `#responsive` (desktop/laptop/tablet/phone-l/phone-s) |

> Internal cross-references already in the repo: `SUNFLOWER-VIEW-PLAN.md` (1:1 reproduction
> contract + per-page figure specs), `SUNFLOWER-PARITY-AUDIT.md` (prior compliance findings,
> D1–D8), `SUNFLOWER-PARITY-FIX-PLAN.md` (remediation slices). Use these as the existing
> baseline — this checklist extends them to *every* page, not just the hero pages.

---

## Master checklist

Renderers live in `plugins/sdlc-workflow/renderers/`. Routes are under the `/sdlc/` mount
(hub serves the same tree at `/r/<id>/sdlc/`).

### A. Global / cross-slug

| ☐ | Page | Route | Renderer | Hand-off | Action | Notes |
|---|------|-------|----------|----------|--------|-------|
| ⚠️ | Dashboard | `/sdlc/` | `dashboard.mjs` | iterations `#page-1` + mobile (Team workflows) | REVIEW | 3B/9M/9m/4n · `DASH-*` |
| 🎨 | Hub landing | `/` (hub) | `hub-dashboard.mjs` | 🎨 `handoff-hub-landing.html` | NEW | multi-repo inbox — mockup ready |

### B. Per-slug overview

| ☐ | Page | Route | Renderer | Hand-off | Action | Notes |
|---|------|-------|----------|----------|--------|-------|
| ⚠️ | Slug overview (full) | `/sdlc/<slug>/` | `index.mjs` | iterations `#page-2` + mobile (Checkout v2) | REVIEW | 2B/9M/10m/5n · `OVR-*` |
| 🎨 | Quick / investigative overview | `/sdlc/<slug>/` | `workflow-index.mjs` | 🎨 adapts `#page-2` (existing) | ADAPT | routing/progress variant of slug overview |

### C. Pipeline phase pages

| ☐ | Page | Route | Renderer | Hand-off | Action | Notes |
|---|------|-------|----------|----------|--------|-------|
| 🎨 | Intake | `/sdlc/<slug>/intake/` | `intake.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | template instance (shown fully) |
| ⚠️ | RCA | `/sdlc/<slug>/rca/` | `rca.mjs` | fragments `#fragment-rca` + mobile | REVIEW | 7B/5M/7m/4n · `RCA-*` |
| 🎨 | Fix | `/sdlc/<slug>/fix/` | `_simple` fallback | 🎨 `handoff-calm-reader-template.html` | ADAPT | quick workflow |
| 🎨 | Probe | `/sdlc/<slug>/probe/` | `_simple` fallback | 🎨 `handoff-calm-reader-template.html` | ADAPT | investigative |
| 🎨 | Investigate | `/sdlc/<slug>/investigate/` | `_simple` fallback | 🎨 `handoff-calm-reader-template.html` | ADAPT | investigative |
| 🎨 | Shape | `/sdlc/<slug>/shape/` | `shape.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | + slices/risks metric-row |
| ⚠️ | Design artifact | `/sdlc/<slug>/design/` | `design.mjs` | fragments `#fragment-design` + mobile (Checkout button) | REVIEW | 5B/5M/6m/3n · `DSG-*` |
| 🎨 | Design brief / craft | `/sdlc/<slug>/design-brief/` | `design-brief.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | 02c-craft contract |
| ⚠️ | Slice index | `/sdlc/<slug>/slice/` | `slice-index.mjs` | mobile (Slices) — Figure 5 grid | PARTIAL | 2B/4M/5m/3n · `SLC-*` (+uncovered UI) |
| 🎨 | Slice detail | `/sdlc/<slug>/slice/<s>/` | `slice.mjs` | `#page-3` + 🎨 `handoff-slice-nav.html` | PARTIAL | nav grids (stages + reviews) now designed |
| 🎨 | Plan index | `/sdlc/<slug>/plan/` | `plan-index.mjs` | 🎨 `handoff-index-grid-template.html` | ADAPT | sc-* cards landed `37709e8` (PLN-11/16) — mockup confirms |
| ⚠️ | Plan (per-slice) | `/sdlc/<slug>/plan/<s>/` | `plan.mjs` | iterations `#page-3` + fragments `#fragment-plan` + mobile | REVIEW | 4B/9M/5m/3n · `PLN-*` |
| 🎨 | Implement index | `/sdlc/<slug>/implement/` | `implement-index.mjs` | 🎨 `handoff-index-grid-template.html` | ADAPT | sc-* + Figure 5 landed `37709e8` (IMP-02..06/08/15/16) — mockup is the reference instance |
| ⚠️ | Implement (per-slice) | `/sdlc/<slug>/implement/<s>/` | `implement.mjs` | iterations `#page-5` + mobile | REVIEW | 6B/4M/5m/3n · `IMP-*` |
| 🎨 | Verify index | `/sdlc/<slug>/verify/` | `verify-index.mjs` | 🎨 `handoff-index-grid-template.html` | ADAPT | checks/failures meta |
| 🎨 | Verify (per-slice) | `/sdlc/<slug>/verify/<s>/` | `verify.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | passed/failed/skipped metric-row |
| ⚠️ | Review (hero verdict) | `/sdlc/<slug>/review/` | `review.mjs` | iterations `#page-4` + fragments `#fragment-review` + mobile | REVIEW | 3B/4M/6m/4n · `REV-*` |
| ⚠️ | Review (per-dimension) | `/sdlc/<slug>/review/<dim>/` | `review-dimension.mjs` | fragments `#fragment-review` (partial) | PARTIAL | see `REV-02` (falls back to renderSimple) |
| 🎨 | Design critique | `/sdlc/<slug>/design-critique/` | `design-critique.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | findings-by-sev metric-row |
| 🎨 | Design audit | `/sdlc/<slug>/design-audit/` | `design-audit.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | measurable audit (score/issues) |
| ✅ | Sync health report | `/sdlc/<slug>/sync/` | `sync-report.mjs` | 🎨 `handoff-sync-report.html` | NEW | BUILT v9.44 — verdict + diverging-bar figure + drift table + dual-DOM mobile; schema+skill+goldens |
| 🎨 | Handoff (stage 8) | `/sdlc/<slug>/handoff/` | `handoff.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | PR-readiness (full instance shown) |
| 🎨 | Docs index | `/sdlc/<slug>/docs-index/` | `docs-index.mjs` | 🎨 `handoff-index-grid-template.html` | ADAPT | pages/sections meta, no dep figure |
| 🎨 | Ship runs index | `/sdlc/<slug>/ship/` | `ship-runs-index.mjs` | 🎨 `handoff-index-grid-template.html` | ADAPT | timeline-thumb per card |
| ⚠️ | Ship run (single) | `/sdlc/<slug>/ship/<run>/` | `ship-run.mjs` | fragments `#fragment-shiprun` + mobile (Release v3.2.0) | REVIEW | 6B/9M/5m/3n · `SHP-*` |
| 🎨 | Retrospective | `/sdlc/<slug>/retro/` | `retro.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | what worked / didn't / actions |
| 🎨 | Resume | `/sdlc/<slug>/resume/` | `resume.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | current-stage metric |
| 🎨 | Announcement | `/sdlc/<slug>/announce/` | `announce.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | summary/highlights/links |
| 🎨 | Risk register | `/sdlc/<slug>/risk-register/` | `risk-register.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | body `.data-table` (likelihood × impact) |
| 🎨 | Estimate | `/sdlc/<slug>/estimate/` | `estimate.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | effort/confidence + breakdown table |

### D. Augmentations

| ☐ | Page | Route | Renderer | Hand-off | Action | Notes |
|---|------|-------|----------|----------|--------|-------|
| ➖ | Augmentation dispatcher | (dispatch) | `augmentation.mjs` | — | N/A | routes on `artifact:` field |
| ⚠️ | RCA augmentation | `/sdlc/<slug>/augmentations/<id>/` | `rca.mjs` | fragments `#fragment-rca` | REVIEW | shares `rca.mjs` → same `RCA-*` findings |
| 🎨 | Benchmark | `/sdlc/<slug>/augmentations/<id>/` | `benchmark.mjs` | 🎨 `handoff-benchmark.html` | NEW | grouped bars + verdict table (gold exemplar) |
| 🎨 | Experiment | `/sdlc/<slug>/augmentations/<id>/` | `experiment.mjs` | 🎨 `handoff-experiment.html` | NEW | arm allocation + guardrails |
| 🎨 | Instrument | `/sdlc/<slug>/augmentations/<id>/` | `instrument.mjs` | 🎨 `handoff-instrument.html` | NEW | signal table + dark paths |

### E. Amendments & records

| ☐ | Page | Route | Renderer | Hand-off | Action | Notes |
|---|------|-------|----------|----------|--------|-------|
| 🎨 | Shape amendment | `/sdlc/<slug>/amendments/<n>-shape/` | `shape-amendment.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | append-only change + rationale |
| 🎨 | Slice amendment | `/sdlc/<slug>/amendments/<n>-slice/` | `slice-amendment.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | append-only change + rationale |
| 🎨 | Skip record | `/sdlc/<slug>/skips/<stage>/` | `skip-record.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | reason / risk accepted / re-enable |
| ➖ | History snapshot | `/sdlc/<slug>/<phase>/history/<rev>/` | (parent renderer) | inherits parent | N/A | same design as live page |

### F. Off-pipeline

| ☐ | Page | Route | Renderer | Hand-off | Action | Notes |
|---|------|-------|----------|----------|--------|-------|
| 🎨 | Simplify run | `/sdlc/simplify/<run>/` | `simplify-run.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | finding-table + category chips |
| 🎨 | Profile hotspots | `/sdlc/profiles/<run>/` | `profile.mjs` | 🎨 `handoff-profile.html` | NEW | flame-row ranking + table |
| 🎨 | Docs run index (project) | `/sdlc/docs/<run>/docs-index/` | `docs-index.mjs` | 🎨 `handoff-index-grid-template.html` | ADAPT | shares docs-index design |

### G. Project context

| ☐ | Page | Route | Renderer | Hand-off | Action | Notes |
|---|------|-------|----------|----------|--------|-------|
| 🎨 | Product context | `/sdlc/project/PRODUCT.html` | `project-context.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | prose only |
| 🎨 | Design context | `/sdlc/project/DESIGN.html` | `project-context.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | prose only |
| 🎨 | Project ship plan | `/sdlc/project/ship-plan.html` | `ship-plan.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | stages / gates / rollback policy |

### H. Design sub-command (generic wf-design artifacts)

| ☐ | Page | Route | Renderer | Hand-off | Action | Notes |
|---|------|-------|----------|----------|--------|-------|
| ⚠️ | Design contract | (varies) | `design-contract.mjs` | fragments `#fragment-design` (partial) | PARTIAL | covered in DSG report → uncovered (no own mock) |
| 🎨 | Design augmentation | (varies) | `design-augmentation.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | generic design sub-command |
| 🎨 | Critique-or-audit | (varies) | `critique-or-audit.mjs` | 🎨 `handoff-calm-reader-template.html` | ADAPT | shares critique/audit design |

### I. Legacy / deprecated

| ☐ | Page | Route | Renderer | Hand-off | Action | Notes |
|---|------|-------|----------|----------|--------|-------|
| ➖ | Ship (legacy) | (any `type: ship`) | `ship-legacy.mjs` / `ship.mjs` | — | N/A | deprecated pre-v9.2.0, banner only |

### J. Cross-cutting design system (not pages — verify globally)

| ☐ | Concern | Source of truth | Hand-off | Action | Notes |
|---|---------|-----------------|----------|--------|-------|
| ⚠️ | Palettes / tokens | `assets/sdlc.css` | explorations `#palettes` | REVIEW | palette exact; `SYS-T*` (serif/line-height nits) |
| ⚠️ | Responsive breakpoints | `assets/sdlc.css` | explorations `#responsive` + mobile | REVIEW | `SYS-R*` + **mobile sweep `M-*` (123 findings, 37 blockers)** — no mobile chrome, SVGs shrink not scroll, component lib unported; see Mobile-parity audit |
| ⚠️ | Shell / chrome | `renderers/_shell.mjs` | iterations (page frame) | REVIEW | `SYS-S*` (topbar cap, pg-title vs sdlc-h1, badge shapes) |
| ⚠️ | Figure canvas | `renderers/_figure.mjs` | fragments (all figures) | REVIEW | `SYS-F*` (figure-title font, padding, meta border) |

---

## Tally (update as review progresses)

- **Distinct page rows:** 45 (excl. 4 cross-cutting concerns, incl. 4 ➖ N/A)
- **Hand-off present → `REVIEW`:** 8 hero pages (Dashboard, Slug overview, RCA, Design, Plan/slice, Implement, Review, Ship-run) + RCA augmentation
- **Partially covered → `PARTIAL`:** 4 (Slice index, Slice detail, Review per-dimension, Design contract)
- **No hand-off → `ADAPT`:** ~22 (doc/list pages reusing existing templates)
- **No hand-off → `NEW`:** 6 (Hub landing, Sync health, Benchmark, Experiment, Instrument, Profile hotspots)
- **N/A:** 4 (augmentation dispatcher, history snapshot, ship-legacy, + nuances)

---

## Generated mockups — implementation queue

> ✅ **2026-06-04 — the prompt queue below has been EXECUTED.** Every `NEW` / `ADAPT` / `PARTIAL`
> page now has a hand-off mockup under `sdlc-handoff/sdlc/project/`. The prompt blocks are retained
> below as provenance (they are the spec each mockup was built from). Work the table + phases here.

### Mockup → renderer map

| Mockup (`sdlc-handoff/sdlc/project/`) | Drives renderer(s) | Contract? | Group |
|---------------------------------------|--------------------|-----------|-------|
| `_handoff-kit.css` | (shared tokens + components — the implementation contract; lines up 1:1 with `assets/sdlc.css`) | — | kit |
| `handoff-INDEX.html` | (index of the set) | — | index |
| `handoff-benchmark.html` ⭐ gold exemplar | `benchmark.mjs` | sibling YAML | A · NEW |
| `handoff-experiment.html` | `experiment.mjs` | sibling YAML | A · NEW |
| `handoff-instrument.html` | `instrument.mjs` | sibling YAML | A · NEW |
| `handoff-profile.html` | `profile.mjs` | sibling YAML | A · NEW |
| `handoff-sync-report.html` | `sync-report.mjs` | sibling YAML | A · NEW |
| `handoff-hub-landing.html` | `hub-dashboard.mjs` | hub registry | A · NEW |
| `handoff-calm-reader-template.html` | `intake · shape · fix · probe · investigate · design-brief · verify · design-critique · design-audit · handoff · retro · resume · announce · risk-register · estimate · skip-record · *-amendment · simplify-run · project-context · ship-plan · design-augmentation · critique-or-audit` | frontmatter | B · ADAPT |
| `handoff-index-grid-template.html` | `plan-index · implement-index · verify-index · docs-index · ship-runs-index` | child artifacts | C · ADAPT |
| `handoff-slice-nav.html` | `slice.mjs` (the two nav grids only) | parent + reviews | D · PARTIAL |

### Build order (each phase independently shippable)

1. **Templates first — unlocks the most pages.**
   - **Calm-reader archetype** (`renderSimple`): conform the ~22 doc pages to `handoff-calm-reader-template.html` — header + optional metric-row + frontmatter-card + prose w/ `h2.sec` + `callout-{risk|warn|info|ok}` + `details.revisions`; mobile = appbar + `.mtiles` + `.checklist`. Most chrome already exists; the work is per-page section/metric wiring + a few body `.data-table`s (risk-register, estimate).
   - **Index-grid archetype** (`_cards.mjs`): `implement-index`/`plan-index` already emit `sc-*` cards (commits `37709e8`); extend the same pattern to `verify-index`, `docs-index`, `ship-runs-index` per `handoff-index-grid-template.html` (Figure-5 only where `depends-on` exists; ship-runs swaps the bar for a stage-timeline thumb).
2. **Slice nav grids** (`slice.mjs`): add the Stages grid (Plan/Implement/Verify w/ dimmed empty state) + Reviews grid (verdict pill + severity chips) below the `#page-3` reader body, per `handoff-slice-nav.html`.
3. **NEW augmentation renderers** (contract-driven, dual-DOM, S-1-gated like the rich tier): `benchmark.mjs`, `experiment.mjs`, `instrument.mjs`. Parse sibling YAML (see each file's `#api-summary`); render figure + table + verdict/metric band; mobile recasts the figure as stacked cards.
4. **NEW standalone renderers**: `sync-report.mjs` (00-sync.md → diverging-bar + drift table), `profile.mjs` (flame-row ranking + inline-bar table), `hub-dashboard.mjs` (reads the hub registry, not YAML → attention band + repo roster w/ mini swimlanes).

> **Definition of done per page**: desktop matches the mockup's `.vb` layout; mobile matches the `.device` screen behind the existing `.d-only`/`.m-only` dual-DOM toggle; for the 6 NEW pages the sibling-YAML fields map to the figure/table/band; the snapshot suite stays green (regenerate goldens only for the renderers actually changed).

---

## Design-agent prompt queue (provenance — EXECUTED)

> One block per `ADAPT` / `NEW` / `PARTIAL` page. **These have all been run; the resulting mockup
> paths are in the map above.** Kept as the spec-of-record for each mockup.

### SHARED CONTEXT — paste at the top of every prompt below

> You are **Claude Design**. You are *extending an existing design system*, not starting fresh.
> The canonical style source is the hand-off bundle under `sdlc-handoff/sdlc/project/`:
> `sdlc-design-iterations.html` (calm-reader desktop full pages + the `<style>` token block),
> `sdlc-fragments-gallery.html` (interactive fragment components), `sdlc-mobile.html` (native
> mobile screens), `sdlc-explorations.html` (palette + responsive breakpoints). **Read those first
> and reuse their tokens, classes, chrome, and conventions verbatim** — same `--paper/--ink/--accent/
> --sev-*` tokens, same `b-topbar` + crumb chrome, same `figure-canvas`/`metric-row`/`callout`/
> `verdict`/`sdlc-h1/h2/lede` components, same calm "editorial reader" register (serif headings,
> mono eyebrow labels, restrained palette). Deliver, for each page: **(1) a desktop full-page
> mockup** in the `sdlc-design-iterations.html` style, and **(2) a purpose-built mobile screen** in
> the `sdlc-mobile.html` style (native mobile layout — appbar + stacked components, NOT a squashed
> desktop). Where the page has live/interactive data, also specify the **fragment data contract**
> (the sibling YAML shape) the way `sdlc-fragments-gallery.html#api-summary` does. Output HTML/CSS
> prototypes (don't screenshot). Match the visual output, not any specific framework.

---

## Group A — NEW pages (bespoke, no existing sibling)

```
### Hub landing page — NEW   (renderer: hub-dashboard.mjs, route: / )
[SHARED CONTEXT]
Design the multi-repo "inbox" landing — the root a user hits when one daemon serves many repos.
Purpose: triage across all registered repositories at a glance, then drill into one.
Content model (from the hub registry): a list of repos, each with { repo name, slug/id, # active
workflows, # blocked workflows, last-activity timestamp, a compact stage-mix }. Plus a global
"Needs attention" band aggregating blocked/awaiting-input workflows across ALL repos.
Components to design:
 - A page header (pg-title "Workflows" + lede summarising N repos / N active / N blocked).
 - A global "Needs attention" section at top: cross-repo blocked/awaiting items as rows linking
   straight to the workflow, each tagged with its repo.
 - A repo roster: one card/row per repo showing the repo name, active/blocked counts (blocker count
   in --blocker), last activity (human-relative), and a MINI swimlane sparkline (reuse the dashboard
   Figure-1 swimlane visual language, compressed). Clicking routes to /r/<id>/.
 - Empty state (no repos registered yet).
Desktop: roster as a calm vertical ledger (like the dashboard project rows). Mobile: stacked repo
cards with the attention band pinned on top; counts as mtile-style chips.
```

```
### Sync health report — NEW   (renderer: sync-report.mjs, route: /<slug>/sync/, source: 00-sync.md)
[SHARED CONTEXT]
Design a branch-sync health report: how far a feature branch has drifted from its base and whether
it's safe to rebase/merge.
Content model: { branch, base-branch, ahead-count, behind-count, conflict-risk (none/low/med/high),
rebase-status (clean/conflicts), stale-days, diverged-files: [{path, base-Δ, branch-Δ, conflict?}],
recommendation }.
Components:
 - A verdict block (reuse `.verdict`): "In sync" / "Drifting" / "Conflicts likely", tinted by risk.
 - A metric-row: ahead, behind, stale (days), files-in-conflict.
 - A divergence figure (figure-canvas): a small two-track commit-graph OR an ahead/behind diverging
   bar (commits ahead in --accent rising right, behind in --med rising left from a shared base node).
 - A file-drift table (reuse files-touched styling): path · base Δ · branch Δ · conflict flag
   (conflict rows flagged with --blocker).
 - A recommendation callout (callout-info / callout-risk by severity).
Mobile: verdict + stacked ahead/behind tiles + a scrollable drift list.
```

```
### Benchmark — NEW   (renderer: benchmark.mjs, augmentation artifact: benchmark)
[SHARED CONTEXT]
Design a performance/quality benchmark comparison page (a workflow augmentation).
Content model (sibling YAML): { title, baseline-label, current-label, metrics: [{name, unit,
baseline, current, delta, delta-pct, threshold, direction (lower-better/higher-better), verdict
(pass/regress/improve)}], summary }.
Components:
 - Verdict block: overall pass/regress (regress in --blocker).
 - A before/after grouped-bar figure (figure-canvas): one pair of bars per metric, baseline vs
   current, colored by verdict; threshold drawn as a dashed rule line. Use the figure-legend pattern.
 - A metrics table: name · baseline · current · Δ · Δ% · threshold · verdict pill. Improvements in
   --low, regressions in --blocker, within-threshold neutral.
Mobile: stacked metric cards, each a name + a single mini before/after bar + the Δ% badge.
Also specify the sibling-YAML schema (api-summary style) so the renderer can build this deterministically.
```

```
### Experiment — NEW   (renderer: experiment.mjs, augmentation artifact: experiment)
[SHARED CONTEXT]
Design an A/B (or multivariate) experiment page (a workflow augmentation).
Content model (sibling YAML): { hypothesis, status (draft/running/concluded), arms: [{name, role
(control/variant), allocation-pct, exposures}], primary-metric, guardrails: [{name, threshold,
current, status}], decision (ship/hold/iterate), confidence }.
Components:
 - A hypothesis statement block (lede-weight, serif).
 - An arm-allocation figure (figure-canvas): a single horizontal 100%-stacked bar split by arm
   allocation %, control in neutral ink, variants in --accent tints; each segment labelled with
   name + %.
 - A guardrails table: metric · threshold · current · status pill (breach in --blocker).
 - A decision verdict block (ship/hold/iterate) with confidence annotation.
Mobile: hypothesis card + vertical arm list (each arm a row with an inline allocation bar) + stacked
guardrail rows. Specify the sibling-YAML schema.
```

```
### Instrument — NEW   (renderer: instrument.mjs, augmentation artifact: instrument)
[SHARED CONTEXT]
Design an observability-instrumentation page: what signals a change emits and which paths are dark.
Content model (sibling YAML): { signals: [{name, type (event/metric/log/trace), fields:[...],
sample-rate, owner, status (live/planned)}], dark-paths: [{path, why, risk}], coverage-pct }.
Components:
 - A metric-row: total signals, live, planned, coverage-%.
 - A signals table: name · type pill · fields (truncatable) · sample-rate · owner · status.
 - A coverage figure (figure-canvas): a simple coverage bar or a small instrumented-vs-dark donut/bar.
 - "Dark paths" section: callout-risk items for each uninstrumented path (why + risk).
Mobile: coverage tile on top + stacked signal cards + dark-path callouts. Specify the sibling-YAML schema.
```

```
### Profile hotspots — NEW   (renderer: profile.mjs, route: /profiles/<run>/, source: 01-profile.md)
[SHARED CONTEXT]
Design a performance-profile hotspots page: where time/allocations concentrate, optionally before/after.
Content model: { target, sampled-duration, hotspots: [{symbol, file, self-ms, total-ms, calls,
self-pct}], comparison? : { before-label, after-label, deltas } }.
Components:
 - A metric-row: total sampled time, # hotspots, top hotspot %.
 - A hotspots figure (figure-canvas): a horizontal bar ranking of the top N symbols by self-time
   (a simple flame-row / bar, NOT a full flamegraph), each bar labelled symbol + self-% .
 - A ranked hotspots table: symbol · file · self-ms · total-ms · calls · self-% (heaviest first,
   self-% as a tiny inline bar in the cell).
 - Optional before/after comparison figure when comparison data is present (paired bars).
Mobile: top-hotspot tile + scrollable ranked list with inline self-% bars.
```

---

## Group B — ADAPT: calm-reader document archetype  (covers ~20 pages)

These are all single-artifact "editorial document" pages. Design **one reusable template**, then
the per-page table below tells the design agent what varies (title, lede, metric-row fields, section
headings, special components). One desktop template + one mobile template, parameterised.

```
### Calm-reader document template — ADAPT
[SHARED CONTEXT]
Design the canonical single-artifact "reader" page template that most SDLC artifacts render into.
It must reuse the page-2 / page-5 chrome from sdlc-design-iterations.html exactly:
 - b-topbar + breadcrumb chrome (shared).
 - Header: pg-title (the artifact's human title) + pg-sub lede (one-sentence editorial summary).
 - Optional metric-row band (0–5 metrics) directly under the header.
 - Optional frontmatter-card (dl) for structured key/values.
 - Body: prose with sdlc-h2 section headings, callouts (info/warn/risk/ok), optional inline tables.
 - Optional figure-canvas when the artifact has a diagrammable element.
 - A "Prior revisions" disclosure (details/ul) + git-history block at the foot.
Provide a DESKTOP full-page and a MOBILE screen (appbar with crumb + stacked sections; metric-row
becomes a 2-col mtile grid). The pages in the table below are all instances of THIS template — show
2–3 representative instances (e.g. Intake, Handoff, Retro) fully rendered so the variation is clear.
```

Per-page variation (all use the template above):

| Page | Renderer | Title | Lede | Metric-row | Special sections |
|------|----------|-------|------|-----------|------------------|
| Intake | `intake.mjs` | problem title | who/why one-liner | — | Problem, Context, Goals, Out-of-scope |
| Shape | `shape.mjs` | feature name | shaping summary | slices, risks | Problem space, Appetite, Constraints, Slices |
| Fix / Probe / Investigate | `_simple` fallback | issue title | summary | — | Findings, Cause, Resolution |
| Design brief / craft | `design-brief.mjs` | feature · brief | design intent | refs | Visual direction, References, Hand-off |
| Verify (per-slice) | `verify.mjs` | Verify · slice | pass/fail summary | passed, failed, skipped | Checks, Failures, Evidence |
| Design critique | `design-critique.mjs` | Critique · slug | verdict one-liner | findings by sev | Findings (prescriptive), Priorities |
| Design audit | `design-audit.mjs` | Audit · slug | measurable score | score, issues | Measured metrics, Issues, Recommendations |
| Handoff (stage 8) | `handoff.mjs` | PR-readiness · slug | ready/blocked verdict | readiness, drift, checks | PR readiness, Commitlint, Public-surface drift, Triage |
| Retrospective | `retro.mjs` | Retro · slug | outcome one-liner | — | What worked, What didn't, Actions |
| Resume | `resume.mjs` | Resume · slug | where-you-left-off | current stage | Next step, Blockers, Context |
| Announcement | `announce.mjs` | announcement title | tl;dr | — | Summary, Highlights, Links |
| Risk register | `risk-register.mjs` | Risks · slug | top-risk one-liner | open, mitigated | Risk table (likelihood × impact) |
| Estimate | `estimate.mjs` | Estimate · slug | total estimate | effort, confidence | Breakdown table, Assumptions |
| Skip record | `skip-record.mjs` | Skipped · stage | why skipped | — | Reason, Risk accepted, Re-enable condition |
| Shape/Slice amendment | `*-amendment.mjs` | Amendment N · slug | what changed | — | Append-only change, Rationale (link to parent) |
| Simplify run | `simplify-run.mjs` | Simplify · run | findings count | reuse, quality, efficiency | Finding table + category chips (review-findings style) |
| Product / Design context | `project-context.mjs` | PRODUCT / DESIGN | project framing | — | prose only |
| Project ship plan | `ship-plan.mjs` | Ship plan | release intent | environments | Stages, Gates, Rollback policy |
| Critique-or-audit / Design augmentation | `critique-or-audit.mjs`, `design-augmentation.mjs` | sub-command title | summary | — | depends on sub-command |

---

## Group C — ADAPT: list / index archetype  (covers ~5 pages)

```
### Card-grid index template — ADAPT
[SHARED CONTEXT]
Design the canonical "index" page that lists child artifacts as a responsive card grid. Reuse the
slice-grid + slice-card anatomy from sdlc-design-iterations.html#page-5 EXACTLY (sc-hd/sc-name/
sc-pill/sc-meta/sc-bar/sc-foot, the four state classes complete/in-progress/blocked/not-started),
plus the b-topbar chrome, a header (pg-title + pg-sub summary), and a metric-row summarising the set.
Each card: a human name (serif), a status pill, a meta line (counts: files / sub-items / blockers),
a progress bar, and a footer (relative time + completion %). Cards link to the child page.
Optionally include the Figure-5 dependency-graph figure above the grid when the items have a
dependency/order relationship. Empty state when the set is empty.
DESKTOP: auto-fill card grid. MOBILE: single-column stacked cards (sdlc-mobile.html scard pattern),
metric-row collapses to mtiles.
```

Per-page variation (all use the template above):

| Page | Renderer | Cards represent | Meta counts | Progress signal | Dep figure? |
|------|----------|-----------------|-------------|-----------------|-------------|
| Plan index | `plan-index.mjs` | per-slice plans | files, steps, blockers | acceptance-criteria done % | optional |
| Implement index | `implement-index.mjs` | per-slice implement logs | files, reviews, blockers | completion % | **yes** (Figure 5) |
| Verify index | `verify-index.mjs` | per-slice verify runs | checks, failures | passed/total % | no |
| Docs index | `docs-index.mjs` | doc pages in the run | pages, sections | — | no |
| Ship runs index | `ship-runs-index.mjs` | deploy runs | checks, env reached | canary→prod % | no (timeline thumbnail per card instead) |

---

## Group D — PARTIAL: slice-detail navigation (no mockup for the nav grids)

```
### Slice-detail stage/review nav — PARTIAL   (renderer: slice.mjs)
[SHARED CONTEXT]
The slice DETAIL page (per #page-3 reader body) is covered, but its two NAVIGATION grids are not.
Design: (1) a "Stages" grid of 3 cards — Plan / Implement / Verify — each showing the stage's
status and linking into that stage's per-slice page; include a clear MISSING/empty state for a stage
not yet started (dimmed card, italic "not started"). (2) a "Reviews" grid listing per-slice / slug
reviews that reference this slice, each card showing the review verdict + severity counts. Reuse the
slice-card / status-badge visual language. DESKTOP: 3-up card rows. MOBILE: stacked nav cards.
```

---

## Implementation-fix log

> One entry per page fixed. Link the renderer change + the hand-off section it now matches.

| Date | Page | Renderer | Hand-off matched | Change summary |
|------|------|----------|------------------|----------------|
| 2026-06-04 | All figures (cross-cut) | `assets/sdlc.css` (`.figure-title`) | iterations:911–918 | **S-2**: figure-title serif 15px → mono 11px uppercase `letter-spacing:.10em` ink-3, bold `b` → ink. Clears DASH-04, OVR-11, SYS-F03 (+ every figure caption). Legend → `var(--mono)`. |
| 2026-06-04 | All figures (cross-cut) | `assets/sdlc.css` (`.figure-canvas`/`.figure-meta`) | iterations:894–909 | **S-3**: padding `22px 26px`→`26px 32px 30px`; margin →`20px 0 32px`; base `overflow-x:auto`; figure-meta flex→grid `1fr auto` gap 24 + `padding-bottom:14px; margin-bottom:22px; border-bottom`. Clears DASH-05/06/21, OVR-12/13/21, SYS-F01/F02. |
| 2026-06-04 | All figures (mobile) | `assets/sdlc.css` (`@media ≤720`) | M-S2 quick win | **M-S2 (SVG half)**: `.figure-canvas svg { min-width: var(--figure-min-w, 760px) }` at ≤720px so figures scroll legibly instead of shrinking to ~4px. Per-figure tunable. Table-scroll half moved to batch 3. Tests 195/195 green. |
| 2026-06-04 | Shell chrome (cross-cut) | `assets/sdlc.css` (`.b-topbar`/`.crumb`/`.actions`) | iterations:284–304 | **SYS-S01/02/03**: b-topbar `max-width:1100px; margin:0 auto` + `align-items:baseline` + `gap:24px` (align with centred main); `.crumb b` 600→500; `.actions` 12.5→13px. |
| 2026-06-04 | Badges (cross-cut) | `assets/sdlc.css` (`.status-badge`/`.stage-badge`) | fragments-gallery:182–204 | **SYS-S05/06**: status-badge → mono 11.5px, dot-glyph `::before` (● per tone, ○ skip), no border; stage-badge → round accent pill (accent on accent-soft, 12px radius, no border). Pure CSS, no snapshot change. |
| 2026-06-04 | Plan risk callouts | `renderers/plan.mjs` + `assets/sdlc.css` | Decision 2 / contract:47 | **PLN-09**: retired the D5.11 `.callout.risk-*` compound; `riskCallouts()` now routes through the shared `callout()` helper, mapping high/blocker→risk, low→info, else→warn. One callout vocabulary view-wide. 195/195 green. |
| 2026-06-04 | **S-1 root cause** | `hooks/post-write-verify.mjs` (+ test) | Decision / contract | **S-1 enforcement**: write-time non-blocking reminder — when a rich-tier `.md` (type review/plan/design/ship-run/rca) is written without its sibling `.yaml`/`.html.fragment`, emit a `systemMessage` nudging the agent to author them (fail-open, gated by `hooks.remindMissingFragments`). Turns the silent skip that kept the rich tier dark into an agent-visible signal at the moment of write. +2 tests, 197/197 green. |
| 2026-06-04 | Review skill | `skills/wf/reference/review.md` | S-1 instruction gap | **S-1 instruction**: added in-flow `Step 5b — Write the rich fragment (MANDATORY)` between writing review files (Step 5) and updating the index (Step 6). review.md previously had NO fragment-authoring step at all (the most-run rich skill). Placed in the numbered flow, not as a skippable appendix. |
| 2026-06-04 | Dashboard swimlane | `renderers/dashboard.mjs` | Decision 5 / DASH-10 | **DASH-10**: active-row done dots reverted from green `#3e7d4a` to ink `#1f1b16` — all done dots now match the hand-off; the in-flight-health extension dropped. (dashboard.mjs not snapshot-tested.) |
| 2026-06-04 | Slug activity feed | `renderers/index.mjs` | Decision 6 / OVR-04 | **OVR-04**: activity rows now read "`{who} updated {file}`" (editorial prose, file as inline `.file` basename) from the author + storageRel already assembled — no schema change. Falls back to artifact type when no author. |
| 2026-06-04 | Index cards (S-8) | `renderers/_cards.mjs` (new) + `slice-index`/`implement-index`/`plan-index.mjs` | iterations#page-5 sc-* | **S-8 / Decision 4**: extracted the slice-card anatomy + Figure-5 into shared `_cards.mjs`. implement-index now emits full `sc-hd/sc-name/sc-pill/sc-meta/sc-bar/sc-foot` from `allArtifacts.implement` (files-changed→files, review-fixes→reviews) + Figure-5 + lede + aggregate metrics (clears IMP-02..06/08/15/16); plan-index gets sc-* cards (PLN-11/16); slice-index refactored onto the module (output unchanged). Commit `37709e8`. 222 green. |
| 2026-06-04 | Plan header + tables | `renderers/plan.mjs`, `ship-run.mjs`, `assets/sdlc.css` | PLN-02/03 · M-S2 | **PLN-02/03 (S-7)**: plan h1 = human title (was "Plan · slug"), editorial lede when self-summarising. **M-S2**: files-touched + checks tables wrapped in `.table-scroll` (overflow-x; min-width floor; preserves thead/tbody alignment). Commit `40572cc`. |
| 2026-06-04 | Mobile chrome (5a) | `assets/sdlc.css`, `renderers/_shell.mjs` | M-S1/M-S5/M-S6 | **M-S1**: ≤720px topbar → compact sticky mobile bar (brand + single-line crumb, no desktop actions). **M-S6**: 44px touch targets on `.btn`/so-rail; `viewport-fit=cover` + safe-area top inset. **M-S5**: ≤480px slice-card mobile tokens (mono name, flex meta). Commit `8135f47`. (Native appbar-with-title + tabbar + M-S3 component port deferred → 5b, partly S-1-gated per M-S7.) |
| 2026-06-04 | Fragment nav (SYS-R05) | `assets/sdlc.js`, `renderers/_shell.mjs`, `assets/sdlc.css` | Decision 7 / SYS-R05 | **SYS-R05 (NEW feature, BUILD)**: shell emits empty `.frag-nav`; `sdlc.js` registers each fragment on `sdlc:fragment-ready` (dedup, anchor-id assign, jump link + findings/rev badge, `.is-active` reveal). Hidden until a fragment registers (prod default until S-1). Verified via DOM mock. Commit `9c9f6ee`. |
| 2026-06-04 | Fragment templates body-only | `skills/.../_fragment-authoring.md`, `plan.md`, `ship.md`, `craft.md`, `review.md` | Decision 8 (additive) | **Decision-8 follow-up**: added "Scope: additive, body-only" to the shared contract; dropped fragment-owned heading/metric-row/static-figure from the plan/ship/design/review templates so authored fragments don't double-render against the page chrome. Commit `2ca7e5a`. |
| 2026-06-04 | Mobile component lib + chrome (5b-A/B) | `assets/sdlc.css`, `renderers/_shell.mjs` | M-S1/M-S3 · sdlc-mobile.html | **5b-A**: ported the full native-mobile component library (mtiles/pcard/stagestrip/stepper/modgroup/frow/checklist/sevrow/filterpills/fcard/evtline/chain/hmgrid/themeseg/swrow/tokrow/deploystep/checkcard/envcell/sractions) + `.m-only`/`.d-only` dual-DOM toggles (<=480) into sdlc.css. **5b-B**: sticky appbar (crumb+back+title as `<h1>`) + fixed bottom tabbar (Home/Overview/Up from the crumb trail) in `_shell.mjs`, revealed <=720 (hides `.b-topbar`+`.pg-title`); `viewport-fit=cover`. Colliding desktop names (verdict/callout/activity/scard) reused, not re-ported. Commit `1067839`. |
| 2026-06-04 | Mobile dual-DOM: dashboard/slug/plan (5b-C) | `renderers/dashboard.mjs`, `index.mjs`, `plan.mjs` | M-DASH/OVR/PLN | **5b-C** (production pages, not S-1 gated): dashboard mtiles + pcards w/ stagestrip (swimlane SVG hidden <=480); slug overview mtiles + vertical stepper (stage-stripe SVG hidden); plan modgroup file list. Commit `dee8311`. |
| 2026-06-04 | Mobile dual-DOM: rca/design/ship-run/review (5b-D) | `renderers/rca.mjs`, `design.mjs`, `ship-run.mjs`, `review.mjs` | M-RCA/DSG/SHP/REV | **5b-D** (structured/YAML path — dark in prod until S-1, M-S7): rca evtline + chain; design tokrow list + sizes table-scroll; ship-run deploystep + checkcards; review sevrow. Interactive layers (filterpills/fcard, swatch matrix, rollback buttons) left to fragments per Decision 8. rca goldens regenerated (untracked infra). Commits `5c19e4b`, `9e1ab7a`. |
| 2026-06-06 | **sync-report renderer (NEW standalone)** | `renderers/sync-report.mjs`, `tests/frontmatter.schema.json`, `skills/wf-meta/reference/sync.md`, `assets/sdlc.css`, `tests/unit/snapshots/_fixtures.mjs` | `handoff-sync-report.html` · §298 | **Sync health report BUILT** (was a 5-line `renderSimple` stub — the one NEW renderer still missing; profile/hub-dashboard already real). Full schema→renderer→skill triple: added `siblingYamlSchemas["sync-report"]`; renderer emits verdict (conflict_risk→ship/caveats/no), metric-row, **diverging-bar figure** (px_per_commit=25, clamp 360, base node @460, literal-hex SVG per dashboard convention), `files-touched` drift table w/ pos/neg + severity-blocker conflict chips, recommendation callout; **dual-DOM mobile** (2×2 mtiles + dir-grouped modgroups w/ `.frow-flag` conflict chips). Added `.sw.ahead/.sw.behind` legend swatches. `sync.md` Step 6b mandates authoring `00-sync.yaml`. +2 goldens, 227 green, e2e 0 missing renderers. |
| 2026-06-06 | Mobile dual-DOM: slice/implement grids + phone-S tier | `renderers/slice-index.mjs`, `implement-index.mjs`, `assets/sdlc.css` | M-SLC-03 · M-SYS-B01/B03/B04/T04 | **Dual-DOM completion**: wrapped Figure-5 (`sliceGridFigure`) in `.d-only` on both index renderers — phones drop the illegible grid and fall to the always-present card list (already on M-S5 spec). Added a **phone-S `@media ≤390px` tier** (tighter content padding, 22px headings, 19px appbar title, forced 2×2 metric-row, condensed mtiles) — the 480px tier didn't cover 375–390px. (Neither index renderer is snapshot-tested.) |
| 2026-06-06 | Verified per-page MINOR/NIT tuning | `renderers/_icons.mjs`, `plan-index.mjs`, `assets/sdlc.css` | REV-07 · SYS-T03 · SYS-F05 · DSG-11 · PLN-19 · OVR-22 | **Defensible tuning batch** (verified each cite vs live code — much of the backlog was stale/closed/wrong): **REV-07** verdict eyebrow `verdict`→`Verdict` (shared helper; regenerated review-dimension + design-audit goldens); **SYS-T03** body `line-height 1.6→1.65` (match `.prose`); **SYS-F05** `.figure-canvas svg` `width:100%`→`+max-width:100%` (no upscaling); **DSG-11** `.token-swatch` 14→20px; **PLN-19** plan-index "with blockers" metric only amber when >0; **OVR-22** `.badge` 11→12px. SKIPPED as stale/wrong: OVR-17 (wants `.lede`; prod correctly uses `.sdlc-lede`), IMP-16 (already "Implementation"), SLC-07 (all 4 legend entries already present), `.actions`/⌘K hide + `.content` bottom-pad (already done ≤720px). SKIPPED as debatable/contract-risk: REV-14 (`TOTAL`→`Σ`), RCA-16/17 (aside→div callout — identical render, breaks snippet/gallery contract), REV-12 (verdict md2html — structural risk). 227 green. |
| 2026-06-04 | **Design-agent mockups generated** (all NEW/ADAPT/PARTIAL) | `sdlc-handoff/sdlc/project/handoff-*` (9 mockups + `_handoff-kit.css` + `handoff-INDEX.html`) | every uncovered page-review row | **Mockup pass** (not a renderer fix — design refs for the upcoming build). Extracted `_handoff-kit.css` (tokens + desktop `.vb` + mobile `.device` + `.gw-api` contract, lifted verbatim from the 3 source files). Authored 6 NEW pages (benchmark ⭐exemplar, experiment, instrument, profile, sync-report, hub-landing — each desktop + mobile + sibling-YAML contract), 2 ADAPT templates (calm-reader ≈22 pages, index-grid 5 pages), 1 PARTIAL (slice nav grids). Verified: every rendered class is kit-defined; all tags balanced. Rows flipped 🎨; implementation queue + build order added above. Bundle is gitignored (not committed). |
