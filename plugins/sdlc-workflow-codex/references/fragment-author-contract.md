# Fragment author contract (phase 1 — v9.20.0)

Shared template referenced by the five fragment-bearing skills (`review`,
`wf/plan`, `wf-design/craft`, `wf/ship`, `wf-quick/rca`). Each of those
references includes a "Step N — write the rich fragment" section that points
here. Authoring guidance lives in one place; per-router references stay focused
on their domain logic.

> **This contract governs the TYPED fragment only** (`<stem>.html.fragment`,
> contract-bound, YAML-projected). Since v9.70.0 any artifact may also ship free
> **narrative fragments** — `<stem>.<label>.html.fragment`, unrestricted raw HTML
> with none of the rules below, for every subcommand and artifact type. See
> [`narrative-fragments.md`](narrative-fragments.md). The two tiers coexist;
> nothing here constrains the free tier.

## Author the `.yaml` FIRST — it is mandatory, not a precondition

The rich tier renders from the sibling **`.yaml`** (the structured data the page
reads) and, optionally, the **`.html.fragment`** (the interactive layer on top).
The `.yaml` is the load-bearing file: **the renderer gates the rich figure/table on
it — with no `.yaml` the page silently degrades to plain prose (`renderSimple`)**,
and the `metric-row`, hero figure, verdict heatmap, etc. never appear. So for every
rich artifact:

1. **Write the sibling `<stem>.yaml`** — the structured data, conforming to
   `siblingYamlSchemas.<type>` in `tests/frontmatter.schema.json` (one of
   `review`, `rca`, `plan`, `design`, `ship-run`). This step is **MANDATORY** even
   if you skip the fragment; the `post-write-verify` hook **BLOCKS (exit 2)** a rich
   `.md` written without its sibling `.yaml`. Write the `.yaml` first (or in the same
   turn). An artifact that legitimately has no structured data to project may opt out
   with `fragment: none` in its frontmatter.
2. **Write the sibling `<stem>.html.fragment`** — the body-only interactive layer
   (below). Optional but expected for the five rich types.

Write the siblings next to the primary artifact `.md`:

```
.ai/workflows/<slug>/07-review.md
.ai/workflows/<slug>/07-review.yaml
.ai/workflows/<slug>/07-review.html.fragment        ← this file

.ai/workflows/<slug>/04-plan-<slice-slug>.md
.ai/workflows/<slug>/04-plan-<slice-slug>.yaml
.ai/workflows/<slug>/04-plan-<slice-slug>.html.fragment

.ai/workflows/<slug>/02b-design.md
.ai/workflows/<slug>/02b-design.yaml
.ai/workflows/<slug>/02b-design.html.fragment

.ai/workflows/<slug>/09-ship-run-<run-id>.md
.ai/workflows/<slug>/09-ship-run-<run-id>.yaml
.ai/workflows/<slug>/09-ship-run-<run-id>.html.fragment

.ai/workflows/<slug>/augmentations/<rca-id>.md            (when augmentation-type: rca)
.ai/workflows/<slug>/augmentations/<rca-id>.yaml
.ai/workflows/<slug>/augmentations/<rca-id>.html.fragment
```

## Scope — body-only (additive)

A fragment is **additive**: the page (renderer) already builds the chrome — the one
page heading (`pg-title`/`sdlc-h1` + breadcrumb), the lede, and the `metric-row`.
The fragment is appended *below* that chrome and owns only the **interactive detail
layer** (collapsible diff rows, clickable check cells + log panels, live swatches +
copy controls, severity filters, `:target` timelines).

- **Do NOT emit a page heading, verdict block, or `metric-row` inside the fragment**
  — the page renders them; a copy double-renders. Start the fragment at its first
  interactive element.
- Where the renderer *also* draws a section from the YAML (a hero figure, a static
  table), the fragment owns the **interactive** version and the renderer suppresses
  its static copy — never ship both (precedence). No second static duplicate.

The per-fragment structures below show the interactive elements only; the `<header>`
chrome they once illustrated is the **page's**, not the fragment's.

## Hard contract — every fragment MUST

1. Be one `<section class="fragment-<name>" data-artifact="<type>" [data-rev=…]
   [data-slice=…] [data-component=…]>` with no `<html>`, `<head>`, or `<body>`
   wrappers.
2. Scope every new selector under `.fragment-<name>` in its inline `<style>`
   block. Never define global selectors.
3. Use only the documented shared classes outside its scope:
   - `.verdict`, `.verdict-{ship|caveats|no}`
   - `.sev`, `.severity-{blocker|high|med|low|nit}`
   - `.metric-row`, `.metric`, `.metric-{label|value|ann}`
   - `.callout`, `.callout-{risk|warn|info|ok}`
   - `.files-touched`, `.is-{new|modified|deleted|external}`
   - `pre.diff`, `.diff-{add|rem|ctx}`
   - `.btn`, `.btn-{primary|danger}`
   - `.status-badge`, `.stage-badge`
   - `.sdlc-{h1|h2|lede|crumb}`
   - `.timeline`, `.figure-canvas`
4. Inline `<script>` block (vanilla JS only). No fetch, no remote
   `<script src="…">`, no `<iframe>`, no `<link>`.
5. On settle, dispatch:
   ```js
   window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', {
     detail: { name: '<name>', artifact: '<type>', /* per-fragment counts */ }
   }));
   ```
6. Render usefully with JS disabled. Filters, sorts, copy buttons may
   degrade; static content must remain readable.
7. Mobile-responsive down to 320 px. Heatmaps and matrices may scroll
   horizontally via `overflow-x: auto`.
8. Inline SVG only — no external images. All chart data deterministically
   derived from the sibling `.yaml`; re-running on the same YAML must
   produce byte-identical output.
9. No emoji as the sole carrier of meaning. Severity glyphs (`●▲◆—·`)
   pair with colour for deuteranope safety; verdict glyphs (`✓ ◐ ✗`)
   pair with `.verdict-X` classes.

## Hard contract — every fragment MUST NOT

- Load remote stylesheets or scripts.
- Override the shell's topnav, breadcrumb, footer, or `data-artifact-type`.
- Mutate `document.body` or anything outside
  `document.currentScript.closest('.fragment-<name>')`.
- Use forbidden tags: `<html>`, `<head>`, `<body>`, `<iframe>`, `<link>`,
  `<script src="…">`.

## Per-fragment structure

The five fragment shapes are documented in
[`reference/fragments-gallery.html`](fragments-gallery.html). Each block is a
complete reference implementation including CSS + JS scoped to the fragment.
The gallery is **bundled inside the plugin** — installed agents can read it
without any access to the upstream `agent-skills/sdlc-handoff/` bundle.

### `fragment-review`

```
<section class="fragment-review" data-artifact="review" data-rev="2">
  <!-- page owns heading + verdict + metric-row (body-only) — fragment starts here -->
  <nav class="fr-dim-bar">… aria-pressed dimension chips …</nav>
  <div class="fr-controls">… severity checkboxes + sort dropdown + visible-count …</div>
  <ol class="fr-findings">
    <li data-finding data-severity data-sev-weight data-dimension data-conf
        data-conf-weight data-file>
      <details>
        <summary>… severity chip + msg + meta …</summary>
        <pre class="diff">…</pre>
        <p>Suggested fix: …</p>
        <button class="btn copy-btn" data-copy-target="…">Copy as PR comment</button>
      </details>
    </li>
  </ol>
  <style>/* .fr-* scoped */</style>
  <script>/* filter/sort + sdlc:fragment-ready dispatch */</script>
</section>
```

Per-finding `<li>` data attributes drive the filter JS. `data-conf-weight`
folds confidence into the sort.

### `fragment-rca`

```
<section class="fragment-rca" data-artifact="rca" data-incident="INC-…">
  <!-- page owns heading + metric-row (body-only) — fragment starts here -->
  <svg class="timeline"> … alert/escalation/deploy/mitigation/resolution circles
       wrapped in <a href="#evt-N"> for :target panel navigation … </svg>
  <aside class="rca-detail-panel">
    <div id="evt-1">…</div>
    <div id="evt-2">…</div>
    … one per timeline event …
  </aside>
  <svg class="causal-chain"> 4 boxes + arrows; root cause in --blocker </svg>
  <table class="rca-heatmap">… systems × 30-min buckets, cells s0–s3 …</table>
  <div class="rca-causes">… .callout-warn per contributing cause …</div>
  <div class="rca-mitigations">… .callout-info per mitigation …</div>
  <style>/* .rca-* scoped */</style>
  <script>/* :target hover/focus + Esc reset + sdlc:fragment-ready */</script>
</section>
```

Timeline navigation is CSS-only via `:target`. JS only enhances hover/focus.

### `fragment-plan`

```
<section class="fragment-plan" data-artifact="plan" data-slice="<slug>" data-rev="3">
  <!-- page owns heading + metric-row + topology figure (body-only) — fragment starts at the table -->
  <svg class="pl-topology"> file-change topology — modules as dashed <rect>;
       files as tinted rects (new/modified/deleted/external);
       import edges <path>; "replaces" edges dashed in --blocker </svg>
  <table class="files-touched">
    <tbody>
      <tr><td><details><summary>…path + role chip…</summary>
        <div class="pl-card">… intent + diff sketch …</div>
      </details></td></tr>
    </tbody>
  </table>
  <div class="pl-risks">… .callout-risk / .callout-warn / .callout-info …</div>
  <details class="pl-revs">
    <summary>N prior revisions</summary>
    <ul>… entries from history/ …</ul>
  </details>
  <style>/* .pl-* scoped */</style>
  <script>/* counts files + modules, dispatches sdlc:fragment-ready */</script>
</section>
```

### `fragment-design`

```
<section class="fragment-design" data-artifact="design" data-component="…">
  <!-- page owns heading + tokens metric-row (body-only) — fragment starts at the swatch matrix -->
  <div class="dz-matrix">
    … 24-cell swatch grid: 4 sizes × 3 states × 2 themes
       each cell renders <button class="ck-btn is-{default|hover|pressed}"> …
  </div>
  <table class="dz-tokens">
    <tr>
      <td><span class="dz-swatch" style="background:var(--ck-bg)"></span></td>
      <td><code>--ck-bg</code></td>
      <td>color · steel-blue</td>
      <td>#2a6f8a</td>
      <td><button class="btn copy-btn" data-token-copy="--ck-bg: #2a6f8a">Copy</button></td>
    </tr>
    …
  </table>
  <svg class="dz-specs"> annotated dimension lines + labels
       (padding-y, padding-x, gap, border-radius, height) </svg>
  <style>/* .dz-* + .ck-* scoped */</style>
  <script>/* token-copy with is-copied flash + sdlc:fragment-ready */</script>
</section>
```

### `fragment-shiprun`

```
<section class="fragment-shiprun" data-artifact="ship-run" data-release="v3.2.0">
  <!-- page owns heading + metric-row (body-only) — fragment starts at the timeline -->
  <svg class="sr-timeline"> build → test → stage → canary → prod
       segments tinted by status (ok/flake/fail/running/pending) </svg>
  <table class="sr-checks">
    <thead><tr><th>check</th><th>staging</th><th>canary</th><th>production</th></tr></thead>
    <tbody>
      <tr><td>e2e-checkout</td>
          <td class="is-pass">pass · 182s</td>
          <td class="is-pass">pass · 168s</td>
          <td class="is-running">…</td></tr>
    </tbody>
  </table>
  <aside class="sr-log-panel" hidden>… cell-click reveals log …</aside>
  <div class="sr-actions">
    <button class="btn btn-primary">Promote to 100%</button>
    <button class="btn btn-danger">Roll back</button>
  </div>
  <style>/* .sr-* scoped */</style>
  <script>/* cell click → log + sdlc:fragment-ready */</script>
</section>
```

## YAML → fragment mapping

Each fragment is a deterministic projection of its sibling YAML. The
five sibling-YAML schemas in `tests/frontmatter.schema.json` under
`siblingYamlSchemas` define the exact shape. Re-running the author on
the same YAML must produce byte-identical fragment output.

## Validation

`scripts/verify-fragment.mjs` enforces the contract. Run it standalone
(`node scripts/verify-fragment.mjs`); it runs error-level — a malformed
fragment fails the verifier.

## Where to look for reference implementations

- **Authoritative** (bundled, plugin-relative): [`reference/fragments-gallery.html`](fragments-gallery.html)
- **Upstream design source** (dev-only, lives at `agent-skills/sdlc-handoff/`): not present in installed plugins
- **CSS shared catalogue**: `plugins/sdlc-workflow/assets/sdlc.css`
- **Design tokens**: `:root` block at the top of `sdlc.css`
- **Shell behaviour**: `plugins/sdlc-workflow/assets/sdlc.js`
- **Plan**: [`SUNFLOWER-VIEW-PLAN.md`](../SUNFLOWER-VIEW-PLAN.md) §"Fragment contract"
