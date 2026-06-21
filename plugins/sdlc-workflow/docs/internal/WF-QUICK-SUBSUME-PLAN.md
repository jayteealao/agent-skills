# Subsume `wf-quick` into `wf` — Implementation Plan

> Status: **SHIPPED (v9.83.0)** — `/wf-quick` was subsumed into `/wf intake <mode>` (+ `/wf probe`,
> `/wf simplify`). Mirrors the completed `wf-design`→`/wf design` subsume
> (`docs/internal/WF-DESIGN-SUBSUME-PLAN.md`).
> **⚠ Superseded per-mode artifact shapes:** the `hf-*` / `rf-*` / `.ai/dep-updates/` bespoke
> pipelines this plan's flow-span table describes were later replaced by compressed *standard*
> lifecycles in **v9.86.0** — see `docs/internal/COMPRESSED-LIFECYCLE-PLAN.md`. Read the per-mode
> artifact rows below as the *historical* (pre-v9.86) shape, not current behavior.

## Context

`/wf-quick` is a standalone router exposing 10 orthogonal sub-commands (`fix`, `rca`,
`probe`, `investigate`, `discover`, `hotfix`, `update-deps`, `refactor`, `ideate`,
`simplify`). Users must *know it exists* and *know which router* a flow lives under —
the same friction the `wf-design` subsume removed. Eight of the ten are **alternative
ways to enter the lifecycle** (different front doors for a piece of work); the other two
are not entry points at all — `probe` verifies *already-built* work (slug-only) and
`simplify` triages an *existing* diff/codebase.

**Goal:** retire the standalone `/wf-quick` router. Re-home its 8 entry-point commands as
**modes of `/wf intake`** (intake becomes a mode dispatcher, like `design.md`), and promote
`probe` and `simplify` to **their own top-level `/wf` keys**. Lose no functionality; keep
every artifact's `type:`/filename stable so the render pipeline needs no structural change.

**User decisions (this session):**
- **D1 — placement:** 8 entry-points → `/wf intake` modes; `probe` + `simplify` → own `/wf` keys.
- **D2 — auto-route:** *suggest-and-confirm* — default intake runs; a strong mode match is
  proposed via `AskUserQuestion` before routing (never silent).

## The model in one picture

```
ENTRY DISPATCHER (intake gains modes)        NEW TOP-LEVEL KEYS (own identity)
  /wf intake               → default          /wf probe    (runtime-truth, slug-only)
  /wf intake fix ...       → compressed build  /wf simplify (read-only triage)
  /wf intake rca ...       → diagnose-first
  /wf intake <slug> <mode> → compressed slice  ← slug-mode (attach to existing workflow)
       │
       ▼
  reference/intake/  (default + 8 modes + _intake-context)   ← intake-scoped library
  reference/_compressed-slice.md                              ← shared by intake/probe/simplify
```

- `/wf` key table grows **15 → 17** (`+probe`, `+simplify`). `intake` stays one key but
  becomes a **pure router**: it resolves a *mode* and loads that mode's reference; the
  reference owns all artifact writing (so a mode that writes no workflow — `ideate` — is fine).
- The 8 modes are *arguments* to `intake`, never their own keys (mirrors design's 22 ops).

## Hard constraints

1. **`/wf-quick` router is retired** — no surviving parallel quick router.
2. **8 modes are arguments to `/wf intake`**, resolved by the dispatcher; `probe`/`simplify`
   are the only two new keys.
3. **Stability principle (load-bearing):** every mode/key keeps its **existing artifact
   filenames and `frontmatter.type` values** (`01-fix`/`fix-plan`, `01-rca`/`rca`, `hf-*`,
   `rf-*`, `.ai/dep-updates/`, `.ai/ideation/`, `.ai/simplify/`, `simplify-run`, …). This is
   what makes renderers / `_paths.mjs` / hooks / hub / render-queue **need no structural
   change** — they dispatch on `type:`/basename/storage-dir, none of which move.
4. **Lose no functionality** — every wf-quick capability lands somewhere intact, including the
   slug-mode compressed-slice machinery (`probe` cannot run without it).
5. **Both trees** — apply every `skills/` edit to `plugins/sdlc-workflow` *and*
   `plugins/sdlc-workflow-codex` (with `$wf` prefix); `sync:codex` does NOT mirror `skills/`.

## Decision: do NOT add new numbered artifacts

The requester allowed "extra steps or `0[1-9][a-z]` numbered files if necessary." We
**decline that latitude on purpose** — keeping artifacts identical is precisely what honors
the "hooks/lib/hub/renderer stay correct" requirement (Constraint 3). New numbered files
would force `_paths.mjs` `PHASE_BY_BASENAME`, the schema `$defs`, and the per-type renderers
to change. None are needed: the subsume is a *routing* change, not an *artifact* change.

## The `/wf intake` dispatcher (`reference/intake.md`)

`reference/intake.md` becomes the **dispatcher brain** (analogous to `design.md`). Current
intake content moves verbatim to `reference/intake/default.md`. Step 0 resolution for
`/wf intake <tokens…>`:

1. **Slug-mode (checked FIRST).** Exact existence check: if `.ai/workflows/<token0>/00-index.md`
   exists → **slug-mode**. `token1` = mode keyword (or default), rest = args. Write a
   **compressed slice** per `reference/_compressed-slice.md`. **No collision prompt** — an
   exact `INDEX.md`/disk match is an *intentional* attach, not the accidental re-derivation
   that Step 0 collision detection guards. (A slug *derived from a free description* has never
   been written yet, so it can't false-match here.)
2. **Explicit mode.** Else if `token0` ∈ `{fix, rca, investigate, discover, hotfix, refactor,
   update-deps, ideate}` → load `reference/intake/<token0>.md`, rest = args. (This matches
   wf-quick today: `/wf-quick fix the typo` already routes to fix mode — the verb-named keys
   make this self-correct. Rare genuine collisions use the quote-escape, documented below.)
3. **Default + suggest-and-confirm.** Else tokens are a raw description → run the default
   intake (`reference/intake/default.md`), **but first** a lightweight intent classification
   (see below). On a strong match, propose the mode via `AskUserQuestion`; accept → load that
   mode ref; decline → continue default intake.

**Quote-escape** (carried from wf-quick): a quoted multi-word first token
(`/wf intake "rca dashboard refresh"`) never matches a slug or a bare keyword, so it routes to
default — the escape hatch for a description that legitimately starts with a slug/mode word.

**Auto-route classification (concrete trigger, resolves Plan-critique Risk 1).** Only fire a
suggestion when ALL hold: (a) no explicit keyword and no slug match; (b) the description
contains **no lifecycle vocabulary** (`shape`, `slice`, `plan`, `ship`, …); (c) it strongly
matches one pattern — past-tense failure/regression report → `rca`; "is it true / does X / why
does" → `discover`; "outage / prod down / urgent / hotfix" → `hotfix`; "how should I / what are
the options / approaches to" → `investigate`. Propose **at most one** mode, **once**; decline →
default. Never propose `fix`/`refactor`/`update-deps`/`ideate` from classification (those are
explicit-intent commands).

> **Superseded (post-ship revision):** the four-mode restriction above was lifted — *all eight*
> modes are now auto-proposable, each with its own intent fingerprint (see the classification
> table in `reference/intake.md`). D2 ("suggest-and-confirm, never silent") is unchanged; the
> confirm gate is what makes proposing a build-committing mode safe, and the explicit keyword
> (`/wf intake fix …`) remains the precise override.

**Dispatcher is a pure router.** It does NOT create the workflow folder itself — each mode
reference owns its artifact writes. `default.md` creates `00-index.md`/`01-intake.md`;
`ideate.md` writes only `.ai/ideation/` and creates no workflow; etc. This dissolves the
"ideate has no workflow" mechanical conflict.

### Per-mode flow span (standalone vs slug-mode — the spine, "lose nothing")

| Mode | Standalone (no slug) | Slug-mode (`<slug> <mode>`) | Terminus / Next |
|---|---|---|---|
| `default` | `00-index.md` + `01-intake.md`, PO interview, stack fingerprint | n/a (default isn't slug-attached) | recommends `/wf shape` |
| `fix` | `00-index.md` + `01-fix.md` (`type:fix-plan`), branch `fix/<slug>` | compressed slice (no branch) | flows → `/wf implement` |
| `rca` | `01-rca.md` (`type:rca`) **+ `02-shape.md`** (forwarding) + `00-index.md`, no branch | compressed slice, **no `02-shape.md`** | terminal → recommends `plan`/`fix`/`hotfix`/human-triage |
| `investigate` | `01-investigate.md` + `00-index.md`, no branch | compressed slice | terminal → user picks → `fix`/`intake` |
| `discover` | `01-discover.md` + `00-index.md`, no branch | compressed slice | terminal → verdict-dependent |
| `hotfix` | `hf-brief/plan/implement/verify.md`, **branch `hotfix/<base>`** | compressed slice, **branch suppressed** | → `/wf ship` |
| `refactor` | `rf-brief/baseline/plan/implement/verify.md`, optional branch | compressed slice, **branch suppressed** | → `/wf review` |
| `update-deps` | `.ai/dep-updates/<run-id>/{scan,research,plan,implement,verify}.md` | compressed slice **only** (suppress `.ai/dep-updates/` companion) | terminal |
| `ideate` | `.ai/ideation/<focus>-<ts>.md`, **no workflow** | compressed slice | terminal → user picks → `/wf intake` |

**Unifying slug-mode rule (resolves Plan-critique gaps):** in slug-mode the **compressed slice
is the sole output**, branch creation is **suppressed**, and off-pipeline companion dirs
(`.ai/dep-updates`, `.ai/ideation`, `.ai/simplify`) are **not written** — exactly the
`_compressed-slice.md` contract overriding each reference's standalone branch/artifact steps.

## The two new keys

- **`reference/probe.md`** (moved from `wf-quick/reference/probe.md`). Slug-only;
  `probe.md` Step 0 **enforces slug-required** (carried from wf-quick Step 0 sub-step 4 — must
  not be dropped in the move). Flags `--strict`/`--from`/`--adapter` preserved. Cites the
  adapter registry already at `reference/runtime-adapters.md` (verify/repoint the citation —
  it currently lives under `wf/reference/`, so the move makes it local). Always writes a
  compressed slice via `_compressed-slice.md`.
- **`reference/simplify.md`** (moved from `wf-quick/reference/simplify.md`). Scope keywords
  `branch`/`commit`/`plan`/`codebase` preserved. Standalone → `.ai/simplify/<run-id>.md`
  (`type:simplify-run`) + mandatory sibling `.yaml` (already in `SIBLING_YAML_VALIDATED_TYPES`)
  + `.html.fragment`. Slug-mode → compressed slice only.

## Shared reference: `reference/_compressed-slice.md`

Extract wf-quick `SKILL.md` **Step 1** (slug-mode contract) into a new top-level shared file —
**not** `intake/_intake-context.md`, because `probe.md` and `simplify.md` (own keys, not under
`intake/`) also consume it. Contents: slice-slug derivation, collision suffix, the
`03-slice-<sub>-<descriptor>.md` frontmatter (`type:slice`, `slice-type`, `compressed:true`,
`origin`), the additive `00-index.compressed-slices[]` + `03-slice.md` updates, the `INDEX.md`
`updated-at`-only touch, branch-suppression, and the "standalone instructions NOT allowed in
slug-mode" list. `intake.md`, `probe.md`, `simplify.md` each cite it in one line.

`reference/intake/_intake-context.md` stays **intake-scoped**: External Output Boundary +
slug-vs-mode resolution + `INDEX.md` collision/bootstrap + the stack-fingerprint guidance
(only modes that create a workflow run it).

## `wf/SKILL.md` changes

- **Step 0 table:** 15 → 17 keys. Add `probe` and `simplify` rows. Rewrite the `intake` row's
  `argument-hint` to `[slug] [mode] [args] | <description>` and its one-liner to name the mode
  dispatcher (resolves Plan-critique Risk 2). Update the header sentence count and the `name:`
  frontmatter `description`.
- **Step 0.5 fuzzy-slug exclusion list:** currently `intake, design, profile`. Add `probe`
  (slug-only, enforces internally — a non-match is probe's own STOP, not a typo) and `simplify`
  (first arg is a scope keyword, like `profile`'s `<area>`). Update `intake`'s exclusion note:
  it now resolves `token0` by **exact existence check** (slug-mode) inside the dispatcher, so a
  non-matching first token is a mode/description, never a typo'd slug. Final excluded set:
  `intake, design, profile, probe, simplify`.

## Touchpoint inventory (what changes vs what is provably untouched)

**Skill tree — Claude (`plugins/sdlc-workflow/skills/`):**
- `wf/SKILL.md` — as above.
- `wf/reference/intake.md` — rewritten as the mode dispatcher.
- NEW `wf/reference/intake/default.md` — current intake.md content, verbatim.
- NEW `wf/reference/intake/{fix,rca,investigate,discover,hotfix,refactor,update-deps,ideate}.md`
  — moved from `wf-quick/reference/`; standalone instructions kept; add a one-line cite to
  `_compressed-slice.md`; strip their own External Output Boundary preambles in favor of the
  shared `_intake-context.md` (match how design refs defer to `_design-context.md`).
- NEW `wf/reference/intake/_intake-context.md`, NEW `wf/reference/_compressed-slice.md`.
- NEW `wf/reference/probe.md`, `wf/reference/simplify.md` — moved from `wf-quick/reference/`.
- DELETE `skills/wf-quick/` entirely (recommended — clean retirement, matches the design
  precedent). *Alternative:* leave a thin redirect SKILL.md for a grace period; declined unless
  requested.
- Cross-reference sweep in sibling refs: any `/wf-quick <sub>` citation in
  `wf/reference/{verify,implement,review,handoff,ship,…}.md` and the shared
  `reference/{fragment-author-contract,narrative-fragments}.md` → `/wf intake <mode>` /
  `/wf probe` / `/wf simplify`.

**Schema (`tests/frontmatter.schema.json`) — cosmetic only:**
- 7 `description` strings that read `/wf-quick <sub>` (on `rca`, `ideate`, `dep-*`) →
  `/wf intake <mode>` (and `/wf simplify`). **No `type`/enum value changes** — `workflow-type`
  already enumerates `quick/rca/investigate/rf/refactor/hotfix/update-deps/discover`;
  `quickMetaArtifactFrontmatter`, `rcaFrontmatter`, `simplifyRunFrontmatter`, `ideationFrontmatter`,
  `dep*Frontmatter`, `siblingYamlSchemas` all stay as-is.

**Hooks — one cosmetic message:**
- `hooks/pre-write-validate.mjs` — `hf-`/`rf-` filename allowlist unchanged; the registry-warning
  string that mentions "positional slug detection … compressed slice" gets reworded to reference
  `/wf intake` slug-mode. `post-write-verify.mjs` `RICH_TIER_TYPES`/`SIBLING_YAML_VALIDATED_TYPES`
  (contain `rca`, `simplify-run`) unchanged.

**Renderers / lib / hub / render-queue — provably untouched (Constraint 3):**
- `_paths.mjs` `PHASE_BY_BASENAME` (`01-rca`,`01-fix`,`01-probe`,`01-investigate`,`01-discover`,
  `hf-*`,`rf-*`), `resolveViewPath` off-pipeline `kind` handlers, the per-type renderers
  (`fix-plan/investigate/discover/rf-*/hf-*/dep-*/ideation.mjs`), `index.mjs` STAGE_NAV,
  `render-sunflower.mjs` `OFF_PIPELINE_BUCKET`, `render-on-artifact-write.mjs` `detectRenderBucket`,
  `lib/render-queue.mjs`, `lib/hook-utils.mjs` — **no edits**: every key they switch on
  (`type:`, basename, `.ai/<dir>/`) is held stable. Verified by the e2e schema-driven renderer
  test continuing to pass.

**Tests:**
- Port `tests/wf-quick-fixtures.json` → `tests/wf-fixtures.json`: new fixtures asserting
  `/wf intake fix|rca|…` resolve to `skills/wf/reference/intake/<mode>.md`, `/wf probe` →
  `reference/probe.md`, `/wf simplify` → `reference/simplify.md`, slug-mode dispatch, and a
  `/wf-quick *` → error/not-a-key fixture. Remove the old `wf-quick-fixtures.json`.
- `tests/sunflower.test.mjs:48-54` (resolveViewPath for `01-rca/01-fix/01-probe/01-investigate`)
  — **no change** (filenames stable). `tests/e2e/acceptance.mjs` — **no change** (types stable).

**Docs (`docs/site/`)** — sweep mirroring the wf-design doc-followup (edit Claude tree; codex
`runtime/docs/site` rides `sync:codex`):
- Rewrite `reference/wf-quick.html` **in place** (preserve URL + `_apply_orphans.py` protection)
  as the "quick & standalone flows" reference, documenting the 8 modes under `/wf intake` + the
  `/wf probe` and `/wf simplify` keys — the analog of how `wf-design.html` was rewritten.
- `reference/commands.html` ("five routers"→"four"), `reference/skills.html` (count + row),
  `reference/wf.html` (add `probe`/`simplify`, note intake modes), `nav.html` +
  `_build_pages.py` SIDEBAR (retitle `↳ /wf-quick`), `how-to/choose-a-command.html`,
  `tutorials/quick-fix-workflow.html` (`/wf-quick fix`→`/wf intake fix` throughout),
  `orientation/*` ("six things you type"→five), `tips/*`, `explanation/adaptive-routing.html`,
  `docs/verify-gaps.md`. Brand stamps (53) auto-restamp from `plugin.json` via `_build_pages.py`.

**Codex tree (`plugins/sdlc-workflow-codex/`)** — hand-mirror `skills/` only, `$wf` prefix:
- Delete `skills/wf-quick/`; fold `skills/wf-quick/agents/openai.yaml`
  (`display_name`/`default_prompt`) into `skills/wf/agents/openai.yaml`.
- Apply every Claude `skills/wf/**` edit (dispatcher, `intake/` dir, `probe.md`, `simplify.md`,
  `_compressed-slice.md`, SKILL.md keys) with `$wf intake`/`$wf probe`/`$wf simplify`.
- `.codex-plugin/plugin.json` — drop `$wf-quick` from the router list in `description`; bump version.
- Update the four shared `references/*.md` wf-quick mentions and `README.md` (6-router→5-router row).

**Version bump + marketplace (9.82.0 → 9.83.0):** the 5 source/config spots + `marketplace.json`
top-level, then `npm run build` (restamps the 53 doc brands; `PLUGIN_VERSION` is bundled in
`dist/_shell.mjs`) and `npm run sync:codex`. README ("five routers"→"four") in both trees.

## Migration phases (atomic commit per phase, dedicated branch)

1. **Shared scaffolding** — write `reference/_compressed-slice.md` (extract wf-quick Step 1) +
   `reference/intake/_intake-context.md`; move current `intake.md` → `intake/default.md`. Mechanical.
2. **Intake dispatcher** — rewrite `reference/intake.md` (3-branch resolution + per-mode span +
   auto-route trigger); move the 8 mode refs into `intake/`; wire their `_compressed-slice.md`
   cites and branch-suppression-in-slug-mode.
3. **Two new keys** — move `probe.md`/`simplify.md`; repoint probe's `runtime-adapters.md` cite;
   add `probe`/`simplify` rows + Step 0.5 exclusions to `wf/SKILL.md`. Retire `skills/wf-quick/`.
4. **Cosmetic code** — 7 schema `description` strings + the one `pre-write-validate.mjs` message.
   Confirm renderers/hub untouched (run e2e renderer test).
5. **Tests** — port fixtures; run the suite.
6. **Docs** — the doc-site sweep above; `verify:docs`.
7. **Codex hand-mirror** — phases 1–6 under `sdlc-workflow-codex/skills/` (`$wf` prefix) + manifest.
8. **Version bump + build + sync** — bump, `npm run build`, `npm run sync:codex`, `verify:codex`.

## Verification

- `node --test` (or `npm test`) green, incl. ported fixtures + unchanged `sunflower.test.mjs` /
  `e2e/acceptance.mjs` (the latter proves no renderer regressed).
- `npm run verify:docs` and `npm run verify:codex` green (buildId lockstep).
- **Two-tree parity:** `grep -rl 'wf-quick' plugins/sdlc-workflow*/skills` returns nothing;
  `grep -h '<key>' both skill trees | sort -u` confirms the hand-mirror matches.
- **Manual dispatch smoke** in a scratch repo with a seeded `.ai/workflows/`:
  `/wf intake fix …` (→ compressed build), `/wf intake rca …` (→ 01-rca+02-shape),
  `/wf intake <existing-slug> rca …` (→ compressed slice, no 02-shape, no prompt),
  `/wf intake "the page is blank after deploy"` (→ suggest-and-confirm proposes `rca`),
  `/wf probe <slug>` (slug-required enforced), `/wf simplify branch` — then
  `npm run -s render` (or trigger the write hook) and confirm each artifact renders under its
  existing view path (`rca/INDEX.html`, `fix/INDEX.html`, `dep-updates/…`, `ideation/…`).

## Risks

- **Two-tree drift** — the repo's top failure mode; `grep -h | sort -u` after each phase.
- **`ideate` semantic stretch** — `/wf intake ideate` reads oddly (ideate makes no workflow);
  mechanically fine via the pure-router principle. If it grates in use, promoting it to its own
  `/wf ideate` key is a one-file move — flagged, not pre-empted.
- **Auto-route misfire** — over-eager suggestions annoy; the concrete trigger (no lifecycle
  vocab + single strong pattern + propose-once) is tuned conservative; revisit thresholds if noisy.
- **Dropped probe slug-enforcement / hotfix-refactor branch-suppression** — both are explicit
  line items in phases 2–3; the manual smoke test exercises exactly these.
- **Muscle-memory `/wf-quick`** — retiring the skill means the command stops resolving; the
  rewritten doc/README/CHANGELOG carry users to `/wf intake`. Thin redirect stub available if wanted.

## Resolved decisions

- **D1** — 8 entry-points → intake modes; `probe`/`simplify` → own keys. *(user)*
- **D2** — auto-route is suggest-and-confirm, never silent. *(user)*
- **D3** — artifacts stay byte-stable (no renumbering) → render pipeline untouched. *(plan)*
- **D4** — compressed-slice contract lives at top-level `_compressed-slice.md`, not under intake. *(plan)*
- **D5** — slug-mode FIRST in resolution, before collision detection; unifies the two. *(plan)*
- **D6** — slug-mode = sole compressed-slice output, branch + companion dirs suppressed. *(plan)*
