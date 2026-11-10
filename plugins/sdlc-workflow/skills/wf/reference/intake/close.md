You are running `/wf intake <slug> close`, the **lifecycle-termination utility** of the SDLC lifecycle. It has two scopes, and the second token decides which by whether it names a slice:
- **Workflow close:** `/wf intake <slug> close [reason]` archives the whole workflow.
- **Slice close/skip:** `/wf intake <slug> close <slice>` ends one slice, so that the later prerequisites are satisfied.

# Pipeline
1·intake → 2·design → 3·slice → 4·plan → 5·implement → 6·verify → 7·review → 8·ship → 9·retro

## Requires

Read every row before you write the stage artifact. [_requires.md](../_requires.md) defines the check.

| Input | Kind | When | Sections |
|---|---|---|---|
| `00-index.md` | artifact | always | |
| `decisions.yaml` | artifact | if-present | |
| `03-slice.md` | artifact | mode:slice | |
| `03-slice-<slice>.md` | artifact | mode:slice | |
| `intake/close/_slice.md` | procedure | mode:slice | |
| `99-close.md` | writes | | |
| `skip-slice-<slice>.md` | writes | | |

# Scope discipline
- Do not delete any workflow file. Do not run any stage. Do not edit application code.
- Branch cleanup is optional, and needs the person's explicit confirmation. Never delete a branch silently.
- Do not close a PR yourself. Give the person the PR URL, and tell them to close it by hand.
- Keep the stated order only where a step uses the output of an earlier step or crosses a gate. Reading and research may interleave freely.

# Step 0 — Resolve scope

1. **Read the slug and the rest.** Branch 0 of `intake.md` took the **slug** and the word `close`. The optional first token of the rest is a **slice-slug** or a **close reason**.
2. **Validate the slug.** When the index of `<slug>` does not exist (`node "<skill-dir>/scripts/wf.mjs" record get "<root>" <slug> index` exits 1, per [_records.md](../_records.md)), stop: "No workflow `<slug>` found." A `prototype` row of `INDEX.md` is the exception: its folder is in its POC worktree, which `prototype.mjs status` names. Run `node "<skill-dir>/scripts/prototype.mjs" exit "<root>" <slug> close` first, then close the workflow in that worktree.
3. **Resolve that token.** The resolution mirrors `/wf status recap`. The slice match is checked first, so that a slice named like a reason still resolves to the slice:
   - **An exact slice match:** the `03-slice-<token>.md` record exists (`record get` exits 0), or `<token>` is a `slug` in the roster of `03-slice.md`. This is a **slice close/skip**: load [close/_slice.md](close/_slice.md), and follow it.
   - **A close reason:** `<token>` ∈ `{cancelled, superseded, deferred, completed-externally, merged-into}`, and no slice matched. This is a **workflow close** with that reason.
   - **Nothing, or neither:** a **workflow close**. Step W1 collects the reason.

---

# Workflow close (`/wf intake <slug> close [reason]`)

The workflow close marks the workflow closed at whatever stage it reached. It writes `99-close.md` (the closure record), and updates `00-index.md` (`status: closed`, `close-reason`, `closed-at`). It does not delete artifacts: the files stay for audit or revival.

## Close reasons

| Reason | When to use |
|--------|-------------|
| `cancelled` | Work is no longer wanted. Decision to not build / not fix. |
| `superseded` | Another approach, PR, or workflow replaced this one. |
| `deferred` | Work is valid but not now. May be reopened later. |
| `completed-externally` | The change was made outside this workflow (hotfix, manual edit, another PR). |
| `merged-into` | This workflow's scope was absorbed into a larger workflow or PR. |
| `merged` | The workflow's branch merged, and the person agreed to close it when the next `/wf` call asked. `wf.mjs close` writes the close record. |

## Step W0 — Orient
- Parse the index (`record get "<root>" <slug> index`): `title`, `slug`, `status`, `current-stage`, `stage-number`, `progress`, `branch-strategy`, `branch`, `base-branch`, `pr-url`, `pr-number`, `open-questions`, `workflow-type`.
- When it is already `status: closed`, warn: "Workflow `<slug>` is already closed (closed-at: `<closed-at>`). Running again overwrites the close record. Proceed? (yes to continue)"

## Step W1 — Collect reason and note
When no reason was given, ask for one, with the five options above. For `superseded` or `merged-into`, also ask "What superseded/absorbed it? (PR URL, workflow slug, or description)". Do not write until you have a reason.

## Step W2 — Branch and PR state check
- Run `git branch --show-current`. When `branch-strategy: dedicated` and `branch` is not empty, note whether the branch still exists (`git branch --list <branch>`), and whether it has unmerged commits (`git log <base-branch>..<branch> --oneline`).
- When `pr-url` is not empty, note the URL: the person closes it by hand.

These checks inform. Report them, and act on none of them yourself.

## Step W3 — Write `99-close.md`

Write the draft `<wf-dir>/.draft/99-close.md`, then run `node "<skill-dir>/scripts/wf.mjs" record put "<root>" <slug>`.

```yaml
---
schema: sdlc/v1
type: close-record
slug: <slug>
workflow-type: <from 00-index.md>
close-reason: <cancelled|superseded|deferred|completed-externally|merged-into>
superseded-by: <PR URL, slug, or description if superseded/merged-into, else "n/a">
last-stage-reached: <current-stage>
stages-completed: [<from progress>]
stages-incomplete: [<remaining stages never reached>]
had-open-branch: <true|false>
branch: <branch or "none">
had-open-pr: <true|false>
pr-url: <url or "none">
unmerged-commits: <N or 0>
closed-at: <real UTC timestamp per _timestamp.md>
next-command: none
next-invocation: "none — workflow closed"
recommended-routes: [{invocation: "/wf status <slug>", reason: "the revival route when deferred or superseded", default: true}]
---
```

The body sections, as fixed `##` headings:
- `## Work Completed`: one bullet per completed or skipped stage.
- `## Work Not Completed`: the last known state of each incomplete stage.
- `## Reason & Context`: expanded. Name what superseded or absorbed it, and the revival triggers when it is deferred.
- `## Branch & PR Status`: a table of resource, state and action.
- `## Revival Instructions`: only for `deferred` or `superseded`: *"To resume, run `wf.mjs record set "<root>" <slug> index status=active close-reason=null closed-at=null` and run `/wf status <slug>` for the next command, or `/wf intake <slug> <scope>` to extend; all prior artifacts are intact at `<wf-dir>/`"*. Otherwise "Not applicable — closed permanently".

## Step W4 — Update `00-index.md`
Run one `record set "<root>" <slug> index` call: `status=closed`, `close-reason=<reason>`, `superseded-by=<value>`, `closed-at=<timestamp>`, `next-command=none`, `next-invocation=none`, and `"workflow-files=[<current entries>, 99-close.md]"`. `updated-at` moves by itself. Do not change `current-stage`: it shows the last stage reached.

Then run `node "<skill-dir>/scripts/wf.mjs" design rounds drop "<root>" <slug>`. The command deletes the design drafts of the workflow. The approved versions stay.

## Step W5 — Hand off
Lead with the narrative per [_chat-return.md](../_chat-return.md) (section *The narrative*). Then a compact receipt: the reason, the last stage, the stages completed, the path of `99-close.md`, and "artifacts preserved". Then a checklist of the actions left for the person:
- close the PR at `<pr-url>` (when it is open);
- delete the branch with `git branch -d <branch>` (when it is not needed);
- cherry-pick the `<N>` unmerged commits (when there are any).

For `deferred`: *"To resume: `/wf status <slug>` or `/wf intake <slug> <scope>`."* For `completed-externally`: *"Work was completed outside the workflow. No further action."*

---

# Slice close / skip (`/wf intake <slug> close <slice>`)

Follow [close/_slice.md](close/_slice.md), Steps S0 to S5. Step 0 loads it when the token names a slice.

---

# What this command is NOT

- **Not a delete and not automatic.** `close` archives in place: all artifacts stay under `<wf-dir>/`. It closes no PR, deletes no branch and notifies nobody; it surfaces those as a checklist.
- **Not a stage-skip.** A slice is the unit of skippable work: run the stage or close the slice.
