---
description: Shared single-source procedure — the ship-plan readiness pre-check run by `/wf handoff` and `/wf ship`. Detects a missing `.ai/ship-plan.md` and detects drift between the plan and how the code actually ships (version sources, secrets, workflow files, release-relevant change surface, plan staleness), then gates: route to the sanctioned editor (`/wf ship-plan init` | `/wf ship-plan edit`) or record an explicit acknowledgement. It NEVER edits the plan itself — authoring stays in the ship-plan skill.
---

# Ship-plan readiness pre-check (SHARED — single source)

**A ship plan that no longer describes how the code actually ships is worse than no plan at all** — it lends a stale contract false authority at the exact moment (merge, tag, publish) that authority is irreversible. This pre-check is the guard: before `/wf handoff` declares a PR ship-ready and before `/wf ship` runs a release, confirm the project's `.ai/ship-plan.md` exists **and** still matches the repository. Both stages **gate** on the result — they cannot proceed silently past a missing or drifted plan; they require the plan fixed, or an explicit, recorded acknowledgement.

This file is loaded and followed verbatim by `ship.md` and `handoff.md`. It is the ONLY place the pre-check procedure lives — do not inline it elsewhere; cite it.

## Boundary — this check routes, it never edits

The plan is a contract authored by `/wf ship-plan init` and amended, one block at a time, by `/wf ship-plan edit` (which bumps `plan-version`). This pre-check **detects and routes**; it does not open, rewrite, or bump the plan. When a fix is needed it **STOPs with the exact `/wf ship-plan …` command** (route + stop) and the caller resumes after the user has run it. The one non-route outcome is an explicit **acknowledgement** to proceed with known drift — recorded, never silent.

## Inputs the caller passes in

| Input | From | Used by |
|---|---|---|
| `base-branch` | `00-index.md` | change-surface diff, staleness window |
| commit range | `git merge-base HEAD origin/<base-branch>`..`HEAD` (handoff) / the release HEAD (ship) | change-surface signal |
| `has-migration` | handoff frontmatter / `00-index.md` | rollback-playbook signal |
| `branch-strategy` | `00-index.md` | not-applicable path (local-only work) |
| caller | `handoff` or `ship` | which missing-plan gate applies (see Step R3) |

---

# Step R1 — Plan presence

`test -f .ai/ship-plan.md`.

- **Present** → parse Blocks A–G (and any inbound H–K) into memory; go to Step R2.
- **Missing** → skip R2; go to Step R3 with `verdict: missing`.

# Step R2 — Drift detection (three signal groups)

Run all three groups. Collect every mismatch into `drift-findings[]` as `{ signal, detail, suggested-block }` where `suggested-block` names the ship-plan block the user would amend (`B` version, `C` CI/CD + secrets, `D` post-publish, `E` rollout/rollback, `F` recovery-playbooks). A run with an empty `drift-findings[]` is **clean**.

## Group 1 — Version sources, secrets, workflow files (plan-vs-repo mismatch)

1. **Version source-of-truth files.** For each path in `plan.version-source-of-truth[]`: `test -f <path>`. A path that no longer exists → finding `{ signal: version-source-missing, detail: "<path> in the plan no longer exists", suggested-block: B }`. Then glob the repo for version-bearing manifests not covered by the plan — `package.json`, `pyproject.toml`, `setup.py`, `Cargo.toml`, `build.gradle*`, `pom.xml`, `*.gemspec`, `go.mod`, `*.csproj` — and for any that is version-bearing but absent from `version-source-of-truth[]` → finding `{ signal: version-source-new, detail: "<path> carries a version but the plan does not list it", suggested-block: B }`. (In a monorepo a new package is the common trigger.)

2. **Required secrets.** Collect every `${{ secrets.NAME }}` reference across `.github/workflows/*.y*ml` (exclude the auto-provided `GITHUB_TOKEN`). Diff against `plan.ci-pipeline.required-secrets[].name`:
   - referenced in a workflow but **absent from the plan** → finding `{ signal: secret-unplanned, detail: "<NAME> is used by <workflow> but not in required-secrets[]", suggested-block: C }`.
   - listed in the plan but **referenced nowhere** → soft finding `{ signal: secret-orphaned, detail: "<NAME> is in the plan but no workflow references it", suggested-block: C }` (advisory — never the sole blocker).

3. **Workflow files.** Confirm `plan.ci-pipeline.release-workflow-file` (and `plan.release-workflow-file`, `plan.release-workflow-file`'s equivalents) still exist on disk → missing → finding `{ signal: workflow-missing, detail: "<file> named by the plan does not exist", suggested-block: C }`. Then list `.github/workflows/*.y*ml` files added since the plan's `updated-at` (`git log --since="<plan.updated-at>" --name-only --diff-filter=A -- .github/workflows`) and for each → finding `{ signal: workflow-new, detail: "<file> was added after the plan was last updated", suggested-block: C }`.

## Group 2 — Release-relevant change surface (the packaged diff)

Diff the caller's commit range name-only (`git diff --name-only <range>`). Raise findings when the change touches release-shaping surface the plan may not yet reflect:

- Any path under `.github/workflows/`, or a CI/build config (`Dockerfile`, `docker-compose*`, `*.tf`, `helm/`, `k8s/`, `.github/`, build config for the ecosystem) → `{ signal: release-surface-touched, detail: "the packaged change edits <path> — the shipping pipeline moved", suggested-block: C }`.
- A dependency manifest or lockfile changed (`package.json`/`package-lock.json`/`pnpm-lock.yaml`/`yarn.lock`, `pyproject.toml`/`poetry.lock`, `Cargo.toml`/`Cargo.lock`, `go.mod`/`go.sum`, `*.gradle*`, `pom.xml`) → `{ signal: dependencies-changed, detail: "dependencies changed in <path> — a new registry/target may need planning", suggested-block: C }`.
- `has-migration: true` on the workflow **and** no `plan.recovery-playbooks[]` entry whose `id`/`triggers` covers a migration/rollback path → `{ signal: migration-without-rollback, detail: "this change carries a migration but the plan has no matching rollback playbook", suggested-block: F }`.

Each Group-2 finding means "the plan should be revisited," not necessarily "the plan is wrong" — the gate lets the user amend or acknowledge.

## Group 3 — Plan staleness heuristic

Count infra-touching commits since the plan was last updated:
`git log --since="<plan.updated-at>" --oneline -- .github/workflows package.json pyproject.toml Cargo.toml build.gradle build.gradle.kts pom.xml go.mod`
If the count `≥ 5` (and no more-specific Group-1/2 finding already fired for the same surface) → finding `{ signal: plan-stale, detail: "<N> pipeline/manifest commits since the plan was last updated (plan-version <v>, updated <date>) — the plan may be stale", suggested-block: C }`. This is a heuristic nudge: it flags "a lot moved under the plan" even when nothing mismatches exactly.

# Step R3 — Verdict + gate

Compute the verdict from R1/R2:

- `missing` — no plan (from R1).
- `drift` — `drift-findings[]` is non-empty.
- `ok` — plan present, `drift-findings[]` empty. **Record `ship-plan-readiness: ok` and return to the caller — no prompt.**

Both `missing` and `drift` **gate**: present the situation and require an explicit decision. Use AskUserQuestion.

## Missing-plan gate

Infer a `--from-template <kind>` suggestion from the ecosystem (npm→`npm-public`, PyPI→`pypi`, Maven/Gradle→`kotlin-maven-central`, Docker→`container-image`, a deploy→`server-deploy`, otherwise `library-internal`).

- **Caller = `ship`** — ship literally reads the plan; it cannot run without one. Two options only:
  ```yaml
  question: "No ship plan at .ai/ship-plan.md. Ship is plan-driven and cannot run without it. Author one now?"
  header: "Ship plan"
  options:
    - { label: "Create it (Recommended)", description: "STOP here; run /wf ship-plan init --from-template <kind>, then re-run /wf ship." }
    - { label: "Cancel",                  description: "Abort this ship run; leave everything unchanged." }
  multiSelect: false
  ```
  Either way STOP — do not run the release. On "Create it", print the exact command:
  `/wf ship-plan init --from-template <kind>` and set `ship-plan-readiness: missing`.

- **Caller = `handoff`** — a repo may legitimately ship outside this workflow (CI/CD auto-deploy on merge, release owned elsewhere, `branch-strategy: none`). Offer the not-applicable path:
  ```yaml
  question: "No ship plan at .ai/ship-plan.md. /wf ship will require one. Author it now, or is shipping handled outside this workflow?"
  header: "Ship plan"
  options:
    - { label: "Create it now (Recommended)", description: "STOP; run /wf ship-plan init --from-template <kind> before shipping, then re-run handoff." }
    - { label: "Shipping is external",        description: "This work ships outside /wf ship (auto-deploy/owned elsewhere). Proceed; record ship-plan-readiness: not-applicable." }
    - { label: "Cancel",                      description: "Abort the handoff; leave everything unchanged." }
  multiSelect: false
  ```
  - "Create it now" → STOP; print `/wf ship-plan init --from-template <kind>`; set `ship-plan-readiness: missing`. This fires before packaging, so do not emit a partial `08-handoff.md` — point the slug's `00-index.md` `recommended-next-*` at `/wf ship-plan init` and resume handoff after the plan exists.
  - "Shipping is external" → set `ship-plan-readiness: not-applicable`; note the reason in the handoff's `## Risks / Caveats`; return to the caller and continue.
  - "Cancel" → STOP.

## Drift gate

Print the `drift-findings[]` as a short table (signal · detail · block to amend), then:

```yaml
question: "The ship plan drifted from the repo (<N> finding(s)). Amend it before continuing?"
header: "Plan drift"
options:
  - { label: "Amend the plan (Recommended)", description: "STOP; run /wf ship-plan edit and amend block(s) <blocks>, then re-run." }
  - { label: "Acknowledge and proceed",       description: "The drift is known/intentional. Record a reason and continue on the current plan." }
  - { label: "Cancel",                        description: "Abort; leave everything unchanged." }
multiSelect: false
```

- **Amend the plan** → STOP. Print `/wf ship-plan edit` and the specific block letters from the findings' `suggested-block`. Set `ship-plan-readiness: drift`. For `handoff`, point the slug's `00-index.md` `recommended-next-*` at `/wf ship-plan edit` and resume after the amendment (no partial package); for `ship`, do not start the run.
- **Acknowledge and proceed** → capture a freeform reason. Append it to `po-answers.md` with `stage: <handoff|ship>` and the finding signals. Set `ship-plan-readiness: acknowledged` and record the reason + finding signals in the artifact (handoff: `## Risks / Caveats`; ship: `## Pre-flight`). Return to the caller and continue. **The acknowledgement is per-run** — it does not persist to the next handoff/ship, so recurring drift keeps re-surfacing until the plan is actually amended.
- **Cancel** → STOP.

# Step R4 — Record the outcome

Whatever the path, stamp `ship-plan-readiness: <ok | missing | drift | acknowledged | not-applicable>` into the calling stage's artifact frontmatter (`08-handoff.md` / `09-ship-run-<run-id>.md`) and, on the lead slug in batch mode, once for the branch (the plan is project-level — one check per repo per run, not per slug). Older artifacts without the field predate this pre-check; treat an absent field as `skipped`.

---

# Caller integration (quick reference)

- **`/wf ship`** — run this pre-check inside Step 0 immediately after reading `.ai/ship-plan.md`. `missing`/`drift`/`cancel` all STOP before the 13-step sequence. Only `ok`, `acknowledged`, or (never for ship) proceed.
- **`/wf handoff`** — run this pre-check once the roster and commit range are known (after the fingerprint/roster report, before packaging). `missing`/`drift` STOP and route via `00-index.md` `recommended-next-*` (no partial package written); `ok`, `acknowledged`, and `not-applicable` proceed to packaging. In batch mode the lead owns the single check.
