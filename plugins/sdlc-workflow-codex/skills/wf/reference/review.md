---
description: Intelligent review dispatch. Reads workflow artifacts and diff, selects relevant review commands, spawns one parallel sub-agent per command (each writes its findings to file), then aggregates, deduplicates, and triages findings into a unified review verdict. The review artifacts are an ACCUMULATING LEDGER — re-runs dedupe new findings against the pre-existing file and merge them in place (each finding stamped with when it surfaced), mark findings the re-run no longer surfaces as resolved, and never overwrite or delete prior findings. Re-run with "triage" to revisit deferred findings.
argument-hint: <slug> [slice | triage]
---

# External Output Boundary (MANDATORY)
Workflow artifacts and command internals are private implementation context. Never expose them in external-facing outputs.
- Internal context includes workflow artifact paths (`.ai/workflows/...`, `.codex/...`, `.ai/dep-updates/...`), stage names or numbers, skill names, task/sub-agent names, prompt/tooling details, control-file metadata, and private chain-of-thought or reasoning traces.
- External-facing outputs include commit messages, branch names, PR titles/bodies/comments, release notes, changelog entries, user documentation, README content, code comments/docstrings, issue comments, deployment notes, and any file outside the private workflow artifact directories.
- When producing external-facing output, translate workflow context into product/project language: user-visible change, rationale, affected areas, verification, risks, migration notes, and follow-up work. Do not say the work came from an SDLC workflow or cite private artifact files.
- Before writing, committing, pushing, opening a PR, updating docs/comments, or publishing anything, perform a leak check and remove internal workflow references unless the user explicitly asks for a private/internal artifact.

You are running `$wf review`, **stage 7 of 10** in the SDLC lifecycle.

# Pipeline
1·intake → 2·shape → 3·slice → 4·plan → 5·implement → 6·verify → `7·review` → 8·handoff → 9·ship → 10·retro

| | Detail |
|---|---|
| Requires (per-slice mode) | `02-shape.md`, `03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`, `06-verify-<slice-slug>.md` (recommended) |
| Requires (slug-wide mode) | `02-shape.md`, `03-slice.md`, and at least one `05-implement-<slice>.md`. Reads every present per-slice implement/verify file for context. |
| Conditional inputs (mandatory when present) | `02b-design.md`, `02c-craft.md`, `04b-instrument.md`, `04c-experiment.md`, `05c-benchmark.md`, `07-design-audit.md`, `07-design-critique.md`, `augmentations:` list in `00-index.md` — every artifact that exists MUST be checked by the relevant review (e.g., 02c-craft.md anti-goals MUST be honored; 04b-instrument.md signals MUST be present; 05c-benchmark.md baseline MUST not regress; every augmentation MUST get a type-specific re-check). |
| Produces (per-slice mode) | `07-review-<slice-slug>.md` + `07-review-<slice-slug>-<command>.md` per selected command. These are an **accumulating ledger** — a re-run on the same slice MERGES new findings into the existing files (dedupe + resolve-sweep), never overwrites. Running review on a different slice never touches a sibling slice's files. |
| Produces (slug-wide mode) | `07-review.md` + `07-review-<command>.md` per selected command (single set per workflow). Re-running review **merges into the existing files** (accumulating ledger — new findings deduped + appended in place, cleared findings marked `resolved`; nothing overwritten or deleted). Sibling per-slice review files (if any from prior runs) are left untouched. |
| Next | `$wf handoff <slug>` (when `verdict: ship`/`ship-with-caveats` and no OPEN blocker findings remain + all slices complete). If OPEN blockers remain: re-invoke `$wf review <slug> [<slice>]` (a normal accumulating re-run that re-checks the fixed code and merges fresh findings), or escalate to `$wf implement <slug> [<slice>] reviews` as a manual escape. Also: `$wf plan <slug> <next-slice>` (if more slices remain), `$wf-meta amend <slug> from-review` (if spec was wrong), or `$wf-meta extend <slug> from-review` (if new scope needed). |

> **Auto second opinion.** After the findings are merged and the verdict is derived,
> **auto-invoke** `$consult codex review <scope>` (pin `codex`/`claude`) whenever the
> verdict is borderline — especially a ship-with-caveats — a read-only panel that runs
> the same diff past other models for an adversarial check. Skip it for a clean pass or
> an obvious block. The user may invoke it explicitly with any provider.

# CRITICAL — execution discipline
You are a **review dispatch orchestrator that owns an accumulating findings ledger and its own triage→fix loop**.
- Do NOT run the reviews yourself — you **select review commands and dispatch sub-agents**. Each review sub-agent runs one review command independently and reports findings.
- The review artifacts **accumulate across invocations**. Before writing, READ the existing `07-review[-<slice>].md` + per-command files (if present) and **MERGE** this run's findings into them — dedupe against prior findings, preserve prior IDs and `surfaced-at` stamps, and mark findings a re-run of a dimension no longer surfaces as `resolved`. Never overwrite or delete a prior finding.
- Do NOT improvise fixes while review sub-agents are running. The fix loop runs only at Step 4c, AFTER aggregation and AFTER user triage at Step 4b.
- At Step 4c you own a **user-gated fix loop**: every finding marked `Fix` by the user at Step 4b spawns a fix sub-agent that applies the minimal patch. After all `Fix` sub-agents return, record each fix outcome **onto its finding** (status `fixed` / `could-not-fix` + `fixed-at`) and refresh the `## Fix Status` ledger.
- Do not auto-loop **within this invocation**: dispatch the `Fix` sub-agents once, record outcomes, stop. A further pass (re-checking the fixed code, surfacing new findings) is just a fresh `$wf review` invocation that merges into the same ledger. **There is no round counter and no `convergence` state.** Verify-after-fixes requires the user to re-invoke `$wf verify`.
- Do NOT handoff or ship — those are later stages.
- Your job is: **orient → read existing ledger → gather change stats → select commands → dispatch review sub-agents → merge + dedupe + resolve-sweep → triage → dispatch fix sub-agents for `Fix` decisions → record outcomes on findings → write merged verdict + Fix Status**.
- Follow the numbered steps below **exactly in order**. Do not skip, reorder, or combine steps.
- If you catch yourself about to start reviewing code directly, STOP — spawn a review sub-agent instead. If you catch yourself about to fix code outside the Step 4c fix-sub-agent dispatch, STOP — the fix loop only runs at Step 4c.

# TRIAGE MODE

If the second argument is `triage` (e.g., `$wf review my-feature triage`), skip the full review and jump directly to re-triage:

1. **Resolve slug** from the first argument. Read `00-index.md` for `review-scope` and `selected-slice`.
   - If `review-scope: slug-wide` → the target file is `07-review.md`. Ignore any third-argument slice selector.
   - If `review-scope: per-slice` → If a slice slug is the third argument (e.g., `$wf review my-feature triage auth-flow`), use it; otherwise use `selected-slice`. If neither is set, ask the user which slice to triage. Target file is `07-review-<slice-slug>.md`.
2. **Read the target review file** — parse the `## Triage Decisions` section. Collect all findings whose `status` is `deferred` or `open` (untriaged). (Findings already `resolved`/`fixed`/`dismissed` are not re-presented unless the user names them explicitly.)
3. **If no findings to triage** → print "No deferred or untriaged findings. Run `$wf review <slug> [<slice>]` for a full review." and STOP.
4. **Present for triage** — ask the user directly in chat, presenting each finding as a short numbered list with its options (Fix / Defer / Dismiss). Follow the same protocol as Step 4b below, but only show `deferred` and `open` findings. (A `Fix` decision here may also run the Step 4c fix loop on those findings.)
5. **Edit the target review file in place** — update the `## Triage Decisions` rows for the re-triaged findings only (leave all other rows untouched), and set each re-triaged finding's `status` field in `## All Findings`, `## Findings (Detailed)`, and the sibling `.yaml`. Update `## Recommendations` to reflect the new fix/defer/dismiss counts. Preserve every other section verbatim. Do NOT overwrite the file.
6. **Print summary** — show counts of fix/defer/dismiss and list findings newly marked for fixing.

Then STOP — do not continue to the full review workflow.

---

# Step 0 — Orient (MANDATORY — do this before all other steps)
1. **Resolve the slug** from `$ARGUMENTS` (first argument). Second argument, if present, is the **slice selector** (per-slice mode only — ignored in slug-wide mode). If no slug is given, infer the most recent active workflow from `.ai/workflows/*/00-index.md`. If ambiguous, ask the user.
2. **Read `00-index.md`** at `.ai/workflows/<slug>/00-index.md`. Parse the YAML frontmatter for `current-stage`, `status`, `selected-slice`, `open-questions`, **`review-scope`**.
3. **Resolve `review-scope`**: Read the `review-scope` field from `00-index.md` frontmatter. Default to `per-slice` if the field is absent (back-compat with pre-v9.x workflows).
   - If `review-scope: per-slice` → continue with the slice-resolution step below. All artifact paths in this run use the `-<slice-slug>` suffix.
   - If `review-scope: slug-wide` → **skip slice resolution entirely**. There is no `<slice-slug>` for this run. All artifact paths drop the slice suffix (`07-review.md`, `07-review-<command>.md`). Re-running review under this mode **merges** into the prior `07-review.md` (accumulating ledger — dedupe new findings against what's there, resolve-sweep the dimensions re-run, append a `runs:` entry; never overwritten). The reviewed diff is the cumulative branch diff (`git diff <base-branch>...HEAD`), not a per-slice diff. Note: slug-wide reviews findings reflect *all code currently on the branch*, including any partially-implemented or in-progress slices; the verdict is "ship this branch" rather than "ship this slice".
4. **Resolve the slice-slug** (per-slice mode only — skip this step if `review-scope: slug-wide`): If a slice-slug was passed, use it. If not, use `selected-slice-or-focus` from the index. If still missing, ask the user.
5. **Check prerequisites (workflow-type-aware AND review-scope-aware):**
   Read `workflow-type` from `00-index.md`. Recognize these modes:
   - **Compressed mode** (`workflow-type: quick`): the implement record is `05-implement.md` (no slice slug). Acceptance criteria source is `01-quick.md`. No per-slice plan/slice files exist.
   - **Forwarded mode** (`workflow-type: rca` / `investigate`): rich context lives in `01-rca.md` / `01-investigate.md`; `02-shape.md` is synthesized; `04-plan.md` exists if planning ran.
   - **Change-mode** (`workflow-type: fix` / `hotfix` / `refactor`): the compressed-lifecycle's **un-suffixed single-slice** standard files (`03-slice.md`, `04-plan.md`, `05-implement.md`, optional `06-verify.md`) + the lead `01-<mode>.md` (`01-fix.md` / `01-hotfix.md` / `01-refactor.md`). Exactly one slice; `selected-slice` is its slug. Review as standard mode with the un-suffixed names. (`review-scope: slug-wide` — one `07-review.md`.) Default rubric by mode: **hotfix** → `security`, **refactor** → `refactor-safety` (`$wf review <slug> <rubric>`); widen only if the change warrants it.
   - **update-deps** (`workflow-type: update-deps`): update-deps self-authors `05-implement.md` / `06-verify.md` (tier-ordered) in its own flow and **routes here** for review. The implement/verify records are the un-suffixed `05-implement.md` / `06-verify.md`; the plan is `04-plan.md`. Review against `01-update-deps.md` (the scan/research brief) + `03-slice.md` (the P0/P1/P2 tiers). `review-scope: slug-wide`.
   - **Standard mode**: per-slice files (`03-slice-<slice-slug>.md`, `04-plan-<slice-slug>.md`, `05-implement-<slice-slug>.md`).

   In all modes, an implement record (slice or master) must exist. If missing → STOP. Tell the user: "Run `$wf implement <slug>` first."

   **Per-slice mode** (`review-scope: per-slice`):
   - `06-verify-<slice-slug>.md` (or `06-verify.md`) is recommended but not strictly required — review can proceed without it if verify was skipped.
   - If verify shows `Status: Awaiting input` → STOP.
   - If `07-review-<slice-slug>.md` already exists for the resolved slice → this run **merges** into it. Read it now (with its sibling `.yaml`) so you can dedupe + resolve-sweep at Step 4; nothing is overwritten. Sibling slices' review files are never touched.

   **Slug-wide mode** (`review-scope: slug-wide`):
   - For standard mode workflows, **at least one** `05-implement-<slice-slug>.md` must exist. If `03-slice.md` lists multiple slices with `status: complete` but only some have implement records, WARN: "Slug-wide review covers the entire branch diff. Slices without implement records are: <list>. Their code may still appear in the diff; their acceptance criteria will not be checked."
   - Any present `06-verify-*.md` files are read for context but never block.
   - If `07-review.md` already exists → this run **merges** into it. Read it now (with its sibling `.yaml`) for dedupe + resolve-sweep at Step 4; nothing is overwritten. Per-slice `07-review-<slice>.md` files (if any from prior per-slice runs) are left untouched.
6. **Read the full context:**

   **Per-slice mode** — read the slice's context:
   - `03-slice-<slice-slug>.md` — acceptance criteria and scope
   - `04-plan-<slice-slug>.md` — what was planned
   - `05-implement-<slice-slug>.md` — what was built
   - `06-verify-<slice-slug>.md` (if exists) — verification results
   - `02-shape.md` — overall spec
   - `03-slice.md` — master slice index (for sibling context)
   - `po-answers.md`

   **Slug-wide mode** — read every slice's context plus shape:
   - `02-shape.md` — overall spec (primary acceptance criteria source)
   - `03-slice.md` — master slice index (lists every slice)
   - For every slice listed in `03-slice.md`: `03-slice-<slice>.md`, `04-plan-<slice>.md` (if present), `05-implement-<slice>.md` (if present), `06-verify-<slice>.md` (if present)
   - `po-answers.md`
7. **Read augmentation context (optional — workflow may have any combination):**
   Read the `augmentations:` list in `00-index.md` if present, plus the artifacts each entry references. Per-type guidance:

   | Type | What review must do |
   |---|---|
   | `design-<sub>` | Read `design-notes/<sub>-<timestamp>.md`. The documented design changes are intentional — do NOT flag them as unexpected. Validate them: did they achieve their stated goal? |
   | `design-audit` | Read `07-design-audit.md`. Treat as already-known findings; merge with new findings during dispatch. |
   | `design-critique` | Read `07-design-critique.md`. Same as above. |
   | `instrument` | Read `04b-instrument.md`. Review the instrumentation as a first-class deliverable: are signals appropriate, is PII handled, is the framework usage correct? |
   | `experiment` | Read `04c-experiment.md`. Review the experiment infrastructure: is the cohort logic correct, are metrics appropriate, is the rollback path safe? |
   | `benchmark` | Read `05c-benchmark.md`. Cross-reference with `06-verify` compare-mode results. If verify flagged regressions, surface them as review findings. |

   Also read `02b-design.md` and `02c-craft.md` for register, anti-goals, and visual contract — **`02c-craft.md` is mandatory when present: if it exists you MUST read it** — review must check anti-goals were honored.

   Cross-reference `06-verify-<slice-slug>.md` (per-slice mode) or every `06-verify-*.md` file (slug-wide mode). Mandatory reads from each verify artifact:
   - `## Augmentation Verification` — failed augmentation re-checks become BLOCKER or HIGH findings automatically.
   - `stability-check-flaky-count` (frontmatter) — any value > 0 is a HIGH finding; flaky criteria indicate race conditions or state leakage that review sub-agents should investigate in the diff.
   - `adversarial-tests-failed` (frontmatter) — any value > 0 means `## Adversarial Tests` contains BLOCKER or HIGH findings; surface them in the aggregated finding list.
   - `cross-browser-delta` (frontmatter) — if `findings`, read `## Cross-Browser Delta` and surface each divergence as a HIGH compatibility finding.
   - `web-vitals-inp-ms` (frontmatter) — if > 200, surface as a HIGH performance finding; `web-vitals-lcp-ms` > 2500 and `web-vitals-cls` > 0.1 are WARN.
   - `## Friction Notes` and `## Free Exploration Notes` — these are informational (not auto-promoted to issues) but must appear in the review's `## Soft Findings` or `## Reviewer Notes` section so the human reviewer can see them. They represent observations a first-time user would notice that no AC captured.
8. **Carry forward** `open-questions` from the index.
9. **Branch check:** Read `branch-strategy` and `branch` from `00-index.md`. If `branch-strategy` is `dedicated`, confirm you are on the correct branch. Review diffs must be generated against the implementation branch. Use `git diff <base-branch>...<branch>` to get the full change set for review dispatch.

# Purpose
Intelligent review dispatch. Analyse the change set, select which of the 30 review commands are relevant, launch one parallel sub-agent per selected command, then aggregate all findings into a unified review verdict.

# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage file first.
- **Every artifact file MUST have YAML frontmatter** (between `---` markers) as the first thing in the file. All machine-readable state goes in frontmatter. The markdown body is for human-readable narrative only.
- **Timestamps must be real:** For `created-at` and `updated-at`, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash to get the actual current time. Never guess or use `T00:00:00Z`.
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Keep `po-answers.md` as cumulative product-owner log. Keep the slug stable after intake.
- `00-index.md` must always have: title, slug, current-stage, stage-status, updated-at, selected-slice-or-focus, open-questions, recommended-next-stage, recommended-next-command, recommended-next-invocation, workflow-files.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.
- **Conditional inputs are mandatory when present.** If any file listed in the *Conditional inputs* row of this command's preamble exists on disk, you MUST read it and the stage's output MUST honor it as described. Existence is what's optional; consumption is required. Silent omission of a present artifact is a workflow contract violation, not a permitted shortcut.

# Chat return contract
After writing files, return — lead with the substance first, then the receipt:
- **narrative:** the chat summary's lead paragraph, in the artifact's story voice — see [_narrative-voice.md](_narrative-voice.md). Same voice as the artifact's `## The Review` section: relevance first, tradeoffs stated plainly, no `"This review implements…"` openings. The router leads the chat summary with this paragraph; the fields below are the receipt beneath it.
- `slug: <slug>`
- `wrote: <paths>` (list all review files written)
- `verdict: <Ship / Ship with caveats / Don't Ship>`
- `findings: <O open / R resolved-this-run / F fixed-this-run>` — the merged-ledger snapshot, plus a one-line "what the merge did" note: how many net-new findings were added, how many prior findings were re-confirmed, how many a re-run cleared (`resolved`), and how many the fix loop patched (e.g., "merged 2 new, re-confirmed 3, resolved 1 cleared; fix loop patched 2 of 2; 4 open").
- `options:` (list all viable next options — see Adaptive Routing below)
- ≤3 short blocker bullets if needed (remaining OPEN BLOCKERs only — anything fixed/dismissed/resolved is no longer a blocker)

---

# Step 1: Gather Change Statistics

From the relevant implement record(s), extract the files changed and the nature of changes. Also run the diff commands. **The diff scope depends on `review-scope`:**

**Per-slice mode** — diff scope is the working tree (the current slice's in-progress or just-completed changes):

```bash
git diff --name-only HEAD     # Changed file list
git diff --stat HEAD          # Diff stats
git diff HEAD                 # Full diff for pattern analysis
```

**Slug-wide mode** — diff scope is the entire branch since divergence from `base-branch`:

```bash
git diff --name-only <base-branch>...HEAD   # Changed file list
git diff --stat <base-branch>...HEAD        # Diff stats
git diff <base-branch>...HEAD               # Full diff for pattern analysis
```

Substitute `<base-branch>` with the value from `00-index.md` frontmatter (typically `main` or `master`).

Extract:
- **File types changed** — extensions and directory patterns
- **Change size** — total lines added/removed
- **Change type signals** — new files vs modifications vs deletions
- **Content signals** — patterns in the diff (SQL queries, auth checks, migrations, React components, Terraform, etc.)

---

# Step 2: Select Review Commands

Each command maps to `../../review/reference/<name>.md` — **except** the two design dimensions `design-audit` and `design-critique`, which map to `design/audit.md` and `design/critique.md` respectively (the relocated design library; see the "design work" selection rule below).

**Selection philosophy:** Use the shape, slice, and implementation artifacts — not just raw diff patterns — to reason about what this change *is* and what reviews matter. A feature that adds async data fetching needs `backend-concurrency` even if the diff doesn't contain the word "mutex". Lean toward inclusion: a missed relevant review is worse than a redundant one. The max exists to prevent sprawl, not to cap thorough coverage.

### Core (always include for any code change)
- `correctness` — logic, invariants, edge cases
- `security` — vulnerabilities, insecure defaults
- `code-simplification` — missed reuse, unnecessary complexity, inefficiencies

### Always include for any backend source change
(`.ts`, `.js`, `.mjs`, `.py`, `.go`, `.java`, `.cs`, `.rb`, `.php`, `.rs`, `.kt`, `.swift`, `.scala`, `.ex`, `.exs`)
- `testing` — always: new code needs test coverage assessment regardless of whether test files appear in the diff
- `maintainability` — always: new or changed functions need readability and coupling review
- `reliability` — always: error handling, retry logic, graceful degradation, fault tolerance

### Always include for any frontend source change
(`.tsx`, `.jsx`, `.vue`, `.svelte`, `.html`, `.css`, `.scss`)
- `accessibility`
- `frontend-accessibility`
- `frontend-performance`
- `interface-craft` — static visual-detail craft (concentric radius, optical alignment, shadows-vs-borders, image outlines, tabular-nums, text-wrap, hit areas)
- `ux-copy`

### Include when the change involves design work — `review` is the design consumer that *judges it*
(any `design-*` entry in `00-index.md` `augmentations:`, a `02c-craft.md` visual contract present, or substantive UI changes when `stack.ui ≠ ∅`)
- `design-audit` — theming / responsive / anti-pattern judgment + 0–4 scoring. **Consumes the a11y / perf / web-vitals already measured in `06-verify-*.md` rather than re-running axe-core** (if no verify ran, it measures itself). Checks the `02c-craft.md` anti-goals were honored. Emits `07-design-audit.md`. Maps to `design/audit.md`. Its absolute-ban checklist is single-sourced from `design/_design-context.md` (Absolute bans) — load it when `stack.ui ≠ ∅` even if no `02b`/`02c` exists, so audit judges against the same canon design authored to.
- `design-critique` — register-forked prescriptive critique (brand = distinctiveness, product = earned-familiarity); preserves the stance rules + font reflex-reject. Emits `07-design-critique.md`. Maps to `design/critique.md`.

These two run as ordinary dimensions inside the parallel fan-out below — the same logic reachable ad-hoc via `$wf design audit|critique`. a11y/perf are measured once (in `verify`) and *interpreted* here; never re-measured.

### Include based on what the feature does (reason from shape + slice, not just diff patterns)

**The feature adds or changes animation, transition, or gesture motion** (`transition`, `animation`, `@keyframes`, `cubic-bezier`, `transform`, Motion/Framer Motion, `useSpring`, `whileTap`, `AnimatePresence`, drag/swipe handlers):
- `motion` — easing, timing, interruptibility, origin/physicality, GPU performance, and whether the motion should exist at all

**The feature adds or modifies async, concurrent, or parallel behaviour** (async/await, goroutines, threads, Promise chains, event loops, message queues, workers, `@Async`, `CompletableFuture`, `select`, `sync.`, `atomic`, streaming, SSE, WebSocket):
- `backend-concurrency`

**The feature is a refactor, restructure, rename, or extraction** (large deletion-to-addition ratio, shape/slice describes "refactor"/"restructure"/"rename"/"extract"/"move"):
- `refactor-safety`

**The feature introduces new modules, services, packages, or architectural layers** (new directories, new top-level modules, new service files, changed import graphs, new `index.*` files, new `*Service`/`*Repository`/`*Controller` classes):
- `architecture`
- `overengineering` — if the shape describes generic/reusable abstractions or the diff introduces new base classes, generic utilities, or factory patterns

**The feature touches data reads or writes, queries, or caching**:
- `performance` — any DB query, ORM call, loop over a collection, sort/filter/aggregate, cache interaction, or algorithm over variable-size data
- `data-integrity` — any DB write, ORM mutation, transaction, schema change, or data validation

**The feature involves DB migrations** (`migrations/`, `db/migrate/`, `alembic/versions/`, `flyway/`, `*_migration.*`):
- `migrations`
- `data-integrity` (if not already selected)

**The feature handles user data, authentication, or anything privacy-sensitive** (user profiles, auth flows, personal data fields, payment processing, GDPR/CCPA scope, session management, logging in auth/payment paths):
- `privacy`

**The feature adds or changes API surface** (route definitions, OpenAPI/Swagger, REST handlers, GraphQL schemas, gRPC proto, SDK entry points, versioned paths `/v1/`, webhook handlers):
- `api-contracts`

**The feature could affect throughput, queuing, or multi-tenancy at scale** (queue consumers, background jobs, batch operations, fan-out patterns, multi-tenant data isolation, horizontal scaling assumptions):
- `scalability`

**The feature adds or changes dependencies** (`package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`, lockfiles, new external imports):
- `supply-chain`

**The feature touches infrastructure** (Dockerfile, `docker-compose.*`, Terraform `*.tf`, Pulumi, Helm, CloudFormation, K8s YAML, Ansible):
- `infra`
- `infra-security`

**The feature modifies CI/CD pipelines** (`.github/workflows/*.yml`, `.gitlab-ci.yml`, Jenkinsfile, Makefile deploy targets):
- `ci`

**The feature involves a release, version bump, or changelog** (CHANGELOG.md, version fields, git tags, release configs):
- `release`

**The feature adds or changes logging behaviour** (log statements, logger config, structured logging setup):
- `logging`

**The feature adds or changes observability** (metrics, OpenTelemetry, Prometheus, alerting rules, health checks):
- `observability`

**The feature makes cloud/API calls that cost money** (cloud SDK calls, paid API integrations, storage operations, AI/ML inference):
- `cost`

**The feature touches documentation** (`*.md`, `*.mdx`, `*.rst`, `docs/`, docstrings):
- `docs`

**Style inconsistencies are visible in the diff** (mixed naming conventions, inconsistent patterns within the same file or module):
- `style-consistency`

**The feature changes developer-facing tooling** (scripts, Makefile, README, CONTRIBUTING, dev environment config):
- `dx`

### Selection Constraints
- **Minimum**: 3 commands (always `correctness` + `security` + `code-simplification`)
- **Maximum**: 15 — raise this limit only if the change genuinely spans many domains; do not artificially cap a thorough review
- **User focus override**: if the user specified a focus ("check security"), always include those + `correctness`; suppress unrelated commands
- **Config/docs-only changes**: drop `correctness`/`backend-concurrency`/`testing`/`code-simplification`; keep `security`, `docs`, relevant infra/release
- **Test-only changes**: keep `testing`, `correctness`, `code-simplification`; drop most others
- **When in doubt, include**: a false positive from an extra review command costs one sub-agent; a missed issue costs a production incident

### Output the Selection (before dispatching)

Print to chat:
```
## Review Scope
- Slug: {slug}
- Slice: {slice}
- Files changed: {N} files, +{added} -{removed} lines
- File types: {list}
- Change signals detected: {list}

## Commands Selected ({N})
1. `{command}` — {reason}
2. `{command}` — {reason}
...
```

---

# Step 3: Dispatch Parallel Sub-Agents

For EACH selected command, spawn a sub-agent. All agents run in parallel. Each review command runs a single rubric independently. Synthesis (Step 4 — aggregation, dedup, triage) runs after all sub-agents complete.

**Each sub-agent receives this prompt** (substitute the per-slice or slug-wide variant based on the current `review-scope`):

```
Execute the review command at `../../review/reference/{command-name}.md`.

Scope:
  - Per-slice mode: `git diff HEAD` (working-tree diff for the current slice)
  - Slug-wide mode: `git diff <base-branch>...HEAD` (full branch diff)
Workflow slug: {slug}
Review scope: {review-scope}                              # per-slice or slug-wide
Selected slice: {slice or "(none — slug-wide)"}

Read the command file and follow its WORKFLOW exactly. Perform the review for the given scope.

ACCUMULATE — do not overwrite. Before writing, READ your target file below if it already
exists (plus its sibling `.yaml`). It holds prior findings for THIS dimension with stable
IDs and `surfaced-at` stamps. MERGE your fresh findings into it:
  - A fresh finding that matches a prior one (same/overlapping file:line OR same root cause)
    → KEEP the prior `id` and `surfaced-at`, set `last-seen-at` to now, refresh evidence/
    severity only if yours is more specific, and keep its prior `status`. If the prior status
    was `resolved`, flip it back to `open` and note it re-surfaced.
  - A genuinely new finding → allocate the next ID in this dimension's prefix sequence
    (max existing +1; never reuse a retired ID), `status: open`, and set
    `surfaced-at = last-seen-at = now`.
  - A prior `open` finding you did NOT re-surface this run → set `status: resolved`,
    `resolved-at: now` (your dimension WAS re-run, so absence means cleared). Keep the row;
    never delete it.
  - Leave `deferred` / `dismissed` / `fixed` / `could-not-fix` findings' status untouched
    unless you re-surface them (then `last-seen-at` only).
Get `now` from `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash. Emit the FULL merged set (open AND
resolved), not just this run's deltas.

IMPORTANT: Write your complete review findings to the file:
  - Per-slice: `.ai/workflows/{slug}/07-review-{slice-slug}-{command-name}.md`
  - Slug-wide: `.ai/workflows/{slug}/07-review-{command-name}.md`

Use this structure for the file (YAML frontmatter first, then markdown):

```yaml
---
schema: sdlc/v1
type: review-command
slug: {slug}
review-scope: {per-slice|slug-wide}
slice-slug: {slice or "" if slug-wide}
review-command: {command-name}
status: complete
updated-at: "{timestamp}"
metric-findings-total: {N}        # OPEN findings only (status open|deferred|could-not-fix)
metric-findings-blocker: {N}      # OPEN blockers
metric-findings-high: {N}         # OPEN highs
metric-findings-resolved: {N}     # findings cleared on a re-run (status resolved)
result: clean | issues-found | blockers-found    # by OPEN findings
tags: []
refs:
  review-master: {07-review-{slice-slug}.md | 07-review.md}
---
```

# Review: {command-name}

## Findings
| ID | Sev | Conf | Status | Surfaced | File:Line | Issue |
|----|-----|------|--------|----------|-----------|-------|
(ALL findings — open AND resolved — with severity BLOCKER/HIGH/MED/LOW/NIT, confidence
High/Med/Low, status open|deferred|dismissed|fixed|could-not-fix|resolved, and the
`surfaced-at` date. Keep resolved rows for history; mark them clearly.)

## Detailed Findings
### {ID}: {Title} [{SEVERITY}]
**Location:** `{file}:{line-range}`
**Evidence:**
```
{snippet}
```
**Issue:** {description}
**Fix:** {suggestion for HIGH+}
**Severity:** {level} | **Confidence:** {High/Med/Low}
**Status:** {status} | **Surfaced:** {surfaced-at} | **Last seen:** {last-seen-at}{ | **Resolved:** {resolved-at} if resolved}

## Summary
- Open findings: {N}    (resolved this run: {N})
- Open blockers: {N}
- Status: {Clean / Issues Found / Blockers Found}

Then author the rich siblings next to that `.md` (you hold the findings in context —
do NOT leave this for the orchestrator):
  1. Write `<stem>.yaml` — schema `siblingYamlSchemas.review-dimension` in
     `tests/frontmatter.schema.json` (`artifact: review-dimension`, `dimension`,
     `parent`, `rev`, `verdict`, `summary`, `counts`, `findings`), scoped to THIS
     dimension only. (`<stem>` = the review `.md` filename without `.md`.)
     - `findings:` = **OPEN findings only** (status open|deferred|could-not-fix). Resolved/
       fixed/dismissed findings live in the `.md` body, not the `.yaml` — this keeps the
       rendered heatmap + counts honest about live state. Each `.yaml` finding carries
       `surfaced-at` + `status` (additive fields; schema-validated).
     - `counts:` = OPEN counts. `rev:` = number of times this dimension file has been
       written (increment the prior `.yaml`'s `rev` by 1; first write = 1).
  2. Write `<stem>.html.fragment` — one
     `<section class="fragment-review-dimension" data-artifact="review-dimension">`
     per the per-dimension shape in this reference's Step 5b tail and
     `_fragment-authoring.md`.
The `post-write-verify` hook BLOCKS (exit 2) the `.md` write when the sibling
`.yaml` is missing — write the `.yaml` first (or in the same turn). If this
dimension has zero OPEN findings (clean, or everything resolved), set `fragment: none`
in the `.md` frontmatter instead of authoring an empty fragment.

Write the files, then return a brief summary of what you found.
```

Wait for ALL sub-agents to complete before proceeding.

---

# Step 4: Merge into the existing ledger (dedupe + resolve-sweep)

After all sub-agents finish, you **MERGE** this run's findings into the existing master ledger.
The review artifacts accumulate — you are editing the prior `07-review[-<slice>].md` + `.yaml`
**in place**, never overwriting them.

1. **Read the existing master** `07-review[-<slice-slug>].md` + its sibling `.yaml` (if present).
   Capture every prior finding with its `id`, `surfaced-at`, `status`, `dimension`, and triage
   decision. If no prior master exists, this is the first run — every finding below is net-new.
2. **Read every `07-review-<slice-slug>-<command>.md` file** the sub-agents wrote this run, and
   **collect this run's findings** — every row with an ID, severity, file:line, and description.
   (The sub-agents already merged within their own dimension file; you now reconcile across
   dimensions and against the master.)
3. **Cross-dimension dedupe (this run):** two findings are duplicates if:
   - Same `file:line` (or overlapping line range)
   - Same root cause, even if different categories (e.g., missing validation flagged as both
     "correctness" and "injection vector")
   - One is a symptom and another is the root cause
   Merge duplicates: keep the highest severity, the most specific evidence (longest snippet, most
   precise line range), combine category labels (e.g., "Correctness + Security"), keep the most
   actionable fix. A merged duplicate is ONE finding with one ID.
4. **Reconcile this run's findings against the master (cross-run dedupe):**
   - **Re-surfaced** (a fresh finding matches a prior master finding by file:line / root cause) →
     KEEP the prior `id` and `surfaced-at`, set `last-seen-at = now`, refresh evidence/severity
     only if the fresh one is more specific, and PRESERVE the prior triage `status`. If the prior
     status was `resolved`, flip it to `open` and note "re-surfaced {now}".
   - **Net-new** (no prior match) → assign the next ID in that dimension's prefix sequence
     (max existing ID for that prefix +1; never reuse a retired ID), `status: open`,
     `surfaced-at = last-seen-at = now`.
5. **Resolve-sweep:** for each prior master finding whose dimension WAS re-run this pass but is
   NOT in this run's findings → set `status: resolved`, `resolved-at = now`. Keep the row. Prior
   findings whose dimension was NOT re-run this pass → carry forward untouched (do not mark
   resolved — you didn't look).
6. **Sort by severity** for display: BLOCKER → HIGH → MED → LOW → NIT, then alphabetically by file
   path within each level. Resolved findings sort last within their severity (or in a trailing
   "Resolved" group), clearly marked.
7. **Determine verdict from OPEN findings only** (status ∈ open / deferred / could-not-fix):
   - Any OPEN BLOCKER → **Don't Ship**
   - OPEN HIGH issues only → **Ship with caveats** (if the HIGHs are addressable as follow-ups)
   - OPEN MED/LOW/NIT only → **Ship**
   - No open findings (all clean or resolved) → **Ship**
   Fixed / dismissed / resolved findings never count against the verdict.

Get `now` from `date -u +"%Y-%m-%dT%H:%M:%SZ"` via Bash (one stamp for the whole run).

---

# Step 4b: Triage findings needing a decision

After the merge, present the findings that **need a decision** to the user for triage. Ask the user
directly in chat, presenting options as a short numbered list: net-new findings, re-surfaced findings
that were previously `resolved`, and any prior `open` (untriaged) findings. Findings already triaged
`deferred` or `dismissed` in a prior run **keep that decision** — do not re-prompt them (the user
revisits those via `$wf review <slug> triage`). This gives the user explicit control over what gets
fixed, deferred, or dismissed. **`Fix` decisions execute in Step 4c — they are no longer deferred to a
separate `$wf implement reviews` invocation.**

**For BLOCKER and HIGH findings** — present each individually:

Ask the user in chat, one finding per question (batch up to 4 per message):
- **Context**: the finding ID (e.g., "CR-1", "CS-2", "SEC-3")
- **Question**: `"{Source command}: {one-line issue description} at {file}:{line}"`
- Options (numbered list):
  1. Fix now — Spawn a sub-agent to apply the minimal patch in this run (Step 4c).
  2. Defer — Record but do not fix — revisit later via `$wf review <slug> triage`.
  3. Not an issue — False positive or intentional — record the reason.

**For MED findings** — present as a batch with multi-select:

Ask the user in chat: "Select which MED findings to fix now (Step 4c will spawn fix sub-agents for the selected ones). List the IDs you want to fix, or type 'all' / 'none'."
- Include one line per MED finding: `{ID}: {title} — {file}:{line} — {one-line description}`

MED findings not selected default to `Defer` (recorded but not fixed in this run).

**For LOW and NIT findings** — list in the report but do NOT prompt and do NOT fix in this run.

If there are no findings (all commands returned clean), skip Step 4b and Step 4c — there is nothing to triage and nothing to fix.

---

# Step 4c: Review-owned fix loop

This step runs only if Step 4b produced at least one `Fix` decision. Dispatch the `Fix`
sub-agents **once** this invocation, record each outcome ONTO its finding, then stop. There is
**no round counter and no `convergence` state** — a further pass is just a fresh `$wf review`
that merges into the same ledger.

## Snapshot

Before dispatching any fix sub-agent, note the count of findings triaged `Fix` at Step 4b
(a transient working count — not persisted to frontmatter).

If that count is 0, skip to Step 5 (no fix loop this run).

## Fix dispatch (sequential)

For each finding triaged `Fix`, sequentially (one at a time):
1. Spawn ONE sub-agent with this prompt:
   ```
   Fix the following review finding in the codebase:

   Finding ID: {ID}
   Source review command: {command}
   Severity: {severity}
   Location: {file}:{line-range}
   Issue: {issue description}
   Suggested fix: {fix suggestion}

   Read the file(s) at the specified location. Understand the issue.
   Apply the minimal fix that resolves the issue without introducing
   new problems. Do NOT change anything beyond what is needed for this
   specific finding. Do NOT refactor. Do NOT broaden scope.

   After fixing, verify your change is correct:
   - The fix addresses the specific issue described
   - No new lint/type/test failures are introduced in the affected files
   - The surrounding code still makes sense

   Return a brief summary of what you changed and whether the fix is confirmed correct.
   ```
2. Wait for the sub-agent to complete.
3. Read the changed file(s) yourself; sanity-check the patch addresses the finding and does not obviously break sibling code.
4. **Record the outcome ON the finding** — set its `status` and `fixed-at = now` everywhere it
   appears (`## All Findings`, `## Findings (Detailed)`, the `## Fix Status` ledger, and the
   sibling `.yaml`):
   - sub-agent fixed it → `status: fixed` (drops out of the OPEN counts and the verdict).
   - sub-agent could not → `status: could-not-fix` (stays OPEN; still counts against the verdict),
     and record `COULD NOT FIX: <reason>`.

## After the fix dispatch (no re-review this invocation)

Do **not** re-dispatch the review command set this invocation — re-checking the fixed code is a
fresh `$wf review` run (it will merge new findings and resolve-sweep what the fixes cleared). For now:
- `status: fixed` findings drop out of the OPEN counts → the verdict (Step 4, step 7) recomputes
  from what remains open.
- `status: could-not-fix` findings stay OPEN and are surfaced under
  `## Recommendations → Must Fix (remaining)` with the sub-agent's reason.

## Commit (only when fixes landed)

If at least one `Fix` sub-agent successfully modified files AND `branch-strategy` is `dedicated` or `shared`:
- Stage every file the fix sub-agents touched.
- Commit with message: `fix(<slug>): review-time fixes for <slice-slug>` (per-slice mode) or `fix(<slug>): review-time fixes` (slug-wide mode).
- Record the commit SHA in the review artifact's `## Fix Status` section AND in this run's `runs:` frontmatter entry (`fix-commit`).
- Do NOT push.
- If `branch-strategy: none`, skip the commit; the fixes remain in the working tree.

The fix sub-agents and the commit replace the manual `$wf implement <slug> [<slice>] reviews` round-trip for the common case. That mode still exists as a manual escape (e.g., when `could-not-fix` findings remain and the user wants the sequential per-finding fix UI again, or when the user prefers to fix outside the review run).

---

# Step 5: Write the merged master ledger

Write (merge into) the master artifact. The filename and `refs` block depend on `review-scope`:

- **Per-slice mode** → `07-review-<slice-slug>.md`
- **Slug-wide mode** → `07-review.md` (no slice suffix)

When the file already exists you are **editing it in place** — preserve sections you are not
changing (especially `## Triage Decisions` rows for findings not re-triaged this run), update
finding rows by ID, append net-new findings into their severity-sorted position, mark resolved
findings, and **append one entry to `runs:`**. Never overwrite the file wholesale.

```yaml
---
schema: sdlc/v1
type: review
slug: <slug>
review-scope: <per-slice|slug-wide>
slice-slug: <slice-slug or "" if slug-wide>
status: complete
stage-number: 7
created-at: "<iso-8601>"        # first run's timestamp — PRESERVE across re-runs
updated-at: "<iso-8601>"        # this run's timestamp
verdict: <ship|ship-with-caveats|dont-ship>     # from OPEN findings only
commands-run: [correctness, security, ...]      # cumulative union of every dimension ever run
metric-commands-run: <N>
metric-findings-total: <N>       # OPEN findings (status open|deferred|could-not-fix)
metric-findings-raw: <N>         # raw findings collected this run, pre-dedup
metric-findings-blocker: <N>     # OPEN blockers. Handoff's blocker gate reads this field.
metric-findings-high: <N>        # OPEN
metric-findings-med: <N>         # OPEN
metric-findings-low: <N>         # OPEN
metric-findings-nit: <N>         # OPEN
metric-findings-resolved: <N>    # findings cleared by a re-run (status resolved)
metric-findings-total-ever: <N>  # every finding ever recorded (open + closed) — ledger size
runs:                            # compact per-invocation audit trail (frontmatter only; append one entry per run)
  - at: "<iso-8601>"
    dimensions: [correctness, security, ...]    # commands run THIS invocation
    verdict: <ship|ship-with-caveats|dont-ship>  # verdict snapshot after this run
    fix-commit: "<SHA | null>"                   # review-time fix commit this run, if any
tags: []
refs:
  index: 00-index.md
  # Per-slice mode:
  slice-def: 03-slice-<slice-slug>.md
  implement: 05-implement-<slice-slug>.md
  verify: 06-verify-<slice-slug>.md
  sub-reviews: [07-review-<slice-slug>-correctness.md, 07-review-<slice-slug>-security.md, ...]
  # Slug-wide mode (replace the four per-slice keys above with these):
  shape: 02-shape.md
  slice-index: 03-slice.md
  implements: [05-implement-<slice-1>.md, 05-implement-<slice-2>.md, ...]
  verifies: [06-verify-<slice-1>.md, 06-verify-<slice-2>.md, ...]
  sub-reviews: [07-review-correctness.md, 07-review-security.md, ...]
next-command: <wf-handoff|wf-implement>
next-invocation: "<based on verdict>"
---
```

# Review

## The Review
<!-- STORY SECTION — first, and self-sufficient. A reader who reads only this section understands what was produced, the load-bearing decisions and counts, and the top risk; the structured sections below are drill-down, not a substitute. Write it in the voice defined in `_narrative-voice.md` (Sebastian Raschka register: relevance first, why before how, tradeoffs stated plainly, varied rhythm — NO "This review implements…" openings). 1–4 short paragraphs. -->

## Verdict

**{Ship / Ship with caveats / Don't Ship}**

{3-4 sentence rationale. Name the most critical finding. State whether any blockers exist.}

## Domain Coverage

| Domain | Command | Status |
|--------|---------|--------|
| {domain} | `{command}` | {Clean / Issues / Blockers} |

## All Findings

ALL findings ever recorded for this scope — open AND closed. Resolved / fixed / dismissed rows are
kept (marked in the Status column) for history; they sort last within their severity.

| ID | Sev | Conf | Status | Surfaced | Source | File:Line | Issue |
|----|-----|------|--------|----------|--------|-----------|-------|

**Open:** BLOCKER: {X} | HIGH: {X} | MED: {X} | LOW: {X} | NIT: {X}
**Closed:** resolved: {X} | fixed: {X} | dismissed: {X}   **Ledger size (ever):** {N}
*(This run: {A} net-new, {B} re-confirmed, {C} resolved; merged from {M} raw findings across {K} commands)*

## Findings (Detailed)

### {ID}: {Title} [{SEVERITY}]

**Location:** `{file}:{line-range}`
**Source:** {command(s) that flagged this}

**Evidence:**
```
{snippet}
```

**Issue:** {description}

**Fix:** {suggestion for HIGH+}

**Severity:** {level} | **Confidence:** {High/Med/Low}
**Status:** {status} | **Surfaced:** {surfaced-at} | **Last seen:** {last-seen-at}  {— **Resolved:** {resolved-at} / **Fixed:** {fixed-at} when applicable}

## Triage Decisions

Accumulates across runs — a finding's decision persists until the user re-triages it (Step 4b for
re-opened findings, or `$wf review <slug> triage`). Update rows by ID; never drop a prior row.

| ID | Sev | Source | Decision | Notes |
|----|-----|--------|----------|-------|
| {ID} | {SEV} | {command} | {fix/defer/dismiss} | {user's reason or —} |

{All BLOCKER/HIGH/MED findings ever triaged. LOW/NIT listed as "untriaged".}

## Fix Status

Present once any finding has ever been through the fix loop. An **accumulating per-finding ledger**
(one row per finding ever marked `Fix`), keyed by ID — update a finding's row in place when its
outcome changes across runs; never start a new per-run "round" table. Omit it only on a workflow
where no finding has ever been fixed.

| ID | Sev | Source | Status | Fixed-at | Commit | Notes |
|----|-----|--------|--------|----------|--------|-------|
| {ID} | {SEV} | {command} | fixed / could-not-fix | {fixed-at} | {SHA or —} | {one-line summary} |

{List each `could-not-fix` finding under `## Recommendations → Must Fix (remaining)` with the
sub-agent's stated reason so the next stage knows what is still open.}

## Recommendations

### Must Fix (triaged "fix")
{List with finding IDs and estimated effort}

### Should Fix (MED triaged "fix")
{List}

### Deferred (triaged "defer")
{List — re-triage later via `$wf review <slug> triage`}

### Dismissed
{List with finding IDs and reason}

### Consider (LOW/NIT — not triaged)
{List}

## Recommended Next Stage
- **Option A:** `$wf handoff <slug>` — no OPEN blockers; all slices complete, ready for PR [reason]
- **Option B:** `$wf review <slug> [<slice>]` — OPEN blockers or `could-not-fix` findings remain; re-invoke to re-check the fixed code and merge fresh findings into the ledger (it resolve-sweeps what the fixes cleared) [reason, only if applicable]
- **Option C:** `$wf implement <slug> [<slice>] reviews` — escape hatch; remaining findings need stage-5 fix UI [reason, only if applicable]
- **Option D:** `$wf plan <slug> <next-slice>` or `$wf implement <slug> <next-slice>` — more slices to implement before handoff [reason, if applicable]
- **Option E:** `$wf ship <slug>` — skip handoff [reason, if applicable]
- **Option F:** `$wf-meta extend <slug> from-review` — add new slices from findings [reason, if applicable]
- **Option G:** `$wf-meta amend <slug> from-review` — correct the spec/approach of an existing slice [reason, if applicable]

---

# Step 5b: Write the rich fragment (MANDATORY — do not skip)

The sunflower view renders the review page from a sibling `.yaml` + `.html.fragment`
written next to the review `.md`. **Without them the page silently degrades to plain
prose** — the Σ severity-heatmap, dimension chips, severity filter, and findings list
never appear. The `post-write-verify` hook **BLOCKS the `.md` write (exit 2) when the
sibling `.yaml` is missing**, so author the `.yaml` first (or in the same turn) —
here, now, while the findings are still in context.

For each review `.md` you just wrote (`07-review.md` slug-wide, or each
`07-review-<slice-slug>.md` per-slice):

1. Write the sibling **`<stem>.yaml`** (same stem, `.yaml`) — the structured data:
   `dimensions:` (the severity × dimension heatmap matrix), `verdict:`, `findings:`
   (id, severity, dimension, file, line, message, evidence/diff, triage, **status**,
   **surfaced-at**) and the metric counts. Schema: `siblingYamlSchemas.review` in
   `tests/frontmatter.schema.json`. **`findings:` and `counts:` reflect OPEN findings only**
   (status open|deferred|could-not-fix) so the heatmap shows live state — resolved / fixed /
   dismissed history lives in the `.md` body, which renders as prose beneath the fragment.
   Bump `rev:` by 1 each run (first write = 1).
2. Write the sibling **`<stem>.html.fragment`** — one
   `<section class="fragment-review" data-artifact="review" data-rev="<n>">` carrying the
   gallery's review fragment's **interactive layer**: the Σ severity-heatmap, dimension
   chips + severity filter, and the findings list with per-finding evidence/diff/copy
   controls. The fragment is **body-only** (see `_fragment-authoring.md` → "Scope"): the
   `review.mjs` page already renders the heading, the verdict block, and the metric-row —
   do **not** repeat them in the fragment, start at the heatmap.

Authoring rules (do not skip — verifier Check 7 enforces these):

- Inline `<style>` with every selector scoped under `.fragment-review` / `.fr-*`.
- Inline `<script>` scoped via `document.currentScript.closest('.fragment-review')`.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: { name: 'review', artifact: 'review', counts: { findings: <n>, blockers: <n> } } }))`.
- Inline SVG only; no remote anything.
- All data deterministic from the `.yaml` — re-running on the same YAML must produce byte-identical output.

The full contract (allowed shared classes, forbidden tags, YAML→fragment mapping) lives in
[`reference/fragment-author-contract.md`](../../../references/fragment-author-contract.md);
the authoritative gallery is bundled at
[`reference/fragments-gallery.html`](../../../references/fragments-gallery.html).

---

# Step 5c: Write per-dimension rich fragments (MANDATORY — do not skip)

Step 5b covers the **sweep-level** review page (`07-review.md` / `07-review-<slice-slug>.md`).
Each **per-dimension** review file — `07-review-<command>.md` (slug-wide) or
`07-review-<slice-slug>-<command>.md` (per-slice), one per selected review command
(`security`, `correctness`, …) — renders through `review-dimension.mjs`. **Without a sibling
`.yaml` that page falls back to `renderSimple`** (plain prose, no interactive findings): the
focused-dimension equivalent of the S-1 degradation, and `post-write-verify` now BLOCKS
(exit 2) a `type: review-command` `.md` written without it.

Those siblings are authored by the **Step-3 review sub-agent** that wrote each per-dimension
file (it holds that dimension's findings in context — see the sub-agent prompt above). This
section is the **shape spec** the sub-agent follows; at Step 5b confirm every per-dimension
`.md` has its `.yaml` (or a `fragment: none` opt-out for a clean dimension) and author any the
sub-agent missed. For each per-dimension review `.md`:

1. Write the sibling **`<stem>.yaml`** — schema `siblingYamlSchemas.review-dimension` in
   `tests/frontmatter.schema.json`: `artifact: review-dimension`, `dimension`, `parent`
   (the sweep `07-review.md`), `rev`, `verdict` (`ship|caveats|no`), `summary`, `counts`
   (blocker/high/med/low/nit), and `findings` (id, severity, file, line, confidence, action,
   msg, evidence, fix, **status**, **surfaced-at**) — scoped to **this dimension only**.
   `findings:` + `counts:` = OPEN findings only (resolved history stays in the `.md` body);
   bump `rev:` by 1 each run.
2. Write the sibling **`<stem>.html.fragment`** — one
   `<section class="fragment-review-dimension" data-artifact="review-dimension" data-rev="<n>">`
   carrying the **interactive layer**: a severity-filter pill bar, a sortable findings list
   (by severity / file:line), and per-finding expandable evidence→fix rows. The fragment is
   **body-only** (see `_fragment-authoring.md` → "Scope"): `review-dimension.mjs` already
   renders the heading, the verdict block, and the metric-row, and suppresses its static
   findings list when a fragment is present (see `renderers/review-dimension.mjs` lines
   64–67) — start at the filter bar, do not repeat the chrome.

Authoring rules (verifier Check 7 enforces these):

- Inline `<style>` with every new selector scoped under `.fragment-review-dimension`. Use a
  **distinct prefix** (e.g. `.rd-*`) so it never collides with the sweep fragment's `.fr-*` —
  both fragments can appear on one slug page.
- Inline `<script>` scoped via `document.currentScript.closest('.fragment-review-dimension')`.
- Dispatch `window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: { name: 'review-dimension', artifact: 'review-dimension', dimension: '<dim>', counts: { findings: <n>, blockers: <n> } } }))`.
- Inline SVG only; no remote anything.
- All data deterministic from the `.yaml` — same YAML → byte-identical output.

Load `_fragment-authoring.md` first; the full
contract lives in [`reference/fragment-author-contract.md`](../../../references/fragment-author-contract.md).

---

## Step — Write free narrative fragments

Beyond the structured page, this artifact ships one or more **free narrative fragments**: `<stem>.<NN-label>.html.fragment` siblings of **unrestricted raw HTML** that tell a story the rendered page can't on its own — a bespoke diagram, a before/after flow, a state machine, an annotated mock, or an interactive widget. Author **as many as the story needs**; there is **no contract, no scoping, and no sibling `.yaml`** for these. Prefix the label with `NN-` (`01-`, `02-`, …) to order them; they inject raw-inline below the page body. See [_fragment-authoring.md](_fragment-authoring.md) Step F2 and [narrative-fragments.md](../../../references/narrative-fragments.md).

---

# Step 6: Update Index and Return

1. Update `00-index.md` frontmatter:
   - `current-stage: review`
   - `status: active`
   - `progress.review: complete` (stays `complete` on every accumulating re-run)
   - Add review artifacts to `workflow-files` based on `review-scope` (idempotent — do not duplicate entries a prior run already added):
     - **Per-slice**: add the slice-scoped `07-review-<slice-slug>.md` and every `07-review-<slice-slug>-<command>.md` file (do NOT remove sibling slices' review files — they remain valid).
     - **Slug-wide**: add `07-review.md` and every `07-review-<command>.md` file. If prior per-slice review files exist for this workflow, leave them in `workflow-files`; they are not invalidated by a slug-wide run.
   - Set `next-command` and `next-invocation` based on verdict
2. Return the compact chat summary with verdict and options.

# Adaptive routing — evaluate what's actually next

Routing is **driven by the OPEN findings** plus the `verdict:`. Review no longer routes to `$wf implement` as the default fix path — the fix loop is owned by this stage. `$wf implement <slug> [<slice>] reviews` survives only as a manual escape (e.g., when `could-not-fix` findings remain and the user wants that mode's sequential UI).

After completing the fix loop, evaluate the (open-findings) verdict and present the user with ALL viable options:

**Option A: Handoff** → `$wf handoff <slug>`
Use when: `verdict: ship` (or `ship-with-caveats` where the caveats are not blockers) AND no OPEN blocker findings remain AND all intended slices on this branch are complete. Handoff aggregates all complete slices automatically.
**If more slices remain** on this branch before handoff: use Option D (next slice) — implement remaining slices first, then run `$wf handoff <slug>` once for the full PR.

**Option B: Re-invoke review (accumulating re-run)** → `$wf review <slug> [<slice>]`
Use when: OPEN blocker or `could-not-fix` findings remain AND the user wants another pass. A re-invocation is a normal accumulating run — it re-checks the fixed code, merges fresh findings, and resolve-sweeps the ones the fixes cleared (no round counter, no `convergence` state). State the unresolved findings (`could-not-fix` plus any deferred BLOCKER) clearly before recommending.
**Compact recommended before re-invoking** — fix sub-agent chatter and triage UI is noise for the next review pass.

**Option C: Escalate to manual implement** → `$wf implement <slug> [<slice>] reviews`
Use when: The remaining findings cannot be addressed by sub-agent patches — they need design rethink, cross-cutting refactor, or input the review agent cannot supply. This is the explicit escape hatch back to stage 5; use only when re-invoking review would surface the same unfixable findings again. Also available when the user prefers stage 5's per-finding sequential UI over review's batched fix dispatch.

**Option D: Next slice** → `$wf plan <slug> <next-slice>` or `$wf implement <slug> <next-slice>`
Use when: This slice is approved AND more slices remain. Check `03-slice.md`.
**Compact recommended** — previous slice's full lifecycle (implement + verify + review) is noise for the next slice.

**Option E: Skip handoff, go to Ship** → `$wf ship <slug>`
Use when: No team to hand off to, no PR description needed, CI/CD handles the rest.

**Option F: Extend scope** → `$wf-meta extend <slug> from-review`
Use when: Review findings reveal **missing capability** rather than broken implementation — scope that was never built, not code that is wrong. Signal: findings describe "X should also do Y" or "there is no handler for Z" rather than "X does Y incorrectly". Use this over Option C when the work required is net-new rather than corrective.

**Option G: Amend spec** → `$wf-meta amend <slug> from-review`
Use when: Review findings reveal that the **slice definition or acceptance criteria were themselves wrong** — the implementation did what it was told, but what it was told to do was incorrect. Signal: multiple findings stem from the same incorrect assumption in the spec, or a finding says the approach is fundamentally wrong rather than buggy.

Write ALL viable options into `## Recommended Next Stage`.
