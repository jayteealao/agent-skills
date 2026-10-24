# Release discipline

**A release is not done when the version bumps. It is done when `origin/master` carries it.**

The marketplace resolves this plugin by a pinned commit SHA
(`installed_plugins.json` → `gitCommitSha`) from the GitHub remote. A release
that is committed and not pushed is invisible to every project that installs
the plugin, and the dev tree looks healthy all the same. v9.137.0 to v9.140.0
once sat unpushed for ten days, and an audit found two field defects that were
already fixed on disk.

## The one way to release

Only the release command releases. Do not bump, tag or push a release by hand.

```bash
npm run release <patch|minor|major|next>
```

Run it from `plugins/sdlc-workflow/`. It runs six steps in order and stops at
the first failure. A stopped run keeps its target version in `.release.json`.
When you run the same command again, it resumes at the step that stopped. Each
step checks whether its work is already done, so a second run makes no second
commit, tag or push.

1. **preflight.** HEAD is on `master` and is not behind `origin/master`. The
   paths that the release writes have no uncommitted change. Every gate
   passes: the suite, the generated files, `lint:drift`, `verify:versions`,
   `verify:neutrality`, `verify:surface`, `verify:docs` and
   `verify:legibility`. The last run of `.github/workflows/sdlc-gates.yml` on
   `master` is green (`gh run list`).
2. **prepare.** The `## [Unreleased]` CHANGELOG section becomes
   `## [X.Y.Z] - <date>`. With no Unreleased text, the commit subjects since
   the last tag make the section. `package.json` takes the new version, and
   `scripts/stamp-version.mjs` writes it into every other carrier. The catalog
   line (the top-level `version` of the root `.claude-plugin/marketplace.json`)
   moves: a minor for a minor or a major, a patch for a patch or a next.
   `npm run generate` runs, and `BUILD_SHA` takes the SHA of the commit that
   the release ships. Each plan in `docs/internal/` whose Status line names
   SHIPPED or BUILT at this version or before moves to `docs/internal/archived/`,
   and the links to it and from it are rewritten.
3. **publish.** One commit, `release(sdlc-workflow): vX.Y.Z`, holds those paths
   only. An annotated tag `vX.Y.Z` names it. The command pushes `master` and
   the tag.
4. **delivered.** `origin/master` has the release commit, and the remote has
   the tag.
5. **install.** The command updates the plugin on each host of this machine
   that has it: `claude plugin marketplace update`, `claude plugin update` for
   each scope (a local scope runs from its project folder), and
   `codex plugin marketplace upgrade`. Then doctor must report OK.
6. **report.** When `skills/wf/keys.json` changed since the previous tag, the
   command says so: update the command page.

WARNING: the publish step pushes to the public remote. A pushed release cannot
be taken back. Read the preflight output before you run the command a second
time after a stop.

## Levels and the next channel

| Level | From 9.201.0 | From 10.0.0-next.3 |
|---|---|---|
| `patch` | 9.201.1 | refused |
| `minor` | 9.202.0 | refused |
| `major` | 10.0.0 | 10.0.0 |
| `next` | 10.0.0-next.0 | 10.0.0-next.4 |

Daily work rides `next`: each `npm run release next` ships the next
prerelease of the coming major, on `master`, pinned by its SHA. One
`npm run release major` ships the major from the last next.

## Rules

- `package.json` is the only version carrier. The release writes every other
  carrier from it. Do not edit a carrier by hand.
- Stage by path. Never `git add -A` across the repo: it sweeps a parallel
  session's uncommitted work into your commit. The release commits only the
  paths that it wrote, and a file another session left modified stays out.
- Tags are annotated. `git push --follow-tags` does not push a lightweight tag.
- The hooks and scripts run from the source. There is no build output to
  commit and no dependency to install.

## The check

```bash
npm run verify:release
```

Two checks:

- **delivered**: fails when a release commit sits ahead of `origin/master`
  longer than the age bound (12 hours by default). A release commit is one
  whose subject starts with `release(sdlc-workflow):` or is a bare `vX.Y.Z`.
  `--max-age-hours=0` makes any undelivered release a failure. A missing
  remote-tracking ref is a note, not a failure.
- **installed**: fails when a host on this machine runs a version other than
  the shipped one (`lib/doctor.mjs`; a host that is not installed is not a
  gap). It blocks off CI and is advisory on CI. `--skip-installed` skips it.

`npm run doctor` shows the shipped version, the build id from `BUILD_SHA`, and
each install on this machine.
