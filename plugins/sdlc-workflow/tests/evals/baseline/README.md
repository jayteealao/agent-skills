# Eval baseline

`report.json` in this directory is the W0 baseline: one run of every case in
`../cases/` against the prose as it stood before wave W1
(WIDE-VIEW-REPAIR-PLAN §3.6). `node tests/evals/run.mjs --compare baseline`
diffs the newest run against it.

Status 2026-09-05: **not recorded.** The harness and the cases are built. The
run needs an authenticated headless `claude -p`; on the build machine that
call returned `Failed to authenticate: OAuth session expired and could not be
refreshed`. Record the baseline before the first W1 edit:

```bash
npm run evals && node tests/evals/run.mjs --write-baseline
```

Commit `report.json` with the W0 release. Never edit it by hand.
