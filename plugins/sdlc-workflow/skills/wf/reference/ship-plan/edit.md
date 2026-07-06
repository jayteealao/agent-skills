---
description: Block-editor for the project-level `.ai/ship-plan.md`. Opens the existing plan, lets the user pick which block to edit (A–K, or an additional-contract id), re-runs the relevant questions for that block only, then bumps `plan-version`. Use after CI/CD changes, secrets rotate, post-publish checks evolve, recovery playbooks are added, code-quality/security gates or governance rules change, or a new additional-contract is introduced.
argument-hint: ""
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

You are running `/wf ship-plan edit`, the **block-editor for the project-level `.ai/ship-plan.md`**. This command edits the existing plan — it does NOT create a new one (use `/wf ship-plan init` for that) and does NOT amend workflow stage artifacts (use `/wf amend <slug>` for that).

---

## Step S0 — Orient

1. Verify `.ai/ship-plan.md` exists. If not, STOP: *"No ship plan exists. Run `/wf ship-plan init` first."*
2. Read the plan in full. Capture the current `plan-version` integer.

## Step S1 — Identify which block to amend

Use AskUserQuestion:

```yaml
question: "Which block of the ship plan needs editing?"
header: "Plan block"
options:
  - { label: "A — Ship meaning + environments + cadence",  description: "What does ship mean, which envs, how often." }
  - { label: "B — Versioning contract",                    description: "Scheme, source-of-truth files, bump rule, prerelease/postrelease." }
  - { label: "C — CI/CD contract",                         description: "Release trigger, workflow file, required secrets, dry-run + publish commands." }
  - { label: "D — Post-publish verification",              description: "Checks run after publish, propagation window, poll interval." }
  - { label: "Inbound (H–K)",                              description: "Code-quality gates (commit/PR-title convention, format/lint/type-check/coverage), local developer experience (git hooks, editorconfig, task runner), repo governance (branch protection, CODEOWNERS, templates, dependency automation, merge controls), or security & supply-chain gates (SAST, dependency-audit, secret-scanning, SBOM, license)." }
  - { label: "Other (E, F, G, or additional-contract)",    description: "Rollout/rollback, recovery playbooks, announcements, or an additional-contract by id." }
multiSelect: false
```

If the user picks "Inbound (H–K)", run a follow-up freeform prompt: *"Which block? `H` (code-quality gates), `I` (local developer experience), `J` (repo governance + merge), or `K` (security & supply-chain gates)."* — and route accordingly. Note that GitHub Environment protection lives in Block A and CI-ergonomics in Block C — pick those blocks to edit them. If the user picks "Other", run a follow-up freeform prompt: *"Which block? `E` (rollout/rollback), `F` (recovery playbooks), `G` (announcements), or the `id` of an additional-contract."* — and route accordingly. Additional-contract amendments edit only the matching entry in `additional-contracts[]`; they do not bump `plan-version` differently from block amendments.

## Step S2 — Re-run the relevant block's questions

Load `${CLAUDE_PLUGIN_ROOT}/skills/wf/reference/ship-plan/init.md` and re-run **only the chosen block's hypothesis loop under Step 2** (Block A → Step 2 Block A; Block B → Step 2 Block B; Block C → Step 2 Block C; Block D → Step 2 Block D; Block E → Step 2 Block E; Block F → Step 2 Block F; Block G → Step 2 Block G; Block H → Step 2 Block H; Block I → Step 2 Block I; Block J → Step 2 Block J; Block K → Step 2 Block K). For an additional-contract amendment, run only the sub-loop in Step 3 for the named `id`. Pre-fill each question with the plan's current value so the user only changes what's actually different.

When the amended block is one of the inbound blocks (H–J), remind the user that `/wf ship-plan build` must be re-run to bring the repo's files (and branch protection) back into compliance with the new plan version.

**Skip the Discovery pass** — edit reuses the existing plan as ground truth. Discovery is only for fresh authoring via `/wf ship-plan init`.

## Step S3 — Confirmation

Present a diff-style summary using AskUserQuestion:

```yaml
question: "Apply these changes to `.ai/ship-plan.md`?"
header: "Apply"
options:
  - { label: "Apply",   description: "Write the changes; bump plan-version." }
  - { label: "Cancel",  description: "Discard." }
multiSelect: false
```

## Step S4 — Write

Update only the changed block's frontmatter and corresponding markdown section. Bump `plan-version` by 1 and refresh `updated-at`. Do NOT touch other blocks — **with one exception for derived fields:**

**Re-derive after a Block H or C amendment.** Block H's enabled code-quality gates are the canonical source of the pre-merge check list; Block C's `ci-pipeline.pre-merge-checks[]` and Block J's `governance.branch-protection.required-checks[]` are *derived* from them. So when the amended block is **H** (gate added/removed/renamed) or **C** (pre-merge-checks edited directly), recompute the other two derived lists to match and write them in the same amendment. This is not "touching an unrelated block" — it keeps a single source of truth consistent. Note the cross-block update in the chat return.

## Step S5 — Chat return

Return only:
- `wrote: .ai/ship-plan.md`
- `block-amended: <A|B|C|D|E|F|G|H|I|J|K | additional-contract:<id>>`
- `plan-version: <new value>`
- `derived-fields-updated: <C.pre-merge-checks + J.required-checks re-derived | none>` (only when H or C was amended)
- `next: any in-flight ship runs will record plan-version-at-run = <new value>`. If an inbound block (H–J) changed, re-run `/wf ship-plan build` to bring the repo + remote settings back into compliance.

The next `/wf ship <slug>` invocation will read the amended plan and stamp the new `plan-version` into the run's `plan-version-at-run` field, which is useful for retro analysis ("did the rollout strategy change between v1.4.0 and v1.4.1?")
