# Sunflower View — Fragment-Coverage Fix Plan (Gaps A–E)

> **Gitignored working doc.** Remediates the misalignment in the `.html.fragment`
> pipeline surfaced by the 2026-06-05 fragment-layer review. Companion to
> `SUNFLOWER-PAGE-REVIEW-CHECKLIST.md` (page×hand-off audit) and
> `SUNFLOWER-HANDOFF-DEVIATIONS.md` (line-cited deviations). Not shipped.

> **Reconciliation (2026-06-04, post v9.39.0 quality-gates + v9.40.0 all-artifacts
> projection).** Every anchor below is current against the working tree
> (`_fixtures.mjs:696`, `ideation.mjs:46`, `post-write-verify.mjs:38`,
> `critique.md:117` / `audit.md:118` all verified). How the just-landed work
> relates to the five gaps:
>
> - **Layer ① is now MANDATORY (not conditional) for `benchmark` / `experiment` /
>   `instrument` / `profile` / `simplify-run`** — v9.39.0 changed their skill
>   fragment step from "If you also write…" to required-whenever-the-sibling-YAML-
>   is-written. This *raises* **Gap B**'s priority: the contract is now enforced in
>   the skills, but the `post-write-verify` reminder (🔔, `RICH_TIER_TYPES`) still
>   nudges only the original 5, so an agent that skips a now-required fragment gets
>   no runtime signal. Slice 1.1 closes that.
> - **Gap C — CLOSED 2026-06-04 (Slice 1.2 done).** The v9.39.0 mandatory-fragment
>   sweep had matched the literal `"If you also write"` and so MISSED `critique.md` /
>   `audit.md` (which used `"When also writing a renderer fragment"`). Both now carry
>   a mandatory sibling-YAML + `.html.fragment` step with a body-only content spec;
>   no fragment-owning skill remains conditional.
> - **Gap D 4.3 (`ideation`) is a real dead branch introduced by v9.40.0.**
>   `ideation.mjs:46` splices `artifact.fragment`, but no skill authors an ideation
>   fragment and `ideation` is not on the verifier whitelist — exactly the
>   contract-dishonesty Phase 4 removes.
>
> The five gaps otherwise stand as written; nothing here is executed yet.

## Problem — the four fragment layers don't line up

A fragment only works end-to-end when four layers + one safety net all cover the
type. Today they don't:

| Layer | Mechanism (anchor) | Types covered | Count |
|-------|--------------------|---------------|-------|
| ① Generate | skill step authoring `<stem>.html.fragment` | review, plan, ship-run, design, rca, benchmark, experiment, instrument, profile, simplify-run | 10 |
| ② Validate | `scripts/verify-fragment.mjs:33` `ALLOWED_FRAGMENT_NAMES` | the 10 above **+ review-dimension, design-critique, design-audit, docs-index** | 14 |
| ③ Consume | renderer splices `artifact.fragment` (universal via `renderers/_simple.mjs:63`) | ~16 explicit + all renderSimple pages | ~universal |
| ④ Design-ref | `sdlc-handoff/.../sdlc-fragments-gallery.html` `data-artifact` | review, plan, rca, design, ship-run | 5 |
| 🔔 Remind | `hooks/post-write-verify.mjs:38` `RICH_TIER_TYPES` | review, plan, design, ship-run, rca | 5 |

Consumption (③) is effectively universal, so the engine is never the blocker.
The gaps are all where ①②④🔔 fail to align.

**Test ground truth:** `tests/unit/snapshots/_fixtures.mjs:696`
`FRAGMENT_RENDERERS = { benchmark, experiment, instrument, rca, review-dimension,
design-critique, design-audit, profile }` — the determinism property test
(`fragment-determinism.test.mjs`) already iterates these, so any renderer change
to them must stay byte-identical across repeat calls. The reminder hook is tested
in `tests/unit/hooks/hooks.test.mjs`.

### The five gaps

- **A — gallery design lags generation.** benchmark, experiment, instrument,
  profile, simplify-run have ① + ② but no ④ exemplar. Agents author them with the
  prose contract only (no interactive visual reference). Biggest surface.
- **B — reminder lags generation.** 🔔 covers only the original 5; the 5 newer
  fragment types silently fall back to prose with no nudge (the exact S-1 failure,
  reintroduced).
- **C — design-critique / design-audit half-wired.** ② + ③ + schema + renderer
  `!artifact.fragment` suppression all present, skill loads the contract and writes
  the YAML, but there is **no explicit "write the `.html.fragment`" step**.
- **D — dead consumption.** `docs-index` (whitelisted), `ideation`,
  `design-contract` (both **not** whitelisted) have a `artifact.fragment` render
  branch but **no generator** feeds it.
- **E — review-dimension never generated.** ②③ + test fixture + renderer
  suppression all ready, but `review.md` authors only the sweep-level fragment, so
  per-dimension pages fall to `renderSimple` (checklist REV-02).

---

## Phase 0 — Decisions to confirm before D/E  ✅ RESOLVED (jayte, this pass)

All three resolved to the proposed defaults: **(1)** D-ideation → remove now;
**(2)** D-docs-index / D-design-contract → remove both dead branches + drop
`docs-index` from the verifier whitelist; **(3)** E-review-dimension → wire it.

These three need a yes/no; defaults proposed. A–C need no decision.

1. **D-ideation** — give `/wf-quick ideate` a real interactive fragment
   (votable/rankable idea cards) **[wire, future]**, or remove the dead branch
   **[remove now]**? *Default: remove now; re-add when designed.*
2. **D-docs-index / D-design-contract** — these are index/contract pages with no
   plausible near-term interactive layer. *Default: remove the dead branches +
   drop `docs-index` from the verifier whitelist.*
3. **E-review-dimension** — do per-dimension review pages warrant their own rich
   fragment, or is the sweep-level fragment + prose per dimension sufficient?
   *Default: wire it (infra is 100% ready; only the gen-step is missing).*

---

## Phase 1 — Stop active degradation (Gaps B + C). No decisions, no test risk to renderers.

### Slice 1.1 — Gap B: extend the rich-tier reminder  ✅ DONE (v9.41, this pass)

> **Correction to the snippet below.** The literal set as written would silently
> miss benchmark/experiment/instrument: those ride `type: augmentation` with an
> `augmentation-type:` discriminator (`benchmark.md:118`, `experiment.md:102`,
> `instrument.md:112`), so matching on the top-level `type:` catches only profile
> and simplify-run. The shipped fix resolves the discriminator in
> `fragmentOwningType()` (renamed from `frontmatterType`): `type: augmentation`
> → its `augmentation-type` (which lands `benchmark`/`experiment`/`instrument`/
> augmentation-`rca` in the set). 4 new `hooks.test.mjs` cases cover all three
> roots (`.ai/workflows` augmentation, `.ai/profiles`, `.ai/simplify`); full
> suite 225/225. The `.ai/profiles` / `.ai/simplify` roots were already accepted
> by `isManagedArtifactMarkdownPath`, so no path-plumbing change was needed.

- **File:** `hooks/post-write-verify.mjs:38`
- **Change:** widen the set and rename the comment to reflect that it now spans
  every type that owns a fragment contract (not just the original rich tier):
  ```js
  const RICH_TIER_TYPES = new Set([
    'review', 'plan', 'design', 'ship-run', 'rca',
    // v9.41 — fragment-owning types added after S-1; previously un-nudged
    'benchmark', 'experiment', 'instrument', 'profile', 'simplify-run',
  ]);
  ```
- **Caveat to handle:** the reminder checks for a sibling `<stem>.yaml` +
  `<stem>.html.fragment`. `profile` (`.ai/profiles/<run>/01-profile.md`) and
  `simplify-run` (`.ai/simplify/<run>.md`) live **off** `.ai/workflows`. Confirm
  `collectToolInputPaths` + `isManagedArtifactMarkdownPath` accept those roots; if
  not, the reminder silently never fires for them. Add a unit case per root.
- **Also:** `profile.md` states "no hotspots → do not write the sibling YAML"
  (legitimate skip). The reminder must not cry wolf there. It can't read intent,
  so keep it non-blocking (it already is) and word the message as "if this
  artifact has structured data, author its siblings."
- **Test:** `tests/unit/hooks/hooks.test.mjs` — add cases asserting a nudge fires
  for a `type: benchmark` md missing its siblings, and does **not** fire once both
  siblings exist. Mirror the existing review/plan cases.
- **Acceptance:** writing any of the 5 newer types without siblings emits the
  systemMessage; `npm test` green.

### Slice 1.2 — Gap C: make the critique/audit fragment step explicit  ✅ DONE (2026-06-04)

- **Files:** `skills/wf-design/reference/critique.md` (~line 117),
  `skills/wf-design/reference/audit.md` (~line 118).
- **Change:** the current "When also writing a renderer fragment…" bullet is
  conditional and stops at the YAML. Promote it to a mandatory two-step block
  matching the gold pattern (cf. `benchmark.md:293-303`):
  1. Write the sibling `07-design-critique.yaml` / `07-design-audit.yaml` per the
     `siblingYamlSchemas.design-critique` / `…design-audit` shape (already shown).
  2. **Write the sibling `07-design-critique.html.fragment` /
     `07-design-audit.html.fragment`** — load
     `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/_fragment-authoring.md` first;
     body-only (`design-critique.mjs`/`design-audit.mjs` already own heading +
     metric-row and suppress their static findings list when a fragment is
     present, see `design-critique.mjs:41,48`); deterministic from the YAML; pass
     `verify-fragment.mjs` Check 7.
- **Fragment content spec** (interactive layer the static renderer can't draw):
  severity-filter pills over the findings list, expandable finding rows
  (observation → recommendation), dimension grouping toggle.
- **Test:** none required (doc-only). Optional: confirm `design-critique` /
  `design-audit` remain in `FRAGMENT_RENDERERS` (they are) so a future authored
  fragment is determinism-checked.
- **Acceptance:** both skills carry a numbered MANDATORY yaml+fragment step; a
  `grep -c '\.html\.fragment' critique.md audit.md` returns ≥1 each.

---

## Phase 2 — Gap A: author the 5 missing gallery exemplars  ✅ DONE (this pass)

> Authored all 5 (`fragment-benchmark/experiment/instrument/profile/simplify-run`)
> in `sdlc-fragments-gallery.html`: nav links + "Five → Ten" lede + 5 API-summary
> rows + checklist source-map update. Verified — 10 fragment sections / 10
> `sdlc:fragment-ready` dispatches / balanced tags / no global-selector leaks /
> all 5 IIFEs parse. Gitignored bundle; no plugin-code or test impact.

This is the largest piece and is **design-bundle only** (gitignored handoff) — no
plugin code, no test impact. It gives ① a visual contract so authored fragments
stay consistent instead of diverging per run.

### Approach

Extend `sdlc-handoff/sdlc/project/sdlc-fragments-gallery.html` with five new
`<section class="fragment-<name>" data-artifact="<name>">` blocks alongside the
existing review/plan/rca/design/ship-run, each mirroring the canonical structure
(scoped `<style>`, inline `<script>`, `window.dispatchEvent('sdlc:fragment-ready',
{ name, counts })`, body-only, inline SVG). Each must be **deterministic from the
existing sibling-YAML schema** (fields already defined — no schema change):

| Fragment | Schema fields (`siblingYamlSchemas.*`) | Interactive layer to design |
|----------|----------------------------------------|-----------------------------|
| benchmark | metrics, regressions, improvements, baseline_commit | grouped before/after bars w/ hover deltas; metric table w/ verdict-filter pills; threshold rule toggle |
| experiment | arms, guardrails, split, status | 100%-stacked arm-allocation bar w/ hover %; guardrail rows w/ breach highlight; decision band |
| instrument | signals, dark_paths, pii_warnings | signal table w/ type-filter + field expanders; coverage bar; dark-path callouts; PII flags |
| profile | hotspots, optimization_candidates, comparisons | self-% ranked flame-rows (sortable); before/after toggle when `comparisons` present |
| simplify-run | findings, counts, deltas, scope | findings list w/ category-chip filters; reuse/quality/efficiency tabs; before/after delta bars |

> `handoff-benchmark/experiment/instrument/profile.html` already show the **static
> page** (figure + table). Gap A is the **interactive** layer on top — design it
> in the gallery (the single source for "what a fragment looks like"), then the
> static handoff pages and the gallery together fully specify each renderer.

### Slices (one per fragment, independently authorable)

- 2.1 benchmark (use as the exemplar — most schema fields, has a static mockup)
- 2.2 experiment
- 2.3 instrument
- 2.4 profile
- 2.5 simplify-run (no static handoff page yet — calm-reader template only; design
  its figure here too)

Each slice: add the gallery section, verify scoped selectors + balanced tags +
`sdlc:fragment-ready` dispatch, list it in the gallery's intro count ("Five rich
fragments" → "Ten"). No commit (gitignored).

### Acceptance

- All 5 sections render in the gallery; every class is gallery/kit-scoped; each
  dispatches `sdlc:fragment-ready`; markup is deterministic from the schema fields.
- Update `SUNFLOWER-PAGE-REVIEW-CHECKLIST.md` hand-off source map: the gallery now
  covers 10 fragments.

---

## Phase 3 — Gap E: wire review-dimension (decision-gated, default: wire)  ✅ DONE (decision: wire)

Infra is fully ready (② whitelist, ③ renderer `review-dimension.mjs:64-67`
suppression, test fixture). Only the generator is missing.

> Shipped: new **Step 5c** in `skills/wf/reference/review.md` directs the agent to
> author a per-dimension `<stem>.html.fragment` (+ sibling `.yaml` per
> `siblingYamlSchemas.review-dimension`) next to each `07-review-<command>.md` —
> `<section class="fragment-review-dimension" data-artifact="review-dimension">`,
> body-only, `.rd-*`-prefixed to avoid colliding with the sweep fragment's `.fr-*`.
> No test change needed: the `fragment` variant in `_fixtures.mjs` already exists
> and the determinism suite already exercised it (225/225).

- **File:** `skills/wf/reference/review.md` — Step 5b currently authors the
  **sweep-level** `fragment-review`. Add a sibling instruction (or a 5c) to author
  a per-dimension `<dim>.html.fragment` next to each per-dimension `.md`, with
  `siblingYamlSchemas.review-dimension` as the data shape.
- **Fragment content:** sortable findings list for the dimension, severity-filter
  pills, expandable finding → evidence rows.
- **Test:** `review-dimension` is in `FRAGMENT_RENDERERS`; add/confirm a
  determinism fixture variant carrying a fragment.
- **Acceptance:** a per-dimension review page with siblings renders the interactive
  list (not `renderSimple`); clears checklist REV-02.

---

## Phase 4 — Gap D: reconcile dead consumers (decision-gated, default: remove)  ✅ DONE (decision: remove all)

Make the contract honest — every render branch must have a generator, every
whitelist entry a producer.

> Shipped: removed the dead `artifact.fragment` branch from `docs-index.mjs`,
> `design-contract.mjs` (the `artifact.fragment ? '' : frontmatterCard` ternary
> collapsed to an unconditional `frontmatterCard` — always its value anyway), and
> `ideation.mjs`; dropped `'docs-index'` from `verify-fragment.mjs`
> `ALLOWED_FRAGMENT_NAMES`. None of the three had a `fragment` fixture variant, so
> **zero golden snapshots changed** (confirmed via git) — the branches were
> provably dead. Full suite 225/225.

- **4.1 docs-index** — if Phase-0 default holds: remove the `artifact.fragment`
  branch in `renderers/docs-index.mjs:35` and drop `'docs-index'` from
  `verify-fragment.mjs:38`. (If instead wired: add a gen-step to the wf-docs
  skill + a gallery exemplar.)
- **4.2 design-contract** — remove the dead branch in `design-contract.mjs:37`
  (02c-craft is a prose contract; `craft.md` authors the `design` fragment for
  02b-design, not a contract fragment). `design-contract` is not whitelisted, so
  no verifier change.
- **4.3 ideation** — per Phase-0 D-ideation: remove the branch in
  `ideation.mjs:46` **or** (future) add a votable-idea-card fragment + gen-step +
  whitelist entry + gallery exemplar. *Default: remove now.*
- **Test:** removing dead branches must not change snapshot goldens (these
  branches only fire when a fragment exists, which never happens today) — confirm
  `renderers.test.mjs` goldens unchanged; regenerate only if a touched renderer is
  golden-pinned.
- **Acceptance:** no renderer references `artifact.fragment` for a type without a
  generator; verifier whitelist == set of types with a gen-step (+ canonical 5).

---

## Sequencing & shippability

```
Phase 1 (B + C)  ── cheapest, stops active silent-degradation + half-wiring ── ship first
        │
Phase 2 (A)      ── largest, design-only, gitignored; makes what B nudges toward consistent ── parallel-safe
        │
Phase 0 decisions ─┬─ Phase 3 (E)  ── small, decision-gated
                   └─ Phase 4 (D)  ── small, decision-gated, do last (cleanup)
```

- **1 and 2 are independent** and can land in either order; 1 is one-line-ish and
  should not wait on 2.
- **3 and 4 are gated on Phase-0 answers.**
- Each slice is independently shippable; none cross the gitignored/committed line
  except where noted (Phase 1 + 3 + 4 touch committed plugin code/tests; Phase 2
  touches only the gitignored bundle).

## Global verification

Per committed-code phase (1, 3, 4):
1. `npm test` — `# fail 0` (esp. `hooks.test.mjs`, `fragment-determinism`,
   `renderers.test.mjs`).
2. `node scripts/verify-fragment.mjs --root <fixture-with-new-fragments>` clean.
3. Spot-render a fixture artifact for each touched type; confirm rich body (not
   prose) and a single (non-double) heading/metric-row.

## Out of scope

- The `sync-report` **data-contract** gap (no YAML, no fragment, no schema, not
  whitelisted) — tracked separately; it needs the full schema→renderer→skill
  triple from the prior turn's analysis, distinct from these fragment-layer fixes.
  `sync-report` is the one artifact that needs **both** stacks.
- `hub-dashboard` — registry-driven by design; no fragment, intentionally.
- Renderer layout-conformance to the calm-reader / index-grid mockups (checklist
  phases 1–2) — that is markdown/frontmatter layout work, not the fragment layer.

## Effort estimate

| Phase | Slices | Rough effort | Risk |
|-------|--------|--------------|------|
| 1 (B+C) | 2 | ~1–2 h | low (1 line + 2 doc blocks + tests) |
| 2 (A) | 5 | ~1 day | low (design-only, gitignored) |
| 3 (E) | 1 | ~1–2 h | low |
| 4 (D) | 3 | ~1 h | low (deletes) |
