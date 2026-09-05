# Ship-plan build — pre-merge workflow (`ship-plan/build.md` Step 3)

Load this file from `build.md` Steps 3–16 when audit A or D is Missing or Non-compliant (or the user selected it). Step 3.

# Step 3 — Implement: pre-merge workflow (Audits A + D)

Skip if both Audit A and Audit D are Compliant.

Select the ecosystem-appropriate setup action and install command:

| Ecosystem | Setup action | Install command |
|---|---|---|
| Node.js | `actions/setup-node@v4` with `node-version: '20'` | `npm ci` |
| Python | `actions/setup-python@v5` with `python-version: '3.x'` | `pip install -r requirements.txt` or `poetry install` or `pip install -e .` |
| JVM | `actions/setup-java@v4` with `distribution: temurin`, `java-version: '17'` | `./gradlew dependencies --no-daemon` |
| Rust | `dtolnay/rust-toolchain@stable` | `cargo fetch` |
| Container / Kubernetes | none (docker buildx) | none |
| Unknown | none | `# TODO: add install step` |

**Derive each check job's `run:` command** from the check name using these conventions:

| Check name | Derived command |
|---|---|
| `build` | Node: `npm run build` / JVM: `./gradlew build` / Python: `python -m build` / Rust: `cargo build` |
| `test` | Node: `npm test` / JVM: `./gradlew test` / Python: `pytest` / Rust: `cargo test` |
| `lint` | Node: `npm run lint` / Python: `ruff check .` / Rust: `cargo clippy` |
| `type-check` | Node: `npm run type-check` or `npx tsc --noEmit` |
| `security-scan` | `gh api ... # TODO: configure security scanner` |
| other | Ask the user: "What command runs `<check-name>`?" |

**If no PR workflow exists** — create `.github/workflows/pr-checks.yml`:

```yaml
name: PR Checks

on:
  pull_request:
    branches: [<base-branch>]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
<for each check in plan.ci-pipeline.pre-merge-checks[]:>
  <check-name>:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - <setup action if ecosystem requires it>
      - name: Install dependencies
        run: <install cmd>
      - name: <check-name>
        run: <derived command>

<if plan.ci-pipeline.publish-dry-run-cmd is non-empty:>
  dry-run:
    needs: [<all check-name job ids>]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - <setup action>
      - name: Install dependencies
        run: <install cmd>
      - name: Publish dry-run
        run: <plan.ci-pipeline.publish-dry-run-cmd>
<if any required-secrets appear in publish-dry-run-cmd:>
        env:
<          <NAME>: ${{ secrets.<NAME> }}>
```

**If a PR workflow exists but is missing jobs** — use Edit to append the missing jobs at the end of the `jobs:` block. Prefix the block with: `# Added by wf ship-plan build — plan v<N>, <YYYY-MM-DD>`.
