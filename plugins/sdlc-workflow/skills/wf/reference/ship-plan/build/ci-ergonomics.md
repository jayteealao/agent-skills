# Ship-plan build — CI ergonomics (`ship-plan/build.md` Step 16)

Load this file from `build.md` Steps 3–16 when audit S is Missing or Non-compliant (or the user selected it). Step 16.

# Step 16 — Implement: CI ergonomics (Audit S)

Skip if no `ci-ergonomics` block. This step *modifies workflows produced by earlier steps* (3, 4, 8, 9, 13) — run it last among the file-generation steps, via targeted edits (no overwrite):

- `dep-cache: true` → add `cache:` to the `setup-*` action (e.g. `actions/setup-node` `cache: npm`) or an `actions/cache` step keyed on the lockfile.
- `matrix` → add `strategy.matrix` over the planned `os`/`versions` to the build/test jobs; reference `${{ matrix.* }}` in `runs-on`/setup.
- `release-concurrency: true` → add a `concurrency:` block to the release workflow (group by workflow + ref; do **not** `cancel-in-progress` for releases).
- `path-filters: true` → add `paths:`/`paths-ignore:` to PR workflow triggers where the plan scopes them.

When `repo-topology.monorepo` is true, scope matrix/path-filters per workspace and generate one dependency-automation entry per workspace (Step 12a in [governance.md](governance.md)).
