# Ship-plan build — release workflow (`ship-plan/build.md` Step 4)

Load this file from `build.md` Steps 3–16 when audit B, C, E, F, or G is Missing or Non-compliant (or the user selected it). Step 4.

# Step 4 — Implement: release workflow (Audits B + C + E + F + G)

## 4a — Create or patch the release workflow file

**If `plan.release-workflow-file` does not exist** — create it with the full structure below.

**If it exists** — read it; apply only the targeted fixes identified in Audits B, C, E, F, G. Do not touch compliant sections.

Generate the `on:` block from `plan.ci-pipeline.release-trigger`:

```yaml
# tag-on-main:
on:
  push:
    tags: ['v[0-9]*']

# merge-to-main:
on:
  push:
    branches: [<base-branch>]

# manual-dispatch:
on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version to release (e.g. 1.2.3)'
        required: true

# branch-push:
on:
  push:
    branches: ['release/*']
```

Generate the `permissions:` block from `ship-meaning`:

```yaml
# publish (npm, pypi, cargo, maven-central):
permissions:
  contents: write
  id-token: write

# container / deploy:
permissions:
  contents: read
  packages: write

# merge-only:
permissions:
  contents: read
```

## 4b — Job templates

Generate one job per entry in `plan.ci-pipeline.release-jobs[]`, in order, with `needs:` chaining. Match job names to these templates:

**`build` job:**
```yaml
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - <setup action>
      - name: Install dependencies
        run: <install cmd>
      - name: Build
        run: <ecosystem build command>
```

**`test` job:**
```yaml
  test:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - <setup action>
      - name: Install dependencies
        run: <install cmd>
      - name: Test
        run: <ecosystem test command>
```

**`version-bump` job** (when `plan.version-bump-rule` requires an explicit bump step in the release workflow — i.e., not `release-please` or `changesets`, which have their own workflow):
```yaml
  version-bump:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          fetch-depth: 0
      - <setup action>
      - name: Bump version
        run: <plan.version-bump-cmd>
      - name: Commit version bump
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A
          git diff --staged --quiet || git commit -m "chore: bump version"
          git push
```

**`publish` job — generated per `ship-meaning`:**

For `publish` (Node.js / npm):
```yaml
  publish:
    needs: [build, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - name: Install dependencies
        run: npm ci
      - name: Publish
        run: <plan.ci-pipeline.publish-cmd>
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
<for each additional secret in plan.required-secrets[] not already in env:>
          <NAME>: ${{ secrets.<NAME> }}
```

For `publish` (Python / PyPI — OIDC preferred):
```yaml
  publish:
    needs: [build, test]
    runs-on: ubuntu-latest
    environment: pypi
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.x'
      - name: Build distribution
        run: python -m build
      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
<if secrets.PYPI_TOKEN in required-secrets:>
        with:
          password: ${{ secrets.PYPI_TOKEN }}
```

For `publish` (JVM / Maven Central):
```yaml
  publish:
    needs: [build, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'
      - name: Publish
        run: <plan.ci-pipeline.publish-cmd>
        env:
<for each secret in plan.required-secrets[]:>
          <NAME>: ${{ secrets.<NAME> }}
```

For `publish` (container-image):
```yaml
  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: <registry-hostname from plan>/${{ github.repository }}
      - uses: docker/login-action@v3
        with:
          registry: <registry-hostname>
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

For `deploy-rolling` (Kubernetes / Helm) — generate one deploy job per environment in `plan.ship-environments[]`:
```yaml
  deploy-<env-name>:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: <env-name>
<if not first env or auto-promote is false: add `environment.url` and require manual approval via GitHub environment protection rules>
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to <env-name>
        run: <plan.ci-pipeline.publish-cmd>
        env:
<for each secret in plan.required-secrets[]:>
          <NAME>: ${{ secrets.<NAME> }}
```

For `deploy-immutable` (blue-green, Lambda, Fly, etc.):
```yaml
  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: <plan.ship-environments[0].name>
    steps:
      - uses: actions/checkout@v4
      - name: Deploy immutable artifact
        run: <plan.ci-pipeline.publish-cmd>
        env:
<for each secret in plan.required-secrets[]:>
          <NAME>: ${{ secrets.<NAME> }}
```

## 4c — Version-bump-rule workflows (Audit G)

For `release-please`:
Create `.github/workflows/release-please.yml` if absent:
```yaml
name: Release Please

on:
  push:
    branches: [<base-branch>]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          release-type: <derive from ecosystem: node / python / java / rust / simple>
          token: ${{ secrets.GITHUB_TOKEN }}
```

For `changesets`:
Create `.github/workflows/changesets.yml` if absent:
```yaml
name: Changesets Release

on:
  push:
    branches: [<base-branch>]

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - <setup action>
      - name: Install dependencies
        run: <install cmd>
      - name: Create release pull request or publish
        uses: changesets/action@v1
        with:
          publish: <plan.ci-pipeline.publish-cmd>
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
<for each additional secret in plan.required-secrets[]:>
          <NAME>: ${{ secrets.<NAME> }}
```
