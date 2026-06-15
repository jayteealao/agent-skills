# Doc-site deviation audit + fix plan

**Audited:** 2026-06-09 · **Plugin version:** `9.49.0` (`package.json`, `.claude-plugin/plugin.json`)
**Docs-site frozen at:** content ≈ v9.46.0; footers read `v9.14.0` (generated pages) / `v9.11.0` (`index.html`, `nav.html`)
**Scope:** `plugins/sdlc-workflow/docs/site/**` vs. current source (`skills/`, `hooks/`, `lib/`, `schemas/`, `package.json`, `CHANGELOG.md`)
**Method:** 6 parallel auditors, one per site slice, each claim verified against source files. 157 raw findings → **116 distinct deviations** after dropping 4 agent-flagged false positives and merging duplicates.

---

## Status

- **Phase 0 — reconcile the build · DONE 2026-06-09.** Confirmed `_build_pages.py` regeneration is content-lossless (re-ran it against the git-clean `docs/site`; `git diff` showed zero content changes). No post-generation hand edits existed to fold back. Resolved Open Decision #1 (generator is authoritative). Also fixed a latent cross-platform bug: the generator now writes LF (`newline="\n"`) per `.gitattributes eol=lf`.
- **Phase 1 — version/nav single-source + CI guard · DONE 2026-06-09.** `_build_pages.py` now reads the version from `plugin.json` (no literals), derives pager order from the single `SIDEBAR` constant, and propagates the canonical sidebar to `nav.html` + all 5 hand-authored pages. Added `scripts/verify-doc-site.mjs` (wired into `npm run verify` + `npm run verify:docs`): fails on any brand ≠ `plugin.json` or any pager out of nav order. Verified all **46 pages now stamp v9.49.0** and **45 pagers** are consistent; negative-tested the guard.
  - **Resolved:** D-01, D-02, D-03, D-04 *(version, partial — see note)*, D-91, D-109, D-110, D-111, D-112. Design note: chose generator-**writes**-`nav.html` over generator-**reads**-`nav.html` (lower risk; `SIDEBAR` is already the complete/correct definition).
  - **Note on D-04:** the `serve.html` health-example `"9.38.0"` is body content (not the brand), so it is *not* auto-stamped — re-fix in Phase 3 with a version-neutral placeholder.
  - **Not addressed here (deferred):** the command→skill terminology in nav labels/page bodies (Phase 2), and all content/schema/sweep deviations (Phase 3). The nav still reads "Commands (overview)" / "↳ /wf router" — that is now single-sourced in `SIDEBAR`, so Phase 2 is a one-place edit + re-run.
- **Phase 2 — command→skill terminology + upstream count bug · DONE 2026-06-09.** Reframed the `SIDEBAR` + `PAGES` literals in `_build_pages.py`: "Commands reference"→"Routers reference" (page title, breadcrumb, nav "Routers (overview)", and all 8 cross-page link labels), "Every slash command at a glance"→"Every skill-mode router at a glance" (with an explicit "these are skills in `skills/`, not files in `commands/`" note), "Every command in the plugin"→"Every router…", faq "slash commands themselves"→"skill routers themselves", and the `/wf` page subtitle "every lifecycle command"→"every lifecycle stage". Fixed the one hand-authored body hit (`index.html` API tile). Surgical — legitimate uses ("the next slash command to type", `next-invocation`, "git command") left intact. Regenerated; both verify gates green; residual-phrasing grep clean.
  - **Upstream count bug (Open Decision #4) · FIXED.** `.claude-plugin/plugin.json` *and* repo-root `.claude-plugin/marketplace.json` descriptions: "13-stage … from intake through ship" → **"10-stage … from intake through retro"** (matches `skills/wf/SKILL.md`). Both validated as JSON. (`.agents/plugins/marketplace.json` does not mirror the string.) Also corrected the inherited "13 lifecycle stages" in `commands.html` + `skills.html` → 10 (D-13, D-14).
  - **Resolved:** D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14; Open Decision #4.
- **Phase 3 — L3 content re-derivation · DONE 2026-06-09.** Every per-router/per-schema claim re-derived from the named source-of-truth files and applied to the `PAGES` literals + the 5 hand-authored pages, then regenerated. Cleared **D-13–D-15, D-17–D-81, D-101–D-107, D-113–D-116**. Highlights: `/wf` arg optionality + verify/review fix-loops + handoff T5.0 + scope/refusal; ship 13-step list realigned to `ship.md` + deferral gate reframed as pre-flight step 6.5; `/wf-quick` 10 flows + `fix` rename/slug-mode + `rca` routing; `/wf-meta` 12 sub-commands + `how` grammar; `/wf-design` 22 (impeccable→onboard) + register files + 2-arg dispatch + `augmentations:` shape; `/wf-docs` 7 primitives + P0–P4 + docs-index; `/review` all 4 stale sweep memberships replaced from `router-metadata.json`; artifact `type` enum renames; slice/ship flat filenames; augmentation files workflow-scoped (`04b-instrument.md`); 00-index `selected-slice`/`review-scope`/`tags`/`stack`/augmentations shape; handoff CI-watch block; hooks → 5-from-`dist/` + fragment hard-block + config table + timeouts; serve branch-aware hub + per-repo render/bootstrap keys + `view.serve` removal note; sunflower-view `view.serve.enabled`→`perRepoServe`.
  - **Audit corrections found while verifying (measure-twice wins):** **D-16 was a false positive** — `idempotency-in-ship.html`'s "13-step run sequence" correctly refers to ship's *run sequence* (13 steps per `ship.md:110`), not the 10 lifecycle stages; left unchanged. **D-20 was wrong** — `/wf ship` keeps `[environment]` (`ship.md:3` defines `<slug> [environment] [--init-plan]`); not removed. **D-113's artifact names were stale in the audit itself** — `fix` writes `00-index.md` + `01-fix.md` (not `01-quick.md`/`05-implement.md`). **D-79 was mislocated** — the stale shape is the 00-index `augmentations:` array (`{type, artifact, status, created-at}`), not the registry slug-meta. **D-74's premise was wrong** — flat `09-ship-run-<run-id>.md` makes `plan-ref: ../../ship-plan.md` correct.
- **Phase 4 — L4 new pages + What's-new · DONE 2026-06-09.** Added two generated pages — `reference/tray.html` (tray app, v9.46) and `explanation/build-and-dist.html` (committed-`dist/` model, v9.45) — wired into `SIDEBAR` (pagers auto-threaded; rethreaded the external `serve.html`→`tray`→`types.html` chain by hand). Folded branch-aware hub / registry v2 / liveness into `serve.html` + `branch-strategy.html`; fragment hard-block + hatches into `hooks.html` + `escape-hatches.html`; build/dist into `faq.html` + `installation.html`. Regenerated `index.html` "What's new" from `CHANGELOG.md` (v9.12→v9.49 headlines) and annotated the retired shell/Python-hook entries as superseded. Cleared **D-82–D-112 remainder, D-104, D-106, D-108**, plus root-doc **D-98–D-100, D-116**.
  - **Verified:** `python _build_pages.py` regenerated all 42 generated + 5 patched external pages; `npm run verify` both gates green (`Verification PASSED across 4 router(s)` + `doc-site OK — 48 pages stamped v9.49.0; 47 pagers consistent`); `npm test` 265/265; residual-stale-pattern grep over generated HTML returns zero. No `skills/` reference files were touched, so the router migration-manifest is unaffected.
  - **Left intentionally:** `sunflower-view.md` stays a maintainer markdown note (not an HTML-nav page); the tray content it duplicated now lives in the linked `tray.html`. Historical `<span class="badge">vX</span>` "added in" markers kept (Open Decision #2).

---

## TL;DR

The site has not tracked the plugin since ~v9.11–9.14. Three structural root causes generate almost every line item:

1. **Frozen version** — footers stuck at `v9.14.0`/`v9.11.0`; everything from v9.12 → v9.49 is undocumented (tray, branch-aware hub, committed `dist/` build, `~/.sdlc` config, fragment hard-block, serve/hub default-on).
2. **Router migration not reflected** — the whole `reference/` is framed as a *"Commands reference"* for files in `commands/`, but those became **skills** (`skills/wf/`, …). `commands/` now holds exactly one file (`setup-wide-logging.md`).
3. **Schema / artifact rename drift** — the documented artifact `type` enum and filenames predate renames (`design-brief`→`design-contract`, nested vs flat ship-run paths, `03-slice-index.md`→`03-slice.md`, …). The schema pages describe formats the engine never writes.

---

## How the site is built (read before fixing anything)

Per `docs/site/README.md` **and** `docs/site/_build_pages.py:1-14`:

- **`_build_pages.py` is a one-shot generator.** It holds the canonical `SIDEBAR` template (`_build_pages.py:28-90`, incl. the hardcoded brand `…v9.14.0` at **line 29**) and a `PAGES` table whose entries embed the **full body of every generated page as a Python string literal**. Running `python3 _build_pages.py` **overwrites every page listed in `PAGES`**.
- **The generator owns:** all 3 `tutorials/`, all 10 `how-to/`, the `reference/` content pages, all 9 `explanation/`, all 4 `tips/`.
- **The generator does NOT own:** `index.html` and `nav.html` (hand-maintained — which is why their footer says `v9.11.0` while generated pages say `v9.14.0`), plus the two root markdown docs `sunflower-view.md` and `docs/site/README.md`.
- **`nav.html` is declared "source of truth" for the sidebar**, but the generator embeds its *own* `SIDEBAR` copy — so there are currently **two** nav definitions that have drifted apart.

### ⚠️ Fix-mechanics consequences (do not skip)

- **Do not hand-edit generated `.html`.** The next `python3 _build_pages.py` clobbers it. Fix the corresponding `PAGES` literal (or the `SIDEBAR` template) in `_build_pages.py`, then re-run.
- **Pre-flight reconciliation is mandatory.** The footer split proves the committed pages and the generator output have diverged — some pages were likely hand-edited after the last generation. **Before re-running, diff `git stash`-clean generator output against the committed pages** so you don't silently revert post-generation hand fixes. Decide, per page, whether the generator literal or the committed file is authoritative, then make the generator the single source.
- **`index.html` + `nav.html` are separate hand-edits** and must be synced to whatever the generator's `SIDEBAR` becomes.

---

## Fix strategy — five leverage points

Most of the 116 items collapse into five edits. Quote these in each finding's fix.

| Lever | What it fixes | Mechanism |
|---|---|---|
| **L1 — Version source** | Findings 1–4 (~45 pages) | Replace the literal `v9.14.0` at `_build_pages.py:29` with a value read from `../../.claude-plugin/plugin.json` at generate time; re-run. Hand-fix `index.html` + `nav.html` footers to match. Add a CI check that fails if any footer ≠ `plugin.json` version. |
| **L2 — Terminology + nav** | Section B (architecture), nav drift | Sweep the `PAGES` bodies + `SIDEBAR` for "command/slash command/router-in-`commands/`" → "skill". Reconcile the generator `SIDEBAR` with `nav.html`; ensure both list `Serve daemon` + `Artifact types`; sync `index.html`. |
| **L3 — Re-derive content from source** | Sections C–L (counts, args, fields, sweeps, schemas) | Edit the relevant `PAGES` literal. Source of truth is named per finding: `skills/*/reference/*.md`, `skills/review/router-metadata.json`, `lib/registry.mjs`, `schemas/sdlc-config.schema.json`, `hooks/hooks.json`. |
| **L4 — New pages** | Section O omissions | Add `PAGES` entries (+ `nav.html`/`index.html` links) for: tray app, branch-aware hub / registry v2 / branch-liveness, committed `dist/` build model, fragment hard-block + escape hatches, the v9.12→v9.49 "what's new". |
| **L5 — De-rot guard** | Prevents recurrence | Make `nav.html` the single sidebar source (generator reads it instead of embedding a copy); add the CI version check from L1; consider a CI link-checker for pager `Next/Prev` integrity. |

**Strong recommendation:** run this as a plan-driven `/wf-docs` pass against `docs/site` rather than a manual patch — the drift is large and will re-rot at the next release unless L1/L5 land. The reference files (`skills/*/reference/*.md`) are explicitly "the input, not the output" (`README.md:73`), so regeneration from them is the durable path.

---

## Findings + fix plans

Format: **`D-NN`** · *category* · `page` — **Doc says** → **Actual** *(evidence)* → **Fix**.
Unless noted, "edit page" means "edit the page's `PAGES` literal in `_build_pages.py`, then re-run the generator" (see fix-mechanics above).

### A. Version stamps (Lever L1)

- **D-01** · stale-version · all 18 `reference/*.html` — Footer `plugin docs · v9.14.0` → actual `9.49.0` (`package.json:3`). **Fix:** L1 — `_build_pages.py:29`.
- **D-02** · stale-version · `index.html` + `nav.html` — Footer `v9.11.0`; inconsistent with generated pages (`v9.14.0`). **Fix:** L1 hand-edit both; make them read the same source.
- **D-03** · stale-version · all 9 `explanation/`, 4 `tips/`, 9 `how-to/`, 3 `tutorials/` — Same stale `v9.11.0`/`v9.14.0` footer (~45 pages total). **Fix:** L1 (generator brand) covers all generated pages at once.
- **D-04** · stale-version · `reference/serve.html` — Health-endpoint example hardcodes `"version": "9.38.0"`. **Fix:** edit the example to a version-neutral placeholder (e.g. `"<plugin-version>"`) so it never dates again.

### B. Architecture: commands → skills (Lever L2)

- **D-05** · architecture · `reference/commands.html` — "Commands reference" / "Every slash command at a glance" → `/wf`, `/wf-quick`, `/wf-meta`, `/wf-design`, `/wf-docs`, `/review` are **skills**; `commands/` holds only `setup-wide-logging.md`. **Fix:** retitle page "Routers (skills) reference"; reframe intro; keep `/wf` invocation syntax (users still type it).
- **D-06** · architecture · every page sidebar — "Commands (overview)" + "↳ /wf router" sub-items imply a `commands/` hierarchy. **Fix:** L2 — relabel the `SIDEBAR` group to "Routers" (or "Skill routers"); nav links stay valid.
- **D-07** · architecture · `reference/wf.html` — h1 "/wf router — every lifecycle command in depth" → it's `skills/wf/SKILL.md` (`disable-model-invocation: true`). **Fix:** drop "command"; say "skill".
- **D-08** · architecture · `wf-quick.html`, `wf-design.html`, `wf-meta.html`, `wf-docs.html`, `review.html` — all use "router/command" framing for skills. **Fix:** L2 sweep across the five `PAGES` bodies.
- **D-09** · architecture · `explanation/orchestrator-discipline.html` — "Every **command** in the plugin…" → these are skills (`plugin.json` itself says "Six skill-mode routers"). **Fix:** "every skill / router".
- **D-10** · architecture · `explanation/diataxis-integration.html` — links "Commands reference / the /wf-docs sub-commands" → `/wf-docs` is a skill. **Fix:** relink + relabel.
- **D-11** · architecture · `tips/faq.html` — "the **slash commands** themselves are Claude Code-specific" → skills invoked via the skill router. **Fix:** reword to "skills".
- **D-12** · internal-inconsistency · `tutorials/installation.html` — body says "bundled into six skill routers" but its own nav labels them commands. **Fix:** L2 makes the page self-consistent.

### C. `/wf` lifecycle reference (Lever L3 → `skills/wf/SKILL.md` + `skills/wf/reference/*.md`)

- **D-13** · wrong-count · `reference/commands.html` — "Dispatches across **13 lifecycle stages** + 4 augmentations" → **10** stages (`skills/wf/SKILL.md` "Stage 1 of 10"). **Fix:** change 13→10.
- **D-14** · wrong-count · `reference/skills.html` — `wf` row "13 lifecycle stages + 4 augmentations" → 10 + 4. **Fix:** 13→10.
- **D-15** · internal-inconsistency · `commands.html` (13) vs `wf.html` ("10 stages (intake → retro)") — contradict. **Fix:** D-13 reconciles.
- **D-16** · wrong-count · `explanation/idempotency-in-ship.html` — "the **13-step** run sequence" → lifecycle is 10 stages; ship's internal step list is separate. **Fix:** correct the count / disambiguate ship-run steps from lifecycle stages.
- **D-17** · wrong-arg · `wf.html` — `/wf plan <slug> <slice>` (required) → `<slug> [slice]` optional (`SKILL.md:28`). **Fix:** mark slice optional.
- **D-18** · wrong-arg · `wf.html` — `/wf verify <slug> <slice>` → `[slice]` optional (`SKILL.md:30`). **Fix:** optional.
- **D-19** · wrong-arg · `wf.html` — `/wf review <slug> <slice> [triage]` → `<slug> [slice|triage]` (`SKILL.md:31`). **Fix:** correct arg form.
- **D-20** · wrong-arg · `commands.html` + `wf.html` — `/wf ship <slug> [environment]` → `ship | <slug>`, no `[environment]` (`SKILL.md:33`). **Fix:** remove `[environment]`.
- **D-21** · wrong-arg · `wf.html` — `/wf instrument` → `04b-instrument-<slice>.md`, slice required → `04b-instrument.md`, slice optional (`reference/instrument.md:29`). **Fix:** correct filename + arity.
- **D-22** · wrong-arg · `wf.html` — `/wf benchmark` omits the `[baseline|compare]` arg form the skill defines (`SKILL.md:37`). **Fix:** add the arg form.
- **D-23** · missing-feature · `wf.html` verify — omits the single-round user-gated **fix loop** + `convergence:` frontmatter field (`SKILL.md:30`). **Fix:** document both.
- **D-24** · missing-feature · `wf.html` review — omits the review-owned fix loop (sub-agent per Fix; `## Fix Status` vs `git diff HEAD`) (`SKILL.md:31`). **Fix:** document.
- **D-25** · missing-feature · `wf.html` handoff — omits refusal-on-unresolved-blockers + per-slice vs slug-wide review distinction (`SKILL.md:32`). **Fix:** document.
- **D-26** · missing-feature · `tutorials/first-workflow.html` + `how-to/triage-pr-comments.html` — handoff step list / sequence diagram omit **T5.0 (watch CI green + settle reviews)**, added v9.41.0 (`reference/handoff.md:120`). **Fix:** insert T5.0 before T5.1 in both the list and the Mermaid diagram.
- **D-27** · wrong-step · `first-workflow.html` — "all 10 stages: shape, slice, … retro" lists only **9** (omits `intake`). **Fix:** add intake.
- **D-28** · wrong-arg · `first-workflow.html` — shape "a **30-question** interview" → **20 questions** (`reference/shape.md:165`). **Fix:** 30→20.

### D. `/wf-quick` reference (Lever L3 → `skills/wf-quick/SKILL.md`, `reference/*.md`)

- **D-29** · wrong-count · `reference/skills.html` — wf-quick "**8** compressed flows" → **10** (fix, rca, probe, investigate, discover, hotfix, update-deps, refactor, ideate, simplify). **Fix:** 8→10.
- **D-30** · internal-inconsistency · `wf-quick.html` ("Ten entries") vs `skills.html` ("8") — disagree. **Fix:** D-29 reconciles.
- **D-31** · wrong-count · `tutorials/quick-fix-workflow.html` — "nine sub-commands beyond fix" but table lists **7** (omits `probe`, `simplify`). **Fix:** add both rows; verify the "nine" count.
- **D-32** · missing-feature · `how-to/start-workflow.html` — decision tree/scenarios omit `/wf-quick simplify`. **Fix:** add a leaf + scenario.
- **D-33** · renamed · `wf-quick.html` — doesn't note `fix` was renamed from `quick` (v9.18.0) and that `quick` redirects (`SKILL.md:24,41`). **Fix:** add a rename/redirect note.
- **D-34** · wrong-step · `quick-fix-workflow.html` — rca "forwards to `/wf shape`" → recommends `/wf plan` / `/wf-quick fix` / `hotfix` (`reference/rca.md:35`). **Fix:** correct the routing target.

### E. `/wf-meta` reference (Lever L3 → `skills/wf-meta/SKILL.md`, `reference/*.md`)

- **D-35** · wrong-count · `reference/skills.html` — wf-meta "**11** sub-commands" → **12** (`SKILL.md:15` "The 12 sub-commands"); adds `init-ship-plan`, `build-pipeline`. **Fix:** 11→12.
- **D-36** · wrong-step · `how-to/navigate-workflows.html` — cheat-sheet lists 6 (status, resume, next, sync, how, announce); omits amend, extend, skip, close, init-ship-plan, build-pipeline. **Fix:** add the missing 6.
- **D-37** · wrong-arg · `navigate-workflows.html` — `/wf-meta how X <stage>` → topic tokens are the fixed set `plan|shape|slice|review|findings` (+ `--research`/`--quick`) (`reference/how.md:3`). **Fix:** correct the token set.
- **D-38** · wrong-step · `first-workflow.html` — init-ship-plan "Pick a template; answer ~30 questions" → discovery-led since v9.12.0; templates are hypothesis seeds (`SKILL.md:35`). **Fix:** rewrite to discovery-led.
- **D-39** · wrong-config · `how-to/author-ship-plan.html` — Goal box "Blocks A–G" → **A–K** (body already says A–K → self-inconsistent). **Fix:** A–G→A–K in the Goal row.
- **D-40** · stale-install · `author-ship-plan.html` — "Plugin v9.12.0+" → Blocks H–K added v9.42.0 (`CHANGELOG.md:300`). **Fix:** note v9.12 for A–G, v9.42 for full A–K.
- **D-41** · stale-version · `wf-meta.html` — `/wf ship` "Step 6.5 … impossible after v9.14" with `v9.14` badge → stale relative marker. **Fix:** keep historical "added in" notes but verify the behavior still matches v9.49.

### F. `/wf-design` reference (Lever L3 → `skills/wf-design/SKILL.md` argument-hint)

- **D-42** · removed · `commands.html` + `wf-design.html` — list `impeccable` sub-command → **gone** from current argument-hint. **Fix:** remove `impeccable`.
- **D-43** · missing-feature · same — omit `onboard`, which **is** current. **Fix:** add `onboard`. (Current 22: shape, craft, audit, critique, extract, animate, bolder, clarify, colorize, delight, distill, harden, layout, onboard, optimize, overdrive, polish, quieter, typeset, adapt, setup, teach.)
- **D-44** · wrong-count · `how-to/use-design.html` — "22 sub-commands, **six artifact slots**" → `reference/` has 24 files incl. `brand.md`/`product.md` not in the 22-list. **Fix:** reconcile sub-command vs reference-file count; document or drop brand/product.
- **D-45** · architecture · `wf-design.html` — mode-dispatch prose conflates 1-arg/2-arg paths; with two args the decision keys on arg 1, not arg 0 (`SKILL.md:43-50`). **Fix:** correct the dispatch description.

### G. `/wf-docs` reference (Lever L3 → `skills/wf-docs/SKILL.md`)

- **D-46** · architecture · `how-to/start-workflow.html` — "Different from `/wf-docs how`" → there is **no** `how` sub-command in wf-docs; code-explanation is `/wf-meta how` (`wf-docs/SKILL.md:35`). **Fix:** retarget to `/wf-meta how`.
- **D-47** · architecture · `explanation/diataxis-integration.html` — "`/wf shape` … the **four quadrant** types" → 7 primitive keys (plan, tutorial, how-to, reference, explanation, readme, review). **Fix:** correct to the 7 primitives.
- **D-48** · wrong-arg · `wf-docs.html` plan stage — priorities "P0–P3" → tiers go to **P4** (Enhancement) (`SKILL.md:144-155`). **Fix:** add P4.
- **D-49** · missing-feature · `wf-docs.html` review stage — omits writing `08b-docs-index.md` (+ sibling `.yaml`) and the commit step (`SKILL.md:239-280`). **Fix:** document the index artifact + commit.

### H. `/review` sweep compositions (Lever L3 → `skills/review/router-metadata.json`)

> The page's top-level "31 dimensions and 7 sweeps" is correct; the **sweep memberships** are all stale. Re-derive every `aggregate` array from `router-metadata.json`.

- **D-50** · wrong-arg · `review.html` `pre-merge` = "correctness, security, testing, performance, observability, refactor-safety, docs, ci" → actual `correctness, testing, security, refactor-safety, maintainability` (`router-metadata.json:86-92`). **Fix:** replace member list.
- **D-51** · wrong-count · `pre-merge` shown as 8 dims → actual 5 (inflates sub-agent count). **Fix:** follows D-50.
- **D-52** · missing-feature · `pre-merge` omits `maintainability` (actual member). **Fix:** follows D-50.
- **D-53** · removed · `pre-merge` lists `performance, observability, docs, ci` (none actual). **Fix:** follows D-50.
- **D-54** · wrong-arg · `quick` = "correctness, testing, style-consistency" → actual `correctness, style-consistency, dx, ux-copy, overengineering`. **Fix:** replace.
- **D-55** · removed/missing · `quick` includes `testing` (not actual); omits `dx, ux-copy, overengineering`. **Fix:** follows D-54.
- **D-56** · wrong-arg · `architecture` = "architecture, scalability, reliability, maintainability, overengineering, refactor-safety" → actual `architecture, performance, scalability, api-contracts`. **Fix:** replace.
- **D-57** · removed/missing · `architecture` lists `reliability, maintainability, overengineering, refactor-safety` (none actual); omits `performance, api-contracts`. **Fix:** follows D-56.
- **D-58** · wrong-arg · `infra` = "infra, infra-security, ci, release, observability, cost" → actual `infra, ci, release, migrations, logging, observability`. **Fix:** replace.
- **D-59** · removed/missing · `infra` includes `infra-security, cost` (not actual); omits `migrations, logging`. **Fix:** follows D-58.
- **D-60** · wrong-arg · `first-workflow.html` — review dims example "http-handlers, error-handling, tests, docs-alignment" → none are real dimension names (`skills/review/reference/`). **Fix:** replace with real dimensions (e.g. correctness, error-handling? → use actual filenames).

### I. `reference/skills.html` (Lever L3)

- **D-61** · architecture · "Skills with `disable-model-invocation: true` (currently: `wf-meta`)" → **all five** routers set it (wf, wf-quick, wf-meta, wf-docs, wf-design). **Fix:** correct the list.
- **D-62** · wrong-count · "Six skill routers" / 6 table rows → `skills/` has **11** dirs. **Fix:** clarify "6 routers + 5 support skills".
- **D-63** · missing-feature · support skills (error-analysis, imagegen, refactoring-patterns, test-patterns, wide-event-observability) absent from the table. **Fix:** add a support-skills section.

### J. Artifact types & schema pages (Lever L3 → `skills/wf/reference/*.md`, `skills/wf-design/reference/*.md`, `lib/registry.mjs`)

- **D-64** · renamed · `artifacts.html` — type `design-brief` → `design-contract` (`wf-design/reference/craft.md`). **Fix:** rename.
- **D-65** · renamed · `artifacts.html` — `critique` → `design-critique` (`reference/critique.md:98`). **Fix:** rename.
- **D-66** · renamed · `artifacts.html` — `audit` → `design-audit` (`reference/audit.md:98`). **Fix:** rename.
- **D-67** · renamed · `artifacts.html` — `skip` → `skip-record`. **Fix:** rename.
- **D-68** · renamed · `artifacts.html` — `amendment` → `shape-amendment` / `slice-amendment` (`wf-meta/reference/amend.md:127,168`). **Fix:** split into the two real types.
- **D-69** · wrong-field · `artifacts.html` — bare `ship` type → `ship-run` (no `ship` type) (`reference/ship.md:309`). **Fix:** remove `ship`.
- **D-70** · wrong-filename · `types.html` — `slice-index` at `03-slice-index.md` → `03-slice.md` (`reference/slice.md:123`). **Fix:** correct filename.
- **D-71** · wrong-filename · `types.html` — per-slice detail `03-slices/<slice>.md` → `03-slice-<slice-slug>.md` at slug root (`reference/slice.md:76`). **Fix:** correct path.
- **D-72** · wrong-filename · `types.html` — ship-run nested `ship/<run-id>/09-ship-run.md` → **flat** `09-ship-run-<run-id>.md` (`reference/ship.md:508`). **Fix:** correct to flat layout.
- **D-73** · wrong-filename · `types.html` — `09-ship-runs-index.md` → `09-ship-runs.md` (`reference/ship.md:22`). **Fix:** rename.
- **D-74** · internal-inconsistency · `types.html` (nested ship path) contradicts `artifacts.html` (`03-slice.md`) + `09-ship-run-schema.html` (`plan-ref: ../../ship-plan.md` assumes flat). **Fix:** D-72 reconciles all three.
- **D-75** · other · `glossary.html` — augmentations "instrument, experiment, benchmark, profile" → `profile` is top-level `type: profile`, not `type: augmentation`; only the other 3 use the `augmentation-type` discriminator (`reference/profile.md:146`). **Fix:** clarify profile is off-pipeline, not an augmentation type.
- **D-76** · wrong-field · `00-index-schema.html` — required `selected-slice-or-focus` → the field *written* is `selected-slice` (`reference/intake.md:232`); `-or-focus` is only a read fallback. **Fix:** correct field name; note the fallback.
- **D-77** · missing-feature · `00-index-schema.html` — omits required `review-scope` (`per-slice|slug-wide`) driving review/handoff gating (`reference/intake.md:119`). **Fix:** add.
- **D-78** · missing-feature · `00-index-schema.html` — omits required `tags`, `stack` (`reference/intake.md:119,240-253`). **Fix:** add.
- **D-79** · wrong-field · `00-index-schema.html` — augmentations shape `{kind,slice,ref,registered-at}` stale vs current slug-meta with `branch, branchStrategy, baseBranch, prNumber, prUrl, branchState` (`lib/registry.mjs:222-243`). **Fix:** update shape.
- **D-80** · missing-feature · `08-handoff-schema.html` — omits CI-watch block `ci-watch-conclusion, ci-watch-rounds, ci-watch-fix-rounds, bot-reviews-landed, review-settle-elapsed-seconds` (`reference/handoff.md:306-311`). **Fix:** add fields.
- **D-81** · internal-inconsistency · `types.html` — claims fragment set comes from `verify-fragment.mjs` `ALLOWED_FRAGMENT_NAMES`, but the *enforcing* set is `RICH_TIER_TYPES` in `hooks/post-write-verify.mjs:59-63` (13 types incl. `review-command`, `design-audit`, `design-critique`). **Fix:** point at the enforcing set; reconcile the two lists.

### K. `reference/hooks.html` (Lever L3 → `hooks/hooks.json`, `hooks/*.mjs`, `schemas/`; new content L4)

- **D-82** · wrong-path · hooks shown running from `hooks/*.mjs` → hooks.json wires all from `dist/*.mjs` (`hooks/hooks.json:9,22,35,38,44`). **Fix:** correct paths; explain the `dist/` build model.
- **D-83** · wrong-count · "The plugin ships **six** Node hooks" → 5 wired entries; `render-on-artifact-write.mjs` is an imported module, not a registered hook. **Fix:** 6→5; clarify the helper module.
- **D-84** · removed · hooks.html + `index.html` "What's new" still describe `verify_frontmatter.py` + `validate-workflow-write.sh` + `verify-workflow-postwrite.sh` → all retired v9.34.3/9.34.5; no `hooks/scripts/` or `.py` exists. **Fix:** delete the legacy-hook content.
- **D-85** · removed · no page states the **PreCompact hook was deleted** (v9.41.0). **Fix:** remove any PreCompact references; note SessionStart(source=compact) is the mechanism.
- **D-86** · missing-hook · `hooks.html` never documents the 3rd PostToolUse hook `post-write-render.mjs`. **Fix:** add it.
- **D-87** · missing-feature · omits the **sibling-fragment hard block** (post-write-verify exits 2 for ~13 rich-tier types, v9.47/9.48) + escape hatches `fragment: none` / `hooks.remindMissingFragments:false`. **Fix:** document the block + hatches.
- **D-88** · missing-feature · omits `hooks` config keys `autoStage, validateOnWrite, verifyOnWrite, remindMissingFragments` (`schemas/sdlc-config.schema.json:69-86`). **Fix:** add a config table.
- **D-89** · missing-feature · omits timeouts (auto-stage=5, verify=15, render=30) + SessionStart=30 (`hooks/hooks.json`). **Fix:** add timeouts column.
- **D-90** · missing-feature · omits the build/dist requirement — hooks run from committed esbuild bundles; editing source needs `npm run build` (v9.45.0). **Fix:** add a "hooks run from dist/" note.
- **D-91** · broken-link · `hooks.html` pager "Next →" jumps to `glossary.html`, skipping `serve.html` (which sits between in the sidebar). **Fix:** rethread pager hooks → serve.

### L. `reference/serve.html` / hub (Lever L3 + new content L4)

- **D-92** · missing-feature · no mention of v9.49.0 **branch-aware hub** + repo-scoped registry IDs (`REGISTRY_VERSION = 2`, `computeEntryId` hashes repoRoot alone) (`lib/registry.mjs:40,137`). **Fix:** new section.
- **D-93** · missing-feature · no mention of **branch-liveness badges** (`live/merged/gone/unknown`) (`lib/branch-liveness.mjs:55-61`). **Fix:** document.
- **D-94** · missing-feature · no mention of the **tray app** (v9.46.0, `dist/tray.mjs`, `npm run tray`). **Fix:** new page or section (L4).
- **D-95** · architecture · lifecycle step says it spawns `scripts/render-sunflower-serve.mjs` → `resolveEntrypoint()` prefers `dist/render-sunflower-serve.mjs` in installs (`lib/entrypoint.mjs:29-32`). **Fix:** correct the spawned path.
- **D-96** · missing-feature · omits per-repo render/bootstrap keys `view.render.{concurrency,debounceMs}`, `view.bootstrap.{enabled,renderMissing,renderStale}` (`schemas/sdlc-config.schema.json:16-50`). **Fix:** add to the config table.
- **D-97** · other · doesn't flag that per-repo `view.serve` was **removed** (v9.38.0, breaking) — upgraders' settings silently ignored (`lib/config.mjs:18-22`). **Fix:** add a migration note.

### M. `sunflower-view.md` (root doc — direct hand-edit, not generator)

- **D-98** · wrong-config · references `view.serve.enabled` → rejected by the per-repo schema since v9.38.0 (`lib/config.mjs:18-22`). **Fix:** replace with `view.hub.enabled` + machine-wide `~/.sdlc`.
- **D-99** · wrong-config · hub-config prose mixes machine-wide `perRepoServe` with per-repo `view.hub.enabled`; example JSON omits the `hub` object. **Fix:** separate the two configs; complete the example.
- **D-100** · missing-feature · `sunflower-view.md` (and any tray doc) are **not linked** from `nav.html`/`index.html` — orphaned. **Fix:** add nav links (L2/L4).

### N. Tutorials / install (Lever L3)

- **D-101** · stale-install · `installation.html` — "You should see **v9.5.0** or later … many features require v9.5.0" (~44 releases stale). **Fix:** bump the floor to a current meaningful version; ideally derive from `plugin.json`.
- **D-102** · architecture · `installation.html` — hook description names `validate-workflow-write.sh`/blocked-write messages that no longer match the Node hooks (`hooks/hooks.json`). **Fix:** rewrite against current hooks.
- **D-103** · missing-feature · no tutorial/how-to mentions the tray app, the `dist/` build model, or "no runtime npm install" (v9.45.0). **Fix:** add to installation + a tips page (L4).

### O. Explanation / tips (Lever L3 + L4)

- **D-104** · missing-feature · `index.html` "What's new" stops at v9.11.0 — omits v9.12→v9.49: tray (9.46), branch-aware hub (9.49), committed dist bundles (9.45), `~/.sdlc` config (9.38), fragment hard-block (9.47/9.48), serve/hub default-on (9.34). **Fix:** regenerate "What's new" from `CHANGELOG.md` (L4); consider auto-deriving the last N entries.
- **D-105** · wrong-config · `tips/escape-hatches.html` — omits the now-critical fragment hatches `fragment: none` / `hooks.remindMissingFragments:false`. **Fix:** add them.
- **D-106** · missing-feature · `tips/faq.html` — says nothing about the dist/build step; its "use with another AI assistant" answer ignores that `dist/` bundles are the runtime. **Fix:** add a build/dist FAQ entry.
- **D-107** · missing-feature · `explanation/branch-strategy.html` — covers only `dedicated/shared/none`; no branch-liveness states or branch-aware hub (`lib/branch-liveness.mjs`). **Fix:** add a liveness section.
- **D-108** · wrong-config · `index.html` "What's new" — presents the retired shell/Python hook architecture as current. **Fix:** D-84 + D-104.

### P. Navigation / cross-page integrity (Lever L2 / L5)

- **D-109** · broken-link · `nav.html` (canonical) and `index.html` sidebars are **out of sync**: `index.html` has "↳ /wf router…" sub-items and lacks `Serve daemon`/`Artifact types`; `nav.html` is the reverse. **Fix:** make `nav.html` the single source (L5); regenerate `index.html` from it.
- **D-110** · broken-link · `how-to/use-augmentations.html` pager "Next → Triage PR comments" skips `use-design.html` (the actual next sidebar page). **Fix:** rethread pager.
- **D-111** · internal-inconsistency · nav copies advertise different doc-version strings (v9.11.0 vs v9.14.0) baked into the brand. **Fix:** L1 + L5 (single version source).
- **D-112** · broken-link · `how-to` and `reference` pager chains have gaps where pages were added (serve, types) but pagers weren't rethreaded. **Fix:** audit all `Next/Prev` pairs against sidebar order; add a CI link-check (L5).

### Q. Additional omissions of current guidance (Lever L3)

- **D-113** · missing-feature · `wf-quick.html` `fix` artifact description (`00-index.md`+`01-quick.md`+`05-implement.md`) ignores slug-mode where output is a compressed `03-slice-<slice>.md` (`wf-quick/SKILL.md` slug-mode contract). **Fix:** document slug-mode vs standalone.
- **D-114** · missing-feature · `wf-meta.html` `status` references runtime-evidence-deferrals/probe filtering with a stale `v9.14` badge; no reflection of 35 subsequent versions. **Fix:** verify against `reference/status.md`; refresh.
- **D-115** · wrong-step · `triage-pr-comments.html` sequence diagram starts the T5.1 loop right after PR creation, omitting the T5.0 CI/bot-settle gate that now blocks it (`reference/handoff.md:121`). **Fix:** D-26 (insert T5.0 in the diagram).
- **D-116** · missing-feature · `docs/site/README.md` describes the layout as only `tutorials/how-to/reference/explanation/tips`, omitting root `sunflower-view.md` (and any tray doc). **Fix:** update the layout block.

---

## Prioritized execution plan

**Phase 0 — Reconcile the build (blocks everything; ~½ day). ✅ DONE 2026-06-09.**
Decide authoritative source per generated page (generator literal vs committed HTML). Diff generator output against committed pages; fold any post-generation hand fixes back into `_build_pages.py`. Outcome: re-running the generator is safe and lossless. *(Addresses the fix-mechanics risk; unblocks L1–L4.)*

**Phase 1 — L1 + L5 version/nav single-sourcing (~½ day). ✅ DONE 2026-06-09.**
Make `_build_pages.py:29` read the version from `plugin.json`; make the generator read `nav.html` instead of embedding `SIDEBAR`; sync `index.html`. Add CI checks: (a) every footer == `plugin.json` version, (b) pager Next/Prev integrity. Clears **D-01–D-04, D-109–D-112** and prevents recurrence.

**Phase 2 — L2 terminology sweep (~½ day). ✅ DONE 2026-06-09.**
command/router → skill across `PAGES` + `SIDEBAR`. Clears **D-05–D-12**.

**Phase 3 — L3 content re-derivation (the bulk; ~2–3 days). ✅ DONE 2026-06-09.**
Per-router and per-schema content from the named source-of-truth files. Cleared **D-13–D-81, D-101–D-107, D-113–D-116** (D-16/D-20/D-74 reclassified — see Status). Highest-value clusters: `/wf` args+stages (C), review sweeps (H), artifact types/schemas (J), hooks (K).

**Phase 4 — L4 new pages (~1–2 days). ✅ DONE 2026-06-09.**
Added: tray app (`reference/tray.html`), committed-`dist/` build model (`explanation/build-and-dist.html`); folded branch-aware hub / registry v2 / branch-liveness, fragment hard-block + hatches, and the regenerated "What's new" (from `CHANGELOG`) into existing pages. Cleared **D-92–D-94, D-103–D-104, D-106, D-108**, plus the root-doc items **D-98–D-100, D-116**.

**Recommended driver:** `/wf-docs <slug> --audit-only` first (confirm the gap set), then a full `/wf-docs` run scoped to `docs/site`, since the reference files are the declared input. Land L1/L5 in the same PR or the site re-rots next release.

---

## Open decisions / risks

1. **Generator vs hand-authored authority** — `README.md` says "every page is hand-authored," but `_build_pages.py` says it "overwrites every page in PAGES." These contradict. Phase 0 must pick one. *Recommendation:* generator is authoritative; README updated to match.
2. **Historical "added in vX" badges** — `<span class="badge">v9.14</span>` markers are legitimate history, not necessarily bugs. Keep them where they mark *when* a feature landed; only fix where they imply *current* latest.
3. **brand.md / product.md** (D-44) — reference files exist with no sub-command. Decide whether they're dead files (remove) or undocumented sub-commands (document) — needs a source check before the docs claim either.
4. **`13-stage` in `plugin.json` — FIXED 2026-06-09 (was an upstream bug).** `.claude-plugin/plugin.json:4` read *"…a **13-stage** SDLC lifecycle from intake **through ship**…"* while `skills/wf/SKILL.md` is authoritative at **10 stages (intake → retro)**. So **D-13/D-14/D-16's "13 stages" error is inherited from the manifest**, and the manifest *also* drops `retro` ("through ship"). Fix the manifest description (`13`→`10`, `through ship`→`through retro`) as part of this work — otherwise the docs will be "corrected" to disagree with the plugin's own metadata. *(Note: the same description already says "Six skill-mode **routers**" — so the manifest is correct on terminology and the docs, not the manifest, are the command-vs-skill outlier; see Section B.)* Also propagate to `marketplace.json` if its entry mirrors this string.

---

*Generated from a 6-agent parallel audit on 2026-06-09. Evidence citations are `source-file:line` at audit time; re-verify line numbers before editing as the source moves.*
