# Workflow rules
- Store artifacts under `.ai/workflows/<slug>/`. Maintain `00-index.md` as the control file. Never leave the canonical result only in chat — write the stage record first. Write a record as a draft and put it, per [_records.md](_records.md).
- Every artifact file has YAML frontmatter (between `---` markers) as the first thing in the file. One role per place: frontmatter is state; the agent-file body is the contract and the working record, under fixed `##` headings; the chat narrative is for the person, per [_chat-return.md](_chat-return.md).
- Write no explainer and no sibling `.yaml`, unless the stage reference names that file. Only the review stage and the audit intake mode name a sibling `.yaml`, because agents read those files.
- Before you write a stage artifact, read every input in the stage's `## Requires` table, per [_requires.md](_requires.md).
- A stage artifact names its next step in frontmatter: `next-command`, `next-invocation`, and `recommended-routes` (every option with a `reason`; exactly one entry has `default: true`, and its `invocation` equals `next-invocation`). A stage artifact has no `## Recommended Next Stage` section and no `recommended-next-*` key.
- Get each real `created-at` / `updated-at` timestamp per [_timestamp.md](_timestamp.md).
- If the stage cannot finish, set `status: awaiting-input` in frontmatter and list unanswered questions.
- Record product-owner decisions in `decisions.yaml` per [_decisions.md](_decisions.md), and keep the slug stable per [intake/_intake-context.md](intake/_intake-context.md).
- The schema owns the fields of `00-index.md` (`state.yaml` and `meta.yaml`), and `wf.mjs stamp index` prints them; [_control-file-ownership.md](_control-file-ownership.md) says who writes them and what moves to `index-history.jsonl`.
- Ask and record PO questions per [_gate-question.md](_gate-question.md), [_question-craft.md](_question-craft.md) and [_decisions.md](_decisions.md).
- Run a freshness pass (web search → official docs) before finalizing any stage where external knowledge matters. Record under `## Freshness Research` with source, relevance, takeaway.
- Reuse earlier workflow files. Do not silently broaden scope. Do not collapse stages unless the user asks.
- Use sub-agents for multi-domain research per [_subagents.md](_subagents.md).
- Respect the stated order only where a step consumes an earlier step's output or crosses a gate; reading and research may interleave freely.
- Before you cut a branch, run the base check: `node "<skill-dir>/scripts/wf.mjs" base check "<root>" --base <base>`. It fetches the base and fast-forwards a base that is only behind its remote. When it exits 1, the base has diverged from its remote: STOP, and ask the person to reconcile it. Do not cut the branch from it.
- **Stage each file by its path when you commit.** Other sessions leave uncommitted work in the same tree.
  1. Stage the code files that this step changed, each by its path: `git add -- <path> <path>`.
  2. Stage the workflow records under `.ai/workflows/<slug>/` by path.
  3. Any other dirty path is not yours. Fail closed: do not stage it, and ask the person.
  4. Never run `git add -A`, `git add .`, `git commit -a` or a `git add` with no path. A sweep commits the work of other sessions.
  5. Write the message as `implement/_steps.md` says: `<type>: <what the change does>`. Name no slug, no slice, no step number and no finding id.
- **Run the code of another commit only in a scratch worktree.** This applies when a step needs the code of a commit that is not checked out: the base of a slice (to see whether a test failed before the slice), a release tag, or a commit to bisect.
  1. Run `node "<skill-dir>/scripts/wf.mjs" worktree add "<root>" <slug> <name> <commit>`. Name the copy by its use, for example `base-<slice>`. The command prints the path, `.scratch/worktrees/<slug>/<name>/`.
  2. Run the check in that path. When the check needs packages, run the install inside the copy.
  3. Record the results. Then run `node "<skill-dir>/scripts/wf.mjs" worktree remove "<root>" <slug> <name>`, before the stage writes its record. The stage is not done while the copy exists.
  4. When the remove exits 1, tell the person which copy stays and why.
  - Do not make a worktree, a clone or a copy of the repo in any other folder.
  - Do not stash the working tree to reach the other commit.
  - Do not link `node_modules` or any other folder into the copy. `git worktree remove --force` deletes through a link.
  - The prototype worktree and the campaign worktrees keep their own rules.

A stage body cites this file instead of restating these rules. A stage-specific rule (an extra artifact, an idempotency invariant, an evidence layout) stays in the stage body, beneath the citation.
