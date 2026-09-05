# Ship-plan build — code-quality gates, commit conventions, git hooks, developer-experience files (`ship-plan/build.md` Steps 8–11)

Load this file from `build.md` Steps 3–16 when audit K, L, M, or N is Missing or Non-compliant (or the user selected it). Step 8, 9, 10, or 11. The Idempotency rule for Steps 8–12 is in `build.md`.

# Step 8 — Implement: code-quality CI gates (Audit K)

Skip if the plan has no `code-quality` block or every gate is Compliant.

For each gate (`format-check`, `lint`, `type-check`, `test-coverage`) with a non-empty `cmd`, ensure it runs as a step in the PR workflow (`pr-checks.yml` from Step 3 in [pre-merge.md](pre-merge.md), or the discovered PR workflow). Add a job per gate (or steps within a shared job), using the gate's **literal `cmd` from the plan** — do not re-derive it:

```yaml
# Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>
  <gate-name>:                       # e.g. lint, type-check, format-check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - <ecosystem setup action (the Step 3 table in [pre-merge.md](pre-merge.md))>
      - name: Install dependencies
        run: <install cmd>
      - name: <gate-name>
        run: <plan.code-quality.<gate>.cmd>
```

For `test-coverage` with a `min-percent`, append the threshold to the command if the tool supports it (e.g. `pytest --cov --cov-fail-under=<min-percent>`, `jest --coverage --coverageThreshold=...`); otherwise add a `# TODO: enforce <min-percent>% threshold` comment next to the run step.

# Step 9 — Implement: commit + PR-title convention CI (Audit L)

Skip if `code-quality.commit-convention.spec == none` and `code-quality.pr-title-convention.spec == none`.

## 9a — Commitlint config (when `commit-convention.spec == conventional` and config absent)
Create `commitlint.config.js` (or the path in `commit-convention.config-path`):
```js
// Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>
module.exports = { extends: ['@commitlint/config-conventional'] };
```
Record in the compliance artifact that `@commitlint/config-conventional` + `@commitlint/cli` must be installed (do not run the install).

## 9b — Commitlint CI job (when `ci` ∈ `commit-convention.enforce`)
Add to the PR workflow:
```yaml
# Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>
  commitlint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - <node setup action>
      - run: npm ci
      - name: Lint commit messages
        run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }}
```
(For non-Node ecosystems, prefer the `wagoid/commitlint-github-action@v6` action instead of `npx`.)

## 9c — PR-title lint (when `pr-title-convention.spec == conventional`)
Create `.github/workflows/pr-title.yml` if absent:
```yaml
name: PR Title
on:
  pull_request:
    types: [opened, edited, synchronize]
permissions:
  pull-requests: read
jobs:
  lint-pr-title:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

# Step 10 — Implement: local git hooks (Audit M)

Skip if `local-dx.git-hooks.framework == none` or Compliant.

Generate the framework's config and wire each planned hook from `git-hooks.hooks`. Match the framework:

**husky** (Node): ensure `package.json` `scripts.prepare: "husky"`; create `.husky/<hook>` files, each running the planned commands. Default wiring: `.husky/pre-commit` → `npx lint-staged`; `.husky/commit-msg` → `npx --no -- commitlint --edit "$1"` (only if `commit-convention.spec ≠ none`). Note that `husky` + `lint-staged` must be installed.

**lefthook**: create/extend `lefthook.yml`:
```yaml
# Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>
pre-commit:
  commands:
    lint-staged: { run: <plan pre-commit cmds> }
commit-msg:
  commands:
    commitlint: { run: "npx commitlint --edit {1}" }
```

**pre-commit** (Python-friendly): create `.pre-commit-config.yaml` with repos/hooks matching the planned commands; note `pre-commit install` must be run.

**simple-git-hooks**: add a `simple-git-hooks` block to `package.json` mapping each hook to its command.

If `lint-staged` is referenced and no `lint-staged` config exists, also write a minimal one from the format-check + lint commands in Block H.

**Inert-until-installed guard (applies to Steps 9 + 10).** A generated commit-msg hook or commitlint CI job that calls `commitlint`/`lint-staged` **fails or silently no-ops until the dev-deps are installed and the framework's install step is run**. For every config/hook generated here:
- Add an exact install command to `deps-to-install` in the compliance artifact (e.g. `npm i -D husky lint-staged @commitlint/{cli,config-conventional}`, `pipx install pre-commit`).
- Add the framework install step to the next-steps (`npm run prepare` for husky, `pre-commit install`, `lefthook install`).
- Emit a one-line **warning** in the chat return and the compliance artifact: *"git hooks / commit CI are inert until you run `<install>` + `<framework install>`."* Do not present the hook as working when it isn't yet.

# Step 11 — Implement: developer-experience files (Audit N)

Skip if no `local-dx` block.

- `editorconfig: true` and absent → create a baseline `.editorconfig` (root `[*]` with `charset=utf-8`, `end_of_line=lf`, `insert_final_newline=true`, `trim_trailing_whitespace=true`, `indent_style`/`indent_size` matching the ecosystem).
- For each `runtime-version-files[]` entry that is absent → create it pinned to the version discovered in Step 0 (or a `# TODO: pin version` if unknown).
- `task-runner.kind ≠ none` → create or extend the runner file with each planned target, especially a `setup`/`bootstrap` target running `local-dx.bootstrap-cmd`. Use targeted edits if the file exists.
- `contributing-doc: true` and absent → create a `CONTRIBUTING.md` stub covering: bootstrap command, how to run gates locally (the Block-H commands), commit-convention rules, and the PR process.
