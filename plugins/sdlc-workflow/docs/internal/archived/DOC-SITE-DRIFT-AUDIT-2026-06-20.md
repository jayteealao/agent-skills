# SDLC doc-site drift audit — 2026-06-20

**Scope:** every page under `plugins/sdlc-workflow/docs/site/` (52 pages) audited against the actual implementation (skills, references, scripts, lib, hooks, schemas), plus the `sdlc-workflow-codex` skills/references/served-docs. Plugin version at audit: **v9.88.0** (branch `feat/sdlc-compressed-lifecycle`).

**Method:** multi-agent workflow — 7 ground-truth readers (136 facts from disk) -> 1 auditor per page -> adversarial verifier per blocker/major finding (default-to-refute). 167 agents total.

**Inheritance note:** `docs/site` is copied **verbatim** into the codex package (it is in `PAYLOAD_DIRS`), so every Claude doc-site finding below is inherited byte-for-byte by the codex served docs. Fix once at the Claude source, then `npm run sync:codex`.

## Tally (after adversarial verification; 0 of 105 blocker/major findings refuted)

| Severity | Count |
|---|---|
| Blocker (copy-paste breaks / wrong fact a user acts on) | 25 |
| Major (materially stale) | 62 |
| Minor (imprecise/incomplete) | 78 |
| Nit (cosmetic) | 9 |
| **Total page findings** | **174** |

Pages with >=1 finding: **51 of 52**. Only clean page: `reference/tray.html`.
Plus **17 codex-parity findings** (1 blocker, 8 major) — see end.

## BLOCKER findings (25)

### `how-to/close-workflows.html`

- **Claim** (Summary table, Pre-conditions row): You can list all open slugs with <code>/wf-meta list</code>.
  - **Reality:** There is no `list` sub-command in /wf-meta. The 12 known keys are: next, status, resume, sync, amend, extend, skip, close, how, announce, init-ship-plan, build-pipeline. To list all workflows with their stages and status, the correct command is `/wf-meta status` (invoked with no slug argument it runs in dashboard mode across all workflows).
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/SKILL.md line 21 (12 known keys); plugins/sdlc-workflow/skills/wf-meta/reference/status.md line 2 and line 34`
  - **Fix:** Replace `/wf-meta list` with `/wf-meta status` in the Pre-conditions row.
  - _verified, confidence 0.98_

- **Claim** (Sections: I shipped it already; I am abandoning it; I am pausing it indefinitely): Use <code>/wf-meta close shipped add-dark-mode</code> ... <code>/wf-meta close abandoned &lt;slug&gt;</code> ... <code>/wf-meta close superseded &lt;slug&gt;</code> ... <code>/wf-meta close stuck add-dark-mode</code>
  - **Reality:** The five valid close reasons are: `cancelled`, `superseded`, `deferred`, `completed-externally`, `merged-into`. None of `shipped`, `abandoned`, or `stuck` are valid close-reason values. The argument hint from close.md is `<slug> [cancelled|superseded|deferred|completed-externally|merged-into]`. A user copying these example commands would supply an invalid reason and the plugin would prompt them to pick one of the real five options.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/close.md lines 26-30 (close reasons table) and line 3 (argument-hint frontmatter)`
  - **Fix:** Replace all example commands and reason names throughout the page: `shipped` → `completed-externally`, `abandoned` → `cancelled`, `stuck` → `deferred`. Update the 'Technical details — what 99-close.md contains' bullet list from `shipped, abandoned, superseded, archived, stuck` to `cancelled, superseded, deferred, completed-externally, merged-into`. Update section headings and prose to match.
  - _verified, confidence 0.97_

- **Claim** (Section: I am abandoning it — Output (truncated) code block): Wrote: .workflow/add-dark-mode/99-close.md
  - **Reality:** Workflow artifacts are stored under `.ai/workflows/<slug>/`, not `.workflow/<slug>/`. The correct path is `.ai/workflows/add-dark-mode/99-close.md`. This is confirmed by close.md line 176 ('Close record: .ai/workflows/<slug>/99-close.md') and the plugin's entire artifact storage convention.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/close.md line 176`
  - **Fix:** Change `.workflow/add-dark-mode/99-close.md` to `.ai/workflows/add-dark-mode/99-close.md` in the output example.
  - _verified, confidence 0.98_

- **Claim** (Section: Close vs. skip — they are different things, comparison table): <code>/wf-meta skip &lt;stage&gt; &lt;slug&gt;</code>
  - **Reality:** The actual argument order for `/wf-meta skip` is `<slug> <stage> [reason]` — slug comes first, then the stage name. The skip.md reference frontmatter argument-hint is `<slug> <stage> [reason]` and Step 0 Parse confirms 'First argument: slug'. A user following this table would reverse the arguments.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/skip.md line 3 (argument-hint: <slug> <stage> [reason]) and line 57 (First argument: slug)`
  - **Fix:** Change `/wf-meta skip <stage> <slug>` to `/wf-meta skip <slug> <stage>` in the comparison table.
  - _verified, confidence 0.97_

### `how-to/use-augmentations.html`

- **Claim** (h2 'Benchmark — record a perf baseline before you change anything'): /wf benchmark auth-refactor login-slice
  - **Reality:** benchmark takes `<slug> [baseline|compare]` as its arguments — the optional second arg is the mode keyword (`baseline` or `compare`), never a slice name. The invocation `/wf benchmark auth-refactor login-slice` would pass `login-slice` as the mode argument, which matches neither `baseline` nor `compare`. The benchmark reference auto-detects mode when no second arg is given, so the correct command for an unambiguous baseline is `/wf benchmark auth-refactor baseline` (or just `/wf benchmark auth-refactor` to auto-detect).
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/benchmark.md lines 35-37 ('Usage: /wf benchmark <slug> — auto-detect; /wf benchmark <slug> baseline; /wf benchmark <slug> compare'); plugins/sdlc-workflow/skills/wf/SKILL.md dispatch table row for benchmark ('<slug> [baseline|compare]')`
  - **Fix:** Change the example to `/wf benchmark auth-refactor` (auto-detect, recommended) and add a note that passing `baseline` or `compare` as the second arg forces the mode — e.g. `/wf benchmark auth-refactor baseline`. Remove the slice-name second argument entirely.
  - _verified, confidence 0.97_

### `orientation/first-10-minutes.html`

- **Claim** (Summary table row: 'What you'll produce'): Two artifact files and a commit. Takes about 10 minutes end-to-end.
  - **Reality:** /wf intake fix produces FIVE files in one pass: 01-fix.md (type: intake), 02-shape.md (type: shape), 03-slice.md (type: slice-index), 04-plan.md (type: plan), and 00-index.md (type: index). The compressed lifecycle does not skip stages — it is explicitly 'single-pass/lightweight but present' for each stage.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md Produces row: '01-fix.md (type: intake), 02-shape.md, 03-slice.md (type: slice-index, one slice), 04-plan.md, and a conformant 00-index.md (type: index)'; plugins/sdlc-workflow/skills/wf/reference/intake/_intake-context.md lines 66-69`
  - **Fix:** Change 'Two artifact files and a commit' to 'Five planning artifact files' in the summary table. Update the artifact file tree shown after Step 1 to include 02-shape.md, 03-slice.md, and 04-plan.md alongside 00-index.md and 01-fix.md.
  - _verified, confidence 0.97_

- **Claim** (Step 1 — Start the workflow (30 seconds), code block showing artifact tree): .ai/workflows/typo-invalid-payload-error-message/ 00-index.md ← registry entry (slug, type, branch, status) 01-fix.md ← the compressed brief: what's broken, what the fix is, acceptance criteria
  - **Reality:** After /wf intake fix completes, the workflow folder contains five files: 00-index.md, 01-fix.md, 02-shape.md, 03-slice.md, and 04-plan.md. The intake mode authors all four planning artifacts (intake → shape → slice → plan) in a single pass before gating, then routes to /wf implement.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md Produces row and Pipeline line: '01-fix(intake) → 02-shape → 03-slice → 04-plan → [gate] → /wf implement'`
  - **Fix:** Expand the shown artifact tree to include 02-shape.md, 03-slice.md, and 04-plan.md with accurate one-line descriptions. Update the accompanying prose to describe all five files.
  - _verified, confidence 0.95_

- **Claim** (Step 1 — Start the workflow (30 seconds), paragraph after artifact tree): 01-fix.md combines what the full pipeline would split into a shape document and a plan document — compressed because the scope is small enough that one file carries both.
  - **Reality:** 01-fix.md is solely the intake brief (type: intake) — it carries the restated request, acceptance criteria, assumptions, and open questions. The fix mode produces a real, separate 02-shape.md (in-scope / out-of-scope), a real 03-slice.md (slice-index with one slice), and a real 04-plan.md (implementation steps). The _intake-context.md explicitly states 'no stage is skipped' and the mode is a 'compressed standard lifecycle'.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md lines 70-89 (01-fix.md body spec) and lines 91-165 (separate 02-shape.md and 04-plan.md templates); plugins/sdlc-workflow/skills/wf/reference/intake/_intake-context.md lines 49-69`
  - **Fix:** Replace this sentence with an accurate description: 01-fix.md is the intake brief (restated request, acceptance criteria, assumptions). Separate 02-shape.md, 03-slice.md, and 04-plan.md carry shape scope, the slice roster, and the implementation plan respectively — each is lightweight but present.
  - _verified, confidence 0.97_

### `orientation/mental-model.html`

- **Claim** (h2#the-dashboard (section 'The dashboard', line 186)): Run `npm run serve` from the plugin root to start it, then open `http://localhost:4173`.
  - **Reality:** There is no `npm run serve` script in package.json. The correct command to start the multi-repo hub daemon is `npm run hub` (maps to `node scripts/hub-serve.mjs`). A user who types `npm run serve` will get an npm error.
  - **Source:** `plugins/sdlc-workflow/package.json (scripts block — no 'serve' key; 'hub' key present at line 28)`
  - **Fix:** Replace `npm run serve` with `npm run hub`.
  - _verified, confidence 0.98_

### `reference/00-index-schema.html`

- **Claim** (Required fields table, row for 'status'): <code>active</code> / <code>complete</code> / <code>blocked</code> / <code>abandoned</code>
  - **Reality:** The schema enum for the index 'status' field is exactly ["active", "complete", "closed"]. Neither 'blocked' nor 'abandoned' are valid values. A write hook that validates against this schema will reject a 00-index.md containing status: blocked or status: abandoned.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json line 87: "status": { "enum": ["active", "complete", "closed"] }`
  - **Fix:** Change the enum display to: active / complete / closed. Remove 'blocked' and 'abandoned' entirely.
  - _verified, confidence 0.98_

### `reference/commands.html`

- **Claim** (h2 '/wf — the lifecycle command' table): The /wf sub-command table lists only: intake, shape, slice, plan, implement, verify, review, handoff, ship, retro, instrument, experiment, benchmark, profile, probe, simplify — 16 rows total. /wf auto is not listed anywhere on the page.
  - **Reality:** /wf auto is the 18th top-level key added in v9.88.0. It is the end-to-end lifecycle driver: '/wf auto <slug>' drives every slice then the final review and stops before handoff; '/wf auto <slug> <slice>' drives one slice to completion then routes to the next. It is listed in SKILL.md line 40 and confirmed by reference/auto.md. A user consulting this page has no way to discover /wf auto exists.
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md line 40 (auto key dispatch table row); plugins/sdlc-workflow/skills/wf/reference/auto.md`
  - **Fix:** Add a row to the /wf sub-command table: sub-command '/wf auto', args '<slug> [<slice>]', stage 'driver', notes 'End-to-end lifecycle driver. Drives every slice → final review and stops before handoff; with a slice arg it drives that one slice then routes to the next. Writes no artifact of its own; never opens a PR.'
  - _verified, confidence 0.98_

### `reference/glossary.html`

- **Claim** (Dashboard (Sunflower view) entry): Start with <code>npm run serve</code>; open <code>http://localhost:4173</code>.
  - **Reality:** There is no `npm run serve` script in package.json. The correct command to start the hub daemon is `npm run hub`. The scripts in package.json are: build, render, render:clean, hub, hub:upgrade, hub:stop, tray, test, verify, verify:docs, etc. — no `serve` entry exists.
  - **Source:** `plugins/sdlc-workflow/package.json (scripts block, no `serve` key); confirmed by scripts/hub-serve.mjs being the hub entrypoint`
  - **Fix:** Replace `npm run serve` with `npm run hub` in the Dashboard entry.
  - _verified, confidence 0.98_

### `reference/pipeline.html`

- **Claim** (Opening paragraph (line 100, before the I/O graph)): the Markdown workflow notes the plugin writes under <code>.ai/&lt;slug&gt;/</code>
  - **Reality:** Artifacts live under .ai/workflows/<slug>/ — the 'workflows' segment is not optional. Every reference file (handoff.md line 91: 'Store artifacts under `.ai/workflows/<slug>/`'), the session-start hook, and every skill file use this path. .ai/<slug>/ does not exist.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/handoff.md line 91; plugins/sdlc-workflow/hooks/session-start-orient.mjs`
  - **Fix:** Change both occurrences (.ai/<slug>/ on lines 100 and 249) to .ai/workflows/<slug>/
  - _verified, confidence 0.97_

- **Claim** (Technical details collapsible section, last paragraph (line 249)): Artifact files live under <code>.ai/&lt;slug&gt;/</code> in the repo root.
  - **Reality:** The correct path is .ai/workflows/<slug>/. This is the second occurrence of the same wrong path claim.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/handoff.md line 91; plugins/sdlc-workflow/skills/wf/SKILL.md`
  - **Fix:** Change to: 'Artifact files live under .ai/workflows/<slug>/ in the repo root.'
  - _verified, confidence 0.97_

### `reference/types.html`

- **Claim** (Design types table, design-augmentation type row, storage path column): augmentations/&lt;id&gt;.md
  - **Reality:** design-augmentation artifacts are written under design-notes/<sub-command>-<timestamp>.md inside the slug workflow folder (e.g. .ai/workflows/<slug>/design-notes/animate-20260101T1200Z.md). The pre-write-validate hook explicitly exempts the design-notes/ path from filename-convention checks precisely because these artifacts live there. The augmentations/<id>.md path belongs to the augmentation type (instrument/experiment/benchmark/rca nested layout), not to design-augmentation.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/design.md line 234 ('design-notes/<sub-command>-<timestamp>.md'); plugins/sdlc-workflow/hooks/pre-write-validate.mjs lines 97-100 (inDesignNotes check); plugins/sdlc-workflow/tests/frontmatter.schema.json lines 955-974 (designAugmentationFrontmatter)`
  - **Fix:** Change the storage path for design-augmentation from 'augmentations/<id>.md' to 'design-notes/<sub-command>-<timestamp>.md'.
  - _verified, confidence 0.97_

### `reference/wf-meta.html`

- **Claim** (#close — /wf-meta close <reason> [slug] summary table (Reasons row) and Reason semantics table): Reasons: shipped · abandoned · superseded · archived · stuck (and the table rows: shipped / abandoned / superseded / archived / stuck)
  - **Reality:** The five valid close reasons in the current implementation are: cancelled, superseded, deferred, completed-externally, merged-into. Only 'superseded' appears in both lists. Passing any of the four page-listed values (shipped, abandoned, archived, stuck) to /wf-meta close would be unrecognised by the skill.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/close.md lines 25-30 (Close reasons table) and frontmatter argument-hint: '<slug> [cancelled|superseded|deferred|completed-externally|merged-into]'`
  - **Fix:** Replace the Reasons row value with 'cancelled · superseded · deferred · completed-externally · merged-into' and rewrite the Reason semantics table to match: cancelled (no longer wanted), superseded (replaced by another approach or PR), deferred (valid but not now), completed-externally (done outside this workflow), merged-into (absorbed into a larger workflow or PR).
  - _verified, confidence 0.98_

### `reference/wf-quick.html`

- **Claim** (Section '/wf probe — runtime-truth verification', table rows 3 and 4): /wf probe <slug> --from <path> | Multi-target: each top-level bullet or line in the file is a separate target. /wf probe <slug> --strict <target> | Filter mode — only target-tied findings in the main list; incidentals archived separately.
  - **Reality:** The --from and --strict flags were stripped from probe in commit fb24987 ('refactor(sdlc-workflow): strip probe's --strict/--from/--adapter flags'). The current probe argument grammar is: (empty) = slug-wide sweep; <target> = focused probe. The probe.md reference file explicitly states at line 53: 'There are no flags — probe takes a slug and an optional target string.'
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/probe.md line 53; commit fb24987`
  - **Fix:** Remove the --from and --strict rows from the probe table. The table should have only two rows: (1) /wf probe <slug> → slug-wide sweep, and (2) /wf probe <slug> <target> → focused probe on target string.
  - _verified, confidence 0.97_

- **Claim** (Section 'The eight intake modes', fix row, 'What it compresses' column): Shape + plan merged into a single <code>01-fix.md</code>; routes to <code>/wf implement</code>.
  - **Reality:** Since v9.86.0 (compressed-lifecycle change), /wf intake fix is a STANDARD lifecycle that writes four separate planning artifacts: 01-fix.md (type: intake), 02-shape.md, 03-slice.md (type: slice-index), and 04-plan.md — plus 00-index.md. No stages are skipped or merged. The compression is in ceremony (single-pass, lightweight steps), not in artifact count.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md — Produces row and Pipeline section`
  - **Fix:** Update the fix row to: 'Full standard lifecycle with lightweight single-pass stages: writes 01-fix.md, 02-shape.md, 03-slice.md, 04-plan.md. Gates before implement; routes to /wf implement.' Remove the 'merged into a single' claim.
  - _verified, confidence 0.97_

### `tips/escape-hatches.html`

- **Claim** (Section: Need some trail but not the full flow?): For a hotfix where production is down and review must be skipped: /wf intake hotfix This bypasses the review stage by design. A hotfix artifact is still written so you have something to reference in a post-incident review.
  - **Reality:** Review is NOT bypassed or skipped in the hotfix mode. The hotfix pipeline explicitly includes the review stage: it runs '/wf review <slug> security' as a mandatory step, defaulting to the security rubric rather than omitting review. hotfix.md line 235 states: 'Review is not skipped — but for a hotfix it defaults to the security rubric (auth, tokens, crypto, permissions). /wf review <slug> security is always safe to run quickly; widen only if the change warrants it.' The pipeline shown in hotfix.md is: 01-hotfix → 02-shape → 03-slice → 04-plan → [gate] → /wf implement → /wf verify → /wf review security → /wf ship.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/hotfix.md lines 18 and 235`
  - **Fix:** Replace the claim. The hotfix mode does not bypass review — it narrows it to the security rubric. Change to: 'For a hotfix where production is down, review is scoped to the security rubric rather than a full review sweep: /wf intake hotfix ... The review stage still runs — it defaults to /wf review <slug> security (auth, tokens, crypto, permissions) — keeping the audit trail complete while staying fast.'
  - _verified, confidence 0.97_

- **Claim** (Section: Skip a single stage mid-workflow): /wf-meta skip verify my-slug
  - **Reality:** The /wf-meta skip reference defines argument order as: first argument = slug, second argument = stage. The correct invocation is '/wf-meta skip my-slug verify'. The reference file's argument-hint is '<slug> <stage> [reason]' and Step 0 explicitly states 'First argument: slug, Second argument: stage name'. The doc has them transposed.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/skip.md lines 3 and 56-59`
  - **Fix:** Swap the argument order in the code example: /wf-meta skip my-slug verify
  - _verified, confidence 0.97_

- **Claim** (Section: Abandon a workflow that went the wrong direction): /wf-meta close abandoned my-slug
  - **Reality:** Two errors. (1) Argument order is wrong: close.md defines 'First argument: slug, Second argument (optional): close reason'. The correct call puts the slug before the reason. (2) 'abandoned' is not a valid close reason. The five valid close reasons are: cancelled, superseded, deferred, completed-externally, merged-into. The correct invocation to close an unwanted workflow is: /wf-meta close my-slug cancelled. The same invalid reason is repeated in the 'What is not a valid escape hatch' section as '/wf-meta close abandoned'.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/close.md lines 3, 22-30, and 38-41`
  - **Fix:** Fix both occurrences. Replace '/wf-meta close abandoned my-slug' with '/wf-meta close my-slug cancelled' and '/wf-meta close abandoned' with '/wf-meta close my-slug cancelled'. The reason should be one of the five valid values (cancelled, superseded, deferred, completed-externally, merged-into).
  - _verified, confidence 0.98_

### `tips/faq.html`

- **Claim** (FAQ entry: 'Can I use this on a repo that is already mid-development?'): Run `/wf shape` to start a new workflow for whatever you are working on now.
  - **Reality:** `/wf shape` is stage 2 of 10. Its reference enforces a hard prerequisite: `01-intake.md` must exist. If it is missing, shape immediately STOPs and tells the user 'Run `/wf intake` first.' A user on a mid-development repo following this FAQ answer will get an error. The correct entry point for starting any new workflow — including on an existing codebase — is `/wf intake <description>`.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/shape.md lines 20 ('Requires: 01-intake.md') and 38 ('01-intake.md must exist. If missing → STOP. Tell the user: "Run /wf intake first."')`
  - **Fix:** Replace 'Run `/wf shape` to start a new workflow' with 'Run `/wf intake <description>` to start a new workflow'. The intake command is stage 1 and has no prerequisites.
  - _verified, confidence 0.98_

### `tips/tricks.html`

- **Claim** (Section "Skip shape and slice for a trivial change", code block): /wf-meta skip shape <slug> /wf-meta skip slice <slug>
  - **Reality:** The skip sub-command's argument order is <slug> <stage> [reason], not <stage> <slug>. skip.md Step 0 explicitly parses: "First argument: slug, Second argument: stage name". The page's examples have stage and slug reversed — a user copying them passes stage as the first argument where slug is expected, so the command will either error ('No workflow `shape` found') or silently pick the wrong workflow.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/skip.md — argument-hint frontmatter: `<slug> <stage> [reason]`; Step 0 Parse $ARGUMENTS bullet 1: 'First argument: slug', bullet 2: 'Second argument: stage name'`
  - **Fix:** Swap the argument order in both example lines to put the slug first: ``` /wf-meta skip <slug> shape /wf-meta skip <slug> slice /wf plan <slug> default-slice ```
  - _verified, confidence 0.98_

### `tutorials/quick-fix-workflow.html`

- **Claim** (Step 1 — Start the quick-fix workflow / 'What 01-fix.md looks like' code block): type: fix-plan slug: typo-invalid-payload
  - **Reality:** Since v9.86.0 (compressed-lifecycle), 01-fix.md uses type: intake (not type: fix-plan). The fix.md skill states explicitly: '01-fix.md — type: intake (the compressed brief)'. type: fix-plan is a legacy type retained in the schema enum only for backward compat with on-disk artifacts written before that release — it is never written by new runs. A user copying this snippet will produce a schema-invalid artifact rejected by the post-write-verify hook.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md line 70 ('01-fix.md — type: intake'); plugins/sdlc-workflow/tests/frontmatter.schema.json line 1372 (fix-plan in legacy quickMetaArtifactFrontmatter enum, not in active type paths)`
  - **Fix:** Change the 01-fix.md frontmatter example to use 'type: intake' (and add the full required fields: schema: sdlc/v1, workflow-type: fix, status: complete, stage-number: 1, created-at, updated-at, tags, refs, next-command, next-invocation) consistent with the fix.md skill template.
  - _verified, confidence 0.97_

- **Claim** (Step 1 — Start the quick-fix workflow / 'What 00-index.md looks like' code block): status: in-progress
  - **Reality:** The indexFrontmatter schema (00-index.md) allows only status enum values of ['active', 'complete', 'closed']. 'in-progress' is not a valid value for the index status field — it is valid for slice status and progress-map values, but not for the top-level index status. The pre-write-validate hook will not catch this (it checks schema presence), but the post-write-verify Ajv gate will reject it.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json line 87: "status": { "enum": ["active", "complete", "closed"] }`
  - **Fix:** Change 'status: in-progress' to 'status: active' in the 00-index.md frontmatter example.
  - _verified, confidence 0.98_

## MAJOR findings (62)

### `explanation/artifacts-over-memory.html`

- **Claim** (<details> block under heading 'Technical detail: where artifacts live'): Each stage has a numbered filename: <code>01-orient.md</code>, <code>02-shape.md</code>, <code>03-plan.md</code>, and so on.
  - **Reality:** Stage 1 artifact is 01-intake.md (type: intake). There is no 01-orient.md anywhere in the implementation — it does not appear in PHASE_BY_BASENAME in renderers/_paths.mjs, is not a recognized frontmatter type in frontmatter.schema.json, and is not produced by any skill. The correct three-example sequence would be: 01-intake.md, 02-shape.md, 03-slice.md (stage 3 is slice, not plan; plan is stage 4 and writes 04-plan-<slice>.md).
  - **Source:** `plugins/sdlc-workflow/renderers/_paths.mjs lines 22-90 (PHASE_BY_BASENAME map: '01-intake' → ['intake', null]; '03-slice' → ['slice', null]; no '01-orient' or '03-plan' entry); plugins/sdlc-workflow/skills/wf/SKILL.md dispatch table (intake writes 01-intake.md; slice writes 03-slice.md; plan writes 04-plan-<slice>.md)`
  - **Fix:** Replace the three example filenames: change 01-orient.md → 01-intake.md and 03-plan.md → 03-slice.md. Corrected sentence: 'Each stage has a numbered filename: 01-intake.md, 02-shape.md, 03-slice.md, and so on.'
  - _verified, confidence 0.97_

### `explanation/augmentations-model.html`

- **Claim** (h2: The four add-ons (dl block)): The four add-ons [...] instrument — observability design [...] experiment — measured rollout [...] benchmark — performance baseline and comparison [...] profile — hot-path investigation
  - **Reality:** The schema-defined augmentation types (type: augmentation + augmentation-type discriminator) are exactly four: benchmark, experiment, instrument, rca. Profile is NOT type: augmentation — it is a standalone command that writes to .ai/profiles/<run-id>/01-profile.md and is never registered in a workflow 00-index.md augmentations array. The page therefore lists three real augmentations (instrument, experiment, benchmark), one non-augmentation (profile), and omits the fourth real augmentation type (rca). The /wf intake rca mode in slug-mode writes a compressed slice of augmentation-type: rca attached to an existing workflow, which IS the fourth augmentation type.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json lines 846-848 (augmentation-type enum: ["benchmark", "experiment", "instrument", "rca"]); plugins/sdlc-workflow/skills/wf/reference/profile.md (Shape section: standalone, writes to .ai/profiles/, 'Does NOT Start a workflow, write any workflow artifact')`
  - **Fix:** Rename the heading to reflect the actual four structured augmentation types: instrument, experiment, benchmark, rca. Add a dt/dd entry for rca (slug-mode /wf intake rca attaches a root-cause analysis as an augmentation-type: rca artifact). Reposition profile either as a fifth, explicitly non-registering standalone tool, or in a separate callout box that distinguishes it from the type: augmentation family. Update the technical-detail summary line to read 'instrument, experiment, benchmark, and rca share type: augmentation'.
  - _verified, confidence 0.97_

- **Claim** (div.related — Where next (third bullet)): <a href="../explanation/pipeline-overview.html">Understand the stage pipeline add-ons extend →</a>
  - **Reality:** explanation/pipeline-overview.html does not exist in the doc site. The closest equivalent is reference/pipeline.html (sidebar label: 'Pipeline (10 stages)'), which is the canonical stage-pipeline reference page.
  - **Source:** `Glob of plugins/sdlc-workflow/docs/site/**/*.html returned no match for pipeline-overview.html; plugins/sdlc-workflow/docs/site/reference/pipeline.html exists and is listed in nav.html`
  - **Fix:** Replace the href with ../reference/pipeline.html and update the link text to 'Understand the stage pipeline add-ons extend →' (or keep the same text). Remove the stale pipeline-overview.html reference.
  - _verified, confidence 0.98_

### `explanation/branch-strategy.html`

- **Claim** (h2#dedicated — bullet list under 'What the plugin does at handoff with this strategy'): Triages any review comments through a bounded loop (stage T5.1).
  - **Reality:** The handoff skill defines four T5.x sub-steps, not three: T5.0 (Watch CI to green + settle bot reviews), T5.1 (PR comment triage), T5.2 (Rebase onto base), T5.3 (Final readiness re-watch). The page omits T5.0 entirely. T5.0 is described in handoff.md as 'the task whose absence caused the "stopped without CI green / didn't wait for reviews" failure' and is mandatory before triage (T5.1) fires.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/handoff.md lines 121-223`
  - **Fix:** Add a bullet for T5.0 before T5.1: 'Watches CI to a terminal state and gives bot reviewers a bounded settle window before triage begins (stage T5.0).' The existing T5.1/T5.2/T5.3 bullets remain but need renumbering-awareness.
  - _verified, confidence 0.97_

- **Claim** (h2#shared — bullet list under 'What the plugin does at handoff with this strategy'): Runs the triage (T5.1) and live-check (T5.3) steps only if you have manually recorded a `pr-number` in the workflow index.
  - **Reality:** For branch-strategy: shared, handoff.md unconditionally deletes T5.1 (TaskUpdate(T5.1, status: 'deleted')) and T5.2 (TaskUpdate(T5.2, status: 'deleted')) regardless of whether a pr-number exists. Only T5.0 (CI watch) and T5.3 (final re-watch) run conditionally when pr-number is recorded. A user reading this page would believe triage (T5.1) runs for shared branches if they record a pr-number, which is false.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/handoff.md line 191`
  - **Fix:** Revise to two bullets: (1) 'Skips PR comment triage (T5.1) and rebase (T5.2) — force-pushing a shared branch is destructive and triage is not automated for non-auto-created PRs.' (2) 'Watches CI and captures final readiness (T5.0/T5.3) only if you have manually recorded a `pr-number` in the workflow index.'
  - _verified, confidence 0.95 (downgraded from blocker)_

### `explanation/idempotency-in-ship.html`

- **Claim** (Technical details: where evidence is stored (collapsed <details> section, line 151)): the run artifact (the `09-ship-run-<slug>.md` file)
  - **Reality:** The run artifact filename uses a UTC timestamp run-id, not the slug. Correct pattern: `09-ship-run-<run-id>.md` where `<run-id>` is `YYYYMMDDTHHMMZ` (e.g. `09-ship-run-20260620T1430Z.md`). Multiple runs accumulate as separate files in the slug directory. The slug identifies the workflow directory, not the individual run file.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/ship.md line 22 ('Produces | 09-ship-run-<run-id>.md (per release)') and Step 13 heading ('Write 09-ship-run-<run-id>.md'); tests/frontmatter.schema.json lines 608-666 (shipRunFrontmatter, run-id pattern ^\d{8}T\d{4}Z$)`
  - **Fix:** Change `09-ship-run-<slug>.md` to `09-ship-run-<run-id>.md` and add a note that `<run-id>` is a UTC compact timestamp (`YYYYMMDDTHHMMZ`), not the workflow slug. Example: 'the run artifact (`09-ship-run-<run-id>.md`, where `<run-id>` is a UTC timestamp such as `20260620T1430Z`)'.
  - _verified, confidence 0.97_

### `explanation/why-this-exists.html`

- **Claim** (What this is not — third bullet point): Not an automation layer. Every stage asks you. The AI proposes; you choose. No stage auto-advances without your confirmation.
  - **Reality:** Since v9.88.0, /wf auto is an 18th top-level /wf key that is explicitly an end-to-end lifecycle driver. It drives plan → implement → verify → review in-process across every slice without requiring user confirmation between stage transitions. It only pauses when a stage's OWN intra-stage gate fires (e.g. AskUserQuestion Fix/Skip/Escalate inside verify, or a review blocker). The claim 'No stage auto-advances without your confirmation' is false for /wf auto slug mode and slice mode — the whole design goal stated in reference/auto.md line 18 is 'It removes inter-stage friction, not intra-stage gates.'
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/auto.md lines 13-19; plugins/sdlc-workflow/skills/wf/SKILL.md (18th key 'auto')`
  - **Fix:** Revise the third bullet to carve out /wf auto. For example: 'Not an automation layer for most commands — every stage asks you. The AI proposes; you choose. /wf auto is the deliberate exception: it sequences stages automatically, but it does not suppress any stage's own quality gates or open a PR on your behalf.'
  - _verified, confidence 0.97_

### `how-to/author-ship-plan.html`

- **Claim** (Step 3 — Confirm each release concern (Blocks A–K), definition list item for Block B): <dt><strong>B — Branch gates</strong></dt>
  - **Reality:** Block B is called 'Versioning contract' in the skill file (plugins/sdlc-workflow/skills/wf-meta/reference/init-ship-plan.md line 268: '## Block B — Versioning contract'). The term 'Branch gates' does not appear anywhere in the implementation. The content described under 'Branch gates' (versioning scheme, version source-of-truth files, bump command, prerelease suffixes) correctly matches Block B — only the label is wrong.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/init-ship-plan.md line 268: '## Block B — Versioning contract'`
  - **Fix:** Rename 'B — Branch gates' to 'B — Versioning contract' in the definition list.
  - _verified, confidence 0.97_

### `how-to/choose-a-command.html`

- **Claim** ("By situation" table, row 2 (Notes column for /wf intake fix)): Compressed path: brief + implement + handoff. Leaves 2–3 artifact files. Faster than full <code>/wf</code>.
  - **Reality:** The fix mode authors 5 files in this invocation alone: 01-fix.md, 02-shape.md, 03-slice.md, 04-plan.md, 00-index.md. It then GATES before implement; the standard /wf implement → /wf verify → /wf review → /wf handoff → /wf ship → /wf retro chain still executes afterward. No stage is skipped per fix.md: 'Each planning stage is single-pass/lightweight — no stage is skipped.' The description 'brief + implement + handoff' is wrong: implement and handoff are NOT run by this command.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md (Produces row: '01-fix.md, 02-shape.md, 03-slice.md, 04-plan.md, and a conformant 00-index.md'; Pipeline row showing the full chain; 'no stage is skipped' note)`
  - **Fix:** Replace Notes with something like: 'Planning-half-only: authors 01-fix → 04-plan + 00-index (5 files) then gates for your approval. Standard /wf implement → verify → review → handoff → ship chain runs afterward. No stage is skipped; the compression is in ceremony, not stages.'
  - _verified, confidence 0.97_

- **Claim** ("By situation" table, row 3 (Notes column for /wf intake hotfix)): 6-stage scope-locked flow.
  - **Reality:** Hotfix is a full standard lifecycle with 8 stages: intake → shape → slice → plan → implement → verify → review → ship (retro omitted for speed but no other stage is dropped). The hotfix.md source explicitly states: 'Each stage single-pass — no stage is skipped.' '6-stage' does not match any count of stages in the pipeline.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/hotfix.md (Pipeline row: '01-hotfix → 02-shape → 03-slice → 04-plan → [gate] → /wf implement → /wf verify → /wf review security → /wf ship'; Compression row: 'no stage is skipped')`
  - **Fix:** Replace '6-stage scope-locked flow' with an accurate description, e.g., 'Full standard lifecycle (intake → ship), single-pass, scope-locked to the minimum change that stops the incident.'
  - _verified, confidence 0.95_

- **Claim** ("By situation" table, row 3 (Notes column for /wf intake hotfix)): Bypasses non-critical review gates for speed.
  - **Reality:** Hotfix does NOT bypass any review gates. The pipeline explicitly includes `/wf review security` (stage 7). The only difference from the default flow is that the review dimension defaults to 'security' instead of the full set. All quality gates still execute.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/hotfix.md (Pipeline row includes '/wf review security (→07)'; Next row: '07-review defaults to security')`
  - **Fix:** Replace 'Bypasses non-critical review gates for speed' with 'Security review runs by default (07-review defaults to security dimension). No gates are bypassed.'
  - _verified, confidence 0.97_

- **Claim** ("By situation" table, row 9 (Notes column for /wf intake ideate)): Produces a ranked list of improvement candidates under <code>.ai/ideation/</code>.
  - **Reality:** Current standalone ideate writes to .ai/workflows/<slug>/01-ideate.md (type: ideation) + .ai/workflows/<slug>/00-index.md (type: workflow-index). The .ai/ideation/ path is a LEGACY location from pre-v9.83.0 runs; the ideate.md source itself notes '(Legacy off-pipeline .ai/ideation/<focus>-<timestamp>.md runs still render via the retained ideation discovery.)' New runs no longer write there.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/ideate.md (Step 6: 'Write two files under .ai/workflows/<slug>/'; Produces row: 'A type:workflow-index slug workflow: .ai/workflows/<slug>/01-ideate.md … + a lightweight 00-index.md'; legacy note in parentheses)`
  - **Fix:** Change '.ai/ideation/' to '.ai/workflows/<slug>/' — e.g., 'Produces a ranked list written to .ai/workflows/<slug>/01-ideate.md. Good for planning sessions.'
  - _verified, confidence 0.97_

### `how-to/close-workflows.html`

- **Claim** (Section: I shipped it already (close cleanly)): If you ran <code>/wf ship</code> the workflow was closed for you automatically. You do not need to close it again.
  - **Reality:** /wf ship runs the release and sets `status: complete` (via /wf retro which follows ship) in 00-index.md — it does NOT set `status: closed`. The `closed` status is written exclusively by `/wf-meta close`. A shipped-and-retro'd workflow has `status: complete`, which is distinct from `status: closed` produced by this command. A user who shipped via /wf ship does NOT have a 99-close.md; the close command is still meaningful if they want a closure record.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/retro.md line 136 ('Mark the workflow as complete in 00-index.md') and line 163 ('status: complete'); plugins/sdlc-workflow/skills/wf-meta/reference/close.md line 18 ('Updated 00-index.md — status: closed')`
  - **Fix:** Rephrase: if the user ran `/wf ship` followed by `/wf retro`, the workflow index is marked `status: complete` — which is the normal finish state. `/wf-meta close` is a separate operation that marks `status: closed` and writes 99-close.md for auditing an early or out-of-band termination. Remove the claim that ship closes the workflow automatically.
  - _verified, confidence 0.92 (downgraded from blocker)_

- **Claim** (Technical details — what 99-close.md contains, details/summary block): <code>close-reason</code> — one of <code>shipped</code>, <code>abandoned</code>, <code>superseded</code>, <code>archived</code>, <code>stuck</code>
  - **Reality:** The five valid close-reason values written to 99-close.md are `cancelled`, `superseded`, `deferred`, `completed-externally`, `merged-into`. The doc lists none of `shipped`, `abandoned`, `archived`, or `stuck`. The actual close.md frontmatter schema is `close-reason: <cancelled|superseded|deferred|completed-externally|merged-into>`.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/close.md line 87 (close-reason frontmatter field)`
  - **Fix:** Replace the five listed reasons with the actual five: `cancelled`, `superseded`, `deferred`, `completed-externally`, `merged-into`. Update the prose description of `archived` and `stuck` in the same block accordingly.
  - _verified, confidence 0.97_

### `how-to/resume-paused-work.html`

- **Claim** (lede paragraph (line 98)): Run /wf-meta resume <slug> and the plugin reads your notes, finds the first unfinished step, and tells you exactly what to do next.
  - **Reality:** /wf-meta resume generates a dense ~500-word context-recovery brief across all stage artifacts and writes 90-resume.md. It surfaces the recommended next command inside a '## Next' section of the brief, but its primary character is context synthesis, not step-routing. The command that 'reads the current state and tells you the exact next command to run' is /wf-meta next (the routing helper). Describing resume as a step-finder conflates two distinct sub-commands.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/resume.md (description frontmatter: 'Generate a dense, token-efficient context brief for a workflow'; Step 1 brief structure); plugins/sdlc-workflow/skills/wf-meta/reference/next.md (description: 'Read the workflow index and tell the user the exact next command to run')`
  - **Fix:** Rewrite the lede to describe /wf-meta resume accurately: it synthesizes a context brief (~500 words) that distills all stage notes into goal, decisions, current state, open questions, and a recommended next command — so you can orient quickly after a break. Mention that /wf-meta next <slug> is the lighter-weight pure-routing command when you only need the next invocation without a full brief.
  - _verified, confidence 0.95_

- **Claim** (Step 1 — find your paused workflow, example output block (lines 117-119)): auth-token-refresh 03-design 4 days
  - **Reality:** There is no stage 3 called 'design' in the 10-stage pipeline. Stage 3 is 'slice'. Design is a sub-workflow that produces artifacts under stage 2 (02b-design.md, 02c-craft.md). The value '03-design' does not correspond to any valid current-stage enum value in the schema (enum values are: intake, shape, design, slice, plan, implement, verify, review, handoff, ship, retro, complete — and 'design' is used for the design sub-stage, but it would never appear prefixed as '03-design'). Additionally, the /wf-meta status dashboard format uses '<N>·<stage-name>' (e.g. '3·slice') not 'NN-stagename' filename format.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/status.md line 16 (Pipeline: 1·intake → 2·shape → 3·slice → ...); plugins/sdlc-workflow/tests/frontmatter.schema.json (current-stage enum in indexFrontmatter)`
  - **Fix:** Replace '03-design' with a valid stage label. If the intent is to show a workflow at the design sub-stage, use 'design' as the stage value (per the enum). If the intent is to show a workflow mid-slice, use '3·slice'. Also align the stage column format with the actual dashboard output format '<N>·<stage-name>' (e.g. '3·slice', '5·implement') rather than the filename-style 'NN-stagename' format used in the current example.
  - _verified, confidence 0.95_

### `how-to/run-a-release.html`

- **Claim** (h2: The 13 steps — reassurance, not a wall): Step 1 Orient — reads the ship plan and confirms a readiness check passed. Refuses if it did not.
  - **Reality:** Orient is Step 0 in the implementation — explicitly labeled '# Step 0 — Orient (MANDATORY)' and is separate from '# The 13-step run sequence' which starts at Step 1 (Pre-flight). The 13 numbered steps are: 1·Pre-flight, 2·Publish dry-run, 3·Rollout questions, 4·Freshness pass, 5·Go/No-Go, 6·Merge, 7·Tag+release, 8·Release workflow watch, 9·Post-publish polling, 10·Post-release version bump, 11·Update ship-runs index, 12·Adaptive routing, 13·Write artifact. The page conflates Orient (Step 0) with step 1 of the 13, shifts all subsequent steps by one, and must omit Step 11 (Update 09-ship-runs.md index) and Step 12 (Adaptive routing) to keep the count at 13.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/ship.md line 33 ('# Step 0 — Orient (MANDATORY)') and line 111 ('# The 13-step run sequence')`
  - **Fix:** Remove 'Orient' from the 13-step list; it is a pre-flight orientation (Step 0), not one of the 13 idempotent run steps. Replace the list with the actual 13 steps: Pre-flight, Publish dry-run, Rollout questions, Freshness pass, Go/No-Go, Merge, Tag+release, Release workflow watch, Post-publish polling, Post-release version bump, Update ship-runs index, Adaptive routing, Write artifact.
  - _verified, confidence 0.97_

- **Claim** (h2: The 13 steps — reassurance, not a wall, item 10): Recovery (conditional) — if the release workflow fails and the failure matches a playbook in your plan, Claude runs the playbook steps as confirmed actions. Each step is confirmed before it runs.
  - **Reality:** Recovery is not a standalone numbered step in the 13-step sequence. It is sub-step 8.4 within '## Step 8 — Release workflow watch'. The implementation reads: '8.4 On failure: match the failure log against plan.recovery-playbooks[].triggers[] (regex match, case-insensitive). For matched playbooks, present each step via AskUserQuestion.' Because the page includes Orient as step 1 and Recovery as a separate step, it must omit the real steps 11 (Update 09-ship-runs.md index) and 12 (Adaptive routing) to keep the count at 13.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/ship.md line 241 ('8.4 On failure: match the failure log...')`
  - **Fix:** Remove 'Recovery (conditional)' as a standalone step. Merge its description into the 'Release workflow watch' step as a conditional sub-action. Add the omitted steps 11 (Update ship-runs index — refreshes 09-ship-runs.md) and 12 (Adaptive routing — evaluates what is next and writes options into the artifact) to the list.
  - _verified, confidence 0.92_

### `how-to/start-workflow.html`

- **Claim** (scenario list — "There's a typo, a one-line patch, or a docs edit." dd element): Three <a href="../reference/glossary.html">artifacts</a> (workflow notes the plugin saves at each step), about 10 minutes.
  - **Reality:** The fix mode produces five artifacts per its Produces row: 01-fix.md (type: intake), 02-shape.md, 03-slice.md (type: slice-index), 04-plan.md, and 00-index.md. The claim of 'three artifacts' is wrong; the number was never three for this mode.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md line 23 (Produces row: '01-fix.md (type: intake), 02-shape.md, 03-slice.md (type: slice-index, one slice), 04-plan.md, and a conformant 00-index.md (type: index).')`
  - **Fix:** Replace 'Three artifacts' with 'Five artifacts (01-fix.md, 02-shape.md, 03-slice.md, 04-plan.md, 00-index.md)' or simply remove the count claim and describe it as 'a compressed planning half then the standard execute chain.'
  - _verified, confidence 0.97_

### `how-to/triage-pr-comments.html`

- **Claim** (<details> 'Technical details — T5.0 / T5.1 / T5.2 / T5.3 step breakdown'): T5.2 — act. Blocking threads are sent to `/wf implement <slug> <slice> reviews` one by one; each returns a commit SHA. Suggestion threads are presented via `AskUserQuestion` multi-select. Resolved threads are closed via `resolveReviewThread` mutation.
  - **Reality:** T5.2 is 'Rebase onto base' — it fetches the base branch, checks fast-forward eligibility, runs `git rebase origin/<base-branch>`, and force-pushes with lease. The 'act' behavior described (routing blocking threads to fix subagents, presenting suggestions via AskUserQuestion, resolving threads via GraphQL mutation) is all part of T5.1 ('PR comment triage loop'). A user reading this page would think T5.2 = fix loop, when in reality T5.2 = rebase, and the fix loop is T5.1.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/handoff.md lines 122-123 (task definitions: T5.1 = 'PR comment triage', T5.2 = 'Rebase onto base') and lines 225-233 (steps 7b/7c in the workflow)`
  - **Fix:** Rename T5.2 in the details block to 'Rebase onto base' and describe the rebase-onto-base behavior. Move the fix-loop description (routing blocking threads to subagents, suggesting via AskUserQuestion, resolving threads) to the T5.1 entry. The current T5.3 description (re-watch and finalize) is correct and should remain.
  - _verified, confidence 0.98_

### `orientation/first-10-minutes.html`

- **Claim** (What you just did (section heading and surrounding prose describing intake → implement → handoff as the complete workflow)): You ran a three-command workflow that took one session.
  - **Reality:** The fix mode's standard execution chain is: /wf implement (stage 5) → /wf verify (stage 6) → /wf review (stage 7) → /wf handoff (stage 8). Handoff explicitly requires 07-review.md (or per-slice review files) as a prerequisite and will refuse if any required review has unresolved blockers. A user following the tutorial's three-step path (intake → implement → handoff) will fail at handoff because stage 6 and stage 7 artifacts are missing.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md Pipeline line and _intake-context.md lines 76-78: '/wf implement (<slug>) (→05) → /wf verify (<slug>) (→06) → /wf review (<slug>) (→07) → /wf handoff (→08)'; plugins/sdlc-workflow/skills/wf/reference/handoff.md Requires rows (both per-slice and slug-wide require review artifacts)`
  - **Fix:** Add Step 2b (/wf verify) and Step 2c (/wf review) between the implement and handoff steps. The section currently jumps from Step 2 (implement) to Step 3 (handoff) with no mention of verify or review. Update 'three-command workflow' to 'five-command workflow' and adjust the 'What you'll produce' summary accordingly. The 'artifact trail' bullet in 'What you just did' should reference the actual terminal artifact state including 06-verify.md and 07-review.md.
  - _verified, confidence 0.9 (downgraded from blocker)_

### `orientation/mental-model.html`

- **Claim** (h2#the-five-things-you-type — /wf-meta table row (line 122)): Status, resume, next, sync, amend, close — everything for working *with* workflows that already exist. Sub-commands: `status`, `resume`, `next`, `sync`, `amend`, `close`, `init-ship-plan`, `build-pipeline`
  - **Reality:** /wf-meta has 12 sub-commands, not 8. The page omits `extend` (add new work without resetting prior stages), `skip` (mark a stage as skipped), `how` (five-mode explanation router), and `announce` (produce a Diátaxis-aligned external announcement). The preamble 'Status, resume, next, sync, amend, close' also silently omits these four.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/SKILL.md lines 5 (argument-hint lists all 12) and 23-38 (dispatch table)`
  - **Fix:** Update the /wf-meta row's sub-command list to all 12 keys and revise the preamble description to include extend, skip, how, and announce.
  - _verified, confidence 0.97_

### `reference/00-index-schema.html`

- **Claim** (Optional fields (set as stages run) table): <tr><th><code>pr-url</code></th><td>Set by handoff.</td></tr> <tr><th><code>pr-number</code></th><td>Set by handoff.</td></tr>
  - **Reality:** Both 'pr-url' and 'pr-number' appear in the indexFrontmatter 'required' array. They must be present in every 00-index.md (typically written as empty string and null respectively until handoff fills them in, but structurally required).
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json lines 78-79: required array includes 'pr-url' and 'pr-number'`
  - **Fix:** Move pr-url and pr-number out of the Optional table and into the Required fields table. Add a clarifying note: 'Written as empty string / null at intake; populated by /wf handoff.'
  - _verified, confidence 0.95_

- **Claim** (Required fields table): (no row for 'created-at' in the Required fields table)
  - **Reality:** 'created-at' is in the indexFrontmatter required array alongside 'updated-at'. The page lists 'updated-at' as required but omits 'created-at' entirely, leaving readers unaware that a 00-index.md without created-at will fail schema validation.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json line 77: required array includes 'created-at'`
  - **Fix:** Add a required-fields table row for 'created-at' (ISO 8601) directly after or before the existing 'updated-at' row.
  - _verified, confidence 0.97_

- **Claim** (Required fields table): <tr><td><code>slices</code></td><td>array</td><td>Per-slice summary objects (slug, status, complexity, depends-on).</td></tr>
  - **Reality:** 'slices' is NOT in the indexFrontmatter required array. It is an optional property. A fresh 00-index.md written at intake will not contain this field and will still pass validation.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json lines 75-81 (required array does not include 'slices'); lines 125-138 (slices defined as optional property)`
  - **Fix:** Move the 'slices' row from the Required fields table to the Optional fields section.
  - _verified, confidence 0.97_

- **Claim** (Required fields table): <tr><td><code>stack</code></td><td>map</td><td>Stack fingerprint (platforms, languages, frameworks) detected at intake (Step 0.5) and confirmed by the user.</td></tr>
  - **Reality:** The field 'stack' does not exist in the indexFrontmatter schema at all — it appears neither in the required array nor in the properties object. No such field is written or validated by any hook or skill.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json (grep for 'stack' returns no matches in the file)`
  - **Fix:** Remove the 'stack' row from the Required fields table entirely.
  - _verified, confidence 0.97_

- **Claim** (Required fields table, row for 'progress'): 10 stage names → <code>not-started</code> / <code>in-progress</code> / <code>complete</code> / <code>skipped</code> / <code>blocked</code>
  - **Reality:** The schema's progress map only allows ["not-started", "in-progress", "complete", "skipped"]. 'blocked' is NOT a valid value. A 00-index.md with progress: { implement: blocked } would fail schema validation.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json lines 110-113: additionalProperties enum is ["not-started", "in-progress", "complete", "skipped"]`
  - **Fix:** Remove 'blocked' from the progress enum display. Show only: not-started / in-progress / complete / skipped.
  - _verified, confidence 0.97_

### `reference/08-handoff-schema.html`

- **Claim** (h2#frontmatter-base-fields / pre code block): Frontmatter — base fields ``` schema: sdlc/v1 type: handoff slug: <slug> slice-slugs: [<slug-1>, ...] handoff-mode: aggregate | single-slice status: complete stage-number: 8 created-at: <ISO 8601> updated-at: <ISO 8601> pr-title: "<PR title>" pr-url: "<url or empty>" pr-number: <N or 0> branch: "<branch>" base-branch: "<target>" has-migration: true | false has-config-change: true | false has-docs-changes: true | false docs-generated: [<paths>] ```
  - **Reality:** The handoffFrontmatter schema required[] array includes four additional fields not shown in the page's base fields block: tags (stringArray), refs (refs object), next-command (string), and next-invocation (string). All four are required by the schema; omitting any one causes post-write-verify to exit 2 and block the write. The handoff skill template (skills/wf/reference/handoff.md lines 319–326) also includes these four fields in its canonical frontmatter example.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json lines 553–558 (required array); plugins/sdlc-workflow/skills/wf/reference/handoff.md lines 319–326`
  - **Fix:** Add the four missing required fields to the base fields code block, after docs-generated: ``` tags: [] refs: index: 00-index.md slice-index: 03-slice.md implements: [05-implement-<slug>.md] reviews: [07-review-<slug>.md] next-command: wf-ship next-invocation: "/wf ship <slug>" ```
  - _verified, confidence 0.97_

### `reference/artifacts.html`

- **Claim** (Workflow directory tree (pre element, off-pipeline section)): ├── simplify/<run-id>.md # /wf simplify run (branch/commit/plan/codebase)
  - **Reality:** Since v9.86.0 (compressed-lifecycle), `/wf simplify` standalone mode writes a `type: workflow-index` slug workflow to `.ai/workflows/<slug>/00-index.md` + `.ai/workflows/<slug>/01-simplify.md` (type: simplify-run). The `.ai/simplify/<run-id>.md` path is a LEGACY location for pre-compressed-lifecycle runs only — the renderer retains discovery of it, but no current command writes there. New runs write into the standard `.ai/workflows/` tree.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/simplify.md (Step 5 'Additive-write contract' block, 'Produces' table row: 'A type: workflow-index slug workflow: .ai/workflows/<slug>/01-simplify.md'); plugins/sdlc-workflow/scripts/render-sunflower.mjs line 77 (default simplify path retained for legacy scan)`
  - **Fix:** Replace the `simplify/<run-id>.md` entry with `.ai/workflows/<slug>/01-simplify.md` (type: simplify-run) as the current location. Either remove the off-pipeline entry or annotate it as '(legacy — pre-v9.86.0 runs only)'.
  - _verified, confidence 0.92_

- **Claim** (Workflow directory tree (pre element, off-pipeline section)): ├── dep-updates/<run-id>/ # /wf intake update-deps tree
  - **Reality:** Since v9.86.0, `/wf intake update-deps` writes standard SDLC lifecycle artifacts into `.ai/workflows/update-deps-<YYYYMMDD>/` (a slug workflow): 01-update-deps.md, 02-shape.md, 03-slice.md, 04-plan.md, 05-implement.md, 06-verify.md, 00-index.md. The `.ai/dep-updates/<run-id>/` path is a LEGACY location for old `/wf-quick update-deps` runs. The render-sunflower comment at line 211 explicitly attributes dep-updates scanning to '/wf-quick update-deps'.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/update-deps.md ('Produces (this command)' table row: 'In-slug standard artifacts under .ai/workflows/<slug>/'); plugins/sdlc-workflow/scripts/render-sunflower.mjs line 211 comment`
  - **Fix:** Replace the `dep-updates/<run-id>/` entry with a reference to the standard workflow slug `.ai/workflows/update-deps-<YYYYMMDD>/` containing the full set of lifecycle artifacts. Optionally retain the dep-updates line as '(legacy — old /wf-quick update-deps runs only)'.
  - _verified, confidence 0.92_

### `reference/glossary.html`

- **Claim** (Fragment entry): A companion <code>.yaml</code> file that sits next to a rich-tier artifact <code>.md</code> and carries the structured data the dashboard needs. 13 artifact types require a sibling fragment.
  - **Reality:** The term 'fragment' in this plugin refers to the `.html.fragment` file — the interactive HTML layer. The `.yaml` file next to a rich-tier artifact is called the 'sibling YAML' (not the fragment). This distinction is made explicit throughout the plugin: skills/wf/SKILL.md line 17 reads 'Beyond the typed `.html.fragment` the rich stages project from a sibling `.yaml`'; reference/narrative-fragments.md uses 'sibling .yaml' and '.html.fragment' as distinct concepts; fragment-author-contract.md step 2 says 'Write the sibling `<stem>.html.fragment`'. The glossary entry conflates these two distinct files.
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md line 17; plugins/sdlc-workflow/reference/narrative-fragments.md; plugins/sdlc-workflow/reference/fragment-author-contract.md`
  - **Fix:** Rewrite the Fragment entry to correctly describe a fragment as the `.html.fragment` interactive layer file, and note that it is driven by a separate sibling `.yaml` that carries the structured data. Example: 'An `.html.fragment` file that sits next to a rich-tier artifact `.md` and provides the interactive dashboard layer. It is driven by a sibling `.yaml` file that carries the structured data the renderer reads. Opt out per-file with `fragment: none` frontmatter.'
  - _verified, confidence 0.97_

### `reference/hooks.html`

- **Claim** (h4: Sibling-fragment hard block (v9.47)): If you write one of the 13 gated types without its companion, post-write-verify exits 2 and blocks the write. The 13 gated types are: review, plan, design, ship-run, rca, benchmark, experiment, instrument, profile, simplify-run, review-command, design-audit, and design-critique.
  - **Reality:** RICH_TIER_TYPES in hooks/post-write-verify.mjs (lines 59-68) contains 14 types, not 13. design-contract was added at v9.71 and is present in the set. A write of a type: design-contract artifact (02c-craft.md) without its sibling .yaml will be blocked.
  - **Source:** `plugins/sdlc-workflow/hooks/post-write-verify.mjs lines 59-68`
  - **Fix:** Change '13 gated types' to '14 gated types' and add design-contract to the list. The lede sentence 'for the 13 rich-tier artifact types' at line 108 should also be updated to '14'.
  - _verified, confidence 0.95_

- **Claim** (h2: Configuration): All four toggles live in the hooks block of .ai/sdlc-config.json. All default to true.
  - **Reality:** The hooks block in DEFAULT_SDLC_CONFIG (lib/config.mjs lines 63-77) and sdlc-config.schema.json (lines 100-127) has five keys: autoStage, validateOnWrite, verifyOnWrite, remindMissingFragments, and validateSiblingYaml. The validateSiblingYaml toggle (controls whether post-write-verify validates a present sibling .yaml against siblingYamlSchemas.<type> and blocks on violations) is not documented in the table.
  - **Source:** `plugins/sdlc-workflow/lib/config.mjs lines 63-77; plugins/sdlc-workflow/schemas/sdlc-config.schema.json lines 100-126`
  - **Fix:** Change the heading to 'All five toggles' and add a row for validateSiblingYaml (default: true) with description: 'Whether post-write-verify validates a present sibling .yaml against its schema and blocks on violations. Only applies to types with a reconciled schema (plan, review, design, simplify-run, ship-run).'
  - _verified, confidence 0.98_

### `reference/pipeline.html`

- **Claim** (Technical details collapsible section, frontmatter keys list (line 244)): <strong>06-verify:</strong> <code>convergence</code> (pass / partial / fail)
  - **Reality:** The convergence field enum is ["not-needed", "converged", "escalated"] per frontmatter.schema.json line 482. The values 'pass / partial / fail' belong to the separate 'result' field (enum: ["pass", "fail", "partial", "blocked-runtime-evidence-missing"]).
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json lines 481-483; plugins/sdlc-workflow/skills/wf/reference/verify.md convergence table`
  - **Fix:** Change the 06-verify line to: '<strong>06-verify:</strong> <code>result</code> (pass / fail / partial / blocked-runtime-evidence-missing), <code>convergence</code> (not-needed / converged / escalated)'
  - _verified, confidence 0.97_

- **Claim** (Technical details collapsible section, frontmatter keys list (line 248)): <strong>08-handoff:</strong> <code>readiness-verdict</code> (ready / not-ready)
  - **Reality:** The readiness-verdict enum is ["ready", "blocked", "awaiting-input"] per frontmatter.schema.json line 596. 'not-ready' is not a valid enum value.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json line 596`
  - **Fix:** Change to: '<strong>08-handoff:</strong> <code>readiness-verdict</code> (ready / blocked / awaiting-input)'
  - _verified, confidence 0.97_

- **Claim** (Stage 2 — Shape table, Conditional inputs row (line 154)): Web-research sub-agents (best-practice, anti-patterns, gotchas) fire by default. Opt out via <code>--no-research</code>.
  - **Reality:** There is no --no-research flag in /wf shape. The shape skill has internal skip criteria (fires when external deps, security-sensitive areas, or new API surfaces are involved), but these are automatic and not user-controllable via a flag. The argument-hint for shape is '[slug] [hint]' — no flags exist.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/shape.md lines 44-50 (sub-agent 2 skip criteria); plugins/sdlc-workflow/skills/wf/SKILL.md dispatch table (argument-hint: [slug] [hint])`
  - **Fix:** Remove 'Opt out via --no-research.' The correct description is that web-research fires by default and has internal skip criteria when no new external dependencies, no security-sensitive area, and no new dependency API surface are introduced.
  - _verified, confidence 0.97_

### `reference/review.html`

- **Claim** (#severity — Severity levels table, BLOCKER row): Fix before merging. Inside a workflow, routes back to `/wf implement <slug> <slice> reviews`.
  - **Reality:** Since the review-owned fix loop was added, `/wf review` now owns a single-round fix loop at Step 4c: every finding the user triages 'Fix' spawns a fix sub-agent inside the review invocation itself. `/wf implement <slug> [<slice>] reviews` is now explicitly documented as 'a manual escape only' (e.g., when convergence is escalated and sub-agent patches can't resolve the issue). It is NOT the primary routing for BLOCKER findings.
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md line 33 ('`/wf implement <slug> [<slice>] reviews` is a manual escape only'); plugins/sdlc-workflow/skills/wf/reference/review.md Step 4c ('Single-round review-owned fix loop') and Adaptive Routing Option C ('Escalate to manual implement — Use when: The remaining findings cannot be addressed by sub-agent patches')`
  - **Fix:** Update the BLOCKER row to: 'Fix before merging. Inside a workflow, the review stage runs its own fix loop — `/wf review` triages each BLOCKER via AskUserQuestion (Fix/Defer/Dismiss) and dispatches sub-agent patches inline. `/wf implement <slug> <slice> reviews` exists as a manual escape only when the fix loop cannot resolve a finding.'
  - _verified, confidence 0.97_

### `reference/serve.html`

- **Claim** (h2#Lifecycle section, opening paragraph (line 209)): The <code>session-start-orient</code> hook kicks off detached bootstrap rendering, which calls <code>ensureServeLifecycle</code>. That function:
  - **Reality:** In the default 'hub' render-dispatch mode (the current default), session-start-orient calls startBootstrap(), which enqueues a bootstrap record to the render queue (.ai/_view/.render-queue/) and spawns a detached hub-ensure process. hub-ensure.mjs calls ensureHubLifecycle (not ensureServeLifecycle). ensureServeLifecycle is only reached when render-dispatch is set to the legacy 'inline' mode, where session-start-orient spawns render-sunflower --bootstrap as a subprocess — and even then, it is the spawned subprocess that calls ensureServeLifecycle, not the hook itself. The serve lifecycle steps 1-4 documented beneath this paragraph are accurate descriptions of what ensureServeLifecycle does, but the trigger description is wrong for the default configuration.
  - **Source:** `plugins/sdlc-workflow/hooks/session-start-orient.mjs lines 140-178 (startBootstrap function); plugins/sdlc-workflow/scripts/hub-ensure.mjs line 51 (calls ensureHubLifecycle); plugins/sdlc-workflow/lib/serve-lifecycle.mjs line 22 (ensureServeLifecycle definition); plugins/sdlc-workflow/scripts/render-sunflower.mjs line 1088 (only caller of ensureServeLifecycle in the bootstrap path)`
  - **Fix:** Rewrite the Lifecycle opening paragraph to reflect the current two-path bootstrap: in hub mode (default), session-start-orient enqueues to the render queue and spawns hub-ensure, which calls ensureHubLifecycle to start/adopt the hub daemon — ensureServeLifecycle is not invoked. In inline mode (rollback), session-start-orient spawns render-sunflower --bootstrap, which then calls ensureServeLifecycle. The four steps below can remain as a description of what ensureServeLifecycle does when it is reached, but should be scoped to the inline-mode or per-repo-daemon-enabled path.
  - _verified, confidence 0.95_

### `reference/ship-plan-schema.html`

- **Claim** (Summary div, second paragraph ('Two halves.')): an <strong>inbound pipeline</strong> (Blocks H–K — developer-experience and governance gates authored by <code>/wf-meta build-pipeline</code>)
  - **Reality:** Blocks H–K of .ai/ship-plan.md are authored by /wf-meta init-ship-plan, exactly like Blocks A–G. The wf-meta SKILL.md dispatch table explicitly states init-ship-plan 'Captures both the outbound release (Blocks A–G) and the inbound developer experience (Blocks H–K: code-quality gates, commit/PR-title convention, local git hooks, dev-setup, branch protection + merge controls, CODEOWNERS, dependency automation, environment protection, CI ergonomics, and security/supply-chain gates).' /wf-meta build-pipeline READS those blocks and implements/enforces the pipeline in the repo — it does not author the plan.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/SKILL.md line 37 (init-ship-plan table row); plugins/sdlc-workflow/skills/wf-meta/reference/build-pipeline.md line 30 ('It does not author or edit .ai/ship-plan.md — that is init-ship-plan / amend ship-plan. This command only reads the plan and closes the repo gap against it.')`
  - **Fix:** Change 'authored by /wf-meta build-pipeline' to 'authored by /wf-meta init-ship-plan'. Apply the same fix to the companion sentence on line 175 ('Blocks H–K below are the inbound half — the developer-experience and governance pipeline authored by /wf-meta build-pipeline').
  - _verified, confidence 0.97_

### `reference/skills.html`

- **Claim** (Second paragraph of page body (before 'The four commands' heading)): The plugin ships ten skills
  - **Reality:** The plugin ships 9 skills, not 10. The skills/ directory contains exactly: error-analysis, imagegen, refactoring-patterns, review, test-patterns, wf, wf-docs, wf-meta, wide-event-observability — 9 directories. The table below this sentence also lists only 5 support skills (not 6), which would require 9 total (4 commands + 5 support), consistent with the actual directory count.
  - **Source:** `plugins/sdlc-workflow/skills/ (directory listing confirms 9 entries)`
  - **Fix:** Change 'ten' to 'nine'.
  - _verified, confidence 0.98_

- **Claim** (The four commands — table row for /wf): /wf — 10 lifecycle stages plus 4 add-on types
  - **Reality:** /wf dispatches 18 sub-command keys: 10 lifecycle stages (intake, shape, slice, plan, implement, verify, review, handoff, ship, retro) + 4 augmentation types (instrument, experiment, benchmark, profile) + design + probe + simplify + auto. The description omits 4 directly user-invocable sub-commands: design (the compressed design workflow), probe (runtime-truth verification), simplify (review-and-route triage), and auto (the end-to-end lifecycle driver added in v9.88.0).
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md line 21 ('The first token must be one of the 18 known keys below') and the dispatch table (lines 25-44)`
  - **Fix:** Update the What-it-covers cell to something like '18 sub-commands: 10 lifecycle stages, 4 augmentation types, plus design, probe, simplify, and auto'. Alternatively: '10 lifecycle stages · 4 add-on types · design · probe · simplify · auto (18 total)'.
  - _verified, confidence 0.97_

- **Claim** (Auto-invocation section (h2#auto-invoke), second sentence): The five support skills below also auto-invoke on their own triggering conditions.
  - **Reality:** Only 2 of the 5 support skills auto-invoke on their own: error-analysis (no user-invocable restriction) and wide-event-observability (no restriction). The other three have user-invocable: false in their frontmatter — imagegen is internal to /wf design with no autonomous trigger, refactoring-patterns has context: fork and user-invocable: false (triggered only when forked by another skill), and test-patterns has user-invocable: false likewise. The imagegen row in the table below even says 'not directly invocable', directly contradicting the claim that all five auto-invoke.
  - **Source:** `plugins/sdlc-workflow/skills/imagegen/SKILL.md line 5 (user-invocable: false); plugins/sdlc-workflow/skills/refactoring-patterns/SKILL.md line 5 (user-invocable: false); plugins/sdlc-workflow/skills/test-patterns/SKILL.md line 5 (user-invocable: false)`
  - **Fix:** Rewrite the auto-invocation paragraph to distinguish the two categories: error-analysis and wide-event-observability auto-invoke on their triggering conditions; imagegen, refactoring-patterns, and test-patterns are internal helpers that are loaded by other skills (not autonomous). For example: 'Two of the support skills — error-analysis and wide-event-observability — also auto-invoke on their own triggering conditions. The other three (imagegen, refactoring-patterns, test-patterns) are internal helpers: they are loaded by commands like /wf design or /wf verify, not triggered autonomously.'
  - _verified, confidence 0.95_

### `reference/types.html`

- **Claim** (Add-on & off-pipeline types table, augmentation type row, renderer column): add-on.mjs <small>(dispatches to subtype)</small>
  - **Reality:** No file named add-on.mjs exists in renderers/. The actual renderer for type: augmentation is augmentation.mjs, which dispatches to benchmark.mjs, experiment.mjs, instrument.mjs, and rca.mjs by augmentation-type.
  - **Source:** `plugins/sdlc-workflow/renderers/augmentation.mjs lines 1-26; Glob of renderers/*.mjs confirms no add-on.mjs`
  - **Fix:** Change 'add-on.mjs (dispatches to subtype)' to 'augmentation.mjs (dispatches to subtype)'.
  - _verified, confidence 0.98_

- **Claim** (Design types table, design-augmentation type row, renderer column): design-add-on.mjs
  - **Reality:** No file named design-add-on.mjs exists in renderers/. The actual renderer for type: design-augmentation is design-augmentation.mjs.
  - **Source:** `plugins/sdlc-workflow/renderers/design-augmentation.mjs line 1; Glob of renderers/*.mjs confirms no design-add-on.mjs`
  - **Fix:** Change 'design-add-on.mjs' to 'design-augmentation.mjs'.
  - _verified, confidence 0.98_

### `reference/wf-docs.html`

- **Claim** (#pipeline — Stage 1, Stage 2, Stage 4 headings (lines 112, 119, 143)): <h3>/wf-docs discover</h3> … <h3>/wf-docs audit</h3> … <h3>/wf-docs generate</h3>
  - **Reality:** discover, audit, and generate are NOT valid /wf-docs sub-command tokens. The SKILL.md Step 0 dispatcher recognises exactly 7 known primitive keys (plan, tutorial, how-to, reference, explanation, readme, review) plus orchestrator-mode triggers (bare, --audit-only, a slug, or a path). Any other first token causes an immediate STOP error: '`<token>` is not a recognized primitive, slug, path, or flag.' A user who types /wf-docs discover or /wf-docs generate will receive an error, not a stage run.
  - **Source:** `plugins/sdlc-workflow/skills/wf-docs/SKILL.md lines 26-37 (Step 0 resolution logic, Known primitive keys list, STOP error)`
  - **Fix:** Rename the H3 headings from the implied-invocation form /wf-docs <stage> to plain stage names (e.g. 'Stage 1 — discover', 'Stage 2 — audit', 'Stage 4 — generate'). Add a note at the start of the pipeline section making clear that the full pipeline runs automatically when you invoke /wf-docs (or /wf-docs <slug>) — you do not invoke individual stages separately.
  - _verified, confidence 0.9 (downgraded from blocker)_

- **Claim** (#primitives — 'Primitives are loaded by three callers' bullet list (line 168)): <li><code>/wf-docs generate</code> (pipeline stage 4) when executing audit-driven actions.</li>
  - **Reality:** /wf-docs generate is not a valid invocation. generate is not a primitive key; it is an internal orchestrator step (SKILL.md Step 4). A user copying this line as a command gets a STOP error. The callers list should describe the orchestrator run (e.g. '/wf-docs or /wf-docs <slug> pipeline stage 4') rather than implying /wf-docs generate is a real command.
  - **Source:** `plugins/sdlc-workflow/skills/wf-docs/SKILL.md lines 26-37 (Step 0), lines 193-226 (Step 4 — Generate, no separate invocation path)`
  - **Fix:** Replace '/wf-docs generate (pipeline stage 4)' with 'the orchestrator (/wf-docs or /wf-docs <slug>) at pipeline stage 4' to eliminate the false invocation syntax.
  - _verified, confidence 0.95 (downgraded from blocker)_

- **Claim** (#pipeline — Stage 3 heading (line 126)): <h3>/wf-docs plan</h3> <div class="summary"><table><tr><th>Stage</th><td>3 — prioritized action plan</td></tr><tr><th>Writes</th><td><code>.ai/docs/&lt;run-id&gt;/plan.md</code></td></tr></table></div>
  - **Reality:** plan IS a valid primitive key, so /wf-docs plan resolves to Primitive mode (Step 6), not to the orchestrator's Stage 3. In primitive mode it loads reference/plan.md and runs the Diátaxis classification workflow (classify quadrants, propose docs map and writing order). It does NOT produce .ai/docs/<run-id>/plan.md. The .ai/docs/<run-id>/plan.md artifact is written exclusively by the orchestrator's internal Step 3 after Steps 1 and 2 have already run.
  - **Source:** `plugins/sdlc-workflow/skills/wf-docs/SKILL.md lines 26-31 (Step 0 primitive resolution), lines 295-298 (primitive table: plan → Classify docs into Diátaxis quadrants)`
  - **Fix:** Add a clarifying note that /wf-docs plan invokes the docs-planning primitive (quadrant classifier), not the orchestrator's Stage 3. Stage 3 runs automatically as part of the full orchestrator pipeline. Either rename the pipeline section heading to 'Stage 3 — plan (orchestrator)' or add an inline callout distinguishing the two behaviors.
  - _verified, confidence 0.97_

- **Claim** (#pipeline — Stage 5 heading (line 150)): <h3>/wf-docs review</h3> <div class="summary"><table><tr><th>Stage</th><td>5 — independent review of the generated docs</td></tr><tr><th>Writes</th><td>Updates to <code>generate.md</code>; the docs-index artifact <code>08b-docs-index.md</code> (+ sibling <code>.yaml</code>); then commits.</td></tr></table></div>
  - **Reality:** /wf-docs review resolves to Primitive mode (review is a known primitive key). Primitive mode loads reference/review.md and audits a single existing doc against Diátaxis principles, outputting P0–P4 findings. It does NOT write 08b-docs-index.md, does NOT update generate.md, and does NOT commit anything. Those actions belong to the orchestrator's internal Step 5, which runs only after Steps 1–4.
  - **Source:** `plugins/sdlc-workflow/skills/wf-docs/SKILL.md lines 26-31 (Step 0 primitive resolution), lines 283-292 (Step 6 primitive execution — no commits, no index artifact), lines 296-302 (primitive table: review → Audit existing docs against Diátaxis principles with prioritized fixes)`
  - **Fix:** Add a clarifying note that /wf-docs review invokes the Diátaxis-audit primitive for a single doc, and is distinct from the orchestrator's Stage 5. Stage 5 (which writes 08b-docs-index.md and commits) runs automatically as the last step of the full orchestrator pipeline. Rename the pipeline heading to 'Stage 5 — review (orchestrator)' or restructure the section to avoid the collision.
  - _verified, confidence 0.92_

### `reference/wf-quick.html`

- **Claim** (Section 'The eight intake modes', hotfix row, 'What it compresses' column): 6-stage scope-locked flow. Bypasses review. Still leaves a postmortem trail.
  - **Reality:** Since v9.86.0, /wf intake hotfix is a STANDARD lifecycle that drives ALL stages: 01-hotfix → 02-shape → 03-slice → 04-plan → implement → verify → review security → ship. It does NOT bypass review — it defaults review to the 'security' rubric. The hotfix.md explicitly states: 'Review is not skipped — but for a hotfix it defaults to the security rubric.' The stage count is 9 (intake through ship, no retro by default), not 6.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/hotfix.md — Pipeline row, Step 7, and 'Workflow rules' final bullet`
  - **Fix:** Update the hotfix row to: 'Full standard lifecycle expedited under incident pressure: scoped to minimum viable fix, production-branch base. Review defaults to security rubric (not bypassed). Writes 01-hotfix.md, 02-shape.md, 03-slice.md, 04-plan.md then routes to /wf implement.'
  - _verified, confidence 0.97 (downgraded from blocker)_

- **Claim** (Section 'The eight intake modes', update-deps row, 'What it compresses' column): Tiered scan → research → plan → implement → verify under <code>.ai/dep-updates/</code>.
  - **Reality:** Since v9.86.0 (compressed-lifecycle change), /wf intake update-deps writes all artifacts under .ai/workflows/<slug>/ using standard types: 01-update-deps.md (type: intake), 02-shape.md, 03-slice.md, 04-plan.md, 05-implement.md, 06-verify.md, 00-index.md. The .ai/dep-updates/ path is a legacy location only preserved for fallback rendering of old artifacts. The update-deps.md reference file states: 'In-slug standard artifacts under .ai/workflows/<slug>/'.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/update-deps.md — Produces row and Step 0 item 2`
  - **Fix:** Update the update-deps row to describe a standard lifecycle: 'Full standard lifecycle for dependency maintenance. Scans manifests, prioritizes by P0/P1/P2 risk tiers. Self-authors 05-implement and 06-verify (tier-ordered). Writes artifacts under .ai/workflows/<slug>/; routes to /wf review.'
  - _verified, confidence 0.95 (downgraded from blocker)_

- **Claim** (Section 'The eight intake modes', ideate row, 'What it compresses' column): Single artifact under <code>.ai/ideation/</code> with ranked candidates and effort estimates.
  - **Reality:** Since v9.83.0 (wf-quick subsume), /wf intake ideate writes its output under a workflow slug: .ai/workflows/<slug>/01-ideate.md (type: ideation) + .ai/workflows/<slug>/00-index.md (type: workflow-index). The .ai/ideation/ path is a legacy off-pipeline location preserved only for fallback rendering of artifacts created before v9.83.0. The ideate.md reference file states: 'A type: workflow-index slug workflow: .ai/workflows/<slug>/01-ideate.md ... (Legacy off-pipeline .ai/ideation/<focus>-<timestamp>.md runs still render via the retained ideation discovery.)'
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/ideate.md — Produces row`
  - **Fix:** Update the ideate row to: 'Terminal ideation — parallel sub-agents across six lenses generate 30+ candidates, adversarially filtered and ranked. Writes .ai/workflows/<slug>/01-ideate.md + 00-index.md. Does not start a build lifecycle.'
  - _verified, confidence 0.95_

- **Claim** (Section 'The new shape', table, Mode intake row, Effect column): Compressed intake. Skips or collapses stages based on the mode. Writes fewer artifacts than the full pipeline.
  - **Reality:** The four change-mode lifecycles (fix, hotfix, refactor, update-deps) are STANDARD lifecycles that write ALL stage artifacts — they do not skip stages or write fewer artifacts than the full pipeline. The compression is in ceremony (single-pass, lightweight per-stage steps, no multi-round PO interview), not in artifact count. Only the terminal-analysis modes (rca, investigate, discover, ideate) write fewer artifacts by design.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md line 24: 'Each planning stage is single-pass/lightweight — no stage is skipped'; hotfix.md, refactor.md, update-deps.md — all explicitly state 'no stage is skipped'`
  - **Fix:** Change the Mode intake row Effect to: 'Compressed intake. Change-mode lifecycles (fix, hotfix, refactor, update-deps) run all stages in a single-pass, lightweight flow. Terminal-analysis modes (rca, investigate, discover, ideate) produce a single finding artifact without starting a build pipeline.'
  - _verified, confidence 0.95_

### `reference/wf.html`

- **Claim** (lede paragraph (line 98)): 10 ordered stages (intake through retro) plus 4 optional add-ons (instrument, experiment, benchmark, profile) for observability, flag-gated rollout, and performance work.
  - **Reality:** As of v9.88.0, /wf has 18 total keys: 10 stages, 4 add-ons, plus design, probe, simplify, and auto — the lede omits the last four entirely and implies /wf has exactly 14 sub-commands. Of these four, design has its own page (reference/wf-design.html) and probe/simplify are documented on wf-quick.html, but auto (added v9.88.0 as the 18th key) has no documentation anywhere in the doc site.
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md line 21 ('The first token must be one of the 18 known keys below'); dispatch table lines 25–44`
  - **Fix:** Extend the lede to acknowledge all 18 keys: 'plus 4 observability/perf add-ons (instrument, experiment, benchmark, profile), the design workflow (/wf design), runtime-truth verification (/wf probe), a read-and-route triage tool (/wf simplify), and the end-to-end lifecycle driver (/wf auto)'. Also add a body section for /wf auto (see below).
  - _verified, confidence 0.97_

- **Claim** (Table of contents (lines 102–117); body sections (lines 119–612)): (no section for /wf auto; the page TOC lists only the 10 stages and 4 add-ons; the body contains no h2 or any prose describing the auto key)
  - **Reality:** /wf auto was added in v9.88.0 as the 18th key and is the only /wf key with no documentation anywhere in the doc site. Its role: end-to-end lifecycle driver — /wf auto <slug> drives every slice then final review and stops before handoff; /wf auto <slug> <slice> drives one slice and routes to the next. Runs each stage in-process; writes no artifact; never opens a PR or runs handoff/ship/retro.
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md lines 40–41 (auto row in dispatch table); plugins/sdlc-workflow/skills/wf/reference/auto.md`
  - **Fix:** Add a /wf auto body section (h2 id='wf-auto') covering: argument hint <slug> [<slice>], what it drives, the two modes (all-slices vs single-slice), the stop-before-handoff default, and what gates cause it to pause. Add it to the TOC. Also add it to the lede.
  - _verified, confidence 0.97_

### `tips/anti-patterns.html`

- **Claim** (h2 'Skipping retro on "small" work' — Fix paragraph): quick mode (<code>/wf intake &lt;mode&gt;</code>, a condensed flow for small, scoped changes) skips retro by design
  - **Reality:** Intake change-modes (fix, hotfix, refactor, update-deps) are STANDARD lifecycles that run all 10 stages — intake through retro. Per the COMPRESSED-LIFECYCLE-PLAN: 'every change-mode's lifecycle passes through the FULL set 01-intake → 02-shape → 03-slice → 04-plan → [gate] → 05-implement → 06-verify, then 07-review → 08-handoff → 09-ship → 10-retro.' The fix.md pipeline header explicitly ends in `→ /wf retro`. No intake build mode skips retro by design. (Terminal/analysis modes like ideate, discover produce workflow-index leads but are not build lifecycles — a different distinction.)
  - **Source:** `plugins/sdlc-workflow/docs/internal/COMPRESSED-LIFECYCLE-PLAN.md line 105; plugins/sdlc-workflow/skills/wf/reference/intake/fix.md line 18 (pipeline header ends in `→ /wf retro`)`
  - **Fix:** Remove the parenthetical '(quick mode (/wf intake <mode>), a condensed flow for small, scoped changes) skips retro by design' — it states the opposite of the truth. Rewrite to: 'Treat retro as mandatory for any workflow that includes a ship run, including workflows started with an intake mode like /wf intake fix. Retro is five minutes.'
  - _verified, confidence 0.97_

### `tips/tricks.html`

- **Claim** (Section "Re-run handoff to pick up new review-bot comments"): Just run /wf handoff <slug> again. Every step is idempotent — only the triage loop re-runs, picking up the new comments.
  - **Reality:** Re-running /wf handoff re-executes the full pipeline: T1 (read artifacts), T2 (write summary), T3 (Diátaxis docs), T3.5 (commitlint), T3.6 (public-surface drift), T3.7 (doc-mirror), T4 (push branch), T5 (PR create/update), T5.0 (watch CI to terminal + settle bot reviews), T5.1 (PR comment triage), T5.2 (rebase onto base), T5.3 (final readiness re-watch), and T6 (write 08-handoff.md with a new revision appended). The additive-write contract snapshots the existing file to history/ and appends a new revision section. It is idempotent in the sense that prior work is preserved, but the claim that 'only the triage loop re-runs' grossly understates the scope — CI is re-watched, a rebase may run, and a new PR body is posted.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/handoff.md — step 7a line referencing 'Re-running /wf handoff <slug> resumes the watch — it is idempotent'; the Additive-write contract section (near end of file); the full T1–T6 task sequence defined in 'Do this in order'`
  - **Fix:** Replace the claim with an accurate description: 'Just run /wf handoff <slug> again. The command is additive — it preserves the prior handoff revision, re-watches CI, runs a fresh triage pass on new comments, and appends a revision section to 08-handoff.md. You do not need to replay earlier pipeline stages.'
  - _verified, confidence 0.92_

### `tutorials/first-workflow.html`

- **Claim** (Stage 6 — Verify section, paragraph after the bullet list): If verify fails, the workflow routes back to <code>/wf implement</code> with a directed fix — it does not loosen the acceptance criteria.
  - **Reality:** Verify now owns a single-round, user-gated fix loop itself (Step 7.6 in verify.md). After all checks and the AC gate, verify triages each failing check via AskUserQuestion (Fix/Skip/Escalate) and dispatches fix sub-agents internally. Only when the loop is exhausted (convergence: escalated) does it route to /wf implement as a MANUAL ESCAPE. The page's framing — 'routes back to /wf implement with a directed fix' — presents the old behavior and skips the verify-owned loop entirely.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/verify.md lines 27-33: 'You are a workflow orchestrator that owns its own triage→fix loop'; line 340: 'Verify no longer routes to /wf implement as the default fix path — the fix loop is owned by this stage. /wf implement survives only as a manual escape.'`
  - **Fix:** Replace the sentence with: 'If verify finds issues, it runs a single-round, user-gated fix loop — you triage each failing check (Fix/Skip/Escalate) and verify dispatches sub-agents for the Fix decisions, then re-runs affected checks once. Only if the loop cannot resolve everything (convergence: escalated) does it suggest returning to /wf implement.'
  - _verified, confidence 0.97_

- **Claim** (Stage 7 — Review section, paragraph after the severity table): Suppose review finds one HIGH ("the endpoint returns <code>text/plain</code> when Accept doesn't include json — should be json regardless"). Fix it via: <code>/wf implement add-health-endpoint route reviews</code> This routes the fix back through implement with the review-finding context. Then re-run verify.
  - **Reality:** Review now owns its own single-round fix loop (Step 4c in review.md). The user triages findings via AskUserQuestion (Fix/Defer/Dismiss) inside the review stage, and Fix decisions spawn fix sub-agents within the same /wf review invocation. '/wf implement <slug> <slice> reviews' survives only as a manual escape when convergence: escalated. The page presents the /wf implement reviews path as the primary fix mechanism, which is now the fallback-only path.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/review.md lines 28-34 (fix loop ownership); Step 4b/4c (triage and dispatch); line 784: '/wf implement <slug> [<slice>] reviews survives only as a manual escape'`
  - **Fix:** Replace the 'Fix it via: /wf implement...' paragraph with: 'Review triages findings with you inline — you pick Fix/Defer/Dismiss for each BLOCKER/HIGH finding. Fix decisions spawn sub-agents within the review stage itself (Step 4c). /wf implement <slug> route reviews remains available as a manual escape if the review-owned loop cannot resolve a finding (convergence: escalated).'
  - _verified, confidence 0.95_

### `tutorials/installation.html`

- **Claim** (Step 5 tile linking to tutorials/quick-fix-workflow.html): The quick command for trivial changes — 3 artifacts, not 10.
  - **Reality:** Since v9.83.0 /wf-quick was retired. The current quick-fix path is `/wf intake fix`, which runs a compressed STANDARD lifecycle — no stage is skipped. It produces 5 planning artifacts (00-index.md, 01-fix.md, 02-shape.md, 03-slice.md, 04-plan.md) plus the standard /wf implement / /wf verify / /wf review chain. The linked quick-fix-workflow.html tutorial itself correctly describes this as 'a compressed standard lifecycle — it runs every SDLC stage in a single lightweight pass (skipping none).' '3 artifacts, not 10' is a relic of the old /wf-quick behavior.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md (Produces row lists 01-fix.md, 02-shape.md, 03-slice.md, 04-plan.md, 00-index.md); plugins/sdlc-workflow/docs/site/tutorials/quick-fix-workflow.html line 99 (lede correctly describes 5 artifacts); ground-truth inventory fact: intake mode: fix — purpose and artifact`
  - **Fix:** Update the tile description to reflect current behavior: e.g. 'The fast path for small changes — a compressed standard lifecycle that records every stage in a single lightweight pass.' Remove the '3 artifacts, not 10' claim.
  - _verified, confidence 0.97_

### `tutorials/quick-fix-workflow.html`

- **Claim** (The other intake modes and standalone flows / table row for /wf intake rca / 'What it produces' column): Single artifact; recommends /wf plan, /wf intake fix, or /wf intake hotfix as next step
  - **Reality:** rca standalone mode produces three files: 01-rca.md (full RCA), 02-shape.md (synthesized minimal shape so /wf plan can consume the workflow directory without modification), and 00-index.md. It is explicitly documented in the skill that it synthesizes 02-shape.md. Calling the output 'Single artifact' materially understates what gets written.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/rca.md line 23: '| Produces | 01-rca.md (full RCA), 02-shape.md (synthesized minimal shape so /wf plan works), 00-index.md |'`
  - **Fix:** Update the rca 'What it produces' cell to: '01-rca.md, 02-shape.md (synthesized minimal shape for /wf plan), 00-index.md; recommends /wf plan, /wf intake fix, or /wf intake hotfix as next step.'
  - _verified, confidence 0.95_

- **Claim** (The other intake modes and standalone flows / table row for /wf probe / 'What it produces' column): Evidence directory + findings artifact (slug required)
  - **Reality:** probe writes a single compressed slice file: .ai/workflows/<slug>/03-slice-probe-<descriptor>.md. There is no 'evidence directory' — all findings are contained in the compressed slice. probe is slug-mode only and always writes exactly one file into the existing workflow directory.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/probe.md lines 21-23: 'Write .ai/workflows/<slug>/03-slice-probe-<descriptor>.md … No new workflow, no new branch, no 01-probe.md, no new top-level 00-index.md.'`
  - **Fix:** Change the probe 'What it produces' cell to: 'A compressed slice artifact .ai/workflows/<slug>/03-slice-probe-<descriptor>.md in the existing workflow (slug required).'
  - _verified, confidence 0.97_

### `whats-new.html`

- **Claim** (<p class='lede'> (top of page, under h1 'What's new')): User-facing highlights since v9.11. Each entry links to the relevant reference page for details.
  - **Reality:** The page only covers through v9.49.0. At least nine major user-facing changes are entirely absent: v9.63.0 stale-render healing, v9.70.0 free narrative fragments, v9.72.0 tray autostart self-heal, v9.81.0 tray live-process self-heal, v9.82.0 /wf design (retired /wf-design), v9.83.0 /wf intake modes retiring /wf-quick, v9.86.0 compressed lifecycle for fix/hotfix/refactor/update-deps modes, v9.87.0 retired bespoke-artifact prose, and v9.88.0 /wf auto (18th key — end-to-end lifecycle driver). The lede implies current coverage but the changelog is 39 minor versions behind.
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md (18 keys including 'auto'), plugins/sdlc-workflow/skills/wf/reference/auto.md, plugins/sdlc-workflow/.claude-plugin/plugin.json (version: 9.88.0)`
  - **Fix:** Add changelog entries for v9.82.0 (/wf design, retired /wf-design), v9.83.0 (/wf intake modes with 8 keywords, retired /wf-quick), v9.86.0 (compressed lifecycle for change modes), and v9.88.0 (/wf auto end-to-end driver). Also add entries for v9.63.0 stale-render heal, v9.70.0 free narrative fragments, v9.72.0/v9.81.0 tray self-heal features, and v9.88.0 probe flag removal. Alternatively, add a note under the lede clarifying 'entries above cover through v9.49.0; see CHANGELOG.md for later versions.'
  - _verified, confidence 0.98_

## MINOR findings (78)

### `explanation/adaptive-routing.html`

- **Claim** (Concrete examples — After review (dl > dd)): run <code>/wf implement &lt;slice&gt; reviews</code> if the review found issues that must be addressed first
  - **Reality:** The correct argument-hint for /wf implement is `<slug> [slice-slug|reviews]`. The first positional argument is the workflow slug, not a slice-slug. The correct invocation is `/wf implement <slug> reviews`. Using `<slice>` as the placeholder label misrepresents what the first argument is and could cause a user to pass the wrong value.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/implement.md line 3 (argument-hint: <slug> [slice-slug|reviews]) and plugins/sdlc-workflow/skills/wf/SKILL.md line 31 (dispatch table row for 'implement')`
  - **Fix:** Change `<code>/wf implement &lt;slice&gt; reviews</code>` to `<code>/wf implement &lt;slug&gt; reviews</code>` to match the actual argument order.

- **Claim** (Technical detail (details > summary) section): Each stage's reference file (in <code>.claude/skills/wf/reference/</code>) defines a structured <code>next-options</code> block. The plugin reads this block at the end of a stage run and renders the menu you see. Adding a new valid transition means editing that reference file — the routing logic itself does not change.
  - **Reality:** No `next-options` block exists anywhere in the reference files. The actual mechanism is that each reference file defines prose routing guidance (labelled Option A, Option B, etc.) under an '# Adaptive routing' section. At the end of each stage run, that prose guidance directs the model to write a `## Recommended Next Stage` section into the *artifact* (the markdown file written to .ai/workflows/<slug>/). There is no structured block named `next-options` read by the plugin at runtime; the routing menu is model-authored text in the artifact, not plugin-read structured data.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/shape.md lines 212-230; plugins/sdlc-workflow/skills/wf/reference/implement.md line 180; Grep for 'next-options' across all skills/ returned zero matches.`
  - **Fix:** Replace the `next-options` block claim with an accurate description: each stage reference file contains an '# Adaptive routing' section listing viable transitions as labelled options (Option A, B, C…). The model follows these options to write a `## Recommended Next Stage` section into the stage artifact. Editing the reference file changes what options are offered; no separate routing engine reads a structured block.

### `explanation/augmentations-model.html`

- **Claim** (details > summary: Technical detail: augmentation-type discriminator): In the index schema, instrument, experiment, and benchmark share type: augmentation as their top-level type.
  - **Reality:** The augmentation-type discriminator enum in frontmatter.schema.json is ['benchmark', 'experiment', 'instrument', 'rca'] — four values, not three. The technical detail box lists only three, silently omitting rca. A reader consulting this box to understand schema validation would miss that rca is also a valid augmentation-type.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json lines 846-848`
  - **Fix:** Update the sentence to: 'In the index schema, instrument, experiment, benchmark, and rca share type: augmentation as their top-level type. The specific kind is stored in a separate augmentation-type field.'

### `explanation/branch-strategy.html`

- **Claim** (h2#dedicated — last bullet under 'What the plugin does at handoff with this strategy'): Captures live PR state into `08-handoff.md`, the handoff **artifact** — the workflow note written at the end of each stage (stage T5.3).
  - **Reality:** T5.3 is 'Final readiness re-watch'. Its primary purpose is re-running the CI watch procedure from scratch because T5.1 fix commits and T5.2 rebase force-push both retrigger CI, making the T5.0 green state stale. Capturing live PR state (reviewDecision, statusCheckRollup, readiness-verdict) is part of step 7d but is secondary to re-establishing a fresh CI green. Describing it only as 'captures live PR state' omits the critical re-watch behavior and understates why T5.3 exists.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/handoff.md lines 235-249`
  - **Fix:** Revise to: 'Re-watches CI (T5.1 fix commits and T5.2 rebase retrigger checks) and captures the final live review decision and readiness verdict into `08-handoff.md` (stage T5.3).'

- **Claim** (Mermaid flowchart diagram (div.diagram)): shared -.-> shared_eff[Push branch<br/>NO auto-PR<br/>T5.2 SKIPPED<br/>T5.1/T5.3 only if PR exists]
  - **Reality:** T5.1 is always deleted for shared branches, not conditional on PR existence. T5.2 is also always skipped for shared. T5.0 (CI watch) and T5.3 (final re-watch) are the steps that run conditionally when pr-number is recorded. The diagram omits T5.0 entirely and wrongly implies T5.1 can run for shared.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/handoff.md line 191`
  - **Fix:** Update the shared_eff node to: 'Push branch<br/>NO auto-PR<br/>T5.1/T5.2 ALWAYS SKIPPED<br/>T5.0/T5.3 only if pr-number recorded'

- **Claim** (Mermaid flowchart diagram (div.diagram)): none -.-> none_eff[No git operations<br/>Handoff artifact is the deliverable<br/>T5.1/T5.2/T5.3 all skipped]
  - **Reality:** For branch-strategy: none, T5.0, T5.1, T5.2, and T5.3 are all deleted. The diagram lists only T5.1/T5.2/T5.3 as skipped, omitting T5.0 (CI watch). Consistently, the page has no awareness of T5.0 anywhere.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/handoff.md line 192`
  - **Fix:** Update the none_eff node to: 'No git operations<br/>Handoff artifact is the deliverable<br/>T5.0/T5.1/T5.2/T5.3 all skipped'

### `explanation/build-and-dist.html`

- **Claim** (<details> Technical details — how the build works): The build script calls <code>esbuild</code> for each entry point, inlining all imported packages into a single <code>.mjs</code> file.
  - **Reality:** The build uses esbuild's code-splitting feature (splitting: true, chunkNames: '[name]-[hash]'). Shared dependencies (markdown-it, js-yaml, ajv, shared lib helpers) are extracted into dist/chunk-<hash>.mjs shared chunk files rather than being duplicated into every entry bundle. Each entry point imports the relevant chunks at runtime. The output is not a single self-contained .mjs per entry — it is a graph of entrypoint bundles plus shared chunks.
  - **Source:** `plugins/sdlc-workflow/scripts/build.mjs lines 96-124 (splitting: true, chunkNames: '[name]-[hash]')`
  - **Fix:** Change the sentence to: 'The build script calls esbuild for each entry point with code-splitting enabled. Shared dependencies (markdown-it, js-yaml, ajv, and shared library helpers) are extracted into dist/chunk-<hash>.mjs shared chunks. Entry-point bundles import those chunks at runtime — no package resolution needed. No dynamic requires, no runtime npm install.'

### `explanation/diataxis-integration.html`

- **Claim** (Section '3. The /wf-docs command runs a standalone docs cycle'): The <code>/wf-docs</code> command (one of the six top-level commands)
  - **Reality:** There are currently four top-level router commands — /wf, /wf-meta, /wf-docs, /review — plus /wf design as a sub-command of /wf. The count of six reflects the pre-retirement state when /wf-quick and /wf-design were separate top-level routers. commands.html (the authoritative reference) explicitly states 'Four top-level routers plus design, which runs as the /wf design sub-command.'
  - **Source:** `plugins/sdlc-workflow/docs/site/reference/commands.html line 98 (lede); plugins/sdlc-workflow/skills/wf-docs/SKILL.md`
  - **Fix:** Change 'one of the six top-level commands' to 'one of the four top-level commands' (or 'one of the plugin's top-level commands' to avoid fragility on future changes).

- **Claim** (Section '3. The /wf-docs command runs a standalone docs cycle'): runs an audit, plan, generate, and review cycle on a project's existing documentation
  - **Reality:** The /wf-docs orchestrator pipeline has five steps: Step 1 = Discover (inventory all existing docs), Step 2 = Audit, Step 3 = Plan, Step 4 = Generate, Step 5 = Review. The page omits the 'discover' step, which is the first and mandatory phase that finds existing docs before any audit can happen.
  - **Source:** `plugins/sdlc-workflow/skills/wf-docs/SKILL.md lines 52-65 (Step 1 — Discover), 84-127 (Step 2 — Audit), 140-191 (Step 3 — Plan), 193-226 (Step 4 — Generate), 228-278 (Step 5 — Review)`
  - **Fix:** Change 'runs an audit, plan, generate, and review cycle' to 'runs a discover, audit, plan, generate, and review cycle' to match the actual five-step orchestrator pipeline.

### `explanation/orchestrator-discipline.html`

- **Claim** (Table under "One role per stage" heading): <tr><td><code>review</code></td><td>Dispatches reviewers and aggregates their findings.</td><td>Fixes the findings it found.</td></tr>
  - **Reality:** The review stage does own a user-gated single-round fix loop (Step 4c in reference/review.md): after user triage via AskUserQuestion, every finding marked 'Fix' spawns a fix sub-agent that applies the minimal patch in the same invocation. Review dispatches sub-agents that write code; it does not merely record and hand off. The 'does not do' column overstates the separation.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/review.md lines 28, 31-32 ('you are a review dispatch orchestrator that also owns its own triage→fix loop'; 'At Step 4c you own a single-round, user-gated fix loop'); plugins/sdlc-workflow/skills/wf/SKILL.md line 33 ('single-round, review-owned fix loop')`
  - **Fix:** Revise the 'What it does not do' cell for review from 'Fixes the findings it found' to something like 'Silently fixes findings or auto-loops fixes without user approval.' Add a note that review owns one user-gated fix round; escalating to /wf implement reviews is only needed for a second round.

- **Claim** ("Why these constraints exist" section, second paragraph): When <code>review</code> finds a bug, it needs a defined path forward to <code>/wf implement … reviews</code>.
  - **Reality:** /wf implement <slug> [slice] reviews is the ESCALATION path after review's own single-round fix loop has been exhausted or when the user needs a second full implement cycle. For user-approved fixes found during a normal review invocation, the fix loop runs inside review itself (Step 4c) without requiring the user to invoke /wf implement reviews. Presenting it as the primary 'defined path forward when review finds a bug' omits that review handles user-approved fixes in-process first.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/review.md line 25 ('escalate to /wf implement <slug> [<slice>] reviews as a manual escape'); plugins/sdlc-workflow/skills/wf/SKILL.md line 33`
  - **Fix:** Revise to clarify that review runs a user-gated fix loop in-process for approved findings; /wf implement reviews is the manual escape path for a second round, not the normal next step after finding a bug.

### `explanation/the-readiness-gate.html`

- **Claim** (What the readiness check is (first paragraph, line 103)): The `/wf ship` command reads it before opening or progressing a pull request.
  - **Reality:** The PR is opened and created during `/wf handoff` (steps T4/T5 in handoff.md). By the time `/wf ship` runs, the PR already exists. Ship reads the readiness-verdict (08-handoff.md step 6) to gate the release execution — specifically the 13-step sequence of pre-flight, merge, tag, workflow-watch, post-publish — not to open or progress a pull request. The correct framing is: ship reads the verdict before running the release.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/ship.md (line 50-54: 'Read 08-handoff.md — parse readiness-verdict. If missing or ≠ ready, STOP'); plugins/sdlc-workflow/skills/wf/reference/handoff.md (step 7 T4/T5 is where push + gh pr create happens)`
  - **Fix:** Change the sentence to: 'The `/wf ship` command reads it before executing the release — merging the PR, tagging, and running the publish workflow. If the verdict is not `ready`, ship stops and tells you why.'

### `how-to/amend-or-extend.html`

- **Claim** (Amend — when the spec was wrong (second paragraph)): for example, <code>02-shape-amend-1.md</code> and <code>03-slice-auth-refresh-amend-1.md</code>
  - **Reality:** The amendment filename for slice artifacts is 03-slice-<slice-slug>-amend-<N>.md, where <slice-slug> is the individual SLICE's slug, not the workflow slug. The workflow slug (auth-refresh) and the slice slug are separate values (both appear in the frontmatter as slug: and slice-slug: respectively). In a multi-slice workflow called auth-refresh, a slice might be login-flow, so the file would be 03-slice-login-flow-amend-1.md. The page example 03-slice-auth-refresh-amend-1.md conflates the workflow slug with the slice slug, which is only accurate for single-slice workflows where the two happen to match.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/amend.md line 163 ('For each affected slice, write 03-slice-<slice-slug>-amend-<N>.md') and the frontmatter template at lines 166-184 which shows both slug: <slug> (workflow) and slice-slug: <slice-slug> (individual slice) as distinct fields`
  - **Fix:** Change the example filename from 03-slice-auth-refresh-amend-1.md to 03-slice-<slice-slug>-amend-1.md (or use a realistic example like 03-slice-login-flow-amend-1.md that makes clear the token is the individual slice slug, not the workflow slug). Alternatively add a brief parenthetical: 'where <slice-slug> is the individual slice identifier, not the workflow slug'.

### `how-to/author-ship-plan.html`

- **Claim** (Summary table row — Pre-conditions): Plugin v9.12.0+. A repo open in Claude Code. No existing <code>.ai/ship-plan.md</code> — if one exists, run <code>/wf-meta amend ship-plan</code> instead.
  - **Reality:** The full A–K ship plan (including inbound Blocks H–K covering code-quality gates, local developer experience, repo governance, and security & supply-chain gates) was not available until v9.42.0. v9.12.0 only shipped Blocks A–G (the outbound release concerns). A user on v9.12.0–v9.41.x running /wf-meta init-ship-plan will get an incomplete plan without the inbound half.
  - **Source:** `plugins/sdlc-workflow/CHANGELOG.md — entry '### Added — full DX/CI/CD pipeline contract: inbound Blocks H–J + Audits K–O (9.42.0)'; also archived/DOC-SITE-DEVIATIONS.md item D-40: 'Blocks H–K added v9.42.0'`
  - **Fix:** Change the pre-condition to 'Plugin v9.42.0+ (for full A–K plan including inbound pipeline; v9.12.0+ for outbound Blocks A–G only).' or simply raise the minimum to v9.42.0 since the current skill file reflects the full A–K contract.

### `how-to/choose-a-command.html`

- **Claim** ("By situation" table, row 1 (Command column)): Start a new feature from scratch | <code>/wf intake &lt;slug&gt;</code>
  - **Reality:** The argument-hint for plain /wf intake is `<task description>` (from intake/default.md) not a slug. A slug is an identifier for an EXISTING workflow; for a new feature the user provides a description and the slug is derived from it. The intake dispatcher's own argument-hint in SKILL.md is `[slug] [mode] <description>` — meaning `<slug>` is an OPTIONAL prefix for slug-mode (attaching to an existing workflow), not the required argument when starting fresh. The correct example is `/wf intake <description>`.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/default.md (argument-hint: <task description>); plugins/sdlc-workflow/skills/wf/SKILL.md line 27 (argument-hint: '[slug] [mode] <description>')`
  - **Fix:** Change the Command cell to `/wf intake <description>` and update the Notes to clarify that the slug is derived by Claude from the description, not supplied by the user.

### `how-to/close-workflows.html`

- **Claim** (Section: Close vs. skip — they are different things, comparison table (Command column for Close the workflow row)): <code>/wf-meta close &lt;reason&gt; &lt;slug&gt;</code>
  - **Reality:** The close.md reference frontmatter argument-hint is `<slug> [reason]` — slug is the first positional argument. However, the SKILL.md router dispatch table row for `close` lists the hint as `<reason> [slug]`. There is an internal inconsistency between the two files; the close.md Step 0 Parse is unambiguous that slug comes first ('First argument: slug'). The page's syntax `/wf-meta close <reason> <slug>` could fail for any slug that is not provided as the second argument when a reason is passed.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/close.md line 3 (argument-hint: <slug> [reason]) and line 40 (First argument: slug); plugins/sdlc-workflow/skills/wf-meta/SKILL.md line 34 (argument hint shows <reason> [slug])`
  - **Fix:** Resolve the internal inconsistency: close.md is the authoritative reference and defines slug-first. Update the table in the doc page to show `/wf-meta close <slug> <reason>` once the SKILL.md dispatch table is corrected to match close.md's argument order.

### `how-to/navigate-workflows.html`

- **Claim** (h2 'Find: see everything at a glance' — second paragraph under '/wf-meta status auth-refresh'): the full 10-stage progress map with a status for each stage (not started / in progress / complete / skipped / blocked)
  - **Reality:** The `progress` field in the 00-index schema is an object whose values are constrained to the enum ["not-started", "in-progress", "complete", "skipped"]. "blocked" is not a valid value in this enum. "Blocked" exists only as a dashboard-level workflow classification (when open-questions is non-empty or a stage shows awaiting-input), not as an individual stage progress value.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json line 112: "enum": ["not-started", "in-progress", "complete", "skipped"]; plugins/sdlc-workflow/skills/wf-meta/reference/status.md Stage Progress table (shows 'complete', 'in-progress', 'pending' — not 'blocked')`
  - **Fix:** Remove "blocked" from the stage-status list. Change to: "a status for each stage (not started / in progress / complete / skipped)". If you want to mention blocked-workflow detection, add a separate sentence explaining that workflows with open questions appear in the Blocked dashboard group.

- **Claim** (h2 'Full sub-command reference' — details table row for `/wf-meta how`): "Explain a stage's artifact in plain English." | `/wf-meta how auth-refresh plan`
  - **Reality:** `/wf-meta how` routes across five distinct modes: (A) quick code answers, (B) codebase exploration via parallel Explore agents, (C) deep web research (200+ sources, 6–8 parallel agents), (D) workflow-artifact explanation, and (E) findings explanation. The description in the table covers only Mode D. The example invocation `/wf-meta how auth-refresh plan` is valid (Mode D) but implies this is the only use.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/how.md frontmatter description: 'Routes automatically across five modes — Quick (Mode A), Codebase Explore (Mode B), Deep Research (Mode C), Workflow Explain (Mode D), and Findings Explain (Mode E)'`
  - **Fix:** Broaden the description to reflect all five modes. For example: "Ask a code question, explore the codebase, commission deep web research, or explain a workflow artifact or review findings." Optionally add a second example row showing a non-artifact invocation such as `/wf-meta how 'why does the auth token expire silently'`.

### `how-to/resume-paused-work.html`

- **Claim** (Step 1 — find your paused workflow, example output block (lines 117-119)): perf-cache-layer 05-implement 2 hours
  - **Reality:** The /wf-meta status dashboard renders stages in '<N>·<stage-name>' format per the reference implementation (e.g. '5·implement'), not in the filename-prefix format '05-implement'. The example uses artifact filename conventions rather than the dashboard stage label format.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/status.md line 16 (Pipeline: 1·intake → 2·shape → 3·slice → 4·plan → 5·implement ...); dashboard table format showing '<N>·<stage-name>' in the Stage column`
  - **Fix:** Change '05-implement' to '5·implement' (or 'implement') to match the actual dashboard stage column format.

### `how-to/run-a-release.html`

- **Claim** (h2: Invoke the command): Before the run begins, you are asked three questions once: Rollout strategy… Release window… Stakeholder overrides…
  - **Reality:** These three questions are asked at Step 3 of the 13-step run sequence — after Step 1 (pre-flight: version bump + secrets check + changelog) and Step 2 (publish dry-run) have already completed. The ship.md reference labels this '## Step 3 — Rollout questions (per-run only, never re-asked)'. They are not asked before the run begins.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/ship.md line 156 ('## Step 3 — Rollout questions (per-run only, never re-asked)')`
  - **Fix:** Change 'Before the run begins, you are asked three questions once' to accurately reflect that these questions appear mid-run (after pre-flight and dry-run), for example: 'During step 3, once per run, you are asked three questions that are never re-asked on resume.'

- **Claim** (h2: The 13 steps — reassurance, not a wall, item 4 (in the page's numbering)): Rollout setup — configures the environment per the rollout strategy you confirmed.
  - **Reality:** The implementation names this step 'Rollout questions' (ship.md Step 3). Its purpose is to ask three AskUserQuestion prompts to confirm rollout-strategy, release-window, and stakeholder overrides — not to 'configure the environment'. Environment configuration (if any) happens as part of subsequent steps. The description 'configures the environment per the rollout strategy you confirmed' implies action that does not match the step's actual behavior.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/ship.md lines 156–171 ('## Step 3 — Rollout questions')`
  - **Fix:** Rename 'Rollout setup' to 'Rollout questions' and change the description to: 'Asks three questions once per run: rollout strategy, release window, and stakeholder overrides. Never re-asked on resume.'

### `how-to/start-workflow.html`

- **Claim** (scenario list — "I want to clean up or triage a branch before going further." dd element): Three parallel sub-commands (reuse, quality, efficiency) classify findings and hand back a queue of copy-pasteable downstream commands. Routes; never writes code.
  - **Reality:** The simplify implementation dispatches three parallel sub-agents (Code Reuse, Code Quality, Efficiency), not 'sub-commands'. Sub-commands are slash-command dispatch keys (like /wf intake, /wf simplify); sub-agents are parallel Task calls inside the skill. The SKILL.md dispatch table and simplify.md frontmatter description both use 'sub-agents'.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/simplify.md line 2 (description: 'Dispatches three parallel sub-agents (Code Reuse, Code Quality, Efficiency)'); plugins/sdlc-workflow/skills/wf/SKILL.md line 39 dispatch table ('Three parallel sub-agents (Code Reuse, Code Quality, Efficiency)')`
  - **Fix:** Change 'Three parallel sub-commands (reuse, quality, efficiency)' to 'Three parallel sub-agents (Code Reuse, Code Quality, Efficiency)'.

- **Claim** (decision tree caption (p.caption element after the Mermaid diagram)): Yellow = quick intake mode (a focused, faster mode that trades artifact depth for speed).
  - **Reality:** The yellow nodes in the diagram include hotfix, refactor, update-deps, and fix — all of which are compressed STANDARD lifecycles that run every stage and produce the same set of stage artifacts as a full /wf intake workflow. They trade planning ceremony (depth of PO Q&A, design, etc.) for speed, not artifact depth. The description 'trades artifact depth for speed' is inaccurate for these modes. Additionally, probe (/wf probe) is not an intake mode at all — it is a top-level /wf key, not a mode of /wf intake.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md line 24 ('no stage is skipped'); plugins/sdlc-workflow/skills/wf/reference/intake/hotfix.md line 24 ('no stage is skipped, but the lifecycle is expedited'); plugins/sdlc-workflow/skills/wf/SKILL.md line 38 (probe is its own dispatch key, not an intake mode)`
  - **Fix:** Revise caption to: 'Yellow = compressed entry point (same 10-stage pipeline, but planning ceremony is condensed for focused or fast-turnaround work; /wf probe is a runtime-truth check, not an intake mode). Blue = full /wf pipeline (10 stages, every artifact, adaptive routing).'

### `how-to/triage-pr-comments.html`

- **Claim** (Section 'Deferring and declining suggestions', bullet 'Decline'): Decline — the loop posts a brief rationale as a new comment and resolves the thread. Nothing is recorded in frontmatter.
  - **Reality:** Declined threads are NOT resolved via the GitHub API. `handoff.md` line 537 states explicitly: 'Do NOT resolve a thread whose fix was deferred or declined — those stay open with the deferral/decline rationale in a fresh `gh pr comment`.' Additionally, declined suggestions are counted in the `triage-fixes-skipped` frontmatter field, so the claim 'Nothing is recorded in frontmatter' is also inaccurate.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/handoff.md lines 537 ('Do NOT resolve a thread whose fix was deferred or declined — those stay open') and line 561 ('triage-fixes-skipped: <count of 🟡 declined or 🔴 deferred>')`
  - **Fix:** Change the Decline bullet to: 'Decline — the loop posts a brief rationale as a new comment via `gh pr comment`, but does NOT resolve the thread (it stays open). The declined item is counted in `triage-fixes-skipped` in the handoff frontmatter.'

### `how-to/use-augmentations.html`

- **Claim** (h2 'What add-ons are', second paragraph): appends a record to the `augmentations:` list in your slice's `00-index.md` file (the central registry for that slice)
  - **Reality:** `00-index.md` is a workflow-level file at `.ai/workflows/<slug>/00-index.md` — one per workflow (slug), not one per slice. There is no per-slice `00-index.md`. Calling it 'your slice's 00-index.md' and 'the central registry for that slice' is factually wrong and will confuse users who go looking for a slice-level index file.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json lines 140-152 (augmentations field inside indexFrontmatter, which is the slug-level 00-index.md schema); plugins/sdlc-workflow/skills/wf/reference/instrument.md Step 3 ('Read 00-index.md, then add or update the augmentations: field'); plugins/sdlc-workflow/docs/site/reference/00-index-schema.html ('The file lives at .ai/workflows/<slug>/00-index.md')`
  - **Fix:** Change 'your slice's `00-index.md` file (the central registry for that slice)' to 'your workflow's `00-index.md` file (the central registry for that workflow)'.

- **Claim** (h2 'Benchmark — record a perf baseline before you change anything', second paragraph): records the `mode` (baseline or compare) in the slice index alongside the result file
  - **Reality:** The `mode` is recorded in the workflow-level `00-index.md` augmentations entry — the same slug-level file. There is no 'slice index'. Referring to it as 'the slice index' is the same error as in the previous finding.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/benchmark.md lines 171-182 (Baseline Step 4 — Update 00-index.md augmentations registry, showing mode: baseline in the augmentations list entry)`
  - **Fix:** Change 'the slice index' to 'the workflow index (`00-index.md`)'.

### `how-to/use-design.html`

- **Claim** (Section 'Picking the right command' (h2), first paragraph): The 22 commands fall into five categories.
  - **Reality:** There are 21 design commands, not 22. The lede on the same page correctly states '21 design commands'. The implementation (skills/wf/reference/design.md line 19, SKILL.md dispatch table row for 'design', and the 21 files in reference/design/ excluding _design-context.md/brand.md/product.md/shape.md) all confirm 21. Counting the page's own H3 sections: Context (2) + Producer (1) + Review & inspection (3) + Transformation (15) = 21.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/design.md lines 19-23, 48-51; plugins/sdlc-workflow/skills/wf/SKILL.md dispatch table row for 'design'`
  - **Fix:** Change '22 commands' to '21 commands'. The lede already has the correct count; the body must match it.

- **Claim** (Section 'Picking the right command' (h2), first paragraph): The 22 commands fall into five categories.
  - **Reality:** The page's own H3 sections enumerate only four categories: Context, Producer, Review & inspection (which merges 'Review / analysis' and 'Inspection' from the reference), and Transformation. The reference implementation (design.md Step 2 category table) uses five distinct categories: Producer, Transformation, Review / analysis, Inspection, and Context — splitting extract (Inspection) from audit/critique (Review / analysis). The <details> table at the bottom correctly renders all five rows. The H3 structure and the 'five categories' claim are therefore inconsistent with each other within the page.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/design.md lines 95-101 (category table)`
  - **Fix:** Either: (a) split the 'Review & inspection' H3 into two separate sections — '3. Review / analysis (audit, critique)' and '4. Inspection (extract)' — and retain the 'five categories' claim; or (b) keep the merged H3 and change the claim to 'four categories'. Option (a) aligns with the reference implementation.

### `orientation/first-10-minutes.html`

- **Claim** (Step 2 — Implement (5-7 minutes), code block showing post-implement artifact tree): .ai/workflows/typo-invalid-payload-error-message/ 00-index.md 01-fix.md 05-implement.md ← what Claude did, what tests passed, the commit hash
  - **Reality:** For change-mode (fix), /wf implement writes two files: the per-slice 05-implement.md AND an updated 05-implement.md master index (which is the same un-suffixed name in single-slice change-mode, so these collapse to one file). The artifact tree is not wrong per se, but the tree also omits 02-shape.md, 03-slice.md, and 04-plan.md which were written by the intake step but are not shown — making the cumulative tree incomplete. The 05-implement.md description as 'what Claude did, what tests passed, the commit hash' is accurate for the per-slice content.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/implement.md Produces row: '05-implement-<slice-slug>.md + updates 05-implement.md master'; Step 0.4 change-mode detail: 'write 05-implement.md (NOT the -<slice-slug>-suffixed files'`
  - **Fix:** Show the full cumulative artifact tree at this step (all five planning files plus the new implement file) so users understand the complete on-disk state. Note that the master and per-slice file share the same path in single-slice mode.

### `orientation/is-this-for-me.html`

- **Claim** (Where next (related links block, line 154)): Understand how the six commands fit together →
  - **Reality:** The linked page (orientation/mental-model.html) titles its command table 'The five things you type' and states 'The entire plugin is five commands (plus the /wf design sub-command)'. Six rows appear in the table only if /wf and /wf intake are counted separately, but the page's own framing is five. The related-link anchor text overstates by one and is inconsistent with the target page.
  - **Source:** `plugins/sdlc-workflow/docs/site/orientation/mental-model.html lines 102-104`
  - **Fix:** Change the related link text to match the target page's own framing: 'Understand how the commands fit together →' (or 'five commands' if the target page's count is authoritative). Alternatively, align both pages on a single agreed count; the easiest fix is updating mental-model.html's heading to 'six' if /wf intake is meant to be called out as a separate entry point, but that must be done there first.

### `orientation/mental-model.html`

- **Claim** (h2#the-five-things-you-type — /wf table row (line 112)): Runs the full 10-stage lifecycle. One stage at a time, each building on the last. Sub-commands: `intake`, `shape`, `slice`, `plan`, `implement`, `verify`, `review`, `handoff`, `ship`, `retro`
  - **Reality:** As of v9.88.0 /wf has 18 keys, not 10. The page's list omits 8 current keys: `design`, `probe`, `simplify`, `auto` (added in v9.88.0 — the current release — as the end-to-end lifecycle driver), `instrument`, `experiment`, `benchmark`, `profile`. A user reading this table has no idea these keys exist.
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md line 21 ('Parse $ARGUMENTS. The first token must be one of the 18 known keys below')`
  - **Fix:** Update the /wf row's sub-command list to mention all 18 keys, or at minimum add the missing major ones (`design`, `probe`, `simplify`, `auto`, `instrument`, `experiment`, `benchmark`, `profile`) with a brief note that `auto` is the new end-to-end driver.

- **Claim** (h2#the-five-things-you-type (line 104)): The entire plugin is five commands (plus the `/wf design` sub-command). Everything else is a sub-command under one of these.
  - **Reality:** The table itself has 6 rows (not 5), and the plugin ships additional user-invocable entry points not shown in the table at all: `/error-analysis` (debugging/incident-response skill), `/wide-event-observability` (observability design skill), and the `/setup-wide-logging` slash command. The 'five commands' figure is incorrect even before counting the unlisted ones, and '/wf design' is simply one of /wf's 18 sub-command keys, not a standalone command.
  - **Source:** `plugins/sdlc-workflow/skills/ directory (9 skills including error-analysis, wide-event-observability); plugins/sdlc-workflow/commands/setup-wide-logging.md`
  - **Fix:** Remove the 'five commands' count claim (it is wrong and the table itself falsifies it). Either count accurately (e.g. 'a handful of commands') or enumerate the major user-facing entry points including /error-analysis and /wide-event-observability. Reframe /wf design as a /wf sub-command key, not a separate peer command.

- **Claim** (h2#how-a-full-change-flows (line 182)): By the time you reach `handoff`, there are up to 10 files capturing every decision you made along the way.
  - **Reality:** For any multi-slice workflow the file count far exceeds 10. A two-slice feature with augmentations produces: 01-intake.md, 02-shape.md, 03-slice.md, 03-slice-<s1>.md, 03-slice-<s2>.md, 04-plan-<s1>.md, 04-plan-<s2>.md, 05-implement-<s1>.md, 05-implement-<s2>.md, 06-verify-<s1>.md, 06-verify-<s2>.md, 07-review-<s1>.md, 07-review-<s2>.md, 08-handoff.md, 00-index.md = 15 files minimum, before any augmentation artifacts (04b-instrument.md, 04c-experiment.md, 05c-benchmark.md) or design artifacts (02b-design.md, 02c-craft.md). The '10 files' figure is accurate only for a single-slice workflow with no augmentations.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/ (per-slice artifact naming in plan.md, implement.md, verify.md, review.md); frontmatter.schema.json artifact type enumeration`
  - **Fix:** Change 'up to 10 files' to 'at least one file per stage, and more for multi-slice work' or similar language that does not cap the count at 10.

### `reference/00-index-schema.html`

- **Claim** (Required fields table, row for 'stage-number'): <td><code>stage-number</code></td><td>number</td><td>1–10.</td>
  - **Reality:** The schema defines stage-number as { "type": "integer", "minimum": 0 }. The minimum is 0, not 1. Stage 0 is valid (e.g. pre-intake initial state). There is also no maximum of 10 enforced by the schema.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json line 94: "stage-number": { "type": "integer", "minimum": 0 }`
  - **Fix:** Change '1–10.' to 'integer ≥ 0.' or 'integer; 0–10 in practice.'

- **Claim** (Optional fields table, row for 'workflow-type'): For quick commands (<a href="../reference/glossary.html">glossary</a>): <code>fix</code> (legacy <code>quick</code>), <code>rca</code>, <code>investigate</code>, <code>hotfix</code>, <code>refactor</code>, <code>update-deps</code>, <code>discover</code>, <code>ideate</code>, <code>simplify</code>.
  - **Reality:** 'simplify' is not a valid workflow-type value in the schema. The full enum is: ["feature", "fix", "quick", "rca", "investigate", "rf", "refactor", "hotfix", "dep-update", "update-deps", "docs", "discover", "standard"]. The page also omits valid values: 'feature', 'rf', 'dep-update', 'docs', 'standard'.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json lines 115-121: workflow-type enum property`
  - **Fix:** Replace the list with the actual schema enum: feature, fix (legacy: quick), rca, investigate, rf, refactor, hotfix, dep-update, update-deps, docs, discover, standard. Remove 'simplify'.

- **Claim** (Optional fields (set as stages run) table): <tr><th><code>compressed-slices</code></th><td>Array of <code>{ slug, slice-type, created-at }</code> objects. Appended by <code>/wf intake</code> modes when run in slug-mode. <code>slice-type</code> values: <code>fix</code>, <code>rca</code>, <code>probe</code> <span class="badge">v9.14</span>, <code>investigate</code>, <code>discover</code>, <code>hotfix</code>, <code>update-deps</code>, <code>refactor</code>, <code>ideate</code>, <code>simplify</code>.</td></tr>
  - **Reality:** The field 'compressed-slices' does not appear anywhere in the frontmatter schema (tests/frontmatter.schema.json). It is not a property of indexFrontmatter and is not validated or written by any hook. The actual mechanism for tracking slug-mode compressed-slice runs is the compressed slice files written under the workflow directory (03-slice-<mode>-<descriptor>.md), referenced via the 'workflow-files' array.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json (grep for 'compressed-slices' returns no matches)`
  - **Fix:** Remove the 'compressed-slices' row from the optional fields table. If tracking of slug-mode intake runs in the index is desired, verify against the actual skill reference files before documenting.

### `reference/08-handoff-schema.html`

- **Claim** (h2#frontmatter-base-fields / pre code block, line showing status field): status: complete
  - **Reality:** The handoffFrontmatter schema defines status as enum: ["complete", "awaiting-input"]. The skill explicitly instructs: "if the stage cannot finish, set status: awaiting-input in frontmatter and list unanswered questions" (handoff.md line 94). When T5.0 times out or any triage step stalls waiting for a human, handoff writes status: awaiting-input, not status: complete. The page presents status as if complete is the only valid value.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json line 564; plugins/sdlc-workflow/skills/wf/reference/handoff.md line 94`
  - **Fix:** Change the status line in the base fields block to: status: complete | awaiting-input, and add a one-sentence note that awaiting-input is written when the stage cannot finish (e.g., CI timed out, rebase conflict, triage bound exceeded).

- **Claim** (h2#frontmatter-base-fields / pre code block, pr-number line): pr-number: <N or 0>
  - **Reality:** The handoffFrontmatter schema declares pr-number as type: ["integer", "null"]. The canonical no-PR sentinel is null, not 0. The ground-truth inventory explicitly lists the field as "integer or null". (Note: the skill template in reference/handoff.md line 287 also shows <N or 0>, so this is a shared inaccuracy between the skill and the doc page — but the schema is the enforced contract.)
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json line 568`
  - **Fix:** Change pr-number: <N or 0> to pr-number: <N or null> to match the schema type union ["integer", "null"]. Separately, the skill template in reference/handoff.md line 287 should receive the same fix.

### `reference/09-ship-run-schema.html`

- **Claim** (h2 Frontmatter / opening paragraph and code block (lines 104–140)): Every field is YAML frontmatter between --- markers. Fields absent from the file mean that step has not run yet. [followed by frontmatter block that lists schema, type, slug, run-id, status, plan-ref, plan-version-at-run, created-at, updated-at, environment, version, prior-version, go-nogo, merge-strategy and then only evidence/outcome fields]
  - **Reality:** The shipRunFrontmatter schema (tests/frontmatter.schema.json lines 610–616) has 18 required fields. Four required fields are entirely absent from the page's frontmatter block and from all four field-group tables: tags (stringArray), refs (refs object), next-command (string), next-invocation (string). The sentence 'Fields absent from the file mean that step has not run yet' applies only to the optional evidence fields; readers seeing this sentence alongside the incomplete example may conclude the four bookkeeping fields are optional, which is wrong — the post-write-verify hook enforces the full required list.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json lines 610-616 (required array); plugins/sdlc-workflow/hooks/post-write-verify.mjs (enforces schema)`
  - **Fix:** Add tags, refs, next-command, and next-invocation to the frontmatter code block. Add a fifth field-group table ('Agent bookkeeping') documenting these four fields, noting that the agent populates them automatically and that they are required by the write-time validator.

### `reference/artifacts.html`

- **Claim** (Workflow directory tree (pre element, line referencing .ai/ off-pipeline bucket)): ├── ideation/<focus>-<ts>.md # /wf intake ideate output
  - **Reality:** Since v9.86.0 (compressed-lifecycle), `/wf intake ideate` standalone mode writes a `type: workflow-index` slug workflow to `.ai/workflows/<slug>/00-index.md` + `.ai/workflows/<slug>/01-ideate.md` (type: ideation). The `.ai/ideation/` path is a LEGACY location for old `/wf-quick ideate` runs only — the renderer still scans it for backward-compat, but no current command writes there. The ideate output now appears inside the standard workflow tree (`.ai/workflows/<slug>/`), not in a separate off-pipeline bucket.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/ideate.md (Step 6, 'Produces' table row); plugins/sdlc-workflow/scripts/render-sunflower.mjs line 219 comment ('Ideation runs (/wf-quick ideate) under .ai/ideation/')`
  - **Fix:** Replace the `ideation/<focus>-<ts>.md` entry with a note that ideate now roots a workflow-index slug under `.ai/workflows/<slug>/` (01-ideate.md). Either remove the off-pipeline entry or append '(legacy — old /wf-quick ideate runs only)' to clarify it is not the current output location.

- **Claim** (Shared frontmatter contract table, `type` row): One of: `index`, `intake`, `shape`, `slice`, `plan`, `implement`, `verify`, `review`, `review-command`, `handoff`, `ship-run`, `ship-runs-index`, `ship-plan`, `retro`, `design`, `design-contract`, `design-critique`, `design-audit`, `augmentation`, `profile`, `rca`, `fix-plan` *(legacy — back-compat only)*, `simplify-run`, `sync-report`, `resume`, `skip-record`, `shape-amendment`, `slice-amendment`, `docs-index`.
  - **Reality:** The type list omits numerous valid current types that appear in frontmatter.schema.json's oneOf branches: `workflow-index` (written by standalone /wf intake ideate, /wf simplify, and analysis modes as the 00-index.md type), `ideation` (written by /wf intake ideate 01-ideate.md), `slice-index` / `plan-index` / `implement-index` / `verify-index` (stage-index files), `design-augmentation` (design transformation artifacts in design-notes/), `project-context` (PRODUCT.md / DESIGN.md), `announce` / `risk-register` / `estimate` (wf-meta utilities), `docs-discover` / `docs-audit` / `docs-plan` / `docs-generate` (wf-docs pipeline stages). Also omitted: all legacy bespoke types in quickMetaArtifactFrontmatter (`discover`, `investigate`, `hf-brief`, `hf-plan`, `hf-implement`, `hf-verify`, `rf-brief`, `rf-baseline`, `rf-plan`, `rf-implement`, `rf-verify`, `close-record`, `routing`). The listed `fix-plan` is correctly marked legacy, but the list gives an incomplete picture of active types a user may encounter.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json (oneOf list lines 1386-1435, quickMetaArtifactFrontmatter enum lines 1371-1376); plugins/sdlc-workflow/skills/wf/reference/intake/ideate.md (type: workflow-index for 00-index, type: ideation for 01-ideate)`
  - **Fix:** Add the missing active types, at minimum: `workflow-index`, `ideation`, `design-augmentation`, `project-context`, `slice-index`, `plan-index`, `implement-index`, `verify-index`, `announce`, `risk-register`, `estimate`. The full types inventory is on reference/types.html so brevity is acceptable here, but `workflow-index` and `ideation` are especially important since they appear in the primary output of /wf intake ideate and /wf simplify. Consider pointing readers to types.html for the complete list.

### `reference/commands.html`

- **Claim** (Commands table row for '/wf design' (td cell) AND h2 '/wf design — design pipeline' opening paragraph): 22 sub-commands, run as a compressed /wf sub-command.
  - **Reality:** There are 21 design commands, not 22. The design reference file (reference/design.md frontmatter) says '21 design commands'; SKILL.md dispatch table row for 'design' says '21 design commands (craft, the 15 transforms, audit, critique, extract, setup, teach)'. The page body itself correctly enumerates: craft + audit + critique (3) + 15 transforms (colorize, typeset, animate, harden, quieter, bolder, delight, distill, clarify, adapt, layout, optimize, polish, overdrive, onboard) + setup + teach + extract (3) = 21, creating an internal inconsistency with the claimed count of 22.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/design.md frontmatter line 2 ('21 design commands'); plugins/sdlc-workflow/skills/wf/SKILL.md line 37`
  - **Fix:** Change both instances of '22 sub-commands' to '21 sub-commands' in the table cell and the h2 section opening sentence.

- **Claim** (h2 '/wf — the lifecycle command' table, row for '/wf implement'): /wf implement | <slug> <slice> [reviews] | 5 | reviews mode applies review-finding fixes.
  - **Reality:** The slice argument is optional, not required. The canonical argument hint is '<slug> [slice-slug|reviews]' — the slice defaults to the workflow's selected slice when omitted. Showing '<slug> <slice> [reviews]' (without brackets around slice) implies users must always pass a slice explicitly, which is incorrect.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/implement.md frontmatter line 3 ('argument-hint: <slug> [slice-slug|reviews]'); plugins/sdlc-workflow/skills/wf/SKILL.md line 31 ('implement | <slug> [slice|reviews]')`
  - **Fix:** Change the Args cell to '<slug> [slice|reviews]' to match the canonical argument hint and make clear the slice is optional.

- **Claim** (h2 '/wf — the lifecycle command' table, row for '/wf ship'): /wf ship | <slug> [environment] | 9 | Plan-driven, replayable release.
  - **Reality:** The ship reference frontmatter declares 'argument-hint: <slug> [environment] [--init-plan]'. The '--init-plan' flag is handled by the ship reference (it prints a redirect message pointing the user to '/wf-meta init-ship-plan' and stops). Omitting it means users who try '--init-plan' get no guidance from this page that it is a redirect alias rather than a real ship flag.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/ship.md frontmatter line 3 ('argument-hint: <slug> [environment] [--init-plan]')`
  - **Fix:** Update the Args cell to '<slug> [environment] [--init-plan]' and optionally add a note: '--init-plan redirects to /wf-meta init-ship-plan'.

- **Claim** (h2 '/wf — the lifecycle command' opening paragraph): Dispatches across 10 lifecycle stages (the named steps a workflow moves through, from intake to retro) plus 4 add-ons (add-ons are optional add-on stages that layer observability, experiments, or performance benchmarks onto a slice).
  - **Reality:** The /wf key has 18 sub-commands total: 10 lifecycle stages + design + probe + simplify + auto + 4 augmentation add-ons (instrument, experiment, benchmark, profile) = 18. The page's own table below this paragraph lists 16 sub-commands (excluding auto and design). Saying '4 add-ons' is accurate only for the augmentation subset; the paragraph does not account for probe, simplify, design, or auto at all, leaving readers with an incomplete picture of what /wf dispatches.
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md lines 21-44 (18-key dispatch table)`
  - **Fix:** Update the paragraph to say 'Dispatches across 10 lifecycle stages plus design, probe, simplify, auto, and 4 observability/performance add-ons (instrument, experiment, benchmark, profile) — 18 sub-commands in total.' Alternatively, keep it brief and link to the /wf reference page for the full list.

### `reference/glossary.html`

- **Claim** (Sub-command entry): /wf design has 22, /review has 31 dimensions plus a sweep mode.
  - **Reality:** The /wf design sub-command has exactly 21 design commands (craft, audit, critique, extract, setup, teach, animate, bolder, clarify, colorize, delight, distill, harden, layout, onboard, optimize, overdrive, polish, quieter, typeset, adapt). This is confirmed in skills/wf/reference/design.md frontmatter ('21 design commands'), the argument-hint list in that file (21 entries), and in skills/wf/SKILL.md dispatch table ('The 21 design commands'). The count 22 is incorrect.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/design.md (frontmatter line: '21 design commands'); plugins/sdlc-workflow/skills/wf/SKILL.md line 37 ('The 21 design commands')`
  - **Fix:** Change '22' to '21' in the Sub-command entry: '/wf design has 21, /review has 31 dimensions plus a sweep mode.'

- **Claim** (Fragment entry): 13 artifact types require a sibling fragment.
  - **Reality:** The current `RICH_TIER_TYPES` set in hooks/post-write-verify.mjs has 14 entries: review, plan, design, ship-run, rca, benchmark, experiment, instrument, profile, simplify-run, review-command, design-audit, design-critique, and design-contract (added at v9.71.0). The 13 count predates the addition of design-contract. whats-new.html already reflects the correct count of 14.
  - **Source:** `plugins/sdlc-workflow/hooks/post-write-verify.mjs lines 59-68 (RICH_TIER_TYPES set, 14 members including design-contract); plugins/sdlc-workflow/docs/site/whats-new.html ('one of 14 types')`
  - **Fix:** Update '13 artifact types' to '14 artifact types' to match the current RICH_TIER_TYPES set in post-write-verify.mjs, which includes design-contract since v9.71.0.

- **Claim** (Add-on (augmentation) entry): The three main types are <code>instrument</code>, <code>experiment</code>, and <code>benchmark</code>, all sharing <code>type: augmentation</code> with an <code>augmentation-type</code> discriminator.
  - **Reality:** The augmentation-type enum in frontmatter.schema.json has four values: benchmark, experiment, instrument, rca. The rca augmentation-type (type: augmentation, augmentation-type: rca) is a valid fourth variant — confirmed in the schema at augmentationFrontmatter.$defs and in post-write-verify.mjs fragmentOwningType() comment ('benchmark / experiment / instrument / rca'). The glossary entry omits rca from the augmentation-type list.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json line 847 (augmentation-type enum: ["benchmark", "experiment", "instrument", "rca"]); plugins/sdlc-workflow/hooks/post-write-verify.mjs line 97 comment`
  - **Fix:** Update the Add-on entry to list all four augmentation-types: 'The four augmentation-types are `instrument`, `experiment`, `benchmark`, and `rca`, all sharing `type: augmentation` with an `augmentation-type` discriminator.'

### `reference/hooks.html`

- **Claim** (h3: pre-write-validate (PreToolUse: Write) — bullet: Filename convention): files must match NN-stagename.md or NNa-stagename.md (for sub-stages like 02b-design.md), plus the allowlisted names risk-register.md, estimate.md, announce.md, po-answers.md, and anything under design-notes/.
  - **Reality:** pre-write-validate.mjs validateFilename() (lines 36-45) also exempts files matching the pattern ^skip-.+\.md$ (e.g. skip-shape.md, skip-record.md) used by /wf-meta skip records. The page's allowlist omits this pattern.
  - **Source:** `plugins/sdlc-workflow/hooks/pre-write-validate.mjs lines 36-45`
  - **Fix:** Add skip-<name>.md to the allowlisted names bullet, e.g.: 'plus the allowlisted names risk-register.md, estimate.md, announce.md, skip-<name>.md (wf-meta skip records), po-answers.md, and anything under design-notes/.'

### `reference/pipeline.html`

- **Claim** (Stage 2b — Design (optional): add a visual contract table (lines 162-165)): <tr><th>Produces</th><td><code>02b-design.md</code> — UX brief, register, anti-goals, visual contract.</td></tr>
  - **Reality:** /wf design <slug> craft produces two artifacts: 02b-design.md (design brief — register, anti-goals, state inventory) AND 02c-craft.md (visual contract — north-star mock, mock-fidelity inventory, implementation contract). 'Visual contract' is produced in 02c-craft.md, not 02b-design.md. The diagram on the same page correctly shows both as separate nodes.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/design.md lines 155-160 (Step 4A craft description); also corroborated by the I/O graph on this same page which shows 02b-design.md (brief) and 02c-craft.md (visual contract) as distinct nodes`
  - **Fix:** Change Produces cell to: '<code>02b-design.md</code> (UX brief, register, anti-goals) + <code>02c-craft.md</code> (visual contract — north-star mock, mock-fidelity inventory)'

- **Claim** (Lede paragraph (line 98)): You do not need this page to use the plugin; start with <a href="../tutorials/quick-start.html">Quick start</a> instead.
  - **Reality:** tutorials/quick-start.html does not exist. The tutorials directory contains first-workflow.html, installation.html, and quick-fix-workflow.html.
  - **Source:** `plugins/sdlc-workflow/docs/site/tutorials/ (directory listing — no quick-start.html present)`
  - **Fix:** Change the link target to ../tutorials/first-workflow.html (the full feature walkthrough) or ../tutorials/installation.html (the install tutorial), whichever better serves first-time users.

### `reference/review.html`

- **Claim** (#severity — Severity levels table, HIGH row): Same routing options as BLOCKER.
  - **Reality:** HIGH findings in the current implementation go through the same triage at Step 4b (Fix/Defer/Dismiss via AskUserQuestion) and the same review-owned fix loop. But HIGH findings (unlike BLOCKERs) can be deferred and still produce a 'Ship with caveats' verdict — routing is NOT the same as BLOCKER. High findings do NOT require routing to `/wf implement reviews`; they can be deferred and shipped with caveats. '/wf implement reviews' as the routing for HIGH is stale.
  - **Source:** `plugins/sdlc-workflow/skills/review/SKILL.md lines 88-90 ('Ship with caveats — HIGH only (no BLOCKER)'); plugins/sdlc-workflow/skills/wf/reference/review.md Step 4b (HIGH findings can be triaged Fix/Defer/Dismiss) and Step 4c (fix loop only for Fix decisions)`
  - **Fix:** Update HIGH row to: 'Triage via Fix/Defer/Dismiss. Fixed findings go through the review-owned fix loop inline. Deferred HIGH findings produce a Ship-with-caveats verdict and do not block shipping. `/wf implement reviews` is only a manual escape.'

- **Claim** (#integration — Integration with /wf review, opening paragraph): You can also reach it through the workflow lifecycle: `/wf review <slug> <slice>` uses this command under the hood.
  - **Reality:** `/wf review` does NOT invoke the `/review` skill as an intermediary. It loads the same dimension rubric files (skills/review/reference/*.md) directly into its own sub-agent prompts, but has its own orchestration logic: it selects relevant dimensions based on workflow context, dispatches them in parallel, owns a triage-and-fix loop, and writes workflow artifacts. The `/review` skill has different orchestration (single-dimension inline vs sweep). SKILL.md line 46 explicitly distinguishes them: 'For ad-hoc PR review with no workflow context, use the bare `/review <dim>` skill instead.'
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md line 46; plugins/sdlc-workflow/skills/wf/reference/review.md Step 2 ('Each command maps to ${CLAUDE_PLUGIN_ROOT}/skills/review/reference/<name>.md') and Step 3 ('Execute the review command at ${CLAUDE_PLUGIN_ROOT}/skills/review/reference/{command-name}.md')`
  - **Fix:** Replace 'uses this command under the hood' with: 'Both skills share the same underlying dimension rubric files, but `/wf review` has its own workflow-aware orchestration: it reads workflow artifacts to determine which dimensions matter for this feature, dispatches them in parallel with context injected, owns a triage-and-fix loop, and writes workflow stage artifacts. Use `/review` standalone for ad-hoc spot-checks outside a workflow.'

- **Claim** (#integration — Integration with /wf review, numbered list items 4 and 6): Each sub-agent writes findings to `07-review-<slice>-<dimension>.md`. [...] Writes a master `07-review-<slice>.md` with the final verdict.
  - **Reality:** `/wf review` operates in two modes controlled by `review-scope` in `00-index.md` (set at intake). Per-slice mode writes `07-review-<slice-slug>.md` + `07-review-<slice-slug>-<command>.md` per dimension. Slug-wide mode writes a single `07-review.md` (no slice suffix) + `07-review-<command>.md` per dimension. The doc only describes per-slice artifacts, leaving slug-wide behavior undocumented.
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md line 33 ('Scope follows `review-scope` in `00-index.md`…`per-slice` (default) writes `07-review-<slice>.md`…`slug-wide` writes a single `07-review.md`'); plugins/sdlc-workflow/skills/wf/reference/review.md Steps 5 and 5b`
  - **Fix:** Add a note after item 6: 'Artifact names depend on `review-scope` (set at intake): per-slice mode produces `07-review-<slice>.md` + `07-review-<slice>-<dimension>.md`; slug-wide mode produces `07-review.md` + `07-review-<dimension>.md` and reviews the entire branch diff.'

- **Claim** (#integration — Integration with /wf review, opening paragraph): You can also reach it through the workflow lifecycle: `/wf review <slug> <slice>`
  - **Reality:** `/wf review` has a documented `triage` sub-mode: `/wf review <slug> triage` re-visits deferred findings on the active review artifact without re-running the full review. The argument hint in SKILL.md is `<slug> [slice|triage]`. The `triage` mode is useful after deferring findings in a prior run. The doc page shows only `<slug> <slice>` and never mentions `triage`.
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md line 33 (argument hint `<slug> [slice|triage]`); plugins/sdlc-workflow/skills/wf/reference/review.md TRIAGE MODE section (lines 40-51)`
  - **Fix:** Add a sentence or row in the integration section: 'Re-run with `/wf review <slug> triage` to re-visit deferred findings without re-running the full review — useful after initially deferring HIGH findings and then deciding to address them.'

### `reference/serve.html`

- **Claim** (h2#Configuration-reference, table introduction (line 127)): Every key in <code>~/.sdlc/hub-config.json</code> (defaults shown — the file is created with these on first run):
  - **Reality:** HUB_CONFIG_DEFAULTS in lib/hub-config.mjs includes a staleRender block with four keys: staleRender.heal (boolean, default true), staleRender.maxConcurrent (integer, default 1), staleRender.cooldownMs (integer, default 60000), staleRender.maxAttempts (integer, default 3). These keys are absent from the configuration reference table entirely. The stale-render heal feature is mentioned in the Code browser section but its configurable parameters are not documented in the config table.
  - **Source:** `plugins/sdlc-workflow/lib/hub-config.mjs line 68 (staleRender: { ...STALE_RENDER_DEFAULTS }); plugins/sdlc-workflow/lib/heal-render.mjs lines 40-45 (STALE_RENDER_DEFAULTS)`
  - **Fix:** Add a staleRender group to the config table with entries for staleRender.heal (boolean, default true, 'Automatically re-render stale views after a plugin upgrade; set false to detect-and-flag only'), staleRender.maxConcurrent (integer, default 1), staleRender.cooldownMs (integer, default 60000), and staleRender.maxAttempts (integer, default 3).

### `reference/ship-plan-schema.html`

- **Claim** (Paragraph between Block G and Block H headings ('Blocks A–G are the outbound half…')): Blocks H–K below are the <strong>inbound</strong> half — the developer-experience and governance pipeline authored by <code>/wf-meta build-pipeline</code>.
  - **Reality:** Same error as above, repeated in the body. init-ship-plan authors all blocks including H–K. build-pipeline only reads the plan and implements it.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/build-pipeline.md line 30; plugins/sdlc-workflow/skills/wf-meta/SKILL.md line 37`
  - **Fix:** Change to: 'Blocks H–K below are the inbound half — the developer-experience and governance pipeline also authored by /wf-meta init-ship-plan and enforced by /wf-meta build-pipeline.'

- **Claim** (Block H — Code-quality gates, prose paragraph after the code block): <code>commit-convention</code> is also honored by the local commit-lint gate in <code>/wf handoff</code>.
  - **Reality:** /wf handoff's commitlint gate (T3.5) detects commitlint config files directly by probing .commitlintrc, .commitlintrc.json, .commitlintrc.yaml, .commitlintrc.js, commitlint.config.js, or commitlint.config.cjs at the repo root — it does not read the ship-plan's commit-convention field. The init-ship-plan.md reference itself qualifies this: 'This is the field /wf handoff's local commit-lint gate already honors via config-file detection.' The page's phrasing implies the ship-plan field drives handoff behavior, when the causal direction is the opposite: the field records the convention that already exists as a config file.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/handoff.md line 148 (T3.5 config-file detection logic); plugins/sdlc-workflow/skills/wf-meta/reference/init-ship-plan.md line 366`
  - **Fix:** Revise to: 'commit-convention documents the convention that /wf handoff's T3.5 gate detects via config-file presence (.commitlintrc, commitlint.config.js, etc.); CI enforcement is added by /wf-meta build-pipeline (Audit L).'

### `reference/skills.html`

- **Claim** (Second paragraph of page body (before 'The four commands' heading)): The other six are support skills the model draws on for focused tasks like debugging, testing, or refactoring.
  - **Reality:** There are 5 support skills, not 6: error-analysis, imagegen, refactoring-patterns, test-patterns, wide-event-observability. The table in the 'Support skills' section lists exactly 5 rows, confirming this. 4 commands + 5 support = 9 total.
  - **Source:** `plugins/sdlc-workflow/skills/ (directory listing); support skills table on the same page lists 5 rows`
  - **Fix:** Change 'six' to 'five'.

### `reference/types.html`

- **Claim** (Summary table, 'Source of truth' row): RICH_TIER_TYPES in hooks/post-write-verify.mjs: review, plan, design, ship-run, rca, benchmark, experiment, instrument, profile, simplify-run, review-command, design-audit, design-critique (13).
  - **Reality:** RICH_TIER_TYPES in hooks/post-write-verify.mjs has 14 members, not 13. 'design-contract' was added at v9.71 and is present in the set at line 67. The full set is: review, plan, design, ship-run, rca, benchmark, experiment, instrument, profile, simplify-run, review-command, design-audit, design-critique, design-contract.
  - **Source:** `plugins/sdlc-workflow/hooks/post-write-verify.mjs lines 59-68`
  - **Fix:** Change '(13)' to '(14)' and add 'design-contract' to the enumerated list in the Source-of-truth row. Note: the hook comment marks design-contract as 'Reminder-gated only; NOT in SIBLING_YAML_VALIDATED_TYPES', which is worth adding as a parenthetical if space allows.

### `reference/wf-design.html`

- **Claim** (Transformation (15 commands) table — clarify row): <code>clarify</code> — Better UX copy, error messages, labels, instructions.
  - **Reality:** The clarify.md reference defines this command as: 'Improve the clarity and usability of a UI — reducing cognitive load, improving scannability, and making user tasks easier to accomplish.' It covers four distinct dimensions (visual clarity, informational clarity, navigational clarity, state clarity), of which copy/messaging is one sub-dimension. Characterising it as primarily a UX-copy/error-message command is too narrow and misses the visual-hierarchy and navigational dimensions that are equally prominent.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/design/clarify.md lines 1-3 and 15-22`
  - **Fix:** Replace the one-liner with: 'Reduce cognitive load, improve scannability, and make user tasks easier — visual hierarchy, copy clarity, navigation, and state communication.' This captures all four dimensions the reference covers.

- **Claim** (Artifact slots — where design files live (table row 'Per-transformation log')): Per-transformation log | <code>.ai/workflows/&lt;slug&gt;/design-notes/&lt;sub&gt;-&lt;timestamp&gt;.md</code> | Any of the 15 transformations or <code>extract</code>
  - **Reality:** The extract command writes TWO outputs: design-notes/extract-<timestamp>.md AND design-notes/tokens-extracted.css. The artifact slots table lists only the .md path pattern and omits tokens-extracted.css entirely from the table. The command catalog section (extract row) does mention both files, but the artifact slots table — which is the dedicated 'where files live' reference — is incomplete for the extract command.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/design.md lines 100, 202, 221 (extract writes extract-<timestamp>.md + tokens-extracted.css); plugins/sdlc-workflow/skills/wf/reference/design/extract.md line 129`
  - **Fix:** Add a dedicated row for the extract inspection artifact: 'Extracted token file | <code>.ai/workflows/&lt;slug&gt;/design-notes/tokens-extracted.css</code> | <code>/wf design &lt;slug&gt; extract</code>'. Alternatively, amend the Per-transformation log row to note that extract also produces a sibling tokens-extracted.css.

### `reference/wf-meta.html`

- **Claim** (#resume — /wf-meta resume [slug] summary table (Writes row)): Writes: Optionally 90-resume.md with the orientation summary
  - **Reality:** The resume reference (Step 2.1) unconditionally directs: 'Write 90-resume.md'. There is no conditional or optional path — every invocation of /wf-meta resume writes the file. The word 'Optionally' is inaccurate.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/resume.md lines 99-116 (Step 2 — Write and return)`
  - **Fix:** Change the Writes cell to '90-resume.md — orientation brief' (drop 'Optionally').

- **Claim** (#skip — /wf-meta skip <stage> [slug] summary table (Writes row)): Writes: A stub artifact for the skipped stage (e.g., 06-verify-<slice>.md with status: skipped)
  - **Reality:** The skip reference says TWO files are always written: (1) skip-<stage>.md — the named skip record capturing who, when, why, and what was bypassed; and (2) a minimal stub for the skipped stage's expected artifact. The primary named artifact is skip-<stage>.md; the stub is secondary. The page omits skip-<stage>.md entirely.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/skip.md lines 16-19 (What this command does, items 1 and 2)`
  - **Fix:** Update the Writes cell to: 'skip-<stage>.md (skip record) + stub artifact for the skipped stage (e.g., 06-verify-<slice>.md with status: skipped, for a verify skip)'

### `reference/wf-quick.html`

- **Claim** (Section 'The eight intake modes', refactor row, 'What it compresses' column): baseline → plan → implement → parity under <code>rf-*.md</code> files.
  - **Reality:** Since v9.86.0 (compressed-lifecycle change), the bespoke rf-*.md artifact types (rf-brief, rf-baseline, rf-plan, rf-implement, rf-verify) and their renderers were deleted. /wf intake refactor now writes standard artifacts: 01-refactor.md (type: intake), 02-shape.md (baseline: API surface + coverage map), 03-slice.md, 04-plan.md — plus 00-index.md. Review defaults to the refactor-safety rubric. The rf-*.md naming is legacy only.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/refactor.md — Pipeline and Produces rows; plugins/sdlc-workflow/docs/internal/COMPRESSED-LIFECYCLE-PLAN.md`
  - **Fix:** Update the refactor row to: 'Full standard lifecycle with behavior-preserving discipline. Captures test baseline in 02-shape.md before touching code, plans incremental green steps. Writes 01-refactor.md, 02-shape.md, 03-slice.md, 04-plan.md; routes to /wf implement. Review defaults to refactor-safety.' Remove the rf-*.md reference.

### `reference/wf.html`

- **Claim** (h2 heading id='wf-implement' (line 284); mode list items (lines 299, 300)): /wf implement <slug> <slice> [reviews]
  - **Reality:** The slice argument is optional: /wf implement can infer the active slice when only one slice is in-progress. The reference file argument-hint is '<slug> [slice-slug|reviews]' (square brackets = optional). The SKILL.md dispatch table also marks it optional: '<slug> [slice|reviews]'.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/implement.md line 3 (argument-hint: <slug> [slice-slug|reviews]); plugins/sdlc-workflow/skills/wf/SKILL.md line 31`
  - **Fix:** Change the h2 heading to '/wf implement <slug> [slice] [reviews]' and update the mode descriptions to reflect that slice can be omitted when inference is unambiguous.

### `tips/anti-patterns.html`

- **Claim** (h2 'Using a quick command to avoid the full pipeline' — Why it happens paragraph): For a larger change, it skips exactly the stages that prevent later rework.
  - **Reality:** Intake change-modes (fix, hotfix, refactor, update-deps) do NOT skip stages. They run compressed-but-complete lifecycles through all 10 stages. The COMPRESSED-LIFECYCLE-PLAN is explicit: 'no stage is skipped' (fix.md Compression row: 'Each planning stage is single-pass/lightweight — no stage is skipped'). The anti-pattern the section is trying to describe — using a condensed entry when the work is too large — is real, but the framing that intake modes 'skip stages' is incorrect. The relevant risk is that compressed single-pass planning produces a shallower plan for complex work, not that stages are omitted.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md line 24 ('no stage is skipped'); plugins/sdlc-workflow/docs/internal/COMPRESSED-LIFECYCLE-PLAN.md line 105`
  - **Fix:** Rewrite the Why it happens paragraph to accurately state the risk: intake modes write a single-pass, lightweight plan (shape, slice, and plan in one compressed session). For genuinely large or high-risk work this shallower planning increases the chance of implementation surprises. Drop 'skips exactly the stages that prevent later rework' — no stages are actually skipped.

- **Claim** (h2 'Using a quick command to avoid the full pipeline' — Fix paragraph): Close the quick workflow with status <code>superseded</code> and restart with <code>/wf intake</code>.
  - **Reality:** Closing a workflow is done via `/wf-meta close <slug> superseded`, which writes a 99-close.md record and updates 00-index.md with `status: closed` and `close-reason: superseded`. The page omits the command, which could lead a user to directly edit the `status` field in 00-index.md — a hand-edit that misses the 99-close.md artifact and branch/PR cleanup warnings.
  - **Source:** `plugins/sdlc-workflow/skills/wf-meta/reference/close.md lines 3, 16-20`
  - **Fix:** Specify the command: 'Run `/wf-meta close <slug> superseded` to close the old workflow, then restart with `/wf intake`.'

### `tips/escape-hatches.html`

- **Claim** (Section: Need some trail but not the full flow?): Use the intake modes (/wf intake <mode>), which compress the full workflow into a focused single call. They still write artifacts (workflow notes that form the audit trail) but skip the deeper planning stages.
  - **Reality:** Intake modes such as fix, hotfix, refactor, and update-deps are explicitly described as 'compressed STANDARD lifecycle' — they run every SDLC stage in a single accelerated pass, NOT by skipping later stages. The planning stages (shape, slice, plan) are authored as part of the mode itself. What is compressed is the pace and depth per stage, not the set of stages run. The mode then hands off to the standard /wf implement → /wf verify → /wf review chain for execution. Saying they 'skip the deeper planning stages' misrepresents the design.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md (description), plugins/sdlc-workflow/skills/wf/reference/intake/hotfix.md line 24 ('no stage is skipped')`
  - **Fix:** Replace 'but skip the deeper planning stages' with language that reflects the actual model: they compress each stage into a single accelerated pass and hand off to the standard execution chain, rather than omitting stages. For example: 'They still write artifacts for every stage (intake brief, shape, slice, plan) but in a single compressed pass, then hand off to the standard /wf implement and /wf verify chain.'

### `tips/faq.html`

- **Claim** (FAQ entry: 'Does the plugin work without git?'): Set `branch-strategy: none` in the ship plan to skip those.
  - **Reality:** `branch-strategy` is a field on the per-workflow `00-index.md` (indexFrontmatter), set at intake time. The ship plan schema (shipPlanFrontmatter, `.ai/ship-plan.md`) has no `branch-strategy` field at all — it is a project-level contract covering release pipeline, CI, governance, etc. Setting `branch-strategy: none` in the ship plan has no effect; it must be chosen during `/wf intake` so the index carries the correct value.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json line 98 (indexFrontmatter, enum: dedicated/shared/none) and lines 1051–1088 (shipPlanFrontmatter, no branch-strategy property)`
  - **Fix:** Change the sentence to: 'Set `branch-strategy: none` when running `/wf intake` — this value is recorded in the workflow index and causes handoff and ship to skip branch-dependent steps (CI polling, PR triage).' Remove the reference to the ship plan.

- **Claim** (FAQ entry: 'What is the difference between `amend`, `extend`, and `implement reviews`?'): `amend` corrects the spec. `extend` adds new work items (called slices) to an existing workflow. `implement reviews` fixes implementation bugs found in code review.
  - **Reality:** `amend` and `extend` are sub-commands of `/wf-meta`. `implement reviews` is a mode of `/wf implement`, invoked as `/wf implement <slug> reviews` where the slug argument is mandatory. Presenting `implement reviews` in backtick code style alongside `amend` and `extend` without indicating that it is a mode requiring a slug argument (not a standalone command) could cause a user to type `/wf implement reviews` with `reviews` incorrectly parsed as the slug.
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md line 31 (dispatch table: 'implement | <slug> [slice|reviews] | Code the slice; Second arg reviews triggers fix-blockers mode')`
  - **Fix:** Clarify the invocation form: change '`implement reviews`' to '`/wf implement <slug> reviews`' so users know a slug is required and it is a mode of `/wf implement` rather than a standalone `/wf-meta` command.

### `tutorials/first-workflow.html`

- **Claim** (Stage 8 — Handoff section, opening sentence): This is the biggest stage in v9.5.0.
  - **Reality:** The current plugin version is 9.88.0. The 'v9.5.0' version badge is stale by 83 minor versions and may mislead users into thinking handoff is feature-frozen at that version or that this annotation carries historical significance.
  - **Source:** `plugins/sdlc-workflow/.claude-plugin/plugin.json (version: 9.88.0)`
  - **Fix:** Remove the version qualifier entirely — 'This is the biggest stage in v9.5.0.' should become 'Handoff is the most complex stage in the pipeline.' or simply remove the version-specific qualifier.

- **Claim** (Stopping here (Ship + Retro) section, first sentence): ship is plan-driven in v9.5.0 — it requires <code>.ai/ship-plan.md</code> at the repo root, which you author once per project with <code>/wf-meta init-ship-plan</code>.
  - **Reality:** The current plugin version is 9.88.0. The 'v9.5.0' annotation is stale. The description of ship being plan-driven and requiring .ai/ship-plan.md via /wf-meta init-ship-plan is substantively correct, but the version qualification makes it appear version-conditional.
  - **Source:** `plugins/sdlc-workflow/.claude-plugin/plugin.json (version: 9.88.0); plugins/sdlc-workflow/skills/wf-meta/SKILL.md (init-ship-plan is a listed sub-command)`
  - **Fix:** Drop the version qualifier: 'For this tutorial we stop at handoff. Why? Because ship is plan-driven — it requires .ai/ship-plan.md at the repo root, which you author once per project with /wf-meta init-ship-plan.'

### `tutorials/installation.html`

- **Claim** (Step 2 — Confirm the skills loaded): You should see at least: wf, wf-meta, wf-docs, review.
  - **Reality:** The plugin ships 6 user-invocable skills: wf, wf-meta, wf-docs, review, error-analysis, and wide-event-observability. The 'at least' framing is not technically false, but omitting error-analysis and wide-event-observability means a user will not notice if those two skills fail to load. A verification step that only names 4 of 6 gives an incomplete health check.
  - **Source:** `plugins/sdlc-workflow/skills/ directory listing (9 skill dirs); SKILL.md frontmatter for imagegen (user-invocable: false), refactoring-patterns (user-invocable: false), test-patterns (user-invocable: false) — leaving 6 user-invocable`
  - **Fix:** Extend the expected list: 'You should see at least: wf, wf-meta, wf-docs, review, error-analysis, wide-event-observability.' This gives a complete health check of user-invocable skills.

### `tutorials/quick-fix-workflow.html`

- **Claim** (Step 1 — Start the quick-fix workflow / 'What 00-index.md looks like' code block): slug: typo-invalid-payload workflow-type: fix status: in-progress created: 2026-06-09
  - **Reality:** The indexFrontmatter schema requires 22 fields; critically: (1) 'schema: sdlc/v1' is required but absent from the example; (2) the date field must be 'created-at' (ISO-8601 datetime), not 'created' (date-only string). A user copying this frontmatter block produces a schema-invalid artifact that fails post-write-verify.
  - **Source:** `plugins/sdlc-workflow/tests/frontmatter.schema.json lines 75-81 (required array includes 'schema', 'created-at'); plugins/sdlc-workflow/skills/wf/reference/intake/fix.md lines 178-224 (full 00-index.md template)`
  - **Fix:** Replace the abbreviated 00-index.md example with a realistic conformant excerpt that includes 'schema: sdlc/v1', uses 'created-at' (ISO-8601), sets 'status: active', and notes that the full 22-field block is required.

- **Claim** (The other intake modes and standalone flows / table row for /wf intake ideate / 'What it produces' column): Single artifact under ideation/
  - **Reality:** ideate standalone produces .ai/workflows/<slug>/01-ideate.md (type: ideation) plus 00-index.md (type: workflow-index) — both inside the standard .ai/workflows/<slug>/ directory, not in a separate ideation/ directory. The skill's Produces row reads: 'A type: workflow-index slug workflow: .ai/workflows/<slug>/01-ideate.md … + a lightweight 00-index.md'. There is no top-level ideation/ output for new standalone runs (legacy .ai/ideation/ renders are retained only for backward compat).
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/ideate.md line 27: '| Produces | A type: workflow-index slug workflow: .ai/workflows/<slug>/01-ideate.md (type: ideation — ranked ideas + adversarial filter log) + a lightweight 00-index.md (type: workflow-index).'`
  - **Fix:** Change the ideate 'What it produces' cell to: '01-ideate.md (type: ideation, ranked candidates + adversarial filter log) + 00-index.md (type: workflow-index) under .ai/workflows/<slug>/'

- **Claim** (Step 3 — Handoff or commit directly): Step 3 — Handoff or commit directly … /wf handoff typo-invalid-payload
  - **Reality:** The standard compressed-fix chain is implement → verify → review → handoff. The walkthrough jumps from Step 2 (/wf implement) directly to Step 3 (/wf handoff), omitting /wf verify entirely. The handoff command 'Refuses if any required review has unresolved blockers' — but the user needs to run /wf verify first to generate 06-verify.md, then /wf review to generate 07-review.md, before handoff is gated-ready. The lede paragraph on line 99 correctly names 'the standard /wf implement → /wf verify → /wf review chain' but the step-by-step body never mentions /wf verify or /wf review as explicit steps.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md line 18 (pipeline row: '/wf implement (→05) → /wf verify (→06) → /wf review (→07) → /wf handoff'); plugins/sdlc-workflow/skills/wf/SKILL.md dispatch table rows for verify and handoff`
  - **Fix:** Insert a Step 3 — Verify and review section between implement and handoff, showing '/wf verify typo-invalid-payload' and '/wf review typo-invalid-payload', then renumber the current Step 3 to Step 4.

### `whats-new.html`

- **Claim** (h2 'v9.49.0 — Branch-aware hub'): Each slug row shows a soft liveness badge: <code>live</code>, <code>merged</code>, <code>gone</code>, or <code>unknown</code>.
  - **Reality:** The livenessBadge() function in hub-dashboard.mjs renders 'merged' (for branchState=merged) and 'branch gone' (for branchState=gone — not the bare word 'gone'). For live and unknown states, the function returns an empty string — no badge is rendered at all. So users looking for a 'gone' badge will find 'branch gone', and 'live'/'unknown' produce no visible indicator.
  - **Source:** `plugins/sdlc-workflow/renderers/hub-dashboard.mjs lines 303-310 (livenessBadge function: if st==='gone' return '<span class="lq gone">branch gone</span>'; live/unknown return '')`
  - **Fix:** Change the badge description to: 'merged' or 'branch gone' (rendered as visible chips); active and unknown slugs show no badge.

## NIT findings (9)

### `explanation/adaptive-routing.html`

- **Claim** (Technical detail (details > summary) section): Each stage's reference file (in <code>.claude/skills/wf/reference/</code>)
  - **Reality:** The plugin resolves its reference files via `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/`. When installed, the plugin root is at a path like `.claude/plugins/sdlc-workflow/` (not `.claude/skills/wf/`). The path `.claude/skills/wf/reference/` does not exist as a user-visible filesystem path.
  - **Source:** `plugins/sdlc-workflow/skills/wf/SKILL.md line 23 ('each resolves to ${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/<key>.md') and line 79`
  - **Fix:** Change the path hint to `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/` (the env-var form used in the skill itself) or simply describe it as 'the plugin's reference files' without quoting a literal path, since the exact installation path varies.

### `explanation/build-and-dist.html`

- **Claim** (What runs from dist/ — second bullet): The renderer and serve daemons: <code>render-sunflower.mjs</code>, <code>render-sunflower-serve.mjs</code>, and <code>hub-serve.mjs</code>.
  - **Reality:** Four additional scripts are bundled as dist/ entrypoints: hub-ensure.mjs (detached helper spawned by write and session hooks to trigger render drain), tray-heal.mjs (detached stale-tray reconciler spawned by session-start-orient), hub-upgrade.mjs (controlled runtime upgrade with rollback), and verify-runtime.mjs (runtime integrity self-check). All appear in SCRIPT_ENTRIES in build.mjs.
  - **Source:** `plugins/sdlc-workflow/scripts/build.mjs lines 63-72 (SCRIPT_ENTRIES array)`
  - **Fix:** Expand the bullet to mention the four additional bundled scripts, or add a sentence such as: 'Several maintenance and coordination helpers are also bundled: hub-ensure.mjs (render-queue drain trigger), hub-upgrade.mjs (runtime upgrade), tray-heal.mjs (stale-tray reconcile), and verify-runtime.mjs (integrity check).'

### `how-to/amend-or-extend.html`

- **Claim** (Where next (related links section)): <a href="../reference/commands.html">See the full /wf-meta amend argument list &rarr;</a>
  - **Reality:** The commands.html page has only a one-line table entry for /wf-meta amend. The full argument list, all supported invocation forms (from-review, from-retro, <slice-slug>, ship-plan), and the amendment workflow description live in reference/wf-meta.html at the #amend anchor. Pointing to commands.html is not wrong but sends users to a much thinner description.
  - **Source:** `plugins/sdlc-workflow/docs/site/reference/commands.html (single table row: '<code>/wf-meta amend</code><td><code>&lt;scope&gt; &lt;target&gt;</code></td><td>Corrects a prior artifact...'); plugins/sdlc-workflow/docs/site/reference/wf-meta.html (#amend section with full invocation table at lines 239-243)`
  - **Fix:** Change the related link to reference/wf-meta.html#amend so users land on the full argument table (from-review, from-retro, <slice>, ship-plan) rather than the single-row summary in commands.html.

### `index.html`

- **Claim** (Tile grid, tile for orientation/mental-model.html): "The six commands. What artifacts are. How it all fits."
  - **Reality:** The linked mental-model.html page uses the heading 'The five things you type' and describes 'five commands (plus the /wf design sub-command)'. The tile blurb on index.html says 'six commands', which is defensible as 5+1=6 but does not match the prose heading on the linked page. Neither number is fully accurate against the current implementation (which has 18 /wf sub-command keys plus wf-meta, wf-docs, review, and other top-level commands), but the discrepancy is between index.html's teaser text and the linked page's own framing.
  - **Source:** `plugins/sdlc-workflow/docs/site/orientation/mental-model.html line 102 (heading 'The five things you type') and line 104 ('five commands (plus the /wf design sub-command)')`
  - **Fix:** Align the tile blurb with what mental-model.html actually says. Either change the blurb to 'The five commands. What artifacts are. How it all fits.' to match the linked page's own heading, or update mental-model.html to say 'six commands' consistently. Note that mental-model.html's own command table is also stale (lists only 10 /wf sub-commands, omitting design, probe, simplify, auto, instrument, experiment, benchmark, profile) — updating both pages together is advisable.

### `reference/artifacts.html`

- **Claim** (Workflow directory tree (pre element, augmentation artifact entries)): ├── 04b-instrument.md # Optional — observability add-on (workflow-scoped) │ ├── 04c-experiment.md # Optional — experiment add-on (workflow-scoped) │ ... │ ├── 05c-benchmark.md # Optional — perf add-on (workflow-scoped)
  - **Reality:** These filenames and locations are correct per the ground truth (04b-instrument.md, 04c-experiment.md, 05c-benchmark.md at the workflow root). However, the comment 'workflow-scoped' is slightly misleading — per the ground truth they are actually written under slices/<slice-slug>/ in the nested layout, matched by SLICE_RE in _paths.mjs. In the flat layout used by current workflows they appear at the workflow root as shown. This is not incorrect for the flat layout but the comment omits the slice-scoped context.
  - **Source:** `plugins/sdlc-workflow/renderers/_paths.mjs (SLICE_RE handles augmentations under slices/<slice>/ subtree); ground truth inventory (augmentation-substage-filename-mapping topic)`
  - **Fix:** Minor: the filenames are correct for the flat workflow layout. No change strictly required, but adding a note such as '(flat layout; nested layout uses slices/<slice-slug>/04b-instrument.md)' would be complete.

### `reference/serve.html`

- **Claim** (h2#Health-endpoint section (line 222)): The supervisor uses the reported <code>version</code> for stale-daemon reaping
  - **Reality:** The hub supervisor (hub-lifecycle.mjs) keys adoption on hub.runtimeVersion from the health response's hub object, not the legacy top-level version field. Per the hub-serve.mjs comment at line 394-396: 'The supervisor adopts a hub whose hubName + protocol are compatible and whose runtimeVersion matches — it never reaps merely because the caller's PLUGIN package version differs.' The top-level version field is documented in render-sunflower-serve.mjs as a 'Legacy display alias' (line 45-46). For the per-repo daemon reaping in ensureServeLifecycle, serve-lifecycle.mjs line 84 does read body.version — but that body.version equals runtimeVersion, not the plugin package version per se.
  - **Source:** `plugins/sdlc-workflow/lib/hub-lifecycle.mjs lines 75-80 (adoption keys on runtimeVersion); plugins/sdlc-workflow/scripts/hub-serve.mjs lines 394-406 (version as legacy alias); plugins/sdlc-workflow/lib/serve-lifecycle.mjs lines 83-84 (per-repo daemon reaping reads body.version)`
  - **Fix:** Update the sentence to: 'The hub supervisor uses hub.runtimeVersion from the health payload for adoption and reaping; the top-level version field is a legacy alias kept for pre-v9.75 compatibility.' Alternatively, if the sentence is scoped to per-repo daemon reaping only, clarify that context explicitly.

### `reference/wf.html`

- **Claim** (summary table under h2 id='wf-profile' (line 602)): Produces: A profiling report
  - **Reality:** The specific artifact path is .ai/profiles/profile-<timestamp>-<slug>/01-profile.md. 'A profiling report' is vague relative to every other summary table row on the page which names the exact filename.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/profile.md line 29 (Produces: .ai/profiles/profile-<timestamp>-<slug>/01-profile.md)`
  - **Fix:** Change the Produces cell to: <code>.ai/profiles/profile-&lt;timestamp&gt;-&lt;slug&gt;/01-profile.md</code>

### `tips/anti-patterns.html`

- **Claim** (h2 'Using a quick command to avoid the full pipeline' — Symptom paragraph): <code>01-quick.md</code> describes a feature touching five files, a migration, and a new API surface.
  - **Reality:** `01-quick.md` is a legacy artifact filename from pre-v9.18.0 (the old `/wf-quick` era). Since v9.18.0 (wf-quick fix rename) and fully superseded by v9.83.0 (compressed-lifecycle), the current filename for the fix intake mode is `01-fix.md`. The implement.md skill explicitly labels `01-quick.md` as 'legacy — slugs created before v9.18.0'. A user reading this page who creates a new workflow via `/wf intake fix` will produce `01-fix.md`, not `01-quick.md`.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/intake/fix.md line 23 (Produces row); plugins/sdlc-workflow/skills/wf/reference/implement.md line 49 ('Compressed mode: `01-fix.md` must exist (or legacy `01-quick.md` for pre-v9.18.0 slugs — check both paths)')`
  - **Fix:** Replace `01-quick.md` with `01-fix.md` in the symptom example. The full sentence should read: '`01-fix.md` describes a feature touching five files, a migration, and a new API surface.'

### `tips/faq.html`

- **Claim** (FAQ entry: 'My PR has a bot comment I don't want to triage. Can I ignore it?'): If the triage loop cycles more than five times without resolving, the readiness check flips to `awaiting-input` and stops
  - **Reality:** The handoff reference enforces a maximum of 5 iterations: 'Maximum 5 iterations. After the bound, set readiness-verdict: awaiting-input and STOP.' The bound fires at iteration 5, not after iteration 6.
  - **Source:** `plugins/sdlc-workflow/skills/wf/reference/handoff.md line 426 ('Maximum **5 iterations**. After the bound, set `readiness-verdict: awaiting-input` and STOP.')`
  - **Fix:** Change 'more than five times' to 'five times (the maximum)' to match the actual bound.

## Codex-parity findings (17)

### codex-wf-tree

> File set is in parity: every reference file present in the Claude tree (plugins/sdlc-workflow/skills/wf/) exists in the Codex tree (plugins/sdlc-workflow-codex/skills/wf/), and vice versa, with one legitimate addition in Codex (agents/openai.yaml). The 18 top-level keys are correctly listed in the Codex SKILL.md dispatcher (including auto as the 18th). All 8 intake modes, all 21 design commands, and all design sub-directories match exactly. Expected substitutions ($wf, $wf-meta, $wf-docs, relative paths instead of ${CLAUDE_PLUGIN_ROOT}, .codex/ instead of .claude/, skill names instead of slash-command names) are consistent across most files. Five substantive drifts were found: (1) both SKILL.md tables say ship writes 09-ship.md — stale, the true artifact is 09-ship-run-<run-id>.md; (2) Codex auto.md External Output Boundary line still says .claude/ and slash-command names instead of .codex/ and skill names — missed adaptation; (3) Codex SKILL.md lacks disable-model-invocation: true (Claude Code-specific field — expected omission but the doc-site shipped in the Codex runtime/ describes this flag as present on wf, wf-meta, wf-docs); (4) Codex SKILL.md description adds a $wf-quick retirement notice not present in the Claude description — harmless extra text, low concern; (5) Codex review.md is missing the Task Tracking section (TaskCreate/TaskUpdate bookkeeping) present in Claude review.md — Codex task-tracking API differs but the section is absent entirely rather than adapted.

- **[major]** `plugins/sdlc-workflow/skills/wf/SKILL.md (line 35) AND plugins/sdlc-workflow-codex/skills/wf/SKILL.md (line 36)` — Both SKILL.md dispatcher tables describe ship as: 'Release notes + ship; writes 09-ship.md.'
  - codex: Same stale claim: 'writes 09-ship.md'
  - **Fix:** Update the ship row in both SKILL.md dispatcher tables to read: 'writes 09-ship-run-<run-id>.md (per release) + 09-ship-runs.md index. Legacy 09-ship.md is read-only.'

- **[minor]** `plugins/sdlc-workflow-codex/skills/wf/reference/auto.md (line 8)` — Codex auto.md External Output Boundary still references .claude/ and slash-command names.
  - codex: Internal context includes workflow artifact paths (`.ai/workflows/...`, `.claude/...`, `.ai/dep-updates/...`), stage names or numbers, slash-command names, task/sub-agent names ...
  - **Fix:** In plugins/sdlc-workflow-codex/skills/wf/reference/auto.md line 8, replace '.claude/...' with '.codex/...' and 'slash-command names' with 'skill names', matching the adaptation pattern in all other Codex reference files (benchmark.md, verify.md, review.md, etc.).

- **[minor]** `plugins/sdlc-workflow-codex/skills/wf/reference/review.md` — Codex review.md is missing the Task Tracking section present in the Claude version.
  - codex: No Task Tracking section. No TaskCreate/TaskUpdate bookkeeping calls described anywhere in the file.
  - **Fix:** Evaluate whether Codex has an equivalent task-tracking mechanism. If Codex supports an analogous API (e.g., shell-based progress markers), add an adapted Task Tracking section. If Codex has no equivalent, add a comment documenting the intentional omission. The current state is silent — a reader cannot tell if this was a deliberate removal or an oversight.

- **[nit]** `plugins/sdlc-workflow-codex/skills/wf/SKILL.md (line 3, description field)` — Codex SKILL.md description includes a $wf-quick retirement notice not present in the Claude SKILL.md description.
  - codex: Description ends with: '($wf-quick is retired — use $wf intake <mode>, $wf probe, and $wf simplify.)'
  - **Fix:** Either add the same retirement notice to the Claude SKILL.md description field for symmetry, or remove it from the Codex description field. Either direction is fine; the current asymmetry is only cosmetic.

- **[nit]** `plugins/sdlc-workflow-codex/skills/wf/SKILL.md` — Codex SKILL.md is missing the disable-model-invocation: true frontmatter field that the Claude SKILL.md carries. The doc-site (runtime/docs/site/reference/skills.html), which is byte-identical in the Codex runtime/, documents that wf, wf-meta, and wf-docs all carry this flag.
  - codex: Frontmatter has only: name, description, argument-hint. No disable-model-invocation field.
  - **Fix:** No action needed in skill files (field is unsupported in Codex). Optionally update the doc-site wording to clarify the field is Claude-host-specific, but this is a low-priority doc accuracy nit.

### codex-meta-docs-refs

> wf-meta and wf-docs sub-command rosters are in full parity (12 and 7 primitives respectively, identical names and descriptions). The references/ vs reference/ asymmetry is mostly intentional: Codex adds four interop docs (artifact-interop.md, native-operating-model.md, shared-hub.md, verification.md) that Claude does not need, and Claude bundles fragments-gallery.html that Codex does not ship separately. The two shared files (fragment-author-contract.md, narrative-fragments.md) are content-identical except CRLF line endings (Codex) vs LF (Claude) and the expected $wf vs /wf syntax adaptation in narrative-fragments.md. Four actionable drifts were found: (1) artifact-interop.md in Codex references 09-ship.md (the legacy filename) instead of the current 09-ship-run-<run-id>.md + 09-ship-runs.md pair; (2) both codex wf-meta and wf-docs SKILL.md are missing the disable-model-invocation: true frontmatter field that Claude carries; (3) Codex wf-meta and wf-docs Internal context lists omit .codex/ where Claude lists .claude/; (4) Codex wf-docs Step 4 removes the TaskCreate/TaskUpdate instrumentation that Claude carries, replacing it with plain prose — intentional Codex adaptation per native-operating-model but undocumented as a deliberate omission. The imagegen skill is absent from Codex intentionally and is documented in both README.md and NATIVE-INTEROP-REWRITE-PLAN.md. setup-wide-logging is a skill in Codex vs a commands/ file in Claude — this is a structural difference arising from the different delivery mechanisms, not a content divergence; both SKILL.md bodies are substantively identical.

- **[major]** `plugins/sdlc-workflow-codex/references/artifact-interop.md` — The artifact tree comment at line 30 shows '09-ship.md # Stage 9', the legacy single-file name.
  - codex: 09-ship.md
  - **Fix:** Replace the '09-ship.md # Stage 9' line with '09-ship-run-<run-id>.md # Stage 9 (per release)' and '09-ship-runs.md # Stage 9 index'. This is the shared state model document both hosts read for cross-thread continuity — a stale filename here can cause wf-meta resume/status to look for the wrong file.

- **[major]** `plugins/sdlc-workflow-codex/skills/wf-meta/SKILL.md` — Codex wf-meta SKILL.md frontmatter is missing the disable-model-invocation: true field that Claude's copy carries.
  - codex: Frontmatter has: name, description, argument-hint only.
  - **Fix:** Add 'disable-model-invocation: true' to the Codex wf-meta SKILL.md frontmatter to match Claude. The field suppresses the default model-invocation wrapper so the skill drives execution directly. Without it, Codex may wrap the dispatch in an extra model call.

- **[major]** `plugins/sdlc-workflow-codex/skills/wf-docs/SKILL.md` — Codex wf-docs SKILL.md frontmatter is missing the disable-model-invocation: true field that Claude's copy carries.
  - codex: Frontmatter has: name, description, argument-hint only.
  - **Fix:** Add 'disable-model-invocation: true' to the Codex wf-docs SKILL.md frontmatter to match Claude.

- **[minor]** `plugins/sdlc-workflow-codex/skills/wf-meta/SKILL.md and plugins/sdlc-workflow-codex/skills/wf-docs/SKILL.md` — Both Codex SKILL.md files list internal context paths as '.ai/workflows/..., .ai/dep-updates/...' but omit the Codex-equivalent of .claude/ — which would be .codex/.
  - codex: Internal context includes workflow artifact paths (.ai/workflows/..., .ai/dep-updates/...).
  - **Fix:** Add '.codex/...' after '.ai/dep-updates/...' in the Internal context lists of both wf-meta/SKILL.md and wf-docs/SKILL.md to match the pattern used in codex wf/reference/ship.md, which correctly says '.codex/...'.

- **[nit]** `plugins/sdlc-workflow-codex/skills/wf-docs/SKILL.md` — Codex wf-docs Step 4 (Generate) replaces Claude's TaskCreate/TaskUpdate instrumentation with plain prose ('Record the action being taken', 'Record each completed action'), which is correct for Codex but is not called out as an intentional deviation anywhere.
  - codex: Step 4 item 1: 'Record the action being taken.' No TaskCreate. No TaskUpdate to completed.
  - **Fix:** Document the omission as intentional in the Codex CLAUDISM-AUDIT.md or a comment in SKILL.md, referencing native-operating-model.md's 'Use the built-in plan or progress tool for nontrivial work when available' guidance. This prevents future sync passes from inadvertently re-adding the Claude-specific TaskCreate calls.

- **[nit]** `plugins/sdlc-workflow-codex/references/narrative-fragments.md` — The file has CRLF line endings while Claude's reference/narrative-fragments.md has LF. Same for fragment-author-contract.md. Both are in the synced payload (PAYLOAD_DIRS via sync-codex-runtime), so the line-ending difference persists after sync.
  - codex: CRLF (Windows line endings) — confirmed via 'file' command.
  - **Fix:** Normalize both shared files to LF in the Claude source tree. After renormalization, re-run npm run sync:codex. This ensures verify:codex parity is clean and avoids CRLF artifacts in future diffs.

### codex-docsite-terminology

> The codex runtime doc-site (plugins/sdlc-workflow-codex/runtime/docs/site/) is a verbatim copy of the Claude plugin doc-site and presents every invocation form in Claude slash-command syntax (/wf, /wf-meta, /wf-docs, /review). No doc-site page explains that Codex users must type $wf instead of /wf. MIGRATION.md has the correct $ vs / mapping table and notes /wf-quick retirement, but it is a migration guide and not linked from or embedded in the served HTML. README.md correctly uses $wf throughout but claims 17 sub-commands for $wf when /wf auto (the 18th key added in v9.88.0) now exists as a Codex skill under skills/wf/reference/auto.md. The served doc-site reference/wf.html and reference/commands.html have no entry for /wf auto or $wf auto. The Installation tutorial page presents Claude Code-specific install commands (/plugin marketplace add) and a Claude Code precondition as if they apply to all readers.

- **[blocker]** `plugins/sdlc-workflow-codex/runtime/docs/site/how-to/choose-a-command.html` — Every actionable command in the served doc-site — across all pages including choose-a-command.html, first-10-minutes.html, start-workflow.html, navigate-workflows.html, and all reference pages — uses /wf, /wf-meta, /wf-docs, /review (Claude slash-command form). There is no banner, callout, or note anywhere in the HTML site explaining that Codex users type $wf, $wf-meta, $wf-docs, $review instead. A Codex user reading the hub-served docs will type /wf intake fix and get a Codex 'unknown command' or no-op, with no guidance on the correct invocation.
  - codex: The skills/ tree uses $wf throughout (e.g. skills/wf/reference/auto.md), and MIGRATION.md has a mapping table with the $ prefix, but neither is surfaced by the doc-site served at runtime.
  - **Fix:** Add a persistent host-aware callout banner to the doc-site (or a codex-specific overlay injected at serve time) that says: 'You are reading these docs from the Codex plugin. Replace every /wf with $wf, /wf-meta with $wf-meta, /wf-docs with $wf-docs, and /review with $review.' At minimum, add a prominent note to index.html, the installation tutorial, and the 'First 10 minutes' orientation page.

- **[major]** `plugins/sdlc-workflow-codex/runtime/docs/site/tutorials/installation.html` — The installation tutorial presents Claude Code-specific install steps as the generic install path: pre-condition 'Claude Code installed', commands '/plugin marketplace add jayteealao/agent-skills' and '/plugin install sdlc-workflow@jayteealao/agent-skills', and the verification step '/wf-meta status'. A Codex user following this tutorial has no applicable install flow described.
  - codex: README.md section 'Install (Codex repo marketplace)' describes the actual Codex install path (marketplace.json, review and trust hooks, new thread). This is not linked from or reflected in the served doc-site installation page.
  - **Fix:** Either replace the installation tutorial with a host-agnostic or dual-track version that covers both Claude Code and Codex install flows, or add a Codex-specific install page linked from the sidebar.

- **[major]** `plugins/sdlc-workflow-codex/README.md` — README.md line 19 says '$wf has 17 sub-commands total'. The $wf auto skill was added as the 18th key in v9.88.0 (released on this branch, committed f6890af). The README count is stale by one.
  - codex: plugins/sdlc-workflow-codex/skills/wf/reference/auto.md exists and is a full Codex-native reference for $wf auto. plugins/sdlc-workflow-codex/skills/wf/SKILL.md also routes $wf auto.
  - **Fix:** Update README.md line 19 to '18 sub-commands total' and add 'auto' to the $wf description: '$wf auto is the end-to-end lifecycle driver — slug mode drives all slices through final review; slice mode drives one slice and routes to the next'.

- **[major]** `plugins/sdlc-workflow-codex/runtime/docs/site/reference/commands.html` — The /wf commands table in commands.html lists 16 /wf sub-commands (10 lifecycle stages + 4 add-ons + probe + simplify). /wf auto — the 18th key and end-to-end lifecycle driver — is absent. A user looking up the command surface from the doc-site cannot discover it.
  - codex: plugins/sdlc-workflow-codex/skills/wf/reference/auto.md: '$wf auto is the end-to-end lifecycle driver'. plugins/sdlc-workflow/skills/wf/SKILL.md routes the 'auto' key.
  - **Fix:** Add a row for /wf auto (presented as $wf auto for Codex) to the /wf commands table in commands.html and in reference/wf.html, with stage 'driver' and note 'End-to-end lifecycle driver. Slug mode: all slices → final review, stops before handoff. Slice mode: one slice → routes to next. Never writes its own artifact.'

- **[major]** `plugins/sdlc-workflow-codex/runtime/docs/site/reference/wf.html` — The /wf reference page's table of contents and sub-command sections (lines 104-116) have no entry for /wf auto. The page documents 16 sub-commands and an 'add-on' section but the auto driver — which has distinct slug-mode and slice-mode semantics, gate behaviour, and branch-mismatch handling — is entirely missing.
  - codex: skills/wf/reference/auto.md is a complete reference covering slug/slice modes, gate pause behaviour, branch-mismatch resolution, and summary format.
  - **Fix:** Add a '/wf auto' section to reference/wf.html covering slug mode, slice mode, gate-pause behaviour, and the pre-handoff stop. For Codex users, label it $wf auto.

- **[minor]** `plugins/sdlc-workflow-codex/MIGRATION.md` — MIGRATION.md accurately maps /wf-quick retirement and the $ vs / invocation difference, but does not mention /wf auto ($wf auto) in the command mapping table. A migrating user who consults MIGRATION.md to find parity for every Claude command will not discover that $wf auto exists.
  - codex: skills/wf/reference/auto.md: '$wf auto, the end-to-end lifecycle driver'.
  - **Fix:** Add a row to the MIGRATION.md command mapping table: '| `/wf auto <slug> [<slice>]` | `$wf auto <slug> [<slice>]` |' with a note that it is the end-to-end driver added in v9.88.0.
