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

Fails when a `release(sdlc-workflow):` commit has been sitting ahead of
`origin/master` longer than the age bound (default 12h — long enough to commit
and push in one sitting, loud after that). Passing `--max-age-hours=0` makes any
undelivered release a failure. A missing remote-tracking ref is reported, never
a hard failure, so a fresh clone or an offline box is not blocked.

## Release sequence

1. Bump the version in **every** location (see the version-bump discipline —
   the `_shell.mjs` `PLUGIN_VERSION` constant is the one that gets forgotten).
2. `npm run build` — any commit touching `scripts/`, `hooks/`, `lib/`,
   `renderers/`, `components/`, or `package.json` rebuilds `dist/` **in the same
   commit**. Tests run against source, so green does not mean `dist/` is fresh.
3. `npm test`.
4. `npm run sync:codex` when anything under `lib/` → `dist/` moved (the shared
   `buildId` must match across both trees).
5. Commit the release. Stage **explicitly by path** — never `git add -A`, which
   has swept a parallel session's uncommitted work into a release commit.
6. **`git push origin master`.**
7. `npm run verify:release` — confirm it reports OK.
