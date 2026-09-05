---
description: Author the project-level `.ai/ship-plan.md` — a one-time, repo-scoped contract that captures the project's *entire* CI/CD + developer-experience pipeline. The outbound half is what "ship" means (publishing, version scheme, release CI/CD wiring, post-publish verification, rollout/rollback, recovery playbooks, announcements). The inbound half is the contributor experience (code-quality gates: commit-message + PR-title convention, format/lint/type-check/coverage; local developer experience: git hooks, editorconfig, runtime-version files, task runner; repo governance: branch protection, CODEOWNERS, PR/issue templates, dependency automation). Works by **discovery → hypothesis → confirm**: reads what's already in the repo (CI workflows, infra-as-code, package manifests, runbooks, linters, hook frameworks, governance files), proposes a pipeline-shape hypothesis, then lets the user confirm or correct each contract. Optional `--from-template <kind>` biases the hypothesis toward a known shape; the template is a *seed*, not a control-flow branch. Read by every subsequent `/wf ship <slug>` invocation and built by `/wf ship-plan build`.
argument-hint: "[--from-template <kotlin-maven-central|npm-public|pypi|container-image|server-deploy|library-internal>]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `wf ship-plan init`, a **one-time project-level setup utility**. The plan you author here is consumed by every `/wf ship <slug>` invocation thereafter.

# Design intent

The plan is a *contract* between this project and the pipeline commands (`/wf ship` reads the outbound half; `/wf ship-plan build` builds both halves). Authoring it well means **understanding how this specific repo actually ships *and* how a contributor actually works in it** — not picking the nearest preset and filling blanks.

The contract has two halves. The **outbound** half (Blocks A–G) is the release: what ship means, versioning, release CI/CD, post-publish, rollout/rollback, recovery, announce. The **inbound** half (Blocks H–K) is the developer experience hit on every commit and PR: code-quality gates, local git hooks + dev-setup, repo governance, and security/supply-chain gates. Both are authored here so the pipeline is built whole.

This command therefore runs three loops:
1. **Discovery** — read what the repo already says (CI workflows, infra-as-code, package manifests, runbooks). Don't ask before reading.
2. **Hypothesis** — propose an inferred ship-shape and let the user confirm, correct, or replace each piece. Gate-question options ([_gate-question.md](../_gate-question.md)) are *prompts to refine a hypothesis*, not multiple-choice quizzes — `Other (describe)` is always available.
3. **Codify** — write a schema with a small **required core** (the fields `/wf ship` reads) plus **open extensions** (`additional-contracts[]`) for project-specific shape.

Templates are **exemplar text** you can show the user when it helps. They are not branches in the control flow.

# What this command produces

A single file: **`.ai/ship-plan.md`** at the **repo root** (not under `.ai/workflows/`). The plan is per-project, not per-workflow.

# What this command does NOT do

- It does not run a release.
- It does not modify workflow artifacts under `.ai/workflows/`.
- It does not author `09-ship-run-*.md` files (those are written per-release by `/wf ship`).
- It does not duplicate work already in `08-handoff.md` (handoff is per-PR readiness; this plan is per-release).
- It does not run any of the commands it discovers (no `gradle publish --dry-run`, no `terraform plan`, etc.). Discovery is read-only.
- It does not **apply** anything to the repo or remote. Authoring the contract is all this command does; generating workflows/config and applying remote settings (branch protection, environment protection, merge settings) is `/wf ship-plan build`'s job, behind its own confirm gates.

> **Auto second opinion (objective triggers).** Before you lock the pipeline contract,
> **auto-invoke** `/consult codex <critique this proposed ship / CI-CD pipeline shape — gaps, risky
> ordering, missing gates>` (pinning `codex`/`claude` keeps it free; the repo-aware oracles check
> the hypothesis against the repo's actual CI) when ANY of: (a) the proposed pipeline includes a
> deploy/release leg to a live target; (b) discovery evidence from the repo's actual CI contradicts
> the hypothesized shape; (c) the path about to be locked is one discovery ranked riskier than an
> available alternative. Skip only when none of the triggers hold; the user may invoke it explicitly
> with any provider.

# CRITICAL — execution discipline

You are a **plan author**, not a problem solver.
- Do NOT make code changes, run builds, or modify CI files.
- Do NOT overwrite an existing `.ai/ship-plan.md`. If one exists, STOP and tell the user: *"Plan exists at `.ai/ship-plan.md`. Use `/wf ship-plan edit` to edit one block."*
- Do NOT skip discovery (Step 1) even when `--from-template` is passed. The template biases the hypothesis; discovery decides whether the hypothesis is actually right for this repo.
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.

---

# Step 0 — Orient

1. Parse `$ARGUMENTS` for `--from-template <kind>`. If present, validate `<kind>` ∈ {`kotlin-maven-central`, `npm-public`, `pypi`, `container-image`, `server-deploy`, `library-internal`}. Record it as `template-hint`. If an unknown kind, STOP and list the valid kinds. **Do not read the template file yet** — discovery comes first; you'll use the template as a seed during the hypothesis pass (Step 2).
2. STOP if `.ai/ship-plan.md` already exists. Tell the user to amend instead.
3. Detect repo basics: `git remote get-url origin`, derive `<owner>/<repo>` and `project-name`.

---

# Step 1 — Discovery pass

Read the repo, in parallel, to understand what's actually there. **No questions yet.** Surface findings to the user as a *discovery report* at the end of this step.

Read the source groups and build the inferred fields per [init/_discovery.md](init/_discovery.md) (1.1 What to read, 1.2 What to extract). Every inferred field carries its source file and a confidence. Remote reads are read-only.

## 1.3 Present discovery report

Show the user the discovery report as a compact bullet summary (no gate question yet). Make it skimmable:

```
Discovered:
- Ship shape looks like: deploy-rolling to k8s (helm/ + .github/workflows/deploy.yml on:push:main)
- Version source-of-truth candidates: helm/Chart.yaml (version: 0.4.2), package.json (version: 0.4.2)
- Bump tooling found: release-please (release-please-config.json)
- Release workflow: .github/workflows/release.yml (jobs: build, test, publish-image, helm-upgrade)
- Secret refs in workflows: GHCR_TOKEN, KUBECONFIG_PROD, KUBECONFIG_STAGING
- Registry hostnames: ghcr.io
- Runbook material: docs/runbooks/rollout-stuck.md, docs/runbooks/image-pull-failure.md → seed playbook candidates
- Inbound DX: commitlint (commitlint.config.js) + husky (.husky/) found; lint=eslint, format=prettier, type-check=tsc; coverage threshold 80% (jest); .nvmrc pins node 20; PR-title lint NOT found
- Governance: CODEOWNERS present; renovate.json found; branch protection on main = 1 approval + required checks [build, test] (gh api); code-owner review NOT required; merge = squash-only; 1 environment (production, no reviewers)
- Security: CodeQL workflow found; dependency-audit NOT run in CI; gitleaks NOT found; no SBOM; no license policy
- Topology: monorepo (pnpm workspaces, 4 packages)
- Additional contracts suggested: data-migration (liquibase/ found)
```

Then ask the user (free-form, not a gate question):
> *"Does this match how the project actually ships? Anything to add, correct, or ignore before we move on?"*

Apply the user's corrections to the in-memory discovery state. If the user says *"the helm dir is dead code, ignore it"*, mark that evidence as `discarded`.

---

# Step 2 — Hypothesis pass: confirm each contract

For each required-core contract below, present a **hypothesis derived from discovery** and let the user confirm, refine, or replace it. The structure is uniform:

1. State the inferred value + the evidence (1–2 lines, quoting Step 1's findings).
2. Ask a gate question per [_gate-question.md](../_gate-question.md) with **options derived from discovery**, ranked by confidence, plus `Other (describe)` always present as the last option.
3. If `template-hint` was set in Step 0 *and* the template's seed for this field differs from the inferred value, surface both: *"Discovery suggests X; the `<template-hint>` template usually uses Y. Which fits this project?"*
4. Capture the answer in the in-memory plan state.

If discovery had nothing to go on (e.g., the project has no `.github/workflows/`), say so, and ask from a generic option list. Don't pretend you inferred when you didn't.

Run the contracts in this order:

Blocks A–K, each with its hypothesis source and its gate question, are in [init/_blocks.md](init/_blocks.md). Blocks A–G are the outbound half (what ship means, versioning, CI/CD, post-publish, rollout and rollback, playbooks, announcement); Blocks H–K are the inbound half (code-quality gates, local developer experience, governance, security). Run them in that order.

---

# Step 3 — Additional contracts (open extensions)

Ask the user (as a gate question per [_gate-question.md](../_gate-question.md); multi-select), seeded by `inferred.additional-contracts-suggested`:

```yaml
question: "Does this project have any of these contracts that the standard plan doesn't cover?"
header: "Additional contracts"
options:
  - { label: "data-migration",          description: "Schema migrations have their own cadence + reversibility policy (Liquibase/Flyway/Alembic/Prisma/etc.)." }
  - { label: "feature-flag-rollout",    description: "Feature flags gate the rollout (LaunchDarkly/Statsig/Unleash/etc.). Flip cadence + cleanup policy." }
  - { label: "infrastructure-as-code",  description: "Terraform/Pulumi state has its own apply policy and drift-check cadence." }
  - { label: "mobile-app-store",        description: "TestFlight / Play Store review windows + phased rollout %." }
  - { label: "compliance-gate",         description: "SOC2 / PCI / HIPAA evidence collection required per release." }
  - { label: "data-pipeline",           description: "Airflow / dbt / Dagster orchestration with its own promotion cadence." }
  - { label: "schema-registry",         description: "Proto / Avro / OpenAPI registry with compatibility rules." }
  - { label: "Other (describe)",        description: "Project-specific contract not on this list." }
multiSelect: true
```

For each picked, run a small sub-loop (3–5 freeform questions) capturing: `id`, `purpose`, `fields:` (key/value pairs the user names), `enforced-by:` (which command or human checks this).

Each becomes an entry in `additional-contracts[]`. `/wf ship` ignores these by default; consumers that want them must read them by `id`.

## Step 3.5 — Artifact-tracking policy (one question, settled once)

Whether the `.ai/` workflow tree is committed to git or gitignored keeps getting decided ad hoc — worst case mid-ship, at the clean-tree gate, with hundreds of bookkeeping paths dirty (one release run un-tracked 473 paths as in-flight repo surgery, having nearly merged 451 bookkeeping files into `main`). Settle it here, once:

```yaml
question: "Should the .ai/ workflow artifacts (intake/shape/plan/verify bookkeeping) be committed to git, or kept local?"
header: "Artifact tracking"
options:
  - { label: "Tracked (Recommended)", description: "Artifacts ride the branch — reviewable, shared across machines. Ship's clean-tree gate offers a one-keystroke 'commit bookkeeping' for them." }
  - { label: "Ignored",               description: "Artifacts stay local. Writes a .gitignore block: .ai/ except ship-plan.md + sdlc-config.json (the project-level contracts stay tracked)." }
multiSelect: false
```

Record the answer as `artifactTracking: "tracked" | "ignored"` in `.ai/sdlc-config.json` (create the file with just this key if absent — never clobber other keys). On "Ignored", also write the `.gitignore` block now (append, with a `# sdlc-workflow artifacts` marker comment) so the policy is mechanically true, not aspirational. `/wf ship`'s pre-flight (Step 1.1) and `/wf handoff` read this policy instead of improvising; existing repos without the key get a one-time advisory from `/wf status`, never a new gate.

---

# Step 4 — Exemplar pass (on request)

If, during Steps 2 or 3, the user asks *"what does a typical X plan look like?"* — or if they pick a `template-hint` they're unfamiliar with — open the relevant file under `ship-plan-templates/<kind>.md` and show the seed values as **reference reading**, not a fill-in form.

Templates also exist for stealing single fields. If the user is happy with their Block A but wants the `signing-failure` playbook from `kotlin-maven-central`, pull only that block. Each template carries both a `# Seed values` block (outbound Blocks A–G) and a `# Inbound DX seed values` block (Blocks H–K) — surface whichever half the user is asking about.

---

# Step 5 — Confirmation

Present a summary table to the user as gate questions per [_gate-question.md](../_gate-question.md). Surface the required-core values inline and list additional-contract `id`s by name:

```yaml
question: "Plan summary — confirm before writing `.ai/ship-plan.md`?"
header: "Confirm"
options:
  - { label: "Confirm",  description: "Write the plan as summarised." }
  - { label: "Adjust",   description: "Go back and edit a block." }
  - { label: "Cancel",   description: "Discard." }
multiSelect: false
```

If `Adjust`, ask which block (A–K or an additional-contract `id`) and re-run only that block's questions.

---

# Step 6 — Write `.ai/ship-plan.md`

Schema split:
- **Required core** (top of frontmatter) — fixed fields that `/wf ship` reads. Schema-stable; downstream code relies on these names.
- **Extensions** (`additional-contracts[]`) — typed list, open content. Each entry is `{ id, purpose, fields: { ... }, enforced-by: "..." }`.

Write the file with the frontmatter and body in [init/_artifact.md](init/_artifact.md).

---

# Step 7 — Chat return

Return per [_chat-return.md](../_chat-return.md) — narrative lead (what this run produced, key decisions and counts, top risk), then this receipt:
- `wrote: .ai/ship-plan.md`
- `template-hint: <kind | none>`
- `plan-version: 1`
- `additional-contracts: [<id>, ...]` (or `[]`)
- `announcement-template-created: <true | false | skipped>` (from Block G follow-up)
- `inbound-coverage:` one line summarizing Blocks H–K — e.g. `gates: lint+type-check+coverage(80%); commit-convention: conventional (local+ci); hooks: husky; branch-protection: gh-api (1 approval, code-owner req); merge: squash+auto; security: codeql+npm-audit(high)+gitleaks; deps: renovate; topology: monorepo(pnpm,4)`
- `next-steps:`
  - `/wf ship-plan build` — audit and implement the **entire** pipeline from this plan: release + pre-merge workflows, code-quality + commit/PR-title CI, local git hooks, dev-experience files, and repo governance (CODEOWNERS, templates, dependency automation, and branch protection via `gh api` when `apply-via: gh-api`). Creates missing files, patches non-compliant ones.
  - `/wf ship <slug>` — run a release using this plan (requires the pipeline to be in place)
  - `/wf ship-plan edit` — edit any block

---

# Notes on amendment vs. init

- **init**: this command. One-time. Errors if a plan exists. Always runs discovery first.
- **edit**: `/wf ship-plan edit` — opens the existing plan, lets the user pick which block to edit (A–K, or an additional-contract `id`), runs the relevant questions for that block only, bumps `plan-version`. Used when CI/CD changes, secrets rotate, post-publish checks evolve, recovery playbooks are added, code-quality/security gates or governance rules change, or a new additional-contract is introduced.

The plan is intentionally project-scoped — every workflow on the same repo ships through the same pipeline, so the plan only needs to be authored once per project. Run history accumulates per workflow under `.ai/workflows/<slug>/09-ship-run-*.md`.
