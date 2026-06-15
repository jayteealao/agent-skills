# SDLC View — Feature Ideas

**Status:** Drafted 2026-05-30 from a direct read of the rendered-view surface (not from
training-data guesswork). Grounded in [_shell.mjs](renderers/_shell.mjs),
[dashboard.mjs](renderers/dashboard.mjs), [sdlc.js](assets/sdlc.js), [sdlc.css](assets/sdlc.css),
[_link-graph.mjs](renderers/_link-graph.mjs), and [_history.mjs](renderers/_history.mjs). This is
a prioritised **idea backlog**, not a finalised phased plan — each item is scoped enough to lift
into its own plan/PR when chosen.

**Scope.** The per-repo rendered SDLC view (`.ai/_view/`): the dashboard, the ~60 artifact-page
renderers, and the shared shell chrome. **Hub** landing-page features live separately in
[MULTI-REPO-REGISTRY-PLAN.md §11](MULTI-REPO-REGISTRY-PLAN.md) — that plan **landed v9.33.0**
(Phases 0–6 + the cross-repo inbox §11.3), so its remaining post-MVP §11 follow-ons are now
catalogued in the **Hub enhancements** section at the bottom of this file. Where a per-repo view
feature also benefits the hub landing page, it is flagged "↔ hub".

**Hard architectural constraint.** The view is **server-rendered HTML, no framework, no build
step**; [sdlc.js](assets/sdlc.js) is hand-rolled vanilla ("No framework, no build step. Hand-rolled
vanilla." — [sdlc.js:4](assets/sdlc.js:4)). Every idea here must stay within that: progressive
enhancement over already-rendered DOM, plus at most a small JSON island per page. No SPA, no
bundler.

---

## Current view surface (what exists today)

- **Per-repo dashboard** ([dashboard.mjs](renderers/dashboard.mjs)) — a hand-drawn SVG swimlane
  figure (10-stage lifecycle intake→retro) + ledger rows grouped Active / Recently-shipped /
  Closed / Quick, each with an at-a-glance `health()` glyph and a human-relative timestamp.
- **~60 artifact-page renderers** — one per SDLC stage and document type (intake, shape, slice,
  plan, implement, verify, review, handoff, ship, retro, design, RCA, benchmark, …).
- **Shell chrome** ([_shell.mjs](renderers/_shell.mjs)) — topbar with brand + breadcrumb + an
  `actions` area, footer with up/updated/source links, optional SSE live-reload.
- **Cross-artifact ref resolution** ([_link-graph.mjs](renderers/_link-graph.mjs)) — `refs:` are
  rewritten to view-tree hrefs; broken refs get `.broken-link`.
- **Per-artifact history** ([_history.mjs](renderers/_history.mjs)) — prior revision snapshots
  surfaced in a `<details class="history">` list.
- **Client JS** ([sdlc.js](assets/sdlc.js)) — copy-buttons, design-token copy, smooth-scroll,
  a `sdlc:fragment-ready` event. **That is the entire interactive surface.**

### Notable gaps found during the read

- **`⌘K` search is advertised but unimplemented.** The topbar renders
  `<span class="kbd">⌘K</span> to search` ([_shell.mjs:72](renderers/_shell.mjs:72)); `sdlc.js`
  has no keyboard handler and no search. A dangling promise.
- **`viewing as you`** ([_shell.mjs:72](renderers/_shell.mjs:72)) implies a persona/role concept
  that does not exist.
- **The dashboard ledger is fully static** ([dashboard.mjs:107](renderers/dashboard.mjs:107)) — no
  filter, no sort.
- **No theme / dark mode** — `sdlc.css` has zero `prefers-color-scheme` / `data-theme` / toggle
  (grep: 0 matches). Fixed warm-paper light theme only.
- **The link graph is computed and discarded** — [_link-graph.mjs](renderers/_link-graph.mjs)
  builds the full edge set but only ever emits inline hyperlinks; no map view.
- **History lists revisions but never diffs them** ([_history.mjs](renderers/_history.mjs)).

---

## Guiding principles for picking from this list

1. **Surface data that already exists before computing anything new.** Several Tier-2 items just
   render information the pipeline already produces and throws away (link graph, history, stage
   timing). Highest leverage, lowest risk.
2. **Honesty beats novelty.** Shipping the `⌘K` the chrome already claims (or removing the claim)
   outranks any net-new idea — unimplemented affordances teach users the UI lies.
3. **Progressive enhancement only.** If JS is disabled the page must still read correctly; features
   layer on top of server-rendered HTML.

---

## Tier 1 — make the view scale and honor its own promises

### 1. Real `⌘K` command palette / search · ↔ hub · effort: M

- **Exists:** the topbar text promises it ([_shell.mjs:72](renderers/_shell.mjs:72)).
- **Gap:** no handler, no search anywhere in [sdlc.js](assets/sdlc.js).
- **Feature:** a vanilla command palette — fuzzy-search slugs, stages, and artifact titles;
  jump-to-page; quick actions (copy link, toggle theme, jump to map). Feed it from a small
  `search-index.json` (or an inline `<script type="application/json">` island) emitted by the
  render pipeline, which already enumerates every slug/artifact.
- **Why first:** the view is unnavigable by keyboard without it, and it's the natural host for #7
  (theme toggle) and a launcher for #4 (map). Building it first creates the surface later features
  plug into.

### 2. Dashboard filter + sort · effort: S–M

- **Exists:** static sections only ([dashboard.mjs:107](renderers/dashboard.mjs:107)).
- **Gap:** past ~10 workflows the ledger is a wall of rows.
- **Feature:** client-side filter chips (`current-stage`, `status`, **blocked-only**) and sort (by
  recency via the `updated-at` already parsed in `humanRelative`, by stage depth). Pure
  progressive enhancement over the rendered DOM — no re-render.

### 3. Per-repo "needs attention" strip · ↔ hub · effort: S

- **Exists:** `health()` ([dashboard.mjs:166](renderers/dashboard.mjs:166)) already classifies
  blocked / paused / waiting with glyphs.
- **Gap:** blocked items are styled in place but never *surfaced* to the top.
- **Feature:** a summary band pulling anything blocked/paused/stale to the top of the dashboard.
  The hub's cross-repo inbox classifier now exists — `inboxItems()` in
  [hub-dashboard.mjs](renderers/hub-dashboard.mjs) (blocked / in-review / stale). Building this
  strip is the moment to **extract that classifier to a shared `lib/` helper** so "needs attention"
  means the same thing in the per-repo dashboard and the hub.

---

## Tier 2 — comprehension (the view's real job)

### 4. Visual artifact map / link-graph · effort: M

- **Exists:** [_link-graph.mjs](renderers/_link-graph.mjs) `buildPathMap` + `resolveRefs` compute
  every `storagePath → viewPath` edge, with `.broken-link` flagging.
- **Gap:** that graph is rendered **only as inline hyperlinks** — the structure is latent and never
  drawn.
- **Feature:** a per-slug map view — nodes = artifacts (intake→shape→plan→…→retro plus design/RCA
  branches), edges = resolved refs, broken refs in red. Reuse the hand-rolled SVG approach the
  swimlane already uses. Turns "where did this decision come from?" from link-chasing into a glance.

### 5. Revision diff (not just a revision list) · effort: M

- **Exists:** [_history.mjs](renderers/_history.mjs) surfaces prior snapshots in a `<details>` list.
- **Gap:** you can see *that* rev 3 exists, not *what changed* from rev 2.
- **Feature:** an inline line-diff between adjacent snapshots (they're plain markdown — a server-side
  diff is cheap). "What changed in the shape between revisions" is exactly what history should answer.

### 6. Stage-aging / velocity signals · effort: M

- **Exists:** `humanRelative()` ([dashboard.mjs:177](renderers/dashboard.mjs:177)) shows *when* a
  workflow last moved.
- **Gap:** not *how long it's been stuck* in the current stage.
- **Feature:** a staleness indicator (dim/warn a row whose `current-stage` hasn't advanced in N days)
  and, if history snapshots carry stage transitions, a small "time-in-stage" sparkline. Converts a
  status snapshot into a process-health tool.

---

## Tier 3 — polish the design currently lacks

### 7. Dark mode · effort: S

- **Gap:** zero theming in `sdlc.css` (0 grep matches for `prefers-color-scheme`/`data-theme`).
- **Feature:** a `prefers-color-scheme` block + a `⌘K`-palette toggle persisted in `localStorage`.
  Frequently expected for a tool developers stare at.

### 8. Responsive ledger + swimlane · ↔ hub · effort: M

- **Gap:** the swimlane SVG is a fixed `980`-wide viewBox
  ([dashboard.mjs:199](renderers/dashboard.mjs:199)) — text goes illegible on a phone; the ledger
  row is a fixed multi-column grid.
- **Feature:** a narrow-screen layout (stack the row; horizontally scroll the swimlane with sticky
  stage labels). Becomes important once the hub exposes the view over Tailscale
  ([MULTI-REPO-REGISTRY-PLAN.md §4.6](MULTI-REPO-REGISTRY-PLAN.md)).

### 9. `viewing as you` → real persona lenses, or remove the chrome · effort: S (remove) / L (build)

- **Gap:** the topbar implies a role concept ([_shell.mjs:72](renderers/_shell.mjs:72)) that doesn't
  exist.
- **Feature:** either make it real (a lens emphasising different artifacts for reviewer vs.
  implementer) or drop the dead chrome. **Lean toward removing** unless a concrete persona need
  appears — same trust erosion as the fake `⌘K`.

---

## Hub enhancements — post-MVP follow-ons (from MULTI-REPO-REGISTRY-PLAN §11)

The multi-repo hub ([MULTI-REPO-REGISTRY-PLAN.md](MULTI-REPO-REGISTRY-PLAN.md)) **landed v9.33.0**:
Phases 0–6 plus the cross-repo **inbox** (§11.3) — now the landing page's default tab in
[renderers/hub-dashboard.mjs](renderers/hub-dashboard.mjs) (`inboxItems` classifier + CSS-only
radio tabs). Two §11 items were folded into the core build and also shipped: **lazy hub
supervision** (§11.7 — `ensureServeLifecycle` resurrects a stale hub) and the **shard-cap janitor**
(§3.4). The items below are the remaining, genuinely-optional follow-ons. They are catalogued here
(per request) even though they target the **hub** landing page rather than the per-repo view —
they ride almost entirely on data the registry already carries (`slugMeta`, `repoRoot`,
`lastRenderedAt`), so the cost is in the renderer, not the data model.

> **Constraint reminder:** the hub landing page is inline-CSS, served under a strict
> `script-src 'self'` CSP with no `/_assets/` route. Client JS must be a same-origin script (the
> hub already serves one at `/__sdlc/hub-reload.js`) — never inline. The inbox tabs are CSS-only
> for exactly this reason.

### H1. Open-in-editor deep links · effort: S

- **Exists:** the hub is the only place that knows every `repoRoot`; each inbox/slug row already
  links to `/r/<id>/<slug>/`.
- **Gap:** the highest-frequency multi-repo action is "see it's blocked → jump into that repo in
  my IDE", and there's no affordance for it.
- **Feature:** a second affordance per repo/slug — a `vscode://file/<repoRoot>` link (and a
  JetBrains `jetbrains://` variant), scheme configurable in `hub-config.json`. Render as a plain
  link; the OS handles the scheme, so no new daemon capability. Natural home: a small icon on each
  inbox-item and entry-card header.

### H2. Aggregate tab-title / favicon status · effort: S

- **Exists:** the landing page already connects to `/__sdlc/events` via the served
  `hub-reload.js`, and `inboxItems` already computes the blocked/attention count.
- **Gap:** with many tabs open you should know something went red *without* looking at the page;
  right now the title is a static "SDLC Hub".
- **Feature:** `document.title = "(3) SDLC Hub"` and a colour-coded favicon dot, updated from the
  live SSE stream — *peripheral awareness*. Trivial client-side addition on the channel the hub
  already builds; extend (or add a sibling to) `hub-reload.js`. Favicon swap can be a data-URI to
  avoid an asset route.

### H3. Richer git state per entry · effort: M

- **Exists:** `lib/registry.mjs` already shells to `git` for branch/worktree identity (§3.1) at
  render time.
- **Gap:** the landing page can't show "3 behind · dirty" — only branch + last-rendered age.
- **Feature:** a few extra **cheap render-time** `git` calls (never at serve time) capturing
  `dirty` (porcelain non-empty), `ahead`/`behind` vs upstream, and short HEAD sha — stored as
  optional entry fields under the existing `version:1` registry migration. Landing page then shows
  "repo-A · feature-x · 3 behind · dirty". **Opt-in** via `hub-config.json`
  (`captureGitState: false` default) to honour the zero-cost-when-off principle.

### H4. `sdlc hub` CLI surface · effort: S

- **Exists:** `package.json` ships `hub` / `hub:stop` scripts; `lib/hub-lifecycle.mjs` exports
  `ensureHubLifecycle`/`stopHub`; `lib/registry.mjs` exports `readRegistry`/`mergeShardsIntoRegistry`.
- **Gap:** no `status` / `list` / `open` — "what's the hub doing and on what port?" needs reading
  `hub.pid` by hand.
- **Feature:** round the scripts out to `start | stop | restart | status | list | open`. `status`
  prints the bound address from `hub.pid` + entry count + uptime (from `/__sdlc/health`); `list`
  merges-on-read and prints the registry (also the hub-less shard-flush path); `open` launches the
  browser at the bound URL. The "I don't want to remember the port" entry point.

### H5. Health metrics + wide-event logging · effort: S–M

- **Exists:** `/__sdlc/health` already carries `requests`, `sseClients`, `perRepoLastServed`,
  `rssBytes`, `uptimeMs`; the plugin ships the
  [wide-event-observability](skills/wide-event-observability) skill.
- **Gap:** when "repo-B stopped reloading" after the fact, there's no canonical record to debug
  from — the failure mode a long-lived aggregating daemon is most prone to.
- **Feature:** emit **one canonical log line per render-reload and per upsert** (repo id, route,
  bytes, duration, outcome) following the wide-event skill. That single line is the only way to
  reconstruct what the hub did hours later.

---

## Build-order dependency

```
#1 ⌘K palette ──┬──> hosts #7 theme toggle
                └──> launches #4 map view
#3 attention strip ──shares classifier──> hub inbox (§11.3, BUILT: inboxItems in hub-dashboard.mjs)
H3 git-state ──feeds──> H2 tab-title status (richer signal)
```

Build **#1 first**: it is the interaction surface #7 and #4 plug into, and shipping it makes the
existing topbar honest.

---

## Notes / open questions

- **Search-index source (Q for #1):** emit a per-repo `search-index.json` file, or an inline JSON
  island per page? File = one fetch, cacheable, hub-friendly; island = zero extra request but
  duplicated per page. Lean file.
- **Where does the classifier live (#3 ↔ hub)?** The hub's `inboxItems()` (in
  `renderers/hub-dashboard.mjs`) is the de-facto classifier today. When #3 lands, extract it to a
  shared `lib/` helper consumed by both `dashboard.mjs` and `hub-dashboard.mjs`, so
  "blocked/stale/attention" means the same thing in both places (rather than two drifting copies).
- **Diff library (#5):** prefer a tiny hand-rolled LCS line-diff over a dependency, to keep the
  no-build-step constraint.
- **CSP note:** any new `sdlc.js` behaviour must stay external (not inline) to survive the strict
  `script-src 'self'` CSP the served pages use ([_shell.mjs:52](renderers/_shell.mjs:52)).
