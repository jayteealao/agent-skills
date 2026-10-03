# Campaign: stacked wave PRs with gh-stack

This file belongs to [../campaign.md](../campaign.md). It lists every `gh stack` command the campaign runs, with the lowest gh-stack version that has it. A newer gh-stack changes this file only. The probes behind each rule are in `docs/internal/CAMPAIGN-PROBES.md` (P2, P6, P8).

The stack is on when `ledger.stack.enabled` is true. Orient turns it on when gh-stack v0.1.0 or later is installed and `campaign.stack` in `.ai/sdlc-config.json` is not `false`. Each wave branch then builds on the wave branch below it, and each wave PR targets the branch below.

CAUTION: run every `gh stack` command with its arguments. Do not run `gh stack view` without `--json`, and do not run `merge` without `--yes`. A command without its arguments opens a prompt or a full-screen view, and the campaign hangs.

CAUTION: do not use `gh stack submit`. It opens draft PRs. The campaign opens each wave PR through handoff (`gh pr create`) and links it.

## Commands

| Command | Lowest version | Use |
|---|---|---|
| `gh stack link <pr-a> <pr-b>` | 0.0.1 | Create the stack from the first two wave PRs. It needs two PRs: a one-PR stack cannot exist. |
| `gh stack link <stack-number> <pr>` | 0.0.8 | Append a wave PR to the stack. |
| `gh stack checkout <stack-number>` | 0.0.1 | Take local tracking of the stack before a rebase. |
| `gh stack rebase --upstack` | 0.0.1 | Move the upper wave branches onto a changed lower branch. Exit code 3 is a conflict. |
| `gh stack rebase --abort` | 0.0.1 | Restore every branch after a conflict. |
| `gh stack push` | 0.0.1 | Push the rebased branches. |
| `gh stack merge <pr> --yes --<method>` | 0.1.0 | Merge a wave PR and every unmerged PR below it, in one operation. |
| `gh stack sync` | 0.0.1 | After a merge: fetch, rebase the remaining branches onto the trunk, push. |
| `gh stack view --json` | 0.0.1 | Read the stack's state. |

## Link

After handoff opened the PR of wave n:

1. When n is the first stacked wave, do nothing: wave 1's PR targets the trunk, and its CI runs there.
2. When the ledger has no stack number, run `gh stack link <pr of wave n-1> <pr of wave n>`. The output names the stack ("stack #N"). Run `<cmd> stack set <N>`.
3. When the ledger has a stack number, run `gh stack link <N> <pr of wave n>`.
4. When `link` exits with code 9, the repository has no stacked PRs. Run `<cmd> stack disable`. The PRs keep their chained bases as plain PRs, and ship merges each one with `gh pr merge` after the PR below it merged.

A PR in a stack gets the CI of the stack's trunk: a workflow with `on: pull_request: branches: [main]` runs on a stacked PR whose base is a wave branch.

## Merge

Ship merges a stacked wave PR with `gh stack merge <pr> --yes --<method>`, where the method is the one the ship plan names. `gh pr merge` refuses a PR that is in a stack ("must be merged using the asynchronous merge REST API"). Wave n ships only after wave n−1 shipped, so the merge takes wave n's PR alone. After the merge, GitHub moves the next wave's PR onto the trunk. After a squash merge, `gh stack merge` also rebases the next wave branch onto the trunk and force-pushes it. The rebase drops the wave's merge commits, so the merge commits in the ledger and in the as-built notes no longer exist on that branch. Before you commit on the next wave branch, run `git fetch` and move the local branch to its remote.

## Sync

`link` creates the stack on GitHub only. `sync` needs local tracking, and without it `sync` exits with "is not part of a stack" (found in the trial). With two waves, the trial needed no `sync`: `merge` moved the next wave itself (above). With three or more waves, run `gh stack checkout <N>` once, then run `gh stack sync`; the trial did not test this path. When `sync` reports that the local stack and the stack on GitHub differ, stop and ask the person.

## A change on a lower wave (12.4)

A CI fix, a review change, or a hotfix can change a lower wave branch while a higher wave waits.

1. Do not rebase a wave while its slugs run. The running slugs keep the base they started from.
2. At the next wave boundary, run `gh stack checkout <N>`, check out the changed lower wave branch, and run `gh stack rebase --upstack`.
3. When the exit code is 3, run `gh stack rebase --abort`, then follow 12.3: a conflict that needs a behaviour change goes to the person.
4. When the rebase changed code that a merged slug's as-built note cites, run the wave verify again on the higher wave.
5. Run `gh stack push`. CI runs again on the moved PRs.
