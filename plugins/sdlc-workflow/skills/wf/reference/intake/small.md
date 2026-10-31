---
description: The small path of intake. After the substance questions, the person chose it. Implement and verify run now, in this run. The change is one normal commit on the branch that is checked out, and the workflow keeps one note, `01-small.md`. Review and ship run only when the person wants a PR.
argument-hint: "(loaded by intake/default.md after the path question) | <slug> (resume)"
---

# External Output Boundary
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output this operation produces. A commit message describes the product change only: no slug, stage or `/wf` term.

You are running the **small path** of `/wf intake`. The person chose it in the path question of [intake/default/_questions.md](default/_questions.md). No size check chooses it. The small path skips shape, design, slice and plan. It runs implement and verify in this run, makes one commit on the branch that is checked out, and keeps one note.

## Card

- Change only what the acceptance checks need. Do not refactor.
- Commit on the branch that is checked out, as one normal commit. Do not create a branch. Do not push.
- Run the `fast` and `affected` suites of the test profile. Re-observe each acceptance check.
- Keep one note, `01-small.md`. Write no other stage record.
- Ask whether the person wants a PR. Review and ship run only on a yes.

## Requires

Read every row before you write the note. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | on-resume | |
| `01-small.md` | artifact | on-resume | |
| `decisions.yaml` | artifact | if-present | |
| `intake/_intake-context.md` | procedure | always | |
| `01-small.md` | writes | | |

# Step 1 — The index and the note

Do this step once, right after the path question. On a resume, start at the first step whose part of the note is empty.

1. Run `git rev-parse --abbrev-ref HEAD`. The output is the branch that is checked out.
2. Write the draft `.ai/workflows/<slug>/.draft/00-index.md` from the index template of [intake/default/_artifact.md](default/_artifact.md), with these values:
   - `workflow-type: small`, `appetite: small`, `branch-strategy: shared`, `branch: <the checked-out branch>`;
   - `current-stage: implement`, `stage-number: 5`, `selected-slice: <slug>`;
   - `progress`: `intake: complete`, `design: skipped`, `slice: skipped`, `plan: skipped`, `implement: in-progress`, `verify: not-started`, `review: skipped`, `ship: skipped`, `retro: skipped`;
   - `design-skip-reason: "small path"`;
   - `next-invocation: "/wf intake <slug>"`.
3. Write the draft `.ai/workflows/<slug>/.draft/01-small.md` (`type: intake`, `small-path: true`, `stage-number: 1`, `status: in-progress`, `commit-sha: []`, `pr-wanted: null`), with these sections:
   - `## Request`: the restated request, in one paragraph.
   - `## Acceptance Checks`: one line per check. Each line names how the result is observed.
   - `## Change`, `## Checks Run`, `## Result`: empty for now.
4. Run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`. Each draft must print `put`.

# Step 2 — Implement

1. Make the change that the acceptance checks need. Add or change a test for each check that code can test.
2. Run the `fast` suite and the `affected` suite: `node "<skill-dir>/scripts/wf.mjs" profile show "<root>"` names their commands. Run each one with `node "<skill-dir>/scripts/wf.mjs" profile run "<root>" <suite>`: it runs the command and records its time. Each suite must pass before the commit.
3. Stage each changed file by its path, then commit, per the commit rule of [../_workflow-rules.md](../_workflow-rules.md).
4. The commit message describes the product change. Read the SHA with `git rev-parse HEAD`.
5. Get the note, fill `## Change` (the files and one line each) and `commit-sha: [<sha>]`, write the draft and put it. Then run `record set "<root>" <slug> index progress.implement=complete progress.verify=in-progress current-stage=verify stage-number=6`.

When a suite fails and the cause is not in the change, STOP. Record the failure in `## Checks Run`, and set `status: awaiting-input` on the note. Do not commit a change that fails its own checks.

When the change turns out to need more than one commit, a design, or a plan, STOP and tell the person in one line: *"This is larger than the small path. Run `/wf intake <slug>` again and take the full path, or say how to cut it down."* The full path keeps the note and adds the brief.

# Step 3 — Verify

1. Re-observe each acceptance check: run the command, read the output or the file back. A check that only the agent's claim supports does not pass.
2. Fill `## Checks Run` (each command and its result) and `## Result` (`pass`, or `partial` with the checks that did not pass). Set `result` in the frontmatter to the same value.
3. Write the draft of the note and put it. Run `record set "<root>" <slug> index progress.verify=complete`.

# Step 4 — The PR question

Ask one gate question per [_gate-question.md](../_gate-question.md):

> The change is commit `<short sha>` on `<branch>`. Do you want a PR for it?
> - **No — keep the commit (Recommended):** the workflow closes now.
> - **Yes — open a PR:** review runs next, then ship.

Record the answer with `decide add --stage intake --key pr-wanted` per [_decisions.md](../_decisions.md). Then set `pr-wanted` in the note with `record set "<root>" <slug> 01-small.md pr-wanted=<true|false> status=complete`.

- **No:** run `record set "<root>" <slug> index status=closed close-reason=completed closed-at=<now> "next-invocation=Done"`. The workflow is closed.
- **Yes:** run `record set "<root>" <slug> index progress.review=not-started progress.ship=not-started current-stage=review stage-number=7 "next-invocation=/wf review <slug>"`. Review and ship treat the workflow as one slice named `<slug>`, and `01-small.md` is its plan, implement and verify record. When the commit is on the base branch, the PR phase of ship moves it to a new branch first ([handoff.md](../handoff.md) Step 0, item 3b).

# Step 5 — Return

Return per [_chat-return.md](../_chat-return.md): lead with the narrative, then:

```
wf intake complete: <slug> (small path)
Change: <short sha> on <branch>, <N> files
Checks: <passed>/<total> acceptance checks, fast and affected suites <pass|fail>
Artifacts: .ai/workflows/<slug>/01-small.md
Next: Done | /wf review <slug>
```

# Resume

`/wf intake <slug>` or `/wf <slug>` on a workflow with `workflow-type: small` loads this file. Read the note with `record get "<root>" <slug> 01-small.md`. Start at the first step whose part is empty: no `commit-sha` → Step 2, no `## Result` → Step 3, `pr-wanted: null` → Step 4.
