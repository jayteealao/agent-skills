# Campaign local records

This file belongs to [../campaign.md](../campaign.md). `<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug.

A repo that does not track `.ai/` keeps the records in the main checkout. Orient records `records: local` in the ledger. Branches carry only code, so no wave PR carries a workflow file.

- `<cmd> worktree <key|wave-<n>> add` copies the main `.ai/` tree into the worktree. The campaign folder stays in the main checkout, because the wave driver's agents read it there by absolute path. The evidence folders (`*-evidence/`) and the design boards (`design/`) of a workflow that the worktree does not drive also stay in the main checkout. A unit reads the frozen boards of its own slug and writes only `design/captures/`; `sync` brings the captures back. A tracked `.ai/` file (for example `ship-plan.md`) keeps its committed version in the worktree, and the result names it in `records.tracked`. An uncommitted main edit to that file does not reach the unit, so that no worktree commit can publish it. The worktree gets its own `.ai/.gitignore` with `*`, so no `git add` in the worktree can stage a record. The main `.gitignore` can be untracked, and then a worktree does not have it. When git can still see a copied record, `add`, `refresh` and `wave <n> launch` return `ok: false` with `visibleToGit`: do not run, hand off or ship in that worktree, and ask the person.
- `refresh` copies the main changes in. A file that the worktree changed or deleted stays as the worktree has it.
- `sync` copies every file that the worktree created or changed back to the main checkout. It never deletes a file in the main checkout, and it never overwrites a main change. With local records, the slice write-back of the wave driver runs this sync at the end of each slice.
- Do not revert a record file in a worktree before `sync`. The sync can read the reverted file as a worktree change and copy the old version over the main file.
- The project design record (`.ai/design/`) belongs to the main checkout, as the campaign folder does. `sync` never copies it out of a worktree. Write `.ai/design/*` in the main checkout only, also in a retro that runs under the campaign.
- `remove` runs `sync` first. The worktree stays when a file exists only in the worktree (`pending`), or when git would delete an ignored file outside `.ai/` that is not in `campaign.isolation.build-dirs` or `node_modules` (`ignored`).

The sync compares content hashes with the base, the version that both sides last agreed on. The base of each file is in `work/campaign/records/<key>.json`. Each copy goes to a temp file, the hash is checked, and a rename puts it in place. Watch cursors (`.watch-state.json`) and render caches (`_view/`) never travel.

When both sides changed a file, the main version stays, and `sync` keeps the worktree version in `work/campaign/records/conflicts/<key>/<time>/`. The result lists it under `conflicts`. For `.ai/workflows/INDEX.md`, the sync also merges the rows into the main copy, and the newer row of each slug wins. For every other conflict, show the person both versions and ask which version to keep. A file that the worktree deleted stays in the main checkout, and the result lists it under `deletedInWorktree`.

With local records, handoff and ship run in the wave worktree ([_ship.md](_ship.md), "Handoff and ship per wave").

WARNING: local records keep the brainstorm and the packets out of git, but not out of the wave PRs. Handoff writes each PR description from the slug's records, and a pushed PR is public in a public repo. Before handoff pushes a wave, read its PR text for private details.
