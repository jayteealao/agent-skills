# Development rules

This repo is the marketplace of one plugin, `plugins/sdlc-workflow/`. The plugin serves three hosts from one tree: Claude Code, Codex and pi. Several agent sessions often edit this tree at the same time.

## Stage by path

CAUTION: do not run `git add -A`, `git add .` or `git commit -a`. They stage the uncommitted work of other sessions into your commit.

1. Stage each file that you changed by its path: `git add -- <path> <path>`.
2. Before you commit, run `git diff --cached --stat`. Every path must be yours.
3. When a file holds changes of another session, leave it out.

## Test and check

Run these from `plugins/sdlc-workflow/`. The plugin runs from its source with Node 22 and has no dependencies, so there is no build and no `npm install`.

```bash
npm test                  # the core tests: under 30 s, and they must pass
npm run test:integration  # git, CLI and process tests, one file at a time
npm run lint:drift        # forms, links, settings and generated files
npm run verify:docs       # the command page lists every command of keys.json
```

- When you change `skills/wf/keys.json`, run `npm run generate`, and update `docs/commands.html` in the same commit.
- When a test fails at random, delete it. Do not retry it.

## Release

Release only with the release command. Do not bump a version, tag or push a release by hand.

```bash
npm run release <patch|minor|major|next>
```

WARNING: the release command pushes `master` and an annotated tag to the public remote. A pushed release cannot be taken back. Ask the person before you run it.

- `package.json` is the only version carrier. The release writes every other carrier.
- A stopped release resumes when you run the same command again.
- A release is done only when `origin/master` carries it.
- The steps and the levels are in `plugins/sdlc-workflow/docs/internal/RELEASE-DISCIPLINE.md`.

## Worktrees and node_modules

WARNING: do not link `node_modules` into a git worktree with a junction or a symlink. `git worktree remove --force` deletes through the link, into the files of the main checkout.

- When a worktree needs packages, run `npm ci` inside the worktree.
- When a worktree has a link, delete the link before you remove the worktree.

## Public text

This repo is public. Commit messages, PR text, READMEs, code comments and docs describe the product. They do not name internal plan ids or working notes.
