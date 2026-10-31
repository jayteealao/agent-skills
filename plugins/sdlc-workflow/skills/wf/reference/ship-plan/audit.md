---
description: Read-only adversarial audit of the ship pipeline — questions whether `.ai/ship-plan.md`, the CI/CD it built, and the release-relevant codebase are actually SOUND, not merely present or compliant. Fans out one sub-agent per audit lens (plan-soundness, release-safety, ci-correctness, secrets-and-permissions, supply-chain, rollback-realism, version-integrity), refutes each candidate finding before it lands, then merges survivors into an accumulating ledger at `.ai/ship-plan-audit.md` and routes each to its sanctioned fixer. Never edits the plan, never mutates the repo, never ships. Distinct from `build` (which trusts the plan and closes repo gaps) and from the ship readiness pre-check (which only catches mechanical drift).
argument-hint: "[<lens> | triage]"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Ground findings in the real source.** Before asserting that a workflow step, a published artifact, or the
> code misuses a dependency, action, or registry — a wrong signature, an action that "can't work," a security
> claim about a tool's behavior — invoke the `study-sources` skill to read its **actual installed source** (the
> action's `action.yml`, the CLI's real flags, the registry client in `node_modules`/`~/.m2`/the Go/Rust/NuGet
> caches). A finding grounded in the real implementation beats one grounded in a recalled API — the latter is
> exactly where plausible-but-wrong audit findings come from. Inject the same instruction into every lens
> sub-agent. Read-only — reads land in gitignored `.scratch/`, never in the audit ledger or the repo.

You are running `wf project ship-plan audit`. Your job is **not** to fix anything. It is to **question the pipeline**:
to read `.ai/ship-plan.md`, the CI/CD that realizes it, and the release-relevant codebase, and surface every
blunder, oversight, logical hazard, misconception, and bug that would make a real release go wrong — then
route each to the command that can fix it. This is the read-only, adversarial counterpart to `build`.

# Why this command exists (the gap it fills)

Three neighbours touch the ship plan; none of them ask whether it is *correct*:

- **`ship-plan build`** treats the plan as ground truth — *"what it says is right; what is in the repo is the
  current implementation"* — and mutates the repo to comply. If the plan is wrong, `build` faithfully builds
  the wrong pipeline.
- The **ship readiness pre-check** ([_ship-plan-readiness.md](../_ship-plan-readiness.md)) only detects
  *mechanical drift*: a version file that moved, a secret referenced but unplanned. It never reasons about
  soundness.
- **`ship`** executes the plan. By then it is too late to notice the plan was incoherent.

`audit` is the missing reasoning pass. It assumes **nothing** is right — not the plan, not the workflows, not
the version wiring — and tries to break each one on paper before a release breaks it in production. Example of
what only this command catches: a plan whose `release-trigger` is `tag-on-main` but whose `version-bump-cmd`
runs *inside* the tag-triggered workflow — so every tag is cut from the pre-bump commit and ships the old
version. Valid YAML, compliant with the plan, and wrong. Drift detection is blind to it; `audit` is built for it.

# What this command does NOT do

- It does **not** edit `.ai/ship-plan.md` — that is `/wf project ship-plan edit`. It reports what to change and routes there.
- It does **not** create, patch, or mutate any repo file, workflow, or remote setting — that is `/wf project ship-plan build`.
- It does **not** push, open PRs, tag, or run a release.
- It does **not** re-run the deep code-correctness sweep. Its codebase lens is scoped to **release-relevant
  surface** (version integrity, packaged contents, tested-vs-shipped artifact, secrets in the tree). For a
  general correctness/security bug-hunt it points the user at `/wf review sweep pre-merge` rather than
  duplicating it.
- The only file it ever writes is its own ledger, `.ai/ship-plan-audit.md`.

---

# Step 0 — Orient

1. **Parse `$ARGUMENTS`.** The first token, if present, is either a **lens key** (run that one lens inline
   instead of the full fan-out) or `triage` (re-surface `acknowledged` findings for a fresh decision — see
   Step 5). No token → full fan-out across all seven lenses (the default).
2. **Read `.ai/ship-plan.md`.** STOP if missing: *"No ship plan at `.ai/ship-plan.md`. There is nothing to
   audit yet — run `/wf project ship-plan init` first."* Parse every block A–K (and any `additional-contracts[]`) into
   memory. Note `plan-version` and `updated-at`.
3. **Read the existing ledger** `.ai/ship-plan-audit.md` if it exists. Parse `runs[]` and `findings[]` — this
   run will merge into it, not overwrite it (Step 4). If absent, this is run 1.
4. **Index the pipeline.** Enumerate `.github/workflows/*.y*ml` (plus `.gitlab-ci.yml`, `Jenkinsfile`, etc. if the
   plan named a non-GitHub CI). Read each fully. Build `filename → on-triggers → jobs (+ needs) → step run-cmds
   → uses-actions → secret-refs → permissions`. This index is shared into every lens sub-agent so they reason
   about the same evidence.
5. **Detect the ecosystem** from `plan.version-source-of-truth[]` + `publish-cmd` (npm / PyPI / JVM / Rust /
   container / k8s / unknown) — the lenses tailor their checks to it (e.g. `--provenance` matters for npm,
   image signing for containers, `maven-publish` + signing for JVM).

---

# Step 1 — The audit lenses

Each lens is one adversarial reviewer. Every lens reasons across all three targets — **the plan, the built
pipeline, and the release-relevant codebase** — through one point of view. Findings use the standard schema:
`{ severity: BLOCKER|HIGH|MED|LOW|NIT, confidence: high|med|low, target, summary, evidence, failure-scenario, route }`.

| Lens key | The question it asks | Primary target |
|---|---|---|
| `plan-soundness` | Is `.ai/ship-plan.md` internally coherent and complete? Self-contradictions, blocks that reference each other incoherently, a `version-scheme` that fights `version-bump-rule`, missing required-core fields, a `publish-cmd` that cannot produce what `post-publish-checks` verify, `recovery-playbooks[]` that name runbooks that don't exist, semantics a careful human would misread. | plan |
| `release-safety` | Is the outbound release, read as a **sequence**, correct and safe to run *and re-run*? Ordering hazards (bump vs tag vs publish), idempotency (does a re-run double-publish?), a missing `concurrency:` group (two releases racing), irreversible steps before their gate (publish before smoke test), tag/version/artifact coherence, dry-run coverage. | plan semantics + release workflow |
| `ci-correctness` | Are the actual workflow files correct **as code**? `on:` triggers that don't match `release-trigger`; `needs:` wiring that lets publish run before tests pass; missing or over-broad `permissions:` (`write-all`); `pull_request_target` that checks out and runs untrusted PR code (script injection); actions pinned to a mutable tag rather than a SHA (advisory); missing `if:` guards; a secret used in a job with no access to it. | built workflows |
| `secrets-and-permissions` | Is the auth surface sound and least-privilege? Secrets referenced but never provided (or planned but referenced nowhere); a `GITHUB_TOKEN` broader than the job needs; long-lived tokens where OIDC would do; a secret that could be echoed into logs or handed to an untrusted step; branch/environment protection that doesn't actually enforce what the plan claims. | built workflows + plan |
| `supply-chain` | Is what gets **published** trustworthy and correctly scoped? Provenance/attestation absent (`--provenance`, SLSA, sigstore/cosign); the packaged artifact's contents wrong — `files`/`.npmignore`/`MANIFEST.in`/`.dockerignore` leaking source or secrets, or omitting files the package needs; unpinned deps at publish time; registry target / scope mismatch; 2FA/publish-token posture. Align categories to the `supply-chain` section of [../review/security.md](../review/security.md). | built workflows + packaged surface |
| `rollback-realism` | Does the recovery story actually work for **this artifact class**? A `rollback-mechanism` that isn't real (you cannot `git-revert` an immutable npm publish — you deprecate and ship a patch); `recovery-playbooks[]` with aspirational rather than runnable steps; a migration with no matching rollback; no tested reversal path. | plan + runbooks + migration surface |
| `version-integrity` | Release-relevant codebase only. Is the version single-sourced, or defined in N places that can silently desync? Is `version-source-of-truth[]` complete vs reality? Is the **tested artifact the shipped artifact** (does `publish-cmd`'s build output actually exist and match what CI tested)? Any secret committed to the tree? Are build outputs gitignored so they can't ship stale? | release-relevant codebase |

# Step 2 — Dispatch the fan-out (default) or one lens

**Default (no lens token) — full parallel fan-out.** Dispatch ONE read-only sub-agent per lens (all seven), per [_subagents.md](../_subagents.md):

- **Effort tier, set explicitly** — children must not inherit an expensive parent configuration; [_subagents.md](../_subagents.md) maps each tier to the host's model pin. **high**
  effort for the causal-reasoning lenses `plan-soundness`, `release-safety`, `ci-correctness`, and
  `secrets-and-permissions`; **low** for `supply-chain`, `rollback-realism`, and `version-integrity`.
- `description: "audit-<lens>"`.
- prompt = the lens's row question expanded into its concrete checklist + the parsed plan + the workflow index
  from Step 0 + the ecosystem + the standard findings schema + the two grounding instructions below + the
  refute-before-report rule + "return findings inline as a JSON list; write no files."

**Dispatch in parallel, in waves of at most 6** per [_subagents.md](../_subagents.md): one wave of six, collect it,
then the seventh. Sequential single-child dispatch is forbidden.

**Single-lens mode** (`$ARGUMENTS` first token is a lens key) — run just that lens, inline, over the same
evidence, and merge its findings into the ledger exactly as the fan-out does. Used to re-check one area cheaply
after a fix.

## Refute-before-report (inside every lens prompt)

Instruct each lens: for every candidate finding, **first try to refute it** — read the real workflow/file/plan
text, and (where behavior is claimed) the real dependency source via `study-sources`. Report a finding ONLY if
it survives the refutation, and attach a concrete **failure-scenario** (the inputs/state → the wrong outcome).
Default to dropping anything you cannot ground. A short list of real findings beats a long list of plausible ones.

# Steps 3 to 5 — Synthesize, merge into the ledger, triage

Apply Steps 3 to 5 of [_audit-ledger.md](../_audit-ledger.md) with `<ledger>` = `.ai/ship-plan-audit.md`, `<plan>` = `.ai/ship-plan.md`, `<audit>` = `/wf project ship-plan audit` and `<harm>` = a release. These steps refute each BLOCKER and HIGH a second time, merge the survivors into the accumulating ledger, and record each triage decision, `accept` included.

- An id example: `release-safety:release-yml:bump-after-tag`.
- A `target` example: `plan block X`, `.github/workflows/release.yml:42`, `package.json`.

# Step 6 — Route every finding to its sanctioned fixer

`audit` fixes nothing itself — it hands each finding to the command that can. The `route` field and the chat
`Next:` line use this mapping:

| Finding is about… | Route to |
|---|---|
| The **plan's content** — a block is wrong, missing, self-contradictory, or a field is incoherent | `/wf project ship-plan edit <block>` (name the block letter) |
| A **pipeline gap the plan implies but the repo lacks** — a missing job/step/permission/concurrency that `build` would add mechanically | `/wf project ship-plan build` |
| A pipeline defect whose **root cause is the plan** (so `build` would faithfully build the wrong thing) | `/wf project ship-plan edit <block>` **first**, then `/wf project ship-plan build` |
| A **release-relevant codebase** issue — version desync, packaged-contents leak, committed secret, tested≠shipped | `/wf intake fix <scope>` (or direct guidance for a one-line fix) |
| **Deep code-correctness/security** beyond the release surface | `/wf review sweep pre-merge` (pointer — `audit` does not own it) |

Derive the **verdict** from the open findings: `unsound` if any open BLOCKER · `ship-with-caveats` if open HIGH
but no BLOCKER · `sound` if neither (LOW/MED/NIT only, or clean).

# Step 7 — Chat return

Return per [_chat-return.md](../_chat-return.md) — narrative lead in the audit voice (the verdict and the finding
that most threatens a release), then this receipt:

- `wrote: .ai/ship-plan-audit.md`
- `plan-version: <v>` · `run: <N>` · `lens-scope: <all | lens>`
- `verdict: <sound | ship-with-caveats | unsound>`
- `findings (open): BLOCKER <n> | HIGH <n> | MED <n> | LOW <n> | NIT <n>`
- `resolved-this-run: <n>` · `acknowledged: <n>`
- `Next:` the single highest-leverage route from Step 6 (e.g. `/wf project ship-plan edit E` to fix the rollback block,
  then `/wf project ship-plan build`), or `Done` if the verdict is `sound` and nothing is open.
