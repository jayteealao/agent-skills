---
description: Reads `.ai/ship-plan.md` and brings the repo's *entire* CI/CD + developer-experience pipeline into compliance with it. Audits and builds the outbound half (release + pre-merge GitHub Actions workflows, post-publish checks, rollback) AND the inbound half (code-quality CI gates, commit-message + PR-title convention enforcement, local git hooks, editorconfig/version files/task targets, CODEOWNERS, PR/issue templates, dependency automation, and branch protection). Creates missing files, adds missing jobs/steps to existing files (no file is ever overwritten), and — when the plan opts in via `apply-via: gh-api` — applies branch-protection settings to the remote repo behind an explicit confirm gate. Each gap is shown to the user before any write or remote mutation occurs.
argument-hint: "[--dry-run]"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `wf ship-plan build`. Your job: read the ship plan as the specification, measure the gap between what exists and what is required, confirm with the user, then implement only what is missing.

# Design contract

- **`.ai/ship-plan.md` is the specification.** What it says is right; what is in the repo is the current implementation. Your job is to close the gap.
- **No overwrites.** Never replace an existing file wholesale. For existing workflow files, use targeted edits — append jobs, add steps, extend env blocks, fix `on:` triggers. The existing file's structure and content are preserved.
- **Fully runnable output.** Generated YAML must be syntactically valid and produce a working pipeline given the plan's secrets and commands. Use pinned action versions (`actions/checkout@v4`, etc.). Include `permissions:` blocks. Substitute the plan's literal `publish-cmd`, `publish-dry-run-cmd`, and `required-secrets[]` — not placeholders.
- **Minimal diff.** Only add what is needed. Do not reorganize, rename, or reformat existing content.
- **Two output classes.** (1) **Files** — `.github/workflows/*.yml` (outbound + inbound CI: release, pre-merge, code-quality, commit/PR-title, CodeQL, scheduled scans) plus inbound-DX config files at their conventional paths: commitlint config, git-hook framework config (`.husky/`, `lefthook.yml`, `.pre-commit-config.yaml`), `.editorconfig`, runtime-version files, task-runner targets, `CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/`, `.github/dependabot.yml` / `renovate.json`, `CONTRIBUTING.md`. (2) **Remote state** — branch protection (Step 12), GitHub Environment protection (Step 14), and repo merge settings (Step 15). Everything in class (1) follows the no-overwrite / minimal-diff / trace-insertion rules.
- **Remote mutation is gated and opt-in.** The remote state this command touches is limited to **branch protection, environment protection, and repo merge settings** — each only when the plan opts in (`apply-via: gh-api` / equivalent). Never apply silently: show the current-vs-desired diff and the exact `gh api` payload, then require an explicit confirm. A "print commands only" choice is always offered and writes the commands to the compliance artifact instead of executing them. This command never pushes code, opens PRs, sets secrets, or runs a release.
- **Trace insertions.** When adding to an existing file, add a single-line comment above the inserted block: `# Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>`. Never add this comment to content the user wrote themselves. For non-YAML config files use that language's comment syntax; for files that cannot carry comments (JSON), record the provenance in the compliance artifact instead.
- **The next release must stay green.** Build closes the gap toward the plan's *target* state, but it must never wire a gate whose upstream infrastructure does not exist yet — a `needs:` on a staging-smoke job with no staging apps provisioned, a required context nothing reports, an environment gate on an environment that hasn't been created. Doing so makes the very next tag/release guaranteed-red (one build left production deploys blocked for days this way). Any gate whose referenced infrastructure Step 17's provisioning probe cannot confirm is **scaffolded inert**: gate the job/step on a repo variable (`if: ${{ vars.SDLC_GATE_<NAME> == 'true' }}`) with the activation step recorded in the compliance artifact's `gates-to-activate:` ledger. The gate goes live via that explicit activation, never as a side effect of build.
- **Never pin a version literal the repo already declares.** Tool/runtime versions in generated workflows must reference or match the repo's own declaration (`packageManager`, `.nvmrc`, `engines`, gradle wrapper, `.tool-versions`) — a second copy drifts and breaks the pipeline on first run (a pinned `pnpm/action-setup version:` alongside `packageManager` broke all five generated workflows of one project's first CI run).

# What this command does NOT do

- It does not push commits, open or merge PRs, or run a release (`/wf ship` does that).
- It does not set secrets — it lists the required ones for the user to set via `gh secret set`.
- It does not install dependencies — generated hooks/CI reference dev-deps recorded in `deps-to-install`; the user installs them.
- It does not mutate any remote state beyond the three gated settings above, and never without an explicit confirm + a print-only fallback.
- It does not author or edit `.ai/ship-plan.md` — that is `/wf ship-plan init` / `/wf ship-plan edit`. This command only *reads* the plan and closes the repo gap against it.

> **Auto second opinion (objective triggers).** After the pipeline audit produces its findings,
> **auto-invoke** `/consult codex <second opinion on these pipeline compliance findings and the
> proposed remediation>` (pinning `codex`/`claude` keeps it free) when ANY of: (a) any finding is a
> missing gate on the ship path (hard-block class); (b) the proposed remediation edits CI workflows
> that deploy to production; (c) the findings show drift between the live pipeline and the decisions
> recorded in `.ai/ship-plan.md`. Skip only when none of the triggers hold; the user may invoke it
> explicitly with any provider.

---

# Step 0 — Orient

1. Parse `$ARGUMENTS` for `--dry-run`. If present, run all audit steps and generate the full gap report but write nothing. Label every planned change `[DRY RUN — not written]`.
2. **Read `.ai/ship-plan.md`.** STOP if missing: *"No ship plan found at `.ai/ship-plan.md`. Run `/wf ship-plan init` first."* Parse all blocks A–K into in-memory state. (Plans authored before a given inbound block simply lack its key — `code-quality` / `local-dx` / `governance` / `security` plus the `ship-environments[].protection` and `ci-pipeline.ci-ergonomics` extensions — and the matching audits among K–S then skip.)
3. **Detect the language/runtime ecosystem** from the plan's `version-source-of-truth[]` paths and `publish-cmd` content:

   | Signal | Ecosystem |
   |---|---|
   | `package.json` in source-of-truth | Node.js |
   | `pyproject.toml` or `setup.py` | Python |
   | `build.gradle*` or `pom.xml` | JVM |
   | `Cargo.toml` | Rust |
   | `docker build` or `docker/build-push-action` in publish-cmd | Container |
   | `helm upgrade` or `kubectl` in publish-cmd | Kubernetes deploy |
   | Anything else | Unknown — generate shell-only steps with `# TODO:` markers |

4. **Enumerate `.github/workflows/*.yml`.** Read each file fully. Build an in-memory index: `filename → on-triggers → job-names → step-run-commands → secret-refs`. Secret refs are all `${{ secrets.<NAME> }}` patterns.
5. **Determine the base branch** from `plan.ship-environments[0].name` or default `main`. (Prefer `plan.governance.branch-protection.base-branch` when present.)
6. **Index inbound-DX state** (only for blocks the plan actually carries; plans authored before a block simply skip its audits — `code-quality` → K/L, `local-dx` → M/N, `governance` → O/R, `security` → P, env `protection` → Q, `ci-ergonomics` → S). Probe the conventional paths for existing config: commitlint config, hook framework (`.husky/`, `lefthook.{yml,yaml}`, `.pre-commit-config.yaml`, `simple-git-hooks` in `package.json`), `.editorconfig`, runtime-version files, task-runner files, `CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/`, `.github/dependabot.yml` / `renovate.json` / `.renovaterc*`, `CONTRIBUTING.md`, CodeQL/SAST + audit/secret/SBOM/license workflows. Build a `path → present?` index. Record `plan.governance.branch-protection.apply-via` (and any env `apply-via`) — it decides whether Steps 12/14/15 may call `gh api`.

---

# Step 1 — Compliance audit

Evaluate each requirement as **Compliant / Missing / Non-compliant** and record the exact delta needed. Run the nineteen audits (A–S) in [build/_audits.md](build/_audits.md). Audits K–S cover the inbound half of the plan; run each only when the plan carries its block, and skip it silently otherwise.

---

# Step 2 — Gap report + confirmation

Present the audit results as a structured table — one row per audit with Requirement, Status, and Planned action; the shape is the *Gap report table* in [build/_audits.md](build/_audits.md). Then confirm before writing anything.


Inbound audit rows (K–S) appear only when the plan carries the matching block. The plan-block → audit map: **H (code-quality) → K, L** · **I (local-dx) → M, N** · **J (governance + merge) → O, R** · **K (security) → P** · **A (env protection) → Q** · **C (ci-ergonomics) → S**.

Then ask a gate question per [_gate-question.md](../_gate-question.md):

```yaml
question: "Implement all missing/non-compliant items as listed above?"
header: "Build pipeline"
options:
  - label: "Implement all (Recommended)"
    description: "Create missing files; patch non-compliant files. No file is overwritten."
  - label: "Select items"
    description: "Choose which gaps to close now; defer the rest."
  - label: "Cancel"
    description: "Discard — make no changes."
multiSelect: false
```

If "Select items": present each non-Compliant audit row as a multi-select and proceed with only the selected set.

---

# Steps 3–16 — Implement the gaps

Run one implement step per Missing or Non-compliant audit row (or per selected row), in step order. Load a step file only when one of its audits needs it. Every step obeys the Design contract above: no overwrites, targeted edits, traced insertions, the next release stays green.

| Step | Audits | File |
|---|---|---|
| 3 — pre-merge workflow | A, D | [build/pre-merge.md](build/pre-merge.md) |
| 4 — release workflow (4a file, 4b job templates, 4c version-bump workflows) | B, C, E, F, G | [build/release.md](build/release.md) |
| 5 — post-publish verification · 6 — rollback workflow · 7 — runbook stubs | H, I, J | [build/post-publish.md](build/post-publish.md) |
| 8 — code-quality CI gates · 9 — commit + PR-title convention CI · 10 — local git hooks · 11 — developer-experience files | K, L, M, N | [build/inbound-dx.md](build/inbound-dx.md) |
| 12 — repo governance + branch protection · 14 — environment protection · 15 — merge controls (gated remote mutations) | O, Q, R | [build/governance.md](build/governance.md) |
| 13 — security & supply-chain gates | P | [build/security.md](build/security.md) |
| 16 — CI ergonomics | S | [build/ci-ergonomics.md](build/ci-ergonomics.md) |

## Idempotency (Steps 8–12)
Mirror the outbound steps' re-run safety: **read each target file first and skip the write if it already equals the desired content**; appends to existing workflows/configs go through the no-overwrite/targeted-edit rules. Husky `prepare` script and `lint-staged`/framework wiring are no-ops when already present. `gh api -X PUT`/`PATCH` calls (Steps 12, 14, 15) are inherently idempotent — re-applying the same desired state is safe. A second `build` run on an already-compliant repo writes nothing and mutates nothing.

---

# Step 17 — Validate

After all writes, run the seven validation checks in [build/_validate.md](build/_validate.md) over every created or patched file: YAML syntax, actionlint, config syntax, version-literal consistency, `needs:` graph integrity, the repo's own format and lint gates, and the provisioning probe. Record each result in the compliance artifact's `validation:` block.

---

# Step 18 — Write compliance artifact

Write `.ai/pipeline-compliance.md` with the frontmatter and body in [build/_artifact.md](build/_artifact.md). Every audit letter gets a status; every gated mutation gets an `*-applied` value; `routing:` records the Step 18.5 outcome.

---

# Step 18.5 — Route the outputs (close the unreviewed-code hole)

Build's outputs are release-critical code that no lifecycle stage has reviewed. Left silently uncommitted, they sit in the working tree until `/wf ship`'s clean-tree gate forces a commit-or-drop decision at the worst moment — which is exactly how 34 unreviewed workflow lines once entered a production release with an external review bot as their only reviewer (it found 3 Major defects in them, including a check that could pass green while defeating its own purpose). Never end a build that wrote files without an explicit routing decision. Ask (as a gate question per [_gate-question.md](../_gate-question.md); skip when nothing was written or `--dry-run`):

- **Route to a review slice (Recommended when release/deploy workflows were touched)** — print the seed `/wf intake <slug> fix review ship-plan build outputs (plan v<N>): <file list>` and STOP after Step 19. The slice's verify/review then treat the build diff like any other code before it can ship. Record `routing: sliced`.
- **Commit now** — `git commit` the written files (explicitly by path, never `-A`) as `chore(ship-plan): build outputs, plan v<N>` with trailer `sdlc-unreviewed: true` (so handoff/review can see the provenance). Recommend `/wf review` over the commit in the chat return. Record `routing: committed`. This is the one commit this command makes — the "does NOT push/open PRs/release" boundary is unchanged.
- **Leave uncommitted** — allowed, but recorded: `routing: left-uncommitted` + `uncommitted-outputs: [paths]` in the compliance artifact. `/wf ship`'s Step 1.1 classification refuses to silently sweep these (it routes them to review or an explicit recorded acceptance).

---

# Step 19 — Chat return

Return per [_chat-return.md](../_chat-return.md) — narrative lead (what this run produced, key decisions and counts, top risk), then this receipt:
- `wrote: <list of created/patched files>`
- `plan-version: <plan.plan-version>`
- `ecosystem: <detected>`
- `audits: <A–S final status>`
- `branch-protection-applied: <yes | printed | skipped | failed | n/a>`
- `environment-protection-applied: <yes | printed | skipped | failed | n/a>`
- `merge-settings-applied: <yes | printed | skipped | failed | warn | n/a>`
- `secrets-to-set-manually: <list of names with gh secret set commands>`
- `deps-to-install: <list of dev-deps the inbound config needs, with install commands>`
- `warnings: <inert-until-installed note; merge-queue tier unavailable; mechanism mismatch; etc.>`
- `validation: yaml-syntax=<status>, actionlint=<status>, config-syntax=<status>, version-consistency=<status>, graph-integrity=<status>, repo-gates=<status>, provisioning=<status>`
- `gates-to-activate: <each inert gate with its blocked-on + activation command — the pipeline is NOT fully live until these are activated>`
- `routing: <committed | sliced | left-uncommitted — how the outputs left this run (Step 18.5)>`
- `next-steps:`
  - Install dev deps the inbound config references: `<install cmd>` (commitlint/husky/lint-staged/etc.); then run the hook-framework install (e.g. `npm run prepare`, `pre-commit install`) — **hooks/CI are inert until this is done**
  - Set secrets: `gh secret set <NAME>` for each required secret (or via GitHub Settings → Secrets)
  - For any `*-applied` field that is `printed`/`skipped`/`failed`, run the `gh api` command from the compliance artifact (needs repo-admin auth)
  - Push a PR to trigger the pre-merge workflow (build/test/lint/type-check/coverage + commitlint + PR-title + security gates)
  - Create a test tag or trigger `workflow_dispatch` to test the release workflow end-to-end
  - `/wf ship-plan build --dry-run` to re-check compliance after making changes
  - `/wf ship-plan audit` for a read-only **soundness** pass over the plan and the pipeline you just built — compliance means "matches the plan"; audit asks whether the plan (and the workflows realizing it) are actually *correct* before a real release
  - `/wf ship <slug>` when ready for the first real release
