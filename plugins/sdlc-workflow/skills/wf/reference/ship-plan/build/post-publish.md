# Ship-plan build — post-publish verification, rollback workflow, runbook stubs (`ship-plan/build.md` Steps 5–7)

Load this file from `build.md` Steps 3–16 when audit H, I, or J is Missing or Non-compliant (or the user selected it). Step 5, 6, or 7.

# Step 5 — Implement: post-publish verification (Audit H)

Skip if `plan.post-publish-checks[]` is empty.

Add a `post-publish` job to `plan.release-workflow-file` after the publish job. If the job already exists, append only the missing check steps to it.

```yaml
# Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>
  post-publish:
    needs: <publish-job-name>
    runs-on: ubuntu-latest
    steps:
      - name: Wait for propagation
        run: sleep <plan.propagation-window-min-minutes * 60>

<for each check in plan.post-publish-checks[]:>
      - name: Check <check.kind>
        run: |
          MAX_WAIT=$(( <plan.propagation-window-max-minutes> * 60 ))
          ELAPSED=0
          while [ "$ELAPSED" -lt "$MAX_WAIT" ]; do
            if <check.cmd — substitute $VERSION with the release tag>; then
              echo "Check passed"
              exit 0
            fi
            sleep <plan.poll-interval-seconds>
            ELAPSED=$(( ELAPSED + <plan.poll-interval-seconds> ))
          done
          echo "Check timed out after <plan.propagation-window-max-minutes> minutes"
          exit 1
```

Substitute template variables in `check.cmd`:
- `$VERSION` → `${{ github.ref_name }}` (strip leading `v` when needed with `${GITHUB_REF_NAME#v}`)
- `$PACKAGE` → package name from `version-source-of-truth[0]`
- `$IMAGE` → registry image path
- `$NAMESPACE` / `$DEPLOYMENT` → from publish-cmd or plan infra data

# Step 6 — Implement: rollback workflow (Audit I)

Skip if `plan.rollback-mechanism` ∈ {`feature-flag-off`, `git-revert`}.

> **A `workflow_dispatch` workflow cannot be dispatched from the branch that creates it.** GitHub only exposes `workflow_dispatch` for workflows registered on the **default branch**. A recovery workflow added by a PR returns `HTTP 404: workflow not found on the default branch` until that PR merges — so the escape hatch is unavailable to the very PR that builds it. This is not a bug to work around; it is a property to disclose. Whenever this step (or any step here) generates a `workflow_dispatch` workflow, **state in the plan and in the PR body that it becomes usable only after the first merge**, and name the pre-merge fallback for the failure it recovers from (a local command, a temporary record-mode commit, an admin-run job). One branch added a purpose-built golden-recovery workflow specifically to recover from golden drift, then could not dispatch it, and resolved the drift with a throwaway commit instead.

If `.github/workflows/rollback.yml` does not exist, create it:

```yaml
name: Rollback

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to roll back to (e.g. 1.2.2)'
        required: true
      reason:
        description: 'Reason for rollback'
        required: true

permissions:
  contents: write

jobs:
  rollback:
    runs-on: ubuntu-latest
    environment: <plan.ship-environments[last].name or 'production'>
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

<derive steps from plan.rollback-mechanism:>

# gh-release-yank:
      - name: Yank GitHub release
        run: |
          gh release delete "v${{ inputs.version }}" --yes --cleanup-tag
          echo "Yanked v${{ inputs.version }}"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

# redeploy-prior:
      - name: Redeploy prior version
        run: <plan.ci-pipeline.publish-cmd — substitute version with inputs.version>
        env:
<for each secret in plan.required-secrets[]:>
          <NAME>: ${{ secrets.<NAME> }}

# blue-green-switch:
      - name: Switch traffic to prior slot
        run: |
          # TODO: implement blue-green switch for version ${{ inputs.version }}
          # Derive from plan publish-cmd and infra configuration
          echo "Switch to prior slot — implement this step"

# Any mechanism: record the rollback
      - name: Record rollback
        run: |
          echo "Rolled back to ${{ inputs.version }}: ${{ inputs.reason }}" \
            >> .rollback-history.txt || true
```

# Step 7 — Implement: runbook stubs (Audit J)

For each `{ id, triggers[], steps[] }` in `plan.recovery-playbooks[]` where `docs/runbooks/<id>.md` does not exist:

First ensure `docs/runbooks/` exists: `mkdir -p docs/runbooks`.

Create `docs/runbooks/<id>.md`:

```markdown
# Runbook: <id>

## When this fires

CI logs matching any of the following patterns trigger this runbook:

<for each trigger in triggers[]:>
- `<trigger>`

## Steps

<for each step numbered 1..N in steps[]:>
<N>. <step>

## Notes

_Seeded from ship plan `recovery-playbooks[<id>]`. Update this file as the playbook evolves._
_Last synced from plan version: <plan.plan-version>_
```
