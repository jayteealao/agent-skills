---
description: The first-run setup of a repo. The first /wf key in a repo with no .ai/ folder runs it, then runs the key.
---

# First-run setup

The dispatch prints `first-run: reference/setup.md` when the repo has no `.ai/` folder. Run these steps once, then run the key that the person typed. Keep the setup short: one question round of three questions, four when the repo has a push hook, then one more question for each of Steps 5 and 6 that applies.

## Step 1 — Read the repo

Read the manifests and the test tooling of the repo, per [intake/default/_stack-fingerprint.md](intake/default/_stack-fingerprint.md). From them, write one line about what the repo is, and estimate the commands of the four suites, per the table of [intake/default.md](intake/default.md) Step 0.6. Run no suite.

Then run `node "<skill-dir>/scripts/wf.mjs" profile hooks "<projectRoot>"`. It reads `lefthook.yml`, `.husky/`, `.pre-commit-config.yaml` and `.git/hooks/`, and prints each command of the pre-push and pre-commit hooks, with its file and the suite that runs it. For each `pre-push:` line that says `in no suite`, estimate the time of the command from what it runs: a coverage pass or an end-to-end run takes minutes or hours. Run no hook command. A command that is the same as one of your estimated suite commands is that suite already: do not add it again.

Then list the known long runs of the repo, per "The known long runs" of [_check-budget.md](_check-budget.md): the hook commands, the commands that a doc of the repo calls slow, and their estimates.

## Step 2 — Ask the person

Ask in one question round, per [_gate-question.md](_gate-question.md):

1. "This repo is <your line>. Is that right?" The answers are your line and a field for the person's own line.
2. "These commands test the repo: <fast>, <affected>, <full>, <heavy>. Are they right?" The answers are the commands and a field for corrections. Omit a suite that the repo does not have. This is the one place that asks for the suites: no stage asks again. A repo with no suite for implement gets `receipt: none (no suite in the profile)` at the end of implement.
3. The budget question, when "When to ask" of [_check-budget.md](_check-budget.md) says to ask it. Put the suite estimates and the known long runs of Step 1 in its text.
4. Only when Step 1 found a pre-push command in no suite: "The push hook runs <command> (<file>, about <estimate>). Add it to the `heavy` suite, so that the review runs it once per packet before the push?" Name each such command with its estimate. The answers are yes, no, and a field for corrections.

## Step 3 — Write the setup

1. Run `node "<skill-dir>/scripts/wf.mjs" setup "<projectRoot>" --about "<the confirmed line>"`. The command makes `.ai/workflows/` and `.ai/sdlc-config.json`, then prints the merge method of GitHub, the gaps of ship, and whether git ignores `.ai/`.
2. For each confirmed suite, run `node "<skill-dir>/scripts/wf.mjs" profile set "<projectRoot>" <suite> --command "<command>" --estimate <seconds>`. Record the budget answer with `wf.mjs profile budget`, per [_check-budget.md](_check-budget.md). When the person said yes to the push hook, the `heavy` command is the heavy command of question 2, when there is one, and each confirmed pre-push command, joined by ` && `. Its estimate is the sum of their estimates.

## Step 4 — Report the facts

Tell the person the merge method in one line. Give each `gap:` line as a task for the person, with the command that closes it. A gap does not stop the key: ship asks again before it needs the fact.

Then run `node "<skill-dir>/scripts/wf.mjs" doctor "<projectRoot>"`. Each `warn:` line names a pre-push command that no suite runs, because the person said no to it. Tell the person in one line that the push runs it, and that no stage runs it before the push.

## Step 5 — The `.ai/` folder and git

When the setup prints `.ai/ in git: tracked`, ask the person: "Add `.ai/` to .gitignore, so that the workflow records stay out of your commits?" On yes, run the setup command again with `--ignore`. On no, change nothing.

## Step 6 — The records repo

Run `node "<skill-dir>/scripts/wf.mjs" records status "<projectRoot>"`. When it prints that a clone is there, ask the person: "Keep the records of this repo in the records repo, so that the work continues on any computer?" On yes, run `node "<skill-dir>/scripts/wf.mjs" records link "<projectRoot>" <name>`, where `<name>` is the folder name of the repo in lower case. On no, change nothing.

The link prints what the person must do in the product repo:
- A `records-conflict:` line names a file whose clone copy stays and whose local copy is in `.ai/workflows/.conflicts/`. Ask about the lines per "Records lines" of [_records-repo.md](_records-repo.md).
- A `records-warning:` line names tracked record files or a missing `.gitignore` line. Show the command of the line to the person. Do not commit in the product repo yourself, because the commit lands on the branch that is checked out.
- When the link refuses because a worktree holds workflow files, show the list. Do not copy the files yourself.

Then run the key that the person typed.
