# Ship-plan build — validation checks (`ship-plan/build.md` Step 17)

Load this file from `build.md` Step 17 after all writes. Run every check over each created or patched file and record the results in the compliance artifact.

After all writes, for each `.github/workflows/*.yml` file created or patched:

1. **YAML syntax:** run `python -c "import sys, yaml; yaml.safe_load(open(sys.argv[1]))" <file>`. If it fails: print the error, do NOT revert (show the user the file and the error), set `yaml-syntax: fail` in the compliance artifact.
2. **actionlint:** run `actionlint <file>` if available (`where actionlint` on Windows, `which actionlint` on Unix). If not installed: print *"actionlint not found — skip workflow linting. Install via `brew install actionlint` or `go install github.com/rhysd/actionlint/cmd/actionlint@latest` to validate locally."* Set `actionlint: skipped`.

For each generated **inbound config file**:

3. **JSON files** (`renovate.json`, `dependabot` is YAML, commitlint `.json` variants): parse with `node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" <file>`. **YAML files** (`lefthook.yml`, `.pre-commit-config.yaml`, `dependabot.yml`): `python -c "import sys,yaml; yaml.safe_load(open(sys.argv[1]))" <file>`. On failure: show the file + error, do not revert, set `config-syntax: fail`.

Syntax is table stakes — the audit corpus shows generated pipelines failing on *consistency* and *provisioning*, never syntax. Continue:

4. **Action-input consistency (version literals).** For every created/patched workflow, cross-check every pinned tool/runtime version against the repo's own declaration: `pnpm/action-setup` `version:` vs `package.json` `packageManager` (never pin both — drop the input and let the action read `packageManager`); `setup-node` `node-version:` vs `.nvmrc`/`engines.node` (prefer `node-version-file:`); `setup-java`/gradle vs the wrapper properties; `setup-python` vs `.python-version`/`requires-python`. Any duplicated literal that can drift → fix to reference the repo declaration; if genuinely impossible, record the pair in the compliance artifact. Set `version-consistency: pass | fixed | fail`.

5. **Graph integrity.** Every `needs:` names a job defined in the same workflow; every repo-local reusable-workflow `uses:` path exists on disk; every `secrets.NAME` referenced is in `plan.required-secrets[]` (else it belongs in `secrets-to-set-manually` AND the plan needs amending); every `vars.NAME` gate is listed in `gates-to-activate:`. Set `graph-integrity: pass | fail` with the broken edges named.

6. **Repo-gate conformance.** Run the repo's OWN formatters/linters over every file build wrote — the same gates Step 0 detected (lefthook/husky/pre-commit config, format scripts). A generated workflow that fails the repo's `format --check` goes red on the pipeline's own first run (five generated workflows once failed their repo's `oxfmt --check` at first CI). Fix formatting in place; set `repo-gates: pass | fixed | skipped` (skipped when the repo has no such gates).

7. **Provisioning probe.** For every *gate* the build wired, confirm the infrastructure it references exists: required status contexts → something in this repo's workflows reports that context name; GitHub environments referenced → `gh api repos/<owner>/<repo>/environments/<name>` succeeds; deploy/smoke `needs:` targets → the plan names the target (apps, clusters, registries) as provisioned, or the user confirms it live; secrets → present per `gh secret list` (absence is not a failure — it goes to `secrets-to-set-manually` — but a *gate that hard-fails on the missing secret* is unprovisioned). Anything unconfirmable is **unprovisioned** → scaffold it inert per the design contract (`if: ${{ vars.SDLC_GATE_<NAME> == 'true' }}`) and append `{ gate, blocked-on, activation }` to `gates-to-activate:`. Set `provisioning: pass | scaffolded-inert | fail`.
