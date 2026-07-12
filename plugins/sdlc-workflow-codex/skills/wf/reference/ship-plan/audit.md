---
description: Read-only adversarial audit of the ship pipeline — questions whether `.ai/ship-plan.md`, the CI/CD it built, and the release-relevant codebase are actually SOUND, not merely present or compliant. Fans out one read-only child per audit lens (plan-soundness, release-safety, ci-correctness, secrets-and-permissions, supply-chain, rollback-realism, version-integrity), refutes each candidate finding before it lands, then merges survivors into an accumulating ledger at `.ai/ship-plan-audit.md` and routes each to its sanctioned fixer. Never edits the plan, never mutates the repo, never ships. Distinct from `build` (which trusts the plan and closes repo gaps) and from the handoff/ship readiness pre-check (which only catches mechanical drift).
argument-hint: "[<lens> | triage]"
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

> **Standing steering (steer.md).** Before Step 0, read the active workflow's `steer.md` if it exists and
> apply the contract in [_steering.md](../_steering.md): honor the user's standing instructions, never above a
> MANDATORY gate, and inject the relevant entries into every audit child prompt you dispatch.

> **Ground findings in the real source.** Before asserting that a workflow step, a published artifact, or the
> code misuses a dependency, action, or registry — a wrong signature, an action that "can't work," a security
> claim about a tool's behavior — invoke the `study-sources` skill to read its **actual installed source** (the
> action's `action.yml`, the CLI's real flags, the registry client in `node_modules`/`~/.m2`/the Go/Rust/NuGet
> caches). A finding grounded in the real implementation beats one grounded in a recalled API — the latter is
> exactly where plausible-but-wrong audit findings come from. Inject the same instruction into every lens
> child. Read-only — reads land in gitignored `.scratch/`, never in the audit ledger or the repo.

You are running `wf ship-plan audit`. Your job is **not** to fix anything. It is to **question the pipeline**:
to read `.ai/ship-plan.md`, the CI/CD that realizes it, and the release-relevant codebase, and surface every
blunder, oversight, logical hazard, misconception, and bug that would make a real release go wrong — then
route each to the command that can fix it. This is the read-only, adversarial counterpart to `build`.

# Why this command exists (the gap it fills)

Three neighbours touch the ship plan; none of them ask whether it is *correct*:

- **`ship-plan build`** treats the plan as ground truth — *"what it says is right; what is in the repo is the
  current implementation"* — and mutates the repo to comply. If the plan is wrong, `build` faithfully builds
  the wrong pipeline.
- The **handoff/ship readiness pre-check** ([_ship-plan-readiness.md](../_ship-plan-readiness.md)) only detects
  *mechanical drift*: a version file that moved, a secret referenced but unplanned. It never reasons about
  soundness.
- **`ship`** executes the plan. By then it is too late to notice the plan was incoherent.

`audit` is the missing reasoning pass. It assumes **nothing** is right — not the plan, not the workflows, not
the version wiring — and tries to break each one on paper before a release breaks it in production. Example of
what only this command catches: a plan whose `release-trigger` is `tag-on-main` but whose `version-bump-cmd`
runs *inside* the tag-triggered workflow — so every tag is cut from the pre-bump commit and ships the old
version. Valid YAML, compliant with the plan, and wrong. Drift detection is blind to it; `audit` is built for it.

# What this command does NOT do

- It does **not** edit `.ai/ship-plan.md` — that is `$wf ship-plan edit`. It reports what to change and routes there.
- It does **not** create, patch, or mutate any repo file, workflow, or remote setting — that is `$wf ship-plan build`.
- It does **not** push, open PRs, tag, or run a release.
- It does **not** re-run the deep code-correctness sweep. Its codebase lens is scoped to **release-relevant
  surface** (version integrity, packaged contents, tested-vs-shipped artifact, secrets in the tree). For a
  general correctness/security bug-hunt it points the user at `$wf review sweep pre-merge` rather than
  duplicating it.
- The only file it ever writes is its own ledger, `.ai/ship-plan-audit.md`.

> **Optional second opinion.** After the ledger is written, you may offer `$consult <second opinion on these
> ship-pipeline audit findings — are any wrong, any missed?>` (or `$consult <provider> …`) — a read-only
> multi-model panel that checks the audit itself. Model may self-run when clearly valuable (pin `codex`/`claude`);
> otherwise just offer it.

---

# Step 0 — Orient

1. **Parse `$ARGUMENTS`.** The first token, if present, is either a **lens key** (run that one lens inline
   instead of the full fan-out) or `triage` (re-surface `acknowledged` findings for a fresh decision — see
   Step 5). No token → full fan-out across all seven lenses (the default).
2. **Read `.ai/ship-plan.md`.** STOP if missing: *"No ship plan at `.ai/ship-plan.md`. There is nothing to
   audit yet — run `$wf ship-plan init` first."* Parse every block A–K (and any `additional-contracts[]`) into
   memory. Note `plan-version` and `updated-at`.
3. **Read the existing ledger** `.ai/ship-plan-audit.md` if it exists. Parse `runs[]` and `findings[]` — this
   run will merge into it, not overwrite it (Step 4). If absent, this is run 1.
4. **Index the pipeline.** Glob `.github/workflows/*.y*ml` (plus `.gitlab-ci.yml`, `Jenkinsfile`, etc. if the
   plan named a non-GitHub CI). Read each fully. Build `filename → on-triggers → jobs (+ needs) → step run-cmds
   → uses-actions → secret-refs → permissions`. This index is shared into every lens child so they reason
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
| `supply-chain` | Is what gets **published** trustworthy and correctly scoped? Provenance/attestation absent (`--provenance`, SLSA, sigstore/cosign); the packaged artifact's contents wrong — `files`/`.npmignore`/`MANIFEST.in`/`.dockerignore` leaking source or secrets, or omitting files the package needs; unpinned deps at publish time; registry target / scope mismatch; 2FA/publish-token posture. Align categories to [../review/supply-chain.md](../review/supply-chain.md). | built workflows + packaged surface |
| `rollback-realism` | Does the recovery story actually work for **this artifact class**? A `rollback-mechanism` that isn't real (you cannot `git-revert` an immutable npm publish — you deprecate and ship a patch); `recovery-playbooks[]` with aspirational rather than runnable steps; a migration with no matching rollback; no tested reversal path. | plan + runbooks + migration surface |
| `version-integrity` | Release-relevant codebase only. Is the version single-sourced, or defined in N places that can silently desync? Is `version-source-of-truth[]` complete vs reality? Is the **tested artifact the shipped artifact** (does `publish-cmd`'s build output actually exist and match what CI tested)? Any secret committed to the tree? Are build outputs gitignored so they can't ship stale? | release-relevant codebase |

# Step 2 — Dispatch the fan-out (default) or one lens

**Default (no lens token) — full parallel fan-out.** Spawn ONE read-only `explorer` child per lens (all seven),
per [_subagents.md](../_subagents.md):

- **Effort-tiered, not model-pinned** — children must not inherit an expensive parent configuration. **high**
  effort for the causal-reasoning lenses `plan-soundness`, `release-safety`, `ci-correctness`, and
  `secrets-and-permissions`; **medium** for `supply-chain`, `rollback-realism`, and `version-integrity`.
- `description: "audit-<lens>"`.
- prompt = the lens's row question expanded into its concrete checklist + the parsed plan + the workflow index
  from Step 0 + the ecosystem + the standard findings schema + the two grounding instructions below + the
  refute-before-report rule + "return findings inline as a JSON list; write no files."

**Dispatch in parallel, in waves of ≤6** per [_subagents.md](../_subagents.md): issue one message spawning the
first six children, `wait_agent` on the wave, then spawn the seventh. Sequential single-child dispatch is forbidden.

**Single-lens mode** (`$ARGUMENTS` first token is a lens key) — run just that lens, inline, over the same
evidence, and merge its findings into the ledger exactly as the fan-out does. Used to re-check one area cheaply
after a fix.

## Refute-before-report (inside every lens prompt)

Instruct each lens: for every candidate finding, **first try to refute it** — read the real workflow/file/plan
text, and (where behavior is claimed) the real dependency source via `study-sources`. Report a finding ONLY if
it survives the refutation, and attach a concrete **failure-scenario** (the inputs/state → the wrong outcome).
Default to dropping anything you cannot ground. A short list of real findings beats a long list of plausible ones.

# Step 3 — Synthesize + adversarial gate

1. **Collect** all lens findings. **Dedupe** by `(target + root cause)` — keep the most specific severity, merge
   rationales, tag with every lens that raised it.
2. **Normalize severity** to BLOCKER / HIGH / MED / LOW / NIT (map any other scale first).
3. **Second refutation on the load-bearing ones.** For each BLOCKER and HIGH, independently re-read the cited
   evidence yourself (the workflow lines, the plan block, the file) and confirm the failure-scenario is real
   before it enters the ledger as `open`. Refute-by-default: if you cannot reproduce the reasoning from the
   evidence, downgrade its confidence or drop it. This is the guard against a confident-but-wrong blocker.
4. **Assign a stable `id`** to each survivor: `<lens>:<target-slug>:<issue-slug>` (e.g.
   `release-safety:release-yml:bump-after-tag`). The id is what the ledger dedupes on across runs, so it must be
   deterministic for "the same problem."
5. **Route each finding** (Step 6 table).

# Step 4 — Merge into the accumulating ledger

The ledger `.ai/ship-plan-audit.md` **accumulates** — it is never overwritten. Reconcile this run's survivors
against the parsed prior `findings[]`:

- **Still present** (same `id`) → keep `status: open`; update `last-seen` to this run; refresh severity/evidence
  if they changed.
- **New** (id not seen before) → add with `status: open`, `surfaced-at: <this run>`.
- **Gone** (a prior `open`/`acknowledged` id that no lens raised this run) **and its target still exists** →
  mark `status: resolved`, `resolved-at: <this run>`. If the target itself is gone (file/block deleted), also
  resolve it, noting the target vanished. Never silently delete a finding — resolution is recorded, so the
  ledger tells the story of what got fixed.
- **Acknowledged** findings (Step 5) stay `acknowledged` until they either disappear (→ resolved) or the user
  re-triages them (`$wf ship-plan audit triage`).

Write the ledger with this shape (frontmatter carries the machine-readable state; the body tells the story):

```markdown
---
kind: ship-plan-audit
audited-plan-version: <plan.plan-version>
plan-updated-at: <plan.updated-at>
last-run: <N>
verdict: <sound | ship-with-caveats | unsound>
runs:
  - run: <N>
    lens-scope: <all | the single lens>
    plan-version: <v>
    verdict: <...>
    counts: { blocker: <n>, high: <n>, med: <n>, low: <n>, nit: <n> }
findings:
  - id: <lens>:<target-slug>:<issue-slug>
    lens: <lens>
    target: <plan block X | .github/workflows/release.yml:42 | package.json>
    severity: <BLOCKER|HIGH|MED|LOW|NIT>
    confidence: <high|med|low>
    status: <open | acknowledged | resolved>
    surfaced-at: <run N>
    last-seen: <run N>
    resolved-at: <run N | ->
    route: <the exact fixer command>
---

## The Audit
<Narrative — the story section, per ../_narrative-voice.md (heading `## The Audit`). Lead with the verdict and
the one finding that most threatens a real release, in the Raschka voice: relevance first, why before how, the
stakes in human terms, tradeoffs plain. Name what a release would actually get wrong, not a checklist.>

## Verdict
<sound | ship-with-caveats | unsound> — <one sentence of why, tied to the highest-severity open finding>

## Open findings
<For each open finding, grouped by severity:>
### <id> — <severity> · <lens>
- **Target:** <plan block / workflow file:line / codebase path>
- **What:** <the defect, one or two sentences>
- **Evidence:** <the concrete cite — the plan line, the YAML lines, the file>
- **Failure scenario:** <inputs/state → the wrong release outcome>
- **Route:** `<fixer command>`

## Resolved this run
<findings that were open last run and are gone now — id + what it was + resolved-at>

## Acknowledged (proceeding with known risk)
<acknowledged findings + the recorded reason>
```

The ledger is a plain markdown file (like `.ai/ship-plan.md` itself) — it takes **no sibling `.yaml` fragment**
(those belong to rich-tier artifacts under `.ai/workflows/`). It may ship a free narrative fragment only if a
bespoke visual genuinely tells the pipeline's story better than prose.

# Step 5 — Triage the blockers and highs (interactive)

Before finalizing, triage each **BLOCKER and HIGH** open finding with the user by asking directly in chat —
present each as a short numbered item (finding text + failure scenario + suggested route) and let the user choose
**accept** (leave `open`; it needs fixing), **acknowledge** (known/intentional — record a freeform reason, set
`status: acknowledged`; the ledger keeps it until it disappears), or **reject** (false positive — drop it, and if
it keeps re-surfacing, tighten the lens id so it stays dropped). MED/LOW/NIT land as `open` without a prompt.

**`triage` mode** (`$ARGUMENTS` == `triage`) skips the fan-out entirely: re-read the ledger, re-present every
`acknowledged` finding, and let the user re-decide (a plan may have changed since they waved it through). Then
re-write the ledger and emit the summary.

# Step 6 — Route every finding to its sanctioned fixer

`audit` fixes nothing itself — it hands each finding to the command that can. The `route` field and the chat
`Next:` line use this mapping:

| Finding is about… | Route to |
|---|---|
| The **plan's content** — a block is wrong, missing, self-contradictory, or a field is incoherent | `$wf ship-plan edit <block>` (name the block letter) |
| A **pipeline gap the plan implies but the repo lacks** — a missing job/step/permission/concurrency that `build` would add mechanically | `$wf ship-plan build` |
| A pipeline defect whose **root cause is the plan** (so `build` would faithfully build the wrong thing) | `$wf ship-plan edit <block>` **first**, then `$wf ship-plan build` |
| A **release-relevant codebase** issue — version desync, packaged-contents leak, committed secret, tested≠shipped | `$wf intake fix <scope>` (or direct guidance for a one-line fix) |
| **Deep code-correctness/security** beyond the release surface | `$wf review sweep pre-merge` (pointer — `audit` does not own it) |

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
- `Next:` the single highest-leverage route from Step 6 (e.g. `$wf ship-plan edit E` to fix the rollback block,
  then `$wf ship-plan build`), or `Done` if the verdict is `sound` and nothing is open.
