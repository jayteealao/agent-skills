# Repo hooks (T3.5–T3.7) — the body of the `repo-hooks` mode of handoff

The `repo-hooks` mode applies when the repo root has a commitlint config (`.commitlintrc*`, `commitlint.config.{js,cjs}`), or the index has `public-surface:` or `docs-mirror:`. Run each step below whose trigger is there, in order, after T3 of [../handoff.md](../handoff.md). Record `skipped` for a step whose trigger is not there.

## T3.5 — Commitlint pass

No commitlint config → `commitlint-status: skipped`. Otherwise run `npx commitlint --from $(git merge-base HEAD origin/<base-branch>) --to HEAD`, or the equivalent of the package manager of the project.

- All pass → `pass`.
- A `BREAKING CHANGE` footer or a `!:` subject → `warn`. Record the commits in `## Reviewer Focus Areas`. Do not block.
- A violation → `commitlint-status: fail`. STOP. Print the violating commits and ask the person to amend them. Do not fix them yourself.

## T3.6 — Public-surface drift

Read `public-surface:` from the index. Absent → `public-surface-drift: skipped`. Otherwise record whether the `public-surface.files` are clean (`git diff --quiet HEAD -- <files>`), run `regen-cmd`, and check again:

- No change → `none`.
- Changed, and clean before → commit `chore(api): regenerate <kind> surface mirror` → `regenerated`.
- Changed, and dirty before → `drift-without-regen`. STOP: the regen output does not agree with the staged version. Ask the person to reconcile it with `/wf implement <slug> <slice>`.

Record the regen summary of every kind in `## Reviewer Focus Areas`.

## T3.7 — Doc-mirror regen

Read `docs-mirror:`. Absent → `docs-mirror-status: skipped`. Otherwise run `regen-cmd`. No diff under `mirror-paths` → `up-to-date`. A diff → commit `docs: regenerate doc mirrors` → `regenerated`.
