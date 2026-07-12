# Doc-site drift audit — 2026-07-12

Scope: `docs/site/**` (all HTML pages + README + sunflower-view) audited against source at `v9.121.0` (package.json). Follow-up to [DOC-SITE-DRIFT-AUDIT-2026-06-20.md](DOC-SITE-DRIFT-AUDIT-2026-06-20.md), which fixed 191 findings as of v9.9x. Since then, ~33 releases (v9.89.0 → v9.121.0) shipped without a matching doc-site pass.

Six parallel read-only audits (one per doc cluster) compared every page's prose against current `SKILL.md`, `skills/wf/reference/**`, `tests/frontmatter.schema.json`, `hooks/**`, `lib/**`, and `CHANGELOG.md`. Findings below are grouped by theme, not by which agent found them, and cross-references between findings are noted since several root causes surface on many pages at once.

## Headline

The site's version drift has one dominant root cause: **six retirement events across v9.82–v9.98** — five named commands (`/wf-quick`, `/wf-design`, standalone `/review`, `amend`, `craft`) plus one group retirement (the four augmentation keys `instrument`/`experiment`/`benchmark`/`profile`, folded into shape/plan/implement/verify) — **and the site still teaches most of them as live**, on top of **zero coverage of the ~10 features shipped since** (`yolo`, `adopt` intake mode, `steer.md`, ship-plan-readiness gate, batch handoff/ship/recap/retro, `study-sources` skill, git-repo precondition, tray self-heal internals, cross-host lock takeover). Both problems are `whats-new.html`-shaped: the changelog page's own body stops at v9.88.0 even though its sidebar brand claims v9.121.0.

*Note on this report's own accuracy: every finding below was independently re-verified against the actual doc and source files in a second pass (see "Verification pass" at the end). Two findings from the first pass were wrong and have been removed/corrected in place; one line citation was off by two lines and has been fixed; the rest held up.*

---

## A. Retired commands still taught as live (cross-cutting, appears on 6+ pages)

| Retired thing | Retired in | Pages that still teach it as live |
|---|---|---|
| `/wf-quick` router | v9.83.0 | Sidebar nav on **every** page (`↳ Quick & standalone` → `reference/wf-quick.html`) |
| `/wf-design` router | v9.82.0 | Sidebar nav on **every** page (`↳ /wf design` → `reference/wf-design.html`); `use-design.html` line 191 worked example calls `/wf design settings-v2 craft` |
| Standalone `/review` | ~v9.98.0 (dissolved into `/wf review`) | Sidebar nav (`↳ /review`); `orientation/mental-model.html:133-136`; `how-to/choose-a-command.html:218-232` |
| `amend` | v9.98.0 (WF-META-DOCS-DISSOLVE) | `how-to/close-workflows.html:148` ("extend or amend") |
| `craft` design stage | v9.96.0 (dissolved into shape/plan/implement) | `how-to/use-design.html:191` (invokes it in a worked example, contradicting the same page's own line 142 which says "there is no `craft` command"); `whats-new.html:113` (v9.82.0 entry lists `craft` among 21 design commands) |
| `instrument`/`experiment`/`benchmark`/`profile` as standalone `/wf` keys | v9.9x (absorbed into shape/plan/implement/verify) | `reference/wf.html:96` (lede + TOC entry at line 113), `543-619` (full detail sections); `how-to/use-augmentations.html:118-140`; `orientation/mental-model.html:110`; `reference/glossary.html:103` (lists `rca` as a 4th augmentation type instead of `profile`) |
| `init-ship-plan` "stage" naming | v9.98.0 (now `/wf ship-plan init`, a router sub-command, never a pipeline stage) | `how-to/author-ship-plan.html:114` |

**Action:** these all trace back to the same five retirements. Fixing the sidebar nav block (shared across every page) and the `reference/wf.html` dispatch table removes the majority of instances in one pass; the remaining ones are page-specific prose that repeats the stale claim.

---

## B. Missing coverage of shipped features (nothing links these to "wrong," they're just absent)

| Feature | Shipped | Missing from |
|---|---|---|
| `/wf yolo` (autonomous driver) | — | `reference/wf.html` (not in the "18 keys" table — count itself is wrong, should be 20); `orientation/mental-model.html:110` |
| `/wf intake adopt` (reverse-entry mode) | v9.118.0 | `reference/commands.html:112`, `reference/wf-quick.html:96` (both say "eight" intake modes, should be nine); `tutorials/quick-fix-workflow.html:249-263` intake-modes table; `00-index-schema.html:137` `workflow-type` enum |
| `steer.md` standing steering + `steering-honored:` field | v9.120.0 | All six audited reference/schema pages; `08-handoff-schema.html`; `09-ship-run-schema.html` |
| Ship-plan-readiness pre-check (handoff step 6.7 / ship) | v9.119.0 | `reference/wf.html:442-446` handoff detail section; `08-handoff-schema.html` (`ship-plan-readiness` field entirely absent); `09-ship-run-schema.html` (same field, different enum, also absent) |
| Batch handoff/ship/recap/retro over `pr#N`/branch | v9.105/106.0 | `reference/wf.html` dispatch table (arg signatures show only `<slug>`, not `<slug\|pr#N\|branch>`); `08-handoff-schema.html` (6 fields: `handoff-scope`, `handoff-fingerprint`, `handoff-lead`, `readiness-via`, `branch-slugs`, `pr-readiness-verdict`); `09-ship-run-schema.html` (3 fields: `ship-scope`, `branch-slugs`, `shipped-via`) |
| Revision ledger (`revisions:` frontmatter) | v9.105.0 | `08-handoff-schema.html` |
| `study-sources` skill | v9.116.0 | `reference/skills.html:133-141` (4 skills listed, should be 5); `tutorials/installation.html:133` (verify-install list) |
| `diataxis` skill restored as standalone | v9.113.0 | `tutorials/installation.html:133` (verify-install list omits it); `explanation/diataxis-integration.html` (doesn't claim it's gone, but only describes the lifecycle-bound integration, implying that's the whole picture). ~~`reference/skills.html`~~ — **correction:** this page already documents `diataxis` correctly at line 136, including calling it "the standalone counterpart to `/wf docs`." Not a finding. |
| Git-repo precondition (Step 0.7, hard-stops non-git dirs on every dispatch) | v9.110.0 | `tips/faq.html:148-149` — **softened from first pass:** SKILL.md's Step 0.7 offers a sanctioned "continue without git" path, so the FAQ's "most of it works without git" isn't flatly false. The real gap is narrower: the FAQ doesn't mention that a mandatory user-facing prompt now fires before *every* dispatch (not just handoff/ship) when the directory isn't a git repo. |
| `/wf ship <slug> rollback` command | ≥v9.119.0 | `how-to/run-a-release.html:162-173` (tells users to manually hand-edit the run artifact YAML instead of using the sanctioned rollback runbook) |
| Two `leak-guard-*` hooks (bash + write) | — | `explanation/build-and-dist.html:106` (lists 5 hooks, actual is 7 per `scripts/build.mjs` `HOOK_ENTRIES`). **Correction:** `reference/hooks.html` is not actually missing these — it documents both leak guards at lines 117-121 and its own table (line 124) correctly says "seven." Its only problem is the contradictory lede ("five" at line 96), which is already captured in section C — removed from this row to avoid double-counting. |
| Tray live-process self-heal, liveness heartbeat, `SDLC_DISABLE_TRAY_HEAL` opt-out | v9.81.0 / v9.89.0 | `reference/tray.html` (documents only the launcher-file self-heal, not the running-process heal, heartbeat-driven wedge detection, or the opt-out env var) |
| Cross-host lock takeover marker (`hub.lock.takeover`, serializes concurrent Claude/Codex startup races) | — | `reference/serve.html:211-218` |
| Review accumulating ledger (merge-not-overwrite, `surfaced-at`/`status`, resolved-sweep) | — | `reference/review.html` |
| Grok/Cursor hook payload normalization (`normalizeHookPayload`) | — | `reference/hooks.html` (describes hooks as Claude Code-specific; the manifest is load-bearing for Grok/Cursor too) |
| `npm run sync:codex` + `package.json` as a rebuild trigger | — | `explanation/build-and-dist.html:113-118` (maintainer rebuild steps omit it; also mischaracterizes `hooks:install` as installing an auto-rebuild pre-commit hook — it only sets `core.hooksPath`, and no hook file exists in `.githooks/`) |

---

## C. Internal inconsistencies (a single page contradicts itself)

- `reference/commands.html`: line 122 says "21 sub-commands" for `/wf design`, line 209 says "20" — source (`SKILL.md:43`) confirms 20. (Corrected from first pass, which cited line 124 — that line is a closing `</tr>` tag, not the text.)
- `reference/hooks.html`: line 96 lede says "five hooks," line 124 table header says "seven" — seven is correct.
- `reference/wf.html`: line 96 claims "18 keys," actual dispatch table (`SKILL.md`) has 20.
- `reference/glossary.html:103`: lists augmentation types as `instrument, experiment, benchmark, rca` — `rca` is an intake mode, not an augmentation type; should be `profile`.
- `orientation/first-10-minutes.html:117-124`: prose says intake "writes two files," code block immediately below shows five (`00-index.md`, `01-fix.md`, `02-shape.md`, `03-slice.md`, `04-plan.md`). Compare `tutorials/quick-fix-workflow.html:126-131`, which is self-consistent (says two, shows two) — the two tutorials describe the same compressed-lifecycle behavior differently.
- `09-ship-run-schema.html:159`: says `plan-version-at-run` reads a `version:` field from `ship-plan.md`; the ship-plan schema doc itself (`ship-plan-schema.html:269`) names the field `plan-version`.
- `00-index-schema.html:114`: calls `selected-slice-or-focus` a "legacy fallback" of `selected-slice`; the schema description (`tests/frontmatter.schema.json:181-184`) says the priority is inverted — `selected-slice-or-focus` is preferred, `selected-slice` is the fallback.

---

## D. Ground-truth inconsistency (not a doc-site bug, but worth fixing alongside)

`skills/wf/reference/_fragment-authoring.md:21-23` (Step F1 rich-tier type list) is itself stale relative to `hooks/post-write-verify.mjs:60-69` (`RICH_TIER_TYPES`): it carries `design-brief`, a name the code and schema no longer use; it's missing `review-command`, `design-audit`, `design-critique`, **and `design-contract`** (four types, not a 1:1 rename — `design-contract` is a genuinely separate entry the authoring doc has no line for at all, it isn't simply `design-brief` under a new name); and it wrongly includes `review-dimension`, which the hook comment explains is deliberately excluded (keys on `type: review-command`, not `review-dimension`). This is an authoring skill file, not a docs/site page, but it feeds the same fragment-authoring contract the doc-site reference pages describe — worth fixing in the same pass since a stage author following it today would use the wrong type name and miss three rich-tier types entirely.

---

## Pages audited with no findings (as of round 1 — see correction below)

`explanation/adaptive-routing.html`, `artifacts-over-memory.html`, ~~`augmentations-model.html`~~, `branch-strategy.html`, `idempotency-in-ship.html`, `orchestrator-discipline.html`, `the-readiness-gate.html`, `why-this-exists.html` were checked against `lib/branch-liveness.mjs`, `lib/project-root.mjs`, and the augment reference docs and found consistent with current behavior. **Correction (round 2): `augmentations-model.html` was wrongly cleared — see finding E7 below.**

---

# Round 2 — 2026-07-12 (same day), different lenses

Round 1 clustered agents by page directory and checked each cluster against the features/commands most likely to have drifted. Round 2 deliberately used different search strategies to catch what that approach structurally can't see: link/anchor integrity, literal code-example syntax, cross-page numeric consistency (checked site-wide, not per-page), one file nobody had opened yet (`sunflower-view.md`), and a methodical line-by-line walk of `CHANGELOG.md` from v9.89.0 to v9.121.0 (round 1 sampled ~10 features from this range; this walks all of it). It also checked the doc-site's own build hygiene — dead scripts, stale meta-counts, gitignore coverage — which round 1 didn't touch at all.

## E. New findings

**E1 — Glossary anchor links are all broken (17 links across 9 pages).** `reference/glossary.html` defines every term as a bare `<dt>` with no `id=` attribute (confirmed: the only `id=` in the file is `id="sidebar"` on the sidebar `<aside>`). Every page that links to a specific term — `glossary.html#artifact`, `#stage`, `#readiness-check`, `#frontmatter`, `#fragment`, `#dashboard`, `#sub-command`, `#add-on`, `#command` — lands on the top of the glossary page instead of the term. Affected: `explanation/idempotency-in-ship.html:143`, `explanation/orchestrator-discipline.html:107,125`, `how-to/run-a-release.html:100,125`, `reference/hooks.html:105,106,112,113`, `reference/pipeline.html:98,211`, `reference/tray.html:97`, `reference/wf-design.html:98,156`, `tips/anti-patterns.html:101,125`, `tutorials/quick-fix-workflow.html:97`. Fix: add matching `id="artifact"` etc. to each `<dt>` in glossary.html. (Everything else in the site's internal link graph checked out clean — no orphaned pages, no dead page-level links; nav.html's 50 links all resolve.)

**E2 — `docs/site/sunflower-view.md` was not covered by round 1 at all, and has four of its own errors:**
- Line 56: claims bundles are "verified fresh by CI (`.github/workflows/sdlc-build-freshness.yml`)" — no `.github/workflows/` directory exists anywhere in the plugin.
- Line 291: links to `../../SUNFLOWER-VIEW-PLAN.md`, which doesn't exist at that path (or any path) — the similarly-named `SUNFLOWER-FRAGMENT-COVERAGE-PLAN.md` / `SUNFLOWER-PAGE-REVIEW-CHECKLIST.md` live under `docs/internal/archived/` but aren't what the link targets.
- Line 300: troubleshooting table tells users to "pass `--path /your-path` to the serve wrapper" — `render-sunflower-serve.mjs` has no `--path` flag; actual flags are `--view`, `--host`, `--port`, `--pid-file`, `--project-root`, `--config-hash`, `--live-reload`/`--no-live-reload`, `--allow-all-hosts`, `--allowed-hosts`.
- Line 116 says "Eleven fragment-bearing artifact types"; `reference/hooks.html:106` says "14 rich-tier artifact types" — the two site pages disagree with each other and neither was cross-checked against the other before now.

**E3 — Additional citations for already-known count errors, on pages round 1 didn't check for this specific angle:**
- `orientation/mental-model.html:115` — "Eight compressed intake modes" (missing `adopt`; correct is nine).
- `reference/glossary.html:157` — "/wf design has 21" sub-commands (correct: 20) — a citation independent of `commands.html`'s already-known 21-vs-20 self-contradiction.
- `reference/wf-quick.html:100` ("eight mode names") and `:111` ("The eight intake modes" heading, with an 8-row table) — round 1 only cited `:96` on this page; two more instances plus the table itself need the `adopt` row.
- `reference/skills.html:131` ("Four skills under `skills/` are not commands") and `:98` (names only `consult`, `imagery`, `uiproto`, `diataxis`) — round 1 cited the table at `:133-141` being short a row; these are two additional explicit-count sentences on the same page missing `study-sources` by name.
- `reference/skills.html:107` — describes `/wf`'s standalone/driver keys as "design · probe · simplify · auto · docs", omitting `yolo` (and miscategorizing `docs`, which `SKILL.md` calls a router, not a driver).

**E4 — `explanation/augmentations-model.html` internal self-contradiction (round 1 wrongly cleared this page).** Lines 113–127 name the four augmentation types as instrument/experiment/benchmark/**rca**; line 129 then says profile is a *freestanding* command, not an augmentation type; but the table at lines 157–163 lists instrument/experiment/benchmark/**profile** (no `rca` row) — the section prose and its own table disagree with each other, and line 169 repeats the `rca` framing again. This is the same `rca`-vs-`profile` mix-up already flagged on `glossary.html:103`, but round 1 missed that it also exists here, on a page it explicitly marked "consistent with current behavior."

**E5 — Thirteen CHANGELOG v9.89–v9.121 features confirmed absent from every page on the site (grep came up empty for all of them, checked one by one):**

| # | Feature | Shipped | Belongs on |
|---|---|---|---|
| 1 | `planned` branch-liveness state (distinct from no-badge/merged/branch-gone) | v9.111.0 | `explanation/branch-strategy.html` liveness table |
| 2 | `skipped-not-git` reconcile action (silent no-op for non-git repos) | v9.112.0 | `tips/faq.html` or `reference/serve.html` |
| 3 | Adaptive question-count / shape floor+extension rule (20 = floor) | v9.109.0 | `reference/wf.html` shape section |
| 4 | `SDLC_HOOK_DEBUG=1` opt-in Codex hook-payload capture | v9.109.0 | `reference/hooks.html` |
| 5 | Codex `allow_implicit_invocation` visibility fix (`$wf` was invisible) | v9.109.0 | `reference/skills.html` |
| 6 | Dashboard `⎇ <branch>` grouping + readiness chip for batch-shippable branches | v9.106.0 | `reference/serve.html` dashboard section |
| 7 | `solution` and `ship-rollback` artifact types (+ renderers) | v9.103.0 | `reference/types.html`, `reference/artifacts.html` |
| 8 | `/wf yolo` driving `update-deps` (with its precondition) | v9.114.0 | `reference/wf.html` yolo section |
| 9 | `update-deps` mandatory changelog citation (`changelog-source`/`changelog-read-through` fields) | v9.115.0 | `reference/wf.html`, `00-index-schema.html` |
| 10 | Verify regression-test mandate + `regression-tests-added` field | v9.99.0 | `reference/wf.html` verify section |
| 11 | Review `pre-existing: true|false` field + "Pre-existing Debt" bucket | v9.99.0 | `reference/review.html` |
| 12 | YAGNI build-avoidance ladder + `sdlc-debt:` markers (shape/plan/implement/simplify) | v9.90/91.0 | `reference/wf.html` or a new explanation page |
| 13 | Narrative `## The <Stage>` prose section in every artifact | v9.92.0 | `reference/artifacts.html` |
| 14 | `provenance: adopted` schema field | v9.118.0 | `reference/00-index-schema.html` |
| 15 | Auto-seeded `.ai/.gitignore` at hub registration | v9.113.0 | `tutorials/installation.html` |

**E6 — Doc-site self-maintenance rot (a new angle round 1 didn't check at all):**
- `docs/site/README.md:55` says the sidebar is inlined into "42 generated pages" — the actual `_build_pages.py` handles 26 (21 `PAGES.append` calls + 5 `_EXTERNAL_PAGES`), and the site has 51 `.html` files total today. All three numbers disagree.
- `docs/site/_apply_orphans.py:8` and `docs/site/_apply_rewrites.py:8` hardcode a session-specific Claude Code temp path (`C:\Users\jayte\AppData\Local\Temp\claude\...\wf4eaegup.output`) that won't exist on any other machine or after that session ended — both scripts are non-functional as committed, and neither `README.md` nor `explanation/build-and-dist.html` documents what they were for or that they're safe to delete.
- `docs/site/.ai/_view/` isn't covered by the root `.gitignore`'s `.ai/_view/` rule, because that rule is root-relative (leading context in a gitignore without a wildcard anchors it to repo root) and only matches `<repo-root>/.ai/_view/`, not the nested `plugins/sdlc-workflow/docs/site/.ai/_view/`. Only the `*.log` rule happens to catch the one file currently there (`.bootstrap.log`); any non-`.log` render output would show up as untracked.

## Updated suggested fix order

Items 1–5 from round 1 stand. Adding, in rough priority order:

6. **`reference/glossary.html`** — add `id=` attributes to every `<dt>`; this silently breaks 17 links elsewhere and is a pure one-file fix.
7. **`docs/site/sunflower-view.md`** — fix the four factual errors (dead CI path, dead plan link, nonexistent `--path` flag, artifact-count mismatch with hooks.html).
8. **Reconcile `explanation/augmentations-model.html`** with `reference/glossary.html` — both have the same `rca`/`profile` mix-up; fix once, apply to both.
9. **Doc-site hygiene** — delete or fix the two session-bound `_apply_*.py` scripts, correct the page count in `README.md`, add a `docs/site/.gitignore` (or fix the root rule) for `.ai/_view/`.
10. **The 15 CHANGELOG gaps in E5** — lower urgency than A–D since these are additive gaps (nothing is actively wrong), but they're real coverage holes worth working through as a batch.

## Suggested fix order

1. **Sidebar nav block** (shared across all pages) — drop or clearly mark retired the `wf-quick`/`wf-design`/`review` reference links; this alone removes the most repeated wrong signal.
2. **`reference/wf.html`** — rebuild the dispatch table from `SKILL.md`'s current 20-key list (add `yolo`, drop the 4 augmentation keys and their detail sections, fix arg signatures to show `pr#N`/branch batch forms).
3. **`whats-new.html`** — backfill v9.89.0 → v9.121.0 from `CHANGELOG.md`; this is the page most other agents cross-checked against and is the most consequential gap.
4. **Schema reference pages** (`00-index`, `08-handoff`, `09-ship-run`) — add the missing fields table-by-table from `tests/frontmatter.schema.json`; these are the highest-precision, lowest-effort fixes since the schema is machine-readable ground truth.
5. **Everything else** in section B/C as a sweep, since most are one or two lines each.

Given the size (30+ discrete findings across ~35 files), this is a good candidate for the same batch-fix treatment the 2026-06-20 audit used.

---

## Verification pass (2026-07-12, same day)

Every claim in sections A–D was independently re-checked in a second pass by agents instructed to distrust the citations and re-read the actual files. Outcome: the large majority of findings held up exactly as stated. Four issues were caught and corrected in place above:

1. **`reference/wf.html:159-162`** cited as containing augmentation-key content — those lines are actually a `<hr>` section break. The real TOC reference is line 113. Fixed in section A.
2. **`reference/skills.html`** was wrongly listed as missing `diataxis` coverage — it documents the skill correctly at line 136. The real gap is only in `tutorials/installation.html`. Fixed in section B.
3. **`tips/faq.html`**'s git-optionality claim was overstated as "no longer true" — Step 0.7 has a sanctioned continue-without-git path, so the FAQ isn't flatly wrong, just incomplete about the new mandatory prompt. Softened in section B.
4. **`reference/hooks.html`** was double-counted as missing leak-guard coverage in section B when it already documents both guards; the only real problem (the "five" vs "seven" lede) was already captured in section C. Removed the redundant claim from section B.
5. **`reference/commands.html`** line citation for "21 sub-commands" was off by two lines (124 → 122). Fixed in section C.
6. **Section D**'s framing of `design-brief` → `design-contract` as a simple rename understated the gap — `design-contract` is a distinct missing entry, not a renamed one. Fixed.
7. The headline's retirement count was ambiguous between "5" and "9" depending on how the augmentation-key group was read. Reworded to "six retirement events (five named + one group)."

Everything else — the sidebar nav drift, the `use-design.html` self-contradiction, `whats-new.html`'s v9.88.0 ceiling, all schema-field gaps (ship-plan-readiness, batch handoff/ship fields, revisions ledger, steering-honored), the tray/serve/review internals gaps, the Grok/Cursor normalization gap, and the `sync:codex`/`hooks:install` build-doc gaps — were independently confirmed against the actual files and stand as originally reported.
