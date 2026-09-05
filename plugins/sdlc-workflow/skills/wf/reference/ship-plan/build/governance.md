# Ship-plan build — repo governance, branch protection, environment protection, merge controls (`ship-plan/build.md` Steps 12, 14, 15)

Load this file from `build.md` Steps 3–16 when audit O, Q, or R is Missing or Non-compliant (or the user selected it). Step 12, 14, or 15. All three remote mutations are gated: Apply / Print-only / Skip.

# Step 12 — Implement: repo governance + branch protection (Audit O)

Skip if no `governance` block.

## 12a — Governance files
- `codeowners[]` non-empty and absent → create `CODEOWNERS` (`.github/CODEOWNERS`) with one line per `{ path, owners }`.
- `pr-template: true` and absent → create `.github/PULL_REQUEST_TEMPLATE.md` (summary, linked issue, testing, checklist mirroring the Block-H gates).
- `issue-templates: true` and absent → create `.github/ISSUE_TEMPLATE/bug_report.md` + `feature_request.md` + `config.yml`.
- `dependency-automation.tool` → create the config covering `ecosystems[]`:
  - `dependabot` → `.github/dependabot.yml` with one `package-ecosystem` entry per ecosystem (+ `github-actions`), `schedule.interval` from `schedule`.
  - `renovate` → `renovate.json` extending `config:recommended`, schedule from `schedule`.

## 12b — Branch protection (gated remote mutation)

Compute the desired protection from `governance.branch-protection`. Read the current state — for `mechanism: branch-protection`, `gh api repos/<owner>/<repo>/branches/<base>/protection` (404 = none); for `mechanism: ruleset`, `gh api repos/<owner>/<repo>/rulesets`.

**Mechanism mismatch guard.** If the plan's `mechanism` differs from what the repo already uses (e.g. plan says `branch-protection` but the base branch is governed by a ruleset), do NOT create a conflicting second control — surface the mismatch and ask the user to reconcile (switch the plan's `mechanism`, or migrate the repo). Two overlapping controls is worse than one.

**Stronger-than-plan guard.** If live protection already *exceeds* the plan (more required checks, higher approval count, stricter flags), report Audit O as `compliant (stronger)` and do NOT propose weakening it. Only widen toward the plan; reducing requires the user to explicitly lower the plan first.

For `mechanism: branch-protection`, build the desired payload (use `checks` — the current shape; fall back to `contexts` if targeting an older GHES):

```jsonc
// PUT repos/<owner>/<repo>/branches/<base>/protection
{
  "required_status_checks": {
    "strict": <require-up-to-date>,
    "checks": [ { "context": "<required-check>" }, ... ]    // legacy: "contexts": [<required-check>, ...]
  },
  "enforce_admins": <enforce-admins>,
  "required_pull_request_reviews": {
    "required_approving_review_count": <required-approvals>,
    "dismiss_stale_reviews": <dismiss-stale-reviews>,
    "require_code_owner_reviews": <true when governance.codeowners[] is non-empty, else require-code-owner-reviews>
  },
  "required_conversation_resolution": <require-conversation-resolution>,
  "required_linear_history": <require-linear-history>,
  "allow_force_pushes": <allow-force-pushes>,    // default false
  "allow_deletions": <allow-deletions>,          // default false
  "restrictions": null
}
```

`require_code_owner_reviews` is load-bearing: without it the `CODEOWNERS` file generated in 12a is cosmetic. Set it `true` whenever `codeowners[]` is non-empty.

For `mechanism: ruleset`, build the equivalent repository ruleset (`POST` to create / `PUT repos/<owner>/<repo>/rulesets/<id>` to update) with rules `required_status_checks`, `pull_request` (`required_approving_review_count`, `dismiss_stale_reviews_on_push`, `require_code_owner_review`), `required_linear_history`, `non_fast_forward`, and `required_conversation_resolution`, targeting `refs/heads/<base>`.

Then branch on `apply-via`:
- **`apply-via: manual`** → never call the API. Write the ready-to-run `gh api -X PUT ... --input <payload>` command into the compliance artifact and the chat return. Set `branch-protection-applied: printed`.
- **`apply-via: gh-api`** → show the current-vs-desired diff and the exact command, then ask a gate question per [_gate-question.md](../../_gate-question.md):

```yaml
question: "Apply branch protection to `<base>` on `<owner>/<repo>` now? This mutates the remote repository."
header: "Branch protection"
options:
  - { label: "Apply via gh api (Recommended)", description: "Run the PUT now. Requires repo admin; needs `gh auth` with admin scope." }
  - { label: "Print command only",             description: "Write the gh api command to the compliance artifact; don't mutate the remote." }
  - { label: "Skip",                            description: "Leave branch protection unchanged." }
multiSelect: false
```

  - "Apply" → run the `gh api -X PUT` call. On success set `branch-protection-applied: yes`; on failure (e.g. 403 — not admin) print the error + the manual command and set `branch-protection-applied: failed`.
  - "Print command only" → set `branch-protection-applied: printed`.
  - "Skip" → set `branch-protection-applied: skipped`.

Never apply silently and never without showing the payload first.

# Step 14 — Implement: environment protection (Audit Q — gated remote mutation)

Skip envs without a `protection` block. For each, compute the desired rules and read live state via `gh api repos/<owner>/<repo>/environments/<name>`. Apply through the **same Apply / Print-only / Skip gate as Step 12b**, keyed off the environment's `apply-via` (inherit `governance.branch-protection.apply-via` when unset):

```
gh api -X PUT repos/<owner>/<repo>/environments/<name> \
  -F wait_timer=<wait-timer-minutes> \
  -F 'reviewers[][type]=Team' -F 'reviewers[][id]=<team-id>' ... \
  -F 'deployment_branch_policy[protected_branches]=<bool>' -F 'deployment_branch_policy[custom_branch_policies]=<bool>'
```

Record `environment-protection-applied: <yes | printed | skipped | failed | n/a>`. Same rules: show diff + payload first, never silent, print-only writes commands to the compliance artifact.

# Step 15 — Implement: merge controls (Audit R — gated remote mutation)

Skip if no `merge` block. Compute desired repo merge settings; read live via `gh api repos/<owner>/<repo>`. Apply through the Step-12b gate:

```
gh api -X PATCH repos/<owner>/<repo> \
  -F allow_squash_merge=<bool> -F allow_merge_commit=<bool> -F allow_rebase_merge=<bool> -F allow_auto_merge=<bool>
```

For `merge-queue: true`, configure the merge queue on the base branch (via ruleset/branch settings); **detect tier support first** — if the repo's plan tier doesn't offer merge queue, record a `warn` and skip rather than fail. Record `merge-settings-applied: <yes | printed | skipped | failed | n/a>`.
