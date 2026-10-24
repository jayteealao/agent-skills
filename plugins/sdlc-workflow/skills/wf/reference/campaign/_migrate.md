# The campaign migration (sub-procedure of campaign.md)

The walk reads this file only when `<cmd> status` gives `migrate: true` or `migrate: finish`. `<cmd>` and `<root>` are as in [../campaign.md](../campaign.md).

The source folder has an old campaign ledger (`work/campaign/ledger.json`) and no list. Its units are the old form of work packets. The person types no command for the migration.

1. Run `<cmd> migrate "<root>" <source-slug> report`. It writes `work/migration.md`. It changes no branch and deletes nothing.
2. When the result has `live: true`, stop. Tell the person that an old wave run is live, and that it must stop first.
3. When `blocked` is not empty, stop. List each wave PR of `blocked` that is not merged, and tell the person to merge it first. Otherwise the review and the PR of the first work packet include the earlier waves.
4. Show the report to the person in plain words: the shipped units, the in-flight units with their branches and uncommitted files, the units that are not started, the old worktrees, and the stray folders.
5. Run `<cmd> migrate "<root>" <source-slug> apply`. It brings the records of each in-flight unit home to the main checkout. It makes each shipped unit a `done` work packet and each in-flight unit an `open` work packet, and it puts the in-flight work packets first, in their old unit order.
6. For each entry of `records` with `conflicts`, show the person both versions: the main version, and the worktree version under `work/campaign/records/conflicts/`. Ask which version to keep, and write the kept version in the main checkout.
7. Regroup the units that are not started into work packets, with the person, in this session. For a brainstorm source, follow "Regroup" in [intake/brainstorm/_work.md](intake/brainstorm/_work.md). For an ideate source, follow "Regroup" in [intake/ideate.md](intake/ideate.md). The regroup confirms the whole list with the person and runs `<cmd> write`. The person can drop any work packet, an in-flight work packet too. A dropped in-flight work packet keeps its branch unmerged, and its carried decisions go back into the regroup.
8. Run `<cmd> migrate "<root>" <source-slug> finish`. It moves the old ledger folder to `work/archive/campaign/` and each stray folder to `work/archive/stray/`. It removes each old campaign worktree that is not the worktree of an in-flight work packet, with the guarded remove.
9. Show the person each worktree of `refused`, with its reason. The person decides what to do with it. When the entry has `ignoredAtRisk: true`, show its `ignored` files. When the person says yes, run `<cmd> remove-worktree "<root>" <source-slug> <path> --allow-ignored`.

CAUTION: do not run `git worktree remove --force` on an old campaign worktree. It deletes through a `node_modules` junction into the files that the junction points to. Remove an old worktree only with `<cmd> remove-worktree "<root>" <source-slug> <path>`.
