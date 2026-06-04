# All-Artifacts Projection Plan

Goal: **every artifact the plugin writes gets a bespoke view-layer page.** Today
~30 artifact types either never reach the renderer (not discovered, or their
filename doesn't resolve to a view path) or fall through to the generic
`fallbackRender`. This plan makes each a first-class, bespoke projection.

Companion to [QUALITY-GATES-PLAN.md](QUALITY-GATES-PLAN.md) (which added the
snapshot suite + e2e acceptance test that this plan must keep green) and the
view-layer engine in [scripts/render-sunflower.mjs](scripts/render-sunflower.mjs)
+ [renderers/_paths.mjs](renderers/_paths.mjs).

## Scope decisions (locked 2026-06-04)

After reconnaissance the raw scope was ~30 types; the following decisions narrow
it to **23 bespoke renderers**:

1. **Per-step pages for ALL four run families** (wf-docs, update-deps, hotfix,
   refactor) — one bespoke page per artifact, no run-index folding. Resolves
   Open Question 3 → per-step.
2. **Skip the `how-*` family** (5 schema-exempt research-note types). They stay
   unprojected for now; no `.ai/research/` discovery root is added. Resolves
   Open Question 2 → exempt + unprojected.
3. **Skip `routing` (`90-next.md`)** — it's a regenerable snapshot that duplicates
   `00-index.md`'s `next-command`/`next-invocation`. Stays in the e2e
   `NOT_RENDERED` set as a documented intentional non-projection. Resolves Open
   Question 1 → skip (`sync-report` already has a renderer, so it was never in scope).
4. **Include `ideation` + the five `dep-*` types** with new schema branches and
   two new discovery roots (`.ai/ideation/`, `.ai/dep-updates/`).

**Net build:** 23 renderers = 13 workflow-lane (`discover`, `fix-plan`,
`investigate`, 4×`hf-*`, 5×`rf-*`, `close-record`) + 4 `docs-*` + 1 `ideation` +
5 `dep-*`. Two new discovery roots + the docs-walker expansion. ~10
`resolveViewPath` entries. 6 schema branches (`ideation` + 5 `dep-*`). After this,
the only admitted-but-unprojected type is `routing` (by choice).

---

## Why artifacts are missing today

A type gets a bespoke page only when **all three** hold:

1. **Discovered** — its storage root is walked by `discoverArtifacts`
   (currently only `.ai/workflows/`, `.ai/simplify/`, `.ai/profiles/`, `.ai/docs/`
   (index-only), and project root).
2. **Resolved** — its filename maps to a non-null view path in
   `resolveViewPath` (`PHASE_BY_BASENAME` + regexes).
3. **Rendered** — a `renderers/<type>.mjs` exists; otherwise `loadRenderer`
   returns null and the loop uses `fallbackRender` (a generic card).

Three failure modes follow, worst-first:

| Mode | Symptom | Examples |
|---|---|---|
| **A — not discovered** | storage root never walked → no page at all | `dep-*` (`.ai/dep-updates/`), `ideation` (`.ai/ideation/`), `how-research`/`how-codebase` (`.ai/research/`), all four `docs-*` (walker keeps only `08b-docs-index.md`) |
| **B — discovered, unresolved** | `resolveViewPath` returns null → dropped | `hf-*`, `rf-*`, `close-record` (`99-close.md`), `routing` (`90-next.md`), `discover` (`01-discover.md`) |
| **C — resolved, generic** | renders, but as a plain `fallbackRender` card | `fix-plan` (`01-fix.md`), `investigate` (`01-investigate.md`) |

Only Mode C is visible at all today. "Bespoke for everything" therefore means
**discovery + path first, renderer second** — a renderer alone fixes nothing for
Modes A and B.

---

## Reconnaissance — complete inventory of unprojected types

Legend: **Disc** = discovered today · **Path** = `resolveViewPath` resolves today ·
**Rndr** = bespoke renderer exists · **Schema** = admitted by `frontmatter.schema.json`.

### Group A — schema-admitted, under `.ai/workflows/<slug>/`

| type | producer | filename | Disc | Path | Rndr | Mode |
|---|---|---|---|---|---|---|
| `discover` | `/wf-quick discover` | `01-discover.md` | ✅ | ❌ | ❌ | B |
| `fix-plan` | `/wf-quick fix` | `01-fix.md` | ✅ | ✅ (`01-fix`→fix) | ❌ | C |
| `investigate` | `/wf-quick investigate` | `01-investigate.md` | ✅ | ✅ | ❌ | C |
| `hf-brief` | `/wf-quick hotfix` | `hf-brief.md` | ✅ | ❌ | ❌ | B |
| `hf-plan` | `/wf-quick hotfix` | `hf-plan.md` | ✅ | ❌ | ❌ | B |
| `hf-implement` | `/wf-quick hotfix` | `hf-implement.md` | ✅ | ❌ | ❌ | B |
| `hf-verify` | `/wf-quick hotfix` | `hf-verify.md` | ✅ | ❌ | ❌ | B |
| `rf-brief` | `/wf-quick refactor` | `rf-brief.md` | ✅ | ❌ | ❌ | B |
| `rf-baseline` | `/wf-quick refactor` | `rf-baseline.md` | ✅ | ❌ | ❌ | B |
| `rf-plan` | `/wf-quick refactor` | `rf-plan.md` | ✅ | ❌ | ❌ | B |
| `rf-implement` | `/wf-quick refactor` | `rf-implement.md` | ✅ | ❌ | ❌ | B |
| `rf-verify` | `/wf-quick refactor` | `rf-verify.md` | ✅ | ❌ | ❌ | B |
| `close-record` | `/wf-meta close` | `99-close.md` | ✅ | ❌ | ❌ | B |
| `routing` | `/wf-meta next` | `90-next.md` | ✅ | ❌ | ❌ | B |

### Group B — schema-admitted, under `.ai/docs/<run-id>/` (walker keeps only the index)

| type | producer | filename | Disc | Path | Rndr | Mode |
|---|---|---|---|---|---|---|
| `docs-discover` | `/wf-docs` step 1 | `discover.md` | ❌ | n/a | ❌ | A |
| `docs-audit` | `/wf-docs` step 2 | `audit.md` | ❌ | n/a | ❌ | A |
| `docs-plan` | `/wf-docs` step 3 | `plan.md` | ❌ | n/a | ❌ | A |
| `docs-generate` | `/wf-docs` step 4 | `generate.md` | ❌ | n/a | ❌ | A |

### Group C — NOT schema-admitted, off-pipeline roots not walked

| type | producer | filename / root | Disc | Rndr | Schema |
|---|---|---|---|---|---|
| `ideation` | `/wf-quick ideate` | `.ai/ideation/<focus>-<ts>.md` | ❌ | ❌ | ❌ |
| `dep-scan` | `/wf-quick update-deps` | `.ai/dep-updates/<run-id>/scan.md` | ❌ | ❌ | ❌ |
| `dep-research` | `/wf-quick update-deps` | `.ai/dep-updates/<run-id>/research.md` | ❌ | ❌ | ❌ |
| `dep-plan` | `/wf-quick update-deps` | `.ai/dep-updates/<run-id>/plan.md` | ❌ | ❌ | ❌ |
| `dep-implement` | `/wf-quick update-deps` | `.ai/dep-updates/<run-id>/implement.md` | ❌ | ❌ | ❌ |
| `dep-verify` | `/wf-quick update-deps` | `.ai/dep-updates/<run-id>/verify.md` | ❌ | ❌ | ❌ |
| `how-quick` | `/wf-meta how` | `.ai/workflows/<slug>/90-how-<topic>.md` | ✅ | ❌ | ❌ (by design) |
| `how-workflow` | `/wf-meta how` | `.ai/workflows/<slug>/90-how-<artifact>.md` | ✅ | ❌ | ❌ (by design) |
| `how-findings` | `/wf-meta how` | `.ai/workflows/<slug>/90-findings-explain.md` | ✅ | ❌ | ❌ (by design) |
| `how-codebase` | `/wf-meta how` | `.ai/research/<topic>-<ts>.md` | ❌ | ❌ | ❌ (by design) |
| `how-research` | `/wf-meta how` | `.ai/research/<topic>-<ts>.md` | ❌ | ❌ | ❌ (by design) |

**Out of scope:** `probe` is written as a compressed `slice` (`type: slice`,
`slice-type: probe`) and already renders via `slice.mjs`; it needs nothing.
`ship` / `ship-legacy` have renderers but a separate question (does any current
filename resolve to them?) — tracked as Open Question 4, not part of this plan.

Totals: **15 (A) + 4 (B) + 11 (C) = 30 types.** Group C adds **3 new discovery
roots** (`.ai/dep-updates/`, `.ai/ideation/`, `.ai/research/`).

---

## Design

Four moving parts, applied per group.

### 1. Discovery (`scripts/render-sunflower.mjs`)

- **Expand `discoverDocsArtifacts`** to also yield `discover.md`, `audit.md`,
  `plan.md`, `generate.md` under `.ai/docs/<run-id>/` (keep the index special-case;
  add the four intermediates with `kind: 'docs'`).
- **Add three roots** to `discoverArtifacts`, each a new `kind`:
  - `dep-updates` → walk `.ai/dep-updates/`, slug `__deps__`, `kind: 'deps'`.
  - `ideation` → walk `.ai/ideation/`, slug `__ideation__`, `kind: 'ideation'`.
  - `research` → walk `.ai/research/`, slug `__research__`, `kind: 'research'`.
  - Wire matching `--dep-updates` / `--ideation` / `--research` CLI flags +
    defaults, mirroring the existing `--simplify`/`--profiles`/`--docs` pattern.

### 2. Path resolution (`renderers/_paths.mjs`)

- **`PHASE_BY_BASENAME` additions** (workflow kind): `01-discover`→discover,
  `hf-brief`/`hf-plan`/`hf-implement`/`hf-verify`, `rf-brief`/`rf-baseline`/`rf-plan`/`rf-implement`/`rf-verify`,
  `99-close`→close, `90-next`→next, `90-findings-explain`→findings, and a
  `90-how-*` regex (`/^90-how-[a-z0-9-]+$/`) for the how-in-workflow files.
- **New kind branches** for `deps`, `ideation`, `research` (mirroring the
  existing `simplify`/`profile`/`docs` branches): map `<root-rel>.md` →
  `<root>/<stem>/INDEX.html`.

### 3. Bespoke renderers (`renderers/<type>.mjs`)

Most are **thin `renderSimple` wrappers with a `metricFields` row** (the
`announce`/`estimate`/`risk-register` pattern) — the frontmatter already carries
the right counts. A handful warrant a richer body. Grouped by family:

- **Hotfix family** (`hf-brief`, `hf-plan`, `hf-implement`, `hf-verify`): thin
  metric wrappers (symptom/impact, step-count/rollback, files-changed/commit,
  result). Optional: a shared "incident header" partial.
- **Refactor family** (`rf-brief`, `rf-baseline`, `rf-plan`, `rf-implement`,
  `rf-verify`): thin metric wrappers; `rf-baseline`/`rf-verify` get a small
  before/after test-count table (baseline-pass vs post-pass, regressions).
- **Quick-lane singles** (`discover`, `fix-plan`, `investigate`): metric wrappers;
  `investigate` renders its A/B/C option list (option-ids, tradeoffs);
  `discover` shows the verdict chip (holds/partial/fails/inconclusive).
- **Meta** (`close-record`, `routing`): thin wrappers; `close-record` shows the
  close-reason + stages-completed/incomplete; `routing` shows next-command +
  remaining-slices (mark `regenerable`-style "point-in-time" note).
- **wf-docs intermediates** (`docs-discover`, `docs-audit`, `docs-plan`,
  `docs-generate`): metric wrappers driven by their count fields
  (doc-files-found; accuracy/quadrant/gaps; p0–p4/total; created/updated/deleted).
- **Dep-update family** (`dep-scan`, `dep-research`, `dep-plan`, `dep-implement`,
  `dep-verify`): metric wrappers; `dep-plan` renders the P0/P1/P2/Hold tier table.
- **Ideation** (`ideation`): renders the ranked idea list (id/title/category/
  impact/effort/score) + a culled-with-reasons section.
- **How family** (`how-quick`, `how-codebase`, `how-research`, `how-workflow`,
  `how-findings`): a shared `_how.mjs` base — question header + mode chip (A–E) +
  source-count (Mode C) + the prose body. These carry **no** `schema: sdlc/v1`,
  so the renderer must read from `frontmatter` defensively (fields may be absent).

Reuse: extract a `laneSummary({title, metricFields})` helper if the thin wrappers
converge, to keep 20+ files from drifting.

### 4. Schema (`tests/frontmatter.schema.json`)

- **Add branches** for `ideation` and the five `dep-*` types (so they validate
  and the post-write-verify hook can cover their roots if desired). Use the same
  minimal-required-field style as the existing `docs-*` branches
  (`schema`, `type`, `run-id`/`focus`, `status`, `created-at`).
- **`how-*` stays schema-exempt** — the skill deliberately omits `schema: sdlc/v1`
  (how.md is explicit). The renderer handles them; the verify hook continues to
  skip `.ai/research/` and how-files. Document this exemption rather than forcing
  a schema on research notes.

---

## Phases

### Phase 1 — Make everything reachable (discovery + paths)

Land discovery roots + `resolveViewPath` entries for all 30 types. After this,
every artifact renders — via `fallbackRender` for now — so nothing is invisible.

- `discoverArtifacts` + `discoverDocsArtifacts` changes; 3 new roots + CLI flags.
- `resolveViewPath` `PHASE_BY_BASENAME`/regex/kind additions.
- Unit tests in `tests/sunflower.test.mjs` (path resolution) +
  `tests/unit/gap-closure/walker-phase3.test.mjs` (discovery of new roots).
- **Exit:** a fixture tree containing one of every type renders with zero
  dropped artifacts (every type produces an HTML page).

### Phase 2 — Schema branches

- Add `ideation` + five `dep-*` branches; document the `how-*` exemption.
- `foundation.test.mjs` rows per new branch (valid passes; missing key fails).

### Phase 3 — Bespoke renderers

- ~28 renderers (30 types minus the 2 already-generic that just need a renderer
  module). Build family-by-family with shared helpers; snapshot each.
- Register any new `renderers/<type>.mjs` — dispatch is automatic via
  `loadRenderer(type)`, so no central table edit beyond `STAGE_NAV` if a type
  should appear on the slug overview grid (most off-pipeline ones should not).

### Phase 4 — Test coverage

- Add the new types to `tests/unit/snapshots/_fixtures.mjs` (full + fallback;
  fragment variants only where the skill authors a fragment).
- **Shrink `tests/e2e/acceptance.mjs` `NOT_RENDERED`** — once renderers + paths
  exist, the four `docs-*` and the wf-quick/wf-meta lanes move out of the
  exclusion set and become positively asserted. `how-*`/`ideation`/`dep-*` get
  added to the e2e corpus via their roots. Goal: `NOT_RENDERED` shrinks to (ideally)
  empty, and the e2e plants one fixture per type across all roots.

### Phase 5 — Docs

- Update [types.html](docs/site/reference/types.html): the `docs-*` rows lose
  their "fallback" note and gain renderers; add new sections for the dep-update,
  ideation, and how families. Cross-check the table against the schema + renderer
  set (the e2e already guards drift for schema-admitted types).
- Note the three new discovery roots in the serve/architecture docs if relevant.

---

## Cross-cutting

- **Hooks / validation.** Group C roots (`.ai/dep-updates/`, `.ai/ideation/`,
  `.ai/research/`) are not currently validated by `post-write-verify`. Adding
  schema branches for `ideation`/`dep-*` lets us *optionally* extend the verify
  hook to those roots — but the `how-*` family must remain exempt. Recommendation:
  validate `ideation`/`dep-*`, keep `.ai/research/` exempt.
- **Render performance.** `post-write-render` debounces, so projecting
  rapidly-written run families (docs-*, dep-*) adds re-render work but not
  blocking. The full `render-sunflower` pass gains three roots — bounded by the
  existing `maxWatchedRepos`/concurrency controls.
- **`.gitignore`.** `.ai/_view/` is already ignored; the new source roots
  (`.ai/dep-updates/`, `.ai/ideation/`, `.ai/research/`) are author-owned and
  may or may not be committed per project — no plugin change needed.
- **Version.** A feature of this size is a minor bump (e.g., v9.40.0).

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 28 thin renderers drift in style | Medium | Extract `laneSummary`/`_how.mjs` shared helpers; snapshot every one |
| `how-*` lack `schema` → renderer NPEs on missing fields | Medium | Defensive field reads; a fallback title; snapshot the no-field case |
| New discovery roots slow full renders | Low | Roots are small; debounce + concurrency already bound it |
| Filename assumptions wrong for a lane | Medium | Phase 1 path tests assert each documented filename resolves before renderers are written |
| `dep-plan.md`/`docs-plan.md` share a basename across roots | Low | `resolveViewPath` keys off `kind`, not basename; per-root view dirs prevent collision |

## Open questions

1. **Do `routing` (`90-next.md`) and `sync-report` warrant standing pages?**
   Both are point-in-time/regenerable snapshots. Included here (cheap thin
   renderers) but flagged as low-value — could be rendered as a transient badge
   on the slug overview instead of a full page.
2. **Should `how-*` get schema branches after all?** Keeping them schema-exempt
   preserves the "research note" convention; adding branches would let the verify
   hook cover `.ai/research/`. Defaulting to exempt.
3. **Should off-pipeline run families (dep-*, docs-*) collapse to a single
   run-index page** (like `08b-docs-index` summarizing a docs run) rather than one
   page per step? One page per step is more uniform; a run-index is less noisy.
   This plan does per-step; revisit if the per-step pages prove noisy.
4. **`ship` / `ship-legacy` reachability** — confirm whether any current filename
   resolves to these renderers; if not, either wire a path or retire the modules.

---

## Acceptance signal

After all phases:

```
npm test          # unit + snapshots (incl. all new renderers) green
npm run test:e2e  # every admitted type renders; NOT_RENDERED is empty (or only
                  # documented exemptions); 0 schema warnings; 0 dropped artifacts
```

A render of a tree containing one artifact of **every** type — across
`.ai/workflows/`, `.ai/docs/`, `.ai/simplify/`, `.ai/profiles/`,
`.ai/dep-updates/`, `.ai/ideation/`, `.ai/research/`, and project root — produces
a bespoke page for each, with `[render] no renderer for: (none)`.
