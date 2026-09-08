# Release discipline

**A release is not done when the version bumps. It is done when `origin/master` carries it.**

The marketplace resolves this plugin by a pinned commit SHA
(`installed_plugins.json` → `gitCommitSha`) sourced from the GitHub remote. A
release committed locally and never pushed is invisible to every project that
installs the plugin — while looking entirely healthy in the dev tree. The
version bumped. The tests pass. The CHANGELOG reads right. `git log` shows the
release. Nothing says "the field is still running the version from last week."

That is not hypothetical. v9.137.0 → v9.140.0 sat unpushed for ten days. The
whole v9.138.0 handoff/ship hardening release never executed once in a real
project, and the audit that ran during that window re-discovered, as live field
defects, two things that were already fixed on disk. A stale marketplace pin is
silent by construction; the only cure is a check that is not.

## The check

```bash
npm run verify:release
```

Two checks, both from `plugins/sdlc-workflow/`:

- **delivered** — fails when a release commit sits ahead of `origin/master`
  longer than the age bound (default 12h — long enough to commit and push in
  one sitting, loud after that). A release commit is one whose subject starts
  with `release(sdlc-workflow):` (the subject `.npmrc` gives `npm version`) or
  with a bare `vX.Y.Z` (npm's default when `.npmrc` is absent). Passing
  `--max-age-hours=0` makes any undelivered release a failure. A missing
  remote-tracking ref is reported, never a hard failure, so a fresh clone or an
  offline box is not blocked.
- **installed** — fails when a host on this machine runs a version behind the
  shipped one (`lib/doctor.mjs`; a host that is not installed is not a gap).
  Blocking off CI, advisory on CI. Pass `--skip-installed` for the check that
  runs right after the push, before the hosts are reinstalled.

## Release sequence

Every step runs from `plugins/sdlc-workflow/`.

1. Prepare the tree. `npm version` refuses a dirty tree, and it commits only
   the carriers it stamps. Commit every change that belongs in the release
   first, staged **explicitly by path** — never `git add -A`, which has swept
   a parallel session's uncommitted work into a release commit. A file another
   session left modified (see `git status`) stays out of every commit. When
   one is present at step 4, run `npm version <level> --force`: the flag
   skips only the clean-tree check, and the bump commit still carries only
   the carriers the `version` script staged.
2. Run the gates on the tree that will ship:
   `npm run build && npm test && npm run verify:versions && npm run verify:neutrality && npm run verify:capabilities && npm run verify:prose && npm run verify`.
   Tests run against source, so green does not mean `dist/` is fresh; any
   commit touching `scripts/`, `hooks/`, `lib/`, `renderers/`, `components/`,
   or `package.json` rebuilds `dist/` **in the same commit**. The build also
   records `rendererBuildId` (sha256 over `renderers/`, `view-src/`,
   `components/`); the render gate keys on it, so a CSS or template change
   re-renders views without a bump, and a prose-only bump re-renders none.
3. Turn the `## [Unreleased]` CHANGELOG heading into `## [X.Y.Z] - <date>` and
   commit that change by path. The bump commit carries no prose.
4. `npm version <patch|minor|major>`. `package.json` is the one source: the
   `version` lifecycle script runs `scripts/stamp-version.mjs` (both plugin
   manifests, the lock file, the `nav.html` brand line, the root marketplace
   pin), rebuilds (`runtime-manifest.json` + `dist/`), runs `verify:versions`,
   and stages each carrier by path. `npm version` then commits with the
   subject `release(sdlc-workflow): vX.Y.Z` (from `.npmrc`) and tags
   `vX.Y.Z`. No carrier is edited by hand; `renderers/_shell.mjs` reads
   `runtimeVersion` from the manifest.
5. **`git push origin master --follow-tags`.**
6. `npm run verify:release -- --skip-installed` — confirm the delivered check
   reports OK.
7. Reinstall the plugin on every host of this machine
   (SINGLE-SOURCE-CUTOVER.md §2), then `npm run verify:release` with no flag —
   confirm both checks report OK. `npm run doctor` shows the same table with
   every row.
