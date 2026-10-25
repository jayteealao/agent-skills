---
description: The first-run setup of a repo. The first /wf key in a repo with no .ai/ folder runs it, then runs the key.
---

# First-run setup

The dispatch prints `first-run: reference/setup.md` when the repo has no `.ai/` folder. Run these steps once, then run the key that the person typed. Keep the setup short: two questions at most, then one more when git does not ignore `.ai/`.

## Step 1 — Read the repo

Read the manifests and the test tooling of the repo, per [intake/default/_stack-fingerprint.md](intake/default/_stack-fingerprint.md). From them, write one line about what the repo is, and estimate the commands of the four suites, per the table of [intake/default.md](intake/default.md) Step 0.6. Run no suite.

## Step 2 — Ask the person

Ask in one question round, per [_gate-question.md](_gate-question.md):

1. "This repo is <your line>. Is that right?" The answers are your line and a field for the person's own line.
2. "These commands test the repo: <fast>, <affected>, <full>, <heavy>. Are they right?" The answers are the commands and a field for corrections. Omit a suite that the repo does not have.

## Step 3 — Write the setup

1. Run `node "<skill-dir>/scripts/wf.mjs" setup "<projectRoot>" --about "<the confirmed line>"`. The command makes `.ai/workflows/` and `.ai/sdlc-config.json`, then prints the merge method of GitHub, the gaps of ship, and whether git ignores `.ai/`.
2. For each confirmed suite, run `node "<skill-dir>/scripts/wf.mjs" profile set "<projectRoot>" <suite> --command "<command>" --estimate <seconds>`.

## Step 4 — Report the facts

Tell the person the merge method in one line. Give each `gap:` line as a task for the person, with the command that closes it. A gap does not stop the key: ship asks again before it needs the fact.

## Step 5 — The `.ai/` folder and git

When the setup prints `.ai/ in git: tracked`, ask the person: "Add `.ai/` to .gitignore, so that the workflow records stay out of your commits?" On yes, run the setup command again with `--ignore`. On no, change nothing.

Then run the key that the person typed.
