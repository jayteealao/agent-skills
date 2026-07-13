# Doc-site drift audit — 2026-07-13

Scope: `docs/site/**` (all 51 HTML pages + nav) audited against source at `v9.132.0` (package.json). Follow-up to [archived/DOC-SITE-DRIFT-AUDIT-2026-07-12.md](archived/DOC-SITE-DRIFT-AUDIT-2026-07-12.md), which reconciled the site to `v9.121.0` and shipped as v9.122.0 (plus v9.123.0 for the `/review`→`/wf review` reframe). Since then, **nine releases (v9.124.0 → v9.132.0)** shipped without a matching doc-site pass: the `/wf ship-plan audit` sub-command, the memory-seed kernel, the full intent-fidelity program (RIM ledger, charter, decision taxonomy, evidence rungs, the intent-fidelity review dimension), and the `/wf observability` router.

Six parallel read-only audits (one per doc cluster) compared every page's prose against current `skills/wf/SKILL.md`, `skills/wf/reference/**`, `tests/frontmatter.schema.json`, `hooks/**`, `scripts/build.mjs`, and `CHANGELOG.md`. Findings below are grouped by theme, not by which agent found them. The brand version is correctly stamped `v9.132.0` on all 51 pages — the drift is entirely in page *bodies*.

*Note on this report's own accuracy: every finding was re-verified against the actual doc and source files. Four spot-check hypotheses were **refuted** in verification (see "Refuted / cleared" at the end) — including two that the prior audit or this audit's own brief got wrong. The most consequential correction: there are **eight** hooks, not seven (the brief said seven); a separate `seed-memory` SessionStart hook was added in v9.125.0 and both `hooks.html` and `build-and-dist.html` still say "seven".*

---

## Headline

Two dominant root causes, both the same shape as last time — **a new command surface the site never learned, and a changelog page that stopped updating.**

1. **The `/wf observability` router (v9.132.0) is invisible to the site, and worse, the site actively teaches the opposite.** Observability was previously "an augmentation `shape` decides, never a key you type." v9.132.0 made it the **21st key** — a project-level `init`/`build`/`audit` router — and dissolved the old `setup-wide-logging` command into `/wf observability build`. But five pages still assert observability is "**not** a key" ([wf.html:96](../site/reference/wf.html) & [:561](../site/reference/wf.html), [skills.html:107](../site/reference/skills.html), [mental-model.html:110](../site/orientation/mental-model.html), [augmentations-model.html](../site/explanation/augmentations-model.html)), four pages still count "**20 keys**", and no page documents the router at all.

2. **`whats-new.html`'s body stops at v9.123.0 while its brand says v9.132.0** — missing all nine releases including the entire intent-fidelity program. Identical failure to the last audit (which found the body frozen at v9.88 under a v9.121 brand). Root cause is structural: the brand is sed-stamped by the version bump; the body is hand-maintained and nobody wrote the entries.

Two counts drifted site-wide as a side effect of the intent-fidelity program: **review dimensions moved 33 → 34** (the new `intent-fidelity` dimension) and **hooks moved 7 → 8** (the new `seed-memory` hook). Both are wrong on every page that states the number.

---

## A. The observability-router blind spot (new root cause, cross-cutting)

`/wf observability` is a router key (`init` inventories + authors `.ai/observability.md`; `build` realizes it; `audit` writes `.ai/observability-audit.md`). Authoritative: `skills/wf/SKILL.md:20` ("21 known keys"), `:58` (the observability row), `:71` (`setup-wide-logging` → `/wf observability build`).

**"20 keys" → 21, and observability wrongly excluded:**

| Page:line | Stale claim | Fix |
|---|---|---|
| [reference/wf.html:96](../site/reference/wf.html) | "20 keys… 2 routers (`ship-plan`, `docs`)" | "21 keys… 3 routers (`ship-plan`, `docs`, `observability`)" |
| [reference/wf.html:98](../site/reference/wf.html) | "router (`ship-plan`/`docs`) keys have their own pages" | add `observability` |
| [reference/wf.html:561](../site/reference/wf.html) | "**Observability**… flag-gated rollout, and performance work… are **not** `/wf` keys" | drop *observability* from the not-a-key claim; the `instrument`/`experiment`/`benchmark`/`profile` augmentations remain correct — distinguish the slice-scoped `instrument` augmentation from the project-scoped `/wf observability` router |
| [reference/skills.html:107](../site/reference/skills.html) | "20 keys… (observability/perf work rides the stages as shape-decided augmentations, **not keys**)" | "21 keys… `ship-plan`, `docs` & `observability` routers"; the parenthetical is now false for observability |
| [orientation/mental-model.html:110](../site/orientation/mental-model.html) | "20 keys… routers `ship-plan`, `docs`" + "Observability… not keys you type" | "21 keys" + add observability router; reword the not-a-key line to spare the `/wf observability` router |

**Router/sub-command coverage missing:**

- [reference/commands.html:98 & :117](../site/reference/commands.html) — the router prose and "navigation & lifecycle keys" table enumerate `ship-plan`/`docs` but omit the `observability` router → add it.
- [reference/commands.html:201](../site/reference/commands.html) — `/wf ship-plan` args shown as `init | build | edit` → add `audit` (v9.124.0, writes `.ai/ship-plan-audit.md`).
- [explanation/augmentations-model.html:116-117 / :160](../site/explanation/augmentations-model.html) — presents the `instrument` add-on as the sole framing for observability work → cross-reference `/wf observability` so readers see the per-workflow augmentation and the project-wide router as distinct paths.
- [how-to/use-augmentations.html:95-96, :112-120](../site/how-to/use-augmentations.html) — teaches `instrument` as the way to "add observability" with no pointer to the project-wide router → add a one-line distinction.
- [how-to/choose-a-command.html](../site/how-to/choose-a-command.html) (whole page) — the primary "which command do I type" page has **no** observability row → add "Set up structured logging/telemetry for this repo → `/wf observability init`".
- [reference/artifacts.html:102-151](../site/reference/artifacts.html) — the `.ai/` file tree omits `.ai/observability.md`, `.ai/observability-audit.md`, and `.ai/ship-plan-audit.md` → add rows.

---

## B. `whats-new.html` — body frozen at v9.123.0 (headline)

- [whats-new.html:97](../site/whats-new.html) — lede says "highlights… up to **v9.123**"; brand (line 17) is **v9.132.0**.
- [whats-new.html:100](../site/whats-new.html) — latest `<h2>` entry is **v9.123.0**; entries for **v9.124.0 → v9.132.0 are entirely absent** (verified against `CHANGELOG.md:10-116`). Nine entries to add, newest-first:
  - **v9.132.0** — `/wf observability` router (init/build/audit; 21st key; `setup-wide-logging` dissolved)
  - **v9.131.0** — the meta-loop / global `.ai/solutions/` corpus (INTENT-FIDELITY R5, final)
  - **v9.130.0** — charter, scenario harness, yolo fidelity checkpoints (R4)
  - **v9.129.0** — decision taxonomy + the intent-fidelity review dimension (the 34th) (R3)
  - **v9.128.0** — evidence-quality gates: evidence-rung labelling + mock-evidence hard-block (R2 ∪ YOLO F4/F5)
  - **v9.127.0** — intent-fidelity spine / RIM ledger (R1)
  - **v9.126.0** — YOLO evidence integrity Phase 1 (probe receipts, prior-deferral re-challenge, stage-scope clamp)
  - **v9.125.0** — memory-seed kernel (SessionStart seeds a versioned `/wf` rules fence into AGENTS.md + `@AGENTS.md` import into CLAUDE.md)
  - **v9.124.0** — `/wf ship-plan audit` (read-only soundness audit, 7-lens fan-out, accumulating ledger)

---

## C. Review dimension count 33 → 34 (site-wide)

Ground truth: `skills/wf/reference/review/` holds **34** dimension rubric files — the 33 previously listed plus `intent-fidelity.md` (v9.129, an always-on dimension per `review/_stage.md:199`, ad-hoc reachable via `/wf review intent-fidelity`). Every hard "33" is stale:

- [reference/review.html](../site/reference/review.html): lines **6, 94, 105, 115, 147, 159** all say "33"; **:163-226** the categorized dimension list omits `intent-fidelity` entirely → add it (the one dimension checking code→intake traceability: does the diff advance the intake's product, or a simplified imitation?).
- [reference/commands.html:132 & :221](../site/reference/commands.html) — "33 dimensions" → 34.
- [reference/skills.html:108](../site/reference/skills.html) — "33 review dimensions" → 34.
- [reference/glossary.html:160](../site/reference/glossary.html) — "33 dimensions" → 34.
- [reference/wf.html:404 & :413](../site/reference/wf.html) — "33 review dimensions" → 34.
- [orientation/mental-model.html:135](../site/orientation/mental-model.html) — "33-dimension code review" → 34.
- [tutorials/first-workflow.html:281](../site/tutorials/first-workflow.html) — "33 review dimensions" → 34.
- [how-to/choose-a-command.html:223](../site/how-to/choose-a-command.html) — "full 33-dimension review" → 34; **:220** — "…and 27 more" (6+27=33) → "and 28 more" (6+28=34).

---

## D. Hook count 7 → 8 (site-wide)

Ground truth: `scripts/build.mjs:56-65` `HOOK_ENTRIES` has **8** entries; `hooks/hooks.json:9,14` wires **two** SessionStart commands — `session-start-orient.mjs` **and** a separate `seed-memory.mjs` (v9.125.0, MEMORY-SEED-PLAN; logic in `lib/memory-seed.mjs`). `session-start-orient` contains no seed logic. The memory-seed behavior is documented on *no* page.

- [reference/hooks.html:96, :124, :139](../site/reference/hooks.html) — "seven hooks" → **eight**.
- [reference/hooks.html:109](../site/reference/hooks.html) — "the other **three** hooks handle automation" → four (seed-memory is a fourth non-guard automation hook).
- [reference/hooks.html:126-137](../site/reference/hooks.html) — the at-a-glance table has 7 rows; add a `seed-memory` row (SessionStart; timeout **10s** per hooks.json; Blocks? No).
- [reference/hooks.html:114 & :183](../site/reference/hooks.html) — document the seed-memory behavior: seeds a versioned fenced `/wf` rules block into `AGENTS.md` + an `@AGENTS.md` import into `CLAUDE.md`, gated on `.ai/workflows/` presence, opt-out `memory.seedRules`.
- [reference/hooks.html:217-230](../site/reference/hooks.html) — the `hooks/` and `dist/` file-layout trees omit `seed-memory.mjs` → add to both.
- [explanation/build-and-dist.html:106](../site/explanation/build-and-dist.html) — "The **seven** hooks: …" enumerates 7 and omits `seed-memory` → "eight", add `seed-memory`.

---

## E. Schema pages missing intent-fidelity fields

The intent-fidelity program added several `indexFrontmatter` fields (`tests/frontmatter.schema.json`, lines 97-301) absent from the schema reference pages.

- [reference/00-index-schema.html:130-141](../site/reference/00-index-schema.html) (Optional fields) — missing:
  - `charter` — the intake's 3–7 falsifiable positive commitments (`{id, commitment, source, status: honored|at-risk|broken}`, schema:240), W8.1; absent on compressed lifecycles.
  - `intent-risks` — the RIM ledger (`{id, risk, severity, status: open|adjudicated|carried, adjudicated-by, decision, po-ratified}`), W1; shape must adjudicate every open entry; handoff/ship hard-block on `status: open`.
  - `evidence-quality` — slug-level evidence-rung rollup (rung → count), W9.1 + YOLO F5.
  - `unproven-integrations` — array (`{name, introduced-by, first-light}`), W5.2; dependent ACs cap at partial while `first-light` is null.
  - `steering-honored` — base field (v9.120; documented on the handoff/ship-run pages but not here).
- [reference/00-index-schema.html:143-151](../site/reference/00-index-schema.html) — the documented `runtime-evidence-deferrals` item shape (`slice`, `reason`, `deferred-at`, `cleared-by`) is stale: source (schema:197-238) also defines `cleared-acs`, `absorbed-by`, `needed-by`, `probe`, and `ship-override-authorization{by,at,reason}` (W5.3/W9.2, YOLO F1/F2). The "v9.14" badge is stale too.
- [reference/08-handoff-schema.html:177-189](../site/reference/08-handoff-schema.html) — the `readiness-verdict: ready` conditions omit the intent-risk gate. `handoff.md:73` adds an all-modes gate: any `intent-risks` entry with `status: open` in `00-index.md` forces not-ready (route to `/wf shape <slug>`); `carried` RIMs are legal but must surface in the PR body → add to the gating description.

---

## F. Smaller precision findings (single-page)

- [reference/commands.html:159-162](../site/reference/commands.html) — rows for `/wf instrument`, `/wf experiment`, `/wf benchmark`, `/wf profile` are framed as **invocable commands** (args `<slug> [slice]`), directly contradicting [wf.html:561](../site/reference/wf.html) ("you never type `/wf instrument`") and `SKILL.md:70` (augmentations, not keys). Recast as shape-decided augmentations applied by plan/implement/verify. *(Residual from the prior audit's Section A — not fully cured in v9.122.0.)*
- [how-to/resume-paused-work.html:116](../site/how-to/resume-paused-work.html) — example `/wf status` output shows `3·design`; stage 3 is **`slice`** (`design` is a standalone key, not a numbered stage) → `3·slice`.
- [how-to/close-workflows.html:172-174 & :164-166](../site/how-to/close-workflows.html) — "Skip one **stage**" → the command is **slice**-scoped (`SKILL.md:55`) → relabel "Skip one slice" and fix the effect wording.
- [how-to/choose-a-command.html:170](../site/how-to/choose-a-command.html) — "Audit CI/CD against the ship plan → `/wf ship-plan build`" conflates *build* (brings repo into compliance) with *audit* (read-only soundness) → relabel the build row and add a `/wf ship-plan audit` row.
- [how-to/choose-a-command.html:104-155](../site/how-to/choose-a-command.html) & [how-to/start-workflow.html:111-201](../site/how-to/start-workflow.html) — intake-mode coverage omits `adopt` (and start-workflow also omits `ideate`) of the 9 modes → add.
- [tutorials/installation.html:133](../site/tutorials/installation.html) — verify-install skill list ("`wf`, `consult`, `imagery`, `uiproto`") omits `diataxis` (v9.113) and `study-sources` (v9.116) → add. (Correctly omits the retired `setup-wide-logging`.)
- [reference/tray.html:149](../site/reference/tray.html) — documents live-process heal (v9.81) + heartbeat (v9.89) but omits the **v9.111 display-truth wedge recovery** (helper respawn on `iconState` transition + initial-probe retry, for a menu showing "hub down" while the hub is healthy) → add a `v9.111` clause.
- [explanation/build-and-dist.html:114](../site/explanation/build-and-dist.html) — rebuild-trigger dir list omits `package.json` (a version/dep change must rebuild `dist/` in the same commit) → add.
- **Low / optional:** [reference/ship-plan-schema.html:96 & :99](../site/reference/ship-plan-schema.html) and [how-to/run-a-release.html](../site/how-to/run-a-release.html) — mention `/wf ship-plan audit` alongside init/build/edit (no schema-field impact; completeness only).

---

## G. Ground-truth inconsistencies (source, not doc-site — fix alongside)

- `skills/wf/reference/review.md:55` — the ad-hoc **Dimension keys** list omits `intent-fidelity` (lists 33); `:62` the `all` aggregate says "every dimension (**~33** sub-agents)". The `intent-fidelity.md` rubric exists and `_stage.md` treats it as first-class always-on → the source prose is itself stale at 33/~33. **Fix source with the doc so the count reconciles to 34** (otherwise a doc fix to "34" will look unfounded next to the reference).
- The observability router emits `type: observability-plan` (`reference/observability/init.md:293`) and `type: observability-build` (`reference/observability/build.md:239`) frontmatter, but **neither type exists in `tests/frontmatter.schema.json`'s type consts** (nor, correctly, in `reference/types.html`). Like `ship-plan`, these are project-level `.ai/` artifacts that arguably should be schema-validated. This is a schema gap, not a doc-site omission — but it's why the tempting "types.html is missing an `observability` type" finding is **wrong** (see Refuted).

---

## Refuted / cleared (spot-check hypotheses that failed verification)

- **`nav.html` links to `wf-quick.html` / `wf-design.html` (retired routers) = drift** — **refuted.** Both pages open by self-declaring the standalone router retired and teach only live surfaces; nav labels them neutrally ("↳ Quick & standalone", "↳ /wf design"), so no retired *command* is presented as live. No delink needed.
- **`faq.html` says "works without git" and is now false** — **refuted.** The answer accurately describes the v9.110 `git rev-parse` hard-check *with* the sanctioned continue-without-git path (`skipped-not-git`, v9.112). Correct and current.
- **`types.html` / `artifacts.html:163` omit an `observability` and `charter` artifact type** — **refuted.** The schema has no such `type` consts: `charter` is an intake *frontmatter field* (schema:240), and the observability router emits `observability-plan`/`observability-build` types absent from the schema entirely (see Section G). The valid finding is the `artifacts.html` **file-tree** addition (Section A), not a type-enum row.
- **Hooks = 7** (this audit's own brief) — **overturned.** There are **8** (Section D); `build-and-dist.html`'s "seven" was consequently mis-cleared on first pass and is a real finding.

---

## Pages audited with no findings

`reference/pipeline.html`, `reference/serve.html`, `reference/09-ship-run-schema.html`, `index.html`, `nav.html`; `how-to/author-ship-plan.html` (already covers `ship-plan audit` + the 7 audit lenses correctly), `how-to/navigate-workflows.html`, `how-to/triage-pr-comments.html`, `how-to/use-design.html` (explicitly states "there is no `craft` command"), `how-to/amend-or-extend.html`; `tutorials/quick-fix-workflow.html`; `tips/faq.html`, `tips/anti-patterns.html`, `tips/escape-hatches.html`, `tips/tricks.html`; `orientation/first-10-minutes.html`, `orientation/is-this-for-me.html`; and the philosophy explanation pages `adaptive-routing.html`, `artifacts-over-memory.html`, `branch-strategy.html`, `diataxis-integration.html`, `idempotency-in-ship.html`, `orchestrator-discipline.html`, `the-readiness-gate.html`, `why-this-exists.html` (intent-fidelity concepts are absent from these, but each is a single-topic piece whose scope does not demand them).

---

## Fix mechanics (for whoever applies this)

- **Generated pages.** `docs/site/_build_pages.py` is a one-shot generator that overwrites most pages and owns the shared sidebar nav template (incl. the brand line and the `wf-quick`/`wf-design` links at `_build_pages.py:72-73`). Any fix to a generated page must land in **both** the `.html` and `_build_pages.py`, or the next `python _build_pages.py` run reverts it. **Do not** run `_build_pages.py` blind — check per-page whether a page is in its `PAGES` list or hand-maintained (the header comment at `_build_pages.py:12` explains the opt-out).
- **Shipping template/count changes** requires a version bump (render version-gate); a doc-only reconciliation historically ships as its own patch release (cf. v9.122.0). The brand seds will re-stamp automatically.
- **Reconcile source first for Section C & G**: fix `review.md`'s dimension list/count to 34 in the same change as the doc pages, so the numbers agree.
