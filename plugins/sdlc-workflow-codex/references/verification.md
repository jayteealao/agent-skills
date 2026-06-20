# Verification Strategy

Verification should prove the changed behavior, not merely produce activity.

## Discover the Contract

1. Read repository guidance and package scripts.
2. Identify the nearest existing tests and the commands used in CI.
3. Translate the user's definition of done into observable checks.
4. Separate checks into:
   - static: formatting, lint, types, build, schema validation
   - behavioral: unit, integration, end-to-end, reproduction steps
   - user-visible: browser, device, CLI, API response, rendered document
   - operational: logs, metrics, migration safety, rollback behavior

## Run Proportionally

- Start with the narrowest check that can fail for the change.
- Expand to shared-module or full-suite checks when the blast radius warrants it.
- For a bug fix, reproduce before the patch when feasible and rerun the same reproduction afterward.
- For generated artifacts or UI, inspect the actual output rather than trusting source compilation alone.
- For performance changes, compare against a recorded baseline using the same environment and command.

## Handle Failures

Diagnose failures before editing. Fix failures caused by the requested change when feasible. Do not silently alter unrelated behavior just to make a check pass.

If a check cannot run, state:

- the exact command or behavior that was attempted
- the blocking condition
- the remaining risk

## Completion Evidence

Before finishing, review the diff and summarize:

- behavior changed
- checks run and results
- important limitations or residual risks
