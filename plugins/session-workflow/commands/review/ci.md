---
name: review:ci
description: Review CI/CD pipeline for correctness, determinism, security, and performance
usage: /review:ci [SCOPE] [TARGET] [PATHS] [CONTEXT]
arguments:
  - name: SCOPE
    description: 'Review scope: pr (default) | worktree | diff | repo | file'
    required: false
    default: pr
  - name: TARGET
    description: 'Target specifier: PR number, branch name, commit hash, or file path'
    required: false
  - name: PATHS
    description: 'Optional glob patterns to filter files (e.g., ".github/workflows/**", ".gitlab-ci.yml")'
    required: false
  - name: CONTEXT
    description: 'Additional context: CI platform (GitHub Actions/GitLab CI/CircleCI/Jenkins), expected runtime, caching strategy, secrets policy'
    required: false
examples:
  - command: /review:ci pr 123
    description: Review PR #123 for CI/CD issues
  - command: /review:ci worktree ".github/workflows/**"
    description: Review GitHub Actions workflow changes
  - command: /review:ci diff main..feature "CONTEXT: GitHub Actions, target runtime <5min, npm cache, no secrets in PRs from forks"
    description: Review CI diff with performance and security context
---

# CI/CD Pipeline Review

You are a CI reviewer ensuring pipelines are correct, deterministic, safe with secrets, and fast enough for developer velocity.

## Step 0: Infer SESSION_SLUG if Needed

If `SESSION_SLUG` is not provided:
1. Read `.claude/README.md`
2. Extract the **last session** from the table (most recent entry)
3. Use that session's slug as `SESSION_SLUG`

## Step 1: Determine Review Scope

Based on `SCOPE` parameter:

- **`pr`** (default): Review changed CI/CD files in the specified PR
- **`worktree`**: Review uncommitted CI/CD changes
- **`diff`**: Review diff between two refs
- **`file`**: Review specific CI/CD file(s)
- **`repo`**: Review all CI/CD config

If `PATHS` is provided, filter to matching CI/CD files.

## Step 2: Extract CI/CD Code

For each file in scope:

1. **Identify CI/CD-specific config**:
   - GitHub Actions workflows (`.github/workflows/*.yml`)
   - GitLab CI (`.gitlab-ci.yml`)
   - CircleCI (`.circleci/config.yml`)
   - Jenkins (Jenkinsfile)
   - Buildkite (`.buildkite/pipeline.yml`)
   - Travis CI (`.travis.yml`)
   - Azure Pipelines (`azure-pipelines.yml`)

2. **Read full workflow definition** (not just diff)

3. **Check for CI/CD patterns**:
   - Required checks for merge protection
   - Secret handling and exposure
   - Caching strategies
   - Parallelization opportunities
   - Flaky tests and retry logic
   - Deterministic builds

**Critical**: Always read the **complete workflow** to understand full pipeline behavior.

## Step 3: Parse CONTEXT (if provided)

Extract CI/CD requirements from `CONTEXT` parameter:

- **CI platform**: GitHub Actions, GitLab CI, CircleCI, Jenkins
- **Runtime targets**: <5min fast feedback, <30min full suite
- **Caching**: npm, pip, Maven, Docker layers
- **Secrets policy**: Vault, 1Password, no secrets in logs
- **Fork PR security**: Restrict secrets, limit permissions

Example:
```
CONTEXT: GitHub Actions, target <5min for unit tests, npm cache, secrets from 1Password, PRs from forks have read-only access
```

## Step 4: CI/CD Checklist Review

For each workflow, systematically check:

### 4.1 Correctness and Coverage
- [ ] Required checks actually run for changed code?
- [ ] Tests run for all supported platforms/versions?
- [ ] Branch protection rules match CI checks?
- [ ] Critical checks cannot be skipped?
- [ ] Deployment gates properly configured?

**Red flags:**
- Tests marked as optional but should be required
- Workflow only runs on specific paths (misses relevant changes)
- No verification of build artifacts
- Deployment can proceed without tests

**Correctness examples:**
```yaml
# ❌ BAD: Tests don't run on PRs
name: Tests
on:
  push:
    branches: [main]  # ❌ Only runs on main, not PRs

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test

# ✅ GOOD: Tests run on all PRs and pushes
name: Tests
on:
  push:
    branches: [main]
  pull_request:  # ✅ Runs on all PRs

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test

# ❌ BAD: Path filtering misses relevant changes
name: Backend Tests
on:
  pull_request:
    paths:
      - 'backend/**'  # ❌ Doesn't run when package.json changes

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: cd backend && npm test

# ✅ GOOD: Include dependency files
name: Backend Tests
on:
  pull_request:
    paths:
      - 'backend/**'
      - 'package.json'  # ✅ Runs when deps change
      - 'package-lock.json'
      - '.github/workflows/backend-tests.yml'  # ✅ Runs when workflow changes

# ❌ BAD: Tests continue on error
jobs:
  test:
    runs-on: ubuntu-latest
    continue-on-error: true  # ❌ Allows failed tests to pass
    steps:
      - run: npm test

# ✅ GOOD: Fail on test failures
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test  # ✅ Job fails if tests fail

# ❌ BAD: Required check not defined
# Branch protection: Require "lint" to pass
# But workflow is named "linting" (mismatch)

name: linting  # ❌ Doesn't match branch protection
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint

# ✅ GOOD: Match branch protection rules
name: lint  # ✅ Matches branch protection requirement
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint
```

### 4.2 Determinism and Reproducibility
- [ ] Tool versions pinned (not `latest`)?
- [ ] Dependencies locked (package-lock.json, Pipfile.lock)?
- [ ] Actions pinned to commit SHA (not `@main`)?
- [ ] Node/Python/Ruby version specified?
- [ ] Timezone/locale explicitly set if needed?

**Red flags:**
- Using `latest` tags for tools or actions
- No lockfile (npm/pip/bundler)
- Actions pinned to branch (`@main`) instead of SHA
- Tests depend on current time/date without mocking

**Determinism examples:**
```yaml
# ❌ BAD: Unpinned versions
jobs:
  build:
    runs-on: ubuntu-latest  # ❌ Ubuntu version can change
    steps:
      - uses: actions/checkout@v4  # ❌ Tag can be force-pushed
      - uses: actions/setup-node@v4
        with:
          node-version: 'latest'  # ❌ Breaks when Node 23 releases
      - run: npm install  # ❌ No lockfile, can get different versions
      - run: npm test

# ✅ GOOD: Pinned versions
jobs:
  build:
    runs-on: ubuntu-22.04  # ✅ Specific Ubuntu version
    steps:
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # ✅ v4.1.1 pinned to SHA
      - uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8  # ✅ v4.0.2
        with:
          node-version: '20.11.0'  # ✅ Specific Node version
      - run: npm ci  # ✅ Uses package-lock.json (deterministic)
      - run: npm test

# ❌ BAD: Action pinned to branch
- uses: company/custom-action@main  # ❌ main can change

# ✅ GOOD: Action pinned to SHA with comment
- uses: company/custom-action@a1b2c3d4  # v2.1.0

# ❌ BAD: Tests depend on current time
test('creates user with current timestamp', () => {
  const user = createUser();
  expect(user.createdAt).toBe(new Date());  # ❌ Flaky (timing)
});

# ✅ GOOD: Mock time in tests
jest.useFakeTimers();
jest.setSystemTime(new Date('2024-01-15'));

test('creates user with mocked timestamp', () => {
  const user = createUser();
  expect(user.createdAt).toBe(new Date('2024-01-15'));  # ✅ Deterministic
});

# ✅ GOOD: Matrix for multiple versions
jobs:
  test:
    runs-on: ubuntu-22.04
    strategy:
      matrix:
        node-version: ['18.19.0', '20.11.0', '21.6.0']  # ✅ Test all supported versions
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci && npm test
```

### 4.3 Caching Strategy
- [ ] Dependencies cached with correct key?
- [ ] Cache key includes lockfile hash?
- [ ] Build artifacts cached appropriately?
- [ ] Cache not including secrets or tokens?
- [ ] Cache restore key has fallback?

**Red flags:**
- Caching without lockfile in key (stale dependencies)
- Caching node_modules with changing Node version
- Secrets accidentally cached
- No cache fallback (slow on cache miss)

**Caching examples:**
```yaml
# ❌ BAD: Cache key doesn't include lockfile
- uses: actions/cache@v4
  with:
    path: node_modules
    key: ${{ runner.os }}-npm  # ❌ Never invalidates

# When package-lock.json changes, gets stale cache

# ✅ GOOD: Cache key includes lockfile hash
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-npm-${{ hashFiles('**/package-lock.json') }}  # ✅ Invalidates on lockfile change
    restore-keys: |
      ${{ runner.os }}-npm-  # ✅ Fallback to any npm cache

- run: npm ci  # Re-downloads changed deps

# ❌ BAD: Caching node_modules across Node versions
- uses: actions/cache@v4
  with:
    path: node_modules  # ❌ Contains native modules
    key: ${{ hashFiles('package-lock.json') }}  # ❌ Doesn't include Node version

# Node 20 → Node 21: native modules incompatible

# ✅ GOOD: Include Node version in key
- uses: actions/setup-node@v4
  with:
    node-version: '20.11.0'

- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ matrix.node-version }}-npm-${{ hashFiles('**/package-lock.json') }}
    restore-keys: |
      ${{ runner.os }}-node-${{ matrix.node-version }}-npm-

# ❌ BAD: Caching secrets
- run: echo "${{ secrets.API_KEY }}" > .env
- uses: actions/cache@v4
  with:
    path: .env  # ❌ Secrets cached and could leak

# ✅ GOOD: Never cache secrets
- run: echo "${{ secrets.API_KEY }}" > .env
# Don't cache .env file

# ✅ GOOD: Docker layer caching
- uses: docker/build-push-action@v5
  with:
    context: .
    cache-from: type=gha  # ✅ GitHub Actions cache
    cache-to: type=gha,mode=max

# ✅ GOOD: Build artifact caching
- uses: actions/cache@v4
  with:
    path: |
      ~/.gradle/caches
      ~/.gradle/wrapper
    key: ${{ runner.os }}-gradle-${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}
    restore-keys: |
      ${{ runner.os }}-gradle-
```

### 4.4 Secrets Hygiene
- [ ] Secrets not printed to logs?
- [ ] PRs from forks don't have secret access?
- [ ] Secrets masked in outputs?
- [ ] No secrets in environment variables of untrusted code?
- [ ] Secret rotation policy defined?

**Red flags:**
- `echo "${{ secrets.TOKEN }}"` (exposes secret)
- Forks can access secrets via pull_request_target
- Secrets passed to untrusted actions
- Long-lived secrets without rotation

**Secrets examples:**
```yaml
# ❌ BAD: Secret printed to logs
- name: Debug
  run: |
    echo "Token: ${{ secrets.API_TOKEN }}"  # ❌ Appears in logs
    curl -H "Authorization: Bearer ${{ secrets.API_TOKEN }}" https://api.example.com

# ✅ GOOD: Secrets never printed
- name: API Call
  run: curl -H "Authorization: Bearer ${{ secrets.API_TOKEN }}" https://api.example.com
  # ✅ Secret used but not printed

# ❌ BAD: Forks have secret access
on:
  pull_request_target:  # ❌ Runs in context of base repo (has secrets)

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}  # ❌ Checks out fork code with secrets!
      - run: npm run build  # ❌ Fork code can exfiltrate secrets

# ✅ GOOD: Forks don't have secret access
on:
  pull_request:  # ✅ Runs in fork context (no secrets)

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run build  # ✅ No secrets available to fork

# For deployment (main branch only)
  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: deploy.sh  # ✅ Only runs on main, has secrets

# ✅ GOOD: Explicit permissions (least privilege)
name: Deploy
on:
  push:
    branches: [main]

permissions:
  contents: read  # ✅ Explicitly limit permissions
  id-token: write  # ✅ Only for OIDC

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GitHubActions
          aws-region: us-east-1
          # ✅ Uses OIDC (no long-lived secrets)

# ❌ BAD: Passing secrets to untrusted action
- uses: third-party/action@v1  # ❌ Unknown trust level
  with:
    api-token: ${{ secrets.API_TOKEN }}  # ❌ Could exfiltrate

# ✅ GOOD: Only pass secrets to trusted actions
- uses: aws-actions/configure-aws-credentials@v4  # ✅ Official AWS action
  with:
    role-to-assume: ${{ secrets.AWS_ROLE }}

# ✅ GOOD: Masked output
- name: Get Token
  id: token
  run: |
    TOKEN=$(generate-token)
    echo "::add-mask::$TOKEN"  # ✅ Mask secret in logs
    echo "token=$TOKEN" >> $GITHUB_OUTPUT
```

### 4.5 Parallelization and Performance
- [ ] Independent jobs run in parallel?
- [ ] Tests split across multiple runners?
- [ ] Build artifacts shared between jobs?
- [ ] Unnecessary steps removed?
- [ ] Fast feedback loop (critical checks first)?

**Red flags:**
- All tests in single job (slow)
- Jobs run sequentially when they could be parallel
- No early termination on lint/type errors
- Full test suite runs before lint

**Parallelization examples:**
```yaml
# ❌ BAD: Everything sequential
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint  # 2min

  typecheck:
    needs: lint  # ❌ Waits for lint
    runs-on: ubuntu-latest
    steps:
      - run: npm run typecheck  # 1min

  test:
    needs: typecheck  # ❌ Waits for typecheck
    runs-on: ubuntu-latest
    steps:
      - run: npm test  # 10min

# Total time: 13 minutes (sequential)

# ✅ GOOD: Parallel execution
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint  # 2min

  typecheck:
    runs-on: ubuntu-latest  # ✅ Parallel with lint
    steps:
      - run: npm run typecheck  # 1min

  test:
    runs-on: ubuntu-latest  # ✅ Parallel with lint + typecheck
    steps:
      - run: npm test  # 10min

# Total time: 10 minutes (parallel)

# ✅ BETTER: Split tests for faster feedback
jobs:
  quick-checks:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint  # 2min
      - run: npm run typecheck  # 1min
    # Total: 3min

  unit-tests:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        shard: [1, 2, 3, 4]  # ✅ Split tests 4 ways
    steps:
      - run: npm test -- --shard=${{ matrix.shard }}/4  # 2.5min each
    # Total: 2.5min (parallel)

  integration-tests:
    needs: quick-checks  # ✅ Only run if lint/type pass
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:integration  # 5min

# Total time: 3min + 5min = 8min (vs 13min)
# Fast feedback: 3min for lint/type errors

# ✅ GOOD: Artifact sharing between jobs
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
          retention-days: 1

  test-build:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist
      - run: npm run test:build  # ✅ Uses built artifact

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist
      - run: ./deploy.sh  # ✅ Uses same artifact
```

### 4.6 Flakiness and Retries
- [ ] Flaky tests identified and quarantined?
- [ ] Retries only for known-flaky infrastructure issues?
- [ ] Retry logic doesn't hide real failures?
- [ ] Flakiness metrics tracked?

**Red flags:**
- Automatic retry on all test failures (hides bugs)
- No distinction between flaky and broken tests
- Retrying without logging why
- Flaky tests not fixed

**Flakiness examples:**
```yaml
# ❌ BAD: Retry all test failures
- name: Test
  run: npm test
  continue-on-error: true  # ❌ Hides all failures

- name: Retry Test
  if: failure()  # ❌ Retries even if tests are broken
  run: npm test

# ✅ GOOD: Only retry known-flaky infrastructure
- name: Test
  run: npm test
  timeout-minutes: 10

# Don't retry test failures - fix flaky tests instead

# ✅ GOOD: Separate flaky tests
- name: Stable Tests
  run: npm test -- --testPathIgnorePatterns=flaky

- name: Flaky Tests (non-blocking)
  run: npm test -- --testPathPattern=flaky
  continue-on-error: true  # ✅ Don't block on known-flaky

# ✅ GOOD: Retry only infrastructure failures
- name: Deploy
  uses: nick-fields/retry@v2
  with:
    timeout_minutes: 5
    max_attempts: 3
    retry_on: error  # ✅ Retry network/infrastructure issues
    command: |
      curl -f https://api.example.com/deploy || exit 1

# ✅ GOOD: Track flakiness
- name: Test with Retry
  id: test
  run: npm test || echo "FLAKY=true" >> $GITHUB_ENV

- name: Report Flakiness
  if: env.FLAKY == 'true'
  run: |
    curl -X POST https://metrics.example.com/flaky \
      -d '{"workflow":"${{ github.workflow }}","run":"${{ github.run_id }}"}'
```

### 4.7 Feedback Quality
- [ ] Error messages clear and actionable?
- [ ] Failed steps don't bury error in logs?
- [ ] Artifacts captured on failure (logs, screenshots)?
- [ ] Annotations used for inline errors?
- [ ] Links to docs for common failures?

**Red flags:**
- Cryptic error messages
- Important errors buried in verbose logs
- No artifacts on failure
- No inline annotations for lint/test errors

**Feedback examples:**
```yaml
# ❌ BAD: Cryptic failure
- name: Build
  run: make build  # ❌ Fails with generic "make: *** [build] Error 1"

# ✅ GOOD: Clear error messages
- name: Build
  run: |
    if ! make build; then
      echo "::error::Build failed. Check the following:"
      echo "::error::1. Ensure all dependencies are installed (npm ci)"
      echo "::error::2. Verify .env.example is copied to .env"
      echo "::error::3. See build logs above for specific errors"
      exit 1
    fi

# ✅ GOOD: Capture artifacts on failure
- name: E2E Tests
  run: npm run test:e2e

- name: Upload Screenshots on Failure
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: e2e-screenshots
    path: tests/screenshots/
    retention-days: 7

- name: Upload Test Logs
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: test-logs
    path: logs/

# ✅ GOOD: Inline annotations
- name: Lint
  run: |
    npm run lint -- --format json --output-file eslint-results.json || true

- name: Annotate Lint Errors
  if: hashFiles('eslint-results.json') != ''
  uses: ataylorme/eslint-annotate-action@v2
  with:
    report-json: eslint-results.json
    # ✅ Shows errors inline in PR

# ✅ GOOD: Job summary
- name: Test Summary
  if: always()
  run: |
    echo "## Test Results" >> $GITHUB_STEP_SUMMARY
    echo "✅ Passed: 245" >> $GITHUB_STEP_SUMMARY
    echo "❌ Failed: 3" >> $GITHUB_STEP_SUMMARY
    echo "⏭️ Skipped: 12" >> $GITHUB_STEP_SUMMARY
    echo "" >> $GITHUB_STEP_SUMMARY
    echo "[View Full Report](https://example.com/test-report)" >> $GITHUB_STEP_SUMMARY
```

## Step 5: Generate Findings

For each CI/CD issue discovered:

**Finding format:**
```
## CI-{N}: {Short title}
**File**: {file_path}:{line_number}
**Severity**: BLOCKER | HIGH | MED | LOW | NIT
**Confidence**: 95% | 80% | 60%
**Category**: Correctness | Determinism | Caching | Secrets | Performance | Flakiness | Feedback

### Evidence
{Code snippet showing the issue}

### Issue
{Description of CI/CD problem and impact on developers}

### Remediation
{Before and after code with explanation}

### Impact
{Developer velocity impact, security risk, cost}
```

**Severity guidelines:**
- **BLOCKER**: Critical security issue (secrets exposed, fork access)
- **HIGH**: Breaks CI or developer velocity (flaky required checks, slow feedback)
- **MED**: Suboptimal performance (no parallelization, poor caching)
- **LOW**: Minor improvement (better logging, clearer errors)
- **NIT**: Style/formatting

## Step 6: Write Report

Create report at `.claude/<SESSION_SLUG>/reviews/ci_<timestamp>.md`:

```markdown
# CI/CD Pipeline Review Report

**Session**: <SESSION_SLUG>
**Scope**: <SCOPE>
**Target**: <TARGET>
**Date**: <YYYY-MM-DD>
**Reviewer**: Claude (CI/CD Specialist)

## 0) Scope & Pipeline Shape

- **CI Platform**: {GitHub Actions/GitLab CI/etc}
- **Workflows reviewed**: {count}
- **Runtime targets**: {<5min fast feedback, <30min full}
- **Caching**: {npm/pip/Docker/etc}

## 1) CI Issues (ranked by severity)

{List all findings}

## 2) Critical Security Issues

{BLOCKER findings that expose secrets or allow privilege escalation}

## 3) Developer Velocity Impact

{HIGH findings that slow down development}

## 4) Performance Optimizations

{MED findings for faster CI}

## 5) Recommended Actions

### Immediate (Security)
- {Fix secret exposure}

### High Priority (Velocity)
- {Fix flaky required checks}
- {Add parallelization}

### Medium Priority (Performance)
- {Improve caching}
- {Split test jobs}

## 6) CI Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Fast feedback | 8min | <5min | ❌ SLOW |
| Full suite | 25min | <30min | ✅ OK |
| Cache hit rate | 60% | >80% | ⚠️ LOW |
| Flaky tests | 5% | <1% | ❌ HIGH |

## 7) Summary Statistics

- **Total issues**: {count}
- **BLOCKER**: {count} (security)
- **HIGH**: {count} (velocity)
- **MED**: {count} (performance)

---

{Detailed findings}
```

## Step 7: Example Findings

[Include 3-5 detailed examples similar to infra review]

---

**Remember**: CI is the developer feedback loop. Fast, reliable, secure CI enables rapid iteration. Slow, flaky, or insecure CI kills productivity.
