# Slug-Branch Identity + Repo-Scoped Registry + Branch-Aware Hub — Plan

**Status:** Drafted 2026-06-08 from a design conversation that walked the multi-repo hub's
branch model back to first principles. Three decisions were taken explicitly (see §3);
everything else follows from them.
**Predecessor:** [MULTI-REPO-REGISTRY-PLAN.md](MULTI-REPO-REGISTRY-PLAN.md) built the hub,
the `~/.sdlc/` registry, and the `/r/<id>/` routing. This plan corrects the *identity model*
that plan chose (`id = hash(repoRoot + HEAD-branch)`), which we found produces phantom
duplicate entries, aliased routes that serve last-render-wins content, and no awareness of
merged/deleted branches.
**Target version:** 9.48.0 → **9.49.0** (feature; minor bump). *(Originally drafted
against 9.47.0 → 9.48.0, but 9.48.0 shipped first — the sibling-fragment-enforcement
work, commit 229591b — so this feature retargets to 9.49.0.)*

---

## 1. Problem

The registry derives an entry's branch from the **checkout's current HEAD**
(`gitIdentity()` → `git rev-parse --abbrev-ref HEAD`, [registry.mjs:93](lib/registry.mjs#L93))
and folds it into the entry id (`computeEntryId(repoRoot, branch)`,
[registry.mjs:127](lib/registry.mjs#L127)). Three defects fall out of that one choice:

1. **Phantom duplicates.** Rendering on `main`, switching to `feat/x` in place, and
   re-rendering produces *two* entries (ids differ by branch) that both point at the same
   physical `viewDir` (`<repoRoot>/.ai/_view`, branch-blind by construction). The landing page
   shows the same workflow twice.
2. **Aliased routes.** `/r/<id_main>/` and `/r/<id_featx>/` both dereference the one `.ai/_view`
   folder, so they serve **byte-identical** last-render-wins content. A bookmark to "main's
   view" silently renders feat/x. Per-branch identity is a promise the filesystem can't keep.
3. **No merge/delete awareness.** `pruneRegistry()` ([registry.mjs:366](lib/registry.mjs#L366))
   is purely existence-based (`repoRoot`, `viewDir`, `.last-render` present) — it never asks git
   whether a branch still exists or was merged. A deleted in-place branch leaves a permanent
   ghost; a merged one keeps advertising as "active."

**Root cause.** Branch is being treated as a property of the *checkout* (one volatile HEAD for
the whole working dir) when it is actually a property of the *slug*. Every workflow's
`00-index.md` frontmatter already declares its own branch — and the schema makes it
**required** ([frontmatter.schema.json:78](tests/frontmatter.schema.json#L78)):

```jsonc
"branch-strategy": { "enum": ["dedicated", "shared", "none"] },
"branch":          { "type": "string" },   // the branch this slug lives on
"base-branch":     { "type": "string" },   // what it merges into
"pr-url":  { "type": "string" },
"pr-number": { "type": ["integer", "null"] }
```

The scanner already loads this block (`frontmatter: loaded.data`,
[workflow-index.mjs:118](lib/workflow-index.mjs#L118)) — it just never surfaces it. The
authoritative, stable, schema-validated branch is sitting unused while we key identity off the
volatile one.

---

## 2. Direction

Make **branch a per-slug fact read from frontmatter**, and make **entry identity repo-scoped**
so HEAD-switching can never fork it. The branch dimension moves *inside* the entry (per slug),
where it is stable and accurate, instead of *being* the entry key.

This dissolves all three defects at once:
- Duplicates → gone (one entry per checkout/worktree; HEAD can't fork it).
- "Do views differ across branches?" → answerable from authored metadata, not disk accident.
- Merge/delete → each slug now carries `branch` + `base-branch` + `pr-number`, a far richer
  liveness predicate than file existence.

---

## 3. Decisions (taken 2026-06-08)

| # | Decision | Choice | Implication |
|---|---|---|---|
| D1 | **Entry identity** | **Repo-scoped id (structural)** | `id = hash(repoRoot)` only. One entry per checkout/worktree. Changes `/r/<id>/` route URLs; needs a registry migration + a branch-insensitive collision rule. |
| D2 | **Branch liveness** | **Soft badge, keep the card** | Per-slug git+PR check using `branch`/`base-branch`/`pr-number`; show `merged` / `branch gone` badges; **never** auto-delete. |
| D3 | **Dashboard grouping** | **Repo → branch → slugs** | Keep repo grouping; add a sub-lane per declared branch, driven by `branch-strategy` (dedicated = own lane, shared = clustered, none = under base/trunk). |

---

## 4. Design

### 4.1 Branch as per-slug metadata (the foundation)

Surface the already-parsed fields and carry them into `slugMeta` so the hub still renders fully
in-memory (no per-request disk reads — a MULTI-REPO §5 invariant).

- **[workflow-index.mjs](lib/workflow-index.mjs) `loadWorkflowIndex`** ([:112](lib/workflow-index.mjs#L112))
  — add to the returned object:
  ```js
  branch:         loaded.data?.branch ?? null,
  branchStrategy: loaded.data?.['branch-strategy'] ?? null,
  baseBranch:     loaded.data?.['base-branch'] ?? null,
  prNumber:       loaded.data?.['pr-number'] ?? null,
  prUrl:          loaded.data?.['pr-url'] ?? null,
  ```
- **[registry.mjs](lib/registry.mjs) `collectSlugMeta`** ([:200](lib/registry.mjs#L200)) — add
  `branch`, `branchStrategy`, `baseBranch`, `prNumber`, `prUrl` to each slugMeta row. Tolerate
  missing values (legacy/hand-edited indexes) — default `null`, never throw.

This slice is **behavior-neutral**: nothing reads the new fields yet. It just makes the data
flow, and is independently testable.

### 4.2 Repo-scoped identity (D1)

- **`computeEntryId`** ([registry.mjs:127](lib/registry.mjs#L127)) → hash `repoRoot` **only**
  (still forward-slash-normalised for cross-platform stability). Drop `branch` from the digest.
- **`resolveEntryId`** ([registry.mjs:137](lib/registry.mjs#L137)) → the clash check currently
  splits on `e.branch !== branch`; make it **branch-insensitive** (only a genuinely different
  `repoRoot` colliding on the same 12-hex base appends a suffix). Otherwise switching branches
  would re-split the entry we just collapsed.
- **`gitIdentity` / `buildEntry`** ([registry.mjs:85](lib/registry.mjs#L85),
  [:222](lib/registry.mjs#L222)) — keep reading HEAD, but store it as informational
  `headBranch` (e.g. *"checkout currently on `main`"*), **not** as identity. `worktreeLabel`
  stays as-is (worktrees already have distinct `repoRoot`s, so repo-scoping keeps them separate
  for free).
- **Registry migration** — bump `REGISTRY_VERSION` 1 → 2 and add a branch in
  `migrateRegistry` ([registry.mjs:255](lib/registry.mjs#L255)) that **re-keys** v1 entries:
  recompute each id from `repoRoot` alone, then **merge** entries that now collapse to the same
  id (union their `slugMeta` by slug, latest `updatedAt` wins; earliest `registeredAt` wins).
  This is a pure data transform run on read — no separate migration command.
- **Security unchanged.** Routing still keys on `viewDir`; `validateEntry`
  ([registry.mjs:154](lib/registry.mjs#L154)) is untouched (viewDir still resolves under
  repoRoot, ending in `.ai/_view`). The id change cannot widen path containment.

> **Accepted breakage:** existing `/r/<id>/` bookmarks change once (ids drop the branch).
> MULTI-REPO §3.3 already flagged route instability on branch switch as a known tradeoff; this
> makes ids *more* stable going forward (they no longer move when you switch HEAD).

### 4.3 Branch liveness — soft badges (D2)

A new `lib/branch-liveness.mjs`, computing a per-slug `branchState` from the slug's own
metadata, in the repo it belongs to:

- `live` — `git -C <repoRoot> show-ref --verify --quiet refs/heads/<branch>` exits 0.
- `merged` — branch tip is an ancestor of base: `git merge-base --is-ancestor <branch> <base-branch>`
  (exit 0); **or** `prNumber` resolves to a merged PR (best-effort `gh pr view`, skipped if `gh`
  absent or offline).
- `gone` — branch ref not found locally (deleted, possibly post-merge).
- `unknown` — git unavailable / errored. Fail open; render no badge.

**Where it runs:** computed at **upsert** (render time — `buildEntry` already has `repoRoot` and
runs git) and stamped onto each `slugMeta` row as `branchState`. The hub stays git-free per
request. Opportunistically refreshed inside the hub's `reload()`
([hub-serve.mjs:142](scripts/hub-serve.mjs#L142)), which already runs at startup and on
`/__sdlc/registry/refresh` — so a branch deleted *after* the last render still flips to `gone`
on the next hub refresh without requiring a re-render.

**What it does:** the dashboard renders a `merged` / `branch gone` badge. It **never** removes
the slug or entry — the user closes the workflow (`/wf` close → terminal status, which
`isActiveSlug` already filters) or prunes deliberately. Reuses the existing
`callout-{warn|info}` / badge tone vocabulary.

> All liveness work is **best-effort and never throws** — same contract as the registry write
> ([registry.mjs:466](lib/registry.mjs#L466)). A liveness failure must never affect a render or
> a served page.

### 4.4 Dashboard grouping — repo → branch → slugs (D3)

- **[hub-dashboard.mjs](renderers/hub-dashboard.mjs) `renderHubLanding`** ([:117](renderers/hub-dashboard.mjs#L117))
  — with one entry per repo (post-D1), group that entry's `slugMeta` by `branch` into sub-lanes
  inside the repo card. `branchStrategy` drives lane presentation:
  - `dedicated` → its own labelled swimlane.
  - `shared` → slugs sharing a branch cluster under one lane header.
  - `none` → render under `base-branch` / trunk.
- Reuse `swimlanesSvg` ([dashboard.mjs](renderers/dashboard.mjs), imported at
  [hub-dashboard.mjs:15](renderers/hub-dashboard.mjs#L15)) per branch-lane rather than per entry.
- **Inbox** (`inboxItems`, [hub-dashboard.mjs:69](renderers/hub-dashboard.mjs#L69)) gains
  `branchState` as a fourth attention reason (`merged`/`branch gone` alongside
  blocked/review/stale), and the row's `{repo}/{slug}` line shows the declared branch.
- The repo header still shows `headBranch` as informational context (*"on `main`"*) so you can
  see the checkout's actual position vs. where each slug's work lives.

---

## 5. Key assumption — `.ai/workflows` visibility across branches

The full value of per-slug branch labels depends on **how many slugs are visible from one
checkout**:

- **`.ai/workflows` gitignored / shared** (untracked, persists across `git checkout`) → all
  slugs from every branch coexist in the tree, each labelled with its declared branch. This is
  where the design shines: one render, the whole branch topology.
- **`.ai/workflows` committed per branch** → you only see the *current* branch's slugs, and the
  declared branch is mostly redundant with HEAD. The design **degrades gracefully** (correct
  labels, just fewer slugs visible at once) but delivers less.

**Phase 0 validation (do first):** spot-check 2–3 real repos (e.g. the live `bot-backend` from
prior audits) for whether `.ai/workflows` is tracked or ignored, and confirm `00-index.md`
files populate `branch`/`branch-strategy` with meaningful values (not empty strings). If
workflows are universally committed-per-branch, reconsider whether D3's branch sub-lanes earn
their complexity, or whether a `git check-ignore`-driven detection should gate the grouping.
*(No new config flag — inference over flags, per house convention.)*

#### Phase 0 findings (recorded 2026-06-08)

Surveyed 8 local repos with `.ai/workflows`. Result: **the split is roughly even**, so D3's
branch sub-lanes earn their complexity (they are NOT universally redundant-with-HEAD).

| Repo | `.ai/workflows` | Slug dirs |
|---|---|---|
| bot-backend | **gitignored** (shared across branches) | 2 |
| Crumb | **gitignored** | 9 |
| Trails | **gitignored** | 3 |
| Aperture | committed per-branch | 9 |
| PushKit | committed per-branch | 1 |
| Playster | committed per-branch | 2 |

**Frontmatter is well-populated** and exercises every `branch-strategy` value in the wild —
`dedicated` (bot-backend `feat/osce-system-prompts`), `shared` (Crumb
`cloud-function-bookmark-sync` rides the same `feat/brutalist-redesign` branch as
`brutalist-redesign`), and `none` (Aperture). Two **edge cases the design must handle**, both
seen in live data:

1. **`branch-strategy: none` ⇒ `branch: ""` (empty string, not absent/null).** The real anchor
   lives in `base-branch` (`redesign` / `main`). D3 grouping MUST fall back to `base-branch`
   (then trunk) for an empty/blank `branch`, never render a literal empty lane. Slice 1's
   plumbing therefore normalises `""` → `null`.
2. **No PR ⇒ `pr-number: 0` and `pr-url: ""` (not null).** Slice 4's PR-liveness must treat a
   falsy/`<= 0` `prNumber` as "no PR" — guarding on `!= null` alone is insufficient.

Also observed: a **stacked branch** (Crumb `fix-button-border-regression` bases off
`feat/brutalist-redesign`, not trunk), so the non-trunk `base-branch` path in D3's `none`/lane
fallback is real, not hypothetical. **Conclusion: build D3 as designed; no `git check-ignore`
gate needed** — the design already degrades gracefully on the committed-per-branch repos.

---

## 6. Invariants preserved

1. **Security** — `/r/<id>/` still routes through `resolveRequestPath(entry.viewDir, …)`;
   `validateEntry` unchanged; no widening of path containment.
2. **In-memory hub render** — all new fields ride in `slugMeta`; zero per-request disk or git.
3. **Best-effort, never-throw** — registry writes and liveness checks must never affect render
   success or a served response.
4. **Convention over flags** — branch is inferred from authored frontmatter; no new per-repo
   config key. (`view.hub.enabled` remains the only per-repo flag.)
5. **No per-request daemons** — single machine-wide hub model untouched.

---

## 7. Phasing (independent, shippable slices)

| Slice | Scope | Risk | Gate |
|---|---|---|---|
| **0** | Validate §5 assumption on real repos | none (read-only) | ✅ findings recorded in §5 — build D3 as designed |
| **1** | §4.1 — plumb branch/strategy/base/pr into `loadWorkflowIndex` + `slugMeta` | low (additive, behavior-neutral) | unit test: two slugs, different declared branches, one checkout → distinct slugMeta |
| **2** | §4.2 — repo-scoped id + `REGISTRY_VERSION` 2 migration + collision rule | **med** (route URLs change) | unit test: in-place branch switch yields **one** entry; v1→v2 migration merges + unions slugs; worktrees stay distinct |
| **3** | §4.4 — repo → branch → slugs grouping + inbox branch line | low–med (UI + snapshots) | snapshot test: repo card with ≥2 branch lanes; `branch-strategy` lane behavior |
| **4** | §4.3 — `lib/branch-liveness.mjs` + `branchState` + badges | med (git interaction) | unit test: live/merged/gone/unknown classification; never-throws on no-git; inbox surfaces `merged`/`gone` |

Slices 1→2→3 are the spine; 4 is independent and can land before or after 3. Each slice is a
separate PR with its own `/wf` slug.

---

## 8. Files touched

| File | Change |
|---|---|
| [lib/workflow-index.mjs](lib/workflow-index.mjs) | surface `branch`/`branchStrategy`/`baseBranch`/`prNumber`/`prUrl` (S1) |
| [lib/registry.mjs](lib/registry.mjs) | `collectSlugMeta` fields (S1); `computeEntryId`/`resolveEntryId`/`buildEntry`/`migrateRegistry` repo-scoping + v2 (S2); `branchState` at upsert (S4) |
| `lib/branch-liveness.mjs` | **new** — git+PR liveness classifier (S4) |
| [renderers/hub-dashboard.mjs](renderers/hub-dashboard.mjs) | branch sub-lanes, inbox branch reason + line, badges (S3/S4) |
| [scripts/hub-serve.mjs](scripts/hub-serve.mjs) | `reload()` opportunistic liveness refresh (S4) |
| [tests/unit/lib/multi-repo-hub.test.mjs](tests/unit/lib/multi-repo-hub.test.mjs) | new cases per slice; reuse `SDLC_HOME` + `initRepo` harness |

No frontmatter-schema change (the fields already exist). No new sdlc-config / hub-config key.

---

## 9. Build & release checklist

- [ ] **`npm run build`** after editing `lib/`, `renderers/`, `scripts/` — tests run *source*,
      so a green suite does **not** mean `dist/` is fresh; stale `dist/` fails the CI freshness
      gate and ships old code. (See memory: SDLC dist build step.)
- [ ] **Version bump 9.48.0 → 9.49.0 in all 4 in-sync spots** —
      `plugins/sdlc-workflow/.claude-plugin/plugin.json`, `plugins/sdlc-workflow/package.json`,
      the `.claude-plugin/marketplace.json` plugins[] entry (the easily-forgotten one), and the
      `.claude-plugin/marketplace.json` top-level version (its own sequence: 1.74.0 → 1.75.0).
      (See memory: plugin version bump locations.)
- [ ] Run the unit suite (source); update snapshots for the dashboard grouping change.
- [ ] CHANGELOG entry per slice.

---

## 10. Open questions / risks

- **R1 — slug visibility (§5).** ✅ **Resolved in Slice 0.** Survey of 8 live repos found a
  ~50/50 split (3 gitignored-and-shared, 3 committed-per-branch), so D3's sub-lanes are not
  universally redundant. Build D3 as designed; it degrades gracefully on the committed repos.
- **R2 — PR liveness cost/availability.** ✅ **Resolved as shipped.** `gh pr view` is
  implemented in `lib/branch-liveness.mjs` (`checkPr`) but **disabled on both automated paths**
  — the hot artifact-write render upsert (`collectSlugMeta` passes `checkPr:false`) and the hub
  `reload()` refresh (`refreshEntriesLiveness` defaults `checkPr:false`) — so neither makes a
  network call. Local git already yields `gone` (deleted ref) and `merged` (base-ancestry); the
  `gh` path remains available for a future explicit/cached refresh (the TTL cache idea stands if
  squash-merge detection is wanted on a non-hot path).
- **R3 — route-URL break (D1).** One-time; acceptable per MULTI-REPO §3.3. If undesirable, a v1→v2
  redirect table could be synthesised during migration, but is out of scope unless requested.
- **R4 — `headBranch` vs declared branch confusion.** Make the UI distinction explicit ("checkout
  on X" vs. per-slug branch labels) so the two aren't conflated.
